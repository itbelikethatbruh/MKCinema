// node maltest.js <outdir> [tv]   (build served on http://localhost:8801/; the Supabase mal-relay and MyAnimeList are mocked)
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2], TV = process.argv[3] === 'tv';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: TV ? { width: 1920, height: 1080 } : { width: 1440, height: 900 }, userAgent: TV ? 'Mozilla/5.0 (Linux; Android 12; AFTKA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 MKCinemaTV/1.4.0' : undefined });
  const page = await ctx.newPage();
  const logs = []; page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  const calls = []; let entry = { status: 'watching', num_episodes_watched: 3 }, expired = false, tokenN = 0;
  await ctx.route(/^https?:\/\/(?!localhost)/, async (r) => {
    const req = r.request(), u = req.url();
    if (/\/functions\/v1\/mal-relay/.test(u)) {
      const target = new URL(new URL(u).searchParams.get('url')), h = req.headers(), body = req.postData() || '';
      calls.push({ m: req.method(), t: target.pathname + target.search, auth: (h['x-mal-auth'] || '').slice(0, 14), client: h['x-mal-client'] || '', body });
      if (target.pathname === '/v1/oauth2/token') {
        const f = new URLSearchParams(body);
        if (f.get('grant_type') === 'authorization_code' && (f.get('code') !== 'CODE1' || !f.get('code_verifier') || f.get('redirect_uri') !== 'https://mkcinema.pages.dev/')) return r.fulfill({ status: 400, json: { error: 'invalid_grant' } });
        tokenN++; expired = false;
        return r.fulfill({ json: { token_type: 'Bearer', expires_in: 2678400, access_token: `tok${tokenN}`, refresh_token: `ref${tokenN}` } });
      }
      if (expired && !/tok2/.test(h['x-mal-auth'] || '')) return r.fulfill({ status: 401, json: { error: 'invalid_token' } });
      if (target.pathname === '/v2/users/@me') return r.fulfill({ json: { id: 5, name: 'drakeMal' } });
      let m;
      if ((m = target.pathname.match(/^\/v2\/anime\/(\d+)\/my_list_status$/)) && req.method() === 'PATCH') {
        const f = new URLSearchParams(body); entry = { status: f.get('status') || entry.status, num_episodes_watched: +f.get('num_watched_episodes') };
        return r.fulfill({ json: entry });
      }
      if ((m = target.pathname.match(/^\/v2\/anime\/(\d+)$/))) return r.fulfill({ json: { id: +m[1], num_episodes: 12, my_list_status: entry } });
      if (target.pathname === '/v2/users/@me/animelist') {
        const st = target.searchParams.get('status');
        return r.fulfill({ json: { data: st === 'watching' ? [
          { node: { id: 1, title: 'Imdb Show', media_type: 'tv', start_season: { year: 1998 }, main_picture: { large: 'https://img.test/1.jpg' } } },
          { node: { id: 2, title: 'Kitsu Film', media_type: 'movie', start_season: { year: 2001 }, main_picture: { large: 'https://img.test/2.jpg' } } }] :
          [{ node: { id: 3, title: 'Unmapped', media_type: 'tv' } }] } });
      }
      return r.fulfill({ status: 404, json: {} });
    }
    if (/kitsu\.io\/api\/edge\/anime\/41\/mappings/.test(u)) return r.fulfill({ json: { data: [{ attributes: { externalSite: 'myanimelist/anime', externalId: '20' } }] } });
    if (/arm\.haglund\.dev\/api\/v2\/ids\?source=myanimelist&id=1$/.test(u)) return r.fulfill({ json: { imdb: 'tt0213338', kitsu: 1 } });
    if (/arm\.haglund\.dev\/api\/v2\/ids\?source=myanimelist&id=2$/.test(u)) return r.fulfill({ json: { kitsu: 778 } });
    if (/arm\.haglund\.dev\/api\/v2\/ids/.test(u)) return r.fulfill({ json: {} });
    if (/fonts\.g/.test(u)) return r.continue();
    return r.abort();
  });
  await ctx.addInitScript(() => { ['toured', 'navAsked', 'askedFocus', 'support.never'].forEach((k) => localStorage.setItem('mkc:' + k, 'true')); if (!localStorage.getItem('mkc:cfg')) localStorage.setItem('mkc:cfg', JSON.stringify({ introMode: 'never' })); window.open = (u) => { window.__opened = u; return null; }; });
  await page.goto('http://localhost:8801/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof Mal !== 'undefined', null, { timeout: 20000 });
  await page.waitForTimeout(2500);
  const r = {};
  await page.evaluate(() => openSettings('sync')); await page.waitForTimeout(1200);
  await page.click('#mal-go'); await page.waitForTimeout(300);
  r.noId = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).slice(-1)[0]);
  await page.evaluate(() => { Mal.save({ clientId: 'abc123' }); renderSettingsBody(); }); await page.waitForTimeout(300);
  await page.click('#mal-go'); await page.waitForTimeout(400);
  r.connect = await page.evaluate(() => { const o = window.__opened && new URL(window.__opened); return { opened: o && [o.host + o.pathname, o.searchParams.get('client_id'), o.searchParams.get('code_challenge_method'), o.searchParams.get('redirect_uri'), (o.searchParams.get('code_challenge') || '').length, o.searchParams.get('state') === Store.get('malAuth').state], box: !document.querySelector('#mal-tokBox').hidden, qr: !document.querySelector('#mal-qr').hidden, st: document.querySelector('#mal-st').textContent }; });
  await page.screenshot({ path: path.join(OUT, `mal-connect${TV ? '-tv' : ''}.png`) });
  // wrong state is refused, then the real redirect address finishes it
  await page.evaluate(() => { const i = document.querySelector('#mal-tok'); i.removeAttribute('readonly'); i.value = 'https://mkcinema.pages.dev/?code=CODE1&state=mkcWRONG'; });
  await page.click('#mal-save'); await page.waitForTimeout(500);
  r.wrongState = await page.evaluate(() => [Mal.on(), Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).slice(-1)[0]]);
  await page.evaluate(() => { const i = document.querySelector('#mal-tok'); i.value = `https://mkcinema.pages.dev/?code=CODE1&state=${Store.get('malAuth').state}`; });
  await page.click('#mal-save'); await page.waitForTimeout(800);
  r.connected = await page.evaluate(() => [Mal.on(), Mal.cfg().user, Mal.cfg().token, Store.get('malAuth', null), (document.querySelector('#mal-st') || {}).textContent]);
  r.tokenCall = calls.find((c) => c.t === '/v1/oauth2/token');
  r.tokenCall = r.tokenCall && { client: r.tokenCall.client, auth: r.tokenCall.auth, body: r.tokenCall.body.replace(/code_verifier=[^&]+/, 'code_verifier=…') };
  await page.screenshot({ path: path.join(OUT, `mal-connected${TV ? '-tv' : ''}.png`) });
  // 1. Kitsu episode through the real 80 % hook
  calls.length = 0;
  await page.evaluate(() => { Scrobble.ctx = { meta: { id: 'kitsu:41', type: 'series', name: 'K', genres: ['Anime'] }, video: { id: 'kitsu:41:5', season: 1, episode: 5 } }; Scrobble.done = false; Scrobble.pct = () => 90; Scrobble.check(); });
  await page.waitForTimeout(800);
  r.kitsu = { calls: calls.map((c) => `${c.m} ${c.t} ${c.body} [${c.auth}]`), entry, toast: await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).slice(-1)[0]) };
  // 2. lower episode: no PATCH
  calls.length = 0;
  await page.evaluate(() => AnimeSync.watched({ meta: { id: 'kitsu:41', type: 'series', genres: [] }, video: { id: 'kitsu:41:2' } })); await page.waitForTimeout(400);
  r.noLower = { patches: calls.filter((c) => c.m === 'PATCH').length, entry };
  // 3. last episode: completed
  await page.evaluate(() => AnimeSync.watched({ meta: { id: 'kitsu:41', type: 'series', genres: [] }, video: { id: 'kitsu:41:12' } })); await page.waitForTimeout(400);
  r.last = entry;
  // 4. import
  const before = await page.evaluate(() => S.watchlist.length);
  await page.click('#mal-in'); await page.waitForTimeout(1200);
  r.import = await page.evaluate((n) => ({ added: S.watchlist.length - n, items: S.watchlist.slice(-2).map((m) => [m.id, m.type, m.name, !!m.poster]), toast: Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).slice(-1)[0] }), before);
  // 5. expired token: one refresh, then the call goes through
  expired = true; calls.length = 0;
  await page.evaluate(() => AnimeSync.watched({ meta: { id: 'kitsu:41', type: 'series', genres: [] }, video: { id: 'kitsu:41:13' } })); await page.waitForTimeout(600);
  r.refresh = { calls: calls.map((c) => `${c.m} ${c.t} [${c.auth}]`), token: await page.evaluate(() => Mal.cfg().token) };
  // 6. refresh refused: signed out with a clear message
  await page.evaluate(() => Mal.save({ token: 'dead', refresh: '' })); expired = true;
  await page.evaluate(() => AnimeSync.watched({ meta: { id: 'kitsu:41', type: 'series', genres: [] }, video: { id: 'kitsu:41:14' } })); await page.waitForTimeout(500);
  r.signedOut = await page.evaluate(() => [Mal.on(), Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).slice(-1)[0]]);
  // 7. coming back from MyAnimeList on this page (?code=&state=)
  await page.evaluate(() => Mal.authUrl());
  const st = await page.evaluate(() => Store.get('malAuth').state);
  await page.goto(`http://localhost:8801/?code=CODE1&state=${st}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof Mal !== 'undefined' && Mal.on(), null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  r.boot = await page.evaluate(() => [Mal.on(), location.search, Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).join(' | ')]);
  r.errors = logs;
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
