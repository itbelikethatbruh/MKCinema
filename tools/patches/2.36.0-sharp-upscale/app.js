/* =====================================================================
   2.36.0 Sharp upscaling
   A video smaller than the screen is normally stretched by the browser with a plain bilinear filter, which looks soft.
   When this is on, MKCinema draws the picture itself on the GPU (WebGL), in two passes:
     1  Contrast-adaptive sharpening at the video's own resolution (after AMD FidelityFX CAS, MIT licence).
     2  Catmull-Rom (bicubic) upscale to the real pixel size of the screen, clamped to the nearest source pixels
        so edges get no halos.
   It is "seamless": it only runs when the screen has clearly more pixels than the video. A 4K file on a 4K screen,
   or anything the screen would shrink, plays untouched by the browser as before. Off by default, never on TVs
   (Fire TV GPUs cannot keep up, and the TV app draws at 1080p anyway), and it switches itself off if the device
   starts dropping frames. Everything runs on this device. It cannot invent detail that is not in the file.
   Browsers only let a page read video pixels when the host allows it (CORS). Hosts that do are opened that way while
   this is on; hosts that don't simply play as before. No stream is ever routed through a server for this.
   ===================================================================== */
const PxUp = {
  MODES: [['off', 'Off'], ['soft', 'Natural'], ['crisp', 'Crisp']],
  SHARP: { soft: 0.35, crisp: 0.8 },
  gl: null, cv: null, sub: null, prog: null, fbo: null, tex: null, mid: null, midW: 0, midH: 0,
  live: false, shown: false, h: 0, raf: 0, state: 'off', why: '', blocked: false, forcing: false, taint: null,
  guard: { t: 0, last: null, strikes: 0 }, box: null, subKey: '',
  mode() { const m = CFG.pxUp; return this.SHARP[m] != null ? m : 'off'; },
  on() { return !PX_TV && this.mode() !== 'off' && !this.blocked; },
  /* ---------- WebGL ---------- */
  init() {
    if (this.gl) return true; if (this.gl === false) return false;
    const cv = this.cv = document.createElement('canvas'); cv.id = 'pxUp'; cv.setAttribute('aria-hidden', 'true');
    const opt = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    const gl = cv.getContext('webgl', opt) || cv.getContext('experimental-webgl', opt);
    if (!gl) { this.gl = false; return false; }
    const VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';
    const CAS = `precision mediump float;varying vec2 uv;uniform sampler2D t;uniform vec2 px;uniform float k;
      vec3 s(vec2 o){return texture2D(t,uv+o*px).rgb;}
      void main(){
        vec3 a=s(vec2(-1.,1.)),b=s(vec2(0.,1.)),c=s(vec2(1.,1.)),d=s(vec2(-1.,0.)),e=s(vec2(0.)),f=s(vec2(1.,0.)),g=s(vec2(-1.,-1.)),h=s(vec2(0.,-1.)),i=s(vec2(1.,-1.));
        vec3 mn=min(min(min(d,e),min(f,b)),h);vec3 mn2=min(mn,min(min(a,c),min(g,i)));mn+=mn2;
        vec3 mx=max(max(max(d,e),max(f,b)),h);vec3 mx2=max(mx,max(max(a,c),max(g,i)));mx+=mx2;
        vec3 amp=sqrt(clamp(min(mn,2.0-mx)/max(mx,vec3(1e-4)),0.0,1.0));
        vec3 w=amp*(-1.0/mix(8.0,5.0,k));
        gl_FragColor=vec4(clamp(((b+d+f+h)*w+e)/(1.0+4.0*w),0.0,1.0),1.0);}`;
    const CR = `precision highp float;varying vec2 uv;uniform sampler2D t;uniform vec2 sz;
      void main(){
        vec2 sp=uv*sz;vec2 t1=floor(sp-0.5)+0.5;vec2 f=sp-t1;
        vec2 w0=f*(-0.5+f*(1.0-0.5*f));vec2 w1=1.0+f*f*(-2.5+1.5*f);vec2 w2=f*(0.5+f*(2.0-1.5*f));vec2 w3=f*f*(-0.5+0.5*f);
        vec2 w12=w1+w2;vec2 t12=(t1+w2/w12)/sz;vec2 t0=(t1-1.0)/sz;vec2 t3=(t1+2.0)/sz;
        vec3 r=texture2D(t,vec2(t0.x,t0.y)).rgb*w0.x*w0.y+texture2D(t,vec2(t12.x,t0.y)).rgb*w12.x*w0.y+texture2D(t,vec2(t3.x,t0.y)).rgb*w3.x*w0.y
          +texture2D(t,vec2(t0.x,t12.y)).rgb*w0.x*w12.y+texture2D(t,vec2(t12.x,t12.y)).rgb*w12.x*w12.y+texture2D(t,vec2(t3.x,t12.y)).rgb*w3.x*w12.y
          +texture2D(t,vec2(t0.x,t3.y)).rgb*w0.x*w3.y+texture2D(t,vec2(t12.x,t3.y)).rgb*w12.x*w3.y+texture2D(t,vec2(t3.x,t3.y)).rgb*w3.x*w3.y;
        vec2 n=t1/sz,q=1.0/sz;
        vec3 p0=texture2D(t,n).rgb,p1=texture2D(t,n+vec2(q.x,0.)).rgb,p2=texture2D(t,n+vec2(0.,q.y)).rgb,p3=texture2D(t,n+q).rgb;
        gl_FragColor=vec4(clamp(r,min(min(p0,p1),min(p2,p3)),max(max(p0,p1),max(p2,p3))),1.0);}`;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const mk = (fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return { p, u: (n) => gl.getUniformLocation(p, n) }; };
    try {
      this.prog = { cas: mk(CAS), cr: mk(CR) };
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      [this.prog.cas.p, this.prog.cr.p].forEach((p) => { const l = gl.getAttribLocation(p, 'p'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); });
      const tx = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([a, b]) => gl.texParameteri(gl.TEXTURE_2D, a, b)); return t; };
      this.tex = tx(); this.mid = tx(); this.fbo = gl.createFramebuffer();
    } catch (e) { MKLog.add('error', `upscale: ${e.message}`); this.gl = false; return false; }
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.gl = false; this.why = 'gpu'; this.stop(); });
    this.gl = gl; return true;
  },
  /* ---------- when to run ---------- */
  clean() {
    if (this.taint === P.stream) return false;
    try { return DSP.clean(); } catch (e) { return false; }
  },
  eval() {
    const want = this.on() && !$('#player').hidden && P.stream && !P.stream.ytId && video.videoWidth > 0 && document.pictureInPictureElement !== video;
    if (!want) { this.why = !this.on() ? 'off' : 'idle'; this.stop(); return; }
    if (!this.clean()) { this.why = 'cors'; this.stop(); return; }
    if (!this.init()) { this.why = 'gpu'; this.stop(); return; }
    if (!this.cv.isConnected) { video.after(this.cv); }
    if (!this.sub) { const d = this.sub = document.createElement('div'); d.id = 'pxUpSub'; d.setAttribute('aria-hidden', 'true'); d.innerHTML = '<div><span></span></div>'; }
    if (!this.sub.isConnected) $('#stage').appendChild(this.sub);
    this.layout();
  },
  /* place the canvas exactly over the picture and decide whether there is anything to upscale */
  layout() {
    if (!this.cv || !this.cv.isConnected || !this.gl) return;
    const j = $('#stage > .JASSUB'); if (j && (this.cv.compareDocumentPosition(j) & Node.DOCUMENT_POSITION_PRECEDING)) j.before(this.cv);
    const w = video.clientWidth, h = video.clientHeight, vw = video.videoWidth, vh = video.videoHeight;
    if (!w || !h || !vw || !vh) { this.idle('idle'); return; }
    const fit = video.style.objectFit || 'contain';
    let sx = Math.min(w / vw, h / vh), sy = sx;
    if (fit === 'cover') { sx = sy = Math.max(w / vw, h / vh); } else if (fit === 'fill') { sx = w / vw; sy = h / vh; }
    const cw = vw * sx, ch = vh * sy, cx = (w - cw) / 2, cy = (h - ch) / 2;
    let dpr = window.devicePixelRatio || 1; if (w * dpr > 3840) dpr = 3840 / w; if (h * dpr > 2160) dpr = Math.min(dpr, 2160 / h);
    const outW = Math.round(cw * dpr), outH = Math.round(ch * dpr);
    // seamless: nothing to do unless the screen shows the picture clearly bigger than the file
    if (outH < vh * 1.12 && outW < vw * 1.12) { this.idle('native', { vw, vh, outW, outH }); return; }
    const cs = this.cv.style, L = `${video.offsetLeft}px`, T = `${video.offsetTop}px`;
    if (cs.left !== L) cs.left = L; if (cs.top !== T) cs.top = T; cs.width = `${w}px`; cs.height = `${h}px`;
    cs.transform = video.style.transform || ''; cs.filter = video.style.filter || '';
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (this.cv.width !== bw || this.cv.height !== bh) { this.cv.width = bw; this.cv.height = bh; }
    this.box = { vw, vh, outW, outH, x: Math.round(cx * dpr), y: Math.round((h - cy - ch) * dpr), cx, cy, cw, ch };
    const ss = this.sub.style; ss.left = `${video.offsetLeft + Math.max(0, cx)}px`; ss.top = `${video.offsetTop + Math.max(0, cy)}px`;
    ss.width = `${Math.min(w, cw)}px`; ss.height = `${Math.min(h, ch)}px`; ss.fontSize = `${(Math.min(h, ch) * 0.05).toFixed(2)}px`;
    this.sub.dataset.pos = CFG.subPos || 'bottom';
    this.why = 'on'; this.run(); this.draw();
  },
  idle(why, box) {
    this.why = why; this.box = box || null; this.halt();
    if (this.shown) { this.shown = false; this.cv.classList.remove('on'); document.body.classList.remove('pxup-on'); this.subText(''); }
  },
  /* ---------- drawing ---------- */
  run() {
    if (this.live) return; this.live = true; this.guard = { t: 0, last: null, strikes: 0 };
    if (video.requestVideoFrameCallback) { const cb = () => { if (!this.live) return; this.draw(); this.h = video.requestVideoFrameCallback(cb); }; this.h = video.requestVideoFrameCallback(cb); }
    else { let lt = -1; const cb = () => { if (!this.live) return; if (video.currentTime !== lt) { lt = video.currentTime; this.draw(); } this.raf = requestAnimationFrame(cb); }; this.raf = requestAnimationFrame(cb); }
  },
  halt() {
    this.live = false;
    if (this.h && video.cancelVideoFrameCallback) try { video.cancelVideoFrameCallback(this.h); } catch (e) { /* gone */ }
    cancelAnimationFrame(this.raf); this.h = 0; this.raf = 0;
  },
  draw() {
    const gl = this.gl, b = this.box; if (!gl || !b || video.readyState < 2) return;
    try {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    } catch (e) {
      // the host stopped allowing its pixels to be read (or the browser refuses): go back to the normal picture
      this.taint = P.stream; this.idle('cors'); MKLog.add('info', `upscale: ${e.name || 'read'} blocked`); return;
    }
    // pass 1: sharpen at the video's own size
    if (this.midW !== b.vw || this.midH !== b.vh) {
      gl.bindTexture(gl.TEXTURE_2D, this.mid); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, b.vw, b.vh, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.mid, 0);
      this.midW = b.vw; this.midH = b.vh;
    }
    const cas = this.prog.cas, cr = this.prog.cr;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, b.vw, b.vh);
    gl.useProgram(cas.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(cas.u('t'), 0); gl.uniform2f(cas.u('px'), 1 / b.vw, 1 / b.vh); gl.uniform1f(cas.u('k'), this.SHARP[this.mode()] || 0.35);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // pass 2: bicubic upscale to the screen's pixels
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(b.x, b.y, b.outW, b.outH);
    gl.useProgram(cr.p); gl.bindTexture(gl.TEXTURE_2D, this.mid);
    gl.uniform1i(cr.u('t'), 0); gl.uniform2f(cr.u('sz'), b.vw, b.vh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!this.shown) { this.shown = true; this.cv.classList.add('on'); document.body.classList.add('pxup-on'); }
    this.subs(); this.watch();
  },
  /* ---------- subtitles: the canvas covers the video's own captions, so they are drawn above it ---------- */
  subs() {
    if (!this.sub) return;
    if (typeof AssR !== 'undefined' && AssR.on()) { this.subText(''); return; }
    const t = Array.from(video.textTracks).find((x) => x.mode === 'showing');
    const cues = t && t.activeCues ? Array.from(t.activeCues) : [];
    const key = cues.map((c) => `${c.startTime}|${c.text}`).join('\n');
    if (key === this.subKey) return; this.subKey = key;
    const span = $('span', this.sub); span.textContent = '';
    cues.forEach((c, i) => {
      if (i) span.appendChild(document.createElement('br'));
      let frag = null; try { frag = c.getCueAsHTML && c.getCueAsHTML(); } catch (e) { /* plain text below */ }
      if (frag) span.appendChild(frag); else span.appendChild(document.createTextNode(c.text || ''));
    });
    this.sub.classList.toggle('on', cues.length > 0);
  },
  subText(s) { if (!this.sub) return; this.subKey = ''; $('span', this.sub).textContent = s; this.sub.classList.toggle('on', !!s); },
  /* ---------- keep it honest: if frames start dropping, switch off for this session ---------- */
  watch() {
    const now = performance.now(); if (now - this.guard.t < 2000) return; this.guard.t = now;
    const q = video.getVideoPlaybackQuality && video.getVideoPlaybackQuality(); if (!q || video.paused) { this.guard.last = null; return; }
    const g = this.guard, last = g.last; g.last = { f: q.totalVideoFrames, d: q.droppedVideoFrames };
    if (!last) return;
    const df = q.totalVideoFrames - last.f, dd = q.droppedVideoFrames - last.d;
    if (df < 20) return;
    g.strikes = dd / df > 0.1 ? g.strikes + 1 : 0;
    if (g.strikes >= 2) {
      this.blocked = true; this.stop(); this.why = 'slow';
      toast('Sharp upscaling switched off: this device was dropping frames. It stays off until you reopen MKCinema.', 'info', 6000);
      MKLog.add('info', `upscale: off after drops (${dd}/${df})`);
    }
  },
  stop() {
    this.halt();
    if (this.cv) { this.cv.classList.remove('on'); this.cv.remove(); }
    if (this.sub) { this.subText(''); this.sub.remove(); }
    this.shown = false; document.body.classList.remove('pxup-on');
  },
  status() {
    const b = this.box;
    if (PX_TV) return '';
    if (this.blocked) return 'Switched off for now: this device was dropping frames.';
    if (this.mode() === 'off') return 'Off. The browser stretches small videos itself.';
    if (this.why === 'on' && b) return `Upscaling ${b.vw}×${b.vh} to ${b.outW}×${b.outH} on this device.`;
    if (this.why === 'native' && b) return `Not needed: this ${b.vw}×${b.vh} video already fills your screen's pixels, so it plays untouched.`;
    if (this.why === 'cors') return 'This source does not let the browser process its picture, so it plays as it is.';
    if (this.why === 'gpu') return 'Not available: this browser has no WebGL.';
    return 'Starts when the video does.';
  },
  /* ---------- turning it on mid-stream ---------- */
  async set(v) {
    setCfg('pxUp', v);
    if (v === 'off' || PX_TV || !P.stream || $('#player').hidden) return;
    const s = P.stream;
    if (this.clean() || s._local || P.hls || P.remux || s.ytId) return;
    await DSP.prepare(s); if (P.stream !== s) return;
    if (s._cors === 'direct') { toast('Reconnecting the stream so it can be upscaled…', 'info', 2200); playStream(P.ctx, s, { startAt: pNow() }); }
    else { this.why = 'cors'; toast('This source does not let the browser process its picture, so it plays as it is.', 'info', 5000); }
  },
};
{
  /* load direct files CORS-readable while upscaling is on, but only from hosts that allow it: routing never changes */
  const wants = DSP.wants.bind(DSP), prep = DSP.prepare.bind(DSP);
  DSP.wants = function () { return wants() || PxUp.forcing; };
  DSP.prepare = async function (s) {
    await prep(s);
    if (s._cors != null || !PxUp.on() || s._local || !s.url) return;
    PxUp.forcing = true; try { await prep(s); } finally { PxUp.forcing = false; }
    const bh = s.behaviorHints || {};
    if (s._cors === 'none' || (s._cors === 'proxy' && !(bh.proxyHeaders || CFG.alwaysProxy))) s._cors = null;
  };
  const started = PlayerPlus.started.bind(PlayerPlus);
  PlayerPlus.started = function () { const r = started.apply(this, arguments); PxUp.taint = null; PxUp.eval(); return r; };
  const cp = closePlayer;
  closePlayer = function () { PxUp.stop(); return cp.apply(this, arguments); };
  const ap = applyPicture;
  applyPicture = function () { const r = ap.apply(this, arguments); if (PxUp.cv && PxUp.cv.isConnected) PxUp.layout(); return r; };
  ['loadeddata', 'resize', 'playing'].forEach((ev) => video.addEventListener(ev, () => { if (PxUp.on() && !$('#player').hidden) PxUp.eval(); }));
  ['seeked', 'timeupdate'].forEach((ev) => video.addEventListener(ev, () => { if (PxUp.shown) PxUp.subs(); }));
  video.addEventListener('emptied', () => { if (PxUp.cv) PxUp.idle('idle'); });
  video.addEventListener('enterpictureinpicture', () => PxUp.eval());
  video.addEventListener('leavepictureinpicture', () => PxUp.eval());
  if (window.ResizeObserver) new ResizeObserver(() => { if (PxUp.cv && PxUp.cv.isConnected) PxUp.layout(); }).observe(video);
  CFG_HOOKS.push((k) => { if (k === 'pxUp' || k === 'subPos') PxUp.eval(); });
  // the player's Picture tab
  const ph = PxPicture.html.bind(PxPicture), pb = PxPicture.bind.bind(PxPicture);
  PxPicture.html = function () {
    if (PX_TV) return ph();
    const m = PxUp.mode();
    return `${ph()}<h5>Picture upscaling</h5><div class="seg-row">${PxUp.MODES.map(([k, l]) => `<button type="button" class="${m === k ? 'on' : ''}" data-pxup="${k}">${l}</button>`).join('')}</div>
      <p class="pxup-note">${esc(PxUp.status())}</p>`;
  };
  PxPicture.bind = function (m) {
    pb(m);
    $$('[data-pxup]', m).forEach((b) => b.addEventListener('click', async () => { PxUp.blocked = false; await PxUp.set(b.dataset.pxup); renderOptMenu(); }));
  };
  // Settings › Playback
  const pbs = SECTIONS.find((x) => x.id === 'playback');
  if (pbs && !IS_TV) {
    const rows = pbs.rows;
    pbs.rows = () => {
      const r = (typeof rows === 'function' ? rows() : rows).slice();
      r.push({ key: 'pxUp', label: 'Sharp upscaling', help: 'Sharpens and upscales videos that are smaller than your screen, on this device’s graphics chip. Files that already match your screen play untouched. Uses more battery; it turns itself off if frames start dropping.', type: 'seg', options: PxUp.MODES, get: () => PxUp.mode(), set: (v) => { PxUp.blocked = false; PxUp.set(v); } });
      return r;
    };
  }
}
