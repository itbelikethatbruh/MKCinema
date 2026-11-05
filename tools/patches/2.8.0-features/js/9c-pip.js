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
