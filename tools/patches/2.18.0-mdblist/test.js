// node test.js <outdir>   (build served on http://localhost:8801/; MDBList and Cinemeta mocked)
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2];
const meta = (i) => ({ id: 'tt99999' + (10 + i), type: 'movie', name: 'Cat ' + i, poster: 'https://img.fake.test/p.jpg', genres: ['Drama'] });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const logs = []; page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  const hits = [];
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => {
    const u = r.request().url();
    if (/mdblist\.com/.test(u)) hits.push(u.replace(/apikey=[^&]+/, 'apikey=KEY'));
    if (/mdblist\.com\/lists\/drake\/best-anime\/json$/.test(u)) return r.fulfill({ json: [  // public JSON: not used (no CORS live)
      { id: 1, rank: 2, title: 'Second', imdb_id: 'tt0000002', mediatype: 'show', release_year: 2001 },
      { id: 2, rank: 1, title: 'First', imdb_id: 'tt0000001', mediatype: 'movie', release_year: 1999 },
      { id: 3, rank: 3, title: 'No imdb', imdb_id: '', mediatype: 'movie' }], headers: { 'access-control-allow-origin': '*' } });
    if (/api\.mdblist\.com\/lists\/drake\/best-anime\/items/.test(u)) return r.fulfill({ json: { movies: [{ rank: 1, title: 'Api Film', imdb_id: 'tt0000011', mediatype: 'movie', release_year: 2010 }], shows: [{ rank: 2, title: 'Api Show', imdb_id: 'tt0000012', mediatype: 'show', release_year: 2012 }] }, headers: { 'access-control-allow-origin': '*' } });
    if (/mdblist\.com\/lists\/drake\/missing/.test(u)) return r.fulfill({ status: 404, body: 'nope' });
    if (/cinemeta.*manifest\.json/.test(u)) return r.fulfill({ json: { id: 'com.linvo.cinemeta', version: '3.0.0', name: 'Cinemeta', resources: ['catalog', 'meta'], types: ['movie', 'series'], catalogs: [{ type: 'movie', id: 'top', name: 'Popular' }], idPrefixes: ['tt'] } });
    if (/cinemeta.*\/catalog\//.test(u)) return r.fulfill({ json: { metas: Array.from({ length: 30 }, (_, i) => meta(i)) } });
    if (/fonts\.g/.test(u)) return r.continue();
    return r.abort();
  });
  await ctx.addInitScript(() => { ['toured', 'navAsked', 'askedFocus', 'support.never'].forEach((k) => localStorage.setItem('mkc:' + k, 'true')); if (!localStorage.getItem('mkc:cfg')) localStorage.setItem('mkc:cfg', JSON.stringify({ introMode: 'never' })); });
  await page.goto('http://localhost:8801/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof MDB !== 'undefined', null, { timeout: 20000 });
  await page.waitForTimeout(3000);
  const r = {};
  r.parse = await page.evaluate(() => ['https://mdblist.com/lists/drake/best-anime', 'mdblist.com/lists/drake/best-anime/json', 'https://www.mdblist.com/lists/drake/best-anime?sort=rank', 'drake/best-anime', 'https://example.com/x'].map((x) => { try { const l = MDB.parse(x); return l.user + '/' + l.slug; } catch (e) { return 'ERR'; } }));
  await page.evaluate(() => openSettings('home')); await page.waitForTimeout(1000);
  await page.fill('#mdbUrl', 'https://mdblist.com/lists/drake/best-anime'); await page.click('#mdbGo'); await page.waitForTimeout(800);
  r.noKey = await page.evaluate(() => [Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).slice(-1)[0], (Layout.get().mdb || []).length]);
  await page.evaluate(() => { Keys.set('mdblist', 'abc123'); renderSettingsBody(); }); await page.waitForTimeout(400);
  await page.fill('#mdbUrl', 'https://mdblist.com/lists/drake/best-anime'); await page.click('#mdbGo'); await page.waitForTimeout(800);
  r.added = await page.evaluate(() => [JSON.stringify(Layout.get().mdb), Array.from(document.querySelectorAll('.mdb-item b')).map((x) => x.textContent), Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).join(' | ')]);
  await page.screenshot({ path: path.join(OUT, 'mdblist-settings.png') });
  await page.fill('#mdbUrl', 'drake/missing'); await page.click('#mdbGo'); await page.waitForTimeout(600);
  r.missing = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).slice(-1)[0]);
  await page.evaluate(() => { closeLayer('settings'); go('home'); }); await page.waitForTimeout(2500);
  r.home = await page.evaluate(() => { const s = document.querySelector('#homeRows [data-mdb]'); if (!s) return null; const lab = (x) => String((x && x.querySelector && x.querySelector('.row-title') && x.querySelector('.row-title').textContent) || (x && x.className) || '').trim().slice(0, 30); const all = [...document.querySelectorAll('#homeRows > section')], k = all.indexOf(s); return { title: s.querySelector('.row-title').textContent, cards: [...s.querySelectorAll('.card-title')].map((x) => x.textContent), before: all.slice(0, k).map(lab), after: lab(all[k + 1]) }; });
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#homeRows [data-mdb]').getBoundingClientRect().top + scrollY - 200)); await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'mdblist-home.png') });
  // cached: no new request on re-render
  const n = hits.length; await page.evaluate(() => renderHome()); await page.waitForTimeout(1500);
  r.cached = hits.length === n;
  // remove
  await page.evaluate(() => MDB.remove('drake/best-anime')); await page.waitForTimeout(1200);
  r.removed = await page.evaluate(() => !document.querySelector('#homeRows [data-mdb]') && !(Layout.get().mdb || []).length);
  r.requests = hits; r.errors = logs;
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
