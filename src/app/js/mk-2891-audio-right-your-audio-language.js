
/* 2.89.1 Your audio language plays.
   A release named for several languages ("ITA ENG", MULTi, Dual Audio) used to rank like a release in your language alone.
   Where this device cannot choose the track inside a file (Chrome, Edge, Firefox and Android browsers on a host that
   does not let MKCinema read the file, with no switchable stream from the debrid service), the browser simply plays the
   file's first track, which is often the dub. So:
   - Smart Play, resume, next episode and the "Best match" pick use a copy that names only your language (or no language)
     whenever one exists, and only fall back to a several-language copy when nothing else is there.
   - Moving on to another source after a failure tries those copies first too.
   - A several-language copy that started anyway, by itself, switches to a copy in your language once it is clear the
     track cannot be chosen here. A copy you picked by hand stays, and the Audio panel offers the switch.
   - The Audio panel never calls a track "original" and never sends anyone to another app. */
(() => {
  if (typeof AudioPref === 'undefined' || typeof engine === 'undefined' || typeof video === 'undefined') return;
  const want = () => { try { return window.MkAudioWant ? MkAudioWant() : ''; } catch (e) { return ''; } };
  const lang = (c) => { try { return langName(c); } catch (e) { return String(c); } };
  const log = (m) => { try { MKLog.add('info', `audio: ${m}`); } catch (e) { /* no log */ } };
  const names = (s) => { try { const r = AudioPref.langs(s); return { langs: r.langs, multi: !!(r.multi || r.langs.size > 1) }; } catch (e) { return { langs: new Set(), multi: false }; } };
  const film = (s) => !!(s && s._tel && !s._tel.isTrailer && !s.ytId && s._tel.kind !== 'yt');

  /* ---------- can this device choose the track inside this file? ---------- */
  const engHost = (u) => {
    try {
      const x = new URL(u), m = x.pathname.match(/\/(?:resolve|playback|stream|dl)\/([a-z][a-z-]{1,20})\//i), k = x.host + (m ? `/${m[1].toLowerCase()}` : '');
      const e = (JSON.parse(localStorage.getItem('mkc.engHosts') || '{}') || {})[k];
      return e && Date.now() - e.t < 7 * 864e5 ? e.v : '';
    } catch (e) { return ''; }
  };
  let nOk = null; // the app's own player answered the check (true / false), or not yet (null)
  try { if (typeof MkNative !== 'undefined' && MkNative.bridge()) MkNative.probe().then((v) => { nOk = !!v; }, () => { nOk = false; }); } catch (e) { nOk = false; }
  const nativeHere = () => {
    try {
      if (typeof MkNative === 'undefined' || CFG.nativePlayer === false || MkNative.bad || !MkNative.bridge()) return false;
      return MkNative.ok || nOk !== false;
    } catch (e) { return false; }
  };
  const canSwitch = (s) => {
    if ('audioTracks' in HTMLMediaElement.prototype) return true; // Safari, the Mac app
    if (nativeHere()) return true; // the Windows, Mac and Android apps' own player
    if (IS_TV && window.MKAndroid) return true; // the Android TV player starts in your language
    const u = String((s && (s._audioBase || s.url)) || '');
    if (/\.m3u8(\?|#|$)/i.test(u)) return true; // hls.js switches audio groups
    // MKCinema's engine reads this host and picks your track itself
    if (CFG.engine !== false && !IS_TV && window.MkEngine && MkEngine.ok && engHost(u) === 'ok') return true;
    return false;
  };
  /* a copy that may start in another language here: it names several languages (yours among them, or MULTi) and the
     track cannot be chosen on this device */
  const risky = (s) => {
    const w = want(); if (!w || !film(s)) return false;
    const n = names(s); if (!n.multi) return false;
    return !canSwitch(s);
  };
  /* a copy whose name says your language only, or no language at all (most English releases name none) */
  const safe = (s) => { const w = want(); if (!w || !film(s)) return true; const n = names(s); if (n.multi) return false; return !n.langs.size || (n.langs.size === 1 && n.langs.has(w)); };

  /* ---------- 1) the automatic pick ---------- */
  const pb = engine.pickBest.bind(engine);
  engine.pickBest = function (streams, opts) {
    let r = null;
    try {
      if (want() && Array.isArray(streams) && streams.some(risky)) {
        const keep = streams.filter((s) => !risky(s));
        const p = keep.length ? pb(keep, opts) : null;
        // a copy in your language that the debrid service has not cached is only a "downloading" notice: not worth it
        if (p && p._tel && p._tel.cached !== false) r = p;
      }
    } catch (e) { r = null; }
    if (!r) r = pb(streams, opts);
    if (r && typeof r === 'object') r._mkAuto = Date.now();
    return r;
  };
  /* ---------- 2) the next source after a failure ---------- */
  if (typeof Failover !== 'undefined' && typeof Failover.candidates === 'function') {
    const fc = Failover.candidates;
    Failover.candidates = function () {
      const list = fc.apply(this, arguments);
      if (!Array.isArray(list) || list.length < 2 || !want()) return list;
      try { return list.map((s, i) => [s, i, risky(s) ? 1 : 0]).sort((a, b) => a[2] - b[2] || a[1] - b[1]).map((x) => x[0]); } catch (e) { return list; }
    };
  }

  /* ---------- 3) the copy in your language for the one playing ---------- */
  const alt = (s) => {
    const ctx = P.ctx; if (!ctx || !Array.isArray(ctx.streams) || !want()) return null;
    let vis = []; try { vis = visibleStreams(ctx.streams); } catch (e) { vis = ctx.streams; }
    const tried = (typeof Failover !== 'undefined' && Failover.tried) || new Set();
    const list = vis.filter((x) => x !== s && film(x) && x._tel.webReady && x._tel.cached !== false && !x._tel.is3d && !risky(x) && !x._mkBadLang && !tried.has(x));
    if (!list.length) return null;
    const mine = list.filter(safe), pool = mine.length ? mine : list;
    try { return pb(pool, {}) || pool[0]; } catch (e) { return pool[0]; }
  };
  const go = (s, a, why) => {
    if (!a || P.stream !== s || $('#player').hidden) return false;
    const at = typeof pNow === 'function' ? pNow() : 0;
    s._mkBadLang = true; a._mkAudUser = !!why.hand;
    log(`${why.hand ? 'you asked for' : 'switching to'} a copy in ${lang(want())} (${why.text})`);
    try { $('#optMenu').hidden = true; $('#subMenu').hidden = true; } catch (e) { /* menus not built */ }
    try { toast(why.hand ? `Switching to ${lang(want())}…` : `Playing a copy in ${lang(want())}: the other copy has several languages and this browser can’t choose between them.`, 'info', 4200, 'audioright'); } catch (e) { /* no toast */ }
    P.force = true;
    playStream(P.ctx, a, { startAt: at > 5 ? at : undefined });
    return true;
  };

  /* ---------- 4) a several-language copy that started by itself ---------- */
  const userPicked = (s) => !!(s && (s._audio != null || s._audioTry || s._mkAudUser));
  video.addEventListener('playing', () => {
    const s = P.stream; if (!s || s._mkRightChk || !s._mkAuto || userPicked(s) || !risky(s)) return;
    if ((window.MkEngine && MkEngine.active) || (window.MkNative && MkNative.active)) return;
    s._mkRightChk = true;
    const t0 = Date.now();
    const wait = () => {
      if (P.stream !== s || userPicked(s) || $('#player').hidden) return;
      const st = typeof AudioLang !== 'undefined' ? AudioLang.info.get(s) : null;
      // your debrid service's own stream or your MKCinema server can switch the track: the 2.62.6 code does that
      if (st && st.state === 'ok') return;
      if (st && st.state === 'loading' && Date.now() - t0 < 30000) { setTimeout(wait, 600); return; }
      if (!st && Date.now() - t0 < 4000) { setTimeout(wait, 600); return; }
      const a = alt(s);
      if (a) go(s, a, { text: 'this browser plays the first track of that file' });
      else log(`no copy in ${lang(want())} only; this copy plays its first track`);
    };
    setTimeout(wait, 1500);
  });

  /* ---------- 5) what the Audio panel says when the track cannot be chosen ---------- */
  const androidWeb = () => /Android/i.test(navigator.userAgent) && !window.MKAndroid;
  window.MkAudioRight = {
    risky, safe, alt, canSwitch,
    html(s, kind) {
      const p = kind === 'al' ? 'al-note' : 'av-note', w = want(), a = w ? alt(s) : null, n = names(s);
      const has = [...n.langs].map(lang).filter((x, i, l) => x && l.indexOf(x) === i);
      // one sentence per line, so each one is translated whole
      const line = (t) => `<p class="${p}">${esc(t)}</p>`;
      const what = has.length > 1 ? line(`This copy has ${has.join(' and ')}.`) : '';
      const cant = line('This browser can only play the first track inside this copy, so its language can’t be changed here.');
      if (a) return `<button type="button" class="${kind === 'al' ? 'al-row' : ''}" data-mkalt><i data-lucide="languages"></i>${esc(`Switch to ${lang(w)}`)}</button>${what}${cant}${line(`Another copy in ${lang(w)} plays from the same moment.`)}`;
      return `${what}${cant}${w ? line(`No other copy in ${lang(w)} was found.`) : ''}${androidWeb() ? line('The MKCinema Android app chooses the language inside the file.') : ''}`;
    },
  };
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-mkalt]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const s = P.stream, a = s && alt(s);
    if (!a) { try { toast(`No copy in ${lang(want())} was found`, 'info', 3000); } catch (x) { /* no toast */ } return; }
    s._mkAudUser = true; go(s, a, { hand: true, text: 'picked in the Audio panel' });
  }, true);
})();
