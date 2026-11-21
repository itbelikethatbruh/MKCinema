/* ---------------- Native player (2.70, Windows app 1.6.0) ----------------
   In the Windows app the film plays in libmpv, a native video engine, drawn in its own window under this page. The
   page turns see-through while it plays, so the same controls, menus, X-Ray, skips, party sync and subtitles tools sit
   on top of the native picture. The <video> element stays the one everything else listens to: while a film plays
   natively its play/pause/time/volume/tracks are answered by libmpv and its events fire from libmpv's news.
   What native adds: every container and codec (MKV, AVI, HEVC, AV1, DTS, TrueHD) without conversion or CORS limits,
   hardware decoding, HDR sent to HDR screens, styled ASS and picture subtitles drawn by libass.
   Settings › Playback › Native player turns it off; then everything plays in the web player as before. */
/* 2.74: Android app 1.15.0+ (phones and tablets): the same native player under the page, through MKAndroid.mpv(cmd, arg),
   which answers at once ("ERR:..." when refused); mpv's news comes back through MkAndroidPlayer._ev. */
const MkDroid = {
  b: null,
  get() {
    if (this.b) return this.b;
    try { if (!(window.MKAndroid && typeof MKAndroid.mpv === 'function')) return null; } catch (e) { return null; }
    const b = { droid: true, cmd: (c, a) => new Promise((res, rej) => setTimeout(() => {
      try { const r = String(MKAndroid.mpv(String(c), a == null ? '' : String(a)) || ''); if (r.startsWith('ERR:')) rej(new Error(r.slice(4))); else res(r); } catch (e) { rej(e); }
    }, 0)) };
    window.MkAndroidPlayer = b;
    return (this.b = b);
  },
};
const MkNative = {
  ok: false, active: false, gen: 0, st: {}, tAt: 0, cur: null, subIds: [], lastEnd: null, probed: null,
  bridge() { try { return window.MKDesktop && MKDesktop.player && typeof MKDesktop.player.cmd === 'function' ? MKDesktop.player : MkDroid.get(); } catch (e) { return null; } },
  /* libmpv is there and the setting is on */
  ready() { const b = this.bridge(); return this.ok && !!b && (b.droid ? CFG.nativePlayer === true : CFG.nativePlayer !== false); },
  probe() {
    const b = this.bridge(); if (!b) return Promise.resolve(false);
    return this.probed || (this.probed = b.cmd('probe').then((j) => { const r = JSON.parse(j || '{}'); this.ok = !!r.ok; if (!r.ok) console.info('Native player unavailable:', r.err); return this.ok; }).catch(() => (this.ok = false)));
  },
  wants(s) { return this.ready() && !!s && !!s.url && !s.ytId && /^https?:\/\//i.test(s.url) && !(typeof PartyGuest !== 'undefined' && PartyGuest.relaying()); },
  cmd(c, a) { const b = this.bridge(); if (!b) return Promise.reject(new Error('no native player')); return b.cmd(c, a); },
  /* the time now, moved on smoothly between libmpv's news (about 8 a second) */
  now() {
    const t = Number(this.st.t) || 0;
    if (this.st.paused || this.st.buffering || this.st.seeking || this.st.ended || !this.tAt) return t;
    return t + Math.min(0.5, (performance.now() - this.tAt) / 1000) * (Number(this.st.speed) || 1);
  },
  fire(n) { try { video.dispatchEvent(new Event(n)); } catch (e) { /* ignore */ } },
  /* ---- open a film natively ---- */
  open(stream, startAt) {
    const bh = stream.behaviorHints || {}, h = (bh.proxyHeaders && bh.proxyHeaders.request) || {};
    this.attach();
    this.cur = stream; this.st = { paused: true }; this.tAt = 0; this.subIds = []; this.lastEnd = null; this.loadedFired = false; this.metaFired = false; this.err = null;
    // whatever was on screen under the player (a title page, Home) hides, so the see-through page shows only the film
    if (!this.under) { this.under = [...document.body.children].filter((el) => el.id !== 'player' && el.id !== 'toasts' && !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName) && !el.hidden); this.under.forEach((el) => el.classList.add('mk-nv-under')); }
    document.documentElement.classList.add('mk-native-on');
    this.cmd('show', '1').catch(() => {});
    Failover.arm(stream);
    this.cmd('open', JSON.stringify({ url: stream.url, headers: h, start: startAt || 0, title: (P.ctx && P.ctx.meta && P.ctx.meta.name) || '', alang: this.alang(), slang: '' }))
      .then((j) => { try { this.gen = JSON.parse(j || '{}').gen || 0; } catch (e) { /* ignore */ } })
      .catch((e) => this.fail(String((e && e.message) || e)));
    this.vol(); this.cmd('speed', CFG.speed || 1).catch(() => {}); this.cmd('tonemap', CFG.hdrMap === 'sdr' ? 'sdr' : 'auto').catch(() => {});
    this.picture(); this.sound(); styleCues();
    this.fire('loadstart');
  },
  /* your audio language as libmpv's alang list (3- and 2-letter forms, so files tagged either way match) */
  alang() {
    const w = window.MkAudioWant ? MkAudioWant() : ''; if (!w) return '';
    const T = { fre: 'fra', ger: 'deu', chi: 'zho', dut: 'nld', gre: 'ell', cze: 'ces', rum: 'ron' }, TWO = { eng: 'en', spa: 'es', fre: 'fr', ger: 'de', ita: 'it', por: 'pt', rus: 'ru', jpn: 'ja', kor: 'ko', chi: 'zh', ara: 'ar', hin: 'hi', dut: 'nl', pol: 'pl', tur: 'tr', tam: 'ta', tel: 'te', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi', gre: 'el', heb: 'he', cze: 'cs', hun: 'hu', rum: 'ro', vie: 'vi', tha: 'th', ind: 'id', ukr: 'uk', bul: 'bg', hrv: 'hr', srp: 'sr', mal: 'ml', kan: 'kn', ben: 'bn', mar: 'mr' };
    return [w, T[w], TWO[w]].filter(Boolean).join(',');
  },
  fail(msg) { try { MKLog.add('play', 'native: failed, ' + msg); } catch (e) { /* ignore */ } this.err = { code: 4, message: msg }; this.fire('error'); },
  /* news from libmpv: {gen, t, dur, paused, buffering, seeking, ended, tracks, loaded, end, err, ...} */
  ev(n) {
    if (!this.active || !n || (n.gen && this.gen && n.gen !== this.gen)) return;
    if (n.log) { try { MKLog.add('play', 'native: ' + n.log); } catch (e) { /* ignore */ } }
    const was = this.st, st = this.st = Object.assign({}, was, n);
    if ('t' in n) this.tAt = performance.now();
    if ('dur' in n && n.dur !== was.dur) this.fire('durationchange');
    if (('w' in n || 'h' in n) && st.w) this.fire('resize');
    if ('tracks' in n) this.tracks(st.tracks || []);
    const meta = st.dur > 0 && Array.isArray(st.tracks);
    if (!this.metaFired && (meta || n.loaded)) {
      this.metaFired = true; ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'].forEach((e) => this.fire(e));
      setTimeout(() => { if (this.active) addEmbeddedSubs(); }, 50);
    }
    if ('paused' in n && n.paused !== was.paused) { if (n.paused) this.fire('pause'); else { this.fire('play'); if (!st.buffering) this.fire('playing'); } }
    if ('buffering' in n && n.buffering !== was.buffering) { if (n.buffering) this.fire('waiting'); else if (!st.paused) this.fire('playing'); }
    if ('seeking' in n && n.seeking !== was.seeking) this.fire(n.seeking ? 'seeking' : 'seeked');
    if ('volume' in n || 'mute' in n) this.fire('volumechange');
    if ('speed' in n && n.speed !== was.speed) this.fire('ratechange');
    if ('t' in n) this.fire('timeupdate');
    if ('cached' in n) this.fire('progress');
    if (n.end === 'eof' || (n.ended && !was.ended && st.dur > 0 && (Number(st.t) || 0) >= st.dur - 2)) { if (this.lastEnd !== this.gen) { this.lastEnd = this.gen; this.st.paused = true; this.fire('ended'); } }
    if (n.end === 'error') this.fail(n.err || 'the file could not be opened');
  },
  /* the file's own tracks: audio for video.audioTracks, subtitles for the subtitle menu */
  tracks(list) {
    const audio = list.filter((t) => t.type === 'audio');
    const arr = audio.map((t) => ({
      id: String(t.id), kind: t.default ? 'main' : 'translation', language: t.lang || '',
      label: [t.title, t.codec && String(t.codec).toUpperCase(), t['demux-channel-count'] ? `${t['demux-channel-count']} ch` : ''].filter(Boolean).join(' · '),
      get enabled() { return !!t.selected; },
      set enabled(v) { if (v && !t.selected) { audio.forEach((x) => { x.selected = x === t; }); MkNative.cmd('aid', String(t.id)).catch(() => {}); } },
    }));
    arr.getTrackById = (id) => arr.find((x) => x.id === String(id)) || null;
    arr.addEventListener = () => {}; arr.removeEventListener = () => {};
    this.audio = arr;
    const subsNow = list.filter((t) => t.type === 'sub' && !t.external).map((t) => t.id).join(',');
    if (this.metaFired && subsNow !== this._subsSeen) { this._subsSeen = subsNow; setTimeout(() => { if (this.active) addEmbeddedSubs(); }, 0); } else this._subsSeen = subsNow;
  },
  fileSubs() {
    return ((this.st && this.st.tracks) || []).filter((t) => t.type === 'sub' && !t.external)
      .map((t) => ({ kind: 'mpv', id: t.id, lang: t.lang || 'und', _label: `${t.title || langName(t.lang || 'und')}${t.codec ? ` · ${String(t.codec).replace('hdmv_pgs_subtitle', 'PGS').toUpperCase()}` : ''} · in file` }));
  },
  /* subtitles: the file's own tracks by id, anything else (downloaded, translated, your file) as text */
  async subOn(s, text) {
    await this.subOff();
    if (s.kind === 'mpv') return this.cmd('sid', String(s.id));
    const before = new Set(((this.st.tracks) || []).filter((t) => t.type === 'sub').map((t) => t.id));
    await this.cmd('subadd', JSON.stringify({ text, title: subLabel(s), lang: /^[a-z]{2,3}$/i.test(String(s.lang || '')) ? String(s.lang) : '' }));
    // remember which track that made, so the next pick removes it
    setTimeout(() => { ((this.st.tracks) || []).forEach((t) => { if (t.type === 'sub' && t.external && !before.has(t.id) && !this.subIds.includes(t.id)) this.subIds.push(t.id); }); }, 600);
  },
  async subOff() {
    const ids = this.subIds; this.subIds = [];
    await this.cmd('sid', 'no').catch(() => {});
    for (const id of ids) await this.cmd('subremove', String(id)).catch(() => {});
  },
  subStyle() {
    if (!this.active) return;
    this.cmd('subdelay', P.subDelay || 0).catch(() => {});
    this.cmd('subscale', (Number(CFG.subSize) || 100) / 100).catch(() => {});
    this.cmd('subpos', { top: 8, higher: 88 }[CFG.subPos] || 96).catch(() => {});
  },
  vol() {
    if (!this.active) return;
    const g = typeof PxBoost !== 'undefined' ? PxBoost.g || 1 : 1;
    this.cmd('volume', Math.round((this.v == null ? 1 : this.v) * g * 100)).catch(() => {});
    this.cmd('mute', this.m ? '1' : '0').catch(() => {});
  },
  picture() {
    if (!this.active) return;
    const a = P.aspect || 'fit';
    if (a === 'fill') { this.cmd('aspect', '-1').catch(() => {}); this.cmd('fill', '1').catch(() => {}); }
    else {
      this.cmd('fill', '0').catch(() => {});
      const st = $('#stage').getBoundingClientRect();
      this.cmd('aspect', a === 'fit' ? '-1' : a === 'stretch' ? (st.width / Math.max(1, st.height)).toFixed(3) : a).catch(() => {});
    }
    this.cmd('zoom', P.zoom || 1).catch(() => {});
    if (typeof PxPicture !== 'undefined') { const p = PxPicture.get(); this.cmd('eq', JSON.stringify({ brightness: p.b - 100, contrast: p.c - 100, saturation: p.s - 100 })).catch(() => {}); }
  },
  sound() { if (this.active && typeof SoundModes !== 'undefined') this.cmd('sound', { voices: 'voice', night: 'night' }[SoundModes.cur().k] || 'off').catch(() => {}); },
  /* ---- the <video> element answers from libmpv while a film plays natively ---- */
  attach() {
    if (this.active) return;
    this.active = true; this.v = video.volume; this.m = video.muted;
    const N = this, def = (k, get, set) => Object.defineProperty(video, k, { configurable: true, get, set: set || (() => {}) });
    def('currentTime', () => N.now(), (x) => { x = Number(x); if (!isFinite(x)) return; N.st.t = Math.max(0, x); N.tAt = 0; N.st.ended = false; N.cmd('seek', N.st.t).catch(() => {}); N.fire('seeking'); });
    def('duration', () => (N.st.dur > 0 ? N.st.dur : NaN));
    def('paused', () => N.st.paused !== false);
    def('ended', () => !!(N.lastEnd && N.lastEnd === N.gen));
    def('seeking', () => !!N.st.seeking);
    def('readyState', () => (N.metaFired ? (N.st.buffering ? 2 : 4) : 0));
    def('networkState', () => 2);
    def('videoWidth', () => Number(N.st.w) || 0);
    def('videoHeight', () => Number(N.st.h) || 0);
    def('volume', () => N.v, (x) => { x = Number(x); if (!(x >= 0 && x <= 1)) return; N.v = x; N.vol(); N.fire('volumechange'); });
    def('muted', () => N.m, (x) => { N.m = !!x; N.vol(); N.fire('volumechange'); });
    def('playbackRate', () => Number(N.st.speed) || 1, (x) => { x = Number(x); if (x > 0) { N.st.speed = x; N.cmd('speed', x).catch(() => {}); N.fire('ratechange'); } });
    def('defaultPlaybackRate', () => 1);
    def('currentSrc', () => (N.cur && N.cur.url) || '');
    def('src', () => (N.cur && N.cur.url) || '');
    def('error', () => N.err);
    def('audioTracks', () => N.audio || []);
    const ranges = (end) => ({ length: end > 0 ? 1 : 0, start: () => 0, end: () => end });
    def('buffered', () => ranges(Math.max(N.now(), Number(N.st.cached) > 0 ? N.now() + Number(N.st.cached) : 0)));
    def('seekable', () => ranges(N.st.dur || 0));
    video.play = () => { N.st.paused = false; N.tAt = performance.now(); N.cmd('play').catch(() => {}); N.fire('play'); return Promise.resolve(); };
    video.pause = () => { if (N.st.paused) return; N.st.t = N.now(); N.st.paused = true; N.cmd('pause').catch(() => {}); N.fire('pause'); };
    video.load = () => {};
    video.removeAttribute = function (a) { if (a !== 'src') HTMLMediaElement.prototype.removeAttribute.call(this, a); };
  },
  /* back to the web player's own element (teardown) */
  stop() {
    if (!this.active) return;
    this.subIds = []; this.cmd('stop').catch(() => {}); this.cmd('show', '0').catch(() => {});
    const v = this.v, m = this.m;
    ['currentTime', 'duration', 'paused', 'ended', 'seeking', 'readyState', 'networkState', 'videoWidth', 'videoHeight', 'volume', 'muted', 'playbackRate', 'defaultPlaybackRate', 'currentSrc', 'src', 'error', 'audioTracks', 'buffered', 'seekable', 'play', 'pause', 'load', 'removeAttribute'].forEach((k) => { try { delete video[k]; } catch (e) { /* ignore */ } });
    this.active = false; this.cur = null; this.st = {}; this.audio = null; this.gen = 0;
    try { video.volume = v; video.muted = m; } catch (e) { /* ignore */ }
    document.documentElement.classList.remove('mk-native-on');
    (this.under || []).forEach((el) => el.classList.remove('mk-nv-under')); this.under = null;
  },
  init() {
    const b = this.bridge(); if (!b) return;
    b._ev = (n) => this.ev(n);
    this.probe();
    const sec = typeof SECTIONS !== 'undefined' && SECTIONS.find((x) => x.id === 'playback');
    if (sec) {
      const rows = sec.rows;
      sec.rows = () => [...rows(), { key: 'nativePlayer', label: 'Native player', help: 'Films play in this app’s own video engine: every file type including MKV, HEVC, AV1, DTS and TrueHD, hardware decoding, HDR on HDR screens, and styled subtitles. Turn off to use the web player.', type: 'toggle', get: () => { const b = MkNative.bridge(); return b && b.droid ? CFG.nativePlayer === true : CFG.nativePlayer !== false; } }];
    }
  },
};
window.MkNative = MkNative; // the hooks in the base player look for window.MkNative
MkNative.init();