
(() => {
  // Long rows of choice buttons become one dropdown each. The original buttons stay in the page (hidden) and the
  // dropdown clicks them, so every page keeps its own logic. TVs keep their rows: they are made for the remote.
  const de = document.documentElement;
  const TARGETS = [
    { sel: '.mu-chips', ok: (c) => !!c.querySelector(':scope > .mu-lab'), label: (c) => c.querySelector(':scope > .mu-lab').textContent.trim() },
    { sel: '.mu-chips', ok: (c) => !!c.querySelector(':scope > [data-mrtag]'), label: () => 'Category' },
    { sel: '#discGenres', ok: () => true, label: () => 'Genre' },
    // 2.83.7: the network and universe pages had a sideways-scrolling row of names
    { sel: '.net-switch', ok: () => true, label: (c) => (c.querySelector('[data-nsw]') ? 'Network' : 'Category') },
  ];
  const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  let menu = null, owner = null;
  const items = (c) => [...c.children].filter((k) => k.matches('button,.chip'));
  const paint = (c) => {
    const b = c._mkPick; if (!b) return;
    const on = items(c).find((k) => k.classList.contains('on') || k.getAttribute('aria-pressed') === 'true' || k.getAttribute('aria-selected') === 'true');
    const sig = c._mkLabel + '|' + (on ? on.textContent.trim() : '');
    if (b._sig === sig) return; b._sig = sig;
    b.innerHTML = on ? `<small></small><b></b>${CHEV}` : `<span></span>${CHEV}`;
    if (on) { b.children[0].textContent = c._mkLabel; b.children[1].textContent = on.textContent.trim(); } else b.children[0].textContent = c._mkLabel;
  };
  const close = (focus) => {
    if (!menu) return; const m = menu, o = owner; menu = owner = null;
    if (o && o._mkPick) { o._mkPick.setAttribute('aria-expanded', 'false'); if (focus) o._mkPick.focus(); }
    m.classList.remove('in'); setTimeout(() => m.remove(), 200);
  };
  const open = (c) => {
    close(); const b = c._mkPick; owner = c;
    menu = document.createElement('div'); menu.id = 'mkPickMenu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', c._mkLabel);
    let bg = getComputedStyle(document.body).backgroundColor; if (!bg || /rgba?\([^)]*,\s*0\)$/.test(bg) || bg === 'transparent') bg = getComputedStyle(de).backgroundColor;
    if (!bg || /,\s*0\)$/.test(bg) || bg === 'transparent') bg = '#141418';
    menu.style.background = bg; menu.style.color = getComputedStyle(document.body).color;
    let sel = null;
    items(c).forEach((k) => {
      const it = document.createElement('button'); it.type = 'button'; it.setAttribute('role', 'menuitemradio');
      const on = k.classList.contains('on') || k.getAttribute('aria-pressed') === 'true';
      it.setAttribute('aria-checked', on ? 'true' : 'false'); it.textContent = k.textContent.trim(); if (on) sel = it;
      it.addEventListener('click', (e) => { e.stopPropagation(); close(true); k.click(); });
      menu.appendChild(it);
    });
    document.body.appendChild(menu); b.setAttribute('aria-expanded', 'true');
    const r = b.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, below = vh - r.bottom - 16, above = r.top - 16;
    const up = below < 220 && above > below;
    menu.style.maxHeight = Math.max(160, Math.min(up ? above : below, 460)) + 'px';
    const w = menu.offsetWidth; menu.style.left = Math.max(12, Math.min(r.left, vw - w - 12)) + 'px';
    if (up) menu.style.bottom = (vh - r.top + 6) + 'px'; else menu.style.top = (r.bottom + 6) + 'px';
    requestAnimationFrame(() => { if (menu) { menu.classList.add('in'); const f = sel || menu.firstElementChild; if (f) { f.focus({ preventScroll: true }); if (sel) menu.scrollTop = Math.max(0, sel.offsetTop - menu.clientHeight / 2); } } });
  };
  const adopt = (c, t) => {
    if (c._mkPick && c._mkPick.isConnected && c.previousElementSibling === c._mkPick) { c._mkLabel = t.label(c); paint(c); return; }
    if (c._mkPick) c._mkPick.remove();
    if (items(c).length < 6) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mk-pick-btn'; b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('data-nav', '');
    b.addEventListener('click', (e) => { e.stopPropagation(); owner === c && menu ? close() : open(c); });
    c._mkPick = b; c._mkLabel = t.label(c); c.classList.add('mk-pick-src'); c.parentNode.insertBefore(b, c); paint(c);
  };
  let q = 0;
  const scan = () => {
    q = 0;
    if (de.classList.contains('tv')) return;
    TARGETS.forEach((t) => document.querySelectorAll(t.sel).forEach((c) => { if (t.ok(c)) adopt(c, t); }));
    document.querySelectorAll('.mk-pick-btn').forEach((b) => { const n = b.nextElementSibling; if (!n || n._mkPick !== b) b.remove(); });
    if (menu && owner && !owner.isConnected) close();
    const mini = document.getElementById('muMini');
    de.classList.toggle('mk-mini-on', !!(mini && !mini.classList.contains('gone') && mini.childElementCount));
  };
  const poke = () => { if (!q) q = requestAnimationFrame(scan); };
  new MutationObserver(poke).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('click', (e) => { if (menu && !menu.contains(e.target)) close(); }, true);
  addEventListener('resize', () => close());
  addEventListener('scroll', (e) => { if (menu && e.target !== menu) close(); }, { capture: true, passive: true });
  addEventListener('keydown', (e) => {
    if (!menu) return;
    if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') { e.preventDefault(); e.stopImmediatePropagation(); close(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopImmediatePropagation();
      const l = [...menu.children], i = l.indexOf(document.activeElement), n = l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length]; if (n) n.focus();
    } else if (e.key === 'Tab') close();
  }, true);
  poke();
})();
