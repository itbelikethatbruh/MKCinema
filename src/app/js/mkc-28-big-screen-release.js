
/* =====================================================================
   MKCinema 2.8 · the big screen release
   Send to TV, Channels (your own playlists), Split Screen, player tools, Source Check, Discover rows, Shortlist,
   Where to watch, Seats, Atelier, the addon directory, Line check, problem reports and custom CSS.
   Everything here is MKCinema's own code and design. It wraps the existing modules the same way Peak Cinema does,
   so nothing above this script changes behaviour unless one of these features is used.
   ===================================================================== */

/* ---------------- Shared helpers: pop-up layers, errors ring, small utils ---------------- */
const X8 = {
  layers: [],
  /* A pop-up in the house finish (solid graphite, hairline, round close), registered with Back, the TV remote and syncLayers */
  layer(id, { label, icon = 'sparkles', eyebrow = '', wide = false, full = false } = {}) {
    if ($(`#${id}`)) return $(`#${id}`);
    const el = document.createElement('div');
    el.id = id; el.className = full ? 'layer-ov x8-full' : 'layer-ov center top-layer'; el.hidden = true;
    el.innerHTML = full ? '<div class="x8-fullbox" role="dialog" aria-label="' + esc(label) + '"></div>'
      : `<div class="modal glass-solid pp-modal x8-modal${wide ? ' wide' : ''}" role="dialog" aria-label="${esc(label)}">
      <button class="ibtn panel-close" data-x8close type="button" aria-label="Close"><i data-lucide="x"></i></button>
      ${eyebrow ? `<span class="eyebrow"><i data-lucide="${icon}"></i>${esc(eyebrow)}</span>` : ''}<div class="x8-body"></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target.closest('[data-x8close]')) X8.close(id); else if (e.target === el && !full) X8.close(id); });
    MENU_LAYERS.push(id); this.layers.push(id);
    return el;
  },
  body(id) { const el = $(`#${id}`); return el && (el.querySelector('.x8-body') || el.querySelector('.x8-fullbox')); },
  open(id) {
    openLayer(id); this.order = [id, ...(this.order || []).filter((x) => x !== id)];
    // the Android TV app hands Back to the page only while an element with a known id (#remote) shows
    if (IS_TV) { const b = this.body(id); if (b && !$('#remote')) { b.id = 'remote'; b.dataset.x8remote = '1'; } Nav.settle(); }
  },
  close(id) { const el = $(`#${id}`); if (!el || el.hidden) return; closeLayer(id); const b = this.body(id); if (b && b.dataset.x8remote) { b.removeAttribute('id'); delete b.dataset.x8remote; } this.order = (this.order || []).filter((x) => x !== id); const fn = this.onClose[id]; if (fn) fn(); if (IS_TV) Nav.settle(); },
  onClose: {},
  top() { return (this.order || []).find((id) => { const el = $(`#${id}`); return el && !el.hidden; }) || null; },
  errors: [],
  dayKey: () => new Date().toISOString().slice(0, 10),
  seeded(arr, seed) { const a = arr.slice(); let h = hash(seed); for (let i = a.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  b64e: (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  b64d: (s) => JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))))),
  mixedBlocked: (url) => location.protocol === 'https:' && /^http:\/\//i.test(String(url || '')),
  runtimeMin: (m) => { const r = String((m && m.runtime) || ''); const h = r.match(/(\d+)\s*h/i), mi = r.match(/(\d+)\s*min/i); const n = (h ? +h[1] * 60 : 0) + (mi ? +mi[1] : 0); return n || (/^\d+$/.test(r) ? +r : 0); },
};
addEventListener('error', (e) => { X8.errors.push(`${new Date().toISOString().slice(11, 19)} ${String(e.message || e.error || 'error').slice(0, 200)}`); if (X8.errors.length > 12) X8.errors.shift(); });
addEventListener('unhandledrejection', (e) => { const r = e.reason; X8.errors.push(`${new Date().toISOString().slice(11, 19)} promise: ${String((r && r.message) || r).slice(0, 200)}`); if (X8.errors.length > 12) X8.errors.shift(); });

/* 2.37.0: a button whose async work fails (a bad addon reply, no network) used to do nothing visible. A failure in the
   few seconds after a tap, click or OK press now shows one short message (at most one every few seconds). */
const UiFail = { at: 0, shown: 0 };
addEventListener('click', () => { UiFail.at = Date.now(); }, true);
addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || /^Media/.test(e.key)) UiFail.at = Date.now(); }, true);
addEventListener('unhandledrejection', (e) => {
  const r = e.reason, now = Date.now();
  if (!r || r.name === 'AbortError' || now - UiFail.at > 4000 || now - UiFail.shown < 5000) return;
  UiFail.shown = now;
  let why = String((r && r.message) || r || '').split('\n')[0].slice(0, 90);
  try { if (typeof MKLog !== 'undefined') why = MKLog.redact(why); } catch (x) { /* raw */ }
  try { toast(why ? `That didn’t work: ${why}` : 'That didn’t work. Try again.', 'err', 5000, 'uifail'); } catch (x) { /* toast not ready */ }
});

/* Back, the TV remote's focus root and the open-layer list all learn about the 2.8 layers (the newest one answers first) */
X8.backHook = {};
{
  const prevBack = back;
  back = function () {
    const id = X8.top();
    if (id) { if (X8.backHook[id] && X8.backHook[id]()) return; X8.close(id); return; }
    return prevBack.apply(this, arguments);
  };
  const root = Nav.root.bind(Nav);
  Nav.root = function () {
    const id = X8.top();
    if (id && $('#castLayer').hidden && $('#partyLayer').hidden) { const el = $(`#${id}`), sub = el.querySelector('.x8-sub:not([hidden])'); return sub || el; }
    return root();
  };
}
// webOS and some remotes send GoBack: a 2.8 layer answers it before the app would close
document.addEventListener('keydown', (e) => {
  if ((e.keyCode === 461 || e.keyCode === 10009 || e.key === 'XF86Back' || e.key === 'GoBack' || e.key === 'BrowserBack') && X8.top()) { e.preventDefault(); e.stopImmediatePropagation(); back(); }
}, true);

/* ---------------- Send to TV ----------------
   Chrome (desktop and Android) casts to a Chromecast or Google TV with Google's Cast SDK for web senders, loaded only when
   asked. The TV fetches the stream link itself, so the source must be a plain web link (debrid and HTTP sources are).
   Safari on a Mac offers AirPlay through the video element. Anything else gets an honest explanation and a VLC hand-off,
   because VLC for Android casts to Chromecast by itself. */
const TvCast = {
  SDK: 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1',
  ready: null, remote: null, ctl: null, media: null, title: '', resumeCtx: null,
  airplay: () => !!window.WebKitPlaybackTargetAvailabilityEvent && typeof video.webkitShowPlaybackTargetPicker === 'function',
  chrome: () => /Chrome\/\d/.test(navigator.userAgent) && !/Edg\/|OPR\/|SamsungBrowser|; wv\)|MKCinema|Silk/i.test(navigator.userAgent),
  url(s) {
    if (!s || s._local || s.ytId) return '';
    const u = handoffUrl(s); return /^https?:/i.test(u || '') ? u : '';
  },
  type(u) { return /\.m3u8(\?|$)/i.test(u) ? 'application/x-mpegURL' : /\.mkv(\?|$)/i.test(u) ? 'video/x-matroska' : /\.webm(\?|$)/i.test(u) ? 'video/webm' : /\.ts(\?|$)/i.test(u) ? 'video/mp2t' : 'video/mp4'; },
  load() {
    if (window.cast && window.cast.framework) return Promise.resolve();
    return this.ready || (this.ready = new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('The cast library did not load')), 12000);
      window.__onGCastApiAvailable = (ok) => { clearTimeout(t); ok ? res() : rej(new Error('Casting is not available in this browser')); };
      const s = document.createElement('script'); s.src = this.SDK; s.async = true; s.onerror = () => { clearTimeout(t); this.ready = null; rej(new Error('The cast library did not load')); };
      document.head.appendChild(s);
    }).then(() => {
      const C = cast.framework.CastContext.getInstance();
      C.setOptions({ receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
      this.remote = new cast.framework.RemotePlayer(); this.ctl = new cast.framework.RemotePlayerController(this.remote);
      this.ctl.addEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, () => this.paint());
      this.ctl.addEventListener(cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED, () => { if (!this.remote.isConnected) this.ended(); });
    }));
  },
  async start() {
    const s = P.stream, url = this.url(s);
    $('#optMenu').hidden = true;
    if (!url) { this.help(s && s._local ? 'local' : s && s.ytId ? 'yt' : 'none'); return; }
    if (this.airplay()) { try { video.webkitShowPlaybackTargetPicker(); } catch (e) { this.help('fail'); } return; }
    if (this.chrome()) {
      try {
        await this.load();
        const C = cast.framework.CastContext.getInstance();
        if (!C.getCurrentSession()) await C.requestSession();
        await this.send(url, s);
      } catch (e) { if (!/cancel/i.test(String(e && (e.code || e.message || e)))) { console.warn('cast', e); this.help('fail', e); } }
      return;
    }
    if (video.remote && typeof video.remote.prompt === 'function' && !P.hls) { video.remote.prompt().catch(() => this.help('browser')); return; }
    this.help('browser');
  },
  async send(url, s) {
    const C = cast.framework.CastContext.getInstance(), sess = C.getCurrentSession(); if (!sess) return;
    const m = P.ctx.meta, info = new chrome.cast.media.MediaInfo(url, this.type(url));
    const md = new chrome.cast.media.GenericMediaMetadata();
    md.title = streamTitle(P.ctx); md.subtitle = 'MKCinema';
    const art = metaBg(m) || metaPoster(m); if (art) md.images = [new chrome.cast.Image(art)];
    info.metadata = md; info.streamType = isFinite(pDur()) ? chrome.cast.media.StreamType.BUFFERED : chrome.cast.media.StreamType.LIVE;
    const req = new chrome.cast.media.LoadRequest(info); req.autoplay = true; req.currentTime = isFinite(pDur()) ? Math.max(0, pNow() - 2) : 0;
    await sess.loadMedia(req);
    this.title = streamTitle(P.ctx); this.device = (sess.getCastDevice() || {}).friendlyName || 'your TV';
    this.resumeCtx = { ctx: P.ctx, stream: s };
    video.pause(); this.bar(true); toast(`Playing on ${this.device}`, 'ok', 3000, 'tvc');
  },
  bar(on) {
    let b = $('#tvcBar');
    if (!on) { if (b) b.hidden = true; document.body.classList.remove('tvc-on'); return; }
    if (!b) {
      b = document.createElement('div'); b.id = 'tvcBar'; b.className = 'tvc-bar glass-solid'; $('#stage').appendChild(b);
      b.addEventListener('click', (e) => {
        const a = e.target.closest('[data-tvc]'); if (!a || !this.ctl) return; const r = this.remote, k = a.dataset.tvc;
        if (k === 'play') this.ctl.playOrPause();
        if (k === 'back' || k === 'fwd') { r.currentTime = Math.max(0, r.currentTime + (k === 'back' ? -step() : step())); this.ctl.seek(); }
        if (k === 'mute') this.ctl.muteOrUnmute();
        if (k === 'stop') this.stop();
      });
    }
    b.hidden = false; document.body.classList.add('tvc-on'); this.paint();
  },
  paint() {
    const b = $('#tvcBar'); if (!b || b.hidden || !this.remote) return; const r = this.remote;
    b.innerHTML = `<i data-lucide="cast" class="tvc-ic"></i><div class="tvc-t"><small>Playing on ${esc(this.device || 'your TV')}</small><b>${esc(this.title)}</b><span class="tnum">${fmtTime(r.currentTime || 0)}${r.duration ? ` / ${fmtTime(r.duration)}` : ''}</span></div>
      <button class="ibtn" type="button" data-nav data-tvc="back" aria-label="Back ${step()} seconds"><i data-lucide="rotate-ccw"></i></button>
      <button class="ibtn" type="button" data-nav data-tvc="play" aria-label="Play or pause"><i data-lucide="${r.isPaused ? 'play' : 'pause'}"></i></button>
      <button class="ibtn" type="button" data-nav data-tvc="fwd" aria-label="Forward ${step()} seconds"><i data-lucide="rotate-cw"></i></button>
      <button class="ibtn" type="button" data-nav data-tvc="mute" aria-label="Mute the TV"><i data-lucide="${r.isMuted ? 'volume-x' : 'volume-2'}"></i></button>
      <button class="btn btn-ghost btn-sm" type="button" data-nav data-tvc="stop"><i data-lucide="monitor-smartphone"></i>Play here</button>`;
    icons();
  },
  /* Stop casting and pick the film up here at the TV's second */
  stop() {
    const t = this.remote && this.remote.currentTime;
    try { cast.framework.CastContext.getInstance().endCurrentSession(true); } catch (e) { /* already gone */ }
    this.ended(t);
  },
  ended(t) {
    const rc = this.resumeCtx; this.resumeCtx = null; this.bar(false);
    if (rc && !$('#player').hidden && P.stream === rc.stream && t > 0 && isFinite(pDur())) { pSeek(t, { user: false }); video.play().catch(() => {}); }
  },
  help(why, err) {
    const el = X8.layer('tvcLayer', { label: 'Send to TV', icon: 'cast', eyebrow: 'Send to TV' });
    const ext = playersHere().filter((p) => /vlc/.test(p.id)), url = handoffUrl(P.stream || {});
    const lead = {
      local: 'Files opened from this device stay on this device, so a TV cannot reach them. Online sources can be sent.',
      yt: 'Trailers play from YouTube. Open the YouTube app on your TV for those.',
      none: 'Start a film or episode first, then send it to your TV.',
      fail: `Your TV could not be reached${err && err.message ? ` (${esc(err.message)})` : ''}. Make sure the TV and this device are on the same Wi-Fi, then try again.`,
      browser: IS_TV ? 'This screen is already the big one.' : /; wv\)|MKCinema/i.test(navigator.userAgent) ? 'The MKCinema app can’t cast by itself. Open the source in VLC and tap VLC’s cast icon, or open app.mkcinema.app in Chrome to cast from there.' : 'Casting works in Chrome (computer or Android) to a Chromecast or Google TV, and in Safari on a Mac to AirPlay. This browser offers neither.',
    }[why] || '';
    X8.body('tvcLayer').innerHTML = `<h3 class="x8-h">Send to TV</h3><p class="sub">${lead}</p>
      <ul class="x8-list"><li><b>Chromecast and Google TV</b><span>Chrome on a computer or an Android phone</span></li><li><b>AirPlay</b><span>Safari on a Mac</span></li><li><b>Any other TV</b><span>Install MKCinema on it: Android TV, Fire TV, LG webOS and Samsung (TizenBrew) have apps</span></li></ul>
      ${url && ext.length ? `<div class="actions">${ext.map((p) => playerBtn(p, url, streamTitle(P.ctx), true)).join('')}</div><p class="tour-note">VLC on Android sends video to a Chromecast from its own cast icon.</p>` : ''}`;
    $$('[data-m3u]', el).forEach((b) => b.addEventListener('click', () => downloadM3U(b.dataset.m3u, b.dataset.title)));
    $$('[data-ext], [data-m3u]', el).forEach((b) => b.addEventListener('click', () => X8.close('tvcLayer')));
    icons(); X8.open('tvcLayer');
  },
  init() {
    if (IS_TV) return;
    const b = document.createElement('button'); b.className = 'ibtn'; b.id = 'pTvCast'; b.type = 'button'; b.title = 'Send to TV'; b.setAttribute('aria-label', 'Send to TV');
    b.innerHTML = '<i data-lucide="cast"></i>'; b.onclick = () => this.start();
    $('#pSubs').before(b); icons();
    // AirPlay shows the button only when a target is around; Chrome always can try
    if (window.WebKitPlaybackTargetAvailabilityEvent) video.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => { b.hidden = e.availability !== 'available'; });
    const close = closePlayer;
    closePlayer = async function () { if (TvCast.resumeCtx) TvCast.bar(false); TvCast.resumeCtx = null; return close.apply(this, arguments); };
  },
};
TvCast.init();

/* ---------------- Channels: your own TV playlists ----------------
   M3U / M3U8 playlists (a link or a file), Xtream logins (server, user name, password) and XMLTV guides, shown in Live TV
   next to channels from addons: groups, favourites, search and a timeline guide. MKCinema ships no channels; a playlist is
   the user's own. Playlist text is cached on this device (Cache Storage) so big lists open instantly.
   Browsers refuse plain http:// on a secure page, so http playlists need the file uploaded or a proxy, and http streams
   open in VLC (or play through the user's own MKCinema server). */
const Channels = {
  CACHE: 'mkc-channels', TTL: 12 * 3600e3,
  uploads: new Map(),   // list id -> uploaded playlist text, for browsers without Cache Storage
  data: new Map(),      // list id -> { channels, epg: Map(channelKey -> programmes), at }
  get() { return { lists: [], favs: [], ...(Store.get('channels', {}) || {}) }; },
  save(d) { Store.set('channels', d); if (typeof Account !== 'undefined') Account.schedule(); },
  lists() { return this.get().lists; },
  favs() { return new Set(this.get().favs); },
  key: (ch) => `${ch.list}|${ch.tvgId || ch.name}`,
  toggleFav(k) { const d = this.get(), s = new Set(d.favs); s.has(k) ? s.delete(k) : s.add(k); d.favs = [...s]; this.save(d); },
  xtream(l) {
    const base = String(l.server || '').replace(/\/+$/, ''), q = `username=${encodeURIComponent(l.user || '')}&password=${encodeURIComponent(l.pass || '')}`;
    return { m3u: `${base}/get.php?${q}&type=m3u_plus&output=m3u8`, epg: `${base}/xmltv.php?${q}` };
  },
  src(l) { return l.kind === 'xtream' ? this.xtream(l) : { m3u: l.url, epg: l.epg || '' }; },

  /* ---- fetching ---- */
  async text(url, { gz } = {}) {
    if (!url) throw new Error('No address');
    const tries = [];
    if (!X8.mixedBlocked(url)) tries.push(url);
    if (S.proxy) tries.push(proxify(url));
    if (!tries.length) throw new Error('This address starts with http://, which browsers block on a secure page. Upload the file instead, or set your MKCinema server as the proxy in Addons.');
    let last;
    for (const u of tries) {
      try {
        const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if ((gz || /\.gz(\?|$)/i.test(url)) && window.DecompressionStream) {
          const buf = new Uint8Array(await r.arrayBuffer());
          if (buf[0] === 0x1f && buf[1] === 0x8b) return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
          return new TextDecoder().decode(buf);
        }
        return await r.text();
      } catch (e) { last = e; }
    }
    throw new Error(/Failed to fetch|NetworkError|Load failed/i.test(String(last && last.message)) ? 'The server did not answer, or it blocks requests from web pages (CORS). Upload the playlist file instead, or route it through your MKCinema server.' : String(last && last.message || last));
  },
  async cached(id, kind, fresh, fetcher) {
    const req = new Request(`https://mkc.local/${id}/${kind}`);
    let c = null; try { c = await caches.open(this.CACHE); } catch (e) { /* no Cache Storage */ }
    if (c && !fresh) { const hit = await c.match(req); if (hit && Date.now() - Number(hit.headers.get('x-at') || 0) < this.TTL) return hit.text(); }
    const text = await fetcher();
    if (c) c.put(req, new Response(text, { headers: { 'x-at': String(Date.now()) } })).catch(() => {});
    return text;
  },

  /* ---- parsing ---- */
  parseM3U(text, list) {
    const out = [], lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    let cur = null, group = '', head = lines[0] || '';
    const attr = (s, k) => { const m = s.match(new RegExp(`${k}="([^"]*)"`, 'i')); return m ? m[1].trim() : ''; };
    const epg = attr(head, 'url-tvg') || attr(head, 'x-tvg-url');
    for (const raw of lines) {
      const l = raw.trim(); if (!l) continue;
      if (l.startsWith('#EXTINF')) {
        const name = l.slice(l.lastIndexOf(',') + 1).trim();
        cur = { list: list.id, name: name || attr(l, 'tvg-name') || 'Channel', tvgId: attr(l, 'tvg-id'), logo: attr(l, 'tvg-logo'), group: attr(l, 'group-title') || group, catchup: attr(l, 'catchup') };
      } else if (l.startsWith('#EXTGRP:')) group = l.slice(8).trim();
      else if (l.startsWith('#EXTVLCOPT:') && cur) { const m = l.match(/http-(user-agent|referrer)=(.+)/i); if (m) (cur.headers = cur.headers || {})[m[1].toLowerCase() === 'referrer' ? 'Referer' : 'User-Agent'] = m[2]; }
      else if (!l.startsWith('#')) { if (cur) { cur.url = l; cur.group = cur.group || 'Other'; out.push(cur); } cur = null; }
    }
    return { channels: out, epg };
  },
  /* XMLTV can be tens of megabytes: read it with plain string scans, keep only the next few hours of the channels we have */
  parseXMLTV(text, channels) {
    const want = new Map(), byName = new Map();
    channels.forEach((c) => { if (c.tvgId) want.set(c.tvgId.toLowerCase(), c); byName.set(normTitle(c.name), c); });
    const ids = new Map();
    const chRe = /<channel\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/g; let m;
    while ((m = chRe.exec(text))) {
      const id = m[1].toLowerCase(); if (want.has(id)) { ids.set(id, want.get(id)); continue; }
      const dn = (m[2].match(/<display-name[^>]*>([^<]+)</) || [])[1]; const c = dn && byName.get(normTitle(dn.replace(/&amp;/g, '&'))); if (c) ids.set(id, c);
    }
    const now = Date.now(), lo = now - 3 * 3600e3, hi = now + 8 * 3600e3, map = new Map();
    const t = (s) => { const x = String(s).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/); if (!x) return NaN; const tz = x[7] ? (Number(x[7].slice(0, 3)) * 60 + Math.sign(Number(x[7].slice(0, 3)) || 1) * Number(x[7].slice(3))) : 0; return Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5], +(x[6] || 0)) - tz * 60000; };
    const unx = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").trim();
    const pRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
    while ((m = pRe.exec(text))) {
      const a = m[1], cid = ((a.match(/channel="([^"]+)"/) || [])[1] || '').toLowerCase(); const c = ids.get(cid); if (!c) continue;
      const start = t((a.match(/start="([^"]+)"/) || [])[1]), end = t((a.match(/stop="([^"]+)"/) || [])[1]);
      if (!(end > lo && start < hi)) continue;
      const title = unx((m[2].match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]) || 'Programme';
      const desc = unx((m[2].match(/<desc[^>]*>([\s\S]*?)<\/desc>/) || [])[1]).slice(0, 300);
      const k = this.key(c); if (!map.has(k)) map.set(k, []); map.get(k).push({ title, desc, start, end });
    }
    map.forEach((l) => l.sort((x, y) => x.start - y.start));
    return map;
  },
  async load(l, fresh = false) {
    if (!fresh && this.data.has(l.id)) return this.data.get(l.id);
    const src = this.src(l);
    const text = l.kind === 'file' ? (await this.cached(l.id, 'm3u', false, async () => { if (this.uploads.has(l.id)) return this.uploads.get(l.id); throw new Error('Upload the playlist file again'); })) : await this.cached(l.id, 'm3u', fresh, () => this.text(src.m3u));
    const { channels, epg } = this.parseM3U(text, l);
    const d = { channels, epg: new Map(), at: Date.now(), epgUrl: src.epg || epg || '' };
    this.data.set(l.id, d);
    if (d.epgUrl) this.cached(l.id, 'epg', fresh, () => this.text(d.epgUrl)).then((x) => { d.epg = this.parseXMLTV(x, channels); if (S.view === 'tv' && S.tvFilter === `iptv:${l.id}`) this.renderGuide(); }).catch((e) => { d.epgError = e.message; });
    return d;
  },
  all() { return [...this.data.values()].flatMap((d) => d.channels); },

  /* ---- adding and editing ---- */
  openAdd(edit) {
    X8.layer('chAdd', { label: 'Add a playlist', icon: 'list-video', eyebrow: 'Channels' });
    const l = edit || { kind: 'm3u' }, b = X8.body('chAdd');
    const paint = () => {
      b.innerHTML = `<h3 class="x8-h">${edit ? 'Edit playlist' : 'Add your own channels'}</h3>
        <p class="sub">Bring a playlist from a service you subscribe to. MKCinema ships no channels, and your playlist stays on this device${CFG.syncKeys !== false ? ' and in your own account' : ''}.</p>
        <div class="segc" role="radiogroup" aria-label="Playlist type">${[['m3u', 'Playlist link'], ['xtream', 'Xtream login'], ['file', 'Playlist file']].map(([v, t]) => `<button type="button" data-nav data-k="${v}" class="${l.kind === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="x8-form">
          <label>Name<input class="inp" id="chName" value="${esc(l.name || '')}" placeholder="My TV" autocomplete="off"></label>
          ${l.kind === 'm3u' ? `<label>Playlist address (.m3u or .m3u8)<input class="inp mono" id="chUrl" value="${esc(l.url || '')}" placeholder="https://…/playlist.m3u" spellcheck="false" autocomplete="off"></label>` : ''}
          ${l.kind === 'xtream' ? `<label>Server<input class="inp mono" id="chServer" value="${esc(l.server || '')}" placeholder="https://provider.example:8080" spellcheck="false" autocomplete="off"></label>
            <div class="x8-2"><label>User name<input class="inp mono" id="chUser" value="${esc(l.user || '')}" autocomplete="off" spellcheck="false"></label><label>Password<input class="inp mono" id="chPass" type="password" ${SecretFill.attr(l.pass)} autocomplete="off"></label></div>` : ''}
          ${l.kind === 'file' ? `<label>Playlist file<input class="inp" id="chFile" type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/x-mpegurl,application/vnd.apple.mpegurl,text/plain"></label>` : ''}
          ${l.kind !== 'xtream' ? `<label>TV guide (XMLTV, optional)<input class="inp mono" id="chEpg" value="${esc(l.epg || '')}" placeholder="https://…/guide.xml or .xml.gz" spellcheck="false" autocomplete="off"></label>` : '<p class="tour-note">The guide comes from your Xtream login automatically.</p>'}
        </div>
        <p class="tour-note" id="chMsg"></p>
        <div class="actions"><button class="btn btn-prime" type="button" data-nav id="chSave"><i data-lucide="check"></i>${edit ? 'Save' : 'Add playlist'}</button>${edit ? '<button class="btn btn-ghost danger" type="button" data-nav id="chDel"><i data-lucide="trash-2"></i>Remove</button>' : ''}</div>`;
      icons();
      $$('[data-k]', b).forEach((x) => x.addEventListener('click', () => { Object.assign(l, this.readForm(b, l)); l.kind = x.dataset.k; paint(); }));
      $('#chSave').onclick = () => this.submit(b, l, !!edit);
      const del = $('#chDel'); if (del) del.onclick = () => confirmTwice(del, () => { const d = this.get(); d.lists = d.lists.filter((x) => x.id !== l.id); d.favs = d.favs.filter((k) => !k.startsWith(`${l.id}|`)); this.save(d); this.data.delete(l.id); X8.close('chAdd'); S.tvFilter = ''; renderTV(); toast('Playlist removed'); });
    };
    paint(); X8.open('chAdd');
  },
  readForm(b, l) {
    const v = (id) => { const el = $(`#${id}`, b); return el ? el.value.trim() : undefined; };
    const o = {}; [['name', 'chName'], ['url', 'chUrl'], ['server', 'chServer'], ['user', 'chUser'], ['pass', 'chPass'], ['epg', 'chEpg']].forEach(([k, id]) => { const x = v(id); if (x !== undefined) o[k] = x; });
    return o;
  },
  async submit(b, l, edit) {
    Object.assign(l, this.readForm(b, l));
    const msg = $('#chMsg', b), say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? 'var(--bad)' : ''; };
    if (l.kind === 'm3u' && !/^https?:\/\//i.test(l.url || '')) return say('Paste the full playlist address, starting with https:// or http://', true);
    if (l.kind === 'xtream' && (!/^https?:\/\//i.test(l.server || '') || !l.user || !l.pass)) return say('Fill in the server address (with http:// or https://), the user name and the password.', true);
    l.id = l.id || `p${Date.now().toString(36)}`; l.name = l.name || (l.kind === 'xtream' ? (l.server || '').replace(/^https?:\/\//, '').split(/[:/]/)[0] : 'My channels');
    say('Reading the playlist…');
    // 2.67.1 tv-playback: the playlist being added counts as one of yours while it is read, so the Android app may fetch
    // its server (before, only saved playlists did, and a new plain-http or no-CORS service could never be added)
    this._draft = { ...l };
    try {
      if (l.kind === 'file') {
        const f = $('#chFile', b).files[0];
        if (!f && !edit) return say('Choose the playlist file first.', true);
        if (f) { const text = await f.text(); this.uploads.set(l.id, text); await this.cached(l.id, 'm3u', true, async () => text); }
        l.fileName = f ? f.name : l.fileName;
      }
      this.data.delete(l.id);
      const d = await this.load(l, true);
      if (!d.channels.length) throw new Error('No channels found in that playlist');
      const all = this.get(); all.lists = [...all.lists.filter((x) => x.id !== l.id), { ...l }]; this.save(all);
      X8.close('chAdd'); S.tvFilter = `iptv:${l.id}`; go('tv'); renderTV();
      toast(`${d.channels.length} channels added`, 'ok');
    } catch (e) { say(e.message, true); } finally { this._draft = null; if (this.allow) this.allow(); }
  },

  /* ---- Live TV guide ---- */
  st: { group: '', q: '', page: 1 },
  chips() {
    const box = $('#tvSources'); if (!box || $('#chAddChip')) return;
    const mine = this.lists().map((l) => `<button class="chip ${S.tvFilter === `iptv:${l.id}` ? 'on' : ''}" type="button" data-nav data-iptv="${esc(l.id)}"><i data-lucide="list-video"></i>${esc(l.name)}</button>`).join('');
    box.insertAdjacentHTML('beforeend', `${mine}<button class="chip" type="button" data-nav id="chAddChip"><i data-lucide="plus"></i>Add playlist</button><button class="chip" type="button" data-nav id="chSplitChip"><i data-lucide="layout-grid"></i>Split Screen</button>${window.MkRec ? '<button class="chip" type="button" data-nav id="chRecChip"><span class="rec-dot"></span>Recordings</button>' : ''}`);
    $$('[data-iptv]', box).forEach((b) => b.addEventListener('click', () => { S.tvFilter = `iptv:${b.dataset.iptv}`; this.st = { group: '', q: '', page: 1 }; renderTV(); }));
    $('#chAddChip').onclick = () => this.openAdd();
    $('#chSplitChip').onclick = () => Split.open();
    const rc = $('#chRecChip'); if (rc) rc.onclick = () => MkRec.openList();
    icons();
  },
  addonChips() {
    const cats = engine.catalogs({ type: 'tv' }).concat(engine.catalogs({ type: 'channel' }));
    const providers = [...new Set(cats.map((c) => c.addon))];
    $('#tvSources').innerHTML = (providers.length ? [['', 'All sources'], ...providers.map((a) => [a.baseUrl, a.manifest.name])] : []).map(([v, l]) => `<button class="chip" type="button" data-nav data-src="${esc(v)}">${esc(l)}</button>`).join('');
    $$('#tvSources [data-src]').forEach((b) => b.addEventListener('click', () => { S.tvFilter = b.dataset.src; renderTV(); }));
  },
  async renderGuide() {
    const id = S.tvFilter.slice(5), l = this.lists().find((x) => x.id === id), epg = $('#epg');
    if (!l) { S.tvFilter = ''; return renderTV(); }
    if (!this.data.has(id)) epg.innerHTML = '<div style="padding:22px" class="status-line"><span class="spin"></span>Reading your playlist…</div>';
    let d; try { d = await this.load(l); } catch (e) {
      epg.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle"></i><h3>${esc(l.name)} could not be read</h3><p>${esc(e.message)}</p><div class="actions"><button class="btn btn-ghost" type="button" data-nav id="chRetry"><i data-lucide="refresh-cw"></i>Try again</button><button class="btn btn-ghost" type="button" data-nav id="chEdit"><i data-lucide="pencil"></i>Edit playlist</button></div></div>`;
      icons(); $('#chRetry').onclick = () => { this.data.delete(id); this.renderGuide(); }; $('#chEdit').onclick = () => this.openAdd(l); return;
    }
    const favs = this.favs(), groups = [...new Set(d.channels.map((c) => c.group))].sort((a, b) => a.localeCompare(b));
    const q = normTitle(this.st.q);
    let list = d.channels.filter((c) => (this.st.group === '★' ? favs.has(this.key(c)) : !this.st.group || c.group === this.st.group) && (!q || normTitle(c.name).includes(q)));
    const total = list.length, per = IS_TV ? 40 : 80; list = list.slice(0, per * this.st.page);
    const PX = IS_TV ? 7 : 8, now = Date.now(), t0 = Math.floor((now - 30 * 60000) / (30 * 60000)) * 30 * 60000, span = 180, t1 = t0 + span * 60000, x = (t) => ((t - t0) / 60000) * PX;
    const times = Array.from({ length: span / 30 }, (_, i) => `<span style="width:${30 * PX}px">${new Date(t0 + i * 30 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`).join('');
    const hm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const fut = [];   // programmes that start later: a press offers to record them
    const rows = list.map((c, i) => {
      const k = this.key(c), progs = (d.epg.get(k) || []).filter((p) => p.end > t0 && p.start < t1);
      const blocks = (progs.length ? progs : [{ title: c.group ? `Live · ${c.group}` : 'Live', start: t0, end: t1, none: true }]).map((p) => {
        const left = Math.max(0, x(p.start)), w = Math.min(x(p.end), span * PX) - left, on = p.start <= now && now < p.end;
        return `<button class="epg-prog ${on ? 'now' : ''}" type="button" data-nav data-ci="${i}"${window.MkRec && !p.none && p.start > now + 60e3 ? ` data-fp="${fut.push({ c, p }) - 1}"` : ''} style="left:${left}px;width:${Math.max(30, w - 4)}px" title="${esc(p.desc || p.title)}"><b>${esc(p.title)}</b><small>${p.none ? esc(c.name) : `${hm(p.start)}–${hm(p.end)}`}</small></button>`;
      }).join('');
      return `<div class="epg-row"><div class="epg-ch ch-cell"><button class="ch-tune" type="button" data-nav data-ci="${i}">${c.logo ? `<img src="${esc(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-gone>` : `<span class="ch-mono">${esc((c.name || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase())}</span>`}<span><b>${esc(c.name)}</b><small>${esc(c.group)}</small></span></button>${window.MkRec ? `<button class="ch-fav ch-rec" type="button" data-nav data-rec="${i}" title="Record ${esc(c.name)}" aria-label="Record ${esc(c.name)}"><span class="rec-dot"></span></button>` : ''}<button class="ch-fav ${favs.has(k) ? 'on' : ''}" type="button" data-nav data-fav="${i}" aria-label="${favs.has(k) ? 'Remove from' : 'Add to'} favourites"><i data-lucide="star"></i></button></div><div class="epg-track">${blocks}</div></div>`;
    }).join('');
    epg.innerHTML = `<div class="ch-bar">
        <div class="ch-search"><i data-lucide="search"></i><input class="inp" id="chQ" type="search" placeholder="Find a channel in ${esc(l.name)}" value="${esc(this.st.q)}" autocomplete="off"></div>
        <select class="sel" id="chGroup" aria-label="Group"><option value="">All groups · ${d.channels.length}</option><option value="★" ${this.st.group === '★' ? 'selected' : ''}>★ Favourites · ${d.channels.filter((c) => favs.has(this.key(c))).length}</option>${groups.map((g) => `<option value="${esc(g)}" ${this.st.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
        <button class="btn btn-ghost btn-sm" type="button" data-nav id="chRefresh" title="Read the playlist again"><i data-lucide="refresh-cw"></i>Refresh</button>
        <button class="btn btn-ghost btn-sm" type="button" data-nav id="chEdit"><i data-lucide="pencil"></i>Edit</button>
      </div>
      ${d.epgError ? `<p class="tour-note ch-note">The guide could not be read (${esc(d.epgError)}). Channels still play.</p>` : !d.epgUrl ? '<p class="tour-note ch-note">No TV guide for this playlist. Add an XMLTV address under Edit to see what is on.</p>' : ''}
      ${list.length ? `<div class="epg-scroll"><div class="epg-grid"><div class="epg-times">${times}</div>${rows}<div class="epg-now" style="left:${220 + x(now)}px"></div></div></div>` : `<div class="empty" style="margin:16px">${this.st.group === '★' ? 'Star a channel to keep it here.' : 'No channels match.'}</div>`}
      ${total > list.length ? `<div class="actions" style="justify-content:center;margin:14px 0"><button class="btn btn-ghost" type="button" data-nav id="chMore">Show more · ${total - list.length} left</button></div>` : ''}`;
    icons();
    const sc = $('#epg .epg-scroll'); if (sc) sc.scrollLeft = Math.max(0, x(now) - 120);
    $$('#epg [data-ci]').forEach((b) => b.addEventListener('click', () => { const f = b.dataset.fp != null ? fut[Number(b.dataset.fp)] : null; if (f && window.MkRec) return MkRec.offer(f.c, f.p); this.tune(list[Number(b.dataset.ci)]); }));
    $$('#epg [data-rec]').forEach((b) => b.addEventListener('click', () => MkRec.offer(list[Number(b.dataset.rec)])));
    $$('#epg [data-fav]').forEach((b) => b.addEventListener('click', () => { const c = list[Number(b.dataset.fav)]; this.toggleFav(this.key(c)); const on = this.favs().has(this.key(c)); b.classList.toggle('on', on); toast(on ? `${c.name} added to favourites` : `${c.name} removed from favourites`, 'ok', 1800, 'chfav'); }));
    const qi = $('#chQ'); qi.addEventListener('input', debounce(() => { this.st.q = qi.value; this.st.page = 1; this.renderGuide().then(() => { const n = $('#chQ'); if (n && !TOUCH_UI) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 250));
    $('#chGroup').onchange = (e) => { this.st.group = e.target.value; this.st.page = 1; this.renderGuide(); };
    $('#chRefresh').onclick = async () => { this.data.delete(id); toast('Reading the playlist again…', 'info', 1800, 'chr'); await this.load(l, true).catch(() => {}); this.renderGuide(); };
    $('#chEdit').onclick = () => this.openAdd(l);
    const more = $('#chMore'); if (more) more.onclick = () => { this.st.page++; this.renderGuide(); };
  },
  stream(c) {
    const st = { name: (this.lists().find((l) => l.id === c.list) || {}).name || 'Channels', title: c.name, url: c.url, _addon: 'Channels', behaviorHints: c.headers ? { proxyHeaders: { request: c.headers } } : {} };
    st._tel = Telemetry.parse(st); return st;
  },
  meta(c) { return remember({ id: `iptv:${hash(this.key(c)).toString(36)}`, type: 'tv', name: c.name, poster: c.logo, logo: c.logo, background: c.logo, genres: c.group ? [c.group] : [], _iptv: c }); },
  tune(c) {
    if (!c) return;
    const st = this.stream(c), meta = this.meta(c);
    if (X8.mixedBlocked(c.url) && !S.proxy) {
      // the page is https and the channel is http: the browser would refuse it, so offer the outside players straight away
      X8.layer('chExt', { label: 'Open in another player', icon: 'external-link', eyebrow: 'Channels' });
      const b = X8.body('chExt');
      b.innerHTML = `<h3 class="x8-h">${esc(c.name)} needs another player</h3><p class="sub">This channel is sent over plain http://, which browsers refuse on a secure page. Open it in VLC or another player, or set your MKCinema server as the proxy in Addons to play it here.</p><div class="actions x8-wrap">${handoffHTML(st)}</div>`;
      $$('[data-copy]', b).forEach((x) => x.addEventListener('click', () => copyText(x.dataset.copy)));
      $$('[data-m3u]', b).forEach((x) => x.addEventListener('click', () => downloadM3U(x.dataset.m3u, c.name)));
      icons(); X8.open('chExt'); void meta;
      return;
    }
    // the proxied address already carries the headers, so the player must not proxy it a second time
    if (X8.mixedBlocked(c.url) && S.proxy) { st.url = proxify(c.url, c.headers); if (st.behaviorHints) delete st.behaviorHints.proxyHeaders; }
    playStream({ meta, video: null, streams: [st] }, st);
  },
  init() {
    const base = renderTV;
    renderTV = async function () {
      if (S.tvFilter && S.tvFilter.startsWith('iptv:')) { Channels.addonChips(); Channels.chips(); return Channels.renderGuide(); }
      const r = await base.apply(this, arguments);
      Channels.chips();
      const empty = $('#tvAddAddon');
      if (empty && !$('#tvAddList')) {
        empty.insertAdjacentHTML('afterend', '<button class="btn btn-ghost" type="button" data-nav id="tvAddList"><i data-lucide="list-video"></i>Add your own playlist</button>');
        const p = empty.parentElement.querySelector('p'); if (p) p.textContent = 'MKCinema ships no channels of its own. Add a playlist from a TV service you subscribe to (M3U, Xtream or XMLTV), or install a Stremio addon that provides TV channels.';
        $('#tvAddList').onclick = () => Channels.openAdd(); icons();
      }
      return r;
    };
    // Setup Cloner and account sync carry the playlists; Xtream passwords travel only when key sync is on
    const ex = exportData;
    const bare = (u) => (/[?@]/.test(String(u || '')) ? '' : u || '');
    exportData = function () { const d = ex.apply(this, arguments); const c = Channels.get(); d.channels = { ...c, lists: c.lists.map((l) => (CFG.syncKeys === false ? { ...l, pass: '', user: '', url: bare(l.url), epg: bare(l.epg) } : l)) }; return d; };
    const ap = Account.applyRemote.bind(Account);
    Account.applyRemote = function (d) {
      ap(d);
      if (d && d.channels && Array.isArray(d.channels.lists)) {
        const mine = Channels.get(), byId = new Map(mine.lists.map((l) => [l.id, l]));
        // fields a device without key sync left blank keep this device's own values
        const fill = (l) => { const had = byId.get(l.id) || {}, o = { ...l }; ['pass', 'user', 'url', 'epg'].forEach((k) => { if (!o[k] && had[k]) o[k] = had[k]; }); return o; };
        // the newer set replaces this one, so removed playlists and favourites stay removed (rows from older apps still merge)
        if (d._legacy) { d.channels.lists.forEach((l) => byId.set(l.id, fill(l))); Channels.save({ lists: [...byId.values()], favs: [...new Set([...(mine.favs || []), ...(d.channels.favs || [])])] }); }
        else Channels.save({ lists: d.channels.lists.map(fill), favs: Array.isArray(d.channels.favs) ? d.channels.favs : [] });
      }
    };
    COMMANDS.push({ label: 'Add a TV playlist (M3U, Xtream)', icon: 'list-video', run: () => { go('tv'); Channels.openAdd(); } }, { label: 'Split Screen: up to four at once', icon: 'layout-grid', run: () => Split.open() });
  },
};

/* ---------------- Split Screen ----------------
   Up to four live channels or streams side by side (two on a TV, whose decoder can rarely run more). One tile has the
   sound: tap or select it to move the sound there. Tiles use their own <video> elements and hls.js instances and are torn
   down completely on close, so nothing keeps downloading in the background. */
const Split = {
  tiles: [], focus: 0, max: () => (IS_TV || matchMedia('(max-width: 760px)').matches ? 2 : 4),
  el: null,
  build() {
    this.el = X8.layer('splitLayer', { label: 'Split Screen', full: true });
    X8.onClose.splitLayer = () => this.stopAll();
    X8.backHook.splitLayer = () => { const s = $('#splitPick'); if (s && !s.hidden) { s.hidden = true; Nav.settle(); return true; } return false; };
  },
  open(seed) {
    if (!this.el) this.build();
    if (!$('#player').hidden) closePlayer();
    if (seed) this.add(seed);
    this.paint(); X8.open('splitLayer');
    if (!this.tiles.length) this.pick();
  },
  paint() {
    const box = X8.body('splitLayer'), n = this.tiles.length;
    box.innerHTML = `<div class="sp-top"><span class="pk-mark">Split Screen</span><span class="sp-hint">${n ? 'Select a tile to give it the sound' : 'Pick up to ' + this.max() + ' channels or streams'}</span><span class="sp-sp"></span>
        ${n < this.max() ? '<button class="btn btn-ghost btn-sm" type="button" data-nav id="spAdd"><i data-lucide="plus"></i>Add</button>' : ''}
        <button class="ibtn" type="button" data-nav data-x8close aria-label="Close Split Screen"><i data-lucide="x"></i></button></div>
      <div class="sp-grid n${Math.max(1, n)}" id="spGrid"></div>
      <div class="sp-pick x8-sub" id="splitPick" hidden></div>`;
    const grid = $('#spGrid', box);
    this.tiles.forEach((t, i) => {
      const cell = document.createElement('div'); cell.className = `sp-tile${i === this.focus ? ' on' : ''}`;
      cell.innerHTML = `<button class="sp-hit" type="button" data-nav data-sf="${i}" aria-label="Sound from ${esc(t.name)}"></button><div class="sp-cap"><i data-lucide="${i === this.focus ? 'volume-2' : 'volume-x'}"></i><b>${esc(t.name)}</b></div><button class="ibtn sp-x" type="button" data-nav data-sx="${i}" aria-label="Remove ${esc(t.name)}"><i data-lucide="x"></i></button><div class="sp-msg" ${t.err ? '' : 'hidden'}>${esc(t.err || '')}</div>`;
      cell.prepend(t.v); grid.appendChild(cell);
      t.v.muted = i !== this.focus;
    });
    if (!n) grid.innerHTML = '<div class="empty-state"><i data-lucide="layout-grid"></i><h3>Nothing on yet</h3><p>Add channels from your playlists, or paste any stream link.</p></div>';
    icons();
    $$('[data-sf]', box).forEach((b) => b.addEventListener('click', () => { this.focus = Number(b.dataset.sf); this.paint(); }));
    $$('[data-sx]', box).forEach((b) => b.addEventListener('click', () => this.remove(Number(b.dataset.sx))));
    const add = $('#spAdd', box); if (add) add.onclick = () => this.pick();
    if (IS_TV) Nav.settle();
  },
  async pick() {
    const box = $('#splitPick'); if (!box) return;
    const lists = Channels.lists();
    await Promise.allSettled(lists.map((l) => Channels.load(l)));
    const favs = Channels.favs(), all = Channels.all(), sorted = all.slice().sort((a, b) => favs.has(Channels.key(b)) - favs.has(Channels.key(a)));
    const draw = (q) => {
      const nq = normTitle(q), hits = sorted.filter((c) => !nq || normTitle(c.name).includes(nq)).slice(0, 60);
      $('#spList').innerHTML = hits.map((c, i) => `<button type="button" class="sp-item" data-nav data-pi="${all.indexOf(c)}">${c.logo ? `<img src="${esc(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-gone>` : '<i data-lucide="tv"></i>'}<span><b>${favs.has(Channels.key(c)) ? '★ ' : ''}${esc(c.name)}</b><small>${esc(c.group)}</small></span></button>`).join('') || `<p class="sub">${all.length ? 'No channels match.' : 'No playlists yet. Add one in Live TV, or paste a stream link above.'}</p>`;
      icons(); $$('#spList [data-pi]').forEach((b) => b.addEventListener('click', () => { const c = all[Number(b.dataset.pi)]; box.hidden = true; this.add({ name: c.name, url: c.url, headers: c.headers }); }));
    };
    box.innerHTML = `<div class="modal glass-solid pp-modal"><h3 class="x8-h">Add to Split Screen</h3>
      <div class="inrow"><input class="inp mono" id="spUrl" placeholder="Paste a stream link (.m3u8 or video)" autocomplete="off" spellcheck="false"><button class="btn btn-prime" type="button" data-nav id="spUrlGo">Add</button></div>
      <div class="ch-search" style="margin-top:12px"><i data-lucide="search"></i><input class="inp" id="spQ" type="search" placeholder="Find a channel" autocomplete="off"></div>
      <div class="sp-list" id="spList"></div><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-nav id="spPickClose">Close</button></div></div>`;
    box.hidden = false; draw('');
    $('#spQ').addEventListener('input', (e) => draw(e.target.value));
    $('#spUrl').addEventListener('keydown', (e) => e.stopPropagation()); $('#spQ').addEventListener('keydown', (e) => { if (!/^Arrow(Up|Down)$/.test(e.key)) e.stopPropagation(); });
    $('#spUrlGo').onclick = () => { const u = $('#spUrl').value.trim(); if (!/^https?:\/\//i.test(u)) { toast('Paste a full link starting with https://', 'err'); return; } box.hidden = true; this.add({ name: u.split('/').pop().split('?')[0] || 'Stream', url: u }); };
    $('#spPickClose').onclick = () => { box.hidden = true; if (IS_TV) Nav.settle(); };
    icons(); if (IS_TV) Nav.settle();
  },
  add(src) {
    if (this.tiles.length >= this.max()) { toast(`Split Screen holds ${this.max()} at a time here`, 'err'); return; }
    const v = document.createElement('video'); v.playsInline = true; v.autoplay = true; v.className = 'sp-v';
    const t = { ...src, v, hls: null, err: '' }; this.tiles.push(t);
    if (this.tiles.length === 1) this.focus = 0;
    let url = src.url;
    if (X8.mixedBlocked(url)) { if (S.proxy) url = proxify(url, src.headers); else t.err = 'Plain http:// links need your MKCinema server as the proxy (Addons › MKCinema proxy).'; }
    else if (src.headers && S.proxy) url = proxify(url, src.headers);
    if (!t.err) {
      const fail = () => { t.err = 'This stream did not play here.'; if (this.el && !this.el.hidden) this.paint(); };
      v.addEventListener('error', fail, { once: true });
      if (/\.m3u8(\?|$)/i.test(url) && !v.canPlayType('application/vnd.apple.mpegurl')) {
        HlsLoad.get().then((Hls) => { if (!this.tiles.includes(t)) return; if (!Hls.isSupported()) return fail(); t.hls = new Hls({ maxBufferLength: 12, backBufferLength: 10, capLevelToPlayerSize: true }); t.hls.on(Hls.Events.ERROR, (e, d) => { if (d.fatal) fail(); }); t.hls.loadSource(url); t.hls.attachMedia(v); }).catch(fail);
      } else v.src = url;
      v.play().catch(() => {});
    }
    this.paint();
  },
  stop(t) { try { if (t.hls) t.hls.destroy(); } catch (e) { /* gone */ } t.v.pause(); t.v.removeAttribute('src'); t.v.load(); },
  remove(i) { const t = this.tiles[i]; if (!t) return; this.stop(t); this.tiles.splice(i, 1); if (this.focus >= this.tiles.length) this.focus = 0; this.paint(); },
  stopAll() { this.tiles.forEach((t) => this.stop(t)); this.tiles = []; this.focus = 0; },
};
Channels.init();

/* ---------------- Player tools ----------------
   Sleep timer (fades the sound over the last 15 s, then pauses), A-B repeat, still capture (only offered when the source
   allows it: local files and HLS), a second subtitle line for language learners, keys you choose yourself, and seek
   previews: on a computer, hovering the seek bar shows the frame there, read by a second muted video of the same link. */
const Tools = {
  sleepAt: 0, sleepEnd: false, vol0: null, a: null, b: null, sub2: null, sub2i: -1,
  /* ---- sleep ---- */
  setSleep(min) {
    this.restoreVol(); this.sleepAt = 0; this.sleepEnd = false;
    if (min === 'end') { this.sleepEnd = true; toast('Sleep timer: at the end of this one', 'ok', 2400, 'sleep'); }
    else if (min > 0) { this.sleepAt = Date.now() + min * 60000; toast(`Sleep timer: ${min} minutes`, 'ok', 2400, 'sleep'); }
    else toast('Sleep timer off', 'info', 1800, 'sleep');
    this.paintMarks();
  },
  sleepLabel() {
    if (this.sleepEnd) return 'at the end';
    if (!this.sleepAt) return 'off';
    return `${Math.max(1, Math.ceil((this.sleepAt - Date.now()) / 60000))} min left`;
  },
  restoreVol() { if (this.vol0 != null) { video.volume = this.vol0; this.vol0 = null; } },
  tick() {
    if ($('#player').hidden) return;
    const t = pNow(), d = pDur();
    let left = this.sleepAt ? (this.sleepAt - Date.now()) / 1000 : this.sleepEnd && isFinite(d) ? d - t - 1 : Infinity;
    if (left < 15 && left > 0) { if (this.vol0 == null) this.vol0 = video.volume; video.volume = Math.max(0, this.vol0 * (left / 15)); }
    if (left <= 0) {
      video.pause(); this.restoreVol(); this.sleepAt = 0; this.sleepEnd = false;
      showMsg('Sleep timer', 'Paused for the night. Press play to carry on.', '<button class="btn btn-prime" type="button" id="slpGo"><i data-lucide="play"></i>Keep watching</button>');
      const g = $('#slpGo'); if (g) g.onclick = () => { hideMsg(); video.play().catch(() => {}); };
    }
    // A-B repeat
    if (this.a != null && this.b != null && t >= this.b) pSeek(this.a, { user: false });
    // second subtitle line
    if (this.sub2) this.drawSub2(t);
  },
  /* ---- A-B ---- */
  ab() {
    const t = pNow();
    if (this.a == null) { this.a = t; toast(`A set at ${fmtTime(t)}. Press again at the end of the part to repeat.`, 'info', 3200, 'ab'); }
    else if (this.b == null) { if (t <= this.a + 0.5) { toast('B must come after A', 'err', 2000, 'ab'); return; } this.b = t; pSeek(this.a, { user: false }); toast(`Repeating ${fmtTime(this.a)} to ${fmtTime(this.b)}`, 'ok', 2600, 'ab'); }
    else { this.a = this.b = null; toast('A-B repeat off', 'info', 1600, 'ab'); }
    this.paintMarks();
  },
  abLabel() { return this.a == null ? 'Set start (A)' : this.b == null ? `Set end (B) · A at ${fmtTime(this.a)}` : `Stop repeating ${fmtTime(this.a)}–${fmtTime(this.b)}`; },
  paintMarks() {
    const seek = $('#seek'); let r = $('#abRange');
    if (!r) { r = document.createElement('div'); r.id = 'abRange'; r.className = 'ab-range'; seek.appendChild(r); }
    const d = pDur(); if (this.a == null || !isFinite(d) || !d) { r.hidden = true; return; }
    r.hidden = false; const b = this.b == null ? this.a + 0.5 : this.b;
    r.style.left = `${(this.a / d) * 100}%`; r.style.width = `${Math.max(0.4, ((b - this.a) / d) * 100)}%`;
  },
  /* ---- still capture ---- */
  canStill() {
    if (!video.videoWidth) return false;
    try { const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d'); g.drawImage(video, 0, 0, 2, 2); g.getImageData(0, 0, 1, 1); return true; } catch (e) { return false; }
  },
  still() {
    if (!this.canStill()) { toast('This source does not allow captures. Local files and HLS streams do.', 'err', 4200, 'still'); return; }
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext('2d').drawImage(video, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return; const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `${streamTitle(P.ctx).replace(/[^\w\- ]+/g, '').trim() || 'MKCinema'} ${fmtTime(pNow()).replace(/:/g, '.')}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Still saved', 'ok', 1800, 'still');
    }, 'image/png');
  },
  /* ---- second subtitles ---- */
  async setSub2(i) {
    this.sub2i = i; this.sub2 = null; const box = $('#sub2'); if (box) box.textContent = '';
    if (i < 0) { toast('Second subtitles off', 'info', 1600, 'sub2'); return; }
    const s = P.subs[i];
    try {
      let text = s.text; if (text == null) { const r = await fetch(s.url); if (!r.ok) throw new Error(`HTTP ${r.status}`); text = await r.text(); }
      const vtt = StremioEngine.toVtt(text, s.fileName || s.url || ''), cues = [];
      const T = /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\n|\n*$)/g;
      const sec = (v) => { const p = v.replace(',', '.').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
      let m; while ((m = T.exec(vtt.replace(/\r/g, '')))) cues.push({ a: sec(m[1]), b: sec(m[2]), t: m[3].replace(/<[^>]+>/g, '').trim() });
      if (!cues.length) throw new Error('no lines found');
      this.sub2 = cues; toast(`Second subtitles: ${subLabel(s)}`, 'ok', 2000, 'sub2');
    } catch (e) { this.sub2i = -1; toast(`Could not load those subtitles (${e.message})`, 'err'); }
  },
  drawSub2(t) {
    let box = $('#sub2'); if (!box) { box = document.createElement('div'); box.id = 'sub2'; box.className = 'sub2'; box.setAttribute('aria-live', 'off'); $('#stage').appendChild(box); }
    t += P.subDelay || 0; const c = this.sub2.find((x) => x.a <= t && t < x.b), txt = c ? c.t : '';
    if (box.textContent !== txt) box.textContent = txt;
  },
  reset() { this.restoreVol(); this.sleepAt = 0; this.sleepEnd = false; this.a = this.b = null; this.sub2 = null; this.sub2i = -1; const s = $('#sub2'); if (s) s.textContent = ''; this.paintMarks(); },

  /* ---- keys you choose ---- */
  ACTIONS: [
    ['play', 'Play or pause', () => togglePlay()], ['back', 'Back', () => seekBy(-step())], ['fwd', 'Forward', () => seekBy(step())],
    ['volUp', 'Volume up', () => { video.volume = clamp(video.volume + 0.05, 0, 1); toast(`Volume ${Math.round(video.volume * 100)}%`, 'info', 900, 'vol'); }],
    ['volDown', 'Volume down', () => { video.volume = clamp(video.volume - 0.05, 0, 1); toast(`Volume ${Math.round(video.volume * 100)}%`, 'info', 900, 'vol'); }],
    ['full', 'Full screen', () => toggleFull()], ['subs', 'Next subtitles', () => cycleSub()], ['audio', 'Next audio track', () => cycleAudio()],
    ['next', 'Next episode', () => playNext()], ['slower', 'Slower', () => nudgeSpeed(-0.25)], ['faster', 'Faster', () => nudgeSpeed(0.25)],
    ['ab', 'A-B repeat', () => Tools.ab()], ['still', 'Save a still', () => Tools.still()],
    ['sleep', 'Sleep timer (15, 30, 60 min, off)', () => { const s = Tools.sleepAt ? Math.round((Tools.sleepAt - Date.now()) / 60000) : 0; Tools.setSleep(!s ? 15 : s <= 15 ? 30 : s <= 30 ? 60 : 0); }],
    ['split', 'Add to Split Screen', () => { if (P.stream && P.stream.url) Split.open({ name: streamTitle(P.ctx), url: P.stream.url, headers: P.stream.behaviorHints && P.stream.behaviorHints.proxyHeaders && P.stream.behaviorHints.proxyHeaders.request }); }],
  ],
  keyName: (k) => ({ ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }[k] || (k.length === 1 ? k.toUpperCase() : k)),
  keymap() { return CFG.keymap || {}; },
  bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (this.capturing) return;
      if ($('#player').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || ''; if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if ($('#player .drawer.open') || !$('#optMenu').hidden || !$('#subMenu').hidden) return;
      const map = this.keymap(), k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const act = Object.keys(map).find((a) => map[a] === k); if (!act) return;
      const a = this.ACTIONS.find((x) => x[0] === act); if (!a) return;
      e.preventDefault(); e.stopImmediatePropagation(); a[2](); wakeHud();
    }, true);
  },
  keysHTML() {
    const map = this.keymap();
    return `<div class="set-row x8-keys"><div><b>Your own keys</b><small>Give any player action a key of your choosing. It works alongside the keys above. Select a row, then press the key.</small></div></div>
      <div class="x8-keygrid">${this.ACTIONS.map(([id, label]) => `<button type="button" class="x8-key" data-nav data-kact="${id}"><span>${esc(label)}</span><kbd>${map[id] ? esc(this.keyName(map[id])) : '—'}</kbd></button>`).join('')}</div>
      <div class="actions" style="margin-top:10px"><button class="btn btn-ghost btn-sm" type="button" data-nav id="kReset"><i data-lucide="rotate-ccw"></i>Clear my keys</button></div>`;
  },
  bindKeysUI() {
    $$('#setBody [data-kact]').forEach((b) => b.addEventListener('click', () => {
      const kbd = $('kbd', b); kbd.textContent = 'Press a key…'; this.capturing = true;
      const done = (e) => {
        e.preventDefault(); e.stopImmediatePropagation();
        // a modifier, Tab or Enter is not a key of its own: say so and keep listening for the next one
        if (/^(Tab|Enter|Shift|Control|Alt|Meta)$/.test(e.key)) { kbd.textContent = 'Pick another key'; return; }
        removeEventListener('keydown', done, true); this.capturing = false;
        if (e.key === 'Escape' || e.key === 'Backspace') { const m = { ...this.keymap() }; delete m[b.dataset.kact]; setCfg('keymap', m); renderSettingsBody(); return; }
        const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, m = { ...this.keymap() };
        Object.keys(m).forEach((a) => { if (m[a] === k) delete m[a]; }); m[b.dataset.kact] = k; setCfg('keymap', m); renderSettingsBody();
        toast(`${this.keyName(k)} now does: ${this.ACTIONS.find((x) => x[0] === b.dataset.kact)[1]}`, 'ok', 2200, 'key');
      };
      addEventListener('keydown', done, true);
    }));
    const r = $('#kReset'); if (r) r.onclick = () => { setCfg('keymap', {}); renderSettingsBody(); toast('Your keys are cleared'); };
  },

  /* ---- seek previews ---- */ /* mk-2644-fast-previews */
  prev: null, prevT: 0, prevSrc: '',
  // pictures already seen, as small canvases. A canvas can show a frame from any host (nothing is read back from it).
  frames: { key: '', list: [], max: 120, W: 192, H: 108 },
  keepFrame(v, key, t) {
    if (!v || !v.videoWidth || !(t >= 0)) return;
    const F = this.frames; if (F.key !== key) { F.key = key; F.list = []; }
    const old = F.list.findIndex((x) => Math.abs(x.t - t) < 0.75); if (old >= 0) F.list.splice(old, 1);
    const c = document.createElement('canvas'); c.width = F.W; c.height = F.H;
    try { c.getContext('2d').drawImage(v, 0, 0, F.W, F.H); } catch (e) { return; }
    F.list.push({ t, c }); F.list.sort((a, b) => a.t - b.t);
    if (F.list.length > F.max) {
      // drop the picture whose neighbours are closest together, so the kept ones stay spread over the film
      let w = 1, gap = Infinity;
      for (let i = 1; i < F.list.length - 1; i++) { const g = F.list[i + 1].t - F.list[i - 1].t; if (g < gap) { gap = g; w = i; } }
      F.list.splice(w, 1);
    }
  },
  nearFrame(key, t, d) {
    const F = this.frames; if (F.key !== key || !F.list.length) return null;
    let best = null; for (const x of F.list) if (!best || Math.abs(x.t - t) < Math.abs(best.t - t)) best = x;
    return best && Math.abs(best.t - t) <= Math.max(10, (d || 0) / 60) ? best : null;
  },
  // shows the nearest kept picture straight away (or keeps the last one up) while the exact one is fetched
  showNear(box, key, t, d) {
    const fr = this.nearFrame(key, t, d);
    if (!fr) return false;
    let c = box.querySelector('canvas.sp-c');
    if (!c) { c = document.createElement('canvas'); c.className = 'sp-c'; c.width = this.frames.W; c.height = this.frames.H; box.appendChild(c); }
    try { c.getContext('2d').drawImage(fr.c, 0, 0); } catch (e) { return false; }
    box.classList.add('cached', 'ok');
    return true;
  },
  // one seek at a time on the preview player: while one runs, only the newest spot waits
  prevSeek(v, t, box) {
    if (!v) return;
    // a quiet fill seek gives way at once to a spot someone is pointing at
    if (v.readyState < 1 || (v.seeking && !(box && v._mkFill))) { v._mkWant = t; return; }
    v._mkWant = null; v._mkAsk = t; v._mkFill = !box;
    try { if (typeof v.fastSeek === 'function' && !v._mkExact) v.fastSeek(t); else v.currentTime = t; } catch (e) { v._mkWant = t; }
  },
  prevVideo(u, box) {
    if (this.prev && this.prevSrc === u) { if (box && this.prev.parentNode !== box) { box.innerHTML = ''; box.appendChild(this.prev); } return this.prev; }
    this.dropPreview();
    const v = this.prev = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.src = u; this.prevSrc = u;
    v.addEventListener('loadedmetadata', () => { if (v._mkWant != null) { const t = v._mkWant; this.prevSeek(v, t, box); } else this.fill(v, u); });
    v.addEventListener('seeked', () => {
      const t = v.currentTime; this.keepFrame(v, u, t);
      if (v._mkFill) { v._mkFill = false; } else if (box) { box.classList.remove('cached'); box.classList.add('ok'); }
      if (v._mkWant != null) { const w = v._mkWant; v._mkWant = null; if (Math.abs(w - t) > 1) this.prevSeek(v, w, box); return; }
      this.fill(v, u);
    });
    v.addEventListener('error', () => { if (box) box.hidden = true; this.prevSrc = 'x'; clearTimeout(this.fillT); });
    if (box) { box.innerHTML = ''; box.appendChild(v); }
    return v;
  },
  // a few spots along the film, filled in one by one, only while the film has plenty buffered and nobody is hovering
  fill(v, u) {
    clearTimeout(this.fillT);
    this.fillT = setTimeout(() => {
      if (v !== this.prev || this.prevSrc !== u || v.seeking || v._mkWant != null || $('#player').hidden || this.hovering) return;
      const d = isFinite(v.duration) ? v.duration : pDur(); if (!(d > 60)) return;
      const c = navigator.connection; if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
      let ahead = 0; const now = video.currentTime;
      for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= now + 0.5 && video.buffered.end(i) > now) ahead = video.buffered.end(i) - now;
      if (ahead < 20 && !video.paused) { this.fill(v, u); return; }
      const F = this.frames, have = F.key === u ? F.list : [];
      const spots = []; for (let n = 1; n < 36; n++) spots.push(d * n / 36);
      const next = spots.find((s) => !have.some((x) => Math.abs(x.t - s) < d / 72));
      if (next == null) return;
      this.prevSeek(v, next, null);
    }, v.readyState < 1 ? 1500 : 1200);
  },
  // the preview player opens a few seconds into the film, so the first hover only waits for one seek
  warm() {
    clearTimeout(this.warmT);
    this.warmT = setTimeout(() => {
      if ($('#player').hidden || video.paused) return;
      const u = this.previewable(true); if (!u) return;
      const box = $('#seek .sp-prev'); this.prevVideo(u, box);
    }, 4000);
  },
  previewable(any) {
    if (CFG.seekPreview === false || (NO_HOVER.matches && !any) || IS_TV || !P.stream || P.hls || P.remux) return '';
    const u = video.currentSrc || ''; if (!u || u.startsWith('blob:') && !P.stream._local) return '';
    return u;
  },
  bindPreview() {
    const seek = $('#seek'), tip = $('#sTip');
    const box = document.createElement('div'); box.className = 'sp-prev'; box.hidden = true; seek.appendChild(box);
    const at = (e) => { const r = seek.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
    let pend = 0;
    seek.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return; const u = this.previewable(), d = pDur(); if (!u || !isFinite(d)) { box.hidden = true; return; }
      this.hovering = true; const v = this.prevVideo(u, box);
      const p = at(e); box.hidden = false; box.style.left = `${clamp(p * 100, 8, 92)}%`;
      const t = p * d; clearTimeout(pend);
      if (!this.showNear(box, u, t, d) && Math.abs(t - this.prevT) > 1 && !box.querySelector('canvas.sp-c')) box.classList.remove('ok');
      pend = setTimeout(() => { if (Math.abs(t - this.prevT) > 1) { this.prevT = t; v._mkExact = false; this.prevSeek(v, t, box); } }, 40);
      void tip;
    });
    seek.addEventListener('pointerleave', () => { box.hidden = true; this.hovering = false; if (this.prev) this.fill(this.prev, this.prevSrc); });
  },
  dropPreview() {
    clearTimeout(this.fillT); clearTimeout(this.warmT); this.hovering = false;
    if (this.prev) { this.prev.removeAttribute('src'); this.prev.load(); this.prev = null; this.prevSrc = ''; }
    const c = document.querySelector('#seek .sp-prev canvas.sp-c'); if (c) c.remove();
  },

  init() {
    // tick four times a second only while the player shows (it used to run all day on a TV)
    { const pl = $('#player'), on = () => { if (pl.hidden) { clearInterval(this.tickT); this.tickT = 0; } else if (!this.tickT) this.tickT = setInterval(() => this.tick(), 250); }; new MutationObserver(on).observe(pl, { attributes: true, attributeFilter: ['hidden'] }); on(); }
    this.bindKeys(); this.bindPreview();
    const reset = PlayerPlus.reset.bind(PlayerPlus);
    PlayerPlus.reset = function () { reset(); Tools.reset(); Tools.dropPreview(); };
    const close = closePlayer;
    closePlayer = async function () { Tools.reset(); Tools.dropPreview(); return close.apply(this, arguments); };
    video.addEventListener('loadedmetadata', () => this.paintMarks());
    video.addEventListener('playing', () => { if (!this.prev || this.prevSrc !== this.previewable(true)) this.warm(); });
    // the film itself leaves a picture every 15 s as it plays (no extra download), so scrubbing back is instant
    let lastKeep = -99;
    video.addEventListener('timeupdate', () => {
      const t = video.currentTime; if (Math.abs(t - lastKeep) < 15 || video.paused || video.seeking) return;
      const u = this.previewable(true); if (!u) return; lastKeep = t; this.keepFrame(video, u, t);
    });
    // the options menu gets a Tools part
    const base = renderOptMenu;
    renderOptMenu = function () {
      base(); const m = $('#optMenu');
      const subs = P.subs.map((s, i) => [s, i]).filter(([s]) => s.kind !== 'hls' && s.kind !== 'native');
      const live = !isFinite(pDur());
      m.insertAdjacentHTML('afterbegin', `<h5>Tools</h5>
        ${!IS_TV ? '<button type="button" data-tl="tv"><i data-lucide="cast"></i>Send to TV</button>' : ''}
        <div class="seg-row tl-sleep" aria-label="Sleep timer"><span class="tl-k"><i data-lucide="moon"></i>Sleep · ${esc(Tools.sleepLabel())}</span>${[[0, 'Off'], [15, '15'], [30, '30'], [60, '60'], ...(live ? [] : [['end', 'End']])].map(([v, l]) => `<button type="button" data-sleep="${v}" class="${(v === 'end' ? Tools.sleepEnd : v === 0 ? !Tools.sleepAt && !Tools.sleepEnd : false) ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${live ? '' : `<button type="button" data-tl="ab"><i data-lucide="repeat"></i>A-B repeat · ${esc(Tools.abLabel())}</button>`}
        ${Tools.canStill() ? '<button type="button" data-tl="still"><i data-lucide="camera"></i>Save a still of this frame</button>' : ''}
        ${subs.length ? `<button type="button" data-tl="sub2"><i data-lucide="languages"></i>Second subtitles · ${Tools.sub2i >= 0 && P.subs[Tools.sub2i] ? esc(subLabel(P.subs[Tools.sub2i])) : 'off'}</button><div class="tl-sub2" hidden>${[['-1', 'Off'], ...subs.map(([s, i]) => [String(i), subLabel(s)])].map(([v, l]) => `<button type="button" data-s2="${v}" class="${String(Tools.sub2i) === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>` : ''}
        ${P.stream && /^https?:/i.test(P.stream.url || '') ? '<button type="button" data-tl="split"><i data-lucide="layout-grid"></i>Add to Split Screen</button>' : ''}`);
      $$('[data-sleep]', m).forEach((b) => b.addEventListener('click', () => { const v = b.dataset.sleep; Tools.setSleep(v === 'end' ? 'end' : Number(v)); renderOptMenu(); }));
      $$('[data-s2]', m).forEach((b) => b.addEventListener('click', () => { Tools.setSub2(Number(b.dataset.s2)); m.hidden = true; }));
      $$('[data-tl]', m).forEach((b) => b.addEventListener('click', () => {
        const a = b.dataset.tl;
        if (a === 'sub2') { const l = $('.tl-sub2', m); l.hidden = !l.hidden; if (IS_TV) Nav.settle(); return; }
        m.hidden = true;
        if (a === 'tv') TvCast.start(); if (a === 'ab') Tools.ab(); if (a === 'still') Tools.still();
        if (a === 'split') Tools.ACTIONS.find((x) => x[0] === 'split')[2]();
      }));
      icons();
    };
    // Settings: seek previews toggle (Playback) and your own keys (Shortcuts)
    const pb = secById('playback'); if (pb) { const rows = pb.rows; pb.rows = () => [...rows(), { group: 'Player tools' }, { key: 'seekPreview', label: 'Seek previews', help: 'On a computer, hovering the seek bar shows the picture at that moment. It reads a little of the file in the background; Split Screen doesn’t use it.', type: 'toggle', get: () => CFG.seekPreview !== false }]; }
    const ks = secById('keys'); if (ks) { const rows = ks.rows, bind = ks.bind; ks.rows = () => [...rows(), { html: () => Tools.keysHTML() }]; ks.bind = () => { if (bind) bind(); Tools.bindKeysUI(); }; }
  },
};
Tools.init();

/* ---------------- Source Check ----------------
   Reads every source against the title it is meant to be: executables and archives, samples, a different episode, a
   different year, a cinema recording, or a file far too small for the quality it claims. Clear mismatches are hidden;
   doubtful ones drop down the list with a plain note. The best match says why it won. Nothing is invented: every note
   comes from the source's own name and size and the title's runtime and year. */
const SourceCheck = {
  on: () => CFG.sourceCheck !== false,
  ctx() { return !$('#player').hidden && P.ctx ? P.ctx : { meta: D.meta, video: D.video }; },
  text(s) { const bh = s.behaviorHints || {}; return [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' \n '); },
  check(s, ctx) {
    const meta = ctx && ctx.meta; const key = `${meta ? meta.id : ''}|${ctx && ctx.video ? ctx.video.id : ''}`;
    if (s._chk && s._chk.key === key) return s._chk;
    const out = { key, hide: '', warn: [], pen: 0 }, t = s._tel || {}, txt = this.text(s), T = txt.toLowerCase();
    if (!t.isTrailer && t.kind !== 'yt') {
      if (/\.(exe|scr|bat|cmd|msi|apk|lnk|zip|rar|7z|iso)\b/i.test(`${(s.behaviorHints || {}).filename || ''} ${s.title || ''}`)) out.hide = 'a program or archive, not a video';
      else if (/\b(password|passwd)\b.*\b(required|protected)\b|\bcodec\s+pack\b/i.test(txt)) out.hide = 'asks for a password or extra software';
      else if (/\bsample\b/i.test(T) && !/samples?\s+(of|from)/i.test(T) && t.sizeBytes && t.sizeBytes < 400 * 1048576) out.hide = 'a short sample';
      const rel = `${s.title || ''} ${(s.behaviorHints || {}).filename || ''}`.replace(/\.(ts|m2ts)\b/gi, '');
      if (/\b(cam|camrip|hdcam|telesync|hdts|ts-?rip|telecine|tc-?rip|hdtc)\b/i.test(T) || /(^|[ ._\-[])(ts|tc)([ ._\-\]]|$)/i.test(rel)) { out.warn.push('Cinema recording'); out.pen += 420; }
      else if (/\b(scr|screener|dvdscr)\b/i.test(T)) { out.warn.push('Screener copy'); out.pen += 200; }
    }
    if (meta && !out.hide && !t.isTrailer) {
      const v = ctx.video;
      if (meta.type === 'series' && v && v.season != null && v.episode != null) {
        const eps = [...txt.matchAll(/\bS(\d{1,2})[ ._-]?E(\d{1,3})(?:[ ._-]?(?:-|E|to)[ ._-]?E?(\d{1,3}))?/gi)];
        if (eps.length) {
          const hit = eps.some((m) => +m[1] === +v.season && (m[3] ? +m[2] <= +v.episode && +v.episode <= +m[3] : +m[2] === +v.episode));
          const packs = /\b(complete|season|pack|S\d{1,2}\s*-\s*S\d{1,2})\b/i.test(txt);
          if (!hit && !packs) out.hide = `a different episode (${eps.map((m) => `S${m[1].padStart(2, '0')}E${m[2].padStart(2, '0')}`).slice(0, 2).join(', ')})`;
        }
      }
      if (meta.type === 'movie') {
        const y = parseInt(yearOf(meta), 10), nameNums = new Set((String(meta.name || '').match(/\b(19|20)\d{2}\b/g) || []));
        const ys = [...txt.matchAll(/(?<![\d.])((?:19|20)\d{2})(?![\dp])/g)].map((m) => m[1]).filter((x) => !nameNums.has(x) && x !== '2160' && x !== '1080');
        if (y && ys.length && !ys.some((x) => Math.abs(+x - y) <= 1)) { out.warn.push(`Says ${ys[0]}, film is ${y}`); out.pen += 260; }
        const min = X8.runtimeMin(meta), gb = t.sizeBytes / 1073741824;
        if (min >= 40 && gb > 0) {
          const floor = { '4K UHD': 1.6, '1440p': 0.9, '1080p': 0.55, '720p': 0.22 }[t.res];
          if (floor && gb < floor * (min / 100)) { out.warn.push(`Small for ${t.res}`); out.pen += 160; }
          if (gb < 0.12 * (min / 100)) { out.hide = 'far too small to be the whole film'; }
        }
      }
    }
    s._chk = out; return out;
  },
  why(s) {
    const t = s._tel || {}, bits = [];
    if (t.res) bits.push(t.res); if (t.hdr) bits.push(t.hdr);
    if (t.cached === true) bits.push('ready on your debrid service');
    if (t.webReady && !t.mkv) bits.push('plays in this browser');
    if (t.audio && t.audio.length) bits.push(t.audio.join(' '));
    const c = s._chk; if (c && !c.warn.length && this.on()) bits.push('name, year and size check out');
    return bits.join(' · ');
  },
  init() {
    const vis = visibleStreams;
    visibleStreams = function (streams) {
      const list = vis.apply(this, arguments);
      if (!SourceCheck.on()) return list;
      const ctx = SourceCheck.ctx();
      const keep = list.filter((s) => !SourceCheck.check(s, ctx).hide);
      // doubtful sources sink; the rest keep their order
      return keep.map((s, i) => [s, i]).sort((a, b) => (a[0]._chk.pen - b[0]._chk.pen) || (a[1] - b[1])).map(([s]) => s);
    };
    const row = streamRowHTML;
    streamRowHTML = function (s, idx, o = {}) {
      let h = row.apply(this, arguments);
      const c = SourceCheck.on() && s._chk;
      if (c && c.warn.length) h = h.replace('<div class="tele">', `<div class="tele">${c.warn.map((w) => `<span class="tb chk"><i data-lucide="alert-triangle"></i>${esc(w)}</span>`).join('')}`);
      if (o.best) { const w = SourceCheck.why(s); if (w) h = h.replace('</div><div class="tele">', `</div><div class="s-why">Why this one: ${esc(w)}</div><div class="tele">`); }
      return h;
    };
    const panel = renderStreamsPanel;
    renderStreamsPanel = function () {
      panel.apply(this, arguments);
      const box = $('#dStreams'); if (!box || !SourceCheck.on() || !D.streams.length) return;
      const ctx = SourceCheck.ctx(), gone = D.streams.filter((s) => s._tel && SourceCheck.check(s, ctx).hide);
      if (gone.length && !$('.chk-line', box)) {
        const why = [...new Set(gone.map((s) => s._chk.hide))].slice(0, 2).join('; ');
        const chips = $('.chips', box); if (chips) chips.insertAdjacentHTML('beforebegin', `<div class="status-line bo-line chk-line"><i data-lucide="shield-check"></i><span>Source Check hid ${gone.length} source${gone.length === 1 ? '' : 's'}: ${esc(why)}. Settings › Streams & addons turns it off.</span></div>`);
        icons();
      }
    };
    const sec = secById('streams');
    if (sec) { const rows = sec.rows; sec.rows = () => [{ key: 'sourceCheck', label: 'Source Check', help: 'Hides programs, archives, samples, other episodes and files far too small to be the film. Cinema recordings, a different year or a small file for the quality drop down the list with a note.', type: 'toggle', get: () => CFG.sourceCheck !== false }, ...rows()]; }
  },
};
SourceCheck.init();

/* ---------------- Discover: Top 10, curated rows, Shortlist, Where to watch, Honours ----------------
   All from Cinemeta, which MKCinema already uses, so nothing needs a key: the ten most popular films (or series) with
   big numerals, films under 90 minutes, hidden gems (well rated, little seen), award winners, and a decade that changes
   every day. Shortlist deals the same pool one poster at a time: right saves, left skips. Where to watch needs the
   user's own TMDB key (Settings › Home) and shows which services carry a title in their region, from JustWatch via TMDB. */
const Curate = {
  pool: null, poolDay: '',
  cinemeta() { return engine.addons.find((a) => a.enabled !== false && /cinemeta/i.test(a.baseUrl)); },
  async cat(type, id, extra = {}) {
    const a = this.cinemeta(); if (!a) return [];
    try { return await engine.fetchCatalog({ addon: a, type, id, name: id }, extra); } catch (e) { return []; }
  },
  async get() {
    const day = X8.dayKey();
    if (this.pool && this.poolDay === day) return this.pool;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const [m0, m1, r0, s0, r1] = await Promise.all([this.cat('movie', 'top'), this.cat('movie', 'top', { skip: 50 }), this.cat('movie', 'imdbRating'), this.cat('series', 'top'), this.cat('series', 'imdbRating')]);
      const dec = this.decade(), years = X8.seeded(Array.from({ length: 10 }, (_, i) => String(dec.from + i)), day).slice(0, 3);
      const d = (await Promise.all(years.map((y) => this.cat('movie', 'year', { genre: y })))).flat();
      const uniq = (l) => { const s = new Set(); return l.filter((m) => m && m.id && !s.has(m.id) && s.add(m.id)); };
      this.pool = { topMovies: m0, topSeries: s0, movies: uniq([...m0, ...m1, ...r0]), series: uniq([...s0, ...r1]), decade: uniq(d), dec };
      this.poolDay = day; this.loading = null; return this.pool;
    })();
    return this.loading;
  },
  decade() { const ds = [1970, 1980, 1990, 2000, 2010]; const from = ds[hash(X8.dayKey()) % ds.length]; return { from, label: from >= 2000 ? `the ${from}s` : `the ’${String(from).slice(2)}s` }; },
  rows(pool) {
    const seen = isWatched, r = (m) => parseFloat(m.imdbRating) || 0;
    const pop = pool.movies.map((m) => Number(m.popularity) || 0).sort((a, b) => a - b), mid = pop[Math.floor(pop.length / 2)] || 0;
    const day = X8.dayKey();
    return {
      short: X8.seeded(pool.movies.filter((m) => { const n = X8.runtimeMin(m); return n >= 60 && n <= 90 && r(m) >= 6.2 && !seen(m.id); }), `${day}s`).slice(0, 24),
      gems: X8.seeded(pool.movies.filter((m) => r(m) >= 7.2 && (Number(m.popularity) || 0) <= mid && !seen(m.id)), `${day}g`).slice(0, 24),
      awards: X8.seeded(pool.movies.filter((m) => /\bwon\s+\d+\s+oscars?\b/i.test(m.awards || '') && !seen(m.id)), `${day}a`).slice(0, 24),
      decade: pool.decade.filter((m) => r(m) >= 6.8).sort((a, b) => r(b) - r(a)).slice(0, 30),
    };
  },
  top10(list) {
    return list.slice(0, 10).map((m, i) => cardHTML(m).replace('<div class="card"', `<div class="card t10c" data-rank="${i + 1}"`)).join('');
  },
  async render() {
    const rows = $('#homeRows'); if (!rows || S.view !== 'home') return;
    const want = ['top10', 'short', 'gems', 'awards', 'decade'].filter((k) => Layout.shows(k));
    $$('#homeRows [data-curate]').forEach((x) => x.remove());
    if (!want.length && !Layout.shows('shortlist')) return;
    const focus = Layout.get().focus, seriesFirst = /^series/.test(focus);
    const secs = {};
    const T = {
      top10: [seriesFirst ? 'Top 10 series today' : 'Top 10 films today', 'The most popular right now'],
      short: ['Under 90 minutes', 'Great films for a short evening'], gems: ['Hidden gems', 'Well rated, little seen'],
      awards: ['Award winners', 'Oscar-winning films'], decade: [`From ${this.decade().label}`, 'Best rated, a new decade every day'],
    };
    // after Continue watching, Your Picks and My watchlist, before the addon catalogs
    const anchor = [...rows.children].find((el) => el.matches('section.row') && !el.id && !/My watchlist/.test((window.i18nEn ? i18nEn(el) : el.textContent).slice(0, 40)) && !el.matches('.picks-row, #picksRow, #cwRow')) || null;
    want.forEach((k) => { if (focus === 'series' && k !== 'top10') return; const s = rowShell(T[k][0], T[k][1]); s.dataset.curate = k; if (k === 'top10') s.classList.add('t10-row'); rows.insertBefore(s, anchor); secs[k] = s; });
    if (Layout.shows('shortlist')) this.shortlistStrip(rows, anchor);
    let pool; try { pool = await this.get(); } catch (e) { pool = null; }
    if (!pool || !pool.movies.length) { Object.values(secs).forEach((s) => s.remove()); return; }
    const got = this.rows(pool);
    Object.entries(secs).forEach(([k, s]) => {
      const list = k === 'top10' ? (seriesFirst ? pool.topSeries : pool.topMovies) : got[k];
      if (!list || list.length < (k === 'top10' ? 5 : 6)) { s.remove(); return; }
      fillRail(s, k === 'top10' ? this.top10(list) : list.map((m) => cardHTML(m)).join(''));
    });
    icons();
  },
  shortlistStrip(rows, anchor) {
    const el = document.createElement('section'); el.className = 'sl-strip'; el.dataset.curate = 'shortlist';
    el.innerHTML = `<div class="sl-t"><span class="pk-mark">Shortlist</span><h3>Twenty films, one at a time.</h3><p>Save the ones you like to your watchlist and skip the rest. Right to save, left to skip.</p></div><button class="btn btn-ghost" type="button" data-nav id="slGo"><i data-lucide="layers"></i>Start a Shortlist</button>`;
    rows.insertBefore(el, anchor); $('#slGo', el).onclick = () => Shortlist.open(); icons();
  },
  init() {
    HOME_ROWS.push(['top10', 'Top 10 today'], ['shortlist', 'Shortlist invitation'], ['short', 'Under 90 minutes'], ['gems', 'Hidden gems'], ['awards', 'Award winners'], ['decade', 'Decade of the day']);
    const home = renderHome;
    renderHome = function () { const p = home.apply(this, arguments); Curate.render(); return p; };
  },
};

const Shortlist = {
  deck: [], i: 0, saved: 0,
  async open() {
    X8.layer('slLayer', { label: 'Shortlist', icon: 'layers', eyebrow: 'Shortlist', wide: true });
    X8.body('slLayer').innerHTML = '<div class="status-line" style="padding:30px"><span class="spin"></span>Dealing twenty films…</div>';
    X8.open('slLayer');
    const pool = await Curate.get().catch(() => null);
    const taste = Store.get('taste', null), liked = new Set(((taste && taste.genres) || []).map((g) => g.toLowerCase()));
    const skip = new Set([...S.watchlist.map((m) => m.id), ...Store.get('slSkipped', [])]);
    const all = pool ? [...pool.movies, ...pool.series] : [];
    const scored = all.filter((m) => !skip.has(m.id) && !isWatched(m.id) && (m.poster || String(m.id).startsWith('tt')))
      .map((m) => [m, (parseFloat(m.imdbRating) || 6) + genresOf(m).filter((g) => liked.has(g.toLowerCase())).length * 0.8 + (hash(m.id + X8.dayKey()) % 100) / 60]);
    this.deck = scored.sort((a, b) => b[1] - a[1]).slice(0, 20).map(([m]) => m); this.i = 0; this.saved = 0;
    if (!this.deck.length) { X8.body('slLayer').innerHTML = '<div class="empty-state"><i data-lucide="layers"></i><h3>Nothing new to deal</h3><p>Cinemeta did not answer, or you have seen or saved everything in today’s pool. Come back tomorrow.</p></div>'; icons(); return; }
    this.paint();
  },
  paint() {
    const b = X8.body('slLayer'), m = this.deck[this.i];
    if (!m) {
      b.innerHTML = `<div class="sl-done"><i data-lucide="check-circle-2"></i><h3>That’s the Shortlist</h3><p>${this.saved ? `${this.saved} film${this.saved === 1 ? '' : 's'} saved to your watchlist.` : 'Nothing caught your eye this time.'}</p><div class="actions"><button class="btn btn-prime" type="button" data-nav id="slLib"><i data-lucide="bookmark"></i>Open my watchlist</button><button class="btn btn-ghost" type="button" data-nav data-x8close>Close</button></div></div>`;
      icons(); $('#slLib').onclick = () => { X8.close('slLayer'); go('library'); }; return;
    }
    const meta = [yearOf(m), X8.runtimeMin(m) ? `${X8.runtimeMin(m)} min` : '', genresOf(m).slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    b.innerHTML = `<div class="sl-wrap"><div class="sl-card" id="slCard"><div class="sl-art">${imgTag(metaPoster(m), m.name, m.id)}</div>
        <div class="sl-info"><span class="sl-n tnum">${this.i + 1} / ${this.deck.length}</span><h3>${esc(m.name)}</h3><p class="sl-meta">${esc(meta)}${m.imdbRating ? ` · <span class="rt ${rateTier(m.imdbRating)}"><svg class="st-ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4l-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z"/></svg> ${esc(m.imdbRating)}</span>` : ''}</p><p class="sl-desc">${esc(String(m.description || '').slice(0, 260))}</p></div></div>
      <div class="sl-acts"><button class="btn btn-ghost" type="button" data-nav data-sl="skip"><i data-lucide="x"></i>Skip</button><button class="btn btn-ghost" type="button" data-nav data-sl="open"><i data-lucide="info"></i>Details</button><button class="btn btn-prime" type="button" data-nav data-sl="save"><i data-lucide="bookmark-plus"></i>Save</button></div></div>`;
    icons();
    $$('[data-sl]', b).forEach((x) => x.addEventListener('click', () => this.act(x.dataset.sl)));
    this.swipe($('#slCard'));
    if (IS_TV) { Nav.settle(); const s = $('[data-sl="save"]', b); if (s) Nav.focus(s, true); }
  },
  act(a) {
    const m = this.deck[this.i]; if (!m) return;
    if (a === 'open') { X8.close('slLayer'); openDetail(m); return; }
    if (a === 'save') { if (!inWatchlist(m.id)) toggleWatchlist(m); this.saved++; }
    if (a === 'skip') { const s = Store.get('slSkipped', []); s.push(m.id); Store.set('slSkipped', s.slice(-400)); }
    const c = $('#slCard'); if (c && !CFG.reduceMotion) { c.classList.add(a === 'save' ? 'out-r' : 'out-l'); setTimeout(() => { this.i++; this.paint(); }, 200); } else { this.i++; this.paint(); }
  },
  swipe(el) {
    if (!el) return; let x0 = null, dx = 0;
    el.addEventListener('pointerdown', (e) => { x0 = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.classList.add('drag'); });
    el.addEventListener('pointermove', (e) => { if (x0 == null) return; dx = e.clientX - x0; el.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`; });
    const end = () => { if (x0 == null) return; x0 = null; el.classList.remove('drag'); el.style.transform = ''; if (Math.abs(dx) > 90) this.act(dx > 0 ? 'save' : 'skip'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  },
  key(e) {
    if (X8.top() !== 'slLayer' || /INPUT|TEXTAREA/.test((e.target || {}).tagName || '')) return;
    if (IS_TV) return; // on a TV the arrows move between the buttons
    if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); this.act('save'); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); this.act('skip'); }
  },
};
document.addEventListener('keydown', (e) => Shortlist.key(e), true);

/* Where to watch and Honours on a title's page */
const WhereToWatch = {
  cache: new Map(),
  region() { if (CFG.region) return CFG.region; const m = String(navigator.language || 'en-US').match(/-([A-Z]{2})$/i); return m ? m[1].toUpperCase() : 'US'; },
  key: () => TMDB.key(),
  async tmdbId(m) {
    if (m.moviedb_id) return m.moviedb_id;
    const imdb = imdbOf(m); if (!imdb) return null;
    const j = await TMDB.find(imdb); if (!j) return null;
    const hit = (m.type === 'series' ? j.tv_results : j.movie_results) || []; return hit[0] && hit[0].id;
  },
  async get(m) {
    const ck = `${m.id}|${this.region()}`; if (this.cache.has(ck)) return this.cache.get(ck);
    const p = (async () => {
      const id = await this.tmdbId(m); if (!id) return null;
      const j = await TMDB.get(`${m.type === 'series' ? 'tv' : 'movie'}/${id}/watch/providers`); if (!j) return null;
      return (j.results || {})[this.region()] || null;
    })().catch(() => { this.cache.delete(ck); return null; }); // a network error is looked up again next time
    this.cache.set(ck, p); return p;
  },
  honours(m) {
    const a = String(m.awards || '').trim(); if (!a) return '';
    const big = a.match(/won\s+(\d+)\s+(oscars?|primetime emmys?|emmys?|golden globes?|baftas?)/i);
    return `<div class="d-honours"><i data-lucide="award"></i><span>${big ? `<b>Won ${esc(big[1])} ${esc(big[2].replace(/^\w/, (c) => c.toUpperCase()))}</b> · ` : ''}${esc(a.replace(/^won\s+\d+\s+[a-z ]+\.\s*/i, '').replace(/\.$/, ''))}</span></div>`;
  },
  async fill(m) {
    const box = $('#dWtw'); if (!box || !this.key() || !/^(movie|series)$/.test(m.type)) return;
    const r = await this.get(m); if (!$('#dWtw') || D.meta !== m) return;
    if (!r) { box.remove(); return; }
    // each service shows once: streaming first, and rent and buy share one row (no duplicate rent/buy buttons)
    const seen = new Set(), pick = (keys) => keys.flatMap((k) => r[k] || []).filter((x) => !seen.has(x.provider_id) && seen.add(x.provider_id)).slice(0, 6);
    // the same service once: "HBO Max Amazon Channel" and "Peacock Premium Plus" fold into HBO Max and Peacock Premium
    const tidy = (list) => list.filter((x) => !list.some((y) => y !== x && x.provider_name.startsWith(`${y.provider_name} `)));
    const grp = [['Stream', ['flatrate']], ['Free', ['free']], ['With ads', ['ads']], ['Rent or buy', ['rent', 'buy']]].map(([l, k]) => [l, tidy(pick(k))]).filter(([, x]) => x.length);
    if (!grp.length) { box.remove(); return; }
    const all = grp.flatMap(([, x]) => x), [l0, f0] = grp[0];
    const line = `${l0 === 'Rent or buy' ? 'Rent or buy on' : l0 === 'Stream' ? 'Stream on' : `${l0} on`} ${f0[0].provider_name}${all.length > 1 ? ` + ${all.length - 1} more` : ''}`;
    const logo = (p, w) => (p.logo_path ? `<img src="https://image.tmdb.org/t/p/${w}${esc(p.logo_path)}" alt="" loading="lazy">` : '');
    // one closed row with the top services' logos; it opens into a plain list
    box.innerHTML = `<details class="wtw-d"><summary class="wtw-sum" data-nav>
        <span class="wtw-h"><b><i data-lucide="tv"></i>Where to watch <small class="wtw-r">${esc(this.region())}</small></b><small>${esc(line)}</small></span>
        <span class="wtw-stack">${all.slice(0, 3).map((p) => logo(p, 'w92')).join('')}</span><i data-lucide="chevron-down" class="wtw-chev"></i></summary>
      <div class="wtw-list">${grp.map(([l, list]) => `<div class="wtw-l">${l}</div>${list.map((p) => `<a class="wtw-p" href="${esc(safeHref(r.link) || '#')}" target="_blank" rel="noopener" data-nav>${logo(p, 'w92')}<span>${esc(p.provider_name)}</span><i data-lucide="external-link"></i></a>`).join('')}`).join('')}
      <p class="wtw-src">Availability from JustWatch, via TMDB.</p></div></details>`;
    icons();
  },
  init() {
    const base = renderDetail;
    renderDetail = function (loading) {
      const r = base.apply(this, arguments); const m = D.meta;
      const desc = $('#detail .d-desc');
      const dropAwards = () => { if (!$('#detail .d-honours')) return; const b = $$('#detail .credits b').find((x) => x.textContent.trim() === 'Awards'); if (b) { if (b.nextElementSibling) b.nextElementSibling.remove(); b.remove(); } };
      if (m && desc && !$('#dWtw')) {
        desc.insertAdjacentHTML('afterend', `${WhereToWatch.honours(m)}${WhereToWatch.key() ? '<div class="wtw" id="dWtw"></div>' : ''}`);
        dropAwards(); icons(); if (!loading) WhereToWatch.fill(m);
      } else if (m && !loading && $('#dWtw') && !$('#dWtw').children.length) WhereToWatch.fill(m);
      return r;
    };
    const sec = secById('home');
    if (sec) {
      const rows = sec.rows;
      const regions = ['US', 'GB', 'CA', 'AU', 'IE', 'NZ', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'NO', 'DK', 'FI', 'PL', 'PT', 'BR', 'MX', 'AR', 'IN', 'JP', 'KR', 'ZA'];
      sec.rows = () => [...rows(), { group: 'Where to watch' },
        { key: 'region', label: 'Your region', help: 'Used for “Where to watch” on title pages. It needs your TMDB key (Settings › Home, under Ambient Mode, or below).', type: 'select', options: [['', `Automatic (${WhereToWatch.region()})`], ...regions.map((r) => [r, r])], get: () => CFG.region || '', set: (v) => { setCfg('region', v); WhereToWatch.cache.clear(); } },
        ...(rows().some((d) => d.key === 'tmdbKey') ? [] : [{ key: 'tmdbKey2', label: 'TMDB key', help: 'A free API key (v3) from themoviedb.org. Stays on this device and in your own account.', type: 'secret', get: () => Keys.get().tmdb || '', set: (v) => TMDB.setKey(v) }])];
    }
  },
};
Curate.init();
WhereToWatch.init();
COMMANDS.push({ label: 'Shortlist: twenty films, one at a time', icon: 'layers', run: () => Shortlist.open() });

/* ---------------- 2.10.0 Seat avatars: original, soft 3D portraits ----------------
   A set of MKCinema's own avatar portraits, drawn as SVG in the browser (no image files to download): clay-like 3D
   shading, a range of skin tones, hair types, head coverings and glasses, plus a few playful characters for kids seats.
   SeatArt.svg(code) draws one; a code is "p:<skin>.<hair>.<hairColour>.<bg>.<shirt>.<extra>" so any portrait can be
   rebuilt anywhere from a few characters, and SeatArt.random() rolls a new one. */
const SeatArt = {
  SKIN: [['#f6d7c3', '#d9a98e'], ['#efc39f', '#c98f6c'], ['#d9a57c', '#a8714d'], ['#b9805a', '#875234'], ['#8d5a3b', '#5e3722'], ['#5f3b27', '#3b2216']],
  HAIRC: ['#1d1715', '#3a2a22', '#6b4429', '#a8743f', '#d9b26a', '#b8432f', '#9aa0a8', '#e9e4dc', '#4b5fd1', '#d06aa0'],
  BG: [['#2c3e66', '#5d7bc0'], ['#5b2d4f', '#b45a8c'], ['#1f4d45', '#47a38c'], ['#6a3b1f', '#d08a4b'], ['#3b2f66', '#8c74d6'], ['#22324a', '#4f8fb8'], ['#5a2222', '#c9584d'], ['#2e4a22', '#7fb05a'], ['#3a3a40', '#8d8d96'], ['#5c4a1b', '#d6b44a']],
  SHIRT: ['#e9e4dc', '#1f2430', '#c9584d', '#4f8fb8', '#d6b44a', '#7fb05a', '#8c74d6', '#e58fb0'],
  HAIRS: ['crop', 'afro', 'long', 'bun', 'buzz', 'curls', 'bob', 'scarf', 'beanie', 'pony', 'waves', 'bald'],
  CRITTERS: ['fox', 'cat', 'bot', 'owl', 'bear', 'astro'],
  /* a curated starting set: varied skin, hair and colour, so the first screen already looks like a household */
  SET: ['p:1.0.2.0.0.0', 'p:4.1.0.1.4.0', 'p:0.2.4.2.2.1', 'p:3.3.0.3.0.0', 'p:5.4.0.4.5.2', 'p:2.6.1.5.6.0', 'p:3.7.0.6.0.0', 'p:0.5.5.7.3.0',
    'p:4.10.0.8.2.1', 'p:2.9.3.9.1.0', 'p:5.11.6.0.4.3', 'p:1.8.0.1.7.0', 'p:3.2.8.4.0.0', 'p:0.0.7.3.5.1', 'p:4.6.9.2.0.0', 'p:2.1.1.5.3.2',
    'c:fox', 'c:cat', 'c:bot', 'c:owl', 'c:bear', 'c:astro'],
  n: 0,
  random() {
    const r = (k) => Math.floor(Math.random() * k);
    if (Math.random() < .12) return `c:${this.CRITTERS[r(this.CRITTERS.length)]}`;
    const hair = r(this.HAIRS.length), natural = Math.random() < .82;
    let ex = Math.random() < .25 ? 1 + r(3) : 0;
    // beards only with natural colours and short styles (a blue beard or a beard under long hair reads oddly)
    if (ex === 2 && (!natural || [2, 6, 7, 9].includes(hair))) ex = 1;
    return `p:${r(6)}.${hair}.${natural ? r(7) : 7 + r(3)}.${r(this.BG.length)}.${r(this.SHIRT.length)}.${ex}`;
  },
  valid(code) { return /^p:\d+\.\d+\.\d+\.\d+\.\d+\.\d+$|^c:[a-z]+$/.test(String(code || '')); },
  shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)))));
    return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  },
  svg(code) {
    const id = `sa${(this.n++).toString(36)}`;
    if (String(code).startsWith('c:')) return this.critter(code.slice(2), id);
    const [sk, hr, hc, bg, sh, ex] = String(code).slice(2).split('.').map(Number);
    const skin = this.SKIN[sk % 6], hair = this.HAIRC[hc % this.HAIRC.length], b = this.BG[bg % this.BG.length], shirt = this.SHIRT[sh % this.SHIRT.length];
    const style = this.HAIRS[hr % this.HAIRS.length], H = this.hair(style, hair, id), d = this.shade(hair, -.35), lt = this.shade(hair, .28);
    const extra = ex % 4; // 0 none, 1 glasses, 2 beard, 3 freckles
    const defs = `<defs>
      <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b[1]}"/><stop offset="1" stop-color="${b[0]}"/></linearGradient>
      <radialGradient id="${id}l" cx=".3" cy=".22" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}s" cx=".38" cy=".3" r=".78"><stop offset="0" stop-color="${this.shade(skin[0], .22)}"/><stop offset=".55" stop-color="${skin[0]}"/><stop offset="1" stop-color="${skin[1]}"/></radialGradient>
      <linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${this.shade(shirt, .2)}"/><stop offset="1" stop-color="${this.shade(shirt, -.35)}"/></linearGradient>
      <radialGradient id="${id}h" cx=".35" cy=".25" r=".85"><stop offset="0" stop-color="${lt}"/><stop offset=".6" stop-color="${hair}"/><stop offset="1" stop-color="${d}"/></radialGradient>
      <radialGradient id="${id}e" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;
    const face = `
      <ellipse cx="60" cy="104" rx="30" ry="9" fill="url(#${id}e)"/>
      <path d="M22 124c2-22 18-32 38-32s36 10 38 32z" fill="url(#${id}t)"/>
      <path d="M50 84h20v12c0 5-20 5-20 0z" fill="${skin[1]}"/>
      ${H.back}
      <ellipse cx="33.5" cy="60" rx="5" ry="7" fill="${skin[1]}"/><ellipse cx="86.5" cy="60" rx="5" ry="7" fill="${skin[1]}"/>
      <ellipse cx="60" cy="57" rx="26.5" ry="30" fill="url(#${id}s)"/>
      <ellipse cx="49" cy="71" rx="5" ry="3" fill="#ff8a8a" opacity=".22"/><ellipse cx="71" cy="71" rx="5" ry="3" fill="#ff8a8a" opacity=".22"/>
      ${extra === 3 ? `<g fill="${skin[1]}" opacity=".7"><circle cx="46" cy="66" r=".9"/><circle cx="49" cy="68" r=".8"/><circle cx="52" cy="66.5" r=".7"/><circle cx="68" cy="66.5" r=".7"/><circle cx="71" cy="68" r=".8"/><circle cx="74" cy="66" r=".9"/></g>` : ''}
      <g><ellipse cx="50" cy="61" rx="4.6" ry="5.2" fill="#fff"/><ellipse cx="70" cy="61" rx="4.6" ry="5.2" fill="#fff"/>
        <circle cx="50.8" cy="62" r="3.2" fill="#2a1c16"/><circle cx="70.8" cy="62" r="3.2" fill="#2a1c16"/>
        <circle cx="52" cy="60.6" r="1.15" fill="#fff"/><circle cx="72" cy="60.6" r="1.15" fill="#fff"/></g>
      <path d="M44.5 52.5q5.5-3.6 11 0M64.5 52.5q5.5-3.6 11 0" stroke="${style === 'bald' || style === 'scarf' || style === 'beanie' ? this.shade(skin[1], -.35) : d}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <ellipse cx="60" cy="69" rx="3.2" ry="2.2" fill="${skin[1]}" opacity=".55"/>
      ${extra === 2 ? `<path d="M37 66c2 18 12 25 23 25s21-7 23-25c-4 9-11 12-23 12s-19-3-23-12z" fill="url(#${id}h)"/>` : ''}
      <path d="M52 76q8 7 16 0q-1 4-8 4.4q-7-.4-8-4.4z" fill="#7a2e2e"/><path d="M54.5 78.3q5.5 2.4 11 0q-1.6 1.8-5.5 1.9q-3.9-.1-5.5-1.9z" fill="#f2a3a3"/>
      ${H.front}
      ${extra === 1 ? `<g fill="none" stroke="#1b1b1f" stroke-width="2"><circle cx="50" cy="61.5" r="7.5"/><circle cx="70" cy="61.5" r="7.5"/><path d="M57.5 61h5M42.5 60l-8-2M77.5 60l8-2"/></g><g fill="#fff" opacity=".18"><circle cx="50" cy="61.5" r="7"/><circle cx="70" cy="61.5" r="7"/></g>` : ''}`;
    return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}<rect width="120" height="120" fill="url(#${id}b)"/>${face}<rect width="120" height="120" fill="url(#${id}l)"/></svg>`;
  },
  hair(style, c, id) {
    const f = `url(#${id}h)`;
    const cap = `<path d="M33 60c-3-24 11-37 27-37s30 13 27 37c-4-11-12-20-27-20s-23 9-27 20z" fill="${f}"/>`;
    switch (style) {
      case 'crop': return { back: '', front: `<path d="M33 58c-3-24 11-36 27-36 17 0 31 11 27 34-3-8-8-13-14-15-8 4-20 4-29 1-6 3-9 9-11 16z" fill="${f}"/>` };
      case 'afro': return { back: `<g fill="${f}">${[[60, 36, 30], [36, 46, 16], [84, 46, 16], [32, 62, 12], [88, 62, 12], [46, 26, 16], [74, 26, 16]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`, front: `<path d="M35 52c4-13 13-17 25-17s21 4 25 17c-6-6-14-8-25-8s-19 2-25 8z" fill="${f}"/>` };
      case 'long': return { back: `<path d="M30 56c0-22 13-34 30-34s30 12 30 34v40c-8 6-18 8-30 8s-22-2-30-8z" fill="${f}"/>`, front: `<path d="M33 62c-2-25 12-38 28-38 15 0 28 11 26 34-6-12-15-18-30-18-9 6-17 12-24 22z" fill="${f}"/>` };
      case 'bun': return { back: `<circle cx="60" cy="20" r="12" fill="${f}"/>`, front: cap };
      case 'buzz': return { back: '', front: `<path d="M33.5 56c-2-21 11-32 26.5-32s28.5 11 26.5 32c-5-9-14-14-26.5-14s-21.5 5-26.5 14z" fill="${c}" opacity=".85"/>` };
      case 'curls': return { back: '', front: `<g fill="${f}">${[[38, 42], [46, 33], [56, 28], [66, 28], [76, 33], [83, 42], [42, 36], [60, 34], [72, 37], [51, 38]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8"/>`).join('')}</g>` };
      case 'bob': return { back: `<path d="M29 58c0-22 13-35 31-35s31 13 31 35v20c-6 4-11 4-14 2V60H43v20c-3 2-8 2-14-2z" fill="${f}"/>`, front: `<path d="M33 56c-1-21 12-33 27-33s28 12 27 33c-8-5-14-12-17-18-6 7-21 14-37 18z" fill="${f}"/>` };
      case 'scarf': return { back: `<path d="M24 66c0-30 16-46 36-46s36 16 36 46v34c-10 10-22 14-36 14s-26-4-36-14z" fill="${f}"/>`, front: `<path d="M31 62c0-22 12-34 29-34s29 12 29 34c-4-12-14-20-29-20S35 50 31 62z" fill="${f}"/><path d="M33 80c6 10 15 14 27 14s21-4 27-14c-2 12-12 22-27 22s-25-10-27-22z" fill="${f}"/>` };
      case 'beanie': return { back: '', front: `<path d="M31 50c0-20 13-31 29-31s29 11 29 31z" fill="${f}"/><rect x="29" y="44" width="62" height="11" rx="5.5" fill="${this.shade(c, -.2)}"/><circle cx="60" cy="18" r="6" fill="${this.shade(c, .3)}"/>` };
      case 'pony': return { back: `<path d="M84 40c14 4 16 24 8 38-2-12-6-20-12-26z" fill="${f}"/>`, front: cap };
      case 'waves': return { back: `<path d="M30 58c0-22 13-35 30-35s30 13 30 35v18c-4 4-8 4-11 0V58H41v18c-3 4-7 4-11 0z" fill="${f}"/>`, front: `<path d="M33 58c-3-23 11-35 27-35s30 12 27 35c-3-7-6-11-11-13-4 4-9 4-13 0-4 4-9 4-13 0-6 2-13 6-17 13z" fill="${f}"/>` };
      default: return { back: '', front: `<ellipse cx="50" cy="34" rx="9" ry="4" fill="#fff" opacity=".18" transform="rotate(-20 50 34)"/>` };
    }
  },
  critter(kind, id) {
    const P = { fox: ['#e8823a', '#fff4e6', '#5c2d14', ['#3a2a55', '#7d5fc0']], cat: ['#9aa0a8', '#f1efe9', '#2c2f35', ['#1f4d45', '#47a38c']], bot: ['#b9c3d0', '#e8eef5', '#2a3445', ['#5a2222', '#c9584d']],
      owl: ['#8a6a4a', '#efe2c8', '#3b2a1c', ['#22324a', '#4f8fb8']], bear: ['#7a5236', '#d9b48f', '#2e1d12', ['#2e4a22', '#7fb05a']], astro: ['#eef1f5', '#2a3445', '#1b2230', ['#14142a', '#3b3b8c']] }[kind] || ['#9aa0a8', '#f1efe9', '#2c2f35', ['#3a3a40', '#8d8d96']];
    const [main, light, dark, bg] = P;
    const defs = `<defs><linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[1]}"/><stop offset="1" stop-color="${bg[0]}"/></linearGradient>
      <radialGradient id="${id}m" cx=".36" cy=".28" r=".8"><stop offset="0" stop-color="${this.shade(main, .3)}"/><stop offset=".6" stop-color="${main}"/><stop offset="1" stop-color="${this.shade(main, -.35)}"/></radialGradient>
      <radialGradient id="${id}l" cx=".3" cy=".22" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}e" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;
    const eyes = (y = 58, sp = 11) => `<g><ellipse cx="${60 - sp}" cy="${y}" rx="5.4" ry="6" fill="#fff"/><ellipse cx="${60 + sp}" cy="${y}" rx="5.4" ry="6" fill="#fff"/><circle cx="${60 - sp + 1}" cy="${y + 1}" r="3.6" fill="${dark}"/><circle cx="${60 + sp + 1}" cy="${y + 1}" r="3.6" fill="${dark}"/><circle cx="${60 - sp + 2.3}" cy="${y - .6}" r="1.3" fill="#fff"/><circle cx="${60 + sp + 2.3}" cy="${y - .6}" r="1.3" fill="#fff"/></g>`;
    const shadow = `<ellipse cx="60" cy="104" rx="32" ry="9" fill="url(#${id}e)"/>`;
    let body = '';
    if (kind === 'fox' || kind === 'cat') {
      const ear = kind === 'fox' ? 'M30 48L36 14l22 22zM90 48L84 14 62 36z' : 'M32 46l2-28 20 16zM88 46l-2-28-20 16z';
      body = `${shadow}<path d="${ear}" fill="url(#${id}m)"/><path d="${kind === 'fox' ? 'M36 40l2-16 10 10zM84 40l-2-16-10 10z' : 'M36 38l1-14 9 8zM84 38l-1-14-9 8z'}" fill="${light}" opacity=".8"/>
        <ellipse cx="60" cy="62" rx="32" ry="30" fill="url(#${id}m)"/><path d="M34 70c6 14 15 20 26 20s20-6 26-20c-8 6-16 8-26 8s-18-2-26-8z" fill="${light}"/>
        ${eyes(58, 12)}<path d="M56 72h8l-4 4z" fill="${dark}"/><path d="M60 76q-4 4-8 2M60 76q4 4 8 2" stroke="${dark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        ${kind === 'cat' ? `<path d="M30 70h-12M30 74l-11 3M90 70h12M90 74l11 3" stroke="${light}" stroke-width="1.4" stroke-linecap="round"/>` : ''}`;
    } else if (kind === 'bot') {
      body = `${shadow}<rect x="57" y="12" width="6" height="14" rx="3" fill="${dark}"/><circle cx="60" cy="12" r="5" fill="#ff6b5b"/><rect x="28" y="26" width="64" height="66" rx="20" fill="url(#${id}m)"/>
        <rect x="35" y="44" width="50" height="28" rx="12" fill="${dark}"/><circle cx="49" cy="58" r="6" fill="#7df0ff"/><circle cx="71" cy="58" r="6" fill="#7df0ff"/><circle cx="51" cy="56" r="2" fill="#fff"/><circle cx="73" cy="56" r="2" fill="#fff"/>
        <path d="M50 80q10 6 20 0" stroke="${dark}" stroke-width="2.4" fill="none" stroke-linecap="round"/><rect x="20" y="50" width="8" height="18" rx="4" fill="${this.shade(main, -.2)}"/><rect x="92" y="50" width="8" height="18" rx="4" fill="${this.shade(main, -.2)}"/>`;
    } else if (kind === 'owl') {
      body = `${shadow}<path d="M30 40l8-16 10 12zM90 40l-8-16-10 12z" fill="url(#${id}m)"/><ellipse cx="60" cy="64" rx="32" ry="32" fill="url(#${id}m)"/>
        <circle cx="47" cy="58" r="12" fill="${light}"/><circle cx="73" cy="58" r="12" fill="${light}"/><circle cx="47" cy="58" r="6.5" fill="${dark}"/><circle cx="73" cy="58" r="6.5" fill="${dark}"/><circle cx="49" cy="56" r="2.2" fill="#fff"/><circle cx="75" cy="56" r="2.2" fill="#fff"/>
        <path d="M56 68h8l-4 8z" fill="#f2b33d"/><path d="M44 80q4 4 8 0q4 4 8 0q4 4 8 0q4 4 8 0" stroke="${light}" stroke-width="1.6" fill="none" opacity=".7"/>`;
    } else if (kind === 'bear') {
      body = `${shadow}<circle cx="34" cy="34" r="11" fill="url(#${id}m)"/><circle cx="86" cy="34" r="11" fill="url(#${id}m)"/><circle cx="34" cy="34" r="5.5" fill="${light}"/><circle cx="86" cy="34" r="5.5" fill="${light}"/>
        <ellipse cx="60" cy="62" rx="31" ry="30" fill="url(#${id}m)"/><ellipse cx="60" cy="74" rx="14" ry="11" fill="${light}"/>${eyes(56, 12)}<ellipse cx="60" cy="70" rx="5" ry="3.6" fill="${dark}"/><path d="M60 74v4M60 78q-4 3-7 1M60 78q4 3 7 1" stroke="${dark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    } else {
      body = `${shadow}<path d="M24 124c2-22 18-32 36-32s34 10 36 32z" fill="url(#${id}m)"/><circle cx="60" cy="58" r="34" fill="url(#${id}m)"/><ellipse cx="60" cy="60" rx="24" ry="21" fill="${light}"/>
        <ellipse cx="54" cy="52" rx="9" ry="5" fill="#fff" opacity=".22" transform="rotate(-25 54 52)"/><circle cx="74" cy="66" r="2" fill="#fff" opacity=".7"/><circle cx="48" cy="70" r="1.2" fill="#fff" opacity=".6"/><circle cx="66" cy="50" r="1" fill="#fff" opacity=".6"/>
        <rect x="24" y="52" width="6" height="14" rx="3" fill="${this.shade(main, -.2)}"/><rect x="90" y="52" width="6" height="14" rx="3" fill="${this.shade(main, -.2)}"/>`;
    }
    return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}<rect width="120" height="120" fill="url(#${id}b)"/>${body}<rect width="120" height="120" fill="url(#${id}l)"/></svg>`;
  },
};

/* ---------------- Seats: everyone in the house gets their own ----------------
   One account, several seats. Each seat keeps its own watchlist, progress, watched list, taste and searches (Store keys
   are scoped per seat, see SEAT_KEYS at the top of the app). A seat can have a 4-digit PIN. A kids seat only shows
   Animation and Family titles, has no Live TV, and needs the grown-up PIN for Settings, Addons and to leave.
   PINs are stored as slow salted hashes (PBKDF2, older seats as SHA-256 until the PIN is next typed), never as digits.
   A PIN is a household lock, not security: anyone who can open this browser's storage can get past it.
   Seats travel with account sync. */
const Seats = {
  list() { return Store.raw.get('seats', []) || []; },
  saveList(l) { Store.raw.set('seats', l); Account.schedule(); },
  owner() { return { id: '', name: Store.raw.get('ownerSeatName', '') || (Account.user ? Account.name().split('@')[0] : 'Main'), color: '#d9d4c7', pin: Store.raw.get('ownerPin', ''), kids: false, av: Store.raw.get('ownerAv', '') }; },
  all() { return [this.owner(), ...this.list()]; },
  cur() { return this.all().find((s) => s.id === SEAT) || this.owner(); },
  kids() { return !!this.cur().kids; },
  COLORS: ['#d9d4c7', '#bccde4', '#e3c8bd', '#e8d7b8', '#9ccfb0', '#c9b6e4', '#e5a3a3', '#a3d3e5'],
  async hashPin(id, pin) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mkc-seat:${id}:${pin}`)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); },
  PIN_IT: 120000,
  async pbkdf(id, pin, salt, it) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(`mkc-seat:${id}:${pin}`), 'PBKDF2', false, ['deriveBits']);
    return b64url.enc(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64url.dec(salt), iterations: it }, k, 256)));
  },
  async makePin(id, pin) { const salt = b64url.enc(crypto.getRandomValues(new Uint8Array(16))); return `pb2$${this.PIN_IT}$${salt}$${await this.pbkdf(id, pin, salt, this.PIN_IT)}`; },
  async checkPin(s, pin) {
    const h = String(s.pin || '');
    if (h.startsWith('pb2$')) { const [, it, salt, want] = h.split('$'); try { return (await this.pbkdf(s.id, pin, salt, Math.min(1e6, Math.max(1000, Number(it) || this.PIN_IT)))) === want; } catch (e) { return false; } }
    if (!h || (await this.hashPin(s.id, pin)) !== h) return false;
    // an older quick hash: now that the right PIN is known, keep the slow one instead
    try {
      const nh = await this.makePin(s.id, pin);
      if (s.id === '') { Store.raw.set('ownerPin', nh); Account.schedule(); } else { const l = this.list(), i = l.findIndex((x) => x.id === s.id); if (i >= 0) { l[i] = { ...l[i], pin: nh }; this.saveList(l); } }
      s.pin = nh;
    } catch (e) { /* keep the old one */ }
    return true;
  },
  /* 2.10.0: what a seat shows. 'photo' = the account's profile photo (main seat only), 'letter' = the old initial,
     a SeatArt code = one of the portraits. A seat that never chose shows the account photo (main seat) or a portrait
     picked from its id, so it looks the same on every device without anything being saved. */
  artOf(s) {
    const av = s.av || '', photo = s.id === '' && Store.get('avatar', null);
    if (av === 'letter') return 'letter';
    if (av === 'photo') return photo ? 'photo' : 'letter';
    if (typeof SeatArt !== 'undefined' && SeatArt.valid(av)) return av;
    if (photo) return 'photo';
    if (typeof SeatArt === 'undefined') return 'letter';
    const people = SeatArt.SET.filter((c) => c[0] === 'p'), h = [...String(s.id || 'main')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    return people[h % people.length];
  },
  avatar(s, lg, force) {
    const a = force || this.artOf(s), cls = `seat-av${lg ? ' lg' : ''}${s.kids ? ' kids' : ''}`;
    if (a === 'photo') return `<span class="${cls} img"><img src="${esc(Store.get('avatar', ''))}" alt=""></span>`;
    if (a !== 'letter') return `<span class="${cls} art">${SeatArt.svg(a)}</span>`;
    return `<span class="${cls}" style="--sc:${esc(s.color || '#d9d4c7')}">${esc((s.name || '?').trim()[0] || '?').toUpperCase()}</span>`;
  },
  managing: false,
  /* ---- the chooser ---- */
  pick({ force = false } = {}) {
    if (!this.list().length && !force) return;
    X8.layer('seatPick', { label: 'Who’s watching?', full: true });
    X8.backHook.seatPick = () => { const p = $('#seatPin'); if (p && !p.hidden) { p.hidden = true; Nav.settle(); return true; } return !force && !Store.raw.get('seatChosen', false) ? true : false; };
    const b = X8.body('seatPick'), m = this.managing;
    b.innerHTML = `<div class="seat-wrap"><span class="pk-mark">MKCinema</span><h2 class="seat-h">${m ? 'Manage seats' : 'Who’s watching?'}</h2>
      <div class="seat-grid${m ? ' manage' : ''}">${this.all().map((s) => `<button type="button" class="seat" data-nav data-seat="${esc(s.id)}" aria-label="${m ? `Edit ${esc(s.name)}` : esc(s.name)}"><span class="seat-face">${this.avatar(s, true)}${m ? '<span class="seat-pen"><i data-lucide="pencil"></i></span>' : ''}</span><b>${esc(s.name)}</b><small>${m ? 'Edit' : s.kids ? 'Kids' : s.pin ? 'PIN' : s.id === SEAT ? 'Here now' : '&nbsp;'}</small></button>`).join('')}
      <button type="button" class="seat add" data-nav id="seatAdd"><span class="seat-av lg add"><i data-lucide="plus"></i></span><b>Add a seat</b><small>&nbsp;</small></button></div>
      <button type="button" class="btn ${m ? 'btn-prime' : 'btn-ghost'} seat-manage" data-nav id="seatManage">${m ? '<i data-lucide="check"></i>Done' : '<i data-lucide="pencil"></i>Manage seats'}</button></div>
      <div class="seat-pin x8-sub" id="seatPin" hidden></div>`;
    icons();
    $$('[data-seat]', b).forEach((x) => x.addEventListener('click', () => (this.managing ? this.editFromPicker(x.dataset.seat) : this.enter(x.dataset.seat))));
    $('#seatManage').onclick = () => { this.managing = !this.managing; this.pick({ force: true }); if (IS_TV) Nav.focus($('#seatManage'), true); };
    $('#seatAdd').onclick = () => this.guard(() => this.edit(null));
    if ($('#seatPick').hidden) X8.open('seatPick'); // a redraw (account loaded, Manage seats) keeps the open layer: no second sound
    if (IS_TV && !m) { const c = $(`[data-seat="${SEAT}"]`, b); if (c) Nav.focus(c, true); }
  },
  /* editing from the picker: a kids seat needs the grown-up PIN, and someone else's locked seat needs its own PIN */
  editFromPicker(id) {
    const s = this.all().find((x) => x.id === id); if (!s) return;
    this.guard(() => (s.pin && s.id !== SEAT && !this.unlocked ? this.askPin(s, () => this.edit(id)) : this.edit(id)));
  },
  async enter(id) {
    const s = this.all().find((x) => x.id === id); if (!s) return;
    const from = this.cur();
    const go = () => { Store.raw.set('seatChosen', true); try { sessionStorage.setItem('mkc:seatOk', '1'); } catch (e) { /* private mode */ } if (id === SEAT) { X8.close('seatPick'); return; } Account.flush().catch(() => {}).finally(() => { try { localStorage.setItem('mkc:seat', id); } catch (e) { /* blocked */ } location.reload(); }); };
    // leaving a kids seat takes the grown-up PIN; entering a seat with a PIN takes that seat's PIN
    if (from.kids && id !== SEAT && this.owner().pin) return this.askPin(this.owner(), () => (s.pin && s.id !== '' ? this.askPin(s, go) : go()), 'Grown-up PIN to leave the kids seat');
    if (s.pin && id !== SEAT) return this.askPin(s, go);
    go();
  },
  askPin(s, ok, title) {
    let box = $('#seatPin');
    if (!box || $('#seatPick').hidden) { this.pick({ force: true }); box = $('#seatPin'); }
    let v = '';
    const paint = () => {
      box.innerHTML = `<div class="modal glass-solid pp-modal seat-pad">${this.avatar(s, true)}<h3 class="x8-h">${esc(title || `PIN for ${s.name}`)}</h3><div class="pin-dots">${[0, 1, 2, 3].map((i) => `<i class="${i < v.length ? 'on' : ''}"></i>`).join('')}</div>
        <div class="pin-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'x', 0, 'ok'].map((k) => `<button type="button" data-nav data-pk="${k}" ${k === 'ok' ? 'class="pk-ok"' : ''}>${k === 'x' ? '<i data-lucide="delete"></i>' : k === 'ok' ? '<i data-lucide="check"></i>' : k}</button>`).join('')}</div>
        <button class="btn btn-ghost btn-sm" type="button" data-nav id="pinCancel">Cancel</button></div>`;
      icons(); $$('[data-pk]', box).forEach((x) => x.addEventListener('click', () => press(x.dataset.pk)));
      $('#pinCancel').onclick = () => { box.hidden = true; Nav.settle(); };
    };
    const press = async (k) => {
      if (k === 'x') v = v.slice(0, -1); else if (k === 'ok' || v.length >= 4) { /* check below */ } else v += k;
      if (v.length === 4 || k === 'ok') {
        const wait = Math.ceil(((Seats.lockUntil || 0) - Date.now()) / 1000);
        if (wait > 0) { v = ''; paint(); toast(`Too many tries. Wait ${wait} s`, 'err', 1800, 'pin'); return; }
        if (await this.checkPin(s, v)) { Seats.fails = 0; box.hidden = true; ok(); return; }
        Seats.fails = (Seats.fails || 0) + 1;
        if (Seats.fails >= 5) { Seats.fails = 0; Seats.lockUntil = Date.now() + 60e3; }
        v = ''; paint(); toast(Seats.lockUntil > Date.now() ? 'Too many tries. Wait a minute' : 'That PIN is not right', 'err', 1800, 'pin'); return;
      }
      paint(); const f = $(`[data-pk="${k}"]`, box); if (IS_TV && f) Nav.focus(f, true);
    };
    box.hidden = false; paint(); if (IS_TV) Nav.settle();
    box.onkeydown = (e) => { if (/^\d$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); press(e.key); } if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); press('x'); } };
    box.tabIndex = -1; if (!IS_TV) box.focus();
  },
  /* grown-up gate for a kids seat */
  unlocked: false, unlockedAt: 0, fails: 0, lockUntil: 0,
  guard(fn) {
    if (this.unlocked && Date.now() - this.unlockedAt > 10 * 60e3) this.unlocked = false;   // the grown-up unlock lasts 10 minutes
    if (!this.kids() || this.unlocked || !this.owner().pin) { if (this.kids() && !this.owner().pin && !this.unlocked) { /* no grown-up PIN set: nothing to check */ } return fn(); }
    this.askPin(this.owner(), () => { this.unlocked = true; this.unlockedAt = Date.now(); if (!this.managing) X8.close('seatPick'); fn(); }, 'Grown-up PIN');
  },
  kidSafe(m) {
    if (!m) return true;
    const g = genresOf(m).map((x) => String(x).toLowerCase());
    if (!g.length) return false;
    return g.some((x) => /animation|family|kids|children/.test(x)) && !g.some((x) => /horror|thriller|crime|war/.test(x));
  },
  /* ---- Settings › Seats ---- */
  section() {
    const me = this.cur();
    return { id: 'seats', icon: 'users', label: 'Seats', intro: 'Everyone in the house gets their own seat: their own watchlist, progress and picks. A seat can have a PIN, and a kids seat shows only Animation and Family titles.', bind: () => this.bindSection(), rows: () => [
      { html: () => `<div class="seat-rows">${this.all().map((s) => `<div class="seat-row${s.id === SEAT ? ' here' : ''}">${this.avatar(s)}<div><b>${esc(s.name)}</b><small>${s.id === SEAT ? '<span class="seat-here">Watching now</span>' : ''}${[s.id === '' ? 'Main seat' : '', s.kids ? 'Kids' : '', s.pin ? 'PIN on' : 'No PIN'].filter(Boolean).join(' · ')}</small></div>
          <div class="inrow">${s.id !== SEAT ? `<button class="btn btn-ghost btn-sm" type="button" data-nav data-sgo="${esc(s.id)}">Switch</button>` : ''}<button class="btn btn-ghost btn-sm" type="button" data-nav data-sed="${esc(s.id)}"><i data-lucide="pencil"></i>Edit</button></div></div>`).join('')}</div>` },
      { key: 'seatAdd', label: 'Add a seat', help: 'Up to 7 more seats on this account.', type: 'button', text: 'Add a seat', icon: 'user-plus', run: () => this.edit(null) },
      { key: 'seatAsk', label: 'Ask who’s watching', help: 'Show the seats each time MKCinema opens, once there is more than one.', type: 'toggle', get: () => CFG.seatAsk !== false },
      { html: () => (this.list().some((x) => x.kids) && !this.owner().pin ? '<p class="tour-note seat-warn">A kids seat has no lock yet: anyone can leave it. Edit your main seat and set a grown-up PIN.</p>' : '') },
      { html: () => `<p class="tour-note">${me.kids ? 'This is a kids seat.' : 'Seats are not separate accounts: anyone with this device can pick a seat without a PIN. A PIN keeps a seat to its owner and little hands out of Settings. It’s a light lock, not real security.'}</p>` },
    ] };
  },
  bindSection() {
    $$('#setBody [data-sgo]').forEach((b) => b.addEventListener('click', () => { closeLayer('settings'); this.enter(b.dataset.sgo); }));
    $$('#setBody [data-sed]').forEach((b) => b.addEventListener('click', () => this.edit(b.dataset.sed)));
  },
  edit(id) {
    const isNew = id == null, s = isNew ? { id: `s${Date.now().toString(36)}`, name: '', color: this.COLORS[(this.list().length + 1) % this.COLORS.length], kids: false, pin: '', av: this.freshArt() } : { ...this.all().find((x) => x.id === id) };
    if (!s.av || !(s.av === 'letter' || s.av === 'photo' || SeatArt.valid(s.av))) s.av = this.artOf(s);
    const photo = s.id === '' && Store.get('avatar', null);
    let rolled = SeatArt.SET.includes(s.av) || s.av === 'photo' || s.av === 'letter' ? '' : s.av;
    if (isNew && this.list().length >= 7) { toast('Seven extra seats is the most', 'err'); return; }
    X8.layer('seatEdit', { label: 'Seat', icon: 'users', eyebrow: 'Seats' });
    const b = X8.body('seatEdit');
    b.innerHTML = `<h3 class="x8-h">${isNew ? 'Add a seat' : `Edit ${esc(s.name)}`}</h3>
      <div class="x8-form"><div class="se-top"><span id="seFace">${this.avatar(s, true, s.av)}</span><label>Name<input class="inp" id="seName" maxlength="20" value="${esc(s.name)}" placeholder="Name" autocomplete="off"></label></div>
      <div class="se-avh"><b>Picture</b><button class="btn btn-ghost btn-sm" type="button" data-nav id="seRoll"><i data-lucide="wand-sparkles"></i>Surprise me</button></div>
      <div class="seat-avs" role="radiogroup" aria-label="Picture" id="seAvs"></div>
      <div class="seat-colors" role="radiogroup" aria-label="Colour" id="seCols"${s.av === 'letter' ? '' : ' hidden'}>${this.COLORS.map((c) => `<button type="button" data-nav data-col="${c}" class="${c === s.color ? 'on' : ''}" style="--sc:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
      ${s.id !== '' ? `<div class="set-row"><div><b>Kids seat</b><small>Only Animation and Family titles, no Live TV, and the grown-up PIN for Settings and Addons.</small></div><div class="set-ctl"><button class="switch ${s.kids ? 'on' : ''}" type="button" id="seKids" role="switch" aria-checked="${!!s.kids}" aria-label="Kids seat"></button></div></div>` : ''}
      ${s.id !== '' && !this.owner().pin ? '<label id="seGrownL">Grown-up PIN (4 digits). A kids seat needs one, so only a grown-up can leave it or open Settings<input class="inp mono" id="seGrown" inputmode="numeric" maxlength="4" placeholder="Set a grown-up PIN" autocomplete="off"></label>' : ''}
      <label>${s.id === '' ? 'Grown-up PIN (4 digits, guards kids seats too)' : 'PIN (4 digits, optional)'}<input class="inp mono" id="sePin" inputmode="numeric" maxlength="4" placeholder="${s.pin ? '•••• (leave empty to keep)' : 'No PIN'}" autocomplete="off"></label>
      ${s.pin ? '<button class="btn btn-ghost btn-sm" type="button" data-nav id="seNoPin"><i data-lucide="lock-open"></i>Remove the PIN</button>' : ''}</div>
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="seSave"><i data-lucide="check"></i>Save</button>${!isNew && s.id !== '' && s.id !== SEAT ? '<button class="btn btn-ghost danger" type="button" data-nav id="seDel"><i data-lucide="trash-2"></i>Remove seat</button>' : ''}</div>`;
    const avs = () => [...(photo ? ['photo'] : []), ...(rolled ? [rolled] : []), ...SeatArt.SET, 'letter'];
    const face = () => { $('#seFace', b).innerHTML = this.avatar({ ...s, name: $('#seName', b).value || s.name || '?' }, true, s.av); $('#seCols', b).hidden = s.av !== 'letter'; };
    const paintAvs = () => {
      $('#seAvs', b).innerHTML = avs().map((a) => `<button type="button" data-nav data-av="${esc(a)}" class="${a === s.av ? 'on' : ''}" role="radio" aria-checked="${a === s.av}" aria-label="${a === 'photo' ? 'Your profile photo' : a === 'letter' ? 'First letter of the name' : 'Portrait'}">${this.avatar({ ...s, name: $('#seName', b).value || s.name || '?', kids: false }, false, a)}</button>`).join('');
      $$('[data-av]', b).forEach((x) => x.addEventListener('click', () => { s.av = x.dataset.av; $$('[data-av]', b).forEach((y) => { y.classList.toggle('on', y === x); y.setAttribute('aria-checked', y === x); }); face(); }));
    };
    paintAvs(); icons();
    $('#seRoll', b).onclick = () => { let r; do r = SeatArt.random(); while (r === s.av); rolled = r; s.av = r; paintAvs(); face(); };
    $('#seName', b).addEventListener('input', () => { if (s.av === 'letter') face(); });
    $$('[data-col]', b).forEach((x) => x.addEventListener('click', () => { s.color = x.dataset.col; $$('[data-col]', b).forEach((y) => y.classList.toggle('on', y === x)); face(); }));
    const k = $('#seKids', b); if (k) k.onclick = () => { s.kids = !s.kids; k.classList.toggle('on', s.kids); k.setAttribute('aria-checked', s.kids); };
    const np = $('#seNoPin', b); if (np) np.onclick = () => { s.pin = ''; np.remove(); toast('PIN will be removed when you save'); };
    $('#sePin', b).addEventListener('keydown', (e) => e.stopPropagation());
    $('#seName', b).addEventListener('keydown', (e) => e.stopPropagation());
    const gIn = $('#seGrown', b); if (gIn) gIn.addEventListener('keydown', (e) => e.stopPropagation());
    $('#seSave').onclick = () => this.guard(async () => {
      s.name = $('#seName').value.trim() || (s.id === '' ? 'Main' : 'Guest'); const pin = $('#sePin').value.trim();
      if (pin && !/^\d{4}$/.test(pin)) { toast('A PIN is 4 digits', 'err'); return; }
      if (pin) s.pin = await this.makePin(s.id, pin);
      const gEl = $('#seGrown'), grown = gEl ? gEl.value.trim() : '';
      if (s.kids && s.id !== '' && !this.owner().pin) {
        if (!/^\d{4}$/.test(grown)) { toast('Set a 4-digit grown-up PIN first, so kids can’t leave their seat', 'err', 4200); if (gEl) gEl.focus(); return; }
        Store.raw.set('ownerPin', await this.makePin('', grown)); Account.schedule();
      }
      if (s.id === '') { Store.raw.set('ownerSeatName', s.name); Store.raw.set('ownerPin', s.pin || ''); Store.raw.set('ownerAv', s.av || ''); Account.schedule(); }
      else { const l = this.list(), i = l.findIndex((x) => x.id === s.id), row = { id: s.id, name: s.name, color: s.color, kids: !!s.kids, pin: s.pin || '', av: s.av || '' }; if (i >= 0) l[i] = row; else l.push(row); this.saveList(l); }
      X8.close('seatEdit'); this.refresh(); toast(isNew ? `${s.name} has a seat` : 'Seat saved', 'ok');
    });
    const del = $('#seDel'); if (del) del.onclick = () => confirmTwice(del, () => this.guard(() => {
      this.saveList(this.list().filter((x) => x.id !== s.id));
      try { Object.keys(localStorage).filter((x) => x.startsWith(`mkc:seat:${s.id}:`)).forEach((x) => localStorage.removeItem(x)); } catch (e) { /* blocked */ }
      X8.close('seatEdit'); this.refresh(); toast('Seat removed');
    }));
    X8.open('seatEdit');
    if (IS_TV) { if (typeof TvType !== 'undefined') ['#seName', '#sePin', '#seGrown'].forEach((q) => { const el = $(q, b); if (el) TvType.guard(el); }); const on = $('#seAvs .on', b); if (on) Nav.focus(on, true); }
  },
  /* a new seat starts on a portrait nobody in the house has yet */
  freshArt() {
    const used = new Set(this.all().map((x) => this.artOf(x))), free = SeatArt.SET.filter((c) => c[0] === 'p' && !used.has(c));
    return free.length ? free[Math.floor(Math.random() * free.length)] : SeatArt.random();
  },
  refresh() {
    if (!$('#settings').hidden) renderSettingsBody();
    const p = $('#seatPick'); if (p && !p.hidden) { this.pick({ force: true }); if (IS_TV) Nav.settle(); }
    Account.chip();
  },
  /* ---- sync: the main seat's library stays the account's library; other seats ride along under d.seats ---- */
  seatData(id) {
    const g = (k, d) => { try { const v = localStorage.getItem(`mkc:seat:${id}:${k}`); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
    return { watchlist: g('watchlist', []), progress: g('progress', {}), watched: g('watched', {}), taste: g('taste', null) };
  },
  initSync() {
    const ex = exportData;
    exportData = function () {
      const d = ex.apply(this, arguments);
      if (SEAT) ['watchlist', 'progress', 'watched', 'taste'].forEach((k) => { d[k] = Store.raw.get(k, k === 'watchlist' ? [] : k === 'taste' ? null : {}); });
      const list = Seats.list();
      d.seats = { list, ownerName: Store.raw.get('ownerSeatName', ''), ownerPin: Store.raw.get('ownerPin', ''), ownerAv: Store.raw.get('ownerAv', ''), data: Object.fromEntries(list.map((s) => [s.id, Seats.seatData(s.id)])) };
      return d;
    };
    const ap = Account.applyRemote.bind(Account);
    Account.applyRemote = function (d) {
      if (!d) return ap(d);
      const lib = {}; if (SEAT) ['watchlist', 'progress', 'watched', 'taste'].forEach((k) => { if (k in d) { lib[k] = d[k]; delete d[k]; } });
      ap(d);
      Object.entries(lib).forEach(([k, v]) => Store.raw.set(k, v));
      const z = d.seats; if (!z || !Array.isArray(z.list)) return;
      Store.raw.set('seats', z.list); if (z.ownerName != null) Store.raw.set('ownerSeatName', z.ownerName); if (z.ownerPin != null) Store.raw.set('ownerPin', z.ownerPin); if (z.ownerAv != null) Store.raw.set('ownerAv', z.ownerAv);
      Object.entries(z.data || {}).forEach(([id, v]) => {
        if (id === SEAT) { if (v.watchlist) { S.watchlist = v.watchlist; Store.set('watchlist', v.watchlist); } if (v.progress) { S.progress = v.progress; Store.set('progress', v.progress); } if (v.watched) { Store.set('watched', v.watched); WATCHED = null; } if (v.taste) Store.set('taste', v.taste); return; }
        Object.entries(v || {}).forEach(([k, x]) => { if (x != null) try { localStorage.setItem(`mkc:seat:${id}:${k}`, JSON.stringify(x)); } catch (e) { /* full */ } });
      });
    };
  },
  init() {
    this.initSync();
    // the seat a removed or synced-away list no longer has falls back to the main seat
    if (SEAT && !this.list().some((s) => s.id === SEAT)) { try { localStorage.removeItem('mkc:seat'); } catch (e) { /* blocked */ } location.reload(); return; }
    SECTIONS.splice(SECTIONS.findIndex((s) => s.id === 'picks') + 1, 0, this.section());
    const g = SET_GROUPS.find(([n]) => n === 'You'); if (g) g[1].splice(1, 0, 'seats');
    SET_BLURB.seats = 'Profiles for everyone, PINs, kids';
    COMMANDS.push({ label: 'Switch seat (who’s watching)', icon: 'users', run: () => this.pick({ force: true }) });
    if (SEAT) document.documentElement.classList.add('in-seat');
    if (this.kids()) {
      document.documentElement.classList.add('kids-seat');
      const card = cardHTML; cardHTML = function (m) { return Seats.kidSafe(m) ? card.apply(this, arguments) : ''; };
      // a row left with nothing kid-safe in it disappears, and the banner only features kid-safe films
      const fr = fillRail; fillRail = function (sec, html) { const r = fr.apply(this, arguments); if (sec && !String(html || '').trim()) sec.hidden = true; return r; };
      const sh = setHeroList; setHeroList = function (list) { const l = (list || []).filter((m) => Seats.kidSafe(m)); if (!l.length) { S.hero = []; return; } return sh.call(this, l); };
      if (typeof Peak !== 'undefined' && Peak.open) Peak.open = function () { toast('Not on the kids seat', 'err', 2200, 'kids'); };
      const rh = renderHome; renderHome = async function () { S.hero = []; const r = await rh.apply(this, arguments); if (!S.hero.length) $('#hero').hidden = true; return r; };
      const od = openDetail; openDetail = function (seed) { if (!Seats.kidSafe(S.metas.get(seed && seed.id) || seed)) { toast('Not on the kids seat', 'err', 2200, 'kids'); return; } return od.apply(this, arguments); };
      const g0 = go; go = function (view) { if (view === 'tv' || view === 'studio') { toast('Not on the kids seat', 'err', 2200, 'kids'); return; } return g0.apply(this, arguments); };
      const os = openSettings; openSettings = function () { const a = arguments; Seats.guard(() => os.apply(this, a)); };
      document.addEventListener('click', (e) => { const b = e.target.closest('#openAddons'); if (b && !Seats.unlocked && Seats.owner().pin) { e.preventDefault(); e.stopImmediatePropagation(); Seats.guard(() => b.click()); } }, true);
    }
    // a small seat badge on the account button
    const chip = Account.chip.bind(Account);
    Account.chip = function () { chip(); const b = $('#openAccount'); if (b && Account.user && SEAT) { const a = Seats.artOf(Seats.cur()); if (a !== 'letter' && a !== 'photo') b.innerHTML = `<span class="avatar ph art">${SeatArt.svg(a)}</span>`; } if (b && Seats.list().length) { b.insertAdjacentHTML('beforeend', `<span class="seat-dot" style="--sc:${esc(Seats.cur().color)}" title="Seat: ${esc(Seats.cur().name)}"></span>`); } };
    Account.chip();
    let ok = false; try { ok = sessionStorage.getItem('mkc:seatOk') === '1'; } catch (e) { /* private */ }
    if (this.list().length && CFG.seatAsk !== false && !ok) {
      /* 2.48 seat-first: the chooser comes before Home. It opens as soon as the page is parsed, under the boot cover
         and the intro, and Home stays hidden (html.seat-gate) until it closes, so Home never flashes first. */
      const de = document.documentElement; de.classList.add('seat-gate');
      const lift = () => de.classList.remove('seat-gate');
      const open = () => {
        try { this.pick(); } catch (e) { /* fall back to Home */ }
        const p = $('#seatPick'); if (!p || p.hidden) { lift(); return; }
        const mo = new MutationObserver(() => { if (p.hidden) { mo.disconnect(); lift(); } }); mo.observe(p, { attributes: true, attributeFilter: ['hidden'] });
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open, { once: true }); else setTimeout(open, 0);
      // the account loads a moment later: draw the picker again so the main seat shows its real name
      const su = Account.setUser.bind(Account);
      Account.setUser = function () { const r = su.apply(this, arguments); const p = $('#seatPick'), pin = $('#seatPin'); if (p && !p.hidden && !Seats.managing && (!pin || pin.hidden)) Seats.pick(); return r; };
    }
  },
};
Seats.init();

/* ---------------- Atelier: make your own theme ----------------
   Pick a colour for the blacks, a colour for the small highlights, how strongly they show, a type pairing and corner
   shape. Atelier recolours the same tokens the four built-in themes use, with the same lightness for every surface, so
   contrast, focus rings and the TV light-on-dark rules hold whatever is picked. Video stays true black. A theme travels
   as a short code (export and import) and syncs with the account like any setting. No new effects. */
const Atelier = {
  SHADOWS: [['graphite', 'Graphite', 0, 0], ['ink', 'Ink', 222, 0.42], ['slate', 'Slate', 208, 0.2], ['teal', 'Teal', 188, 0.38], ['forest', 'Forest', 150, 0.3], ['plum', 'Plum', 285, 0.32], ['oxblood', 'Oxblood', 346, 0.36], ['umber', 'Umber', 30, 0.3]],
  LIGHTS: [['platinum', 'Platinum', 0, 0], ['ice', 'Ice', 214, 0.42], ['mint', 'Mint', 160, 0.4], ['champagne', 'Champagne', 42, 0.38], ['rose', 'Rose gold', 18, 0.4], ['amber', 'Amber', 38, 0.62], ['lilac', 'Lilac', 270, 0.38], ['coral', 'Coral', 8, 0.55]],
  FONTS: { modern: ['Modern', '"Sora",system-ui,sans-serif', '"Onest",system-ui,sans-serif'], classic: ['Classic', '"Fraunces",Georgia,serif', '"Onest",system-ui,sans-serif'], system: ['System', 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'] },
  CORNERS: { sharp: ['Sharp', 4, 6, 10], soft: ['Soft', 8, 10, 18], round: ['Round', 12, 16, 26] },
  def: () => ({ shadow: 'ink', light: 'champagne', strength: 'rich', font: 'modern', corners: 'soft' }),
  get() { return { ...this.def(), ...(CFG.atelier || {}) }; },
  /* colour maths, the same as the built-in themes */
  rgb2hls(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, l, 0]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h / 6, l, s]; },
  hls2rgb(h, l, s) { if (!s) return [l, l, l].map((x) => Math.round(x * 255)); const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255)); },
  params(a) {
    const sh = this.SHADOWS.find((x) => x[0] === a.shadow) || this.SHADOWS[1], li = this.LIGHTS.find((x) => x[0] === a.light) || this.LIGHTS[3];
    const k = a.strength === 'subtle' ? 0.55 : 1;
    return { hd: sh[2], sd: sh[3] * k, lift: sh[3] ? 0.034 * k : 0.012, sl: sh[3] ? 0.2 * k : 0, ha: li[2], sa: li[3] * (a.strength === 'subtle' ? 0.7 : 1) };
  },
  themed([r, g, b], t) {
    const [, l] = this.rgb2hls(r, g, b), warm = l > 0.35 && r - b >= 8;
    let hue, sat; if (warm) { hue = t.ha; sat = t.sa; } else { hue = t.hd; const q = Math.min(1, Math.max(0, (l - 0.2) / 0.4)); sat = t.sd + (t.sl - t.sd) * q; }
    const l2 = l < 0.5 ? t.lift + l * (1 - t.lift) : l;
    return this.hls2rgb(hue / 360, l2, sat);
  },
  tokens() {
    if (this._tok) return this._tok;
    const css = ($('#looks') || {}).textContent || '', rule = (css.match(/html\[data-look=["']?midnight["']?\]\s*\{([^}]*)\}/) || [])[1] || '';
    return (this._tok = [...new Set([...rule.matchAll(/(--n([0-9a-f]{6})):/g)].map((m) => m[2]))]);
  },
  css(a) {
    const t = this.params(a), hex = (c) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    const decl = this.tokens().map((h) => { const c = this.themed([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)), t); return `--n${h}:${hex(c)};--n${h}-c:${c.join(',')}`; });
    const f = this.FONTS[a.font] || this.FONTS.modern, r = this.CORNERS[a.corners] || this.CORNERS.soft;
    decl.push(`--f-display:${f[1]}`, `--f-body:${f[2]}`, `--r-s:${r[1]}px`, `--r-m:${r[2]}px`, `--r-l:${r[3]}px`);
    const sw = (rgb) => hex(this.themed(rgb, t));
    this.swatch = { l0: sw([0, 0, 0]), lb: sw([17, 17, 19]), li: sw([242, 242, 243]), la: sw([217, 212, 199]) };
    return `html[data-look="atelier"]{${decl.join(';')}}`;
  },
  apply(a, { select = true } = {}) {
    const css = this.css(a);
    let st = $('#atelier'); if (!st) { st = document.createElement('style'); st.id = 'atelier'; document.head.appendChild(st); }
    st.textContent = css;
    try { localStorage.setItem('mkc:atelierCss', JSON.stringify(css)); } catch (e) { /* blocked */ }
    LOOKS.atelier = { label: 'Atelier', blurb: 'Your own colours, type and corners.', ...this.swatch, meta: this.swatch.l0 };
    CFG.atelier = a; saveCfg();
    if (select) setCfg('look', 'atelier'); else applyAll();
    Account.schedule();
  },
  code(a) { return `MKA1.${X8.b64e(a)}`; },
  html() {
    const a = this.get(), on = CFG.look === 'atelier';
    const sw = (list, key) => list.map(([id, label, h, s]) => { const c = this.hls2rgb(h / 360, key === 'shadow' ? 0.22 : 0.74, s || 0); return `<button type="button" data-nav data-at="${key}" data-v="${id}" class="at-sw ${a[key] === id ? 'on' : ''}" style="--c:rgb(${c.join(',')})" title="${esc(label)}"><i></i><span>${esc(label)}</span></button>`; }).join('');
    const seg = (key, obj) => `<div class="segc">${Object.entries(obj).map(([id, v]) => `<button type="button" data-nav data-at="${key}" data-v="${id}" class="${a[key] === id ? 'on' : ''}">${esc(v[0])}</button>`).join('')}</div>`;
    return `<div class="atelier" id="atelierBox"><div class="at-head"><div><b>Atelier</b><small>${on ? 'Your own theme is on. Every change shows straight away.' : 'Make your own theme. The first change switches it on.'}</small></div>
        <div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav id="atCopy"><i data-lucide="copy"></i>Copy code</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="atImp"><i data-lucide="download"></i>Use a code</button></div></div>
      <div class="at-lab">Blacks</div><div class="at-sws">${sw(this.SHADOWS, 'shadow')}</div>
      <div class="at-lab">Highlights</div><div class="at-sws">${sw(this.LIGHTS, 'light')}</div>
      <div class="at-grid"><div><div class="at-lab">Strength</div><div class="segc">${[['subtle', 'Subtle'], ['rich', 'Rich']].map(([id, l]) => `<button type="button" data-nav data-at="strength" data-v="${id}" class="${a.strength === id ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div><div class="at-lab">Type</div>${seg('font', this.FONTS)}</div><div><div class="at-lab">Corners</div>${seg('corners', this.CORNERS)}</div></div>
      <div class="inrow at-imp" id="atImpRow" hidden><input class="inp mono" id="atCode" placeholder="MKA1.…" autocomplete="off" spellcheck="false"><button class="btn btn-prime btn-sm" type="button" data-nav id="atCodeGo">Use</button></div></div>`;
  },
  bind() {
    const box = $('#atelierBox'); if (!box) return;
    $$('[data-at]', box).forEach((b) => b.addEventListener('click', () => { const a = this.get(); a[b.dataset.at] = b.dataset.v; this.apply(a); renderSettingsBody(); const n = $(`#atelierBox [data-at="${b.dataset.at}"][data-v="${b.dataset.v}"]`); if (n && IS_TV) Nav.focus(n, true); }));
    $('#atCopy').onclick = () => { copyText(this.code(this.get())); };
    $('#atImp').onclick = () => { $('#atImpRow').hidden = false; if (!TOUCH_UI) $('#atCode').focus(); if (IS_TV) Nav.settle(); };
    $('#atCode').addEventListener('keydown', (e) => e.stopPropagation());
    $('#atCodeGo').onclick = () => {
      try { const raw = $('#atCode').value.trim(); if (!raw.startsWith('MKA1.')) throw new Error('not an Atelier code'); const a = { ...this.def(), ...X8.b64d(raw.slice(5)) };
        ['shadow', 'light'].forEach((k) => { if (!(k === 'shadow' ? this.SHADOWS : this.LIGHTS).some((x) => x[0] === a[k])) throw new Error('unknown colour'); });
        this.apply(a); renderSettingsBody(); toast('Theme applied', 'ok'); } catch (e) { toast(`That code did not work (${e.message})`, 'err'); }
    };
  },
  init() {
    if (CFG.atelier || CFG.look === 'atelier') { try { this.css(this.get()); LOOKS.atelier = { label: 'Atelier', blurb: 'Your own colours, type and corners.', ...this.swatch, meta: this.swatch.l0 }; if (!$('#atelier')) this.apply(this.get(), { select: false }); } catch (e) { console.warn('atelier', e); } }
    const sec = secById('appearance'); if (!sec) return;
    const rows = sec.rows, bind = sec.bind;
    sec.rows = () => { const r = rows(), i = r.findIndex((d) => d.html === lookHTML); const add = { html: () => this.html() }; if (i >= 0) r.splice(i + 1, 0, add); else r.unshift(add); return [...r, { group: 'For power users' }, { html: () => CustomCss.html() }]; };
    sec.bind = () => { if (bind) bind(); this.bind(); CustomCss.bind(); };
  },
};

/* Custom CSS: for people who want to restyle one detail. Kept in settings (so it syncs) and added last */
const CustomCss = {
  apply() { let st = $('#customCss'); if (!st) { st = document.createElement('style'); st.id = 'customCss'; document.head.appendChild(st); } st.textContent = String(CFG.customCss || '').replace(/<\/?style[^>]*>/gi, ''); },
  html() { return `<div class="set-row x8-css"><div><b>Custom CSS</b><small>Added after MKCinema’s own styles on this account. Clear it if something looks wrong.</small></div></div><textarea class="inp mono x8-ta" id="ccss" rows="5" spellcheck="false" placeholder=".row-title { letter-spacing: .02em }">${esc(CFG.customCss || '')}</textarea><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-nav id="ccssGo"><i data-lucide="check"></i>Apply</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="ccssClr"><i data-lucide="eraser"></i>Clear</button></div>`; },
  bind() {
    const t = $('#ccss'); if (!t) return; t.addEventListener('keydown', (e) => e.stopPropagation());
    $('#ccssGo').onclick = () => { setCfg('customCss', t.value.slice(0, 20000)); this.apply(); toast('Custom CSS applied', 'ok'); };
    $('#ccssClr').onclick = () => { t.value = ''; setCfg('customCss', ''); this.apply(); toast('Custom CSS cleared'); };
  },
};
Atelier.init();
if (CFG.customCss) CustomCss.apply();
CFG_HOOKS.push((k) => { if (k === 'customCss') CustomCss.apply(); });

/* ---------------- Addon directory ----------------
   Browse the community index at stremio-addons.net (about 750 addons, an open JSON list) from inside the addon manager:
   search, filter by what an addon provides, install in one press, or open its own setup page when it needs one. Adult
   addons stay hidden unless the viewer confirms they are 18 or older. MKCinema recommends none of them. */
/* TV text boxes: landing on one with the remote must not pop the on-screen keyboard (it covers the screen and, on Fire TV,
   fights the remote). The box is read-only with inputmode none (some TV keyboards ignore one of the two) until OK is pressed
   on it; once the remote leaves it, it goes back to that state. */
const TvType = {
  guard(el) {
    if (!el || el._tvType) return; el._tvType = true;
    const arm = () => { el.setAttribute('inputmode', 'none'); el.readOnly = true; el.dataset.tvArmed = '1'; };
    arm();
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.keyCode === 23) && el.dataset.tvArmed) {
        e.preventDefault(); e.stopPropagation(); delete el.dataset.tvArmed; el.readOnly = false; el.setAttribute('inputmode', 'search');
        el.blur(); setTimeout(() => { el.focus({ preventScroll: true }); try { el.click(); } catch (x) { /* none */ } }, 30);
      }
    }, true);
    el.addEventListener('blur', () => { if (!el.dataset.tvArmed) setTimeout(() => { if (document.activeElement !== el) arm(); }, 60); });
  },
};
/* ---------------- 2.41.0 Addon Finder ----------------
   Search the community addon lists and install in one press. The list is a small copy that ships with the app
   (addons/directory.json, rebuilt at every release from stremio-addons.net and Stremio's own addon catalog), so it
   opens at once and works when those sites are slow or down; only without that file does the app ask them live.
   Addons that need your own settings get a short guided setup right in their row: their page opens, you copy the link
   it gives you, and one press pastes and installs it. On a TV the setup page opens on your phone from a QR code.
   Class names avoid an "ad-" prefix: ad blockers hide elements named like that, which emptied the list.
   MKCinema recommends none of these addons and checks none of them. */
const AddonDir = {
  SNAP: 'addons/directory.json',
  LIVE: ['https://stremio-addons.net/api/addon_catalog/all/stremio-addons.net.json', 'https://api.strem.io/addonscollection.json'],
  TYPES: [['', 'All'], ['stream', 'Streams'], ['catalog', 'Catalogs'], ['subtitles', 'Subtitles'], ['anime', 'Anime'], ['movie', 'Films'], ['series', 'Series'], ['tv', 'Live TV']],
  list: null, busy: null, q: '', type: '', n: 30, adult: false, setup: null, shown: [],
  key(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); },
  base(u) { return String(u || '').trim().replace(/^stremio:\/\//i, 'https://').replace(/\/manifest\.json(\?.*)?$/i, '').replace(/\/+$/, '').toLowerCase(); },
  pick(t) { const m = String(t || '').match(/(stremio|https?):\/\/[^\s"'<>]+?\/manifest\.json(\?[^\s"'<>]*)?/i); return m ? m[0] : null; },
  row(x) {
    const h = String(x.h || ''), name = String(x.n || '?'), desc = String(x.d || '');
    return { url: String(x.u || ''), id: String(x.i || ''), name, ver: String(x.v || ''), desc, logo: /^https:\/\//i.test(x.l || '') ? x.l : '', types: Array.isArray(x.t) ? x.t : [], res: Array.isArray(x.r) ? x.r : [],
      adult: h.includes('a'), cfg: h.includes('c') || h.includes('q'), need: h.includes('q'), feat: h.includes('s'), kn: this.key(name), kd: this.key(desc) };
  },
  /* without the bundled copy (a self-hosted server, an old cache): both public lists, merged the same way the build does */
  async live() {
    const got = await Promise.allSettled(this.LIVE.map((u) => fetchT(u, {}, 25000).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })));
    const [com, st] = got.map((g) => (g.status === 'fulfilled' ? (Array.isArray(g.value) ? g.value : (g.value && g.value.addons) || []) : null));
    if (!com && !st) throw new Error('offline');
    const sk = new Set((st || []).map((a) => a && this.base(a.transportUrl)));
    const seen = new Set(), out = [];
    [...(com || []), ...(st || [])].forEach((a) => {
      const m = a && a.manifest, u = String((a && a.transportUrl) || '');
      if (!m || !m.name || !/^https:\/\//i.test(u) || seen.has(this.base(u))) return;
      seen.add(this.base(u));
      const bh = m.behaviorHints || {};
      out.push({ u, i: m.id, n: m.name, v: m.version, d: String(m.description || '').slice(0, 240), l: m.logo, t: m.types || [], r: (m.resources || []).map((r) => (typeof r === 'string' ? r : r && r.name)).filter(Boolean),
        h: `${bh.adult ? 'a' : ''}${bh.configurable ? 'c' : ''}${bh.configurationRequired ? 'q' : ''}${sk.has(this.base(u)) ? 's' : ''}` });
    });
    return out;
  },
  load() {
    if (this.list) return Promise.resolve(this.list);
    if (!this.busy) {
      this.busy = (async () => {
        try { sessionStorage.removeItem('mkc:addonDir'); } catch (e) { /* the 1.3 MB copy older versions kept */ }
        let rows = null;
        try {
          const r = await fetchT(this.SNAP, {}, 10000);
          if (r.ok && /json/i.test(r.headers.get('content-type') || '')) { const j = await r.json(); if (j && Array.isArray(j.addons) && j.addons.length) rows = j.addons; }
        } catch (e) { /* not on this host */ }
        if (!rows) rows = await this.live();
        this.list = rows.map((x) => this.row(x)).filter((a) => /^https:\/\//i.test(a.url));
        return this.list;
      })();
      this.busy.then(() => { this.busy = null; }, () => { this.busy = null; });
    }
    return this.busy;
  },
  async open(o = {}) {
    this.q = o.q != null ? String(o.q) : ''; this.type = o.type != null ? o.type : ''; this.n = 30; this.setup = null;
    X8.layer('addonDir', { label: 'Find addons', icon: 'compass', eyebrow: 'Find addons', wide: true });
    const b = X8.body('addonDir');
    if (!this.list) b.innerHTML = '<div class="status-line" style="padding:24px"><span class="spin"></span>Loading addons…</div>';
    X8.open('addonDir');
    try { await this.load(); this.paint(); } catch (e) {
      b.innerHTML = '<div class="empty-state"><i data-lucide="cloud-off"></i><h3>Couldn’t load the addon list</h3><p>Check your connection and try again. You can still paste an addon link in Addons.</p><div class="actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-nav id="mkdRetry"><i data-lucide="refresh-cw"></i>Try again</button></div></div>';
      icons(); $('#mkdRetry').onclick = () => this.open(o); if (IS_TV) Nav.settle();
    }
  },
  match(a, t) {
    if (!t) return true;
    if (t === 'stream' || t === 'catalog' || t === 'subtitles') return a.res.includes(t);
    if (t === 'anime') return a.types.includes('anime') || /\b(anime|kitsu|anilist|myanimelist|crunchyroll)\b/.test(`${a.kn} ${a.kd}`);
    if (t === 'tv') return a.types.includes('tv') || a.types.includes('channel');
    return a.types.includes(t);
  },
  /* name matches first (exact, starts with, contains), then description matches; with no search, Stremio's catalog first */
  hits() {
    const words = this.key(this.q).split(' ').filter(Boolean), q = words.join(' '), out = [];
    this.list.forEach((a, i) => {
      if ((a.adult && !this.adult) || !this.match(a, this.type)) return;
      let s;
      if (words.length) {
        const all = `${a.kn} ${a.kd}`;
        if (!words.every((w) => all.includes(w))) return;
        s = a.kn === q ? 0 : a.kn.startsWith(q) ? 1 : a.kn.includes(q) ? 2 : words.every((w) => a.kn.includes(w)) ? 3 : 4;
      } else s = a.feat ? 0 : 1;
      out.push([s, i, a]);
    });
    return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((x) => x[2]);
  },
  what(a) {
    const r = [['stream', 'Streams'], ['catalog', 'Catalogs'], ['subtitles', 'Subtitles']].filter(([k]) => a.res.includes(k)).map((x) => x[1]);
    const t = [['movie', 'films'], ['series', 'series'], ['anime', 'anime'], ['tv', 'live TV'], ['channel', 'channels']].filter(([k]) => a.types.includes(k)).map((x) => x[1]);
    return [r.join(', '), t.join(', ')].filter(Boolean).join(' · ');
  },
  mono(a) { return esc((a.name.replace(/[^\p{L}\p{N}]+/gu, '') || '?').slice(0, 2).toUpperCase()); },
  /* The shell (title, search, filters) is built once; typing and filters redraw only the list, so the search box is
     never torn down under the remote. On TV the box keeps the on-screen keyboard down until OK is pressed. */
  paint() {
    const b = X8.body('addonDir');
    b.innerHTML = `<div class="mkd-head"><h3 class="x8-h">Find addons</h3><p class="sub">${this.list.length} community addons. Install adds one in a single press; Set up walks you through addons that need your own settings.</p></div>
      <div class="ch-bar"><div class="ch-search"><i data-lucide="search"></i><input class="inp" id="mkdQ" type="search" data-nav placeholder="Search by name or what it does${IS_TV ? ' · press OK to type' : ''}" value="${esc(this.q)}" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="Search addons"></div></div>
      <div class="chips mkd-chips" id="mkdChips">${this.TYPES.map(([v, l]) => `<button class="chip ${this.type === v ? 'on' : ''}" type="button" data-nav data-mkt="${v}" aria-pressed="${this.type === v}">${l}</button>`).join('')}<button class="chip ${this.adult ? 'on' : ''}" type="button" data-nav id="mkdAdult" aria-pressed="${this.adult}">18+</button></div>
      <div id="mkdBody" aria-live="polite"></div>
      <p class="tour-note mkd-note">Addons are made by their own authors. MKCinema checks none of them, so install only what you trust. The list comes from stremio-addons.net and Stremio’s addon catalog.</p>`;
    icons();
    const qi = $('#mkdQ'), body = $('#mkdBody');
    // a logo that fails to load becomes the addon's initials
    body.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.classList.contains('mkd-logo')) { const s = document.createElement('span'); s.className = 'mkd-logo mkd-mono'; s.textContent = t.dataset.mono || '?'; t.replaceWith(s); } }, true);
    // typing keys stay in the box; arrows go on to the remote navigation (it leaves the box at the text's edges)
    qi.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !IS_TV) { e.preventDefault(); this.q = qi.value; this.n = 30; this.paintList(); return; }
      if (!/^Arrow/.test(e.key) && !(IS_TV && (e.key === 'Enter' || e.keyCode === 23))) e.stopPropagation();
    });
    qi.addEventListener('input', debounce(() => { if (qi.value === this.q) return; this.q = qi.value; this.n = 30; this.setup = null; this.paintList(); }, 160));
    if (IS_TV) {
      TvType.guard(qi);
      // the remote moves in clear lanes: search, then the filter chips, then the list one row at a time
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const a = document.activeElement, up = e.key === 'ArrowUp', chip = () => $('#mkdChips .chip.on') || $('#mkdChips .chip');
        const rows = $$('#mkdBody .mkd-row'), row = a && a.closest && a.closest('.mkd-row'), first = (r) => r && $('[data-nav]', r);
        let to = null;
        if (a === qi) { if (up) return; to = chip(); }
        else if (a && a.closest && a.closest('#mkdChips')) to = up ? qi : (first(rows[0]) || $('#mkdMore'));
        else if (row) { const i = rows.indexOf(row); to = up ? (i > 0 ? first(rows[i - 1]) : chip()) : (first(rows[i + 1]) || $('#mkdMore')); }
        else if (a && a.id === 'mkdMore') to = up ? first(rows[rows.length - 1]) : null;
        else return;
        e.preventDefault(); e.stopPropagation();
        if (to) Nav.focus(to, e.repeat);
      }, true);
    }
    $$('[data-mkt]', b).forEach((x) => x.addEventListener('click', () => {
      this.type = x.dataset.mkt; this.n = 30; this.setup = null;
      $$('[data-mkt]', b).forEach((c) => { c.classList.toggle('on', c === x); c.setAttribute('aria-pressed', String(c === x)); });
      this.paintList();
    }));
    $('#mkdAdult').onclick = (e) => {
      const x = e.currentTarget;
      if (!this.adult && !x.dataset.armed) { x.dataset.armed = '1'; x.textContent = 'I am 18 or older'; toast('Adult addons: press again to confirm you are 18 or older', 'info', 4000, 'adult'); setTimeout(() => { if (x.isConnected && x.dataset.armed) { delete x.dataset.armed; x.textContent = '18+'; } }, 5000); return; }
      delete x.dataset.armed; x.textContent = '18+';
      this.adult = !this.adult; x.classList.toggle('on', this.adult); x.setAttribute('aria-pressed', String(this.adult)); this.paintList();
    };
    this.paintList();
    if (!IS_TV && !TOUCH_UI && !this.q) setTimeout(() => { if (qi.isConnected) qi.focus({ preventScroll: true }); }, 60);
  },
  installed(a) {
    const b = this.base(a.url);
    return engine.addons.some((x) => this.base(x.baseUrl || x.url) === b || (a.cfg && a.id && x.manifest && x.manifest.id === a.id && !x.builtin));
  },
  cfgUrl(a) { return `${a.url.replace(/\/manifest\.json(\?.*)?$/i, '')}/configure`; },
  rowHtml(a, i) {
    const inst = this.installed(a), what = this.what(a), mono = this.mono(a), open = this.setup === i;
    const logo = a.logo ? `<img class="mkd-logo" src="${esc(a.logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-mono="${mono}">` : `<span class="mkd-logo mkd-mono">${mono}</span>`;
    const setupBtn = (label, cls) => `<a class="${cls}" href="${esc(this.cfgUrl(a))}" target="_blank" rel="noopener noreferrer" data-nav data-mks="${i}">${cls.includes('btn') ? '<i data-lucide="settings-2"></i>' : ''}${label}</a>`;
    const act = inst ? `<span class="mkd-done" data-nav tabindex="0"><i data-lucide="check"></i>Installed</span>${a.cfg ? setupBtn('Change settings', 'mkd-link') : ''}`
      : a.need ? setupBtn('Set up', 'btn btn-ghost btn-sm')
        : `<button class="btn btn-ghost btn-sm" type="button" data-nav data-mki="${i}"><i data-lucide="plus"></i>Install</button>${a.cfg ? setupBtn('Options', 'mkd-link') : ''}`;
    return `<div class="mkd-row${open ? ' open' : ''}" data-mkx="${i}">${logo}
      <div class="mkd-t"><div class="mkd-name"><b>${esc(a.name)}</b>${a.ver ? `<span class="mkd-ver">v${esc(a.ver)}</span>` : ''}${a.adult ? '<span class="tag-s">18+</span>' : ''}${a.need ? '<span class="mkd-pill">Needs setup</span>' : ''}</div>
        ${a.desc ? `<p>${esc(a.desc)}</p>` : ''}${what ? `<div class="mkd-what">${esc(what)}</div>` : ''}</div>
      <div class="mkd-act">${act}</div>${open ? this.setupHtml(a) : ''}</div>`;
  },
  setupHtml(a) {
    const host = (() => { try { return new URL(a.url).host; } catch (e) { return 'its page'; } })();
    if (IS_TV) {
      const ph = typeof PhoneAddons !== 'undefined' && PhoneAddons.link && PhoneAddons.link();
      return `<div class="mkd-setup mkd-setup-tv" role="group" aria-label="Set up ${esc(a.name)}"><div class="qr-wrap">${QR.svg(this.cfgUrl(a), { margin: 2 })}</div>
        <ol class="mkd-steps"><li><b>Scan with your phone</b> to open ${esc(a.name)}’s setup page and choose your settings.</li><li><b>Copy the addon link</b> it gives you at the end.</li><li><b>Paste it on your phone remote’s Add-ons page</b>${ph ? ' (the QR code on the Addons screen opens it)' : ''}. It installs on this TV.</li></ol></div>`;
    }
    return `<div class="mkd-setup" role="group" aria-label="Set up ${esc(a.name)}">
      <ol class="mkd-steps"><li><b>Choose your settings</b> on ${esc(host)}. It opened in a new tab.</li><li><b>Copy the addon link</b> it gives you at the end. If it only shows an Install button, right-click or long-press it and copy the link.</li><li><b>Come back here</b> and press Paste and install.</li></ol>
      <div class="inrow"><input class="inp mono mkd-in" data-nav placeholder="…/manifest.json" autocomplete="off" spellcheck="false" aria-label="Addon link"><button class="btn btn-prime btn-sm mkd-go" type="button" data-nav><i data-lucide="clipboard-paste"></i><span>Paste and install</span></button></div>
      <p class="mkd-msg" role="status"></p></div>`;
  },
  paintList(focusIdx) {
    const body = $('#mkdBody'); if (!body) return;
    const hits = this.hits(), shown = this.shown = hits.slice(0, this.n);
    const act = document.activeElement, hadFocus = !!(act && body.contains(act));
    body.innerHTML = `<div class="mkd-list">${shown.map((a, i) => this.rowHtml(a, i)).join('') || `<div class="mkd-none"><b>No addons match${this.q ? ` “${esc(this.q)}”` : ''}.</b><span>Try another word${this.type ? ' or the All filter' : ''}. If you have an addon’s link, paste it in Addons.</span></div>`}</div>
      ${hits.length > shown.length ? `<div class="actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-nav id="mkdMore">Show more · ${hits.length - shown.length} left</button></div>` : ''}`;
    icons();
    $$('[data-mki]', body).forEach((x) => x.addEventListener('click', async () => {
      x.disabled = true; const i = Number(x.dataset.mki);
      if (await this.put(shown[i].url, i)) return;
      x.disabled = false; if (IS_TV && x.isConnected) Nav.focus(x, true);
    }));
    $$('[data-mks]', body).forEach((x) => x.addEventListener('click', (e) => {
      const i = Number(x.dataset.mks);
      if (IS_TV) e.preventDefault(); // a TV opens the setup page on the phone, from the QR code
      else if (typeof AddonLink !== 'undefined') AddonLink.away = 0; // the row walks you through it; no extra bar on return
      this.setup = this.setup === i && IS_TV ? null : i;
      // after the link has opened its page: redrawing first would take the link away before the browser follows it
      setTimeout(() => this.paintList(i), 0);
    }));
    const more = $('#mkdMore', body); if (more) more.onclick = () => { const at = this.n; this.n += 30; this.paintList(at); };
    const box = $('.mkd-setup', body); if (box && !IS_TV) this.bindSetup(box, this.setup);
    // keep the remote where it was: the same row after an install, the first new row after Show more
    if (focusIdx != null || hadFocus) {
      const row = focusIdx != null && $(`[data-mkx="${Math.min(focusIdx, shown.length - 1)}"]`, body);
      const el = (row && (row.classList.contains('open') && !IS_TV ? $('.mkd-go', row) : $('[data-nav]', row))) || $('#mkdMore', body) || $('[data-nav]', body) || $('#mkdQ');
      if (el) { if (IS_TV) Nav.focus(el, true); else el.focus({ preventScroll: true }); }
      if (row && row.classList.contains('open')) row.scrollIntoView({ block: 'nearest' });
    }
  },
  bindSetup(box, i) {
    const inp = $('.mkd-in', box), go = $('.mkd-go', box), msg = $('.mkd-msg', box), lbl = $('span', go);
    const say = (t) => { msg.textContent = t || ''; };
    const run = async (raw) => {
      if (go.disabled) return;
      if (!this.pick(raw)) { say(raw ? 'That isn’t an addon link. It should end in manifest.json.' : 'Copy the addon link on its page first, or paste it in the box.'); inp.focus(); return; }
      go.disabled = true; say('Installing…');
      if (!(await this.put(raw, i))) { go.disabled = false; say('It didn’t install. Check the link on its page, then try again.'); }
    };
    inp.addEventListener('input', () => { lbl.textContent = inp.value.trim() ? 'Install' : 'Paste and install'; say(''); });
    inp.addEventListener('paste', () => setTimeout(() => { if (this.pick(inp.value)) run(inp.value); }, 0));
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); run(inp.value); } });
    go.onclick = async () => {
      if (inp.value.trim()) { run(inp.value); return; }
      let t = '';
      try { t = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : ''; } catch (e) { t = ''; }
      if (t) { inp.value = t; lbl.textContent = 'Install'; run(t); return; }
      say('Paste the addon link in the box (Ctrl+V, or long-press and Paste).'); inp.focus();
    };
  },
  /* install, and drop older copies of the same addon (new settings mean a new link) */
  async put(raw, i) {
    const url = this.pick(raw) || raw, r = await installAddon(url);
    if (!r) return false;
    engine.addons.filter((x) => x !== r && !x.builtin && x.manifest && r.manifest && x.manifest.id === r.manifest.id).forEach((x) => engine.remove(x.baseUrl));
    this.setup = null; this.paintList(i);
    if (!$('#addons').hidden) renderAddons();
    return true;
  },
  /* the top of the Addons screen: Find addons first, then a link box, then your addons; the proxy and local helpers
     move under Advanced */
  manager() {
    const modal = $('#addons .modal'); if (!modal) return;
    if (!$('#mkdFind')) {
      const sub = $('#addons .modal > .sub');
      if (sub) sub.textContent = 'Addons bring films, series, streams and subtitles into MKCinema. Find one and install it in one press, or paste a link from an addon’s own page.';
      $('#addonForm').insertAdjacentHTML('beforebegin', `<div class="mkd-find-wrap"><button class="mkd-find" type="button" data-nav id="mkdFind"><span class="mkd-find-ic"><i data-lucide="search"></i></span><span class="mkd-find-t"><b>Find addons</b><small id="mkdCount">Search the community list and install in one press</small></span><i data-lucide="chevron-right"></i></button>
        <div class="chips mkd-quick">${[['stream', 'Streams', 'play'], ['catalog', 'Catalogs', 'layout-grid'], ['subtitles', 'Subtitles', 'captions'], ['anime', 'Anime', 'sparkles']].map(([v, l, ic]) => `<button class="chip" type="button" data-nav data-mkq="${v}"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div></div>
        <p class="mkd-lbl">Have an addon link?</p>`);
      $('#addonUrl').placeholder = 'Paste an addon link';
      $('#addonList').insertAdjacentHTML('beforebegin', '<p class="mkd-lbl mine">Your addons</p>');
      const proxy = $('#addons .modal > .item-box');
      const adv = document.createElement('details'); adv.className = 'mkd-adv'; adv.id = 'mkdAdv';
      adv.innerHTML = '<summary data-nav>Advanced</summary><p class="sub mkd-adv-sub">Local helpers and the stream proxy, for people who run their own MKCinema server.</p><div class="chips" id="mkdAdvChips"></div>';
      if (proxy) { proxy.before(adv); adv.appendChild(proxy); proxy.style.marginTop = '14px'; } else modal.appendChild(adv);
      $('#mkdFind').onclick = () => this.open();
      $$('[data-mkq]', modal).forEach((x) => { x.onclick = () => this.open({ type: x.dataset.mkq }); });
      icons();
    }
    // suggestions: the built-in addons only when they are missing; local helpers live under Advanced
    const sug = $('#addonSuggest'), advc = $('#mkdAdvChips'); advc.innerHTML = '';
    $$('[data-url]', sug).forEach((c) => {
      const u = c.dataset.url;
      if (/^http:\/\/(127\.0\.0\.1|localhost)/i.test(u)) advc.appendChild(c);
      else if (engine.addons.some((x) => this.base(x.baseUrl || x.url) === this.base(u))) c.remove();
    });
    sug.hidden = !sug.children.length;
    // fetch the list in the background, so Find addons opens at once
    const count = () => { const c = $('#mkdCount'); if (c && this.list) c.textContent = `Search ${this.list.length} community addons. Most install in one press.`; };
    if (this.list) count(); else this.load().then(count, () => { /* the Finder says so when opened */ });
  },
  init() {
    const base = renderAddons;
    renderAddons = function () { base.apply(this, arguments); try { AddonDir.manager(); } catch (e) { MKLog.add('error', `Addons screen: ${e.message}`); } };
    // back from an addon's setup page: the Paste button is ready
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || this.setup == null || IS_TV) return;
      const go = $('#mkdBody .mkd-go'); if (!go) return;
      go.classList.remove('pulse'); void go.offsetWidth; go.classList.add('pulse'); go.focus({ preventScroll: true });
    });
    // a kids seat needs the grown-up PIN for addons, from the palette too
    COMMANDS.push({ label: 'Find addons', icon: 'compass', run: () => (typeof Seats !== 'undefined' && Seats.kids() ? Seats.guard(() => AddonDir.open()) : AddonDir.open()) });
  },
};
AddonDir.init();

/* ---------------- Line check: how fast is this connection? ----------------
   Downloads up to 40 MB from Cloudflare's public speed endpoint in parallel pieces and reports megabits per second, with
   the highest quality that should play smoothly. One press, nothing runs in the background. */
const LineCheck = {
  last: null,
  async run(btn) {
    if (this.busy) return; this.busy = true; const lbl = btn && btn.lastChild; const t0 = lbl ? lbl.textContent : '';
    if (lbl) lbl.textContent = 'Testing…';
    try {
      const piece = 10e6, n = 4, start = performance.now(); let bytes = 0;
      await Promise.all(Array.from({ length: n }, async (_, i) => {
        const r = await fetch(`https://speed.cloudflare.com/__down?bytes=${piece}&r=${Date.now()}${i}`, { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; bytes += value.length; if (performance.now() - start > 12000) { rd.cancel(); break; } }
      }));
      const mbps = (bytes * 8) / ((performance.now() - start) / 1000) / 1e6;
      const q = mbps >= 45 ? '4k' : mbps >= 15 ? '1080' : '720';
      this.last = { mbps, q, at: Date.now() };
      toast(`Your line: ${mbps.toFixed(0)} Mbps. ${q === '4k' ? '4K should play smoothly.' : q === '1080' ? '1080p is the safe ceiling; 4K may pause.' : '720p is the safe ceiling here.'}`, 'ok', 6000, 'line');
    } catch (e) { toast(`The test did not finish (${e.message})`, 'err'); }
    if (lbl) lbl.textContent = t0; this.busy = false; if (!$('#settings').hidden) renderSettingsBody();
  },
  rows() {
    const l = this.last;
    return [{ group: 'Line check' }, { key: 'lineCheck', label: 'Test my connection', help: l ? `Last test: <b>${l.mbps.toFixed(0)} Mbps</b>, good for ${l.q === '4k' ? '4K' : `${l.q}p`}.${CFG.maxQuality !== l.q ? ` <button class="btn btn-ghost btn-sm" type="button" data-nav id="lineUse">Set max quality to ${l.q === '4k' ? '4K' : `${l.q}p`}</button>` : ''}` : 'Downloads up to 40 MB once to measure your speed, then suggests the highest quality that plays without pauses.', type: 'button', text: 'Run the test', icon: 'gauge', run: (b) => this.run(b) }];
  },
};
/* ---------------- Report a problem ----------------
   Copies a short, safe diagnostic (version, device, settings without any key, recent errors) and opens a new GitHub
   issue with it filled in. Keys, passwords, addon links and stream links are never included. */
const Report = {
  diag() {
    const c = { ...CFG }; ['customCss', 'partyName', 'extPlayers', 'atelier', 'keymap'].forEach((k) => delete c[k]);
    Object.keys(c).forEach((k) => { if (/key|token|secret|pass/i.test(k)) delete c[k]; });
    return [`MKCinema ${APP_VERSION}`, `Device: ${IS_TV ? 'TV' : TOUCH_UI ? 'touch' : 'desktop'} · ${PLATFORM} · ${screen.width}×${screen.height} @${devicePixelRatio}`, `Browser: ${navigator.userAgent}`,
      `Addons: ${engine.addons.length} (${engine.addons.filter((a) => a.error).length} failing) · Playlists: ${Channels.lists().length} · Seats: ${Seats.list().length + 1}`,
      `Settings: ${JSON.stringify(c)}`, `Recent errors:\n${X8.errors.slice(-8).map((x) => (typeof MKLog !== 'undefined' ? MKLog.redact(x) : x)).join('\n') || 'none'}`].join('\n');
  },
  open() {},
};
{
  const pb = secById('playback'); if (pb) { const rows = pb.rows, bind = pb.bind; pb.rows = () => [...rows(), ...LineCheck.rows()]; pb.bind = () => { if (bind) bind(); const u = $('#lineUse'); if (u) u.onclick = () => { setCfg('maxQuality', LineCheck.last.q); renderSettingsBody(); toast('Max quality saved', 'ok'); }; }; }
  const sp = secById('about') || secById('support');
  if (sp) { const rows = sp.rows; sp.rows = () => [...rows(), { group: 'Something wrong?' }, { key: 'report', label: 'Report a problem', help: 'Opens a new GitHub issue with a short diagnostic filled in (version, device, settings, recent errors). It never includes keys, passwords or links. The diagnostic is also copied, so you can paste it anywhere.', type: 'button', text: 'Report a problem', icon: 'bug', run: () => Report.open() }]; }
}
COMMANDS.push({ label: 'Report a problem', icon: 'bug', run: () => Report.open() }, { label: 'Test my connection speed', icon: 'gauge', run: () => LineCheck.run() });

/* ---------------- 2.8.2 TV Home ----------------
   - the featured banner gets arrows the remote can reach and press (Left from Smart Play, Right from Watchlist)
   - Left/Right at either end of a row stays put instead of jumping to a far-off button in another row
   - Networks: browse what is on Netflix, Disney+, HBO Max and others. The lists come from the public
     "Streaming Catalogs" Stremio addon (no key needed), for the viewer's country. MKCinema only shows the titles;
     playing them still goes through the viewer's own addons. */
const Networks = {
  BASE: 'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club',
  LIST: [
    ['nfx', 'Netflix', '#e50914'], ['dnp', 'Disney+', '#1a4bd6'], ['hbm', 'HBO Max', '#6b2fd6'], ['amp', 'Prime Video', '#1fa8e0'],
    ['atp', 'Apple TV+', '#c9c9cf'], ['hlu', 'Hulu', '#1ce783'], ['pmp', 'Paramount+', '#1f6bff'], ['pcp', 'Peacock', '#f2b705'],
    ['cru', 'Crunchyroll', '#f47521'], ['stz', 'Starz', '#e8e8ea'],
  ],
  cur: 'nfx', type: 'movie', skip: 0, done: false, busy: false, token: 0,
  country() { try { return WhereToWatch.region(); } catch (e) { return 'US'; } },
  addon() {
    const cfg = btoa(`${this.LIST.map((n) => n[0]).join(',')}::${this.country()}:1730000000000:0:0:`);
    return { baseUrl: `${this.BASE}/${cfg}`, manifest: { id: 'pw.ers.netflix-catalog', name: 'Streaming Catalogs' } };
  },
  net(id) { return this.LIST.find((n) => n[0] === id) || this.LIST[0]; },
  tile([id, name, c]) {
    return `<button type="button" class="net-tile" data-nav data-net="${id}" style="--nc:${c}" aria-label="${esc(name)}: films and series"><span class="net-shade"></span><img class="net-logo" src="net/${id}.svg" alt="" decoding="async" draggable="false"></button>`;
  },
  row() {
    const sec = document.createElement('section'); sec.className = 'row net-row'; sec.id = 'netRow';
    sec.innerHTML = `<div class="row-head"><h2 class="row-title">Networks <small>What's on each service</small></h2></div><div class="rail net-rail">${this.LIST.map((n) => this.tile(n)).join('')}</div>`;
    $$('[data-net]', sec).forEach((b, i) => { b.style.setProperty('--i', i); b.addEventListener('click', () => this.open(b.dataset.net)); });
    this.parallax(sec);
    return sec;
  },
  // 2.8.5 parallax: as the row moves, each logo drifts against its tile and its glow drifts the other way;
  // on a computer the logo also leans toward the pointer. Only CSS variables change, once per frame. TVs keep the float.
  parallax(sec) {
    if (IS_TV) return;
    const rail = sec.querySelector('.rail'); let raf = 0;
    const run = () => {
      raf = 0; if (!rail.isConnected) return; const rr = rail.getBoundingClientRect(), mid = rr.left + rr.width / 2;
      // read every rectangle first, then write the variables
      $$('.net-tile', rail).map((t) => [t, t.getBoundingClientRect()]).forEach(([t, r]) => {
        if (r.right < rr.left - 40 || r.left > rr.right + 40) return;
        const d = Math.max(-1, Math.min(1, (r.left + r.width / 2 - mid) / (rr.width / 2 || 1)));
        t.style.setProperty('--gx', `${(d * 8).toFixed(1)}px`);
        const img = t.querySelector('.net-logo'); if (img && !t._hov) img.style.setProperty('--px', `${(-d * 10).toFixed(1)}px`);
      });
    };
    const ask = () => { if (!raf) raf = requestAnimationFrame(run); };
    rail.addEventListener('scroll', ask, { passive: true }); requestAnimationFrame(ask);
    // one resize listener for every network row; rows that left the page are dropped from it
    const rz = window.__mkcNetRz || (window.__mkcNetRz = (() => { const set = new Set(); addEventListener('resize', () => set.forEach((x) => (x.rail.isConnected ? x.ask() : set.delete(x))), { passive: true }); return set; })());
    rz.forEach((x) => { if (!x.rail.isConnected) rz.delete(x); }); rz.add({ rail, ask });
    if (matchMedia('(hover:hover)').matches) $$('.net-tile', rail).forEach((t) => {
      const img = t.querySelector('.net-logo'); if (!img) return;
      t.addEventListener('pointermove', (e) => {
        const r = t.getBoundingClientRect(); t._hov = true;
        img.style.setProperty('--px', `${(((e.clientX - r.left) / r.width - 0.5) * 14).toFixed(1)}px`);
        img.style.setProperty('--py', `${(((e.clientY - r.top) / r.height - 0.5) * 10).toFixed(1)}px`);
      });
      t.addEventListener('pointerleave', () => { t._hov = false; img.style.setProperty('--py', '0px'); ask(); });
    });
  },
  place() {
    const rows = $('#homeRows'); if (!rows) return;
    if (typeof Seats !== 'undefined' && Seats.kids()) return; // the lists are not filtered for kids
    // right under Top 10 once that row is in; until then, second from the top
    const t10 = $('#homeRows .t10c'), after = t10 && t10.closest('#homeRows > section');
    const sec = $('#netRow') || this.row();
    if (after) { if (after.nextElementSibling !== sec) after.after(sec); } else if (!sec.isConnected) { const first = rows.firstElementChild; if (first) first.after(sec); else rows.append(sec); }
  },
  open(id, type) { this.cur = id || this.cur; if (type) this.type = type; go('network'); },
  render() {
    const box = $('#netBody'); if (!box) return;
    const [id, name, c] = this.net(this.cur);
    box.style.setProperty('--nc', c);
    box.innerHTML = `<div class="net-head"><h1 class="page-title net-title" aria-label="${esc(name)}"><img class="net-logo" src="net/${id}.svg" alt="" decoding="async"></h1><p class="page-sub">Popular on ${esc(name)} in ${esc(this.country())} right now. Lists from the community Streaming Catalogs addon; playing still uses your own addons.</p>
        <div class="toolbar"><div class="segc" role="radiogroup" aria-label="Type">${[['movie', 'Films'], ['series', 'Series']].map(([v, l]) => `<button type="button" data-nav data-nt="${v}" class="${this.type === v ? 'on' : ''}" role="radio" aria-checked="${this.type === v}">${l}</button>`).join('')}</div>
        <div class="net-switch">${this.LIST.map(([nid, nn, nc]) => `<button type="button" class="chip ${nid === id ? 'on' : ''}" data-nav data-nsw="${nid}" style="--nc:${nc}">${esc(nn)}</button>`).join('')}</div></div></div>
      <div class="grid" id="netGrid">${skeletons(12)}</div>
      <div class="actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-nav id="netMore" hidden>Show more</button></div>`;
    icons();
    $$('[data-nt]', box).forEach((b) => b.addEventListener('click', () => { this.type = b.dataset.nt; this.render(); }));
    $$('[data-nsw]', box).forEach((b) => b.addEventListener('click', () => { this.cur = b.dataset.nsw; this.render(); }));
    $('#netMore').onclick = () => this.load(false);
    this.skip = 0; this.done = false; this.load(true);
  },
  async load(fresh) {
    if (this.busy && !fresh) return; this.busy = true; const tok = ++this.token;
    const grid = $('#netGrid'), more = $('#netMore'); if (more) more.hidden = true;
    try {
      const r = await engine.call(this.addon(), 'catalog', this.type, this.cur, this.skip ? { skip: this.skip } : {});
      if (tok !== this.token || !$('#netGrid')) return;
      const metas = (r.metas || []).filter((m) => m && m.id).map((m) => ({ ...m, type: m.type || this.type, _addon: 'Streaming Catalogs' }));
      if (fresh) grid.innerHTML = '';
      const seen = new Set($$('[data-card]', grid).map((x) => x.dataset.id));
      const add = metas.filter((m) => !seen.has(m.id));
      grid.insertAdjacentHTML('beforeend', add.map((m) => cardHTML(m)).join(''));
      if (!grid.children.length) grid.innerHTML = `<div class="empty">Nothing listed for this service in ${esc(this.country())} right now.</div>`;
      this.skip += metas.length; this.done = metas.length < 20 || !add.length; // nothing new means no more pages
      if (more) more.hidden = this.done;
      icons(); if (typeof queueWall === 'function') queueWall();
      if (IS_TV && fresh) Nav.settle();
    } catch (e) {
      if (tok === this.token && grid) grid.innerHTML = `<div class="empty-state"><i data-lucide="cloud-off"></i><h3>The list did not load</h3><p>${esc(e.message || 'Network error')}. Try again in a moment.</p></div>`;
      icons();
    } finally { if (tok === this.token) this.busy = false; }
  },
  init() {
    // the network page is a view of its own, so Back and the tabs behave as everywhere else
    const g0 = go; go = function (view) { const r = g0.apply(this, arguments); if (view === 'network') Networks.render(); return r; };
    const rh = renderHome; renderHome = function () { const p = rh.apply(this, arguments); Promise.resolve(p).then(() => Networks.place()); return p; };
    if (typeof Curate !== 'undefined' && Curate.render) { const cr = Curate.render.bind(Curate); Curate.render = function () { const r = cr.apply(this, arguments); Promise.resolve(r).then(() => Networks.place()); return r; }; }
    COMMANDS.push(...this.LIST.map(([id, name]) => ({ label: `Browse ${name}`, icon: 'tv', run: () => this.open(id) })));
  },
};

const TvHome = {
  init() {
    // Left/Right at the end of a row stays on the last poster instead of leaping to another row
    const step = Nav.step.bind(Nav), move = Nav.move.bind(Nav);
    Nav.step = function (cur, dir) {
      if (cur && cur.matches && cur.matches('.rail>.net-tile, .rail>.uni-card')) { let el = cur; do { el = dir === 'right' ? el.nextElementSibling : el.previousElementSibling; } while (el && !el.matches('[data-nav]')); return el || null; }
      return step(cur, dir);
    };
    Nav.move = function (dir, fast) {
      const a = document.activeElement;
      if (IS_TV && a && dir === 'right' && a.id === 'heroList' && $('#heroNext')) { Nav.focus($('#heroNext'), fast); return; }
      if (IS_TV && a && dir === 'left' && a.id === 'heroPlay' && $('#heroPrev')) { if (S.hero.length > 1) showHero(S.heroIdx - 1, -1); return; }
      if ((dir === 'left' || dir === 'right') && a && a.matches && a.matches('.rail>.card, .rail>.net-tile, .rail>.uni-card') && !Nav.step(a, dir)) {
        const rail = a.closest('.rail');
        if (dir === 'right' && rail && rail._inf && typeof Endless !== 'undefined') { Endless.near(rail, a); return; } // an endless row loads more and the next press continues
        // 2.8.3: like Netflix, Right on the last poster goes round to the first one instead of stopping dead
        if (IS_TV && dir === 'right' && rail) { const first = $$(':scope>[data-nav]', rail).find((x) => !x.closest('[hidden]')); if (first && first !== a) Nav.focus(first, fast); }
        return;
      }
      return move(dir, fast);
    };
    // 2.8.3/2.8.6 (rows lagged, then "cycling is jittery"). On TV the focused poster is pinned to the row's left
    // edge and the row glides under it, as on Netflix. One animation per row that retargets from where it is, so presses
    // never queue or jump; a held button glides faster. Moving along a row never scrolls the page up or down (that
    // re-centring on every press was the jitter); the page only moves when the focus changes row.
    if (IS_TV) {
      const ease = (t) => 1 - Math.pow(1 - t, 3);
      const glide = (rail, to, ms) => {
        const tw = rail._tw || (rail._tw = { raf: 0 });
        tw.from = rail.scrollLeft; tw.to = to; tw.t0 = performance.now(); tw.ms = ms;
        if (tw.raf) return;
        const step = (now) => {
          const k = Math.max(0, Math.min(1, (now - tw.t0) / tw.ms)); // a frame can start before the key press that set t0
          rail.scrollLeft = tw.from + (tw.to - tw.from) * ease(k);
          tw.raf = k < 1 ? requestAnimationFrame(step) : 0;
        };
        tw.raf = requestAnimationFrame(step);
      };
      const focus = Nav.focus.bind(Nav); let lastAt = 0, lastRail = null;
      Nav.focus = function (el, fast) {
        const rail = el && el.closest && el.closest('.rail');
        if (!rail) { lastRail = null; return focus(el, fast); }
        const now = performance.now(), quick = fast || now - lastAt < 260, sameRow = rail === lastRail;
        lastAt = now; lastRail = rail;
        // the original focus() scrolls with scrollIntoView, which would also slide the row; do the page part here instead
        el.scrollIntoView = function () {
          if (sameRow) return; // along the row: the page stays still
          const lay = el.closest('.layer-ov'), r = el.getBoundingClientRect();
          const top = lay ? lay.getBoundingClientRect().top : 0, h = lay ? lay.clientHeight : innerHeight;
          const d = r.top - top + r.height / 2 - h / 2;
          if (Math.abs(d) > 6) (lay || window).scrollBy({ top: d, behavior: quick ? 'auto' : 'smooth' });
        };
        let r;
        try { r = focus(el, quick); } finally { delete el.scrollIntoView; }
        if (rail.scrollWidth > rail.clientWidth + 2) {
          // measured from layout offsets, not on-screen boxes: the selected poster is scaled up, and measuring its
          // scaled box made every press land a few pixels short and slide back (a visible shudder)
          const first = rail.firstElementChild, ml = (x) => parseFloat(getComputedStyle(x).marginLeft) || 0;
          // a Top 10 rank number sits in the card's left margin, so it stays in view
          const left = Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, ml(first) + el.offsetLeft - first.offsetLeft - ml(el)));
          if (Math.abs(left - (rail._tw && rail._tw.raf ? rail._tw.to : rail.scrollLeft)) > 1) glide(rail, left, quick ? 140 : 260);
        }
        return r;
      };

      // 2.8.6 ("it sometimes just freezes and you can't scroll back up ... you have to exit out").
      // A drop-down (the Catalog picker on Movies and Series) kept every arrow press for itself on a remote, so the
      // focus was trapped there. Arrows now leave drop-downs and multi-line boxes; OK still opens them.
      document.addEventListener('keydown', (e) => {
        const t = e.target, k = e.key;
        if (!/^Arrow/.test(k) || !t || !t.tagName) return;
        if (t.tagName === 'SELECT' || (t.tagName === 'TEXTAREA' && (k === 'ArrowUp' || k === 'ArrowDown'))) {
          e.preventDefault(); e.stopImmediatePropagation(); Nav.move(k.slice(5).toLowerCase(), e.repeat);
        }
      }, true);

      // and a way out from anywhere: if Up finds nothing above on a page, it goes to the menu at the top (as on
      // Netflix); if Up or Down finds nothing in a panel that can still scroll, the panel scrolls a step instead
      const mv = Nav.move.bind(Nav);
      Nav.move = function (dir, fast) {
        const before = document.activeElement, r = mv(dir, fast);
        if (document.activeElement !== before || (dir !== 'up' && dir !== 'down')) return r;
        const root = Nav.root(), lay = before && before.closest && before.closest('.layer-ov');
        const sc = lay && [lay, ...$$('.set-body, .x8-body, .ep-sheet, .es-body', lay)].find((x) => x.scrollHeight > x.clientHeight + 4 && x.contains(before));
        if (sc) { const by = (dir === 'up' ? -1 : 1) * sc.clientHeight * 0.6; if ((by < 0 && sc.scrollTop > 0) || (by > 0 && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2)) { sc.scrollBy({ top: by, behavior: 'smooth' }); return r; } }
        if (dir === 'up' && root && root.id === 'app' && before && !before.closest('.dock-wrap') && !document.documentElement.classList.contains('nav-side')) {
          const tab = $('.dock-wrap .tab.on') || $('.dock-wrap .tab');
          if (tab) { Nav.focus(tab, true); scrollTo({ top: 0, behavior: 'smooth' }); }
        }
        return r;
      };
    }
    // the banner arrows: reachable and pressable with the remote
    if (IS_TV) ['heroPrev', 'heroNext'].forEach((id) => { const b = $(`#${id}`); if (b) b.setAttribute('data-nav', ''); });
  },
};

if (!$('#view-network')) {
  const cal = $('#view-calendar');
  if (cal) cal.insertAdjacentHTML('beforebegin', '<section class="view" id="view-network" aria-label="Network"><div id="netBody"></div></section>');
}
Networks.init(); TvHome.init();
if (S.view === 'home') Networks.place();

/* ---------------- 2.8.4 Simple Home ("the ease of use and simple functionality of how Netflix sorts
   their movies ... everything seamless and make sense") ----------------
   - one clear order: Continue watching, My watchlist, Top 10, Networks, Popular, your picks, the themed rows,
     critically acclaimed, then the extras (Shortlist, Peak Cinema) and an unfilled "For you" invitation last
   - plain row names: "Popular films", not "Popular movie · Cinemeta"
   - a film shows once on Home: later rows drop titles an earlier row already showed (each row keeps at least 8) */
const SimpleHome = {
  tw(type) { return type === 'series' ? 'series' : 'films'; },
  name(cat, type, addon) {
    const n = String(cat || '').trim(), tw = this.tw(type);
    if (/^popular$/i.test(n)) return [`Popular ${tw}`, ''];
    if (/^featured$/i.test(n)) return [`Critically acclaimed ${tw}`, ''];
    if (/^new$/i.test(n)) return [`New ${tw}`, ''];
    if (/film|movie|series|show|tv/i.test(n)) return [n, /cinemeta/i.test(addon) ? '' : addon];
    return [`${n} ${tw}`, /cinemeta/i.test(addon) ? '' : addon];
  },
  rank(sec, seriesFirst) {
    const c = sec.dataset.curate, k = sec.dataset.cat || '';
    if (sec.id === 'cwRow') return 0;
    if (sec.id === 'newEpRow') return 0.5;
    if (/^My watchlist/.test(window.i18nEn ? i18nEn(sec.querySelector('.row-title')) : ((sec.querySelector('.row-title') || {}).textContent || ''))) return 1;
    if (c === 'top10') return 2;
    if (sec.id === 'netRow') return 3;
    if (sec.id === 'uniRow') return 3.5;
    if (k === 'movie:top') return seriesFirst ? 5 : 4;
    if (k === 'series:top') return seriesFirst ? 4 : 5;
    if (sec.id === 'forYouRow') return sec.querySelector('.fy-cta') ? 40 : 6;
    if (c === 'short') return 7; if (c === 'gems') return 8; if (c === 'awards') return 9;
    if (k && !/:imdbRating$/.test(k)) return 10;
    if (c === 'decade') return 11;
    if (/:imdbRating$/.test(k)) return 12;
    if (c === 'shortlist') return 30;
    if (sec.id === 'pkStrip') return 31;
    return 20;
  },
  order() {
    const rows = $('#homeRows'); if (!rows) return;
    const seriesFirst = /^series/.test((Layout.get() || {}).focus || '');
    const kids = [...rows.children], idx = new Map(kids.map((el, i) => [el, i]));
    const want = kids.slice().sort((a, b) => (this.rank(a, seriesFirst) - this.rank(b, seriesFirst)) || (idx.get(a) - idx.get(b)));
    if (want.every((el, i) => el === kids[i])) return;
    // keep the focused element's place on TV: moving nodes does not drop focus, but remember it just in case
    const a = document.activeElement;
    want.forEach((el) => rows.appendChild(el));
    if (a && a.isConnected && document.activeElement !== a) a.focus({ preventScroll: true });
  },
  dedupe() {
    const seen = new Set();
    $$('#homeRows > section.row').forEach((sec) => {
      if (sec.hidden || sec.id === 'cwRow' || sec.id === 'newEpRow' || sec.id === 'forYouRow' || sec.id === 'netRow') return;
      const cards = $$('.rail > [data-card]', sec), isTop = sec.dataset.curate === 'top10' || sec.classList.contains('ax-top10');
      if (!isTop && !/^My watchlist/.test(window.i18nEn ? i18nEn(sec.querySelector('.row-title')) : ((sec.querySelector('.row-title') || {}).textContent || ''))) {
        let left = cards.length;
        cards.forEach((c) => { if (left > 8 && seen.has(c.dataset.id) && c !== document.activeElement && !c.contains(document.activeElement)) { c.remove(); left--; } });
      }
      $$('.rail > [data-card]', sec).forEach((c) => seen.add(c.dataset.id));
    });
  },
  tidyT: 0,
  tidy() {
    clearTimeout(this.tidyT);
    this.tidyT = setTimeout(() => { if (S.view !== 'home') return; this.order(); this.dedupe(); }, 60);
  },
  init() {
    const rs = rowShell;
    rowShell = function (title, sub, opts) {
      const m = typeof sub === 'string' && /^(movie|series) · (.+)$/.exec(sub);
      if (!m) return rs.call(this, title, sub, opts);
      const [t, s] = SimpleHome.name(title, m[1], m[2]);
      const sec = rs.call(this, t, s, opts);
      // the catalog's identity, for ordering: Cinemeta's "top" is Popular, "imdbRating" is Featured
      const cat = (engine.catalogs() || []).find((c) => c.name === title && c.type === m[1] && c.addon && c.addon.manifest && c.addon.manifest.name === m[2]);
      sec.dataset.cat = `${m[1]}:${cat ? cat.id : title}`;
      return sec;
    };
    const rh = renderHome;
    renderHome = function () { const p = rh.apply(this, arguments); SimpleHome.tidy(); Promise.resolve(p).then(() => SimpleHome.tidy()); return p; };
    if (typeof Curate !== 'undefined' && Curate.render) { const cr = Curate.render.bind(Curate); Curate.render = function () { const r = cr.apply(this, arguments); Promise.resolve(r).then(() => SimpleHome.tidy()); return r; }; }
    if (typeof Networks !== 'undefined') { const pl = Networks.place.bind(Networks); Networks.place = function () { const r = pl.apply(this, arguments); SimpleHome.tidy(); return r; }; }
    // the banner says "Featured", without the addon's name
    const sh = showHero;
    showHero = function () { const r = sh.apply(this, arguments); const e = $('#heroEyebrow'); if (e) e.innerHTML = '<i data-lucide="flame"></i>Featured'; icons(); return r; };
  },
};
SimpleHome.init();
if (S.view === 'home') SimpleHome.tidy();

/* ---------------- 2.8.9 One-press play and new-episode alerts ----------------
   QuickStart: Play on a banner, a poster's play button or a Continue watching card no longer waits for the slowest addon.
   As soon as any addon returns a confirmed-cached, web-ready source, MKCinema waits a short moment for something better
   and then starts; the rest of the results fill in behind it, so the Sources list in the player is still complete.
   On TVs the remote's Play button on a poster plays it straight away (the OK button still opens the film page).
   NewEps: series in your watchlist or Continue watching are checked every few hours for episodes that came out in the
   last week and that you have not watched. They get their own row under Continue watching and one quiet notice. */
const QuickStart = {
  GRACE: 900,
  // resolves with { streams } early; the same array is filled with the full, sorted list once every addon has answered
  fast(type, id) {
    return new Promise((resolve) => {
      const out = []; let done = false, graceT = 0, last = [];
      const sorted = (l) => l.slice().sort((x, y) => y._tel.score - x._tel.score);
      const finish = (list) => { if (done) return; done = true; clearTimeout(graceT); out.splice(0, out.length, ...list); resolve({ streams: out }); };
      engine.fetchStreams(type, id, (partial) => {
        if (done) return;
        last = sorted(partial);
        const good = last.find((s) => s._tel.webReady && !s._tel.isTrailer && s._tel.cached === true && !s._tel.mkv);
        if (good && !graceT) graceT = setTimeout(() => finish(last), this.GRACE);
      }).then((r) => { const full = sorted(r.streams || []); if (!done) finish(full); else out.splice(0, out.length, ...full); })
        .catch(() => finish(last));
    });
  },
  init() {
    quickPlay = async function (seed) {
      let meta = seed;
      try { meta = remember({ ...seed, ...((await engine.fetchMeta(seed.type, seed.id)) || {}) }); } catch (e) { /* catalog data */ }
      let video = null, id = (meta.behaviorHints && meta.behaviorHints.defaultVideoId) || meta.id;
      if (meta.type === 'series') {
        const eps = orderedEpisodes(meta); if (!eps.length) { openDetail(meta); return; }
        const p = continueItems().find((x) => x.metaId === meta.id);
        video = (p && meta.videos.find((v) => videoIdFor(meta, v) === p.videoId)) || eps.find((v) => !S.progress[videoIdFor(meta, v)]) || eps[0];
        id = videoIdFor(meta, video);
      }
      toast(`Starting ${meta.name}…`, 'info', 2400, 'qs');
      const { streams } = await QuickStart.fast(meta.type, id);
      const best = pickBest(streams);
      if (!best) { openDetail(meta, { videoId: video ? id : undefined }); return; }
      playStream({ meta, video, streams }, best);
    };
    // Play / Pause on the remote while a poster is selected plays it
    document.addEventListener('keydown', (e) => {
      const k = e.key, play = k === 'MediaPlayPause' || k === 'MediaPlay' || (IS_TV && k === ' ');
      if (!play || !$('#player').hidden || !$('#trailer').hidden) return;
      const card = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-card]');
      if (!card || card.dataset.video) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const m = S.metas.get(card.dataset.id) || { id: card.dataset.id, type: card.dataset.type, name: card.getAttribute('aria-label') };
      quickPlay(m);
    }, true);
  },
};
QuickStart.init();

const NewEps = {
  EVERY: 3 * 3600e3, WINDOW: 7 * 86400e3,
  list() { return (Store.get('newEps', []) || []).filter((e) => e && typeof e.vid === 'string' && !isWatched(e.vid) && !S.progress[e.vid] && Date.now() - e.at < this.WINDOW); },
  async check(force) {
    if (!force && Date.now() - (Store.get('newEpsAt', 0) || 0) < this.EVERY) return;
    const shows = Calendar.shows(); if (!shows.length) return;
    Store.set('newEpsAt', Date.now());
    const now = Date.now(), from = now - this.WINDOW, found = [];
    for (let i = 0; i < shows.length; i += 6) {   // a few at a time keeps a TV responsive
      await Promise.allSettled(shows.slice(i, i + 6).map(async (s) => {
        const meta = remember({ ...s, ...((await engine.fetchMeta('series', s.id)) || {}) });
        // only series you have actually started or saved: episodes after the furthest one you have reached
        const reached = Math.max(0, ...Object.values(S.progress).filter((p) => p.metaId === meta.id).map((p) => Number(p.season) * 1000 + Number(p.episode)));
        (meta.videos || []).forEach((v) => {
          const at = Date.parse(v.released || v.firstAired || ''), sn = Number(v.season), en = Number(v.episode);
          if (!(at > from && at <= now) || !sn) return;
          if (reached && sn * 1000 + en <= reached) return;
          const vid = videoIdFor(meta, v); if (isWatched(vid) || S.progress[vid]) return;
          found.push({ metaId: meta.id, vid, s: sn, e: en, at, name: meta.name, poster: meta.poster, background: meta.background, title: v.name || v.title || '' });
        });
      }));
    }
    found.sort((a, b) => b.at - a.at);
    const old = new Set((Store.get('newEps', []) || []).map((e) => e.vid));
    Store.set('newEps', found.slice(0, 30));
    const fresh = found.filter((e) => !old.has(e.vid));
    if (fresh.length) {
      const f = fresh[0], more = fresh.length - 1;
      toast(`New episode: ${f.name} S${f.s} · E${f.e}${more ? ` and ${more} more` : ''}`, 'info', 5200, 'newEps');
    }
    if (S.view === 'home') this.row();
  },
  row() {
    const rows = $('#homeRows'); if (!rows) return;
    let sec = $('#newEpRow');
    const eps = this.list();
    // one card per series: its newest unwatched episode
    const per = new Map(); eps.forEach((e) => { if (!per.has(e.metaId)) per.set(e.metaId, e); });
    if (!per.size) { if (sec) sec.remove(); return; }
    if (!sec) { sec = rowShell('New episodes', '', { id: 'newEpRow' }); const cw = $('#cwRow'); if (cw) cw.after(sec); else rows.prepend(sec); }
    const n = eps.length; sec.querySelector('.row-title small') || sec.querySelector('.row-title').insertAdjacentHTML('beforeend', ' <small></small>');
    sec.querySelector('.row-title small').textContent = `${n} to catch up on`;
    fillRail(sec, [...per.values()].map((e) => cardHTML({ id: e.metaId, type: 'series', name: e.name, poster: e.poster, background: e.background }, { wide: true, sub: `S${e.s} · E${e.e}${e.title ? ` · ${e.title}` : ''}` }).replace('data-card ', `data-card data-newep="${esc(e.vid)}" `)).join(''));
    if (typeof SimpleHome !== 'undefined') SimpleHome.tidy();
  },
  init() {
    // a card in the row opens that episode; its play button starts it
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-newep]'); if (!c) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const m = S.metas.get(c.dataset.id) || { id: c.dataset.id, type: 'series', name: c.getAttribute('aria-label') };
      if (e.target.closest('[data-quickplay]')) NewEps.play(m, c.dataset.newep); else openDetail(m, { videoId: c.dataset.newep });
    }, true);
    const rh = renderHome;
    renderHome = function () { const p = rh.apply(this, arguments); Promise.resolve(p).then(() => NewEps.row()); return p; };
    const later = () => NewEps.check().catch(() => {});
    if (typeof requestIdleCallback === 'function') setTimeout(() => requestIdleCallback(later, { timeout: 8000 }), 9000); else setTimeout(later, 12000);
    setInterval(later, this.EVERY);
    if (S.view === 'home') this.row();
  },
  async play(meta, vid) {
    try { meta = remember({ ...meta, ...((await engine.fetchMeta('series', meta.id)) || {}) }); } catch (e) { /* keep */ }
    const video = (meta.videos || []).find((v) => videoIdFor(meta, v) === vid) || null;
    toast(`Starting ${meta.name}…`, 'info', 2400, 'qs');
    const { streams } = await QuickStart.fast('series', vid);
    const best = pickBest(streams);
    if (!best) { openDetail(meta, { videoId: vid }); return; }
    playStream({ meta, video, streams }, best);
  },
};
NewEps.init();

/* ---------------- 2.8.9 Your media servers: Plex, Jellyfin and Emby as sources ----------------
   Films and episodes you already own on your own Plex, Jellyfin or Emby server show up as sources next to your addons,
   matched by their IMDb id, and Smart Play picks them first. Sign-ins stay on this device: Plex uses its link code
   (plex.tv/link), Jellyfin and Emby a username and password that are sent only to your server, which returns a token;
   the password is never stored. Servers on a plain http:// address can only be reached through the MKCinema companion
   server, because browsers block http requests from an https page. */
const srvNorm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const Servers = {
  list() { return Store.raw.get('mservers', []) || []; },
  save(l) { Store.raw.set('mservers', l); engine.clearCache && engine.clearCache(); },
  dev() { let d = Store.raw.get('mserverDev', ''); if (!d) { d = `mkc-${Math.random().toString(36).slice(2, 12)}`; Store.raw.set('mserverDev', d); } return d; },
  // a plain http server from an https page has to go through the user's own companion server
  reach(url) {
    if (/^http:/i.test(url) && location.protocol === 'https:') { if (!S.proxy) return null; return proxify(url); }
    return url;
  },
  async json(url, opts = {}, ms = 6000) {
    const u = this.reach(url); if (!u) throw new Error('http-blocked');
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(u, { ...opts, signal: ctl.signal, headers: { Accept: 'application/json', ...(opts.headers || {}) } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
    finally { clearTimeout(t); }
  },
  /* ---- Jellyfin and Emby ---- */
  jfAuth(token) { return `MediaBrowser Client="MKCinema", Device="${IS_TV ? 'TV' : 'Web'}", DeviceId="${this.dev()}", Version="${APP_VERSION}"${token ? `, Token="${token}"` : ''}`; },
  async jfConnect(url, user, pw) {
    url = String(url || '').trim().replace(/\/+$/, ''); if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!this.reach(url)) throw new Error('http-blocked');
    let info = {}; try { info = await this.json(`${url}/System/Info/Public`); } catch (e) { if (e.message === 'http-blocked') throw e; throw new Error('No Jellyfin or Emby server answered at that address'); }
    const auth = this.jfAuth();
    const r = await this.json(`${url}/Users/AuthenticateByName`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth, 'X-Emby-Authorization': auth }, body: JSON.stringify({ Username: user, Pw: pw }) }, 10000)
      .catch((e) => { throw new Error(/401|403/.test(e.message) ? 'That username or password is not right' : 'The server did not accept the sign-in'); });
    const kind = /emby/i.test(info.ProductName || '') ? 'emby' : 'jellyfin';
    const s = { id: `${kind}:${info.Id || url}`, kind, name: info.ServerName || (kind === 'emby' ? 'Emby' : 'Jellyfin'), url, token: r.AccessToken, user: (r.User || {}).Id };
    this.save([...this.list().filter((x) => x.id !== s.id), s]);
    return s;
  },
  jfQ(s, extra) { return `api_key=${encodeURIComponent(s.token)}&ApiKey=${encodeURIComponent(s.token)}${extra ? `&${extra}` : ''}`; },
  async jfFind(s, meta, type, imdb) {
    const q = `searchTerm=${encodeURIComponent(meta.name)}&IncludeItemTypes=${type === 'movie' ? 'Movie' : 'Series'}&Recursive=true&Fields=ProviderIds,MediaSources,ProductionYear&Limit=25${s.user ? `&userId=${s.user}` : ''}`;
    const r = await this.json(`${s.url}/Items?${this.jfQ(s, q)}`);
    const items = r.Items || [];
    return items.find((x) => String((x.ProviderIds || {}).Imdb || (x.ProviderIds || {}).IMDB || '').toLowerCase() === imdb)
      || items.find((x) => srvNorm(x.Name) === srvNorm(meta.name) && Math.abs((x.ProductionYear || 0) - Number(yearOf(meta) || 0)) <= 1) || null;
  },
  async jfStreams(s, meta, type, imdb, se) {
    let item = await this.jfFind(s, meta, type, imdb); if (!item) return [];
    if (type === 'series') {
      const r = await this.json(`${s.url}/Shows/${item.Id}/Episodes?${this.jfQ(s, `season=${se[0]}&Fields=MediaSources${s.user ? `&userId=${s.user}` : ''}`)}`);
      item = (r.Items || []).find((e) => Number(e.IndexNumber) === se[1] && Number(e.ParentIndexNumber) === se[0]); if (!item) return [];
    }
    let src = (item.MediaSources || [])[0];
    if (!src) { const full = await this.json(`${s.url}/Items?${this.jfQ(s, `ids=${item.Id}&Fields=MediaSources${s.user ? `&userId=${s.user}` : ''}`)}`); src = ((full.Items || [])[0] || {}).MediaSources ? full.Items[0].MediaSources[0] : null; }
    if (!src) return [];
    const v = (src.MediaStreams || []).find((m) => m.Type === 'Video') || {}, a = (src.MediaStreams || []).find((m) => m.Type === 'Audio') || {};
    const file = String(src.Path || src.Name || '').split(/[\\/]/).pop();
    const desc = [v.Height ? `${v.Height >= 2000 ? '2160p' : `${v.Height}p`}` : '', v.Codec ? String(v.Codec).toUpperCase() : '', v.VideoRangeType && v.VideoRangeType !== 'SDR' ? v.VideoRangeType : '', a.Codec ? String(a.Codec).toUpperCase() : '', a.Channels ? `${a.Channels === 6 ? '5.1' : a.Channels === 8 ? '7.1' : `${a.Channels}ch`}` : '', src.Size ? fmtBytes(src.Size) : ''].filter(Boolean).join(' ');
    const label = s.kind === 'emby' ? 'Emby' : 'Jellyfin';
    const base = `${s.url}/Videos/${item.Id}/stream`;
    return [
      { name: `${label}\n${s.name}`, title: `${file}\n${desc}`, url: this.reach(`${base}.${src.Container || 'mkv'}?${this.jfQ(s, `static=true&mediaSourceId=${src.Id}&deviceId=${this.dev()}`)}`), behaviorHints: { filename: file, videoSize: src.Size }, _srv: label },
      { name: `${label}\n${s.name}`, title: `Converted for this device\n${desc.replace(/\b(HEVC|H265|AV1|DTS|TRUEHD|EAC3|AC3|HDR10\+?|HDR|DOVI|DV)\b/gi, '').replace(/\s+/g, ' ').trim()} H.264 AAC`, url: this.reach(`${base}.mp4?${this.jfQ(s, `container=mp4&videoCodec=h264&audioCodec=aac&maxAudioChannels=2&mediaSourceId=${src.Id}&deviceId=${this.dev()}&playSessionId=${Date.now().toString(36)}`)}`), _srv: label, _conv: true },
    ].filter((x) => x.url);
  },
  /* ---- Plex ---- */
  plexQ(extra) { return `X-Plex-Product=MKCinema&X-Plex-Version=${APP_VERSION}&X-Plex-Client-Identifier=${this.dev()}&X-Plex-Platform=${IS_TV ? 'Android' : 'Web'}&X-Plex-Device-Name=${encodeURIComponent(IS_TV ? 'MKCinema TV' : 'MKCinema')}${extra ? `&${extra}` : ''}`; },
  async plexPin() { return this.json(`https://plex.tv/api/v2/pins?${this.plexQ('strong=false')}`, { method: 'POST' }); },
  async plexPoll(pin, onTick) {
    const until = Date.now() + 10 * 60e3;
    while (Date.now() < until && !this.plexStop) {
      await new Promise((r) => setTimeout(r, 2500)); if (this.plexStop) break;
      try { const r = await this.json(`https://plex.tv/api/v2/pins/${pin.id}?${this.plexQ()}`); if (r.authToken) return r.authToken; } catch (e) { /* keep waiting */ }
      onTick && onTick();
    }
    return null;
  },
  async plexServers(token) {
    const list = await this.json(`https://plex.tv/api/v2/resources?${this.plexQ(`includeHttps=1&includeRelay=1&X-Plex-Token=${encodeURIComponent(token)}`)}`, {}, 10000);
    const out = [];
    for (const r of (list || []).filter((x) => /server/.test(x.provides || ''))) {
      const conns = (r.connections || []).filter((c) => /^https:/.test(c.uri)).sort((a, b) => (b.local - a.local) || (a.relay - b.relay));
      let uri = null;
      for (const c of conns) { try { await this.json(`${c.uri}/identity?X-Plex-Token=${encodeURIComponent(r.accessToken || token)}`, {}, 3500); uri = c.uri; break; } catch (e) { /* next */ } }
      if (!uri && conns.length) uri = conns[0].uri;
      if (uri) out.push({ id: `plex:${r.clientIdentifier}`, kind: 'plex', name: r.name || 'Plex', url: uri, token: r.accessToken || token, conns: conns.map((c) => c.uri) });
    }
    if (out.length) this.save([...this.list().filter((x) => !out.some((o) => o.id === x.id)), ...out]);
    return out;
  },
  async plexGet(s, path, ms) {
    const tryOne = (u) => this.json(`${u}${path}${path.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(s.token)}`, {}, ms);
    try { return await tryOne(s.url); } catch (e) {
      for (const u of (s.conns || []).filter((x) => x !== s.url)) { try { const r = await tryOne(u); s.url = u; this.save(this.list().map((x) => (x.id === s.id ? { ...x, url: u } : x))); return r; } catch (e2) { /* next */ } }
      throw e;
    }
  },
  async plexStreams(s, meta, type, imdb, se) {
    const secs = ((await this.plexGet(s, '/library/sections')).MediaContainer || {}).Directory || [];
    const want = type === 'movie' ? 'movie' : 'show';
    let item = null;
    for (const d of secs.filter((x) => x.type === want)) {
      const r = ((await this.plexGet(s, `/library/sections/${d.key}/all?title=${encodeURIComponent(meta.name)}&includeGuids=1`)).MediaContainer || {}).Metadata || [];
      item = r.find((x) => (x.Guid || []).some((g) => String(g.id).toLowerCase() === `imdb://${imdb}`)) || r.find((x) => srvNorm(x.title) === srvNorm(meta.name) && Math.abs((x.year || 0) - Number(yearOf(meta) || 0)) <= 1);
      if (item) break;
    }
    if (!item) return [];
    if (type === 'series') {
      const eps = ((await this.plexGet(s, `/library/metadata/${item.ratingKey}/allLeaves`)).MediaContainer || {}).Metadata || [];
      item = eps.find((e) => Number(e.parentIndex) === se[0] && Number(e.index) === se[1]); if (!item) return [];
    }
    const m = (item.Media || [])[0], p = m && (m.Part || [])[0]; if (!p) return [];
    const file = String(p.file || '').split(/[\\/]/).pop();
    const desc = [m.videoResolution ? (/^\d+$/.test(m.videoResolution) ? `${m.videoResolution}p` : m.videoResolution === '4k' ? '2160p' : m.videoResolution) : '', m.videoCodec ? String(m.videoCodec).toUpperCase() : '', m.audioCodec ? String(m.audioCodec).toUpperCase() : '', m.audioChannels ? (m.audioChannels === 6 ? '5.1' : m.audioChannels === 8 ? '7.1' : `${m.audioChannels}ch`) : '', p.size ? fmtBytes(p.size) : ''].filter(Boolean).join(' ');
    const tk = `X-Plex-Token=${encodeURIComponent(s.token)}`;
    return [
      { name: `Plex\n${s.name}`, title: `${file}\n${desc}`, url: `${s.url}${p.key}?${tk}`, behaviorHints: { filename: file, videoSize: p.size }, _srv: 'Plex' },
      { name: `Plex\n${s.name}`, title: `Converted for this device\n${desc.replace(/\b(HEVC|H265|AV1|DTS|TRUEHD|EAC3|AC3|HDR10\+?|HDR|DOVI|DV)\b/gi, '').replace(/\s+/g, ' ').trim()} H.264 AAC HLS`, url: `${s.url}/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent(`/library/metadata/${item.ratingKey}`)}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&videoQuality=100&maxVideoBitrate=20000&session=${this.dev()}-${Date.now().toString(36)}&${this.plexQ(tk)}`, _srv: 'Plex', _conv: true },
    ];
  },
  /* ---- the source hook ---- */
  async streams(type, id) {
    const list = this.list(); if (!list.length || (type !== 'movie' && type !== 'series')) return [];
    const parts = String(id).split(':'), imdb = parts[0].toLowerCase(); if (!/^tt\d+$/.test(imdb)) return [];
    const se = type === 'series' ? [Number(parts[1]), Number(parts[2])] : null; if (se && !(se[0] >= 0 && se[1] > 0)) return [];
    let meta = S.metas.get(parts[0]); if (!meta || !meta.name) { try { meta = remember({ id: parts[0], type, ...((await engine.fetchMeta(type, parts[0])) || {}) }); } catch (e) { return []; } }
    if (!meta || !meta.name) return [];
    const res = await Promise.allSettled(list.map((s) => (s.kind === 'plex' ? this.plexStreams(s, meta, type, imdb, se) : this.jfStreams(s, meta, type, imdb, se))));
    return res.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value).map((s) => {
      const t = Telemetry.parse(s);
      t.webReady = true; t.cached = true; t.source = `Your ${s._srv}`; t.headline = `Your ${s._srv}`;
      // your own copy goes first: the original file when the browser can play it, the converted one otherwise
      t.score += 2600 + (s._conv ? (t.mkv || t.codec === 'HEVC' ? 40 : -40) : 0);
      return { ...s, _addon: `Your ${s._srv}`, _addonId: `mkc.servers.${s._srv.toLowerCase()}`, _tel: t };
    });
  },
  init() {
    const fs = engine.fetchStreams.bind(engine);
    engine.fetchStreams = async function (type, id, onPartial) {
      const mine = Servers.streams(type, id).catch(() => []);
      let own = [], last = [];
      const wrap = onPartial ? (all, info) => { last = all; onPartial([...own, ...all], info); } : undefined;
      mine.then((l) => { own = l; if (l.length && onPartial) onPartial([...l, ...last], { addon: { manifest: { name: 'Your media servers', id: 'mkc.servers' } }, ok: true, count: l.length }); });
      const r = await fs(type, id, wrap);
      own = await mine;
      const streams = [...own, ...r.streams].sort((x, y) => y._tel.score - x._tel.score);
      return { ...r, streams };
    };
    SECTIONS.splice(SECTIONS.findIndex((s) => s.id === 'debrid') + 1, 0, this.section());
    const g = SET_GROUPS.find(([n]) => n === 'Watching'); if (g) g[1].push('servers');
    SET_BLURB.servers = 'Plex, Jellyfin and Emby';
  },
  /* ---- Settings › Media servers ---- */
  section() {
    return { id: 'servers', icon: 'server', label: 'Media servers', intro: 'Play what you already own. Films and episodes on your own Plex, Jellyfin or Emby server show up as sources next to your addons, and Smart Play picks them first. Sign-ins stay on this device.', bind: () => this.bind(), rows: () => [
      { html: () => { const l = this.list(); return l.length ? `<div class="seat-rows">${l.map((s) => `<div class="seat-row"><span class="seat-av srv-av"><i data-lucide="server"></i></span><div><b>${esc(s.name)}</b><small>${s.kind === 'plex' ? 'Plex' : s.kind === 'emby' ? 'Emby' : 'Jellyfin'} · ${esc(String(s.url).replace(/^https?:\/\//, '').replace(/\?.*$/, '').slice(0, 48))}</small></div><div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav data-srvdel="${esc(s.id)}">Remove</button></div></div>`).join('')}</div>` : '<p class="tour-note">No servers yet. Connect one below.</p>'; } },
      { html: () => `<div class="srv-box"><b>Plex</b><small>Sign in with a code on plex.tv/link. Works on TVs too, no typing a password.</small><div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav id="srvPlex"><i data-lucide="link"></i>Connect Plex</button></div><div id="srvPlexCode" hidden></div></div>` },
      { html: () => `<div class="srv-box"><b>Jellyfin or Emby</b><small>Your server's address, username and password. The password is sent only to your server and is not saved.</small>
          <div class="x8-form"><input class="inp" id="srvUrl" placeholder="https://jellyfin.example.com" autocomplete="off" inputmode="url"><input class="inp" id="srvUser" placeholder="Username" autocomplete="username"><input class="inp" id="srvPw" type="password" placeholder="Password" autocomplete="current-password"></div>
          <div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav id="srvJf"><i data-lucide="log-in"></i>Connect</button></div></div>` },
      { html: () => '<p class="tour-note">A server on a plain http:// address can only be reached through the MKCinema companion server (Settings › Streams & addons › MKCinema proxy URL), because browsers block it from an https page. Plex servers use secure addresses by themselves.</p>' },
    ] };
  },
  bind() {
    const b = $('#setBody'); if (!b) return;
    ['#srvUrl', '#srvUser', '#srvPw'].forEach((sel) => { const el = $(sel, b); if (el) el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('#srvJf').click(); }); });
    $$('[data-srvdel]', b).forEach((x) => x.addEventListener('click', () => { this.save(this.list().filter((s) => s.id !== x.dataset.srvdel)); renderSettingsBody(); toast('Server removed'); }));
    const jf = $('#srvJf', b);
    if (jf) jf.onclick = async () => {
      const url = $('#srvUrl').value.trim(), user = $('#srvUser').value.trim(), pw = $('#srvPw').value;
      if (!url || !user) { toast('Add the server address and your username', 'err'); return; }
      jf.disabled = true;
      try { const s = await this.jfConnect(url, user, pw); toast(`${s.name} connected`, 'ok'); renderSettingsBody(); }
      catch (e) { toast(e.message === 'http-blocked' ? 'That is an http:// address. Use https://, or set up the MKCinema companion server first' : e.message, 'err', 6000); }
      finally { jf.disabled = false; }
    };
    const px = $('#srvPlex', b);
    if (px) px.onclick = async () => {
      const box = $('#srvPlexCode'); px.disabled = true; this.plexStop = false;
      try {
        const pin = await this.plexPin();
        box.hidden = false; box.innerHTML = `<div class="srv-code"><small>On your phone or computer, go to</small><b>plex.tv/link</b><small>and enter</small><span class="srv-pin tnum">${esc(pin.code)}</span><small class="srv-wait">Waiting for Plex…</small></div>`;
        const token = await this.plexPoll(pin);
        if (!token) { box.hidden = true; if (!this.plexStop) toast('The Plex code ran out. Try again', 'err'); return; }
        $('.srv-wait', box) && ($('.srv-wait', box).textContent = 'Finding your servers…');
        const found = await this.plexServers(token);
        toast(found.length ? `${found.map((s) => s.name).join(', ')} connected` : 'Signed in, but no Plex server was found on this account', found.length ? 'ok' : 'err', 5000);
        renderSettingsBody();
      } catch (e) { box.hidden = true; toast('Plex could not be reached. Try again in a moment', 'err'); }
      finally { px.disabled = false; }
    };
  },
};
Servers.init();

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
  isEpisode() { try { const m = (!$('#detail').hidden && D.meta) || (P.ctx && P.ctx.meta) || D.meta; return !!m && m.type === 'series'; } catch (e) { return false; } },
  // 2.23.0 preferred audio language: +150 for a match (untagged counts as English), +60 for MULTi or Dual Audio
  audioBonus(s, t) {
    const want = CFG.srAudio; if (!want || want === 'any' || !t || t.isTrailer || t.kind === 'yt') return 0;
    const { langs, multi } = AudioPref.langs(s);
    if (langs.has(want) || (want === 'eng' && !langs.size)) return 150;
    return multi ? 60 : 0;
  },
  words() { return String(CFG.srWords || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean); },
  text(s) { return [s.name, s.title, s.description, s.behaviorHints && s.behaviorHints.filename].filter(Boolean).join(' '); },
  ok(s, loose) {
    const t = s._tel; if (!t || t.isTrailer || t.kind === 'yt' || s._srv) return true;
    const gb = loose ? 0 : Number(CFG.srMaxGB) || 0; if (gb && t.sizeBytes && t.sizeBytes > gb * 1073741824) return false;
    const mgb = loose ? 0 : Number(CFG.srMinGB) || 0; if (mgb && t.sizeBytes && t.sizeBytes < mgb * (this.isEpisode() ? 0.25 : 1) * 1073741824) return false;
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
    Telemetry.parse = function (s) { const t = parse(s); if (CFG.srHdr === 'prefer' && t.hdr) t.score += 60; try { t.score += SourceRules.audioBonus(s, t); } catch (e) { /* no title open */ } return t; };
    CFG_HOOKS.push((key) => { if (/^sr/.test(key)) { engine.clearCache(); if (!$('#detail').hidden && D.meta && typeof loadDetailStreams === 'function') loadDetailStreams(); } });
    SECTIONS.splice(SECTIONS.findIndex((s) => s.id === 'streams') + 1, 0, this.section());
    const g = SET_GROUPS.find(([n]) => n === 'Watching'); if (g) g[1].splice(g[1].indexOf('streams') + 1, 0, 'rules');
    SET_BLURB.rules = 'Size, quality, audio language, no cam copies, debrid order';
  },
  section() {
    return { id: 'rules', icon: 'sliders-horizontal', label: 'Source rules', intro: 'Decide which sources Smart Play and the source list use. If the rules would leave nothing, MKCinema falls back to every source so a film still plays.', bind: () => this.bind(), rows: () => [
      { key: 'srNoCam', label: 'Hide cam and screener copies', help: 'Recordings made in a cinema (CAM, TS, telesync) and screeners.', type: 'toggle', get: () => CFG.srNoCam !== false },
      { key: 'srMinRes', label: 'Lowest resolution', help: 'Sources below this are hidden.', type: 'select', options: [['', 'Any'], ['720p', '720p'], ['1080p', '1080p'], ['4K UHD', '4K']] },
      { key: 'srMaxGB', get: () => Number(CFG.srMaxGB) || 0, label: 'Largest file', help: 'Skips very large files on a slow or capped connection. 0 means no limit.', type: 'range', min: 0, max: 100, step: 5, fmt: (v) => (Number(v) ? `${v} GB` : 'No limit') },
      { key: 'srMinGB', label: 'Smallest file', help: 'Hides very small files, which are often fakes or poor quality. Episodes use a quarter of this. Files that list no size stay.', type: 'select', options: [['', 'No limit'], ['0.2', '200 MB'], ['0.5', '500 MB'], ['1', '1 GB'], ['2', '2 GB'], ['4', '4 GB']] },
      { key: 'srAudio', label: 'Preferred audio language', help: 'Sources in this language move to the top, so Smart Play picks them first, and the Audio language setting never hides them. MULTi and Dual Audio releases move up a little. When a file has several languages, this one plays first where this device allows it.', type: 'select', options: [['', 'No preference'], ['eng', 'English'], ['spa', 'Spanish'], ['fre', 'French'], ['ger', 'German'], ['ita', 'Italian'], ['por', 'Portuguese'], ['hin', 'Hindi'], ['tam', 'Tamil'], ['tel', 'Telugu'], ['jpn', 'Japanese'], ['kor', 'Korean'], ['rus', 'Russian'], ['ara', 'Arabic'], ['pol', 'Polish'], ['tur', 'Turkish']] },
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

/* ---------------- 2.9.0 Update prompt ----------------
   version.json (deployed next to the app) names the newest web app and Android app. A screen left open for days, like a
   TV, checks it every half hour and when it comes back into view. A newer web app shows a quiet bar with Refresh; an
   older Android or TV app shows Update, which downloads and opens the installer from app 1.2.5 on, and explains the
   Downloader code on older apps. Each version is offered once unless you tap Later. */
const Updater = {
  EVERY: 30 * 60e3, last: 0,
  newer(a, b) { const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; },
  appVer() { try { return window.MKAndroid && typeof MKAndroid.version === 'function' ? MKAndroid.version() : ''; } catch (e) { return ''; } },
  /* the service worker opens the stored app; ask it to fetch the new one now, so Refresh gets it */
  swFetch(ms = 8000) {
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller; if (!sw) return Promise.resolve(false);
    return new Promise((res) => { const ch = new MessageChannel(), t = setTimeout(() => res(false), ms); ch.port1.onmessage = (e) => { clearTimeout(t); res(!!(e.data && e.data.ok)); }; try { sw.postMessage({ type: 'mkc:check' }, [ch.port2]); } catch (e) { clearTimeout(t); res(false); } });
  },
  async check(force) {
    if (!force && Date.now() - this.last < this.EVERY) return; this.last = Date.now();
    if (!/^https?:$/.test(location.protocol)) return;
    let v; try { const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) return; v = await r.json(); } catch (e) { return; }
    if (v.web && this.newer(v.web, APP_VERSION)) this.swFetch();
    if (v.web && this.newer(v.web, APP_VERSION) && Store.raw.get('updSkip', '') !== `web:${v.web}`) return this.bar('web', v);
    const app = this.appVer();
    if (app && v.android && this.newer(v.android, app) && Store.raw.get('updSkip', '') !== `app:${v.android}`) return this.bar('app', v);
  },
  bar(kind, v) {
    let el = $('#updBar'); if (el) el.remove();
    const tvApp = IS_TV, canSelf = (() => { try { return typeof MKAndroid.update === 'function'; } catch (e) { return false; } })();
    const msg = kind === 'web' ? `MKCinema ${esc(v.web)} is ready` : `${tvApp ? 'TV app' : 'Android app'} ${esc(v.android)} is ready`;
    const sub = kind === 'web' ? 'Refresh to get the newest version.' : canSelf ? 'Download it and install over this one. Your settings stay.' : tvApp ? 'Open Downloader on your TV and enter 6400996 (or tv.mkcinema.app), then install over this one.' : 'Download it and install over this one. Your settings stay.';
    el = document.createElement('div'); el.id = 'updBar'; el.setAttribute('role', 'status');
    el.innerHTML = `<div><b>${msg}</b><small>${sub}</small></div><div class="inrow">${kind === 'app' && !canSelf && tvApp ? '' : `<button class="btn btn-prime btn-sm" type="button" data-nav id="updGo">${kind === 'web' ? 'Refresh' : 'Update'}</button>`}<button class="btn btn-ghost btn-sm" type="button" data-nav id="updLater">Later</button></div>`;
    document.body.appendChild(el);
    // TV: the bar sits outside the page the remote moves in, so it takes the remote while it shows (see init)
    if (IS_TV) setTimeout(() => { if (el.isConnected && $('#player').hidden && !document.body.classList.contains('layer-open')) { const f = $('#updGo') || $('#updLater'); if (f) Nav.focus(f, true); } }, 60);
    $('#updLater').onclick = () => { Store.raw.set('updSkip', kind === 'web' ? `web:${v.web}` : `app:${v.android}`); el.remove(); Nav.settle && Nav.settle(); };
    const go = $('#updGo');
    if (go) go.onclick = () => {
      if (kind === 'web') { go.disabled = true; this.swFetch().then(() => location.reload()); return; }
      const url = v.apk || 'https://mkcinema.app/download/MKCinema.apk';
      if (canSelf) { let ok = false; try { ok = MKAndroid.update(url); } catch (e) { ok = false; } toast(ok ? 'Downloading the update… the installer opens when it is done' : 'The download could not start', ok ? 'info' : 'err', 6000); if (ok) { el.remove(); Nav.settle(); } return; }
      window.open(url, '_blank', 'noopener');
    };
  },
  init() {
    // TV: while the bar shows on a page with no panel open, the remote moves inside it (Update, Later) and Back puts it away
    const onTvBar = () => { const el = IS_TV && $('#updBar'); return el && $('#player').hidden && !document.body.classList.contains('layer-open') ? el : null; };
    const root = Nav.root.bind(Nav); Nav.root = function (...a) { return onTvBar() || root(...a); };
    const pb = back; back = function (...a) { const el = onTvBar(); if (el) { el.remove(); Nav.settle(); return; } return pb.apply(this, a); };
    setTimeout(() => this.check(true), 20000);
    setInterval(() => this.check(), this.EVERY);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
  },
};
Updater.init();


/* ---------------- 2.9.0 Library: a real one ----------------
   Tabs for Watchlist, In progress, Watched and your own lists; Films or Series; sort by date added, A to Z, year or
   rating; hide what you have finished; and a filter box. Your own lists are made here or from a film page (Lists),
   and travel with your account like the watchlist. */
const Library = {
  st: { tab: 'watchlist', type: 'all', sort: 'added', hide: false, q: '' },
  lists() { return Store.get('lists', []).filter((x) => x && typeof x === 'object' && x.id).map((x) => (Array.isArray(x.items) ? x : Object.assign(x, { items: [] }))); },
  saveLists(l) { Store.set('lists', l); if (Account.user) Account.schedule(); },
  items() {
    const t = this.st.tab;
    if (t === 'watchlist') return S.watchlist.map((m, i) => ({ ...m, _added: S.watchlist.length - i }));
    if (t === 'progress') { const seen = new Map(); continueItems().forEach((p, i) => { if (!seen.has(p.metaId)) seen.set(p.metaId, { id: p.metaId, type: p.type, name: p.name, poster: p.poster, background: p.background, genres: p.genres, _added: p.at || -i, _p: p }); }); return [...seen.values()]; }
    if (t === 'watched') {
      const w = watchedMap(), out = new Map();
      Object.entries(w).forEach(([id, at]) => { const base = id.split(':')[0], m = S.metas.get(base) || S.watchlist.find((x) => x.id === base) || (Object.values(S.progress).find((p) => p.metaId === base) && { id: base, type: 'series', name: Object.values(S.progress).find((p) => p.metaId === base).name }); if (m && (!out.has(base) || out.get(base)._added < at)) out.set(base, { ...m, id: base, _added: at }); });
      return [...out.values()].filter((m) => m.name);
    }
    const l = this.lists().find((x) => x.id === t); return l ? l.items.map((m, i) => ({ ...m, _added: l.items.length - i })) : [];
  },
  view() {
    const s = this.st, q = s.q.trim().toLowerCase();
    let l = this.items().filter((m) => (s.type === 'all' || m.type === s.type) && (!q || String(m.name || '').toLowerCase().includes(q)));
    if (s.hide && s.tab !== 'watched') l = l.filter((m) => !(m.type === 'movie' && isWatched(m.id)));
    const yr = (m) => Number(String(m.releaseInfo || m.year || yearOf(m) || '').slice(0, 4)) || 0;
    const by = { added: (a, b) => (b._added || 0) - (a._added || 0), az: (a, b) => String(a.name).localeCompare(String(b.name)), year: (a, b) => yr(b) - yr(a), rating: (a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0) }[s.sort];
    return l.sort(by);
  },
  render() {
    const root = $('#libRows'); if (!root) return;
    const s = this.st, lists = this.lists();
    if (s.tab !== 'watchlist' && s.tab !== 'progress' && s.tab !== 'watched' && !lists.some((x) => x.id === s.tab)) s.tab = 'watchlist';
    const tabs = [['watchlist', `Watchlist`, S.watchlist.length], ['progress', 'In progress', new Set(continueItems().map((p) => p.metaId)).size], ['watched', 'Watched', null], ...lists.map((x) => [x.id, x.name, x.items.length])];
    const list = this.view();
    const old = $('#libX'); const hadFocus = old && old.contains(document.activeElement) ? document.activeElement.dataset : null;
    const box = document.createElement('div'); box.id = 'libX';
    box.innerHTML = `<div class="lib-tabs"><div class="lib-tl" role="tablist" aria-label="Library">${tabs.map(([id, label, n]) => `<button type="button" class="chip${s.tab === id ? ' on' : ''}" role="tab" aria-selected="${s.tab === id}" data-nav data-ltab="${esc(id)}">${esc(label)}${n != null ? ` <span class="tnum">${n}</span>` : ''}</button>`).join('')}</div><button type="button" class="chip lib-new" data-nav id="libNew"><i data-lucide="plus"></i>New list</button></div>
      <div class="lib-bar">
        <div class="segc" role="radiogroup" aria-label="Type">${[['all', 'All'], ['movie', 'Films'], ['series', 'Series']].map(([v, t]) => `<button type="button" class="${s.type === v ? 'on' : ''}" role="radio" aria-checked="${s.type === v}" data-nav data-ltype="${v}">${t}</button>`).join('')}</div>
        <select class="inp lib-sort" id="libSort" aria-label="Sort" data-nav>${[['added', 'Date added'], ['az', 'A to Z'], ['year', 'Newest first'], ['rating', 'Highest rated']].map(([v, t]) => `<option value="${v}"${s.sort === v ? ' selected' : ''}>${t}</option>`).join('')}</select>
        ${s.tab !== 'watched' ? `<button type="button" class="chip${s.hide ? ' on' : ''}" data-nav id="libHide" aria-pressed="${s.hide}">Hide watched</button>` : ''}
        <input class="inp lib-q" id="libQ" type="search" placeholder="Filter" value="${esc(s.q)}" autocomplete="off" aria-label="Filter by title">
        ${s.tab === 'progress' && continueItems().length ? '<button type="button" class="btn btn-ghost btn-sm" data-nav id="libClear"><i data-lucide="trash-2"></i>Clear progress</button>' : ''}
        ${lists.some((x) => x.id === s.tab) ? '<button type="button" class="btn btn-ghost btn-sm" data-nav id="libDel"><i data-lucide="trash-2"></i>Delete list</button>' : ''}
      </div>
      <div class="grid lib-grid">${list.map((m) => cardHTML(m, m._p ? { progress: m._p, sub: progressSub(m._p) } : {})).join('') || `<div class="empty">${{ watchlist: 'Use the Watchlist button on any title to save it here.', progress: 'Start something and it shows up here.', watched: 'Finished films and episodes show up here.' }[s.tab] || 'Add titles from a film page with the Lists button.'}</div>`}</div>`;
    if (old) old.replaceWith(box); else root.prepend(box);
    icons();
    $$('[data-ltab]', box).forEach((b) => b.addEventListener('click', () => { s.tab = b.dataset.ltab; this.render(); }));
    $$('[data-ltype]', box).forEach((b) => b.addEventListener('click', () => { s.type = b.dataset.ltype; this.render(); }));
    $('#libSort', box).addEventListener('change', (e) => { s.sort = e.target.value; Store.set('libSort', s.sort); this.render(); });
    const h = $('#libHide', box); if (h) h.addEventListener('click', () => { s.hide = !s.hide; Store.set('libHide', s.hide); this.render(); });
    const qi = $('#libQ', box); let qt = 0;
    qi.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { s.q = qi.value; const pos = qi.selectionStart; this.render(); const n = $('#libQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ok */ } } }, 160); });
    qi.addEventListener('keydown', (e) => { if (!/^Arrow(Up|Down)$/.test(e.key)) e.stopPropagation(); });
    $('#libNew', box).onclick = () => this.newList();
    const c = $('#libClear', box); if (c) c.onclick = () => confirmTwice(c, () => { S.progress = {}; Store.set('progress', {}); renderLibrary(); });
    const d = $('#libDel', box); if (d) d.onclick = () => confirmTwice(d, () => { this.saveLists(this.lists().filter((x) => x.id !== s.tab)); s.tab = 'watchlist'; this.render(); toast('List deleted'); });
    if (hadFocus) { const k = Object.keys(hadFocus).find((x) => x.startsWith('l')); const el = k && $(`[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${hadFocus[k]}"]`, box); if (el && IS_TV) Nav.focus(el, true); }
  },
  newList(addMeta) {
    const name = (prompt('Name the new list') || '').trim().slice(0, 40); if (!name) return null;
    const l = this.lists(), item = { id: `l${Date.now().toString(36)}`, name, items: [] };
    if (addMeta) item.items.push(this.slim(addMeta));
    this.saveLists([...l, item]); toast(addMeta ? `Added to ${name}` : `${name} is ready`, 'ok');
    if (S.view === 'library') { this.st.tab = item.id; renderLibrary(); }
    return item;
  },
  slim(m) { return { id: m.id, type: m.type, name: m.name, poster: metaPoster(m), background: metaBg(m), releaseInfo: yearOf(m), genres: genresOf(m).slice(0, 3), imdbRating: m.imdbRating }; },
  toggle(listId, m) {
    const l = this.lists(), x = l.find((y) => y.id === listId); if (!x) return;
    const has = x.items.some((i) => i.id === m.id);
    x.items = has ? x.items.filter((i) => i.id !== m.id) : [this.slim(m), ...x.items];
    this.saveLists(l); toast(has ? `Removed from ${x.name}` : `Added to ${x.name}`, has ? 'info' : 'ok');
  },
  // the Lists button on a film page: pick lists in a small menu
  menu(m, btn) {
    let pop = $('#listPop'); if (pop) { pop.remove(); return; }
    const l = this.lists();
    pop = document.createElement('div'); pop.id = 'listPop'; pop.className = 'list-pop';
    pop.innerHTML = `${l.map((x) => `<button type="button" data-nav data-lpick="${esc(x.id)}"><i data-lucide="${x.items.some((i) => i.id === m.id) ? 'check' : 'plus'}"></i>${esc(x.name)}</button>`).join('')}<button type="button" data-nav data-lpick="__new"><i data-lucide="list-plus"></i>New list</button>`;
    btn.after(pop); icons();
    $$('[data-lpick]', pop).forEach((b) => b.addEventListener('click', () => { if (b.dataset.lpick === '__new') this.newList(m); else this.toggle(b.dataset.lpick, m); pop.remove(); }));
    const f = $('[data-lpick]', pop); if (f && IS_TV) Nav.focus(f, true);
  },
  init() {
    this.st.sort = Store.get('libSort', 'added') || 'added'; this.st.hide = !!Store.get('libHide', false);
    const base = renderLibrary;
    renderLibrary = function () {
      base.apply(this, arguments);
      // the watchlist and Continue watching move into the tabs; bookmarks and the calendar stay below
      $$('#libRows > section.row').forEach((sec) => { if (/^(My watchlist|Continue watching)/.test(window.i18nEn ? i18nEn(sec.querySelector('.row-title')) : ((sec.querySelector('.row-title') || {}).textContent || ''))) sec.remove(); });
      Library.render();
    };
    const rd = renderDetail;
    renderDetail = function () {
      const r = rd.apply(this, arguments);
      const b = $('#dList'); if (b && !$('#dLists') && D.meta) { b.insertAdjacentHTML('afterend', '<button class="btn btn-ghost" type="button" id="dLists" data-nav><i data-lucide="list-plus"></i>Lists</button>'); icons(); const m = D.meta; $('#dLists').onclick = (e) => Library.menu(m, e.currentTarget); }
      return r;
    };
    // lists travel with the account
    const ex = exportData; exportData = function () { const d = ex.apply(this, arguments); d.lists = Library.lists(); return d; };
    const ap = Account.applyRemote.bind(Account); Account.applyRemote = function (d) { const r = ap(d); if (d && Array.isArray(d.lists)) Store.set('lists', d.lists); return r; };
    if (S.view === 'library') renderLibrary();
  },
};
Library.init();

/* ---------------- 2.9.1 The TV player (Android TV app 1.2.5) ----------------
   On a TV with app 1.2.5 or later, streams play in the TV's own hardware player (MKAndroid.play): MKV, HEVC, HDR and
   Dolby Vision play the way the TV plays them, and with frame-rate matching the TV switches to the film's frame rate.
   MKCinema keeps everything else: it picks the source, sends your subtitle language along, saves where you stopped,
   marks it watched and moves on to the next episode. Settings › Playback › TV player can switch back to the in-app
   player (subtitle styling, Night Mode, X-Ray). If the TV player can't open a source, the in-app player takes over. */
const TvPlayer = {
  on() {
    if (!IS_TV || CFG.tvPlayer === 'web') return false;
    try { return !!(window.MKAndroid && typeof MKAndroid.play === 'function'); } catch (e) { return false; }
  },
  /* Android phone app: a file whose release name lists more than one audio language (MULTi, Dual Audio, Hindi +
     English...) opens in the app's Android player, which starts the track in your Audio language. In the web player
     such a file can start in the wrong language when its host doesn't let MKCinema read it. The player's options row
     can still switch to the MKCinema player. Settings › Playback › Multi-language files turns it off. */
  phone(stream) {
    if (IS_TV || CFG.phoneNativeAudio === false || !stream || !stream.url || stream._local || stream._noNative) return false;
    try { if (!(window.MKAndroid && typeof MKAndroid.play === 'function')) return false; } catch (e) { return false; }
    const want = CFG.audioOnly; if (!want || want === 'any') return false;
    if (stream._tel && (stream._tel.isTrailer || stream._tel.kind === 'yt')) return false;
    try { const { langs, multi } = AudioPref.langs(stream); return multi || langs.size > 1; } catch (e) { return false; }
  },
  cur: null,
  /* 2.67.1 tv-playback: the next source for the TV player after one would not open: best score first, one it plays,
     cached on the debrid service, never a copy of a file that already failed */
  next(ctx, tried) {
    const key = (x) => String(x._infoHash || x.infoHash || (x.behaviorHints || {}).filename || x.url || '').toLowerCase();
    const bad = new Set(tried.map(key).filter(Boolean));
    let list = ctx.streams || [];
    try { list = visibleStreams(list); } catch (e) { /* the full list */ }
    return list.slice().sort((a, b) => ((b._tel && b._tel.score) || 0) - ((a._tel && a._tel.score) || 0)).find((x) => {
      const t = x && x._tel;
      if (!t || tried.includes(x) || bad.has(key(x)) || x.ytId || t.isTrailer || !t.webReady || t.cached === false || t.fits === false) return false;
      return !(t.kind === 'p2p' && !t.debrid) && t.kind !== 'ext' && t.kind !== 'none';
    }) || null;
  },
  async subUrl(ctx) {
    if (CFG.subAuto === false || !CFG.subLang || CFG.subLang === 'off') return '';
    const id = ctx.video ? (ctx.video.id || videoIdFor(ctx.meta, ctx.video)) : ctx.meta.id;
    try {
      const list = await Promise.race([engine.fetchSubtitles(ctx.meta.type, id), new Promise((r) => setTimeout(() => r([]), 2500))]);
      const want = String(CFG.subLang).slice(0, 3).toLowerCase();
      const s = (list || []).find((x) => String(x.lang || '').toLowerCase().startsWith(want)); return s && /^https:/.test(s.url) ? s.url : '';
    } catch (e) { return ''; }
  },
  save(pos, dur) {
    const c = this.cur; if (!c || !(dur > 30000)) return;
    const ctx = c.ctx, key = ctx.video ? ctx.video.id : ctx.meta.id, t = pos / 1000, d = dur / 1000;
    if (t / d > 0.95) { delete S.progress[key]; markWatched(key); }
    else if (t > 5) S.progress[key] = { videoId: key, metaId: ctx.meta.id, type: ctx.meta.type, name: ctx.meta.name, poster: metaPoster(ctx.meta), background: metaBg(ctx.meta), genres: genresOf(ctx.meta).slice(0, 2), thumb: ctx.video && ctx.video.thumbnail, epTitle: ctx.video && (ctx.video.name || ctx.video.title), season: ctx.video && ctx.video.season, episode: ctx.video && ctx.video.episode, t, d, at: Date.now(), bingeGroup: c.stream.behaviorHints && c.stream.behaviorHints.bingeGroup, addon: c.stream._addon };
    Store.set('progress', S.progress); if (Account.user) Account.schedule();
  },
  init() {
    const lu = loadUrl;
    loadUrl = function (stream, startAt) {
      if (!(TvPlayer.on() || TvPlayer.phone(stream)) || !P.ctx || stream._local || stream._noNative) return lu.apply(this, arguments);
      const bh = stream.behaviorHints || {}, headers = bh.proxyHeaders && bh.proxyHeaders.request;
      // streams that ask for request headers (Referer, User-Agent...): TV app 1.2.8 sends them itself, no proxy needed
      const nativeHdr = !!(headers && Object.keys(headers).length && (() => { try { return Updater.newer(MKAndroid.version(), '1.2.7'); } catch (e) { return false; } })());
      if (bh.proxyHeaders && !S.proxy && !nativeHdr) return lu.apply(this, arguments);
      const src = nativeHdr ? stream.url : (bh.proxyHeaders || CFG.alwaysProxy) ? proxify(stream.url, headers || {}) : stream.url;
      const ctx = P.ctx, v = ctx.video;
      TvPlayer.cur = { ctx, stream, startAt };
      (async () => {
        const [subUrl, tvx] = await Promise.all([TvPlayer.subUrl(ctx), typeof TvParity !== 'undefined' ? TvParity.prep(ctx).catch(() => ({})) : Promise.resolve({})]);
        if (P.stream !== stream) return;
        const ok = (() => { try { return MKAndroid.play(JSON.stringify({ url: src, title: ctx.meta.name || '', sub: v ? `S${v.season} · E${v.episode}${v.name || v.title ? ` · ${v.name || v.title}` : ''}` : [yearOf(ctx.meta), stream._tel && stream._tel.res].filter(Boolean).join(' · '), startMs: Math.round((startAt || 0) * 1000), subUrl, matchRate: CFG.matchRate !== false, audioLang: (typeof MkAudioWant === 'function' ? MkAudioWant() : CFG.audioOnly) || '', headers: nativeHdr ? headers : undefined, ...tvx })); } catch (e) { return false; } })();
        if (!ok) { TvPlayer.cur = null; lu.call(this, stream, startAt); return; }
        Loader.hide && Loader.hide();
      })();
    };
    window.MKNative = {
      done(pos, dur, ended, next, err, act) { // MKNative 1.6.1: act = 'sources' | 'web' from the TV player's options row
        const c = TvPlayer.cur; if (!c) return;
        if (act === 'web') {
          // keep watching in MKCinema's own player (subtitle search and styling, every audio track, sources drawer)
          TvPlayer.save(pos, dur); TvPlayer.cur = null; c.stream._noNative = true; lu(c.stream, pos > 0 ? pos / 1000 : c.startAt); return;
        }
        if (err && !(pos > 0)) {
          // 2.67.1: the TV player could not open it: up to three more sources go to the TV player, and only then does the
          // in-app player try (on a TV box it decodes less and runs slower than the TV player)
          TvPlayer.cur = null;
          try { if (window.MkLinkHealth) MkLinkHealth.fail(c.stream, `could not open (${err})`); } catch (e) { /* no link memory */ }
          const tried = c.ctx._tvTried || (c.ctx._tvTried = []); if (!tried.includes(c.stream)) tried.push(c.stream);
          const nx = tried.length < 4 ? TvPlayer.next(c.ctx, tried) : null;
          if (nx) { toast('That source would not open. Trying the next one…', 'info', 3000, 'tvnext'); playStream(c.ctx, nx); return; }
          // from here on this film stays in the in-app player (its own source switching must not hand sources back)
          (c.ctx.streams || []).forEach((x) => { if (x) x._noNative = true; });
          c.stream._noNative = true; toast('Playing in the MKCinema player instead', 'info', 3000); lu(c.stream, c.startAt); return;
        }
        c.ctx._tvTried = null;
        TvPlayer.save(pos, dur);
        TvPlayer.cur = null;
        const hasNext = c.ctx.video && nextVideo(c.ctx.meta, c.ctx.video);
        if (hasNext && (next || (ended && CFG.autoNext))) { playNext(); return; }
        if (!$('#player').hidden) closePlayer();
        if (S.view === 'home') renderHome(); else if (S.view === 'library') renderLibrary();
        // like outside players, leaving the TV player lands on the film's page with its sources, never back on Home
        const m = c.ctx.meta, onIt = !$('#detail').hidden && D.meta && D.meta.id === m.id;
        if (!onIt) openDetail(m, { videoId: c.ctx.video ? videoIdFor(m, c.ctx.video) : undefined });
        if (act === 'sources') {
          let n = 0; const go = () => { const st = $('#dStreams'), f = st && st.querySelector('[data-nav],button,a');
            if (f) { st.scrollIntoView({ block: 'start' }); Nav.focus(f, true); } else if (++n < 20) setTimeout(go, 250); };
          setTimeout(go, onIt ? 60 : 400);
        }
      },
    };
    const sec = SECTIONS.find((s) => s.id === 'playback');
    if (sec && IS_TV && window.MKAndroid) {
      const rows = sec.rows;
      sec.rows = () => [...rows(),
        { key: 'tvPlayer', label: 'TV player', help: 'The TV player uses your TV’s own video hardware: MKV, HEVC, HDR and Dolby Vision play smoothly. The MKCinema player keeps subtitle styling and X-Ray. Needs the MKCinema TV app 1.2.5 or later.', type: 'select', options: [['native', 'TV player (smoothest)'], ['web', 'MKCinema player']], get: () => CFG.tvPlayer || 'native' },
        { key: 'matchRate', label: 'Match the film’s frame rate', help: 'The TV switches to 24 Hz for films shot at 24 frames, so panning shots don’t judder, and switches back afterwards. Some TVs blank for a second while switching.', type: 'toggle', get: () => CFG.matchRate !== false },
      ];
    } else if (sec && !IS_TV && window.MKAndroid && typeof MKAndroid.play === 'function') {
      const rows = sec.rows;
      sec.rows = () => [...rows(),
        { key: 'phoneNativeAudio', label: 'Multi-language files', help: 'Files that carry several audio languages open in the Android player, which starts in your Audio language. Turn off to play them in the MKCinema player.', type: 'toggle', get: () => CFG.phoneNativeAudio !== false },
      ];
    }
  },
};
TvPlayer.init();

/* Jellyfin and Emby on plain http:// addresses work inside the Android app from 1.2.5 */
{
  const r = Servers.reach.bind(Servers);
  Servers.reach = function (url) { try { if (/^http:/i.test(url) && window.MKAndroid && Updater.newer(MKAndroid.version(), '1.2.4')) return url; } catch (e) { /* older app */ } return r(url); };
}

/* ---------------- 2.9.2 Picture-in-picture on phones ----------------
   In the Android app (1.2.6+) the page tells the app when a film is playing and its shape; pressing Home, or the
   player's PiP button, shrinks the film into a floating window (WebViews have no requestPictureInPicture).
   In the window only the picture shows. Swiping the window away pauses the film. In browsers the video element
   is marked autopictureinpicture, so installed apps that support it go into PiP on their own. */
const PipMode = {
  native: () => !IS_TV && !!(window.MKAndroid && MKAndroid.pipState),
  last: '',
  report() {
    if (!this.native()) return;
    const on = !$('#player').hidden && !!P.stream && !video.paused && !video.ended;
    const k = `${on}|${video.videoWidth}|${video.videoHeight}`; if (k === this.last) return; this.last = k;
    try { MKAndroid.pipState(on, video.videoWidth || 16, video.videoHeight || 9); } catch (e) { /* older app */ }
  },
};
window.MKPip = {
  mode(on) { document.documentElement.classList.toggle('pip-mode', !!on); if (!on) PipMode.last = ''; },
  closed() { document.documentElement.classList.remove('pip-mode'); try { if (!video.paused) video.pause(); } catch (e) { /* none */ } PipMode.report(); },
};
try { video.setAttribute('autopictureinpicture', ''); } catch (e) { /* none */ }
['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'emptied'].forEach((ev) => video.addEventListener(ev, () => PipMode.report()));
{
  const pc = closePlayer;
  closePlayer = function (...a) { const r = pc.apply(this, a); PipMode.last = ''; if (PipMode.native()) { try { MKAndroid.pipState(false, 0, 0); } catch (e) { /* older app */ } } return r; };
  const btn = $('#pPip'), orig = btn && btn.onclick;
  if (btn) btn.onclick = (e) => { if (window.MKAndroid && MKAndroid.pip && !IS_TV) { if (!MKAndroid.pip()) toast('Picture in picture is not available on this phone', 'err'); return; } if (orig) orig.call(btn, e); };
}

/* ---------------- 2.9.3 Watch Party, redesigned ----------------
   Before a party: a title, then two side-by-side cards (Host / Join with six code cells), then your name and a
   switch for sharing your stream link. In a party: the code as letter tiles with invite and QR, members as
   avatar chips, reactions, and the chat. Same element ids as before, so Party.render() wires it all up. */
{
  const initials = (n) => String(n || '?').replace(/\([^)]*\)/g, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  Party.html = function () {
    if (!this.code) return `<div class="pz">
      <h3 class="pz-title">Watch together</h3>
      <p class="pz-lede">In perfect sync, with voice and chat, on any screen.</p>
      <div class="pz-cards">
        <section class="pz-card pz-host">
          <span class="pz-ic" aria-hidden="true"><i data-lucide="sparkles"></i></span>
          <h4>Host a party</h4>
          <p>Get a code and invite anyone. You lead play, pause and seek.</p>
          <button class="btn btn-prime pz-go" type="button" id="pyNew" data-nav><i data-lucide="plus"></i>Start a party</button>
        </section>
        <section class="pz-card pz-join">
          <span class="pz-ic" aria-hidden="true"><i data-lucide="ticket"></i></span>
          <h4>Join a party</h4>
          <label class="pz-cells" for="pyCode"><input class="pz-codein mono" id="pyCode" maxlength="6" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Party code, 6 characters" data-nav>${'<i></i>'.repeat(6)}</label>
          <button class="btn btn-ghost pz-go" type="button" id="pyJoin" data-nav disabled><i data-lucide="log-in"></i>Join</button>
        </section>
      </div>
      <div class="pz-foot">
        <label class="pz-name"><span>Your name</span><input class="inp" id="pyName" maxlength="24" value="${esc(this.name())}" autocomplete="nickname" data-nav></label>
        <label class="pz-switch"><input type="checkbox" role="switch" id="pyLink" ${CFG.partyShareLink ? 'checked' : ''} data-nav><span class="pz-track" aria-hidden="true"></span><span class="pz-sw-t"><b>Share my stream link</b><small>Guests play the same file you do, after they tap to allow it. Links with a server key are never shared. Off: everyone uses their own addons.</small></span></label>
      </div>
    </div>`;
    const link = appLink(`party=${this.code}`);
    return `<div class="pz pz-room">
      <div class="pz-codebar">
        <div class="pz-tiles" aria-label="Party code ${esc(this.code.split('').join(' '))}">${this.code.split('').map((c) => `<b class="mono">${esc(c)}</b>`).join('')}</div>
        <div class="pz-acts"><button class="btn btn-ghost btn-sm" type="button" id="pyCopy" data-nav><i data-lucide="copy"></i>Copy invite</button><button class="btn btn-ghost btn-sm" type="button" id="pyQr" data-nav><i data-lucide="qr-code"></i>QR</button></div>
      </div>
      <div class="qr-wrap sm" id="pyQrBox" hidden>${link ? QR.svg(link) : ''}</div>
      <div class="py-members" id="pyMembers"></div>
      <div class="pz-ctl"><button class="btn ${this.mic ? 'btn-prime' : 'btn-ghost'} btn-sm" type="button" id="pyMic" data-nav aria-pressed="${!!this.mic}"><i data-lucide="${this.mic ? 'mic' : 'mic-off'}"></i>${this.mic ? 'Mic on' : 'Mic off'}</button>
        <div class="py-reacts" role="group" aria-label="Reactions">${['😂', '😮', '😍', '👏', '🔥', '😢', '😱', '🍿'].map((e) => `<button type="button" data-react="${e}" data-nav aria-label="React ${e}">${e}</button>`).join('')}</div>
        <button class="btn btn-ghost btn-sm danger" type="button" id="pyLeave" data-nav><i data-lucide="log-out"></i>Leave</button></div>
      <div class="py-chat" id="pyChat" role="log" aria-live="polite"></div>
      <form class="py-say" id="pySay"><input class="inp" id="pyText" maxlength="400" placeholder="Say something…" autocomplete="off" data-nav><button class="ibtn" type="submit" aria-label="Send" data-nav><i data-lucide="send"></i></button></form>
    </div>`;
  };
  Party.renderMembers = function () {
    const rows = [{ id: this.me.id, name: this.name(), you: true, state: 'self' }, ...[...this.peers.values()].map((p) => ({ id: p.id, name: p.name, state: p.dc && p.dc.readyState === 'open' ? 'direct' : p.pc.connectionState === 'connecting' || p.pc.connectionState === 'new' ? 'connecting' : 'relay', rtt: p.rtt }))];
    $$('#pyMembers').forEach((box) => {
      box.innerHTML = rows.map((r) => {
        const note = r.state === 'self' ? (this.lastDrift != null && !this.isHost() ? `${Math.round(Math.abs(this.lastDrift) * 1000)} ms off` : 'You') : r.state === 'direct' ? `Direct${r.rtt ? ` · ${r.rtt} ms` : ''}` : r.state === 'relay' ? 'Via relay' : 'Connecting…';
        return `<div class="pm-row ${this.speaking.has(r.id) ? 'talk' : ''}" data-pid="${esc(r.id)}"><span class="pm-av ${r.state}" aria-hidden="true">${esc(initials(r.name))}</span><span class="pm-txt"><b>${esc(r.name)}</b><small>${esc(note)}</small></span>${r.id === this.hostId ? '<span class="pm-host">Host</span>' : ''}</div>`;
      }).join('');
    });
  };
  const pr = Party.render;
  Party.render = function (...a) {
    const r = pr.apply(this, a);
    $$('#pyCode').forEach((inp) => {
      const join = inp.closest('.pz-join'), btn = join && $('#pyJoin', join);
      const sync = () => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); if (v !== inp.value) inp.value = v; if (btn) btn.disabled = v.length !== 6; $$('.pz-cells i', join).forEach((c, i) => { c.textContent = v[i] || ''; c.classList.toggle('on', i === v.length && document.activeElement === inp); }); };
      ['input', 'focus', 'blur'].forEach((ev) => inp.addEventListener(ev, sync)); sync();
    });
    return r;
  };
}

/* ---------------- 2.9.3 Split Screen from a film page ----------------
   Split Screen was only reachable from Live TV and the player's menu. A chip at the end of a film's source filters
   puts the best source that plays in the app into a Split Screen tile; Split Screen's own picker adds the rest. */
{
  const panel = renderStreamsPanel;
  renderStreamsPanel = function (...a) {
    const r = panel.apply(this, a);
    const box = $('#dStreams'), chips = box && $('.chips', box);
    if (!chips || $('#dSplit', box) || typeof Split === 'undefined') return r;
    const ok = (s) => s && s._tel && s._tel.webReady && /^https?:/i.test(s.url || '');
    if (!(D.streams || []).some(ok)) return r;
    chips.insertAdjacentHTML('beforeend', '<button class="chip" type="button" data-nav id="dSplit"><i data-lucide="layout-grid"></i>Split Screen</button>');
    $('#dSplit', box).onclick = () => {
      const list = visibleStreams(D.streams).filter(ok), s = pickBest(list) || list[0]; if (!s) return;
      const m = D.meta || {}, v = D.video;
      Split.open({ name: v ? `${m.name || ''} · S${v.season} E${v.episode}` : m.name || 'Stream', url: s.url, headers: s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request });
    };
    icons();
    return r;
  };
}

/* ---------------- 2.9.4 Peak Cinema: details without leaving the surfer ----------------
   Details (button, or Menu / i on the remote) pauses the scene and slides in a panel with the film's story, cast,
   running time and ratings. Back to the scene resumes exactly where it was; Keep watching and From the start open the
   full film; Full page opens the normal title page. Back on the remote closes the panel, not Peak Cinema. */
if (typeof Peak !== 'undefined') {
  const PD = {
    el: null, resume: false, tok: 0,
    isOpen() { return !!(this.el && !this.el.hidden); },
    build() {
      if (this.el) return this.el;
      const el = this.el = document.createElement('div'); el.className = 'pk-det'; el.id = 'pkDet'; el.hidden = true;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Details');
      Peak.el.appendChild(el); return el;
    },
    paint(m, full) {
      const el = this.el, c = Peak.cur, logo = metaLogo(m);
      const mins = parseInt(m.runtime, 10) || (c && c.d ? Math.round(c.d / 60) : 0);
      const run = mins ? `${Math.floor(mins / 60) ? `${Math.floor(mins / 60)} h ` : ''}${mins % 60 ? `${mins % 60} min` : ''}`.trim() : '';
      const cast = (Array.isArray(m.cast) ? m.cast : []).slice(0, 6).join(', ');
      const dir = (Array.isArray(m.director) ? m.director : m.director ? [m.director] : []).slice(0, 2).join(', ');
      const desc = m.description || (full ? '' : 'Loading the story…');
      el.innerHTML = `<div class="pk-det-in">
        <div class="pk-det-head">${logo ? imgTag(logo, m.name, m.id, { nofb: true, cls: 'pk-det-logo', lazy: false }) : ''}<h2 class="pk-det-t" data-logo-alt ${logo ? 'hidden' : ''}>${esc(m.name || '')}</h2></div>
        <div class="metaline">${[m.imdbRating ? `<span class="imdb ${rateTier(m.imdbRating)}"><b>IMDb</b>${esc(m.imdbRating)}</span>` : '', yearOf(m) ? `<span>${esc(yearOf(m))}</span>` : '', run ? `<span>${esc(run)}</span>` : '', genresOf(m).slice(0, 3).map(esc).join(' · ')].filter(Boolean).join('')}</div>
        <p class="pk-det-desc">${esc(desc)}</p>
        ${cast || dir ? `<dl class="pk-det-dl">${dir ? `<div><dt>Director</dt><dd>${esc(dir)}</dd></div>` : ''}${cast ? `<div><dt>Starring</dt><dd>${esc(cast)}</dd></div>` : ''}</dl>` : ''}
        <div class="pk-det-acts">
          <button class="btn btn-bolt" type="button" data-nav data-pd="back"><i data-lucide="arrow-left"></i>Back to the scene</button>
          <button class="btn btn-ghost" type="button" data-nav data-pd="keep"><i data-lucide="play"></i>Keep watching</button>
          <button class="btn btn-ghost" type="button" data-nav data-pd="start"><i data-lucide="rotate-ccw"></i>From the start</button>
          <button class="btn btn-ghost" type="button" data-nav data-pd="page"><i data-lucide="panel-right-open"></i>Full page</button>
        </div></div>`;
      icons();
      $$('[data-pd]', el).forEach((b) => b.addEventListener('click', () => {
        const a = b.dataset.pd;
        if (a === 'back') this.close();
        else if (a === 'keep') { this.close(true); Peak.keep(false); }
        else if (a === 'start') { this.close(true); Peak.keep(true); }
        else if (a === 'page') { const mm = (Peak.cur || {}).meta; this.close(true); Peak.close(); if (mm) openDetail(mm); }
      }));
    },
    async open() {
      const c = Peak.cur; if (!c) return;
      this.build(); const tok = ++this.tok;
      this.resume = !c.v.paused; try { c.v.pause(); } catch (e) { /* none */ }
      this.paint(c.meta, false); this.el.hidden = false; Peak.el.classList.add('pk-det-on'); Peak.wake(true);
      requestAnimationFrame(() => this.el.classList.add('on'));
      if (IS_TV) Nav.restore(true); else { const b = $('[data-pd="back"]', this.el); if (b) b.focus(); }
      // the catalog entry is thin (often no cast or running time): fetch the full one, once per film
      if (!c.meta._pkFull && c.meta.id && c.meta.type) {
        try {
          const full = await engine.fetchMeta(c.meta.type, c.meta.id);
          if (full && tok === this.tok && this.isOpen() && Peak.cur === c) { c.meta = Object.assign({}, c.meta, full, { _pkFull: true }); const f = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.pd : null; this.paint(c.meta, true); if (f) { const b = $(`[data-pd="${f}"]`, this.el); if (b) (IS_TV ? Nav.focus(b, true) : b.focus()); } }
        } catch (e) { /* keep the thin one */ }
      }
      if (this.isOpen() && !c.meta.description) { const d = $('.pk-det-desc', this.el); if (d) d.textContent = ''; }
    },
    close(leaving) {
      if (!this.isOpen()) return;
      this.tok++; this.el.classList.remove('on'); this.el.hidden = true; Peak.el.classList.remove('pk-det-on');
      const c = Peak.cur;
      if (!leaving && c && this.resume) c.v.play().catch(() => {});
      if (!leaving) { Peak.wake(); if (IS_TV) { Nav.restore(true); const d = $('#pkDetails'); if (d) Nav.focus(d, true); } }
    },
  };
  Peak.details = PD;
  const bind = () => { const b = Peak.el && $('#pkDetails', Peak.el); if (b && !b._pd) { b._pd = true; b.onclick = () => PD.open(); } };
  bind();
  const init = Peak.init; if (init) Peak.init = function (...a) { const r = init.apply(this, a); bind(); return r; };
  const open = Peak.open; if (open) Peak.open = function (...a) { bind(); return open.apply(this, a); };
  // leaving Peak Cinema, or a new scene, closes the panel
  const pclose = Peak.close; Peak.close = function (...a) { PD.close(true); return pclose.apply(this, a); };
  const adv = Peak.advance; Peak.advance = function (...a) { if (PD.isOpen()) PD.close(true); return adv.apply(this, a); };
  // keep the controls up while the panel is open
  const wake = Peak.wake; Peak.wake = function (stay) { return wake.call(this, stay || PD.isOpen()); };
  // Menu (the app maps it to "o") or i opens it; while it is open, keys belong to the panel
  const key = Peak.key; Peak.key = function (e) {
    if (!this.on || !$('#player').hidden) return key.call(this, e);
    const k = e.key, tag = (e.target && e.target.tagName) || '';
    if (PD.isOpen()) { if (k === 'o' || k === 'O' || k === 'i' || k === 'I' || k === 'Info' || e.keyCode === 457) { e.preventDefault(); e.stopImmediatePropagation(); PD.close(); } return; }
    if (!/INPUT|TEXTAREA|SELECT/.test(tag) && this.cur && (k === 'o' || k === 'O' || k === 'i' || k === 'I' || k === 'Info' || e.keyCode === 457)) { e.preventDefault(); e.stopImmediatePropagation(); PD.open(); return; }
    return key.call(this, e);
  };
  const pb = back; back = function (...a) { if (PD.isOpen() && Peak.on && $('#player').hidden) { PD.close(); return; } return pb.apply(this, a); };
  const root = Nav.root.bind(Nav); Nav.root = function (...a) { if (PD.isOpen() && Peak.on && $('#player').hidden) return PD.el; return root(...a); };
  const start = Nav.start.bind(Nav); Nav.start = function (r, list) { if (r === PD.el) return list.find((x) => x.dataset.pd === 'back') || list[0]; return start(r, list); };
}

/* ---------------- 2.9.9 One-tap addon install from setup pages ----------------
   Addons that need your own settings or token are set up on their own page, which ends with an Install button
   (a stremio:// link) or a manifest link to copy. The Android and TV app (1.2.8) now opens on that Install button and
   lands here; MKCinema also reads a #install= link. In the browser, coming back from a setup page offers to install
   the link you copied, in one press. Every install still asks first, showing the addon's own name. */
const AddonLink = {
  away: 0,
  pick(t) {
    const m = String(t || '').match(/(stremio|https?):\/\/[^\s"'<>]+?\/manifest\.json(\?[^\s"'<>]*)?/i);
    return m ? m[0] : null;
  },
  async ask(raw) {
    const url = this.pick(raw); if (!url) { toast('That is not an addon link (it should end in manifest.json)', 'err', 5000); return; }
    const go = async () => {
      X8.layer('adLink', { label: 'Install addon', icon: 'puzzle', eyebrow: 'Install addon' });
      const b = X8.body('adLink');
      b.innerHTML = '<div class="status-line" style="padding:24px"><span class="spin"></span>Reading the addon…</div>';
      X8.open('adLink');
      let m = null;
      try { const r = await fetch(url.replace(/^stremio:\/\//i, 'https://'), { cache: 'no-store' }); if (r.ok) m = await r.json(); } catch (e) { /* shown below */ }
      if (!m || !m.id) { b.innerHTML = `<div class="empty-state"><i data-lucide="cloud-off"></i><h3>The addon did not answer</h3><p>Check the link on its setup page, or paste it in the addon manager.</p></div>`; icons(); return; }
      const have = engine.addons.some((a) => a.manifest && a.manifest.id === m.id);
      const host = (() => { try { return new URL(url.replace(/^stremio:\/\//i, 'https://')).host; } catch (e) { return ''; } })();
      b.innerHTML = `<h3 class="x8-h">${esc(m.name || 'Addon')}</h3>
        <p class="sub">${esc(String(m.description || '').slice(0, 220))}</p>
        <p class="sub mono" style="opacity:.8">${esc(host)}${m.version ? ` · v${esc(m.version)}` : ''}</p>
        <p class="tour-note">Addons are made by their own authors and MKCinema checks none of them. Install only what you trust.${have ? ' Installing again replaces the copy you have, with these settings.' : ''}</p>
        <div class="actions"><button class="btn btn-prime" type="button" data-nav id="adLinkGo"><i data-lucide="download-cloud"></i>${have ? 'Update addon' : 'Install addon'}</button><button class="btn btn-ghost" type="button" data-nav id="adLinkNo">Cancel</button></div>`;
      icons();
      $('#adLinkNo').onclick = () => X8.close('adLink');
      $('#adLinkGo').onclick = async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        const r = await installAddon(url);
        if (!r) { btn.disabled = false; return; }
        // new settings mean a new link: the copy with the old link goes, once the new one is in
        engine.addons.filter((a) => a !== r && !a.builtin && a.manifest && a.manifest.id === m.id).forEach((a) => engine.remove(a.baseUrl));
        X8.close('adLink'); if (!$('#addons').hidden) renderAddons();
      };
      if (IS_TV) Nav.settle();
    };
    if (typeof Seats !== 'undefined' && Seats.kids && Seats.kids()) Seats.guard(go); else go();
  },
  /* browser: after a setup page, offer the copied link */
  bar() {
    if ($('#adPaste') || IS_TV) return;
    const el = document.createElement('div'); el.id = 'adPaste'; el.setAttribute('role', 'status');
    el.innerHTML = '<div><b>Finished setting up an addon?</b><small>Copy its link on the setup page, then install it here.</small></div><div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="adPasteGo">Install copied link</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="adPasteNo">Not now</button></div>';
    document.body.appendChild(el);
    const done = () => el.remove();
    $('#adPasteNo').onclick = done;
    $('#adPasteGo').onclick = async () => {
      let t = '';
      try { t = await navigator.clipboard.readText(); } catch (e) { t = ''; }
      done();
      if (this.pick(t)) { this.ask(t); return; }
      // no clipboard access (or nothing copied yet): the addon manager's link box, ready for a paste
      if ($('#addons').hidden) $('#openAddons').click();
      setTimeout(() => { const f = $('#addonUrl'); if (f) f.focus(); }, 120);
      toast(t ? 'The copied text is not an addon link. Paste the manifest link here.' : 'Paste the addon link here.', 'info', 5000);
    };
    setTimeout(() => { if (el.isConnected) done(); }, 60000);
  },
  init() {
    window.MKInstall = (u) => this.ask(u);
    // #install=<link> (the Android app opens MKCinema this way from a stremio:// Install button)
    const fromHash = () => {
      const m = location.hash.match(/[#&]install=([^&]+)/); if (!m) return;
      let u = ''; try { u = decodeURIComponent(m[1]); } catch (e) { u = m[1]; }
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => this.ask(u), document.body.classList.contains('intro-on') ? 2500 : 300);
    };
    fromHash(); addEventListener('hashchange', fromHash);
    // a setup page opened from MKCinema: remember it, and offer the copied link on return
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
      if (/\/configure\b/i.test(a.getAttribute('href') || '') && a.target === '_blank') this.away = Date.now();
    }, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !this.away || Date.now() - this.away > 30 * 60e3) return;
      this.away = 0; setTimeout(() => this.bar(), 400);
    });
  },
};
AddonLink.init();

/* ---------------- 2.11.0 Side menu (optional) and a simpler Appearance ----------------
   The main menu can sit on top (as before) or down the left side, the layout TV apps use. Desktop and TV get a
   side rail: wide screens keep it open with labels, narrower screens and TVs show icons and open it with the
   names when the pointer or the remote reaches it. Phones get a menu button that slides a drawer in from the left.
   The choice is per device (a phone and a TV can differ), offered once on opening and kept in Settings › Appearance.
   Appearance itself is cut down to the menu choice, one colour wheel and the text and poster options. */
const SideNav = {
  side() { return Store.raw.get('navMode', 'top') === 'side'; },
  set(mode, { quiet = false } = {}) {
    Store.raw.set('navMode', mode); Store.raw.set('navAsked', true);
    this.apply();
    if (!quiet) toast(mode === 'side' ? 'Side menu on. Change it any time in Settings › Appearance' : 'Top menu on. Change it any time in Settings › Appearance', 'ok', 3200, 'navmode');
  },
  apply() {
    const de = document.documentElement, on = this.side();
    de.classList.toggle('nav-side', on);
    // a desktop wide enough keeps the rail open; narrower screens and TVs open it when it is reached
    de.classList.toggle('side-mini', on && (IS_TV || innerWidth < 1200));
    if (typeof DockFit !== 'undefined') DockFit.run();
    if (!on) this.close();
    if (IS_TV) Nav.settle();
  },
  lastContent: null,
  toRail(from, fast) { this.lastContent = from; const t = $('#tabs .tab.on') || $('#tabs .tab'); if (t) Nav.focus(t, fast); },
  /* 2.67.1 tv-playback: TV, a page picked in the side menu: the remote goes to that page's first item once it is drawn
     (the menu stayed open over the page until Right was pressed) */
  enter() {
    if (!IS_TV || !this.side()) return;
    const t0 = Date.now(), app = $('#app');
    const tryIt = () => {
      const a = document.activeElement;
      if (!a || !a.closest('.dock-wrap') || Nav.root() !== app) return;   // the remote moved on, or a panel opened
      const list = Nav.items(app).filter((x) => !x.closest('.dock-wrap')); Nav.rects.clear();
      const el = list.length ? Nav.start(app, list) : null;
      if (el && !el.closest('.dock-wrap')) { this.lastContent = null; Nav.focus(el, true); return; }
      if (Date.now() - t0 < 5000) setTimeout(tryIt, 150);
    };
    setTimeout(tryIt, 80);
  },
  /* ---- phone drawer ---- */
  items() {
    const tabs = $$('#tabs .tab').filter((t) => getComputedStyle(t).display !== 'none' || !IS_TV).map((t) => ({ view: t.dataset.view, icon: (t.querySelector('[data-lucide]') || {}).dataset ? t.querySelector('[data-lucide]').dataset.lucide : 'circle', label: ((t.querySelector('.lbl') || t).textContent || t.title).trim() }));
    const tools = [['openPalette', 'search', 'Search'], ['openAddons', 'puzzle', 'Addons'], ['openAccount', 'circle-user-round', 'Account'], ['openParty', 'users', 'Watch party'], ['openSettings', 'settings-2', 'Settings']].filter(([id]) => $(`#${id}`));
    return { tabs, tools };
  },
  open() {
    let d = $('#sideDrawer');
    if (!d) {
      d = document.createElement('div'); d.id = 'sideDrawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Menu');
      document.body.appendChild(d);
    }
    const { tabs, tools } = this.items(), cur = ($('#tabs .tab.on') || {}).dataset ? $('#tabs .tab.on').dataset.view : 'home';
    d.innerHTML = `<div class="sd-scrim" data-sdclose></div><nav class="sd-panel" aria-label="Menu">
      <div class="sd-top"><span class="sd-brand"><svg class="mk" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="55" fill="#050505" stroke="url(#mkRing)" stroke-width="3"/><use href="#mkLetters" fill="url(#mkPlat)" transform="translate(60 60) scale(.8)"/></svg><span class="sd-word">MK<em>Cinema</em></span></span><button type="button" class="ibtn" data-nav data-sdclose aria-label="Close menu"><i data-lucide="x"></i></button></div>
      <div class="sd-list">${tabs.map((t) => `<button type="button" data-nav data-sdview="${esc(t.view)}" class="${t.view === cur ? 'on' : ''}"><i data-lucide="${esc(t.icon)}"></i><span>${esc(t.label)}</span></button>`).join('')}</div>
      <div class="sd-list sd-tools">${tools.map(([id, ic, l]) => `<button type="button" data-nav data-sdtool="${id}"><i data-lucide="${ic}"></i><span>${l}</span></button>`).join('')}</div></nav>`;
    icons();
    $$('[data-sdclose]', d).forEach((x) => x.addEventListener('click', () => this.close()));
    $$('[data-sdview]', d).forEach((x) => x.addEventListener('click', () => { this.close(); go(x.dataset.sdview); }));
    $$('[data-sdtool]', d).forEach((x) => x.addEventListener('click', () => { this.close(); const t = $(`#${x.dataset.sdtool}`); if (t) t.click(); }));
    d.hidden = false; requestAnimationFrame(() => d.classList.add('open'));
    document.body.classList.add('sd-open');
  },
  close() {
    const d = $('#sideDrawer'); if (!d || d.hidden) return false;
    d.classList.remove('open'); document.body.classList.remove('sd-open');
    setTimeout(() => { if (!d.classList.contains('open')) d.hidden = true; }, 260);
    return true;
  },
  /* ---- the one-time question ---- */
  ask() {
    if (Store.raw.get('navAsked', false)) return;
    const fresh = !Store.get('toured', false); this.fresh = fresh;
    const busy = () => (fresh && !Store.get('toured', false) && n < 120) || document.body.classList.contains('intro-on') || !$('#tour').hidden || document.body.classList.contains('layer-open') || !$('#player').hidden || $$('.x8-layer:not([hidden]), .layer-ov:not([hidden])').length;
    let n = 0;
    const wait = () => { if (Store.raw.get('navAsked', false)) return; if (busy() && n++ < 240) { setTimeout(wait, 1000); return; } if (!busy()) this.chooser(); };
    setTimeout(wait, 2500);
  },
  chooser() {
    X8.layer('navPick', { label: 'Menu', icon: 'panel-left', eyebrow: this.fresh ? 'Menu' : 'New' });
    X8.backHook.navPick = () => { Store.raw.set('navAsked', true); return false; };
    const b = X8.body('navPick'), cur = this.side() ? 'side' : 'top';
    b.innerHTML = `<h3 class="x8-h">Top menu or side menu?</h3><p class="x8-p">${this.fresh ? 'MKCinema can show its menu across the top or down the left side, the way most TV apps do.' : 'MKCinema can now put its menu down the left side, the way most TV apps do.'} Pick the one you like. You can switch any time in Settings › Appearance.</p>
      <div class="nav-opts" role="radiogroup" aria-label="Menu position">${this.optHTML(cur)}</div>`;
    this.bindOpts(b, true);
    X8.open('navPick'); icons();
    if (IS_TV) { const c = $('.nav-opt.on', b); if (c) Nav.focus(c, true); }
  },
  optHTML(cur) {
    const pic = (m) => `<span class="no-pic ${m}"><i class="no-bar"></i><i class="no-hero"></i><i class="no-row"></i><i class="no-row"></i></span>`;
    return [['top', 'Top menu', 'The menu runs across the top. The current layout.'], ['side', 'Side menu', IS_TV ? 'Icons down the left. Press Left to open it with names.' : TOUCH_UI && innerWidth <= 760 ? 'A menu button slides the sections in from the left.' : 'Sections listed down the left, like a TV app.']]
      .map(([id, t, d]) => `<button type="button" class="nav-opt ${id === cur ? 'on' : ''}" role="radio" aria-checked="${id === cur}" data-nav data-navmode="${id}">${pic(id)}<b>${t}</b><small>${d}</small></button>`).join('');
  },
  bindOpts(root, closeAfter) {
    $$('[data-navmode]', root).forEach((x) => x.addEventListener('click', () => {
      $$('[data-navmode]', root).forEach((y) => { const on = y === x; y.classList.toggle('on', on); y.setAttribute('aria-checked', on); });
      if (closeAfter) X8.close('navPick');
      this.set(x.dataset.navmode, { quiet: !closeAfter });
      if (!closeAfter && IS_TV) { const n = $(`[data-navmode="${x.dataset.navmode}"]`, root); if (n) Nav.focus(n, true); }
    }));
  },
  init() {
    // side menu button for phones (hidden in top mode and on bigger screens)
    const dock = $('.dock');
    if (dock && !$('#sideBtn')) dock.insertAdjacentHTML('afterbegin', '<button type="button" class="ibtn" id="sideBtn" data-nav aria-label="Menu" title="Menu"><i data-lucide="menu"></i></button>');
    const sb = $('#sideBtn'); if (sb) sb.onclick = () => this.open();
    // DockFit works out the top bar's rows; the side rail has nothing to fit
    if (typeof DockFit !== 'undefined') { const run = DockFit.run.bind(DockFit); DockFit.run = function () { if (SideNav.side() && innerWidth > 760) { ['dk1', 'dk2', 'dk3', 'dkw'].forEach((c) => document.body.classList.remove(c)); document.body.style.removeProperty('--dock-h'); return; } return run(); }; }
    // TV: Left from the first thing on a row (or the banner's Play) opens the rail; Right from the rail returns
    const mv = Nav.move.bind(Nav);
    Nav.move = function (dir, fast) {
      const a = document.activeElement, side = IS_TV && SideNav.side() && Nav.root().id === 'app' && a && a !== document.body;
      if (side && dir === 'left' && !a.closest('.dock-wrap')) {
        if (a.id === 'heroPlay' || (a.matches('.rail>.card, .rail>.net-tile, .rail>.uni-card') && !Nav.step(a, 'left'))) { SideNav.toRail(a, fast); return; }
        const r = mv(dir, fast); if (document.activeElement === a) SideNav.toRail(a, fast); return r;
      }
      if (side && dir === 'right' && a.closest('.dock-wrap')) { const b = SideNav.lastContent; if (b && b.isConnected && !b.closest('[hidden]')) { Nav.focus(b, fast); return; } }
      return mv(dir, fast);
    };
    const b0 = back; back = function () { if (SideNav.close()) return; return b0.apply(this, arguments); };
    addEventListener('resize', () => { if (this.side()) document.documentElement.classList.toggle('side-mini', IS_TV || innerWidth < 1200); });
    // TV: a remote leaving the open rail to the right closes it at once
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    const tabs = $('#tabs'); if (tabs) tabs.addEventListener('click', (e) => { if (e.target.closest('.tab')) this.enter(); });
    this.apply(); icons();
    this.ask();
  },
};
SideNav.init();

/* ---------------- Colour wheel: one hue for the whole app ----------------
   The wheel drives the same token recolouring the built-in looks use (Atelier), so contrast, focus rings and the TV
   light-on-dark rules hold for every colour. "Classic black" returns to Noir. */
const Wheel = {
  STEP: 15,
  hue() { const a = CFG.atelier || {}; return CFG.look === 'atelier' && typeof a.hue === 'number' ? a.hue : null; },
  html() {
    const h = this.hue(), noir = !CFG.look || CFG.look === 'noir';
    return `<div class="cw-wrap"><div class="cw" id="cwRing" role="slider" tabindex="0" data-nav aria-label="Colour" aria-valuemin="0" aria-valuemax="359" aria-valuenow="${h == null ? 0 : h}" aria-valuetext="${h == null ? 'Classic black' : `Hue ${h}`}" style="--h:${h == null ? 0 : h}">
        <span class="cw-knob"${h == null ? ' hidden' : ''}></span><span class="cw-mid"><b>MK</b><small>${h == null ? (noir ? 'Classic black' : 'Built-in look') : 'Your colour'}</small></span></div>
      <div class="cw-side"><b>Colour</b><small>${IS_TV ? 'Select the wheel, then press Left and Right to turn it.' : 'Tap or drag around the wheel. The whole app follows, and it syncs to your account.'}</small>
        <button class="btn btn-ghost btn-sm ${noir ? 'on' : ''}" type="button" data-nav id="cwNoir"><i data-lucide="circle"></i>Classic black</button></div></div>`;
  },
  preview(h) {
    const a = { ...Atelier.get(), hue: ((Math.round(h) % 360) + 360) % 360 };
    let st = $('#atelier'); if (!st) { st = document.createElement('style'); st.id = 'atelier'; document.head.appendChild(st); }
    st.textContent = Atelier.css(a); document.documentElement.setAttribute('data-look', 'atelier');
    const r = $('#cwRing'); if (r) { r.style.setProperty('--h', a.hue); r.setAttribute('aria-valuenow', a.hue); r.setAttribute('aria-valuetext', `Hue ${a.hue}`); const k = $('.cw-knob', r); if (k) k.hidden = false; const s = $('.cw-mid small', r); if (s) s.textContent = 'Your colour'; }
    const nb = $('#cwNoir'); if (nb) nb.classList.remove('on');
    return a;
  },
  commit(a) { Atelier.apply(a); },
  bind() {
    const r = $('#cwRing'); if (!r) return;
    const at = (e) => { const b = r.getBoundingClientRect(), x = e.clientX - (b.left + b.width / 2), y = e.clientY - (b.top + b.height / 2); return (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360; };
    let drag = false, last = null, raf = 0;
    r.addEventListener('pointerdown', (e) => { drag = true; r.setPointerCapture(e.pointerId); last = this.preview(at(e)); });
    r.addEventListener('pointermove', (e) => { if (!drag) return; const h = at(e); cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { last = this.preview(h); }); });
    const end = () => { if (!drag) return; drag = false; cancelAnimationFrame(raf); if (last) this.commit(last); };
    r.addEventListener('pointerup', end); r.addEventListener('pointercancel', end);
    let t = 0;
    r.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: IS_TV ? 0 : -1, ArrowUp: IS_TV ? 0 : 1 }[e.key];
      if (!d) return; e.preventDefault(); e.stopPropagation();
      const cur = this.hue(); const base = $('#cwRing').style.getPropertyValue('--h'); const h = (cur == null && !last ? 0 : +base) + d * this.STEP;
      last = this.preview(h); clearTimeout(t); t = setTimeout(() => this.commit(last), 450);
    });
    $('#cwNoir').onclick = () => { setCfg('look', 'noir'); renderSettingsBody(); if (IS_TV) { const n = $('#cwNoir'); if (n) Nav.focus(n, true); } };
  },
};
/* Appearance, simplified: menu, colour, then text and posters. The four look cards, the Atelier builder and
   the colour-code import are gone from the page; a look already chosen keeps working. */
(() => {
  const p = Atelier.params.bind(Atelier);
  Atelier.params = function (a) { if (a && typeof a.hue === 'number') return { hd: a.hue, sd: 0.36, lift: 0.034, sl: 0.2, ha: a.hue, sa: 0.42 }; return p(a); };
  const sec = secById('appearance'); if (!sec) return;
  sec.intro = 'Pick where the menu sits and one colour for the whole app. All of it stays dark and quiet so nothing competes with the posters.';
  const rows = sec.rows;
  sec.rows = () => {
    const r = rows().filter((d) => !(d.html && (d.html === lookHTML || (typeof d.html === 'function' && String(d.html()).includes('id="atelierBox"')))));
    return [
      { group: 'Menu' },
      { html: () => `<div class="nav-opts set-navopts" role="radiogroup" aria-label="Menu position">${SideNav.optHTML(SideNav.side() ? 'side' : 'top')}</div>` },
      { group: 'Colour' },
      { html: () => Wheel.html() },
      { group: 'Text' },
      ...r,
    ];
  };
  const bind = sec.bind;
  sec.bind = () => { if (bind) bind(); Wheel.bind(); const box = $('#setBody .set-navopts'); if (box) SideNav.bindOpts(box, false); };
})();

/* ---------------- 2.11.1 TV: no surprise keyboards, no focus jumping in Settings ----------------
   Reported on Reddit (Android TV): "the focus jumping around and also the constant keyboard popups".
   1. Every text box on TV stays closed until you press OK on it (TvType.guard, the 2.9.5 Addon Directory fix,
      now on every input): moving the remote past an API key field no longer opens the keyboard.
   2. Settings has two columns. The remote now stays in the column it is in: Up and Down never spill from the
      options into the section list, Left from the options goes to the section you are in, and Right from the
      section list goes into its options (not to the close button). */
(() => {
  if (!IS_TV || typeof TvType === 'undefined') return;
  const TEXTY = /^(text|search|password|url|email|number|tel|)$/i;
  const texty = (el) => el && ((el.tagName === 'INPUT' && TEXTY.test(el.getAttribute('type') || '')) || el.tagName === 'TEXTAREA') && !el.disabled;
  // guard before the element takes focus (Nav.focus), and as a backstop for anything focused another way
  const f = Nav.focus.bind(Nav);
  Nav.focus = function (el, fast) { if (texty(el)) TvType.guard(el); return f(el, fast); };
  document.addEventListener('focusin', (e) => { if (texty(e.target) && !e.target._tvType) { TvType.guard(e.target); } }, true);

  const mv = Nav.move.bind(Nav);
  const items = (box) => $$('[data-nav], button, input, select, textarea, [tabindex]', box).filter((x) => !x.disabled && !x.closest('[hidden]') && x.offsetParent !== null && x.getAttribute('tabindex') !== '-1');
  Nav.move = function (dir, fast) {
    const root = Nav.root(), a = document.activeElement;
    if (!root || root.id !== 'settings' || !a || a === document.body) return mv(dir, fast);
    const nav = $('#setNav'), body = $('#setBody'); if (!nav || !body) return mv(dir, fast);
    const inNav = nav.contains(a), inBody = body.contains(a);
    if (!inNav && !inBody) return mv(dir, fast);
    if (inNav && dir === 'right') { const m = Nav.mem.get(body); const t = m && m.isConnected && body.contains(m) ? m : items(body)[0]; if (t) { Nav.focus(t, fast); return; } }
    if (inBody && dir === 'left') {
      const r = mv(dir, fast); const now = document.activeElement;
      if (now !== a && body.contains(now)) return r;   // a choice to the left inside the same option row
      Nav.mem.set(body, a); const on = $('#setNav .on') || items(nav)[0]; if (on) Nav.focus(on, fast); return;
    }
    if (dir === 'up' || dir === 'down') {
      const pane = inNav ? nav : body, r = mv(dir, fast), now = document.activeElement;
      if (now !== a && !pane.contains(now)) {
        // spilled into the other column (or the close button): stay in this column instead
        Nav.focus(a, true);
        if (inBody) { const sc = a.closest('.set-body, .layer-ov') || body; sc.scrollBy({ top: dir === 'down' ? 200 : -200, behavior: 'smooth' }); }
        return;
      }
      if (inBody) Nav.mem.set(body, now);
      return r;
    }
    return mv(dir, fast);
  };
})();

/* ---------------- 2.13.1 TV remote: side menu lane, Settings lanes ----------------
   Reported on Reddit (Android TV, side menu): "when you scroll past Calendar focus moves right, over to the catalog"
   and, in Settings › Plugins & themes, Down never reached the Add buttons.
   1. In the side menu, Up and Down walk the menu in order, from Search down to Settings at the bottom, and stop there.
   2. In the walkthrough, Up and Down scroll a step that is taller than the screen.
   3. In Settings, Up and Down walk the column the focus is in row by row, so a button on the far right of the options
      is found from a tab on the left and no row is skipped. Back closes Settings, as before. */
(() => {
  if (!IS_TV) return;
  let lane = null;
  const it = Nav.items.bind(Nav);
  Nav.items = function (root) { const l = it(root); return lane ? l.filter((x) => lane.contains(x)) : l; };
  const within = (box, fn) => { lane = box; try { return fn(); } finally { lane = null; } };
  const mv = Nav.move.bind(Nav);
  Nav.move = function (dir, fast) {
    const a = document.activeElement, root = Nav.root();
    if (!a || a === document.body || !root || (dir !== 'up' && dir !== 'down')) return mv(dir, fast);
    // 1. side menu
    const rail = root.id === 'app' && SideNav.side() && a.closest('.dock-wrap');
    if (rail) {
      const list = Nav.items(root).filter((x) => rail.contains(x)), top = (x) => (Nav.rects.get(x) || x.getBoundingClientRect()).top;
      list.sort((p, q) => top(p) - top(q)); Nav.rects.clear();
      const i = list.indexOf(a); if (i < 0) return mv(dir, fast);
      const n = list[i + (dir === 'down' ? 1 : -1)]; if (n) Nav.focus(n, fast);
      return;
    }
    // 2. walkthrough: a long step (the comparison table) scrolls with Up and Down when nothing to focus lies that way
    if (root.id === 'tour') {
      const tb = $('#tourBody');
      if (dir === 'up' && tb && tb.scrollTop > 0 && a.closest('.tour-nav') && !tb.querySelector('[data-nav], button, a[href], input')) { tb.scrollBy({ top: -220, behavior: fast ? 'auto' : 'smooth' }); return; }
      const r = mv(dir, fast);
      if (document.activeElement === a && tb && tb.scrollHeight > tb.clientHeight + 4) tb.scrollBy({ top: dir === 'down' ? 220 : -220, behavior: fast ? 'auto' : 'smooth' });
      return r;
    }
    // 3. Settings columns: walk the column row by row (the nearest row that way, then the control in it closest
    //    across), so a small control at the end of a row, such as Text color under a wide slider, is never skipped
    if (root.id === 'settings') {
      const nav = $('#setNav'), body = $('#setBody'), pane = nav && nav.contains(a) ? nav : body && body.contains(a) ? body : null;
      if (!pane) return mv(dir, fast);
      const A = a.getBoundingClientRect(), ay = A.top + A.height / 2, ax = A.left + A.width / 2, down = dir === 'down';
      const cand = []; let near = Infinity;
      for (const el of within(pane, () => Nav.items(root))) {
        if (el === a || el.contains(a) || a.contains(el)) continue;
        const dt = el.closest('details'); if (dt && !dt.open && !el.closest('summary')) continue;   // inside a closed licence
        const r = Nav.rects.get(el) || el.getBoundingClientRect(), dy = down ? r.top + r.height / 2 - ay : ay - (r.top + r.height / 2);
        const gap = down ? r.top - A.bottom : A.top - r.bottom;
        if (dy <= 4 || gap < -A.height / 2) continue;
        cand.push([el, r, gap]); if (gap < near) near = gap;
      }
      Nav.rects.clear();
      const row = cand.filter((c) => c[2] <= near + 16);
      let best = null, bd = Infinity;
      for (const [el, r] of row) { const d = Math.abs(r.left + r.width / 2 - ax); if (d < bd) { bd = d; best = el; } }
      if (best) { if (pane === body) Nav.mem.set(body, best); Nav.focus(best, fast); return; }
      if (pane === body) { const sc = a.closest('.set-body, .layer-ov') || body; sc.scrollBy({ top: down ? 200 : -200, behavior: 'smooth' }); }
      return;
    }
    return mv(dir, fast);
  };
})();

/* ---------------- 2.12.0 Anime skipping for every addon ----------------
   Skip.load already asks AniSkip when the episode id is a Kitsu or MAL id (anime addons). Most people watch anime
   through Cinemeta-style IMDb ids (tt…:season:episode), so those never got skip times. Now an animated series with
   an IMDb id is looked up in the ARM mapping service (arm.haglund.dev: IMDb → MyAnimeList, per season), split
   seasons ("Part 2") are followed with Jikan's episode counts, and AniSkip answers as before.
   Also new: "Skip ending" when an ending is followed by more episode, and both segments marked on the seek bar. */
const AniSkip = {
  async arm(imdb) {
    const all = Store.get('armMap', {}); if (all[imdb] && Date.now() - all[imdb].t < 14 * 864e5) return all[imdb].v;
    const r = await fetch(`https://arm.haglund.dev/api/v2/imdb?id=${encodeURIComponent(imdb)}`); if (!r.ok) throw new Error(`ARM ${r.status}`);
    const v = (await r.json() || []).filter((e) => e && e.myanimelist).map((e) => ({ mal: e.myanimelist, media: e.media, s: e['thetvdb-season'] != null ? e['thetvdb-season'] : e['themoviedb-season'] }));
    all[imdb] = { t: Date.now(), v }; const keys = Object.keys(all); if (keys.length > 300) delete all[keys[0]];
    Store.set('armMap', all); return v;
  },
  async eps(mal) {
    const all = Store.get('malEps', {}); if (all[mal] != null) return all[mal];
    let n = 0;
    try { const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query: `query{Media(idMal:${Number(mal)},type:ANIME){episodes}}` }) }); n = (((await r.json()).data || {}).Media || {}).episodes || 0; } catch (e) { /* try Jikan */ }
    if (!n) try { const r = await fetch(`https://api.jikan.moe/v4/anime/${mal}`); if (r.ok) n = ((await r.json()).data || {}).episodes || 0; } catch (e) { /* unknown */ }
    if (n) { all[mal] = n; Store.set('malEps', all); } return n;
  },
  /* the MAL entry and episode number that AniSkip knows this IMDb episode by */
  async find(imdb, season, ep) {
    const list = (await this.arm(imdb)).filter((e) => e.s === season && (!e.media || e.media === 'TV' || e.media === 'ONA')).sort((a, b) => a.mal - b.mal);
    for (let i = 0; i < list.length; i++) {
      if (i === list.length - 1) return { mal: list[i].mal, ep };
      const n = await this.eps(list[i].mal); if (!n || ep <= n) return { mal: list[i].mal, ep };
      ep -= n;   // a split season: this episode is in the next part
    }
    return null;
  },
  animeish(meta) { const g = (meta.genres || meta.genre || []).map((x) => String(x).toLowerCase()); return g.some((x) => /anim/.test(x)); },
  marks() {
    const trk = $('#seek .trk'); if (!trk) return; $$('.sk-mark', trk).forEach((x) => x.remove());
    const m = Skip.m, d = video.duration; if (!m || !d || !isFinite(d)) return;
    const seg = (a, b, cls) => { if (a == null || b == null || b <= a) return; const l = Math.max(0, a / d * 100), w = Math.min(100 - l, (b - a) / d * 100); trk.insertAdjacentHTML('beforeend', `<span class="sk-mark ${cls}" style="left:${l}%;width:${w}%"></span>`); };
    if (m.intro) seg(m.intro[0], m.intro[1], 'op');
    if (m.ed) seg(m.ed[0], m.ed[1], 'ed'); else if (m.credits) seg(m.credits, d, 'ed');
  },
  init() {
    const load = Skip.load.bind(Skip);
    Skip.load = async function (ctx) {
      await load(ctx);
      const token = Skip.token;
      try {
        if (!ctx || !ctx.video || !ctx.meta || ctx.meta.type !== 'series' || (Skip.m && Skip.m.src === 'AniSkip')) return;
        const ids = Trakt.ids(ctx) || {}, imdb = String(ids.id || ''), season = Number(ids.season), ep = Number(ids.episode);
        if (!/^tt\d+$/.test(imdb) || !season || !ep || !(AniSkip.animeish(ctx.meta) || /^kitsu:/.test(String(ctx.meta.id)))) return;
        const hit = await AniSkip.find(imdb, season, ep); if (!hit || token !== Skip.token) return;
        const r = await fetch(`https://api.aniskip.com/v2/skip-times/${hit.mal}/${hit.ep}?types[]=op&types[]=ed&episodeLength=0`); const j = await r.json();
        if (token !== Skip.token) return;
        const op = (j.results || []).find((x) => x.skipType === 'op'), ed = (j.results || []).find((x) => x.skipType === 'ed');
        if (op || ed) Skip.m = { intro: op ? [op.interval.startTime, op.interval.endTime] : Skip.m && Skip.m.intro, credits: ed ? ed.interval.startTime : null, ed: ed ? [ed.interval.startTime, ed.interval.endTime] : null, src: 'AniSkip' };
      } catch (e) { /* ARM, Jikan or AniSkip unreachable: keep what we have */ }
      AniSkip.marks();
    };
    // Kitsu/MAL episodes: keep the ending's end too, so "Skip ending" can work for them as well
    const tick = Skip.tick.bind(Skip);
    Skip.tick = function (t) {
      const m = this.m, d = video.duration;
      const ed = m && (m.ed || null);
      if (CFG.skipIntro && ed && !P.locked && d && t >= ed[0] && t < ed[1] - 1 && ed[1] < d - 20) {
        const b = $('#skipBtn'); if (!this._edShown) { this._edShown = true; this.shownAt = performance.now(); const s = $('span', b); if (s) s.textContent = 'Skip ending'; b.dataset.seg = 'ed'; b.hidden = false; }
        else if (performance.now() - this.shownAt > 8000) b.hidden = true;
        return;
      }
      if (this._edShown) { this._edShown = false; const b = $('#skipBtn'); const s = $('span', b); if (s) s.textContent = 'Skip intro'; delete b.dataset.seg; b.hidden = true; }
      return tick(t);
    };
    const go = Skip.go.bind(Skip);
    Skip.go = function (auto) { const b = $('#skipBtn'); if (b.dataset.seg === 'ed' && this.m && this.m.ed) { pSeek(this.m.ed[1], { user: false }); b.hidden = true; delete b.dataset.seg; toast('Ending skipped', 'info', 1400); return; } return go(auto); };
    video.addEventListener('durationchange', () => AniSkip.marks());
    video.addEventListener('loadedmetadata', () => setTimeout(() => AniSkip.marks(), 500));
  },
};
AniSkip.init();

/* ---------------- 2.12.0 Plugins and themes ----------------
   A theme is a stylesheet; a plugin is a script that adds a feature. Both come from a gallery that lives in
   MKCinema's own GitHub repo (plugins/registry.json): every entry there was reviewed before it was merged, each file's
   SHA-256 is checked before it runs, and nothing outside that folder is accepted from the gallery. Developers can also
   add their own from a link after a clear warning, because a plugin can read anything the app can (keys included).
   Installed items stay on this device. Add #safe to the address to start once with every plugin off. */
const Plugins = {
  REPO: 'https://raw.githubusercontent.com/itbelikethatbruh/mkcinema/main/plugins/',
  API_VERSION: 1,
  listeners: {},
  list() { return Store.raw.get('plugins', []) || []; },
  save(l) { Store.raw.set('plugins', l); },
  safe: /(^|[#&])safe(&|$)/.test(location.hash.slice(1)),
  async sha(txt) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); },
  /* 2.37.0: the gallery list is signed with MKCinema's Ed25519 key (plugins/sign_registry.py). true = signed by
     MKCinema, false = missing or wrong signature, null = this browser cannot check Ed25519 (checksums still apply). */
  PUBKEY: 'cgAmHEhX8FBhc1zaiuVNM/yGmE3P7fD/A1AvoD/i4z0=',
  async sigOk(buf) {
    const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    let key; try { key = await crypto.subtle.importKey('raw', b64(this.PUBKEY), { name: 'Ed25519' }, false, ['verify']); } catch (e) { return null; }
    try { const r = await fetch(`${this.REPO}registry.json.sig`, { cache: 'no-cache' }); if (!r.ok) return false;
      const sig = b64((await r.text()).trim()); return sig.length === 64 && await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, buf); } catch (e) { return false; }
  },
  async registry() {
    if (this._reg && Date.now() - this._regAt < 10 * 60e3) return this._reg;
    const r = await fetch(`${this.REPO}registry.json`, { cache: 'no-cache' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = await r.arrayBuffer(), ok = await this.sigOk(buf);
    if (ok === false) throw new Error('its signature did not check out');
    this._signed = ok === true;
    const j = JSON.parse(new TextDecoder().decode(buf)); this._reg = (j.items || []).filter((x) => x && x.id && /^[a-z0-9-]{2,40}$/.test(x.id) && (x.kind === 'plugin' || x.kind === 'theme') && /^[a-z0-9-]+\.(js|css)$/.test(x.file || '') && /^[0-9a-f]{64}$/.test(x.sha256 || ''));
    this._regAt = Date.now(); return this._reg;
  },
  async fetchItem(it) {
    const r = await fetch(`${this.REPO}${it.kind === 'theme' ? 'themes' : 'scripts'}/${it.file}`, { cache: 'no-cache' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const code = await r.text(); if ((await this.sha(code)) !== it.sha256) throw new Error('the file does not match the gallery’s checksum');
    return code;
  },
  async install(it, code) {
    const l = this.list().filter((x) => x.id !== it.id);
    l.push({ id: it.id, name: String(it.name || it.id).slice(0, 60), kind: it.kind, author: String(it.author || '').slice(0, 40), desc: String(it.description || '').slice(0, 240), ver: String(it.version || '1'), code, src: it.src || 'gallery', on: true });
    this.save(l);
  },
  /* ---- running them ---- */
  api(id) {
    const key = `plugin:${id}:`;
    return {
      version: this.API_VERSION, app: APP_VERSION, tv: IS_TV, touch: TOUCH_UI,
      toast: (m, kind) => toast(String(m).slice(0, 200), kind === 'err' ? 'err' : kind === 'ok' ? 'ok' : 'info'),
      on: (ev, fn) => { (this.listeners[ev] = this.listeners[ev] || []).push({ id, fn }); },
      get: (k, d) => Store.raw.get(key + k, d), set: (k, v) => Store.raw.set(key + k, v),
      css: (txt) => { let st = $(`#plg-css-${id}`); if (!st) { st = document.createElement('style'); st.id = `plg-css-${id}`; document.head.appendChild(st); } st.textContent = String(txt); },
    };
  },
  emit(ev, data) { (this.listeners[ev] || []).forEach((l) => { try { l.fn(data); } catch (e) { console.warn(`plugin ${l.id}`, e); } }); },
  runOne(p) {
    if (p.kind === 'plugin' && (p.src === 'link' || p.held) && !p.ok) return; // needs the person's OK first
    if (p.kind === 'theme') { let st = $(`#thm-${p.id}`); if (!st) { st = document.createElement('style'); st.id = `thm-${p.id}`; st.dataset.mkTheme = '1'; document.head.appendChild(st); } st.textContent = String(p.code || '').replace(/<\/?style[^>]*>/gi, ''); return; }
    try { new Function('MK', `"use strict";\n${p.code}\n//# sourceURL=mkcinema-plugin-${p.id}.js`)(this.api(p.id)); }
    catch (e) { console.warn(`plugin ${p.id}`, e); toast(`The plugin “${p.name}” stopped with an error and was switched off`, 'err', 4200); this.save(this.list().map((x) => (x.id === p.id ? { ...x, on: false } : x))); }
  },
  stopOne(p) { if (p.kind === 'theme') { const st = $(`#thm-${p.id}`); if (st) st.remove(); } else { Object.keys(this.listeners).forEach((k) => { this.listeners[k] = this.listeners[k].filter((l) => l.id !== p.id); }); const st = $(`#plg-css-${p.id}`); if (st) st.remove(); } },
  /* ---- Settings › Plugins & themes ---- */
  tab: 'gallery',
  pend: null,
  section() {
    return { id: 'plugins', icon: 'blocks', label: 'Plugins & themes', intro: 'Add features and looks made by the community. Everything in the gallery was reviewed before it was listed, and checked again before it runs.', bind: () => this.bind(), rows: () => [{ html: () => this.html() }] };
  },
  html() {
    const l = this.list(), t = this.tab;
    const pd = this.pend, pn = pd && (pd.it || l.find((x) => x.id === pd.re)), th = pn && pn.kind === 'theme';
    const ask = pn ? `<div class="dk-warn plg-ask" role="alertdialog" aria-labelledby="plgAskT"><p id="plgAskT"><b>${th ? 'Add this theme?' : 'This plugin can read your keys'}</b></p><ul>
        ${th ? '<li>A theme changes how MKCinema looks. It is not from the reviewed gallery.</li>' : '<li>It can see everything MKCinema can, including your debrid keys, addon links and account.</li>' + (pn.held ? '<li>It could not be checked against the signed gallery on this device.</li>' : '<li>It is not from the reviewed gallery, so nobody has checked it.</li>')}
        <li>From <b>${esc(pn.author || '')}</b></li></ul>
        <div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="plgYes">${th ? 'Add it' : pd.re ? 'I trust it, turn it on' : 'I trust it, add it'}</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="plgNo">Cancel</button></div></div>` : '';
    const card = (it, inst) => `<div class="plg-card"><span class="plg-ic ${it.kind}"><i data-lucide="${it.kind === 'theme' ? 'palette' : 'puzzle'}"></i></span><div class="plg-txt"><b>${esc(it.name)}</b><small>${esc(it.kind === 'theme' ? 'Theme' : 'Plugin')}${it.author ? ` · ${esc(it.author)}` : ''}${it.src === 'link' ? ` · <span class="plg-warn">unverified, added from a link${it.kind === 'plugin' && !it.ok ? '. Turn it on to review it' : ''}</span>` : ''}${it.held && it.src !== 'link' && !it.ok ? ' · <span class="plg-warn">could not be checked on this device. Turn it on to review it</span>' : ''}</small><p>${esc(it.desc || it.description || '')}</p></div>
      <div class="plg-act">${inst ? `<button class="switch ${it.on ? 'on' : ''}" type="button" data-nav data-plon="${esc(it.id)}" role="switch" aria-checked="${!!it.on}" aria-label="${esc(it.name)} on"></button><button class="btn btn-ghost btn-sm" type="button" data-nav data-plrm="${esc(it.id)}">Remove</button>` : l.some((x) => x.id === it.id) ? '<span class="plg-done"><i data-lucide="check"></i>Added</span>' : `<button class="btn btn-prime btn-sm" type="button" data-nav data-pladd="${esc(it.id)}"><i data-lucide="plus"></i>Add</button>`}</div></div>`;
    return `<div class="segc plg-tabs" role="tablist"><button type="button" data-nav data-pltab="gallery" class="${t === 'gallery' ? 'on' : ''}">Gallery</button><button type="button" data-nav data-pltab="mine" class="${t === 'mine' ? 'on' : ''}">Added (${l.length})</button></div>
      ${t === 'mine' ? ask : ''}
      ${this.safe ? '<p class="tour-note">Safe start: plugins are off until the app is reopened without #safe.</p>' : ''}
      <div class="plg-list" id="plgList">${t === 'mine' ? (l.length ? l.map((p) => card(p, true)).join('') : '<p class="tour-note">Nothing added yet. Pick something from the Gallery.</p>') : '<div class="status-line"><span class="spin"></span>Loading the gallery…</div>'}</div>
      ${t === 'mine' ? `<details class="plg-dev"><summary>For developers: add from a link</summary><p class="tour-note">A plugin can read everything MKCinema can, including your debrid keys and account, and a theme can change and track what the app shows. Only add code from someone you trust. The gallery is safer.</p><div class="inrow"><input class="inp mono" id="plgUrl" placeholder="https://…/my-plugin.js or .css" autocomplete="off" spellcheck="false"><button class="btn btn-ghost btn-sm" type="button" data-nav id="plgUrlGo">Add</button></div></details>` : ''}`;
  },
  askFocus() { const y = $('#plgYes'); if (!y) return; try { y.scrollIntoView({ block: 'nearest' }); } catch (e) { /* old engines */ } if (IS_TV) Nav.focus(y, true); },
  async paintGallery() {
    const box = $('#plgList'); if (!box || this.tab !== 'gallery') return;
    try {
      const reg = await this.registry(); if (this.tab !== 'gallery' || !$('#plgList')) return;
      const l = this.list();
      box.innerHTML = (this._signed ? '' : '<p class="tour-note">This device cannot check the gallery’s signature, so each file is only checked against its checksum.</p>') + (reg.length ? reg.map((it) => `<div class="plg-card"><span class="plg-ic ${it.kind}"><i data-lucide="${it.kind === 'theme' ? 'palette' : 'puzzle'}"></i></span><div class="plg-txt"><b>${esc(it.name)}</b><small>${it.kind === 'theme' ? 'Theme' : 'Plugin'}${it.author ? ` · ${esc(it.author)}` : ''}</small><p>${esc(it.description || '')}</p></div><div class="plg-act">${l.some((x) => x.id === it.id) ? '<span class="plg-done"><i data-lucide="check"></i>Added</span>' : `<button class="btn btn-prime btn-sm" type="button" data-nav data-pladd="${esc(it.id)}"><i data-lucide="plus"></i>Add</button>`}</div></div>`).join('') : '<p class="tour-note">The gallery is empty right now.</p>');
      icons(); this.bindList();
    } catch (e) { box.innerHTML = `<p class="tour-note">The gallery did not load (${esc(e.message)}). Check your connection and try again.</p>`; }
  },
  bindList() {
    $$('#plgList [data-pladd]').forEach((b) => b.addEventListener('click', async () => {
      const it = (this._reg || []).find((x) => x.id === b.dataset.pladd); if (!it) return;
      b.disabled = true; b.innerHTML = '<span class="spin"></span>Adding';
      try { const code = await this.fetchItem(it); await this.install(it, code); this.runOne(this.list().find((x) => x.id === it.id)); toast(`${it.name} added`, 'ok'); }
      catch (e) { toast(`Could not add ${it.name}: ${e.message}`, 'err', 4200); }
      this.repaint();
    }));
    $$('#plgList [data-plon]').forEach((b) => b.addEventListener('click', () => {
      const l = this.list(), p = l.find((x) => x.id === b.dataset.plon); if (!p) return;
      if (!p.on && p.kind === 'plugin' && (p.src === 'link' || p.held) && !p.ok) { this.pend = { re: p.id }; this.repaint(); this.askFocus(); return; }
      p.on = !p.on; this.save(l); b.classList.toggle('on', p.on); b.setAttribute('aria-checked', p.on);
      if (p.on) this.runOne(p); else this.stopOne(p);
      if (p.kind === 'plugin') toast(p.on ? `${p.name} is on` : `${p.name} is off. Reopen the app to unload it fully`, 'info', 2600);
    }));
    $$('#plgList [data-plrm]').forEach((b) => b.addEventListener('click', () => confirmTwice(b, () => {
      const p = this.list().find((x) => x.id === b.dataset.plrm); if (p) this.stopOne(p);
      this.save(this.list().filter((x) => x.id !== b.dataset.plrm)); this.repaint();
    })));
  },
  repaint() { if (!$('#settings').hidden) renderSettingsBody(); },
  bind() {
    $$('#setBody [data-pltab]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.pltab; this.repaint(); const n = $(`#setBody [data-pltab="${this.tab}"]`); if (n && IS_TV) Nav.focus(n, true); }));
    this.bindList(); if (this.tab === 'gallery') this.paintGallery();
    const u = $('#plgUrl'), go = $('#plgUrlGo');
    if (u) u.addEventListener('keydown', (e) => e.stopPropagation());
    /* 2.37.0: fetch first, then ask plainly ("This plugin can read your keys"); nothing runs until the person says yes */
    if (go) go.onclick = async () => {
      const url = u.value.trim();
      if (!/^https:\/\/[^\s]+\.(js|css)(\?[^\s]*)?$/i.test(url)) { toast('Use an https link ending in .js or .css', 'err'); return; }
      go.disabled = true;
      try { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); const code = await r.text(); if (code.length > 300000) throw new Error('too big');
        const kind = /\.css(\?|$)/i.test(url) ? 'theme' : 'plugin', id = `link-${(await this.sha(url)).slice(0, 10)}`, name = decodeURIComponent(url.split('/').pop().split('?')[0]).replace(/\.(js|css)$/i, '');
        this.pend = { it: { id, name, kind, author: new URL(url).host, description: url, version: '1', src: 'link' }, code }; this.repaint(); this.askFocus();
      } catch (e) { toast(`Could not add it: ${e.message}`, 'err', 4200); go.disabled = false; }
    };
    const yes = $('#plgYes'), no = $('#plgNo');
    if (no) no.onclick = () => { this.pend = null; this.repaint(); };
    if (yes) yes.onclick = async () => {
      const pd = this.pend; this.pend = null; if (!pd) return;
      if (pd.re) { const l = this.list(), p = l.find((x) => x.id === pd.re); if (p) { p.ok = true; p.on = true; this.save(l); this.runOne(p); toast(`${p.name} is on`, 'info', 2600); } }
      else { await this.install(pd.it, pd.code); const l = this.list(), p = l.find((x) => x.id === pd.it.id); if (p) { p.ok = true; this.save(l); this.runOne(p); } toast(`${pd.it.name} added`, 'ok'); }
      this.repaint();
    };
  },
  init() {
    // events plugins can listen to: view, detail, play, close
    const g = go; go = function (view) { const r = g.apply(this, arguments); Plugins.emit('view', { view }); return r; };
    const od = openDetail; openDetail = function (seed) { const r = od.apply(this, arguments); Plugins.emit('detail', { id: seed && seed.id, type: seed && seed.type, name: seed && seed.name }); return r; };
    const ps = playStream; playStream = function (ctx) { const r = ps.apply(this, arguments); try { Plugins.emit('play', { id: ctx && ctx.meta && ctx.meta.id, type: ctx && ctx.meta && ctx.meta.type, name: ctx && ctx.meta && ctx.meta.name, season: ctx && ctx.video && ctx.video.season, episode: ctx && ctx.video && ctx.video.episode, episodeName: ctx && ctx.video && (ctx.video.name || ctx.video.title) }); } catch (e) { /* none */ } return r; };
    const cp = closePlayer; closePlayer = function () { const r = cp.apply(this, arguments); Plugins.emit('close', {}); return r; };
    video.addEventListener('pause', () => this.emit('pause', { t: video.currentTime, d: video.duration }));
    video.addEventListener('playing', () => this.emit('resume', { t: video.currentTime, d: video.duration }));
    SECTIONS.push(this.section());
    const grp = SET_GROUPS.find(([n]) => /look/i.test(n)); if (grp) grp[1].push('plugins');
    SET_BLURB.plugins = 'Community features and themes';
    const held = this.list().filter((p) => p.on && p.kind === 'plugin' && p.src === 'link' && !p.ok);
    if (held.length) { this.save(this.list().map((p) => (held.some((h) => h.id === p.id) ? { ...p, on: false } : p))); setTimeout(() => toast(`${held.length === 1 ? 'A plugin you added from a link is' : 'Plugins you added from links are'} off until you turn ${held.length === 1 ? 'it' : 'them'} on again in Settings › Plugins & themes`, 'info', 6000), 2500); }
    if (!this.safe) { const on = this.list().filter((p) => p.on), chk = on.filter((p) => p.kind === 'plugin' && p.src !== 'link'); on.filter((p) => !chk.includes(p)).forEach((p) => this.runOne(p)); if (chk.length) this.verifyStored(chk); }
  },
  /* 2.46.6: a stored gallery plugin runs only while the signed gallery list vouches for its exact code. The list is
     kept with its signature, so the check also works offline. A plugin that cannot be checked (changed, removed from
     the gallery, or a browser without Ed25519) is switched off until the person turns it on and confirms. */
  async verifySig(buf, sigB64) {
    const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    let key; try { key = await crypto.subtle.importKey('raw', b64(this.PUBKEY), { name: 'Ed25519' }, false, ['verify']); } catch (e) { return null; }
    try { const sig = b64(String(sigB64 || '')); return sig.length === 64 && await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, buf); } catch (e) { return false; }
  },
  async signedReg() {
    let txt = null, sig = null;
    try { const [a, b] = await Promise.all([fetch(`${this.REPO}registry.json`, { cache: 'no-cache' }), fetch(`${this.REPO}registry.json.sig`, { cache: 'no-cache' })]); if (a.ok && b.ok) { txt = await a.text(); sig = (await b.text()).trim(); } } catch (e) { /* offline */ }
    const fresh = txt != null;
    if (!fresh) { const c = Store.raw.get('plgReg', null); if (c && typeof c.txt === 'string' && typeof c.sig === 'string') { txt = c.txt; sig = c.sig; } }
    if (txt == null) return { ok: false, why: 'offline' };
    const v = await this.verifySig(new TextEncoder().encode(txt), sig);
    if (v !== true) return { ok: false, why: v === null ? 'nosig' : 'bad' };
    let items; try { items = (JSON.parse(txt).items || []).filter((x) => x && typeof x === 'object'); } catch (e) { return { ok: false, why: 'bad' }; }
    if (fresh) Store.raw.set('plgReg', { txt, sig });
    return { ok: true, fresh, items };
  },
  async verifyStored(list) {
    let r; try { r = await this.signedReg(); } catch (e) { r = { ok: false, why: 'bad' }; }
    if (!r.ok && r.why === 'offline') return; // nothing to check against yet: they wait for the next launch
    const held = [];
    for (const p of list) {
      const it = r.ok ? r.items.find((x) => x.id === p.id && x.kind === p.kind && /^[0-9a-f]{64}$/.test(x.sha256 || '') && /^[a-z0-9-]+\.(js|css)$/.test(x.file || '')) : null;
      let good = false; try { good = !!it && (await this.sha(String(p.code || ''))) === it.sha256; } catch (e) { good = false; }
      if (!good && it && r.fresh) { try { const code = await this.fetchItem(it); this.save(this.list().map((x) => (x.id === p.id ? { ...x, code, ver: String(it.version || x.ver || '1') } : x))); p.code = code; good = true; } catch (e) { good = false; } }
      if (good) this.runOne(p); else held.push(p.id);
    }
    if (!held.length) return;
    this.save(this.list().map((p) => (held.includes(p.id) ? { ...p, on: false, ok: false, held: true } : p)));
    toast(`${held.length === 1 ? 'A plugin' : `${held.length} plugins`} could not be checked against the gallery and ${held.length === 1 ? 'is' : 'are'} off. Turn ${held.length === 1 ? 'it' : 'them'} on in Settings › Plugins & themes to review`, 'info', 6500);
    if (!$('#settings').hidden) this.repaint();
  },
};
Plugins.init();

/* 2.13.0: the Android and TV app (1.3.0+) has the same torrent engine, through MKAndroid.p2pStart/p2pStop. On a TV
   stick it keeps one torrent at a time and stops when free storage runs low. */
const androidP2P = (() => { try { const a = window.MKAndroid; if (!a || !a.p2pStart || !(a.p2pAvailable ? a.p2pAvailable() : true)) return null;
  const call = (r) => { if (!r || /^error/i.test(r)) throw new Error(String(r || 'the engine did not start').replace(/^error:\s*/i, '')); return r; };
  const A = () => window.MKAndroid || a; // the bridge object can be replaced after load (newer apps): always use the current one
  return { platform: IS_TV ? 'tv' : 'android', version: a.version ? a.version() : '', p2p: { start: async () => call(A().p2pStart()), stop: async () => A().p2pStop() }, fresh: true }; } catch (e) { return null; } })();
/* ---------------- 2.12.0 Desktop app extras: torrents on this computer, Discord status ----------------
   Only in the Windows app (window.MKDesktop, set by the app before the page loads). Both are off until turned on.
   Torrents: the app runs a small torrent engine on this PC that only downloads (never uploads or seeds), serves
   the file to the player on 127.0.0.1, and deletes everything when it stops or the app closes.
   Discord: "Watching <title>" on your Discord profile while something plays, through Discord's local pipe. */
const Desktop = {
  d: window.MKDesktop || androidP2P,
  here() { const p = this.d && this.d.platform; return p === 'mac' ? 'this Mac' : p === 'windows' || p === 'linux' ? 'this computer' : p === 'tv' ? 'this TV' : 'this device'; },
  base: null,
  p2pOn() { return !!(this.d && this.d.p2p && Store.raw.get('p2pOn', false)); },
  discordOn() { return !!(this.d && this.d.setPresence && Store.raw.get('discordOn', false)); },
  async engine() {
    if (this.base && !this.d.fresh) return this.base;
    this.base = await this.d.p2p.start(); if (!this.base) throw new Error('the engine did not start');
    return this.base;
  },
  async stop() { this.base = null; try { await this.d.p2p.stop(); } catch (e) { /* already stopped */ } },
  urlFor(base, s) {
    const tr = (s.sources || []).filter((x) => /^tracker:/i.test(x)).map((x) => `&tr=${encodeURIComponent(x.replace(/^tracker:/i, ''))}`).slice(0, 20).join('');
    return `${base}/stream?ih=${String(s.infoHash).toLowerCase()}&idx=${s.fileIdx != null ? Number(s.fileIdx) : -1}${tr}`;
  },
  /* ---- Discord ---- */
  presence(paused) {
    if (!this.discordOn() || $('#player').hidden || !P.ctx || !P.ctx.meta) return;
    const m = P.ctx.meta, v = P.ctx.video, d = video.duration, t = video.currentTime || 0, now = Date.now();
    const poster = /^https:\/\//.test(m.poster || '') ? m.poster : '';
    this.d.setPresence({
      title: m.name || 'Something good', sub: v ? `S${v.season} · E${v.episode}${v.name || v.title ? ` · ${v.name || v.title}` : ''}` : (paused ? 'Paused' : yearOf(m) || ''),
      start: paused ? 0 : Math.round(now - t * 1000), end: !paused && d && isFinite(d) ? Math.round(now + (d - t) * 1000) : 0, paused: !!paused, image: poster,
    }).catch((e) => { try { MKLog.add('warn', `discord: ${MKLog.str(e)}`); } catch (x) { /* no log */ } });
  },
  clearPresence() { if (this.d && this.d.setPresence) this.d.setPresence(null).catch(() => {}); },
  /* ---- Settings › Desktop app ---- */
  confirming: false,
  section() {
    return { id: 'desktop', icon: this.d.platform === 'windows' ? 'monitor' : 'magnet', label: this.d.platform === 'windows' ? 'Desktop app' : 'Torrents', intro: this.d.platform === 'windows' ? 'Extras that only the desktop app can do. Both are off until you turn them on.' : 'Play torrent sources without a debrid service. Off until you turn it on.', bind: () => this.bind(), rows: () => [{ html: () => this.html() }] };
  },
  html() {
    const on = this.p2pOn();
    const warn = this.confirming ? `<div class="dk-warn"><p><b>Before you turn this on</b></p><ul>
        <li>Torrent sources play straight from other people's devices. They can see your IP address, the same as any torrent app.</li>
        <li>MKCinema only downloads. It never uploads or seeds, and it deletes what it downloaded when you turn this off or close the app.${/^(windows|mac|linux)$/.test(this.d.platform) ? '' : ' It keeps one torrent at a time and stops if storage runs low.'}</li>
        <li>You are responsible for what you play. Many places have laws about torrents; a debrid service or a VPN keeps your IP private.</li></ul>
        <div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="dkYes">I understand, turn it on</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="dkNo">Cancel</button></div></div>` : '';
    return `<div class="set-row"><div><b>Play torrent sources on ${this.here()}</b><small>${on ? 'On. Sources marked “Torrent” play in MKCinema. Your IP is visible to peers while they play.' : 'Off. Torrent sources need a debrid service or another player.'}</small></div><div class="set-ctl"><button class="switch ${on ? 'on' : ''}" type="button" data-nav id="dkP2p" role="switch" aria-checked="${on}" aria-label="Play torrent sources on ${this.here()}"></button></div></div>${warn}
      ${this.d.setPresence ? `<div class="set-row"><div><b>Show what I'm watching on Discord</b><small>“Watching” and the title on your Discord profile while something plays. Needs the Discord app open on this computer.</small></div><div class="set-ctl"><button class="switch ${this.discordOn() ? 'on' : ''}" type="button" data-nav id="dkDiscord" role="switch" aria-checked="${this.discordOn()}" aria-label="Show what I'm watching on Discord"></button></div></div>` : ''}
      <p class="tour-note">MKCinema for ${esc({ windows: 'Windows', mac: 'Mac', linux: 'Linux', tv: 'TV', android: 'Android' }[this.d.platform] || 'desktop')} ${esc(this.d.version || '')}</p>`;
  },
  repaint() { if (!$('#settings').hidden) renderSettingsBody(); },
  // the open title's sources were ranked before the switch changed: rank them again
  rerank() { try { if (D && D.streams) { D.streams.forEach((s) => { if (s.infoHash && !s.url) s._tel = Telemetry.parse(s); }); if (!$('#detail').hidden) renderStreamsPanel(); } } catch (e) { /* no title open */ } },
  bind() {
    const sw = $('#dkP2p');
    if (sw) sw.onclick = async () => {
      if (this.p2pOn()) { Store.raw.set('p2pOn', false); this.rerank(); await this.stop(); toast('Torrent playback is off. Downloaded pieces were deleted.', 'info'); this.repaint(); return; }
      this.confirming = true; this.repaint(); const y = $('#dkYes'); if (y && IS_TV) Nav.focus(y, true);
    };
    const yes = $('#dkYes'), no = $('#dkNo');
    if (yes) yes.onclick = () => { Store.raw.set('p2pOn', true); this.rerank(); this.confirming = false; toast('Torrent sources now play here', 'ok'); this.repaint(); };
    if (no) no.onclick = () => { this.confirming = false; this.repaint(); };
    const dc = $('#dkDiscord');
    if (dc) dc.onclick = () => { const v = !this.discordOn(); Store.raw.set('discordOn', v); dc.classList.toggle('on', v); dc.setAttribute('aria-checked', v); if (v) this.presence(video.paused); else this.clearPresence(); };
  },
  init() {
    if (!this.d) return;
    if (this.d.p2p) {
      // a torrent with no debrid key is playable here: rank it after debrid and web links, but no longer "unplayable"
      const parse = Telemetry.parse.bind(Telemetry);
      Telemetry.parse = function (s) {
        const t = parse(s);
        if (s.infoHash && !s.url && !t.debrid && Desktop.p2pOn()) { t.webReady = true; t.source = `Torrent · ${({ windows: 'this PC', mac: 'this Mac', linux: 'this computer' }[Desktop.d.platform] || 'this device')}`; t.score += 1900; }
        if (s._p2p) t.source = `Torrent · ${({ windows: 'this PC', mac: 'this Mac', linux: 'this computer' }[Desktop.d.platform] || 'this device')}`;
        return t;
      };
      const play = playStream;
      playStream = async function (ctx, stream, opts) {
        if (stream && stream.infoHash && !stream.url && !(stream._tel && stream._tel.debrid) && Desktop.p2pOn()) {
          if ($('#player').hidden && !extPlayer()) openLayer('player');
          if (ctx && ctx.meta && !$('#player').hidden) { P.ctx = ctx; Loader.show(ctx.meta); }
          try {
            const base = await Desktop.engine();
            stream._infoHash = stream.infoHash; delete stream.infoHash; stream._p2p = true;
            stream.url = Desktop.urlFor(base, { ...stream, infoHash: stream._infoHash }); stream._tel = Telemetry.parse(stream);
            toast('Finding peers for this torrent. The first start can take up to a minute.', 'info', 5000, 'p2p');
          } catch (e) { Loader.hide(); toast(`Torrent engine: ${e.message || e}`, 'err', 6000); }
        }
        return play(ctx, stream, opts);
      };
    }
    if (this.d.setPresence) {
      ['playing', 'seeked'].forEach((ev) => video.addEventListener(ev, () => { if (!video.paused) this.presence(false); }));
      video.addEventListener('pause', () => this.presence(true));
      const cp = closePlayer; closePlayer = function () { const r = cp.apply(this, arguments); if (Desktop.discordOn()) Desktop.clearPresence(); return r; };
    }
    SECTIONS.push(this.section());
    const grp = SET_GROUPS.find(([n]) => /watching/i.test(n)); if (grp) grp[1].push('desktop');
    SET_BLURB.desktop = this.d.platform === 'windows' ? 'Torrents on this PC, Discord status' : 'Torrents without debrid';
  },
};
Desktop.init();

/* ---------------- 2.13.1 Phone Back button ----------------
   Android's Back (the Android app, Chrome and the installed web app) walks the page's history. The app used to keep a
   single history entry, so Back left MKCinema at once. Now each tap keeps a few spare entries, and Back spends one:
   it closes whatever is open first (the same back() the Esc key uses), then returns to the previous screen, and at the
   start screen it asks for a second press before leaving. TVs keep their own Back handling and are left alone. */
const BackNav = {
  DEPTH: 5, views: [], popping: false, skip: false, armT: 0,
  idx() { const s = history.state; return s && typeof s.mkb === 'number' ? s.mkb : 0; },
  // one entry per tap: Chrome lets Back land on entries the page added while the user was interacting with it
  topUp() { const i = this.idx(); if (i >= this.DEPTH) return; try { history.pushState({ mkb: i + 1 }, '', location.href); } catch (e) { /* sandboxed */ } },
  rootView() { const t = $('#tabs .tab'); return (t && t.dataset.view) || 'home'; },
  // did back() close or change anything? Watch the DOM while it runs.
  closeTop() {
    const mo = new MutationObserver(() => {}); mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'open'] });
    try { back(); } catch (e) { /* keep going */ }
    const changed = mo.takeRecords().length > 0; mo.disconnect();
    return changed;
  },
  prevScreen() {
    while (this.views.length) {
      const v = this.views.pop(); if (v.view === S.view) continue;
      this.popping = true; try { go(v.view, v.opts); } finally { this.popping = false; }
      const y = v.y; if (y > 0) setTimeout(() => scrollTo({ top: y, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' }), 80);
      return true;
    }
    if (S.view !== this.rootView()) { this.popping = true; try { go(this.rootView()); } finally { this.popping = false; } return true; }
    return false;
  },
  onPop() {
    if (this.skip) { this.skip = false; return; }
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (this.closeTop() || this.prevScreen()) return;
    // the start screen with nothing open: step down to the first entry, so the next Back leaves the app
    const i = this.idx(); if (i > 0) { this.skip = true; history.go(-i); }
    toast('Press Back again to exit', 'info', 2200, 'backexit');
    clearTimeout(this.armT);
    // the Android app's Back only sees history, so put one entry back if they stay
    if (/MKCinemaAndroid/.test(navigator.userAgent)) this.armT = setTimeout(() => { if (!this.idx()) this.topUp(); }, 2400);
  },
  init() {
    if (IS_TV) return;
    // views remember where they came from; the start screen starts a fresh trail
    const g0 = go;
    go = function (view, opts) {
      if (!BackNav.popping && S.view && S.view !== view) {
        if (view === BackNav.rootView()) BackNav.views = [];
        else { BackNav.views.push({ view: S.view, opts: S.view === 'movie' || S.view === 'series' ? S.discoverOpts || {} : {}, y: scrollY }); if (BackNav.views.length > 30) BackNav.views.shift(); }
      }
      if (view === 'movie' || view === 'series') S.discoverOpts = opts || {};
      return g0.apply(this, arguments);
    };
    // other code resets the address with replaceState(null, …); keep the entry's place in the trail
    const rs = history.replaceState.bind(history);
    history.replaceState = function (state, t, u) { const i = BackNav.idx(); if (state == null && i) state = { mkb: i }; return rs(state, t, u); };
    const tap = () => { clearTimeout(BackNav.armT); BackNav.topUp(); };
    addEventListener('pointerup', tap, true); addEventListener('keydown', tap, true);
    addEventListener('popstate', () => this.onPop());
  },
};
BackNav.init();

