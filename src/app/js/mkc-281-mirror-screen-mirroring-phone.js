
/* ---------------- 2.81 Screen mirroring: a phone or computer shows its screen on this MKCinema screen ----------------
   The screen that shows (any MKCinema: TV, Fire TV, computer, browser) opens Phone › Screen mirroring and gets a fresh
   6-character code. The sender types it (or scans the QR): an Android phone in the MKCinema app (1.16.0+, Android's own
   screen capture, MirrorService), or a computer browser (getDisplayMedia). The two meet on realtime channel
   mirror-<CODE> and the picture (and sound where allowed) goes over one WebRTC connection, sender offers, screen answers.
   Phone browsers and iPhones can't capture their screen at all: they get a plain reason and the way that does work. */
const Mirror = {
  ICE: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }],
  CODE: /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/,
  side: '', want: '', rx: null, tx: null, hideT: 0,

  /* ---------- what this device can do ---------- */
  native() { try { return !IS_TV && !!(window.MKAndroid && typeof MKAndroid.mirrorStart === 'function'); } catch (e) { return false; } },
  oldApp() { try { return !IS_TV && !!window.MKAndroid && typeof MKAndroid.mirrorStart !== 'function'; } catch (e) { return false; } },
  platform() {
    const u = navigator.userAgent;
    if (/iPhone|iPod|iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return 'ios';
    return /Android/.test(u) ? 'android' : 'computer';
  },
  web() { return !IS_TV && this.platform() === 'computer' && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !!window.RTCPeerConnection; },
  canSend() { return this.native() || this.web(); },
  myName() {
    const n = (typeof CFG !== 'undefined' && CFG.partyName) || (typeof Account !== 'undefined' && Account.user ? Account.name().split('@')[0] : '');
    return String(n || (this.platform() === 'android' ? 'An Android phone' : typeof Remote !== 'undefined' ? Remote.device() : 'A computer')).slice(0, 40);
  },
  screenName() { return typeof Remote !== 'undefined' ? Remote.device() : 'the other screen'; },
  ice() { return typeof MkIce !== 'undefined' ? MkIce.ready(2500).then(() => MkIce.list || []).catch(() => []) : Promise.resolve([]); },
  appLink(code) {
    // an Android browser hands the link to the MKCinema app; without the app it opens the download page
    const fb = encodeURIComponent('https://mkcinema.app/download/');
    return `intent://app.mkcinema.app/${code ? `#mirror=${code}` : ''}#Intent;scheme=https;package=com.mkcinema.app;S.browser_fallback_url=${fb};end`;
  },

  /* ---------- the panel (a tab of Phone) ---------- */
  open(side, code) { if (code) this.want = code; if (side) this.side = side; if (typeof Cast !== 'undefined') Cast.open('mirror'); },
  defSide() { if (IS_TV) return 'show'; if (this.tx) return 'send'; return this.platform() === 'computer' ? 'show' : 'send'; },
  html() {
    const side = IS_TV ? 'show' : this.side || (this.side = this.defSide());
    const seg = IS_TV ? '' : `<div class="segc mr-seg" role="tablist"><button type="button" data-mr="show" class="${side === 'show' ? 'on' : ''}" data-nav>Show a screen here</button><button type="button" data-mr="send" class="${side === 'send' ? 'on' : ''}" data-nav>Share my screen</button></div>`;
    return seg + (side === 'show' ? this.showHtml() : this.sendHtml());
  },
  showHtml() {
    if (!window.RTCPeerConnection) return '<p class="sub">This browser can’t show another screen. Open MKCinema in Chrome, Edge or Safari, or in the MKCinema app.</p>';
    const r = this.rx, code = r ? r.code : '';
    const qr = code && /^https?:$/.test(location.protocol) ? (() => { try { return QR.svg(appLink(`mirror=${code}`)); } catch (e) { return ''; } })() : '';
    return `<div class="rmx mr-show"><div class="rmx-qr">${qr || '<div class="mr-qr-wait"></div>'}</div><div class="rmx-t">
      <h3 class="rmx-h">Show your phone on this screen</h3>
      <p class="rmx-s">On an Android phone, open the MKCinema app, then Phone › Screen mirroring › Share my screen, and type this code. On a computer, open app.mkcinema.app and do the same.</p>
      <div class="rmx-code tnum" id="mrCode" aria-label="Code ${esc(code.split('').join(' '))}">${(code || '······').split('').map((c) => `<span>${esc(c)}</span>`).join('')}</div>
      <div class="rmx-foot"><span class="rmx-st" id="mrState" data-s="${this.rxKind()}"><i></i><span>${esc(this.rxLine())}</span></span></div>
      <p class="rmx-app mr-fine">iPhone or iPad? Apple lets them mirror only with AirPlay, to an Apple TV or a Mac.</p></div></div>`;
  },
  rxKind() { const r = this.rx; return !r || !r.bus ? 'wait' : r.from ? 'on' : r.online ? 'ready' : 'wait'; },
  rxLine() {
    const r = this.rx; if (!r || !r.bus) return 'Getting ready…';
    if (r.from) return `Connecting to ${r.name}…`;
    return r.online ? 'Waiting for a phone or computer' : 'The connection service did not answer. Close this and try again.';
  },
  sendHtml() {
    const t = this.tx, pf = this.platform();
    if (t) return `<div class="mr-send"><h3 class="rmx-h">${t.state === 'on' ? `Your screen is showing on ${esc(t.toName || 'the other screen')}` : 'Connecting…'}</h3>
      <p class="sub">${t.state === 'on' ? (t.native ? 'You can leave MKCinema and open any app. Stop here or from the notification.' : 'Switch to any window or tab. Stop here or with your browser’s Stop sharing button.') : esc(t.line || 'Looking for the other screen…')}</p>
      <div class="actions"><button class="btn btn-prime" type="button" id="mrStop" data-nav><i data-lucide="square"></i>Stop mirroring</button></div></div>`;
    if (this.canSend()) {
      return `<div class="mr-send"><p class="sub">Type the code shown on the other screen (open Phone › Screen mirroring there).</p>
        <div class="inrow"><input class="inp mono rm-code" id="mrIn" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABC123" value="${esc(this.want || '')}" data-nav><button class="btn btn-prime" type="button" id="mrGo" data-nav><i data-lucide="cast"></i>Start</button></div>
        <p class="tour-note mr-fine">Everything on your screen shows there, notifications too. ${this.native() ? 'Apps like Netflix block screen sharing and show black. Sound comes through on Android 10 and later, from apps that allow it.' : 'Pick a tab to send its sound too.'}</p></div>`;
    }
    if (pf === 'ios') return `<div class="mr-send"><h3 class="rmx-h">iPhones can’t share their screen with apps</h3><p class="sub">Apple only allows screen mirroring through AirPlay. Open Control Center, tap Screen Mirroring, and pick an Apple TV or a Mac.</p></div>`;
    if (pf === 'android') {
      return `<div class="mr-send"><h3 class="rmx-h">${this.oldApp() ? 'Update the MKCinema app to share your screen' : 'Share your screen from the MKCinema app'}</h3>
        <p class="sub">${this.oldApp() ? 'Screen mirroring needs MKCinema for Android 1.16.0 or newer.' : 'Phone browsers can’t share the screen. The free MKCinema app for Android can.'}</p>
        <div class="actions">${this.oldApp() ? '' : `<a class="btn btn-prime" href="${esc(this.appLink(this.want))}" data-nav><i data-lucide="smartphone"></i>Open in the app</a>`}<a class="btn btn-ghost" href="https://mkcinema.app/download/" target="_blank" rel="noopener" data-nav><i data-lucide="download"></i>${this.oldApp() ? 'Get the update' : 'Get the app'}</a></div></div>`;
    }
    return '<p class="sub">This device can’t share its screen. Use a computer with Chrome, Edge or Firefox, or an Android phone with the MKCinema app.</p>';
  },
  bind(body) {
    $$('[data-mr]', body).forEach((b) => { b.onclick = () => { this.side = b.dataset.mr; this.repaint(); }; });
    const go = $('#mrGo', body), inp = $('#mrIn', body);
    if (inp) { inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); this.want = inp.value; }; inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go && go.click(); } }; }
    if (go) go.onclick = () => this.start(inp ? inp.value : '');
    const st = $('#mrStop', body); if (st) st.onclick = () => this.stop();
    if ((IS_TV || this.side === 'show') && !this.rx) this.listen();
  },
  repaint() { const b = $('#castBody'); if (b && typeof Cast !== 'undefined' && Cast.tab === 'mirror' && !$('#castLayer').hidden) Cast.render(); },
  paintState() {
    const el = $('#mrState'); if (el) { el.dataset.s = this.rxKind(); const t = el.querySelector('span'); if (t) t.textContent = this.rxLine(); }
  },

  /* ---------- this screen shows another one ---------- */
  async listen() {
    if (this.rx) return;
    const rx = this.rx = { code: roomCode(), bus: null, online: false, from: '', name: '', pc: null, early: [], stream: null };
    rx.bus = new Bus(`mirror-${rx.code}`, (m) => this.rxMsg(rx, m));
    this.repaint(); this.ice();
    rx.online = await rx.bus.connect(); if (this.rx !== rx) return;
    rx.bus.onState = (up) => { rx.online = up; this.paintState(); };
    this.paintState();
    rx.idleT = setTimeout(() => { if (this.rx === rx && !rx.pc) this.rxEnd(); }, 30 * 60000);
  },
  rxMsg(rx, m) {
    if (this.rx !== rx || !m) return;
    const from = m._from;
    if (m.t === 'mr-hi') {
      if (rx.from && rx.from !== from && rx.pc && rx.pc.connectionState === 'connected') { rx.bus.send({ t: 'mr-busy', _to: from }); return; }
      if (rx.pc) this.rxPcClose(rx);
      rx.from = from; rx.name = String(m.name || 'A phone').slice(0, 40); rx.early = [];
      rx.bus.send({ t: 'mr-ok', _to: from, name: this.screenName() });
      this.paintState(); return;
    }
    if (!rx.from || from !== rx.from) return;
    if (m.t === 'mr-sdp') this.rxOffer(rx, m.sdp);
    else if (m.t === 'mr-ice' && m.ice && typeof m.ice.candidate === 'string') { if (rx.pc && rx.pc.remoteDescription) rx.pc.addIceCandidate(m.ice).catch(() => {}); else rx.early.push(m.ice); }
    else if (m.t === 'mr-bye') { toast(`${rx.name} stopped sharing`, 'info', 3000); this.rxEnd(true); }
  },
  async rxOffer(rx, sdp) {
    if (!sdp || sdp.type !== 'offer' || typeof sdp.sdp !== 'string' || sdp.sdp.length > 100000) return;
    await this.ice(); if (this.rx !== rx) return;
    if (rx.pc) this.rxPcClose(rx);
    const pc = rx.pc = new RTCPeerConnection({ iceServers: this.ICE }), stream = rx.stream = new MediaStream();
    pc.onicecandidate = ({ candidate }) => { if (candidate) rx.bus.send({ t: 'mr-ice', _to: rx.from, ice: candidate.toJSON() }); };
    pc.ontrack = (e) => { stream.getTracks().filter((x) => x.kind === e.track.kind).forEach((x) => stream.removeTrack(x)); stream.addTrack(e.track); this.view(rx); };
    pc.onconnectionstatechange = () => {
      if (rx.pc !== pc) return;
      const s = pc.connectionState;
      if (s === 'connected') { this.viewLive(true); }
      if (s === 'disconnected') { this.viewLive(false); clearTimeout(rx.dropT); rx.dropT = setTimeout(() => { if (rx.pc === pc && pc.connectionState !== 'connected') { toast(`Lost ${rx.name}’s screen`, 'err', 5000); this.rxEnd(true); } }, 12000); }
      if (s === 'failed') { toast(`Could not reach ${rx.name}. Both need to be online; some work and school networks block this.`, 'err', 7000); this.rxEnd(true); }
    };
    try {
      await pc.setRemoteDescription(sdp); await pc.setLocalDescription();
      rx.bus.send({ t: 'mr-sdp', _to: rx.from, sdp: pc.localDescription.toJSON() });
      rx.early.splice(0).forEach((c) => pc.addIceCandidate(c).catch(() => {}));
    } catch (e) { console.warn('mirror', e); toast('That screen could not be shown here', 'err'); this.rxEnd(true); }
  },
  rxPcClose(rx) { const pc = rx.pc; rx.pc = null; clearTimeout(rx.dropT); if (pc) { try { pc.close(); } catch (e) { /* closed */ } } if (rx.stream) rx.stream.getTracks().forEach((t) => t.stop()); rx.stream = null; },
  /* the picture stops; tell the sender, so its capture stops too */
  rxEnd() {
    const rx = this.rx; if (!rx) return; this.rx = null; clearTimeout(rx.idleT);
    if (rx.from && rx.bus) rx.bus.send({ t: 'mr-bye', _to: rx.from }); // the sender stops capturing too
    this.rxPcClose(rx); this.viewClose();
    const b = rx.bus; setTimeout(() => b && b.close(), 600);
  },

  /* ---------- the picture, full screen over this layer ---------- */
  view(rx) {
    const lay = $('#castLayer'); if (!lay) return;
    let v = $('#mrView');
    if (!v) {
      v = document.createElement('div'); v.id = 'mrView'; v.className = 'mr-view';
      v.innerHTML = `<video playsinline autoplay></video><div class="mr-wait" id="mrWait"><div class="pg-ring"></div><b>Connecting…</b></div>
        <div class="mr-top"><span class="mr-who"><i data-lucide="cast"></i><span id="mrWho"></span></span><span class="mr-acts">${document.fullscreenEnabled && !IS_TV ? '<button class="btn btn-ghost btn-sm" type="button" id="mrFs" data-nav><i data-lucide="maximize"></i>Full screen</button>' : ''}<button class="btn btn-ghost btn-sm" type="button" id="mrEnd" data-nav><i data-lucide="x"></i>Stop</button></span></div>
        <button class="btn btn-prime mr-tap" type="button" id="mrTap" data-nav hidden><i data-lucide="volume-2"></i>Tap for sound</button>`;
      lay.appendChild(v); lay.classList.add('mr-full'); icons();
      if (typeof Remote !== 'undefined' && Remote.hintEl && Remote.unhint) Remote.unhint(); // the remote's corner card stays off the picture
      $('#mrEnd', v).onclick = () => this.rxEnd();
      const fs = $('#mrFs', v); if (fs) fs.onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else v.requestFullscreen().catch(() => {}); };
      $('#mrTap', v).onclick = () => { const x = $('video', v); x.muted = false; x.play().catch(() => {}); $('#mrTap', v).hidden = true; };
      const wake = () => { v.classList.add('awake'); clearTimeout(this.hideT); this.hideT = setTimeout(() => v.classList.remove('awake'), 3500); };
      ['pointermove', 'pointerdown', 'keydown', 'focusin'].forEach((e) => v.addEventListener(e, wake)); wake();
      setTimeout(() => { const b = $('#mrEnd', v); if (b && IS_TV) b.focus(); }, 60);
    }
    $('#mrWho', v).textContent = `${rx.name}’s screen`;
    const x = $('video', v);
    if (x.srcObject !== rx.stream) x.srcObject = rx.stream;
    x.muted = false; x.play().then(() => { $('#mrTap', v).hidden = true; }).catch(() => { x.muted = true; x.play().catch(() => {}); $('#mrTap', v).hidden = !rx.stream.getAudioTracks().length; });
    if (!$('#castLayer').hidden) return; openLayer('castLayer');
  },
  viewLive(on) { const v = $('#mrView'); if (v) v.classList.toggle('live', !!on); },
  viewClose() {
    const v = $('#mrView'); if (v) { const x = $('video', v); if (x) x.srcObject = null; v.remove(); }
    const lay = $('#castLayer'); if (lay) lay.classList.remove('mr-full');
    if (document.fullscreenElement && document.fullscreenElement.id === 'mrView') document.exitFullscreen().catch(() => {});
    this.repaint();
  },

  /* ---------- this device shares its screen ---------- */
  async start(code) {
    code = String(code || '').trim().toUpperCase();
    if (!this.CODE.test(code)) { toast('Codes have 6 letters and numbers', 'err'); return; }
    if (!this.canSend()) { this.repaint(); return; }
    if (this.tx) this.stop(true);
    const tx = this.tx = { code, native: this.native(), state: 'wait', line: 'Looking for the other screen…', to: '', toName: '', pc: null, stream: null, bus: null };
    if (!tx.native) {
      // the browser's own picker must come straight from the tap
      try {
        tx.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } }, audio: true, selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include' });
      } catch (e) { if (this.tx === tx) this.tx = null; toast(e && e.name === 'NotAllowedError' ? 'Screen sharing was cancelled' : 'This browser could not share the screen', e && e.name === 'NotAllowedError' ? 'info' : 'err'); this.repaint(); return; }
      if (this.tx !== tx) { tx.stream.getTracks().forEach((t) => t.stop()); return; }
      tx.stream.getVideoTracks().forEach((t) => { t.onended = () => { if (this.tx === tx) this.stop(); }; });
    }
    this.chip(); this.repaint();
    tx.bus = new Bus(`mirror-${code}`, (m) => this.txMsg(tx, m));
    const ok = await tx.bus.connect(); if (this.tx !== tx) return;
    if (!ok) { this.fail(tx, 'The connection service did not answer. Check your internet and try again.'); return; }
    // the other screen may still be joining the channel: say hello a few times
    let n = 0; const hi = () => { if (this.tx !== tx || tx.to) return; if (n++ >= 6) { this.fail(tx, 'No screen is showing that code. Check the code on the other screen, or open Screen mirroring there again.'); return; } tx.bus.send({ t: 'mr-hi', name: this.myName(), kind: tx.native ? 'phone' : 'computer' }); tx.hiT = setTimeout(hi, 1500); };
    hi();
  },
  txMsg(tx, m) {
    if (this.tx !== tx || !m) return;
    if (m.t === 'mr-ok' && !tx.to) { tx.to = m._from; tx.toName = String(m.name || 'the other screen').slice(0, 40); clearTimeout(tx.hiT); this.txGo(tx); return; }
    if (m.t === 'mr-busy' && !tx.to) { this.fail(tx, 'That screen is already showing someone else’s screen.'); return; }
    if (!tx.to || m._from !== tx.to) return;
    if (m.t === 'mr-sdp' && m.sdp && m.sdp.type === 'answer' && typeof m.sdp.sdp === 'string') {
      if (tx.native) this.nsig({ sdp: m.sdp });
      else if (tx.pc && tx.pc.signalingState === 'have-local-offer') tx.pc.setRemoteDescription(m.sdp).catch((e) => this.fail(tx, `Mirroring could not start (${e.message || e})`));
    } else if (m.t === 'mr-ice' && m.ice && typeof m.ice.candidate === 'string') {
      if (tx.native) this.nsig({ ice: m.ice }); else if (tx.pc) tx.pc.addIceCandidate(m.ice).catch(() => {});
    } else if (m.t === 'mr-bye') { toast(`${tx.toName} closed your screen`, 'info', 4000); this.stop(true); }
  },
  nsig(o) { try { MKAndroid.mirrorSignal(JSON.stringify(o)); } catch (e) { /* app closed */ } },
  async txGo(tx) {
    tx.line = `Connecting to ${tx.toName}…`; this.repaint(); this.chip();
    const ice = [...this.ICE, ...(await this.ice())]; if (this.tx !== tx) return;
    if (tx.native) {
      window.MKMirrorNative = { ev: (j) => this.nativeEv(j) };
      let ok = false; try { ok = MKAndroid.mirrorStart(JSON.stringify({ ice, to: tx.toName, maxSide: 1280, fps: 30, kbps: 4000, sound: true })); } catch (e) { ok = false; }
      if (!ok) { this.fail(tx, 'Screen mirroring could not start on this phone.'); return; }
      tx.line = 'Allow MKCinema to share your screen: tap Start now.'; this.repaint(); return;
    }
    const pc = tx.pc = new RTCPeerConnection({ iceServers: ice });
    tx.stream.getTracks().forEach((t) => pc.addTransceiver(t, { direction: 'sendonly', streams: [tx.stream] }));
    pc.onicecandidate = ({ candidate }) => { if (candidate && this.tx === tx) tx.bus.send({ t: 'mr-ice', _to: tx.to, ice: candidate.toJSON() }); };
    pc.onconnectionstatechange = () => this.txState(tx, pc.connectionState);
    try {
      await pc.setLocalDescription();
      pc.getSenders().forEach((s) => { if (!s.track || s.track.kind !== 'video') return; const p = s.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}]; p.encodings[0].maxBitrate = 4000000; s.setParameters(p).catch(() => {}); });
      tx.bus.send({ t: 'mr-sdp', _to: tx.to, sdp: pc.localDescription.toJSON() });
    } catch (e) { this.fail(tx, `Mirroring could not start (${e.message || e})`); }
  },
  txState(tx, s) {
    if (this.tx !== tx) return;
    if (s === 'connected' && tx.state !== 'on') { tx.state = 'on'; this.repaint(); this.chip(); toast(`Your screen is showing on ${tx.toName}`, 'ok', 4000); }
    if (s === 'failed') this.fail(tx, `Could not reach ${tx.toName}. Both need to be online; some work and school networks block this.`);
    if (s === 'closed' && tx.state === 'on') this.stop(true);
  },
  nativeEv(j) {
    const tx = this.tx; let e = null; try { e = JSON.parse(j); } catch (x) { return; }
    if (!e) return;
    if (!tx || !tx.native) { if (e.t !== 'stopped') { try { MKAndroid.mirrorStop(); } catch (x) { /* gone */ } } this.chip(); return; }
    if (e.t === 'sdp' && e.sdp) tx.bus.send({ t: 'mr-sdp', _to: tx.to, sdp: e.sdp });
    else if (e.t === 'ice' && e.ice) tx.bus.send({ t: 'mr-ice', _to: tx.to, ice: e.ice });
    else if (e.t === 'live') { tx.sound = !!e.sound; tx.line = `Connecting to ${tx.toName}…`; this.repaint(); }
    else if (e.t === 'state') this.txState(tx, e.s);
    else if (e.t === 'denied') this.fail(tx, 'Screen mirroring needs your OK. Try again and tap Start now.');
    else if (e.t === 'error') this.fail(tx, `Screen mirroring stopped${e.why ? ` (${e.why})` : ''}`);
    else if (e.t === 'ended' || e.t === 'stopped') this.stop();
  },
  fail(tx, msg) { if (this.tx !== tx) return; this.stop(true); toast(msg, 'err', 7000); },
  stop(quiet) {
    const tx = this.tx; if (!tx) { this.chip(); return; } this.tx = null; clearTimeout(tx.hiT);
    if (tx.to && tx.bus) tx.bus.send({ t: 'mr-bye', _to: tx.to });
    if (tx.native) { try { MKAndroid.mirrorStop(); } catch (e) { /* app closed */ } }
    if (tx.pc) { try { tx.pc.close(); } catch (e) { /* closed */ } }
    if (tx.stream) tx.stream.getTracks().forEach((t) => t.stop());
    const b = tx.bus; setTimeout(() => b && b.close(), 800);
    this.chip(); this.repaint(); if (!quiet) toast('Screen mirroring stopped', 'info', 2600);
  },
  /* a small pill while this device shares, so it is never forgotten */
  chip() {
    let c = $('#mrChip'); const t = this.tx;
    let on = !!t; if (!on && this.native()) { try { on = MKAndroid.mirrorOn(); } catch (e) { on = false; } }
    if (!on) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('div'); c.id = 'mrChip'; c.className = 'mr-chip'; c.setAttribute('role', 'status'); document.body.appendChild(c); }
    c.innerHTML = `<i class="mr-dot"></i><span>${t ? (t.state === 'on' ? `Showing your screen on ${esc(t.toName)}` : 'Starting screen mirroring…') : 'Showing your screen'}</span><button type="button" class="mr-x" data-nav>Stop</button>`;
    $('.mr-x', c).onclick = () => { if (this.tx) this.stop(); else { try { MKAndroid.mirrorStop(); } catch (e) { /* gone */ } c.remove(); } };
  },

  /* ---------- links: #mirror=CODE (the QR on the screen that shows) ---------- */
  async link(code) {
    code = String(code || '').trim().toUpperCase();
    if (document.readyState === 'loading') await new Promise((r) => addEventListener('DOMContentLoaded', r, { once: true }));
    if (IS_TV) return;
    this.open('send', this.CODE.test(code) ? code : '');
  },
  init() {
    const lay = $('#castLayer');
    // closing the layer (Back, Esc, the X) ends the picture this screen shows, and stops listening for a code
    if (lay) new MutationObserver(() => { if (lay.hidden && this.rx) this.rxEnd(); }).observe(lay, { attributes: true, attributeFilter: ['hidden'] });
    window.MKMirrorNative = { ev: (j) => this.nativeEv(j) };
    this.chip();
    addEventListener('pagehide', () => { if (this.rx) this.rxEnd(); if (this.tx && !this.tx.native) this.stop(true); });
  },
};
Mirror.init();
if (typeof COMMANDS !== 'undefined') COMMANDS.push(
  { label: 'Show a phone screen here (screen mirroring)', icon: 'cast', run: () => Mirror.open('show') },
  { label: 'Share my screen (screen mirroring)', icon: 'screen-share', run: () => Mirror.open('send') },
);
