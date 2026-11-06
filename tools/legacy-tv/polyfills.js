/* Polyfills for older TV browsers (Samsung 2019-2022, LG 2020-2022: Chromium 63-87).
   build.js bundles this file with esbuild, so the core-js imports below become inline code. Every polyfill checks
   for the real feature first, so a newer engine keeps its own. */
import 'core-js/actual/array/flat';
import 'core-js/actual/array/flat-map';
import 'core-js/actual/array/at';
import 'core-js/actual/object/from-entries';
import 'core-js/actual/object/has-own';
import 'core-js/actual/promise/all-settled';
import 'core-js/actual/promise/any';
import 'core-js/actual/promise/finally';
import 'core-js/actual/string/match-all';
import 'core-js/actual/string/replace-all';
import 'core-js/actual/string/trim-start';
import 'core-js/actual/string/trim-end';
import 'core-js/actual/string/at';
import 'core-js/actual/global-this';
import 'core-js/actual/queue-microtask';
import 'core-js/actual/structured-clone';
import { unzlibSync, gunzipSync, inflateSync } from 'fflate';

var g = window;

/* AbortController (Chromium 66). fetch() on these engines ignores the signal, so an abort only stops the app waiting:
   the app's own timers still reject on time. */
if (!g.AbortController) {
  var Sig = function () { this.aborted = false; this.reason = undefined; this.onabort = null; this._l = []; };
  Sig.prototype.addEventListener = function (t, fn) { if (t === 'abort') this._l.push(fn); };
  Sig.prototype.removeEventListener = function (t, fn) { this._l = this._l.filter(function (f) { return f !== fn; }); };
  Sig.prototype.throwIfAborted = function () { if (this.aborted) throw this.reason; };
  Sig.prototype._fire = function (r) {
    if (this.aborted) return;
    this.aborted = true; this.reason = r || new Error('Aborted');
    var ev = { type: 'abort', target: this };
    if (this.onabort) try { this.onabort(ev); } catch (e) {}
    this._l.slice().forEach(function (f) { try { f(ev); } catch (e) {} });
  };
  g.AbortController = function () { this.signal = new Sig(); };
  g.AbortController.prototype.abort = function (r) { this.signal._fire(r); };
  g.AbortSignal = Sig;
  /* make fetch reject when its signal aborts, like a real abort */
  var f0 = g.fetch;
  if (f0) g.fetch = function (u, o) {
    var p = f0.apply(this, arguments), s = o && o.signal;
    if (!s || !s._fire) return p;
    if (s.aborted) return Promise.reject(s.reason);
    return new Promise(function (res, rej) { s.addEventListener('abort', function () { rej(s.reason); }); p.then(res, rej); });
  };
}

/* Blob.stream (Chromium 76) */
if (g.Blob && !Blob.prototype.stream) Blob.prototype.stream = function () { return new Response(this).body; };

/* DecompressionStream (Chromium 80), used to read Stremio's watched-episode lists and setup codes. Needs WritableStream
   (Chromium 59). CompressionStream is left out: without it the app makes uncompressed setup codes, which it can read. */
function zstream(fn) {
  return function (format) {
    var parts = [], done, fail, out = new Promise(function (a, b) { done = a; fail = b; });
    this.writable = new WritableStream({
      write: function (c) { parts.push(new Uint8Array(c)); },
      close: function () {
        var n = 0, i, o; for (i = 0; i < parts.length; i++) n += parts[i].length;
        var all = new Uint8Array(n); for (i = 0, o = 0; i < parts.length; i++) { all.set(parts[i], o); o += parts[i].length; }
        try { done(fn(format, all)); } catch (e) { fail(e); }
      },
      abort: function (e) { fail(e); }
    });
    this.readable = new ReadableStream({
      start: function (ctl) { out.then(function (b) { ctl.enqueue(b); ctl.close(); }, function (e) { ctl.error(e); }); }
    });
  };
}
if (!g.DecompressionStream && g.WritableStream) {
  g.DecompressionStream = zstream(function (f, b) { return f === 'gzip' ? gunzipSync(b) : f === 'deflate' ? unzlibSync(b) : inflateSync(b); });
}

/* Element helpers the app calls without checking */
var EP = Element.prototype;
if (!EP.toggleAttribute) EP.toggleAttribute = function (n, f) {
  var on = f === undefined ? !this.hasAttribute(n) : !!f;
  if (on) this.setAttribute(n, ''); else this.removeAttribute(n);
  return on;
};
if (!EP.replaceChildren) EP.replaceChildren = function () { while (this.firstChild) this.removeChild(this.firstChild); this.append.apply(this, arguments); };
if (!EP.getAnimations) EP.getAnimations = function () { return []; };
