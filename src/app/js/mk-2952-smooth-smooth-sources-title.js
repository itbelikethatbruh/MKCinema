/* 2.95.2 smooth sources: the title page Streams list and the player's Sources panel step one row at a time with the
   remote, and picking another source in the MKCinema Player (Android app) swaps the film without tearing the picture down */
(()=>{
  if (typeof Nav !== 'object' || !Nav || typeof Nav.move !== 'function' || Nav.move._mk2952) return;
  const LIST = '#srcList, #dStreams .streams, #dStreams';
  const rowOf = a => a && a.matches && a.matches('.stream[data-si]') ? a : null;
  const shown = r => r.getClientRects().length && !r.closest('[hidden]') && r.tabIndex >= 0 && !r.disabled;
  let busy = 0;
  const step = (a, dir) => {
    const list = a.closest(LIST); if (!list) return null;
    const rows = [...list.querySelectorAll('.stream[data-si]')].filter(shown);
    const i = rows.indexOf(a); if (i < 0) return null;
    return rows[i + (dir === 'down' ? 1 : -1)] || null; // at either end the usual remote rules take over
  };
  const move = Nav.move;
  Nav.move = function (dir, t) {
    try {
      if (dir === 'up' || dir === 'down') {
        const a = rowOf(document.activeElement), n = a && step(a, dir);
        if (n) { Nav.rects && Nav.rects.clear(); Nav.focus(n, t); return; }
      }
    } catch (e) { /* fall back to the usual rules */ }
    return move.apply(this, arguments);
  };
  Nav.move._mk2952 = true;
  // a held button on a slow TV: one row per drawn frame, the extra repeats are dropped instead of piling up
  addEventListener('keydown', e => {
    if (!e.repeat || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !rowOf(document.activeElement)) return;
    if (busy) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    busy = 1; requestAnimationFrame(() => requestAnimationFrame(() => { busy = 0; }));
  }, true);
})();
(()=>{
  /* Swapping sources in the MKCinema Player (Android app): before, the page stopped the film, hid the picture surface,
     showed the whole title page again for a moment, then made a new surface and opened the new film. On a TV stick the
     surface could be torn down while the film was still being decoded onto it, which can close the app. Now, when the
     new source plays in the MKCinema Player too, the old film is stopped and the new one opened on the same surface. */
  if (typeof MkNative !== 'object' || !MkNative || MkNative._mk2952 || typeof playStream !== 'function') return;
  MkNative._mk2952 = true;
  const N = MkNative, stop = N.stop;
  N.stop = function () {
    const want = N._swap;
    if (!this.active || !want || want !== (typeof P === 'object' && P.stream)) return stop.apply(this, arguments);
    let ok = false; try { ok = this.wants(want); } catch (e) { ok = false; }
    if (!ok) return stop.apply(this, arguments);
    // keep "show" and the hidden page, stop only the film; everything else resets as before
    const cmd = this.cmd;
    this.cmd = function (c) { return c === 'show' ? Promise.resolve('') : cmd.apply(this, arguments); };
    const under = this.under; this.under = null;
    const had = document.documentElement.classList.contains('mk-native-on');
    try { stop.apply(this, arguments); } finally { this.cmd = cmd; }
    this.under = under; had && document.documentElement.classList.add('mk-native-on');
    N._soft = true;
    try { MKLog.add('play', 'native: swapping source on the same picture'); } catch (e) {}
  };
  const finish = () => { // the new source did not open in the MKCinema Player after all: finish the stop as before
    if (!N._soft) return; N._soft = false;
    if (N.active) return;
    N.cmd('show', '0').catch(() => {});
    document.documentElement.classList.remove('mk-native-on');
    (N.under || []).forEach(i => i.classList.remove('mk-nv-under')); N.under = null;
  };
  const ps = playStream; let seq = 0;
  playStream = function (ctx, s) {
    let r; const my = ++seq;
    N._swap = N.active && s ? s : null;
    const end = () => { if (N._swap === s) N._swap = null; my === seq && finish(); }; // a newer pick finishes it instead
    try { r = ps.apply(this, arguments); } catch (e) { end(); throw e; }
    Promise.resolve(r).then(end, end);
    return r;
  };
  try { window.playStream = playStream; } catch (e) {}
})();