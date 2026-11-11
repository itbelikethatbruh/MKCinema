
(() => {
  const HOLD = 480; let timer = 0, sx = 0, sy = 0, el = null, fired = false, menu = null;
  const listOf = (row) => (row.closest('#srcList') && typeof P !== 'undefined' && P.ctx ? P.ctx.streams : (typeof D !== 'undefined' ? D.streams : null)) || [];
  const linkOf = (st) => {
    if (!st) return '';
    const h = typeof handoffUrl === 'function' ? handoffUrl(st) : null;
    if (h) return h;
    if (st.url) return st.url;
    if (st.infoHash) return 'magnet:?xt=urn:btih:' + st.infoHash;
    if (st.externalUrl) return st.externalUrl;
    return '';
  };
  const close = () => { if (!menu) return; const m = menu; menu = null; m.classList.remove('on'); setTimeout(() => m.remove(), 180); };
  const open = (row, x, y) => {
    close();
    const st = listOf(row)[Number(row.dataset.si)]; if (!st) return;
    const link = linkOf(st), name = ((st._tel && (st._tel.lines[0] || st._tel.headline)) || st.title || st.name || '').split('\n')[0];
    const m = document.createElement('div'); m.className = 'lp-menu'; m.setAttribute('role', 'menu');
    const h = document.createElement('div'); h.className = 'lp-h'; h.textContent = name || 'Source'; m.appendChild(h);
    const add = (icon, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.innerHTML = `<i data-lucide="${icon}"></i>`; b.appendChild(document.createTextNode(label)); b.addEventListener('click', (e) => { e.stopPropagation(); close(); fn(); }); m.appendChild(b); return b; };
    const first = link ? add('link', 'Copy stream link', () => copyText(link, 'Stream link copied')) : null;
    if (!link) { const n = document.createElement('div'); n.className = 'lp-h'; n.textContent = 'This source has no link to copy'; m.appendChild(n); }
    if (name) add('copy', 'Copy file name', () => copyText(name, 'File name copied'));
    if (window.MkLpExtra) try { window.MkLpExtra(st, add, link, row); } catch (e) { /* extras are optional */ }
    document.body.appendChild(m); if (typeof icons === 'function') icons();
    const r = m.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    m.style.left = Math.max(8, Math.min(x - r.width / 2, vw - r.width - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(y - r.height - 12 > 8 ? y - r.height - 12 : y + 12, vh - r.height - 8)) + 'px';
    menu = m; requestAnimationFrame(() => m.classList.add('on'));
    if (first) first.focus({ preventScroll: true });
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* ignore */ }
  };
  window.MkLpOpen = open;
  const cancel = () => { clearTimeout(timer); timer = 0; if (el) el.classList.remove('lp-hold'); el = null; };
  document.addEventListener('pointerdown', (e) => {
    if (menu && !menu.contains(e.target)) close();
    const row = e.target.closest && e.target.closest('.stream[data-si]'); if (!row || e.button > 0) return;
    fired = false; sx = e.clientX; sy = e.clientY; el = row; row.classList.add('lp-hold');
    timer = setTimeout(() => { fired = true; row.classList.remove('lp-hold'); open(row, sx, sy); }, HOLD);
  }, true);
  document.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); }, true);
  ['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, cancel, true));
  document.addEventListener('scroll', cancel, true);
  document.addEventListener('click', (e) => { if (fired && e.target.closest && e.target.closest('.stream[data-si]')) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; } }, true);
  document.addEventListener('contextmenu', (e) => { const row = e.target.closest && e.target.closest('.stream[data-si]'); if (!row) return; e.preventDefault(); cancel(); fired = false; open(row, e.clientX, e.clientY); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) { e.stopPropagation(); close(); } }, true);
})();
