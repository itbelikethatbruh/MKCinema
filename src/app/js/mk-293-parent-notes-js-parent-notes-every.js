
'use strict';
/* 2.93 Parent notes. Every title page gets a short block under the synopsis: the age rating in the US, the UK and where
   you live, and what the rating boards that list reasons (Brazil, Germany, the Netherlands, Canada, South Africa,
   Turkey, Finland...) warn about, grouped into plain words: violence, scary scenes, sex, nudity, strong language,
   drugs or alcohol, self-harm, discrimination, mature themes. Nothing is guessed: no rating board reason, no warning.
   Data: TMDB, with the viewer's own key, else MKCinema's title-notes function (MKCinema's key; only the IMDb id is
   sent). Kept 14 days on this device (mkc:notesCache). Settings › Home › Parent notes turns it off. */
(function () {
  if (typeof renderDetail !== 'function') return;
  const FN = 'title-notes', TTL = 14 * 864e5, K = 'notesCache';
  const CAT = [
    ['violence', 'Violence', 'swords'], ['scary', 'Scary or upsetting scenes', 'ghost'], ['sex', 'Sex', 'heart'], ['nudity', 'Nudity', 'eye-off'],
    ['language', 'Strong language', 'message-square-warning'], ['drugs', 'Drugs or alcohol', 'wine'], ['selfharm', 'Self-harm', 'heart-crack'],
    ['discrimination', 'Discrimination', 'users'], ['crime', 'Crime', 'siren'], ['themes', 'Mature themes', 'info'],
  ];
  /* one board's reason -> our groups (single letters only where that country's board uses them) */
  const groups = (c, d) => {
    const x = String(d || '').trim(), l = x.toLowerCase(), out = new Set();
    if (/^[A-Z]{1,3}$/.test(x)) {
      const L = c === 'ZA' ? { V: 'violence', L: 'language', S: 'sex', N: 'nudity', D: 'drugs', H: 'scary' }
        : c === 'US' ? { V: 'violence', FV: 'violence', L: 'language', S: 'sex', D: 'sex' } : {};
      if (L[x]) out.add(L[x]); return out;
    }
    if (/violen|injur|brutal|gore/.test(l)) out.add('violence');
    if (/fear|threat|stress|anxiety|shock|disturb|frighten|scary/.test(l) || (/horror/.test(l) && !/violence\s*\/\s*horror/.test(l))) out.add('scary'); // Turkey's "Violence / Horror" is one violence box
    if (/sex/.test(l)) out.add('sex');
    if (/nud/.test(l)) out.add('nudity');
    if (/language|profan|swear/.test(l)) out.add('language');
    if (/drug|alcohol|smok|tobacco/.test(l)) out.add('drugs');
    if (/self-harm|self harm|suicid/.test(l)) out.add('selfharm');
    if (/discriminat/.test(l)) out.add('discrimination');
    if (/criminal|crime/.test(l)) out.add('crime');
    if (/mature|sensitive|not recommended|negative example|theme/.test(l)) out.add('themes');
    return out;
  };
  const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
  const MkNotes = window.MkNotes = {
    mem: new Map(),
    on() { return CFG.parentNotes !== false; },
    tt(m) { const t = String((m && (m.imdb_id || m.id)) || '').split(':')[0]; return /^tt\d{5,10}$/.test(t) ? t : ''; },
    cached(tt) {
      if (this.mem.has(tt)) return this.mem.get(tt);
      const c = Store.raw.get(K, {}), e = c && c[tt];
      return e && Date.now() - e.at < TTL ? e.v : undefined;
    },
    keep(tt, v) {
      this.mem.set(tt, v);
      const c = Store.raw.get(K, {}); c[tt] = { at: Date.now(), v };
      const ks = Object.keys(c); if (ks.length > 400) ks.sort((a, b) => c[a].at - c[b].at).slice(0, ks.length - 400).forEach((k) => delete c[k]);
      Store.raw.set(K, c);
    },
    trim(kind, d) {
      const out = [];
      for (const x of ((d && d.results) || []).slice(0, 120)) {
        const c = String(x.iso_3166_1 || ''); if (!/^[A-Z]{2}$/.test(c)) continue;
        let r = ''; const ds = new Set();
        if (kind === 'tv') { r = String(x.rating || '').trim(); (x.descriptors || []).forEach((y) => y && ds.add(String(y).trim())); }
        else for (const y of (x.release_dates || []).slice().sort((a, b) => (a.type === 3 ? 0 : 1) - (b.type === 3 ? 0 : 1))) { if (!r && y.certification) r = String(y.certification).trim(); (y.descriptors || []).forEach((z) => z && ds.add(String(z).trim())); }
        if (r || ds.size) out.push({ c, r, d: [...ds].slice(0, 12) });
      }
      return out;
    },
    async fetch(tt) {
      if (safe(() => TMDB.key(), '')) {
        try {
          const f = await TMDB.find(tt), mv = f && (f.movie_results || [])[0], tv = !mv && f && (f.tv_results || [])[0];
          if (!mv && !tv) return { kind: null, ratings: [] };
          const kind = mv ? 'movie' : 'tv', d = await TMDB.get(mv ? `movie/${mv.id}/release_dates` : `tv/${tv.id}/content_ratings`);
          if (d) return { kind, ratings: this.trim(kind, d) };
        } catch (e) { /* MKCinema's lookup below */ }
      }
      const c = (typeof Account !== 'undefined' && Account.config && Account.config()) || {};
      if (!c.url) return null;
      const r = await netFetch(`${String(c.url).replace(/\/+$/, '')}/functions/v1/${FN}?tt=${encodeURIComponent(tt)}`, { headers: { apikey: c.anonKey || '', accept: 'application/json' } }, 12000);
      if (!r.ok) return null;
      return r.json();
    },
    get(tt) {
      const v = this.cached(tt); if (v !== undefined) return Promise.resolve(v);
      if (!this.inflight) this.inflight = new Map();
      if (!this.inflight.has(tt)) this.inflight.set(tt, this.fetch(tt).then((x) => { if (x && Array.isArray(x.ratings)) this.keep(tt, x); return x; }).catch(() => null).finally(() => this.inflight.delete(tt)));
      return this.inflight.get(tt);
    },
    home() { const l = String(navigator.language || '').split('-')[1]; return /^[A-Za-z]{2}$/.test(l || '') ? l.toUpperCase() : ''; },
    land(c) { try { return new Intl.DisplayNames([(typeof I18N !== 'undefined' && I18N.code) || 'en'], { type: 'region' }).of(c) || c; } catch (e) { return c; } },
    html(v) {
      const rs = (v && v.ratings) || []; if (!rs.length) return '';
      const by = new Map(rs.map((x) => [x.c, x]));
      const want = [...new Set(['US', 'GB', this.home()].filter(Boolean))];
      const shown = want.map((c) => by.get(c)).filter((x) => x && x.r);
      const flags = new Set(), from = new Set();
      rs.forEach((x) => (x.d || []).forEach((d) => { const g = groups(x.c, d); if (g.size) { g.forEach((k) => flags.add(k)); from.add(x.c); } }));
      if (!shown.length && !flags.size) return '';
      const fl = CAT.filter(([k]) => flags.has(k));
      return `<div class="pn" id="mkNotes"><h3 class="sec-title"><i data-lucide="shield-check"></i>Parent notes</h3>
        ${shown.length ? `<div class="pn-row">${shown.map((x) => `<span class="pn-rt"><small>${esc(this.land(x.c))}</small><b translate="no">${esc(x.r)}</b></span>`).join('')}</div>` : ''}
        ${fl.length ? `<div class="pn-row">${fl.map(([, l, ic]) => `<span class="pn-fl"><i data-lucide="${ic}"></i>${esc(l)}</span>`).join('')}</div>` : '<p class="pn-none">No rating board lists content warnings for this title.</p>'}
        <p class="pn-src">${from.size ? `Only what the age rating boards in ${esc([...from].slice(0, 5).map((c) => this.land(c)).join(', '))} list. Ratings: TMDB.` : 'Ratings: TMDB.'}</p></div>`;
    },
    place(m) {
      const panel = document.getElementById('detailPanel'); if (!panel || !m) return;
      const old = panel.querySelector('#mkNotes'); if (old) old.remove();
      if (!this.on()) return;
      const tt = this.tt(m); if (!tt) return;
      const put = (v) => {
        if (!v || typeof D !== 'object' || D.meta !== m) return;
        const h = this.html(v); if (!h || panel.querySelector('#mkNotes')) return;
        const at = panel.querySelector('.d-body .credits') || panel.querySelector('.d-body .d-desc'); if (!at) return;
        at.insertAdjacentHTML('afterend', h); icons();
      };
      const v = this.cached(tt);
      if (v !== undefined) put(v); else this.get(tt).then(put);
    },
  };
  const rd = renderDetail;
  renderDetail = function () { const r = rd.apply(this, arguments); safe(() => MkNotes.place(D.meta)); return r; };
  /* Settings › Home: one switch */
  const sec = typeof secById === 'function' && secById('home');
  if (sec) { const rows = sec.rows; sec.rows = () => [...rows(), { key: 'parentNotes', label: 'Parent notes on title pages', help: 'Age ratings and the content warnings rating boards give, like violence, scary scenes or strong language. From TMDB; only the title is looked up.', type: 'toggle', get: () => CFG.parentNotes !== false }]; }
})();
