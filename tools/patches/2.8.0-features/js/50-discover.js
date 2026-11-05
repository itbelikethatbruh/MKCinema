/* ---------------- Discover: Top 10, curated rows, Shortlist, Where to watch, Honours ----------------
   All from Cinemeta, which MKCinema already uses, so nothing needs a key: the ten most popular films (or series) with
   big numerals, films under 90 minutes, hidden gems (well rated, little seen), award winners, and a decade that changes
   every day. Shortlist deals the same pool one poster at a time: right saves, left skips. Where to watch needs the
   user's own TMDB key (Settings › Home) and shows which services carry a title in their region, from JustWatch via TMDB. */
const Curate = {
  pool: null, poolDay: '',
  cinemeta() { return engine.addons.find((a) => a.enabled !== false && /cinemeta/i.test(a.baseUrl)); },
  async cat(type, id, extra = {}) {
    const a = this.cinemeta(); if (!a) return [];
    try { return await engine.fetchCatalog({ addon: a, type, id, name: id }, extra); } catch (e) { return []; }
  },
  async get() {
    const day = X8.dayKey();
    if (this.pool && this.poolDay === day) return this.pool;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const [m0, m1, r0, s0, r1] = await Promise.all([this.cat('movie', 'top'), this.cat('movie', 'top', { skip: 50 }), this.cat('movie', 'imdbRating'), this.cat('series', 'top'), this.cat('series', 'imdbRating')]);
      const dec = this.decade(), years = X8.seeded(Array.from({ length: 10 }, (_, i) => String(dec.from + i)), day).slice(0, 3);
      const d = (await Promise.all(years.map((y) => this.cat('movie', 'year', { genre: y })))).flat();
      const uniq = (l) => { const s = new Set(); return l.filter((m) => m && m.id && !s.has(m.id) && s.add(m.id)); };
      this.pool = { topMovies: m0, topSeries: s0, movies: uniq([...m0, ...m1, ...r0]), series: uniq([...s0, ...r1]), decade: uniq(d), dec };
      this.poolDay = day; this.loading = null; return this.pool;
    })();
    return this.loading;
  },
  decade() { const ds = [1970, 1980, 1990, 2000, 2010]; const from = ds[hash(X8.dayKey()) % ds.length]; return { from, label: from >= 2000 ? `the ${from}s` : `the ’${String(from).slice(2)}s` }; },
  rows(pool) {
    const seen = isWatched, r = (m) => parseFloat(m.imdbRating) || 0;
    const pop = pool.movies.map((m) => Number(m.popularity) || 0).sort((a, b) => a - b), mid = pop[Math.floor(pop.length / 2)] || 0;
    const day = X8.dayKey();
    return {
      short: X8.seeded(pool.movies.filter((m) => { const n = X8.runtimeMin(m); return n >= 60 && n <= 90 && r(m) >= 6.2 && !seen(m.id); }), `${day}s`).slice(0, 24),
      gems: X8.seeded(pool.movies.filter((m) => r(m) >= 7.2 && (Number(m.popularity) || 0) <= mid && !seen(m.id)), `${day}g`).slice(0, 24),
      awards: X8.seeded(pool.movies.filter((m) => /\bwon\s+\d+\s+oscars?\b/i.test(m.awards || '') && !seen(m.id)), `${day}a`).slice(0, 24),
      decade: pool.decade.filter((m) => r(m) >= 6.8).sort((a, b) => r(b) - r(a)).slice(0, 30),
    };
  },
  top10(list) {
    return list.slice(0, 10).map((m, i) => cardHTML(m).replace('<div class="card"', `<div class="card t10c" data-rank="${i + 1}"`)).join('');
  },
  async render() {
    const rows = $('#homeRows'); if (!rows || S.view !== 'home') return;
    const want = ['top10', 'short', 'gems', 'awards', 'decade'].filter((k) => Layout.shows(k));
    $$('#homeRows [data-curate]').forEach((x) => x.remove());
    if (!want.length && !Layout.shows('shortlist')) return;
    const focus = Layout.get().focus, seriesFirst = /^series/.test(focus);
    const secs = {};
    const T = {
      top10: [seriesFirst ? 'Top 10 series today' : 'Top 10 films today', 'The most popular right now'],
      short: ['Under 90 minutes', 'Great films for a short evening'], gems: ['Hidden gems', 'Well rated, little seen'],
      awards: ['Award winners', 'Oscar-winning films'], decade: [`From ${this.decade().label}`, 'Best rated, a new decade every day'],
    };
    // after Continue watching, Your Picks and My watchlist, before the addon catalogs
    const anchor = [...rows.children].find((el) => el.matches('section.row') && !el.id && !/My watchlist/.test(el.textContent.slice(0, 40)) && !el.matches('.picks-row, #picksRow, #cwRow')) || null;
    want.forEach((k) => { if (focus === 'series' && k !== 'top10') return; const s = rowShell(T[k][0], T[k][1]); s.dataset.curate = k; if (k === 'top10') s.classList.add('t10-row'); rows.insertBefore(s, anchor); secs[k] = s; });
    if (Layout.shows('shortlist')) this.shortlistStrip(rows, anchor);
    let pool; try { pool = await this.get(); } catch (e) { pool = null; }
    if (!pool || !pool.movies.length) { Object.values(secs).forEach((s) => s.remove()); return; }
    const got = this.rows(pool);
    Object.entries(secs).forEach(([k, s]) => {
      const list = k === 'top10' ? (seriesFirst ? pool.topSeries : pool.topMovies) : got[k];
      if (!list || list.length < (k === 'top10' ? 5 : 6)) { s.remove(); return; }
      fillRail(s, k === 'top10' ? this.top10(list) : list.map((m) => cardHTML(m)).join(''));
    });
    icons();
  },
  shortlistStrip(rows, anchor) {
    const el = document.createElement('section'); el.className = 'sl-strip'; el.dataset.curate = 'shortlist';
    el.innerHTML = `<div class="sl-t"><span class="pk-mark">Shortlist</span><h3>Twenty films, one at a time.</h3><p>Save the ones you like to your watchlist and skip the rest. Right to save, left to skip.</p></div><button class="btn btn-ghost" type="button" data-nav id="slGo"><i data-lucide="layers"></i>Start a Shortlist</button>`;
    rows.insertBefore(el, anchor); $('#slGo', el).onclick = () => Shortlist.open(); icons();
  },
  init() {
    HOME_ROWS.push(['top10', 'Top 10 today'], ['shortlist', 'Shortlist invitation'], ['short', 'Under 90 minutes'], ['gems', 'Hidden gems'], ['awards', 'Award winners'], ['decade', 'Decade of the day']);
    const home = renderHome;
    renderHome = function () { const p = home.apply(this, arguments); Curate.render(); return p; };
  },
};

const Shortlist = {
  deck: [], i: 0, saved: 0,
  async open() {
    X8.layer('slLayer', { label: 'Shortlist', icon: 'layers', eyebrow: 'Shortlist', wide: true });
    X8.body('slLayer').innerHTML = '<div class="status-line" style="padding:30px"><span class="spin"></span>Dealing twenty films…</div>';
    X8.open('slLayer');
    const pool = await Curate.get().catch(() => null);
    const taste = Store.get('taste', null), liked = new Set(((taste && taste.genres) || []).map((g) => g.toLowerCase()));
    const skip = new Set([...S.watchlist.map((m) => m.id), ...Store.get('slSkipped', [])]);
    const all = pool ? [...pool.movies, ...pool.series] : [];
    const scored = all.filter((m) => !skip.has(m.id) && !isWatched(m.id) && (m.poster || String(m.id).startsWith('tt')))
      .map((m) => [m, (parseFloat(m.imdbRating) || 6) + genresOf(m).filter((g) => liked.has(g.toLowerCase())).length * 0.8 + (hash(m.id + X8.dayKey()) % 100) / 60]);
    this.deck = scored.sort((a, b) => b[1] - a[1]).slice(0, 20).map(([m]) => m); this.i = 0; this.saved = 0;
    if (!this.deck.length) { X8.body('slLayer').innerHTML = '<div class="empty-state"><i data-lucide="layers"></i><h3>Nothing new to deal</h3><p>Cinemeta did not answer, or you have seen or saved everything in today’s pool. Come back tomorrow.</p></div>'; icons(); return; }
    this.paint();
  },
  paint() {
    const b = X8.body('slLayer'), m = this.deck[this.i];
    if (!m) {
      b.innerHTML = `<div class="sl-done"><i data-lucide="check-circle-2"></i><h3>That’s the Shortlist</h3><p>${this.saved ? `${this.saved} film${this.saved === 1 ? '' : 's'} saved to your watchlist.` : 'Nothing caught your eye this time.'}</p><div class="actions"><button class="btn btn-prime" type="button" data-nav id="slLib"><i data-lucide="bookmark"></i>Open my watchlist</button><button class="btn btn-ghost" type="button" data-nav data-x8close>Close</button></div></div>`;
      icons(); $('#slLib').onclick = () => { X8.close('slLayer'); go('library'); }; return;
    }
    const meta = [yearOf(m), X8.runtimeMin(m) ? `${X8.runtimeMin(m)} min` : '', genresOf(m).slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    b.innerHTML = `<div class="sl-wrap"><div class="sl-card" id="slCard"><div class="sl-art">${imgTag(metaPoster(m), m.name, m.id)}</div>
        <div class="sl-info"><span class="sl-n tnum">${this.i + 1} / ${this.deck.length}</span><h3>${esc(m.name)}</h3><p class="sl-meta">${esc(meta)}${m.imdbRating ? ` · <span class="rt ${rateTier(m.imdbRating)}">★ ${esc(m.imdbRating)}</span>` : ''}</p><p class="sl-desc">${esc(String(m.description || '').slice(0, 260))}</p></div></div>
      <div class="sl-acts"><button class="btn btn-ghost" type="button" data-nav data-sl="skip"><i data-lucide="x"></i>Skip</button><button class="btn btn-ghost" type="button" data-nav data-sl="open"><i data-lucide="info"></i>Details</button><button class="btn btn-prime" type="button" data-nav data-sl="save"><i data-lucide="bookmark-plus"></i>Save</button></div></div>`;
    icons();
    $$('[data-sl]', b).forEach((x) => x.addEventListener('click', () => this.act(x.dataset.sl)));
    this.swipe($('#slCard'));
    if (IS_TV) { Nav.settle(); const s = $('[data-sl="save"]', b); if (s) Nav.focus(s, true); }
  },
  act(a) {
    const m = this.deck[this.i]; if (!m) return;
    if (a === 'open') { X8.close('slLayer'); openDetail(m); return; }
    if (a === 'save') { if (!inWatchlist(m.id)) toggleWatchlist(m); this.saved++; }
    if (a === 'skip') { const s = Store.get('slSkipped', []); s.push(m.id); Store.set('slSkipped', s.slice(-400)); }
    const c = $('#slCard'); if (c && !CFG.reduceMotion) { c.classList.add(a === 'save' ? 'out-r' : 'out-l'); setTimeout(() => { this.i++; this.paint(); }, 200); } else { this.i++; this.paint(); }
  },
  swipe(el) {
    if (!el) return; let x0 = null, dx = 0;
    el.addEventListener('pointerdown', (e) => { x0 = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.classList.add('drag'); });
    el.addEventListener('pointermove', (e) => { if (x0 == null) return; dx = e.clientX - x0; el.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`; });
    const end = () => { if (x0 == null) return; x0 = null; el.classList.remove('drag'); el.style.transform = ''; if (Math.abs(dx) > 90) this.act(dx > 0 ? 'save' : 'skip'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  },
  key(e) {
    if (X8.top() !== 'slLayer' || /INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) return;
    if (IS_TV) return; // on a TV the arrows move between the buttons
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); this.act('save'); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); this.act('skip'); }
  },
};
document.addEventListener('keydown', (e) => Shortlist.key(e), true);

/* Where to watch and Honours on a title's page */
const WhereToWatch = {
  cache: new Map(),
  region() { if (CFG.region) return CFG.region; const m = String(navigator.language || 'en-US').match(/-([A-Z]{2})$/i); return m ? m[1].toUpperCase() : 'US'; },
  key: () => (Keys.get().tmdb || '').trim(),
  async tmdbId(m) {
    if (m.moviedb_id) return m.moviedb_id;
    const imdb = imdbOf(m); if (!imdb) return null;
    const r = await fetch(`https://api.themoviedb.org/3/find/${imdb}?api_key=${encodeURIComponent(this.key())}&external_source=imdb_id`); if (!r.ok) return null;
    const j = await r.json(), hit = (m.type === 'series' ? j.tv_results : j.movie_results) || []; return hit[0] && hit[0].id;
  },
  async get(m) {
    const ck = `${m.id}|${this.region()}`; if (this.cache.has(ck)) return this.cache.get(ck);
    const p = (async () => {
      const id = await this.tmdbId(m); if (!id) return null;
      const r = await fetch(`https://api.themoviedb.org/3/${m.type === 'series' ? 'tv' : 'movie'}/${id}/watch/providers?api_key=${encodeURIComponent(this.key())}`); if (!r.ok) return null;
      const j = await r.json(); return (j.results || {})[this.region()] || null;
    })().catch(() => null);
    this.cache.set(ck, p); return p;
  },
  honours(m) {
    const a = String(m.awards || '').trim(); if (!a) return '';
    const big = a.match(/won\s+(\d+)\s+(oscars?|primetime emmys?|emmys?|golden globes?|baftas?)/i);
    return `<div class="d-honours"><i data-lucide="award"></i><span>${big ? `<b>Won ${esc(big[1])} ${esc(big[2].replace(/^\w/, (c) => c.toUpperCase()))}</b> · ` : ''}${esc(a.replace(/^won\s+\d+\s+[a-z ]+\.\s*/i, '').replace(/\.$/, ''))}</span></div>`;
  },
  async fill(m) {
    const box = $('#dWtw'); if (!box || !this.key() || !/^(movie|series)$/.test(m.type)) return;
    const r = await this.get(m); if (!$('#dWtw') || D.meta !== m) return;
    if (!r) { box.remove(); return; }
    // each service shows once: streaming first, and rent and buy share one row (Drake: no duplicate rent/buy buttons)
    const seen = new Set(), pick = (keys) => keys.flatMap((k) => r[k] || []).filter((x) => !seen.has(x.provider_id) && seen.add(x.provider_id)).slice(0, 6);
    const grp = [['Stream', ['flatrate']], ['Free', ['free']], ['With ads', ['ads']], ['Rent or buy', ['rent', 'buy']]].map(([l, k]) => [l, pick(k)]).filter(([, x]) => x.length);
    if (!grp.length) { box.remove(); return; }
    box.innerHTML = `<h3 class="sec-title"><i data-lucide="tv"></i>Where to watch <small class="wtw-r">${esc(this.region())}</small></h3>
      ${grp.map(([l, list]) => `<div class="wtw-g"><span class="wtw-l">${l}</span>${list.map((p) => `<a class="wtw-p" href="${esc(r.link || '#')}" target="_blank" rel="noopener" data-nav title="${esc(p.provider_name)}">${p.logo_path ? `<img src="https://image.tmdb.org/t/p/w92${esc(p.logo_path)}" alt="" loading="lazy">` : ''}<span>${esc(p.provider_name)}</span></a>`).join('')}</div>`).join('')}
      <p class="wtw-src">Availability from JustWatch, via TMDB.</p>`;
    icons();
  },
  init() {
    const base = renderDetail;
    renderDetail = function (loading) {
      const r = base.apply(this, arguments); const m = D.meta;
      const desc = $('#detail .d-desc');
      if (m && desc && !$('#dWtw')) {
        desc.insertAdjacentHTML('afterend', `${WhereToWatch.honours(m)}${WhereToWatch.key() ? '<div class="wtw" id="dWtw"></div>' : ''}`);
        icons(); if (!loading) WhereToWatch.fill(m);
      } else if (m && !loading && $('#dWtw') && !$('#dWtw').children.length) WhereToWatch.fill(m);
      return r;
    };
    const sec = secById('home');
    if (sec) {
      const rows = sec.rows;
      const regions = ['US', 'GB', 'CA', 'AU', 'IE', 'NZ', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'NO', 'DK', 'FI', 'PL', 'PT', 'BR', 'MX', 'AR', 'IN', 'JP', 'KR', 'ZA'];
      sec.rows = () => [...rows(), { group: 'Where to watch' },
        { key: 'region', label: 'Your region', help: 'Used for “Where to watch” on title pages. It needs your TMDB key (Settings › Home, under Ambient Mode, or below).', type: 'select', options: [['', `Automatic (${WhereToWatch.region()})`], ...regions.map((r) => [r, r])], get: () => CFG.region || '', set: (v) => { setCfg('region', v); WhereToWatch.cache.clear(); } },
        ...(rows().some((d) => d.key === 'tmdbKey') ? [] : [{ key: 'tmdbKey2', label: 'TMDB key', help: 'A free API key (v3) from themoviedb.org. Stays on this device and in your own account.', type: 'secret', get: () => Keys.get().tmdb || '', set: (v) => { Keys.set('tmdb', v); WhereToWatch.cache.clear(); } }])];
    }
  },
};
Curate.init();
WhereToWatch.init();
COMMANDS.push({ label: 'Shortlist: twenty films, one at a time', icon: 'layers', run: () => Shortlist.open() });
