
/* ---------------- 2.46 Checked sources ----------------
   While a source starts, MKCinema quietly checks the next few in the background, several at once: each one is opened
   just far enough to read its header (no playback, no sound). A source counts as working when the browser can open it,
   it has a picture, and it is longer than a notice clip. If the playing source fails, the switch goes straight to one
   that is already known to work, instead of trying sources one by one. After three switches, or when nothing checks
   out, the player stops and says so plainly instead of looping. */
const Preflight = {
  K: IS_TV ? 2 : 3, POOL: IS_TV ? 1 : 2, T: 8000, MAX: 3,
  res: new WeakMap(), tok: 0, busy: 0,
  // Safari keeps its own rules (format filter, 10 s starts, its own messages), and iPhone Safari never loads a video
  // before the viewer presses play, so the checks run everywhere else
  WK: !IS_TV && (PLATFORM === 'ios' || (/Safari\//.test(navigator.userAgent) && /Apple/.test(navigator.vendor || '') && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|Android/.test(navigator.userAgent))),
  on() {
    if (CFG.failover === false || this.WK) return false;
    try { if (TvPlayer.on()) return false; } catch (e) { /* no TV player */ }
    return true;
  },
  canProbe() { return !this.WK; },
  state(s) { const r = s && this.res.get(s); return r ? r.st : ''; },
  good(s) { return this.state(s) === 'ok'; },
  bad(s) { return this.state(s) === 'bad'; },
  mark(s, st, why) { if (s && typeof s === 'object') this.res.set(s, { st, why: why || '', at: Date.now() }); },
  addonHost(s) {
    const a = (engine.addons || []).find((x) => x.manifest && x.manifest.id === s._addonId && !x.virtual);
    try { return !!a && new URL(s.url).host === new URL(a.baseUrl).host; } catch (e) { return false; }
  },
  // the link a check may open; '' means the source can't be checked without side effects
  src(s) {
    if (!s || !s.url || s._local || s._handoff || s.ytId || s.infoHash) return '';
    if (!/^https?:/i.test(s.url)) return '';
    // a link through the addon asks the debrid service for the file: only already-cached files, so nothing starts downloading
    if (this.addonHost(s) && !(s._tel && s._tel.cached === true)) return '';
    const bh = s.behaviorHints || {}, headers = bh.proxyHeaders && bh.proxyHeaders.request;
    if (bh.proxyHeaders && !S.proxy) return '';
    return (bh.proxyHeaders || CFG.alwaysProxy) ? proxify(s.url, headers || {}) : s.url;
  },
  probe(s) {
    const prev = this.res.get(s);
    if (prev && (prev.st === 'ok' || prev.st === 'bad') && Date.now() - prev.at < 10 * 60e3) return Promise.resolve(prev.st);
    if (prev && prev.p) return prev.p;
    const url = this.src(s);
    if (!url) return Promise.resolve('unknown');
    const t0 = performance.now();
    const p = /\.m3u8(\?|$)/i.test(s.url) ? this.hls(url) : this.media(url);
    const rec = { st: 'checking', at: Date.now(), p };
    this.res.set(s, rec);
    return p.then(([st, why]) => {
      if (this.res.get(s) === rec) this.mark(s, st, why);
      try { MKLog.add('info', `checked ${MKLog.describe(s)}: ${st}${why ? ` (${why})` : ''} in ${Math.round(performance.now() - t0)} ms`); } catch (e) { /* no log */ }
      return st;
    });
  },
  async hls(url) {
    try {
      const r = await fetchT(url, {}, this.T);
      if (!r.ok) return ['bad', `HTTP ${r.status}`];
      const txt = await r.text();
      return /#EXTM3U/.test(txt.slice(0, 2048)) ? ['ok', ''] : ['bad', 'not a playlist'];
    } catch (e) { return ['unknown', 'host does not allow a check']; }
  },
  media(url) {
    return new Promise((res) => {
      const v = document.createElement('video');
      let done = false;
      const end = (st, why) => {
        if (done) return; done = true; clearTimeout(t);
        // stop the download right away: only the header was needed
        try { v.removeAttribute('src'); v.load(); } catch (e) { /* gone */ }
        res([st, why]);
      };
      const t = setTimeout(() => end('slow', 'no answer in time'), this.T);
      v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.setAttribute('playsinline', '');
      v.addEventListener('loadedmetadata', () => {
        const d = v.duration;
        if (isFinite(d) && d > 0 && d < 100) end('bad', 'short notice clip');
        else if (!v.videoWidth && !v.videoHeight) end('bad', 'no picture this device can show');
        else end('ok', '');
      });
      v.addEventListener('error', () => end('bad', (v.error && ({ 1: 'aborted', 2: 'network error', 3: 'decode error', 4: 'format not supported or blocked' })[v.error.code]) || 'error'));
      v.src = url;
      try { v.load(); } catch (e) { end('bad', 'could not open'); }
    });
  },
  // the sources a switch could go to, best first: the same ranking automatic switching already uses
  queue(failed) { return Failover.candidates(failed).filter((s) => !this.bad(s)); },
  /* Check the next few sources in the background, a couple at a time, best ranked first */
  scout(stream) {
    if (!this.on() || !this.canProbe() || !P.ctx) return;
    const tok = ++this.tok, ctx = P.ctx;
    const list = this.queue(stream).filter((s) => s !== stream && this.src(s)).slice(0, this.K);
    if (!list.length) return;
    let i = 0;
    const live = () => tok === this.tok && P.ctx === ctx && !$('#player').hidden;
    const run = async () => { while (i < list.length && live()) { const s = list[i++]; await this.probe(s); } };
    // a short pause so the checks never slow the first seconds of the source that is starting
    setTimeout(() => { if (live()) for (let n = 0; n < this.POOL; n++) run(); }, 700);
  },
  /* Wait for the checks of the waiting list and return the best ranked source that works.
     A source that could not be checked counts only when nothing ranked above it was confirmed. */
  async pick(list, live) {
    const top = list.slice(0, this.K + 1);
    const ps = top.map((s) => this.probe(s));
    return new Promise((res) => {
      const st = top.map(() => 'checking');
      let over = false;
      const decide = (final) => {
        if (over) return;
        for (let i = 0; i < top.length; i++) {
          if (st[i] === 'ok') { over = true; return res(top[i]); }
          if (st[i] === 'unknown') { over = true; return res(top[i]); }
          if (st[i] === 'checking' && !final) return; // a better ranked one may still pass
        }
        if (final || st.every((x) => x !== 'checking')) {
          over = true;
          // nothing confirmed: a slow one still gets a chance, a broken one never does
          const slow = top.find((s, i) => st[i] === 'slow' || st[i] === 'checking');
          res(slow || null);
        }
      };
      ps.forEach((p, i) => p.then((v) => { st[i] = v; if (!live()) { over = true; return res(null); } decide(false); }));
      setTimeout(() => decide(true), this.T + 300);
    });
  },
  /* The plain ending when nothing plays: no endless loop */
  giveUp(stream, reason) {
    if (!P.ctx || $('#player').hidden) return;
    this.tok++; Loader.hide(); clearTimeout(Failover.t); clearTimeout(Failover.stallT);
    const ctx = P.ctx;
    teardown(); P.stream = stream;
    const n = Math.max(1, Failover.tried ? Failover.tried.size : 0);
    const checked = (ctx.streams || []).filter((s) => this.bad(s) && !(Failover.tried && Failover.tried.has(s))).length;
    try { MKLog.add('err', `no source played after ${n} tries, ${checked} more checked (${reason || 'unknown'})`); } catch (e) { /* no log */ }
    const what = ctx.meta.type === 'series' ? 'episode' : 'film';
    const body = `MKCinema tried ${n === 1 ? 'the best source' : `${n} sources`} for this ${what}${checked ? ` and checked ${checked} more in the background` : ''}. None of them would play on this device right now. Pick one from the list, or open it in VLC, which plays nearly every file.`;
    showMsg('None of the sources would start', body,
      `<button class="btn btn-prime" type="button" data-act="sources"><i data-lucide="layers"></i>Sources</button><button class="btn btn-ghost" type="button" id="pfRetry"><i data-lucide="refresh-cw"></i>Try again</button>${stream ? handoffHTML(stream) : ''}${vlcButtons()}`);
    const b = $('#pfRetry');
    if (b) b.addEventListener('click', () => {
      (ctx.streams || []).forEach((s) => this.res.delete(s));
      Failover.tried = new Set(); Failover.hops = 0; Failover.key = '';
      const s = pickBest(ctx.streams || []); if (s) playStream(ctx, s, { startAt: P.startAt || 0 });
    }, { once: true });
  },
  init() {
    // working sources first, broken ones never
    const cands = Failover.candidates.bind(Failover);
    Failover.candidates = function (failed) {
      const list = cands(failed).filter((s) => !Preflight.bad(s));
      return list.map((s, i) => [s, i]).sort((a, b) => (Preflight.good(b[0]) - Preflight.good(a[0])) || a[1] - b[1]).map((x) => x[0]);
    };
    const next = Failover.next.bind(Failover);
    Failover.next = function (failed, reason, at) {
      if (!Preflight.on() || !P.ctx) return next(failed, reason, at);
      if (Preflight.busy && P.stream === failed) return true; // a switch is already being chosen
      Preflight.mark(failed, 'bad', reason);
      this.tried.add(failed);
      if ((this.hops || 0) >= Preflight.MAX) { Preflight.giveUp(failed, reason); return true; }
      const list = this.candidates(failed);
      if (!list.length) {
        Preflight.giveUp(failed, reason); return true;
      }
      const startAt = at != null ? at : pNow(), ctx = P.ctx;
      this.hops = (this.hops || 0) + 1;
      const go = (n) => {
        Preflight.busy = 0;
        if (!n) { Preflight.giveUp(failed, reason); return; }
        toast(this.hops > 1 ? 'Switching to another source that works…' : 'That source didn’t start, so MKCinema is switching to one that works.', 'info', 3600, 'failover');
        playStream(ctx, n, { startAt });
      };
      if (Preflight.good(list[0]) || !Preflight.canProbe()) { go(list[0]); return true; }
      // nothing confirmed yet: finish the checks (they run at the same time) before switching
      const tok = ++Preflight.tok; Preflight.busy = 1;
      clearTimeout(this.t); clearTimeout(this.stallT);
      video.pause(); Loader.show(ctx.meta);
      Preflight.pick(list, () => tok === Preflight.tok && P.ctx === ctx && !$('#player').hidden).then((n) => {
        if (tok !== Preflight.tok || P.ctx !== ctx || $('#player').hidden) { Preflight.busy = 0; return; }
        go(n);
      });
      return true;
    };
    // every in-app start, picked automatically or by hand, scouts its backups
    const ps = playStream;
    playStream = async function (ctx, stream, opts) {
      Preflight.busy = 0;
      const r = await ps.apply(this, arguments);
      try { if (stream && P.stream === stream && !$('#player').hidden && !stream.ytId && !stream._local) Preflight.scout(stream); } catch (e) { /* the source plays without backups */ }
      return r;
    };
    // a file that opens with sound but no picture (a codec this device can't show) moves on when a working one is ready
    video.addEventListener('loadedmetadata', () => {
      const s = P.stream;
      if (!s || !Preflight.on() || P.remux || s._local || $('#player').hidden) return;
      if (video.videoWidth || video.videoHeight) { Preflight.mark(s, 'ok'); return; }
      setTimeout(() => {
        if (P.stream !== s || video.videoWidth || video.videoHeight || Rescue.active) return;
        const alt = Failover.candidates(s).find((x) => Preflight.good(x));
        if (alt) Failover.next(s, 'no picture this device can show', pNow());
      }, 1500);
    });
    const cp = closePlayer;
    closePlayer = function () { Preflight.tok++; Preflight.busy = 0; return cp.apply(this, arguments); };
  },
};
try { Preflight.init(); } catch (e) { try { MKLog.add('err', `checked sources off: ${e.message}`); } catch (x) { /* no log */ } }
