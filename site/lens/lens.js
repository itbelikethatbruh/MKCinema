/* MKCinema site: "Look through" glasses reveal.
   A tiny WebGL renderer (no libraries) for one model: glasses arrive folded, open, show a subtitle in the lens,
   then the camera pushes into the lens and the lens becomes a window onto the app.
   Loaded only when the section is near; the page shows a still poster everywhere this can't run. */
export function start(sec, opts = {}) {
  const stage = sec.querySelector('.lx-stage'), cv = sec.querySelector('canvas'), shotImg = sec.querySelector('.lx-shot img');
  const gl = cv.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) return Promise.reject(new Error('no webgl'));

  const VS = `attribute vec4 aP;attribute vec4 aN;
uniform vec3 uQs,uQo;uniform mat4 uM,uV,uP;uniform vec2 uFold;uniform vec4 uPiv;
varying vec3 vW,vN,vL;varying float vPart;
vec3 ry(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);}
void main(){vec3 p=aP.xyz*uQs+uQo;vec3 n=aN.xyz/127.;float part=aP.w;vL=p;
if(part>.5&&part<1.5){vec3 o=vec3(uPiv.x,0.,uPiv.y);p=ry(p-o,-uFold.x)+o;n=ry(n,-uFold.x);}
else if(part>1.5&&part<2.5){vec3 o=vec3(uPiv.z,0.,uPiv.w);p=ry(p-o,uFold.y)+o;n=ry(n,uFold.y);}
vec4 w=uM*vec4(p,1.);vW=w.xyz;vN=mat3(uM)*n;vPart=part;gl_Position=uP*uV*w;}`;

  const FS = `precision highp float;
varying vec3 vW,vN,vL;varying float vPart;
uniform vec3 uEye;uniform float uSweep,uFade,uWin,uSubA,uType,uAlpha;uniform vec2 uRes,uCover;uniform vec4 uBox;
uniform sampler2D uShot,uSub;
vec3 env(vec3 r){float az=atan(r.x,r.z);
float top=smoothstep(.5,.95,r.y);
float strip=exp(-pow((az-uSweep)*5.,2.))*smoothstep(-.7,.15,r.y);
float strip2=exp(-pow((az+2.2-uSweep*.5)*9.,2.))*smoothstep(-.3,.5,r.y)*.6;
float rim=smoothstep(.15,.95,-r.x)*smoothstep(-.5,.5,r.y);
float floorb=smoothstep(-.2,-.9,r.y)*.25;
return vec3(.92,.94,1.)*top*2.4+vec3(1.,.96,.88)*strip*5.+vec3(1.)*strip2*1.6+vec3(.95,.8,.55)*rim*.6+vec3(.9,.75,.5)*floorb*.4+vec3(.03);}
vec3 tone(vec3 c){c=c*(2.51*c+.03)/(c*(2.43*c+.59)+.14);return pow(clamp(c,0.,1.),vec3(1./2.2));}
void main(){vec3 n=normalize(vN);vec3 v=normalize(uEye-vW);if(dot(n,v)<0.)n=-n;
vec3 r=reflect(-v,n);float nv=clamp(dot(n,v),0.,1.);float fr=pow(1.-nv,5.);
vec3 L=normalize(vec3(-.5,.8,.6));vec3 h=normalize(L+v);float spec=pow(max(dot(n,h),0.),180.)*2.5;
vec3 col;float a=1.;
if(vPart>3.5&&vPart<4.5){ /* camera glass */
 col=vec3(.004,.004,.01)+env(r)*(.12+.88*fr)+vec3(.4,.35,.6)*pow(1.-nv,2.)*.08+spec;}
else if(vPart>2.5&&vPart<3.5){ /* lens */
 float f=.05+.95*fr;vec3 glass=vec3(.01,.012,.016)+env(r)*f+spec*.8;a=mix(.62,1.,f);
 vec2 s=gl_FragCoord.xy/uRes;vec2 uv=(s-.5)*uCover+.5;vec3 shot=texture2D(uShot,uv).rgb;
 float ab=pow(1.-nv,2.)*.03;vec3 shotc=vec3(texture2D(uShot,uv+vec2(ab,0.)).r,shot.g,texture2D(uShot,uv-vec2(ab,0.)).b);
 col=mix(glass,shotc*.96+env(r)*f*.25,uWin);a=mix(a,1.,uWin);
 vec2 q=(vL.xy-uBox.xy)/uBox.zw;
 if(uSubA>0.&&q.x>0.&&q.x<1.&&q.y>0.&&q.y<1.){vec4 t=texture2D(uSub,vec2(q.x,q.y));float m=t.a*uSubA*clamp((uType*1.1-q.x)/.06,0.,1.);
  col=mix(col,t.rgb,m);a=max(a,m);}}
else{ /* gloss black acetate */
 float f=.06+.94*fr;col=vec3(.012)*(.3+.7*max(dot(n,L),0.))+env(r)*f+spec*1.2+vec3(.95,.78,.5)*pow(1.-nv,4.)*.22;}
gl_FragColor=vec4(tone(col)*a*uFade*uAlpha,a*uFade*uAlpha);}`;

  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(pr, 0, 'aP'); gl.bindAttribLocation(pr, 1, 'aN'); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return Promise.reject(new Error(gl.getProgramInfoLog(pr)));
  gl.useProgram(pr);
  const U = {}; ['uQs', 'uQo', 'uM', 'uV', 'uP', 'uFold', 'uPiv', 'uEye', 'uSweep', 'uFade', 'uWin', 'uSubA', 'uType', 'uAlpha', 'uRes', 'uCover', 'uBox', 'uShot', 'uSub'].forEach(k => U[k] = gl.getUniformLocation(pr, k));

  const tex = (src, unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(w => gl.texParameteri(gl.TEXTURE_2D, w, gl.CLAMP_TO_EDGE));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t; };

  // the subtitle the lens shows: drawn once, white with a soft glow, like a heads-up line
  const LINES = opts.lines || [['EN', 'Did you hear that?'], ['ES', '¿Oíste eso?'], ['FR', 'Tu as entendu ?'], ['DE', 'Hast du das gehört?'], ['JA', '今の、聞こえた？'], ['PT', 'Você ouviu isso?']];
  const sc2 = document.createElement('canvas'); sc2.width = 1024; sc2.height = 512; const sx = sc2.getContext('2d');
  const subCanvas = i => { const x = sx, font = getComputedStyle(document.body).fontFamily, [lang, line] = LINES[i % LINES.length];
    x.clearRect(0, 0, 1024, 512); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `600 34px ${font}`; x.fillStyle = 'rgba(216,194,154,.95)'; x.fillText('MKCINEMA  ·  ' + lang, 512, 170);
    x.shadowColor = 'rgba(255,248,232,.9)'; x.shadowBlur = 22; x.fillStyle = '#fbf8f1';
    let fs = 92; x.font = `600 ${fs}px ${font}`; while (x.measureText(line).width > 960 && fs > 40) x.font = `600 ${fs -= 4}px ${font}`;
    x.fillText(line, 512, 280); x.shadowBlur = 0; x.fillText(line, 512, 280); return sc2; };

  const ok = new Promise((res, rej) => {
    const shot = new Image(); shot.decoding = 'async'; shot.src = innerWidth < innerHeight && shotImg.dataset.portrait ? shotImg.dataset.portrait : shotImg.currentSrc || shotImg.src;
    const model = fetch(opts.model || '/lens/glasses.bin').then(r => { if (!r.ok) throw new Error('model ' + r.status); return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); });
    Promise.all([model, shot.decode().then(() => shot), document.fonts ? document.fonts.ready : 0]).then(([buf, img]) => res([buf, img]), rej);
  });

  return ok.then(([buf, img]) => {
    if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'MKG1') throw new Error('bad model');
    const H = new Float32Array(buf, 4, 19), n = H[0], ni = H[1];
    const posOff = 4 + 19 * 4, nrmOff = posOff + n * 8, idxOff = nrmOff + n * 4;
    const pos = new Int16Array(buf, posOff, n * 4), nrm = new Int8Array(buf, nrmOff, n * 4), idx = new Uint16Array(buf.slice(idxOff, idxOff + ni * 2));
    const ranges = [H[8], H[9], H[10], H[11], H[12], H[13]];
    const qs = [H[2], H[3], H[4]], qo = [H[5], H[6], H[7]];
    // the lens the subtitle sits in: the viewer-left lens (the wearer's right eye)
    let bx0 = 9, by0 = 9, bx1 = -9, by1 = -9;
    for (let i = ranges[4]; i < ranges[4] + ranges[5]; i++) { const v = idx[i], x = pos[v * 4] * qs[0] + qo[0], y = pos[v * 4 + 1] * qs[1] + qo[1]; if (x < 0) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); } }
    const lensC = [(bx0 + bx1) / 2, (by0 + by1) / 2];
    const bw = (bx1 - bx0) * .96, bh = bw / 2; // texture is 2:1
    const box = [lensC[0] - bw / 2, lensC[1] - bh * .62, bw, bh];

    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.SHORT, false, 0, 0);
    const bn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.bufferData(gl.ARRAY_BUFFER, nrm, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.BYTE, false, 0, 0);
    const bi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.uniform3fv(U.uQs, qs); gl.uniform3fv(U.uQo, qo);
    gl.uniform4f(U.uPiv, H[14], H[15], H[16], H[17]); gl.uniform4fv(U.uBox, box);
    tex(img, 0); const subT = tex(subCanvas(0), 1); let lang = 0; gl.uniform1i(U.uShot, 0); gl.uniform1i(U.uSub, 1);
    const imgAsp = img.naturalWidth / img.naturalHeight;
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);

    // ---- maths ----
    const persp = (f, a, nr, fr) => { const t = 1 / Math.tan(f / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + nr) / (nr - fr), -1, 0, 0, 2 * fr * nr / (nr - fr), 0]; };
    const look = (e, c) => { let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; const zl = Math.hypot(...z); z = z.map(v => v / zl);
      let x = [z[2], 0, -z[0]]; const xl = Math.hypot(...x) || 1; x = x.map(v => v / xl); const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]; };
    const rot = (ax, ay, az) => { const [a, b2, c] = [Math.cos(ax), Math.cos(ay), Math.cos(az)], [d, e, f] = [Math.sin(ax), Math.sin(ay), Math.sin(az)];
      // R = Rz * Ry * Rx (column-major)
      return [b2 * c, b2 * f, -e, 0, d * e * c - a * f, d * e * f + a * c, d * b2, 0, a * e * c + d * f, a * e * f - d * c, a * b2, 0, 0, 0, 0, 1]; };
    const mul = (A, B) => { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += A[k * 4 + j] * B[i * 4 + k]; o[i * 4 + j] = s; } return o; };
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const pt = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];

    let W = 0, Ht = 0, dpr = 1, maxDpr = opts.maxDpr || 2;
    const size = () => { const r = stage.getBoundingClientRect(); W = r.width; Ht = r.height; dpr = Math.min(devicePixelRatio || 1, maxDpr);
      cv.width = Math.round(W * dpr); cv.height = Math.round(Ht * dpr); };
    size();

    // state the page drives: p = scroll progress 0..1, mx/my = pointer -1..1, t = seconds
    const S = { p: 0, mx: 0, my: 0, t: 0 };
    const draw = () => {
      const p = S.p, asp = W / Ht, portrait = asp < 1;
      const enter = ss(0, .2, p), open = ss(.16, .4, p), face = ss(.12, .42, p), sub = ss(.42, .5, p), type = ss(.44, .58, p);
      const push = ss(.6, .9, p), win = ss(.63, .72, p);
      const fade = ss(0, .1, p);
      // model: tumble in, then face you; a slow float while idle
      const fl = Math.sin(S.t * .8) * .02 * (1 - push), tilt = (1 - push);
      const M = rot(mix(.55, .06, face) + S.my * .06 * tilt + fl, mix(-1.05, 0, face) + S.mx * .12 * tilt + (1 - enter) * -.5, mix(.18, 0, face));
      const sc = mix(.82, 1, enter);
      for (let i = 0; i < 12; i++) M[i] *= sc;
      M[13] = mix(-.25, 0, enter);
      // camera: frame the glasses, then dive into the subtitle lens
      const fov = .52, fitW = portrait ? .94 : Math.min(.62, .62 * 1.6 / asp + .1);
      const D = (2.2 / fitW) / (2 * Math.tan(fov / 2) * asp);
      const yOff = portrait ? -.1 : -.06;
      const lens = pt(M, [lensC[0], lensC[1], .035]);
      const k = push * push * (3 - 2 * push);
      const near = .05, dist = D * Math.pow(near / D, k);
      const kt = 1 - Math.pow(1 - k, 3); // aim at the lens before the dolly gets close
      const tgt = [lens[0] * kt, mix(yOff * D * .4, lens[1], kt), lens[2] * kt];
      const eye = [tgt[0], tgt[1], tgt[2] + dist];
      gl.viewport(0, 0, cv.width, cv.height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(U.uM, false, M); gl.uniformMatrix4fv(U.uV, false, look(eye, tgt)); gl.uniformMatrix4fv(U.uP, false, persp(fov, asp, .01, 50));
      gl.uniform3fv(U.uEye, eye);
      gl.uniform2f(U.uFold, mix(1.48, 0, open), mix(1.38, 0, open));
      gl.uniform1f(U.uSweep, mix(-1.4, 1.1, ss(0, .5, p)) + Math.sin(S.t * .35) * .08);
      // after the first line has typed in, cycle languages while the lens line is showing
      const li = sub > .99 && type > .99 ? 1 + Math.floor(S.t / 1.8) : 0;
      if (li !== lang) { lang = li; gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, subT); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, subCanvas(li)); }
      gl.uniform1f(U.uFade, fade); gl.uniform1f(U.uWin, win); gl.uniform1f(U.uSubA, sub * (1 - ss(.58, .63, p))); gl.uniform1f(U.uType, type);
      gl.uniform2f(U.uRes, cv.width, cv.height);
      const ca = asp / imgAsp; gl.uniform2f(U.uCover, ca > 1 ? 1 : ca, ca > 1 ? 1 / ca : 1);
      // opaque parts, then the camera glass, then the lenses blended on top
      gl.uniform1f(U.uAlpha, 1); gl.disable(gl.BLEND); gl.depthMask(true);
      gl.drawElements(gl.TRIANGLES, ranges[1], gl.UNSIGNED_SHORT, ranges[0] * 2);
      gl.drawElements(gl.TRIANGLES, ranges[3], gl.UNSIGNED_SHORT, ranges[2] * 2);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.drawElements(gl.TRIANGLES, ranges[5], gl.UNSIGNED_SHORT, ranges[4] * 2);
      gl.depthMask(true);
    };
    return { S, draw, size, setMaxDpr: v => { maxDpr = v; size(); }, gl };
  });
}
