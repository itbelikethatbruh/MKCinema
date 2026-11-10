
/* ---------------- One title on the banner ----------------
   Much of the art catalogs send has the title printed on it, so the Home banner and title pages showed the name twice:
   once in the picture and once in our logo. For any title with an IMDb id we now ask TMDB for its backdrops. TMDB tags
   art that has words on it with a language and leaves textless art untagged, so the best untagged backdrop replaces the
   catalog's picture. When a title only has art with its name on it, that art is shown and our logo steps aside.
   A viewer with their own TMDB key asks TMDB directly; everyone else asks MKCinema's tmdb-person function (lookup `art`).
   Answers are kept on this device for a week, so the banner already knows its art on the next visit. A late answer only
   changes a picture that is not on screen yet (under the start-up cover, or a title page picture still loading), so
   nothing swaps in front of you. */
const ArtFix = {
  FN: 'tmdb-person',
  IMG: 'https://image.tmdb.org/t/p/w1280',
  TTL: 7 * 86400e3,
  mem: null, wait: new Map(), offUntil: 0,
  tt(m) { const id = String((m && (m.imdb_id || m.id)) || '').split(':')[0]; return /^tt\d{5,10}$/.test(id) ? id : null; },
  store() {
    if (!this.mem) {
      const raw = Store.raw.get('artCache', {}), now = Date.now(); this.mem = new Map();
      Object.entries(raw && typeof raw === 'object' ? raw : {}).forEach(([k, v]) => { if (Array.isArray(v) && now - v[2] < this.TTL) this.mem.set(k, v); });
    }
    return this.mem;
  },
  save() {
    const m = this.store(); while (m.size > 300) m.delete(m.keys().next().value);
    clearTimeout(this.saveT); this.saveT = setTimeout(() => Store.raw.set('artCache', Object.fromEntries(m)), 800);
  },
  // [textless path, titled path, time] or undefined
  peek(m) { const tt = this.tt(m); return tt ? this.store().get(tt) : undefined; },
  pick(hit, im) {
    const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0), score = (x) => n(x.vote_average) * 100 + Math.min(n(x.vote_count), 99);
    const bds = ((im && im.backdrops) || []).filter((x) => x && x.file_path && n(x.width) >= 1280);
    const clean = bds.filter((x) => !x.iso_639_1).sort((x, y) => score(y) - score(x));
    const bg = clean.find((x) => x.file_path === hit.backdrop_path) || clean[0];
    const titled = bg ? null : bds.filter((x) => x.iso_639_1 === 'en').sort((x, y) => score(y) - score(x))[0];
    return { bg: (bg && bg.file_path) || '', titled: (titled && titled.file_path) || '' };
  },
  async ask(tt) {
    if (TMDB.key()) {
      const f = await TMDB.find(tt); if (!f) return { bg: '', titled: '' };
      const mv = (f.movie_results || [])[0], tv = (f.tv_results || [])[0], hit = mv || tv; if (!hit) return { bg: '', titled: '' };
      return this.pick(hit, await TMDB.images(mv ? 'movie' : 'tv', hit.id));
    }
    if (Date.now() < this.offUntil) return null;
    const c = (typeof Account !== 'undefined' && Account.config && Account.config()) || {}; if (!c.url) return null;
    const r = await netFetch(`${String(c.url).replace(/\/+$/, '')}/functions/v1/${this.FN}?a=art&tt=${tt}`, { headers: { apikey: c.anonKey || '', accept: 'application/json' } }, 10000);
    // not set up yet, or busy: stay quiet for a while and keep the catalog's art
    if (r.status === 503 || r.status === 429 || r.status === 400) { this.offUntil = Date.now() + 10 * 60e3; return null; }
    if (!r.ok) return null;
    const j = await r.json(); return { bg: String(j.bg || ''), titled: String(j.titled || '') };
  },
  get(m) {
    const tt = this.tt(m); if (!tt) return Promise.resolve(undefined);
    const have = this.store().get(tt); if (have) return Promise.resolve(have);
    if (!this.wait.has(tt)) {
      this.wait.set(tt, this.ask(tt).then((a) => {
        if (!a) return undefined;
        const v = [a.bg, a.titled, Date.now()]; this.store().set(tt, v); this.save(); return v;
      }).catch(() => undefined).finally(() => this.wait.delete(tt)));
    }
    return this.wait.get(tt);
  },
  // puts the answer on the title itself, so every picture drawn from it (banner, swipe peek, title page) agrees
  apply(m, v) {
    if (!m || !v) return false;
    const path = v[0] || v[1]; if (!path) return false;
    const url = this.IMG + path;
    m.background = url;
    m._artTitled = !v[0];
    return true;
  },
  warm(list) {
    // three at a time, banner order, so the next titles are known long before they show
    const q = (list || []).filter((m) => this.tt(m) && !this.peek(m)); let i = 0;
    // a title that is not on screen takes its answer at once, so the swipe peek and the art fetched ahead agree with it
    const run = () => { const m = q[i++]; if (!m) return; this.get(m).then((v) => { if (S.hero[S.heroIdx] !== m) this.apply(m, v); run(); }, run); };
    run(); run(); run();
  },
  booting: () => document.documentElement.classList.contains('booting'),
  init() {
    const markHero = () => { const w = $('#heroLogoWrap'), m = S.hero[S.heroIdx]; if (w) w.classList.toggle('mk-art-titled', !!(m && m._artTitled)); };
    const sl = setHeroList;
    setHeroList = function (list) { (list || []).forEach((m) => ArtFix.apply(m, ArtFix.peek(m))); ArtFix.warm(list); return sl.apply(this, arguments); };
    const sh = showHero;
    showHero = function (i) {
      const n = S.hero.length, at = n ? ((Number(i) || 0) % n + n) % n : 0, m = S.hero[at];
      if (m) ArtFix.apply(m, ArtFix.peek(m));
      const r = sh.apply(this, arguments);
      markHero();
      if (m && ArtFix.tt(m) && !ArtFix.peek(m)) {
        ArtFix.get(m).then((v) => {
          // a late answer only changes the banner while the start-up cover still hides it; otherwise next time round
          if (!ArtFix.apply(m, v)) return;
          if (S.hero[S.heroIdx] === m && ArtFix.booting()) showHero(S.heroIdx, 1);
        });
      }
      return r;
    };
    // a title page decides once, when it opens, whether it uses the fixed art, so its two renders (quick, then full)
    // always draw the same picture
    let det = { id: null, use: false };
    const markDet = (m) => { const lg = $('#detailPanel .d-hero .logo3d'); if (lg) lg.classList.toggle('mk-art-titled', !!(det.use && m && m._artTitled)); };
    const rd = renderDetail;
    renderDetail = function () {
      const m = D.meta, id = m && m.id, v = ArtFix.peek(m);
      // openDetail clears popId, so a fresh open of the same title decides again
      if (id !== det.id || renderDetail.popId !== id) det = { id, use: !!v };
      if (det.use) ArtFix.apply(m, v);
      const r = rd.apply(this, arguments);
      markDet(m);
      if (m && !det.use && !v && ArtFix.tt(m)) {
        const d0 = det;
        ArtFix.get(m).then((nv) => {
          if (!nv || det !== d0 || d0.use || !D.meta || D.meta.id !== id) return;
          const im = $('#detailPanel .d-hero > img.bg');
          // only while the picture is still loading (hidden), so the page never swaps art in front of you
          if (!im || (im.complete && im.naturalWidth && !im.classList.contains('d-wait'))) return;
          if (!ArtFix.apply(D.meta, nv)) return;
          d0.use = true;
          im.src = D.meta.background; im.dataset.osrc = D.meta.background; delete im.dataset.art; delete im.dataset.artTried;
          markDet(D.meta);
        });
      }
      return r;
    };
  },
};
ArtFix.init();
