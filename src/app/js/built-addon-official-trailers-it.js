
'use strict';
/* =====================================================================
   Built-in addon: Official Trailers. It only returns the trailers listed in a
   title's own metadata. MKCinema ships no demo media, test streams or sample titles.
   ===================================================================== */
const baseIdOf = (id) => {
  const parts = String(id).split(':');
  if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1]) && /^\d+$/.test(parts[parts.length - 2])) return parts.slice(0, -2).join(':');
  return String(id);
};

function trailersAddon(engine) {
  const manifest = {
    id: 'org.mkcinema.trailers', version: '2.0.0', name: 'Official Trailers',
    description: 'Adds the official YouTube trailers listed in a title\'s metadata as a source. Nothing else.',
    resources: [{ name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt'] }],
    types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: [],
  };
  return {
    manifest,
    handlers: {
      stream: async ({ type, id }) => {
        const base = baseIdOf(id), streams = [], seen = new Set();
        try {
          const meta = await engine.fetchMeta(type, base);
          for (const t of (meta && meta.trailerStreams) || []) if (t.ytId && !seen.has(t.ytId)) { seen.add(t.ytId); streams.push({ name: 'Trailer', title: `${t.title || meta.name}\nOfficial trailer · YouTube`, ytId: t.ytId }); }
          for (const t of (meta && meta.trailers) || []) if (t.source && !seen.has(t.source)) { seen.add(t.source); streams.push({ name: 'Trailer', title: `${meta.name} · ${t.type || 'Trailer'}\nOfficial trailer · YouTube`, ytId: t.source }); }
        } catch (e) { /* metadata unavailable: no trailer */ }
        return { streams };
      },
    },
  };
}


/* =====================================================================
   Built-in addon: MKCinema Meta. A stand-in for Cinemeta, from TMDB.
   Cinemeta is run by Stremio. If it ever stops answering, Home rows, search and title pages keep working from TMDB.
   While Cinemeta answers, this addon only fills a title page when every other addon came back empty; its catalogs and
   search are added only while Cinemeta is unreachable. With the viewer's own TMDB key it asks TMDB directly, otherwise
   MKCinema's tmdb-person function (fixed lookups `titles` and `title`, v4). Ids stay IMDb ids, so stream addons work as before.
   ===================================================================== */
const MetaBackup = {
  ID: 'org.mkcinema.meta', IMG: 'https://image.tmdb.org/t/p/', mode: null,
  GENRES: { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics', 10770: 'TV Movie' },
  manifest(full) {
    const cats = [];
    if (full) for (const type of ['movie', 'series']) cats.push(
      { type, id: 'mkc.popular', name: 'Popular', extra: [{ name: 'skip' }] },
      { type, id: 'mkc.top', name: 'Top rated', extra: [{ name: 'skip' }] },
      { type, id: 'mkc.search', name: 'Search', extra: [{ name: 'search', isRequired: true }] });
    return {
      id: this.ID, version: '1.0.0', name: 'MKCinema Meta',
      description: full ? 'Cinemeta is not answering, so films and shows come from TMDB for now.' : 'Fills in a title page from TMDB when no other addon knows it, and takes over if Cinemeta stops answering.',
      resources: full ? ['catalog', 'meta'] : ['meta'], types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: cats,
    };
  },
  /* mounts the addon: full (catalogs + search, first in line) while Cinemeta is unreachable, else title pages only, last in line */
  sync() {
    const full = !!engine.offline; if (this.mode === full) return; this.mode = full;
    const base = `mkc-virtual://${this.ID}`, was = engine.addons.find((a) => a.baseUrl === base);
    engine.addons = engine.addons.filter((a) => a.baseUrl !== base);
    const a = engine.mountVirtual(this.manifest(full), this.handlers(), { builtin: true, position: full ? 0 : undefined });
    if (was) a.enabled = was.enabled;
  },
  lang() { try { return People.lang(); } catch (e) { return 'en-US'; } },
  /* data: the viewer's own TMDB key first, then MKCinema's function */
  async relay(a, params) {
    const c = (typeof Account !== 'undefined' && Account.config && Account.config()) || {};
    if (!c.url) return null;
    const q = new URLSearchParams({ a, ...params, lang: this.lang() });
    const r = await netFetch(`${String(c.url).replace(/\/+$/, '')}/functions/v1/tmdb-person?${q}`, { headers: { apikey: c.anonKey || '', accept: 'application/json' } }, 15000);
    if (!r.ok) throw new Error(`TMDB lookup ${r.status}`);
    return r.json();
  },
  find: async (tt) => { const f = await TMDB.find(tt); return f && ((f.movie_results || [])[0] ? ['movie', f.movie_results[0]] : (f.tv_results || [])[0] ? ['tv', f.tv_results[0]] : null); },
  async titles(kind, list, page, q) {
    if (!TMDB.key()) { const j = await this.relay('titles', { kind, list, page: String(page), ...(q ? { q } : {}) }); return (j && j.results) || []; }
    const lang = this.lang();
    const j = list === 'search' ? await TMDB.get(`search/${kind}`, { query: q, include_adult: 'false', language: lang, page }) : await TMDB.get(`${kind}/${list}`, { language: lang, page });
    const rows = ((j && j.results) || []).filter((x) => x && !x.adult).slice(0, 20);
    const ids = await Promise.all(rows.map((x) => TMDB.get(`${kind}/${x.id}/external_ids`).catch(() => null)));
    return rows.map((x, i) => ({ ...x, imdb_id: (ids[i] && ids[i].imdb_id) || '' }));
  },
  async title(tt) {
    if (!TMDB.key()) { const j = await this.relay('title', { tt }); return j && j.title; }
    const lang = this.lang(), hit = await this.find(tt); if (!hit) return null;
    const [k, x] = hit, d = await TMDB.get(`${k}/${x.id}`, { language: lang, append_to_response: 'credits,videos' }); if (!d) return null;
    const eps = [];
    if (k === 'tv') {
      const ns = (d.seasons || []).map((v) => v.season_number).filter((n) => Number.isInteger(n) && n >= 0).slice(0, 60);
      for (let i = 0; i < ns.length; i += 20) {
        const part = ns.slice(i, i + 20), sx = await TMDB.get(`tv/${x.id}`, { language: lang, append_to_response: part.map((n) => `season/${n}`).join(',') });
        part.forEach((n) => { const v = sx && sx[`season/${n}`]; if (v) eps.push(v); });
      }
    }
    return { ...d, kind: k, eps };
  },
  img(p, size) { return p ? `${this.IMG}${size}${p}` : undefined; },
  yr: (v) => String(v || '').slice(0, 4),
  preview(x, type) {
    return { id: x.imdb_id, type, name: x.title || x.name || '', poster: this.img(x.poster_path, 'w342'), background: this.img(x.backdrop_path, 'w1280'),
      releaseInfo: this.yr(x.release_date || x.first_air_date), description: x.overview || '', genres: (x.genre_ids || []).map((g) => this.GENRES[g]).filter(Boolean) };
  },
  toMeta(d, tt, type) {
    const tv = d.kind === 'tv', crew = ((d.credits || {}).crew) || [];
    const ended = /^(Ended|Canceled)$/.test(d.status || '');
    const m = {
      id: tt, type: tv ? 'series' : (type || 'movie'), name: d.title || d.name || '', description: d.overview || '',
      poster: this.img(d.poster_path, 'w500'), background: this.img(d.backdrop_path, 'w1280'),
      releaseInfo: tv ? `${this.yr(d.first_air_date)}–${ended ? this.yr(d.last_air_date) : ''}` : this.yr(d.release_date),
      released: (d.release_date || d.first_air_date) ? new Date(d.release_date || d.first_air_date).toISOString() : undefined,
      runtime: (d.runtime || (d.episode_run_time || [])[0]) ? `${d.runtime || d.episode_run_time[0]} min` : undefined,
      genres: (d.genres || []).map((g) => g && g.name).filter(Boolean),
      cast: (((d.credits || {}).cast) || []).slice(0, 8).map((c) => c.name).filter(Boolean),
      director: crew.filter((c) => c.job === 'Director').map((c) => c.name).slice(0, 3),
      writer: [...(d.created_by || []).map((c) => c.name), ...crew.filter((c) => /^(Screenplay|Writer)$/.test(c.job)).map((c) => c.name)].filter(Boolean).slice(0, 4),
      trailers: (((d.videos || {}).results) || []).filter((v) => v.site === 'YouTube' && /^(Trailer|Teaser)$/.test(v.type) && /^[\w-]{11}$/.test(v.key)).slice(0, 3).map((v) => ({ source: v.key, type: v.type })),
    };
    if (tv) m.videos = (d.eps || []).flatMap((s) => (s.episodes || []).map((e) => ({
      id: `${tt}:${e.season_number != null ? e.season_number : s.season_number}:${e.episode_number}`, season: e.season_number != null ? e.season_number : s.season_number, episode: e.episode_number,
      title: e.name || `Episode ${e.episode_number}`, name: e.name || `Episode ${e.episode_number}`, overview: e.overview || '', thumbnail: this.img(e.still_path, 'w300'),
      released: e.air_date ? new Date(e.air_date).toISOString() : undefined,
    })));
    return m;
  },
  handlers() {
    return {
      catalog: async ({ type, id, extra }) => {
        const kind = type === 'series' ? 'tv' : 'movie', page = 1 + Math.floor((Number(extra.skip) || 0) / 20);
        if (page > 20) return { metas: [] };
        const list = id === 'mkc.search' ? 'search' : id === 'mkc.top' ? 'top_rated' : 'popular';
        if (list === 'search' && !String(extra.search || '').trim()) return { metas: [] };
        const rows = await this.titles(kind, list, page, extra.search);
        return { metas: rows.filter((x) => /^tt\d+$/.test(x.imdb_id || '')).map((x) => this.preview(x, type)) };
      },
      meta: async ({ type, id }) => {
        const tt = String(id).split(':')[0]; if (!/^tt\d+$/.test(tt)) return { meta: null };
        const d = await this.title(tt);
        return { meta: d ? this.toMeta(d, tt, type) : null };
      },
    };
  },
};

/* =====================================================================
   Addon Studio model: manifest + handlers + Node.js code generator
   ===================================================================== */
const STUDIO_DEFAULT = () => ({
  id: 'community.mkcinema.studio-picks', version: '1.0.0', name: 'My Addon', description: 'Built in MKCinema Addon Studio.',
  types: ['movie', 'series'], prefixes: 'studio:', catalogName: 'My Catalog', port: 7001,
  items: [],
  rules: [],
});
const Studio = {
  splitList: (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean),
  parseHeaders(str) { if (!String(str || '').trim()) return null; try { const o = JSON.parse(str); return o && typeof o === 'object' ? o : null; } catch (e) { return undefined; } },
  manifest(p) {
    const prefixes = this.splitList(p.prefixes);
    const types = p.types.length ? p.types : ['movie'];
    const catTypes = types.filter((t) => p.items.some((i) => i.type === t));
    return {
      id: p.id.trim() || 'community.mkcinema.untitled', version: p.version.trim() || '1.0.0', name: p.name.trim() || 'Untitled addon', description: p.description.trim(),
      resources: ['catalog', { name: 'meta', types, idPrefixes: prefixes }, { name: 'stream', types, idPrefixes: prefixes.length ? prefixes : undefined }],
      types, idPrefixes: prefixes,
      catalogs: catTypes.map((t) => ({ type: t, id: `studio-${t}`, name: p.catalogName || p.name, extra: [{ name: 'search' }, { name: 'skip' }] })),
      behaviorHints: { configurable: false, configurationRequired: false },
    };
  },
  metas(p) {
    return p.items.filter((i) => i.id && i.name).map((i) => {
      const m = { id: i.id.trim(), type: i.type, name: i.name.trim(), poster: i.poster.trim() || undefined, genres: this.splitList(i.genres), releaseInfo: i.year, description: i.description };
      if (i.type === 'series') {
        const n = clamp(parseInt(i.episodes || '1', 10) || 1, 1, 50);
        m.videos = Array.from({ length: n }, (_, k) => ({ id: `${m.id}:1:${k + 1}`, season: 1, episode: k + 1, title: `Episode ${k + 1}`, released: new Date(Date.UTC(2026, 0, 1 + k * 7)).toISOString() }));
      }
      return m;
    });
  },
  streams(p, id) {
    return p.rules.filter((r) => r.url && (r.match === '*' || String(id).startsWith(r.match))).map((r) => {
      const headers = this.parseHeaders(r.headers);
      const bh = {};
      if (r.bingeGroup) bh.bingeGroup = r.bingeGroup;
      if (headers) bh.proxyHeaders = { request: headers };
      if (r.notWebReady) bh.notWebReady = true;
      const s = { name: r.name || p.name, title: r.title, url: r.url };
      if (Object.keys(bh).length) s.behaviorHints = bh;
      return s;
    });
  },
  handlers(p) {
    const metas = this.metas(p);
    return {
      catalog: ({ type, extra }) => {
        let list = metas.filter((m) => m.type === type);
        if (extra.search) { const q = extra.search.toLowerCase(); list = list.filter((m) => m.name.toLowerCase().includes(q)); }
        const skip = Number(extra.skip || 0); return { metas: list.slice(skip, skip + 100) };
      },
      meta: ({ type, id }) => ({ meta: metas.find((m) => m.id === id && m.type === type) || null }),
      stream: ({ id }) => ({ streams: this.streams(p, id) }),
    };
  },
  code(p) {
    const man = this.manifest(p), metas = this.metas(p);
    const rules = p.rules.filter((r) => r.url).map((r) => ({ match: r.match || '*', name: r.name, title: r.title, url: r.url, bingeGroup: r.bingeGroup || undefined, proxyHeaders: this.parseHeaders(r.headers) || undefined, notWebReady: r.notWebReady || undefined }));
    const J = (o) => JSON.stringify(o, null, 2);
    return `#!/usr/bin/env node
/**
 * ${String(man.name).replace(/\*\//g, '* /').replace(/[^\S ]+/g, ' ')} v${String(man.version).replace(/\*\//g, '* /').replace(/[^\S ]+/g, ' ')}
 * Generated by MKCinema Addon Studio on ${new Date().toISOString().slice(0, 10)}.
 *
 *   npm install stremio-addon-sdk
 *   node addon.js
 *
 * Then install http://127.0.0.1:${p.port}/manifest.json in MKCinema or Stremio.
 */
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

const PORT = Number(process.env.PORT) || ${Number(p.port) || 7001};

const manifest = ${J(man)};

// Full metadata for every catalog item. Catalog responses send a lighter preview.
const CATALOG = ${J(metas)};

// Stream rules: each rule answers IDs that start with "match" ("*" matches all).
const RULES = ${J(rules)};

const builder = new addonBuilder(manifest);

const toPreview = ({ id, type, name, poster, genres, releaseInfo, description }) =>
  ({ id, type, name, poster, genres, releaseInfo, description });

builder.defineCatalogHandler(async ({ type, id, extra = {} }) => {
  let metas = CATALOG.filter((m) => m.type === type && id === \`studio-\${type}\`);
  if (extra.search) {
    const q = String(extra.search).toLowerCase();
    metas = metas.filter((m) => m.name.toLowerCase().includes(q));
  }
  const skip = Number(extra.skip) || 0;
  return { metas: metas.slice(skip, skip + 100).map(toPreview), cacheMaxAge: 3600 };
});

builder.defineMetaHandler(async ({ type, id }) => {
  const meta = CATALOG.find((m) => m.type === type && m.id === id);
  // Unknown IDs answer { meta: null } so clients fall through to the next addon.
  return { meta: meta || null, cacheMaxAge: meta ? 3600 : 60 };
});

builder.defineStreamHandler(async ({ type, id }) => {
  const streams = RULES
    .filter((r) => r.match === '*' || id.startsWith(r.match))
    .map((r) => {
      const behaviorHints = {};
      if (r.bingeGroup) behaviorHints.bingeGroup = r.bingeGroup;
      if (r.proxyHeaders) behaviorHints.proxyHeaders = { request: r.proxyHeaders };
      if (r.notWebReady) behaviorHints.notWebReady = true;
      return { name: r.name, title: r.title, url: r.url, behaviorHints };
    });
  return { streams, cacheMaxAge: 60 };
});

serveHTTP(builder.getInterface(), { port: PORT });
console.log(\`\${manifest.name} running at http://127.0.0.1:\${PORT}/manifest.json\`);
`;
  },
  highlight(code) {
    const re = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|async|await|return|if|new|require|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b/g;
    let out = '', last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      out += `<span class="${m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : 'n'}">${esc(m[0])}</span>`;
      last = re.lastIndex;
    }
    return out + esc(code.slice(last));
  },
};
