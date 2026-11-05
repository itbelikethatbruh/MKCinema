// node test.js <outdir>   (build on http://localhost:8801/; Android app bridge and Cinemeta mocked)
const { chromium } = require('playwright');
const path = require('path');
const OUT = process.argv[2];
const series = { id: 'tt0944947', type: 'series', name: 'Test Show', genres: ['Drama'], videos: [
  { id: 'tt0944947:1:1', season: 1, episode: 1, name: 'Pilot', released: '2020-01-01T00:00:00.000Z' },
  { id: 'tt0944947:1:2', season: 1, episode: 2, name: 'Two', released: '2020-01-08T00:00:00.000Z' }] };
(async () => {
  const b = await chromium.launch();
  for (const mode of ['phone', 'tv', 'browser']) {
    const ua = mode === 'tv' ? 'Mozilla/5.0 (Linux; Android 12; AFTKA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 MKCinemaTV/1.5.0' : 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 MKCinemaAndroid/1.5.0';
    const ctx = await b.newContext(mode === 'browser' ? { viewport: { width: 1280, height: 800 } } : { viewport: { width: 390, height: 844 }, isMobile: mode === 'phone', hasTouch: true, userAgent: ua });
    const page = await ctx.newPage();
    const logs = []; page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => {
      const u = r.request().url();
      if (/cinemeta.*manifest\.json/.test(u)) return r.fulfill({ json: { id: 'com.linvo.cinemeta', version: '3.0.0', name: 'Cinemeta', resources: ['catalog', 'meta'], types: ['movie', 'series'], catalogs: [], idPrefixes: ['tt'] } });
      if (/cinemeta.*\/meta\/series\/tt0944947/.test(u)) return r.fulfill({ json: { meta: series } });
      if (/fonts\.g/.test(u)) return r.continue();
      return r.abort();
    });
    await ctx.addInitScript((mode) => {
      ['toured', 'navAsked', 'askedFocus', 'support.never'].forEach((k) => localStorage.setItem('mkc:' + k, 'true'));
      localStorage.setItem('mkc:cfg', JSON.stringify({ introMode: 'never' }));
      localStorage.setItem('mkc:watchlist', JSON.stringify([{ id: 'tt0944947', type: 'series', name: 'Test Show' }, { id: 'kitsu:1', type: 'series', name: 'Kitsu Show' }]));
      localStorage.setItem('mkc:watched', JSON.stringify({ 'tt0944947:2:3': 1 }));
      if (mode === 'browser') return;
      window.__ep = { on: false, calls: [] };
      window.MKAndroid = { version: () => '1.5.0', p2pAvailable: () => false, pipState() {}, dlList: () => '[]',
        epOn: () => window.__ep.on,
        epEnable: (v) => { window.__ep.calls.push(['enable', v]); if (v && !window.__ep.asked) { window.__ep.asked = true; setTimeout(() => { window.__ep.on = true; window.MKEpPerm && window.MKEpPerm(true); }, 200); return 'asking'; } window.__ep.on = v; return v ? 'on' : 'off'; },
        epSync: (j) => window.__ep.calls.push(['sync', JSON.parse(j)]) };
    }, mode);
    await page.goto('http://localhost:8801/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof EpAlerts !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(2500);
    const r = { mode, ok: await page.evaluate(() => EpAlerts.ok()) };
    await page.evaluate(() => openSettings('home')); await page.waitForTimeout(1000);
    r.row = await page.evaluate(() => !!document.querySelector('#set-epAlerts'));
    if (r.row) {
      await page.evaluate(() => document.querySelector('#set-epAlerts').scrollIntoView({ block: 'center' }));
      await page.click('#set-epAlerts'); await page.waitForTimeout(900);
      r.after = await page.evaluate(() => ({ on: EpAlerts.on(), calls: window.__ep.calls.map((c) => c[0] === 'sync' ? ['sync', c[1].shows] : c), sw: document.querySelector('#set-epAlerts').getAttribute('aria-checked'), toast: Array.from(document.querySelectorAll('.toast')).map((t) => t.innerText).slice(-1)[0] }));
      await page.screenshot({ path: path.join(OUT, `epalerts-${mode}.png`) });
    }
    await page.evaluate(() => closeLayer('settings'));
    // deep link from a notification
    await page.evaluate(() => { location.hash = '#open?type=series&id=tt0944947&video=tt0944947%3A1%3A2'; }); await page.waitForTimeout(1800);
    r.deep = await page.evaluate(() => [location.hash, (document.querySelector('.d-title, #detail h1, [data-view="detail"] h1') || {}).textContent || (typeof D !== 'undefined' && D.meta && D.meta.name), typeof D !== 'undefined' && D.meta && D.meta.id]);
    r.errors = logs;
    console.log(JSON.stringify(r));
    await ctx.close();
  }
  await b.close();
})();
