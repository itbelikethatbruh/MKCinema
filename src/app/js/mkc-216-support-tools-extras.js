
'use strict';
/* =====================================================================
   MKCinema 2.16.0 · support tools and extras
   - Log: a private ring of recent errors and playback events on this device (no links, keys or addresses)
   - Send log: uploads that log with the device and settings summary and gives back a 6-character code
   - Diagnostic: about a minute of checks (decoding, smoothness, speed, addons) that tunes this device
   - Skip: TheIntroDB intro/recap/credits times, and MKV chapters, next to AniSkip
   - Trailers: Apple's official trailer first for films, YouTube after
   - Artwork: a broken poster or backdrop tries other sources before the drawn placeholder
   - Anime: a section of its own, from the public Kitsu catalogs
   ===================================================================== */

/* ---------------- Log ---------------- */
const MKLog = {
  buf: [], key: 'mkc:log', saveT: 0,
  // the keys and passwords stored on this device, longest first, so a short key that isn't in a link is hidden too
  secrets() {
    if (this.secT && Date.now() - this.secT < 5000) return this.sec;
    const out = new Set(), walk = (o, d) => { if (o == null || d > 3) return; if (typeof o === 'string') { if (o.length >= 8) out.add(o); return; } if (typeof o === 'object') Object.values(o).forEach((v) => walk(v, d + 1)); };
    try { walk(Store.get('vault', {}), 0); walk(Store.get('keys', {}), 0); } catch (e) { /* storage blocked */ }
    try { Object.keys(CFG).forEach((k) => { if (/(Key|Token|Secret|Pass)$/.test(k)) walk(CFG[k], 0); }); } catch (e) { /* early */ }
    this.sec = [...out].sort((a, b) => b.length - a.length); this.secT = Date.now();
    return this.sec;
  },
  redact(s) {
    let t = String(s == null ? '' : s);
    for (const k of this.secrets()) if (t.includes(k)) t = t.split(k).join('[key]');
    return t
      .replace(/\bmagnet:\?\S+/gi, '[magnet]')
      .replace(/\b(?:https?|wss?):\/\/([^\/\s?#"'<>)]+)[^\s"'<>)]*/gi, (m, h) => `[${h.replace(/^[^@]*@/, '')}]`)
      .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]')
      .replace(/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}\b/g, '[…]')
      .replace(/\b[a-f0-9]{32,}\b/gi, '[…]');
  },
  str(x) {
    if (x instanceof Error) return `${x.name}: ${x.message}${x.stack ? ` | ${String(x.stack).split('\n').slice(1, 3).map((l) => l.trim()).join(' | ')}` : ''}`;
    if (x && typeof x === 'object') { try { return JSON.stringify(x).slice(0, 400); } catch (e) { return String(x); } }
    return String(x);
  },
  add(level, msg) {
    const m = this.redact(msg).slice(0, 500); const last = this.buf[this.buf.length - 1];
    if (last && last.m === m && last.l === level) { last.n = (last.n || 1) + 1; return; }
    this.buf.push({ t: Date.now(), l: level, m }); if (this.buf.length > 400) this.buf.splice(0, this.buf.length - 400);
    clearTimeout(this.saveT); this.saveT = setTimeout(() => { try { localStorage.setItem(this.key, JSON.stringify(this.buf.slice(-200))); } catch (e) { /* full */ } }, 1500);
  },
  init() {
    try { const old = JSON.parse(localStorage.getItem(this.key) || '[]'); if (Array.isArray(old)) this.buf = old.slice(-200).map((e) => ({ ...e, prev: 1 })); } catch (e) { /* none */ }
    this.add('info', `start ${APP_VERSION} · ${PLATFORM}${IS_TV ? ' · TV' : ''}`);
    ['error', 'warn'].forEach((lvl) => { const o = console[lvl]; console[lvl] = function (...a) { try { MKLog.add(lvl, a.map((x) => MKLog.str(x)).join(' ')); } catch (e) { /* never break logging */ } return o.apply(this, a); }; });
    addEventListener('error', (e) => { if (e.target && e.target !== window) return; this.add('error', `${e.message || 'error'} @${String(e.filename || '').split('/').pop()}:${e.lineno || 0}`); });
    addEventListener('unhandledrejection', (e) => this.add('error', `promise: ${this.str(e.reason)}`));
    const t0 = toast; toast = function (msg, kind) { if (kind === 'err') MKLog.add('toast', msg); return t0.apply(this, arguments); };
    const pf = playbackFailed; playbackFailed = function (stream, reason) { MKLog.add('play', `failed: ${reason} · ${MKLog.describe(stream)}`); return pf.apply(this, arguments); };
    const ps = playStream; playStream = function (ctx, stream) { try { MKLog.add('play', `${ctx && ctx.meta ? `${ctx.meta.type} ${ctx.meta.id}${ctx.video ? ` S${ctx.video.season}E${ctx.video.episode}` : ''}` : ''} · ${MKLog.describe(stream)}`); } catch (e) { /* ignore */ } return ps.apply(this, arguments); };
    video.addEventListener('error', () => { const er = video.error; if (er) this.add('play', `video error ${er.code}${er.message ? `: ${er.message}` : ''}`); });
    let stallT = 0; video.addEventListener('waiting', () => { clearTimeout(stallT); stallT = setTimeout(() => { if (!video.paused && video.readyState < 3) this.add('play', `buffering for 8 s at ${Math.round(video.currentTime)} s`); }, 8000); });
    video.addEventListener('playing', () => clearTimeout(stallT));
  },
  describe(s) {
    if (!s) return 'no stream'; const t = s._tel || {};
    return [s._addon, t.res, t.kind, t.mkv ? 'mkv' : '', /\.m3u8(\?|$)/i.test(s.url || '') ? 'hls' : '', t.hdr, t.cached === false ? 'not cached' : '', s._local ? 'local file' : '', s.url ? `host ${(String(s.url).match(/^https?:\/\/([^/?#]+)/i) || [])[1] || '?'}` : ''].filter(Boolean).join(' · ');
  },
  text(n = 120) { return this.buf.slice(-n).map((e) => `${new Date(e.t).toISOString().slice(5, 19).replace('T', ' ')} ${e.prev ? '(earlier) ' : ''}${e.l}: ${e.m}${e.n > 1 ? ` ×${e.n}` : ''}`).join('\n'); },
};
MKLog.init();

/* ---------------- Device summary (no keys, links or personal data) ---------------- */
const DeviceInfo = {
  native() {
    try { if (window.MKAndroid && typeof MKAndroid.version === 'function') return `${IS_TV ? 'TV' : 'Android'} app ${MKAndroid.version()}`; } catch (e) { /* old app */ }
    try { if (window.MKDesktop) return `${MKDesktop.platform || 'desktop'} app ${MKDesktop.version || ''}`.trim(); } catch (e) { /* none */ }
    return matchMedia('(display-mode: standalone)').matches ? 'installed web app' : 'browser';
  },
  gpu() {
    try { const c = document.createElement('canvas').getContext('webgl'); const x = c && c.getExtension('WEBGL_debug_renderer_info'); return x ? String(c.getParameter(x.UNMASKED_RENDERER_WEBGL)).slice(0, 120) : ''; } catch (e) { return ''; }
  },
  get() {
    const cn = navigator.connection || {};
    return {
      app: APP_VERSION, shell: this.native(), platform: PLATFORM, tv: IS_TV, touch: TOUCH_UI, ua: navigator.userAgent,
      screen: `${screen.width}x${screen.height} @${devicePixelRatio}`, window: `${innerWidth}x${innerHeight}`,
      memoryGB: navigator.deviceMemory || null, cores: navigator.hardwareConcurrency || null, gpu: this.gpu(), language: navigator.language,
      network: cn.effectiveType ? { type: cn.type || '', effective: cn.effectiveType, downlink: cn.downlink, rtt: cn.rtt, saveData: !!cn.saveData } : null,
      online: navigator.onLine, signedIn: !!(typeof Account !== 'undefined' && Account.user), uiLang: CFG.uiLang || 'auto',
    };
  },
  settings() {
    const c = {};
    for (const [k, v] of Object.entries(CFG)) {
      if (/key|token|secret|pass|pin|css|party|atelier|keymap|name|email|url|proxy/i.test(k)) continue;
      if (typeof v === 'string' && v.length > 60) continue;
      c[k] = v;
    }
    return c;
  },
  addons() {
    try {
      return engine.addons.map((a) => ({ name: (a.manifest && a.manifest.name) || '?', host: a.virtual ? 'in-app' : ((String(a.baseUrl).match(/^https?:\/\/([^/?#]+)/i) || [])[1] || '?').replace(/^[^@]*@/, ''), on: !!a.enabled, error: a.error ? MKLog.redact(a.error).slice(0, 120) : undefined, builtin: !!a.builtin }));
    } catch (e) { return []; }
  },
  debrid() { try { return typeof Vault !== 'undefined' && Vault.service() ? ({ ad: 'AllDebrid', pm: 'Premiumize', rd: 'Real-Debrid', tb: 'TorBox' }[Vault.service()] || 'yes') : 'none'; } catch (e) { return '?'; } },
};

/* ---------------- Send log ---------------- */
const SendLog = {
  ALPH: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  ISSUES: 'https://github.com/itbelikethatbruh/MKCinema/issues/new',
  code() { const a = new Uint8Array(6); crypto.getRandomValues(a); return Array.from(a, (b) => this.ALPH[b % 32]).join(''); },
  payload(note) {
    let diag = null; try { diag = JSON.parse(localStorage.getItem('mkc:diag') || 'null'); } catch (e) { /* none */ }
    const p = P.stream ? { open: !$('#player').hidden, stream: MKLog.describe(P.stream), t: Math.round(video.currentTime || 0), d: Math.round(video.duration || 0), readyState: video.readyState, error: video.error ? video.error.code : null, subtitles: P.curSub >= 0 && P.subs[P.curSub] ? `${P.subs[P.curSub].kind} ${langName(P.subs[P.curSub].lang)}${AssR.on() ? ' styled' : ''}` : 'off', skip: Skip.m ? Skip.m.src || 'yes' : 'none' } : null;
    return {
      note: MKLog.redact(String(note || '').slice(0, 1000)), device: DeviceInfo.get(), settings: DeviceInfo.settings(), addons: DeviceInfo.addons(), debrid: DeviceInfo.debrid(),
      player: p, view: S.view, diagnostic: diag, speed: typeof LineCheck !== 'undefined' && LineCheck.last ? { mbps: Math.round(LineCheck.last.mbps), q: LineCheck.last.q } : null,
      log: MKLog.buf.slice(-250),
    };
  },
  async send(note) {
    // the table allows 200,000 bytes of payload, so measure UTF-8 bytes and keep trimming until it fits
    let body = this.payload(note); const bytes = (o) => new TextEncoder().encode(JSON.stringify(o)).length;
    const tiny = () => ({ note: body.note, device: body.device, view: body.view, trimmed: true });
    while (bytes(body) > 190000 && body.log.length) body.log = body.log.length > 3 ? body.log.slice(Math.floor(body.log.length / 3)) : [];
    if (bytes(body) > 190000) body.diagnostic = null;
    if (bytes(body) > 190000) body = tiny();
    for (let i = 0; i < 4; i++) {
      const code = this.code();
      const r = await fetch(`${SUPABASE_PROJECT.url}/rest/v1/mkcinema_logs`, {
        method: 'POST', headers: { apikey: SUPABASE_PROJECT.anonKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ code, app_version: APP_VERSION, platform: `${PLATFORM}${IS_TV ? '-tv' : ''}`.slice(0, 32), payload: body }),
      });
      if (r.ok) { try { localStorage.setItem('mkc:lastLog', JSON.stringify({ code, at: Date.now() })); } catch (e) { /* ignore */ } MKLog.add('info', `log sent as ${code}`); return code; }
      if (r.status === 400 && !body.trimmed) { body = tiny(); continue; }
      if (r.status === 429) throw Object.assign(new Error('busy'), { busy: true }); // insert limit
      if (r.status !== 409) throw new Error(`the log server answered ${r.status}`);
    }
    throw new Error('no free code, try again');
  },
  last() { try { return JSON.parse(localStorage.getItem('mkc:lastLog') || 'null'); } catch (e) { return null; } },
  issueUrl(code) {
    const plat = IS_TV ? (/Web0S|webOS/i.test(navigator.userAgent) ? 'LG webOS app' : window.MKCinemaTizenBrew || /Tizen/i.test(navigator.userAgent) ? `Samsung TV (TizenBrew${window.MKCinemaTizenBrew ? ` module ${String(window.MKCinemaTizenBrew).slice(0, 12)}` : ''})` : 'Android TV or Fire TV app') : window.MKAndroid ? 'Android app' : window.MKDesktop ? ({ windows: 'Windows app', mac: 'Mac app', linux: 'Linux app' }[MKDesktop.platform] || 'Web (browser)') : 'Web (browser)';
    return `${this.ISSUES}?template=bug_report.yml&labels=bug&log_code=${encodeURIComponent(code || '')}&version=${encodeURIComponent(APP_VERSION)}&platform=${encodeURIComponent(plat)}`;
  },
  open() {
    const el = X8.layer('logLayer', { label: 'Send log', icon: 'send', eyebrow: 'Help' }); const b = X8.body('logLayer');
    const last = this.last();
    b.innerHTML = `<h3 class="x8-h">Send a log to the developer</h3>
      <p class="sub">It holds the app version, this device, your settings and the last few minutes of errors and playback events. Never any keys, passwords, addon links or stream links. You get a short code to quote in a bug report.</p>
      ${IS_TV ? '' : '<label class="lg-note">What went wrong? (optional)<textarea class="inp" id="lgNote" rows="3" maxlength="1000" placeholder="For example: Attack on Titan S1E3 stops after 10 minutes"></textarea></label>'}
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="lgSend"><i data-lucide="send"></i>Send log</button>${last ? `<span class="lg-last">Last code: <b class="mono">${esc(last.code)}</b></span>` : ''}</div>
      <div id="lgOut" hidden></div>`;
    icons(); X8.open('logLayer');
    $('#lgSend').onclick = async () => {
      const btn = $('#lgSend'); btn.disabled = true; btn.lastChild.textContent = 'Sending…';
      try {
        const code = await this.send(($('#lgNote') || {}).value || '');
        const out = $('#lgOut'); out.hidden = false;
        out.innerHTML = `<div class="lg-code" aria-label="Your log code">${code.split('').map((c) => `<span>${c}</span>`).join('')}</div>
          <p class="sub">Quote this code when you report the problem. Only the developer can open the log.</p>
          <div class="actions"><button class="btn btn-ghost" type="button" data-nav id="lgCopy"><i data-lucide="copy"></i>Copy code</button>${IS_TV ? '' : `<a class="btn btn-prime" data-nav href="${esc(this.issueUrl(code))}" target="_blank" rel="noopener"><i data-lucide="bug"></i>Report on GitHub</a>`}</div>
          ${IS_TV ? `<p class="sub">On your phone, open <b>github.com/itbelikethatbruh/MKCinema/issues</b> and give this code.</p>` : ''}`;
        icons(); $('#lgCopy').onclick = () => copyText(code); btn.hidden = true; if (IS_TV) Nav.focus($('#lgCopy'));
      } catch (e) {
        toast(e.busy ? 'Too many logs were sent just now. Try again in a few minutes.' : `The log was not sent (${e.message}). Check the connection and try again.`, 'err', 6000);
        btn.disabled = false; btn.lastChild.textContent = 'Send log';
      }
    };
    if (IS_TV) setTimeout(() => Nav.focus($('#lgSend')), 60);
    return el;
  },
};

/* ---------------- Device tuning (kept on this device even when settings sync) ---------------- */
const DevTune = {
  KEYS: ['maxQuality', 'quality', 'assMode', 'ambilight', 'tvPlayer'],
  get() { try { return JSON.parse(localStorage.getItem('mkc:tune') || '{}') || {}; } catch (e) { return {}; } },
  put(t) { try { localStorage.setItem('mkc:tune', JSON.stringify(t)); } catch (e) { /* blocked */ } },
  apply() {
    const t = this.get(); let ch = false;
    for (const k of this.KEYS) if (k in t && CFG[k] !== t[k]) { CFG[k] = t[k]; ch = true; }
    if (ch) { if ('quality' in t) { CFG.qualityChosen = true; applyPreset(CFG.quality); } saveCfg(); }
    return ch;
  },
  init() {
    if (this.apply()) try { applyAll(); } catch (e) { /* early */ }
    const aa = applyAll; applyAll = function () { DevTune.apply(); return aa.apply(this, arguments); };
    // changing one of these by hand on this device keeps that choice here
    CFG_HOOKS.push((k, v) => { const t = this.get(); if (k in t) { t[k] = v; this.put(t); } });
  },
};
DevTune.init();

/* ---------------- Diagnostic ---------------- */
const Diagnostic = {
  busy: false,
  async codecs() {
    const mc = navigator.mediaCapabilities, out = {};
    const V = {
      h264: ['video/mp4; codecs="avc1.640028"', 1920, 1080, 8e6],
      hevc: ['video/mp4; codecs="hvc1.1.6.L120.90"', 1920, 1080, 8e6],
      hevc4k: ['video/mp4; codecs="hvc1.2.4.L153.B0"', 3840, 2160, 25e6, true],
      av1_4k: ['video/mp4; codecs="av01.0.12M.10"', 3840, 2160, 20e6, true],
      vp9_4k: ['video/webm; codecs="vp09.02.51.10"', 3840, 2160, 20e6, true],
      dolbyVision: ['video/mp4; codecs="dvh1.05.06"', 3840, 2160, 25e6, true],
    };
    for (const [k, [ct, w, h, br, hdr]] of Object.entries(V)) {
      try {
        if (!mc || !mc.decodingInfo) { out[k] = { ok: !!(window.MediaSource && MediaSource.isTypeSupported(ct)) }; continue; }
        const r = await mc.decodingInfo({ type: 'media-source', video: { contentType: ct, width: w, height: h, bitrate: br, framerate: 24, ...(hdr ? { transferFunction: 'pq', colorGamut: 'rec2020' } : {}) } });
        out[k] = { ok: !!r.supported, smooth: !!r.smooth, efficient: !!r.powerEfficient };
      } catch (e) { out[k] = { ok: false }; }
    }
    const v = document.createElement('video'), can = (t) => v.canPlayType(t) || (window.MediaSource && MediaSource.isTypeSupported(t) ? 'probably' : '');
    out.audio = { aac: !!can('audio/mp4; codecs="mp4a.40.2"'), ac3: !!can('audio/mp4; codecs="ac-3"'), eac3: !!can('audio/mp4; codecs="ec-3"'), dts: !!can('audio/mp4; codecs="dtsc"'), opus: !!can('audio/webm; codecs="opus"'), flac: !!can('audio/flac') };
    out.mkv = !!(v.canPlayType('video/x-matroska') || v.canPlayType('video/x-matroska; codecs="avc1.640028"'));
    out.hdrScreen = matchMedia('(dynamic-range: high)').matches;
    return out;
  },
  frames(ms = 2500) {
    return new Promise((res) => {
      const d = []; let last = 0; const end = performance.now() + ms;
      const f = (t) => { if (last) d.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else { const avg = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length); res({ fps: Math.round(1000 / avg), long: Math.round(d.filter((x) => x > 34).length / Math.max(1, d.length) * 100) }); } };
      requestAnimationFrame(f);
    });
  },
  async speed() {
    const piece = 8e6, n = 4, start = performance.now(); let bytes = 0;
    await Promise.all(Array.from({ length: n }, async (_, i) => {
      const r = await fetch(`https://speed.cloudflare.com/__down?bytes=${piece}&r=${Date.now()}${i}`, { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; bytes += value.length; if (performance.now() - start > 9000) { rd.cancel(); break; } }
    }));
    const mbps = (bytes * 8) / ((performance.now() - start) / 1000) / 1e6;
    const q = mbps >= 45 ? '4k' : mbps >= 15 ? '1080' : '720';
    if (typeof LineCheck !== 'undefined') LineCheck.last = { mbps, q, at: Date.now() };
    let ping = null;
    try { const t = []; for (let i = 0; i < 3; i++) { const s = performance.now(); await fetch(`https://speed.cloudflare.com/__down?bytes=0&r=${Math.random()}`, { cache: 'no-store' }); t.push(performance.now() - s); } ping = Math.round(Math.min(...t)); } catch (e) { /* skip */ }
    return { mbps: Math.round(mbps), q, ping };
  },
  async addons() {
    const list = engine.addons.filter((a) => a.enabled && !a.virtual);
    return Promise.all(list.map(async (a) => {
      const s = performance.now(), ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
      try { const r = await fetch(`${a.baseUrl}/manifest.json`, { signal: ctl.signal, cache: 'no-store' }); return { name: a.manifest.name, ms: Math.round(performance.now() - s), ok: r.ok }; }
      catch (e) { return { name: a.manifest.name, ms: null, ok: false }; } finally { clearTimeout(t); }
    }));
  },
  recommend(r) {
    const out = [], add = (key, value, label, why, on = true) => { if (CFG[key] !== value && !(key === 'tvPlayer' && (CFG.tvPlayer || 'native') === value)) out.push({ key, value, label, why, on }); };
    const c = r.codecs || {}, sp = r.speed, fr = r.frames || {};
    const can4k = (c.hevc4k && c.hevc4k.smooth) || (c.av1_4k && c.av1_4k.smooth) || (c.vp9_4k && c.vp9_4k.smooth);
    let q = sp ? sp.q : CFG.maxQuality;
    if (q === '4k' && !can4k && !(IS_TV && TvPlayer.on())) q = '1080';
    if (q === '4k' && !IS_TV && Math.max(screen.width, screen.height) * devicePixelRatio < 2500) q = '1080';
    const ql = { '4k': '4K', 1080: '1080p', 720: '720p' }[q];
    add('maxQuality', q, `Highest quality: ${ql}`, `${sp ? `Your line measured ${sp.mbps} Mbps. ` : ''}${!can4k ? 'This device has no smooth 4K decoder. ' : ''}${q === '1080' && can4k && !IS_TV ? 'Your screen is not 4K, so 4K only costs bandwidth.' : ''}`.trim());
    const weak = fr.fps && (fr.fps < 45 || fr.long > 12), mid = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
    const g = weak ? 'low' : mid ? 'balanced' : 'high';
    if (PRESET_ORDER.indexOf(g) > PRESET_ORDER.indexOf(CFG.quality === 'custom' ? 'high' : CFG.quality)) add('quality', g, `Effects: ${PRESETS[g].label}`, weak ? `The interface ran at ${fr.fps} fps with ${fr.long}% slow frames.` : 'This device has few processor cores or little memory.');
    const ass = weak || IS_TV || mid ? 'lite' : 'full';
    if ((CFG.assMode || 'auto') !== ass) add('assMode', ass, `Styled subtitles: ${ass === 'lite' ? 'Light' : 'Full'}`, ass === 'lite' ? 'Anime subtitles keep their fonts, colours and positions, without the heaviest blur effects, so playback stays smooth.' : 'This device can draw every subtitle effect.');
    if (!IS_TV && !TOUCH_UI && weak && CFG.ambilight) add('ambilight', false, 'Ambilight: off', 'It redraws the picture around the player and costs frames on this device.');
    if (IS_TV && TvPlayer.on && (() => { try { return !!(window.MKAndroid && typeof MKAndroid.play === 'function'); } catch (e) { return false; } })()) {
      const webHevc = c.hevc && c.hevc.ok;
      if (!webHevc && CFG.tvPlayer === 'web') add('tvPlayer', 'native', 'TV player: the TV’s own player', 'The in-app player here cannot decode HEVC (x265), which most 4K and anime releases use.');
    }
    return out;
  },
  open() {
    X8.layer('diagLayer', { label: 'Diagnostic', icon: 'activity', eyebrow: 'Help', wide: true });
    const b = X8.body('diagLayer'), last = this.saved();
    b.innerHTML = `<h3 class="x8-h">Diagnostic</h3><p class="sub">About a minute of checks on this ${IS_TV ? 'TV' : 'device'}: which video it can decode, how smooth the interface runs, your connection speed and your addons. Then it suggests settings for this ${IS_TV ? 'TV' : 'device'} only. Nothing changes until you press Apply.</p>
      <div id="dgBody">${last ? this.report(last, true) : ''}</div>
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="dgRun"><i data-lucide="activity"></i>${last ? 'Run again' : 'Start'}</button></div>`;
    icons(); X8.open('diagLayer'); $('#dgRun').onclick = () => this.run();
    if (IS_TV) setTimeout(() => Nav.focus($('#dgRun')), 60);
  },
  saved() { try { return JSON.parse(localStorage.getItem('mkc:diag') || 'null'); } catch (e) { return null; } },
  async run() {
    if (this.busy) return; this.busy = true;
    const body = $('#dgBody'), btn = $('#dgRun'); if (btn) btn.hidden = true;
    const steps = [['codecs', 'Video and sound decoders'], ['frames', 'Interface smoothness'], ['speed', 'Connection speed'], ['addons', 'Your addons']];
    body.innerHTML = `<ol class="dg-steps">${steps.map(([k, l]) => `<li data-dg="${k}"><i class="dg-dot"></i>${esc(l)}<small></small></li>`).join('')}</ol>`;
    const r = { at: Date.now(), app: APP_VERSION, device: DeviceInfo.get() };
    for (const [k] of steps) {
      const li = $(`[data-dg="${k}"]`, body); li.classList.add('on');
      try { r[k] = await this[k](); li.classList.add('ok'); $('small', li).textContent = this.short(k, r[k]); }
      catch (e) { r[k] = null; li.classList.add('bad'); $('small', li).textContent = e.message || 'did not finish'; }
      li.classList.remove('on');
    }
    r.recommend = this.recommend(r);
    try { localStorage.setItem('mkc:diag', JSON.stringify(r)); } catch (e) { /* full */ }
    MKLog.add('info', `diagnostic: ${Object.entries({ fps: r.frames && r.frames.fps, mbps: r.speed && r.speed.mbps, hevc: r.codecs && r.codecs.hevc && r.codecs.hevc.ok, hevc4k: r.codecs && r.codecs.hevc4k && r.codecs.hevc4k.smooth }).map(([a, v]) => `${a}=${v}`).join(' ')}`);
    body.innerHTML = this.report(r, false); icons(); this.bindReport(r);
    if (btn) { btn.hidden = false; btn.lastChild.textContent = 'Run again'; }
    this.busy = false;
  },
  short(k, v) {
    if (!v) return '';
    if (k === 'codecs') return ['h264', 'hevc', 'av1_4k', 'dolbyVision'].filter((x) => v[x] && v[x].ok).map((x) => ({ h264: 'H.264', hevc: 'HEVC', av1_4k: 'AV1', dolbyVision: 'Dolby Vision' }[x])).join(' · ') || 'basic only';
    if (k === 'frames') return `${v.fps} fps · ${v.long}% slow frames`;
    if (k === 'speed') return `${v.mbps} Mbps${v.ping != null ? ` · ${v.ping} ms` : ''}`;
    if (k === 'addons') return `${v.filter((a) => a.ok).length} of ${v.length} answer`;
    return '';
  },
  report(r, old) {
    const c = r.codecs || {}, yes = (x) => (x && x.ok ? (x.smooth === false ? 'yes, not smooth' : 'yes') : 'no');
    const rows = [
      ['H.264 1080p', yes(c.h264)], ['HEVC (x265) 1080p', yes(c.hevc)], ['HEVC 4K HDR', yes(c.hevc4k)], ['AV1 4K', yes(c.av1_4k)], ['Dolby Vision', yes(c.dolbyVision)],
      ['Surround sound (AC-3 / E-AC-3)', c.audio ? `${c.audio.ac3 ? 'AC-3' : ''}${c.audio.ac3 && c.audio.eac3 ? ' · ' : ''}${c.audio.eac3 ? 'E-AC-3' : ''}` || 'no' : '?'], ['MKV files', c.mkv ? 'yes' : 'no'],
      ['Interface', r.frames ? `${r.frames.fps} fps, ${r.frames.long}% slow frames` : '?'], ['Connection', r.speed ? `${r.speed.mbps} Mbps${r.speed.ping != null ? `, ${r.speed.ping} ms` : ''}` : '?'],
    ];
    const slow = (r.addons || []).filter((a) => !a.ok || a.ms > 3000);
    const rec = old ? [] : r.recommend || [];
    return `${old ? `<p class="sub">Last run ${esc(new Date(r.at).toLocaleString())}.</p>` : ''}
      <div class="dg-grid">${rows.map(([a, v]) => `<div><span>${esc(a)}</span><b class="${/^no|not smooth/.test(v) ? 'dg-no' : ''}">${esc(v)}</b></div>`).join('')}</div>
      ${slow.length ? `<p class="dg-warn"><b>Slow or unreachable addons:</b> ${slow.map((a) => esc(`${a.name}${a.ms ? ` (${(a.ms / 1000).toFixed(1)} s)` : ''}`)).join(', ')}. They slow down every source list; consider removing them in Addons.</p>` : ''}
      ${c.hevc && !c.hevc.ok && !IS_TV ? `<p class="dg-warn">This ${TOUCH_UI ? 'device' : 'browser'} cannot decode HEVC (x265). Those sources play in VLC (Settings › Playback › Play streams in), or turn on Only sources that play here to hide them.</p>` : ''}
      ${old ? '' : rec.length ? `<h4 class="dg-h">Suggested for this ${IS_TV ? 'TV' : 'device'}</h4><div class="dg-rec">${rec.map((x, i) => `<button type="button" class="dg-opt on" data-nav data-rec="${i}" role="switch" aria-checked="true"><i class="dg-box"></i><span><b>${esc(x.label)}</b><small>${esc(x.why)}</small></span></button>`).join('')}</div>
        <div class="actions"><button class="btn btn-prime" type="button" data-nav id="dgApply"><i data-lucide="check"></i>Apply to this ${IS_TV ? 'TV' : 'device'}</button></div>` : '<p class="dg-ok"><i data-lucide="check-circle-2"></i>Your settings already suit this device.</p>'}`;
  },
  bindReport(r) {
    $$('[data-rec]').forEach((b) => b.addEventListener('click', () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }));
    const ap = $('#dgApply'); if (!ap) return;
    ap.onclick = () => {
      const t = DevTune.get(); let n = 0;
      (r.recommend || []).forEach((x, i) => { const b = $(`[data-rec="${i}"]`); if (!b || !b.classList.contains('on')) return; t[x.key] = x.value; n++; });
      DevTune.put(t); DevTune.apply(); applyAll();
      toast(n ? `${n} setting${n > 1 ? 's' : ''} tuned for this ${IS_TV ? 'TV' : 'device'}` : 'Nothing changed', 'ok');
      MKLog.add('info', `diagnostic applied: ${JSON.stringify(t)}`); X8.close('diagLayer');
    };
    if (IS_TV) setTimeout(() => Nav.focus($('[data-rec]') || ap), 60);
  },
};

/* ---------------- Skip: TheIntroDB, MKV chapters, recaps ---------------- */
const Marks = {
  ch: null, idb: null, tok: -1,
  reset() { this.ch = null; this.idb = null; this.tok = Skip.token; },
  live() { if (this.tok !== Skip.token) this.reset(); return this; },
  fromChapters(list) {
    const m = {};
    for (const c of list) {
      const n = c.name.toLowerCase().trim();
      if (!m.intro && /^(op|opening|intro|introduction)\b|\bopening( credits| song| theme)?\b|\bop\s*\d*$|^intro$|オープニング/.test(n)) m.intro = [c.s, c.e];
      else if (!m.recap && /\b(recap|previously)\b|あらすじ/.test(n)) m.recap = [c.s, c.e];
      else if (!m.credits && /^(ed|ending|outro)\b|\bend(ing)? credits\b|^credits$|\bending( song| theme)?\b|エンディング/.test(n)) m.credits = c.s;
    }
    if (!m.intro && !m.credits && !m.recap) return;
    this.live().ch = m; MKLog.add('info', `skip markers from chapters: ${Object.keys(m).join(', ')}`);
    try { AniSkip.marks(); } catch (e) { /* older build */ }
  },
  view(raw) {
    if (this.tok !== Skip.token) return raw;
    const ch = this.ch, idb = this.idb; if (!ch && !idb) return raw;
    const r = raw || {}, ani = /AniSkip/.test(r.src || ''), m = { ...r };
    const take = (src, name) => { if (!src) return; for (const k of ['intro', 'recap', 'credits', 'ed']) if (src[k] != null && (name === 'chapters' || m[k] == null || !ani)) m[k] = src[k]; m.src = name === 'chapters' || !ani ? name : m.src; };
    if (idb && !ani) take(idb, 'TheIntroDB'); else if (idb) { if (m.recap == null && idb.recap) m.recap = idb.recap; if (m.credits == null && idb.credits) m.credits = idb.credits; }
    take(ch, 'chapters');
    return m;
  },
  cache: new Map(),
  async introdb(ctx) {
    if (CFG.introDb === false || !ctx || !ctx.meta) return null;
    const meta = ctx.meta, v = ctx.video;
    let imdb = String((v && v.id) || meta.id || '').split(':')[0], season = v && Number(v.season), ep = v && Number(v.episode);
    if (!/^tt\d+$/.test(imdb)) { imdb = (v && v.imdb_id) || meta.imdb_id || ''; if (v) { season = Number(v.imdbSeason); ep = Number(v.imdbEpisode); } }
    if (!/^tt\d+$/.test(imdb) || (v && !(season >= 0 && ep > 0))) return null;
    const q = `imdb_id=${imdb}${v ? `&season=${season}&episode=${ep}` : ''}`;
    if (this.cache.has(q)) return this.cache.get(q);
    const p = (async () => {
      const r = await fetch(`https://api.theintrodb.org/v2/media?${q}`); if (!r.ok) return null;
      const j = await r.json(), seg = (k) => (Array.isArray(j[k]) ? j[k][0] : j[k]) || null, m = {};
      const i = seg('intro'), rc = seg('recap'), cr = seg('credits');
      if (i && i.end_ms) m.intro = [(i.start_ms || 0) / 1000, i.end_ms / 1000];
      if (rc && rc.end_ms) m.recap = [(rc.start_ms || 0) / 1000, rc.end_ms / 1000];
      if (cr && cr.start_ms) m.credits = cr.start_ms / 1000;
      return Object.keys(m).length ? m : null;
    })().catch(() => null);
    this.cache.set(q, p); return p;
  },
  init() {
    let raw = Skip.m;
    Object.defineProperty(Skip, 'm', { configurable: true, get() { return Marks.view(raw); }, set(v) { raw = v; } });
    const ld = Skip.load.bind(Skip);
    Skip.load = function (ctx) {
      const r = ld(ctx); const tok = Skip.token; Marks.reset();
      Marks.introdb(ctx).then((m) => { if (m && tok === Skip.token) { Marks.live().idb = m; try { AniSkip.marks(); } catch (e) { /* older */ } } });
      return r;
    };
    // the button also skips recaps, and says which one it skips
    Skip.cur = null; Skip.usedK = {};
    const rs = Skip.reset.bind(Skip); Skip.reset = function () { this.cur = null; this.usedK = {}; return rs(); };
    Skip.tick = function (t) {
      const m = this.m;
      if (!CFG.skipIntro || !m || P.locked) { this.hide(); return; }
      // AniSkip's ending too ("Skip ending"), unless it runs into the last 20 s, where Up next takes over
      const d = video.duration;
      const seg = ['recap', 'intro', 'ed'].map((k) => (Array.isArray(m[k]) && (k !== 'ed' || (d && m[k][1] < d - 20)) ? { k, s: m[k][0], e: m[k][1] } : null)).find((x) => x && t >= x.s && t < x.e - 1);
      if (!seg) { this.hide(); this.shownAt = 0; this.cur = null; return; }
      if (this.cur !== seg.k) { this.cur = seg.k; this.shownAt = 0; const sp = $('#skipBtn span'); if (sp) sp.textContent = { recap: 'Skip recap', intro: 'Skip intro', ed: 'Skip ending' }[seg.k]; }
      if (CFG.autoSkipIntro && seg.k !== 'ed' && !this.usedK[seg.k]) { this.usedK[seg.k] = true; this.go(true); return; }
      if (!this.shownAt) { this.shownAt = performance.now(); $('#skipBtn').hidden = false; $('#skipBtn').classList.remove('out'); }
      else if (performance.now() - this.shownAt > 8000) this.hide();
    };
    Skip.go = function (auto) {
      const m = this.m, k = this.cur || 'intro'; if (!m || !m[k]) return;
      pSeek(m[k][1], { user: false }); this.hide(); this.shownAt = performance.now() + 1e9;
      toast(`${{ recap: 'Recap', ed: 'Ending' }[k] || 'Intro'} skipped${auto ? ' automatically' : ''}`, 'info', 1400);
    };
  },
};
Marks.init();

/* ---------------- Apple TV trailers (official, before YouTube) ---------------- */
const AppleTrailer = {
  mem: new Map(),
  norm: (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ''),
  cache() { try { return JSON.parse(localStorage.getItem('mkc:apl') || '{}'); } catch (e) { return {}; } },
  async find(meta) {
    if (!meta || meta.type !== 'movie' || !meta.name) return null;
    const c = this.cache(), hit = c[meta.id];
    if (hit && Date.now() - hit.at < (hit.u ? 7 : 2) * 864e5) return hit.u ? hit : null;
    if (this.mem.has(meta.id)) return this.mem.get(meta.id);
    const p = (async () => {
      const y = parseInt(yearOf(meta), 10), cc = (() => { try { return WhereToWatch.region().toLowerCase(); } catch (e) { return 'us'; } })();
      const r = await fetch(`https://itunes.apple.com/search?media=movie&entity=movie&limit=12&country=${encodeURIComponent(cc)}&term=${encodeURIComponent(meta.name)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(), want = this.norm(meta.name);
      const m = (j.results || []).filter((x) => x.previewUrl && this.norm(x.trackName) === want && (!y || !x.releaseDate || Math.abs(new Date(x.releaseDate).getFullYear() - y) <= 1))[0];
      const out = m ? { u: m.previewUrl.replace(/^http:(?=\/\/[^/]*apple\.com)/, 'https:'), page: m.trackViewUrl || '', at: Date.now() } : { u: '', at: Date.now() };
      const all = this.cache(); all[meta.id] = out; const keys = Object.keys(all); if (keys.length > 300) keys.slice(0, keys.length - 300).forEach((k) => delete all[k]);
      try { localStorage.setItem('mkc:apl', JSON.stringify(all)); } catch (e) { /* full */ }
      return out.u ? out : null;
    })().catch((e) => { MKLog.add('info', `Apple trailer lookup: ${e.message}`); return null; });
    this.mem.set(meta.id, p); return p;
  },
  play(hit, meta, fallback) {
    closeTrailer(true); TR.id = `apple:${hit.u}`; openLayer('trailer'); trMsg('');
    clearTimeout(TR.hideT); TR.hideT = setTimeout(() => { if (!$('#trailer').hidden) document.body.classList.add('tr-on'); }, 300);
    $('#trSlot').innerHTML = `<video class="apl-v" playsinline autoplay preload="auto" src="${esc(hit.u)}"></video>${hit.page ? `<a class="apl-src" href="${esc(safeHref(hit.page) || '#')}" target="_blank" rel="noopener" data-nav>Trailer · Apple TV</a>` : '<span class="apl-src">Trailer · Apple TV</span>'}`;
    const v = $('#trSlot video');
    TR.yt = {
      getDuration: () => (isFinite(v.duration) ? v.duration : 0), getCurrentTime: () => v.currentTime || 0,
      getPlayerState: () => (v.ended ? 0 : v.paused ? 2 : v.readyState < 3 ? 3 : 1),
      playVideo: () => v.play().catch(() => {}), pauseVideo: () => v.pause(), seekTo: (t) => { v.currentTime = t; },
      isMuted: () => v.muted, mute: () => { v.muted = true; }, unMute: () => { v.muted = false; },
      destroy: () => { v.pause(); v.removeAttribute('src'); try { v.load(); } catch (e) { /* gone */ } },
    };
    let started = false;
    v.addEventListener('playing', () => { started = true; }, { once: true });
    v.addEventListener('ended', () => closeTrailer());
    v.addEventListener('error', () => { if (!started && TR.id === `apple:${hit.u}`) { MKLog.add('info', 'Apple trailer did not play, YouTube instead'); fallback(); } });
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    clearInterval(TR.tick); TR.tick = setInterval(trSync, 250);
  },
};
{
  const pt = playTrailer;
  playTrailer = async function (meta) {
    const args = arguments, yt = () => pt.apply(this, args);
    if (meta && meta.type === 'movie' && !engine.offline) {
      const hit = await Promise.race([AppleTrailer.find(meta), sleep(2500).then(() => null)]).catch(() => null);
      if (hit) { AppleTrailer.play(hit, meta, yt); return; }
    }
    return yt();
  };
}

/* ---------------- Artwork from several sources ---------------- */
const ArtFallback = {
  tm: new Map(),
  kind(img) { return img.matches('.hero-logo, .pk-det-logo') || (img.dataset.nofb === '1' && img.dataset.wide !== '1') ? 'logo' : img.dataset.wide === '1' ? 'background' : 'poster'; },
  tmdb(tt) {
    if (!TMDB.key()) return Promise.resolve(null);
    if (!this.tm.has(tt)) this.tm.set(tt, (async () => {
      const j = await TMDB.find(tt); if (!j) return null;
      const x = (j.movie_results || [])[0] || (j.tv_results || [])[0]; if (!x) return null;
      const type = (j.movie_results || [])[0] ? 'movie' : 'tv'; let logo = null, tvdb = null;
      try { const im = await TMDB.images(type, x.id); const l = ((im && im.logos) || [])[0]; if (l) logo = `https://image.tmdb.org/t/p/w500${l.file_path}`; } catch (e) { /* none */ }
      if (type === 'tv') try { tvdb = ((await TMDB.externalIds(x.id)) || {}).tvdb_id || null; } catch (e) { /* none */ }
      return { type, tvdb, poster: x.poster_path ? `https://image.tmdb.org/t/p/w500${x.poster_path}` : null, background: x.backdrop_path ? `https://image.tmdb.org/t/p/w1280${x.backdrop_path}` : null, logo };
    })().catch(() => { this.tm.delete(tt); return null; }));
    return this.tm.get(tt);
  },
  async fanart(tt, kind) {
    const key = String(Keys.get().fanart || '').trim(); if (!key) return null;
    const t = await this.tmdb(tt), tv = t && t.type === 'tv';
    if (tv && !t.tvdb) return null;
    const r = await netFetch(`https://webservice.fanart.tv/v3/${tv ? `tv/${t.tvdb}` : `movies/${tt}`}?api_key=${encodeURIComponent(key)}`, {}, 8000); if (!r.ok) return null;
    const j = await r.json(), pick = (a) => (Array.isArray(a) && a.length ? (a.find((x) => x.lang === 'en') || a[0]).url : null);
    return kind === 'poster' ? pick(tv ? j.tvposter : j.movieposter) : kind === 'logo' ? pick(tv ? j.hdtvlogo : j.hdmovielogo) : pick(tv ? j.showbackground : j.moviebackground);
  },
  steps(tt, kind, src) {
    const mh = `https://live.metahub.space/${kind}/medium/${tt}/img`;
    return [() => (/metahub\.space/.test(src) ? null : mh), async () => { const t = await this.tmdb(tt); return t && t[kind]; }, () => this.fanart(tt, kind).catch(() => null)];
  },
  finish(img) {
    img.dataset.fb = '1';
    if (img.dataset.nofb === '1') { img.hidden = true; const alt = img.nextElementSibling; if (alt && alt.hasAttribute('data-logo-alt')) alt.hidden = false; return; }
    const wide = img.dataset.wide === '1';
    img.src = Posters.make(img.dataset.title || img.alt || '', img.dataset.seed || img.alt || 'x', wide ? 960 : 400, wide ? 540 : 600);
  },
  async next(img, tt, kind) {
    const tried = new Set(String(img.dataset.artTried || '').split('|'));
    for (;;) {
      const n = Number(img.dataset.art || 0), list = this.steps(tt, kind, img.currentSrc || img.src || '');
      if (n >= list.length) { this.finish(img); return; }
      img.dataset.art = n + 1;
      let u = null; try { u = await list[n](); } catch (e) { u = null; }
      if (!img.isConnected) return;
      if (u && !tried.has(u)) { tried.add(u); img.dataset.artTried = [...tried].join('|').slice(-2000); img.src = u; return; }
    }
  },
  init() {
    // runs before the older handler (window capture comes before document capture)
    addEventListener('error', (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.fb === '1' || img.dataset.alt || !/^https?:/.test(img.currentSrc || img.src || '')) return;
      const m = /^(tt\d+)(?::\d+:\d+)?$/.exec(img.dataset.seed || ''); if (!m) return;
      e.stopPropagation();
      this.next(img, m[1], /:/.test(img.dataset.seed) ? 'background' : this.kind(img));
    }, true);
  },
};
ArtFallback.init();

/* ---------------- Anime ---------------- */
const AnimeHub = {
  BASE: 'https://anime-kitsu.strem.fun',
  LISTS: [['kitsu-anime-trending', 'Trending'], ['kitsu-anime-airing', 'Airing now'], ['kitsu-anime-popular', 'Most popular'], ['kitsu-anime-rating', 'Top rated']],
  GENRES: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mecha', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'],
  cur: 'kitsu-anime-trending', genre: '', skip: 0, done: false, busy: false, token: 0,
  addon() { return { baseUrl: this.BASE, manifest: { id: 'com.mkcinema.kitsu-catalogs', name: 'Kitsu' } }; },
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  async list(id, extra = {}) {
    const r = await engine.call(this.addon(), 'catalog', 'anime', id, extra);
    return (r.metas || []).filter((m) => m && m.id).map((m) => ({ ...m, type: m.type === 'movie' ? 'movie' : 'series', _addon: 'Kitsu' }));
  },
  render() {
    const box = $('#animeBody'); if (!box) return;
    if (this.kids()) { box.innerHTML = '<div class="empty-state"><i data-lucide="lock"></i><h3>Not on kids seats</h3><p>Anime lists are not filtered for age.</p></div>'; icons(); return; }
    const trending = this.cur === 'kitsu-anime-trending';
    box.innerHTML = `<div class="net-head an-head"><h1 class="page-title">Anime</h1><p class="page-sub">Trending, airing and top-rated anime, from Kitsu. Playing uses your own addons, like everything else.</p>
        <div class="toolbar"><div class="segc" role="radiogroup" aria-label="List">${this.LISTS.map(([v, l]) => `<button type="button" data-nav data-al="${v}" class="${this.cur === v ? 'on' : ''}" role="radio" aria-checked="${this.cur === v}">${l}</button>`).join('')}</div>
        ${trending ? '' : `<div class="net-switch an-genres"><button type="button" class="chip ${this.genre ? '' : 'on'}" data-nav data-ag="">All genres</button>${this.GENRES.map((g) => `<button type="button" class="chip ${this.genre === g ? 'on' : ''}" data-nav data-ag="${esc(g)}">${esc(g)}</button>`).join('')}</div>`}</div></div>
      <div class="grid" id="animeGrid">${skeletons(12)}</div>
      <div class="actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-nav id="animeMore" hidden>Show more</button></div>`;
    icons();
    $$('[data-al]', box).forEach((b) => b.addEventListener('click', () => { this.cur = b.dataset.al; if (this.cur === 'kitsu-anime-trending') this.genre = ''; this.render(); }));
    $$('[data-ag]', box).forEach((b) => b.addEventListener('click', () => { this.genre = b.dataset.ag; this.render(); }));
    $('#animeMore').onclick = () => this.load(false);
    this.skip = 0; this.done = false; this.load(true);
  },
  async load(fresh) {
    if (this.busy && !fresh) return; this.busy = true; const tok = ++this.token;
    const grid = $('#animeGrid'), more = $('#animeMore'); if (more) more.hidden = true;
    try {
      const extra = {}; if (this.genre) extra.genre = this.genre; if (this.skip) extra.skip = this.skip;
      const metas = await this.list(this.cur, extra);
      if (tok !== this.token || !$('#animeGrid')) return;
      if (fresh) grid.innerHTML = '';
      const seen = new Set($$('[data-card]', grid).map((x) => x.dataset.id));
      grid.insertAdjacentHTML('beforeend', metas.filter((m) => !seen.has(m.id)).map((m) => cardHTML(m)).join(''));
      if (!grid.children.length) grid.innerHTML = '<div class="empty">Nothing listed here right now.</div>';
      this.skip += metas.length; this.done = this.cur === 'kitsu-anime-trending' || metas.length < 20;
      if (more) more.hidden = this.done;
      icons(); if (typeof queueWall === 'function') queueWall();
      if (IS_TV && fresh) Nav.settle();
    } catch (e) {
      if (tok === this.token && grid) grid.innerHTML = `<div class="empty-state"><i data-lucide="cloud-off"></i><h3>The list did not load</h3><p>${esc(e.message || 'Network error')}. Try again in a moment.</p></div>`;
      icons();
    } finally { if (tok === this.token) this.busy = false; }
  },
  /* one row on Home, under Networks; the whole section is in the menu */
  async place() {
    const rows = $('#homeRows'); if (!rows || CFG.animeRow === false || this.kids()) { const o = $('#animeRow'); if (o) o.remove(); return; }
    let sec = $('#animeRow');
    if (!sec) {
      sec = document.createElement('section'); sec.className = 'row an-row'; sec.id = 'animeRow';
      sec.innerHTML = `<div class="row-head"><h2 class="row-title">Anime <small>Trending this week</small></h2><button class="see-all" type="button" data-nav id="animeAll">See all<i data-lucide="chevron-right"></i></button></div><div class="rail">${skeletons(8)}</div>`;
      $('#animeAll', sec).onclick = () => go('anime');
      try {
        this.row = this.row || await this.list('kitsu-anime-trending');
        $('.rail', sec).innerHTML = this.row.slice(0, 20).map((m) => cardHTML(m)).join(''); icons();
      } catch (e) { sec.remove(); return; }
    }
    const after = $('#netRow') || $('#homeRows .t10c') && $('#homeRows .t10c').closest('#homeRows > section');
    if (after && after.parentNode === rows) { if (after.nextElementSibling !== sec) after.after(sec); }
    else if (!sec.isConnected) { const kids = rows.children; if (kids[2]) kids[2].after(sec); else rows.append(sec); }
    if (typeof queueWall === 'function') queueWall();
  },
  init() {
    if (window.lucide && lucide.icons && !lucide.icons.Torii) lucide.icons.Torii = [['path', { d: 'M3 5c4 1.5 14 1.5 18 0' }], ['path', { d: 'M4 9h16' }], ['path', { d: 'M7 6v15' }], ['path', { d: 'M17 6v15' }], ['path', { d: 'M12 6.5V9' }]];
    if (!$('#view-anime')) {
      const anchor = $('#view-network') || $('.view:last-of-type');
      anchor.insertAdjacentHTML('afterend', '<section class="view" id="view-anime" aria-label="Anime"><div id="animeBody"></div></section>');
    }
    const ser = $('#tabs .tab[data-view="series"]');
    if (ser && !$('#tabs .tab[data-view="anime"]')) {
      ser.insertAdjacentHTML('afterend', '<button class="tab" data-view="anime" data-nav type="button" title="Anime"><i data-lucide="torii"></i><span class="lbl">Anime</span></button>');
      $('#tabs .tab[data-view="anime"]').addEventListener('click', () => go('anime'));
    }
    const g0 = go; go = function (view) { const r = g0.apply(this, arguments); if (view === 'anime') AnimeHub.render(); return r; };
    const rh = renderHome; renderHome = function () { const p = rh.apply(this, arguments); Promise.resolve(p).then(() => AnimeHub.place()); return p; };
    // anime ids (kitsu:, mal:, anilist:) open even when no installed addon describes them
    const fm = engine.fetchMeta.bind(engine);
    engine.fetchMeta = async function (type, id) {
      if (/^(kitsu|mal|anilist|anidb):/.test(String(id)) && !this.addons.some((a) => a.enabled && this.supports(a, 'meta', type, id))) {
        const r = await this.call(AnimeHub.addon(), 'meta', type === 'movie' ? 'movie' : 'series', id);
        return r && r.meta ? { ...r.meta, type: r.meta.type || type, _addon: 'Kitsu' } : null;
      }
      return fm(type, id);
    };
    // stream addons that only know IMDb ids still get anime episodes, through Kitsu's IMDb mapping
    const fs = engine.fetchStreams.bind(engine);
    engine.fetchStreams = async function (type, id, onPartial) {
      const res = await fs(type, id, onPartial);
      const km = /^kitsu:(\d+)(?::(\d+))?$/.exec(String(id));
      if (!km || res.streams.length) return res;
      try {
        const meta = (typeof D !== 'undefined' && D.meta && String(D.meta.id).startsWith(`kitsu:${km[1]}`)) ? D.meta : (P.ctx && P.ctx.meta && String(P.ctx.meta.id).startsWith(`kitsu:${km[1]}`) ? P.ctx.meta : await this.fetchMeta(type, `kitsu:${km[1]}`));
        const v = km[2] ? (meta.videos || []).find((x) => x.id === id) : null;
        const imdb = (v && v.imdb_id) || meta.imdb_id; if (!/^tt\d+$/.test(imdb || '')) return res;
        const alt = v ? (v.imdbSeason != null && v.imdbEpisode != null ? `${imdb}:${v.imdbSeason}:${v.imdbEpisode}` : null) : imdb; if (!alt) return res;
        MKLog.add('info', `anime streams via IMDb mapping ${alt}`);
        return await fs(type, alt, onPartial);
      } catch (e) { return res; }
    };
    COMMANDS.push({ label: 'Browse anime', icon: 'torii', run: () => go('anime') });
    if (/^#anime$/.test(location.hash)) setTimeout(() => go('anime'), 0);
  },
};
AnimeHub.init();

/* ---------------- Settings ---------------- */
{
  const help = {
    id: 'help', icon: 'activity', label: 'Help', intro: 'Tools for when something does not play right. Run the Diagnostic first, then send a log if it still goes wrong.', rows: () => [
      { key: 'diagRun', label: 'Diagnostic', help: (() => { const d = Diagnostic.saved(); return `About a minute of checks: decoders, smoothness, speed and addons. It suggests settings for this ${IS_TV ? 'TV' : 'device'} only.${d ? ` Last run ${esc(new Date(d.at).toLocaleDateString())}.` : ''}`; })(), type: 'button', text: 'Run Diagnostic', icon: 'activity', run: () => Diagnostic.open() },
      { key: 'sendLog', label: 'Send log', help: `Sends recent errors and this device’s details to the developer, and gives you a 6-character code for your bug report. No keys or links.${SendLog.last() ? ` Last code: <b class="mono">${esc(SendLog.last().code)}</b>.` : ''}`, type: 'button', text: 'Send log', icon: 'send', run: () => SendLog.open() },
      { key: 'speedRun', label: 'Speed test', help: typeof LineCheck !== 'undefined' && LineCheck.last ? `Last test: <b>${Math.round(LineCheck.last.mbps)} Mbps</b>.` : 'Downloads up to 40 MB once and tells you the highest quality that plays without pauses.', type: 'button', text: 'Test my connection', icon: 'gauge', run: (b) => LineCheck.run(b) },
      ...(IS_TV ? [] : [{ key: 'bugForm', label: 'Report a bug', help: 'Opens the bug form on GitHub. It asks for your log code, so send a log first.', type: 'button', text: 'Open bug form', icon: 'bug', run: () => window.open(SendLog.issueUrl((SendLog.last() || {}).code), '_blank', 'noopener') }]),
    ],
  };
  const i = SECTIONS.findIndex((x) => x.id === 'support'); SECTIONS.splice(i >= 0 ? i : SECTIONS.length, 0, help);
  const sub = secById('subtitles');
  if (sub) { const rows = sub.rows; sub.rows = () => [...rows(), { group: 'Anime and styled subtitles' },
    { key: 'assMode', label: 'Styled subtitles (ASS/SSA)', help: 'Anime subtitles are drawn the way their authors styled them: fonts, colours, signs and karaoke. Light drops the heaviest blur effects for slower devices. Off shows them as plain text in your own style. The Diagnostic picks the best mode for this device.', type: 'select', options: [['auto', IS_TV ? 'Automatic (Light on TVs)' : 'Automatic'], ['full', 'Full'], ['lite', 'Light'], ['off', 'Off (plain text)']], get: () => CFG.assMode || 'auto' },
    { key: 'mkvSubs', label: 'Read subtitles inside MKV files', help: 'Lists the subtitle tracks, chapters and fonts inside MKV files, fetching only the subtitle lines. Needs a host that allows it, or your MKCinema proxy.', type: 'toggle', get: () => CFG.mkvSubs !== false }]; }
  const pb = secById('playback');
  if (pb) { const rows = pb.rows; pb.rows = () => { const r = rows(); const at = r.findIndex((x) => x.key === 'autoSkipIntro'); const extra = [{ key: 'introDb', label: 'Use TheIntroDB', help: 'Community intro, recap and credits times for films and series (theintrodb.org), used when the file has no chapters and AniSkip has nothing.', type: 'toggle', get: () => CFG.introDb !== false }]; if (at >= 0) r.splice(at + 1, 0, ...extra); else r.push(...extra); return r; }; }
  const hm = secById('home');
  if (hm) { const rows = hm.rows; hm.rows = () => [...rows(), { key: 'animeRow', label: 'Anime row', help: 'A row of trending anime on Home. The full Anime section is always in the menu.', type: 'toggle', get: () => CFG.animeRow !== false, set: (v) => { setCfg('animeRow', v); AnimeHub.place(); } }]; }
  COMMANDS.push({ label: 'Run Diagnostic', icon: 'activity', run: () => Diagnostic.open() }, { label: 'Send log', icon: 'send', run: () => SendLog.open() });
  // the older "Report a problem" now opens the form that asks for a log code
  if (typeof Report !== 'undefined') Report.open = function () { SendLog.open(); };
}

/* ---------------- Seek previews while dragging on phones and tablets ----------------
   Computers already preview on hover. On touch screens the picture shows above your finger while you drag the bar.
   TVs and HLS streams stay without (a second decoder stutters cheap TVs; HLS would need a second download). */
{
  const seek = $('#seek'), box = seek && seek.querySelector('.sp-prev');
  if (seek && box && typeof Tools !== 'undefined') {
    let down = false, pend = 0;
    const src = () => {
      if (CFG.seekPreview === false || IS_TV || !P.stream || P.hls || P.remux) return '';
      const u = video.currentSrc || ''; return !u || (u.startsWith('blob:') && !P.stream._local) ? '' : u;
    };
    seek.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') down = true; }, true);
    const end = () => { if (!down) return; down = false; box.hidden = true; box.classList.remove('touch'); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => seek.addEventListener(ev, end, true));
    seek.addEventListener('pointermove', (e) => {
      if (!down || e.pointerType === 'mouse') return;
      const u = src(), d = pDur(); if (!u || !isFinite(d)) return;
      if (!Tools.prev || Tools.prevSrc !== u) {
        Tools.dropPreview();
        const v = Tools.prev = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.src = u; Tools.prevSrc = u;
        v.addEventListener('seeked', () => box.classList.add('ok')); v.addEventListener('error', () => { box.hidden = true; Tools.prevSrc = 'x'; });
        box.innerHTML = ''; box.appendChild(v);
      }
      const r = seek.getBoundingClientRect(), p = clamp((e.clientX - r.left) / r.width, 0, 1), t = p * d;
      box.hidden = false; box.classList.add('touch'); box.style.left = `${clamp(p * 100, 14, 86)}%`;
      clearTimeout(pend);
      pend = setTimeout(() => { if (Math.abs(t - Tools.prevT) > 1) { Tools.prevT = t; box.classList.remove('ok'); try { Tools.prev.currentTime = t; } catch (x) { /* not seekable yet */ } } }, 120);
    }, true);
  }
}

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

'use strict';
/* =====================================================================
   MKCinema 2.16.0 · the Anime look (early access), interface sounds, trailer source
   - Anime: a fifth look. Crimson and violet night, a moon and pagoda skyline, a few sakura petals on Home and Miko,
     MKCinema's own mascot. Built for TVs too: the scene is one still picture, the petals move with transform only,
     and nothing blurs. MKCinema's logo is never changed.
   - Sounds: soft ticks for moving, opening and going back. Off in Settings › Intro & sound.
   - Trailers: Apple TV first or YouTube first, each falling back to the other.
   ===================================================================== */

LOOKS.anime = { label: 'Anime', blurb: 'Early access. Crimson and violet night, sakura and Miko, our mascot.', l0: '#0e0616', lb: '#2a0d2c', li: '#fff0f6', la: '#ff2d55', meta: '#0e0616', early: true };

const AnimeLook = {
  on: () => document.documentElement.getAttribute('data-look') === 'anime',
  prev: null,
  init() {
    // the petals and Miko live only on Home, and never while a film plays
    const box = document.createElement('div'); box.id = 'anPetals'; box.setAttribute('aria-hidden', 'true');
    const n = IS_TV ? 5 : TOUCH_UI ? 6 : 9;
    box.innerHTML = Array.from({ length: n }, (_, i) => `<i style="--x:${(i * 97 + 13) % 100}vw;--d:${(IS_TV ? 16 : 11) + (i * 7) % 9}s;--w:${-((i * 3.7) % 14).toFixed(1)}s;--s:${0.65 + ((i * 13) % 7) / 10}"></i>`).join('');
    document.body.appendChild(box);
    const sky = document.createElement('div'); sky.id = 'anSky'; sky.setAttribute('aria-hidden', 'true'); document.body.prepend(sky);
    const miko = document.createElement('img'); miko.id = 'anMiko'; miko.alt = ''; miko.src = 'anime/miko.svg'; miko.decoding = 'async'; miko.setAttribute('aria-hidden', 'true');
    document.body.appendChild(miko);
    // Miko also greets you on the Anime page, beside the title
    const ar = AnimeHub.render.bind(AnimeHub);
    AnimeHub.render = function () { const r = ar(); const h = $('#animeBody .an-head'); if (h && this && AnimeLook.on() && !h.querySelector('.an-miko')) h.insertAdjacentHTML('afterbegin', '<img class="an-miko" src="anime/miko.svg" alt="" aria-hidden="true" decoding="async">'); return r; };
    const sync = () => {
      const show = this.on() && S.view === 'home' && $('#player').hidden && !CFG.reduceMotion;
      document.body.classList.toggle('an-home', show);
    };
    const g0 = go; go = function () { const r = g0.apply(this, arguments); sync(); return r; };
    const sl = syncLayers; syncLayers = function () { const r = sl.apply(this, arguments); sync(); return r; };
    CFG_HOOKS.push((k, v) => {
      if (k === 'look') { setTimeout(sync, 0); if (S.view === 'anime') AnimeHub.render(); if (v === 'anime' && this.prev !== 'anime') this.early(this.prev || 'noir'); this.prev = v; }
      if (k === 'reduceMotion') sync();
    });
    this.prev = CFG.look;
    // the look was saved before this script defined it: apply it now
    if (CFG.look === 'anime') applyAll();
    sync();
    // the Appearance grid has five looks now
    const ap = secById('appearance'); if (ap) ap.intro = 'Five looks, all dark so nothing competes with the poster art. Anime is in early access. Your choice syncs to your account.';
    const lh = lookHTML; lookHTML = function () { return lh.apply(this, arguments).replace(/(<button[^>]*data-look="anime"[^>]*>[\s\S]*?<b>[\s\S]*?Anime)/, '$1<span class="lk-early">Early access</span>'); };
  },
  early(back) {
    X8.layer('anEarly', { label: 'Anime look', icon: 'sparkles', eyebrow: 'Early access' });
    const b = X8.body('anEarly');
    b.innerHTML = `<div class="an-early"><img src="anime/miko.svg" alt="Miko, the MKCinema mascot" width="120" height="142"><div>
      <h3 class="x8-h">The Anime look is in early access</h3>
      <p class="sub">It is new and may still have bugs${IS_TV ? ', especially on older TVs' : ''}. If anything looks wrong or feels slow, switch back here or any time in Settings › Appearance. Your other settings stay as they are.</p></div></div>
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="anKeep"><i data-lucide="check"></i>Keep Anime</button><button class="btn btn-ghost" type="button" data-nav id="anBack"><i data-lucide="undo-2"></i>Switch back to ${esc((LOOKS[back] || LOOKS.noir).label)}</button></div>`;
    icons(); X8.open('anEarly');
    $('#anKeep').onclick = () => X8.close('anEarly');
    $('#anBack').onclick = () => { X8.close('anEarly'); this.prev = back; setCfg('look', back); applyAll(); if (!$('#settings').hidden) renderSettingsBody(); toast(`${(LOOKS[back] || LOOKS.noir).label} is back`, 'ok'); };
    if (IS_TV) setTimeout(() => Nav.focus($('#anKeep')), 60);
  },
};
AnimeLook.init();

/* ---------------- Interface sounds ---------------- */
const UiSound = {
  ctx: null, out: null, last: 0,
  ok() { return CFG.uiSounds !== false && !(sfx && sfx.muted) && !(!$('#player').hidden && !video.paused); },
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = 0.5; this.out.connect(this.ctx.destination); } catch (e) { this.ctx = null; }
    return this.ctx;
  },
  // f: start pitch, f2: end pitch, ms: length, v: loudness (all quiet)
  tone(f, f2, ms, v) {
    const c = this.ensure(); if (!c || c.state !== 'running') return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f2, t + ms / 1000);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + ms / 1000 + 0.02);
  },
  play(kind) {
    if (!this.ok()) return; const now = performance.now();
    if (kind === 'move') { if (now - this.last < 75) return; this.last = now; this.tone(1750, 1500, 28, 0.03); return; }
    this.last = now;
    const anime = AnimeLook.on();
    if (kind === 'enter') { this.tone(anime ? 880 : 740, anime ? 1320 : 990, 70, 0.045); }
    if (kind === 'back') { this.tone(anime ? 1180 : 990, anime ? 780 : 660, 70, 0.04); }
  },
  init() {
    const unlock = () => { if (CFG.uiSounds !== false) this.ensure(); };
    addEventListener('pointerdown', unlock, { capture: true, passive: true }); addEventListener('keydown', unlock, { capture: true });
    const nf = Nav.focus.bind(Nav); Nav.focus = function (el) { const a = document.activeElement; const r = nf.apply(this, arguments); if (el && el !== a) UiSound.play('move'); return r; };
    const ol = openLayer; openLayer = function (id) { if (id !== 'player') UiSound.play('enter'); return ol.apply(this, arguments); };
    const cl = closeLayer; closeLayer = function (id) { const el = $(`#${id}`); if (el && !el.hidden && id !== 'player') UiSound.play('back'); return cl.apply(this, arguments); };
    const g0 = go; go = function (view) { if (view !== S.view) UiSound.play('enter'); return g0.apply(this, arguments); };
        document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('.chip, .seg button, .segc button, .switch, .lk, .preset'); if (t) UiSound.play('move'); }, true);
    const snd = secById('sound');
    if (snd) { const rows = snd.rows; snd.rows = () => [...rows(), { key: 'uiSounds', label: 'Interface sounds', help: 'Soft ticks when you move between titles, open something or go back. Silent while a film plays.', type: 'toggle', get: () => CFG.uiSounds !== false }]; }
  },
};
UiSound.init();

/* ---------------- Trailer source: a default and a fallback ---------------- */
{
  if (CFG.appleTrailers === false && !CFG.trailerSource) CFG.trailerSource = 'youtube';
  const ytFirst = () => CFG.trailerSource === 'youtube';
  let fbMeta = null;
  // YouTube refusing to play inside MKCinema (or listing nothing) hands over to Apple
  const tm = trMsg;
  trMsg = function (html) {
    if (html && fbMeta && /YouTube|blocks embedded|did not load|timed out/i.test(html)) {
      const m = fbMeta; fbMeta = null;
      AppleTrailer.find(m).then((hit) => { if (hit && !$('#trailer').hidden) AppleTrailer.play(hit, m, () => tm.call(window, html)); else tm.call(window, html); });
      return;
    }
    return tm.apply(this, arguments);
  };
  const apl = playTrailer; // Apple first, then YouTube (from support.js)
  playTrailer = async function (meta) {
    fbMeta = null;
    if (!ytFirst() || !meta) return apl.apply(this, arguments);
    const hasYt = (meta.trailerStreams || []).some((t) => t.ytId) || (meta.trailers || []).some((t) => t.source);
    if (!hasYt && meta.type === 'movie') {
      const hit = await AppleTrailer.find(meta);
      if (hit) { AppleTrailer.play(hit, meta, () => toast('No official trailer is listed for this title', 'err')); return; }
    }
    if (meta.type === 'movie') fbMeta = meta;
    const t = (meta.trailerStreams || [])[0] || ((meta.trailers || [])[0] && { ytId: meta.trailers[0].source });
    if (!t || !t.ytId) { toast('No official trailer is listed for this title', 'err'); return; }
    openTrailer(t.ytId);
  };
  const pb = secById('playback');
  if (pb) {
    const rows = pb.rows;
    pb.rows = () => rows().filter((x) => x.key !== 'appleTrailers').concat([{ key: 'trailerSource', label: 'Trailer source', help: 'Which official trailer plays first. If it has none for a title, or it will not play, the other one plays instead. Apple has trailers for films; series use YouTube.', type: 'select', options: [['apple', 'Apple TV first, then YouTube'], ['youtube', 'YouTube first, then Apple TV']], get: () => CFG.trailerSource || 'apple' }]);
  }
}
