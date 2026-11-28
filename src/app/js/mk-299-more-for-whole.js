'use strict';
/* 2.99 more for the whole house */
/* ---------------- 2.99 Sources: release tiers, plain source names, a length check, the Ready line, your pick stays ----------------
   1) RelTier: well-known release groups are ranked in quality tiers (remux, Blu-ray, UHD and web lists, plus groups known
      for poor copies). A tier moves a copy up or down a little inside its resolution, never past a better resolution.
      Rows show the group with a gold mark (tiers 1 and 2) or a warning (poor copies).
   2) Hide source names (Settings › Streams & addons): rows show quality, size and language, never an addon or service.
   3) LenCheck: a film whose file is more than 10% (and less than 4x) longer or shorter than its listed runtime pauses at the start and asks
      (Play it anyway / Pick another source). Once per copy. MKCinema player only.
   4) Ready line on a title page: the best copy's resolution, HDR and sound once the sources are in.
   5) Keep my pick (Settings › Playback, on): a source you pick by hand is not swapped for another when it is slow or
      fails; it says so, and Sources has the others. Automatic picks still move on as before. */
const RelTier = {
  L: {
    1: '3L BiZKiT BLURANiUM BMF CiNEPHiLES FraMeSToR PmP WiLDCAT ZQ CtrlHD MainFrame DON W4NK3R BBQ c0kE Chotab CRiSC D-Z0N3 Z0N3 Dariush EbP EDPH Geek LolHD TayTO TDD TnP VietHD ABBIE AJP69 APEX PAXA PEXA XEPA BLUTONiUM CMRG CRFW CRUD FLUX GNOME KiNGS Kitsune NOSiVID NTG SiC',
    2: 'ATELiER NCmt playBD SiCFoI SURFINBIRD TEPES HQMUX EA HiDt HiSD iFT NTb QOQ SA89 sbR dB Flights MiU monkee MZABI PHOENiX playWEB SMURF TOMMY XEBEC 4KBEC CEBEX',
    3: '12GaugeShotgun decibeL EPSiLON HiFi KRaLiMaRKo PTer TRiToN BHDStudio hallowed HONE SPHD WEBDV LoRD playHD BYNDR GNOMiSSiON NINJACENTRAL ROCCaT SiGMA SLiGNOME SwAgLaNdEr',
    9: 'aXXo BRiNK CDDHD CrEwSaDe d3g DNL FaNGDiNG0 FGT FRDS GalaxyRG GalaxyTV iPlanet iVy KiNGDOM LAMA MeGusta mHD MOMOWEB MySiLU NhaNc3 nHD nikt0 NOIVTC PSA RDN STUTTERSHIT SWTYBLZ TBS TEKNO3D TIKO WAF x0r YIFY YTS Tigole QxR UTR Pahe ION10 EVO HDHub4u TGx',
  },
  BONUS: { 1: 45, 2: 30, 3: 15, 9: -150 },
  map: null,
  m() {
    if (this.map) return this.map;
    this.map = new Map();
    for (const t of [9, 3, 2, 1]) this.L[t].split(' ').forEach((g) => this.map.set(g.toLowerCase(), { t: Number(t), g }));
    return this.map;
  },
  /* the group is the last "-NAME" of a release name, or the [Name] in front of an anime release */
  group(s) {
    const bh = (s && s.behaviorHints) || {};
    const cands = [bh.filename, ...String((s && (s.title || s.description)) || '').split('\n').slice(0, 2)].filter(Boolean);
    for (let c of cands) {
      c = String(c).trim().replace(/\.(mkv|mp4|m4v|avi|ts|m2ts|webm)$/i, '');
      const a = /^\[([A-Za-z0-9 ._-]{2,24})\]/.exec(c); if (a) return a[1].trim();
      const tok = c.split(/\s+/).filter((w) => /-/.test(w)).pop() || c;
      const m = /-([A-Za-z0-9][A-Za-z0-9_]{1,15})(?:\[[^\]]*\])?$/.exec(tok.replace(/[)\]]+$/, ''));
      if (m && !/^(dl|rip|hd|ma|x|audio|ddp|dts|web|sub|subs|eng|multi)$/i.test(m[1])) return m[1];
    }
    return '';
  },
  of(s) {
    if (CFG.relTiers === false) return null;
    const g = this.group(s); if (!g) return null;
    const hit = this.m().get(g.toLowerCase());
    return hit ? { t: hit.t, g: hit.g, bonus: this.BONUS[hit.t] || 0 } : null;
  },
  badge(tel) {
    if (!tel || !tel.tier) return '';
    if (tel.tier === 9) return `<span class="tb chk" title="This group is known for poor copies"><i data-lucide="alert-triangle"></i>${esc(tel.group)}</span>`;
    return `<span class="tb grp t${tel.tier}" title="Release group, quality tier ${tel.tier}"><i data-lucide="award"></i>${esc(tel.group)}</span>`;
  },
};
window.MkRelTier = RelTier;

const LenCheck = {
  asked: new WeakSet(),
  mins(m) {
    if (typeof runtimeMin === 'function') { const v = runtimeMin(m); if (v) return v; }
    const r = m && m.runtime; if (r == null) return 0;
    if (typeof r === 'number') return r;
    const t = String(r), h = /(\d+)\s*h(?:\D+(\d+))?/i.exec(t); if (h) return Number(h[1]) * 60 + Number(h[2] || 0);
    const n = /(\d+)/.exec(t); return n ? Number(n[1]) : 0;
  },
  check() {
    try {
      const ctx = P.ctx, s = P.stream;
      if (CFG.lenCheck === false || !ctx || !s || ctx.video || !ctx.meta || ctx.meta.type !== 'movie' || ctx.meta._iptv || s._local || s.ytId || this.asked.has(s)) return;
      if (s._tel && (s._tel.isTrailer || s._tel.notice)) return;
      const want = this.mins(ctx.meta) * 60, d = video.duration;
      if (!(want >= 40 * 60) || !isFinite(d) || d < 150) return;   // shorter clips are placeholder notices (skipStub)
      if (d < want * 0.25 || d > want * 3) return;   // a sample, trailer or stitched file, not another cut: other checks handle those
      const diff = (d - want) / want; this.asked.add(s);
      if (Math.abs(diff) <= 0.10) return;
      const was = !video.paused; video.pause();
      const stop = () => { if (P.stream === s) video.pause(); }; video.addEventListener('play', stop);
      const pct = Math.round(Math.abs(diff) * 100), longer = diff > 0;
      Gate.ask({ icon: 'ruler', eyebrow: 'Length check', title: longer ? `This copy is ${pct}% longer than the film` : `This copy is ${pct}% shorter than the film`,
        html: `${esc(ctx.meta.name || '')} runs ${fmtTime(want)}. This copy runs ${fmtTime(d)}. It may be another cut, another film or a broken file.`, yes: 'Play it anyway', no: 'Pick another source', timeout: 45000 }).then((ok) => {
        video.removeEventListener('play', stop);
        if (P.stream !== s) return;
        if (ok === false) { openDrawer('src'); return; }
        if (was || ok) video.play().catch(() => {});
      });
    } catch (e) { /* the film plays */ }
  },
};

const ReadyLine = {
  html(best) {
    const t = best && best._tel; if (!t) return '';
    const bits = [t.res === '4K UHD' ? '4K' : t.res, t.hdr, t.audio && t.audio.join(' ')].filter(Boolean);
    return bits.length ? `<i data-lucide="circle-check"></i><b>Ready</b><span>${bits.map(esc).join(' · ')}</span>` : '';
  },
  paint(best) {
    const el = $('#dReady'); if (!el) return;
    const h = CFG.readyLine === false ? '' : this.html(best);
    if (el.dataset.h === h) return;
    // 2.99: the line keeps its room from the first frame, so nothing above it moves when the sources come in
    el.dataset.h = h; el.innerHTML = h; el.classList.toggle('on', !!h); if (CFG.readyLine === false) el.hidden = true; if (h) icons();
  },
};

const KeepPick = {
  at: 0,
  on() { return CFG.keepPick !== false; },
  mark(stream) { if (stream && Date.now() - this.at < 2500) stream._byHand = true; },
  hold(failed, reason) {
    if (!this.on() || !failed || !failed._byHand || failed !== P.stream || $('#player').hidden) return false;
    const r = String(reason || ''), why = /not supported|blocked|decode|format/i.test(r) ? 'won’t play here' : /start/i.test(r) ? 'is slow to start' : /stall|drop/i.test(r) ? 'stalled' : /cached/i.test(r) ? 'isn’t ready yet' : 'didn’t work';
    toast(`That source ${why}. It stays on because you picked it. Sources has the others.`, 'info', 5200, 'failover');
    return true;
  },
  init() {
    document.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('.stream[data-si]')) this.at = Date.now(); }, true);
  },
};

const Mk99a = {
  init() {
    KeepPick.init();
    video.addEventListener('loadedmetadata', () => setTimeout(() => LenCheck.check(), 400));
    video.addEventListener('durationchange', () => { if (video.currentTime < 30) LenCheck.check(); });
    document.documentElement.classList.toggle('mk-noname', !!CFG.hideSrcNames);
    CFG_HOOKS.push((k, v) => { if (k === 'hideSrcNames') { document.documentElement.classList.toggle('mk-noname', !!v); if (D && D.meta && $('#dStreams')) renderStreamsPanel(); } });
    const st = secById('streams');
    if (st) { const rows = st.rows; st.rows = () => [...rows(),
      { group: 'How sources look' },
      { key: 'hideSrcNames', label: 'Hide source names', help: 'Source lists show quality, size and language instead of addon or service names.', type: 'toggle', get: () => !!CFG.hideSrcNames, set: (v) => setCfg('hideSrcNames', v) },
      { key: 'relTiers', label: 'Rank release groups', help: 'Copies from well-known release groups come first within the same quality, and groups known for poor copies come last. Their name shows on the source.', type: 'toggle', get: () => CFG.relTiers !== false, set: (v) => { setCfg('relTiers', v); toast('Applies to the next source search', 'info', 2400); } },
    ]; }
    const pb = secById('playback');
    if (pb) { const rows = pb.rows; pb.rows = () => [...rows(),
      { key: 'keepPick', label: 'Keep the source I pick', help: 'A source you pick from the list is not swapped for another when it is slow or fails. Automatic picks still move on.', type: 'toggle', get: () => CFG.keepPick !== false, set: (v) => setCfg('keepPick', v) },
      { key: 'lenCheck', label: 'Check the film’s length', help: 'When a copy is more than 10% longer or shorter than the film, MKCinema pauses and asks before playing it.', type: 'toggle', get: () => CFG.lenCheck !== false, set: (v) => setCfg('lenCheck', v) },
      { key: 'readyLine', label: 'Ready line on title pages', help: 'Shows the best copy’s picture and sound under the title once the sources are in.', type: 'toggle', get: () => CFG.readyLine !== false, set: (v) => setCfg('readyLine', v) },
    ]; }
  },
};
Mk99a.init();
window.MkLenCheck = LenCheck; window.MkReady = ReadyLine; window.MkKeepPick = KeepPick;
/* ---------------- 2.99 Title pages and Library ----------------
   1) About this title: one sheet with release dates, age ratings, scores, people, studios, the collection or series it
      belongs to, languages and box office. From the title's own details, the age ratings MKCinema already keeps, the
      viewer's TMDB key when there is one, and otherwise Wikidata (free, no key). Cached for a week.
   2) Library › History: everything you started or finished, newest first. Library › Not watched yet: your watchlist
      without what you have started or finished. */
const About = {
  KEY: 'aboutCache', TTL: 7 * 864e5,
  cache() { const c = Store.raw.get(this.KEY, {}); return c && typeof c === 'object' ? c : {}; },
  put(tt, v) {
    const c = this.cache(); c[tt] = { at: Date.now(), v };
    const ks = Object.keys(c); if (ks.length > 300) ks.sort((a, b) => c[a].at - c[b].at).slice(0, ks.length - 300).forEach((k) => delete c[k]);
    Store.raw.set(this.KEY, c);
  },
  tt(m) { const i = String((m && (m.imdb_id || m.id)) || '').split(':')[0]; return /^tt\d{5,10}$/.test(i) ? i : ''; },
  money(n, cur) { n = Number(n); if (!(n > 0)) return ''; try { return new Intl.NumberFormat(appLocale(), { style: 'currency', currency: cur || 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch (e) { return `$${Math.round(n / 1e6)}M`; } },
  date(v) { const t = Date.parse(v); if (!isFinite(t)) return ''; try { return new Date(t).toLocaleDateString(appLocale(), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }); } catch (e) { return String(v).slice(0, 10); } },
  RTYPE: { 1: 'Premiere', 2: 'Limited release', 3: 'In cinemas', 4: 'Digital', 5: 'Disc', 6: 'On TV' },
  async tmdb(tt, type) {
    const f = await TMDB.find(tt); const x = f && ((type === 'series' ? f.tv_results : f.movie_results) || [])[0] || (f && ((f.movie_results || [])[0] || (f.tv_results || [])[0]));
    if (!x) return null;
    const k = f.tv_results && f.tv_results.includes(x) ? 'tv' : 'movie';
    const d = await TMDB.get(`${k}/${x.id}`, { append_to_response: k === 'movie' ? 'release_dates' : 'content_ratings', language: People.lang ? People.lang() : 'en-US' });
    if (!d) return null;
    const want = [KidsAge.country(), 'US', 'GB'], dates = [];
    if (k === 'movie') ((d.release_dates && d.release_dates.results) || []).filter((r) => want.includes(r.iso_3166_1)).forEach((r) => (r.release_dates || []).forEach((y) => dates.push({ c: r.iso_3166_1, t: this.RTYPE[y.type] || '', d: y.release_date, r: y.certification || '' })));
    return {
      studios: (d.production_companies || []).map((c) => c.name).slice(0, 6), coll: d.belongs_to_collection ? d.belongs_to_collection.name : '',
      lang: d.original_language || '', budget: this.money(d.budget), box: this.money(d.revenue), status: d.status || '',
      networks: (d.networks || []).map((n) => n.name).slice(0, 4), seasons: d.number_of_seasons || 0, episodes: d.number_of_episodes || 0,
      first: d.first_air_date || '', last: d.last_air_date || '', tagline: d.tagline || '',
      dates: dates.sort((a, b) => Date.parse(a.d) - Date.parse(b.d)).slice(0, 8),
    };
  },
  async wiki(tt) {
    const q = `SELECT ?p ?v ?vLabel ?pl ?plLabel WHERE { ?f wdt:P345 "${tt}" . VALUES ?p { wdt:P272 wdt:P179 wdt:P364 wdt:P2142 wdt:P2130 wdt:P577 wdt:P449 } ?f ?p ?v . OPTIONAL { ?f p:P577 ?st . ?st ps:P577 ?v . ?st pq:P291 ?pl . } SERVICE wikibase:label { bd:serviceParam wikibase:language "${(appLocale() || 'en').split('-')[0]},en". } } LIMIT 80`;
    const r = await netFetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { accept: 'application/sparql-results+json' } }, 9000);
    if (!r.ok) return null;
    const rows = ((await r.json()).results || {}).bindings || [], o = { studios: [], coll: '', lang: '', budget: '', box: '', networks: [], dates: [] };
    const val = (x) => (x && x.value) || '';
    rows.forEach((b) => {
      const p = val(b.p).split('/').pop(), v = val(b.v), l = val(b.vLabel);
      if (p === 'P272' && l && !/^Q\d+$/.test(l) && !o.studios.includes(l)) o.studios.push(l);
      if (p === 'P449' && l && !/^Q\d+$/.test(l) && !o.networks.includes(l)) o.networks.push(l);
      if (p === 'P179' && l && !/^Q\d+$/.test(l)) o.coll = o.coll || l;
      if (p === 'P364' && l && !/^Q\d+$/.test(l)) o.langName = o.langName || l;
      if (p === 'P2142' && !o.box) o.box = this.money(v);
      if (p === 'P2130' && !o.budget) o.budget = this.money(v);
      if (p === 'P577' && v) { const pl = val(b.plLabel); if (!o.dates.some((d) => d.d === v && d.c === pl)) o.dates.push({ c: pl && !/^Q\d+$/.test(pl) ? pl : '', t: '', d: v }); }
    });
    o.studios = o.studios.slice(0, 6); o.networks = o.networks.slice(0, 4);
    o.dates = o.dates.sort((a, b) => Date.parse(a.d) - Date.parse(b.d)).slice(0, 8);
    return o;
  },
  async extra(m) {
    const tt = this.tt(m); if (!tt) return null;
    const hit = this.cache()[tt]; if (hit && Date.now() - hit.at < this.TTL) return hit.v;
    let v = null;
    try { if (TMDB.key()) v = await this.tmdb(tt, m.type); } catch (e) { v = null; }
    if (!v) try { v = await this.wiki(tt); } catch (e) { v = null; }
    if (v) this.put(tt, v);
    return v;
  },
  ages(m) {
    const tt = this.tt(m), a = tt && KidsAge.ages(tt); if (!a) return '';
    const cs = (KidsAge.data && KidsAge.data.c) || ['US', 'BR', 'IN', 'GB', 'DE'];
    const n = (c) => { try { return new Intl.DisplayNames([appLocale()], { type: 'region' }).of(c); } catch (e) { return c; } };
    return cs.map((c, i) => (a[i] != null ? `${a[i]}+ (${n(c)})` : '')).filter(Boolean).join(' · ');
  },
  row(k, v) { return v ? `<div class="ab-r"><span>${esc(k)}</span><b>${v}</b></div>` : ''; },
  list(a) { return (a || []).filter(Boolean).map(esc).join(', '); },
  body(m, x) {
    const L = (k) => (m.links || []).filter((l) => l.category === k).map((l) => l.name);
    const dir = m.director || L('Directors'), wr = m.writer || L('Writers'), cast = m.cast || L('Cast');
    const rb = $('#detailPanel .metaline .rbadges'), scores = [m.imdbRating ? `IMDb ${esc(m.imdbRating)}` : '', rb ? [...rb.children].map((c) => esc(`${(c.title || c.getAttribute('aria-label') || '').replace(/\s*\d.*$/, '')} ${c.textContent.trim()}`.trim())).join(' · ') : ''].filter(Boolean).join(' · ');
    const langN = (c) => { try { return new Intl.DisplayNames([appLocale()], { type: 'language' }).of(c); } catch (e) { return c; } };
    const sec = (h, inner) => (inner ? `<h3 class="ab-h">${esc(h)}</h3>${inner}` : '');
    const dates = x && x.dates && x.dates.length ? x.dates.map((d) => this.row([d.t, d.c].filter(Boolean).join(' · ') || 'Released', esc(this.date(d.d)) + (d.r ? ` <small>${esc(d.r)}</small>` : ''))).join('') : '';
    return [
      sec('Release', [this.row('Released', esc(this.date(m.released) || yearOf(m) || '')), m.dvdRelease ? this.row('On disc or digital', esc(this.date(m.dvdRelease))) : '', x && x.first ? this.row('First aired', esc(this.date(x.first))) : '', x && x.last && x.status !== 'Returning Series' ? this.row('Last aired', esc(this.date(x.last))) : '', x && x.seasons ? this.row('Seasons', `${x.seasons}${x.episodes ? ` · ${x.episodes} episodes` : ''}`) : '', m.runtime ? this.row('Runtime', esc(m.runtime)) : '', dates].join('')),
      sec('Age rating', this.row('Minimum age', esc(this.ages(m)))),
      sec('Scores', this.row('Ratings', scores) + (m.awards ? this.row('Awards', esc(m.awards)) : '')),
      sec('People', [this.row('Directed by', this.list((dir || []).slice(0, 4))), this.row('Written by', this.list((wr || []).slice(0, 5))), this.row('Starring', this.list((cast || []).slice(0, 12)))].join('')),
      sec('Made by', x ? [this.row('Studios', this.list(x.studios)), this.row('Network', this.list(x.networks)), this.row('Part of', esc(x.coll || '')), this.row('Original language', esc(x.langName || (x.lang ? langN(x.lang) : ''))), this.row('Country', esc(m.country || '')), this.row('Budget', esc(x.budget || '')), this.row('Box office', esc(x.box || ''))].join('') : this.row('Country', esc(m.country || ''))),
    ].join('');
  },
  async open(m) {
    if (!m) return;
    X8.layer('mkAbout', { label: 'About this title', icon: 'info', eyebrow: 'About this title', wide: true });
    const b = X8.body('mkAbout'); const paint = (x, wait) => { b.innerHTML = `<h2 class="x8-h" translate="no">${esc(m.name || '')}</h2>${x && x.tagline ? `<p class="sc-p ab-tag">${esc(x.tagline)}</p>` : ''}<div class="ab-box" tabindex="0" data-nav>${this.body(m, x)}${wait ? '<div class="status-line"><span class="spin"></span>Looking up studios and dates…</div>' : ''}</div>`; icons(); };
    paint(null, true); X8.open('mkAbout');
    if (IS_TV) setTimeout(() => { const f = $('.ab-box', b); if (f) Nav.focus(f, true); }, 80);
    try { if (KidsAge.load) await KidsAge.load(); if (!KidsAge.ages(this.tt(m)) && KidsAge.lookup) await Promise.race([KidsAge.lookup([m]), new Promise((r) => setTimeout(r, 6000))]); } catch (e) { /* no ages */ }
    const x = await this.extra(m).catch(() => null);
    if ($('#mkAbout') && !$('#mkAbout').hidden) paint(x, false);
  },
};
window.MkAbout = About;

const LibMore = {
  items(t) {
    if (t === 'unwatched') {
      const started = new Set(continueItems().map((p) => p.metaId)), w = watchedMap();
      const touched = (id) => started.has(id) || isWatched(id) || Object.keys(w).some((k) => k.split(':')[0] === id);
      return S.watchlist.filter((m) => m && m.id && !touched(m.id)).map((m, i) => ({ ...m, _added: S.watchlist.length - i }));
    }
    const out = new Map(), put = (m, at) => { if (!m || !m.id || !m.name) return; const o = out.get(m.id); if (!o || (o._added || 0) < at) out.set(m.id, { ...m, _added: at }); };
    Object.values(S.progress || {}).forEach((p) => { if (p && p.metaId) put({ id: p.metaId, type: p.type, name: p.name, poster: p.poster, background: p.background, genres: p.genres }, Number(p.at) || 0); });
    Object.entries(watchedMap()).forEach(([id, at]) => {
      const base = id.split(':')[0], m = S.metas.get(base) || S.watchlist.find((x) => x.id === base) || (out.get(base));
      const p = !m && Object.values(S.progress || {}).find((x) => x.metaId === base);
      put(m || (p && { id: base, type: p.type, name: p.name, poster: p.poster }), Number(at) || 0);
    });
    return [...out.values()];
  },
  count() { try { return this.items('unwatched').length; } catch (e) { return null; } },
};
window.MkLibMore = LibMore;
/* ---------------- 2.99 Seats ----------------
   1) Content filters per seat (Edit seat › Content filters): 18 topic packs, off by default, plus the seat's own words.
      A filtered title leaves rows, the banner and search results on that seat; its page says which pack hid it.
      Preview shows what the filters hide among the titles this device knows. Kept on this device.
   2) Settings for the main seat only (Edit the main seat): other seats need the main seat's PIN to open Settings or
      Addons. With no PIN on the main seat, they are told to switch seats.
   3) PIN with the remote's arrows (TV): on the PIN pad, "Use the arrows" turns up, left, right and down into 2, 4, 6
      and 8, so a PIN like 2486 is typed without moving around the pad.
   4) After a break (Settings › Seats): when MKCinema comes back after 30 minutes away or idle, it asks who's watching;
      a seat with a PIN asks for it again after 15 minutes away. Only with more than one seat, never during a film. */
const Filt = {
  PACKS: [
    ['horror', 'Horror and gore', 'g:horror|gore|gory|slasher|gruesome|zombie|zombies|dismember|cannibal|massacre|torture'],
    ['violence', 'Strong violence', 'brutal|brutally|bloodbath|massacre|killing spree|shootout|torture|tortured|execution|beheaded|mutilat'],
    ['sex', 'Sexual content', 'g:erotic|sex|sexual|sexy|erotic|seduction|seduce|stripper|prostitut|porn|nude|nudity|orgy|affair'],
    ['drugs', 'Drugs', 'drug|drugs|cocaine|heroin|meth|methamphetamine|cartel|narco|narcotics|addict|addiction|overdose|drug dealer'],
    ['alcohol', 'Alcohol', 'alcohol|alcoholic|alcoholism|drunk|drunken|booze|hangover'],
    ['selfharm', 'Suicide and self-harm', 'suicide|suicidal|self-harm|self harm|kills himself|kills herself'],
    ['abuse', 'Abuse', 'abuse|abused|abusive|molest|rape|raped|domestic violence|grooming|incest'],
    ['war', 'War', 'g:war|war|wartime|soldier|soldiers|battlefield|combat|invasion|world war|wwii|vietnam|platoon'],
    ['crime', 'Murder and true crime', 'g:crime|murder|murders|murderer|serial killer|homicide|kidnap|kidnapped|kidnapping|hostage|true crime'],
    ['religion', 'Religion', 'god|church|faith|bible|jesus|christ|priest|nun|religious|religion|muslim|islam|jewish|rabbi|monk|temple'],
    ['occult', 'Occult and the supernatural', 'witch|witches|witchcraft|demon|demonic|satan|satanic|occult|possessed|possession|exorcism|exorcist|ghost|ghosts|haunted|haunting|curse|cursed|ritual|seance'],
    ['spiders', 'Spiders and insects', 'spider|spiders|tarantula|insect|insects|arachnid|ants|swarm|cockroach|cockroaches|wasps|bees'],
    ['snakes', 'Snakes', 'snake|snakes|serpent|python|anaconda|cobra|viper|rattlesnake'],
    ['sharks', 'Sharks and the deep sea', 'shark|sharks|great white|sea monster|piranha|piranhas|deep sea'],
    ['clowns', 'Clowns', 'clown|clowns|jester|pennywise'],
    ['needles', 'Needles and surgery', 'needle|needles|syringe|injection|surgery|surgeon|operating table|amputat'],
    ['animals', 'Animals in danger', 'animal cruelty|dog dies|poacher|poachers|poaching|hunted animals|slaughterhouse|whaling'],
    ['disaster', 'Disasters and pandemics', 'pandemic|epidemic|outbreak|plague|virus|earthquake|tsunami|plane crash|shipwreck|apocalypse|apocalyptic|catastrophe'],
  ],
  re: {}, memo: new Map(),
  all() { const v = Store.raw.get('seatFilt', {}); return v && typeof v === 'object' ? v : {}; },
  get(id) { const v = this.all()[id == null ? (SEAT || '') : id] || {}; return { p: Array.isArray(v.p) ? v.p : [], w: String(v.w || '') }; },
  set(id, v) { const a = this.all(); a[id || ''] = { p: v.p || [], w: String(v.w || '').slice(0, 400) }; Store.raw.set('seatFilt', a); this.memo.clear(); },
  rx(id) {
    if (this.re[id]) return this.re[id];
    const P = this.PACKS.find((x) => x[0] === id); if (!P) return null;
    const parts = P[2].split('|'), g = parts.filter((w) => w.startsWith('g:')).map((w) => w.slice(2)), words = parts.filter((w) => !w.startsWith('g:'));
    return (this.re[id] = { g, w: new RegExp(`(^|[^a-z])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})([^a-z]|$)`, 'i') });
  },
  text(m) { return `${m.name || ''} ${m.description || m.overview || ''}`.toLowerCase(); },
  genres(m) { const g = m.genres || m.genre || []; return (Array.isArray(g) ? g : String(g).split(',')).map((x) => String(x || '').trim().toLowerCase()); },
  /* the reason a title is hidden on this seat ('' when it is not) */
  why(m, id) {
    if (!m || !m.id) return '';
    const f = this.get(id); if (!f.p.length && !f.w.trim()) return '';
    const key = `${id == null ? SEAT : id}|${m.id}|${(m.description || '').length}|${this.genres(m).join(',')}`;
    if (this.memo.has(key)) return this.memo.get(key);
    let out = '';
    const t = this.text(m), gs = this.genres(m);
    for (const p of f.p) {
      const r = this.rx(p); if (!r) continue;
      if (r.g.some((g) => gs.some((x) => x.includes(g))) || r.w.test(t)) { out = (this.PACKS.find((x) => x[0] === p) || [])[1] || p; break; }
    }
    if (!out) { const hit = f.w.split(',').map((w) => w.trim().toLowerCase()).filter((w) => w.length > 1).find((w) => t.includes(w)); if (hit) out = `your word “${hit}”`; }
    if (this.memo.size > 4000) this.memo.clear();
    this.memo.set(key, out);
    return out;
  },
  html(s) {
    const f = this.get(s.id);
    return `<div class="se-filt"><b>Content filters</b><small>Titles about these topics leave this seat’s rows, banner and search. Off unless you choose some.</small>
      <div class="se-filt-l" role="group" aria-label="Topic packs">${this.PACKS.map(([k, l]) => `<button type="button" class="chip${f.p.includes(k) ? ' on' : ''}" data-nav data-fp="${k}" aria-pressed="${f.p.includes(k)}">${esc(l)}</button>`).join('')}</div>
      <label>My words (separated by commas)<input class="inp" id="seFiltW" maxlength="400" value="${esc(f.w)}" placeholder="e.g. clown, haunted house" autocomplete="off"></label>
      <button class="btn btn-ghost btn-sm" type="button" data-nav id="seFiltPrev"><i data-lucide="eye"></i>Preview what’s hidden</button></div>`;
  },
  bind(b, s) {
    const st = this.get(s.id); s._filt = st;
    $$('[data-fp]', b).forEach((x) => x.addEventListener('click', () => { const k = x.dataset.fp, on = !st.p.includes(k); st.p = on ? [...st.p, k] : st.p.filter((y) => y !== k); x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); }));
    const w = $('#seFiltW', b); if (w) { w.addEventListener('keydown', (e) => e.stopPropagation()); w.addEventListener('input', () => { st.w = w.value; }); }
    const pv = $('#seFiltPrev', b); if (pv) pv.onclick = () => this.preview(s, st);
  },
  save(s) { if (s && s._filt) { this.set(s.id, s._filt); delete s._filt; this.applyAll(); } },
  preview(s, st) {
    const was = this.get(s.id); this.set(s.id, st);
    const seen = new Map(); [...S.metas.values(), ...(S.watchlist || [])].forEach((m) => { if (m && m.id && m.name && !seen.has(m.id)) seen.set(m.id, m); });
    const hid = [...seen.values()].map((m) => [m, this.why(m, s.id)]).filter(([, w]) => w);
    this.set(s.id, was);
    X8.layer('filtPrev', { label: 'Preview', icon: 'eye', eyebrow: 'Content filters', wide: true });
    X8.body('filtPrev').innerHTML = `<h2 class="x8-h">${hid.length === 1 ? '1 title hidden' : `${hid.length} titles hidden`} for ${esc(s.name || '')}</h2><p class="sc-p">Out of ${seen.size} titles this device has seen. More are checked as rows load.</p>
      <div class="ab-box" tabindex="0" data-nav>${hid.slice(0, 200).map(([m, w]) => `<div class="ab-r"><span translate="no">${esc(m.name)}</span><b>${esc(w)}</b></div>`).join('') || '<p class="sc-p">Nothing here is hidden.</p>'}</div>`;
    icons(); X8.open('filtPrev');
  },
  on() { const f = this.get(); return !!(f.p.length || f.w.trim()); },
  applyAll() { try { if (S.view === 'home' && typeof renderHome === 'function') renderHome(); } catch (e) { /* next visit */ } },
  /* the title page line */
  line(m) { const w = this.why(m); return w ? `<div class="d-filt"><i data-lucide="eye-off"></i><span>Hidden on this seat by <b>${esc(w)}</b>. Edit the seat to change it.</span></div>` : ''; },
};
window.MkFilt = Filt;

const SetLock = {
  on() { return Store.raw.get('setLockMain', false) === true; },
  block(cb) {
    if (!this.on() || (SEAT || '') === '') return false;
    if (Seats.unlocked && Date.now() - Seats.unlockedAt < 10 * 60e3) return false;
    const o = Seats.owner();
    if (!o.pin) { toast(`Only ${o.name} can change settings. Switch seats to change them.`, 'info', 4200, 'setlock'); return true; }
    Seats.askPin(o, () => { Seats.unlocked = true; Seats.unlockedAt = Date.now(); X8.close('seatPick'); cb(); }, `${o.name}’s PIN for Settings`);
    return true;
  },
  html(s) {
    if (s.id !== '') return '';
    return `<div class="set-row"><div><b>Settings for this seat only</b><small>Other seats need this seat’s PIN to open Settings or Addons.</small></div><div class="set-ctl"><button class="switch ${this.on() ? 'on' : ''}" type="button" role="switch" aria-checked="${this.on()}" data-nav id="seSetLock" aria-label="Settings for this seat only"></button></div></div>`;
  },
  bind(b) { const x = $('#seSetLock', b); if (x) x.onclick = () => { const v = !this.on(); Store.raw.set('setLockMain', v); x.classList.toggle('on', v); x.setAttribute('aria-checked', String(v)); if (v && !Seats.owner().pin) toast('Add a PIN to this seat too, or anyone can switch to it', 'info', 4200); }; },
  init() {
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('#openAddons'); if (!b || !this.on() || (SEAT || '') === '') return;
      if (Seats.unlocked && Date.now() - Seats.unlockedAt < 10 * 60e3) return;
      e.preventDefault(); e.stopImmediatePropagation(); this.block(() => b.click());
    }, true);
  },
};
window.MkSetLock = SetLock;

const SeatBreak = {
  last: Date.now(), hidAt: 0,
  on() { return CFG.seatBreak !== false && Seats.list().length > 0; },
  busy() { return !$('#player').hidden || (typeof Party !== 'undefined' && Party.code) || ($('#seatPick') && !$('#seatPick').hidden); },
  back(away) {
    if (!this.on() || this.busy()) return;
    const cur = Seats.cur();
    if (away >= 30 * 60e3) { Seats.pick({ force: true }); if (cur.pin && away >= 15 * 60e3) setTimeout(() => Seats.askPin(cur, () => X8.close('seatPick')), 200); }
    else if (cur.pin && away >= 15 * 60e3) Seats.askPin(cur, () => X8.close('seatPick'));
  },
  init() {
    const poke = () => { const now = Date.now(); const idle = now - this.last; this.last = now; if (idle >= 30 * 60e3 && !document.hidden) this.back(idle); };
    ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, poke, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.hidAt = Date.now(); return; }
      const away = this.hidAt ? Date.now() - this.hidAt : 0; this.hidAt = 0; if (away) { this.last = Date.now(); this.back(away); }
    });
    setInterval(() => { if (!$('#player').hidden) this.last = Date.now(); }, 60e3);
    const sec = secById('seats');
    if (sec) { const rows = sec.rows; sec.rows = () => [...rows(), { key: 'seatBreak', label: 'Ask who’s watching after a break', help: 'After 30 minutes away or idle, MKCinema asks who’s watching. A seat with a PIN asks for it again after 15 minutes away. Never during a film.', type: 'toggle', get: () => CFG.seatBreak !== false, set: (v) => setCfg('seatBreak', v) }]; }
  },
};

const PinArrows = {
  MAP: { ArrowUp: '2', ArrowLeft: '4', ArrowRight: '6', ArrowDown: '8' },
  on() { return IS_TV && Store.raw.get('pinArrows', false) === true; },
  label() { return this.on() ? 'Arrows type 2 4 6 8' : 'Use the arrows'; },
  init() {
    addEventListener('keydown', (e) => {
      const box = $('#seatPin'); if (!this.on() || !box || box.hidden || !this.MAP[e.key] || typeof Seats._pinPress !== 'function') return;
      e.preventDefault(); e.stopImmediatePropagation(); Seats._pinPress(this.MAP[e.key]);
      setTimeout(() => { const f = $('#pinArrows'); if (f) Nav.focus(f, true); }, 0);
    }, true);
  },
};
PinArrows.init();
window.MkPinArrows = PinArrows;
window.MkSeatBreak = SeatBreak;
SetLock.init(); SeatBreak.init();
/* ---------------- 2.99 Setup, backup and subtitle fonts ----------------
   1) Set up for this screen (Settings › Playback; runs by itself once on a new device): reads the screen (size, HDR,
      refresh rate), what this device decodes (HEVC, AV1, VP9 and Dolby Vision at 4K), its memory and a short speed
      test, then sets the highest quality, the HDR preference, frame-rate matching (TV app) and Slow internet mode.
      It says what it changed, and Undo puts every one back.
   2) Backups: the setup file and code now hold every seat (their settings, lists, progress and filters). Private keys
      can be sealed with a backup PIN (AES-GCM, key from PBKDF2), so a lost file does not give them away; restoring
      asks for the PIN. Before a restore, a safety copy of what it replaces is kept, and "Undo the last restore" brings
      it back.
   3) Your own subtitle fonts: add up to five .ttf, .otf, .woff or .woff2 files (Settings › Subtitles), pick one as the
      subtitle font. Kept on this device. */
const AutoSetup = {
  KEYS: ['maxQuality', 'srHdr', 'matchRate', 'srSlow'],
  app() { return /MKCinemaAndroid/.test(navigator.userAgent); },
  async speed() {
    const t0 = performance.now(); let bytes = 0;
    const ac = typeof AbortController === 'function' ? new AbortController() : null, stop = setTimeout(() => ac && ac.abort(), 6000);
    try {
      await Promise.all([0, 1].map(async (i) => {
        try { const r = await fetch(`https://speed.cloudflare.com/__down?bytes=8000000&r=${Date.now()}${i}`, { cache: 'no-store', ...(ac ? { signal: ac.signal } : {}) }); const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; bytes += value.length; } } catch (e) { /* time is up */ }
      }));
    } finally { clearTimeout(stop); }
    const s = (performance.now() - t0) / 1000; return bytes > 500000 ? (bytes * 8) / s / 1e6 : 0;
  },
  async read() {
    const px = Math.max(screen.width, screen.height) * (devicePixelRatio || 1);
    const hdr = matchMedia('(dynamic-range: high)').matches || matchMedia('(video-dynamic-range: high)').matches;
    let c = {}; try { c = await Diagnostic.codecs(); } catch (e) { /* none */ }
    let fps = 0; try { fps = (await Diagnostic.frames(1500)).fps || 0; } catch (e) { /* none */ }
    const conn = navigator.connection || {}, mem = navigator.deviceMemory || 0;
    let mbps = 0; try { mbps = conn.saveData ? 0 : await this.speed(); } catch (e) { mbps = 0; }
    if (!mbps && conn.downlink) mbps = conn.downlink;
    const k4 = this.app() || (c.hevc4k && c.hevc4k.ok) || (c.av1_4k && c.av1_4k.ok) || (c.vp9_4k && c.vp9_4k.ok);
    return { px, hdr, k4: !!k4, dv: !!(c.dolbyVision && c.dolbyVision.ok), fps, mem, mbps, save: !!conn.saveData };
  },
  plan(r) {
    const big = r.px >= 3000 || (IS_TV && r.px >= 1900 && this.app());
    const q = r.k4 && big && (!r.mbps || r.mbps >= 40) ? '4k' : (!r.mbps || r.mbps >= 12) && r.px >= 1200 ? '1080' : '720';
    const out = { maxQuality: q, srHdr: r.hdr ? 'prefer' : 'avoid', srSlow: r.save || (r.mbps > 0 && r.mbps < 8) };
    if (IS_TV && this.app()) out.matchRate = true;
    return out;
  },
  label(k, v) {
    if (k === 'maxQuality') return `Highest quality ${v === '4k' ? '4K' : `${v}p`}`;
    if (k === 'srHdr') return v === 'prefer' ? 'Prefer HDR' : 'Avoid HDR (this screen shows it washed out)';
    if (k === 'matchRate') return v ? 'Match the film’s frame rate' : 'Keep the screen’s refresh rate';
    if (k === 'srSlow') return v ? 'Slow internet mode on' : 'Slow internet mode off';
    return k;
  },
  async run(quiet) {
    if (this.busy) return; this.busy = true;
    try {
      const r = await this.read(), p = this.plan(r), before = {}, changed = [];
      for (const [k, v] of Object.entries(p)) { const cur = k === 'matchRate' ? CFG.matchRate !== false : k === 'srSlow' ? CFG.srSlow === true : CFG[k]; if (cur !== v) { before[k] = k in CFG ? CFG[k] : null; changed.push(k); setCfg(k, v); } }
      Store.raw.set('autoSetup', { at: Date.now(), read: { px: Math.round(r.px), hdr: r.hdr, k4: r.k4, dv: r.dv, fps: r.fps, mem: r.mem, mbps: Math.round(r.mbps) }, before, changed });
      const what = changed.map((k) => this.label(k, p[k]));
      if (!quiet || changed.length) toast(changed.length ? `Set up for this screen: ${what.join(', ')}. Undo it in Settings › Playback.` : 'This screen was already set up well. Nothing changed.', 'ok', 7000, 'autosetup');
      if (!$('#settings').hidden) renderSettingsBody();
    } catch (e) { if (!quiet) toast(`The setup did not finish (${e.message})`, 'err'); }
    this.busy = false;
  },
  undo() {
    const a = Store.raw.get('autoSetup', null); if (!a || !a.before) return;
    Object.entries(a.before).forEach(([k, v]) => { if (v == null) { delete CFG[k]; saveCfg(); } else setCfg(k, v); });
    Store.raw.set('autoSetup', { ...a, before: {}, changed: [], undone: Date.now() }); toast('Setup undone', 'info'); if (!$('#settings').hidden) renderSettingsBody();
  },
  help() {
    const a = Store.raw.get('autoSetup', null); if (!a || !a.read) return 'Reads this screen, what it can decode and your connection, then sets quality, HDR and frame rate to match.';
    const r = a.read, bits = [`${r.px >= 3000 ? '4K' : r.px >= 1800 ? 'Full HD' : 'HD'} screen`, r.hdr ? 'HDR' : 'no HDR', r.k4 ? 'decodes 4K' : 'no 4K decoding', r.fps ? `${r.fps} Hz` : '', r.mbps ? `${r.mbps} Mbps` : ''].filter(Boolean);
    return `Last run: ${esc(bits.join(' · '))}. ${a.changed && a.changed.length ? `Changed ${a.changed.length} setting${a.changed.length === 1 ? '' : 's'}.` : 'Nothing needed changing.'}`;
  },
  init() {
    const pb = secById('playback');
    if (pb) { const rows = pb.rows; pb.rows = () => { const r = rows(), a = Store.raw.get('autoSetup', null); r.unshift({ key: 'autoSetup', label: 'Set up for this screen', help: this.help(), type: 'button', text: this.busy ? 'Checking…' : 'Check now', icon: 'scan-eye', run: () => this.run(false) }); if (a && a.changed && a.changed.length) r.splice(1, 0, { key: 'autoSetupUndo', label: 'Undo the setup', help: a.changed.map((k) => this.label(k, CFG[k])).join(', '), type: 'button', text: 'Undo', icon: 'undo-2', run: () => this.undo() }); return r; }; }
    // a new device (nothing watched yet, never set up) is set up once, quietly, when the app has settled
    const fresh = !Store.raw.get('autoSetup', null) && !Object.keys(S.progress || {}).length && !Object.keys(watchedMap()).length;
    if (fresh) setTimeout(() => { if ($('#player').hidden && !Store.raw.get('autoSetup', null)) this.run(true); }, 25000);
  },
};
window.MkAutoSetup = AutoSetup;

const Backup = {
  SECRET: /(Key|Token|Secret|Pass)$/,
  seats() {
    const ls = {}; let n = 0;
    try { Object.keys(localStorage).filter((k) => k.startsWith('mkc:seat:')).forEach((k) => { const v = localStorage.getItem(k); if (v != null && v.length < 400000 && n < 4e6) { ls[k] = v; n += v.length; } }); } catch (e) { /* blocked */ }
    return { list: Store.raw.get('seats', []), owner: { ownerSeatName: Store.raw.get('ownerSeatName', ''), ownerAv: Store.raw.get('ownerAv', ''), ownerColor: Store.raw.get('ownerColor', ''), ownerHide: Store.raw.get('ownerHide', null) }, filt: Store.raw.get('seatFilt', {}), lock: Store.raw.get('setLockMain', false), ls };
  },
  async key(pin, salt) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(`mkc-backup:${pin}`), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200000 }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); },
  async pack(d, opts) {
    d = { ...d, seats: this.seats() };
    const pin = ($('#cl-pin') && $('#cl-pin').value.trim()) || '';
    if (opts && opts.secrets && pin) {
      if (!/^\d{4,8}$/.test(pin)) throw new Error('A backup PIN is 4 to 8 digits');
      const cfg = { ...(d.cfg || {}) }, sec = {}; Object.keys(cfg).forEach((k) => { if (this.SECRET.test(k)) { sec[k] = cfg[k]; delete cfg[k]; } });
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.key(pin, salt), new TextEncoder().encode(JSON.stringify({ vault: d.vault || {}, keys: d.keys || {}, cfg: sec }))));
      d = { ...d, cfg, vault: undefined, keys: undefined, sealed: { v: 1, salt: b64url.enc(salt), iv: b64url.enc(iv), data: b64url.enc(data) } };
    }
    return d;
  },
  ask() {
    return new Promise((res) => {
      X8.layer('bkPin', { label: 'Backup PIN', icon: 'lock', eyebrow: 'Restore' });
      X8.body('bkPin').innerHTML = `<h3 class="x8-h">This backup has sealed keys</h3><p class="sub">Type its backup PIN to restore the private keys too, or skip them.</p><input class="inp mono" id="bkPinIn" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="Backup PIN"><div class="actions" style="margin-top:12px"><button class="btn btn-prime" type="button" data-nav id="bkPinGo"><i data-lucide="lock-open"></i>Open</button><button class="btn btn-ghost" type="button" data-nav id="bkPinSkip">Skip the keys</button></div>`;
      icons(); let done = false; const fin = (v) => { if (done) return; done = true; delete X8.onClose.bkPin; X8.close('bkPin'); res(v); };
      const i = $('#bkPinIn'); i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(i.value.trim()); });
      $('#bkPinGo').onclick = () => fin(i.value.trim()); $('#bkPinSkip').onclick = () => fin('');
      X8.onClose.bkPin = () => fin(''); X8.open('bkPin'); setTimeout(() => i.focus(), 60);
    });
  },
  async unseal(d) {
    if (!d || !d.sealed) return d;
    for (let tries = 0; tries < 3; tries++) {
      const pin = await this.ask(); if (!pin) { const o = { ...d }; delete o.sealed; return o; }
      try {
        const s = d.sealed, plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64url.dec(s.iv) }, await this.key(pin, b64url.dec(s.salt)), b64url.dec(s.data));
        const x = JSON.parse(new TextDecoder().decode(plain)), o = { ...d, vault: x.vault, keys: x.keys, cfg: { ...(d.cfg || {}), ...(x.cfg || {}) } }; delete o.sealed; return o;
      } catch (e) { toast('That backup PIN is not right', 'err', 2600); }
    }
    const o = { ...d }; delete o.sealed; return o;
  },
  safety() {
    try { const snap = Cloner.snapshot({ secrets: true }); snap.seats = this.seats(); localStorage.setItem('mkc:restoreUndo', JSON.stringify({ at: Date.now(), d: snap })); return true; } catch (e) { try { localStorage.removeItem('mkc:restoreUndo'); } catch (x) { /* none */ } return false; }
  },
  restoreSeats(d, opt) {
    const s = d && d.seats; if (!s || !opt || (!opt.settings && !opt.library)) return;
    try {
      if (opt.settings) {
        if (Array.isArray(s.list)) Store.raw.set('seats', s.list);
        Object.entries(s.owner || {}).forEach(([k, v]) => { if (v != null && v !== '') Store.raw.set(k, v); });
        if (s.filt && typeof s.filt === 'object') Store.raw.set('seatFilt', s.filt);
        if (typeof s.lock === 'boolean') Store.raw.set('setLockMain', s.lock);
      }
      Object.entries(s.ls || {}).forEach(([k, v]) => { if (/^mkc:seat:[a-z0-9]{4,16}:[A-Za-z0-9_]+$/.test(k) && typeof v === 'string') { const lib = /:(watchlist|progress|watched|lists|taste)$/.test(k); if ((lib && opt.library) || (!lib && opt.settings)) localStorage.setItem(k, v); } });
    } catch (e) { /* storage full: the main seat is restored */ }
  },
  async undo() {
    let u = null; try { u = JSON.parse(localStorage.getItem('mkc:restoreUndo') || 'null'); } catch (e) { u = null; }
    if (!u || !u.d) { toast('There is no restore to undo', 'info'); return; }
    await Cloner.restore(u.d, { settings: true, library: true, addons: true, proxy: true, css: true, keys: true, _undo: true });
    localStorage.removeItem('mkc:restoreUndo'); toast('Back to how it was before the restore', 'ok');
  },
  init() {
    const sec = secById('data');
    if (sec) { const rows = sec.rows; sec.rows = () => { const r = rows(), i = r.findIndex((x) => x.key === 'cloneFile');
      const add = [{ html: () => `<div class="set-row"><div><b>Backup PIN</b><small>With “Include my private keys” on, a PIN of 4 to 8 digits seals the keys inside the code or file. Restoring asks for it.</small></div><div class="set-ctl"><input class="inp mono" id="cl-pin" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="Optional" style="width:130px"></div></div>` }];
      let has = false; try { has = !!localStorage.getItem('mkc:restoreUndo'); } catch (e) { /* blocked */ }
      if (has) add.push({ key: 'restoreUndo', label: 'Undo the last restore', help: 'A copy of what the last restore replaced is kept on this device.', type: 'button', text: 'Undo restore', icon: 'undo-2', run: (b) => confirmTwice(b, () => this.undo()) });
      r.splice(i >= 0 ? i + 1 : r.length, 0, ...add); return r; }; }
  },
};
window.MkBackup = Backup;

const OwnFont = {
  CACHE: 'mkc-own-fonts', MAX: 5, loaded: new Set(),
  list() { const l = Store.raw.get('ownFonts', []); return Array.isArray(l) ? l.filter((x) => x && x.n) : []; },
  fam(n) { return `MkOwn ${String(n).replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 40)}`; },
  family(v) { if (!/^own:/.test(String(v || ''))) return ''; const n = String(v).slice(4); this.load(n); return `'${this.fam(n)}', 'Onest', sans-serif`; },
  async load(n) {
    if (this.loaded.has(n) || !window.caches || !window.FontFace) return; this.loaded.add(n);
    try { const c = await caches.open(this.CACHE), r = await c.match(`/__mkfont/${encodeURIComponent(n)}`); if (!r) return; const f = new FontFace(this.fam(n), await r.arrayBuffer()); await f.load(); document.fonts.add(f); } catch (e) { this.loaded.delete(n); }
  },
  pick() {
    if (this.list().length >= this.MAX) { toast('Five fonts is the most. Remove one first.', 'err'); return; }
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
    i.onchange = async () => {
      const f = i.files && i.files[0]; if (!f) return;
      if (f.size > 15e6) { toast('That font file is too big (15 MB at most)', 'err'); return; }
      const n = f.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[^A-Za-z0-9 _-]/g, ' ').trim().slice(0, 40) || 'My font';
      try {
        const buf = await f.arrayBuffer(); const ff = new FontFace(this.fam(n), buf); await ff.load(); document.fonts.add(ff); this.loaded.add(n);
        const c = await caches.open(this.CACHE); await c.put(`/__mkfont/${encodeURIComponent(n)}`, new Response(buf, { headers: { 'content-type': f.type || 'font/ttf' } }));
        Store.raw.set('ownFonts', [...this.list().filter((x) => x.n !== n), { n, at: Date.now() }]);
        setCfg('subFont', `own:${n}`); applyAll(); toast(`${n} is your subtitle font`, 'ok'); if (!$('#settings').hidden) renderSettingsBody();
      } catch (e) { toast('That file is not a font this device can read', 'err'); }
    };
    i.click();
  },
  async remove(n) {
    try { const c = await caches.open(this.CACHE); await c.delete(`/__mkfont/${encodeURIComponent(n)}`); } catch (e) { /* gone */ }
    Store.raw.set('ownFonts', this.list().filter((x) => x.n !== n));
    if (CFG.subFont === `own:${n}`) { setCfg('subFont', 'stream'); applyAll(); }
    if (!$('#settings').hidden) renderSettingsBody();
  },
  html() {
    const l = this.list();
    return `<div class="set-row"><div><b>Your own fonts</b><small>Add a .ttf, .otf or .woff font (up to five) and use it for subtitles in the MKCinema player. Kept on this device.</small>
      ${l.length ? `<div class="own-fonts">${l.map((x) => `<span class="own-f"><button type="button" class="chip${CFG.subFont === `own:${x.n}` ? ' on' : ''}" data-nav data-ofp="${esc(x.n)}" style="font-family:'${esc(this.fam(x.n))}'">${esc(x.n)}</button><button type="button" class="ibtn" data-nav data-ofr="${esc(x.n)}" aria-label="Remove ${esc(x.n)}"><i data-lucide="x"></i></button></span>`).join('')}</div>` : ''}</div>
      <div class="set-ctl"><button class="btn btn-ghost btn-sm" type="button" data-nav id="ownFontAdd"><i data-lucide="type"></i>Add a font</button></div></div>`;
  },
  bind() {
    const a = $('#ownFontAdd'); if (a) a.onclick = () => this.pick();
    $$('[data-ofp]').forEach((x) => { this.load(x.dataset.ofp); x.onclick = () => { setCfg('subFont', `own:${x.dataset.ofp}`); applyAll(); renderSettingsBody(); }; });
    $$('[data-ofr]').forEach((x) => { x.onclick = () => this.remove(x.dataset.ofr); });
  },
  init() {
    const sec = secById('subtitles') || secById('subs');
    if (sec) { const rows = sec.rows; sec.rows = () => { const r = rows(), i = r.findIndex((x) => x.key === 'subFont'); r.splice(i >= 0 ? i + 1 : r.length, 0, { html: () => this.html() }); return r; };
      const bind = sec.bind; sec.bind = function () { const v = bind ? bind.apply(this, arguments) : undefined; OwnFont.bind(); return v; }; }
    if (/^own:/.test(String(CFG.subFont || ''))) { try { applyAll(); } catch (e) { /* later */ } }
  },
};
window.MkOwnFont = OwnFont;
AutoSetup.init(); Backup.init(); OwnFont.init();
/* ---------------- 2.99 Sound to a receiver (Android app 1.17.19+) ----------------
   Settings › Playback › Sound to a receiver: pick which surround formats leave the box untouched, so the receiver or
   soundbar decodes Dolby and DTS itself (Atmos rides inside Dolby Digital Plus and TrueHD). "Check my receiver" reads
   what the HDMI connection says it takes and offers to turn just those on. Nothing changes until the viewer picks:
   CFG.audioRx stays unset and the app plays sound the way it always has. Each film then says once how its sound
   leaves the box (sent to the receiver, or decoded here). */
const AudioRx = {
  F: [['ac3', 'Dolby Digital'], ['eac3', 'Dolby Digital Plus and Atmos'], ['dts', 'DTS'], ['dts-hd', 'DTS-HD Master Audio'], ['truehd', 'Dolby TrueHD and Atmos']],
  name(k) { const f = this.F.find((x) => x[0] === k); return f ? f[1] : k; },
  can() { try { return !!(window.MKAndroid && typeof MKAndroid.audioCaps === 'function'); } catch (e) { return false; } },
  on() { return Array.isArray(CFG.audioRx) ? CFG.audioRx.filter((k) => this.F.some((f) => f[0] === k)) : null; },
  /* what goes with a film to the app: nothing until the viewer has chosen */
  open() { const l = this.can() ? this.on() : null; return l ? { spdif: l.join(',') } : {}; },
  caps() { try { return JSON.parse(MKAndroid.audioCaps() || '{}') || {}; } catch (e) { return {}; } },
  set(k, v) {
    const l = new Set(this.on() || []); if (v) l.add(k); else l.delete(k);
    if (k === 'dts-hd' && v) l.add('dts');
    setCfg('audioRx', this.F.map((f) => f[0]).filter((x) => l.has(x)));
    if (MkNative.active && MkNative.bridge() && MkNative.bridge().droid) MkNative.cmd('spdif', this.on().join(',')).catch(() => {});
    toast('Applies from the next film', 'info', 2400);
  },
  async check() {
    const c = this.caps(), got = (c.enc || []).filter((k) => this.F.some((f) => f[0] === k));
    if (!c.hdmi) { toast('No receiver or soundbar found on HDMI. Sound is decoded here.', 'info', 4200); return; }
    if (!got.length) { toast('The HDMI connection only takes plain sound (PCM), so it is decoded here.', 'info', 4800); return; }
    const ok = await Gate.ask({ icon: 'speaker', eyebrow: 'Sound to a receiver', title: 'Your receiver takes these',
      html: `${got.map((k) => esc(this.name(k))).join(' · ')}${c.ch ? `<br>Up to ${esc(String(c.ch))} channels` : ''}`, yes: 'Send these untouched', no: 'Not now', timeout: 30000 });
    if (ok) { setCfg('audioRx', this.F.map((f) => f[0]).filter((x) => got.includes(x))); toast('Applies from the next film', 'info', 2400); if (typeof renderSettings === 'function' && $('#settings') && !$('#settings').hidden) try { renderSettings(); } catch (e) { /* ignore */ } }
  },
  /* mpv's audio-out-params/format: "spdif-eac3" when it leaves untouched, a PCM format ("s16", "floatp") when decoded */
  said: '',
  news(f) {
    f = String(f || ''); if (!f || f === this.said) return; this.said = f;
    if (!this.on() || !this.on().length) return;
    const m = /^spdif-(\w+)/.exec(f), k = m ? ({ ac3: 'ac3', eac3: 'eac3', dts: 'dts', dtshd: 'dts-hd', truehd: 'truehd' }[m[1]] || m[1]) : '';
    toast(k ? `Sound goes to your receiver untouched (${this.name(k)})` : 'This film’s sound is decoded here and sent as plain sound', 'info', 3600, 'audiorx');
  },
  rows() {
    if (!this.can()) return [];
    const l = this.on() || [];
    return [{ group: 'Sound to a receiver' },
      { key: 'audioRxCheck', label: 'Check my receiver', help: 'Reads what your receiver or soundbar says it takes over HDMI, and offers to send just those untouched.', type: 'button', text: 'Check', icon: 'speaker', run: () => this.check() },
      ...this.F.map(([k, n]) => ({ key: `audioRx_${k}`, label: n, help: 'Sent untouched, so your receiver decodes it. Off: decoded here and sent as plain sound.', type: 'toggle', get: () => l.includes(k), set: (v) => this.set(k, v) }))];
  },
  init() {
    const pb = secById('playback');
    if (pb) { const rows = pb.rows; pb.rows = () => [...rows(), ...this.rows()]; }
  },
};
AudioRx.init();
window.MkAudioRx = AudioRx;
