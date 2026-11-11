
'use strict';
/* ---------------- 2.61.3 Smart Play avoids bad links ----------------
   1) Release names that are rarely the real film rank lower: camera recordings, sample clips, archives (rar/zip/exe,
      never playable), whole discs, and files far too small for their stated quality.
   2) Link memory, kept only on this device: a link that failed (error, no picture, waiting clip, never started) is
      remembered for a day, and a file server whose links keep failing is remembered for half an hour. Smart Play and the
      automatic switch try those last, never first. A link or server that plays again is forgotten at once. Only short
      hashes are stored, never a link or a key, and nothing is sent anywhere.
   3) Early checks: when the pointer or focus reaches Smart Play (or a finger touches it), the two best sources are
      quietly checked (the same header-only check the background checks use, cached files only), so the pick can skip a
      broken one before anything starts.
   4) Faster switch: when a source has not started after 5 s, nothing is arriving, and a backup is already checked and
      working, MKCinema switches to it right away instead of waiting the full start time.
   The pick still never returns a trailer (it only reorders what the original rules choose from), the source list shows
   every source, and a source picked by hand always plays. */
const LinkHealth = {
  KEY: 'linkHealth', LINK_TTL: 24 * 3600e3, HOST_TTL: 30 * 60e3, MAXL: 400, MAXH: 120,
  d: null, seenFail: new WeakSet(), saveT: 0,
  load() {
    if (this.d) return this.d;
    let v = null; try { v = Store.raw.get(this.KEY, null); } catch (e) { v = null; }
    this.d = v && typeof v === 'object' && v.l && v.h ? v : { l: {}, h: {} };
    return this.d;
  },
  save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      const d = this.load(), now = Date.now();
      const trim = (o, ttl, max) => {
        const k = Object.keys(o).filter((x) => now - (o[x].t || 0) < ttl).sort((a, b) => o[b].t - o[a].t).slice(0, max);
        const out = {}; k.forEach((x) => { out[x] = o[x]; }); return out;
      };
      d.l = trim(d.l, this.LINK_TTL, this.MAXL); d.h = trim(d.h, this.HOST_TTL * 4, this.MAXH);
      try { Store.raw.set(this.KEY, d); } catch (e) { /* storage blocked: memory only */ }
    }, 400);
  },
  // FNV-1a: a short fingerprint, so no link (which can hold a debrid key) is ever stored
  hash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); },
  fp(s) {
    if (!s || s._local || s.ytId) return '';
    const bh = s.behaviorHints || {};
    let id = '';
    if (s.infoHash) id = `ih:${String(s.infoHash).toLowerCase()}:${s.fileIdx == null ? '' : s.fileIdx}`;
    else if (bh.filename) id = `fn:${bh.filename}|${bh.videoSize || ''}`;
    else if (s.url) { try { const u = new URL(s.url); id = `u:${u.host}${u.pathname}`; } catch (e) { id = `u:${s.url}`; } }
    if (!id) return '';
    return this.hash(`${s._addonId || ''}|${id}`);
  },
  // the server that hands out the file; a link through the addon itself has no file server to judge
  host(s) {
    if (!s || !s.url || s._local || s.ytId) return '';
    try { if (typeof Preflight !== 'undefined' && Preflight.addonHost(s)) return ''; } catch (e) { /* no checks */ }
    try { const u = new URL(s.url); return /^https?:$/.test(u.protocol) ? this.hash('h|' + u.host) : ''; } catch (e) { return ''; }
  },
  // codec or picture problems belong to the file on this device, not to the server
  serverish(why) { return /network|timed? ?out|did not start|slow|no answer|HTTP [45]\d\d|could not open|stalled|aborted/i.test(String(why || '')); },
  fail(s, why) {
    const d = this.load(), now = Date.now(), f = this.fp(s), h = this.host(s);
    if (f) { const r = d.l[f] || { n: 0 }; r.n += 1; r.t = now; d.l[f] = r; }
    if (h && this.serverish(why)) { const r = d.h[h] || { n: 0 }; if (r.ok && r.ok > (r.t || 0)) r.n = 0; r.n += 1; r.t = now; d.h[h] = r; }
    try { MKLog.add('info', `link memory: ${MKLog.describe(s)} failed (${why || 'unknown'})`); } catch (e) { /* no log */ }
    this.save();
  },
  ok(s, sure) {
    const d = this.load(), f = this.fp(s), h = this.host(s); let ch = false;
    if (f && d.l[f] && sure) { delete d.l[f]; ch = true; }
    if (h && d.h[h]) { d.h[h].n = 0; d.h[h].ok = Date.now(); ch = true; }
    if (ch) this.save();
  },
  linkDead(s) { const f = this.fp(s), r = f && this.load().l[f]; return !!(r && Date.now() - r.t < this.LINK_TTL); },
  hostDown(s) { const h = this.host(s), r = h && this.load().h[h]; return !!(r && r.n >= 2 && Date.now() - r.t < this.HOST_TTL); },
  // ranking change from what this device saw; 0 for a source it knows nothing about
  adjust(s) {
    let a = 0;
    try {
      if (typeof Preflight !== 'undefined') { if (Preflight.bad(s)) a -= 900; else if (Preflight.good(s)) a += 45; }
    } catch (e) { /* no checks */ }
    if (this.linkDead(s)) a -= 600;
    if (this.hostDown(s)) a -= 400;
    return a;
  },
  clear() { this.d = { l: {}, h: {} }; try { Store.raw.set(this.KEY, this.d); } catch (e) { /* storage blocked */ } },
};
window.MkLinkHealth = LinkHealth;
(() => {
  /* ---------- 1) release-name rules ---------- */
  if (typeof Telemetry !== 'undefined' && typeof Telemetry.parse === 'function') {
    const parse = Telemetry.parse.bind(Telemetry);
    Telemetry.parse = function (s) {
      const t = parse(s);
      try {
        if (!t || t.isTrailer || t.kind === 'yt' || (s && s._local)) return t;
        const bh = s.behaviorHints || {}, fn = String(bh.filename || '').toLowerCase();
        const T = [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' ').toLowerCase().replace(/[._]/g, ' ');
        let path = ''; try { path = new URL(s.url).pathname.toLowerCase(); } catch (e) { /* no link */ }
        const risk = [];
        if (/\.(rar|zip|7z|exe|msi|apk|scr|bat)\b/.test(fn) || /\.(rar|zip|7z|exe|msi|apk)$/.test(path)) { t.score -= 2000; risk.push('archive'); }
        else if (/\.(iso|img)\b/.test(fn) || /\.iso$/.test(path) || /\b(bdmv|full bd|bd25|bd50|complete bluray)\b/.test(T)) { t.score -= 300; risk.push('disc'); }
        if (/\bsample\b/.test(fn) || /(^|\/)sample[\/.]/.test(path)) { t.score -= 800; risk.push('sample'); }
        if (/\b(hd ?cam|cam ?rip|camrip|cam|hd ?ts|telesync|tele ?cine|hd ?tc|dvd ?scr|screener|hdrip ?cam)\b/.test(T) || /\bts\b(?! ?\d)/.test(T)) { t.score -= 120; risk.push('camera'); }
        const mb = (t.sizeBytes || 0) / 1048576;
        if (mb > 0 && ((t.res === '4K UHD' && mb < 400) || ((t.res === '1080p' || t.res === '1440p') && mb < 150) || (t.res === '720p' && mb < 60))) { t.score -= 250; risk.push('too small'); }
        if (risk.length) t.risk = risk;
      } catch (e) { /* keep the original result */ }
      return t;
    };
  }

  /* ---------- 2) the pick and the switch put what failed here last ---------- */
  const order = (list) => list.map((s, i) => [s, i, ((s && s._tel && s._tel.score) || 0) + LinkHealth.adjust(s)])
    .sort((a, b) => b[2] - a[2] || a[1] - b[1]).map((x) => x[0]);
  if (typeof engine !== 'undefined' && typeof engine.pickBest === 'function') {
    const pick = engine.pickBest;
    engine.pickBest = function (streams, opts) {
      // the original rules (bingeGroup, cached first, never a trailer) run on the reordered list
      let list = streams;
      try { if (Array.isArray(streams) && streams.length > 1) list = order(streams); } catch (e) { list = streams; }
      return pick.call(this, list, opts);
    };
  }
  if (typeof Failover !== 'undefined' && typeof Failover.candidates === 'function') {
    const cands = Failover.candidates;
    Failover.candidates = function () {
      const list = cands.apply(this, arguments);
      if (!Array.isArray(list) || list.length < 2) return list;
      try {
        // keep the order the earlier rules chose (same episode group, checked first), only move what failed here down
        const pen = (s) => (LinkHealth.linkDead(s) ? 2 : 0) + (LinkHealth.hostDown(s) ? 1 : 0);
        return list.map((s, i) => [s, i, pen(s)]).sort((a, b) => a[2] - b[2] || a[1] - b[1]).map((x) => x[0]);
      } catch (e) { return list; }
    };
  }

  /* ---------- link memory: what failed and what played ---------- */
  if (typeof Failover !== 'undefined' && typeof Failover.next === 'function') {
    const next = Failover.next;
    Failover.next = function (failed, reason) {
      try {
        if (failed && !LinkHealth.seenFail.has(failed) && !failed._local && !failed._handoff && !failed._audioTry) {
          LinkHealth.seenFail.add(failed); LinkHealth.fail(failed, reason);
        }
      } catch (e) { /* the switch goes on */ }
      return next.apply(this, arguments);
    };
  }
  if (typeof Preflight !== 'undefined' && typeof Preflight.mark === 'function') {
    const mark = Preflight.mark;
    Preflight.mark = function (s, st, why) {
      const r = mark.apply(this, arguments);
      try {
        if (s && typeof s === 'object' && !s._local) {
          if (st === 'ok') LinkHealth.ok(s, false);
          // a failed background check counts once, like a failed start
          else if (st === 'bad' && why && !LinkHealth.seenFail.has(s) && (!P.stream || P.stream !== s)) { LinkHealth.seenFail.add(s); LinkHealth.fail(s, why); }
        }
      } catch (e) { /* checks go on */ }
      return r;
    };
  }
  // a source that keeps playing for 8 s worked: forget anything bad about it and its server
  let okT = 0;
  video.addEventListener('playing', () => {
    clearTimeout(okT);
    const s = P.stream; if (!s || s._local || s.ytId) return;
    okT = setTimeout(() => { if (P.stream === s && !video.paused && video.readyState >= 3 && !$('#player').hidden) LinkHealth.ok(s, true); }, 8000);
  });

  /* ---------- 3) early checks when Smart Play is about to be pressed ---------- */
  const Early = {
    last: 0,
    run() {
      if (typeof Preflight === 'undefined' || !Preflight.on() || !Preflight.canProbe()) return;
      if (typeof D === 'undefined' || !D.meta || !Array.isArray(D.streams) || !D.streams.length) return;
      if (Date.now() - this.last < 4000) return; this.last = Date.now();
      try { if (typeof WebCap !== 'undefined' && !WebCap.on()) return; } catch (e) { /* no cap */ }
      if (typeof extPlayerId === 'function' && !IS_TV && extPlayerId() !== 'builtin') return; // VLC or another player opens it
      const list = order(visibleStreams(D.streams).filter((s) => s._tel && s._tel.webReady && !s._tel.isTrailer && !s.ytId && s._tel.cached !== false));
      list.filter((s) => Preflight.src(s) && !Preflight.state(s)).slice(0, IS_TV ? 1 : 2).forEach((s) => { try { Preflight.probe(s); } catch (e) { /* skip */ } });
    },
  };
  const near = (e) => { const b = e.target && e.target.closest && e.target.closest('#dSmart'); if (b) Early.run(); };
  ['pointerover', 'focusin', 'touchstart'].forEach((ev) => document.addEventListener(ev, near, { passive: true, capture: true }));
  window.MkEarly = Early;

  /* ---------- 4) switch sooner when a checked backup is ready ---------- */
  if (typeof playStream === 'function' && typeof Failover !== 'undefined') {
    let quickT = 0;
    const ps = playStream;
    playStream = async function (ctx, stream) {
      clearTimeout(quickT);
      const r = await ps.apply(this, arguments);
      try {
        if (!stream || stream._local || stream._handoff || stream._cloud || stream.ytId || !CFG.failover) return r;
        if (typeof Preflight === 'undefined' || !Preflight.on() || P.stream !== stream) return r;
        const t0 = performance.now();
        const look = () => {
          if (P.stream !== stream || $('#player').hidden || video.readyState >= 1 || !$('#pMsg').hidden || Rescue.active || Preflight.busy) return;
          const lp = (window.MkStart && MkStart.lastProg) || 0;
          if (lp && performance.now() - lp < 2000) { quickT = setTimeout(look, 1500); return; } // bytes are arriving
          const alt = Failover.candidates(stream).find((x) => Preflight.good(x));
          if (alt) Failover.next(stream, 'did not start within 5 s', P.startAt || 0);
          else if (performance.now() - t0 < 9000) quickT = setTimeout(look, 1500);
        };
        quickT = setTimeout(look, 5000);
      } catch (e) { /* the normal start timer still runs */ }
      return r;
    };
  }
})();
