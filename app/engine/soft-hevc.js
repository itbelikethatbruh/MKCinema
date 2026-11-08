/* MKCinema software HEVC playback (2.58, computers only, off by default: Settings › Playback).
   Loaded by mkv-engine.js only when a film needs it. The sound plays through the normal <video> element (Media Source,
   audio only), so the player's controls, seeking and time stay as they are; hevc-decoder.worker.js decodes the picture
   and this file draws it with WebGL 2 on a canvas over the video, picking the picture that matches video.currentTime.
   HDR10/HLG pictures are tone-mapped to SDR in the shader. After a seek (or when decoding falls behind) the sound holds
   (playbackRate 0) until the picture has caught up, so the two never drift apart. */
'use strict';
(() => {
  const CAP = 10; // pictures held on the page (1080p 10-bit: about 6 MB each)
  const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
  const FS = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
in vec2 uv; out vec4 o;
uniform usampler2D ty, tu, tv; uniform vec2 size; uniform float maxv, scale; uniform int full, mat, tf; uniform float peak;
float lum(ivec2 c) { return float(texelFetch(ty, c, 0).r); }
float chr(usampler2D t, vec2 pc) {
  vec2 cs = vec2(textureSize(t, 0)); vec2 c = pc * 0.5 - 0.25; vec2 f = fract(c); ivec2 i = ivec2(floor(c));
  ivec2 hi = ivec2(cs) - 1; ivec2 a = clamp(i, ivec2(0), hi), b = clamp(i + 1, ivec2(0), hi);
  float s00 = float(texelFetch(t, a, 0).r), s10 = float(texelFetch(t, ivec2(b.x, a.y), 0).r), s01 = float(texelFetch(t, ivec2(a.x, b.y), 0).r), s11 = float(texelFetch(t, b, 0).r);
  return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}
vec3 pqEotf(vec3 e) { // SMPTE ST 2084, result in units of 10000 nits
  vec3 p = pow(max(e, 0.0), vec3(1.0 / 78.84375)); return pow(max(p - 0.8359375, 0.0) / (18.8515625 - 18.6875 * p), vec3(1.0 / 0.1593017578125));
}
vec3 hlgInv(vec3 e) { vec3 a = e * e / 3.0, b = (exp((e - 0.55991073) / 0.17883277) + 0.28466892) / 12.0; return mix(a, b, step(0.5, e)); }
vec3 srgb(vec3 l) { l = clamp(l, 0.0, 1.0); return mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, l)); }
void main() {
  vec2 pc = uv * size; ivec2 ic = ivec2(min(pc, size - 1.0));
  float Y = lum(ic), U = chr(tu, pc), V = chr(tv, pc);
  float y, cb, cr;
  if (full == 1) { y = Y / maxv; cb = U / maxv - 0.5; cr = V / maxv - 0.5; }
  else { y = (Y - 16.0 * scale) / (219.0 * scale); cb = (U - 128.0 * scale) / (224.0 * scale); cr = (V - 128.0 * scale) / (224.0 * scale); }
  vec3 rgb;
  if (mat == 9) rgb = vec3(y + 1.4746 * cr, y - 0.16455 * cb - 0.57135 * cr, y + 1.8814 * cb);
  else if (mat == 6) rgb = vec3(y + 1.402 * cr, y - 0.344136 * cb - 0.714136 * cr, y + 1.772 * cb);
  else rgb = vec3(y + 1.5748 * cr, y - 0.1873 * cb - 0.4681 * cr, y + 1.8556 * cb);
  if (tf == 16 || tf == 18) {
    // HDR: to light (nits), tone-map the brightness to SDR (203 nits = paper white), BT.2020 colours to BT.709, sRGB
    vec3 nits = tf == 16 ? pqEotf(rgb) * 10000.0 : 1000.0 * pow(max(hlgInv(clamp(rgb, 0.0, 1.0)), 0.0), vec3(1.2));
    vec3 x = nits / 203.0; float L = dot(x, vec3(0.2627, 0.6780, 0.0593)); float W = peak / 203.0;
    float Lt = L * (1.0 + L / (W * W)) / (1.0 + L); x *= L > 0.0 ? Lt / L : 0.0;
    x = mat3(1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187) * x;
    o = vec4(srgb(x), 1.0);
  } else o = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}`;

  class Soft {
    constructor(E, info) {
      this.E = E; this.info = info; this.q = []; this.gen = 0; this.target = 0; this.hold = false; this.rate = 1; this.late = false;
      this.drawn = -1; this.lastPts = -1; this.shown = 0; this.texKey = ''; this.dropped = 0; this.t0 = performance.now(); this.dead = false;
      const c = info.video.color || {};
      this.color = { mat: c.matrix || (info.video.bits > 8 && (c.prim === 9 || c.trc === 16 || c.trc === 18) ? 9 : 1), tf: c.trc || 1, full: c.range === 2 ? 1 : 0 };
      this.dec = new Worker(new URL('engine/hevc-decoder.worker.js', location.href));
      this.dec.onmessage = (e) => this.msg(e.data || {});
      this.dec.onerror = () => this.E.fail('the HEVC decoder stopped');
      this.canvas();
      this.raf = requestAnimationFrame(() => this.loop());
    }
    /* the engine worker's end of the channel goes to it; this end to the decoder */
    connect(port, gen, t) {
      this.gen = gen; this.target = t;
      this.dec.postMessage({ op: 'init', cfg: this.info.video.cfg, port, gen, credit: CAP }, [port]);
      this.holdOn();
    }
    reset(gen, t) {
      this.gen = gen; this.target = t; this.q = []; this.drawn = -1; this.lastPts = -1; this.ended = false;
      this.dec.postMessage({ op: 'gen', gen, credit: CAP });
      this.holdOn();
    }
    holdOn() {
      if (this.hold) return; this.hold = true;
      this.rate = video.playbackRate || 1;
      try { video.playbackRate = 0; } catch (e) { /* not allowed here */ }
    }
    holdOff() {
      if (!this.hold) return; this.hold = false;
      try { video.playbackRate = this.rate || 1; } catch (e) { /* ignore */ }
    }
    msg(m) {
      if (this.dead) return;
      if (m.op === 'error') { this.E.fail(`the HEVC decoder failed (${m.reason})`); return; }
      if (m.op === 'stats') { this.dstats = m; return; }
      if (m.op === 'end') { if (m.gen === this.gen) this.ended = true; return; }
      if (m.op !== 'frame' || m.gen !== this.gen) return; // a frame from before a seek: the decoder's credit was reset with it
      // pictures from before the spot asked for (decoding starts at the keyframe before it) go straight back
      if (m.pts < this.target - 0.05) { this.dec.postMessage({ op: 'credit', n: 1 }); return; }
      this.lastPts = Math.max(this.lastPts, m.pts);
      let i = this.q.length; while (i > 0 && this.q[i - 1].pts > m.pts) i--; this.q.splice(i, 0, m);
    }
    canvas() {
      const cv = this.cv = document.createElement('canvas'); cv.id = 'swLayer'; cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:0;background:#000';
      const st = video.parentElement; st.insertBefore(cv, video.nextSibling);
      const gl = this.gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL 2 is off in this browser');
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const pr = this.pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.tex = ['ty', 'tu', 'tv'].map((n, k) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.uniform1i(gl.getUniformLocation(pr, n), k); return t; });
      this.u = {}; for (const n of ['size', 'maxv', 'scale', 'full', 'mat', 'tf', 'peak']) this.u[n] = gl.getUniformLocation(pr, n);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    }
    draw(f) {
      const gl = this.gl, deep = f.fmt !== 0 && f.fmt !== 12; // 0 yuv420p, 12 yuvj420p; 62/64 etc. 10-bit little-endian
      const bits = deep ? Math.max(10, this.info.video.bits || 10) : 8, w = f.w, h = f.h, cw = (w + 1) >> 1, ch = (h + 1) >> 1;
      if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; gl.viewport(0, 0, w, h); }
      const planes = [[w, h], [cw, ch], [cw, ch]], key = `${w}x${h}x${deep}`;
      if (this.texKey !== key) {
        // fixed-size storage once per picture size; each picture is then a plain sub-image upload
        this.tex.forEach((t) => gl.deleteTexture(t));
        this.tex = planes.map(([pw, ph], k) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texStorage2D(gl.TEXTURE_2D, 1, deep ? gl.R16UI : gl.R8UI, pw, ph); return t; });
        this.texKey = key;
      }
      for (let k = 0; k < 3; k++) {
        const L = f.layout[k], [pw, ph] = planes[k];
        gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, this.tex[k]);
        if (deep) {
          gl.pixelStorei(gl.UNPACK_ROW_LENGTH, L.stride >> 1);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, pw, ph, gl.RED_INTEGER, gl.UNSIGNED_SHORT, new Uint16Array(f.data.buffer, f.data.byteOffset + L.offset, ((L.stride >> 1) * (ph - 1)) + pw));
        } else {
          gl.pixelStorei(gl.UNPACK_ROW_LENGTH, L.stride);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, pw, ph, gl.RED_INTEGER, gl.UNSIGNED_BYTE, new Uint8Array(f.data.buffer, f.data.byteOffset + L.offset, L.stride * (ph - 1) + pw));
        }
      }
      const c = this.color;
      gl.uniform2f(this.u.size, w, h); gl.uniform1f(this.u.maxv, (1 << bits) - 1); gl.uniform1f(this.u.scale, 1 << (bits - 8));
      gl.uniform1i(this.u.full, c.full); gl.uniform1i(this.u.mat, c.mat); gl.uniform1i(this.u.tf, c.tf); gl.uniform1f(this.u.peak, 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.shown++;
    }
    loop() {
      if (this.dead) return;
      this.raf = requestAnimationFrame(() => this.loop());
      const t = video.currentTime;
      // the newest picture that is due; older ones are dropped (credit back to the decoder)
      let pick = -1; for (let i = 0; i < this.q.length; i++) { if (this.q[i].pts <= t + 0.015) pick = i; else break; }
      if (pick >= 0) {
        const f = this.q[pick], gone = this.q.splice(0, pick + 1);
        if (gone.length > 1) this.dropped += gone.length - 1;
        if (f.pts !== this.drawn) { this.draw(f); this.drawn = f.pts; }
        this.dec.postMessage({ op: 'credit', n: gone.length });
      }
      if (this.hold) {
        // the player may set its speed while we wait: remember it and keep waiting
        if (video.playbackRate !== 0) { this.rate = video.playbackRate; try { video.playbackRate = 0; } catch (e) { /* ignore */ } }
        // the sound waits on the spot; it goes again once the picture for that spot is on screen
        if (!this.q.length && this.ended) { this.holdOff(); return; } // a seek to the very end: nothing left to wait for
        if (this.q.length) { const f = this.q[0]; if (this.drawn !== f.pts) { this.draw(f); this.drawn = f.pts; } if (f.pts <= Math.max(t, this.target) + 0.25) this.holdOff(); }
        return;
      }
      if (video.paused || video.seeking) return;
      // falling behind: skip pictures nothing refers to; far behind: hold the sound until the picture catches up
      const behind = this.lastPts >= 0 ? t - this.lastPts : 0;
      if (behind > 0.25 && !this.late) { this.late = true; this.dec.postMessage({ op: 'late', on: true }); }
      else if (behind < -0.6 && this.late) { this.late = false; this.dec.postMessage({ op: 'late', on: false }); }
      if (behind > 1.2 && !this.q.length) { this.target = t; this.holdOn(); }
    }
    stats() {
      this.dec.postMessage({ op: 'stats' });
      const s = (performance.now() - this.t0) / 1000, d = this.dstats;
      return `decoded here${d && d.ms ? ` · ${Math.round(d.n / (d.ms / 1000))} fps possible` : ''} · ${Math.round(this.shown / Math.max(1, s))} fps shown${this.dropped ? ` · ${this.dropped} skipped` : ''}`;
    }
    destroy() {
      this.dead = true; cancelAnimationFrame(this.raf); this.holdOff();
      try { this.dec.terminate(); } catch (e) { /* gone */ }
      if (this.cv) { this.cv.remove(); this.cv = null; }
      try { const x = this.gl && this.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* ignore */ }
    }
  }
  window.MkSoft = Soft;
})();
