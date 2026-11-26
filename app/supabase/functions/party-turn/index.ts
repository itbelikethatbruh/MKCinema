// MKCinema watch-party relay credentials on Supabase Edge Functions (deploy with verify_jwt off).
// Party video, voice and sync go straight between devices. When two networks don't allow that (a phone on mobile data
// talking to a laptop behind a strict router, say), WebRTC falls back to a TURN relay. This function hands out
// short-lived Cloudflare TURN credentials, made from the secrets TURN_KEY_ID and TURN_KEY_TOKEN (a Cloudflare Realtime
// TURN key), so no relay secret ships in the app. The relay only forwards encrypted WebRTC packets; it can't see them.
// Calls must carry the project's publishable key in `apikey` and come from the live sites (the same rule as
// debrid-relay and tmdb-person). Nothing is stored and nothing is logged: this file has no console calls on purpose.
const VERSION = 2;
const env = (k: string) => { try { return Deno.env.get(k) || ''; } catch { return ''; } };
const ORIGINS = [/^https:\/\/(mkcinema|mkctv)\.pages\.dev$/, /^https:\/\/((app|tv)\.)?mkcinema\.app$/];
const RATE = { limit: 10, windowMs: 60_000 }; // per client IP, per isolate (best effort)
const TTL = 3 * 3600; // a copied login stops working within 3 hours
/* Spending guard (v2): MKCinema is free, so the relay must stay inside Cloudflare's free monthly allowance (1,000 GB at
   the time of writing). Before handing out logins it reads this month's TURN egress with a read-only analytics token
   (CF_ANALYTICS_TOKEN, account CF_ACCOUNT_ID: set both secrets before deploying) and stops at TURN_MONTH_CAP_GB (default 900). Without that token, or when
   the reading fails, it hands out nothing: parties then connect directly, as they always could. */
const CAP_GB = Number(env('TURN_MONTH_CAP_GB')) > 0 ? Number(env('TURN_MONTH_CAP_GB')) : 900;
let usage = { at: 0, gb: -1 };
async function monthGB(): Promise<number> {
  if (Date.now() - usage.at < 10 * 60_000 && usage.gb >= 0) return usage.gb;
  const acct = env('CF_ACCOUNT_ID').trim(), tok = env('CF_ANALYTICS_TOKEN').trim();
  if (!tok || !acct) return -1;
  const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const query = `query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){callsTurnUsageAdaptiveGroups(filter:{datetimeMinute_geq:$s,datetimeMinute_lt:$e},limit:1){sum{egressBytes}}}}}`;
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { a: acct, s: start.toISOString(), e: now.toISOString() } }), signal: AbortSignal.timeout(6000) });
    if (!r.ok) return -1;
    const j = await r.json(); if (j.errors && j.errors.length) return -1;
    const g = j?.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups || [];
    const bytes = g.reduce((n: number, x: any) => n + Number(x?.sum?.egressBytes || 0), 0);
    usage = { at: Date.now(), gb: bytes / 1e9 }; return usage.gb;
  } catch { return -1; }
}

const KEYS = new Set<string>(['sb_publishable_ZpiFwB_oM579GwCunYpHWg_jelRazT-']);
for (const k of [env('SUPABASE_ANON_KEY'), ...env('MKC_RELAY_KEYS').split(',')]) if (k.trim()) KEYS.add(k.trim());
try { const p = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}'); for (const v of Object.values(p)) if (typeof v === 'string' && v) KEYS.add(v); } catch { /* not set */ }

const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t >= RATE.windowMs) hits.delete(k);
  let h = hits.get(ip);
  if (!h || now - h.t >= RATE.windowMs) { h = { n: 0, t: now }; hits.set(ip, h); }
  return ++h.n > RATE.limit;
}
const clientIp = (req: Request) => (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim();

function cors(origin: string) {
  return { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'apikey, content-type, x-client-info', 'access-control-allow-methods': 'GET, OPTIONS', vary: 'origin', 'cache-control': 'no-store' };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const okOrigin = ORIGINS.some((r) => r.test(origin));
  const h = cors(okOrigin ? origin : 'https://app.mkcinema.app');
  const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...h, 'content-type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: h });
  if (req.method !== 'GET') return out({ error: 'method' }, 405);
  if (!okOrigin || !KEYS.has(req.headers.get('apikey') || '')) return out({ error: 'forbidden' }, 403);
  if (new URL(req.url).searchParams.get('a') === 'ping') { const gb = await monthGB(); return out({ ok: true, v: VERSION, relay: !!(env('TURN_KEY_ID') && env('TURN_KEY_TOKEN')), guard: gb < 0 ? 'unreadable' : gb >= CAP_GB ? 'capped' : 'ok' }); }
  if (limited(clientIp(req))) return out({ error: 'slow down' }, 429);
  const id = env('TURN_KEY_ID').trim(), token = env('TURN_KEY_TOKEN').trim();
  if (!id || !token) return out({ iceServers: [] });
  const gb = await monthGB();
  if (gb < 0 || gb >= CAP_GB) return out({ iceServers: [] }); // guard: unreadable or over the monthly cap
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl: TTL, customIdentifier: 'mkcinema-party' }), signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return out({ iceServers: [] }, 502);
    const j = await r.json();
    const list = ([] as any[]).concat(j.iceServers || []).map((s) => {
      const urls = ([] as string[]).concat(s.urls || []).filter((u) => typeof u === 'string' && !/:53(\?|$)/.test(u)); // browsers refuse port 53
      return urls.length ? { urls, username: String(s.username || ''), credential: String(s.credential || '') } : null;
    }).filter(Boolean);
    return out({ iceServers: list, ttl: TTL });
  } catch {
    return out({ iceServers: [] }, 502);
  }
});
