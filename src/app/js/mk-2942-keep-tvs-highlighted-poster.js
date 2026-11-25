
/* 2.94.2 TVs: the highlighted poster stays on screen. When a Home row finishes loading as the page scrolls, Home tidies
   its rows and the browser shifts the page to make up for it, which could carry the highlight off screen (seen when
   the page moves in one step: held buttons, and old sticks). For a moment after each move, if the highlight was on
   screen and is then pushed fully off it, the page is brought back to it. */
(function () {
  try {
    if (!document.documentElement.classList.contains('tv') || typeof Nav === 'undefined' || Nav.focus._mkKeep) return;
    var el = null, until = 0, seen = false, raf = 0;
    var check = function () {
      raf = 0;
      if (!el || performance.now() > until || !el.isConnected || !el.classList.contains('nav-focus')) { el = null; return; }
      if (document.body.classList.contains('layer-open') || el.closest('.layer-ov, #player, .dock-wrap, #hero')) return;
      var r = el.getBoundingClientRect(), vh = innerHeight; if (!(r.height > 0)) return;
      var inView = r.bottom > 0 && r.top < vh;
      if (inView) { seen = true; return; }
      if (!seen) return; // still on its way in (a glide)
      seen = false; window.scrollBy({ top: r.top + r.height / 2 - vh / 2, behavior: 'auto' });
    };
    addEventListener('scroll', function () { if (el && !raf) raf = requestAnimationFrame(check); }, { passive: true, capture: true });
    var f = Nav.focus;
    Nav.focus = function (e) {
      var out = f.apply(this, arguments);
      el = e && e.classList ? e : null; until = performance.now() + 1500; seen = false;
      if (el && !raf) raf = requestAnimationFrame(check);
      return out;
    };
    Nav.focus._mkKeep = true;
  } catch (e) { /* leave focus as it was */ }
})();
