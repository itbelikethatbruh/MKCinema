// MKCinema for Claude and ChatGPT: a small remote MCP server on Supabase Edge Functions (deploy with verify_jwt off).
// An AI assistant can look up films and shows (TMDB, with the project secret TMDB_KEY that tmdb-person already uses)
// and send one to a MKCinema screen that has "Claude and ChatGPT" turned on in Settings › Devices. Sending is a
// realtime broadcast on that screen's private code (mkc-ai-<code>); the screen only accepts "open" or "play" of an
// IMDb id, and its own rules (kids seat, ask before replacing what is playing) still decide. This server never sees an
// account, a library, a watch history, an addon or a key of the viewer. Nothing is stored and nothing is logged.
// Protocol: MCP Streamable HTTP, JSON responses only (no server-sent events, no sessions), no sign-in.
const VERSION = '1.0.0';
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/w342';
const env = (k: string) => { try { return Deno.env.get(k) || ''; } catch { return ''; } };
const TMDB_KEY = env('TMDB_KEY').trim();
const SB_URL = (env('SUPABASE_URL') || 'https://wogffhgdixgrayowewnf.supabase.co').replace(/\/+$/, '');
// the publishable key is public (it is in the app); the realtime broadcast API accepts it in `apikey`
const SB_KEY = env('MKC_PUBLISHABLE_KEY') || 'sb_publishable_ZpiFwB_oM579GwCunYpHWg_jelRazT-';

/* ---------------- limits: per caller address, and per screen code for sends ---------------- */
const buckets = new Map<string, { n: number; t: number }>();
function over(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (buckets.size > 8000) for (const [k, v] of buckets) if (now - v.t >= windowMs) buckets.delete(k);
  let b = buckets.get(key);
  if (!b || now - b.t >= windowMs) { b = { n: 0, t: now }; buckets.set(key, b); }
  return ++b.n > limit;
}
const clientIp = (req: Request) => (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim();

/* ---------------- TMDB ---------------- */
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
  if (memo.size > 1500) memo.delete(memo.keys().next().value!);
  return v;
}
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const year = (x: any) => str(x && (x.release_date || x.first_air_date), 4);
const kindOf = (x: any) => (x && (x.media_type === 'tv' || x.first_air_date !== undefined || x.name !== undefined && x.title === undefined) ? 'tv' : 'movie');
const short = (x: any, k?: string) => {
  const kind = k || kindOf(x);
  return {
    id: `${kind}:${x.id}`, type: kind === 'tv' ? 'series' : 'movie', title: str(x.title || x.name, 200), year: year(x),
    rating: typeof x.vote_average === 'number' && x.vote_count > 20 ? Math.round(x.vote_average * 10) / 10 : null,
    overview: str(x.overview, 280), poster: x.poster_path ? `${IMG}${x.poster_path}` : null,
  };
};

/* "movie:603", "tv:1399", "series:1399" or an IMDb id "tt0133093" -> { kind, id } on TMDB */
async function resolve(raw: unknown): Promise<{ kind: 'movie' | 'tv'; id: number } | null> {
  const s = String(raw || '').trim().toLowerCase();
  let m = s.match(/^(movie|film|tv|series|show):(\d{1,9})$/);
  if (m) return { kind: m[1] === 'movie' || m[1] === 'film' ? 'movie' : 'tv', id: Number(m[2]) };
  m = s.match(/^(tt\d{5,10})$/);
  if (m) {
    const f = await tmdb(`find/${m[1]}`, { external_source: 'imdb_id' });
    if (f && f.movie_results && f.movie_results[0]) return { kind: 'movie', id: f.movie_results[0].id };
    if (f && f.tv_results && f.tv_results[0]) return { kind: 'tv', id: f.tv_results[0].id };
  }
  return null;
}

/* ---------------- tools ---------------- */
const TOOLS = [
  {
    name: 'search_titles',
    title: 'Search films and shows',
    description: 'Search films and TV series by name. Returns up to 8 matches with an id to use with the other tools.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Title or part of it, e.g. "the matrix".' },
      type: { type: 'string', enum: ['any', 'movie', 'series'], description: 'Limit to films or series. Default any.' },
      year: { type: 'integer', description: 'Release year (or first air year), optional.' },
    }, required: ['query'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'get_title',
    title: 'Film or show details',
    description: 'Details for one film or series: year, runtime or seasons, genres, main cast, director or creators, age rating and the streaming services it is on in a country.',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string', description: 'An id from search_titles ("movie:603", "tv:1399") or an IMDb id ("tt0133093").' },
      country: { type: 'string', description: 'Two-letter country for age rating and where to watch, e.g. US, GB, DE. Default US.' },
    }, required: ['id'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'trending',
    title: 'Trending now',
    description: 'Films and series that are popular today or this week.',
    inputSchema: { type: 'object', properties: {
      type: { type: 'string', enum: ['any', 'movie', 'series'], description: 'Default any.' },
      window: { type: 'string', enum: ['day', 'week'], description: 'Default week.' },
    }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'more_like',
    title: 'More like this',
    description: 'Up to 10 films or series similar to one title, for recommendations.',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string', description: 'An id from search_titles or an IMDb id.' },
    }, required: ['id'], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'send_to_tv',
    title: 'Send to my MKCinema screen',
    description: 'Opens a film or series on the viewer\'s MKCinema screen (TV, computer or phone), or starts playing it. The screen must have "Claude and ChatGPT" turned on in Settings › Devices; its code is part of this connector\'s link, or the viewer can say it. The screen keeps its own rules: a kids seat only opens titles allowed for it, and the screen asks before replacing something that is playing. Only use when the viewer asks to watch, open or play something.',
    inputSchema: { type: 'object', properties: {
      id: { type: 'string', description: 'An id from search_titles ("movie:603", "tv:1399") or an IMDb id.' },
      play: { type: 'boolean', description: 'true starts playing (same as pressing Play); false or left out only opens the title page.' },
      season: { type: 'integer', description: 'For a series: season number, optional.' },
      episode: { type: 'integer', description: 'For a series: episode number, needs season.' },
      tv_code: { type: 'string', description: 'The screen code shown in MKCinema Settings › Devices › Claude and ChatGPT. Only needed when the connector link has none.' },
    }, required: ['id'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

const tvType = (t: unknown) => (t === 'movie' ? 'movie' : t === 'series' ? 'tv' : '');
async function searchTitles(a: any) {
  const q = str(a.query, 120); if (!q) throw new Error('Say what to search for.');
  const t = tvType(a.type), y = Number.isInteger(a.year) ? String(a.year) : '';
  let res: any[] = [];
  if (t === 'movie') res = ((await tmdb('search/movie', { query: q, include_adult: 'false', ...(y ? { year: y } : {}) })) || {}).results || [];
  else if (t === 'tv') res = ((await tmdb('search/tv', { query: q, include_adult: 'false', ...(y ? { first_air_date_year: y } : {}) })) || {}).results || [];
  else {
    res = (((await tmdb('search/multi', { query: q, include_adult: 'false' })) || {}).results || []).filter((x: any) => x.media_type === 'movie' || x.media_type === 'tv');
    if (y) { const hit = res.filter((x: any) => year(x) === y); if (hit.length) res = hit; }
  }
  const out = res.slice(0, 8).map((x: any) => short(x, t || x.media_type));
  return { results: out, note: out.length ? 'Use an id with get_title, more_like or send_to_tv.' : 'Nothing found. Try another spelling or fewer words.' };
}

async function getTitle(a: any) {
  const r = await resolve(a.id); if (!r) throw new Error('Unknown id. Use an id from search_titles, like "movie:603", or an IMDb id.');
  const c = /^[A-Za-z]{2}$/.test(String(a.country || '')) ? String(a.country).toUpperCase() : 'US';
  const extra = r.kind === 'movie' ? 'credits,external_ids,release_dates,watch/providers' : 'aggregate_credits,external_ids,content_ratings,watch/providers';
  const d = await tmdb(`${r.kind}/${r.id}`, { append_to_response: extra });
  if (!d) throw new Error('That title was not found.');
  const cr = r.kind === 'movie' ? d.credits : d.aggregate_credits;
  let age = '';
  if (r.kind === 'movie') { const e = ((d.release_dates || {}).results || []).find((x: any) => x.iso_3166_1 === c); age = e ? str(((e.release_dates || []).find((y: any) => y.certification) || {}).certification, 20) : ''; }
  else { const e = ((d.content_ratings || {}).results || []).find((x: any) => x.iso_3166_1 === c); age = e ? str(e.rating, 20) : ''; }
  const wp = (((d['watch/providers'] || {}).results || {})[c]) || {};
  const names = (k: string) => (wp[k] || []).slice(0, 8).map((x: any) => str(x.provider_name, 60));
  return {
    ...short(d, r.kind), imdb_id: str((d.external_ids || {}).imdb_id || d.imdb_id, 12) || null,
    overview: str(d.overview, 900), tagline: str(d.tagline, 200) || undefined, genres: (d.genres || []).map((g: any) => str(g.name, 40)),
    runtime_minutes: r.kind === 'movie' ? d.runtime || null : undefined,
    seasons: r.kind === 'tv' ? (d.seasons || []).filter((s: any) => s.season_number > 0).map((s: any) => ({ season: s.season_number, episodes: s.episode_count })) : undefined,
    status: str(d.status, 40),
    cast: ((cr && cr.cast) || []).slice(0, 8).map((p: any) => str(p.name, 80)),
    director: r.kind === 'movie' ? ((cr && cr.crew) || []).filter((p: any) => p.job === 'Director').map((p: any) => str(p.name, 80)) : undefined,
    creators: r.kind === 'tv' ? (d.created_by || []).map((p: any) => str(p.name, 80)) : undefined,
    age_rating: age ? { country: c, rating: age } : null,
    where_to_watch: { country: c, subscription: names('flatrate'), free: [...names('free'), ...names('ads')], rent: names('rent'), buy: names('buy'), source: 'JustWatch via TMDB' },
  };
}

async function trending(a: any) {
  const t = tvType(a.type) || 'all', w = a.window === 'day' ? 'day' : 'week';
  const d = await tmdb(`trending/${t}/${w}`);
  return { results: ((d && d.results) || []).filter((x: any) => x.media_type !== 'person').slice(0, 12).map((x: any) => short(x, t === 'all' ? x.media_type : t)) };
}

async function moreLike(a: any) {
  const r = await resolve(a.id); if (!r) throw new Error('Unknown id. Use an id from search_titles, or an IMDb id.');
  const d = await tmdb(`${r.kind}/${r.id}/recommendations`);
  return { results: ((d && d.results) || []).slice(0, 10).map((x: any) => short(x, r.kind)) };
}

const ALPHA = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/;
const normCode = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function sendToTv(a: any, urlCode: string) {
  const code = normCode(a.tv_code) || urlCode;
  if (!code) return { sent: false, error: 'No screen code. In MKCinema open Settings › Devices › Claude and ChatGPT, turn it on and use the link shown there (or tell me the code).' };
  if (!ALPHA.test(code)) return { sent: false, error: 'That screen code is not right. It is 10 letters and numbers, shown in MKCinema Settings › Devices › Claude and ChatGPT.' };
  if (over(`send:${code}`, 8)) return { sent: false, error: 'Too many titles sent to this screen in the last minute. Wait a moment.' };
  const r = await resolve(a.id); if (!r) throw new Error('Unknown id. Use an id from search_titles, or an IMDb id.');
  const d = await tmdb(`${r.kind}/${r.id}`, { append_to_response: 'external_ids' });
  const tt = str(d && ((d.external_ids || {}).imdb_id || d.imdb_id), 12);
  if (!/^tt\d{5,10}$/.test(tt)) return { sent: false, error: 'MKCinema cannot open this title: it has no IMDb id yet.' };
  const name = str(d.title || d.name, 200);
  const s = Number.isInteger(a.season) && a.season >= 0 && a.season < 10000 ? a.season : null, e = Number.isInteger(a.episode) && a.episode > 0 && a.episode < 100000 ? a.episode : null;
  const vid = r.kind === 'tv' && s !== null && e !== null ? `${tt}:${s}:${e}` : undefined;
  const payload = { _from: 'ai', _id: crypto.randomUUID().replace(/-/g, '').slice(0, 12), t: a.play ? 'play' : 'open', id: tt, type: r.kind === 'tv' ? 'series' : 'movie', name, ...(vid ? { vid } : {}) };
  const res = await fetch(`${SB_URL}/realtime/v1/api/broadcast`, {
    method: 'POST', headers: { apikey: SB_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ topic: `mkc-ai-${code}`, event: 'm', payload, private: false }] }), signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { sent: false, error: `Could not reach the screen right now (${res.status}). Try again in a moment.` };
  return {
    sent: true, title: name, year: year(d), action: a.play ? 'play' : 'open', ...(vid ? { season: s, episode: e } : {}),
    note: 'Sent. If that screen is on with MKCinema open, it opens now. A kids seat only opens titles allowed for it, and if something is already playing the screen asks first. This tool cannot see whether it opened.',
  };
}

/* ---------------- MCP over HTTP ---------------- */
const INSTRUCTIONS = 'MKCinema is a free app for watching films and series on TVs, computers and phones. These tools look titles up and send one to the viewer\'s MKCinema screen. Search first, confirm the exact title when several match, then call send_to_tv with play only when the viewer wants it to start. You cannot see the viewer\'s library, history, account or addons, and nothing tells you whether the screen is on.';
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };
const ok = (id: Rpc['id'], result: unknown) => ({ jsonrpc: '2.0', id, result });
const fail = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const asText = (v: unknown, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 1) }], ...(isError ? {} : { structuredContent: v }), isError });

async function call(name: string, args: any, urlCode: string) {
  if (!TMDB_KEY) return asText({ error: 'MKCinema lookups are not set up yet.' }, true);
  args = args && typeof args === 'object' ? args : {};
  try {
    switch (name) {
      case 'search_titles': return asText(await searchTitles(args));
      case 'get_title': return asText(await getTitle(args));
      case 'trending': return asText(await trending(args));
      case 'more_like': return asText(await moreLike(args));
      case 'send_to_tv': { const r = await sendToTv(args, urlCode); return asText(r, r.sent === false); }
      default: return null;
    }
  } catch (e) {
    // never echo a runtime message that could hold the TMDB URL with its key
    if (e instanceof Upstream) return asText({ error: e.status === 429 ? 'The film database is busy. Try again in a moment.' : `The film database answered ${e.status}.` }, true);
    if ((e as Error)?.name === 'TimeoutError') return asText({ error: 'The film database timed out. Try again.' }, true);
    const m = (e as Error)?.message || '';
    return asText({ error: /^(Say|Unknown|That title)/.test(m) ? m : 'Lookup failed.' }, true);
  }
}

async function one(msg: Rpc, urlCode: string): Promise<unknown | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg && msg.id, -32600, 'Invalid request');
  const isNote = msg.id === undefined || msg.id === null;
  if (isNote) return null; // notifications (initialized, cancelled...) need no answer
  const p = msg.params || {};
  switch (msg.method) {
    case 'initialize': {
      const want = String(p.protocolVersion || '');
      return ok(msg.id, { protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'mkcinema', title: 'MKCinema', version: VERSION }, instructions: INSTRUCTIONS });
    }
    case 'ping': return ok(msg.id, {});
    case 'tools/list': return ok(msg.id, { tools: TOOLS });
    case 'tools/call': {
      const r = await call(String(p.name || ''), p.arguments, urlCode);
      return r ? ok(msg.id, r) : fail(msg.id, -32602, `Unknown tool: ${String(p.name || '').slice(0, 40)}`);
    }
    case 'resources/list': return ok(msg.id, { resources: [] });
    case 'prompts/list': return ok(msg.id, { prompts: [] });
    default: return fail(msg.id, -32601, 'Method not found');
  }
}

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id',
  'access-control-expose-headers': 'mcp-session-id',
  'access-control-max-age': '86400',
};
const json = (status: number, body: unknown, extra: Record<string, string> = {}) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...CORS, ...(body === null ? {} : { 'content-type': 'application/json' }), 'cache-control': 'no-store', ...extra } });

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  if (req.method === 'GET') {
    if (url.searchParams.get('ping')) return json(200, { ok: true, v: VERSION, ready: !!TMDB_KEY });
    // no server-sent event stream: MCP clients fall back to plain POST answers
    return json(405, { error: 'This is an MCP server. Add its link as a custom connector in Claude or ChatGPT.' }, { allow: 'POST, OPTIONS' });
  }
  if (req.method === 'DELETE') return json(405, null, { allow: 'POST, OPTIONS' });
  if (req.method !== 'POST') return json(405, { error: 'POST only' }, { allow: 'POST, OPTIONS' });
  if (over(`ip:${clientIp(req)}`, 120) || over('all', 3000)) return json(429, fail(null, -32000, 'Too many requests. Wait a minute.'), { 'retry-after': '30' });
  const len = Number(req.headers.get('content-length') || 0); if (len > 64_000) return json(413, fail(null, -32600, 'Request too large'));
  let body: unknown;
  try { const t = await req.text(); if (t.length > 64_000) return json(413, fail(null, -32600, 'Request too large')); body = JSON.parse(t); } catch { return json(400, fail(null, -32700, 'Parse error')); }
  const urlCode = normCode(url.searchParams.get('tv'));
  if (Array.isArray(body)) {
    if (!body.length || body.length > 20) return json(400, fail(null, -32600, 'Invalid batch'));
    const out = (await Promise.all(body.map((m) => one(m as Rpc, urlCode)))).filter((x) => x !== null);
    return out.length ? json(200, out) : json(202, null);
  }
  const r = await one(body as Rpc, urlCode);
  return r === null ? json(202, null) : json(200, r);
}

if (typeof Deno !== 'undefined' && (Deno as any).serve && !env('MKC_TEST')) Deno.serve((req) => handle(req).catch(() => json(500, fail(null, -32603, 'Server error'))));
