
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
  /* 2.67.1 tv-playback: in the Android TV app the TV player (the box's own hardware) plays the film, and it reads MKV,
     HEVC, 10-bit HEVC, HDR and Dolby Vision profile 7 (as HDR10). Judging its sources by what the WebView decodes ranked plain
     720p files first. What it can't do: DTS or TrueHD as the only sound (silent unless a receiver takes it as is),
     H.264 10-bit, and a torrent without a debrid service (slow to start on a TV box). */
  const TVN = () => { try { return IS_TV && typeof TvPlayer !== 'undefined' && TvPlayer.on(); } catch (e) { return false; } };
  const tvOk = (s, t) => {
    if (t.kind === 'ext' || t.kind === 'none' || (t.kind === 'p2p' && !t.debrid)) return false;
    const bh = s.behaviorHints || {}, T = [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' ').toLowerCase();
    // HEVC: every Android TV box decodes it in hardware. AV1: only the newest do, and the WebView's answer counts its
    // own software decoder, which the TV player doesn't have, so AV1 goes after the rest
    if (t.codec === 'AV1') return false;
    // Dolby Vision: fine on a Dolby Vision TV, and on others when there is an HDR10 picture under it (DvFallback)
    if (t.hdr === 'Dolby Vision' && !(DvBase.native() || DvBase.layer(T))) return false;
    if (t.codec !== 'HEVC' && t.codec !== 'AV1' && /\b(10[\s.-]?bit|hi10p?)\b/.test(T)) return false;
    if (/truehd|\bdts/.test(T) && !/\b(aac|opus|e-?ac-?3|ac-?3|ddp\d?|dd\+|dd[\s.]?[257][\s.]?[01]|dolby digital)\b/.test(T)) return false;
    return true;
  };
  window.MkTvFit = { on: TVN, ok: tvOk };
  const parse = Telemetry.parse.bind(Telemetry);
  Telemetry.parse = function (s) {
    const t = parse(s);
    if (!t || t.isTrailer || t.kind === 'yt' || !t.webReady || (s && s._local)) return t;
    let fits = true;
    // BrowserPlay reads the result it is judging from the source, so it gets this one
    try { fits = TVN() ? tvOk(s, t) : BrowserPlay.ok(Object.assign({}, s, { _tel: t })); } catch (e) { fits = true; }
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
