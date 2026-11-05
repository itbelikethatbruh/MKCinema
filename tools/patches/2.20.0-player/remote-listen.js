/* ---------- 2.20.0 Listen on phone: the TV's sound on this phone (and its headphones) ----------
   Live: the TV sends its sound over WebRTC, so nothing is downloaded twice. Fallback: this phone plays the same source
   itself, muted picture-free, and keeps in step with the TV's position. */
const Listen = {
  on: false, pc: null, mode: '', off: 0, rtt: 0, base: null, syncT: 0, hlsP: null, hls: null, el: null, startT: 0,
  audio() {
    if (!this.el) { const a = this.el = document.createElement('audio'); a.id = 'lsnAudio'; a.setAttribute('playsinline', ''); a.preload = 'auto'; document.body.appendChild(a); }
    return this.el;
  },
  paint() {
    const b = $('#lsnBtn'); if (!b) return;
    const m = R.st, playing = !!(m && m.v === 'player'), ls = (m && m.lsn) || {};
    b.hidden = !(playing || this.on);
    b.classList.toggle('on', this.on);
    const live = this.on && this.mode;
    $('#lsnT').textContent = this.on ? (live ? 'Listening on this phone' : 'Connecting the sound…') : 'Listen on this phone';
    $('#lsnS').textContent = this.on ? (live ? (this.mode === 'direct' ? 'Playing the film on this phone, in step with the TV · Tap to stop' : 'Live from your TV · Tap to stop') : 'The TV goes quiet once the sound is here')
      : ls.why === 'native' ? 'Needs the MKCinema player on the TV' : 'Plug in headphones to watch without waking anyone';
  },
  toggle() { if (this.on) this.stop(true); else this.start(); },
  start() {
    if (!R.link) return;
    this.on = true; this.mode = ''; buzz(10);
    // a tap is the user gesture the phone needs before it may play sound later
    const a = this.audio(); a.muted = false; try { a.play().catch(() => {}); } catch (e) { /* nothing to play yet */ }
    this.ping(); R.send({ t: 'lsn', on: true });
    clearTimeout(this.startT); this.startT = setTimeout(() => { if (this.on && !this.mode) { toast('The TV did not answer. Is MKCinema playing there?', 4200); this.stop(true); } }, 25000);
    this.session(); this.paint();
  },
  stop(tell) {
    if (tell && R.link) R.send({ t: 'lsn', on: false });
    this.on = false; this.mode = ''; clearTimeout(this.startT); clearInterval(this.syncT);
    try { this.pc && this.pc.close(); } catch (e) { /* closed */ } this.pc = null;
    if (this.hls) { try { this.hls.destroy(); } catch (e) { /* gone */ } this.hls = null; }
    const a = this.el; if (a) { a.pause(); a.srcObject = null; a.removeAttribute('src'); try { a.load(); } catch (e) { /* ignore */ } }
    try { navigator.mediaSession.playbackState = 'none'; } catch (e) { /* not supported */ }
    this.paint();
  },
  /* clock offset between this phone and the TV, for the follow-along fallback */
  ping() { R.send({ t: 'lping', t0: Date.now() }); },
  stereo(sdp) {
    const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i); if (!m) return sdp;
    return sdp.replace(new RegExp(`a=fmtp:${m[1]} ([^\\r\\n]*)`), (all, p) => `a=fmtp:${m[1]} ${p.replace(/;?(stereo|sprop-stereo)=[^;]*/g, '')};stereo=1;sprop-stereo=1`);
  },
  async offer(m) {
    try { this.pc && this.pc.close(); } catch (e) { /* closed */ }
    const pc = this.pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] });
    pc.onicecandidate = (e) => { if (e.candidate) R.send({ t: 'lice', c: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      try { e.receiver.playoutDelayHint = 0; e.receiver.jitterBufferTarget = 0; } catch (x) { /* older browser */ }
      const a = this.audio(); a.srcObject = e.streams[0] || new MediaStream([e.track]);
      a.play().then(() => { this.mode = 'live'; clearTimeout(this.startT); buzz([8, 30, 8]); this.paint(); }).catch(() => { toast('Tap Listen again to let this phone play sound', 4000); this.stop(true); });
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && this.pc === pc) { toast('The sound link to the TV dropped', 3600); this.stop(true); } };
    await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
    const ans = await pc.createAnswer(); ans.sdp = this.stereo(ans.sdp); await pc.setLocalDescription(ans);
    R.send({ t: 'lrtc', sdp: ans.sdp });
  },
  async direct(m) {
    const a = this.audio(); this.mode = 'direct'; clearTimeout(this.startT);
    const url = String(m.url || ''); if (!/^https?:\/\//i.test(url)) { this.stop(true); return; }
    if (/\.m3u8(\?|$)/i.test(url) && !a.canPlayType('application/vnd.apple.mpegurl')) {
      const Hls = await this.loadHls().catch(() => null);
      if (!this.on) return;
      if (Hls && Hls.isSupported()) { this.hls = new Hls({ maxBufferLength: 30 }); this.hls.loadSource(url); this.hls.attachMedia(a); }
      else { toast('This phone can’t play that source’s sound', 4000); this.stop(true); return; }
    } else a.src = url;
    a.onerror = () => { if (this.on && this.mode === 'direct') { toast('This phone can’t play this film’s sound format. VLC or the live mode on another source can.', 5200); this.stop(true); } };
    this.base = m; this.follow(true);
    clearInterval(this.syncT); this.syncT = setInterval(() => this.follow(), 500);
    this.paint();
  },
  loadHls() {
    if (window.Hls) return Promise.resolve(window.Hls);
    return this.hlsP || (this.hlsP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js'; s.onload = () => res(window.Hls); s.onerror = () => { this.hlsP = null; rej(new Error('hls')); }; document.head.appendChild(s); }));
  },
  /* where the TV is right now, by this phone's clock */
  target() { const b = this.base; if (!b) return null; const tvNow = Date.now() + this.off; return b.cur + (b.paused ? 0 : Math.max(0, tvNow - b.at) / 1000 * (b.rate || 1)); },
  follow(hard) {
    const a = this.el, t = this.target(); if (!a || t == null || this.mode !== 'direct') return;
    if (this.base.paused) { if (!a.paused) a.pause(); if (Math.abs(a.currentTime - t) > 0.3 && a.readyState >= 1) a.currentTime = t; return; }
    if (a.readyState < 1) { if (hard) a.addEventListener('loadedmetadata', () => this.follow(true), { once: true }); return; }
    const diff = t - a.currentTime;
    if (hard || Math.abs(diff) > 1.5) { a.currentTime = t + 0.15; a.playbackRate = this.base.rate || 1; }
    else if (Math.abs(diff) > 0.04) a.playbackRate = (this.base.rate || 1) * (1 + clamp(diff * 0.5, -0.06, 0.06));
    else a.playbackRate = this.base.rate || 1;
    if (a.paused) a.play().catch(() => {});
  },
  /* lock-screen controls on the phone drive the TV */
  session() {
    if (!('mediaSession' in navigator)) return;
    const m = R.st || {};
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: m.title || 'MKCinema', artist: m.sub || 'On your TV', artwork: m.art ? [{ src: m.art, sizes: '512x288' }] : [] });
      navigator.mediaSession.setActionHandler('play', () => R.key('playpause'));
      navigator.mediaSession.setActionHandler('pause', () => R.key('playpause'));
      navigator.mediaSession.setActionHandler('seekbackward', () => R.key('rew'));
      navigator.mediaSession.setActionHandler('seekforward', () => R.key('ff'));
      navigator.mediaSession.playbackState = m.paused ? 'paused' : 'playing';
    } catch (e) { /* partial support */ }
  },
  onMsg(m) {
    switch (m.t) {
      case 'lrtc': if (this.on && m.sdp) this.offer(m).catch(() => { toast('The sound link could not start', 3600); this.stop(true); }); return true;
      case 'lice': if (this.pc && m.c) this.pc.addIceCandidate(m.c).catch(() => {}); return true;
      case 'lpong': { const now = Date.now(), rtt = now - m.t0; if (!this.rtt || rtt < this.rtt * 1.5) { this.rtt = rtt; this.off = m.tv + rtt / 2 - now; } return true; }
      case 'lsync': if (this.mode === 'direct') { this.base = m; this.follow(); } return true;
      case 'lsn-st':
        if (m.ok && m.mode === 'direct') { if (this.on) this.direct(m); }
        else if (!m.ok) { if (this.on) { if (m.why) toast(m.why, 5200); this.stop(false); } }
        return true;
      case 'st': if (this.on && m.v !== 'player') { toast('The film stopped on the TV', 3000); this.stop(true); } return false;
      default: return false;
    }
  },
};
{
  const on = R.onMsg.bind(R);
  R.onMsg = (m) => { if (Listen.onMsg(m)) return; on(m); if (m.t === 'st') { if (Listen.on) Listen.session(); Listen.paint(); } };
  const lv = R.leave.bind(R);
  R.leave = () => { if (Listen.on) Listen.stop(true); lv(); };
  $('#lsnBtn').onclick = () => Listen.toggle();
  // the clock offset is refreshed now and then while listening along
  setInterval(() => { if (Listen.on && Listen.mode === 'direct') Listen.ping(); }, 15000);
}
