
// Phones: sections bar on top, Search + Miko + Menu bar at the bottom. The small tab above the bar lowers it out of
// the way and lifts it back (tap, or swipe the bar down / the tab up). Remembered per device. TVs, tablets, computers
// untouched.
(() => {
  const de = document.documentElement;
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;
  const mq = matchMedia('(max-width: 760px)');
  const KEY = 'mkc:pillDown';
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I_SEARCH = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
  const I_MENU = svg('<path d="M4 7h16M4 12h16M4 17h16"/>');
  const I_DOWN = svg('<path d="m6 9 6 6 6-6"/>');
  const bar = document.createElement('nav');
  bar.id = 'mkPill'; bar.setAttribute('aria-label', 'Search and menu');
  bar.innerHTML = `<button type="button" data-nav id="mkPillSearch">${I_SEARCH}<span>Search</span></button><i class="mkp-sep" aria-hidden="true"></i><i class="mkp-gap" aria-hidden="true"></i><button type="button" data-nav id="mkPillMenu" aria-haspopup="menu" aria-expanded="false">${I_MENU}<span>Menu</span></button>`;
  const tog = document.createElement('button');
  tog.type = 'button'; tog.id = 'mkPillTog'; tog.setAttribute('data-nav', ''); tog.innerHTML = I_DOWN;
  document.body.append(bar, tog);
  const live = () => mq.matches && de.classList.contains('ezb-bar') && !de.classList.contains('tv');
  let down = false; try { down = localStorage.getItem(KEY) === '1'; } catch {}
  const label = () => { const t = down ? 'Show menu bar' : 'Hide menu bar'; tog.setAttribute('aria-label', t); tog.title = t; tog.setAttribute('aria-expanded', String(!down)); };
  const setDown = v => { down = v; de.classList.toggle('mk-pill-down', v); try { localStorage.setItem(KEY, v ? '1' : '0'); } catch {} label(); };
  const apply = () => {
    const on = live();
    if (de.classList.contains('mk-pill') !== on) de.classList.toggle('mk-pill', on);
    if (on && de.classList.contains('mk-pill-down') !== down) de.classList.toggle('mk-pill-down', down);
    if (!on) closeSheet();
    miko(); ind(false);
  };
  label();
  tog.addEventListener('click', e => { e.stopPropagation(); setDown(!down); });
  // swipe the bar down to lower it, swipe the tab up to lift it
  const swipe = (el, want) => {
    let y0 = null, x0 = 0;
    el.addEventListener('touchstart', e => { const t = e.touches[0]; y0 = t.clientY; x0 = t.clientX; }, { passive: true });
    el.addEventListener('touchend', e => {
      if (y0 == null) return; const t = e.changedTouches[0]; const dy = t.clientY - y0, dx = Math.abs(t.clientX - x0); y0 = null;
      if (dx < 40 && (want ? dy > 24 : dy < -18)) { e.preventDefault(); setDown(want); }
    });
  };
  swipe(bar, true); swipe(tog, false);

  // Search: open the app's search and ask for the keyboard inside the tap itself, so phones open it once and keep it.
  // If the field loses focus by itself in the first moments (a layout change while the keyboard slides in), it is
  // given back, unless the person touched something else.
  let lastTouch = 0;
  addEventListener('pointerdown', () => { lastTouch = Date.now(); }, true);
  bar.querySelector('#mkPillSearch').addEventListener('click', e => {
    e.stopPropagation();
    const b = document.getElementById('openPalette'); if (!b) return;
    b.click();
    const inp = document.getElementById('palInput');
    if (!inp) return;
    try { inp.focus({ preventScroll: true }); } catch {}
    const until = Date.now() + 1500, opened = Date.now();
    const keep = () => {
      if (Date.now() > until) { inp.removeEventListener('blur', keep); return; }
      setTimeout(() => {
        const pal = document.getElementById('palette');
        if (!pal || pal.hidden || document.activeElement === inp) return;
        if (lastTouch > opened + 50) return;            // the person tapped something else: leave it
        const a = document.activeElement;
        if (a && a !== document.body && a.tagName !== 'BUTTON') return;
        try { inp.focus({ preventScroll: true }); } catch {}
      }, 0);
    };
    inp.addEventListener('blur', keep);
    setTimeout(() => inp.removeEventListener('blur', keep), 1600);
  });

  const menuBtn = bar.querySelector('#mkPillMenu');
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    const m = document.getElementById('ezbMenu');
    if (m && !m.hidden && m.classList.contains('open')) { closeSheet(); return; }
    if (window.MKEasy && MKEasy.open) MKEasy.open(menuBtn);
    else { const b = document.getElementById('ezbMenuP'); b && b.click(); }
  });
  let shade = null;
  function closeSheet() {
    const m = document.getElementById('ezbMenu');
    if (m && !m.hidden) { if (window.MKEasy && MKEasy.close) MKEasy.close(); else { const x = m.querySelector('.ezb-x'); x && x.click(); } }
  }
  const signedIn = () => { const a = document.getElementById('openAccount'); return !!(a && !a.querySelector('.lucide-circle-user-round,[data-lucide="circle-user-round"]')); };
  function decorate(m) {
    if (!de.classList.contains('mk-pill') || m.querySelector('.mkp-acct')) return;
    const row = document.createElement('div'); row.className = 'mkp-acct';
    const acct = () => { closeSheet(); const a = document.getElementById('openAccount'); a && a.click(); };
    if (signedIn()) row.innerHTML = '<button type="button" role="menuitem" data-nav class="mkp-main"><span>Account</span></button>';
    else row.innerHTML = '<button type="button" role="menuitem" data-nav><span>Sign in</span></button><button type="button" role="menuitem" data-nav class="mkp-main"><span>Create account</span></button>';
    row.querySelectorAll('button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); acct(); }));
    m.appendChild(row);
  }
  function sync() {
    const m = document.getElementById('ezbMenu');
    const open = !!(m && !m.hidden && m.classList.contains('open'));
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open && de.classList.contains('mk-pill')) {
      decorate(m);
      if (!shade) { shade = document.createElement('div'); shade.id = 'mkPillShade'; shade.addEventListener('click', closeSheet); shade.addEventListener('touchmove', e => e.preventDefault(), { passive: false }); document.body.appendChild(shade); requestAnimationFrame(() => shade && shade.classList.add('in')); }
      if (!m.__mkpSwipe) { m.__mkpSwipe = 1; let y0 = null; m.addEventListener('touchstart', e => { y0 = m.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true }); m.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 60) closeSheet(); y0 = null; }); }
    } else if (shade) { const s = shade; shade = null; s.classList.remove('in'); setTimeout(() => s.remove(), 300); }
  }

  // Miko: a small round button in the middle of the bar (the gap opens only while Miko is there)
  let mikoSeen = null;
  function miko() {
    const f = document.getElementById('mikoFab');
    const on = !!(f && !f.classList.contains('away') && getComputedStyle(f).display !== 'none');
    // Miko steps away while the menu or a full-screen page is up: keep its place so Search and Menu don't shift
    if (!on && f && (de.classList.contains('mkp-aside') || de.classList.contains('ezb-menu-open'))) { if (f !== mikoSeen) miko2(f); return; }
    if (de.classList.contains('mk-pill-miko') !== on) de.classList.toggle('mk-pill-miko', on);
    miko2(f);
  }
  function miko2(f) {
    if (f && f !== mikoSeen) { mikoSeen = f; swipe(f, true); new MutationObserver(miko).observe(f, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] }); }
  }

  // one highlight that glides to the section you open (transform only)
  const pill = document.createElement('i');
  pill.className = 'mkp-ind'; pill.setAttribute('aria-hidden', 'true');
  let last = null, raf = 0;
  function ind(animate) {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const on = de.classList.contains('mk-pill');
      const cur = on && [...tabsEl.querySelectorAll('.tab.on')].find(t => t.getClientRects().length && getComputedStyle(t).display !== 'none');
      if (!cur) { if (de.classList.contains('mkp-ind-on')) de.classList.remove('mkp-ind-on'); last = null; return; }
      if (!pill.isConnected) tabsEl.insertBefore(pill, tabsEl.firstChild);
      if (!de.classList.contains('mkp-ind-on')) de.classList.add('mkp-ind-on');
      const x = cur.offsetLeft, w = cur.offsetWidth;
      const reduce = CFG_REDUCED();
      if (animate && last && !reduce && (last.x !== x || last.w !== w)) {
        delete pill.dataset.go;
        pill.style.width = w + 'px';
        pill.style.transform = `translate3d(${last.x}px,0,0) scaleX(${last.w / w})`;
        void pill.offsetWidth;
        pill.dataset.go = '1';
        pill.style.transform = `translate3d(${x}px,0,0)`;
      } else {
        if (last && last.x === x && last.w === w) return;   // already there (or gliding there): leave it alone
        delete pill.dataset.go;
        pill.style.width = w + 'px';
        pill.style.transform = `translate3d(${x}px,0,0)`;
      }
      last = { x, w };
    });
  }
  const CFG_REDUCED = () => document.body.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  new MutationObserver(recs => { recs = recs.filter(r => r.target !== pill); if (!recs.length) return; if (recs.some(r => r.target.classList && r.target.classList.contains('tab') && r.oldValue !== r.target.className && (/\bon\b/.test(r.oldValue || '') !== r.target.classList.contains('on')))) ind(true); else ind(false); })
    .observe(tabsEl, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  if (window.ResizeObserver) new ResizeObserver(() => ind(false)).observe(tabsEl);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ind(false));

  // 2.90.3: full-screen pages (Settings, search, a title, the player...) mark html.mkp-aside in the same moment they
  // show, so the bars slide away at once instead of showing on top of the page until body.layer-open arrives 320 ms later
  const ASIDE = (typeof MENU_LAYERS !== 'undefined' ? MENU_LAYERS : ['epSheet', 'detail', 'addons', 'palette', 'settings', 'tastePick', 'askLayer', 'tour', 'stremioImport', 'trailer', 'partyLayer', 'castLayer']).concat('player');
  const asideSeen = new Set();
  const asideMo = new MutationObserver(() => aside());
  function aside() {
    let a = false;
    for (const id of ASIDE) { const el = document.getElementById(id); if (!el) continue; if (!asideSeen.has(el)) { asideSeen.add(el); asideMo.observe(el, { attributes: true, attributeFilter: ['hidden'] }); } if (!el.hidden) a = true; }
    if (de.classList.contains('mkp-aside') !== a) de.classList.toggle('mkp-aside', a);
  }
  new MutationObserver(recs => { let add = false; for (const r of recs) { for (const n of r.addedNodes) { if (n.id === 'ezbMenu') watchMenu(n); if (n.id === 'mikoFab') miko(); if (n.id && ASIDE.includes(n.id)) add = true; } } if (add) aside(); sync(); }).observe(document.body, { childList: true });
  aside();
  function watchMenu(m) { if (m.__mkpW) return; m.__mkpW = 1; new MutationObserver(sync).observe(m, { attributes: true, attributeFilter: ['class', 'hidden'], childList: true }); }
  const m0 = document.getElementById('ezbMenu'); if (m0) watchMenu(m0);
  if (mq.addEventListener) mq.addEventListener('change', apply);
  new MutationObserver(apply).observe(de, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', apply);
  apply();
})();
