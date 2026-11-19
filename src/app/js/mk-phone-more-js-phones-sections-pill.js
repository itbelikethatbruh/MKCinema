
// Phones: the sections pill shows as many sections as fit, the rest go under "More". Nothing is ever cut off.
// TVs, tablets and computers are untouched (the class mk-pm only applies below 761 px and never on TVs).
(() => {
  const de = document.documentElement;
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;
  const mq = matchMedia('(max-width: 760px)');
  const OUT_FIRST = ['music', 'anime', 'library', 'tv', 'series', 'movie'];   // first to move under More
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'mk-pm-btn'; btn.setAttribute('data-nav', '');
  btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', 'More sections');
  btn.innerHTML = '<span>More</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  tabsEl.appendChild(btn);
  let menu = null, shade = null, busy = false;
  const live = () => mq.matches && de.classList.contains('ezb-bar') && !de.classList.contains('tv');
  const sections = () => [...tabsEl.querySelectorAll('.tab')].filter(t => !t.classList.contains('ezb-off') && (t.classList.contains('mk-pm-out') || getComputedStyle(t).display !== 'none'));
  const fits = () => tabsEl.scrollWidth <= tabsEl.clientWidth + 1;
  const watch = new MutationObserver(() => schedule());
  const observe = () => watch.observe(tabsEl, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  function fit() {
    busy = false;
    watch.disconnect();
    try {
      const on = live();
      de.classList.toggle('mk-pm', on);
      const all = [...tabsEl.querySelectorAll('.tab')];
      all.forEach(t => t.classList.remove('mk-pm-out'));
      btn.classList.remove('mk-pm-show');
      if (!on) { close(); return; }
      if (fits()) { close(); return; }
      btn.classList.add('mk-pm-show');
      const list = sections();
      const cur = list.find(t => t.classList.contains('on'));
      const order = OUT_FIRST.map(v => list.find(t => t.dataset.view === v)).filter(Boolean)
        .concat(list.slice().reverse()).filter((t, i, a) => a.indexOf(t) === i && t !== cur);
      for (const t of order) { if (fits()) break; t.classList.add('mk-pm-out'); }
      if (menu) build();
    } finally { watch.takeRecords(); observe(); }
  }
  function schedule() { if (!busy) { busy = true; requestAnimationFrame(fit); } }
  function build() {
    const out = sections().filter(t => t.classList.contains('mk-pm-out'));
    if (!out.length) { close(); return; }
    const bar = getComputedStyle(tabsEl);
    const rgb = (bar.backgroundColor.match(/[\d.]+/g) || [10, 10, 10]).slice(0, 3).map(Number);
    menu.style.background = `rgb(${rgb.map(Math.round).join(',')})`;
    menu.style.color = getComputedStyle(btn).color;
    menu.innerHTML = '';
    out.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'menuitem'); b.setAttribute('data-nav', '');
      const ic = t.querySelector('svg'); if (ic) b.appendChild(ic.cloneNode(true));
      const sp = document.createElement('span'); sp.textContent = (t.querySelector('.lbl') || t).textContent.trim(); b.appendChild(sp);
      b.addEventListener('click', () => { close(); t.click(); });
      menu.appendChild(b);
    });
    const r = tabsEl.getBoundingClientRect();
    menu.style.top = Math.round(r.bottom + 10) + 'px';
    menu.style.right = Math.max(16, Math.round(innerWidth - r.right)) + 'px';
  }
  function open() {
    if (menu) return;
    shade = document.createElement('div'); shade.id = 'mkPmShade';
    menu = document.createElement('div'); menu.id = 'mkPmMenu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'More sections');
    shade.addEventListener('click', close);
    shade.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.body.append(shade, menu);
    build();
    if (!menu) return;
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => { shade && shade.classList.add('in'); menu && menu.classList.add('in'); });
    if (de.classList.contains('kbnav')) { const f = menu.querySelector('button'); f && f.focus(); }
  }
  function close() {
    if (!menu) return;
    const m = menu, s = shade; menu = shade = null;
    btn.setAttribute('aria-expanded', 'false');
    m.classList.remove('in'); s.classList.remove('in');
    setTimeout(() => { m.remove(); s.remove(); }, 200);
    schedule();
  }
  btn.addEventListener('click', e => { e.stopPropagation(); menu ? close() : open(); });
  addEventListener('keydown', e => {
    if (!menu) return;
    if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') { e.preventDefault(); close(); btn.focus(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...menu.querySelectorAll('button')]; const i = items.indexOf(document.activeElement);
      const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      if (n) { e.preventDefault(); n.focus(); }
    }
  }, true);
  addEventListener('resize', () => { close(); schedule(); });
  if (mq.addEventListener) mq.addEventListener('change', schedule);
  new MutationObserver(schedule).observe(de, { attributes: true, attributeFilter: ['class', 'lang', 'style'] });
  if (window.ResizeObserver) new ResizeObserver(schedule).observe(tabsEl);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  observe();
  schedule();
})();
