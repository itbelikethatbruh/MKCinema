/* ---------------- 2.8.4 Simple Home (Dee, 2026-11-05: "the ease of use and simple functionality of how Netflix sorts
   their movies ... everything seamless and make sense") ----------------
   - one clear order: Continue watching, My watchlist, Top 10, Networks, Popular, your picks, the themed rows,
     critically acclaimed, then the extras (Shortlist, Peak Cinema) and an unfilled "For you" invitation last
   - plain row names: "Popular films", not "Popular movie · Cinemeta"
   - a film shows once on Home: later rows drop titles an earlier row already showed (each row keeps at least 8) */
const SimpleHome = {
  tw(type) { return type === 'series' ? 'series' : 'films'; },
  name(cat, type, addon) {
    const n = String(cat || '').trim(), tw = this.tw(type);
    if (/^popular$/i.test(n)) return [`Popular ${tw}`, ''];
    if (/^featured$/i.test(n)) return [`Critically acclaimed ${tw}`, ''];
    if (/^new$/i.test(n)) return [`New ${tw}`, ''];
    if (/film|movie|series|show|tv/i.test(n)) return [n, /cinemeta/i.test(addon) ? '' : addon];
    return [`${n} ${tw}`, /cinemeta/i.test(addon) ? '' : addon];
  },
  rank(sec, seriesFirst) {
    const c = sec.dataset.curate, k = sec.dataset.cat || '';
    if (sec.id === 'cwRow') return 0;
    if (sec.id === 'newEpRow') return 0.5;
    if (/^My watchlist/.test((sec.querySelector('.row-title') || {}).textContent || '')) return 1;
    if (c === 'top10') return 2;
    if (sec.id === 'netRow') return 3;
    if (k === 'movie:top') return seriesFirst ? 5 : 4;
    if (k === 'series:top') return seriesFirst ? 4 : 5;
    if (sec.id === 'forYouRow') return sec.querySelector('.fy-cta') ? 40 : 6;
    if (c === 'short') return 7; if (c === 'gems') return 8; if (c === 'awards') return 9;
    if (k && !/:imdbRating$/.test(k)) return 10;
    if (c === 'decade') return 11;
    if (/:imdbRating$/.test(k)) return 12;
    if (c === 'shortlist') return 30;
    if (sec.id === 'pkStrip') return 31;
    return 20;
  },
  order() {
    const rows = $('#homeRows'); if (!rows) return;
    const seriesFirst = /^series/.test((Layout.get() || {}).focus || '');
    const kids = [...rows.children], idx = new Map(kids.map((el, i) => [el, i]));
    const want = kids.slice().sort((a, b) => (this.rank(a, seriesFirst) - this.rank(b, seriesFirst)) || (idx.get(a) - idx.get(b)));
    if (want.every((el, i) => el === kids[i])) return;
    // keep the focused element's place on TV: moving nodes does not drop focus, but remember it just in case
    const a = document.activeElement;
    want.forEach((el) => rows.appendChild(el));
    if (a && a.isConnected && document.activeElement !== a) a.focus({ preventScroll: true });
  },
  dedupe() {
    const seen = new Set();
    $$('#homeRows > section.row').forEach((sec) => {
      if (sec.hidden || sec.id === 'cwRow' || sec.id === 'newEpRow' || sec.id === 'forYouRow' || sec.id === 'netRow') return;
      const cards = $$('.rail > [data-card]', sec), isTop = sec.dataset.curate === 'top10';
      if (!isTop && !/^My watchlist/.test((sec.querySelector('.row-title') || {}).textContent || '')) {
        let left = cards.length;
        cards.forEach((c) => { if (left > 8 && seen.has(c.dataset.id) && c !== document.activeElement && !c.contains(document.activeElement)) { c.remove(); left--; } });
      }
      $$('.rail > [data-card]', sec).forEach((c) => seen.add(c.dataset.id));
    });
  },
  tidyT: 0,
  tidy() {
    clearTimeout(this.tidyT);
    this.tidyT = setTimeout(() => { if (S.view !== 'home') return; this.order(); this.dedupe(); }, 60);
  },
  init() {
    const rs = rowShell;
    rowShell = function (title, sub, opts) {
      const m = typeof sub === 'string' && /^(movie|series) · (.+)$/.exec(sub);
      if (!m) return rs.call(this, title, sub, opts);
      const [t, s] = SimpleHome.name(title, m[1], m[2]);
      const sec = rs.call(this, t, s, opts);
      // the catalog's identity, for ordering: Cinemeta's "top" is Popular, "imdbRating" is Featured
      const cat = (engine.catalogs() || []).find((c) => c.name === title && c.type === m[1] && c.addon && c.addon.manifest && c.addon.manifest.name === m[2]);
      sec.dataset.cat = `${m[1]}:${cat ? cat.id : title}`;
      return sec;
    };
    const rh = renderHome;
    renderHome = function () { const p = rh.apply(this, arguments); SimpleHome.tidy(); Promise.resolve(p).then(() => SimpleHome.tidy()); return p; };
    if (typeof Curate !== 'undefined' && Curate.render) { const cr = Curate.render.bind(Curate); Curate.render = function () { const r = cr.apply(this, arguments); Promise.resolve(r).then(() => SimpleHome.tidy()); return r; }; }
    if (typeof Networks !== 'undefined') { const pl = Networks.place.bind(Networks); Networks.place = function () { const r = pl.apply(this, arguments); SimpleHome.tidy(); return r; }; }
    // the banner says "Featured", without the addon's name
    const sh = showHero;
    showHero = function () { const r = sh.apply(this, arguments); const e = $('#heroEyebrow'); if (e) e.innerHTML = '<i data-lucide="flame"></i>Featured'; icons(); return r; };
  },
};
SimpleHome.init();
if (S.view === 'home') SimpleHome.tidy();
