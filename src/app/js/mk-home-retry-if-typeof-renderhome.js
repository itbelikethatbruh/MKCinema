
(() => {
  if (typeof renderHome !== 'function') return;
  let tries = 0, timer = 0;
  const empty = () => {
    try {
      if (S.view !== 'home' || document.hidden || document.body.classList.contains('layer-open')) return false;
      const pl = document.getElementById('player'); if (pl && !pl.hidden) return false;
      const rows = document.getElementById('homeRows'); if (!rows || rows.querySelector('.card,.skeleton')) return false;
      if (engine.offline) return true;
      return Layout.shows('catalogs') && AllRows.list().length > 0;
    } catch (e) { return false; }
  };
  const arm = (ms) => { clearTimeout(timer); timer = setTimeout(() => { if (tries < 2 && navigator.onLine !== false && empty()) { tries++; renderHome(); } }, ms); };
  const rh = renderHome;
  renderHome = function () { const p = rh.apply(this, arguments); Promise.resolve(p).then(() => arm(tries ? 20000 : 8000), () => arm(8000)); return p; };
  addEventListener('online', () => { setTimeout(() => { if (empty()) renderHome(); }, 1500); });
})();
