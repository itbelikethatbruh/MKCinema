/* ---------------- 2.27.0 Subtitle auto-sync ----------------
   When an add-on subtitle (or a file from the device) is turned on, MKCinema lines it up with the film by itself.
   1. Reference: the film's own subtitle track. An MKV's subtitle index (read in 2.16 without downloading the file)
      holds the start and length of every line inside it, in any language, so it shows exactly when people speak in
      this release. Text tracks the browser reports (MP4 files) are used the same way.
   2. Speech: when the browser can already hear the film (Night Mode, Boost or Listen on phone made the audio readable),
      MKCinema notes when people speak for a minute or two and lines the subtitle up with that.
   The match covers a shift of up to two minutes and the common frame-rate mix-ups (23.976, 24 and 25 fps).
   Only a clear winner is applied; otherwise nothing changes. A remembered manual timing always wins, Undo puts the
   old timing back, and the 2.20 timeline stays for fine tuning. Settings › Subtitles › Auto-sync subtitles turns it off. */
const SubSync = {
  tok: 0, last: null, busy: false, listenT: 0,
  enabled() { return CFG.subAutoSync !== false; },
  fmt(v) { return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} s`; },
  /* interval helpers: sorted, merged [start, end] lists in seconds */
  merge(list) {
    const a = list.filter((x) => isFinite(x[0]) && isFinite(x[1]) && x[1] > x[0]).sort((x, y) => x[0] - y[0]), out = [];
    for (const x of a) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]]); }
    return out;
  },
  total(a) { let s = 0; for (const x of a) s += x[1] - x[0]; return s; },
  /* time shared by A (scaled by k, then shifted by off) and B; both merged and sorted */
  overlap(A, B, k, off) {
    let i = 0, j = 0, sum = 0;
    while (i < A.length && j < B.length) {
      const as = A[i][0] * k + off, ae = A[i][1] * k + off, bs = B[j][0], be = B[j][1];
      const lo = as > bs ? as : bs, hi = ae < be ? ae : be; if (hi > lo) sum += hi - lo;
      if (ae < be) i++; else j++;
    }
    return sum;
  },
  /* the shift (and frame-rate factor) where the subtitle best covers the reference. Jaccard score, so a long line
     sitting over silence costs as much as it gains. clip: only count subtitle time inside these spans (speech mode). */
  async align(sub, ref, { range = 120, scales = [1], clip = null } = {}) {
    const R = this.total(ref); if (!R) return null;
    let best = null; const all = [];
    for (const k of scales) {
      const scores = [];
      for (let n = 0, off = -range; off <= range + 1e-9; off += 0.1, n++) {
        if (n % 400 === 399) await sleep(0); // stays responsive on slow TVs
        const inter = this.overlap(sub, ref, k, off), size = clip ? this.overlap(sub, clip, k, off) : this.total(sub) * k;
        const j = inter / Math.max(1e-6, size + R - inter); scores.push([off, j]);
        if (!best || j > best.j) best = { k, off, j };
      }
      for (const x of scores) all.push([k, x[0], x[1]]);
    }
    if (!best || best.j <= 0) return null;
    // fine tuning in 10 ms steps around the winner
    for (let off = best.off - 0.1; off <= best.off + 0.1 + 1e-9; off += 0.01) {
      const inter = this.overlap(sub, ref, best.k, off), size = clip ? this.overlap(sub, clip, best.k, off) : this.total(sub) * best.k;
      const j = inter / Math.max(1e-6, size + R - inter); if (j > best.j) best = { k: best.k, off, j };
    }
    // how clear the winner is: against the average of every other shift, and against the best one well away from it
    const js = all.map((x) => x[2]), mean = js.reduce((a, b) => a + b, 0) / js.length;
    const sd = Math.sqrt(js.reduce((a, b) => a + (b - mean) * (b - mean), 0) / js.length) || 1e-6;
    const rival = all.filter((x) => Math.abs(x[1] - best.off) > 3).reduce((m, x) => Math.max(m, x[2]), 0);
    const here = this.overlap(sub, ref, 1, 0), j0 = here / Math.max(1e-6, (clip ? this.overlap(sub, clip, 1, 0) : this.total(sub)) + R - here);
    return { off: Math.round(best.off * 1000) / 1000, k: best.k, j: best.j, z: (best.j - mean) / sd, rival, j0 };
  },
  /* the add-on subtitle's own line times, before any delay */
  parse(vtt) {
    const out = [], re = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/g; let m;
    const t = (h, mi, s, ms) => (Number(h) || 0) * 3600 + Number(mi) * 60 + Number(s) + Number(ms) / 1000;
    while ((m = re.exec(vtt))) out.push([t(m[1], m[2], m[3], m[4]), t(m[5], m[6], m[7], m[8])]);
    return out;
  },
  async subTimes(s) {
    const tr = activeTrack();
    if (tr && tr._mkc !== undefined && tr.cues && tr.cues.length) return Array.from(tr.cues).map((c) => [c._o != null ? c._o : c._s != null ? c._s : c.startTime, c._oe != null ? c._oe : c._e != null ? c._e : c.endTime]);
    let text = s.text;
    if (text == null && s.url) { try { const r = await fetch(s.url); if (r.ok) text = await r.text(); } catch (e) { /* host blocks it */ } }
    return text ? this.parse(StremioEngine.toVtt(text, s.fileName || s.url || '')) : [];
  },
  /* the film's own subtitle timing: MKV index first, then text tracks the browser exposes */
  async reference(stream, waitMs) {
    const until = Date.now() + waitMs;
    for (;;) {
      if (P.stream !== stream) return null;
      const f = MkvSubs.file;
      if (f && f.stream === stream) {
        let best = null, bn = 0;
        for (const t of f.tracks.filter((x) => x.sub && !x.forced)) { const n = f.cues.filter((c) => c.track === t.num).length; if (n > bn) { bn = n; best = t; } }
        if (best && bn >= 40) {
          const cs = f.cues.filter((c) => c.track === best.num).sort((a, b) => a.t - b.t);
          return { how: 'file', list: cs.map((c, i) => [c.t, c.t + (c.d > 0 ? c.d : Math.min(3, ((cs[i + 1] && cs[i + 1].t) || c.t + 3) - c.t))]) };
        }
      }
      for (const t of Array.from(video.textTracks).filter((x) => !x._mkc).slice(0, 3)) {
        if (t._mkc || !(t.kind === 'subtitles' || t.kind === 'captions')) continue;
        const was = t.mode; if (was === 'disabled') t.mode = 'hidden';
        if (!t.cues || t.cues.length < 40) await sleep(1200);
        const list = t.cues && t.cues.length >= 40 ? Array.from(t.cues).map((c) => [c.startTime, c.endTime]) : null;
        if (was === 'disabled') t.mode = 'disabled';
        if (list) return { how: 'file', list };
      }
      if (Date.now() > until || !MkvSubs.isMkv(stream)) return null;
      await sleep(600);
    }
  },
  /* puts a result on screen: frame-rate factor on the cues themselves (plain text tracks only), shift as the delay */
  apply(k, off) {
    P.subScale = k;
    const tr = activeTrack();
    if (tr && tr.cues) for (const c of tr.cues) {
      if (c._o == null) { c._o = c._s != null ? c._s : c.startTime - (P.subDelay || 0); c._oe = c._e != null ? c._e : c.endTime - (P.subDelay || 0); }
      c._s = c._o * k; c._e = c._oe * k;
    }
    setSubDelay(off, true);
  },
  async run(i, { auto = false } = {}) {
    const s = P.subs && P.subs[i], stream = P.stream;
    if (!s || !(s.kind === 'url' || s.kind === 'file') || !stream || this.busy) return;
    if (auto && (!this.enabled() || P.subDelay)) return; // a timing remembered for this file wins
    const tok = ++this.tok; this.busy = true; renderSubMenu();
    const same = () => tok === this.tok && P.stream === stream && P.curSub === i;
    try {
      if (!auto) toast('Lining up the subtitles…', 'info', 2400, 'subsync');
      const ref = await this.reference(stream, auto ? 20000 : 8000);
      if (!same()) return;
      const sub = this.merge(await this.subTimes(s));
      if (!same()) return;
      if (sub.length < 20) { if (!auto) toast('These subtitles have too few lines to line up automatically', 'err', 4200, 'subsync'); return; }
      const ass = AssR.on && AssR.on(); // styled subtitles take a shift, not a frame-rate factor
      if (ref) {
        const r = await this.align(sub, this.merge(ref.list), { range: 120, scales: ass ? [1] : [1, 23.976 / 25, 25 / 23.976, 24 / 25, 25 / 24, 23.976 / 24, 24 / 23.976] });
        if (!same()) return;
        this.decide(i, r, 'file', auto, 5);
        return;
      }
      if (DSP.attached || (!auto && DSP.clean() && DSP.attach())) { this.listen(i, sub, tok, auto); return; }
      if (!auto) toast('This film has no subtitles inside it to compare with, and this source doesn’t let the browser hear it. Use Sync on a timeline instead.', 'err', 7000, 'subsync');
    } catch (e) { MKLog.add('info', `Subtitle auto-sync: ${e.message}`); }
    finally { if (tok === this.tok && !this.listening) { this.busy = false; renderSubMenu(); } }
  },
  decide(i, r, how, auto, minZ) {
    MKLog.add('info', `Subtitle auto-sync (${how}): ${r ? `shift ${r.off}s, rate ${r.k.toFixed(4)}, match ${(r.j * 100).toFixed(0)}% (was ${(r.j0 * 100).toFixed(0)}%), z ${r.z.toFixed(1)}, rival ${(r.rival * 100).toFixed(0)}%` : 'no match'}`);
    const clear = r && r.z >= minZ && r.j >= (how === 'speech' ? 0.2 : 0.25) && r.j >= r.rival * 1.15 && r.j > r.j0 + 0.02;
    if (!clear) {
      if (r && Math.abs(r.off) < 0.15 && r.k === 1 && r.j0 >= 0.25) { if (!auto) toast('These subtitles already match the film', 'ok', 3000, 'subsync'); return; }
      if (!auto) toast('Couldn’t find a sure match, so the timing was left as it was. Sync on a timeline can fix it by hand.', 'err', 6000, 'subsync');
      return;
    }
    const prev = { d: P.subDelay || 0, k: P.subScale || 1 };
    this.apply(r.k, r.off);
    this.last = { i, stream: P.stream, off: r.off, k: r.k, prev };
    const rate = r.k !== 1 ? ` and speed (${r.k > 1 ? 'slower' : 'faster'} frame rate)` : '';
    toast(`Subtitles lined up with the ${how === 'file' ? 'film' : 'dialogue'}: ${this.fmt(r.off)}${rate}`, 'ok', 3600, 'subsync');
    renderSubMenu();
  },
  undo() {
    const l = this.last; if (!l) return;
    this.last = null; this.apply(l.prev.k, l.prev.d); renderSubMenu(); toast('Subtitle timing put back', 'info', 2200, 'subsync');
  },
  /* speech mode: note when people speak (energy in the voice band against the room tone), then line up.
     Checks after 1, 1.5, 2 and 2.5 minutes of film heard; the first clear answer wins. */
  listen(i, sub, tok, auto) {
    const n = DSP.n, an = n && n.an; if (!an) { this.busy = false; return; }
    const bins = new Float32Array(an.frequencyBinCount), hz = DSP.ctx.sampleRate / an.fftSize;
    const lo = Math.max(1, Math.round(250 / hz)), hi = Math.round(3500 / hz);
    const frames = [], hist = []; let last = -1, next = 60, aligning = false;
    this.listening = true; renderSubMenu();
    if (!auto) toast('Listening to the dialogue to line up the subtitles. Keep the film playing for a minute.', 'info', 5000, 'subsync');
    const stop = () => { clearInterval(this.listenT); this.listenT = 0; this.listening = false; this.busy = false; renderSubMenu(); };
    const started = Date.now();
    clearInterval(this.listenT);
    this.listenT = setInterval(async () => {
      if (tok !== this.tok || P.curSub !== i || $('#player').hidden || Date.now() - started > 15 * 60000) { if (tok === this.tok) stop(); return; }
      if (aligning || video.paused || video.seeking || video.muted) return;
      const t = pNow(); if (Math.abs(t - last) > 1) frames.push(null); last = t; // a jump starts a new span
      an.getFloatFrequencyData(bins);
      let band = 0, all = 0; for (let b = 1; b < bins.length; b++) { const p = Math.pow(10, bins[b] / 10); all += p; if (b >= lo && b <= hi) band += p; }
      if (!(all > 0)) return;
      const db = 10 * Math.log10(band + 1e-12); hist.push(db); if (hist.length > 400) hist.shift();
      const floor = hist.slice().sort((a, b) => a - b)[Math.floor(hist.length * 0.2)];
      frames.push([t, hist.length > 40 && db > floor + 9 && band / all > 0.45]);
      const heard = (frames.length - frames.filter((f) => !f).length) * 0.05;
      if (heard < next) return;
      next += 30; aligning = true;
      const spans = [], speech = []; let sp = null, on = null;
      for (const f of frames) {
        if (!f) { sp = null; on = null; continue; }
        const ft = f[0];
        if (sp && ft - sp[1] < 0.3) sp[1] = ft + 0.05; else spans.push(sp = [ft, ft + 0.05]);
        if (f[1]) { if (on && ft - on[1] < 0.2) on[1] = ft + 0.05; else speech.push(on = [ft, ft + 0.05]); } else on = null;
      }
      const S = this.merge(speech.filter((x) => x[1] - x[0] >= 0.2)), U = this.merge(spans);
      const near = U.length ? sub.filter((x) => x[1] > U[0][0] - 60 && x[0] < U[U.length - 1][1] + 60) : [];
      let r = null;
      if (near.length >= 12 && this.total(S) >= 15) r = await this.align(near, S, { range: 60, scales: [1], clip: U });
      aligning = false;
      if (tok !== this.tok || P.curSub !== i) return;
      const sure = r && r.z >= 6 && r.j >= 0.2 && r.j >= r.rival * 1.2 && r.j > r.j0 + 0.02;
      if (sure || next > 150) { stop(); if (r) this.decide(i, r, 'speech', auto, 6); else if (!auto) toast('Not enough dialogue heard to line up the subtitles', 'err', 4200, 'subsync'); }
    }, 50);
  },
  reset() { this.tok++; clearInterval(this.listenT); this.listenT = 0; this.listening = false; this.busy = false; P.subScale = 1; },
};
{
  // run after an add-on or device subtitle comes on
  const sel = selectSub;
  selectSub = async function (i, opts = {}) {
    SubSync.reset(); if (SubSync.last && SubSync.last.i !== i) SubSync.last = null;
    const r = await sel.apply(this, arguments);
    const s = i >= 0 && P.subs ? P.subs[i] : null;
    if (s && (s.kind === 'url' || s.kind === 'file') && P.curSub === i) setTimeout(() => { if (P.curSub === i) SubSync.run(i, { auto: true }); }, 1500);
    return r;
  };
  const td = teardown;
  teardown = function () { SubSync.reset(); SubSync.last = null; return td.apply(this, arguments); };
  // Tools in the subtitle menu
  const rsm = renderSubMenu;
  renderSubMenu = function () {
    rsm.apply(this, arguments);
    const m = $('#subMenu'); if (!m || P.curSub < 0) return;
    const s = P.subs[P.curSub]; if (!s || !(s.kind === 'url' || s.kind === 'file')) return;
    const l = SubSync.last && SubSync.last.i === P.curSub && SubSync.last.stream === P.stream ? SubSync.last : null;
    const tools = $$('h5', m).find((h) => (window.i18nEn ? i18nEn(h) : h.textContent) === 'Tools');
    const html = `<button type="button" data-subauto${SubSync.busy ? ' disabled' : ''}><i data-lucide="wand-sparkles"></i>${SubSync.busy ? (SubSync.listening ? 'Auto-sync: listening…' : 'Auto-sync: working…') : 'Auto-sync now'}</button>${l ? `<button type="button" data-subundo><i data-lucide="undo-2"></i>Undo auto-sync</button>` : ''}`;
    if (tools) tools.insertAdjacentHTML('afterend', html); else m.insertAdjacentHTML('beforeend', `<h5>Tools</h5>${html}`);
    const a = $('[data-subauto]', m); if (a) a.onclick = () => { m.hidden = true; SubSync.run(P.curSub, { auto: false }); };
    const u = $('[data-subundo]', m); if (u) u.onclick = () => { m.hidden = true; SubSync.undo(); };
    icons();
  };
  // the timeline panel gets the same button
  const os = SubTools.openSync.bind(SubTools);
  SubTools.openSync = function () {
    os();
    const b = $('#subSync .ss-btns'); if (!b || $('#ssAuto')) return;
    b.insertAdjacentHTML('afterbegin', '<button type="button" class="chip" id="ssAuto"><i data-lucide="wand-sparkles"></i>Auto</button>');
    $('#ssAuto').onclick = () => SubSync.run(P.curSub, { auto: false }); icons();
  };
  const sec = SECTIONS.find((x) => x.id === 'subtitles');
  if (sec) {
    const rows = sec.rows;
    sec.rows = () => { const r = rows(); const at = r.findIndex((x) => x.key === 'subLang'); r.splice(at < 0 ? r.length : at + 1, 0, { key: 'subAutoSync', label: 'Auto-sync subtitles', help: 'Lines up downloaded subtitles with the film by itself, using the subtitles inside the file or, when the browser can hear the film, the dialogue. A timing you set by hand always wins.', type: 'toggle', get: () => CFG.subAutoSync !== false }); return r; };
  }
}
