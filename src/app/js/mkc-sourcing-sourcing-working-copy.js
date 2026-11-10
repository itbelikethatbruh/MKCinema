
'use strict';
/* ---------------- 2.62.5 Sourcing a working copy ----------------
   1) The clock. The time shown while a film loads is where the film starts (0:00, or the resume point), never what the
      last source had reached. A switch to another copy starts at the place the film was asked to start unless the
      copy that failed had really played (2.5 s in a row), and a position is only saved after real playback.
   2) Sourcing. When Play / Smart Play picks a copy on its own, the best few copies are checked first, behind the
      title's logo with "Sourcing a working copy…": the picture must show and, where the browser can tell, the sound
      must decode (a muted second of playback on a hidden player). The first copy that passes plays. A copy that fails
      is never shown as an error; only when every copy fails does the usual "None of the sources would start" appear.
      Links that can't be opened without side effects (an uncached debrid link) are not touched.
   3) Switching in the middle stays quiet: the "That source … Trying the next best one" toasts are replaced by the same
      sourcing line, and a copy that turns out to have no sound moves to a checked copy instead of showing the bar.
   Stays on this device. A source picked by hand always plays as picked. */
(() => {
  if (typeof playStream !== 'function' || typeof Failover === 'undefined' || typeof Preflight === 'undefined' || typeof Loader === 'undefined') return;
  const NOTE = 'Sourcing a working copy…';
  const keyOf = (c) => (c && c.meta ? (c.video ? c.video.id : c.meta.id) : '');
  const Sx = { tok: 0, res: new WeakMap(), hopUntil: 0, busy: false, TTL: 10 * 60e3, N: 5, POOL: 2, CAP: 9000 };
  window.MkSourcing = Sx;
  const fmt = (t) => (typeof fmtTime === 'function' ? fmtTime(t) : String(Math.floor(t)));

  /* ---------- 1) real playback, the clock, saved positions ---------- */
  P.mkReal = false; P.mkWant = 0;
  let t0 = -1;
  video.addEventListener('playing', () => { if (t0 < 0) t0 = pNow(); });
  video.addEventListener('timeupdate', () => {
    if (P.mkReal || t0 < 0 || video.paused) return;
    const d = pNow() - t0; if (d >= 2.5 && d < 40) P.mkReal = true;
  });
  const setClock = (at, d0) => {
    const a = $('#pxCur'), b = $('#pxEnd'), c = $('#pTime');
    if (a) a.textContent = fmt(at || 0);
    if (b && b.textContent !== fmt(d0 || 0)) b.textContent = fmt(d0 || 0);
    if (c) c.textContent = d0 > 0 ? `${fmt(at || 0)} / ${fmt(d0)}` : fmt(at || 0);
  };
  if (typeof saveProgress === 'function') {
    const sp = saveProgress;
    saveProgress = function () { if (!P.mkReal && !(P.stream && P.stream._local)) return undefined; return sp.apply(this, arguments); };
  }

  /* ---------- the sourcing line on the loading screen ---------- */
  const note = (on, text) => {
    const el = $('#pLoad'); if (!el) return;
    let n = el.querySelector('.mk-src');
    if (!n) { if (!on) return; n = document.createElement('div'); n.className = 'mk-src'; n.setAttribute('role', 'status'); n.innerHTML = '<i></i><span></span>'; el.appendChild(n); }
    if (on) n.querySelector('span').textContent = text || NOTE;
    requestAnimationFrame(() => n.classList.toggle('on', !!on));
  };
  const lh = Loader.hide;
  Loader.hide = function () { const r = lh.apply(this, arguments); setTimeout(() => { if (!Loader.on && !Sx.busy) note(false); }, 380); return r; };
  video.addEventListener('playing', () => { if (!Sx.busy) note(false); });

  /* ---------- 3) quiet switching ---------- */
  const t = toast;
  toast = function (msg, kind, ms, key) {
    if (key === 'failover' && !$('#player').hidden) { try { Loader.show(P.ctx && P.ctx.meta); } catch (e) { /* none */ } note(true); return undefined; }
    return t.apply(this, arguments);
  };
  const fnext = Failover.next;
  Failover.next = function (failed, reason, at) {
    // a copy that never really played says nothing about where the film is: the next one starts where the film was asked to
    if (!(P.mkReal && P.stream === failed)) at = P.mkWant || 0;
    else if (at == null) at = pNow();
    Sx.hopUntil = Date.now() + 14000;
    const r = fnext.call(this, failed, reason, at);
    if (!r) Sx.hopUntil = 0;
    return r;
  };
  if (typeof Rescue !== 'undefined' && Rescue.found) {
    const rf = Rescue.found;
    Rescue.found = async function (stream) {
      try {
        // no converter on this device: a checked copy that has sound beats showing the "No sound?" bar
        if (CFG.failover && !(await this.caps())) {
          const alt = Failover.candidates(stream).find((x) => Sx.ok(x));
          if (alt && Failover.next(stream, 'no sound', pNow())) return undefined;
        }
      } catch (e) { /* the bar below still helps */ }
      return rf.apply(this, arguments);
    };
  }

  /* ---------- 2) checking copies before one plays ---------- */
  const engineWants = (s) => { try { return typeof MkEngine !== 'undefined' && MkEngine.ok && MkEngine.wants(s); } catch (e) { return false; } };
  Sx.ok = (s) => { const r = Sx.res.get(s); return !!r && r.st === 'ok' && Date.now() - r.at < Sx.TTL; };
  const weak = (s) => {
    const bh = s.behaviorHints || {}, T = [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' ').toLowerCase();
    return /truehd|\bdts|atmos|e-?ac-?3|\bddp|\bac-?3\b|dd[\s.]?5[\s.]?1/.test(T) && !engineWants(s) && !(BrowserPlay.can('audio/mp4; codecs="ec-3"') && !/truehd|\bdts/.test(T)) && !BrowserPlay.rescue();
  };
  const peek = async (url) => {
    try {
      const r = await fetchT(url, { headers: { Range: 'bytes=0-1' }, cache: 'no-store' }, 6000);
      try { r.body && r.body.cancel(); } catch (e) { /* closed */ }
      return r.ok || r.status === 206;
    } catch (e) { return false; }
  };
  // a hidden player opens the copy, shows a picture, and plays a muted moment so the sound decoder has to run
  const media = (url) => new Promise((res) => {
    const v = document.createElement('video');
    let done = false, poll = 0;
    const end = (st, why) => {
      if (done) return; done = true; clearTimeout(tm); clearInterval(poll);
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* gone */ }
      res([st, why || '']);
    };
    const tm = setTimeout(() => end('slow', 'no answer in time'), 8500);
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.setAttribute('playsinline', '');
    v.addEventListener('error', () => end('bad', (v.error && ({ 1: 'aborted', 2: 'network error', 3: 'decode error', 4: 'format not supported or blocked' })[v.error.code]) || 'error'));
    v.addEventListener('loadedmetadata', () => {
      const d = v.duration;
      if (isFinite(d) && d > 0 && d < 100) return end('bad', 'short notice clip');
      if (!v.videoWidth && !v.videoHeight) return end('bad', 'no picture this device can show');
      const wk = 'webkitAudioDecodedByteCount' in v, mz = 'mozHasAudio' in v;
      if (!wk && !mz) return end('ok');
      v.play().catch(() => {});
      let n = 0;
      poll = setInterval(() => {
        n++;
        if (wk) {
          if (v.webkitAudioDecodedByteCount > 0) return end('ok');
          if (v.currentTime > 1.2 && v.webkitVideoDecodedByteCount > 0) return end('bad', 'sound this device cannot play');
        } else if (v.readyState >= 2 && v.currentTime > 0.5) return end(v.mozHasAudio ? 'ok' : 'bad', 'sound this device cannot play');
        if (n >= 30) end('ok', 'could not tell'); // never hold the film back on a guess
      }, 150);
    });
    v.src = url;
    try { v.load(); } catch (e) { end('bad', 'could not open'); }
  });
  Sx.probe = (s) => {
    const prev = Sx.res.get(s);
    if (prev && prev.st !== 'checking' && Date.now() - prev.at < Sx.TTL) return Promise.resolve(prev.st);
    if (prev && prev.p) return prev.p;
    const url = Preflight.src(s);
    let p;
    if (!url) p = Promise.resolve(['unknown', 'cannot be checked without side effects']);
    else if (/\.m3u8(\?|$)/i.test(s.url)) p = Preflight.hls(url);
    else if (engineWants(s)) {
      // the MKCinema engine converts what the browser can't, if it can read the file
      p = media(url).then(async ([st, why]) => (st === 'bad' ? ((await peek(url)) ? ['unknown', 'the engine can take it'] : ['bad', `${why}; the engine can't read this host`]) : [st, why]));
    } else p = media(url);
    const rec = { st: 'checking', at: Date.now(), p };
    Sx.res.set(s, rec);
    const t1 = performance.now();
    return p.then(([st, why]) => {
      if (Sx.res.get(s) === rec) { rec.st = st; rec.at = Date.now(); rec.why = why; rec.p = null; }
      try { if (st === 'ok') Preflight.mark(s, 'ok'); else if (st === 'bad') Preflight.mark(s, 'bad', why); } catch (e) { /* no memory */ }
      try { MKLog.add('info', `sourcing ${MKLog.describe(s)}: ${st}${why ? ` (${why})` : ''} in ${Math.round(performance.now() - t1)} ms`); } catch (e) { /* no log */ }
      return st;
    });
  };
  const isAuto = (ctx, s) => {
    try {
      const all = ctx.streams || [], bg = s.behaviorHints && s.behaviorHints.bingeGroup;
      return pickBest(all) === s || (!!bg && pickBest(all, { bingeGroup: bg }) === s);
    } catch (e) { return false; }
  };
  const wants = (ctx, s, hop) => {
    if (hop || !ctx || !s || !s.url || s._local || s._handoff || s.ytId || P.force || CFG.failover === false) return false;
    if (!ctx.streams || ctx.streams.length < 2) return false;
    if (!Preflight.on() || !Preflight.canProbe()) return false;
    const tl = s._tel || (s._tel = Telemetry.parse(s));
    if (tl.kind === 'ext' || tl.kind === 'p2p' || tl.isTrailer) return false;
    if (tl.kind !== 'ext' && tl.kind !== 'p2p' && extPlayer() && handoffUrl(s)) return false;   // goes to the outside player
    if (typeof PipMode !== 'undefined' && PipMode.native && PipMode.native()) return false;
    const fresh = $('#player').hidden || keyOf(ctx) !== keyOf(P.ctx);
    return fresh && isAuto(ctx, s);
  };
  Sx.wants = wants;
  // test hook: the same ranking and checks, no UI
  Sx.choose = async function (ctx, first, live) {
    Failover.tried = new Set(); Failover.hops = 0; Failover.key = '';
    const seen = new Set([first]);
    // Failover ranks the sources of the title that is open; this one is not open yet
    let rest = []; const keep = P.ctx; P.ctx = ctx;
    try { rest = Failover.candidates(first); } catch (e) { rest = []; } finally { P.ctx = keep; }
    const list = [first, ...rest.filter((x) => !seen.has(x) && seen.add(x))].filter((x) => x.url && !x._local && !x.ytId).slice(0, Sx.N);
    if (Sx.ok(first)) return first;
    const st = list.map((x) => { const r = Sx.res.get(x); return r && r.st !== 'checking' && Date.now() - r.at < Sx.TTL ? r.st : 'checking'; });
    return new Promise((resolve) => {
      let over = false, i = 0;
      const decide = (final) => {
        if (over) return;
        if (!live()) { over = true; return resolve(null); }
        let unk = null, wk = null, slow = null;
        for (let k = 0; k < list.length; k++) {
          if (st[k] === 'ok') { over = true; return resolve(list[k]); }
          if (st[k] === 'checking' && !final) return;
          if (st[k] === 'unknown') { if (weak(list[k])) wk = wk || list[k]; else unk = unk || list[k]; }
          if (st[k] === 'slow' || st[k] === 'checking') slow = slow || list[k];
        }
        over = true; resolve(unk || wk || slow || first);
      };
      const run = async () => {
        while (i < list.length && !over) {
          const k = i++; if (st[k] !== 'checking') continue;
          st[k] = await Sx.probe(list[k]); decide(false);
        }
      };
      decide(false);
      if (!over) { for (let n = 0; n < Sx.POOL; n++) run(); setTimeout(() => decide(true), Sx.CAP); }
    });
  };

  const ps = playStream;
  playStream = async function (ctx, stream, opts) {
    opts = Object.assign({}, opts);
    const hop = Date.now() < Sx.hopUntil; Sx.hopUntil = 0;
    const key = keyOf(ctx);
    if (opts.startAt == null) { const pr = CFG.resume && S.progress[key]; opts.startAt = pr && pr.t > 20 && pr.t < pr.d * 0.95 ? pr.t : 0; }
    if (!hop) P.mkWant = opts.startAt || 0;
    P.mkReal = false; t0 = -1;
    const pr = S.progress[key];
    setClock(opts.startAt, pr && pr.d);
    if (!wants(ctx, stream, hop)) { if (hop) note(true); return ps.call(this, ctx, stream, opts); }
    const tok = ++Sx.tok, live = () => tok === Sx.tok && !$('#player').hidden;
    // show the player and the loading screen first; the sourcing line says what is happening
    if ($('#player').hidden) openLayer('player'); else { try { video.pause(); } catch (e) { /* none */ } }
    try { $('#pTitle').textContent = ctx.meta.name || ''; $('#pSub').textContent = ''; Loader.show(ctx.meta); } catch (e) { /* the player still opens */ }
    Sx.busy = true; setTimeout(() => { if (tok === Sx.tok && Sx.busy && live()) note(true); }, 350);
    let pick = stream;
    try { pick = (await Sx.choose(ctx, stream, live)) || null; } catch (e) { pick = stream; }
    if (tok === Sx.tok) Sx.busy = false;
    if (!pick || tok !== Sx.tok || $('#player').hidden) return undefined;
    if (pick !== stream) try { MKLog.add('info', 'sourcing: started a checked copy instead of the first pick'); } catch (e) { /* no log */ }
    return ps.call(this, ctx, pick, opts);
  };
  if (typeof closePlayer === 'function') {
    const cp = closePlayer;
    closePlayer = function () { Sx.tok++; Sx.busy = false; note(false); return cp.apply(this, arguments); };
  }
})();
