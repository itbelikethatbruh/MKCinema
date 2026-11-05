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
      browser: IS_TV ? 'This screen is already the big one.' : /; wv\)|MKCinema/i.test(navigator.userAgent) ? 'The MKCinema app can’t cast by itself. Open the source in VLC and tap VLC’s cast icon, or open mkcinema.pages.dev in Chrome to cast from there.' : 'Casting works in Chrome (computer or Android) to a Chromecast or Google TV, and in Safari on a Mac to AirPlay. This browser offers neither.',
    }[why] || '';
    X8.body('tvcLayer').innerHTML = `<h3 class="x8-h">Send to TV</h3><p class="sub">${lead}</p>
      <ul class="x8-list"><li><b>Chromecast and Google TV</b><span>Chrome on a computer or an Android phone</span></li><li><b>AirPlay</b><span>Safari on a Mac</span></li><li><b>Any other TV</b><span>Install MKCinema on it: Android TV, Fire TV and LG webOS have apps</span></li></ul>
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
