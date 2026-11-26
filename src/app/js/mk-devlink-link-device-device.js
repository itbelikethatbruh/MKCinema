
'use strict';
/* ---------------- Link a device (2.86) ----------------
   A device that already holds the account's synced keys hands them to a new one, so nobody types a password on a TV
   and accounts that sign in with Google (they have no password to unlock keys with) get their keys everywhere.
   1. The new device makes a one-time key pair and shows a code: the first 40 bits of a hash of its public key, as
      8 letters and digits, plus a QR code of the same code.
   2. It asks on the account's private sync channel, which only devices signed in to the same account can join.
   3. The device that has the keys gets the code from the person (typed, scanned in the app, or from the QR link),
      finds the request whose public key matches it, and sends the vault key sealed to that public key
      (ECDH P-256 -> HKDF-SHA256 -> AES-GCM). The server only carries public keys and sealed bytes.
   4. The new device keeps the key only after it has opened the account's sealed keys with it. */
const DevLink = {
  TTL: 10 * 60000,
  me: null, // this device, asking: { id, uid, priv, pub, code, until, t, busy }
  asks: new Map(), // requests heard from the account's other devices: code -> { id, pub, name, at }
  give: null, // this device, giving: { id, done }
  hinted: new Set(), cam: null, mode: '',
  ok: () => !!(window.crypto && crypto.subtle && typeof Kdf2 !== 'undefined' && typeof Account !== 'undefined'),
  b32(bytes) { let bits = 0, n = 0, out = ''; for (const x of bytes) { n = ((n << 8) | x) & 0xffff; bits += 8; while (bits >= 5) { out += Kdf2.ALPHA[(n >> (bits - 5)) & 31]; bits -= 5; } } return out; },
  async codeOf(pub) { return this.b32((await Kdf2.hash(`mkc-link|${pub}`)).slice(0, 5)); },
  norm(s) { s = String(s || ''); const m = /keylink=([0-9A-Za-z-]+)/.exec(s); if (m) s = m[1]; return s.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0'); },
  fmt: (c) => `${c.slice(0, 4)}-${c.slice(4)}`,
  name() {
    const ua = navigator.userAgent;
    if (IS_TV) return 'TV';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet';
    if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows computer';
    if (/CrOS/.test(ua)) return 'Chromebook';
    if (/Linux/.test(ua)) return 'Linux computer';
    return 'Browser';
  },
  /* this device holds the account's vault key and can hand it on */
  canGive() { const A = Account, rec = A.keyRec; return !!(A.user && rec && rec.v === 2 && A.keysSync()); },
  /* the account has sealed keys this device cannot open */
  needs() { const A = Account; return !!(A.user && Kdf2.isBox(A.remoteSecrets) && CFG.cloudSync !== false && CFG.syncKeys !== false && !A.canWriteSecrets()); },
  send(m) { return typeof Account.liveSend === 'function' && Account.liveSend('link', m); },
  async secret(priv, peer, askPub, givePub, uid, id) {
    const pk = await crypto.subtle.importKey('raw', b64url.dec(peer), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pk }, priv, 256));
    return Kdf2.aes(await Kdf2.hkdf(bits, `mkc-link|${uid}|${id}|${askPub}|${givePub}`));
  },
  async pair() {
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    return { priv: kp.privateKey, pub: b64url.enc(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))) };
  },
  /* messages on the account's private channel (live sync block) */
  onMsg(p) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || p.id.length > 40) return;
    if (p.t === 'ask') this.heard(p).catch(() => {});
    else if (p.t === 'key' && this.me && p.id === this.me.id) this.take(p);
    else if ((p.t === 'ok' || p.t === 'fail') && this.give && p.id === this.give.id) this.give.done(p);
  },
  async heard(p) {
    if (typeof p.pub !== 'string' || p.pub.length < 80 || p.pub.length > 120 || !this.ok()) return;
    const code = await this.codeOf(p.pub), now = Date.now();
    for (const [c, a] of this.asks) if (now - a.at > this.TTL) this.asks.delete(c);
    this.asks.set(code, { id: p.id, pub: p.pub, name: typeof p.name === 'string' ? p.name.slice(0, 40) : '', at: now });
    // a device that could answer says so once per request, unless the linking screen is already open
    if (!this.hinted.has(p.id) && this.canGive() && !this.give && !this.open()) { this.hinted.add(p.id); this.hint(); }
  },
  open() { const el = $('#dvlLayer'); return !!(el && !el.hidden); },
  hint() {
    const box = $('#toasts'); if (!box || $('#toasts .dvl-hint')) return;
    const el = document.createElement('div'); el.className = 'toast glass-solid t-info dvl-hint'; el.setAttribute('role', 'status');
    el.innerHTML = '<i data-lucide="link"></i><span>Another device wants to link to your account.</span><span class="as-b"><button class="btn btn-prime btn-sm" type="button" data-nav data-dvl="go">Link it</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-dvl="no">Not now</button></span>';
    box.appendChild(el); icons();
    el.querySelector('[data-dvl="go"]').onclick = () => { el.remove(); this.openGive(); };
    el.querySelector('[data-dvl="no"]').onclick = () => el.remove();
    setTimeout(() => el.remove(), 20000);
  },

  /* ---- the new device ---- */
  layer() {
    $$('#toasts .dvl-hint, #toasts .as-lock').forEach((x) => x.remove()); // the screen itself says it now
    X8.layer('dvlLayer', { label: 'Link a device', icon: 'link', eyebrow: 'Your devices' });
    X8.onClose.dvlLayer = () => { this.stop(); this.camStop(); this.mode = ''; };
    return X8.body('dvlLayer');
  },
  openTake() {
    Usage.add('feat', 'devlink_open');
    if (!Account.user) { toast('Sign in first', 'err'); return; }
    this.layer(); this.mode = 'take'; X8.open('dvlLayer'); this.start();
  },
  async start() {
    this.stop();
    if (!this.ok()) { this.paintTake('nocrypto'); return; }
    let kp; try { kp = await this.pair(); } catch (e) { this.paintTake('nocrypto'); return; }
    const me = this.me = { id: rid(12), uid: Account.user.id, ...kp, code: await this.codeOf(kp.pub), until: Date.now() + this.TTL, t: 0, busy: false };
    const tick = () => {
      if (this.me !== me) return;
      if (Date.now() > me.until) { this.stop(); this.paintTake('expired'); return; }
      if (!me.busy && !this.needs() && Account.canWriteSecrets()) { this.stop(); this.paintTake('done'); return; } // unlocked another way
      this.send({ t: 'ask', id: me.id, pub: me.pub, name: this.name() });
      me.t = setTimeout(tick, 3000);
    };
    this.paintTake(); tick();
  },
  stop() { if (this.me) clearTimeout(this.me.t); this.me = null; },
  paintTake(st) {
    const b = X8.body('dvlLayer'); if (!b || this.mode !== 'take') return;
    const me = this.me, rc = '<p class="tour-note">No other device has your keys? <button class="linkish" type="button" data-nav id="dvl-rc">Use your recovery code</button></p>';
    let h = '<h2 class="x8-h">Link this device</h2>';
    if (st === 'nocrypto') h += `<p class="sc-p">This browser can’t link devices. Use your recovery code in Settings › Debrid instead.</p>${rc}`;
    else if (st === 'expired') h += `<p class="sc-p">That code expired.</p><div class="inrow"><button class="btn btn-prime" type="button" data-nav id="dvl-again"><i data-lucide="refresh-cw"></i>New code</button></div>`;
    else if (st === 'done') h += '<p class="sc-p">This device is linked. Your keys and addons are here now.</p><div class="inrow"><button class="btn btn-prime" type="button" data-nav data-x8close>Done</button></div>';
    else if (st === 'fail') h += `<p class="sc-p">That didn’t work. The other device may have older keys. Sync it, then try again.</p><div class="inrow"><button class="btn btn-prime" type="button" data-nav id="dvl-again"><i data-lucide="refresh-cw"></i>New code</button></div>${rc}`;
    else if (!me) h += '<p class="sc-p">Getting a code ready…</p>';
    else {
      let qr = ''; const link = appLink(`keylink=${me.code}`); if (link) { try { qr = `<div class="qr-wrap sm">${QR.svg(link)}</div>`; } catch (e) { qr = ''; } }
      h += `<p class="sc-p">Use a phone or computer that already has your keys and is signed in to the same account. Scan this code with it, or choose Link a new device in Settings › Account and type the code.</p>
        <div class="dvl-qr">${qr}<div><div class="dvl-code" translate="no">${esc(this.fmt(me.code))}</div><p class="tour-note">The code works for 10 minutes. Your keys travel sealed, and only this device can open them.</p></div></div>${rc}`;
    }
    b.innerHTML = h; icons();
    const again = $('#dvl-again'); if (again) again.onclick = () => this.start();
    const r = $('#dvl-rc'); if (r) r.onclick = () => { X8.close('dvlLayer'); openSettings('debrid'); setTimeout(() => { const i = $('#rc-in'); if (i) { try { i.scrollIntoView({ block: 'center' }); } catch (e) { /* old browser */ } i.focus(); } }, 150); };
    if (IS_TV) { try { Nav.settle(); } catch (e) { /* no remote focus here */ } }
  },
  async take(p) {
    const me = this.me, A = Account; if (!me || me.busy || !A.user || A.user.id !== me.uid) return;
    me.busy = true;
    try {
      if (typeof p.pub !== 'string' || typeof p.iv !== 'string' || typeof p.ct !== 'string') throw new Error('incomplete');
      const key = await this.secret(me.priv, p.pub, me.pub, p.pub, me.uid, me.id);
      const got = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64url.dec(p.iv), additionalData: Kdf2.aad(me.uid, 'link') }, key, b64url.dec(p.ct))));
      if (!got || typeof got.vid !== 'string' || typeof got.r !== 'string') throw new Error('incomplete');
      const raw = b64url.dec(got.r);
      // only a key that opens this account's sealed keys is kept
      if (!Kdf2.isBox(A.remoteSecrets) || A.remoteSecrets.vid !== got.vid) await A.pull({ force: true, quiet: true });
      const box = A.remoteSecrets;
      if (!Kdf2.isBox(box) || box.vid !== got.vid) throw new Error('older keys');
      if (!(await SyncCrypt.open({ uid: me.uid, v: 2, vid: got.vid, salt: `v2:${got.vid}`, wraps: box.wraps, key: await Kdf2.aes(raw) }, box))) throw new Error('wrong key');
      // a password reset left the vault wrapped by the old password: the new one (typed here earlier) wraps it again
      const lost = A.kdfLost; let wraps = box.wraps, rewrap = false;
      if (lost && lost.d && lost.uid === me.uid) { wraps = { ...box.wraps, at: SyncClock.now(), pw: { it: Kdf2.ITER, ...(await Kdf2.wrapWith(lost.d.wrap, raw, me.uid)) } }; rewrap = true; }
      A.keyRec = await Kdf2.keep(me.uid, got.vid, raw, wraps); A.secCache = null; A.kdfLost = null; A.keyChecked = true; A.boxLocked = false;
      this.send({ t: 'ok', id: me.id }); this.stop();
      A.unlocking = true; try { await A.pull({ force: true, quiet: true }); } finally { A.unlocking = false; }
      if (rewrap) { A.forceSeal = true; const m = A.m(); m.at.secrets = Math.max(SyncClock.now(), (m.rat.secrets || 0) + 1); A.saveMeta(); await A.push({ force: true }); }
      this.paintTake('done'); Usage.add('feat', 'devlink_done'); if (!this.open()) toast('This device is linked. Your keys and addons are here now', 'ok', 6000);
      try { A.render(); if (!$('#settings').hidden && typeof renderSettingsBody === 'function') renderSettingsBody(); } catch (e) { /* closed */ }
    } catch (e) {
      this.send({ t: 'fail', id: me.id }); if (this.me === me) { this.stop(); this.paintTake('fail'); }
    }
  },

  /* ---- the device that has the keys ---- */
  openGive(code, ask) {
    this.layer(); this.mode = 'give'; X8.open('dvlLayer'); this.paintGive(code || '');
    if (code && ask) this.confirm(code);
  },
  paintGive(code) {
    const b = X8.body('dvlLayer'); if (!b || this.mode !== 'give') return;
    const scan = 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !IS_TV;
    b.innerHTML = `<h2 class="x8-h">Link a new device</h2><p class="sc-p">On the new phone, TV or computer, sign in to the same account and choose Link this device. Then type the code it shows${scan ? ', or scan its QR code' : ''}.</p>
      <div class="dvl-in" id="dvl-row"><input class="inp mono" id="dvl-code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX" aria-label="Code on the new device" value="${esc(code ? this.fmt(this.norm(code)) : '')}"><button class="btn btn-prime" type="button" data-nav id="dvl-go"><i data-lucide="link"></i>Link</button>${scan ? '<button class="btn btn-ghost" type="button" data-nav id="dvl-scan"><i data-lucide="scan-line"></i>Scan</button>' : ''}</div>
      <p class="tour-note" id="dvl-msg" role="status"></p>`;
    icons();
    const inp = $('#dvl-code'), go = () => this.confirm(inp.value);
    $('#dvl-go').onclick = go;
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); } });
    const sc = $('#dvl-scan'); if (sc) sc.onclick = () => this.scan();
    setTimeout(() => { try { inp.focus(); } catch (e) { /* gone */ } }, 60);
  },
  say(t) { const el = $('#dvl-msg'); if (el) el.textContent = t; },
  async find(code) {
    if (code.length !== 8) throw new Error('Type the 8 letters and numbers shown on the new device.');
    if (!this.canGive()) throw new Error(Account.keyRec && Account.keyRec.v !== 2 ? 'This device keeps your keys in an older format. Sign out and in again here, then try once more.' : 'This device has no synced keys to share. Unlock them here first.');
    let a = this.asks.get(code);
    // the new device asks every 3 s: a code no request matches fails after 3.5 s once others are heard, else after 12 s
    for (let i = 0; i < 24 && !(a && Date.now() - a.at < 15000) && !(i >= 7 && this.asks.size); i++) { await sleep(500); a = this.asks.get(code); }
    if (!a || Date.now() - a.at > this.TTL) throw new Error('No device is showing that code right now. Check the code, and keep the new device on its Link this device screen. Both need to be signed in to the same account.');
    return a;
  },
  async confirm(raw) {
    const code = this.norm(raw), btn = $('#dvl-go'); if (btn) btn.disabled = true;
    this.say('Looking for the new device…');
    try {
      const a = await this.find(code);
      const b = X8.body('dvlLayer'); if (!b || this.mode !== 'give') return;
      b.innerHTML = `<h2 class="x8-h">Send your keys to this device?</h2><p class="sc-p">Your synced keys and addons go to the device showing this code. Only continue if it is in front of you.</p>
        <div class="dvl-code" translate="no">${esc(this.fmt(code))}</div>${a.name ? `<p class="tour-note" translate="no">${esc(a.name)}</p>` : ''}
        <div class="inrow"><button class="btn btn-prime" type="button" data-nav id="dvl-yes"><i data-lucide="link"></i>Link it</button><button class="btn btn-ghost" type="button" data-nav id="dvl-no">Cancel</button></div><p class="tour-note" id="dvl-msg" role="status"></p>`;
      icons();
      $('#dvl-no').onclick = () => X8.close('dvlLayer');
      $('#dvl-yes').onclick = async () => {
        $('#dvl-yes').disabled = true; this.say('Sending…');
        try {
          const r = await this.hand(a);
          if (!r) throw new Error('The new device did not answer. Keep its code on screen and try again.');
          if (r.t !== 'ok') throw new Error('The new device could not use the keys. Sync this device, then try again.');
          this.asks.delete(code);
          b.innerHTML = '<h2 class="x8-h">Linked</h2><p class="sc-p">The new device has your keys and addons now.</p><div class="inrow"><button class="btn btn-prime" type="button" data-nav data-x8close>Done</button></div>';
        } catch (e) { this.say(e.message || String(e)); const y = $('#dvl-yes'); if (y) y.disabled = false; }
      };
      setTimeout(() => { try { $('#dvl-yes').focus(); } catch (e) { /* gone */ } }, 60);
    } catch (e) { this.say(e.message || String(e)); if (btn) btn.disabled = false; }
  },
  async hand(a) {
    const A = Account, uid = A.user.id, rec = A.keyRec, kp = await this.pair();
    const key = await this.secret(kp.priv, a.pub, a.pub, kp.pub, uid, a.id), iv = crypto.getRandomValues(new Uint8Array(12));
    const body = new TextEncoder().encode(JSON.stringify({ vid: rec.vid, r: b64url.enc(await Kdf2.raw(rec)) }));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Kdf2.aad(uid, 'link') }, key, body));
    const answer = new Promise((res) => { this.give = { id: a.id, done: res }; setTimeout(() => res(null), 20000); });
    if (!this.send({ t: 'key', id: a.id, pub: kp.pub, iv: b64url.enc(iv), ct: b64url.enc(ct) })) { this.give = null; throw new Error('Could not reach your account. Check the connection and try again.'); }
    try { return await answer; } finally { this.give = null; }
  },
  async scan() {
    if (this.cam) return;
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); } catch (e) { this.say('MKCinema could not use the camera. Type the code instead.'); return; }
    const row = $('#dvl-row'); if (!row || this.mode !== 'give') { stream.getTracks().forEach((t) => t.stop()); return; }
    this.cam = stream;
    const v = document.createElement('video'); v.className = 'dvl-cam'; v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = stream;
    row.after(v); v.play().catch(() => {});
    let det; try { det = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { this.camStop(); this.say('This browser can’t scan codes. Type the code instead.'); return; }
    this.say('Point the camera at the code on the new device.');
    const loop = async () => {
      if (this.cam !== stream) return;
      try { const hit = (await det.detect(v)).map((x) => /keylink=([0-9A-Za-z-]{8,9})/.exec(x.rawValue || '')).find(Boolean); if (hit) { this.camStop(); const i = $('#dvl-code'); if (i) i.value = this.fmt(this.norm(hit[1])); this.confirm(hit[1]); return; } } catch (e) { /* not ready yet */ }
      setTimeout(loop, 250);
    };
    loop();
  },
  camStop() { const s = this.cam; this.cam = null; if (s) s.getTracks().forEach((t) => t.stop()); $$('.dvl-cam').forEach((v) => v.remove()); },
  /* opened from the QR code with the phone's camera app */
  async fromLink(raw) {
    const code = this.norm(raw);
    if (code.length !== 8) { toast('That link code isn’t complete. Scan it again.', 'err'); return; }
    try { if (!Account.client && Account.ensure) await Account.ensure(); } catch (e) { /* not set up */ }
    for (let i = 0; i < 30 && Account.user && !Account.loadedOnce; i++) await sleep(300);
    if (Account.user && this.canGive()) { this.openGive(code, true); return; }
    this.layer(); this.mode = 'info'; X8.open('dvlLayer');
    X8.body('dvlLayer').innerHTML = `<h2 class="x8-h">Link a new device</h2><p class="sc-p">${Account.user ? 'This copy of MKCinema doesn’t have your keys either.' : 'MKCinema isn’t signed in here.'} Open MKCinema where you are signed in and your keys work, choose Link a new device in Settings › Account, and type this code:</p><div class="dvl-code" translate="no">${esc(this.fmt(code))}</div><div class="inrow"><button class="btn btn-prime" type="button" data-nav data-x8close>OK</button></div>`;
  },
};
