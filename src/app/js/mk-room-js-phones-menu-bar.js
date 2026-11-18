
/* 2.82.1: on phones the menu bar scrolls sideways; keep the page you are on in view. */
(() => {
  const keep = (smooth) => { const t = document.getElementById('tabs'); if (!t || t.scrollWidth <= t.clientWidth + 1) return; const on = t.querySelector('.tab.on'); if (!on || !on.offsetWidth) return;
    const left = Math.max(0, Math.min(t.scrollWidth - t.clientWidth, on.offsetLeft - (t.clientWidth - on.offsetWidth) / 2));
    if (Math.abs(t.scrollLeft - left) > 2) t.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' }); };
  const start = () => { const t = document.getElementById('tabs'); if (!t) return; keep(false);
    new MutationObserver(() => requestAnimationFrame(() => keep(true))).observe(t, { subtree: true, attributes: true, attributeFilter: ['class'] });
    addEventListener('resize', () => keep(false)); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
