
/* 2.89 instant Home (TVs). While the app loads, show a picture of the Home screen as it looked last time, in place
   of the plain start cover. It is drawn from a small saved list of positions, pictures and titles, cannot be clicked,
   and fades away at the moment the start cover would have. It is used once and saved again when Home is ready. */
(function () {
  try {
    var de = document.documentElement, K = 'mkc:fastHome';
    if (!de.classList.contains('tv') || de.classList.contains('seat-gate') || location.hash.length > 1 || location.search.length > 1) return;
    var raw = localStorage.getItem(K); if (!raw) return; localStorage.removeItem(K);
    var s = JSON.parse(raw); if (!s || s.v !== 1 || s.w !== innerWidth || s.h !== innerHeight || !s.i || !s.i.length) return;
    var esc = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
    var url = function (u) { return /^(https?:|\/|data:image\/)/i.test(u) ? esc(u) : ''; };
    var box = function (o) { return 'position:absolute;left:' + (+o.x) + 'px;top:' + (+o.y) + 'px;width:' + (+o.w) + 'px;height:' + (+o.h) + 'px;' + (o.r ? 'border-radius:' + esc(o.r) + ';' : ''); };
    var h = '';
    for (var n = 0; n < s.i.length; n++) {
      var o = s.i[n];
      if (o.k === 'hero') {
        h += '<div style="' + box(o) + 'overflow:hidden;background:#0b0b0d">' + (url(o.src) ? '<img alt="" src="' + url(o.src) + '" style="position:absolute;left:' + (+o.ix) + 'px;top:' + (+o.iy) + 'px;width:' + (+o.iw) + 'px;height:' + (+o.ih) + 'px;object-fit:cover;object-position:' + esc(o.op || '50% 50%') + ';opacity:' + (+o.io || 1) + (o.fl ? ';filter:' + esc(o.fl) : '') + '">' : '') +
          (o.sc ? o.sc.split('|').map(function (g) { return '<div style="position:absolute;inset:0;background:' + esc(g) + '"></div>'; }).join('') + (o.bd ? '<div style="position:absolute;inset:0;border-radius:inherit;box-sizing:border-box;border:' + esc(o.bd) + '"></div>' : '') + '</div>' :
          '<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.88) 0%,rgba(0,0,0,.55) 38%,rgba(0,0,0,0) 72%),linear-gradient(0deg,rgba(0,0,0,.7) 0%,rgba(0,0,0,0) 45%)"></div></div>');
      } else if (o.k === 'img') {
        if (url(o.src)) h += '<img alt="" src="' + url(o.src) + '" style="' + box(o) + 'object-fit:' + (o.fit === 'contain' ? 'contain;object-position:left bottom' : 'cover') + '">';
      } else if (o.k === 'box') {
        h += '<div style="' + box(o) + 'background:' + esc(o.bg || 'transparent') + ';' + (o.bd ? 'border:' + esc(o.bd) + ';box-sizing:border-box;' : '') + '"></div>';
      } else if (o.k === 'txt') {
        h += '<div style="' + box(o) + 'box-sizing:border-box;overflow:hidden;font:' + esc(o.f) + ';color:' + esc(o.c) + ';' + (o.wr ? 'white-space:normal;line-height:' + esc(o.wr) + ';' : 'display:flex;align-items:center;white-space:nowrap;justify-content:' + (o.ce ? 'center' : 'flex-start') + ';') + (o.ls ? 'letter-spacing:' + esc(o.ls) + ';' : '') + (o.tt ? 'text-transform:' + esc(o.tt) + ';' : '') + (o.bd ? 'border:' + esc(o.bd) + ';' : '') + (o.bg ? 'background:' + esc(o.bg) + ';' : '') + '">' + esc(o.t) + '</div>';
      }
    }
    var el = document.createElement('div'); el.id = 'mkFast'; el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;inset:0;z-index:80;background:' + esc(s.bg || '#000') + ';overflow:hidden;pointer-events:none;transition:opacity .35s ease';
    el.innerHTML = h; document.body.appendChild(el);
    var t0 = Date.now(), gone = false;
    var out = function () { if (gone) return; gone = true; clearInterval(iv); el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 400); };
    var iv = setInterval(function () {
      if (Date.now() - t0 > 9000) return out();
      if (document.readyState === 'loading') return;
      if (!de.classList.contains('booting') || de.classList.contains('seat-gate')) setTimeout(out, 200);
    }, 100);
    window.addEventListener('error', function () { setTimeout(out, 800); });
  } catch (e) { /* the normal start cover shows instead */ }
})();
