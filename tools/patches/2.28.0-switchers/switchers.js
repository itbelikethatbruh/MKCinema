'use strict';
/* =====================================================================
   MKCinema 2.28.0
   - Arrange Home: hide, move and rename any Home row, per seat, synced with the account.
   - Kids seats by age rating: a title rated above the seat's age limit stays off the seat, even when it is animated.
   - "Coming from Stremio?": the import, offered in the welcome tour and on an empty Home.
   ===================================================================== */

/* ---------------- Arrange Home ----------------
   Every row on Home gets a stable key (its id, its catalog, its list, else its English title). The seat's choices
   live under the per-seat Store key 'homeArrange' = { order: [key], hide: [key], names: {key: name}, titles: {key: title} }.
   Rows are moved in place (never rebuilt), so the modules that fill them keep working. A row the user never moved
   stays where its module put it. */
const Arrange = {
  KEY: 'homeArrange',
  get() { const a = Store.get(this.KEY, null) || {}; return { order: Array.isArray(a.order) ? a.order : [], hide: Array.isArray(a.hide) ? a.hide : [], names: a.names && typeof a.names === 'object' ? a.names : {}, titles: a.titles && typeof a.titles === 'object' ? a.titles : {} }; },
  save(a) { Store.set(this.KEY, a); if (typeof Account !== 'undefined') Account.schedule(); this.apply(true); },
  head(sec) { return sec.querySelector('.row-title'); },
  /* the row's own title, without its small subtitle and before any rename */
  title(sec) {
    if (sec.dataset.arrT) return sec.dataset.arrT;
    const h = this.head(sec); if (!h) return '';
    const t = [...h.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    return t || (h.textContent || '').trim();
  },
  key(sec) {
    if (sec.dataset.rk) return sec.dataset.rk;
    if (sec.id) return `#${sec.id}`;
    if (sec.dataset.curate) return `cur:${sec.dataset.curate}`;
    if (sec.dataset.mdb) return `mdb:${sec.dataset.mdb}`;
    const h = this.head(sec); if (!h) return '';
    // an English title, so the key is the same in every interface language
    let t = this.title(sec);
    if (window.i18nEn) { const tn = [...h.childNodes].find((n) => n.nodeType === 3); if (tn) { const sp = document.createElement('span'); sp.textContent = tn.textContent.trim(); try { t = i18nEn(sp) || t; } catch (e) { /* keep */ } } }
    return t ? `t:${t.toLowerCase().replace(/\s+/g, ' ').slice(0, 60)}` : '';
  },
  sections() { const rows = $('#homeRows'); return rows ? [...rows.children].filter((el) => el.matches('section.row') && this.head(el)) : []; },
  /* re-entrancy and loop guard: other modules also move rows (the network row keeps itself under Top 10) */
  busy: false, runs: [],
  apply(force) {
    const rows = $('#homeRows'); if (!rows || this.busy) return;
    const now = Date.now(); this.runs = this.runs.filter((t) => now - t < 2000);
    if (!force && this.runs.length > 8) return; this.runs.push(now);
    const a = this.get(), secs = this.sections();
    this.busy = true;
    try {
      secs.forEach((sec) => {
        const k = this.key(sec); if (!k) return;
        if (!sec.dataset.arrT) sec.dataset.arrT = this.title(sec);
        if (!sec.dataset.arrK) sec.dataset.arrK = k;
        sec.classList.toggle('arr-off', a.hide.includes(k));
        const h = this.head(sec), tn = h && [...h.childNodes].find((n) => n.nodeType === 3);
        const want = a.names[k] || sec.dataset.arrT;
        if (tn && tn.textContent.trim() !== want) tn.textContent = `${want}${tn.nextSibling ? ' ' : ''}`;
        if (h) { if (a.names[k]) h.setAttribute('translate', 'no'); else if (!sec.dataset.mdb) h.removeAttribute('translate'); }
      });
      if (a.order.length) {
        // rows the user placed take the slots such rows hold now, in the user's order; every other row stays put
        const rank = new Map(a.order.map((k, i) => [k, i]));
        const kids = [...rows.children], slots = [], placed = [];
        kids.forEach((el, i) => { const k = el.dataset && el.dataset.arrK; if (k && rank.has(k)) { slots.push(i); placed.push(el); } });
        const sorted = placed.slice().sort((x, y) => rank.get(x.dataset.arrK) - rank.get(y.dataset.arrK));
        if (sorted.some((el, i) => el !== placed[i])) {
          const final = kids.slice(); slots.forEach((s, i) => { final[s] = sorted[i]; });
          const keep = document.activeElement;
          final.forEach((el) => rows.appendChild(el));
          if (keep && keep !== document.activeElement && keep.isConnected) try { keep.focus({ preventScroll: true }); } catch (e) { /* fine */ }
        }
      }
    } finally { this.obs && this.obs.takeRecords(); this.busy = false; }
  },
  watch() {
    const rows = $('#homeRows'); if (!rows || this.obs) return;
    let raf = 0;
    this.obs = new MutationObserver(() => { if (this.busy) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => this.apply()); });
    this.obs.observe(rows, { childList: true });
  },
  /* ---- the editor ---- */
  list() {
    const a = this.get(), seen = new Set(), out = [];
    this.sections().forEach((sec) => { const k = sec.dataset.arrK || this.key(sec); if (!k || seen.has(k)) return; seen.add(k); out.push({ k, t: sec.dataset.arrT || this.title(sec) }); });
    // hidden or not-yet-loaded rows the user arranged before still show in the list, at their saved place
    a.order.forEach((k, i) => { if (seen.has(k)) return; seen.add(k); const t = a.titles[k]; if (!t) return; const after = a.order.slice(0, i).reverse().find((x) => out.some((o) => o.k === x)); const at = after ? out.findIndex((o) => o.k === after) + 1 : 0; out.splice(at, 0, { k, t, gone: true }); });
    a.hide.forEach((k) => { if (!seen.has(k) && a.titles[k]) { seen.add(k); out.push({ k, t: a.titles[k], gone: true }); } });
    return out;
  },
  open() {
    const go = () => {
      if (S.view !== 'home') go0('home');
      const el = X8.layer('arrangeHome', { label: 'Arrange Home', icon: 'layout-list', eyebrow: 'Arrange Home' });
      el.querySelector('.x8-modal').classList.add('arr-modal');
      this.render(); X8.open('arrangeHome');
      if (IS_TV) setTimeout(() => { const f = $('#arrangeHome [data-arr-act]:not([disabled])'); if (f) Nav.focus(f, true); }, 60);
    };
    const go0 = window.go;
    if (typeof Seats !== 'undefined' && Seats.kids()) Seats.guard(go); else go();
  },
  render(focusKey, focusAct) {
    const b = X8.body('arrangeHome'); if (!b) return;
    const a = this.get(), items = this.list();
    b.innerHTML = `<h2 class="x8-h">Arrange Home</h2>
      <p class="arr-sub">${typeof Seats !== 'undefined' && Seats.list().length ? 'Move rows up or down, hide the ones you never use, or give a row your own name. This seat only.' : 'Move rows up or down, hide the ones you never use, or give a row your own name.'}</p>
      ${items.length ? `<ol class="arr-list">${items.map((it, i) => {
        const off = a.hide.includes(it.k), name = a.names[it.k];
        return `<li class="arr-item${off ? ' off' : ''}" data-k="${esc(it.k)}">
          <span class="arr-n tnum">${i + 1}</span>
          <div class="arr-t"><b${name ? ' translate="no"' : ''}>${esc(name || it.t)}</b>${name ? `<small>${esc(it.t)}</small>` : off ? '<small>Hidden</small>' : it.gone ? '<small>Not on Home right now</small>' : ''}</div>
          <div class="arr-acts">
            <button class="ibtn" type="button" data-nav data-arr-act="up" aria-label="Move up" title="Move up"${i ? '' : ' disabled'}><i data-lucide="chevron-up"></i></button>
            <button class="ibtn" type="button" data-nav data-arr-act="down" aria-label="Move down" title="Move down"${i < items.length - 1 ? '' : ' disabled'}><i data-lucide="chevron-down"></i></button>
            <button class="ibtn" type="button" data-nav data-arr-act="name" aria-label="Rename" title="Rename"><i data-lucide="pencil"></i></button>
            <button class="ibtn" type="button" data-nav data-arr-act="hide" aria-label="${off ? 'Show' : 'Hide'}" title="${off ? 'Show' : 'Hide'}" aria-pressed="${off}"><i data-lucide="${off ? 'eye-off' : 'eye'}"></i></button>
          </div></li>`;
      }).join('')}</ol>` : '<p class="tour-note">Home has no rows yet. Install an addon with catalogs, then come back.</p>'}
      <div class="inrow arr-foot"><button class="btn btn-ghost btn-sm" type="button" data-nav data-arr-reset${a.order.length || a.hide.length || Object.keys(a.names).length ? '' : ' disabled'}><i data-lucide="rotate-ccw"></i>Reset Home</button><button class="btn btn-prime btn-sm" type="button" data-nav data-x8close><i data-lucide="check"></i>Done</button></div>
      <p class="tour-note">Turn whole groups on or off in Settings › Home. Empty rows never show.</p>`;
    icons();
    $$('[data-arr-act]', b).forEach((btn) => btn.addEventListener('click', () => this.act(btn.closest('.arr-item').dataset.k, btn.dataset.arrAct)));
    const r = $('[data-arr-reset]', b); if (r) r.onclick = () => { Store.set(this.KEY, null); if (typeof Account !== 'undefined') Account.schedule(); this.restore(); this.render(); toast('Home is back to normal', 'ok'); };
    if (focusKey) {
      const li = [...$$('.arr-item', b)].find((x) => x.dataset.k === focusKey);
      let f = li && $(`[data-arr-act="${focusAct}"]`, li);
      if (f && f.disabled) f = $('[data-arr-act]:not([disabled])', li);
      if (f) { if (IS_TV) Nav.focus(f, true); else f.focus({ preventScroll: false }); }
    }
  },
  /* the order of every row in the editor list becomes the saved order, with one row moved */
  act(k, what) {
    const a = this.get(), items = this.list(), i = items.findIndex((x) => x.k === k); if (i < 0) return;
    items.forEach((it) => { a.titles[it.k] = it.t; });
    if (what === 'up' || what === 'down') {
      const j = what === 'up' ? i - 1 : i + 1; if (j < 0 || j >= items.length) return;
      [items[i], items[j]] = [items[j], items[i]];
      a.order = items.map((x) => x.k);
      this.save(a); this.render(k, what); return;
    }
    if (what === 'hide') {
      a.hide = a.hide.includes(k) ? a.hide.filter((x) => x !== k) : [...a.hide, k];
      this.save(a); this.render(k, what); return;
    }
    if (what === 'name') this.rename(k);
  },
  rename(k) {
    const b = X8.body('arrangeHome'), li = b && [...$$('.arr-item', b)].find((x) => x.dataset.k === k); if (!li) return;
    const a = this.get(), it = this.list().find((x) => x.k === k);
    const box = $('.arr-t', li);
    box.innerHTML = `<form class="arr-rn"><input class="inp" maxlength="40" aria-label="Row name" placeholder="${esc(it ? it.t : '')}" value="${esc(a.names[k] || '')}"><button class="btn btn-prime btn-sm" type="submit" data-nav>Save</button></form>`;
    const f = $('form', box), inp = $('input', box);
    const done = (e) => {
      if (e) e.preventDefault();
      const v = inp.value.trim().slice(0, 40), cur = this.get();
      this.list().forEach((x) => { cur.titles[x.k] = x.t; });
      if (v && (!it || v !== it.t)) cur.names[k] = v; else delete cur.names[k];
      this.save(cur); this.render(k, 'name');
    };
    f.addEventListener('submit', done);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.render(k, 'name'); } });
    if (IS_TV) Nav.focus(inp, true); else { inp.focus(); inp.select(); }
  },
  /* back to how each module drew it */
  restore() {
    this.sections().forEach((sec) => {
      sec.classList.remove('arr-off');
      const h = this.head(sec), tn = h && [...h.childNodes].find((n) => n.nodeType === 3);
      if (tn && sec.dataset.arrT) tn.textContent = `${sec.dataset.arrT}${tn.nextSibling ? ' ' : ''}`;
    });
    if (S.view === 'home') renderHome();
  },
  button() {
    const rows = $('#homeRows'); if (!rows || $('#arrHomeBtn')) return;
    const w = document.createElement('div'); w.className = 'arr-home'; w.id = 'arrHomeBtn';
    w.innerHTML = '<button class="btn btn-ghost btn-sm" type="button" data-nav><i data-lucide="layout-list"></i>Arrange Home</button>';
    rows.after(w); $('button', w).onclick = () => this.open(); icons();
  },
  init() {
    if (!SEAT_KEYS.includes(this.KEY)) SEAT_KEYS.push(this.KEY);
    // the seat's arrangement travels with account sync (the main seat at the top level, other seats under d.seats)
    if (typeof Seats !== 'undefined' && Seats.seatData) {
      const sd = Seats.seatData.bind(Seats);
      Seats.seatData = (id) => { const d = sd(id); try { const v = localStorage.getItem(`mkc:seat:${id}:${this.KEY}`); if (v != null) d[this.KEY] = JSON.parse(v); } catch (e) { /* blocked */ } return d; };
    }
    const ex = exportData;
    exportData = function () { const d = ex.apply(this, arguments); const v = Store.raw.get(Arrange.KEY, null); if (v) d[Arrange.KEY] = v; return d; };
    const ap = Account.applyRemote.bind(Account);
    Account.applyRemote = function (d) {
      const v = d && d[Arrange.KEY]; if (d) delete d[Arrange.KEY];
      const r = ap(d);
      if (v !== undefined) { Store.raw.set(Arrange.KEY, v); if (!SEAT && S.view === 'home') Arrange.apply(true); }
      return r;
    };
    // renderHome clears #homeRows: catalog and watchlist rows get their keys here, then the arrangement is applied
    const rh = renderHome;
    renderHome = async function () { const p = rh.apply(this, arguments); Arrange.apply(true); Arrange.button(); try { return await p; } finally { Arrange.apply(true); setTimeout(() => Arrange.apply(true), 1500); setTimeout(() => Arrange.apply(true), 4000); } };
    this.watch(); this.button(); this.apply(true);
    COMMANDS.push({ label: 'Arrange Home (hide, move, rename rows)', icon: 'layout-list', run: () => this.open() });
    const home = SECTIONS.find((s) => s.id === 'home');
    if (home) {
      const rows = home.rows;
      home.rows = () => { const r = rows(); const at = r.findIndex((x) => x.group === 'Rows on Home'); r.splice(at < 0 ? r.length : at + 1, 0, { key: 'arrHome', label: 'Arrange Home', help: 'Hide, move or rename any row, addon catalogs included. Each seat keeps its own.', type: 'button', text: 'Arrange Home', icon: 'layout-list', run: () => { closeLayer('settings'); this.open(); } }); return r; };
    }
  },
};

/* ---------------- Kids seats by age rating ----------------
   Before, a kids seat let in anything with an Animation or Family genre (so adult cartoons got through). Now a title
   must also be rated at or under the seat's age limit. Ratings come from kids/ages.json (popular animation, family
   and kids titles, built from TMDB), then from the user's own TMDB key if they added one, then from Wikidata for films.
   The rating of the viewer's country is used when there is one (US, Brazil, India, UK, Germany), else the US one.
   A title with no rating anywhere falls back to the genre rule, as before. */
const KidsAge = {
  data: null, cache: null, loading: null,
  LIMITS: [[6, 'Little kids, up to 6'], [9, 'Kids, up to 9'], [12, 'Older kids, up to 12']],
  limit() { const s = typeof Seats !== 'undefined' ? Seats.cur() : null; const v = s && Number(s.maxAge); return [6, 9, 12].includes(v) ? v : 9; },
  country() {
    const l = String((CFG.uiLang && CFG.uiLang !== 'auto' ? CFG.uiLang : '') || navigator.language || 'en-US');
    const r = (l.split('-')[1] || '').toUpperCase();
    if (['US', 'BR', 'IN', 'GB', 'DE'].includes(r)) return r;
    if (/^pt/i.test(l)) return 'BR'; if (/^hi/i.test(l)) return 'IN'; if (/^de/i.test(l)) return 'DE';
    return 'US';
  },
  load() {
    if (this.loading) return this.loading;
    this.cache = Store.raw.get('kidsAgeCache', {}) || {};
    this.loading = fetch('kids/ages.json').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d && d.a) this.data = d; }).catch(() => {});
    return this.loading;
  },
  ages(id) { const a = (this.data && this.data.a[id]) || (this.cache && this.cache[id]); return Array.isArray(a) ? a : null; },
  /* the minimum age for this title in the viewer's country, else the US, else any; null = no rating known */
  of(id) {
    const a = this.ages(id); if (!a) return null;
    const cs = (this.data && this.data.c) || ['US', 'BR', 'IN', 'GB', 'DE'], i = cs.indexOf(this.country());
    const v = i >= 0 ? a[i] : null; if (v != null) return v;
    if (a[0] != null) return a[0];
    const any = a.filter((x) => x != null); return any.length ? Math.max(...any) : null;
  },
  ok(m) { const id = m && m.id; if (!id) return true; const v = this.of(id); return v == null || v <= this.limit(); },
  /* rating text to a minimum age (same rules as build_ages.py) */
  toAge(c, r) {
    r = String(r || '').trim().toUpperCase(); if (!r || /^(NR|NOT RATED|UNRATED)$/.test(r)) return null;
    if (c === 'US') return { 'TV-Y': 0, 'TV-G': 0, G: 0, 'TV-Y7': 7, 'TV-Y7-FV': 7, PG: 8, 'TV-PG': 10, 'PG-13': 13, 'TV-14': 14, R: 17, 'TV-MA': 17, 'NC-17': 18 }[r] ?? null;
    if (c === 'BR' && /^(L|AL|LIVRE)$/.test(r)) return 0;
    if (c === 'IN' && /^(U|UA|U\/A|A|S)$/.test(r)) return { U: 0, UA: 12, 'U/A': 12, A: 18, S: 18 }[r];
    if (c === 'GB' && /^(U|UC|PG|12A|R18)$/.test(r)) return { U: 0, UC: 0, PG: 8, '12A': 12, R18: 18 }[r];
    if (c === 'DE' && /NO AGE|^0$/.test(r)) return 0;
    const n = r.match(/(\d{1,2})/); return n ? Number(n[1]) : null;
  },
  remember(id, ages) { this.cache[id] = ages; const ks = Object.keys(this.cache); if (ks.length > 3000) ks.slice(0, ks.length - 3000).forEach((k) => delete this.cache[k]); Store.raw.set('kidsAgeCache', this.cache); },
  /* titles on screen that have no rating yet: look them up, a few at a time */
  pending: new Set(), asked: new Set(),
  async lookup(list) {
    const C = (this.data && this.data.c) || ['US', 'BR', 'IN', 'GB', 'DE'];
    const key = (typeof Keys !== 'undefined' && Keys.get().tmdb) || '';
    const tmdb = async (id, type) => {
      const q = (p, extra = '') => fetch(`https://api.themoviedb.org/3/${p}?api_key=${encodeURIComponent(key)}${extra}`).then((r) => (r.ok ? r.json() : null));
      const f = await q(`find/${id}`, '&external_source=imdb_id'); if (!f) return null;
      const tv = (f.tv_results || [])[0], mv = (f.movie_results || [])[0];
      const pick = type === 'series' ? tv || mv : mv || tv; if (!pick) return null;
      const rs = {};
      if (pick === tv) { const d = await q(`tv/${tv.id}/content_ratings`); ((d && d.results) || []).forEach((x) => { rs[x.iso_3166_1] = x.rating; }); }
      else { const d = await q(`movie/${mv.id}/release_dates`); ((d && d.results) || []).forEach((x) => { const c = (x.release_dates || []).map((y) => y.certification).find(Boolean); if (c) rs[x.iso_3166_1] = c; }); }
      return C.map((c) => this.toAge(c, rs[c]));
    };
    const wiki = async (ids) => {
      const P = { US: 'P1657', BR: 'P3216', DE: 'P1981' };
      const sparql = `SELECT ?imdb ?p ?vl WHERE { VALUES ?imdb { ${ids.map((x) => `"${x}"`).join(' ')} } ?i wdt:P345 ?imdb . VALUES ?p { ${Object.values(P).map((p) => `wdt:${p}`).join(' ')} } ?i ?p ?v . ?v rdfs:label ?vl . FILTER(LANG(?vl) = "en") }`;
      const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, { headers: { Accept: 'application/sparql-results+json' } });
      if (!r.ok) return {};
      const j = await r.json(), out = {};
      (j.results.bindings || []).forEach((b) => {
        const id = b.imdb.value, p = b.p.value.split('/').pop(), c = Object.keys(P).find((k) => P[k] === p);
        const a = c === 'DE' ? this.toAge('DE', String(b.vl.value).replace(/^FSK\s*/i, '')) : this.toAge(c, b.vl.value);
        if (a == null) return;
        out[id] = out[id] || C.map(() => null); const i = C.indexOf(c); out[id][i] = Math.max(out[id][i] ?? 0, a);
      });
      return out;
    };
    const todo = list.filter(([id]) => !this.asked.has(id)).slice(0, 40); todo.forEach(([id]) => this.asked.add(id));
    if (!todo.length) return false;
    let got = false;
    try {
      if (key) {
        for (let i = 0; i < todo.length; i += 4) {
          const part = await Promise.all(todo.slice(i, i + 4).map(([id, type]) => tmdb(id, type).catch(() => null)));
          part.forEach((a, j) => { const id = todo[i + j][0]; this.remember(id, a && a.some((x) => x != null) ? a : 0); if (a && a.some((x) => x != null)) got = true; });
        }
      } else {
        const films = todo.filter(([, t]) => t !== 'series').map(([id]) => id);
        const w = films.length ? await wiki(films).catch(() => ({})) : {};
        todo.forEach(([id, t]) => { if (w[id]) { this.remember(id, w[id]); got = true; } else if (t !== 'series') this.remember(id, 0); });
      }
    } catch (e) { /* offline: the genre rule still applies */ }
    return got;
  },
  /* drop cards (and then empty rows, and banner items) that a new rating rules out */
  prune() {
    let n = 0;
    $$('.card[data-id]').forEach((c) => { if (c.closest('#player, #arrangeHome')) return; if (!this.ok({ id: c.dataset.id })) { c.remove(); n++; } });
    if (n) $$('section.row').forEach((sec) => { const r = sec.querySelector('.rail'); if (r && !r.querySelector('.card, .skel, .skeleton') && r.dataset.kidsPruned !== '0') sec.hidden = true; });
    if (S.hero && S.hero.length && S.hero.some((m) => !this.ok(m))) { const l = S.hero.filter((m) => this.ok(m)); if (l.length) setHeroList(l); else { S.hero = []; $('#hero').hidden = true; } }
  },
  scan() {
    if (!this.data && !this.cache) return;
    const need = []; const seen = new Set();
    $$('.card[data-id]').forEach((c) => { const id = c.dataset.id; if (!/^tt\d+$/.test(id) || seen.has(id) || this.ages(id) || (this.cache && this.cache[id] === 0)) return; seen.add(id); need.push([id, c.dataset.type]); });
    this.prune();
    if (need.length && !this.running) { this.running = true; this.lookup(need).then((got) => { this.running = false; if (got) this.prune(); if (need.length > 40) this.later(); }).catch(() => { this.running = false; }); }
  },
  later() { clearTimeout(this.t); this.t = setTimeout(() => this.scan(), 700); },
  init() {
    // every kids seat gets the rule, and the seat's own age limit
    const base = Seats.kidSafe.bind(Seats);
    Seats.kidSafe = (m) => base(m) && this.ok(m);
    const sec = SECTIONS.find((s) => s.id === 'seats');
    if (sec) {
      sec.intro = 'Everyone in the house gets their own seat: their own watchlist, progress, picks and Home. A seat can have a PIN, and a kids seat shows only family titles rated for its age.';
      const rows = sec.rows;
      sec.rows = () => {
        const r = rows(); if (!Seats.list().some((s) => s.kids)) return r;
        const at = r.findIndex((x) => x.key === 'seatAsk');
        r.splice(at < 0 ? r.length : at, 0, { key: 'kidsAge', label: 'Kids seats show titles rated for', help: 'Uses the age rating where you live (US, Brazil, India, UK or Germany), else the US one. Titles with no rating at all fall back to Animation and Family only. Ratings: TMDB and Wikidata.', type: 'select', num: true, options: this.LIMITS,
          get: () => { const k = Seats.list().find((s) => s.kids); return k && [6, 9, 12].includes(Number(k.maxAge)) ? Number(k.maxAge) : 9; },
          set: (v) => { Seats.saveList(Seats.list().map((s) => (s.kids ? { ...s, maxAge: Number(v) } : s))); toast('Kids seats updated', 'ok'); } });
        return r;
      };
    }
    if (!Seats.kids()) return;
    this.load().then(() => { this.later(); if (S.view === 'home') this.prune(); });
    const rh = renderHome;
    renderHome = async function () { await Promise.race([KidsAge.load(), new Promise((r) => setTimeout(r, 2500))]); const out = await rh.apply(this, arguments); KidsAge.later(); return out; };
    new MutationObserver(() => this.later()).observe(document.body, { childList: true, subtree: true });
  },
};

/* ---------------- Coming from Stremio? ----------------
   The import already brings addons, library, progress and watched marks over in one go. Now it is offered where a
   newcomer decides: a step in the welcome tour, and the empty Home someone without addons sees. */
const FromStremio = {
  html() {
    return `<div class="tw-sec fs-step"><span class="tw-kicker">Coming from Stremio?</span><h2 class="tw-h">Bring everything over</h2>
      <p class="tw-lede">Sign in with your Stremio account once and MKCinema copies your addons, library, Continue watching and watched episodes. Your password goes only to Stremio and is never saved.</p>
      <ul class="fs-list">${[['users', 'Seats for the whole house, with PINs and kids seats'], ['layout-list', 'Hide, move and rename any Home row'], ['download', 'Downloads in the Android and Windows apps'], ['captions', 'Subtitles that sync themselves'], ['palette', 'Four looks and your own colour']].map(([i, t]) => `<li><i data-lucide="${i}"></i><span>${t}</span></li>`).join('')}</ul>
      <p class="fs-free">All free. No plans, no ads.</p>
      <div class="inrow"><button class="btn btn-prime" type="button" data-nav data-fs-import><i data-lucide="download"></i>Import from Stremio</button></div>
      <p class="tour-note">New to all this? Press Next. You can import any time from Settings or the search bar.</p></div>`;
  },
  bind() { const b = $('[data-fs-import]', $('#tourBody')); if (b) b.onclick = () => { endTour(); setTimeout(openStremioImport, 120); }; },
  empty() {
    const es = $('#homeRows .empty-state'); if (!es || es.querySelector('[data-fs-empty]') || engine.offline) return;
    const d = document.createElement('div'); d.className = 'inrow fs-empty';
    d.innerHTML = '<button class="btn btn-ghost btn-sm" type="button" data-nav data-fs-empty><i data-lucide="download"></i>Import from Stremio</button>';
    es.appendChild(d); $('button', d).onclick = () => openStremioImport(); icons();
  },
  init() {
    if (!TOUR.some((s) => s.id === 'stremio')) {
      const at = TOUR.findIndex((s) => s.id === 'why');
      TOUR.splice(at < 0 ? TOUR.length - 1 : at + 1, 0, { id: 'stremio', html: () => this.html(), after: () => this.bind() });
    }
    const rh = renderHome;
    renderHome = async function () { const p = rh.apply(this, arguments); FromStremio.empty(); try { return await p; } finally { FromStremio.empty(); } };
    this.empty();
  },
};

try { Arrange.init(); } catch (e) { console.warn('Arrange Home:', e); }
try { KidsAge.init(); } catch (e) { console.warn('Kids ages:', e); }
try { FromStremio.init(); } catch (e) { console.warn('From Stremio:', e); }
