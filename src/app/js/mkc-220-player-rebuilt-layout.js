
/* ---------------- 2.20.0 The player, rebuilt ----------------
   Layout: the picture fills the screen edge to edge (the framed "theatre" look with its glow is now an option), the
   times sit either side of the seek bar, and a click on the right-hand time switches between length, time left and
   the clock time it ends. The options menu is split into Playback, Picture, Audio and More tabs.
   New: volume up to 200 %, picture adjustments, frame-by-frame, phone gestures (hold for 2x, swipe for brightness,
   volume and seeking), per-title memory of speed and subtitle timing, playback stats (I) and a shortcut sheet (?).
   Listen on phone: a paired phone remote plays the film's sound, so you can watch on the TV with headphones. */
const PX_TV = IS_TV;
const PX_TOUCH = () => TOUCH_PLAYER.matches || TOUCH_UI;
const PxUtil = {
  fmtClock(d) { try { return d.toLocaleTimeString(appLocale(), { hour: 'numeric', minute: '2-digit' }); } catch (e) { return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; } },
  svg(path) { return `<svg class="px-i" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`; },
};

/* ---- Layout ---- */
const PxLayout = {
  endMode: 'total', // total | left | clock
  init() {
    const seek = $('#seek'); if (!seek || $('#pxSeekRow')) return;
    const row = document.createElement('div'); row.className = 'px-seekrow'; row.id = 'pxSeekRow';
    seek.before(row);
    row.innerHTML = '<span class="px-t tnum" id="pxCur">0:00</span>';
    row.appendChild(seek);
    row.insertAdjacentHTML('beforeend', '<button class="px-t px-end tnum" id="pxEnd" type="button" title="Show time left, or when it ends">0:00</button>');
    this.endMode = Store.get('pxEnd', 'total');
    $('#pxEnd').onclick = (e) => { e.stopPropagation(); this.endMode = { total: 'left', left: 'clock', clock: 'total' }[this.endMode] || 'total'; Store.set('pxEnd', this.endMode); this.paint(); wakeHud(); };
    // speed chip: the current speed at a glance, a tap opens the Playback tab
    const sp = document.createElement('button'); sp.className = 'ibtn px-speed tnum'; sp.id = 'pxSpeed'; sp.type = 'button'; sp.title = 'Speed'; sp.setAttribute('aria-label', 'Playback speed');
    sp.textContent = '1×'; $('#pSubs').before(sp);
    sp.onclick = () => PxMenu.open('play');
    // the waveform button is the Audio tab now (language, volume boost, Night Mode, Listen on phone)
    const ad = $('#pDsp'); ad.title = 'Audio (A)'; ad.setAttribute('aria-label', 'Audio'); ad.classList.remove('pp-desk'); ad.onclick = () => PxMenu.open('audio');
    $('#pSubs').title = 'Subtitles (C)';
    $('#pOpts').title = 'Playback, picture and more (O)';
    $('#player').classList.toggle('theatre', this.theatre());
    P.amb = this.theatre();
    $('#pAmb').classList.toggle('on', P.amb);
    $('#pAmb').onclick = () => this.setTheatre(!this.theatre());
    ['timeupdate', 'durationchange', 'loadedmetadata', 'ratechange', 'seeked', 'play', 'pause'].forEach((ev) => video.addEventListener(ev, () => this.paint()));
    // the clock repaint runs only while the player shows
    { const pl = $('#player'); let ck = 0; const on = () => { if (pl.hidden) { clearInterval(ck); ck = 0; } else if (!ck) ck = setInterval(() => { if (this.endMode === 'clock' && !pl.hidden) this.paint(); }, 15000); }; new MutationObserver(on).observe(pl, { attributes: true, attributeFilter: ['hidden'] }); on(); }
  },
  theatre() { return !!CFG.pxTheatre && !PX_TV && !PX_TOUCH(); },
  setTheatre(on) {
    setCfg('pxTheatre', !!on); P.amb = this.theatre();
    $('#player').classList.toggle('theatre', P.amb); $('#pAmb').classList.toggle('on', P.amb); $('#amb').style.opacity = P.amb ? '' : '0';
    if (P.amb && P.ctx) startAmbilight();
    if (P.aspect && P.aspect.includes(':')) requestAnimationFrame(applyPicture);
    toast(P.amb ? 'Theatre view: framed, with the colour glow' : 'Full-screen view', 'info', 1600);
    if (!$('#optMenu').hidden) renderOptMenu();
  },
  paint() {
    const cur = $('#pxCur'), end = $('#pxEnd'); if (!cur) return;
    const d = pDur(), t = pNow() || 0, live = !isFinite(d) && !Number.isNaN(d);
    const sp = $('#pxSpeed'); if (sp) { const r = video.playbackRate || 1; sp.textContent = `${r}×`; sp.classList.toggle('on', r !== 1); }
    if (live) { cur.textContent = fmtTime(t); end.textContent = 'LIVE'; return; }
    if (!(d > 0)) return;
    cur.textContent = fmtTime(t);
    const left = Math.max(0, d - t), rate = video.playbackRate || 1;
    end.textContent = this.endMode === 'left' ? `−${fmtTime(left)}` : this.endMode === 'clock' ? `Ends ${PxUtil.fmtClock(new Date(Date.now() + left / rate * 1000))}` : fmtTime(d);
  },
};

/* ---- Options menu as tabs ---- */
const PxMenu = {
  tab: 'play',
  TABS: [['play', 'Playback'], ['pic', 'Picture'], ['audio', 'Audio'], ['more', 'More']],
  where(h) {
    const k = String(h || '').trim().toLowerCase();
    if (/^(speed|quality|tools|subtitle timing)/.test(k)) return 'play';
    if (/^(aspect|zoom|picture|view)/.test(k)) return 'pic';
    if (/^(audio|volume|night|listen)/.test(k)) return 'audio';
    return 'more';
  },
  open(tab) {
    const m = $('#optMenu'); if (tab) this.tab = tab;
    $('#subMenu').hidden = true; $('#dspPop').hidden = true; closeDrawers();
    if (!m.hidden && tab && m.dataset.tab === tab) { m.hidden = true; return; }
    m.hidden = false; renderOptMenu(); wakeHud(true);
    if (IS_TV) setTimeout(() => { const f = $(`#optMenu .px-tabs [data-pxtab="${this.tab}"]`); if (f) Nav.focus(f, true); }, 40);
  },
  /* runs after every other part of the menu has drawn itself: our sections go in, then everything is sorted into tabs */
  tabify() {
    const m = $('#optMenu'); if (!m || !P.stream) return;
    m.insertAdjacentHTML('beforeend', PxAudio.html() + PxPicture.html() + PxMore.html());
    // cut the menu into headed segments, each with its tab and an order inside that tab
    const segs = []; let seg = null;
    const ORDER = ['speed', 'quality', 'volume', 'audio language', 'night', 'listen', 'picture', 'aspect', 'zoom', 'tools', 'info'];
    const rank = (h) => { const k = h.toLowerCase(), i = ORDER.findIndex((o) => k.startsWith(o)); return i < 0 ? 50 : i; };
    Array.from(m.children).forEach((el) => {
      if (el.tagName === 'H5') { seg = { tab: this.where(el.textContent), r: rank(el.textContent), els: [el] }; segs.push(seg); return; }
      // Night Mode lives under MORE but belongs to Audio; the theatre switch belongs to Picture
      if (el.dataset && el.dataset.pp === 'dsp') { segs.push({ tab: 'audio', r: rank('night'), els: [el] }); return; }
      if (el.matches && el.matches('[data-amb]')) { segs.push({ tab: 'pic', r: 60, els: [el] }); return; }
      if (!seg) { seg = { tab: 'more', r: 50, els: [] }; segs.push(seg); }
      seg.els.push(el);
    });
    const groups = { play: [], pic: [], audio: [], more: [] };
    segs.map((x, i) => ({ ...x, i })).sort((a, b) => a.r - b.r || a.i - b.i).forEach((x) => groups[x.tab].push(...x.els));
    // extra speeds next to the usual ones
    const sr = $('[data-speed]', m) && $('[data-speed]', m).parentElement;
    if (sr && !$('[data-speed="0.25"]', sr)) {
      sr.insertAdjacentHTML('afterbegin', '<button type="button" data-speed="0.25">0.25×</button>');
      sr.insertAdjacentHTML('beforeend', '<button type="button" data-speed="2.5">2.5×</button><button type="button" data-speed="3">3×</button>');
      [$('[data-speed="0.25"]', sr), $('[data-speed="2.5"]', sr), $('[data-speed="3"]', sr)].forEach((b) => { b.classList.toggle('on', video.playbackRate === Number(b.dataset.speed)); b.addEventListener('click', () => { video.playbackRate = Number(b.dataset.speed); renderOptMenu(); }); });
    }
    const amb = $('[data-amb]', m); if (amb && !PX_TV && !PX_TOUCH()) { amb.innerHTML = `<i data-lucide="monitor"></i>Theatre view · ${PxLayout.theatre() ? 'on' : 'off'}`; amb.onclick = () => PxLayout.setTheatre(!PxLayout.theatre()); }
    m.innerHTML = '';
    const bar = document.createElement('div'); bar.className = 'px-tabs'; bar.setAttribute('role', 'tablist');
    this.TABS.forEach(([k, l]) => { if (!groups[k].length) return; const b = document.createElement('button'); b.type = 'button'; b.dataset.pxtab = k; b.setAttribute('role', 'tab'); b.textContent = l; b.className = k === this.tab ? 'on' : ''; b.setAttribute('aria-selected', String(k === this.tab)); bar.appendChild(b); });
    if (!groups[this.tab].length) this.tab = 'play';
    m.appendChild(bar);
    this.TABS.forEach(([k]) => { const p = document.createElement('div'); p.className = 'px-pane'; p.dataset.pane = k; p.hidden = k !== this.tab; groups[k].forEach((el) => p.appendChild(el)); m.appendChild(p); });
    m.dataset.tab = this.tab;
    $$('[data-pxtab]', bar).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.tab = b.dataset.pxtab; this.show(); }));
    PxAudio.bind(m); PxPicture.bind(m); PxMore.bind(m);
    icons();
  },
  show() {
    const m = $('#optMenu'); m.dataset.tab = this.tab;
    $$('.px-tabs [data-pxtab]', m).forEach((b) => { const on = b.dataset.pxtab === this.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    $$('.px-pane', m).forEach((p) => { p.hidden = p.dataset.pane !== this.tab; });
    m.scrollTop = 0; wakeHud(true);
  },
};

/* ---- Audio: volume boost through the same audio graph Night Mode uses ---- */
const PxBoost = {
  g: 1, node: null, out: null, need: false,
  /* Web Audio can only read a stream's sound when the host allows it (or it is HLS, a local file, or relayed) */
  graph() {
    if (!DSP.attached && !DSP.attach()) return false;
    if (!this.node) {
      const n = DSP.n, ctx = DSP.ctx;
      try { n.an.disconnect(); } catch (e) { /* not connected */ }
      this.node = ctx.createGain(); this.out = ctx.createGain();
      n.an.connect(this.node); this.node.connect(this.out); this.out.connect(ctx.destination);
      this.node.gain.value = this.g; PxListen.tap();
    }
    if (DSP.ctx.state !== 'running') DSP.ctx.resume().catch(() => {});
    return true;
  },
  async set(g, quiet) {
    g = clamp(Math.round(g * 100) / 100, 1, 2);
    if (g > 1 && !this.graph()) {
      // reload the stream in a way its sound can be read, the same way Night Mode does
      if (P.stream && !P.stream._local && !P.hls) {
        const s = P.stream; PxBoost.want = g; this.need = true; await DSP.prepare(s);
        if (s._cors === 'none') { toast('This source does not let the browser raise its volume above 100 %. Another source or your MKCinema server can.', 'err', 6000); this.g = 1; this.paint(); return; }
        toast('Reconnecting the stream so it can go louder…', 'info', 2200);
        playStream(P.ctx, s, { startAt: pNow() }); return;
      }
      toast('Volume above 100 % is not available for this source', 'err'); this.g = 1; this.paint(); return;
    }
    this.g = g;
    if (this.node) { const t = DSP.ctx.currentTime; this.node.gain.cancelScheduledValues(t); this.node.gain.setTargetAtTime(g, t, 0.03); }
    if (!quiet && g > 1) toast(`Volume ${Math.round(video.volume * g * 100)} %`, 'info', 900, 'pxvol');
    this.paint();
  },
  paint() {
    const v = $('#pVol'); if (!v) return;
    const val = video.muted ? 0 : video.volume * this.g; v.value = String(val);
    v.style.setProperty('--v', `${(val / Number(v.max || 1)) * 100}%`);
    v.style.setProperty('--b', `${(1 / Number(v.max || 1)) * 100}%`);
    v.classList.toggle('boost', val > 1.001);
  },
  /* the slider runs 0–200 % on computers; past the middle it boosts */
  init() {
    const old = $('#pVol'); if (!old) return;
    const v = old.cloneNode(true); old.replaceWith(v);
    if (!PX_TV && !PX_TOUCH()) v.max = '2';
    v.setAttribute('aria-label', 'Volume'); v.title = 'Volume (up to 200 %)';
    v.addEventListener('input', () => {
      const x = Number(v.value), base = Math.min(1, x);
      if (P.ducking) { Duck.base = base; video.volume = base * Duck.target; } else video.volume = base;
      video.muted = x === 0;
      if (x > 1 || this.g > 1) this.set(Math.max(1, x), true); else this.paint();
    });
    v.addEventListener('change', () => { const x = Number(v.value); if (x > 1) toast(`Volume ${Math.round(x * 100)} %`, 'info', 900, 'pxvol'); });
    video.addEventListener('volumechange', () => this.paint());
    // the wheel over the picture changes the volume, like VLC
    $('#stage').addEventListener('wheel', (e) => {
      if ($('#player').hidden || e.target.closest('.menu, .drawer, .p-msg, #ytwrap, .xray') || e.ctrlKey) return;
      e.preventDefault();
      const cur = (video.muted ? 0 : video.volume) * this.g, nx = clamp(cur + (e.deltaY < 0 ? 0.05 : -0.05), 0, Number(v.max));
      video.muted = nx === 0; video.volume = Math.min(1, nx);
      if (nx > 1 || this.g > 1) this.set(Math.max(1, nx), true);
      toast(`Volume ${Math.round(nx * 100)} %`, 'info', 900, 'pxvol'); wakeHud();
    }, { passive: false });
    // a reload made for the boost picks the level back up once the audio is readable
    video.addEventListener('playing', () => {
      if (PxBoost.want && DSP.clean()) { const g = PxBoost.want; PxBoost.want = 0; this.set(g); }
      else if (this.g > 1 && !this.node && DSP.clean()) this.graph();
    });
    this.paint();
  },
};

const PxAudio = {
  html() {
    const boostOk = !P.stream || !P.stream.url ? false : true;
    const lis = PxListen.count();
    return `<h5>Volume</h5><div class="seg-row px-boost">${[1, 1.25, 1.5, 2].map((g) => `<button type="button" class="${Math.abs(PxBoost.g - g) < 0.01 ? 'on' : ''}" data-boost="${g}">${Math.round(g * 100)}%</button>`).join('')}</div>
      <p class="px-note">${boostOk ? 'Above 100 % lifts quiet films and dialogue.' : ''}</p>
      <h5>Listen on phone</h5>
      <button type="button" data-pxlisten><i data-lucide="headphones"></i>${lis ? `${lis === 1 ? 'A phone is' : `${lis} phones are`} playing the sound` : 'Play the sound on your phone'}</button>
      <p class="px-note">Pair your phone as a remote, then tap <b>Listen</b> on it. The sound plays on the phone or its headphones, and this screen goes quiet.</p>`;
  },
  bind(m) {
    $$('[data-boost]', m).forEach((b) => b.addEventListener('click', () => { PxBoost.set(Number(b.dataset.boost)); renderOptMenu(); }));
    const l = $('[data-pxlisten]', m); if (l) l.onclick = () => { m.hidden = true; Cast.open('remote'); };
  },
};

/* ---- Picture: brightness, contrast and colour. A CSS filter on the video, so the GPU does it ---- */
const PxPicture = {
  PRESETS: [['normal', 'Normal', { b: 100, c: 100, s: 100 }], ['vivid', 'Vivid', { b: 100, c: 108, s: 125 }], ['dark', 'Lift dark scenes', { b: 118, c: 94, s: 100 }], ['soft', 'Soft', { b: 98, c: 92, s: 92 }]],
  get() { const p = CFG.pxPic || {}; return { b: Number(p.b) || 100, c: Number(p.c) || 100, s: Number(p.s) || 100 }; },
  apply() {
    const p = this.get(), on = !PX_TV && (p.b !== 100 || p.c !== 100 || p.s !== 100);
    video.style.filter = on ? `brightness(${p.b / 100}) contrast(${p.c / 100}) saturate(${p.s / 100})` : '';
  },
  set(p) { setCfg('pxPic', p); this.apply(); },
  html() {
    if (PX_TV) return '';
    const p = this.get(), cur = (this.PRESETS.find(([, , v]) => v.b === p.b && v.c === p.c && v.s === p.s) || [''])[0];
    const sl = (k, l) => `<label class="px-sl"><span>${l}</span><input type="range" min="50" max="150" step="1" value="${p[k]}" data-pic="${k}" aria-label="${l}"><b class="tnum">${p[k]}%</b></label>`;
    return `<h5>Picture</h5><div class="seg-row">${this.PRESETS.map(([k, l]) => `<button type="button" class="${cur === k ? 'on' : ''}" data-picp="${k}">${l}</button>`).join('')}</div>
      ${sl('b', 'Brightness')}${sl('c', 'Contrast')}${sl('s', 'Colour')}`;
  },
  bind(m) {
    $$('[data-picp]', m).forEach((b) => b.addEventListener('click', () => { const pr = this.PRESETS.find(([k]) => k === b.dataset.picp); if (pr) this.set({ ...pr[2] }); renderOptMenu(); }));
    $$('[data-pic]', m).forEach((r) => r.addEventListener('input', () => { const p = this.get(); p[r.dataset.pic] = Number(r.value); r.nextElementSibling.textContent = `${r.value}%`; this.set(p); $$('[data-picp]', m).forEach((x) => x.classList.remove('on')); }));
  },
};

/* ---- More: stats and shortcuts ---- */
const PxMore = {
  html() {
    return `<h5>Info</h5>
      <button type="button" data-pxstats><i data-lucide="activity"></i>Playback stats · ${PxStats.on ? 'on' : 'off'}${PX_TV ? '' : ' (I)'}</button>
      ${PX_TV || PX_TOUCH() ? '' : '<button type="button" data-pxkeys><i data-lucide="keyboard"></i>Keyboard shortcuts (?)</button>'}${typeof Chapters !== 'undefined' ? Chapters.html() : ''}`;
  },
  bind(m) {
    if (typeof Chapters !== 'undefined') Chapters.bind(m);
    const s = $('[data-pxstats]', m); if (s) s.onclick = () => { PxStats.toggle(); renderOptMenu(); };
    const k = $('[data-pxkeys]', m); if (k) k.onclick = () => { m.hidden = true; PxKeys.toggle(); };
  },
};

const PxStats = {
  on: false, t: 0, last: null,
  toggle(v) {
    this.on = v == null ? !this.on : v; clearInterval(this.t);
    let el = $('#pxStats');
    if (!this.on) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement('div'); el.id = 'pxStats'; el.className = 'px-stats pp-ui'; el.setAttribute('aria-live', 'off'); $('#stage').appendChild(el); el.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(false); }); }
    el.hidden = false; this.last = null; this.paint(); this.t = setInterval(() => this.paint(), 1000);
  },
  paint() {
    const el = $('#pxStats'); if (!el || $('#player').hidden) return;
    const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null, s = P.stream || {}, tel = s._tel || {};
    const b = video.buffered; let ahead = 0; for (let i = 0; i < b.length; i++) if (video.currentTime >= b.start(i) - 0.2 && video.currentTime <= b.end(i)) ahead = b.end(i) - video.currentTime;
    const lvl = P.hls && P.hls.levels && P.hls.levels[P.hls.currentLevel];
    const net = P.hls && P.hls.bandwidthEstimate ? `${(P.hls.bandwidthEstimate / 1e6).toFixed(1)} Mbps` : '—';
    let fps = '—';
    if (q && this.last) { const df = q.totalVideoFrames - this.last.f, dt = (performance.now() - this.last.t) / 1000; if (dt > 0.5 && !video.paused) fps = (df / dt).toFixed(1); }
    if (q) this.last = { f: q.totalVideoFrames, t: performance.now() };
    const rows = [
      ['Picture', video.videoWidth ? `${video.videoWidth}×${video.videoHeight}${tel.res ? ` · ${tel.res}` : ''}` : '—'],
      ['Frames', q ? `${fps} fps · ${q.droppedVideoFrames} dropped of ${q.totalVideoFrames}` : fps],
      ['Buffered', `${ahead.toFixed(1)} s ahead`],
      ['Stream', P.hls ? `HLS${lvl ? ` · ${lvl.height}p · ${Math.round(lvl.bitrate / 1000)} kbps` : ''}` : P.remux ? 'Converted by your MKCinema server' : s._local ? 'File on this device' : 'Direct file'],
      ['Network', net],
      ['Sound', PxListen.count() ? `On ${PxListen.count()} phone${PxListen.count() > 1 ? 's' : ''}` : DSP.attached ? `Processed${PxBoost.g > 1 ? ` · ${Math.round(PxBoost.g * 100)} %` : ''}${CFG.dsp !== 'flat' ? ` · ${DSP_PRESETS[CFG.dsp].label}` : ''}` : 'Direct'],
      ['Speed', `${video.playbackRate}×`],
      ['Source', [s._addon, tel.source, tel.size].filter(Boolean).join(' · ') || '—'],
    ];
    el.innerHTML = `<b>Playback stats</b>${rows.map(([k, v]) => `<div><span>${esc(k)}</span><em class="tnum">${esc(String(v))}</em></div>`).join('')}`;
  },
};

const PxKeys = {
  LIST: [['Space or K', 'Play or pause'], ['← →  or J L', 'Back or forward'], ['↑ ↓', 'Volume'], ['Mouse wheel', 'Volume, up to 200 %'], [', and .', 'One frame back or forward (paused)'], ['[ and ]', 'Slower or faster, = resets'], ['F', 'Full screen'], ['M', 'Mute'], ['C or V', 'Subtitles menu or next subtitles'], ['G and H', 'Subtitles earlier or later'], ['B', 'Next audio language'], ['A', 'Audio menu'], ['O', 'Options'], ['S', 'Sources'], ['E', 'Episodes'], ['N', 'Next episode'], ['P', 'Watch party'], ['I', 'Playback stats'], ['?', 'This list']],
  toggle() {
    let el = $('#pxKeys');
    if (el && !el.hidden) { el.hidden = true; return; }
    if (!el) { el = document.createElement('div'); el.id = 'pxKeys'; el.className = 'px-keys glass-solid pp-ui'; $('#stage').appendChild(el); el.addEventListener('click', () => { el.hidden = true; }); }
    el.innerHTML = `<h4>Keyboard shortcuts</h4><div class="px-kgrid">${this.LIST.map(([k, v]) => `<kbd>${esc(k)}</kbd><span>${esc(v)}</span>`).join('')}</div><p class="px-note">Click anywhere to close.</p>`;
    el.hidden = false; wakeHud(true);
  },
};

/* ---- Frame step and extra keys ---- */
const PxFrames = {
  fps: 24, last: null,
  watch() {
    // TVs skip the per-frame callback: frame stepping falls back to 24 fps there
    if (PX_TV || !video.requestVideoFrameCallback || this.watching) return; this.watching = true;
    const cb = (now, md) => {
      if (this.last && md.presentedFrames - this.last.n === 1) { const d = md.mediaTime - this.last.t; if (d > 0.008 && d < 0.1) this.fps = Math.round((this.fps * 7 + 1 / d) / 8 * 1000) / 1000; }
      this.last = { n: md.presentedFrames, t: md.mediaTime };
      if (!$('#player').hidden) video.requestVideoFrameCallback(cb); else this.watching = false;
    };
    video.requestVideoFrameCallback(cb);
  },
  step(dir) {
    if (!isFinite(pDur())) return;
    if (!video.paused) video.pause();
    const f = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60].reduce((a, b) => (Math.abs(b - this.fps) < Math.abs(a - this.fps) ? b : a), 24);
    pSeek(pNow() + dir / f);
    toast(`${dir > 0 ? 'Next' : 'Previous'} frame`, 'info', 700, 'pxframe');
  },
};
addEventListener('keydown', (e) => {
  if ($('#player').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  const k = e.key; let did = true;
  if (k === ',' || k === '.') PxFrames.step(k === '.' ? 1 : -1);
  else if ((k === 'i' || k === 'I') && !IS_TV) PxStats.toggle();
  else if (k === '?' && !IS_TV) PxKeys.toggle();
  else if ((k === 'a' || k === 'A') && $('#subMenu').hidden && $('#optMenu').hidden) PxMenu.open('audio');
  else if (k === 'Escape' && $('#pxKeys') && !$('#pxKeys').hidden) $('#pxKeys').hidden = true;
  else did = false;
  if (did) { e.preventDefault(); e.stopPropagation(); wakeHud(); }
}, true);

/* ---- Phone gestures: hold for 2x, swipe up or down on the left for brightness and on the right for volume,
        swipe sideways to seek. Taps and double-taps keep working as before. ---- */
const PxGestures = {
  init() {
    const st = $('#stage'); let g = null, eat = false;
    const dim = document.createElement('div'); dim.className = 'px-dim'; dim.setAttribute('aria-hidden', 'true'); st.insertBefore(dim, $('#hud'));
    const pill = document.createElement('div'); pill.className = 'px-pill'; pill.hidden = true; st.appendChild(pill);
    let pillT = 0;
    const say = (h) => { pill.innerHTML = h; pill.hidden = false; clearTimeout(pillT); };
    const hush = (ms = 500) => { clearTimeout(pillT); pillT = setTimeout(() => { pill.hidden = true; }, ms); };
    this.bright = 1;
    const ok = (e) => e.pointerType === 'touch' && !P.locked && !$('#player').hidden && !e.target.closest('button, a, input, .menu, .drawer, .upnext, .p-msg, #ytwrap, .seek, .px-seekrow, .pp-ui, .hud-top, .ctl');
    st.addEventListener('pointerdown', (e) => {
      if (!ok(e) || g) return;
      const r = st.getBoundingClientRect();
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, r, left: e.clientX - r.left < r.width / 2, mode: '', t0: pNow(), v0: (video.muted ? 0 : video.volume), b0: this.bright, rate: video.playbackRate, holdT: 0 };
      g.holdT = setTimeout(() => {
        if (!g || g.mode || video.paused) return;
        g.mode = 'hold'; video.playbackRate = 2; say(`${PxUtil.svg('<path d="M13 19 22 12 13 5v14ZM2 19l9-7-9-7v14Z" fill="currentColor"/>')}2× speed`); try { navigator.vibrate && navigator.vibrate(8); } catch (x) { /* no vibration */ }
      }, 480);
    }, { passive: true });
    st.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id || g.mode === 'hold') return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.mode) {
        if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
        clearTimeout(g.holdT);
        g.mode = Math.abs(dx) > Math.abs(dy) ? (isFinite(pDur()) ? 'seek' : 'none') : g.left ? 'bright' : 'vol';
      }
      if (g.mode === 'seek') {
        const d = pDur(), span = Math.min(600, d * 0.5), to = clamp(g.t0 + (dx / g.r.width) * span, 0, d - 1); g.to = to;
        say(`<b class="tnum">${fmtTime(to)}</b><small class="tnum">${to >= g.t0 ? '+' : '−'}${fmtTime(Math.abs(to - g.t0))}</small>`);
      } else if (g.mode === 'vol') {
        const v = clamp(g.v0 - dy / (g.r.height * 0.7), 0, 1); video.volume = v; video.muted = v === 0;
        say(`${PxUtil.svg('<path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor"/>')}<b class="tnum">${Math.round(v * 100)}%</b>`);
      } else if (g.mode === 'bright') {
        this.bright = clamp(g.b0 - dy / (g.r.height * 0.7), 0.15, 1); dim.style.opacity = String(1 - this.bright);
        say(`${PxUtil.svg('<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>')}<b class="tnum">${Math.round(this.bright * 100)}%</b>`);
      }
    }, { passive: true });
    const end = (e) => {
      if (!g || (e && e.pointerId !== g.id)) return;
      clearTimeout(g.holdT);
      if (g.mode === 'hold') { video.playbackRate = g.rate; hush(150); eat = true; }
      else if (g.mode === 'seek' && g.to != null) { pSeek(g.to); hush(); eat = true; }
      else if (g.mode) { hush(); eat = true; }
      g = null;
    };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    // a gesture is not also a tap
    $('#player').addEventListener('click', (e) => { if (eat) { eat = false; e.stopPropagation(); e.preventDefault(); } }, true);
    st.addEventListener('pointerdown', () => { eat = false; }, { capture: true, passive: true });
  },
  reset() { this.bright = 1; const d = $('.px-dim'); if (d) d.style.opacity = '0'; },
};

/* ---- Per-title memory: speed for the series or film, subtitle timing for the exact file ---- */
const PxMem = {
  all() { return Store.get('pxMem', {}); },
  put(k, patch) {
    if (!k) return; const a = this.all(); a[k] = { ...(a[k] || {}), ...patch, at: Date.now() };
    const keys = Object.keys(a); if (keys.length > 400) keys.sort((x, y) => (a[x].at || 0) - (a[y].at || 0)).slice(0, keys.length - 400).forEach((x) => delete a[x]);
    Store.set('pxMem', a);
  },
  titleKey() { return P.ctx && P.ctx.meta ? `t:${P.ctx.meta.id}` : ''; },
  fileKey() { const s = P.stream; if (!s) return ''; const f = (s.behaviorHints || {}).filename || s.title || ''; return P.ctx ? `f:${P.ctx.video ? P.ctx.video.id : P.ctx.meta.id}:${String(f).slice(0, 120)}` : ''; },
  init() {
    video.addEventListener('ratechange', () => {
      if (!P.ctx || $('#player').hidden || PxMem.applying) return;
      clearTimeout(this.rt); this.rt = setTimeout(() => { const r = video.playbackRate; if (r !== 2 || !document.querySelector('.px-pill:not([hidden])')) this.put(this.titleKey(), { sp: r === (CFG.speed || 1) ? null : r }); }, 700);
    });
    video.addEventListener('loadedmetadata', () => {
      const m = this.all()[this.titleKey()];
      if (m && m.sp && m.sp !== video.playbackRate) { this.applying = true; video.playbackRate = m.sp; setTimeout(() => { this.applying = false; }, 50); toast(`Speed ${m.sp}× (as last time)`, 'info', 1800, 'pxsp'); }
    });
    const sd = setSubDelay;
    setSubDelay = function (v) { sd.apply(this, arguments); PxMem.put(PxMem.fileKey(), { sd: P.subDelay || null }); };
    const ss = selectSub;
    selectSub = async function (i, o) {
      const r = await ss.apply(this, arguments);
      const m = PxMem.all()[PxMem.fileKey()];
      if (i >= 0 && m && m.sd && !P.subDelay) setTimeout(() => { if (P.curSub === i && !P.subDelay) { sd(m.sd); toast(`Subtitle timing ${m.sd > 0 ? '+' : ''}${m.sd.toFixed(2)}s (as last time)`, 'info', 2000, 'subs'); } }, 300);
      return r;
    };
  },
};

/* ---- Listen on phone ----
   The phone remote asks to listen. When this screen's player can read the film's sound, it sends that sound to the
   phone live over WebRTC (no second download, any format this screen can play). When it can't, the phone plays the
   same source itself and keeps in step with this screen's position. Either way this screen goes quiet. */
const PxListen = {
  peers: new Map(), // phone id -> { pc, mode, at }
  dest: null,
  ICE: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
  count() { let n = 0; this.peers.forEach((p) => { if (p.live) n++; }); return n; },
  native() { return typeof TvPlayer !== 'undefined' && !!TvPlayer.cur; },
  /* what the remote shows on its Listen button */
  state() {
    if (this.native()) return { ok: false, why: 'native' };
    if ($('#player').hidden || !P.stream) return { ok: false, why: 'idle' };
    return { ok: true, n: this.count() };
  },
  /* once the boost graph exists, the phone's feed hangs off it */
  tap() {
    if (!PxBoost.node || this.dest) return;
    try { this.dest = DSP.ctx.createMediaStreamDestination(); PxBoost.node.connect(this.dest); } catch (e) { this.dest = null; }
  },
  quietTv() {
    const any = this.count() > 0, direct = [...this.peers.values()].some((p) => p.live && p.mode === 'direct');
    if (PxBoost.out) { const t = DSP.ctx.currentTime; PxBoost.out.gain.setTargetAtTime(any && !direct ? 0 : 1, t, 0.05); }
    if (direct && !this.mutedByUs) { this.mutedByUs = { m: video.muted }; video.muted = true; }
    else if (!direct && this.mutedByUs) { video.muted = this.mutedByUs.m; this.mutedByUs = null; }
    if (direct) { clearInterval(this.syncT); this.syncT = setInterval(() => this.sync(), 1000); } else clearInterval(this.syncT);
    if (!$('#optMenu').hidden && PxMenu.tab === 'audio') renderOptMenu();
    Remote.soon();
  },
  send(to, m) { if (Remote.bus) Remote.bus.send({ ...m, _to: to }); },
  onMsg(m) {
    const id = m._from;
    switch (m.t) {
      case 'lsn': if (m.on) this.start(id); else this.stop(id, true); return true;
      case 'lrtc': { const p = this.peers.get(id); if (p && p.pc && m.sdp) p.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).catch((e) => console.warn('listen answer', e)); return true; }
      case 'lice': { const p = this.peers.get(id); if (p && p.pc && m.c) p.pc.addIceCandidate(m.c).catch(() => {}); return true; }
      case 'lping': this.send(id, { t: 'lpong', t0: m.t0, tv: Date.now() }); return true;
      case 'bye': if (this.peers.has(id)) this.stop(id, false); return false;
      default: return false;
    }
  },
  why(id, code, text) { this.send(id, { t: 'lsn-st', ok: false, code, why: text }); },
  async start(id) {
    if (this.native()) { this.why(id, 'native', 'Your TV is playing this in its own player. To listen on your phone, set Settings › Playback › TV player to MKCinema player on the TV.'); return; }
    if ($('#player').hidden || !P.stream) { this.why(id, 'idle', 'Start a film or episode on the TV first.'); return; }
    this.stop(id, false);
    const s = P.stream, peer = { mode: '', live: false, at: Date.now() }; this.peers.set(id, peer);
    // 1. live sound from this screen
    if (window.RTCPeerConnection && (PxBoost.graph() || await this.makeReadable(s))) {
      if (this.peers.get(id) !== peer) return;
      if (PxBoost.graph()) { this.tap(); if (this.dest) { this.rtc(id, peer); return; } }
    }
    if (this.peers.get(id) !== peer) return;
    // 2. the phone plays the same source and follows this screen
    const url = s._local || !/^https?:/i.test(s.url || '') ? '' : s.url, hdr = (s.behaviorHints || {}).proxyHeaders;
    if (!url || hdr) { this.peers.delete(id); this.why(id, 'source', s._local ? 'Files opened from this device can’t be sent to a phone.' : 'This source can’t be shared with a phone. Try another source.'); return; }
    peer.mode = 'direct'; peer.live = true;
    this.send(id, { t: 'lsn-st', ok: true, mode: 'direct', url, title: P.ctx.meta.name || '', ...this.pos() });
    toast('Sound is playing on your phone. This screen is muted.', 'ok', 3200);
    this.quietTv();
  },
  /* reload the source the way Night Mode does, so its sound can be read; true once it plays again */
  async makeReadable(s) {
    if (s._local || P.hls || !s.url || DSP.clean()) return DSP.clean();
    PxBoost.need = true; await DSP.prepare(s); if (s._cors === 'none' || P.stream !== s) return false;
    const at = pNow(); this.reloading = true;
    const ok = await new Promise((res) => {
      const t = setTimeout(() => res(false), 15000);
      video.addEventListener('playing', () => { clearTimeout(t); res(DSP.clean()); }, { once: true });
      playStream(P.ctx, s, { startAt: at });
    });
    this.reloading = false; return ok;
  },
  pos() { return { cur: Math.round(pNow() * 1000) / 1000, paused: video.paused || video.readyState < 3, rate: video.playbackRate, at: Date.now() }; },
  sync() { const d = [...this.peers.entries()].filter(([, p]) => p.live && p.mode === 'direct'); if (!d.length || !Remote.bus) return; Remote.bus.send({ t: 'lsync', ...this.pos() }); },
  stereo(sdp) {
    const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i); if (!m) return sdp;
    return sdp.replace(new RegExp(`a=fmtp:${m[1]} ([^\\r\\n]*)`), (all, p) => `a=fmtp:${m[1]} ${p.replace(/;?(stereo|sprop-stereo|maxaveragebitrate)=[^;]*/g, '')};stereo=1;sprop-stereo=1;maxaveragebitrate=160000`);
  },
  async rtc(id, peer) {
    const pc = peer.pc = new RTCPeerConnection({ iceServers: this.ICE });
    peer.mode = 'live';
    this.dest.stream.getAudioTracks().forEach((tr) => pc.addTrack(tr, this.dest.stream));
    pc.onicecandidate = (e) => { if (e.candidate) this.send(id, { t: 'lice', c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') { if (!peer.live) { peer.live = true; toast('Sound is playing on your phone. This screen is quiet.', 'ok', 3200); this.quietTv(); } }
      else if (st === 'failed' || st === 'closed') { if (this.peers.get(id) === peer) this.stop(id, false); }
      else if (st === 'disconnected') { clearTimeout(peer.dt); peer.dt = setTimeout(() => { if (pc.connectionState === 'disconnected' && this.peers.get(id) === peer) this.stop(id, false); }, 20000); }
    };
    try {
      const off = await pc.createOffer(); off.sdp = this.stereo(off.sdp); await pc.setLocalDescription(off);
      this.send(id, { t: 'lrtc', sdp: off.sdp, title: P.ctx ? P.ctx.meta.name || '' : '' });
      setTimeout(() => { if (this.peers.get(id) === peer && !peer.live) { this.stop(id, false); this.why(id, 'net', 'Your phone and TV could not connect. Check they are on the same Wi-Fi and try again.'); } }, 20000);
    } catch (e) { this.stop(id, false); this.why(id, 'net', 'Listening could not start on this TV.'); }
  },
  stop(id, told) {
    const p = this.peers.get(id); if (!p) return;
    this.peers.delete(id); clearTimeout(p.dt);
    try { p.pc && p.pc.close(); } catch (e) { /* closed */ }
    if (!told) this.send(id, { t: 'lsn-st', ok: false, code: 'stopped' });
    if (p.live && !this.count()) toast('Sound is back on this screen', 'info', 2000);
    this.quietTv();
  },
  stopAll() { [...this.peers.keys()].forEach((id) => this.stop(id, false)); },
  init() {
    const on = Remote.onMsg.bind(Remote);
    Remote.onMsg = function (m) { if (m && m._from && PxListen.onMsg(m) && m.t !== 'bye') { const k = Remote.peers.get(m._from); if (k) k.at = Date.now(); return; } return on(m); };
    const st = Remote.state.bind(Remote);
    Remote.state = function () { const s = st(); s.lsn = PxListen.state(); return s; };
    ['play', 'pause', 'seeked', 'ratechange', 'waiting', 'playing'].forEach((ev) => video.addEventListener(ev, () => { if (this.peers.size) this.sync(); }));
    // closing the player hands the sound back; a stream change keeps phones listening
    const close = closePlayer;
    closePlayer = async function () { if (!PxListen.reloading) PxListen.stopAll(); return close.apply(this, arguments); };
    // a listening phone that stops saying hi in the background is kept while its audio link is up
    const beat = Remote.beat.bind(Remote);
    Remote.beat = function () { PxListen.peers.forEach((p, id) => { if (p.live) { const k = Remote.peers.get(id); if (k) k.at = Date.now(); } }); return beat(); };
  },
};

/* ---- Wiring ---- */
{
  // once boost or Listen on phone has been used, new streams load so their sound stays readable (like Night Mode)
  const wants = DSP.wants.bind(DSP);
  DSP.wants = function () { return wants() || PxBoost.need; };
  const base = renderOptMenu;
  renderOptMenu = function () { base.apply(this, arguments); try { PxMenu.tabify(); } catch (e) { console.error('menu tabs', e); } };
  $('#pOpts').onclick = () => { const m = $('#optMenu'); if (!m.hidden) { m.hidden = true; return; } PxMenu.open(); };
  PxLayout.init(); PxBoost.init(); PxGestures.init(); PxMem.init(); PxListen.init(); PxPicture.apply();
  const started = PlayerPlus.started.bind(PlayerPlus);
  PlayerPlus.started = function (ctx, stream) { started(ctx, stream); PxLayout.paint(); PxFrames.watch(); PxPicture.apply(); if (PxBoost.g > 1 && DSP.clean()) PxBoost.graph(); };
  const close = closePlayer;
  closePlayer = async function () { PxStats.toggle(false); const k = $('#pxKeys'); if (k) k.hidden = true; PxGestures.reset(); return close.apply(this, arguments); };
  // the audio-language note never steers anyone to one debrid service
  const sec = AudioLang.section.bind(AudioLang);
  AudioLang.section = function (s) { return String(sec(s) || '').replace('Use a TorBox source, run your MKCinema server, or open it in VLC.', 'Your MKCinema server or VLC can switch it, and so can a debrid service that offers web streaming.'); };
}

/* ---------------- 2.20.0 sweep fixes ---------------- */
{
  // the phone's bottom bar never got the Anime tab that the top bar has (2.16.0)
  const ser = $('#mtabs [data-view="series"]');
  if (ser && !$('#mtabs [data-view="anime"]') && $('#view-anime')) {
    ser.insertAdjacentHTML('afterend', '<button type="button" data-view="anime" data-nav><i data-lucide="torii"></i><span>Anime</span></button>');
    $('#mtabs [data-view="anime"]').addEventListener('click', () => go('anime'));
    icons();
  }
  // "0 addons answered · 3 streams": built-in sources (trailers) answer for ids no installed addon claims
  if (typeof renderStreamsPanel === 'function') {
    const rsp = renderStreamsPanel;
    renderStreamsPanel = function () {
      const r = rsp.apply(this, arguments);
      const el = $('#dStreams .status-line span'), n = new Set((D.streams || []).map((s) => s._addon).filter(Boolean)).size;
      if (el && n && /^0 addons answered/.test(el.textContent)) el.textContent = el.textContent.replace(/^0 addons answered/, `${n} addon${n === 1 ? '' : 's'} answered`);
      return r;
    };
  }
}
