
/* 2.83.1: on a TV, Settings › Playback has no outside-player choice; the TV player plays every stream. */
(() => {
  try {
    if (!IS_TV || typeof SECTIONS === 'undefined') return;
    const pb = SECTIONS.find((x) => x.id === 'playback'); if (!pb) return;
    const rows = pb.rows;
    pb.rows = () => rows().filter((r) => r && r.key !== 'extPlayer' && !(typeof r.html === 'function' && /vlcButtons|store-badge/.test(String(r.html))));
  } catch (e) { /* settings not built here */ }
})();
