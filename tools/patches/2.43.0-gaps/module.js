'use strict';
/* =====================================================================
   MKCinema 2.43.0
   · Sound modes (Original, Clear voices, Night) with one clean picker in the player's Audio tab
   · Audio delay, clearer
   · More like this on every film and series page
   · The next episode's source is found before the current one ends
   · Addon extras (all optional, all documented in docs/addon-extras.md):
       playback events  manifest.mkcinema.progress  -> POST {base}/mkcinema/progress
       skip times       resource "skips"            -> GET  {base}/skips/{type}/{id}.json
       device info      manifest.mkcinema.device    -> stream requests carry what this device can play
   ===================================================================== */

/* ---------------- Permissions for addons, kept in the same map as Addon looks ---------------- */
const AddonPerm = {
  KEY: 'addonLooksOk',
  all() { const v = Store.raw.get(this.KEY, {}); return v && typeof v === 'object' ? v : {}; },
  get(aid, k) { const r = this.all()[aid]; return r ? r[k] : undefined; },
  set(aid, k, v) { const m = this.all(); m[aid] = { ...(m[aid] || {}), [k]: v }; Store.raw.set(this.KEY, m); },
  ext(a) { const x = a && a.manifest && a.manifest.mkcinema; return x && typeof x === 'object' ? x : {}; },
  /* what an addon asks for: playback events need a yes, device info is on unless switched off */
  asks(a) {
    if (!a || !a.manifest || a.virtual) return [];
    const x = this.ext(a), out = [];
    if (x.progress) out.push('progress');
    if (x.device) out.push('device');
    return out;
  },
  ok(a, k) {
    const v = this.get(a.manifest.id, k);
    return k === 'device' ? v !== false : v === true;
  },
};

/* ---------------- Sound modes ----------------
   They run on the same audio graph as Volume boost. Rules that keep them from ever freezing the player:
   · picking a mode is the only thing that may reconnect a stream, and only after the host said yes to a CORS check
   · the audio graph is attached only while the audio engine is running (Android Chrome stalls video otherwise)
   · if a reconnected stream does not start within 9 s, it plays again normally and that host is left alone
   · Original always works at once, with no reload */
const SoundModes = {
  LIST: [
    { k: 'original', label: 'Original', note: 'The mix as it was made', icon: 'clapperboard', hp: 10, f: 2200, eq: 0, comp: null, makeup: 0 },
    { k: 'voices', label: 'Clear voices', note: 'Dialogue forward, rumble trimmed', icon: 'message-square-text', hp: 110, f: 2600, eq: 5, comp: { threshold: -26, knee: 10, ratio: 3, attack: 0.005, release: 0.2 }, makeup: 3 },
    { k: 'night', label: 'Night', note: 'Quiet lines louder, loud scenes softer', icon: 'moon', hp: 60, f: 2400, eq: 2.5, comp: { threshold: -40, knee: 20, ratio: 8, attack: 0.003, release: 0.35 }, makeup: 10 },
  ],
  need: false, pending: null, wd: 0, bad: new Set(),
  cur() { return this.LIST.find((x) => x.k === CFG.soundMode) || this.LIST[0]; },
  live() { return !!(DSP.attached && DSP.n); },
  ctxRunning() { return !!(DSP.ctx && DSP.ctx.state === 'running'); },
  /* called from a tap, so the browser lets the audio engine start */
  wake() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      DSP.ctx = DSP.ctx || new AC();
      if (DSP.ctx.state !== 'running') DSP.ctx.resume().catch(() => {});
      return true;
    } catch (e) { return false; }
  },
  apply(instant) {
    const n = DSP.n; if (!n || !DSP.ctx) return;
    const p = this.cur(), t = DSP.ctx.currentTime, k = instant ? 0.001 : 0.08, set = (prm, v) => { prm.cancelScheduledValues(t); prm.setTargetAtTime(v, t, k); };
    const c = p.comp || { threshold: 0, knee: 0, ratio: 1, attack: 0.003, release: 0.25 };
    set(n.hp.frequency, p.hp); n.eq.frequency.setValueAtTime(p.f, t); set(n.eq.gain, p.eq);
    set(n.comp.threshold, c.threshold); set(n.comp.knee, c.knee); set(n.comp.ratio, c.ratio);
    n.comp.attack.setValueAtTime(c.attack, t); n.comp.release.setValueAtTime(c.release, t);
    set(n.makeup.gain, Math.pow(10, p.makeup / 20)); set(n.dry.gain, 1); set(n.wet.gain, 0);
  },
  host(s) { try { return new URL(s.url).host; } catch (e) { return ''; } },
  /* attach to what is playing now, if that can be done without a reload */
  tryNow() {
    if (this.live()) { this.apply(); return true; }
    if (!DSP.clean() || !this.ctxRunning()) return false;
    if (!DSP.attach()) return false;
    this.apply(true); return true;
  },
  state() {
    if (this.cur().k === 'original') return 'off';
    if (this.live()) return 'on';
    const s = P.stream;
    if (!s || !s.url || (s && this.bad.has(this.host(s)))) return 'blocked';
    return 'ready';
  },
  async pick(k) {
    if (!this.LIST.some((x) => x.k === k)) return;
    setCfg('soundMode', k); this.wake();
    if (k === 'original') { if (this.live()) this.apply(); toast('Original sound', 'info', 1200, 'sndm'); this.redraw(); return; }
    const label = this.cur().label;
    if (this.tryNow()) { toast(`${label} on`, 'ok', 1200, 'sndm'); this.redraw(); return; }
    // the engine may still be starting from this tap: give it a moment before reconnecting anything
    if (DSP.clean()) { setTimeout(() => { if (this.tryNow()) toast(`${label} on`, 'ok', 1200, 'sndm'); else toast('Tap the mode once more to start it', 'info', 2600, 'sndm'); this.redraw(); }, 350); return; }
    const s = P.stream;
    if (!s || !s.url || s._local || P.hls) { toast('Sound modes aren’t available for this source', 'err', 3000, 'sndm'); this.redraw(); return; }
    if (this.bad.has(this.host(s))) { toast('This source doesn’t allow sound modes. Another source will.', 'err', 4200, 'sndm'); this.redraw(); return; }
    this.need = true; await DSP.prepare(s);
    if (P.stream !== s) return;
    if (s._cors === 'none') { this.bad.add(this.host(s)); toast('This source doesn’t allow sound modes. Another source will.', 'err', 4200, 'sndm'); this.redraw(); return; }
    this.pending = s; toast(`Starting ${label}…`, 'info', 2200, 'sndm');
    this.watch(s); playStream(P.ctx, s, { startAt: pNow() });
  },
  /* a reconnect that does not play in time goes back to playing normally */
  watch(s) {
    clearTimeout(this.wd);
    this.wd = setTimeout(() => {
      if (this.pending !== s || P.stream !== s || video.readyState >= 3) return;
      this.pending = null; this.need = false; this.bad.add(this.host(s));
      if (DSP.attached) return; // the graph owns the element now; Failover and the source list take it from here
      s._cors = null; toast('This source didn’t accept sound modes. Playing it normally.', 'info', 4200, 'sndm');
      playStream(P.ctx, s, { startAt: pNow() });
    }, 9000);
  },
  playing() {
    if (this.pending && this.pending === P.stream) { this.pending = null; clearTimeout(this.wd); }
    if (this.cur().k === 'original' || this.live()) return;
    if (!DSP.clean()) return;
    if (this.ctxRunning()) { if (this.tryNow()) this.redraw(); }
  },
  redraw() { const m = $('#optMenu'); if (m && !m.hidden && PxMenu.tab === 'audio') renderOptMenu(); },
  html() {
    if (!P.stream || (typeof TvPlayer !== 'undefined' && TvPlayer.cur)) return '';
    const cur = this.cur().k, st = this.state();
    const line = { off: '', on: '', ready: 'Starts when you pick it.', blocked: 'This source can’t use sound modes. Original sound plays.' }[st];
    return `<div class="snd-modes" role="radiogroup" aria-label="Sound mode">${this.LIST.map((x) => `<button type="button" role="radio" aria-checked="${x.k === cur}" class="snd-m${x.k === cur ? ' on' : ''}" data-sndm="${x.k}"><i data-lucide="${x.icon}"></i><b>${esc(x.label)}</b><small>${esc(x.note)}</small></button>`).join('')}</div>${line ? `<p class="px-note snd-st ${st}">${esc(line)}</p>` : ''}`;
  },
  bind(m) { $$('[data-sndm]', m).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.pick(b.dataset.sndm); })); },
  init() {
    if (!CFG.soundMode) CFG.soundMode = 'original';
    DSP.apply = function () { SoundModes.apply(true); };
    const w = DSP.wants.bind(DSP); DSP.wants = function () { return w() || SoundModes.need; };
    video.addEventListener('playing', () => this.playing());
    // the Audio tab: Volume, then the modes, then the rest
    const ph = PxAudio.html.bind(PxAudio), pb = PxAudio.bind.bind(PxAudio);
    PxAudio.html = function () {
      const h = ph(), body = SoundModes.html(); if (!body) return h;
      // inside the Volume group (no heading of its own), so it sits right under the volume steps
      const mine = `<div class="snd-h">Sound mode</div>${body}`;
      return h.includes('<h5>Listen on phone</h5>') ? h.replace('<h5>Listen on phone</h5>', `${mine}<h5>Listen on phone</h5>`) : h + mine;
    };
    PxAudio.bind = function (m) { pb(m); SoundModes.bind(m); };
  },
};

/* ---------------- Audio delay: one clear control ---------------- */
const AudioDelay = {
  init() {
    if (typeof AudioSync === 'undefined') return;
    AudioSync.html = function () {
      const ms = this.ms;
      return `<h5>Audio delay · ${ms ? `${ms} ms` : 'off'}</h5><div class="seg-row" data-async><button type="button" data-asd="-50" aria-label="Less delay">−50</button><button type="button" data-asd="0" title="Reset">${ms ? `${ms} ms` : '0 ms'}</button><button type="button" data-asd="50" aria-label="More delay">+50</button><button type="button" data-asd="250">+250</button></div>
      <p class="as-note">For voices that come before lips move. If the sound comes late, it’s usually Bluetooth headphones: your phone or TV corrects that itself, and VLC can shift sound either way.</p>`;
    };
  },
};

/* ---------------- More like this ----------------
   Films in the same universe first, then TMDB or Trakt picks when you have a key, then titles that share
   the most genres from a similar year (works for everyone, no key). Films and series alike. */
const MoreLike = {
  cache: new Map(), busy: new Map(),
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  async universe(m) {
    if (m.type !== 'movie' || typeof Universes === 'undefined') return [];
    try { await Universes.load(); } catch (e) { return []; }
    const u = (Universes.data || []).find((x) => (x.films || []).some((f) => f.id === m.id)); if (!u) return [];
    return u.films.filter((f) => f.id !== m.id).map((f) => ({ id: f.id, type: 'movie', name: f.name, poster: f.poster, releaseInfo: String(f.year || '') }));
  },
  async tmdb(m) {
    if (!TMDB.key() || !String(m.id).startsWith('tt')) return [];
    const kind = m.type === 'series' ? 'tv' : 'movie';
    const f = await TMDB.find(String(m.id).split(':')[0]).catch(() => null);
    const hit = f && (f[`${kind}_results`] || [])[0]; if (!hit) return [];
    const r = await TMDB.get(`${kind}/${hit.id}/recommendations`).catch(() => null);
    const list = ((r && r.results) || []).slice(0, 14);
    const out = await Promise.all(list.map(async (x) => {
      const ids = await TMDB.get(`${kind}/${x.id}/external_ids`).catch(() => null);
      const tt = ids && ids.imdb_id; if (!tt) return null;
      return { id: tt, type: m.type, name: x.title || x.name, poster: x.poster_path ? `https://image.tmdb.org/t/p/w342${x.poster_path}` : undefined, releaseInfo: String(x.release_date || x.first_air_date || '').slice(0, 4) };
    }));
    return out.filter(Boolean);
  },
  async trakt(m) {
    const c = Trakt.cfg(); if (!c.clientId || !String(m.id).startsWith('tt')) return [];
    const kind = m.type === 'series' ? 'shows' : 'movies';
    const j = await Trakt.api(`/${kind}/${String(m.id).split(':')[0]}/related?limit=18`).catch(() => null);
    return (Array.isArray(j) ? j : []).filter((x) => x && x.ids && x.ids.imdb).map((x) => ({ id: x.ids.imdb, type: m.type, name: x.title, releaseInfo: String(x.year || '') }));
  },
  async genre(m) {
    const gs = genresOf(m).slice(0, 2); if (!gs.length) return [];
    const cm = engine.addons.find((a) => a.enabled && /v3-cinemeta/.test(a.baseUrl)); if (!cm) return [];
    const yr = parseInt(yearOf(m), 10) || 0, mine = new Set(genresOf(m));
    const lists = await Promise.all(gs.map((g) => engine.call(cm, 'catalog', m.type, 'top', { genre: g }).then((r) => r.metas || []).catch(() => [])));
    const seen = new Map();
    lists.flat().forEach((x) => {
      if (!x || !x.id || x.id === m.id) return;
      const share = genresOf(x).filter((g) => mine.has(g)).length, y = parseInt(yearOf(x), 10) || yr;
      const rate = parseFloat(x.imdbRating) || 6, score = share * 10 - Math.min(10, Math.abs(y - yr) / 3) + (rate - 6) * 3 - (rate < 6.5 ? 8 : 0);
      const prev = seen.get(x.id); if (!prev || prev.score < score) seen.set(x.id, { x, score });
    });
    return [...seen.values()].sort((a, b) => b.score - a.score).map((v) => v.x);
  },
  async load(m) {
    if (this.cache.has(m.id)) return this.cache.get(m.id);
    if (this.busy.has(m.id)) return this.busy.get(m.id);
    const p = (async () => {
      const parts = await Promise.all([this.universe(m), this.tmdb(m).catch(() => []), this.trakt(m).catch(() => [])]);
      let out = parts.flat();
      if (out.length < 12) out = out.concat(await this.genre(m).catch(() => []));
      const ids = new Set([m.id]), list = [];
      out.forEach((x) => { if (x && x.id && !ids.has(x.id)) { ids.add(x.id); list.push(x); } });
      const res = list.slice(0, 24);
      this.cache.set(m.id, res); if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value);
      return res;
    })();
    this.busy.set(m.id, p); p.finally(() => this.busy.delete(m.id));
    return p;
  },
  place(loading) {
    const m = D.meta, panel = $('#detailPanel'); if (!m || !panel || this.kids()) return;
    const bodies = $$(':scope > .d-body', panel), host = bodies[bodies.length - 1]; if (!host) return;
    let sec = $('#dMore', panel);
    if (!sec) {
      sec = document.createElement('section'); sec.className = 'row ml-row'; sec.id = 'dMore';
      sec.innerHTML = `<div class="row-head"><h2 class="row-title">More like this</h2></div><div class="rail">${skeletons(6)}</div>`;
      host.appendChild(sec);
    }
    if (loading) return;
    const id = m.id, have = this.cache.get(id);
    const draw = (list) => {
      if (!D.meta || D.meta.id !== id || !sec.isConnected) return;
      if (!list.length) { sec.remove(); return; }
      if (sec.dataset.for === id) return;
      sec.dataset.for = id; fillRail(sec, list.map((x) => cardHTML(x)).join(''));
    };
    if (have) draw(have); else this.load(m).then(draw).catch(() => { if (sec.isConnected) sec.remove(); });
  },
  init() {
    const rd = renderDetail;
    renderDetail = function (loading) {
      const r = rd.apply(this, arguments);
      try { MoreLike.place(loading); } catch (e) { console.warn('More like this skipped:', e.message); }
      return r;
    };
  },
};

/* ---------------- Next episode, found early ----------------
   Four minutes before the end (or at 90 %), the next episode's sources are fetched and the best one picked,
   in the same source group. Its host is warmed so Up next starts at once. Nothing is downloaded. */
const NextPrefetch = {
  got: null, busy: '',
  key(ctx) { return ctx && ctx.video ? videoIdFor(ctx.meta, ctx.video) : ''; },
  tick(t) {
    const ctx = P.ctx; if (!ctx || !ctx.video || ctx.meta.type !== 'series' || !P.stream) return;
    const d = pDur(); if (!isFinite(d) || d < 300) return;
    if (d - t > Math.max(240, d * 0.1)) return;
    const nv = nextVideo(ctx.meta, ctx.video); if (!nv) return;
    const id = videoIdFor(ctx.meta, nv);
    if (this.busy === id || (this.got && this.got.id === id)) return;
    this.busy = id; this.fetch(ctx.meta, id, P.stream).finally(() => { if (this.busy === id) this.busy = ''; });
  },
  async fetch(meta, id, cur) {
    const group = cur && cur.behaviorHints && cur.behaviorHints.bingeGroup;
    try {
      const { streams } = await engine.fetchStreams('series', id);
      const pick = pickBest(streams, { bingeGroup: group }); if (!pick) return;
      this.got = { id, streams, pick, at: Date.now() };
      this.warm(pick);
    } catch (e) { /* the normal path fetches again when it is time */ }
  },
  warm(s) {
    if (!s || !s.url || s._local || /^magnet:/.test(s.url)) return;
    let u; try { u = new URL(s.url); } catch (e) { return; }
    if (!$(`link[rel="preconnect"][href="${u.origin}"]`)) { const l = document.createElement('link'); l.rel = 'preconnect'; l.href = u.origin; l.crossOrigin = 'anonymous'; document.head.appendChild(l); }
    const c = navigator.connection; if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
    // resolver links (debrid addons) do their work on the first request: start it, then stop as soon as headers arrive
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 6000);
    fetch(s.url, { mode: 'no-cors', signal: ac.signal, credentials: 'omit', cache: 'no-store' }).then(() => ac.abort()).catch(() => {}).finally(() => clearTimeout(t));
  },
  take(id) {
    const g = this.got; if (!g || g.id !== id || Date.now() - g.at > 20 * 60 * 1000) return null;
    this.got = null; return g;
  },
  init() {
    const pe = playEpisode;
    playEpisode = async function (v) {
      const meta = P.ctx && P.ctx.meta; if (!meta) return pe.apply(this, arguments);
      const g = NextPrefetch.take(videoIdFor(meta, v));
      if (!g) return pe.apply(this, arguments);
      toast(`Playing S${v.season} · E${v.episode}`, 'info', 1500);
      playStream({ meta, video: v, streams: g.streams }, g.pick);
    };
  },
};

/* ---------------- Device info for addons that ask (manifest.mkcinema.device) ----------------
   Added to that addon's stream requests as Stremio "extra" values, so it can list what plays here first. */
const AddonDevice = {
  memo: null,
  get() {
    if (this.memo) return this.memo;
    const ms = (t) => { try { return !!(window.MediaSource && MediaSource.isTypeSupported(t)); } catch (e) { return false; } };
    const el = document.createElement('video'), can = (t) => { try { return !!el.canPlayType(t); } catch (e) { return false; } };
    const native = typeof TvPlayer !== 'undefined' && TvPlayer.on();
    const v = native ? ['h264', 'hevc', 'vp9', 'av1'] : [['h264', 'video/mp4; codecs="avc1.640028"'], ['hevc', 'video/mp4; codecs="hvc1.1.6.L120.90"'], ['vp9', 'video/webm; codecs="vp9"'], ['av1', 'video/mp4; codecs="av01.0.08M.08"']].filter(([, t]) => ms(t) || can(t)).map(([k]) => k);
    const a = native ? ['aac', 'ac3', 'eac3', 'opus', 'flac', 'dts'] : [['aac', 'audio/mp4; codecs="mp4a.40.2"'], ['ac3', 'audio/mp4; codecs="ac-3"'], ['eac3', 'audio/mp4; codecs="ec-3"'], ['opus', 'audio/webm; codecs="opus"'], ['flac', 'audio/mp4; codecs="flac"'], ['dts', 'audio/mp4; codecs="dtsc"']].filter(([, t]) => ms(t) || can(t)).map(([k]) => k);
    const h = Math.round((screen.height || 1080) * (window.devicePixelRatio || 1)), w = Math.round((screen.width || 1920) * (window.devicePixelRatio || 1)), long = Math.max(h, w);
    const ext = (() => { try { return CFG.alwaysExternal || CFG.playerMode === 'external'; } catch (e) { return false; } })();
    this.memo = {
      player: ext ? 'external' : native ? 'tv' : 'web',
      video: v.join(','), audio: a.join(','),
      mkv: native || can('video/x-matroska') ? '1' : '0',
      hdr: native || (window.matchMedia && matchMedia('(dynamic-range: high)').matches) ? '1' : '0',
      maxres: long >= 3000 ? '2160' : long >= 1800 ? '1080' : '720',
    };
    return this.memo;
  },
  url(b, type, id) {
    const d = this.get(), q = Object.entries(d).filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return `${b}/stream/${type}/${encodeURIComponent(id)}/${q}.json`;
  },
  init() {
    const call = engine.call;
    engine.call = function (addon, resource, type, id, extra) {
      if (resource === 'stream' && addon && !addon.virtual && addon.manifest && AddonPerm.ext(addon).device && AddonPerm.ok(addon, 'device')) {
        return this.http(AddonDevice.url(addon.baseUrl, type, id), { ttl: 2 * 60 * 1000 });
      }
      return call.apply(this, arguments);
    };
  },
};

/* ---------------- Playback events for addons that ask (manifest.mkcinema.progress) ----------------
   Sent only after the viewer says yes for that addon. A plain-text POST (no preflight), so any host can take it.
   Never sends stream links, keys, account or device ids: just what is playing and where. */
const AddonEvents = {
  ctx: null, stream: null, started: false, lastBeat: 0, sentEnd: false, beganAt: 0, held: null,
  targets(ctx) {
    const id = ctx.video ? videoIdFor(ctx.meta, ctx.video) : ctx.meta.id, type = ctx.meta.type;
    return engine.addons.filter((a) => {
      if (!a.enabled || a.virtual || !a.manifest) return false;
      const p = AddonPerm.ext(a).progress; if (!p || !AddonPerm.ok(a, 'progress')) return false;
      const types = (p && p.types) || a.manifest.types || [], pre = (p && p.idPrefixes) || a.manifest.idPrefixes || [];
      if (types.length && !types.includes(type)) return false;
      if (pre.length && !pre.some((x) => String(id).startsWith(x) || String(ctx.meta.id).startsWith(x))) return false;
      return true;
    });
  },
  body(event, a, pos, dur) {
    const ctx = this.ctx, v = ctx.video, s = this.stream || {};
    const pct = dur > 0 ? Math.min(100, Math.round(pos / dur * 1000) / 10) : 0;
    const b = {
      v: 1, event, type: ctx.meta.type, id: ctx.meta.id, name: ctx.meta.name || '',
      videoId: v ? videoIdFor(ctx.meta, v) : ctx.meta.id, season: v ? Number(v.season) : undefined, episode: v ? Number(v.episode) : undefined,
      position: Math.round(pos), duration: Math.round(dur), percent: pct, finished: event === 'end' || pct >= 90,
      at: new Date().toISOString(), app: 'MKCinema', appVersion: APP_VERSION,
    };
    // the addon learns which of ITS OWN results is playing, never another addon's
    if (s._addonId && s._addonId === a.manifest.id) {
      const bh = s.behaviorHints || {};
      b.stream = { infoHash: s.infoHash || undefined, fileIdx: s.fileIdx != null ? s.fileIdx : undefined, filename: bh.filename || undefined, bingeGroup: bh.bingeGroup || undefined };
    }
    return JSON.stringify(b);
  },
  send(event, pos, dur) {
    const ctx = this.ctx; if (!ctx) return;
    const list = this.targets(ctx); if (!list.length) return;
    list.forEach((a) => {
      const url = `${a.baseUrl}/mkcinema/progress`, body = this.body(event, a, pos, dur);
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
      } catch (e) { /* fall back */ }
      fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body }).catch(() => {});
    });
  },
  now() { return [pNow() || 0, pDur() || 0]; },
  vid(ctx) { return ctx && ctx.meta ? (ctx.video ? videoIdFor(ctx.meta, ctx.video) : ctx.meta.id) : ''; },
  begin(ctx, stream) {
    if (!ctx || !ctx.meta || (stream && (stream._local || (stream._tel && stream._tel.isTrailer)))) { this.flush(); this.ctx = null; return; }
    // a reconnect of the same title (sound mode, volume boost, another source) carries on the same session
    const h = this.held;
    if (h && h.vid === this.vid(ctx)) { clearTimeout(h.t); this.held = null; this.ctx = ctx; this.stream = stream; this.started = true; this.beganAt = Date.now(); return; }
    this.flush();
    this.ctx = ctx; this.stream = stream; this.started = true; this.lastBeat = Date.now(); this.beganAt = Date.now(); this.sentEnd = false;
    const [p, d] = this.now(); this.send('start', p, d);
  },
  /* teardown: hold the stop for a moment, in case the same title starts again straight away */
  stop() {
    if (!this.ctx || !this.started) return;
    const [p, d] = this.now(), ctx = this.ctx, stream = this.stream, sentEnd = this.sentEnd;
    this.flush();
    this.held = { vid: this.vid(ctx), ctx, stream, p, d, sentEnd, t: setTimeout(() => this.flush(), 2500) };
    this.ctx = null; this.started = false;
  },
  flush() {
    const h = this.held; if (!h) return; this.held = null; clearTimeout(h.t);
    if (h.sentEnd) return;
    const keep = [this.ctx, this.stream]; this.ctx = h.ctx; this.stream = h.stream; this.send('stop', h.p, h.d); [this.ctx, this.stream] = keep;
  },
  init() {
    const st = PlayerPlus.started.bind(PlayerPlus);
    PlayerPlus.started = function (ctx, stream) { const r = st.apply(this, arguments); try { AddonEvents.stop(); AddonEvents.begin(ctx, stream); } catch (e) { /* never block playback */ } return r; };
    video.addEventListener('pause', () => { if (this.ctx && !video.ended) { const [p, d] = this.now(); this.send('pause', p, d); } });
    video.addEventListener('play', () => { if (this.ctx && video.currentTime > 1 && Date.now() - this.beganAt > 3000) { const [p, d] = this.now(); this.send('resume', p, d); } });
    video.addEventListener('ended', () => { if (this.ctx && !this.sentEnd) { this.sentEnd = true; const [, d] = this.now(); this.send('end', d, d); } });
    video.addEventListener('timeupdate', () => {
      if (!this.ctx || video.paused || Date.now() - this.lastBeat < 5 * 60 * 1000) return;
      this.lastBeat = Date.now(); const [p, d] = this.now(); this.send('progress', p, d);
    });
    const td = teardown; teardown = function () { try { AddonEvents.stop(); } catch (e) { /* ignore */ } return td.apply(this, arguments); };
    window.addEventListener('pagehide', () => { this.stop(); this.flush(); });
    // the TV app's own player
    if (typeof TvPlayer !== 'undefined') {
      const sv = TvPlayer.save.bind(TvPlayer);
      TvPlayer.save = function (pos, dur) {
        const c = this.cur;
        try {
          if (c && dur > 0) {
            const keep = AddonEvents.ctx; AddonEvents.ctx = c.ctx; AddonEvents.stream = c.stream;
            AddonEvents.send(pos / dur >= 0.98 ? 'end' : 'stop', pos / 1000, dur / 1000); AddonEvents.ctx = keep;
          }
        } catch (e) { /* ignore */ }
        return sv.apply(this, arguments);
      };
      const lu = loadUrl;
      loadUrl = function (stream, startAt) {
        const r = lu.apply(this, arguments);
        setTimeout(() => { const c = TvPlayer.cur; if (c && c.stream === stream && !c._mkEv) { c._mkEv = true; const keep = AddonEvents.ctx; AddonEvents.ctx = c.ctx; AddonEvents.stream = stream; AddonEvents.send('start', startAt || 0, 0); AddonEvents.ctx = keep; } }, 1500);
        return r;
      };
    }
  },
};

/* ---------------- Skip times from addons (the "skips" resource) ----------------
   Same shape as the open proposal for Stremio's addon SDK, so one addon can serve both:
   { skips: [{ id, startMs, endMs, category, severity?, description?, action? }] }.
   intro / outro / recap fill the Skip button; content categories follow Settings › Playback (off by default). */
const AddonSkips = {
  CONTENT: ['nudity', 'sex', 'violence', 'language', 'drugs', 'fear'],
  KNOWN: ['nudity', 'sex', 'violence', 'language', 'drugs', 'fear', 'intro', 'outro', 'recap', 'ad'],
  LEVEL: { low: 1, medium: 2, high: 3 },
  segs: [], token: 0, used: new Set(), btn: null, showing: null,
  mode() { const v = CFG.contentSkips || (MoreLike.kids() ? 'auto' : 'off'); return ['off', 'ask', 'auto'].includes(v) ? v : 'off'; },
  min() { return this.LEVEL[CFG.contentSkipLevel] || 1; },
  clean(list, from) {
    return (Array.isArray(list) ? list : []).slice(0, 200).map((x) => {
      if (!x || typeof x !== 'object') return null;
      const s = Number(x.startMs) / 1000, e = Number(x.endMs) / 1000, cat = String(x.category || '').toLowerCase();
      if (!isFinite(s) || !isFinite(e) || s < 0 || e <= s || e - s > 4 * 3600 || !this.KNOWN.includes(cat)) return null;
      return { s, e, cat, sev: this.LEVEL[String(x.severity || '').toLowerCase()] || 2, note: String(x.description || '').slice(0, 80), act: x.action === 'warn' ? 'warn' : 'skip', from };
    }).filter(Boolean);
  },
  async load(ctx) {
    const token = ++this.token; this.segs = []; this.used.clear(); this.hide();
    if (CFG.addonSkips === false || !ctx || !ctx.meta) return;
    const type = ctx.meta.type, id = ctx.video ? videoIdFor(ctx.meta, ctx.video) : ctx.meta.id;
    const cands = engine.addons.filter((a) => !a.virtual && engine.supports(a, 'skips', type, id)); if (!cands.length) return;
    const res = await Promise.all(cands.map((a) => engine.call(a, 'skips', type, id).then((r) => this.clean(r && r.skips, a.manifest.name)).catch(() => [])));
    if (token !== this.token) return;
    this.segs = res.flat().sort((a, b) => a.s - b.s);
    // intro and end credits fill gaps left by chapters and AniSkip
    const intro = this.segs.find((x) => x.cat === 'intro'), outro = this.segs.find((x) => x.cat === 'outro');
    if (intro && !(Skip.m && Skip.m.intro)) Skip.m = { ...(Skip.m || {}), intro: [intro.s, intro.e], src: intro.from };
    if (outro && !(Skip.m && Skip.m.credits)) Skip.m = { ...(Skip.m || {}), credits: outro.s, ed: [outro.s, outro.e], src: (Skip.m && Skip.m.src) || outro.from };
  },
  wanted(x) {
    if (x.cat === 'recap') return 'ask';
    if (x.cat === 'ad') return 'auto';
    if (!this.CONTENT.includes(x.cat)) return '';
    const m = this.mode(); if (m === 'off' || x.sev < this.min()) return '';
    return m === 'auto' && x.act !== 'warn' ? 'auto' : 'ask';
  },
  LABEL: { recap: 'Skip recap', ad: 'Skip ad', nudity: 'Skip scene', sex: 'Skip scene', violence: 'Skip scene', language: 'Skip scene', drugs: 'Skip scene', fear: 'Skip scene' },
  tick(t) {
    if (!this.segs.length || P.locked) { this.hide(); return; }
    const x = this.segs.find((g) => t >= g.s && t < g.e - 0.5 && this.wanted(g));
    if (!x) { this.hide(); return; }
    const how = this.wanted(x), key = `${x.s}:${x.cat}`;
    if (how === 'auto') {
      if (this.used.has(key)) return; this.used.add(key);
      pSeek(x.e, { user: false }); toast(`Skipped ${x.note || 'a scene'} · ${x.from}`, 'info', 2600, 'segskip'); return;
    }
    this.show(x);
  },
  show(x) {
    if (this.showing === x) return;
    const b = this.btn || (this.btn = (() => {
      const base = $('#skipBtn'); if (!base) return null;
      const n = base.cloneNode(true); n.id = 'segSkipBtn'; n.hidden = true; base.after(n);
      n.addEventListener('click', (e) => { e.stopPropagation(); const g = this.showing; if (g) { this.used.add(`${g.s}:${g.cat}`); pSeek(g.e, { user: true }); } this.hide(); });
      return n;
    })());
    if (!b || (Skip.visible && Skip.visible())) return;
    this.showing = x; const sp = b.querySelector('span'); if (sp) sp.textContent = this.LABEL[x.cat] || 'Skip'; b.title = x.note ? `${x.note} (${x.from})` : x.from; b.hidden = false;
  },
  hide() { this.showing = null; if (this.btn) this.btn.hidden = true; },
  rows() {
    return [
      { group: 'Scene skips from addons' },
      { key: 'addonSkips', label: 'Use skip times from addons', help: 'Addons that know where intros, recaps and credits are can add them to the Skip button. Install one and it just works.', type: 'toggle', get: () => CFG.addonSkips !== false },
      { key: 'contentSkips', label: 'Scenes addons mark', help: 'Some addons mark scenes with nudity, violence, strong language, drugs or scares. Choose what happens when one comes up. Kids seats skip them by default.', type: 'select', options: [['off', 'Play them'], ['ask', 'Show a Skip button'], ['auto', 'Skip them']], get: () => this.mode() },
      { key: 'contentSkipLevel', label: 'Which ones', type: 'select', options: [['low', 'Every marked scene'], ['medium', 'Moderate and strong'], ['high', 'Only strong']], get: () => CFG.contentSkipLevel || 'low' },
    ];
  },
  init() {
    const st = PlayerPlus.started.bind(PlayerPlus), tk = PlayerPlus.tick.bind(PlayerPlus), rs = PlayerPlus.reset.bind(PlayerPlus);
    PlayerPlus.started = function (ctx) { const r = st.apply(this, arguments); AddonSkips.load(ctx).catch(() => {}); return r; };
    PlayerPlus.tick = function (t) { const r = tk.apply(this, arguments); try { AddonSkips.tick(t); NextPrefetch.tick(t); } catch (e) { /* never block playback */ } return r; };
    PlayerPlus.reset = function () { AddonSkips.token++; AddonSkips.segs = []; AddonSkips.hide(); return rs.apply(this, arguments); };
    const pb = secById('playback'); if (pb) { const rows = pb.rows; pb.rows = () => [...rows(), ...this.rows()]; }
  },
};

/* ---------------- The Addons screen: what each addon is allowed to do ---------------- */
const AddonPermUI = {
  TEXT: {
    progress: ['Tell it what you watch', 'Lets this addon keep your progress or history on its side: what is playing, and where you stopped. Never your links, keys or account.'],
    device: ['Tell it what this device plays', 'Lets this addon put sources that play here first (codecs, screen size). Nothing that identifies you.'],
  },
  html(a) {
    const asks = AddonPerm.asks(a); if (!asks.length) return '';
    return `<div class="mk-perm">${asks.map((k) => { const on = AddonPerm.ok(a, k), [l, h] = this.TEXT[k]; return `<div class="mk-perm-r"><span><b>${esc(l)}</b><small>${esc(h)}</small></span><button class="switch ${on ? 'on' : ''}" type="button" data-nav data-mkperm="${esc(k)}" data-aid="${esc(a.manifest.id)}" role="switch" aria-checked="${on}" aria-label="${esc(l)}"></button></div>`; }).join('')}</div>`;
  },
  draw() {
    const cards = $$('#addonList > .addon'); if (cards.length !== engine.addons.length) return;
    cards.forEach((c, i) => {
      const a = engine.addons[i], h = this.html(a); if (!h || $('.mk-perm', c)) return;
      const at = $('.url', c); if (at) at.insertAdjacentHTML('afterend', h);
    });
    $$('#addonList [data-mkperm]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.mkperm, aid = b.dataset.aid, a = engine.addons.find((x) => x.manifest && x.manifest.id === aid); if (!a) return;
      const on = !AddonPerm.ok(a, k); AddonPerm.set(aid, k, on);
      b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
      if (k === 'device') AddonDevice.memo = null;
    }));
  },
  /* the first time an addon asks to hear what you watch, a short question at install */
  ask(a) {
    if (!a || !AddonPerm.ext(a).progress || AddonPerm.get(a.manifest.id, 'progress') !== undefined) return;
    const box = document.createElement('div'); box.className = 'toast glass-solid t-info mk-ask'; box.setAttribute('role', 'dialog');
    box.innerHTML = `<i data-lucide="activity"></i><span><b>${esc(a.manifest.name)}</b> asks to know what you watch, to keep your progress on its side. It never sees your links or keys.</span><span class="mk-ask-b"><button class="btn btn-prime btn-sm" type="button" data-nav data-y>Allow</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-n>Not now</button></span>`;
    $('#toasts').appendChild(box); icons();
    const done = (v) => { AddonPerm.set(a.manifest.id, 'progress', v); box.remove(); if (typeof renderAddons === 'function' && $('#addonList')) try { renderAddons(); } catch (e) { /* not on screen */ } };
    $('[data-y]', box).onclick = () => done(true); $('[data-n]', box).onclick = () => done(false);
    setTimeout(() => { if (box.isConnected) box.remove(); }, 30000);
  },
  init() {
    const ra = renderAddons;
    renderAddons = function () { const r = ra.apply(this, arguments); try { AddonPermUI.draw(); } catch (e) { /* the list still works */ } return r; };
    const ia = installAddon;
    installAddon = async function () { const a = await ia.apply(this, arguments); try { AddonPermUI.ask(a); } catch (e) { /* ignore */ } return a; };
  },
};

[SoundModes, AudioDelay, MoreLike, NextPrefetch, AddonDevice, AddonEvents, AddonSkips, AddonPermUI].forEach((m) => {
  try { m.init(); } catch (e) { try { MKLog.add('error', `2.43 ${Object.keys(m)[0]}: ${e.message}`); } catch (_) { /* no log */ } console.warn('2.43 module skipped', e); }
});
