/* MKCinema software HEVC decoder (2.58, computers only, off by default).
   For browsers that can't decode HEVC (x265) themselves: FFmpeg's HEVC decoder (LGPL, WebAssembly, one thread) turns
   the samples the engine worker sends over a MessagePort into YUV pictures for the page, which draws them with WebGL
   in step with the sound. The page grants credits (one per picture it can hold), so memory stays bounded. */
'use strict';
const D = { la: null, c: 0, pkt: 0, frame: 0, gen: 0, q: [], credit: 0, busy: false, ended: false, skip: false, port: null, n: 0, t0: 0 };
const BASE = new URL('hevc/', self.location.href).href.replace(/\/$/, '');
async function open(cfg) {
  const wasmurl = `${BASE}/libav-6.10.9.0-mkc-hevc.wasm.wasm`;
  self.LibAV = { base: BASE, wasmurl, nolibavworker: true };
  importScripts(`${BASE}/libav-6.10.9.0-mkc-hevc.js`);
  const la = D.la = await self.LibAV.LibAV({ noworker: true, nothreads: true, base: BASE, wasmurl });
  const cp = await la.avcodec_parameters_alloc();
  await la.AVCodecParameters_codec_type_s(cp, 0);
  const ptr = await la.malloc(cfg.length + 64); await la.copyin_u8(ptr, new Uint8Array([...cfg, ...new Uint8Array(64)]));
  await la.AVCodecParameters_extradata_s(cp, ptr); await la.AVCodecParameters_extradata_size_s(cp, cfg.length);
  [, D.c, D.pkt, D.frame] = await la.ff_init_decoder('hevc', { codecpar: cp });
}
async function setSkip(on) {
  if (D.skip === on || !D.la) return; D.skip = on;
  try { await D.la.av_opt_set(D.c, 'skip_frame', on ? 'nonref' : 'default', 0); } catch (e) { /* older build */ }
}
async function pump() {
  if (D.busy || !D.la) return;
  D.busy = true;
  try {
    while (D.credit > 0 && (D.q.length || D.ended)) {
      if (D.needFlush) { D.needFlush = false; try { await D.la.avcodec_flush_buffers(D.c); } catch (x) { /* ignore */ } }
      const gen = D.gen, fin = !D.q.length && D.ended;
      const batch = D.q.splice(0, Math.min(4, D.credit + 2));
      const t = performance.now();
      const frames = await D.la.ff_decode_multi(D.c, D.pkt, D.frame, batch.map((s) => ({ data: s.data, pts: Math.round(s.pts * 1000), ptshi: 0, flags: s.key ? 1 : 0 })), { fin, ignoreErrors: true });
      D.t0 += performance.now() - t;
      if (gen !== D.gen) continue;
      for (const f of frames) {
        D.credit--; D.n++;
        postMessage({ op: 'frame', gen, pts: f.pts / 1000, w: f.width, h: f.height, fmt: f.format, data: f.data, layout: f.layout, crop: f.crop }, [f.data.buffer]);
      }
      if (fin) { D.ended = false; postMessage({ op: 'end', gen }); }
    }
  } catch (e) { postMessage({ op: 'error', reason: e.message || String(e) }); }
  D.busy = false;
  if (D.credit > 0 && D.q.length) pump();
}
/* a new spot (seek): drop what is queued and clear the decoder's references */
function newGen(gen) {
  // the decoder's references are cleared by pump() before its next picture, never while a decode is running
  D.gen = gen; D.q = []; D.ended = false; D.needFlush = true; pump();
}
function onSample(m) {
  // samples can overtake the page's own message about a seek: the first one of a newer read starts it
  if (m.gen > D.gen) newGen(m.gen);
  if (m.gen !== D.gen) return;
  if (m.op === 'end') { D.ended = true; pump(); return; }
  D.q.push(m); pump();
}
self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.op === 'init') {
      D.gen = m.gen || 0; D.credit = m.credit || 0;
      D.port = m.port; D.port.onmessage = (ev) => onSample(ev.data || {});
      await open(m.cfg); postMessage({ op: 'ready' }); pump();
    } else if (m.op === 'gen') {
      // a seek: everything queued belongs to the old spot
      D.credit = m.credit;
      if (m.gen > D.gen) newGen(m.gen); else pump();
    } else if (m.op === 'credit') { D.credit += m.n; pump(); }
    else if (m.op === 'late') setSkip(!!m.on);
    else if (m.op === 'stats') postMessage({ op: 'stats', n: D.n, ms: D.t0, q: D.q.length });
  } catch (err) { postMessage({ op: 'error', reason: err.message || String(err) }); }
};
