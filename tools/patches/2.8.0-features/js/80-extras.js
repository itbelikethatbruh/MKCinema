/* ---------------- Addon directory ----------------
   Browse the community index at stremio-addons.net (about 750 addons, an open JSON list) from inside the addon manager:
   search, filter by what an addon provides, install in one press, or open its own setup page when it needs one. Adult
   addons stay hidden unless the viewer confirms they are 18 or older. MKCinema recommends none of them. */
const AddonDir = {
  URL: 'https://stremio-addons.net/api/addon_catalog/all/stremio-addons.net.json',
  list: null, q: '', type: '', n: 40, adult: false,
  async load() {
    if (this.list) return this.list;
    let txt = null; try { txt = sessionStorage.getItem('mkc:addonDir'); } catch (e) { /* private */ }
    if (!txt) { const r = await fetch(this.URL); if (!r.ok) throw new Error(`HTTP ${r.status}`); txt = await r.text(); try { sessionStorage.setItem('mkc:addonDir', txt); } catch (e) { /* too big */ } }
    const j = JSON.parse(txt);
    this.list = (j.addons || []).filter((a) => a && a.manifest && a.transportUrl && /^https:/i.test(a.transportUrl)).map((a) => {
      const m = a.manifest, res = (m.resources || []).map((r) => (typeof r === 'string' ? r : r && r.name)).filter(Boolean);
      return { url: a.transportUrl, m, res, types: m.types || [], adult: !!(m.behaviorHints && m.behaviorHints.adult), cfg: !!(m.behaviorHints && (m.behaviorHints.configurable || m.behaviorHints.configurationRequired)), need: !!(m.behaviorHints && m.behaviorHints.configurationRequired) };
    });
    return this.list;
  },
  async open() {
    X8.layer('addonDir', { label: 'Addon directory', icon: 'compass', eyebrow: 'Addon directory', wide: true });
    X8.body('addonDir').innerHTML = '<div class="status-line" style="padding:24px"><span class="spin"></span>Loading the community directory…</div>';
    X8.open('addonDir');
    try { await this.load(); this.paint(); } catch (e) { X8.body('addonDir').innerHTML = `<div class="empty-state"><i data-lucide="cloud-off"></i><h3>The directory did not answer</h3><p>${esc(e.message)}. Paste an addon link in the addon manager instead.</p></div>`; icons(); }
  },
  paint(keepFocus) {
    const b = X8.body('addonDir'), have = new Set(engine.addons.map((a) => a.baseUrl)), base = (u) => u.replace(/\/manifest\.json(\?.*)?$/, '');
    const q = normTitle(this.q);
    const hits = this.list.filter((a) => (this.adult || !a.adult) && (!this.type || (this.type === 'subtitles' ? a.res.includes('subtitles') : this.type === 'catalog' ? a.res.includes('catalog') : a.types.includes(this.type))) && (!q || normTitle(`${a.m.name} ${a.m.description || ''}`).includes(q)));
    const shown = hits.slice(0, this.n);
    const types = [['', 'All'], ['movie', 'Movies'], ['series', 'Series'], ['anime', 'Anime'], ['tv', 'TV'], ['catalog', 'Catalogs'], ['subtitles', 'Subtitles']];
    b.innerHTML = `<h3 class="x8-h">Community addons</h3><p class="sub">From the open directory at stremio-addons.net. Addons are made by their own authors; MKCinema checks none of them, so install only what you trust.</p>
      <div class="ch-bar"><div class="ch-search"><i data-lucide="search"></i><input class="inp" id="adQ" type="search" placeholder="Search ${this.list.length} addons" value="${esc(this.q)}" autocomplete="off"></div></div>
      <div class="chips" style="margin:10px 0 4px">${types.map(([v, l]) => `<button class="chip ${this.type === v ? 'on' : ''}" type="button" data-nav data-adt="${v}">${l}</button>`).join('')}<button class="chip ${this.adult ? 'on' : ''}" type="button" data-nav id="adAdult">18+</button></div>
      <div class="ad-list">${shown.map((a, i) => { const inst = have.has(base(a.url)); return `<div class="ad-item">${a.m.logo ? `<img class="ad-logo" src="${esc(a.m.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ad-logo ad-mono',textContent:'${esc((a.m.name || '?').slice(0, 2).toUpperCase().replace(/'/g, ''))}'}))">` : `<span class="ad-logo ad-mono">${esc((a.m.name || '?').slice(0, 2).toUpperCase())}</span>`}
          <div class="ad-t"><b>${esc(a.m.name)}</b> <span class="tag-s">v${esc(a.m.version || '?')}</span>${a.adult ? ' <span class="tag-s">18+</span>' : ''}<p>${esc(String(a.m.description || '').slice(0, 180))}</p><div class="tele">${[...new Set([...a.res, ...a.types])].slice(0, 6).map((r) => `<span class="tag-s">${esc(r)}</span>`).join('')}</div></div>
          <div class="ad-act">${inst ? '<span class="tag-s c">Installed</span>' : a.need ? `<a class="btn btn-ghost btn-sm" data-nav href="${esc(base(a.url))}/configure" target="_blank" rel="noopener"><i data-lucide="settings-2"></i>Set up</a>` : `<button class="btn btn-ghost btn-sm" type="button" data-nav data-adi="${i}"><i data-lucide="download-cloud"></i>Install</button>${a.cfg ? `<a class="ad-cfg" href="${esc(base(a.url))}/configure" target="_blank" rel="noopener" data-nav>Options</a>` : ''}`}</div></div>`; }).join('') || '<p class="sub">No addons match.</p>'}</div>
      ${hits.length > shown.length ? `<div class="actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-nav id="adMore">Show more · ${hits.length - shown.length} left</button></div>` : ''}
      <p class="tour-note">An addon that needs setup opens its own page. Copy the link it gives you, then paste it in the addon manager.</p>`;
    icons();
    const qi = $('#adQ'); qi.addEventListener('keydown', (e) => { if (!/^Arrow(Up|Down)$/.test(e.key)) e.stopPropagation(); });
    qi.addEventListener('input', debounce(() => { this.q = qi.value; this.n = 40; this.paint(true); }, 220));
    if (keepFocus && !TOUCH_UI) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
    $$('[data-adt]', b).forEach((x) => x.addEventListener('click', () => { this.type = x.dataset.adt; this.n = 40; this.paint(); }));
    $('#adAdult').onclick = (e) => {
      const x = e.currentTarget;
      if (!this.adult && !x.dataset.armed) { x.dataset.armed = '1'; x.textContent = 'I am 18 or older'; toast('Adult addons: press again to confirm you are 18 or older', 'info', 4000, 'adult'); setTimeout(() => { if (x.isConnected && x.dataset.armed) { delete x.dataset.armed; x.textContent = '18+'; } }, 5000); return; }
      this.adult = !this.adult; this.paint();
    };
    $$('[data-adi]', b).forEach((x) => x.addEventListener('click', async () => { x.disabled = true; const a = shown[Number(x.dataset.adi)]; const r = await installAddon(a.url); if (r) this.paint(); else x.disabled = false; }));
    const more = $('#adMore'); if (more) more.onclick = () => { this.n += 40; this.paint(); };
  },
  init() {
    const base = renderAddons;
    renderAddons = function () {
      base.apply(this, arguments);
      if (!$('#adOpen')) { $('#addonSuggest').insertAdjacentHTML('beforeend', '<button class="chip" type="button" data-nav id="adOpen"><i data-lucide="compass"></i>Browse the community directory</button>'); $('#adOpen').onclick = () => AddonDir.open(); icons(); }
    };
    COMMANDS.push({ label: 'Browse community addons', icon: 'compass', run: () => AddonDir.open() });
  },
};
AddonDir.init();

/* ---------------- Line check: how fast is this connection? ----------------
   Downloads up to 40 MB from Cloudflare's public speed endpoint in parallel pieces and reports megabits per second, with
   the highest quality that should play smoothly. One press, nothing runs in the background. */
const LineCheck = {
  last: null,
  async run(btn) {
    if (this.busy) return; this.busy = true; const lbl = btn && btn.lastChild; const t0 = lbl ? lbl.textContent : '';
    if (lbl) lbl.textContent = 'Testing…';
    try {
      const piece = 10e6, n = 4, start = performance.now(); let bytes = 0;
      await Promise.all(Array.from({ length: n }, async (_, i) => {
        const r = await fetch(`https://speed.cloudflare.com/__down?bytes=${piece}&r=${Date.now()}${i}`, { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; bytes += value.length; if (performance.now() - start > 12000) { rd.cancel(); break; } }
      }));
      const mbps = (bytes * 8) / ((performance.now() - start) / 1000) / 1e6;
      const q = mbps >= 45 ? '4k' : mbps >= 15 ? '1080' : '720';
      this.last = { mbps, q, at: Date.now() };
      toast(`Your line: ${mbps.toFixed(0)} Mbps. ${q === '4k' ? '4K should play smoothly.' : q === '1080' ? '1080p is the safe ceiling; 4K may pause.' : '720p is the safe ceiling here.'}`, 'ok', 6000, 'line');
    } catch (e) { toast(`The test did not finish (${e.message})`, 'err'); }
    if (lbl) lbl.textContent = t0; this.busy = false; if (!$('#settings').hidden) renderSettingsBody();
  },
  rows() {
    const l = this.last;
    return [{ group: 'Line check' }, { key: 'lineCheck', label: 'Test my connection', help: l ? `Last test: <b>${l.mbps.toFixed(0)} Mbps</b>, good for ${l.q === '4k' ? '4K' : `${l.q}p`}.${CFG.maxQuality !== l.q ? ` <button class="btn btn-ghost btn-sm" type="button" data-nav id="lineUse">Set max quality to ${l.q === '4k' ? '4K' : `${l.q}p`}</button>` : ''}` : 'Downloads up to 40 MB once to measure your speed, then suggests the highest quality that plays without pauses.', type: 'button', text: 'Run the test', icon: 'gauge', run: (b) => this.run(b) }];
  },
};
/* ---------------- Report a problem ----------------
   Copies a short, safe diagnostic (version, device, settings without any key, recent errors) and opens a new GitHub
   issue with it filled in. Keys, passwords, addon links and stream links are never included. */
const Report = {
  diag() {
    const c = { ...CFG }; ['customCss', 'partyName', 'extPlayers', 'atelier', 'keymap'].forEach((k) => delete c[k]);
    Object.keys(c).forEach((k) => { if (/key|token|secret|pass/i.test(k)) delete c[k]; });
    return [`MKCinema ${APP_VERSION}`, `Device: ${IS_TV ? 'TV' : TOUCH_UI ? 'touch' : 'desktop'} · ${PLATFORM} · ${screen.width}×${screen.height} @${devicePixelRatio}`, `Browser: ${navigator.userAgent}`,
      `Addons: ${engine.addons.length} (${engine.addons.filter((a) => a.error).length} failing) · Playlists: ${Channels.lists().length} · Seats: ${Seats.list().length + 1}`,
      `Settings: ${JSON.stringify(c)}`, `Recent errors:\n${X8.errors.slice(-8).join('\n') || 'none'}`].join('\n');
  },
  open() {
    const d = this.diag(); copyText(d);
    const body = `**What happened?**\n\n\n**What did you expect?**\n\n\n**Steps to see it again**\n1. \n\n<details><summary>Diagnostics (no keys or links)</summary>\n\n\`\`\`\n${d.slice(0, 5000)}\n\`\`\`\n</details>`;
    window.open(`https://github.com/itbelikethatbruh/MKCinema/issues/new?labels=bug&body=${encodeURIComponent(body)}`, '_blank', 'noopener');
  },
};
{
  const pb = secById('playback'); if (pb) { const rows = pb.rows, bind = pb.bind; pb.rows = () => [...rows(), ...LineCheck.rows()]; pb.bind = () => { if (bind) bind(); const u = $('#lineUse'); if (u) u.onclick = () => { setCfg('maxQuality', LineCheck.last.q); renderSettingsBody(); toast('Max quality saved', 'ok'); }; }; }
  const sp = secById('about') || secById('support');
  if (sp) { const rows = sp.rows; sp.rows = () => [...rows(), { group: 'Something wrong?' }, { key: 'report', label: 'Report a problem', help: 'Opens a new GitHub issue with a short diagnostic filled in (version, device, settings, recent errors). It never includes keys, passwords or links. The diagnostic is also copied, so you can paste it anywhere.', type: 'button', text: 'Report a problem', icon: 'bug', run: () => Report.open() }]; }
}
COMMANDS.push({ label: 'Report a problem', icon: 'bug', run: () => Report.open() }, { label: 'Test my connection speed', icon: 'gauge', run: () => LineCheck.run() });
