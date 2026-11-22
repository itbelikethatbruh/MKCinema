
// Phones: sections bar on top, Search + Menu bar at the bottom. The small tab above the bar lowers it out of the way
// and lifts it back (tap, or swipe the bar down / the tab up). Remembered per device. TVs, tablets, computers untouched.
(() => {
  const de = document.documentElement;
  if (!document.getElementById('tabs')) return;
  const mq = matchMedia('(max-width: 760px)');
  const KEY = 'mkc:pillDown';
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I_SEARCH = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
  const I_MENU = svg('<path d="M4 7h16M4 12h16M4 17h16"/>');
  const I_DOWN = svg('<path d="m6 9 6 6 6-6"/>');
  const bar = document.createElement('nav');
  bar.id = 'mkPill'; bar.setAttribute('aria-label', 'Search and menu');
  bar.innerHTML = `<button type="button" data-nav id="mkPillSearch">${I_SEARCH}<span>Search</span></button><i class="mkp-sep" aria-hidden="true"></i><button type="button" data-nav id="mkPillMenu" aria-haspopup="menu" aria-expanded="false">${I_MENU}<span>Menu</span></button>`;
  const tog = document.createElement('button');
  tog.type = 'button'; tog.id = 'mkPillTog'; tog.setAttribute('data-nav', ''); tog.innerHTML = I_DOWN;
  document.body.append(bar, tog);
  const live = () => mq.matches && de.classList.contains('ezb-bar') && !de.classList.contains('tv');
  let down = false; try { down = localStorage.getItem(KEY) === '1'; } catch {}
  const label = () => { const t = down ? 'Show menu bar' : 'Hide menu bar'; tog.setAttribute('aria-label', t); tog.title = t; tog.setAttribute('aria-expanded', String(!down)); };
  const setDown = v => { down = v; de.classList.toggle('mk-pill-down', v); try { localStorage.setItem(KEY, v ? '1' : '0'); } catch {} label(); };
  const apply = () => { const on = live(); if (de.classList.contains('mk-pill') !== on) de.classList.toggle('mk-pill', on); if (on && de.classList.contains('mk-pill-down') !== down) de.classList.toggle('mk-pill-down', down); if (!on) closeSheet(); };
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
  // Search and Menu use the app's own search and menu
  bar.querySelector('#mkPillSearch').addEventListener('click', e => { e.stopPropagation(); const b = document.getElementById('openPalette'); b && b.click(); });
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
    try { window.I18N && I18N.apply && I18N.apply(row); } catch {}
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
  new MutationObserver(recs => { for (const r of recs) { for (const n of r.addedNodes) if (n.id === 'ezbMenu') watchMenu(n); } sync(); }).observe(document.body, { childList: true });
  function watchMenu(m) { if (m.__mkpW) return; m.__mkpW = 1; new MutationObserver(sync).observe(m, { attributes: true, attributeFilter: ['class', 'hidden'], childList: true }); }
  const m0 = document.getElementById('ezbMenu'); if (m0) watchMenu(m0);
  if (mq.addEventListener) mq.addEventListener('change', apply);
  new MutationObserver(apply).observe(de, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', apply);
  apply();
})();
