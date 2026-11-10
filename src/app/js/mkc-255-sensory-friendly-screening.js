
/* ---------------- 2.55 Sensory-friendly screening ----------------
   Like a sensory-friendly cinema showing: sudden loud bangs are softened and flashing light is dimmed.
   Sound: a 'sensory' sound mode (rumble trimmed, harsh highs eased, a fast compressor so a bang is no louder than talk).
   Picture: every frame is shrunk to 32 x 18 pixels and its brightness (and red) is measured. Rapid flashing
   (WCAG 2.3.1 style: opposing brightness swings of 10 % or more) or one huge jump dims the picture at once
   with a black layer, then it eases back once the flashing stops. Nothing leaves the device.
   It needs to read the picture, so it works on sources that allow it (the same ones as Sound modes and Sharp upscaling).
   Not on TVs or in the native Android players yet. */
const Sensory = {
  el: null, cv: null, cx: null, live: false, h: 0, raf: 0,
  ext: null, dir: 0, ev: [], dimUntil: 0, dim: false, blocked: false, lastR: null, sinceLock: 0,
  DIM: 0.62, SWING: 0.1, JUMP: 0.42, HOLD: 1300,
  on() { return CFG.sensory === true && !PX_TV; },
  native() { return typeof TvPlayer !== 'undefined' && !!TvPlayer.cur; },
  ensure() {
    if (this.el && this.el.isConnected) return this.el;
    const v = $('#video'); if (!v) return null;
    const d = this.el = document.createElement('div'); d.id = 'sensDim'; d.setAttribute('aria-hidden', 'true');
    v.after(d); return d;
  },
  setDim(on) {
    if (this.dim === on) return; this.dim = on;
    const d = this.ensure(); if (d) d.classList.toggle('on', on);
  },
  start() {
    if (this.live || !this.on() || this.blocked || this.native()) return;
    if (!this.cv) { this.cv = document.createElement('canvas'); this.cv.width = 32; this.cv.height = 18; this.cx = this.cv.getContext('2d', { willReadFrequently: true }); }
    if (!this.cx) return;
    this.ensure(); this.live = true; this.ext = null; this.dir = 0; this.ev = []; this.lastR = null;
    const tick = () => {
      if (!this.live) return;
      if ($('#player').hidden || !this.on()) { this.stop(); return; }
      this.sample();
      if (video.requestVideoFrameCallback) this.h = video.requestVideoFrameCallback(tick); else this.raf = requestAnimationFrame(tick);
    };
    if (video.requestVideoFrameCallback) this.h = video.requestVideoFrameCallback(tick); else this.raf = requestAnimationFrame(tick);
  },
  stop() {
    this.live = false;
    if (this.h && video.cancelVideoFrameCallback) try { video.cancelVideoFrameCallback(this.h); } catch (e) { /* gone */ }
    cancelAnimationFrame(this.raf); this.h = 0; this.raf = 0; this.setDim(false);
  },
  /* sRGB 0-255 to linear light */
  lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); },
  sample() {
    if (video.readyState < 2 || video.paused && !this.dim) return;
    let px;
    try { this.cx.drawImage(video, 0, 0, 32, 18); px = this.cx.getImageData(0, 0, 32, 18).data; }
    catch (e) { this.blocked = true; this.stop(); this.redraw(); return; }
    let L = 0, red = 0; const n = px.length / 4;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2], l = 0.2126 * this.lin(r) + 0.7152 * this.lin(g) + 0.0722 * this.lin(b);
      L += l; if (r > 150 && r / (r + g + b + 1) >= 0.8) red++;
    }
    this.step(L / n, red / n, performance.now());
  },
  /* one frame's average brightness L (0-1) and share of saturated red pixels R */
  step(L, R, now) {
    let trig = false;
    if (this.ext === null) { this.ext = L; this.dir = 0; }
    else if (L - this.ext >= this.SWING && this.dir !== 1 && Math.min(L, this.ext) < 0.8) { if (L - this.ext >= this.JUMP) trig = true; this.ev.push(now); this.dir = 1; this.ext = L; }
    else if (this.ext - L >= this.SWING && this.dir !== -1 && Math.min(L, this.ext) < 0.8) { this.ev.push(now); this.dir = -1; this.ext = L; }
    else if ((this.dir >= 0 && L > this.ext) || (this.dir <= 0 && L < this.ext)) this.ext = L;
    if (this.lastR !== null && Math.abs(R - this.lastR) >= 0.25) { this.ev.push(now); }
    this.lastR = R;
    while (this.ev.length && now - this.ev[0] > 1000) this.ev.shift();
    // 3 swings inside a second is the start of flashing; dim before it reaches the 3 flashes a second WCAG warns about
    if (this.ev.length >= 3 || trig) this.dimUntil = now + this.HOLD;
    this.setDim(now < this.dimUntil);
  },
  /* ---------- sound: a second, faster stage after the sound-mode compressor, so a bang can't punch through ---------- */
  limiter() {
    const n = DSP.n; if (!n || !DSP.ctx) return;
    if (!n.lim) {
      try { n.lim = DSP.ctx.createDynamicsCompressor(); n.comp.disconnect(); n.comp.connect(n.lim); n.lim.connect(n.makeup); }
      catch (e) { n.lim = null; try { n.comp.connect(n.makeup); } catch (e2) { /* already */ } return; }
    }
    const on = CFG.soundMode === 'sensory', t = DSP.ctx.currentTime, l = n.lim;
    l.threshold.setValueAtTime(on ? -36 : 0, t); l.knee.setValueAtTime(0, t); l.ratio.setValueAtTime(on ? 20 : 1, t);
    l.attack.setValueAtTime(0.001, t); l.release.setValueAtTime(0.25, t);
  },
  /* ---------- turning it on and off ---------- */
  set(v) {
    if (v) {
      if (CFG.soundMode !== 'sensory') setCfg('sensoryPrevSound', CFG.soundMode || 'original', { silent: true });
      SoundModes.need = true;
      if (P.stream && !this.native()) SoundModes.pick('sensory'); else setCfg('soundMode', 'sensory', { silent: true });
      this.blocked = false; if (!video.paused) this.start();
      toast('Sensory-friendly on: bangs softened, flashing dimmed', 'ok', 2600, 'sens');
    } else {
      this.stop();
      if (CFG.soundMode === 'sensory') { const k = CFG.sensoryPrevSound || 'original'; if (P.stream) SoundModes.pick(k); else setCfg('soundMode', k, { silent: true }); }
      toast('Sensory-friendly off', 'info', 1600, 'sens');
    }
    this.redraw();
  },
  redraw() { const m = $('#optMenu'); if (m && !m.hidden && PxMenu.tab === 'pic') renderOptMenu(); },
  note() {
    if (!this.on()) return 'Softens sudden loud bangs and dims flashing light, like a sensory-friendly cinema showing.';
    if (this.blocked) return 'Sound is softened, but this source doesn’t let the app watch the picture, so flashing isn’t dimmed. Another source may.';
    return 'On. Bangs are softened and flashing light is dimmed as it happens. The first flash can still get through.';
  },
  html() {
    if (PX_TV || !P.stream || this.native()) return '';
    const on = this.on();
    return `<h5>Sensory-friendly</h5><div class="seg-row" data-sens><button type="button" class="${on ? '' : 'on'}" data-sensv="0">Off</button><button type="button" class="${on ? 'on' : ''}" data-sensv="1">On</button></div><p class="sens-note">${esc(this.note())}</p>`;
  },
  bind(m) { $$('[data-sensv]', m).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const v = b.dataset.sensv === '1'; if (v !== this.on()) { setCfg('sensory', v); } })); },
  init() {
    if (CFG.sensory === undefined) CFG.sensory = false;
    SoundModes.LIST.push({ k: 'sensory', label: 'Sensory', note: 'Sudden bangs no louder than talk', icon: 'ear', hp: 90, f: 5200, eq: -3, comp: { threshold: -30, knee: 6, ratio: 12, attack: 0.001, release: 0.3 }, makeup: -12 });
    const sa = SoundModes.apply.bind(SoundModes);
    SoundModes.apply = function (instant) { sa(instant); Sensory.limiter(); };
    if (this.on()) SoundModes.need = true; // the first film is loaded so its sound and picture can be read
    // the audio engine may only start from a tap or key press
    const wake = () => { if (this.on() && !this.native()) SoundModes.wake(); };
    document.addEventListener('pointerdown', wake, true); document.addEventListener('keydown', wake, true);
    video.addEventListener('playing', () => { if (this.on()) this.start(); });
    video.addEventListener('emptied', () => { this.stop(); this.blocked = false; });
    CFG_HOOKS.push((k, v) => { if (k === 'sensory') this.set(v === true); });
    const ph = PxPicture.html.bind(PxPicture), pb = PxPicture.bind.bind(PxPicture);
    PxPicture.html = function () { return Sensory.html() + ph(); };
    PxPicture.bind = function (m) { pb(m); Sensory.bind(m); };
    const w = PxMenu.where.bind(PxMenu);
    PxMenu.where = function (h) { return /^\s*sensory/i.test(String(h || '')) ? 'pic' : w(h); };
    scAddRows('playback', null, [
      { group: 'Comfort' },
      { key: 'sensory', label: 'Sensory-friendly', help: 'Softens sudden loud bangs and dims flashing light as it happens, like a sensory-friendly cinema showing. Not a medical safeguard: the first flash can still get through.', type: 'toggle' },
    ]);
    COMMANDS.push({ label: 'Sensory-friendly on or off', icon: 'ear', run: () => setCfg('sensory', !Sensory.on()) });
  },
};
Sensory.init();
