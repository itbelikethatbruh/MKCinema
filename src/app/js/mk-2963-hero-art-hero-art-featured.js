/* 2.96.3 hero art: the featured banner only shows titles with a real picture and a well-known name */
const HeroArt = {
  KEY: 'heroArt', OK_TTL: 7 * 864e5, BAD_TTL: 2 * 864e5,
  // metahub answers a missing backdrop with its own red stand-in picture (200 OK) in these sizes
  STANDIN: /^(780x439|1279x720|1672x941)$/,
  mem: null, wait: new Map(), tok: 0, gen: 0, relax: false, refills: 0, inner: false, pool: [],
  store() {
    if (!this.mem) {
      const raw = Store.raw.get(this.KEY, {}), now = Date.now(); this.mem = new Map();
      Object.entries(raw && typeof raw === 'object' ? raw : {}).forEach(([k, v]) => { if (Array.isArray(v) && now - v[1] < (v[0] === 2 ? this.OK_TTL : this.BAD_TTL)) this.mem.set(k, v); });
    }
    return this.mem;
  },
  save() { const m = this.store(); while (m.size > 400) m.delete(m.keys().next().value); clearTimeout(this.saveT); this.saveT = setTimeout(() => Store.raw.set(this.KEY, Object.fromEntries(m)), 800); },
  // 2 = real picture and a logo, 1 = real picture only, 0 = no real picture, undefined = not checked yet
  state(m) { if (!m || !m.id || !metaBg(m)) return 0; const v = this.store().get(String(m.id)); return v ? (v[0] === 2 && this.obscure(m) ? 1 : v[0]) : undefined; },
  // Cinemeta's popularity (from IMDb's daily chart): under 1 means hardly anyone looks the title up
  obscure(m) { return typeof m.popularity === 'number' && m.popularity < 1; },
  allowed(st) { return st === 2 || (st === 1 && (this.relax || CFG.bannerFrom === 'mine')); },
  load(url, ms) {
    return new Promise((res) => {
      if (!url) { res(null); return; }
      const im = new Image(); let done = false;
      const end = (v) => { if (done) return; done = true; clearTimeout(t); im.onload = im.onerror = null; res(v); };
      const t = setTimeout(() => end(undefined), ms);
      im.referrerPolicy = 'no-referrer'; im.decoding = 'async';
      im.onload = () => end({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => end(null);
      im.src = url;
    });
  },
  real(url, d) { return !!(d && d.w >= 400 && d.h >= 200 && !(/metahub\.space\//.test(url) && this.STANDIN.test(`${d.w}x${d.h}`))); },
  async judge(m) {
    let url = metaBg(m), d = await this.load(url, 9000);
    if (d === undefined) return undefined; // too slow to tell: checked again next time
    if (!this.real(url, d) && typeof ArtFix !== 'undefined') {
      const v = await ArtFix.get(m).catch(() => undefined);
      if (v && ArtFix.apply(m, v)) { url = metaBg(m); d = await this.load(url, 9000); if (d === undefined) return undefined; }
    }
    if (!this.real(url, d)) return 0;
    const lg = metaLogo(m), l = lg ? await this.load(lg, 6000) : null;
    return l && l.w >= 40 ? 2 : 1;
  },
  check(m) {
    const st = this.state(m); if (st !== undefined) return Promise.resolve(st);
    const k = String(m.id); if (this.wait.has(k)) return this.wait.get(k);
    const p = this.judge(m).catch(() => undefined).then((v) => {
      if (v === undefined) return v;
      this.store().set(k, [v, Date.now()]); this.save();
      return this.state(m);
    }).finally(() => this.wait.delete(k));
    this.wait.set(k, p); return p;
  },
  dots() {
    $('#heroDots').innerHTML = S.hero.map((_, i) => `<button type="button" aria-label="Show featured ${i + 1}"></button>`).join('');
    $$('#heroDots button').forEach((b, i) => { b.addEventListener('click', () => showHero(i, i < S.heroIdx ? -1 : 1)); b.classList.toggle('on', i === S.heroIdx); });
  },
  set(list) { this.inner = true; try { setHeroList(list); } finally { this.inner = false; } },
  // nothing left: other Home rows first, then titles with a real picture but no logo, then no banner at all
  empty() {
    clearTimeout(this.emptyT);
    if (this.refills < 6) {
      this.refills++;
      const have = new Set(), out = [];
      $$('#homeRows section[data-rk^="cat:"] [data-card][data-id]').forEach((c) => {
        const m = S.metas.get(c.dataset.id); if (!m || have.has(m.id)) return; have.add(m.id);
        const st = this.state(m); if (st === 2 || st === undefined) out.push(m);
      });
      if (out.length) { this.set(out.slice(0, 8)); return; }
    }
    if (!this.relax && this.pool.some((m) => this.state(m) === 1)) { this.relax = true; this.set(this.pool.filter((m) => this.state(m) === 1).slice(0, 8)); return; }
    this.none = true; S.hero = []; clearTimeout(S.heroTimer); const h = $('#hero'); if (h) { h.classList.remove('mk-ha-hold'); h.hidden = true; }
    // the other rows may still be on their way: look again a little later
    if (this.refills < 6) this.emptyT = setTimeout(() => { if (this.none && !S.hero.length && S.view === 'home') { this.relax = false; this.empty(); } }, 2000);
  },
  drop(m) {
    const i = S.hero.indexOf(m); if (i < 0) return;
    const cur = i === S.heroIdx; S.hero.splice(i, 1);
    if (!S.hero.length) { this.empty(); return; }
    if (i < S.heroIdx) S.heroIdx--;
    if (S.heroIdx >= S.hero.length) S.heroIdx = 0;
    this.dots();
    if (cur) showHero(S.heroIdx, 1);
  },
  // checks every banner title, three at a time, in banner order, so the ones that fail leave before they come round
  sweep() {
    const gen = this.gen, q = S.hero.filter((m) => this.state(m) === undefined); let i = 0;
    const run = () => {
      const m = q[i++]; if (!m) return;
      this.check(m).then((st) => {
        if (gen === this.gen && st !== undefined && !this.allowed(st) && S.hero.includes(m) && !(S.hero[S.heroIdx] === m && $('#hero.mk-ha-hold'))) this.drop(m);
        run();
      }, run);
    };
    run(); run(); run();
  },
  hold(m) {
    const h = $('#hero'); if (!h) return; const tok = this.tok;
    h.classList.add('mk-ha-hold');
    const rel = () => {
      if (tok !== this.tok) return; h.classList.remove('mk-ha-hold');
      const hb = $('#hero .hero-body'); if (hb) { hb.classList.remove('swap'); requestAnimationFrame(() => hb.classList.add('swap')); }
    };
    // still unknown after 2.5 s: move on to a title already known to be fine, and only show this one when none is
    const late = () => {
      if (tok !== this.tok) return;
      const n = S.hero.length;
      for (let k = 1; k < n; k++) { const j = (S.heroIdx + k) % n; if (this.allowed(this.state(S.hero[j]))) { showHero(j, 1); return; } }
      rel();
    };
    const t = setTimeout(late, 2500);
    this.check(m).then((st) => {
      if (tok !== this.tok) return; clearTimeout(t);
      if (S.hero[S.heroIdx] === m && st !== undefined && !this.allowed(st)) { this.drop(m); if (tok === this.tok) rel(); } else rel();
    });
  },
  init() {
    const sl = setHeroList;
    setHeroList = function (list) {
      const H = HeroArt;
      if (!H.inner) { H.relax = false; H.refills = 0; H.pool = (list || []).slice(); clearTimeout(H.emptyT); }
      H.none = false;
      H.gen++;
      let l = (list || []).filter((m) => { const st = H.state(m); return st === undefined || H.allowed(st); });
      // titles already known to be fine go first, so the banner opens on one without waiting
      l = [...l.filter((m) => H.state(m) !== undefined), ...l.filter((m) => H.state(m) === undefined)];
      if (!l.length && (list || []).length) { const r = sl.call(this, []); H.empty(); return r; }
      const r = sl.call(this, l);
      if (S.hero.length) H.sweep();
      return r;
    };
    const sh = showHero;
    showHero = function (i) {
      const H = HeroArt; H.tok++;
      const h = $('#hero'); if (h) h.classList.remove('mk-ha-hold');
      const n = S.hero.length; if (!n) return sh.apply(this, arguments);
      const at = ((Number(i) || 0) % n + n) % n, m = S.hero[at];
      // Spotlight (one title, chosen by the viewer) is never dropped
      if (m && n > 1) { const st = H.state(m); if (st !== undefined && !H.allowed(st)) { S.heroIdx = at; H.drop(m); return; } }
      const r = sh.apply(this, arguments);
      if (m && n > 1 && S.hero[S.heroIdx] === m && H.state(m) === undefined) H.hold(m);
      return r;
    };
    // Home shows the banner box when a row gave titles; it stays hidden when none of them passed
    const rh = renderHome;
    renderHome = function () { const p = rh.apply(this, arguments); Promise.resolve(p).then(() => { if (HeroArt.none && !S.hero.length) { const h = $('#hero'); if (h) h.hidden = true; } }); return p; };
    // TVs draw Home before this script runs: check the banner that is already there
    if (S.hero && S.hero.length > 1 && !document.documentElement.classList.contains('mk-spot')) {
      this.pool = S.hero.slice(); this.gen++;
      const m = S.hero[S.heroIdx], st = this.state(m);
      if (st === undefined) this.hold(m); else if (!this.allowed(st)) this.drop(m);
      this.sweep();
    }
  },
};
HeroArt.init();
