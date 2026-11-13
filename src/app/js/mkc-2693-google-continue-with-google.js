
'use strict';
/* 2.69.3 Continue with Google. Supabase handles the Google round trip; the session comes back in the URL and the
   existing client (detectSessionInUrl) picks it up. Shown only where the round trip works: a normal browser tab on
   app.mkcinema.app (or mkcinema.pages.dev), never inside the native apps (Google blocks embedded web views), on a TV
   (phone QR sign-in is there) or in the iPhone/iPad home-screen app (the Google page opens in a separate browser
   sheet whose sign-in never reaches the app). Google accounts have no password, so synced debrid and addon keys
   (sealed with the password) stay on each device; library, progress and settings sync as usual. */
(() => {
  if (typeof Account === 'undefined') return;
  const A = Account, ua = navigator.userAgent || '';
  const G_ICON = '<svg class="g-mark" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  const iosHome = () => (/iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) && (navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  A.googleOK = function () {
    return !!(this.google && this.client && !this.user && /^https:$/.test(location.protocol)
      && /^(app\.mkcinema\.app|mkcinema\.pages\.dev)$/.test(location.hostname)
      && !/; wv\)|MKCinema|Electron|Silk/i.test(ua)
      && !(typeof TvLogin !== 'undefined' && TvLogin.isTV()) && !iosHome());
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
  A.signInGoogle = function () {
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
  const st = document.createElement('style');
  st.textContent = '.g-btn{width:100%;justify-content:center;gap:10px}.g-btn .g-mark{flex:none}.acct-or{display:flex;align-items:center;gap:10px;margin:10px 0 4px;font-size:.82em;opacity:.7}.acct-or::before,.acct-or::after{content:"";flex:1;height:1px;background:currentColor;opacity:.25}';
  document.head.appendChild(st);
})();
