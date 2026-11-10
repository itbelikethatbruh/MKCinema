
/* ---------- 2.55 Party relay ----------
   Parties connect devices directly. When a phone on mobile data and a laptop on home Wi-Fi can't reach each other,
   WebRTC needs a TURN relay. MkIce asks the party-turn function for short-lived relay logins and adds them to every
   peer connection made after that. If the relay is missing or slow, parties work exactly as before (direct only). */
const MkIce = {
  list: [], t: 0, p: null,
  url: () => `${SUPABASE_PROJECT.url}/functions/v1/party-turn`,
  load() {
    if (this.list.length && Date.now() - this.t < 2.5 * 3600e3) return Promise.resolve(this.list);
    if (this.p) return this.p;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = setTimeout(() => ctl && ctl.abort(), 6000);
    this.p = fetch(this.url(), { headers: { apikey: SUPABASE_PROJECT.anonKey }, signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null)).then((j) => {
        const l = j && Array.isArray(j.iceServers) ? j.iceServers.filter((s) => s && s.urls) : [];
        if (l.length) { this.list = l; this.t = Date.now(); }
        return this.list;
      }).catch(() => this.list).finally(() => { clearTimeout(to); this.p = null; });
    return this.p;
  },
  // wait for the relay at most `ms`, so joining never feels slower
  ready(ms = 2500) { return Promise.race([this.load(), new Promise((r) => setTimeout(r, ms))]); },
  wrap() {
    const N = window.RTCPeerConnection;
    if (!N || N.__mkIce) return;
    class W extends N {
      constructor(cfg, ...rest) {
        const c = Object.assign({}, cfg || {});
        if (MkIce.list.length) c.iceServers = [...(c.iceServers || []), ...MkIce.list];
        super(c, ...rest);
      }
    }
    W.__mkIce = true;
    window.RTCPeerConnection = W;
  },
};
MkIce.wrap();
/* ---------------- 2.55 Party cameras ----------------
   Faces in a watch party, from Vortex Video's idea of a call and a cinema in one. Each person can turn on a camera:
   the device's own, or their phone's through the phone remote ("Party camera on this phone"), which is handy for a TV.
   Video goes peer to peer over the party's existing WebRTC links (no server sees it), small and light: 320 x 240 at
   15 frames a second, about 0.2 Mbit/s each way per friend. Nothing is recorded.
   - Faces sit in a slim column on the left; the one talking grows a little and gets a ring.
   - Lobby: with no film open, the party panel shows everyone big, with "Vote on what to watch" (Couch match on phones).
   - After-film talk: once the credits roll, the faces get big so the room can talk; they shrink when a film plays again.
   - Ask to pause: a member's pause asks the host, whose screen offers "Pause for everyone".
   - Group stub: the party's ticket stub can carry a small still of each face, only for people who said yes.
   Video link: one shared video transceiver per pair, made by the side that opens the data channel, so turning a camera
   on or off never renegotiates from both ends at once (two cameras turned on together lost one face before). */
const Cams = {
  cam: null, tiles: new Map(), strip: null, big: false, modeT: 0,
  shown() { return CFG.partyCams !== false; },
  ok() { return window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia; },
  stripEl() {
    if (!this.strip || !this.strip.isConnected) {
      const d = this.strip = document.createElement('div'); d.id = 'camStrip'; d.setAttribute('aria-label', 'Party cameras'); d.hidden = true;
      d.innerHTML = '<div class="cam-tiles"></div><div class="cam-acts" hidden><span class="cam-cap"></span><button class="btn btn-prime btn-sm" type="button" data-nav data-camact="vote"><i data-lucide="smartphone"></i>Vote on what’s next</button></div>';
      d.addEventListener('click', (e) => { const b = e.target.closest('[data-camact]'); if (b && b.dataset.camact === 'vote' && typeof Couch !== 'undefined') Couch.open(); });
      document.body.appendChild(d);
    }
    return this.strip;
  },
  box() { return $('.cam-tiles', this.stripEl()); },
  /* one "You" at most: your phone's camera wins over this screen's own, and "Show me" can hide yourself entirely */
  selfFix() {
    let phone = false; this.tiles.forEach((t) => { if (t.classList.contains('self') && t.dataset.pid !== 'me') phone = true; });
    let n = 0; this.tiles.forEach((t, id) => { const self = t.classList.contains('self'); t.hidden = self && (CFG.camSelf === false || (id === 'me' && phone)); if (!t.hidden) n++; });
    return n;
  },
  paint() {
    // the column hides while the party panel's lobby already shows everyone big
    const n = this.selfFix(), d = this.stripEl(); d.hidden = !(Party.code && this.shown() && n && !($('#player').hidden && !$('#partyLayer').hidden));
    d.classList.toggle('big', !d.hidden && this.big);
    const acts = $('.cam-acts', d);
    acts.hidden = !this.big;
    $('.cam-cap', d).textContent = 'After the film';
    this.lobby();
  },
  /* the lobby: with no film open, the party panel shows everyone big, with a vote on what to watch */
  lobby() {
    const root = $('#partyLayerBody'); if (!root) return;
    let g = $('.py-faces', root);
    const show = !!(Party.code && this.shown() && $('#player').hidden && [...this.tiles.values()].some((t) => !t.hidden));
    if (!show) { if (g) g.remove(); return; }
    if (!g) { root.insertAdjacentHTML('afterbegin', '<div class="py-faces"><div class="pyf-grid"></div><button class="btn btn-prime btn-sm" type="button" data-nav data-camact="vote"><i data-lucide="smartphone"></i>Vote on what to watch</button></div>'); g = $('.py-faces', root); $('[data-camact]', g).onclick = () => { if (typeof Couch !== 'undefined') Couch.open(); }; icons(); }
    const grid = $('.pyf-grid', g), want = [...this.tiles.entries()].filter(([, t]) => !t.hidden);
    [...grid.children].forEach((f) => { if (!want.some(([id]) => id === f.dataset.pid)) f.remove(); });
    want.forEach(([id, t]) => {
      let f = $(`[data-pid="${CSS.escape(id)}"]`, grid);
      if (!f) { f = document.createElement('figure'); f.className = `cam-t${t.classList.contains('self') ? ' self' : ''}`; f.dataset.pid = id; f.innerHTML = '<video autoplay playsinline muted></video><figcaption></figcaption>'; grid.appendChild(f); }
      const v = f.firstChild, src = t.firstChild.srcObject; if (v.srcObject !== src) { v.srcObject = src; v.play().catch(() => {}); }
      f.lastChild.textContent = t.lastChild.textContent; f.classList.toggle('talk', t.classList.contains('talk'));
    });
  },
  /* lobby (no film open) and the credits make the faces big */
  inCredits() {
    if ($('#player').hidden) return false;
    if (!P.ctx || !P.stream) return false;
    const d = pDur(), t = pNow(); if (video.ended) return true;
    const cr = typeof Skip !== 'undefined' && Skip.m && Skip.m.credits;
    if (cr) return t >= cr;
    return isFinite(d) && d >= 600 && t >= d - Math.min(360, d * 0.05);
  },
  // also repaints when a film opens or the party panel closes, so the column comes back without waiting for a new face
  mode() {
    const b = !!(Party.code && this.tiles.size && this.inCredits());
    const k = `${!!$('#player').hidden}|${!!($('#partyLayer') && $('#partyLayer').hidden)}`;
    if (b !== this.big) { this.big = b; this.lastK = k; this.paint(); icons(); }
    else if (k !== this.lastK) { this.lastK = k; this.paint(); }
  },
  tile(id, stream, name, self) {
    let t = this.tiles.get(id);
    if (!t) {
      t = document.createElement('figure'); t.className = `cam-t${self ? ' self' : ''}`; t.dataset.pid = id;
      t.innerHTML = '<video autoplay playsinline muted></video><figcaption></figcaption>';
      this.box().appendChild(t); this.tiles.set(id, t);
    }
    const v = t.firstChild; if (v.srcObject !== stream) { v.srcObject = stream; v.play().catch(() => {}); }
    t.lastChild.textContent = name; this.paint(); this.mode();
  },
  untile(id) { const t = this.tiles.get(id); if (!t) return; try { t.firstChild.srcObject = null; } catch (e) { /* gone */ } t.remove(); this.tiles.delete(id); this.paint(); this.mode(); },
  own(p) { return typeof Party.ownPhone === 'function' && Party.ownPhone(p); },
  label(p) { return this.own(p) ? 'You' : String(p.name || 'Guest').replace(/ \(phone\)$/, ''); },
  showPeer(p) { const tr = p.camTrack; if (tr && tr.readyState === 'live') this.tile(p.id, p.camStream || (p.camStream = new MediaStream([tr])), this.label(p), this.own(p)); },
  videoIn(p, track) {
    p.camTrack = track; p.camStream = new MediaStream([track]);
    track.onmute = () => this.untile(p.id); track.onunmute = () => { if (p.camOn !== false) this.showPeer(p); }; track.onended = () => this.untile(p.id);
    if (!track.muted || p.camOn) this.showPeer(p);
  },
  vtr(p) {
    if (p.camTr && p.camTr.currentDirection !== 'stopped') return p.camTr;
    return p.pc.getTransceivers().find((x) => x.receiver && x.receiver.track && x.receiver.track.kind === 'video' && x.currentDirection !== 'stopped') || null;
  },
  /* the side that opens the data channel adds one shared video lane, once it knows the other side is a screen */
  lane(p) {
    if (!p || p.voice || p.polite || p.camTr || p.pc.signalingState === 'closed') return;
    try { p.camTr = p.pc.addTransceiver('video', { direction: 'sendrecv' }); } catch (e) { /* closed */ }
  },
  send(p) {
    if (!this.cam || !p || p.voice) return; // phones that only carry voice or a camera don't show faces
    const t = this.cam.getVideoTracks()[0]; if (!t) return;
    const tr = this.vtr(p);
    try {
      if (tr) {
        if (tr.direction !== 'sendrecv' && tr.direction !== 'sendonly') tr.direction = 'sendrecv';
        if (tr.sender.track !== t) tr.sender.replaceTrack(t).catch(() => {});
        setTimeout(() => this.limit(tr.sender), 2500);
      } else if (!p.pc.getSenders().some((x) => x.track === t)) { const snd = p.pc.addTrack(t, this.cam); setTimeout(() => this.limit(snd), 2500); }
    } catch (e) { /* closed */ }
  },
  limit(snd) {
    try {
      const pr = snd.getParameters(); if (!pr.encodings || !pr.encodings.length) return;
      pr.encodings[0].maxBitrate = 220000; pr.encodings[0].maxFramerate = 15; snd.setParameters(pr).catch(() => {});
    } catch (e) { /* older browser: the 320 x 240 capture keeps it light anyway */ }
  },
  say(on) { Party.send({ t: 'cam', on: !!on, face: !!(on && CFG.stubFace) }); },
  stopCam() {
    if (!this.cam) return; const t = this.cam.getVideoTracks()[0];
    Party.peers.forEach((p) => p.pc.getSenders().forEach((s) => {
      if (s.track !== t) return;
      const tr = p.pc.getTransceivers().find((x) => x.sender === s);
      try { if (tr && (tr === p.camTr || tr.receiver.track.kind === 'video')) s.replaceTrack(null).catch(() => {}); else p.pc.removeTrack(s); } catch (e) { /* closed */ }
    }));
    this.cam.getTracks().forEach((x) => x.stop()); this.cam = null; this.untile('me'); this.say(false);
  },
  async toggle() {
    if (this.cam) { this.stopCam(); toast('Your camera is off', 'info', 1600, 'cam'); Party.render(); return; }
    if (!this.ok()) { toast('The camera needs MKCinema on an https address, such as app.mkcinema.app', 'err', 6000); return; }
    let s;
    try { s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 } } }); }
    catch (e) { toast(e && e.name === 'NotFoundError' ? 'No camera was found. On a TV, use your phone: open the phone remote and tap Party camera.' : 'Camera permission was not given', 'err', 6000); return; }
    if (!Party.code) { s.getTracks().forEach((x) => x.stop()); return; }
    this.cam = s; Party.peers.forEach((p) => this.send(p)); this.tile('me', s, 'You', true); this.say(true);
    toast('Your camera is on. Friends in the party can see you.', 'ok', 3000, 'cam'); Party.render();
  },
  /* ---------- the group stub: a small still of each face that said yes ---------- */
  still(v) {
    try {
      if (!v || v.readyState < 2 || !v.videoWidth) return '';
      const c = document.createElement('canvas'); c.width = 96; c.height = 72; const g = c.getContext('2d');
      const s = Math.max(96 / v.videoWidth, 72 / v.videoHeight), w = v.videoWidth * s, h = v.videoHeight * s;
      g.drawImage(v, (96 - w) / 2, (72 - h) / 2, w, h); return c.toDataURL('image/jpeg', 0.7);
    } catch (e) { return ''; }
  },
  faces() {
    const out = [];
    this.tiles.forEach((t, id) => {
      const p = Party.peers.get(id), self = id === 'me' || (p && this.own(p));
      const yes = self ? CFG.stubFace === true : !!(p && p.face);
      if (!yes) return; const img = this.still(t.firstChild); if (img) out.push({ n: self ? 'You' : t.lastChild.textContent, img });
    });
    // your own face once, even with both your camera and your phone's on
    const seen = new Set(); return out.filter((f) => (f.n === 'You' ? (seen.has('You') ? false : seen.add('You')) : true)).slice(0, 6);
  },
  /* ---------- ask to pause ---------- */
  askCard(from, name) {
    let c = $('#askPause');
    if (!c) { document.body.insertAdjacentHTML('beforeend', '<div id="askPause" role="alertdialog" aria-live="assertive" hidden><b></b><div><button class="btn btn-prime btn-sm" type="button" data-nav data-ap="yes"><i data-lucide="pause"></i>Pause for everyone</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-ap="no">Not now</button></div></div>'); c = $('#askPause'); icons();
      c.addEventListener('click', (e) => { const b = e.target.closest('[data-ap]'); if (!b) return; c.hidden = true; clearTimeout(this.apT); if (b.dataset.ap === 'yes') { if (!video.paused) video.pause(); Party.send({ t: 'askpause-ok', name: Party.name() }); } else Party.send({ t: 'askpause-no', _to: c.dataset.from }); }); }
    $('b', c).textContent = `${name} asked to pause`; c.dataset.from = from; c.hidden = false;
    if (IS_TV) setTimeout(() => { const f = $('[data-ap="yes"]', c); if (f && typeof Nav !== 'undefined') Nav.focus(f, true); }, 40);
    clearTimeout(this.apT); this.apT = setTimeout(() => { c.hidden = true; }, 15000);
  },
  html() {
    if (!Party.code) return '';
    const phoneHint = IS_TV || !this.ok() ? '<p class="cam-hint">On a TV, your phone can be the camera: open the phone remote and tap Party camera.</p>' : '';
    return `<button class="btn ${this.cam ? 'btn-prime' : 'btn-ghost'} btn-sm" type="button" id="pyCam" data-nav aria-pressed="${!!this.cam}"><i data-lucide="${this.cam ? 'video' : 'video-off'}"></i>${this.cam ? 'Camera on' : 'Camera off'}</button><button class="btn btn-ghost btn-sm" type="button" id="pyFaces" data-nav aria-pressed="${this.shown()}"><i data-lucide="${this.shown() ? 'eye' : 'eye-off'}"></i>${this.shown() ? 'Faces shown' : 'Faces hidden'}</button>${phoneHint}`;
  },
  init() {
    if (CFG.partyCams === undefined) CFG.partyCams = true;
    if (CFG.stubFace === undefined) CFG.stubFace = false;
    if (CFG.camSelf === undefined) CFG.camSelf = true;
    const pf = Party.peerFor;
    Party.peerFor = function (id, name) {
      const had = this.peers.has(id), p = pf.call(this, id, name);
      if (!had && p && p.pc) {
        const o = p.pc.ontrack;
        p.pc.ontrack = (e) => { if (e.track && e.track.kind === 'video') { Cams.videoIn(p, e.track); return; } if (o) o.call(p.pc, e); };
        // after its hello says whether it is a phone
        setTimeout(() => { Cams.lane(p); Cams.send(p); if (Cams.cam) Party.send({ t: 'cam', on: true, face: !!CFG.stubFace, _to: p.id }); }, 600);
      }
      return p;
    };
    const om = Party.onMsg;
    Party.onMsg = function (m) {
      const from = m && m._from, p = from && this.peers.get(from);
      if (m && m.t === 'cam' && p && (!m._to || m._to === this.me.id)) { p.camOn = !!m.on; p.face = !!m.face; if (m.on) Cams.showPeer(p); else Cams.untile(p.id); return; }
      if (m && m.t === 'askpause' && p && this.isHost() && !video.paused) { Cams.askCard(from, String(m.name || p.name || 'Someone').slice(0, 40)); return; }
      if (m && m.t === 'askpause-no' && m._to === this.me.id) { toast('The host kept playing', 'info', 2400, 'ap'); return; }
      if (m && m.t === 'askpause-ok') return;
      return om.call(this, m);
    };
    const loc = Party.local;
    Party.local = function (ev) {
      if (ev === 'pause' && this.code && !this.applying && !this.isHost() && this.peers.size && P.ctx) {
        const now = Date.now(); if (now - (this.askAt || 0) > 8000) { this.askAt = now; this.send({ t: 'askpause', name: this.name() }); toast('You asked the host to pause for everyone', 'info', 2600, 'ap'); }
        return;
      }
      return loc.call(this, ev);
    };
    const dp = Party.dropPeer;
    Party.dropPeer = function (id) { Cams.untile(id); return dp.call(this, id); };
    const lv = Party.leave;
    Party.leave = function (...a) { const was = this.code; const r = lv.apply(this, a); if (was && !this.code) { Cams.stopCam(); [...Cams.tiles.keys()].forEach((k) => Cams.untile(k)); } return r; };
    const vad = Party.vad;
    Party.vad = function (...a) { const r = vad.apply(this, a); Cams.tiles.forEach((t, id) => t.classList.toggle('talk', this.speaking.has(id))); $$('.pyf-grid .cam-t').forEach((f) => f.classList.toggle('talk', this.speaking.has(f.dataset.pid))); return r; };
    const rn = Party.render;
    Party.render = function (...a) {
      const r = rn.apply(this, a);
      [$('#partyDrawerBody'), $('#partyLayerBody')].forEach((root) => {
        const mic = root && $('#pyMic', root); if (!mic || $('#pyCam', root)) return;
        mic.insertAdjacentHTML('afterend', Cams.html());
        const c = $('#pyCam', root), f = $('#pyFaces', root);
        if (c) c.addEventListener('click', () => Cams.toggle());
        if (f) f.addEventListener('click', () => { setCfg('partyCams', !Cams.shown()); Cams.paint(); Party.render(); });
        icons();
      });
      Cams.paint(); return r;
    };
    // the paired phone hears about the party whenever there is one, so it can be the camera; vo says if voices go there too
    const st = Remote.state.bind(Remote);
    Remote.state = function () {
      const s = st();
      if (Party.code) { s.pv = s.pv || { code: Party.code, tv: Party.me.id, name: Party.name() }; s.pv.vo = !!CFG.partyVoicePhone; }
      return s;
    };
    // group stub: faces of the people who said yes, kept with the stub (tiny JPEG stills, on this device only)
    if (typeof Stubs !== 'undefined') {
      const keep = Stubs.keep.bind(Stubs);
      Stubs.keep = function (ctx) {
        const n = this.list().length; keep(ctx); const l = this.list();
        if (l.length > n && Party.code) { const f = Cams.faces(); if (f.length) { l[0].faces = f; Store.set('stubs', l); } }
      };
      const draw = Stubs.draw.bind(Stubs);
      Stubs.draw = function (x) {
        const c = draw(x); if (!x || !x.faces || !x.faces.length) return c;
        const g = c.getContext('2d'), y = c.height - 150, imgs = x.faces.map((f) => { const i = new Image(); i.src = f.img; return i; });
        // data: images decode synchronously enough after load; draw what is ready, the rest is skipped
        imgs.forEach((im, i) => { try { if (!im.complete) return; const X = 90 + i * 96; g.save(); g.beginPath(); g.roundRect(X, y, 80, 60, 10); g.clip(); g.drawImage(im, X, y, 80, 60); g.restore(); } catch (e) { /* skip */ } });
        return c;
      };
      // make sure face stills are decoded before a stub with faces is saved
      const save = Stubs.save.bind(Stubs);
      Stubs.save = function (x) {
        if (!x || !x.faces || !x.faces.length) return save(x);
        Promise.all(x.faces.map((f) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = ok; i.src = f.img; }))).then(() => save(x));
      };
    }
    scAddRows('playback', null, [
      { group: 'Watch party' },
      { key: 'partyCams', label: 'Show friends’ cameras', help: 'Faces of friends who turned their camera on, in a slim column on the left. They get big in the lobby and once the credits roll. Video goes straight between devices and is never recorded.', type: 'toggle' },
      { key: 'camSelf', label: 'Show me among the faces', help: 'Your own picture next to your friends’, so you can see how you look. Turn it off to see only them.', type: 'toggle' },
      { key: 'stubFace', label: 'Put my face on party ticket stubs', help: 'When your camera is on, the party’s stub keeps a small still of you. Only people who turn this on appear.', type: 'toggle' },
    ]);
    CFG_HOOKS.push((k, v) => { if (k === 'partyCams' || k === 'camSelf') Cams.paint(); if (k === 'stubFace' && Cams.cam) Cams.say(true); });
    clearInterval(this.modeT); this.modeT = setInterval(() => this.mode(), 1500);
  },
};
Cams.init();
// fetch relay logins as the party starts; peers appear only after the first hello round trip, so they are ready by then
{ const j = Party.join; Party.join = function (...a) { MkIce.load(); return j.apply(this, a); }; }
// Help › Troubleshooting: the camera questions people will ask
if (typeof Troubleshoot !== 'undefined' && Array.isArray(Troubleshoot.TOPICS) && !Troubleshoot.TOPICS.some((t) => t[0] === 'partycam')) {
  Troubleshoot.TOPICS.push(['partycam', 'video', 'Party camera won’t start, or I can’t see someone', 'camera webcam video face party call see each other black tile permission phone',
    ['The camera only works on an https address, such as <b>app.mkcinema.app</b>, or in the Android or Windows app. A plain http address, like a home server, can’t use it.',
      'If the browser asked and you said no, allow the camera in the site settings (the icon left of the address), then tap <b>Camera</b> again. In the Android app, allow it under Android Settings › Apps › MKCinema › Permissions.',
      'On a TV, use your phone as the camera: open the phone remote, tap <b>Party camera</b>, then <b>Camera</b>.',
      'Can’t see one person? Check <b>Faces shown</b> is on in the party panel, and that they turned their camera on. Someone on mobile data may take a few seconds longer to appear.',
      'Your own face shows once. If you’d rather not see yourself, turn off <b>Show me among the faces</b> in Settings › Playback › Watch party.'],
    [['Party cameras', 'video', 'row:playback:partyCams'], ['Show me among the faces', 'eye', 'row:playback:camSelf']]]);
}
