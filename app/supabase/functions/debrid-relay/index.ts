// MKCinema debrid relay on Supabase Edge Functions (deploy with verify_jwt off). Relay protocol v2.
// Debrid APIs such as TorBox refuse direct calls from a web page (CORS), and a site uploaded through the Cloudflare dashboard only serves files,
// so this forwards the call. Only the four debrid API hosts are reachable, only with GET/POST/HEAD, and only from MKCinema's own sites.
// The user's key arrives in x-debrid-auth (so it never collides with Supabase's own Authorization header). Keys that a debrid API wants
// in its query string (apikey=, token=) arrive in x-debrid-query and are added here, so they never appear in the request URL
// that the Supabase gateway records. Nothing is stored and nothing is logged: this file has no console calls on purpose.
//
// Every call must carry the project's publishable key in `apikey` (all apps since web 2.37 send it). The secret
// MKC_RELAY_REQUIRE_KEY=0 turns that off again without a redeploy, if an old client ever needs it.
// Calls must also come from the live sites (app, tv and the main pages.dev address); preview builds and localhost
// use their own server's /debrid instead.
// A self-hosted project whose key is not in KEYS sets the secret MKC_RELAY_KEYS (comma separated).
const VERSION = 2;
const HOSTS = ['api.real-debrid.com', 'api.torbox.app', 'api.alldebrid.com', 'www.premiumize.me'];
const ORIGINS = [/^https:\/\/(mkcinema|mkctv)\.pages\.dev$/, /^https:\/\/((app|tv)\.)?mkcinema\.app$/];
const METHODS = ['GET', 'POST', 'HEAD'];
const SECRET_PARAMS = ['apikey', 'token', 'presigned_token'];
const RATE = { limit: 120, windowMs: 60_000 }; // per client IP, per isolate (best effort)

const env = (k: string) => { try { return Deno.env.get(k) || ''; } catch { return ''; } };
const KEYS = new Set<string>(['sb_publishable_ZpiFwB_oM579GwCunYpHWg_jelRazT-']);
for (const k of [env('SUPABASE_ANON_KEY'), ...env('MKC_RELAY_KEYS').split(',')]) if (k.trim()) KEYS.add(k.trim());
try { const p = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}'); for (const v of Object.values(p)) if (typeof v === 'string' && v) KEYS.add(v); } catch { /* not set */ }
const REQUIRE_KEY = env('MKC_RELAY_REQUIRE_KEY') !== '0';

const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string): number {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t >= RATE.windowMs) hits.delete(k);
  let h = hits.get(ip);
  if (!h || now - h.t >= RATE.windowMs) { h = { n: 0, t: now }; hits.set(ip, h); }
  h.n++;
  return h.n > RATE.limit ? Math.max(1, Math.ceil((h.t + RATE.windowMs - now) / 1000)) : 0;
}
const clientIp = (req: Request) => (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim();

// x-debrid-query: "apikey=…&token=…". Only the secret parameter names, only URL-safe characters.
function secretQuery(raw: string | null): string | null {
  if (!raw) return '';
  if (raw.length > 2048) return null;
  const parts = raw.split('&').filter(Boolean);
  for (const p of parts) {
    const i = p.indexOf('='), name = i < 0 ? p : p.slice(0, i), value = i < 0 ? '' : p.slice(i + 1);
    if (!SECRET_PARAMS.includes(name) || !/^[A-Za-z0-9%._~+!*'()\-]*$/.test(value)) return null;
  }
  return parts.join('&');
}

export async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get('origin') || '';
  const okOrigin = ORIGINS.some((r) => r.test(origin));
  const cors: Record<string, string> = {
    'access-control-allow-origin': okOrigin ? origin : 'https://app.mkcinema.app',
    'access-control-allow-methods': `${METHODS.join(', ')}, OPTIONS`,
    'access-control-allow-headers': 'x-debrid-auth, x-debrid-query, apikey, content-type, accept',
    'access-control-expose-headers': 'x-mkc-relay',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
  const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store', 'x-mkc-relay': '1', ...extra } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const wait = limited(clientIp(req));
  if (wait) return json(429, { error: 'Too many requests through the relay. Wait a minute and try again.' }, { 'retry-after': String(wait) });
  if (!METHODS.includes(req.method)) return json(405, { error: 'method not relayed' }, { allow: `${METHODS.join(', ')}, OPTIONS` });
  const self = new URL(req.url);
  if (self.searchParams.get('ping')) return json(200, { ok: true, relay: 'supabase', v: VERSION, key: true });
  const key = req.headers.get('apikey');
  if (key ? !KEYS.has(key) : REQUIRE_KEY) return json(401, { error: 'relay key missing or wrong' });
  if (!okOrigin) return json(403, { error: 'relay is for MKCinema only' });
  // every real call carries the user's own debrid key; a call without one can only be someone using the relay for free
  if (!req.headers.get('x-debrid-auth') && !req.headers.get('x-debrid-query')) return json(401, { error: 'debrid key missing' });
  let u: URL; try { u = new URL(self.searchParams.get('url') || ''); } catch { return json(400, { error: 'bad url' }); }
  if (u.protocol !== 'https:' || !HOSTS.includes(u.hostname) || u.username || u.password || u.port) return json(403, { error: 'only debrid API hosts are relayed' });
  const extra = secretQuery(req.headers.get('x-debrid-query'));
  if (extra === null) return json(400, { error: 'bad x-debrid-query' });
  u.hash = '';
  const target = extra ? `${u.href}${u.search ? '&' : '?'}${extra}` : u.href;
  const headers: Record<string, string> = {};
  const auth = req.headers.get('x-debrid-auth'); if (auth) headers.authorization = auth;
  for (const k of ['content-type', 'accept']) { const v = req.headers.get(k); if (v) headers[k] = v; }
  try {
    const r = await fetch(target, { method: req.method, headers, body: req.method === 'POST' ? await req.arrayBuffer() : undefined, signal: AbortSignal.timeout(25000) });
    return new Response(req.method === 'HEAD' ? null : await r.arrayBuffer(), { status: r.status, headers: { ...cors, 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', 'x-mkc-relay': '1' } });
  } catch (e) {
    // never echo the runtime's message: Deno puts the full target URL (with the key) in fetch errors
    const why = (e as Error)?.name === 'TimeoutError' ? 'timed out' : 'network error';
    return json(502, { error: `debrid service unreachable (${why})` });
  }
}

Deno.serve((req) => handle(req).catch(() => new Response(JSON.stringify({ error: 'relay error' }), { status: 500, headers: { 'content-type': 'application/json', 'x-mkc-relay': '1', 'access-control-allow-origin': 'https://app.mkcinema.app' } })));
