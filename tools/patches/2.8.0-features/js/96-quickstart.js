/* ---------------- 2.8.9 One-press play and new-episode alerts ----------------
   QuickStart: Play on a banner, a poster's play button or a Continue watching card no longer waits for the slowest addon.
   As soon as any addon returns a confirmed-cached, web-ready source, MKCinema waits a short moment for something better
   and then starts; the rest of the results fill in behind it, so the Sources list in the player is still complete.
   On TVs the remote's Play button on a poster plays it straight away (the OK button still opens the film page).
   NewEps: series in your watchlist or Continue watching are checked every few hours for episodes that came out in the
   last week and that you have not watched. They get their own row under Continue watching and one quiet notice. */
const QuickStart = {
  GRACE: 900,
  // resolves with { streams } early; the same array is filled with the full, sorted list once every addon has answered
  fast(type, id) {
    return new Promise((resolve) => {
      const out = []; let done = false, graceT = 0, last = [];
      const sorted = (l) => l.slice().sort((x, y) => y._tel.score - x._tel.score);
      const finish = (list) => { if (done) return; done = true; clearTimeout(graceT); out.splice(0, out.length, ...list); resolve({ streams: out }); };
      engine.fetchStreams(type, id, (partial) => {
        if (done) return;
        last = sorted(partial);
        const good = last.find((s) => s._tel.webReady && !s._tel.isTrailer && s._tel.cached === true && !s._tel.mkv);
        if (good && !graceT) graceT = setTimeout(() => finish(last), this.GRACE);
      }).then((r) => { const full = sorted(r.streams || []); if (!done) finish(full); else out.splice(0, out.length, ...full); })
        .catch(() => finish(last));
    });
  },
  init() {
    quickPlay = async function (seed) {
      let meta = seed;
      try { meta = remember({ ...seed, ...((await engine.fetchMeta(seed.type, seed.id)) || {}) }); } catch (e) { /* catalog data */ }
      let video = null, id = (meta.behaviorHints && meta.behaviorHints.defaultVideoId) || meta.id;
      if (meta.type === 'series') {
        const eps = orderedEpisodes(meta); if (!eps.length) { openDetail(meta); return; }
        const p = continueItems().find((x) => x.metaId === meta.id);
        video = (p && meta.videos.find((v) => videoIdFor(meta, v) === p.videoId)) || eps.find((v) => !S.progress[videoIdFor(meta, v)]) || eps[0];
        id = videoIdFor(meta, video);
      }
      toast(`Starting ${meta.name}…`, 'info', 2400, 'qs');
      const { streams } = await QuickStart.fast(meta.type, id);
      const best = pickBest(streams);
      if (!best) { openDetail(meta, { videoId: video && video.id }); return; }
      playStream({ meta, video, streams }, best);
    };
    // Play / Pause on the remote while a poster is selected plays it
    document.addEventListener('keydown', (e) => {
      const k = e.key, play = k === 'MediaPlayPause' || k === 'MediaPlay' || (IS_TV && k === ' ');
      if (!play || !$('#player').hidden || !$('#trailer').hidden) return;
      const card = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-card]');
      if (!card || card.dataset.video) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const m = S.metas.get(card.dataset.id) || { id: card.dataset.id, type: card.dataset.type, name: card.getAttribute('aria-label') };
      quickPlay(m);
    }, true);
  },
};
QuickStart.init();

const NewEps = {
  EVERY: 3 * 3600e3, WINDOW: 7 * 86400e3,
  list() { return (Store.get('newEps', []) || []).filter((e) => !isWatched(e.vid) && !S.progress[e.vid] && Date.now() - e.at < this.WINDOW); },
  async check(force) {
    if (!force && Date.now() - (Store.get('newEpsAt', 0) || 0) < this.EVERY) return;
    const shows = Calendar.shows(); if (!shows.length) return;
    Store.set('newEpsAt', Date.now());
    const now = Date.now(), from = now - this.WINDOW, found = [];
    for (let i = 0; i < shows.length; i += 6) {   // a few at a time keeps a TV responsive
      await Promise.allSettled(shows.slice(i, i + 6).map(async (s) => {
        const meta = remember({ ...s, ...((await engine.fetchMeta('series', s.id)) || {}) });
        // only series you have actually started or saved: episodes after the furthest one you have reached
        const reached = Math.max(0, ...Object.values(S.progress).filter((p) => p.metaId === meta.id).map((p) => Number(p.season) * 1000 + Number(p.episode)));
        (meta.videos || []).forEach((v) => {
          const at = Date.parse(v.released || v.firstAired || ''), sn = Number(v.season), en = Number(v.episode);
          if (!(at > from && at <= now) || !sn) return;
          if (reached && sn * 1000 + en <= reached) return;
          const vid = videoIdFor(meta, v); if (isWatched(vid) || S.progress[vid]) return;
          found.push({ metaId: meta.id, vid, s: sn, e: en, at, name: meta.name, poster: meta.poster, background: meta.background, title: v.name || v.title || '' });
        });
      }));
    }
    found.sort((a, b) => b.at - a.at);
    const old = new Set((Store.get('newEps', []) || []).map((e) => e.vid));
    Store.set('newEps', found.slice(0, 30));
    const fresh = found.filter((e) => !old.has(e.vid));
    if (fresh.length) {
      const f = fresh[0], more = fresh.length - 1;
      toast(`New episode: ${f.name} S${f.s} · E${f.e}${more ? ` and ${more} more` : ''}`, 'info', 5200, 'newEps');
    }
    if (S.view === 'home') this.row();
  },
  row() {
    const rows = $('#homeRows'); if (!rows) return;
    let sec = $('#newEpRow');
    const eps = this.list();
    // one card per series: its newest unwatched episode
    const per = new Map(); eps.forEach((e) => { if (!per.has(e.metaId)) per.set(e.metaId, e); });
    if (!per.size) { if (sec) sec.remove(); return; }
    if (!sec) { sec = rowShell('New episodes', '', { id: 'newEpRow' }); const cw = $('#cwRow'); if (cw) cw.after(sec); else rows.prepend(sec); }
    const n = eps.length; sec.querySelector('.row-title small') || sec.querySelector('.row-title').insertAdjacentHTML('beforeend', ' <small></small>');
    sec.querySelector('.row-title small').textContent = `${n} to catch up on`;
    fillRail(sec, [...per.values()].map((e) => cardHTML({ id: e.metaId, type: 'series', name: e.name, poster: e.poster, background: e.background }, { wide: true, sub: `S${e.s} · E${e.e}${e.title ? ` · ${e.title}` : ''}` }).replace('data-card ', `data-card data-newep="${esc(e.vid)}" `)).join(''));
    if (typeof SimpleHome !== 'undefined') SimpleHome.tidy();
  },
  init() {
    // a card in the row opens that episode; its play button starts it
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-newep]'); if (!c) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const m = S.metas.get(c.dataset.id) || { id: c.dataset.id, type: 'series', name: c.getAttribute('aria-label') };
      if (e.target.closest('[data-quickplay]')) NewEps.play(m, c.dataset.newep); else openDetail(m, { videoId: c.dataset.newep });
    }, true);
    const rh = renderHome;
    renderHome = function () { const p = rh.apply(this, arguments); Promise.resolve(p).then(() => NewEps.row()); return p; };
    const later = () => NewEps.check().catch(() => {});
    if (typeof requestIdleCallback === 'function') setTimeout(() => requestIdleCallback(later, { timeout: 8000 }), 9000); else setTimeout(later, 12000);
    setInterval(later, this.EVERY);
    if (S.view === 'home') this.row();
  },
  async play(meta, vid) {
    try { meta = remember({ ...meta, ...((await engine.fetchMeta('series', meta.id)) || {}) }); } catch (e) { /* keep */ }
    const video = (meta.videos || []).find((v) => videoIdFor(meta, v) === vid) || null;
    toast(`Starting ${meta.name}…`, 'info', 2400, 'qs');
    const { streams } = await QuickStart.fast('series', vid);
    const best = pickBest(streams);
    if (!best) { openDetail(meta, { videoId: vid }); return; }
    playStream({ meta, video, streams }, best);
  },
};
NewEps.init();
