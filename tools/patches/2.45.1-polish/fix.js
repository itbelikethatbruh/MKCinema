/* 2.45.1: bigger posters on "Pick three favorites": about 4 on a phone, 5 elsewhere, as big as the space allows, and let them grow */
(function () {
  if (typeof Tour240 === 'undefined') return;
  Tour240.tasteFit = function () {
    const g = $('#qpGrid'); if (!g) return;
    const kids = [...g.children].filter((x) => !x.classList.contains('qp-empty'));
    kids.forEach((x) => { x.hidden = false; });
    if (!kids.length) { this.moreBtn(false); return; }
    g.style.gridTemplateColumns = ''; g.style.minHeight = ''; g.classList.remove('qp-nolab');
    const cs = getComputedStyle(g), gap = parseFloat(cs.columnGap) || 10, W = g.clientWidth - 6, H = g.clientHeight;
    const r0 = kids[0].getBoundingClientRect(), lab = Math.max(0, r0.height - r0.width * 1.5);
    const phone = W < 560, maxW = IS_TV ? 240 : phone ? 170 : 220, minW = 72, want = Math.min(phone ? 4 : 5, kids.length); let best = null;
    for (let r = 1; r <= 4; r++) {
      const row = (H - (r - 1) * gap) / r; let fit = (row - lab) / 1.5, nl = false;
      if (fit < 96) { fit = row / 1.5; nl = true; }
      fit = Math.min(maxW, fit); if (fit < minW) break;
      // enough columns for the target, then as wide as the row lets them be
      const c = Math.max(Math.ceil(want / r), Math.floor((W + gap) / (fit + gap)));
      const w = Math.min(fit, (W - (c - 1) * gap) / c); if (w < minW) continue;
      const o = { c, r, w, n: c * r, nl };
      if (!best || (best.n < want && o.n > best.n) || (o.n >= want && w > best.w)) best = o;
    }
    if (!best) { best = { c: Math.max(1, Math.floor((W + gap) / (minW + gap))), r: 1, w: minW, nl: true }; g.style.minHeight = `${Math.ceil(minW * 1.5)}px`; }
    const w = best.w;
    g.classList.toggle('qp-nolab', !!best.nl); g.style.gridTemplateColumns = `repeat(${best.c}, ${Math.floor(w)}px)`;
    const cap = best.c * best.r;
    const pages = Math.max(1, Math.ceil(kids.length / cap)); if (this.page >= pages) this.page = 0;
    kids.forEach((x, i) => { x.hidden = Math.floor(i / cap) !== this.page; });
    this.moreBtn(pages > 1);
  };
})();
/* 2.45.1: the side menu goes back to the top when you leave it, so it never sits half-scrolled with the logo cut off */
(function () {
  const wrap = document.querySelector('.dock-wrap'), dock = wrap && wrap.querySelector('.dock'); if (!dock) return;
  let t = 0;
  const reset = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!document.documentElement.classList.contains('nav-side') || !dock.scrollTop) return;
      if (wrap.matches(':hover') || wrap.contains(document.activeElement)) return;
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { dock.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' }); } catch (e) { dock.scrollTop = 0; }
    }, 120);
  };
  wrap.addEventListener('mouseleave', reset);
  wrap.addEventListener('focusout', (e) => { if (!e.relatedTarget || !wrap.contains(e.relatedTarget)) reset(); });
  wrap.addEventListener('mouseenter', () => clearTimeout(t));
  // changing page from the menu also counts as leaving it
  wrap.addEventListener('click', (e) => { if (e.target.closest('#tabs .tab')) setTimeout(reset, 400); });
})();
