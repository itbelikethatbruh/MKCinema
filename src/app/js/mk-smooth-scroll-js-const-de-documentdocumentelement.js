
(() => {
  const de = document.documentElement; let t = 0, on = false;
  // TVs and touch screens have no hovering pointer: the class would only restyle the whole page twice per scroll
  if (de.classList.contains('tv') || !matchMedia('(hover:hover)').matches) return;
  const end = () => { t = 0; on = false; de.classList.remove('mk-scrolling'); };
  const poke = () => {
    if (!on) { on = true; de.classList.add('mk-scrolling'); }
    clearTimeout(t); t = setTimeout(end, 180);
  };
  addEventListener('scroll', poke, { capture: true, passive: true });
  addEventListener('wheel', poke, { capture: true, passive: true });
})();
