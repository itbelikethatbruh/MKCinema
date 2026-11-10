
'use strict';
/* ---------------- 2.62 Top 10 you can filter ----------------
   Drake (2026-11-08): the Top 10 should stand out more and offer other Top 10s: where, which category, which network.
   Pressing Series (or Films) should open a home of its own with that Top 10 and the same filters, years should be a
   filter everywhere, and Peak Cinema belongs near the top with a real invitation.
   - Where: Worldwide (Cinemeta's popularity, as before) or a country. A country lists what is popular on the
     streaming services there (the community Streaming Catalogs addon the Networks row already uses).
   - Network: one service in that country (Worldwide uses the viewer's own region).
   - Category and Year: filtered on each title's own genres and release year, with more pages read until ten match.
   Every answer is kept for six hours, so flipping between filters does not ask again. Playing still uses the
   viewer's own addons. */
const Top10 = {
  TTL: 6 * 3600e3, raw: new Map(), cache: new Map(), live: new Map(),
  CINE: { baseUrl: 'https://v3-cinemeta.strem.io', manifest: { id: 'com.linvo.cinemeta', name: 'Cinemeta' } },
  COUNTRIES: [['US', 'United States', 'the US'], ['GB', 'United Kingdom', 'the UK'], ['CA', 'Canada'], ['AU', 'Australia'], ['IE', 'Ireland'], ['NZ', 'New Zealand'],
    ['IN', 'India'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'the Netherlands'], ['SE', 'Sweden'], ['NO', 'Norway'],
    ['DK', 'Denmark'], ['FI', 'Finland'], ['PL', 'Poland'], ['BR', 'Brazil'], ['MX', 'Mexico'], ['AR', 'Argentina'], ['JP', 'Japan'], ['KR', 'South Korea'], ['ZA', 'South Africa']],
  GENRES: {
    movie: ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Sci-Fi', 'Sport', 'Thriller', 'War', 'Western'],
    series: ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Mystery', 'Reality-TV', 'Romance', 'Sci-Fi', 'Talk-Show', 'Thriller', 'War', 'Western'],
  },
  safe(n, f) { try { return f(); } catch (e) { try { MKLog.add('error', `top10 ${n}: ${e.message}`); } catch (_) { /* no log */ } console.warn('top10', n, e); return undefined; } },
  /* ---- years: every year back to 2000, then decades ---- */
  years() {
    const now = new Date().getFullYear(), out = [];
    for (let y = now; y >= 2000; y--) out.push([`y${y}`, String(y)]);
    [1990, 1980, 1970, 1960, 1950].forEach((d) => out.push([`d${d}`, `${d}s`]));
    return out;
  },
  yearOf(m) { const x = parseInt(String((m && (m.releaseInfo || m.year || m.released)) || '').slice(0, 4), 10); return x > 1800 ? x : 0; },
  yearOk(m, y) { if (!y) return true; const v = this.yearOf(m), n = Number(y.slice(1)); if (!v) return false; return y[0] === 'd' ? v >= n && v < n + 10 : v === n; },
  yearWords(y) { if (!y) return ''; const n = y.slice(1); return y[0] === 'd' ? `from the ${n}s` : `of ${n}`; },
  genresOf(m) { const g = (m && (m.genres || m.genre)) || []; return (Array.isArray(g) ? g : String(g).split(',')).map((x) => String(x).trim().toLowerCase()); },
  genreOk(m, g) { return !g || this.genresOf(m).includes(g.toLowerCase()); },
  kidOk(m) { try { return !(typeof Seats !== 'undefined' && Seats.kids() && Seats.kidSafe && !Seats.kidSafe(m)); } catch (e) { return true; } },
  region() { try { return (typeof Networks !== 'undefined' && Networks.country()) || 'US'; } catch (e) { return 'US'; } },
  place(code) { const c = this.COUNTRIES.find((x) => x[0] === code); return c ? (c[2] || c[1]) : code; },
  nets() { return (typeof Networks !== 'undefined' && Networks.LIST) || []; },
  netName(id) { const n = this.nets().find((x) => x[0] === id); return n ? n[1] : id; },
  genreList(type) {
    try {
      const c = engine.catalogs().find((x) => x.type === type && x.id === 'top' && /cinemeta/i.test(`${x.addon.baseUrl} ${x.addon.manifest.name}`));
      if (c && c.genres && c.genres.length) return c.genres.slice();
    } catch (e) { /* the built-in list */ }
    return this.GENRES[type === 'series' ? 'series' : 'movie'].slice();
  },
  cine() { try { return (typeof Curate !== 'undefined' && Curate.cinemeta && Curate.cinemeta()) || this.CINE; } catch (e) { return this.CINE; } },
  streams(region) {
    const B = (typeof Networks !== 'undefined' && Networks.BASE) || 'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club';
    const cfg = btoa(`${this.nets().map((n) => n[0]).join(',')}::${region}:1730000000000:0:0:`);
    return { baseUrl: `${B}/${cfg}`, manifest: { id: 'pw.ers.netflix-catalog', name: 'Streaming Catalogs' } };
  },
  /* one catalog page, kept for six hours */
  async cat(addon, type, id, extra) {
    const ex = {}; Object.entries(extra || {}).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== 0) ex[k] = v; });
    const key = `${addon.baseUrl}|${type}|${id}|${JSON.stringify(ex)}`, hit = this.raw.get(key);
    if (hit && Date.now() - hit.t < this.TTL) return hit.l;
    const r = await engine.call(addon, 'catalog', type, id, ex);
    const l = ((r && r.metas) || []).filter((m) => m && m.id).map((m) => ({ ...m, type: m.type || type, _addon: addon.manifest.name }));
    this.raw.set(key, { t: Date.now(), l });
    if (this.raw.size > 160) this.raw.delete(this.raw.keys().next().value);
    return l;
  },
  // pages until `need` titles pass the filter (or `max` pages were read)
  async pages(page, ok, need, max) {
    const out = [], seen = new Set(); let skip = 0;
    for (let p = 0; p < max; p++) {
      const l = await page(skip); if (!l.length) break; skip += l.length;
      // some catalogs ignore skip and send the same page again: stop when a page brings nothing new
      let fresh = 0;
      l.forEach((m) => { if (seen.has(m.id)) return; seen.add(m.id); fresh++; if (ok(m)) out.push(m); });
      if (!fresh || out.length >= need) break;
    }
    return out;
  },
  async pool(jobs, n) {
    const out = new Array(jobs.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
      while (i < jobs.length) { const k = i++; try { out[k] = await jobs[k](); } catch (e) { out[k] = []; } }
    }));
    return out;
  },
  byPop(l) { const s = new Set(); return l.filter((m) => m && !s.has(m.id) && s.add(m.id)).sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0)); },
  plain(f) { return !f.where && !f.net && !f.genre && !f.year; },
  /* ---- the ten titles for a set of filters ---- */
  list(type, f) {
    const key = JSON.stringify([type, f.where, f.net, f.genre, f.year, typeof Seats !== 'undefined' && Seats.kids && Seats.kids() ? 'k' : '']);
    const hit = this.cache.get(key); if (hit && Date.now() - hit.t < this.TTL) return Promise.resolve(hit.l);
    if (this.live.has(key)) return this.live.get(key);
    const ok = (m) => this.genreOk(m, f.genre) && this.yearOk(m, f.year) && this.kidOk(m);
    const job = (async () => {
      let l = [];
      if (this.plain(f) && typeof Curate !== 'undefined' && Curate.get) {
        const p = await Curate.get().catch(() => null);
        if (p) l = ((type === 'series' ? p.topSeries : p.topMovies) || []).filter(ok);
      }
      if (!l.length && (f.net || f.where)) {
        const a = this.streams(f.where || this.region());
        if (f.net) l = await this.pages((skip) => this.cat(a, type, f.net, { skip }), ok, 10, 4);
        else l = this.byPop((await this.pool(this.nets().map(([id]) => () => this.cat(a, type, id, {})), 4)).flat().filter(ok));
      } else if (!l.length) {
        const a = this.cine(), y = f.year, g = f.genre;
        if (y && y[0] === 'y') l = await this.pages((skip) => this.cat(a, type, 'year', { genre: y.slice(1), skip }), ok, 10, g ? 4 : 1);
        else if (y) { const n = Number(y.slice(1)); l = this.byPop((await this.pool(Array.from({ length: 10 }, (_, i) => () => this.cat(a, type, 'year', { genre: String(n + i) })), 4)).flat().filter(ok)); }
        else l = await this.pages((skip) => this.cat(a, type, 'top', { genre: g, skip }), ok, 10, 2);
      }
      l = l.slice(0, 10);
      this.cache.set(key, { t: Date.now(), l });
      return l;
    })().finally(() => this.live.delete(key));
    this.live.set(key, job);
    return job;
  },
  /* ---- saved filters, per place (home, movie, series) ---- */
  get(scope) {
    const d = { where: '', net: '', genre: '', year: '', type: '' };
    try { return { ...d, ...(Store.get(`t10f:${scope}`, null) || {}) }; } catch (e) { return d; }
  },
  set(scope, f) { try { Store.set(`t10f:${scope}`, f); } catch (e) { /* this visit only */ } },
  homeType() { const f = this.get('home'); if (f.type) return f.type; try { return /^series/.test((Layout.get() || {}).focus || '') ? 'series' : 'movie'; } catch (e) { return 'movie'; } },
  words(type, f) {
    const tw = type === 'series' ? 'series' : 'films';
    const g = f.genre ? `${f.genre} ` : '';
    const where = f.net ? ` on ${this.netName(f.net)} in ${this.place(f.where || this.region())}` : f.where ? ` streaming in ${this.place(f.where)}` : '';
    const y = f.year ? ` ${this.yearWords(f.year)}` : '';
    return `${g}${tw}${y}${where}${this.plain(f) ? ' today' : ''}`.replace(/^./, (c) => c.toUpperCase());
  },
  opt(list, v) { return list.map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join(''); },
  bar(sec, scope, type, withType) {
    const f = this.get(scope);
    let bar = sec.querySelector(':scope > .t10-bar');
    if (!bar) { bar = document.createElement('div'); bar.className = 't10-bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Top 10 filters'); const h = sec.querySelector(':scope > .row-head'); if (h) h.after(bar); else sec.prepend(bar); }
    const seg = withType ? `<div class="segc" role="radiogroup" aria-label="Type">${[['movie', 'Films'], ['series', 'Series']].map(([v, l]) => `<button type="button" data-nav data-t10t="${v}" class="${type === v ? 'on' : ''}" role="radio" aria-checked="${type === v}">${l}</button>`).join('')}</div>` : '';
    const sel = (k, label, list) => `<select class="sel${f[k] ? ' on' : ''}" data-nav data-t10f="${k}" aria-label="${esc(label)}">${this.opt(list, f[k])}</select>`;
    bar.innerHTML = seg
      + sel('where', 'Where', [['', 'Worldwide'], ...this.COUNTRIES.map(([c, n]) => [c, n])])
      + sel('net', 'Network', [['', 'All networks'], ...this.nets().map(([id, n]) => [id, n])])
      + sel('genre', 'Category', [['', 'All categories'], ...this.genreList(type).map((g) => [g, g])])
      + sel('year', 'Year', [['', 'Any year'], ...this.years()])
      + (this.plain(f) ? '' : '<button type="button" class="t10-reset" data-nav data-t10r>Reset</button>');
    bar.querySelectorAll('[data-t10f]').forEach((s) => s.addEventListener('change', () => {
      const n = this.get(scope); n[s.dataset.t10f] = s.value; this.set(scope, n); this.redo(sec, scope, withType);
      if (IS_TV) { const again = bar.querySelector(`[data-t10f="${s.dataset.t10f}"]`); if (again) again.focus({ preventScroll: true }); }
    }));
    bar.querySelectorAll('[data-t10t]').forEach((b) => b.addEventListener('click', () => {
      const n = this.get(scope); n.type = b.dataset.t10t; n.genre = ''; this.set(scope, n); this.redo(sec, scope, withType);
      const again = bar.querySelector(`[data-t10t="${b.dataset.t10t}"]`); if (again && document.activeElement !== again && IS_TV) again.focus({ preventScroll: true });
    }));
    const r = bar.querySelector('[data-t10r]');
    if (r) r.addEventListener('click', () => { const n = this.get(scope); this.set(scope, { where: '', net: '', genre: '', year: '', type: n.type }); this.redo(sec, scope, withType); const s0 = bar.querySelector('select'); if (s0 && IS_TV) s0.focus({ preventScroll: true }); });
  },
  scopeType(scope) { return scope === 'home' ? this.homeType() : scope; },
  head(sec, type, f) {
    const h = sec.querySelector('.row-title'); if (!h) return;
    const tn = [...h.childNodes].find((n) => n.nodeType === 3);
    if (!sec.dataset.arrT || /^Top 10 (films|series) today$/.test(sec.dataset.arrT)) sec.dataset.arrT = 'Top 10';
    let named = ''; try { named = (Arrange.get().names || {})['cur:top10'] || ''; } catch (e) { /* no renames */ }
    const want = (sec.dataset.curate === 'top10' && named) || 'Top 10';
    if (tn) { if (tn.textContent !== `${want} `) tn.textContent = `${want} `; } else h.prepend(document.createTextNode(`${want} `));
    let sm = h.querySelector('small'); if (!sm) { sm = document.createElement('small'); h.appendChild(sm); }
    sm.textContent = this.words(type, f);
  },
  redo(sec, scope, withType) {
    const type = this.scopeType(scope), f = this.get(scope);
    this.bar(sec, scope, type, withType); this.head(sec, type, f);
    return this.fill(sec, type, f);
  },
  async fill(sec, type, f) {
    const tok = sec._t10 = (sec._t10 || 0) + 1, rail = sec.querySelector('.rail'); if (!rail) return;
    sec.classList.add('t10-busy');
    let l = []; try { l = await this.list(type, f); } catch (e) { l = null; }
    if (sec._t10 !== tok || !sec.isConnected) return;
    sec.classList.remove('t10-busy');
    const keep = rail.contains(document.activeElement) ? [...rail.children].indexOf(document.activeElement.closest('.rail > *')) : -1;
    if (!l) rail.innerHTML = '<div class="rail-empty">This Top 10 did not load. Try again in a moment.</div>';
    else if (!l.length) rail.innerHTML = '<div class="rail-empty">Nothing matches these filters yet. Try another year or category.</div>';
    else rail.innerHTML = l.map((m, i) => cardHTML(m).replace('<div class="card"', `<div class="card t10c" data-rank="${i + 1}"`)).join('');
    rail.scrollLeft = 0;
    if (keep >= 0 && rail.children[Math.min(keep, rail.children.length - 1)]) rail.children[Math.min(keep, rail.children.length - 1)].focus({ preventScroll: true });
    icons(); if (typeof queueWall === 'function') queueWall();
    if (sec.closest('#homeRows')) { if (typeof Networks !== 'undefined') Networks.place(); PeakUp.place(); }
  },
  /* ---- Home: the row Curate makes, with the filter bar ---- */
  home(done) {
    const sec = document.querySelector('#homeRows > section[data-curate="top10"]'); if (!sec) { if (done) PeakUp.place(); return; }
    if (typeof Seats !== 'undefined' && Seats.kids && Seats.kids()) return;
    sec.classList.add('t10x');
    const type = this.homeType(), f = this.get('home');
    this.bar(sec, 'home', type, true); this.head(sec, type, f);
    if (!done) return;
    const curType = (() => { try { return /^series/.test((Layout.get() || {}).focus || '') ? 'series' : 'movie'; } catch (e) { return 'movie'; } })();
    if (this.plain(f) && type === curType && sec.querySelector('.t10c')) { PeakUp.place(); return; }
    this.fill(sec, type, f);
  },
  /* ---- Films and Series: a home of their own above the rows ---- */
  hub(type) {
    const view = document.getElementById('view-discover'), bar = view && view.querySelector(':scope > .toolbar'); if (!bar) return;
    let top = document.getElementById('hubTop');
    if (!top) { top = document.createElement('div'); top.id = 'hubTop'; bar.after(top); }
    const D = S.disc, cats = discoverCatalogs(type), browsing = !!cats[D.cat] && !D.genre && !YearF.get(type);
    top.hidden = !browsing; if (!browsing) return;
    if (top.dataset.type === type && top.childElementCount) return;
    top.dataset.type = type; top.innerHTML = '';
    const sec = rowShell('Top 10', ''); sec.classList.add('t10-row', 't10x'); sec.dataset.t10 = type;
    top.appendChild(sec);
    if (!(typeof Seats !== 'undefined' && Seats.kids && Seats.kids())) {
      const net = document.createElement('section'); net.className = 'row net-row';
      net.innerHTML = `<div class="row-head"><h2 class="row-title">Networks</h2></div><div class="rail net-rail">${this.nets().map((n) => Networks.tile(n)).join('')}</div>`;
      net.querySelectorAll('[data-net]').forEach((b, i) => { b.style.setProperty('--i', i); b.addEventListener('click', () => Networks.open(b.dataset.net, type)); });
      top.appendChild(net);
    }
    this.redo(sec, type, false);
  },
};

/* ---------------- Year filters in Films, Series, every catalog and genre, and network pages ---------------- */
const YearF = {
  st: { movie: '', series: '' },
  get(type) { return this.st[type === 'series' ? 'series' : 'movie'] || ''; },
  cine(cat) { return /cinemeta/i.test(`${cat.addon.baseUrl} ${(cat.addon.manifest && cat.addon.manifest.name) || ''}`) && (cat.addon.manifest.catalogs || []).some((c) => c.type === cat.type && c.id === 'year'); },
  select(id, v) { return `<select class="sel${v ? ' on' : ''}" id="${id}" data-nav aria-label="Year">${Top10.opt([['', 'Any year'], ...Top10.years()], v)}</select>`; },
  discBar(type) {
    const bar = document.querySelector('#view-discover > .toolbar'), c = document.getElementById('discCatalog'); if (!bar || !c) return;
    let s = document.getElementById('discYear');
    if (!s) {
      c.insertAdjacentHTML('afterend', this.select('discYear', this.get(type))); s = document.getElementById('discYear');
      s.addEventListener('change', () => { this.st[S.disc.type === 'series' ? 'series' : 'movie'] = s.value; renderDiscover(S.disc.type); });
    } else { s.value = this.get(type); s.classList.toggle('on', !!s.value); }
  },
  card(m, gx) { return gx === 'poster' || typeof AddonUI === 'undefined' ? cardHTML(m) : AddonUI.card(m, gx, 99); },
  /* the Discover grid with a year: Cinemeta's own year list when it has one, else this catalog read page by page */
  async load(cat, fresh, y) {
    const D = S.disc; if (D.loading && !fresh) return; D.loading = true; const token = ++D.token;
    const more = document.getElementById('discMore'); if (more) more.hidden = true;
    try {
      const byYear = this.cine(cat) && y[0] === 'y';
      const page = (skip) => (byYear ? Top10.cat(cat.addon, cat.type, 'year', { genre: y.slice(1), skip }) : engine.fetchCatalog(cat, { genre: D.genre || undefined, skip: skip || undefined }));
      const ok = (m) => Top10.yearOk(m, y) && (!byYear || Top10.genreOk(m, D.genre));
      const grid = document.getElementById('discGrid'); if (fresh) grid.innerHTML = '';
      const seen = new Set([...grid.querySelectorAll('[data-card]')].map((c) => c.dataset.id));
      const canSkip = byYear || cat.extras.some((e) => e.name === 'skip');
      const add = [];
      for (let p = 0; p < 6 && add.length < 24; p++) {
        const l = await page(D.skip || 0); if (token !== D.token) return;
        if (!l.length) { D.done = true; break; }
        D.skip = (D.skip || 0) + l.length;
        l.forEach((m) => { if (ok(m) && !seen.has(m.id)) { seen.add(m.id); add.push(m); } });
        if (!canSkip) { D.done = true; break; }
      }
      const ax = typeof AddonUI === 'undefined' ? 'poster' : AddonUI.layout(cat, add);
      const gx = ax === 'landscape' || ax === 'square' ? ax : 'poster'; if (fresh || !grid.dataset.ax) grid.dataset.ax = gx;
      grid.insertAdjacentHTML('beforeend', add.map((m) => this.card(m, grid.dataset.ax || 'poster')).join(''));
      if (fresh && !grid.querySelector('[data-card]')) grid.innerHTML = `<div class="empty">Nothing ${esc(Top10.yearWords(y))} in this catalog yet. Try another year.</div>`;
      if (more) more.hidden = !!D.done; icons();
    } catch (e) {
      if (token === D.token) document.getElementById('discGrid').insertAdjacentHTML('beforeend', `<div class="empty">Could not load the catalog (${esc(e.message)}).</div>`);
    } finally { if (token === D.token) D.loading = false; }
  },
  hubHead(type) {
    const y = this.get(type), D = S.disc, cat = discoverCatalogs(type)[D.cat];
    const rows = document.getElementById('mvhRows'), all = document.querySelector('#view-discover .mvh-all');
    if (!y || !cat) return;
    if (rows) rows.hidden = true;
    if (all) { all.hidden = false; all.innerHTML = `<h2>${esc(D.genre || (type === 'series' ? 'All series' : 'All movies'))} ${esc(Top10.yearWords(y))}</h2><small>${esc(cat.name)}</small>`; }
  },
  /* network pages */
  net: '',
  netBar() {
    const t = document.querySelector('#netBody .toolbar'); if (!t || document.getElementById('netYear')) return;
    t.insertAdjacentHTML('beforeend', this.select('netYear', this.net));
    document.getElementById('netYear').addEventListener('change', (e) => { this.net = e.target.value; Networks.render(); });
  },
  async netLoad(fresh) {
    const N = Networks; if (N.busy && !fresh) return; N.busy = true; const tok = ++N.token, y = this.net;
    const grid = document.getElementById('netGrid'), more = document.getElementById('netMore'); if (more) more.hidden = true;
    try {
      const a = N.addon(), add = [];
      const seen = new Set(fresh ? [] : [...grid.querySelectorAll('[data-card]')].map((x) => x.dataset.id));
      if (fresh || !N.seenAll) N.seenAll = new Set();
      for (let p = 0; p < 5 && add.length < 20; p++) {
        const l = await Top10.cat(a, N.type, N.cur, { skip: N.skip }); if (tok !== N.token) return;
        N.skip += l.length; let fresh2 = 0;
        l.forEach((m) => { if (N.seenAll.has(m.id)) return; N.seenAll.add(m.id); fresh2++; if (Top10.yearOk(m, y) && !seen.has(m.id)) { seen.add(m.id); add.push({ ...m, _addon: 'Streaming Catalogs' }); } });
        // a page with nothing new (this list sends the same page again) or a short page is the end
        if (!fresh2 || l.length < 20) { N.done = true; break; }
      }
      if (fresh) grid.innerHTML = '';
      grid.insertAdjacentHTML('beforeend', add.map((m) => cardHTML(m)).join(''));
      if (!grid.querySelector('[data-card]')) grid.innerHTML = `<div class="empty">Nothing ${esc(Top10.yearWords(y))} on this service in ${esc(N.country())} right now.</div>`;
      if (more) more.hidden = !!N.done;
      icons(); if (typeof queueWall === 'function') queueWall();
      if (IS_TV && fresh) Nav.settle();
    } catch (e) {
      if (tok === N.token && grid) grid.innerHTML = `<div class="empty-state"><i data-lucide="cloud-off"></i><h3>The list did not load</h3><p>${esc(e.message || 'Network error')}. Try again in a moment.</p></div>`;
      icons();
    } finally { if (tok === N.token) N.busy = false; }
  },
};

/* ---------------- Peak Cinema, right under the Top 10 ----------------
   It sat at the very bottom of Home. Now it is a centred invitation inside the Top 10 block (so the Networks row and
   the other modules that keep rows in order never fight over it), with the Top 10 posters fanned behind it. Without a
   Top 10 row it goes near the top of Home. The wording stays honest: scenes come from the middle of films, picked on
   this device, never "famous scenes". */
const PeakUp = {
  html() {
    return `<div class="pk2-art" aria-hidden="true"></div>
      <span class="pk-mark">Peak Cinema</span>
      <h3>Can’t pick a film? Let the films pitch themselves.</h3>
      <p>Ninety seconds from the middle of one film, then the next, back to back. When one grabs you, keep watching from that exact second.</p>
      <button class="btn btn-bolt pk2-go" id="pkGo" type="button" data-nav><i data-lucide="play"></i><span class="sp-l">Start surfing<small>Scenes, back to back</small></span></button>
      <ul class="pk2-steps"><li><b>Surf</b> a new scene every 90 seconds</li><li><b>Skip</b> anything that isn’t for you</li><li><b>Keep</b> watching the whole film</li></ul>`;
  },
  dress() {
    const pk = document.getElementById('pkStrip'); if (!pk) return null;
    if (!pk.classList.contains('pk2')) {
      pk.classList.add('pk2'); pk.innerHTML = this.html();
      document.getElementById('pkGo').addEventListener('click', () => Peak.open());
      icons();
    }
    return pk;
  },
  art(pk, from) {
    const box = pk.querySelector('.pk2-art'); if (!box) return;
    // the Top 10's own posters (already loaded for the row above)
    const src = [...(from ? from.querySelectorAll('.rail .t10c') : [])].map((c) => { const m = S.metas.get(c.dataset.id); return m && metaPoster(m); }).filter((u) => u && !/^data:/.test(u)).slice(0, 5);
    const key = src.join('|'); if (!src.length || box.dataset.k === key) return;
    box.dataset.k = key;
    box.innerHTML = src.map((s) => `<img src="${esc(s)}" alt="" decoding="async" loading="lazy" draggable="false">`).join('');
  },
  place() {
    Top10.safe('peak', () => {
      const rows = document.getElementById('homeRows'); if (!rows) return;
      if (!document.getElementById('pkStrip') && this.st && S.view === 'home') this.st.call(Peak);
      const pk = this.dress(); if (!pk) return;
      const t = rows.querySelector(':scope > section[data-curate="top10"]');
      if (t && !t.hidden && !t.classList.contains('arr-off')) { if (t.lastElementChild !== pk) t.appendChild(pk); this.art(pk, t); return; }
      if (pk.parentNode !== rows) { const first = rows.querySelector(':scope > section'); if (first) first.after(pk); else rows.prepend(pk); }
    });
  },
};

(() => {
  const safe = (n, f) => Top10.safe(n, f);
  // Home: the Top 10 row gets its filters as soon as it exists, and its own list once Curate has filled it
  safe('home', () => {
    if (typeof Curate === 'undefined' || !Curate.render) return;
    const cr = Curate.render;
    Curate.render = function () {
      // Peak Cinema lives inside the Top 10 block, which Curate replaces: take it out first so it survives
      safe('peak-out', () => { const rows = document.getElementById('homeRows'), pk = document.getElementById('pkStrip'); if (rows && pk && pk.parentNode !== rows) rows.prepend(pk); });
      const r = cr.apply(this, arguments);
      safe('home-bar', () => Top10.home(false));
      Promise.resolve(r).then(() => safe('home-fill', () => Top10.home(true)));
      return r;
    };
  });
  // Peak Cinema follows the Top 10; without one it ranks near the top instead of last
  safe('peak', () => {
    if (typeof Peak === 'undefined' || !Peak.strip) return;
    const st = Peak.strip; PeakUp.st = st;
    Peak.strip = function () { const r = st.apply(this, arguments); PeakUp.place(); return r; };
    if (typeof SimpleHome !== 'undefined' && SimpleHome.rank) {
      const rk = SimpleHome.rank;
      SimpleHome.rank = function (sec) { if (sec && sec.id === 'pkStrip') return 2.5; return rk.apply(this, arguments); };
    }
    PeakUp.place();
  });
  // Films and Series: Top 10, networks, then the rows; a Year menu next to the catalog menu
  safe('disc', () => {
    if (typeof renderDiscover !== 'function') return;
    const rd = renderDiscover;
    renderDiscover = function (type) {
      safe('disc-year', () => YearF.discBar(type));
      const r = rd.apply(this, arguments);
      safe('disc-head', () => YearF.hubHead(type));
      safe('disc-hub', () => Top10.hub(type));
      return r;
    };
    const ld = loadDiscover;
    loadDiscover = function (cat, fresh) {
      const y = YearF.get(S.disc.type);
      if (!y || !cat) return ld.apply(this, arguments);
      return YearF.load(cat, fresh, y);
    };
  });
  // network pages
  safe('net', () => {
    if (typeof Networks === 'undefined') return;
    const rn = Networks.render, ln = Networks.load;
    Networks.render = function () { const r = rn.apply(this, arguments); safe('net-year', () => YearF.netBar()); return r; };
    Networks.load = function (fresh) { if (!YearF.net) return ln.apply(this, arguments); return YearF.netLoad(fresh); };
  });
  if (typeof S !== 'undefined' && S.view === 'home') safe('now', () => Top10.home(true));
})();
