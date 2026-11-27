
/* 2.89 instant Home (TVs): once Home is ready and untouched, save where its banner, menu, row titles and posters sit
   so the next start can show them at once. Nothing is saved while a profile has to be picked first. */
(() => {
  if (typeof IS_TV === 'undefined' || !IS_TV) return;
  const K = 'mkc:fastHome', de = document.documentElement;
  const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const seen = (r) => r.w > 8 && r.h > 8 && r.y < innerHeight && r.y + r.h > 0 && r.x < innerWidth && r.x + r.w > 0;
  const src = (i) => { const u = i.currentSrc || i.src || ''; return /^data:image\/gif/.test(u) ? (i.dataset.lsrc || '') : u; };
  const font = (c) => `${c.fontStyle} ${c.fontWeight} ${c.fontSize}/1 ${c.fontFamily}`;
  const shown = (e) => { const c = getComputedStyle(e); return c.visibility !== 'hidden' && c.display !== 'none' && +c.opacity > 0.2; };
  const clear = () => { try { localStorage.removeItem(K); } catch (e) { /* storage is off */ } };
  const take = () => {
    try {
      if (typeof S === 'undefined' || S.view !== 'home' || scrollY > 4 || de.classList.contains('seat-gate') || de.classList.contains('booting')) return false;
      if (document.body.classList.contains('layer-open') || document.querySelector('.layer-ov.on, .modal.on, dialog[open]')) return false;
      if (typeof Seats !== 'undefined' && Seats.list && Seats.list().length > 1) return false;
      const out = [], hero = document.getElementById('hero');
      if (hero && !hero.hidden) {
        const r = R(hero), bg = document.querySelector('#heroBg img'), o = { k: 'hero', ...r, r: getComputedStyle(hero).borderRadius, hid: (S.hero && S.hero[S.heroIdx] && S.hero[S.heroIdx].id) || '' };
        if (bg && bg.complete && bg.naturalWidth) { const b = R(bg); const bc = getComputedStyle(bg); Object.assign(o, { src: src(bg), ix: b.x - r.x, iy: b.y - r.y, iw: b.w, ih: b.h, op: bc.objectPosition, io: bc.opacity, fl: bc.filter === 'none' ? '' : bc.filter }); }
        o.sc = [[hero, '::before'], [hero, '::after'], [document.getElementById('heroBg'), '::before'], [document.getElementById('heroBg'), '::after']].map(([e, p]) => { try { const c = getComputedStyle(e, p); return c.content !== 'none' && c.backgroundImage !== 'none' && c.display !== 'none' ? c.backgroundImage : ''; } catch (e2) { return ''; } }).filter(Boolean).join('|').slice(0, 1500);
        o.bd = `${getComputedStyle(hero).borderTopWidth} solid ${getComputedStyle(hero).borderTopColor}`;
        out.push(o);
        const logo = document.querySelector('#heroLogoWrap img'), title = document.querySelector('#heroLogoWrap .hero-title');
        if (logo && logo.complete && logo.naturalWidth && shown(logo)) out.push({ k: 'img', ...R(logo), src: src(logo), fit: 'contain' });
        else if (title && shown(title)) { const c = getComputedStyle(title); out.push({ k: 'txt', ...R(title), t: title.textContent.trim().slice(0, 80), f: font(c), c: c.color }); }
      }
      if (hero && !hero.hidden) {
        const line = (e, wrap) => { if (!e || !shown(e)) return; const r = R(e); if (!seen(r)) return; const c = getComputedStyle(e), t = e.textContent.replace(/\s+/g, ' ').trim().slice(0, 400); if (t) out.push({ k: 'txt', ...r, t, f: font(c), c: c.color, ls: c.letterSpacing === 'normal' ? '' : c.letterSpacing, tt: c.textTransform === 'none' ? '' : c.textTransform, wr: wrap ? c.lineHeight : '' }); };
        line(document.getElementById('heroEyebrow')); line(document.getElementById('heroDesc'), true);
        document.querySelectorAll('#heroMeta > *').forEach((e) => line(e));
        document.querySelectorAll('#hero .actions .btn').forEach((e) => { if (!shown(e)) return; const r = R(e); if (!seen(r)) return; const c = getComputedStyle(e); const lab = e.querySelector('.sp-l') ? e.querySelector('.sp-l').firstChild.textContent : e.textContent;
          out.push({ k: 'txt', ...r, t: lab.trim().slice(0, 30), f: font(c), c: c.color, ce: 1, r: c.borderRadius, bg: c.backgroundColor, bd: `${c.borderTopWidth} solid ${c.borderTopColor}` }); });
      }
      const dock = document.querySelector('.dock #tabs') || document.getElementById('tabs');
      if (dock && shown(dock)) {
        const c = getComputedStyle(dock); out.push({ k: 'box', ...R(dock), r: c.borderRadius, bg: c.backgroundColor, bd: `${c.borderTopWidth} solid ${c.borderTopColor}` });
        dock.querySelectorAll('.tab').forEach((t) => { const r = R(t); if (!seen(r) || !shown(t)) return; const tc = getComputedStyle(t); const on = t.classList.contains('on');
          let bg = ''; if (on) { bg = tc.backgroundColor; if (/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { for (const p of ['::before', '::after']) { const pc = getComputedStyle(t, p); if (pc.content !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(pc.backgroundColor)) bg = pc.backgroundColor; else if (pc.content !== 'none' && pc.backgroundImage !== 'none') bg = pc.backgroundImage; } } if (/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) bg = '#ece7dc'; }
          out.push({ k: 'txt', ...r, t: t.textContent.trim().slice(0, 30), f: font(tc), c: tc.color, ce: 1, r: tc.borderRadius, bg }); });
      }
      document.querySelectorAll('#homeRows .row-title').forEach((t) => { const r = R(t); if (!seen(r) || !shown(t)) return; const c = getComputedStyle(t); out.push({ k: 'txt', ...r, t: t.textContent.trim().slice(0, 60), f: font(c), c: c.color, ls: c.letterSpacing === 'normal' ? '' : c.letterSpacing }); });
      let pics = 0;
      document.querySelectorAll('#homeRows img').forEach((i) => {
        const r = R(i); if (!seen(r) || r.w < 40 || !src(i) || !i.complete || !shown(i)) return;
        const card = i.closest('.card, .net-tile, .uni-card') || i; if (i !== card && R(i).w < R(card).w * 0.6) { out.push({ k: 'img', ...r, src: src(i), fit: 'contain' }); return; }
        out.push({ k: 'img', ...r, src: src(i), r: getComputedStyle(card).borderRadius }); pics++;
      });
      if (pics < 3 && !(out[0] && out[0].k === 'hero' && out[0].src)) return false;
      const json = JSON.stringify({ v: 1, w: innerWidth, h: innerHeight, bg: getComputedStyle(document.body).backgroundColor, i: out });
      if (json.length > 24000) return false;
      localStorage.setItem(K, json); return true;
    } catch (e) { return false; }
  };
  let tries = 0;
  const later = (ms) => setTimeout(() => { if (!take() && ++tries < 6) later(4000); }, ms);
  const wait = setInterval(() => { if (!de.classList.contains('booting')) { clearInterval(wait); later(3500); } }, 300);
  // a different account or profile must never see the last one's Home
  try { if (typeof Account !== 'undefined' && Account.signedOut) { const so = Account.signedOut; Account.signedOut = function () { clear(); return so.apply(this, arguments); }; } } catch (e) { /* no accounts */ }
  /* 2.96.2 tv speed */
  let lastSave = 0, idleT = 0;
  const quiet = () => { if (Date.now() - lastSave < 20000 || de.classList.contains('ezb-menu-open') || document.querySelector('.focus-ask, .sup-ask')) return; if (take()) lastSave = Date.now(); };
  document.addEventListener('keydown', () => { clearTimeout(idleT); idleT = setTimeout(quiet, 2500); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { lastSave = 0; quiet(); } });
  window.MkFastHome = { take, clear };
})();
