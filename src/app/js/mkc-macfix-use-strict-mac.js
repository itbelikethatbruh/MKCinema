
'use strict';
/* ---------------- 2.66.1 Mac player fixes ----------------
   1) The error screen's links follow your pick. When a source fails and MKCinema tries backups, "Copy stream URL", the
      .m3u playlist and the player buttons on the final error screen now use the source you (or Smart Play) picked first,
      not the last backup that was tried, with one line saying so.
   2) A visible link button on every source opens the same menu as press-and-hold / right-click: copy the link, copy the
      file name, open in VLC.
   3) VLC on Mac. VLC for Mac registers no web link (its app only claims http/https/rtsp at the lowest rank), so a page
      cannot start it. The "VLC" choice copies the link and says the two keys to press in VLC (⌘N, ⌘V). The .m3u
      playlist stays, since macOS often opens .m3u files in Music.
   4) Sources that ask for headers ("needs headers") were sent to the MKCinema server's default address even when no
      server runs, so every check failed and Smart Play fell back to a checked 720p. With the server off they are now
      opened and checked as plain links; the ones whose host doesn't insist on the headers can be picked again.
   5) Audio language. A browser that can't switch tracks inside a file (Chrome, Edge, Firefox without a MKCinema server)
      plays whatever track the file starts with, so with an audio language set, releases whose names say they carry
      several languages rank a little lower than a single-language copy of the same quality.
   Everything stays on this device. */
(() => {
  if (typeof playStream !== 'function' || typeof Failover === 'undefined' || typeof handoffHTML !== 'function') return;

  /* ---------- 1) the error screen's links follow your pick ---------- */
  const Pick = { origin: null, list: null, hopUntil: 0, clickAt: 0 };
  window.MkPick = Pick;
  const fnext = Failover.next;
  Failover.next = function (failed) {
    if (!Pick.origin || !Pick.list || !Pick.list.includes(failed)) { Pick.origin = failed; Pick.list = (P.ctx && P.ctx.streams) || null; }
    Pick.hopUntil = Date.now() + 30000;
    const r = fnext.apply(this, arguments);
    if (!r) Pick.hopUntil = 0;
    return r;
  };
  // a source picked by hand always becomes the new pick, even during a switch
  document.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('.stream[data-si],#dSmart,[data-act="next-src"],#pfRetry')) { Pick.clickAt = Date.now(); Pick.hopUntil = 0; } }, true);
  const ps = playStream;
  playStream = function (ctx, stream) {
    const hop = Date.now() < Pick.hopUntil; Pick.hopUntil = 0;
    const byHand = Date.now() - Pick.clickAt < 2500;
    // the same copy reconnecting, a converted copy or a language version of it is still the same pick
    const same = stream && (stream._cloud || stream._audioTry || (!byHand && Failover.tried && Failover.tried.has(stream) && Pick.list === (ctx && ctx.streams)));
    if (stream && !hop && !same) { Pick.origin = stream; Pick.list = (ctx && ctx.streams) || null; }
    return ps.apply(this, arguments);
  };
  Pick.of = (s) => {
    const o = Pick.origin;
    if (!s || !o || o === s || !Pick.list || !Pick.list.includes(s) || !Pick.list.includes(o)) return s;
    try { return handoffUrl(o) || o.infoHash ? o : s; } catch (e) { return s; }
  };
  const hh = handoffHTML;
  handoffHTML = function (s) {
    const o = Pick.of(s);
    if (o === s) return hh.call(this, s);
    const t = o._tel || {}, label = [t.res, t.codec, t.hdr].filter(Boolean).join(' ');
    return `<p class="mk-pick-note">These links are for your first choice${label ? ` (${esc(label)})` : ''}, not the backup MKCinema tried last.</p>${hh.call(this, o)}`;
  };

  /* ---------- 3) VLC on Mac ---------- */
  const VLC_KEYS = 'Link copied. In VLC press ⌘N, paste with ⌘V, then click Open.';
  const vlcCopy = (url) => { if (url) copyText(url, VLC_KEYS, 9000); };
  if (Array.isArray(PLAYERS) && !PLAYERS.some((p) => p.id === 'vlc-mac')) {
    const at = PLAYERS.findIndex((p) => p.m3u);
    PLAYERS.splice(at < 0 ? PLAYERS.length : at, 0, { id: 'vlc-mac', os: 'mac', name: 'VLC (copies the link, then ⌘N in VLC)', short: 'VLC', copy: true, link: (u) => u });
  }
  try { if (typeof EXT_HELP === 'object' && EXT_HELP) EXT_HELP.mac = 'Infuse and IINA open directly. VLC for Mac has no web link, so the VLC choice copies the stream link: in VLC press ⌘N, paste, then Open. The .m3u playlist works too if VLC opens .m3u files on your Mac.'; } catch (e) { /* help text is optional */ }
  if (typeof playerBtn === 'function') {
    const pb = playerBtn;
    playerBtn = function (p, url, title, prime) {
      if (!p || !p.copy) return pb.apply(this, arguments);
      return `<button class="btn ${prime ? 'btn-prime' : 'btn-ghost'}" type="button" data-vlcmac="${esc(url)}"><i data-lucide="copy"></i>${prime ? 'Copy for VLC again' : 'VLC'}</button>`;
    };
  }
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-vlcmac]'); if (!b) return;
    e.preventDefault(); e.stopPropagation(); vlcCopy(b.dataset.vlcmac);
  });
  if (typeof Handoff !== 'undefined' && Handoff.launch) {
    const hl = Handoff.launch;
    Handoff.launch = function (p, ctx, stream) {
      if (!p || !p.copy) return hl.apply(this, arguments);
      try {
        const sameFilm = !$('#detail').hidden && D.meta && D.meta.id === ctx.meta.id && (!ctx.video || (D.video && D.video.id === ctx.video.id));
        if (!sameFilm) openDetail(ctx.meta, { videoId: ctx.video ? videoIdFor(ctx.meta, ctx.video) : undefined });
      } catch (e) { /* the copy below still works */ }
      vlcCopy(handoffUrl(stream));
      return undefined;
    };
  }

  /* ---------- 2) a visible link button on every source ---------- */
  if (typeof streamRowHTML === 'function') {
    const row = streamRowHTML;
    const BTN = '<span class="s-more" data-lpmore role="button" aria-label="Copy link and more" title="Copy link and more"><i data-lucide="link"></i></span>';
    streamRowHTML = function () {
      const h = row.apply(this, arguments);
      if (typeof h !== 'string' || h.includes('data-lpmore')) return h;
      const k = h.lastIndexOf('<span class="go">');
      if (k >= 0) return h.slice(0, k) + BTN + h.slice(k);
      const e = h.lastIndexOf('</button>');
      return e >= 0 ? h.slice(0, e) + BTN + h.slice(e) : h;
    };
  }
  const openMenu = (b) => {
    const r = b.closest('.stream[data-si]'); if (!r || typeof window.MkLpOpen !== 'function') return;
    const q = b.getBoundingClientRect(); window.MkLpOpen(r, q.left + q.width / 2, q.top);
  };
  // capture, before the row's own click plays the source
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-lpmore]'); if (!b) return;
    e.preventDefault(); e.stopImmediatePropagation(); openMenu(b);
  }, true);
  // the menu gets "Open in VLC" wherever VLC can be reached from this page
  window.MkLpExtra = (st, add, link, row) => {
    if (!st || !link || !/^https?:/i.test(link)) return;
    const inPlayer = !!(row && row.closest && row.closest('#srcList') && P.ctx);
    const ctx = inPlayer ? P.ctx : (typeof D !== 'undefined' && D.meta ? { meta: D.meta, video: D.video, streams: D.streams } : P.ctx);
    const id = { android: 'vlc-android', ios: 'vlc-ios', mac: 'vlc-mac' }[PLATFORM];
    const p = id ? PLAYERS.find((x) => x.id === id) : PLAYERS.find((x) => x.m3u);
    if (!p) return;
    if (p.copy) add('copy', 'Copy for VLC', () => vlcCopy(link));
    else if (p.m3u) add('list-video', 'VLC playlist (.m3u)', () => downloadM3U(link, streamTitle(ctx)));
    else if (ctx && ctx.meta) add('external-link', 'Open in VLC', () => { if (inPlayer && !$('#player').hidden) closePlayer(); Handoff.launch(p, ctx, st); });
  };

  /* ---------- 4) sources that ask for headers, when the MKCinema server isn't running ----------
     The proxy address defaults to http://127.0.0.1:7000 even when nothing runs there, so every check of such a source
     failed on the dead address and the copy was marked broken. Once MKCinema knows the server is off, those sources are
     opened (and checked) as plain links instead: many hosts play without the extra headers. The server is asked once,
     only when an addon actually sends such a source, and again after two minutes. */
  const Px = { st: '', at: 0, busy: false };
  window.MkProxyState = Px;
  const fresh = () => !!Px.st && Date.now() - Px.at < 120000;
  Px.down = () => fresh() && Px.st === 'down';
  Px.kick = () => {
    if (Px.busy || fresh() || typeof proxyOnline !== 'function') return;
    if (!String(S.proxy || '').trim()) { Px.st = 'down'; Px.at = Date.now(); return; }
    Px.busy = true;
    proxyOnline().then((ok) => { Px.st = ok ? 'up' : 'down'; }, () => { Px.st = 'down'; }).then(() => { Px.at = Date.now(); Px.busy = false; });
  };
  const hdrs = (s) => { const bh = (s && s.behaviorHints) || {}; return !!(bh.proxyHeaders && bh.proxyHeaders.request && Object.keys(bh.proxyHeaders.request).length); };
  if (typeof proxify === 'function') {
    const px = proxify;
    proxify = function (url, headers) {
      if (headers && typeof headers === 'object' && Object.keys(headers).length && Px.down()) return url;
      return px.apply(this, arguments);
    };
  }
  if (typeof Preflight !== 'undefined' && typeof Preflight.src === 'function') {
    const src = Preflight.src;
    Preflight.src = function (s) {
      if (!hdrs(s) || !s.url || !/^https?:/i.test(s.url) || s._local || s._handoff || s.ytId || s.infoHash) return src.apply(this, arguments);
      Px.kick();
      if (!fresh()) return ''; // not known yet: no verdict, so a copy is never marked broken because of the server
      if (Px.st === 'up') return src.apply(this, arguments);
      if (this.addonHost && this.addonHost(s) && !(s._tel && s._tel.cached === true)) return '';
      return s.url; // what the player opens without the server
    };
  }

  /* ---------- 5) audio language where the browser can't switch tracks ---------- */
  if (typeof Telemetry !== 'undefined') {
    const parse = Telemetry.parse.bind(Telemetry);
    const canSwitch = () => {
      if ('audioTracks' in HTMLMediaElement.prototype) return true;
      // a running MKCinema server can switch tracks (the engine only when the host lets it read the file, so it doesn't count:
      // a single-language copy of the same quality is never worse)
      try { return !!(typeof Rescue !== 'undefined' && Rescue.server && Rescue.server.remux); } catch (e) { return false; }
    };
    Telemetry.parse = function (s) {
      const t = parse(s);
      try { if (t && t.proxied && hdrs(s)) Px.kick(); } catch (e) { /* checked later */ }
      try {
        if (t && !t._mkMulti && t.kind === 'http' && !t.isTrailer && !IS_TV && typeof window.MkAudioMulti === 'function' && window.MkAudioMulti(s) && !canSwitch()) {
          t._mkMulti = true; t.score -= 60;
        }
      } catch (e) { /* ranking stays as it was */ }
      return t;
    };
  }
})();
