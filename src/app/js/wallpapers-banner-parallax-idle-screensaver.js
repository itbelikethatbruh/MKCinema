
/* =====================================================================
   2.7.25 Wallpapers: banner parallax + idle screensaver
   ===================================================================== */

/* =====================================================================
   Ambient Mode (2.7.32): a 2.5D multi-plane parallax screensaver
   ---------------------------------------------------------------------
   Every film is assembled from up to four planes:
     0  backdrop     Fanart.tv / TMDB backdrop (readable by WebGL), else the catalog's own art
     1  atmosphere   a canvas particle layer (fog and spores, embers and bokeh, or projector dust in a light beam)
     2  cutout       Fanart.tv clear art (a transparent character cutout), when it exists
     3  title + HUD  transparent logo, year / IMDb / genre pills and the OK prompt
   and drawn in one of three modes:
     A  shadowbox    backdrop + cutout + logo on separate 3D planes, counter-panning (needs a Fanart.tv key)
     B  depth shader one flat backdrop in a WebGL fragment shader that fakes depth per pixel and orbits the camera
                     (needs art the browser may read: a Fanart.tv or TMDB key)
     C  layered CSS  the catalog's art panning on its own plane, particles and a floating 3D title (no keys needed;
                     that art host forbids pixel access, so neither WebGL nor colour sampling can use it)
   Each film holds for 14 s; the next one is fetched and decoded 5 s before the end, and at 12 s the old scene pushes
   toward you and dissolves while the new one rises from 95 %. Left/Right skip, OK opens the film, Back or any other
   key returns you exactly where you were. A frame-time governor halves the particles and the shader resolution, then
   drops to mode C, whenever frames run over budget.
   ===================================================================== */
const AmbientArt = {
  cache: new Map(),
  keys() { const k = Keys.get(); return { tmdb: TMDB.key(), fanart: (k.fanart || '').trim() }; },
  async json(url, ms = 6000) {
    const c = typeof AbortController !== 'undefined' ? new AbortController() : null, t = setTimeout(() => c && c.abort(), ms);
    try { const r = await fetch(url, c ? { signal: c.signal } : {}); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { clearTimeout(t); }
  },
  hd: (u) => (u ? String(u).replace(/(images\.metahub\.space\/background\/)(small|medium)\//, '$1large/') : u),
  base(m) { return { m, bg: this.hd(metaBg(m)), bgCors: false, logo: metaLogo(m), cut: null }; },
  bundle(m) {
    if (!this.cache.has(m.id)) this.cache.set(m.id, this.fetchBundle(m).catch(() => this.base(m)));
    return this.cache.get(m.id);
  },
  https: (u) => (u ? String(u).replace(/^http:\/\//, 'https://') : u),
  async fetchBundle(m) {
    const b = this.base(m), { tmdb, fanart } = this.keys(), tt = /^tt\d+/.test(m.id) ? String(m.id).match(/^tt\d+/)[0] : null;
    const series = m.type === 'series'; let tmdbId = null, tvdb = m.tvdb_id || m.tvdbId || null;
    if (tmdb && tt) {
      const f = await TMDB.find(tt).catch(() => null);
      const hit = f && ((series ? f.tv_results : f.movie_results) || [])[0];
      if (hit) {
        tmdbId = hit.id; const kind = series ? 'tv' : 'movie';
        const im = await TMDB.images(kind, hit.id).catch(() => null);
        // Backdrops tagged with a language have the title printed on them. A textless one (no language) is preferred;
        // if only titled art exists, our own logo stays off so the title never shows twice.
        const bds = ((im && im.backdrops) || []).filter((x) => x.file_path && x.width >= 1000);
        const clean = bds.filter((x) => !x.iso_639_1).sort((x, y) => (y.vote_average || 0) - (x.vote_average || 0))[0];
        const bd = clean || bds[0] || (hit.backdrop_path ? { file_path: hit.backdrop_path } : null);
        if (bd) { b.bg = `https://image.tmdb.org/t/p/original${bd.file_path}`; b.bgCors = true; b.bgText = !clean; }
        const logos = ((im && im.logos) || []).filter((l) => !/\.svg$/i.test(l.file_path));
        const lg = logos.find((l) => l.iso_639_1 === 'en') || logos[0];
        if (lg) b.logo = `https://image.tmdb.org/t/p/original${lg.file_path}`;
        if (series && !tvdb) { const x = await TMDB.externalIds(hit.id).catch(() => null); if (x && x.tvdb_id) tvdb = x.tvdb_id; }
      }
    }
    const faId = series ? tvdb : (tt || tmdbId);
    if (fanart && faId) {
      const fa = await this.json(`https://webservice.fanart.tv/v3/${series ? 'tv' : 'movies'}/${faId}?api_key=${enc(fanart)}`);
      if (fa) {
        const pick = (...ks) => { for (const k of ks) { const a = fa[k] || []; const x = a.find((v) => v.lang === 'en') || a.find((v) => !v.lang || v.lang === '00') || a[0]; if (x && x.url) return this.https(x.url); } return null; };
        // characterart is people only; clearart (the only cutout fanart.tv has for films) carries the title logo too,
        // so with clearart our own logo stays off and the cutout's own title is the one on screen
        const ch = series ? pick('characterart') : null;
        b.cut = ch || (series ? pick('hdclearart', 'clearart') : pick('hdmovieclearart', 'movieclearart'));
        b.cutTitled = !!b.cut && !ch;
        const lg = pick(series ? 'hdtvlogo' : 'hdmovielogo', series ? 'clearlogo' : 'movielogo'); if (lg) b.logo = lg;
        // fanart.tv backgrounds are textless by its rules
        if (!b.bgCors || b.bgText) { const bg = pick(series ? 'showbackground' : 'moviebackground'); if (bg) { b.bg = bg; b.bgCors = true; b.bgText = false; } }
      }
    }
    return b;
  },
  load(src, cors, ms = 9000) {
    return new Promise((res, rej) => {
      if (!src) { rej(new Error('none')); return; }
      const img = new Image(); img.decoding = 'async'; img.alt = ''; img.referrerPolicy = 'no-referrer';
      if (cors) img.crossOrigin = 'anonymous';
      const t = setTimeout(() => rej(new Error('slow')), ms);
      img.onload = () => { clearTimeout(t); const d = img.decode ? img.decode().catch(() => {}) : null; Promise.race([d, new Promise((r) => setTimeout(r, 1500))]).then(() => res(img)); };
      img.onerror = () => { clearTimeout(t); rej(new Error('failed')); };
      img.src = src;
    });
  },
  // Art larger than the screen needs is redrawn once at a smaller size and the full-size image released.
  // Fire TV sticks have little memory: a 4K fanart background decodes to 33 MB, and a crossfade holds three scenes.
  shrink(img, maxW) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || w <= maxW) return img;
    try {
      const c = document.createElement('canvas'); c.width = maxW; c.height = Math.round(h * maxW / w);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); img.removeAttribute('src'); c.className = img.className; return c;
    } catch (e) { return img; }
  },
  // The screen's width in real pixels, capped so a 4K backdrop never decodes larger than needed on a stick
  px() { return Math.round(Math.min(IS_TV ? 1920 : 2560, Math.max(1280, innerWidth * (devicePixelRatio || 1)))); },
  release(root) { if (root) root.querySelectorAll('img').forEach((i) => i.removeAttribute('src')); },
  // Top two colours of the backdrop (only for art the browser may read)
  colors(img) {
    try {
      const c = document.createElement('canvas'); c.width = 32; c.height = 18; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 32, 18);
      const d = x.getImageData(0, 0, 32, 18).data, bins = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], bl = d[i + 2], mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), l = (mx + mn) / 510;
        if (l < .1 || l > .9) continue;
        const key = (r >> 4) << 8 | (g >> 4) << 4 | (bl >> 4), w = 1 + ((mx - mn) / 255) * 3, o = bins.get(key) || { w: 0, r: 0, g: 0, b: 0 };
        o.w += w; o.r += r * w; o.g += g * w; o.b += bl * w; bins.set(key, o);
      }
      const top = [...bins.values()].sort((a, b) => b.w - a.w).map((o) => [o.r / o.w, o.g / o.w, o.b / o.w].map(Math.round));
      if (!top.length) return null;
      const far = top.find((c2) => Math.hypot(c2[0] - top[0][0], c2[1] - top[0][1], c2[2] - top[0][2]) > 80) || top[0];
      return [top[0], far];
    } catch (e) { return null; }
  },
};

const AMBIENT_STYLES = {
  fog: { re: /horror|sci-?fi|science fiction|thriller|mystery|fantasy/i, colors: [[120, 150, 190], [70, 80, 120]] },
  embers: { re: /action|crime|war|adventure|western/i, colors: [[255, 150, 70], [210, 70, 40]] },
  dust: { re: null, colors: [[245, 210, 150], [190, 150, 100]] },
};
const ambientStyle = (m) => { const g = genresOf(m).join(' '); return AMBIENT_STYLES.fog.re.test(g) ? 'fog' : AMBIENT_STYLES.embers.re.test(g) ? 'embers' : 'dust'; };

/* Plane 1: particles on a 2D canvas, drawn from a handful of pre-rendered sprites */
const AmbientFx = {
  cv: null, x: null, parts: [], style: 'dust', colors: null, s: 1, w: 0, h: 0, sprites: new Map(), on: true,
  init(cv) { this.cv = cv; this.x = cv.getContext('2d'); },
  resize(level) {
    this.s = level >= 2 ? (IS_TV ? .75 : 1) : .5;
    this.w = Math.round(innerWidth * this.s); this.h = Math.round(innerHeight * this.s);
    this.cv.width = this.w; this.cv.height = this.h; this.on = level > 0; this.cv.style.visibility = this.on ? '' : 'hidden';
    this.level = level; this.fill();
  },
  sprite(rgb, soft, px = 64) {
    const k = `${rgb}|${soft}|${px}`; if (this.sprites.has(k)) return this.sprites.get(k);
    if (this.sprites.size > 40) this.sprites.clear();
    const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d'), g = x.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
    g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(soft ? .25 : .45, `rgba(${rgb},${soft ? .45 : .8})`); g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g; x.fillRect(0, 0, px, px); this.sprites.set(k, c); return c;
  },
  target() { const n = { fog: 46, embers: 82, dust: 96 }[this.style] || 60; return Math.round(n * (this.level >= 2 ? 1 : .5)); },
  spawn(fresh) {
    const W = this.w, H = this.h, st = this.style, c = this.colors || AMBIENT_STYLES[st].colors, r = Math.random;
    const p = { st, a: 0, life: 0 };
    if (st === 'fog') {
      if (this.parts.filter((q) => q.st === 'fog' && q.big).length < (this.level >= 2 ? 6 : 3)) {
        Object.assign(p, { big: true, x: r() * W, y: H * (.45 + r() * .6), sz: W * (.45 + r() * .35), vx: (r() - .5) * 9 * this.s, vy: -1.5 * this.s, max: .05 + r() * .07, img: this.sprite(c[1].map((v) => Math.min(255, v + 40)).join(','), true, 128), dur: 22 + r() * 18 });
      } else Object.assign(p, { x: r() * W, y: r() * H, sz: (1.6 + r() * 2.6) * this.s, vx: (r() - .5) * 6 * this.s, vy: (r() - .3) * 7 * this.s, max: .25 + r() * .45, img: this.sprite('215,215,220', false, 16), dur: 9 + r() * 10, sway: r() * 6 });
    } else if (st === 'embers') {
      if (r() < .14) Object.assign(p, { x: r() * W, y: r() * H, sz: (18 + r() * 34) * this.s, vx: (r() - .5) * 4 * this.s, vy: -4 * this.s, max: .06 + r() * .1, img: this.sprite(c[0].join(','), true, 64), dur: 10 + r() * 8 });
      else Object.assign(p, { x: r() * W, y: H * (.55 + r() * .5), sz: (2 + r() * 3.6) * this.s, vx: (r() - .5) * 10 * this.s, vy: -(18 + r() * 42) * this.s, max: .5 + r() * .5, img: this.sprite(r() < .5 ? '255,190,110' : '255,120,60', false, 16), dur: 5 + r() * 6, flick: 3 + r() * 6, sway: r() * 6 });
    } else {
      Object.assign(p, { x: r() * W, y: r() * H, sz: (1.2 + r() * 2.4) * this.s, vx: (r() - .4) * 5 * this.s, vy: (r() - .5) * 4 * this.s, max: .3 + r() * .55, img: this.sprite(c[0].map((v) => Math.min(255, v + 30)).join(','), false, 16), dur: 10 + r() * 12, sway: r() * 6, beam: true });
    }
    if (fresh) p.life = Math.random() * p.dur * .8;
    return p;
  },
  fill() { this.parts = []; const n = this.target(); for (let i = 0; i < n; i++) this.parts.push(this.spawn(true)); },
  setStyle(style, colors) { this.style = style; this.colors = colors; },
  step(dt, t) {
    if (!this.on) return;
    const x = this.x, W = this.w, H = this.h, n = this.target();
    x.clearRect(0, 0, W, H);
    // the beam for projector dust: motes brighten as they cross a slanted band of light
    const bx = W * (.62 + Math.sin(t * .00007) * .04), slope = .36;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life += dt;
      if (p.life > p.dur || p.x < -p.sz * 2 || p.x > W + p.sz * 2 || p.y < -p.sz * 2 || p.y > H + p.sz * 2) {
        if (this.parts.length > n || p.st !== this.style) this.parts.splice(i, 1); else this.parts[i] = this.spawn(false);
        continue;
      }
      p.x += (p.vx + (p.sway ? Math.sin((t * .001 + i) * .7) * p.sway * this.s : 0)) * dt; p.y += p.vy * dt;
      const k = p.life / p.dur, fade = Math.min(1, k * 4, (1 - k) * 4);
      let a = p.max * fade;
      if (p.flick) a *= .65 + .35 * Math.sin(t * .001 * p.flick + i);
      if (p.beam) { const dx = Math.abs(p.x - (bx + (p.y - H * .5) * slope)); a *= .25 + .95 * Math.max(0, 1 - dx / (W * .09)); }
      if (a <= .004) continue;
      x.globalAlpha = Math.min(1, a); x.drawImage(p.img, p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
    }
    while (this.parts.length < n) this.parts.push(this.spawn(false));
    x.globalAlpha = 1;
  },
};

/* Mode B: synthetic depth from one flat backdrop. Depth per pixel = a radial weight toward the centre / lower third,
   plus luminance and local contrast; a slow sinusoidal camera orbit moves near pixels up to 2.5 % while the frame
   edges stay anchored. Two texture slots let one scene dissolve into the next inside the shader. */
const AmbientGL = {
  ok: null, gl: null, cv: null, scale: 1, slots: [null, null], aspect: [1.78, 1.78],
  VS: 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}',
  FS: `precision mediump float;
varying vec2 v;
uniform sampler2D u_a,u_b;
uniform float u_mix,u_t,u_amp,u_ra,u_rb,u_za,u_zb,u_canvas;
uniform vec2 u_pa,u_pb;
vec2 cover(vec2 uv,float ia,float z,vec2 pan){
  vec2 s=ia>u_canvas?vec2(u_canvas/ia,1.):vec2(1.,ia/u_canvas);
  return (uv-.5)*s/z+.5+pan;
}
float depthAt(sampler2D t,vec2 uv){
  float radial=1.-smoothstep(.12,.78,distance(uv,vec2(.5,.42)));
  vec3 c=texture2D(t,uv).rgb;
  float lum=dot(c,vec3(.299,.587,.114));
  vec3 dx=texture2D(t,uv+vec2(.006,0.)).rgb-texture2D(t,uv-vec2(.006,0.)).rgb;
  vec3 dy=texture2D(t,uv+vec2(0.,.006)).rgb-texture2D(t,uv-vec2(0.,.006)).rgb;
  float edge=clamp((abs(dot(dx,vec3(.33)))+abs(dot(dy,vec3(.33))))*2.2,0.,1.);
  return clamp(radial*.62+lum*.28+edge*.25,0.,1.);
}
vec4 scene(sampler2D t,float ia,float z,vec2 pan,float ph){
  vec2 base=cover(v,ia,z,pan);
  vec2 cam=vec2(sin(u_t*.42+ph),cos(u_t*.31+ph)*.55)*u_amp;
  float anchor=smoothstep(0.,.16,min(min(v.x,1.-v.x),min(v.y,1.-v.y)));
  float d=depthAt(t,base);
  vec2 uv=base+cam*(d-.35)*anchor;
  return texture2D(t,clamp(uv,.001,.999));
}
void main(){
  vec4 b=scene(u_b,u_rb,u_zb,u_pb,1.7);
  if(u_mix>=.999){gl_FragColor=b;return;}
  vec4 a=scene(u_a,u_ra,u_za,u_pa,0.);
  gl_FragColor=mix(a,b,u_mix);
}`,
  init(cv) {
    if (this.ok !== null) return this.ok;
    this.cv = cv;
    try {
      const gl = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
      if (!gl) return (this.ok = false);
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, this.VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, this.FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(pr);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.u = {}; ['u_a', 'u_b', 'u_mix', 'u_t', 'u_amp', 'u_ra', 'u_rb', 'u_za', 'u_zb', 'u_pa', 'u_pb', 'u_canvas'].forEach((n) => { this.u[n] = gl.getUniformLocation(pr, n); });
      gl.uniform1i(this.u.u_a, 0); gl.uniform1i(this.u.u_b, 1);
      this.tex = [gl.createTexture(), gl.createTexture()];
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; Saver.glLost(); }, false);
      this.gl = gl; this.ok = true; this.resize(Saver.level); return true;
    } catch (e) { console.warn('Ambient Mode: WebGL unavailable,', e.message); return (this.ok = false); }
  },
  resize(level) {
    if (!this.ok) return;
    const full = AmbientArt.px() / innerWidth; this.scale = full * (level >= 2 ? 1 : .6);
    this.cv.width = Math.round(innerWidth * this.scale); this.cv.height = Math.round(innerHeight * this.scale);
    this.gl.viewport(0, 0, this.cv.width, this.cv.height);
  },
  upload(slot, img) {
    const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + slot); gl.bindTexture(gl.TEXTURE_2D, this.tex[slot]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach((k) => gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.aspect[slot] = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
  },
  // a/b: { slot, z, pan:[x,y] }; b is the scene in front, mix its weight
  draw(a, b, mix, t) {
    const gl = this.gl, u = this.u; if (!gl) return;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[a.slot]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex[b.slot]);
    gl.uniform1i(u.u_a, 0); gl.uniform1i(u.u_b, 1);
    gl.uniform1f(u.u_mix, mix); gl.uniform1f(u.u_t, t); gl.uniform1f(u.u_amp, .025); gl.uniform1f(u.u_canvas, this.cv.width / this.cv.height);
    gl.uniform1f(u.u_ra, this.aspect[a.slot]); gl.uniform1f(u.u_rb, this.aspect[b.slot]);
    gl.uniform1f(u.u_za, a.z); gl.uniform1f(u.u_zb, b.z); gl.uniform2f(u.u_pa, a.pan[0], a.pan[1]); gl.uniform2f(u.u_pb, b.pan[0], b.pan[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  },
};

const Saver = {
  el: null, isOpen: false, last: Date.now(), list: [], i: 0, tok: 0, cur: null, out: null, pre: null, level: 2, slot: 0, side: 0,
  CYCLE: 14000, XF: 2000,
  after() { const v = Store.get('saverAfter', null); return v == null ? (TOUCH_UI && !IS_TV ? 0 : 1.5) : Number(v) || 0; },
  setAfter(v) { Store.set('saverAfter', Number(v) || 0); this.last = Date.now(); },
  init() {
    const poke = () => { this.last = Date.now(); };
    // Keys drive the screensaver while it shows and never reach the page underneath
    addEventListener('keydown', (e) => {
      poke(); if (!this.isOpen) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (Date.now() - this.at < 400) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'MediaTrackNext' || k === 'MediaFastForward') this.skip(1);
      else if (k === 'ArrowLeft' || k === 'MediaTrackPrevious' || k === 'MediaRewind') this.skip(-1);
      else if (k === 'Enter' || k === ' ' || k === 'Select' || e.keyCode === 13 || e.keyCode === 23) this.watch();
      else this.close();
    }, true);
    ['pointerdown', 'wheel', 'touchstart'].forEach((t) => addEventListener(t, poke, { capture: true, passive: true }));
    let px = -1, py = -1;
    addEventListener('pointermove', (e) => {
      if (!this.isOpen) { if (e.pointerType === 'mouse') poke(); return; }
      if (px < 0) { px = e.clientX; py = e.clientY; return; }
      if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) > 24 && Date.now() - this.at > 900) { px = -1; this.close(); }
    }, { capture: true, passive: true });
    this.resetMove = () => { px = -1; };
    addEventListener('resize', () => { if (this.isOpen) this.applyLevel(this.level); });
    setInterval(() => this.tick(), 5000);
    // Back on a TV remote (the Android TV app calls back() directly) dissolves the screensaver first
    const prev = back; back = function () { if (Saver.isOpen) { Saver.close(); return; } return prev.apply(this, arguments); };
  },
  tick() {
    const a = this.after(); if (!a || this.isOpen || Date.now() - this.last < a * 60000) return;
    if (this.allowed()) this.open();
  },
  allowed() {
    const b = document.body.classList, ae = document.activeElement, peak = $('#peak');
    if (document.hidden || b.contains('intro-on') || b.contains('locked')) return false;
    if (!$('#player').hidden || !$('#trailer').hidden || (peak && !peak.hidden)) return false;
    if ($$('video').some((v) => !v.paused && !v.ended)) return false;
    if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return false;
    return this.pool().length >= 2;
  },
  pool() {
    const seen = new Set(), out = [];
    const add = (m) => { if (!m || !m.id || seen.has(m.id) || !metaBg(m)) return; seen.add(m.id); out.push(m); };
    (S.hero || []).forEach(add); (S.watchlist || []).forEach(add);
    try { continueItems().forEach((p) => add({ id: p.metaId, type: p.type, name: p.name, background: p.background, genres: p.genres })); } catch (e) { /* no progress yet */ }
    return out;
  },
  build() {
    const el = document.createElement('div'); el.id = 'saver'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
    const ok = IS_TV ? 'OK' : 'Enter';
    el.innerHTML = `<div class="sv-back"><canvas class="sv-gl"></canvas></div><div class="sv-beam"></div><canvas class="sv-fx"></canvas><div class="sv-front"></div>
      <div class="sv-top"><div class="sv-brand"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="55" fill="none" stroke="url(#mkRing)" stroke-width="3.5"/><use href="#mkLetters" transform="translate(60 60) scale(.84)" fill="url(#mkPlat)"/></svg>MKCINEMA</div><div class="sv-clock"></div></div>
      <div class="sv-hint"><span>◀ ▶ Browse</span><span>${ok} Watch</span><span>Back Return</span></div><i class="sv-back-key"></i>`;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (Date.now() - this.at < 500) return; if (e.target.closest('.sv-watch')) this.watch(); else this.close(); });
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    document.body.appendChild(el);
    AmbientFx.init($('.sv-fx', el));
    return (this.el = el);
  },
  applyLevel(level) {
    this.level = Math.max(0, Math.min(2, level));
    AmbientFx.resize(this.level);
    if (AmbientGL.ok) AmbientGL.resize(this.level);
    this.el.classList.toggle('sv-lite', this.level < 2);
    // dropping to the CSS mode while a shader scene shows: hand it its plain image plane
    if (this.level === 0 && this.cur && this.cur.mode === 'B') { this.cur.mode = 'C'; this.cur.back.prepend(this.cur.img); this.cur.back.classList.add('c'); }
  },
  open(manual) {
    if (this.isOpen) return;
    const pool = this.pool(); if (pool.length < (manual ? 1 : 2)) { if (manual) toast('Ambient Mode needs a few titles on Home first.', 'info'); return; }
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
    const el = this.el || this.build();
    this.list = pool; this.i = -1; this.cur = null; this.out = null; this.pre = null; this.isOpen = true; this.at = Date.now(); this.resetMove();
    $('.sv-front', el).innerHTML = ''; $$('.sv-b', el).forEach((b) => b.remove());
    el.hidden = false; document.body.classList.add('saver-on');
    if (IS_TV && !$('#remote')) $('.sv-back-key', el).id = 'remote';
    this.applyLevel(2);
    if (AmbientGL.ok === null && this.level > 0) AmbientGL.init($('.sv-gl', el));
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    clearTimeout(this.fullT); this.fullT = setTimeout(() => { if (this.isOpen) document.body.classList.add('saver-full'); }, 1200);
    const clock = $('.sv-clock', el), tickClock = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
    tickClock(); clearInterval(this.clk); this.clk = setInterval(tickClock, 15000);
    this.frames = []; this.slow = 0; this.lastF = 0; cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame((t) => this.frame(t));
    this.go(0, false);
  },
  // Fetch art, decode it and build both halves of a scene, ready to swap in
  async prep(m) {
    const b = await AmbientArt.bundle(m);
    let img = null, cors = b.bgCors;
    let titled = !!b.bgText;
    try { img = await AmbientArt.load(b.bg, cors); } catch (e) { cors = false; titled = false; try { img = await AmbientArt.load(metaBg(m), false); } catch (e2) { return null; } }
    if (!this.isOpen) { img.removeAttribute('src'); return null; }
    const colors0 = cors ? AmbientArt.colors(img) : null;
    img = AmbientArt.shrink(img, AmbientArt.px());
    const [cut, logo] = await Promise.all([b.cut && this.level > 0 ? AmbientArt.load(b.cut, false, 7000).catch(() => null) : null, b.logo && !titled && !(b.cut && b.cutTitled && this.level > 0) ? AmbientArt.load(b.logo, false, 6000).catch(() => null) : null]);
    const mode = cut ? 'A' : cors && this.level > 0 && AmbientGL.ok !== false && (AmbientGL.ok || AmbientGL.init($('.sv-gl', this.el))) ? 'B' : 'C';
    const style = ambientStyle(m), colors = colors0 || AMBIENT_STYLES[style].colors;
    const side = mode === 'A' ? 0 : (this.side ^= 1);
    const back = document.createElement('div'); back.className = `sv-b ${mode.toLowerCase()}${side ? ' r' : ''}`;
    img.className = 'sv-bg'; if (mode !== 'B') back.appendChild(img);
    const front = document.createElement('div'); front.className = `sv-f ${mode.toLowerCase()}${side ? ' r' : ''}`;
    front.style.setProperty('--c1', `rgb(${colors[0].join(',')})`); front.style.setProperty('--c2', `rgb(${colors[1].join(',')})`);
    const pills = [yearOf(m) ? esc(yearOf(m)) : '', m.imdbRating ? `<b class="sv-imdb">IMDb</b> ${esc(m.imdbRating)}` : '', ...genresOf(m).slice(0, 2).map(esc)].filter(Boolean).map((x) => `<span class="sv-pill">${x}</span>`).join('');
    front.innerHTML = `<div class="sv-glow"></div>${cut ? '<div class="sv-glow sv-glow2"></div>' : ''}<div class="sv-logo"><div class="sv-logo-in"><h2 class="sv-title"></h2></div></div>
      <div class="sv-hud">${pills}</div><div class="sv-watch"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>Press ${IS_TV ? 'OK' : 'Enter'} to watch</div>`;
    $('.sv-title', front).textContent = m.name || ''; if (titled || (cut && b.cutTitled)) $('.sv-logo', front).hidden = true;
    if (logo) { logo.className = 'sv-logo-img'; $('.sv-logo-in', front).prepend(logo); $('.sv-title', front).hidden = true; }
    if (cut) { cut.className = b.cutTitled ? 'sv-cut ct' : 'sv-cut'; front.prepend(cut); }
    return { m, mode, img, back, front, style, colors, slot: 0, titled };
  },
  preload(idx) {
    const n = this.list.length, m = this.list[((idx % n) + n) % n];
    if (!this.pre || this.pre.m !== m) { this.dropPre(); this.pre = { m, p: this.prep(m) }; }
  },
  async go(idx, fast, tries = 0) {
    const tok = ++this.tok; clearTimeout(this.tPre); clearTimeout(this.tNext);
    const n = this.list.length, m = this.list[((idx % n) + n) % n];
    let p; if (this.pre && this.pre.m === m) { p = this.pre.p; this.pre = null; } else { this.dropPre(); p = this.prep(m); }
    p = Promise.race([p, new Promise((r) => setTimeout(() => r(null), 20000))]);
    let sc = null; try { sc = await p; } catch (e) { sc = null; }
    if (tok !== this.tok || !this.isOpen) { if (sc && sc !== this.cur) this.free(sc); return; }
    if (!sc) { if (tries < Math.min(n, 6)) this.go(idx + (fast === -1 ? -1 : 1), fast, tries + 1); else this.tNext = setTimeout(() => this.go(idx + 1, false), 20000); return; }
    this.i = idx; this.swap(sc, !!fast);
    this.tPre = setTimeout(() => this.preload(this.i + 1), this.CYCLE - 5000);
    this.tNext = setTimeout(() => this.go(this.i + 1, false), this.CYCLE - this.XF);
  },
  skip(dir) { this.go(this.i + dir, dir); },
  free(sc) {
    if (!sc || !sc.back) return; AmbientArt.release(sc.back); AmbientArt.release(sc.front);
    if (sc.img && sc.img.tagName === 'IMG') sc.img.removeAttribute('src'); else if (sc.img) sc.img.width = sc.img.height = 0;
    sc.img = null;
  },
  dropPre() { const pr = this.pre; this.pre = null; if (pr) pr.p.then((sc) => { if (sc && sc !== this.cur) this.free(sc); }, () => {}); },
  glLost() {
    const sc = this.cur; if (!sc || sc.mode !== 'B' || !sc.img) return;
    sc.mode = 'C'; sc.back.classList.remove('b'); sc.back.classList.add('c'); sc.back.prepend(sc.img);
    this.el.classList.remove('is-b'); $('.sv-gl', this.el).style.visibility = 'hidden';
  },
  swap(sc, fast) {
    const el = this.el, dur = fast ? 700 : this.XF, old = this.cur;
    el.style.setProperty('--xf', `${dur}ms`);
    if (sc.mode === 'B') { this.slot ^= 1; sc.slot = this.slot; AmbientGL.upload(sc.slot, sc.img); }
    if (old) {
      old.back.classList.remove('on'); old.front.classList.remove('on'); old.back.classList.add('out'); old.front.classList.add('out');
      this.out = old; old.t1 = performance.now(); old.dur = dur;
      setTimeout(() => { old.back.remove(); old.front.remove(); this.free(old); if (this.out === old) this.out = null; }, dur + 80);
    }
    $('.sv-back', el).appendChild(sc.back); $('.sv-front', el).appendChild(sc.front);
    sc.t0 = performance.now(); sc.dur = dur; this.cur = sc;
    requestAnimationFrame(() => requestAnimationFrame(() => { sc.back.classList.add('on'); sc.front.classList.add('on'); }));
    AmbientFx.setStyle(sc.style, sc.colors);
    $('.sv-beam', el).classList.toggle('on', sc.style === 'dust' && this.level > 0);
    el.classList.toggle('is-b', sc.mode === 'B');
    $('.sv-gl', el).style.visibility = sc.mode === 'B' || (old && old.mode === 'B') ? '' : 'hidden';
  },
  // One animation loop: the shader scene, the particles, and the frame-time governor
  frame(t) {
    if (!this.isOpen) return;
    this.raf = requestAnimationFrame((x) => this.frame(x));
    const dt = this.lastF ? Math.min(.1, (t - this.lastF) / 1000) : .016; this.lastF = t;
    const cur = this.cur, out = this.out, ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : .5 - Math.cos(Math.PI * k) / 2);
    if (AmbientGL.ok && this.level > 0 && cur && (cur.mode === 'B' || (out && out.mode === 'B'))) {
      const sceneOf = (s) => { const k = (t - s.t0) / this.CYCLE, enter = ease((t - s.t0) / s.dur); return { slot: s.slot, z: (1.08 + .08 * ease(k)) * (.95 + .05 * enter), pan: [.022 * (1 - 2 * ease(k)) * (s.back.classList.contains('r') ? -1 : 1), -.008 * ease(k)] }; };
      const leave = (s) => { const sc = sceneOf(s); sc.z *= 1 + .12 * ease((t - s.t1) / s.dur); return sc; };
      if (cur.mode === 'B' && out && out.mode === 'B') AmbientGL.draw(leave(out), sceneOf(cur), ease((t - cur.t0) / cur.dur), t / 1000);
      else if (cur.mode === 'B') { const s = sceneOf(cur); AmbientGL.draw(s, s, 1, t / 1000); }
      else { const s = leave(out); AmbientGL.draw(s, s, 1, t / 1000); }
    }
    AmbientFx.step(dt, t);
    // Governor: frames over budget for about a second and a half, outside the moments a new scene lands, step down
    const settling = cur && t - cur.t0 < 2600;
    if (!settling && dt > 0) { this.slow = dt * 1000 > 18.5 ? this.slow + 1 : Math.max(0, this.slow - 2); if (this.slow > 90 && this.level > 0) { this.slow = 0; this.applyLevel(this.level - 1); } }
  },
  watch() {
    const m = this.cur && this.cur.m; this.close();
    if (m) setTimeout(() => openDetail(m), 300);
  },
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; this.tok++; this.last = Date.now(); this.dropPre();
    clearTimeout(this.tPre); clearTimeout(this.tNext); clearInterval(this.clk); clearTimeout(this.fullT); cancelAnimationFrame(this.raf);
    const el = this.el; document.body.classList.remove('saver-full'); el.classList.remove('on');
    const b = $('#remote', el); if (b) b.removeAttribute('id');
    setTimeout(() => {
      if (this.isOpen) return;
      this.free(this.cur); this.free(this.out); AmbientFx.sprites.clear();
      el.hidden = true; $('.sv-front', el).innerHTML = ''; $$('.sv-b', el).forEach((x) => x.remove()); this.cur = this.out = null;
      document.body.classList.remove('saver-on');
      if (typeof tvBackHook === 'function') tvBackHook();
    }, 460);
  },
};
Saver.init();
