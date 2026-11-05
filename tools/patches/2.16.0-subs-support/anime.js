'use strict';
/* =====================================================================
   MKCinema 2.16.0 · the Anime look (early access), interface sounds, trailer source
   - Anime: a fifth look. Crimson and violet night, a moon and pagoda skyline, a few sakura petals on Home and Miko,
     MKCinema's own mascot. Built for TVs too: the scene is one still picture, the petals move with transform only,
     and nothing blurs. MKCinema's logo is never changed.
   - Sounds: soft ticks for moving, opening and going back. Off in Settings › Intro & sound.
   - Trailers: Apple TV first or YouTube first, each falling back to the other.
   ===================================================================== */

LOOKS.anime = { label: 'Anime', blurb: 'Early access. Crimson and violet night, sakura and Miko, our mascot.', l0: '#0e0616', lb: '#2a0d2c', li: '#fff0f6', la: '#ff2d55', meta: '#0e0616', early: true };

const AnimeLook = {
  on: () => document.documentElement.getAttribute('data-look') === 'anime',
  prev: null,
  init() {
    // the petals and Miko live only on Home, and never while a film plays
    const box = document.createElement('div'); box.id = 'anPetals'; box.setAttribute('aria-hidden', 'true');
    const n = IS_TV ? 5 : TOUCH_UI ? 6 : 9;
    box.innerHTML = Array.from({ length: n }, (_, i) => `<i style="--x:${(i * 97 + 13) % 100}vw;--d:${(IS_TV ? 16 : 11) + (i * 7) % 9}s;--w:${-((i * 3.7) % 14).toFixed(1)}s;--s:${0.65 + ((i * 13) % 7) / 10}"></i>`).join('');
    document.body.appendChild(box);
    const sky = document.createElement('div'); sky.id = 'anSky'; sky.setAttribute('aria-hidden', 'true'); document.body.prepend(sky);
    const miko = document.createElement('img'); miko.id = 'anMiko'; miko.alt = ''; miko.src = 'anime/miko.svg'; miko.decoding = 'async'; miko.setAttribute('aria-hidden', 'true');
    document.body.appendChild(miko);
    // Miko also greets you on the Anime page, beside the title
    const ar = AnimeHub.render.bind(AnimeHub);
    AnimeHub.render = function () { const r = ar(); const h = $('#animeBody .an-head'); if (h && this && AnimeLook.on() && !h.querySelector('.an-miko')) h.insertAdjacentHTML('afterbegin', '<img class="an-miko" src="anime/miko.svg" alt="" aria-hidden="true" decoding="async">'); return r; };
    const sync = () => {
      const show = this.on() && S.view === 'home' && $('#player').hidden && !CFG.reduceMotion;
      document.body.classList.toggle('an-home', show);
    };
    const g0 = go; go = function () { const r = g0.apply(this, arguments); sync(); return r; };
    const sl = syncLayers; syncLayers = function () { const r = sl.apply(this, arguments); sync(); return r; };
    CFG_HOOKS.push((k, v) => {
      if (k === 'look') { setTimeout(sync, 0); if (S.view === 'anime') AnimeHub.render(); if (v === 'anime' && this.prev !== 'anime') this.early(this.prev || 'noir'); this.prev = v; }
      if (k === 'reduceMotion') sync();
    });
    this.prev = CFG.look;
    // the look was saved before this script defined it: apply it now
    if (CFG.look === 'anime') applyAll();
    sync();
    // the Appearance grid has five looks now
    const ap = secById('appearance'); if (ap) ap.intro = 'Five looks, all dark so nothing competes with the poster art. Anime is in early access. Your choice syncs to your account.';
    const lh = lookHTML; lookHTML = function () { return lh.apply(this, arguments).replace(/(<button[^>]*data-look="anime"[^>]*>[\s\S]*?<b>[\s\S]*?Anime)/, '$1<span class="lk-early">Early access</span>'); };
  },
  early(back) {
    X8.layer('anEarly', { label: 'Anime look', icon: 'sparkles', eyebrow: 'Early access' });
    const b = X8.body('anEarly');
    b.innerHTML = `<div class="an-early"><img src="anime/miko.svg" alt="Miko, the MKCinema mascot" width="120" height="142"><div>
      <h3 class="x8-h">The Anime look is in early access</h3>
      <p class="sub">It is new and may still have bugs${IS_TV ? ', especially on older TVs' : ''}. If anything looks wrong or feels slow, switch back here or any time in Settings › Appearance. Your other settings stay as they are.</p></div></div>
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="anKeep"><i data-lucide="check"></i>Keep Anime</button><button class="btn btn-ghost" type="button" data-nav id="anBack"><i data-lucide="undo-2"></i>Switch back to ${esc((LOOKS[back] || LOOKS.noir).label)}</button></div>`;
    icons(); X8.open('anEarly');
    $('#anKeep').onclick = () => X8.close('anEarly');
    $('#anBack').onclick = () => { X8.close('anEarly'); this.prev = back; setCfg('look', back); applyAll(); if (!$('#settings').hidden) renderSettingsBody(); toast(`${(LOOKS[back] || LOOKS.noir).label} is back`, 'ok'); };
    if (IS_TV) setTimeout(() => Nav.focus($('#anKeep')), 60);
  },
};
AnimeLook.init();

/* ---------------- Interface sounds ---------------- */
const UiSound = {
  ctx: null, out: null, last: 0,
  ok() { return CFG.uiSounds !== false && !(sfx && sfx.muted) && !(!$('#player').hidden && !video.paused); },
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return this.ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = 0.5; this.out.connect(this.ctx.destination); } catch (e) { this.ctx = null; }
    return this.ctx;
  },
  // f: start pitch, f2: end pitch, ms: length, v: loudness (all quiet)
  tone(f, f2, ms, v) {
    const c = this.ensure(); if (!c || c.state !== 'running') return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f2, t + ms / 1000);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + ms / 1000 + 0.02);
  },
  play(kind) {
    if (!this.ok()) return; const now = performance.now();
    if (kind === 'move') { if (now - this.last < 75) return; this.last = now; this.tone(1750, 1500, 28, 0.03); return; }
    this.last = now;
    const anime = AnimeLook.on();
    if (kind === 'enter') { this.tone(anime ? 880 : 740, anime ? 1320 : 990, 70, 0.045); }
    if (kind === 'back') { this.tone(anime ? 1180 : 990, anime ? 780 : 660, 70, 0.04); }
  },
  init() {
    const unlock = () => { if (CFG.uiSounds !== false) this.ensure(); };
    addEventListener('pointerdown', unlock, { capture: true, passive: true }); addEventListener('keydown', unlock, { capture: true });
    const nf = Nav.focus.bind(Nav); Nav.focus = function (el) { const a = document.activeElement; const r = nf.apply(this, arguments); if (el && el !== a) UiSound.play('move'); return r; };
    const ol = openLayer; openLayer = function (id) { if (id !== 'player') UiSound.play('enter'); return ol.apply(this, arguments); };
    const cl = closeLayer; closeLayer = function (id) { const el = $(`#${id}`); if (el && !el.hidden && id !== 'player') UiSound.play('back'); return cl.apply(this, arguments); };
    const g0 = go; go = function (view) { if (view !== S.view) UiSound.play('enter'); return g0.apply(this, arguments); };
        document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('.chip, .seg button, .segc button, .switch, .lk, .preset'); if (t) UiSound.play('move'); }, true);
    const snd = secById('sound');
    if (snd) { const rows = snd.rows; snd.rows = () => [...rows(), { key: 'uiSounds', label: 'Interface sounds', help: 'Soft ticks when you move between titles, open something or go back. Silent while a film plays.', type: 'toggle', get: () => CFG.uiSounds !== false }]; }
  },
};
UiSound.init();

/* ---------------- Trailer source: a default and a fallback ---------------- */
{
  if (CFG.appleTrailers === false && !CFG.trailerSource) CFG.trailerSource = 'youtube';
  const ytFirst = () => CFG.trailerSource === 'youtube';
  let fbMeta = null;
  // YouTube refusing to play inside MKCinema (or listing nothing) hands over to Apple
  const tm = trMsg;
  trMsg = function (html) {
    if (html && fbMeta && /YouTube|blocks embedded|did not load|timed out/i.test(html)) {
      const m = fbMeta; fbMeta = null;
      AppleTrailer.find(m).then((hit) => { if (hit && !$('#trailer').hidden) AppleTrailer.play(hit, m, () => tm.call(window, html)); else tm.call(window, html); });
      return;
    }
    return tm.apply(this, arguments);
  };
  const apl = playTrailer; // Apple first, then YouTube (from support.js)
  playTrailer = async function (meta) {
    fbMeta = null;
    if (!ytFirst() || !meta) return apl.apply(this, arguments);
    const hasYt = (meta.trailerStreams || []).some((t) => t.ytId) || (meta.trailers || []).some((t) => t.source);
    if (!hasYt && meta.type === 'movie') {
      const hit = await AppleTrailer.find(meta);
      if (hit) { AppleTrailer.play(hit, meta, () => toast('No official trailer is listed for this title', 'err')); return; }
    }
    if (meta.type === 'movie') fbMeta = meta;
    const t = (meta.trailerStreams || [])[0] || ((meta.trailers || [])[0] && { ytId: meta.trailers[0].source });
    if (!t || !t.ytId) { toast('No official trailer is listed for this title', 'err'); return; }
    openTrailer(t.ytId);
  };
  const pb = secById('playback');
  if (pb) {
    const rows = pb.rows;
    pb.rows = () => rows().filter((x) => x.key !== 'appleTrailers').concat([{ key: 'trailerSource', label: 'Trailer source', help: 'Which official trailer plays first. If it has none for a title, or it will not play, the other one plays instead. Apple has trailers for films; series use YouTube.', type: 'select', options: [['apple', 'Apple TV first, then YouTube'], ['youtube', 'YouTube first, then Apple TV']], get: () => CFG.trailerSource || 'apple' }]);
  }
}
