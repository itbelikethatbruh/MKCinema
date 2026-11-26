#!/usr/bin/env node
/* Layout steadiness check for the web app: fails when the page jumps, shifts or changes its scroll position by itself.

     node tools/layout-check.mjs <folder> [--only=seasons,toggle,home] [--devices=phone,tablet,desktop,tv]

   Serves the folder, opens it in headless Chromium as a phone (Pixel 10 Pro size), a tablet, a computer and a Fire TV,
   and drives the places that broke before:
   - seasons: a series page scrolled down, then Season 2, 3 and 1 picked (tap, click or the remote's Enter). The page's
     scroll position and the season row must not move, and no layout shift may happen.
   - toggle:  a film page scrolled down, Watchlist added and removed. The scroll position must stay put and the page
     must not shift after the redraw.
   - home:    Home scrolled half way and left alone for 3 s. Nothing may move by itself.
   Layout shifts come from the browser's own PerformanceObserver ('layout-shift'); shifts within 500 ms of an input are
   the browser's "expected" kind and are ignored, as are toasts (they glide into place with a transform).
   Limits: CLS over 0.01 per step, any scroll change over 2 px, any season-row move over 2 px.
   Needs the network for the catalog (Cinemeta). If a page cannot load its data, that case is reported as SKIP, not as a
   failure, so a catalog outage never blocks a release. Exit code 1 on any FAIL. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const root = path.resolve(args.find((a) => !a.startsWith('--')) || 'app');
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1].split(',') : d; };
const ONLY = opt('only', ['seasons', 'toggle', 'home']);
const DEVS = opt('devices', ['phone', 'tablet', 'desktop', 'tv']);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(root, url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const TV_UA = 'Mozilla/5.0 (Linux; Android 9; AFTGAZL Build/PS7633; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 MKCinema/1.17.14';
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0 Mobile Safari/537.36 MKCinema/1.17.14';
const DEV = {
  phone: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: PHONE_UA, input: 'tap' },
  tablet: { viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36', input: 'tap' },
  desktop: { viewport: { width: 1366, height: 768 }, input: 'click' },
  tv: { viewport: { width: 960, height: 540 }, userAgent: TV_UA, input: 'remote' },
};
const LIMIT = { cls: 0.01, scroll: 2, move: 2 };
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1' } } : {});
const results = [];
const note = (dev, test, status, msg) => { results.push({ dev, test, status, msg }); console.log(`${status.padEnd(4)} ${dev.padEnd(7)} ${test.padEnd(8)} ${msg}`); };

async function start(dev) {
  const { input, ...d } = DEV[dev];
  const ctx = await browser.newContext({ ...d, deviceScaleFactor: 1, serviceWorkers: 'block', ignoreHTTPSErrors: !!proxy });
  await ctx.addInitScript(() => { try { if (sessionStorage.getItem('lc')) return; sessionStorage.setItem('lc', '1');
    for (const [k, v] of Object.entries({ 'mkc:toured': 'true', 'mkc:langAsked': '1', 'mkc:whatsNewOff': '1', 'mkc:playerAsked': '1' })) localStorage.setItem(k, v); } catch (e) { /* storage off */ } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message.slice(0, 160) + (process.env.LC_STACK ? ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' ').slice(0, 300) : '')));
  await p.goto(`${base}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelector('#homeRows section.row, #view-home .rail'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2500);
  // anything that pops up on a first start is closed
  for (let i = 0; i < 3; i++) {
    const did = await p.evaluate(() => { const x = [...document.querySelectorAll('.modal button,[role=dialog] button,.wn-card button')].find((b) => /^(Got it|Not now|Later|Close|Skip|No thanks|Maybe later)$/i.test(b.textContent.trim()) && b.getClientRects().length); if (x) { x.click(); return 1; } return 0; });
    if (!did) break; await p.waitForTimeout(500);
  }
  // shifts with the input flag off, collected from here on (toasts glide with a transform and are left out)
  await p.evaluate(() => { window.__ls = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue;
    const src = (e.sources || []).map((s) => s.node && s.node.nodeType === 1 ? s.node : null).filter(Boolean);
    if (src.length && src.every((n) => n.closest('#toasts'))) continue;
    window.__ls.push({ t: performance.now(), v: e.value, src: src.slice(0, 3).map((n) => (n.id ? `#${n.id}` : `${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')}`)).join(' ') }); } }).observe({ type: 'layout-shift', buffered: false }); });
  return { ctx, p, errs, input };
}
const cls = (p, since) => p.evaluate((s) => { const x = window.__ls.filter((e) => e.t >= s); return { v: x.reduce((a, e) => a + e.v, 0), src: x.map((e) => e.src).filter(Boolean).slice(0, 3).join(' | ') }; }, since);
const now = (p) => p.evaluate(() => performance.now());
async function press(p, input, sel) {
  if (input === 'tap') await p.tap(sel);
  else if (input === 'click') await p.click(sel);
  else { await p.evaluate((s) => { const b = document.querySelector(s); if (typeof Nav === 'object') Nav.focus(b, true); else b.focus(); }, sel); await p.keyboard.press('Enter'); }
}
async function openTitle(p, id, type) {
  await p.evaluate(([id, type]) => openDetail({ id, type, name: 'Test' }), [id, type]);
  const ok = await p.waitForFunction((type) => { const d = document.getElementById('detail'); return d && !d.hidden && (type !== 'series' || document.querySelectorAll('#dSeasons [data-season]').length >= 3) && document.querySelector('#dSmart'); }, type, { timeout: 20000 }).then(() => true, () => false);
  await p.waitForTimeout(2500);
  return ok;
}
// watches one element and the layer's scroll position every frame
const watch = (p, sel) => p.evaluate((sel) => { const sc = document.getElementById('detail'), w = window.__w = { y: [], top: [] }; const t0 = performance.now();
  const f = () => { if (window.__w !== w) return; const e = document.querySelector(sel); w.y.push(sc.scrollTop); if (e) w.top.push(Math.round(e.getBoundingClientRect().top)); if (performance.now() - t0 < 60000) requestAnimationFrame(f); }; requestAnimationFrame(f); }, sel);
const range = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 0);

for (const dev of DEVS) {
  if (!DEV[dev]) continue;
  const { ctx, p, errs, input } = await start(dev);
  try {
    if (ONLY.includes('seasons')) {
      if (!(await openTitle(p, 'tt0903747', 'series'))) note(dev, 'seasons', 'SKIP', 'series page did not load (catalog offline?)');
      else {
        await p.evaluate(() => { const sc = document.getElementById('detail'), c = document.querySelector('#dSeasons'); sc.scrollTop += c.getBoundingClientRect().top - innerHeight * 0.3; });
        await p.waitForTimeout(1200); await watch(p, '#dSeasons');
        let worst = { v: 0, src: '' };
        for (const s of [2, 3, 1]) {
          const t = await now(p); await press(p, input, `#dSeasons [data-season="${s}"]`); await p.waitForTimeout(3000);
          const c = await cls(p, t); if (c.v > worst.v) worst = c;
          const on = await p.evaluate(() => Number((document.querySelector('#dSeasons .chip.on') || { dataset: {} }).dataset.season));
          if (on !== s) { note(dev, 'seasons', 'FAIL', `Season ${s} did not become the chosen season`); break; }
        }
        const w = await p.evaluate(() => { const x = window.__w; window.__w = null; return x; });
        const bad = [worst.v > LIMIT.cls && `layout shift ${worst.v.toFixed(3)} (${worst.src})`, range(w.y) > LIMIT.scroll && `page scrolled by itself ${range(w.y)} px`, range(w.top) > LIMIT.move && `season row moved ${range(w.top)} px`].filter(Boolean);
        note(dev, 'seasons', bad.length ? 'FAIL' : 'PASS', bad.join('; ') || `CLS ${worst.v.toFixed(3)}, scroll steady, season row steady`);
      }
    }
    if (ONLY.includes('toggle')) {
      if (!(await openTitle(p, 'tt0111161', 'movie'))) note(dev, 'toggle', 'SKIP', 'film page did not load (catalog offline?)');
      else {
        await p.evaluate(() => { const sc = document.getElementById('detail'); sc.scrollTop = Math.min(sc.scrollHeight - sc.clientHeight, Math.round(innerHeight * 0.45)); });
        await p.waitForTimeout(1200); await watch(p, '.d-desc');
        let worst = { v: 0, src: '' };
        for (let i = 0; i < 2; i++) {
          const t = await now(p);
          await p.evaluate(() => { const b = document.getElementById('dList'); if (b) b.click(); });
          await p.waitForTimeout(2500); const c = await cls(p, t); if (c.v > worst.v) worst = c;
        }
        const w = await p.evaluate(() => { const x = window.__w; window.__w = null; return x; });
        const bad = [worst.v > LIMIT.cls && `layout shift ${worst.v.toFixed(3)} (${worst.src})`, range(w.y) > LIMIT.scroll && `page scrolled by itself ${range(w.y)} px`, range(w.top) > LIMIT.move && `text moved ${range(w.top)} px`].filter(Boolean);
        note(dev, 'toggle', bad.length ? 'FAIL' : 'PASS', bad.join('; ') || `CLS ${worst.v.toFixed(3)}, scroll steady`);
      }
      await p.evaluate(() => { try { closeLayer('detail'); } catch (e) { /* already closed */ } }); await p.waitForTimeout(1200);
    }
    if (ONLY.includes('home')) {
      await p.evaluate(() => { try { closeLayer('detail'); } catch (e) { /* closed */ } if (typeof go === 'function') go('home'); });
      await p.waitForTimeout(1500);
      const ok = await p.evaluate(() => document.documentElement.scrollHeight > innerHeight * 1.5);
      if (!ok) note(dev, 'home', 'SKIP', 'Home has too little to scroll (catalog offline?)');
      else {
        await p.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.4))); await p.waitForTimeout(2000);
        const t = await now(p); const y0 = await p.evaluate(() => scrollY); await p.waitForTimeout(3000);
        const c = await cls(p, t); const y1 = await p.evaluate(() => scrollY);
        const bad = [c.v > LIMIT.cls && `layout shift ${c.v.toFixed(3)} (${c.src})`, Math.abs(y1 - y0) > LIMIT.scroll && `page scrolled by itself ${Math.abs(y1 - y0)} px`].filter(Boolean);
        note(dev, 'home', bad.length ? 'FAIL' : 'PASS', bad.join('; ') || `CLS ${c.v.toFixed(3)}, scroll steady`);
      }
    }
    if (errs.length) note(dev, 'errors', 'FAIL', errs.slice(0, 3).join(' | '));
  } catch (e) { note(dev, 'run', 'FAIL', e.message.slice(0, 200)); }
  await ctx.close();
}
await browser.close(); server.close();
const fails = results.filter((r) => r.status === 'FAIL');
console.log(`\nlayout check: ${results.filter((r) => r.status === 'PASS').length} pass, ${fails.length} fail, ${results.filter((r) => r.status === 'SKIP').length} skipped`);
process.exit(fails.length ? 1 : 0);
