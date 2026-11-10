
/* ---------------- 2.46.5 Tidy-ups ----------------
   Episode numbers from addons are kept as plain numbers, a source that never loaded can't move the next film's start
   time, and subtitle files are released when the player closes. */
(function () {
  const num = (x) => { if (x == null || x === '') return x; const n = Number(x); return Number.isFinite(n) ? n : String(x).replace(/[^0-9A-Za-z .\-]/g, '').slice(0, 12); };
  const clean = (m) => {
    if (m && Array.isArray(m.videos)) m.videos.forEach((v) => { if (v && typeof v === 'object') { v.season = num(v.season); v.episode = num(v.episode); if (v.number != null) v.number = num(v.number); } });
    return m;
  };
  if (typeof engine !== 'undefined' && engine.fetchMeta) {
    const fm = engine.fetchMeta;
    engine.fetchMeta = async function () { return clean(await fm.apply(this, arguments)); };
  }
  if (typeof teardown === 'function') {
    const td = teardown;
    teardown = function () {
      if (P._onMeta) { video.removeEventListener('loadedmetadata', P._onMeta); P._onMeta = null; }
      try { clearSubTracks(); } catch (e) { /* nothing loaded */ }
      return td.apply(this, arguments);
    };
  }
})();
