/* ---------------- 2.9.0 Library: a real one ----------------
   Tabs for Watchlist, In progress, Watched and your own lists; Films or Series; sort by date added, A to Z, year or
   rating; hide what you have finished; and a filter box. Your own lists are made here or from a film page (Lists),
   and travel with your account like the watchlist. */
const Library = {
  st: { tab: 'watchlist', type: 'all', sort: 'added', hide: false, q: '' },
  lists() { return Store.get('lists', []) || []; },
  saveLists(l) { Store.set('lists', l); if (Account.user) Account.schedule(); },
  items() {
    const t = this.st.tab;
    if (t === 'watchlist') return S.watchlist.map((m, i) => ({ ...m, _added: S.watchlist.length - i }));
    if (t === 'progress') { const seen = new Map(); continueItems().forEach((p, i) => { if (!seen.has(p.metaId)) seen.set(p.metaId, { id: p.metaId, type: p.type, name: p.name, poster: p.poster, background: p.background, genres: p.genres, _added: p.at || -i, _p: p }); }); return [...seen.values()]; }
    if (t === 'watched') {
      const w = watchedMap(), out = new Map();
      Object.entries(w).forEach(([id, at]) => { const base = id.split(':')[0], m = S.metas.get(base) || S.watchlist.find((x) => x.id === base) || (Object.values(S.progress).find((p) => p.metaId === base) && { id: base, type: 'series', name: Object.values(S.progress).find((p) => p.metaId === base).name }); if (m && (!out.has(base) || out.get(base)._added < at)) out.set(base, { ...m, id: base, _added: at }); });
      return [...out.values()].filter((m) => m.name);
    }
    const l = this.lists().find((x) => x.id === t); return l ? l.items.map((m, i) => ({ ...m, _added: l.items.length - i })) : [];
  },
  view() {
    const s = this.st, q = s.q.trim().toLowerCase();
    let l = this.items().filter((m) => (s.type === 'all' || m.type === s.type) && (!q || String(m.name || '').toLowerCase().includes(q)));
    if (s.hide && s.tab !== 'watched') l = l.filter((m) => !(m.type === 'movie' && isWatched(m.id)));
    const yr = (m) => Number(String(m.releaseInfo || m.year || yearOf(m) || '').slice(0, 4)) || 0;
    const by = { added: (a, b) => (b._added || 0) - (a._added || 0), az: (a, b) => String(a.name).localeCompare(String(b.name)), year: (a, b) => yr(b) - yr(a), rating: (a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0) }[s.sort];
    return l.sort(by);
  },
  render() {
    const root = $('#libRows'); if (!root) return;
    const s = this.st, lists = this.lists();
    if (s.tab !== 'watchlist' && s.tab !== 'progress' && s.tab !== 'watched' && !lists.some((x) => x.id === s.tab)) s.tab = 'watchlist';
    const tabs = [['watchlist', `Watchlist`, S.watchlist.length], ['progress', 'In progress', new Set(continueItems().map((p) => p.metaId)).size], ['watched', 'Watched', null], ...lists.map((x) => [x.id, x.name, x.items.length])];
    const list = this.view();
    const old = $('#libX'); const hadFocus = old && old.contains(document.activeElement) ? document.activeElement.dataset : null;
    const box = document.createElement('div'); box.id = 'libX';
    box.innerHTML = `<div class="lib-tabs"><div class="lib-tl" role="tablist" aria-label="Library">${tabs.map(([id, label, n]) => `<button type="button" class="chip${s.tab === id ? ' on' : ''}" role="tab" aria-selected="${s.tab === id}" data-nav data-ltab="${esc(id)}">${esc(label)}${n != null ? ` <span class="tnum">${n}</span>` : ''}</button>`).join('')}</div><button type="button" class="chip lib-new" data-nav id="libNew"><i data-lucide="plus"></i>New list</button></div>
      <div class="lib-bar">
        <div class="segc" role="radiogroup" aria-label="Type">${[['all', 'All'], ['movie', 'Films'], ['series', 'Series']].map(([v, t]) => `<button type="button" class="${s.type === v ? 'on' : ''}" role="radio" aria-checked="${s.type === v}" data-nav data-ltype="${v}">${t}</button>`).join('')}</div>
        <select class="inp lib-sort" id="libSort" aria-label="Sort" data-nav>${[['added', 'Date added'], ['az', 'A to Z'], ['year', 'Newest first'], ['rating', 'Highest rated']].map(([v, t]) => `<option value="${v}"${s.sort === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
        ${s.tab !== 'watched' ? `<button type="button" class="chip${s.hide ? ' on' : ''}" data-nav id="libHide" aria-pressed="${s.hide}">Hide watched</button>` : ''}
        <input class="inp lib-q" id="libQ" type="search" placeholder="Filter" value="${esc(s.q)}" autocomplete="off" aria-label="Filter by title">
        ${s.tab === 'progress' && continueItems().length ? '<button type="button" class="btn btn-ghost btn-sm" data-nav id="libClear"><i data-lucide="trash-2"></i>Clear progress</button>' : ''}
        ${lists.some((x) => x.id === s.tab) ? '<button type="button" class="btn btn-ghost btn-sm" data-nav id="libDel"><i data-lucide="trash-2"></i>Delete list</button>' : ''}
      </div>
      <div class="grid lib-grid">${list.map((m) => cardHTML(m, m._p ? { progress: m._p, sub: progressSub(m._p) } : {})).join('') || `<div class="empty">${{ watchlist: 'Use the Watchlist button on any title to save it here.', progress: 'Start something and it shows up here.', watched: 'Finished films and episodes show up here.' }[s.tab] || 'Add titles from a film page with the Lists button.'}</div>`}</div>`;
    if (old) old.replaceWith(box); else root.prepend(box);
    icons();
    $$('[data-ltab]', box).forEach((b) => b.addEventListener('click', () => { s.tab = b.dataset.ltab; this.render(); }));
    $$('[data-ltype]', box).forEach((b) => b.addEventListener('click', () => { s.type = b.dataset.ltype; this.render(); }));
    $('#libSort', box).addEventListener('change', (e) => { s.sort = e.target.value; Store.set('libSort', s.sort); this.render(); });
    const h = $('#libHide', box); if (h) h.addEventListener('click', () => { s.hide = !s.hide; Store.set('libHide', s.hide); this.render(); });
    const qi = $('#libQ', box); let qt = 0;
    qi.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { s.q = qi.value; const pos = qi.selectionStart; this.render(); const n = $('#libQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ok */ } } }, 160); });
    qi.addEventListener('keydown', (e) => { if (!/^Arrow(Up|Down)$/.test(e.key)) e.stopPropagation(); });
    $('#libNew', box).onclick = () => this.newList();
    const c = $('#libClear', box); if (c) c.onclick = () => confirmTwice(c, () => { S.progress = {}; Store.set('progress', {}); renderLibrary(); });
    const d = $('#libDel', box); if (d) d.onclick = () => confirmTwice(d, () => { this.saveLists(this.lists().filter((x) => x.id !== s.tab)); s.tab = 'watchlist'; this.render(); toast('List deleted'); });
    if (hadFocus) { const k = Object.keys(hadFocus).find((x) => x.startsWith('l')); const el = k && $(`[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${hadFocus[k]}"]`, box); if (el && IS_TV) Nav.focus(el, true); }
  },
  newList(addMeta) {
    const name = (prompt('Name the new list') || '').trim().slice(0, 40); if (!name) return null;
    const l = this.lists(), item = { id: `l${Date.now().toString(36)}`, name, items: [] };
    if (addMeta) item.items.push(this.slim(addMeta));
    this.saveLists([...l, item]); toast(addMeta ? `Added to ${name}` : `${name} is ready`, 'ok');
    if (S.view === 'library') { this.st.tab = item.id; renderLibrary(); }
    return item;
  },
  slim(m) { return { id: m.id, type: m.type, name: m.name, poster: metaPoster(m), background: metaBg(m), releaseInfo: yearOf(m), genres: genresOf(m).slice(0, 3), imdbRating: m.imdbRating }; },
  toggle(listId, m) {
    const l = this.lists(), x = l.find((y) => y.id === listId); if (!x) return;
    const has = x.items.some((i) => i.id === m.id);
    x.items = has ? x.items.filter((i) => i.id !== m.id) : [this.slim(m), ...x.items];
    this.saveLists(l); toast(has ? `Removed from ${x.name}` : `Added to ${x.name}`, has ? 'info' : 'ok');
  },
  // the Lists button on a film page: pick lists in a small menu
  menu(m, btn) {
    let pop = $('#listPop'); if (pop) { pop.remove(); return; }
    const l = this.lists();
    pop = document.createElement('div'); pop.id = 'listPop'; pop.className = 'list-pop';
    pop.innerHTML = `${l.map((x) => `<button type="button" data-nav data-lpick="${esc(x.id)}"><i data-lucide="${x.items.some((i) => i.id === m.id) ? 'check' : 'plus'}"></i>${esc(x.name)}</button>`).join('')}<button type="button" data-nav data-lpick="__new"><i data-lucide="list-plus"></i>New list</button>`;
    btn.after(pop); icons();
    $$('[data-lpick]', pop).forEach((b) => b.addEventListener('click', () => { if (b.dataset.lpick === '__new') this.newList(m); else this.toggle(b.dataset.lpick, m); pop.remove(); }));
    const f = $('[data-lpick]', pop); if (f && IS_TV) Nav.focus(f, true);
  },
  init() {
    this.st.sort = Store.get('libSort', 'added') || 'added'; this.st.hide = !!Store.get('libHide', false);
    const base = renderLibrary;
    renderLibrary = function () {
      base.apply(this, arguments);
      // the watchlist and Continue watching move into the tabs; bookmarks and the calendar stay below
      $$('#libRows > section.row').forEach((sec) => { if (/^(My watchlist|Continue watching)/.test((sec.querySelector('.row-title') || {}).textContent || '')) sec.remove(); });
      Library.render();
    };
    const rd = renderDetail;
    renderDetail = function () {
      const r = rd.apply(this, arguments);
      const b = $('#dList'); if (b && !$('#dLists') && D.meta) { b.insertAdjacentHTML('afterend', '<button class="btn btn-ghost" type="button" id="dLists" data-nav><i data-lucide="list-plus"></i>Lists</button>'); icons(); const m = D.meta; $('#dLists').onclick = (e) => Library.menu(m, e.currentTarget); }
      return r;
    };
    // lists travel with the account
    const ex = exportData; exportData = function () { const d = ex.apply(this, arguments); d.lists = Library.lists(); return d; };
    const ap = Account.applyRemote.bind(Account); Account.applyRemote = function (d) { const r = ap(d); if (d && Array.isArray(d.lists)) Store.set('lists', d.lists); return r; };
    if (S.view === 'library') renderLibrary();
  },
};
Library.init();
