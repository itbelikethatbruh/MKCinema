
'use strict';
/* =====================================================================
   MKCinema · configuration and effects presets
   ===================================================================== */
/* One look, by design: Noir. Matte black, platinum type, graphite hairlines, nothing moving behind the page. */
const LOOKS = {
  noir: { label: 'Noir', blurb: 'Matte black, platinum type and fine hairlines. The original.', l0: '#000000', lb: '#111113', li: '#f2f2f3', la: '#d9d4c7', meta: '#000000' },
  midnight: { label: 'Midnight', blurb: 'Ink blue blacks and ice silver type, like a cinema before the lights go down.', l0: '#05070c', lb: '#0f1625', li: '#f0f2f5', la: '#bccde4', meta: '#05070c' },
  velvet: { label: 'Velvet', blurb: 'Deep oxblood and soft ivory, with rose gold for the small highlights.', l0: '#0a0506', lb: '#221014', li: '#f4f1f2', la: '#e3c8bd', meta: '#0a0506' },
  sepia: { label: 'Sepia', blurb: 'Warm umber blacks, cream type and amber highlights, like old film stock.', l0: '#0a0805', lb: '#211912', li: '#f5f2f0', la: '#e8d7b8', meta: '#0a0805' },
  daylight: { label: 'Daylight', blurb: 'Bright paper white and deep ink, for sunny rooms and daytime watching.', l0: '#f5f6f7', lb: '#dcdee1', li: '#21242d', la: '#886746', meta: '#f5f6f7', light: true },
  linen: { label: 'Linen', blurb: 'Warm ivory and espresso type with bronze highlights, soft on the eyes in daylight.', l0: '#f5f2ec', lb: '#e6decf', li: '#352922', la: '#8f5935', meta: '#f5f2ec', light: true }
};

/* Effects presets. High adds depth: raised, shimmering buttons, posters that lift and tilt, the 3D logo pulse, and
   frosted glass on desktops. Phones get everything but the glass (Chrome on Android can black out blurred tiles). */
const PRESETS = {
  high: { label: 'High', blur: 18, note: 'Depth, shimmer and glass' },
  balanced: { label: 'Balanced', blur: 10, note: 'Shimmer and light glass' },
  low: { label: 'Low', blur: 0, note: 'Flat and still, the fastest' },
};
const PRESET_ORDER = ['high', 'balanced', 'low'];

const CFG_DEFAULTS = {
  // appearance
  pxAccent: 'champagne', pxGlass: 'frosted', // 2.97 player colour + panel look
  look: 'noir', cardInfo: 'hover', uiScale: 100, reduceMotion: false, contrast: 'high',
  cardSize: 'm', banner: 'full', lsMenu: null,   // 2.77 Layout Studio
  ambient: null, eggs: null,   // 2.82 Ambient Studio recipe (photos stay on each device) and secrets found
  // performance
  quality: 'high', qualityChosen: false, blur: 18, showFps: false,
  // playback
  maxQuality: '4k', preferFormat: 'any', autoNext: true, upNextAt: 45, seekStep: 10, hudHide: 3, hdrDim: true, resume: true, speed: 1,
  failover: true, skipIntro: true, autoSkipIntro: false, xray: false, spoilerGuard: false, dsp: 'flat',
  // posters
  ratingBadges: true, rpdb: false,
  // watch party
  partyName: '', partyShareLink: false, governor: true, syncKeys: true, anonStats: true, pickMemo: true, liveMini: true,
  ambilight: true, ambIntensity: 85, rememberVolume: true, extPlayers: {},
  // subtitles
  subAuto: true, subDubSigns: true, subLang: 'eng', subSize: 100, subColor: '#ffffff', subBg: 65, subPos: 'bottom', subFont: 'stream', subOutline: true, subBold: false, subShadow: 'soft', subLook: 'custom',
  // streams
  hideP2P: false, browserOnly: false, audioOnly: 'eng', showTrailers: true, timeout: 15, alwaysProxy: false,
  // intro, sound, trailers
  cloudSync: true,
  introMode: 'daily', sfxVolume: 70, trailerMode: 'auto',
};
const CFG = Object.assign({}, CFG_DEFAULTS, (() => { try { const c0 = window.__CFG0; window.__CFG0 = null; return c0 && typeof c0 === 'object' ? c0 : JSON.parse(localStorage.getItem('mkc:cfg') || '{}'); } catch (e) { return {}; } })());
/* 2.95.8: subtitles move to Inter (modern) once for people still on the old default font */
if (!CFG.subSoft) { if (CFG.subFont === 'sans') CFG.subFont = 'stream'; CFG.subSoft = 1; }
// One-time upgrades for settings saved by older builds
if ((CFG.cfgRev || 0) < 4) {
  // Low is the default graphics preset from rev 4; keep a preset only if the user picked it themselves
  if (!CFG.qualityChosen && CFG.quality !== 'custom') CFG.quality = 'low';
  CFG.cfgRev = 4;
}
if (CFG.cfgRev < 6) {
  // rev 6: one Noir look and no animated background; themes, the 3D stage, parallax, tilt and grain are gone
  ['theme', 'customVoid', 'customA1', 'customA2', 'customA3', 'bgStyle', 'parallaxDepth', 'bg3d', 'renderScale', 'fpsCap', 'particles', 'nebula', 'tilt', 'grain', 'autoDowngrade', 'dimBgInMenus', 'autoLevel'].forEach((k) => delete CFG[k]);
  if (CFG.quality !== 'custom' && !PRESETS[CFG.quality]) CFG.quality = { ultra: 'high' }[CFG.quality] || 'low';
  CFG.cfgRev = 6;
}
if (CFG.cfgRev < 7) {
  // rev 7: the next-episode card shows during the last 45 s (the old default was 25 s)
  if (CFG.upNextAt === 25) CFG.upNextAt = 45;
  CFG.cfgRev = 7;
}
if (CFG.cfgRev < 8) {
  // rev 8: High is the default everywhere, phones included; a preset the user picked themselves is kept
  if (!CFG.qualityChosen && CFG.quality !== 'custom') CFG.quality = 'high';
  CFG.cfgRev = 8;
}
if (CFG.cfgRev < 9) {
  // rev 9: High text contrast is the default; a choice the user made themselves is kept
  if (!CFG.contrastChosen) CFG.contrast = 'high';
  CFG.cfgRev = 9;
}
if (CFG.cfgRev < 10) {
  // rev 10: trailers default to "Best for this device" (the YouTube app on TVs); "Open on YouTube" is kept
  if (CFG.trailerMode !== 'link') CFG.trailerMode = 'auto';
  CFG.cfgRev = 10;
}
/* 2.96.1 health counts */
/* Counts (never details) of: an error in the app, a film that never started or that people left while it was still
   starting, how long films take to start, a film that stopped to load, a video error, sound playing while the picture
   is hidden, a Back press that changed nothing, and a TV remote press with nothing highlighted. */
const Health = {
  once: new Set(), n: {},
  add(k, max) { try { if (max) { this.n[k] = (this.n[k] || 0) + 1; if (this.n[k] > max) return; } Usage.add('feat', k); } catch (e) { /* counts off */ } },
  // what is open right now: Back has to change this
  sig() {
    try {
      const ids = ['castLayer', 'partyLayer', 'player', 'trailer', 'tour', 'stremioImport', 'palette', 'epSheet', 'askLayer', 'tastePick', 'settings', 'addons', 'detail', 'rcLayer'];
      const open = ids.filter((i) => { const e = document.getElementById(i); return e && !e.hidden; });
      const h = document.documentElement, x = document.querySelector('.exit-ask, .focus-ask, .sup-ask, .x8-layer, #ezbMore:not([hidden])');
      /* 2.96.9 health true */
      const f = (fn) => { try { return fn(); } catch (e) { return ''; } };
      const shown = (sel) => { const e = document.querySelector(sel); return e && !e.hidden ? 1 : 0; };
      const pl = document.getElementById('player'), hud = document.getElementById('hud');
      const more = [
        pl && !pl.hidden ? ['#subMenu', '#optMenu', '#dspPop', '#subSync', '#xray', '#rescueBar', '#pMsg'].map(shown).join('') + document.querySelectorAll('#player .drawer.open').length + (hud && hud.classList.contains('idle') ? 'i' : 'a') : '',
        document.body.classList.contains('side-open') ? 'side' : '', document.body.classList.contains('layer-open') ? 'layer' : '',
        f(() => Saver.isOpen), f(() => Miko.on + ':' + document.getElementById('mikoSet').hidden), f(() => Peak.on + ':' + document.getElementById('pkHowBox').hidden),
        document.getElementById('updBar') ? 'upd' : '', f(() => !!(Remote.hintEl && Remote.hintEl.isConnected)), f(() => People.canReturn()),
        f(() => Music.page && S.view === 'music' ? JSON.stringify(Music.page).slice(0, 40) : ''), f(() => setPhoneHome),
        f(() => (document.querySelector('#setNav .on') || {}).textContent || ''), f(() => X8.top()), f(() => !!ExitAsk.el),
        document.querySelectorAll('.focus-ask, .sup-ask, .x8-layer').length,
      ].join(',');
      return { any: open.length > 0 || h.classList.contains('ezb-menu-open') || !!x || !!document.fullscreenElement,
        top: open[0] || (h.classList.contains('ezb-menu-open') ? 'menu' : x ? 'ask' : (window.S && S.view) || 'home'),
        s: [open.join(','), h.classList.contains('ezb-menu-open'), !!x && x.className, !!document.fullscreenElement, (window.S && S.view) || '', more].join('|') };
    } catch (e) { return { any: false, s: '' }; }
  },
  backCheck(before) { if (!before.any) return; setTimeout(() => { if (this.sig().s === before.s) { this.add('err:back_noop', 20); this.add(`err:back_noop:${before.top || ''}`, 20); } }, 700); },
  // the film is drawn by the app's own engine under the page: is something solid drawn over it?
  covered() {
    const W = innerWidth, H = innerHeight, own = document.getElementById('video');
    let hit = 0;
    for (const [px, py] of [[0.25, 0.35], [0.75, 0.35], [0.5, 0.6]]) {
      for (const e of document.elementsFromPoint(W * px, H * py)) {
        if (e === own || e === document.documentElement || e === document.body) continue;
        const c = getComputedStyle(e);
        if (c.visibility === 'hidden') continue;
        const solid = /^(IMG|CANVAS|VIDEO|IFRAME)$/.test(e.tagName) || /url\(/.test(c.backgroundImage) || (() => { const m = c.backgroundColor.match(/rgba?\(([^)]+)\)/); if (!m) return false; const a = m[1].split(/[ ,/]+/).filter(Boolean); return a.length < 4 || +a[3] >= 0.85; })();
        if (!solid) continue;
        let o = 1; for (let u = e; u && u.nodeType === 1; u = u.parentElement) o *= +getComputedStyle(u).opacity;
        if (o >= 0.5) { hit++; break; }
      }
    }
    return hit >= 2;
  },
  play: null,
  init() {
    addEventListener('error', (e) => { if (e && e.filename !== undefined && !e.target.tagName) { this.add('err:js', 5);
      const t = String((e.error && e.error.name) || 'Error').replace(/[^A-Za-z]/g, '').slice(0, 20), fl = String(e.filename || '').split(/[?#]/)[0].split('/').pop().slice(0, 20) || 'page';
      this.add(`err:js:${t}@${fl}:${e.lineno || 0}:${e.colno || 0}`, 5); } }, true);
    addEventListener('unhandledrejection', (e) => { const m = String((e.reason && (e.reason.name || e.reason.message)) || ''); if (!/Abort|NotAllowed|play\(\)|interrupted/i.test(m)) this.add('err:promise', 5); });
    // Back: the TV app calls back(); phones and browsers go through the page's history
    try { const prev = back; back = function () { const b = Health.sig(); const r = prev.apply(this, arguments); Health.backCheck(b); return r; }; } catch (e) { /* no back */ }
    const tvq = typeof IS_TV !== 'undefined' && IS_TV; /* 2.96.2 tv speed */
    let last = this.sig(); if (!tvq) setInterval(() => { last = this.sig(); }, 400);
    addEventListener('popstate', () => { if (!tvq) this.backCheck(last); });
    if (typeof IS_TV !== 'undefined' && IS_TV) document.addEventListener('keydown', (e) => {
      if (!/^Arrow/.test(e.key)) return; const a = document.activeElement;
      if ((!a || a === document.body) && document.getElementById('player').hidden) setTimeout(() => { const b = document.activeElement; if (b && b !== document.body) return;
        let where = 'app';
        try {
          const r = Nav.root(); where = r.id || 'app';
          const ok = Nav.items(r).filter((el) => { const c = getComputedStyle(el); if (c.visibility === 'hidden') return false; const q = el.getBoundingClientRect(); return q.bottom > 0 && q.top < innerHeight && q.right > 0 && q.left < innerWidth; });
          const m = Nav.mem.get(r), pick = (m && ok.includes(m) && m) || (ok.length ? Nav.start(r, ok) : null);
          if (pick) Nav.focus(pick, true);
        } catch (e) { /* leave it */ }
        this.add('err:tv_no_focus', 5); this.add(`err:tv_no_focus:${where}`, 5); }, 300);
    }, true);
    // the film in the page's own player (a film handed to the Android or Windows player is counted there, not here)
    let v; try { v = video; } catch (e) { return; }
    if (!v) return;
    const pl = document.getElementById('player');
    const done = (k) => { const x = this.play; if (!x || x.done) return; x.done = true; if (k) this.add(k); };
    v.addEventListener('loadstart', () => { if (!v.currentSrc || pl.hidden) return; const old = this.play; if (old && !old.done && !old.started) done(Date.now() - old.at > 8000 ? 'err:play_left_waiting' : '');
      this.play = { at: Date.now(), from: v.currentTime || 0, started: false, done: false, waitAt: 0, hid: 0 }; });
    v.addEventListener('timeupdate', () => {
      const x = this.play; if (!x || x.started) return;
      if (v.currentTime > x.from + 0.3 || (x.from > 0 && v.currentTime > 0.3 && Math.abs(v.currentTime - x.from) < 5 && !v.paused && v.readyState >= 3)) {
        x.started = true; const s = (Date.now() - x.at) / 1000;
        this.add(`play_wait:${s < 2 ? '0-2s' : s < 5 ? '2-5s' : s < 10 ? '5-10s' : s < 30 ? '10-30s' : '30s+'}`);
      }
    });
    v.addEventListener('waiting', () => { const x = this.play; if (x && x.started) x.waitAt = Date.now(); });
    v.addEventListener('playing', () => { const x = this.play; if (x) x.waitAt = 0; });
    v.addEventListener('error', () => { if (v.currentSrc && !pl.hidden) this.add('err:video_error', 10); });
    setInterval(() => {
      const x = this.play; if (!x || x.done) return;
      if (pl.hidden) { done(!x.started && Date.now() - x.at > 8000 ? 'err:play_left_waiting' : ''); return; }
      if (!x.started && Date.now() - x.at > 30000 && !v.paused) done('err:play_never');
      if (x.started && x.waitAt && Date.now() - x.waitAt > 5000) { x.waitAt = 0; this.add('err:stall', 20); }
      // sound with no picture: the film runs but its picture is hidden or has not arrived
      if (x.started && !v.paused && !v.muted && v.volume > 0) {
        if (document.documentElement.classList.contains('mk-native-on')) {
          const noPic = v.readyState >= 2 && !v.videoWidth && !/audio|radio/i.test(v.currentSrc || '');
          const cov = !noPic && this.covered();
          if (noPic || cov) { if (++x.hid === 3) this.add(noPic ? 'err:sound_no_picture' : 'err:native_covered'); } else x.hid = 0;
        } else {
        let o = 1; for (let e = v; e && e.nodeType === 1; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') { o = 0; break; } o *= +c.opacity; }
        if (o < 0.5 || (v.readyState >= 2 && !v.videoWidth && !/audio|radio/i.test(v.currentSrc))) { if (++x.hid === 2) this.add('err:sound_no_picture'); } else x.hid = 0;
        }
      }
    }, 1000);
  },
};
addEventListener('load', () => setTimeout(() => { try { Health.init(); } catch (e) { /* never break the app */ } }, 0));
/* 2.96 usage counts */
/* Anonymous daily totals of what gets used: sections, screens, Home rows, buttons, settings, features and the time spent
   in each. Only totals leave the device, with the device type and app language; the server adds the country. Never a
   user id, device id, title, search text, addon or key. Live hosts only; Settings › Data › Share anonymous visit counts
   off sends nothing. Nothing ever goes to an addon server. */
const Usage = {
  q: new Map(), stack: [], lastIn: 0, party: null, started: false,
  HOSTS: /^(mkcinema\.pages\.dev|app\.mkcinema\.app)$/,
  SENS: /name|key|url|token|pin|code|pass|mail|addon|secret|host|server|proxy|list|ip$|user|id$|word|text|term|note|label|nick|title|query|search|bio|msg|tag|phrase/i,
  on() { try { return CFG.anonStats !== false && this.HOSTS.test(location.hostname); } catch (e) { return false; } },
  clean(k) { return String(k == null ? '' : k).replace(/[^A-Za-z0-9_.:=/+-]/g, '_').slice(0, 64); },
  add(ev, k, n = 1, secs = 0) {
    if (!this.on()) return;
    k = this.clean(k); if (!k) return;
    const id = `${ev}|${k}`, r = this.q.get(id) || [ev, k, 0, 0]; r[2] += n; r[3] += secs; this.q.set(id, r);
    if (this.q.size >= 250 || r[2] >= 400) this.send();
  },
  // a setting's value is kept only when it says nothing about the person: on/off, a number, or a short word
  val(key, v) {
    if (this.SENS.test(key)) return '';
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (typeof v === 'number' && isFinite(v)) return String(Math.round(v * 100) / 100);
    // a word is kept only for a choice setting (one that starts as a word, e.g. a theme), never typed text
    if (typeof v === 'string' && /^[a-z0-9_-]{1,20}$/i.test(v)) { let dv; try { dv = CFG_DEFAULTS[key]; } catch (e) { /* early */ } return typeof dv === 'string' && /^[a-z0-9_-]{1,20}$/i.test(dv) ? v : ''; }
    return '';
  },
  // only changes a person made count (the app adjusting itself at start does not)
  set(key, v) { if (Date.now() - this.lastIn > 4000) return; if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) return; const x = this.val(key, v); this.add('set', x ? `${key}=${x}` : key); },
  // a screen over the page (player, details, settings, Peak Cinema, party...) counts from open to close
  layer(id, open) {
    id = this.clean(id); if (!id) return;
    this.stack = this.stack.filter((x) => x !== id);
    if (open) { this.stack.push(id); this.add('layer', id); }
  },
  where() {
    for (let i = this.stack.length - 1; i >= 0; i--) { const el = document.getElementById(this.stack[i]); if (el && !el.hidden) return ['layer', this.stack[i]]; this.stack.splice(i, 1); }
    let v = 'home'; try { v = (S && S.view) || 'home'; } catch (e) { /* early */ }
    return ['view', v];
  },
  day() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } },
  dev() {
    let p = 'web'; try { p = PLATFORM; } catch (e) { /* early */ }
    const ua = navigator.userAgent || '', app = /MKCinema/.test(ua) ? '-app' : '';
    if (IS_TV) return `${p}-tv${app}`;
    const touch = matchMedia('(hover: none)').matches, m = Math.min(screen.width || 0, screen.height || 0);
    return `${p}-${touch ? (m && m < 600 ? 'phone' : 'tablet') : 'desktop'}${app}`;
  },
  lang() { try { return I18N.code || 'en'; } catch (e) { return 'en'; } },
  seatKind() {
    try { if (!SEAT) return 'main'; const s = (Store.raw.get('seats', []) || []).find((x) => x && x.id === SEAT); return s && s.kids ? 'kids' : 'other'; } catch (e) { return 'main'; }
  },
  // app opens, devices active today, devices new today, which seat; once a day the settings that differ from the default
  open() {
    const d = this.day(), seat = this.seatKind(); let last = '', lastSeat = '', first = false;
    try {
      last = localStorage.getItem('mkc:usageDay') || ''; lastSeat = localStorage.getItem(`mkc:usageDay:${seat}`) || ''; first = !localStorage.getItem('mkc:usageSeen');
      localStorage.setItem('mkc:usageDay', d); localStorage.setItem(`mkc:usageDay:${seat}`, d); if (first) localStorage.setItem('mkc:usageSeen', '1');
    } catch (e) { /* storage blocked: counts as a start only */ }
    this.add('open', 'start'); this.add('open', `start:${seat}`);
    if (first) this.add('open', 'new');
    if (lastSeat !== d) this.add('open', `day:${seat}`);
    if (last !== d) {
      this.add('open', 'day');
      try {
        for (const k of Object.keys(CFG_DEFAULTS)) {
          const v = CFG[k], dv = CFG_DEFAULTS[k];
          if (v === dv || v == null || typeof v === 'object') continue;
          const x = this.val(k, v); if (x) this.add('set', `on:${k}=${x}`);
        }
      } catch (e) { /* settings not ready */ }
    }
  },
  partyStart(host) {
    this.partyEnd(true);
    this.party = { host, at: Date.now(), peak: 1 };
    this.add('party', host ? 'start' : 'join');
  },
  partyEnd(quiet) {
    const p = this.party; if (!p) return; this.party = null;
    try { p.peak = Math.max(p.peak, Party.peers.size + 1); } catch (e) { /* closed */ }
    const secs = Math.min(86400, Math.round((Date.now() - p.at) / 1000)), min = secs / 60;
    this.add('party', p.host ? 'host_secs' : 'guest_secs', 1, secs);
    if (p.host) {
      this.add('party', `size:${p.peak >= 6 ? '6+' : p.peak}`);
      this.add('party', `len:${min < 5 ? '0-5m' : min < 30 ? '5-30m' : min < 60 ? '30-60m' : min < 120 ? '1-2h' : '2h+'}`);
      if (p.peak > 1) this.add('party', 'with_guests');
    }
    if (quiet !== true) this.send();
  },
  // every 15 s: the seconds go to the section or screen in front, while someone is there (or a video plays)
  tick() {
    if (document.hidden) return;
    try { if (this.party && Party.code) this.party.peak = Math.max(this.party.peak, Party.peers.size + 1); } catch (e) { /* no party */ }
    let playing = false; try { playing = !video.paused && !$('#player').hidden; } catch (e) { /* no player */ }
    if (!playing && Date.now() - this.lastIn > 300000) return;
    const [ev, k] = this.where(); this.add(ev, k, 0, 15);
  },
  rowKind(sec) {
    const rk = sec.dataset.rk || '';
    if (rk.startsWith('cat:')) { const t = rk.slice(4).split('/')[1]; return `cat:${/^[a-z]{2,12}$/.test(t || '') ? t : 'other'}`; }
    if (rk && /^[a-z][a-z0-9_-]{1,30}$/i.test(rk)) return rk;
    if (sec.id && /^[A-Za-z_-]{2,30}$/.test(sec.id)) return sec.id;
    const c = [...sec.classList].find((x) => x !== 'row' && /^[a-z][a-z-]{1,30}$/.test(x));
    return c || 'other';
  },
  tap(e) {
    this.lastIn = Date.now();
    const t = e.target; if (!t || !t.closest) return;
    const b = t.closest('button[id],a[id],[role="button"][id],[data-nav][id],input[id],select[id]');
    if (b && /^[A-Za-z][A-Za-z_-]{1,40}$/.test(b.id)) this.add('tap', b.id);
    const sec = t.closest('#homeRows > section');
    if (sec) {
      const kind = this.rowKind(sec), all = [...sec.parentElement.children].filter((x) => x.tagName === 'SECTION'), pos = all.indexOf(sec) + 1;
      this.add('row', kind); this.add('row', `pos:${pos > 12 ? '13+' : pos}`);
      if (t.closest('.row-more,.rail-all')) this.add('row', `all:${kind}`);
    } else if (t.closest('#hero')) this.add('row', 'hero');
  },
  send() {
    if (!this.q.size) return;
    const rows = [...this.q.values()].map((r) => [r[0], r[1], Math.round(r[2]), Math.round(r[3])]); this.q.clear();
    if (!this.on()) return;
    let url = '', key = ''; try { url = SUPABASE_PROJECT.url; key = SUPABASE_PROJECT.anonKey; } catch (e) { return; }
    for (let i = 0; i < rows.length; i += 250) {
      const body = JSON.stringify({ d: this.day(), dev: this.dev(), lang: this.lang(), cc: '', rows: rows.slice(i, i + 250) });
      try { fetch(`${url}/rest/v1/rpc/mkc_usage_add`, { method: 'POST', keepalive: body.length < 60000, credentials: 'omit', cache: 'no-store', headers: { apikey: key, 'Content-Type': 'application/json' }, body }).catch(() => {}); } catch (e) { /* offline */ }
    }
  },
  init() {
    if (this.started) return; this.started = true;
    if (!this.on()) return;
    const seen = () => { this.lastIn = Date.now(); };
    addEventListener('click', (e) => { try { this.tap(e); } catch (x) { /* never in the way */ } }, true);
    ['keydown', 'pointerdown', 'touchstart', 'wheel'].forEach((t) => addEventListener(t, seen, { capture: true, passive: true }));
    setInterval(() => this.tick(), 15000);
    setInterval(() => this.send(), 300000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.send(); });
    addEventListener('pagehide', () => { this.partyEnd(true); this.send(); });
    this.open();
    setTimeout(() => this.send(), 60000);
  },
};
setTimeout(() => Usage.init(), 4000);
const CFG_HOOKS = [];
function saveCfg() { try { localStorage.setItem('mkc:cfg', JSON.stringify(CFG)); } catch (e) { /* storage blocked */ } }
function setCfg(key, value, { silent = false } = {}) {
  CFG[key] = value; saveCfg(); if (!silent) Usage.set(key, value);
  if (!silent) CFG_HOOKS.forEach((fn) => { try { fn(key, value); } catch (e) { console.error(e); } });
}
function applyPreset(name) {
  const level = PRESETS[name] ? name : 'high';
  CFG.blur = PRESETS[level].blur; saveCfg(); return level;
}
if (CFG.quality !== 'custom') CFG.quality = applyPreset(CFG.quality);
/* Devices without hover (phones, tablets) can never reveal "on hover" poster text, so they get the title below instead */
const NO_HOVER = matchMedia('(hover: none)');
/* Smart TVs (the MKCinema Android TV / Fire TV app, LG webOS, TV browsers): a D-pad remote, sofa distance and a slow GPU */
const PUBLIC_ORIGIN = location.hostname === 'mkcinema.pages.dev' ? 'https://app.mkcinema.app' : location.origin;
const IS_TV = document.documentElement.classList.contains('tv') || /MKCinemaTV|Android TV|GoogleTV|AFT[A-Z]|SMART-TV|SmartTV|Web0S|webOS|Tizen|BRAVIA|Xbox|PlayStation/i.test(navigator.userAgent);
if (IS_TV) document.documentElement.classList.add('tv');
/* Phones and tablets: Chrome on Android can black out tiles of backdrop-filtered or 3D-layered elements while scrolling, so these get a flat, unblurred UI */
const TOUCH_UI = IS_TV || matchMedia('(pointer: coarse)').matches || NO_HOVER.matches;
const cardInfoMode = () => (CFG.cardInfo === 'hover' && NO_HOVER.matches ? 'below' : CFG.cardInfo);
