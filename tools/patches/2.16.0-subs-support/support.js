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
  redact(s) {
    return String(s == null ? '' : s)
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
    const body = this.payload(note); let json = JSON.stringify(body);
    while (json.length > 180000 && body.log.length > 20) { body.log = body.log.slice(Math.floor(body.log.length / 3)); json = JSON.stringify(body); }
    for (let i = 0; i < 4; i++) {
      const code = this.code();
      const r = await fetch(`${SUPABASE_PROJECT.url}/rest/v1/mkcinema_logs`, {
        method: 'POST', headers: { apikey: SUPABASE_PROJECT.anonKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ code, app_version: APP_VERSION, platform: `${PLATFORM}${IS_TV ? '-tv' : ''}`.slice(0, 32), payload: body }),
      });
      if (r.ok) { try { localStorage.setItem('mkc:lastLog', JSON.stringify({ code, at: Date.now() })); } catch (e) { /* ignore */ } MKLog.add('info', `log sent as ${code}`); return code; }
      if (r.status !== 409) throw new Error(`the log server answered ${r.status}`);
    }
    throw new Error('no free code, try again');
  },
  last() { try { return JSON.parse(localStorage.getItem('mkc:lastLog') || 'null'); } catch (e) { return null; } },
  issueUrl(code) {
    const plat = IS_TV ? (/Web0S|webOS/i.test(navigator.userAgent) ? 'LG webOS app' : 'Android TV or Fire TV app') : window.MKAndroid ? 'Android app' : window.MKDesktop ? ({ windows: 'Windows app', mac: 'Mac app', linux: 'Linux app' }[MKDesktop.platform] || 'Web (browser)') : 'Web (browser)';
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
        toast(`The log was not sent (${e.message}). Check the connection and try again.`, 'err', 6000);
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
      ${c.hevc && !c.hevc.ok && !IS_TV ? `<p class="dg-warn">This ${TOUCH_UI ? 'device' : 'browser'} cannot decode HEVC (x265). Those sources play in VLC (Settings › Playback › Play streams in), or turn on Browser only mode to hide them.</p>` : ''}
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
      const seg = ['recap', 'intro'].map((k) => (m[k] ? { k, s: m[k][0], e: m[k][1] } : null)).find((x) => x && t >= x.s && t < x.e - 1);
      if (!seg) { this.hide(); this.shownAt = 0; this.cur = null; return; }
      if (this.cur !== seg.k) { this.cur = seg.k; this.shownAt = 0; const sp = $('#skipBtn span'); if (sp) sp.textContent = seg.k === 'recap' ? 'Skip recap' : 'Skip intro'; }
      if (CFG.autoSkipIntro && !this.usedK[seg.k]) { this.usedK[seg.k] = true; this.go(true); return; }
      if (!this.shownAt) { this.shownAt = performance.now(); $('#skipBtn').hidden = false; $('#skipBtn').classList.remove('out'); }
      else if (performance.now() - this.shownAt > 8000) this.hide();
    };
    Skip.go = function (auto) {
      const m = this.m, k = this.cur || 'intro'; if (!m || !m[k]) return;
      pSeek(m[k][1], { user: false }); this.hide(); this.shownAt = performance.now() + 1e9;
      toast(`${k === 'recap' ? 'Recap' : 'Intro'} skipped${auto ? ' automatically' : ''}`, 'info', 1400);
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
    $('#trSlot').innerHTML = `<video class="apl-v" playsinline autoplay preload="auto" src="${esc(hit.u)}"></video>${hit.page ? `<a class="apl-src" href="${esc(hit.page)}" target="_blank" rel="noopener" data-nav>Trailer · Apple TV</a>` : '<span class="apl-src">Trailer · Apple TV</span>'}`;
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
    const key = CFG.tmdbKey || CFG.tmdbKey2; if (!key) return Promise.resolve(null);
    if (!this.tm.has(tt)) this.tm.set(tt, (async () => {
      const r = await fetch(`https://api.themoviedb.org/3/find/${tt}?api_key=${encodeURIComponent(key)}&external_source=imdb_id`); if (!r.ok) return null;
      const j = await r.json(), x = (j.movie_results || [])[0] || (j.tv_results || [])[0]; if (!x) return null;
      const type = (j.movie_results || [])[0] ? 'movie' : 'tv'; let logo = null, tvdb = null;
      try { const im = await (await fetch(`https://api.themoviedb.org/3/${type}/${x.id}/images?api_key=${encodeURIComponent(key)}&include_image_language=en,null`)).json(); const l = (im.logos || [])[0]; if (l) logo = `https://image.tmdb.org/t/p/w500${l.file_path}`; } catch (e) { /* none */ }
      if (type === 'tv') try { tvdb = (await (await fetch(`https://api.themoviedb.org/3/tv/${x.id}/external_ids?api_key=${encodeURIComponent(key)}`)).json()).tvdb_id; } catch (e) { /* none */ }
      return { type, tvdb, poster: x.poster_path ? `https://image.tmdb.org/t/p/w500${x.poster_path}` : null, background: x.backdrop_path ? `https://image.tmdb.org/t/p/w1280${x.backdrop_path}` : null, logo };
    })().catch(() => null));
    return this.tm.get(tt);
  },
  async fanart(tt, kind) {
    const key = CFG.fanartKey; if (!key) return null;
    const t = await this.tmdb(tt), tv = t && t.type === 'tv';
    if (tv && !t.tvdb) return null;
    const r = await fetch(`https://webservice.fanart.tv/v3/${tv ? `tv/${t.tvdb}` : `movies/${tt}`}?api_key=${encodeURIComponent(key)}`); if (!r.ok) return null;
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
