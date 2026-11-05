'use strict';
/* =====================================================================
   MKCinema 2.16.0 · anime subtitles, subtitles and chapters read out of MKV files
   - Styled ASS/SSA: libass (JASSUB 1.8.8, self-hosted in vendor/jassub/, loaded only when a styled subtitle is picked)
     draws the subtitle exactly as its author styled it: fonts, colours, positions, signs, karaoke.
   - MKV files: the subtitle tracks, chapters and attached fonts inside the file are read with small HTTP range
     requests (the file's index says where each subtitle line sits), so nothing extra is downloaded but the lines.
   ===================================================================== */

/* ---------------- EBML (Matroska) reading ---------------- */
const Ebml = {
  id(b, p) {
    const x = b[p]; const n = x >= 0x80 ? 1 : x >= 0x40 ? 2 : x >= 0x20 ? 3 : x >= 0x10 ? 4 : 0;
    if (!n || p + n > b.length) return null;
    let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[p + i]; return [v, n];
  },
  size(b, p) {
    if (p >= b.length) return null;
    const x = b[p]; let n = 1, m = 0x80; while (n <= 8 && !(x & m)) { n++; m >>= 1; }
    if (n > 8 || p + n > b.length) return null;
    let v = x & (m - 1), all = v === m - 1;
    for (let i = 1; i < n; i++) { v = v * 256 + b[p + i]; if (b[p + i] !== 255) all = false; }
    return [all ? -1 : v, n];
  },
  head(b, p) {
    const i = this.id(b, p); if (!i) return null; const s = this.size(b, p + i[1]); if (!s) return null;
    return { id: i[0], size: s[0], hlen: i[1] + s[1], start: p, data: p + i[1] + s[1], end: s[0] < 0 ? Infinity : p + i[1] + s[1] + s[0] };
  },
  kids(b, from, to) {
    const out = []; let p = from; to = Math.min(to, b.length);
    while (p < to) { const h = this.head(b, p); if (!h) break; out.push(h); if (h.size < 0) break; p = h.end; }
    return out;
  },
  uint(b, h) { let v = 0; for (let i = 0; i < h.size; i++) v = v * 256 + b[h.data + i]; return v; },
  str(b, h) { return new TextDecoder().decode(b.subarray(h.data, h.data + h.size)).replace(/\0+$/, ''); },
  bytes(b, h) { return b.slice(h.data, h.data + h.size); },
  float(b, h) { const dv = new DataView(b.buffer, b.byteOffset + h.data, h.size); return h.size === 4 ? dv.getFloat32(0) : h.size === 8 ? dv.getFloat64(0) : 0; },
  whole(b, h) { return h.size >= 0 && h.end <= b.length; },
};

/* One Matroska file, read through `read(from, to)` (inclusive byte offsets) */
const Mkv = {
  ID: { EBML: 0x1A45DFA3, SEG: 0x18538067, SEEKHEAD: 0x114D9B74, INFO: 0x1549A966, TRACKS: 0x1654AE6B, CHAPTERS: 0x1043A770, ATTACH: 0x1941A469, CUES: 0x1C53BB6B, CLUSTER: 0x1F43B675 },
  async parse(read) {
    const head = await read(0, 262143);
    const e = Ebml.head(head, 0); if (!e || e.id !== this.ID.EBML) throw new Error('not a Matroska file');
    const seg = Ebml.head(head, e.end); if (!seg || seg.id !== this.ID.SEG) throw new Error('no Matroska segment');
    const S0 = seg.data, top = {}, seek = {};
    for (const h of Ebml.kids(head, S0, head.length)) { if (h.id === this.ID.CLUSTER) break; if (!top[h.id]) top[h.id] = h; }
    const sh = top[this.ID.SEEKHEAD];
    if (sh && Ebml.whole(head, sh)) for (const s of Ebml.kids(head, sh.data, sh.end)) {
      if (s.id !== 0x4DBB) continue; let id = null, pos = null;
      for (const k of Ebml.kids(head, s.data, s.end)) { if (k.id === 0x53AB) id = Ebml.uint(head, k); if (k.id === 0x53AC) pos = Ebml.uint(head, k); }
      if (id != null && pos != null && seek[id] == null) seek[id] = pos;
    }
    // an element is read from the first 256 KB when it is all there, otherwise fetched on its own from the seek index
    const get = async (id, max) => {
      const h = top[id];
      if (h && Ebml.whole(head, h)) return [head, h];
      const abs = h ? h.start : seek[id] != null ? S0 + seek[id] : null; if (abs == null) return null;
      const hb = await read(abs, abs + 15), hh = Ebml.head(hb, 0);
      if (!hh || hh.id !== id || hh.size < 0 || hh.size > max) return null;
      const b = await read(abs, abs + hh.hlen + hh.size - 1); return [b, Ebml.head(b, 0)];
    };
    const f = { S0, scale: 1e6, duration: 0, tracks: [], chapters: [], cues: [], attach: null, seek, top, read };
    const inf = await get(this.ID.INFO, 1e6);
    if (inf) for (const k of Ebml.kids(inf[0], inf[1].data, inf[1].end)) { if (k.id === 0x2AD7B1) f.scale = Ebml.uint(inf[0], k) || 1e6; if (k.id === 0x4489) f.duration = Ebml.float(inf[0], k); }
    const tr = await get(this.ID.TRACKS, 4e6);
    if (tr) for (const te of Ebml.kids(tr[0], tr[1].data, tr[1].end)) if (te.id === 0xAE) f.tracks.push(this.track(tr[0], te));
    const ch = await get(this.ID.CHAPTERS, 2e6).catch(() => null);
    if (ch) f.chapters = this.chapters(ch[0], ch[1], f);
    // the attachments (fonts) are only noted here; they are fetched when a styled track is shown
    const at = top[this.ID.ATTACH] ? top[this.ID.ATTACH].start : seek[this.ID.ATTACH] != null ? S0 + seek[this.ID.ATTACH] : null;
    if (at != null) f.attach = at;
    if (f.tracks.some((t) => t.sub)) {
      const cu = await get(this.ID.CUES, 12e6).catch(() => null);
      if (cu) f.cues = this.cues(cu[0], cu[1], f);
    }
    return f;
  },
  track(b, te) {
    const t = { num: 0, type: 0, codec: '', lang: 'eng', name: '', priv: null, def: true, forced: false, comp: null };
    for (const k of Ebml.kids(b, te.data, te.end)) {
      switch (k.id) {
        case 0xD7: t.num = Ebml.uint(b, k); break;
        case 0x83: t.type = Ebml.uint(b, k); break;
        case 0x86: t.codec = Ebml.str(b, k); break;
        case 0x22B59C: t.lang = Ebml.str(b, k) || 'eng'; break;
        case 0x22B59D: t.ietf = Ebml.str(b, k); break;
        case 0x536E: t.name = Ebml.str(b, k); break;
        case 0x63A2: t.priv = Ebml.bytes(b, k); break;
        case 0x88: t.def = !!Ebml.uint(b, k); break;
        case 0x55AA: t.forced = !!Ebml.uint(b, k); break;
        case 0x6D80: // ContentEncodings › ContentEncoding › ContentCompression (encrypted tracks are skipped)
          for (const ce of Ebml.kids(b, k.data, k.end)) for (const c of Ebml.kids(b, ce.data, ce.end)) {
            if (c.id === 0x5035) t.encrypted = true;
            if (c.id === 0x5034) { t.comp = { algo: 0, set: null }; for (const x of Ebml.kids(b, c.data, c.end)) { if (x.id === 0x4254) t.comp.algo = Ebml.uint(b, x); if (x.id === 0x4255) t.comp.set = Ebml.bytes(b, x); } }
          }
          break;
        default:
      }
    }
    t.ass = /^S_TEXT\/(ASS|SSA)$|^S_(ASS|SSA)$/.test(t.codec);
    t.text = /^S_TEXT\/(UTF8|ASCII|WEBVTT)$|^D_WEBVTT/.test(t.codec);
    t.sub = t.type === 17 && (t.ass || t.text) && !t.encrypted;
    if (t.ietf && !t.lang) t.lang = t.ietf;
    return t;
  },
  chapters(b, h, f) {
    const eds = Ebml.kids(b, h.data, h.end).filter((x) => x.id === 0x45B9); if (!eds.length) return [];
    // the default edition, else the first one that is not hidden
    const pick = eds.find((ed) => Ebml.kids(b, ed.data, ed.end).some((k) => k.id === 0x45DB && Ebml.uint(b, k))) || eds.find((ed) => !Ebml.kids(b, ed.data, ed.end).some((k) => k.id === 0x45BD && Ebml.uint(b, k))) || eds[0];
    const out = [];
    for (const a of Ebml.kids(b, pick.data, pick.end)) {
      if (a.id !== 0xB6) continue; const c = { s: 0, e: null, name: '', hidden: false };
      for (const k of Ebml.kids(b, a.data, a.end)) {
        if (k.id === 0x91) c.s = Ebml.uint(b, k) / 1e9;
        if (k.id === 0x92) c.e = Ebml.uint(b, k) / 1e9;
        if (k.id === 0x98) c.hidden = !!Ebml.uint(b, k);
        if (k.id === 0x80 && !c.name) for (const d of Ebml.kids(b, k.data, k.end)) if (d.id === 0x85) c.name = Ebml.str(b, d);
      }
      if (!c.hidden) out.push(c);
    }
    out.sort((x, y) => x.s - y.s);
    out.forEach((c, i) => { if (c.e == null || c.e <= c.s) c.e = out[i + 1] ? out[i + 1].s : f.duration * f.scale / 1e9 || c.s + 90; });
    return out;
  },
  cues(b, h, f) {
    const subs = new Set(f.tracks.filter((t) => t.sub).map((t) => t.num)), out = [];
    for (const cp of Ebml.kids(b, h.data, h.end)) {
      if (cp.id !== 0xBB) continue; let time = 0; const pos = [];
      for (const k of Ebml.kids(b, cp.data, cp.end)) {
        if (k.id === 0xB3) time = Ebml.uint(b, k);
        if (k.id === 0xB7) {
          const p = { track: 0, cl: 0, rel: -1, dur: 0 };
          for (const x of Ebml.kids(b, k.data, k.end)) { if (x.id === 0xF7) p.track = Ebml.uint(b, x); if (x.id === 0xF1) p.cl = Ebml.uint(b, x); if (x.id === 0xF0) p.rel = Ebml.uint(b, x); if (x.id === 0xB2) p.dur = Ebml.uint(b, x); }
          if (subs.has(p.track) && p.rel >= 0) pos.push(p);
        }
      }
      for (const p of pos) out.push({ track: p.track, t: time * f.scale / 1e9, d: p.dur * f.scale / 1e9, cl: p.cl, rel: p.rel });
    }
    return out;
  },
  /* the block a cue points at. The cluster's header length is unknown (its size field is 1 to 8 bytes long), so the
     few possible starts are tried and the one that holds a block of this track wins. */
  findBlock(buf, base, track) {
    for (let k = 0; k < 8; k++) {
      const p = base + k; const x = buf[p]; if (x !== 0xA0 && x !== 0xA3) continue;
      const h = Ebml.head(buf, p); if (!h || h.size < 4 || h.size > 4e6) continue;
      let blk = null, dur = null;
      if (h.id === 0xA3) blk = { data: h.data, end: h.end };
      else for (const c of Ebml.kids(buf, h.data, Math.min(h.end, buf.length))) { if (c.id === 0xA1) blk = { data: c.data, end: c.end }; if (c.id === 0x9B && c.end <= buf.length) dur = Ebml.uint(buf, c); }
      if (!blk) continue;
      const tv = Ebml.size(buf, blk.data); if (!tv || tv[0] !== track) continue;
      return { start: p, end: h.end, data: blk.data + tv[1] + 3, dataEnd: blk.end, lacing: (buf[blk.data + tv[1] + 2] & 0x06) !== 0, dur };
    }
    return null;
  },
  async decode(t, bytes) {
    if (!t.comp) return bytes;
    if (t.comp.algo === 3) { const out = new Uint8Array((t.comp.set || []).length + bytes.length); out.set(t.comp.set || []); out.set(bytes, (t.comp.set || []).length); return out; }
    if (t.comp.algo === 0 && typeof DecompressionStream !== 'undefined') return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    throw new Error('compressed subtitles this browser cannot unpack');
  },
};

/* ---------------- libass renderer (JASSUB) ---------------- */
const AssR = {
  base: () => new URL('vendor/jassub/', location.href).href,
  inst: null, libP: null, tok: 0,
  enabled() { return CFG.assMode !== 'off' && typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined' && /^https?:$/.test(location.protocol); },
  lib() {
    if (window.JASSUB) return Promise.resolve(window.JASSUB);
    return this.libP || (this.libP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = `${this.base()}jassub.umd.js`; s.async = true;
      s.onload = () => (window.JASSUB ? res(window.JASSUB) : rej(new Error('renderer missing')));
      s.onerror = () => { this.libP = null; s.remove(); rej(new Error('the styled subtitle renderer did not load')); };
      document.head.appendChild(s);
    }));
  },
  isAss: (text) => /^\s*\[Script Info\]/i.test(String(text).replace(/^﻿/, '')) || (/\[Events\]/i.test(text) && /^Dialogue:/im.test(text)),
  async start(text) {
    this.stop(); const tok = this.tok;
    const J = await this.lib(); if (tok !== this.tok || $('#player').hidden) return null;
    const b = this.base(), lite = CFG.assMode === 'lite' || (CFG.assMode !== 'full' && IS_TV);
    try {
      this.inst = new J({
        video, subContent: text, workerUrl: `${b}jassub-worker.js`, wasmUrl: `${b}jassub-worker.wasm`, modernWasmUrl: `${b}jassub-worker-modern.wasm`,
        availableFonts: { 'liberation sans': `${b}default.woff2` }, fallbackFont: 'liberation sans', timeOffset: -(P.subDelay || 0),
        dropAllBlur: lite, prescaleFactor: lite ? 0.8 : 1, maxRenderHeight: lite ? 720 : IS_TV ? 1080 : 0, libassMemoryLimit: lite ? 48 : 96, libassGlyphLimit: lite ? 24 : 48,
      });
      this.inst.addEventListener && this.inst.addEventListener('error', (e) => MKLog.add('error', `libass: ${(e && e.error && e.error.message) || 'worker error'}`));
    } catch (e) { this.inst = null; throw e; }
    document.body.classList.add('ass-on');
    return this.inst;
  },
  set(text) { if (this.inst) try { this.inst.setTrack(text); } catch (e) { /* worker gone */ } },
  font(bytes) { if (this.inst) try { this.inst.addFont(bytes); } catch (e) { /* worker gone */ } },
  delay(d) { if (this.inst) { this.inst.timeOffset = -d; try { this.inst.setCurrentTime(video.paused, video.currentTime + this.inst.timeOffset); } catch (e) { /* older build */ } } },
  stop() {
    this.tok++; document.body.classList.remove('ass-on');
    if (this.inst) { try { this.inst.destroy(); } catch (e) { /* already gone */ } this.inst = null; }
    $$('#stage .JASSUB, #player .JASSUB').forEach((d) => d.remove());
  },
  on() { return !!this.inst; },
};

/* ---------------- Subtitles inside MKV files ---------------- */
const MkvSubs = {
  tok: 0, file: null, probed: null, ctl: null, localFile: null, src: null,
  isMkv(stream) {
    if (!stream || !stream.url || stream.ytId || P.hls || CFG.mkvSubs === false) return false;
    const bh = stream.behaviorHints || {}, fn = String(bh.filename || '');
    if (stream._local) return /\.(mkv|webm|mka)$/i.test(fn);
    return !!(stream._tel && stream._tel.mkv) || /\.mkv(\?|#|$)/i.test(stream.url) || /\.mkv$/i.test(fn) || /\bmkv\b/i.test(`${stream.title || ''} ${stream.name || ''}`);
  },
  /* where byte ranges come from: the file itself, the stream link, or your MKCinema proxy when the host blocks browsers */
  async reader(stream) {
    if (stream._local && this.localFile) { const f = this.localFile; return async (a, b) => new Uint8Array(await f.slice(a, b + 1).arrayBuffer()); }
    const bh = stream.behaviorHints || {}, headers = bh.proxyHeaders && bh.proxyHeaders.request;
    const range = async (url, a, b) => {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` }, signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (r.status !== 206) { try { ctl.abort(); } catch (e) { /* ignore */ } throw new Error(r.status === 200 ? 'the host ignores byte ranges' : `HTTP ${r.status}`); }
        const buf = new Uint8Array(await r.arrayBuffer()); return buf.length > b - a + 1 ? buf.subarray(0, b - a + 1) : buf;
      } finally { clearTimeout(t); }
    };
    const urls = [];
    if (!bh.proxyHeaders && !CFG.alwaysProxy) urls.push(stream.url);
    if (S.proxy && (bh.proxyHeaders || CFG.alwaysProxy || await proxyOnline())) urls.push(proxify(stream.url, headers || {}));
    for (const u of urls) {
      try { await range(u, 0, 3); this.src = u === stream.url ? 'direct' : 'proxy'; return (a, b) => range(u, a, b); }
      catch (e) { MKLog.add('info', `MKV ranges ${u === stream.url ? 'direct' : 'via proxy'}: ${e.message}`); }
    }
    return null;
  },
  async probe(stream) {
    if (!this.isMkv(stream) || this.probed === stream) return;
    this.probed = stream; const tok = ++this.tok; this.file = null;
    try {
      const read = await this.reader(stream); if (!read || tok !== this.tok) return;
      const f = await Mkv.parse(read); if (tok !== this.tok || P.stream !== stream) return;
      this.file = f; f.stream = stream;
      const subs = f.tracks.filter((t) => t.sub);
      MKLog.add('info', `MKV: ${f.tracks.length} tracks, ${subs.length} text subtitle tracks (${subs.map((t) => t.codec.replace('S_TEXT/', '')).join(', ') || 'none'}), ${f.cues.length} subtitle index entries, ${f.chapters.length} chapters, read ${this.src}`);
      if (f.chapters.length) Marks.fromChapters(f.chapters);
      if (!subs.length) return;
      P.subs = P.subs.filter((s) => s.kind !== 'mkv');
      subs.forEach((t) => P.subs.push({ kind: 'mkv', lang: t.lang, _mkv: t, _label: `${t.name || langName(t.lang)}${t.forced ? ' (forced)' : ''} · in file${t.ass ? ' · styled' : ''}` }));
      renderSubMenu(); this.autoPick();
    } catch (e) { MKLog.add('info', `MKV read stopped: ${e.message}`); }
  },
  /* the file's own subtitles are timed to this exact release, so they win over a downloaded one of the same language */
  autoPick() {
    if (!CFG.subAuto || P.subUserChoice || !CFG.subLang || CFG.subLang === 'off') return;
    const cur = P.subs[P.curSub]; if (cur && cur.kind === 'mkv') return;
    const want = langName(CFG.subLang);
    const c = P.subs.map((s, i) => [s, i]).filter(([s]) => s.kind === 'mkv' && langName(s.lang) === want && !s._mkv.forced);
    c.sort((a, b) => (/sign|song/i.test(a[0]._mkv.name) - /sign|song/i.test(b[0]._mkv.name)) || (b[0]._mkv.def - a[0]._mkv.def) || (b[0]._mkv.ass - a[0]._mkv.ass));
    if (c.length) selectSub(c[0][1], { auto: true });
  },
  stop() { if (this.ctl) { this.ctl.abort(); this.ctl = null; } },
  tt: new Map(),
  textTrack(t) {
    const k = `${this.file && this.file.stream && this.file.stream.url}|${t.num}`; let tt = this.tt.get(k);
    if (!tt) { tt = video.addTextTrack('subtitles', t.name || langName(t.lang), String(t.lang || 'und').slice(0, 3)); tt._mkc = true; tt._key = k; this.tt.set(k, tt); }
    return tt;
  },
  async show(s) {
    const f = this.file, t = s._mkv; if (!f || !t) return;
    this.stop(); const ctl = this.ctl = new AbortController();
    const list = f.cues.filter((c) => c.track === t.num);
    if (!list.length) { toast('This file has no subtitle index, so its subtitles can only be read by VLC or mpv. Try a downloaded subtitle instead.', 'err', 7000, 'mkvsub'); P.curSub = -1; renderSubMenu(); return; }
    t.lines = t.lines || new Map();
    let tt = null, push;
    if (t.ass && AssR.enabled()) {
      const head = this.assHead(t);
      const build = () => head + Array.from(t.lines.values()).sort((a, b) => a.o - b.o).map((x) => x.line).join('\n') + '\n';
      try { await AssR.start(build()); } catch (e) { MKLog.add('error', `libass start: ${e.message}`); }
      if (ctl.signal.aborted) return;
      if (AssR.on()) {
        let tmr = 0; push = () => { if (!tmr) tmr = setTimeout(() => { tmr = 0; if (!ctl.signal.aborted) AssR.set(build()); }, 900); };
        this.fonts(f, ctl).catch((e) => MKLog.add('info', `MKV fonts: ${e.message}`));
      }
    }
    if (!push) {
      tt = this.textTrack(t); tt.mode = 'showing';
      const have = new Set(Array.from(tt.cues || []).map((c) => c._k));
      const add = (x, k) => {
        if (have.has(k)) return; have.add(k);
        const c = new VTTCue(Math.max(0, x.s + (P.subDelay || 0)), Math.max(0, x.e + (P.subDelay || 0)), x.text); c._s = x.s; c._e = x.e; c._k = k;
        try { c.line = { bottom: 'auto', higher: -4, top: 1 }[CFG.subPos]; } catch (e) { /* read-only */ }
        try { tt.addCue(c); } catch (e) { /* bad cue */ }
      };
      t.lines.forEach((x, k) => add(x, k));
      push = (x, k) => add(x, k);
    }
    // fetch the lines nearest the playhead first; a seek re-orders what is left
    const pending = list.filter((c) => !t.lines.has(`${c.cl}:${c.rel}`));
    const jobs = []; const byCl = new Map();
    for (const c of pending) { if (!byCl.has(c.cl)) byCl.set(c.cl, []); byCl.get(c.cl).push(c); }
    for (const [cl, cs] of byCl) {
      cs.sort((a, b) => a.rel - b.rel); let cur = null;
      for (const c of cs) { if (cur && c.rel - cur.to < 256 * 1024) { cur.cues.push(c); cur.to = c.rel; } else { cur = { cl, from: c.rel, to: c.rel, cues: [c], t: c.t }; jobs.push(cur); } }
    }
    const next = () => {
      const now = video.currentTime || 0; let best = -1, bd = Infinity;
      jobs.forEach((j, i) => { if (j.done) return; const d = j.t >= now - 4 ? j.t - now : (now - j.t) * 4 + 60; if (d < bd) { bd = d; best = i; } });
      if (best < 0) return null; jobs[best].done = true; return jobs[best];
    };
    let errors = 0;
    const worker = async () => {
      for (let j = next(); j && !ctl.signal.aborted; j = next()) {
        const abs = f.S0 + j.cl;
        try {
          const buf = await f.read(abs + 5 + j.from, abs + 12 + j.to + 4095);
          for (const c of j.cues) {
            let base = c.rel - j.from, blk = Mkv.findBlock(buf, base, c.track);
            let b2 = buf;
            if (blk && blk.dataEnd > buf.length) { b2 = await f.read(abs + 5 + c.rel + (blk.start - base), abs + 5 + c.rel + (blk.start - base) + (blk.end - blk.start) + 7); blk = Mkv.findBlock(b2, 0, c.track); }
            if (!blk || blk.lacing) continue;
            const raw = await Mkv.decode(t, b2.subarray(blk.data, blk.dataEnd));
            const text = new TextDecoder().decode(raw).replace(/\0+$/, '');
            const dur = blk.dur != null ? blk.dur * f.scale / 1e9 : c.d || 3;
            const k = `${c.cl}:${c.rel}`, x = t.ass ? this.assLine(text, c.t, c.t + dur) : { s: c.t, e: c.t + dur, text: this.plain(text, t) };
            if (!x) continue;
            t.lines.set(k, x); if (!ctl.signal.aborted) push(x, k);
          }
        } catch (e) {
          if (ctl.signal.aborted) return;
          if (++errors === 6) { MKLog.add('error', `MKV subtitle lines: ${e.message}`); toast('Some subtitle lines could not be read from this file', 'err', 5000, 'mkvsub'); }
          if (errors > 40) return;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (!ctl.signal.aborted) MKLog.add('info', `MKV track ${t.num}: ${t.lines.size} of ${list.length} lines read`);
  },
  assHead(t) {
    let h = t.priv ? new TextDecoder().decode(t.priv).replace(/\0+$/, '') : '[Script Info]\nScriptType: v4.00+\n';
    if (!/\[Events\]/i.test(h)) h = `${h.trimEnd()}\n\n[Events]\n`;
    if (!/\[Events\][\s\S]*^Format:/im.test(h)) h = `${h.trimEnd()}\nFormat: ${/^S_TEXT\/SSA$/.test(t.codec) ? 'Marked' : 'Layer'}, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
    return `${h.trimEnd()}\n`;
  },
  // a Matroska ASS block is "ReadOrder,Layer,Style,Name,MarginL,MarginR,MarginV,Effect,Text"
  assLine(text, s, e) {
    const p = []; let rest = text;
    for (let i = 0; i < 8; i++) { const c = rest.indexOf(','); if (c < 0) return null; p.push(rest.slice(0, c)); rest = rest.slice(c + 1); }
    const ts = (v) => { v = Math.max(0, v); const h = Math.floor(v / 3600), m = Math.floor(v % 3600 / 60), sec = v % 60; return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`; };
    return { o: Number(p[0]) || 0, s, e, line: `Dialogue: ${p[1]},${ts(s)},${ts(e)},${p.slice(2, 8).join(',')},${rest.replace(/\r?\n/g, '\\N')}` };
  },
  plain(text, t) {
    if (t.ass) { const p = text.split(','); return p.slice(8).join(',').replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').replace(/\\h/g, ' ').trim(); }
    return text.replace(/<(?!\/?(b|i|u)>)[^>]+>/gi, '').trim();
  },
  /* fonts attached to the file (anime releases ship the fonts their signs and songs use) */
  async fonts(f, ctl) {
    if (f.fontsDone) { f.fontsDone.forEach((x) => AssR.font(x)); return; }
    if (f.attach == null) return;
    const hb = await f.read(f.attach, f.attach + 15), h = Ebml.head(hb, 0);
    if (!h || h.id !== Mkv.ID.ATTACH || h.size < 0) return;
    if (h.size > 40e6) { MKLog.add('info', `MKV fonts skipped (${Math.round(h.size / 1e6)} MB attached)`); return; }
    const b = await f.read(f.attach, f.attach + h.hlen + h.size - 1); if (ctl.signal.aborted) return;
    const root = Ebml.head(b, 0), out = [];
    for (const af of Ebml.kids(b, root.data, root.end)) {
      if (af.id !== 0x61A7) continue; let name = '', mime = '', data = null;
      for (const k of Ebml.kids(b, af.data, af.end)) { if (k.id === 0x466E) name = Ebml.str(b, k); if (k.id === 0x4660) mime = Ebml.str(b, k); if (k.id === 0x465C) data = b.subarray(k.data, k.end); }
      if (data && (/font|truetype|opentype|sfnt/i.test(mime) || /\.(ttf|otf|ttc|woff2?)$/i.test(name))) out.push(data.slice());
    }
    f.fontsDone = out;
    if (!ctl.signal.aborted) { out.forEach((x) => AssR.font(x)); MKLog.add('info', `MKV fonts: ${out.length} loaded`); }
  },
};

/* ---------------- Player hooks ---------------- */
{
  const sel0 = selectSub;
  selectSub = async function (i, opts = {}) {
    const s = i >= 0 ? P.subs[i] : null;
    AssR.stop(); MkvSubs.stop();
    if (s && s.kind === 'mkv') {
      clearSubTracks(); P.subPick = (P.subPick || 0) + 1; P.curSub = i; renderSubMenu();
      MkvSubs.show(s).catch((e) => MKLog.add('error', `MKV subtitles: ${e.message}`));
      if (!opts.auto) toast(`Subtitles: ${subLabel(s)}`, 'ok'); else toast(`${langName(s.lang)} subtitles on, from the file`, 'info', 2400, 'subs');
      return;
    }
    if (s && (s.kind === 'url' || s.kind === 'file') && AssR.enabled()) {
      const pick = P.subPick = (P.subPick || 0) + 1;
      try {
        if (s.text == null) { const r = await fetch(s.url); if (!r.ok) throw new Error(`HTTP ${r.status}`); s.text = await r.text(); }
      } catch (e) { return sel0.apply(this, arguments); }
      if (pick !== P.subPick) return;
      if (AssR.isAss(s.text)) {
        clearSubTracks(); P.curSub = i; renderSubMenu();
        try {
          await AssR.start(s.text);
          if (!opts.auto) toast(`Subtitles: ${subLabel(s)} · styled`, 'ok'); else toast(`${langName(s.lang)} subtitles on`, 'info', 2400, 'subs');
          return;
        } catch (e) { MKLog.add('error', `libass: ${e.message}`); toast('Styled subtitles could not start here, so they show as plain text', 'info', 4000); return sel0.apply(this, arguments); }
      }
    }
    return sel0.apply(this, arguments);
  };
  const clr = clearSubTracks;
  clearSubTracks = function () { AssR.stop(); MkvSubs.stop(); return clr.apply(this, arguments); };
  const sd = setSubDelay;
  setSubDelay = function (v) { const r = sd.apply(this, arguments); AssR.delay(P.subDelay); return r; };
  const td = teardown;
  teardown = function () { AssR.stop(); MkvSubs.stop(); MkvSubs.tok++; MkvSubs.probed = null; MkvSubs.file = null; return td.apply(this, arguments); };
  const pl = playLocal;
  playLocal = function (file) { MkvSubs.localFile = file; return pl.apply(this, arguments); };
  video.addEventListener('loadedmetadata', () => { const st = P.stream; if (st && !P.hls) setTimeout(() => { if (P.stream === st) MkvSubs.probe(st); }, 700); });
}
