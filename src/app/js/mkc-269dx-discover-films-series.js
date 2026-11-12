
/* ---------------- 2.69 Discover: films and series people may not know yet ----------------
   Its own page in the menu (top menu, side menu, phone menu and TV), next to Home, never inside Peak Cinema. Rows:
   Trending this week, New films to watch at home (out on digital or disc in your region lately), Brand-new series,
   Little-known gems and Little-known series (well rated, little seen, last few years), Recently acclaimed, and
   favourites from another country that changes every day. Films or Series can be picked on their own, remembered per seat.
   It is not a second Home: Home's Top 10, Hidden gems and Award winners come from Cinemeta's all-time lists; these come
   from TMDB and are recent. Titles already watched, titles in Home's Hidden gems today and repeats from rows above are left out.
   Data: TMDB through MKCinema's tmdb-person function, the same way Your Picks asks (v8 lookups trending and fresh, with v7
   discover as the fallback until v8 is live). Only the list asked for, the app language and the region are sent.
   Kids seat: family films and kids' series only, checked again with Seats.kidSafe. */
const DiscoverPage = {
  KINDS: [['all', 'Everything'], ['movie', 'Films'], ['series', 'Series']],
  WORLD: [['ko', 'From Korea'], ['ja', 'From Japan'], ['es', 'In Spanish'], ['fr', 'From France'], ['hi', 'From India'], ['it', 'From Italy'], ['tr', 'From Turkey'], ['de', 'In German'], ['da', 'From Denmark']],
  memo: new Map(), tok: 0, v8ok: null, drawn: '', spot: null,
  kind() { const k = Store.get('dxKind', 'all'); return this.KINDS.some((x) => x[0] === k) ? k : 'all'; },
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  region() { try { return WhereToWatch.region(); } catch (e) { return 'US'; } },
  world() { return this.WORLD[hash(`dx${X8.dayKey()}`) % this.WORLD.length]; },
  /* one list from TMDB, kept for the day (the function caches for hours too) */
  ask(a, params) {
    const key = `${X8.dayKey()}|${a}|${JSON.stringify(params)}`;
    if (this.memo.has(key)) return this.memo.get(key);
    const p = MetaBackup.relay(a, params).then((j) => ((j && j.results) || []).map((x) => Recs.fromTmdb(x)).filter((m) => m && m.id));
    this.memo.set(key, p); p.catch(() => this.memo.delete(key));
    if (this.memo.size > 80) this.memo.delete(this.memo.keys().next().value);
    return p;
  },
  /* a v8 lookup; while the function is still v7 it answers 400, and the v7 stand-in is used from then on */
  async v8(a, params, fallback) {
    if (this.v8ok !== false) {
      try { const r = await this.ask(a, params); this.v8ok = true; return r; } catch (e) { if (/\b400\b/.test(String(e && e.message))) this.v8ok = false; else throw e; }
    }
    return fallback();
  },
  both(fn) {
    return Promise.all([fn('movie').catch(() => []), fn('tv').catch(() => [])]).then(([a, b]) => { const out = []; for (let i = 0; i < 40; i++) [a[i], b[i]].forEach((m) => { if (m) out.push(m); }); return out; });
  },
  specs(kind) {
    const y = new Date().getFullYear(), kids = this.kids(), [ol, wl] = this.world();
    const fam = (k) => (kids ? (k === 'tv' ? { g: '10762' } : { fam: '1', g: '10751' }) : {});
    const pop = (k, extra = {}) => this.ask('discover', { kind: k, sort: 'pop', yf: String(y - 1), n: '20', ...fam(k), ...extra });
    const trend = (k) => (kids ? (k === 'all' ? this.both((x) => pop(x)) : pop(k))
      : this.v8('trending', { kind: k, page: '1' }, () => (k === 'all' ? this.both((x) => pop(x)) : pop(k)))
        .then(async (l) => { if (this.v8ok !== true) return l; const l2 = await this.ask('trending', { kind: k, page: '2' }).catch(() => []); return [...l, ...l2]; }));
    const rows = {
      trend: ['Trending this week', () => trend(kind === 'all' ? 'all' : kind === 'series' ? 'tv' : 'movie')],
      films: ['New films to watch at home', () => this.v8('fresh', { kind: 'movie', region: this.region(), days: '120', ...fam('movie') }, () => this.ask('discover', { kind: 'movie', sort: 'new', n: '20', ...fam('movie') }))],
      shows: ['Brand-new series', () => this.v8('fresh', { kind: 'tv', days: '150', ...fam('tv') }, () => this.ask('discover', { kind: 'tv', sort: 'new', yf: String(y - 1), n: '20', ...fam('tv') }))],
      gems: ['Little-known gems', () => this.ask('discover', { kind: 'movie', sort: 'gem', yf: String(y - 4), ng: '99,10770', n: '20', ...fam('movie') })],
      sgems: ['Little-known series', () => this.ask('discover', { kind: 'tv', sort: 'gem', yf: String(y - 5), ng: '99', n: '20', ...fam('tv') })],
      top: ['Recently acclaimed', () => (kind === 'all' ? this.both((k) => this.ask('discover', { kind: k, sort: 'top', yf: String(y - 2), n: '20', ...fam(k) })) : this.ask('discover', { kind: kind === 'series' ? 'tv' : 'movie', sort: 'top', yf: String(y - 2), n: '20', ...fam(kind === 'series' ? 'tv' : 'movie') }))],
      // today's country first; a country with too few recent hits hands over to the next one
      world: [wl, async () => {
        const i0 = this.WORLD.findIndex((w) => w[0] === ol);
        for (let j = 0; j < 3; j++) {
          const [c, t] = this.WORLD[(i0 + j) % this.WORLD.length], ex = { ol: c, yf: String(y - 3) };
          const list = await (kind === 'all' ? this.both((k) => pop(k, ex)) : pop(kind === 'series' ? 'tv' : 'movie', ex));
          if (list.length >= 12 || j === 2) return { list, title: t };
        }
        return [];
      }],
    };
    const order = kind === 'movie' ? ['trend', 'films', 'gems', 'top', 'world'] : kind === 'series' ? ['trend', 'shows', 'sgems', 'top', 'world'] : ['trend', 'films', 'shows', 'gems', 'sgems', 'top', 'world'];
    return order.map((k) => ({ key: k, title: rows[k][0], load: rows[k][1] }));
  },
  /* titles Home already shows today in Hidden gems */
  homeGems() { try { return Curate.pool ? new Set(Curate.rows(Curate.pool).gems.map((m) => m.id)) : new Set(); } catch (e) { return new Set(); } },
  shell() {
    const box = $('#dxBody'); if (!box) return null;
    const k = this.kind();
    box.innerHTML = `<div class="dx-head"><div><h1 class="page-title">Discover</h1><p class="page-sub">New and trending films and series, and great ones you may have missed.</p></div>
      <div class="segc" id="dxKind" role="radiogroup" aria-label="Show">${this.KINDS.map(([id, l]) => `<button type="button" data-nav data-dxk="${id}" role="radio" aria-checked="${id === k}" class="${id === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="dx-spot" id="dxSpot" hidden></div><div class="rows" id="dxRows"></div>`;
    $$('[data-dxk]', box).forEach((b) => b.addEventListener('click', () => this.setKind(b.dataset.dxk)));
    return box;
  },
  setKind(k) {
    if (k === this.kind()) return;
    Store.set('dxKind', k); this.drawn = ''; this.render();
    if (IS_TV) { const b = $(`[data-dxk="${k}"]`); if (b) Nav.focus(b, true); }
  },
  async render(force) {
    if (S.view !== 'explore') return;
    const kind = this.kind(), key = `${kind}|${X8.dayKey()}|${this.kids()}|${typeof SEAT === 'undefined' ? '' : SEAT}`;
    if (!force && this.drawn === key && $('#dxRows') && $('#dxRows').children.length) { if (IS_TV) Nav.settle(); return; }
    this.drawn = key; const tok = ++this.tok;
    if (!this.shell()) return;
    const rows = $('#dxRows'), specs = this.specs(kind), kids = this.kids();
    const secs = specs.map((sp) => { const s = rowShell(sp.title, ''); s.dataset.dx = sp.key; rows.appendChild(s); return s; });
    icons();
    const loads = specs.map((sp) => sp.load().catch(() => []));
    const seen = new Set(), home = this.homeGems();
    const keep = (m) => m && m.id && !seen.has(m.id) && !isWatched(m.id) && !home.has(m.id) && (!kids || Seats.kidSafe(m)) && (kind === 'all' || m.type === kind);
    let shown = 0;
    for (let i = 0; i < specs.length; i++) {
      let got = await loads[i];
      if (tok !== this.tok || S.view !== 'explore') return;
      const s = secs[i], title = got && !Array.isArray(got) ? got.title : '';
      const list = [], ids = new Set();
      for (const m of ((got && !Array.isArray(got) ? got.list : got) || [])) { if (list.length < 24 && keep(m) && !ids.has(m.id)) { ids.add(m.id); list.push(m); } }
      if (list.length < 6) { s.remove(); continue; }
      if (title) { const h = s.querySelector('.row-title'); if (h) h.textContent = title; }
      list.forEach((m) => seen.add(m.id));
      if (!shown) this.spotlight(list.find((m) => m.background && m.description) || null);
      fillRail(s, list.map((m) => cardHTML(m)).join(''));
      shown++;
      if (IS_TV) Nav.settle();
    }
    if (!shown) await this.fallback(tok, kind);
    if (IS_TV) Nav.settle();
  },
  /* no TMDB answer (offline, or a self-hosted copy without MKCinema's functions): this year's titles from Cinemeta */
  async fallback(tok, kind) {
    const y = String(new Date().getFullYear()), rows = $('#dxRows'); if (!rows) return;
    const want = (kind === 'all' ? ['movie', 'series'] : [kind]).map((t) => [t, t === 'series' ? 'New series' : 'New films']);
    let shown = 0;
    for (const [t, title] of want) {
      let list = [];
      try { list = await Curate.cat(t, 'year', { genre: y }); } catch (e) { list = []; }
      if (tok !== this.tok) return;
      list = list.filter((m) => m && m.id && !isWatched(m.id) && (!this.kids() || Seats.kidSafe(m))).slice(0, 24);
      if (list.length < 6) continue;
      const s = rowShell(title, ''); s.dataset.dx = `cm-${t}`; rows.appendChild(s); fillRail(s, list.map((m) => cardHTML(m)).join('')); shown++;
    }
    if (shown) return;
    this.drawn = '';
    rows.innerHTML = `<div class="dx-empty"><i data-lucide="compass"></i><h3>Nothing to show right now</h3><p>This page needs the internet to find new films and series. Check your connection and try again.</p><button class="btn btn-ghost" type="button" data-nav id="dxRetry"><i data-lucide="refresh-cw"></i>Try again</button></div>`;
    icons(); const r = $('#dxRetry'); if (r) r.onclick = () => { this.memo.clear(); this.v8ok = null; this.render(true); };
  },
  spotlight(m) {
    const box = $('#dxSpot'); if (!box) return;
    this.spot = m; if (!m) { box.hidden = true; return; }
    const meta = [yearOf(m), genresOf(m).slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    const bg = metaBg(m) || '';
    box.innerHTML = `<img class="dx-bg" alt="" decoding="async" src="${esc(bg)}">
      <div class="dx-body"><span class="dx-eye"><i data-lucide="flame"></i>Trending now</span><h2 class="dx-t" translate="no">${esc(m.name)}</h2><span class="dx-m"><span>${m.type === 'series' ? 'Series' : 'Film'}</span>${meta ? ` · ${esc(meta)}` : ''}</span><p class="dx-d" translate="no">${esc(m.description)}</p>
        <div class="dx-acts"><button class="btn btn-prime" type="button" data-nav id="dxOpen"><i data-lucide="info"></i>Details</button><button class="btn btn-ghost" type="button" data-nav id="dxList"></button></div></div>`;
    const img = $('.dx-bg', box), show = () => { img.classList.add('in'); box.classList.add('ready'); };
    img.addEventListener('load', show, { once: true }); img.addEventListener('error', () => box.classList.add('ready'), { once: true });
    if (img.complete && img.naturalWidth) show();
    box.hidden = false;
    $('#dxOpen', box).onclick = () => openDetail(m);
    const lb = $('#dxList', box), paint = () => { lb.innerHTML = inWatchlist(m.id) ? '<i data-lucide="check"></i>In watchlist' : '<i data-lucide="plus"></i>Watchlist'; icons(); };
    lb.onclick = () => { toggleWatchlist(m); paint(); };
    paint();
  },
  init() {
    if (!$('#view-explore')) {
      const home = $('#view-home'); if (!home) return;
      home.insertAdjacentHTML('afterend', '<section class="view" id="view-explore" aria-label="Discover"><div id="dxBody"></div></section>');
    }
    const h = $('#tabs .tab[data-view="home"]');
    if (h && !$('#tabs .tab[data-view="explore"]')) {
      h.insertAdjacentHTML('afterend', '<button class="tab" data-view="explore" data-nav type="button" title="Discover"><i data-lucide="compass"></i><span class="lbl">Discover</span></button>');
      $('#tabs .tab[data-view="explore"]').addEventListener('click', () => go('explore'));
    }
    const g0 = go; go = function (view) { const r = g0.apply(this, arguments); if (view === 'explore') DiscoverPage.render(); return r; };
    COMMANDS.push({ label: 'Discover new and trending films and series', icon: 'compass', run: () => go('explore') });
    try { if (typeof Miko !== 'undefined' && Array.isArray(Miko.VIEWS)) Miko.VIEWS.splice(1, 0, [/^(discover|the discover page|discovery|what'?s new|what'?s trending|trending|new releases|new films|new movies|new shows)$/, 'explore', 'Discover']); } catch (e) { /* Miko not on this build */ }
    try { if (typeof DockFit !== 'undefined') DockFit.run(); } catch (e) { /* cosmetic */ }
    icons();
    if (/^#explore$/.test(location.hash)) setTimeout(() => go('explore'), 0);
  },
};
DiscoverPage.init();
