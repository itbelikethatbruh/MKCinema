
'use strict';
/* =====================================================================
   MKCinema · player extras
   Title-logo loading pulse, Night Mode audio (Web Audio DSP), voice ducking, Skip Intro, the
   next-episode countdown, automatic source failover, audio rescue for MKV/EAC3/DTS files,
   subtitle sync + transcript, the X-Ray pause screen, scene bookmarks and Spoiler Guard.
   ===================================================================== */

/* ---------------- Loading: the title's logo pulses while the stream buffers (like Stremio) ----------------
   Desktop tilts it gently in 3D; phones and tablets get a flat pulse, since 3D layers glitch on Android Chrome. */
const Loader = {
  on: false,
  show(meta) {
    const el = $('#pLoad'), logo = meta && metaLogo(meta);
    $('#pLoadArt').innerHTML = logo ? imgTag(logo, meta.name, meta.id, { nofb: true, lazy: false }) + `<b data-logo-alt hidden>${esc(meta.name)}</b>` : `<b>${esc((meta && meta.name) || 'MKCinema')}</b>`;
    el.classList.toggle('flat', CFG.quality === 'low' || !!CFG.reduceMotion); el.hidden = false; this.on = true;
  },
  hide() { if (!this.on || this.hold) return; this.on = false; const el = $('#pLoad'); el.classList.add('out'); clearTimeout(this.t); this.t = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 320); },
  wait() { if (!this.on && !$('#player').hidden && $('#pMsg').hidden && P.ctx) { this.show(P.ctx.meta); $('#pLoad').classList.add('soft'); } },
};
video.addEventListener('playing', () => { Loader.hide(); $('#pLoad').classList.remove('soft'); });
video.addEventListener('canplay', () => { if (video.paused) Loader.hide(); });
// Mid-film buffering brings the logo back after a short grace period, so a brief hiccup does not flash it
video.addEventListener('waiting', () => { clearTimeout(Loader.wt); Loader.wt = setTimeout(() => { if (video.readyState < 3 && !video.paused) Loader.wait(); }, 700); });

/* ---------------- Night Mode: Web Audio DSP ----------------
   source → high-pass 80 Hz → presence EQ 2.2 kHz → compressor → make-up gain → Haas widener → duck gain → analyser → speakers.
   Browsers only hand audio to Web Audio when the media is CORS-clean, so a stream is checked first and, if its host
   refuses, routed through the MKCinema proxy. Once attached, the video element stays routed through the graph. */
// Night Mode presets are gone (2.25.1); the audio graph stays flat for Volume boost and Listen on phone
const DSP_PRESETS = {
  flat: { label: 'Cinema Flat', note: 'The original mix, untouched', icon: 'clapperboard', hp: 10, eq: 0, comp: null, makeup: 0, wide: false },
};
const DSP = {
  ctx: null, n: null, attached: false, raf: 0, probes: new Map(),
  wants() { return this.attached; },
  /* Is what the video element plays right now readable by Web Audio? */
  clean() {
    if (!P.stream) return false;
    if (P.hls || P.stream._local || P.remux) return true;
    return video.crossOrigin === 'anonymous' && video.readyState >= 1;
  },
  /* Decide how a direct (non-HLS) stream is loaded so its audio stays readable: 'direct' (host sends CORS), 'proxy' or 'none' */
  async prepare(stream) {
    stream._cors = null;
    if (!this.wants() || stream._local || !stream.url || /\.m3u8(\?|$)/i.test(stream.url) && (window.Hls ? Hls.isSupported() : !!window.MediaSource)) return;
    const bh = stream.behaviorHints || {};
    if (bh.proxyHeaders || CFG.alwaysProxy) { stream._cors = 'proxy'; return; }
    let host = ''; try { host = new URL(stream.url).host; } catch (e) { return; }
    if (!this.probes.has(host)) {
      this.probes.set(host, (async () => {
        try { const r = await fetchT(stream.url, { headers: { Range: 'bytes=0-1' }, mode: 'cors' }, 3000); try { r.body && r.body.cancel(); } catch (e) { /* ignore */ } return r.ok || r.status === 206; }
        catch (e) { return false; }
      })());
    }
    const ok = await this.probes.get(host);
    stream._cors = ok ? 'direct' : (await proxyOnline()) ? 'proxy' : 'none';
  },
  attach() {
    if (this.attached) return true;
    if (!this.clean()) return false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; const ctx = this.ctx = this.ctx || new AC();
      const src = ctx.createMediaElementSource(video);
      const n = this.n = {
        hp: ctx.createBiquadFilter(), eq: ctx.createBiquadFilter(), comp: ctx.createDynamicsCompressor(), makeup: ctx.createGain(),
        dry: ctx.createGain(), wet: ctx.createGain(), split: ctx.createChannelSplitter(2), merge: ctx.createChannelMerger(2), haas: ctx.createDelay(0.05),
        duck: ctx.createGain(), an: ctx.createAnalyser(),
      };
      n.hp.type = 'highpass'; n.hp.Q.value = 0.707;
      n.eq.type = 'peaking'; n.eq.frequency.value = 2200; n.eq.Q.value = 1.1;
      n.haas.delayTime.value = 0.014; n.an.fftSize = 2048; n.an.smoothingTimeConstant = 0.78;
      src.connect(n.hp); n.hp.connect(n.eq); n.eq.connect(n.comp); n.comp.connect(n.makeup);
      n.makeup.connect(n.dry); n.dry.connect(n.duck);
      // Haas widener: left straight through, right 14 ms late, blended under the dry signal
      n.makeup.connect(n.split); n.split.connect(n.merge, 0, 0); n.split.connect(n.haas, 1); n.haas.connect(n.merge, 0, 1); n.merge.connect(n.wet); n.wet.connect(n.duck);
      n.duck.connect(n.an); n.an.connect(ctx.destination);
      this.attached = true; this.apply(CFG.dsp, true);
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      return true;
    } catch (e) { console.warn('Night Mode could not attach', e); return false; }
  },
  apply(name, instant) {},
  /* 2.25.1: Night Mode sound modes are gone; the audio graph is only used by Volume boost and Listen on phone */
  pick() { if (CFG.dsp !== 'flat') setCfg('dsp', 'flat'); },
  cycle() {},
  toggle() { if (typeof PxMenu !== 'undefined' && PxMenu.open) PxMenu.open('audio'); },
  started() { if (this.attached && this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
  blockedMsg(stream) {
    showMsg('This source can’t be boosted', 'Volume boost or Listen on phone is processing the sound in this session, and this host does not let browsers read its audio. Pick another source, or reload the app to play it normally. Your place is saved.',
      `<button class="btn btn-prime" type="button" data-act="next-src"><i data-lucide="skip-forward"></i>Try next source</button><button class="btn btn-ghost" type="button" id="dspOffReload"><i data-lucide="rotate-ccw"></i>Reload and play normally</button>${handoffHTML(stream)}`);
    $('#dspOffReload').onclick = () => { saveProgress(true); setCfg('dsp', 'flat'); location.reload(); };
  },
  stopDraw() {},
};
$('#pDsp').onclick = () => DSP.toggle();

/* ---------------- Ducking: the film drops to 35 % over 150 ms while someone in the party speaks ---------------- */
const Duck = {
  target: 1, base: 1, raf: 0,
  set(on) {},
};
$('#pVol').addEventListener('input', () => { if (P.ducking) { Duck.base = Number($('#pVol').value); video.volume = Duck.base * Duck.target; } }, true);

/* ---------------- Skip Intro ----------------
   Markers come from, in order: chapters inside the stream, AniSkip (anime with a Kitsu or MAL id), or what you did
   yourself on earlier episodes of the same series (skipping 40–150 s near the start is remembered). No marker, no button. */
const Skip = {
  m: null, token: 0, shownAt: 0, used: false, pend: null, pendT: 0,
  reset() { this.m = null; this.used = false; this.shownAt = 0; this.hide(); },
  async load(ctx) {
    const token = ++this.token; this.reset();
    if (!ctx || !ctx.video || ctx.meta.type !== 'series') return;
    const learned = Store.get('introLearn', {})[ctx.meta.id];
    if (learned && learned.n >= 1) this.m = { intro: [Math.max(0, learned.s - 3), learned.e], src: 'your earlier skips' };
    const vid = String(ctx.video.id || '');
    const km = vid.match(/^kitsu:(\d+):(\d+)$/), mm = vid.match(/^mal:(\d+):(\d+)$/);
    if (km || mm) {
      try {
        let mal = mm && mm[1];
        if (km) {
          const map = Store.get('kitsuMal', {});
          mal = map[km[1]];
          if (!mal) {
            const r = await netFetch(`https://kitsu.io/api/edge/anime/${km[1]}/mappings`, { headers: { Accept: 'application/vnd.api+json' } }, 10000);
            if (!r.ok) throw new Error(`Kitsu ${r.status}`); const j = await r.json(); const hit = (j.data || []).find((x) => x.attributes && x.attributes.externalSite === 'myanimelist/anime');
            if (hit) { mal = hit.attributes.externalId; map[km[1]] = mal; Store.set('kitsuMal', map); }
          }
        }
        const ep = (km || mm)[2];
        if (mal && token === this.token) {
          const r = await fetch(`https://api.aniskip.com/v2/skip-times/${mal}/${ep}?types[]=op&types[]=ed&episodeLength=0`);
          const j = await r.json();
          if (token !== this.token) return;
          const op = (j.results || []).find((x) => x.skipType === 'op'), ed = (j.results || []).find((x) => x.skipType === 'ed');
          if (op || ed) this.m = { intro: op ? [op.interval.startTime, op.interval.endTime] : this.m && this.m.intro, credits: ed ? ed.interval.startTime : null, ed: ed ? [ed.interval.startTime, ed.interval.endTime] : null, src: 'AniSkip' };
        }
      } catch (e) { /* AniSkip or Kitsu unreachable: keep what we have */ }
    }
  },
  /* Chapter tracks inside the file or playlist, read once metadata is in */
  chapters() {
    for (const tt of video.textTracks) {
      if (tt.kind !== 'chapters') continue; tt.mode = 'hidden';
      for (const c of Array.from(tt.cues || [])) {
        const txt = String(c.text || '').toLowerCase();
        if (/\b(intro|opening|op)\b/.test(txt)) this.m = { ...(this.m || {}), intro: [c.startTime, c.endTime], src: 'chapters' };
        if (/\b(credits|ending|ed|outro|end credits)\b/.test(txt)) this.m = { ...(this.m || {}), credits: c.startTime, src: 'chapters' };
      }
    }
  },
  inCredits(t) { return !!(this.m && this.m.credits && t >= this.m.credits); },
  visible() { return !$('#skipBtn').hidden; },
  tick(t) {},
  hide() { const b = $('#skipBtn'); if (!b.hidden) { b.hidden = true; } },
  go(auto) {},
  /* Learn intro windows from your own forward skips near the start of an episode (tapping +10 s several times counts as one) */
  noteSeek(from, to) {
    if (!P.ctx || !P.ctx.video || P.ctx.meta.type !== 'series' || to <= from || from > 600) { this.pend = null; return; }
    if (this.pend && Math.abs(from - this.pend.to) < 4) this.pend.to = to; else this.pend = { from, to };
    clearTimeout(this.pendT);
    this.pendT = setTimeout(() => {
      const p = this.pend; this.pend = null; if (!p || !P.ctx) return;
      const len = p.to - p.from; if (len < 40 || len > 150) return;
      const all = Store.get('introLearn', {}), id = P.ctx.meta.id, o = all[id];
      all[id] = o ? { s: (o.s * o.n + p.from) / (o.n + 1), e: (o.e * o.n + p.to) / (o.n + 1), n: Math.min(o.n + 1, 6) } : { s: p.from, e: p.to, n: 1 };
      Store.set('introLearn', all);
    }, 4000);
  },
};
$('#skipBtn').onclick = (e) => { e.stopPropagation(); Skip.go(); };
video.addEventListener('loadedmetadata', () => setTimeout(() => Skip.chapters(), 400));

/* ---------------- Next episode: a 10-second countdown card during the credits or the last 45 seconds ---------------- */
showUpNext = function () {
  if (!P.ctx || !P.ctx.video) return;
  const nv = nextVideo(P.ctx.meta, P.ctx.video); if (!nv || !$('#upNext').hidden) return;
  const box = $('#upNext'); box.hidden = false; box.classList.add('countdown');
  const auto = !!CFG.autoNext, total = 10000; let left = total, last = performance.now();
  box.innerHTML = `<div class="un-th${Spoilers.guarded(videoIdFor(P.ctx.meta, nv)) ? ' spoil' : ''}">${imgTag(nv.thumbnail, nv.name || nv.title || '', videoIdFor(P.ctx.meta, nv), { wide: true })}</div>
    <div style="min-width:0"><small id="unLabel">${auto ? 'Next in <b class="tnum" id="unSec">10</b> s' : 'Up next'} · S${esc(nv.season)} E${esc(nv.episode)}</small><b>${esc(nv.name || nv.title || `Episode ${nv.episode}`)}</b>
    ${auto ? '<div class="un-bar"><i id="unFill"></i></div>' : ''}
    <div class="actions"><button class="btn btn-prime btn-sm" type="button" id="unPlay"><i data-lucide="play"></i>Play now</button><button class="btn btn-ghost btn-sm" type="button" id="unCancel">${auto ? 'Cancel' : 'Hide'}</button></div></div>`;
  icons();
  // warm the next episode's streams so the switch is instant
  engine.fetchStreams('series', videoIdFor(P.ctx.meta, nv)).catch(() => {});
  $('#unPlay').onclick = () => { clearInterval(P.upNextT); playNext(); };
  $('#unCancel').onclick = () => { clearInterval(P.upNextT); P.upNextDismissed = true; box.hidden = true; };
  clearInterval(P.upNextT);
  if (!auto) return;
  P.upNextT = setInterval(() => {
    const now = performance.now(); if (!video.paused) left -= now - last; last = now;
    const sec = $('#unSec'), fill = $('#unFill'); if (!sec) { clearInterval(P.upNextT); return; }
    sec.textContent = String(Math.max(0, Math.ceil(left / 1000))); fill.style.transform = `scaleX(${clamp(1 - left / total, 0, 1)})`;
    if (left <= 0) { clearInterval(P.upNextT); playNext(); }
  }, 100);
};

/* ---------------- Failover ----------------
   A source that has not loaded anything after 3.5 s, or that errors, is swapped for the next best one automatically.
   A source that stalls for 12 s mid-film is swapped at the same timestamp. Each source is tried once per episode. */
const Failover = {
  t: 0, stallT: 0, tried: new Set(), key: '',
  clear() { clearTimeout(this.t); clearTimeout(this.stallT); },
  arm(stream) {
    this.clear();
    const key = P.ctx ? (P.ctx.video ? P.ctx.video.id : P.ctx.meta.id) : '';
    if (key !== this.key) { this.key = key; this.tried = new Set(); this.hops = 0; }
    this.tried.add(stream);
    // a TorBox language stream is made on the fly and takes longer to start; it falls back to the original file instead
    if (!CFG.failover || stream._local || stream._handoff || stream._audioTry) return;
    this.t = setTimeout(() => {
      if (P.stream === stream && !$('#player').hidden && video.readyState < 1 && $('#pMsg').hidden) this.next(stream, 'did not start within 3.5 s', P.startAt || 0);
    }, 3500);
  },
  candidates(failed) {
    const list = visibleStreams((P.ctx && P.ctx.streams) || []).filter((s) => s._tel && s._tel.webReady && !s._tel.isTrailer && s._tel.cached !== false && !this.tried.has(s));
    const g = failed && failed.behaviorHints && failed.behaviorHints.bingeGroup;
    return list.sort((a, b) => (g ? ((b.behaviorHints || {}).bingeGroup === g) - ((a.behaviorHints || {}).bingeGroup === g) : 0) || b._tel.score - a._tel.score);
  },
  next(failed, reason, at) {
    const n = this.candidates(failed)[0]; if (!n) return false;
    this.hops = (this.hops || 0) + 1;
    const why = /not supported|blocked|decode/i.test(reason) ? 'won’t play in this browser' : /3\.5 s|start/i.test(reason) ? 'was slow to start' : /stalled/i.test(reason) ? 'stalled' : /cached/i.test(reason) ? 'isn’t cached yet' : 'didn’t work';
    toast(this.hops > 1 ? `Still looking for a source that plays here… (try ${this.hops + 1})` : `That source ${why}. Trying the next best one…`, 'info', 4200, 'failover');
    playStream(P.ctx, n, { startAt: at != null ? at : pNow() });
    return true;
  },
  onError(stream, reason) {
    if (!CFG.failover || !P.ctx || stream._local || P.stream !== stream) return false;
    if (Rescue.active) return false;
    return this.next(stream, `failed (${reason})`, P.startAt || (isFinite(pDur()) ? pNow() : 0));
  },
};
video.addEventListener('waiting', () => {
  clearTimeout(Failover.stallT);
  if (!CFG.failover || !P.stream || P.remux || video.readyState < 1) return;
  const s = P.stream, at = pNow();
  Failover.stallT = setTimeout(() => { if (P.stream === s && video.readyState < 3 && !video.paused) Failover.next(s, 'stalled for 12 s', at); }, 12000);
});
['playing', 'pause', 'seeking'].forEach((ev) => video.addEventListener(ev, () => clearTimeout(Failover.stallT)));
video.addEventListener('loadedmetadata', () => clearTimeout(Failover.t));

/* ---------------- Audio rescue: MKV files with EAC3, AC3, DTS or TrueHD audio play silently in browsers ----------------
   Chrome decodes the picture and drops the audio without an error. When that happens MKCinema asks the companion
   server to remux on the fly (video copied, audio converted to stereo AAC). Without a server it explains the options. */
const Rescue = {
  active: false, checkT: 0, restartT: 0, server: null,
  reset() { clearTimeout(this.checkT); clearTimeout(this.restartT); this.active = false; this.token = (this.token || 0) + 1; if (this.userMuted != null) { video.muted = this.userMuted; this.userMuted = null; } Loader.hold = false; $('#rescueBar').hidden = true; },
  silent() {
    if ('webkitAudioDecodedByteCount' in video) return video.webkitAudioDecodedByteCount === 0 && video.webkitVideoDecodedByteCount > 0;
    if ('mozHasAudio' in video) return !video.mozHasAudio && video.videoWidth > 0;
    if (video.audioTracks) return video.audioTracks.length === 0 && video.videoWidth > 0;
    return false;
  },
  watch(stream) {
    clearTimeout(this.checkT);
    if (!stream || stream._local || P.hls || P.remux || !stream.url) return;
    const go = () => { this.checkT = setTimeout(() => { if (P.stream === stream && !video.paused && !P.remux && this.silent()) this.found(stream); }, 2600); };
    // playback may already be running by the time the stream is reported started
    if (!video.paused && video.readyState >= 3) go(); else video.addEventListener('playing', go, { once: true });
  },
  async caps() {
    if (this.server && Date.now() - this.server.t < 30000) return this.server.remux;
    try { const r = await fetchT(`${String(S.proxy).replace(/\/+$/, '')}/health`, {}, 2500); const j = await r.json(); this.server = { t: Date.now(), remux: !!j.remux }; }
    catch (e) { this.server = { t: Date.now(), remux: false }; }
    return this.server.remux;
  },
  async found(stream) {
    const bar = $('#rescueBar');
    if (await this.caps()) { toast('No sound in this file’s audio format. Converting it to AAC on your MKCinema server…', 'info', 4200); this.start(stream, pNow()); return; }
    const ext = playersHere().filter((p) => !p.m3u).slice(0, 2), url = handoffUrl(stream), title = streamTitle(P.ctx);
    bar.innerHTML = `<i data-lucide="volume-x"></i><div class="rs-t"><b>No sound?</b><small>This file’s audio (often EAC3, AC3 or DTS in MKV) cannot play in browsers. Run mkcinema-server.js with ffmpeg to fix it here, or open it in a player app.</small></div>
      <div class="rs-a"><button class="btn btn-prime btn-sm" type="button" data-act="next-src"><i data-lucide="skip-forward"></i>Next source</button>${url ? ext.map((p) => playerBtn(p, url, title, false)).join('') : ''}<button class="ibtn" type="button" id="rsX" aria-label="Dismiss"><i data-lucide="x"></i></button></div>`;
    bar.hidden = false; icons();
    $$('[data-act]', bar).forEach((b) => b.addEventListener('click', () => { bar.hidden = true; playerAct(b.dataset.act); }));
    $('#rsX').onclick = () => { bar.hidden = true; };
  },
  remuxUrl(stream, t) {
    const bh = stream.behaviorHints || {}, h = bh.proxyHeaders && bh.proxyHeaders.request;
    return `${String(S.proxy).replace(/\/+$/, '')}/remux?url=${encodeURIComponent(stream.url)}&t=${t.toFixed(2)}${h ? `&headers=${encodeURIComponent(b64json(h))}` : ''}${P.remux && P.remux.hevc ? '&hevc=1' : ''}${P.remux && P.remux.audio ? `&audio=${P.remux.audio}` : ''}`;
  },
  async start(stream, t) {
    this.active = true; Loader.show(P.ctx && P.ctx.meta);
    let info = null;
    try {
      const bh = stream.behaviorHints || {}, h = bh.proxyHeaders && bh.proxyHeaders.request;
      const r = await fetch(`${String(S.proxy).replace(/\/+$/, '')}/remux/probe?url=${encodeURIComponent(stream.url)}${h ? `&headers=${encodeURIComponent(b64json(h))}` : ''}`);
      info = await r.json(); if (!r.ok) throw new Error(info.error || `HTTP ${r.status}`);
    } catch (e) { this.active = false; Loader.hide(); toast(`Audio rescue failed: ${e.message}`, 'err', 6000); return; }
    if (P.stream !== stream) return;
    P.remux = { offset: t, duration: Number(info.duration) || pDur(), hevc: /hevc|h265/i.test(info.video || ''), audio: this.wantAudio || 0, tracks: info.tracks || null }; this.wantAudio = 0;
    this.load(stream, t);
    $('#rescueBar').hidden = true;
  },
  // Copied video can only start on a keyframe, so the server is asked where a seek to t really lands first
  async keyframe(stream, t) {
    if (!(t > 0.5)) return 0;
    try {
      const bh = stream.behaviorHints || {}, h = bh.proxyHeaders && bh.proxyHeaders.request, ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
      const r = await fetchT(`${String(S.proxy).replace(/\/+$/, '')}/remux/seek?url=${encodeURIComponent(stream.url)}&t=${t.toFixed(3)}${h ? `&headers=${encodeURIComponent(b64json(h))}` : ''}`, {}, 8000);
      const j = await r.json(); return r.ok && Number.isFinite(j.start) && j.start <= t ? j.start : t;
    } catch (e) { return t; }
  },
  async load(stream, t) {
    if (P.hls) { try { P.hls.destroy(); } catch (e) { /* ignore */ } P.hls = null; }
    const token = this.token = (this.token || 0) + 1;
    const start = await this.keyframe(stream, t);
    if (token !== this.token || P.stream !== stream || !P.remux) return;
    P.remux.offset = start; video.crossOrigin = 'anonymous';
    video.src = this.remuxUrl(stream, start);
    // land on the exact second asked for once the first frames arrive
    // The converted stream starts on the keyframe and cannot be seeked (it is made on the fly), so it is played
    // muted at 8x behind the loading screen until it reaches the second asked for. That takes well under a second
    // for a typical 2 to 5 s keyframe gap.
    const want = t - start;
    if (want > 0.2) {
      // a seek during a catch-up keeps the mute state the user had before the first one
      if (this.userMuted == null) this.userMuted = video.muted;
      const t0 = performance.now(); Loader.hold = true; video.muted = true; video.playbackRate = 8;
      const done = () => {
        if (token === this.token) { video.playbackRate = CFG.speed || 1; video.muted = !!this.userMuted; this.userMuted = null; Loader.hold = false; if (!video.paused) Loader.hide(); }
      };
      const step = () => {
        if (token !== this.token || P.stream !== stream) return;
        if (video.currentTime >= want - 0.05 || performance.now() - t0 > 12000) { done(); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    video.play().catch(() => wakeHud(true));
  },
  restart(t) {
    // every seek restarts the server's conversion at the new spot; quick taps are merged
    if (!P.remux || !P.stream) return; const s = P.stream;
    P.remux.offset = t; video.pause(); Loader.wait();
    clearTimeout(this.restartT); this.restartT = setTimeout(() => { if (P.stream === s && P.remux) this.load(s, t); }, 280);
  },
};

/* ---------------- Subtitle tools: millisecond sync on a 20-second timeline, and a transcript ---------------- */
const SubTools = {
  raf: 0, drag: null,
  cues() { const t = activeTrack(); return t && t.cues ? Array.from(t.cues) : []; },
  openSync() {
    $('#subMenu').hidden = true; const box = $('#subSync'); box.hidden = false; wakeHud(true);
    box.innerHTML = `<div class="ss-head"><b>Subtitle sync</b><span class="tnum" id="ssVal"></span><button class="ibtn" type="button" id="ssX" aria-label="Close"><i data-lucide="x"></i></button></div>
      <div class="ss-tl" id="ssTl" title="Drag the lines left or right"><div class="ss-cues" id="ssCues"></div><i class="ss-now"></i></div>
      <div class="ss-btns">${[[-1, '−1 s'], [-0.1, '−100 ms'], [-0.01, '−10 ms'], [0, 'Reset'], [0.01, '+10 ms'], [0.1, '+100 ms'], [1, '+1 s']].map(([v, l]) => `<button type="button" class="chip" data-ss="${v}">${l}</button>`).join('')}<button type="button" class="chip" id="ssTx"><i data-lucide="scroll-text"></i>Transcript</button></div>
      <p class="ss-hint">Lines in the strip sit where they will be shown. Drag them under the white marker as the words are spoken.</p>`;
    icons();
    $('#ssX').onclick = () => this.closeSync();
    $('#ssTx').onclick = () => { this.closeSync(); this.openTx(); };
    $$('[data-ss]', box).forEach((b) => b.addEventListener('click', () => { const v = Number(b.dataset.ss); setSubDelay(v === 0 ? 0 : P.subDelay + v, true); this.paint(); }));
    const tl = $('#ssTl');
    tl.onpointerdown = (e) => { this.drag = { x: e.clientX, d0: P.subDelay, w: tl.getBoundingClientRect().width }; try { tl.setPointerCapture(e.pointerId); } catch (_) { /* gone */ } };
    tl.onpointermove = (e) => { if (!this.drag) return; const sec = (e.clientX - this.drag.x) / this.drag.w * 20; P.subDelay = Math.round((this.drag.d0 + sec) * 1000) / 1000; applySubDelay(); this.paint(); };
    tl.onpointerup = tl.onpointercancel = () => { if (this.drag) { this.drag = null; setSubDelay(P.subDelay, true); } };
    const loop = () => { this.raf = requestAnimationFrame(loop); this.paint(); }; cancelAnimationFrame(this.raf); loop();
  },
  closeSync() { $('#subSync').hidden = true; cancelAnimationFrame(this.raf); },
  paint() {
    const box = $('#ssCues'); if (!box) return;
    const now = video.currentTime;
    $('#ssVal').textContent = `${P.subDelay >= 0 ? '+' : '−'}${Math.abs(P.subDelay).toFixed(3)} s`;
    // Lines are laid out once for a 60 s span; each frame only slides the strip (a transform), the marker stays centered
    if (box._base == null || now - 10 < box._base || now + 10 > box._base + 60 || box._d !== P.subDelay) {
      const base = box._base = Math.floor(now) - 25; box._d = P.subDelay;
      const list = this.cues().filter((c) => c.endTime > base && c.startTime < base + 60);
      box.innerHTML = list.map((c) => `<span style="left:${((c.startTime - base) / 20 * 100).toFixed(3)}%;width:${Math.max(0.6, (c.endTime - c.startTime) / 20 * 100).toFixed(3)}%">${esc(String(c.text).replace(/<[^>]+>/g, '').slice(0, 60))}</span>`).join('');
      $('#ssTl').classList.toggle('empty', !list.length);
    }
    box.style.transform = `translateX(${(-(now - 10 - box._base) / 20 * 100).toFixed(3)}%)`;
  },
  openTx() {
    const list = this.cues();
    if (!list.length) { toast(P.curSub < 0 ? 'Turn on subtitles first' : 'These subtitles are still loading', 'err'); return; }
    openDrawer('tx'); this.renderTx(list);
    $('#txFind').value = ''; $('#txFind').oninput = debounce(() => this.renderTx(this.cues()), 120);
  },
  renderTx(list) {
    const q = $('#txFind').value.trim().toLowerCase();
    $('#txList').innerHTML = list.map((c, i) => [c, i]).filter(([c]) => !q || String(c.text).toLowerCase().includes(q)).slice(0, 1500)
      .map(([c, i]) => `<div class="tx-row" data-ci="${i}"><button type="button" class="tx-t tnum" data-go="${i}">${fmtTime(c.startTime)}</button><span class="tx-l">${esc(String(c.text).replace(/<[^>]+>/g, ''))}</span><button type="button" class="tx-sync" data-sync="${i}" title="This line is being spoken right now"><svg class="ds-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>Sync here</button></div>`).join('');
    $$('#txList [data-go]').forEach((b) => b.addEventListener('click', () => { const c = list[Number(b.dataset.go)]; if (c) pSeek(c.startTime + (P.remux ? P.remux.offset : 0) - 0.2); }));
    $$('#txList [data-sync]').forEach((b) => b.addEventListener('click', () => {
      const c = list[Number(b.dataset.sync)]; if (!c) return;
      const orig = c._s != null ? c._s : c.startTime;
      setSubDelay(video.currentTime - orig, true); toast(`Synced: subtitles now ${P.subDelay >= 0 ? '+' : '−'}${Math.abs(P.subDelay).toFixed(3)} s`, 'ok');
    }));
    this.mark();
  },
  mark() {
    const box = $('#txList'); if (!$('#txDrawer').classList.contains('open') || !box.children.length) return;
    const list = this.cues(), now = video.currentTime; const i = list.findIndex((c) => c.startTime <= now && c.endTime >= now);
    $$('.tx-row.on', box).forEach((r) => r.classList.remove('on'));
    const row = i >= 0 && $(`.tx-row[data-ci="${i}"]`, box); if (row) { row.classList.add('on'); if (!box.matches(':hover')) row.scrollIntoView({ block: 'nearest' }); }
  },
};
// Millisecond subtitle delay (the menu buttons still move it in 0.25 s steps)
setSubDelay = function (v, quiet) { P.subDelay = Math.round(v * 1000) / 1000; applySubDelay(); renderSubMenu(); if (!quiet) toast(`Subtitle delay ${P.subDelay >= 0 ? '+' : ''}${P.subDelay.toFixed(2)}s`, 'info', 1400); };
{
  const base = renderSubMenu;
  renderSubMenu = function () {
    base();
    const m = $('#subMenu'); if (!m || P.curSub < 0) return;
    m.insertAdjacentHTML('beforeend', '<h5>Tools</h5><button type="button" data-subsync><i data-lucide="sliders-horizontal"></i>Sync on a timeline</button><button type="button" data-subtx><i data-lucide="scroll-text"></i>Transcript</button>');
    $('[data-subsync]', m).onclick = () => SubTools.openSync(); $('[data-subtx]', m).onclick = () => { m.hidden = true; SubTools.openTx(); };
    icons();
  };
}

/* ---------------- X-Ray: pause and see who is on screen, the technical picture, and bookmark the scene ---------------- */
const XRay = {
  t: 0,
  schedule() { clearTimeout(this.t); if (!CFG.xray) return; this.t = setTimeout(() => { if (video.paused && !$('#player').hidden && !P.scrubbing && !P.locked && $('#pMsg').hidden && video.readyState >= 2 && !$('#player .drawer.open') && $('#subMenu').hidden && $('#optMenu').hidden && $('#dspPop').hidden && !Party.applying) this.show(); }, 900); },
  hide() { clearTimeout(this.t); const x = $('#xray'); if (!x.hidden) { x.classList.add('out'); setTimeout(() => { x.hidden = true; x.classList.remove('out'); }, 200); } },
  stats() {
    const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null, tel = P.stream._tel || {};
    let rate = '';
    if (P.hls && P.hls.levels && P.hls.levels[P.hls.currentLevel]) rate = `${(P.hls.levels[P.hls.currentLevel].bitrate / 1e6).toFixed(1)} Mb/s`;
    else if (tel.sizeBytes && isFinite(pDur())) rate = `≈ ${(tel.sizeBytes * 8 / pDur() / 1e6).toFixed(1)} Mb/s`;
    const ahead = video.buffered.length ? Math.max(0, video.buffered.end(video.buffered.length - 1) - video.currentTime) : 0;
    return [
      ['Picture', video.videoWidth ? `${video.videoWidth}×${video.videoHeight}${tel.hdr ? ` · ${tel.hdr}` : ''}` : '—'],
      ['Dropped frames', q ? `${q.droppedVideoFrames} of ${q.totalVideoFrames}` : '—'],
      ['Bitrate', rate || '—'],
      ['Buffered ahead', `${ahead.toFixed(0)} s`],
      ['Audio', DSP.attached ? 'Processed' : P.remux ? 'Rescued · AAC stereo' : 'Unprocessed'],
      ['Codec', [tel.codec, (tel.audio || []).join(' ')].filter(Boolean).join(' · ') || '—'],
      ['Addon', P.stream._addon || '—'],
    ];
  },
  tab: 'cast',
  // Cast with character names and photos: Cinemeta's own list when it has one, else names from the
  // title's links, with portraits and short bios from Wikipedia (free, no key, credited in the panel)
  people() {
    const m = P.ctx.meta, ex = m.app_extras || {};
    const pick = (arr, role) => (arr || []).map((c) => (typeof c === 'string' ? { name: c } : { name: c.name, character: c.character, photo: c.photo })).filter((c) => c.name).map((c) => ({ ...c, role }));
    const links = (cat) => (m.links || []).filter((l) => l.category === cat).map((l) => l.name);
    const cast = pick(ex.cast && ex.cast.length ? ex.cast : m.cast && m.cast.length ? m.cast : links('Cast'), 'cast').slice(0, 18);
    const dirs = pick(ex.directors && ex.directors.length ? ex.directors : m.director && m.director.length ? m.director : links('Directors'), 'Director');
    const wri = pick(ex.writers && ex.writers.length ? ex.writers : m.writer && m.writer.length ? m.writer : links('Writers'), 'Writer');
    const seen = new Set(cast.map((c) => c.name)); const crew = [...dirs, ...wri].filter((c) => !seen.has(c.name) && seen.add(c.name)).slice(0, 6);
    return { cast, crew };
  },
  face(p, i) {
    const ini = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
    return `<button type="button" class="xr-p" data-person="${i}"><span class="xr-ph" data-ini="${esc(ini)}">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" data-gone>` : ''}</span><b>${esc(p.name)}</b>${p.character ? `<small>${esc(p.character)}</small>` : p.role !== 'cast' ? `<small>${esc(p.role)}</small>` : ''}</button>`;
  },
  show() {
    if (!P.ctx || !P.stream) return;
    const x = $('#xray'), m = P.ctx.meta, v = P.ctx.video;
    this.list = this.people(); const all = [...this.list.cast, ...this.list.crew];
    x.innerHTML = `<div class="xr-head"><span class="xr-brand"><i data-lucide="scan-eye"></i>X-Ray</span><span class="xr-time tnum">${fmtTime(pNow())}</span><button class="ibtn" type="button" id="xrX" aria-label="Close"><i data-lucide="x"></i></button></div>
      <h3>${esc(m.name)}</h3>${v ? `<p class="xr-sub">S${esc(v.season)} · E${esc(v.episode)}${v.name || v.title ? ` · ${esc(v.name || v.title)}` : ''}</p>` : ''}
      <div class="xr-tabs" role="tablist">${[['cast', 'Cast'], ['about', 'About'], ['scene', 'This scene']].map(([k, l]) => `<button type="button" role="tab" data-xt="${k}" class="${this.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="xr-body" id="xrBody"></div>`;
    x.hidden = false; icons();
    $('#xrX').onclick = () => this.hide();
    $$('[data-xt]', x).forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.xt; $$('[data-xt]', x).forEach((o) => o.classList.toggle('on', o === b)); this.render(); }));
    this.render();
    // fill in missing portraits a few at a time
    // people without a portrait stay hidden, so the panel only shows faces
    let i = 0; this.pending = all.filter((p) => !p.photo).length; const job = this.job = {};
    const next = async () => { while (i < all.length) { const p = all[i++]; if (p.photo) continue; const w = await Wiki.person(p.name); if (job !== this.job) return; if (w && w.thumb) { p.photo = w.thumb; p.wiki = w; } this.pending--; this.recast(); } };
    if (this.pending) for (let k = 0; k < 4; k++) next();
  },
  paint(i) { const el = $(`#xray [data-person="${i}"] .xr-ph`), p = [...this.list.cast, ...this.list.crew][i]; if (el && p && p.photo && !$('img', el)) el.innerHTML = `<img src="${esc(p.photo)}" alt="" loading="lazy" data-gone>`; },
  // redraw the cast tab as portraits arrive (merged into one frame), unless an actor page is open
  recast() { if (this.tab !== 'cast' || this.inPerson || this.raf) return; this.raf = requestAnimationFrame(() => { this.raf = 0; if (this.tab === 'cast' && !this.inPerson && !$('#xray').hidden) this.render(); }); },
  render() {
    const body = $('#xrBody'); if (!body) return;
    const { cast, crew } = this.list, m = P.ctx.meta;
    this.inPerson = false;
    if (this.tab === 'cast') {
      const faces = (arr, off) => arr.map((p, i) => [p, off + i]).filter(([p]) => p.photo).map(([p, i]) => this.face(p, i)).join('');
      const c = faces(cast, 0), w = faces(crew, cast.length), waiting = this.pending > 0;
      body.innerHTML = c || w
        ? `${c ? `<div class="xr-grid">${c}</div>` : ''}${w ? `<h5>Behind the camera</h5><div class="xr-grid">${w}</div>` : ''}${waiting ? '<div class="status-line xr-wait"><span class="spin"></span>Finding more faces…</div>' : ''}<p class="xr-credit">Photos and bios from Wikipedia</p>`
        : waiting ? '<div class="status-line"><span class="spin"></span>Finding cast photos…</div>'
        : cast.length ? `<p class="xr-names">${esc(cast.slice(0, 8).map((p) => p.name).join(' · '))}</p>`
        : '<p class="xr-sub">This title lists no cast. Your metadata addon did not include one.</p>';
      $$('[data-person]', body).forEach((b) => b.addEventListener('click', () => this.person([...cast, ...crew][Number(b.dataset.person)])));
    } else if (this.tab === 'about') {
      const facts = [['Released', m.released ? new Date(m.released).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : yearOf(m)], ['Runtime', m.runtime], ['Genres', genresOf(m).join(', ')], ['IMDb', m.imdbRating ? `${m.imdbRating} / 10` : ''], ['Awards', m.awards], ['Country', m.country], ['Language', m.language]].filter(([, val]) => val);
      body.innerHTML = `<div class="xr-about" id="xrWiki"><div class="status-line"><span class="spin"></span>Looking up the story behind it…</div></div><dl class="xr-facts" id="xrFacts">${facts.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join('')}</dl>`;
      Wiki.work(m).then((w) => { const el = $('#xrWiki'); if (!el) return; el.innerHTML = w ? `<p>${esc(w.extract)}</p><a class="xr-credit" href="${esc(safeHref(w.url) || '#')}" target="_blank" rel="noopener">Read more on Wikipedia</a>` : m.description ? `<p>${esc(m.description)}</p>` : ''; });
      this.omdb(m);
    } else {
      body.innerHTML = `<div class="xr-scene"><b class="tnum">${fmtTime(pNow())}</b><span>${isFinite(pDur()) ? `${Math.round(pNow() / pDur() * 100)}% through` : ''}</span></div>
        <div class="xr-mark" id="xrMark"><button class="btn btn-ghost btn-sm" type="button" id="xrBook"><i data-lucide="bookmark-plus"></i>Bookmark this scene</button></div>
        <h5>Picture and sound</h5><dl class="xr-tech">${this.stats().map(([k, val]) => `<dt>${esc(k)}</dt><dd class="tnum">${esc(val)}</dd>`).join('')}</dl>`;
      icons();
      $('#xrBook').onclick = () => {
        $('#xrMark').innerHTML = '<input class="inp" id="xrNote" placeholder="Add a note (optional)" maxlength="140"><button class="btn btn-prime btn-sm" type="button" id="xrSave"><i data-lucide="check"></i>Save</button>'; icons();
        $('#xrNote').focus(); const save = () => { Bookmarks.add($('#xrNote').value.trim()); $('#xrMark').innerHTML = '<p class="xr-ok"><i data-lucide="check"></i>Saved to Library › Scene bookmarks</p>'; icons(); };
        $('#xrSave').onclick = save; $('#xrNote').onkeydown = (e) => { if (e.key === 'Enter') save(); e.stopPropagation(); };
      };
    }
  },
  async omdb(m) {
    const key = Keys.get().omdb, id = imdbOf(m); if (!key || !id) return;
    try {
      const j = await (await fetch(`https://www.omdbapi.com/?i=${id}&apikey=${encodeURIComponent(key)}`)).json(); if (j.Response !== 'True') return;
      const dl = $('#xrFacts'); if (!dl) return; const have = new Set($$('dt', dl).map((d) => d.textContent));
      [['Rated', j.Rated], ['Awards', j.Awards], ['Box office', j.BoxOffice], ['Country', j.Country]].forEach(([k, val]) => { if (val && val !== 'N/A' && !have.has(k)) dl.insertAdjacentHTML('beforeend', `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`); });
    } catch (e) { /* facts from metadata stay */ }
  },
  async person(p) {
    const body = $('#xrBody'); if (!body || !p) return; this.inPerson = true;
    body.innerHTML = `<button type="button" class="xr-back" id="xrBack"><i data-lucide="chevron-left"></i>All cast</button>
      <div class="xr-bio"><span class="xr-ph lg" data-ini="${esc(p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join(''))}">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : ''}</span><div><h4>${esc(p.name)}</h4>${p.character ? `<p class="xr-as">as ${esc(p.character)}</p>` : p.role !== 'cast' ? `<p class="xr-as">${esc(p.role)}</p>` : ''}<p class="xr-desc" id="xrDesc"></p></div></div>
      <p class="xr-extract" id="xrExtract"><span class="spin"></span></p>
      <h5>Also with ${esc(p.name.split(' ')[0])}</h5><div id="xrMore"><div class="status-line"><span class="spin"></span>Searching your addons…</div></div>`;
    icons(); $('#xrBack').onclick = () => this.render();
    Wiki.person(p.name).then((w) => {
      const ex = $('#xrExtract'); if (!ex) return;
      if (w) { $('#xrDesc').textContent = w.description || ''; ex.innerHTML = `${esc(w.extract)} <a class="xr-credit" href="${esc(safeHref(w.url) || '#')}" target="_blank" rel="noopener">Wikipedia</a>`; const ph = $('.xr-ph.lg', body); if (w.big && ph) ph.innerHTML = `<img src="${esc(w.big)}" alt="">`; } else ex.remove();
    });
    try {
      const res = await engine.search(p.name); const seen = new Set(), out = [];
      res.forEach(({ metas }) => metas.forEach((m) => { if (!seen.has(m.id) && m.id !== P.ctx.meta.id) { seen.add(m.id); out.push(remember(m)); } }));
      const box = $('#xrMore'); if (!box) return;
      box.innerHTML = out.length ? `<div class="xr-rail">${out.slice(0, 12).map((m) => `<button type="button" class="xr-t" data-xm="${esc(m.id)}">${imgTag(metaPoster(m), m.name, m.id)}<small>${esc(m.name)}</small></button>`).join('')}</div>` : '<p class="xr-sub">No other titles found in your search addons.</p>';
      $$('[data-xm]', box).forEach((b) => b.addEventListener('click', () => { const m = S.metas.get(b.dataset.xm); if (!m) return; closePlayer(); openDetail(m); }));
    } catch (e) { const box = $('#xrMore'); if (box) box.innerHTML = `<p class="xr-sub">Search failed (${esc(e.message)}).</p>`; }
  },
};
/* Wikipedia summaries (REST API, CORS-enabled, no key) for portraits, bios and the story behind a title */
const Wiki = {
  cache: new Map(),
  async summary(title) {
    if (this.cache.has(title)) return this.cache.get(title);
    const job = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`).then((r) => (r.ok ? r.json() : null)).then((j) => (!j || j.type === 'disambiguation' || !j.extract ? null : {
      extract: j.extract, description: j.description || '', url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      thumb: j.thumbnail && j.thumbnail.source, big: j.thumbnail && j.thumbnail.source.replace(/\/\d+px-/, '/600px-'),
    })).catch(() => null);
    this.cache.set(title, job); return job;
  },
  async person(name) {
    for (const t of [name, `${name} (actor)`, `${name} (actress)`]) { const s = await this.summary(t); if (s && /\b(actor|actress|comedian|performer|director|filmmaker|screenwriter|writer|producer|singer|musician|rapper|model|presenter|voice)\b/i.test(`${s.description} ${s.extract.slice(0, 200)}`)) return s; }
    return null;
  },
  async work(m) {
    const y = (yearOf(m).match(/\d{4}/) || [''])[0], kinds = m.type === 'series' ? ['TV series', 'miniseries'] : ['film'];
    for (const t of [...(y ? kinds.map((k) => `${m.name} (${y} ${k})`) : []), ...kinds.map((k) => `${m.name} (${k})`), m.name]) { const s = await this.summary(t); if (s && /\b(film|movie|television|series|miniseries|show|sitcom|drama|documentary)\b/i.test(`${s.description} ${s.extract.slice(0, 160)}`)) return s; }
    return null;
  },
};
video.addEventListener('pause', () => XRay.schedule());
video.addEventListener('play', () => XRay.hide());

/* ---------------- Scene bookmarks (kept on this device; thumbnails are too big to sync) ---------------- */
const Bookmarks = {
  list() { return Store.get('bookmarks', []); },
  snapshot() {
    try { const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * (video.videoHeight / video.videoWidth || 9 / 16)); c.getContext('2d').drawImage(video, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.72); }
    catch (e) { return null; } // the host does not allow reading its frames
  },
  add(note) {
    const ctx = P.ctx; if (!ctx) return;
    const b = { id: `bm${Date.now().toString(36)}`, metaId: ctx.meta.id, type: ctx.meta.type, name: ctx.meta.name, videoId: ctx.video ? ctx.video.id : ctx.meta.id, season: ctx.video && ctx.video.season, episode: ctx.video && ctx.video.episode, t: pNow(), note, thumb: this.snapshot(), poster: metaBg(ctx.meta) || metaPoster(ctx.meta), at: Date.now() };
    Store.set('bookmarks', [b, ...this.list()].slice(0, 60)); toast('Scene bookmarked', 'ok');
  },
  remove(id) { Store.set('bookmarks', this.list().filter((b) => b.id !== id)); renderLibrary(); },
  async open(b) {
    toast(`Opening ${b.name} at ${fmtTime(b.t)}…`);
    let meta = { id: b.metaId, type: b.type, name: b.name };
    try { meta = remember({ ...meta, ...((await engine.fetchMeta(b.type, b.metaId)) || {}) }); } catch (e) { /* keep saved data */ }
    const video = b.type === 'series' && meta.videos ? meta.videos.find((v) => videoIdFor(meta, v) === b.videoId) || null : null;
    const { streams } = await engine.fetchStreams(b.type, b.videoId); const pick = pickBest(streams);
    if (!pick) { openDetail(meta, { videoId: b.videoId }); return; }
    playStream({ meta, video, streams }, pick, { startAt: b.t });
  },
  row(root) {
    const list = this.list(); if (!list.length) return;
    const sec = document.createElement('section'); sec.className = 'row';
    sec.innerHTML = `<div class="row-head"><h2 class="row-title">Scene bookmarks <small>${list.length} saved</small></h2></div><div class="rail">${list.map((b) => `<div class="card wide bm" tabindex="0" role="button" data-nav data-bm="${esc(b.id)}" aria-label="${esc(b.name)} at ${fmtTime(b.t)}"><div class="card-inner"><div class="layer l0">${b.thumb ? `<img src="${b.thumb}" alt="">` : imgTag(b.poster, b.name, b.metaId, { wide: true })}</div><div class="layer l2"><span class="bm-t tnum">${fmtTime(b.t)}</span><button class="ibtn bm-x" type="button" data-bmx="${esc(b.id)}" aria-label="Delete bookmark"><i data-lucide="x"></i></button></div></div><div class="card-sub"><b>${esc(b.name)}${b.season != null ? ` · S${b.season}E${b.episode}` : ''}</b>${esc(b.note || 'No note')}</div></div>`).join('')}</div>`;
    root.appendChild(sec); icons();
    $$('[data-bm]', sec).forEach((c) => c.addEventListener('click', (e) => { const x = e.target.closest('[data-bmx]'); if (x) { e.stopPropagation(); this.remove(x.dataset.bmx); return; } const b = this.list().find((k) => k.id === c.dataset.bm); if (b) this.open(b); }));
  },
};
{
  const base = renderLibrary;
  renderLibrary = function () {
    base(); const root = $('#libRows');
    root.insertAdjacentHTML('afterbegin', '<div class="lib-tools"><button class="btn btn-ghost btn-sm" type="button" data-go-cal><i data-lucide="calendar-days"></i>Airing calendar</button></div>');
    $('[data-go-cal]', root).onclick = () => go('calendar');
    Bookmarks.row(root); icons();
  };
}

/* ---------------- Spoiler Guard: blur thumbnails and hide summaries of episodes you have not seen ---------------- */
const Spoilers = {
  shown: new Set(),
  guarded(id, current = false, started = false) { return !!CFG.spoilerGuard && !current && !started && !isWatched(id) && !this.shown.has(id); },
  reveal(id) { this.shown.add(id); },
};

/* ---------------- Glue: one place the core player calls into ---------------- */
const PlayerPlus = {
  reset() { Failover.clear(); Rescue.reset(); Skip.reset(); XRay.hide(); SubTools.closeSync(); $('#upNext').classList.remove('countdown'); },
  started(ctx, stream) {
    P.startAt = null;
    Skip.load(ctx); DSP.started(); Rescue.watch(stream); Party.mediaChanged(); Scrobble.start(ctx, stream);
  },
  tick(t) { Skip.tick(t); SubTools.mark(); },
  /* Esc / Back inside the player closes the newest extra first */
  back() {
    if (!$('#dspPop').hidden) { $('#dspPop').hidden = true; DSP.stopDraw(); return true; }
    if (!$('#subSync').hidden) { SubTools.closeSync(); return true; }
    if (!$('#xray').hidden) { XRay.hide(); return true; }
    if (!$('#rescueBar').hidden) { $('#rescueBar').hidden = true; return true; }
    return false;
  },
};
// Remember where a stream was asked to start, so failover resumes there
{
  const base = playStream;
  playStream = async function (ctx, stream, opts = {}) {
    const r = base(ctx, stream, opts);
    if (opts && opts.startAt != null) P.startAt = opts.startAt;
    return r;
  };
}
{
  const base = renderOptMenu;
  renderOptMenu = function () {
    base(); const m = $('#optMenu');
    m.insertAdjacentHTML('afterbegin', `<h5>More</h5>
      <button type="button" data-pp="party"><i data-lucide="users"></i>${Party.code ? `Watch party · ${esc(Party.code)}` : 'Start a watch party'}</button>
      <button type="button" data-pp="cast"><i data-lucide="smartphone"></i>Send to phone or use it as a remote</button>
      <button type="button" data-pp="mark"><i data-lucide="bookmark-plus"></i>Bookmark this scene</button>`);
    $$('[data-pp]', m).forEach((b) => b.addEventListener('click', () => {
      m.hidden = true; const a = b.dataset.pp;
      if (a === 'dsp') DSP.toggle(); if (a === 'party') Party.openPanel(); if (a === 'cast') Cast.open(); if (a === 'mark') Bookmarks.add('');
    }));
    icons();
  };
}
