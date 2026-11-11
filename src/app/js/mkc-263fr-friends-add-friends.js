
'use strict';
/* ---------------- 2.63 Friends ----------------
   Add friends by username, see who is online and what they are watching, message them, invite them to a watch party,
   and call them when they allow calls. Everything is private by design:
   - The server (Supabase functions in friends.sql) checks every friendship. Nobody reads another person's rows.
   - A request must be accepted. Remove, Block and Report work any time; the other person is not told.
   - "Show when I'm online", "Show what I'm watching" and "Incoming calls" are in Settings › Friends.
   - Calls ring only when the friend allows them. "When I'm not watching" never rings during a film: the caller sees
     that they are busy, and the friend finds a "Missed call" in the chat later.
   - Voice and video go device to device (or through the party relay when a direct link fails). Nothing is recorded.
   - Not on a kids seat. */
const Friends = {
  me: null, list: [], loaded: false, ch: null, chKey: '', beatT: 0, listT: 0, last: '', lastAt: 0, chat: null, msgs: [], busyUI: false,
  COLORS: ['gold', 'ember', 'rose', 'violet', 'sky', 'teal', 'lime', 'silver'],
  on() { return !!(Account.client && Account.user) && !this.kids(); },
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  playerOpen() { const p = $('#player'); return !!(p && !p.hidden); },
  layerOpen() { const l = $('#friendsLayer'); return !!(l && !l.hidden); },
  async rpc(fn, args) {
    if (!Account.client) throw new Error('Sign in first');
    const { data, error } = await Account.client.rpc(fn, args || {});
    if (error) {
      const m = String(error.message || error.code || error);
      if (/Could not find the function|PGRST202|42883/i.test(`${m} ${error.code}`)) throw new Error('Friends are not switched on for this server yet');
      throw new Error(m);
    }
    return data;
  },
  /* a nudge to a friend's private inbox (REST broadcast: the server checks that we are friends) */
  async poke(uid, payload) {
    const c = Account.config(), tok = Account.session && Account.session.access_token;
    if (!c || !tok || !uid) return false;
    try {
      const r = await fetchT(`${c.url.replace(/\/+$/, '')}/realtime/v1/api/broadcast`, { method: 'POST', headers: { apikey: c.anonKey, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic: `mkc-fr:${uid}`, event: 'f', payload: { ...payload, from: Account.user.id }, private: true }] }) }, 6000);
      return r.ok;
    } catch (e) { return false; }
  },
  pokeAll(payload) { this.list.filter((f) => f.state === 'friend').slice(0, 60).forEach((f) => this.poke(f.id, payload)); },

  /* ---- start and stop with the account ---- */
  async start() {
    if (!this.on()) { this.stop(); return; }
    const key = Account.user.id;
    if (this.chKey !== key) {
      this.drop(); this.chKey = key;
      try {
        const ch = Account.client.channel(`mkc-fr:${key}`, { config: { private: true, broadcast: { self: false } } });
        ch.on('broadcast', { event: 'f' }, (m) => this.inbox(m && m.payload));
        ch.subscribe(); this.ch = ch;
      } catch (e) { this.ch = null; }
    }
    try { this.me = await this.rpc('mkc_me'); this.ready = true; } catch (e) { this.me = null; this.ready = /not switched on/.test(e.message) ? 'off' : true; }
    if (this.me) { this.syncCfg(); await this.refresh(); this.beat(true); if (typeof Social !== 'undefined') Social.start(); }
    clearInterval(this.beatT); this.beatT = setInterval(() => this.beat(), 60000);
    clearInterval(this.listT); this.listT = setInterval(() => { if (this.me && (this.layerOpen() || document.visibilityState === 'visible')) this.refresh(); }, 45000);
    this.paint();
  },
  drop() { const c = this.ch; this.ch = null; this.chKey = ''; if (c) { try { Account.client.removeChannel(c); } catch (e) { /* gone */ } } },
  stop() {
    if (this.me) this.here(false).catch(() => {});
    this.drop(); clearInterval(this.beatT); clearInterval(this.listT); this.me = null; this.list = []; this.chat = null; if (typeof Social !== 'undefined') Social.stop(); this.badge(); this.paint();
    if (typeof FCall !== 'undefined') FCall.end('gone', true);
  },
  /* settings that live on the server too (search and calls), kept in CFG so they sync like every other setting */
  syncCfg() {
    if (!this.me) return;
    if (CFG.frCalls == null) CFG.frCalls = this.me.calls || 'off';
    if (CFG.frFindable == null) CFG.frFindable = !!this.me.findable;
    if ((CFG.frCalls !== this.me.calls) || (!!CFG.frFindable !== !!this.me.findable)) this.saveMe({}).catch(() => {});
  },
  async saveMe(ch) {
    const m = this.me || {};
    const n = { username: ch.username || m.username, name: ch.name != null ? ch.name : m.name, avatar: ch.avatar || m.avatar || 'gold', findable: ch.findable != null ? ch.findable : !!CFG.frFindable, calls: ch.calls || CFG.frCalls || 'off' };
    this.me = await this.rpc('mkc_set_me', { p_username: n.username, p_name: n.name || '', p_avatar: n.avatar, p_findable: n.findable, p_calls: n.calls });
    return this.me;
  },

  /* ---- presence: about once a minute, and right away when something changes ---- */
  watching() {
    if (CFG.frWatching !== true || !this.playerOpen() || typeof P === 'undefined' || !P.ctx || !P.ctx.meta) return null;
    const m = P.ctx.meta, v = P.ctx.video, w = { t: String(m.name || '').slice(0, 120), k: m.type === 'series' ? 'series' : m.type === 'anime' ? 'anime' : 'movie', id: /^(tt\d+|tmdb:\d+|kitsu:\d+|mal:\d+)$/.test(String(m.id || '')) ? m.id : '' };
    const ep = v && String(v.id || '').match(/:(\d+):(\d+)$/); if (ep) w.ep = `S${+ep[1]} E${+ep[2]}`;
    if (m.poster && /^https:\/\/[^\s"']{8,300}$/.test(m.poster)) w.p = m.poster;
    return w.t ? w : null;
  },
  here(online) {
    const w = online ? this.watching() : null;
    return this.rpc('mkc_here', { p_online: !!online, p_busy: !!online && this.playerOpen(), p_watching: w });
  },
  beat(force) {
    if (!this.me || !this.on()) return;
    const online = CFG.frOnline !== false && document.visibilityState === 'visible';
    const w = online ? this.watching() : null, sig = JSON.stringify([online, this.playerOpen(), w && w.t, w && w.ep]);
    const changed = sig !== this.last;
    if (!force && !changed && Date.now() - this.lastAt < 55000) return;
    this.last = sig; this.lastAt = Date.now();
    this.here(online).then(() => { if (changed) this.pokeAll({ t: 'p' }); }).catch(() => {});
  },

  /* ---- the list ---- */
  async refresh() {
    if (!this.me) return;
    try { this.list = (await this.rpc('mkc_friends_list')) || []; this.loaded = true; } catch (e) { return; }
    this.badge(); this.paintLists();
    if (this.chat) { const f = this.byId(this.chat.id); if (f) { this.chat = f; this.paintChatHead(); } else this.closeChat(); }
  },
  byId(id) { return this.list.find((f) => f.id === id) || null; },
  counts() { let req = 0, unread = 0; this.list.forEach((f) => { if (f.state === 'in') req++; if (f.state === 'friend') unread += f.unread || 0; }); return { req, unread }; },
  badge() {
    const b = $('#openFriends'); if (!b) return;
    const { req, unread } = this.me ? this.counts() : { req: 0, unread: 0 }, n = req + unread;
    let d = $('.fr-dot', b); if (!d) { d = document.createElement('span'); d.className = 'fr-dot tnum'; b.appendChild(d); }
    d.hidden = !n; d.textContent = n > 9 ? '9+' : String(n || '');
    b.setAttribute('aria-label', n ? `Friends, ${n} new` : 'Friends');
  },
  inbox(p) {
    if (!p || typeof p !== 'object' || !this.me) return;
    const from = typeof p.from === 'string' ? p.from : '';
    switch (p.t) {
      case 'p': clearTimeout(this.pT); this.pT = setTimeout(() => this.refresh(), 400 + Math.random() * 800); break;
      case 'r': this.refresh().then(() => { const f = this.byId(from); if (f && f.state === 'in') this.note(`${this.label(f)} wants to be friends`); else if (f && f.state === 'friend') this.note(`${this.label(f)} is now your friend`); }); break;
      case 'm':
        if (this.chat && this.chat.id === from && this.layerOpen()) this.loadChat(true);
        else this.refresh().then(() => { const f = this.byId(from); if (f && f.state === 'friend') this.note(`${this.label(f)}: ${String(p.x || 'sent a message').slice(0, 80)}`, f.id); });
        break;
      case 'ring': case 'ok': case 'cx': case 'busy': if (typeof FCall !== 'undefined') FCall.inbox(p, from); break;
      case 'k': { const f = this.byId(from); if (f && f.state === 'friend') this.note(`${this.label(f)} gave you kudos`); break; }
      default: break;
    }
  },
  /* a quiet note: never over a film. While a film plays, only the badge on the Friends button changes. */
  note(text, chatWith) {
    if (this.playerOpen() || this.layerOpen()) return;
    toast(text, 'info', 4200, 'friends');
    if (chatWith) this.pendingChat = chatWith;
  },
  label(f) { return f ? (f.name || `@${f.username}`) : 'Someone'; },
  ago(t) {
    const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
    if (!isFinite(s)) return '';
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  },
  status(f) {
    if (f.state === 'in') return 'Wants to be friends';
    if (f.state === 'out') return 'Request sent';
    if (f.state === 'blocked') return 'Blocked';
    if (f.on && f.watching && f.watching.t) return `Watching ${f.watching.t}${f.watching.ep ? ` · ${f.watching.ep}` : ''}`;
    if (f.on) return f.busy ? 'Online · watching something' : 'Online';
    if (f.seen) return `Last seen ${this.ago(f.seen)}`;
    return 'Offline';
  },
  canCall(f) {
    if (!f || f.state !== 'friend') return [false, ''];
    if (f.calls === 'off') return [false, 'Calls are off'];
    if (!f.on) return [false, 'Offline'];
    if (f.calls === 'idle' && f.busy) return [false, 'Watching now: calls wait'];
    if (!window.RTCPeerConnection) return [false, 'Calls need a newer browser'];
    return [true, ''];
  },
  swatches() { return this.staff ? ['diamond', ...this.COLORS] : this.COLORS; },
  av(f, big) {
    if (f && f.avatar === 'diamond') return `<span class="fr-av fr-c-diamond${big ? ' big' : ''}${f.on ? ' on' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.5 3.5h11l4 5.5L12 21 2.5 9z" fill="#fff" fill-opacity=".92"/><path d="M2.5 9h19M9 3.5 7.5 9 12 21l4.5-12L15 3.5" fill="none" stroke="#4b3a8c" stroke-opacity=".55" stroke-width="1" stroke-linejoin="round"/></svg></span>`;
    const c = this.COLORS.includes(f && f.avatar) ? f.avatar : 'gold', ch = String((f && (f.name || f.username)) || '?').trim().charAt(0).toUpperCase() || '?';
    return `<span class="fr-av fr-c-${c}${big ? ' big' : ''}${f && f.on ? ' on' : ''}" aria-hidden="true">${esc(ch)}</span>`;
  },

  /* ---- the Friends panel ---- */
  edit() { this.open(); if (this.me) { this.mode = 'edit'; this.paint(); } },
  open(withId) {
    if (this.kids()) { toast('Not on the kids seat', 'err', 2200, 'kids'); return; }
    X8.layer('friendsLayer', { label: 'Friends', icon: 'users', eyebrow: 'Friends', wide: true });
    X8.onClose.friendsLayer = () => { this.chat = null; if (typeof Social !== 'undefined') { Social.view = null; Social.viewCard = null; } };
    if ((withId || this.pendingChat) && typeof Social !== 'undefined') Social.tab = 'friends';
    X8.open('friendsLayer');
    if (withId || this.pendingChat) { const id = withId || this.pendingChat; this.pendingChat = null; this.mode = 'list'; this.paint(); const f = this.byId(id); if (f) { this.openChat(f); return; } }
    this.mode = 'list'; this.paint();
    if (Account.user && !Account.client) Account.ensure().then(() => this.start());
    else if (this.on() && !this.ready) this.start();
    else if (this.me) this.refresh();
  },
  paint() {
    const b = X8.body('friendsLayer'); if (!b || !this.layerOpen()) { this.badge(); return; }
    if (this.chat) return; // the chat paints itself
    if (this.kids()) { b.innerHTML = '<p class="x8-p">Friends are not on the kids seat.</p>'; return; }
    if (!Account.user) {
      b.innerHTML = `<h3 class="x8-h">Friends</h3><p class="x8-p">Add friends by their username, see who is online and what they are watching, send messages and start a watch party together. Sign in to begin.</p>
        <div class="actions"><button class="btn btn-prime" type="button" data-nav data-fr="signin"><i data-lucide="log-in"></i>Sign in</button></div>`;
      this.bindCommon(b); icons(); this.focusFirst(b); return;
    }
    if (this.ready === 'off') { b.innerHTML = '<h3 class="x8-h">Friends</h3><p class="x8-p">Friends are not switched on for this server yet. Please try again later.</p>'; return; }
    if (!this.ready) { b.innerHTML = '<p class="x8-p">Loading…</p>'; return; }
    if (!this.me) { this.paintSetup(b); return; }
    if (this.mode === 'edit') { this.paintSetup(b, true); return; }
    if (typeof Social !== 'undefined' && Social.owns()) { Social.paint(b); return; }
    if (this.mode !== 'list' || !$('#frLists', b)) this.paintShell(b);
    this.paintLists();
  },
  focusFirst(root) { if (IS_TV) { const x = $('[data-nav]', root); if (x) Nav.focus(x, true); } },
  bindCommon(root) {
    if (root.dataset.frb) return; root.dataset.frb = '1'; // once per panel: every repaint used to add another listener
    root.addEventListener('click', (e) => {
      const x = e.target.closest('[data-fr]'); if (!x || !root.contains(x)) return;
      const id = x.dataset.id, f = id ? this.byId(id) : null;
      switch (x.dataset.fr) {
        case 'signin': X8.close('friendsLayer'); openSettings('account'); break;
        case 'settings': X8.close('friendsLayer'); openSettings('friends'); break;
        case 'edit': this.mode = 'edit'; this.paint(); break;
        case 'add': this.act(x, () => this.rpc('mkc_friend_add', { other: id }), (r) => { if (r === 'friend') { toast('You are friends now', 'ok'); this.poke(id, { t: 'r' }); } else { toast('Request sent', 'ok'); this.poke(id, { t: 'r' }); } this.search(true); }); break;
        case 'accept': this.act(x, () => this.rpc('mkc_friend_answer', { other: id, accept: true }), () => { toast(`You and ${this.label(f)} are friends now`, 'ok'); this.poke(id, { t: 'r' }); }); break;
        case 'decline': this.act(x, () => this.rpc('mkc_friend_answer', { other: id, accept: false })); break;
        case 'cancel': this.act(x, () => this.rpc('mkc_friend_remove', { other: id })); break;
        case 'chat': if (f) this.openChat(f); break;
        case 'profile': if (f && typeof Social !== 'undefined') Social.profile(f); break;
        case 'call': if (f) FCall.start(f); break;
        case 'more': this.more(f); break;
        case 'unblock': this.act(x, () => this.rpc('mkc_block', { other: id, on_: false }), () => toast('Unblocked', 'ok')); break;
        case 'watch': if (f && f.watching && f.watching.id) { X8.close('friendsLayer'); openDetail({ id: f.watching.id, type: f.watching.k === 'movie' ? 'movie' : 'series', name: f.watching.t, poster: f.watching.p }); } break;
        case 'hang': FCall.end('hang'); break;
        case 'mute': FCall.mute(); break;
        case 'cam': FCall.cam(); break;
        default: break;
      }
    });
  },
  async act(btn, fn, then) {
    if (btn) btn.disabled = true;
    try { const r = await fn(); if (then) then(r); await this.refresh(); } catch (e) { toast(e.message || String(e), 'err', 5000); } finally { if (btn && btn.isConnected) btn.disabled = false; }
  },
  paintSetup(b, edit) {
    const me = edit ? this.me : null;
    const sug = String((Account.user && Account.user.email) || '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
    const sw = (k, on, l, h) => `<div class="fr-opt"><div><b>${l}</b><small>${h}</small></div><button class="switch ${on ? 'on' : ''}" type="button" role="switch" aria-checked="${on}" data-nav data-frset="${k}" aria-label="${esc(l)}"></button></div>`;
    b.innerHTML = `<h3 class="x8-h">${me ? 'Your profile' : 'Choose a username'}</h3>
      <p class="x8-p">${me ? 'Your display name is what friends see. Your username is how they find you (you can change it once a day).' : 'Friends find you by typing your username exactly, and see your display name. Your email is never shown to anyone.'}</p>
      <div class="fr-setup">
        <label class="fr-lbl" for="frUser">Username</label>
        <div class="inrow"><span class="fr-at">@</span><input class="inp" id="frUser" maxlength="20" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${esc(sug.length >= 3 ? sug.replace(/\d+$/, '') || sug : 'yourname')}" value="${esc(me ? me.username : '')}" data-nav></div>
        <small class="fr-hint" id="frUserHint">3 to 20 letters, numbers or _</small>
        <label class="fr-lbl" for="frName">Display name</label>
        <input class="inp" id="frName" maxlength="32" autocomplete="off" placeholder="What friends see, like Sam or The Lees" value="${esc(me && me.name ? me.name : '')}" data-nav>
        <small class="fr-hint">Up to 32 characters. Leave it empty to show your username.</small>
        <div class="fr-lbl">Colour</div>
        <div class="fr-colors" role="radiogroup" aria-label="Colour">${this.swatches().map((c, i) => { const on = me ? (me.avatar || 'gold') === c : c === this.swatches()[0]; return `<button type="button" class="fr-av fr-c-${c}${on ? ' sel' : ''}" role="radio" aria-checked="${on}" aria-label="${c}" data-nav data-frcol="${c}"></button>`; }).join('')}</div>
        ${me ? '' : `${sw('frOnline', CFG.frOnline !== false, 'Show friends when I’m online', 'Turn off to appear offline.')}
        ${sw('frWatching', CFG.frWatching === true, 'Show friends what I’m watching', 'Off until you turn it on. Only the title, and only to friends you accepted.')}
        ${sw('frFindable', !!CFG.frFindable, 'Suggest me in search', 'Off: people must type your whole username.')}
        <p class="tour-note">Calls are off until you turn them on in Settings › Friends. You can change everything there later.</p>`}
      </div>
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="frSave"><i data-lucide="check"></i>Save</button>${me ? '<button class="btn btn-ghost" type="button" data-nav id="frCancel">Cancel</button>' : ''}</div>`;
    icons();
    const u = $('#frUser', b), nm = $('#frName', b); if (IS_TV) { TvType.guard(u); TvType.guard(nm); }
    let col = me && this.swatches().includes(me.avatar) ? me.avatar : this.swatches()[0];
    if (this.staff == null && Account.user) { this.staff = false; this.rpc('mkc_am_staff').then((v) => { this.staff = v === true; if (this.staff && b.isConnected && $('#frUser', b)) this.paintSetup(b, edit); }).catch(() => {}); }
    const cx = $('#frCancel', b); if (cx) cx.onclick = () => { this.mode = ''; this.paint(); };
    $$('[data-frcol]', b).forEach((x) => x.addEventListener('click', () => { col = x.dataset.frcol; $$('[data-frcol]', b).forEach((y) => { const on = y === x; y.classList.toggle('sel', on); y.setAttribute('aria-checked', on); }); }));
    $$('[data-frset]', b).forEach((x) => x.addEventListener('click', () => { const v = !x.classList.contains('on'); x.classList.toggle('on', v); x.setAttribute('aria-checked', v); setCfg(x.dataset.frset, v); }));
    u.addEventListener('input', () => { const v = u.value.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, ''); if (v !== u.value) u.value = v; });
    $('#frSave', b).onclick = async (e) => {
      const name = (u.value || '').trim(); if (!/^[a-z0-9_]{3,20}$/.test(name)) { $('#frUserHint', b).textContent = 'Use 3 to 20 letters, numbers or _'; $('#frUserHint', b).classList.add('err'); u.focus(); return; }
      e.currentTarget.disabled = true;
      try { await this.saveMe({ username: name, name: nm.value.trim(), avatar: col, findable: !!CFG.frFindable, calls: CFG.frCalls || 'off' }); toast(me ? 'Profile saved' : `You are @${this.me.username}`, 'ok'); this.mode = 'list'; await this.refresh(); this.beat(true); this.paint(); }
      catch (err) { $('#frUserHint', b).textContent = err.message || String(err); $('#frUserHint', b).classList.add('err'); }
      finally { const s = $('#frSave', b); if (s) s.disabled = false; }
    };
    this.focusFirst(b);
  },
  paintShell(b) {
    this.mode = 'list';
    b.innerHTML = `${typeof Social !== 'undefined' ? Social.tabs() : ''}<div class="fr-top fr-tophead">${this.av(Object.assign({}, this.me, { on: CFG.frOnline !== false }), true)}<div class="fr-who"><b>${esc(this.me.name || this.me.username)}</b><small>@${esc(this.me.username)} · ${CFG.frOnline !== false ? 'Online' : 'Appearing offline'}</small></div>
        <button class="btn btn-ghost btn-sm" type="button" data-nav data-fr="edit" aria-label="Edit profile"><i data-lucide="pencil"></i><span>Edit</span></button><button class="btn btn-ghost btn-sm" type="button" data-nav data-fr="settings" aria-label="Privacy settings"><i data-lucide="settings-2"></i><span>Privacy</span></button></div>
      <div id="frCallBox"></div>
      <div class="fr-find"><i data-lucide="user-plus"></i><input class="inp" id="frQ" maxlength="21" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Add a friend: type their username" aria-label="Find a friend by username" data-nav></div>
      <div id="frRes" class="fr-res" aria-live="polite"></div>
      <div id="frLists"></div>`;
    icons(); this.bindCommon(b); if (typeof Social !== 'undefined') Social.bind(b);
    const q = $('#frQ', b); if (IS_TV) TvType.guard(q);
    q.addEventListener('input', () => { clearTimeout(this.qT); this.qT = setTimeout(() => this.search(), 320); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !q.readOnly) this.search(); });
    this.focusFirst(b);
  },
  async search(again) {
    const q = $('#frQ'), box = $('#frRes'); if (!q || !box) return;
    const s = q.value.trim().toLowerCase().replace(/^@/, '');
    if (s.length < 2) { box.innerHTML = ''; return; }
    if (!again) box.innerHTML = '<p class="fr-dim">Searching…</p>';
    let r = []; try { r = (await this.rpc('mkc_find', { q: s })) || []; } catch (e) { box.innerHTML = `<p class="fr-dim">${esc(e.message)}</p>`; return; }
    if ($('#frQ') !== q || q.value.trim().toLowerCase().replace(/^@/, '') !== s) return;
    box.innerHTML = r.length ? r.map((u) => {
      const act = u.rel === 'friend' ? '<span class="fr-tag">Friends</span>' : u.rel === 'out' ? '<span class="fr-tag">Request sent</span>' : u.rel === 'in' ? `<button class="btn btn-prime btn-sm" type="button" data-nav data-fr="accept" data-id="${esc(u.id)}">Accept</button>`
        : `<button class="btn btn-prime btn-sm" type="button" data-nav data-fr="add" data-id="${esc(u.id)}"><i data-lucide="user-plus"></i>Add</button>`;
      return `<div class="fr-row">${this.av(u)}<div class="fr-who"><b>${esc(u.name || u.username)}</b><small>@${esc(u.username)}</small></div><div class="fr-acts">${act}</div></div>`;
    }).join('') : `<p class="fr-dim">No one found as @${esc(s)}. Check the spelling: usernames must match exactly unless the person turned on search suggestions.</p>`;
    icons();
  },
  paintLists() {
    const box = $('#frLists'); if (!box) return;
    const keep = document.activeElement && box.contains(document.activeElement) ? { fr: document.activeElement.dataset.fr, id: document.activeElement.dataset.id } : null;
    const by = (s) => this.list.filter((f) => f.state === s);
    const friends = by('friend').sort((a, b) => (b.on - a.on) || ((b.unread || 0) - (a.unread || 0)) || String(b.last || '').localeCompare(String(a.last || '')) || a.username.localeCompare(b.username));
    const row = (f) => {
      let acts = '';
      if (f.state === 'in') acts = `<button class="btn btn-prime btn-sm" type="button" data-nav data-fr="accept" data-id="${esc(f.id)}"><i data-lucide="check"></i>Accept</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-fr="decline" data-id="${esc(f.id)}">Decline</button><button class="ibtn sm" type="button" data-nav data-fr="more" data-id="${esc(f.id)}" aria-label="More"><i data-lucide="menu"></i></button>`;
      else if (f.state === 'out') acts = `<button class="btn btn-ghost btn-sm" type="button" data-nav data-fr="cancel" data-id="${esc(f.id)}">Cancel</button>`;
      else if (f.state === 'blocked') acts = `<button class="btn btn-ghost btn-sm" type="button" data-nav data-fr="unblock" data-id="${esc(f.id)}">Unblock</button>`;
      else {
        const [can, why] = this.canCall(f);
        acts = `${f.watching && f.watching.id ? `<button class="btn btn-ghost btn-sm hide-xs" type="button" data-nav data-fr="watch" data-id="${esc(f.id)}"><i data-lucide="film"></i>Open</button>` : ''}
          <button class="ibtn sm fr-msg" type="button" data-nav data-fr="chat" data-id="${esc(f.id)}" aria-label="Message ${esc(this.label(f))}"><i data-lucide="message-circle"></i>${f.unread ? `<span class="fr-dot tnum">${f.unread > 9 ? '9+' : f.unread}</span>` : ''}</button>
          <button class="ibtn sm" type="button" data-nav data-fr="call" data-id="${esc(f.id)}" ${can ? '' : 'disabled'} aria-label="${can ? `Call ${esc(this.label(f))}` : esc(why)}" title="${can ? 'Call' : esc(why)}"><i data-lucide="phone"></i></button>
          <button class="ibtn sm" type="button" data-nav data-fr="more" data-id="${esc(f.id)}" aria-label="More for ${esc(this.label(f))}"><i data-lucide="menu"></i></button>`;
      }
      const w = f.state === 'friend' && f.on && f.watching;
      return `<div class="fr-row${w ? ' watching' : ''}${f.state === 'in' ? ' req' : ''}" data-fid="${esc(f.id)}">${f.state === 'friend' ? `<button type="button" class="fr-whob" data-nav data-fr="profile" data-id="${esc(f.id)}" aria-label="Profile of ${esc(this.label(f))}">` : ''}${this.av(f)}<div class="fr-who"><b>${esc(f.name || f.username)}</b><small>${f.name ? `@${esc(f.username)} · ` : ''}<span class="${f.on ? 'fr-live' : ''}">${esc(this.status(f))}</span></small></div>${f.state === 'friend' ? '</button>' : ''}<div class="fr-acts">${acts}</div></div>`;
    };
    const sec = (title, l, empty) => (l.length || empty ? `<div class="fr-sec"><h4>${title}${l.length ? ` <span class="fr-dim tnum">${l.length}</span>` : ''}</h4>${l.length ? l.map(row).join('') : `<p class="fr-dim">${empty}</p>`}</div>` : '');
    const blocked = by('blocked');
    box.innerHTML = sec('Requests', by('in'), '') + sec('Friends', friends, this.loaded ? 'No friends yet. Type a username above to send a request.' : 'Loading…') + sec('Sent', by('out'), '')
      + (blocked.length ? `<details class="fr-sec fr-blocked"><summary data-nav>Blocked <span class="fr-dim tnum">${blocked.length}</span></summary>${blocked.map(row).join('')}</details>` : '');
    icons(); this.paintCall();
    if (keep) { const el = $(`[data-fr="${CSS.escape(keep.fr || '')}"][data-id="${CSS.escape(keep.id || '')}"]`, box) || $(`[data-id="${CSS.escape(keep.id || '')}"]`, box); if (el && IS_TV) Nav.focus(el, true); else if (el) el.focus({ preventScroll: true }); }
  },
  paintCall() {
    const box = $('#frCallBox'); if (!box) return;
    const c = typeof FCall !== 'undefined' ? FCall.st : null;
    box.innerHTML = c && c.state !== 'ringing-in' ? `<div class="fr-incall">${this.av(c.peer)}<div class="fr-who"><b>${esc(this.label(c.peer))}</b><small>${esc(FCall.line())}</small></div><div class="fr-acts">
      <button class="ibtn sm" type="button" data-nav data-fr="mute" aria-label="${c.muted ? 'Unmute' : 'Mute'}"><i data-lucide="${c.muted ? 'mic-off' : 'mic'}"></i></button>
      <button class="ibtn sm" type="button" data-nav data-fr="cam" aria-label="Camera"><i data-lucide="${c.cam ? 'video' : 'video-off'}"></i></button>
      <button class="btn btn-sm fr-hang" type="button" data-nav data-fr="hang"><i data-lucide="phone"></i>End</button></div></div>` : '';
    icons();
  },
  more(f) {
    if (!f) return;
    X8.layer('frMore', { label: 'Friend', icon: 'users', eyebrow: f.name || `@${f.username}` });
    const b = X8.body('frMore');
    const items = [
      f.state === 'friend' ? ['user-x', 'Remove friend', 'remove'] : null,
      ['user-x', 'Block', 'block'],
      ['alert-triangle', 'Report and block', 'report'],
    ].filter(Boolean);
    b.innerHTML = `<h3 class="x8-h">${esc(f.name || f.username)}</h3><p class="x8-p">@${esc(f.username)}. Removing or blocking is silent: they are not told. Blocking also hides you from their search and stops their messages and calls.</p>
      <div class="fr-menu">${items.map(([ic, l, k]) => `<button class="btn btn-ghost${k !== 'remove' ? ' danger' : ''}" type="button" data-nav data-frm="${k}"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div>
      <div class="fr-report" hidden><label class="fr-lbl" for="frWhy">What happened? <span class="fr-dim">(optional)</span></label><textarea class="inp" id="frWhy" maxlength="500" rows="3" data-nav></textarea>
      <p class="tour-note">The report includes your last 30 messages with them, so it can be checked.</p><div class="actions"><button class="btn btn-prime" type="button" data-nav data-frm="send">Send report and block</button></div></div>`;
    icons(); X8.open('frMore');
    const why = $('#frWhy', b); if (IS_TV) TvType.guard(why);
    b.onclick = (e) => {
      const x = e.target.closest('[data-frm]'); if (!x) return;
      const k = x.dataset.frm, done = (msg) => { X8.close('frMore'); if (msg) toast(msg, 'ok'); if (this.chat && this.chat.id === f.id && k !== 'remove') this.closeChat(); };
      if (k === 'remove') this.act(x, () => this.rpc('mkc_friend_remove', { other: f.id }), () => { done(`${this.label(f)} removed`); if (this.chat && this.chat.id === f.id) this.closeChat(); });
      if (k === 'block') this.act(x, () => this.rpc('mkc_block', { other: f.id, on_: true }), () => done(`${this.label(f)} blocked`));
      if (k === 'report') { $('.fr-report', b).hidden = false; $('.fr-menu', b).hidden = true; if (IS_TV) Nav.focus(why, true); else why.focus(); }
      if (k === 'send') this.act(x, () => this.rpc('mkc_report', { other: f.id, reason: why.value.trim() }), () => done('Thanks. They are blocked, and the report was sent.'));
    };
    this.focusFirst(b);
  },

  /* ---- messages ---- */
  openChat(f) {
    const b = X8.body('friendsLayer'); if (!b) return;
    this.chat = f; this.msgs = []; this.mode = 'chat';
    b.innerHTML = `<div class="fr-chathead"><button class="ibtn sm" type="button" data-nav id="frBack" aria-label="Back to friends"><i data-lucide="arrow-left"></i></button><div id="frChatWho" class="fr-chatwho"></div>
        <div class="fr-acts"><button class="btn btn-ghost btn-sm" type="button" data-nav id="frParty"><i data-lucide="popcorn"></i><span>Watch together</span></button><button class="ibtn sm" type="button" data-nav id="frCallBtn" aria-label="Call"><i data-lucide="phone"></i></button></div></div>
      <div id="frCallBox"></div>
      <div class="fr-msgs" id="frMsgs" role="log" aria-live="polite" tabindex="-1"><p class="fr-dim">Loading…</p></div>
      <div class="fr-send"><input class="inp" id="frText" maxlength="1000" autocomplete="off" placeholder="Message ${esc(this.label(f))}" aria-label="Message" data-nav><button class="btn btn-prime btn-sm" type="button" data-nav id="frSend" aria-label="Send"><i data-lucide="send"></i></button></div>`;
    icons(); this.bindCommon(b);
    const t = $('#frText', b); if (IS_TV) TvType.guard(t);
    $('#frBack', b).onclick = () => this.closeChat();
    $('#frSend', b).onclick = () => this.send();
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !t.readOnly) { e.preventDefault(); this.send(); } });
    $('#frParty', b).onclick = () => this.inviteParty();
    $('#frCallBtn', b).onclick = () => { const c = this.byId(f.id); if (c) FCall.start(c); };
    $('#frMsgs', b).addEventListener('click', (e) => {
      const j = e.target.closest('[data-frjoin]'); if (j) { X8.close('friendsLayer'); Party.join(j.dataset.frjoin).then(() => Party.openPanel()); return; }
      const o = e.target.closest('[data-frback]'); if (o) { const c = this.byId(f.id); if (c) FCall.start(c); }
    });
    this.paintChatHead(); this.paintCall(); this.loadChat();
    if (IS_TV) Nav.focus(t, true); else if (!TOUCH_UI) t.focus({ preventScroll: true });
  },
  closeChat() { this.chat = null; this.mode = ''; const b = X8.body('friendsLayer'); if (b) { b.innerHTML = ''; this.paint(); } },
  paintChatHead() {
    const f = this.chat, w = $('#frChatWho'); if (!f || !w) return;
    w.innerHTML = `${this.av(f)}<div class="fr-who"><b>${esc(f.name || f.username)}</b><small class="${f.on ? 'fr-live' : ''}">${esc(this.status(f))}</small></div>`;
    const [can, why] = this.canCall(f), cb = $('#frCallBtn'); if (cb) { cb.disabled = !can; cb.title = can ? 'Call' : why; cb.setAttribute('aria-label', can ? 'Call' : why); }
  },
  async loadChat(fresh) {
    const f = this.chat; if (!f) return;
    let l = []; try { l = (await this.rpc('mkc_chat', { other: f.id, before_id: null })) || []; } catch (e) { const m = $('#frMsgs'); if (m) m.innerHTML = `<p class="fr-dim">${esc(e.message)}</p>`; return; }
    if (this.chat !== f && (!this.chat || this.chat.id !== f.id)) return;
    this.msgs = l; this.paintMsgs();
    if (l.some((m) => m.sender === f.id && !m.read_at) || f.unread) { this.rpc('mkc_read', { other: f.id }).then(() => { f.unread = 0; this.badge(); }).catch(() => {}); }
    if (fresh) this.refresh();
  },
  paintMsgs() {
    const box = $('#frMsgs'); if (!box || !this.chat) return;
    const me = Account.user.id, day = (t) => new Date(t).toDateString();
    let prev = '';
    box.innerHTML = this.msgs.length ? this.msgs.map((m) => {
      const mine = m.sender === me, d = day(m.created_at), sep = d !== prev ? `<div class="fr-day">${esc(new Date(m.created_at).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }))}</div>` : ''; prev = d;
      const time = new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      let body = esc(m.body);
      if (m.kind === 'party' && /^[A-Z2-9]{6}$/.test(m.body)) body = mine ? `You invited them to watch party <b class="mono">${esc(m.body)}</b>` : `<span>Watch party <b class="mono">${esc(m.body)}</b></span><button class="btn btn-prime btn-sm" type="button" data-nav data-frjoin="${esc(m.body)}"><i data-lucide="popcorn"></i>Join</button>`;
      if (m.kind === 'call') body = `<span class="fr-callnote"><i data-lucide="phone"></i>${esc(m.body)}</span>${mine ? '' : ' <button class="linkish" type="button" data-nav data-frback="1">Call back</button>'}`;
      return `${sep}<div class="fr-msg-r${mine ? ' me' : ''}${m.kind !== 'text' ? ' sys' : ''}"><div class="fr-bub">${body}<small class="tnum">${esc(time)}</small></div></div>`;
    }).join('') : `<p class="fr-dim fr-empty">Say hello to ${esc(this.label(this.chat))}. Messages are only between the two of you.</p>`;
    icons(); box.scrollTop = box.scrollHeight;
  },
  async send(kind = 'text', text) {
    const f = this.chat, t = $('#frText'); if (!f) return;
    const body = text != null ? text : (t ? t.value.trim() : ''); if (!body) return;
    if (kind === 'text' && t) t.value = '';
    try {
      const m = await this.rpc('mkc_send', { other: f.id, p_kind: kind, p_body: body });
      if (m && this.chat && this.chat.id === f.id) { this.msgs.push(m); this.paintMsgs(); }
      this.poke(f.id, { t: 'm', x: kind === 'text' ? body.slice(0, 80) : kind === 'party' ? 'invited you to a watch party' : body.slice(0, 40) });
    } catch (e) { if (kind === 'text' && t && !t.value) t.value = body; toast(e.message || String(e), 'err', 5000); }
  },
  async sendTo(f, kind, body) {
    try { await this.rpc('mkc_send', { other: f.id, p_kind: kind, p_body: body }); this.poke(f.id, { t: 'm', x: body.slice(0, 40) }); } catch (e) { /* best effort */ }
  },
  async inviteParty() {
    if (!this.chat) return;
    if (!Party.code) await Party.create();
    if (!Party.code) return;
    await this.send('party', Party.code);
    toast('Invite sent. They can join from the chat.', 'ok', 3600);
  },

  /* ---- wiring ---- */
  init() {
    // the Friends button sits next to Watch party, so it shows wherever the menu does (top bar, side rail, phone More)
    const party = $('#openParty');
    if (party && !$('#openFriends')) {
      party.insertAdjacentHTML('beforebegin', '<button class="ibtn" id="openFriends" data-nav type="button" title="Friends" aria-label="Friends"><i data-lucide="message-circle"></i></button>');
      $('#openFriends').onclick = () => this.open();
    }
    const items = SideNav.items;
    SideNav.items = function () { const r = items.apply(this, arguments); if ($('#openFriends') && !Friends.kids() && !r.tools.some((t) => t[0] === 'openFriends')) { const i = r.tools.findIndex((t) => t[0] === 'openParty'); r.tools.splice(i < 0 ? r.tools.length : i, 0, ['openFriends', 'message-circle', 'Friends']); } return r; };
    if (this.kids()) { const b = $('#openFriends'); if (b) b.hidden = true; return; }
    COMMANDS.push({ label: 'Friends', icon: 'message-circle', run: () => this.open() });
    // follow sign-in and sign-out
    const su = Account.setUser;
    Account.setUser = function (user) { const before = this.user && this.user.id, r = su.apply(this, arguments); const now = this.user && this.user.id; if (now !== before) setTimeout(() => (now ? Friends.start() : Friends.stop()), 0); return r; };
    if (Account.user) setTimeout(() => this.start(), 1500);
    // status changes: a film starting or stopping, the app hidden or shown
    const ol = openLayer; openLayer = function (id) { const r = ol.apply(this, arguments); if (id === 'player') setTimeout(() => Friends.beat(), 4000); return r; };
    const cl = closeLayer; closeLayer = function (id) { const r = cl.apply(this, arguments); if (id === 'player') setTimeout(() => Friends.beat(), 800); return r; };
    document.addEventListener('visibilitychange', () => { if (!this.me) return; if (document.visibilityState === 'hidden') { this.last = ''; this.here(false).catch(() => {}); } else { this.beat(true); this.refresh(); } });
    // watch party names come from the username instead of the email
    const pn = Party.name; Party.name = function () { if (!CFG.partyName && Friends.me) return Friends.me.name || Friends.me.username; return pn.apply(this, arguments); };
    // Settings › Friends
    if (!secById('friends')) {
      SECTIONS.push({ id: 'friends', icon: 'message-circle', label: 'Friends', intro: 'Who can see you, find you and call you. Only friends you accepted ever see your status.', rows: () => this.settingsRows(), bind: () => { const x = $('#set-frOpen'); if (x) x.onclick = () => { closeLayer('settings'); Friends.edit(); }; } });
      const g = SET_GROUPS.find((x) => x[0] === 'Connected'); if (g) g[1].splice(0, 0, 'friends');
    }
  },
  settingsRows() {
    const srv = (k, v) => { setCfg(k, v); if (this.me) this.saveMe({ [k === 'frCalls' ? 'calls' : 'findable']: v }).catch((e) => toast(e.message, 'err')); };
    return [
      { html: () => `<div class="set-row"><div><b>Your profile</b><small>${this.me ? `@${esc(this.me.username)}${this.me.name ? ` · ${esc(this.me.name)}` : ''}` : Account.user ? 'Not chosen yet' : 'Sign in to add friends'}</small></div><button class="btn btn-ghost btn-sm" type="button" id="set-frOpen" data-nav><i data-lucide="${this.me ? 'pencil' : 'message-circle'}"></i>${this.me ? 'Edit name' : 'Set up'}</button></div>` },
      { key: 'frOnline', label: 'Show friends when I’m online', help: 'Off makes you appear offline, with no “last seen”.', type: 'toggle', get: () => CFG.frOnline !== false, set: (v) => { setCfg('frOnline', v); this.beat(true); } },
      { key: 'frWatching', label: 'Show friends what I’m watching', help: 'Off until you turn it on. The title and episode only, and only to friends you accepted.', type: 'toggle', get: () => CFG.frWatching === true, set: (v) => { setCfg('frWatching', v); this.beat(true); } },
      { key: 'frCalls', label: 'Incoming calls', help: '“When I’m not watching” never rings during a film: friends see that you are busy, and you get a missed call in the chat.', type: 'seg', options: [['off', 'Off'], ['idle', 'When I’m not watching'], ['on', 'Always']], get: () => CFG.frCalls || 'off', set: (v) => srv('frCalls', v) },
      { key: 'frRing', label: 'Ring sound', help: 'A soft ring for incoming calls. Off shows the call silently.', type: 'toggle', get: () => CFG.frRing !== false, set: (v) => setCfg('frRing', v) },
      { key: 'frFindable', label: 'Suggest me in search', help: 'Off: people must type your whole username to find you.', type: 'toggle', get: () => !!CFG.frFindable, set: (v) => srv('frFindable', v) },
      ...(typeof Social !== 'undefined' ? Social.settingsRows() : []),
    ];
  },
};

/* ---------------- 2.63 Friend calls: one-to-one voice, camera optional, device to device ----------------
   Ringing travels through the friend's private inbox; the call itself joins a private channel only the two friends
   can open (mkc-call:<a>:<b>), and WebRTC carries the sound (relay logins from MkIce when a direct link fails). */
const FCall = {
  st: null, ringT: 0, toneT: 0, tickT: 0,
  topic(a, b) { return `mkc-call:${[a, b].sort().join(':')}`; },
  line() {
    const s = this.st; if (!s) return '';
    if (s.state === 'ringing-out') return 'Ringing…';
    if (s.state === 'connecting') return 'Connecting…';
    if (s.state === 'live') { const t = Math.floor((Date.now() - s.t0) / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}${s.muted ? ' · muted' : ''}${s.noMic ? ' · listening only' : ''}`; }
    return '';
  },
  async join(s) {
    const ch = Account.client.channel(this.topic(Account.user.id, s.peer.id), { config: { private: true, broadcast: { self: false } } });
    ch.on('broadcast', { event: 'c' }, (m) => this.onSig(m && m.payload));
    s.ch = ch;
    return new Promise((res) => { const t = setTimeout(() => res(false), 8000); ch.subscribe((st) => { if (st === 'SUBSCRIBED') { clearTimeout(t); res(true); } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(t); res(false); } }); });
  },
  sig(msg) { const s = this.st; if (s && s.ch) s.ch.send({ type: 'broadcast', event: 'c', payload: { ...msg, cid: s.cid, dev: s.dev } }).catch(() => {}); },
  async start(f) {
    if (this.st) { toast('You are already in a call', 'info'); return; }
    const [can, why] = Friends.canCall(f); if (!can) { toast(why || 'They can’t take calls right now', 'info'); return; }
    if (!window.isSecureContext) { toast('Calls need MKCinema on an https address', 'err'); return; }
    const s = this.st = { cid: rid(10), dev: rid(6), peer: f, dir: 'out', state: 'ringing-out', muted: false, cam: false };
    Friends.paintCall(); this.bar();
    if (!(await this.join(s)) || this.st !== s) { if (this.st === s) { toast('Could not start the call. Check your connection.', 'err'); this.end('fail', true); } return; }
    Friends.poke(f.id, { t: 'ring', cid: s.cid, name: Friends.me ? (Friends.me.name || Friends.me.username) : '' });
    clearTimeout(this.ringT); this.ringT = setTimeout(() => { if (this.st === s && s.state === 'ringing-out') { Friends.sendTo(f, 'call', 'Missed call'); Friends.poke(f.id, { t: 'cx', cid: s.cid }); toast(`${Friends.label(f)} didn’t answer`, 'info'); this.end('timeout', true); } }, 35000);
  },
  /* from my inbox */
  inbox(p, from) {
    const f = Friends.byId(from), s = this.st;
    if (p.t === 'ring') {
      if (!f || f.state !== 'friend' || typeof p.cid !== 'string') { Friends.refresh(); return; }
      const mode = CFG.frCalls || 'off';
      if (mode === 'off') return;
      if (s) { Friends.poke(from, { t: 'busy', cid: p.cid }); return; }
      if (mode === 'idle' && Friends.playerOpen()) { Friends.poke(from, { t: 'busy', cid: p.cid }); return; }
      this.ringIn(f, p.cid);
      return;
    }
    if (!s || p.cid !== s.cid) return;
    if (p.t === 'busy' && s.dir === 'out' && s.state === 'ringing-out') { Friends.sendTo(s.peer, 'call', 'Missed call'); toast(`${Friends.label(s.peer)} can’t take calls right now`, 'info'); this.end('busy', true); }
    // the caller stopped ringing, or another of my devices answered
    if (p.t === 'cx' && s.dir === 'in' && s.state === 'ringing-in') { this.end('cancel', true); }
    if (p.t === 'ok' && s.dir === 'in' && s.state === 'ringing-in' && p.dev !== s.dev) { this.end('elsewhere', true); }
  },
  ringIn(f, cid) {
    const s = this.st = { cid, dev: rid(6), peer: f, dir: 'in', state: 'ringing-in', muted: false, cam: false };
    X8.layer('fcRing', { label: 'Incoming call', icon: 'phone', eyebrow: 'Call' });
    const b = X8.body('fcRing');
    b.innerHTML = `<div class="fc-ring">${Friends.av(f, true)}<h3 class="x8-h">${esc(Friends.label(f))}</h3><p class="x8-p">is calling you</p>
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="fcYes"><i data-lucide="phone"></i>Answer</button><button class="btn btn-ghost" type="button" data-nav id="fcCam"><i data-lucide="video"></i>With camera</button><button class="btn btn-ghost danger" type="button" data-nav id="fcNo"><i data-lucide="x"></i>Decline</button></div></div>`;
    icons(); X8.open('fcRing');
    X8.onClose.fcRing = () => { if (this.st === s && s.state === 'ringing-in') this.decline(); };
    $('#fcYes', b).onclick = () => this.answer(false);
    $('#fcCam', b).onclick = () => this.answer(true);
    $('#fcNo', b).onclick = () => this.decline();
    if (IS_TV) Nav.focus($('#fcYes', b), true);
    // a soft ring every two seconds, unless sounds are off
    clearInterval(this.toneT);
    const ring = () => { if (CFG.frRing === false || CFG.uiSounds === false || typeof UiSound === 'undefined') return; try { UiSound.tone(660, 880, 220, 0.05); setTimeout(() => UiSound.tone(880, 660, 220, 0.04), 260); } catch (e) { /* no audio */ } };
    ring(); this.toneT = setInterval(ring, 2200);
    clearTimeout(this.ringT); this.ringT = setTimeout(() => { if (this.st === s && s.state === 'ringing-in') this.end('missed', true); }, 36000);
    if (Friends.playerOpen() && !video.paused) toast(`${Friends.label(f)} is calling`, 'info', 4000, 'friends');
  },
  decline() { const s = this.st; if (!s) return; Friends.poke(s.peer.id, { t: 'busy', cid: s.cid }); this.end('declined', true); },
  async answer(withCam) {
    const s = this.st; if (!s || s.state !== 'ringing-in') return;
    clearInterval(this.toneT); s.state = 'connecting'; X8.onClose.fcRing = null; X8.close('fcRing'); this.bar();
    if (!(await this.join(s)) || this.st !== s) { if (this.st === s) { toast('Could not connect the call', 'err'); this.end('fail', true); } return; }
    Friends.poke(s.peer.id, { t: 'ok', cid: s.cid, dev: s.dev }); // my other devices stop ringing
    await this.media(s, withCam);
    this.peer(s);
    this.sig({ t: 'ok' });
  },
  async media(s, withCam) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { s.noMic = true; return; }
    try { s.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { s.noMic = true; toast('No microphone here: you can hear them, they can’t hear you', 'info', 5000); }
    if (withCam) await this.camOn(s);
  },
  async camOn(s) {
    try { s.camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } }); s.cam = true; }
    catch (e) { toast('Camera permission was not given', 'err'); s.cam = false; return; }
    if (s.pc) s.camStream.getTracks().forEach((t) => { s.vSender = s.pc.addTrack(t, s.camStream); });
    this.bar();
  },
  async peer(s) {
    if (s.pc) return;
    if (typeof MkIce !== 'undefined') await MkIce.ready(2500);
    if (this.st !== s) return;
    const pc = s.pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }] });
    s.polite = s.dir === 'in'; s.makingOffer = false; s.ignoreOffer = false;
    pc.onnegotiationneeded = async () => { try { s.makingOffer = true; await pc.setLocalDescription(); this.sig({ t: 'sdp', d: pc.localDescription && pc.localDescription.toJSON() }); } catch (e) { /* retried */ } finally { s.makingOffer = false; } };
    pc.onicecandidate = ({ candidate }) => { if (candidate) this.sig({ t: 'ice', c: candidate.toJSON() }); };
    pc.ontrack = (e) => this.trackIn(s, e);
    pc.onconnectionstatechange = () => {
      if (this.st !== s) return;
      if (pc.connectionState === 'connected' && s.state !== 'live') { s.state = 'live'; s.t0 = Date.now(); clearInterval(this.tickT); this.tickT = setInterval(() => this.tick(), 1000); this.bar(); Friends.paintCall(); if (typeof Duck !== 'undefined') Duck.set(true); }
      if (pc.connectionState === 'failed') { try { pc.restartIce(); } catch (e) { /* old browser */ } }
      if (pc.connectionState === 'disconnected') { clearTimeout(s.dropT); s.dropT = setTimeout(() => { if (this.st === s && pc.connectionState !== 'connected') { toast('The call dropped', 'info'); this.end('drop', true); } }, 15000); }
    };
    if (s.mic) s.mic.getTracks().forEach((t) => pc.addTrack(t, s.mic));
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    if (s.camStream) s.camStream.getTracks().forEach((t) => { s.vSender = pc.addTrack(t, s.camStream); });
  },
  async onSig(m) {
    const s = this.st; if (!m || !s || m.cid !== s.cid || m.dev === s.dev) return;
    if (m.t === 'ok' && s.dir === 'out' && s.state === 'ringing-out') { clearTimeout(this.ringT); s.state = 'connecting'; s.peerDev = m.dev; Friends.poke(s.peer.id, { t: 'cx', cid: s.cid }); this.bar(); await this.media(s, false); this.peer(s); return; }
    if (s.peerDev && m.dev !== s.peerDev) return;
    if (m.t === 'bye') { toast(`${Friends.label(s.peer)} ended the call`, 'info'); this.end('bye', true); return; }
    const pc = s.pc; if (!pc) return;
    try {
      if (m.t === 'sdp' && m.d) {
        const collision = m.d.type === 'offer' && (s.makingOffer || pc.signalingState !== 'stable');
        s.ignoreOffer = !s.polite && collision; if (s.ignoreOffer) return;
        await pc.setRemoteDescription(m.d);
        if (m.d.type === 'offer') { await pc.setLocalDescription(); this.sig({ t: 'sdp', d: pc.localDescription.toJSON() }); }
      } else if (m.t === 'ice' && m.c) { try { await pc.addIceCandidate(m.c); } catch (e) { if (!s.ignoreOffer) throw e; } }
    } catch (e) { console.warn('call signalling', e); }
  },
  trackIn(s, e) {
    const stream = e.streams[0] || new MediaStream([e.track]);
    if (e.track.kind === 'audio') {
      if (!s.audio) { s.audio = document.createElement('audio'); s.audio.autoplay = true; s.audio.playsInline = true; s.audio.hidden = true; document.body.appendChild(s.audio); }
      s.audio.srcObject = stream; s.audio.play().catch(() => {});
    } else {
      s.rv = stream; const v = $('#fcBar video.fc-them'); if (v) { v.srcObject = stream; v.play().catch(() => {}); }
      e.track.onunmute = () => this.bar(); e.track.onmute = () => this.bar(); e.track.onended = () => { s.rv = null; this.bar(); };
      this.bar();
    }
  },
  mute() { const s = this.st; if (!s || !s.mic) return; s.muted = !s.muted; s.mic.getAudioTracks().forEach((t) => { t.enabled = !s.muted; }); this.bar(); Friends.paintCall(); },
  async cam() {
    const s = this.st; if (!s) return;
    if (s.cam) { if (s.camStream) s.camStream.getTracks().forEach((t) => t.stop()); if (s.pc && s.vSender) { try { s.pc.removeTrack(s.vSender); } catch (e) { /* closed */ } } s.vSender = null; s.camStream = null; s.cam = false; this.bar(); Friends.paintCall(); return; }
    await this.camOn(s); Friends.paintCall();
  },
  tick() { const t = $('#fcBar .fc-line'); if (t) t.textContent = this.line(); const c = $('#frCallBox .fr-who small'); if (c) c.textContent = this.line(); },
  /* a small call bar over everything (bottom right), with the friend's camera when they share it */
  bar() {
    const s = this.st; let b = $('#fcBar');
    if (!s || s.state === 'ringing-in') { if (b) b.hidden = true; return; }
    if (!b) {
      b = document.createElement('div'); b.id = 'fcBar'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Call');
      b.addEventListener('click', (e) => { const x = e.target.closest('[data-fc]'); if (!x) return; const k = x.dataset.fc; if (k === 'end') this.end('hang'); if (k === 'mute') this.mute(); if (k === 'cam') this.cam(); if (k === 'open') Friends.open(s && s.peer && s.peer.id); });
      document.body.appendChild(b);
    }
    const showV = !!(s.rv && s.rv.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted));
    b.innerHTML = `${showV ? '<video class="fc-them" autoplay playsinline muted></video>' : ''}${s.cam && s.camStream ? '<video class="fc-me" autoplay playsinline muted></video>' : ''}
      <div class="fc-row"><button class="fc-who" type="button" data-fc="open" data-nav>${Friends.av(s.peer)}<span><b>${esc(Friends.label(s.peer))}</b><small class="fc-line tnum">${esc(this.line())}</small></span></button>
      ${s.state === 'ringing-out' ? '' : `<button class="ibtn sm" type="button" data-fc="mute" data-nav aria-label="${s.muted ? 'Unmute' : 'Mute'}" ${s.mic ? '' : 'disabled'}><i data-lucide="${s.muted ? 'mic-off' : 'mic'}"></i></button>
      <button class="ibtn sm" type="button" data-fc="cam" data-nav aria-label="${s.cam ? 'Camera off' : 'Camera on'}"><i data-lucide="${s.cam ? 'video' : 'video-off'}"></i></button>`}
      <button class="ibtn sm fc-end" type="button" data-fc="end" data-nav aria-label="End call"><i data-lucide="phone"></i></button></div>`;
    b.hidden = false; icons();
    const tv = $('video.fc-them', b); if (tv) { tv.srcObject = s.rv; tv.play().catch(() => {}); }
    const mv = $('video.fc-me', b); if (mv) { mv.srcObject = s.camStream; mv.play().catch(() => {}); }
    b.classList.toggle('vid', showV);
  },
  end(why, quiet) {
    const s = this.st; if (!s) return;
    if (!quiet || why === 'hang') { if (s.state === 'ringing-out') Friends.poke(s.peer.id, { t: 'cx', cid: s.cid }); else this.sig({ t: 'bye' }); }
    if (why === 'hang' && s.state === 'ringing-out') Friends.sendTo(s.peer, 'call', 'Missed call');
    if (why === 'missed' && s.dir === 'in') Friends.refresh();
    this.st = null; clearTimeout(this.ringT); clearInterval(this.toneT); clearInterval(this.tickT); clearTimeout(s.dropT);
    [s.mic, s.camStream].forEach((m) => { if (m) m.getTracks().forEach((t) => t.stop()); });
    try { if (s.pc) s.pc.close(); } catch (e) { /* closed */ }
    if (s.audio) { s.audio.srcObject = null; s.audio.remove(); }
    const ch = s.ch; if (ch) setTimeout(() => { try { Account.client.removeChannel(ch); } catch (e) { /* gone */ } }, 600);
    if (typeof Duck !== 'undefined' && !(typeof Party !== 'undefined' && Party.speaking && Party.speaking.size)) Duck.set(false);
    X8.onClose.fcRing = null; X8.close('fcRing');
    const b = $('#fcBar'); if (b) { b.hidden = true; b.innerHTML = ''; }
    if (why === 'hang' && s.state === 'live') toast('Call ended', 'info', 1800);
    Friends.paintCall();
  },
};
addEventListener('pagehide', () => { if (FCall.st) FCall.end('hang'); });
// TV: the call bar takes the remote while one of its buttons has focus
{
  const nr = Nav.root;
  Nav.root = function () { const b = $('#fcBar'); if (b && !b.hidden && b.contains(document.activeElement)) return b; return nr.apply(this, arguments); };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Friends.init()); else setTimeout(() => Friends.init(), 0);
