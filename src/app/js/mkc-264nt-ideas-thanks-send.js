
'use strict';
/* =====================================================================
   2.64 Ideas & thanks: send the creator a feature idea or a thank-you note
   - Settings › Ideas & thanks, the command palette, and links app.mkcinema.app/#ideas and #thanks.
   - Anyone can send, signed in or not. The server limits how often (Supabase mkc_note_send) and never stores the
     network address. A signed-in sender sees their notes, the status and any reply, and can delete them.
   - Notes always go to MKCinema's own server, even when the account lives on a self-hosted one; the sign-in is only
     attached when the account is on MKCinema's server.
   - The owner account reads, marks, replies to and deletes notes in the Inbox (Settings › Ideas & thanks).
   - Nothing here asks for money or links to donations. Not on a kids seat.
   ===================================================================== */
const Notes = {
  kind: 'idea', mine: null, box: null, boxFilter: 'open', boxMore: false, counts: null,
  KINDS: {
    idea: { icon: 'lightbulb', label: 'Suggest a feature', ph: 'What would make MKCinema better for you? For example: a sleep timer that fades the sound out.' },
    thanks: { icon: 'heart', label: 'Say thanks', ph: 'A few words for the person who makes MKCinema.' },
  },
  STATUS: { new: 'Sent', read: 'Read', planned: 'Planned', done: 'Done', declined: 'Not planned' },
  who: () => (typeof DONATE !== 'undefined' && DONATE.name ? DONATE.name.split(' ')[0] : 'the developer'),
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  onMk() { const c = Account.config && Account.config(); return !!(Account.user && c && c.url && c.url.replace(/\/+$/, '') === SUPABASE_PROJECT.url); },
  owner() { try { return typeof Notice !== 'undefined' && Notice.owner(); } catch (e) { return false; } },
  async token() {
    if (!this.onMk()) return null;
    if (Account.session && Account.session.access_token) return Account.session.access_token;
    try { const { data } = await Account.client.auth.getSession(); return (data && data.session && data.session.access_token) || null; } catch (e) { return null; }
  },
  async rpc(fn, args, needSignIn) {
    const tok = await this.token();
    if (needSignIn && !tok) throw new Error('Sign in to your MKCinema account first');
    let r;
    try {
      r = await fetchT(`${SUPABASE_PROJECT.url}/rest/v1/rpc/${fn}`, {
        method: 'POST', cache: 'no-store',
        headers: { apikey: SUPABASE_PROJECT.anonKey, 'Content-Type': 'application/json', Accept: 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify(args || {}),
      }, 12000);
    } catch (e) { throw new Error(navigator.onLine === false ? 'You are offline' : 'MKCinema’s server did not answer'); }
    if (r.ok) { const t = await r.text(); return t ? JSON.parse(t) : null; }
    let j = {}; try { j = await r.json(); } catch (e) { /* not JSON */ }
    if (r.status === 404 || /PGRST202|42883/.test(`${j.code || ''}`)) throw Object.assign(new Error('Notes are not switched on yet. Try again after the next update.'), { off: true });
    if (r.status === 429) throw Object.assign(new Error(j.message || 'Lots of notes were sent just now. Try again a bit later.'), { busy: true });
    if (r.status === 401 && tok) throw new Error('Your sign-in has expired. Sign in again and retry.');
    throw new Error(j.message || `MKCinema’s server answered ${r.status}`);
  },
  platform() { return `${typeof PLATFORM !== 'undefined' ? PLATFORM : 'web'}${IS_TV ? '-tv' : ''}`.slice(0, 32); },
  date(s) { try { return new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } },
  draftKey: (k) => `noteDraft:${k}`,
  // delete needs a second press within 4 s (no browser confirm box, which TVs handle badly)
  twice(btn, fn) {
    if (btn.dataset.armed) { delete btn.dataset.armed; btn.classList.remove('nt-armed'); fn(); return; }
    btn.dataset.armed = '1'; btn.classList.add('nt-armed'); toast('Press delete again to remove it for good');
    setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('nt-armed'); }, 4000);
  },

  /* ---------- the form ---------- */
  open(kind) {
    if (this.kids()) { toast('Ask a grown-up to send notes from their own seat'); return null; }
    if (kind && this.KINDS[kind]) this.kind = kind;
    const el = X8.layer('notesLayer', { label: 'Ideas and thanks', icon: 'lightbulb', eyebrow: 'Ideas & thanks' });
    this.paint(); X8.open('notesLayer');
    if (this.onMk()) this.loadMine();
    if (IS_TV) setTimeout(() => Nav.focus($('#ntBody') || $('#ntSend')), 60);
    return el;
  },
  // the shell is built once per open; switching Idea/Thanks only changes text, so a focused box is never rebuilt
  paint() {
    const b = X8.body('notesLayer'); if (!b) return;
    const k = this.KINDS[this.kind], who = esc(this.who());
    const signedOut = !this.onMk();
    b.innerHTML = `<h3 class="x8-h">Send ${who} a note</h3>
      <div class="nt-head"><p class="sub">Ideas shape what comes next, and every thank-you is read by ${who} personally.</p>
      ${IS_TV ? `<div class="nt-qr">${QR.svg('https://app.mkcinema.app/#ideas')}<small>Easier to type on your phone? Scan this to write it there.</small></div>` : ''}</div>
      <div class="segc nt-kind" role="tablist" aria-label="Kind of note">${Object.entries(this.KINDS).map(([id, x]) => `<button type="button" role="tab" data-nav data-ntkind="${id}" class="${id === this.kind ? 'on' : ''}" aria-selected="${id === this.kind}"><i data-lucide="${x.icon}"></i>${esc(x.label)}</button>`).join('')}</div>
      <label class="lg-note nt-field"><span id="ntLabel">${this.kind === 'idea' ? 'Your idea' : 'Your note'}</span>
        <textarea class="inp" id="ntBody" rows="5" maxlength="2000" placeholder="${esc(k.ph)}"></textarea>
        <small class="nt-count" id="ntCount" aria-live="polite"></small></label>
      <label class="lg-note nt-field nt-sign">Sign it as (optional)<input class="inp" id="ntName" maxlength="40" autocomplete="given-name" placeholder="Your first name, or leave blank"></label>
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="ntSend"><i data-lucide="send"></i><span>Send to ${who}</span></button></div>
      <p class="nt-fine">${signedOut ? 'You are not signed in, so this note can’t show you a reply. ' : ''}Your email is never shown with your note. Something not playing right? <button class="linkish" type="button" data-nav id="ntLog">Send a log instead</button>.</p>
      <div id="ntOut" class="nt-out" hidden role="status"></div>
      <section id="ntMine" class="nt-mine" hidden></section>`;
    icons();
    const ta = $('#ntBody', b), nm = $('#ntName', b);
    ta.value = Store.get(this.draftKey(this.kind), '') || ''; nm.value = Store.get('noteName', '') || '';
    const count = () => { const n = ta.value.trim().length; $('#ntCount', b).textContent = n > 1700 ? `${2000 - ta.value.length} characters left` : ''; };
    ta.addEventListener('input', () => { Store.set(this.draftKey(this.kind), ta.value.slice(0, 2000)); count(); }); count();
    nm.addEventListener('change', () => Store.set('noteName', nm.value.trim().slice(0, 40)));
    b.querySelectorAll('[data-ntkind]').forEach((x) => x.addEventListener('click', () => this.setKind(x.dataset.ntkind)));
    $('#ntSend', b).addEventListener('click', () => this.send());
    $('#ntLog', b).addEventListener('click', () => { X8.close('notesLayer'); SendLog.open(); });
    if (this.mine) this.paintMine();
  },
  setKind(kind) {
    if (!this.KINDS[kind] || kind === this.kind) return;
    const ta = $('#ntBody'); if (ta) Store.set(this.draftKey(this.kind), ta.value.slice(0, 2000));
    this.kind = kind; const k = this.KINDS[kind];
    document.querySelectorAll('#notesLayer [data-ntkind]').forEach((x) => { const on = x.dataset.ntkind === kind; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
    if (ta) { ta.placeholder = k.ph; ta.value = Store.get(this.draftKey(kind), '') || ''; ta.dispatchEvent(new Event('input')); }
    const l = $('#ntLabel'); if (l) l.textContent = kind === 'idea' ? 'Your idea' : 'Your note';
    const out = $('#ntOut'); if (out) out.hidden = true;
  },
  async send() {
    const btn = $('#ntSend'), ta = $('#ntBody'), nm = $('#ntName'); if (!btn || !ta || btn.disabled) return;
    const body = ta.value.trim();
    if (body.length < 3) { toast('Write a few words first', 'err'); if (IS_TV) Nav.focus(ta); else ta.focus(); return; }
    btn.disabled = true; const lbl = btn.querySelector('span'), was = lbl.textContent; lbl.textContent = 'Sending…';
    try {
      await this.rpc('mkc_note_send', { p_kind: this.kind, p_body: body, p_name: (nm && nm.value.trim()) || null, p_version: APP_VERSION, p_platform: this.platform() });
      Store.set(this.draftKey(this.kind), ''); ta.value = ''; ta.dispatchEvent(new Event('input'));
      const out = $('#ntOut'); out.hidden = false;
      out.innerHTML = `<i data-lucide="${this.kind === 'thanks' ? 'heart' : 'check'}"></i><div><b>${this.kind === 'thanks' ? 'Thank you. It means a lot.' : 'Thanks, your idea is in.'}</b><small>${esc(this.who())} reads every note${this.onMk() ? '. Any reply shows up under Your notes.' : '.'}</small></div>`;
      icons(); try { MKLog.add('info', `note sent (${this.kind})`); } catch (e) { /* log not ready */ }
      if (this.onMk()) this.loadMine();
    } catch (e) {
      toast(e.message || 'The note was not sent. Try again.', 'err', 6000);
    } finally { btn.disabled = false; lbl.textContent = was; }
  },

  /* ---------- the sender's own notes ---------- */
  async loadMine() {
    try { this.mine = (await this.rpc('mkc_notes_mine', {}, true)) || []; } catch (e) { this.mine = e.off ? null : this.mine; }
    this.paintMine();
  },
  paintMine() {
    const s = $('#ntMine'); if (!s) return;
    const l = this.mine || []; s.hidden = !l.length; if (!l.length) { s.innerHTML = ''; return; }
    s.innerHTML = `<h4>Your notes</h4>${l.map((n) => `<article class="nt-item" data-id="${+n.id}">
        <header><i data-lucide="${n.kind === 'thanks' ? 'heart' : 'lightbulb'}"></i><span>${esc(this.date(n.created_at))}</span><b class="nt-st nt-st-${esc(n.status)}">${esc(this.STATUS[n.status] || n.status)}</b>
          <button class="ibtn sm" type="button" data-nav data-ntforget="${+n.id}" aria-label="Delete this note"><i data-lucide="trash-2"></i></button></header>
        <p>${esc(n.body)}</p>
        ${n.reply ? `<blockquote><small>Reply from ${esc(this.who())}</small>${esc(n.reply)}</blockquote>` : ''}
      </article>`).join('')}`;
    icons();
    s.querySelectorAll('[data-ntforget]').forEach((x) => x.addEventListener('click', () => this.twice(x, async () => {
      try { await this.rpc('mkc_note_forget', { p_id: +x.dataset.ntforget }, true); this.mine = (this.mine || []).filter((n) => +n.id !== +x.dataset.ntforget); this.paintMine(); toast('Note deleted', 'ok'); } catch (e) { toast(e.message, 'err'); }
    })));
  },

  /* ---------- the owner's inbox ---------- */
  async loadCounts() { if (!this.owner()) return null; try { this.counts = await this.rpc('mkc_notes_counts', {}, true); } catch (e) { this.counts = null; } return this.counts; },
  async inbox() {
    if (!this.owner()) { toast('Only the owner account can read notes', 'err'); return; }
    X8.layer('notesInbox', { label: 'Notes inbox', icon: 'inbox', eyebrow: 'Ideas & thanks', wide: true });
    const b = X8.body('notesInbox');
    const F = [['open', 'Open'], ['new', 'New'], ['planned', 'Planned'], ['done', 'Done'], ['declined', 'Not planned'], ['all', 'All']];
    b.innerHTML = `<h3 class="x8-h">Notes inbox</h3><p class="sub" id="nbSum">Loading…</p>
      <div class="segc nt-kind" role="tablist" aria-label="Show">${F.map(([v, l]) => `<button type="button" role="tab" data-nav data-nbf="${v}" class="${v === this.boxFilter ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="nbList" class="nt-box"></div>
      <div class="actions"><button class="btn btn-ghost" type="button" data-nav id="nbMore" hidden><i data-lucide="chevrons-down"></i>Load more</button><button class="btn btn-ghost" type="button" data-nav id="nbRead"><i data-lucide="check-check"></i>Mark shown as read</button></div>`;
    icons(); X8.open('notesInbox');
    b.querySelectorAll('[data-nbf]').forEach((x) => x.addEventListener('click', () => { this.boxFilter = x.dataset.nbf; b.querySelectorAll('[data-nbf]').forEach((y) => y.classList.toggle('on', y === x)); this.loadBox(); }));
    $('#nbMore', b).addEventListener('click', () => this.loadBox(true));
    $('#nbRead', b).addEventListener('click', async () => {
      const ids = (this.box || []).filter((n) => n.status === 'new').map((n) => n.id);
      for (const id of ids) { try { await this.rpc('mkc_note_set', { p_id: id, p_status: 'read' }, true); const n = this.box.find((x) => x.id === id); if (n) n.status = 'read'; } catch (e) { toast(e.message, 'err'); break; } }
      this.paintBox(); this.loadCounts().then(() => this.sum());
    });
    this.loadCounts().then(() => this.sum()); this.loadBox();
  },
  sum() { const s = $('#nbSum'), c = this.counts; if (s) s.textContent = c ? `${c.new} new · ${c.ideas} ideas · ${c.thanks} thank-you notes · ${c.all} in all` : 'Notes are not switched on yet, or this account is not the owner.'; },
  async loadBox(more) {
    const list = $('#nbList'); if (!list) return;
    if (!more) list.innerHTML = '<p class="sub">Loading…</p>';
    try {
      const before = more && this.box && this.box.length ? this.box[this.box.length - 1].id : null;
      const rows = (await this.rpc('mkc_notes_inbox', { p_status: this.boxFilter === 'all' ? null : this.boxFilter, p_before: before, p_limit: 50 }, true)) || [];
      this.box = more ? [...(this.box || []), ...rows] : rows; this.boxMore = rows.length === 50;
      this.paintBox();
    } catch (e) { list.innerHTML = `<p class="sub">${esc(e.message)}</p>`; }
  },
  paintBox() {
    const list = $('#nbList'); if (!list) return;
    const more = $('#nbMore'); if (more) more.hidden = !this.boxMore;
    if (!this.box.length) { list.innerHTML = '<p class="sub">Nothing here.</p>'; return; }
    list.innerHTML = this.box.map((n) => `<article class="nt-item${n.status === 'new' ? ' is-new' : ''}" data-id="${+n.id}">
        <header><i data-lucide="${n.kind === 'thanks' ? 'heart' : 'lightbulb'}"></i><span>${esc(n.name || (n.signed_in ? 'Signed-in user' : 'Guest'))} · ${esc(this.date(n.created_at))}${n.app_version ? ` · ${esc(n.app_version)}` : ''}${n.platform ? ` · ${esc(n.platform)}` : ''}</span>
          <select class="inp nt-sel" data-nbst="${+n.id}" aria-label="Status">${Object.entries(this.STATUS).map(([v, l]) => `<option value="${v}"${v === n.status ? ' selected' : ''}>${v === 'new' ? 'New' : l}</option>`).join('')}</select>
          <button class="ibtn sm" type="button" data-nav data-nbdel="${+n.id}" aria-label="Delete note"><i data-lucide="trash-2"></i></button></header>
        <p>${esc(n.body)}</p>
        ${n.signed_in ? `<div class="nt-reply"><textarea class="inp" rows="2" maxlength="600" data-nbrep="${+n.id}" placeholder="Reply (the sender sees it under Your notes)">${esc(n.reply || '')}</textarea><button class="btn btn-ghost btn-sm" type="button" data-nav data-nbsave="${+n.id}">Save reply</button></div>` : '<small class="nt-fine">Sent without signing in, so a reply can’t reach them.</small>'}
      </article>`).join('');
    icons();
    const one = (id) => this.box.find((x) => +x.id === +id);
    list.querySelectorAll('[data-nbst]').forEach((x) => x.addEventListener('change', async () => {
      try { await this.rpc('mkc_note_set', { p_id: +x.dataset.nbst, p_status: x.value }, true); const n = one(x.dataset.nbst); if (n) n.status = x.value; x.closest('.nt-item').classList.toggle('is-new', x.value === 'new'); this.loadCounts().then(() => this.sum()); toast('Saved', 'ok'); } catch (e) { toast(e.message, 'err'); }
    }));
    list.querySelectorAll('[data-nbsave]').forEach((x) => x.addEventListener('click', async () => {
      const ta = list.querySelector(`[data-nbrep="${x.dataset.nbsave}"]`); const n = one(x.dataset.nbsave);
      try { await this.rpc('mkc_note_set', { p_id: +x.dataset.nbsave, p_reply: ta.value }, true); if (n) n.reply = ta.value.trim(); toast(ta.value.trim() ? 'Reply saved' : 'Reply removed', 'ok'); } catch (e) { toast(e.message, 'err'); }
    }));
    list.querySelectorAll('[data-nbdel]').forEach((x) => x.addEventListener('click', () => this.twice(x, async () => {
      try { await this.rpc('mkc_note_forget', { p_id: +x.dataset.nbdel }, true); this.box = this.box.filter((n) => +n.id !== +x.dataset.nbdel); this.paintBox(); this.loadCounts().then(() => this.sum()); } catch (e) { toast(e.message, 'err'); }
    })));
  },

  /* ---------- Settings, palette, links ---------- */
  rows() {
    const who = esc(this.who());
    const r = [
      { key: 'noteIdea', label: 'Suggest a feature', help: `Tell ${who} what would make MKCinema better. Popular ideas go into upcoming updates.`, type: 'button', text: 'Suggest a feature', icon: 'lightbulb', run: () => this.open('idea') },
      { key: 'noteThanks', label: 'Say thanks', help: `A short note straight to ${who}, who reads every one.`, type: 'button', text: 'Write a thank-you', icon: 'heart', run: () => this.open('thanks') },
    ];
    if (this.onMk()) r.push({ key: 'noteMine', label: 'Your notes', help: 'See the notes you sent from this account, whether they are planned or done, and any reply.', type: 'button', text: 'Open my notes', icon: 'inbox', run: () => this.open() });
    if (this.owner()) {
      const c = this.counts;
      r.push({ group: 'Owner' }, { key: 'noteInbox', label: 'Notes inbox', help: c ? `${c.new} new, ${c.all} in all. Only your account sees this.` : 'Read, mark and reply to notes. Only your account sees this.', type: 'button', text: 'Open inbox', icon: 'inbox', run: () => { closeLayer('settings'); this.inbox(); } });
      if (!c && !this.countT) { this.countT = setTimeout(() => { this.countT = 0; this.loadCounts().then((x) => { if (x && $('#set-noteInbox')) try { renderSettingsBody(); } catch (e) { /* closed */ } }); }, 50); }
    }
    return r;
  },
  init() {
    const sec = { id: 'ideas', icon: 'lightbulb', label: 'Ideas & thanks', intro: `Suggest a feature or send ${esc(this.who())} a thank-you note.`, rows: () => (this.kids() ? [{ html: () => '<p class="sub">Notes are sent from a grown-up’s seat.</p>' }] : this.rows()) };
    if (!secById('ideas')) { const i = SECTIONS.findIndex((x) => x.id === 'support'); SECTIONS.splice(i >= 0 ? i : SECTIONS.length, 0, sec); }
    COMMANDS.push({ label: 'Suggest a feature', icon: 'lightbulb', run: () => this.open('idea') }, { label: 'Send a thank-you note', icon: 'heart', run: () => this.open('thanks') });
    // shareable links: app.mkcinema.app/#ideas and #thanks (the TV shows these as a QR code)
    const go = () => {
      const h = location.hash.slice(1); if (!/^(ideas|thanks)$/.test(h)) return;
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => this.open(h === 'thanks' ? 'thanks' : 'idea'), 400);
    };
    addEventListener('hashchange', go); go();
  },
};
Notes.init();
