# MKCinema 2.7.16 (Dee, 2026-10-31): sign in a TV from a phone with a QR code.
# The TV (Settings > Account, signed out) shows a QR code holding a room code and a one-time key. The phone signs in
# a fresh session of its own (password typed or autofilled on the phone), encrypts the tokens with that key
# (AES-GCM) and broadcasts them on the room; the TV decrypts and adopts the session. The key only travels in the QR
# code, never through the realtime service, and the phone's own sign-in is untouched (no shared refresh token).
# Usage: python3 2.7.16-tv-phone-login.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)

# ---- TV side: a section under the sign-in form
# On a TV the QR code comes first, above the email form; elsewhere it sits under it
rep("""      <p>Your watchlist, progress, addons and settings follow you to every device.</p>
      <label class="fld"><span>Email</span><input class="inp" id="acc-email" type="email""",
    """      <p>Your watchlist, progress, addons and settings follow you to every device.</p>
      ${typeof TvLogin !== 'undefined' && TvLogin.isTV() ? TvLogin.html() : ''}
      <label class="fld"><span>Email</span><input class="inp" id="acc-email" type="email""")
# The first-run home question waits until no panel is open (it covered the TV sign-in code)
rep("""document.body.classList.contains('intro-on') || document.body.classList.contains('locked') || !Store.get('toured', false) || $('.sup-ask')""",
    """document.body.classList.contains('intro-on') || document.body.classList.contains('locked') || document.body.classList.contains('layer-open') || !Store.get('toured', false) || $('.sup-ask')""")
rep("""      ${c.source === 'settings' ? `<p class="acct-note">Project: <span class="mono">${proj}</span> · <button type="button" class="linkish" id="acc-forget">change</button></p>` : ''}
    </div>`;
  },""",
    """      ${c.source === 'settings' ? `<p class="acct-note">Project: <span class="mono">${proj}</span> · <button type="button" class="linkish" id="acc-forget">change</button></p>` : ''}
      ${typeof TvLogin !== 'undefined' && !TvLogin.isTV() ? TvLogin.html() : ''}
    </div>`;
  },""")
rep("""    const pass = $('#acc-pass'); if (pass) pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.signIn(); });
  },""",
    """    const pass = $('#acc-pass'); if (pass) pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.signIn(); });
    if (typeof TvLogin !== 'undefined') TvLogin.bind();
  },""")

rep(""".qr-wrap.sm{width:180px}""",
    """.qr-wrap.sm{width:180px}
.tvl{display:grid;gap:8px;margin-top:8px;padding-top:16px;border-top:1px solid var(--line-soft)}
.tvl h5{display:flex;align-items:center;gap:8px;margin:0;font-size:14.5px;font-weight:600;color:var(--ink)}
.tvl h5 .lucide{width:17px;height:17px}
.tvl .qr-wrap{margin:6px 0}
.tvl .inrow{margin-top:2px}
html.tv .tvl .qr-wrap{width:230px}
body.layer-open .focus-ask{display:none}""")

# ---- Module (after Cloner, before deep links)
rep("""/* ---------------- Deep links: QR handoff, remote and party invites ---------------- */""",
    """/* ---------------- Sign in a TV from a phone ----------------
   The TV shows a QR code with a room code and a one-time key. The phone signs in a fresh session of its own, encrypts
   the tokens with that key (AES-GCM) and sends them on the room; the TV decrypts them and adopts the session.
   The key is only ever in the QR code, and the phone's own sign-in is left alone. */
const TvLogin = {
  code: '', key: '', bus: null, state: '', t: 0, auto: false,
  isTV: () => document.documentElement.classList.contains('tv') || /MKCinemaTV|Android TV|GoogleTV|AFT[A-Z]|SMART-TV|SmartTV|Web0S|webOS|Tizen|BRAVIA/i.test(navigator.userAgent),
  aes: (key) => crypto.subtle.importKey('raw', b64url.dec(key), 'AES-GCM', false, ['encrypt', 'decrypt']),
  link() { return appLink(`login=${this.code}.${this.key}`); },
  html() {
    const st = this.state, head = '<h5><i data-lucide="smartphone"></i>Sign in with your phone</h5>';
    if (!st) return `<div class="tvl" id="tvl">${head}<p>Scan a code with your phone and sign in there. Handy on a TV, where typing is slow.</p><div class="inrow"><button class="btn btn-ghost btn-sm" type="button" id="tvl-go"><i data-lucide="qr-code"></i>Show QR code</button></div></div>`;
    if (st === 'unsupported') return `<div class="tvl" id="tvl">${head}<p>This needs MKCinema opened from its web address, such as mkcinema.pages.dev.</p></div>`;
    if (st === 'expired' || st === 'offline') return `<div class="tvl" id="tvl">${head}<p>${st === 'expired' ? 'That code expired.' : 'Could not reach the sign-in service. Check the connection and try again.'}</p><div class="inrow"><button class="btn btn-ghost btn-sm" type="button" id="tvl-go"><i data-lucide="refresh-cw"></i>New code</button></div></div>`;
    const line = st === 'connecting' ? 'Getting a code ready…' : st === 'phone' ? 'Phone connected. Finish signing in on your phone.' : 'Scan with your phone camera, then sign in on the phone. The code works for 10 minutes.';
    return `<div class="tvl" id="tvl">${head}<div class="qr-wrap sm">${QR.svg(this.link())}</div><p>${line}</p></div>`;
  },
  paint() { const box = $('#tvl'); if (!box) return; box.outerHTML = this.html(); icons(); this.bind(); },
  bind() {
    const go = $('#tvl-go'); if (go) go.onclick = () => this.start();
    // on a TV the code is the whole point, so it shows straight away
    if (!this.state && !this.auto && this.isTV() && $('#tvl')) { this.auto = true; this.start(); }
  },
  async start() {
    this.stop();
    if (!appLink('x') || !(window.crypto && crypto.subtle)) { this.state = 'unsupported'; this.paint(); return; }
    this.code = roomCode(); this.key = b64url.enc(crypto.getRandomValues(new Uint8Array(16)));
    this.state = 'connecting'; this.paint();
    const bus = this.bus = new Bus(`login-${this.code}`, (m) => this.onMsg(m));
    const ok = await bus.connect(); if (this.bus !== bus) return;
    this.state = ok ? 'waiting' : 'offline'; if (!ok) this.stop(true); this.paint();
    this.t = setTimeout(() => { if (this.bus === bus) { this.stop(true); this.state = 'expired'; this.paint(); } }, 10 * 60000);
  },
  stop(keepState) { clearTimeout(this.t); if (this.bus) this.bus.close(); this.bus = null; if (!keepState) { this.code = ''; this.key = ''; this.state = ''; } },
  async onMsg(m) {
    if (m.t === 'hello') { if (this.state === 'waiting') { this.state = 'phone'; this.paint(); } return; }
    if (m.t !== 'session' || !this.key) return;
    const bus = this.bus;
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64url.dec(m.iv) }, await this.aes(this.key), b64url.dec(m.data));
      const tok = JSON.parse(new TextDecoder().decode(plain));
      if (!Account.client) throw new Error('accounts are not connected on this screen');
      const { error } = await Account.client.auth.setSession({ access_token: tok.a, refresh_token: tok.r }); if (error) throw error;
      bus.send({ t: 'done' });
      setTimeout(() => { this.stop(); Account.render(); }, 1200);
    } catch (e) { bus.send({ t: 'fail', msg: e.message || String(e) }); toast(`Phone sign-in: ${e.message || e}`, 'err', 7000); }
  },

  /* The phone: opened from the QR code */
  async join(code, key) {
    if (!/^[A-Z0-9]{6}$/.test(code) || !key) { toast('That sign-in code is not complete. Scan it again.', 'err'); return; }
    const body = $('#castBody'); openLayer('castLayer');
    const email = (Account.user && Account.user.email) || '';
    body.innerHTML = `<h2>Sign in your TV</h2><p class="sub">Sign in here and your TV signs in to the same account. This phone stays as it is.</p>
      <form id="tvlForm" autocomplete="on"><label class="fld"><span>Email</span><input class="inp" id="tvl-email" type="email" autocomplete="username" required value="${esc(email)}"></label>
      <label class="fld"><span>Password</span><input class="inp" id="tvl-pass" type="password" autocomplete="current-password" required></label>
      <p class="tour-note" id="tvl-msg" role="status">Connecting to your TV…</p>
      <div class="actions"><button class="btn btn-prime" type="submit" id="tvl-send"><i data-lucide="tv"></i>Sign in TV</button></div></form>`;
    icons(); setTimeout(() => { const f = $(email ? '#tvl-pass' : '#tvl-email'); if (f) f.focus(); }, 60);
    const msg = (t) => { const el = $('#tvl-msg'); if (el) el.textContent = t; };
    let answer = null;
    const bus = new Bus(`login-${code}`, (m) => { if (m.t === 'done' || m.t === 'fail') { if (answer) answer(m); } });
    // the form is live straight away; sending waits for the connection
    const ready = bus.connect().then((ok) => { bus.send({ t: 'hello' }); msg(ok ? 'Connected to your TV.' : 'Could not reach your TV. Check this phone’s connection.'); return ok; });
    $('#tvlForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#tvl-send'); btn.disabled = true; msg('Signing in…');
      try {
        await ready;
        const c = Account.config(); if (!c) throw new Error('accounts are not set up');
        await Account.loadLib();
        // a separate, throwaway client: the TV gets its own session instead of sharing this phone's
        const tmp = window.supabase.createClient(c.url.replace(/\\/+$/, ''), c.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mkc:tvlogin' } });
        const { data, error } = await tmp.auth.signInWithPassword({ email: $('#tvl-email').value.trim(), password: $('#tvl-pass').value });
        if (error) throw error;
        $('#tvl-pass').value = '';
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.aes(key), new TextEncoder().encode(JSON.stringify({ a: data.session.access_token, r: data.session.refresh_token })));
        const reply = new Promise((res) => { answer = res; setTimeout(() => res(null), 15000); });
        bus.send({ t: 'session', iv: b64url.enc(iv), data: b64url.enc(new Uint8Array(sealed)) });
        msg('Sending to your TV…');
        const r = await reply;
        if (!r) throw new Error('your TV did not answer. Make sure the code is still on its screen');
        if (r.t === 'fail') throw new Error(r.msg || 'your TV could not sign in');
        body.innerHTML = '<h2>Your TV is signed in</h2><p class="sub">You can put your phone down. Your library, progress and addons load on the TV now.</p>';
        bus.close();
      } catch (err) { msg(`Could not sign in: ${err.message || err}`); btn.disabled = false; }
    });
    setTimeout(() => bus.close(), 10 * 60000);
  },
};
/* ---------------- Deep links: QR handoff, remote and party invites ---------------- */""")
rep("""    else if (h.startsWith('party=')) {""",
    """    else if (h.startsWith('login=')) { history.replaceState(null, '', location.pathname); const [code, key] = h.slice(6).split('.'); TvLogin.join((code || '').toUpperCase(), key); }
    else if (h.startsWith('party=')) {""")
rep("""addEventListener('hashchange', () => { if (/^#(play\\?|remote=|party=)/.test(location.hash)) Deep.handle(); });""",
    """addEventListener('hashchange', () => { if (/^#(play\\?|remote=|party=|login=)/.test(location.hash)) Deep.handle(); });""")
rep("""  if (views.includes(start)) go(start); else if (views.includes(first) && !/^(play\\?|remote=|party=)/.test(start)) go(first); else renderHome();
  maybeTour();""",
    """  if (views.includes(start)) go(start); else if (views.includes(first) && !/^(play\\?|remote=|party=|login=)/.test(start)) go(first); else renderHome();
  if (!/^login=/.test(start)) maybeTour();""")
open(p, 'w').write(s); print('patched')
