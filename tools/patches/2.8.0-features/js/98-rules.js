/* ---------------- 2.9.0 Lock-screen and media-key controls ----------------
   The Media Session API: the phone's lock screen and notification, Bluetooth headphones, keyboard media keys and
   Android TV remotes all show what is playing (title, episode, poster) and can play, pause, skip 10 s, seek and jump to
   the next episode. */
const MediaKeys = {
  t: 0,
  meta() {
    if (!('mediaSession' in navigator) || !P.ctx) return;
    const m = P.ctx.meta || {}, v = P.ctx.video, art = metaPoster(m), bg = metaBg(m);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: v ? `${v.name || v.title || `Episode ${v.episode}`}` : (m.name || 'MKCinema'),
        artist: v ? `${m.name} · S${v.season} · E${v.episode}` : [yearOf(m), (genresOf(m) || [])[0]].filter(Boolean).join(' · '),
        album: 'MKCinema',
        artwork: [art && { src: art, sizes: '500x750', type: 'image/jpeg' }, bg && { src: bg, sizes: '1280x720', type: 'image/jpeg' }].filter(Boolean),
      });
    } catch (e) { /* older browser */ }
    const hasNext = !!(v && typeof nextVideo === 'function' && nextVideo(m, v));
    try { navigator.mediaSession.setActionHandler('nexttrack', hasNext ? () => playNext() : null); } catch (e) { /* unsupported */ }
  },
  pos() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    const now = performance.now(); if (now - this.t < 1000) return; this.t = now;
    const d = pDur(), p = pNow(); if (!isFinite(d) || !(d > 0)) return;
    try { navigator.mediaSession.setPositionState({ duration: d, position: clamp(p, 0, d), playbackRate: video.playbackRate || 1 }); } catch (e) { /* bad state */ }
  },
  init() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession, on = (a, fn) => { try { ms.setActionHandler(a, fn); } catch (e) { /* unsupported action */ } };
    on('play', () => { if (video.paused) video.play().catch(() => {}); });
    on('pause', () => { if (!video.paused) video.pause(); });
    on('seekbackward', (d) => pSeek(pNow() - ((d && d.seekOffset) || 10)));
    on('seekforward', (d) => pSeek(pNow() + ((d && d.seekOffset) || 10)));
    on('seekto', (d) => { if (d && d.seekTime != null) pSeek(d.seekTime, { user: true }); });
    on('previoustrack', () => pSeek(0));
    on('stop', () => { if (!$('#player').hidden) closePlayer(); });
    video.addEventListener('loadedmetadata', () => this.meta());
    video.addEventListener('play', () => { this.meta(); ms.playbackState = 'playing'; });
    video.addEventListener('pause', () => { ms.playbackState = 'paused'; });
    video.addEventListener('timeupdate', () => this.pos());
    const cp = closePlayer;
    closePlayer = function () { const r = cp.apply(this, arguments); try { ms.metadata = null; ms.playbackState = 'none'; } catch (e) { /* ok */ } return r; };
  },
};
MediaKeys.init();

/* ---------------- 2.9.0 Source rules ----------------
   Your own rules for which sources Smart Play and the source list use: a size cap, a lowest resolution, no cam or
   screener copies, your own blocked words, HDR preference, and which debrid service goes first when you have several.
   If the rules would leave nothing at all, the size, resolution and HDR limits are dropped first, then the full list is used, so a film never just refuses to play. */
const SourceRules = {
  RES: { '4K UHD': 4, '1440p': 3.5, '1080p': 3, '720p': 2, SD: 1 },
  words() { return String(CFG.srWords || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean); },
  text(s) { return [s.name, s.title, s.description, s.behaviorHints && s.behaviorHints.filename].filter(Boolean).join(' '); },
  ok(s, loose) {
    const t = s._tel; if (!t || t.isTrailer || t.kind === 'yt' || s._srv) return true;
    const gb = loose ? 0 : Number(CFG.srMaxGB) || 0; if (gb && t.sizeBytes && t.sizeBytes > gb * 1073741824) return false;
    const min = loose ? 0 : this.RES[CFG.srMinRes] || 0; if (min && t.res && (this.RES[t.res] || 0) < min) return false;
    const txt = this.text(s);
    if (CFG.srNoCam !== false && (/\b(cam|camrip|hdcam|telesync|hdts|telecine|screener|dvdscr|bdscr)\b/i.test(txt) || /[\s.[(_-](ts|tc|scr|r5)[\s.\])_-]/i.test(` ${txt} `))) return false;
    const w = this.words(); if (w.length) { const low = txt.toLowerCase(); if (w.some((x) => low.includes(x))) return false; }
    if (!loose && CFG.srHdr === 'avoid' && t.hdr) return false;
    return true;
  },
  init() {
    const vis = visibleStreams;
    visibleStreams = function (streams) {
      const list = vis.apply(this, arguments);
      const kept = list.filter((s) => SourceRules.ok(s));
      if (kept.length) return kept;
      // nothing passes: drop the size, resolution and HDR limits first, and only then show everything
      const loose = list.filter((s) => SourceRules.ok(s, true));
      return loose.length ? loose : list;
    };
    const parse = Telemetry.parse.bind(Telemetry);
    Telemetry.parse = function (s) { const t = parse(s); if (CFG.srHdr === 'prefer' && t.hdr) t.score += 60; return t; };
    CFG_HOOKS.push((key) => { if (/^sr/.test(key)) { engine.clearCache(); if (!$('#detail').hidden && D.meta && typeof loadDetailStreams === 'function') loadDetailStreams(); } });
    SECTIONS.splice(SECTIONS.findIndex((s) => s.id === 'streams') + 1, 0, this.section());
    const g = SET_GROUPS.find(([n]) => n === 'Watching'); if (g) g[1].splice(g[1].indexOf('streams') + 1, 0, 'rules');
    SET_BLURB.rules = 'Size, quality, no cam copies, debrid order';
  },
  section() {
    return { id: 'rules', icon: 'sliders-horizontal', label: 'Source rules', intro: 'Decide which sources Smart Play and the source list use. If the rules would leave nothing, MKCinema falls back to every source so a film still plays.', bind: () => this.bind(), rows: () => [
      { key: 'srNoCam', label: 'Hide cam and screener copies', help: 'Recordings made in a cinema (CAM, TS, telesync) and screeners.', type: 'toggle', get: () => CFG.srNoCam !== false },
      { key: 'srMinRes', label: 'Lowest resolution', help: 'Sources below this are hidden.', type: 'select', options: [['', 'Any'], ['720p', '720p'], ['1080p', '1080p'], ['4K UHD', '4K']] },
      { key: 'srMaxGB', label: 'Largest file', help: 'Skips very large files on a slow or capped connection. 0 means no limit.', type: 'range', min: 0, max: 100, step: 5, fmt: (v) => (Number(v) ? `${v} GB` : 'No limit') },
      { key: 'srHdr', label: 'HDR and Dolby Vision', help: 'Avoid HDR on a screen that shows it washed out; prefer it on a TV that supports it.', type: 'select', options: [['', 'No preference'], ['prefer', 'Prefer HDR'], ['avoid', 'Avoid HDR']] },
      { key: 'srWords', label: 'Blocked words', help: 'Sources whose name contains any of these are hidden. Separate words with commas.', type: 'text', get: () => CFG.srWords || '', set: (v) => setCfg('srWords', v.trim()) },
      { html: () => this.debridHTML() },
    ] };
  },
  debridHTML() {
    const v = Vault.cfg(), saved = [...(v.order || []), 'ad', 'pm', 'rd', 'tb'].filter((k, i, a) => DEBRID[k] && v[k] && a.indexOf(k) === i);
    if (saved.length < 2) return '<p class="tour-note">With more than one debrid key saved, you can choose here which service goes first.</p>';
    return `<div class="srv-box"><b>Debrid order</b><small>The first service is used for torrent results.</small><div class="seat-rows">${saved.map((k, i) => `<div class="seat-row"><span class="seat-av srv-av tnum">${i + 1}</span><div><b>${esc(DEBRID[k].label)}</b></div><div class="inrow">${i ? `<button class="btn btn-ghost btn-sm" type="button" data-nav data-dfirst="${k}">Use first</button>` : '<small>In use</small>'}</div></div>`).join('')}</div></div>`;
  },
  bind() {
    $$('#setBody [data-dfirst]').forEach((b) => b.addEventListener('click', () => {
      const v = Vault.cfg(), k = b.dataset.dfirst; v.order = [k, ...(v.order || []).filter((x) => x !== k)]; Store.set('vault', v);
      engine.clearCache(); Vault.cached.clear(); renderSettingsBody(); toast(`${DEBRID[k].label} goes first`, 'ok');
    }));
  },
};
SourceRules.init();
