#!/usr/bin/env node
/* Opening check for the web app: fails when opening a title or an episode is not one smooth step.

     node tools/open-check.mjs <folder> [--only=title,episode] [--devices=phone,desktop,tv] [--runs=2]

   Serves the folder and opens it in headless Chromium on a slow phone (Pixel 10 Pro size, its real pixel density, the
   CPU slowed 4x, a fresh cache every run, the real catalog over the network), a computer and a Fire TV. Then, the way a
   person does it, it taps a poster on Home (title) or a New episodes card (episode, phones) and records every frame:
   - title: from the tap until the page has settled. Fails when (a picture still loading over the network may fade in later)
       * the screen goes dark between Home and the page (what you see, Home under the page plus the page, drops below 85%),
       * a part of the page (picture, logo or title, Play button, story) shows at a different strength than the page
         itself, so it arrives on its own (more than 0.15 apart),
       * a part moves by more than 2 px while the page is visible,
       * the page fades out again after it has faded in (a second fade).
   - episode and ep-cold (The Simpsons, from a New episodes card, then closed with its X; ep-cold: Home knows only the
     show's name, so the page fetches the show before the panel opens): from the tap until the panel has closed
     again. Two test addons answer, one at once and one 0.7 s later, like real ones. Fails when
       * the panel is see-through at any moment while it opens or closes (Home or the title page shows through its text),
       * on a phone, the title page under it is half shown while the panel is still sliding up (three screens at once),
       * on a phone, anything on the title page under the panel is animating while the panel is open,
       * the source list is drawn more than twice in the first 1.5 s (a half list replaced a frame later),
       * the panel jumps (grows or moves) after it is up,
       * the panel's picture box is an empty black box when it appears.
   It also prints the time from the tap to the first frame that shows the page.
   Needs the network for the catalog (Cinemeta). A case whose data cannot load is SKIP, not FAIL. Exit code 1 on any FAIL. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const root = path.resolve(args.find((a) => !a.startsWith('--')) || 'app');
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1].split(',') : d; };
const ONLY = opt('only', ['title', 'episode', 'ep-cold']);
const DEVS = opt('devices', ['phone', 'desktop', 'tv']);
const RUNS = Number(opt('runs', ['2'])[0]) || 2;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
// two test addons: one answers at once with one source, the other 0.7 s later with 36
const MAN = { version: '1.0.0', resources: ['stream'], types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: [] };
const json = (res, o) => { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(o)); };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/oc-a/manifest.json') return json(res, { ...MAN, id: 'oc.a', name: 'Check A' });
  if (url === '/oc-b/manifest.json') return json(res, { ...MAN, id: 'oc.b', name: 'Check B' });
  if (url.startsWith('/oc-a/stream/')) return json(res, { streams: [{ name: 'A 1080p', title: 'Check.1080p.WEB-DL.English', url: 'https://example.invalid/a.mp4' }] });
  if (url.startsWith('/oc-b/stream/')) return void setTimeout(() => json(res, { streams: Array.from({ length: 36 }, (_, i) => ({ name: `B ${i % 3 ? '1080p' : '2160p'}`, title: `Check.${i % 3 ? '1080p' : '2160p'}.WEB-DL.English.${i}`, url: `https://example.invalid/b${i}.mp4` })) }), 700);
  const file = path.join(root, url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const TV_UA = 'Mozilla/5.0 (Linux; Android 9; AFTGAZL Build/PS7633; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 MKCinema/1.17.16';
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0 Mobile Safari/537.36 MKCinema/1.17.16';
const DEV = {
  phone: { ctx: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: PHONE_UA, deviceScaleFactor: 2.625 }, input: 'tap', cpu: 4 },
  desktop: { ctx: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }, input: 'click', cpu: 2 },
  tv: { ctx: { viewport: { width: 960, height: 540 }, userAgent: TV_UA, deviceScaleFactor: 1 }, input: 'remote', cpu: 6 },
};
const LIMIT = { seen: 0.85, part: 0.15, move: 2, refade: 0.05 };
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1' } } : {});
const results = [];
const note = (dev, test, status, msg) => { results.push({ dev, test, status, msg }); console.log(`${status.padEnd(4)} ${dev.padEnd(7)} ${test.padEnd(8)} ${msg}`); };

async function start(dev) {
  const D = DEV[dev];
  const ctx = await browser.newContext({ ...D.ctx, serviceWorkers: 'block', ignoreHTTPSErrors: !!proxy });
  await ctx.addInitScript((b) => { try { if (sessionStorage.getItem('oc')) return; sessionStorage.setItem('oc', '1');
    for (const [k, v] of Object.entries({ 'mkc:toured': 'true', 'mkc:langAsked': '1', 'mkc:whatsNewOff': 'true', 'mkc:seenVer': '"9.99.99"', 'mkc:playerAsked': '1', 'mkc:prompt': '1',
      'mkc:addons': JSON.stringify([b + '/oc-a/manifest.json', b + '/oc-b/manifest.json']) })) localStorage.setItem(k, v); } catch (e) { /* storage off */ } }, base);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelector('#homeRows section.row, #view-home .rail'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(4000);
  for (let i = 0; i < 3; i++) {
    const did = await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find((b) => /^(Got it|Not now|Later|Close|Skip|No thanks|Maybe later)$/i.test(b.textContent.trim()) && b.getClientRects().length); if (x) { x.click(); return 1; } return 0; });
    if (!did) break; await p.waitForTimeout(500);
  }
  return { ctx, p, errs };
}
// puts a card at the top of Home (same markup as the real rows) and returns where to tap it
async function placeCard(p, id, type, vid) {
  return p.evaluate(async ([id, type, vid]) => {
    let m = null; try { m = remember(await engine.fetchMeta(type, id)); } catch (e) { return null; }
    if (!m || (vid && !(m.videos && m.videos.length))) return null;
    let v = null; if (vid) { v = m.videos.filter((x) => Number(x.season) > 0).slice(-2)[0]; if (!v) return null; }
    const sec = rowShell(vid ? 'New episodes' : 'Check', '', { id: 'ocRow' }); document.querySelector('#homeRows').prepend(sec);
    let h = cardHTML(vid ? { id, type, name: m.name, poster: m.poster, background: m.background } : m, { wide: !!vid, sub: vid ? 'S1 · E1' : '' });
    if (vid) h = h.replace('data-card ', `data-card data-newep="${videoIdFor(m, v)}" `);
    fillRail(sec, h); scrollTo(0, 0);
    if (vid === 'cold') S.metas.set(id, { id, type, name: m.name }); // Home knows only the name: the page asks for the show first
    return true;
  }, [id, type, vid]);
}
async function cardBox(p) {
  return p.evaluate(() => { const c = document.querySelector('#ocRow [data-card]'); if (!c) return null; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 80), y: r.top + r.height / 2 }; });
}
async function press(p, input, box) {
  if (input === 'tap') await p.touchscreen.tap(box.x, box.y);
  else if (input === 'click') await p.mouse.click(box.x, box.y);
  else { await p.evaluate(() => { const c = document.querySelector('#ocRow [data-card]'); c.focus(); }); await p.keyboard.press('Enter'); }
}
// the frame recorder: runs in the page, one sample per frame
function recorder() {
  const vis = (e) => { if (!e || !e.isConnected) return -1; let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.hidden && !x.classList.contains('leaving')) return 0; const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return 0; o *= +c.opacity; } return o; };
  const PARTS = { picture: '#detailPanel .d-hero>img.bg', logo: '#detailPanel .d-hero .logo3d, #detailPanel .d-hero h1', play: '#dSmart', story: '#detailPanel .d-desc, #detailPanel .d-hero .d-body p' };
  const t0 = performance.now(); window.__oc = [];
  const f = () => {
    const det = document.getElementById('detail'), app = document.getElementById('app'), es = document.getElementById('epSheet');
    const r = { t: performance.now() - t0, app: vis(app), det: vis(det), sheet: vis(es), parts: {}, anim: 0, still: '', panel: -1, ptop: 0, draws: window.__ocDraws || 0 };
    const pnl = es && es.querySelector('.ep-sheet');
    if (pnl && (!es.hidden || es.classList.contains('leaving')) && getComputedStyle(es).display !== 'none') { r.panel = vis(pnl); const b = pnl.getBoundingClientRect(); r.ptop = Math.round(b.top + b.left); }
    // layout position (offsets, not transforms): an intended glide or the logo's own entrance is not a jump
    const pos = (e) => { let x = 0, y = 0; for (let n = e; n; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return { x, y }; };
    for (const [k, s] of Object.entries(PARTS)) { const e = document.querySelector(s); if (e && e.getClientRects().length) { const q = pos(e); r.parts[k] = { o: vis(e), y: q.y, x: q.x, wait: e.tagName === 'IMG' && !(e.complete && e.naturalWidth) }; } }
    r.open = !!(es && !es.hidden);
    if (r.sheet > 0.05 && r.open) {
      try { const an = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#detailPanel')); r.anim = an.length; r.animOn = an.slice(0, 4).map((a) => `${a.animationName || a.transitionProperty || 'script'} on ${a.effect.target.id || String(a.effect.target.className).slice(0, 30)}`).join(', '); } catch (e) { r.anim = 0; }
      const st = document.querySelector('#esHead .es-still'), im = st && st.querySelector('img');
      r.still = !st ? 'none' : (im && im.complete && im.naturalWidth && vis(im) > 0.5) ? 'picture' : (st.style.backgroundImage || getComputedStyle(st).backgroundImage) !== 'none' ? 'backdrop' : 'empty';
    }
    window.__oc.push(r); if (r.t < 6500) requestAnimationFrame(f);
  };
  // each time the source list is drawn again (its rows replaced), counted
  window.__ocDraws = 0;
  new MutationObserver((ms) => { if (ms.some((m) => m.target.id === 'dStreams' && (m.removedNodes.length > 1 || m.addedNodes.length > 1))) window.__ocDraws++; }).observe(document.body, { childList: true, subtree: true });
  requestAnimationFrame(f);
}
function judgeTitle(fr) {
  const out = [], first = fr.findIndex((r) => r.det > 0.05);
  if (first < 0) return { fail: ['the page never showed'], first: null };
  // what you see: the page (its background is opaque) over Home
  let worst = 1, at = 0;
  for (const r of fr) { const seen = Math.max(0, r.det) + Math.max(0, r.app) * (1 - Math.max(0, r.det)); if (seen < worst) { worst = seen; at = r.t; } }
  if (worst < LIMIT.seen) out.push(`screen went dark between Home and the page (${Math.round(worst * 100)}% at ${Math.round(at)} ms)`);
  let top = 0, refade = 0, part = null, move = null; const last = {}, full = {};
  for (const r of fr) for (const [k, v] of Object.entries(r.parts)) if (v.o > 0) full[k] = v.o; // each part's own settled strength (a backdrop is dimmed on purpose)
  for (const r of fr.slice(first)) {
    top = Math.max(top, r.det); if (top > 0.5 && top - r.det > refade) refade = top - r.det;
    for (const [k, v] of Object.entries(r.parts)) {
      // a picture still on its way over the network may fade in when it arrives; one that is here must show with the page
      if (r.det > 0.05 && v.o >= 0 && !v.wait) { const d = Math.abs(v.o / (full[k] || 1) - r.det); if (d > LIMIT.part && (!part || d > part.d)) part = { k, d, t: r.t }; }
      const l = last[k]; if (l && r.det > 0.05 && v.o > 0.05) { const m = Math.max(Math.abs(v.y - l.y), Math.abs(v.x - l.x)); if (m > LIMIT.move && (!move || m > move.m)) move = { k, m, t: r.t }; }
      last[k] = v;
    }
  }
  if (refade > LIMIT.refade) out.push(`the page faded out again after showing (by ${Math.round(refade * 100)}%)`);
  if (part) out.push(`${part.k} showed apart from the page (${Math.round(part.d * 100)}% off at ${Math.round(part.t)} ms)`);
  if (move) out.push(`${move.k} moved ${move.m.toFixed(1)} px while showing (at ${Math.round(move.t)} ms)`);
  return { fail: out, first: fr[first].t };
}
function judgeEpisode(fr, dev) {
  const out = [], first = fr.findIndex((r) => r.sheet > 0.05);
  if (first < 0) return { fail: ['the episode panel never showed'], first: null };
  const see = fr.find((r) => r.panel > 0.02 && r.panel < 0.98);
  if (see) out.push(`the episode panel was see-through (${Math.round(see.panel * 100)}% at ${Math.round(see.t)} ms)`);
  // where the panel rests once it is up: the title page may only appear behind it after that
  const up = fr.slice(first).find((r, i, a) => r.panel >= 0.98 && a[i + 3] && [1, 2, 3].every((k) => a[i + k].ptop === r.ptop));
  if (up) {
    const jump = fr.slice(fr.indexOf(up)).find((r) => r.open && r.panel >= 0.98 && Math.abs(r.ptop - up.ptop) > 2);
    if (jump) out.push(`the panel jumped ${Math.abs(jump.ptop - up.ptop)} px after it was up (at ${Math.round(jump.t)} ms)`);
  }
  if (up && dev === 'phone') {
    const half = fr.slice(first).find((r) => r.t < up.t && r.det > 0.05 && r.det < 0.95);
    if (half) out.push(`the title page was half shown while the panel was still sliding up (${Math.round(half.det * 100)}% at ${Math.round(half.t)} ms)`);
  }
  const d0 = fr[first].draws, early = fr.filter((r) => r.t <= fr[first].t + 1500).pop();
  if (early && early.draws - d0 > 1) out.push(`the source list was drawn ${early.draws - d0 + 1} times in the first 1.5 s`);
  // a phone panel covers the page; on a computer it sits beside it, so the page may move there
  const worst = fr.slice(first).reduce((a, r) => (r.anim > a.anim ? r : a), { anim: 0 });
  if (dev === 'phone' && worst.anim > 0) out.push(`${worst.anim} animation(s) running on the title page under the episode panel (${worst.animOn})`);
  if (fr[first].still === 'empty') out.push('the episode picture box was empty when the panel appeared');
  return { fail: out, first: fr[first].t };
}

const CASES = { title: { id: 'tt0111161', type: 'movie' }, episode: { id: 'tt0096697', type: 'series', vid: true }, 'ep-cold': { id: 'tt0096697', type: 'series', vid: 'cold' } };
for (const dev of DEVS) {
  for (const test of ONLY) {
    if (test !== 'title' && dev === 'tv') continue;
    const c = CASES[test]; const fails = []; const firsts = []; let skip = '';
    for (let run = 0; run < RUNS && !skip; run++) {
      const { ctx, p, errs } = await start(dev);
      try {
        if (!(await placeCard(p, c.id, c.type, c.vid))) { skip = 'title data did not load (catalog offline?)'; continue; }
        await p.waitForTimeout(1200);
        const box = await cardBox(p); if (!box) { skip = 'no card to open'; continue; }
        const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: DEV[dev].cpu });
        await p.waitForTimeout(400);
        await p.evaluate(recorder); await press(p, DEV[dev].input, box);
        if (test !== 'title') {
          await p.waitForTimeout(3600);
          const x = await p.evaluate(() => { const b = document.getElementById('esClose'); if (!b || !b.getClientRects().length) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
          if (x) { if (DEV[dev].input === 'tap') await p.touchscreen.tap(x.x, x.y); else await p.mouse.click(x.x, x.y); }
          await p.waitForTimeout(3000);
        } else await p.waitForTimeout(6800);
        const fr = await p.evaluate(() => window.__oc);
        if (process.env.OC_DUMP) console.log(JSON.stringify(fr.filter((r, i) => i % 3 === 0).map((r) => [Math.round(r.t), +r.det.toFixed(2), +r.app.toFixed(2), +(+r.panel).toFixed(2), r.ptop, r.draws])));
        const j = test === 'title' ? judgeTitle(fr) : judgeEpisode(fr, dev);
        if (j.first != null) firsts.push(Math.round(j.first));
        fails.push(...j.fail.map((x) => `run ${run + 1}: ${x}`));
        if (errs.length) fails.push(`run ${run + 1}: page error ${errs[0]}`);
      } finally { await ctx.close(); }
    }
    if (skip && !firsts.length) note(dev, test, 'SKIP', skip);
    else if (fails.length) note(dev, test, 'FAIL', `${fails.join('; ')} (tap to first frame ${firsts.join(', ')} ms, CPU ${DEV[dev].cpu}x slower)`);
    else note(dev, test, 'PASS', `tap to first frame ${firsts.join(', ')} ms (CPU ${DEV[dev].cpu}x slower)`);
  }
}
await browser.close(); server.close();
const fails = results.filter((r) => r.status === 'FAIL');
console.log(`\nopen check: ${results.filter((r) => r.status === 'PASS').length} pass, ${fails.length} fail, ${results.filter((r) => r.status === 'SKIP').length} skipped`);
process.exit(fails.length ? 1 : 0);
