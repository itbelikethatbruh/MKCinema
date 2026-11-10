
/* Welcome tour sounds: a soft bell on Next that climbs one note per step, a lower one on Back,
   a glassy tick on choices, and a short chime when the tour ends. Built on the intro's Sfx engine
   (same volume, mute and reverb), and only when Interface sounds is on. Nothing plays outside the tour. */
const TourSound = {
  quietUntil: 0,
  // D major pentatonic, matching the intro chime (D5 E5 F#5 A5 B5 D6 E6)
  SCALE: [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51],
  on() { return typeof UiSound === 'undefined' ? !sfx.muted : UiSound.ok(); },
  run(fn) {
    if (!this.on()) return;
    const c = sfx.ensure(); if (!c) return;
    this.quietUntil = performance.now() + 450; // the app's own open/close ticks stay quiet under ours
    if (c.state === 'running') return fn(c);
    // no tap yet to unlock audio: play only if it unlocks right away, never late
    const t0 = performance.now(); c.resume().then(() => { if (performance.now() - t0 < 250) fn(c); }).catch(() => {});
  },
  // one bell: a sine with two quiet partials, a fast attack and a short tail, a little of it to the reverb
  bell(c, f, at, vol, len, pan, wet) {
    const t = c.currentTime + at, p = c.createStereoPanner ? c.createStereoPanner() : null;
    const dry = c.createGain(); dry.gain.value = 1; const send = c.createGain(); send.gain.value = wet;
    const node = p || c.createGain(); if (p) p.pan.value = pan;
    node.connect(dry).connect(sfx.master); node.connect(send).connect(sfx.verb);
    [[1, 1], [2, 0.18], [3.01, 0.05]].forEach(([r, w]) => {
      const o = c.createOscillator(), g = c.createGain(), l = len / Math.sqrt(r);
      o.type = 'sine'; o.frequency.value = f * r;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * w, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + l);
      o.connect(g).connect(node); o.start(t); o.stop(t + l + 0.03);
    });
  },
  step(i) { return this.SCALE[Math.max(0, Math.min(this.SCALE.length - 1, i))]; },
  next(i) { this.run((c) => { const f = this.step(i); this.bell(c, f * 0.75, 0, 0.05, 0.5, -0.15, 0.25); this.bell(c, f, 0.06, 0.09, 0.9, 0.15, 0.35); }); },
  back(i) { this.run((c) => this.bell(c, this.step(i) * 0.75, 0, 0.065, 0.6, -0.1, 0.25)); },
  pick() { this.run((c) => this.bell(c, 1760, 0, 0.03, 0.18, 0, 0.12)); },
  skip() { this.run((c) => this.bell(c, 440, 0, 0.055, 0.55, 0, 0.3)); },
  done() { this.run((c) => { [[587.33, 0, -0.25], [880, 0.09, 0.25], [1174.66, 0.18, 0], [1479.98, 0.3, 0.1]].forEach(([f, at, pan], k) => this.bell(c, f, at, 0.085 - k * 0.012, 1.4, pan, 0.45)); }); },
  init() {
    const tour = $('#tour'); if (!tour) return;
    const solo = () => typeof PlayerAsk !== 'undefined' && PlayerAsk.solo;
    // Next, Back and the favorites step moving on by itself all go through tourGo
    const tg = window.tourGo;
    window.tourGo = function (d) {
      if (!tour.hidden) { if (solo()) TourSound.done(); else { const to = Math.max(0, Math.min(TOUR.length - 1, tourIdx + d)); if (to > tourIdx) TourSound.next(to); else if (to < tourIdx) TourSound.back(to); } }
      return tg.apply(this, arguments);
    };
    // window capture runs before the app's document-level click ticks, so those stay quiet under ours
    addEventListener('click', (e) => {
      if (tour.hidden) return;
      const t = e.target && e.target.closest ? e.target : null; if (!t || !tour.contains(t)) return;
      const btn = t.closest('button, [role="button"], a, label, input, .qp-g, .qp-t, .chip'); if (!btn || btn.disabled) return;
      if (btn.id === 'tourSkip') return this.skip();
      if (btn.matches('[data-tour-end], [data-tour-guide], [data-tour-addons]')) return this.done();
      if (t.closest('#tourBody')) this.pick();
    }, true);
    if (typeof UiSound !== 'undefined' && !UiSound._tour) {
      UiSound._tour = true; const p = UiSound.play.bind(UiSound);
      UiSound.play = (k) => (performance.now() < TourSound.quietUntil ? undefined : p(k));
    }
    // the tour opening gets a soft welcome bell in place of the generic open tick
    const ol = openLayer; openLayer = function (id) { if (id === 'tour' && $('#tour').hidden) TourSound.next(0); return ol.apply(this, arguments); };
  },
};
try { TourSound.init(); } catch (e) { console.warn('Tour sounds:', e); }
