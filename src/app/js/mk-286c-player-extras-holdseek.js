
'use strict';
/* 2.86 Player extras.
   HoldSeek: holding Left or Right (keyboard or TV remote) skips further the longer it is held.
   CropBars: "Crop bars" in Settings › Picture fills the screen with the picture inside black bars. It measures the bars
   on the frame when the picture can be read; when the source does not allow that, it assumes a widescreen film.
   MiniPlay: on computers, Share › Keep playing in a corner shrinks the film into a small window and the rest of
   MKCinema can be used. The same video keeps playing (nothing reloads); Expand brings it back, X stops it. */
const HoldSeek = {
  n: 0,
  step(e) {
    if (!e || !e.repeat) { this.n = 0; return step(); }
    this.n++;
    return this.n > 24 ? 180 : this.n > 12 ? 60 : this.n > 4 ? Math.max(30, step()) : step();
  },
};
const CropBars = {
  m: null,
  read() {
    try {
      if (!video.videoWidth) return null;
      const w = 64, h = 36, c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(video, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const lum = (x, y) => { const i = (y * w + x) * 4; return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; };
      const rowDark = (y) => { let t = 0; for (let x = 0; x < w; x++) t += lum(x, y); return t / w < 20; };
      const colDark = (x) => { let t = 0; for (let y = 0; y < h; y++) t += lum(x, y); return t / h < 20; };
      let top = 0, bot = 0, lef = 0, rig = 0;
      while (top < h / 2 && rowDark(top)) top++;
      while (bot < h / 2 && rowDark(h - 1 - bot)) bot++;
      while (lef < w / 2 && colDark(lef)) lef++;
      while (rig < w / 2 && colDark(w - 1 - rig)) rig++;
      if (top >= h / 2 || lef >= w / 2) return null; // a dark scene: try again later
      const y = Math.min(top, bot), x = Math.min(lef, rig);
      return { fy: (h - 2 * y) / h, fx: (w - 2 * x) / w };
    } catch (e) { return null; }   // the source does not let the picture be read
  },
  scale() {
    const v = video, st = $('#stage'); if (!v.videoWidth || !st) return 1;
    const r = st.getBoundingClientRect(), s0 = Math.min(r.width / v.videoWidth, r.height / v.videoHeight), W = v.videoWidth * s0, H = v.videoHeight * s0;
    let m = this.m || this.read();
    if (m) this.m = m;
    else { const ar = v.videoWidth / v.videoHeight; m = { fx: 1, fy: ar < 2.2 ? Math.min(1, ar / 2.39) : 1 }; }   // a widescreen film inside a 16:9 file
    const k = Math.min(r.width / (W * m.fx), r.height / (H * m.fy));
    return isFinite(k) && k > 1.005 ? Math.min(k, 2) : 1;
  },
  chosen() {
    clearTimeout(this.t);
    // the first frame can be dark: look again a little later
    this.t = setTimeout(() => { if (P.aspect === 'crop' && !$('#player').hidden) { this.m = null; applyPicture(); } }, 2500);
  },
};
video.addEventListener('loadedmetadata', () => { CropBars.m = null; if (P.aspect === 'crop') { applyPicture(); CropBars.chosen(); } });
video.addEventListener('loadedmetadata', () => setTimeout(() => Chapters.ticks(), 600));
const MiniPlay = {
  on: false, home: null, pic: null,
  can() { return !IS_TV && !TOUCH_UI && !(window.MkNative && MkNative.active) && !!P.stream && !P.stream.ytId && video.videoWidth > 0; },
  open() {
    if (this.on) return;
    if (!this.can()) { toast('This one can’t play in a corner', 'err'); return; }
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    if (document.fullscreenElement && !window.MkKeepFull) document.exitFullscreen().catch(() => {});
    closeDrawers(); $('#subMenu').hidden = true; $('#optMenu').hidden = true; $('#dspPop').hidden = true;
    const m = P.ctx && P.ctx.meta, ep = P.ctx && P.ctx.video, title = m ? `${m.name || ''}${ep && ep.season != null ? ` · S${ep.season} E${ep.episode}` : ''}` : '';
    const box = document.createElement('div'); box.id = 'miniPlay'; box.className = 'mini-play'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Mini player');
    box.innerHTML = `<div class="mp-v"></div><div class="mp-bar"><b translate="no">${esc(title)}</b>
      <button type="button" class="mp-b" data-nav data-mpp aria-label="Play or pause"><i data-lucide="${video.paused ? 'play' : 'pause'}"></i></button>
      <button type="button" class="mp-b" data-nav data-mpfull aria-label="Back to full size"><i data-lucide="maximize-2"></i></button>
      <button type="button" class="mp-b" data-nav data-mpx aria-label="Stop"><i data-lucide="x"></i></button></div>`;
    document.body.appendChild(box);
    const was = !video.paused;
    this.home = { parent: video.parentNode, next: video.nextSibling };
    this.pic = [P.aspect, P.zoom]; P.aspect = 'fit'; P.zoom = 1; applyPicture();
    box.querySelector('.mp-v').appendChild(video);
    if (was && video.paused) video.play().catch(() => {});
    this.on = true; P.mini = true;
    closeLayer('player');
    icons();
    const pp = box.querySelector('[data-mpp]');
    this.paint = () => { pp.innerHTML = `<i data-lucide="${video.paused ? 'play' : 'pause'}"></i>`; icons(); };
    video.addEventListener('play', this.paint); video.addEventListener('pause', this.paint);
    pp.onclick = (e) => { e.stopPropagation(); togglePlay(); };
    box.querySelector('[data-mpfull]').onclick = (e) => { e.stopPropagation(); this.expand(); };
    box.querySelector('[data-mpx]').onclick = (e) => { e.stopPropagation(); this.restore(true); closePlayer(); };
    box.querySelector('.mp-v').addEventListener('click', () => this.expand());
  },
  /* puts the video back in the player; quiet = the player is being closed or reused */
  restore(quiet) {
    if (!this.on) return;
    const was = !video.paused, h = this.home;
    if (h && h.parent) h.parent.insertBefore(video, h.next && h.next.parentNode === h.parent ? h.next : null);
    if (this.paint) { video.removeEventListener('play', this.paint); video.removeEventListener('pause', this.paint); this.paint = null; }
    const box = $('#miniPlay'); if (box) box.remove();
    this.on = false; P.mini = false;
    if (this.pic) { [P.aspect, P.zoom] = this.pic; this.pic = null; }
    if (!quiet && was && video.paused) video.play().catch(() => {});
  },
  expand() {
    if (!this.on) return;
    const was = !video.paused; this.restore(true);
    openLayer('player'); applyPicture(); if (was && video.paused) video.play().catch(() => {});
    wakeHud();
  },
};
$('#pMini').onclick = () => MiniPlay.open();
COMMANDS.push({ label: 'Keep the film playing in a corner', icon: 'minimize-2', run: () => (!$('#player').hidden ? MiniPlay.open() : toast('Start a film first')) });
