
/* 2.59.1 steady views: coming back to Home used to replay the featured banner's text fade (title, details and
   buttons dropped out and came back) on top of the page fade. The banner text now only animates when the
   featured film changes. */
(() => {
  if (typeof go !== 'function') return;
  const g0 = go;
  go = function (view) {
    try {
      if (view === 'home' && S.view !== 'home') { const hb = document.querySelector('#hero .hero-body'); if (hb) hb.classList.remove('swap'); }
    } catch (e) { /* the banner just fades as before */ }
    return g0.apply(this, arguments);
  };
  // 2. From one title page to another (More like this, cast, collections): the old backdrop stays under the new
  // one while it loads, so the top of the page no longer goes black before the new picture fades in
  if (typeof renderDetail === 'function') {
    const rd = renderDetail;
    renderDetail = function () {
      let old = null;
      try {
        // a backdrop already held underneath (the page drew again before the new picture came) stays held
        const o = document.querySelector('#detailPanel .d-hero > img.bg.mk-under') || document.querySelector('#detailPanel .d-hero > img.bg');
        if (o && !document.querySelector('#detail').hidden && o.complete && o.naturalWidth && !o.classList.contains('d-wait')) old = o;
      } catch (e) { /* nothing to carry */ }
      const r = rd.apply(this, arguments);
      try {
        const nb = document.querySelector('#detailPanel .d-hero > img.bg');
        if (old && nb && nb !== old && !old.isConnected && nb.classList.contains('d-wait') && old.getAttribute('src') !== nb.getAttribute('src')) {
          old.classList.add('mk-under'); old.classList.remove('d-wait'); old.removeAttribute('data-osrc');
          nb.before(old);
          let gone = false;
          const drop = () => { if (gone) return; gone = true; setTimeout(() => old.remove(), 380); };
          nb.addEventListener('load', drop, { once: true }); nb.addEventListener('error', drop, { once: true }); setTimeout(drop, 6000);
        }
      } catch (e) { /* the new picture just fades in */ }
      return r;
    };
  }
})();
