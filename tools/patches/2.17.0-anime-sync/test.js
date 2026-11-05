// node test.js <outdir> [tv]   (build served on http://localhost:8801/)
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2], TV = process.argv[3] === 'tv';
const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.fake-token-for-tests-only-0123456789abcdef';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: TV ? { width: 1920, height: 1080 } : { width: 1440, height: 900 }, userAgent: TV ? 'Mozilla/5.0 (Linux; Android 12; AFTKA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 MKCinemaTV/1.4.0' : undefined });
  const page = await ctx.newPage();
  const logs = []; page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  const gql = []; let entry = { progress: 3, status: 'CURRENT' }, expired = false;
  await ctx.route(/^https?:\/\/(?!localhost)/, async (r) => {
    const u = r.request().url();
    if (/graphql\.anilist\.co/.test(u)) {
      const body = JSON.parse(r.request().postData() || '{}'); const auth = r.request().headers().authorization || '';
      gql.push({ q: body.query.replace(/\s+/g, ' ').slice(0, 60), v: body.variables, auth: auth.slice(0, 12) });
      if (expired) return r.fulfill({ status: 401, json: { errors: [{ message: 'Invalid token', status: 401 }] } });
      if (/Viewer/.test(body.query)) return r.fulfill({ json: { data: { Viewer: { id: 77, name: 'drakeTest' } } } });
      if (/SaveMediaListEntry/.test(body.query)) { entry = { progress: body.variables.p, status: body.variables.s }; return r.fulfill({ json: { data: { SaveMediaListEntry: { id: 1 } } } }); }
      if (/MediaListCollection/.test(body.query)) return r.fulfill({ json: { data: { MediaListCollection: { lists: [{ entries: [
        { media: { id: 1, idMal: 1, format: 'TV', title: { english: 'Imdb Show', romaji: 'x' }, startDate: { year: 1998 }, coverImage: { large: 'https://img.test/1.jpg' } } },
        { media: { id: 2, idMal: 2, format: 'MOVIE', title: { english: null, romaji: 'Kitsu Film' }, startDate: { year: 2001 }, coverImage: { large: 'https://img.test/2.jpg' } } },
        { media: { id: 3, idMal: 3, format: 'TV', title: { english: 'Unmapped' }, startDate: { year: 2020 }, coverImage: { large: '' } } }] }] } } } });
      if (/Media\(idMal/.test(body.query)) return r.fulfill({ json: { data: { Media: { id: 900 + body.variables.m, episodes: 12, mediaListEntry: entry } } } });
      return r.fulfill({ json: { data: {} } });
    }
    if (/kitsu\.io\/api\/edge\/anime\/41\/mappings/.test(u)) return r.fulfill({ json: { data: [{ attributes: { externalSite: 'myanimelist/anime', externalId: '20' } }] } });
    if (/arm\.haglund\.dev\/api\/v2\/imdb\?id=tt0000555/.test(u)) return r.fulfill({ json: [{ myanimelist: 30, media: 'TV', 'thetvdb-season': 1 }] });
    if (/arm\.haglund\.dev\/api\/v2\/ids\?source=anilist&id=1$/.test(u)) return r.fulfill({ json: { imdb: 'tt0213338', kitsu: 1 } });
    if (/arm\.haglund\.dev\/api\/v2\/ids\?source=anilist&id=2$/.test(u)) return r.fulfill({ json: { kitsu: 778 } });
    if (/arm\.haglund\.dev\/api\/v2\/ids/.test(u)) return r.fulfill({ json: {} });
    if (/fonts\.g/.test(u)) return r.continue();
    return r.abort();
  });
  await ctx.addInitScript(() => { ['toured', 'navAsked', 'askedFocus', 'support.never'].forEach((k) => localStorage.setItem('mkc:' + k, 'true')); if (!localStorage.getItem('mkc:cfg')) localStorage.setItem('mkc:cfg', JSON.stringify({ introMode: 'never' })); window.open = (u) => { window.__opened = u; return null; }; });
  await page.goto('http://localhost:8801/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof AniList !== 'undefined', null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  const r = {};
  await page.evaluate(() => openSettings('sync')); await page.waitForTimeout(1200);
  r.section = await page.evaluate(() => [SECTIONS.find((x) => x.id === 'sync').label, !!document.querySelector('#set-anilistId'), !!document.querySelector('#ani-go')]);
  await page.evaluate(() => { AniList.save({ clientId: '12345' }); renderSettingsBody(); }); await page.waitForTimeout(300);
  await page.click('#ani-go'); await page.waitForTimeout(400);
  r.connect = await page.evaluate(() => [window.__opened || null, !document.querySelector('#ani-tokBox').hidden, !document.querySelector('#ani-qr').hidden, document.querySelector('#ani-st').textContent]);
  await page.screenshot({ path: path.join(OUT, `anilist-connect${TV ? '-tv' : ''}.png`) });
  await page.evaluate((v) => { const i = document.querySelector('#ani-tok'); i.removeAttribute('readonly'); i.value = v; }, `https://anilist.co/api/v2/oauth/pin#access_token=${TOKEN}&token_type=Bearer&expires_in=31536000`);
  await page.click('#ani-save'); await page.waitForTimeout(800);
  r.connected = await page.evaluate(() => [AniList.on(), AniList.cfg().user, AniList.cfg().uid, (document.querySelector('#ani-st') || {}).textContent]);
  await page.screenshot({ path: path.join(OUT, `anilist-connected${TV ? '-tv' : ''}.png`) });
  // 1. Kitsu addon episode, through the real 80 % hook
  gql.length = 0;
  await page.evaluate(() => { Scrobble.ctx = { meta: { id: 'kitsu:41', type: 'series', name: 'K', genres: ['Anime'] }, video: { id: 'kitsu:41:5', season: 1, episode: 5 } }; Scrobble.done = false; Scrobble.pct = () => 90; Scrobble.check(); });
  await page.waitForTimeout(800);
  r.kitsu = { calls: gql.map((g) => g.q.slice(0, 30) + ' ' + JSON.stringify(g.v)), entry, toast: await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).join(' | ')) };
  // 2. lower episode: no change
  gql.length = 0;
  await page.evaluate(() => AnimeSync.watched({ meta: { id: 'kitsu:41', type: 'series', genres: [] }, video: { id: 'kitsu:41:2' } })); await page.waitForTimeout(300);
  r.noLower = { mutations: gql.filter((g) => /mutation/.test(g.q)).length, entry };
  // 3. IMDb (Cinemeta) anime, last episode → Completed
  gql.length = 0;
  await page.evaluate(() => AnimeSync.watched({ meta: { id: 'tt0000555', type: 'series', name: 'Imdb Anime', genres: ['Animation', 'Action'] }, video: { id: 'tt0000555:1:12', season: 1, episode: 12 } })); await page.waitForTimeout(500);
  r.imdb = { calls: gql.map((g) => JSON.stringify(g.v)), entry };
  // 4. not anime: nothing
  gql.length = 0;
  await page.evaluate(() => AnimeSync.watched({ meta: { id: 'tt0111161', type: 'movie', genres: ['Drama'] }, video: null })); await page.waitForTimeout(300);
  r.notAnime = gql.length;
  // 5. import
  const before = await page.evaluate(() => S.watchlist.length);
  await page.click('#ani-in'); await page.waitForTimeout(1200);
  r.import = await page.evaluate((n) => ({ added: S.watchlist.length - n, items: S.watchlist.slice(-2).map((m) => [m.id, m.type, m.name, !!m.poster]) }), before);
  // 6. expired token
  expired = true;
  await page.evaluate(() => AnimeSync.watched({ meta: { id: 'kitsu:41', type: 'series', genres: [] }, video: { id: 'kitsu:41:9' } })); await page.waitForTimeout(500);
  r.expired = await page.evaluate(() => [AniList.on(), Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).slice(-1)[0]]);
  r.errors = logs;
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
