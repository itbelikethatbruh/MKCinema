
/* 2.94.2 Old Fire Sticks: Snappy mode moves rows and the page in one step instead of gliding.
   On a weak stick every in-between frame of a glide is a full redraw, so the 140-260 ms glide after each remote
   press was a large share of the work, and the poster only settled once it ended. Only for the weakest TVs (the
   1 GB Fire TV models, 1 GB or 2-core TVs) and when Snappy mode is switched On by hand; other TVs keep the glide. */
(function () {
  try {
    var H = document.documentElement, why = window.MK_LITE;
    if (!why || !H.classList.contains('tv')) return;
    var ua = navigator.userAgent, mem = navigator.deviceMemory, cpu = navigator.hardwareConcurrency;
    if (!(why === 'on' || /\bAFT(M|T|B|SS|SSS|MM)\b/.test(ua) || (mem && mem <= 1) || (cpu && cpu <= 2))) return;
    H.classList.add('mk-instant'); window.MK_INSTANT = true;
    var fix = function (o) { if (o && typeof o === 'object' && o.behavior === 'smooth') { o = Object.assign({}, o); o.behavior = 'auto'; } return o; };
    var wrap = function (obj, name) {
      var f = obj[name]; if (typeof f !== 'function' || f._mkInstant) return;
      var g = function (a) { return arguments.length === 1 ? f.call(this, fix(a)) : f.apply(this, arguments); };
      g._mkInstant = true; obj[name] = g;
    };
    ['scrollTo', 'scrollBy', 'scroll', 'scrollIntoView'].forEach(function (n) { wrap(Element.prototype, n); });
    ['scrollTo', 'scrollBy', 'scroll'].forEach(function (n) { wrap(window, n); });
    addEventListener('load', function () { try { MKLog.add('info', 'old stick: instant scrolling (' + why + ')'); } catch (e) { /* no log */ } });
  } catch (e) { /* keep the glide */ }
})();
