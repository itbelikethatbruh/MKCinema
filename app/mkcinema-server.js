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
 *   4. GET /remux?url=&t=&audio=  (needs ffmpeg) audio rescue: copies the video and converts EAC3/AC3/DTS/TrueHD
 *      audio (track `audio`, default the first) to stereo AAC in a fragmented MP4 browsers can play. /remux/probe reports duration, codecs and audio tracks,
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
 *   PROXY_TOKEN=secret         optional shared secret for /proxy, /remux, /debrid and /stremio-api. Then set the app's
 *                              proxy URL to http://<host>:7000/t/<secret>, and open the app from the server once at
 *                              http://<host>:7000/t/<secret>/ (it remembers the secret in a cookie for this site)
 *   CORS_ORIGINS=a,b           extra web origins allowed to read the proxy (the MKCinema app's own sites, this server
 *                              and file:// pages are always allowed; '*' allows every site, the old behaviour)
 *   TRUST_PROXY=1              trust X-Forwarded-* headers (on by itself when PUBLIC_URL is set)
 */
'use strict';

const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const dnsCb = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
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
const PROXY_TOKEN = String(process.env.PROXY_TOKEN || '').trim();
const INTERNAL_TOKEN = crypto.randomBytes(24).toString('hex'); // ffmpeg reaches the checked proxy with this
const PUBLIC_URL = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : '';
const CORS_LIST = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
const APP_ORIGINS = new Set(['https://mkcinema.pages.dev', 'https://app.mkcinema.app', 'https://mkcinema.app', ...CORS_LIST.filter((o) => o !== '*')]);
if (PUBLIC_URL) { try { APP_ORIGINS.add(new URL(PUBLIC_URL).origin); } catch (e) { /* not a URL */ } }
let SELF_BASE = ''; // http://127.0.0.1:<port>, set once listening

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
/* SSRF guard. Every address a host resolves to is checked (IPv4, IPv6, and IPv4 inside IPv6: ::ffff:7f00:1,
   NAT64 64:ff9b::/96, 6to4 2002::/16), on every redirect hop, and again when the socket connects (the agents'
   lookup), so a DNS answer that changes between the check and the request (rebinding) is caught too. */
const BLOCK4 = new net.BlockList();
[['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]
  .forEach(([a, p]) => BLOCK4.addSubnet(a, p, 'ipv4'));
const BLOCK6 = new net.BlockList();
[['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8], ['2001:db8::', 32], ['100::', 64], ['64:ff9b:1::', 48], ['2001::', 32], ['2001:10::', 28], ['2001:20::', 28]]
  .forEach(([a, p]) => BLOCK6.addSubnet(a, p, 'ipv6'));
function v6groups(ip) {
  let s = String(ip).toLowerCase().replace(/%.*$/, '');
  const m = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) { const p = m.slice(1).map(Number); if (p.some((x) => x > 255)) return null; s = `${s.slice(0, -m[0].length)}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`; }
  const parts = s.split('::'); if (parts.length > 2) return null;
  const h = parts[0] ? parts[0].split(':') : [], t = parts.length === 2 ? (parts[1] ? parts[1].split(':') : []) : null;
  const g = t === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  if (g.length !== 8 || g.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return g.map((x) => parseInt(x, 16));
}
function embeddedV4(g) {
  const v4 = (a, b) => `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return v4(g[6], g[7]); // ::ffff:a.b.c.d, ::a.b.c.d, ::1, ::
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) return v4(g[6], g[7]); // ::ffff:0:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4(g[6], g[7]); // NAT64
  if (g[0] === 0x2002) return v4(g[1], g[2]); // 6to4
  return null;
}
function isPrivateIp(ip) {
  const a = String(ip || '').replace(/^\[|\]$/g, '');
  if (net.isIPv4(a)) return BLOCK4.check(a, 'ipv4');
  if (!net.isIPv6(a)) return true; // not an address at all: refuse
  const g = v6groups(a); if (!g) return true;
  const v4 = embeddedV4(g); if (v4) return BLOCK4.check(v4, 'ipv4');
  return BLOCK6.check(g.map((x) => x.toString(16)).join(':'), 'ipv6');
}
const blocked = () => Object.assign(new Error('private network targets are blocked (set PROXY_ALLOW_PRIVATE=1 to allow)'), { status: 403 });

async function checkTarget(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { throw Object.assign(new Error('url is not a valid absolute URL'), { status: 400 }); }
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('only http and https upstreams are allowed'), { status: 400 });
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (ALLOW_HOSTS.length && !ALLOW_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) throw Object.assign(new Error(`host ${host} is not in PROXY_ALLOW_HOSTS`), { status: 403 });
  if (!ALLOW_PRIVATE) {
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true }).catch(() => { throw Object.assign(new Error(`cannot resolve ${host}`), { status: 502 }); });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw blocked();
  }
  return u;
}

// the connect-time check: the socket only ever opens to an address that passed isPrivateIp
function guardedLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  const o = typeof options === 'number' ? { family: options } : { ...(options || {}) };
  dnsCb.lookup(hostname, { ...o, all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!ALLOW_PRIVATE && (!addrs.length || addrs.some((a) => isPrivateIp(a.address)))) return cb(Object.assign(blocked(), { code: 'EPRIVATE' }));
    if (o.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}
const httpAgent = new http.Agent({ keepAlive: true, lookup: guardedLookup });
const httpsAgent = new https.Agent({ keepAlive: true, lookup: guardedLookup });

/* fetch that checks every redirect hop itself. With node-fetch (a dependency) the guarded agents also pin the checked
   addresses; Node's built-in fetch, used only when node-fetch is missing, still gets the per-hop check. */
async function safeFetch(startUrl, opts) {
  let url = startUrl;
  for (let hop = 0; hop < 8; hop++) {
    const u = await checkTarget(url);
    const r = await fetchImpl(u.href, { ...opts, redirect: 'manual', agent: (p) => (p.protocol === 'http:' ? httpAgent : httpsAgent) });
    const loc = r.status >= 300 && r.status < 400 && r.headers.get('location');
    if (!loc) return { r, finalUrl: u.href };
    try { if (r.body && typeof r.body.resume === 'function') r.body.resume(); else if (r.body && typeof r.body.cancel === 'function') r.body.cancel(); } catch (e) { /* drained */ }
    url = new URL(loc, u.href).href;
  }
  throw Object.assign(new Error('too many redirects'), { status: 508 });
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
/* proxyHeaders.response: only a media Content-Type is taken from the caller; every other header is ignored */
function decodeResponseHeaders(param) {
  if (!param) return {};
  try {
    const obj = JSON.parse(Buffer.from(String(param), 'base64').toString('utf8'));
    const r = obj && obj.response && typeof obj.response === 'object' ? obj.response : {};
    const k = Object.keys(r).find((x) => x.toLowerCase() === 'content-type');
    return k && typeof r[k] === 'string' && SAFE_TYPE.test(r[k]) ? { 'Content-Type': r[k] } : {};
  } catch (e) { return {}; }
}

/* The proxy runs on the same origin as the app when the app is opened from this server, so it must never hand back a
   page or a script the browser would run there. Only media, subtitle, playlist, JSON, plain text and plain image types
   pass as they are; anything else becomes a download. Every reply is also sandboxed and never sniffed. */
const SAFE_TYPE = /^\s*(video\/[\w.+-]+|audio\/[\w.+-]+|application\/(vnd\.apple\.mpegurl|x-mpegurl|mpegurl|octet-stream|json|mp4|ogg|x-subrip|x-matroska|gzip|x-gzip)|text\/(vtt|plain|srt|x-ssa|x-ass)|image\/(png|jpeg|gif|webp|avif))\s*(;|$)/i;
function safeHeaders(res, type) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "sandbox; default-src 'none'");
  if (type && SAFE_TYPE.test(type)) { res.set('Content-Type', type); return; }
  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Disposition', 'attachment');
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
// X-Forwarded-* only rewrite the request's protocol and host behind a reverse proxy you set up (PUBLIC_URL)
app.set('trust proxy', !!PUBLIC_URL || process.env.TRUST_PROXY === '1');

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const cookieToken = (req) => { const m = /(?:^|;\s*)mkc_t=([^;]+)/.exec(req.get('cookie') || ''); return m ? decodeURIComponent(m[1]) : ''; };
// /t/<secret>/... carries the shared secret in the path, so the app's proxy URL can hold it (see PROXY_TOKEN)
app.use((req, res, next) => {
  const m = /^\/t\/([^/?#]+)(\/[^]*)?$/.exec(req.url);
  if (m) {
    req.mkcToken = decodeURIComponent(m[1]); req.mkcBase = `/t/${m[1]}`; req.url = m[2] || '/';
    if (PROXY_TOKEN && safeEq(req.mkcToken, PROXY_TOKEN) && cookieToken(req) !== PROXY_TOKEN) res.append('Set-Cookie', `mkc_t=${encodeURIComponent(PROXY_TOKEN)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`);
  }
  next();
});
function needToken(req, res, next) {
  const t = req.mkcToken || String(req.query.token || '') || req.get('x-mkc-token') || '';
  if (t && safeEq(t, INTERNAL_TOKEN)) return next();
  if (!PROXY_TOKEN || (t && safeEq(t, PROXY_TOKEN)) || safeEq(cookieToken(req), PROXY_TOKEN)) return next();
  res.status(401).json({ error: 'this MKCinema server needs its token: use http://<server>/t/<token> as the proxy URL' });
}

/* CORS: only the MKCinema app's own sites, this server itself and file:// pages may read what the proxy fetches, so
   another website open in the same browser can't use it to read your router or local services */
const corsOk = (req) => {
  const o = req.get('origin');
  if (!o || (o === 'null' && process.env.ALLOW_NULL_ORIGIN === '1') || CORS_LIST.includes('*') || APP_ORIGINS.has(o)) return true;
  const host = req.get('host');
  return o === `http://${host}` || o === `https://${host}`;
};
app.use((req, res, next) => { if (req.get('access-control-request-private-network') && corsOk(req)) res.set('Access-Control-Allow-Private-Network', 'true'); next(); });
app.use(cors((req, cb) => cb(null, { origin: corsOk(req) ? (req.get('origin') || false) : false, exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type', 'X-MKC-Relay', 'X-Remux-Start'] })));

app.get('/health', (req, res) => res.json({ ok: true, name: 'MKCinema proxy', version: VERSION, remux: HAS_FFMPEG, addon: `${req.protocol}://${req.get('host')}/manifest.json` }));

// Optional Supabase settings for the app, from the environment. The anon key is public by design.
app.get('/config.json', (req, res) => res.json({
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
}));

// Stremio account import: some browsers block calling api.strem.io directly, so the app can relay through here.
// Only these read-only methods (plus login/logout) are forwarded, only to api.strem.io, and nothing is logged or stored.
const STREMIO_METHODS = new Set(['login', 'logout', 'datastoreGet', 'addonCollectionGet']);
app.post('/stremio-api/:method', needToken, express.json({ limit: '64kb' }), async (req, res) => {
  if (!STREMIO_METHODS.has(req.params.method)) return res.status(404).json({ error: { message: 'unsupported method' } });
  try {
    const r = await fetch(`https://api.strem.io/api/${req.params.method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.body || {}), signal: AbortSignal.timeout(20000) });
    res.status(r.status).type('application/json').send(await r.text());
  } catch (e) { res.status(502).json({ error: { message: `Could not reach Stremio (${e.message})` } }); }
});

app.options('/proxy', (req, res) => res.sendStatus(204));
app.get('/proxy', needToken, async (req, res) => {
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

  let up, finalUrl;
  try {
    ({ r: up, finalUrl } = await safeFetch(upstreamUrl.href, { headers: fwd, signal: ctl.signal }));
  } catch (e) {
    if (ctl.signal.aborted) return;
    if (e.status || e.code === 'EPRIVATE' || (e.cause && e.cause.code === 'EPRIVATE')) return res.status(e.status || 403).json({ error: e.message });
    return res.status(502).json({ error: `upstream request failed: ${e.message}` });
  }

  const contentType = up.headers.get('content-type') || '';
  // child playlist, key and segment links keep the token prefix this request came in with (/t/<token>)
  const proxyBase = `${req.protocol}://${req.get('host')}${req.mkcBase || ''}`;
  const tokenParam = !req.mkcBase && req.query.token ? String(req.query.token) : '';
  const wholeFile = !fwd.Range || /^bytes=0-$/i.test(fwd.Range);

  try {
    if (isPlaylist(contentType, finalUrl) && up.status < 400 && wholeFile) {
      const text = await up.text();
      if (text.trimStart().startsWith('#EXTM3U')) {
        res.status(up.status === 206 ? 200 : up.status);
        safeHeaders(res, 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache');
        const out = rewritePlaylist(text, finalUrl, proxyBase, headersParam);
        return res.send(tokenParam ? out.replace(/(\/proxy\?url=[^\s"]+)/g, `$1&token=${encodeURIComponent(tokenParam)}`) : out);
      }
      res.status(up.status); safeHeaders(res, forced['Content-Type'] || contentType || 'text/plain');
      return res.send(text);
    }

    res.status(up.status);
    for (const h of PASS_HEADERS) { const v = up.headers.get(h); if (v) res.set(h, v); }
    if (!up.headers.get('accept-ranges') && up.status === 206) res.set('Accept-Ranges', 'bytes');
    safeHeaders(res, forced['Content-Type'] || contentType);

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
/* ffmpeg and ffprobe never fetch the upstream themselves: they read it through this server's own /proxy, which checks
   every address, redirect and HLS child link, and adds the request headers. They may only speak plain http to it. */
const ffInput = (href, headersParam) => `${SELF_BASE}/proxy?url=${encodeURIComponent(href)}${headersParam ? `&headers=${encodeURIComponent(String(headersParam))}` : ''}&token=${INTERNAL_TOKEN}`;
const FF_PROTO = ['-protocol_whitelist', 'http,tcp,crypto'];

app.get('/remux/probe', needToken, async (req, res) => {
  if (!HAS_FFMPEG) return res.status(501).json({ error: 'ffmpeg is not installed on this server' });
  let u; try { u = await checkTarget(String(req.query.url || '')); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const p = spawn(FFPROBE, ['-v', 'error', ...FF_PROTO, '-print_format', 'json', '-show_format', '-show_streams', ffInput(u.href, req.query.headers)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = ''; const kill = setTimeout(() => p.kill('SIGKILL'), 25000);
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => {
    clearTimeout(kill);
    if (code !== 0) { console.warn('[probe]', (err.trim().split('\n').pop() || `exit ${code}`).replace(/token=[^&\s]+/g, 'token=…')); return res.status(502).json({ error: 'could not read this stream' }); }
    try {
      const j = JSON.parse(out), v = (j.streams || []).find((s) => s.codec_type === 'video'), a = (j.streams || []).filter((s) => s.codec_type === 'audio');
      res.json({ duration: Number(j.format && j.format.duration) || null, video: v ? v.codec_name : null, audio: a.map((s) => `${s.codec_name}${s.channels ? ` ${s.channels}ch` : ''}${s.tags && s.tags.language ? ` ${s.tags.language}` : ''}`),
        // every audio track in file order, for the player's Audio language menu (index n is ffmpeg's 0:a:n)
        tracks: a.map((s, n) => ({ index: n, codec: s.codec_name || '', channels: s.channels || 0, language: (s.tags && s.tags.language) || '', title: (s.tags && s.tags.title) || '', default: !!(s.disposition && s.disposition.default) })) });
    } catch (e) { res.status(502).json({ error: 'could not read ffprobe output' }); }
  });
});

/* Stream copy can only start on a keyframe. This asks the demuxer where a seek to t really lands (the first video
   packet it reads), so the client knows exactly where the converted stream begins. /remux then seeks a hair past that
   keyframe, because ffmpeg backs input seeks off by about 0.13 s and would otherwise land one keyframe earlier. */
function keyframeAt(href, t, headersParam) {
  return new Promise((resolve) => {
    if (!(t > 0)) return resolve(0);
    const p = spawn(FFPROBE, ['-v', 'error', ...FF_PROTO, '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,dts_time', '-of', 'csv=p=0',
      '-read_intervals', `${t.toFixed(3)}%+#1`, ffInput(href, headersParam)], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = ''; const kill = setTimeout(() => p.kill('SIGKILL'), 20000);
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => { clearTimeout(kill); const v = out.split('\n')[0].split(',').map(Number).find((x) => Number.isFinite(x)); resolve(Number.isFinite(v) && v <= t + 0.05 ? v : t); });
    p.on('error', () => { clearTimeout(kill); resolve(t); });
  });
}

app.get('/remux/seek', needToken, async (req, res) => {
  if (!HAS_FFMPEG) return res.status(501).json({ error: 'ffmpeg is not installed on this server' });
  let u; try { u = await checkTarget(String(req.query.url || '')); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const t = Math.max(0, Number(req.query.t) || 0);
  res.json({ start: await keyframeAt(u.href, t, req.query.headers) });
});

app.get('/remux', needToken, async (req, res) => {
  if (!HAS_FFMPEG) return res.status(501).json({ error: 'ffmpeg is not installed on this server' });
  if (remuxRunning >= MAX_REMUX) return res.status(503).json({ error: `already converting ${MAX_REMUX} streams; try again shortly` });
  let u; try { u = await checkTarget(String(req.query.url || '')); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  const t = Math.max(0, Number(req.query.t) || 0); // request headers ride along to the /proxy hop (ffInput)
  const track = Math.max(0, Math.min(63, Math.floor(Number(req.query.audio) || 0))); // which audio track (language) to keep
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '4',
    ...(t ? ['-noaccurate_seek', '-ss', (t + 0.2).toFixed(3)] : []), ...FF_PROTO, '-i', ffInput(u.href, req.query.headers),
    '-map', '0:v:0', '-map', `0:a:${track}?`, '-sn', '-dn',
    '-c:v', 'copy', ...(req.query.hevc === '1' ? ['-tag:v', 'hvc1'] : []),
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1'];
  const ff = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  remuxRunning++; let done = false, err = '';
  const finish = () => { if (done) return; done = true; remuxRunning--; try { ff.kill('SIGKILL'); } catch (e) { /* gone */ } };
  ff.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
  ff.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'could not start ffmpeg' }); finish(); });
  ff.on('close', (code) => { if (code && !res.headersSent) { console.warn('[remux]', (err.trim().split('\n').pop() || `exit ${code}`).replace(/token=[^&\s]+/g, 'token=…')); res.status(502).json({ error: 'could not convert this stream' }); } else res.end(); finish(); });
  req.on('close', finish);
  ff.stdout.once('data', () => { if (!res.headersSent) res.set({ 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'X-Remux-Start': String(t) }); });
  ff.stdout.pipe(res);
});

/* ------------------------------------------------------------------ *
 * Debrid relay: some debrid APIs block browser (CORS) calls. Only these
 * API hosts are reachable, the user's own key passes through, nothing is logged.
 * ------------------------------------------------------------------ */
const DEBRID_HOSTS = ['api.real-debrid.com', 'api.torbox.app', 'api.alldebrid.com', 'www.premiumize.me'];
app.all('/debrid', (req, res, next) => (req.query.ping ? next() : needToken(req, res, next)), express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  res.set('X-MKC-Relay', '1');
  if (req.query.ping) return res.json({ ok: true, relay: 'server', v: 2 });
  if (!['GET', 'POST', 'DELETE', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'method not allowed' });
  let u; try { u = new URL(String(req.query.url || '')); } catch (e) { return res.status(400).json({ error: 'bad url' }); }
  if (u.protocol !== 'https:' || !DEBRID_HOSTS.includes(u.hostname)) return res.status(403).json({ error: 'only debrid API hosts are relayed' });
  // v2 apps send key-like query parameters (apikey=, token=) in x-debrid-query, so they never sit in a request URL
  const xq = String(req.get('x-debrid-query') || '');
  if (xq) {
    const parts = xq.split('&').filter(Boolean);
    if (xq.length > 2048 || !parts.every((p) => /^(apikey|token|presigned_token)=[A-Za-z0-9%._~+!*'()-]*$/.test(p))) return res.status(400).json({ error: 'bad x-debrid-query' });
    u.search = u.search ? `${u.search}&${parts.join('&')}` : `?${parts.join('&')}`;
  }
  const headers = {}; ['authorization', 'content-type', 'accept'].forEach((k) => { if (req.get(k)) headers[k] = req.get(k); });
  try {
    const r = await fetch(u.href, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, signal: AbortSignal.timeout(30000) });
    const rt = r.headers.get('content-type') || 'application/json';
    res.set('X-Content-Type-Options', 'nosniff').set('Content-Security-Policy', "sandbox; default-src 'none'");
    res.status(r.status).type(/^\s*(application\/json|text\/plain)/i.test(rt) ? rt : 'application/octet-stream').send(Buffer.from(await r.arrayBuffer()));
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
const PWA_FILES = { 'manifest.webmanifest': 'application/manifest+json', 'remote.webmanifest': 'application/manifest+json', 'sw.js': 'text/javascript', 'icon-192.png': 'image/png', 'icon-512.png': 'image/png', 'icon-maskable-512.png': 'image/png' };
app.get(Object.keys(PWA_FILES).map((f) => `/${f}`), (req, res, next) => {
  const name = req.path.slice(1), file = path.join(__dirname, name);
  if (!fs.existsSync(file)) return next();
  res.type(PWA_FILES[name]); if (name === 'sw.js') res.set('Cache-Control', 'no-cache'); res.sendFile(file);
});
// The rest of the app's files: only these folders and files, never this script, package files or .env
const STATIC_DIRS = ['i18n', 'kids', 'vendor', 'anime', 'net', 'rate'];
for (const d of STATIC_DIRS) app.use(`/${d}`, express.static(path.join(__dirname, d), { index: false, dotfiles: 'ignore', fallthrough: true, redirect: false }));
const STATIC_FILES = ['universes.json', 'version.json', 'logs.html', 'status.html', 'privacy.html', 'apple-touch-icon.png'];
app.get(STATIC_FILES.map((f) => `/${f}`), (req, res, next) => {
  const file = path.join(__dirname, req.path.slice(1));
  if (!fs.existsSync(file)) return next();
  if (/\.json$/.test(file)) res.set('Cache-Control', 'no-cache');
  res.sendFile(file);
});
// The phone remote page (QR codes on the TV point at /remote)
app.get(['/remote', '/remote.html'], (req, res, next) => {
  const file = path.join(__dirname, 'remote.html');
  if (!fs.existsSync(file)) return next();
  res.sendFile(file);
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
  const server = app.listen(PORT, HOST, () => {
    const port = server.address().port, any = HOST === '0.0.0.0' || HOST === '::';
    SELF_BASE = `http://${any ? (HOST === '::' ? '[::1]' : '127.0.0.1') : net.isIPv6(HOST) ? `[${HOST}]` : HOST}:${port}`;
    const shown = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
    const PUBLIC_BASE = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : `http://${shown}:${PORT}`;
    console.log(`MKCinema Server ${VERSION}`);
    console.log(`  App:    ${PUBLIC_BASE}/${fs.existsSync(INDEX) ? '' : '  (put index.html next to this file to serve the app)'}`);
    console.log(`  Addon:  ${PUBLIC_BASE}/manifest.json`);
    console.log(`  Proxy:  ${PUBLIC_BASE}/proxy?url=<encoded url>&headers=<base64 JSON>`);
    console.log(`  Accounts: ${process.env.SUPABASE_URL ? process.env.SUPABASE_URL : 'built into the app (SUPABASE_URL and SUPABASE_ANON_KEY can override)'}`);
    console.log(`  Audio rescue: ${HAS_FFMPEG ? `on (${FFMPEG})` : 'off (install ffmpeg to fix silent MKV/EAC3/DTS audio)'}`);
    if (HOST === '127.0.0.1') console.log('  Bound to localhost only. Set HOST=0.0.0.0 to reach it from other devices.');
    if (PROXY_TOKEN) console.log(`  Token: on. Proxy URL for the app: ${PUBLIC_BASE}/t/<PROXY_TOKEN>`);
    else if (HOST !== '127.0.0.1') console.log('  Tip: set PROXY_TOKEN so only your devices can use the proxy.');
  });
}

module.exports = { app, rewritePlaylist, decodeHeaders, isPrivateIp, checkTarget, safeFetch, SAFE_TYPE, setSelfBase: (b) => { SELF_BASE = b; } };
