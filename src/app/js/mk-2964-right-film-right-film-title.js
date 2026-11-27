/* 2.96.4 right film: a title always carries its real name, and a movie source from another film never plays */
const RightFilm = {
  KEY: 'nameFix2', TTL: 7 * 864e5, mem: null, wait: new Map(), skipped: 0,
  STOP: new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'la', 'le', 'el', 'les', 'der', 'die', 'das']),
  tt(id) { const i = String(id || '').split(':')[0]; return /^tt\d{5,10}$/.test(i) ? i : null; },
  y4(v) { const m = String(v || '').match(/(18|19|20)\d\d/); return m ? Number(m[0]) : 0; },
  words(n) { return normTitle(n).split(' ').filter((w) => w && !this.STOP.has(w)); },
  // two names for the same IMDb id that share no real word are two different names, not two spellings
  unrelated(a, b) {
    if (normTitle(a).replace(/ /g, '') === normTitle(b).replace(/ /g, '')) return false;   // "10 Dance" = "10DANCE"
    const x = this.words(a), y = new Set(this.words(b));
    return !!x.length && !!y.size && !x.some((w) => y.has(w));
  },
  store() {
    if (!this.mem) {
      const raw = Store.raw.get(this.KEY, {}), now = Date.now(); this.mem = new Map();
      Object.entries(raw && typeof raw === 'object' ? raw : {}).forEach(([k, v]) => { if (v && now - v.at < this.TTL) this.mem.set(k, v); });
    }
    return this.mem;
  },
  save() { const m = this.store(); while (m.size > 600) m.delete(m.keys().next().value); clearTimeout(this.saveT); this.saveT = setTimeout(() => Store.raw.set(this.KEY, Object.fromEntries(m)), 600); },
  // TMDB's English title and year for an IMDb id: the viewer's own TMDB key, else MKCinema's lookup (no key in the app).
  // NONE = TMDB answered and has no such title (kept); null = no answer this time (busy, offline, 429/503: asked again next open)
  NONE: { n: '', o: '', y: 0 },
  async tmdb(tt, type) {
    if (TMDB.key()) {
      const f = await TMDB.find(tt); if (!f) return null;
      const x = type === 'series' ? (f.tv_results || [])[0] : (f.movie_results || [])[0];
      return x ? { n: String(x.title || x.name || ''), o: String(x.original_title || x.original_name || ''), y: this.y4(x.release_date || x.first_air_date) } : this.NONE;
    }
    const c = typeof Account !== 'undefined' && Account.config && Account.config() || {};
    if (!c.url) return null;
    const r = await netFetch(`${String(c.url).replace(/\/+$/, '')}/functions/v1/tmdb-person?a=title&tt=${tt}&lang=en-US`, { headers: { apikey: c.anonKey || '', accept: 'application/json' } }, 8e3);
    if (!r.ok) return null;
    const j = await r.json(), x = j && j.title;
    if (!x || (type === 'series') !== (x.kind === 'tv')) return this.NONE;
    return { n: String(x.title || x.name || ''), o: '', y: this.y4(x.release_date || x.first_air_date) };
  },
  // TMDB's answer per IMDb id, looked up once and kept on the device (7 days): { t: name, o: original, y: year }
  info(tt, type) {
    const hit = this.store().get(tt); if (hit) return Promise.resolve(hit);
    if (this.wait.has(tt)) return this.wait.get(tt);
    const p = this.tmdb(tt, type).then((t) => {
      if (!t) return null;
      const v = { t: t.n || '', o: t.o || '', y: t.y || 0, at: Date.now() };
      this.store().set(tt, v); this.save(); return v;
    }).catch(() => null).finally(() => this.wait.delete(tt));
    this.wait.set(tt, p); return p;
  },
  // { n: right name, old: wrong name } when this meta's name is another film's name, else null
  decide(m, t) {
    if (!m || !m.name || !t || !t.t) return null;
    const my = this.y4(m.releaseInfo || m.year);
    if (normTitle(t.t) === normTitle(m.name) || (t.o && normTitle(t.o) === normTitle(m.name))) return null;
    if (!this.unrelated(m.name, t.t) || (t.o && !this.unrelated(m.name, t.o))) return null;
    if (my && t.y && Math.abs(my - t.y) > 1) return null;
    return { n: t.t, old: m.name };
  },
  lookup(m) {
    const tt = this.tt(m && m.id);
    if (!tt || !m.name || (m.type !== 'movie' && m.type !== 'series')) return Promise.resolve(null);
    return this.info(tt, m.type).then((t) => { const v = this.decide(m, t); if (v) { t.old = v.old; t.n = v.n; this.save(); } return v; });
  },
  // the cached fix only (no network): for catalogs, cards and saved progress
  cached(id) { const v = this.store().get(this.tt(id) || ''); return v && v.n ? v : null; },
  apply(m) {
    if (!m || !m.name) return m;
    const v = this.cached(m.id);
    if (v && normTitle(m.name) === normTitle(v.old)) return { ...m, name: v.n, _oldName: v.old };
    return m;
  },
  fixProgress(id, v) {
    try {
      let n = 0; const P0 = S.progress || {};
      Object.keys(P0).forEach((k) => { const e = P0[k]; if (e && (e.metaId === id || k === id) && e.name && normTitle(e.name) === normTitle(v.old)) { e.name = v.n; n++; } });
      if (n) Store.set('progress', S.progress);
      const sm = S.metas.get(id); if (sm && sm.name && normTitle(sm.name) === normTitle(v.old)) S.metas.set(id, { ...sm, name: v.n, _oldName: v.old });
    } catch { /* never block playback */ }
  },
  // ---- the source guard: a film's release name must not carry another film's year ----
  YEARS: /(?<![0-9])(?:18[89]\d|19\d\d|20[0-4]\d)(?![0-9])/g,
  relName(s) {
    const f = String((s.behaviorHints || {}).filename || '').trim();
    if (f) return f;
    const t = String(s.title || s.description || '').split('\n')[0];
    return t || String(s.name || '').split('\n')[0];
  },
  // true = this source belongs to another film (its name has release years, none of them this film's)
  wrongFilm(s, m) {
    if (!m || m.type !== 'movie' || !s || s.ytId || (s._tel && (s._tel.isTrailer || s._tel.notice)) || s._local) return false;
    const y = this.y4(m.releaseInfo || m.year); if (!y) return false;
    const inName = new Set([m.name, m._oldName, (this.cached(m.id) || {}).old].join(' ').match(this.YEARS) || []);
    const ys = (this.relName(s).replace(/(?:www\.)?[a-z0-9-]+\.(?:com|org|net|me|to|tv|cc|io|ru|info)\b/gi, ' ').match(this.YEARS) || []).filter((x) => !inName.has(x)).map(Number);
    // Cinemeta's year can be a later release year (Spirited Away: 2003 for 2001), so +-2 of it, or +-1 of TMDB's year
    const ty = (this.store().get(this.tt(m.id) || '') || {}).y || 0;
    return ys.length > 0 && !ys.some((x) => Math.abs(x - y) <= 2 || (ty && Math.abs(x - ty) <= 1));
  },
  guard(list, id) {
    const m = S.metas.get(baseIdOf(id)) || (typeof D !== 'undefined' && D.meta && D.meta.id === baseIdOf(id) ? D.meta : null);
    if (!m || m.type !== 'movie') return list;
    const out = list.filter((s) => !this.wrongFilm(s, m));
    if (out.length !== list.length) { this.skipped += list.length - out.length; try { console.info(`[right-film] skipped ${list.length - out.length} source(s) of another film for ${m.id}`); } catch {} }
    return out;
  },
  init() {
    const fm = engine.fetchMeta.bind(engine);
    engine.fetchMeta = async (t, e) => {
      const tt = this.tt(e), ty = t === 'series' ? 'series' : 'movie';
      const early = tt && (t === 'movie' || t === 'series') ? this.info(tt, ty) : null;   // starts beside the meta call
      const m = await fm(t, e);
      if (!early || !m || !m.name) return m;
      const t2 = await Promise.race([early, new Promise((r) => setTimeout(() => r(null), 1500))]);
      const mm = { ...m, id: m.id || e, type: m.type || t };
      const v = t2 && this.decide(mm, t2);
      if (v) { Object.assign(t2, v); this.save(); this.fixProgress(e, v); return { ...m, name: v.n, _oldName: v.old }; }
      if (!t2) early.then((t3) => { const w = this.decide(mm, t3); if (!w) return; Object.assign(t3, w); this.save(); this.fixProgress(e, w);
        try { if (D.meta && D.meta.id === e && normTitle(D.meta.name) === normTitle(w.old)) D.meta = { ...D.meta, name: w.n, _oldName: w.old }; } catch {} });
      return m;
    };
    const fc = engine.fetchCatalog && engine.fetchCatalog.bind(engine);
    if (fc) engine.fetchCatalog = async (...a) => { const r = await fc(...a); return Array.isArray(r) ? r.map((m) => this.apply(m)) : r; };
    const fs = engine.fetchStreams.bind(engine);
    engine.fetchStreams = async (t, e, cb) => {
      const r = await fs(t, e, cb ? (list, info) => cb(t === 'movie' ? this.guard(list, e) : list, info) : cb);
      if (r && Array.isArray(r.streams) && t === 'movie') r.streams = this.guard(r.streams, e);
      return r;
    };
    // saved progress made before this fix keeps the old name until the title is opened; fix the ones already known
    try { Object.values(S.progress || {}).forEach((p) => { const v = p && this.cached(p.metaId); if (v) this.fixProgress(p.metaId, v); }); } catch {}
  },
};
try { RightFilm.init(); } catch (e) { try { console.warn('[right-film]', e && e.message); } catch {} }
