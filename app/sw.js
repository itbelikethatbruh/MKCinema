/* MKCinema service worker.
   The app shell is fetched fresh first (so a redeploy shows up right away) and served from cache when offline.
   Script libraries and fonts from CDNs are cached and refreshed in the background.
   Addons, streams, debrid, accounts and everything else always go straight to the network and are never stored. */
const VERSION = 'mkc-2.7.18';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith((async () => {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
        const fresh = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
        if (fresh.ok) { const c = await caches.open(VERSION); c.put('index.html', fresh.clone()); }
        return fresh;
      } catch (err) {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }
  if (url.origin === location.origin && SHELL.some((s) => url.pathname.endsWith(`/${s}`))) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }
  if (CDN.test(req.url)) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION), hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })());
  }
  // everything else: untouched network request
});
