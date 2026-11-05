/* =====================================================================
   MKCinema 2.22.0 · Anime look, comic edition (Drake, 2026-11-05)
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
    return `<svg class="an-logo ${cls}" viewBox="0 0 440 130" role="img" aria-label="MKCinema">
      <path d="M8 96L60 18L432 6L388 92Z" fill="#140818"/><path d="M14 92L62 22L424 12L382 88Z" fill="var(--an-red)"/>
      <path d="M40 104L250 100" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/><path d="M70 111L230 108" stroke="var(--an-red)" stroke-width="3" stroke-linecap="round"/>
      <g class="an-logo-t" transform="skewX(-10)">
        <text x="78" y="80" fill="#140818">MK</text><text x="72" y="74" fill="#fff">MK</text>
        <text x="226" y="70" class="s" fill="#140818">CINEMA</text><text x="222" y="66" class="s" fill="#fff">CINEMA</text>
      </g>
      <text x="384" y="116" class="k" text-anchor="end" fill="#ffd1df">エムケー・シネマ</text>
      <path d="M420 20l4 9l9 4l-9 4l-4 9l-4-9l-9-4l9-4Z" fill="#fff"/></svg>`;
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
