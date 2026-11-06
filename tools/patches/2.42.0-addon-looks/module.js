/* ---------------- 2.42.0 Addon looks ----------------
   Stremio addons can shape how their own content shows in MKCinema, with data only. An addon adds a "mkcinema" object
   to its manifest (row style and placement per catalog) and to its metas (up to 2 poster badges and up to 3 info
   panels on the film page). Other apps ignore the field. MKCinema validates every value against a fixed schema and
   draws everything with its own components, so an addon never sends HTML, CSS, scripts or colours.
   The standard Stremio "posterShape" (square / landscape) is honoured for every addon.
   Per addon switch: Settings › Appearance › Addon looks. #safe in the address turns all of it off for that start.
   Spec: docs/addon-looks.md */
const AddonUI = {
  OFF: 'addonLooksOff', PINS: 'libAddonTabs',
  LAYOUTS: ['poster', 'landscape', 'square', 'top10'], PLACES: ['home', 'discover', 'library'],
  TONES: ['plain', 'gold', 'green', 'red', 'blue'],
  ICONS: { star: 'star', award: 'award', trophy: 'trophy', flame: 'flame', heart: 'heart', check: 'check', clock: 'clock', tv: 'tv', film: 'film', sparkles: 'sparkles' },
  KINDS: ['facts', 'ratings', 'list', 'text'],
  safe: /(^|[#&])safe(&|$)/.test(location.hash.slice(1)),
  seen: new Map(), // addon id -> name, for addons that sent looks this session
  mf: new WeakMap(),
  /* ---- validation: everything an addon sends passes through here; anything unknown is dropped ---- */
  txt(v, n) {
    if (typeof v !== 'string' && typeof v !== 'number') return '';
    // control characters and bidi overrides out (they can disguise text), then trim to the limit
    return String(v).replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
  },
  url(v) {
    if (typeof v !== 'string' || v.length > 500 || !/^https:\/\/[^\s"'<>\\`]+$/i.test(v)) return '';
    try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch (e) { return ''; }
  },
  id(v) { return typeof v === 'string' && /^[\w:.%-]{1,120}$/.test(v) ? v : ''; },
  arr(v, n) { return Array.isArray(v) ? v.slice(0, n) : []; },
  size(v) { try { return JSON.stringify(v).length; } catch (e) { return Infinity; } },
  off() { const l = Store.raw.get(this.OFF, []); return Array.isArray(l) ? l : []; },
  allowed(addon) { return !this.safe && !!addon && !!addon.manifest && !this.off().includes(addon.manifest.id); },
  setAllowed(aid, on) {
    const l = this.off().filter((x) => x !== aid); if (!on) l.push(aid);
    Store.raw.set(this.OFF, l); if (typeof rerender === 'function') rerender(); if (S.view === 'library') renderLibrary();
  },
  /* manifest.mkcinema = { version: 1, catalogs: [{ type, id, layout, place }] } */
  manifest(addon) {
    const m = addon && addon.manifest; if (!m || typeof m !== 'object') return null;
    if (this.mf.has(m)) return this.mf.get(m);
    let out = null; const raw = m.mkcinema;
    if (raw && typeof raw === 'object' && this.size(raw) <= 16384) {
      const cats = {};
      this.arr(raw.catalogs, 100).forEach((c) => {
        if (!c || typeof c !== 'object') return;
        const type = this.id(c.type), id = this.id(c.id); if (!type || !id) return;
        cats[`${type}/${id}`] = { layout: this.LAYOUTS.includes(c.layout) ? c.layout : '', place: this.PLACES.includes(c.place) ? c.place : '' };
      });
      out = { catalogs: cats };
      if (Object.keys(cats).length) this.seen.set(m.id, m.name);
    }
    this.mf.set(m, out); return out;
  },
  catExt(cat) { if (!this.allowed(cat.addon)) return null; const x = this.manifest(cat.addon); return (x && x.catalogs[`${cat.type}/${cat.id}`]) || null; },
  place(cat) { const x = this.catExt(cat); return (x && x.place) || 'home'; },
  /* the row style: the addon's choice, else Stremio's standard posterShape (most of the first items), else posters */
  layout(cat, metas) {
    const x = this.catExt(cat); if (x && x.layout) return x.layout;
    const n = { square: 0, landscape: 0 }; (metas || []).slice(0, 6).forEach((m) => { if (m && n[m.posterShape] != null) n[m.posterShape]++; });
    const k = n.landscape >= n.square ? 'landscape' : 'square';
    return n[k] >= 3 || (metas && metas.length && n[k] === Math.min(6, metas.length)) ? k : 'poster';
  },
  /* meta.mkcinema = { badges: [...], panels: [...] }; replaced by a checked copy in _mkx, the raw object is removed */
  clean(m, addon) {
    if (!m || typeof m !== 'object' || !('mkcinema' in m)) return m;
    const raw = m.mkcinema, out = { ...m }; delete out.mkcinema;
    if (!this.allowed(addon) || !raw || typeof raw !== 'object' || this.size(raw) > 16384) return out;
    const from = this.txt(addon.manifest.name, 40) || 'an addon', aid = String(addon.manifest.id || '');
    const badges = this.arr(raw.badges, 2).map((b) => {
      if (!b || typeof b !== 'object') return null;
      const text = this.txt(b.text, 10); if (!text) return null;
      return { text, tone: this.TONES.includes(b.tone) ? b.tone : 'plain', icon: this.ICONS[b.icon] || '' };
    }).filter(Boolean);
    const panels = this.arr(raw.panels, 3).map((p) => this.panel(p)).filter(Boolean);
    if (badges.length || panels.length) { out._mkx = { badges, panels, from, aid }; this.seen.set(aid, from); }
    return out;
  },
  panel(p) {
    if (!p || typeof p !== 'object' || !this.KINDS.includes(p.kind)) return null;
    const title = this.txt(p.title, 40); let items = [];
    if (p.kind === 'text') { const t = this.txt(p.text, 600); if (!t) return null; items = [t]; }
    if (p.kind === 'facts') items = this.arr(p.items, 12).map((i) => i && { label: this.txt(i.label, 24), value: this.txt(i.value, 80) }).filter((i) => i && i.label && i.value);
    if (p.kind === 'ratings') items = this.arr(p.items, 8).map((i) => i && { source: this.txt(i.source, 24), score: this.txt(i.score, 12) }).filter((i) => i && i.source && i.score);
    if (p.kind === 'list') items = this.arr(p.items, 20).map((i) => {
      if (!i || typeof i !== 'object') return null;
      const id = this.id(i.id), name = this.txt(i.name, 80), type = i.type === 'series' ? 'series' : i.type === 'movie' ? 'movie' : '';
      return id && name && type ? { id, type, name, poster: this.url(i.poster) || undefined } : null;
    }).filter(Boolean);
    if (!items.length) return null;
    const links = this.arr(p.links, 4).map((l) => l && { label: this.txt(l.label, 30), url: this.url(l.url) }).filter((l) => l && l.label && l.url);
    return { kind: p.kind, title, items, links };
  },
  /* ---- drawing ---- */
  badgesHTML(m) {
    const b = m && m._mkx && m._mkx.badges; if (!b || !b.length) return '';
    return `<span class="axb" aria-label="${esc(`From ${m._mkx.from}`)}">${b.map((x) => `<span class="axb-i t-${x.tone}">${x.icon ? `<i data-lucide="${x.icon}"></i>` : ''}${esc(x.text)}</span>`).join('')}</span>`;
  },
  card(m, lay, k) {
    if (lay === 'landscape') return cardHTML(m, { wide: true });
    const h = cardHTML(m);
    if (lay === 'square') return h.replace('<div class="card"', '<div class="card ax-sq"');
    if (lay === 'top10' && k < 10) return h.replace('<div class="card"', `<div class="card t10c" data-rank="${k + 1}"`);
    return h;
  },
  host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } },
  panelsHTML(m) {
    const x = m && m._mkx; if (!x || !x.panels.length) return '';
    return `<section class="axp" aria-label="${esc(`From ${x.from}`)}"><p class="axp-from">From ${esc(x.from)}</p>${x.panels.map((p) => `<div class="axp-box">
      ${p.title ? `<h3 class="sec-title axp-t">${esc(p.title)}</h3>` : ''}
      ${p.kind === 'text' ? `<p class="axp-text">${esc(p.items[0])}</p>` : ''}
      ${p.kind === 'facts' ? `<div class="credits axp-facts">${p.items.map((i) => `<b>${esc(i.label)}</b><span>${esc(i.value)}</span>`).join('')}</div>` : ''}
      ${p.kind === 'ratings' ? `<div class="axp-rates">${p.items.map((i) => `<span class="axp-rate"><small>${esc(i.source)}</small><b class="tnum">${esc(i.score)}</b></span>`).join('')}</div>` : ''}
      ${p.kind === 'list' ? `<div class="rail axp-rail">${p.items.map((i) => cardHTML(i)).join('')}</div>` : ''}
      ${p.links.length ? `<div class="axp-links">${p.links.map((l) => `<button type="button" class="chip axp-link" data-nav data-axurl="${esc(l.url)}"><i data-lucide="external-link"></i><span>${esc(l.label)} · ${esc(this.host(l.url))}</span></button>`).join('')}</div>` : ''}
    </div>`).join('')}</section>`;
  },
  /* links leave the app, so the first press names the site and the second one opens it */
  link(b) {
    const u = this.url(b.dataset.axurl); if (!u) return;
    const sp = b.querySelector('span');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.dataset.orig = sp.textContent; sp.textContent = `Open ${this.host(u)}?`; setTimeout(() => { if (b.isConnected && b.dataset.armed) { delete b.dataset.armed; sp.textContent = b.dataset.orig; } }, 4000); return; }
    delete b.dataset.armed; sp.textContent = b.dataset.orig;
    window.open(u, '_blank', 'noopener,noreferrer');
  },
  /* ---- Library tabs from addon catalogs: pinned by you, or offered by the addon (place: library) ---- */
  cache: new Map(), loading: new Set(), inLib: 0,
  ckey(c) { return `ax:${c.addon.manifest.id}/${c.type}/${c.id}`; },
  pins() { const l = Store.get(this.PINS, []); return Array.isArray(l) ? l.filter((x) => typeof x === 'string') : []; },
  pickable() { return engine.catalogs({ includeRequired: true }).filter((c) => c.type !== 'tv' && !c.required.length); },
  libCats() {
    const pins = this.pins(), all = this.pickable(), out = [];
    all.forEach((c) => { const k = this.ckey(c); if (pins.includes(k) || this.place(c) === 'library') out.push(c); });
    return out;
  },
  libLists() {
    return this.libCats().map((c) => { const k = this.ckey(c), got = this.cache.get(k); if (!got) this.load(c); return { id: k, name: c.name, items: got || [], _ax: true }; });
  },
  async load(c) {
    const k = this.ckey(c); if (this.loading.has(k)) return; this.loading.add(k);
    let all = [];
    try {
      const pages = c.extras.some((e) => e.name === 'skip') ? 3 : 1;
      for (let i = 0; i < pages; i++) {
        const got = await engine.fetchCatalog(c, i ? { skip: all.length } : {});
        const ids = new Set(all.map((m) => m.id)); const add = got.filter((m) => !ids.has(m.id));
        all.push(...add); if (!add.length) break;
      }
    } catch (e) { console.warn('Library tab:', c.name, e.message); }
    this.cache.set(k, all.slice(0, 300)); this.loading.delete(k);
    if (S.view === 'library' && Library.st.tab === k) Library.render();
  },
  pin(c) { const k = this.ckey(c), l = this.pins(); if (!l.includes(k)) Store.set(this.PINS, [...l, k]); Library.st.tab = k; Library.render(); toast(`${c.name} is now a Library tab`, 'ok'); },
  unpin(k) { Store.set(this.PINS, this.pins().filter((x) => x !== k)); const c = this.libCats().find((x) => this.ckey(x) === k); Library.st.tab = 'watchlist'; Library.render(); toast(c && this.place(c) === 'library' ? 'This addon keeps its list in Library. Turn off its looks in Settings › Appearance to remove it.' : 'Tab removed'); },
  picker(btn) {
    let pop = $('#axPick'); if (pop) { pop.remove(); return; }
    const pins = this.pins(), cats = this.pickable().filter((c) => !pins.includes(this.ckey(c))).slice(0, 60);
    pop = document.createElement('div'); pop.id = 'axPick'; pop.className = 'list-pop ax-pick';
    pop.innerHTML = cats.length ? `<p class="ax-pick-h">Show a list from your addons as a Library tab</p>${cats.map((c, i) => `<button type="button" data-nav data-axpick="${i}"><i data-lucide="${c.type === 'series' ? 'tv' : 'film'}"></i><span>${esc(c.name)}<small>${esc(c.addon.manifest.name)} · ${c.type === 'series' ? 'Series' : 'Films'}</small></span></button>`).join('')}` : '<p class="ax-pick-h">None of your addons has a list to add. Addons with catalogs show up here.</p>';
    (btn.closest('.lib-tabs') || btn).after(pop); icons();
    $$('[data-axpick]', pop).forEach((b) => b.addEventListener('click', () => { pop.remove(); this.pin(cats[Number(b.dataset.axpick)]); }));
    const f = $('[data-axpick]', pop); if (f && IS_TV) Nav.focus(f, true);
  },
  /* ---- Settings › Appearance › Addon looks ---- */
  setRows() {
    const list = [];
    (engine.addons || []).forEach((a) => { if (a && a.manifest && (this.manifest(a) || this.seen.has(a.manifest.id))) list.push(a); });
    const rows = [{ group: 'Addon looks' }];
    if (!list.length) rows.push({ html: () => `<div class="set-row"><div><b>Addon looks</b><small>Addons can choose how their own rows look, add small badges to their posters and add an info box to film pages. None of your addons does this yet. ${this.safe ? 'Off for this start (#safe).' : ''}</small></div></div>` });
    list.forEach((a, i) => rows.push({ key: `axui${i}`, label: a.manifest.name, help: 'Let this addon choose its row style and Library placement, show badges on its posters and add its info box to film pages. Always drawn in your theme.', type: 'toggle', get: () => !this.off().includes(a.manifest.id), set: (v) => this.setAllowed(a.manifest.id, v) }));
    return rows;
  },
  init() {
    // 1. every catalog and meta answer is checked once, where it enters the app
    const fc = engine.fetchCatalog;
    engine.fetchCatalog = async function (cat, extra) { const ms = await fc.apply(this, arguments); return ms.map((m) => AddonUI.clean(m, cat.addon)); };
    const fm = engine.fetchMeta;
    engine.fetchMeta = async function () { const r = await fm.apply(this, arguments); if (!r || !('mkcinema' in r)) return r; const a = (this.addons || []).find((x) => x.manifest && x.manifest.name === r._addon); return AddonUI.clean(r, a); };
    // 2. badges on any poster that carries them (not on progress cards)
    const ch = cardHTML;
    cardHTML = function (m, o) { const h = ch.apply(this, arguments); return m && m._mkx && !(o && o.progress) ? h.replace('<button class="orb"', `${AddonUI.badgesHTML(m)}<button class="orb"`) : h; };
    // 3. the film page: the addon's panels under the credits
    const rd = renderDetail;
    renderDetail = function () {
      const r = rd.apply(this, arguments);
      try {
        const html = AddonUI.panelsHTML(D.meta), at = $('#detail .credits');
        if (html && at) { at.insertAdjacentHTML('afterend', html); $$('#detail [data-axurl]').forEach((b) => b.addEventListener('click', () => AddonUI.link(b))); icons(); }
      } catch (e) { console.warn('Addon panel skipped:', e.message); }
      return r;
    };
    // 4. Library: addon tabs behave like lists while the Library draws; they are never saved as lists
    const ll = Library.lists, lr = Library.render, ls = Library.saveLists;
    Library.lists = function () { const l = ll.apply(this, arguments); return AddonUI.inLib ? l.concat(AddonUI.libLists()) : l; };
    Library.saveLists = function (l) { return ls.call(this, (l || []).filter((x) => !x._ax)); };
    Library.render = function () {
      AddonUI.inLib++; let r; try { r = lr.apply(this, arguments); } finally { AddonUI.inLib--; }
      const box = $('#libX'); if (!box) return r;
      const nb = $('#libNew', box);
      if (nb && !$('#libAx', box)) { nb.insertAdjacentHTML('afterend', '<button type="button" class="chip lib-new" data-nav id="libAx"><i data-lucide="blocks"></i>Add from addons</button>'); $('#libAx', box).onclick = (e) => AddonUI.picker(e.currentTarget); icons(); }
      const t = this.st.tab;
      if (/^ax:/.test(t)) {
        const d = $('#libDel', box); if (d) { d.innerHTML = '<i data-lucide="x"></i>Remove tab'; d.onclick = () => AddonUI.unpin(t); icons(); }
        const e = $('.lib-grid .empty', box); if (e) e.textContent = AddonUI.loading.has(t) || !AddonUI.cache.has(t) ? 'Loading…' : 'This list is empty.';
      }
      return r;
    };
  },
};
AddonUI.init();
// Settings › Appearance gets the per-addon switches (added to the section, so search and the TV remote see them)
{
  const sec = typeof SECTIONS !== 'undefined' && SECTIONS.find((x) => x.id === 'appearance');
  if (sec && typeof sec.rows === 'function') { const base = sec.rows; sec.rows = function () { return [...base.apply(this, arguments), ...AddonUI.setRows()]; }; }
}
