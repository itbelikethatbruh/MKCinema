
/* 2.88.1 quick start. A few page-wide settings were only switched on by scripts that load after Home is already on
   screen, and each one made the whole page restyle. Set them here, before Home exists; the scripts that own them
   still run later and correct anything that differs. */
(function () {
  try {
    var c = JSON.parse(localStorage.getItem('mkc:cfg') || '{}') || {}, de = document.documentElement, st = de.style;
    if (c.glow !== false) de.classList.add('mk-glow');
    var g = /^#[0-9a-f]{6}$/i.test(c.glowColor || '') ? c.glowColor : '#4aa8ff', n = parseInt(g.slice(1), 16);
    st.setProperty('--glow', g); st.setProperty('--glow-c', (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255));
    de.classList.add('ezb-bar'); if (!de.classList.contains('tv')) de.classList.add('ezb-lean');
    /* mk-290-pill-pre: phone bars from the first paint */
    if (!de.classList.contains('tv') && matchMedia('(max-width: 760px)').matches) { de.classList.add('mk-pill'); if (localStorage.getItem('mkc:pillDown') === '1') de.classList.add('mk-pill-down'); }
    var dim = Math.min(60, Math.max(0, Number(c.subHdrDim == null ? 25 : c.subHdrDim) || 0));
    st.setProperty('--sub-color-hdr', 'color-mix(in srgb, ' + (c.subColor || '#ffffff') + ' ' + (100 - dim) + '%, #000)');
  } catch (e) { /* the app sets these itself a moment later */ }
})();
