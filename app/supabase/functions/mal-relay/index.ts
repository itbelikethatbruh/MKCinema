// MKCinema MyAnimeList relay on Supabase Edge Functions (deploy with verify_jwt off).
// MyAnimeList's API and its token endpoint send no CORS headers, so a web page cannot call them directly. This forwards
// only those two things, only from MKCinema's own sites: api.myanimelist.net/v2/* and myanimelist.net/v1/oauth2/token.
// The user's token arrives in x-mal-auth and their own API client ID in x-mal-client; neither is stored or logged.
const ORIGINS = [/^https:\/\/([a-z0-9-]+\.)?mkcinema\.pages\.dev$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const allowed = (u: URL) => u.protocol === 'https:' && ((u.hostname === 'api.myanimelist.net' && u.pathname.startsWith('/v2/')) || (u.hostname === 'myanimelist.net' && u.pathname === '/v1/oauth2/token'));

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const okOrigin = ORIGINS.some((r) => r.test(origin));
  const cors: Record<string, string> = {
    'access-control-allow-origin': okOrigin ? origin : 'https://mkcinema.pages.dev',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'x-mal-auth, x-mal-client, content-type, accept',
    'access-control-expose-headers': 'x-mkc-relay',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store', 'x-mkc-relay': '1' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const self = new URL(req.url);
  if (self.searchParams.get('ping')) return json(200, { ok: true, relay: 'mal' });
  if (!okOrigin) return json(403, { error: 'relay is for MKCinema only' });
  let u: URL; try { u = new URL(self.searchParams.get('url') || ''); } catch { return json(400, { error: 'bad url' }); }
  if (!allowed(u)) return json(403, { error: 'only the MyAnimeList API is relayed' });
  const headers: Record<string, string> = {};
  const auth = req.headers.get('x-mal-auth'); if (auth) headers.authorization = auth;
  const client = req.headers.get('x-mal-client'); if (client) headers['x-mal-client-id'] = client;
  for (const k of ['content-type', 'accept']) { const v = req.headers.get(k); if (v) headers[k] = v; }
  try {
    const r = await fetch(u.href, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(), signal: AbortSignal.timeout(20000) });
    return new Response(await r.arrayBuffer(), { status: r.status, headers: { ...cors, 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', 'x-mkc-relay': '1' } });
  } catch (e) { return json(502, { error: `MyAnimeList unreachable (${(e as Error).message})` }); }
});
