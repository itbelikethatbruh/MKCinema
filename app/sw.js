/* MKCinema service worker.
   The app page (index.html) and the phone remote (remote.html) open straight from the cache, so a launch downloads nothing.
   Behind that, the worker reads version.json (about 100 bytes, never cached). Only when it names a different web version
   does it fetch the page again, store it and tell the open app, which then shows its "Refresh" bar. A host without
   version.json (mkcinema-server) keeps the old way: the page is fetched fresh first and the cache is the offline copy.
   On the first visit the worker keeps the copy the browser just downloaded instead of fetching the page again.
   CDN libraries with an exact version in the URL, and font files, are kept for good. Font stylesheets, interface
   languages and the app's own artwork and data files are served from the cache and refreshed in the background.
   Addons, streams, debrid, accounts and everything else always go straight to the network and are never stored. */
const VERSION = 'mkc-2.57.1';
const PINNED = /^https:\/\/(?:(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\/\S*?(?:@|\/)\d+\.\d+\.\d+(?:\/|$)|fonts\.gstatic\.com\/)/;
const REFRESHED = /^https:\/\/fonts\.googleapis\.com\//;
const LOCAL = /\/(?:addons\/directory\.json|i18n\/[a-z]{2}\.json|kids\/ages\.json|universes(?:-home)?\.json|(?:net|rate|anime)\/[\w-]+\.(?:svg|webp|png)|manifest\.webmanifest|remote\.webmanifest|icon-[\w-]+\.png|apple-touch-icon\.png)$/;
const META = '__mkc-shell/'; // META + page -> { v, at }: the web version of the stored page
const pending = {}; // page -> the refresh under way
let lastCheck = 0, latestP = null, noVersion = false;

// only the app's own addresses are the app shell; privacy, status, logs and any file opened directly go to the network
const pageFor = (path) => (/\/remote(\.html)?$/.test(path) ? 'remote.html' : /\/(index\.html)?$/.test(path) ? 'index.html' : '');
const pageUrl = (page) => (page === 'remote.html' ? 'remote' : './');
const verOf = (page, text) => { const m = page === 'index.html' && /APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/.exec(text); return m ? m[1] : ''; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* The newest web version, from version.json; '' when it cannot be read. Shared by checks that run at the same time. */
function latest() {
  if (latestP) return latestP;
  latestP = (async () => {
    try {
      const r = await fetch('version.json', { cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
      if (!r.ok || !/json/i.test(r.headers.get('content-type') || '')) { noVersion = true; return ''; }
      const j = await r.json(); noVersion = false; return typeof j.web === 'string' ? j.web : '';
    } catch (e) { return ''; }
  })();
  latestP.finally(() => setTimeout(() => { latestP = null; }, 1000));
  return latestP;
}
async function readMeta(c, page) { try { const r = await c.match(META + page); return r ? await r.json() : null; } catch (e) { return null; } }
/* Store a page without its "redirected" mark (a navigation cannot use a redirected response) and note its version */
async function keep(c, page, res, v) {
  const body = await res.text();
  const ver = verOf(page, body) || v || '';
  const headers = new Headers(res.headers); headers.delete('content-encoding'); headers.delete('content-length');
  await c.put(page, new Response(body, { status: 200, headers }));
  await c.put(META + page, new Response(JSON.stringify({ v: ver, at: Date.now(), nov: noVersion }), { headers: { 'content-type': 'application/json' } }));
  return ver;
}
/* Background check: fetch the page again only when version.json names another version than the stored copy */
function check(page, force) {
  if (pending[page]) return pending[page];
  if (!force && Date.now() - lastCheck < 5e3) return Promise.resolve(false);
  lastCheck = Date.now();
  const p = pending[page] = (async () => {
    const c = await caches.open(VERSION);
    const v = await latest(), meta = await readMeta(c, page);
    if (!v && !noVersion) return false; // offline: keep what we have
    if (v && meta && meta.v === v) return false;
    const res = await fetch(pageUrl(page), { cache: 'no-cache' });
    if (!res.ok) return false;
    const ver = await keep(c, page, res, v);
    if (meta && meta.v !== ver) {
      const all = await self.clients.matchAll({ type: 'window' });
      all.forEach((w) => w.postMessage({ type: 'mkc:update', page, web: ver }));
    }
    return true;
  })().catch(() => false).finally(() => { delete pending[page]; });
  return p;
}
/* Navigation: the stored page right away (waiting briefly for a refresh already under way), else the network */
async function serve(page, e) {
  const c = await caches.open(VERSION);
  if (pending[page]) await Promise.race([pending[page], wait(5000)]);
  const meta = await readMeta(c, page), hit = noVersion || (meta && meta.nov) ? null : await c.match(page);
  if (hit) { e.waitUntil(check(page)); return hit; }
  try {
    const fresh = await fetch(e.request, AbortSignal.timeout && (noVersion || (meta && meta.nov)) ? { signal: AbortSignal.timeout(6000) } : {});
    if (fresh.ok && !fresh.redirected) {
      const copy = fresh.clone();
      e.waitUntil(latest().then((v) => keep(c, page, copy, v)).catch(() => {}));
    }
    return fresh;
  } catch (err) {
    return (await c.match(page)) || Response.error();
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // Keep the copy of each open page the browser has just downloaded (its HTTP cache), so the first visit fetches it
    // once. A copy that is not the current version (or not recent, when the page names no version) is fetched again.
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const pages = new Map();
    open.forEach((w) => { const u = new URL(w.url); const page = u.origin === location.origin && pageFor(u.pathname); if (page && !pages.has(page)) pages.set(page, u.href.split('#')[0]); });
    const v = pages.size ? await latest() : '';
    await Promise.allSettled([...pages].map(async ([page, href]) => {
      let res = await fetch(href, { cache: 'force-cache' });
      if (!res.ok) return;
      const text = await res.clone().text(), ver = verOf(page, text);
      const age = Date.now() - (Date.parse(res.headers.get('date') || '') || 0);
      if (v && (ver ? ver !== v : age > 10 * 60e3)) { res = await fetch(pageUrl(page), { cache: 'no-cache' }); if (!res.ok) return; }
      await keep(c, page, res, v);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
/* The app asks for a check when it learns of a new version (and before Refresh), so the reload gets the new page */
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'mkc:check') return;
  const port = e.ports && e.ports[0];
  e.waitUntil(check(d.page === 'remote.html' ? 'remote.html' : 'index.html', true).then((changed) => { if (port) port.postMessage({ ok: true, changed }); }));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) {
    const page = pageFor(url.pathname);
    if (page) e.respondWith(serve(page, e));
    return;
  }
  // exact-version CDN files and font files never change: the stored copy is used without asking again
  if (PINNED.test(req.url)) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION), hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone()).catch(() => {});
      return r;
    })());
    return;
  }
  // font stylesheets, interface languages and the app's own artwork and data: the stored copy now, refreshed behind it
  if (REFRESHED.test(req.url) || (url.origin === location.origin && !url.search && LOCAL.test(url.pathname))) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION), hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()).catch(() => {}); return r; });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net;
    })());
  }
  // everything else: untouched network request
});
