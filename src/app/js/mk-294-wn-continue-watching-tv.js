/* 2.94 Continue watching on TV home screens (Android app 1.17.11+). Each tile resumes the film or episode itself
   (the same Resume link as the phone widget), the whole list is sent at start-up and whenever MKCinema goes to the
   background, so titles from before the app opened show up and finished or removed ones leave. Older apps keep the
   1.6.0 behaviour (one title at a time, the tile opens its page). */
(() => {
  if (typeof TvBridge === 'undefined' || typeof continueItems !== 'function' || !TvBridge.has('watchNext')) return;
  const item = (p, k) => ({
    id: p.metaId, v: String(p.videoId || k || ''), at: p.at || 0, type: p.type, name: p.name, poster: p.poster, background: p.background,
    positionMs: Math.round((p.t || 0) * 1000), durationMs: Math.round((p.d || 0) * 1000),
    season: p.season, episode: p.episode, episodeTitle: p.epTitle || '',
  });
  const send = (o) => { try { MKAndroid.watchNext(JSON.stringify(o)); } catch (e) { /* old app */ } };
  // same as 1.6.0 (newest progress per title, at most once a minute per title), now with the video id and time
  TvBridge.progress = function (all) {
    const now = Date.now(), byMeta = {};
    Object.entries(all || {}).forEach(([k, p]) => { if (p && p.metaId && (!byMeta[p.metaId] || p.at > byMeta[p.metaId].p.at)) byMeta[p.metaId] = { k, p }; });
    Object.values(byMeta).forEach(({ k, p }) => {
      if (!p.at || now - p.at > 15000 || (this.sent[p.metaId] && now - this.sent[p.metaId] < 60000)) return;
      this.sent[p.metaId] = now; send(item(p, k));
    });
    Object.keys(this.last).forEach((id) => { if (!byMeta[id]) { try { MKAndroid.watchNextRemove(id); } catch (e) { /* old app */ } delete this.sent[id]; } });
    this.last = {}; Object.keys(byMeta).forEach((id) => { this.last[id] = byMeta[id].p; });
    TvWatchNext.soon();
  };
  const TvWatchNext = {
    T: 0, sent: '',
    soon() { clearTimeout(this.T); this.T = setTimeout(() => this.all(), 20000); },
    all() {
      if (typeof MKAndroid.watchNextAll !== 'function') return; // app before 1.17.11
      const seen = {}, items = [];
      continueItems().forEach((p) => { if (p && p.metaId && p.videoId && !seen[p.metaId] && items.length < 20) { seen[p.metaId] = 1; items.push(item(p, p.videoId)); } });
      const json = JSON.stringify({ items }); if (json === this.sent) return; this.sent = json;
      try { MKAndroid.watchNextAll(json); } catch (e) { this.sent = ''; }
    },
  };
  window.TvWatchNext = TvWatchNext;
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(TvWatchNext.T); TvWatchNext.all(); } });
  setTimeout(() => TvWatchNext.all(), 6000);
})();