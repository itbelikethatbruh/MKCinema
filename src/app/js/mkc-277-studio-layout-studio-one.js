
'use strict';
/* ---------------- 2.77 Layout Studio ----------------
   One place to make Home yours: look, menu, card size, banner, movies or series, and the rows. Every change shows at
   once in a small Computer / TV / Phone preview drawn from your own Home (your rows, your posters, your banner), and
   nothing changes for real until Save. Saving uses settings that already sync (cfg, homeLayout and the seat's
   homeArrange), so the layout reaches the phone and the TV by itself. The menu is kept per kind of screen: a TV and
   a phone each get their own choice. Share gives a link and a QR code: whoever opens it sees the layout on their own
   Home first, then picks Use this layout or Not now, and can undo it afterwards.
   Only safe choices exist: Search, Settings and the menu can never be hidden, every control works with a TV remote,
   and on a kids seat the studio asks for the grown-up PIN first. */
const LayStudio = {
  ID: 'layoutStudio',
  CARDS: [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']],
  BANNERS: [['full', 'Full'], ['short', 'Short'], ['off', 'Off']],
  FOCUS: [['both', 'Both'], ['movies-first', 'Movies first'], ['series-first', 'Series first']],
  MENUS: [['top', 'Top'], ['side', 'Side']],
  DEVS: [['computer', 'Computer', 'monitor'], ['tv', 'TV', 'tv'], ['phone', 'Phone', 'smartphone']],
  PRESETS: {
    standard: { n: 'Standard', look: 'noir', cards: 'm', banner: 'full', focus: 'both', menu: { tv: 'side', other: 'top' } },
    cinema: { n: 'Cinema', look: 'noir', cards: 'l', banner: 'full', focus: 'movies-first', menu: { tv: 'side', other: 'top' } },
    binge: { n: 'Binge', look: 'midnight', cards: 'm', banner: 'short', focus: 'series-first', menu: { tv: 'side', other: 'side' } },
    family: { n: 'Family room', look: 'linen', cards: 'l', banner: 'full', focus: 'both', menu: { tv: 'side', other: 'top' } },
    minimal: { n: 'Minimal', look: 'noir', cards: 's', banner: 'off', focus: 'both', menu: { tv: 'side', other: 'side' } },
  },
  kind: () => (IS_TV ? 'tv' : 'other'),
  dev: '', draft: null, saved: '', from: '', rows: [],
  /* what is on now, as one recipe */
  current() {
    const a = Arrange.get(), l = Layout.get(), m = CFG.lsMenu && typeof CFG.lsMenu === 'object' ? CFG.lsMenu : {};
    const here = SideNav.side() ? 'side' : 'top';
    return {
      v: 1, look: CFG.look || 'noir', cards: ['s', 'm', 'l'].includes(CFG.cardSize) ? CFG.cardSize : 'm', banner: ['full', 'short', 'off'].includes(CFG.banner) ? CFG.banner : 'full',
      focus: l.focus || 'both',
      menu: { tv: IS_TV ? here : (m.tv === 'top' ? 'top' : 'side'), other: IS_TV ? (m.other === 'side' ? 'side' : 'top') : here },
      rows: { order: a.order.slice(), hide: a.hide.slice(), names: { ...a.names } },
    };
  },
  /* a recipe from a link is checked field by field: anything unknown keeps what is on now */
  clean(r) {
    const c = this.current(); r = r && typeof r === 'object' ? r : {};
    const pick = (v, list, d) => (list.includes(v) ? v : d);
    const str = (v, n) => (typeof v === 'string' && v.length <= n ? v : null);
    const keys = (v) => (Array.isArray(v) ? v.map((k) => str(k, 160)).filter(Boolean).slice(0, 150) : []);
    const m = r.menu && typeof r.menu === 'object' ? r.menu : {};
    const rows = r.rows && typeof r.rows === 'object' ? r.rows : null, names = {};
    if (rows && rows.names && typeof rows.names === 'object') Object.keys(rows.names).slice(0, 80).forEach((k) => { const v = str(rows.names[k], 40); if (str(k, 160) && v && v.trim()) names[k] = v.trim(); });
    return {
      v: 1, look: LOOKS[r.look] ? r.look : c.look, cards: pick(r.cards, ['s', 'm', 'l'], c.cards), banner: pick(r.banner, ['full', 'short', 'off'], c.banner),
      focus: pick(r.focus, ['both', 'movies-first', 'series-first', 'movies', 'series'], c.focus),
      menu: { tv: pick(m.tv, ['top', 'side'], c.menu.tv), other: pick(m.other, ['top', 'side'], c.menu.other) },
      rows: rows ? { order: keys(rows.order), hide: keys(rows.hide), names } : c.rows,
    };
  },
  /* the saved recipe goes live on this device; the other devices follow through account sync */
  apply(r) {
    const prev = this.current();
    if (r.look !== CFG.look && LOOKS[r.look]) setCfg('look', r.look);
    CFG.cardSize = r.cards; CFG.banner = r.banner;
    const rev = Date.now(); CFG.lsMenu = { tv: r.menu.tv, other: r.menu.other, rev }; Store.raw.set('lsMenuRev', rev);
    saveCfg(); applyAll();
    // 2.81: layouts no longer move the menu (one menu everywhere)
    const a = Arrange.get(); this.rows.forEach((x) => { a.titles[x.k] = x.t; });
    a.order = r.rows.order.slice(); a.hide = r.rows.hide.slice(); a.names = { ...r.rows.names };
    if (r.focus !== Layout.get().focus) Layout.set({ focus: r.focus });
    Arrange.save(a);
    if (typeof Account !== 'undefined' && Account.schedule) Account.schedule();
    return prev;
  },
  /* applyAll calls this: a layout saved on another device sets this device's menu once, then this device's own
     choice in Settings › Appearance is left alone */
  menuSync() {
    return;   // 2.81: one menu everywhere
    const m = CFG.lsMenu; if (!m || !m.rev || typeof SideNav === 'undefined') return;
    if (Store.raw.get('lsMenuRev', 0) === m.rev) return;
    Store.raw.set('lsMenuRev', m.rev);
    const want = m[this.kind()]; if ((want === 'side' || want === 'top') && (want === 'side') !== SideNav.side()) SideNav.set(want, { quiet: true });
  },
  /* the rows of Home as the studio lists them, in the draft's order */
  listRows(order) {
    const list = Arrange.list().filter((x) => x.k !== 'folders');
    if (!order || !order.length) return list;
    const rank = new Map(order.map((k, i) => [k, i])), slots = [], placed = [];
    list.forEach((x, i) => { if (rank.has(x.k)) { slots.push(i); placed.push(x); } });
    placed.sort((x, y) => rank.get(x.k) - rank.get(y.k));
    const out = list.slice(); slots.forEach((s, i) => { out[s] = placed[i]; });
    return out;
  },
  dirty() { return !!this.draft && JSON.stringify(this.draft) !== this.saved; },
  open(r, from) {
    const go0 = () => {
      if (S.view !== 'home') go('home');
      this.from = from || '';
      this.rows = this.listRows(r && r.rows ? r.rows.order : null);
      this.draft = this.clean(r || this.current());
      this.saved = from ? '' : JSON.stringify(this.draft);
      this.dev = this.dev || (IS_TV ? 'tv' : TOUCH_UI && Math.min(innerWidth, innerHeight) <= 760 ? 'phone' : 'computer');
      const el = X8.layer(this.ID, { label: 'Layout Studio', full: true }); el.classList.add('ls-layer');
      X8.backHook[this.ID] = () => this.leave();
      this.render(); X8.open(this.ID); requestAnimationFrame(() => this.size());
      // Home may still be drawing its rows (the studio was opened from another page): list them once they are there
      if (!this.rows.length) setTimeout(() => { if (this.draft && !$(`#${this.ID}`).hidden) { this.rows = this.listRows(this.draft.rows.order); this.refresh(); } }, 1500);
      if (IS_TV) setTimeout(() => { const f = $(`#${this.ID} .ls-ctl [data-nav]`); if (f) Nav.focus(f, true); }, 80);
    };
    if (typeof Seats !== 'undefined' && Seats.kids()) Seats.guard(go0); else go0();
  },
  /* Back or the close button: unsaved changes are never lost without asking */
  leave() {
    if (!this.dirty() || this.from) { X8.close(this.ID); return true; }
    Gate.ask({ icon: 'palette', eyebrow: 'Layout Studio', title: 'Save this layout?', yes: 'Save', no: 'Don’t save', html: 'You changed your layout. Save it, or leave Home as it was.' }).then((v) => {
      if (v === true) this.save(); else if (v === false) { this.saved = JSON.stringify(this.draft); X8.close(this.ID); }
    });
    return true;
  },
  save() {
    const prev = this.apply(this.draft);
    const shared = !!this.from; this.saved = JSON.stringify(this.draft); this.from = '';
    X8.close(this.ID);
    this.undoBar(prev, shared ? 'This layout is on now' : 'Layout saved');
  },
  /* a quiet bar on Home with Undo, so trying a layout is never a risk */
  undoBar(prev, msg) {
    let bar = $('#lsUndo'); if (bar) bar.remove();
    bar = document.createElement('div'); bar.id = 'lsUndo'; bar.className = 'ls-undo glass-solid'; bar.setAttribute('role', 'status');
    bar.innerHTML = `<i data-lucide="check"></i><span>${esc(msg)}</span><button class="btn btn-ghost btn-sm" type="button" data-nav data-lsu="undo"><i data-lucide="undo-2"></i>Undo</button><button class="btn btn-prime btn-sm" type="button" data-nav data-lsu="keep">Keep</button>`;
    document.body.appendChild(bar); icons();
    const done = () => { clearTimeout(bar._t); bar.classList.add('out'); setTimeout(() => bar.remove(), 260); if (IS_TV) Nav.settle(); };
    $('[data-lsu="keep"]', bar).onclick = done;
    $('[data-lsu="undo"]', bar).onclick = () => { this.apply(this.clean(prev)); done(); toast('Your layout is back', 'ok'); };
    bar._t = setTimeout(done, 20000);
    if (IS_TV) setTimeout(() => { const k = $('[data-lsu="keep"]', bar); if (k && k.isConnected) Nav.focus(k, true); }, 120);
  },
  /* ---- the studio ---- */
  chips(key, list, cur, extra = '') {
    return `<div class="ls-chips"${extra}>${list.map(([v, l]) => `<button class="chip${cur === v ? ' on' : ''}" type="button" data-nav data-lsk="${key}:${esc(v)}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
  },
  render() {
    const b = X8.body(this.ID); if (!b) return;
    const d = this.draft, link = this.from === 'link';
    const looks = Object.keys(LOOKS).filter((k) => k !== 'anime' && k !== 'atelier').map((k) => `<button class="chip ls-look${d.look === k ? ' on' : ''}" type="button" data-nav data-lsk="look:${k}" aria-pressed="${d.look === k}"><i class="ls-sw" style="--a:${LOOKS[k].l0};--b:${LOOKS[k].la}"></i>${esc(LOOKS[k].label)}</button>`).join('');
    const presets = Object.keys(this.PRESETS).map((k) => `<button class="chip" type="button" data-nav data-lsk="preset:${k}">${esc(this.PRESETS[k].n)}</button>`).join('');
    // on a TV Save and Share sit at the top, so pressing Down through the choices never jumps past the rows
    // a TV gets layouts (its remote is slow to type with); phones and computers send them
    const acts = `${IS_TV ? '<button class="btn btn-ghost" type="button" data-nav data-lsk="recv:1"><i data-lucide="download"></i>Get from phone or computer</button>' : '<button class="btn btn-ghost" type="button" data-nav data-lsk="send:1" aria-label="Send layout to TV"><i data-lucide="tv"></i><span class="ls-bl">Send layout to TV</span></button>'}
        ${link ? '<button class="btn btn-ghost" type="button" data-nav data-lsk="close:1">Not now</button>' : '<button class="btn btn-ghost" type="button" data-nav data-lsk="share:1" aria-label="Share"><i data-lucide="share-2"></i><span class="ls-bl">Share</span></button>'}
        <button class="btn btn-prime" type="button" data-nav data-lsk="save:1"><i data-lucide="check"></i>${link ? 'Use this layout' : 'Save layout'}</button>`;
    b.innerHTML = `<div class="ls-wrap">
      <header class="ls-head"><div><span class="eyebrow"><i data-lucide="palette"></i>Layout Studio</span><h2 class="x8-h ls-h">${link ? 'A layout was shared with you' : 'Make Home yours'}</h2></div>
        <div class="ls-hacts">${IS_TV ? acts : ''}<button class="ibtn" type="button" data-nav data-lsk="close:1" aria-label="Close"><i data-lucide="x"></i></button></div></header>
      ${link ? '<p class="ls-from">This is the shared layout on your own Home. Nothing changes until you press Use this layout, and Undo brings yours back.</p>' : ''}
      <div class="ls-main">
        <section class="ls-stage" aria-label="Preview">
          <div class="ls-devs">${this.DEVS.map(([k, l, ic]) => `<button class="chip${this.dev === k ? ' on' : ''}" type="button" data-nav data-lsk="dev:${k}" aria-pressed="${this.dev === k}"><i data-lucide="${ic}"></i>${esc(l)}</button>`).join('')}</div>
          <div class="ls-frame" id="lsFrame">${this.preview()}</div>
        </section>
        <section class="ls-ctl">
          <div class="ls-grp"><h3>Start from</h3><div class="ls-chips">${presets}</div></div>
          <div class="ls-grp"><h3>Look</h3><div class="ls-chips">${looks}</div></div>
          <div class="ls-grp"><h3>Card size</h3>${this.chips('cards', this.CARDS, d.cards)}</div>
          <div class="ls-grp"><h3>Banner</h3>${this.chips('banner', this.BANNERS, d.banner)}</div>
          <div class="ls-grp"><h3>Movies or series</h3>${this.chips('focus', this.FOCUS, d.focus)}</div>
          <div class="ls-grp"><h3>Rows</h3>${this.rowsHtml()}
            <button class="btn btn-ghost btn-sm" type="button" data-nav data-lsk="arrange:1"><i data-lucide="pencil"></i>Rename rows or make folders</button></div>
        </section>
      </div>
      ${IS_TV ? '' : `<footer class="ls-foot">${acts}</footer>`}</div>`;
    icons(); this.size();
    b.onclick = (e) => { const t = e.target.closest('[data-lsk]'); if (t && !t.disabled) this.act(t.dataset.lsk); };
  },
  rowsHtml() {
    const d = this.draft;
    if (!this.rows.length) return '<p class="ls-note">Home has no rows yet. Install an addon with catalogs, then come back.</p>';
    return `<ol class="ls-rows">${this.rows.map((x, i) => {
      const off = d.rows.hide.includes(x.k), name = d.rows.names[x.k] || x.t;
      return `<li class="ls-row${off ? ' off' : ''}"><b translate="no">${esc(name)}</b>
        <button class="ibtn" type="button" data-nav data-lsk="up:${i}" aria-label="Move up" title="Move up"${i ? '' : ' disabled'}><i data-lucide="chevron-up"></i></button>
        <button class="ibtn" type="button" data-nav data-lsk="down:${i}" aria-label="Move down" title="Move down"${i < this.rows.length - 1 ? '' : ' disabled'}><i data-lucide="chevron-down"></i></button>
        <button class="ibtn" type="button" data-nav data-lsk="hide:${i}" aria-label="${off ? 'Show' : 'Hide'}" title="${off ? 'Show' : 'Hide'}" aria-pressed="${off}"><i data-lucide="${off ? 'eye-off' : 'eye'}"></i></button></li>`;
    }).join('')}</ol>`;
  },
  act(lsk) {
    const i = lsk.indexOf(':'), k = lsk.slice(0, i), v = lsk.slice(i + 1), d = this.draft;
    if (k === 'close') { this.leave(); return; }
    if (k === 'save') { this.save(); return; }
    if (k === 'share') { this.share(); return; }
    if (k === 'send') { this.sendTo(); return; }
    if (k === 'recv') { this.receive(); return; }
    if (k === 'arrange') { if (this.dirty()) this.apply(this.draft); this.saved = JSON.stringify(this.draft); X8.close(this.ID); setTimeout(() => Arrange.open(), 260); return; }
    if (k === 'dev') this.dev = v;
    else if (k === 'preset') { const p = this.PRESETS[v]; if (p) Object.assign(d, { look: p.look, cards: p.cards, banner: p.banner, focus: p.focus, menu: { ...p.menu } }); }
    else if (k === 'look') d.look = v;
    else if (k === 'mtv') d.menu.tv = v;
    else if (k === 'mot') d.menu.other = v;
    else if (k === 'cards') d.cards = v;
    else if (k === 'banner') d.banner = v;
    else if (k === 'focus') d.focus = v;
    else if (k === 'up' || k === 'down') {
      const a = +v, z = k === 'up' ? a - 1 : a + 1; if (z < 0 || z >= this.rows.length) return;
      [this.rows[a], this.rows[z]] = [this.rows[z], this.rows[a]];
      d.rows.order = this.rows.map((x) => x.k);
      this.refresh(`${k}:${z}`); return;
    } else if (k === 'hide') {
      const key = this.rows[+v] && this.rows[+v].k; if (!key) return;
      d.rows.hide = d.rows.hide.includes(key) ? d.rows.hide.filter((x) => x !== key) : [...d.rows.hide, key];
    }
    this.refresh(lsk);
  },
  /* draw again and put the focus back on the same control, so a TV remote never loses its place */
  refresh(focusKey) {
    const b = X8.body(this.ID), sc = b && $('.ls-ctl', b), top = sc ? sc.scrollTop : 0, wrapTop = b && $('.ls-main', b) ? $('.ls-main', b).scrollTop : 0;
    this.render();
    const nb = X8.body(this.ID); const sc2 = $('.ls-ctl', nb); if (sc2) sc2.scrollTop = top; const m2 = $('.ls-main', nb); if (m2) m2.scrollTop = wrapTop;
    let f = focusKey && $(`[data-lsk="${CSS.escape(focusKey)}"]`, nb);
    if (f && f.disabled) f = f.parentElement && $('[data-lsk]:not([disabled])', f.parentElement);
    if (f) { if (IS_TV) Nav.focus(f, true); else f.focus({ preventScroll: true }); }
  },
  /* ---- the preview: a small drawing of Home, built from the rows and posters already on this device ---- */
  posters(k) {
    const sec = $$('#homeRows section.row').find((s) => s.dataset.arrK === k);
    if (!sec) return { wide: false, src: [] };
    const cards = $$('.rail>.card', sec).slice(0, 12);
    return { wide: !!(cards[0] && cards[0].classList.contains('wide')), src: cards.map((c) => { const im = $('img', c); return im ? (im.currentSrc || im.getAttribute('src') || '') : ''; }) };
  },
  preview() {
    const d = this.draft, dev = this.dev, L = LOOKS[d.look] || LOOKS.noir;
    const side = false;   // 2.81: one menu everywhere
    const hero = S.hero && S.hero[S.heroIdx || 0], bg = hero ? metaBg(hero) : '';
    const rows = this.rows.filter((x) => !d.rows.hide.includes(x.k)).slice(0, dev === 'phone' ? 6 : 5);
    const menu = dev === 'phone'
      ? (side ? '<div class="lsp-bar"><i class="lsp-burger"></i><b class="lsp-logo"></b></div>' : '<div class="lsp-bar ezb-pvb"><b class="lsp-logo"></b><span class="ezb-pvr"><em></em><em></em><em class="s"></em></span></div><div class="ezb-pvph"><span class="ezb-pvp"><i class="on"></i><i></i><i></i><i></i><i></i></span></div>')
      : (side ? '<div class="lsp-rail"><b class="lsp-logo"></b><i></i><i></i><i></i><i></i><i></i><i></i></div>' : ('<div class="lsp-top ezb-pvt"><b class="lsp-logo"></b><span class="ezb-pvp"><i class="on"></i><i></i><i></i><i></i><i></i><i></i><u></u><em></em><em></em></span><i class="lsp-dot"></i></div>'));
    const banner = d.banner === 'off' ? '' : `<div class="lsp-hero">${bg ? `<img src="${esc(bg)}" alt="" loading="lazy" decoding="async">` : ''}<div class="lsp-ht"><b translate="no">${esc(hero ? hero.name : '')}</b>${d.banner === 'full' ? '<s></s><s class="sh"></s>' : ''}<span><i class="pr"></i><i></i></span></div></div>`;
    const rowsHtml = rows.map((x) => {
      const p = this.posters(x.k), n = p.src.length || 8;
      // rows without posters (networks, channels) are drawn as quiet wide tiles
      return `<div class="lsp-row${p.wide ? ' w' : ''}${p.src.some(Boolean) ? '' : ' t'}"><p translate="no">${esc(d.rows.names[x.k] || x.t)}</p><div class="lsp-cards">${Array.from({ length: Math.max(n, 8) }, (_, j) => { const s = p.src[j % n]; return `<i>${s ? `<img src="${esc(s)}" alt="" decoding="async">` : ''}</i>`; }).join('')}</div></div>`;
    }).join('') || '<div class="lsp-row"><p></p><div class="lsp-cards"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>';
    return `<div class="lsp lsp-${dev}${side ? ' side' : ''} c-${d.cards} b-${d.banner}${L.light ? ' light' : ''}" style="--p0:${L.l0};--p1:${L.lb};--pi:${L.li};--pa:${L.la}" aria-hidden="true">
      <div class="lsp-screen">${menu}<div class="lsp-page">${banner}${rowsHtml}</div></div></div>`;
  },
  /* the drawing scales with its frame: one unit is 1% of the screen's width */
  size() {
    const f = $('#lsFrame'), p = f && $('.lsp-screen', f); if (!p) return;
    const w = p.getBoundingClientRect().width; if (w) p.style.setProperty('--u', `${(w / 100).toFixed(2)}px`);
  },
  /* ---- share: a link and a QR code; the layout travels inside the link, nothing is stored anywhere ---- */
  pack(r) {
    const o = { v: 1, look: r.look, cards: r.cards, banner: r.banner, focus: r.focus, menu: r.menu };
    if (r.rows.order.length || r.rows.hide.length || Object.keys(r.rows.names).length) o.rows = r.rows;
    return o;
  },
  link(r) { return `${PUBLIC_ORIGIN}/#layout=${X8.b64e(this.pack(r))}`; },
  share() {
    const url = this.link(this.draft);
    const el = X8.layer('lsShare', { label: 'Share layout', icon: 'share-2', eyebrow: 'Share layout' });
    let qr = ''; try { qr = QR.svg(url, { margin: 2 }); } catch (e) { qr = ''; }
    X8.body('lsShare').innerHTML = `<h2 class="x8-h">Share this layout</h2>
      <p class="sc-p">Anyone who opens the link sees your layout on their own Home first, with their own films. Your addons, keys and library are never in it.</p>
      ${qr ? `<div class="ls-qr">${qr}</div>` : '<p class="sc-p">This layout has too many rows for a QR code. Copy the link instead.</p>'}
      <div class="inrow"><button class="btn btn-prime" type="button" data-nav data-lss="copy"><i data-lucide="copy"></i>Copy link</button>${navigator.share && !IS_TV ? '<button class="btn btn-ghost" type="button" data-nav data-lss="send"><i data-lucide="share-2"></i>Send</button>' : ''}</div>`;
    icons();
    $('[data-lss="copy"]', el).onclick = () => copyText(url, 'Layout link copied');
    const s = $('[data-lss="send"]', el); if (s) s.onclick = () => navigator.share({ title: 'My MKCinema layout', url }).catch(() => {});
    X8.open('lsShare');
    if (IS_TV) setTimeout(() => Nav.focus($('[data-lss="copy"]', el), true), 60);
  },
  /* ---- Send layout to TV: the TV shows a 6-character code, the phone or computer types it and sends the layout over the
     same realtime channel the phone remote and TV sign-in use. Nothing is stored; the TV still asks Use this layout
     or Not now, so a wrong code can never change anyone's Home. ---- */
  CODE: /^[A-HJ-NP-Z2-9]{6}$/,
  receive() {
    const el = X8.layer('lsRecv', { label: 'Get a layout', icon: 'download', eyebrow: 'Get a layout' });
    X8.onClose.lsRecv = () => { if (this.rx) { this.rx.close(); this.rx = null; } clearTimeout(this.rxT); };
    const code = roomCode(), b = X8.body('lsRecv');
    const paint = (state) => {
      const url = appLink(`lssend=${code}`);
      let qr = ''; if (url) try { qr = QR.svg(url, { margin: 2 }); } catch (e) { qr = ''; }
      b.innerHTML = `<h2 class="x8-h">Send a layout to this screen</h2>
        <p class="sc-p">On your phone or computer, open Layout Studio in MKCinema (or mkcinema.app/layouts), press <b>Send layout to TV</b> and type this code. Or scan the QR code with your phone.</p>
        <div class="ls-code mono" translate="no">${state === 'offline' ? '······' : esc(code.split('').join(' '))}</div>
        ${qr && state !== 'offline' ? `<div class="ls-qr">${qr}</div>` : ''}
        <p class="sc-p ls-rxs" aria-live="polite">${state === 'offline' ? 'This screen can’t reach the internet right now. Check the connection and try again.' : state === 'expired' ? 'The code ran out. Open this again for a new one.' : state === 'connecting' ? 'Getting a code…' : 'Waiting for a layout… The code works for 10 minutes.'}</p>
        <div class="inrow"><button class="btn btn-ghost" type="button" data-nav data-x8close>Close</button></div>`;
      icons();
      if (IS_TV) setTimeout(() => { const f = $('[data-x8close]', b); if (f && f.isConnected) Nav.focus(f, true); }, 60);
    };
    if (this.rx) this.rx.close();
    paint('connecting'); X8.open('lsRecv');
    if (typeof Remote !== 'undefined' && Remote.hintEl && Remote.unhint) Remote.unhint();   // the phone-remote card would cover the code
    const bus = this.rx = new Bus(`layout-${code}`, (m) => {
      if (m.t === 'hello') { bus.send({ t: 'here' }); return; }
      if (m.t !== 'layout' || !m.r || typeof m.r !== 'object' || m.r.v !== 1) return;
      bus.send({ t: 'got' }); if (bus.used) return; bus.used = true;
      setTimeout(() => { X8.close('lsRecv'); X8.close(this.ID); setTimeout(() => this.open(m.r, 'link'), 300); }, 200);
    });
    bus.connect().then((ok) => { if (this.rx !== bus) return; paint(ok ? 'waiting' : 'offline'); });
    clearTimeout(this.rxT); this.rxT = setTimeout(() => { if (this.rx === bus) { bus.close(); this.rx = null; paint('expired'); } }, 10 * 60000);
  },
  sendTo(pre) {
    const el = X8.layer('lsSend', { label: 'Send layout to TV', icon: 'tv', eyebrow: 'Send layout to TV' }), b = X8.body('lsSend');
    b.innerHTML = `<h2 class="x8-h">Send this layout to a TV</h2>
      <p class="sc-p">On the TV, open Settings › Home › Layout Studio and press <b>Get from phone or computer</b>. Type the code it shows.</p>
      <form class="ls-sendf"><input class="inp mono" id="lsCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-label="Code on the TV" value="${esc(pre || '')}">
      <button class="btn btn-prime" type="submit" data-nav><i data-lucide="send"></i>Send</button></form>
      <p class="sc-p ls-txs" aria-live="polite"></p>`;
    icons(); X8.open('lsSend');
    const inp = $('#lsCode'), msg = $('.ls-txs', b), form = $('form', b);
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = inp.value.trim().toUpperCase(), btn = $('button', form);
      if (!this.CODE.test(code)) { msg.textContent = 'Type the 6 letters and numbers shown on the TV.'; inp.focus(); return; }
      btn.disabled = true; msg.textContent = 'Sending…';
      let got = null; const answer = new Promise((res) => { got = res; setTimeout(() => res(false), 12000); });
      const bus = new Bus(`layout-${code}`, (m) => { if (m.t === 'got') got(true); else if (m.t === 'here') bus.send({ t: 'layout', r: this.pack(this.draft) }); });
      const ok = await bus.connect();
      if (!ok) { bus.close(); btn.disabled = false; msg.textContent = 'Couldn’t connect. Check the internet connection and try again.'; return; }
      bus.send({ t: 'hello' }); bus.send({ t: 'layout', r: this.pack(this.draft) });
      const done = await answer; bus.close(); btn.disabled = false;
      if (done) { X8.close('lsSend'); toast('Sent. The TV shows the layout now, with Use this layout or Not now.', 'ok', 6000); }
      else msg.textContent = 'No screen with that code answered. Check the code, and keep the code screen open on the TV.';
    });
    if (IS_TV) Nav.focus(inp, true); else setTimeout(() => inp.focus(), 60);
  },
  /* a #layout= link: wait until the welcome tour and any open panel are gone, then show it on this Home */
  sendLink(code) {
    code = String(code || '').toUpperCase(); if (!this.CODE.test(code)) { toast('That code isn’t complete', 'err'); return; }
    const tryOpen = (n) => {
      const busy = (window.MKCalm ? MKCalm.busy() : document.body.classList.contains('intro-on')) || document.body.classList.contains('layer-open') || !S.booted;
      if (busy && n < 90) { setTimeout(() => tryOpen(n + 1), 1000); return; }
      this.open(); setTimeout(() => this.sendTo(code), 400);
    };
    tryOpen(0);
  },
  fromLink(code) {
    let r = null; if (code) { try { r = X8.b64d(code); } catch (e) { r = null; } }
    if (code && (!r || typeof r !== 'object' || r.v !== 1)) { toast('That layout link isn’t complete', 'err'); return; }
    const tryOpen = (n) => {
      const busy = (window.MKCalm ? MKCalm.busy() : document.body.classList.contains('intro-on')) || document.body.classList.contains('layer-open') || !S.booted;
      if (busy && n < 90) { setTimeout(() => tryOpen(n + 1), 1000); return; }
      if (r) this.open(r, 'link'); else this.open();
    };
    tryOpen(0);
  },
  init() {
    COMMANDS.push({ label: 'Layout Studio (look, cards, banner, rows)', icon: 'palette', run: () => this.open() }, { label: 'Get a layout from my phone or computer', icon: 'download', run: () => this.receive() });
    let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => this.size(), 150); }, { passive: true });
    this.menuSync();
  },
};
LayStudio.init();
