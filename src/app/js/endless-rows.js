
/* Endless rows (2.7.28+) */
/* Scrolling or pressing Right near the end of a Home row adds the next titles; "See all" stays in the header */
const Endless = {
  CHUNK: IS_TV ? 24 : 40, CAP: IS_TV ? 240 : 400,
  attach(sec, cat, metas, shown) {
    const rail = sec.querySelector('.rail'); if (!rail) return;
    if (sec._lazy) { sec._lazy.attach = [cat, metas, shown]; return; }
    const ids = new Set(metas.map((m) => m.id));
    rail._inf = { cat, buf: metas.slice(shown), ids, skip: metas.length, count: shown, done: !cat.extras.some((e) => e.name === 'skip'), busy: false, ended: false, fails: 0, waitTill: 0 };
    if (rail._inf.done && !rail._inf.buf.length) this.end(rail);
    else if (rail.scrollWidth <= rail.clientWidth * 1.5) this.near(rail);
  },
  // el: the poster the remote is on (TV), or nothing for a scroll
  near(rail, el) {
    const st = rail._inf; if (!st || st.busy || st.ended || performance.now() < st.waitTill) return;
    if (el) { let x = el; for (let n = 0; n < 8 && x; n++) x = x.nextElementSibling; if (x) return; }
    else if (rail.scrollLeft + rail.clientWidth < rail.scrollWidth - rail.clientWidth * 1.5) return;
    this.more(rail);
  },
  async more(rail) {
    const st = rail._inf; st.busy = true;
    try {
      if (st.buf.length < this.CHUNK && !st.done) {
        if (!st.buf.length) rail.insertAdjacentHTML('beforeend', '<div class="skeleton rail-sk"></div>'.repeat(3));
        try {
          const metas = await engine.fetchCatalog(st.cat, { skip: st.skip });
          st.skip += metas.length; st.fails = 0;
          const add = metas.filter((m) => !st.ids.has(m.id)); add.forEach((m) => st.ids.add(m.id));
          if (!add.length) st.done = true; else st.buf.push(...add);
        } catch (e) { if (++st.fails >= 3) st.done = true; else st.waitTill = performance.now() + 4000; }
        rail.querySelectorAll('.rail-sk').forEach((x) => x.remove());
      }
      if (!rail.isConnected) return;
      const take = st.buf.splice(0, Math.max(0, Math.min(this.CHUNK, this.CAP - st.count)));
      st.count += take.length;
      if (take.length) { const sx = rail.closest('section'), ax = (sx && sx._ax) || 'poster', k0 = st.count - take.length; rail.insertAdjacentHTML('beforeend', take.map((m, k) => (ax === 'poster' ? cardHTML(m) : AddonUI.card(m, ax, k0 + k))).join('')); icons(); queueWall(); }
      if (st.count >= this.CAP || (st.done && !st.buf.length)) this.end(rail);
    } finally { st.busy = false; }
  },
  end(rail) {
    const st = rail._inf; if (!st || st.ended) return; st.ended = true;
    rail.insertAdjacentHTML('beforeend', '<button class="rail-all" type="button" data-nav><i data-lucide="layout-grid"></i><span>See all</span></button>');
    rail.lastElementChild.addEventListener('click', () => openCatalog(st.cat)); icons();
  },
};
{
  let pend = new Set(), raf = 0;
  document.addEventListener('scroll', (e) => {
    const r = e.target; if (!r || !r._inf || r._inf.ended) return;
    pend.add(r); if (!raf) raf = requestAnimationFrame(() => { raf = 0; pend.forEach((x) => Endless.near(x)); pend.clear(); });
  }, { capture: true, passive: true });
}
