/* ---------------- 2.27.0 TV player engine ----------------
   TV app 1.7.0 plays streams with ExoPlayer (Media3), the engine most Android TV apps use: MKV, HLS, picture
   subtitles (PGS), every audio track by name, and request headers on every request. If ExoPlayer can't open a file,
   the TV's basic player (the 1.2.5 to 1.6.x engine) tries it before MKCinema's own player does.
   Settings › Playback › TV player engine can force the basic player; the app keeps the choice (MKAndroid.setEngine). */
const TvEngine = {
  can() { try { return IS_TV && !!window.MKAndroid && typeof MKAndroid.setEngine === 'function'; } catch (e) { return false; } },
  push() { if (this.can()) try { MKAndroid.setEngine(CFG.tvEngine === 'system' ? 'system' : 'exo'); } catch (e) { /* older app */ } },
};
{
  const sc = setCfg;
  setCfg = function (k, v) { const r = sc.apply(this, arguments); if (k === 'tvEngine') TvEngine.push(); return r; };
  const sec = SECTIONS.find((s) => s.id === 'playback');
  if (sec && TvEngine.can()) {
    const rows = sec.rows;
    sec.rows = () => { const r = rows(); const at = r.findIndex((x) => x.key === 'tvPlayer'); r.splice(at < 0 ? r.length : at + 1, 0, { key: 'tvEngine', label: 'TV player engine', help: 'ExoPlayer is the engine most Android TV apps use. It handles MKV, picture subtitles and audio tracks more reliably. If it can’t open a file, the basic player tries it next. Pick the basic player only if a file plays better that way.', type: 'select', options: [['exo', 'ExoPlayer (recommended)'], ['system', 'Basic player']], get: () => (CFG.tvEngine === 'system' ? 'system' : 'exo') }); return r; };
  }
  setTimeout(() => TvEngine.push(), 1500); // a choice synced from another device reaches this TV's app
}
