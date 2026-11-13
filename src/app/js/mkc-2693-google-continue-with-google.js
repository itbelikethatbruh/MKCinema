
'use strict';
/* 2.69.3 Continue with Google, on every device (2.69.4). Supabase does the Google round trip.
   - Browser tab on app.mkcinema.app: straight to Google; the session comes back in the URL (detectSessionInUrl).
   - iPhone/iPad home-screen app and the Android, Windows and Mac apps: Google blocks sign-in inside apps, and the
     home-screen app keeps storage apart from Safari. The app waits on a one-time code (the TV sign-in channel: AES-GCM
     key in the link, 4-digit check number shown only in the app), opens Safari / the default browser at #glogin=CODE.KEY
     (apps go through https://mkcinema.app/signin, which the site redirects to app.mkcinema.app, because the apps keep
     their own addresses inside), the browser signs in with Google, seals a fresh session to the app, then forgets it so
     the two never share one refresh token. The browser never syncs its own library into the account.
   - TV: the phone QR sign-in; the phone's form gets Continue with Google too.
   Google accounts have no password, so synced debrid and addon keys (sealed with the password) stay on each device;
   library, progress and settings sync as usual. */
(() => {
  if (typeof Account === 'undefined') return;
  const A = Account, ua = navigator.userAgent || '';
  const G_ICON = '<svg class="g-mark" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  const iosHome = () => (/iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) && (navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  const isTV = () => typeof TvLogin !== 'undefined' && TvLogin.isTV();
  const inApp = () => location.hostname === 'mkcinema.pages.dev' || /; wv\)|MKCinema|Electron/i.test(ua);
  /* direct | safari | browser | tv */
  A.googleMode = () => (isTV() ? 'tv' : iosHome() ? 'safari' : inApp() ? 'browser' : 'direct');
  A.googleOK = function () {
    return !!(this.google && this.client && !this.user && /^https:$/.test(location.protocol)
      && (/^(app\.mkcinema\.app|mkcinema\.pages\.dev)$/.test(location.hostname) || (this.googleMode() !== 'direct' && typeof TvLogin !== 'undefined')));
  };
  /* the settings call already made for sign-up also says which providers are on */
  A.loadProviders = async function (c) {
    try {
      const r = await fetchT(`${c.url.replace(/\/+$/, '')}/auth/v1/settings`, { headers: { apikey: c.anonKey } }, 6000);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(); this.signupOff = !!j.disable_signup; this.google = !!(j.external && j.external.google);
    } catch (e) { /* unknown: no Google button, the email form still works */ }
    this.render();
  };
  const HAND = 'mkc:glogin';
  const handLayer = (html) => { const body = $('#castBody'); body.innerHTML = html; openLayer('castLayer'); icons(); return body; };
  /* home-screen app or native app: wait for the browser to send the session */
  A.googleHandoff = async function () {
    if (typeof TvLogin === 'undefined') throw new Error('Update MKCinema and try again');
    handLayer('<h2>Continue with Google</h2><p class="sub">Getting a sign-in code ready…</p>');
    await TvLogin.start();
    if (TvLogin.state !== 'waiting') { handLayer('<h2>Continue with Google</h2><p class="sub">Could not reach the sign-in service. Check the connection and try again.</p>'); return; }
    const safari = this.googleMode() === 'safari', hash = `glogin=${TvLogin.code}.${TvLogin.key}`;
    const link = safari ? `https://app.mkcinema.app/#${hash}` : `https://mkcinema.app/signin#${hash}`;
    handLayer(`<h2>${safari ? 'Finish in Safari' : 'Finish in your browser'}</h2><p class="sub">${safari ? 'Google sign-in opens in Safari. Sign in there with Google and this app signs in by itself.' : 'Google sign-in opens in your web browser. Sign in there with Google and this app signs in by itself.'}</p>
      <p class="tvl-chk">Check number<b class="mono">${esc(TvLogin.check)}</b></p><p class="sub">${safari ? 'Safari asks for this number.' : 'The browser asks for this number.'} The code works for 10 minutes.</p>
      <div class="actions"><a class="btn btn-prime" id="gl-open" href="${esc(link)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>${safari ? 'Open Safari' : 'Open browser'}</a><button class="btn btn-ghost" type="button" id="gl-no">Cancel</button></div>`);
    $('#gl-no').onclick = () => { TvLogin.stop(); closeLayer('castLayer'); };
    const t0 = Date.now(), iv = setInterval(() => {
      if (this.user) { clearInterval(iv); closeLayer('castLayer'); this.render(); }
      else if (!TvLogin.bus || Date.now() - t0 > 10 * 60000) clearInterval(iv);
    }, 800);
  };
  /* the browser: opened from the app (or from a TV's QR code, h.tv) */
  A.googleSend = async function () {
    let h = null; try { h = JSON.parse(sessionStorage.getItem(HAND) || 'null'); } catch (e) { h = null; }
    if (!h || !this.user || !this.session || Date.now() - (h.at || 0) > 10 * 60000) return;
    try { sessionStorage.removeItem(HAND); } catch (e) { /* blocked */ }
    const s = this.session, client = this.client;
    try { client.auth.stopAutoRefresh(); } catch (e) { /* older library */ }
    handLayer(`<h2>${h.tv ? 'Signing in your TV…' : 'Signing in the app…'}</h2><p class="sub" id="gl-msg">Sending your sign-in to ${h.tv ? 'your TV' : 'the MKCinema app'}.</p>`);
    const msg = (t) => { const el = $('#gl-msg'); if (el) el.textContent = t; };
    let answer = null;
    const bus = new Bus(`login-${h.code}`, (m) => { if ((m.t === 'done' || m.t === 'fail') && answer) answer(m); });
    try {
      const ok = await bus.connect(); if (!ok) throw new Error('could not reach the app. Check the connection');
      bus.send({ t: 'hello' });
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await TvLogin.aes(h.key), new TextEncoder().encode(JSON.stringify({ a: s.access_token, r: s.refresh_token, c: h.check || '' })));
      const reply = new Promise((res) => { answer = res; setTimeout(() => res(null), 15000); });
      bus.send({ t: 'session', iv: b64url.enc(iv), data: b64url.enc(new Uint8Array(sealed)) });
      const r = await reply;
      if (!r) throw new Error(h.tv ? 'your TV did not answer. Make sure the code is still on its screen' : 'the app did not answer. Open it and tap Continue with Google again');
      if (r.t === 'fail') throw new Error(r.msg || 'the app could not sign in');
      handLayer(h.tv ? '<h2>Your TV is signed in</h2><p class="sub">You can put your phone down. This phone was signed out again so your TV keeps its own sign-in.</p>' : '<h2>You’re signed in</h2><p class="sub">Go back to the MKCinema app. You can close this page.</p>');
    } catch (e) { handLayer(`<h2>Could not sign in the app</h2><p class="sub">${esc(e.message || String(e))}</p>`); }
    finally {
      bus.close();
      // Safari lets go of this sign-in without ending it, so the app's copy keeps working
      try { localStorage.removeItem('mkc:auth'); } catch (e) { /* blocked */ }
      this.session = null; this.user = null; this.render();
      setTimeout(() => { this.handing = false; }, 3000);
    }
  };
  const handStart = () => {
    const m = /^#glogin=([A-Za-z0-9]{6})\.([A-Za-z0-9_-]+)$/.exec(location.hash || ''); if (!m) return;
    history.replaceState(null, '', location.pathname);
    if (A.googleMode() !== 'direct') return; // the link landed back inside an app: Google can't sign in here
    const code = m[1].toUpperCase(), key = m[2];
    handLayer(`<h2>Sign in the MKCinema app</h2><p class="sub">This signs the MKCinema app on this device into your Google account. Only continue if you just tapped Continue with Google in that app.</p>
      <label class="fld"><span>Check number shown in the app</span><input class="inp mono" id="gl-chk" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="0000"></label>
      <p class="tour-note" id="gl-cmsg" role="status"></p>
      <div class="actions"><button class="btn btn-prime g-btn" type="button" id="gl-go">${G_ICON}<span>Continue with Google</span></button><button class="btn btn-ghost" type="button" id="gl-no">Cancel</button></div>`);
    $('#gl-no').onclick = () => closeLayer('castLayer');
    $('#gl-go').onclick = async () => {
      const c = String($('#gl-chk').value || '').replace(/\D/g, '');
      if (c.length !== 4) { $('#gl-cmsg').textContent = 'Type the 4 digits shown in the MKCinema app.'; return; }
      try { sessionStorage.setItem(HAND, JSON.stringify({ code, key, check: c, at: Date.now() })); } catch (e) { $('#gl-cmsg').textContent = 'This browser is blocking storage for this site. Turn off private browsing and try again.'; return; }
      if (!A.client) await A.ensure();
      A.signInGoogle(true);
    };
  };
  A.signInGoogle = function (direct) {
    const mode = direct ? 'direct' : this.googleMode();
    if (mode === 'tv') { // the phone does the Google part
      const q = $('#tvl'); if (q) q.scrollIntoView({ block: 'center' });
      if (TvLogin.state !== 'waiting' && TvLogin.state !== 'phone') TvLogin.start();
      toast('Scan the code with your phone, then choose Continue with Google there', 'info', 8000); return Promise.resolve();
    }
    if (mode !== 'direct') return this.run('Continue with Google', () => this.googleHandoff());
    return this.run('Continue with Google', async () => {
      const back = `${location.origin}${location.pathname}`;
      const { error } = await this.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back, queryParams: { prompt: 'select_account' } } });
      if (error) throw error;
      return ''; // the page now goes to Google
    });
  };
  const bind1 = A.bind;
  A.bind = function () {
    bind1.apply(this, arguments);
    const card = $('#acc-email') && $('#acc-email').closest('.acct-card');
    if (card && this.googleOK() && !$('#acc-google')) {
      const fld = $('#acc-email').closest('.fld');
      fld.insertAdjacentHTML('beforebegin', `<div class="inrow g-row"><button class="btn btn-ghost g-btn" type="button" id="acc-google">${G_ICON}<span>Continue with Google</span></button></div><p class="acct-or"><span>or use your email</span></p>`);
      $('#acc-google').onclick = () => this.signInGoogle();
    }
    const u = this.user, prov = u && u.app_metadata && u.app_metadata.provider;
    const who = u && $('.acct-card .acct-who');
    if (who && prov && prov !== 'email' && !$('#acc-gnote')) who.parentNode.querySelector('.acct-note').insertAdjacentHTML('afterend', '<p class="acct-note" id="acc-gnote">With Google sign-in, debrid and addon keys stay on this device. Your library, progress and settings sync.</p>');
  };
  if (typeof TvLogin !== 'undefined') {
    const form1 = TvLogin.form;
    TvLogin.form = async function (code, key, check) {
      const r = await form1.apply(this, arguments);
      const acts = $('#tvlForm .actions');
      if (acts && A.google !== false && A.googleMode() === 'direct' && !$('#tvl-google')) {
        acts.insertAdjacentHTML('afterend', `<p class="acct-or"><span>or</span></p><div class="inrow g-row"><button class="btn btn-ghost g-btn" type="button" id="tvl-google">${G_ICON}<span>Continue with Google</span></button></div>`);
        $('#tvl-google').onclick = async () => {
          try { sessionStorage.setItem(HAND, JSON.stringify({ code, key, check: check || '', tv: true, at: Date.now() })); } catch (e) { toast('This browser is blocking storage for this site. Turn off private browsing and try again.', 'err', 7000); return; }
          if (!A.client) await A.ensure();
          A.signInGoogle(true);
        };
      }
      return r;
    };
  }
  const setUser1 = A.setUser;
  const handing = () => { try { return !!sessionStorage.getItem(HAND); } catch (e) { return false; } };
  /* Safari only carries the sign-in across: it never syncs its own library or settings into the account */
  A.setUser = function (user) { if (user && handing()) { this.handing = true; setTimeout(() => this.googleSend(), 300); } return setUser1.apply(this, arguments); };
  ['pull', 'push', 'schedule'].forEach((k) => { const f = A[k]; if (typeof f === 'function') A[k] = function () { return this.handing ? Promise.resolve() : f.apply(this, arguments); }; });
  if (/^#glogin=/.test(location.hash || '')) { if (document.readyState === 'complete') handStart(); else addEventListener('load', () => setTimeout(handStart, 400)); }
  addEventListener('hashchange', () => { if (/^#glogin=/.test(location.hash || '')) handStart(); });
  const st = document.createElement('style');
  st.textContent = '.g-btn{width:100%;justify-content:center;gap:10px}.g-btn .g-mark{flex:none}.acct-or{display:flex;align-items:center;gap:10px;margin:10px 0 4px;font-size:.82em;opacity:.7}.acct-or::before,.acct-or::after{content:"";flex:1;height:1px;background:currentColor;opacity:.25}';
  document.head.appendChild(st);
})();
