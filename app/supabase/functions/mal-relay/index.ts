// MKCinema MyAnimeList relay on Supabase Edge Functions (deploy with verify_jwt off). Relay protocol v2.
// MyAnimeList's API and its token endpoint send no CORS headers, so a web page cannot call them directly. This forwards
// only those two things, only with GET/POST/PATCH, only from MKCinema's own sites: api.myanimelist.net/v2/* and myanimelist.net/v1/oauth2/token.
// The user's token arrives in x-mal-auth and their own API client ID in x-mal-client; neither is stored or logged (no console calls on purpose).
//
// v1 clients (web 2.36.2 and older) send no apikey header and still work. v2 clients send the project's publishable key in `apikey`;
// when present it must be one of KEYS. Set the secret MKC_RELAY_REQUIRE_KEY=1 later to refuse calls without it.
// A self-hosted project whose key is not in KEYS sets the secret MKC_RELAY_KEYS (comma separated).
const VERSION = 2;
const ORIGINS = [/^https:\/\/([a-z0-9-]+\.)?mkcinema\.pages\.dev$/, /^https:\/\/([a-z0-9-]+\.)?mkcinema\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const METHODS = ['GET', 'POST', 'PATCH'];
const RATE = { limit: 60, windowMs: 60_000 }; // per client IP, per isolate (best effort)
const allowed = (u: URL, method: string) => u.protocol === 'https:' && !u.username && !u.password && !u.port && (
  (u.hostname === 'api.myanimelist.net' && u.pathname.startsWith('/v2/') && ['GET', 'PATCH'].includes(method)) ||
  (u.hostname === 'myanimelist.net' && u.pathname === '/v1/oauth2/token' && method === 'POST'));

const env = (k: string) => { try { return Deno.env.get(k) || ''; } catch { return ''; } };
const KEYS = new Set<string>(['sb_publishable_ZpiFwB_oM579GwCunYpHWg_jelRazT-']);
for (const k of [env('SUPABASE_ANON_KEY'), ...env('MKC_RELAY_KEYS').split(',')]) if (k.trim()) KEYS.add(k.trim());
try { const p = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}'); for (const v of Object.values(p)) if (typeof v === 'string' && v) KEYS.add(v); } catch { /* not set */ }
const REQUIRE_KEY = env('MKC_RELAY_REQUIRE_KEY') === '1';

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

export async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get('origin') || '';
  const okOrigin = ORIGINS.some((r) => r.test(origin));
  const cors: Record<string, string> = {
    'access-control-allow-origin': okOrigin ? origin : 'https://app.mkcinema.app',
    'access-control-allow-methods': `${METHODS.join(', ')}, OPTIONS`,
    'access-control-allow-headers': 'x-mal-auth, x-mal-client, apikey, content-type, accept',
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
  if (self.searchParams.get('ping')) return json(200, { ok: true, relay: 'mal', v: VERSION, key: true });
  const key = req.headers.get('apikey');
  if (key ? !KEYS.has(key) : REQUIRE_KEY) return json(401, { error: 'relay key missing or wrong' });
  if (!okOrigin) return json(403, { error: 'relay is for MKCinema only' });
  let u: URL; try { u = new URL(self.searchParams.get('url') || ''); } catch { return json(400, { error: 'bad url' }); }
  if (!allowed(u, req.method)) return json(403, { error: 'only the MyAnimeList API is relayed' });
  u.hash = '';
  const headers: Record<string, string> = {};
  const auth = req.headers.get('x-mal-auth'); if (auth) headers.authorization = auth;
  const client = req.headers.get('x-mal-client'); if (client) headers['x-mal-client-id'] = client;
  for (const k of ['content-type', 'accept']) { const v = req.headers.get(k); if (v) headers[k] = v; }
  try {
    const r = await fetch(u.href, { method: req.method, headers, body: req.method === 'GET' ? undefined : await req.arrayBuffer(), signal: AbortSignal.timeout(20000) });
    return new Response(await r.arrayBuffer(), { status: r.status, headers: { ...cors, 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', 'x-mkc-relay': '1' } });
  } catch (e) {
    const why = (e as Error)?.name === 'TimeoutError' ? 'timed out' : 'network error';
    return json(502, { error: `MyAnimeList unreachable (${why})` });
  }
}

Deno.serve((req) => handle(req).catch(() => new Response(JSON.stringify({ error: 'relay error' }), { status: 500, headers: { 'content-type': 'application/json', 'x-mkc-relay': '1', 'access-control-allow-origin': 'https://app.mkcinema.app' } })));
