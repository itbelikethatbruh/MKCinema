
/* ---------------- 2.46.4 Faster first screen ----------------
   1. The first featured banner shows a light 480 px copy of its art at once (about 25 KB), then the full picture is
      fetched and swapped in when it has decoded, so phones are not left waiting on a 1-2 MB backdrop.
   2. Phones ask for 1280 px TMDB art in the banner instead of the original file.
   3. The art for the titles either side of the banner waits until the first banner is sharp and the page is quiet,
      so it never competes with the first screen for bandwidth. */
(function () {
  if (IS_TV) return;
  window.MK_WARM_OK = false;
  const net = navigator.connection || {};
  const slow = !!net.saveData || /(^|-)2g|3g/.test(net.effectiveType || '');
  const MH = /^(https:\/\/images\.metahub\.space\/background\/)(medium|large)(\/.+)$/;
  let first = true;
  const okWarm = () => { if (!slow) setTimeout(() => { window.MK_WARM_OK = true; }, 2500); };
  const sh = showHero;
  showHero = function () {
    const r = sh.apply(this, arguments);
    const img = $('#heroBg') && $('#heroBg').lastElementChild;
    if (!img || img.tagName !== 'IMG') { if (first) { first = false; okWarm(); } return r; }
    const src = img.getAttribute('src') || '';
    if (TOUCH_UI && /^https:\/\/image\.tmdb\.org\/t\/p\/original\//.test(src)) img.src = src.replace('/t/p/original/', '/t/p/w1280/');
    if (first) {
      first = false;
      const m = MH.exec(img.getAttribute('src') || '');
      if (!m) { if (img.complete) okWarm(); else img.addEventListener('load', okWarm, { once: true }); return r; }
      const full = img.getAttribute('src');
      img.src = m[1] + 'small' + m[3];
      const go = () => {
        const big = new Image(); big.referrerPolicy = 'no-referrer'; big.decoding = 'async'; big.src = full;
        const swap = () => { if (img.isConnected) img.src = full; okWarm(); };
        (big.decode ? big.decode() : Promise.reject()).then(swap, () => { big.onload = swap; big.onerror = okWarm; if (big.complete) swap(); });
      };
      if (img.complete) go(); else { img.addEventListener('load', go, { once: true }); img.addEventListener('error', () => { img.src = full; okWarm(); }, { once: true }); }
    }
    return r;
  };
})();
