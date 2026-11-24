/* 2.93.7 tablets get the phone bottom bar (mk-pad), Safari Top 10 numbers as SVG, Safari dropdowns never cut */
(() => {
  const de = document.documentElement, ua = navigator.userAgent || '';
  const PADQ = '(min-width: 761px) and (max-width: 1440px) and (hover: none) and (pointer: coarse)';
  const ph = matchMedia('(max-width: 760px)'), pad = matchMedia(PADQ);
  const setPad = () => de.classList.toggle('mk-pad', pad.matches && !ph.matches && !de.classList.contains('tv'));
  setPad();
  try { pad.addEventListener('change', setPad); ph.addEventListener('change', setPad); } catch { pad.addListener(setPad); ph.addListener(setPad); }

  // Safari / every iPhone and iPad browser (all WebKit) / the Mac app
  let force = false; try { force = localStorage.getItem('mkc:wkTest') === '1'; } catch {}
  const WK = force || /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ||
    (/AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Android|Edg|OPR|Firefox|SamsungBrowser|Tizen|Web0S/.test(ua));
  if (!WK || de.classList.contains('tv')) return;
  de.classList.add('mk-t10svg', 'mk-wk');

  const NS = 'http://www.w3.org/2000/svg';
  const RIM = {
    1: ['#fff6d6', '#ecc768', '#9a7020', '#f8de92', '#6e4f14'],
    2: ['#ffffff', '#d5d9e0', '#7b818c', '#f1f4f8', '#5d626b'],
    3: ['#ffe6d2', '#da9a6e', '#86492a', '#f4bb93', '#5e301a'],
    d: ['#f7f5f0', '#bdb8ad', '#5c5a55', '#e4e0d7', '#4b4945'],
  };
  const GLOW = { 1: 'rgba(240,196,92,.5)', 2: 'rgba(214,222,236,.42)', 3: 'rgba(226,146,98,.42)', d: 'rgba(226,220,206,.28)' };
  const RIM_AT = [0, .26, .52, .76, 1];
  let uid = 0;
  // the glow gradient uses the real colour: SVG stop-color cannot read a CSS variable in every browser
  const glowC = () => (getComputedStyle(de).getPropertyValue('--glow') || '').trim() || '#4aa8ff';
  const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const grad = (id, stops, at, x1, y1, x2, y2) => {
    const g = el('linearGradient', { id, x1, y1, x2, y2 });
    stops.forEach((c, i) => g.appendChild(el('stop', { offset: at[i], 'stop-color': c })));
    return g;
  };
  function draw(n, again) {
    const b = n.querySelector(':scope > b'); if (!b) return;
    const w = b.offsetWidth, h = b.offsetHeight; if (!w || !h) return;
    const fs = parseFloat(getComputedStyle(n).fontSize) || 0; if (!fs) return;
    const key = b.textContent + '|' + fs + '|' + w + '|' + h + '|' + b.offsetLeft + '|' + b.offsetTop;
    if (n._t10k === key) return;
    if (n._t10k && !again) return;
    n._t10k = key;
    const pr = document.createElement('i'); pr.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    b.appendChild(pr); const base = pr.offsetTop; pr.remove();
    const rank = (n.closest('.t10c') || {}).dataset ? n.closest('.t10c').dataset.rank : '';
    const r = RIM[rank] ? rank : 'd', id = 'mkt10' + (++uid), lite = de.classList.contains('lite') || de.classList.contains('tv');
    const sw = fs * (lite ? .055 : .058);
    const s = el('svg', { class: 't10s', 'aria-hidden': 'true', width: w, height: h, viewBox: `0 0 ${w} ${h}` });
    s.style.left = b.offsetLeft + 'px'; s.style.top = b.offsetTop + 'px';
    if (!lite) s.style.filter = `drop-shadow(0 0 ${(fs * .058 * 2.2).toFixed(1)}px ${GLOW[r]})`;
    const d = el('defs', {});
    d.appendChild(grad(id + 'r', RIM[r], RIM_AT, '.4', '0', '.6', '1'));
    d.appendChild(grad(id + 'f', ['#34343b', '#151518', '#060607', '#0d0d10'], [0, .38, .78, 1], '0', '0', '0', '1'));
    d.appendChild(grad(id + 'g', [glowC(), '#9a72ff', '#ff6fae', '#ffd38a'], [0, .4, .72, 1], '0', '0', '1', '1'));
    s.appendChild(d);
    const t = b.textContent.trim();
    const txt = (cls, attrs) => { const e = el('text', Object.assign({ x: 0, y: base, class: cls }, attrs)); e.textContent = t; s.appendChild(e); };
    const sa = { 'stroke-width': sw.toFixed(2), 'stroke-linejoin': 'round', fill: 'none' };
    txt('t10r', Object.assign({ stroke: `url(#${id}r)` }, sa));
    txt('t10g', Object.assign({ stroke: `url(#${id}g)` }, sa));
    txt('t10f', { fill: `url(#${id}f)` });
    const old = n.querySelector(':scope > .t10s'); old ? old.replaceWith(s) : n.appendChild(s);
  }
  const all = again => document.querySelectorAll('.t10n').forEach(n => draw(n, again));

  // dropdowns: Safari sizes a styled select narrower than its text, so give each one room for what it shows
  const cv = document.createElement('canvas').getContext('2d');
  function fitSel(x) {
    if (x.multiple || x.size > 1 || x.closest('#settings')) return;
    const o = x.options[x.selectedIndex]; if (!o) return;
    const key = x.selectedIndex + '|' + o.text; if (x._fitK === key) return;
    const cs = getComputedStyle(x); if (cs.display === 'none') return;
    cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const px = v => parseFloat(v) || 0;
    const w = Math.ceil(cv.measureText(o.text).width + px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth) + 6);
    x._fitK = key; x.style.minWidth = `min(${w}px, 100%)`;
  }
  const sels = () => document.querySelectorAll('select').forEach(fitSel);
  const resel = () => document.querySelectorAll('select').forEach(x => { x._fitK = ''; fitSel(x); });

  let q = 0;
  const run = () => { q = 0; all(false); sels(); };
  const later = () => { if (!q) q = requestAnimationFrame(run); };
  const start = () => {
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', e => { if (e.target && e.target.tagName === 'SELECT') { e.target._fitK = ''; fitSel(e.target); } }, true);
    let rz = 0; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { all(true); resel(); }, 150); });
    try { document.fonts.ready.then(() => { all(true); resel(); }); document.fonts.addEventListener('loadingdone', () => { all(true); resel(); }); } catch {}
    run();
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();