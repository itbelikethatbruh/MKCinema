/* ---------------- Seats: everyone in the house gets their own ----------------
   One account, several seats. Each seat keeps its own watchlist, progress, watched list, taste and searches (Store keys
   are scoped per seat, see SEAT_KEYS at the top of the app). A seat can have a 4-digit PIN. A kids seat only shows
   Animation and Family titles, has no Live TV, and needs the grown-up PIN for Settings, Addons and to leave.
   PINs are stored as salted SHA-256 hashes, never as digits. Seats travel with account sync. */
const Seats = {
  list() { return Store.raw.get('seats', []) || []; },
  saveList(l) { Store.raw.set('seats', l); Account.schedule(); },
  owner() { return { id: '', name: Store.raw.get('ownerSeatName', '') || (Account.user ? Account.name().split('@')[0] : 'Main'), color: '#d9d4c7', pin: Store.raw.get('ownerPin', ''), kids: false, av: Store.raw.get('ownerAv', '') }; },
  all() { return [this.owner(), ...this.list()]; },
  cur() { return this.all().find((s) => s.id === SEAT) || this.owner(); },
  kids() { return !!this.cur().kids; },
  COLORS: ['#d9d4c7', '#bccde4', '#e3c8bd', '#e8d7b8', '#9ccfb0', '#c9b6e4', '#e5a3a3', '#a3d3e5'],
  async hashPin(id, pin) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mkc-seat:${id}:${pin}`)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); },
  /* 2.10.0: what a seat shows. 'photo' = the account's profile photo (main seat only), 'letter' = the old initial,
     a SeatArt code = one of the portraits. A seat that never chose shows the account photo (main seat) or a portrait
     picked from its id, so it looks the same on every device without anything being saved. */
  artOf(s) {
    const av = s.av || '', photo = s.id === '' && Store.get('avatar', null);
    if (av === 'letter') return 'letter';
    if (av === 'photo') return photo ? 'photo' : 'letter';
    if (typeof SeatArt !== 'undefined' && SeatArt.valid(av)) return av;
    if (photo) return 'photo';
    if (typeof SeatArt === 'undefined') return 'letter';
    const people = SeatArt.SET.filter((c) => c[0] === 'p'), h = [...String(s.id || 'main')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    return people[h % people.length];
  },
  avatar(s, lg, force) {
    const a = force || this.artOf(s), cls = `seat-av${lg ? ' lg' : ''}${s.kids ? ' kids' : ''}`;
    if (a === 'photo') return `<span class="${cls} img"><img src="${esc(Store.get('avatar', ''))}" alt=""></span>`;
    if (a !== 'letter') return `<span class="${cls} art">${SeatArt.svg(a)}</span>`;
    return `<span class="${cls}" style="--sc:${esc(s.color || '#d9d4c7')}">${esc((s.name || '?').trim()[0] || '?').toUpperCase()}</span>`;
  },
  managing: false,
  /* ---- the chooser ---- */
  pick({ force = false } = {}) {
    if (!this.list().length && !force) return;
    X8.layer('seatPick', { label: 'Who’s watching?', full: true });
    X8.backHook.seatPick = () => { const p = $('#seatPin'); if (p && !p.hidden) { p.hidden = true; Nav.settle(); return true; } return !force && !Store.raw.get('seatChosen', false) ? true : false; };
    const b = X8.body('seatPick'), m = this.managing;
    b.innerHTML = `<div class="seat-wrap"><span class="pk-mark">MKCinema</span><h2 class="seat-h">${m ? 'Manage seats' : 'Who’s watching?'}</h2>
      <div class="seat-grid${m ? ' manage' : ''}">${this.all().map((s) => `<button type="button" class="seat" data-nav data-seat="${esc(s.id)}" aria-label="${m ? `Edit ${esc(s.name)}` : esc(s.name)}"><span class="seat-face">${this.avatar(s, true)}${m ? '<span class="seat-pen"><i data-lucide="pencil"></i></span>' : ''}</span><b>${esc(s.name)}</b><small>${m ? 'Edit' : s.kids ? 'Kids' : s.pin ? 'PIN' : s.id === SEAT ? 'Here now' : '&nbsp;'}</small></button>`).join('')}
      <button type="button" class="seat add" data-nav id="seatAdd"><span class="seat-av lg add"><i data-lucide="plus"></i></span><b>Add a seat</b><small>&nbsp;</small></button></div>
      <button type="button" class="btn ${m ? 'btn-prime' : 'btn-ghost'} seat-manage" data-nav id="seatManage">${m ? '<i data-lucide="check"></i>Done' : '<i data-lucide="pencil"></i>Manage seats'}</button></div>
      <div class="seat-pin x8-sub" id="seatPin" hidden></div>`;
    icons();
    $$('[data-seat]', b).forEach((x) => x.addEventListener('click', () => (this.managing ? this.editFromPicker(x.dataset.seat) : this.enter(x.dataset.seat))));
    $('#seatManage').onclick = () => { this.managing = !this.managing; this.pick({ force: true }); if (IS_TV) Nav.focus($('#seatManage'), true); };
    $('#seatAdd').onclick = () => this.guard(() => this.edit(null));
    X8.open('seatPick');
    if (IS_TV && !m) { const c = $(`[data-seat="${SEAT}"]`, b); if (c) Nav.focus(c, true); }
  },
  /* editing from the picker: a kids seat needs the grown-up PIN, and someone else's locked seat needs its own PIN */
  editFromPicker(id) {
    const s = this.all().find((x) => x.id === id); if (!s) return;
    this.guard(() => (s.pin && s.id !== SEAT && !this.unlocked ? this.askPin(s, () => this.edit(id)) : this.edit(id)));
  },
  async enter(id) {
    const s = this.all().find((x) => x.id === id); if (!s) return;
    const from = this.cur();
    const go = () => { Store.raw.set('seatChosen', true); try { sessionStorage.setItem('mkc:seatOk', '1'); } catch (e) { /* private mode */ } if (id === SEAT) { X8.close('seatPick'); return; } Account.flush().catch(() => {}).finally(() => { try { localStorage.setItem('mkc:seat', id); } catch (e) { /* blocked */ } location.reload(); }); };
    // leaving a kids seat takes the grown-up PIN; entering a seat with a PIN takes that seat's PIN
    if (from.kids && id !== SEAT && this.owner().pin) return this.askPin(this.owner(), () => (s.pin && s.id !== '' ? this.askPin(s, go) : go()), 'Grown-up PIN to leave the kids seat');
    if (s.pin && id !== SEAT) return this.askPin(s, go);
    go();
  },
  askPin(s, ok, title) {
    let box = $('#seatPin');
    if (!box || $('#seatPick').hidden) { this.pick({ force: true }); box = $('#seatPin'); }
    let v = '';
    const paint = () => {
      box.innerHTML = `<div class="modal glass-solid pp-modal seat-pad">${this.avatar(s, true)}<h3 class="x8-h">${esc(title || `PIN for ${s.name}`)}</h3><div class="pin-dots">${[0, 1, 2, 3].map((i) => `<i class="${i < v.length ? 'on' : ''}"></i>`).join('')}</div>
        <div class="pin-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'x', 0, 'ok'].map((k) => `<button type="button" data-nav data-pk="${k}" ${k === 'ok' ? 'class="pk-ok"' : ''}>${k === 'x' ? '<i data-lucide="delete"></i>' : k === 'ok' ? '<i data-lucide="check"></i>' : k}</button>`).join('')}</div>
        <button class="btn btn-ghost btn-sm" type="button" data-nav id="pinCancel">Cancel</button></div>`;
      icons(); $$('[data-pk]', box).forEach((x) => x.addEventListener('click', () => press(x.dataset.pk)));
      $('#pinCancel').onclick = () => { box.hidden = true; Nav.settle(); };
    };
    const press = async (k) => {
      if (k === 'x') v = v.slice(0, -1); else if (k === 'ok' || v.length >= 4) { /* check below */ } else v += k;
      if (v.length === 4 || k === 'ok') {
        const wait = Math.ceil(((Seats.lockUntil || 0) - Date.now()) / 1000);
        if (wait > 0) { v = ''; paint(); toast(`Too many tries. Wait ${wait} s`, 'err', 1800, 'pin'); return; }
        if ((await this.hashPin(s.id, v)) === s.pin) { Seats.fails = 0; box.hidden = true; ok(); return; }
        Seats.fails = (Seats.fails || 0) + 1;
        if (Seats.fails >= 5) { Seats.fails = 0; Seats.lockUntil = Date.now() + 60e3; }
        v = ''; paint(); toast(Seats.lockUntil > Date.now() ? 'Too many tries. Wait a minute' : 'That PIN is not right', 'err', 1800, 'pin'); return;
      }
      paint(); const f = $(`[data-pk="${k}"]`, box); if (IS_TV && f) Nav.focus(f, true);
    };
    box.hidden = false; paint(); if (IS_TV) Nav.settle();
    box.onkeydown = (e) => { if (/^\d$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); press(e.key); } if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); press('x'); } };
    box.tabIndex = -1; if (!IS_TV) box.focus();
  },
  /* grown-up gate for a kids seat */
  unlocked: false, unlockedAt: 0, fails: 0, lockUntil: 0,
  guard(fn) {
    if (this.unlocked && Date.now() - this.unlockedAt > 10 * 60e3) this.unlocked = false;   // the grown-up unlock lasts 10 minutes
    if (!this.kids() || this.unlocked || !this.owner().pin) { if (this.kids() && !this.owner().pin && !this.unlocked) { /* no grown-up PIN set: nothing to check */ } return fn(); }
    this.askPin(this.owner(), () => { this.unlocked = true; this.unlockedAt = Date.now(); if (!this.managing) X8.close('seatPick'); fn(); }, 'Grown-up PIN');
  },
  kidSafe(m) {
    if (!m) return true;
    const g = genresOf(m).map((x) => String(x).toLowerCase());
    if (!g.length) return false;
    return g.some((x) => /animation|family|kids|children/.test(x)) && !g.some((x) => /horror|thriller|crime|war/.test(x));
  },
  /* ---- Settings › Seats ---- */
  section() {
    const me = this.cur();
    return { id: 'seats', icon: 'users', label: 'Seats', intro: 'Everyone in the house gets their own seat: their own watchlist, progress and picks. A seat can have a PIN, and a kids seat shows only Animation and Family titles.', bind: () => this.bindSection(), rows: () => [
      { html: () => `<div class="seat-rows">${this.all().map((s) => `<div class="seat-row${s.id === SEAT ? ' here' : ''}">${this.avatar(s)}<div><b>${esc(s.name)}</b><small>${s.id === SEAT ? '<span class="seat-here">Watching now</span>' : ''}${[s.id === '' ? 'Main seat' : '', s.kids ? 'Kids' : '', s.pin ? 'PIN on' : 'No PIN'].filter(Boolean).join(' · ')}</small></div>
          <div class="inrow">${s.id !== SEAT ? `<button class="btn btn-ghost btn-sm" type="button" data-nav data-sgo="${esc(s.id)}">Switch</button>` : ''}<button class="btn btn-ghost btn-sm" type="button" data-nav data-sed="${esc(s.id)}"><i data-lucide="pencil"></i>Edit</button></div></div>`).join('')}</div>` },
      { key: 'seatAdd', label: 'Add a seat', help: 'Up to 7 more seats on this account.', type: 'button', text: 'Add a seat', icon: 'user-plus', run: () => this.edit(null) },
      { key: 'seatAsk', label: 'Ask who’s watching', help: 'Show the seats each time MKCinema opens, once there is more than one.', type: 'toggle', get: () => CFG.seatAsk !== false },
      { html: () => (this.list().some((x) => x.kids) && !this.owner().pin ? '<p class="tour-note seat-warn">A kids seat has no lock yet: anyone can leave it. Edit your main seat and set a grown-up PIN.</p>' : '') },
      { html: () => `<p class="tour-note">${me.kids ? 'This is a kids seat.' : 'Seats are not separate accounts: anyone with this device can pick a seat without a PIN. Give a seat a PIN to keep it to its owner.'}</p>` },
    ] };
  },
  bindSection() {
    $$('#setBody [data-sgo]').forEach((b) => b.addEventListener('click', () => { closeLayer('settings'); this.enter(b.dataset.sgo); }));
    $$('#setBody [data-sed]').forEach((b) => b.addEventListener('click', () => this.edit(b.dataset.sed)));
  },
  edit(id) {
    const isNew = id == null, s = isNew ? { id: `s${Date.now().toString(36)}`, name: '', color: this.COLORS[(this.list().length + 1) % this.COLORS.length], kids: false, pin: '', av: this.freshArt() } : { ...this.all().find((x) => x.id === id) };
    if (!s.av || !(s.av === 'letter' || s.av === 'photo' || SeatArt.valid(s.av))) s.av = this.artOf(s);
    const photo = s.id === '' && Store.get('avatar', null);
    let rolled = SeatArt.SET.includes(s.av) || s.av === 'photo' || s.av === 'letter' ? '' : s.av;
    if (isNew && this.list().length >= 7) { toast('Seven extra seats is the most', 'err'); return; }
    X8.layer('seatEdit', { label: 'Seat', icon: 'users', eyebrow: 'Seats' });
    const b = X8.body('seatEdit');
    b.innerHTML = `<h3 class="x8-h">${isNew ? 'Add a seat' : `Edit ${esc(s.name)}`}</h3>
      <div class="x8-form"><div class="se-top"><span id="seFace">${this.avatar(s, true, s.av)}</span><label>Name<input class="inp" id="seName" maxlength="20" value="${esc(s.name)}" placeholder="Name" autocomplete="off"></label></div>
      <div class="se-avh"><b>Picture</b><button class="btn btn-ghost btn-sm" type="button" data-nav id="seRoll"><i data-lucide="wand-sparkles"></i>Surprise me</button></div>
      <div class="seat-avs" role="radiogroup" aria-label="Picture" id="seAvs"></div>
      <div class="seat-colors" role="radiogroup" aria-label="Colour" id="seCols"${s.av === 'letter' ? '' : ' hidden'}>${this.COLORS.map((c) => `<button type="button" data-nav data-col="${c}" class="${c === s.color ? 'on' : ''}" style="--sc:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
      ${s.id !== '' ? `<div class="set-row"><div><b>Kids seat</b><small>Only Animation and Family titles, no Live TV, and the grown-up PIN for Settings and Addons.</small></div><div class="set-ctl"><button class="switch ${s.kids ? 'on' : ''}" type="button" id="seKids" role="switch" aria-checked="${!!s.kids}" aria-label="Kids seat"></button></div></div>` : ''}
      ${s.id !== '' && !this.owner().pin ? '<label id="seGrownL">Grown-up PIN (4 digits). A kids seat needs one, so only a grown-up can leave it or open Settings<input class="inp mono" id="seGrown" inputmode="numeric" maxlength="4" placeholder="Set a grown-up PIN" autocomplete="off"></label>' : ''}
      <label>${s.id === '' ? 'Grown-up PIN (4 digits, guards kids seats too)' : 'PIN (4 digits, optional)'}<input class="inp mono" id="sePin" inputmode="numeric" maxlength="4" placeholder="${s.pin ? '•••• (leave empty to keep)' : 'No PIN'}" autocomplete="off"></label>
      ${s.pin ? '<button class="btn btn-ghost btn-sm" type="button" data-nav id="seNoPin"><i data-lucide="lock-open"></i>Remove the PIN</button>' : ''}</div>
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="seSave"><i data-lucide="check"></i>Save</button>${!isNew && s.id !== '' && s.id !== SEAT ? '<button class="btn btn-ghost danger" type="button" data-nav id="seDel"><i data-lucide="trash-2"></i>Remove seat</button>' : ''}</div>`;
    const avs = () => [...(photo ? ['photo'] : []), ...(rolled ? [rolled] : []), ...SeatArt.SET, 'letter'];
    const face = () => { $('#seFace', b).innerHTML = this.avatar({ ...s, name: $('#seName', b).value || s.name || '?' }, true, s.av); $('#seCols', b).hidden = s.av !== 'letter'; };
    const paintAvs = () => {
      $('#seAvs', b).innerHTML = avs().map((a) => `<button type="button" data-nav data-av="${esc(a)}" class="${a === s.av ? 'on' : ''}" role="radio" aria-checked="${a === s.av}" aria-label="${a === 'photo' ? 'Your profile photo' : a === 'letter' ? 'First letter of the name' : 'Portrait'}">${this.avatar({ ...s, name: $('#seName', b).value || s.name || '?', kids: false }, false, a)}</button>`).join('');
      $$('[data-av]', b).forEach((x) => x.addEventListener('click', () => { s.av = x.dataset.av; $$('[data-av]', b).forEach((y) => { y.classList.toggle('on', y === x); y.setAttribute('aria-checked', y === x); }); face(); }));
    };
    paintAvs(); icons();
    $('#seRoll', b).onclick = () => { let r; do r = SeatArt.random(); while (r === s.av); rolled = r; s.av = r; paintAvs(); face(); };
    $('#seName', b).addEventListener('input', () => { if (s.av === 'letter') face(); });
    $$('[data-col]', b).forEach((x) => x.addEventListener('click', () => { s.color = x.dataset.col; $$('[data-col]', b).forEach((y) => y.classList.toggle('on', y === x)); face(); }));
    const k = $('#seKids', b); if (k) k.onclick = () => { s.kids = !s.kids; k.classList.toggle('on', s.kids); k.setAttribute('aria-checked', s.kids); };
    const np = $('#seNoPin', b); if (np) np.onclick = () => { s.pin = ''; np.remove(); toast('PIN will be removed when you save'); };
    $('#sePin', b).addEventListener('keydown', (e) => e.stopPropagation());
    $('#seName', b).addEventListener('keydown', (e) => e.stopPropagation());
    const gIn = $('#seGrown', b); if (gIn) gIn.addEventListener('keydown', (e) => e.stopPropagation());
    $('#seSave').onclick = () => this.guard(async () => {
      s.name = $('#seName').value.trim() || (s.id === '' ? 'Main' : 'Guest'); const pin = $('#sePin').value.trim();
      if (pin && !/^\d{4}$/.test(pin)) { toast('A PIN is 4 digits', 'err'); return; }
      if (pin) s.pin = await this.hashPin(s.id, pin);
      const gEl = $('#seGrown'), grown = gEl ? gEl.value.trim() : '';
      if (s.kids && s.id !== '' && !this.owner().pin) {
        if (!/^\d{4}$/.test(grown)) { toast('Set a 4-digit grown-up PIN first, so kids can’t leave their seat', 'err', 4200); if (gEl) gEl.focus(); return; }
        Store.raw.set('ownerPin', await this.hashPin('', grown)); Account.schedule();
      }
      if (s.id === '') { Store.raw.set('ownerSeatName', s.name); Store.raw.set('ownerPin', s.pin || ''); Store.raw.set('ownerAv', s.av || ''); Account.schedule(); }
      else { const l = this.list(), i = l.findIndex((x) => x.id === s.id), row = { id: s.id, name: s.name, color: s.color, kids: !!s.kids, pin: s.pin || '', av: s.av || '' }; if (i >= 0) l[i] = row; else l.push(row); this.saveList(l); }
      X8.close('seatEdit'); this.refresh(); toast(isNew ? `${s.name} has a seat` : 'Seat saved', 'ok');
    });
    const del = $('#seDel'); if (del) del.onclick = () => confirmTwice(del, () => this.guard(() => {
      this.saveList(this.list().filter((x) => x.id !== s.id));
      try { Object.keys(localStorage).filter((x) => x.startsWith(`mkc:seat:${s.id}:`)).forEach((x) => localStorage.removeItem(x)); } catch (e) { /* blocked */ }
      X8.close('seatEdit'); this.refresh(); toast('Seat removed');
    }));
    X8.open('seatEdit');
    if (IS_TV) { if (typeof TvType !== 'undefined') ['#seName', '#sePin', '#seGrown'].forEach((q) => { const el = $(q, b); if (el) TvType.guard(el); }); const on = $('#seAvs .on', b); if (on) Nav.focus(on, true); }
  },
  /* a new seat starts on a portrait nobody in the house has yet */
  freshArt() {
    const used = new Set(this.all().map((x) => this.artOf(x))), free = SeatArt.SET.filter((c) => c[0] === 'p' && !used.has(c));
    return free.length ? free[Math.floor(Math.random() * free.length)] : SeatArt.random();
  },
  refresh() {
    if (!$('#settings').hidden) renderSettingsBody();
    const p = $('#seatPick'); if (p && !p.hidden) { this.pick({ force: true }); if (IS_TV) Nav.settle(); }
    Account.chip();
  },
  /* ---- sync: the main seat's library stays the account's library; other seats ride along under d.seats ---- */
  seatData(id) {
    const g = (k, d) => { try { const v = localStorage.getItem(`mkc:seat:${id}:${k}`); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
    return { watchlist: g('watchlist', []), progress: g('progress', {}), watched: g('watched', {}), taste: g('taste', null) };
  },
  initSync() {
    const ex = exportData;
    exportData = function () {
      const d = ex.apply(this, arguments);
      if (SEAT) ['watchlist', 'progress', 'watched', 'taste'].forEach((k) => { d[k] = Store.raw.get(k, k === 'watchlist' ? [] : k === 'taste' ? null : {}); });
      const list = Seats.list();
      d.seats = { list, ownerName: Store.raw.get('ownerSeatName', ''), ownerPin: Store.raw.get('ownerPin', ''), ownerAv: Store.raw.get('ownerAv', ''), data: Object.fromEntries(list.map((s) => [s.id, Seats.seatData(s.id)])) };
      return d;
    };
    const ap = Account.applyRemote.bind(Account);
    Account.applyRemote = function (d) {
      if (!d) return ap(d);
      const lib = {}; if (SEAT) ['watchlist', 'progress', 'watched', 'taste'].forEach((k) => { if (k in d) { lib[k] = d[k]; delete d[k]; } });
      ap(d);
      Object.entries(lib).forEach(([k, v]) => Store.raw.set(k, v));
      const z = d.seats; if (!z || !Array.isArray(z.list)) return;
      Store.raw.set('seats', z.list); if (z.ownerName != null) Store.raw.set('ownerSeatName', z.ownerName); if (z.ownerPin != null) Store.raw.set('ownerPin', z.ownerPin); if (z.ownerAv != null) Store.raw.set('ownerAv', z.ownerAv);
      Object.entries(z.data || {}).forEach(([id, v]) => {
        if (id === SEAT) { if (v.watchlist) { S.watchlist = v.watchlist; Store.set('watchlist', v.watchlist); } if (v.progress) { S.progress = v.progress; Store.set('progress', v.progress); } if (v.watched) { Store.set('watched', v.watched); WATCHED = null; } if (v.taste) Store.set('taste', v.taste); return; }
        Object.entries(v || {}).forEach(([k, x]) => { if (x != null) try { localStorage.setItem(`mkc:seat:${id}:${k}`, JSON.stringify(x)); } catch (e) { /* full */ } });
      });
    };
  },
  init() {
    this.initSync();
    // the seat a removed or synced-away list no longer has falls back to the main seat
    if (SEAT && !this.list().some((s) => s.id === SEAT)) { try { localStorage.removeItem('mkc:seat'); } catch (e) { /* blocked */ } location.reload(); return; }
    SECTIONS.splice(SECTIONS.findIndex((s) => s.id === 'picks') + 1, 0, this.section());
    const g = SET_GROUPS.find(([n]) => n === 'You'); if (g) g[1].splice(1, 0, 'seats');
    SET_BLURB.seats = 'Profiles for everyone, PINs, kids';
    COMMANDS.push({ label: 'Switch seat (who’s watching)', icon: 'users', run: () => this.pick({ force: true }) });
    if (SEAT) document.documentElement.classList.add('in-seat');
    if (this.kids()) {
      document.documentElement.classList.add('kids-seat');
      const card = cardHTML; cardHTML = function (m) { return Seats.kidSafe(m) ? card.apply(this, arguments) : ''; };
      // a row left with nothing kid-safe in it disappears, and the banner only features kid-safe films
      const fr = fillRail; fillRail = function (sec, html) { const r = fr.apply(this, arguments); if (sec && !String(html || '').trim()) sec.hidden = true; return r; };
      const sh = setHeroList; setHeroList = function (list) { const l = (list || []).filter((m) => Seats.kidSafe(m)); if (!l.length) { S.hero = []; return; } return sh.call(this, l); };
      if (typeof Peak !== 'undefined' && Peak.open) Peak.open = function () { toast('Not on the kids seat', 'err', 2200, 'kids'); };
      const rh = renderHome; renderHome = async function () { S.hero = []; const r = await rh.apply(this, arguments); if (!S.hero.length) $('#hero').hidden = true; return r; };
      const od = openDetail; openDetail = function (seed) { if (!Seats.kidSafe(S.metas.get(seed && seed.id) || seed)) { toast('Not on the kids seat', 'err', 2200, 'kids'); return; } return od.apply(this, arguments); };
      const g0 = go; go = function (view) { if (view === 'tv' || view === 'studio') { toast('Not on the kids seat', 'err', 2200, 'kids'); return; } return g0.apply(this, arguments); };
      const os = openSettings; openSettings = function () { const a = arguments; Seats.guard(() => os.apply(this, a)); };
      document.addEventListener('click', (e) => { const b = e.target.closest('#openAddons'); if (b && !Seats.unlocked && Seats.owner().pin) { e.preventDefault(); e.stopImmediatePropagation(); Seats.guard(() => b.click()); } }, true);
    }
    // a small seat badge on the account button
    const chip = Account.chip.bind(Account);
    Account.chip = function () { chip(); const b = $('#openAccount'); if (b && Account.user && SEAT) { const a = Seats.artOf(Seats.cur()); if (a !== 'letter' && a !== 'photo') b.innerHTML = `<span class="avatar ph art">${SeatArt.svg(a)}</span>`; } if (b && Seats.list().length) { b.insertAdjacentHTML('beforeend', `<span class="seat-dot" style="--sc:${esc(Seats.cur().color)}" title="Seat: ${esc(Seats.cur().name)}"></span>`); } };
    Account.chip();
    let ok = false; try { ok = sessionStorage.getItem('mkc:seatOk') === '1'; } catch (e) { /* private */ }
    if (this.list().length && CFG.seatAsk !== false && !ok) {
      const wait = (n) => { if ((document.body.classList.contains('intro-on') || !$('#tour').hidden) && n < 60) setTimeout(() => wait(n + 1), 500); else this.pick(); };
      setTimeout(() => wait(0), 400);
    }
  },
};
Seats.init();
