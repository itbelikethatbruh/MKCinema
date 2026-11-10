
'use strict';
/* =====================================================================
   Your Picks: on-device recommendations, the taste quick-pick, voice search
   and the first-visit walkthrough. Nothing here calls an outside AI service:
   picks come from your choices, your library and the catalogs of the addons you installed.
   ===================================================================== */
const PICK_GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War'];
const Taste = {
  get() { return Store.get('taste', null) || { picks: [], genres: [] }; },
  set(t) { Store.set('taste', { ...t, at: Date.now() }); },
  ready() { const t = this.get(); return t.picks.length + t.genres.length >= 3; },
  clear() { Store.set('taste', null); },
};

/* ---------------- Recommendation engine ---------------- */
const Recs = {
  cache: null,
  /* Genre weights from the quick pick (strongest), then what you watched and saved */
  profile() {
    const t = Taste.get(), w = {}, add = (g, k) => { if (g) w[g] = (w[g] || 0) + k; };
    t.genres.forEach((g) => add(g, 3));
    t.picks.forEach((m) => (m.genres || []).forEach((g) => add(g, 2)));
    S.watchlist.forEach((m) => genresOf(m).forEach((g) => add(g, 1)));
    Object.values(S.progress).forEach((p) => (p.genres || []).forEach((g) => add(g, 1.5)));
    return w;
  },
  topGenres(w, n = 4) { return Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g); },
  seen() {
    const t = Taste.get();
    return new Set([...t.picks.map((m) => m.id), ...S.watchlist.map((m) => m.id), ...Object.values(S.progress).map((p) => p.metaId)]);
  },
  /* Popular catalogs, filtered by your top genres when the addon supports it */
  async candidates(genres, types = ['movie', 'series']) {
    const out = new Map(), jobs = [];
    for (const type of types) {
      const cats = engine.catalogs({ type }).filter((c) => !c.required.length || c.genreRequired);
      const withGenre = cats.filter((c) => c.extras.some((e) => e.name === 'genre')).slice(0, 2);
      withGenre.forEach((c) => genres.forEach((g) => { if (!c.genres.length || c.genres.includes(g)) jobs.push(engine.fetchCatalog(c, { genre: g })); }));
      cats.filter((c) => !c.genreRequired).slice(0, 2).forEach((c) => jobs.push(engine.fetchCatalog(c)));
    }
    (await Promise.allSettled(jobs)).forEach((r) => { if (r.status === 'fulfilled') r.value.forEach((m) => { if (!out.has(m.id)) out.set(m.id, m); }); });
    return [...out.values()];
  },
  score(m, w) {
    const gs = genresOf(m); if (!gs.length) return 0;
    const fit = gs.reduce((a, g) => a + (w[g] || 0), 0) / Math.sqrt(gs.length);
    const rating = Number(m.imdbRating) || 6.5;
    return fit + (rating - 6.5) * .9;
  },
  because(m) {
    const t = Taste.get(), gs = new Set(genresOf(m));
    let best = null, bestN = 0;
    for (const p of t.picks) { const n = (p.genres || []).filter((g) => gs.has(g)).length; if (n > bestN) { best = p; bestN = n; } }
    if (best && bestN >= 2) return `Because you picked ${best.name}`;
    const liked = [...gs].filter((g) => t.genres.includes(g) || (best && (best.genres || []).includes(g)));
    return liked.length ? `Because you like ${liked.slice(0, 2).join(' · ')}` : [yearOf(m), genresOf(m)[0]].filter(Boolean).join(' · ');
  },
  async forYou({ force = false } = {}) {
    if (!force && this.cache && Date.now() - this.cache.at < 10 * 60e3) return this.cache.list;
    const w = this.profile(), seen = this.seen();
    const list = (await this.candidates(this.topGenres(w)))
      .filter((m) => !seen.has(m.id))
      .map((m) => ({ m, s: this.score(m, w) })).sort((a, b) => b.s - a.s).slice(0, 30).map((x) => x.m);
    this.cache = { at: Date.now(), list };
    return list;
  },

  /* "Ask": understand a plain-language request on the device. Keywords map to genres, "like X" borrows X's genres,
     and words for type, era and rating narrow the list. */
  WORDS: {
    Comedy: /\b(funny|comed|laugh|hilarious|sitcom|light-?hearted|feel[- ]good)/, Horror: /\b(horror|scary|scare|creepy|terrify|haunt|ghost|slasher|zombie)/,
    'Sci-Fi': /\b(sci-?fi|science fiction|space|alien|future|futuristic|robot|time travel|cyberpunk|dystop)/, Thriller: /\b(thrill|suspense|tense|edge of)/,
    Romance: /\b(romanc|romantic|love story|date night)/, Action: /\b(action|explosion|fight|martial|heist|car chase|shoot)/, Crime: /\b(crime|detective|mafia|gangster|heist|cop|murder|true crime)/,
    Mystery: /\b(mystery|whodunit|twist|puzzle|mind-?bend)/, Animation: /\b(anim|cartoon|pixar|anime)/, Family: /\b(family|kids?|children)/,
    Documentary: /\b(documentar|docu|real story|true story)/, Fantasy: /\b(fantasy|magic|dragon|wizard|myth)/, Drama: /\b(drama|emotional|moving|tearjerker)/,
    History: /\b(histor|period piece|ancient|medieval)/, War: /\b(war|military|soldier|ww(1|2|i|ii))/, Adventure: /\b(adventure|quest|journey|epic)/,
  },
  parse(q) {
    const s = ` ${q.toLowerCase()} `, genres = [];
    for (const [g, re] of Object.entries(this.WORDS)) if (re.test(s)) genres.push(g);
    const type = /\b(show|series|tv|episodes?|season)/.test(s) ? 'series' : /\b(movie|film)/.test(s) ? 'movie' : null;
    const dec = s.match(/\b(19[2-9]0|20[0-2]0)s\b|\b([2-9]0)s\b/); let from = null, to = null;
    if (dec) { const d = dec[1] ? Number(dec[1]) : 1900 + Number(dec[2]); from = d; to = d + 9; }
    if (/\b(new|recent|latest|this year)\b/.test(s)) { from = new Date().getFullYear() - 3; to = null; }
    if (/\b(classic|old)\b/.test(s)) { to = 1995; }
    const like = (q.match(/\blike\s+(.+?)(?:\s+but\b|[,.!?]|$)/i) || [])[1];
    return { genres, type, from, to, like: like && like.trim(), best: /\b(best|top|highly rated|acclaimed|masterpiece)/.test(s) };
  },
  async ask(q) {
    const p = this.parse(q); let anchor = null;
    if (p.like) {
      const res = await engine.search(p.like); const hits = res.flatMap((r) => r.metas);
      anchor = hits.find((m) => m.name && m.name.toLowerCase() === p.like.toLowerCase()) || hits[0] || null;
      if (anchor) genresOf(anchor).forEach((g) => { if (!p.genres.includes(g)) p.genres.push(g); });
    }
    const w = {}; p.genres.forEach((g, i) => { w[g] = 4 - Math.min(i, 2); });
    if (!p.genres.length) Object.assign(w, this.profile());
    const types = p.type ? [p.type] : anchor ? [anchor.type] : ['movie', 'series'];
    const seen = this.seen(); if (anchor) seen.add(anchor.id);
    let list = (await this.candidates(this.topGenres(w, 3), types)).filter((m) => !seen.has(m.id));
    const yr = (m) => parseInt(String(m.releaseInfo || m.year || ''), 10);
    if (p.from) list = list.filter((m) => yr(m) >= p.from); if (p.to) list = list.filter((m) => yr(m) <= p.to);
    const need = p.genres.slice(0, 2);
    list = list.map((m) => { const gs = genresOf(m); const all = need.every((g) => gs.includes(g)); return { m, s: this.score(m, w) + (all ? 3 : 0) + (p.best ? (Number(m.imdbRating) || 0) : 0) }; })
      .sort((a, b) => b.s - a.s).slice(0, 24).map((x) => x.m);
    const why = (m) => { const shared = anchor ? genresOf(m).filter((g) => genresOf(anchor).includes(g)).slice(0, 2) : []; return shared.length ? `Shares ${shared.join(' · ')} with ${anchor.name}` : whyGenres(m); };
    const whyGenres = (m) => [genresOf(m).filter((g) => p.genres.includes(g)).slice(0, 2).join(' · '), yearOf(m), m.imdbRating ? `IMDb ${m.imdbRating}` : ''].filter(Boolean).join(' · ');
    return { list, why, parsed: p, anchor };
  },
};
const looksLikeAsk = (q) => /\b(recommend|suggest|something|anything|like|similar|in the mood|want to watch|what should|give me|funny|scary)\b/i.test(q) && q.trim().split(/\s+/).length >= 3;

/* ---------------- "For you" row on Home ---------------- */
async function renderForYouRow(rows) {
  const sec = rowShell('For you', Taste.ready() ? 'Your Picks · made on this device' : '', { id: 'forYouRow' });
  rows.appendChild(sec);
  const head = sec.querySelector('.row-head');
  head.insertAdjacentHTML('beforeend', `<div class="fy-tools"><button class="btn btn-ghost btn-sm" type="button" data-fy-ask data-nav><i data-lucide="sparkles"></i>Ask</button>${Taste.ready() ? '<button class="btn btn-ghost btn-sm" type="button" data-fy-tune data-nav><i data-lucide="sliders-horizontal"></i>Tune</button>' : ''}</div>`);
  sec.querySelector('[data-fy-ask]').onclick = () => openPalette('', { ask: true });
  const tune = sec.querySelector('[data-fy-tune]'); if (tune) tune.onclick = () => openQuickPick();
  if (!Taste.ready()) {
    fillRail(sec, `<div class="fy-cta"><div class="fy-orb"><i data-lucide="sparkles"></i></div><div><b>Picks made for you</b><p>Choose at least 3 shows, movies or genres you love. MKCinema builds this row from them, right on your device.</p></div><button class="btn btn-prime" type="button" data-fy-start data-nav><i data-lucide="wand-sparkles"></i>Pick my favorites</button></div>`);
    sec.querySelector('[data-fy-start]').onclick = () => openQuickPick(); return;
  }
  try {
    const list = await Recs.forYou();
    fillRail(sec, list.map((m) => cardHTML(m, { sub: Recs.because(m) })).join(''), 'Install a catalog addon to get picks.');
  } catch (e) { fillRail(sec, '', 'Could not build picks right now.'); }
}

/* ---------------- Quick pick ---------------- */
const QP = { sel: new Map(), genres: new Set(), pool: [], onDone: null };
async function quickPickHTML(root, { compact = false } = {}) {
  const t = Taste.get(); QP.sel = new Map(t.picks.map((m) => [m.id, m])); QP.genres = new Set(t.genres);
  root.innerHTML = `<div class="qp">
    <div class="qp-genres">${PICK_GENRES.map((g) => `<button type="button" class="qp-g ${QP.genres.has(g) ? 'on' : ''}" data-g="${esc(g)}" data-nav>${esc(g)}</button>`).join('')}</div>
    <div class="qp-search"><i data-lucide="search"></i><input id="qpSearch" placeholder="Find a show or movie you love" autocomplete="off" spellcheck="false">${Voice.ok ? '<button type="button" class="qp-mic" data-voice-for="qpSearch" aria-label="Search by voice"><i data-lucide="mic"></i></button>' : ''}</div>
    <div class="qp-grid${compact ? ' compact' : ''}" id="qpGrid">${skeletons(12)}</div>
    <div class="qp-foot"><span class="qp-count" id="qpCount"></span><button class="btn btn-prime" type="button" id="qpDone" data-nav><i data-lucide="check"></i>Build my picks</button></div>
  </div>`;
  icons(); bindVoice(root);
  $$('.qp-g', root).forEach((b) => b.addEventListener('click', () => { const g = b.dataset.g; QP.genres.has(g) ? QP.genres.delete(g) : QP.genres.add(g); b.classList.toggle('on'); qpCount(); }));
  const grid = $('#qpGrid', root);
  const paint = (list) => {
    grid.innerHTML = list.slice(0, compact ? 18 : 30).map((m) => `<button type="button" class="qp-t ${QP.sel.has(m.id) ? 'on' : ''}" data-id="${esc(m.id)}" data-nav aria-pressed="${QP.sel.has(m.id)}">${imgTag(metaPoster(m), m.name, m.id)}<span>${esc(m.name)}</span><i class="qp-ck"><i data-lucide="check"></i></i></button>`).join('') || '<p class="qp-empty">No titles found. Install a catalog addon, or pick genres above.</p>';
    icons();
    $$('.qp-t', grid).forEach((b) => b.addEventListener('click', () => {
      const m = list.find((x) => x.id === b.dataset.id); if (!m) return;
      if (QP.sel.has(m.id)) QP.sel.delete(m.id); else QP.sel.set(m.id, { id: m.id, type: m.type, name: m.name, genres: genresOf(m), poster: metaPoster(m) });
      b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on')); qpCount();
    }));
  };
  if (!QP.pool.length) {
    const cats = [...engine.catalogs({ type: 'movie' }).slice(0, 1), ...engine.catalogs({ type: 'series' }).slice(0, 1)];
    const lists = (await Promise.allSettled(cats.map((c) => engine.fetchCatalog(c)))).filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const mixed = []; for (let i = 0; i < 40; i++) lists.forEach((l) => { if (l[i]) mixed.push(l[i]); });
    QP.pool = mixed;
  }
  const chosen = [...QP.sel.values()];
  paint([...chosen, ...QP.pool.filter((m) => !QP.sel.has(m.id))]);
  let tok = 0;
  $('#qpSearch', root).addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim(), my = ++tok;
    if (q.length < 2) { paint([...QP.sel.values(), ...QP.pool.filter((m) => !QP.sel.has(m.id))]); return; }
    const res = await engine.search(q); if (my !== tok) return;
    const seen = new Set(); paint(res.flatMap((r) => r.metas).filter((m) => (m.type === 'movie' || m.type === 'series') && !seen.has(m.id) && seen.add(m.id)));
  }, 300));
  $('#qpDone', root).onclick = () => {
    Taste.set({ picks: [...QP.sel.values()], genres: [...QP.genres] }); Recs.cache = null;
    toast('Your picks are ready on Home', 'ok'); if (QP.onDone) QP.onDone();
  };
  qpCount();
}
function qpCount() {
  const n = QP.sel.size + QP.genres.size, el = $('#qpCount'); if (!el) return;
  el.innerHTML = n >= 3 ? `<i data-lucide="check-circle-2"></i>${n} picked` : `Pick <b>${3 - n}</b> more`;
  el.classList.toggle('ok', n >= 3); $('#qpDone').disabled = n < 3; icons();
}
function openQuickPick() {
  const el = openLayer('tastePick');
  QP.onDone = () => { closeLayer('tastePick'); if (S.view === 'home') renderHome(); };
  quickPickHTML($('#tasteBody'));
  el.scrollTop = 0;
}

/* ---------------- Ask results ---------------- */
async function showAsk(q) {
  const el = openLayer('askLayer');
  $('#askTitle').textContent = `“${q}”`; $('#askSub').textContent = 'Finding picks…'; $('#askGrid').innerHTML = skeletons(10);
  try {
    const { list, why, parsed, anchor } = await Recs.ask(q);
    const bits = [anchor ? `like ${anchor.name}` : '', parsed.genres.slice(0, 3).join(', '), parsed.type === 'series' ? 'series' : parsed.type === 'movie' ? 'movies' : '', parsed.from ? `${parsed.from}${parsed.to ? `–${parsed.to}` : '+'}` : parsed.to ? `before ${parsed.to}` : ''].filter(Boolean);
    $('#askSub').textContent = list.length ? `Your Picks understood: ${bits.join(' · ') || 'your taste'}` : 'Nothing matched. Try different words, or name a title you like ("something like Arrival").';
    $('#askGrid').innerHTML = list.map((m) => cardHTML(m, { sub: why(m) })).join(''); icons();
  } catch (e) { $('#askSub').textContent = `Could not search right now (${e.message}).`; $('#askGrid').innerHTML = ''; }
  el.scrollTop = 0;
}

/* ---------------- Voice search (Web Speech API) ---------------- */
const Voice = {
  Rec: window.SpeechRecognition || window.webkitSpeechRecognition,
  /* MKCinema for Android / TV 1.2+: the app hands speech to the system recognizer (WebViews have no Web Speech) */
  native: () => !!(window.MKAndroid && typeof window.MKAndroid.voice === 'function'),
  get ok() { return this.native() || !!this.Rec; },
  active: null, pending: null,
  start(input, btn) {
    if (!input) return;
    if (this.native()) { this.nativeStart(input, btn); return; }
    if (this.active) { this.active.stop(); return; }
    const r = new this.Rec(); this.active = r;
    r.lang = navigator.language || 'en-US'; r.interimResults = true; r.maxAlternatives = 1;
    btn.classList.add('live'); const before = input.placeholder; input.placeholder = 'Listening…';
    r.onresult = (e) => { const txt = Array.from(e.results).map((x) => x[0].transcript).join(''); input.value = txt; input.dispatchEvent(new Event('input', { bubbles: true })); };
    r.onerror = (e) => { toast(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access is blocked for this site. Allow it in the browser settings.' : e.error === 'no-speech' ? 'Didn’t catch that. Try again.' : `Voice search stopped (${e.error}).`, 'err'); };
    r.onend = () => { btn.classList.remove('live'); input.placeholder = before; this.active = null; if (input.id === 'palInput' && looksLikeAsk(input.value)) { closePalette(); showAsk(input.value.trim()); } };
    try { r.start(); } catch (e) { btn.classList.remove('live'); this.active = null; toast('Voice search could not start here', 'err'); }
  },
  nativeStart(input, btn) {
    if (this.pending) { try { MKAndroid.voiceStop(); } catch (e) { /* older app */ } this.nativeDone(null, 'cancelled'); return; }
    this.pending = { input, btn, before: input.placeholder };
    if (btn) btn.classList.add('live'); input.placeholder = 'Listening…';
    let ok = false; try { ok = MKAndroid.voice(navigator.language || 'en-US'); } catch (e) { ok = false; }
    if (!ok) this.nativeDone(null, 'unavailable');
  },
  /* called by the Android app: partial text while you speak */
  nativePartial(text) { const p = this.pending; if (p && text) p.input.value = text; },
  /* called by the Android app with the final text, or an error: cancelled, nomatch, denied, unavailable, error */
  nativeDone(text, err) {
    const p = this.pending; this.pending = null; if (!p) return;
    if (p.btn) p.btn.classList.remove('live'); p.input.placeholder = p.before;
    if (text) {
      p.input.value = text; p.input.dispatchEvent(new Event('input', { bubbles: true }));
      if (p.input.id === 'palInput' && looksLikeAsk(text)) { closePalette(); showAsk(text.trim()); }
      return;
    }
    if (err === 'unavailable') { toast('This TV doesn’t offer voice input to apps. Type with the on-screen keyboard instead; on many TVs its mic key works.', 'info', 7000); p.input.focus(); }
    else if (err === 'denied') toast('MKCinema needs the microphone. Allow it in your TV’s Settings › Apps › MKCinema › Permissions.', 'err', 7000);
    else if (err === 'nomatch') toast('Didn’t catch that. Try again.', 'err');
    else if (err && err !== 'cancelled') toast('Voice search stopped. Try again.', 'err');
  },
};
window.MKVoice = Voice;
/* the remote's search / mic key (Android app 1.2+) */
window.MKVoiceSearch = () => { if ($('#palette').hidden) openPalette(); setTimeout(() => { if (Voice.ok) Voice.start($('#palInput'), $('#palMic')); }, 120); return true; };
function bindVoice(root) { $$('[data-voice-for]', root).forEach((b) => { b.onclick = (e) => { e.preventDefault(); Voice.start($(`#${b.dataset.voiceFor}`), b); }; }); }

/* ---------------- First-visit walkthrough ---------------- */
const TOUR = [
  { id: 'welcome', html: () => `<div class="tw">
      <div class="tw-mark">${$('.brand svg.mk').outerHTML}</div>
      <span class="tw-kicker">Welcome to</span>
      <h2 class="tw-name">MKCinema</h2>
      <p class="tw-tag">Tomorrow’s cinema. For the whole house.</p>
      <span class="tw-rule"></span>
      <p class="tw-lede">Everything you watch, in one place: a player made for films, a seat for everyone, watch parties and a phone remote, on every screen in the house. You bring the sources, from the addons you trust to the services you already pay for.</p>
      <div class="tw-pillars">${[['Everyone', 'A seat for every person'], ['Every screen', 'Phone, tablet, PC and TV'], ['Private', 'No ads. No cookies, no profiles.']].map(([k, t]) => `<div><small>${k}</small><b>${t}</b></div>`).join('')}</div>
      <p class="tw-free">Free forever. Nothing to pay, now or later.</p>
    </div>` },
  { id: 'features', html: () => `<div class="tw-sec"><span class="tw-kicker">What’s inside</span><h2 class="tw-h">Made for movie night</h2><ol class="tw-list tw-short">${[
    ['Smart Play', 'Picks the best source and switches if one stalls.'],
    ['Watch party', 'Watch in sync with friends, with voice chat.'],
    ['Phone remote', 'Scan a code and your phone runs the TV.'],
    ['Follows you', 'Sign in once and everything syncs.'],
  ].map(([t, d], k) => `<li style="--k:${k}"><em>${String(k + 1).padStart(2, '0')}</em><div><b>${t}</b><small>${d}</small></div></li>`).join('')}</ol></div>` },
  { id: 'why', html: () => `<div class="tw-sec"><span class="tw-kicker">Why MKCinema</span><h2 class="tw-h">Built differently</h2><div class="tw-cmp"><div class="tw-ch"><span></span><b>MKCinema</b><b>Typical streaming app</b></div>${[
    ['What you can watch', 'Every addon you choose', 'One company’s library'],
    ['Price', 'Free forever', 'A monthly plan'],
    ['If a stream stalls', 'The next source takes over', 'You wait for it to buffer'],
    ['Watching together', 'Built in, with voice chat', 'Often missing'],
  ].map(([k, a, b], n) => `<div class="tw-cr" style="--k:${n}"><span>${k}</span><b>${a}</b><em>${b}</em></div>`).join('')}</div><p class="tour-note">Addons and debrid services are your own choice and may have their own costs.</p></div>` },
  { id: 'taste', html: () => '<span class="eyebrow">Make it yours</span><h2 class="tour-h">Pick at least 3 favorites</h2><p class="tour-sub">Shows, movies or genres. Your "For you" row is built from these, on this device.</p><div id="tourPick"></div>', after: () => { QP.onDone = () => tourGo(1); quickPickHTML($('#tourPick'), { compact: true }); } },
  { id: 'ready', html: () => `<div class="tour-hero tw tw-end"><span class="tw-kicker">You’re set</span><h2 class="tw-name">Enjoy the show</h2><span class="tw-rule"></span><p>New to this? <b>Get started</b> walks you through VLC, a debrid key and your first addons in about five minutes. ${Voice.ok ? 'Tap the <b>mic</b> in search to search by voice. ' : ''}You can replay this tour from Settings › Your Picks.</p><div class="actions" style="justify-content:center"><button class="btn btn-prime" type="button" data-tour-guide><i data-lucide="compass"></i>Get started</button><button class="btn btn-ghost" type="button" data-tour-addons><i data-lucide="puzzle"></i>Add addons</button><button class="btn btn-ghost" type="button" data-tour-end>Start watching</button></div></div>` },
];
let tourIdx = 0;
function openTour(start = 0) { openLayer('tour'); tourIdx = start; renderTour(); }
function tourGo(d) { tourIdx = clamp(tourIdx + d, 0, TOUR.length - 1); renderTour(); }
function endTour() { Store.set('toured', true); closeLayer('tour'); if (S.view === 'home') renderHome(); }
function renderTour() {
  const step = TOUR[tourIdx], body = $('#tourBody');
  body.innerHTML = `<div class="tour-step" data-step="${step.id}">${step.html()}</div>`;
  $('#tourDots').innerHTML = TOUR.map((_, i) => `<i class="${i === tourIdx ? 'on' : i < tourIdx ? 'done' : ''}"></i>`).join('');
  $('#tourBack').style.visibility = tourIdx ? 'visible' : 'hidden';
  $('#tourNext').hidden = step.id === 'ready';
  $('#tourNext').innerHTML = step.id === 'taste' ? 'Skip for now<i data-lucide="chevron-right"></i>' : 'Next<i data-lucide="chevron-right"></i>';
  icons(); if (step.after) step.after();
  const a = $('[data-tour-addons]', body); if (a) a.onclick = () => { endTour(); $('#openAddons').click(); };
  const e = $('[data-tour-end]', body); if (e) e.onclick = endTour;
  const g = $('[data-tour-guide]', body); if (g) g.onclick = () => { endTour(); openSettings('start'); };
  /* tour-simple-2.31.1 */ body.style.overflowY = 'hidden'; $('#tour .modal').scrollTop = 0; body.scrollTop = 0;
  requestAnimationFrame(() => { body.scrollTop = 0; body.style.overflowY = ''; tourMore(); }); setTimeout(() => { body.scrollTop = 0; tourMore(); }, 120); tourMore();
  if (IS_TV) { const a = document.activeElement; if (!a || a === document.body || a.hidden || !a.isConnected || a.closest('[hidden]') || a.style.visibility === 'hidden') { if (a && a.blur) a.blur(); $$('.nav-focus').forEach((x) => x.classList.remove('nav-focus')); Nav.settle(); } }
}
$('#tourNext').onclick = () => tourGo(1);
/* 2.13.1: a step taller than the panel fades at the bottom until it is scrolled to the end */
function tourMore() { const b = $('#tourBody'); if (b) b.classList.toggle('more', !b.querySelector('.qp-foot') && b.scrollTop + b.clientHeight < b.scrollHeight - 4); }
$('#tourBody').addEventListener('scroll', tourMore, { passive: true }); addEventListener('resize', tourMore);
$('#tourBack').onclick = () => tourGo(-1);
$('#tourSkip').onclick = endTour;
if (Voice.ok) bindVoice($('#palette')); else $('#palMic').hidden = true;
$('#askAgain').onclick = () => { closeLayer('askLayer'); openPalette('', { ask: true }); };
/* Show the tour once, after the intro, on a visitor's first visit */
function maybeTour() {
  if (Store.get('toured', false)) return;
  let n = 0;
  const wait = () => (document.body.classList.contains('intro-on') ? setTimeout(wait, 400) : setTimeout(() => {
    if (Store.get('toured', false) || !$('#tour').hidden) return;
    if ([...MENU_LAYERS, 'player'].every((x) => $(`#${x}`).hidden)) openTour(0); else if (n++ < 90) wait();
  }, 700));
  wait();
}

/* ---------------- Import from Stremio ----------------
   Signs in to the Stremio API once, reads the library, watch progress and installed addons, then signs that session out.
   The password goes only to Stremio (or through this site's MKCinema server when the browser blocks the direct call) and is never saved. */
const StremioImport = {
  async call(method, body) {
    const opts = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    const read = async (r) => { const j = await r.json().catch(() => ({})); if (j.error) throw new Error(j.error.message || 'Stremio refused the request'); if (!r.ok) throw new Error(`Stremio answered ${r.status}`); return j.result; };
    try { return await read(await fetch(`https://api.strem.io/api/${method}`, opts)); }
    catch (e) {
      if (!(e instanceof TypeError)) throw e; // a real Stremio error, not a blocked request
      const relays = [/^https?:$/.test(location.protocol) ? location.origin : '', String(S.proxy || '').replace(/\/+$/, '')].filter(Boolean);
      // a host without the relay (404, Cloudflare's 405, or a web page instead of JSON) is skipped
      for (const base of [...new Set(relays)]) {
        let r; try { r = await fetch(`${base}/stremio-api/${method}`, opts); } catch (e2) { if (e2 instanceof TypeError) continue; throw e2; }
        if (r.status === 404 || r.status === 405 || !/json/i.test(r.headers.get('content-type') || '')) continue;
        return read(r);
      }
      throw new Error('Your browser blocked the request to Stremio. Open MKCinema through mkcinema-server.js and try again.');
    }
  },
  /* Stremio stores a series' watched episodes as "anchorVideoId:anchorLength:base64(zlib(bits))", one bit per episode
     with episodes sorted by season, episode, then release date (stremio-core, stremio-watched-bitfield). */
  async seenEpisodes(it) {
    const parts = String((it.state || {}).watched || '').split(':'); if (parts.length < 3) return [];
    const b64 = parts.pop(), len = Number(parts.pop()), anchor = parts.join(':');
    const zipped = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bits = new Uint8Array(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const meta = await engine.fetchMeta('series', it._id);
    const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? -Infinity : Number(v));
    const cmp = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
    const ids = ((meta && meta.videos) || []).filter((v) => v && v.id)
      .sort((a, b) => cmp(num(a.season), num(b.season)) || cmp(num(a.episode), num(b.episode)) || cmp(num(Date.parse(a.released)), num(Date.parse(b.released))))
      .map((v) => v.id);
    const at = ids.indexOf(anchor); if (at < 0 || !(len > 0)) return [];
    const off = len - at - 1;
    return ids.filter((id, i) => { const k = i + off; return k >= 0 && (k >> 3) < bits.length && (bits[k >> 3] >> (k % 8)) & 1; });
  },
  async run(email, password, { library, progress, addons, seen }) {
    const login = await this.call('login', { type: 'Login', email, password, facebook: false });
    const authKey = login && login.authKey; if (!authKey) throw new Error('Stremio did not return a session');
    const out = { saved: 0, progress: 0, watched: 0, addons: 0, skippedAddons: 0 };
    try {
      if (library || progress || seen) {
        const items = (await this.call('datastoreGet', { authKey, collection: 'libraryItem', ids: [], all: true })) || [];
        const seenJobs = [];
        for (const it of items) {
          if (!it || !it._id) continue;
          const type = it.type === 'series' ? 'series' : it.type === 'movie' ? 'movie' : null; if (!type) continue;
          const st = it.state || {};
          if (seen) {
            const w = watchedMap(), when = Date.parse(st.lastWatched) || Date.now();
            const mark = (id) => { if (!w[id]) { w[id] = when; out.watched++; } };
            if (type === 'movie' && (st.timesWatched > 0 || st.flaggedWatched > 0)) mark(it._id);
            if (type === 'series' && st.watched) seenJobs.push(() => this.seenEpisodes(it).then((ids) => ids.forEach(mark)).catch(() => {}));
          }
          if (library && !it.temp && !it.removed && !S.watchlist.some((m) => m.id === it._id)) {
            S.watchlist.push({ id: it._id, type, name: it.name, poster: it.poster || metaPoster({ id: it._id }), background: null, releaseInfo: '', genres: [], imdbRating: '' }); out.saved++;
          }
          const t = (st.timeOffset || 0) / 1000, d = (st.duration || 0) / 1000;
          if (progress && t > 30 && d > 60 && t / d < .95) {
            const vid = st.video_id || it._id, parts = String(vid).split(':');
            const prev = S.progress[vid];
            const at = Date.parse(st.lastWatched) || Date.now();
            if (!prev || prev.at < at) {
              S.progress[vid] = { videoId: vid, metaId: it._id, type, name: it.name, poster: it.poster || metaPoster({ id: it._id }), background: null, genres: [],
                season: type === 'series' && parts.length === 3 ? Number(parts[1]) : undefined, episode: type === 'series' && parts.length === 3 ? Number(parts[2]) : undefined, t, d, at, imported: 'stremio' };
              out.progress++;
            }
          }
        }
        // series need their episode lists, so these run four at a time
        await Promise.all(Array.from({ length: 4 }, async () => { while (seenJobs.length) await seenJobs.shift()(); }));
        Store.set('watchlist', S.watchlist); Store.set('progress', S.progress); if (seen) Store.set('watched', watchedMap());
      }
      if (addons) {
        const col = await this.call('addonCollectionGet', { type: 'AddonCollectionGet', authKey, update: true });
        const have = new Set(engine.addons.map((a) => a.baseUrl.replace(/\/manifest\.json$/, '')));
        for (const a of (col && col.addons) || []) {
          const url = a && a.transportUrl; if (!url || !/^https?:/.test(url)) continue;
          const base = url.replace(/\/manifest\.json$/, '');
          if (have.has(base) || (a.flags && a.flags.protected)) { out.skippedAddons++; continue; }
          try { await engine.install(url, { silent: true }); out.addons++; have.add(base); } catch (e) { out.skippedAddons++; }
        }
      }
    } finally { this.call('logout', { type: 'Logout', authKey }).catch(() => {}); }
    return out;
  },
};
function openStremioImport() {
  const el = openLayer('stremioImport');
  $('#siForm').hidden = false; $('#siDone').hidden = true; $('#siPass').value = ''; $('#siErr').hidden = true;
  setTimeout(() => $('#siEmail').focus(), 50); el.scrollTop = 0;
}
$('#siForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#siEmail').value.trim(), password = $('#siPass').value, btn = $('#siGo');
  if (!email || !password) return;
  btn.disabled = true; btn.innerHTML = '<i data-lucide="loader"></i>Importing…'; icons(); $('#siErr').hidden = true;
  try {
    const r = await StremioImport.run(email, password, { library: $('#siLib').checked, progress: $('#siProg').checked, seen: $('#siSeen').checked, addons: $('#siAdd').checked });
    $('#siPass').value = '';
    $('#siForm').hidden = true; $('#siDone').hidden = false;
    $('#siSummary').innerHTML = [[r.saved, 'titles added to your library'], [r.progress, 'items in progress'], [r.watched, 'films and episodes marked watched'], [r.addons, 'addons installed']].map(([n, l]) => `<div><b class="tnum">${n}</b><span>${l}</span></div>`).join('');
    $('#siNote').textContent = r.skippedAddons ? `${r.skippedAddons} addon${r.skippedAddons === 1 ? ' was' : 's were'} already installed or built into Stremio, so ${r.skippedAddons === 1 ? 'it was' : 'they were'} skipped.` : '';
    Recs.cache = null; if (S.view === 'home') renderHome(); if (S.view === 'library') renderLibrary();
  } catch (err) {
    $('#siErr').hidden = false; $('#siErr').textContent = /passw|user|email|not found|wrong/i.test(err.message) ? 'Stremio did not accept that email and password.' : err.message;
  } finally { btn.disabled = false; btn.innerHTML = '<i data-lucide="download"></i>Import'; icons(); }
});
$('#siClose').onclick = () => closeLayer('stremioImport');
