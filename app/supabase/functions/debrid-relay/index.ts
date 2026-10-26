// MKCinema debrid relay on Supabase Edge Functions (deploy with verify_jwt off).
// Debrid APIs such as TorBox refuse direct calls from a web page (CORS), and a site uploaded through the Cloudflare dashboard only serves files,
// so this forwards the call. Only the four debrid API hosts are reachable and only from MKCinema's own sites.
// The user's key arrives in x-debrid-auth (so it never collides with Supabase's own Authorization header) and is not stored or logged.
const HOSTS = ['api.real-debrid.com', 'api.torbox.app', 'api.alldebrid.com', 'www.premiumize.me'];
const ORIGINS = [/^https:\/\/([a-z0-9-]+\.)?mkcinema\.pages\.dev$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const okOrigin = ORIGINS.some((r) => r.test(origin));
  const cors: Record<string, string> = {
    'access-control-allow-origin': okOrigin ? origin : 'https://mkcinema.pages.dev',
    'access-control-allow-methods': 'GET, POST, DELETE, PUT, OPTIONS',
    'access-control-allow-headers': 'x-debrid-auth, content-type, accept',
    'access-control-expose-headers': 'x-mkc-relay',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store', 'x-mkc-relay': '1' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const self = new URL(req.url);
  if (self.searchParams.get('ping')) return json(200, { ok: true, relay: 'supabase' });
  if (!okOrigin) return json(403, { error: 'relay is for MKCinema only' });
  let u: URL; try { u = new URL(self.searchParams.get('url') || ''); } catch { return json(400, { error: 'bad url' }); }
  if (u.protocol !== 'https:' || !HOSTS.includes(u.hostname)) return json(403, { error: 'only debrid API hosts are relayed' });
  const headers: Record<string, string> = {};
  const auth = req.headers.get('x-debrid-auth'); if (auth) headers.authorization = auth;
  for (const k of ['content-type', 'accept']) { const v = req.headers.get(k); if (v) headers[k] = v; }
  try {
    const r = await fetch(u.href, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer(), signal: AbortSignal.timeout(25000) });
    return new Response(await r.arrayBuffer(), { status: r.status, headers: { ...cors, 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', 'x-mkc-relay': '1' } });
  } catch (e) { return json(502, { error: `debrid service unreachable (${(e as Error).message})` }); }
});
