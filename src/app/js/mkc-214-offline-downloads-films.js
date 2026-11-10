
/* ---------------- 2.14.0 Offline downloads ----------------
   Films and episodes from debrid or direct-link sources download to this device and play with no connection:
   the Android app 1.4.0+ on phones and tablets (system download manager, plays in the app's own video player), and
   the Windows app 1.3.0+ (saved to Videos\MKCinema, plays in MKCinema or your own video player).
   Never on TVs and never in a plain browser. Torrents without a debrid service and live (HLS) streams can't be saved.
   Files stay on this device; nothing is uploaded. */
const Offline = {
  api: null,
  recs: [],
  sig: '',
  timer: 0,
  setup() {
    if (IS_TV) return null;
    try {
      const a = window.MKAndroid;
      if (a && typeof a.dlStart === 'function') return {
        platform: 'android', native: true, here: 'this phone',
        start: async (o) => { const r = a.dlStart(JSON.stringify(o)); if (!r || /^error/i.test(r)) throw new Error(String(r || 'the download did not start').replace(/^error:\s*/i, '')); return r; },
        list: async () => { try { return JSON.parse(a.dlList() || '[]'); } catch (e) { return []; } },
        remove: async (id) => a.dlRemove(String(id)),
        play: async (r, startMs) => a.dlPlay(String(r.id), Math.round(startMs || 0)),
      };
    } catch (e) { /* no app bridge */ }
    const d = window.MKDesktop;
    if (d && d.dl) return { platform: d.platform, native: false, here: 'this computer', start: (o) => d.dl.start(o), list: () => d.dl.list(), remove: (id) => d.dl.remove(id), url: (id) => d.dl.url(id), open: (id) => d.dl.open(id), folder: d.dl.folder ? () => d.dl.folder() : null };
    return null;
  },
  /* only sources the app can save as one file: a direct or debrid link, not a torrent hash, live stream or web page */
  canGet(s) {
    if (!s || s.ytId || s._p2p) return false;
    const t = s._tel || (s._tel = Telemetry.parse(s));
    if (t.kind === 'ext' || t.kind === 'yt') return false;
    if (s.url) return /^https?:\/\//i.test(s.url) && !/\.m3u8(\?|$)/i.test(s.url) && !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(s.url);
    return !!(s.infoHash && t.debrid);
  },
  recMeta(ctx, s) {
    const m = ctx.meta, v = ctx.video, t = s._tel || {};
    return { key: v ? (v.id || videoIdFor(m, v)) : m.id, metaId: m.id, type: m.type, name: m.name || '', poster: metaPoster(m) || '', background: metaBg(m) || '', year: yearOf(m),
      season: v ? Number(v.season) : null, episode: v ? Number(v.episode) : null, epName: v ? (v.name || v.title || '') : '', thumb: (v && v.thumbnail) || '', res: t.res || '', size: t.size || '', addon: s._addon || '' };
  },
  label(r) { const m = r.meta || {}; return m.season != null ? `S${m.season} · E${m.episode}${m.epName ? ` · ${m.epName}` : ''}` : String(m.year || '').slice(0, 4); },
  status(r) {
    const pct = r.size > 0 ? Math.floor(clamp(r.got / r.size, 0, 1) * 100) : 0;
    if (r.state === 'done') { const p = S.progress[(r.meta || {}).key]; return `Downloaded${r.size > 0 ? ` · ${fmtBytes(r.size)}` : ''}${isWatched((r.meta || {}).key) ? ' · Watched' : p && p.t > 20 ? ` · ${fmtTime(p.t)} watched` : ''}`; }
    if (r.state === 'running') return r.size > 0 ? `Downloading ${pct}% · ${fmtBytes(r.got)} of ${fmtBytes(r.size)}` : `Downloading · ${fmtBytes(r.got || 0)}`;
    if (r.state === 'paused') return r.err || 'Paused, waiting for a connection';
    if (r.state === 'queued') return r.err || 'Waiting to start';
    return `Didn’t finish: ${r.err || 'the download stopped'}`;
  },
  async get(ctx, s) {
    if (!this.api) return;
    const meta = this.recMeta(ctx, s);
    const dup = this.recs.find((r) => r.meta && r.meta.key === meta.key && r.state !== 'failed');
    if (dup) { toast(dup.state === 'done' ? 'Already downloaded. It’s in Library › Downloads.' : 'Already downloading. It’s in Library › Downloads.', 'info', 4000, 'dl'); return; }
    let url = s.url;
    if (!url) {
      toast('Getting the download link…', 'info', 4000, 'dl');
      try { url = await Vault.resolve(s, ctx); } catch (e) { toast(`${(typeof DEBRID !== 'undefined' && DEBRID[s._tel.debrid] || {}).label || 'Debrid'}: ${e.message || e}`, 'err', 7000, 'dl'); return; }
    }
    const bh = s.behaviorHints || {}, headers = (bh.proxyHeaders && bh.proxyHeaders.request) || {};
    const ext = ((String(bh.filename || '').match(/\.(mkv|mp4|m4v|avi|webm|mov|ts|m2ts)$/i)) || (String(url).split(/[?#]/)[0].match(/\.(mkv|mp4|m4v|avi|webm|mov|ts|m2ts)$/i)) || [])[1] || 'mkv';
    const base = `${meta.name}${meta.season != null ? ` S${String(meta.season).padStart(2, '0')}E${String(meta.episode).padStart(2, '0')}` : meta.year ? ` (${String(meta.year).slice(0, 4)})` : ''}`;
    const file = `${base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'MKCinema'}.${ext.toLowerCase()}`;
    let subUrl = '';
    try { subUrl = await TvPlayer.subUrl(ctx); } catch (e) { /* no subtitles */ }
    try {
      await this.api.start({ url, headers, file, subUrl, wifiOnly: this.api.platform === 'android' && CFG.dlWifiOnly !== false, meta });
      toast(`Downloading ${meta.name}${meta.season != null ? ` S${meta.season} E${meta.episode}` : ''}. Find it in Library › Downloads.`, 'ok', 5000, 'dl');
    } catch (e) { toast(`Download: ${e.message || e}`, 'err', 7000, 'dl'); }
    this.refresh();
  },
  async refresh() {
    if (!this.api) return;
    clearTimeout(this.timer);
    try { this.recs = (await this.api.list()) || []; } catch (e) { this.recs = []; }
    this.paint();
    if (this.recs.some((r) => r.state === 'running' || r.state === 'queued' || r.state === 'paused')) this.timer = setTimeout(() => this.refresh(), document.hidden ? 6000 : 1500);
  },
  rowHTML(r) {
    const m = r.meta || {}, done = r.state === 'done', p = S.progress[m.key];
    const frac = done ? (p && p.d ? clamp(p.t / p.d, 0, 1) : 0) : r.size > 0 ? clamp(r.got / r.size, 0, 1) : 0;
    const art = m.thumb || m.background || m.poster;
    return `<div class="dl-row" data-dl="${esc(r.id)}">
      <div class="dl-art"><i data-lucide="film"></i>${art ? `<img src="${esc(art)}" alt="" loading="lazy" data-gone>` : ''}</div>
      <div class="dl-main"><b>${esc(m.name || 'Download')}</b><small>${esc([this.label(r), m.res, r.size > 0 ? fmtBytes(r.size) : m.size].filter(Boolean).join(' · '))}</small>
        ${done && !frac ? '' : `<div class="dl-bar${done ? ' seen' : ''}${r.state === 'failed' ? ' bad' : ''}"><i style="transform:scaleX(${frac.toFixed(4)})"></i></div>`}
        <small class="dl-st">${esc(this.status(r))}</small></div>
      <div class="dl-act">${done ? `<button class="btn btn-prime btn-sm" type="button" data-nav data-dlplay="${esc(r.id)}"><i data-lucide="play"></i>${p && p.t > 20 && !isWatched(m.key) ? 'Resume' : 'Play'}</button>${this.api.open ? `<button class="btn btn-ghost btn-sm" type="button" data-nav data-dlopen="${esc(r.id)}"><i data-lucide="external-link"></i>Open in my player</button>` : ''}`
        : r.state === 'failed' ? `<button class="btn btn-ghost btn-sm" type="button" data-nav data-dlretry="${esc(r.id)}"><i data-lucide="rotate-cw"></i>Download again</button>` : ''}<button class="btn btn-ghost btn-sm" type="button" data-nav data-dldel="${esc(r.id)}"><i data-lucide="${done ? 'trash-2' : 'x'}"></i>${done ? 'Delete' : 'Cancel'}</button></div></div>`;
  },
  paint() {
    const n = this.recs.length, chip = $('#libX [data-ltab="downloads"] .tnum'); if (chip) chip.textContent = n;
    const box = $('#dlList'); if (!box) return;
    const sig = this.recs.map((r) => `${r.id}:${r.state}`).join('|');
    if (sig === this.sig && box.childElementCount) {
      // same downloads in the same states: move the bars and numbers only, so focus and scrolling stay put
      this.recs.forEach((r) => { const row = box.querySelector(`[data-dl="${CSS.escape(String(r.id))}"]`); if (!row) return; const bar = $('.dl-bar i', row), st = $('.dl-st', row);
        if (bar && r.state !== 'done') bar.style.transform = `scaleX(${(r.size > 0 ? clamp(r.got / r.size, 0, 1) : 0).toFixed(4)})`; if (st) st.textContent = this.status(r); });
      return;
    }
    const hadFocus = box.contains(document.activeElement) ? document.activeElement.closest('[data-dl]') : null, fid = hadFocus && hadFocus.dataset.dl;
    this.sig = sig;
    const list = this.recs.slice().sort((a, b) => (a.state === 'done') - (b.state === 'done') || (b.created || 0) - (a.created || 0));
    box.innerHTML = list.map((r) => this.rowHTML(r)).join('') || `<div class="empty">Nothing downloaded yet. Open a film or an episode and press <b>Download</b>: it plays here with no connection.${this.api.platform === 'android' ? ' Downloads use Wi-Fi only unless you change it in Settings › Playback.' : ''}</div>`;
    if (this.api.folder && list.length) box.insertAdjacentHTML('beforeend', '<div class="dl-foot"><button class="btn btn-ghost btn-sm" type="button" data-nav id="dlFolder"><i data-lucide="folder-open"></i>Show the downloads folder</button></div>');
    icons();
    const find = (id) => this.recs.find((r) => String(r.id) === String(id));
    $$('[data-dlplay]', box).forEach((b) => b.addEventListener('click', () => { const r = find(b.dataset.dlplay); if (r) this.play(r); }));
    $$('[data-dlopen]', box).forEach((b) => b.addEventListener('click', () => { Promise.resolve(this.api.open(b.dataset.dlopen)).catch((e) => toast(`Could not open it: ${e.message || e}`, 'err')); }));
    $$('[data-dldel]', box).forEach((b) => b.addEventListener('click', () => confirmTwice(b, async () => { await this.api.remove(b.dataset.dldel); toast('Download removed', 'info'); this.refresh(); })));
    $$('[data-dlretry]', box).forEach((b) => b.addEventListener('click', async () => {
      const r = find(b.dataset.dlretry); if (!r) return; const m = r.meta || {};
      await this.api.remove(r.id); this.refresh();
      openDetail({ id: m.metaId, type: m.type, name: m.name, poster: m.poster }, { videoId: m.season != null ? m.key : undefined });
      toast('Pick a source and press Download again', 'info', 5000);
    }));
    const f = $('#dlFolder', box); if (f) f.onclick = () => this.api.folder();
    if (fid && IS_TV === false) { const el = box.querySelector(`[data-dl="${CSS.escape(fid)}"] button`); if (el) el.focus({ preventScroll: true }); }
  },
  ctxOf(r) {
    const m = r.meta || {}, meta = S.metas.get(m.metaId) || { id: m.metaId, type: m.type, name: m.name, poster: m.poster, background: m.background, releaseInfo: m.year };
    const video = m.season != null ? ((meta.videos || []).find((v) => videoIdFor(meta, v) === m.key) || { id: m.key, season: m.season, episode: m.episode, name: m.epName, thumbnail: m.thumb }) : null;
    return { meta, video };
  },
  // the next downloaded episode of the same series, for "next episode" and autoplay
  nextOf(ctx) {
    if (!ctx.video) return null;
    const s = Number(ctx.video.season), e = Number(ctx.video.episode);
    return this.recs.filter((r) => r.state === 'done' && r.meta && r.meta.metaId === ctx.meta.id && r.meta.season != null && (r.meta.season > s || (r.meta.season === s && r.meta.episode > e)))
      .sort((a, b) => a.meta.season - b.meta.season || a.meta.episode - b.meta.episode)[0] || null;
  },
  async play(r) {
    const ctx = this.ctxOf(r), p = S.progress[(r.meta || {}).key];
    const startAt = p && p.t > 20 && p.d && p.t < p.d * 0.95 ? p.t : 0;
    if (this.api.native) {
      TvPlayer.cur = { ctx, stream: { _dl: r.id }, startAt };
      let ok = false; try { ok = await this.api.play(r, startAt * 1000); } catch (e) { ok = false; }
      if (!ok) { TvPlayer.cur = null; toast('This download could not open', 'err'); }
      return;
    }
    let url; try { url = await this.api.url(r.id); } catch (e) { toast(`Download: ${e.message || e}`, 'err'); return; }
    P.force = true;
    playStream(ctx, { url, name: 'Downloaded', title: `${(r.meta || {}).name || ''}\n${fmtBytes(r.size || 0)}`, _local: true, _dl: r.id, _addon: `On ${this.api.here}`, behaviorHints: { filename: r.file || '' } }, { startAt });
  },
  async menu(btn) {
    let pop = $('#dlPop'); if (pop) { pop.remove(); return; }
    const m = D.meta; if (!m) return;
    if (m.type === 'series' && !D.video) { toast('Pick an episode first, then press Download', 'info'); return; }
    if (!D.streams.length || (D.status && D.status.pending)) { btn.classList.add('busy'); try { await loadDetailStreams(); } catch (e) { /* listed below */ } btn.classList.remove('busy'); if ($('#dlPop') || D.meta !== m) return; }
    const ctx = { meta: D.meta, video: D.video };
    const list = D.streams.filter((s) => this.canGet(s) && AudioPref.ok(s))
      .sort((a, b) => ((a._tel.cached === false) - (b._tel.cached === false)) || ((b._tel.score || 0) - (a._tel.score || 0))).slice(0, 6);
    pop = document.createElement('div'); pop.id = 'dlPop'; pop.className = 'list-pop dl-pop';
    pop.innerHTML = `<div class="dl-pop-h">Download to ${esc(this.api.here)}${D.video ? ` · S${D.video.season} E${D.video.episode}` : ''}</div>${list.map((s) => { const t = s._tel;
      return `<button type="button" data-nav data-dlsrc="${D.streams.indexOf(s)}"><i data-lucide="download"></i><span><b>${esc([t.res || 'Video', t.size].filter(Boolean).join(' · '))}</b><small>${esc([t.debrid ? (DEBRID[t.debrid] || {}).label : '', t.cached === false ? 'not cached yet' : '', t.codec, s._addon].filter(Boolean).join(' · '))}</small></span></button>`; }).join('')
      || '<div class="dl-none">No source for this one can be saved. Downloads need a debrid service or a direct link. Torrents without debrid and live streams can’t be downloaded.</div>'}`;
    btn.after(pop); icons();
    // wide screens: float it under the button instead of pushing the other buttons down
    if (innerWidth > 720) { pop.classList.add('float'); pop.style.left = `${btn.offsetLeft}px`; pop.style.top = `${btn.offsetTop + btn.offsetHeight + 8}px`; }
    if (IS_TV || matchMedia('(pointer: fine)').matches) { const f = $('[data-dlsrc]', pop); if (f) f.focus({ preventScroll: true }); }
    $$('[data-dlsrc]', pop).forEach((b) => b.addEventListener('click', () => { pop.remove(); this.get(ctx, D.streams[Number(b.dataset.dlsrc)]); }));
    const close = (e) => { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', close, true); } };
    document.addEventListener('pointerdown', close, true);
  },
  hook() {
    // Library › Downloads
    const lr = Library.render.bind(Library);
    Library.render = function () {
      const s = this.st;
      if (s.tab !== 'downloads') { lr(); Offline.chip(false); return; }
      s.tab = 'watchlist'; lr(); s.tab = 'downloads';
      const box = $('#libX'); if (!box) return;
      $$('[data-ltab]', box).forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); });
      Offline.chip(true);
      const bar = $('.lib-bar', box); if (bar) bar.hidden = true;
      const grid = $('.lib-grid', box); if (grid) { grid.className = 'dl-list'; grid.id = 'dlList'; grid.innerHTML = ''; }
      Offline.sig = ''; Offline.paint(); Offline.refresh();
    };
    // the film page's Download button, next to Watchlist and Lists
    const rd = renderDetail;
    renderDetail = function () {
      const r = rd.apply(this, arguments);
      const after = $('#dLists') || $('#dList');
      if (D.meta && after && !$('#dDl')) { after.insertAdjacentHTML('afterend', '<button class="btn btn-ghost" type="button" id="dDl" data-nav><i data-lucide="download"></i>Download</button>'); icons(); $('#dDl').onclick = (e) => Offline.menu(e.currentTarget); }
      return r;
    };
    // the app's own player hands back where you stopped: save it, then the next downloaded episode if asked
    const nd = window.MKNative && window.MKNative.done;
    if (nd) window.MKNative.done = function (pos, dur, ended, next, err, act) {
      const c = TvPlayer.cur;
      if (!c || !c.stream || !c.stream._dl) return nd.apply(this, arguments);
      if (err && !(pos > 0)) { TvPlayer.cur = null; toast('This download would not play. It may be damaged: delete it and download it again.', 'err', 7000); return; }
      if (act === 'sources' || act === 'web') {
        // the saved file can't move into MKCinema's own player: keep the place and open the title on its online sources
        TvPlayer.save(pos, dur); TvPlayer.cur = null;
        if (act === 'web') toast('Saved films play in this player. Pick an online source to use the full player.', 'info', 6000);
        if (!$('#player').hidden) closePlayer();
        const m = c.ctx.meta, onIt = !$('#detail').hidden && D.meta && D.meta.id === m.id;
        if (!onIt) openDetail(m, { videoId: c.ctx.video ? videoIdFor(m, c.ctx.video) : undefined });
        let n = 0; const goSrc = () => { const st = $('#dStreams'), f = st && st.querySelector('[data-nav],button,a');
          if (f) { st.scrollIntoView({ block: 'start' }); if (IS_TV) Nav.focus(f, true); } else if (++n < 20) setTimeout(goSrc, 250); };
        setTimeout(goSrc, onIt ? 60 : 400);
        return;
      }
      TvPlayer.save(pos, dur); // reads TvPlayer.cur
      TvPlayer.cur = null;
      if (c.ctx.video && (next || (ended && CFG.autoNext))) { const nx = Offline.nextOf(c.ctx); if (nx) { Offline.play(nx); return; } }
      if (S.view === 'library') renderLibrary(); else if (S.view === 'home') renderHome();
    };
    // Settings › Playback: Wi-Fi only (phones)
    const sec = SECTIONS.find((x) => x.id === 'playback');
    if (sec && this.api.platform === 'android') {
      const rows = sec.rows;
      sec.rows = () => [...rows(), { key: 'dlWifiOnly', label: 'Download on Wi-Fi only', help: 'Downloads wait for Wi-Fi instead of using mobile data. Films are often 2 to 15 GB.', type: 'toggle', get: () => CFG.dlWifiOnly !== false, set: (v) => setCfg('dlWifiOnly', v) }];
    }
  },
  chip(on) {
    const tl = $('#libX .lib-tl'); if (!tl) return;
    let b = $('[data-ltab="downloads"]', tl);
    if (!b) {
      // first, so it is in view on a phone without scrolling the tabs
      tl.insertAdjacentHTML('afterbegin', `<button type="button" class="chip" role="tab" data-nav data-ltab="downloads"><i data-lucide="download"></i>Downloads <span class="tnum">${this.recs.length}</span></button>`);
      b = $('[data-ltab="downloads"]', tl); icons();
      b.addEventListener('click', () => { Library.st.tab = 'downloads'; Library.render(); });
    }
    b.classList.toggle('on', !!on); b.setAttribute('aria-selected', String(!!on));
  },
  init() {
    this.api = this.setup();
    if (!this.api) return;
    document.documentElement.classList.add('can-dl');
    this.hook(); this.refresh();
    const said = () => toast('You’re offline. Your downloads are in Library › Downloads.', 'info', 6000, 'offline');
    // opened with no connection (the app shell comes from the cache): go straight to the downloads
    if (!navigator.onLine) setTimeout(() => { Library.st.tab = 'downloads'; go('library'); said(); }, 1200);
    addEventListener('offline', () => { said(); this.refresh(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.refresh(); });
  },
};
Offline.init();
