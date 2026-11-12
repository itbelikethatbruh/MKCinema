// MKCinema cast pages on Supabase Edge Functions (deploy with verify_jwt off).
// Person pages need TMDB, and TMDB needs a key. The key is MKCinema's own, stored as the function secret TMDB_KEY
// (a v3 API key or a v4 read access token), so no key ships in the app. Viewers who saved their own TMDB key in
// Settings call TMDB directly instead and never reach this function.
//
// Only fixed lookups are offered, never a free path: ping, search (a person by name), cast (a title's people,
// by IMDb or TMDB id), person (bio and combined credits), ids (a film's or show's IMDb id) and art (the best backdrop
// without the title printed on it, plus a logo, for the Home banner and title pages), watch (where a title streams in a
// region, for Where to watch), stills (a season's episode pictures), providers (the region's streaming services, for the Your apps picker), and (v4) titles
// (a page of popular, top rated or searched films or shows, with IMDb ids) and title (a film's or show's page with its
// episodes), which MKCinema Meta uses if Cinemeta stops answering, and (v6) recs (what people who loved a title watch
// next) and discover (films or shows by genre, theme, era, length, language and person), which Your Picks and Miko use
// to suggest real, relevant titles, (v7) local (a title's logo and trailer in the viewer's language), and (v8) trending
// (this week's or today's most talked-about films and shows) and fresh (films that came out to watch at home in the
// viewer's region lately, or shows that started lately), which the Discover page uses. Only ids, numbers and fixed sort names are accepted, never free text into a TMDB path,
// and no taste, history or account is ever sent here: just the one ask. Answers are trimmed to
// the fields the person page draws. Calls must carry the project's publishable key in `apikey` and come from the live
// sites (the same rule as debrid-relay). Nothing is stored and nothing is logged: this file has no console calls on purpose.
const VERSION = 8;
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

// a film's or show's row for Your Picks and Miko: IMDb id (so every addon finds it), names, year, art, genres, score
async function rowsWithIds(rows: any[], fallbackKind: string, n: number) {
  const list = rows.filter((x: any) => x && !x.adult && num(x.id)).slice(0, n);
  const kinds = list.map((x: any) => (x.media_type === 'tv' ? 'tv' : x.media_type === 'movie' ? 'movie' : fallbackKind));
  const ids = await Promise.all(list.map((x: any, i: number) => tmdb(`${kinds[i]}/${num(x.id)}/external_ids`).catch(() => null)));
  return list.map((x: any, i: number) => ({
    id: num(x.id), kind: kinds[i], imdb_id: str(ids[i] && ids[i].imdb_id, 12), title: str(x.title, 200), name: str(x.name, 200), overview: str(x.overview, 600),
    release_date: str(x.release_date, 10), first_air_date: str(x.first_air_date, 10), poster_path: str(x.poster_path, 80), backdrop_path: str(x.backdrop_path, 80),
    genre_ids: Array.isArray(x.genre_ids) ? x.genre_ids.filter((g: unknown) => typeof g === 'number').slice(0, 6) : [],
    vote_average: Math.round(num(x.vote_average) * 10) / 10, vote_count: num(x.vote_count), original_language: str(x.original_language, 5),
  })).filter((x: any) => /^tt\d{5,10}$/.test(x.imdb_id));
}
// keywords that say nothing about the story
const GENERIC_KW = new Set([818, 9663, 9675, 15285, 9714, 245230, 9717, 13141, 41645, 246466, 156866, 10181, 179430, 179431, 187056, 314698, 381726, 12999, 281237, 263548, 210024, 6054, 9673]);
const idList = (v: string | null, max: number, sep = ',') => String(v || '').split(sep).map((x) => x.trim()).filter((x) => /^\d{1,9}$/.test(x)).slice(0, max);

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
  // v7: the title logo and the YouTube trailer in the viewer's language (empty when TMDB has none in it)
  if (a === 'local') {
    const tt = p.get('tt') || '', base = lang.split('-')[0];
    if (!/^tt\d{5,10}$/.test(tt)) return [400, { error: 'bad title id' }, 0];
    const f = await tmdb(`find/${tt}`, { external_source: 'imdb_id' });
    const hit = f && ((f.movie_results || [])[0] ? { k: 'movie', x: f.movie_results[0] } : (f.tv_results || [])[0] ? { k: 'tv', x: f.tv_results[0] } : null);
    if (!hit) return [200, { logo: '', yt: '' }, 86400];
    const tid = num(hit.x.id);
    const [im, vids] = await Promise.all([tmdb(`${hit.k}/${tid}/images`, { include_image_language: `${base},null` }).catch(() => null), tmdb(`${hit.k}/${tid}/videos`, { language: base }).catch(() => null)]);
    const lg = ((im && im.logos) || []).filter((l: any) => l && l.iso_639_1 === base && l.file_path && !/\.svg$/i.test(l.file_path)).sort((x: any, y: any) => num(y.vote_average) - num(x.vote_average))[0];
    const yt = ((vids && vids.results) || []).filter((v: any) => v && v.site === 'YouTube' && /^(Trailer|Teaser)$/.test(v.type) && /^[\w-]{11}$/.test(v.key || '')).sort((x: any, y: any) => (x.type === 'Trailer' ? 0 : 1) - (y.type === 'Trailer' ? 0 : 1))[0];
    return [200, { logo: str(lg && lg.file_path, 80), yt: str(yt && yt.key, 11) }, 7 * 86400];
  }
  if (a === 'watch' || a === 'providers') {
    const region = (p.get('region') || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(region)) return [400, { error: 'bad region' }, 0];
    const prov = (x: any) => ({ provider_id: num(x.provider_id), provider_name: str(x.provider_name, 80), logo_path: str(x.logo_path, 80), display_priority: num(x.display_priority) });
    if (a === 'providers') {
      const [mv, tv] = await Promise.all([tmdb('watch/providers/movie', { watch_region: region }), tmdb('watch/providers/tv', { watch_region: region })]);
      const seen = new Map<number, any>();
      for (const x of [...((mv && mv.results) || []), ...((tv && tv.results) || [])]) if (x && !seen.has(x.provider_id)) seen.set(x.provider_id, x);
      const pr = (x: any) => num((x.display_priorities || {})[region]) || num(x.display_priority) || 99;
      return [200, { results: [...seen.values()].sort((x, y) => pr(x) - pr(y)).slice(0, 80).map(prov) }, 7 * 86400];
    }
    const tt = p.get('tt') || '';
    if (!/^tt\d{5,10}$/.test(tt)) return [400, { error: 'bad title id' }, 0];
    const f = await tmdb(`find/${tt}`, { external_source: 'imdb_id' });
    const hit = f && ((f.movie_results || [])[0] ? { k: 'movie', x: f.movie_results[0] } : (f.tv_results || [])[0] ? { k: 'tv', x: f.tv_results[0] } : null);
    if (!hit) return [200, { result: null }, 86400];
    const w = await tmdb(`${hit.k}/${num(hit.x.id)}/watch/providers`);
    const r = w && w.results && w.results[region];
    if (!r) return [200, { result: null }, 86400];
    const out: Record<string, unknown> = { link: str(r.link, 300) };
    for (const k of ['flatrate', 'free', 'ads', 'rent', 'buy']) if (Array.isArray(r[k])) out[k] = r[k].slice(0, 20).map(prov);
    return [200, { result: out }, 86400];
  }
  // a season's episode stills, for the episode list (the shared catalog pictures can be out of step with TMDB)
  if (a === 'stills') {
    const tt = p.get('tt') || '', season = p.get('season') || '';
    if (!/^tt\d{5,10}$/.test(tt) || !/^\d{1,3}$/.test(season)) return [400, { error: 'bad title or season' }, 0];
    const f = await tmdb(`find/${tt}`, { external_source: 'imdb_id' });
    const tv = f && (f.tv_results || [])[0];
    if (!tv) return [200, { eps: [] }, 86400];
    const j = await tmdb(`tv/${num(tv.id)}/season/${Number(season)}`);
    const eps = ((j && j.episodes) || []).slice(0, 400).map((e: any) => ({ e: num(e.episode_number), n: str(e.name, 160), d: str(e.air_date, 10), s: str(e.still_path, 80) }));
    return [200, { eps }, 86400];
  }
  if (a === 'titles') {
    const list = p.get('list') || '', page = Math.min(20, Math.max(1, Math.floor(Number(p.get('page'))) || 1));
    let j: any;
    if (list === 'search') {
      const q = (p.get('q') || '').trim();
      if (!q || q.length > 100) return [400, { error: 'bad search' }, 0];
      j = await tmdb(`search/${kind}`, { query: q, include_adult: 'false', language: lang, page: String(page) });
    } else if (list === 'popular' || list === 'top_rated') j = await tmdb(`${kind}/${list}`, { language: lang, page: String(page) });
    else return [400, { error: 'bad list' }, 0];
    const rows = ((j && j.results) || []).filter((x: any) => x && !x.adult).slice(0, 20);
    const ids = await Promise.all(rows.map((x: any) => tmdb(`${kind}/${num(x.id)}/external_ids`).catch(() => null)));
    const results = rows.map((x: any, i: number) => ({
      id: num(x.id), imdb_id: str(ids[i] && ids[i].imdb_id, 12), title: str(x.title, 200), name: str(x.name, 200), overview: str(x.overview, 1200),
      release_date: str(x.release_date, 10), first_air_date: str(x.first_air_date, 10), poster_path: str(x.poster_path, 80), backdrop_path: str(x.backdrop_path, 80),
      genre_ids: Array.isArray(x.genre_ids) ? x.genre_ids.filter((g: unknown) => typeof g === 'number').slice(0, 6) : [],
    })).filter((x: any) => /^tt\d{5,10}$/.test(x.imdb_id));
    return [200, { results }, list === 'search' ? 3600 : 6 * 3600];
  }
  if (a === 'title') {
    const tt = p.get('tt') || '';
    if (!/^tt\d{5,10}$/.test(tt)) return [400, { error: 'bad title id' }, 0];
    const f = await tmdb(`find/${tt}`, { external_source: 'imdb_id' });
    const hit = f && ((f.movie_results || [])[0] ? { k: 'movie', x: f.movie_results[0] } : (f.tv_results || [])[0] ? { k: 'tv', x: f.tv_results[0] } : null);
    if (!hit) return [200, { title: null }, 86400];
    const tid = num(hit.x.id), d = await tmdb(`${hit.k}/${tid}`, { language: lang, append_to_response: 'credits,videos' });
    if (!d) return [200, { title: null }, 86400];
    const eps: any[] = [];
    if (hit.k === 'tv') {
      const ns = (d.seasons || []).map((v: any) => v && v.season_number).filter((n: unknown) => Number.isInteger(n) && (n as number) >= 0).slice(0, 60) as number[];
      for (let i = 0; i < ns.length; i += 20) {
        const part = ns.slice(i, i + 20), sx = await tmdb(`tv/${tid}`, { language: lang, append_to_response: part.map((n) => `season/${n}`).join(',') });
        for (const n of part) {
          const v = sx && sx[`season/${n}`]; if (!v) continue;
          eps.push({ season_number: n, episodes: (v.episodes || []).slice(0, 400).map((e: any) => ({
            season_number: num(e.season_number), episode_number: num(e.episode_number), name: str(e.name, 200), overview: str(e.overview, 1200),
            air_date: str(e.air_date, 10), still_path: str(e.still_path, 80),
          })) });
        }
      }
    }
    const crew = ((d.credits && d.credits.crew) || []).filter((c: any) => /^(Director|Screenplay|Writer)$/.test(c && c.job)).slice(0, 12).map((c: any) => ({ name: str(c.name, 120), job: str(c.job, 40) }));
    return [200, { title: {
      kind: hit.k, id: tid, title: str(d.title, 200), name: str(d.name, 200), overview: str(d.overview, 3000), status: str(d.status, 40),
      release_date: str(d.release_date, 10), first_air_date: str(d.first_air_date, 10), last_air_date: str(d.last_air_date, 10),
      runtime: num(d.runtime), episode_run_time: Array.isArray(d.episode_run_time) ? d.episode_run_time.filter((n: unknown) => typeof n === 'number').slice(0, 1) : [],
      genres: (d.genres || []).slice(0, 8).map((g: any) => ({ name: str(g && g.name, 60) })), poster_path: str(d.poster_path, 80), backdrop_path: str(d.backdrop_path, 80),
      created_by: (d.created_by || []).slice(0, 4).map((c: any) => ({ name: str(c && c.name, 120) })),
      credits: { cast: ((d.credits && d.credits.cast) || []).slice(0, 12).map((c: any) => ({ name: str(c.name, 120), character: str(c.character, 160) })), crew },
      videos: { results: ((d.videos && d.videos.results) || []).filter((v: any) => v && v.site === 'YouTube' && /^(Trailer|Teaser)$/.test(v.type)).slice(0, 6).map((v: any) => ({ key: str(v.key, 20), site: 'YouTube', type: str(v.type, 20), name: str(v.name, 120) })) },
      eps,
    } }, 86400];
  }
  if (a === 'recs') {
    const tt = p.get('tt') || '', n = Math.min(20, Math.max(4, Math.floor(Number(p.get('n'))) || 16));
    if (!/^tt\d{5,10}$/.test(tt)) return [400, { error: 'bad title id' }, 0];
    const f = await tmdb(`find/${tt}`, { external_source: 'imdb_id' });
    const hit = f && ((f.movie_results || [])[0] ? { k: 'movie', x: f.movie_results[0] } : (f.tv_results || [])[0] ? { k: 'tv', x: f.tv_results[0] } : null);
    if (!hit) return [200, { anchor: null, results: [] }, 86400];
    const tid = num(hit.x.id);
    // what fans of a title watch next, ranked for relevance: TMDB's "viewers also liked" (two pages) plus the best-known
    // titles sharing its story keywords, each scored by shared keywords, shared genres, quality and how many people
    // rated it. (TMDB's own order alone puts mediocre titles first; its "similar" list is mostly noise.)
    const kwOf = async (k: string, id: number) => { const j = await tmdb(`${k}/${id}/keywords`).catch(() => null); return ((j && (j.keywords || j.results)) || []).map((x: any) => num(x.id)).filter((x: number) => x && !GENERIC_KW.has(x)); };
    const [r1, r2, akw] = await Promise.all([tmdb(`${hit.k}/${tid}/recommendations`, { language: lang, page: '1' }).catch(() => null), tmdb(`${hit.k}/${tid}/recommendations`, { language: lang, page: '2' }).catch(() => null), kwOf(hit.k, tid)]);
    const pool = new Map<number, any>();
    [...((r1 && r1.results) || []), ...((r2 && r2.results) || [])].forEach((x: any, i: number) => { if (x && num(x.vote_count) >= 80 && !pool.has(num(x.id))) pool.set(num(x.id), { x, pos: i }); });
    if (akw.length) {
      const q: Record<string, string> = { language: lang, include_adult: 'false', page: '1', with_keywords: akw.slice(0, 12).join('|'), sort_by: 'vote_count.desc', 'vote_count.gte': hit.k === 'tv' ? '150' : '400' };
      const g0 = num((hit.x.genre_ids || [])[0]); if (g0) q.with_genres = String(g0);
      const d = await tmdb(`discover/${hit.k}`, q).catch(() => null);
      ((d && d.results) || []).forEach((x: any) => { if (x && num(x.id) !== tid && !pool.has(num(x.id))) pool.set(num(x.id), { x, pos: 60 }); });
    }
    pool.delete(tid);
    const cands = [...pool.values()].slice(0, 48), aset = new Set(akw), ag = new Set((hit.x.genre_ids || []).map(num));
    const kws = await Promise.all(cands.map((c) => kwOf(c.x.media_type === 'tv' || (!c.x.media_type && hit.k === 'tv') ? 'tv' : c.x.media_type === 'movie' ? 'movie' : hit.k, num(c.x.id))));
    const scored = cands.map((c, i) => {
      const shared = kws[i].filter((k: number) => aset.has(k)).length, gs = (c.x.genre_ids || []).filter((g: number) => ag.has(num(g))).length;
      const s = Math.min(4, shared) * 2.6 + gs * 1.1 + (num(c.x.vote_average) - 6.5) * 1.4 + Math.log10(num(c.x.vote_count) + 1) * 0.6 + (c.pos < 60 ? (1 - c.pos / 40) * 1.5 : 0) + ((c.x.media_type || hit.k) === hit.k ? 0 : -2);
      return { x: c.x, s };
    }).sort((a, b) => b.s - a.s);
    const rows = scored.map((y) => y.x);
    const results = await rowsWithIds(rows.map((x: any) => ({ ...x, media_type: x.media_type || hit.k })), hit.k, n);
    return [200, { anchor: { kind: hit.k, id: tid, name: str(hit.x.title || hit.x.name, 200), genre_ids: (hit.x.genre_ids || []).slice(0, 6) }, results }, 86400];
  }
  if (a === 'discover') {
    const n = Math.min(20, Math.max(4, Math.floor(Number(p.get('n'))) || 16)), today = new Date().toISOString().slice(0, 10);
    const q: Record<string, string> = { language: lang, include_adult: 'false', page: '1' };
    const g = idList(p.get('g'), 4), ng = idList(p.get('ng'), 6), kw = idList(p.get('kw'), 4, '|'), yf = p.get('yf') || '', yt = p.get('yt') || '';
    if (g.length) q.with_genres = g.join(',');
    // talk, news, soap, reality and kids' TV crowd out real shows unless asked for
    const ngAll = kind === 'tv' ? [...new Set([...ng, ...['10767', '10763', '10766', '10764', '10762'].filter((x) => !g.includes(x))])] : ng;
    if (ngAll.length) q.without_genres = ngAll.join(',');
    if (kw.length) q.with_keywords = kw.join('|');
    const dk = kind === 'tv' ? 'first_air_date' : 'primary_release_date';
    if (/^(19|20)\d\d$/.test(yf)) q[`${dk}.gte`] = `${yf}-01-01`;
    if (/^(19|20)\d\d$/.test(yt)) q[`${dk}.lte`] = `${yt}-12-31`;
    const rt = Math.floor(Number(p.get('rt'))); if (rt >= 20 && rt <= 400) q['with_runtime.lte'] = String(rt);
    const ol = p.get('ol') || ''; if (/^[a-z]{2}$/.test(ol)) q.with_original_language = ol;
    if (p.get('fam') === '1' && kind === 'movie') { q.certification_country = 'US'; q['certification.lte'] = 'PG'; }
    const pp = (p.get('pp') || '').trim();
    if (pp) {
      if (pp.length > 80) return [400, { error: 'bad name' }, 0];
      if (kind === 'tv') return [200, { results: [] }, 21600]; // TMDB can't filter shows by person
      const sp = await tmdb('search/person', { query: pp, include_adult: 'false' });
      const who = ((sp && sp.results) || []).filter((x: any) => !x.adult).sort((x: any, y: any) => num(y.popularity) - num(x.popularity))[0];
      if (!who) return [200, { results: [], person: null }, 3600];
      q.with_people = String(num(who.id));
    }
    const sort = p.get('sort') || 'pop';
    // a broad ask (no theme, person, language or two genres) needs a higher vote floor, or brand-new and niche titles top it
    const broad = !q.with_keywords && !q.with_people && !q.with_original_language && g.length < 2;
    if (sort === 'top') { q.sort_by = 'vote_average.desc'; q['vote_count.gte'] = kind === 'tv' ? (broad ? '700' : '200') : (broad ? '2000' : '600'); }
    else if (sort === 'gem') { if (!g.includes('16') && ol !== 'ja') q.without_genres = [...new Set([...(q.without_genres ? q.without_genres.split(',') : []), '16'])].join(','); q.sort_by = 'vote_average.desc'; q['vote_count.gte'] = kind === 'tv' ? '120' : '300'; q['vote_count.lte'] = kind === 'tv' ? '1500' : '4000'; q['vote_average.gte'] = '7.0'; }
    else if (sort === 'new') { q.sort_by = `${dk}.desc`; q[`${dk}.lte`] = today; q['vote_count.gte'] = kind === 'tv' ? '60' : '150'; if (!q[`${dk}.gte`]) q[`${dk}.gte`] = `${Number(today.slice(0, 4)) - 3}-01-01`; }
    else { q.sort_by = 'popularity.desc'; q['vote_count.gte'] = q.with_people ? '20' : '150'; }
    const j = await tmdb(`discover/${kind}`, q);
    const results = await rowsWithIds((j && j.results) || [], kind, n);
    return [200, { results }, 6 * 3600];
  }
  if (a === 'trending') {
    const k = p.get('kind'), mk = k === 'tv' ? 'tv' : k === 'movie' ? 'movie' : 'all', w = p.get('w') === 'day' ? 'day' : 'week';
    const page = Math.min(3, Math.max(1, Math.floor(Number(p.get('page'))) || 1)), n = Math.min(20, Math.max(4, Math.floor(Number(p.get('n'))) || 20));
    const j = await tmdb(`trending/${mk}/${w}`, { language: lang, page: String(page) });
    // talk, news, soap and reality shows trend every week but are not what people come to discover
    const skip = new Set([10767, 10763, 10766, 10764]);
    const rows = ((j && j.results) || []).filter((x: any) => x && (x.media_type === 'movie' || x.media_type === 'tv') && !(x.genre_ids || []).some((g: number) => skip.has(g)));
    const results = await rowsWithIds(rows, mk === 'tv' ? 'tv' : 'movie', n);
    return [200, { results }, 3 * 3600];
  }
  if (a === 'fresh') {
    // films: a digital or disc release in the viewer's region lately, most popular first (so they can be watched at home);
    // shows: first aired lately, most popular first
    const n = Math.min(20, Math.max(4, Math.floor(Number(p.get('n'))) || 20)), page = Math.min(3, Math.max(1, Math.floor(Number(p.get('page'))) || 1));
    const days = Math.min(365, Math.max(30, Math.floor(Number(p.get('days'))) || 120)), region = /^[A-Z]{2}$/.test(p.get('region') || '') ? p.get('region')! : 'US';
    const now = Date.now(), today = new Date(now).toISOString().slice(0, 10), from = new Date(now - days * 86400_000).toISOString().slice(0, 10);
    const g = idList(p.get('g'), 4);
    const q: Record<string, string> = { language: lang, include_adult: 'false', page: String(page), sort_by: 'popularity.desc' };
    if (g.length) q.with_genres = g.join(',');
    if (kind === 'tv') {
      Object.assign(q, { 'first_air_date.gte': from, 'first_air_date.lte': today, 'vote_count.gte': g.length ? '3' : '10' });
      q.without_genres = ['10767', '10763', '10766', '10764', '10762'].filter((x) => !g.includes(x)).join(',');
    } else {
      Object.assign(q, { 'release_date.gte': from, 'release_date.lte': today, with_release_type: '4|5', region, 'vote_count.gte': '25', without_genres: '10770' });
      if (p.get('fam') === '1') { q.certification_country = 'US'; q['certification.lte'] = 'PG'; }
    }
    const j = await tmdb(`discover/${kind}`, q);
    const results = await rowsWithIds((j && j.results) || [], kind, n);
    return [200, { results }, 6 * 3600];
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
