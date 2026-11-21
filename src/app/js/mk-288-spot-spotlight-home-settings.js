
/* 2.88 Spotlight Home (Settings > Home > What the featured banner shows > The poster I highlight).
   On TVs and on computers with a mouse, the banner stays at the top of Home and follows the poster under the
   highlight or the pointer. Up from the first row reaches its Play, Trailer, Details and Watchlist buttons. */
const Spot = {
  t: 0, last: '',
  on() { return CFG.bannerFrom === 'focus' && (IS_TV || (matchMedia('(hover:hover)').matches && innerWidth >= 1000)); },
  apply() { document.documentElement.classList.toggle('mk-spot', this.on()); },
  show(card) {
    if (!card || !card.dataset || !card.dataset.id || S.view !== 'home' || !document.documentElement.classList.contains('mk-spot') || !card.closest('#homeRows')) return;
    const id = card.dataset.id; clearTimeout(this.t); if (S.hero.length === 1 && S.hero[0] && S.hero[0].id === id) return;
    this.t = setTimeout(() => {
      const m = S.metas.get(id); if (!m || !(m.background || m.poster) || S.view !== 'home') return;
      this.last = id; S.hero = [m]; S.heroIdx = 0; showHero(0); clearTimeout(S.heroTimer);
    }, IS_TV ? 420 : 520);
  },
  init() {
    this.apply();
    const f = Nav.focus; Nav.focus = function (el, fast) { const r = f.apply(this, arguments); try { Spot.show(el && el.closest && el.closest('.card')); } catch (e) { /* the banner is optional */ } return r; };
    document.addEventListener('mouseover', (e) => { if (!document.documentElement.classList.contains('mk-spot')) return; const c = e.target && e.target.closest && e.target.closest('#homeRows .card'); if (c) Spot.show(c); }, { passive: true });
    addEventListener('resize', () => this.apply(), { passive: true });
  },
};
Spot.init();
