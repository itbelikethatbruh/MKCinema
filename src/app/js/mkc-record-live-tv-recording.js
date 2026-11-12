
'use strict';
/* ---------------- 2.67 Live TV recording ----------------
   Record a live channel (now, for a set time, or a programme from the guide when it starts) or save a catch-up
   programme to a file. Everything happens on the person's own device: MKCinema never relays or stores their TV.
   - Android and Android TV app 1.11.0+: the app records itself (MKAndroid.recStart, RecService.java), in the background,
     from any TV service the person added (plain http:// included). Recordings play from Library › Downloads.
   - Browsers and the computer apps: the page reads the channel itself (its HLS playlist and pieces, or a plain
     MPEG-TS stream) and writes it into this browser's private storage in parts of at most 30 seconds or 64 MB (a closed
     tab loses at most the last part), then saves it as one file when asked. This only works for channels a page may read: https://
     with CORS. The Windows app's local helper (MKDesktop.pass) and the person's own MKCinema server (S.proxy) are
     tried when the channel's server refuses web pages. Where nothing works the sheet says so plainly.
   No re-encoding: the file is the channel's own picture and sound (.ts, or .mp4 for fMP4 channels). */
(() => {
  if (typeof Channels === 'undefined' || typeof playStream !== 'function') return;
  const C = Channels;
  const MAX_H = 8, PART = 64 << 20, PRE = 60e3, POST = 120e3;
  const now = () => Date.now();
  const hm = (t) => new Date(t).toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
  const day = (t) => { const d = new Date(t), t0 = new Date(); t0.setHours(0, 0, 0, 0); const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t0) / 864e5); return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString(appLocale(), { weekday: 'short', day: 'numeric', month: 'short' }); };
  const dur = (ms) => fmtTime(Math.max(0, ms) / 1000);
  const safe = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Recording';
  const ls = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return Array.isArray(v) ? v : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or off */ } } };

  /* ---------- a sleep that keeps time in a background tab (worker timers are not slowed down like the page's) ---------- */
  const Tick = {
    w: null, n: 0, cb: new Map(),
    sleep(ms) {
      if (this.w === null) {
        try {
          const u = URL.createObjectURL(new Blob(['onmessage=function(e){setTimeout(function(){postMessage(e.data.i)},e.data.ms)}'], { type: 'text/javascript' }));
          this.w = new Worker(u); this.w.onmessage = (e) => { const f = this.cb.get(e.data); if (f) { this.cb.delete(e.data); f(); } };
          this.w.onerror = () => { this.w = false; };
        } catch (e) { this.w = false; }
      }
      return new Promise((res) => {
        const i = ++this.n; let done = false; const fin = () => { if (!done) { done = true; this.cb.delete(i); res(); } };
        if (this.w) { this.cb.set(i, fin); try { this.w.postMessage({ i, ms }); } catch (e) { /* timer below */ } }
        setTimeout(fin, ms + (this.w ? 1500 : 0));   // the page's own timer is the safety net
      });
    },
  };

  /* ---------- the person's private browser storage (Origin Private File System), with a memory fallback ---------- */
  const Disk = {
    ok() { try { return !!(navigator.storage && navigator.storage.getDirectory && window.FileSystemFileHandle && 'createWritable' in FileSystemFileHandle.prototype); } catch (e) { return false; } },
    async dir() { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle('mk-recordings', { create: true }); },
    async file(name) { return (await (await this.dir()).getFileHandle(name)).getFile(); },
    async drop(name) { try { await (await this.dir()).removeEntry(name); } catch (e) { /* already gone */ } },
    async left() { try { const e = await navigator.storage.estimate(); return Math.max(0, (e.quota || 0) - (e.usage || 0)); } catch (e) { return Infinity; } },
  };
  const mem = new Map();   // recording id -> [Blob] when the browser has no private file storage (kept until the tab closes)
  class Sink {
    constructor(r) { this.r = r; this.w = null; this.inPart = 0; this.buf = []; this.bufN = 0; }
    async write(u8) {
      const r = this.r;
      if (r.disk) {
        if (this.w && (this.inPart + u8.byteLength > PART || now() - this.at > 30000)) { await this.close(); }
        if (!this.w) {
          const name = `${r.id}-${String(r.parts.length + 1).padStart(3, '0')}`;
          const h = await (await Disk.dir()).getFileHandle(name, { create: true });
          this.w = await h.createWritable(); r.parts.push(name); this.inPart = 0; this.at = now(); Rec.persist(r);
        }
        await this.w.write(u8); this.inPart += u8.byteLength;
      } else {
        const cap = (TOUCH_UI ? 700 : 2048) << 20;
        if (r.bytes + u8.byteLength > cap) { const e = new Error('full'); e.full = true; throw e; }
        this.buf.push(u8); this.bufN += u8.byteLength;
        if (this.bufN > (16 << 20)) this.flushMem();
      }
      r.bytes += u8.byteLength;
    }
    flushMem() { if (!this.bufN) return; const l = mem.get(this.r.id) || []; l.push(new Blob(this.buf)); mem.set(this.r.id, l); this.buf = []; this.bufN = 0; }
    async close() {
      if (this.w) { const w = this.w; this.w = null; try { await w.close(); } catch (e) { /* the part may be lost */ } }
      this.flushMem();
    }
  };

  /* ---------- reading the channel: straight, through the Windows app's helper, or through the person's own server ---------- */
  const Net = {
    passBase: null,
    async pass() {
      if (this.passBase !== null) return this.passBase;
      try { const d = window.MKDesktop; this.passBase = d && d.pass && typeof d.pass.start === 'function' ? String((await d.pass.start()) || '') : ''; } catch (e) { this.passBase = ''; }
      return this.passBase;
    },
    async routes(url, headers) {
      // an address the helper already handed back (its /tv route rewrites a channel's playlist to point at itself)
      if (/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\//.test(url)) return [['local', url]];
      const out = [], blocked = X8.mixedBlocked(url), hd = headers && Object.keys(headers).length;
      if (!blocked && !hd) out.push(['direct', url]);
      // the Windows and Mac apps: the helper's TV route (carries the channel's own headers), then its plain route
      try { const T = window.MkTvPass; if (T && T.want() && (await T.start())) out.push(['tv', T.url(url, hd ? headers : undefined)]); } catch (e) { /* older app */ }
      const p = await this.pass(); if (p) out.push(['pass', `${p}/r?u=${encodeURIComponent(url)}`]);
      if (S.proxy && !X8.mixedBlocked(S.proxy)) out.push(['proxy', proxify(url, hd ? headers : undefined)]);
      if (!blocked && hd) out.push(['direct', url]);
      return out;
    },
    /* one GET; the route that worked first is kept for the rest of the recording */
    async get(r, url, { range, ms = 30000, signal } = {}) {
      const all = await this.routes(url, r.headers);
      const list = r.route ? all.filter(([k]) => k === r.route).concat(all.filter(([k]) => k !== r.route)) : all;
      if (!list.length) { const e = new Error('blocked'); e.blocked = true; throw e; }
      let last;
      for (const [kind, u] of list) {
        const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
        const stop = () => ac.abort(); if (signal) signal.addEventListener('abort', stop, { once: true });
        try {
          const res = await fetch(u, { cache: 'no-store', credentials: 'omit', signal: ac.signal, headers: range ? { Range: range } : undefined });
          clearTimeout(t);
          if (!res.ok && res.status !== 206) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
          if (!r.route) r.route = kind;
          res._ac = ac; return res;
        } catch (e) {
          clearTimeout(t); last = e;
          if (e.status === 404 && kind === 'tv' && !r.route) continue;   // an app from before the TV route
          if (e.status || (signal && signal.aborted)) throw e;   // a real answer from the server, or we stopped
        }
      }
      const e = new Error('unreadable'); e.cors = true; e.cause = last; throw e;
    },
    async bytes(r, url, opt) { const res = await this.get(r, url, opt); return new Uint8Array(await res.arrayBuffer()); },
    async text(r, url) { const res = await this.get(r, url, { ms: 20000 }); return res.text(); },
  };

  /* ---------- HLS ---------- */
  const abs = (u, base) => { try { return new URL(u, base).href; } catch (e) { return u; } };
  const attrs = (s) => { const o = {}; String(s).replace(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g, (m, k, v) => { o[k] = v.replace(/^"|"$/g, ''); return m; }); return o; };
  const M3U8 = {
    parse(text, base) {
      const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map((x) => x.trim());
      if (!lines[0] || !lines[0].startsWith('#EXTM3U')) return null;
      const vars = [];
      for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
        const a = attrs(lines[i].slice(18)); let j = i + 1; while (j < lines.length && (!lines[j] || lines[j].startsWith('#'))) j++;
        if (lines[j]) vars.push({ bw: Number(a.BANDWIDTH) || 0, audio: a.AUDIO || '', url: abs(lines[j], base) });
      }
      if (vars.length) {
        const sepAudio = new Set(lines.filter((l) => l.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/.test(l) && /URI=/.test(l)).map((l) => attrs(l.slice(13))['GROUP-ID']));
        return { master: true, vars, sepAudio };
      }
      const pl = { td: 6, seq: 0, end: false, segs: [] };
      let seq = 0, d = 0, key = null, map = null, br = null, lastEnd = {}, disc = false;
      for (const l of lines) {
        if (l.startsWith('#EXT-X-TARGETDURATION:')) pl.td = Math.max(1, Number(l.slice(22)) || 6);
        else if (l.startsWith('#EXT-X-MEDIA-SEQUENCE:')) seq = pl.seq = Number(l.slice(22)) || 0;
        else if (l.startsWith('#EXT-X-ENDLIST')) pl.end = true;
        else if (l.startsWith('#EXT-X-PLAYLIST-TYPE:VOD')) pl.vod = true;
        else if (l.startsWith('#EXT-X-DISCONTINUITY')) disc = true;
        else if (l.startsWith('#EXTINF:')) d = parseFloat(l.slice(8)) || 0;
        else if (l.startsWith('#EXT-X-KEY:')) { const a = attrs(l.slice(11)); key = !a.METHOD || a.METHOD === 'NONE' ? null : { method: a.METHOD, uri: a.URI ? abs(a.URI, base) : '', iv: a.IV || '' }; }
        else if (l.startsWith('#EXT-X-MAP:')) { const a = attrs(l.slice(11)); map = { uri: abs(a.URI, base), range: a.BYTERANGE || '' }; }
        else if (l.startsWith('#EXT-X-BYTERANGE:')) { const [n, o] = l.slice(17).split('@'); br = { n: Number(n), o: o != null ? Number(o) : null }; }
        else if (l && !l.startsWith('#')) {
          const url = abs(l, base); let range = '';
          if (br) { const off = br.o != null ? br.o : (lastEnd[url] || 0); range = `bytes=${off}-${off + br.n - 1}`; lastEnd[url] = off + br.n; br = null; }
          pl.segs.push({ url, seq, d, key, map, range, disc }); seq++; d = 0; disc = false;
        }
      }
      return pl;
    },
    pick(m) {
      // the best picture that carries its own sound (a channel with separate audio files would record silent)
      const own = m.vars.filter((v) => !v.audio || !m.sepAudio.has(v.audio));
      return (own.length ? own : m.vars).slice().sort((a, b) => b.bw - a.bw)[0];
    },
    ivFor(seg) {
      const iv = new Uint8Array(16);
      if (seg.key.iv) { const h = seg.key.iv.replace(/^0x/i, '').padStart(32, '0'); for (let i = 0; i < 16; i++) iv[i] = parseInt(h.substr(i * 2, 2), 16) || 0; }
      else { let n = seg.seq; for (let i = 15; i >= 12; i--) { iv[i] = n & 255; n = Math.floor(n / 256); } }
      return iv;
    },
  };

  /* ---------- one recording on this page ---------- */
  const kinds = { ts: 'video/mp2t', mp4: 'video/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', mkv: 'video/x-matroska' };
  const extOf = (u8, url) => {
    if (u8 && u8[0] === 0x47) return 'ts';
    if (u8 && u8.length > 8 && String.fromCharCode(u8[4], u8[5], u8[6], u8[7]).match(/ftyp|styp|moof|sidx/)) return 'mp4';
    const m = String(url || '').match(/\.(ts|mp4|m4s|aac|mp3|mkv)(\?|$)/i);
    return m ? (m[1].toLowerCase() === 'm4s' ? 'mp4' : m[1].toLowerCase()) : 'ts';
  };
  class Job {
    constructor(r) { this.r = r; this.sink = new Sink(r); this.ac = new AbortController(); this.keys = new Map(); this.mapUrl = ''; }
    get stopped() { return this.ac.signal.aborted || (this.r.stopAt && now() >= this.r.stopAt); }
    stop(why) { if (why && !this.r.why) this.r.why = why; this.ac.abort(); }
    async put(u8, url) {
      if (!this.r.ext) { this.r.ext = extOf(u8, url); Rec.persist(this.r); }
      await this.sink.write(u8);
      Rec.tick();
    }
    async run() {
      const r = this.r;
      try {
        const first = await Net.get(r, r.url, { ms: 25000, signal: this.ac.signal });
        const rd = first.body && first.body.getReader ? first.body.getReader() : null;
        let head = rd ? await rd.read() : { value: new Uint8Array(await first.arrayBuffer()), done: true };
        const u8 = head.value || new Uint8Array(0);
        const peek = new TextDecoder().decode(u8.subarray(0, 16));
        const ct = String(first.headers.get('content-type') || '').toLowerCase();
        if (peek.startsWith('#EXTM3U') || /mpegurl/.test(ct)) {
          let text = new TextDecoder().decode(u8);
          if (rd && !head.done) { for (;;) { const x = await rd.read(); if (x.done) break; text += new TextDecoder().decode(x.value, { stream: true }); if (text.length > 8e6) break; } }
          await this.hls(text, first.url && !/^http:\/\/127\.0\.0\.1/.test(first.url) && r.route === 'direct' ? first.url : r.url);
        } else await this.raw(first, rd, head);
        r.state = r.why === 'stopped' || !r.why ? 'done' : r.bytes > 0 ? 'done' : 'failed';
      } catch (e) {
        if (e.full) { r.why = TOUCH_UI ? 'this device’s space for recordings is full' : 'the space for recordings is full'; r.state = r.bytes > 0 ? 'done' : 'failed'; }
        else if (this.ac.signal.aborted || (r.stopAt && now() >= r.stopAt)) r.state = r.bytes > 0 ? 'done' : 'failed';
        else { r.why = Rec.reason(e, r.url); r.state = r.bytes > 0 ? 'done' : 'failed'; }
        if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)))) { r.why = 'there is no more room on this device for recordings'; r.state = r.bytes > 0 ? 'done' : 'failed'; }
      }
      await this.sink.close();
      r.ended = now();
      if (!r.bytes) r.state = 'failed';
      Rec.finish(this);
    }
    /* a plain stream (an MPEG-TS channel, or a whole programme file); a live one that drops is joined again */
    async raw(res, rd, head) {
      const r = this.r, finite = r.kind === 'catchup';
      let tries = 0;
      for (;;) {
        if (head && head.value && head.value.byteLength) await this.put(head.value, r.url);
        let idle = 0;
        try {
          while (rd && !(head && head.done)) {
            if (this.stopped) { try { res._ac.abort(); } catch (e) { /* closed */ } return; }
            clearTimeout(idle); idle = setTimeout(() => { try { res._ac.abort(); } catch (e) { /* closed */ } }, 30000);
            const x = await rd.read(); if (x.done) break;
            await this.put(x.value, r.url); tries = 0;
          }
        } catch (e) { if (e.full || e.name === 'QuotaExceededError') throw e; } finally { clearTimeout(idle); }
        if (finite || this.stopped) return;
        if (++tries > 20) { r.why = 'the channel kept dropping'; return; }
        r.gaps = (r.gaps || 0) + 1;
        await Tick.sleep(Math.min(15000, 1000 * tries));
        if (this.stopped) return;
        try { res = await Net.get(r, r.url, { ms: 25000, signal: this.ac.signal }); rd = res.body.getReader(); head = await rd.read(); } catch (e) { if (e.status === 404 || e.status === 403 || e.status === 401) { r.why = `the channel stopped answering (HTTP ${e.status})`; return; } head = null; rd = null; }
      }
    }
    async seg(s) {
      let tries = 0;
      for (;;) {
        try {
          let u8 = await Net.bytes(this.r, s.url, { range: s.range, signal: this.ac.signal });
          if (s.key) u8 = await this.decrypt(u8, s);
          return u8;
        } catch (e) {
          if (this.ac.signal.aborted || e.protected || ++tries >= 3) throw e;
          await Tick.sleep(800 * tries);
        }
      }
    }
    async decrypt(u8, s) {
      if (s.key.method !== 'AES-128' || !(window.crypto && crypto.subtle)) { const e = new Error('protected'); e.protected = true; throw e; }
      let k = this.keys.get(s.key.uri);
      if (!k) { const raw = await Net.bytes(this.r, s.key.uri, { signal: this.ac.signal }); k = await crypto.subtle.importKey('raw', raw, 'AES-CBC', false, ['decrypt']); this.keys.set(s.key.uri, k); }
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: MKBytes.iv(s) }, k, u8));
    }
    async hls(text, base) {
      const r = this.r;
      let pl = M3U8.parse(text, base), mediaUrl = base;
      if (!pl) throw new Error('not a playlist');
      if (pl.master) { const v = M3U8.pick(pl); mediaUrl = v.url; pl = M3U8.parse(await Net.text(r, mediaUrl), mediaUrl); if (!pl || pl.master) throw new Error('not a playlist'); }
      let next = -1, misses = 0, lost = 0;
      for (;;) {
        if (pl.segs.some((s) => s.key && s.key.method !== 'AES-128')) { const e = new Error('protected'); e.protected = true; throw e; }
        const finite = pl.end || pl.vod;
        if (next < 0) next = finite || r.kind === 'catchup' ? (pl.segs[0] ? pl.segs[0].seq : 0) : (pl.segs.length ? pl.segs[Math.max(0, pl.segs.length - 3)].seq : 0);
        const last = pl.segs.length ? pl.segs[pl.segs.length - 1].seq : -1;
        if (last >= 0 && last < next - 50) next = pl.segs[Math.max(0, pl.segs.length - 3)].seq;   // the channel restarted its numbering
        if (pl.segs.length && pl.segs[0].seq > next) { r.gaps = (r.gaps || 0) + 1; next = pl.segs[0].seq; }
        const todo = pl.segs.filter((s) => s.seq >= next);
        const par = finite ? 4 : 1;
        for (let i = 0; i < todo.length; i += par) {
          if (this.stopped) return;
          const group = todo.slice(i, i + par);
          const got = await Promise.all(group.map((s) => this.seg(s).then((u8) => u8, (e) => { if (e.protected || this.ac.signal.aborted) throw e; return e; })));
          for (let k = 0; k < group.length; k++) {
            const s = group[k], u8 = got[k];
            if (u8 instanceof Error) { if (finite) throw u8; r.gaps = (r.gaps || 0) + 1; next = s.seq + 1; continue; }
            if (s.map && s.map.uri !== this.mapUrl) { const init = await Net.bytes(r, s.map.uri, { range: s.map.range ? (() => { const [n, o] = s.map.range.split('@'); return `bytes=${Number(o) || 0}-${(Number(o) || 0) + Number(n) - 1}`; })() : undefined, signal: this.ac.signal }); await this.put(init, s.map.uri); this.mapUrl = s.map.uri; }
            await this.put(u8, s.url); next = s.seq + 1;
          }
        }
        if (finite) return;
        misses = todo.length ? 0 : misses + 1;
        await Tick.sleep(Math.min(pl.td * 1000 * (todo.length ? 1 : 0.5), r.stopAt ? Math.max(500, r.stopAt - now()) : 1e9));
        if (this.stopped) return;
        try { const t = await Net.text(r, mediaUrl); pl = M3U8.parse(t, mediaUrl) || pl; lost = 0; }
        catch (e) { if (this.ac.signal.aborted) return; if (++lost > 12) { r.why = 'the channel stopped answering'; return; } await Tick.sleep(2000); }
        if (misses > 20) { r.why = 'the channel stopped sending new pictures'; return; }
      }
    }
  }
  const MKBytes = { iv: (s) => M3U8.ivFor(s) };

  /* ---------- the recordings: on this page, in the Android app, and the ones planned from the guide ---------- */
  const Rec = {
    jobs: new Map(), K: 'mkc:recs', KP: 'mkc:recPlans',
    nat() { try { return !!(window.MKAndroid && typeof MKAndroid.recStart === 'function'); } catch (e) { return false; } },
    oldApp() { try { return !!(window.MKAndroid && typeof MKAndroid.play === 'function') && !this.nat(); } catch (e) { return false; } },
    list() { return ls.get(this.K, []); },
    persist(r) { const l = this.list().filter((x) => x.id !== r.id); l.unshift({ id: r.id, name: r.name, channel: r.channel, logo: r.logo || '', kind: r.kind, started: r.started, ended: r.ended || 0, bytes: r.bytes, ext: r.ext || '', parts: r.parts || [], disk: !!r.disk, state: r.state, why: r.why || '', gaps: r.gaps || 0 }); ls.set(this.K, l.slice(0, 60)); },
    plans() { return ls.get(this.KP, []).filter((p) => p && p.end > now()); },
    savePlans(l) { ls.set(this.KP, l); this.tick(); },

    reason(e, url) {
      if (e && e.protected) return 'this channel is copy-protected, so it can’t be saved';
      if (e && e.status) return `the channel’s server refused (HTTP ${e.status})`;
      if (e && (e.blocked || e.cors)) return this.blockedWhy(url);
      return 'the channel stopped answering';
    },
    blockedWhy(url) {
      const http = X8.mixedBlocked(url);
      const where = window.MKDesktop ? '' : ' The MKCinema app for Android and Android TV records any channel from your service.';
      return http ? `this channel is sent over plain http://, which a secure web page can’t save.${where}` : `this channel’s server doesn’t let web pages save it.${where}`;
    },

    /* start a recording now: {url, headers, name, channel, logo, kind: 'live'|'catchup', stopAt} */
    async start(o) {
      if (!o || !/^https?:\/\//i.test(String(o.url || ''))) return toast('This channel has no address that can be recorded.', 'err', 5000, 'rec');
      if (this.oldApp()) return toast('Update the MKCinema app to record TV: Settings › About › Check for updates.', 'info', 7000, 'rec');
      const stopAt = o.kind === 'catchup' ? 0 : Math.min(o.stopAt || Infinity, now() + MAX_H * 3600e3);
      if (this.nat()) {
        let id = '';
        try { id = String(MKAndroid.recStart(JSON.stringify({ url: o.url, headers: o.headers || undefined, name: o.name, channel: o.channel, stopAt: isFinite(stopAt) ? stopAt : 0, catchup: o.kind === 'catchup', meta: { key: `rec:${hash(o.url + now())}`, name: o.name, type: 'tv', poster: o.logo || '', year: '' } })) || ''); } catch (e) { id = 'error: ' + e.message; }
        if (!id || /^error/i.test(id)) return toast(`Couldn’t start recording: ${id.replace(/^error:\s*/i, '') || 'the app said no'}`, 'err', 6000, 'rec');
        toast(o.kind === 'catchup' ? `Saving ${o.name}. It’ll be in Library › Downloads.` : `Recording ${o.channel}${isFinite(stopAt) && stopAt ? ` until ${hm(stopAt)}` : ''}. It keeps going in the background.`, 'ok', 5000, 'rec');
        this.tick(); return id;
      }
      if (this.jobs.size >= 3) return toast('Three recordings are already running here. Stop one first.', 'info', 5000, 'rec');
      if ([...this.jobs.values()].some((j) => j.r.url === o.url)) return toast(`${o.channel || o.name} is already recording.`, 'info', 4000, 'rec');
      // a quick check first, so a channel that can't be saved here says so straight away
      const r = { id: `r${now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, url: o.url, headers: o.headers || null, name: safe(o.name || o.channel), channel: o.channel || '', logo: o.logo || '', kind: o.kind || 'live', started: now(), stopAt: isFinite(stopAt) ? stopAt : 0, bytes: 0, parts: [], disk: Disk.ok(), state: 'rec', why: '', ext: '' };
      if (!(await Net.routes(r.url, r.headers)).length) return this.cant(r, this.blockedWhy(r.url));
      if (r.disk && (await Disk.left()) < 600 << 20) return this.cant(r, 'there is less than 600 MB of room left for this browser');
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* optional */ }
      const j = new Job(r); this.jobs.set(r.id, j); this.persist(r);
      toast(r.kind === 'catchup' ? `Saving ${r.name}…` : `Recording ${r.channel || r.name}${r.stopAt ? ` until ${hm(r.stopAt)}` : ''}. Keep MKCinema open; it can sit in the background.`, 'ok', 5500, 'rec');
      this.tick(); j.run();
      return r.id;
    },
    cant(r, why) {
      X8.layer('recNo', { label: 'Can’t record here', icon: 'info', eyebrow: 'Recording' });
      const b = X8.body('recNo');
      b.innerHTML = `<h3 class="x8-h">${esc(r.channel || r.name)} can’t be recorded here</h3><p class="sub">${esc(why.charAt(0).toUpperCase() + why.slice(1))}</p><div class="actions"><button class="btn btn-ghost" type="button" data-nav data-x8close>OK</button></div>`;
      icons(); X8.open('recNo');
    },
    stop(id) {
      const j = this.jobs.get(id);
      if (j) { j.stop('stopped'); return; }
      if (this.nat()) { try { MKAndroid.recStop(String(id)); } catch (e) { /* older app */ } this.tick(); }
    },
    finish(j) {
      const r = j.r; this.jobs.delete(r.id);
      if (r.why === 'stopped') r.why = '';
      this.persist(r); this.tick();
      const dot = (t) => (/[.!?]$/.test(t) ? t : `${t}.`);
      if (r.state === 'done') toast(`${r.name} is recorded${r.why ? ` (it ended early: ${r.why.replace(/[.]$/, '')})` : ''}. Save it from Live TV › Recordings.`, r.why ? 'info' : 'ok', 7000, `recd${r.id}`);
      else toast(dot(`${r.name} wasn’t recorded: ${r.why || 'nothing arrived from the channel'}`), 'err', 8000, `recd${r.id}`);
      if (!this.list().some((x) => x.state === 'rec')) this.paint();
    },
    async blob(x) {
      if (x.disk) return new Blob(await Promise.all(x.parts.map((n) => Disk.file(n))), { type: kinds[x.ext] || 'video/mp2t' });
      const l = mem.get(x.id); return l ? new Blob(l, { type: kinds[x.ext] || 'video/mp2t' }) : null;
    },
    async saveFile(id) {
      const x = this.list().find((y) => y.id === id); if (!x) return;
      let b = null; try { b = await this.blob(x); } catch (e) { b = null; }
      if (!b || !b.size) return toast('That recording is no longer here.', 'err', 5000, 'rec');
      const name = `${safe(x.channel && x.channel !== x.name ? `${x.channel} - ${x.name}` : x.name)} ${new Date(x.started).toISOString().slice(0, 16).replace('T', ' ').replace(':', '.')}.${x.ext || 'ts'}`;
      const u = URL.createObjectURL(b), a = document.createElement('a');
      a.href = u; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 120000);
      toast(`Saving ${name}${x.ext === 'ts' ? '. It plays in VLC.' : ''}`, 'ok', 5000, 'rec');
    },
    async remove(id) {
      const x = this.list().find((y) => y.id === id);
      if (x) { for (const n of x.parts || []) await Disk.drop(n); mem.delete(id); }
      ls.set(this.K, this.list().filter((y) => y.id !== id)); this.paint();
    },
    natList() { if (!this.nat()) return []; try { return JSON.parse(MKAndroid.dlList() || '[]').filter((d) => d && d.rec); } catch (e) { return []; } },

    /* ---------- planned from the guide: start a minute early, stop two minutes late ---------- */
    plan(c, p) {
      const st = C.stream(c);
      const h = st.behaviorHints && st.behaviorHints.proxyHeaders && st.behaviorHints.proxyHeaders.request;
      const l = this.plans();
      if (l.some((x) => x.url === c.url && x.start === p.start)) return toast('That programme is already set to record.', 'info', 4000, 'rec');
      if (!this.nat() && X8.mixedBlocked(c.url) && !window.MKDesktop && !S.proxy) return this.cant({ channel: c.name, name: p.title }, this.blockedWhy(c.url));
      const x = { id: `p${now().toString(36)}`, url: c.url, headers: h && Object.keys(h).length ? h : null, name: p.title, channel: c.name, logo: c.logo || '', start: p.start, end: p.end };
      // the Android app starts it from an alarm, so it records with the app closed too
      if (this.nat() && typeof MKAndroid.recPlan === 'function') { let okN = false; try { okN = !!MKAndroid.recPlan(JSON.stringify(x)); } catch (e) { okN = false; } if (!okN) return toast('The app couldn’t set that recording. Try again.', 'err', 5000, 'rec'); x.nat = true; }
      l.push(x);
      this.savePlans(l);
      toast(`${p.title} will record ${day(p.start).toLowerCase() === 'today' ? 'at' : `${day(p.start)} at`} ${hm(p.start)}.${x.nat ? ' The app starts it even if it’s closed.' : ' Keep MKCinema open in a tab.'}`, 'ok', 6500, 'rec');
      this.loop();
    },
    looping: false,
    async loop() {
      if (this.looping) return; this.looping = true;
      try {
        for (;;) {
          const l = ls.get(this.KP, []), t = now(); let changed = false;
          for (const p of l.slice()) {
            if (p.end + POST <= t) { l.splice(l.indexOf(p), 1); changed = true; if (!p.began) toast(`${p.name} on ${p.channel} wasn’t recorded: MKCinema was closed when it was on.`, 'info', 8000, `recm${p.id}`); continue; }
            if (!p.began && p.start - PRE <= t) { p.began = true; if (p.nat) { changed = true; continue; } changed = true; this.start({ url: p.url, headers: p.headers, name: p.name, channel: p.channel, logo: p.logo, kind: 'live', stopAt: p.end + POST }); }
          }
          const keep = l.filter((p) => !(p.began && p.end + POST <= t));
          if (changed || keep.length !== l.length) ls.set(this.KP, keep);
          if (!keep.some((p) => !p.began)) break;
          await Tick.sleep(15000);
        }
      } finally { this.looping = false; }
    },

    /* ---------- the sheet that starts one ---------- */
    offer(c, prog) {
      if (this.oldApp()) return toast('Update the MKCinema app to record TV: Settings › About › Check for updates.', 'info', 7000, 'rec');
      const d = C.data.get(c.list), t = now();
      const cur = prog && prog.start > t ? null : ((d && d.epg && d.epg.get(C.key(c))) || []).find((p) => p.start <= t && t < p.end);
      X8.layer('recNew', { label: 'Record', icon: 'tv', eyebrow: 'Recording' });
      const b = X8.body('recNew');
      if (prog && prog.start > t) {
        b.innerHTML = `<h3 class="x8-h">${esc(prog.title)}</h3><p class="rec-when">${esc(c.name)} · ${esc(day(prog.start))} ${esc(hm(prog.start))}–${esc(hm(prog.end))}</p>${prog.desc ? `<p class="sub">${esc(prog.desc)}</p>` : ''}
          <p class="tour-note">${this.nat() ? 'The app starts a minute early and stops two minutes late, even if it’s closed then.' :'MKCinema starts a minute early and stops two minutes late. Keep it open in a tab at that time.'}</p>
          <div class="actions"><button class="btn btn-prime" type="button" data-nav id="recPlan"><span class="rec-dot"></span>Record when it starts</button><button class="btn btn-ghost" type="button" data-nav id="recWatch"><i data-lucide="play"></i>Watch ${esc(c.name)} now</button></div>`;
        icons(); X8.open('recNew');
        $('#recPlan').onclick = () => { X8.close('recNew'); this.plan(c, prog); };
        $('#recWatch').onclick = () => { X8.close('recNew'); C.tune(c); };
        return;
      }
      const opts = [];
      if (cur && cur.end - t > 2 * 60e3) opts.push([`p${cur.end}`, `Until ${cur.title.length > 28 ? `${cur.title.slice(0, 27)}…` : cur.title} ends (${hm(cur.end)})`]);
      opts.push(['30', '30 minutes'], ['60', '1 hour'], ['120', '2 hours'], ['0', `Until I stop (up to ${MAX_H} hours)`]);
      let pick = opts[0][0];
      const paint = () => {
        b.innerHTML = `<h3 class="x8-h">Record ${esc(c.name)}</h3>${cur ? `<p class="rec-when">On now: ${esc(cur.title)} · until ${esc(hm(cur.end))}</p>` : ''}
          <div class="segc rec-opts" role="radiogroup" aria-label="How long">${opts.map(([v, tx]) => `<button type="button" data-nav data-rl="${v}" class="${v === pick ? 'on' : ''}" role="radio" aria-checked="${v === pick}">${esc(tx)}</button>`).join('')}</div>
          <p class="tour-note">${this.nat() ? 'Recordings keep going with the app in the background and play from Library › Downloads.' : 'The recording is kept in this browser until you save it as a file from Live TV › Recordings. Keep MKCinema open while it records; a background tab is fine.'}</p>
          <div class="actions"><button class="btn btn-prime" type="button" data-nav id="recGo"><span class="rec-dot"></span>Start recording</button></div>`;
        icons();
        $$('[data-rl]', b).forEach((x) => x.addEventListener('click', () => { pick = x.dataset.rl; paint(); }));
        $('#recGo').onclick = () => {
          const stopAt = pick[0] === 'p' ? Number(pick.slice(1)) + POST : Number(pick) > 0 ? t + Number(pick) * 60e3 : 0;
          const st = C.stream(c), h = st.behaviorHints && st.behaviorHints.proxyHeaders && st.behaviorHints.proxyHeaders.request;
          X8.close('recNew');
          this.start({ url: c.url, headers: h && Object.keys(h).length ? h : null, name: pick[0] === 'p' && cur ? cur.title : `${c.name} ${day(t)} ${hm(t)}`, channel: c.name, logo: c.logo, kind: 'live', stopAt });
        };
      };
      paint(); X8.open('recNew');
    },

    /* ---------- the player's Record button (live channels and catch-up) ---------- */
    cur: null,
    playing(ctx, stream) {
      const btn = $('#pRec'); if (!btn) return;
      const m = ctx && ctx.meta, id = String((m && m.id) || '');
      const live = !!(m && m._iptv && m._iptv.url), cu = /^xtv:[^:]+:c/.test(id);
      this.cur = ctx && stream && (live || cu) ? { ctx, stream, live, cu } : null;
      btn.hidden = !this.cur;
      if (!btn._mk) { btn._mk = true; btn.addEventListener('click', () => this.fromPlayer()); }
      this.paintBtn();
    },
    recUrl(u) { return [...this.jobs.values()].some((j) => j.r.url === u && j.r.state === 'rec') || this.natList().some((d) => d.state === 'running' && d.url === u); },
    paintBtn() {
      const btn = $('#pRec'); if (!btn || !this.cur) return;
      const on = this.recUrl(this.cur.live ? this.cur.ctx.meta._iptv.url : this.cur.stream.url);
      btn.classList.toggle('on', on); btn.title = on ? 'Recording (open Recordings)' : this.cur.cu ? 'Save this programme to a file' : 'Record this channel';
      btn.setAttribute('aria-label', btn.title);
      if (!btn.firstElementChild || !btn.firstElementChild.classList.contains('rec-dot')) btn.innerHTML = '<span class="rec-dot"></span>';
    },
    fromPlayer() {
      const k = this.cur; if (!k) return;
      if (btnOn()) return this.openList();
      if (k.live) return this.offer(k.ctx.meta._iptv);
      const m = k.ctx.meta, h = k.stream.behaviorHints && k.stream.behaviorHints.proxyHeaders && k.stream.behaviorHints.proxyHeaders.request;
      this.start({ url: k.stream.url, headers: h || null, name: m.name, channel: (m.genres || [])[0] || k.stream.name || '', logo: m.logo || m.poster || '', kind: 'catchup' });
    },

    /* ---------- Live TV › Recordings ---------- */
    openList() { X8.layer('recList', { label: 'Recordings', icon: 'tv', eyebrow: 'Live TV', wide: true }); X8.open('recList'); this.paint(true); },
    paint(force) {
      const b = X8.body('recList'), el = $('#recList');
      if (!b || !el || (el.hidden && !force)) return;
      const nat = this.nat(), t = now();
      const runningWeb = [...this.jobs.values()].map((j) => j.r);
      const natAll = this.natList();
      const plans = this.plans();
      const doneWeb = this.list().filter((x) => !this.jobs.has(x.id));
      const row = (logo, title, sub, act, bad) => `<div class="rec-row">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-gone>` : ''}<span class="rec-tx"><b>${esc(title)}</b><small class="${bad ? 'bad' : ''}">${sub}</small></span><span class="rec-act">${act}</span></div>`;
      const btn = (attr, icon, label, prime) => `<button class="btn ${prime ? 'btn-prime' : 'btn-ghost'} btn-sm" type="button" data-nav ${attr}>${icon === 'dot' ? '<span class="rec-dot"></span>' : `<i data-lucide="${icon}"></i>`}${esc(label)}</button>`;
      const live = [
        ...runningWeb.map((r) => row(r.logo, r.channel && r.channel !== r.name ? `${r.name} · ${r.channel}` : r.name, `<span class="rec-dot"></span> ${esc(dur(t - r.started))} · ${esc(fmtBytes(r.bytes) || 'starting')}${r.stopAt ? ` · stops at ${esc(hm(r.stopAt))}` : ''}`, btn(`data-rstop="${esc(r.id)}"`, 'square', 'Stop'))),
        ...natAll.filter((d) => d.state === 'running' || d.state === 'queued').map((d) => row((d.meta || {}).poster, (d.meta || {}).name || d.file, `<span class="rec-dot"></span> ${esc(fmtBytes(d.got) || 'starting')}${d.stopAt ? ` · stops at ${esc(hm(d.stopAt))}` : ''}`, btn(`data-rstop="${esc(d.id)}"`, 'square', 'Stop'))),
      ];
      const soon = plans.map((p) => row(p.logo, p.name, `${esc(p.channel)} · ${esc(day(p.start))} ${esc(hm(p.start))}–${esc(hm(p.end))}${p.began ? ' · recording' : ''}`, p.began ? '' : btn(`data-rplan="${esc(p.id)}"`, 'x', 'Cancel')));
      const saved = nat
        ? natAll.filter((d) => d.state !== 'running' && d.state !== 'queued').map((d) => row((d.meta || {}).poster, (d.meta || {}).name || d.file, d.state === 'done' ? `Recorded · ${esc(fmtBytes(d.size || d.got))}` : `Didn’t finish: ${esc(d.err || 'the recording stopped')}`, `${d.state === 'done' ? btn(`data-rplay="${esc(d.id)}"`, 'play', 'Play', true) : ''}${btn(`data-rdel="${esc(d.id)}"`, 'trash-2', 'Delete')}`, d.state !== 'done'))
        : doneWeb.map((x) => {
          const gone = !x.disk && !mem.has(x.id), lost = x.state === 'rec';   // 'rec' after a reload: the tab closed while it recorded
          const sub = gone ? 'Kept only while that tab was open' : x.state === 'failed' ? `Didn’t record: ${esc(x.why || 'nothing arrived')}` : `${esc(day(x.started))} ${esc(hm(x.started))} · ${esc(fmtBytes(x.bytes))}${x.ended ? ` · ${esc(dur(x.ended - x.started))}` : ''}${lost ? ' · cut short when the tab closed' : x.why ? ` · ended early: ${esc(x.why)}` : ''}`;
          return row(x.logo, x.channel && x.channel !== x.name ? `${x.name} · ${x.channel}` : x.name, sub, `${!gone && x.bytes > 0 ? btn(`data-rsave="${esc(x.id)}"`, 'download', 'Save file', true) : ''}${btn(`data-rdel="${esc(x.id)}"`, 'trash-2', 'Delete')}`, x.state === 'failed' || gone);
        });
      b.innerHTML = `<h3 class="x8-h">Recordings</h3>
        ${live.length ? `<p class="rec-sec">Recording now</p>${live.join('')}` : ''}
        ${soon.length ? `<p class="rec-sec">Coming up</p>${soon.join('')}` : ''}
        ${saved.length ? `<p class="rec-sec">${nat ? 'On this device' : 'In this browser'}</p>${saved.join('')}` : ''}
        ${!live.length && !soon.length && !saved.length ? '<div class="empty" style="margin:12px 0">Nothing recorded yet. Press the red dot while a channel plays, or pick a programme later in the guide.</div>' : ''}
        <p class="tour-note" style="margin-top:14px">${nat ? 'Recordings are saved on this device and play from Library › Downloads too. They are yours: MKCinema never sees or keeps them.' : 'Recordings stay in this browser until you save them as a file (they play in VLC) or delete them. They never leave your device.'}</p>`;
      icons();
      $$('[data-rstop]', b).forEach((x) => x.addEventListener('click', () => { this.stop(x.dataset.rstop); setTimeout(() => this.paint(), 400); }));
      $$('[data-rplan]', b).forEach((x) => x.addEventListener('click', () => { const id = x.dataset.rplan; if (nat) { try { MKAndroid.recUnplan(String(id)); } catch (e) { /* older app */ } } this.savePlans(this.plans().filter((p) => p.id !== id)); this.paint(); }));
      $$('[data-rsave]', b).forEach((x) => x.addEventListener('click', () => this.saveFile(x.dataset.rsave)));
      $$('[data-rplay]', b).forEach((x) => x.addEventListener('click', () => { try { MKAndroid.dlPlay(String(x.dataset.rplay), 0); } catch (e) { /* older app */ } }));
      $$('[data-rdel]', b).forEach((x) => x.addEventListener('click', () => confirmTwice(x, () => { if (nat) { try { MKAndroid.dlRemove(String(x.dataset.rdel)); } catch (e) { /* older app */ } this.paint(); } else this.remove(x.dataset.rdel); })));
    },

    /* ---------- the small "recording" pill, the player button and the open list stay current ---------- */
    pillT: 0,
    tick() {
      if (this.pillT) return;
      this.pillT = setTimeout(() => { this.pillT = 0; this.paintPill(); this.paintBtn(); this.paint(); }, 300);
    },
    paintPill() {
      const webN = this.jobs.size, natN = this.nat() ? this.natList().filter((d) => d.state === 'running').length : 0, n = webN + natN;
      let p = $('#recPill');
      if (!n) { if (p) { p.classList.remove('show'); setTimeout(() => { if (p && !p.classList.contains('show')) p.remove(); }, 300); } return; }
      if (!p) {
        p = document.createElement('button'); p.id = 'recPill'; p.type = 'button'; p.className = 'rec-pill'; p.setAttribute('data-nav', '');
        p.addEventListener('click', () => this.openList()); document.body.appendChild(p);
        requestAnimationFrame(() => p.classList.add('show'));
      } else p.classList.add('show');
      const first = webN ? [...this.jobs.values()][0].r : null;
      p.innerHTML = `<span class="rec-dot"></span><b>${n === 1 ? 'Recording' : `${n} recordings`}</b>${first && n === 1 ? `<small>${esc(dur(now() - first.started))} · ${esc(fmtBytes(first.bytes) || '…')}</small>` : ''}`;
      p.setAttribute('aria-label', `${n === 1 ? 'Recording' : `${n} recordings`}. Open Recordings`);
    },
    clock() {
      // once a second while something records here, slower for the Android app's own recordings
      const go = () => { if (this.jobs.size || (this.nat() && this.natList().some((d) => d.state === 'running'))) this.tick(); setTimeout(go, this.jobs.size ? 1000 : 5000); };
      go();
    },
    init() {
      // a recording this tab was making when it closed: what reached storage is still there to save
      const l = this.list(); let ch = false;
      l.forEach((x) => { if (x.state === 'rec') { x.state = x.bytes > 0 || (x.parts || []).length ? 'done' : 'failed'; x.why = x.why || 'MKCinema was closed while it recorded'; ch = true; } });
      if (ch) ls.set(this.K, l);
      // parts on disk carry their real size
      if (Disk.ok()) this.list().filter((x) => x.disk && x.parts.length).forEach(async (x) => { try { let n = 0; for (const p of x.parts) n += (await Disk.file(p)).size; if (n !== x.bytes) { const all = this.list(); const y = all.find((z) => z.id === x.id); if (y) { y.bytes = n; if (!n) { y.state = 'failed'; y.why = y.why || 'nothing was saved'; } ls.set(this.K, all); this.paint(); } } } catch (e) { /* a part is gone */ } });
      // a planned recording that was under way when the tab closed starts again (the Android app keeps its own going)
      if (!this.nat()) { const pl = ls.get(this.KP, []); pl.forEach((p) => { if (p.began && p.end + POST > now()) p.began = false; }); ls.set(this.KP, pl); }
      if (this.plans().length) this.loop();
      this.clock();
      addEventListener('beforeunload', (e) => { if (this.jobs.size) { e.preventDefault(); e.returnValue = ''; } });
    },
  };
  const btnOn = () => { const b = $('#pRec'); return !!(b && b.classList.contains('on')); };
  window.MkRec = Rec;
  Rec.init();
})();
