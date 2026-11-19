
(() => {
  const vp = document.querySelector('meta[name="viewport"]'), pl = document.getElementById('player'); if (!vp || !pl) return;
  const FREE = vp.getAttribute('content'), LOCK = FREE + ', minimum-scale=1, maximum-scale=1, user-scalable=no';
  let app = false;
  try { app = /MKCinemaAndroid\//.test(navigator.userAgent) || navigator.standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches; } catch (e) { /* stays a browser tab */ }
  const locked = () => app || !pl.hidden;
  const apply = () => { const on = locked(); const want = on ? LOCK : FREE; if (vp.getAttribute('content') !== want) vp.setAttribute('content', want); document.documentElement.classList.toggle('mk-nozoom', on); };
  new MutationObserver(apply).observe(pl, { attributes: true, attributeFilter: ['hidden'] });
  // iPhone and iPad ignore the viewport lock in Safari: cancel their pinch gesture while locked
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => { if (locked()) e.preventDefault(); }, { passive: false });
  apply();
})();
