#!/usr/bin/env node
/**
 * MKCinema companion server
 *
 *   1. A Stremio addon built with stremio-addon-sdk that adds official YouTube trailers
 *      (from Cinemeta metadata) as a stream source. It ships no titles or media of its own.
 *   2. GET /proxy?url=<encoded>&headers=<base64 JSON>
 *      A CORS-open media proxy that forwards Range requests, passes 206 / Content-Range
 *      back to the browser, injects behaviorHints.proxyHeaders.request headers, and
 *      rewrites HLS playlists so every child playlist, key and segment goes through it too.
 *   3. Serves index.html (the MKCinema app) at / when it sits next to this file, plus its
 *      install files (manifest.webmanifest, sw.js, icons).
 *   4. GET /remux?url=&t=  (needs ffmpeg) audio rescue: copies the video and converts EAC3/AC3/DTS/TrueHD
 *      audio to stereo AAC in a fragmented MP4 browsers can play. /remux/probe reports duration and codecs,
 *      /remux/seek finds the keyframe a seek really starts on.
 *   5. /debrid?url=  a relay for debrid APIs that browsers block (only their API hosts, nothing stored).
 *
 *   npm install
 *   node mkcinema-server.js
 *
 * Environment:
 *   PORT=7000                  listen port
 *   HOST=127.0.0.1             bind address (use 0.0.0.0 to reach it from a TV or phone on your LAN)
 *   PROXY_ALLOW_PRIVATE=1      let /proxy reach private-network addresses (off by default to prevent SSRF)
 *   PROXY_ALLOW_HOSTS=a.com,b  optional allowlist of upstream hostnames for /proxy
 *   SUPABASE_URL, SUPABASE_ANON_KEY   optional; handed to the app at /config.json for sign-in
 */
'use strict';

const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const net = require('net');
const { Readable } = require('stream');
const { spawn, spawnSync } = require('child_process');
const express = require('express');
const cors = require('cors');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');

let fetchImpl;
try { fetchImpl = require('node-fetch'); } catch (e) { fetchImpl = globalThis.fetch; }

// Optional .env next to this file (KEY=value per line). Real environment variables win.
(() => {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();
if (/^sb_secret_/.test(process.env.SUPABASE_ANON_KEY || '')) {
  console.error('SUPABASE_ANON_KEY is a secret key. Use the publishable (anon) key; it is sent to every browser.');
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 7000;
const HOST = process.env.HOST || '127.0.0.1';
const ALLOW_PRIVATE = process.env.PROXY_ALLOW_PRIVATE === '1';
const ALLOW_HOSTS = (process.env.PROXY_ALLOW_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const VERSION = '2.5.0';
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 MKCinema/1.0';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const HAS_FFMPEG = (() => { try { return spawnSync(FFMPEG, ['-version'], { timeout: 4000 }).status === 0; } catch (e) { return false; } })();
const MAX_REMUX = Number(process.env.MAX_REMUX) || 3;
let remuxRunning = 0;

/* ------------------------------------------------------------------ *
 * Addon (stremio-addon-sdk): official trailers only. The server ships
 * no titles or media of its own.
 * ------------------------------------------------------------------ */
const manifest = {
  id: 'org.mkcinema.server',
  version: VERSION,
  name: 'MKCinema Trailers',
  description: 'Official YouTube trailers from Cinemeta metadata, as a stream source. Runs alongside the MKCinema stream proxy.',
  resources: [{ name: 'stream', types: ['movie', 'series'], idPrefixes: ['tt'] }],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
  behaviorHints: { configurable: false, configurationRequired: false },
};

const builder = new addonBuilder(manifest);

const metaCache = new Map();
async function cinemetaMeta(type, id) {
  const key = `${type}/${id}`;
  const hit = metaCache.get(key);
  if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.meta;
  const r = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${encodeURIComponent(id)}.json`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Cinemeta HTTP ${r.status}`);
  const { meta } = await r.json();
  metaCache.set(key, { t: Date.now(), meta });
  return meta;
}

builder.defineStreamHandler(async ({ type, id }) => {
  const base = String(id).split(':')[0];
  if (!/^tt\d+$/.test(base)) return { streams: [] };
  const streams = [], seen = new Set();
  try {
    const meta = await cinemetaMeta(type, base);
    for (const t of (meta && meta.trailerStreams) || []) {
      if (t.ytId && !seen.has(t.ytId)) { seen.add(t.ytId); streams.push({ name: 'Trailer', title: `${t.title || meta.name}\nOfficial trailer · YouTube`, ytId: t.ytId }); }
    }
    for (const t of (meta && meta.trailers) || []) {
      if (t.source && !seen.has(t.source)) { seen.add(t.source); streams.push({ name: 'Trailer', title: `${meta.name} · ${t.type || 'Trailer'}\nOfficial trailer · YouTube`, ytId: t.source }); }
    }
  } catch (e) { /* Cinemeta unreachable: no trailers */ }
  return { streams, cacheMaxAge: 6 * 3600 };
});

const addonInterface = builder.getInterface();

/* ------------------------------------------------------------------ *
 * Proxy helpers
 * ------------------------------------------------------------------ */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

async function checkTarget(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { throw Object.assign(new Error('url is not a valid absolute URL'), { status: 400 }); }
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('only http and https upstreams are allowed'), { status: 400 });
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (ALLOW_HOSTS.length && !ALLOW_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) throw Object.assign(new Error(`host ${host} is not in PROXY_ALLOW_HOSTS`), { status: 403 });
  if (!ALLOW_PRIVATE) {
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw Object.assign(new Error(`cannot resolve ${host}`), { status: 502 }); });
    if (addrs.some((a) => isPrivateIp(a.address))) throw Object.assign(new Error('private network targets are blocked (set PROXY_ALLOW_PRIVATE=1 to allow)'), { status: 403 });
  }
  return u;
}

function decodeHeaders(param) {
  if (!param) return {};
  try {
    const obj = JSON.parse(Buffer.from(String(param), 'base64').toString('utf8'));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    // Accept either a flat header map or a full proxyHeaders object ({ request, response })
    const req = obj.request && typeof obj.request === 'object' ? obj.request : obj;
    const out = {};
    for (const [k, v] of Object.entries(req)) {
      if (typeof v !== 'string' || /[\r\n]/.test(k + v)) continue;
      if (/^(host|connection|content-length|transfer-encoding)$/i.test(k)) continue;
      out[k] = v;
    }
    return out;
  } catch (e) { return {}; }
}
function decodeResponseHeaders(param) {
  if (!param) return {};
  try {
    const obj = JSON.parse(Buffer.from(String(param), 'base64').toString('utf8'));
    return obj && obj.response && typeof obj.response === 'object' ? obj.response : {};
  } catch (e) { return {}; }
}

const isPlaylist = (contentType, finalUrl) =>
  /mpegurl|vnd\.apple\.mpegurl/i.test(contentType || '') || /\.m3u8?(\?|$)/i.test(new URL(finalUrl).pathname);

/* Rewrite every URI inside an HLS playlist so it resolves against the upstream
   playlist URL and routes back through /proxy with the same headers. */
function rewritePlaylist(text, playlistUrl, proxyBase, headersParam) {
  const wrap = (ref) => {
    let abs;
    try { abs = new URL(ref, playlistUrl).href; } catch (e) { return ref; }
    return `${proxyBase}/proxy?url=${encodeURIComponent(abs)}${headersParam ? `&headers=${encodeURIComponent(headersParam)}` : ''}`;
  };
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) {
      // EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA, EXT-X-I-FRAME-STREAM-INF, EXT-X-SESSION-KEY, EXT-X-PRELOAD-HINT, EXT-X-PART ...
      return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${wrap(u)}"`);
    }
    return wrap(t);
  }).join('\n');
}

const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag', 'cache-control', 'expires', 'content-disposition'];

/* ------------------------------------------------------------------ *
 * HTTP server
 * ------------------------------------------------------------------ */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cors({ origin: '*', exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type', 'X-MKC-Relay', 'X-Remux-Start'] }));

app.get('/health', (req, res) => res.json({ ok: true, name: 'MKCinema proxy', version: VERSION, remux: HAS_FFMPEG, addon: `${req.protocol}://${req.get('host')}/manifest.json` }));

// Optional Supabase settings for the app, from the environment. The anon key is public by design.
app.get('/config.json', (req, res) => res.json({
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
}));

// Stremio account import: some browsers block calling api.strem.io directly, so the app can relay through here.
// Only these read-only methods (plus login/logout) are forwarded, only to api.strem.io, and nothing is logged or stored.
const STREMIO_METHODS = new Set(['login', 'logout', 'datastoreGet', 'addonCollectionGet']);
app.post('/stremio-api/:method', express.json({ limit: '64kb' }), async (req, res) => {
  if (!STREMIO_METHODS.has(req.params.method)) return res.status(404).json({ error: { message: 'unsupported method' } });
  try {
    const r = await fetch(`https://api.strem.io/api/${req.params.method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.body || {}), signal: AbortSignal.timeout(20000) });
    res.status(r.status).type('application/json').send(await r.text());
  } catch (e) { res.status(502).json({ error: { message: `Could not reach Stremio (${e.message})` } }); }
});

app.options('/proxy', (req, res) => res.sendStatus(204));
app.get('/proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'missing url parameter' });
  let upstreamUrl;
  try { upstreamUrl = await checkTarget(String(target)); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

  const headersParam = req.query.headers ? String(req.query.headers) : '';
  const injected = decodeHeaders(headersParam);
  const forced = decodeResponseHeaders(headersParam);
  const fwd = { 'User-Agent': DEFAULT_UA, Accept: req.get('accept') || '*/*', 'Accept-Encoding': 'identity', ...injected };
  if (req.get('range')) fwd.Range = req.get('range');
  if (req.get('if-range')) fwd['If-Range'] = req.get('if-range');

  const ctl = new AbortController();
  req.on('close', () => { if (!res.writableEnded) ctl.abort(); });

  let up;
  try {
    up = await fetchImpl(upstreamUrl.href, { headers: fwd, redirect: 'follow', signal: ctl.signal });
  } catch (e) {
    if (ctl.signal.aborted) return;
    return res.status(502).json({ error: `upstream request failed: ${e.message}` });
  }

  const finalUrl = up.url || upstreamUrl.href;
  const contentType = up.headers.get('content-type') || '';
  const proxyBase = `${req.protocol}://${req.get('host')}`;

  try {
    if (isPlaylist(contentType, finalUrl) && up.status < 400 && !fwd.Range) {
      const text = await up.text();
      if (text.trimStart().startsWith('#EXTM3U')) {
        res.status(up.status);
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache');
        for (const [k, v] of Object.entries(forced)) res.set(k, String(v));
        return res.send(rewritePlaylist(text, finalUrl, proxyBase, headersParam));
      }
      res.status(up.status).set('Content-Type', contentType || 'text/plain');
      return res.send(text);
    }

    res.status(up.status);
    for (const h of PASS_HEADERS) { const v = up.headers.get(h); if (v) res.set(h, v); }
    if (!up.headers.get('accept-ranges') && up.status === 206) res.set('Accept-Ranges', 'bytes');
    for (const [k, v] of Object.entries(forced)) res.set(k, String(v));

    if (!up.body) return res.end();
    const body = typeof up.body.pipe === 'function' ? up.body : Readable.fromWeb(up.body);
    body.on('error', () => { if (!res.headersSent) res.status(502); res.end(); });
    body.pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: `proxy failed: ${e.message}` });
    else res.end();
  }
});

/* ------------------------------------------------------------------ *
 * Audio rescue: on-the-fly remux with ffmpeg
 * ------------------------------------------------------------------ */
// ffmpeg takes request headers as one CRLF-separated string
const ffHeaders = (h) => { const parts = Object.entries(h).filter(([k]) => !/^user-agent$/i.test(k)).map(([k, v]) => `${k}: ${v}\r\n`); return parts.length ? ['-headers', parts.join('')] : []; };
const ffAgent = (h) => ['-user_agent', Object.entries(h).find(([k]) => /^user-agent$/i.test(k))?.[1] || DEFAULT_UA];

app.get('/remux/probe', async (req, res) => {
  if (!HAS_FFMPEG) return res.status(501).json({ error: 'ffmpeg is not installed on this server' });
  let u; try { u = await checkTarget(String(req.query.url || '')); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const h = decodeHeaders(req.query.headers);
  const p = spawn(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', ...ffAgent(h), ...ffHeaders(h), u.href], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; const kill = setTimeout(() => p.kill('SIGKILL'), 25000);
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => {
    clearTimeout(kill);
    if (code !== 0) return res.status(502).json({ error: (err.trim().split('\n').pop() || 'ffprobe failed').slice(0, 300) });
    try {
      const j = JSON.parse(out), v = (j.streams || []).find((s) => s.codec_type === 'video'), a = (j.streams || []).filter((s) => s.codec_type === 'audio');
      res.json({ duration: Number(j.format && j.format.duration) || null, video: v ? v.codec_name : null, audio: a.map((s) => `${s.codec_name}${s.channels ? ` ${s.channels}ch` : ''}${s.tags && s.tags.language ? ` ${s.tags.language}` : ''}`) });
    } catch (e) { res.status(502).json({ error: 'could not read ffprobe output' }); }
  });
});

/* Stream copy can only start on a keyframe. This asks the demuxer where a seek to t really lands (the first video
   packet it reads), so the client knows exactly where the converted stream begins. /remux then seeks a hair past that
   keyframe, because ffmpeg backs input seeks off by about 0.13 s and would otherwise land one keyframe earlier. */
function keyframeAt(href, t, h) {
  return new Promise((resolve) => {
    if (!(t > 0)) return resolve(0);
    const p = spawn(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,dts_time', '-of', 'csv=p=0',
      '-read_intervals', `${t.toFixed(3)}%+#1`, ...ffAgent(h), ...ffHeaders(h), href], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = ''; const kill = setTimeout(() => p.kill('SIGKILL'), 20000);
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => { clearTimeout(kill); const v = out.split('\n')[0].split(',').map(Number).find((x) => Number.isFinite(x)); resolve(Number.isFinite(v) && v <= t + 0.05 ? v : t); });
    p.on('error', () => { clearTimeout(kill); resolve(t); });
  });
}

app.get('/remux/seek', async (req, res) => {
  if (!HAS_FFMPEG) return res.status(501).json({ error: 'ffmpeg is not installed on this server' });
  let u; try { u = await checkTarget(String(req.query.url || '')); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const t = Math.max(0, Number(req.query.t) || 0);
  res.json({ start: await keyframeAt(u.href, t, decodeHeaders(req.query.headers)) });
});

app.get('/remux', async (req, res) => {
  if (!HAS_FFMPEG) return res.status(501).json({ error: 'ffmpeg is not installed on this server' });
  if (remuxRunning >= MAX_REMUX) return res.status(503).json({ error: `already converting ${MAX_REMUX} streams; try again shortly` });
  let u; try { u = await checkTarget(String(req.query.url || '')); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const t = Math.max(0, Number(req.query.t) || 0), h = decodeHeaders(req.query.headers);
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '4',
    ...(t ? ['-noaccurate_seek', '-ss', (t + 0.2).toFixed(3)] : []), ...ffAgent(h), ...ffHeaders(h), '-i', u.href,
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
    '-c:v', 'copy', ...(req.query.hevc === '1' ? ['-tag:v', 'hvc1'] : []),
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1'];
  const ff = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  remuxRunning++; let done = false, err = '';
  const finish = () => { if (done) return; done = true; remuxRunning--; try { ff.kill('SIGKILL'); } catch (e) { /* gone */ } };
  ff.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  ff.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'could not start ffmpeg' }); finish(); });
  ff.on('close', (code) => { if (code && !res.headersSent) res.status(502).json({ error: (err.trim().split('\n').pop() || `ffmpeg exited ${code}`).slice(0, 300) }); else res.end(); finish(); });
  req.on('close', finish);
  ff.stdout.once('data', () => { if (!res.headersSent) res.set({ 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'X-Remux-Start': String(t) }); });
  ff.stdout.pipe(res);
});

/* ------------------------------------------------------------------ *
 * Debrid relay: some debrid APIs block browser (CORS) calls. Only these
 * API hosts are reachable, the user's own key passes through, nothing is logged.
 * ------------------------------------------------------------------ */
const DEBRID_HOSTS = ['api.real-debrid.com', 'api.torbox.app', 'api.alldebrid.com', 'www.premiumize.me'];
app.all('/debrid', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  res.set('X-MKC-Relay', '1');
  if (req.query.ping) return res.json({ ok: true, relay: 'server' });
  let u; try { u = new URL(String(req.query.url || '')); } catch (e) { return res.status(400).json({ error: 'bad url' }); }
  if (u.protocol !== 'https:' || !DEBRID_HOSTS.includes(u.hostname)) return res.status(403).json({ error: 'only debrid API hosts are relayed' });
  const headers = {}; ['authorization', 'content-type', 'accept'].forEach((k) => { if (req.get(k)) headers[k] = req.get(k); });
  try {
    const r = await fetch(u.href, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, signal: AbortSignal.timeout(30000) });
    res.status(r.status).type(r.headers.get('content-type') || 'application/json').send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).json({ error: `debrid service unreachable (${e.message})` }); }
});

// YouTube trailer relay. A page opened from file:// sends no Referer, and YouTube refuses the embed
// with error 153. This page gives the embed a real http origin. It is a plain embed: no ad blocking.
app.get('/yt/:id', (req, res) => {
  const id = String(req.params.id);
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return res.status(400).type('text/plain').send('bad video id');
  const origin = encodeURIComponent(`${req.protocol}://${req.get('host')}`);
  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&iv_load_policy=3&origin=${origin}&widget_referrer=${origin}`;
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trailer</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="Trailer"></iframe></body></html>`);
});

// The MKCinema web app, when index.html sits next to this file, and its install files
const INDEX = path.join(__dirname, 'index.html');
const PWA_FILES = { 'manifest.webmanifest': 'application/manifest+json', 'sw.js': 'text/javascript', 'icon-192.png': 'image/png', 'icon-512.png': 'image/png', 'icon-maskable-512.png': 'image/png' };
app.get(Object.keys(PWA_FILES).map((f) => `/${f}`), (req, res, next) => {
  const name = req.path.slice(1), file = path.join(__dirname, name);
  if (!fs.existsSync(file)) return next();
  res.type(PWA_FILES[name]); if (name === 'sw.js') res.set('Cache-Control', 'no-cache'); res.sendFile(file);
});
app.get(['/', '/index.html'], (req, res, next) => {
  if (!fs.existsSync(INDEX)) return next();
  res.sendFile(INDEX);
});

// Stremio addon routes: /manifest.json, /stream/...
app.use(getRouter(addonInterface));

app.get('/', (req, res) => {
  res.type('text/plain').send(`MKCinema Server ${VERSION}\nAddon: ${req.protocol}://${req.get('host')}/manifest.json\nProxy: ${req.protocol}://${req.get('host')}/proxy?url=<encoded>&headers=<base64 JSON>\n`);
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    const shown = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
    const PUBLIC_BASE = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : `http://${shown}:${PORT}`;
    console.log(`MKCinema Server ${VERSION}`);
    console.log(`  App:    ${PUBLIC_BASE}/${fs.existsSync(INDEX) ? '' : '  (put index.html next to this file to serve the app)'}`);
    console.log(`  Addon:  ${PUBLIC_BASE}/manifest.json`);
    console.log(`  Proxy:  ${PUBLIC_BASE}/proxy?url=<encoded url>&headers=<base64 JSON>`);
    console.log(`  Accounts: ${process.env.SUPABASE_URL ? process.env.SUPABASE_URL : 'built into the app (SUPABASE_URL and SUPABASE_ANON_KEY can override)'}`);
    console.log(`  Audio rescue: ${HAS_FFMPEG ? `on (${FFMPEG})` : 'off (install ffmpeg to fix silent MKV/EAC3/DTS audio)'}`);
    if (HOST === '127.0.0.1') console.log('  Bound to localhost only. Set HOST=0.0.0.0 to reach it from other devices.');
  });
}

module.exports = { app, rewritePlaylist, decodeHeaders, isPrivateIp };
