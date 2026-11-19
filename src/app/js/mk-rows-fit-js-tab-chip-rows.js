
// Tab and chip rows never slide sideways: whatever doesn't fit goes under "More" (phones, tablets, computers).
// TVs wrap these rows onto a second line instead (CSS above). The open tab/chip is never moved under More.
(() => {
  const de = document.documentElement;
  const ROWS = ['.mu-tabs', '.lib-tabs', '#tvSources', '#view-anime .segc'];
  const isOn = b => b.classList.contains('on') || b.getAttribute('aria-selected') === 'true' || b.getAttribute('aria-checked') === 'true';
  const chev = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const rows = new Map();   // row element -> state
  let menu = null, shade = null, menuRow = null;

  function itemsOf(row) {
    // the row's buttons, including buttons inside a nested tablist (Library), in screen order
    const out = [];
    for (const k of row.children) {
      if (k.classList.contains('mk-rf-btn')) continue;
      if (k.tagName === 'BUTTON' || k.tagName === 'A') out.push(k);
      else k.querySelectorAll(':scope > button, :scope > a').forEach(b => out.push(b));
    }
    return out.filter(b => b.classList.contains('mk-rf-out') || getComputedStyle(b).display !== 'none');
  }
  const fits = row => row.scrollWidth <= row.clientWidth + 1;

  function styleLike(btn, ref) {
    const c = getComputedStyle(ref);
    for (const k of ['fontSize', 'fontWeight', 'lineHeight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderRadius', 'minHeight', 'height', 'color', 'letterSpacing'])
      btn.style[k] = c[k];
    btn.style.background = 'transparent';
    btn.style.border = c.borderTopWidth !== '0px' ? `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}` : '0';
  }

  function fit(row) {
    const st = rows.get(row); if (!st) return;
    st.mo.disconnect();
    try {
      const items = itemsOf(row);
      items.forEach(b => b.classList.remove('mk-rf-out'));
      st.btn.classList.remove('mk-rf-show');
      row.classList.remove('mk-rf-on');
      if (de.classList.contains('tv') || !row.isConnected || !row.clientWidth) return;
      if (fits(row)) return;
      row.classList.add('mk-rf-on');
      st.btn.classList.add('mk-rf-show');
      const ref = items.find(b => !isOn(b)) || items[0];
      if (ref) styleLike(st.btn, ref);
      for (const b of items.slice().reverse()) {
        if (fits(row)) break;
        if (isOn(b)) continue;
        b.classList.add('mk-rf-out');
      }
      if (menuRow === row) build();
    } finally { st.mo.takeRecords(); st.mo.observe(row, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-checked'] }); }
  }

  function attach(row) {
    if (rows.has(row)) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mk-rf-btn'; btn.setAttribute('data-nav', '');
    btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'More');
    btn.innerHTML = '<span>More</span>' + chev;
    btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); menuRow === row ? close() : open(row); });
    row.appendChild(btn);
    let raf = 0;
    const st = { btn, mo: new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fit(row); }); }) };
    rows.set(row, st);
    if (window.ResizeObserver) new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fit(row); }); }).observe(row);
    fit(row);
  }

  function build() {
    const row = menuRow; if (!row || !menu) return;
    const out = itemsOf(row).filter(b => b.classList.contains('mk-rf-out'));
    if (!out.length) { close(); return; }
    menu.innerHTML = '';
    out.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'menuitem'); b.setAttribute('data-nav', '');
      if (isOn(t)) b.classList.add('on');
      [...t.childNodes].forEach(n => {
        if (n.nodeType === 3) { if (n.textContent.trim()) b.appendChild(document.createTextNode(n.textContent.trim() + ' ')); }
        else if (n.nodeType === 1) b.appendChild(n.cloneNode(true));
      });
      b.addEventListener('click', () => { close(); t.click(); });
      menu.appendChild(b);
    });
    const r = rows.get(row).btn.getBoundingClientRect();
    const below = r.bottom + 10;
    menu.style.top = Math.round(Math.min(below, innerHeight - 140)) + 'px';
    menu.style.right = Math.max(16, Math.round(innerWidth - r.right)) + 'px';
  }
  function open(row) {
    close(true);
    menuRow = row;
    shade = document.createElement('div'); shade.id = 'mkRfShade';
    menu = document.createElement('div'); menu.id = 'mkRfMenu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'More');
    shade.addEventListener('click', () => close());
    shade.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.body.append(shade, menu);
    build();
    if (!menu) return;
    rows.get(row).btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => { shade && shade.classList.add('in'); menu && menu.classList.add('in'); });
    if (de.classList.contains('kbnav')) { const f = menu.querySelector('button'); f && f.focus(); }
  }
  function close(now) {
    if (!menu) return;
    const m = menu, s = shade, row = menuRow; menu = shade = menuRow = null;
    if (row && rows.get(row)) rows.get(row).btn.setAttribute('aria-expanded', 'false');
    m.classList.remove('in'); s.classList.remove('in');
    if (now) { m.remove(); s.remove(); } else setTimeout(() => { m.remove(); s.remove(); }, 200);
  }
  addEventListener('keydown', e => {
    if (!menu) return;
    if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') { const r = menuRow; e.preventDefault(); e.stopPropagation(); close(); r && rows.get(r) && rows.get(r).btn.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...menu.querySelectorAll('button')]; const i = items.indexOf(document.activeElement);
      const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      if (n) { e.preventDefault(); n.focus(); }
    }
  }, true);
  addEventListener('resize', () => close());
  addEventListener('scroll', () => close(), { passive: true });

  // rows are drawn by their pages (often again on every visit), so look for new ones whenever the page changes
  let scanRaf = 0;
  let refitAll = false;
  function scan() {
    scanRaf = 0;
    for (const [row] of rows) if (!row.isConnected) rows.delete(row);
    ROWS.forEach(sel => document.querySelectorAll(sel).forEach(attach));   // new rows fit as they attach
    if (refitAll) { refitAll = false; for (const [row] of rows) fit(row); }
  }
  new MutationObserver(recs => {
    if (scanRaf) return;
    if (recs.every(r => r.target.closest && r.target.closest('#mkRfMenu'))) return;
    scanRaf = requestAnimationFrame(scan);
  }).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(() => { refitAll = true; if (!scanRaf) scanRaf = requestAnimationFrame(scan); }).observe(de, { attributes: true, attributeFilter: ['class', 'lang', 'style'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { refitAll = true; if (!scanRaf) scanRaf = requestAnimationFrame(scan); });
  scan();
})();
