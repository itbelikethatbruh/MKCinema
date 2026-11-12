
'use strict';
/* =====================================================================
   MKCinema · core: utilities, storage, audio, Stremio engine
   ===================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const fmtTime = (t) => {
  if (!isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
const fmtBytes = (b) => {
  if (!b || !isFinite(b)) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b >= 10 || i < 2 ? 0 : 1)} ${u[i]}`;
};
const appLocale = () => { try { const c = I18N.code; if (!c || c === 'en') return undefined; const dev = String(navigator.language || '').toLowerCase(); return dev.split('-')[0] === c ? navigator.language : c === 'pt' ? 'pt-BR' : c; } catch (e) { return undefined; } };
const fmtDate = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString(appLocale(), { year: 'numeric', month: 'short', day: 'numeric' }); };
/* Icons: lucide's createIcons() rebuilds every icon already on the page on each call (200+ SVGs), which stalled TVs on
   every banner change. Here only new <i data-lucide> placeholders are drawn, each cloned from a cached template. */
const ICON_TPL = new Map();
const iconKey = (n) => n.replace(/(\w)(\w*)(_|-|\s*)/g, (g0, g1, g2) => g1.toUpperCase() + g2.toLowerCase());
const icons = () => {
  const L = window.lucide; if (!L) return;
  if (!L.icons || !L.createElement) { try { L.createIcons({ attrs: { 'aria-hidden': 'true' } }); } catch (e) { /* icons are cosmetic */ } return; }
  const list = document.querySelectorAll('i[data-lucide]');
  for (let k = 0; k < list.length; k++) {
    const el = list[k];
    try {
      const name = el.getAttribute('data-lucide');
      let tpl = ICON_TPL.get(name);
      if (tpl === undefined) { const node = L.icons[iconKey(name)]; if (!node && L.lazy) { L.lazy(); continue; } tpl = node ? L.createElement(node) : null; ICON_TPL.set(name, tpl); }
      if (!tpl || !el.parentNode) continue;
      const svg = tpl.cloneNode(true);
      svg.setAttribute('data-lucide', name); svg.setAttribute('aria-hidden', 'true');
      for (const a of el.attributes) if (a.name !== 'class') svg.setAttribute(a.name, a.value);
      svg.setAttribute('class', `lucide lucide-${name}${el.className ? ` ${el.className}` : ''}`);
      el.parentNode.replaceChild(svg, el);
    } catch (e) { /* icons are cosmetic */ }
  }
};
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
/* fetch with a time limit that also covers reading the body. Old TV WebViews without AbortSignal.timeout
   get the same behaviour from a controller and a timer. */
const fetchT = (url, opts = {}, ms = 8000) => {
  let sig; try { sig = AbortSignal.timeout(ms); } catch (e) { const c = new AbortController(); setTimeout(() => c.abort(), ms); sig = c.signal; }
  if (opts.signal) sig = AbortSignal.any ? AbortSignal.any([opts.signal, sig]) : opts.signal;
  return fetch(url, { ...opts, signal: sig });
};
const b64json = (obj) => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));

/* ---------------- Storage ---------------- */
/* 2.8 Seats: the library keys below belong to the seat in use; the main seat keeps the plain keys */
const SEAT_KEYS = ['watchlist', 'progress', 'watched', 'taste', 'recentSearches', 'bookmarks', 'slSkipped'];
const SEAT = (() => { try { const v = localStorage.getItem('mkc:seat') || ''; return /^[a-z0-9]{4,16}$/.test(v) ? v : ''; } catch (e) { return ''; } })();
const Store = {
  key(k) { return SEAT && SEAT_KEYS.includes(k) ? `mkc:seat:${SEAT}:${k}` : 'mkc:' + k; },
  /* a saved value only counts when it has the same shape as the default: a list for a list, an object for an object,
     and no null for a text or number. Anything else (an old format, a bad sync, a hand edit) gives the default back. */
  fit(v, d) {
    if (Array.isArray(d)) return Array.isArray(v) ? v : d;
    if (d && typeof d === 'object') return v && typeof v === 'object' && !Array.isArray(v) ? v : d;
    if (v === null && (typeof d === 'string' || typeof d === 'number')) return d;
    return v;
  },
  read(full, d) { try { const v = localStorage.getItem(full); return v == null ? d : Store.fit(JSON.parse(v), d); } catch (e) { return d; } },
  /* when the browser's storage is full, the caches that refill on their own make room so the user's own data still saves */
  write(full, v) {
    const json = JSON.stringify(v);
    try { localStorage.setItem(full, json); return true; } catch (e) { /* full or blocked */ }
    try {
      ['mfc', 'artCache', 'stillCache', 'kidsAgeCache', 'mdbCache'].forEach((c) => localStorage.removeItem('mkc:' + c));
      localStorage.setItem(full, json); return true;
    } catch (e) { return false; /* storage blocked: keep running in memory */ }
  },
  get(k, d) { return this.read(this.key(k), d); },
  set(k, v) { return this.write(this.key(k), v); },
  raw: {
    get(k, d) { return Store.read('mkc:' + k, d); },
    set(k, v) { return Store.write('mkc:' + k, v); },
  },
};

/* ---------------- Toasts ---------------- */
function toast(msg, kind = 'info', ms = 3600, key = '') {
  // The same message never stacks: a repeat (or one with the same key) replaces the one on screen, and at most three show at once
  const box = $('#toasts');
  [...box.children].forEach((t) => { if (t.dataset.msg === String(msg) || key && t.dataset.key === key) t.remove(); });
  while (box.children.length >= 3) box.firstElementChild.remove();
  const el = document.createElement('div'); el.dataset.msg = String(msg); if (key) el.dataset.key = key;
  el.className = `toast glass-solid ${kind === 'info' ? 't-info' : kind}`;
  el.innerHTML = `<i data-lucide="${kind === 'err' ? 'alert-triangle' : kind === 'ok' ? 'check-circle-2' : 'info'}"></i><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el); icons();
  setTimeout(() => { el.style.transition = 'opacity .4s, transform .4s'; el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; setTimeout(() => el.remove(), 420); }, ms);
}
async function copyText(text, msg = 'Copied to clipboard', ms) {
  try { await navigator.clipboard.writeText(text); toast(msg, 'ok', ms); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* fall through */ }
    ta.remove(); toast(ok ? 'Copied to clipboard' : 'Copy was blocked here. Select the text and copy it manually.', ok ? 'ok' : 'err'); return ok;
  }
}

/* ---------------- Procedural posters (used whenever an image cannot load) ---------------- */
const Posters = {
  cache: new Map(), MAX: 150,
  /* the same Noir placeholder as before, written as a small SVG (about 1 KB) instead of a canvas encoded to
     a 25 KB JPEG on the main thread (about 21 ms each on a phone). The newest 150 are kept. */
  make(title, seed, w = 400, h = 600) {
    const key = `${seed}|${w}x${h}`, hit = this.cache.get(key);
    if (hit) { this.cache.delete(key); this.cache.set(key, hit); return hit; }
    // Noir: graphite gradient, a soft platinum light and fine engraved lines; the seed only shifts the light
    const rnd = (() => { let s = hash(seed); return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296; })();
    const lx = (rnd() * w).toFixed(1), ly = (rnd() * h * .5).toFixed(1), x = (v) => String(v).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    let txt = '';
    if (h > w) {
      // Tall posters carry the title near the top so card overlays at the bottom never collide with it
      const fs = Math.round(w * .07), cw = fs * .7, max = w * .8;
      const words = String(title || 'MKCinema').toUpperCase().split(/\s+/); const lines = []; let line = '';
      for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (t.length * cw > max && line) { lines.push(line); line = wd; } else line = t; }
      lines.push(line);
      txt = `<rect x="${w * .1}" y="${w * .1}" width="${w * .1}" height="1.5" fill="#fff" fill-opacity=".55"/><g font-family="Sora,Helvetica Neue,Arial,sans-serif" font-weight="600" font-size="${fs}" fill="#f0f0f2" fill-opacity=".92">${
        lines.slice(0, 4).map((l, i) => `<text x="${w * .1}" y="${(w * .16 + i * fs * 1.18 + fs * .8).toFixed(1)}">${x(l)}</text>`).join('')}</g>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>`
      + `<linearGradient id="b" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="${h}"><stop offset="0" stop-color="#1b1b1e"/><stop offset=".6" stop-color="#0d0d0f"/><stop offset="1" stop-color="#050505"/></linearGradient>`
      + `<radialGradient id="l" gradientUnits="userSpaceOnUse" cx="${lx}" cy="${ly}" r="${(w * .9).toFixed(1)}"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
      + `<pattern id="p" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 9L9 0M-1 1L1 -1M8 10L10 8" stroke="#fff" stroke-opacity=".035"/></pattern></defs>`
      + `<rect width="${w}" height="${h}" fill="url(#b)"/><rect width="${w}" height="${h}" fill="url(#l)"/><rect width="${w}" height="${h}" fill="url(#p)"/>`
      + `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#fff" stroke-opacity=".08"/>${txt}</svg>`;
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    this.cache.set(key, url); if (this.cache.size > this.MAX) this.cache.delete(this.cache.keys().next().value);
    return url;
  },
};
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.fb === '1') return;
  // a rating poster (RPDB) that fails falls back to the normal poster first
  if (img.dataset.alt) { const alt = img.dataset.alt; delete img.dataset.alt; img.src = alt; return; }
  img.dataset.fb = '1';
  if (img.dataset.nofb === '1') { img.hidden = true; const alt = img.nextElementSibling; if (alt && alt.hasAttribute('data-logo-alt')) alt.hidden = false; return; }
  const wide = img.dataset.wide === '1';
  img.src = Posters.make(img.dataset.title || img.alt || '', img.dataset.seed || img.alt || 'x', wide ? 960 : 400, wide ? 540 : 600);
}, true);
/* bug-sweep-2.13.2 */
/* Some title logos are drawn in black and vanish on the dark banner. Each logo is measured once (a small copy fetched
   with CORS; hosts that refuse are left alone), and one that is mostly dark with a see-through background is shown in white. */
const LogoTone = {
  cache: new Map(),
  measure(src) {
    return new Promise((res) => {
      const t = new Image(); t.crossOrigin = 'anonymous'; t.referrerPolicy = 'no-referrer';
      t.onload = () => {
        try {
          const w = 64, h = Math.max(1, Math.min(64, Math.round(64 * t.naturalHeight / Math.max(1, t.naturalWidth))));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(t, 0, 0, w, h);
          const d = g.getImageData(0, 0, w, h).data; let solid = 0, dark = 0, clear = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 100) { clear++; continue; }
            solid++; if (Math.max(d[i], d[i + 1], d[i + 2]) < 72) dark++; // brightness, so a red or blue logo is never counted as dark
          }
          res(solid > 20 && clear / (w * h) > 0.15 && dark / solid > 0.6);
        } catch (e) { res(false); }
      };
      t.onerror = () => res(false);
      // images.metahub.space answers with a redirect that has no CORS header; its target (live.metahub.space) has one
      t.src = src.replace('//images.metahub.space/', '//live.metahub.space/');
    });
  },
  check(img) {
    const src = img.currentSrc || img.src; if (!src || /^data:/.test(src)) return;
    let v = this.cache.get(src);
    if (v === undefined) { v = this.measure(src); this.cache.set(src, v); v.then((x) => this.cache.set(src, x)); }
    Promise.resolve(v).then((dark) => { if (img.isConnected) img.classList.toggle('logo-dark', !!dark); });
  },
};
document.addEventListener('load', (e) => {
  const t = e.target;
  if (t instanceof HTMLImageElement && t.matches('.hero-logo, .pk-det-logo, #pLoadArt img')) LogoTone.check(t);
}, true);
/* 2.13.2 phones: Chrome's own lazy loading fetches posters several screens away, sideways inside rows too (~110 posters,
   ~3.8 MB, on the first Home load). Here a row's posters load once the row is within about two screens, and only as
   far as two screen widths past where the row is scrolled to. Same full-size images, just later. */
const PhoneImgs = {
  on: TOUCH_UI || IS_TV,
  BLANK: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
  rails: new Set(), io: null, raf: 0,
  show(im) { const u = im.dataset.lsrc; if (!u) return; delete im.dataset.lsrc; im.src = u; },
  // load a row's posters up to three row-widths past where it is scrolled to (layout offsets, so posters sliding in
  // with an animation count where they will rest)
  wake(rail) {
    const imgs = rail.querySelectorAll('img[data-lsrc]'); if (!imgs.length || !rail.clientWidth) return;
    const first = rail.firstElementChild, x0 = first ? first.offsetLeft : 0, lim = rail.scrollLeft + rail.clientWidth * (IS_TV ? 2 : 3);
    for (const im of imgs) { const c = im.closest('.rail > *') || im; if (c.offsetLeft - x0 < lim) this.show(im); else break; }
  },
  // every row within about two screens of the visible part of the page
  sweep() {
    // 2.68 household-plus: on TVs, image work waits until rows stop sliding, so decoding never competes with the move
    if (IS_TV && !this.calm) { clearTimeout(this.calmT); this.calmT = setTimeout(() => { this.calm = true; this.sweep(); this.calm = false; }, 140); return; }
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0; const h = innerHeight;
      for (const r of this.rails) {
        if (!r.isConnected) { this.rails.delete(r); continue; }
        const b = r.getBoundingClientRect(); if (b.height && b.bottom > -h * 2 && b.top < h * 3) this.wake(r);
      }
    });
  },
  watch(im) {
    const rail = im.closest('.rail');
    if (!rail) { this.io.observe(im); return; }
    if (!this.rails.has(rail)) { this.rails.add(rail); rail.addEventListener('scroll', () => this.sweep(), { passive: true }); }
    this.sweep();
  },
  init() {
    if (!this.on || !('IntersectionObserver' in window)) { this.on = false; return; }
    // posters outside rows (grids, lists) load as they come within two screens
    this.io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { this.io.unobserve(e.target); this.show(e.target); } }), { rootMargin: `${Math.round(innerHeight * 2)}px 0px` });
    const scan = (root) => { if (root.matches && root.matches('img[data-lsrc]')) this.watch(root); else if (root.querySelectorAll) root.querySelectorAll('img[data-lsrc]').forEach((im) => this.watch(im)); };
    new MutationObserver((ms) => { ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); })); this.sweep(); }).observe(document.documentElement, { childList: true, subtree: true });
    addEventListener('scroll', () => this.sweep(), { passive: true, capture: true }); addEventListener('resize', () => this.sweep());
    scan(document.documentElement);
  },
};
PhoneImgs.init();
const imgTag = (src, title, seed, { wide = false, cls = '', nofb = false, lazy = true, alt = '' } = {}) =>
  `<img ${src ? `src="${esc(src)}"` : `src="${Posters.make(title, seed, wide ? 960 : 400, wide ? 540 : 600)}" data-fb="1"`} ${src && alt ? `data-alt="${esc(alt)}"` : ''} alt="${esc(title)}" data-title="${esc(title)}" data-seed="${esc(seed)}" ${wide ? 'data-wide="1"' : ''} ${nofb ? 'data-nofb="1"' : ''} class="${cls}" ${lazy ? 'loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer">`.replace(lazy && src && PhoneImgs.on ? /^<img src="/ : /^\b$/, `<img src="${PhoneImgs.BLANK}" data-lsrc="`);

/* =====================================================================
   Procedural Web Audio synthesizer (zero dependencies)
   ===================================================================== */
class Sfx {
  constructor() { this.ctx = null; this.muted = Store.get('muted', false); }
  ensure() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : CFG.sfxVolume / 100;
      this.comp = this.ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.master.connect(this.comp).connect(this.ctx.destination);
      this.verb = this.ctx.createConvolver(); this.verb.buffer = IS_TV ? this.impulse(1.8, 2.6) : this.impulse(3.6, 3.2);
      this.verbGain = this.ctx.createGain(); this.verbGain.gain.value = .55;
      this.verb.connect(this.verbGain).connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  async unlock() { const c = this.ensure(); if (c && c.state !== 'running') { try { await c.resume(); } catch (e) { /* needs a gesture */ } } return !!c && c.state === 'running'; }
    impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i += 64) { const env = Math.pow(1 - i / len, decay), e = Math.min(len, i + 64); for (let j = i; j < e; j++) d[j] = (Math.random() * 2 - 1) * env; }
    }
    return b;
  }
  setMuted(m) {
    this.muted = m; Store.set('muted', m);
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : CFG.sfxVolume / 100, this.ctx.currentTime, .05);
  }
  setVolume() { if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(CFG.sfxVolume / 100, this.ctx.currentTime, .05); }
  /* Intro, part one: a slow, warm pad that breathes in (soft sines through a closing low-pass, long reverb). No sweep, no sub hit. */
  riser(dur = 2.6) {
    const c = this.ensure(); if (!c || this.muted || c.state !== 'running') return; const t = c.currentTime, end = t + dur + 3.2;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = .4;
    lp.frequency.setValueAtTime(380, t); lp.frequency.linearRampToValueAtTime(1500, t + dur); lp.frequency.linearRampToValueAtTime(700, end);
    const bus = c.createGain(); bus.gain.setValueAtTime(0, t); bus.gain.setTargetAtTime(1, t, dur * .32); bus.gain.setTargetAtTime(0, t + dur, .85);
    lp.connect(bus); bus.connect(this.master); bus.connect(this.verb);
    // D major 9, spread wide: D2 A2 F#3 C#4 E4
    [[73.42, .34], [110, .22], [185, .15], [277.18, .1], [329.63, .085]].forEach(([f, vol], i) => {
      for (const det of [-5, 5]) {
        const o = c.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = det;
        const g = c.createGain(); g.gain.value = vol / 2;
        const p = c.createStereoPanner ? c.createStereoPanner() : null;
        if (p) { p.pan.value = (det < 0 ? -1 : 1) * Math.min(.6, .12 + i * .1); o.connect(g).connect(p).connect(lp); } else o.connect(g).connect(lp);
        o.start(t); o.stop(end + .1);
      }
    });
  }
  /* Intro, part two: one soft, glassy chime as the monogram settles (bell partials, slow decay, mostly reverb) */
  chord() {
    const c = this.ensure(); if (!c || this.muted || c.state !== 'running') return; const t = c.currentTime;
    const bell = (f, at, vol, pan) => {
      [[1, 1], [2.0, .32], [3.01, .12], [4.2, .05]].forEach(([r, w]) => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
        const g = c.createGain(), st = t + at, len = 4.2 / Math.sqrt(r);
        g.gain.setValueAtTime(.0001, st); g.gain.exponentialRampToValueAtTime(vol * w, st + .012); g.gain.exponentialRampToValueAtTime(.0001, st + len);
        const p = c.createStereoPanner ? c.createStereoPanner() : null;
        const dry = c.createGain(); dry.gain.value = .55;
        if (p) { p.pan.value = pan; o.connect(g).connect(p); p.connect(dry).connect(this.master); p.connect(this.verb); }
        else { o.connect(g); g.connect(dry).connect(this.master); g.connect(this.verb); }
        o.start(st); o.stop(st + len + .05);
      });
    };
    bell(587.33, 0, .12, -.2);   // D5
    bell(880, .14, .085, .25);    // A5
    bell(1108.73, .3, .05, 0);   // C#6
    // a warm low bloom under the chime
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 146.83;
    const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.16, t + .35); g.gain.exponentialRampToValueAtTime(.0001, t + 3.4);
    o.connect(g); g.connect(this.master); g.connect(this.verb); o.start(t); o.stop(t + 3.5);
  }
}
const sfx = new Sfx();

/* =====================================================================
   Frame-rate meter: runs only while Settings › Performance › "Show frame rate" is on
   ===================================================================== */
const FpsMeter = {
  raf: 0, prev: 0, frames: [], lastReport: 0, onFps: null,
  set(on) { cancelAnimationFrame(this.raf); this.raf = 0; this.frames = []; this.prev = 0; if (on) this.raf = requestAnimationFrame((t) => this.tick(t)); },
  tick(now) {
    this.raf = requestAnimationFrame((t) => this.tick(t));
    if (this.prev) { const d = now - this.prev; if (d < 250) { this.frames.push(d); if (this.frames.length > 90) this.frames.shift(); } }
    this.prev = now;
    if (this.frames.length >= 30 && now - this.lastReport > 500) { this.lastReport = now; const avg = this.frames.reduce((x, y) => x + y, 0) / this.frames.length; if (this.onFps) this.onFps(1000 / avg); }
  },
};

/* =====================================================================
   Mood palette: map a title to a color (ambilight fallback for trailers)
   ===================================================================== */
const GENRE_MOOD = {
  horror: ['#ff2d55', '#5b0a1f'], thriller: ['#ff5d3a', '#3a0c50'], crime: ['#ff9f1c', '#43122b'], action: ['#ff6b2c', '#7c3aed'],
  'sci-fi': ['#00f0ff', '#2b37ff'], 'science fiction': ['#00f0ff', '#2b37ff'], fantasy: ['#a855f7', '#00f0ff'], adventure: ['#22d3ee', '#f59e0b'],
  animation: ['#f59e0b', '#ec4899'], family: ['#fbbf24', '#22d3ee'], comedy: ['#facc15', '#fb7185'], romance: ['#fb7185', '#a855f7'],
  drama: ['#7c3aed', '#1e3a8a'], documentary: ['#34d399', '#0ea5e9'], mystery: ['#6366f1', '#0f172a'], war: ['#a3a3a3', '#7f1d1d'],
  western: ['#d97706', '#78350f'], music: ['#ec4899', '#00f0ff'], history: ['#d6a35c', '#3f2d1d'], short: ['#00f0ff', '#f59e0b'],
};
function moodFor(meta) {
  if (!meta) return ['#00f0ff', '#7c3aed'];
  for (const g of (meta.genres || meta.genre || [])) { const m = GENRE_MOOD[String(g).toLowerCase()]; if (m) return m; }
  const h = hash(meta.id || meta.name) % 360;
  return [`hsl(${h}, 90%, 58%)`, `hsl(${(h + 70) % 360}, 80%, 45%)`];
}

/* =====================================================================
   Stream telemetry parser + scoring
   ===================================================================== */
const Telemetry = {
  parse(s) {
    const bh = s.behaviorHints || {};
    const text = [s.name, s.title, s.description, bh.filename].filter(Boolean).join('\n');
    const T = text.toLowerCase();
    let res = null;
    if (/\b(2160p|4k|uhd)\b/.test(T)) res = '4K UHD';
    else if (/\b(1440p|2k)\b/.test(T)) res = '1440p';
    else if (/\b(1080p|fhd|1080i)\b/.test(T)) res = '1080p';
    else if (/\b720p\b|\bhd\b/.test(T)) res = '720p';
    else if (/\b(576p|480p|360p|sd|dvdrip|cam|ts)\b/.test(T)) res = 'SD';
    let hdr = null;
    if (/dolby[\s.-]?vision|\bdovi\b|\bdv\b/.test(T)) hdr = 'Dolby Vision';
    else if (/hdr10\+|hdr10plus/.test(T)) hdr = 'HDR10+';
    else if (/\bhdr(10)?\b/.test(T)) hdr = 'HDR';
    const audio = [];
    if (/atmos/.test(T)) audio.push('Atmos');
    if (/truehd/.test(T)) audio.push('TrueHD');
    else if (/dts[\s.-]?(hd|x|ma)/.test(T)) audio.push('DTS-HD');
    else if (/\bdts\b/.test(T)) audio.push('DTS');
    if (/\b7[.\s]1\b/.test(T)) audio.push('7.1'); else if (/\b5[.\s]1\b/.test(T)) audio.push('5.1');
    if (!audio.length && /\b(ddp|e-?ac-?3|dd\+)\b/.test(T)) audio.push('DD+');
    let codec = null;
    if (/\b(hevc|x265|h\.?265)\b/.test(T)) codec = 'HEVC'; else if (/\bav1\b/.test(T)) codec = 'AV1'; else if (/\b(x264|h\.?264|avc)\b/.test(T)) codec = 'H.264';
    let size = bh.videoSize ? fmtBytes(bh.videoSize) : null;
    if (!size) { const m = text.match(/(\d+(?:[.,]\d+)?)\s?(TB|GB|GiB|MB|MiB)\b/i); if (m) size = `${m[1].replace(',', '.')} ${m[2].toUpperCase().replace('IB', 'B')}`; }
    const sizeBytes = bh.videoSize || (size ? parseFloat(size) * ({ TB: 1099511627776, GB: 1073741824, MB: 1048576 }[size.split(' ')[1]] || 1) : 0);
    const seeds = (text.match(/👤\s*(\d+)/) || [])[1];
    let source, kind;
    const url = s.url || '';
    if (s.ytId) { source = 'Trailer'; kind = 'yt'; }
    else if (s.externalUrl) { source = 'External'; kind = 'ext'; }
    else if (s.infoHash) { source = 'P2P InfoHash'; kind = 'p2p'; }
    else if (/\.m3u8(\?|$)/i.test(url) || /mpegurl/i.test(T)) { source = 'HLS Stream'; kind = 'hls'; }
    else if (url) { source = 'Instant HTTP/Debrid'; kind = 'http'; }
    else { source = 'Unknown'; kind = 'none'; }
    const isTrailer = kind === 'yt' || /\btrailer\b/i.test(s.name || '') || s._trailer;
    if (isTrailer && kind !== 'yt') source = 'Trailer';
    const mkv = /\.mkv(\?|$)/i.test(url) || /\.mkv\b/i.test(bh.filename || '');
    const webReady = (kind === 'http' || kind === 'hls') && bh.notWebReady !== true;
    const proxied = !!(bh.proxyHeaders && (bh.proxyHeaders.request || bh.proxyHeaders.response));
    const lines = String(s.title || s.description || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const headline = (s.name || '').replace(/\n/g, ' ').trim();
    let score = ({ '4K UHD': 400, '1440p': 340, '1080p': 300, '720p': 200, SD: 90 }[res] || 150);
    score += hdr === 'Dolby Vision' ? 34 : hdr === 'HDR10+' ? 30 : hdr ? 24 : 0;
    score += audio.includes('Atmos') ? 16 : 0; score += audio.includes('TrueHD') || audio.includes('DTS-HD') ? 10 : 0;
    score += audio.includes('7.1') ? 6 : audio.includes('5.1') ? 4 : 0;
    if (kind === 'hls') score += 6; if (mkv) score -= 60; if (codec === 'HEVC' || codec === 'AV1') score -= 20; // browser codec support is patchy
    if (isTrailer) score -= 1000;
    if (!webReady && kind !== 'yt') score -= 2000;
    const rank = { '4K UHD': 4, '1440p': 3.5, '1080p': 3, '720p': 2, SD: 1 }, ceiling = { '4k': 4, '1080': 3, '720': 2 }[CFG.maxQuality] || 4;
    if (res && rank[res] > ceiling) score -= 250;
    if ((CFG.preferFormat === 'hls' && kind === 'hls') || (CFG.preferFormat === 'mp4' && kind === 'http')) score += 40;
    return { res, hdr, audio, codec, size, sizeBytes, seeds, source, kind, isTrailer, mkv, webReady, proxied, lines, headline, score };
  },
  // compact: one audio tag and no codec/size/peers boxes (the stream row prints those as quiet text)
  badges(s, tel, addonName, compact) {
    const b = [];
    if (tel.res) b.push(`<span class="tb res ${tel.res === '4K UHD' ? 'k4' : ''}">${tel.res}</span>`);
    if (tel.hdr) b.push(`<span class="tb hdr">${tel.hdr}</span>`);
    if (compact && tel.audio.length) b.push(`<span class="tb aud">${tel.audio.join(' ')}</span>`);
    else tel.audio.forEach((a) => b.push(`<span class="tb aud">${a}</span>`));
    const cls = tel.kind === 'p2p' ? 'p2p' : tel.isTrailer ? 'trl' : tel.kind === 'ext' ? 'ext' : '';
    b.push(`<span class="tb src ${cls}">${tel.source}</span>`);
    if (tel.codec && !compact) b.push(`<span class="tb size">${tel.codec}</span>`);
    if (tel.size && !compact) b.push(`<span class="tb size">${esc(tel.size)}</span>`);
    if (tel.seeds && !compact) b.push(`<span class="tb size">${tel.seeds} peers</span>`);
    if (tel.proxied) b.push(`<span class="tb warn">needs headers</span>`);
    if (tel.mkv) b.push(`<span class="tb vlc">MKV · VLC recommended</span>`);
    if ((s.behaviorHints || {}).notWebReady) b.push(`<span class="tb warn">not web-ready</span>`);
    if (addonName) b.push(`<span class="tb by">${esc(addonName)}</span>`);
    return b.join('');
  },
};

/* 2.64 addon shield */
/* The last manifest each addon sent, kept on this device only (never synced, wiped with the account). Boot draws addons
   from it at once and asks their servers again in the background, so a slow or briefly down addon server no longer
   holds Home or drops the addon for the session. Entries are keyed by a hash of the link, so a link that carries a key is
   not written down a second time, and entries for addons no longer installed are dropped on the next save. */
const ManifestMemo = {
  K: 'mkc:mfc', MAX_ONE: 256 * 1024, MAX_ALL: 1536 * 1024,
  h(s) {
    let a = 0x811c9dc5, b = 0x9747b28c; s = String(s);
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822507); }
    return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36);
  },
  all() { try { const v = JSON.parse(localStorage.getItem(this.K) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } },
  get(base) { const e = this.all()[this.h(base)]; return e && e.m && typeof e.m === 'object' ? e : null; },
  put(base, m) {
    let txt; try { txt = JSON.stringify(m); } catch (e) { return; }
    const all = this.all(), k = this.h(base);
    if (txt.length > this.MAX_ONE) { if (all[k]) { delete all[k]; this.save(all); } return; }
    if (all[k] && JSON.stringify(all[k].m) === txt) return;
    all[k] = { t: Date.now(), m }; this.save(all);
  },
  keep(bases) {
    const want = new Set(bases.map((b) => this.h(b))), all = this.all(); let ch = false;
    for (const k of Object.keys(all)) if (!want.has(k)) { delete all[k]; ch = true; }
    if (ch) this.save(all);
  },
  save(all) {
    const ks = Object.keys(all).sort((x, y) => (all[x].t || 0) - (all[y].t || 0));
    let txt = JSON.stringify(all);
    while (txt.length > this.MAX_ALL && ks.length > 1) { delete all[ks.shift()]; txt = JSON.stringify(all); }
    try { localStorage.setItem(this.K, txt); } catch (e) { /* storage full or blocked: run without it */ }
  },
};

/* 2.68 household-plus: Home rows from the last visit, kept in Cache Storage (card fields only, 60 per row, 3 days).
   The first request for each plain catalog in a session answers from here and asks the addon in the background. */
const CatSnap = {
  C: 'mkc-catsnap-v1', served: new Set(), MAX: 60, TTL: 3 * 86400e3,
  key(cat) { return `https://mkc.local/snap/${encodeURIComponent(cat.addon.baseUrl)}/${encodeURIComponent(cat.type)}/${encodeURIComponent(cat.id)}`; },
  slim(m) { const o = {}; for (const k of ['id', 'type', 'name', 'poster', 'background', 'logo', 'releaseInfo', 'year', 'genres', 'imdbRating', 'description', 'posterShape', 'runtime']) if (m[k] != null) o[k] = m[k]; if (typeof o.description === 'string') o.description = o.description.slice(0, 400); return o; },
  async get(cat) {
    if (!window.caches) return null;
    try { const c = await caches.open(this.C), r = await c.match(this.key(cat)); if (!r) return null; const j = await r.json(); return Array.isArray(j.metas) && Date.now() - (j.at || 0) < this.TTL ? j.metas : null; } catch (e) { return null; }
  },
  put(cat, metas) {
    if (!window.caches || !metas || !metas.length) return;
    const body = JSON.stringify({ at: Date.now(), metas: metas.slice(0, this.MAX).map((m) => this.slim(m)) });
    caches.open(this.C).then((c) => c.put(this.key(cat), new Response(body, { headers: { 'content-type': 'application/json' } }))).catch(() => {});
  },
};

/* =====================================================================
   StremioEngine: protocol client for live addons + in-browser virtual addons
   ===================================================================== */
class StremioEngine {
  constructor() {
    this.addons = [];
    this.cache = new Map();
    this.offline = false;
    this.listeners = new Set();
    this.qualityCache = new Map();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev, data) { this.listeners.forEach((fn) => { try { fn(ev, data); } catch (e) { console.error(e); } }); }

  /* stremio:// -> https://, strip /manifest.json and trailing slashes */
  static normalize(input) {
    let u = String(input || '').trim();
    if (!u) throw new Error('Paste an addon link first.');
    if (/^stremio:\/\//i.test(u)) u = u.replace(/^stremio:\/\//i, 'https://');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
    let parsed; try { parsed = new URL(u); } catch (e) { throw new Error('That does not look like a valid addon link.'); }
    if (/^(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/.test(parsed.hostname) && parsed.protocol === 'https:' && input.trim().toLowerCase().startsWith('stremio://')) parsed.protocol = 'http:';
    let base = parsed.origin + parsed.pathname;
    base = base.replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
    return base;
  }
  /* Polymorphic resources: ["stream"] or [{ name, types, idPrefixes }] */
  static resources(manifest) {
    return (manifest.resources || []).map((r) => (typeof r === 'string'
      ? { name: r, types: manifest.types || [], idPrefixes: manifest.idPrefixes || null }
      : { name: r.name, types: r.types || manifest.types || [], idPrefixes: r.idPrefixes || manifest.idPrefixes || null }));
  }
  static catalogExtras(cat) {
    if (Array.isArray(cat.extra)) return cat.extra.map((e) => (typeof e === 'string' ? { name: e } : e));
    const sup = cat.extraSupported || [], req = cat.extraRequired || [];
    return sup.map((n) => ({ name: n, isRequired: req.includes(n) }));
  }
  supports(addon, resource, type, id) {
    if (!addon.enabled) return false;
    const r = StremioEngine.resources(addon.manifest).find((x) => x.name === resource);
    if (!r) return false;
    if (type && r.types && r.types.length && !r.types.includes(type)) return false;
    if (id && r.idPrefixes && r.idPrefixes.length && !r.idPrefixes.some((p) => String(id).startsWith(p))) return false;
    return true;
  }

  /* Route builders (IDs are always encodeURIComponent'ed) */
  static extraString(extra = {}) {
    return Object.entries(extra).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  }
  static catalogUrl(base, type, catId, extra) {
    const ex = StremioEngine.extraString(extra);
    return ex ? `${base}/catalog/${type}/${encodeURIComponent(catId)}/${ex}.json` : `${base}/catalog/${type}/${encodeURIComponent(catId)}.json`;
  }
  static metaUrl(base, type, id) { return `${base}/meta/${type}/${encodeURIComponent(id)}.json`; }
  static streamUrl(base, type, id) { return `${base}/stream/${type}/${encodeURIComponent(id)}.json`; }
  static subtitlesUrl(base, type, id, extra) {
    const ex = StremioEngine.extraString(extra);
    return ex ? `${base}/subtitles/${type}/${encodeURIComponent(id)}/${ex}.json` : `${base}/subtitles/${type}/${encodeURIComponent(id)}.json`;
  }
  static seriesId(imdbId, season, episode) { return `${imdbId}:${season}:${episode}`; }

  /* One request per address at a time (two rows asking for the same catalog share it), a capped cache, and one quiet
     retry when the connection drops or the addon's host answers 502/503/504 for a moment. A timeout is never retried. */
  http(url, { timeout = (CFG.timeout || 15) * 1000, ttl = 10 * 60 * 1000 } = {}) {
    const hit = this.cache.get(url);
    if (hit && Date.now() - hit.t < ttl) return Promise.resolve(hit.v);
    if (!this.flight) this.flight = new Map();
    if (this.flight.has(url)) return this.flight.get(url);
    const p = this.fetchJson(url, timeout).then((v) => {
      this.cache.delete(url); this.cache.set(url, { t: Date.now(), v });
      while (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
      return v;
    }).finally(() => { if (this.flight.get(url) === p) this.flight.delete(url); });
    this.flight.set(url, p);
    return p;
  }
  async fetchJson(url, timeout, tries = 2) {
    for (let i = 0; ; i++) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeout);
      try {
        const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.again = res.status === 502 || res.status === 503 || res.status === 504; throw e; }
        const text = await res.text();
        try { return JSON.parse(text.replace(/^﻿/, '')); } catch (e) { throw new Error('The addon did not answer with JSON'); }
      } catch (e) {
        if (e && e.name === 'AbortError') throw new Error('Timed out');
        if (i + 1 < tries && (e instanceof TypeError || e.again)) { await new Promise((r) => setTimeout(r, 700)); continue; }
        throw e;
      } finally { clearTimeout(timer); }
    }
  }
  async call(addon, resource, type, id, extra) {
    if (addon.virtual) return (await addon.handlers[resource]?.({ type, id, extra: extra || {} })) || {};
    if (resource === 'catalog' && extra) {
      // send only the extras the catalog declares; a page or a search it cannot do is simply empty
      const decl = ((addon.manifest && addon.manifest.catalogs) || []).find((c) => c && c.id === id && c.type === type);
      if (decl) {
        const names = new Set(StremioEngine.catalogExtras(decl).map((e) => e.name)), keep = {};
        for (const [k, v] of Object.entries(extra)) {
          if (v === undefined || v === null || v === '') continue;
          if (names.has(k)) keep[k] = v; else if (k === 'search' || (k === 'skip' && Number(v) > 0)) return { metas: [] };
        }
        extra = keep;
      }
    }
    const b = addon.baseUrl;
    const url = resource === 'catalog' ? StremioEngine.catalogUrl(b, type, id, extra)
      : resource === 'meta' ? StremioEngine.metaUrl(b, type, id)
      : resource === 'stream' ? StremioEngine.streamUrl(b, type, id)
      : resource === 'subtitles' ? StremioEngine.subtitlesUrl(b, type, id, extra)
      : `${b}/${resource}/${type}/${encodeURIComponent(id)}.json`;
    return this.http(url, { ttl: resource === 'stream' ? 2 * 60 * 1000 : 30 * 60 * 1000 });
  }

  /* ---------- Install / persist ---------- */
  validate(manifest) {
    if (!manifest || typeof manifest !== 'object') throw new Error('The link did not return a manifest.');
    if (!manifest.id || !manifest.name) throw new Error('The manifest is missing an id or name.');
    if (!Array.isArray(manifest.resources) || !manifest.resources.length) throw new Error('The manifest lists no resources.');
    return manifest;
  }
  async install(input, { builtin = false, enabled = true, silent = false, position } = {}) {
    const baseUrl = StremioEngine.normalize(input);
    const existing = this.addons.find((a) => a.baseUrl === baseUrl);
    const manifest = this.validate(await this.http(`${baseUrl}/manifest.json`, { ttl: 0, timeout: 12000 }));
    ManifestMemo.put(baseUrl, manifest);
    return this.mount(baseUrl, manifest, { builtin, enabled, silent, position });
  }
  /* puts an addon in the list from a manifest in hand (fresh, or the saved copy at boot) */
  mount(baseUrl, manifest, { builtin = false, enabled = true, silent = false, position, stale = null } = {}) {
    const existing = this.addons.find((a) => a.baseUrl === baseUrl);
    const addon = { id: manifest.id, baseUrl, manifest, enabled, builtin, virtual: false, error: null, stale };
    if (existing) Object.assign(existing, addon, { enabled: existing.enabled });
    else if (position != null) this.addons.splice(position, 0, addon); else this.addons.push(addon);
    this.persist(); if (!silent) this.emit('addons'); return existing || addon;
  }
  /* Asks addons drawn from saved manifests for a fresh one, four at a time, after Home is up. A changed manifest redraws
     once at the end; an addon whose server does not answer keeps working from the saved copy and is marked stale. */
  async refresh(bases) {
    const q = bases.slice(); let changed = false;
    const one = async () => {
      for (let base; (base = q.shift());) {
        const a = this.addons.find((x) => x.baseUrl === base && !x.virtual); if (!a) continue;
        try {
          const m = this.validate(await this.http(`${base}/manifest.json`, { ttl: 0, timeout: 12000 }));
          ManifestMemo.put(base, m); a.stale = null; a.error = null;
          if (JSON.stringify(m) !== JSON.stringify(a.manifest)) { a.manifest = m; a.id = m.id; changed = true; }
          if (base.includes('v3-cinemeta')) this.offline = false;
        } catch (e) {
          a.stale = (e && e.message) || String(e);
          if (base.includes('v3-cinemeta')) this.offline = true;
        }
      }
    };
    await Promise.all([one(), one(), one(), one()]);
    if (changed) { this.clearCache(); this.persist(); this.emit('addons'); }
    return changed;
  }
  placeholder(baseUrl, name, error, builtin, enabled = true) {
    const ex = this.addons.find((a) => a.baseUrl === baseUrl);
    const a = ex || { id: baseUrl, baseUrl, manifest: { id: baseUrl, name, version: '?', resources: [], types: [], catalogs: [] }, enabled, builtin, virtual: false };
    a.error = error; if (!ex) this.addons.push(a); return a;
  }
  mountVirtual(manifest, handlers, { builtin = false, studio = false, position } = {}) {
    const baseUrl = `mkc-virtual://${manifest.id}`;
    const ex = this.addons.find((a) => a.baseUrl === baseUrl);
    const enabled = ex ? ex.enabled : !(Store.get('disabled', []).includes(baseUrl));
    const addon = { id: manifest.id, baseUrl, manifest, handlers, enabled, builtin, studio, virtual: true, error: null };
    if (ex) Object.assign(ex, addon); else if (position != null) this.addons.splice(position, 0, addon); else this.addons.push(addon);
    this.clearCache(); this.persist(); this.emit('addons'); return ex || addon;
  }
  remove(baseUrl) { this.addons = this.addons.filter((a) => a.baseUrl !== baseUrl || a.builtin); this.clearCache(); this.persist(); this.emit('addons'); }
  toggle(baseUrl) { const a = this.addons.find((x) => x.baseUrl === baseUrl); if (a) { a.enabled = !a.enabled; this.clearCache(); this.persist(); this.emit('addons'); } }
  move(baseUrl, dir) {
    const i = this.addons.findIndex((x) => x.baseUrl === baseUrl), j = i + dir; if (i < 0 || j < 0 || j >= this.addons.length) return;
    [this.addons[i], this.addons[j]] = [this.addons[j], this.addons[i]]; this.persist(); this.emit('addons');
  }
  clearCache() { for (const k of [...this.cache.keys()]) if (!k.endsWith('/manifest.json')) this.cache.delete(k); }
  persist() {
    if (this.booting) return; // never save the half-loaded list during boot
    ManifestMemo.keep(this.addons.filter((a) => !a.virtual).map((a) => a.baseUrl));
    Store.set('addons', this.addons.filter((a) => !a.virtual && !a.builtin).map((a) => a.baseUrl));
    Store.set('order', this.addons.map((a) => a.baseUrl));
    Store.set('disabled', this.addons.filter((a) => !a.enabled).map((a) => a.baseUrl));
  }
  applyOrder() {
    const order = Store.get('order', []); if (!order.length) return;
    this.addons.sort((a, b) => { const ia = order.indexOf(a.baseUrl), ib = order.indexOf(b.baseUrl); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
  }

  /* ---------- Catalogs ---------- */
  catalogs({ type, includeRequired = false, needs } = {}) {
    const out = [];
    for (const a of this.addons) {
      if (!a.enabled || !this.supports(a, 'catalog')) continue;
      for (const c of (a.manifest.catalogs || [])) {
        if (type && c.type !== type) continue;
        const extras = StremioEngine.catalogExtras(c);
        const required = extras.filter((e) => e.isRequired).map((e) => e.name);
        if (needs && !extras.some((e) => e.name === needs)) continue;
        if (!includeRequired && required.length && !(needs && required.every((r) => r === needs))) continue;
        const genre = extras.find((e) => e.name === 'genre');
        out.push({ addon: a, type: c.type, id: c.id, name: c.name || c.id, extras, required, genres: (genre && genre.options) || c.genres || [], genreRequired: !!(genre && genre.isRequired) });
      }
    }
    return out;
  }
  async fetchCatalog(cat, extra = {}) {
    // an addon may send nulls, numbers as ids or no list at all: keep what is usable instead of failing the row
    const tidy = (r) => (Array.isArray(r && r.metas) ? r.metas : []).filter((m) => m && typeof m === 'object' && (typeof m.id === 'string' || typeof m.id === 'number') && String(m.id))
      .map((m) => ({ ...m, id: String(m.id), type: m.type || cat.type, _addon: cat.addon.manifest.name }));
    // a plain catalog (no page, genre or search) answers from the last visit first, once per session
    const plain = !cat.addon.virtual && !Object.values(extra || {}).some((v) => v !== undefined && v !== null && v !== '');
    if (plain && CFG.instantHome !== false) {
      const k = CatSnap.key(cat);
      if (!CatSnap.served.has(k)) {
        CatSnap.served.add(k);
        const snap = await CatSnap.get(cat);
        if (snap && snap.length) {
          this.call(cat.addon, 'catalog', cat.type, cat.id, extra).then((r) => CatSnap.put(cat, tidy(r))).catch(() => {});
          return snap.map((m) => ({ ...m, id: String(m.id), type: m.type || cat.type, _addon: cat.addon.manifest.name }));
        }
      }
    }
    const out = tidy(await this.call(cat.addon, 'catalog', cat.type, cat.id, extra));
    if (plain) CatSnap.put(cat, out);
    return out;
  }
  async search(q) {
    const cats = this.catalogs({ needs: 'search', includeRequired: true });
    const res = await Promise.allSettled(cats.map((c) => this.fetchCatalog(c, { search: q }).then((metas) => ({ c, metas }))));
    return res.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  }

  /* ---------- Meta ---------- */
  async fetchMeta(type, id) {
    const cands = this.addons.filter((a) => this.supports(a, 'meta', type, id));
    let lastErr, answered = false;
    for (const a of cands) {
      try { const r = await this.call(a, 'meta', type, id); if (r && r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)) return { ...r.meta, type: r.meta.type || type, _addon: a.manifest.name }; answered = true; }
      catch (e) { lastErr = e; }
    }
    // an addon that answered "not mine" counts; throw only when every addon failed
    if (lastErr && !answered) throw lastErr;
    return null;
  }

  /* ---------- Streams (parallel aggregation) ---------- */
  async fetchStreams(type, id, onPartial) {
    const cands = this.addons.filter((a) => this.supports(a, 'stream', type, id));
    const all = [], errors = [];
    await Promise.allSettled(cands.map(async (a) => {
      try {
        const r = await this.call(a, 'stream', type, id);
        const list = (Array.isArray(r && r.streams) ? r.streams : []).filter((s) => s && typeof s === 'object').map((s) => ({ ...s, _addon: a.manifest.name, _addonId: a.manifest.id, _tel: Telemetry.parse(s) }));
        all.push(...list); onPartial && onPartial(all.slice(), { addon: a, ok: true, count: list.length });
      } catch (e) { errors.push({ addon: a, error: e.message || String(e) }); onPartial && onPartial(all.slice(), { addon: a, ok: false, error: e.message }); }
    }));
    all.sort((x, y) => y._tel.score - x._tel.score);
    const best = all.find((s) => s._tel.webReady && !s._tel.isTrailer);
    if (best && best._tel.res) this.qualityCache.set(baseIdOf(id), [best._tel.res === '4K UHD' ? '4K' : best._tel.res, best._tel.hdr === 'Dolby Vision' ? 'DV' : best._tel.hdr ? 'HDR' : '', best._tel.audio.includes('Atmos') ? 'Atmos' : ''].filter(Boolean).join(' · '));
    return { streams: all, errors, addons: cands.length };
  }
  pickBest(streams, { bingeGroup } = {}) {
    // a source the debrid service has not cached yet only plays a "downloading" notice, so it is a last resort
    const ok = (s) => s._tel.cached !== false;
    /* 2.26.1: never auto-pick a trailer */ if (bingeGroup) { const m = streams.find((s) => s.behaviorHints?.bingeGroup === bingeGroup && ok(s) && s._tel.webReady && !s._tel.isTrailer && !s.ytId); if (m) return m; }
    // a trailer is never a stand-in for the film: with no playable source the caller opens the source list instead
    const film = (s) => s._tel.webReady && !s._tel.isTrailer && !s.ytId;
    return streams.find((s) => film(s) && ok(s)) || streams.find(film) || null;
  }

  /* ---------- Subtitles ---------- */
  async fetchSubtitles(type, id, extra) {
    const cands = this.addons.filter((a) => this.supports(a, 'subtitles', type, id));
    const res = await Promise.allSettled(cands.map(async (a) => { const r = await this.call(a, 'subtitles', type, id, extra); return (Array.isArray(r && r.subtitles) ? r.subtitles : []).filter((s) => s && typeof s === 'object' && typeof s.url === 'string').map((s) => ({ ...s, _addon: a.manifest.name })); }));
    return res.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  }
  /* Any supported subtitle text -> WebVTT: SRT, VTT, ASS/SSA, MicroDVD .sub */
  static toVtt(text, name = '') {
    const t = String(text).replace(/^\uFEFF/, '');
    const raw = /^\s*WEBVTT/.test(t) ? t : /\[Events\]/i.test(t) || /\.(ass|ssa)$/i.test(name) ? StremioEngine.assToVtt(t) : /^\s*\{\d+\}\{\d*\}/.test(t) ? StremioEngine.microDvdToVtt(t) : StremioEngine.srtToVtt(t);
    return StremioEngine.tidyVtt(raw) || raw;
  }
  /* Real-world SRT files often have a blank line holding spaces, a missing blank line, an end time before the start, or a line
     that lasts minutes. Browsers then keep that line on screen. The cues are read again line by line and written out clean:
     a cue ends before the next one starts, and none lasts longer than 12 s. */
  static tidyVtt(text) {
    const T = /^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})(.*)$/;
    const sec = (v) => { const p = v.replace(',', '.').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n'), cues = [];
    let cur = null;
    for (let i = 0; i < lines.length; i++) {
      const m = T.exec(lines[i]);
      if (m) {
        // a cue number written right above the timing line belongs to the new cue, not to the old one's text
        if (cur && cur.text.length && /^\s*\d+\s*$/.test(cur.text[cur.text.length - 1])) cur.text.pop();
        cur = { s: sec(m[1]), e: sec(m[2]), set: (m[3] || '').trim(), text: [] }; cues.push(cur); continue;
      }
      if (!lines[i].trim()) { cur = null; continue; }
      if (cur) cur.text.push(lines[i].trim());
    }
    const out = cues.map((c) => ({ ...c, body: c.text.join('\n').replace(/<(?!\/?(b|i|u)>)[^>]+>/gi, '').trim() })).filter((c) => c.body && isFinite(c.s) && isFinite(c.e)).sort((a, b) => a.s - b.s);
    if (!out.length) return null;
    // identical start: one cue with both lines; otherwise a cue stops where the next begins
    const merged = [];
    for (const c of out) { const last = merged[merged.length - 1]; if (last && Math.abs(last.s - c.s) < 0.01) { if (last.body !== c.body) last.body += `\n${c.body}`; last.e = Math.max(last.e, c.e); } else merged.push(c); }
    merged.forEach((c, i) => {
      const n = merged[i + 1];
      if (!(c.e > c.s)) c.e = c.s + 3;
      if (c.e - c.s > 12) c.e = c.s + 12;
      if (n && c.e > n.s) c.e = Math.max(c.s + 0.2, n.s);
    });
    const ok = (v) => /^(line|position|align|size|vertical):\S+$/.test(v);
    return 'WEBVTT\n\n' + merged.map((c) => `${StremioEngine.vttTime(c.s)} --> ${StremioEngine.vttTime(c.e)}${c.set ? ' ' + c.set.split(/\s+/).filter(ok).join(' ') : ''}\n${c.body}`).join('\n\n') + '\n';
  }
  static vttTime(sec) {
    sec = Math.max(0, sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
  }
  static assToVtt(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n'); let fmt = null, inEvents = false; const cues = [];
    const ts = (v) => { const m = /(\d+):(\d{1,2}):(\d{1,2})[.:](\d{1,3})/.exec(v); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +('0.' + m[4]) : 0; };
    for (const line of lines) {
      if (/^\[Events\]/i.test(line)) { inEvents = true; continue; }
      if (/^\[/.test(line)) { inEvents = false; continue; }
      if (!inEvents) continue;
      if (/^Format:/i.test(line)) { fmt = line.slice(7).split(',').map((x) => x.trim().toLowerCase()); continue; }
      if (!/^Dialogue:/i.test(line) || !fmt) continue;
      const parts = line.slice(9).split(','); const textIdx = fmt.indexOf('text');
      const f = Object.fromEntries(fmt.map((k, i) => [k, i === textIdx ? parts.slice(i).join(',') : (parts[i] || '').trim()]));
      const body = f.text.replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').replace(/\\h/g, ' ').trim();
      if (body) cues.push([ts(f.start), ts(f.end), body]);
    }
    cues.sort((a, b) => a[0] - b[0]);
    return 'WEBVTT\n\n' + cues.map(([a, b, x], i) => `${i + 1}\n${StremioEngine.vttTime(a)} --> ${StremioEngine.vttTime(b)}\n${x}`).join('\n\n') + '\n';
  }
  static microDvdToVtt(text, fps = 23.976) {
    const out = [];
    text.replace(/\r\n?/g, '\n').split('\n').forEach((line) => {
      const m = /^\{(\d+)\}\{(\d*)\}(.*)$/.exec(line.trim()); if (!m) return;
      if (m[1] === '1' && m[2] === '1' && /^\d+(\.\d+)?$/.test(m[3])) { fps = parseFloat(m[3]); return; }
      const a = +m[1] / fps, b = (m[2] ? +m[2] : +m[1] + fps * 3) / fps;
      out.push(`${StremioEngine.vttTime(a)} --> ${StremioEngine.vttTime(b)}\n${m[3].replace(/\{[^}]*\}/g, '').split('|').join('\n')}`);
    });
    return 'WEBVTT\n\n' + out.join('\n\n') + '\n';
  }
  static srtToVtt(text) {
    let t = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
    if (/^WEBVTT/.test(t)) return t + '\n';
    t = t.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, (m, a, b) => `${a.padStart(8, '0')}.${b.padEnd(3, '0')}`);
    t = t.replace(/\{\\an?\d+\}/g, '');
    return 'WEBVTT\n\n' + t + '\n';
  }
}
