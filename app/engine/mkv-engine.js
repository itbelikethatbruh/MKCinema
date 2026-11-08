/* MKCinema play-anything engine (main thread), 2.57.
   Plays MKV files in the built-in player on browsers that can't open them (Safari on Mac, iPhone and iPad), and fixes
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
  if (CFG_DEFAULTS.engine === undefined) CFG_DEFAULTS.engine = true;
  if (CFG.engine === undefined) CFG.engine = true;

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
      return !!t.mkv || /\.(mkv|webm)(\?|#|$)/i.test(s.url) || /\.mkv$/i.test(bh.filename || '');
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
    route(info) {
      const v = info.video;
      if (!v) return { go: false, why: 'the file has no video track MKCinema can read' };
      if (v.enc) return { go: false, why: 'the video is encrypted or compressed in a way browsers can’t read' };
      if (!v.kind) return { go: false, why: `${v.codec.replace(/^V_/, '')} video isn’t supported by the engine` };
      if (v.kind === 'hevc' && v.dv === 5) return { go: false, why: 'Dolby Vision profile 5 has no HDR10 layer, so its colours would be wrong here' };
      if (!can(`video/mp4; codecs="${v.mime}"`)) return { go: false, why: `this ${TOUCH_UI ? 'device' : 'browser'} can’t decode ${NAMES[v.kind]}${v.bits > 8 ? ` ${v.bits}-bit` : ''} video`, hard: true };
      const ai = this.defAudio(info), a = info.audio[ai];
      // Chrome, Edge and Firefox play this file well on their own: keep their player (faster seeking, no extra work)
      if (nativeMkv && (!a || (ai === info.audio.findIndex((x) => !x.enc) && NATIVE_AUDIO.has(a.kind)))) return { go: false, native: true, why: 'the browser plays this file by itself' };
      return { go: true, ai, mode: this.audioMode(a) };
    },
    describe(info, ai, mode) {
      const v = info.video, a = info.audio[ai];
      const vs = v ? `${NAMES[v.kind] || v.codec}${v.bits > 8 ? ` ${v.bits}-bit` : ''}${v.dv ? ` · Dolby Vision ${v.dv} as HDR` : ''}` : '';
      const as = a ? `${NAMES[a.kind] || a.codec} ${chName(a.ch)}`.trim() + (mode === 'aac' ? ' → AAC stereo' : mode === 'none' ? ' (no sound here)' : '') : 'no sound';
      return `${info.doc === 'webm' ? 'WebM' : 'MKV'} · ${vs} · ${as}`;
    },

    /* returns true when the engine took over, false to let the browser's own player try */
    async start(stream, startAt, base) {
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
        this.reason.set(stream, blocked ? 'the host doesn’t let browsers read this file directly' : info.fail);
        log('info', `engine: not used (${info.fail})`);
        return false;
      }
      const r = this.route(info);
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
      this.aIdx = r.ai; this.aMode = r.mode; this.gen = 1; this.reqT = startAt || 0; this.reqAt = performance.now();
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
      // a film that hasn't shown a frame in 15 s goes back to the old way
      const tok = this.tok;
      this.startT = setTimeout(() => { if (tok === this.tok && this.active && video.readyState < 2) this.fail('no picture within 15 s'); }, 15000);
    },

    opened(startAt) {
      if (!this.active) return;
      const info = this.info, a = info.audio[this.aIdx];
      try {
        if (isFinite(info.duration) && info.duration > 0) this.ms.duration = info.duration;
        this.sb.v = this.ms.addSourceBuffer(`video/mp4; codecs="${info.video.mime}"`);
        if (a && this.aMode !== 'none') this.sb.a = this.ms.addSourceBuffer(this.aMode === 'aac' ? 'audio/mp4; codecs="mp4a.40.2"' : `audio/mp4; codecs="${a.mime}"`);
      } catch (e) { this.fail(`the browser refused the stream (${e.message})`); return; }
      for (const k of ['v', 'a']) if (this.sb[k]) { this.sb[k].addEventListener('updateend', () => { this.busy[k] = false; this.drain(k); }); this.sb[k].addEventListener('error', () => this.fail('the browser could not decode the stream')); }
      this.w.postMessage({ op: 'start', t: startAt || 0, audio: this.sb.a ? this.aIdx : -1, mode: this.aMode, vmime: info.video.mime, gen: this.gen, until: (startAt || 0) + AHEAD });
    },

    msg(m) {
      if (!this.active) return;
      if (m.op === 'error') { this.fail(m.reason); return; }
      if (m.op === 'note') { if (m.audioFail) { this.aMode = 'none'; this.label = this.describe(this.info, this.aIdx, 'none'); } toast(m.msg, 'err', 6000); return; }
      if (m.gen !== this.gen) return;
      if (m.op === 'init' || m.op === 'frag') { const k = m.kind; if (!this.sb[k]) return; this.q[k].push({ data: m.data, t1: m.t1 }); this.drain(k); }
      if (m.op === 'eos') { this.eos = true; this.drain('v'); this.drain('a'); }
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
      this.q.v = this.q.v.filter((j) => j.fn); this.q.a = this.q.a.filter((j) => j.fn);
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
      this.gen++; const t = video.currentTime || 0; this.reqT = t; this.reqAt = performance.now(); this.eos = false;
      this.q.v = []; this.q.a = [];
      this.q.a.push({ fn: (sb) => { sb.remove(0, Infinity); } });
      this.q.a.push({ fn: (sb) => { if (sb.changeType) sb.changeType(mime); return false; } });
      this.drain('a');
      this.w.postMessage({ op: 'audio', audio: i, mode, t, gen: this.gen, vmime: this.info.video.mime, until: t + AHEAD });
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
      this.ms = null; this.sb = { v: null, a: null }; this.q = { v: [], a: [] }; this.stream = null; this.info = null;
    },
    stats() {
      if (!this.active) return null;
      const t = video.currentTime; let ahead = 0;
      try { const b = this.sb.v.buffered; for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.2 && t <= b.end(i)) ahead = b.end(i) - t; } catch (e) { /* ignore */ }
      return `${this.label} · ${ahead.toFixed(0)} s buffered`;
    },
  };
  window.MkEngine = E;
  if (!E.ok) return;

  /* ---------- the player hooks ---------- */
  const lu = loadUrl;
  loadUrl = function (stream, startAt) {
    E.stop();
    if (!E.wants(stream)) return lu.apply(this, arguments);
    E.base = (s, t) => lu.call(this, s, t);
    Loader.show && P.ctx && Loader.show(P.ctx.meta);
    E.start(stream, startAt, E.base).then((took) => { if (!took && P.stream === stream && !$('#player').hidden) lu.call(this, stream, startAt); })
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
  // "Only sources that play here" keeps MKV files with Dolby/DTS sound when the engine can convert it
  if (typeof BrowserPlay !== 'undefined') { const rs = BrowserPlay.rescue.bind(BrowserPlay); BrowserPlay.rescue = function () { return CFG.engine !== false || rs(); }; }

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

  // Settings › Playback toggle
  if (typeof SECTIONS !== 'undefined') {
    const sec = SECTIONS.find((x) => x.id === 'playback');
    if (sec && typeof sec.rows === 'function') {
      const rows = sec.rows;
      sec.rows = function () {
        const r = rows.apply(this, arguments); const i = r.findIndex((x) => x.key === 'browserOnly');
        r.splice(i < 0 ? r.length : i, 0, { key: 'engine', label: 'Play MKV files in MKCinema', help: `Plays MKV files ${MANAGED || !nativeMkv ? 'in Safari' : 'here'} and converts Dolby Digital, DTS and TrueHD sound that browsers can’t play, right on this ${TOUCH_UI ? 'device' : 'computer'}. The picture is never converted, so a file plays only if this ${TOUCH_UI ? 'device' : 'computer'} can decode its video. Some hosts don’t allow it; those files play the old way.${MANAGED ? ' AirPlay is off while it plays; use VLC or Infuse to AirPlay an MKV.' : ''}`, type: 'toggle' });
        return r;
      };
    }
  }
})();
