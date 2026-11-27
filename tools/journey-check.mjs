#!/usr/bin/env node
/* Journey check: walks every main path through the web app the way a person does, on a slow phone, a computer and a
   Fire TV remote, records every frame, and fails on the kinds of problems people have reported:

     node tools/journey-check.mjs <app folder | https://app.mkcinema.app> [--devices=phone,desktop,tv]
          [--journeys=home,title,series,play,search,settings,menu,live,library,party] [--out=folder] [--json=file]

   The journeys: Home, open a film, open a series and switch seasons, open an episode, pick a source, play, seek, change
   audio and subtitles, Back out at every step, Search, Settings, the Menu and its sections, Live TV, Library, watch party.
   Sources come from a test addon served by this script (a real VP9 film with two audio languages and two subtitle
   tracks, made with ffmpeg), so playback is real; the catalog is the real one over the network.

   After every step it checks, on every device:
   - errors     an uncaught error or a console error in the page
   - double     two full-screen pages both half see-through at once for more than 200 ms (a double exposure)
   - settle     something on screen moves by more than 2 px, or its words change, after the step had settled (a jump,
                or content swapping under the user's finger)
   - blocked    a visible button whose middle is covered by something else (an invisible layer swallowing taps counts)
   - wide       the page is wider than the screen (it scrolls sideways)
   - stuck      a loading spinner still turning 12 s after the step
   - frozen     the page was busy for more than 700 ms in one go after a press (on the slowed CPU)
   - picture    in the player: sound running while the picture is hidden or covered, or a film that never starts
   TV only (the remote):
   - focus      nothing highlighted, or the highlight is off screen, hidden, or under the open panel
   - deadkey    Up, Down, Left or Right does nothing although something to move to lies that way on screen
   - back       Back does nothing, or would close the app while a panel or menu is open (Back is run exactly the way
                the Android TV app runs it, using the script inside android/.../MainActivity.java), or the highlight
                does not come back to what opened the panel
   Phones: Back is the system Back (the page's history, the way the Android app does it); computers: the Escape key.
   - return     after Back, the page underneath is not where it was (scroll position) or the panel did not close

   Frames are saved (CDP screencast) for every failing step as a contact sheet in the --out folder, so a person can see
   what the test saw. A step whose catalog data cannot load is SKIP, never FAIL. Exit code 1 on any FAIL. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || 'app';
const LIVE = /^https?:\/\//.test(target);
const root = LIVE ? null : path.resolve(target);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3).split(',') : d; };
const DEVS = opt('devices', ['phone', 'desktop', 'tv']);
const JOURNEYS = opt('journeys', ['home', 'title', 'series', 'play', 'search', 'settings', 'menu', 'live', 'library', 'party']);
const OUT = path.resolve(opt('out', ['journey-out'])[0]);
const JSON_OUT = opt('json', [''])[0];
const VERBOSE = !!process.env.JC_VERBOSE;
// JC_SEED='{"mkc:keys":"{\"tmdb\":\"...\"}"}' adds saved settings, e.g. a TMDB key so a local build shows the parts
// (Where to watch, cast) that the live app gets from its own server
const PAGE = process.env.JC_PAGE || '';
const SLOW = String(process.env.JC_SLOW || '').split(',').filter(Boolean).map((x) => { const i = x.lastIndexOf(':'); return [x.slice(0, i), Number(x.slice(i + 1)) || 0]; });
const SEED = (() => { try { return JSON.parse(process.env.JC_SEED || '{}'); } catch (e) { return {}; } })();
fs.mkdirSync(OUT, { recursive: true });

/* ---------- the test film, the test addon and the app ---------- */
const MEDIA = path.join(OUT, 'media');
fs.mkdirSync(MEDIA, { recursive: true });
const FILM = path.join(MEDIA, 'film.webm');
if (!fs.existsSync(FILM)) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000', '-t', '180', '-map', '0', '-map', '1', '-map', '2', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8',
    '-b:v', '300k', '-g', '48', '-c:a', 'libopus', '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=spa', FILM]);
}
const vtt = (lang) => 'WEBVTT\n\n' + Array.from({ length: 60 }, (_, i) => `00:${String(Math.floor(i * 3 / 60)).padStart(2, '0')}:${String((i * 3) % 60).padStart(2, '0')}.000 --> 00:${String(Math.floor((i * 3 + 2) / 60)).padStart(2, '0')}:${String((i * 3 + 2) % 60).padStart(2, '0')}.500\n${lang} line ${i + 1}\n`).join('\n');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.vtt': 'text/vtt' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Expose-Headers': '*' };
let base = '';
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const json = (o) => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (p === '/addon/manifest.json') return json({ id: 'test.journey', version: '1.0.0', name: 'Journey Test', resources: ['stream', 'subtitles'], types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: [] });
  if (p.startsWith('/addon/stream/')) {
    return json({ streams: [
      { name: 'Test 1080p', title: 'Journey.Test.1080p.WEB-DL.Opus.English', url: `${base}/media/film.webm`, behaviorHints: { bingeGroup: 'jc' } },
      { name: 'Test 720p', title: 'Journey.Test.720p.WEB.English', url: `${base}/media/film.webm?b=720`, behaviorHints: { bingeGroup: 'jc' } }] });
  }
  if (p.startsWith('/addon/subtitles/')) return json({ subtitles: [{ id: 'jc-en', lang: 'eng', url: `${base}/sub/en.vtt` }, { id: 'jc-es', lang: 'spa', url: `${base}/sub/es.vtt` }] });
  if (p.startsWith('/sub/')) { res.writeHead(200, { ...cors, 'Content-Type': 'text/vtt' }); res.end(vtt(p.includes('es') ? 'Spanish' : 'English')); return; }
  if (p.startsWith('/media/')) {
    const st = fs.statSync(FILM), rg = req.headers.range;
    if (rg) { const [a, b] = rg.replace('bytes=', '').split('-'); const s = +a, e = b ? +b : st.size - 1;
      res.writeHead(206, { ...cors, 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Content-Length': e - s + 1 });
      fs.createReadStream(FILM, { start: s, end: e }).pipe(res); return; }
    res.writeHead(200, { ...cors, 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': st.size }); fs.createReadStream(FILM).pipe(res); return;
  }
  if (LIVE) { res.writeHead(404); res.end(); return; }
  const file = path.join(root, p.endsWith('/') ? p + 'index.html' : p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
base = `http://localhost:${server.address().port}`;
const APP = LIVE ? target.replace(/\/$/, '') + '/' : base + '/';

/* The Android TV app hands Back to the page with this script (MainActivity.TV_BACK_JS); a false answer means the app
   goes back in its history or closes. Read from the source, so the test always uses what the app ships. */
let TV_BACK_JS = '';
try {
  const src = fs.readFileSync(path.join(HERE, '..', 'android', 'src', 'com', 'mkcinema', 'app', 'MainActivity.java'), 'utf8');
  const m = src.match(/TV_BACK_JS\s*=\s*([\s\S]*?);\s*\n/);
  TV_BACK_JS = m[1].split(/\n/).map((l) => l.trim().replace(/^\+\s*/, '')).map((l) => { const q = l.match(/^"(.*)"$/); return q ? JSON.parse(`"${q[1]}"`) : ''; }).join('');
} catch (e) { TV_BACK_JS = ''; }

const TV_UA = 'Mozilla/5.0 (Linux; Android 9; AFTGAZL Build/PS7633; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 MKCinemaAndroid/1.17.16 MKCinemaTV/1.17.16';
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0 Mobile Safari/537.36 MKCinemaAndroid/1.17.16';
const DEV = {
  phone: { ctx: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, userAgent: PHONE_UA, deviceScaleFactor: 2 }, input: 'tap', cpu: 4 },
  desktop: { ctx: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }, input: 'click', cpu: 2 },
  tv: { ctx: { viewport: { width: 960, height: 540 }, userAgent: TV_UA, deviceScaleFactor: 1 }, input: 'remote', cpu: 6 },
};
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], ...(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {}) });

/* ---------- the in-page probe ---------- */
function probe() {
  if (window.__jc) return;
  const J = window.__jc = { errs: [], long: [], shifts: [], frames: null };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) J.long.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: false }); } catch (e) { /* none */ }
  const op = (e) => { let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.hidden) return 0; const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden') return 0; o *= +c.opacity; } return o; };
  J.op = op;
  const name = (e) => { if (!e || e.nodeType !== 1) return String(e); const id = e.id ? '#' + e.id : ''; const cl = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const tx = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28); return `${e.tagName.toLowerCase()}${id}${cl}${tx ? ` "${tx}"` : ''}`; };
  J.name = name;
  // full-screen layers: fixed boxes covering most of the screen (pages, panels, the player)
  J.layers = () => {
    const vw = innerWidth, vh = innerHeight, out = [];
    for (const e of document.body.children) {
      const c = getComputedStyle(e); if (c.display === 'none' || e.hidden) continue;
      const cand = c.position === 'fixed' ? [e] : (e.id === 'app' ? [e] : []);
      for (const x of cand) { const r = x.getBoundingClientRect(); if (r.width * Math.min(r.height, vh) < vw * vh * 0.6 && x.id !== 'app') continue; const o = op(x); if (o > 0.02) out.push({ id: x.id || name(x), o: +o.toFixed(2), z: +c.zIndex || 0 }); }
    }
    return out;
  };
  J.top = () => { // the layer that gets a tap in the middle of the screen
    const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); if (!e) return '';
    let t = e; while (t.parentElement && t.parentElement !== document.body) t = t.parentElement; return t.id || name(t);
  };
  J.inTop = (el) => { const t = J.top(); return !t || (el.closest(`#${CSS.escape(t)}`) != null); };
  const isPanelOpen = () => {
    const ids = ['remote', 'castLayer', 'partyLayer', 'player', 'trailer', 'tour', 'stremioImport', 'palette', 'epSheet', 'askLayer', 'tastePick', 'settings', 'addons', 'detail', 'rcLayer'];
    return ids.filter((i) => { const e = document.getElementById(i); return e && !e.hidden && op(e) > 0.05; });
  };
  J.panels = isPanelOpen;
  // anything floating over the page (menus, dialogs, sheets) that a person would expect Back to close
  J.floating = () => {
    const vw = innerWidth, vh = innerHeight, out = [];
    for (const e of document.querySelectorAll('body *')) {
      const c = getComputedStyle(e); if (c.position !== 'fixed' && c.position !== 'absolute') continue; if (c.position === 'absolute' && !e.closest('body>*:not(#app)')) continue;
      if (!/dialog|menu|sheet|modal|popup|pop|drawer|picker|ask|prompt|panel|overlay/i.test(`${e.id} ${e.className} ${e.getAttribute('role') || ''}`)) continue;
      const r = e.getBoundingClientRect(); if (r.width < 120 || r.height < 80 || r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
      if (op(e) < 0.5) continue; if (!e.querySelector('button, a[href], [data-nav], input')) continue;
      if (e.closest('#hud') || (e.id === 'hud')) continue;
      out.push(name(e));
    }
    return out.slice(0, 6);
  };
  J.focus = () => {
    const a = document.activeElement; if (!a || a === document.body || a === document.documentElement) return { ok: false, why: 'nothing is highlighted' };
    const r = a.getBoundingClientRect(), o = op(a);
    const info = { el: name(a), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    if (!(r.width > 0 && r.height > 0)) return { ...info, ok: false, why: 'the highlighted item has no size (it is hidden)' };
    // TV: the drawn highlight and the real focus must be the same item. A hidden item (inside a closed section) takes
    // the highlight class but cannot take focus, so the remote seems to vanish while focus stays where it was.
    const nf = document.querySelector('.nav-focus');
    if (document.documentElement.classList.contains('tv') && nf && nf !== a && !nf.contains(a) && !a.contains(nf))
      return { ...info, ok: false, why: `the highlight is drawn on ${name(nf)}, but the remote is still on this item` };
    if (o < 0.3) return { ...info, ok: false, why: `the highlighted item is see-through (${Math.round(o * 100)}%)` };
    const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
    if (r.bottom < 4 || r.top > innerHeight - 4 || r.right < 4 || r.left > innerWidth - 4) return { ...info, ok: false, why: 'the highlighted item is off screen' };
    const hit = document.elementFromPoint(cx, cy);
    if (hit && !a.contains(hit) && !hit.contains(a)) {
      // under something: fine when the cover is part of the same panel (a label over a card); not fine when another layer
      let t = hit; while (t.parentElement && t.parentElement !== document.body) t = t.parentElement;
      let ta = a; while (ta.parentElement && ta.parentElement !== document.body) ta = ta.parentElement;
      if (t !== ta && op(t) > 0.3) return { ...info, ok: false, why: `the highlighted item is under ${name(hit)}` };
    }
    if (a.closest('#ezbMenu:not([hidden])')) return { ...info, ok: true };
    if (typeof Nav !== 'undefined' && Nav.root) { try { const rt = Nav.root(); if (rt && !rt.contains(a) && !a.closest('#remote')) return { ...info, ok: false, why: `the highlight is outside the open panel (${rt.id || name(rt)})` }; } catch (e) { /* keep */ } }
    return { ...info, ok: true };
  };
  // can the remote go that way: is anything on screen strictly in that direction?
  J.towards = (dir) => {
    const a = document.activeElement; if (!a || a === document.body || typeof Nav === 'undefined') return [];
    let rt; try { rt = a.closest('#ezbMenu') || Nav.root(); } catch (e) { return []; }
    const ar = a.getBoundingClientRect(), ax = ar.left + ar.width / 2, ay = ar.top + ar.height / 2, out = [];
    for (const el of Nav.items(rt)) {
      if (el === a || el.contains(a) || a.contains(el)) continue;
      const b = el.getBoundingClientRect(); if (b.bottom < 0 || b.top > innerHeight || b.right < 0 || b.left > innerWidth) continue; if (op(el) < 0.3) continue;
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const main = dir === 'right' ? bx - ax : dir === 'left' ? ax - bx : dir === 'down' ? by - ay : ay - by;
      const cross = dir === 'right' || dir === 'left' ? Math.abs(by - ay) : Math.abs(bx - ax);
      // clearly that way: beyond the item's own edge and not far off to the side
      const edge = dir === 'right' ? b.left >= ar.right - 2 : dir === 'left' ? b.right <= ar.left + 2 : dir === 'down' ? b.top >= ar.bottom - 2 : b.bottom <= ar.top + 2;
      if (main > 8 && edge && cross < main * 1.5) out.push(name(el));
    }
    return out.slice(0, 3);
  };
  // visible buttons in the top layer: their place on the page and their words, for the settle and blocked checks
  J.marks = () => {
    const out = [], vw = innerWidth, vh = innerHeight;
    const busy = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target).map((a) => a.effect.target);
    for (const e of document.querySelectorAll('button, a[href], [data-nav], [data-card], h1, h2, .card, img')) {
      if (out.length >= 160) break;
      const r = e.getBoundingClientRect(); if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      if (op(e) < 0.6 || !J.inTop(e)) continue;
      if (busy.some((t) => t === e || t.contains(e) || e.contains(t))) continue; // an entrance still running is not a jump
      if (e.closest('#toasts, .toast, #hud, .marquee, .spot-rot, [aria-live], .live-clock, .sv-, #mkPillMenu')) continue;
      const fixed = (() => { for (let x = e; x && x !== document.body; x = x.parentElement) if (getComputedStyle(x).position === 'fixed') return true; return false; })();
      const sc = fixed ? 0 : scrollY;
      let tx = (e.tagName === 'IMG' ? e.getAttribute('src') || '' : (e.getAttribute('aria-label') || e.textContent || '')).trim().replace(/\s+/g, ' ').slice(0, 40).replace(/\d/g, '#');
      out.push({ k: name(e).slice(0, 70), x: Math.round(r.left), y: Math.round(r.top + sc), w: Math.round(r.width), h: Math.round(r.height), tx, el: e });
    }
    return out;
  };
  J.blocked = () => {
    const out = [];
    for (const e of document.querySelectorAll('button, a[href], [data-card], input, select')) {
      const r = e.getBoundingClientRect(); if (r.width < 16 || r.height < 16) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 2 || cy < 2 || cx > innerWidth - 2 || cy > innerHeight - 2) continue;
      if (op(e) < 0.7 || e.disabled) continue;
      if (!J.inTop(e)) continue;
      const cs = getComputedStyle(e); if (cs.pointerEvents === 'none') continue;
      const hit = document.elementFromPoint(cx, cy); if (!hit || e.contains(hit) || hit.contains(e)) continue;
      if (hit.closest('label') && hit.closest('label').contains(e)) continue;
      const own = hit.closest('button, a[href], [data-nav], [role="button"]');
      const ho = Math.max(op(hit), own ? op(own) : 0);
      if (ho >= 0.05) continue; // a visible thing over a button is a panel or a bar on purpose; an invisible one is a trap
      // something nobody can see swallowing the tap is always wrong; a visible cover from another part is wrong too
      const sameCard = hit.closest('[data-card], .card, .row, section') === e.closest('[data-card], .card, .row, section') && hit.closest('[data-card], .card');
      if (sameCard) continue;
      if (hit.closest('#toasts, .toast, #mkPillMenu, .dock-wrap, #mtabs, #tabs, header, .topbar, #hud') && !e.closest('#toasts, .toast, #mkPillMenu, .dock-wrap, #mtabs, #tabs, header, .topbar, #hud')) continue; // floating bars sit over a scrolling page by design
      out.push(`${name(e)} is covered by ${ho < 0.05 ? 'an invisible ' : ''}${name(hit)}`);
      if (out.length >= 4) break;
    }
    return out;
  };
  J.wide = () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth;
  J.spinners = () => [...document.querySelectorAll('.spinner, .spin, .loader, [aria-busy="true"], .loading')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && op(e) > 0.5; }).map(name).slice(0, 3);
  J.video = () => {
    const v = [...document.querySelectorAll('video')].find((x) => x.currentSrc && x.closest('#player'));
    if (!v) return null;
    const r = v.getBoundingClientRect(), o = op(v);
    let covered = '';
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && hit !== v && !v.contains(hit)) {
      for (let x = hit; x && x !== document.body; x = x.parentElement) {
        if (x === v.parentElement || x.id === 'player') break;
        const c = getComputedStyle(x), bg = c.backgroundColor.match(/[\d.]+/g); const xr = x.getBoundingClientRect();
        const opaque = (bg && (bg.length < 4 || +bg[3] > 0.9) && !/rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor)) || c.backgroundImage !== 'none';
        if (opaque && xr.width * xr.height > r.width * r.height * 0.8 && op(x) > 0.85) { covered = name(x); break; }
      }
    }
    return { t: v.currentTime, paused: v.paused, rs: v.readyState, o: +o.toFixed(2), covered, muted: v.muted, vol: v.volume, w: v.videoWidth };
  };
  // frame recorder: the layers and the video, once per frame
  J.rec = (ms) => {
    const t0 = performance.now(), mine = J.frames = [];
    const f = () => { if (J.frames !== mine) return; const t = performance.now() - t0; mine.push({ t, L: J.layers(), v: J.video() }); if (t < ms) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  };
  addEventListener('error', (e) => J.errs.push(String(e.message || e).slice(0, 200)));
  addEventListener('unhandledrejection', (e) => { const m = String((e.reason && (e.reason.message || e.reason)) || 'rejection'); if (!/abort|NotAllowed|The play\(\) request|interrupted/i.test(m)) J.errs.push('unhandled: ' + m.slice(0, 200)); });
}

/* ---------- running a device ---------- */
const results = [];
let curDev = '', curJourney = '';
function report(step, status, check, msg, frames) {
  const r = { dev: curDev, journey: curJourney, step, status, check, msg, frames: frames || '' };
  results.push(r);
  if (status !== 'PASS' || VERBOSE) console.log(`${status.padEnd(4)} ${curDev.padEnd(7)} ${curJourney.padEnd(8)} ${step.padEnd(26)} ${check ? check.padEnd(8) : ''} ${msg}`);
}

class Run {
  constructor(dev) { this.dev = dev; this.D = DEV[dev]; this.tv = dev === 'tv'; }
  async open() {
    const { D } = this;
    this.ctx = await browser.newContext({ ...D.ctx, serviceWorkers: 'block', ignoreHTTPSErrors: !!proxy });
    await this.ctx.addInitScript(({ addon, extra }) => { try { if (sessionStorage.getItem('jc')) return; sessionStorage.setItem('jc', '1');
      const seed = { 'mkc:toured': 'true', 'mkc:langAsked': '1', 'mkc:whatsNewOff': 'true', 'mkc:seenVer': '"9.99.99"', 'mkc:playerAsked': '1', 'mkc:prompt': '1', 'mkc:addons': JSON.stringify([addon]) };
      Object.assign(seed, extra); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); } catch (e) { /* storage off */ } }, { addon: `${base}/addon/manifest.json`, extra: SEED });
    await this.ctx.addInitScript(probe);
    // JC_PAGE=<folder>/index.html: on the live address, serve this page instead of the live one (tests a patched
    // build with everything the live address unlocks, such as Google sign-in and Where to watch)
    if (LIVE && PAGE) await this.ctx.route((u) => u.origin === new URL(APP).origin && (u.pathname === '/' || u.pathname === '/index.html'), (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(PAGE) }));
    // the checker is not a person: its visits never go into the app's anonymous usage and problem counts
    // (JC_USAGE=1 prints the problem counts the app would have sent, to compare with what the checker saw)
    // (keepalive requests skip the browser's request hook, so the count request is sent without it here)
    await this.ctx.addInitScript(() => { const f = window.fetch; window.fetch = function (u, o) { if (o && o.keepalive && /\/rpc\/mkc_usage_add/.test(String(u))) o = { ...o, keepalive: false }; return f.call(this, u, o); }; });
    await this.ctx.route((u) => u.pathname.endsWith('/rpc/mkc_usage_add'), (route) => {
      if (process.env.JC_USAGE) { try { const b = JSON.parse(route.request().postData() || '{}'); for (const [ev, k, n] of b.rows || []) if (ev === 'feat' && /^(err|play_wait):/.test(k)) console.log(`USAGE ${this.dev} ${curJourney} ${k} x${n}`); } catch (e) { /* not ours */ } }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '0' });
    });
    // a slow server answer, as on a weak connection: JC_SLOW='auth/v1/settings:2500' holds matching requests that long
    for (const [part, ms] of SLOW) await this.ctx.route((u) => u.href.includes(part), async (route) => { await new Promise((r) => setTimeout(r, ms)); await route.continue().catch(() => {}); });
    this.p = await this.ctx.newPage();
    this.pageErrs = [];
    this.p.on('pageerror', (e) => this.pageErrs.push(e.message.slice(0, 200)));
    this.p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::|404|CORS|ERR_|favicon|status of 4\d\d|status of 5\d\d|Content Security Policy|youtube|doubleclick|google/i.test(m.text())) this.pageErrs.push('console: ' + m.text().slice(0, 200)); });
    this.p.on('dialog', (d) => d.dismiss().catch(() => {}));
    await this.p.goto(APP, { waitUntil: 'domcontentloaded' });
    await this.p.waitForFunction(() => document.querySelector('#homeRows section.row .card, #view-home .rail .card'), null, { timeout: 40000 }).catch(() => {});
    await this.p.waitForTimeout(3000);
    await this.dismiss();
    this.cdp = await this.ctx.newCDPSession(this.p);
    await this.cdp.send('Emulation.setCPUThrottlingRate', { rate: this.D.cpu });
    this.shots = [];
    this.cdp.on('Page.screencastFrame', (f) => { this.shots.push({ t: Date.now(), data: f.data }); if (this.shots.length > 400) this.shots.shift(); this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 50, maxWidth: 480, maxHeight: 900, everyNthFrame: 1 });
    return this;
  }
  async close() { try { await this.cdp.send('Page.stopScreencast'); } catch (e) { /* gone */ } await this.ctx.close().catch(() => {}); }
  async dismiss() {
    for (let i = 0; i < 4; i++) {
      const did = await this.p.evaluate(() => { const x = [...document.querySelectorAll('button')].find((b) => /^(Got it|Not now|Later|Close|Skip|No thanks|Maybe later|Keep this|Continue)$/i.test(b.textContent.trim()) && b.getClientRects().length && __jc.op(b) > 0.5); if (x) { x.click(); return 1; } return 0; }).catch(() => 0);
      if (!did) break; await this.p.waitForTimeout(600);
    }
  }
  ev(fn, a) { return this.p.evaluate(fn, a); }
  // a press on an element, the way the device does it
  async press(sel, { nth = 0 } = {}) {
    const h = await this.p.evaluateHandle(([s, n]) => { const all = [...document.querySelectorAll(s)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && __jc.op(e) > 0.3; }); return all[n] || null; }, [sel, nth]);
    const el = h.asElement(); if (!el) return false;
    if (this.tv) {
      await el.evaluate((e) => { e.scrollIntoView({ block: 'center', inline: 'nearest' }); if (typeof Nav !== 'undefined') Nav.focus(e, true); else e.focus(); });
      await this.p.waitForTimeout(350);
      this.opener = await this.ev(() => __jc.name(document.activeElement));
      await this.p.keyboard.press('Enter');
      return true;
    }
    await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await this.p.waitForTimeout(500);
    this.scrollAtPress = await this.ev(() => Math.round(scrollY));
    const b = await el.boundingBox(); if (!b) return false;
    const x = b.x + Math.min(b.width / 2, 60), y = b.y + b.height / 2;
    if (this.D.input === 'tap') await this.p.touchscreen.tap(x, y); else await this.p.mouse.click(x, y);
    return true;
  }
  async key(k) { await this.p.keyboard.press(k); }
  // Back, the way the device does it. Returns what happened: 'page' (the app handled it), 'history', 'exit'
  async back() {
    if (this.tv) {
      const r = TV_BACK_JS ? await this.ev((js) => (0, eval)(js), TV_BACK_JS) : false;
      if (r === true) return 'page';
      const can = await this.ev(() => history.length > 1 && !!sessionStorage.getItem('jc:nav'));
      if (can) { await this.p.goBack({ waitUntil: 'commit', timeout: 4000 }).catch(() => {}); return 'history'; }
      return 'exit';
    }
    if (this.D.input === 'tap') {
      // the Android app: WebView.goBack() when there is history, otherwise the app closes. A history step inside the
      // page fires popstate; a step out of the app's first page leaves it (the app would have closed instead)
      const n0 = await this.ev(() => { if (!window.__jcPop) { window.__jcPop = 0; addEventListener('popstate', () => window.__jcPop++); } return window.__jcPop; });
      const url0 = this.p.url();
      await this.ev(() => history.back()).catch(() => {});
      await this.p.waitForTimeout(500);
      const n1 = await this.ev(() => window.__jcPop).catch(() => null);
      if (n1 === null || !this.p.url().startsWith(APP.replace(/\/$/, ''))) { await this.p.goto(url0).catch(() => {}); await this.p.waitForTimeout(4000); return 'exit'; }
      return n1 > n0 ? 'history' : 'exit';
    }
    await this.p.keyboard.press('Escape'); return 'page';
  }
  async state() {
    return this.ev(() => ({ view: window.S && S.view, panels: __jc.panels(), floating: __jc.floating(), layers: __jc.layers(), top: __jc.top(), scrollY: Math.round(scrollY),
      look: __jc.marks().slice(0, 30).map((m) => m.k.slice(0, 30)).join('|'), focus: __jc.focus(), menu: document.documentElement.classList.contains('ezb-menu-open'), player: !!document.getElementById('player') && !document.getElementById('player').hidden }));
  }
  // records one step and checks it. act(): what the person does. Returns the state after the step settled.
  async step(label, act, { settle = 1400, watch = 2600, video = false, expect } = {}) {
    const t0 = Date.now();
    await this.ev(() => { __jc.long.length = 0; __jc.errs.length = 0; __jc.rec(9000); });
    this.pageErrs.length = 0;
    const before = await this.state();
    let did;
    try { did = await act(); } catch (e) { did = 'error: ' + e.message.split('\n')[0]; }
    if (did === false || (typeof did === 'string' && did.startsWith('error'))) { report(label, 'SKIP', '', did || 'nothing to press here (data did not load?)'); return null; }
    await this.p.waitForTimeout(settle);
    // wait for running animations to end (max 2.5 s more), then watch the settled screen
    await this.p.waitForFunction(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity).length === 0, null, { timeout: 2500 }).catch(() => {});
    const m1 = await this.ev(() => __jc.marks().map(({ el, ...r }) => r));
    await this.p.waitForTimeout(watch);
    const m2 = await this.ev(() => __jc.marks().map(({ el, ...r }) => r));
    const after = await this.state();
    const fails = [];
    // settle: the same items, moved or reworded
    const idx = new Map(); for (const m of m1) { const k = m.k + '|' + m.w; if (!idx.has(k)) idx.set(k, m); }
    const moved = [], swapped = [];
    const seen = new Set();
    for (const m of m2) {
      const k = m.k + '|' + m.w; if (seen.has(k)) continue; seen.add(k); const o = idx.get(k); if (!o) continue;
      const d = Math.max(Math.abs(o.x - m.x), Math.abs(o.y - m.y)); if (d > 2) moved.push(`${m.k} moved ${d} px`);
    }
    // words: compare by position (the same place on the page now says something else)
    const pos = new Map(); for (const m of m1) pos.set(`${m.x},${m.y},${m.w},${m.h}`, m);
    for (const m of m2) { const o = pos.get(`${m.x},${m.y},${m.w},${m.h}`); if (o && o.tx !== m.tx && o.k.split(' ')[0] === m.k.split(' ')[0] && !/^img/.test(m.k)) swapped.push(`"${o.tx}" became "${m.tx}"`); }
    if (moved.length) fails.push(['settle', `after settling, ${moved.length} item(s) moved by themselves: ${moved.slice(0, 3).join('; ')}`]);
    if (swapped.length) fails.push(['settle', `after settling, words changed under the user: ${swapped.slice(0, 3).join('; ')}`]);
    // frames: double exposure and the picture
    const fr = await this.ev(() => __jc.frames || []);
    if (process.env.JC_DUMP) console.log(label, JSON.stringify(fr.filter((_, i) => i % 8 === 0).map((f) => [Math.round(f.t), f.L.map((l) => `${l.id}:${l.o}`).join(' '), f.v && `${f.v.t.toFixed(1)}/${f.v.o}/${f.v.covered}`])));
    let dbl = 0, dblAt = null, dblRun = 0, lastT = 0;
    for (const f of fr) {
      const half = f.L.filter((l) => l.o > 0.15 && l.o < 0.85 && l.id !== 'app');
      const two = half.length >= 2 || (half.length >= 1 && f.L.filter((l) => l.id !== 'app' && l.o >= 0.85 && l.z > (half[0].z || 0)).length === 0 && f.L.filter((l) => l.id !== 'app' && l !== half[0] && l.o > 0.15).length >= 1);
      if (two) { dblRun += f.t - lastT; if (dblRun > dbl) { dbl = dblRun; dblAt = f; } } else dblRun = 0;
      lastT = f.t;
    }
    if (dbl > 450) fails.push(['double', `two pages showed through each other for ${Math.round(dbl)} ms (${dblAt.L.map((l) => `${l.id} ${Math.round(l.o * 100)}%`).join(', ')})`]);
    if (video) {
      let hidden = 0, run = 0, prev = null, worst = null;
      for (const f of fr) { const v = f.v; if (!v) { prev = null; continue; }
        const sounding = prev && !v.paused && v.t > prev.t + 0.01 && !v.muted && v.vol > 0;
        const unseen = v.o < 0.5 || v.covered;
        if (sounding && unseen) { run += f.t - prev.ft; if (run > hidden) { hidden = run; worst = v; } } else run = 0;
        prev = { t: v.t, ft: f.t };
      }
      if (hidden > 400) fails.push(['picture', `sound played for ${Math.round(hidden)} ms while the picture was ${worst.covered ? 'covered by ' + worst.covered : 'hidden (' + Math.round(worst.o * 100) + '% visible)'}`]);
    }
    // errors, long tasks, overflow, spinners, blocked taps
    const errs = [...this.pageErrs, ...(await this.ev(() => __jc.errs.splice(0)))];
    if (errs.length) fails.push(['errors', [...new Set(errs)].slice(0, 2).join(' | ')]);
    const long = await this.ev(() => __jc.long.slice());
    const worstLong = long.reduce((a, l) => Math.max(a, l.d), 0);
    if (worstLong > 1000) fails.push(['frozen', `the page froze for ${Math.round(worstLong)} ms (CPU slowed ${this.D.cpu}x)`]);
    const wide = await this.ev(() => __jc.wide());
    if (wide > 2) fails.push(['wide', `the page is ${wide} px wider than the screen`]);
    if (!this.tv) { const bl = await this.ev(() => __jc.blocked()); if (bl.length) fails.push(['blocked', bl.slice(0, 2).join('; ')]); }
    if (Date.now() - t0 > 12000 || watch >= 9000) { const sp = await this.ev(() => __jc.spinners()); if (sp.length) fails.push(['stuck', `still loading after ${Math.round((Date.now() - t0) / 1000)} s: ${sp.join(', ')}`]); }
    if (this.tv && !after.player) { if (!after.focus.ok) fails.push(['focus', `${after.focus.why}${after.focus.el ? ' (' + after.focus.el + ')' : ''}`]); }
    if (expect) { const e = expect(after, before); if (e) fails.push(['return', e]); }
    await this.finish(label, fails, t0);
    this.last = after;
    return after;
  }
  async finish(label, fails, t0) {
    let sheet = '';
    if (fails.length || VERBOSE) sheet = this.sheet(label, t0);
    if (!fails.length) report(label, 'PASS', '', '');
    for (const [check, msg] of fails) report(label, 'FAIL', check, msg, sheet);
  }
  sheet(label, t0) {
    const fr = this.shots.filter((s) => s.t >= t0 - 300);
    if (!fr.length) return '';
    const dir = path.join(OUT, 'frames', `${this.dev}-${curJourney}-${label.replace(/[^a-z0-9]+/gi, '-')}`);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const pick = fr.length > 48 ? fr.filter((_, i) => i % Math.ceil(fr.length / 48) === 0) : fr;
    pick.forEach((s, i) => fs.writeFileSync(path.join(dir, `${String(i).padStart(3, '0')}.jpg`), Buffer.from(s.data, 'base64')));
    const out = dir + '.jpg';
    try { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%03d.jpg'), '-vf', `scale=${this.dev === 'phone' ? 160 : 240}:-1,tile=8x6:padding=2`, '-frames:v', '1', out]); return path.relative(process.cwd(), out); } catch (e) { return path.relative(process.cwd(), dir); }
  }
  /* TV: every arrow from the current state, then put the highlight back */
  async remoteSweep(label) {
    if (!this.tv) return;
    const st = await this.state(); if (st.player) return;
    const t0 = Date.now(); const fails = [];
    if (!st.focus.ok) { fails.push(['focus', `${st.focus.why}${st.focus.el ? ' (' + st.focus.el + ')' : ''}`]); await this.finish(label + ' remote', fails, t0); return; }
    const start = st.focus.el;
    for (const dir of ['up', 'down', 'left', 'right']) {
      const way = await this.ev((d) => __jc.towards(d), dir);
      await this.ev(() => { window.__jcMark = document.activeElement; });
      await this.key('Arrow' + dir[0].toUpperCase() + dir.slice(1));
      await this.p.waitForTimeout(450);
      const now = await this.ev(() => ({ f: __jc.focus(), same: document.activeElement === window.__jcMark, panels: __jc.panels(), view: window.S && S.view }));
      if (!now.f.ok) fails.push(['focus', `after ${dir}: ${now.f.why}${now.f.el ? ' (' + now.f.el + ')' : ''}`]);
      else if (now.same && way.length && !(st.focus.el.startsWith('input') && (dir === 'left' || dir === 'right'))) fails.push(['deadkey', `${dir} did nothing on ${start}, although ${way[0]} lies that way`]);
      // back to where we were
      await this.ev(() => { const m = window.__jcMark; if (m && m.isConnected && typeof Nav !== 'undefined') Nav.focus(m, true); });
      await this.p.waitForTimeout(250);
    }
    await this.finish(label + ' remote', fails, t0);
  }
  /* Back from the current state: something must close, the app must not close while something is open, and on TV the
     highlight goes back to what opened it */
  async backStep(label, { expectPanel, scrollBefore, opener } = {}) {
    const before = await this.state();
    const t0 = Date.now(); let how = '';
    const res = await this.step(label, async () => { how = await this.back(); return true; }, { settle: 1100, watch: 1600 });
    if (!res) return null;
    const fails = [];
    const openBefore = before.panels.length + before.floating.length + (before.menu ? 1 : 0);
    if (how === 'exit' && openBefore) fails.push(['back', `Back would close the app while ${[...before.panels, ...before.floating, ...(before.menu ? ['the Menu'] : [])].slice(0, 2).join(', ')} was open`]);
    const same = JSON.stringify([before.panels, before.floating, before.menu, before.view, before.player, before.look]) === JSON.stringify([res.panels, res.floating, res.menu, res.view, res.player, res.look]);
    if (same && openBefore && how !== 'exit') fails.push(['back', `Back did nothing (${[...before.panels, ...before.floating].slice(0, 2).join(', ') || before.view} stayed open)`]);
    if (expectPanel && res.panels.includes(expectPanel)) fails.push(['back', `Back did not close ${expectPanel}`]);
    if (this.tv && opener && !res.player && res.focus.ok && !res.panels.length && res.focus.el !== opener) fails.push(['back', `after Back the highlight is on ${res.focus.el}, not on ${opener} that opened it`]);
    if (scrollBefore != null && !this.tv && !res.panels.length && Math.abs(res.scrollY - scrollBefore) > 4) fails.push(['return', `after Back the page is scrolled to ${res.scrollY} px, it was at ${scrollBefore} px`]);
    if (fails.length) await this.finish(label + ' (Back)', fails, t0);
    return res;
  }
}

/* ---------- the journeys ---------- */
const POSTER = '#view-home .rail > .card[data-id^="tt"], #homeRows .rail > .card[data-id^="tt"]';
async function homeTo(r) { // back to a clean Home
  await r.ev(() => { try { for (let i = 0; i < 6 && typeof back === 'function' && (__jc.panels().length || document.documentElement.classList.contains('ezb-menu-open')); i++) back(); if (window.S && S.view !== 'home') go('home'); scrollTo(0, 0); } catch (e) { /* keep */ } });
  await r.p.waitForTimeout(1500);
}
async function openSeed(r, id, type) { // puts a card for a known title at the top of Home, so every run opens the same thing
  return r.ev(async ([id, type]) => {
    let m = null; try { m = remember(await engine.fetchMeta(type, id)); } catch (e) { return false; }
    if (!m) return false;
    const old = document.getElementById('jcRow'); if (old) old.remove();
    const sec = rowShell('Journey', '', { id: 'jcRow' }); document.querySelector('#homeRows').prepend(sec);
    fillRail(sec, cardHTML(m, {})); scrollTo(0, 0); return true;
  }, [id, type]);
}
const J = {
  async home(r) {
    await r.step('home settles', async () => { await r.p.waitForTimeout(300); return true; }, { watch: 3000 });
    await r.remoteSweep('home');
    await r.step('scroll down', async () => { if (r.tv) { for (let i = 0; i < 4; i++) { await r.key('ArrowDown'); await r.p.waitForTimeout(500); } } else await r.p.mouse.wheel(0, 1400); return true; }, { watch: 3000 });
    await r.remoteSweep('home scrolled');
  },
  async title(r) {
    await homeTo(r);
    if (!(await openSeed(r, 'tt0111161', 'movie'))) return report('open film', 'SKIP', '', 'catalog did not load');
    await r.p.waitForTimeout(1200);
    let sy = null;
    const st = await r.step('open film', async () => { const ok = await r.press('#jcRow [data-card]'); sy = r.scrollAtPress; return ok; });
    if (!st) return;
    const opener = r.opener;
    await r.remoteSweep('film page');
    await r.step('scroll film page', async () => { if (r.tv) { for (let i = 0; i < 3; i++) { await r.key('ArrowDown'); await r.p.waitForTimeout(500); } } else await r.ev(() => { const d = document.querySelector('#detail .d-scroll, #detailPanel, #detail'); (d.scrollHeight > d.clientHeight + 20 ? d : document.scrollingElement).scrollBy(0, 700); }); return true; });
    await r.remoteSweep('film page scrolled');
    await r.backStep('leave film', { expectPanel: 'detail', scrollBefore: sy, opener });
  },
  async series(r) {
    await homeTo(r);
    if (!(await openSeed(r, 'tt0903747', 'series'))) return report('open series', 'SKIP', '', 'catalog did not load');
    await r.p.waitForTimeout(1200);
    const st = await r.step('open series', () => r.press('#jcRow [data-card]'));
    if (!st) return;
    const opener = r.opener;
    await r.remoteSweep('series page');
    for (const n of [1, 2, 0]) {
      const ok = await r.ev(() => !!document.querySelector('#dSeasons button, #dSeasons [data-season], #dSeasons select, #dSeasons .chip'));
      if (!ok) { report('switch season', 'SKIP', '', 'no season picker'); break; }
      await r.step(`season ${n + 1}`, async () => {
        const sel = await r.ev(() => !!document.querySelector('#dSeasons select'));
        if (sel) { await r.ev((i) => { const s = document.querySelector('#dSeasons select'); s.selectedIndex = Math.min(i, s.options.length - 1); s.dispatchEvent(new Event('change', { bubbles: true })); }, n); return true; }
        return r.press('#dSeasons button, #dSeasons [data-season], #dSeasons .chip', { nth: n });
      });
    }
    await r.remoteSweep('series seasons');
    const ep = await r.step('open episode', () => r.press('#detail .ep, #detail [data-ep], #detail [data-video]'));
    if (ep) {
      await r.remoteSweep('episode');
      await r.backStep('leave episode', { expectPanel: 'epSheet' });
    }
    await r.backStep('leave series', { expectPanel: 'detail', opener });
  },
  async play(r) {
    await homeTo(r);
    if (!(await openSeed(r, 'tt0111161', 'movie'))) return report('play', 'SKIP', '', 'catalog did not load');
    await r.p.waitForTimeout(1200);
    if (!(await r.step('open film', () => r.press('#jcRow [data-card]')))) return;
    // the sources from the test addon
    await r.p.waitForFunction(() => [...document.querySelectorAll('#detail button, #detail [data-src], #detail .src, #detail .stream')].some((b) => /Journey|Test 1080p|1080p/i.test(b.textContent)), null, { timeout: 15000 }).catch(() => {});
    const hasSrc = await r.ev(() => [...document.querySelectorAll('#detail [data-src], #detail .src, #detail .stream, #detail button')].some((b) => /Journey|Test 1080p/i.test(b.textContent) && b.getClientRects().length));
    await r.remoteSweep('sources');
    const play = await r.step('play', async () => {
      if (hasSrc) { const ok = await r.ev(() => { const b = [...document.querySelectorAll('#detail .stream[data-si], #detail [data-src]')].find((x) => /Test 1080p/i.test(x.textContent) && x.getClientRects().length); if (!b) return false; b.setAttribute('data-jc-src', '1'); return true; }); if (ok) return r.press('[data-jc-src]'); }
      return r.press('#dSmart');
    }, { settle: 2500, watch: 6000, video: true });
    if (!play) return;
    const v = await r.ev(() => __jc.video());
    if (!play.player) { report('play', 'FAIL', 'picture', `the player did not open (${await r.ev(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent.trim()).join(' | ').slice(0, 120))})`, r.sheet('play-not-open', Date.now() - 9000)); return; }
    if (!v || v.t < 1) report('play', 'FAIL', 'picture', `the film did not start (${v ? `at ${v.t.toFixed(1)} s, ready ${v.rs}` : 'no video'})`);
    await r.step('seek forward', async () => { await r.key(r.tv ? 'ArrowRight' : 'l'); await r.p.waitForTimeout(300); await r.key(r.tv ? 'ArrowRight' : 'l'); return true; }, { settle: 1500, watch: 2500, video: true });
    await r.step('pause and play', async () => { await r.key(' '); await r.p.waitForTimeout(800); await r.key(' '); return true; }, { settle: 800, watch: 1500, video: true });
    // audio and subtitles
    const sub = await r.step('open audio and subtitles', async () => {
      const ok = await r.ev(() => !!document.querySelector('#pSubs, #pDsp, #pOpts, #subBtn'));
      if (!ok) return false;
      if (!r.tv) { await r.p.mouse.move(300, 300, { steps: 4 }); await r.p.mouse.move(420, 380, { steps: 4 }); await r.ev(() => { try { wakeHud(); } catch (e) { /* none */ } }); await r.p.waitForTimeout(300); }
      return r.press('#pSubs, #pDsp, #pOpts, #subBtn');
    }, { video: true });
    if (sub) {
      await r.remoteSweep('audio and subtitles');
      await r.step('pick a subtitle', async () => { const ok = await r.ev(() => { const b = [...document.querySelectorAll('#subMenu button, #subMenu [data-sub], .drawer.open button')].find((x) => /English|Spanish|eng|spa/i.test(x.textContent) && x.getClientRects().length); if (!b) return false; b.setAttribute('data-jc-sub', '1'); return true; }); return ok ? r.press('[data-jc-sub]') : false; }, { video: true });
      await r.backStep('close audio and subtitles');
    }
    await r.backStep('leave player', { expectPanel: 'player' });
    await r.backStep('leave film after playing', { expectPanel: 'detail' });
  },
  async search(r) {
    await homeTo(r);
    const st = await r.step('open search', async () => { if (r.tv) { await r.ev(() => openPalette()); return true; } return r.press('#openPalette, #mkPillSearch, [data-act="search"], button[aria-label="Search"]'); });
    if (!st) return;
    await r.step('type a search', async () => { await r.p.keyboard.type('matrix', { delay: 60 }); return true; }, { settle: 2500, watch: 3000 });
    await r.remoteSweep('search results');
    const res = await r.step('open a result', () => r.press('#palRes [data-pi]:not(.status)'));
    if (res) await r.backStep('leave result', { expectPanel: 'detail' });
    await r.backStep('leave search', { expectPanel: 'palette' });
  },
  async settings(r) {
    await homeTo(r);
    // the way a person gets there: the Menu, then Settings
    const st = await r.step('open settings', async () => {
      if (!(await r.press('#ezbMenuB, #mkPillMenu, #ezbMenuP'))) return false;
      await r.p.waitForTimeout(900);
      return r.press('#ezbMenu [data-mk="#openSettings"], #ezbMenu [data-mk="settings"]');
    });
    if (!st) return;
    await r.remoteSweep('settings');
    const n = await r.ev(() => document.querySelectorAll('#settings nav button, #settings [data-sec], #settings .set-tabs button').length);
    for (let i = 0; i < Math.min(n, 6); i++) {
      await r.step(`settings section ${i + 1}`, () => r.press('#settings [data-sec]', { nth: i }), { settle: 900, watch: 1500 });
      if (r.dev === 'phone') await r.backStep(`settings section ${i + 1} back`);
    }
    await r.remoteSweep('settings section');
    await r.backStep('leave settings', { expectPanel: 'settings' });
  },
  async menu(r) {
    await homeTo(r);
    const has = await r.ev(() => !!document.querySelector('#ezbMenuB, #mkPillMenu'));
    if (!has) return report('open menu', 'SKIP', '', 'no Menu button');
    const st = await r.step('open menu', () => r.press('#ezbMenuB, #mkPillMenu'));
    if (!st) return;
    await r.remoteSweep('menu');
    await r.backStep('close menu');
    for (const v of ['movie', 'series', 'tv', 'library']) {
      await r.step(`section ${v}`, async () => { await r.ev((x) => go(x), v); return true; }, { settle: 1800, watch: 2500 });
      await r.remoteSweep(`section ${v}`);
    }
    await r.step('section home', async () => { await r.ev(() => go('home')); return true; });
  },
  async live(r) {
    await homeTo(r);
    const st = await r.step('open live tv', async () => { await r.ev(() => go('tv')); return true; }, { settle: 2500, watch: 3000 });
    if (!st) return;
    await r.remoteSweep('live tv');
    await r.backStep('leave live tv');
  },
  async library(r) {
    await homeTo(r);
    await r.step('open library', async () => { await r.ev(() => go('library')); return true; });
    await r.remoteSweep('library');
    await r.backStep('leave library');
  },
  async party(r) {
    await homeTo(r);
    const ok = await r.ev(() => typeof Party !== 'undefined' && !!document.getElementById('partyLayer'));
    if (!ok) return report('watch party', 'SKIP', '', 'no watch party');
    const st = await r.step('open watch party', async () => { await r.ev(() => { if (Party.open) Party.open(); else openLayer('partyLayer'); }); return true; });
    if (!st) return;
    await r.remoteSweep('watch party');
    await r.backStep('leave watch party', { expectPanel: 'partyLayer' });
  },
};

for (const dev of DEVS) {
  curDev = dev; curJourney = 'start';
  let r;
  try { r = await new Run(dev).open(); } catch (e) { report('open app', 'FAIL', 'errors', e.message.split('\n')[0]); continue; }
  const ready = await r.ev(() => !!document.querySelector('#homeRows .card, #view-home .rail .card'));
  if (!ready) {
    // only an unreachable catalog is a SKIP; a catalog that answers while Home stays empty is a broken app
    const up = await r.ev(async () => { try { const x = await fetch('https://v3-cinemeta.strem.io/catalog/movie/top.json'); return x.ok; } catch (e) { return false; } }).catch(() => false);
    report('open app', up ? 'FAIL' : 'SKIP', up ? 'errors' : '', up ? 'Home showed no titles although the catalog answers' : 'Home did not load (catalog offline)', up ? r.sheet('open-app', Date.now() - 45000) : '');
    await r.close(); continue;
  }
  for (const j of JOURNEYS) {
    curJourney = j;
    if (!J[j]) { report(j, 'SKIP', '', 'no such journey'); continue; }
    try { await J[j](r); } catch (e) { report(j, 'FAIL', 'errors', `the test itself broke: ${e.message.split('\n')[0]}`); }
  }
  await r.close();
}
await browser.close(); server.close();
const fails = results.filter((x) => x.status === 'FAIL');
console.log(`\njourney check: ${results.filter((x) => x.status === 'PASS').length} steps pass, ${fails.length} problems, ${results.filter((x) => x.status === 'SKIP').length} skipped`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ when: new Date().toISOString(), target: LIVE ? target : 'local', results }, null, 1));
process.exit(fails.length ? 1 : 0);
