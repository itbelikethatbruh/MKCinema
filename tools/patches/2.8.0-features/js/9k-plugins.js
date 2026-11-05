/* ---------------- 2.12.0 Plugins and themes ----------------
   A theme is a stylesheet; a plugin is a script that adds a feature. Both come from a gallery that lives in
   MKCinema's own GitHub repo (plugins/registry.json): every entry there was reviewed before it was merged, each file's
   SHA-256 is checked before it runs, and nothing outside that folder is accepted from the gallery. Developers can also
   add their own from a link after a clear warning, because a plugin can read anything the app can (keys included).
   Installed items stay on this device. Add #safe to the address to start once with every plugin off. */
const Plugins = {
  REPO: 'https://raw.githubusercontent.com/itbelikethatbruh/mkcinema/main/plugins/',
  API_VERSION: 1,
  listeners: {},
  list() { return Store.raw.get('plugins', []) || []; },
  save(l) { Store.raw.set('plugins', l); },
  safe: /(^|[#&])safe(&|$)/.test(location.hash.slice(1)),
  async sha(txt) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); },
  async registry() {
    if (this._reg && Date.now() - this._regAt < 10 * 60e3) return this._reg;
    const r = await fetch(`${this.REPO}registry.json`, { cache: 'no-cache' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json(); this._reg = (j.items || []).filter((x) => x && x.id && /^[a-z0-9-]{2,40}$/.test(x.id) && (x.kind === 'plugin' || x.kind === 'theme') && /^[a-z0-9-]+\.(js|css)$/.test(x.file || '') && /^[0-9a-f]{64}$/.test(x.sha256 || ''));
    this._regAt = Date.now(); return this._reg;
  },
  async fetchItem(it) {
    const r = await fetch(`${this.REPO}${it.kind === 'theme' ? 'themes' : 'scripts'}/${it.file}`, { cache: 'no-cache' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const code = await r.text(); if ((await this.sha(code)) !== it.sha256) throw new Error('the file does not match the gallery’s checksum');
    return code;
  },
  async install(it, code) {
    const l = this.list().filter((x) => x.id !== it.id);
    l.push({ id: it.id, name: String(it.name || it.id).slice(0, 60), kind: it.kind, author: String(it.author || '').slice(0, 40), desc: String(it.description || '').slice(0, 240), ver: String(it.version || '1'), code, src: it.src || 'gallery', on: true });
    this.save(l);
  },
  /* ---- running them ---- */
  api(id) {
    const key = `plugin:${id}:`;
    return {
      version: this.API_VERSION, app: APP_VERSION, tv: IS_TV, touch: TOUCH_UI,
      toast: (m, kind) => toast(String(m).slice(0, 200), kind === 'err' ? 'err' : kind === 'ok' ? 'ok' : 'info'),
      on: (ev, fn) => { (this.listeners[ev] = this.listeners[ev] || []).push({ id, fn }); },
      get: (k, d) => Store.raw.get(key + k, d), set: (k, v) => Store.raw.set(key + k, v),
      css: (txt) => { let st = $(`#plg-css-${id}`); if (!st) { st = document.createElement('style'); st.id = `plg-css-${id}`; document.head.appendChild(st); } st.textContent = String(txt); },
    };
  },
  emit(ev, data) { (this.listeners[ev] || []).forEach((l) => { try { l.fn(data); } catch (e) { console.warn(`plugin ${l.id}`, e); } }); },
  runOne(p) {
    if (p.kind === 'theme') { let st = $(`#thm-${p.id}`); if (!st) { st = document.createElement('style'); st.id = `thm-${p.id}`; st.dataset.mkTheme = '1'; document.head.appendChild(st); } st.textContent = String(p.code || '').replace(/<\/?style[^>]*>/gi, ''); return; }
    try { new Function('MK', `"use strict";\n${p.code}\n//# sourceURL=mkcinema-plugin-${p.id}.js`)(this.api(p.id)); }
    catch (e) { console.warn(`plugin ${p.id}`, e); toast(`The plugin “${p.name}” stopped with an error and was switched off`, 'err', 4200); this.save(this.list().map((x) => (x.id === p.id ? { ...x, on: false } : x))); }
  },
  stopOne(p) { if (p.kind === 'theme') { const st = $(`#thm-${p.id}`); if (st) st.remove(); } else { Object.keys(this.listeners).forEach((k) => { this.listeners[k] = this.listeners[k].filter((l) => l.id !== p.id); }); const st = $(`#plg-css-${p.id}`); if (st) st.remove(); } },
  /* ---- Settings › Plugins & themes ---- */
  tab: 'gallery',
  section() {
    return { id: 'plugins', icon: 'blocks', label: 'Plugins & themes', intro: 'Add features and looks made by the community. Everything in the gallery was reviewed before it was listed, and checked again before it runs.', bind: () => this.bind(), rows: () => [{ html: () => this.html() }] };
  },
  html() {
    const l = this.list(), t = this.tab;
    const card = (it, inst) => `<div class="plg-card"><span class="plg-ic ${it.kind}"><i data-lucide="${it.kind === 'theme' ? 'palette' : 'puzzle'}"></i></span><div class="plg-txt"><b>${esc(it.name)}</b><small>${esc(it.kind === 'theme' ? 'Theme' : 'Plugin')}${it.author ? ` · ${esc(it.author)}` : ''}${it.src === 'link' ? ' · <span class="plg-warn">added from a link</span>' : ''}</small><p>${esc(it.desc || it.description || '')}</p></div>
      <div class="plg-act">${inst ? `<button class="switch ${it.on ? 'on' : ''}" type="button" data-nav data-plon="${esc(it.id)}" role="switch" aria-checked="${!!it.on}" aria-label="${esc(it.name)} on"></button><button class="btn btn-ghost btn-sm" type="button" data-nav data-plrm="${esc(it.id)}">Remove</button>` : l.some((x) => x.id === it.id) ? '<span class="plg-done"><i data-lucide="check"></i>Added</span>' : `<button class="btn btn-prime btn-sm" type="button" data-nav data-pladd="${esc(it.id)}"><i data-lucide="plus"></i>Add</button>`}</div></div>`;
    return `<div class="segc plg-tabs" role="tablist"><button type="button" data-nav data-pltab="gallery" class="${t === 'gallery' ? 'on' : ''}">Gallery</button><button type="button" data-nav data-pltab="mine" class="${t === 'mine' ? 'on' : ''}">Added (${l.length})</button></div>
      ${this.safe ? '<p class="tour-note">Safe start: plugins are off until the app is reopened without #safe.</p>' : ''}
      <div class="plg-list" id="plgList">${t === 'mine' ? (l.length ? l.map((p) => card(p, true)).join('') : '<p class="tour-note">Nothing added yet. Pick something from the Gallery.</p>') : '<div class="status-line"><span class="spin"></span>Loading the gallery…</div>'}</div>
      ${t === 'mine' ? `<details class="plg-dev"><summary>For developers: add from a link</summary><p class="tour-note">A plugin can read everything MKCinema can, including your debrid keys and account. Only add code from someone you trust. The gallery is safer.</p><div class="inrow"><input class="inp mono" id="plgUrl" placeholder="https://…/my-plugin.js or .css" autocomplete="off" spellcheck="false"><button class="btn btn-ghost btn-sm" type="button" data-nav id="plgUrlGo">Add</button></div></details>` : ''}`;
  },
  async paintGallery() {
    const box = $('#plgList'); if (!box || this.tab !== 'gallery') return;
    try {
      const reg = await this.registry(); if (this.tab !== 'gallery' || !$('#plgList')) return;
      const l = this.list();
      box.innerHTML = reg.length ? reg.map((it) => `<div class="plg-card"><span class="plg-ic ${it.kind}"><i data-lucide="${it.kind === 'theme' ? 'palette' : 'puzzle'}"></i></span><div class="plg-txt"><b>${esc(it.name)}</b><small>${it.kind === 'theme' ? 'Theme' : 'Plugin'}${it.author ? ` · ${esc(it.author)}` : ''}</small><p>${esc(it.description || '')}</p></div><div class="plg-act">${l.some((x) => x.id === it.id) ? '<span class="plg-done"><i data-lucide="check"></i>Added</span>' : `<button class="btn btn-prime btn-sm" type="button" data-nav data-pladd="${esc(it.id)}"><i data-lucide="plus"></i>Add</button>`}</div></div>`).join('') : '<p class="tour-note">The gallery is empty right now.</p>';
      icons(); this.bindList();
    } catch (e) { box.innerHTML = `<p class="tour-note">The gallery did not load (${esc(e.message)}). Check your connection and try again.</p>`; }
  },
  bindList() {
    $$('#plgList [data-pladd]').forEach((b) => b.addEventListener('click', async () => {
      const it = (this._reg || []).find((x) => x.id === b.dataset.pladd); if (!it) return;
      b.disabled = true; b.innerHTML = '<span class="spin"></span>Adding';
      try { const code = await this.fetchItem(it); await this.install(it, code); this.runOne(this.list().find((x) => x.id === it.id)); toast(`${it.name} added`, 'ok'); }
      catch (e) { toast(`Could not add ${it.name}: ${e.message}`, 'err', 4200); }
      this.repaint();
    }));
    $$('#plgList [data-plon]').forEach((b) => b.addEventListener('click', () => {
      const l = this.list(), p = l.find((x) => x.id === b.dataset.plon); if (!p) return;
      p.on = !p.on; this.save(l); b.classList.toggle('on', p.on); b.setAttribute('aria-checked', p.on);
      if (p.on) this.runOne(p); else this.stopOne(p);
      if (p.kind === 'plugin') toast(p.on ? `${p.name} is on` : `${p.name} is off. Reopen the app to unload it fully`, 'info', 2600);
    }));
    $$('#plgList [data-plrm]').forEach((b) => b.addEventListener('click', () => confirmTwice(b, () => {
      const p = this.list().find((x) => x.id === b.dataset.plrm); if (p) this.stopOne(p);
      this.save(this.list().filter((x) => x.id !== b.dataset.plrm)); this.repaint();
    })));
  },
  repaint() { if (!$('#settings').hidden) renderSettingsBody(); },
  bind() {
    $$('#setBody [data-pltab]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.pltab; this.repaint(); const n = $(`#setBody [data-pltab="${this.tab}"]`); if (n && IS_TV) Nav.focus(n, true); }));
    this.bindList(); if (this.tab === 'gallery') this.paintGallery();
    const u = $('#plgUrl'), go = $('#plgUrlGo');
    if (u) u.addEventListener('keydown', (e) => e.stopPropagation());
    if (go) go.onclick = () => confirmTwice(go, async () => {
      const url = u.value.trim();
      if (!/^https:\/\/[^\s]+\.(js|css)(\?[^\s]*)?$/i.test(url)) { toast('Use an https link ending in .js or .css', 'err'); return; }
      try { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); const code = await r.text(); if (code.length > 300000) throw new Error('too big');
        const kind = /\.css(\?|$)/i.test(url) ? 'theme' : 'plugin', id = `link-${(await this.sha(url)).slice(0, 10)}`, name = decodeURIComponent(url.split('/').pop().split('?')[0]).replace(/\.(js|css)$/i, '');
        await this.install({ id, name, kind, author: new URL(url).host, description: url, version: '1', src: 'link' }, code); this.runOne(this.list().find((x) => x.id === id)); toast(`${name} added`, 'ok'); this.repaint();
      } catch (e) { toast(`Could not add it: ${e.message}`, 'err', 4200); }
    });
  },
  init() {
    // events plugins can listen to: view, detail, play, close
    const g = go; go = function (view) { const r = g.apply(this, arguments); Plugins.emit('view', { view }); return r; };
    const od = openDetail; openDetail = function (seed) { const r = od.apply(this, arguments); Plugins.emit('detail', { id: seed && seed.id, type: seed && seed.type, name: seed && seed.name }); return r; };
    const ps = playStream; playStream = function (ctx) { const r = ps.apply(this, arguments); try { Plugins.emit('play', { id: ctx && ctx.meta && ctx.meta.id, type: ctx && ctx.meta && ctx.meta.type, name: ctx && ctx.meta && ctx.meta.name, season: ctx && ctx.video && ctx.video.season, episode: ctx && ctx.video && ctx.video.episode, episodeName: ctx && ctx.video && (ctx.video.name || ctx.video.title) }); } catch (e) { /* none */ } return r; };
    const cp = closePlayer; closePlayer = function () { const r = cp.apply(this, arguments); Plugins.emit('close', {}); return r; };
    video.addEventListener('pause', () => this.emit('pause', { t: video.currentTime, d: video.duration }));
    video.addEventListener('playing', () => this.emit('resume', { t: video.currentTime, d: video.duration }));
    SECTIONS.push(this.section());
    const grp = SET_GROUPS.find(([n]) => /look/i.test(n)); if (grp) grp[1].push('plugins');
    SET_BLURB.plugins = 'Community features and themes';
    if (!this.safe) this.list().filter((p) => p.on).forEach((p) => this.runOne(p));
  },
};
Plugins.init();
