
'use strict';
/* =====================================================================
   2.68 · Household plus
   Your cloud (files already in your debrid account), one-press setup links, Home folders, episode shuffle,
   titles and trailers in your language, chapters, subtitle memory, forced and SDH subtitle rules, a subtitle
   start choice, a compact source list, seat pictures from a link and copying a seat's choices.
   Changes to existing behaviour live in the functions they change; this block only holds the new parts.
   ===================================================================== */

/* ---------------- Subtitles: memory per title, SDH, forced tracks, waiting for your language ---------------- */
const SubMem = {
  KEY: 'subMem', MAX: 400,
  all() { return Store.get(this.KEY, {}); },
  id() { const c = P.ctx; return c && c.meta && c.meta.id ? String(c.meta.id) : ''; },
  get() { if (CFG.subMemory === false) return null; const id = this.id(); return id ? this.all()[id] || null : null; },
  /* the viewer picked a subtitle by hand: remember its language (or "off") for the whole film or series */
  save(i) {
    if (CFG.subMemory === false) return; const id = this.id(); if (!id) return;
    const s = i >= 0 && P.subs ? P.subs[i] : null;
    if (s && (s._mkv && s._mkv.forced)) return; // a forced track is not a choice of language
    const all = this.all(); delete all[id];
    all[id] = s ? { lang: String(s.lang || ''), sdh: SubSdh.is(s), at: Date.now() } : { off: true, at: Date.now() };
    const ks = Object.keys(all); if (ks.length > this.MAX) ks.slice(0, ks.length - this.MAX).forEach((k) => delete all[k]);
    Store.set(this.KEY, all);
  },
  /* true when the memory says what to do, so the house rules stay out of it */
  apply() {
    const m = this.get(); if (!m) return false;
    if (m.off) { SubForced.pick(); return true; }
    const want = langName(m.lang);
    const cand = SubRank.order(P.subs || []).filter(([s]) => langName(s.lang) === want && !(s._mkv && s._mkv.forced) && (m.sdh || !SubSdh.hide() || !SubSdh.is(s)));
    if (!cand.length) return false;
    const [s, i] = cand[0]; if (P.curSub === i) return true;
    const cur = P.subs[P.curSub]; if (cur && cur.kind === 'mkv' && langName(cur.lang) === want && s.kind !== 'mkv') return true;
    selectSub(i, { auto: true }); return true;
  },
};
const SubSdh = {
  RE: /\b(sdh|hearing[ -]?impaired|for the deaf|closed captions?|\[cc\]|\bcc\b)\b/i,
  hide() { return CFG.hideSDH === true; },
  is(s) {
    if (!s) return false;
    if (s.hi === true || s.hearingImpaired === true || s.hearing_impaired === true) return true;
    const t = [s._label, s.label, s.name, s.title, s.fileName, s.subtitleFileName, s.releaseName, s._mkv && s._mkv.name].filter((x) => typeof x === 'string').join(' ');
    return this.RE.test(t) || /[._ -]hi[._ -]/i.test(` ${s.fileName || s.subtitleFileName || ''} `);
  },
};
/* Forced tracks only carry the lines in another language (signs, a scene in French). They come on by themselves
   when no full subtitle is showing, in the language you listen in when the file says which. */
const SubForced = {
  on() { return CFG.forcedSubs !== false; },
  is(s) { return !!(s && ((s._mkv && s._mkv.forced) || s.forced === true || /\bforced\b/i.test(`${s._label || ''} ${s.fileName || ''} ${s.name || ''}`))); },
  pick() {
    if (!this.on() || !P.subs || P.subUserChoice) return false;
    const cur = P.subs[P.curSub]; if (cur && !this.is(cur)) return false;
    const audio = (() => { try { return String(CFG.audioOnly || '').toLowerCase(); } catch (e) { return ''; } })();
    const list = P.subs.map((s, i) => [s, i]).filter(([s]) => this.is(s));
    if (!list.length) return false;
    const mine = list.find(([s]) => audio && audio !== 'any' && langName(s.lang) === langName(audio)) || list.find(([s]) => s._mkv && s._mkv.def) || list[0];
    if (P.curSub === mine[1]) return true;
    selectSub(mine[1], { auto: true }); return true;
  },
};
/* Settings › Subtitles › When a film starts: right away, or wait up to 4 seconds for subtitles in your language */
const SubWait = {
  go(start) {
    if (CFG.subWait !== 'lang' || !CFG.subLang || CFG.subLang === 'off' || !P.subsLoading || (P.stream && P.stream._local)) { start(); return; }
    const t0 = Date.now(), st = P.stream;
    Loader.show(P.ctx && P.ctx.meta);
    const tick = () => {
      if (P.stream !== st) return;
      if (!P.subsLoading || Date.now() - t0 > 4000) { Loader.hide(); start(); return; }
      setTimeout(tick, 150);
    };
    tick();
  },
};
window.MkSubWait = SubWait;

/* ---------------- Chapters ---------------- */
const Chapters = {
  list() { const m = typeof Marks !== 'undefined' && Marks.live ? Marks.live() : null; const l = m && m.all; return Array.isArray(l) ? l.filter((c) => c && isFinite(c.s)) : []; },
  html() {
    const l = this.list(); if (l.length < 2) return '';
    const t = pNow(); let cur = -1; l.forEach((c, i) => { if (t >= c.s - 0.5) cur = i; });
    return `<h5>Chapters</h5><div class="mk-chaps">${l.slice(0, 99).map((c, i) => `<button type="button" class="${i === cur ? 'on' : ''}" data-chap="${c.s}"><i data-lucide="bookmark"></i><span class="tnum">${fmtTime(c.s)}</span><b translate="no">${esc(String(c.name || '').trim() || `Chapter ${i + 1}`)}</b></button>`).join('')}</div>`;
  },
  bind(m) { $$('[data-chap]', m).forEach((b) => b.addEventListener('click', () => { pSeek(Number(b.dataset.chap), { user: true }); m.hidden = true; toast(b.querySelector('b').textContent, 'info', 1400); })); },
};

/* ---------------- Episode shuffle ---------------- */
const Shuffle = {
  id: '', picks: new Map(),
  pool(meta) {
    const now = Date.now();
    return orderedEpisodes(meta).filter((v) => { const d = Date.parse(v.released || v.firstAired || ''); return !(d > now); });
  },
  hist() { return Store.get('shuffleHist', []); },
  pick(meta, not) {
    const pool = this.pool(meta); if (!pool.length) return null;
    const h = new Set(this.hist()), fresh = pool.filter((v) => v.id !== (not && not.id) && !h.has(videoIdFor(meta, v)));
    const from = fresh.length ? fresh : pool.filter((v) => v.id !== (not && not.id));
    const v = (from.length ? from : pool)[Math.floor(Math.random() * (from.length || pool.length))];
    Store.set('shuffleHist', [videoIdFor(meta, v), ...this.hist()].slice(0, Math.max(10, Math.min(200, Math.floor(pool.length * 0.6)))));
    return v;
  },
  /* while shuffle is on for a series, "next episode" is another random one (the same one every time it is asked) */
  next(meta, video) {
    if (!video) return null;
    if (!this.picks.has(video.id)) this.picks.set(video.id, this.pick(meta, video));
    return this.picks.get(video.id);
  },
  on(meta) { return !!(meta && this.id && this.id === meta.id); },
  async start(meta) {
    const v = this.pick(meta); if (!v) { toast('This series lists no episodes yet', 'err'); return; }
    this.id = meta.id; this.picks.clear();
    D.video = v; D.season = Number(v.season); renderDetail(false);
    toast(`Shuffle · S${v.season} · E${v.episode}`, 'info', 2200);
    smartPlayDetail();
  },
  stop() { this.id = ''; this.picks.clear(); },
};
window.MkShuffle = Shuffle;

/* ---------------- Title logos and trailers in your language ---------------- */
const LangArt = {
  mem: new Map(), wait: new Map(), TTL: 7 * 86400e3,
  base() { try { return String(People.lang() || 'en').split('-')[0].toLowerCase(); } catch (e) { return 'en'; } },
  wants() { return this.base() !== 'en'; },
  tt(m) { const id = String((m && (m.imdb_id || m.id)) || '').split(':')[0]; return /^tt\d{5,10}$/.test(id) ? id : null; },
  store() {
    if (!this.loaded) { this.loaded = true; const raw = Store.raw.get('langArt', {}), now = Date.now(); Object.entries(raw || {}).forEach(([k, v]) => { if (v && now - v.at < this.TTL) this.mem.set(k, v); }); }
    return this.mem;
  },
  save() { clearTimeout(this.st); this.st = setTimeout(() => { const m = this.store(); while (m.size > 400) m.delete(m.keys().next().value); Store.raw.set('langArt', Object.fromEntries(m)); }, 800); },
  peek(m) { if (!this.wants()) return null; const tt = this.tt(m); return tt ? this.store().get(`${this.base()}|${tt}`) || null : null; },
  /* a logo in the interface language, only once it has been looked up (metaLogo stays synchronous) */
  logo(m) { const v = this.peek(m); return v && v.logo ? `https://image.tmdb.org/t/p/w500${v.logo}` : ''; },
  async get(m) {
    if (!this.wants()) return null; const tt = this.tt(m); if (!tt) return null;
    const k = `${this.base()}|${tt}`, hit = this.store().get(k); if (hit) return hit;
    if (this.wait.has(k)) return this.wait.get(k);
    const lang = this.base();
    const p = (async () => {
      let out = { logo: '', yt: '', at: Date.now() };
      if (TMDB.key()) {
        const f = await TMDB.find(tt); const mv = f && (f.movie_results || [])[0], tv = f && (f.tv_results || [])[0], h = mv || tv;
        if (h) {
          const kind = mv ? 'movie' : 'tv';
          const [im, vids] = await Promise.all([TMDB.get(`${kind}/${h.id}/images`, { include_image_language: `${lang},null` }).catch(() => null), TMDB.get(`${kind}/${h.id}/videos`, { language: lang }).catch(() => null)]);
          const lg = ((im && im.logos) || []).filter((l) => l.iso_639_1 === lang && !/\.svg$/i.test(l.file_path)).sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))[0];
          const yt = ((vids && vids.results) || []).filter((v) => v.site === 'YouTube' && /^(Trailer|Teaser)$/.test(v.type) && /^[\w-]{11}$/.test(v.key)).sort((a, b) => (a.type === 'Trailer' ? 0 : 1) - (b.type === 'Trailer' ? 0 : 1))[0];
          out = { logo: (lg && lg.file_path) || '', yt: (yt && yt.key) || '', at: Date.now() };
        }
      } else {
        const c = (typeof Account !== 'undefined' && Account.config && Account.config()) || {}; if (!c.url) return null;
        const r = await netFetch(`${String(c.url).replace(/\/+$/, '')}/functions/v1/tmdb-person?a=local&tt=${tt}&lang=${encodeURIComponent(People.lang())}`, { headers: { apikey: c.anonKey || '', accept: 'application/json' } }, 8000);
        if (!r.ok) return null; // an older relay without this lookup: keep the English art
        const j = await r.json(); out = { logo: String(j.logo || ''), yt: /^[\w-]{11}$/.test(j.yt || '') ? j.yt : '', at: Date.now() };
      }
      this.store().set(k, out); this.save(); return out;
    })().catch(() => null).finally(() => this.wait.delete(k));
    this.wait.set(k, p); return p;
  },
  /* the open title page swaps its logo when a local one arrives */
  async detail(m) {
    const v = await this.get(m); if (!v || !v.logo || !D.meta || D.meta.id !== m.id) return;
    const url = `https://image.tmdb.org/t/p/w500${v.logo}`, im = $('#detailPanel .hero-logo'); if (!im || im.getAttribute('src') === url) return;
    const pre = new Image(); pre.referrerPolicy = 'no-referrer'; pre.onload = () => { if (D.meta && D.meta.id === m.id && im.isConnected) { im.src = url; im.dataset.osrc = url; } }; pre.src = url;
  },
  async trailer(m) { if (!this.wants()) return ''; const v = await Promise.race([this.get(m), new Promise((r) => setTimeout(() => r(null), 2500))]); return (v && v.yt) || ''; },
};
window.MkLangArt = LangArt;

/* ---------------- Keep your place on Home ---------------- */
const HomePlace = {
  y: 0, rk: '', id: '',
  leave() {
    this.y = scrollY || 0; this.rk = ''; this.id = '';
    const a = document.activeElement, card = a && a.closest && a.closest('#homeRows [data-card]');
    if (card) { const sec = card.closest('section.row'); this.rk = sec ? sec.dataset.arrK || sec.dataset.rk || sec.id || '' : ''; this.id = card.dataset.id || ''; }
  },
  back() {
    const y = this.y, rk = this.rk, id = this.id;
    requestAnimationFrame(() => {
      if (S.view !== 'home') return;
      scrollTo({ top: y, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
      if (!IS_TV || !id) return;
      const secs = $$('#homeRows section.row'), sec = secs.find((s) => (s.dataset.arrK || s.dataset.rk || s.id || '') === rk);
      const card = (sec || document).querySelector(`[data-card][data-id="${CSS.escape(id)}"]`);
      if (card) try { Nav.focus(card, true); } catch (e) { /* older build */ }
    });
  },
};
window.MkHomePlace = HomePlace;

/* ---------------- Your cloud: what is already in your debrid account ---------------- */
const MyCloud = {
  items: [], svc: '', q: '', busy: false, err: '',
  H() { return { Authorization: `Bearer ${Vault.cfg()[this.svc]}` }; },
  key() { return Vault.cfg()[this.svc]; },
  async list() {
    const k = this.svc = Vault.service(); if (!k) return [];
    const key = this.key();
    if (k === 'rd') {
      const out = [];
      for (let page = 1; page <= 3; page++) {
        const l = await Vault.call(`https://api.real-debrid.com/rest/1.0/torrents?limit=100&page=${page}`, { headers: this.H() }).catch((e) => { if (page === 1) throw e; return []; });
        const arr = Array.isArray(l) ? l : []; arr.forEach((t) => { if (t.status === 'downloaded') out.push({ id: String(t.id), name: t.filename, size: t.bytes, at: t.added }); });
        if (arr.length < 100) break;
      }
      return out;
    }
    if (k === 'tb') {
      const l = await Vault.call('https://api.torbox.app/v1/api/torrents/mylist?bypass_cache=true', { headers: this.H() });
      return (Array.isArray(l.data) ? l.data : []).filter((t) => t.download_finished || t.download_present).map((t) => ({ id: String(t.id), name: t.name, size: t.size, at: t.created_at, files: (t.files || []).map((f) => ({ id: f.id, name: f.short_name || f.name, size: f.size })) }));
    }
    if (k === 'ad') {
      const q = `agent=mkcinema&apikey=${encodeURIComponent(key)}`;
      let st; try { st = await Vault.call(`https://api.alldebrid.com/v4.1/magnet/status?${q}`, { method: 'POST', body: Vault.form({ status: 'ready' }) }); } catch (e) { st = await Vault.call(`https://api.alldebrid.com/v4/magnet/status?${q}&status=ready`); }
      const mg = (st.data || {}).magnets; const arr = Array.isArray(mg) ? mg : mg ? Object.values(mg) : [];
      return arr.filter((m) => m.statusCode === 4).map((m) => ({ id: String(m.id), name: m.filename, size: m.size, at: m.completionDate ? new Date(m.completionDate * 1000).toISOString() : '' }));
    }
    if (k === 'pm') {
      const l = await Vault.call(`https://www.premiumize.me/api/item/listall?apikey=${encodeURIComponent(key)}`);
      return (l.files || []).filter((f) => VIDEO_EXT.test(f.name || '')).map((f) => ({ id: String(f.id), name: f.name, size: f.size, at: f.created_at ? new Date(f.created_at * 1000).toISOString() : '', files: [{ id: f.id, name: f.name, size: f.size, link: f.stream_link && /\.mp4(\?|$)/i.test(f.stream_link) ? f.stream_link : f.link }] }));
    }
    return [];
  },
  /* the video files inside one item, with what is needed to play each */
  async files(it) {
    const k = this.svc, key = this.key();
    if (it.files && k !== 'tb') return it.files;
    if (k === 'rd') {
      const info = await Vault.call(`https://api.real-debrid.com/rest/1.0/torrents/info/${it.id}`, { headers: this.H() });
      const sel = (info.files || []).filter((f) => f.selected);
      return sel.map((f, i) => ({ id: f.id, name: String(f.path || '').replace(/^\//, ''), size: f.bytes, link: (info.links || [])[i] })).filter((f) => f.link && VIDEO_EXT.test(f.name));
    }
    if (k === 'tb') return (it.files || []).filter((f) => VIDEO_EXT.test(f.name || ''));
    if (k === 'ad') {
      const q = `agent=mkcinema&apikey=${encodeURIComponent(key)}`;
      const r = await Vault.call(`https://api.alldebrid.com/v4/magnet/files?${q}&id[]=${it.id}`);
      const flat = []; const walk = (arr, p = '') => (arr || []).forEach((x) => { if (x.e) walk(x.e, `${p}${x.n}/`); else flat.push({ name: x.filename || `${p}${x.n}`, size: x.size || x.s, link: x.link || x.l }); });
      walk((((r.data || {}).magnets || [])[0] || {}).files);
      return flat.filter((f) => f.link && VIDEO_EXT.test(f.name));
    }
    return [];
  },
  async url(it, f) {
    const k = this.svc, key = this.key();
    if (k === 'rd') { const un = await Vault.call('https://api.real-debrid.com/rest/1.0/unrestrict/link', { method: 'POST', headers: this.H(), body: Vault.form({ link: f.link }) }); return { url: un.download, rd: un.id ? String(un.id) : '' }; }
    if (k === 'tb') { const dl = await Vault.call(`https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(key)}&torrent_id=${it.id}&file_id=${f.id}&redirect=false`, { headers: this.H() }); return { url: dl.data, tb: { id: it.id, fileId: f.id } }; }
    if (k === 'ad') { const un = await Vault.call(`https://api.alldebrid.com/v4/link/unlock?agent=mkcinema&apikey=${encodeURIComponent(key)}&link=${encodeURIComponent(f.link)}`); return { url: un.data && un.data.link }; }
    if (k === 'pm') return { url: f.link };
    throw new Error('No debrid service is set up');
  },
  async play(it, f) {
    toast('Getting the file from your cloud…', 'info', 2600, 'cloud');
    try {
      const u = await Vault.within(this.url(it, f), 30000); if (!u || !u.url) throw new Error('Your service did not give a link');
      const name = String(f.name || it.name).split('/').pop();
      const meta = { id: `cloud:${this.svc}:${it.id}:${f.id != null ? f.id : 0}`, type: 'movie', name: name.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' '), description: `${f.size ? fmtBytes(f.size) : ''} · from your ${Vault.label(this.svc)} cloud` };
      const stream = { name: 'Your cloud', title: `${name}${f.size ? `\n${fmtBytes(f.size)}` : ''}`, url: u.url, _addon: 'Your cloud', behaviorHints: { filename: name, videoSize: f.size || undefined } };
      if (u.rd) stream._rd = u.rd; if (u.tb) stream._tb = u.tb;
      stream._tel = Telemetry.parse(stream);
      X8.close('myCloud');
      playStream({ meta, video: null, streams: [stream] }, stream, { startAt: 0 });
    } catch (e) { toast(`Could not play it: ${e.message}`, 'err', 6000); }
  },
  async open() {
    if (!Vault.service()) { toast('Add a debrid key in Settings › Debrid first', 'err', 4200); openSettings('debrid'); return; }
    X8.layer('myCloud', { label: 'Your cloud', icon: 'cloud', eyebrow: 'Your cloud', wide: true });
    X8.open('myCloud'); this.q = ''; this.render(true);
    this.busy = true; this.err = '';
    try { this.items = (await Vault.within(this.list(), 30000)).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))); }
    catch (e) { this.items = []; this.err = e.message || String(e); }
    this.busy = false; this.render();
  },
  render(loading) {
    const b = X8.body('myCloud'); if (!b) return;
    const q = this.q.trim().toLowerCase(), list = this.items.filter((it) => !q || String(it.name || '').toLowerCase().includes(q)).slice(0, 300);
    b.innerHTML = `<h2 class="x8-h">Your cloud</h2><p class="sub">Films and episodes already in your ${esc(Vault.label() || 'debrid')} account. Pick one to play it here.</p>
      <input class="inp mk-cl-q" id="mkClQ" type="search" placeholder="Search your cloud" value="${esc(this.q)}" autocomplete="off" aria-label="Search your cloud">
      <div class="mk-cl-list" id="mkClList">${loading || this.busy ? '<div class="status-line" style="padding:18px"><span class="spin"></span>Reading your cloud…</div>'
        : this.err ? `<div class="empty-state"><i data-lucide="cloud-off"></i><h3>Your cloud did not open</h3><p>${esc(this.err)}</p></div>`
        : list.length ? list.map((it, i) => `<button type="button" class="mk-cl-it" data-nav data-cl="${esc(it.id)}"><i data-lucide="film"></i><span><b translate="no">${esc(it.name || 'Untitled')}</b><small>${[it.size ? fmtBytes(it.size) : '', it.at ? fmtDate(it.at) : ''].filter(Boolean).join(' · ')}</small></span></button>`).join('')
        : `<div class="empty-state"><i data-lucide="cloud"></i><h3>${q ? 'Nothing matches that' : 'Your cloud is empty'}</h3><p>${q ? 'Try another word.' : 'Files you add to your debrid account show up here.'}</p></div>`}</div>`;
    icons();
    const inp = $('#mkClQ', b);
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    inp.addEventListener('input', () => { this.q = inp.value; clearTimeout(this.qt); this.qt = setTimeout(() => { const pos = inp.selectionStart; this.render(); const n = $('#mkClQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* fine */ } } }, 220); });
    if (typeof TvType !== 'undefined' && IS_TV) TvType.guard(inp);
    $$('[data-cl]', b).forEach((x) => x.addEventListener('click', () => this.pick(this.items.find((it) => it.id === x.dataset.cl))));
    if (IS_TV) { const f = $('[data-cl]', b) || inp; Nav.focus(f, true); }
  },
  async pick(it) {
    if (!it) return;
    let files; try { files = await Vault.within(this.files(it), 20000); } catch (e) { toast(`Could not open it: ${e.message}`, 'err', 5000); return; }
    if (!files.length) { toast('No video file in that one', 'err'); return; }
    if (files.length === 1) { this.play(it, files[0]); return; }
    const b = X8.body('myCloud');
    const sorted = files.slice().sort((a, c) => String(a.name).localeCompare(String(c.name), undefined, { numeric: true }));
    $('#mkClList', b).innerHTML = `<button type="button" class="mk-cl-it back" data-nav id="mkClBack"><i data-lucide="chevron-left"></i><span><b>Back to your cloud</b></span></button>${sorted.map((f, i) => `<button type="button" class="mk-cl-it" data-nav data-clf="${i}"><i data-lucide="play"></i><span><b translate="no">${esc(String(f.name).split('/').pop())}</b><small>${f.size ? fmtBytes(f.size) : ''}</small></span></button>`).join('')}`;
    icons();
    $('#mkClBack', b).onclick = () => this.render();
    $$('[data-clf]', b).forEach((x) => x.addEventListener('click', () => this.play(it, sorted[Number(x.dataset.clf)])));
    if (IS_TV) Nav.focus($('[data-clf]', b), true);
  },
  /* Library gets a button while a debrid key is saved */
  libRow(root) {
    if (!Vault.service() || !root) return;
    const w = document.createElement('div'); w.className = 'mk-cl-lib';
    w.innerHTML = `<button class="btn btn-ghost btn-sm" type="button" data-nav><i data-lucide="cloud"></i>Your cloud</button>`;
    root.prepend(w); $('button', w).onclick = () => this.open();
  },
};
window.MkCloud = MyCloud;

/* ---------------- Setup links: one press installs a whole setup ----------------
   https://app.mkcinema.app/#setup=<base64url JSON>  or  #setup-url=<https link to that JSON>
   { "name": "Weekend setup", "addons": ["https://…/manifest.json", …] }
   Addons are added, never removed, and nothing changes until the person says yes. Keys and the proxy are never taken. */
const SetupLink = {
  MAX: 40,
  make(addons, name) { return `${PUBLIC_ORIGIN || location.origin}/#setup=${X8.b64e({ v: 1, name: name || '', addons })}`; },
  async read(h) {
    if (h.startsWith('setup=')) return X8.b64d(h.slice(6));
    const u = decodeURIComponent(h.slice(10)); if (!/^https:\/\/[^\s"'<>]+$/i.test(u)) throw new Error('That setup link is not a secure https address');
    const r = await fetchT(u, { cache: 'no-store' }, 10000); if (!r.ok) throw new Error(`The setup file did not load (HTTP ${r.status})`);
    return r.json();
  },
  clean(d) {
    const norm = (u) => { try { return StremioEngine.normalize(typeof u === 'string' ? u : (u && (u.url || u.manifest || u.transportUrl)) || ''); } catch (e) { return null; } };
    const addons = [...new Set((Array.isArray(d && d.addons) ? d.addons : []).map(norm).filter((u) => u && /^https:\/\//i.test(u)))].slice(0, this.MAX);
    return { name: String((d && d.name) || '').replace(/[<>]/g, '').slice(0, 60), addons };
  },
  async handle(h) {
    history.replaceState(null, '', location.pathname);
    if (typeof Seats !== 'undefined' && Seats.kids()) { toast('Not on the kids seat', 'err', 2600, 'kids'); return; }
    let d; try { d = this.clean(await this.read(h)); } catch (e) { toast(`That setup link did not open: ${e.message}`, 'err', 6000); return; }
    const have = new Set(engine.addons.map((a) => a.baseUrl)), add = d.addons.filter((u) => !have.has(u));
    if (!d.addons.length) { toast('That setup link has no addons in it', 'err'); return; }
    if (!add.length) { toast('You already have every addon in that setup', 'ok'); return; }
    const host = (u) => { try { return new URL(u).host; } catch (e) { return u.slice(0, 50); } };
    const ok = await Gate.ask({ icon: 'package-plus', eyebrow: 'Setup link', title: d.name ? `Add “${d.name}”?` : `Add ${add.length} addon${add.length === 1 ? '' : 's'}?`, yes: 'Add them', no: 'Not now',
      html: `A link wants to add ${add.length} addon${add.length === 1 ? '' : 's'}: <b>${add.slice(0, 6).map((u) => esc(host(u))).join(', ')}${add.length > 6 ? '…' : ''}</b>. Nothing you have is removed or changed. Add them only if you trust whoever made the link.` });
    if (ok !== true) return;
    let n = 0, bad = 0;
    for (const u of add) { try { await engine.install(u, { silent: true }); n++; } catch (e) { bad++; } }
    engine.emit('addons'); try { Account.schedule(); } catch (e) { /* signed out */ }
    if (S.view === 'home') renderHome();
    toast(`${n} addon${n === 1 ? '' : 's'} added${bad ? `, ${bad} did not answer` : ''}`, n ? 'ok' : 'err', 5000);
  },
  /* Addons › Share my setup: a link with your addon list (links that hold a key are left out) */
  share() {
    const list = engine.addons.filter((a) => !a.builtin && !a.virtual && !a.studio && a.enabled).map((a) => a.baseUrl);
    const safe = list.filter((u) => !(typeof keyedAddon === 'function' && keyedAddon(u)));
    if (!safe.length) { toast('You have no addons to share yet', 'err'); return; }
    const left = list.length - safe.length;
    copyText(this.make(safe.map((u) => `${u}/manifest.json`)), left ? `Setup link copied. ${left} addon${left === 1 ? '' : 's'} with your own key left out` : 'Setup link copied', 6000);
  },
};
window.MkSetupLink = SetupLink;

/* ---------------- Home folders ---------------- */
const Folders = {
  get() { const a = Arrange.get(); return a.folders && typeof a.folders === 'object' ? a.folders : {}; },
  of(k) { const f = this.get(); return Object.keys(f).find((id) => (f[id].keys || []).includes(k)) || ''; },
  save(folders) { const a = Arrange.get(); a.folders = folders; Arrange.save(a); },
  put(k, fid, name) {
    const f = { ...this.get() };
    Object.keys(f).forEach((id) => { f[id] = { ...f[id], keys: (f[id].keys || []).filter((x) => x !== k) }; });
    if (fid === 'new') { fid = `f${Date.now().toString(36)}`; f[fid] = { name: String(name || 'Folder').slice(0, 30), keys: [] }; }
    if (fid && f[fid]) f[fid].keys.push(k);
    Object.keys(f).forEach((id) => { if (!f[id].keys.length) delete f[id]; });
    this.save(f);
  },
  /* the row of folder tiles at the top of Home; rows inside a folder stay off the page until it is opened */
  paint() {
    const rows = $('#homeRows'); if (!rows) return;
    const f = this.get(), ids = Object.keys(f);
    let sec = $('#mkFolders');
    if (!ids.length) { if (sec) sec.remove(); return; }
    if (!sec) {
      sec = document.createElement('section'); sec.className = 'row mk-fold-row'; sec.id = 'mkFolders'; sec.dataset.rk = 'folders';
      sec.innerHTML = '<div class="row-head"><h2 class="row-title">Folders</h2></div><div class="rail"></div>';
      const cw = $('#cwRow', rows); if (cw) cw.after(sec); else rows.prepend(sec);
    }
    const art = (keys) => { for (const k of keys) { const s = $$('#homeRows section.row').find((x) => x.dataset.arrK === k); const im = s && s.querySelector('.card img:not([data-fb="1"])'); if (im) return im.dataset.lsrc || im.getAttribute('src'); } return ''; };
    const html = ids.map((id) => { const a = art(f[id].keys); return `<button type="button" class="card wide mk-fold" data-nav data-fold="${esc(id)}" aria-label="${esc(f[id].name)}"><div class="card-inner"><div class="layer l0">${a ? `<img src="${esc(a)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</div><div class="mk-fold-t"><i data-lucide="folder"></i><b translate="no">${esc(f[id].name)}</b></div></div></button>`; }).join('');
    const rail = $('.rail', sec); if (rail.dataset.h !== html) { rail.dataset.h = html; rail.innerHTML = html; icons(); $$('[data-fold]', rail).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); this.open(b.dataset.fold); }; }); }
  },
  open(fid) {
    const f = this.get()[fid]; if (!f) return;
    const el = X8.layer('mkFold', { label: 'Folder', icon: 'folder', eyebrow: 'Folder', wide: true }); el.classList.add('mk-fold-ov');
    const b = X8.body('mkFold'); b.innerHTML = `<h2 class="x8-h" translate="no">${esc(f.name)}</h2><div class="mk-fold-rows"></div>`;
    const box = $('.mk-fold-rows', b), rows = $('#homeRows');
    const secs = (f.keys || []).map((k) => $$('#homeRows section.row').find((x) => x.dataset.arrK === k)).filter(Boolean);
    if (!secs.length) box.innerHTML = '<p class="tour-note">These rows have not loaded yet. Try again in a moment.</p>';
    this.moved = secs.map((s) => { const mark = document.createComment('mk-fold'); s.before(mark); s.classList.add('mk-in-fold-open'); box.appendChild(s); return [s, mark]; });
    X8.onClose.mkFold = () => { (this.moved || []).forEach(([s, mark]) => { s.classList.remove('mk-in-fold-open'); if (mark.isConnected) { mark.replaceWith(s); } else if (rows) rows.appendChild(s); }); this.moved = []; Arrange.apply(true); };
    X8.open('mkFold'); icons(); queueWall();
    if (IS_TV) setTimeout(() => { const c = $('#mkFold [data-card]'); if (c) Nav.focus(c, true); }, 60);
  },
  /* a folder travels as a short code: its name and the rows in it */
  code(fid) { const f = this.get()[fid]; return f ? `mkfold:${X8.b64e({ v: 1, name: f.name, keys: f.keys })}` : ''; },
  importCode(text) {
    const m = String(text || '').trim().match(/mkfold:([\w-]+)/); if (!m) { toast('That is not a folder code', 'err'); return false; }
    let d; try { d = X8.b64d(m[1]); } catch (e) { toast('That folder code is damaged', 'err'); return false; }
    const keys = (Array.isArray(d.keys) ? d.keys : []).filter((k) => typeof k === 'string' && k.length < 200).slice(0, 40);
    if (!keys.length) { toast('That folder is empty', 'err'); return false; }
    const f = { ...this.get() }, id = `f${Date.now().toString(36)}`;
    Object.keys(f).forEach((x) => { f[x] = { ...f[x], keys: f[x].keys.filter((k) => !keys.includes(k)) }; if (!f[x].keys.length) delete f[x]; });
    f[id] = { name: String(d.name || 'Folder').replace(/[<>]/g, '').slice(0, 30), keys }; this.save(f);
    const have = new Set($$('#homeRows section.row').map((s) => s.dataset.arrK)), miss = keys.filter((k) => !have.has(k)).length;
    toast(`Folder “${f[id].name}” added${miss ? `. ${miss} of its rows need an addon you don’t have` : ''}`, 'ok', 5000);
    return true;
  },
};
window.MkFolders = Folders;

/* ---------------- Seats: copy another seat's choices ---------------- */
const SeatCopy = {
  copy(from, to) {
    if (from == null || !to) return;
    const src = Seats.all().find((s) => s.id === from); if (!src) return;
    const l = Seats.list(), i = l.findIndex((s) => s.id === to); if (i >= 0 && src.lang) { l[i] = { ...l[i], lang: { ...src.lang } }; Seats.saveList(l); }
    const rd = (k) => { try { return localStorage.getItem(from ? `mkc:seat:${from}:${k}` : `mkc:${k}`); } catch (e) { return null; } };
    ['taste', 'homeArrange', 'subMem'].forEach((k) => { const v = rd(k); if (v != null) try { localStorage.setItem(`mkc:seat:${to}:${k}`, v); } catch (e) { /* full */ } });
    try { const m = localStorage.getItem(from ? `mkc:seat:${from}:miko` : 'mkc:miko'); if (m != null) localStorage.setItem(`mkc:seat:${to}:miko`, m); } catch (e) { /* none */ }
  },
};
window.MkSeatCopy = SeatCopy;

/* ---------------- Source list look ---------------- */
const SrcLook = {
  apply() { const b = document.body; if (!b) return; b.classList.toggle('src-compact', CFG.srcView === 'compact'); b.classList.toggle('src-nobadge', CFG.srcBadges === false); },
};

/* ---------------- Trakt reviews on title pages ----------------
   Needs the Trakt app ID saved in Settings (public reviews, no sign-in needed). Reviews marked as spoilers stay
   covered until you open them. Not shown on the kids seat. */
const Reviews = {
  cache: new Map(),
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  async load(m) {
    const tt = String(m.id).split(':')[0]; if (!/^tt\d+$/.test(tt)) return [];
    if (this.cache.has(tt)) return this.cache.get(tt);
    const kind = m.type === 'series' ? 'shows' : 'movies';
    const j = await Trakt.api(`/${kind}/${tt}/comments/likes?limit=20`).catch(() => null);
    const list = (Array.isArray(j) ? j : []).filter((c) => c && typeof c.comment === 'string' && c.comment.trim().length >= 40)
      .map((c) => ({ id: c.id, who: (c.user && (c.user.name || c.user.username)) || 'Trakt member', text: c.comment.replace(/\[\/?spoiler\]/gi, '').trim(), spoiler: !!c.spoiler || /\[spoiler\]/i.test(c.comment), likes: c.likes || 0, rating: c.user_stats && c.user_stats.rating, at: c.created_at }))
      .slice(0, 12);
    this.cache.set(tt, list); if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
    return list;
  },
  place(m) {
    if (CFG.traktReviews === false || this.kids() || !Trakt.cfg().clientId) return;
    const id = m.id;
    this.load(m).then((list) => {
      const panel = $('#detailPanel'); if (!list.length || !panel || !D.meta || D.meta.id !== id) return;
      const old = $('#dReviews', panel); if (old) old.remove();
      const bodies = $$(':scope > .d-body', panel), host = bodies[bodies.length - 1]; if (!host) return;
      const sec = document.createElement('section'); sec.className = 'row mk-rv-row'; sec.id = 'dReviews';
      sec.innerHTML = `<div class="row-head"><h2 class="row-title">Reviews on Trakt</h2></div><div class="rail">${list.map((c, i) => `<button type="button" class="mk-rv" data-nav data-rv="${i}">
        <span class="mk-rv-top"><b translate="no">${esc(c.who)}</b>${c.rating ? `<span class="mk-rv-r"><i data-lucide="star"></i>${esc(String(c.rating))}/10</span>` : ''}</span>
        ${c.spoiler ? '<span class="mk-rv-sp"><i data-lucide="eye-off"></i><span>Contains spoilers. Press to read.</span></span>' : `<span class="mk-rv-t" translate="no">${esc(c.text)}</span>`}
        <small><i data-lucide="heart"></i>${c.likes}${c.at ? ` · ${esc(fmtDate(c.at))}` : ''}</small></button>`).join('')}</div>`;
      const more = $('#dMore', panel); if (more && more.parentElement === host) host.insertBefore(sec, more); else host.appendChild(sec);
      $$('[data-rv]', sec).forEach((b) => b.addEventListener('click', () => this.read(list, Number(b.dataset.rv))));
      icons();
    }).catch(() => {});
  },
  read(list, i) {
    const c = list[i]; if (!c) return;
    const el = X8.layer('mkReview', { label: 'Review', icon: 'message-square-quote', eyebrow: 'Reviews on Trakt' }); el.classList.add('mk-rv-ov');
    if (el.hidden) X8.open('mkReview');
    const b0 = X8.body('mkReview'); if (!b0) return;
    b0.innerHTML = `<h2 class="x8-h" translate="no">${esc(c.who)}</h2><p class="sub">${c.rating ? `${esc(String(c.rating))}/10 · ` : ''}<i data-lucide="heart"></i> ${c.likes}${c.at ? ` · ${esc(fmtDate(c.at))}` : ''}</p>
      <div class="mk-rv-full" tabindex="0" data-nav translate="no">${esc(c.text).replace(/\n/g, '<br>')}</div>
      <div class="actions"><button class="btn btn-ghost" type="button" data-nav data-rvgo="-1"${i ? '' : ' disabled'}><i data-lucide="chevron-left"></i>Previous</button><button class="btn btn-ghost" type="button" data-nav data-rvgo="1"${i < list.length - 1 ? '' : ' disabled'}>Next<i data-lucide="chevron-right"></i></button></div>`;
    const b = X8.body('mkReview'); if (!b) return;
    $$('[data-rvgo]', b).forEach((x) => x.addEventListener('click', () => this.read(list, i + Number(x.dataset.rvgo))));
    icons(); const f = $('.mk-rv-full', b); if (f) f.focus();
  },
};
window.MkReviews = Reviews;

/* ---------------- Search again on the source list ---------------- */
const Again = {
  keep: false,
  mount(box, st) {
    if (!box || st.pending) { if (this.keep && box) { const b = $('#dAgain', box); if (b) b.focus(); } return; }
    const line = $('.status-line', box); if (!line || $('#dAgain', box)) return;
    line.insertAdjacentHTML('beforeend', '<button class="btn btn-ghost btn-sm mk-again" type="button" id="dAgain" data-nav><i data-lucide="refresh-cw"></i>Search again</button>');
    const b = $('#dAgain', box); b.onclick = () => this.run(); icons();
    if (this.keep) { this.keep = false; b.focus(); }
  },
  run() {
    const tgt = detailStreamTarget(); if (!tgt) return;
    engine.addons.forEach((a) => { if (!a.virtual) engine.cache.delete(StremioEngine.streamUrl(a.baseUrl, tgt.type, tgt.id)); });
    this.keep = document.activeElement && document.activeElement.id === 'dAgain';
    loadDetailStreams();
  },
};
window.MkAgain = Again;

/* ---------------- Source speed: is it the source or your internet? ----------------
   Reads up to 12 MB of the last film you played, straight from its server, for at most 10 seconds.
   The link is kept in memory only, never saved or sent anywhere. */
const SrcSpeed = {
  last: null,
  note(s) { if (s && /^https?:/.test(s.url || '') && !/\.m3u8?(\?|$)/i.test(s.url) && !s.ytId) this.last = { url: s.url, name: (P.ctx && P.ctx.meta && P.ctx.meta.name) || '' }; },
  async run(btn) {
    if (this.busy) return; const l = this.last;
    if (!l) { toast('Play a film first, then test its source here', 'info', 4200); return; }
    this.busy = true; const lbl = btn && btn.lastChild, t0 = lbl ? lbl.textContent : ''; if (lbl) lbl.textContent = 'Testing…';
    try {
      const ctl = new AbortController(), start = performance.now(); let bytes = 0;
      const stop = setTimeout(() => ctl.abort(), 10000);
      try {
        const r = await fetch(l.url, { headers: { Range: 'bytes=0-12582911' }, cache: 'no-store', signal: ctl.signal });
        if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
        const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; bytes += value.length; if (bytes >= 12582912) { rd.cancel(); break; } }
      } catch (e) { if (!bytes) throw e; } finally { clearTimeout(stop); }
      const mbps = (bytes * 8) / ((performance.now() - start) / 1000) / 1e6, line = typeof LineCheck !== 'undefined' && LineCheck.last ? LineCheck.last.mbps : 0;
      const verdict = line ? (mbps < line * 0.5 ? 'The source is the slow part, not your internet. Another source may play better.' : 'The source keeps up with your internet.') : 'Run Test my connection too, to compare with your internet.';
      toast(`Source: ${mbps.toFixed(0)} Mbps${line ? `. Your internet: ${line.toFixed(0)} Mbps` : ''}. ${verdict}`, 'ok', 9000, 'srcspeed');
    } catch (e) { toast('That source’s server does not allow a speed test from here', 'err', 5000); }
    if (lbl) lbl.textContent = t0; this.busy = false;
  },
};
window.MkSrcSpeed = SrcSpeed;

/* ---------------- Long Home descriptions scroll instead of being cut ----------------
   After 3 seconds the text glides up slowly (transform only), rests at the end, then returns. */
const HeroText = {
  t: 0, anim: null,
  set() {
    clearTimeout(this.t); if (this.anim) { try { this.anim.cancel(); } catch (e) { /* gone */ } this.anim = null; }
    const p = document.getElementById('heroDesc'); if (!p) return;
    p.classList.remove('mk-hs');
    if (CFG.heroScroll === false || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.t = setTimeout(() => this.go(p), 3000);
  },
  go(p) {
    if (!p.isConnected || !p.textContent || p.scrollHeight <= p.clientHeight + 4) return;
    const h = p.clientHeight, txt = p.textContent; p.classList.add('mk-hs'); p.style.height = `${h}px`;
    p.innerHTML = `<span class="mk-hs-in">${esc(txt)}</span>`;
    const inner = p.firstChild, dist = inner.offsetHeight - h; if (dist <= 4) { p.classList.remove('mk-hs'); p.style.height = ''; p.textContent = txt; return; }
    const move = Math.max(4000, dist * 70), total = move * 2 + 4000;
    this.anim = inner.animate([{ transform: 'translateY(0)', offset: 0 }, { transform: `translateY(-${dist}px)`, offset: move / total }, { transform: `translateY(-${dist}px)`, offset: (move + 3000) / total }, { transform: 'translateY(0)', offset: 1 }], { duration: total, easing: 'linear', iterations: 1 });
    this.anim.onfinish = () => { this.anim = null; if (p.isConnected && p.firstChild === inner) { p.classList.remove('mk-hs'); p.style.height = ''; p.textContent = txt; } };
  },
};
window.MkHeroText = HeroText;

/* ---------------- Settings, commands and start-up ---------------- */
(() => {
  const safe = (n, fn) => { try { fn(); } catch (e) { console.warn(`2.68 ${n}:`, e); } };
  safe('settings', () => {
    scAddRows('subtitles', 'subPos', [
      { group: 'Choices' },
      { key: 'subWait', label: 'When a film starts', help: 'Right away, or wait up to 4 seconds so subtitles in your language are on from the first line.', type: 'select', options: [['fast', 'Start right away'], ['lang', 'Wait for my language']], get: () => CFG.subWait || 'fast', set: (v) => setCfg('subWait', v) },
      { key: 'subMemory', label: 'Remember my choice for each title', help: 'The subtitles you pick for a film or series, or turning them off, come back the next time you watch it here.', type: 'toggle', get: () => CFG.subMemory !== false, set: (v) => setCfg('subMemory', v) },
      { key: 'forcedSubs', label: 'Forced subtitles', help: 'Shows the short lines for foreign-language scenes and signs when no other subtitle is on.', type: 'toggle', get: () => CFG.forcedSubs !== false, set: (v) => setCfg('forcedSubs', v) },
      { key: 'hideSDH', label: 'Hide SDH subtitles', help: 'Leaves out subtitles made for deaf and hard-of-hearing viewers (with sound descriptions like [door slams]) unless you pick one yourself.', type: 'toggle', get: () => CFG.hideSDH === true, set: (v) => setCfg('hideSDH', v) },
    ]);
    scAddRows('streams', 'showTrailers', [
      { key: 'srcView', label: 'Source list', help: 'Detailed shows every line an addon sends. Compact keeps one line and the badges, so more sources fit.', type: 'select', options: [['detailed', 'Detailed'], ['compact', 'Compact']], get: () => CFG.srcView || 'detailed', set: (v) => { setCfg('srcView', v); SrcLook.apply(); } },
      { key: 'srcBadges', label: 'Quality badges on sources', help: 'The small 4K, HDR, sound and size tags on each source.', type: 'toggle', get: () => CFG.srcBadges !== false, set: (v) => { setCfg('srcBadges', v); SrcLook.apply(); } },
      { key: 'shareSetup', label: 'Share my setup', help: 'Copies a link that adds your addons on another device or for a friend in one press. Addons that hold your own key are left out.', type: 'button', text: 'Copy setup link', icon: 'link', run: () => SetupLink.share() },
    ]);
    scAddRows('help', 'speedRun', [
      { key: 'srcSpeed', label: 'Test the last source', help: 'Checks how fast the server of the last film you played sends it, so you know whether a pause is the source or your internet.', type: 'button', text: 'Test the source', icon: 'server', run: (b) => SrcSpeed.run(b) },
    ]);
    scAddRows('sync', null, [
      { key: 'traktReviews', label: 'Reviews on Trakt', help: 'Shows reviews from Trakt on film and series pages when your Trakt app ID is saved. Spoilers stay covered until you open them.', type: 'toggle', get: () => CFG.traktReviews !== false, set: (v) => setCfg('traktReviews', v) },
    ]);
    scAddRows('debrid', null, [
      { key: 'myCloud', label: 'Your cloud', help: 'Browse and play what is already in your debrid account.', type: 'button', text: 'Open your cloud', icon: 'cloud', run: () => { closeLayer('settings'); MyCloud.open(); } },
    ]);
    scAddRows('home', 'arrHome', [
      { key: 'instantHome', label: 'Open Home instantly', help: 'Home shows the rows from your last visit straight away and refreshes them in the background.', type: 'toggle', get: () => CFG.instantHome !== false, set: (v) => setCfg('instantHome', v) },
      { key: 'heroScroll', label: 'Scroll long descriptions', help: 'The text under the featured title glides slowly to show the rest instead of being cut off.', type: 'toggle', get: () => CFG.heroScroll !== false, set: (v) => { setCfg('heroScroll', v); HeroText.set(); } },
      { key: 'foldCode', label: 'Add a shared folder', help: 'Paste a folder code someone shared with you.', type: 'text', get: () => '', set: (v) => { if (v) Folders.importCode(v); } },
    ]);
  });
  safe('commands', () => {
    COMMANDS.push(
      { label: 'Your cloud (files in your debrid account)', icon: 'cloud', run: () => MyCloud.open() },
      { label: 'Copy a link to my setup', icon: 'link', run: () => SetupLink.share() },
    );
  });
  safe('look', () => { SrcLook.apply(); CFG_HOOKS.push((k) => { if (k === 'srcView' || k === 'srcBadges') SrcLook.apply(); }); });
  safe('links', () => {
    const run = () => { const h = location.hash.replace(/^#/, ''); if (h.startsWith('setup=') || h.startsWith('setup-url=')) SetupLink.handle(h); };
    addEventListener('hashchange', run); if (document.readyState === 'complete') setTimeout(run, 400); else addEventListener('load', () => setTimeout(run, 400), { once: true });
  });
  safe('sync', () => {
    // the per-title subtitle memory travels with the seat's library
    if (!SEAT_KEYS.includes(SubMem.KEY)) SEAT_KEYS.push(SubMem.KEY);
  });
})();
