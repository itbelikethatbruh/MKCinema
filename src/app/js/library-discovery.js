
'use strict';
/* 2.87 library and discovery */
(() => {
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('2.87c', e); } };
  if (typeof CFG_DEFAULTS === 'object') Object.assign(CFG_DEFAULTS, { cwOpens: 'play', homeWatched: 'show', hideUnreleased: false, epSort: 'aired', familyRow: true });
  ['cwOpens', 'homeWatched', 'hideUnreleased', 'epSort', 'familyRow'].forEach((k) => { if (!(k in CFG)) CFG[k] = CFG_DEFAULTS[k]; });

  /* ---- Continue watching: what a tap opens ---- */
  document.addEventListener('click', (e) => {
    if (CFG.cwOpens !== 'details') return;
    const card = e.target.closest && e.target.closest('[data-card][data-video]'); if (!card || e.target.closest('[data-quickplay],button,a')) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const m = S.metas.get(card.dataset.id) || { id: card.dataset.id, type: card.dataset.type, name: card.getAttribute('aria-label') };
    safe(() => openDetail(m, { videoId: card.dataset.video }));
  }, true);

  /* ---- watched films and titles not out yet, marked on their cards ---- */
  const relDate = (m) => { const r = m.released || m.release_date || m.first_air_date; const d = r ? new Date(r) : null; return d && !isNaN(d) ? d : null; };
  const unreleased = (m) => { const d = relDate(m); if (d) return d.getTime() > Date.now() + 864e5; const y = parseInt(String(m.releaseInfo || m.year || '').slice(0, 4), 10); return y > new Date().getFullYear(); };
  safe(() => {
    const ch = cardHTML;
    cardHTML = function (m, opts) {
      const h = ch.apply(this, arguments);
      if (!m || !m.id || (opts && opts.progress)) return h;
      const cls = [];
      if (CFG.homeWatched !== 'show' && m.type !== 'series' && isWatched(m.id)) cls.push('mk-seen');
      if (CFG.hideUnreleased && unreleased(m)) cls.push('mk-unrel');
      return cls.length ? h.replace(/^(\s*<div class="card)/, `$1 ${cls.join(' ')}`) : h;
    };
  });
  const applyHome = () => { const de = document.documentElement.classList; de.toggle('mk-hw-dim', CFG.homeWatched === 'dim'); de.toggle('mk-hw-hide', CFG.homeWatched === 'hide'); de.toggle('mk-unrel-hide', !!CFG.hideUnreleased); };
  CFG_HOOKS.push((k) => { if (k === 'homeWatched' || k === 'hideUnreleased') { applyHome(); if (typeof rerender === 'function') safe(() => rerender()); } if (k === 'familyRow') safe(() => Family.place()); });

  /* ---- episodes: search and sort on the series page ---- */
  const EpTools = {
    q: '',
    rating(v) { const r = parseFloat(v.rating || v.imdbRating || v.vote_average || 0); return isFinite(r) ? r : 0; },
    mount() {
      const eps = document.getElementById('dEps'); if (!eps || typeof D !== 'object' || !D.meta) return;
      const n = eps.querySelectorAll('.ep').length;
      let bar = document.getElementById('epTools');
      if (!bar) {
        eps.insertAdjacentHTML('beforebegin', `<div class="ep-tools" id="epTools"><input class="inp" type="search" id="epQ" data-nav placeholder="Search episodes" aria-label="Search episodes" spellcheck="false" autocomplete="off"><select class="sel" id="epSort" data-nav aria-label="Sort episodes">${[['aired', 'First to last'], ['newest', 'Newest first'], ['rating', 'Highest rated'], ['unwatched', 'Unwatched first']].map(([k, l]) => `<option value="${k}"${CFG.epSort === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`);
        bar = document.getElementById('epTools');
        const q = document.getElementById('epQ'); q.value = this.q;
        q.addEventListener('input', () => { this.q = q.value; this.apply(); });
        document.getElementById('epSort').addEventListener('change', (e) => { setCfg('epSort', e.target.value); this.apply(); });
      }
      bar.hidden = n < 4 && !this.q;
      this.apply();
    },
    apply() {
      const eps = document.getElementById('dEps'); if (!eps || !D.meta) return;
      const m = D.meta, by = new Map((m.videos || []).map((v) => [videoIdFor(m, v), v]));
      const items = [...eps.querySelectorAll('.ep[data-vid]')]; if (!items.length) return;
      const q = this.q.trim().toLowerCase();
      items.forEach((b) => { const v = by.get(b.dataset.vid) || {}; const txt = `${v.name || v.title || ''} ${v.overview || v.description || ''} e${v.episode} ${v.episode}`.toLowerCase(); b.hidden = !!q && !txt.includes(q); });
      const k = CFG.epSort || 'aired', key = (b) => by.get(b.dataset.vid) || {};
      const cmp = {
        aired: (a, b) => (key(a).episode || 0) - (key(b).episode || 0),
        newest: (a, b) => (key(b).episode || 0) - (key(a).episode || 0),
        rating: (a, b) => this.rating(key(b)) - this.rating(key(a)) || (key(a).episode || 0) - (key(b).episode || 0),
        unwatched: (a, b) => (isWatched(a.dataset.vid) - isWatched(b.dataset.vid)) || (key(a).episode || 0) - (key(b).episode || 0),
      }[k];
      const sorted = items.slice().sort(cmp);
      if (sorted.some((b, i) => b !== items[i])) sorted.forEach((b) => eps.appendChild(b));
    },
  };
  window.MkEpTools = EpTools;
  safe(() => {
    const rd = renderDetail;
    renderDetail = function () { const r = rd.apply(this, arguments); safe(() => EpTools.mount()); return r; };
    const op = openDetail;
    openDetail = function () { EpTools.q = ''; return op.apply(this, arguments); };
  });

  /* ---- Family night row on Home: popular films rated for everyone, no horror ---- */
  const Family = {
    tok: 0, memo: null,
    async list() {
      const key = typeof X8 === 'object' && X8.dayKey ? X8.dayKey() : new Date().toDateString();
      if (this.memo && this.memo.key === key) return this.memo.list;
      const j = await MetaBackup.relay('discover', { kind: 'movie', sort: 'pop', fam: '1', g: '10751', ng: '27', n: '20' });
      let list = ((j && j.results) || []).map((x) => Recs.fromTmdb(x)).filter((m) => m && m.id);
      if (typeof Seats !== 'undefined' && safe(() => Seats.kids()) && Seats.kidSafe) list = list.filter((m) => safe(() => Seats.kidSafe(m)) !== false);
      this.memo = { key, list }; return list;
    },
    place() {
      const old = document.getElementById('famRow');
      if (CFG.familyRow === false) { if (old) old.remove(); return; }
      const anchor = document.getElementById('holRow') || document.getElementById('chRow') || document.getElementById('netRow');
      if (!anchor || !anchor.isConnected) return;
      if (old && old.isConnected) { if (anchor.nextElementSibling !== old) anchor.after(old); return; }
      const tok = ++this.tok;
      this.list().then((list) => {
        if (tok !== this.tok || list.length < 6) return;
        const a = document.getElementById('holRow') || document.getElementById('chRow') || document.getElementById('netRow'); if (!a || !a.isConnected) return;
        const sec = rowShell('Family night', ''); sec.id = 'famRow';
        const prev = document.getElementById('famRow'); if (prev) prev.remove();
        a.after(sec); fillRail(sec, list.slice(0, 20).map((m) => cardHTML(m)).join(''));
        if (IS_TV && typeof Nav !== 'undefined') Nav.settle();
      }).catch(() => { /* the row simply stays away */ });
    },
  };
  window.MkFamily = Family;
  safe(() => {
    if (window.MkHoliday && MkHoliday.place) { const hp = MkHoliday.place.bind(MkHoliday); MkHoliday.place = function () { const r = hp(); setTimeout(() => safe(() => Family.place()), 400); return r; }; }
    else { const home = document.getElementById('view-home'); if (home && window.MutationObserver) { let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => safe(() => Family.place()), 800); }).observe(home, { childList: true }); } }
  });

  /* ---- settings rows ---- */
  safe(() => {
    const hm = typeof secById === 'function' && secById('home');
    if (hm) {
      const rows = hm.rows;
      hm.rows = () => [...rows(),
        { key: 'familyRow', label: 'Family night row', help: 'Popular films rated for the whole family, with no horror, on Home.', type: 'toggle', get: () => CFG.familyRow !== false },
        { key: 'cwOpens', label: 'Continue watching opens', help: 'What happens when you pick a title in Continue watching.', type: 'seg', options: [['play', 'Plays it'], ['details', 'Its page']] },
        { key: 'homeWatched', label: 'Films you have watched', help: 'How films you finished look in Home rows.', type: 'seg', options: [['show', 'Show'], ['dim', 'Dim'], ['hide', 'Hide']] },
        { key: 'hideUnreleased', label: 'Hide titles that are not out yet', help: 'Leaves announced films and series out of Home rows until they are released.', type: 'toggle' }];
    }
  });
  applyHome();
})();
