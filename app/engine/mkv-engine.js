/* MKCinema play-anything engine (main thread), 2.57 / 2.58.
   Plays MKV and TS files in the built-in player on browsers that can't open them (Safari on Mac, iPhone and iPad; TS
   everywhere), MP4 files whose sound the browser can't play, and fixes
   the ones Chrome, Edge and Firefox open badly: Dolby Digital (AC3), Dolby Digital Plus (EAC3), DTS and TrueHD sound
   that plays silent, and files whose default audio language isn't the first track. A worker (mkv-engine.worker.js)
   reads the file with Range requests straight from its host, copies the video into fragmented MP4 for Media Source
   Extensions (ManagedMediaSource on iPhone) and copies or converts the audio to AAC. The video is never re-encoded,
   so it plays only when the device itself can decode it (HEVC needs hardware support).

   Order of play: the browser's own player → this engine → an external player. Every engine failure (the host blocks
   reads from the browser, a codec this device can't decode, an error mid-film) falls back to the earlier behaviour
   within a couple of seconds, and the reason shows in Playback stats and X-Ray. MKCinema never relays the video. */
'use strict';
(() => {
  if (typeof loadUrl !== 'function' || typeof video === 'undefined') return;
  const MSEC = window.ManagedMediaSource || window.MediaSource;
  const MANAGED = !!window.ManagedMediaSource && MSEC === window.ManagedMediaSource;
  const UA = navigator.userAgent || '';
  const CHROMIUM = /Chrome\/|CriOS|Edg\//.test(UA);
  const can = (t) => { try { return !!MSEC && MSEC.isTypeSupported(t); } catch (e) { return false; } };
  const nativeMkv = (() => { try { return CHROMIUM || !!video.canPlayType('video/x-matroska'); } catch (e) { return CHROMIUM; } })();
  // sound Chromium and Firefox decode inside an MKV by themselves
  const NATIVE_AUDIO = new Set(['aac', 'opus', 'vorbis', 'flac', 'mp3']);
  const RESCUE = new Set(['ac3', 'eac3', 'dts', 'truehd', 'mlp', 'flac', 'opus', 'vorbis', 'mp3', 'mp2', 'aac', 'alac', 'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_s16be', 'pcm_s24be']);
  const AHEAD = TOUCH_UI ? 30 : 60, BEHIND = 15;
  // 5.1 AAC only when this device can output six channels (an AV receiver or surround speakers)
  let outCh = 0;
  const surroundOut = () => {
    if (!outCh) { try { const C = window.AudioContext || window.webkitAudioContext, c = new C(); outCh = c.destination.maxChannelCount || 2; c.close(); } catch (e) { outCh = 2; } }
    return outCh >= 6;
  };
  if (CFG_DEFAULTS.engine === undefined) CFG_DEFAULTS.engine = true;
  if (CFG.engine === undefined) CFG.engine = true;

  const isTs = (s) => /\.(ts|m2ts|mts)(\?|#|$)/i.test(s.url || '') || /\.(ts|m2ts|mts)$/i.test((s.behaviorHints && s.behaviorHints.filename) || '');
  const isMp4 = (s) => /\.(mp4|m4v|mov)(\?|#|$)/i.test(s.url || '') || /\.(mp4|m4v|mov)$/i.test((s.behaviorHints && s.behaviorHints.filename) || '');
  const DOLBY_HINT = /(?:^|[^a-z0-9])(e-?ac-?3|ac-?3|ddp(?:\d(?:\.\d)?)?|dd\+|dd5\.1|dts(?:-?hd|-?x|-?ma)?|true-?hd|atmos)(?:[^a-z0-9]|$)/i;
  /* Hosts that don't let web pages read their files (no CORS), remembered on this device for 7 days. The key is the host,
     plus the debrid service for resolver links (/resolve/torbox/…), since one addon serves several services. */
  const Hosts = {
    K: 'mkc.engHosts', map: null,
    key(u) { try { const x = new URL(u); const m = x.pathname.match(/\/(?:resolve|playback|stream|dl)\/([a-z][a-z-]{1,20})\//i); return x.host + (m ? `/${m[1].toLowerCase()}` : ''); } catch (e) { return ''; } },
    load() { if (!this.map) { try { this.map = JSON.parse(localStorage.getItem(this.K) || '{}') || {}; } catch (e) { this.map = {}; } } return this.map; },
    mark(u, v) { const k = this.key(u); if (!k) return; const m = this.load(); m[k] = { v, t: Date.now() }; try { localStorage.setItem(this.K, JSON.stringify(m)); } catch (e) { /* private mode */ } },
    blocked(u) { const e = this.load()[this.key(u)]; return !!(e && e.v === 'blocked' && Date.now() - e.t < 7 * 864e5); },
  };
  async function reachable(u) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 4000);
    try { await fetch(u, { mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: c.signal }); return true; } catch (e) { return false; } finally { clearTimeout(t); c.abort(); }
  }
  const NAMES = { avc: 'H.264', hevc: 'HEVC', av1: 'AV1', aac: 'AAC', opus: 'Opus', flac: 'FLAC', mp3: 'MP3', mp2: 'MP2', ac3: 'Dolby Digital', eac3: 'Dolby Digital Plus', dts: 'DTS', truehd: 'TrueHD', mlp: 'MLP', vorbis: 'Vorbis', alac: 'ALAC' };
  const log = (k, m) => { try { MKLog.add(k, m); } catch (e) { /* no log here */ } };
  const chName = (n) => ({ 1: 'mono', 2: 'stereo', 6: '5.1', 8: '7.1' }[n] || (n ? `${n} ch` : ''));

  const E = {
    ok: !!(MSEC && window.Worker && window.ReadableStream && window.AbortController),
    managed: MANAGED, tok: 0, active: false, stream: null, w: null, ms: null, url: '', info: null, gen: 0,
    sb: { v: null, a: null }, q: { v: [], a: [] }, busy: { v: false, a: false }, eos: false, aIdx: -1, aMode: 'none',
    reqT: 0, reason: new WeakMap(), label: '', timer: 0, hold: false, prevRemote: null, lastEvict: 0,

    wants(s) {
      if (!this.ok || CFG.engine === false || !s || s._local || !s.url || s._engNo || IS_TV) return false;
      const bh = s.behaviorHints || {};
      if (bh.proxyHeaders || CFG.alwaysProxy || s._cors === 'proxy' || s._audioTry) return false;
      if (/\.m3u8(\?|$)/i.test(s.url) || !/^https?:/i.test(s.url)) return false;
      const t = s._tel || {};
      if (!!t.mkv || /\.(mkv|webm)(\?|#|$)/i.test(s.url) || /\.mkv$/i.test(bh.filename || '')) return true;
      if (isTs(s)) return true; // Chrome, Edge and Firefox can't open TS files at all
      // MP4: only when the name says Dolby or DTS sound (most browsers would play it silent), or the film already played silent
      if (!isMp4(s)) return false;
      return !!s._engForce || DOLBY_HINT.test(`${bh.filename || ''} ${s.title || ''} ${s.name || ''} ${s.description || ''}`);
    },

    /* which audio track plays first: the file's default track (Chromium itself always plays the first one) */
    defAudio(info) {
      const a = info.audio.filter((x) => !x.enc); if (!a.length) return -1;
      const want = CFG.audioOnly && CFG.audioOnly !== 'any' ? CFG.audioOnly : '';
      const byLang = want && info.audio.filter((x) => x.lang === want || (want === 'eng' && x.lang === 'en'));
      // a file whose default track is a dub keeps it, unless your audio language is in the file
      const d = info.audio.find((x) => x.def) || info.audio[0];
      if (byLang && byLang.length && !(d.lang === want)) return (byLang.find((x) => x.def) || byLang[0]).i;
      return d.i;
    },
    audioMode(a) {
      if (!a || a.enc) return 'none';
      if (a.mime && can(`audio/mp4; codecs="${a.mime}"`) && !(a.kind === 'eac3' && /dep/.test(a.mime))) return 'copy';
      return RESCUE.has(a.kind) ? 'aac' : 'none';
    },
    route(info, force) {
      const v = info.video;
      if (!v) return { go: false, why: 'the file has no video track MKCinema can read' };
      if (v.enc) return { go: false, why: 'the video is encrypted or compressed in a way browsers can’t read' };
      if (!v.kind) return { go: false, why: `${v.codec.replace(/^V_/, '')} video isn’t supported by the engine` };
      // Dolby Vision: devices that decode it (Apple) get the real thing; profile 5 has no HDR10 layer, so elsewhere its colours would be wrong
      const dvOk = !!(v.dvMime && v.kind === 'hevc' && (v.dv === 5 || v.dv === 8) && can(`video/mp4; codecs="${v.dvMime}"`));
      if (v.dv === 5 && !dvOk) return { go: false, why: 'Dolby Vision profile 5 needs a device that decodes Dolby Vision (an iPhone, iPad or Mac); elsewhere its colours would be wrong', hard: true };
      if (dvOk) { this.dv = true; v.useMime = v.dvMime; } else { this.dv = false; v.useMime = v.mime; }
      if (!can(`video/mp4; codecs="${v.useMime}"`)) return { go: false, why: `this ${TOUCH_UI ? 'device' : 'browser'} can’t decode ${NAMES[v.kind]}${v.bits > 8 ? ` ${v.bits}-bit` : ''} video`, hard: true };
      const ai = this.defAudio(info), a = info.audio[ai];
      // Chrome, Edge and Firefox play this file well on their own: keep their player (faster seeking, no extra work)
      const first = ai === info.audio.findIndex((x) => !x.enc);
      if (force && !a) return { go: false, native: true, why: 'the file has no sound track' };
      if (!force && info.doc === 'mp4' && (!a || (first && a.mime && video.canPlayType(`audio/mp4; codecs="${a.mime}"`)))) return { go: false, native: true, why: 'the browser plays this file by itself' };
      if (!force && !['mp4', 'ts', 'm2ts'].includes(info.doc) && nativeMkv && (!a || (first && NATIVE_AUDIO.has(a.kind)))) return { go: false, native: true, why: 'the browser plays this file by itself' };
      return { go: true, ai, mode: this.audioMode(a) };
    },
    describe(info, ai, mode) {
      const v = info.video, a = info.audio[ai];
      const vs = v ? `${NAMES[v.kind] || v.codec}${v.bits > 8 ? ` ${v.bits}-bit` : ''}${v.dv ? (this.dv ? ` · Dolby Vision ${v.dv}` : ` · Dolby Vision ${v.dv} shown as HDR10`) : ''}` : '';
      const as = a ? `${NAMES[a.kind] || a.codec} ${chName(a.ch)}`.trim() + (mode === 'aac' ? (a.ch >= 6 && surroundOut() ? ' → AAC 5.1' : ' → AAC stereo') : mode === 'none' ? ' (no sound here)' : '') : 'no sound';
      return `${{ webm: 'WebM', mp4: 'MP4', ts: 'TS', m2ts: 'M2TS' }[info.doc] || 'MKV'} · ${vs} · ${as}`;
    },

    /* returns true when the engine took over, false to let the browser's own player try */
    async start(stream, startAt, base, force) {
      const tok = ++this.tok;
      let w;
      try { w = new Worker(new URL('engine/mkv-engine.worker.js', location.href)); } catch (e) { this.reason.set(stream, 'workers are blocked here'); return false; }
      const bh = stream.behaviorHints || {};
      const info = await new Promise((res) => {
        const t = setTimeout(() => res({ fail: 'the host took too long to answer' }), 7000);
        w.onmessage = (e) => { const m = e.data || {}; if (m.op === 'info') { clearTimeout(t); res(m.info); } if (m.op === 'fail') { clearTimeout(t); res({ fail: m.reason, container: m.container }); } };
        w.onerror = () => { clearTimeout(t); res({ fail: 'the engine could not start' }); };
        w.postMessage({ op: 'open', url: stream.url, headers: (bh.proxyHeaders && bh.proxyHeaders.request) || {} });
      });
      if (tok !== this.tok || P.stream !== stream) { w.terminate(); return true; }
      if (info.fail) {
        w.terminate();
        const blocked = /Failed to fetch|NetworkError|Load failed|network/i.test(info.fail);
        // a blocked read also looks like this when the network drops: only a host that answers a plain (no-cors) request counts as blocking
        if (blocked && await reachable(stream.url)) { Hosts.mark(stream.url, 'blocked'); stream._engBlocked = true; }
        this.reason.set(stream, blocked ? 'the host doesn’t let browsers read this file directly' : info.fail);
        log('info', `engine: not used (${info.fail})`);
        return false;
      }
      Hosts.mark(stream.url, 'ok');
      const r = this.route(info, force);
      if (!r.go) {
        w.terminate(); this.reason.set(stream, r.native ? 'not needed: the browser plays this file by itself' : r.why);
        if (r.hard) stream._engHard = r.why;
        return false;
      }
      this.attach(w, stream, info, r, startAt, base);
      return true;
    },

    attach(w, stream, info, r, startAt, base) {
      this.w = w; this.stream = stream; this.info = info; this.active = true; this.eos = false;
      this.aIdx = r.ai; this.aMode = r.mode; this.gen = 1; this.aGen = 1; this.reqT = startAt || 0; this.reqAt = performance.now();
      this.label = this.describe(info, r.ai, r.mode);
      this.reason.set(stream, '');
      this.q = { v: [], a: [] }; this.busy = { v: false, a: false }; this.sb = { v: null, a: null };
      const ms = this.ms = new MSEC();
      if (MANAGED) { this.prevRemote = video.disableRemotePlayback; video.disableRemotePlayback = true; video.playsInline = true; }
      this.url = URL.createObjectURL(ms);
      ms.addEventListener('sourceopen', () => this.opened(startAt), { once: true });
      if (MANAGED) {
        ms.addEventListener('startstreaming', () => { this.hold = false; this.pump(); });
        ms.addEventListener('endstreaming', () => { this.hold = true; this.pump(); });
      }
      w.onmessage = (e) => this.msg(e.data || {});
      w.onerror = (e) => this.fail(`engine error: ${(e && e.message) || 'worker stopped'}`);
      // hand the media source to the normal player set-up (resume point, speed, play), as if it were a local file
      const url = stream.url, local = stream._local;
      stream.url = this.url; stream._local = true;
      try { base(stream, startAt); } finally { stream.url = url; stream._local = local; }
      if (typeof AudioLang !== 'undefined') AudioLang.info.delete(stream);
      log('info', `engine: ${this.label}`);
      this.timer = setInterval(() => this.pump(), 1000);
      if (this.onAttach) try { this.onAttach(); } catch (e) { /* menu not ready */ }
      // a film that hasn't shown a frame in 15 s goes back to the old way
      const tok = this.tok;
      this.startT = setTimeout(() => { if (tok === this.tok && this.active && video.readyState < 2) this.fail('no picture within 15 s'); }, 15000);
    },

    opened(startAt) {
      if (!this.active) return;
      const info = this.info, a = info.audio[this.aIdx];
      try {
        if (isFinite(info.duration) && info.duration > 0) this.ms.duration = info.duration;
        this.sb.v = this.ms.addSourceBuffer(`video/mp4; codecs="${info.video.useMime || info.video.mime}"`);
        if (a && this.aMode !== 'none') this.sb.a = this.ms.addSourceBuffer(this.aMode === 'aac' ? 'audio/mp4; codecs="mp4a.40.2"' : `audio/mp4; codecs="${a.mime}"`);
      } catch (e) { this.fail(`the browser refused the stream (${e.message})`); return; }
      for (const k of ['v', 'a']) if (this.sb[k]) { this.sb[k].addEventListener('updateend', () => { this.busy[k] = false; this.drain(k); }); this.sb[k].addEventListener('error', () => this.fail('the browser could not decode the stream')); }
      this.w.postMessage({ op: 'start', t: startAt || 0, audio: this.sb.a ? this.aIdx : -1, mode: this.aMode, surround: surroundOut(), vmime: info.video.useMime || info.video.mime, dv: !!this.dv, gen: this.gen, until: (startAt || 0) + AHEAD });
    },

    msg(m) {
      if (!this.active) return;
      if (m.op === 'error') { this.fail(m.reason); return; }
      if (m.op === 'note') { if (m.audioFail) { this.aMode = 'none'; this.label = this.describe(this.info, this.aIdx, 'none'); this.dropAudio(); } toast(m.msg, 'err', 6000); return; }
      // subtitle pictures carry their own times, so ones read before a seek still count (duplicates are skipped)
      if (m.op === 'sub') { Pgs.add(m.num, m.pts, m.data); return; }
      // an init segment stays valid across seeks, so one that lands just after a seek is still used (only an audio switch makes the old one stale)
      if (m.op === 'init' && m.gen !== this.gen && (m.kind === 'v' || m.gen >= this.aGen)) { if (this.sb[m.kind]) { this.q[m.kind].unshift({ data: m.data, init: true }); this.drain(m.kind); } return; }
      if (m.gen !== this.gen) return;
      if (m.op === 'init' || m.op === 'frag') { const k = m.kind; if (!this.sb[k]) return; this.q[k].push({ data: m.data, t1: m.t1, init: m.op === 'init' }); this.drain(k); }
      if (m.op === 'eos') { this.eos = true; this.drain('v'); this.drain('a'); }
    },

    /* the sound couldn't be read or converted: play the picture alone rather than waiting for sound that never comes */
    dropAudio() {
      const sb = this.sb.a; if (!sb || !this.ms) return;
      this.q.a = []; this.sb.a = null; this.busy.a = false;
      try { if (this.ms.readyState === 'open') this.ms.removeSourceBuffer(sb); } catch (e) { /* already gone */ }
    },
    /* one serial queue per SourceBuffer; nothing is appended while it is busy */
    drain(k) {
      const sb = this.sb[k]; if (!sb || this.busy[k] || sb.updating || !this.active) return;
      const job = this.q[k][0];
      if (!job) { this.maybeEnd(); return; }
      if (job.fn) { this.q[k].shift(); this.busy[k] = true; try { if (job.fn(sb) === false) { this.busy[k] = false; this.drain(k); } } catch (e) { this.busy[k] = false; this.drain(k); } return; }
      try { this.busy[k] = true; sb.appendBuffer(job.data); this.q[k].shift(); if (job.t1) this[`${k}End`] = job.t1; }
      catch (e) {
        this.busy[k] = false;
        if (e.name === 'QuotaExceededError') {
          // the browser's memory budget is full (about 300 MB on iPhone): drop what is behind and retry once
          if (job.retried) { this.q[k].shift(); return; } job.retried = true;
          const t = video.currentTime; if (t > 10) { this.busy[k] = true; try { sb.remove(0, t - 5); } catch (x) { this.busy[k] = false; } }
          return;
        }
        if (e.name === 'InvalidStateError' && this.ms.readyState === 'ended') return;
        this.fail(`append failed (${e.message})`);
      }
    },
    maybeEnd() {
      if (!this.eos || this.q.v.length || this.q.a.length || this.busy.v || this.busy.a) return;
      if (this.ms.readyState === 'open' && !(this.sb.v && this.sb.v.updating) && !(this.sb.a && this.sb.a.updating)) { try { this.ms.endOfStream(); } catch (e) { /* ignore */ } }
    },

    buffered(t) {
      for (const k of ['v', 'a']) {
        const sb = this.sb[k]; if (!sb) continue; let hit = false;
        try { const b = sb.buffered; for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.3 && t < b.end(i) - 0.5) hit = true; } catch (e) { return false; }
        if (!hit) return false;
      }
      return true;
    },
    seek(t) {
      if (!this.active || !this.w) return;
      if (this.buffered(t)) return;
      // just asked for this spot (the resume point right after start): nothing new to fetch
      if (Math.abs(t - this.reqT) < 1.5 && performance.now() - (this.reqAt || 0) < 4000) return;
      this.gen++; this.reqT = t; this.reqAt = performance.now(); this.eos = false;
      this.q.v = this.q.v.filter((j) => j.fn || j.init); this.q.a = this.q.a.filter((j) => j.fn || j.init);
      this.w.postMessage({ op: 'seek', t, gen: this.gen, until: t + AHEAD });
    },
    reread() {
      if (!this.active || !this.w) return;
      const t = video.currentTime || 0; this.gen++; this.reqT = t; this.reqAt = performance.now(); this.eos = false;
      this.q.v = this.q.v.filter((j) => j.fn || j.init); this.q.a = this.q.a.filter((j) => j.fn || j.init);
      this.w.postMessage({ op: 'seek', t, gen: this.gen, until: t + AHEAD });
    },
    pump() {
      if (!this.active || !this.w) return;
      const t = video.currentTime || 0;
      this.w.postMessage({ op: 'until', t: this.hold ? t + 4 : t + AHEAD });
      this.drain('v'); this.drain('a');
      // keep memory low: drop what is more than 15 s behind
      if (performance.now() - this.lastEvict > 5000 && t > BEHIND + 10) {
        this.lastEvict = performance.now();
        for (const k of ['v', 'a']) {
          const sb = this.sb[k]; if (!sb) continue;
          try { if (sb.buffered.length && sb.buffered.start(0) < t - BEHIND - 5) this.q[k].push({ fn: (b) => { b.remove(0, Math.max(0.1, video.currentTime - BEHIND)); } }); } catch (e) { /* ignore */ }
          this.drain(k);
        }
      }
    },

    /* switch the sound track: the old one is dropped and the film carries on from the same second */
    setAudio(i) {
      if (!this.active) return false;
      const a = this.info.audio[i]; if (!a || !this.sb.a) return false;
      const mode = this.audioMode(a); if (mode === 'none') { toast('That sound track can’t play here', 'err'); return false; }
      const mime = mode === 'aac' ? 'audio/mp4; codecs="mp4a.40.2"' : `audio/mp4; codecs="${a.mime}"`;
      this.aIdx = i; this.aMode = mode; this.label = this.describe(this.info, i, mode);
      this.gen++; this.aGen = this.gen; const t = video.currentTime || 0; this.reqT = t; this.reqAt = performance.now(); this.eos = false;
      this.q.v = this.q.v.filter((j) => j.init); this.q.a = [];
      this.q.a.push({ fn: (sb) => { sb.remove(0, Infinity); } });
      this.q.a.push({ fn: (sb) => { if (sb.changeType) sb.changeType(mime); return false; } });
      this.drain('a');
      this.w.postMessage({ op: 'audio', audio: i, mode, surround: surroundOut(), t, gen: this.gen, vmime: this.info.video.useMime || this.info.video.mime, dv: !!this.dv, until: t + AHEAD });
      return true;
    },

    fail(why) {
      if (!this.active) return;
      const s = this.stream, at = video.currentTime || this.reqT || 0, base = this.base;
      log('warn', `engine: stopped (${why})`);
      this.stop(); s._engNo = why; this.reason.set(s, why);
      if (P.stream !== s || $('#player').hidden) return;
      toast('Switching to the standard player for this file…', 'info', 3000);
      if (s._tel && s._tel.mkv && window.MKSafari && MKSafari.on) s._tel._wkBad = 'mkv';
      if (base) base(s, at);
    },
    stop() {
      if (!this.active && !this.w) return;
      this.tok++; this.active = false; clearInterval(this.timer); clearTimeout(this.startT);
      if (this.w) { try { this.w.postMessage({ op: 'close' }); } catch (e) { /* gone */ } const w = this.w; setTimeout(() => w.terminate(), 200); this.w = null; }
      if (this.ms && this.ms.readyState === 'open') { try { this.ms.endOfStream(); } catch (e) { /* ignore */ } }
      if (this.url) { URL.revokeObjectURL(this.url); this.url = ''; }
      if (MANAGED && this.prevRemote != null) { video.disableRemotePlayback = this.prevRemote; this.prevRemote = null; }
      this.ms = null; this.sb = { v: null, a: null }; this.q = { v: [], a: [] }; this.stream = null; this.info = null; Pgs.off(true);
    },
    stats() {
      if (!this.active) return null;
      const t = video.currentTime; let ahead = 0;
      try { const b = this.sb.v.buffered; for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.2 && t <= b.end(i)) ahead = b.end(i) - t; } catch (e) { /* ignore */ }
      return `${this.label} · ${ahead.toFixed(0)} s buffered`;
    },
  };

  /* ---------- Image subtitles (Blu-ray PGS): decoded here and drawn on a canvas over the picture ----------
     Each display set holds a composition (which objects go where), palettes (YCrCb + alpha) and run-length bitmaps.
     A set with no objects clears the screen. On iPhone in native fullscreen the page can't draw over the video,
     so they show in the app view only. */
  const Pgs = {
    num: 0, sets: [], pal: new Map(), obj: new Map(), cv: null, cur: null, raf: 0, zlib: false, w: 1920, h: 1080,
    async add(num, pts, buf) {
      if (num !== this.num) return;
      let u = new Uint8Array(buf);
      if (this.zlib) { try { u = new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()); } catch (e) { return; } }
      if (num !== this.num || this.sets.some((x) => Math.abs(x.t - pts) < 0.001)) return;
      const set = this.decode(u, pts); if (!set) return;
      let i = this.sets.length; while (i > 0 && this.sets[i - 1].t > pts) i--; this.sets.splice(i, 0, set);
      if (this.sets.length > 400) this.sets.splice(0, this.sets.length - 400);
    },
    ycc(y, cr, cb, a) {
      const Y = 1.164 * (y - 16), r = Y + 1.793 * (cr - 128), g = Y - 0.213 * (cb - 128) - 0.533 * (cr - 128), b = Y + 2.112 * (cb - 128);
      const c = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0); return [c(r), c(g), c(b), a];
    },
    decode(u, t) {
      let p = 0, comp = null, palId = 0;
      while (p + 3 <= u.length) {
        const type = u[p], len = (u[p + 1] << 8) | u[p + 2], d = p + 3; p = d + len; if (p > u.length) break;
        if (type === 0x16) { // presentation composition
          const w = (u[d] << 8) | u[d + 1], h = (u[d + 2] << 8) | u[d + 3], state = u[d + 7], n = u[d + 10];
          if (state & 0x80) { this.obj.clear(); } // epoch start: forget earlier objects
          palId = u[d + 9]; this.w = w || this.w; this.h = h || this.h; comp = [];
          let q = d + 11;
          for (let k = 0; k < n; k++) { const id = (u[q] << 8) | u[q + 1], crop = u[q + 3] & 0x80, x = (u[q + 4] << 8) | u[q + 5], y = (u[q + 6] << 8) | u[q + 7]; comp.push({ id, x, y }); q += crop ? 16 : 8; }
        } else if (type === 0x14) { // palette
          const id = u[d]; const pal = this.pal.get(id) || new Array(256).fill(null).map(() => [0, 0, 0, 0]);
          for (let q = d + 2; q + 5 <= d + len; q += 5) pal[u[q]] = this.ycc(u[q + 1], u[q + 2], u[q + 3], u[q + 4]);
          this.pal.set(id, pal); for (const o of this.obj.values()) o.img = null;
        } else if (type === 0x15) { // object (may span several segments)
          const id = (u[d] << 8) | u[d + 1], seq = u[d + 3];
          if (seq & 0x80) this.obj.set(id, { w: (u[d + 7] << 8) | u[d + 8], h: (u[d + 9] << 8) | u[d + 10], parts: [u.subarray(d + 11, d + len)] });
          else { const o = this.obj.get(id); if (o) o.parts.push(u.subarray(d + 4, d + len)); }
        }
      }
      if (!comp) return null;
      const pal = this.pal.get(palId) || this.pal.values().next().value;
      const items = [];
      for (const c of comp) {
        const o = this.obj.get(c.id); if (!o || !pal || !o.w || !o.h) continue;
        if (!o.img) o.img = this.rle(o, pal);
        items.push({ x: c.x, y: c.y, img: o.img });
      }
      return { t, items, w: this.w, h: this.h };
    },
    rle(o, pal) {
      let n = 0; for (const x of o.parts) n += x.length; const u = new Uint8Array(n); let k = 0; for (const x of o.parts) { u.set(x, k); k += x.length; }
      const img = new ImageData(o.w, o.h), px = img.data; let x = 0, y = 0, p = 0;
      const put = (col, len) => { const c = pal[col]; for (let i = 0; i < len && x < o.w; i++, x++) { const j = (y * o.w + x) * 4; px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2]; px[j + 3] = c[3]; } };
      while (p < u.length && y < o.h) {
        const b = u[p++];
        if (b) { put(b, 1); continue; }
        const f = u[p++]; if (f === undefined) break;
        if (!f) { x = 0; y++; continue; }
        const long = f & 0x40, len = long ? ((f & 0x3F) << 8) | u[p++] : f & 0x3F;
        put(f & 0x80 ? u[p++] : 0, len);
      }
      return img;
    },
    on(track) {
      this.off(true); this.num = track.num; this.zlib = !!track.zlib;
      if (E.w) { E.w.postMessage({ op: 'subs', nums: [track.num] }); E.reread(); }
      if (!this.cv) {
        const cv = this.cv = document.createElement('canvas'); cv.id = 'pgsLayer'; cv.setAttribute('aria-hidden', 'true');
        cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1';
        const st = $('#stage') || video.parentElement; st.appendChild(cv);
      }
      this.cv.hidden = false;
      const loop = () => { this.raf = requestAnimationFrame(loop); this.paint(); }; loop();
    },
    off(keepCanvas) {
      cancelAnimationFrame(this.raf); this.num = 0; this.sets = []; this.pal.clear(); this.obj.clear(); this.cur = null;
      if (E.w) E.w.postMessage({ op: 'subs', nums: [] });
      if (this.cv) { const c = this.cv.getContext('2d'); c.clearRect(0, 0, this.cv.width, this.cv.height); this.cv.hidden = true; if (!keepCanvas) { this.cv.remove(); this.cv = null; } }
    },
    paint() {
      if (!this.cv || !this.num) return;
      const t = video.currentTime - (P.subDelay || 0); let s = null;
      for (const x of this.sets) { if (x.t <= t + 0.02) s = x; else break; }
      if (s && t - s.t > 30 && s.items.length) s = null; // a lost "clear" never leaves a subtitle up for good
      const r = video.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr), key = `${W}x${H}`;
      if (s === this.cur && this.cv._k === key) return;
      this.cur = s; this.cv._k = key;
      const st = this.cv.parentElement.getBoundingClientRect();
      Object.assign(this.cv.style, { left: `${r.left - st.left}px`, top: `${r.top - st.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
      const c = this.cv.getContext('2d'); c.clearRect(0, 0, W, H);
      if (!s || !s.items.length) return;
      // the subtitle canvas covers the whole video frame; fit it like the picture (letterboxed)
      const vw = video.videoWidth || s.w, vh = video.videoHeight || s.h, k = Math.min(W / vw, H / vh), ox = (W - vw * k) / 2, oy = (H - vh * k) / 2, sx = vw / s.w, sy = vh / s.h;
      for (const it of s.items) {
        if (!it.bmp) { const tmp = document.createElement('canvas'); tmp.width = it.img.width; tmp.height = it.img.height; tmp.getContext('2d').putImageData(it.img, 0, 0); it.bmp = tmp; }
        c.drawImage(it.bmp, ox + it.x * sx * k, oy + it.y * sy * k, it.img.width * sx * k, it.img.height * sy * k);
      }
    },
  };
  window.MkPgs = Pgs;
  window.MkEngine = E;
  if (!E.ok) return;

  /* ---------- the player hooks ---------- */
  const lu = loadUrl;
  loadUrl = function (stream, startAt) {
    E.stop();
    E.base = (s, t) => lu.call(this, s, t);
    if (!E.wants(stream)) return lu.apply(this, arguments);
    Loader.show && P.ctx && Loader.show(P.ctx.meta);
    E.start(stream, startAt, E.base).then((took) => {
      if (took || P.stream !== stream || $('#player').hidden) return;
      if (stream._engBlocked && needsEngine(stream) && skipSilent(stream, startAt)) return;
      lu.call(this, stream, startAt);
    })
      .catch(() => { if (P.stream === stream) lu.call(this, stream, startAt); });
  };
  const td = teardown;
  teardown = function () { E.stop(); return td.apply(this, arguments); };
  video.addEventListener('seeking', () => { if (E.active) E.seek(video.currentTime); });
  video.addEventListener('timeupdate', () => { if (E.active && E.hold !== true) { const now = performance.now(); if (now - (E.lastPump || 0) > 900) { E.lastPump = now; E.pump(); } } });
  // a decode error while the engine plays goes back to the standard player, not to the next source
  if (window.MkHeal && MkHeal.native) {
    const nat = MkHeal.native.bind(MkHeal);
    MkHeal.native = function (stream, reason) { if (E.active && E.stream === stream) { E.fail(reason); return; } return nat(stream, reason); };
  }

  // Safari: MKV files are no longer "Not for Safari" while the engine can try them (they still rank below MP4 and HLS)
  if (window.MKSafari && MKSafari.on && typeof Telemetry !== 'undefined') {
    const parse = Telemetry.parse.bind(Telemetry);
    Telemetry.parse = function (s) {
      const t = parse(s);
      if (t && t._wkBad === 'mkv' && !s._engNo && CFG.engine !== false) { delete t._wkBad; t.score += 1200; }
      return t;
    };
  }
  /* would the browser's own player lose this file's sound (judged by its name, as "Only sources that play here" does)? */
  function needsEngine(s) {
    if (typeof BrowserPlay === 'undefined' || !s || !s._tel) return false;
    E.strict = true; try { return !BrowserPlay.ok(Object.assign({}, s, { url: '' })) && !!s._tel.webReady; } catch (e) { return false; } finally { E.strict = false; }
  }
  /* rather than a silent film: the next source that plays here with sound */
  function skipSilent(s, at) {
    if (typeof Failover === 'undefined' || !P.ctx || CFG.failover === false) return false;
    const n = Failover.candidates(s)[0]; if (!n) return false;
    Failover.tried.add(s);
    log('info', 'engine: host blocks reads, moving to a source with sound');
    toast('That copy’s sound can’t play in the browser. Switching to one that can…', 'info', 4200, 'failover');
    playStream(P.ctx, n, { startAt: at != null ? at : pNow() });
    return true;
  }
  // a film playing without sound (Dolby or DTS in an MP4 or MKV the browser opened itself): the engine converts the sound
  // here first, before the older offers (the server-side conversion or an external player)
  if (typeof Rescue !== 'undefined' && Rescue && typeof Rescue.found === 'function') {
    const found = Rescue.found.bind(Rescue);
    Rescue.found = async function (s) {
      if (s && !s._engTried && !s._engNo && CFG.engine !== false && !E.active && E.base && P.stream === s) {
        s._engTried = true; s._engForce = true;
        const at = video.currentTime || 0, wasPaused = video.paused;
        let took = false;
        if (E.wants(s)) { try { took = await E.start(s, at, E.base, true); } catch (e) { took = false; } }
        s._engForce = false;
        if (took) { log('info', 'engine: took over a film that played without sound'); if (wasPaused) setTimeout(() => video.pause(), 0); return; }
        if (s._engBlocked && skipSilent(s, at)) return;
      }
      return found(s);
    };
  }
  // "Only sources that play here" keeps MKV files with Dolby/DTS sound when the engine can convert it
  // (only for hosts that let the engine read their files: a host known to block it keeps those sources hidden)
  if (typeof BrowserPlay !== 'undefined') {
    const rs = BrowserPlay.rescue.bind(BrowserPlay), ok = BrowserPlay.ok.bind(BrowserPlay);
    BrowserPlay.rescue = function () { return (!E.strict && CFG.engine !== false) || rs(); };
    BrowserPlay.ok = function (s) {
      if (CFG.engine === false || !s || !s.url || !Hosts.blocked(s.url)) return ok(s);
      E.strict = true; try { return ok(s); } finally { E.strict = false; }
    };
  }
  if (typeof Failover !== 'undefined' && typeof Failover.candidates === 'function') {
    const cand = Failover.candidates.bind(Failover);
    Failover.candidates = function (failed) { return cand(failed).filter((s) => !(s.url && Hosts.blocked(s.url) && needsEngine(s))); };
  }

  // the audio language menu lists the file's own tracks and switches them here
  if (typeof AudioLang !== 'undefined') {
    const probe = AudioLang.probe.bind(AudioLang), pick = AudioLang.pick.bind(AudioLang);
    AudioLang.probe = async function (s) {
      if (E.active && E.stream === s && E.info && E.info.audio.length) {
        const st = { state: E.info.audio.length > 1 ? 'ok' : 'none', via: 'eng', cur: E.aIdx,
          tracks: E.info.audio.map((a) => ({ i: a.i, label: this.label({ language: a.lang, title: a.name, channels: a.ch, codec: NAMES[a.kind] || a.kind }, a.i), def: a.def })) };
        this.info.set(s, st); if (P.stream === s && !$('#optMenu').hidden) renderOptMenu(); return st;
      }
      return probe(s);
    };
    AudioLang.pick = async function (i) {
      const s = P.stream, st = s && this.info.get(s);
      if (st && st.via === 'eng' && E.active && E.stream === s) {
        if (st.cur === i) return;
        const t = st.tracks.find((x) => x.i === i);
        if (E.setAudio(i)) { st.cur = i; s._audio = i; toast(`Audio: ${t ? t.label : `track ${i + 1}`}`, 'info', 2200); }
        return;
      }
      return pick(i);
    };
  }

  // Playback stats and X-Ray say how the film is playing, or why the engine wasn't used
  const note = () => { const s = P.stream; if (!s) return ''; if (E.active && E.stream === s) return E.stats(); const r = E.reason.get(s); return r ? `Not used: ${r}` : ''; };
  if (typeof PxStats !== 'undefined') {
    const paint = PxStats.paint.bind(PxStats);
    PxStats.paint = function () {
      paint(); const el = $('#pxStats'), n = note(); if (!el || el.hidden || !n) return;
      if (E.active) $$('div', el).forEach((d) => { const k = d.querySelector('span'), v = d.querySelector('em'); if (k && v && k.textContent === 'Stream') v.textContent = 'MKCinema engine (picture copied, never re-encoded)'; });
      el.insertAdjacentHTML('beforeend', `<div><span>Engine</span><em>${esc(n)}</em></div>`);
    };
  }
  if (typeof XRay !== 'undefined') {
    const st = XRay.stats.bind(XRay);
    XRay.stats = function () { const rows = st(), n = note(); if (n) rows.splice(4, 0, ['Engine', n]); if (E.active && E.aMode === 'aac') rows.forEach((r) => { if (r[0] === 'Audio') r[1] = 'Converted on this device · AAC stereo'; }); return rows; };
  }


  // image subtitle tracks join the subtitle menu while the engine plays
  if (typeof renderSubMenu === 'function' && typeof selectSub === 'function') {
    const pgsTracks = () => (E.active && E.info ? E.info.subs.filter((x) => x.codec === 'S_HDMV/PGS' && !x.enc) : []);
    const rsm = renderSubMenu;
    renderSubMenu = function () {
      const list = pgsTracks();
      if (list.length && Array.isArray(P.subs) && !P.subs.some((x) => x.kind === 'pgs' && x._eng === E.info)) {
        list.forEach((t) => P.subs.push({ kind: 'pgs', lang: t.lang || 'und', _pgs: t, _eng: E.info, _label: `${t.name || langName(t.lang || 'und')}${t.forced ? ' (forced)' : ''} · in file · picture` }));
      }
      return rsm.apply(this, arguments);
    };
    const ss = selectSub;
    selectSub = async function (i, opt) {
      const s = P.subs && P.subs[i];
      if (s && s.kind === 'pgs') {
        if (typeof clearSubTracks === 'function') clearSubTracks();
        P.subPick = (P.subPick || 0) + 1; P.curSub = i; renderSubMenu();
        Pgs.on(s._pgs);
        if (!(opt && opt.auto)) toast(`Subtitles: ${s._label}${MANAGED ? ' (not in iPhone fullscreen)' : ''}`, 'ok');
        return;
      }
      Pgs.off(true);
      return ss.apply(this, arguments);
    };
    E.onAttach = () => { if (pgsTracks().length) renderSubMenu(); };
  }

  // Settings › Playback toggle
  if (typeof SECTIONS !== 'undefined') {
    const sec = SECTIONS.find((x) => x.id === 'playback');
    if (sec && typeof sec.rows === 'function') {
      const rows = sec.rows;
      sec.rows = function () {
        const r = rows.apply(this, arguments); const i = r.findIndex((x) => x.key === 'browserOnly');
        r.splice(i < 0 ? r.length : i, 0, { key: 'engine', label: 'Play MKV and TS files in MKCinema', help: `Plays MKV and TS files ${MANAGED || !nativeMkv ? 'in Safari' : 'here'} and converts Dolby Digital, DTS and TrueHD sound that browsers can’t play (in MKV, MP4 and TS files), right on this ${TOUCH_UI ? 'device' : 'computer'}. The picture is never converted, so a file plays only if this ${TOUCH_UI ? 'device' : 'computer'} can decode its video. Some hosts don’t allow it; those files play the old way.${MANAGED ? ' AirPlay is off while it plays; use VLC or Infuse to AirPlay an MKV.' : ''}`, type: 'toggle' });
        return r;
      };
    }
  }
})();
