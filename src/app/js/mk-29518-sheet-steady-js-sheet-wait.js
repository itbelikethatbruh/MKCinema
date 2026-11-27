(()=>{/* 2.95.19 sheet wait */
  'use strict';
  if (typeof EpSheet !== 'object' || !EpSheet || EpSheet._mk29518) return;
  EpSheet._mk29518 = true;
  const det = document.getElementById('detail'), es = document.getElementById('epSheet');
  if (!det || !es) return;
  const now = () => performance.now();
  const hold = (on) => document.body.classList.toggle('mk-dphold', !!on);
  let landT = 0, holdT = 0;
  // the panel is up: show the title page behind it, let Home go a moment later
  const land = () => {
    clearTimeout(landT);
    if (!det.classList.contains('dp-under') || det.classList.contains('dp-landed')) return;
    det.classList.add('dp-landed');
    clearTimeout(holdT); holdT = setTimeout(() => hold(false), 340);
  };
  es.addEventListener('animationend', (e) => {
    if (!e.target || !e.target.classList || !e.target.classList.contains('ep-sheet')) return;
    if (e.animationName === 'mkEsUp' || e.animationName === 'mkEsIn') land();
    else if ((e.animationName === 'mkEsDown' || e.animationName === 'mkEsOut') && es.hidden) { clearTimeout(es._leaveT); es.classList.remove('leaving'); }
  });
  const od = openDetail;
  openDetail = function () {
    const r = od.apply(this, arguments);
    try {
      if (det.classList.contains('dp-under') && !det.classList.contains('dp-landed')) {
        clearTimeout(holdT); hold(true); clearTimeout(landT);
        /* 2.95.19 sheet wait: the panel may open only after the page has fetched the show. Wait for the panel: its
           slide (or 0.7 s once it opens), or, when the page has finished and still no panel opened, show the page then */
        if (!es.hidden) landT = setTimeout(land, 700);
        else {
          const tok = det._mkLandTok = (det._mkLandTok || 0) + 1;
          const after = () => { if (det._mkLandTok === tok && es.hidden) land(); };
          Promise.resolve(r).then(() => setTimeout(after, 60), () => setTimeout(after, 60));
          landT = setTimeout(land, 6000); // never left hidden
        }
      } else if (!det.classList.contains('dp-under')) det.classList.remove('dp-landed');
    } catch (e) { hold(false); }
    return r;
  };
  try { window.openDetail = openDetail; } catch (e) { /* the binding is enough */ }
  const ec = EpSheet.close;
  EpSheet.close = function () {
    const r = ec.apply(this, arguments);
    clearTimeout(landT); det.classList.remove('dp-landed'); clearTimeout(holdT); hold(false);
    return r;
  };
  // leaving the title page while the panel is still sliding up: nothing stays hidden
  try {
    const cl = closeLayer;
    closeLayer = function (id) {
      if (id === 'detail') { clearTimeout(landT); det.classList.remove('dp-under', 'dp-landed'); hold(false); }
      const r = cl.apply(this, arguments);
      // the panel slides all the way down even when closing keeps the phone busy for a moment: it stays until its own
      // slide has played, instead of a fixed time that can run out before the first frame of the slide is drawn
      if (id === 'epSheet' && es.classList.contains('leaving')) { clearTimeout(es._leaveT); es._leaveT = setTimeout(() => es.classList.remove('leaving'), 900); }
      return r;
    };
    window.closeLayer = closeLayer;
  } catch (e) { /* closing still works */ }

  /* The source list: while the addons are still answering in the first moment after a page or episode opens, it shows
     one steady "asking" state and draws the answers once (when all have answered, or at 0.9 s), instead of drawing a
     half list, a filter row and a trailer line that are replaced a frame later. */
  const SETTLE = 1800;
  let openAt = -1e9, first = false, tmr = 0, phKey = '', tgKey = '';
  const mark = () => { openAt = now(); first = true; clearTimeout(tmr); };
  const eo = EpSheet.open;
  EpSheet.open = function () {
    mark(); const r = eo.apply(this, arguments);
    try { if (det.classList.contains('dp-under') && !det.classList.contains('dp-landed')) { det._mkLandTok = (det._mkLandTok || 0) + 1; clearTimeout(landT); landT = setTimeout(land, 700); } } catch (e) { land(); }
    return r;
  };
  const od2 = openDetail;
  openDetail = function () { mark(); return od2.apply(this, arguments); };
  try { window.openDetail = openDetail; } catch (e) { /* the binding is enough */ }
  const rs = renderStreamsPanel;
  const w = function () {
    /* 2.95.22 ep step: another episode (Previous / Next, a pick) starts the quiet first moment again */
    try { const k = (D.meta && D.meta.id) + '|' + (D.video ? (D.video.id || D.video.season + 'x' + D.video.episode) : ''); if (k !== tgKey) { tgKey = k; openAt = now(); } } catch (e) { /* keep the window */ }
    /* 2.95.21 one draw: no search started yet counts as still asking too */
    let pend = false; try { pend = !!(typeof D === 'object' && D && (!D.status || D.status.pending)); } catch (e) { pend = false; }
    const age = now() - openAt;
    let fin = false;
    try {
      const t = pend && D.status && typeof detailStreamTarget === 'function' && detailStreamTarget();
      const total = t ? engine.addons.filter((a) => engine.supports(a, 'stream', t.type, t.id)).length : 0;
      fin = !!(t && total > 0 && D.status.answered >= total);
    } catch (e) { fin = false; }
    if (!pend || (age >= SETTLE && !fin)) { clearTimeout(tmr); return rs.apply(this, arguments); }
    clearTimeout(tmr); tmr = setTimeout(() => { try { renderStreamsPanel(); } catch (e) { /* the next answer draws it */ } }, Math.max(fin ? 400 : 0, SETTLE - age + 10));
    if (age >= SETTLE) return; // all answered, the search is closing: its final draw comes in a moment
    // the same episode's steady "asking" state already in the box is not drawn again
    let key = ''; try { key = (D.meta && D.meta.id) + '|' + (D.video ? (D.video.id || D.video.season + 'x' + D.video.episode) : ''); } catch (e) { key = ''; }
    const bx = document.getElementById('dStreams');
    if (key && key === phKey && bx && bx.querySelector('.status-line .spin')) return;
    phKey = key; first = false;
    const keep = D.streams; D.streams = [];
    try { return rs.apply(this, arguments); } finally { D.streams = keep; }
  };
  renderStreamsPanel = w; try { window.renderStreamsPanel = w; } catch (e) { /* the binding is enough */ }
})();