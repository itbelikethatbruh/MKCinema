
/* 2.94.1 Fire Stick fixes (Reddit report, 2026-11-24).
   1. Player Sources: Best match / Largest / Smallest act in the player too (they were only wired on title pages).
   2. MKCinema player (native engine): Crop bars sends its zoom; on TVs the Android app (1.17.12+) sizes the picture.
   3. MKCinema player (native engine): quick skips add up from where you are going, not from where the engine still
      reports it is, and land as one seek, so the time never jumps back and forth.
   4. TV Search: Down moves from the search box to the results, and OK / Done / Search on the TV keyboard takes you to
      the results instead of opening the first film. */
(() => {
  'use strict';
  const sf = document.getElementById('srcFilters');
  if (sf) sf.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-sort]'); if (!b || !sf.contains(b)) return;
    e.preventDefault();
    try { D.sort = b.dataset.sort; renderSourceDrawer(); } catch (x) { /* player closed */ }
  });

  const N = window.MkNative;
  if (N && !N._fs2941) {
    N._fs2941 = true;
    N.picture = function () {
      if (!this.active) return;
      const a = P.aspect || 'fit'; let crop = 1;
      if (a === 'crop') { try { crop = CropBars.scale() || 1; } catch (e) { crop = 1; } }
      if (a === 'fill') { this.cmd('aspect', '-1').catch(() => {}); this.cmd('fill', '1').catch(() => {}); }
      else {
        this.cmd('fill', '0').catch(() => {});
        const st = $('#stage').getBoundingClientRect();
        this.cmd('aspect', a === 'fit' || a === 'crop' ? '-1' : a === 'stretch' ? (st.width / Math.max(1, st.height)).toFixed(3) : a).catch(() => {});
      }
      this.cmd('zoom', ((P.zoom || 1) * crop).toFixed(4)).catch(() => {});
      if (typeof PxPicture !== 'undefined') { const p = PxPicture.get(); this.cmd('eq', JSON.stringify({ brightness: p.b - 100, contrast: p.c - 100, saturation: p.s - 100 })).catch(() => {}); }
    };
    // one seek at a time: the first press goes at once, presses close together go as one seek to where they add up to
    N.seekSend = function () {
      if (this.skT) return;
      const gap = performance.now() - (this.skLast || 0), wait = gap < 350 ? 350 - gap : 0;
      this.skT = setTimeout(() => {
        this.skT = 0; const s = this.sk; if (!s || !this.active) return;
        this.skLast = performance.now(); s.sent = s.to; this.cmd('seek', s.to).catch(() => {});
      }, wait);
    };
    const at0 = N.attach;
    N.attach = function () {
      const was = this.active, r = at0.apply(this, arguments); if (was) return r;
      Object.defineProperty(video, 'currentTime', { configurable: true, get: () => N.now(), set: (x) => {
        x = Number(x); if (!isFinite(x)) return; x = Math.max(0, x);
        N.sk = { to: x, at: performance.now() }; N.st.t = x; N.tAt = 0; N.st.ended = false; N.fire('seeking'); N.seekSend();
      } });
      return r;
    };
    // until the engine reports it is there, its clock is the old place: the page keeps showing where you are going
    const ev0 = N.ev;
    N.ev = function (n) {
      const s = this.sk;
      if (s && n && 't' in n && !(n.gen && this.gen && n.gen !== this.gen)) {
        const near = Math.abs((Number(n.t) || 0) - s.to) < 1.5, busy = 'seeking' in n ? n.seeking : this.st.seeking;
        if (near && s.sent === s.to && !this.skT && !busy) this.sk = null;
        else if (performance.now() - s.at < 8000) { n = Object.assign({}, n); delete n.t; }
        else this.sk = null;
      }
      return ev0.call(this, n);
    };
    const op0 = N.open;
    N.open = function () { this.sk = null; clearTimeout(this.skT); this.skT = 0; return op0.apply(this, arguments); };
  }

  if (typeof IS_TV !== 'undefined' && IS_TV) {
    const inp = document.getElementById('palInput');
    if (inp) inp.addEventListener('keydown', (e) => {
      const ent = e.key === 'Enter' || e.keyCode === 13;
      if ((e.key !== 'ArrowDown' && !ent) || e.defaultPrevented) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const first = document.querySelector('#palRes [data-pi]:not(.status), #palRes [data-recent]');
      if (!first) return;
      if (typeof Nav !== 'undefined' && Nav.focus) Nav.focus(first, true); else first.focus();
      try { first.scrollIntoView({ block: 'nearest' }); } catch (x) { /* old web view */ }
    }, true);
  }
})();
