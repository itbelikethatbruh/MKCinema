
'use strict';
/* 2.87 player extras */
(() => {
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('2.87b', e); } };
  if (typeof CFG_DEFAULTS === 'object') Object.assign(CFG_DEFAULTS, { resumeBack: 5, skipStub: true, subHdrDim: 25, endsAt: true, subOutlineColor: '#000000', subOutlineStyle: 'classic', warm: 0 });
  ['resumeBack', 'skipStub', 'subHdrDim', 'endsAt', 'subOutlineColor', 'subOutlineStyle', 'warm'].forEach((k) => { if (!(k in CFG)) CFG[k] = CFG_DEFAULTS[k]; });
  const pl = () => document.getElementById('player');

  /* ---- rewind a few seconds when a film or episode resumes, so you catch the last line again ---- */
  safe(() => {
    const ps = playStream;
    playStream = function (ctx, stream, opts) {
      opts = opts || {};
      safe(() => {
        const back = Number(CFG.resumeBack) || 0; if (!back || !ctx || !ctx.meta || opts._mkrb) return;
        const key = ctx.video ? ctx.video.id : ctx.meta.id, pr = S.progress && S.progress[key];
        if (!pr || !(pr.t > 20) || !(pr.t < pr.d * .95)) return;
        let st = opts.startAt; if (st == null && CFG.resume) st = pr.t;
        if (st != null && Math.abs(st - pr.t) < 1.5) opts = Object.assign({}, opts, { startAt: Math.max(0, st - back), _mkrb: 1 });
      });
      return ps.call(this, ctx, stream, opts);
    };
  });

  /* ---- a "ready" source that is really a short placeholder clip (removed file, error video) is skipped ---- */
  const runtimeMin = (m) => { if (!m) return 0; const r = String(m.runtime || ''); const h = /(\d+)\s*h/i.exec(r), mi = /(\d+)\s*min/i.exec(r); return (h ? +h[1] * 60 : 0) + (mi ? +mi[1] : (!h && /^\d+$/.test(r) ? +r : 0)); };
  safe(() => {
    video.addEventListener('loadedmetadata', () => safe(() => {
      if (CFG.skipStub === false || !P.ctx || !P.stream || P.stream._local) return;
      const t = P.stream._tel || {}; if (t.isTrailer || t.kind === 'yt' || P.ctx.live || P.ctx.isLive) return;
      const d = video.duration; if (!isFinite(d) || d <= 0 || d >= 150) return;
      const m = P.ctx.meta || {}, expect = P.ctx.video ? 10 : Math.max(runtimeMin(m), m.type === 'movie' ? 40 : 0);
      if (expect < 10) return;
      if (P.stream._mkStub) return; P.stream._mkStub = true;
      toast('That source is only a short placeholder clip. Trying the next one…', 'info', 3500);
      playerAct('next-src');
    }));
  });

  /* ---- "Ends at" next to the time ---- */
  const Ends = {
    el: null, last: 0,
    mount() { const t = document.getElementById('pTime'); if (!t || document.getElementById('pEnds')) return; t.insertAdjacentHTML('afterend', '<span class="tnum" id="pEnds" hidden></span>'); this.el = document.getElementById('pEnds'); },
    tick() {
      if (!this.el) this.mount(); const el = this.el; if (!el) return;
      const now = Date.now(); if (now - this.last < 1000) return; this.last = now;
      const d = pDur(), c = pNow(), r = video.playbackRate || 1;
      if (CFG.endsAt === false || !isFinite(d) || d < 300 || (P.ctx && (P.ctx.live || P.ctx.isLive))) { el.hidden = true; return; }
      const at = new Date(now + Math.max(0, d - c) / r * 1000);
      el.textContent = `Ends ${at.toLocaleTimeString(typeof appLocale === 'function' ? appLocale() : undefined, { hour: 'numeric', minute: '2-digit' })}`;
      el.hidden = false;
    },
  };
  safe(() => { video.addEventListener('timeupdate', () => safe(() => Ends.tick())); });

  /* ---- subtitles: softer on HDR, outline colour and style ---- */
  const hex = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? h : '#000000');
  function styleSubs() {
    const root = document.documentElement.style;
    // HDR: same colour, darker by the chosen amount
    const dim = clamp(Number(CFG.subHdrDim) || 0, 0, 60);
    root.setProperty('--sub-color-hdr', `color-mix(in srgb, ${CFG.subColor || '#ffffff'} ${100 - dim}%, #000)`);
    const p0 = pl(); if (p0) p0.classList.toggle('mk-subdim', dim > 0);
    // outline colour and style (only when the outline is on)
    if (!CFG.subOutline) return;
    const c = hex(CFG.subOutlineColor), st = CFG.subOutlineStyle || 'classic';
    if (c.toLowerCase() === '#000000' && st === 'classic') return; // the built-in look
    const sh = { none: '', soft: '', strong: '2px 2px 4px #000,3px 3px 8px rgba(0,0,0,.85)', drop: '3px 3px 0 #000' }[CFG.subShadow] || '';
    const out = st === 'thick' ? `-2px -2px 0 ${c},2px -2px 0 ${c},-2px 2px 0 ${c},2px 2px 0 ${c},0 0 3px ${c}`
      : st === 'glow' ? `0 0 4px ${c},0 0 8px ${c},0 0 14px ${c}`
        : `0 0 3px ${c},0 0 2px ${c},1px 1px 2px ${c}`;
    root.setProperty('--sub-shadow', [out, sh].filter(Boolean).join(','));
  }
  CFG_HOOKS.push((k) => { safe(() => styleSubs()); if (k === 'warm') safe(() => Warm.apply()); if (k.startsWith('subOutline') || k === 'subHdrDim') safe(() => { if (typeof styleCues === 'function') styleCues(); }); });

  /* ---- warm screen: an orange veil over the picture for late nights ---- */
  const Warm = {
    apply() {
      const p0 = pl(); if (!p0) return; let w = document.getElementById('mkWarm');
      const v = clamp(Number(CFG.warm) || 0, 0, 60);
      if (!w && v) { const vid = document.getElementById('video'); if (!vid || !vid.parentNode) return; vid.insertAdjacentHTML('afterend', '<div id="mkWarm" aria-hidden="true"></div>'); w = document.getElementById('mkWarm'); }
      if (w) w.style.opacity = String(v / 100 * .6);
    },
  };

  /* ---- settings rows ---- */
  safe(() => {
    const pb = typeof secById === 'function' && secById('playback');
    if (pb) {
      const rows = pb.rows;
      pb.rows = () => { const r = rows(), at = r.findIndex((x) => x.key === 'resume'); r.splice(at >= 0 ? at + 1 : r.length, 0,
        { key: 'resumeBack', label: 'Rewind a little on resume', help: 'Starts a few seconds before where you stopped, so you catch the last line again.', type: 'seg', num: true, options: [[0, 'Off'], [3, '3 s'], [5, '5 s'], [10, '10 s'], [15, '15 s'], [30, '30 s']] },
        { key: 'skipStub', label: 'Skip placeholder clips', help: 'Some sources turn out to be a short clip saying the file is gone. MKCinema notices and moves to the next source.', type: 'toggle', get: () => CFG.skipStub !== false },
        { key: 'endsAt', label: 'Show when it ends', help: 'The time the film or episode will finish, next to the clock in the player.', type: 'toggle', get: () => CFG.endsAt !== false },
        { key: 'warm', label: 'Warm screen', help: 'An orange tint over the picture for late nights, easier on the eyes in a dark room. 0 turns it off.', type: 'range', min: 0, max: 60, step: 10, fmt: pct, live: true });
        return r; };
    }
    const sb = typeof secById === 'function' && secById('subtitles');
    if (sb) {
      const rows = sb.rows;
      sb.rows = () => { const r = rows(), at = r.findIndex((x) => x.key === 'subOutline'); r.splice(at >= 0 ? at + 1 : r.length, 0,
        { key: 'subOutlineColor', label: 'Outline color', type: 'color', get: () => hex(CFG.subOutlineColor) },
        { key: 'subOutlineStyle', label: 'Outline style', type: 'seg', options: [['classic', 'Thin'], ['thick', 'Thick'], ['glow', 'Glow']] },
        { key: 'subHdrDim', label: 'Softer subtitles on HDR films', help: 'White text on an HDR or Dolby Vision film can glare on a bright TV. This draws it a little darker. 0 keeps it as is.', type: 'range', min: 0, max: 60, step: 5, fmt: pct, live: true });
        return r; };
    }
  });
  styleSubs();
  safe(() => { const ps = playStream; playStream = function () { const r = ps.apply(this, arguments); safe(() => { Warm.apply(); styleSubs(); Ends.last = 0; }); return r; }; });
})();
