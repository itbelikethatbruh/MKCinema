
/* ---------------- 2.26.0 First-launch player choice ----------------
   One step in the welcome walkthrough, right after the welcome screen: where streams play (MKCinema's own player,
   the TV's own player in the TV app, or an outside app such as VLC), plus what Browser only mode is for.
   It saves to the same settings as Settings › Playback (CFG.extPlayers per platform, CFG.tvPlayer, CFG.browserOnly),
   so nothing new syncs. Nothing changes until the person taps an option; Next or Skip keeps what is set.
   Shown once per device. People who skip the walkthrough before this step, and people who finished the walkthrough
   before 2.26.0 without ever picking a player, get this one step on its own, once. Every line is a fixed sentence,
   so the 2.15 exact-match translation layer covers it. */
const PlayerAsk = {
  KEY: 'playerAsked',
  solo: false,
  native() { try { return IS_TV && !!(window.MKAndroid && typeof MKAndroid.play === 'function'); } catch (e) { return false; } },
  hevc() { try { return BrowserPlay.can('video/mp4; codecs="hvc1.1.6.L120.90"'); } catch (e) { return false; } },
  // the option that suits this device, and the reason in one plain sentence
  rec() {
    if (IS_TV) return this.native()
      ? { pick: 'native', why: 'The TV player uses your TV’s own video hardware, so MKV, HEVC, HDR and Dolby Vision play smoothly.' }
      : { pick: 'builtin', bo: true, why: 'TV browsers cannot install other players, so turn on Only sources that play here below.' };
    if (PLATFORM === 'ios') return (window.ManagedMediaSource || window.MediaSource) && CFG.engine !== false
      ? { pick: 'builtin', why: 'Safari on iPhone and iPad plays MP4, HLS and most MKV files right here. If one will not start, VLC is free and one tap away.' }
      : { pick: 'ext', why: 'This version of iOS cannot play MKV files in Safari, and many sources are MKV. Update to iOS 17.1 or later, or use VLC, which is free.' };
    if (PLATFORM === 'android' && !this.hevc()) return { pick: 'ext', why: 'This browser cannot play HEVC (x265), which many 4K and anime files use. VLC is free and plays them.' };
    return { pick: 'builtin', why: 'This browser plays most streams. If one will not start, Smart Play moves to the next source, and VLC is always one tap away.' };
  },
  cur() {
    if (this.native()) return CFG.tvPlayer === 'web' ? 'builtin' : 'native';
    return IS_TV || extPlayerId() === 'builtin' ? 'builtin' : 'ext';
  },
  // did this person ever pick something in Settings › Playback for this kind of device?
  chosen() { return !!((CFG.extPlayers || {})[PLATFORM]) || !!CFG.browserOnly || (IS_TV && !!CFG.tvPlayer); },
  // the app chip shown as picked: the saved one, else VLC (or the playlist file on a computer)
  appId() { const id = extPlayerId(); return id !== 'builtin' && playersHere().some((p) => p.id === id) ? id : Guide.vlcId(); },
  NOTE: {
    android: 'If the app is not installed yet, the Play Store opens.',
    ios: 'Safari asks before it switches apps.',
    desktop: 'VLC and mpv on a computer have no web link, so pick the playlist file and it opens in your default player.',
  },
  html() {
    const r = this.rec(), cur = this.cur(), nat = this.native();
    const opt = (id, title, desc) => `<button type="button" class="pc-opt" role="radio" data-pc="${id}" aria-checked="${cur === id}"><span class="pc-dot" aria-hidden="true"></span><span class="pc-txt"><b>${title}</b><small>${desc}</small>${r.pick === id ? '<em class="pc-rec">Best for this device</em>' : ''}</span></button>`;
    const opts = nat
      ? [opt('native', 'TV player', 'Uses your TV’s own video hardware. MKCinema still picks the source, sends your subtitles and remembers where you stopped.'),
        opt('builtin', 'MKCinema player', 'Keeps subtitle styling and X-Ray, but plays fewer kinds of files than the TV player.')]
      : [opt('builtin', 'MKCinema player', 'Plays right here, with watch party and skip intro. Some MKV or HEVC files may not play.'),
        ...(IS_TV ? [] : [opt('ext', 'Another player app', 'Opens streams in VLC, Infuse or MX Player. VLC is free and plays nearly everything.')])];
    const app = this.appId();
    const apps = IS_TV ? '' : `<div class="pc-apps"${cur === 'ext' ? '' : ' hidden'}><span class="pc-lab">Open streams in</span><div class="pc-chips" role="radiogroup" aria-label="Player app">${playersHere().map((p) => `<button type="button" class="pc-chip" role="radio" data-app="${p.id}" aria-checked="${p.id === app}">${esc(p.name)}</button>`).join('')}</div><small class="pc-note">${this.NOTE[PLATFORM === 'android' || PLATFORM === 'ios' ? PLATFORM : 'desktop']}</small><div class="pc-get">${vlcButtons()}</div></div>`;
    const bo = nat ? '' : `<div class="pc-bo"${cur === 'builtin' ? '' : ' hidden'}><div class="pc-txt"><b>Only sources that play here</b><small>Hides files this browser can’t play. Fewer sources, but they all work.</small>${r.bo ? '<em class="pc-rec">Best for this device</em>' : ''}</div><button type="button" class="pc-sw" role="switch" aria-checked="${!!CFG.browserOnly}" aria-label="Only sources that play here"><i aria-hidden="true"></i></button></div>`;
    return `<div class="tw-sec pc">
      <span class="tw-kicker">Before you press play</span>
      <h2 class="tw-h">How do you want to watch?</h2>
      <p class="pc-why"><i data-lucide="lightbulb" aria-hidden="true"></i><span>${r.why}</span></p>
      <div class="pc-opts" role="radiogroup" aria-label="Player">${opts.join('')}</div>
      ${apps}${bo}
      <p class="pc-foot">${nat ? 'If the TV player cannot open a source, the MKCinema player takes over by itself.' : 'Change it any time in Settings › Playback.'}</p>
    </div>`;
  },
  sync() { try { Account.schedule(); } catch (e) { /* not signed in */ } },
  setApp(id) { CFG.extPlayers = { ...(CFG.extPlayers || {}), [PLATFORM]: id }; saveCfg(); this.sync(); },
  bind() {
    Store.set(this.KEY, true);
    const root = $('#tourBody .pc'); if (!root) return;
    const check = (sel, on) => $$(sel, root).forEach((b) => b.setAttribute('aria-checked', String(on(b))));
    $$('.pc-opt', root).forEach((b) => { b.onclick = () => {
      const id = b.dataset.pc, apps = $('.pc-apps', root);
      check('.pc-opt', (x) => x === b);
      if (apps) apps.hidden = id !== 'ext'; const bo = $('.pc-bo', root); if (bo) bo.hidden = id !== 'builtin';
      if (this.native()) { setCfg('tvPlayer', id === 'native' ? 'native' : 'web'); this.sync(); }
      // a TV shares the 'android' slot with the person's phone, so the TV never writes it
      else if (!IS_TV) { const chip = $('.pc-chip[aria-checked="true"]', root); this.setApp(id === 'ext' ? (chip ? chip.dataset.app : Guide.vlcId()) : 'builtin'); }
      tourMore();
    }; });
    $$('.pc-chip', root).forEach((b) => { b.onclick = () => { check('.pc-chip', (x) => x === b); this.setApp(b.dataset.app); }; });
    // TV: the remote starts on the picked option, not on Next, so the arrows walk the choices first
    if (IS_TV) setTimeout(() => { const f = $('.pc-opt[aria-checked="true"]', root); if (f && f.isConnected && !$('#tour').hidden) Nav.focus(f, true); }, 80);
    const sw = $('.pc-sw', root), boRow = $('.pc-bo', root);
    if (IS_TV && sw && boRow) {
      sw.tabIndex = -1; boRow.tabIndex = 0; boRow.setAttribute('data-nav', ''); boRow.classList.add('pc-bo-tv');
      boRow.onclick = (e) => { if (e.target !== sw && !sw.contains(e.target)) sw.click(); };
      boRow.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); sw.click(); } });
    }
    if (sw) sw.onclick = () => { const on = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(on)); setCfg('browserOnly', on); this.sync(); };
  },
  // the step on its own, for people who never reached it in the walkthrough
  openSolo() { const i = TOUR.findIndex((s) => s.id === 'player'); if (i < 0) return; this.solo = true; openTour(i); },
  later(ms) {
    let n = 0;
    const wait = () => setTimeout(() => {
      if (Store.get(this.KEY, false)) return;
      if (this.chosen()) { Store.set(this.KEY, true); return; }
      const free = !document.body.classList.contains('intro-on') && [...MENU_LAYERS, 'player', 'tour'].every((x) => !$(`#${x}`) || $(`#${x}`).hidden) && !$('.sup-ask'); // the Home-layout card hides itself under an open layer
      if (free) this.openSolo(); else if (n++ < 120) wait();
    }, n ? 1000 : ms);
    wait();
  },
  init() {
    if (!TOUR.some((s) => s.id === 'player')) {
      const at = TOUR.findIndex((s) => s.id === 'welcome');
      TOUR.splice(at + 1, 0, { id: 'player', html: () => this.html(), after: () => this.bind() });
    }
    const go = window.tourGo, end = window.endTour, render = window.renderTour;
    window.tourGo = (d) => (this.solo ? endTour() : go(d));
    window.endTour = () => {
      const wasSolo = this.solo; this.solo = false;
      if (wasSolo && Store.get('toured', false)) closeLayer('tour'); else end();
      // skipped the walkthrough before reaching this step: ask this one question on its own, once
      if (!Store.get(this.KEY, false)) this.later(900);
    };
    window.renderTour = () => {
      render();
      $('#tourDots').style.visibility = this.solo ? 'hidden' : '';
      if (this.solo) { $('#tourBack').style.visibility = 'hidden'; $('#tourNext').hidden = false; $('#tourNext').innerHTML = '<i data-lucide="check"></i>Done'; icons(); }
    };
    $('#tourSkip').onclick = () => endTour();
    // people who finished the walkthrough before 2.26.0 and never picked a player
    if (Store.get('toured', false) && !Store.get(this.KEY, false) && !/^#?login=/.test(location.hash || '')) this.later(2500);
  },
};
PlayerAsk.init();
