/* 2.93.7 iPhone fast start (thread "Speed up finding a source on iPhone", 2026-11-23).
   Safari on iPhone/iPad (and Mac Safari) only. Before: the background source checks were switched off on Safari, so a
   copy that could never play there (an MKV on a host that doesn't let the page read it) was tried with the full
   10-25 s start limit, one copy after another, and the same blocked host was tried again for every copy on it.
   Now: 1) the top copies are checked side by side before the first start (MKV: the engine reads the file's header;
   MP4: a 2-byte read; HLS: the playlist), the first good one in ranking order starts; 2) an MKV the engine can't take
   moves on at once instead of waiting for Safari's own player, which can't open MKV; 3) copies on a host already known
   to block the page are left out while another copy exists; 4) checks go on in the background while a film plays, so
   a switch lands on a checked copy; 5) the start limit is shorter only when a checked-good copy is waiting.
   Nothing here relaxes the audio-language rules: copies come from pickBest/Failover.candidates (AudioPref filter) and a
   checked file whose tagged tracks are all in another language counts as bad. Never relays the video. */
(() => {
  const go = () => {
    if (window.MkIosFast || typeof playStream !== 'function' || typeof Failover === 'undefined' || typeof Preflight === 'undefined') return;
    const WK = !!(window.MKSafari && MKSafari.on);
    if (!WK) return;
    const E = window.MkEngine && MkEngine.ok ? MkEngine : null;
    const log = (m) => { try { MKLog.add('info', `fast start: ${m}`); } catch (e) { /* no log */ } };
    const desc = (s) => { try { return MKLog.describe(s); } catch (e) { return 'a source'; } };
    const nativeMkv = (() => { try { return !!video.canPlayType('video/x-matroska'); } catch (e) { return false; } })();
    const isMkv = (s) => !!s && (!!(s._tel && s._tel.mkv) || /\.mkv(\?|#|$)/i.test(s.url || '') || /\.mkv$/i.test((s.behaviorHints && s.behaviorHints.filename) || ''));
    const isHls = (s) => /\.m3u8(\?|#|$)/i.test((s && s.url) || '');
    const engWants = (s) => { try { return !!E && E.wants(s); } catch (e) { return false; } };
    // same key the engine uses for hosts that refuse page reads (mkc.engHosts, 7 days)
    const hostKey = (u) => { try { const x = new URL(u), m = x.pathname.match(/\/(?:resolve|playback|stream|dl)\/([a-z][a-z-]{1,20})\//i); return x.host + (m ? `/${m[1].toLowerCase()}` : ''); } catch (e) { return ''; } };
    const hostState = (u) => { try { const e = (JSON.parse(localStorage.getItem('mkc.engHosts') || '{}') || {})[hostKey(u)]; return e && Date.now() - e.t < 7 * 864e5 ? e.v : ''; } catch (e) { return ''; } };
    // an MKV Safari can't open itself and the engine can't read here: it can never start on this device
    const never = (s) => !!s && !nativeMkv && isMkv(s) && !s._local && !(window.MKSafari && MKSafari.forced && MKSafari.forced.has(s)) &&
      (!!(s._tel && s._tel._wkBad) || !!s._engNo || !!s._engBlocked || CFG.engine === false || !E || (!!s.url && hostState(s.url) === 'blocked'));

    const F = { tok: 0, N: 6, MAX: 12, CAP: 5000, res: new WeakMap(), TTL: 10 * 6e4, never };
    window.MkIosFast = F;

    /* ---------- checks (no hidden <video>: iOS won't preload one, and it takes the decoder) ---------- */
    const fetchCheck = async (u) => {
      try {
        const r = await fetchT(u, { headers: { Range: 'bytes=0-1' }, cache: 'no-store', credentials: 'omit' }, 4000);
        try { r.body && r.body.cancel(); } catch (e) { /* done */ }
        if (r.ok || r.status === 206) return ['ok', ''];
        return [r.status === 404 || r.status === 410 || r.status === 403 || r.status >= 500 ? 'bad' : 'unknown', `HTTP ${r.status}`];
      } catch (e) { return ['unknown', 'host does not allow a check']; }
    };
    const langBad = (info) => {
      const want = window.MkAudioWant ? MkAudioWant() : '';
      if (!want || !info || !Array.isArray(info.audio) || !info.audio.length || !window.MkAudioMatch) return false;
      const tagged = info.audio.filter((a) => a && !a.enc && a.lang && !/^(und|unk|mis|zxx|mul)$/i.test(a.lang));
      return tagged.length > 0 && tagged.length === info.audio.filter((a) => a && !a.enc).length && !tagged.some((a) => MkAudioMatch(a.lang, a.name, want));
    };
    /* a host that answers a plain request but refuses page reads is remembered the way the engine does it (7 days), so
       the next film skips its MKV copies at once. A failed plain request (network down) remembers nothing. */
    const blockedSeen = new Set();
    const noteBlocked = (u) => {
      const k = hostKey(u); if (!k || blockedSeen.has(k) || hostState(u)) return; blockedSeen.add(k);
      const c = new AbortController(), t = setTimeout(() => c.abort(), 4000);
      fetch(u, { mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: c.signal }).then(() => {
        try { const m = JSON.parse(localStorage.getItem('mkc.engHosts') || '{}') || {}; m[k] = { v: 'blocked', t: Date.now() }; localStorage.setItem('mkc.engHosts', JSON.stringify(m)); } catch (e) { /* private mode */ }
        log(`${k} doesn’t let the page read its files; its MKV copies are skipped on this device`);
      }, () => blockedSeen.delete(k)).finally(() => { clearTimeout(t); c.abort(); });
    };
    const engCheck = (s) => new Promise((res) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; clearTimeout(t); res(v); } };
      const t = setTimeout(() => fin(['slow', 'no answer in time']), 5500);
      E.peek(s).then((info) => {
        if (!info) {
          // couldn't read the header: a host that refuses page reads (Safari's own player can't open MKV either)
          fetchCheck(Preflight.src(s) || s.url).then(([st, why]) => fin(st === 'bad' ? ['bad', why] : st === 'ok' || nativeMkv || !isMkv(s) ? ['slow', 'could not read the file'] : (noteBlocked(s.url), ['bad', 'the host doesn’t let the page read this file'])));
          return;
        }
        let r = null; const dv = E.dv; // route() notes Dolby Vision on the engine: keep the playing film's value
        try { r = E.route(info, false); } catch (e) { r = null; } finally { E.dv = dv; }
        if (!r) return fin(['unknown', '']);
        if (!r.go && !r.native) return fin(['bad', r.why || 'this device can’t decode it']);
        if (r.go && r.mode === 'none') return fin(['bad', 'sound this device cannot play']);
        if (isFinite(info.duration) && info.duration > 0 && info.duration < 100) return fin(['bad', 'short notice clip']);
        if (langBad(info)) return fin(['bad', 'not in your audio language']);
        fin(['ok', '']);
      }, () => fin(['unknown', '']));
    });
    F.probe = (s) => {
      const c = F.res.get(s);
      if (c && c.p) return c.p;
      if (c && Date.now() - c.at < F.TTL) return Promise.resolve(c.st);
      const u = Preflight.src(s);
      const t0 = performance.now();
      let p;
      if (!u) p = Promise.resolve(['unknown', 'cannot be checked without side effects']);
      else if (isHls(s)) p = Preflight.hls(u);
      else if (isMkv(s) && never(s)) p = Promise.resolve(['bad', 'Safari can’t open this MKV and the host blocks the engine']);
      else if (engWants(s) && !(s.behaviorHints && s.behaviorHints.proxyHeaders)) p = engCheck(s);
      else p = fetchCheck(u);
      const ent = { st: 'checking', at: Date.now(), p: null };
      F.res.set(s, ent);
      ent.p = p.then(([st, why]) => {
        if (F.res.get(s) === ent) { ent.st = st; ent.at = Date.now(); ent.p = null; ent.why = why; }
        try { if (st === 'ok') Preflight.mark(s, 'ok'); else if (st === 'bad') Preflight.mark(s, 'bad', why); } catch (e) { /* ignore */ }
        log(`${desc(s)}: ${st}${why ? ` (${why})` : ''} in ${Math.round(performance.now() - t0)} ms`);
        return st;
      }, () => { ent.st = 'unknown'; ent.p = null; return 'unknown'; });
      return ent.p;
    };
    const state = (s) => { const c = F.res.get(s); return c && !c.p && Date.now() - c.at < F.TTL ? c.st : (c && c.p ? 'checking' : ''); };

    /* ---------- ranking: copies that can never start here go last / are skipped ---------- */
    if (typeof engine !== 'undefined' && engine && typeof engine.pickBest === 'function') {
      const pb = engine.pickBest.bind(engine);
      engine.pickBest = function (streams, opts) {
        if (!Array.isArray(streams)) return pb(streams, opts);
        const keep = streams.filter((s) => !never(s) && !Preflight.bad(s));
        if (keep.length && keep.length < streams.length) { const n = pb(keep, opts); if (n && !(n._tel && n._tel.cached === false)) return n; }
        return pb(streams, opts);
      };
    }
    const cand = Failover.candidates.bind(Failover);
    Failover.candidates = function (failed) { return cand(failed).filter((s) => !never(s)); };

    /* ---------- an MKV the engine couldn't take: Safari can't open it, so move on now ---------- */
    if (E && typeof E.start === 'function') {
      const st = E.start.bind(E);
      E.start = async function (s, at, base, force) {
        const took = await st(s, at, base, force);
        if (!took && !force && !nativeMkv && isMkv(s) && s._tel && !(MKSafari.forced && MKSafari.forced.has(s))) {
          s._tel._wkBad = 'mkv';
          try { Preflight.mark(s, 'bad', 'the engine could not take it'); } catch (e) { /* ignore */ }
          log(`${desc(s)}: engine could not take it, moving on`);
        }
        return took;
      };
    }

    /* ---------- shorter start limit only when a checked-good copy is waiting ---------- */
    const arm = MKSafari.arm.bind(MKSafari);
    MKSafari.arm = function (s) {
      arm(s);
      // the link check says the link is dead (404, 410, 5xx): don't wait for the start limit
      if (CFG.failover && !s._local && !s._handoff && !s._audioTry && !s._cloud && s.url && /^https?:/i.test(s.url)) {
        F.probe(s).then((st) => {
          if (st === 'bad' && P.stream === s && !$('#player').hidden && video.readyState < 1 && $('#pMsg').hidden) { clearTimeout(Failover.t); Failover.next(s, `the link did not answer (${(F.res.get(s) || {}).why || 'bad'})`, P.startAt || 0); }
        });
      }
      let backup = null;
      try { backup = Failover.candidates(s).find((c) => Preflight.good(c)); } catch (e) { backup = null; }
      if (!backup || !CFG.failover || s._local || s._handoff || s._audioTry || s._cloud) return;
      clearTimeout(Failover.t);
      const t0 = performance.now();
      const chk = () => {
        if (P.stream !== s || $('#player').hidden || video.readyState >= 1 || !$('#pMsg').hidden) return;
        const now = performance.now();
        if (now - t0 < 12000 && MKSafari.lastProg && now - MKSafari.lastProg < 2500) { Failover.t = setTimeout(chk, 2000); return; }
        Failover.next(s, `did not start within ${Math.round((now - t0) / 1000)} s`, P.startAt || 0);
      };
      Failover.t = setTimeout(chk, 6000);
    };

    /* ---------- "Sourcing a working copy" line under the title art (same element and text as 2.62.5) ---------- */
    const line = (on) => {
      const L = $('#pLoad'); if (!L) return;
      let el = L.querySelector('.mk-src');
      if (!el) { if (!on) return; el = document.createElement('div'); el.className = 'mk-src'; el.setAttribute('role', 'status'); el.innerHTML = '<i></i><span></span>'; L.appendChild(el); }
      if (on) el.querySelector('span').textContent = 'Sourcing a working copy…';
      requestAnimationFrame(() => el.classList.toggle('on', !!on));
    };

    /* ---------- background checks of the next copies while a film starts/plays ---------- */
    F.scout = (s) => {
      const ctx = P.ctx; if (!ctx) return;
      let list = [];
      try { list = Failover.candidates(s).filter((c) => c !== s && !Preflight.bad(c) && !state(c)).slice(0, 3); } catch (e) { list = []; }
      list.forEach((c, i) => setTimeout(() => { if (P.ctx === ctx && !$('#player').hidden) F.probe(c); }, 600 + i * 150));
    };

    /* ---------- the first start: check the top copies side by side, start the first good one ---------- */
    const key = (c) => (c && c.meta ? (c.video ? c.video.id : c.meta.id) : '');
    const autoPick = (ctx, s) => {
      try { const all = ctx.streams || [], g = s.behaviorHints && s.behaviorHints.bingeGroup; return pickBest(all) === s || (!!g && pickBest(all, { bingeGroup: g }) === s); } catch (e) { return false; }
    };
    const wants = (ctx, s) => {
      if (!ctx || !s || !s.url || s._local || s._handoff || s.ytId || P.force || CFG.failover === false || !ctx.streams || ctx.streams.length < 2) return false;
      if (window.MkNative && MkNative.ready && MkNative.ready()) return false;
      const t = s._tel || (s._tel = Telemetry.parse(s));
      if (t.kind === 'ext' || t.kind === 'p2p' || t.isTrailer) return false;
      try { if (extPlayer() && handoffUrl(s)) return false; } catch (e) { /* none */ }
      if (window.MkSourcing && Date.now() < (MkSourcing.hopUntil || 0)) return false; // a switch after a failure: candidates are already sorted by checks
      return ($('#player').hidden || key(ctx) !== key(P.ctx)) && autoPick(ctx, s);
    };
    F.choose = (ctx, first, alive) => {
      const seen = new Set([first]);
      let rest = [];
      const keep = P.ctx; P.ctx = ctx;
      try { Failover.tried = new Set(); Failover.hops = 0; Failover.key = ''; rest = Failover.candidates(first); } catch (e) { rest = []; } finally { P.ctx = keep; }
      const list = [first, ...rest.filter((c) => !seen.has(c) && seen.add(c))].filter((c) => c.url && !c._local && !c.ytId).slice(0, F.MAX);
      // a top pick Safari plays by itself (MP4, HLS) or one already known good starts at once; its link is checked
      // alongside (a dead link moves on as soon as that's known) and the next copies are checked as backups
      const fast = Preflight.good(first) || state(first) === 'ok' || (!isMkv(first) && !engWants(first)) || (isMkv(first) && first.url && hostState(first.url) === 'ok' && !never(first));
      if (fast) { list.slice(0, F.N).forEach((c) => F.probe(c)); return Promise.resolve(first); }
      return new Promise((resolve) => {
        let done = false, next = 0;
        // keep F.N checks running; a copy found bad makes room for the next one in the ranking
        const pump = () => { while (!done && next < list.length && list.slice(0, next).filter((c) => state(c) === 'checking').length < F.N) { const c = list[next++]; F.probe(c).then(() => { pick(false); pump(); }); } };
        const pick = (final) => {
          if (done) return;
          if (!alive()) { done = true; return resolve(null); }
          for (let i = 0; i < list.length; i++) {
            const st = i < next ? state(list[i]) : '';
            if (st === 'ok' || st === 'unknown') { done = true; return resolve(list[i]); }
            if (st !== 'bad' && st !== 'slow' && !final) return;
          }
          done = true;
          resolve(list.find((c) => { const st = state(c); return st === 'slow' || st === 'checking'; }) || null);
        };
        pump();
        setTimeout(() => pick(true), F.CAP);
      });
    };
    const ps = playStream;
    playStream = async function (ctx, s, opts) {
      if (!wants(ctx, s)) {
        const r = await ps.apply(this, arguments);
        try { if (s && P.stream === s && !$('#player').hidden && !s.ytId && !s._local) F.scout(s); } catch (e) { /* ignore */ }
        return r;
      }
      const tok = ++F.tok, alive = () => tok === F.tok && !$('#player').hidden;
      if ($('#player').hidden) openLayer('player'); else { try { video.pause(); } catch (e) { /* ignore */ } }
      try { $('#pTitle').textContent = ctx.meta.name || ''; $('#pSub').textContent = ''; Loader.show(ctx.meta); } catch (e) { /* ignore */ }
      const t0 = performance.now();
      const lt = setTimeout(() => { if (tok === F.tok && alive()) line(true); }, 400);
      let pick = s;
      try { pick = await F.choose(ctx, s, alive); } catch (e) { pick = s; }
      clearTimeout(lt);
      if (tok !== F.tok || $('#player').hidden) return;
      if (!pick) {
        // every checked copy is known not to play here: let the normal flow explain it
        pick = s;
      }
      if (pick !== s) log(`started ${desc(pick)} instead of the first pick (checked in ${Math.round(performance.now() - t0)} ms)`);
      const r = await ps.call(this, ctx, pick, opts);
      try { if (P.stream === pick && !$('#player').hidden) F.scout(pick); } catch (e) { /* ignore */ }
      return r;
    };
    if (typeof closePlayer === 'function') { const cp = closePlayer; closePlayer = function () { F.tok++; return cp.apply(this, arguments); }; }
    log('on');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
})();