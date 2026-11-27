
/* ---------------- 2.34.0 Universes and scores from other sites ---------------- */
const Universes = {
  data: null, cur: null, cat: '', loading: null,
  HOME: ['mcu', 'starwars', 'wizarding', 'middleearth', 'dceu', 'spidersony', 'bond', 'jurassic', 'fast', 'mi', 'wick', 'monsterverse', 'conjuring', 'startrek', 'matrix', 'pirates', 'toystory', 'halloween', 'dbz', 'hangover'],
  load() { if (!this.loading) this.loading = fetch('universes.json').then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then((j) => (this.data = j.universes || [])).catch(() => { this.loading = null; return (this.data = []); }); return this.loading; },
  // just the Home cards (made from universes.json by the build); falls back to the full list
  loadHome() { if (!this.homeP) this.homeP = fetch('universes-home.json').then((r) => (r.ok ? r.json() : null)).then((j) => (j && Array.isArray(j.universes) && j.universes.length ? j : null)).catch(() => null).then((j) => j || this.load().then(() => null)); return this.homeP; },
  get(id) { return (this.data || []).find((u) => u.id === id); },
  cats() { return [...new Set((this.data || []).map((u) => u.cat || 'More'))]; },
  logo(u, w) { return u && u.logo ? `https://image.tmdb.org/t/p/${w || 'w500'}${u.logo}` : ''; },
  card(u, i) {
    const n = u.films ? u.films.length : (u.n || 0), lg = this.logo(u);
    return `<button type="button" class="uni-card${lg ? ' has-logo' : ''}" style="--i:${i || 0}" data-nav data-uni="${esc(u.id)}" aria-label="${esc(u.name)}: ${n} films"><img class="uni-art" src="${esc(u.art)}" alt="" loading="lazy" decoding="async" draggable="false" data-fadein>${lg ? `<img class="uni-logo" src="${esc(lg)}" alt="" loading="lazy" decoding="async" draggable="false" data-fadein data-gone="logo">` : ''}<span class="uni-txt"><b>${esc(u.name)}</b><small>${n} ${n === 1 ? 'film' : 'films'}</small></span></button>`;
  },
  bindCards(box) { $$('[data-uni]', box).forEach((b) => b.addEventListener('click', () => this.open(b.dataset.uni))); },
  async place() {
    const rows = $('#homeRows'); if (!rows) return;
    if (typeof Seats !== 'undefined' && Seats.kids()) return;
    const hm = this.data ? null : await this.loadHome(); if (!hm && !(this.data && this.data.length)) return;
    let sec = $('#uniRow');
    if (!sec) {
      const pick = hm ? hm.universes : this.HOME.map((id) => this.get(id)).filter(Boolean), total = hm ? hm.total : this.data.length;
      sec = document.createElement('section'); sec.className = 'row uni-row'; sec.id = 'uniRow';
      sec.innerHTML = `<div class="row-head"><h2 class="row-title">Universes</h2><button class="row-more" type="button" data-nav id="uniAll">See all<i data-lucide="chevron-right"></i></button></div><div class="rail uni-rail">${pick.map((u, i) => this.card(u, i)).join('')}<button class="rail-all" type="button" data-nav id="uniAll2"><i data-lucide="layout-grid"></i><span>See all ${total}</span></button></div>`;
      this.bindCards(sec);
      $('#uniAll', sec).onclick = () => this.open(null); $('#uniAll2', sec).onclick = () => this.open(null);
      icons();
    }
    const ch = $('#chRow'), net = ch && ch.isConnected ? ch : $('#netRow');
    if (net && net.isConnected) { if (net.nextElementSibling !== sec) net.after(sec); }
    else if (!sec.isConnected) { const k = rows.children; if (k[2]) k[2].after(sec); else rows.append(sec); }
  },
  open(id, cat) { this.cur = id || null; if (cat !== undefined) this.cat = cat; go('universe'); },
  async render() {
    const box = $('#uniBody'); if (!box) return;
    await this.load(); if (!this.data.length) { box.innerHTML = '<div class="empty">Universes did not load. Try again in a moment.</div>'; return; }
    const u = this.cur && this.get(this.cur);
    if (!u) {
      const cats = this.cats(), on = cats.includes(this.cat) ? this.cat : '';
      box.innerHTML = `<div class="net-head uni-head"><h1 class="page-title">Universes</h1><p class="page-sub">${this.data.length} film universes and franchises. Open one to see every film in release order.</p>
        <div class="net-switch">${['', ...cats].map((c) => `<button type="button" class="chip ${c === on ? 'on' : ''}" data-nav data-ucat="${esc(c)}">${esc(c || 'All')}</button>`).join('')}</div></div>
        ${cats.filter((c) => !on || c === on).map((c) => `<section class="uni-sec"><h2 class="row-title">${esc(c)}</h2><div class="uni-grid">${this.data.filter((x) => (x.cat || 'More') === c).map((x) => this.card(x)).join('')}</div></section>`).join('')}`;
      $$('[data-ucat]', box).forEach((b) => b.addEventListener('click', () => { this.cat = b.dataset.ucat; this.render(); }));
      this.bindCards(box);
    } else {
      const sib = this.data.filter((x) => (x.cat || 'More') === (u.cat || 'More'));
      box.innerHTML = `<div class="uni-hero"><img src="${esc(u.art)}" alt="" decoding="async"><div>${this.logo(u) ? `<h1 class="page-title uni-title" aria-label="${esc(u.name)}"><img class="uni-hero-logo" src="${esc(this.logo(u))}" alt="" decoding="async" data-gone="label"></h1>` : `<h1 class="page-title">${esc(u.name)}</h1>`}<p class="page-sub">${u.films.length} ${u.films.length === 1 ? 'film' : 'films'} in release order. Playing uses your own addons.</p></div></div>
        <div class="net-switch"><button type="button" class="chip" data-nav data-uback><i data-lucide="layout-grid"></i>All universes</button>${sib.map((x) => `<button type="button" class="chip ${x.id === u.id ? 'on' : ''}" data-nav data-usw="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>
        <div class="grid" id="uniGrid">${u.films.map((f, i) => cardHTML({ id: f.id, type: 'movie', name: f.name, poster: f.poster || undefined, releaseInfo: String(f.year) }, { sub: `${i + 1} · ${f.year}` })).join('')}</div>`;
      $$('[data-usw]', box).forEach((b) => b.addEventListener('click', () => { this.cur = b.dataset.usw; this.render(); scrollTo({ top: 0 }); }));
      $('[data-uback]', box).onclick = () => { this.cur = null; this.render(); scrollTo({ top: 0 }); };
    }
    icons(); if (typeof queueWall === 'function') queueWall();
    if (IS_TV) Nav.settle();
  },
  init() {
    const cal = $('#view-network') || $('#view-calendar');
    if (cal && !$('#view-universe')) cal.insertAdjacentHTML('afterend', '<section class="view" id="view-universe" aria-label="Universe"><div id="uniBody"></div></section>');
    const g0 = go; go = function (view) { const r = g0.apply(this, arguments); if (view === 'universe') Universes.render(); return r; };
    const pl = Networks.place.bind(Networks); Networks.place = function () { const r = pl.apply(this, arguments); Universes.place(); return r; };
    COMMANDS.push({ label: 'Browse film universes', icon: 'clapperboard', run: () => this.open(null) });
    if (S.view === 'home') this.place();
    if (S.view === 'universe') this.render();
  },
};
Universes.init();

const RateBadges = {
  cache: new Map(),
  NAME: { tmdb: 'TMDB', tomatoes: 'Rotten Tomatoes', metacritic: 'Metacritic', trakt: 'Trakt', letterboxd: 'Letterboxd' },
  ORDER: ['tmdb', 'tomatoes', 'metacritic', 'trakt', 'letterboxd'],
  on() { return CFG.moreRatings !== false; },
  get(m) {
    const id = imdbOf(m); if (!id || !this.on()) return Promise.resolve({});
    const k = `${id}:${m.type || ''}`;
    if (!this.cache.has(k)) this.cache.set(k, this.load(m, id).catch(() => { this.cache.delete(k); return {}; }));
    return this.cache.get(k);
  },
  async load(m, id) {
    const keys = Keys.get(), out = {}, show = m.type === 'series';
    const pct = (v) => { const n = Number(v); return n > 0 ? Math.round(n <= 10 ? n * 10 : n) : null; };
    let failed = 0; const json = async (u, o) => { try { const r = await netFetch(u, o, 8000); if (r.status >= 500 || r.status === 429) throw new Error(`HTTP ${r.status}`); return r.ok ? r.json() : null; } catch (e) { failed++; throw e; } };
    if (keys.mdblist) {
      try {
        const j = await json(`https://api.mdblist.com/imdb/${show ? 'show' : 'movie'}/${id}?apikey=${encodeURIComponent(keys.mdblist)}`);
        (j && j.ratings || []).forEach((r) => {
          const src = String(r.source || '').toLowerCase(), v = r.value != null ? r.value : r.score;
          if (v == null || Number(v) <= 0) return;
          if (src === 'tmdb') out.tmdb = pct(r.score || v);
          else if (src === 'tomatoes') out.tomatoes = `${Math.round(Number(v))}%`;
          else if (src === 'popcorn') out.audience = `${Math.round(Number(v))}%`;
          else if (src === 'metacritic') out.metacritic = String(Math.round(Number(v)));
          else if (src === 'trakt') out.trakt = `${pct(r.score || v)}%`;
          else if (src === 'letterboxd') out.letterboxd = Number(v).toFixed(1);
        });
      } catch (e) { /* other keys may still help */ }
    }
    const jobs = [];
    if (keys.omdb && (!out.tomatoes || !out.metacritic)) jobs.push(json(`https://www.omdbapi.com/?i=${id}&apikey=${encodeURIComponent(keys.omdb)}`).then((j) => {
      const r = j && j.Response === 'True' ? j.Ratings || [] : [];
      const rt = r.find((x) => x.Source === 'Rotten Tomatoes'), mc = r.find((x) => x.Source === 'Metacritic');
      if (rt && !out.tomatoes) out.tomatoes = rt.Value; if (mc && !out.metacritic) out.metacritic = mc.Value.split('/')[0];
    }).catch(() => {}));
    if (TMDB.key() && !out.tmdb) jobs.push(TMDB.find(id).then((j) => {
      const x = j && ((show ? j.tv_results : j.movie_results) || [])[0]; if (x && x.vote_count > 0) out.tmdb = pct(x.vote_average);
    }).catch(() => { failed++; }));
    try { const t = Trakt.cfg(); if (t.clientId && !out.trakt) jobs.push(json(`https://api.trakt.tv/${show ? 'shows' : 'movies'}/${id}/ratings`, { headers: { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': t.clientId } }).then((j) => { if (j && j.votes > 0) out.trakt = `${pct(j.rating)}%`; }).catch(() => {})); } catch (e) { /* no Trakt */ }
    await Promise.all(jobs);
    if (failed && !Object.keys(out).length) throw new Error('Scores did not load'); // look again next time
    return out;
  },
  html(o) {
    const parts = this.ORDER.filter((k) => o[k]).map((k) => `<span class="rbadge" data-s="${k}" title="${this.NAME[k]}"><img src="rate/${k}.svg" alt="${this.NAME[k]}">${esc(String(o[k]))}</span>`);
    return parts.length ? `<span class="rbadges">${parts.join('')}</span>` : '';
  },
  put(line, o) {
    if (!line || $('.rbadges', line)) return; const h = this.html(o); if (!h) return;
    const im = $('.imdb', line); if (im) im.insertAdjacentHTML('afterend', h); else line.insertAdjacentHTML('afterbegin', h);
  },
  init() {
    // Home banner
    const sh = showHero; showHero = function () {
      const r = sh.apply(this, arguments); const m = S.hero[S.heroIdx], idx = S.heroIdx;
      if (m) RateBadges.get(m).then((o) => { if (S.hero[S.heroIdx] === m && S.heroIdx === idx) RateBadges.put($('#heroMeta'), o); });
      return r;
    };
    // title pages (this replaces the old OMDb-only critic chips)
    Ratings.critics = function (m) {
      return RateBadges.get(m).then((o) => {
        const line = $('#detailPanel .metaline'); if (!line || D.meta !== m && (!D.meta || D.meta.id !== m.id)) return;
        RateBadges.put(line, o);
      });
    };
    const ap = secById('appearance');
    if (ap) {
      const rows = ap.rows;
      ap.rows = () => {
        const r = typeof rows === 'function' ? rows() : rows;
        const i = r.findIndex((d) => d && d.group === 'Posters');
        const add = [{ group: 'Scores' },
          { key: 'moreRatings', label: 'Scores from other sites', help: 'IMDb shows on every title, and Rotten Tomatoes on many films. A free MDBList key adds Rotten Tomatoes for series and the audience score, plus TMDB, Metacritic, Trakt and Letterboxd. An OMDb, TMDB or Trakt key adds the ones it covers.', type: 'toggle', get: () => CFG.moreRatings !== false, set: (v) => setCfg('moreRatings', v) },
          { key: 'rateMdbKey', label: 'MDBList API key', help: 'Free at mdblist.com/preferences. The same key reads MDBList rows in Settings › Home. Syncs with your other keys.', type: 'secret', get: () => Keys.get().mdblist || '', set: (v) => setMdbKey(v) }];
        return i < 0 ? [...r, ...add] : [...r.slice(0, i), ...add, ...r.slice(i)];
      };
    }
  },
};
RateBadges.init();
/* 2.97.5 rt scores */
// Rotten Tomatoes for everyone: the critic score (Tomatometer) for films comes from Wikidata, free and with no key
// (CC0 data, CORS open). An MDBList key still wins (fresher, and it also covers series), and now adds the audience score.
{
  RateBadges.NAME.audience = 'Rotten Tomatoes audience score';
  RateBadges.ORDER.splice(RateBadges.ORDER.indexOf('tomatoes') + 1, 0, 'audience');
  const WD = {
    K: 'mkc:rtwd1', mem: null, busy: new Map(),
    all() { if (!this.mem) { try { this.mem = JSON.parse(localStorage.getItem(this.K) || '{}') || {}; } catch (e) { this.mem = {}; } } return this.mem; },
    keep(id, v) {
      const a = this.all(); a[id] = { v, t: Date.now() };
      const ks = Object.keys(a); if (ks.length > 800) ks.sort((x, y) => a[x].t - a[y].t).slice(0, ks.length - 600).forEach((x) => delete a[x]);
      try { localStorage.setItem(this.K, JSON.stringify(a)); } catch (e) { /* full or private: memory only */ }
    },
    get(id) {
      const h = this.all()[id];
      if (h && Date.now() - h.t < (h.v ? 3 : 1) * 864e5) return Promise.resolve(h.v); // a score for 3 days, "none yet" for 1
      if (this.busy.has(id)) return this.busy.get(id);
      const q = `SELECT ?s ?d WHERE { ?f wdt:P345 "${id}" . ?f p:P444 ?x . ?x ps:P444 ?s . ?x pq:P447 wd:Q105584 . ?x pq:P459 wd:Q108403393 . OPTIONAL { ?x pq:P585 ?d } }`; // Tomatometer by Rotten Tomatoes
      const p = netFetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, {}, 8000).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }).then((j) => {
        const best = ((j && j.results && j.results.bindings) || [])
          .map((b) => ({ s: String((b.s && b.s.value) || '').trim(), d: String((b.d && b.d.value) || '') }))
          .filter((b) => /^\d{1,3}%$/.test(b.s) && parseInt(b.s, 10) <= 100)
          .sort((a, b) => b.d.localeCompare(a.d))[0]; // newest count
        const v = best ? best.s : ''; this.keep(id, v); return v;
      }).finally(() => this.busy.delete(id));
      this.busy.set(id, p); return p;
    },
  };
  const load = RateBadges.load;
  RateBadges.load = async function (m, id) {
    let out = null, err = null;
    try { out = await load.call(this, m, id); } catch (e) { err = e; }
    if (m.type !== 'series' && /^tt\d+$/.test(id) && !(out && out.tomatoes)) {
      try { const v = await WD.get(id); if (v) { out = out || {}; out.tomatoes = v; } } catch (e) { if (!out) throw err || e; }
    }
    if (!out) { if (err) throw err; out = {}; }
    return out;
  };
}
