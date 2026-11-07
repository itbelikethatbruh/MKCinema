#!/usr/bin/env node
/* Smoke test for the web app: serves a folder, opens index.html and remote.html in headless Chromium on a desktop and a
   phone viewport, and fails if any page throws an uncaught error or Home never draws.

     node tools/smoke-web.mjs <folder>          (needs the playwright package and its Chromium)

   Run it on app/ and on a minified copy (tools/minify-web.mjs), so a bug that only exists in the minified build shows up. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(process.argv[2] || 'app');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wasm': 'application/wasm',
  '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(root, url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1' } } : {});
const failures = [];
const views = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
];
for (const v of views) {
  for (const page of ['index.html', 'remote.html']) {
    const ctx = await browser.newContext({ ...v, serviceWorkers: 'block', ignoreHTTPSErrors: !!proxy });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`${base}/${page}`, { waitUntil: 'load', timeout: 30000 });
    await p.waitForTimeout(page === 'index.html' ? 8000 : 2000);
    let drawn = true;
    if (page === 'index.html') drawn = await p.evaluate(() => document.querySelectorAll('button, a').length > 20 && document.body.innerText.trim().length > 50);
    const label = `${page} (${v.name})`;
    if (errors.length) failures.push(`${label}: ${errors.length} uncaught error(s):\n  ${errors.slice(0, 5).join('\n  ')}`);
    else if (!drawn) failures.push(`${label}: the page did not draw`);
    else console.log(`ok  ${label}`);
    await ctx.close();
  }
}
await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
