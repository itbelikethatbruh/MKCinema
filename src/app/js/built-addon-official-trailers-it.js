
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
