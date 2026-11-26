"use strict";
/* 2.93.7 Subtitles that fit the picture + easy subtitle choices.
   1. SubFit draws subtitles itself, inside the picture (not the screen's black bars), centred, sized from the picture.
      The browser's own subtitle drawing is hidden (html.mk-subov) but its track still runs the timing, so delay,
      auto-sync, translation, Learn, glasses and the phone subtitle view keep working unchanged.
      Where the page cannot draw over the video (iPhone's own full-screen player, picture in picture) the browser's
      drawing comes back by itself.
   2. SubEasy: Size / Style / Position chips with a live preview in Settings > Subtitles and in the player's
      Audio & subtitles panel. Every older control stays under "More choices". */
(() => {
  const safe = f => { try { return f(); } catch (e) { console.warn('2.93.7 subs', e); } };
  const $1 = (s, r) => (r || document).querySelector(s);
  const vid = () => document.getElementById('video');
  const SIZES = [['75', 'Small'], ['100', 'Medium'], ['130', 'Large'], ['165', 'Extra large']];
  const LOOKS = [['stream', 'Clean'], ['box', 'Dark box'], ['yellow', 'Yellow']];
  const POS = [['bottom', 'Bottom'], ['higher', 'Raised'], ['top', 'Top']];

  // Two more one-tap looks next to the existing Streaming (= Clean) and TV captions looks.
  safe(() => {
    if (typeof SUB_LOOKS !== 'object') return;
    // Dark box = the factory look (white on a 65% black box), so nobody's subtitles change unless they pick.
    SUB_LOOKS.box = SUB_LOOKS.box || { subFont: 'stream', subColor: '#ffffff', subBg: 65, subBgColor: '#000000', subOutline: true, subBold: false, subShadow: 'soft' };
    SUB_LOOKS.yellow = SUB_LOOKS.yellow || { subFont: 'stream', subColor: '#ffd84a', subBg: 0, subBgColor: '#000000', subOutline: true, subBold: true, subShadow: 'strong' };
  });

  const sizeNow = () => { const n = Number(CFG.subSize) || 100; return Math.min(250, Math.max(50, n)); };
  const sizeKey = () => { const n = sizeNow(); let best = null, d = 1e9; for (const [v] of SIZES) { const k = Math.abs(n - Number(v)); if (k < d) { d = k; best = v; } } return d <= 14 ? best : ''; };
  const posNow = () => (CFG.subPos === 'higher' || CFG.subPos === 'top') ? CFG.subPos : 'bottom';
  // Font size for a picture of w x h CSS px: about 5% of the picture height, never smaller than 2.4% of its width
  // (wide films have short pictures), so it grows and shrinks with the picture on every screen.
  const fontFor = (w, h) => {
    const base = Math.max(h * 0.05, w * 0.024);
    return Math.max(14, Math.min(base * sizeNow() / 100, h * 0.16));
  };

  /* ---------- 1. SubFit: our own subtitle layer ---------- */
  const SubFit = window.SubFit = {
    el: null, key: '', box: null,
    ensure() {
      const v = vid(); if (!v) return null;
      if (!this.el) {
        const d = document.createElement('div');
        d.id = 'mkSubs'; d.setAttribute('aria-live', 'off'); d.setAttribute('aria-hidden', 'true'); d.hidden = true;
        this.el = d;
      }
      if (!this.el.isConnected || this.el.parentNode !== v.parentNode) v.insertAdjacentElement('afterend', this.el);
      return this.el;
    },
    nativeOnly() {
      const v = vid(); if (!v) return true;
      return !!(v.webkitDisplayingFullscreen || document.pictureInPictureElement === v || v.webkitPresentationMode === 'picture-in-picture' || document.documentElement.classList.contains('pip-mode'));
    },
    syncMode() { document.documentElement.classList.toggle('mk-subov', !this.nativeOnly()); },
    tracks() {
      const v = vid(); if (!v || !v.textTracks) return [];
      return Array.from(v.textTracks).filter(t => t.mode === 'showing' && t.kind !== 'metadata' && t.kind !== 'chapters');
    },
    cues() {
      const out = [];
      for (const t of this.tracks()) { const a = t.activeCues; if (a) for (let i = 0; i < a.length; i++) out.push(a[i]); }
      return out.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
    },
    render() {
      const el = this.ensure(); if (!el) return;
      this.syncMode();
      const pl = document.getElementById('player');
      const off = !pl || pl.hidden || (window.MkNative && MkNative.active) || (typeof P === 'object' && P.curSub < 0);
      const cues = off ? [] : this.cues();
      const key = cues.map(c => c.startTime + '|' + c.text).join('\n');
      if (key === this.key && !el.hidden === !!cues.length) return;
      this.key = key;
      el.textContent = '';
      for (const c of cues) {
        const row = document.createElement('div'); row.className = 'mks-c';
        const sp = document.createElement('span');
        let frag = null;
        try { frag = typeof c.getCueAsHTML === 'function' ? c.getCueAsHTML() : null; } catch { frag = null; }
        if (frag && frag.textContent.trim()) sp.appendChild(frag); else sp.textContent = String(c.text || '').replace(/<[^>]+>/g, '');
        if (!sp.textContent.trim()) continue;
        row.appendChild(sp); el.appendChild(row);
      }
      el.hidden = !el.childNodes.length;
      if (!el.hidden) this.layout();
    },
    pic() {
      const v = vid(); if (!v) return null;
      const st = v.parentNode.getBoundingClientRect(), r = v.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const iw = v.videoWidth, ih = v.videoHeight;
      let x = r.left, y = r.top, w = r.width, h = r.height;
      if (iw && ih) {
        const fit = getComputedStyle(v).objectFit || 'contain';
        if (fit !== 'fill') {
          const k = fit === 'cover' ? Math.max(r.width / iw, r.height / ih) : Math.min(r.width / iw, r.height / ih);
          w = iw * k; h = ih * k; x = r.left + (r.width - w) / 2; y = r.top + (r.height - h) / 2;
        }
      }
      // Only the part of the picture that is on screen counts (zoom, crop, cover).
      const L = Math.max(x, st.left, 0), T = Math.max(y, st.top, 0);
      const R = Math.min(x + w, st.right, innerWidth), B = Math.min(y + h, st.bottom, innerHeight);
      if (R - L < 40 || B - T < 30) return null;
      return { st, L, T, W: R - L, H: B - T, VT: Math.max(st.top, 0), VB: Math.min(st.bottom, innerHeight) };
    },
    layout() {
      const el = this.el; if (!el || el.hidden) return;
      const p = this.pic(); if (!p) return;
      const s = el.style, pos = posNow(), fs = fontFor(p.W, p.H);
      s.fontSize = fs.toFixed(1) + 'px';
      // Bottom (the default) and Top use the black bar under / over the picture when it can hold two lines, so the
      // words stay out of the film (Owner 2026-11-23: "out the way"). Without a bar: just inside the picture's edge.
      const need = fs * 1.32 * 2 + fs * 0.3;
      const barB = p.VB - (p.T + p.H), barT = p.T - p.VT;
      let top = p.T, h = p.H, pad, jc;
      if (pos === 'bottom' && barB >= need) { top = p.T + p.H; h = barB; const mid = barB <= need * 3; pad = `${(fs * (mid ? 0.15 : 0.8)).toFixed(1)}px 5% 0`; jc = mid && barB > need * 1.4 ? 'center' : 'flex-start'; }
      else if (pos === 'top' && barT >= need) { top = p.VT; h = barT; const mid = barT <= need * 3; pad = `0 5% ${(fs * (mid ? 0.15 : 0.8)).toFixed(1)}px`; jc = mid && barT > need * 1.4 ? 'center' : 'flex-end'; }
      else if (pos === 'top') { pad = `${(p.H * 0.06).toFixed(1)}px 5% 0`; jc = 'flex-start'; }
      else { pad = `0 5% ${(p.H * (pos === 'higher' ? 0.17 : 0.065)).toFixed(1)}px`; jc = 'flex-end'; }
      s.left = (p.L - p.st.left) + 'px'; s.top = (top - p.st.top) + 'px'; s.width = p.W + 'px'; s.height = h + 'px';
      s.padding = pad; s.justifyContent = jc;
      el.dataset.inBar = String(top !== p.T || h !== p.H);
      this.lift(p);
    },
    lift(p) {
      const el = this.el; if (!el) return;
      let up = 0;
      const hud = document.getElementById('hud');
      if (posNow() !== 'top' && hud && !hud.classList.contains('idle') && !el.hidden) {
        // Stay above the title and controls: the redesigned player marks its title block #rxInfo; older layouts .hud-bot.
        const info = document.getElementById('rxInfo');
        const bot = (info && info.getBoundingClientRect().height ? info : null) || $1('.hud-bot', hud), rows = el.children;
        if (bot && rows.length) {
          const b = bot.getBoundingClientRect(), last = rows[rows.length - 1].getBoundingClientRect();
          if (b.height > 0 && getComputedStyle(bot).visibility !== 'hidden' && Number(getComputedStyle(hud).opacity) > 0.05) {
            const cur = (parseFloat((el.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0);
            const bottomNow = last.bottom - cur; // where the last line sits without a lift
            up = Math.max(0, Math.min(bottomNow - (b.top - 6), p.H * 0.55));
          }
        }
      }
      const t = up > 0.5 ? `translateY(${(-up).toFixed(1)}px)` : '';
      if (el.style.transform !== t) el.style.transform = t;
    },
    bindTrack(t) {
      if (!t || t._mkSubFit) return; t._mkSubFit = 1;
      t.addEventListener('cuechange', () => this.render());
    },
    init() {
      const v = vid(); if (!v) return;
      this.ensure(); this.syncMode();
      const tt = v.textTracks;
      if (tt) {
        Array.from(tt).forEach(t => this.bindTrack(t));
        tt.addEventListener('addtrack', e => { this.bindTrack(e.track); this.render(); });
        tt.addEventListener('change', () => { Array.from(tt).forEach(t => this.bindTrack(t)); this.key = '~'; this.render(); });
        tt.addEventListener('removetrack', () => this.render());
      }
      // timeupdate is a safety net for browsers that skip cuechange after seeks or cue edits (delay, auto-sync).
      ['timeupdate', 'seeked', 'loadedmetadata', 'emptied', 'play'].forEach(n => v.addEventListener(n, () => this.render()));
      ['webkitbeginfullscreen', 'webkitendfullscreen', 'enterpictureinpicture', 'leavepictureinpicture', 'webkitpresentationmodechanged']
        .forEach(n => v.addEventListener(n, () => { this.syncMode(); this.render(); }));
      const relayout = () => requestAnimationFrame(() => this.layout());
      addEventListener('resize', relayout); addEventListener('orientationchange', () => setTimeout(relayout, 250));
      document.addEventListener('fullscreenchange', () => setTimeout(relayout, 60));
      document.addEventListener('webkitfullscreenchange', () => setTimeout(relayout, 60));
      if (window.ResizeObserver) new ResizeObserver(relayout).observe(v);
      new MutationObserver(relayout).observe(v, { attributes: true, attributeFilter: ['style', 'class'] });
      const hud = document.getElementById('hud');
      if (hud) new MutationObserver(() => this.lift(this.pic() || { H: 0 })).observe(hud, { attributes: true, attributeFilter: ['class', 'style'] });
      const pl = document.getElementById('player');
      if (pl) new MutationObserver(() => { this.key = '~'; this.render(); }).observe(pl, { attributes: true, attributeFilter: ['hidden'] });
      if (typeof CFG_HOOKS === 'object' && CFG_HOOKS.push) CFG_HOOKS.push(k => { if (k === 'subSize' || k === 'subPos') relayout(); });
      // Cues added after the track turned on (MKV subtitles stream in) do not always fire cuechange.
      setInterval(() => { const pl2 = document.getElementById('player'); if (pl2 && !pl2.hidden) this.render(); }, 400);
      this.render();
    }
  };

  /* ---------- 2. SubEasy: simple choices ---------- */
  const chips = (name, list, cur, label) => `<div class="sbe-row"><b>${label}</b><div class="sbe-chips" role="radiogroup" aria-label="${label}">${
    list.map(([v, t]) => `<button type="button" role="radio" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}" data-sbe-${name}="${v}">${t}</button>`).join('')}</div></div>`;
  // The chip that matches what is set now (by the values, so older settings light up the right chip too).
  const lookNow = () => {
    if (typeof SUB_LOOKS !== 'object') return '';
    const same = (a, b) => String(a == null ? '' : a).toLowerCase() === String(b).toLowerCase();
    for (const [k] of LOOKS) { const L = SUB_LOOKS[k]; if (L && Object.keys(L).every(x => same(x === 'subBgColor' && CFG[x] == null ? '#000000' : CFG[x], L[x]))) return k; }
    return 'custom';
  };
  const blockHTML = preview => `<div class="sbe">${preview ? '<div class="sbe-pv" aria-hidden="true"><div class="sbe-line"><span>This is how subtitles will look.</span></div></div>' : ''}${
    chips('size', SIZES, sizeKey(), 'Size')}${chips('look', lookNow() === 'custom' ? [...LOOKS, ['custom', 'Your own']] : LOOKS, lookNow(), 'Style')}${chips('pos', POS, posNow(), 'Position')}</div>`;
  const paintPreview = root => safe(() => {
    const pv = $1('.sbe-pv', root); if (!pv) return;
    const r = pv.getBoundingClientRect(); if (!r.width) return;
    const line = $1('.sbe-line', pv), pos = posNow();
    line.style.fontSize = fontFor(r.width, r.height).toFixed(1) + 'px';
    // The preview is a wide film with black bars (18% each): Bottom and Top sit in the bars, Raised inside the picture.
    const bar = r.height * 0.18, ph = r.height - 2 * bar, lh = line.getBoundingClientRect().height;
    line.style.fontSize = fontFor(r.width, ph).toFixed(1) + 'px';
    const lh2 = line.getBoundingClientRect().height || lh;
    line.style.top = pos === 'top' ? Math.max(0, (bar - lh2) / 2).toFixed(1) + 'px' : 'auto';
    line.style.bottom = pos === 'top' ? 'auto' : (pos === 'higher' ? bar + ph * 0.17 : Math.max(0, (bar - lh2) / 2)).toFixed(1) + 'px';
  });
  const pick = (kind, v) => {
    if (kind === 'size') setCfg('subSize', Number(v));
    else if (kind === 'pos') setCfg('subPos', v);
    else if (kind === 'look' && v !== 'custom' && typeof setSubLook === 'function') setSubLook(v);
    safe(() => SubFit.layout());
  };
  const refocus = (root, kind, v) => safe(() => {
    const b = $1(`[data-sbe-${kind}="${CSS.escape(v)}"]`, root || document); if (!b) return;
    if (typeof IS_TV !== 'undefined' && IS_TV && typeof Nav === 'object' && Nav.focus) Nav.focus(b, true); else b.focus({ preventScroll: true });
  });
  const bindChips = (root, after) => {
    root.querySelectorAll('[data-sbe-size],[data-sbe-look],[data-sbe-pos]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const kind = b.hasAttribute('data-sbe-size') ? 'size' : b.hasAttribute('data-sbe-look') ? 'look' : 'pos';
      const v = b.getAttribute('data-sbe-' + kind);
      pick(kind, v); after(kind, v);
    }));
  };

  let moreOpen = false;
  const Settings = {
    busy: false,
    run() {
      if (this.busy) return; this.busy = true;
      try {
        const body = document.getElementById('setBody'); if (!body) return;
        const anchor = $1('#set-subSize', body); if (!anchor) return;
        const card = anchor.closest('.set-card'); if (!card || $1(':scope > .sbe', card)) return;
        // The old small preview card at the top of the page is replaced by the live one below.
        body.querySelectorAll('.set-card').forEach(c => { if (c !== card && c.children.length === 1 && /This is how subtitles will look/.test(c.textContent) && !c.querySelector('.set-row')) c.classList.add('sbe-pre-hidden'); });
        const wrap = document.createElement('div');
        wrap.innerHTML = blockHTML(true);
        const sbe = wrap.firstElementChild;
        const more = document.createElement('button');
        more.type = 'button'; more.className = 'sbe-more'; more.setAttribute('aria-expanded', String(moreOpen));
        more.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>' + `<span>${moreOpen ? 'Fewer choices' : 'More choices'}</span>`;
        sbe.appendChild(more);
        card.prepend(sbe);
        card.classList.toggle('sbe-hide-more', !moreOpen);
        more.addEventListener('click', e => {
          e.stopPropagation(); moreOpen = !moreOpen;
          card.classList.toggle('sbe-hide-more', !moreOpen);
          more.setAttribute('aria-expanded', String(moreOpen));
          const sp = document.createElement('span'); sp.textContent = moreOpen ? 'Fewer choices' : 'More choices';
          more.querySelector('span').replaceWith(sp); // a new node, so the page translator picks it up
        });
        bindChips(sbe, (kind, v) => {
          if (kind === 'look' && v === 'custom') { if (!moreOpen) more.click(); return; }
          if (typeof renderSettingsBody === 'function') renderSettingsBody();
          setTimeout(() => refocus(document.getElementById('setBody'), kind, v), 30);
        });
        requestAnimationFrame(() => paintPreview(sbe));
      } finally { this.busy = false; }
    },
    init() {
      const go = () => { const b = document.getElementById('setBody'); if (b && !b._sbe) { b._sbe = 1; new MutationObserver(() => this.run()).observe(b, { childList: true, subtree: true }); this.run(); } };
      go(); setTimeout(go, 1500); setTimeout(go, 5000);
      addEventListener('resize', () => { const b = document.getElementById('setBody'); b && paintPreview(b); });
    }
  };

  const Panel = {
    patch(menu) {
      if (!menu) return;
      const old = menu.querySelector('[data-ssize]'); if (!old) return;
      const row = old.closest('.seg-row'); if (!row) return;
      const h = row.previousElementSibling;
      const wrap = document.createElement('div'); wrap.innerHTML = blockHTML(false);
      const sbe = wrap.firstElementChild;
      row.replaceWith(sbe);
      if (h && h.tagName === 'H5') h.remove();
      // The delay buttons move into the same compact list (their own click handlers come along).
      const dl = menu.querySelector('[data-delay]'), drow = dl && dl.closest('.seg-row');
      if (drow) {
        const dh = drow.previousElementSibling; if (dh && dh.tagName === 'H5') dh.remove();
        const r = document.createElement('div'); r.className = 'sbe-row sbe-delay';
        const b = document.createElement('b'); b.textContent = 'Delay'; r.appendChild(b);
        drow.classList.add('sbe-chips'); r.appendChild(drow); sbe.prepend(r);
      }
      bindChips(sbe, (kind, v) => { if (typeof renderSubMenu === 'function') renderSubMenu(); setTimeout(() => refocus(document.getElementById('subMenu'), kind, v), 30); });
    },
    init() {
      if (typeof renderSubMenu !== 'function' || renderSubMenu._sbe) return;
      const orig = renderSubMenu;
      const wrapped = function () { const r = orig.apply(this, arguments); safe(() => Panel.patch(document.getElementById('subMenu'))); return r; };
      wrapped._sbe = 1;
      renderSubMenu = wrapped; // eslint-disable-line no-global-assign
    }
  };

  const start = () => { safe(() => SubFit.init()); safe(() => Settings.init()); safe(() => Panel.init()); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();