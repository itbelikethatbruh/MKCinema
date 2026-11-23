// MKCinema parent notes on Supabase Edge Functions (deploy with verify_jwt off, like tmdb-person).
// One fixed lookup: a film's or show's age ratings by country and the content warnings rating boards attach to them
// (TMDB release_dates / content_ratings "descriptors"), for the Parent notes block on title pages. It uses the project
// secret TMDB_KEY that tmdb-person already uses, so no key ships in the app. Viewers with their own TMDB key ask TMDB
// directly and never reach this function. Only an IMDb id is accepted. Calls must carry the project's publishable key
// in `apikey` and come from the live sites. Nothing is stored and nothing is logged.
const VERSION = 1;
const ORIGINS = [/^https:\/\/(mkcinema|mkctv)\.pages\.dev$/, /^https:\/\/((app|tv)\.)?mkcinema\.app$/];
const RATE = { limit: 60, windowMs: 60_000 };
const API = 'https://api.themoviedb.org/3';
const env = (k: string) => { try { return Deno.env.get(k) || ''; } catch { return ''; } };
const KEYS = new Set<string>(['sb_publishable_ZpiFwB_oM579GwCunYpHWg_jelRazT-']);
for (const k of [env('SUPABASE_ANON_KEY'), ...env('MKC_RELAY_KEYS').split(',')]) if (k.trim()) KEYS.add(k.trim());
try { const p = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}'); for (const v of Object.values(p)) if (typeof v === 'string' && v) KEYS.add(v); } catch { /* not set */ }
const TMDB_KEY = env('TMDB_KEY').trim();

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

const memo = new Map<string, { t: number; v: unknown }>();
const TTL = 12 * 3600_000;
class Upstream extends Error { status: number; constructor(status: number) { super(`TMDB ${status}`); this.status = status; } }
async function tmdb(path: string, params: Record<string, string> = {}): Promise<any> {
  const q = new URLSearchParams(params);
  const v4 = TMDB_KEY.startsWith('eyJ');
  if (!v4) q.set('api_key', TMDB_KEY);
  const url = `${API}/${path}?${q}`;
  const hit = memo.get(url); if (hit && Date.now() - hit.t < TTL) return hit.v;
  const r = await fetch(url, { headers: { accept: 'application/json', ...(v4 ? { authorization: `Bearer ${TMDB_KEY}` } : {}) }, signal: AbortSignal.timeout(12000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Upstream(r.status);
  const v = await r.json();
  memo.set(url, { t: Date.now(), v });
  if (memo.size > 800) memo.delete(memo.keys().next().value!);
  return v;
}
const str = (v: unknown, max = 40) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// [{ c: 'US', r: 'PG-13', d: ['Violence', ...] }, ...]: one entry per country, the cinema rating first, descriptors merged
export function trim(kind: string, d: any) {
  const out: { c: string; r: string; d: string[] }[] = [];
  for (const x of ((d && d.results) || []).slice(0, 120)) {
    const c = str(x && x.iso_3166_1, 2); if (!/^[A-Z]{2}$/.test(c)) continue;
    let r = '', ds = new Set<string>();
    if (kind === 'tv') { r = str(x.rating); (x.descriptors || []).forEach((y: unknown) => { const s = str(y); if (s) ds.add(s); }); }
    else {
      const rows = (x.release_dates || []).slice().sort((a: any, b: any) => (a.type === 3 ? 0 : 1) - (b.type === 3 ? 0 : 1));
      for (const y of rows) { if (!r && str(y.certification)) r = str(y.certification); (y.descriptors || []).forEach((z: unknown) => { const s = str(z); if (s) ds.add(s); }); }
    }
    if (r || ds.size) out.push({ c, r, d: [...ds].slice(0, 12) });
  }
  return out;
}

async function answer(p: URLSearchParams): Promise<[number, unknown, number]> {
  const tt = p.get('tt') || '';
  if (!/^tt\d{5,10}$/.test(tt)) return [400, { error: 'bad title id' }, 0];
  const f = await tmdb(`find/${tt}`, { external_source: 'imdb_id' });
  const hit = f && ((f.movie_results || [])[0] ? { k: 'movie', x: f.movie_results[0] } : (f.tv_results || [])[0] ? { k: 'tv', x: f.tv_results[0] } : null);
  if (!hit) return [200, { kind: null, ratings: [] }, 86400];
  const id = Number(hit.x.id) || 0;
  const d = await tmdb(hit.k === 'tv' ? `tv/${id}/content_ratings` : `movie/${id}/release_dates`);
  return [200, { kind: hit.k, ratings: trim(hit.k, d) }, 86400];
}

export async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get('origin') || '';
  const okOrigin = ORIGINS.some((r) => r.test(origin));
  const cors: Record<string, string> = {
    'access-control-allow-origin': okOrigin ? origin : 'https://app.mkcinema.app',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'apikey, accept',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
  const json = (status: number, body: unknown, maxAge = 0, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store', ...extra } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return json(405, { error: 'GET only' }, 0, { allow: 'GET, OPTIONS' });
  const p = new URL(req.url).searchParams;
  if (p.get('ping')) return json(200, { ok: true, v: VERSION, ready: !!TMDB_KEY });
  const wait = limited(clientIp(req));
  if (wait) return json(429, { error: 'Too many lookups. Wait a minute and try again.' }, 0, { 'retry-after': String(wait) });
  if (!KEYS.has(req.headers.get('apikey') || '')) return json(401, { error: 'key missing or wrong' });
  if (!okOrigin) return json(403, { error: 'for MKCinema only' });
  if (!TMDB_KEY) return json(503, { error: 'not set up yet' });
  try {
    const [status, body, maxAge] = await answer(p);
    return json(status, body, maxAge);
  } catch (e) {
    // never echo the runtime's message: it can contain the TMDB URL with the key
    if (e instanceof Upstream) return json(e.status === 429 ? 429 : 502, { error: e.status === 429 ? 'TMDB is busy. Try again in a moment.' : `TMDB answered ${e.status}` }, 0, e.status === 429 ? { 'retry-after': '10' } : {});
    return json(502, { error: (e as Error)?.name === 'TimeoutError' ? 'TMDB timed out' : 'TMDB unreachable' });
  }
}

Deno.serve((req) => handle(req).catch(() => new Response(JSON.stringify({ error: 'lookup error' }), { status: 500, headers: { 'content-type': 'application/json', 'access-control-allow-origin': 'https://app.mkcinema.app' } })));
