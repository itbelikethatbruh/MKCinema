
'use strict';
/* ---------------- 2.61.2 Smart Play starts with 1080p in the MKCinema player ----------------
   Browsers cannot decode most 4K files (HEVC, HDR, Dolby Vision, DTS or TrueHD sound), so with the 4K setting the
   automatic pick in the MKCinema player failed again and again. When the MKCinema player will play the source, Smart
   Play and the automatic switch to the next source try 1080p or lower first. 4K and 1440p stay as the last resort, so
   a film that only has 4K sources still plays. VLC, other outside players and the TV's own player keep the full
   setting, the saved setting never changes, and every source can still be picked by hand. */
const WebCap = {
  RANK: { '4K UHD': 4, '1440p': 3.5, '1080p': 3, '720p': 2, SD: 1 },
  // true when the next source opens in the MKCinema web player
  on() {
    try {
      if (IS_TV) return !(typeof TvPlayer !== 'undefined' && TvPlayer.on());
      if (extPlayerId() !== 'builtin') return false;
      /* mk-289-4k: the native player decodes everything, so it gets the full setting */
      if (typeof MkNative !== 'undefined' && MkNative.ready()) return false;
      return true;
    } catch (e) { return false; }
  },
  cap: null,
  /* does this browser decode 4K smoothly in hardware? (asked once at start; null until answered) */
  probe() {
    const mc = navigator.mediaCapabilities; if (IS_TV || !mc || !mc.decodingInfo) return;
    const ask = (codec, extra) => mc.decodingInfo({ type: 'media-source', video: { contentType: `video/mp4; codecs="${codec}"`, width: 3840, height: 2160, bitrate: 40e6, framerate: 24, ...(extra || {}) } })
      .then((r) => !!(r && r.supported && r.smooth && r.powerEfficient)).catch(() => false);
    Promise.all([ask('hvc1.2.4.L153.B0'), ask('hvc1.2.4.L153.B0', { transferFunction: 'pq', colorGamut: 'rec2020' }), ask('dvh1.05.06'), ask('av01.0.12M.10')])
      .then(([sdr, hdr, dv, av1]) => { this.cap = { hevc: sdr && hdr, dv, av1 }; }).catch(() => {});
  },
  plays4k(s) {
    const c = this.cap, t = s && s._tel; if (!c || !c.hevc || !t) return false;
    if (t.codec === 'AV1') return c.av1;
    if (t.hdr === 'Dolby Vision' && !c.dv) {
      // Dolby Vision plays only when the file also carries plain HDR
      const T = [s.name, s.title, s.description, (s.behaviorHints || {}).filename].filter(Boolean).join(' ').toLowerCase();
      return /\bhdr(10)?(\+|plus)?\b/.test(T);
    }
    return true;
  },
  above(s) { const t = s && s._tel; return !!(t && t.res && (this.RANK[t.res] || 0) > 3) && !this.plays4k(s); },
  usable(s) { return !!(s && s._tel && s._tel.cached !== false); },
};
try { WebCap.probe(); } catch (e) { /* stays 1080p first */ }
(() => {
  if (typeof engine === 'undefined' || typeof engine.pickBest !== 'function') return;
  const pick = engine.pickBest;
  engine.pickBest = function (streams, opts) {
    const all = pick.call(this, streams, opts);
    if (!all || !WebCap.above(all) || !WebCap.on()) return all;
    // the same rules (and the same no-trailer guarantee) on the 1080p-or-lower sources only
    const low = pick.call(this, (streams || []).filter((s) => !WebCap.above(s)), opts);
    if (!low) return all;
    // a cached 4K beats a 1080p that is not cached yet (that one only plays a "downloading" notice)
    if (!WebCap.usable(low) && WebCap.usable(all)) return all;
    return low;
  };
  if (typeof Failover !== 'undefined' && typeof Failover.candidates === 'function') {
    const cands = Failover.candidates;
    Failover.candidates = function () {
      const list = cands.apply(this, arguments);
      if (!Array.isArray(list) || !WebCap.on()) return list;
      return list.filter((s) => !WebCap.above(s)).concat(list.filter((s) => WebCap.above(s)));
    };
  }
  // a short note under "Highest quality for Smart Play" while the MKCinema player is the one in use
  try {
    const pb = typeof secById === 'function' && secById('playback');
    if (pb && typeof pb.rows === 'function') {
      const rows = pb.rows;
      pb.rows = function () {
        const out = rows.apply(this, arguments);
        if (!Array.isArray(out) || !WebCap.on() || (WebCap.cap && WebCap.cap.hevc) || CFG.maxQuality === '1080' || CFG.maxQuality === '720') return out;
        const i = out.findIndex((r) => r && r.key === 'maxQuality');
        if (i < 0) return out;
        const note = { html: () => '<div class="set-row mk-webcap-note"><div><small>In the MKCinema player, Smart Play starts with 1080p, because most 4K files won’t play in a browser. 4K is used when it is the only choice. VLC and the TV player use your full setting.</small></div></div>' };
        return [...out.slice(0, i + 1), note, ...out.slice(i + 1)];
      };
    }
  } catch (e) { /* the note is optional */ }
})();
