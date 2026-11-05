/* ---------------- 2.11.0 Side menu (optional) and a simpler Appearance ----------------
   The main menu can sit on top (as before) or down the left side, the layout TV apps use. Desktop and TV get a
   side rail: wide screens keep it open with labels, narrower screens and TVs show icons and open it with the
   names when the pointer or the remote reaches it. Phones get a menu button that slides a drawer in from the left.
   The choice is per device (a phone and a TV can differ), offered once on opening and kept in Settings › Appearance.
   Appearance itself is cut down to the menu choice, one colour wheel and the text and poster options. */
const SideNav = {
  side() { return Store.raw.get('navMode', 'top') === 'side'; },
  set(mode, { quiet = false } = {}) {
    Store.raw.set('navMode', mode); Store.raw.set('navAsked', true);
    this.apply();
    if (!quiet) toast(mode === 'side' ? 'Side menu on. Change it any time in Settings › Appearance' : 'Top menu on. Change it any time in Settings › Appearance', 'ok', 3200, 'navmode');
  },
  apply() {
    const de = document.documentElement, on = this.side();
    de.classList.toggle('nav-side', on);
    // a desktop wide enough keeps the rail open; narrower screens and TVs open it when it is reached
    de.classList.toggle('side-mini', on && (IS_TV || innerWidth < 1200));
    if (typeof DockFit !== 'undefined') DockFit.run();
    if (!on) this.close();
    if (IS_TV) Nav.settle();
  },
  lastContent: null,
  toRail(from, fast) { this.lastContent = from; const t = $('#tabs .tab.on') || $('#tabs .tab'); if (t) Nav.focus(t, fast); },
  /* ---- phone drawer ---- */
  items() {
    const tabs = $$('#tabs .tab').filter((t) => getComputedStyle(t).display !== 'none' || !IS_TV).map((t) => ({ view: t.dataset.view, icon: (t.querySelector('[data-lucide]') || {}).dataset ? t.querySelector('[data-lucide]').dataset.lucide : 'circle', label: ((t.querySelector('.lbl') || t).textContent || t.title).trim() }));
    const tools = [['openPalette', 'search', 'Search'], ['openAddons', 'puzzle', 'Addons'], ['openAccount', 'circle-user-round', 'Account'], ['openParty', 'users', 'Watch party'], ['openSettings', 'settings-2', 'Settings']].filter(([id]) => $(`#${id}`));
    return { tabs, tools };
  },
  open() {
    let d = $('#sideDrawer');
    if (!d) {
      d = document.createElement('div'); d.id = 'sideDrawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Menu');
      document.body.appendChild(d);
    }
    const { tabs, tools } = this.items(), cur = ($('#tabs .tab.on') || {}).dataset ? $('#tabs .tab.on').dataset.view : 'home';
    d.innerHTML = `<div class="sd-scrim" data-sdclose></div><nav class="sd-panel" aria-label="Menu">
      <div class="sd-top"><span class="sd-brand">MK<em>Cinema</em></span><button type="button" class="ibtn" data-nav data-sdclose aria-label="Close menu"><i data-lucide="x"></i></button></div>
      <div class="sd-list">${tabs.map((t) => `<button type="button" data-nav data-sdview="${esc(t.view)}" class="${t.view === cur ? 'on' : ''}"><i data-lucide="${esc(t.icon)}"></i><span>${esc(t.label)}</span></button>`).join('')}</div>
      <div class="sd-list sd-tools">${tools.map(([id, ic, l]) => `<button type="button" data-nav data-sdtool="${id}"><i data-lucide="${ic}"></i><span>${l}</span></button>`).join('')}</div></nav>`;
    icons();
    $$('[data-sdclose]', d).forEach((x) => x.addEventListener('click', () => this.close()));
    $$('[data-sdview]', d).forEach((x) => x.addEventListener('click', () => { this.close(); go(x.dataset.sdview); }));
    $$('[data-sdtool]', d).forEach((x) => x.addEventListener('click', () => { this.close(); const t = $(`#${x.dataset.sdtool}`); if (t) t.click(); }));
    d.hidden = false; requestAnimationFrame(() => d.classList.add('open'));
    document.body.classList.add('sd-open');
  },
  close() {
    const d = $('#sideDrawer'); if (!d || d.hidden) return false;
    d.classList.remove('open'); document.body.classList.remove('sd-open');
    setTimeout(() => { if (!d.classList.contains('open')) d.hidden = true; }, 260);
    return true;
  },
  /* ---- the one-time question ---- */
  ask() {
    if (Store.raw.get('navAsked', false)) return;
    const busy = () => document.body.classList.contains('intro-on') || !$('#tour').hidden || document.body.classList.contains('layer-open') || !$('#player').hidden || $$('.x8-layer:not([hidden]), .layer-ov:not([hidden])').length;
    let n = 0;
    const wait = () => { if (Store.raw.get('navAsked', false)) return; if (busy() && n++ < 240) { setTimeout(wait, 1000); return; } if (!busy()) this.chooser(); };
    setTimeout(wait, 2500);
  },
  chooser() {
    X8.layer('navPick', { label: 'Menu', icon: 'panel-left', eyebrow: 'New' });
    X8.backHook.navPick = () => { Store.raw.set('navAsked', true); return false; };
    const b = X8.body('navPick'), cur = this.side() ? 'side' : 'top';
    b.innerHTML = `<h3 class="x8-h">Top menu or side menu?</h3><p class="x8-p">MKCinema can now put its menu down the left side, the way most TV apps do. Pick the one you like. You can switch any time in Settings › Appearance.</p>
      <div class="nav-opts" role="radiogroup" aria-label="Menu position">${this.optHTML(cur)}</div>`;
    this.bindOpts(b, true);
    X8.open('navPick'); icons();
    if (IS_TV) { const c = $('.nav-opt.on', b); if (c) Nav.focus(c, true); }
  },
  optHTML(cur) {
    const pic = (m) => `<span class="no-pic ${m}"><i class="no-bar"></i><i class="no-hero"></i><i class="no-row"></i><i class="no-row"></i></span>`;
    return [['top', 'Top menu', 'The menu runs across the top. The current layout.'], ['side', 'Side menu', IS_TV ? 'Icons down the left. Press Left to open it with names.' : TOUCH_UI && innerWidth <= 760 ? 'A menu button slides the sections in from the left.' : 'Sections listed down the left, like a TV app.']]
      .map(([id, t, d]) => `<button type="button" class="nav-opt ${id === cur ? 'on' : ''}" role="radio" aria-checked="${id === cur}" data-nav data-navmode="${id}">${pic(id)}<b>${t}</b><small>${d}</small></button>`).join('');
  },
  bindOpts(root, closeAfter) {
    $$('[data-navmode]', root).forEach((x) => x.addEventListener('click', () => {
      $$('[data-navmode]', root).forEach((y) => { const on = y === x; y.classList.toggle('on', on); y.setAttribute('aria-checked', on); });
      if (closeAfter) X8.close('navPick');
      this.set(x.dataset.navmode, { quiet: !closeAfter });
      if (!closeAfter && IS_TV) { const n = $(`[data-navmode="${x.dataset.navmode}"]`, root); if (n) Nav.focus(n, true); }
    }));
  },
  init() {
    // side menu button for phones (hidden in top mode and on bigger screens)
    const dock = $('.dock');
    if (dock && !$('#sideBtn')) dock.insertAdjacentHTML('afterbegin', '<button type="button" class="ibtn" id="sideBtn" data-nav aria-label="Menu" title="Menu"><i data-lucide="menu"></i></button>');
    const sb = $('#sideBtn'); if (sb) sb.onclick = () => this.open();
    // DockFit works out the top bar's rows; the side rail has nothing to fit
    if (typeof DockFit !== 'undefined') { const run = DockFit.run.bind(DockFit); DockFit.run = function () { if (SideNav.side() && innerWidth > 760) { ['dk1', 'dk2', 'dk3', 'dkw'].forEach((c) => document.body.classList.remove(c)); document.body.style.removeProperty('--dock-h'); return; } return run(); }; }
    // TV: Left from the first thing on a row (or the banner's Play) opens the rail; Right from the rail returns
    const mv = Nav.move.bind(Nav);
    Nav.move = function (dir, fast) {
      const a = document.activeElement, side = IS_TV && SideNav.side() && Nav.root().id === 'app' && a && a !== document.body;
      if (side && dir === 'left' && !a.closest('.dock-wrap')) {
        if (a.id === 'heroPlay' || (a.matches('.rail>.card, .rail>.net-tile') && !Nav.step(a, 'left'))) { SideNav.toRail(a, fast); return; }
        const r = mv(dir, fast); if (document.activeElement === a) SideNav.toRail(a, fast); return r;
      }
      if (side && dir === 'right' && a.closest('.dock-wrap')) { const b = SideNav.lastContent; if (b && b.isConnected && !b.closest('[hidden]')) { Nav.focus(b, fast); return; } }
      return mv(dir, fast);
    };
    const b0 = back; back = function () { if (SideNav.close()) return; return b0.apply(this, arguments); };
    addEventListener('resize', () => { if (this.side()) document.documentElement.classList.toggle('side-mini', IS_TV || innerWidth < 1200); });
    // TV: a remote leaving the open rail to the right closes it at once
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    this.apply(); icons();
    this.ask();
  },
};
SideNav.init();

/* ---------------- Colour wheel: one hue for the whole app ----------------
   The wheel drives the same token recolouring the built-in looks use (Atelier), so contrast, focus rings and the TV
   light-on-dark rules hold for every colour. "Classic black" returns to Noir. */
const Wheel = {
  STEP: 15,
  hue() { const a = CFG.atelier || {}; return CFG.look === 'atelier' && typeof a.hue === 'number' ? a.hue : null; },
  html() {
    const h = this.hue(), noir = !CFG.look || CFG.look === 'noir';
    return `<div class="cw-wrap"><div class="cw" id="cwRing" role="slider" tabindex="0" data-nav aria-label="Colour" aria-valuemin="0" aria-valuemax="359" aria-valuenow="${h == null ? 0 : h}" aria-valuetext="${h == null ? 'Classic black' : `Hue ${h}`}" style="--h:${h == null ? 0 : h}">
        <span class="cw-knob"${h == null ? ' hidden' : ''}></span><span class="cw-mid"><b>MK</b><small>${h == null ? (noir ? 'Classic black' : 'Built-in look') : 'Your colour'}</small></span></div>
      <div class="cw-side"><b>Colour</b><small>${IS_TV ? 'Select the wheel, then press Left and Right to turn it.' : 'Tap or drag around the wheel. The whole app follows, and it syncs to your account.'}</small>
        <button class="btn btn-ghost btn-sm ${noir ? 'on' : ''}" type="button" data-nav id="cwNoir"><i data-lucide="circle"></i>Classic black</button></div></div>`;
  },
  preview(h) {
    const a = { ...Atelier.get(), hue: ((Math.round(h) % 360) + 360) % 360 };
    let st = $('#atelier'); if (!st) { st = document.createElement('style'); st.id = 'atelier'; document.head.appendChild(st); }
    st.textContent = Atelier.css(a); document.documentElement.setAttribute('data-look', 'atelier');
    const r = $('#cwRing'); if (r) { r.style.setProperty('--h', a.hue); r.setAttribute('aria-valuenow', a.hue); r.setAttribute('aria-valuetext', `Hue ${a.hue}`); const k = $('.cw-knob', r); if (k) k.hidden = false; const s = $('.cw-mid small', r); if (s) s.textContent = 'Your colour'; }
    const nb = $('#cwNoir'); if (nb) nb.classList.remove('on');
    return a;
  },
  commit(a) { Atelier.apply(a); },
  bind() {
    const r = $('#cwRing'); if (!r) return;
    const at = (e) => { const b = r.getBoundingClientRect(), x = e.clientX - (b.left + b.width / 2), y = e.clientY - (b.top + b.height / 2); return (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360; };
    let drag = false, last = null, raf = 0;
    r.addEventListener('pointerdown', (e) => { drag = true; r.setPointerCapture(e.pointerId); last = this.preview(at(e)); });
    r.addEventListener('pointermove', (e) => { if (!drag) return; const h = at(e); cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { last = this.preview(h); }); });
    const end = () => { if (!drag) return; drag = false; cancelAnimationFrame(raf); if (last) this.commit(last); };
    r.addEventListener('pointerup', end); r.addEventListener('pointercancel', end);
    let t = 0;
    r.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: IS_TV ? 0 : -1, ArrowUp: IS_TV ? 0 : 1 }[e.key];
      if (!d) return; e.preventDefault(); e.stopPropagation();
      const cur = this.hue(); const base = $('#cwRing').style.getPropertyValue('--h'); const h = (cur == null && !last ? 0 : +base) + d * this.STEP;
      last = this.preview(h); clearTimeout(t); t = setTimeout(() => this.commit(last), 450);
    });
    $('#cwNoir').onclick = () => { setCfg('look', 'noir'); renderSettingsBody(); if (IS_TV) { const n = $('#cwNoir'); if (n) Nav.focus(n, true); } };
  },
};
/* Appearance, simplified: menu, colour, then text and posters. The four look cards, the Atelier builder and
   the colour-code import are gone from the page; a look already chosen keeps working. */
(() => {
  const p = Atelier.params.bind(Atelier);
  Atelier.params = function (a) { if (a && typeof a.hue === 'number') return { hd: a.hue, sd: 0.36, lift: 0.034, sl: 0.2, ha: a.hue, sa: 0.42 }; return p(a); };
  const sec = secById('appearance'); if (!sec) return;
  sec.intro = 'Pick where the menu sits and one colour for the whole app. All of it stays dark and quiet so nothing competes with the posters.';
  const rows = sec.rows;
  sec.rows = () => {
    const r = rows().filter((d) => !(d.html && (d.html === lookHTML || (typeof d.html === 'function' && String(d.html()).includes('id="atelierBox"')))));
    return [
      { group: 'Menu' },
      { html: () => `<div class="nav-opts set-navopts" role="radiogroup" aria-label="Menu position">${SideNav.optHTML(SideNav.side() ? 'side' : 'top')}</div>` },
      { group: 'Colour' },
      { html: () => Wheel.html() },
      { group: 'Text' },
      ...r,
    ];
  };
  const bind = sec.bind;
  sec.bind = () => { if (bind) bind(); Wheel.bind(); const box = $('#setBody .set-navopts'); if (box) SideNav.bindOpts(box, false); };
})();
