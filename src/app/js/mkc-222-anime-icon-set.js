
'use strict';
/* Anime icon set: bold ink strokes in currentColor with one crimson accent (var(--an-red)). 24x24, same box as lucide. */
const AN_ICONS = {
  house: '<path d="M2 11.5Q12 3 22 11.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M4.5 9.6Q12 4.2 19.5 9.6L18.4 11.4Q12 7.6 5.6 11.4Z" fill="var(--an-red)"/><path d="M5.5 11.5V20.5H18.5V11.5M10 20.5V15H14V20.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
  clapperboard: '<path d="M3.5 10H20.5V20.5H3.5Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M3 9.6L19.6 4.5L20.6 7.8L4 12.9Z" fill="var(--an-red)" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.2 7.9L10 11.2M13 6.4L14.8 9.7" stroke="currentColor" stroke-width="1.8"/><path d="M7 14.5H17M7 17.2H13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  tv: '<path d="M7.5 2.5L10.5 6.5M16.5 2.5L13.5 6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M4 7.2L6.4 4.4L8 7.2M16 7.2L17.6 4.4L20 7.2" fill="var(--an-red)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><rect x="2.5" y="7" width="19" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M6.5 11L9 9.5" stroke="var(--an-red)" stroke-width="2" stroke-linecap="round"/><path d="M8 20.5L7 22.5M16 20.5L17 22.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  torii: '<path d="M1.5 5Q12 2.4 22.5 5L21.6 7.4Q12 5.4 2.4 7.4Z" fill="var(--an-red)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 10.5H20" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M6.5 6.8V21.5M17.5 6.8V21.5M12 6.4V10.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  'radio-tower': '<path d="M12 9L7.5 22M12 9L16.5 22M9.2 17H14.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7.5" r="2.2" fill="var(--an-red)"/><path d="M5.8 3.2Q3.6 7.5 5.8 11.8M18.2 3.2Q20.4 7.5 18.2 11.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M13.6 1.6L11.4 5.2H13.2L11.6 8" fill="none" stroke="var(--an-red)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  bookmark: '<rect x="4" y="3" width="3" height="18" rx="1.5" fill="var(--an-red)" stroke="currentColor" stroke-width="1.6"/><rect x="17" y="3" width="3" height="18" rx="1.5" fill="var(--an-red)" stroke="currentColor" stroke-width="1.6"/><path d="M7 5H17V19H7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9.5 8.5H14.5M9.5 11.5H14.5M9.5 14.5H12.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  'calendar-days': '<rect x="3" y="5" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3 9.5H21" stroke="currentColor" stroke-width="2.2"/><path d="M8 2.8V6.5M16 2.8V6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><g transform="translate(12 15.2)" fill="var(--an-red)"><path d="M0 0C-1.6-1-1.6-3.6 0-4.2C1.6-3.6 1.6-1 0 0Z"/><path d="M0 0C-1.6-1-1.6-3.6 0-4.2C1.6-3.6 1.6-1 0 0Z" transform="rotate(72)"/><path d="M0 0C-1.6-1-1.6-3.6 0-4.2C1.6-3.6 1.6-1 0 0Z" transform="rotate(144)"/><path d="M0 0C-1.6-1-1.6-3.6 0-4.2C1.6-3.6 1.6-1 0 0Z" transform="rotate(216)"/><path d="M0 0C-1.6-1-1.6-3.6 0-4.2C1.6-3.6 1.6-1 0 0Z" transform="rotate(288)"/></g>',
  blocks: '<path d="M14.5 3.5L20.5 9.5L11 19L5 19L5 13Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M5 19L3 21.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M14.5 3.5L20.5 9.5L18.3 11.7L12.3 5.7Z" fill="var(--an-red)"/><path d="M8.5 15.5L13 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.4 15.4L21 21" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M10.5 6.6Q10.5 10.5 14.4 10.5Q10.5 10.5 10.5 14.4Q10.5 10.5 6.6 10.5Q10.5 10.5 10.5 6.6Z" fill="var(--an-red)"/>',
  puzzle: '<path d="M4 7H8.5A2.2 2.2 0 1 1 12.5 7H17V11.5A2.2 2.2 0 1 1 17 15.5V20H12.5A2.2 2.2 0 1 0 8.5 20H4V15.5A2.2 2.2 0 1 0 4 11.5Z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/><path d="M20 1.5Q20 4 22.5 4Q20 4 20 6.5Q20 4 17.5 4Q20 4 20 1.5Z" fill="var(--an-red)"/>',
  'circle-user-round': '<path d="M5 8.5L5.6 2.8L9.6 6.2M19 8.5L18.4 2.8L14.4 6.2" fill="var(--an-red)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8.6 12.2Q9.6 11 10.6 12.2M13.4 12.2Q14.4 11 15.4 12.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10.4 15.5Q12 16.8 13.6 15.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  users: '<circle cx="9" cy="8.5" r="4.2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M2.5 21Q3 14.5 9 14.5Q15 14.5 15.5 21" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="17" cy="7.5" r="3" fill="var(--an-red)"/><path d="M16.5 13Q21 13 21.5 18.5" fill="none" stroke="var(--an-red)" stroke-width="2.2" stroke-linecap="round"/>',
  'settings-2': '<path d="M12 2.5L14 5.2L17.3 4.6L17.6 8L20.6 9.6L19.2 12.6L20.6 15.6L17.6 17.2L17.3 20.6L14 20L12 22.5L10 20L6.7 20.6L6.4 17.2L3.4 15.6L4.8 12.6L3.4 9.6L6.4 8L6.7 4.6L10 5.2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 8.6L13 11.2L15.6 11.4L13.6 13.1L14.2 15.7L12 14.3L9.8 15.7L10.4 13.1L8.4 11.4L11 11.2Z" fill="var(--an-red)"/>',
  'volume-2': '<path d="M3 9.5H7L12 5V19L7 14.5H3Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M15.5 8.5Q17.5 12 15.5 15.5M18.5 6Q22 12 18.5 18" fill="none" stroke="var(--an-red)" stroke-width="2.2" stroke-linecap="round"/>',
  'folder-open': '<path d="M3 6.5V19H19L21.5 10.5H7L4.5 19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M3 6.5V4.5H9L11 6.5H18V10.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M8 10.5H21.5L19 19H5.6Z" fill="var(--an-red)" opacity=".85"/>',
};

/* =====================================================================
   MKCinema 2.22.0 · Anime look, comic edition
   The Anime look turns into a manga: a new MKCinema anime logo, Dela Gothic One titles with ink and crimson
   shadows, an anime icon set, comic-panel posters and caption-box row titles, slash wipes between sections,
   impact bursts on presses, a redrawn Miko and a layered night city with parallax.

   Safety: effects come in two levels.
   - Calm (TVs, phones and tablets that are not high-end, Low graphics, Reduce motion): everything is a still
     picture. Same logo, fonts, icons and panels, no movement.
   - Full (computers and high-end phones): parallax scene, 3D poster tilt, slash wipes and bursts. Everything
     moves with transform and opacity only; no backdrop-filter and no preserve-3d inside rows. If frames start
     dropping, it falls back to Calm by itself and says so once.
   Settings › Appearance › Anime effects: Auto, Full or Calm. The Home featured banner itself never moves.
   ===================================================================== */
const AnimeComic = {
  on: () => document.documentElement.getAttribute('data-look') === 'anime',
  fontsAsked: false,
  strong() {
    if (IS_TV) return false;
    const c = navigator.hardwareConcurrency || 4, m = navigator.deviceMemory || 8;
    return m >= 4 && (TOUCH_UI ? c >= 8 : c >= 4);
  },
  wantFull() {
    if (!this.on() || IS_TV || CFG.reduceMotion || !document.body.classList.contains('fx')) return false;
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (e) { /* old browser */ }
    const m = CFG.animeFx || 'auto';
    if (m === 'calm') return false;
    if (m === 'full') return true;
    return this.strong() && !Store.raw.get('animeFxDropped', false);
  },
  /* ---------- logo ---------- */
  mark() {
    return `<svg class="an-mark" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 2L38 22L58 14L46 31L62 42L41 44L44 62L32 48L20 62L23 44L2 42L18 31L6 14L26 22Z" fill="var(--an-red)" stroke="#140818" stroke-width="3" stroke-linejoin="round"/><text x="33.5" y="41.5" text-anchor="middle" class="an-mk-t" fill="#140818">MK</text><text x="32" y="40" text-anchor="middle" class="an-mk-t" fill="#fff">MK</text></svg>`;
  },
  logo(cls = '') {
    /* 2.28.3: the big logo's shadow lives inside the svg (viewBox units, so it shrinks with the logo on phones) and
       skips the small katakana line, which a fixed 6 px CSS shadow used to double. */
    const sh = /\bbig\b/.test(cls) ? 'anLsh' + (this.lsh = (this.lsh || 0) + 1) : '';
    return `<svg class="an-logo ${cls}" viewBox="0 0 440 130" role="img" aria-label="MKCinema">${sh ? `<defs><filter id="${sh}" x="-5%" y="-5%" width="115%" height="125%"><feDropShadow dx="5" dy="5" stdDeviation="0" flood-color="#140818" flood-opacity=".85"/></filter></defs>` : ''}
      <g${sh ? ` filter="url(#${sh})"` : ''}><path d="M8 96L60 18L432 6L388 92Z" fill="#140818"/><path d="M14 92L62 22L424 12L382 88Z" fill="var(--an-red)"/>
      <path d="M40 104L250 100" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/><path d="M70 111L230 108" stroke="var(--an-red)" stroke-width="3" stroke-linecap="round"/>
      <g class="an-logo-t" transform="skewX(-10)">
        <text x="78" y="80" fill="#140818">MK</text><text x="72" y="74" fill="#fff">MK</text>
        <text x="226" y="70" class="s" fill="#140818">CINEMA</text><text x="222" y="66" class="s" fill="#fff">CINEMA</text>
      </g>
      <path d="M420 20l4 9l9 4l-9 4l-4 9l-4-9l-9-4l9-4Z" fill="#fff"/></g>
      <text x="384" y="116" class="k" text-anchor="end" fill="#ffd1df" stroke="#140818" stroke-width="3" stroke-linejoin="round" paint-order="stroke">エムケー・シネマ</text></svg>`;
  },
  /* ---------- fonts: only fetched when the look is on ---------- */
  fonts() {
    if (this.fontsAsked) return; this.fontsAsked = true;
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Dela+Gothic+One&display=swap';
    document.head.appendChild(l);
  },
  /* ---------- icons ---------- */
  ROOTS: '#tabs, #mtabs, .dock-tools, #sideDrawer, .x8-tabs',
  icons() {
    const on = this.on();
    $$(this.ROOTS).forEach((root) => $$('svg[data-lucide]', root).forEach((s) => {
      const n = s.getAttribute('data-lucide'), alt = AN_ICONS[n];
      if (!alt) return;
      if (on && !s.dataset.anIc) { s.dataset.anOrig = s.innerHTML; s.innerHTML = alt; s.dataset.anIc = '1'; s.classList.add('an-ic'); }
      else if (!on && s.dataset.anIc) { s.innerHTML = s.dataset.anOrig || ''; delete s.dataset.anIc; delete s.dataset.anOrig; s.classList.remove('an-ic'); }
    }));
  },
  /* ---------- brand ---------- */
  brand() {
    const b = $('.dock .brand'); if (!b) return;
    if (this.on() && !b.querySelector('.an-mark')) b.insertAdjacentHTML('afterbegin', this.mark());
  },
  /* ---------- scene ---------- */
  scene() {
    if ($('#anScene')) return;
    const d = document.createElement('div'); d.id = 'anScene'; d.setAttribute('aria-hidden', 'true');
    d.innerHTML = '<i class="l0"></i><i class="l2"></i><i class="l3"></i>';
    document.body.prepend(d);
  },
  par: { x: 0, y: 0, tx: 0, ty: 0, raf: 0 },
  parallax() {
    const p = this.par;
    const tick = () => {
      p.raf = 0;
      p.x += (p.tx - p.x) * 0.12; p.y += (p.ty - p.y) * 0.12;
      const sc = this.cssScroll ? 0 : Math.min(scrollY, 1400), L = $$('#anScene i');
      const f = [[0, 0], [26, 0.08], [40, 0.12]];
      for (let i = 1; i < 3 && L[i]; i++) L[i].style.transform = `translate3d(${(-p.x * f[i][0]).toFixed(1)}px,${(-p.y * f[i][0] * 0.5 - sc * f[i][1]).toFixed(1)}px,0)`;
      if (Math.abs(p.tx - p.x) > 0.002 || Math.abs(p.ty - p.y) > 0.002) p.raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!p.raf && document.documentElement.classList.contains('an-fx')) p.raf = requestAnimationFrame(tick); };
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; p.tx = e.clientX / innerWidth - 0.5; p.ty = e.clientY / innerHeight - 0.5; kick(); }, { passive: true });
    // scrolling moves the layers on the compositor where the browser can (scroll-driven animations); otherwise here
    this.cssScroll = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()'));
    if (!this.cssScroll) addEventListener('scroll', kick, { passive: true });
    this.kick = kick;
  },
  /* ---------- 3D poster tilt: one element at a time, no preserve-3d ---------- */
  tilt() {
    let cur = null;
    const off = () => { if (cur) { cur.style.removeProperty('--rx'); cur.style.removeProperty('--ry'); cur.style.removeProperty('--gx'); cur.classList.remove('an-tilt'); cur = null; } };
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !document.documentElement.classList.contains('an-fx')) return off();
      const c = e.target.closest && e.target.closest('.card');
      if (c !== cur) off();
      if (!c) return;
      const ci = c.querySelector('.card-inner'); if (!ci) return;
      const r = ci.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      cur = c; c.classList.add('an-tilt');
      c.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`); c.style.setProperty('--rx', `${(-y * 12).toFixed(2)}deg`); c.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`);
    }, { passive: true });
    document.addEventListener('pointerleave', off);
  },
  /* ---------- slash wipe between sections ---------- */
  SFX: ['ズバッ', 'シュッ', 'ドン', 'バーン', 'ザッ'],
  sfxN: 0,
  slash() {
    if (!document.documentElement.classList.contains('an-fx')) return;
    let s = $('#anSlash');
    if (!s) { s = document.createElement('div'); s.id = 'anSlash'; s.setAttribute('aria-hidden', 'true'); s.innerHTML = '<i class="a"></i><i class="b"></i><i class="c"></i><b></b>'; document.body.appendChild(s); }
    s.querySelector('b').textContent = this.SFX[this.sfxN++ % this.SFX.length];
    s.classList.remove('go'); void s.offsetWidth; s.classList.add('go');
    clearTimeout(this.slashT); this.slashT = setTimeout(() => s.classList.remove('go'), 700);
  },
  /* ---------- impact burst on a press ---------- */
  burst(x, y) {
    if (!document.documentElement.classList.contains('an-fx')) return;
    const b = document.createElement('div'); b.className = 'an-burst'; b.setAttribute('aria-hidden', 'true');
    b.style.left = `${x}px`; b.style.top = `${y}px`;
    b.innerHTML = `<svg viewBox="-50 -50 100 100">${Array.from({ length: 12 }, (_, i) => `<path d="M0 -18L3 -44L-3 -44Z" transform="rotate(${i * 30 + (i % 2) * 8})" fill="${i % 3 ? '#fff' : 'var(--an-red)'}"/>`).join('')}</svg>`;
    document.body.appendChild(b); setTimeout(() => b.remove(), 520);
  },
  /* ---------- Anime page: a comic splash with Miko and the logo ---------- */
  LINES: ['Yōkoso! What are we watching tonight?', 'One more episode. Promise.', 'Snacks ready? Let’s go!', 'Subs or dub? I won’t judge.', 'This arc gets so good!'],
  splash() {
    const h = $('#animeBody .an-head'); if (!h || !this.on() || h.querySelector('.an-splash')) return;
    $$('.an-miko', h).forEach((x) => x.remove());
    const line = this.LINES[Math.floor(Date.now() / 3.6e6) % this.LINES.length];
    h.classList.add('an-comic');
    h.insertAdjacentHTML('afterbegin', `<div class="an-splash" aria-hidden="true"><i class="an-lines"></i>${this.logo('big')}<img class="an-miko2" src="anime/miko.svg" alt="" decoding="async"><span class="an-bubble">${esc(line)}</span></div>`);
  },
  /* ---------- frame watchdog: Full drops to Calm when this device struggles ---------- */
  watch() {
    if ((CFG.animeFx || 'auto') !== 'auto') return;
    let n = 0, slow = 0, last = performance.now(); const t0 = last;
    const f = (now) => {
      const dt = now - last; last = now;
      if (document.visibilityState === 'visible' && dt < 400) { n++; if (dt > 34) slow++; }
      if (now - t0 < 6000 && document.documentElement.classList.contains('an-fx')) return requestAnimationFrame(f);
      if (n > 60 && slow / n > 0.3) { Store.raw.set('animeFxDropped', true); this.apply(); toast('Anime effects calmed down to keep things smooth. Settings › Appearance can turn them back on.', 'info', 5200, 'anfx'); }
    };
    requestAnimationFrame(f);
  },
  apply() {
    const de = document.documentElement, on = this.on(), full = this.wantFull(), was = de.classList.contains('an-fx');
    de.classList.toggle('an-fx', full);
    de.classList.toggle('an-calm', on && !full);
    if (on) { this.fonts(); this.scene(); this.brand(); }
    this.icons();
    if (on !== this.wasOn) { this.wasOn = on; if (typeof DockFit !== 'undefined') requestAnimationFrame(() => DockFit.run()); }
    if (on && S.view === 'anime') this.splash();
    if (full && !was) { this.watch(); if (this.kick) this.kick(); }
    if (!full) $$('#anScene i').forEach((i) => { i.style.transform = ''; });
  },
  init() {
    if (typeof LOOKS !== 'undefined' && LOOKS.anime) Object.assign(LOOKS.anime, { label: 'Anime', blurb: 'A manga night: comic panels, slash wipes, a new logo and Miko. Effects scale to your device.', l0: '#0a0410', lb: '#3a0d34', li: '#fff', la: '#ff2d55' });
    this.parallax(); this.tilt();
    // the burst frame and the popped icons reach past the menu bar on purpose: measure the bar without them
    if (typeof DockFit !== 'undefined') { const o = DockFit.over.bind(DockFit); DockFit.over = function () { const de = document.documentElement; if (!AnimeComic.on()) return o(); de.classList.add('an-measure'); try { return o(); } finally { de.classList.remove('an-measure'); } }; }
    const g0 = go; go = function (view) { const prev = S.view, r = g0.apply(this, arguments); if (AnimeComic.on()) { if (view !== prev) AnimeComic.slash(); if (view === 'anime') setTimeout(() => AnimeComic.splash(), 0); AnimeComic.icons(); } return r; };
    if (typeof AnimeHub !== 'undefined') { const ar = AnimeHub.render.bind(AnimeHub); AnimeHub.render = function () { const r = ar.apply(this, arguments); AnimeComic.splash(); return r; }; }
    if (typeof SideNav !== 'undefined') { const so = SideNav.open.bind(SideNav); SideNav.open = function () { const r = so.apply(this, arguments); AnimeComic.icons(); const t = $('#sideDrawer .sd-brand'); if (t && AnimeComic.on() && !t.querySelector('.an-logo')) t.insertAdjacentHTML('afterbegin', AnimeComic.logo('sd')); return r; }; }
    document.addEventListener('pointerdown', (e) => {
      if (!document.documentElement.classList.contains('an-fx')) return;
      const t = e.target.closest && e.target.closest('.btn-prime, #tabs .tab, #mtabs button, .card');
      if (t) this.burst(e.clientX, e.clientY);
    }, { passive: true });
    CFG_HOOKS.push((k) => { if (k === 'look' || k === 'reduceMotion' || k === 'animeFx' || k === 'quality') setTimeout(() => this.apply(), 0); });
    // icon re-renders in the dock (account picture, language change) get the anime set again
    try { const mo = new MutationObserver(() => { if (this.on()) this.icons(); }); $$('#tabs, #mtabs, .dock-tools').forEach((r) => mo.observe(r, { childList: true, subtree: true })); } catch (e) { /* cosmetic */ }
    // Settings › Appearance: Anime effects (only while the Anime look is on)
    const ap = secById('appearance');
    if (ap) {
      const rows = ap.rows;
      ap.rows = () => {
        const r = typeof rows === 'function' ? rows() : rows;
        if (!this.on() || IS_TV) return r;
        return [...r, { group: 'Anime effects' }, { key: 'animeFx', label: 'Anime effects', help: `Full adds the moving night city, 3D posters, slash wipes and impact bursts. Calm keeps the same look, still. Auto picks Full on fast computers and high-end phones, and steps down by itself if frames drop.${Store.raw.get('animeFxDropped', false) ? ' Auto stepped down on this device.' : ''}`, type: 'seg', options: [['auto', 'Auto'], ['full', 'Full'], ['calm', 'Calm']] }];
      };
    }
    CFG_HOOKS.push((k, v) => { if (k === 'animeFx' && v !== 'auto') Store.raw.set('animeFxDropped', false); });
    // the body.fx class (graphics quality) can change after boot
    try { new MutationObserver(() => this.apply()).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e) { /* cosmetic */ }
    this.apply();
  },
};
AnimeComic.init();
