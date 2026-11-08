/* MKCinema captions (2.60): on-device speech recognition for films without subtitles.
   Whisper base (OpenAI, MIT licence; ONNX export by onnx-community, 8-bit, about 77 MB) runs with Transformers.js
   (Apache 2.0) and ONNX Runtime Web (MIT) in WebAssembly, one thread. The model downloads once from Hugging Face and
   stays in this browser's cache. The sound arrives here as 16 kHz mono samples and never leaves the device. */
import { pipeline, env } from './vendor/transformers.min.js';

const MODEL = 'onnx-community/whisper-base';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1; // the app isn't cross-origin isolated, so threads aren't available anyway
env.backends.onnx.wasm.proxy = false;

let asrP = null;
function load() {
  if (asrP) return asrP;
  const files = {};
  let last = 0;
  asrP = pipeline('automatic-speech-recognition', MODEL, {
    dtype: 'q8', device: 'wasm',
    progress_callback: (p) => {
      if (p.status !== 'progress' || !p.file || !p.total) return;
      files[p.file] = [p.loaded || 0, p.total];
      const now = Date.now(); if (now - last < 400) return; last = now;
      let a = 0, b = 0; for (const k in files) { a += files[k][0]; b += files[k][1]; }
      self.postMessage({ op: 'progress', loaded: a, total: b });
    },
  });
  asrP.catch(() => { asrP = null; });
  return asrP;
}

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.op === 'load') {
    try { await load(); self.postMessage({ op: 'ready' }); }
    catch (err) { self.postMessage({ op: 'fail', reason: (err && err.message) || String(err) }); }
  } else if (m.op === 'run') {
    try {
      const asr = await load();
      const t = performance.now();
      const opts = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 0, task: m.task || 'transcribe' };
      if (m.lang) opts.language = m.lang;
      let out;
      try { out = await asr(new Float32Array(m.data), opts); }
      catch (err) { if (!m.lang) throw err; delete opts.language; out = await asr(new Float32Array(m.data), opts); } // a language Whisper doesn't know
      self.postMessage({ op: 'text', id: m.id, t0: m.t0, dur: m.dur, ms: performance.now() - t, chunks: out.chunks || [], text: out.text || '' });
    } catch (err) { self.postMessage({ op: 'error', id: m.id, reason: (err && err.message) || String(err) }); }
  }
};
