
/* ---------------- 2.27.2 Samsung TVs (TizenBrew) ----------------
   Samsung TVs open MKCinema through TizenBrew (the tizen/ module in the repo). Their remote sends Back as key 10009 and
   the media keys with Tizen key codes, which the browser doesn't name. Back is handled with the webOS Back (handleKey,
   ExitAsk); this block maps the media keys while the player is open. Keyboards that name them (MediaPlayPause...) work too. */
const SamsungKeys = {
  on: /Tizen/.test(navigator.userAgent),
  codes: { 10252: 'playpause', 415: 'play', 19: 'pause', 413: 'stop', 417: 'ff', 412: 'rew' },
  names: { MediaPlayPause: 'playpause', MediaPlay: 'play', MediaPause: 'pause', MediaStop: 'stop', MediaFastForward: 'ff', MediaRewind: 'rew' },
  act(e) {
    const a = this.names[e.key] || (this.on ? this.codes[e.keyCode] : '');
    if (!a || $('#player').hidden) return;
    e.preventDefault(); e.stopImmediatePropagation();
    switch (a) {
      case 'playpause': togglePlay(); break;
      case 'play': if (video.paused) togglePlay(); break;
      case 'pause': if (!video.paused) togglePlay(); break;
      case 'stop': back(); return;
      default: seekBy(a === 'ff' ? step() : -step()); seekFx(a === 'ff' ? 1 : -1);
    }
    wakeHud();
  },
};
document.addEventListener('keydown', (e) => SamsungKeys.act(e), true);
