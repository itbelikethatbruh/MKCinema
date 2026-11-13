/* 2.69.4 android airplay: the Android app sends films to an Apple TV with AirPlay.
   2.69.8 (app 1.12.1): the same list shows every TV the app finds on the Wi-Fi: Apple TVs and AirPlay TVs, Chromecast and
   Google TV, and smart TVs with DLNA (Samsung, LG, Sony and more). An older app says to update instead of the generic card. */
(() => {
  if (typeof TvCast === 'undefined' || IS_TV) return;
  const A = window.MKAndroid;
  const ua = navigator.userAgent || '';
  if (A && typeof A.apScan !== 'function' && /MKCinemaAndroid\//.test(ua)) {
    // an app from before 1.12: it can't look for TVs, so say how to get one that can
    const help = TvCast.help;
    TvCast.help = function (why) {
      if (why !== 'browser') return help.apply(this, arguments);
      const el = X8.layer('tvcLayer', { label: 'Send to TV', icon: 'cast', eyebrow: 'Send to TV' });
      X8.body('tvcLayer').innerHTML = '<h3 class="x8-h">Update the app to send to your TV</h3><p class="sub">The newest MKCinema app for Android finds every TV on your Wi-Fi (Apple TV, Chromecast, Google TV and smart TVs) and sends films to them.</p><div class="actions"><a class="btn btn-prime" href="https://mkcinema.app/download/" target="_blank" rel="noopener"><i data-lucide="download"></i>Get the update</a></div>';
      icons(); X8.open('tvcLayer'); return el;
    };
    return;
  }
  if (!A || typeof A.apScan !== 'function') {
    // Chrome on Android has no AirPlay: point Apple TV owners to the Android app
    if (!/Android/i.test(ua) || /; wv\)|MKCinema/i.test(ua)) return;
    const help = TvCast.help;
    TvCast.help = function () {
      help.apply(this, arguments);
      const body = X8.body('tvcLayer'); if (!body || $('.apa-get', body)) return;
      const p = document.createElement('div'); p.className = 'apa-get';
      p.innerHTML = '<p class="sub" style="margin-top:14px">Got an Apple TV? The MKCinema app for Android sends films to it with AirPlay.</p><div class="actions"><a class="btn btn-ghost" href="https://mkcinema.app/download/" target="_blank" rel="noopener"><i data-lucide="download"></i>Get the Android app</a></div>';
      body.appendChild(p); icons();
    };
    return;
  }

  const AP = { devs: [], scanning: false, scanT: 0, target: null, active: false, bg: false, tv: '', mode: 'player', st: 'idle', lastSent: null };
  const fileOf = (s) => `${s.url || ''} ${(s.behaviorHints || {}).filename || ''}`;
  const local = (u) => /^https?:\/\/(localhost|127\.|10\.0\.2\.2|\[?::1)/i.test(u || '');
  // the TV opens the link itself: a plain web link without extra headers. An Apple TV takes MP4, MOV, M4V or HLS;
  // Chromecast / Google TV and DLNA smart TVs also take MKV and WebM (2.69.8)
  const ready = (s, kind) => {
    if (!s || s._local || s.ytId) return '';
    const u = handoffUrl(s) || '';
    if (!/^https?:/i.test(u) || local(u) || (s.behaviorHints && s.behaviorHints.proxyHeaders)) return '';
    if (s._tel && (s._tel.isTrailer || s._tel.kind === 'p2p' || s._tel.kind === 'ext')) return '';
    const bad = kind === 'cast' || kind === 'dlna' ? 'avi|wmv|flv' : 'mkv|avi|webm|wmv|flv';
    if (new RegExp(`\\.(${bad})(\\?|#|\\s|$)`, 'i').test(fileOf(s)) || new RegExp(`\\.(${bad})(\\?|#|$)`, 'i').test(u)) return '';
    if (bad.startsWith('mkv') && s._tel && s._tel.mkv) return '';
    return u;
  };
  const alt = (s, kind) => {
    const all = (P.ctx && P.ctx.streams) || [];
    const vis = typeof visibleStreams === 'function' ? visibleStreams(all) : all;
    const list = vis.filter((x) => x !== s && ready(x, kind) && !(x._tel && (x._tel.is3d || x._tel.cached === false)));
    return list.sort((a, b) => ((b._tel && b._tel.score) || 0) - ((a._tel && a._tel.score) || 0))[0] || null;
  };
  const card = (title, html) => {
    const el = X8.layer('tvcLayer', { label: 'Send to TV', icon: 'cast', eyebrow: 'Send to TV' });
    X8.body('tvcLayer').innerHTML = `<h3 class="x8-h">${title}</h3>${html}`; icons(); X8.open('tvcLayer'); return el;
  };
  const isOpen = () => { const el = $('#tvcLayer'); return !!el && !el.hidden; };

  /* ---- finding TVs (the app looks with Bonjour for AirPlay and Chromecast, and with UPnP for DLNA) ---- */
  const KIND = { airplay: ['tv', 'AirPlay'], cast: ['cast', 'Chromecast'], dlna: ['monitor', 'Smart TV (DLNA)'] };
  const kindOf = (d) => (d && KIND[d.kind] ? d.kind : 'airplay');
  function scan() {
    AP.scanning = true; clearTimeout(AP.scanT);
    AP.scanT = setTimeout(() => { AP.scanning = false; paintList(); }, 21000);
    try { A.apScan(); } catch (e) { AP.scanning = false; }
  }
  function paintList() {
    const box = $('#apaList'); if (!box) return;
    const devs = AP.devs.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true }));
    const s = P.stream, url = AP.mode === 'player' && s ? handoffUrl(s) : '';
    const vlc = url ? playersHere().filter((p) => /vlc/.test(p.id)) : [];
    box.innerHTML = devs.map((d) => { const k = KIND[kindOf(d)]; return `<button class="apa-dev" type="button" data-nav data-apa="${esc(d.id)}"><i data-lucide="${k[0]}"></i><span><b>${esc(d.name)}</b><small>${d.paired ? 'Paired' : k[1]}</small></span><i data-lucide="chevron-right" class="apa-go"></i></button>`; }).join('')
      + (AP.scanning ? `<div class="apa-wait"><span class="spin"></span>${devs.length ? 'Looking for more TVs…' : 'Looking for TVs on this Wi-Fi…'}</div>`
        : devs.length ? '' : `<p class="sub">No TV found. Make sure it is on and on the same Wi-Fi as this phone. On an Apple TV, AirPlay has to be on in Settings (AirPlay and HomeKit).</p><div class="actions"><button class="btn btn-ghost" type="button" id="apaAgain"><i data-lucide="refresh-cw"></i>Look again</button></div>
          ${vlc.length ? `<p class="sub">VLC can also send this film to a Chromecast from its own cast icon.</p><div class="actions">${vlc.map((p) => playerBtn(p, url, streamTitle(P.ctx), false)).join('')}</div>` : ''}`);
    $$('[data-apa]', box).forEach((b) => b.addEventListener('click', () => pick(AP.devs.find((d) => d.id === b.dataset.apa))));
    const again = $('#apaAgain', box); if (again) again.addEventListener('click', () => { scan(); paintList(); });
    $$('[data-m3u]', box).forEach((x) => x.addEventListener('click', () => downloadM3U(x.dataset.m3u, x.dataset.title)));
    $$('[data-ext], [data-m3u]', box).forEach((x) => x.addEventListener('click', () => X8.close('tvcLayer')));
    icons();
  }
  function picker(mode) {
    AP.mode = mode;
    card(mode === 'home' ? 'Watch on your TV' : 'Send to TV', `<p class="sub">${mode === 'home' ? 'Pick your TV. The next film you play goes to it.' : 'Pick your TV. The film carries on there from this moment.'}</p>
      <div class="apa-list" id="apaList"></div>
      <p class="tour-note">The first time, an AirPlay TV shows a 4-digit code to type here. Subtitles inside the video file can be turned on with the TV remote; subtitles MKCinema adds stay on this phone.</p>`);
    scan(); paintList();
  }
  function pick(d) {
    if (!d) return;
    X8.close('tvcLayer');
    if (AP.mode === 'home') {
      AP.target = d.id; paintHome();
      toast(`Connected. Play a film to send it to ${d.name}.`, 'ok', 3500, 'tvmode');
      return;
    }
    send(d);
  }

  /* ---- sending ---- */
  async function send(d) {
    const s = P.stream;
    if (!s || $('#player').hidden) { TvCast.help('none'); return; }
    if (s._local) { TvCast.help('local'); return; }
    if (s.ytId) { TvCast.help('yt'); return; }
    const kind = kindOf(d);
    let url = ready(s, kind);
    // an MKV from Real-Debrid or TorBox: the service's own converted copy (HLS) plays on the Apple TV
    if (!url && typeof CloudConvert !== 'undefined' && CloudConvert.on() && !s._cloud) {
      let w = null; try { w = CloudConvert.who(s); } catch (e) { w = null; }
      if (w) {
        toast(`Getting a TV-ready version from your ${CloudConvert.label(w.svc)}…`, 'info', 6000, 'airconv');
        let list = [];
        try { list = await Vault.within(CloudConvert.urls(s, w), 45000); } catch (e) { try { MKLog.add('play', `airplay: ${e.message}`); } catch (x) { /* no log */ } }
        if (P.stream !== s || $('#player').hidden) return;
        list = (list || []).filter((u) => /^https:\/\//i.test(u) && !/\.(mkv|webm)(\?|$)/i.test(u));
        list.sort((a, b) => (/\.m3u8(\?|$)|\/hls\b|apple/i.test(b) ? 1 : 0) - (/\.m3u8(\?|$)|\/hls\b|apple/i.test(a) ? 1 : 0));
        url = list[0] || '';
      }
    }
    if (!url) { explain(s, d); return; }
    go(d, url);
  }
  function explain(s, d) {
    const kind = kindOf(d), ap = kind === 'airplay';
    const other = alt(s, kind), url = handoffUrl(s || {});
    const apps = url ? playersHere().filter((p) => /vlc/i.test(p.id) && !p.m3u) : [];
    const el = card(ap ? 'Send to Apple TV' : 'Send to TV', `<p class="sub">${ap ? "Apple TV plays MP4 and HLS sources. This source is an MKV file (or needs this phone to play), so the Apple TV can't open it." : "This source needs this phone to play it, so the TV can't open it."}</p>
      ${other ? `<div class="actions"><button class="btn btn-prime" type="button" id="apaAlt"><i data-lucide="cast"></i>${ap ? 'Send an AirPlay-ready source instead' : 'Send another source instead'}</button></div><p class="tour-note apa-src"></p>` : `<p class="sub">${ap ? 'None of the sources for this title are AirPlay-ready.' : 'None of the sources for this title can go to a TV.'}</p>`}
      ${apps.length ? `<p class="sub">VLC can play this one and cast it to a Chromecast.</p><div class="actions">${apps.map((p) => playerBtn(p, url, streamTitle(P.ctx), !other)).join('')}</div>` : ''}`);
    const note = $('.apa-src', el);
    if (note && other) note.textContent = String(other.name || '').replace(/\s+/g, ' ').trim().slice(0, 60) + ((other._tel && other._tel.res) ? ` · ${other._tel.res}` : '');
    const b = $('#apaAlt', el);
    if (b) b.addEventListener('click', () => { X8.close('tvcLayer'); go(d, ready(other, kind), other); }, { once: true });
    $$('[data-ext], [data-m3u]', el).forEach((x) => x.addEventListener('click', () => X8.close('tvcLayer')));
  }
  function go(d, url, other) {
    const at = pNow();
    const r = String(A.apPlay(JSON.stringify({ id: d.id, url, title: streamTitle(P.ctx), start: isFinite(at) ? Math.max(0, at - 2) : 0 })) || '');
    if (/^error/i.test(r)) { TvCast.help('fail', { message: r.replace(/^error:\s*/i, '') }); return; }
    try { MKLog.add('play', `tv: sending to ${kindOf(d)} ${d.model || 'tv'}`); } catch (e) { /* no log */ }
    AP.active = true; AP.tv = d.name; AP.lastSent = P.stream; AP.st = 'connecting';
    // the bar and its buttons are the Chromecast ones (2.8 TvCast), driven by the Android session instead
    const remote = { currentTime: isFinite(at) ? at : 0, duration: 0, isPaused: false, isMuted: false };
    TvCast.remote = remote;
    TvCast.ctl = {
      playOrPause: () => A.apCtl(remote.isPaused ? 'play' : 'pause', ''),
      seek: () => A.apCtl('seek', String(Math.max(0, remote.currentTime || 0))),
      muteOrUnmute: () => {},
    };
    TvCast.device = d.name; TvCast.title = streamTitle(P.ctx);
    TvCast.resumeCtx = { ctx: P.ctx, stream: P.stream, other: other || null };
    video.pause(); TvCast.bar(true);
    const bar = $('#tvcBar'); if (bar) bar.classList.add('apa');
    toast(`Connecting to ${d.name}…`, 'info', 4000, 'tvc');
    paintHome();
  }

  /* ---- what the Android side reports ---- */
  function askPin(again) {
    const el = card('Enter the code on your TV', `<p class="sub">${again ? 'That code didn’t match. Type the new code your TV shows.' : 'Your TV shows a 4-digit code. Type it here to pair this phone. You only do this once.'}</p>
      <input class="apa-pin" id="apaPin" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="4" pattern="[0-9]*" aria-label="Code on your TV">
      <div class="actions"><button class="btn btn-prime" type="button" id="apaPinGo"><i data-lucide="link"></i>Connect</button><button class="btn btn-ghost" type="button" id="apaPinNo">Cancel</button></div>`);
    const inp = $('#apaPin', el), ok = () => { const v = inp.value.replace(/\D/g, ''); if (v.length !== 4) { inp.focus(); return; } A.apPin(v); X8.close('tvcLayer'); toast(`Connecting to ${AP.tv}…`, 'info', 4000, 'tvc'); };
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); if (inp.value.length === 4) ok(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    $('#apaPinGo', el).addEventListener('click', ok);
    $('#apaPinNo', el).addEventListener('click', () => { A.apPin(''); A.apCtl('stop', ''); X8.close('tvcLayer'); }, { once: true });
    setTimeout(() => inp.focus(), 60);
  }
  window.MKAirPlay = {
    devices(list) { AP.devs = Array.isArray(list) ? list : []; paintList(); },
    scanned() { AP.scanning = false; clearTimeout(AP.scanT); paintList(); },
    state(o) {
      o = o || {}; const st = o.state; AP.st = st;
      if (o.tv) AP.tv = o.tv;
      if (st === 'pin') { askPin(o.msg === 'again'); return; }
      const r = TvCast.remote;
      if (st === 'playing' || st === 'paused') {
        if (isOpen() && $('#apaPin')) X8.close('tvcLayer');
        if (AP.active && r) {
          const first = !r.duration;
          r.currentTime = o.pos || 0; r.duration = o.dur || 0; r.isPaused = st === 'paused'; TvCast.paint();
          if (first) toast(`Playing on ${AP.tv}`, 'ok', 3000, 'tvc');
        }
        if (!AP.active) AP.bg = true;
        paintHome(); return;
      }
      if (st === 'ended' || st === 'error') {
        const was = AP.active; AP.active = false;
        AP.bg = false;
        // the phone picks the film up at the TV's second (after a stand-in source too: the phone kept the original)
        if (was) { TvCast.ended(o.pos || 0); TvCast.remote = null; TvCast.ctl = null; }
        if (st === 'error') TvCast.help('fail', { message: o.msg || '' });
        paintHome();
      }
    },
  };

  /* ---- the 2.8 Send to TV button and Play here ---- */
  TvCast.start = function () {
    $('#optMenu').hidden = true;
    const s = P.stream;
    if (!s) { this.help('none'); return; }
    if (s._local) { this.help('local'); return; }
    if (s.ytId) { this.help('yt'); return; }
    picker('player');
  };
  const stop = TvCast.stop;
  TvCast.stop = function () {
    if (!AP.active) return stop.apply(this, arguments);
    A.apCtl('stop', '');   // 'ended' comes back with the TV's position
  };

  /* ---- 2.69.3 TV button on the main page: pick an Apple TV now, the next film goes there ---- */
  function paintHome() {
    const b = $('#homeCast'); if (!b) return;
    const on = AP.active || AP.bg || !!AP.target; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#homeCast')) return;
    e.stopPropagation(); e.preventDefault();
    if (AP.active || AP.bg) {
      const el = card(`Playing on ${AP.tv}`, '<div class="actions"><button class="btn btn-ghost" type="button" id="apaStop"><i data-lucide="square"></i>Stop on the TV</button></div>');
      $('#apaStop', el).addEventListener('click', () => { A.apCtl('stop', ''); X8.close('tvcLayer'); }, { once: true });
      return;
    }
    if (AP.target) {
      const d = AP.devs.find((x) => x.id === AP.target);
      const el = card('Watch on your TV', `<p class="sub">Films go to ${esc(d ? d.name : 'your TV')} when they start.</p><div class="actions"><button class="btn btn-ghost" type="button" id="apaOff"><i data-lucide="x"></i>Disconnect</button><button class="btn btn-ghost" type="button" id="apaOther"><i data-lucide="tv"></i>Another TV</button></div>`);
      $('#apaOff', el).addEventListener('click', () => { AP.target = null; paintHome(); X8.close('tvcLayer'); }, { once: true });
      $('#apaOther', el).addEventListener('click', () => picker('home'), { once: true });
      return;
    }
    picker('home');
  }, true);
  // once a film has started: send it on by itself when a TV was picked from the main page
  video.addEventListener('loadedmetadata', () => {
    const s = P.stream;
    if (!AP.target || AP.active || !s || s === AP.lastSent || $('#player').hidden || s._local || s.ytId) return;
    const d = AP.devs.find((x) => x.id === AP.target);
    if (!d) { AP.target = null; paintHome(); return; }
    AP.lastSent = s; send(d);
  });

  // after a reload while the TV is still playing (the session lives in the app)
  try { const now = JSON.parse(A.apState() || '{}'); if (now.state && now.state !== 'idle') { AP.tv = now.tv || ''; AP.bg = true; } } catch (e) { /* older app */ }
  paintHome();
})();
