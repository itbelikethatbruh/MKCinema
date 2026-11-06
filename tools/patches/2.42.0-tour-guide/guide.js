/* ---------------- 2.42.0 Get started, rewritten ----------------
   Two tracks. New here: choose a player (the MKCinema player or any outside app this device supports, presented
   evenly), add a few popular addons in one tap plus your own sources, an optional debrid service, and an account.
   Experienced: import from Stremio, paste many addon links at once, and where the advanced settings live.
   Writes only existing settings (CFG.extPlayers[PLATFORM], CFG.tvPlayer, the addon list, the debrid vault). A TV never
   writes extPlayers.android, which the person's phone shares. Copy names no debrid service over another. */
const Guide240 = {
  // popular, well-known addons that add catalogs, details or subtitles. Sources stay the person's own choice.
  STARTERS: [
    { id: 'tmdb', name: 'The Movie Database', what: 'Popular, trending and new rows, with details in your language.', url: 'https://94c8cb9f702d-tmdb-addon.baby-beamup.club/manifest.json' },
    { id: 'sc', name: 'Streaming Catalogs', what: 'Rows for what is on Netflix, Disney+, Prime Video, HBO Max and Apple TV+.', url: 'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/manifest.json' },
    { id: 'kitsu', name: 'Anime Kitsu', what: 'Anime catalogs and search, with every episode listed.', url: 'https://anime-kitsu.strem.fun/manifest.json' },
    { id: 'os', name: 'OpenSubtitles v3', what: 'Subtitles in hundreds of languages. Installed for you.', url: 'https://opensubtitles-v3.strem.io/manifest.json' },
    { id: 'subsource', name: 'SubSource', what: 'More subtitles, strong on anime and films not in English. Needs a free setup.', setup: 'https://subsource.strem.top/configure' },
  ],
  // where to get each outside player (an app store page or the maker's own site); VLC uses the store badges
  GET: {
    mx: 'https://play.google.com/store/apps/details?id=com.mxtech.videoplayer.ad',
    'mx-pro': 'https://play.google.com/store/apps/details?id=com.mxtech.videoplayer.pro',
    just: 'https://play.google.com/store/apps/details?id=com.brouken.player',
    'mpv-android': 'https://play.google.com/store/apps/details?id=is.xyz.mpv',
    infuse: 'https://firecore.com/infuse',
    iina: 'https://iina.io',
  },
  track() { return Store.get('guideTrack', 'new') === 'pro' ? 'pro' : 'new'; },
  native() { try { return typeof PlayerAsk !== 'undefined' && PlayerAsk.native(); } catch (e) { return false; } },
  base(u) { try { return StremioEngine.normalize(u); } catch (e) { return u; } },
  has(u) { const b = this.base(u); return engine.addons.some((a) => a.baseUrl === b && !a.error); },
  steps() {
    const xp = (CFG.extPlayers || {})[PLATFORM];
    return {
      player: (IS_TV && !this.native()) || !!xp || !!CFG.browserOnly || (IS_TV && !!CFG.tvPlayer) || !!Store.get('guidePlayer', false) || !!Store.get('guideVlc', false),
      addons: engine.addons.filter((a) => !a.error && (a.manifest.resources || []).some((r) => (r.name || r) === 'stream')).length > 1,
      debrid: !!Vault.service() || !!Store.get('guideNoDebrid', false),
      account: !!Account.user,
    };
  },
  cur() {
    if (this.native()) return CFG.tvPlayer === 'web' ? 'builtin' : 'native';
    return IS_TV || extPlayerId() === 'builtin' ? 'builtin' : 'ext';
  },
  appId() { const id = extPlayerId(); return id !== 'builtin' && playersHere().some((p) => p.id === id) ? id : Guide.vlcId(); },
  getHTML(id) {
    if (id === 'm3u') return `<small class="gs-note">MKCinema saves a small playlist file that opens in your default player, such as VLC or mpv.</small><div class="inrow">${vlcButtons()}</div>`;
    if (/^vlc/.test(id)) return `<div class="inrow">${vlcButtons()}</div>`;
    const u = this.GET[id], p = playersHere().find((x) => x.id === id);
    if (u) return `<div class="inrow"><a class="btn btn-ghost btn-sm" href="${esc(u)}" target="_blank" rel="noopener" data-nav><i data-lucide="download"></i>Get ${esc(playerName(p || { name: id }))}</a></div>`;
    return id === 'android' ? '' : `<small class="gs-note">Get ${esc(playerName(p || { name: id }))} from your app store if it is not installed yet.</small>`;
  },
  playerStep() {
    const cur = this.cur(), nat = this.native(), rec = (() => { try { return PlayerAsk.rec().pick; } catch (e) { return 'builtin'; } })();
    const card = (id, icon, title, pros, cons) => `<button type="button" class="g4-opt" role="radio" data-g4p="${id}" aria-checked="${cur === id}" data-nav><span class="g4-dot" aria-hidden="true"></span><span class="g4-txt"><b><i data-lucide="${icon}" aria-hidden="true"></i>${title}${rec === id ? '<em>Best for this device</em>' : ''}</b><small>${pros}</small>${cons ? `<small class="g4-con">${cons}</small>` : ''}</span></button>`;
    const opts = nat
      ? [card('native', 'tv', 'TV player', 'Your TV’s own video hardware: MKV, HEVC, HDR and Dolby Vision play smoothly. MKCinema still picks the source and sends your subtitles.', ''),
        card('builtin', 'monitor-play', 'MKCinema player', 'Subtitle styling, X-Ray, skip intro and watch party.', 'Plays fewer kinds of files than the TV player.')]
      : [card('builtin', 'monitor-play', 'MKCinema player', 'Plays right here, with watch party, skip intro, subtitle styling and X-Ray. Nothing to install.', 'Browsers cannot open some MKV and HEVC files. Smart Play moves to a source that plays.'),
        ...(IS_TV ? [] : [card('ext', 'external-link', 'A player app', 'Plays nearly every file and sound format. MKCinema still finds the source and remembers where you stopped.', 'Watch party and X-Ray stay in the MKCinema player.')])];
    const app = this.appId();
    const apps = IS_TV ? '' : `<div class="g4-apps"${cur === 'ext' ? '' : ' hidden'}><span class="g4-lab">Open streams in</span><div class="pc-chips" role="radiogroup" aria-label="Player app">${playersHere().map((p) => `<button type="button" class="pc-chip" role="radio" data-g4app="${p.id}" aria-checked="${p.id === app}" data-nav>${esc(p.id === 'android' ? 'Ask every time' : p.m3u ? 'Playlist file' : playerName(p))}</button>`).join('')}</div><div class="g4-get">${this.getHTML(app)}</div></div>`;
    return `<p>Both work with every addon. Pick what suits this ${IS_TV ? 'TV' : 'device'}; you can switch any time in Settings › Playback.</p>
      <div class="g4-opts" role="radiogroup" aria-label="Player">${opts.join('')}</div>${apps}`;
  },
  addonStep() {
    const row = (a) => {
      const on = a.url && this.has(a.url);
      const ctl = a.setup ? `<a class="btn btn-ghost btn-sm" href="${esc(a.setup)}" target="_blank" rel="noopener" data-nav><i data-lucide="external-link"></i>Set up</a>`
        : on ? '<span class="g4-ok"><i data-lucide="check"></i>Installed</span>'
        : `<button class="btn btn-ghost btn-sm" type="button" data-g4add="${a.id}" data-nav><i data-lucide="plus"></i>Install</button>`;
      return `<li class="g4-ad"><div><b>${esc(a.name)}</b><small>${esc(a.what)}</small></div>${ctl}</li>`;
    };
    return `<p>MKCinema has no films of its own. Addons bring the rows, details, subtitles and sources. These popular ones install in one tap and come out again in the addon manager.</p>
      <ul class="g4-ads">${this.STARTERS.map(row).join('')}</ul>
      <h5 class="g4-h5">Sources</h5>
      <p>Stream addons find the sources you play. Pick ones you trust: browse the community directory, or paste the link an addon’s own page gives you. Addons are made by their own authors, not by MKCinema.</p>
      <div class="inrow"><button class="btn btn-prime btn-sm" type="button" id="gsDir" data-nav><i data-lucide="compass"></i>Browse community addons</button><button class="btn btn-ghost btn-sm" type="button" id="gsAddons" data-nav><i data-lucide="puzzle"></i>Paste a link</button></div>
      <small class="gs-note">An addon that needs setup opens its own page. Finish there, copy the link it gives you and paste it in the addon manager.</small>`;
  },
  debridStep() {
    const svc = Guide.svc(), key = Vault.cfg()[svc] || '';
    return `<p>Some stream addons can use a debrid service to turn what they find into fast, direct streams. If yours do, connect any of the supported services. If not, skip this.</p>
      <ol class="gs-list">
        <li>Pick your service below.</li>
        <li>Copy your API key from <a href="https://${esc(DEBRID[svc].help.split(' ')[0])}" target="_blank" rel="noopener" id="gsKeyLink">${esc(DEBRID[svc].help)}</a>.</li>
        <li>Paste it here and press Save and test.</li>
      </ol>
      <div class="inrow"><select class="inp" id="gsSvc" aria-label="Debrid service">${['ad', 'pm', 'rd', 'tb'].map((k) => `<option value="${k}"${k === svc ? ' selected' : ''}>${esc(DEBRID[k].label)}</option>`).join('')}</select></div>
      <div class="inrow"><input class="inp mono" type="password" id="gsTb" ${SecretFill.attr(key)} placeholder="Paste your ${esc(DEBRID[svc].label)} API key" autocomplete="off" spellcheck="false" aria-label="Debrid API key"><button class="btn btn-prime btn-sm" type="button" id="gsTbGo"><i data-lucide="plug-zap"></i>Save and test</button></div>
      <small class="gs-note" id="gsTbSt">${key ? 'Key saved.' : ''} You can add more services later under Settings › Debrid. Your key ${Account.user && CFG.syncKeys !== false ? 'syncs to your account, readable only by you' : 'stays on this device'}.</small>
      ${Vault.service() ? '' : `<div class="inrow"><button class="btn btn-ghost btn-sm" type="button" id="gsNoDebrid" data-nav>${Store.get('guideNoDebrid', false) ? '<i data-lucide="check"></i>Skipped' : 'I don’t use one'}</button></div>`}`;
  },
  proHTML() {
    const go = (id, icon, t, d, btn) => `<div class="g4-pro"><span class="t4-ic"><i data-lucide="${icon}" aria-hidden="true"></i></span><div><b>${t}</b><small>${d}</small></div><button class="btn btn-ghost btn-sm" type="button" data-g4go="${id}" data-nav>${btn}</button></div>`;
    return `<div class="g4-pros">
      <div class="g4-pro"><span class="t4-ic"><i data-lucide="download" aria-hidden="true"></i></span><div><b>Bring everything from Stremio</b><small>Addons, library, Continue watching and watched episodes, in one go. Your password goes only to Stremio.</small></div><button class="btn btn-prime btn-sm" type="button" id="gsImport" data-nav>Import</button></div>
      <div class="g4-pro g4-bulk"><span class="t4-ic"><i data-lucide="clipboard-paste" aria-hidden="true"></i></span><div><b>Paste many addon links</b><small>One per line, https:// or stremio://. Configured links keep their settings.</small>
        <textarea class="inp mono" id="gsBulk" rows="3" spellcheck="false" autocomplete="off" placeholder="https://…/manifest.json" aria-label="Addon links, one per line"></textarea>
        <div class="inrow"><button class="btn btn-ghost btn-sm" type="button" id="gsBulkGo" data-nav><i data-lucide="list-plus"></i>Install all</button><span class="gs-note" id="gsBulkSt" aria-live="polite"></span></div></div></div>
      ${go('playback', 'monitor-play', 'Every player on this device', IS_TV ? 'TV player or the MKCinema player, and what happens when one cannot open a file.' : `${['MKCinema player', ...playersHere().filter((p) => !p.m3u && p.id !== 'android').map((p) => playerName(p)), ...(playersHere().some((p) => p.m3u) ? ['a playlist file for VLC, mpv or any desktop player'] : [])].filter((x, i, a) => a.indexOf(x) === i).join(', ')}.`, 'Playback')}
      ${go('rules', 'sliders-horizontal', 'Source rules', 'Preferred quality, audio language, smallest file and what Smart Play skips.', 'Rules')}
      ${go('debrid', 'zap', 'Several debrid services', 'Keys for more than one service, and whether they sync to your account.', 'Debrid')}
      ${go('servers', 'server', 'Plex, Jellyfin and Emby', 'Your own server’s films show up as sources next to your addons.', 'Servers')}
      ${go('plugins', 'blocks', 'Plugins and themes', 'Extend MKCinema with community plugins.', 'Plugins')}
      ${TOUCH_UI || IS_TV ? '' : go('keys', 'keyboard', 'Keyboard shortcuts', 'Every shortcut, in one list.', 'Shortcuts')}
    </div>`;
  },
  html() {
    const st = this.steps(), done = Object.values(st).filter(Boolean).length, pro = this.track() === 'pro';
    const step = (n, key, title, body, opt) => `<section class="gs-step${st[key] ? ' done' : ''}"><span class="gs-n">${st[key] ? '<i data-lucide="check"></i>' : n}</span><div class="gs-c"><h4>${title}${opt ? '<span class="g4-optional">Optional</span>' : ''}</h4>${body}</div></section>`;
    return `<div class="gs g4">
      <div class="g4-track" role="tablist" aria-label="Guide"><button type="button" role="tab" data-g4t="new" aria-selected="${!pro}" data-nav>New here</button><button type="button" role="tab" data-g4t="pro" aria-selected="${pro}" data-nav>Used Stremio before</button></div>
      ${pro ? this.proHTML() : `
      <div class="gs-prog" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${done}"><i style="transform:scaleX(${done / 4})"></i></div>
      <p class="gs-count">${done === 4 ? 'All set. Enjoy the show.' : `${done} of 4 done`}</p>
      ${step(1, 'player', 'Choose your player', this.playerStep())}
      ${step(2, 'addons', 'Add your addons', this.addonStep())}
      ${step(3, 'debrid', 'Connect a debrid service', this.debridStep(), true)}
      ${step(4, 'account', 'Sign in everywhere', `<p>One account carries your library, progress, addons and keys to every phone, computer and TV you sign in on.</p>
        <div class="inrow"><button class="btn btn-ghost btn-sm" type="button" id="gsAcct" data-nav><i data-lucide="circle-user-round"></i>${Account.user ? 'Signed in' : 'Sign in or create an account'}</button></div>`)}`}
    </div>`;
  },
  sync() { try { Account.schedule(); } catch (e) { /* not signed in */ } },
  keepScroll(fn) { const b = $('#setBody'), y = b ? b.scrollTop : 0; fn(); if (b) b.scrollTop = y; },
  rerender() { this.keepScroll(() => renderSettingsBody()); },
  bind() {
    const root = $('.g4'); if (!root) return;
    const on = (id, fn) => { const el = $(id, root); if (el) el.onclick = fn; };
    $$('[data-g4t]', root).forEach((b) => { b.onclick = () => { Store.set('guideTrack', b.dataset.g4t); this.rerender(); const t = $(`.g4 [data-g4t="${b.dataset.g4t}"]`); if (t && IS_TV) Nav.focus(t, true); }; });
    // player
    $$('[data-g4p]', root).forEach((b) => { b.onclick = () => {
      const id = b.dataset.g4p; Store.set('guidePlayer', true);
      if (this.native()) setCfg('tvPlayer', id === 'native' ? 'native' : 'web');
      else if (!IS_TV) { CFG.extPlayers = { ...(CFG.extPlayers || {}), [PLATFORM]: id === 'ext' ? this.appId() : 'builtin' }; saveCfg(); }
      this.sync(); this.rerender();
    }; });
    $$('[data-g4app]', root).forEach((b) => { b.onclick = () => { CFG.extPlayers = { ...(CFG.extPlayers || {}), [PLATFORM]: b.dataset.g4app }; saveCfg(); Store.set('guidePlayer', true); this.sync(); this.rerender(); }; });
    // addons
    $$('[data-g4add]', root).forEach((b) => { b.onclick = async () => {
      const a = this.STARTERS.find((x) => x.id === b.dataset.g4add); if (!a) return;
      b.disabled = true; b.innerHTML = '<i data-lucide="loader-circle" class="spin"></i>Installing'; icons();
      const ok = await installAddon(a.url); if (ok) this.rerender(); else { b.disabled = false; b.innerHTML = '<i data-lucide="plus"></i>Install'; icons(); }
    }; });
    on('#gsDir', () => { closeLayer('settings'); if (typeof AddonDir !== 'undefined') setTimeout(() => AddonDir.open(), 60); else $('#openAddons').click(); });
    on('#gsAddons', () => { closeLayer('settings'); $('#openAddons').click(); });
    on('#gsImport', () => { closeLayer('settings'); openStremioImport(); });
    on('#gsAcct', () => openSettings('account'));
    on('#gsNoDebrid', () => { Store.set('guideNoDebrid', !Store.get('guideNoDebrid', false)); this.rerender(); });
    // debrid (same behaviour as before)
    const sel = $('#gsSvc', root);
    if (sel) sel.onchange = () => {
      const k = sel.value, d = DEBRID[k], inp = $('#gsTb'), a = $('#gsKeyLink');
      Store.set('guideSvc', k); inp.value = Vault.cfg()[k] || ''; inp.placeholder = `Paste your ${d.label} API key`;
      if (a) { a.textContent = d.help; a.href = `https://${d.help.split(' ')[0]}`; }
    };
    on('#gsTbGo', async () => {
      const k = $('#gsSvc') ? $('#gsSvc').value : Guide.svc(), d = DEBRID[k], v = $('#gsTb').value.trim(), st = $('#gsTbSt');
      if (!v) { toast(`Paste your ${d.label} API key first`, 'err'); return; }
      Vault.save(k, v); st.textContent = `Checking the key with ${d.label}…`;
      try { st.textContent = `✓ ${await Vault.test(k)}`; toast(`${d.label} connected`, 'ok'); setTimeout(() => this.rerender(), 1400); }
      catch (e) { st.textContent = `✗ ${e.message}. Check that you copied the whole key.`; }
    });
    // experienced
    $$('[data-g4go]', root).forEach((b) => { b.onclick = () => openSettings(b.dataset.g4go); });
    const bulk = $('#gsBulk', root); if (bulk && IS_TV && typeof TvType !== 'undefined') try { TvType.guard(bulk); } catch (e) { /* older build */ }
    on('#gsBulkGo', async () => {
      const st = $('#gsBulkSt'), btn = $('#gsBulkGo');
      const links = [...new Set(String(bulk.value).split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^(https?|stremio):\/\//i.test(x)))];
      if (!links.length) { st.textContent = 'Paste at least one https:// or stremio:// link.'; return; }
      btn.disabled = true; let ok = 0, bad = [];
      for (const [i, u] of links.entries()) {
        st.textContent = `Installing ${i + 1} of ${links.length}…`;
        try { await engine.install(u); ok++; } catch (e) { bad.push(u); }
      }
      btn.disabled = false; bulk.value = bad.join('\n');
      st.textContent = `${ok} installed.${bad.length ? ` ${bad.length} could not be installed: the addon is offline or blocks browser requests. ${bad.length === 1 ? 'It stays' : 'They stay'} in the box.` : ''}`;
      if (ok) { toast(`${ok} addon${ok === 1 ? '' : 's'} installed`, 'ok'); try { Account.schedule(); } catch (e) { /* not signed in */ } }
    });
  },
  init() {
    Guide.steps = () => this.steps();
    Guide.html = () => this.html();
    Guide.bind = () => this.bind();
    const sec = SECTIONS.find((x) => x.id === 'start');
    if (sec) sec.intro = 'From a fresh install to pressing play in a few minutes. Already know Stremio? Switch to Used Stremio before.';
  },
};
try { Guide240.init(); } catch (e) { console.warn('Get started 2.40:', e); }
