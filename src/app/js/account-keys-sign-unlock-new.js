
/* 2.62 account keys: sign-in, unlock, new password and "Sign in with your phone" use the login key derived on the
   device; a recovery code can bring synced keys back after a password reset. Kdf2.UPGRADE turns on the move of
   existing accounts, which happens the next time each person types their password. */
(() => {
  if (typeof Account === 'undefined' || typeof Kdf2 === 'undefined' || Account._kdf2) return;
  Account._kdf2 = true;
  const A = Account;
  const emailUser = () => { const u = A.user, prov = u && u.app_metadata && u.app_metadata.provider; return !!(u && u.email && (!prov || prov === 'email')); };
  const stamp = () => (typeof SyncClock !== 'undefined' ? SyncClock.now() : Date.now());
  const bump = () => { const m = A.m(); m.at.secrets = Math.max(stamp(), (m.rat.secrets || 0) + 1); A.saveMeta(); };
  const rerenderSettings = () => { try { if (!$('#settings').hidden && typeof renderSettingsBody === 'function') renderSettingsBody(); } catch (e) { /* closed */ } };
  const samePw = (e) => /same_password|different from the old/i.test(`${e && e.code} ${e && e.message}`);

  /* ---- recovery code dialog ---- */
  const showCode = (code) => {
    $('#rcCode').innerHTML = String(code).replace(/[^A-Z0-9-]/g, '').split('-').join('-<wbr>'); openLayer('rcLayer');
    $('#rcCopy').onclick = () => { try { navigator.clipboard.writeText(code).then(() => toast('Recovery code copied', 'ok')); } catch (e) { toast('Select the code and copy it', 'info'); } };
    $('#rcSave').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`MKCinema recovery code\n\n${code}\n\nAccount: ${(A.user && A.user.email) || ''}\nKeep this safe. It brings back your synced keys if you forget your password.\n`], { type: 'text/plain' })); a.download = 'MKCinema-recovery-code.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
    $('#rcDone').onclick = () => closeLayer('rcLayer');
    $$('#rcLayer [data-close]').forEach((b) => { b.onclick = () => closeLayer('rcLayer'); });
    setTimeout(() => { try { $('#rcDone').focus(); } catch (e) { /* gone */ } }, 60);
  };
  A.showRecoveryCode = showCode;

  /* ---- sign in ---- */
  A.signIn = function () {
    return this.run('Sign in', async () => {
      const { email, password } = this.creds(); if (!password) throw new Error('Enter your password');
      this.pendingPass = password; let done; this.kdfD = new Promise((res) => { done = res; });
      let r; try { r = await Kdf2.signIn(this.client, email, password); } catch (e) { done(null); this.pendingPass = ''; this.kdfD = null; throw e; }
      done(r.d);
      if (r.error) { this.pendingPass = ''; this.kdfD = null; throw r.error; }
      this.kdf = { mode: r.mode, d: r.d };
      setTimeout(() => { if (this.pendingPass && this.user) this.pull({ force: true, quiet: true }); }, 1500);
    });
  };
  const signUp1 = A.signUp;
  A.signUp = function () {
    if (!Kdf2.UPGRADE) return signUp1.apply(this, arguments);
    return this.run('Create account', async () => {
      const { email, password } = this.creds(); if (password.length < 10) throw new Error('Use a password of at least 10 characters');
      const d = await Kdf2.derive(email, password); this.kdfD = Promise.resolve(d); this.kdf = { mode: 2, d }; this.pendingPass = password;
      const { data, error } = await this.client.auth.signUp({ email, password: d.login, options: { ...(this.canRedirect() ? { emailRedirectTo: this.redirectTo() } : {}), data: { mkc_kdf: 2, mkc_salt: d.salt } } }); if (error) throw error;
      await Kdf2.markKnown(email);
      return data.session ? '' : 'Check your inbox to confirm your email, then sign in.';
    });
  };

  /* ---- the password just typed opens the account's vault (or queues the move to it) ---- */
  const derive1 = A.derive;
  A.derive = async function (uid, box) {
    const pw = this.pendingPass;
    if (!pw || !emailUser() || !(window.crypto && crypto.subtle)) return derive1.call(this, uid, box);
    let d; try { d = await (this.kdfD || (this.kdfD = Kdf2.derive(this.user.email, pw, Kdf2.metaSalt(this.user) || undefined))); } catch (e) { d = null; }
    if (!d) return derive1.call(this, uid, box);
    const mode = this.kdf && this.kdf.mode;
    if (!Kdf2.isBox(box)) {
      await derive1.call(this, uid, box);
      if (Kdf2.UPGRADE) this.kdfUp = { uid, d, pass: mode !== 2 };
      return;
    }
    this.pendingPass = '';
    const vault = await Kdf2.unwrapWith(d.wrap, box.wraps.pw, uid);
    if (vault) {
      await Kdf2.keep(uid, box.vid, vault, box.wraps); this.kdfLost = null; await Kdf2.markKnown(this.user.email);
      if (Kdf2.UPGRADE && mode === 1) this.kdfUp = { uid, d, pass: true, only: true };
      return;
    }
    // the password does not open the vault (it was reset by email): nothing changes until the recovery code or "Start fresh"
    this.kdfLost = { uid, d };
  };
  const pull1 = A.pull;
  A.pull = function () { return pull1.apply(this, arguments).then((r) => (this.kdfUp && !this.kdfBusy ? this.upgrade().then(() => r) : r)); };

  /* ---- move an account to format 2: new vault, saved first, then the login key replaces the password ---- */
  A.upgrade = async function () {
    const up = this.kdfUp; this.kdfUp = null;
    if (!up || !this.user || this.user.id !== up.uid || !emailUser()) return;
    this.kdfBusy = true;
    try {
      let code = '';
      if (!up.only) {
        if (Kdf2.isBox(this.remoteSecrets)) return; // another device already moved it
        if (SyncCrypt.isBox(this.remoteSecrets) && !this.canWriteSecrets()) return; // locked old box: the old flow handles it first
        const v = await Kdf2.newVault(up.uid, up.d.wrap);
        this.keyRec = await Kdf2.keep(up.uid, v.vid, v.vault, v.wraps); this.secCache = null; this.forceSeal = true; this.keyChecked = true; bump();
        await this.push({ force: true });
        if (!Kdf2.isBox(this.remoteSecrets) || this.remoteSecrets.vid !== v.vid) return; // not saved: tried again at the next sign-in
        code = v.code;
      }
      if (up.pass) {
        const { error } = await this.client.auth.updateUser({ password: up.d.login, data: { mkc_kdf: 2, mkc_salt: up.d.salt } });
        if (error && !samePw(error)) { if (code) showCode(code); return; }
      }
      await Kdf2.markKnown(up.d.email);
      if (code) showCode(code);
    } catch (e) { /* tried again at the next sign-in */ } finally { this.kdfBusy = false; rerenderSettings(); }
  };

  /* ---- unlock on a device with a restored session ---- */
  A.unlock = async function (pass) {
    if (!this.user || !this.client) throw new Error('Sign in first');
    const c = this.config(); await this.loadLib();
    const tmp = window.supabase.createClient(c.url.replace(/\/+$/, ''), c.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mkc:unlock' } });
    const r = await Kdf2.signIn(tmp, this.user.email || '', pass, null, !!((this.user.user_metadata && this.user.user_metadata.mkc_kdf === 2) || Kdf2.isBox(this.remoteSecrets)));
    if (r.error) throw new Error(/invalid/i.test(r.error.message || '') ? 'That password did not work' : r.error.message);
    tmp.auth.signOut({ scope: 'local' }).catch(() => {});
    this.kdf = { mode: r.mode, d: r.d }; this.kdfD = Promise.resolve(r.d);
    this.pendingPass = pass; this.unlocking = true;
    try { await this.pull({ force: true, quiet: true }); } finally { this.unlocking = false; }
    if (this.kdfLost) return 'Your password changed since your keys were saved. Enter your recovery code below.';
    return this.canWriteSecrets() ? 'Synced keys unlocked on this device' : 'Could not unlock your keys. Try again.';
  };

  /* ---- recovery code: brings the vault back, and re-wraps it with the current password when that is known ---- */
  A.recover = async function (code) {
    const box = this.remoteSecrets, uid = this.user && this.user.id;
    if (!uid || !Kdf2.isBox(box)) throw new Error('There are no synced keys to bring back');
    const k = await Kdf2.codeKey(code); if (!k) throw new Error('That code is not complete. It has 26 letters and digits after MKC.');
    const vault = await Kdf2.unwrapWith(k, box.wraps.rc, uid); if (!vault) throw new Error('That recovery code did not work');
    const lost = this.kdfLost; let wraps = box.wraps;
    if (lost && lost.d) wraps = { ...box.wraps, at: stamp(), pw: { it: Kdf2.ITER, ...(await Kdf2.wrapWith(lost.d.wrap, vault, uid)) } };
    this.keyRec = await Kdf2.keep(uid, box.vid, vault, wraps); this.secCache = null; this.kdfLost = null; this.keyChecked = true;
    this.unlocking = true; try { await this.pull({ force: true, quiet: true }); } finally { this.unlocking = false; }
    if (wraps !== box.wraps) { this.forceSeal = true; bump(); await this.push({ force: true }); }
    return 'Synced keys are back on this device';
  };
  /* ---- start over: a new vault with this device's keys (keys only the old vault held are gone) ---- */
  A.startFresh = async function () {
    const lost = this.kdfLost, uid = this.user && this.user.id; if (!uid || !lost || !lost.d) throw new Error('Enter your password first');
    const v = await Kdf2.newVault(uid, lost.d.wrap);
    this.keyRec = await Kdf2.keep(uid, v.vid, v.vault, v.wraps); this.secCache = null; this.kdfLost = null; this.forceSeal = true; this.keyChecked = true; bump();
    await this.push({ force: true });
    showCode(v.code);
    return 'Your keys on this device are synced again';
  };
  /* ---- a new recovery code (the old one stops working) ---- */
  A.newRecoveryCode = async function () {
    const rec = this.keyRec, uid = this.user && this.user.id; if (!uid || !rec || rec.v !== 2 || !this.canWriteSecrets()) throw new Error('Unlock your synced keys first');
    const code = Kdf2.newCode(), raw = await Kdf2.raw(rec);
    const wraps = { ...Kdf2.freshWraps(rec), at: stamp(), rc: await Kdf2.wrapWith(await Kdf2.codeKey(code), raw, uid) };
    this.keyRec = await Kdf2.keep(uid, rec.vid, raw, wraps); this.secCache = null; this.forceSeal = true; bump();
    await this.push({ force: true });
    if (!Kdf2.isBox(this.remoteSecrets) || !this.remoteSecrets.wraps || this.remoteSecrets.wraps.rc.ct !== wraps.rc.ct) throw new Error('Could not save the new code. Check your connection and try again.');
    showCode(code); return '';
  };

  /* ---- new password after a reset link ---- */
  const newPassword1 = A.newPassword;
  A.newPassword = function () {
    const box = this.remoteSecrets, meta = (this.user && this.user.user_metadata) || {};
    if (!Kdf2.UPGRADE && meta.mkc_kdf !== 2 && !Kdf2.isBox(box)) return newPassword1.apply(this, arguments);
    return this.run('New password', async () => {
      const password = ($('#acc-newpass') || {}).value || ''; if (password.length < 10) throw new Error('Use a password of at least 10 characters');
      const uid = this.user.id, d = await Kdf2.derive(this.user.email, password, Kdf2.metaSalt(this.user) || undefined);
      const { error } = await this.client.auth.updateUser({ password: d.login, data: { mkc_kdf: 2, mkc_salt: d.salt } }); if (error && !samePw(error)) throw error;
      this.recovering = false; await Kdf2.markKnown(d.email);
      const rec = this.keyRec || await SyncCrypt.load(uid);
      if (rec && rec.v === 2) {
        const raw = await Kdf2.raw(rec), wraps = { ...Kdf2.freshWraps(rec), at: stamp(), pw: { it: Kdf2.ITER, ...(await Kdf2.wrapWith(d.wrap, raw, uid)) } };
        this.keyRec = await Kdf2.keep(uid, rec.vid, raw, wraps); this.secCache = null; this.forceSeal = true; bump(); this.schedule(true);
        return 'Password updated';
      }
      if (!Kdf2.isBox(box) && (!SyncCrypt.isBox(box) || this.canWriteSecrets())) {
        const v = await Kdf2.newVault(uid, d.wrap);
        this.keyRec = await Kdf2.keep(uid, v.vid, v.vault, v.wraps); this.secCache = null; this.forceSeal = true; this.keyChecked = true; bump();
        await this.push({ force: true }); showCode(v.code);
        return 'Password updated';
      }
      this.kdfLost = { uid, d }; rerenderSettings();
      return Kdf2.isBox(box) ? 'Password updated. Enter your recovery code in Settings › Debrid to bring back your synced keys.' : 'Password updated';
    });
  };
  /* a sealed copy made before the wraps changed is sealed again with the newest wraps */
  const prep1 = A.prepare;
  A.prepare = async function () {
    const sc = this.secCache, rec = this.keyRec;
    if (sc && sc.box && rec && rec.v === 2) { const w = Kdf2.freshWraps(rec); if (!Kdf2.isBox(sc.box) || sc.box.vid !== rec.vid || ((sc.box.wraps || {}).at || 0) !== ((w || {}).at || 0)) this.secCache = null; }
    return prep1.apply(this, arguments);
  };
  const signedOut1 = A.signedOut;
  A.signedOut = function () { this.kdfLost = null; this.kdfUp = null; this.kdf = null; this.kdfD = null; return signedOut1.apply(this, arguments); };

  /* ---- Settings › Debrid rows ---- */
  const row = (title, sub, ctl) => `<div class="set-row"><div><b>${title}</b><small>${sub}</small></div><div class="set-ctl">${ctl}</div></div>`;
  const uh1 = A.unlockHTML, bu1 = A.bindUnlock;
  A.unlockHTML = function () {
    const v2box = Kdf2.isBox(this.remoteSecrets);
    if (this.user && (this.kdfLost || (v2box && this.needsUnlock()))) {
      const pw = this.kdfLost ? '' : uh1.call(this);
      return `${pw}${row('Use your recovery code', 'Changed your password? Your recovery code brings your synced keys back.', '<input class="inp" type="text" id="rc-in" autocomplete="off" spellcheck="false" placeholder="MKC-…" aria-label="Recovery code" style="width:min(240px,100%)"><button class="btn btn-ghost btn-sm" type="button" id="rc-go" data-nav>Bring back</button>')}${this.kdfLost ? row('No recovery code?', 'Start fresh with the keys on this device. Keys saved only in your account are removed.', '<button class="btn btn-ghost btn-sm" type="button" id="rc-fresh" data-nav>Start fresh</button>') : ''}`;
    }
    const base = uh1.call(this); if (base) return base;
    const rec = this.keyRec;
    if (rec && rec.v === 2 && this.keysSync()) return row('Recovery code', 'Lost your code? Make a new one. The old code stops working.', '<button class="btn btn-ghost btn-sm" type="button" id="rc-new" data-nav>New recovery code</button>');
    return '';
  };
  A.bindUnlock = function () {
    bu1.apply(this, arguments);
    const act = (sel, fn) => { const b = $(sel); if (!b) return; b.onclick = async () => { b.disabled = true; try { const m = await fn(); if (m) toast(m, 'ok', 6000); } catch (e) { toast(e.message || String(e), 'err', 7000); } b.disabled = false; rerenderSettings(); }; };
    act('#rc-go', () => this.recover(($('#rc-in') || {}).value || ''));
    act('#rc-fresh', () => (confirm('Start fresh? Keys saved only in your account (not on this device) will be removed.') ? this.startFresh() : ''));
    act('#rc-new', () => this.newRecoveryCode());
    const i = $('#rc-in'); if (i) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#rc-go').click(); } });
  };
})();
