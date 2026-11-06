/* ---------------- 2.40.0 Legal pages and the troubleshooting guide ----------------
   Legal: privacy.html and terms.html are the single source. Inside the app they open in a reader pop-up (the page's
   <main>, fetched from the same site), so TVs and the Android apps never need a browser. Offline, the page opens in a tab.
   Troubleshoot: short fixes for the problems people hit most, each with one-tap buttons into the tool or setting that
   fixes it, and the Diagnostic / Send log pair at the bottom for anything the guide doesn't solve. */
const Legal = {
  PAGES: { privacy: ['privacy.html', 'Privacy policy', 'shield-check'], terms: ['terms.html', 'Terms of use', 'scale'], copyright: ['terms.html#copyright', 'Copyright concerns', 'copyright'], disclaimer: ['terms.html#disclaimer', 'No content is hosted', 'scale'] },
  cache: {},
  async open(which) {
    const p = this.PAGES[which] || this.PAGES.terms; const [file, anchor] = p[0].split('#');
    X8.layer('legalLayer', { label: p[1], icon: 'scale', eyebrow: 'Legal', wide: true });
    const b = X8.body('legalLayer'); b.innerHTML = '<div class="lg-doc"><p class="sub">Loading…</p></div>'; X8.open('legalLayer');
    let html = this.cache[file];
    if (!html) {
      try { const r = await fetch(file, { cache: 'no-cache' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); html = await r.text(); this.cache[file] = html; } catch (e) {
        b.innerHTML = `<div class="lg-doc"><h3 class="x8-h">${esc(p[1])}</h3><p class="sub">This page needs a connection. You can read it any time at app.mkcinema.app/${esc(file)}.</p><div class="actions"><a class="btn btn-ghost" data-nav href="${esc(file)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Open in a tab</a></div></div>`;
        icons(); if (IS_TV) Nav.settle(); return;
      }
    }
    const doc = new DOMParser().parseFromString(html, 'text/html'); const main = doc.querySelector('main');
    if (!main) { window.open(p[0], '_blank', 'noopener'); X8.close('legalLayer'); return; }
    main.querySelectorAll('script,style,.brand,button,input,form').forEach((x) => x.remove());
    main.querySelectorAll('h1').forEach((h) => { h.className = 'x8-h'; });
    main.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href') || ''; const m = h.match(/^(privacy|terms)\.html(#[\w-]+)?$/);
      if (m) { a.setAttribute('href', '#'); a.dataset.legal = m[2] && this.PAGES[m[2].slice(1)] ? m[2].slice(1) : m[1]; } else { a.target = '_blank'; a.rel = 'noopener'; }
      a.setAttribute('data-nav', '');
    });
    // a TV remote moves between focusable things, so every paragraph becomes a stop and the page scrolls with it
    if (IS_TV) main.querySelectorAll('h2,p,li,.card').forEach((x) => { if (!x.querySelector('a')) { x.tabIndex = 0; x.setAttribute('data-nav', ''); } });
    b.innerHTML = `<article class="lg-doc">${main.innerHTML}</article>
      <div class="lg-foot">${['privacy', 'terms'].filter((k) => k !== (file === 'terms.html' ? 'terms' : 'privacy')).map((k) => `<button class="btn btn-ghost btn-sm" type="button" data-nav data-legal="${k}"><i data-lucide="${this.PAGES[k][2]}"></i>${esc(this.PAGES[k][1])}</button>`).join('')}<button class="btn btn-ghost btn-sm" type="button" data-nav data-legal-ab><i data-lucide="scale"></i>Licenses</button></div>`;
    icons();
    const box = b.closest('.modal') || b;
    requestAnimationFrame(() => {
      const t = anchor && b.querySelector(`#${CSS.escape(anchor)}`);
      if (t) { t.scrollIntoView({ block: 'start' }); if (IS_TV) Nav.focus(t.matches('[data-nav]') ? t : (t.nextElementSibling || t)); } else { box.scrollTop = 0; b.scrollTop = 0; if (IS_TV) Nav.settle(); }
    });
  },
  rows() {
    return [
      { group: 'Legal' },
      { key: 'privacyPage', label: 'Privacy policy', help: 'What MKCinema stores, where it is kept, and how to delete it.', type: 'button', text: 'Read', icon: 'shield-check', run: () => this.open('privacy') },
      { key: 'termsPage', label: 'Terms of use', help: 'What MKCinema is and isn’t: it hosts no films or streams, addons are run by others, and it comes with no warranty.', type: 'button', text: 'Read', icon: 'scale', run: () => this.open('terms') },
      { key: 'copyrightPage', label: 'Copyright concerns', help: 'Where to send a takedown request, and how to report something MKCinema itself publishes.', type: 'button', text: 'Read', icon: 'copyright', run: () => this.open('copyright') },
    ];
  },
};

const Troubleshoot = {
  STOP: new Set(['the', 'and', 'not', 'wont', 'won', 'doesn', 'don', 'can', 'cant', 'isn', 'why', 'how', 'what', 'when', 'with', 'for', 'any', 'all', 'keeps', 'does', 'this', 'that', 'there', 'working', 'work', 'help', 'problem', 'issue']),
  /* [id, icon, title, words people search with, steps (HTML), actions] ; an action is [label, icon, what] */
  TOPICS: [
    ['nostreams', 'search-x', 'No streams for a film or episode', 'no sources empty nothing found streams list addon missing',
      ['MKCinema hosts nothing itself, so streams only appear once you add a <b>stream addon</b>. Catalog addons (like Cinemeta) show titles but no streams.',
        'Open <b>Installed addons</b> and check a stream addon is there and switched on for films and series.',
        'If your addon needs a debrid service, check its key in <b>Settings › Debrid</b>. An expired plan gives empty lists.',
        'Filters can hide everything. <b>Only sources that play here</b> is in Settings › Playback; <b>Hide cam and screener copies</b>, <b>Smallest file</b> and <b>Blocked words</b> are in Settings › Source rules.',
        'Brand-new episodes and very old or obscure titles often have nothing yet. Try another title to see if the problem is everywhere.',
        'If it is everywhere, the addon itself may be down. The status page checks it from your connection.'],
      [['Installed addons', 'puzzle', 'addons'], ['Debrid keys', 'zap', 'set:debrid'], ['Source rules', 'filter', 'set:rules'], ['Service status', 'activity', 'status']]],
    ['wontplay', 'circle-alert', 'A stream won’t start, or shows a black screen', 'error black screen wont play fails codec hevc mkv format unsupported loading forever',
      ['Pick another source from the list. One broken link doesn’t mean the title is broken.',
        'Browsers can’t decode every file. HEVC/x265, some MKV files, and DTS or TrueHD audio often fail in a browser but play fine in a video player app.',
        'Hand the stream to an outside player in <b>Settings › Playback › Play streams in</b>. On Android that can be VLC, MX Player, Just Player or mpv; on a Mac, Infuse or IINA; on Windows, PotPlayer or any player through an .m3u file.',
        'Turn on <b>Only sources that play here</b> so the list shows files this device can play.',
        'Run the Diagnostic. It tests which video this device decodes and sets things up to match.'],
      [['Run Diagnostic', 'activity', 'diag'], ['Play streams in', 'external-link', 'row:playback:extPlayer'], ['Only sources that play here', 'filter', 'row:playback:browserOnly']]],
    ['buffering', 'loader', 'Buffering or stuttering', 'buffer buffering stutter lag slow pause loading spinner choppy 4k',
      ['Run the speed test. It tells you the highest quality your connection plays without pauses.',
        'Set <b>Highest quality for Smart Play</b> to that, or turn on <b>Slow internet mode</b>.',
        'Large 4K remuxes need 60–100 Mbps. A smaller 1080p file of the same title usually plays smoothly.',
        'With a debrid service, cached results start instantly. Uncached ones may stall until the service has the file.',
        'Video that stutters while the network is fine is the device struggling: try <b>Settings › Performance</b> at Low, or an outside player.'],
      [['Speed test', 'gauge', 'row:help:speedRun'], ['Highest quality', 'sliders-horizontal', 'row:playback:maxQuality'], ['Performance', 'gauge', 'set:performance']]],
    ['audio', 'volume-x', 'No sound, or sound out of sync', 'no sound audio silent mute sync delay dts eac3 ac3 truehd language dub',
      ['Silent video with a moving picture usually means the audio is DTS, TrueHD or E-AC3, which many browsers can’t play. Pick another source or use an outside player.',
        'Running the MKCinema server with ffmpeg converts that audio on the fly.',
        'For sound that is early or late, open the player’s <b>Audio</b> menu and move the sync slider.',
        'Wrong language? Set <b>Preferred audio language</b> once and Smart Play picks matching sources.'],
      [['Play streams in', 'external-link', 'row:playback:extPlayer'], ['Audio language', 'languages', 'row:rules:srAudio']]],
    ['subs', 'captions', 'Subtitles missing or out of sync', 'subtitles subs captions missing sync timing wrong language opensubtitles ass anime',
      ['Subtitles come from subtitle addons. Install one such as OpenSubtitles v3 from the community directory if the list is empty.',
        'Set your <b>Preferred language</b> in Settings › Subtitles so the right one is picked first.',
        'Lines early or late? Open the player’s subtitle menu and use the delay buttons, or turn on <b>Auto-sync subtitles</b>.',
        'Anime signs or karaoke look heavy on a slow device: set <b>Styled subtitles</b> to Light.'],
      [['Subtitle settings', 'captions', 'set:subtitles'], ['Community addons', 'compass', 'dir']]],
    ['addons', 'puzzle', 'An addon won’t install or load', 'addon install manifest link fails error directory community load configure',
      ['Paste the addon’s <b>manifest link</b>: the address that ends in <span class="mono">manifest.json</span>. A link to the addon’s website isn’t enough.',
        'Many addons need configuring first. Open the addon’s configure page, save, then copy the link it gives you.',
        'If an addon installs but its rows or streams never load, it may be down or slow. Raise <b>Addon timeout</b>, or remove it and install it again.',
        'The community directory lists addons other people publish. If it is slow, give it a moment the first time; after that it opens straight away.'],
      [['Installed addons', 'puzzle', 'addons'], ['Community addons', 'compass', 'dir'], ['Addon timeout', 'timer', 'row:streams:timeout']]],
    ['debrid', 'zap', 'Debrid key not accepted', 'debrid key api token invalid premium real-debrid alldebrid premiumize torbox expired',
      ['Copy the whole API key from your debrid account page, with no spaces at either end.',
        'Check the plan is still active. Most services stop giving links the day a plan ends.',
        'Some services block new devices or VPN addresses until you confirm by email. Check your inbox.',
        'Keys stay on this device unless <b>Sync keys with my account</b> is on. A new device needs the key again, or that setting.'],
      [['Debrid settings', 'zap', 'set:debrid']]],
    ['account', 'circle-user-round', 'Sign-in or sync problems', 'sign in login password account sync cloud missing watchlist progress',
      ['Check the email for typos. Passwords are case-sensitive.',
        'Use <b>Forgot password</b> on the sign-in card in a browser to set a new one.',
        'Library or progress missing on another device? Make sure both are signed in to the same account and <b>Cloud sync</b> is on. Changes upload a few seconds after they happen.',
        'Moving everything at once is quickest with the <b>Setup Cloner</b> in Settings › Data.'],
      [['Account', 'circle-user-round', 'set:account'], ['Data and Setup Cloner', 'database', 'set:data']]],
    ['tv', 'tv', 'TV remote or focus gets stuck', 'tv remote focus stuck fire stick android tv back button keyboard typing webos samsung',
      ['Press <b>Back</b> to close whatever is open. On Home, Back asks before it leaves the app.',
        'Typing on a TV is slow: pair your phone as a remote and type there. Open <b>Settings › Devices</b> on the TV and scan the code.',
        'If the TV feels slow, run the Diagnostic on it. It picks the right player and effects for that TV.'],
      [['Phone remote', 'smartphone', 'set:devices'], ['Run Diagnostic', 'activity', 'diag']]],
    ['update', 'refresh-ccw', 'It keeps asking me to update', 'update loop keeps asking new version refresh stuck old version cache apk',
      ['Press <b>Refresh</b> on the update bar and give it a few seconds. The new version downloads first, then the app reloads.',
        'Still asking? Close MKCinema fully and open it again. On a computer, a hard reload (Ctrl+Shift+R, or Cmd+Shift+R on a Mac) works too.',
        'On Android, the app update bar means a new APK: install it from mkcinema.app over the old one. Your setup stays.',
        'Last resort: clear the site data for app.mkcinema.app in your browser settings. Sign in afterwards to get your synced library back.'],
      [['Reload now', 'refresh-ccw', 'reload']]],
    ['party', 'users', 'Watch party or phone remote won’t connect', 'watch party remote phone pair connect join code voice chat',
      ['Both devices need internet. They don’t need to be on the same Wi-Fi.',
        'Check the code was typed exactly, or scan the QR code instead.',
        'Work and school networks, and some VPNs, block the direct connection. The party then falls back to a slower relay; voice chat may not work there.',
        'Everyone in a party needs a source for the title. The host can share which one.'],
      [['Watch party', 'users', 'row:devices:partyOpen'], ['Service status', 'activity', 'status']]],
    ['slow', 'gauge', 'The app feels slow', 'slow lag laggy janky battery hot performance animations scrolling',
      ['Set <b>Settings › Performance</b> to Low on older phones and TVs. It switches off the heavier effects.',
        'Turn on <b>Reduce motion</b> if animations bother you.',
        'Lots of addons with Home rows means more to load. Hide the rows you don’t use in Settings › Home.',
        'The Diagnostic measures how smooth this device is and suggests settings for it.'],
      [['Performance', 'gauge', 'set:performance'], ['Run Diagnostic', 'activity', 'diag']]],
    ['trailer', 'clapperboard', 'A trailer won’t play', 'trailer youtube unavailable blocked region',
      ['Trailers come from YouTube and Apple. Some are blocked in some countries or by the studio.',
        'Switch <b>Trailer source</b> between Apple and YouTube in Settings › Playback.',
        'Ad blockers and some privacy extensions block YouTube’s player. Allow it for app.mkcinema.app.'],
      [['Trailer source', 'clapperboard', 'row:playback:trailerSource']]],
  ],
  act(what) {
    const [kind, sec, key] = String(what || '').split(':');
    const leave = () => X8.close('tsLayer');
    if (kind === 'diag') { leave(); Diagnostic.open(); }
    else if (kind === 'log') { leave(); SendLog.open(); }
    else if (kind === 'bug') window.open(SendLog.issueUrl((SendLog.last() || {}).code), '_blank', 'noopener');
    else if (kind === 'status') window.open('status.html', '_blank', 'noopener');
    else if (kind === 'reload') { try { if (typeof Updater !== 'undefined') Updater.swFetch(4000).then(() => location.reload()); else location.reload(); } catch (e) { location.reload(); } }
    else if (kind === 'addons') { leave(); closeLayer('settings'); const b = $('#openAddons'); if (b) b.click(); }
    else if (kind === 'dir') { leave(); if (typeof AddonDir !== 'undefined') (typeof Seats !== 'undefined' && Seats.kids() ? Seats.guard(() => AddonDir.open()) : AddonDir.open()); }
    else if (kind === 'set' || kind === 'row') { leave(); this.goRow(sec, kind === 'row' ? key : ''); }
  },
  /* opens a Settings section and, when given, brings one row into view and lights it for a moment */
  goRow(sec, key) {
    if (!SECTIONS.some((x) => x.id === sec)) sec = 'help';
    openSettings(sec);
    if (!key) return;
    setTimeout(() => {
      const r = $(`#set-${key}`); if (!r) return; const row = r.closest('.set-row') || r;
      row.scrollIntoView({ block: 'center' }); row.classList.add('ts-hl'); setTimeout(() => row.classList.remove('ts-hl'), 2200);
      if (IS_TV) Nav.focus(row.querySelector('[data-nav],button,select,input') || r);
    }, 160);
  },
  item(t, open) {
    const [id, icon, title, , steps, acts] = t;
    return `<details class="ts-item" data-ts="${id}"${open ? ' open' : ''}><summary data-nav><i data-lucide="${icon}" class="ts-ic"></i><b>${esc(title)}</b><i data-lucide="chevron-down" class="lic-chev"></i></summary>
      <div class="ts-body"><ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      ${acts.length ? `<div class="ts-acts">${acts.map(([l, ic, w]) => `<button class="btn btn-ghost btn-sm" type="button" data-nav data-tsact="${esc(w)}"><i data-lucide="${ic}"></i>${esc(l)}</button>`).join('')}</div>` : ''}</div></details>`;
  },
  open(topic) {
    const el = X8.layer('tsLayer', { label: 'Troubleshooting', icon: 'life-buoy', eyebrow: 'Help', wide: true });
    const b = X8.body('tsLayer');
    if (!b.dataset.built) {
      b.dataset.built = '1';
      b.innerHTML = `<h3 class="x8-h">Troubleshooting</h3><p class="sub">Quick fixes for the problems people hit most. Each one has buttons that take you straight to the fix.</p>
        ${IS_TV ? '' : '<label class="ts-search"><i data-lucide="search"></i><input class="inp" id="tsQ" type="search" placeholder="Describe the problem, like “no sound” or “buffering”" autocomplete="off"></label>'}
        <div class="ts-list">${this.TOPICS.map((t) => this.item(t)).join('')}<p class="sub ts-none" hidden>Nothing matches. Try other words, or run the Diagnostic below.</p></div>
        <div class="ts-still"><b>Still stuck?</b><p>Run the Diagnostic first: it checks this ${IS_TV ? 'TV' : 'device'} and fixes what it can. If that doesn’t help, send a log and quote its 6-character code in your bug report. Logs never include keys or links.</p>
          <div class="ts-acts"><button class="btn btn-prime btn-sm" type="button" data-nav data-tsact="diag"><i data-lucide="activity"></i>Run Diagnostic</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-tsact="log"><i data-lucide="send"></i>Send log</button>${IS_TV ? '' : '<button class="btn btn-ghost btn-sm" type="button" data-nav data-tsact="bug"><i data-lucide="bug"></i>Report a bug</button>'}<button class="btn btn-ghost btn-sm" type="button" data-nav data-tsact="status"><i data-lucide="activity"></i>Service status</button></div></div>`;
      b.addEventListener('click', (e) => { const a = e.target.closest('[data-tsact]'); if (a) { e.preventDefault(); this.act(a.dataset.tsact); } });
      // one open at a time keeps the list short
      b.addEventListener('toggle', (e) => { const d = e.target; if (d.open && d.classList && d.classList.contains('ts-item')) $$('.ts-item[open]', b).forEach((x) => { if (x !== d) x.open = false; }); }, true);
      const q = $('#tsQ', b);
      if (q) q.addEventListener('input', () => {
        const words = q.value.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 2 && !Troubleshoot.STOP.has(w)); let n = 0;
        this.TOPICS.forEach((t) => { const hay = `${t[2]} ${t[3]}`.toLowerCase(); const hit = !words.length || words.some((w) => hay.includes(w)); const d = $(`.ts-item[data-ts="${t[0]}"]`, b); if (d) { d.hidden = !hit; if (hit) n++; } });
        $('.ts-none', b).hidden = n > 0;
      });
      icons();
    }
    $$('.ts-item', b).forEach((d) => { d.hidden = false; d.open = d.dataset.ts === topic; });
    const q = $('#tsQ', b); if (q) q.value = ''; const none = $('.ts-none', b); if (none) none.hidden = true;
    X8.open('tsLayer');
    requestAnimationFrame(() => {
      const d = topic && $(`.ts-item[data-ts="${topic}"]`, b);
      if (d) { d.scrollIntoView({ block: 'start' }); if (IS_TV) Nav.focus(d.querySelector('summary')); }
      else { const m = el.querySelector('.modal'); if (m) m.scrollTop = 0; }
    });
  },
};

(function legalHelpInit() {
  // About: a Legal group on top (replaces the older single privacy row)
  const ab = secById('about');
  if (ab) { const rows = ab.rows; ab.rows = () => [...Legal.rows(), ...rows().filter((r) => r.key !== 'privacyPage')]; }
  // Help: the guide comes first, before the tools
  const hp = secById('help');
  if (hp) {
    const rows = hp.rows;
    hp.intro = 'Start with the troubleshooting guide. If it doesn’t fix things, run the Diagnostic, then send a log.';
    hp.rows = () => [{ key: 'tsGuide', label: 'Troubleshooting guide', help: 'Quick fixes for no streams, buffering, sound, subtitles, addons, TV remotes and updates, with buttons to the right setting.', type: 'button', text: 'Open guide', icon: 'life-buoy', run: () => Troubleshoot.open() }, ...rows()];
  }
  COMMANDS.push(
    { label: 'Troubleshooting guide', icon: 'life-buoy', run: () => Troubleshoot.open() },
    { label: 'Privacy policy', icon: 'shield-check', run: () => Legal.open('privacy') },
    { label: 'Terms of use', icon: 'scale', run: () => Legal.open('terms') });
  // links anywhere in the app: data-legal="privacy|terms|copyright", data-trouble="<topic>"
  document.addEventListener('click', (e) => {
    const l = e.target.closest('[data-legal],[data-legal-ab],[data-trouble]'); if (!l) return;
    e.preventDefault();
    if (l.hasAttribute('data-trouble')) { Troubleshoot.open(l.dataset.trouble); return; }
    if (l.hasAttribute('data-legal-ab')) { X8.close('legalLayer'); openSettings('about'); return; }
    Legal.open(l.dataset.legal);
  });
  // shareable links: app.mkcinema.app/#terms, #privacy, #help
  const go = () => {
    const h = location.hash.slice(1); if (!/^(terms|privacy|copyright|help)$/.test(h)) return;
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => (h === 'help' ? Troubleshoot.open() : Legal.open(h)), 400);
  };
  addEventListener('hashchange', go); go();
})();
