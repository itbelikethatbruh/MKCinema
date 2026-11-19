
const MkLogoFx = {
  mode() { const v = CFG.logoFx; return v === 'on' || v === 'off' ? v : 'auto'; },
  on() {
    if (CFG.reduceMotion) return false; const m = this.mode(); if (m !== 'auto') return m === 'on';
    return document.body.classList.contains('fx') && !(IS_TV && window.MK_LITE);
  },
  apply() { const on = this.on(), h = document.documentElement; if (h.classList.contains('mk-lfx') === on && h.classList.contains('mk-nolfx') === !on) return; h.classList.toggle('mk-lfx', on); h.classList.toggle('mk-nolfx', !on); if (!on) document.querySelectorAll('.mk-lfx-sh').forEach((x) => x.remove()); else this.hero(); },
  place(img) {
    const wrap = document.getElementById('heroLogoWrap'); if (!wrap || !img.isConnected || img.hidden || !img.offsetWidth || !this.on()) return;
    const w = img.offsetWidth, h = img.offsetHeight; let sh = wrap.querySelector('.mk-lfx-sh');
    if (sh && sh._for === img && sh._w === w && sh._h === h) { sh.style.left = `${img.offsetLeft}px`; return; }
    if (sh) sh.remove();
    sh = document.createElement('span'); sh.className = 'mk-lfx-sh'; sh.setAttribute('aria-hidden', 'true'); sh._for = img; sh._w = w; sh._h = h;
    sh.style.left = `${img.offsetLeft}px`; sh.style.width = `${w}px`; sh.style.height = `${h}px`;
    const win = document.createElement('i'); win.className = 'mk-lfx-w'; win.style.width = `${(w * .3).toFixed(1)}px`; win.style.height = `${h + 24}px`;
    const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.draggable = false; im.src = img.currentSrc || img.src; im.style.width = `${w}px`; im.style.height = `${h}px`; if (img.classList.contains('logo-dark')) im.className = 'dk';
    win.appendChild(im); sh.appendChild(win); wrap.appendChild(sh);
  },
  hero() {
    const wrap = document.getElementById('heroLogoWrap'); if (!wrap) return; const img = wrap.querySelector('img.hero-logo');
    const old = wrap.querySelector('.mk-lfx-sh'); if (old && old._for !== img) old.remove();
    if (!img || !this.on()) return;
    if (img.complete && img.naturalWidth) this.place(img); else img.addEventListener('load', () => this.place(img), { once: true });
  },
  init() {
    const sh = showHero; showHero = function () { const r = sh.apply(this, arguments); try { MkLogoFx.hero(); } catch (e) { /* effect only */ } return r; };
    new MutationObserver(() => this.apply()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    let raf = 0; addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const i = document.querySelector('#heroLogoWrap img.hero-logo'); if (i) this.place(i); }); });
    const perf = secById('performance');
    if (perf) { const rows = perf.rows; perf.rows = () => [...rows(), { key: 'logoFx', label: 'Logo effects', help: 'A soft lift and a light sweep on the logo of the featured title on Home and on title pages. Automatic turns them on where this device keeps up.', type: 'seg', options: [['auto', 'Automatic'], ['on', 'On'], ['off', 'Off']], get: () => MkLogoFx.mode(), set: (v) => { setCfg('logoFx', v); MkLogoFx.apply(); } }]; }
    this.apply();
  },
};
try { MkLogoFx.init(); } catch (e) { console.warn('logo effects off:', e.message); }
