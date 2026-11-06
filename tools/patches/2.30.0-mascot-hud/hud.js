/* 2.30.0: the Anime page banner becomes a tactical HUD. Kitsune is a 2.5D puppet rig, a transparent WebP
   (anime/mascot-main.webp) with breathing and sway loops. Optional layered slices can replace her: tail, torso, head,
   eyes-blink, each a full-size transparent WebP on the same canvas. Behind her sit a reticle ring, chamfered plates,
   telemetry and a 4-bar equalizer, and a mechanical shutter opens them when the page loads. The speech bubble is now
   a dialogue cassette with a nameplate and a voice waveform, and it changes quotes every 8 s with a slide-up.
   Only transform and opacity animate. No filters, no backdrop-filter, no canvas. The loops pause when the banner is
   off screen or the tab is hidden. On TV and in Calm mode, only breathing and sway run. */
const MascotHud = {
  RIG: {
    main: 'anime/mascot-main.webp',
    fallback: 'anime/miko.svg',
    // fill these with same-canvas transparent WebPs to rig her in layers (an empty slot is skipped)
    slices: { tail: '', torso: '', head: '', 'eyes-blink': '' },
  },
  QUOTES: [
    'This arc gets so good!',
    'Trust me, the next episode hits different.',
    'Opening theme? We never skip it.',
    'Plot armor maxed. Hype maxed.',
    'Stay for the post-credits scene.',
  ],
  EVERY: 8000,
  timer: 0,
  io: null,
  seen: false,
  ring() {
    const ticks = Array.from({ length: 36 }, (_, i) => {
      const a = (i * 10) * Math.PI / 180, r1 = i % 3 ? 84 : 80, r2 = 88;
      return `M${(Math.cos(a) * r1).toFixed(1)} ${(Math.sin(a) * r1).toFixed(1)}L${(Math.cos(a) * r2).toFixed(1)} ${(Math.sin(a) * r2).toFixed(1)}`;
    }).join('');
    return `<svg class="hud-ring-spin" viewBox="-100 -100 200 200" fill="none" stroke-width="1" vector-effect="non-scaling-stroke">
      <circle r="97" stroke="#ff2d55" stroke-opacity=".55"/>
      <circle r="92" stroke="#d9b26a" stroke-opacity=".45" stroke-dasharray="2 7"/>
      <path d="${ticks}" stroke="#ff8fb4" stroke-opacity=".5"/>
      <path d="M-62 -44A76 76 0 0 1 62 -44M62 44A76 76 0 0 1 -62 44" stroke="#ff2d55" stroke-opacity=".8"/>
      <circle r="58" stroke="#ff8fb4" stroke-opacity=".28"/>
      <path d="M0 -58L50.2 29L-50.2 29Z" stroke="#d9b26a" stroke-opacity=".4"/>
      <path d="M0 58L50.2 -29L-50.2 -29Z" stroke="#ff2d55" stroke-opacity=".3"/>
      <path d="M0 -104l4 6h-8zM0 104l4 -6h-8zM-104 0l6 4v-8zM104 0l-6 4v-8z" fill="#d9b26a" stroke="none"/></svg>`;
  },
  rig() {
    const s = this.RIG.slices || {}, has = (k) => !!s[k];
    const layered = has('torso') || has('head');
    const img = (cls, src, extra = '') => `<img class="${cls}" src="${esc(src)}" alt="" decoding="async" draggable="false"${extra}>`;
    let inner = '';
    if (has('tail')) inner += img('rig-slice rig-tail', s.tail);
    if (layered) {
      if (has('torso')) inner += img('rig-slice rig-torso', s.torso);
      if (has('head')) inner += `<div class="rig-head">${img('rig-slice', s.head)}${has('eyes-blink') ? img('rig-slice rig-blink', s['eyes-blink']) : ''}</div>`;
    } else {
      inner += img('rig-main', this.RIG.main, ` data-fb="${esc(this.RIG.fallback)}"`);
      if (has('eyes-blink')) inner += img('rig-slice rig-blink', s['eyes-blink']);
    }
    return `<div class="mascot-rig"><div class="rig-sway"><div class="rig-breathe">${inner}</div></div></div>`;
  },
  cassette(q) {
    return `<div class="an-cass">
      <div class="cass-tab"><i class="cass-dot"></i>KITSUNE <b>// AI GUIDE</b></div>
      <div class="cass-body">
        <span class="cass-wave"><i></i><i></i><i></i></span>
        <span class="cass-q"><span class="q cur">${esc(q)}</span><span class="q nxt"></span></span>
        <i class="cass-tick a"></i><i class="cass-tick b"></i>
      </div>
      <div class="cass-foot">MKCINEMA_SYS<i class="hud-stripe"></i></div>
    </div>`;
  },
  html(q) {
    return `<div class="an-hud">
      <i class="hud-rim"></i>
      <div class="hud-ring">${this.ring()}</div>
      <div class="hud-plate p-top"><span class="hud-t">SYSTEM_ACTIVE</span><i class="hud-stripe"></i></div>
      <div class="hud-row">
        <div class="hud-plate p-sync"><span class="hud-t">SYNC <b>// 99.4%</b></span><span class="hud-eq"><i></i><i></i><i></i><i></i></span></div>
        <div class="hud-plate p-arc"><span class="hud-t">ARC_STATUS <b>// ACTIVE</b></span></div>
      </div>
      ${this.rig()}
      ${this.cassette(q)}
      <div class="hud-shutter"><i></i><i></i></div>
    </div>`;
  },
  /* turn the 2.22 splash into the HUD: drop the flat SVG girl and the white bubble */
  build(sp) {
    if (!sp || sp.classList.contains('hud')) return;
    const old = sp.querySelector('.an-bubble'), q = (old && old.textContent) || this.QUOTES[0];
    sp.querySelectorAll('.an-miko2,.an-bubble').forEach((x) => x.remove());
    sp.classList.add('hud');
    sp.insertAdjacentHTML('beforeend', this.html(q));
    this.i = Math.max(0, this.QUOTES.indexOf(q));
    const main = sp.querySelector('.rig-main');
    if (main) {
      const ok = () => main.classList.add('ready');
      if (main.complete && main.naturalWidth) ok(); else main.addEventListener('load', ok, { once: true });
      main.addEventListener('error', () => { const fb = main.dataset.fb; if (fb && !main.src.endsWith(fb)) { main.src = fb; main.classList.add('fb'); } }, { once: true });
    }
    sp.querySelectorAll('.rig-slice').forEach((im) => {
      const ok = () => im.classList.add('ready');
      if (im.complete && im.naturalWidth) ok(); else { im.addEventListener('load', ok, { once: true }); im.addEventListener('error', () => im.remove(), { once: true }); }
    });
    // the shutter is a one-off: drop its layers once it has opened
    const sh = sp.querySelector('.hud-shutter'); setTimeout(() => sh && sh.remove(), 1400);
    this.watch(sp);
  },
  /* loops run only while the banner is on screen and the tab is visible */
  watch(sp) {
    if (this.io) this.io.disconnect();
    this.sp = sp; this.seen = true;
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver((es) => { es.forEach((e) => { this.seen = e.isIntersecting; sp.classList.toggle('hud-off', !e.isIntersecting); }); });
      this.io.observe(sp);
    }
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), this.EVERY);
    this.talk();
  },
  talk() {
    const c = this.sp && this.sp.querySelector('.an-cass'); if (!c) return;
    c.classList.add('talk'); clearTimeout(this.tt); this.tt = setTimeout(() => c.classList.remove('talk'), 2400);
  },
  tick() {
    const sp = this.sp;
    if (!sp || !sp.isConnected) { clearInterval(this.timer); if (this.io) this.io.disconnect(); this.io = null; this.sp = null; return; }
    if (!this.seen || document.visibilityState !== 'visible' || !sp.offsetParent) return;
    const cur = sp.querySelector('.cass-q .cur'), nxt = sp.querySelector('.cass-q .nxt'); if (!cur || !nxt) return;
    this.i = (this.i + 1) % this.QUOTES.length;
    nxt.textContent = this.QUOTES[this.i];
    nxt.classList.add('below');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      nxt.classList.remove('below'); nxt.classList.replace('nxt', 'cur');
      cur.classList.replace('cur', 'nxt'); cur.classList.add('out');
      setTimeout(() => cur.classList.remove('out'), 520);
      this.talk();
    }));
  },
  init() {
    if (typeof AnimeComic === 'undefined' || !AnimeComic.splash) return;
    AnimeComic.LINES = this.QUOTES.slice();
    const s0 = AnimeComic.splash.bind(AnimeComic);
    AnimeComic.splash = function () {
      const r = s0.apply(this, arguments);
      try { MascotHud.build($('#animeBody .an-head .an-splash')); } catch (e) { console.warn('[hud]', e); }
      return r;
    };
    try { MascotHud.build($('#animeBody .an-head .an-splash')); } catch (e) { /* not on the Anime page yet */ }
  },
};
MascotHud.init();
