/* 2.95.3 quick back: leaving a film back to its title page no longer rebuilds Home (hidden behind the title page) on
   the spot. Home is refreshed (Continue watching) a moment later when the remote is quiet, or when the title closes. */
(()=>{
  if (typeof closePlayer !== 'function' || typeof renderHome !== 'function' || window.MkQuickBack) return;
  const Q = window.MkQuickBack = { hold: 0, dirty: false, t: 0, key: 0 };
  const detailOpen = () => { const d = document.getElementById('detail'); return !!(d && !d.hidden); };
  const rh = renderHome;
  const run = () => { clearTimeout(Q.t); Q.t = 0; if (!Q.dirty) return; Q.dirty = false; if (typeof S === 'object' && S.view === 'home') renderHome(); };
  const later = () => {
    clearTimeout(Q.t);
    Q.t = setTimeout(() => {
      if (!Q.dirty) return;
      if (!detailOpen()) return run();
      if (performance.now() - Q.key < 1500) return later(); // never in the middle of remote presses
      (window.requestIdleCallback || (f => setTimeout(f, 0)))(() => { if (performance.now() - Q.key < 1500) later(); else run(); }, { timeout: 1500 });
    }, 1600);
  };
  addEventListener('keydown', () => { Q.key = performance.now(); }, true);
  renderHome = function () {
    if (Q.hold && detailOpen()) { Q.dirty = true; later(); return; }
    Q.dirty = false; clearTimeout(Q.t); Q.t = 0;
    return rh.apply(this, arguments);
  };
  try { window.renderHome = renderHome; } catch (e) {}
  /* the title page under the player is refreshed (resume point, watched marks) one frame AFTER the player is gone, so the
     remote's Back shows the title page at once instead of after the rebuild */
  if (typeof renderDetail === 'function') {
    const rd = renderDetail;
    renderDetail = function () {
      if (Q.hold && detailOpen() && !Q.inRd && typeof D === 'object' && D.video === Q.vid0) { // same title and episode: the next episode case runs at once
        const args = arguments, self = this, tok = Q.rdTok = (Q.rdTok || 0) + 1;
        requestAnimationFrame(() => setTimeout(() => {
          if (tok !== Q.rdTok || !detailOpen() || !document.getElementById('player').hidden) return;
          const a = document.activeElement, keep = a && a !== document.body && a.id;
          Q.inRd = true; try { rd.apply(self, args); } finally { Q.inRd = false; }
          // the rebuilt page keeps the remote where it was
          try { if (keep && document.activeElement === document.body) { const n = document.getElementById(keep); n && (typeof Nav === 'object' && IS_TV ? Nav.focus(n, true) : n.focus({ preventScroll: true })); } } catch (e) {}
        }, 0));
        return;
      }
      return rd.apply(this, arguments);
    };
    try { window.renderDetail = renderDetail; } catch (e) {}
  }
  const cp = closePlayer;
  closePlayer = function () {
    Q.hold++; let r; try { Q.vid0 = typeof D === 'object' ? D.video : undefined; } catch (e) {}
    const end = () => { Q.hold = Math.max(0, Q.hold - 1); };
    try { r = cp.apply(this, arguments); } catch (e) { end(); throw e; }
    Promise.resolve(r).then(end, end);
    return r;
  };
  try { window.closePlayer = closePlayer; } catch (e) {}
  if (typeof closeLayer === 'function') { // the title closes before the quiet moment came: Home is refreshed now
    const cl = closeLayer;
    closeLayer = function (id) { const r = cl.apply(this, arguments); if (id === 'detail' && Q.dirty) run(); return r; };
    try { window.closeLayer = closeLayer; } catch (e) {}
  }
})();