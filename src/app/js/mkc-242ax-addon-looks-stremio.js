
/* ---------------- 2.42.0 / 2.44.0 Addon looks ----------------
   Stremio addons can shape how their content shows in MKCinema, with data only. Other apps ignore the field.
   - manifest.mkcinema.catalogs: row style (poster, landscape, square, top10) and place (home, discover, library)
   - meta.mkcinema: up to 2 poster badges and up to 3 film-page panels
   - manifest.mkcinema.enrich: badges and panels for ANY title (a ratings addon), per-episode badges, poster badges in
     batches; asks the viewer once, because the addon then sees which titles they browse
   - manifest.mkcinema.library: keeps a copy of the viewer's watchlist on the addon's server, only after they allow it
   MKCinema validates every value against a fixed schema and draws everything with its own components, so an addon
   never sends HTML, CSS, scripts or colours. Stremio's posterShape and the catalog showInHome flag are honoured too.
   Per addon switch and checker: Settings › Appearance › Addon looks. #safe turns all of it off for that start.
   Spec: docs/addon-looks.md */
const AddonUI = {
  OFF: 'addonLooksOff', PINS: 'libAddonTabs', OK: 'addonLooksOk',
  LAYOUTS: ['poster', 'landscape', 'square', 'top10'], PLACES: ['home', 'discover', 'library'],
  TONES: ['plain', 'gold', 'green', 'red', 'blue'],
  ICONS: { star: 'star', award: 'award', trophy: 'trophy', flame: 'flame', heart: 'heart', check: 'check', clock: 'clock', tv: 'tv', film: 'film', sparkles: 'sparkles' },
  KINDS: ['facts', 'ratings', 'list', 'text'],
  safe: /(^|[#&])safe(&|$)/.test(location.hash.slice(1)),
  seen: new Map(), // addon id -> name, for addons that sent looks this session
  mf: new WeakMap(),
  W: null, // the checker collects what was dropped here; null in normal use
  w(msg) { if (this.W && this.W.length < 200) this.W.push(msg); },
  /* ---- validation: everything an addon sends passes through here; anything unknown is dropped ---- */
  txt(v, n, what) {
    if (typeof v !== 'string' && typeof v !== 'number') { if (v != null && what) this.w(`${what}: not text, dropped`); return ''; }
    // control characters and bidi overrides out (they can disguise text), then trim to the limit
    const t = String(v).replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '').replace(/\s+/g, ' ').trim();
    if (what && t.length > n) this.w(`${what}: cut to ${n} characters`);
    return t.slice(0, n);
  },
  url(v, what) {
    const bad = () => { if (what && v) this.w(`${what}: not a plain https link, dropped`); return ''; };
    if (typeof v !== 'string' || v.length > 500 || !/^https:\/\/[^\s"'<>\\`]+$/i.test(v)) return bad();
    try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password ? u.href : bad(); } catch (e) { return bad(); }
  },
  id(v) { return typeof v === 'string' && /^[\w:.%-]{1,120}$/.test(v) ? v : ''; },
  arr(v, n, what) { if (!Array.isArray(v)) { if (v != null && what) this.w(`${what}: not a list, dropped`); return []; } if (what && v.length > n) this.w(`${what}: only the first ${n} are used`); return v.slice(0, n); },
  size(v) { try { return JSON.stringify(v).length; } catch (e) { return Infinity; } },
  off() { const l = Store.raw.get(this.OFF, []); return Array.isArray(l) ? l : []; },
  allowed(addon) { return !this.safe && !!addon && !!addon.manifest && addon.enabled !== false && !this.off().includes(addon.manifest.id); },
  setAllowed(aid, on) {
    const l = this.off().filter((x) => x !== aid); if (!on) l.push(aid);
    Store.raw.set(this.OFF, l); this.badgeCache.clear(); if (typeof rerender === 'function') rerender(); if (S.view === 'library') renderLibrary();
  },
  /* the viewer's answers to the two questions (see more titles, keep a copy of the watchlist), per addon */
  oks() { const o = Store.raw.get(this.OK, {}); return o && typeof o === 'object' ? o : {}; },
  ok(aid, what) { const o = this.oks()[aid]; return !!(o && o[what] === true); },
  setOk(aid, what, v) { const o = this.oks(); o[aid] = { ...(o[aid] || {}), [what]: v }; Store.raw.set(this.OK, o); },
  /* manifest.mkcinema = { version: 1, catalogs: [{ type, id, layout, place }], enrich: {...}, library: {...} } */
  manifest(addon) {
    const m = addon && addon.manifest; if (!m || typeof m !== 'object') return null;
    if (!this.W && this.mf.has(m)) return this.mf.get(m);
    let out = null; const raw = m.mkcinema;
    if (raw != null && (typeof raw !== 'object' || this.size(raw) > 16384)) this.w('manifest.mkcinema: not an object or over 16 KB, ignored');
    else if (raw) {
      const cats = {};
      this.arr(raw.catalogs, 100, 'manifest.mkcinema.catalogs').forEach((c, i) => {
        if (!c || typeof c !== 'object') return;
        const type = this.id(c.type), id = this.id(c.id); if (!type || !id) { this.w(`catalogs[${i}]: needs type and id`); return; }
        if (!(m.catalogs || []).some((x) => x && x.type === type && x.id === id)) this.w(`catalogs[${i}]: no catalog ${type}/${id} in this manifest`);
        if (c.layout != null && !this.LAYOUTS.includes(c.layout)) this.w(`catalogs[${i}].layout "${String(c.layout).slice(0, 20)}" is not one of ${this.LAYOUTS.join(', ')}`);
        if (c.place != null && !this.PLACES.includes(c.place)) this.w(`catalogs[${i}].place "${String(c.place).slice(0, 20)}" is not one of ${this.PLACES.join(', ')}`);
        cats[`${type}/${id}`] = { layout: this.LAYOUTS.includes(c.layout) ? c.layout : '', place: this.PLACES.includes(c.place) ? c.place : '' };
      });
      let enrich = null;
      if (raw.enrich && typeof raw.enrich === 'object') {
        const types = this.arr(raw.enrich.types, 4, 'enrich.types').filter((t) => t === 'movie' || t === 'series');
        const pre = this.arr(raw.enrich.idPrefixes, 10, 'enrich.idPrefixes').map((p) => this.id(p)).filter(Boolean);
        enrich = { types: types.length ? types : ['movie', 'series'], idPrefixes: pre.length ? pre : ['tt'], posters: raw.enrich.posters === true, details: raw.enrich.details !== false };
      } else if (raw.enrich != null) this.w('enrich: not an object, ignored');
      let library = null;
      if (raw.library && typeof raw.library === 'object') { if (raw.library.push === true) library = { push: true }; else this.w('library: only { "push": true } is understood'); }
      out = { catalogs: cats, enrich, library };
      if (Object.keys(cats).length || enrich || library) this.seen.set(m.id, m.name);
    }
    if (!this.W) this.mf.set(m, out); return out;
  },
  decl(cat) { return ((cat.addon.manifest && cat.addon.manifest.catalogs) || []).find((c) => c && c.type === cat.type && c.id === cat.id) || null; },
  catExt(cat) { if (!this.allowed(cat.addon)) return null; const x = this.manifest(cat.addon); return (x && x.catalogs[`${cat.type}/${cat.id}`]) || null; },
  /* Home, Discover or Library: the addon's choice, else the catalog's own showInHome: false keeps it off Home */
  place(cat) { const x = this.catExt(cat); if (x && x.place) return x.place; const d = this.decl(cat); return d && d.showInHome === false ? 'discover' : 'home'; },
  /* the row style: the addon's choice, else Stremio's standard posterShape (most of the first items), else posters */
  layout(cat, metas) {
    const x = this.catExt(cat); if (x && x.layout) return x.layout;
    const n = { square: 0, landscape: 0 }; (metas || []).slice(0, 6).forEach((m) => { if (m && n[m.posterShape] != null) n[m.posterShape]++; });
    const k = n.landscape >= n.square ? 'landscape' : 'square';
    return n[k] >= 3 || (metas && metas.length && n[k] === Math.min(6, metas.length)) ? k : 'poster';
  },
  badges(list, what) {
    return this.arr(list, 2, what).map((b, i) => {
      if (!b || typeof b !== 'object') return null;
      const text = this.txt(b.text, 10, `${what}[${i}].text`); if (!text) { this.w(`${what}[${i}]: no text, dropped`); return null; }
      if (b.tone != null && !this.TONES.includes(b.tone)) this.w(`${what}[${i}].tone "${String(b.tone).slice(0, 20)}" is not one of ${this.TONES.join(', ')}`);
      if (b.icon != null && !this.ICONS[b.icon]) this.w(`${what}[${i}].icon "${String(b.icon).slice(0, 20)}" is not in the icon set`);
      return { text, tone: this.TONES.includes(b.tone) ? b.tone : 'plain', icon: this.ICONS[b.icon] || '' };
    }).filter(Boolean);
  },
  /* meta.mkcinema = { badges: [...], panels: [...] }; replaced by a checked copy in _mkx, the raw object is removed */
  clean(m, addon) {
    if (!m || typeof m !== 'object' || !('mkcinema' in m)) return m;
    const raw = m.mkcinema, out = { ...m }; delete out.mkcinema;
    if (!this.allowed(addon)) return out;
    if (!raw || typeof raw !== 'object' || this.size(raw) > 16384) { this.w(`${m.id}: mkcinema is not an object or over 16 KB, ignored`); return out; }
    const x = this.look(raw, addon, m.id); if (x) { out._mkx = x; this.seen.set(x.aid, x.from); }
    return out;
  },
  look(raw, addon, tag) {
    const from = this.txt(addon.manifest.name, 40) || 'an addon', aid = String(addon.manifest.id || '');
    const badges = this.badges(raw.badges, `${tag}.badges`);
    const panels = this.arr(raw.panels, 3, `${tag}.panels`).map((p, i) => this.panel(p, `${tag}.panels[${i}]`)).filter(Boolean);
    return badges.length || panels.length ? { badges, panels, from, aid } : null;
  },
  panel(p, what) {
    if (!p || typeof p !== 'object' || !this.KINDS.includes(p.kind)) { this.w(`${what}: kind must be one of ${this.KINDS.join(', ')}`); return null; }
    const title = this.txt(p.title, 40, `${what}.title`); let items = [];
    if (p.kind === 'text') { const t = this.txt(p.text, 600, `${what}.text`); if (!t) { this.w(`${what}: empty text`); return null; } items = [t]; }
    if (p.kind === 'facts') items = this.arr(p.items, 12, `${what}.items`).map((i) => i && { label: this.txt(i.label, 24, `${what} label`), value: this.txt(i.value, 80, `${what} value`) }).filter((i) => i && i.label && i.value);
    if (p.kind === 'ratings') items = this.arr(p.items, 8, `${what}.items`).map((i) => i && { source: this.txt(i.source, 24, `${what} source`), score: this.txt(i.score, 12, `${what} score`) }).filter((i) => i && i.source && i.score);
    if (p.kind === 'list') items = this.arr(p.items, 20, `${what}.items`).map((i) => {
      if (!i || typeof i !== 'object') return null;
      const id = this.id(i.id), name = this.txt(i.name, 80), type = i.type === 'series' ? 'series' : i.type === 'movie' ? 'movie' : '';
      if (!(id && name && type)) { this.w(`${what}: a list item needs id, name and type movie or series`); return null; }
      return { id, type, name, poster: this.url(i.poster, `${what} poster`) || undefined };
    }).filter(Boolean);
    if (!items.length) { this.w(`${what}: nothing usable in it, dropped`); return null; }
    const links = this.arr(p.links, 4, `${what}.links`).map((l) => l && { label: this.txt(l.label, 30), url: this.url(l.url, `${what} link`) }).filter((l) => l && l.label && l.url);
    return { kind: p.kind, title, items, links };
  },
  /* ---- drawing ---- */
  chips(b) { return b.map((x) => `<span class="axb-i t-${x.tone}">${x.icon ? `<i data-lucide="${x.icon}"></i>` : ''}${esc(x.text)}</span>`).join(''); },
  badgesHTML(m) {
    const b = m && m._mkx && m._mkx.badges; if (!b || !b.length) return '';
    return `<span class="axb" aria-label="${esc(`From ${m._mkx.from}`)}">${this.chips(b)}</span>`;
  },
  card(m, lay, k) {
    if (lay === 'landscape') return cardHTML(m, { wide: true });
    const h = cardHTML(m);
    if (lay === 'square') return h.replace('<div class="card"', '<div class="card ax-sq"');
    if (lay === 'top10' && k < 10) return h.replace('<div class="card"', `<div class="card t10c" data-rank="${k + 1}"`);
    return h;
  },
  host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } },
  panelsHTML(x) {
    if (!x || !x.panels.length) return '';
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
  /* ---- enrichment: a ratings (or any info) addon adds to titles it did not list itself ----
     GET {base}/mkcinema/meta/{type}/{id}.json  -> { badges, panels, episodes: { "<video id>": [badge, badge] } }
     GET {base}/mkcinema/badges/{type}/{id,id,...}.json -> { badges: { "<id>": [badge, badge] } }  (up to 40 ids) */
  enrichers(type, id) {
    return (engine.addons || []).filter((a) => {
      if (!this.allowed(a) || a.virtual) return false;
      const x = this.manifest(a); const e = x && x.enrich; if (!e || !e.types.includes(type)) return false;
      return !id || e.idPrefixes.some((p) => String(id).startsWith(p));
    });
  },
  get(url) { return engine.http(url, { ttl: 6 * 60 * 60 * 1000, timeout: 8000 }); },
  detail: new Map(), // `${type}/${id}` -> [{ x, eps }]
  async enrich(m) {
    const k = `${m.type}/${m.id}`; if (this.detail.has(k)) return this.detail.get(k);
    const list = this.enrichers(m.type, m.id).filter((a) => this.manifest(a).enrich.details && this.ok(a.manifest.id, 'enrich'));
    this.detail.set(k, []);
    const res = await Promise.allSettled(list.map(async (a) => {
      const r = await this.get(`${a.baseUrl}/mkcinema/meta/${encodeURIComponent(m.type)}/${encodeURIComponent(m.id)}.json`);
      if (!r || typeof r !== 'object' || this.size(r) > 65536) return null;
      const x = this.look(r, a, `${a.manifest.id} ${m.id}`), eps = {};
      if (r.episodes && typeof r.episodes === 'object') Object.entries(r.episodes).slice(0, 1000).forEach(([vid, b]) => { const v = this.id(vid); const bb = v && this.badges(b, `episodes ${vid}`); if (bb && bb.length) eps[v] = bb; });
      return x || Object.keys(eps).length ? { x: x || { badges: [], panels: [], from: this.txt(a.manifest.name, 40), aid: a.manifest.id }, eps } : null;
    }));
    const out = res.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
    this.detail.set(k, out);
    if (this.detail.size > 200) this.detail.delete(this.detail.keys().next().value);
    return out;
  },
  /* the film page: the title's own panels, then each enrichment addon's badges, panels and episode badges */
  paintDetail() {
    const m = D.meta, at = $('#detail .credits'); if (!m || !at) return;
    $$('#detail .axp, #detail .axt').forEach((x) => x.remove());
    const got = this.detail.get(`${m.type}/${m.id}`) || [];
    const title = got.flatMap((g) => g.x.badges.map((b) => ({ ...b, from: g.x.from }))).slice(0, 4);
    let html = title.length ? `<div class="axt">${title.map((b) => `<span class="axb-i t-${b.tone}" title="${esc(`From ${b.from}`)}">${b.icon ? `<i data-lucide="${b.icon}"></i>` : ''}${esc(b.text)}</span>`).join('')}</div>` : '';
    html += this.panelsHTML(m._mkx) + got.map((g) => this.panelsHTML(g.x)).join('');
    if (html) { at.insertAdjacentHTML('afterend', html); $$('#detail [data-axurl]').forEach((b) => b.addEventListener('click', () => this.link(b))); }
    this.paintEpisodes(document.getElementById('detail'));
    icons();
  },
  epBadges(vid) { const m = D.meta; if (!m) return []; const got = this.detail.get(`${m.type}/${m.id}`) || []; return got.flatMap((g) => g.eps[vid] || []).slice(0, 2); },
  paintEpisodes(root) {
    if (!root) return;
    $$('.ep[data-vid]', root).forEach((b) => {
      const bb = this.epBadges(b.dataset.vid), num = b.querySelector('.num'); if (!num) return;
      const old = num.querySelector('.axe'); if (old) old.remove();
      if (bb.length) num.insertAdjacentHTML('beforeend', `<span class="axe">${this.chips(bb)}</span>`);
    });
  },
  /* poster badges for any title, asked in batches for the posters on screen */
  badgeCache: new Map(), pend: new Map(), flushT: 0,
  posterAddons(type, id) { return this.enrichers(type, id).filter((a) => this.manifest(a).enrich.posters && this.ok(a.manifest.id, 'enrich')); },
  wantBadges(card) {
    const id = card.dataset.id, type = card.dataset.type; if (!id || card.dataset.axq || card.querySelector('.axb') || card.dataset.video) return;
    card.dataset.axq = '1';
    const k = `${type}/${id}`;
    if (this.badgeCache.has(k)) { this.putBadges(card, this.badgeCache.get(k)); return; }
    if (!this.posterAddons(type, id).length) return;
    if (!this.pend.has(k)) this.pend.set(k, new Set()); this.pend.get(k).add(card);
    clearTimeout(this.flushT); this.flushT = setTimeout(() => this.flush(), 250);
  },
  async flush() {
    const jobs = new Map(); // `${aid}|${type}` -> ids
    for (const k of this.pend.keys()) {
      const i = k.indexOf('/'), type = k.slice(0, i), id = k.slice(i + 1);
      this.posterAddons(type, id).forEach((a) => { const j = `${a.manifest.id}|${type}`; if (!jobs.has(j)) jobs.set(j, { a, type, ids: [] }); jobs.get(j).ids.push(id); });
    }
    const pend = this.pend; this.pend = new Map();
    const found = new Map();
    await Promise.allSettled([...jobs.values()].flatMap(({ a, type, ids }) => {
      const parts = []; for (let i = 0; i < ids.length; i += 40) parts.push(ids.slice(i, i + 40));
      return parts.map(async (part) => {
        const r = await this.get(`${a.baseUrl}/mkcinema/badges/${encodeURIComponent(type)}/${part.map(encodeURIComponent).join(',')}.json`);
        const map = r && typeof r === 'object' && r.badges && typeof r.badges === 'object' && this.size(r) <= 131072 ? r.badges : {};
        part.forEach((id) => { const bb = this.badges(map[id], `badges ${id}`); if (bb.length) { const k = `${type}/${id}`; found.set(k, [...(found.get(k) || []), ...bb].slice(0, 2)); } });
      });
    }));
    pend.forEach((cards, k) => { const bb = found.get(k) || []; this.badgeCache.set(k, bb); cards.forEach((c) => this.putBadges(c, bb)); });
    if (this.badgeCache.size > 3000) this.badgeCache.clear();
  },
  putBadges(card, bb) {
    if (!bb.length || !card.isConnected || card.querySelector('.axb') || card.dataset.video) return;
    const orb = card.querySelector('.orb'); if (orb) { orb.insertAdjacentHTML('beforebegin', `<span class="axb">${this.chips(bb)}</span>`); icons(); }
  },
  watchCards() {
    if (this.cardObs) { this.scan(document); return; }
    let raf = 0;
    this.cardObs = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => this.scan(document)); });
    ['#homeRows', '#discGrid', '#libRows', '#detail'].forEach((sel) => { const el = $(sel); if (el) this.cardObs.observe(el, { childList: true, subtree: true }); });
    this.scan(document);
  },
  scan(root) {
    if (!(engine.addons || []).some((a) => { const x = this.allowed(a) && this.manifest(a); return x && x.enrich && x.enrich.posters && this.ok(a.manifest.id, 'enrich'); })) return;
    $$('[data-card]:not([data-axq])', root).forEach((c) => this.wantBadges(c));
  },
  /* ---- the two questions: shown once per addon, in plain words, before it gets anything ---- */
  asking: false,
  pendingAsk() { return !this.safe && (engine.addons || []).some((x) => { if (!this.allowed(x) || x.virtual) return false; const e = this.manifest(x); const o = this.oks()[x.manifest.id] || {}; return e && ((e.enrich && o.enrich == null) || (e.library && o.library == null)); }); },
  ask() {
    if (this.asking || this.safe || document.body.classList.contains('intro-on') || document.body.classList.contains('locked') || document.body.classList.contains('layer-open') || !Store.get('toured', false)) return;
    const a = (engine.addons || []).find((x) => {
      if (!this.allowed(x) || x.virtual) return false; const e = this.manifest(x); const o = this.oks()[x.manifest.id] || {};
      return e && ((e.enrich && o.enrich == null) || (e.library && o.library == null));
    });
    if (!a) return;
    const e = this.manifest(a), o = this.oks()[a.manifest.id] || {}, what = e.enrich && o.enrich == null ? 'enrich' : 'library';
    const name = this.txt(a.manifest.name, 40) || 'This addon', host = this.host(a.baseUrl);
    this.asking = true;
    const el = X8.layer('axAsk', { label: 'Addon permission', icon: 'blocks', eyebrow: 'Addon looks' });
    const btns = `<div class="inrow ax-ask-b"><button class="btn btn-prime btn-sm" type="button" data-nav data-axyes><i data-lucide="check"></i>Allow</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-axno>Not now</button></div><p class="ax-ask-s">Change it any time in Settings › Appearance › Addon looks.</p>`;
    X8.body('axAsk').innerHTML = what === 'enrich'
      ? `<h2 class="x8-h">Let ${esc(name)} add to titles?</h2><p class="ax-ask-p">It can add ratings, badges and info to posters, film pages and episodes, drawn in your theme.</p><p class="ax-ask-p"><b>It will see</b> the ids of the titles you browse and open (for example tt0111161), sent to ${esc(host)}. Nothing else: not your account, keys, progress or lists.</p>${btns}`
      : `<h2 class="x8-h">Let ${esc(name)} keep a copy of your watchlist?</h2><p class="ax-ask-p">It can then show your watchlist in its own lists, in other apps too.</p><p class="ax-ask-p"><b>It will receive</b> the title, type and id of each film or series on your watchlist, now and when you change it, sent to ${esc(host)}. Not your account, keys, progress or watch history.</p>${btns}`;
    icons();
    const done = (yes) => {
      this.asking = false; this.setOk(a.manifest.id, what, yes); X8.close('axAsk');
      if (yes && what === 'library') this.push(a, 'replace', S.watchlist);
      if (yes && what === 'enrich') { this.badgeCache.clear(); $$('[data-axq]').forEach((c) => delete c.dataset.axq); this.watchCards(); if (D.meta && $('#detail .credits')) { this.detail.delete(`${D.meta.type}/${D.meta.id}`); renderDetail(false); } }
      setTimeout(() => this.ask(), 1200);
    };
    $('[data-axyes]', el).onclick = () => done(true); $('[data-axno]', el).onclick = () => done(false);
    X8.onClose.axAsk = () => { if (this.asking) { this.asking = false; this.setOk(a.manifest.id, what, false); } };
    X8.open('axAsk');
    if (IS_TV) setTimeout(() => { const f = $('[data-axyes]', el); if (f) Nav.focus(f, true); }, 60);
  },
  /* ---- watchlist copy: POST {base}/mkcinema/library, body { event: add | remove | replace, items: [{ id, type, name }] } ----
     sent as plain text so no CORS preflight is needed; the answer is not read */
  push(a, event, items) {
    const body = JSON.stringify({ event, items: (items || []).slice(0, 2000).map((m) => ({ id: m.id, type: m.type, name: String(m.name || '').slice(0, 120) })) });
    try { fetch(`${a.baseUrl}/mkcinema/library`, { method: 'POST', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body, keepalive: body.length < 60000 }).catch(() => {}); } catch (e) { /* offline */ }
  },
  pushers() { return (engine.addons || []).filter((a) => this.allowed(a) && !a.virtual && (this.manifest(a) || {}).library && this.ok(a.manifest.id, 'library')); },
  /* ---- Library tabs from addon catalogs: pinned by you, or offered by the addon (place: library) ---- */
  cache: new Map(), loading: new Set(), inLib: 0,
  ckey(c) { return `ax:${c.addon.manifest.id}/${c.type}/${c.id}`; },
  pins() { const l = Store.get(this.PINS, []); return Array.isArray(l) ? l.filter((x) => typeof x === 'string') : []; },
  pickable() { return engine.catalogs({ includeRequired: true }).filter((c) => c.type !== 'tv' && !c.required.length); },
  libCats() {
    const pins = this.pins(), all = this.pickable(), out = [];
    all.forEach((c) => { const k = this.ckey(c); if (pins.includes(k) || (this.catExt(c) || {}).place === 'library') out.push(c); });
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
  unpin(k) { Store.set(this.PINS, this.pins().filter((x) => x !== k)); const c = this.libCats().find((x) => this.ckey(x) === k); Library.st.tab = 'watchlist'; Library.render(); toast(c && (this.catExt(c) || {}).place === 'library' ? 'This addon keeps its list in Library. Turn off its looks in Settings › Appearance to remove it.' : 'Tab removed'); },
  picker(btn) {
    let pop = $('#axPick'); if (pop) { pop.remove(); return; }
    const pins = this.pins(), cats = this.pickable().filter((c) => !pins.includes(this.ckey(c))).slice(0, 60);
    pop = document.createElement('div'); pop.id = 'axPick'; pop.className = 'list-pop ax-pick';
    pop.innerHTML = cats.length ? `<p class="ax-pick-h">Show a list from your addons as a Library tab</p>${cats.map((c, i) => `<button type="button" data-nav data-axpick="${i}"><i data-lucide="${c.type === 'series' ? 'tv' : 'film'}"></i><span>${esc(c.name)}<small>${esc(c.addon.manifest.name)} · ${c.type === 'series' ? 'Series' : 'Films'}</small></span></button>`).join('')}` : '<p class="ax-pick-h">None of your addons has a list to add. Addons with catalogs show up here.</p>';
    (btn.closest('.lib-tabs') || btn).after(pop); icons();
    $$('[data-axpick]', pop).forEach((b) => b.addEventListener('click', () => { pop.remove(); this.pin(cats[Number(b.dataset.axpick)]); }));
    const f = $('[data-axpick]', pop); if (f && IS_TV) Nav.focus(f, true);
  },
  /* ---- the checker: what MKCinema took from an addon, and what it dropped and why (for addon makers) ---- */
  async check(a) {
    const el = X8.layer('axCheck', { label: 'Addon looks checker', icon: 'blocks', eyebrow: 'Addon looks checker', wide: true });
    const b = X8.body('axCheck'); b.innerHTML = `<h2 class="x8-h">${esc(a.manifest.name)}</h2><p class="ax-ask-p"><span class="spin"></span> Checking…</p>`; X8.open('axCheck');
    const lines = [], W = [];
    this.W = W;
    try {
      const x = this.manifest(a);
      if (!x) lines.push(['info', 'No mkcinema field in the manifest. Catalogs show as plain rows; posterShape and showInHome still apply.']);
      else {
        const n = Object.keys(x.catalogs).length;
        if (n) lines.push(['ok', `${n} catalog${n === 1 ? '' : 's'} with a style or place: ${Object.entries(x.catalogs).map(([k, v]) => `${k} → ${v.layout || 'poster'}, ${v.place || 'home'}`).join('; ')}`]);
        if (x.enrich) lines.push(['ok', `Adds to any title: ${x.enrich.types.join(', ')}, ids starting ${x.enrich.idPrefixes.join(', ')}${x.enrich.posters ? ', poster badges' : ''}${x.enrich.details ? ', film pages and episodes' : ''}`]);
        if (x.library) lines.push(['ok', 'Keeps a copy of the watchlist (after the viewer allows it)']);
      }
      const cat = (a.manifest.catalogs || []).find((c) => c && !StremioEngine.catalogExtras(c).some((e) => e.isRequired));
      let sample = cat ? null : 'tt0111161', stype = cat ? cat.type : 'movie';
      if (cat) {
        const r = await engine.call(a, 'catalog', cat.type, cat.id, {});
        const metas = (r && r.metas) || []; let looks = 0;
        metas.slice(0, 100).forEach((m) => { if (m && m.mkcinema) { const c = this.clean(m, a); if (c._mkx) looks++; } });
        lines.push(['ok', `Catalog "${cat.name || cat.id}": ${metas.length} titles, ${looks} with badges or panels that passed`]);
        sample = metas[0] && metas[0].id;
      }
      if (x && x.enrich && sample) {
        if (x.enrich.details) {
          try { const e = await engine.http(`${a.baseUrl}/mkcinema/meta/${encodeURIComponent(stype)}/${encodeURIComponent(sample)}.json`, { ttl: 0, timeout: 8000 }); const lx = e && this.look(e, a, `meta ${sample}`); lines.push(['ok', `Film page for ${sample}: ${lx ? `${lx.badges.length} badges, ${lx.panels.length} panels` : 'nothing usable'}${e && e.episodes ? `, episode badges for ${Object.keys(e.episodes).length} videos` : ''}`]); } catch (err) { lines.push(['bad', `Film page request failed: ${err.message}`]); }
        }
        if (x.enrich.posters) {
          try { const e = await engine.http(`${a.baseUrl}/mkcinema/badges/${encodeURIComponent(stype)}/${encodeURIComponent(sample)}.json`, { ttl: 0, timeout: 8000 }); const bb = this.badges(e && e.badges && e.badges[sample], `badges ${sample}`); lines.push(['ok', `Poster badges for ${sample}: ${bb.length}`]); } catch (err) { lines.push(['bad', `Poster badge request failed: ${err.message}`]); }
        }
      }
    } catch (err) { lines.push(['bad', err.message]); }
    finally { this.W = null; }
    b.innerHTML = `<h2 class="x8-h">${esc(a.manifest.name)}</h2>
      <ul class="ax-chk">${lines.map(([k, t]) => `<li class="${k}"><i data-lucide="${k === 'ok' ? 'check' : k === 'bad' ? 'x' : 'sparkles'}"></i><span>${esc(t)}</span></li>`).join('')}</ul>
      ${W.length ? `<h3 class="sec-title axp-t">Dropped or changed (${W.length})</h3><ul class="ax-chk warn">${[...new Set(W)].slice(0, 60).map((t) => `<li><span>${esc(t)}</span></li>`).join('')}</ul>` : '<p class="ax-ask-p">Nothing was dropped.</p>'}
      <p class="ax-ask-s">The spec is in docs/addon-looks.md on MKCinema's GitHub.</p>`;
    icons(); if (IS_TV) Nav.settle();
  },
  /* ---- Settings › Appearance › Addon looks ---- */
  setRows() {
    const list = [];
    (engine.addons || []).forEach((a) => { if (a && a.manifest && !a.virtual && (this.manifest(a) || this.seen.has(a.manifest.id))) list.push(a); });
    const rows = [{ group: 'Addon looks' }];
    if (!list.length) rows.push({ html: () => `<div class="set-row"><div><b>Addon looks</b><small>Addons can choose how their rows look, add badges to posters and episodes, and add info to film pages. None of your addons does this yet. ${this.safe ? 'Off for this start (#safe).' : ''}</small></div></div>` });
    list.forEach((a, i) => {
      const x = this.manifest(a) || {};
      rows.push({ key: `axui${i}`, label: a.manifest.name, help: 'Let this addon choose its row style and Library placement and add badges and info, always drawn in your theme.', type: 'toggle', get: () => !this.off().includes(a.manifest.id), set: (v) => this.setAllowed(a.manifest.id, v) });
      if (x.enrich) rows.push({ key: `axen${i}`, label: `${a.manifest.name}: add to all titles`, help: 'Ratings and info on posters, film pages and episodes from any catalog. The addon sees the ids of titles you browse.', type: 'toggle', get: () => this.ok(a.manifest.id, 'enrich'), set: (v) => { this.setOk(a.manifest.id, 'enrich', v); this.badgeCache.clear(); this.detail.clear(); $$('[data-axq]').forEach((c) => delete c.dataset.axq); if (v) this.watchCards(); } });
      if (x.library) rows.push({ key: `axlb${i}`, label: `${a.manifest.name}: copy of my watchlist`, help: 'Sends the title, type and id of each watchlist item to this addon, now and when you change it.', type: 'toggle', get: () => this.ok(a.manifest.id, 'library'), set: (v) => { this.setOk(a.manifest.id, 'library', v); if (v) this.push(a, 'replace', S.watchlist); } });
      rows.push({ key: `axck${i}`, label: `Check ${a.manifest.name}`, help: 'For addon makers: what MKCinema took from this addon, and what it dropped and why.', type: 'button', text: 'Check', icon: 'list-checks', run: () => this.check(a) });
    });
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
    // 3. episode badges wherever an episode list is drawn (film page, the phone episode sheet)
    const eh = episodesHTML;
    episodesHTML = function () { const h = eh.apply(this, arguments); if (!AddonUI.detail.size) return h; const box = document.createElement('div'); box.innerHTML = h; AddonUI.paintEpisodes(box); return box.innerHTML; };
    // 4. the film page: panels under the credits; enrichment addons asked once per title
    const rd = renderDetail;
    renderDetail = function () {
      const r = rd.apply(this, arguments);
      try {
        const m = D.meta; AddonUI.paintDetail();
        if (m && m.id && !AddonUI.detail.has(`${m.type}/${m.id}`) && AddonUI.enrichers(m.type, m.id).some((a) => AddonUI.ok(a.manifest.id, 'enrich'))) AddonUI.enrich(m).then((got) => { if (got.length && D.meta && D.meta.id === m.id) AddonUI.paintDetail(); }).catch(() => {});
      } catch (e) { console.warn('Addon panel skipped:', e.message); }
      return r;
    };
    // 5. Library: addon tabs behave like lists while the Library draws; they are never saved as lists
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
    // 6. watchlist changes go to the addons the viewer allowed to keep a copy
    const tw = toggleWatchlist;
    toggleWatchlist = function (m) {
      const had = inWatchlist(m.id); const r = tw.apply(this, arguments); const has = inWatchlist(m.id);
      if (had !== has) AddonUI.pushers().forEach((a) => AddonUI.push(a, has ? 'add' : 'remove', [m]));
      return r;
    };
    // 7. once the addons are in: ask the open questions, watch posters for enrichment
    // the question waits until nothing else is on screen; it checks every few seconds while one is still open
    let tries = 0;
    const later = () => { if (++tries > 120) return; if ((engine.addons || []).length) { if (tries === 1 || !this.cardObs) this.watchCards(); this.ask(); } if (this.pendingAsk() || !(engine.addons || []).length) setTimeout(later, 4000); };
    setTimeout(later, 4000);
    engine.on(() => { if (tries > 120) { tries = 0; } setTimeout(later, 1500); });
  },
};
AddonUI.init();
// Settings › Appearance gets the per-addon switches (added to the section, so search and the TV remote see them)
{
  const sec = typeof SECTIONS !== 'undefined' && SECTIONS.find((x) => x.id === 'appearance');
  if (sec && typeof sec.rows === 'function') { const base = sec.rows; sec.rows = function () { return [...base.apply(this, arguments), ...AddonUI.setRows()]; }; }
}
