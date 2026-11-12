
'use strict';
/* =====================================================================
   MKCinema · settings, local files, boot
   ===================================================================== */
const SUB_FONTS = { sans: '"Onest", system-ui, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'var(--f-mono)', display: '"Sora", system-ui, sans-serif', system: 'system-ui, sans-serif' };
const LANG_CHOICES = (() => { const seen = new Map(); Object.entries(LANGS).forEach(([code, name]) => { if (code.length === 3 && !seen.has(name)) seen.set(name, code); }); return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([n, c]) => [c, n]); })();

function applyAll() {
  const root = document.documentElement.style, body = document.body.classList;
  ['--void', '--cyan', '--violet', '--gold'].forEach((k) => root.removeProperty(k));
  { const lk = LOOKS[CFG.look] ? CFG.look : 'noir', de = document.documentElement; if (lk === 'noir') de.removeAttribute('data-look'); else de.setAttribute('data-look', lk); const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', LOOKS[lk].meta); }
  root.setProperty('--blur', `${CFG.blur}px`); body.toggle('noblur', CFG.blur <= 0 || TOUCH_UI); body.toggle('fx', CFG.quality !== 'low' && !CFG.reduceMotion); body.toggle('fx-hi', CFG.quality === 'high' && !CFG.reduceMotion);
  body.toggle('touch-ui', TOUCH_UI);
  root.setProperty('--zoom', String(+(CFG.uiScale / 100 * (window.__mkFit ? window.__mkFit() : 1)).toFixed(3)));
  root.setProperty('--amb-o', String(CFG.ambIntensity / 100));
  body.toggle('reduce-motion', !!CFG.reduceMotion); body.toggle('hc', CFG.contrast === 'high');
  body.toggle('ci-hover', cardInfoMode() === 'hover'); body.toggle('ci-below', cardInfoMode() === 'below');
  root.setProperty('--sub-size', `${CFG.subSize}%`); root.setProperty('--sub-color', CFG.subColor);
  root.setProperty('--sub-bg', `rgba(0,0,0,${CFG.subBg / 100})`); root.setProperty('--sub-font', SUB_FONTS[CFG.subFont] || SUB_FONTS.sans);
  root.setProperty('--sub-shadow', CFG.subOutline ? '0 0 3px #000,0 0 2px #000,1px 1px 2px #000' : 'none');
  $('#fps').hidden = !CFG.showFps; FpsMeter.set(!!CFG.showFps);
  sfx.setVolume();
}
CFG_HOOKS.push((key) => {
  if (key === 'blur' && CFG.quality !== 'custom') { CFG.quality = 'custom'; CFG.qualityChosen = true; saveCfg(); }
  applyAll();
  if (key === 'cardInfo') rerender();
  if (['hideP2P', 'showTrailers', 'maxQuality', 'preferFormat'].includes(key)) { engine.clearCache(); if (!$('#detail').hidden && D.meta) loadDetailStreams(); }
  if (key.startsWith('sub')) styleCues();
  if (key === 'cloudSync' && CFG.cloudSync) Account.pull();
});

/* ---------------- Settings UI ---------------- */
const opt = (pairs, v) => pairs.map(([val, label]) => `<option value="${esc(val)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(label)}</option>`).join('');
/* 2.37.0: keys and passwords never sit in the page's markup, where a theme or custom CSS could read a value="…"
   attribute. Inputs carry a data-fill number instead; the value is set from script as soon as they are added. */
const SecretFill = {
  map: new Map(), n: 0,
  attr(v) { v = v == null ? '' : String(v); if (!v) return 'value=""'; const id = `f${++this.n}`; this.map.set(id, v); if (this.map.size > 300) this.map.delete(this.map.keys().next().value); return `value="" data-fill="${id}"`; },
  run() { document.querySelectorAll('input[data-fill]').forEach((i) => { const id = i.dataset.fill; i.removeAttribute('data-fill'); if (this.map.has(id)) { i.value = this.map.get(id); this.map.delete(id); } }); },
};
new MutationObserver(() => { if (SecretFill.map.size) SecretFill.run(); }).observe(document.documentElement, { childList: true, subtree: true });
/* Service notice: one short line the owner sets in Settings > Account (stored in mkcinema_notice on MKCinema's own
   project, readable by anyone, changeable only by the owner account). Checked at start, when the app comes back to the
   screen, and every 2 minutes while it is on screen. Closing it hides that message on this device until the text changes. */
const Notice = {
  OWNER: 'fd0f579d-ad6b-40bc-a246-1b0e47fad70a', text: '', at: 0, busy: false,
  owner() { return !!(Account.user && Account.user.id === this.OWNER && Account.config() && Account.config().url === SUPABASE_PROJECT.url); },
  async load() {
    if (this.busy || !SUPABASE_PROJECT.url || !navigator.onLine) return; this.busy = true;
    try {
      const r = await fetch(`${SUPABASE_PROJECT.url}/rest/v1/mkcinema_notice?select=text,updated_at&id=eq.1`, { headers: { apikey: SUPABASE_PROJECT.anonKey, Accept: 'application/json' }, cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json(); const row = Array.isArray(j) ? j[0] : null;
      this.show(row ? String(row.text || '').trim() : '');
    } catch (e) { /* offline or blocked: keep what is shown */ } finally { this.busy = false; this.at = Date.now(); }
  },
  show(t) {
    this.text = t;
    let el = $('#mkNotice');
    let seen = ''; try { seen = localStorage.getItem('mkc:noticeSeen') || ''; } catch (e) { /* private mode */ }
    if (!t || seen === t) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'mkNotice'; el.className = 'glass-solid'; el.setAttribute('role', 'status');
      el.innerHTML = '<i data-lucide="megaphone"></i><span></span><button class="ibtn" type="button" data-nav aria-label="Close notice"><i data-lucide="x"></i></button>';
      el.querySelector('button').addEventListener('click', () => { try { localStorage.setItem('mkc:noticeSeen', this.text); } catch (e) { /* private mode */ } el.hidden = true; });
      document.body.appendChild(el); icons();
    }
    el.querySelector('span').textContent = t; el.hidden = false;
  },
  async save(t) {
    t = String(t || '').trim().slice(0, 200);
    if (!this.owner()) throw new Error('Only the owner account can change the notice');
    if (!Account.client && Account.ensure) await Account.ensure();
    const { data, error } = await Account.client.from('mkcinema_notice').update({ text: t, updated_at: new Date().toISOString() }).eq('id', 1).select('text');
    if (error) throw error;
    if (!data || !data.length) throw new Error('The notice could not be saved (no permission)');
    try { localStorage.removeItem('mkc:noticeSeen'); } catch (e) { /* private mode */ }
    this.show(t);
  },
  rows() {
    return [
      { group: 'Service notice' },
      { key: 'noticeText', label: 'Notice text', help: 'One short line everyone sees at the top of the app and on the status page, for example “Updating MKCinema, back in a few minutes”. Up to 200 characters. Only your account sees this.', type: 'text', get: () => Store.get('noticeDraft', '') || this.text, set: (v) => Store.set('noticeDraft', String(v || '').slice(0, 200)) },
      { key: 'noticeShow', label: 'Show it', help: this.text ? `Showing now: “${esc(this.text)}”` : 'Nothing is showing right now.', type: 'button', text: 'Show notice', icon: 'megaphone', run: async (b) => { const v = ($('#set-noticeText') || {}).value || Store.get('noticeDraft', ''); if (!String(v).trim()) { toast('Type the notice first', 'err'); return; } b.disabled = true; try { await this.save(v); toast('Notice is showing everywhere', 'ok'); renderSettings(); } catch (e) { toast(e.message || 'Could not save the notice', 'err'); } finally { b.disabled = false; } } },
      { key: 'noticeClear', label: 'Clear it', help: 'Removes the notice for everyone.', type: 'button', text: 'Clear notice', icon: 'x', run: async (b) => { b.disabled = true; try { await this.save(''); Store.set('noticeDraft', ''); toast('Notice cleared', 'ok'); renderSettings(); } catch (e) { toast(e.message || 'Could not clear the notice', 'err'); } finally { b.disabled = false; } } },
    ];
  },
  start() {
    setTimeout(() => this.load(), 2500);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - this.at > 30000) this.load(); });
    setInterval(() => { if (!document.hidden) this.load(); }, 120000);
  },
};
/* Sideways strips with a mouse: any element that scrolls sideways (Home rows, season pills, filter chips, tabs, cast,
   episode strips) gets arrow buttons at its ends while the pointer is over it, and can be dragged sideways. Only for a
   fine pointer that can hover (mouse or trackpad) and never on a TV, where the remote moves focus. */
const RailMouse = {
  rail: null, hideT: 0, drag: null, moved: false,
  ok: () => !IS_TV && matchMedia('(hover: hover) and (pointer: fine)').matches,
  // the nearest ancestor (or el itself) that really scrolls sideways
  find(el) {
    for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
      if (n.classList.contains('rail-nav') || n.matches('input,textarea,select,[contenteditable="true"],video')) return null;
      if (n.scrollWidth > n.clientWidth + 2) { const ox = getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll') return n; }
    }
    return null;
  },
  init() {
    if (!this.ok()) return;
    const mk = (dir) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'rail-nav glass-solid'; b.dataset.dir = dir; b.tabIndex = -1; b.setAttribute('aria-label', dir < 0 ? 'Scroll left' : 'Scroll right'); b.innerHTML = `<i data-lucide="chevron-${dir < 0 ? 'left' : 'right'}"></i>`; document.body.appendChild(b); return b; };
    this.prev = mk(-1); this.next = mk(1); icons();
    [this.prev, this.next].forEach((b) => {
      b.addEventListener('click', () => { const r = this.rail; if (r) r.scrollBy({ left: Number(b.dataset.dir) * Math.max(160, r.clientWidth * 0.8), behavior: 'smooth' }); });
      b.addEventListener('mouseenter', () => clearTimeout(this.hideT));
      b.addEventListener('mouseleave', () => this.hideSoon());
    });
    document.addEventListener('mouseover', (e) => { if (this.drag) return; const r = this.find(e.target); if (r) { clearTimeout(this.hideT); if (r !== this.rail) this.show(r); } else if (this.rail && !this.rail.contains(e.target) && !e.target.closest?.('.rail-nav')) this.hideSoon(); }, { passive: true });
    document.addEventListener('mouseout', (e) => { const r = this.rail; if (r && r.contains(e.target) && !(e.relatedTarget && (r.contains(e.relatedTarget) || e.relatedTarget.closest?.('.rail-nav')))) this.hideSoon(); }, { passive: true });
    document.addEventListener('scroll', (e) => { if (this.rail && (e.target === this.rail || e.target === document || e.target.contains && e.target.contains(this.rail))) this.place(); }, { capture: true, passive: true });
    addEventListener('resize', () => this.place(), { passive: true });
    // click and drag
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const r = this.find(e.target); if (!r) return;
      this.drag = { r, x: e.clientX, left: r.scrollLeft, id: e.pointerId }; this.moved = false;
    }, { passive: true });
    document.addEventListener('pointermove', (e) => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      if (!(e.buttons & 1)) { this.drag = null; return; }
      const dx = e.clientX - d.x;
      if (!this.moved && Math.abs(dx) < 6) return;
      if (!this.moved) { this.moved = true; d.r.classList.add('mk-dragging'); getSelection()?.removeAllRanges?.(); }
      d.r.scrollLeft = d.left - dx;
    }, { passive: true });
    const end = () => { const d = this.drag; this.drag = null; if (!d) return; if (this.moved) { const r = d.r; requestAnimationFrame(() => r.classList.remove('mk-dragging')); setTimeout(() => { this.moved = false; }, 0); } };
    document.addEventListener('pointerup', end, { passive: true });
    document.addEventListener('pointercancel', end, { passive: true });
    // a drag never presses the card or button it started on, and pictures are never dragged out of the strip
    document.addEventListener('click', (e) => { if (this.moved) { e.preventDefault(); e.stopPropagation(); this.moved = false; } }, true);
    document.addEventListener('dragstart', (e) => { if (this.find(e.target)) e.preventDefault(); });
  },
  show(r) { this.rail = r; this.place(); },
  hideSoon() { clearTimeout(this.hideT); this.hideT = setTimeout(() => { this.prev.classList.remove('on'); this.next.classList.remove('on'); this.rail = null; }, 220); },
  place() {
    const r = this.rail; if (!r || !this.prev) return;
    if (!r.isConnected || !r.offsetParent) { this.prev.classList.remove('on'); this.next.classList.remove('on'); this.rail = null; return; }
    const b = r.getBoundingClientRect(), y = Math.round(b.top + b.height / 2), sm = b.height < 90;
    const can = r.scrollWidth > r.clientWidth + 2, atStart = r.scrollLeft <= 8, atEnd = r.scrollLeft + r.clientWidth >= r.scrollWidth - 8;
    const w = sm ? 30 : 40;
    this.prev.classList.toggle('sm', sm); this.next.classList.toggle('sm', sm);
    this.prev.style.top = this.next.style.top = `${y}px`;
    this.prev.style.left = `${Math.max(4, Math.round(b.left) + (sm ? 2 : 6))}px`;
    this.next.style.left = `${Math.min(innerWidth - w - 4, Math.round(b.right) - w - (sm ? 2 : 6))}px`;
    this.prev.classList.toggle('on', can && !atStart);
    this.next.classList.toggle('on', can && !atEnd);
  },
};
RailMouse.init();
Notice.start();
function ctlHTML(d) {
  const v = d.get ? d.get() : CFG[d.key], id = `set-${d.key}`;
  if (d.type === 'toggle') return `<button class="switch ${v ? 'on' : ''}" type="button" id="${id}" role="switch" aria-checked="${!!v}" aria-label="${esc(d.label)}"></button>`;
  if (d.type === 'seg') return `<div class="segc" id="${id}" role="radiogroup" aria-label="${esc(d.label)}">${d.options.map(([val, label]) => `<button type="button" role="radio" aria-checked="${String(v) === String(val)}" class="${String(v) === String(val) ? 'on' : ''}" data-v="${esc(val)}">${esc(label)}</button>`).join('')}</div>`;
  if (d.type === 'select') return `<select class="sel" id="${id}" aria-label="${esc(d.label)}">${opt(d.options, v)}</select>`;
  if (d.type === 'range') return `<input class="rng" type="range" id="${id}" min="${d.min}" max="${d.max}" step="${d.step || 1}" value="${v}" aria-label="${esc(d.label)}"><span class="set-val tnum" id="${id}-v">${esc(d.fmt ? d.fmt(v) : v)}</span>`;
  if (d.type === 'color') return `<input class="clr" type="color" id="${id}" value="${esc(v)}" aria-label="${esc(d.label)}">`;
  if (d.type === 'text') return `<input class="inp mono" style="width:min(320px,100%)" id="${id}" value="${esc(v)}" spellcheck="false" aria-label="${esc(d.label)}">`;
  if (d.type === 'secret') return `<input class="inp mono" type="password" style="width:min(320px,100%)" id="${id}" ${SecretFill.attr(v)} placeholder="${esc(d.placeholder || 'Paste key')}" spellcheck="false" autocomplete="off" aria-label="${esc(d.label)}">`;
  if (d.type === 'button') return `<button class="btn btn-ghost btn-sm ${d.danger ? 'danger' : ''}" type="button" id="${id}">${d.icon ? `<i data-lucide="${d.icon}"></i>` : ''}${esc(d.text)}</button>`;
  return '';
}
const rowHTML = (d) => d.group ? `<div class="set-group">${esc(d.group)}</div>` : d.html ? d.html() : `<div class="set-row"><div><b>${esc(d.label)}</b>${d.help ? `<small>${d.help}</small>` : ''}</div><div class="set-ctl">${ctlHTML(d)}</div></div>`;
function bindRow(d) {
  if (!d.key) return; const el = $(`#set-${d.key}`); if (!el) return;
  const set = (v) => (d.set ? d.set(v) : setCfg(d.key, v));
  if (d.type === 'toggle') el.addEventListener('click', () => { const v = !el.classList.contains('on'); el.classList.toggle('on', v); el.setAttribute('aria-checked', v); set(v); });
  if (d.type === 'seg') $$('button', el).forEach((b) => b.addEventListener('click', () => { $$('button', el).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); set(d.num ? Number(b.dataset.v) : b.dataset.v); }));
  if (d.type === 'select') el.addEventListener('change', () => { const raw = el.value; set(d.num ? Number(raw) : raw); });
  if (d.type === 'range') {
    el.addEventListener('input', () => { const n = Number(el.value); $(`#set-${d.key}-v`).textContent = d.fmt ? d.fmt(n) : n; if (d.live) set(n); });
    el.addEventListener('change', () => set(Number(el.value)));
  }
  if (d.type === 'color') el.addEventListener('input', () => set(el.value));
  if (d.type === 'text' || d.type === 'secret') el.addEventListener('change', () => set(el.value.trim()));
  if (d.type === 'button') el.addEventListener('click', () => d.run(el));
}
const pct = (v) => `${v}%`;
const EXT_HELP = {
  android: 'Opens the stream in an installed Android app, the same way Stremio does. If the app is missing, the Play Store opens.',
  ios: 'Opens the stream in an installed app through its link. Safari asks before it switches apps.',
  mac: 'Infuse and IINA open directly. VLC and mpv for Mac have no web link, so pick the .m3u playlist for those.',
  windows: 'PotPlayer opens directly. VLC, mpv and MPC-HC have no web link, so the .m3u playlist opens in whichever player handles .m3u files.',
  linux: 'Desktop players on Linux have no web link, so MKCinema saves an .m3u playlist your default player opens.',
};
const SECTIONS = [
  { id: 'account', icon: 'circle-user-round', label: 'Account', intro: 'Sign in with Supabase to keep your library, progress, addons and settings in sync across devices.', bind: () => Account.bind(), rows: () => [
    { html: () => Account.panelHTML() },
    { key: 'importStremio', label: 'Import from Stremio', help: 'Copies your Stremio library, watch progress, watched history and addons into MKCinema. Your Stremio password is used once and never saved.', type: 'button', text: 'Import from Stremio', icon: 'download', run: () => openStremioImport() },
    { key: 'cloudSync', label: 'Cloud sync', help: 'Uploads your watchlist, progress, addons and settings to your account a few seconds after they change.', type: 'toggle' },
    ...(Notice.owner() ? Notice.rows() : []),
  ] },
  { id: 'picks', icon: 'sparkles', label: 'Your Picks', intro: 'Recommendations made on this device from your favorites, your library and what you watch. No outside AI service sees your taste.', rows: () => [
    { html: () => { const t = Taste.get(); const n = t.picks.length + t.genres.length; return `<div class="set-row"><div><b>Your favorites</b><small>${n ? esc([...t.picks.map((m) => m.name), ...t.genres].slice(0, 12).join(' · ')) : 'Not set yet. Pick at least 3 shows, movies or genres.'}</small></div><div class="set-ctl"><button class="btn btn-prime btn-sm" type="button" id="set-qp"><i data-lucide="wand-sparkles"></i>${n ? 'Edit favorites' : 'Pick favorites'}</button></div></div>`; } },
    { key: 'askPicks', label: 'Ask for something specific', help: 'Describe it in your own words, like “funny crime series” or “something like Arrival”. Works with voice search too.', type: 'button', text: 'Ask Your Picks', icon: 'message-square-text', run: () => { closeLayer('settings'); openPalette('', { ask: true }); } },
    { key: 'tourAgain', label: 'Walkthrough', help: 'The quick tour of what MKCinema offers.', type: 'button', text: 'Replay walkthrough', icon: 'map', run: () => { closeLayer('settings'); openTour(0); } },
    { key: 'clearTaste', label: 'Reset my taste', type: 'button', text: 'Clear favorites', icon: 'trash-2', danger: true, run: () => { Taste.clear(); Recs.cache = null; renderSettings(); toast('Favorites cleared'); } },
  ], bind: () => { const b = $('#set-qp'); if (b) b.onclick = () => { closeLayer('settings'); openQuickPick(); }; } },
  { id: 'appearance', icon: 'palette', label: 'Appearance', intro: 'Four looks, all dark and quiet so nothing competes with the poster art. Your choice syncs to your account.', bind: () => $$('#setBody [data-look]').forEach((b) => b.addEventListener('click', () => { setCfg('look', b.dataset.look); $$('#setBody [data-look]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); })), rows: () => [
    { html: lookHTML },
    { key: 'contrast', label: 'Text contrast', help: 'High makes every label and description brighter and a touch bolder, for bright rooms and small screens.', type: 'seg', options: [['standard', 'Standard'], ['high', 'High']] },
    { group: 'Posters' },
    { key: 'ratingBadges', label: 'IMDb rating on posters', help: 'A small star rating in the corner of each poster.', type: 'toggle', set: (v) => { setCfg('ratingBadges', v); rerender(); } },
    { key: 'rpdb', label: 'Rating posters (RPDB)', help: 'Swaps posters for RatingPosterDB versions with ratings printed on them. Uses the free key unless you add your own. A poster RPDB does not have falls back to the normal one.', type: 'toggle', set: (v) => { setCfg('rpdb', v); rerender(); } },
    { key: 'rpdbKey', label: 'RPDB key (optional)', help: 'From ratingposterdb.com. Syncs with your account when Sync keys is on.', type: 'secret', placeholder: 't0-free-rpdb', get: () => Keys.get().rpdb || '', set: (v) => { Keys.set('rpdb', v); rerender(); } },
    { key: 'posterUrl', label: 'Custom poster URL', help: 'Paste a poster link from a poster service such as Pictorium (free, pictorium.elfhosted.com), made by Eful97, who suggested this feature. In Pictorium, open Install Hub, pick the tab whose link has {tmdb_id} in it, and copy that link. MKCinema fills in {type}, {imdb_id}, {tmdb_id} and {shape}, so wide cards get landscape art too. It takes over from RPDB while set, and any title it has no art for keeps the normal poster. Leave empty to turn it off.', type: 'text', get: () => Keys.get().posterUrl || '', set: (v) => { if (v && !/^https?:\/\/[^\s"'<>]+$/i.test(v)) { toast('Paste the full link, starting with https://', 'err'); return; } Keys.set('posterUrl', v); rerender(); if (v) toast('Custom posters on'); } },
    { key: 'omdbKey', label: 'Critic scores (OMDb key)', help: 'Adds Rotten Tomatoes and Metacritic scores to title pages. Get a free key at omdbapi.com. Syncs with your account when Sync keys is on.', type: 'secret', get: () => Keys.get().omdb || '', set: (v) => Keys.set('omdb', v) },
    { key: 'cardInfo', label: 'Poster text', help: 'Posters already carry their own titles. "On hover" keeps them clean until you point at one. Phones and tablets cannot hover, so they show the title below.', type: 'seg', options: [['hover', 'On hover'], ['below', 'Below'], ['full', 'On poster']] },
    ...(TOUCH_UI ? [] : [{ key: 'wall', label: 'Curved IMAX wall', help: 'Bends catalog rows around you instead of flat rails. Desktop only, and heavier while scrolling.', type: 'toggle', get: () => S.wall, set: (v) => setWall(v) }]),
    { group: 'Layout' },
    { key: 'uiScale', label: 'Interface size', help: 'Raise it for TVs and couch distance.', type: 'range', min: 80, max: 140, step: 5, fmt: pct },
    { key: 'reduceMotion', label: 'Reduce motion', help: 'Turns off animations and the intro.', type: 'toggle' },
  ] },
  { id: 'performance', icon: 'gauge', label: 'Performance', intro: 'High is the default: raised, shimmering buttons, posters with depth, the 3D logo while a film loads, and frosted glass on desktops. Phones get all of it except the glass. If scrolling ever stutters or the battery runs low, MKCinema drops to Low by itself. Video quality is never affected.', rows: () => [
    { html: presetsHTML },
    { key: 'blur', label: 'Glass blur', help: `0 gives solid black panels, the fastest option.${IS_TV ? ' TVs always use solid panels, which keeps the remote smooth at High.' : TOUCH_UI ? ' This device always uses solid panels, because Chrome on Android can black out parts of the screen under glass.' : ''}`, type: 'range', min: 0, max: 30, step: 2, fmt: (v) => (v ? `${v}px` : 'solid') },
    { key: 'showFps', label: 'Show frame rate', type: 'toggle' },
  ] },
  { id: 'playback', icon: 'play-circle', label: 'Playback', intro: 'Smart Play uses these preferences when it scores streams.', rows: () => [
    { key: 'extPlayer', label: 'Play streams in', help: `${EXT_HELP[PLATFORM]} Saved for ${PLATFORM_NAME} and synced to your account. Torrents, local files and trailers always play here.`, type: 'select', options: [['builtin', 'MKCinema player'], ...playersHere().map((p) => [p.id, p.name])], get: extPlayerId, set: (v) => setCfg('extPlayers', { ...(CFG.extPlayers || {}), [PLATFORM]: v }) },
    { key: 'maxQuality', label: 'Highest quality for Smart Play', help: 'Streams above this are ranked lower, useful on slow connections.', type: 'select', options: [['4k', '4K UHD'], ['1080', '1080p'], ['720', '720p']] },
    { key: 'preferFormat', label: 'Preferred format', type: 'select', options: [['any', 'No preference'], ['hls', 'HLS (adaptive)'], ['mp4', 'Direct file (MP4)']] },
    { key: 'resume', label: 'Resume where you left off', type: 'toggle' },
    { key: 'browserOnly', label: 'Only sources that play here', help: 'For devices where you cannot install VLC or another player. Lists only sources this browser can play with working picture and sound (H.264 or a codec this device supports, AAC/Opus sound), and torrents only through your debrid service. Fewer sources, but the ones you see play right here.', type: 'toggle' },
    { key: 'audioOnly', label: 'Audio language', help: 'Hides sources dubbed only in other languages, so Smart Play and auto-switch never pick them. Releases that name no language, or MULTi and Dual Audio releases, stay listed. When a file has several languages, this one plays first where this device allows it.', type: 'select', options: [['eng', 'English'], ['spa', 'Spanish'], ['fre', 'French'], ['ger', 'German'], ['ita', 'Italian'], ['por', 'Portuguese'], ['hin', 'Hindi'], ['any', 'Any language']] },
    { key: 'failover', label: 'Switch sources automatically', help: 'If a source has not started after 10 s, errors, or stalls for 12 s, the next best one takes over at the same spot.', type: 'toggle' },
    { key: 'skipIntro', label: 'Skip Intro button', help: 'Shows for 8 s when an intro is known: from chapters in the file, AniSkip for anime, or your own skips on earlier episodes. Enter or gamepad A presses it.', type: 'toggle' },
    { key: 'autoSkipIntro', label: 'Skip intros automatically', type: 'toggle' },
    { key: 'xray', label: 'X-Ray when paused', help: 'A moment after you pause: who is on screen, the story, and quick actions for this moment.', type: 'toggle' },
    { key: 'spoilerGuard', label: 'Spoiler Guard', help: 'Blurs thumbnails and hides summaries of episodes you have not watched. Tap Reveal on any one.', type: 'toggle' },
    { key: 'autoNext', label: 'Play next episode automatically', help: 'Keeps the same source group (bingeGroup) when it can.', type: 'toggle' },
    { key: 'upNextAt', label: 'Show "Next episode" before the end', help: 'Also shows when the credits start, if the episode has a credits marker. With autoplay on, it counts down 10 s.', type: 'range', min: 10, max: 90, step: 5, fmt: (v) => `${v}s` },
    { key: 'seekStep', label: 'Skip step', type: 'select', num: true, options: [[5, '5 seconds'], [10, '10 seconds'], [15, '15 seconds'], [30, '30 seconds']] },
    { key: 'speed', label: 'Default speed', type: 'select', num: true, options: [[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']] },
    { key: 'rememberVolume', label: 'Remember volume', type: 'toggle' },
    { key: 'ambilight', label: 'Ambilight', help: 'Projects the picture\'s colors around the player. Desktop only: on phones and tablets the video fills the screen.', type: 'toggle', set: (v) => { setCfg('ambilight', v); P.amb = v; $('#pAmb').classList.toggle('on', v); } },
    { key: 'ambIntensity', label: 'Ambilight strength', type: 'range', min: 10, max: 100, step: 5, fmt: pct, live: true },
    { key: 'trailerMode', label: 'Trailers', help: 'Best for this device opens trailers in the YouTube app on TVs with the MKCinema TV app 1.2.4 or later, where they play smoothly, and plays them inside MKCinema everywhere else. Embedded trailers use youtube-nocookie.com with YouTube controls, related videos and annotations switched off, and close by themselves at the end. YouTube still shows its title, share link and More videos while a trailer is paused or touched; its terms do not allow sites to cover those. Whether an ad runs is decided by YouTube and the uploader; MKCinema does not block ads.', type: 'select', options: [['auto', 'Best for this device'], ['embed', 'Play inside MKCinema'], ['link', 'Open on YouTube']] },
  ] },
  { id: 'subtitles', icon: 'captions', label: 'Subtitles', intro: 'OpenSubtitles v3 is installed by default. You can also load .srt, .vtt, .ass, .ssa or .sub files from your device in the player.', rows: () => [
    { html: () => `<div style="margin:6px 0 10px;border-radius:14px;overflow:hidden;background:linear-gradient(120deg,#203040,#402030);aspect-ratio:21/6;display:grid;place-items:end center;padding-bottom:6%"><span style="background:var(--sub-bg);color:var(--sub-color);font-family:var(--sub-font);font-size:calc(var(--sub-size) * .2);text-shadow:var(--sub-shadow);padding:2px 8px;border-radius:3px">This is how subtitles will look.</span></div>` },
    { key: 'subAuto', label: 'Turn on subtitles automatically', help: 'Picks your language when a stream has it.', type: 'toggle' },
    { key: 'subDubSigns', label: 'Signs & Songs with dubs', help: 'When a dual-audio anime plays its dub in your subtitle language, picks the file\u2019s Signs & Songs track (on-screen text and lyrics) instead of full subtitles made for the original voices.', type: 'toggle' },
    { key: 'subLang', label: 'Preferred language', type: 'select', options: LANG_CHOICES },
    { key: 'subSize', label: 'Size', type: 'range', min: 50, max: 220, step: 10, fmt: pct, live: true },
    { key: 'subColor', label: 'Text color', type: 'color' },
    { key: 'subBg', label: 'Background opacity', type: 'range', min: 0, max: 100, step: 5, fmt: pct, live: true },
    { key: 'subFont', label: 'Font', type: 'select', options: [['sans', 'Onest (sans)'], ['system', 'System'], ['serif', 'Serif'], ['mono', 'Monospace'], ['display', 'Sora']] },
    { key: 'subOutline', label: 'Text outline', type: 'toggle' },
    { key: 'subPos', label: 'Position', type: 'select', options: [['bottom', 'Bottom'], ['higher', 'Raised (clears burned-in text)'], ['top', 'Top']] },
  ] },
  { id: 'streams', icon: 'layers', label: 'Streams & addons', intro: 'Control which sources show up and how MKCinema reaches them.', rows: () => [
    { key: 'hideP2P', label: 'Hide torrent (P2P) sources', help: 'Browsers cannot play them; they only hand off to external players.', type: 'toggle' },
    { key: 'showTrailers', label: 'List trailers with streams', type: 'toggle' },
    { key: 'timeout', label: 'Addon timeout', help: 'How long to wait for each addon before giving up.', type: 'range', min: 5, max: 40, step: 1, fmt: (v) => `${v}s` },
    { key: 'proxy', label: 'MKCinema proxy URL', help: 'Used for streams that need custom headers, and to relay trailers when MKCinema is opened as a file.', type: 'text', get: () => S.proxy, set: (v) => { S.proxy = v.replace(/\/+$/, ''); Store.set('proxy', S.proxy); proxyCheck.t = 0; toast('Proxy URL saved', 'ok'); } },
    { key: 'alwaysProxy', label: 'Route every stream through the proxy', help: 'Fixes hosts that block browser playback, at the cost of your own bandwidth.', type: 'toggle' },
    { key: 'manage', label: 'Installed addons', type: 'button', text: 'Manage addons', icon: 'puzzle', run: () => { closeLayer('settings'); $('#openAddons').click(); } },
  ] },
  { id: 'debrid', icon: 'zap', label: 'Debrid', intro: 'Use your own debrid account to play torrent results instantly. Signed in, your keys travel with your account, locked with your password, so they load on every device you sign in on. They are never in setup codes unless you tick that box, never shared, and only ever sent to that service (or through your own MKCinema server if your browser blocks the service).', rows: () => [
    { html: () => `${Object.entries(DEBRID).map(([k, d]) => `<div class="set-row"><div><b>${d.label}${Vault.service() === k ? ' <span class="tag-s g">in use</span>' : ''}</b><small>Key from ${esc(d.help)}</small><small class="dk-st" id="dk-st-${k}"></small></div><div class="set-ctl"><input class="inp mono" type="password" data-dk="${k}" style="width:min(240px,100%)" ${SecretFill.attr(Vault.cfg()[k])} placeholder="API key" autocomplete="off" spellcheck="false" aria-label="${d.label} key"><button class="btn btn-ghost btn-sm" type="button" data-dt="${k}">Test</button></div></div>`).join('')}` },
    { html: () => Account.unlockHTML() },
    { key: 'syncKeys', label: 'Sync keys with my account', help: 'Debrid, RPDB, OMDb, TMDB and fanart keys, your custom poster URL, addon links that contain a key and TV playlist logins load wherever you sign in, locked with your password. Off keeps them, and addon links that contain a key, on this device only.', type: 'toggle', set: (v) => { CFG.syncKeys = v; saveCfg(); Account.schedule(); } },
    { key: 'vaultOff', label: 'Use debrid for torrent results', help: 'Torrent results get a Debrid badge (Instant when your service reports them cached) and Smart Play prefers them. If more than one key is saved, the one you added first is used.', type: 'toggle', get: () => !Vault.cfg().off, set: (v) => { Store.set('vault', { ...Vault.cfg(), off: !v }); engine.clearCache(); } },
  ], bind: () => {
    Account.bindUnlock();
    $$('[data-dk]').forEach((i) => i.addEventListener('change', () => { Vault.save(i.dataset.dk, i.value); renderSettingsBody(); toast(i.value ? `${DEBRID[i.dataset.dk].label} key saved${Account.keysSync() ? ' and synced to your account' : Account.needsUnlock() ? ' on this device. Unlock synced keys to sync it' : ' on this device'}` : 'Key removed', 'ok'); }));
    $$('[data-dt]').forEach((b) => b.addEventListener('click', async () => { const k = b.dataset.dt, st = $(`#dk-st-${k}`); st.textContent = 'Checking…'; try { st.textContent = `✓ ${await Vault.test(k)}`; } catch (e) { st.textContent = `✗ ${e.message}`; } }));
  } },
  { id: 'sync', icon: 'refresh-ccw', label: 'Trakt & Simkl', intro: 'Scrobble what you watch and keep watchlists in step. Past 80 % a title counts as watched. Connect with your own free API app; tokens stay in this browser.', rows: () => [
    { group: 'Trakt' },
    { key: 'traktId', label: 'Client ID', help: 'Create an app at trakt.tv/oauth/applications with redirect URI urn:ietf:wg:oauth:2.0:oob.', type: 'secret', get: () => Trakt.cfg().clientId || '', set: (v) => Trakt.save({ clientId: v }) },
    { key: 'traktSecret', label: 'Client secret', help: 'Trakt needs it to finish signing in. It is your own app’s secret and stays on this device.', type: 'secret', get: () => Trakt.cfg().secret || '', set: (v) => Trakt.save({ secret: v }) },
    { html: () => `<div class="set-row"><div><b>${Trakt.on() ? 'Connected' : 'Not connected'}</b><small id="trk-st">${Trakt.on() ? 'Scrobbling is on.' : 'Save the ID and secret, then connect.'}</small></div><div class="set-ctl">${Trakt.on() ? '<button class="btn btn-ghost btn-sm" type="button" id="trk-in"><i data-lucide="download"></i>Import watchlist</button><button class="btn btn-ghost btn-sm" type="button" id="trk-out"><i data-lucide="upload"></i>Export watchlist</button><button class="btn btn-ghost btn-sm danger" type="button" id="trk-x">Disconnect</button>' : '<button class="btn btn-prime btn-sm" type="button" id="trk-go"><i data-lucide="link"></i>Connect Trakt</button>'}</div></div>` },
    { group: 'Simkl' },
    { key: 'simklId', label: 'Client ID', help: 'Create an app at simkl.com/settings/developer. No secret needed.', type: 'secret', get: () => Simkl.cfg().clientId || '', set: (v) => Simkl.save({ clientId: v }) },
    { html: () => `<div class="set-row"><div><b>${Simkl.on() ? 'Connected' : 'Not connected'}</b><small id="smk-st">${Simkl.on() ? 'Finished titles are added to your Simkl history.' : 'Save the client ID, then connect.'}</small></div><div class="set-ctl">${Simkl.on() ? '<button class="btn btn-ghost btn-sm" type="button" id="smk-in"><i data-lucide="download"></i>Import watchlist</button><button class="btn btn-ghost btn-sm" type="button" id="smk-out"><i data-lucide="upload"></i>Export watchlist</button><button class="btn btn-ghost btn-sm danger" type="button" id="smk-x">Disconnect</button>' : '<button class="btn btn-prime btn-sm" type="button" id="smk-go"><i data-lucide="link"></i>Connect Simkl</button>'}</div></div>` },
  ], bind: () => {
    const flow = (svc, stId) => async () => {
      const st = $(stId);
      try { await svc.connect((code, url) => { st.innerHTML = `Go to <a href="${esc(safeHref(url) || '#')}" target="_blank" rel="noopener">${esc(url.replace(/^https?:\/\//, ''))}</a> and enter <b class="mono">${esc(code)}</b>. Waiting…`; }); toast('Connected', 'ok'); renderSettingsBody(); }
      catch (e) { st.textContent = e.message; }
    };
    const run = (id, fn) => { const b = $(id); if (b) b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { toast(e.message, 'err'); } b.disabled = false; }; };
    run('#trk-go', flow(Trakt, '#trk-st')); run('#smk-go', flow(Simkl, '#smk-st'));
    run('#trk-in', async () => toast(`Added ${await Trakt.importList()} titles from Trakt`, 'ok')); run('#trk-out', async () => toast(`Sent ${await Trakt.exportList()} titles to Trakt`, 'ok'));
    run('#smk-in', async () => toast(`Added ${await Simkl.importList()} titles from Simkl`, 'ok')); run('#smk-out', async () => toast(`Sent ${await Simkl.exportList()} titles to Simkl`, 'ok'));
    run('#trk-x', async () => { Store.set('trakt', { clientId: Trakt.cfg().clientId, secret: Trakt.cfg().secret }); renderSettingsBody(); });
    run('#smk-x', async () => { Store.set('simkl', { clientId: Simkl.cfg().clientId }); renderSettingsBody(); });
  } },
  { id: 'devices', icon: 'smartphone', label: 'Devices', intro: 'Hand a film to your phone at the same second, drive this screen from your phone, or watch in sync with friends.', rows: () => [
    { key: 'castOpen', label: 'Phone remote', help: 'Scan a QR code and your phone becomes a remote for this screen: touchpad or D-pad, play and seek, and a keyboard or your voice for search. Phones stay paired.', type: 'button', text: 'Pair a phone', icon: 'qr-code', run: () => { closeLayer('settings'); Cast.open('remote'); } },
    { key: 'remoteNew', label: 'Unpair all phones', help: 'Makes a new pairing code and removes every allowed phone. They need to scan again, and this screen asks again before each one may control it.', type: 'button', text: 'New code', icon: 'refresh-cw', run: () => Remote.renew() },
    ...(typeof RmSec !== 'undefined' ? RmSec.rows() : []),
    { key: 'remoteJoin', label: 'Use this phone as a remote', help: 'Opens MKCinema Remote, where you type the code shown on the TV. It remembers the TV for next time.', type: 'button', text: 'Open remote', icon: 'smartphone', run: () => Remote.join('') },
    { key: 'partyOpen', label: 'Watch party', help: 'Synced playback, voice chat with its own volume (or on your phone), text chat and reactions. Works peer to peer; some strict networks (some offices and mobile carriers) block direct connections.', type: 'button', text: Party.code ? `Party ${Party.code}` : 'Start or join', icon: 'users', run: () => { closeLayer('settings'); Party.openPanel(); } },
    { key: 'install', label: 'Install as an app', help: PWA.installed() ? 'MKCinema is running as an installed app.' : 'Adds MKCinema to your home screen or dock, with its own window and faster start.', type: 'button', text: 'Install', icon: 'download', run: () => PWA.install() },
  ] },
  { id: 'home', icon: 'layout-dashboard', label: 'Home', intro: 'Choose what MKCinema opens on and what your Home shows.', rows: () => [
    { key: 'saverNow', label: 'Screensaver / Ambient Mode', help: 'Full-screen 3D parallax art with atmosphere, right now. Left and Right browse, OK opens the film, Back returns.', type: 'button', text: 'Start Ambient Mode', icon: 'monitor-play', run: () => { closeLayer('settings'); setTimeout(() => Saver.open(true), 450); } },
    { key: 'hlStart', label: 'Open on', type: 'select', options: [['home', 'Home'], ['movie', 'Movies'], ['series', 'Series'], ['tv', 'Live TV'], ['library', 'Library'], ['calendar', 'Calendar']], get: () => Layout.get().start, set: (v) => Layout.set({ start: v }) },
    { key: 'saverAfter', label: 'Start Ambient Mode when idle', help: 'Films from your Home, watchlist and Continue watching, in 3D, when nothing has been pressed for a while. It never starts while something plays.', type: 'select', num: true, options: [[0, 'Off'], [1, 'After 1 minute'], [1.5, 'After 90 seconds'], [3, 'After 3 minutes'], [5, 'After 5 minutes'], [10, 'After 10 minutes'], [20, 'After 20 minutes']], get: () => Saver.after(), set: (v) => Saver.setAfter(v) },
    { key: 'fanartKey', label: 'Fanart.tv key (optional)', help: 'Unlocks the full 3D shadowbox: transparent character cutouts and clean logos from fanart.tv. Get a free personal key at fanart.tv. Syncs with your account when Sync keys is on.', type: 'secret', get: () => Keys.get().fanart || '', set: (v) => { Keys.set('fanart', v); AmbientArt.cache.clear(); } },
    { key: 'tmdbKey', label: 'TMDB key (optional)', help: 'Backdrops and logos from themoviedb.org, and the depth effect for films without a cutout. Free API key (v3) at themoviedb.org. Syncs with your account when Sync keys is on.', type: 'secret', get: () => Keys.get().tmdb || '', set: (v) => TMDB.setKey(v) },
    { key: 'hlFocus', label: 'Movies or series', help: 'Orders, or limits, the catalog rows on Home and the featured banner.', type: 'select', options: [['both', 'Both, as my addons list them'], ['movies-first', 'Movies first'], ['series-first', 'Series first'], ['movies', 'Movies only'], ['series', 'Series only']], get: () => Layout.get().focus, set: (v) => Layout.set({ focus: v }) },
    { group: 'Rows on Home' },
    { key: 'hlTrakt', label: 'Trakt Watchlist and Collection rows', help: 'Off by default: they repeat My watchlist and are often empty. Empty rows never show on Home.', type: 'toggle', get: () => Layout.get().traktLists, set: (v) => Layout.set({ traktLists: v }) },
    ...HOME_ROWS.map(([k, l]) => ({ key: `hl-${k}`, label: l, type: 'toggle', get: () => Layout.shows(k), set: (v) => { const h = Layout.get().hidden.filter((x) => x !== k); if (!v) h.push(k); Layout.set({ hidden: h }); } })),
  ] },
  { id: 'sound', icon: 'volume-2', label: 'Sound', intro: IS_TV ? 'On a TV, MKCinema opens straight to Home, so the remote is ready right away. The interface makes no sounds.' : 'MKCinema opens straight to Home. Sound here covers the welcome tour and Interface sounds only.', rows: () => IS_TV ? [] : [
    { key: 'sound', label: 'Sound', type: 'toggle', get: () => !sfx.muted, set: (v) => { if (v === sfx.muted) toggleMute(); } },
    { key: 'sfxVolume', label: 'Volume', type: 'range', min: 0, max: 100, step: 5, fmt: pct, live: true },
  ] },
  { id: 'keys', icon: 'keyboard', label: 'Shortcuts', intro: 'Player keys follow VLC where it makes sense. A gamepad works too: D-pad moves, A selects, B goes back, Y opens sources or search, LB/RB switch tabs or skip 30 s.', rows: () => [{ html: () => `<div class="kbd-grid">${[
    ['Ctrl/⌘ K or /', 'Search titles, addons and commands'], ['Arrows', 'Move between items (seek and volume in the player)'], ['Enter', 'Open or play'], ['Esc / Backspace', 'Back'],
    ['Space or K', 'Play / pause'], ['J / L', `Back / forward ${CFG.seekStep}s`], ['F', 'Fullscreen'], ['M', 'Mute'], ['N', 'Next episode'], ['S / E', 'Sources / episodes drawer'],
    ['C', 'Subtitle menu'], ['V', 'Cycle subtitles'], ['G / H', 'Subtitle delay −/+ 0.25s'], ['B', 'Cycle audio track'], ['[ / ] / =', 'Slower / faster / normal speed'], ['O', 'Speed, quality and audio menu'], ['A', 'Audio menu'], ['P', 'Watch party'], ['Enter / A button', 'Skip intro, when shown'],
  ].map(([k, d]) => `<span class="kbd">${esc(k)}</span><span>${esc(d)}</span>`).join('')}</div>` }] },
  { id: 'data', icon: 'database', label: 'Data', intro: 'Your setup lives in this browser (and your account, if you sign in). The Setup Cloner moves all of it to another device in one code.', rows: () => [
    { group: 'Privacy' },
    { key: 'anonStats', label: 'Share anonymous visit counts', help: 'Once per visit, Cloudflare Web Analytics counts the page, the site you came from, browser, country and load speed. No cookies, no IDs, nothing about your addons, keys or what you watch. Off sends nothing.', type: 'toggle' },
    { group: 'Setup Cloner' },
    { html: () => `<div class="set-row"><div><b>Include my private keys</b><small>Adds debrid, RPDB and OMDb keys. Only for your own devices: anyone with the code can use them.</small></div><div class="set-ctl"><button class="switch" type="button" id="cl-secrets" role="switch" aria-checked="false" aria-label="Include private keys"></button></div></div>` },
    { key: 'cloneCode', label: 'Setup code', help: 'Addons, Studio project, settings, proxy, watchlist, progress and Home layout, packed into one mkc:// code.', type: 'button', text: 'Copy setup code', icon: 'copy', run: async () => copyText(await Cloner.code({ secrets: $('#cl-secrets').classList.contains('on') })) },
    { key: 'cloneFile', label: 'Setup file', help: 'The same, as a .mkcinema file.', type: 'button', text: 'Download .mkcinema', icon: 'download', run: () => Cloner.file({ secrets: $('#cl-secrets').classList.contains('on') }) },
    { html: () => `<div class="set-row" style="grid-template-columns:minmax(0,1fr)"><div><b>Restore</b><small>Paste a setup code (mkc://…) or an older JSON export, or pick a .mkcinema file. It applies right away, no reload.</small></div><textarea class="inp" id="set-import" rows="3" placeholder="mkc://…"></textarea><div class="inrow"><button class="btn btn-prime btn-sm" type="button" id="set-import-go"><i data-lucide="upload"></i>Restore</button><button class="btn btn-ghost btn-sm" type="button" id="set-import-file"><i data-lucide="file-up"></i>Choose file…</button><input type="file" id="set-import-pick" accept=".mkcinema,.json,application/json" hidden></div></div>` },
    { group: 'Reset' },
    { key: 'clearProgress', label: 'Clear watch progress', type: 'button', text: 'Clear progress', icon: 'eraser', danger: true, run: (b) => confirmTwice(b, () => { S.progress = {}; Store.set('progress', {}); toast('Progress cleared'); rerender(); }) },
    { key: 'clearList', label: 'Clear watchlist', type: 'button', text: 'Clear watchlist', icon: 'eraser', danger: true, run: (b) => confirmTwice(b, () => { S.watchlist = []; Store.set('watchlist', []); toast('Watchlist cleared'); rerender(); }) },
    { key: 'resetCfg', label: 'Reset settings', help: 'Keeps your library and addons.', type: 'button', text: 'Reset settings', icon: 'undo-2', danger: true, run: (b) => confirmTwice(b, () => { Object.keys(CFG).forEach((k) => delete CFG[k]); Object.assign(CFG, CFG_DEFAULTS); CFG.quality = applyPreset(CFG.quality); saveCfg(); applyAll(); renderSettings(); toast('Settings reset', 'ok'); }) },
    { key: 'resetAll', label: 'Reset everything', help: 'Removes settings, library, progress, addons and Studio projects from this browser.', type: 'button', text: 'Erase all data', icon: 'trash-2', danger: true, run: (b) => confirmTwice(b, () => { try { Object.keys(localStorage).filter((k) => k.startsWith('mkc:')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* storage blocked */ } location.reload(); }) },
  ] },
  { id: 'support', icon: 'heart', label: 'Support', intro: 'MKCinema is free forever, with no ads and nothing locked. It is made and kept online by Dee Lavish.', rows: () => [{ html: () => Support.html() }] },
];
function confirmTwice(btn, fn) {
  if (btn.dataset.armed) { fn(); delete btn.dataset.armed; btn.lastChild.textContent = btn.dataset.orig; return; }
  btn.dataset.armed = '1'; btn.dataset.orig = btn.lastChild.textContent; btn.lastChild.textContent = 'Click again to confirm';
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.lastChild.textContent = btn.dataset.orig; } }, 4000);
}
function exportData() { return { app: 'MKCinema', version: 2, cfg: CFG, watchlist: S.watchlist, progress: S.progress, watched: watchedMap(), addons: Store.get('addons', []), disabled: Store.get('disabled', []), studio: S.studio, taste: Store.get('taste', null), proxy: S.proxy, wall: S.wall, homeLayout: Store.get('homeLayout', null) }; }
/* Restores in place (no reload) from a setup code, a .mkcinema file or an older JSON export: see Cloner */
/* 2.37.0: before a setup code changes anything, show what it holds and let the person pick. The proxy, custom CSS
   and keys start off: a code from someone else could route streams through their server or read keys. */
Cloner.preview = function (d) {
  return new Promise((resolve) => {
    const id = 'impPreview', cfg = d.cfg || {}, norm = (u) => { try { return StremioEngine.normalize(u); } catch (e) { return String(u); } };
    const want = Array.isArray(d.addons) ? d.addons.map(norm) : null, have = engine.addons.filter((a) => !a.builtin && !a.studio).map((a) => a.baseUrl);
    const add = want ? want.filter((u) => !have.includes(u)) : [], rem = want ? have.filter((u) => !want.includes(u)) : [];
    const host = (u) => { try { return new URL(u).host; } catch (e) { return String(u).slice(0, 60); } };
    const keyNames = [...Object.keys(d.vault || {}).filter((k) => (d.vault || {})[k]).map((k) => (typeof DEBRID !== 'undefined' && DEBRID[k] ? DEBRID[k].label : k)),
      ...Object.keys(d.keys || {}).filter((k) => (d.keys || {})[k]), ...Object.keys(cfg).filter((k) => /(Key|Token|Secret|Pass)$/.test(k) && cfg[k]).map((k) => ({ tmdbKey: 'TMDB', fanartKey: 'Fanart.tv' }[k] || k))];
    const rows = [];
    if (d.cfg) rows.push(['settings', true, 'Settings', 'Look, playback, language and the other choices in Settings.']);
    if (d.watchlist || d.progress || d.watched) rows.push(['library', true, 'Library', `Watchlist${d.watchlist ? ` (${d.watchlist.length})` : ''}, watch progress and what you’ve watched. This replaces yours.`]);
    if (want) rows.push(['addons', true, 'Add-ons', `${add.length} to add${add.length ? `: ${add.slice(0, 4).map(host).join(', ')}${add.length > 4 ? '…' : ''}` : ''}. ${rem.length} of yours removed.`]);
    if (d.proxy && d.proxy !== S.proxy) rows.push(['proxy', false, 'Proxy server', `Routes some streams through ${host(d.proxy)}. Only if you know who runs it.`]);
    if (cfg.customCss && cfg.customCss !== CFG.customCss) rows.push(['css', false, 'Custom CSS', `${String(cfg.customCss).length} characters of styling. Styling can change and track what the app shows.`]);
    if (keyNames.length) rows.push(['keys', false, 'Keys', `${[...new Set(keyNames)].slice(0, 5).join(', ')}. These replace your own keys, and anything you play goes through those accounts.`]);
    X8.layer(id, { label: 'Restore a setup', icon: 'upload', eyebrow: 'Restore' });
    const b = X8.body(id);
    b.innerHTML = `<h3 class="x8-h">Restore this setup?</h3><p class="sub">${d.at ? `Made ${esc(String(d.at).slice(0, 10))}. ` : ''}Pick what to take from it. Anything you leave off stays as it is.</p>
      <div class="imp-rows">${rows.map(([k, on, label, help]) => `<div class="set-row"><div><b>${esc(label)}</b><small>${esc(help)}</small></div><div class="set-ctl"><button class="switch ${on ? 'on' : ''}" type="button" role="switch" data-nav data-imp="${k}" aria-checked="${on}" aria-label="${esc(label)}"></button></div></div>`).join('')}</div>
      <div class="actions" style="margin-top:12px"><button class="btn btn-prime" type="button" data-nav id="impGo"><i data-lucide="check"></i>Restore</button><button class="btn btn-ghost" type="button" data-nav data-x8close>Cancel</button></div>`;
    icons();
    let done = false; const finish = (v) => { if (done) return; done = true; delete X8.onClose[id]; resolve(v); };
    $$('[data-imp]', b).forEach((x) => x.addEventListener('click', () => { const v = !x.classList.contains('on'); x.classList.toggle('on', v); x.setAttribute('aria-checked', v); }));
    $('#impGo', b).onclick = () => { const o = { settings: false, library: false, addons: false, proxy: false, css: false, keys: false }; $$('[data-imp]', b).forEach((x) => { o[x.dataset.imp] = x.classList.contains('on'); }); finish(o); X8.close(id); };
    X8.onClose[id] = () => finish(null);
    X8.open(id);
  });
};
async function importData(text) {
  let d; try { d = await Cloner.parse(text); if (!d || d.app !== 'MKCinema') throw new Error('That is not an MKCinema setup'); } catch (e) { toast(`Could not restore: ${e.message}`, 'err', 6000); return; }
  const opt = await Cloner.preview(d); if (!opt) return;
  try { const r = await Cloner.restore(d, opt); toast(`Setup restored${r.added || r.removed ? ` · ${r.added} addon${r.added === 1 ? '' : 's'} added, ${r.removed} removed` : ''}`, 'ok', 5000); }
  catch (e) { toast(`Could not restore: ${e.message}`, 'err', 6000); }
}
function lookHTML() {
  const cur = LOOKS[CFG.look] ? CFG.look : 'noir';
  return `<div class="looks" role="radiogroup" aria-label="Theme">${Object.entries(LOOKS).map(([id, t]) => `<button type="button" class="lk ${id === cur ? 'on' : ''}" role="radio" aria-checked="${id === cur}" data-look="${id}" data-nav style="--l0:${t.l0};--lb:${t.lb};--li:${t.li};--la:${t.la}"><span class="lk-scr"><i>MK<em>CINEMA</em></i></span><b><svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>${t.label}</b><small>${t.blurb}</small><span class="lk-dots"><span style="--c:${t.l0}"></span><span style="--c:${t.lb}"></span><span style="--c:${t.li}"></span><span style="--c:${t.la}"></span></span></button>`).join('')}</div>`;
}
function presetsHTML() {
  const items = PRESET_ORDER.map((k) => [k, PRESETS[k].label, PRESETS[k].note]);
  if (CFG.quality === 'custom') items.push(['custom', 'Custom', `${CFG.blur ? `${CFG.blur}px blur` : 'Solid panels'}`]);
  return `<div class="presets">${items.map(([k, l, d]) => `<button class="preset ${CFG.quality === k ? 'on' : ''}" type="button" data-preset="${k}" data-nav><b>${l}</b><small>${esc(d)}</small></button>`).join('')}</div>`;
}
let setSection = 'appearance';
/* The section list is built once per opening; switching sections only swaps the body, so the list never jumps or loses its scroll position */
function renderSettingsNav() {}
function markSettingsNav() {}
function renderSettingsBody() {}
function renderSettings() { if (!$('#setNav [data-sec]')) renderSettingsNav(); markSettingsNav(); renderSettingsBody(); }
function openSettings(section) {}
$('#openSettings').onclick = () => openSettings();
$('#openAccount').onclick = () => openSettings('account');

FpsMeter.onFps = (f) => { if (CFG.showFps) $('#fps').textContent = `${Math.round(f)} fps`; };

/* ---------------- Local files (play from this device, drag and drop) ---------------- */
const SUB_EXT = /\.(srt|vtt|ass|ssa|sub)$/i;
function playLocal(file) {
  if (P.localUrl) URL.revokeObjectURL(P.localUrl);
  const url = P.localUrl = URL.createObjectURL(file);
  const meta = { id: `local:${file.name}`, type: 'movie', name: file.name.replace(/\.[^.]+$/, ''), description: `${fmtBytes(file.size)} · from this device` };
  const stream = { name: 'This device', title: `${file.name}\n${fmtBytes(file.size)}`, url, _local: true, _addon: 'Local file', behaviorHints: { filename: file.name, videoSize: file.size } };
  stream._tel = Telemetry.parse(stream); stream._tel.source = null;
  playStream({ meta, video: null, streams: [stream] }, stream, { startAt: 0 });
}
function handleFiles(files) {
  const list = Array.from(files || []); if (!list.length) return;
  const vid = list.find((f) => !SUB_EXT.test(f.name)); const sub = list.find((f) => SUB_EXT.test(f.name));
  if (vid) playLocal(vid);
  if (sub) { if (vid || !$('#player').hidden) setTimeout(() => loadSubFile(sub), vid ? 600 : 0); else toast('Start a video first, then drop the subtitle file on it', 'err'); }
}
$('#openFile').onclick = () => $('#fileVideo').click();
$('#fileVideo').addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
let dragDepth = 0;
addEventListener('dragenter', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { dragDepth++; $('#dropzone').hidden = false; } });
addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropzone').hidden = true; });
addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) e.preventDefault(); });
addEventListener('drop', (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); dragDepth = 0; $('#dropzone').hidden = true; handleFiles(e.dataTransfer.files); });

/* Local files that will not decode get an explanation instead of external-player links */
const _playbackFailed = playbackFailed;
playbackFailed = function (stream, reason) {
  if (stream && stream._local && !$('#player').hidden && P.stream === stream) {
    showMsg('Your browser cannot decode this file', `${esc(reason)}. Browsers play H.264, VP9 and AV1 video with AAC, MP3 or Opus audio. Files with HEVC (x265) video or AC3, DTS or TrueHD audio, common in MKV releases, need a desktop player such as VLC.`, '<button class="btn btn-ghost" type="button" data-act="close"><i data-lucide="x"></i>Close</button>');
    return;
  }
  return _playbackFailed(stream, reason);
};

/* ---------------- Palette commands ---------------- */
COMMANDS.push(
  { label: 'Open settings', icon: 'settings-2', run: () => openSettings() },
  { label: 'Play a file from this device', icon: 'folder-open', run: () => $('#fileVideo').click() },
  { label: 'Performance settings', icon: 'gauge', run: () => openSettings('performance') },
  { label: 'Subtitle settings', icon: 'captions', run: () => openSettings('subtitles') },
  ...PRESET_ORDER.map((k) => ({ label: `Effects: ${PRESETS[k].label}`, icon: 'gauge', run: () => { CFG.quality = k; CFG.qualityChosen = true; applyPreset(k); saveCfg(); applyAll(); toast(`Effects: ${PRESETS[k].label}`, 'ok'); } })),
);

applyAll();
