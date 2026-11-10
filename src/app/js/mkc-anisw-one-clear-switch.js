
/* 2.45.4: one clear switch for the Anime look, in Settings › Appearance and on the Anime page.
   Appearance moved to the colour wheel and its look cards went away, so there was no way to turn Anime on.
   Turning it off returns to the look you had before (Noir, or your wheel colour). */
const AnimeSwitch = {
  on: () => CFG.look === 'anime',
  set(v) {
    if (!LOOKS.anime || v === this.on()) return;
    if (v) {
      if (CFG.look && CFG.look !== 'anime') Store.set('lookBeforeAnime', CFG.look);
      // the switch is the way back, so skip the early-access pop-up
      if (typeof AnimeLook !== 'undefined') AnimeLook.prev = 'anime';
      setCfg('look', 'anime');
    } else {
      let back = Store.get('lookBeforeAnime', 'noir');
      if (back === 'anime' || (back !== 'atelier' && !LOOKS[back])) back = 'noir';
      if (typeof AnimeLook !== 'undefined') AnimeLook.prev = back;
      if (back === 'atelier' && typeof Atelier !== 'undefined' && CFG.atelier) Atelier.apply(Atelier.get());
      else setCfg('look', back === 'atelier' ? 'noir' : back);
    }
    if (typeof Account !== 'undefined' && Account.schedule) Account.schedule();
    this.sync();
    toast(v ? 'Anime look is on' : 'Anime look is off', 'ok');
  },
  sync() {
    const on = this.on();
    $$('.an-lookbtn').forEach((b) => { b.setAttribute('aria-checked', on); const s = $('.switch', b); if (s) s.classList.toggle('on', on); });
  },
  btnHTML() {
    const on = this.on();
    return `<button type="button" class="chip an-lookbtn" data-nav role="switch" aria-checked="${on}" title="Give the whole app the Anime look"><i data-lucide="sparkles"></i>Anime look<span class="switch ${on ? 'on' : ''}" aria-hidden="true"></span></button>`;
  },
  init() {
    if (!LOOKS.anime) return;
    // Settings › Appearance: at the end of the Colour group, right under the wheel
    const ap = secById('appearance');
    if (ap) {
      const rows = ap.rows;
      ap.rows = () => {
        const r = typeof rows === 'function' ? rows() : rows;
        const row = { key: 'animeLookOn', label: 'Anime look', help: 'Comic panels, a new logo and Miko. Off returns to your colour.', type: 'toggle',
          get: () => this.on(),
          set: (v) => { this.set(v); if (!$('#settings').hidden) { renderSettingsBody(); if (IS_TV) { const s = $('#set-animeLookOn'); if (s) Nav.focus(s, true); } } } };
        const i = r.findIndex((d) => d && d.group === 'Colour');
        if (i < 0) return [row, ...r];
        const j = r.findIndex((d, k) => k > i && d && d.group);
        const at = j < 0 ? r.length : j;
        return [...r.slice(0, at), row, ...r.slice(at)];
      };
    }
    // the Anime page: a switch beside the lists
    const ar = AnimeHub.render.bind(AnimeHub);
    AnimeHub.render = function () {
      const out = ar.apply(this, arguments);
      const bar = $('#animeBody .an-head .toolbar');
      if (bar && !$('.an-lookbtn', bar)) {
        bar.insertAdjacentHTML('beforeend', AnimeSwitch.btnHTML()); icons();
        $('.an-lookbtn', bar).addEventListener('click', () => AnimeSwitch.set(!AnimeSwitch.on()));
      }
      return out;
    };
    CFG_HOOKS.push((k) => { if (k === 'look') setTimeout(() => this.sync(), 0); });
    if (S.view === 'anime' && $('#animeBody .an-head') && !$('.an-lookbtn')) AnimeHub.render();
    if (typeof COMMANDS !== 'undefined') COMMANDS.push({ label: 'Anime look on or off', icon: 'sparkles', run: () => this.set(!this.on()) });
  },
};
try { AnimeSwitch.init(); } catch (e) { console.warn('[anime switch]', e); }
