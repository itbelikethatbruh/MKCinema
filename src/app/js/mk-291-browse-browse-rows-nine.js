
/* ---------------- 2.91 Browse rows ----------------
   Nine more rows for Home: Studios, Animation studios, Film collections, TV universes, Decades, Genres, Based on,
   Animated series and Animation for grown-ups. The lists ship with the app (browse-home.json for the tiles,
   browse/<row>.json for each tile's titles), rebuilt from TMDB at release time, so nothing needs a key or an addon.
   Playing still uses the viewer's own addons. Each row can be switched off in Settings › Home, moved, renamed or
   hidden in Arrange Home, and every tile in a row can be hidden with the row's Choose button. Kids seats get none of
   these rows (the lists are not filtered by age). */
const Browse = {
  ROWS: [
    { id: 'studios', title: 'Studios', kind: 'Studio', rank: 5.5 },
    { id: 'anim', title: 'Animation studios', kind: 'Animation studio', rank: 6.5 },
    { id: 'coll', title: 'Film collections', kind: 'Collection', rank: 8.5 },
    { id: 'tvu', title: 'TV universes', kind: 'TV universe', rank: 9.2 },
    { id: 'toons', title: 'Animated series', rank: 9.4, posters: true },
    { id: 'grownup', title: 'Animation for grown-ups', rank: 9.6, posters: true },
    { id: 'decades', title: 'Decades', kind: 'Decade', rank: 11.2 },
    { id: 'genres', title: 'Genres', kind: 'Genre', rank: 11.4 },
    { id: 'based', title: 'Based on', kind: 'Based on', rank: 11.6 },
  ],
  IMG: 'https://image.tmdb.org/t/p/',
  home: null, homeP: null, full: {}, fullP: {}, row: '', tile: '', type: '', token: 0,
  def(id) { return this.ROWS.find((r) => r.id === id); },
  on(id) { return typeof Layout === 'undefined' || Layout.shows(`br-${id}`); },
  kids() { return typeof Seats !== 'undefined' && Seats.kids(); },
  hidden() { const h = Store.get('brHide', null); return h && typeof h === 'object' && !Array.isArray(h) ? h : {}; },
  setHidden(h) { Store.set('brHide', h); if (typeof Account !== 'undefined' && Account.schedule) Account.schedule(); },
  load() {
    return this.homeP || (this.homeP = fetch('browse-home.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`browse-home.json ${r.status}`)))).then((d) => {
      this.home = {}; (d.rows || []).forEach((r) => { if (r && r.id) this.home[r.id] = r; });
      return this.home;
    }).catch((e) => { this.homeP = null; throw e; }));
  },
  loadRow(id) {
    if (this.full[id]) return Promise.resolve(this.full[id]);
    return this.fullP[id] || (this.fullP[id] = fetch(`browse/${id}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${id} ${r.status}`)))).then((d) => (this.full[id] = d.tiles || {})).catch((e) => { delete this.fullP[id]; throw e; }));
  },
  tiles(id, all) {
    const r = this.home && this.home[id]; if (!r || !r.tiles) return [];
    const off = all ? [] : (this.hidden()[id] || []);
    return r.tiles.filter((t) => t && t.id && !off.includes(t.id));
  },
  /* names that stay as they are in every language: studios, franchises, decades. Genres and "Based on" translate. */
  own(rowId, t) { return !!t.logo || rowId === 'tvu' || rowId === 'coll' || rowId === 'decades'; },
  img(p, w) { return p ? `${this.IMG}${w}${p}` : ''; },
  tileHTML(rowId, t, i) {
    const d = this.def(rowId) || {}, mono = t.logo && t.m === 1;
    const art = this.img(t.art, IS_TV || document.documentElement.classList.contains('lite') ? 'w500' : 'w780');
    const based = rowId === 'based';
    const inner = t.logo
      ? `<img class="br-logo" src="${esc(this.img(t.logo, 'w500'))}" alt="" loading="lazy" decoding="async" draggable="false" data-fadein data-gone="label">`
      : `<span class="br-word">${based ? '<small>Based on</small>' : ''}<span${this.own(rowId, t) ? ' translate="no"' : ''}>${esc(t.name)}</span></span>`;
    return `<button type="button" class="uni-card br-tile br-${esc(rowId)}${mono ? ' br-mono' : ''}${t.logo ? '' : ' br-word-tile'}" style="--i:${i || 0}" data-nav data-br="${esc(rowId)}" data-brt="${esc(t.id)}" aria-label="${esc(t.name)}">`
      + `${art ? `<img class="uni-art br-art" src="${esc(art)}" alt="" loading="lazy" decoding="async" draggable="false" data-fadein>` : ''}<span class="br-glow"></span>`
      + `<span class="br-float" aria-label="${esc(t.name)}">${inner}</span><span class="br-cap"><i>${esc(d.kind || '')}</i><b${this.own(rowId, t) ? ' translate="no"' : ''}>${esc(t.name)}</b></span></button>`;
  },
  bind(box) {
    $$('[data-brt]', box).forEach((b) => {
      b.addEventListener('click', () => this.open(b.dataset.br, b.dataset.brt));
      if (IS_TV || !matchMedia('(hover:hover)').matches) return;
      // the logo follows the pointer a little and the picture moves the other way: depth without 3D layers
      b.addEventListener('pointermove', (e) => {
        if (document.documentElement.classList.contains('lite')) return;
        const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        b.style.setProperty('--px', `${(x * 16).toFixed(1)}px`); b.style.setProperty('--py', `${(y * 10).toFixed(1)}px`);
        b.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(0)}%`); b.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(0)}%`);
      });
      b.addEventListener('pointerleave', () => { b.style.setProperty('--px', '0px'); b.style.setProperty('--py', '0px'); });
    });
  },
  section(d) {
    const sec = document.createElement('section'); sec.id = `br-${d.id}`; sec.dataset.brRank = d.rank;
    if (d.posters) {
      sec.className = 'row br-row br-posters';
      const items = (this.home[d.id] && this.home[d.id].items) || [];
      sec.innerHTML = `<div class="row-head"><h2 class="row-title">${esc(d.title)}</h2></div><div class="rail"></div>`;
      fillRail(sec, items.map((x) => cardHTML(this.meta(x))).join(''));
      return sec;
    }
    sec.className = 'row br-row';
    // TVs and Snappy mode draw 12 tiles and a See all at the end, so nine more rows cost little at start-up
    const full = this.tiles(d.id), lean = IS_TV || document.documentElement.classList.contains('lite'), list = lean ? full.slice(0, 12) : full;
    sec.innerHTML = `<div class="row-head"><h2 class="row-title">${esc(d.title)}</h2><button class="row-more br-edit" type="button" data-nav data-br-edit="${esc(d.id)}" aria-label="Choose what shows" title="Choose what shows"><i data-lucide="sliders-horizontal"></i></button><button class="row-more" type="button" data-nav data-br-all="${esc(d.id)}">See all<i data-lucide="chevron-right"></i></button></div>`
      + `<div class="rail br-rail">${list.map((t, i) => this.tileHTML(d.id, t, i)).join('')}${list.length < full.length ? `<button class="rail-all" type="button" data-nav data-br-all2><i data-lucide="layout-grid"></i><span>See all</span></button>` : ''}</div>`;
    this.bind(sec);
    $('[data-br-all]', sec).onclick = () => this.open(d.id, '');
    const all2 = $('[data-br-all2]', sec); if (all2) all2.onclick = () => this.open(d.id, '');
    $('[data-br-edit]', sec).onclick = () => this.choose(d.id);
    icons();
    return sec;
  },
  meta(x) { return { id: x.id, type: x.t === 'series' ? 'series' : 'movie', name: x.n, releaseInfo: x.y, poster: x.p ? `${this.IMG}w342${x.p}` : undefined }; },
  place() {
    const rows = $('#homeRows'); if (!rows) return;
    if (this.kids()) { $$('#homeRows > .br-row').forEach((s) => s.remove()); return; }
    if (!this.home) { this.load().then(() => { if (S.view === 'home') this.place(); }).catch(() => { /* the rows stay away until the list loads */ }); return; }
    let added = false;
    this.ROWS.forEach((d) => {
      let sec = $(`#br-${d.id}`);
      const want = this.on(d.id) && (d.posters ? ((this.home[d.id] || {}).items || []).length >= 6 : this.tiles(d.id).length > 0);
      if (!want) { if (sec) sec.remove(); return; }
      if (!sec) { sec = this.section(d); added = true; }
      if (!sec.isConnected) { rows.append(sec); added = true; }
    });
    if (added) { if (typeof SimpleHome !== 'undefined') SimpleHome.tidy(); if (IS_TV && typeof Nav !== 'undefined') Nav.settle(); }
  },
  /* rebuild one row in place after its tiles change */
  refresh(id) {
    const old = $(`#br-${id}`); if (!old) { this.place(); return; }
    const d = this.def(id); if (!this.tiles(id).length) { old.remove(); return; }
    const sec = this.section(d); old.replaceWith(sec);
    if (typeof Arrange !== 'undefined') Arrange.apply(true);
  },
  open(row, tile) { this.row = row || this.row || 'studios'; this.tile = tile || ''; this.type = ''; go('browse'); },
  hero(d, t) {
    const mono = t.logo && t.m === 1;
    return `<div class="br-hero${mono ? ' br-mono' : ''}">${t.art ? `<img class="br-hart" src="${esc(this.img(t.art, IS_TV ? 'w780' : 'w1280'))}" alt="" decoding="async">` : ''}<div class="br-hin"><i>${esc(d.kind || d.title)}</i>`
      + `${t.logo ? `<h1 class="page-title uni-title" aria-label="${esc(t.name)}"><img class="br-hlogo" src="${esc(this.img(t.logo, 'w500'))}" alt="" decoding="async" data-gone="label"></h1>` : `<h1 class="page-title"${this.own(d.id, t) ? ' translate="no"' : ''}>${esc(t.name)}</h1>`}`
      + `<p class="page-sub">${esc(this.sub(d))}</p></div></div>`;
  },
  sub(d) {
    if (d.id === 'tvu') return 'Every series in the order it first aired. Playing uses your own addons.';
    if (d.id === 'coll') return 'Every film in release order. Playing uses your own addons.';
    return 'The best known first. Playing uses your own addons.';
  },
  async render() {
    const box = $('#brBody'); if (!box) return;
    const tok = ++this.token;
    box.innerHTML = `<div class="grid">${skeletons(12)}</div>`;
    try { await this.load(); } catch (e) { if (tok === this.token) box.innerHTML = '<div class="empty">The list did not load. Try again in a moment.</div>'; return; }
    if (tok !== this.token || !box.isConnected) return;
    const d = this.def(this.row) && !this.def(this.row).posters ? this.def(this.row) : this.ROWS[0];
    const all = this.tiles(d.id, true), t = this.tile && all.find((x) => x.id === this.tile);
    const rowChips = this.ROWS.filter((r) => !r.posters).map((r) => `<button type="button" class="chip ${r.id === d.id && !t ? 'on' : ''}" data-nav data-brrow="${esc(r.id)}">${esc(r.title)}</button>`).join('');
    if (!t) {
      box.innerHTML = `<div class="net-head uni-head"><h1 class="page-title">${esc(d.title)}</h1><div class="net-switch">${rowChips}</div></div><div class="br-grid">${all.map((x, i) => this.tileHTML(d.id, x, i)).join('')}</div>`;
      $$('[data-brrow]', box).forEach((b) => b.addEventListener('click', () => { this.row = b.dataset.brrow; this.tile = ''; this.render(); scrollTo({ top: 0 }); }));
      this.bind(box); icons(); if (IS_TV) Nav.settle(); return;
    }
    let titles;
    try { titles = (await this.loadRow(d.id))[t.id] || []; } catch (e) { if (tok === this.token) box.innerHTML = '<div class="empty">The list did not load. Try again in a moment.</div>'; return; }
    if (tok !== this.token || !box.isConnected) return;
    const hasM = titles.some((x) => x.t !== 'series'), hasS = titles.some((x) => x.t === 'series');
    const type = hasM && hasS ? this.type : '';
    const list = titles.filter((x) => !type || (type === 'series' ? x.t === 'series' : x.t !== 'series'));
    box.innerHTML = `${this.hero(d, t)}<div class="net-switch"><button type="button" class="chip" data-nav data-brback><i data-lucide="layout-grid"></i>${esc(d.title)}</button>${all.map((x) => `<button type="button" class="chip ${x.id === t.id ? 'on' : ''}" data-nav data-brsw="${esc(x.id)}"${this.own(d.id, x) ? ' translate="no"' : ''}>${esc(x.name)}</button>`).join('')}</div>`
      + `${hasM && hasS ? `<div class="net-switch">${[['', 'Everything'], ['movie', 'Films'], ['series', 'Series']].map(([v, l]) => `<button type="button" class="chip ${type === v ? 'on' : ''}" data-nav data-brty="${v}">${l}</button>`).join('')}</div>` : ''}`
      + `<div class="grid" id="brGrid"></div><div class="actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-nav id="brMore" hidden>Show more</button></div>`;
    $$('[data-brsw]', box).forEach((b) => b.addEventListener('click', () => { this.tile = b.dataset.brsw; this.render(); scrollTo({ top: 0 }); }));
    $$('[data-brty]', box).forEach((b) => b.addEventListener('click', () => { this.type = b.dataset.brty; this.render(); }));
    $('[data-brback]', box).onclick = () => { this.tile = ''; this.render(); scrollTo({ top: 0 }); };
    const grid = $('#brGrid'), more = $('#brMore'); let n = 0;
    const add = () => {
      const part = list.slice(n, n + 30); n += part.length;
      grid.insertAdjacentHTML('beforeend', part.map((x, i) => cardHTML(this.meta(x), d.id === 'coll' || d.id === 'tvu' ? { sub: `${n - part.length + i + 1} · ${x.y}` } : {})).join(''));
      more.hidden = n >= list.length; icons(); if (typeof queueWall === 'function') queueWall();
    };
    more.onclick = add; add(); if (IS_TV) Nav.settle();
  },
  /* Choose what shows: every tile of a row (or of every row) as a switch */
  choose(only) {
    const el = X8.layer('brChoose', { label: 'Choose what shows', icon: 'sliders-horizontal', eyebrow: 'Home' });
    const draw = () => {
      const b = X8.body('brChoose'); if (!b) return;
      const h = this.hidden(), rows = this.ROWS.filter((r) => !r.posters && (!only || r.id === only));
      b.innerHTML = `<h2 class="x8-h">Choose what shows</h2><p class="arr-sub">Tap a tile to hide it from Home or bring it back. Whole rows switch off in Settings › Home or in Arrange Home.</p>`
        + rows.map((r) => {
          const off = h[r.id] || [];
          return `<section class="br-pick-row"><h3>${esc(r.title)}<button class="btn btn-ghost btn-sm" type="button" data-nav data-br-allon="${esc(r.id)}"${off.length ? '' : ' disabled'}>Show all</button></h3><div class="br-pick">${this.tiles(r.id, true).map((t) => `<button type="button" class="chip" data-nav data-br-tg="${esc(r.id)}" data-id="${esc(t.id)}" aria-pressed="${!off.includes(t.id)}"${this.own(r.id, t) ? ' translate="no"' : ''}>${esc(t.name)}</button>`).join('')}</div></section>`;
        }).join('')
        + `${only ? '<div class="inrow arr-foot"><button class="btn btn-ghost btn-sm" type="button" data-nav data-br-every><i data-lucide="layout-list"></i>Every row</button>' : '<div class="inrow arr-foot">'}<button class="btn btn-prime btn-sm" type="button" data-nav data-x8close><i data-lucide="check"></i>Done</button></div>`;
      $$('[data-br-tg]', b).forEach((c) => c.addEventListener('click', () => {
        const hh = this.hidden(), r = c.dataset.brTg, list = new Set(hh[r] || []);
        if (list.has(c.dataset.id)) list.delete(c.dataset.id); else list.add(c.dataset.id);
        hh[r] = [...list]; if (!hh[r].length) delete hh[r]; this.setHidden(hh);
        c.setAttribute('aria-pressed', String(!list.has(c.dataset.id)));
        const all = b.querySelector(`[data-br-allon="${r}"]`); if (all) all.disabled = !list.size;
        this.refresh(r);
      }));
      $$('[data-br-allon]', b).forEach((c) => c.addEventListener('click', () => { const hh = this.hidden(); delete hh[c.dataset.brAllon]; this.setHidden(hh); this.refresh(c.dataset.brAllon); draw(); }));
      const ev = $('[data-br-every]', b); if (ev) ev.onclick = () => { only = ''; draw(); };
      icons();
      if (IS_TV) setTimeout(() => { const f = b.querySelector('[data-br-tg]'); if (f) Nav.focus(f, true); }, 60);
    };
    if (!el) return;
    draw(); X8.open('brChoose');
  },
  init() {
    const v = $('#view-universe') || $('#view-network') || $('#view-calendar');
    if (v && !$('#view-browse')) v.insertAdjacentHTML('afterend', '<section class="view" id="view-browse" aria-label="Browse"><div id="brBody"></div></section>');
    this.ROWS.forEach((r) => HOME_ROWS.push([`br-${r.id}`, r.title]));
    const hm = typeof secById === 'function' && secById('home');
    if (hm) { const rows = hm.rows; hm.rows = () => { const r = rows(), i = r.findIndex((x) => x.key === `hl-br-${this.ROWS[0].id}`), btn = { key: 'brChoose', label: 'Choose what each row shows', help: 'Hide single studios, collections, decades or genres from their rows on Home.', type: 'button', text: 'Choose', icon: 'sliders-horizontal', run: () => { closeLayer('settings'); setTimeout(() => this.choose(''), 280); } }; if (i >= 0) r.splice(i, 0, btn); else r.push(btn); return r; }; }
    COMMANDS.push(...this.ROWS.filter((r) => !r.posters).map((r) => ({ label: `Browse ${r.title.toLowerCase()}`, icon: 'layout-grid', run: () => this.open(r.id, '') })));
    if (S.view === 'home') this.place();
    if (S.view === 'browse') this.render();
  },
};
Browse.init();
