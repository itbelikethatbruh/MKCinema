
/* 2.49.2 phone fixes (see the style above). Also: no "What do you watch most?" question any more. Home's order
   (Settings › Home › Movies or series) stays where it was, but nobody is asked it on the way in. */
(function () {
  'use strict';
  const safe = (n, f) => { try { f(); } catch (e) { try { MKLog.add('error', `phonefix ${n}: ${e.message}`); } catch (_) { /* no log */ } console.warn('phonefix', n, e); } };

  /* ---- no first-run "What do you watch most?" (the card on Home and the row in the walkthrough) ---- */
  safe('focus', () => {
    if (!Store.get('askedFocus', false)) Store.set('askedFocus', true);
    if (typeof Layout !== 'undefined') Layout.ask = function () { /* not asked any more */ };
    const t = document.querySelector('.focus-ask'); if (t) t.remove();
  });

  /* ---- the search field: the icon, the text, Clear and the mic in one rounded field ---- */
  safe('search', () => {
    if (typeof IS_TV !== 'undefined' && IS_TV) return;
    const row = document.querySelector('#palette .pal-in'), inp = document.getElementById('palInput');
    if (!row || !inp || row.querySelector('.pal-field')) return;
    const f = document.createElement('label'); f.className = 'pal-field';
    const ic = row.querySelector(':scope > [data-lucide="search"], :scope > svg.lucide-search');
    row.insertBefore(f, ic || inp);
    [ic, inp, document.getElementById('palClear'), document.getElementById('palMic')].forEach((el) => { if (el && el.parentNode === row) f.appendChild(el); });
  });

  /* ---- the featured text slot ---- */
  safe('hero', () => {
    const p = document.getElementById('heroDesc');
    if (!p || p.parentElement.classList.contains('hero-desc-slot')) return;
    const s = document.createElement('div'); s.className = 'hero-desc-slot';
    p.parentNode.insertBefore(s, p); s.appendChild(p);
  });

  /* ---- Movies and Series hubs ----
     Before: the Movies tab opened one plain grid of the same popular titles Home leads with, so it looked like Home
     had just reloaded. Now it opens rows to browse (the other movie catalogs, then the main catalog by genre), with
     the full grid underneath. Picking a genre chip shows that genre's grid straight away. */
  const Hub = {
    key: '', io: null,
    GENRES: {
      movie: ['Action', 'Comedy', 'Thriller', 'Drama', 'Horror', 'Sci-Fi', 'Animation', 'Romance', 'Crime', 'Adventure', 'Family', 'Fantasy', 'Mystery', 'Documentary'],
      series: ['Drama', 'Comedy', 'Crime', 'Sci-Fi', 'Animation', 'Thriller', 'Mystery', 'Fantasy', 'Action', 'Reality-TV', 'Documentary', 'Family'],
    },
    MAX_GENRES: 8, MAX_CATS: 3,
    dom() {
      const view = document.getElementById('view-discover'), bar = view && view.querySelector('.toolbar'), grid = document.getElementById('discGrid');
      if (!view || !bar || !grid) return null;
      let rows = document.getElementById('mvhRows'), all = view.querySelector('.mvh-all');
      if (!rows) { rows = document.createElement('div'); rows.id = 'mvhRows'; bar.after(rows); }
      if (!all) { all = document.createElement('div'); all.className = 'mvh-all'; grid.before(all); }
      return { view, bar, grid, rows, all };
    },
    pickGenres(cat, type) {
      const have = (cat.genres || []).filter(Boolean), lower = new Map(have.map((g) => [g.toLowerCase(), g]));
      const fav = (this.GENRES[type] || []).map((g) => lower.get(g.toLowerCase())).filter(Boolean);
      const rest = have.filter((g) => !fav.includes(g));
      return fav.concat(rest).slice(0, this.MAX_GENRES);
    },
    fill(sec, metas) {
      if (!metas.length) { sec.remove(); return; }
      const ax = typeof AddonUI === 'undefined' ? 'poster' : AddonUI.layout(sec._cat, metas);
      if (ax !== 'poster') sec.classList.add(`ax-${ax}`);
      fillRail(sec, metas.slice(0, 30).map((m, k) => (ax === 'poster' ? cardHTML(m) : AddonUI.card(m, ax, k))).join(''));
    },
    load(sec) {
      if (sec._busy || sec._done) return; sec._busy = true;
      const key = this.key;
      engine.fetchCatalog(sec._cat, sec._genre ? { genre: sec._genre } : {})
        .then((metas) => { if (key === this.key) this.fill(sec, metas || []); })
        .catch(() => { if (key === this.key) sec.remove(); })
        .finally(() => { sec._busy = false; sec._done = true; });
    },
    watch(sec, now) {
      if (now || !('IntersectionObserver' in window)) { this.load(sec); return; }
      if (!this.io) this.io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { this.io.unobserve(e.target); this.load(e.target); } }), { rootMargin: '600px 0px' });
      this.io.observe(sec);
    },
    toGrid() {
      const d = this.dom(); if (!d) return;
      const y = d.bar.getBoundingClientRect().top + scrollY - 90;
      if (scrollY > y + 4) scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    },
    sync(type) {
      const d = this.dom(); if (!d) return;
      const D = S.disc, cats = discoverCatalogs(type), cat = cats[D.cat];
      const word = type === 'series' ? 'series' : 'movies';
      const browsing = !!cat && !D.genre;
      d.rows.hidden = !browsing;
      d.all.hidden = !cat;
      const sub = document.getElementById('discSub');
      if (sub && cat) sub.textContent = `${cats.length} catalog${cats.length === 1 ? '' : 's'} from your addons. Browse the rows, or pick a genre to see all of it.`;
      if (cat) d.all.innerHTML = D.genre ? `<h2>${esc(D.genre)}</h2><small>${esc(cat.name)}</small>` : `<h2>All ${word}</h2><small>${esc(cat.name)} · ${esc(cat.addon.manifest.name)}</small>`;
      if (!browsing) return;
      const key = `${type}|${D.cat}|${cat.addon.manifest.id}/${cat.id}|${cats.length}`;
      if (key === this.key && d.rows.childElementCount) return;
      this.key = key; if (this.io) this.io.disconnect(); d.rows.innerHTML = '';
      const secs = [];
      // the other catalogs of this type first (Top rated, New, a list from another addon)
      cats.filter((c) => c !== cat && !c.genreRequired).slice(0, this.MAX_CATS).forEach((c) => {
        const sec = rowShell(c.name, c.addon.manifest.name, { more: () => openCatalog(c) });
        sec._cat = c; sec._genre = ''; secs.push(sec);
      });
      // then the main catalog, genre by genre, when it can filter by genre
      if (!cat.genreRequired) this.pickGenres(cat, type).forEach((g) => {
        const sec = rowShell(g, '', { more: () => { D.genre = g; renderDiscover(type); this.toGrid(); } });
        sec._cat = cat; sec._genre = g; secs.push(sec);
      });
      secs.forEach((sec, i) => { sec.classList.add('mvh-row'); d.rows.appendChild(sec); this.watch(sec, i < 3); });
      icons();
    },
  };
  window.MKHub = Hub;
  safe('hub', () => {
    if (typeof renderDiscover !== 'function') return;
    const rd = renderDiscover;
    renderDiscover = function (type) {
      const r = rd.apply(this, arguments);
      safe('hub-sync', () => Hub.sync(type));
      return r;
    };
  });
})();
