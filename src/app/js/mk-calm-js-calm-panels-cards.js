/* 2.68.2 calm-panels. 3: cards that open by themselves (What's new, the tour, the menu and player questions) wait until
   the app has finished starting: the page has loaded, the start cover is gone, Home has stopped redrawing for a moment and
   no long task has just run. Before this, on slower devices they slid in while the rest of the app was still being read
   and set up, so the slide-in stuttered and parts of the page changed under it. Never waits more than 15 s. */
(function () {
  var d = document, de = d.documentElement, t0 = Date.now(), loadAt = 0, lastMut = 0, lastLong = 0;
  addEventListener('load', function () { loadAt = Date.now(); });
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (e.duration > 80) lastLong = Date.now(); }); }).observe({ type: 'longtask' }); } catch (e) { /* not in this browser */ }
  d.addEventListener('DOMContentLoaded', function () {
    var app = d.getElementById('app'); if (!app || !window.MutationObserver) return;
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) { var a = ms[i].addedNodes; for (var j = 0; j < a.length; j++) if (a[j].nodeType === 1) { lastMut = Date.now(); return; } }
    }).observe(app, { childList: true, subtree: true });
  });
  window.MKCalm = {
    ok: function () {
      var n = Date.now();
      if (n - t0 > 15000) return true;
      if (d.readyState !== 'complete' || !loadAt || n - loadAt < 500) return false;
      if (de.classList.contains('booting') || d.getElementById('bootCover')) return false;
      return n - lastMut > 900 && n - lastLong > 500;
    },
    busy: function () { return d.body.classList.contains('intro-on') || !this.ok(); }
  };
  /* the page width while a panel locks scrolling (see mk-calm-css 1). A MutationObserver answers before the next frame
     is drawn, so the scrollbar and the matching edge swap in the same frame. */
  var sbw = -1, comp = false;
  function barWidth() {
    if (sbw < 0) { var p = d.createElement('div'); p.style.cssText = 'position:absolute;top:-999px;left:0;width:100px;height:100px;overflow:scroll;visibility:hidden'; d.body.appendChild(p); sbw = p.offsetWidth - p.clientWidth; p.remove(); }
    return sbw;
  }
  function edge() {
    var b = d.body; if (!b) return;
    var locked = (b.classList.contains('locked') || de.classList.contains('t4-open')) && !de.classList.contains('booting') && !de.classList.contains('tv');
    var need = locked && barWidth() > 0 && de.scrollHeight > innerHeight + 1;
    if (need === comp) return; comp = need;
    if (need) { de.style.setProperty('--mk-sbw', sbw + 'px'); de.classList.add('mk-sbw'); } else de.classList.remove('mk-sbw');
  }
  d.addEventListener('DOMContentLoaded', function () {
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(edge);
    mo.observe(d.body, { attributes: true, attributeFilter: ['class'] }); mo.observe(de, { attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', function () { sbw = -1; comp = null; edge(); });
    edge();
  });
})();
