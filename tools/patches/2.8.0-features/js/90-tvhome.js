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
    return `<button type="button" class="net-tile" data-nav data-net="${id}" style="--nc:${c}" aria-label="${esc(name)}: films and series"><span class="net-shade"></span><img class="net-logo" src="net/${id}.svg" alt="" decoding="async" draggable="false"></button>`;
  },
  row() {
    const sec = document.createElement('section'); sec.className = 'row net-row'; sec.id = 'netRow';
    sec.innerHTML = `<div class="row-head"><h2 class="row-title">Networks <small>What's on each service</small></h2></div><div class="rail net-rail">${this.LIST.map((n) => this.tile(n)).join('')}</div>`;
    $$('[data-net]', sec).forEach((b, i) => { b.style.setProperty('--i', i); b.addEventListener('click', () => this.open(b.dataset.net)); });
    this.parallax(sec);
    return sec;
  },
  // 2.8.5 parallax (Drake): as the row moves, each logo drifts against its tile and its glow drifts the other way;
  // on a computer the logo also leans toward the pointer. Only CSS variables change, once per frame. TVs keep the float.
  parallax(sec) {
    if (IS_TV) return;
    const rail = sec.querySelector('.rail'); let raf = 0;
    const run = () => {
      raf = 0; const rr = rail.getBoundingClientRect(), mid = rr.left + rr.width / 2;
      $$('.net-tile', rail).forEach((t) => {
        const r = t.getBoundingClientRect(); if (r.right < rr.left - 40 || r.left > rr.right + 40) return;
        const d = Math.max(-1, Math.min(1, (r.left + r.width / 2 - mid) / (rr.width / 2 || 1)));
        t.style.setProperty('--gx', `${(d * 8).toFixed(1)}px`);
        const img = t.querySelector('.net-logo'); if (img && !t._hov) img.style.setProperty('--px', `${(-d * 10).toFixed(1)}px`);
      });
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(run); };
    rail.addEventListener('scroll', ask, { passive: true }); addEventListener('resize', ask, { passive: true }); requestAnimationFrame(ask);
    if (matchMedia('(hover:hover)').matches) $$('.net-tile', rail).forEach((t) => {
      const img = t.querySelector('.net-logo'); if (!img) return;
      t.addEventListener('pointermove', (e) => {
        const r = t.getBoundingClientRect(); t._hov = true;
        img.style.setProperty('--px', `${(((e.clientX - r.left) / r.width - 0.5) * 14).toFixed(1)}px`);
        img.style.setProperty('--py', `${(((e.clientY - r.top) / r.height - 0.5) * 10).toFixed(1)}px`);
      });
      t.addEventListener('pointerleave', () => { t._hov = false; img.style.setProperty('--py', '0px'); ask(); });
    });
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
    box.innerHTML = `<div class="net-head"><h1 class="page-title net-title" aria-label="${esc(name)}"><img class="net-logo" src="net/${id}.svg" alt="" decoding="async"></h1><p class="page-sub">Popular on ${esc(name)} in ${esc(this.country())} right now. Lists from the community Streaming Catalogs addon; playing still uses your own addons.</p>
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
        if (dir === 'right' && rail && rail._inf && typeof Endless !== 'undefined') { Endless.near(rail, a); return; } // an endless row loads more and the next press continues
        // 2.8.3: like Netflix, Right on the last poster goes round to the first one instead of stopping dead
        if (IS_TV && dir === 'right' && rail) { const first = $$(':scope>[data-nav]', rail).find((x) => !x.closest('[hidden]')); if (first && first !== a) Nav.focus(first, fast); }
        return;
      }
      return move(dir, fast);
    };
    // 2.8.3/2.8.6 (Drake: rows lagged, then "cycling is jittery"). On TV the focused poster is pinned to the row's left
    // edge and the row glides under it, as on Netflix. One animation per row that retargets from where it is, so presses
    // never queue or jump; a held button glides faster. Moving along a row never scrolls the page up or down (that
    // re-centring on every press was the jitter); the page only moves when the focus changes row.
    if (IS_TV) {
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const glide = (rail, to, ms) => {
        const tw = rail._tw || (rail._tw = { raf: 0 });
        tw.from = rail.scrollLeft; tw.to = to; tw.t0 = performance.now(); tw.ms = ms;
        if (tw.raf) return;
        const step = (now) => {
          const k = Math.max(0, Math.min(1, (now - tw.t0) / tw.ms)); // a frame can start before the key press that set t0
          rail.scrollLeft = tw.from + (tw.to - tw.from) * ease(k);
          tw.raf = k < 1 ? requestAnimationFrame(step) : 0;
        };
        tw.raf = requestAnimationFrame(step);
      };
      const focus = Nav.focus.bind(Nav); let lastAt = 0, lastRail = null;
      Nav.focus = function (el, fast) {
        const rail = el && el.closest && el.closest('.rail');
        if (!rail) { lastRail = null; return focus(el, fast); }
        const now = performance.now(), quick = fast || now - lastAt < 260, sameRow = rail === lastRail;
        lastAt = now; lastRail = rail;
        // the original focus() scrolls with scrollIntoView, which would also slide the row; do the page part here instead
        el.scrollIntoView = function () {
          if (sameRow) return; // along the row: the page stays still
          const lay = el.closest('.layer-ov'), r = el.getBoundingClientRect();
          const top = lay ? lay.getBoundingClientRect().top : 0, h = lay ? lay.clientHeight : innerHeight;
          const d = r.top - top + r.height / 2 - h / 2;
          if (Math.abs(d) > 6) (lay || window).scrollBy({ top: d, behavior: quick ? 'auto' : 'smooth' });
        };
        let r;
        try { r = focus(el, quick); } finally { delete el.scrollIntoView; }
        if (rail.scrollWidth > rail.clientWidth + 2) {
          // measured from layout offsets, not on-screen boxes: the selected poster is scaled up, and measuring its
          // scaled box made every press land a few pixels short and slide back (a visible shudder)
          const first = rail.firstElementChild, ml = (x) => parseFloat(getComputedStyle(x).marginLeft) || 0;
          // a Top 10 rank number sits in the card's left margin, so it stays in view
          const left = Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, ml(first) + el.offsetLeft - first.offsetLeft - ml(el)));
          if (Math.abs(left - (rail._tw && rail._tw.raf ? rail._tw.to : rail.scrollLeft)) > 1) glide(rail, left, quick ? 140 : 260);
        }
        return r;
      };

      // 2.8.6 (Drake: "it sometimes just freezes and you can't scroll back up ... you have to exit out").
      // A drop-down (the Catalog picker on Movies and Series) kept every arrow press for itself on a remote, so the
      // focus was trapped there. Arrows now leave drop-downs and multi-line boxes; OK still opens them.
      document.addEventListener('keydown', (e) => {
        const t = e.target, k = e.key;
        if (!/^Arrow/.test(k) || !t || !t.tagName) return;
        if (t.tagName === 'SELECT' || (t.tagName === 'TEXTAREA' && (k === 'ArrowUp' || k === 'ArrowDown'))) {
          e.preventDefault(); e.stopImmediatePropagation(); Nav.move(k.slice(5).toLowerCase(), e.repeat);
        }
      }, true);

      // and a way out from anywhere: if Up finds nothing above on a page, it goes to the menu at the top (as on
      // Netflix); if Up or Down finds nothing in a panel that can still scroll, the panel scrolls a step instead
      const mv = Nav.move.bind(Nav);
      Nav.move = function (dir, fast) {
        const before = document.activeElement, r = mv(dir, fast);
        if (document.activeElement !== before || (dir !== 'up' && dir !== 'down')) return r;
        const root = Nav.root(), lay = before && before.closest && before.closest('.layer-ov');
        const sc = lay && [lay, ...$$('.set-body, .x8-body, .ep-sheet, .es-body', lay)].find((x) => x.scrollHeight > x.clientHeight + 4 && x.contains(before));
        if (sc) { const by = (dir === 'up' ? -1 : 1) * sc.clientHeight * 0.6; if ((by < 0 && sc.scrollTop > 0) || (by > 0 && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2)) { sc.scrollBy({ top: by, behavior: 'smooth' }); return r; } }
        if (dir === 'up' && root && root.id === 'app' && before && !before.closest('.dock-wrap') && !document.documentElement.classList.contains('nav-side')) {
          const tab = $('.dock-wrap .tab.on') || $('.dock-wrap .tab');
          if (tab) { Nav.focus(tab, true); scrollTo({ top: 0, behavior: 'smooth' }); }
        }
        return r;
      };
    }
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
