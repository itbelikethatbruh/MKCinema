
/* ---------------- 2.56 Phone remote: details and sending titles ----------------
   The phone remote can now browse the film or show on this screen (cast, crew, filmographies, search), so this screen
   tells it which title is on (its id, and the episode), and takes four requests back from an allowed phone: open a
   title's page here, play it or its trailer here, add it to or take it off the watchlist, and ask whether one is on it.
   Ask (the remote's voice and text commands) can also start the next episode.
   Only IMDb ids are taken, and the kids seat still decides what may open. */
const RmInfo = {
  q: '',
  ok: (id) => /^tt\d{5,10}$/.test(id),
  // on a kids seat only kid-safe titles (openDetail checks again on its own)
  kid(seed) { try { return typeof Seats === 'undefined' || !Seats.kids || !Seats.kids() || Seats.kidSafe(seed); } catch (e) { return true; } },
  async full(seed) { try { return { ...seed, ...((await engine.fetchMeta(seed.type, seed.id)) || {}) }; } catch (e) { return seed; } },
  async run(c, v) {
    const id = String(v.id || ''), type = v.type === 'series' ? 'series' : 'movie';
    if (!this.ok(id)) return;
    if (c === 'wlq') { this.q = id; return; }
    const seed = S.metas.get(id) || { id, type, name: String(v.name || '').slice(0, 200) };
    const m = (c === 'open' || c === 'play' || seed.genres) ? seed : await this.full(seed);
    if (!this.kid(m)) { toast('Not on the kids seat', 'err', 2200, 'kids'); return; }
    if (c === 'wl') { this.q = id; toggleWatchlist(m); return; }
    if (!$('#player').hidden) await closePlayer();
    if (c === 'open' || c === 'play') {
      const vid = typeof v.vid === 'string' && /^tt\d{5,10}:\d{1,4}:\d{1,5}$/.test(v.vid) && v.vid.startsWith(`${id}:`) ? v.vid : undefined;
      await openDetail(seed, vid ? { videoId: vid } : {});
      toast(`From your phone: ${seed.name || 'a title'}`, 'ok', 2600, 'rminfo');
      // play: the same as pressing Play on its page (no playable source leaves the page and its source list up)
      if (c === 'play' && typeof smartPlayDetail === 'function' && !$('#detail').hidden && D.meta && D.meta.id === id) await smartPlayDetail();
    } else if (c === 'trailer') playTrailer(m.trailers || m.trailerStreams ? m : await this.full(seed));
  },
};
{
  const st = Remote.state.bind(Remote);
  Remote.state = function () {
    const s = st();
    try {
      const pl = !$('#player').hidden && P.ctx;
      let m = null, v = null;
      if (pl) { m = P.ctx.meta; v = P.ctx.video; }
      else { const a = document.activeElement, card = a && a.closest ? a.closest('[data-card]') : null; m = card ? (S.metas.get(card.dataset.id) || null) : (!$('#detail').hidden && D.meta) || null; }
      if (m && m.id) {
        s.id = String(m.id).slice(0, 80); s.type = m.type === 'series' ? 'series' : 'movie';
        if (v && m.type === 'series') { try { s.vid = String(videoIdFor(m, v)).slice(0, 80); } catch (e) { /* no episode id */ } }
      }
      if (RmInfo.q) s.wlq = { id: RmInfo.q, on: inWatchlist(RmInfo.q) };
      if (Array.isArray(s.caps)) ['info', 'ask'].forEach((c) => { if (!s.caps.includes(c)) s.caps.push(c); });
    } catch (e) { /* the rest of the state still goes */ }
    return s;
  };
  const on = Remote.onMsg.bind(Remote);
  Remote.onMsg = function (m) {
    on(m);
    if (m && m._from && m.t === 'cmd' && m.c === 'next') { if (!$('#player').hidden && typeof playNext === 'function') playNext(); return; }
    if (m && m._from && m.t === 'cmd' && /^(open|play|trailer|wl|wlq)$/.test(m.c) && m.v && typeof m.v === 'object') {
      RmInfo.run(m.c, m.v).catch(() => {}).finally(() => this.push(true));
    }
  };
}
