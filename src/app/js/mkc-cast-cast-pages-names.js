
/* ---------------- Cast pages ----------------
   Names under a film or show (Director, Writers, Cast) are buttons. Each opens a full-screen page for that person: photo,
   life story and full filmography, from TMDB. A viewer who saved their own TMDB key in Settings asks TMDB directly; everyone
   else asks MKCinema's tmdb-person function on Supabase, which holds MKCinema's own key and only answers a few fixed lookups.
   Picking a title opens its page, and Back walks the trail: title, person, the title you started from. */
const People = {
  FN: 'tmdb-person',
  IMG: 'https://image.tmdb.org/t/p/',
  cache: new Map(), castCache: new Map(), idsCache: new Map(),
  trail: [], cur: null, dept: 'Acting', kind: 'all', limit: 60, job: 0,
  lang() {
    let l = (typeof CFG !== 'undefined' && CFG.uiLang && CFG.uiLang !== 'auto') ? CFG.uiLang : (navigator.language || 'en');
    l = String(l).replace('_', '-'); const m = l.match(/^([a-z]{2})(?:-([a-z]{2}))?/i); if (!m) return 'en-US';
    return m[2] ? `${m[1].toLowerCase()}-${m[2].toUpperCase()}` : m[1].toLowerCase();
  },
  norm: (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
  ownKey: () => { try { return String(Keys.get().tmdb || '').trim(); } catch (e) { return ''; } },
  /* ---- data: the viewer's own key first, then MKCinema's function ---- */
  async relay(a, params) {
    const c = (typeof Account !== 'undefined' && Account.config && Account.config()) || {};
    if (!c.url) throw new Error('Cast pages need an internet connection');
    const q = new URLSearchParams({ a, ...params, lang: this.lang() });
    const r = await netFetch(`${String(c.url).replace(/\/+$/, '')}/functions/v1/${this.FN}?${q}`, { headers: { apikey: c.anonKey || '', accept: 'application/json' } }, 15000);
    if (r.status === 404) return null;
    if (r.status === 503) throw new Error('Cast pages are not available right now');
    if (r.status === 429) throw new Error('Too many lookups. Try again in a minute');
    if (!r.ok) throw new Error(`Lookup failed (${r.status})`);
    return r.json();
  },
  async direct(a, p) {
    const lang = this.lang();
    if (a === 'search') { const j = await TMDB.get('search/person', { query: p.q, include_adult: 'false', language: lang }); return j && { results: (j.results || []).filter((x) => !x.adult) }; }
    if (a === 'ids') return TMDB.get(`${p.kind}/${p.id}/external_ids`);
    if (a === 'person') {
      const j = await TMDB.get(`person/${p.id}`, { append_to_response: 'combined_credits,external_ids', language: lang }); if (!j) return null;
      if (!j.biography && !/^en/.test(lang)) { const en = await TMDB.get(`person/${p.id}`, { language: 'en-US' }).catch(() => null); if (en) j.biography = en.biography; }
      const cc = j.combined_credits || {};
      return { ...j, imdb_id: (j.external_ids || {}).imdb_id || j.imdb_id || '', cast: (cc.cast || []).filter((c) => !c.adult), crew: (cc.crew || []).filter((c) => !c.adult) };
    }
    if (a === 'cast') {
      let kind = 'movie', id = 0;
      const f = await TMDB.find(p.tt); const hit = f && ((f.movie_results || [])[0] ? ['movie', f.movie_results[0]] : (f.tv_results || [])[0] ? ['tv', f.tv_results[0]] : null);
      if (!hit) return { people: [] }; [kind, { id }] = [hit[0], hit[1]];
      const c = await TMDB.get(kind === 'tv' ? `tv/${id}/aggregate_credits` : `movie/${id}/credits`, { language: lang });
      return { people: [...((c && c.cast) || []).map((x) => ({ id: x.id, name: x.name, character: x.character || (x.roles && x.roles[0] && x.roles[0].character) })), ...((c && c.crew) || []).map((x) => ({ id: x.id, name: x.name, department: x.department, job: x.job || (x.jobs && x.jobs[0] && x.jobs[0].job) }))] };
    }
    return null;
  },
  async api(a, p) {
    if (this.ownKey()) { try { const r = await this.direct(a, p); if (r) return r; } catch (e) { /* MKCinema's lookup below */ } }
    return this.relay(a, p);
  },
  /* ---- who is this name? the title's own credit list when it has an IMDb id, else a name search ---- */
  async resolve(name, role) {
    const m = D.meta || {}, tt = String(m.imdb_id || m.id || '').split(':')[0], n = this.norm(name);
    if (/^tt\d{5,10}$/.test(tt)) {
      try {
        if (!this.castCache.has(tt)) this.castCache.set(tt, this.api('cast', { tt }).catch(() => null));
        const list = ((await this.castCache.get(tt)) || {}).people || [];
        const hit = list.find((x) => this.norm(x.name) === n && (role === 'cast' ? x.character !== undefined : x.department || x.job)) || list.find((x) => this.norm(x.name) === n);
        if (hit && hit.id) return hit.id;
      } catch (e) { /* search by name below */ }
    }
    const j = await this.api('search', { q: name }); const res = (j && j.results) || [];
    const want = role === 'cast' ? 'Acting' : role === 'Director' ? 'Directing' : 'Writing';
    const exact = res.filter((x) => this.norm(x.name) === n);
    const pick = exact.find((x) => x.known_for_department === want) || exact[0] || res[0];
    return pick ? pick.id : 0;
  },
  /* ---- the page ---- */
  layer() {
    const el = X8.layer('personLayer', { label: 'Person', full: true });
    X8.onClose.personLayer = () => { if (!this.leaving) { this.job++; } };
    return el;
  },
  async open(name, role) {
    this.layer(); const job = ++this.job;
    this.cur = { name, role, data: null }; this.dept = role === 'cast' ? 'Acting' : role === 'Director' ? 'Directing' : 'Writing'; this.kind = 'all'; this.limit = 60;
    this.paint(); X8.open('personLayer');
    try {
      const id = await this.resolve(name, role); if (job !== this.job) return;
      if (!id) { this.fail(`We couldn’t find ${name} on TMDB.`); return; }
      await this.load(id, job);
    } catch (e) { if (job === this.job) this.fail(e.message || 'Lookup failed'); }
  },
  async load(id, job) {
    if (!this.cache.has(id)) { const p = this.api('person', { id: String(id) }); this.cache.set(id, p); p.catch(() => this.cache.delete(id)); if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value); }
    const d = await this.cache.get(id); if (job !== this.job) return;
    if (!d) { this.fail('This person’s page is missing on TMDB.'); return; }
    this.cur.data = this.shape(d);
    if (this.cur.data.groups[this.dept] == null) this.dept = this.cur.data.depts[0] || 'Acting';
    this.paint();
  },
  /* group credits by department; one row per title (several characters or jobs are joined) */
  shape(d) {
    const talk = (c) => (c.genre_ids || []).some((g) => g === 10767 || g === 10763) || /^(self|himself|herself|themselves|narrator \(voice\)$)/i.test(c.character || '');
    const groups = {};
    const add = (dep, c, what) => {
      const key = `${c.media_type}/${c.id}`, g = groups[dep] = groups[dep] || new Map(), old = g.get(key);
      if (old) { if (what && !old.what.includes(what)) old.what.push(what); old.eps = Math.max(old.eps, c.episode_count || 0); return; }
      g.set(key, { id: c.id, kind: c.media_type === 'tv' ? 'tv' : 'movie', title: c.title || c.name || '', date: c.date || c.release_date || c.first_air_date || '', poster: c.poster_path || '', backdrop: c.backdrop_path || '', votes: c.vote_count || 0, score: c.vote_average || 0, pop: c.popularity || 0, eps: c.episode_count || 0, what: what ? [what] : [] });
    };
    (d.cast || []).forEach((c) => add(talk(c) ? 'Appearances' : 'Acting', c, c.character || ''));
    (d.crew || []).forEach((c) => add(c.department || 'Crew', c, c.job || ''));
    const order = ['Acting', 'Directing', 'Writing', 'Production', 'Creator', 'Sound', 'Camera', 'Editing', 'Art', 'Visual Effects', 'Costume & Make-Up', 'Crew', 'Lighting', 'Appearances'];
    const out = {}; Object.keys(groups).forEach((k) => { out[k] = [...groups[k].values()].filter((x) => x.title); });
    const depts = Object.keys(out).filter((k) => out[k].length).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    // the department they are known for goes first
    const known = d.known_for_department; if (known && depts.includes(known)) depts.splice(depts.indexOf(known), 1), depts.unshift(known);
    return { ...d, groups: out, depts };
  },
  img(path, size) { return path ? `${this.IMG}${size}${path}` : ''; },
  year: (date) => (/^\d{4}/.test(date || '') ? date.slice(0, 4) : ''),
  age(b, dd) { const a = new Date(b), z = dd ? new Date(dd) : new Date(); if (isNaN(a) || isNaN(z)) return 0; let y = z.getFullYear() - a.getFullYear(); if (z.getMonth() < a.getMonth() || (z.getMonth() === a.getMonth() && z.getDate() < a.getDate())) y--; return y; },
  ini: (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase(),
  roleText(c) {
    const w = c.what.filter(Boolean).slice(0, 3).join(' · ');
    const ep = c.kind === 'tv' && c.eps ? `${c.eps} ${c.eps === 1 ? 'episode' : 'episodes'}` : '';
    return [w && this.dept === 'Acting' ? `as ${w}` : w, ep].filter(Boolean).join(' · ');
  },
  paint() {
    const box = X8.body('personLayer'); if (!box) return;
    const cur = this.cur || {}, d = cur.data, keepY = box.querySelector('.cp-scroll') ? box.querySelector('.cp-scroll').scrollTop : 0;
    const top = `<div class="cp-top"><button class="btn btn-ghost btn-sm" type="button" data-cpx data-nav><i data-lucide="chevron-left"></i>Back</button><button class="ibtn" type="button" data-cpx data-nav aria-label="Close"><i data-lucide="x"></i></button></div>`;
    if (!d) {
      box.innerHTML = `${top}<div class="cp-scroll"><div class="cp-in"><div class="cp-hero"><div class="cp-ph" data-ini="${esc(this.ini(cur.name))}"></div><div class="cp-id"><h1 translate="no">${esc(cur.name || '')}</h1>${cur.err ? `<p class="cp-msg">${esc(cur.err)}</p><div class="cp-acts"><button class="btn btn-ghost btn-sm" type="button" data-cpretry data-nav>Try again</button></div>` : '<div class="status-line"><span class="spin"></span>Loading filmography…</div><div class="cp-sk"></div><div class="cp-sk" style="max-width:48ch"></div><div class="cp-sk" style="max-width:54ch"></div>'}</div></div></div></div>`;
      this.bind(box); return;
    }
    const born = d.birthday ? fmtDate(d.birthday) : '', age = d.birthday ? this.age(d.birthday, d.deathday) : 0;
    const facts = [
      born ? `<span><i data-lucide="calendar"></i>Born ${esc(born)}${!d.deathday && age ? ` (age ${age})` : ''}</span>` : '',
      d.deathday ? `<span>Died ${esc(fmtDate(d.deathday))}${age ? ` (aged ${age})` : ''}</span>` : '',
      d.place_of_birth ? `<span translate="no">${esc(d.place_of_birth)}</span>` : '',
    ].filter(Boolean).join('');
    const dept = d.groups[this.dept] ? this.dept : d.depts[0];
    const all = (d.groups[dept] || []).slice();
    // known for: their best-known work in the department they are known for
    const kf = (d.groups[d.depts[0]] || []).filter((c) => c.poster).sort((a, b) => b.votes - a.votes).slice(0, 10);
    const list = all.filter((c) => this.kind === 'all' || c.kind === this.kind);
    const nowY = new Date().toISOString().slice(0, 10);
    list.sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999'));
    const shown = list.slice(0, this.limit); let lastY = null;
    const rows = shown.map((c) => {
      const y = !c.date || c.date > nowY ? 'Upcoming' : this.year(c.date);
      const head = y !== lastY ? `<div class="cp-yr">${esc(y)}</div>` : ''; lastY = y;
      return `${head}<button class="cp-r" type="button" data-nav data-cpk="${c.kind}" data-cpi="${c.id}"><div class="cp-po">${imgTag(this.img(c.poster, 'w154'), c.title, `${c.kind}${c.id}`)}</div><span><b translate="no">${esc(c.title)}</b>${this.roleText(c) ? `<small translate="no">${esc(this.roleText(c))}</small>` : ''}</span><div class="tag-s">${c.kind === 'tv' ? 'Series' : 'Film'}</div></button>`;
    }).join('');
    const kinds = ['movie', 'tv'].filter((k) => all.some((c) => c.kind === k));
    const chip = (attr, val, on, label, n) => `<button class="chip ${on ? 'on' : ''}" type="button" data-nav ${attr}="${esc(val)}">${esc(label)}${n != null ? ` <span class="tag-s">${n}</span>` : ''}</button>`;
    const bio = String(d.biography || '').trim();
    const imdb = /^nm\d+$/.test(d.imdb_id || '') ? `<a class="btn btn-ghost btn-sm" data-nav href="https://www.imdb.com/name/${esc(d.imdb_id)}/" target="_blank" rel="noopener"><i data-lucide="external-link"></i>IMDb</a>` : '';
    const tmdbA = `<a class="btn btn-ghost btn-sm" data-nav href="https://www.themoviedb.org/person/${encodeURIComponent(d.id)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>TMDB</a>`;
    box.innerHTML = `${top}<div class="cp-scroll"><div class="cp-in">
      <div class="cp-hero">
        <div class="cp-ph" data-ini="${esc(this.ini(d.name))}">${d.profile_path ? `<img src="${esc(this.img(d.profile_path, 'h632'))}" alt="${esc(d.name)}" decoding="async" data-fadein data-gone>` : ''}</div>
        <div class="cp-id">
          ${d.known_for_department ? `<span class="eyebrow">${esc({ Acting: 'Actor', Directing: 'Director', Writing: 'Writer', Production: 'Producer' }[d.known_for_department] || d.known_for_department)}</span>` : ''}
          <h1 translate="no">${esc(d.name)}</h1>
          ${facts ? `<p class="cp-facts">${facts}</p>` : ''}
          ${bio ? `<p class="cp-bio clip" id="cpBio" translate="no">${esc(bio)}</p>` : ''}
          <div class="cp-acts">${bio && bio.length > 420 ? '<button class="btn btn-ghost btn-sm" type="button" data-nav id="cpMore">Read more</button>' : ''}${imdb}${tmdbA}</div>
        </div>
      </div>
      ${kf.length > 3 ? `<section class="cp-sec"><h3>Known for</h3><div class="cp-rail">${kf.map((c) => `<button class="cp-k" type="button" data-nav data-cpk="${c.kind}" data-cpi="${c.id}"><div class="cp-po">${imgTag(this.img(c.poster, 'w342'), c.title, `${c.kind}${c.id}`)}</div><b translate="no">${esc(c.title)}</b><small>${esc(this.year(c.date) || 'Upcoming')}</small></button>`).join('')}</div></section>` : ''}
      <section class="cp-sec"><h3>Filmography</h3>
        <div class="cp-filt">${d.depts.length > 1 ? d.depts.map((k) => chip('data-cpd', k, k === dept, k === 'Acting' ? 'Acting' : k, d.groups[k].length)).join('') + (kinds.length > 1 ? '<i class="sep"></i>' : '') : ''}${kinds.length > 1 ? [['all', 'All'], ['movie', 'Films'], ['tv', 'Series']].map(([k, l]) => chip('data-cpt', k, this.kind === k, l)).join('') : ''}</div>
        <div class="cp-list">${rows || '<p class="cp-msg">Nothing here yet.</p>'}</div>
        ${list.length > shown.length ? `<button class="btn btn-ghost btn-sm cp-more" type="button" data-nav id="cpAll">Show all ${list.length}</button>` : ''}
      </section>
      <p class="cp-credit">Photos, biography and filmography from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div></div>`;
    const sc = box.querySelector('.cp-scroll'); if (sc && keepY) sc.scrollTop = keepY;
    this.bind(box);
  },
  bind(box) {
    icons();
    $$('[data-cpx]', box).forEach((b) => { b.onclick = () => X8.close('personLayer'); });
    const rt = box.querySelector('[data-cpretry]'); if (rt) rt.onclick = () => { const c = this.cur; if (c) this.open(c.name, c.role); };
    const more = $('#cpMore'); if (more) more.onclick = () => { const b = $('#cpBio'); if (b) b.classList.toggle('clip'); more.textContent = b && b.classList.contains('clip') ? 'Read more' : 'Show less'; };
    const all = $('#cpAll'); if (all) all.onclick = () => { this.limit = 100000; this.paint(); };
    $$('[data-cpd]', box).forEach((b) => { b.onclick = () => { this.dept = b.dataset.cpd; this.kind = 'all'; this.limit = 60; this.paint(); }; });
    $$('[data-cpt]', box).forEach((b) => { b.onclick = () => { this.kind = b.dataset.cpt; this.limit = 60; this.paint(); }; });
    $$('[data-cpi]', box).forEach((b) => { b.onclick = () => this.pick(b); });
    if (IS_TV && typeof Nav !== 'undefined') Nav.settle();
  },
  fail(msg) { if (!this.cur) return; this.cur.err = msg; this.paint(); },
  /* ---- a title from the filmography: find it in the viewer's catalogs by its IMDb id, else by name and year ---- */
  async pick(btn) {
    const d = this.cur && this.cur.data; if (!d) return;
    const kind = btn.dataset.cpk, id = Number(btn.dataset.cpi);
    const c = Object.values(d.groups).flat().find((x) => x.kind === kind && x.id === id); if (!c) return;
    btn.classList.add('busy');
    try {
      const key = `${kind}/${id}`;
      if (!this.idsCache.has(key)) this.idsCache.set(key, this.api('ids', { kind, id: String(id) }).then((j) => (j && j.imdb_id) || '').catch(() => ''));
      const tt = await this.idsCache.get(key), type = kind === 'tv' ? 'series' : 'movie';
      let seed = /^tt\d+$/.test(tt) ? { ...(S.metas.get(tt) || {}), id: tt, type, name: c.title } : null;
      if (!seed) {
        const y = this.year(c.date), want = this.norm(c.title); let found = null;
        const res = await engine.search(c.title).catch(() => []);
        res.forEach(({ metas }) => (metas || []).forEach((m) => { if (!found && m.type === type && this.norm(m.name) === want && (!y || String(m.releaseInfo || m.year || '').includes(y))) found = m; }));
        seed = found;
      }
      if (!seed) { toast(`${c.title} isn’t in your catalogs yet`, 'info'); return; }
      if (!seed.poster && c.poster) seed.poster = this.img(c.poster, 'w342');
      if (!seed.background && c.backdrop) seed.background = this.img(c.backdrop, 'w1280');
      if (!seed.releaseInfo && this.year(c.date)) seed.releaseInfo = this.year(c.date);
      const sc = X8.body('personLayer').querySelector('.cp-scroll');
      this.trail.push({ prev: !$('#detail').hidden && D.meta ? D.meta : null, cur: this.cur, dept: this.dept, kind: this.kind, limit: this.limit, y: sc ? sc.scrollTop : 0, titleId: seed.id });
      if (this.trail.length > 12) this.trail.shift();
      this.leaving = true; try { X8.close('personLayer'); } finally { this.leaving = false; }
      openDetail(remember(seed));
    } finally { btn.classList.remove('busy'); }
  },
  /* Back on a title opened from a person page: the person page again, over the title it was opened from */
  canReturn() {
    const t = this.trail[this.trail.length - 1]; if (!t || $('#detail').hidden || !D.meta || D.meta.id !== t.titleId) return false;
    return [...MENU_LAYERS, 'player'].filter((x) => x !== 'detail').every((x) => { const el = document.getElementById(x); return !el || el.hidden; });
  },
  restore() {
    const t = this.trail.pop(); this.restoring = true;
    try { if (t.prev) openDetail(t.prev); else closeLayer('detail'); } finally { this.restoring = false; }
    Object.assign(this, { cur: t.cur, dept: t.dept, kind: t.kind, limit: t.limit }); this.job++;
    this.layer(); this.paint(); X8.open('personLayer');
    const sc = X8.body('personLayer').querySelector('.cp-scroll'); if (sc) sc.scrollTop = t.y || 0;
  },
  /* ---- the film page: the names become buttons ---- */
  ROWS: { Director: ['director', 'Directors', 3, 'Director'], Writers: ['writer', 'Writers', 3, 'Writer'], Cast: ['cast', 'Cast', 8, 'cast'] },
  wire() {
    const m = D.meta, panel = document.getElementById('detailPanel'); if (!m || !panel) return;
    $$('.credits > b', panel).forEach((b) => {
      const label = (window.i18nEn ? i18nEn(b) : b.textContent).trim(), row = this.ROWS[label], span = b.nextElementSibling;
      if (!row || !span || span.tagName !== 'SPAN' || span.dataset.cp) return;
      const [field, cat, n, role] = row;
      const raw = m[field] || (m.links || []).filter((l) => l.category === cat).map((l) => l.name);
      const names = (Array.isArray(raw) ? raw : []).map((x) => (typeof x === 'string' ? x : x && x.name)).filter(Boolean).slice(0, n);
      if (!names.length) return;
      span.dataset.cp = '1'; span.setAttribute('translate', 'no');
      span.innerHTML = names.map((x) => `<button class="cp-n" type="button" data-nav data-cpn="${esc(x)}" data-cpr="${role}">${esc(x)}</button>`).join(', ');
      $$('[data-cpn]', span).forEach((x) => { x.onclick = () => this.open(x.dataset.cpn, x.dataset.cpr); });
    });
  },
  init() {
    const rd = renderDetail;
    renderDetail = function () { const r = rd.apply(this, arguments); try { People.wire(); } catch (e) { /* names stay plain text */ } return r; };
    const pb = back;
    back = function () { if (People.canReturn()) { People.restore(); return; } return pb.apply(this, arguments); };
    const cl = closeLayer;
    closeLayer = function (id) { if (id === 'detail' && !People.restoring) People.trail = []; return cl.apply(this, arguments); };
  },
};
People.init();
