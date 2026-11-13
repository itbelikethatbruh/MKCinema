/* 2.69.3 tv button: connect to a TV from the main page, and subtitles that reach the TV */
(() => {
  if (typeof TvCast === 'undefined' || IS_TV) return;
  const ua = navigator.userAgent || '';
  const WK = !!window.WebKitPlaybackTargetAvailabilityEvent && (PLATFORM === 'ios' || (/Safari\//.test(ua) && /Apple/.test(navigator.vendor || '') && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|Android/.test(ua)));
  const KEY = 'mkc:tvmode';
  const get = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const set = (on) => { try { on ? sessionStorage.setItem(KEY, '1') : sessionStorage.removeItem(KEY); } catch (e) { /* private mode */ } paint(); };
  const castOn = () => { try { return !!(window.cast && cast.framework && cast.framework.CastContext.getInstance().getCurrentSession()); } catch (e) { return false; } };
  const btn = document.createElement('button');
  btn.className = 'ibtn'; btn.id = 'homeCast'; btn.type = 'button'; btn.setAttribute('data-nav', '');
  btn.title = 'Watch on your TV'; btn.setAttribute('aria-label', 'Watch on your TV');
  btn.innerHTML = '<i data-lucide="cast"></i>';
  const anchor = $('#openSettings'); if (!anchor) return; anchor.before(btn); icons();
  function paint() { const on = WK ? get() : castOn(); btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }

  const layer = (title, html) => {
    const el = X8.layer('tvcLayer', { label: 'Send to TV', icon: 'cast', eyebrow: 'Send to TV' });
    X8.body('tvcLayer').innerHTML = `<h3 class="x8-h">${title}</h3>${html}`; icons(); X8.open('tvcLayer'); return el;
  };
  const mirrorSteps = `<ol class="tvb-steps"><li>Open Control Center (swipe down from the top-right corner).</li><li>Tap Screen Mirroring and pick your TV.</li><li>Play the film here. The TV shows it with your subtitles.</li></ol>`;

  // Safari (iPhone, iPad, Mac): AirPlay can't connect before a film plays, so TV mode makes the next film go to the TV
  function safariCard() {
    const on = get();
    const el = layer('Watch on your TV', `<p class="sub">${on ? 'TV mode is on. Play any film and MKCinema gets it ready for your TV, then asks which TV to use.' : 'Turn on TV mode, then play any film. MKCinema gets it ready for your TV and asks which TV to use.'}</p>
      <div class="actions"><button class="btn btn-prime" type="button" id="tvbMode"><i data-lucide="${on ? 'x' : 'cast'}"></i>${on ? 'Turn off TV mode' : 'Turn on TV mode'}</button></div>
      <h4 class="x8-h" style="margin-top:18px">With your subtitles</h4><p class="sub">AirPlay only carries subtitles that are inside the video file. To see MKCinema’s subtitles on the TV, mirror your screen instead:</p>${mirrorSteps}`);
    $('#tvbMode', el).addEventListener('click', () => {
      const next = !get(); set(next); X8.close('tvcLayer');
      toast(next ? 'TV mode on. Play a film to send it to your TV.' : 'TV mode off', next ? 'ok' : 'info', 3500, 'tvmode');
    }, { once: true });
  }
  // Chrome: connect to a Chromecast or Google TV now; the next film plays there
  async function chromeConnect() {
    if (castOn()) {
      const el = layer('Connected to your TV', '<p class="sub">Play any film and it goes to your TV.</p><div class="actions"><button class="btn btn-ghost" type="button" id="tvbOff"><i data-lucide="x"></i>Disconnect</button></div>');
      $('#tvbOff', el).addEventListener('click', () => { try { cast.framework.CastContext.getInstance().endCurrentSession(true); } catch (e) { /* gone */ } X8.close('tvcLayer'); setTimeout(paint, 300); }, { once: true });
      return;
    }
    try {
      await TvCast.load();
      const C = cast.framework.CastContext.getInstance();
      C.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, paint);
      await C.requestSession();
      paint(); toast('Connected. Play a film to send it to your TV.', 'ok', 3500, 'tvmode');
    } catch (e) { if (!/cancel/i.test(String(e && (e.code || e.message || e)))) TvCast.help('fail', e); }
  }
  btn.addEventListener('click', () => { if (WK) safariCard(); else if (TvCast.chrome()) chromeConnect(); else TvCast.help('browser'); });
  paint();

  // once a film has started: send it on by itself (Chrome), or get it ready and ask for the TV (Safari TV mode)
  let lastSent = null;
  video.addEventListener('loadedmetadata', () => {
    const s = P.stream; if (!s || s === lastSent || $('#player').hidden || s._local || s.ytId) return;
    if (WK) {
      if (!get() || s._air) return;
      lastSent = s;
      const A = window.MkAirFix; if (!A) return;
      if (A.live(s) && !P.hls) { A.afterSwitch(s); return; }
      setTimeout(() => { if (P.stream === s) TvCast.start(); }, 300);
      return;
    }
    if (castOn() && !TvCast.resumeCtx) { lastSent = s; TvCast.start(); }
  });

  // subtitles over AirPlay: switch to the file's own subtitles in the same language, or explain mirroring
  if (WK) video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', () => {
    if (!video.webkitCurrentPlaybackTargetIsWireless || !(P.curSub >= 0)) return;
    const cur = P.subs[P.curSub]; if (!cur || cur.kind === 'native' || cur.kind === 'hls') return;
    const l2 = String(cur.lang || '').slice(0, 2).toLowerCase();
    const i = P.subs.findIndex((x) => (x.kind === 'native' || x.kind === 'hls') && l2 && String(x.lang || '').slice(0, 2).toLowerCase() === l2);
    if (i >= 0) { selectSub(i, { auto: true }); toast('Switched to the subtitles inside the file so they show on your TV', 'ok', 4500, 'subs'); return; }
    layer('Subtitles on your TV', `<p class="sub">AirPlay only carries subtitles that are inside the video file, and this one has none in your language. They still show on this screen. To see them on the TV, mirror your screen instead:</p>${mirrorSteps}`);
  });
})();
