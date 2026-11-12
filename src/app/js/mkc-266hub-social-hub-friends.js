
'use strict';
/* ---------------- 2.66 Social Hub ----------------
   Friends grows into the Social Hub. Inside it: Feed, Friends, Activity and You.
   - Feed: friends post updates and how they feel, tag each other with @username, react and reply. Plain text only:
     nothing is ever turned into a link.
   - Status ("how I'm feeling"): a mood and a short line next to your name, cleared after a few hours or kept.
   - Everything stays between friends you both accepted. The server (social-hub.sql) checks every post, reply, tag and
     reaction, limits how fast anyone can post, and hides a post that several people report.
   - Report, Report and block, and Delete sit on every post. Not on a kids seat. Nothing pops up over a film: while one
     plays, only the badge changes. */
const Hub = {
  feed: [], more: true, filt: 'all', loading: false, feedAt: 0, off: false, fresh: false, err: '',
  posts: new Map(), replies: new Map(), openT: new Set(), prof: new Map(), profBusy: null, single: null, singleP: null, singleDone: false,
  notes: null, notesAt: 0, unseen: 0, status: null, draft: { body: '', mood: null, title: null }, rdraft: {}, tickT: 0, picking: null, cands: [], sugFor: null,
  MOODS: [['hyped', '🤩', 'Hyped'], ['chill', '😌', 'Chill'], ['cozy', '🛋️', 'Cozy'], ['laughing', '😂', 'Giggly'], ['crying', '😭', 'Emotional'], ['scared', '😱', 'Spooked'],
    ['mindblown', '🤯', 'Mind blown'], ['bored', '🥱', 'Bored'], ['sleepy', '😴', 'Sleepy'], ['hungry', '🍿', 'Snacky'], ['romantic', '🥰', 'Romantic'], ['angry', '😤', 'Fired up']],
  RX: [['fire', '🔥', 'Fire'], ['lol', '😂', 'Funny'], ['cry', '😭', 'Sad'], ['wow', '😮', 'Wow'], ['love', '❤️', 'Love'], ['up', '👍', 'Like']],
  mood(k) { return this.MOODS.find((m) => m[0] === k) || null; },
  on() { return typeof Friends !== 'undefined' && Friends.on() && !!Friends.me; },
  async rpc(fn, args) {
    try { const r = await Friends.rpc(fn, args); this.off = false; return r; } catch (e) { if (/not switched on/.test(e.message)) this.off = true; throw e; }
  },
  when(at) {
    const t = new Date(at).getTime(), s = (Date.now() - t) / 1000;
    if (!isFinite(s)) return '';
    if (s < 45) return 'just now';
    if (s < 7 * 86400) return Friends.ago(at);
    return new Date(t).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });
  },

  /* ---- with the account ---- */
  start() { if (!this.on()) return; this.loadNotes().catch(() => {}); this.loadStatus().catch(() => {}); },
  stop() {
    this.feed = []; this.feedAt = 0; this.more = true; this.posts.clear(); this.replies.clear(); this.openT.clear(); this.prof.clear();
    this.single = null; this.singleP = null; this.notes = null; this.unseen = 0; this.status = null; this.off = false; this.fresh = false;
    this.draft = { body: '', mood: null, title: null }; this.rdraft = {};
  },
  async loadStatus() { const r = await this.rpc('mkc_status_me'); this.status = r && (r.mood || r.text) ? r : null; this.sync(); },
  async loadNotes() {
    const r = await this.rpc('mkc_hub_notes_list');
    this.notes = r || { unseen: 0, items: [] }; this.notesAt = Date.now(); this.unseen = +this.notes.unseen || 0;
    Friends.badge();
    if (Social.tab === 'notes' && !Social.view && !Friends.chat) { const m = this.main(); if (m) this.paintNotes(m); }
  },
  /* a nudge from a friend: a new post, a tag or reply for me, or a new status */
  inbox(p, from) {
    const f = Friends.byId(from); if (!f || f.state !== 'friend') return;
    if (p.t === 'st') { Social.feedAt = 0; clearTimeout(this.stT); this.stT = setTimeout(() => Social.loadFeed(true).then(() => this.sync()).catch(() => {}), 300 + Math.random() * 900); return; }
    if (p.t === 'post') {
      if (Friends.layerOpen() && this.feedShown()) { clearTimeout(this.pT); this.pT = setTimeout(() => this.loadFeed(true).catch(() => {}), 300 + Math.random() * 900); }
      else { this.fresh = true; this.syncNav(); }
      return;
    }
    if (p.t === 'n') {
      clearTimeout(this.nT); this.nT = setTimeout(() => this.loadNotes().catch(() => {}), 400 + Math.random() * 600);
      if (p.k === 'tag') Friends.note(`${Friends.label(f)} tagged you in a post`);
      else if (p.k === 'reply') Friends.note(`${Friends.label(f)} replied to your post`);
    }
  },
  feedShown() { return Social.tab === 'feed' && !Social.view && !Friends.chat && !this.single; },

  /* ---- the shell: header, sections, the main column and (on wide screens) who is around ---- */
  main() { const b = X8.body('friendsLayer'); return b ? $('#hubMain', b) : null; },
  slot() {
    if (!this.on()) return null;
    const b = X8.body('friendsLayer'); if (!b) return null;
    let m = $('#hubMain', b);
    if (!m) { this.shell(b); m = $('#hubMain', b); }
    m.classList.toggle('fr-chatmode', !!Friends.chat);
    this.syncNav();
    return m;
  },
  shell(b) {
    b.classList.add('hub-on');
    const tabs = [['feed', 'Feed', 'messages-square'], ['friends', 'Friends', 'users'], ['activity', 'Activity', 'activity'], ['you', 'You', 'trophy']];
    b.innerHTML = `<div class="hub">
      <div class="hub-head"><div class="hub-brand"><i data-lucide="sparkles"></i><b>Social Hub</b></div>
        <button type="button" class="hub-me" data-nav data-hub="status" aria-label="Your status"></button>
        <span class="hub-hx"><button class="ibtn sm hub-bell" type="button" data-nav data-hub="notes" aria-label="Notifications"><i data-lucide="bell"></i><span class="fr-dot tnum" hidden></span></button>
        <button class="ibtn sm" type="button" data-nav data-hub="privacy" aria-label="Privacy settings" title="Privacy"><i data-lucide="settings-2"></i></button></span></div>
      <div class="hub-nav" role="tablist" aria-label="Social Hub">${tabs.map(([k, l, i]) => `<button type="button" role="tab" data-nav data-soctab="${k}"><i data-lucide="${i}"></i><span>${l}</span>${k === 'friends' ? '<span class="fr-dot tnum" hidden></span>' : ''}${k === 'feed' ? '<span class="hub-new" hidden></span>' : ''}</button>`).join('')}</div>
      <div class="hub-wrap"><div class="hub-main" id="hubMain"></div><aside class="hub-aside" id="hubAside" aria-label="Friends"></aside></div></div>`;
    const h = $('.hub', b); this.bind(h); icons();
    if (!this.tickT) this.tickT = setInterval(() => this.tick(), 30000);
    if (!this.notes) this.loadNotes().catch(() => {});
    if (this.status == null) this.loadStatus().catch(() => {});
    Social.loadFeed().then(() => this.sync()).catch(() => {});
  },
  tick() {
    if (!this.on() || !Friends.layerOpen() || document.visibilityState !== 'visible' || Friends.playerOpen()) return;
    if (this.feedShown() && !this.off) this.loadFeed(true).catch(() => {});
    if (Date.now() - this.notesAt > 60000) this.loadNotes().catch(() => {});
    Social.loadFeed().then(() => this.sync()).catch(() => {});
  },
  meChip() {
    const me = Friends.me, s = this.status, m = s && this.mood(s.mood);
    return `${Friends.av(Object.assign({}, me, { on: CFG.frOnline !== false }))}<span class="hub-mt"><b>${esc(me.name || me.username)}</b><small>${s ? esc(s.text || (m ? m[2] : '')) : 'Set a status'}</small></span>`;
  },
  syncNav() {
    const b = X8.body('friendsLayer'), h = b && $('.hub', b); if (!h || !Friends.me) return;
    $$('.hub-nav [data-soctab]', h).forEach((x) => { const on = x.dataset.soctab === Social.tab; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
    const { req, unread } = Friends.counts(), n = req + unread, fd = $('[data-soctab="friends"] .fr-dot', h);
    if (fd) { fd.hidden = !n; fd.textContent = n > 9 ? '9+' : String(n || ''); }
    const nw = $('.hub-new', h); if (nw) nw.hidden = !this.fresh;
    const bell = $('.hub-bell', h), bd = bell && $('.fr-dot', bell);
    if (bd) { bd.hidden = !this.unseen; bd.textContent = this.unseen > 9 ? '9+' : String(this.unseen || ''); }
    if (bell) { bell.classList.toggle('on', Social.tab === 'notes'); bell.setAttribute('aria-label', this.unseen ? `Notifications, ${this.unseen} new` : 'Notifications'); }
    const me = $('.hub-me', h); if (me) { me.innerHTML = this.meChip(); me.setAttribute('aria-label', this.status ? 'Change your status' : 'Set a status'); }
  },
  sync() { if (!Friends.layerOpen() || !Friends.me) return; this.syncNav(); this.paintSide(); },

  /* ---- who is around: the member list (wide screens) and the strip on top of the feed (phones) ---- */
  card(id) { return (Social.feed || []).find((x) => x.id === id) || null; },
  moodOf(f) {
    if (!f || !f.id) return null;
    if (Friends.me && f.id === Friends.me.id) return this.status;
    const c = this.card(f.id); return c && (c.mood || c.mood_text) ? { mood: c.mood, text: c.mood_text } : null;
  },
  moodDot(f) { const s = this.moodOf(f), m = s && this.mood(s.mood); return m ? `<span class="hub-md" aria-hidden="true">${m[1]}</span>` : ''; },
  watchingNow(f) { return !!(f.on && f.watching && f.watching.t); },
  people() {
    const rank = (f) => (this.watchingNow(f) ? 0 : f.on ? 1 : 2);
    return Friends.list.filter((f) => f.state === 'friend').sort((a, b) => rank(a) - rank(b) || (this.moodOf(b) ? 1 : 0) - (this.moodOf(a) ? 1 : 0) || Friends.label(a).localeCompare(Friends.label(b)));
  },
  line(f) {
    if (this.watchingNow(f)) return Friends.status(f);
    const s = this.moodOf(f), m = s && this.mood(s.mood);
    if (s && (s.text || m)) return s.text || `Feeling ${m[2].toLowerCase()}`;
    return Friends.status(f);
  },
  focusKey(box) {
    const a = document.activeElement; if (!a || !box || !box.contains(a) || a === box) return null;
    const art = a.closest('[data-pid]');
    return { hub: a.dataset.hub || '', id: a.dataset.id || '', e: a.dataset.e || '', pid: a.dataset.pid || (art ? art.dataset.pid : ''), el: a.id || '' };
  },
  refocus(box, k) {
    if (!k || !box) return;
    let el = k.el ? $(`#${CSS.escape(k.el)}`, box) : null;
    if (!el && k.hub) el = $(`[data-hub="${CSS.escape(k.hub)}"]${k.pid ? `[data-pid="${CSS.escape(k.pid)}"]` : ''}${k.id ? `[data-id="${CSS.escape(k.id)}"]` : ''}${k.e ? `[data-e="${CSS.escape(k.e)}"]` : ''}`, box);
    if (!el && k.pid) el = $(`[data-pid="${CSS.escape(k.pid)}"] [data-nav]`, box);
    if (!el) return;
    if (IS_TV) Nav.focus(el, true); else el.focus({ preventScroll: true });
  },
  paintSide() {
    const b = X8.body('friendsLayer'); if (!b || !$('.hub', b)) return;
    const side = $('#hubAside', b), st = $('#hubStories', b), list = this.people();
    if (side && matchMedia('(min-width: 1000px)').matches) {
      const k = this.focusKey(side);
      const g = [['Watching', list.filter((f) => this.watchingNow(f))], ['Online', list.filter((f) => f.on && !this.watchingNow(f))], ['Offline', list.filter((f) => !f.on)]];
      side.innerHTML = list.length ? g.filter(([, l]) => l.length).map(([t, l]) => `<h4>${t} <span class="tnum">${l.length}</span></h4>${l.slice(0, 80).map((f) => `<button type="button" class="hub-mem${f.on ? '' : ' off'}" data-nav data-hub="who" data-id="${esc(f.id)}">${Friends.av(f)}<span><b>${esc(Friends.label(f))}</b><small class="${this.watchingNow(f) ? 'fr-live' : ''}">${esc(this.line(f))}</small></span></button>`).join('')}`).join('')
        : '<h4>Friends</h4><p class="fr-dim">Friends you add show up here, with what they are up to and how they feel.</p><button class="btn btn-ghost btn-sm" type="button" data-nav data-hub="tab" data-t="friends"><i data-lucide="user-plus"></i>Add a friend</button>';
      icons(); this.refocus(side, k);
    }
    if (st) { const k = this.focusKey(st); st.innerHTML = this.storiesHtml(list); icons(); this.refocus(st, k); }
  },
  storiesHtml(list) {
    const s = this.status;
    return `<button type="button" class="hub-story me" data-nav data-hub="status">${Friends.av(Object.assign({}, Friends.me, { on: false }), true)}${s ? '' : '<span class="hub-plus"><i data-lucide="plus"></i></span>'}<b>${s ? 'Your status' : 'Add status'}</b></button>`
      + list.slice(0, 30).map((f) => `<button type="button" class="hub-story${this.watchingNow(f) ? ' live' : ''}${f.on ? '' : ' off'}" data-nav data-hub="who" data-id="${esc(f.id)}" title="${esc(this.line(f))}" aria-label="${esc(`${Friends.label(f)}: ${this.line(f)}`)}">${Friends.av(f, true)}<b>${esc(f.name || f.username)}</b></button>`).join('');
  },

  /* ---- clicks and typing anywhere in the hub ---- */
  bind(h) {
    h.addEventListener('click', (e) => {
      const x = e.target.closest('[data-hub],[data-soctab]'); if (!x || !h.contains(x)) return;
      if (x.dataset.soctab) { if (!x.closest('#hubMain')) this.tab(x.dataset.soctab); return; }
      const id = x.dataset.pid ? +x.dataset.pid : 0;
      switch (x.dataset.hub) {
        case 'status': this.editStatus(); break;
        case 'notes': if (Social.tab === 'notes' && !Social.view && !Friends.chat) this.tab('feed'); else this.openNotes(); break;
        case 'privacy': X8.close('friendsLayer'); openSettings('friends'); break;
        case 'tab': this.tab(x.dataset.t); break;
        case 'tofeed': this.tab('feed'); break;
        case 'who': this.openWho(x.dataset.id); break;
        case 'filt': this.setFilt(x.dataset.f); break;
        case 'more': if (!this.loading) { x.textContent = 'Loading…'; this.loadFeed(false).catch(() => {}); } break;
        case 'react': this.react(x); break;
        case 'thread': this.thread(id); break;
        case 'rsend': this.rsend(id, x); break;
        case 'pmenu': this.menu(id); break;
        case 'title': Social.openTitle(Social.titleFrom(x)); break;
        case 'open': this.openPost(id); break;
        case 'pmood': this.pick('mood'); break;
        case 'ptitle': this.pick('title'); break;
        case 'pat': this.pick('at'); break;
        case 'setmood': this.draft.mood = this.draft.mood === x.dataset.m ? null : x.dataset.m; this.closePick(); this.attach(); break;
        case 'settitle': this.draft.title = this.cands[+x.dataset.i] || null; this.closePick(); this.attach(); break;
        case 'unmood': this.draft.mood = null; this.attach(); break;
        case 'untitle': this.draft.title = null; this.attach(); break;
        case 'insat': { const t = $('#hubText'); this.closePick(); if (t) this.insertAt(t, x.dataset.u); break; }
        case 'sugat': { const t = this.sugFor; if (t && t.isConnected) this.insertAt(t, x.dataset.u); break; }
        case 'post': this.doPost(x); break;
        default: break;
      }
    });
    h.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'hubText') { this.draft.body = t.value; this.grow(t); this.count(); this.suggest(t, $('#hubSug')); }
      else if (t.dataset && t.dataset.rpid) { this.rdraft[t.dataset.rpid] = t.value; this.suggest(t, this.rsug(t)); }
    });
    h.addEventListener('keydown', (e) => {
      const t = e.target;
      if (e.key === 'Escape' && this.sugFor === t) { const s = t.id === 'hubText' ? $('#hubSug') : this.rsug(t); if (s && !s.hidden) { e.stopPropagation(); s.hidden = true; } return; }
      if (e.key !== 'Enter' || t.readOnly) return;
      if (t.id === 'hubText' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.doPost($('#hubGo')); }
      else if (t.dataset && t.dataset.rpid && !e.shiftKey) { e.preventDefault(); this.rsend(+t.dataset.rpid, null); }
    });
  },
  tab(t) {
    this.single = null;
    if (t === 'feed' && this.feedShown() && Friends.layerOpen()) { const m = this.main(); if (m) { if (m.scrollTop > 0) m.scrollTop = 0; else this.loadFeed(true).catch(() => {}); } return; }
    Social.setTab(t);
  },
  openWho(id) {
    if (!id) return;
    if (Friends.me && id === Friends.me.id) { this.tab('you'); return; }
    const f = Friends.byId(id); if (f && f.state === 'friend') Social.profile(f);
  },
  setFilt(f) {
    if (!f || f === this.filt) return;
    this.filt = f; this.feed = []; this.feedAt = 0; this.more = true;
    $$('[data-hub="filt"]').forEach((c) => { const on = c.dataset.f === f; c.classList.toggle('on', on); c.setAttribute('aria-selected', on); });
    this.paintPosts(); this.loadFeed(true).catch(() => {});
  },

  /* ---- the feed ---- */
  paintTab(m) {
    m.classList.remove('fr-chatmode');
    if (this.off) { m.innerHTML = '<div class="soc-empty"><i data-lucide="messages-square"></i><p>Posts are not switched on for this server yet. Friends, messages, profiles and trophies still work.</p></div>'; icons(); return; }
    if (Social.tab === 'notes') { this.paintNotes(m); return; }
    if (this.single) { this.paintSingle(m); return; }
    if (!$('#hubFeed', m)) {
      m.innerHTML = `<div id="hubFeed" class="hub-feed">
        <div class="hub-stories" id="hubStories" aria-label="Friends"></div>
        ${this.composerHtml()}
        <div class="hub-chips" role="tablist" aria-label="Show">${[['all', 'Everyone'], ['mentions', 'Mentions'], ['mine', 'My posts']].map(([k, l]) => `<button type="button" class="hub-chip${this.filt === k ? ' on' : ''}" role="tab" aria-selected="${this.filt === k}" data-nav data-hub="filt" data-f="${k}">${l}</button>`).join('')}</div>
        <div id="hubPosts" class="hub-posts" aria-live="polite"></div></div>`;
      const t = $('#hubText', m); if (IS_TV) TvType.guard(t); this.grow(t); this.count();
    }
    this.paintSide(); this.paintPosts(); icons();
    if (!this.feedAt || this.fresh || Date.now() - this.feedAt > 20000) this.loadFeed(true).catch(() => {});
    this.fresh = false; this.syncNav();
    if (IS_TV && !m.closest('.hub').contains(document.activeElement)) { const x = $('.hub-nav .on'); if (x) Nav.focus(x, true); }
  },
  args() { return { p_before: null, p_user: this.filt === 'mine' ? Friends.me.id : null, p_mentions: this.filt === 'mentions', p_id: null }; },
  async loadFeed(reset) {
    if (this.loading || !this.on()) return;
    this.loading = true; const f = this.filt;
    try {
      const a = this.args(); if (!reset && this.feed.length) a.p_before = this.feed[this.feed.length - 1].id;
      const l = (await this.rpc('mkc_feed', a)) || [];
      if (f !== this.filt) return;
      l.forEach((p) => this.posts.set(p.id, p));
      if (reset) {
        const ids = new Set(l.map((p) => p.id)), oldest = l.length ? l[l.length - 1].id : 0;
        const rest = l.length < 20 ? [] : this.feed.filter((p) => !ids.has(p.id) && p.id < oldest);
        this.more = l.length < 20 ? false : rest.length ? this.more : true;
        this.feed = [...l, ...rest];
      } else { const have = new Set(this.feed.map((p) => p.id)); this.feed = [...this.feed, ...l.filter((p) => !have.has(p.id))]; this.more = l.length >= 20; }
      this.feedAt = Date.now(); this.err = '';
    } catch (e) { this.err = e.message || String(e); if (!this.feedAt) this.feedAt = Date.now(); } finally { this.loading = false; }
    const m = this.main(); if (!m || !this.feedShown() || !Friends.layerOpen()) return;
    if (this.off || !$('#hubPosts', m)) this.paintTab(m); else this.paintPosts();
  },
  paintPosts() {
    const box = $('#hubPosts'); if (!box) return;
    const k = this.focusKey(box), fr = Friends.list.some((f) => f.state === 'friend');
    let html;
    if (!this.feedAt) html = '<p class="fr-dim">Loading…</p>';
    else if (!this.feed.length) {
      const e = this.err ? [this.err, ''] : this.filt === 'mentions' ? ['When a friend tags you with @ and your username, the post shows up here.', '']
        : this.filt === 'mine' ? ['Your posts show up here. Share what you are watching or how you feel.', '']
          : fr ? ['Nothing posted yet. Be the first: say what you are watching, or how the film made you feel.', '']
            : ['Add friends and their posts show up here.', '<button class="btn btn-prime btn-sm" type="button" data-nav data-hub="tab" data-t="friends"><i data-lucide="user-plus"></i>Add a friend</button>'];
      html = `<div class="soc-empty sm"><i data-lucide="${this.filt === 'mentions' ? 'at-sign' : 'messages-square'}"></i><p>${esc(e[0])}</p>${e[1]}</div>`;
    } else html = this.feed.map((p) => this.postHtml(p)).join('') + (this.more ? `<button class="btn btn-ghost btn-sm hub-more" type="button" data-nav data-hub="more">${this.loading ? 'Loading…' : 'Show older posts'}</button>` : '');
    box.innerHTML = html; icons();
    if (IS_TV) $$('[data-rpid]', box).forEach((x) => TvType.guard(x));
    this.refocus(box, k);
  },
  who(u) {
    if (!u || !u.id) return { username: '', name: 'Someone' };
    if (Friends.me && u.id === Friends.me.id) return Object.assign({}, Friends.me, { on: false });
    return Friends.byId(u.id) || u;
  },
  postHtml(p, isReply) {
    const u = p.by || {}, f = this.who(u), m = this.mood(p.mood), open = this.openT.has(p.id), nrep = +p.replies || 0;
    const rx = this.RX.filter(([k]) => !isReply || k === 'love' || (p.reacts && p.reacts[k])).map(([k, e, l]) => {
      const n = (p.reacts && p.reacts[k]) || 0, on = (p.me || []).includes(k);
      return `<button type="button" class="hub-rx${on ? ' on' : ''}${n ? ' has' : ''}" data-nav data-hub="react" data-pid="${p.id}" data-e="${k}" aria-pressed="${on}" aria-label="${l}${n ? `, ${n}` : ''}"><span>${e}</span>${n ? `<em class="tnum">${n}</em>` : ''}</button>`;
    }).join('');
    return `<article class="hub-post${isReply ? ' reply' : ''}${p.hidden ? ' flagged' : ''}" data-pid="${p.id}">
      <div class="hub-ph"><button type="button" class="hub-av" data-nav data-hub="who" data-id="${esc(u.id || '')}" aria-label="${esc(Friends.label(f))}">${Friends.av(f)}</button>
        <div class="hub-pw"><b>${esc(f.name || u.name || u.username || 'Someone')}</b><small>${u.username ? `@${esc(u.username)} · ` : ''}<time datetime="${esc(p.at || '')}">${esc(this.when(p.at))}</time></small></div>
        ${m ? `<span class="hub-mood" title="Feeling ${esc(m[2].toLowerCase())}">${m[1]}<span>${esc(m[2])}</span></span>` : ''}
        <button type="button" class="ibtn sm hub-pm" data-nav data-hub="pmenu" data-pid="${p.id}" aria-label="More options"><i data-lucide="more-horizontal"></i></button></div>
      ${p.hidden ? '<p class="hub-flag"><i data-lucide="eye-off"></i>Hidden after reports. Only you can see it.</p>' : ''}
      <div class="hub-body">${this.bodyHtml(p)}</div>
      ${p.title && p.title.t ? this.titleHtml(p.title) : ''}
      <div class="hub-bar">${rx}${isReply ? '' : `<button type="button" class="hub-rbtn${open ? ' on' : ''}" data-nav data-hub="thread" data-pid="${p.id}" aria-expanded="${open}"><i data-lucide="message-square"></i><span>${nrep ? `${nrep} ${nrep === 1 ? 'reply' : 'replies'}` : 'Reply'}</span></button>`}</div>
      ${!isReply && open ? this.threadHtml(p) : ''}</article>`;
  },
  /* plain text: escaped, line breaks kept, @tags of friends become chips. Never links. */
  bodyHtml(p) {
    const tags = new Map((p.tags || []).filter((u) => u && u.username).map((u) => [String(u.username).toLowerCase(), u]));
    return esc(p.body || '').replace(/@([A-Za-z0-9_]{3,20})/g, (all, n) => {
      const u = tags.get(n.toLowerCase()); if (!u) return all;
      const me = !!(Friends.me && u.id === Friends.me.id), f = me || Friends.byId(u.id);
      return f ? `<button type="button" class="hub-at${me ? ' me' : ''}" data-nav data-hub="who" data-id="${esc(u.id)}">@${esc(u.username)}</button>` : `<span class="hub-at">@${esc(u.username)}</span>`;
    }).replace(/\n/g, '<br>');
  },
  titleHtml(t) {
    const kind = t.k === 'movie' ? 'Film' : t.k === 'anime' ? 'Anime' : 'Series';
    return `<button type="button" class="hub-title" data-nav ${t.id ? `data-hub="title" data-t="${Social.tAttr(t)}"` : 'disabled'} aria-label="${esc(`${kind}: ${t.t}`)}"><img src="${esc(Social.poster(t))}" alt="" loading="lazy" decoding="async"><span><small>${kind}</small><b>${esc(t.t)}</b>${t.ep ? `<small>${esc(t.ep)}</small>` : ''}</span>${t.id ? '<i data-lucide="chevron-right"></i>' : ''}</button>`;
  },
  threadHtml(p) {
    const l = this.replies.get(p.id), f = this.who(p.by);
    return `<div class="hub-thread">${l ? l.map((r) => this.postHtml(r, true)).join('') : '<p class="fr-dim">Loading…</p>'}
      <div class="hub-rcomp"><input class="inp" id="hubR${p.id}" maxlength="500" autocomplete="off" placeholder="Reply to ${esc(p.mine ? 'your post' : Friends.label(f))}" aria-label="Reply" data-nav data-rpid="${p.id}" value="${esc(this.rdraft[p.id] || '')}">
      <button class="btn btn-prime btn-sm" type="button" data-nav data-hub="rsend" data-pid="${p.id}" aria-label="Send reply"><i data-lucide="send"></i></button></div></div>`;
  },
  /* one post changed: keep every copy (feed, profile, the open post, replies) in step and repaint its card */
  put(p) {
    this.posts.set(p.id, p);
    const sw = (arr) => { if (!arr) return; const i = arr.findIndex((x) => x.id === p.id); if (i >= 0) arr[i] = p; };
    sw(this.feed); if (p.parent) sw(this.replies.get(p.parent)); this.prof.forEach((c) => sw(c.l));
    if (this.singleP && this.singleP.id === p.id) this.singleP = p;
  },
  drop(p) {
    this.posts.delete(p.id);
    if (p.parent) { const l = this.replies.get(p.parent); if (l) this.replies.set(p.parent, l.filter((x) => x.id !== p.id)); const r = this.posts.get(p.parent); if (r) r.replies = Math.max(0, (+r.replies || 1) - 1); this.rerender(p.parent); return; }
    this.feed = this.feed.filter((x) => x.id !== p.id); this.prof.forEach((c) => { c.l = c.l.filter((x) => x.id !== p.id); });
    if (this.single === p.id) this.singleP = null;
    $$(`article.hub-post[data-pid="${p.id}"]`).forEach((el) => el.remove());
    if (this.feedShown() && !this.feed.length) this.paintPosts();
  },
  rerender(id) {
    const p = this.posts.get(id); if (!p) return;
    const rootId = p.parent || p.id, root = this.posts.get(rootId); if (!root) return;
    $$(`article.hub-post[data-pid="${rootId}"]:not(.reply)`).forEach((el) => {
      const k = this.focusKey(el), t = document.createElement('div'); t.innerHTML = this.postHtml(root);
      const n = t.firstElementChild; el.replaceWith(n);
      if (IS_TV) $$('[data-rpid]', n).forEach((x) => TvType.guard(x));
      this.refocus(n, k);
    });
    icons();
  },

  /* ---- reactions and replies ---- */
  async react(x) {
    const id = +x.dataset.pid, k = x.dataset.e, p = this.posts.get(id); if (!p) return;
    const on = !(p.me || []).includes(k), q = Object.assign({}, p, { me: on ? [...(p.me || []), k] : (p.me || []).filter((e) => e !== k), reacts: Object.assign({}, p.reacts) });
    q.reacts[k] = Math.max(0, (q.reacts[k] || 0) + (on ? 1 : -1)); if (!q.reacts[k]) delete q.reacts[k];
    this.put(q); this.rerender(id); if (on) this.pop(id, k);
    try {
      const r = await this.rpc('mkc_react', { p_id: id, p_emoji: k, p_on: on });
      if (r) { if (r.parent == null && r.replies == null) r.replies = q.replies; const same = JSON.stringify([r.reacts, r.me]) === JSON.stringify([q.reacts, q.me]); this.put(r); if (!same) this.rerender(id); }
      if (on && !p.mine && p.by && p.by.id) Friends.poke(p.by.id, { t: 'n', k: 'react' });
    } catch (e) { this.put(p); this.rerender(id); toast(e.message || String(e), 'err', 4000); }
  },
  pop(id, k) { const el = $(`.hub-rx[data-pid="${id}"][data-e="${k}"]`); if (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } },
  async thread(id) {
    if (this.openT.has(id)) { this.openT.delete(id); this.rerender(id); return; }
    this.openT.add(id); this.rerender(id);
    await this.loadReplies(id);
    const i = $(`#hubR${id}`); if (i && !IS_TV && !TOUCH_UI) i.focus({ preventScroll: true });
  },
  async loadReplies(id) {
    try { const l = (await this.rpc('mkc_replies', { p_id: id })) || []; l.forEach((r) => this.posts.set(r.id, r)); this.replies.set(id, l); const p = this.posts.get(id); if (p) p.replies = l.length; }
    catch (e) { this.replies.set(id, []); toast(e.message || String(e), 'err', 4000); }
    this.rerender(id);
  },
  async rsend(id, btn) {
    const i = $(`#hubR${id}`), body = (i ? i.value : '').trim(); if (!body) { if (i) i.focus(); return; }
    if (btn) btn.disabled = true; if (i) i.disabled = true;
    try {
      const r = await this.rpc('mkc_post', { p_body: body, p_mood: null, p_title: null, p_parent: id });
      delete this.rdraft[id];
      const l = this.replies.get(id) || []; l.push(r); this.replies.set(id, l); this.posts.set(r.id, r);
      const root = this.posts.get(id); if (root) root.replies = l.length;
      this.rerender(id);
      const ri = $(`#hubR${id}`); if (ri) { if (IS_TV) Nav.focus(ri, true); else if (!TOUCH_UI) ri.focus({ preventScroll: true }); }
      const nudged = new Set();
      if (root && root.by && !root.mine) { nudged.add(root.by.id); Friends.poke(root.by.id, { t: 'n', k: 'reply' }); }
      (r.tags || []).forEach((u) => { if (u && u.id && !nudged.has(u.id)) Friends.poke(u.id, { t: 'n', k: 'tag' }); });
    } catch (e) { toast(e.message || String(e), 'err', 5000); if (i && i.isConnected) i.disabled = false; } finally { if (btn && btn.isConnected) btn.disabled = false; }
  },

  /* ---- writing a post: text, a feeling, a film or show, @tags ---- */
  composerHtml() {
    const me = Friends.me;
    return `<div class="hub-comp" id="hubComp">
      <div class="hub-crow">${Friends.av(Object.assign({}, me, { on: false }))}<textarea class="inp" id="hubText" rows="2" maxlength="500" placeholder="What’s on your mind, ${esc(me.name || me.username)}?" aria-label="Write a post" data-nav>${esc(this.draft.body)}</textarea></div>
      <div id="hubSug" class="hub-sug" hidden></div>
      <div id="hubAttach" class="hub-attach">${this.attachHtml()}</div>
      <div id="hubPick" class="hub-pick" hidden></div>
      <div class="hub-tools">
        <button type="button" class="hub-tool" data-nav data-hub="pmood" aria-label="How are you feeling?"><span class="hub-ti">${(this.mood(this.draft.mood) || [0, '😊'])[1]}</span><span>Feeling</span></button>
        <button type="button" class="hub-tool" data-nav data-hub="ptitle" aria-label="Add a film or show"><i data-lucide="clapperboard"></i><span>Title</span></button>
        <button type="button" class="hub-tool" data-nav data-hub="pat" aria-label="Tag a friend"><i data-lucide="at-sign"></i><span>Tag</span></button>
        <span class="hub-count tnum" id="hubCount"></span>
        <button type="button" class="btn btn-prime btn-sm hub-go" data-nav data-hub="post" id="hubGo"><i data-lucide="send"></i>Post</button></div></div>`;
  },
  attachHtml() {
    const d = this.draft, m = this.mood(d.mood);
    return `${m ? `<span class="hub-pill">${m[1]} Feeling ${esc(m[2].toLowerCase())}<button type="button" class="hub-x" data-nav data-hub="unmood" aria-label="Remove feeling"><i data-lucide="x"></i></button></span>` : ''}${d.title ? `<span class="hub-pill"><i data-lucide="clapperboard"></i><span class="hub-pt">${esc(d.title.t)}</span><button type="button" class="hub-x" data-nav data-hub="untitle" aria-label="Remove title"><i data-lucide="x"></i></button></span>` : ''}`;
  },
  attach() {
    const a = $('#hubAttach'); if (a) { a.innerHTML = this.attachHtml(); icons(); }
    const ti = $('[data-hub="pmood"] .hub-ti'); if (ti) ti.textContent = (this.mood(this.draft.mood) || [0, '😊'])[1];
  },
  grow(t) { if (!t) return; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight + 2, 220)}px`; },
  count() { const n = this.draft.body.length, c = $('#hubCount'); if (c) { c.textContent = n > 400 ? String(500 - n) : ''; c.classList.toggle('warn', n > 480); } },
  titles() {
    const seen = new Set(), out = [], ok = /^(tt\d+|tmdb:\d+|kitsu:\d+|mal:\d+)$/;
    const add = (x) => { const k = x && (x.id || x.t); if (!x || !x.t || seen.has(k) || out.length >= 30) return; seen.add(k); out.push({ id: x.id, k: x.k, t: String(x.t).slice(0, 120), p: x.p, ep: x.ep }); };
    try { Social.recentOut().forEach((x) => add({ id: x.id, k: x.k, t: x.t, p: x.p })); } catch (e) { /* no history */ }
    (S.watchlist || []).forEach((m) => { if (m && m.name && ok.test(String(m.id))) add({ id: m.id, k: m.type === 'movie' ? 'movie' : 'series', t: m.name, p: Social.POSTER_HOSTS.test(m.poster || '') ? m.poster : undefined }); });
    return out;
  },
  pick(kind) {
    const box = $('#hubPick'); if (!box) return;
    if (this.picking === kind && !box.hidden) { this.closePick(); return; }
    this.picking = kind; box.hidden = false;
    if (kind === 'mood') box.innerHTML = `<div class="hub-moods" aria-label="How are you feeling?">${this.MOODS.map(([k, e, l]) => `<button type="button" class="hub-mo${this.draft.mood === k ? ' on' : ''}" aria-pressed="${this.draft.mood === k}" data-nav data-hub="setmood" data-m="${k}"><span>${e}</span><small>${esc(l)}</small></button>`).join('')}</div>`;
    if (kind === 'title') {
      this.cands = this.titles();
      box.innerHTML = this.cands.length ? `<div class="soc-row">${this.cands.map((x, i) => `<button type="button" class="soc-post" data-nav data-hub="settitle" data-i="${i}"><img src="${esc(Social.poster(x))}" alt="" loading="lazy" decoding="async"><span>${esc(x.t)}</span></button>`).join('')}</div>`
        : '<p class="fr-dim">Finish something or add titles to your Watchlist, and you can share them here.</p>';
    }
    if (kind === 'at') {
      const l = Friends.list.filter((f) => f.state === 'friend');
      box.innerHTML = l.length ? `<div class="hub-ats">${l.slice(0, 60).map((f) => `<button type="button" class="hub-atb" data-nav data-hub="insat" data-u="${esc(f.username)}">${Friends.av(f)}<span><b>${esc(Friends.label(f))}</b><small>@${esc(f.username)}</small></span></button>`).join('')}</div>`
        : '<p class="fr-dim">Add friends first, then tag them with @ and their username.</p>';
    }
    icons(); const first = $('[data-nav]', box); if (first && IS_TV) Nav.focus(first, true);
  },
  closePick() {
    const box = $('#hubPick'); if (box) { box.hidden = true; box.innerHTML = ''; }
    const k = this.picking; this.picking = null;
    if (IS_TV && k) { const b = $(`[data-hub="p${k}"]`); if (b) Nav.focus(b, true); }
  },
  rsug(t) {
    const row = t.parentElement; let s = row && row.nextElementSibling;
    if (!s || !s.classList.contains('hub-sug')) { s = document.createElement('div'); s.className = 'hub-sug'; s.hidden = true; row.after(s); }
    return s;
  },
  /* typing @ shows matching friends */
  suggest(t, box) {
    if (!box) return;
    const pre = t.value.slice(0, t.selectionStart == null ? t.value.length : t.selectionStart), m = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{0,20})$/.exec(pre);
    const q = m ? m[2].toLowerCase() : null;
    const l = q == null ? [] : Friends.list.filter((f) => f.state === 'friend' && (f.username.startsWith(q) || String(f.name || '').toLowerCase().startsWith(q))).slice(0, 6);
    if (!l.length) { box.hidden = true; box.innerHTML = ''; return; }
    this.sugFor = t; box.hidden = false;
    box.innerHTML = l.map((f) => `<button type="button" class="hub-atb" data-nav data-hub="sugat" data-u="${esc(f.username)}">${Friends.av(f)}<span><b>${esc(Friends.label(f))}</b><small>@${esc(f.username)}</small></span></button>`).join('');
  },
  insertAt(t, u) {
    const v = t.value, pos = t.selectionStart == null ? v.length : t.selectionStart;
    let pre = v.slice(0, pos); const m = /@([A-Za-z0-9_]{0,20})$/.exec(pre);
    if (m) pre = pre.slice(0, m.index); else if (pre && !/\s$/.test(pre)) pre += ' ';
    const nv = `${pre}@${u} ${v.slice(pos).replace(/^\s+/, '')}`.slice(0, 500), c = Math.min(nv.length, pre.length + u.length + 2);
    t.value = nv; t.dispatchEvent(new Event('input', { bubbles: true }));
    if (IS_TV) Nav.focus(t, true); else { t.focus(); try { t.setSelectionRange(c, c); } catch (e) { /* not a text field */ } }
  },
  async doPost(btn) {
    const d = this.draft, body = d.body.trim();
    if (!body) { toast(d.mood || d.title ? 'Add a few words too' : 'Write something first', 'info', 2400); const t = $('#hubText'); if (t) { if (IS_TV) Nav.focus(t, true); else t.focus(); } return; }
    if (btn) btn.disabled = true;
    try {
      const p = await this.rpc('mkc_post', { p_body: body, p_mood: d.mood, p_title: d.title ? { id: d.title.id, k: d.title.k, t: d.title.t, p: d.title.p, ep: d.title.ep } : null, p_parent: null });
      this.draft = { body: '', mood: null, title: null };
      const t = $('#hubText'); if (t) { t.value = ''; this.grow(t); } this.count(); this.attach(); this.closePick();
      if (p) {
        this.posts.set(p.id, p);
        if (this.filt !== 'mentions') this.feed = [p, ...this.feed.filter((x) => x.id !== p.id)];
        this.paintPosts(); const el = $(`#hubPosts article[data-pid="${p.id}"]`); if (el) el.classList.add('new');
        Friends.pokeAll({ t: 'post' });
        (p.tags || []).forEach((u) => { if (u && u.id) Friends.poke(u.id, { t: 'n', k: 'tag' }); });
      }
      toast('Posted', 'ok', 1800);
    } catch (e) { toast(e.message || String(e), 'err', 5000); } finally { if (btn && btn.isConnected) btn.disabled = false; }
  },

  /* ---- delete, report, block ---- */
  menu(id) {
    const p = this.posts.get(id); if (!p) return;
    const root = p.parent ? this.posts.get(p.parent) : null, canDel = p.mine || !!(root && root.mine), who = this.who(p.by);
    X8.layer('hubMenu', { label: 'Post', icon: 'messages-square', eyebrow: 'Post' });
    const b = X8.body('hubMenu');
    b.innerHTML = `<p class="x8-p hub-mq">“${esc(String(p.body || '').slice(0, 160))}${String(p.body || '').length > 160 ? '…' : ''}”</p>
      <div class="fr-menu">${canDel ? `<button class="btn btn-ghost danger" type="button" data-nav data-hm="del"><i data-lucide="trash-2"></i>Delete ${p.parent ? 'reply' : 'post'}</button>` : ''}
        ${p.mine ? '' : '<button class="btn btn-ghost danger" type="button" data-nav data-hm="report"><i data-lucide="flag"></i>Report</button>'}
        <button class="btn btn-ghost" type="button" data-nav data-hm="close">Cancel</button></div>
      ${p.mine ? '' : `<div class="fr-report" hidden><label class="fr-lbl" for="hubWhy">What’s wrong with it? <span class="fr-dim">(optional)</span></label><textarea class="inp" id="hubWhy" maxlength="500" rows="3" data-nav></textarea>
        <div class="fr-opt"><div><b>Also block ${esc(Friends.label(who))}</b><small>They stop seeing you and your posts, and can’t message or call you. They are not told.</small></div><button class="switch" type="button" role="switch" aria-checked="false" data-nav data-hm="blk" aria-label="Also block"></button></div>
        <p class="tour-note">Reports go to the MKCinema team. A post that several friends report is hidden until it is checked.</p>
        <div class="actions"><button class="btn btn-prime" type="button" data-nav data-hm="send"><i data-lucide="flag"></i>Send report</button></div></div>`}`;
    icons(); X8.open('hubMenu');
    const why = $('#hubWhy', b); if (why && IS_TV) TvType.guard(why);
    b.onclick = async (e) => {
      const x = e.target.closest('[data-hm]'); if (!x) return;
      const k = x.dataset.hm;
      if (k === 'close') { X8.close('hubMenu'); return; }
      if (k === 'blk') { const v = !x.classList.contains('on'); x.classList.toggle('on', v); x.setAttribute('aria-checked', v); return; }
      if (k === 'report') { $('.fr-report', b).hidden = false; $('.fr-menu', b).hidden = true; if (IS_TV) Nav.focus(why, true); else why.focus(); return; }
      x.disabled = true;
      try {
        if (k === 'del') { await this.rpc('mkc_post_delete', { p_id: id }); X8.close('hubMenu'); this.drop(p); toast('Deleted', 'ok', 1800); }
        if (k === 'send') {
          const blk = $('[data-hm="blk"]', b).classList.contains('on');
          await this.rpc('mkc_post_report', { p_id: id, p_reason: why.value.trim() });
          if (blk && p.by && p.by.id) { await Friends.rpc('mkc_block', { other: p.by.id, on_: true }); Friends.refresh(); }
          X8.close('hubMenu'); this.drop(p);
          toast(blk ? 'Thanks. The post was reported and they are blocked.' : 'Thanks. The post was reported.', 'ok', 4000);
        }
      } catch (err) { toast(err.message || String(err), 'err', 5000); } finally { if (x.isConnected) x.disabled = false; }
    };
    if (IS_TV) { const f = $('[data-hm]', b); if (f) Nav.focus(f, true); }
  },

  /* ---- notifications and a single post ---- */
  async openNotes() {
    Social.view = null; Social.viewCard = null; Friends.chat = null; Friends.mode = ''; this.single = null; Social.tab = 'notes';
    const m = Friends.root(); if (!m) return;
    this.paintNotes(m); this.syncNav();
    await this.loadNotes().catch(() => {});
    if (this.unseen) this.rpc('mkc_hub_seen').then(() => { this.unseen = 0; if (this.notes) this.notes.unseen = 0; Friends.badge(); }).catch(() => {});
  },
  paintNotes(m) {
    m.classList.remove('fr-chatmode');
    const k = this.focusKey(m), l = (this.notes && this.notes.items) || [];
    const what = { tag: 'tagged you in a post', reply: 'replied to your post', react: 'reacted to your post' }, ic = { tag: '@', reply: '💬', react: '❤️' };
    m.innerHTML = `<div class="hub-sub"><button class="ibtn sm" type="button" data-nav data-hub="tofeed" aria-label="Back to the feed"><i data-lucide="arrow-left"></i></button><h3>Notifications</h3></div>
      ${!this.notes ? '<p class="fr-dim">Loading…</p>' : l.length ? `<div class="hub-notes">${l.map((n) => { const f = this.who(n.from); return `<button type="button" class="hub-note${n.seen ? '' : ' new'}" data-nav data-hub="open" data-pid="${+n.post}">${Friends.av(f)}<span><span class="hub-nl"><b>${esc(Friends.label(f))}</b> ${what[n.kind] || ''}</span><small>“${esc(n.text || '')}” · ${esc(this.when(n.at))}</small></span><i class="hub-nk" aria-hidden="true">${ic[n.kind] || ''}</i></button>`; }).join('')}</div>`
        : '<div class="soc-empty"><i data-lucide="bell"></i><p>Nothing yet. When friends tag you, reply to you or react to your posts, it shows up here.</p></div>'}`;
    icons(); this.refocus(m, k);
    if (IS_TV && !m.contains(document.activeElement)) { const x = $('[data-hub="open"], [data-hub="tofeed"]', m); if (x) Nav.focus(x, true); }
  },
  async openPost(id) {
    if (!id) return;
    Social.view = null; Friends.chat = null; Social.tab = 'feed'; this.single = id; this.singleP = this.posts.get(id) || null; this.singleDone = false; this.openT.add(id);
    const m = Friends.root(); if (!m) return;
    this.paintSingle(m); this.syncNav();
    try { const l = (await this.rpc('mkc_feed', { p_before: null, p_user: null, p_mentions: false, p_id: id })) || []; this.singleP = l[0] || null; if (this.singleP) this.posts.set(id, this.singleP); } catch (e) { this.singleP = null; }
    this.singleDone = true;
    if (this.single !== id) return;
    const mm = this.main(); if (mm) this.paintSingle(mm);
    if (this.singleP) this.loadReplies(id);
  },
  paintSingle(m) {
    m.classList.remove('fr-chatmode');
    const p = this.singleP;
    m.innerHTML = `<div class="hub-sub"><button class="ibtn sm" type="button" data-nav data-hub="tofeed" aria-label="Back to the feed"><i data-lucide="arrow-left"></i></button><h3>Post</h3></div>
      <div class="hub-posts">${p ? this.postHtml(p) : this.singleDone ? '<p class="fr-dim">This post is gone.</p>' : '<p class="fr-dim">Loading…</p>'}</div>`;
    icons(); if (IS_TV) { $$('[data-rpid]', m).forEach((x) => TvType.guard(x)); const x = $('[data-hub="tofeed"]', m); if (x && !m.contains(document.activeElement)) Nav.focus(x, true); }
  },
  /* Back inside the hub: a post or the notifications go back to the feed */
  back() { if (Social.view || Friends.chat) return false; if (this.single || Social.tab === 'notes') { this.tab('feed'); return true; } return false; },

  /* ---- a friend's posts on their profile ---- */
  profileSec(f) {
    if (this.off) return '';
    const c = this.prof.get(f.id);
    if (!c || Date.now() - c.at > 60000) setTimeout(() => this.loadProf(f), 0);
    return `<section class="soc-sec"><h3>Posts</h3><div class="hub-posts" id="hubProf">${c ? this.profList(f, c.l) : '<p class="fr-dim">Loading…</p>'}</div></section>`;
  },
  profList(f, l) { return l.length ? l.map((p) => this.postHtml(p)).join('') : `<p class="fr-dim">${esc(Friends.label(f))} hasn’t posted yet.</p>`; },
  async loadProf(f) {
    if (this.profBusy === f.id) return; this.profBusy = f.id;
    try { const l = (await this.rpc('mkc_feed', { p_before: null, p_user: f.id, p_mentions: false, p_id: null })) || []; l.forEach((p) => this.posts.set(p.id, p)); this.prof.set(f.id, { l, at: Date.now() }); }
    catch (e) { if (!this.off) this.prof.set(f.id, { l: [], at: Date.now() }); }
    this.profBusy = null;
    if (Social.view !== f.id) return;
    const box = $('#hubProf'), c = this.prof.get(f.id);
    if (box && c) { const k = this.focusKey(box); box.innerHTML = this.profList(f, c.l); icons(); if (IS_TV) $$('[data-rpid]', box).forEach((x) => TvType.guard(x)); this.refocus(box, k); }
    else if (box && this.off) box.closest('.soc-sec').remove();
  },

  /* ---- status: how I'm feeling ---- */
  editStatus() {
    X8.layer('hubStatus', { label: 'Your status', icon: 'smile', eyebrow: 'Status' });
    const b = X8.body('hubStatus'), s = this.status || {};
    let mood = s.mood || null, hours = 24;
    b.innerHTML = `<h3 class="x8-h">How are you feeling?</h3><p class="x8-p">Friends see this next to your name, only friends you accepted.</p>
      <div class="hub-moods">${this.MOODS.map(([k, e, l]) => `<button type="button" class="hub-mo${mood === k ? ' on' : ''}" aria-pressed="${mood === k}" data-nav data-sm="${k}"><span>${e}</span><small>${esc(l)}</small></button>`).join('')}</div>
      <label class="fr-lbl" for="hubStT">What’s up? <span class="fr-dim">(optional)</span></label>
      <input class="inp" id="hubStT" maxlength="80" autocomplete="off" placeholder="Rewatching the whole saga" value="${esc(s.text || '')}" data-nav>
      <div class="fr-lbl">Clear after</div>
      <div class="segc hub-seg" role="radiogroup" aria-label="Clear after">${[[4, '4 hours'], [24, 'Today'], [0, 'Don’t clear']].map(([h, l]) => `<button type="button" class="${h === hours ? 'on' : ''}" role="radio" aria-checked="${h === hours}" data-nav data-sh="${h}">${l}</button>`).join('')}</div>
      <div class="actions"><button class="btn btn-prime" type="button" data-nav data-st="save"><i data-lucide="check"></i>Save</button>${this.status ? '<button class="btn btn-ghost" type="button" data-nav data-st="clear"><i data-lucide="x"></i>Clear status</button>' : ''}</div>`;
    icons(); X8.open('hubStatus');
    const t = $('#hubStT', b); if (IS_TV) TvType.guard(t);
    b.onclick = async (e) => {
      const mo = e.target.closest('[data-sm]');
      if (mo) { mood = mood === mo.dataset.sm ? null : mo.dataset.sm; $$('[data-sm]', b).forEach((x) => { const on = x.dataset.sm === mood; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); return; }
      const hb = e.target.closest('[data-sh]');
      if (hb) { hours = +hb.dataset.sh; $$('[data-sh]', b).forEach((x) => { const on = x === hb; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); return; }
      const act = e.target.closest('[data-st]'); if (!act) return;
      const clear = act.dataset.st === 'clear', text = clear ? '' : t.value.trim();
      act.disabled = true;
      try {
        const r = await this.rpc('mkc_status_set', { p_mood: clear ? null : mood, p_text: text, p_hours: hours || null });
        this.status = r && (r.mood || r.text) ? r : null;
        X8.close('hubStatus'); toast(this.status ? 'Status set' : 'Status cleared', 'ok', 1800);
        this.sync(); Friends.pokeAll({ t: 'st' });
      } catch (err) { toast(err.message || String(err), 'err', 4000); } finally { if (act.isConnected) act.disabled = false; }
    };
    if (IS_TV) { const f = $('[data-sm]', b); if (f) Nav.focus(f, true); }
  },
};
