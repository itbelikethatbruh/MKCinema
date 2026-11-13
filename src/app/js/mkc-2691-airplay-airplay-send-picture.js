/* 2.69.1 airplay: send the picture from iPhone and iPad, not only the sound */
(() => {
  if (typeof TvCast === 'undefined' || IS_TV) return;
  const ua = navigator.userAgent || '';
  const wk = PLATFORM === 'ios' || (/Safari\//.test(ua) && /Apple/.test(navigator.vendor || '') && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|Android/.test(ua));
  if (!wk || !window.WebKitPlaybackTargetAvailabilityEvent) return;
  // AirPlay hands the TV the file's web link. An MKV is converted on this device while it plays (Safari can't open
  // MKV), and that converted picture can't travel, so only the sound reached the TV. AirPlay-ready means a plain
  // web link to a file Safari opens by itself: MP4, MOV, M4V or HLS.
  video.setAttribute('x-webkit-airplay', 'allow');
  const fileOf = (s) => `${s.url || ''} ${(s.behaviorHints || {}).filename || ''}`;
  const ready = (s) => !!s && !s._local && !s.ytId && /^https?:/i.test(s.url || '') && /^https?:/i.test(handoffUrl(s) || '')
    && !/\.(mkv|avi|webm|wmv|flv)(\?|#|\s|$)/i.test(fileOf(s)) && !(s._tel && (s._tel.mkv || s._tel.isTrailer || s._tel.kind === 'p2p' || s._tel.kind === 'ext'));
  const live = (s) => ready(s) && !(window.MkEngine && MkEngine.active) && !(typeof Rescue !== 'undefined' && Rescue.active && P.remux) && !/^blob:/i.test(video.currentSrc || video.src || '');
  const pick = () => { video.disableRemotePlayback = false; try { video.webkitShowPlaybackTargetPicker(); return true; } catch (e) { return false; } };
  const AirFix = {
    ready, live,
    alt(s) {
      const vis = typeof visibleStreams === 'function' ? visibleStreams((P.ctx && P.ctx.streams) || []) : ((P.ctx && P.ctx.streams) || []);
      const list = vis.filter((x) => x !== s && ready(x) && !(x._tel && (x._tel.webReady === false || x._tel.is3d || x._tel.cached === false)));
      return list.sort((a, b) => ((b._tel && b._tel.score) || 0) - ((a._tel && a._tel.score) || 0))[0] || null;
    },
    // after switching sources a tap is needed again: Safari opens the TV list only from a tap
    afterSwitch(stream) {
      const go = () => {
        if (P.stream !== stream || $('#player').hidden) return;
        const el = X8.layer('tvcLayer', { label: 'Send to TV', icon: 'cast', eyebrow: 'Send to TV' });
        X8.body('tvcLayer').innerHTML = `<h3 class="x8-h">Ready for AirPlay</h3><p class="sub">This source can show the picture on your TV.</p>
          <div class="actions"><button class="btn btn-prime" type="button" id="airGo"><i data-lucide="cast"></i>Choose your TV</button></div>`;
        $('#airGo', el).addEventListener('click', () => { X8.close('tvcLayer'); if (!pick()) TvCast.help('fail'); }, { once: true });
        icons(); X8.open('tvcLayer');
      };
      if (video.readyState >= 1 && P.stream === stream) go(); else video.addEventListener('loadedmetadata', go, { once: true });
    },
    explain(s) {
      const el = X8.layer('tvcLayer', { label: 'Send to TV', icon: 'cast', eyebrow: 'Send to TV' });
      const alt = this.alt(s), url = handoffUrl(s || {});
      const apps = url ? playersHere().filter((p) => /infuse|vlc/i.test(p.id) && !p.m3u) : [];
      X8.body('tvcLayer').innerHTML = `<h3 class="x8-h">Send to TV with AirPlay</h3>
        <p class="sub">AirPlay can only show the picture from MP4 or HLS sources. This source is an MKV file that MKCinema converts on this device, so only the sound would reach your TV.</p>
        ${alt ? '<div class="actions"><button class="btn btn-prime" type="button" id="airAlt"><i data-lucide="cast"></i>Switch to an AirPlay-ready source</button></div><p class="tour-note air-src"></p>' : '<p class="sub">None of the sources for this title are AirPlay-ready.</p>'}
        ${apps.length ? `<p class="sub">Infuse plays MKV files and sends them to your TV with AirPlay.</p><div class="actions">${apps.map((p) => playerBtn(p, url, streamTitle(P.ctx), !alt)).join('')}</div>` : ''}`;
      const note = $('.air-src', el);
      if (note && alt) note.textContent = String(alt.name || '').replace(/\s+/g, ' ').trim().slice(0, 60) + ((alt._tel && alt._tel.res) ? ` · ${alt._tel.res}` : '');
      const b = $('#airAlt', el);
      if (b) b.addEventListener('click', () => { X8.close('tvcLayer'); const at = pNow(); playStream(P.ctx, alt, { startAt: isFinite(at) ? at : 0 }); this.afterSwitch(alt); }, { once: true });
      $$('[data-m3u]', el).forEach((x) => x.addEventListener('click', () => downloadM3U(x.dataset.m3u, x.dataset.title)));
      $$('[data-ext], [data-m3u]', el).forEach((x) => x.addEventListener('click', () => X8.close('tvcLayer')));
      icons(); X8.open('tvcLayer');
    },
  };
  window.MkAirFix = AirFix;
  const orig = TvCast.start;
  TvCast.start = function () {
    if (!this.airplay()) return orig.apply(this, arguments);
    const s = P.stream;
    if (!s || s._local || s.ytId) return orig.apply(this, arguments);
    $('#optMenu').hidden = true;
    if (live(s)) { if (!pick()) this.help('fail'); return; }
    AirFix.explain(s);
  };
  // Safari reports no AirPlay targets while an MKV is being converted, which hid the button: keep it, and explain on tap
  video.addEventListener('webkitplaybacktargetavailabilitychanged', () => setTimeout(() => { const b = $('#pTvCast'); if (b) b.hidden = false; }, 0));
})();
