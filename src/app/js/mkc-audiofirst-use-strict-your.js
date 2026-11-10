
'use strict';
/* ---------------- 2.62.6 Your audio language plays first ----------------
   The language you pick (Settings > Source rules > Preferred audio language, else Settings > Audio language) used to rank
   and filter sources by their names only; which track played inside a file with several was up to the player.
   Now, wherever the device lets MKCinema choose, that language is the one that starts:
   - MKCinema's engine (MKV everywhere but TVs, MP4 whose name says it has several languages): picks the track itself
     (engine/mkv-engine.js defAudio uses MkAudioMatch below).
   - Streams with several audio tracks (hls.js) and players that expose video.audioTracks (Safari, the Mac app): switched
     as soon as the tracks are known.
   - Chrome, Edge and Android WebView playing a file directly (the engine couldn't read the host): only TorBox's own stream
     and your MKCinema server can switch tracks there, so for a release whose name says it has several languages the
     file's tracks are read once (AudioLang.probe) and the right one is loaded. Elsewhere nothing changes (the Audio menu
     says to use VLC).
   - The Android TV player gets the same language (ExoPlayer's preferred audio language).
   A language picked by hand in the Audio menu always wins.

   ---------------- Not web-ready sources ----------------
   Stremio addons mark links "notWebReady" when a plain browser <video> might not play them (MKV, HEVC, Dolby sound).
   MKCinema used to drop those from Smart Play, failover and "next source" and stop at a "Try in browser" screen. With
   the engine, the codec checks (BrowserPlay, device fit), the sourcing check and failover, the flag alone no longer
   decides: an http(s) link with no special headers is treated as web-ready, ranked a little lower than a link the addon
   says is web-ready, and judged by what this device can actually play. */
(() => {
  if (typeof Telemetry === 'undefined' || typeof AudioPref === 'undefined' || typeof video === 'undefined') return;
  const log = (m) => { try { MKLog.add('info', m); } catch (e) { /* no log */ } };
  /* ---------- language codes: en / eng / en-US / fra / fre all compare equal ---------- */
  const ISO = { en: 'eng', es: 'spa', fr: 'fre', fra: 'fre', de: 'ger', deu: 'ger', it: 'ita', pt: 'por', pob: 'por', ru: 'rus', ja: 'jpn',
    ko: 'kor', zh: 'chi', zho: 'chi', ar: 'ara', hi: 'hin', nl: 'dut', nld: 'dut', pl: 'pol', tr: 'tur', ta: 'tam', te: 'tel', sv: 'swe',
    no: 'nor', nb: 'nor', nob: 'nor', da: 'dan', fi: 'fin', el: 'gre', ell: 'gre', he: 'heb', cs: 'cze', ces: 'cze', hu: 'hun', ro: 'rum',
    ron: 'rum', vi: 'vie', th: 'tha', id: 'ind', uk: 'ukr', bg: 'bul', hr: 'hrv', sr: 'srp', ml: 'mal', kn: 'kan', bn: 'ben', mr: 'mar',
    english: 'eng', spanish: 'spa', french: 'fre', german: 'ger', italian: 'ita', portuguese: 'por', russian: 'rus', japanese: 'jpn',
    korean: 'kor', chinese: 'chi', arabic: 'ara', hindi: 'hin', tamil: 'tam', telugu: 'tel' };
  const code = (l) => { const x = String(l || '').toLowerCase().trim().split(/[-_\s]/)[0]; return ISO[x] || x; };
  const want = () => {
    const a = CFG.srAudio, b = CFG.audioOnly;
    const w = a && a !== 'any' ? a : b && b !== 'any' ? b : '';
    return w ? code(w) : '';
  };
  // does this track (language tag, track name) carry language w? A track with no real language tag (none, und, or a
  // made-up one like "sp") counts only when its name says so.
  const KNOWN = new Set([...Object.values(ISO), ...Object.keys(typeof LANGS === 'object' && LANGS ? LANGS : {}).map(code)]);
  const match = (lang, name, w) => {
    if (!w) return false;
    const c = code(lang);
    if (c && KNOWN.has(c)) return c === w;
    const n = String(name || '').toLowerCase();
    return AudioPref.WORD.some(([re, l]) => l === w && re.test(n));
  };
  // a release whose name says it carries several languages (MULTi, Dual Audio, or two named languages)
  const multi = (s) => { try { const r = AudioPref.langs(s); return !!(r.multi || r.langs.size > 1); } catch (e) { return false; } };
  window.MkAudioWant = want; window.MkAudioMatch = match; window.MkAudioMulti = (s) => !!want() && multi(s);

  /* ---------- the Audio menu keeps each track's language, so the right one can be found ---------- */
  if (typeof AudioLang !== 'undefined') {
    const tr = AudioLang.tracks.bind(AudioLang);
    AudioLang.tracks = function (list) {
      const out = tr(list), raw = Array.isArray(list) ? list : [];
      out.forEach((o, n) => {
        const t = raw[n];
        if (typeof t === 'string') o.lang = t;
        else if (t && typeof t === 'object') { const g = t.tags || {}; o.lang = t.language || t.lang || t.language_code || g.language || ''; o.name = t.title || t.name || t.label || g.title || ''; }
      });
      return out;
    };
  }

  const userPicked = (s) => !!(s && (s._audio != null || s._audioTry || s._mkAudUser));
  const done = (s, label) => { s._mkAud = true; log(`audio: ${label} (your audio language)`); try { toast(`Audio: ${label}`, 'info', 2200, 'audiofirst'); } catch (e) { /* no toast */ } };

  /* ---------- hls.js streams with several audio tracks ---------- */
  const hlsPick = (h, s) => {
    const w = want(); if (!w || !h || !s || s._mkAud || userPicked(s) || P.hls !== h || P.stream !== s) return;
    const list = h.audioTracks || []; if (list.length < 2) return;
    const cur = list[h.audioTrack];
    if (cur && match(cur.lang, cur.name, w)) { s._mkAud = true; return; }
    const i = list.findIndex((t) => match(t.lang, t.name, w)); if (i < 0) { s._mkAud = true; return; }
    h.audioTrack = i; done(s, list[i].name || langName(list[i].lang));
  };
  const lu = loadUrl;
  loadUrl = function (stream) {
    const r = lu.apply(this, arguments);
    const h = P.hls;
    if (h && !h._mkAud && window.Hls && Hls.Events) {
      h._mkAud = true;
      const go = () => hlsPick(h, stream);
      h.on(Hls.Events.AUDIO_TRACKS_UPDATED, go); h.on(Hls.Events.MANIFEST_PARSED, go);
    }
    return r;
  };

  /* ---------- players that expose video.audioTracks (Safari, the Mac app) ---------- */
  video.addEventListener('loadedmetadata', () => {
    const s = P.stream, w = want(), at = video.audioTracks;
    if (!w || !s || P.hls || s._mkAud || userPicked(s) || !at || at.length < 2) return;
    if (window.MkEngine && MkEngine.active) return; // the engine already picked
    let on = -1; for (let k = 0; k < at.length; k++) if (at[k].enabled) { on = k; break; }
    if (on >= 0 && match(at[on].language, at[on].label, w)) { s._mkAud = true; return; }
    let i = -1; for (let k = 0; k < at.length; k++) if (match(at[k].language, at[k].label, w)) { i = k; break; }
    s._mkAud = true; if (i < 0) return;
    for (let k = 0; k < at.length; k++) at[k].enabled = k === i;
    done(s, at[i].label || langName(at[i].language));
  });
  // a pick in the player's own audio list counts as yours
  document.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('[data-audio],[data-alang]') && P.stream) P.stream._mkAudUser = true; }, true);

  /* ---------- Chrome, Edge, Android WebView playing the file directly ---------- */
  video.addEventListener('playing', () => {
    const s = P.stream, w = want();
    if (!w || !s || s._mkAud || s._mkAudProbe || userPicked(s) || P.hls || s._local || !s.url || typeof AudioLang === 'undefined') return;
    if ('audioTracks' in HTMLMediaElement.prototype) return; // handled above
    if (window.MkEngine && MkEngine.active) return;
    if (!multi(s)) return; // only releases that say they have several languages: no lookups for ordinary films
    s._mkAudProbe = true;
    setTimeout(async () => {
      if (P.stream !== s || userPicked(s)) return;
      let st; try { st = await AudioLang.probe(s); } catch (e) { return; }
      if (P.stream !== s || userPicked(s) || !st || st.state !== 'ok' || !st.tracks || st.tracks.length < 2) return;
      const cur = st.tracks.find((t) => t.i === st.cur);
      if (cur && match(cur.lang, cur.name, w)) { s._mkAud = true; return; }
      const t = st.tracks.find((x) => match(x.lang, x.name, w)); if (!t) { s._mkAud = true; return; }
      s._mkAud = true; log(`audio: switching to ${t.label} (your audio language) via ${st.via}`);
      AudioLang.pick(t.i);
    }, 1200);
  });

  /* ---------- not web-ready sources ---------- */
  const parse = Telemetry.parse.bind(Telemetry);
  Telemetry.parse = function (s) {
    const bh = s && s.behaviorHints;
    if (bh && bh.notWebReady === true && !bh.proxyHeaders && /^https?:\/\//i.test(s.url || '')) {
      s.behaviorHints = Object.assign({}, bh, { notWebReady: false }); s._nwr = true;
    }
    const t = parse(s);
    if (s && s._nwr && t && !t._nwrDone) { t.nwr = true; t._nwrDone = true; t.score -= 100; }
    return t;
  };
})();
