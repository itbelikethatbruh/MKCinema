/* ---------------- Player tools ----------------
   Sleep timer (fades the sound over the last 15 s, then pauses), A-B repeat, still capture (only offered when the source
   allows it: local files and HLS), a second subtitle line for language learners, keys you choose yourself, and seek
   previews: on a computer, hovering the seek bar shows the frame there, read by a second muted video of the same link. */
const Tools = {
  sleepAt: 0, sleepEnd: false, vol0: null, a: null, b: null, sub2: null, sub2i: -1,
  /* ---- sleep ---- */
  setSleep(min) {
    this.restoreVol(); this.sleepAt = 0; this.sleepEnd = false;
    if (min === 'end') { this.sleepEnd = true; toast('Sleep timer: at the end of this one', 'ok', 2400, 'sleep'); }
    else if (min > 0) { this.sleepAt = Date.now() + min * 60000; toast(`Sleep timer: ${min} minutes`, 'ok', 2400, 'sleep'); }
    else toast('Sleep timer off', 'info', 1800, 'sleep');
    this.paintMarks();
  },
  sleepLabel() {
    if (this.sleepEnd) return 'at the end';
    if (!this.sleepAt) return 'off';
    return `${Math.max(1, Math.ceil((this.sleepAt - Date.now()) / 60000))} min left`;
  },
  restoreVol() { if (this.vol0 != null) { video.volume = this.vol0; this.vol0 = null; } },
  tick() {
    if ($('#player').hidden) return;
    const t = pNow(), d = pDur();
    let left = this.sleepAt ? (this.sleepAt - Date.now()) / 1000 : this.sleepEnd && isFinite(d) ? d - t - 1 : Infinity;
    if (left < 15 && left > 0) { if (this.vol0 == null) this.vol0 = video.volume; video.volume = Math.max(0, this.vol0 * (left / 15)); }
    if (left <= 0) {
      video.pause(); this.restoreVol(); this.sleepAt = 0; this.sleepEnd = false;
      showMsg('Sleep timer', 'Paused for the night. Press play to carry on.', '<button class="btn btn-prime" type="button" id="slpGo"><i data-lucide="play"></i>Keep watching</button>');
      const g = $('#slpGo'); if (g) g.onclick = () => { hideMsg(); video.play().catch(() => {}); };
    }
    // A-B repeat
    if (this.a != null && this.b != null && t >= this.b) pSeek(this.a, { user: false });
    // second subtitle line
    if (this.sub2) this.drawSub2(t);
  },
  /* ---- A-B ---- */
  ab() {
    const t = pNow();
    if (this.a == null) { this.a = t; toast(`A set at ${fmtTime(t)}. Press again at the end of the part to repeat.`, 'info', 3200, 'ab'); }
    else if (this.b == null) { if (t <= this.a + 0.5) { toast('B must come after A', 'err', 2000, 'ab'); return; } this.b = t; pSeek(this.a, { user: false }); toast(`Repeating ${fmtTime(this.a)} to ${fmtTime(this.b)}`, 'ok', 2600, 'ab'); }
    else { this.a = this.b = null; toast('A-B repeat off', 'info', 1600, 'ab'); }
    this.paintMarks();
  },
  abLabel() { return this.a == null ? 'Set start (A)' : this.b == null ? `Set end (B) · A at ${fmtTime(this.a)}` : `Stop repeating ${fmtTime(this.a)}–${fmtTime(this.b)}`; },
  paintMarks() {
    const seek = $('#seek'); let r = $('#abRange');
    if (!r) { r = document.createElement('div'); r.id = 'abRange'; r.className = 'ab-range'; seek.appendChild(r); }
    const d = pDur(); if (this.a == null || !isFinite(d) || !d) { r.hidden = true; return; }
    r.hidden = false; const b = this.b == null ? this.a + 0.5 : this.b;
    r.style.left = `${(this.a / d) * 100}%`; r.style.width = `${Math.max(0.4, ((b - this.a) / d) * 100)}%`;
  },
  /* ---- still capture ---- */
  canStill() {
    if (!video.videoWidth) return false;
    try { const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d'); g.drawImage(video, 0, 0, 2, 2); g.getImageData(0, 0, 1, 1); return true; } catch (e) { return false; }
  },
  still() {
    if (!this.canStill()) { toast('This source does not allow captures. Local files and HLS streams do.', 'err', 4200, 'still'); return; }
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext('2d').drawImage(video, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${streamTitle(P.ctx).replace(/[^\w\- ]+/g, '').trim() || 'MKCinema'} ${fmtTime(pNow()).replace(/:/g, '.')}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Still saved', 'ok', 1800, 'still');
    }, 'image/png');
  },
  /* ---- second subtitles ---- */
  async setSub2(i) {
    this.sub2i = i; this.sub2 = null; const box = $('#sub2'); if (box) box.textContent = '';
    if (i < 0) { toast('Second subtitles off', 'info', 1600, 'sub2'); return; }
    const s = P.subs[i];
    try {
      let text = s.text; if (text == null) { const r = await fetch(s.url); if (!r.ok) throw new Error(`HTTP ${r.status}`); text = await r.text(); }
      const vtt = StremioEngine.toVtt(text, s.fileName || s.url || ''), cues = [];
      const T = /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\n|\n*$)/g;
      const sec = (v) => { const p = v.replace(',', '.').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
      let m; while ((m = T.exec(vtt.replace(/\r/g, '')))) cues.push({ a: sec(m[1]), b: sec(m[2]), t: m[3].replace(/<[^>]+>/g, '').trim() });
      if (!cues.length) throw new Error('no lines found');
      this.sub2 = cues; toast(`Second subtitles: ${subLabel(s)}`, 'ok', 2000, 'sub2');
    } catch (e) { this.sub2i = -1; toast(`Could not load those subtitles (${e.message})`, 'err'); }
  },
  drawSub2(t) {
    let box = $('#sub2'); if (!box) { box = document.createElement('div'); box.id = 'sub2'; box.className = 'sub2'; box.setAttribute('aria-live', 'off'); $('#stage').appendChild(box); }
    t += P.subDelay || 0; const c = this.sub2.find((x) => x.a <= t && t < x.b), txt = c ? c.t : '';
    if (box.textContent !== txt) box.textContent = txt;
  },
  reset() { this.restoreVol(); this.sleepAt = 0; this.sleepEnd = false; this.a = this.b = null; this.sub2 = null; this.sub2i = -1; const s = $('#sub2'); if (s) s.textContent = ''; this.paintMarks(); },

  /* ---- keys you choose ---- */
  ACTIONS: [
    ['play', 'Play or pause', () => togglePlay()], ['back', 'Back', () => seekBy(-step())], ['fwd', 'Forward', () => seekBy(step())],
    ['volUp', 'Volume up', () => { video.volume = clamp(video.volume + 0.05, 0, 1); toast(`Volume ${Math.round(video.volume * 100)}%`, 'info', 900, 'vol'); }],
    ['volDown', 'Volume down', () => { video.volume = clamp(video.volume - 0.05, 0, 1); toast(`Volume ${Math.round(video.volume * 100)}%`, 'info', 900, 'vol'); }],
    ['full', 'Full screen', () => toggleFull()], ['subs', 'Next subtitles', () => cycleSub()], ['audio', 'Next audio track', () => cycleAudio()],
    ['next', 'Next episode', () => playNext()], ['slower', 'Slower', () => nudgeSpeed(-0.25)], ['faster', 'Faster', () => nudgeSpeed(0.25)],
    ['ab', 'A-B repeat', () => Tools.ab()], ['still', 'Save a still', () => Tools.still()],
    ['sleep', 'Sleep timer (15, 30, 60 min, off)', () => { const s = Tools.sleepAt ? Math.round((Tools.sleepAt - Date.now()) / 60000) : 0; Tools.setSleep(!s ? 15 : s <= 15 ? 30 : s <= 30 ? 60 : 0); }],
    ['split', 'Add to Split Screen', () => { if (P.stream && P.stream.url) Split.open({ name: streamTitle(P.ctx), url: P.stream.url, headers: P.stream.behaviorHints && P.stream.behaviorHints.proxyHeaders && P.stream.behaviorHints.proxyHeaders.request }); }],
  ],
  keyName: (k) => ({ ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }[k] || (k.length === 1 ? k.toUpperCase() : k)),
  keymap() { return CFG.keymap || {}; },
  bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (this.capturing) return;
      if ($('#player').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || ''; if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if ($('#player .drawer.open') || !$('#optMenu').hidden || !$('#subMenu').hidden) return;
      const map = this.keymap(), k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const act = Object.keys(map).find((a) => map[a] === k); if (!act) return;
      const a = this.ACTIONS.find((x) => x[0] === act); if (!a) return;
      e.preventDefault(); e.stopImmediatePropagation(); a[2](); wakeHud();
    }, true);
  },
  keysHTML() {
    const map = this.keymap();
    return `<div class="set-row x8-keys"><div><b>Your own keys</b><small>Give any player action a key of your choosing. It works alongside the keys above. Select a row, then press the key.</small></div></div>
      <div class="x8-keygrid">${this.ACTIONS.map(([id, label]) => `<button type="button" class="x8-key" data-nav data-kact="${id}"><span>${esc(label)}</span><kbd>${map[id] ? esc(this.keyName(map[id])) : '—'}</kbd></button>`).join('')}</div>
      <div class="actions" style="margin-top:10px"><button class="btn btn-ghost btn-sm" type="button" data-nav id="kReset"><i data-lucide="rotate-ccw"></i>Clear my keys</button></div>`;
  },
  bindKeysUI() {
    $$('#setBody [data-kact]').forEach((b) => b.addEventListener('click', () => {
      const kbd = $('kbd', b); kbd.textContent = 'Press a key…'; this.capturing = true;
      const done = (e) => {
        e.preventDefault(); e.stopImmediatePropagation(); removeEventListener('keydown', done, true); this.capturing = false;
        if (e.key === 'Escape' || e.key === 'Backspace') { const m = { ...this.keymap() }; delete m[b.dataset.kact]; setCfg('keymap', m); renderSettingsBody(); return; }
        if (/^(Tab|Enter|Shift|Control|Alt|Meta)$/.test(e.key)) { kbd.textContent = 'Pick another key'; return; }
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, m = { ...this.keymap() };
        Object.keys(m).forEach((a) => { if (m[a] === k) delete m[a]; }); m[b.dataset.kact] = k; setCfg('keymap', m); renderSettingsBody();
        toast(`${this.keyName(k)} now does: ${this.ACTIONS.find((x) => x[0] === b.dataset.kact)[1]}`, 'ok', 2200, 'key');
      };
      addEventListener('keydown', done, true);
    }));
    const r = $('#kReset'); if (r) r.onclick = () => { setCfg('keymap', {}); renderSettingsBody(); toast('Your keys are cleared'); };
  },

  /* ---- seek previews ---- */
  prev: null, prevT: 0, prevSrc: '',
  previewable() {
    if (CFG.seekPreview === false || NO_HOVER.matches || IS_TV || !P.stream || P.hls || P.remux) return '';
    const u = video.currentSrc || ''; if (!u || u.startsWith('blob:') && !P.stream._local) return '';
    return u;
  },
  bindPreview() {
    const seek = $('#seek'), tip = $('#sTip');
    const box = document.createElement('div'); box.className = 'sp-prev'; box.hidden = true; seek.appendChild(box);
    const at = (e) => { const r = seek.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
    let pend = 0;
    seek.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return; const u = this.previewable(), d = pDur(); if (!u || !isFinite(d)) { box.hidden = true; return; }
      if (!this.prev || this.prevSrc !== u) {
        if (this.prev) { this.prev.removeAttribute('src'); this.prev.load(); }
        this.prev = document.createElement('video'); this.prev.muted = true; this.prev.preload = 'metadata'; this.prev.playsInline = true; this.prev.src = u; this.prevSrc = u;
        this.prev.addEventListener('seeked', () => box.classList.add('ok')); this.prev.addEventListener('error', () => { box.hidden = true; this.prevSrc = 'x'; });
        box.innerHTML = ''; box.appendChild(this.prev);
      }
      const p = at(e); box.hidden = false; box.style.left = `${clamp(p * 100, 8, 92)}%`;
      const t = p * d; clearTimeout(pend);
      pend = setTimeout(() => { if (Math.abs(t - this.prevT) > 1) { this.prevT = t; box.classList.remove('ok'); try { this.prev.currentTime = t; } catch (x) { /* not seekable yet */ } } }, 90);
      void tip;
    });
    seek.addEventListener('pointerleave', () => { box.hidden = true; });
  },
  dropPreview() { if (this.prev) { this.prev.removeAttribute('src'); this.prev.load(); this.prev = null; this.prevSrc = ''; } },

  init() {
    setInterval(() => this.tick(), 250);
    this.bindKeys(); this.bindPreview();
    const reset = PlayerPlus.reset.bind(PlayerPlus);
    PlayerPlus.reset = function () { reset(); Tools.reset(); Tools.dropPreview(); };
    const close = closePlayer;
    closePlayer = async function () { Tools.reset(); Tools.dropPreview(); return close.apply(this, arguments); };
    video.addEventListener('loadedmetadata', () => this.paintMarks());
    // the options menu gets a Tools part
    const base = renderOptMenu;
    renderOptMenu = function () {
      base(); const m = $('#optMenu');
      const subs = P.subs.map((s, i) => [s, i]).filter(([s]) => s.kind !== 'hls' && s.kind !== 'native');
      const live = !isFinite(pDur());
      m.insertAdjacentHTML('afterbegin', `<h5>Tools</h5>
        ${!IS_TV ? '<button type="button" data-tl="tv"><i data-lucide="cast"></i>Send to TV</button>' : ''}
        <div class="seg-row tl-sleep" aria-label="Sleep timer"><span class="tl-k"><i data-lucide="moon"></i>Sleep · ${esc(Tools.sleepLabel())}</span>${[[0, 'Off'], [15, '15'], [30, '30'], [60, '60'], ...(live ? [] : [['end', 'End']])].map(([v, l]) => `<button type="button" data-sleep="${v}" class="${(v === 'end' ? Tools.sleepEnd : v === 0 ? !Tools.sleepAt && !Tools.sleepEnd : false) ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${live ? '' : `<button type="button" data-tl="ab"><i data-lucide="repeat"></i>A-B repeat · ${esc(Tools.abLabel())}</button>`}
        ${Tools.canStill() ? '<button type="button" data-tl="still"><i data-lucide="camera"></i>Save a still of this frame</button>' : ''}
        ${subs.length ? `<button type="button" data-tl="sub2"><i data-lucide="languages"></i>Second subtitles · ${Tools.sub2i >= 0 && P.subs[Tools.sub2i] ? esc(subLabel(P.subs[Tools.sub2i])) : 'off'}</button><div class="tl-sub2" hidden>${[['-1', 'Off'], ...subs.map(([s, i]) => [String(i), subLabel(s)])].map(([v, l]) => `<button type="button" data-s2="${v}" class="${String(Tools.sub2i) === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>` : ''}
        ${P.stream && /^https?:/i.test(P.stream.url || '') ? '<button type="button" data-tl="split"><i data-lucide="layout-grid"></i>Add to Split Screen</button>' : ''}`);
      $$('[data-sleep]', m).forEach((b) => b.addEventListener('click', () => { const v = b.dataset.sleep; Tools.setSleep(v === 'end' ? 'end' : Number(v)); renderOptMenu(); }));
      $$('[data-s2]', m).forEach((b) => b.addEventListener('click', () => { Tools.setSub2(Number(b.dataset.s2)); m.hidden = true; }));
      $$('[data-tl]', m).forEach((b) => b.addEventListener('click', () => {
        const a = b.dataset.tl;
        if (a === 'sub2') { const l = $('.tl-sub2', m); l.hidden = !l.hidden; if (IS_TV) Nav.settle(); return; }
        m.hidden = true;
        if (a === 'tv') TvCast.start(); if (a === 'ab') Tools.ab(); if (a === 'still') Tools.still();
        if (a === 'split') Tools.ACTIONS.find((x) => x[0] === 'split')[2]();
      }));
      icons();
    };
    // Settings: seek previews toggle (Playback) and your own keys (Shortcuts)
    const pb = secById('playback'); if (pb) { const rows = pb.rows; pb.rows = () => [...rows(), { group: 'Player tools' }, { key: 'seekPreview', label: 'Seek previews', help: 'On a computer, hovering the seek bar shows the picture at that moment. It reads a little of the file in the background; HLS and Split Screen don’t use it.', type: 'toggle', get: () => CFG.seekPreview !== false }]; }
    const ks = secById('keys'); if (ks) { const rows = ks.rows, bind = ks.bind; ks.rows = () => [...rows(), { html: () => Tools.keysHTML() }]; ks.bind = () => { if (bind) bind(); Tools.bindKeysUI(); }; }
  },
};
Tools.init();
