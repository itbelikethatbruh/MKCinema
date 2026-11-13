/* tablet fit: touch screens wider than a phone (tablets) get a side menu that slides away instead of taking a column */
(function () {
  if (typeof SideNav === 'undefined' || typeof IS_TV === 'undefined' || IS_TV) return;
  const de = document.documentElement, body = document.body, mq = matchMedia('(hover:none) and (pointer:coarse)');
  const on = () => de.classList.contains('side-hide');
  const wrap = () => document.querySelector('.dock-wrap');
  const fab = document.createElement('button');
  fab.id = 'sideFab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Menu');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg><span>Menu</span>';
  const scrim = document.createElement('div'); scrim.id = 'sideScrim';
  body.appendChild(scrim); body.appendChild(fab);
  const setX = (x) => { const w = wrap(); if (w) w.style.setProperty('transform', x == null ? '' : `translate3d(${x}px,0,0)`, x == null ? '' : 'important'); };
  const open = () => { if (!on()) return; setX(null); body.classList.add('side-open'); };
  const close = () => { if (!body.classList.contains('side-open')) return false; setX(null); scrim.style.opacity = ''; body.classList.remove('side-open'); if (document.activeElement && document.activeElement.closest('.dock-wrap')) document.activeElement.blur(); return true; };
  window.MKSide = { open, close };
  function apply() {
    const want = de.classList.contains('nav-side') && mq.matches && innerWidth >= 761;
    de.classList.toggle('side-hide', want);
    if (want) de.classList.remove('side-mini'); else close();
  }
  const a0 = SideNav.apply.bind(SideNav);
  SideNav.apply = function () { const r = a0.apply(this, arguments); apply(); return r; };
  apply();
  let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(apply, 120); });
  if (mq.addEventListener) mq.addEventListener('change', apply);
  fab.addEventListener('click', open);
  scrim.addEventListener('click', close);
  // picking anything in the menu closes it
  document.addEventListener('click', (e) => { if (on() && body.classList.contains('side-open') && e.target.closest && e.target.closest('.dock-wrap button, .dock-wrap a')) setTimeout(close, 60); }, true);
  // Back (Android, Esc) closes the menu first
  if (typeof back === 'function') { const b0 = back; back = function () { if (close()) return; return b0.apply(this, arguments); }; }
  // the menu button steps aside while reading down the page and comes back when scrolling up
  let lastY = scrollY, acc = 0;
  addEventListener('scroll', () => {
    if (!on()) return;
    const y = scrollY, d = y - lastY; lastY = y;
    if (y < 90) { acc = 0; body.classList.remove('fab-away'); return; }
    acc = (acc > 0) === (d > 0) ? acc + d : d;
    if (acc > 40) body.classList.add('fab-away'); else if (acc < -30) body.classList.remove('fab-away');
  }, { passive: true });
  // swipe in from the left edge (it follows the finger), swipe the open menu back out
  let g = null;
  const W = () => { const w = wrap(); return w ? w.getBoundingClientRect().width : 300; };
  addEventListener('touchstart', (e) => {
    if (!on() || e.touches.length !== 1) return;
    const t = e.touches[0], isOpen = body.classList.contains('side-open');
    if (!isOpen && (t.clientX > 44 || body.classList.contains('locked') || body.classList.contains('sd-open'))) return;
    if (isOpen && !(e.target.closest && e.target.closest('.dock-wrap, #sideScrim'))) return;
    g = { x: t.clientX, y: t.clientY, t: Date.now(), open: isOpen, w: W(), go: false, dx: 0 };
  }, { passive: true, capture: true });
  addEventListener('touchmove', (e) => {
    if (!g) return;
    const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (!g.go) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }
      if (Math.abs(dx) < 10 || (g.open ? dx > 0 : dx < 0)) return;
      g.go = true; body.classList.add('side-drag');
    }
    if (e.cancelable) e.preventDefault();
    g.dx = dx;
    const x = g.open ? Math.min(0, dx) : Math.min(0, -g.w + dx);
    setX(x); scrim.style.opacity = String(Math.max(0, Math.min(1, 1 + x / g.w)));
    if (!g.open) scrim.style.display = 'block';
  }, { passive: false, capture: true });
  const end = () => {
    if (!g) return; const s = g; g = null;
    if (!s.go) return;
    body.classList.remove('side-drag');
    const v = s.dx / Math.max(1, Date.now() - s.t);
    requestAnimationFrame(() => {
      setX(null); scrim.style.opacity = ''; scrim.style.display = '';
      if (s.open) { if (s.dx < -s.w * 0.3 || v < -0.45) close(); }
      else if (s.dx > s.w * 0.3 || v > 0.45) open();
    });
  };
  addEventListener('touchend', end, { capture: true }); addEventListener('touchcancel', end, { capture: true });
})();
