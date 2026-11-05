/* ---------------- 2.8.2 TV Home (Drake, 2026-11-05) ----------------
   - the featured banner gets arrows the remote can reach and press (Left from Smart Play, Right from Watchlist)
   - Left/Right at either end of a row stays put instead of jumping to a far-off button in another row
   - Networks: browse what is on Netflix, Disney+, HBO Max and others. The lists come from the public
     "Streaming Catalogs" Stremio addon (no key needed), for the viewer's country. MKCinema only shows the titles;
     playing them still goes through the viewer's own addons. */
const Networks = {
  BASE: 'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club',
  LIST: [
    ['nfx', 'Netflix', '#e50914'], ['dnp', 'Disney+', '#1a4bd6'], ['hbm', 'HBO Max', '#6b2fd6'], ['amp', 'Prime Video', '#1fa8e0'],
    ['atp', 'Apple TV+', '#c9c9cf'], ['hlu', 'Hulu', '#1ce783'], ['pmp', 'Paramount+', '#1f6bff'], ['pcp', 'Peacock', '#f2b705'],
    ['cru', 'Crunchyroll', '#f47521'], ['stz', 'Starz', '#e8e8ea'],
  ],
  cur: 'nfx', type: 'movie', skip: 0, done: false, busy: false, token: 0,
  country() { try { return WhereToWatch.region(); } catch (e) { return 'US'; } },
  addon() {
    const cfg = btoa(`${this.LIST.map((n) => n[0]).join(',')}::${this.country()}:1730000000000:0:0:`);
    return { baseUrl: `${this.BASE}/${cfg}`, manifest: { id: 'pw.ers.netflix-catalog', name: 'Streaming Catalogs' } };
  },
  net(id) { return this.LIST.find((n) => n[0] === id) || this.LIST[0]; },
  tile([id, name, c]) {
    return `<button type="button" class="net-tile" data-nav data-net="${id}" style="--nc:${c}" aria-label="${esc(name)}: films and series"><b>${esc(name)}</b><small>Films &amp; series</small></button>`;
  },
  row() {
    const sec = document.createElement('section'); sec.className = 'row net-row'; sec.id = 'netRow';
    sec.innerHTML = `<div class="row-head"><h2 class="row-title">Networks <small>What's on each service</small></h2></div><div class="rail net-rail">${this.LIST.map((n) => this.tile(n)).join('')}</div>`;
    $$('[data-net]', sec).forEach((b) => b.addEventListener('click', () => this.open(b.dataset.net)));
    return sec;
  },
  place() {
    const rows = $('#homeRows'); if (!rows) return;
    if (typeof Seats !== 'undefined' && Seats.kids()) return; // the lists are not filtered for kids
    // right under Top 10 once that row is in; until then, second from the top
    const t10 = $('#homeRows .t10c'), after = t10 && t10.closest('#homeRows > section');
    const sec = $('#netRow') || this.row();
    if (after) { if (after.nextElementSibling !== sec) after.after(sec); } else if (!sec.isConnected) { const first = rows.firstElementChild; if (first) first.after(sec); else rows.append(sec); }
  },
  open(id, type) { this.cur = id || this.cur; if (type) this.type = type; go('network'); },
  render() {
    const box = $('#netBody'); if (!box) return;
    const [id, name, c] = this.net(this.cur);
    box.style.setProperty('--nc', c);
    box.innerHTML = `<div class="net-head"><h1 class="page-title">${esc(name)}</h1><p class="page-sub">Popular on ${esc(name)} in ${esc(this.country())} right now. Lists from the community Streaming Catalogs addon; playing still uses your own addons.</p>
        <div class="toolbar"><div class="segc" role="radiogroup" aria-label="Type">${[['movie', 'Films'], ['series', 'Series']].map(([v, l]) => `<button type="button" data-nav data-nt="${v}" class="${this.type === v ? 'on' : ''}" role="radio" aria-checked="${this.type === v}">${l}</button>`).join('')}</div>
        <div class="net-switch">${this.LIST.map(([nid, nn, nc]) => `<button type="button" class="chip ${nid === id ? 'on' : ''}" data-nav data-nsw="${nid}" style="--nc:${nc}">${esc(nn)}</button>`).join('')}</div></div></div>
      <div class="grid" id="netGrid">${skeletons(12)}</div>
      <div class="actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-nav id="netMore" hidden>Show more</button></div>`;
    icons();
    $$('[data-nt]', box).forEach((b) => b.addEventListener('click', () => { this.type = b.dataset.nt; this.render(); }));
    $$('[data-nsw]', box).forEach((b) => b.addEventListener('click', () => { this.cur = b.dataset.nsw; this.render(); }));
    $('#netMore').onclick = () => this.load(false);
    this.skip = 0; this.done = false; this.load(true);
  },
  async load(fresh) {
    if (this.busy && !fresh) return; this.busy = true; const tok = ++this.token;
    const grid = $('#netGrid'), more = $('#netMore'); if (more) more.hidden = true;
    try {
      const r = await engine.call(this.addon(), 'catalog', this.type, this.cur, this.skip ? { skip: this.skip } : {});
      if (tok !== this.token || !$('#netGrid')) return;
      const metas = (r.metas || []).filter((m) => m && m.id).map((m) => ({ ...m, type: m.type || this.type, _addon: 'Streaming Catalogs' }));
      if (fresh) grid.innerHTML = '';
      const seen = new Set($$('[data-card]', grid).map((x) => x.dataset.id));
      const add = metas.filter((m) => !seen.has(m.id));
      grid.insertAdjacentHTML('beforeend', add.map((m) => cardHTML(m)).join(''));
      if (!grid.children.length) grid.innerHTML = `<div class="empty">Nothing listed for this service in ${esc(this.country())} right now.</div>`;
      this.skip += metas.length; this.done = metas.length < 20;
      if (more) more.hidden = this.done;
      icons(); if (typeof queueWall === 'function') queueWall();
      if (IS_TV && fresh) Nav.settle();
    } catch (e) {
      if (tok === this.token && grid) grid.innerHTML = `<div class="empty-state"><i data-lucide="cloud-off"></i><h3>The list did not load</h3><p>${esc(e.message || 'Network error')}. Try again in a moment.</p></div>`;
      icons();
    } finally { if (tok === this.token) this.busy = false; }
  },
  init() {
    // the network page is a view of its own, so Back and the tabs behave as everywhere else
    const g0 = go; go = function (view) { const r = g0.apply(this, arguments); if (view === 'network') Networks.render(); return r; };
    const rh = renderHome; renderHome = function () { const p = rh.apply(this, arguments); Promise.resolve(p).then(() => Networks.place()); return p; };
    if (typeof Curate !== 'undefined' && Curate.render) { const cr = Curate.render.bind(Curate); Curate.render = function () { const r = cr.apply(this, arguments); Promise.resolve(r).then(() => Networks.place()); return r; }; }
    COMMANDS.push(...this.LIST.map(([id, name]) => ({ label: `Browse ${name}`, icon: 'tv', run: () => this.open(id) })));
  },
};

const TvHome = {
  init() {
    // Left/Right at the end of a row stays on the last poster instead of leaping to another row
    const step = Nav.step.bind(Nav), move = Nav.move.bind(Nav);
    Nav.step = function (cur, dir) {
      if (cur && cur.matches && cur.matches('.rail>.net-tile')) { let el = cur; do { el = dir === 'right' ? el.nextElementSibling : el.previousElementSibling; } while (el && !el.matches('[data-nav]')); return el || null; }
      return step(cur, dir);
    };
    Nav.move = function (dir, fast) {
      const a = document.activeElement;
      if (IS_TV && a && dir === 'right' && a.id === 'heroList' && $('#heroNext')) { Nav.focus($('#heroNext'), fast); return; }
      if (IS_TV && a && dir === 'left' && a.id === 'heroPlay' && $('#heroPrev')) { Nav.focus($('#heroPrev'), fast); return; }
      if ((dir === 'left' || dir === 'right') && a && a.matches && a.matches('.rail>.card, .rail>.net-tile') && !Nav.step(a, dir)) {
        const rail = a.closest('.rail');
        if (dir === 'right' && rail && rail._inf && typeof Endless !== 'undefined') Endless.near(rail, a); // an endless row loads more and the next press continues
        return;
      }
      return move(dir, fast);
    };
    // the banner arrows: reachable and pressable with the remote
    if (IS_TV) ['heroPrev', 'heroNext'].forEach((id) => { const b = $(`#${id}`); if (b) b.setAttribute('data-nav', ''); });
  },
};

if (!$('#view-network')) {
  const cal = $('#view-calendar');
  if (cal) cal.insertAdjacentHTML('beforebegin', '<section class="view" id="view-network" aria-label="Network"><div id="netBody"></div></section>');
}
Networks.init(); TvHome.init();
if (S.view === 'home') Networks.place();
