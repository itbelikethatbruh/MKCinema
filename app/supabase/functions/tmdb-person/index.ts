// MKCinema cast pages on Supabase Edge Functions (deploy with verify_jwt off).
// Person pages need TMDB, and TMDB needs a key. The key is MKCinema's own, stored as the function secret TMDB_KEY
// (a v3 API key or a v4 read access token), so no key ships in the app. Viewers who saved their own TMDB key in
// Settings call TMDB directly instead and never reach this function.
//
// Only fixed lookups are offered, never a free path: ping, search (a person by name), cast (a title's people,
// by IMDb or TMDB id), person (bio and combined credits), ids (a film's or show's IMDb id) and art (the best backdrop
// without the title printed on it, plus a logo, for the Home banner and title pages). Answers are trimmed to
// the fields the person page draws. Calls must carry the project's publishable key in `apikey` and come from the live
// sites (the same rule as debrid-relay). Nothing is stored and nothing is logged: this file has no console calls on purpose.
const VERSION = 2;
const ORIGINS = [/^https:\/\/(mkcinema|mkctv)\.pages\.dev$/, /^https:\/\/((app|tv)\.)?mkcinema\.app$/];
const RATE = { limit: 90, windowMs: 60_000 }; // per client IP, per isolate (best effort)
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

// a small per-isolate cache, so a popular actor is one TMDB call for many viewers
const memo = new Map<string, { t: number; v: unknown }>();
const TTL = 6 * 3600_000;
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
  if (memo.size > 600) memo.delete(memo.keys().next().value!);
  return v;
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
const credit = (c: any, crew: boolean) => ({
  id: num(c.id), media_type: c.media_type === 'tv' ? 'tv' : 'movie',
  title: str(c.title || c.name, 200), date: str(c.release_date || c.first_air_date, 10),
  ...(crew ? { job: str(c.job, 80), department: str(c.department, 40) } : { character: str(c.character, 160), episode_count: num(c.episode_count) }),
  poster_path: str(c.poster_path, 80), backdrop_path: str(c.backdrop_path, 80),
  vote_count: num(c.vote_count), vote_average: num(c.vote_average), popularity: num(c.popularity),
  adult: !!c.adult, genre_ids: Array.isArray(c.genre_ids) ? c.genre_ids.filter((g: unknown) => typeof g === 'number').slice(0, 6) : [],
});
const LANG = /^[a-z]{2}(-[A-Z]{2})?$/;

// Backdrops tagged with a language have the title printed on them; untagged ones are textless (TMDB's own rule).
// TMDB's main backdrop wins when it is textless, else the best-rated textless one. `titled` is only filled when no
// textless backdrop exists, so the app can show known titled art and keep its own logo off.
function pickArt(hit: any, im: any) {
  const bds = ((im && im.backdrops) || []).filter((x: any) => x && x.file_path && num(x.width) >= 1280);
  const score = (x: any) => num(x.vote_average) * 100 + Math.min(num(x.vote_count), 99);
  const clean = bds.filter((x: any) => !x.iso_639_1).sort((x: any, y: any) => score(y) - score(x));
  const main = clean.find((x: any) => x.file_path === hit.backdrop_path);
  const titled = bds.filter((x: any) => x.iso_639_1 === 'en').sort((x: any, y: any) => score(y) - score(x))[0];
  const logos = ((im && im.logos) || []).filter((l: any) => l && l.file_path && !/\.svg$/i.test(l.file_path));
  const logo = logos.find((l: any) => l.iso_639_1 === 'en') || null;
  const bg = (main || clean[0] || null);
  return { bg: str(bg && bg.file_path, 80), titled: bg ? '' : str(titled && titled.file_path, 80), logo: str(logo && logo.file_path, 80) };
}

async function answer(a: string, p: URLSearchParams): Promise<[number, unknown, number]> {
  const lang = LANG.test(p.get('lang') || '') ? p.get('lang')! : 'en-US';
  const id = p.get('id') || '', kind = p.get('kind') === 'tv' ? 'tv' : 'movie';
  if (a === 'search') {
    const q = (p.get('q') || '').trim();
    if (!q || q.length > 100) return [400, { error: 'bad name' }, 0];
    const j = await tmdb('search/person', { query: q, include_adult: 'false', language: lang });
    const results = ((j && j.results) || []).filter((x: any) => !x.adult).slice(0, 8).map((x: any) => ({
      id: num(x.id), name: str(x.name, 120), known_for_department: str(x.known_for_department, 40), profile_path: str(x.profile_path, 80), popularity: num(x.popularity),
      known_for: (x.known_for || []).slice(0, 3).map((k: any) => str(k.title || k.name, 120)),
    }));
    return [200, { results }, 3600];
  }
  if (a === 'cast') {
    const tt = p.get('tt') || '';
    let tid = 0, tk = kind;
    if (/^tt\d{5,10}$/.test(tt)) {
      const f = await tmdb(`find/${tt}`, { external_source: 'imdb_id' });
      const hit = f && ((f.movie_results || [])[0] ? { k: 'movie', x: f.movie_results[0] } : (f.tv_results || [])[0] ? { k: 'tv', x: f.tv_results[0] } : null);
      if (!hit) return [200, { tmdb: null, people: [] }, 86400];
      tid = num(hit.x.id); tk = hit.k as 'movie' | 'tv';
    } else if (/^\d{1,9}$/.test(id)) tid = Number(id);
    else return [400, { error: 'bad title id' }, 0];
    const c = await tmdb(tk === 'tv' ? `tv/${tid}/aggregate_credits` : `movie/${tid}/credits`, { language: lang });
    const people = [
      ...((c && c.cast) || []).slice(0, 80).map((x: any) => ({ id: num(x.id), name: str(x.name, 120), profile_path: str(x.profile_path, 80), character: str(x.character || (x.roles && x.roles[0] && x.roles[0].character), 160) })),
      ...((c && c.crew) || []).filter((x: any) => /^(Directing|Writing)$/.test(x.department) || /^(Creator|Director|Screenplay|Writer|Novel)$/.test(x.job || (x.jobs && x.jobs[0] && x.jobs[0].job) || ''))
        .slice(0, 40).map((x: any) => ({ id: num(x.id), name: str(x.name, 120), profile_path: str(x.profile_path, 80), job: str(x.job || (x.jobs && x.jobs[0] && x.jobs[0].job), 80), department: str(x.department, 40) })),
    ];
    return [200, { tmdb: { kind: tk, id: tid }, people }, 86400];
  }
  if (a === 'person') {
    if (!/^\d{1,9}$/.test(id)) return [400, { error: 'bad person id' }, 0];
    const j = await tmdb(`person/${id}`, { append_to_response: 'combined_credits,external_ids', language: lang });
    if (!j) return [404, { error: 'not found' }, 3600];
    let bio = str(j.biography, 6000);
    if (!bio && !lang.startsWith('en')) { const en = await tmdb(`person/${id}`, { language: 'en-US' }).catch(() => null); bio = str(en && en.biography, 6000); }
    const cc = j.combined_credits || {};
    return [200, {
      id: num(j.id), name: str(j.name, 120), biography: bio, birthday: str(j.birthday, 10), deathday: str(j.deathday, 10),
      place_of_birth: str(j.place_of_birth, 160), known_for_department: str(j.known_for_department, 40), profile_path: str(j.profile_path, 80),
      imdb_id: str((j.external_ids || {}).imdb_id || j.imdb_id, 12), homepage: /^https:\/\//.test(j.homepage || '') ? str(j.homepage, 300) : '',
      cast: (cc.cast || []).filter((c: any) => !c.adult).slice(0, 500).map((c: any) => credit(c, false)),
      crew: (cc.crew || []).filter((c: any) => !c.adult).slice(0, 500).map((c: any) => credit(c, true)),
    }, 86400];
  }
  if (a === 'ids') {
    if (!/^\d{1,9}$/.test(id)) return [400, { error: 'bad title id' }, 0];
    const j = await tmdb(`${kind}/${id}/external_ids`);
    return [200, { imdb_id: str(j && j.imdb_id, 12) }, 7 * 86400];
  }
  if (a === 'art') {
    const tt = p.get('tt') || '';
    if (!/^tt\d{5,10}$/.test(tt)) return [400, { error: 'bad title id' }, 0];
    const f = await tmdb(`find/${tt}`, { external_source: 'imdb_id' });
    const hit = f && ((f.movie_results || [])[0] ? { k: 'movie', x: f.movie_results[0] } : (f.tv_results || [])[0] ? { k: 'tv', x: f.tv_results[0] } : null);
    if (!hit) return [200, { tmdb: null, bg: '', titled: '', logo: '' }, 86400];
    const im = await tmdb(`${hit.k}/${num(hit.x.id)}/images`, { include_image_language: 'en,null' });
    return [200, { tmdb: { kind: hit.k, id: num(hit.x.id) }, ...pickArt(hit.x, im) }, 7 * 86400];
  }
  return [400, { error: 'unknown lookup' }, 0];
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
  if (!TMDB_KEY) return json(503, { error: 'cast pages are not set up yet' });
  try {
    const [status, body, maxAge] = await answer(p.get('a') || '', p);
    return json(status, body, maxAge);
  } catch (e) {
    // never echo the runtime's message: it can contain the TMDB URL with the key
    if (e instanceof Upstream) return json(e.status === 429 ? 429 : 502, { error: e.status === 429 ? 'TMDB is busy. Try again in a moment.' : `TMDB answered ${e.status}` }, 0, e.status === 429 ? { 'retry-after': '10' } : {});
    return json(502, { error: (e as Error)?.name === 'TimeoutError' ? 'TMDB timed out' : 'TMDB unreachable' });
  }
}

Deno.serve((req) => handle(req).catch(() => new Response(JSON.stringify({ error: 'lookup error' }), { status: 500, headers: { 'content-type': 'application/json', 'access-control-allow-origin': 'https://app.mkcinema.app' } })));
