/* 2.96.7 film end: when a film plays to its end, the player closes and the film's page shows (Owner 2026-11-27: the
   player used to stay open on the last picture until Back). Episodes that go on to the next one are left alone. */
(() => {
  let t = 0;
  const stop = () => { clearTimeout(t); t = 0; };
  const done = () => {
    stop();
    try {
      if ($('#player').hidden || !P.ctx || !P.stream || P.stream.ytId) return;
      if (typeof MkChan !== 'undefined' && MkChan.on) return;            // channel surfing plays the next title itself
      if (P.ctx.meta && P.ctx.meta._iptv && /^iptv:/.test(String(P.ctx.meta.id || ''))) return;   // 2.98: a live channel opens again instead (Failover.liveKeep)
      if (typeof Party !== 'undefined' && Party.code) return;            // a watch party decides together
      const ctx = P.ctx, st = P.stream;
      // an episode with a next one: Up next (or autoplay) takes it from here
      if (ctx.video && typeof nextVideo === 'function' && nextVideo(ctx.meta, ctx.video)) return;
      t = setTimeout(() => {
        t = 0;
        if (P.ctx !== ctx || P.stream !== st || $('#player').hidden) return;
        const m = ctx.meta;
        Promise.resolve(closePlayer()).then(() => {
          if ($('#detail').hidden && m && m.id && !String(m.id).startsWith('local:') && (m.type === 'movie' || m.type === 'series')) {
            try { openDetail(m, ctx.video ? { videoId: ctx.video.id } : {}); } catch (e) { /* Home stays */ }
          }
        }).catch(() => {});
      }, 1500);
    } catch (e) { /* never block the end of a film */ }
  };
  video.addEventListener('ended', done);
  // played again or moved back within the moment before closing: stay
  ['play', 'seeking', 'emptied'].forEach((ev) => video.addEventListener(ev, stop));
})();
