
/* 2.57.1 steady open: opening an episode (Continue watching, phone remote, new-episode alerts) used to show the
   whole title page first, redraw it, and only then slide the episode sheet over it, with its picture drawn blank
   and popping in. Now the sheet opens in the same moment as the page when the episode is already known, a second
   open of the same episode keeps the sheet as it is, and the episode picture is carried over or fades in. */
(() => {
  if (typeof EpSheet === 'undefined' || typeof openDetail !== 'function') return;
  const vidOf = () => { try { return D.meta && D.video ? videoIdFor(D.meta, D.video) : ''; } catch (e) { return ''; } };
  const head = EpSheet.head, open = EpSheet.open;
  EpSheet.head = function () {
    const old = document.querySelector('#esHead .es-still img');
    const r = head.apply(this, arguments);
    this._vid = vidOf();
    try {
      const im = document.querySelector('#esHead .es-still img'); if (!im) return r;
      const src = im.getAttribute('src') || '';
      if (old && old !== im && (old.getAttribute('src') || '') === src && old.complete && old.naturalWidth) { old.classList.remove('es-wait'); im.replaceWith(old); return r; }
      if (!(im.complete && im.naturalWidth)) {
        im.classList.add('es-wait');
        const done = () => im.classList.remove('es-wait');
        im.addEventListener('load', done, { once: true }); im.addEventListener('error', done, { once: true }); setTimeout(done, 5000);
      }
    } catch (e) { /* the picture just shows */ }
    return r;
  };
  EpSheet.open = function () {
    const id = vidOf();
    // the same episode is already up: keep the sheet as it is and only refresh its sources
    if (id && this.isOpen() && this._vid === id && this.box && this.box.id === 'dStreams') { try { renderStreamsPanel(); } catch (e) { /* stays */ } return; }
    const r = open.apply(this, arguments); this._vid = id; return r;
  };
  const close = EpSheet.close;
  EpSheet.close = function () { this._vid = ''; return close.apply(this, arguments); };
  const od = openDetail;
  openDetail = function (seed, opts) {
    const p = od.apply(this, arguments);
    try {
      const videoId = opts && opts.videoId;
      if (videoId && seed && seed.type === 'series' && Array.isArray(seed.videos) && seed.videos.length && D.meta === seed) {
        const v = seed.videos.find((x) => videoIdFor(seed, x) === videoId);
        if (v) { D.video = v; D.season = Number(v.season); try { markEpisodes(); } catch (e) { /* list catches up */ } EpSheet.open(); }
      }
    } catch (e) { /* the sheet opens once the details arrive, as before */ }
    return p;
  };
})();
