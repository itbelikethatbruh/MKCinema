
/* ---------------- The first pick fits this device (2.59.3) ----------------
   Sources were ranked by picture quality first, so the automatic pick was often a 4K Dolby Vision remux with DTS sound:
   the file a phone browser is least able to play. It failed, the next one failed the same way, and only the third or
   fourth (a plain 1080p file) played. Now a source this device can't play by itself (the same test as "Only sources
   that play here", which counts what the MKCinema engine can convert) ranks below every one it can, and on phones 4K and
   very large files come after 1080p, since they take longer to start on mobile data and don't look sharper on a phone
   screen. Nothing is hidden: the source list shows every source, and picking one by hand plays it. */
(() => {
  if (typeof Telemetry === 'undefined' || typeof BrowserPlay === 'undefined') return;
  const PHONE = TOUCH_UI && !IS_TV;
  const parse = Telemetry.parse.bind(Telemetry);
  Telemetry.parse = function (s) {
    const t = parse(s);
    if (!t || t.isTrailer || t.kind === 'yt' || !t.webReady || (s && s._local)) return t;
    let fits = true;
    // BrowserPlay reads the result it is judging from the source, so it gets this one
    try { fits = BrowserPlay.ok(Object.assign({}, s, { _tel: t })); } catch (e) { fits = true; }
    t.fits = fits;
    if (!fits) t.score -= 350;
    if (PHONE) {
      if (t.res === '4K UHD') t.score -= 120;
      const gb = (t.sizeBytes || 0) / 1073741824;
      if (gb > 8) t.score -= Math.min(90, (gb - 8) * 3);
    }
    return t;
  };
})();
