
'use strict';
/* 2.40 smooth swaps (see the style block above) */
const Swaps = {
  PICK: '.chip, .segc button, .seg button, [data-season]',
  LISTS: '.grid, .eps',
  ITEMS: '[data-card], .ep',
  pickedAt: 0,
  /* one layer per list instead of one per poster on TVs and on Low graphics */
  lite() { return IS_TV || !document.body.classList.contains('fx'); },
  key(el) { return el.dataset.id || el.dataset.vid || ''; },
  restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); },
  pickKey(b) {
    for (const a of b.attributes) if (a.name.startsWith('data-') && a.name !== 'data-nav' && /^[\w-]+$/.test(a.name)) return `[${a.name}="${CSS.escape(a.value)}"]`;
    return '';
  },
  /* the chip that was tapped settles in, even when the page rebuilt it */
  onPick(e) {
    const b = e.target.closest && e.target.closest(this.PICK); if (!b || b.disabled) return;
    this.pickedAt = performance.now();
    if (IS_TV) return;
    const sel = this.pickKey(b), scope = b.closest('.view, .layer-ov') || document;
    requestAnimationFrame(() => {
      const t = b.isConnected ? b : sel ? scope.querySelector(`${sel}.on`) || document.querySelector(`${sel}.on`) : null;
      if (!t || !(t.classList.contains('on') || t.getAttribute('aria-checked') === 'true' || t.getAttribute('aria-selected') === 'true')) return;
      this.restart(t, 'mk-pick'); t.addEventListener('animationend', () => t.classList.remove('mk-pick'), { once: true });
    });
  },
  /* new posters and episodes come in one after another; ones that were already on screen stay put */
  onMutate(recs) {
    let gone = null; const added = new Map();
    for (const r of recs) {
      for (const n of r.removedNodes) {
        if (n.nodeType !== 1) continue;
        if (!gone) gone = new Set();
        if (n.matches(this.ITEMS)) gone.add(this.key(n));
        else if (n.firstElementChild) for (const x of n.querySelectorAll(this.ITEMS)) gone.add(this.key(x));
      }
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1 || !n.isConnected) continue;
        if (n.matches(this.ITEMS)) {
          const l = n.parentElement; if (!l || !l.matches(this.LISTS)) continue;
          if (!added.has(l)) added.set(l, []); added.get(l).push(n);
        } else if (n.firstElementChild) {
          for (const l of n.matches(this.LISTS) ? [n] : n.querySelectorAll(this.LISTS)) {
            const its = [...l.children].filter((x) => x.matches(this.ITEMS)); if (its.length) added.set(l, its);
          }
        }
      }
    }
    if (!added.size) return;
    const picked = performance.now() - this.pickedAt < 1600, lite = this.lite();
    added.forEach((its, list) => {
      list.classList.remove('mk-dim');
      const fresh = picked ? its : its.filter((x) => !gone || !gone.has(this.key(x)));
      if (!fresh.length || list.closest('[hidden]')) return;
      if (lite) { this.restart(list, 'mk-gin'); return; }
      const vh = innerHeight; let i = 0;
      for (const x of fresh) {
        if (i > 40 || x.getBoundingClientRect().top > vh + 40) break; // below the fold nobody sees it, so it is skipped
        x.style.setProperty('--mk-i', Math.min(i++, 12)); x.classList.add('mk-in');
        x.addEventListener('animationend', () => { x.classList.remove('mk-in'); x.style.removeProperty('--mk-i'); }, { once: true });
      }
    });
  },
  init() {
    document.addEventListener('click', (e) => this.onPick(e), true);
    new MutationObserver((r) => this.onMutate(r)).observe(document.body,{ childList: true, subtree: true });
  },
};
Swaps.init();

/* Anime: switching Trending, Airing now, Most popular, Top rated or a genre keeps the page in place.
   The old list dims, the new one comes in, and a list seen in the last 10 minutes comes back at once. */
if (typeof AnimeHub !== 'undefined') {
  const A = AnimeHub, list0 = A.list.bind(A), cache = new Map();
  A.list = async function (id, extra = {}) {
    const k = `${id}|${extra.genre || ''}|${extra.skip || 0}`, c = cache.get(k);
    if (c && Date.now() - c.t < 6e5) return c.v;
    const v = await list0(id, extra); cache.set(k, { t: Date.now(), v }); if (cache.size > 60) cache.delete(cache.keys().next().value);
    return v;
  };
  const genreRow = () => `<div class="net-switch an-genres mk-rowin"><button type="button" class="chip ${A.genre ? '' : 'on'}" data-nav data-ag="">All genres</button>${A.GENRES.map((g) => `<button type="button" class="chip ${A.genre === g ? 'on' : ''}" data-nav data-ag="${esc(g)}">${esc(g)}</button>`).join('')}</div>`;
  const pick = (cur, genre) => {
    const box = $('#animeBody'), grid = $('#animeGrid'), seg = box && $('.an-head .segc', box);
    if (!grid || !seg || A.kids()) { A.cur = cur; A.genre = genre; A.render(); return; }
    if (cur === A.cur && genre === A.genre) return;
    A.cur = cur; A.genre = genre;
    $$('[data-al]', box).forEach((b) => { const on = b.dataset.al === cur; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    let row = $('.an-genres', box);
    if (cur === 'kitsu-anime-trending') { if (row) row.remove(); row = null; }
    else if (!row) { seg.insertAdjacentHTML('afterend', genreRow()); row = $('.an-genres', box); const r = row; r.addEventListener('animationend', () => r.classList.remove('mk-rowin'), { once: true }); }
    if (row) $$('[data-ag]', row).forEach((b) => b.classList.toggle('on', b.dataset.ag === genre));
    const more = $('#animeMore'); if (more) more.hidden = true;
    if (grid.querySelector('[data-card]')) grid.classList.add('mk-dim');
    else grid.innerHTML = skeletons(12);
    const tok = A.token + 1;
    // on a slow network the dimmed old list gives way to placeholders after a moment
    setTimeout(() => { if (A.token === tok && A.busy && grid.classList.contains('mk-dim')) { grid.classList.remove('mk-dim'); grid.innerHTML = skeletons(12); } }, 900);
    A.skip = 0; A.done = false; A.busy = false;
    Promise.resolve(A.load(true)).finally(() => { if (A.token === tok) grid.classList.remove('mk-dim'); });
    if (IS_TV && typeof Nav !== 'undefined' && Nav.settle) Nav.settle();
  };
  const body = $('#animeBody');
  if (body) body.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-al], [data-ag]'); if (!b || !body.contains(b)) return;
    e.stopPropagation(); // the page's own handlers rebuild the whole page; this keeps it in place
    if (b.dataset.al != null) pick(b.dataset.al, b.dataset.al === 'kitsu-anime-trending' ? '' : A.genre);
    else pick(A.cur, b.dataset.ag);
  }, true);
}
