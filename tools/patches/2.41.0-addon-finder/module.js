/* ---------------- 2.41.0 Addon Finder ----------------
   Search the community addon lists and install in one press. The list is a small copy that ships with the app
   (addons/directory.json, rebuilt at every release from stremio-addons.net and Stremio's own addon catalog), so it
   opens at once and works when those sites are slow or down; only without that file does the app ask them live.
   Addons that need your own settings get a short guided setup right in their row: their page opens, you copy the link
   it gives you, and one press pastes and installs it. On a TV the setup page opens on your phone from a QR code.
   Class names avoid an "ad-" prefix: ad blockers hide elements named like that, which emptied the list.
   MKCinema recommends none of these addons and checks none of them. */
const AddonDir = {
  SNAP: 'addons/directory.json',
  LIVE: ['https://stremio-addons.net/api/addon_catalog/all/stremio-addons.net.json', 'https://api.strem.io/addonscollection.json'],
  TYPES: [['', 'All'], ['stream', 'Streams'], ['catalog', 'Catalogs'], ['subtitles', 'Subtitles'], ['anime', 'Anime'], ['movie', 'Films'], ['series', 'Series'], ['tv', 'Live TV']],
  list: null, busy: null, q: '', type: '', n: 30, adult: false, setup: null, shown: [],
  key(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); },
  base(u) { return String(u || '').trim().replace(/^stremio:\/\//i, 'https://').replace(/\/manifest\.json(\?.*)?$/i, '').replace(/\/+$/, '').toLowerCase(); },
  pick(t) { const m = String(t || '').match(/(stremio|https?):\/\/[^\s"'<>]+?\/manifest\.json(\?[^\s"'<>]*)?/i); return m ? m[0] : null; },
  row(x) {
    const h = String(x.h || ''), name = String(x.n || '?'), desc = String(x.d || '');
    return { url: String(x.u || ''), id: String(x.i || ''), name, ver: String(x.v || ''), desc, logo: /^https:\/\//i.test(x.l || '') ? x.l : '', types: Array.isArray(x.t) ? x.t : [], res: Array.isArray(x.r) ? x.r : [],
      adult: h.includes('a'), cfg: h.includes('c') || h.includes('q'), need: h.includes('q'), feat: h.includes('s'), kn: this.key(name), kd: this.key(desc) };
  },
  /* without the bundled copy (a self-hosted server, an old cache): both public lists, merged the same way the build does */
  async live() {
    const got = await Promise.allSettled(this.LIVE.map((u) => fetchT(u, {}, 25000).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })));
    const [com, st] = got.map((g) => (g.status === 'fulfilled' ? (Array.isArray(g.value) ? g.value : (g.value && g.value.addons) || []) : null));
    if (!com && !st) throw new Error('offline');
    const sk = new Set((st || []).map((a) => a && this.base(a.transportUrl)));
    const seen = new Set(), out = [];
    [...(com || []), ...(st || [])].forEach((a) => {
      const m = a && a.manifest, u = String((a && a.transportUrl) || '');
      if (!m || !m.name || !/^https:\/\//i.test(u) || seen.has(this.base(u))) return;
      seen.add(this.base(u));
      const bh = m.behaviorHints || {};
      out.push({ u, i: m.id, n: m.name, v: m.version, d: String(m.description || '').slice(0, 240), l: m.logo, t: m.types || [], r: (m.resources || []).map((r) => (typeof r === 'string' ? r : r && r.name)).filter(Boolean),
        h: `${bh.adult ? 'a' : ''}${bh.configurable ? 'c' : ''}${bh.configurationRequired ? 'q' : ''}${sk.has(this.base(u)) ? 's' : ''}` });
    });
    return out;
  },
  load() {
    if (this.list) return Promise.resolve(this.list);
    if (!this.busy) {
      this.busy = (async () => {
        try { sessionStorage.removeItem('mkc:addonDir'); } catch (e) { /* the 1.3 MB copy older versions kept */ }
        let rows = null;
        try {
          const r = await fetchT(this.SNAP, {}, 10000);
          if (r.ok && /json/i.test(r.headers.get('content-type') || '')) { const j = await r.json(); if (j && Array.isArray(j.addons) && j.addons.length) rows = j.addons; }
        } catch (e) { /* not on this host */ }
        if (!rows) rows = await this.live();
        this.list = rows.map((x) => this.row(x)).filter((a) => /^https:\/\//i.test(a.url));
        return this.list;
      })();
      this.busy.then(() => { this.busy = null; }, () => { this.busy = null; });
    }
    return this.busy;
  },
  async open(o = {}) {
    this.q = o.q != null ? String(o.q) : ''; this.type = o.type != null ? o.type : ''; this.n = 30; this.setup = null;
    X8.layer('addonDir', { label: 'Find addons', icon: 'compass', eyebrow: 'Find addons', wide: true });
    const b = X8.body('addonDir');
    if (!this.list) b.innerHTML = '<div class="status-line" style="padding:24px"><span class="spin"></span>Loading addons…</div>';
    X8.open('addonDir');
    try { await this.load(); this.paint(); } catch (e) {
      b.innerHTML = '<div class="empty-state"><i data-lucide="cloud-off"></i><h3>Couldn’t load the addon list</h3><p>Check your connection and try again. You can still paste an addon link in Addons.</p><div class="actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-nav id="mkdRetry"><i data-lucide="refresh-cw"></i>Try again</button></div></div>';
      icons(); $('#mkdRetry').onclick = () => this.open(o); if (IS_TV) Nav.settle();
    }
  },
  match(a, t) {
    if (!t) return true;
    if (t === 'stream' || t === 'catalog' || t === 'subtitles') return a.res.includes(t);
    if (t === 'anime') return a.types.includes('anime') || /\b(anime|kitsu|anilist|myanimelist|crunchyroll)\b/.test(`${a.kn} ${a.kd}`);
    if (t === 'tv') return a.types.includes('tv') || a.types.includes('channel');
    return a.types.includes(t);
  },
  /* name matches first (exact, starts with, contains), then description matches; with no search, Stremio's catalog first */
  hits() {
    const words = this.key(this.q).split(' ').filter(Boolean), q = words.join(' '), out = [];
    this.list.forEach((a, i) => {
      if ((a.adult && !this.adult) || !this.match(a, this.type)) return;
      let s;
      if (words.length) {
        const all = `${a.kn} ${a.kd}`;
        if (!words.every((w) => all.includes(w))) return;
        s = a.kn === q ? 0 : a.kn.startsWith(q) ? 1 : a.kn.includes(q) ? 2 : words.every((w) => a.kn.includes(w)) ? 3 : 4;
      } else s = a.feat ? 0 : 1;
      out.push([s, i, a]);
    });
    return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((x) => x[2]);
  },
  what(a) {
    const r = [['stream', 'Streams'], ['catalog', 'Catalogs'], ['subtitles', 'Subtitles']].filter(([k]) => a.res.includes(k)).map((x) => x[1]);
    const t = [['movie', 'films'], ['series', 'series'], ['anime', 'anime'], ['tv', 'live TV'], ['channel', 'channels']].filter(([k]) => a.types.includes(k)).map((x) => x[1]);
    return [r.join(', '), t.join(', ')].filter(Boolean).join(' · ');
  },
  mono(a) { return esc((a.name.replace(/[^\p{L}\p{N}]+/gu, '') || '?').slice(0, 2).toUpperCase()); },
  /* The shell (title, search, filters) is built once; typing and filters redraw only the list, so the search box is
     never torn down under the remote. On TV the box keeps the on-screen keyboard down until OK is pressed. */
  paint() {
    const b = X8.body('addonDir');
    b.innerHTML = `<div class="mkd-head"><h3 class="x8-h">Find addons</h3><p class="sub">${this.list.length} community addons. Install adds one in a single press; Set up walks you through addons that need your own settings.</p></div>
      <div class="ch-bar"><div class="ch-search"><i data-lucide="search"></i><input class="inp" id="mkdQ" type="search" data-nav placeholder="Search by name or what it does${IS_TV ? ' · press OK to type' : ''}" value="${esc(this.q)}" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="Search addons"></div></div>
      <div class="chips mkd-chips" id="mkdChips">${this.TYPES.map(([v, l]) => `<button class="chip ${this.type === v ? 'on' : ''}" type="button" data-nav data-mkt="${v}" aria-pressed="${this.type === v}">${l}</button>`).join('')}<button class="chip ${this.adult ? 'on' : ''}" type="button" data-nav id="mkdAdult" aria-pressed="${this.adult}">18+</button></div>
      <div id="mkdBody" aria-live="polite"></div>
      <p class="tour-note mkd-note">Addons are made by their own authors. MKCinema checks none of them, so install only what you trust. The list comes from stremio-addons.net and Stremio’s addon catalog.</p>`;
    icons();
    const qi = $('#mkdQ'), body = $('#mkdBody');
    // a logo that fails to load becomes the addon's initials
    body.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.classList.contains('mkd-logo')) { const s = document.createElement('span'); s.className = 'mkd-logo mkd-mono'; s.textContent = t.dataset.mono || '?'; t.replaceWith(s); } }, true);
    // typing keys stay in the box; arrows go on to the remote navigation (it leaves the box at the text's edges)
    qi.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !IS_TV) { e.preventDefault(); this.q = qi.value; this.n = 30; this.paintList(); return; }
      if (!/^Arrow/.test(e.key) && !(IS_TV && (e.key === 'Enter' || e.keyCode === 23))) e.stopPropagation();
    });
    qi.addEventListener('input', debounce(() => { if (qi.value === this.q) return; this.q = qi.value; this.n = 30; this.setup = null; this.paintList(); }, 160));
    if (IS_TV) {
      TvType.guard(qi);
      // the remote moves in clear lanes: search, then the filter chips, then the list one row at a time
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        const a = document.activeElement, up = e.key === 'ArrowUp', chip = () => $('#mkdChips .chip.on') || $('#mkdChips .chip');
        const rows = $$('#mkdBody .mkd-row'), row = a && a.closest && a.closest('.mkd-row'), first = (r) => r && $('[data-nav]', r);
        let to = null;
        if (a === qi) { if (up) return; to = chip(); }
        else if (a && a.closest && a.closest('#mkdChips')) to = up ? qi : (first(rows[0]) || $('#mkdMore'));
        else if (row) { const i = rows.indexOf(row); to = up ? (i > 0 ? first(rows[i - 1]) : chip()) : (first(rows[i + 1]) || $('#mkdMore')); }
        else if (a && a.id === 'mkdMore') to = up ? first(rows[rows.length - 1]) : null;
        else return;
        e.preventDefault(); e.stopPropagation();
        if (to) Nav.focus(to, e.repeat);
      }, true);
    }
    $$('[data-mkt]', b).forEach((x) => x.addEventListener('click', () => {
      this.type = x.dataset.mkt; this.n = 30; this.setup = null;
      $$('[data-mkt]', b).forEach((c) => { c.classList.toggle('on', c === x); c.setAttribute('aria-pressed', String(c === x)); });
      this.paintList();
    }));
    $('#mkdAdult').onclick = (e) => {
      const x = e.currentTarget;
      if (!this.adult && !x.dataset.armed) { x.dataset.armed = '1'; x.textContent = 'I am 18 or older'; toast('Adult addons: press again to confirm you are 18 or older', 'info', 4000, 'adult'); setTimeout(() => { if (x.isConnected && x.dataset.armed) { delete x.dataset.armed; x.textContent = '18+'; } }, 5000); return; }
      delete x.dataset.armed; x.textContent = '18+';
      this.adult = !this.adult; x.classList.toggle('on', this.adult); x.setAttribute('aria-pressed', String(this.adult)); this.paintList();
    };
    this.paintList();
    if (!IS_TV && !TOUCH_UI && !this.q) setTimeout(() => { if (qi.isConnected) qi.focus({ preventScroll: true }); }, 60);
  },
  installed(a) {
    const b = this.base(a.url);
    return engine.addons.some((x) => this.base(x.baseUrl || x.url) === b || (a.cfg && a.id && x.manifest && x.manifest.id === a.id && !x.builtin));
  },
  cfgUrl(a) { return `${a.url.replace(/\/manifest\.json(\?.*)?$/i, '')}/configure`; },
  rowHtml(a, i) {
    const inst = this.installed(a), what = this.what(a), mono = this.mono(a), open = this.setup === i;
    const logo = a.logo ? `<img class="mkd-logo" src="${esc(a.logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-mono="${mono}">` : `<span class="mkd-logo mkd-mono">${mono}</span>`;
    const setupBtn = (label, cls) => `<a class="${cls}" href="${esc(this.cfgUrl(a))}" target="_blank" rel="noopener noreferrer" data-nav data-mks="${i}">${cls.includes('btn') ? '<i data-lucide="settings-2"></i>' : ''}${label}</a>`;
    const act = inst ? `<span class="mkd-done" data-nav tabindex="0"><i data-lucide="check"></i>Installed</span>${a.cfg ? setupBtn('Change settings', 'mkd-link') : ''}`
      : a.need ? setupBtn('Set up', 'btn btn-ghost btn-sm')
        : `<button class="btn btn-ghost btn-sm" type="button" data-nav data-mki="${i}"><i data-lucide="plus"></i>Install</button>${a.cfg ? setupBtn('Options', 'mkd-link') : ''}`;
    return `<div class="mkd-row${open ? ' open' : ''}" data-mkx="${i}">${logo}
      <div class="mkd-t"><div class="mkd-name"><b>${esc(a.name)}</b>${a.ver ? `<span class="mkd-ver">v${esc(a.ver)}</span>` : ''}${a.adult ? '<span class="tag-s">18+</span>' : ''}${a.need ? '<span class="mkd-pill">Needs setup</span>' : ''}</div>
        ${a.desc ? `<p>${esc(a.desc)}</p>` : ''}${what ? `<div class="mkd-what">${esc(what)}</div>` : ''}</div>
      <div class="mkd-act">${act}</div>${open ? this.setupHtml(a) : ''}</div>`;
  },
  setupHtml(a) {
    const host = (() => { try { return new URL(a.url).host; } catch (e) { return 'its page'; } })();
    if (IS_TV) {
      const ph = typeof PhoneAddons !== 'undefined' && PhoneAddons.link && PhoneAddons.link();
      return `<div class="mkd-setup mkd-setup-tv" role="group" aria-label="Set up ${esc(a.name)}"><div class="qr-wrap">${QR.svg(this.cfgUrl(a), { margin: 2 })}</div>
        <ol class="mkd-steps"><li><b>Scan with your phone</b> to open ${esc(a.name)}’s setup page and choose your settings.</li><li><b>Copy the addon link</b> it gives you at the end.</li><li><b>Paste it on your phone remote’s Add-ons page</b>${ph ? ' (the QR code on the Addons screen opens it)' : ''}. It installs on this TV.</li></ol></div>`;
    }
    return `<div class="mkd-setup" role="group" aria-label="Set up ${esc(a.name)}">
      <ol class="mkd-steps"><li><b>Choose your settings</b> on ${esc(host)}. It opened in a new tab.</li><li><b>Copy the addon link</b> it gives you at the end. If it only shows an Install button, right-click or long-press it and copy the link.</li><li><b>Come back here</b> and press Paste and install.</li></ol>
      <div class="inrow"><input class="inp mono mkd-in" data-nav placeholder="…/manifest.json" autocomplete="off" spellcheck="false" aria-label="Addon link"><button class="btn btn-prime btn-sm mkd-go" type="button" data-nav><i data-lucide="clipboard-paste"></i><span>Paste and install</span></button></div>
      <p class="mkd-msg" role="status"></p></div>`;
  },
  paintList(focusIdx) {
    const body = $('#mkdBody'); if (!body) return;
    const hits = this.hits(), shown = this.shown = hits.slice(0, this.n);
    const act = document.activeElement, hadFocus = !!(act && body.contains(act));
    body.innerHTML = `<div class="mkd-list">${shown.map((a, i) => this.rowHtml(a, i)).join('') || `<div class="mkd-none"><b>No addons match${this.q ? ` “${esc(this.q)}”` : ''}.</b><span>Try another word${this.type ? ' or the All filter' : ''}. If you have an addon’s link, paste it in Addons.</span></div>`}</div>
      ${hits.length > shown.length ? `<div class="actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-nav id="mkdMore">Show more · ${hits.length - shown.length} left</button></div>` : ''}`;
    icons();
    $$('[data-mki]', body).forEach((x) => x.addEventListener('click', async () => {
      x.disabled = true; const i = Number(x.dataset.mki);
      if (await this.put(shown[i].url, i)) return;
      x.disabled = false; if (IS_TV && x.isConnected) Nav.focus(x, true);
    }));
    $$('[data-mks]', body).forEach((x) => x.addEventListener('click', (e) => {
      const i = Number(x.dataset.mks);
      if (IS_TV) e.preventDefault(); // a TV opens the setup page on the phone, from the QR code
      else if (typeof AddonLink !== 'undefined') AddonLink.away = 0; // the row walks you through it; no extra bar on return
      this.setup = this.setup === i && IS_TV ? null : i;
      // after the link has opened its page: redrawing first would take the link away before the browser follows it
      setTimeout(() => this.paintList(i), 0);
    }));
    const more = $('#mkdMore', body); if (more) more.onclick = () => { const at = this.n; this.n += 30; this.paintList(at); };
    const box = $('.mkd-setup', body); if (box && !IS_TV) this.bindSetup(box, this.setup);
    // keep the remote where it was: the same row after an install, the first new row after Show more
    if (focusIdx != null || hadFocus) {
      const row = focusIdx != null && $(`[data-mkx="${Math.min(focusIdx, shown.length - 1)}"]`, body);
      const el = (row && (row.classList.contains('open') && !IS_TV ? $('.mkd-go', row) : $('[data-nav]', row))) || $('#mkdMore', body) || $('[data-nav]', body) || $('#mkdQ');
      if (el) { if (IS_TV) Nav.focus(el, true); else el.focus({ preventScroll: true }); }
      if (row && row.classList.contains('open')) row.scrollIntoView({ block: 'nearest' });
    }
  },
  bindSetup(box, i) {
    const inp = $('.mkd-in', box), go = $('.mkd-go', box), msg = $('.mkd-msg', box), lbl = $('span', go);
    const say = (t) => { msg.textContent = t || ''; };
    const run = async (raw) => {
      if (go.disabled) return;
      if (!this.pick(raw)) { say(raw ? 'That isn’t an addon link. It should end in manifest.json.' : 'Copy the addon link on its page first, or paste it in the box.'); inp.focus(); return; }
      go.disabled = true; say('Installing…');
      if (!(await this.put(raw, i))) { go.disabled = false; say('It didn’t install. Check the link on its page, then try again.'); }
    };
    inp.addEventListener('input', () => { lbl.textContent = inp.value.trim() ? 'Install' : 'Paste and install'; say(''); });
    inp.addEventListener('paste', () => setTimeout(() => { if (this.pick(inp.value)) run(inp.value); }, 0));
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); run(inp.value); } });
    go.onclick = async () => {
      if (inp.value.trim()) { run(inp.value); return; }
      let t = '';
      try { t = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : ''; } catch (e) { t = ''; }
      if (t) { inp.value = t; lbl.textContent = 'Install'; run(t); return; }
      say('Paste the addon link in the box (Ctrl+V, or long-press and Paste).'); inp.focus();
    };
  },
  /* install, and drop older copies of the same addon (new settings mean a new link) */
  async put(raw, i) {
    const url = this.pick(raw) || raw, r = await installAddon(url);
    if (!r) return false;
    engine.addons.filter((x) => x !== r && !x.builtin && x.manifest && r.manifest && x.manifest.id === r.manifest.id).forEach((x) => engine.remove(x.baseUrl));
    this.setup = null; this.paintList(i);
    if (!$('#addons').hidden) renderAddons();
    return true;
  },
  /* the top of the Addons screen: Find addons first, then a link box, then your addons; the proxy and local helpers
     move under Advanced */
  manager() {
    const modal = $('#addons .modal'); if (!modal) return;
    if (!$('#mkdFind')) {
      const sub = $('#addons .modal > .sub');
      if (sub) sub.textContent = 'Addons bring films, series, streams and subtitles into MKCinema. Find one and install it in one press, or paste a link from an addon’s own page.';
      $('#addonForm').insertAdjacentHTML('beforebegin', `<div class="mkd-find-wrap"><button class="mkd-find" type="button" data-nav id="mkdFind"><span class="mkd-find-ic"><i data-lucide="search"></i></span><span class="mkd-find-t"><b>Find addons</b><small id="mkdCount">Search the community list and install in one press</small></span><i data-lucide="chevron-right"></i></button>
        <div class="chips mkd-quick">${[['stream', 'Streams', 'play'], ['catalog', 'Catalogs', 'layout-grid'], ['subtitles', 'Subtitles', 'captions'], ['anime', 'Anime', 'sparkles']].map(([v, l, ic]) => `<button class="chip" type="button" data-nav data-mkq="${v}"><i data-lucide="${ic}"></i>${l}</button>`).join('')}</div></div>
        <p class="mkd-lbl">Have an addon link?</p>`);
      $('#addonUrl').placeholder = 'Paste an addon link';
      $('#addonList').insertAdjacentHTML('beforebegin', '<p class="mkd-lbl mine">Your addons</p>');
      const proxy = $('#addons .modal > .item-box');
      const adv = document.createElement('details'); adv.className = 'mkd-adv'; adv.id = 'mkdAdv';
      adv.innerHTML = '<summary data-nav>Advanced</summary><p class="sub mkd-adv-sub">Local helpers and the stream proxy, for people who run their own MKCinema server.</p><div class="chips" id="mkdAdvChips"></div>';
      if (proxy) { proxy.before(adv); adv.appendChild(proxy); proxy.style.marginTop = '14px'; } else modal.appendChild(adv);
      $('#mkdFind').onclick = () => this.open();
      $$('[data-mkq]', modal).forEach((x) => { x.onclick = () => this.open({ type: x.dataset.mkq }); });
      icons();
    }
    // suggestions: the built-in addons only when they are missing; local helpers live under Advanced
    const sug = $('#addonSuggest'), advc = $('#mkdAdvChips'); advc.innerHTML = '';
    $$('[data-url]', sug).forEach((c) => {
      const u = c.dataset.url;
      if (/^http:\/\/(127\.0\.0\.1|localhost)/i.test(u)) advc.appendChild(c);
      else if (engine.addons.some((x) => this.base(x.baseUrl || x.url) === this.base(u))) c.remove();
    });
    sug.hidden = !sug.children.length;
    // fetch the list in the background, so Find addons opens at once
    const count = () => { const c = $('#mkdCount'); if (c && this.list) c.textContent = `Search ${this.list.length} community addons. Most install in one press.`; };
    if (this.list) count(); else this.load().then(count, () => { /* the Finder says so when opened */ });
  },
  init() {
    const base = renderAddons;
    renderAddons = function () { base.apply(this, arguments); try { AddonDir.manager(); } catch (e) { MKLog.add('error', `Addons screen: ${e.message}`); } };
    // back from an addon's setup page: the Paste button is ready
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || this.setup == null || IS_TV) return;
      const go = $('#mkdBody .mkd-go'); if (!go) return;
      go.classList.remove('pulse'); void go.offsetWidth; go.classList.add('pulse'); go.focus({ preventScroll: true });
    });
    // a kids seat needs the grown-up PIN for addons, from the palette too
    COMMANDS.push({ label: 'Find addons', icon: 'compass', run: () => (typeof Seats !== 'undefined' && Seats.kids() ? Seats.guard(() => AddonDir.open()) : AddonDir.open()) });
  },
};
AddonDir.init();
