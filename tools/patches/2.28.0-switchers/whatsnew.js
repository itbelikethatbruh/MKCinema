'use strict';
/* ---------------- 2.28.0 What's new ----------------
   After an update, the first time MKCinema opens on the new version it shows one calm card with what changed since the
   version this device last ran: new, improved and fixed, newest first (at most three releases, the rest are a tap away).
   It waits until the intro, the walkthrough, any open panel and the player are gone, and never shows on a first visit
   (the walkthrough covers that). Settings › More › What's new keeps the full list, with a switch to stop the card.
   Add each release at the top of RELEASES when its version goes out. */
const RELEASES = [
  { v: '2.28.0', date: '2026-11-06', items: [
    ['new', 'Arrange Home', 'Hide, move or rename any row on Home, addon catalogs included. Each seat keeps its own. Find it under the rows or in Settings › Home.'],
    ['new', 'Kids seats go by age rating', 'A kids seat now checks the title’s age rating where you live, so adult cartoons stay off it. Pick up to 6, 9 or 12 in Settings › Seats.'],
    ['new', 'Coming from Stremio?', 'Bring your addons, library and Continue watching over in one step from the welcome tour or Settings.'],
    ['new', 'What’s new', 'This card. It shows once after each update, and the full list lives in Settings › More.'],
  ] },
  { v: '2.27.2', date: '2026-11-06', items: [
    ['new', 'Samsung TVs (beta)', 'MKCinema runs on Samsung TVs from 2023 on through TizenBrew, with the remote’s Back and media keys working.'],
  ] },
  { v: '2.27.0', date: '2026-11-06', items: [
    ['new', 'Subtitles line up by themselves', 'A downloaded subtitle is matched to the film’s own timing, and Undo puts the old timing back.'],
    ['new', 'Manage add-ons from your phone', 'Scan the code on the TV’s Add-ons screen to paste links, switch add-ons on or off and reorder them.'],
    ['new', 'Pick a font', 'Nine reading fonts and nine bold heading fonts in Settings › Appearance.'],
    ['better', 'Glass side menu', 'A faint smoked-glass menu and a new logo on computers.'],
    ['fixed', 'Continue watching', 'Tapping a film in progress no longer plays its trailer when no source could start. It opens the film’s sources instead.'],
  ] },
  { v: '2.26.0', date: '2026-11-06', items: [
    ['new', 'Pick your player first', 'The welcome tour asks whether to play in MKCinema or in an app like VLC, and explains Browser only mode.'],
  ] },
  { v: '2.25.1', date: '2026-11-06', items: [
    ['fixed', 'Audio menu', 'Night Mode presets are gone because they could freeze the player, and the Audio language list shows straight away.'],
  ] },
  { v: '2.25.0', date: '2026-11-06', items: [
    ['new', 'Sports', 'Live games and channels from your own addons, sorted by sport and league.'],
  ] },
  { v: '2.24.1', date: '2026-11-06', items: [
    ['fixed', 'iPhone and iPad', 'Streams play in Safari on iPhone and iPad.'],
  ] },
  { v: '2.24.0', date: '2026-11-06', items: [
    ['better', 'Watch party voice', 'Voices get their own volume, the film dips while people talk, and you can hear the party on your phone.'],
  ] },
  { v: '2.23.0', date: '2026-11-06', items: [
    ['new', 'Smallest file and preferred audio language', 'Two new source rules in Settings › Streams.'],
    ['better', 'Where to watch', 'One tidy dropdown instead of a row of logos.'],
  ] },
  { v: '2.22.0', date: '2026-11-05', items: [
    ['new', 'Anime look, comic edition', 'A redrawn Miko and a layered night city.'],
  ] },
  { v: '2.21.1', date: '2026-11-05', items: [
    ['fixed', 'Phones and seats', 'The phone side menu closes Settings properly, and every seat can be renamed from Who’s watching.'],
  ] },
  { v: '2.20.0', date: '2026-11-05', items: [
    ['new', 'The player, rebuilt', 'A fixed seek bar, options in tabs, volume up to 200 %, Listen on phone, picture adjustments and phone gestures.'],
  ] },
];
const WhatsNew = {
  KEY: 'seenVer', OFF: 'whatsNewOff',
  newer: (a, b) => (typeof Updater !== 'undefined' ? Updater.newer(a, b) : String(a) > String(b)),
  KINDS: { new: ['sparkles', 'New'], better: ['trending-up', 'Improved'], fixed: ['wrench', 'Fixed'] },
  since(prev) { return RELEASES.filter((r) => this.newer(r.v, prev) && !this.newer(r.v, APP_VERSION)); },
  when(d) { try { return new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d; } },
  list(rels) {
    return rels.map((r) => `<section class="wn-rel"><div class="wn-v"><b>${esc(r.v)}</b><small>${esc(this.when(r.date))}</small></div><ul class="wn-items">${r.items.map(([k, t, d]) => {
      const [ic, label] = this.KINDS[k] || this.KINDS.new;
      return `<li class="wn-${esc(k)}"><span class="wn-tag"><i data-lucide="${ic}"></i>${label}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></li>`;
    }).join('')}</ul></section>`).join('');
  },
  open(prev) {
    const all = this.since(prev || '0'); if (!all.length) return;
    const shown = all.slice(0, 3), more = all.length - shown.length;
    const el = X8.layer('whatsNew', { label: 'What’s new', icon: 'sparkles', eyebrow: 'Updated' });
    el.querySelector('.x8-modal').classList.add('wn-modal');
    const b = X8.body('whatsNew');
    b.innerHTML = `<h2 class="x8-h">What’s new in MKCinema ${esc(APP_VERSION)}</h2>${this.list(shown)}
      ${more > 0 ? `<p class="tour-note">${more === 1 ? 'One more update since you last opened MKCinema.' : `${more} more updates since you last opened MKCinema.`}</p>` : ''}
      <div class="inrow wn-foot"><button class="btn btn-ghost btn-sm" type="button" data-nav data-wn-all><i data-lucide="list"></i>All updates</button><button class="btn btn-prime btn-sm" type="button" data-nav data-x8close><i data-lucide="check"></i>Got it</button></div>`;
    icons();
    $('[data-wn-all]', b).onclick = () => { X8.close('whatsNew'); openSettings('whatsnew'); };
    X8.open('whatsNew');
    if (IS_TV) setTimeout(() => { const f = $('#whatsNew .wn-foot [data-x8close]'); if (f) Nav.focus(f, true); }, 60);
  },
  /* waits for a quiet moment, like the other first-run cards */
  later(prev) {
    let n = 0;
    const wait = () => setTimeout(() => {
      const busy = document.body.classList.contains('intro-on') || document.body.classList.contains('layer-open') || !$('#player').hidden || [...MENU_LAYERS, 'tour'].some((x) => $(`#${x}`) && !$(`#${x}`).hidden) || $('.focus-ask, .sup-ask');
      if (!busy) this.open(prev); else if (n++ < 120) wait();
    }, n ? 1500 : 2500);
    wait();
  },
  section() {
    return { id: 'whatsnew', icon: 'sparkles', label: 'What’s new', intro: `You’re on MKCinema ${APP_VERSION}. Every update in the last few days, newest first. The full history is in CHANGELOG.md on GitHub.`, rows: () => [
      { key: 'wnCard', label: 'Show what’s new after an update', help: 'One card, once per update, the first time MKCinema opens on the new version.', type: 'toggle', get: () => !Store.raw.get(this.OFF, false), set: (v) => Store.raw.set(this.OFF, !v) },
      { html: () => `<div class="wn-all">${this.list(RELEASES.filter((r) => !this.newer(r.v, APP_VERSION)))}</div>` },
      { html: () => '<p class="tour-note"><a class="u" href="https://github.com/itbelikethatbruh/MKCinema/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Full changelog on GitHub</a> · <a class="u" href="https://github.com/itbelikethatbruh/mkcinema/issues/new/choose" target="_blank" rel="noopener">Report a problem</a></p>' },
    ] };
  },
  init() {
    if (!SECTIONS.some((s) => s.id === 'whatsnew')) {
      const at = SECTIONS.findIndex((s) => s.id === 'about');
      SECTIONS.splice(at < 0 ? SECTIONS.length : at, 0, this.section());
      const g = SET_GROUPS.find(([n]) => n === 'More'); if (g && !g[1].includes('whatsnew')) { const i = g[1].indexOf('about'); g[1].splice(i < 0 ? g[1].length : i, 0, 'whatsnew'); }
      SET_BLURB.whatsnew = 'Updates, new features and fixes';
    }
    COMMANDS.push({ label: 'What’s new in MKCinema', icon: 'sparkles', run: () => openSettings('whatsnew') });
    let prev = Store.raw.get(this.KEY, '');
    // someone who set MKCinema up before this card existed sees the newest release once; a first visit sees nothing
    if (!prev) prev = Store.get('toured', false) ? (RELEASES[1] && RELEASES[1].v) || '' : APP_VERSION;
    Store.raw.set(this.KEY, APP_VERSION);
    if (!this.newer(APP_VERSION, prev) || Store.raw.get(this.OFF, false)) return;
    this.later(prev);
  },
};
try { WhatsNew.init(); } catch (e) { console.warn('What’s new:', e); }
