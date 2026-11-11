
'use strict';
/* =====================================================================
   MKCinema · application: views, detail, player, studio, navigation, boot
   ===================================================================== */
const CINEMETA = 'https://v3-cinemeta.strem.io/manifest.json';
const OPENSUBS = 'https://opensubtitles-v3.strem.io/manifest.json';
const SUGGESTED = [
  { name: 'Cinemeta', url: CINEMETA },
  { name: 'OpenSubtitles v3', url: 'https://opensubtitles-v3.strem.io/manifest.json' },
  { name: 'Local MKCinema server', url: 'http://127.0.0.1:7000/manifest.json' },
  { name: 'Local Studio export', url: 'http://127.0.0.1:7001/manifest.json' },
];
const LANGS = { eng: 'English', en: 'English', spa: 'Spanish', es: 'Spanish', fre: 'French', fra: 'French', fr: 'French', ger: 'German', deu: 'German', de: 'German', ita: 'Italian', it: 'Italian', por: 'Portuguese', pob: 'Portuguese (BR)', pt: 'Portuguese', rus: 'Russian', ru: 'Russian', jpn: 'Japanese', ja: 'Japanese', kor: 'Korean', ko: 'Korean', chi: 'Chinese', zho: 'Chinese', zh: 'Chinese', ara: 'Arabic', ar: 'Arabic', hin: 'Hindi', dut: 'Dutch', nld: 'Dutch', nl: 'Dutch', pol: 'Polish', pl: 'Polish', tur: 'Turkish', tr: 'Turkish', swe: 'Swedish', nor: 'Norwegian', dan: 'Danish', fin: 'Finnish', gre: 'Greek', ell: 'Greek', heb: 'Hebrew', cze: 'Czech', ces: 'Czech', hun: 'Hungarian', rum: 'Romanian', ron: 'Romanian', vie: 'Vietnamese', tha: 'Thai', ind: 'Indonesian', ukr: 'Ukrainian', bul: 'Bulgarian', hrv: 'Croatian', srp: 'Serbian' };

const engine = new StremioEngine();
const S = {
  view: 'home',
  wall: Store.get('wall', false),
  proxy: Store.get('proxy', 'http://127.0.0.1:7000'),
  watchlist: Store.get('watchlist', []).filter((m) => m && typeof m === 'object' && m.id),
  progress: Store.get('progress', {}),
  studio: (() => { const st = Store.get('studio', null); return st && !(st.items || []).some((i) => /^studio:(night-relay|harbor-lights)$/.test(i.id)) ? st : STUDIO_DEFAULT(); })(),
  metas: new Map(),
  hero: [], heroIdx: 0, heroTimer: null,
  disc: { type: 'movie', cat: 0, genre: '', skip: 0, done: false, loading: false, token: 0 },
  tvFilter: '',
};
const remember = (m) => { if (m && m.id) S.metas.set(m.id, { ...(S.metas.get(m.id) || {}), ...m }); return m; };
const metaPoster = (m) => m.poster || (String(m.id).startsWith('tt') ? `https://images.metahub.space/poster/medium/${m.id}/img` : null);
const metaBg = (m) => m.background || (String(m.id).startsWith('tt') ? `https://images.metahub.space/background/medium/${m.id}/img` : null);
const metaLogo = (m) => m.logo || (String(m.id).startsWith('tt') ? `https://images.metahub.space/logo/medium/${m.id}/img` : null);
const yearOf = (m) => String(m.releaseInfo || m.year || '').slice(0, 9);
const genresOf = (m) => (m.genres || m.genre || []).filter(Boolean);

/* =====================================================================
   Cards
   ===================================================================== */
// Rating colour: green for great, gold for good, coral for weak
function rateTier(r) { const n = parseFloat(r); return !(n > 0) ? 'r-na' : n >= 7.5 ? 'r-hi' : n >= 6 ? 'r-mid' : 'r-lo'; }
function cardHTML(m, { wide = false, progress = null, sub = '' } = {}) {
  remember(m);
  const q = engine.qualityCache.get(m.id);
  const rp = !wide && Ratings.poster(m);
  const cw = wide && !(progress && progress.thumb) && CustomPoster.url(m, 'landscape');
  const art = rp || cw;
  const poster = wide ? (progress && progress.thumb) || cw || metaBg(m) || metaPoster(m) : rp || metaPoster(m);
  const pct = progress && progress.d ? clamp(progress.t / progress.d * 100, 0, 100) : 0;
  return `<div class="card${wide ? ' wide' : ''}" tabindex="0" role="button" data-nav data-card data-id="${esc(m.id)}" data-type="${esc(m.type)}"${progress ? ` data-video="${esc(progress.videoId)}"` : ''} aria-label="${esc(m.name)}">
    <div class="card-inner">
      <div class="layer l0">${imgTag(poster, m.name, m.id, { wide, alt: rp ? metaPoster(m) || '' : cw ? metaBg(m) || metaPoster(m) || '' : '' })}</div>
      <div class="layer l1"></div>
      <div class="layer l2">
        ${q ? `<span class="badge-q">${esc(q)}</span>` : ''}${CFG.ratingBadges && !art && m.imdbRating ? `<span class="badge-r ${rateTier(m.imdbRating)}"><i><svg class="st-ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4l-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z"/></svg></i>${esc(m.imdbRating)}</span>` : ''}
        <button class="orb" type="button" data-quickplay tabindex="-1" aria-label="Play ${esc(m.name)}"><i data-lucide="play"></i></button>
        <div class="info">
          <div class="pills">${m.imdbRating && !(CFG.ratingBadges && !art) ? `<span class="imdb ${rateTier(m.imdbRating)}"><b>IMDb</b>${esc(m.imdbRating)}</span>` : ''}${yearOf(m) ? `<span class="pill">${esc(yearOf(m))}</span>` : ''}${genresOf(m).slice(0, 1).map((g) => `<span class="pill">${esc(g)}</span>`).join('')}</div>
          <div class="card-title">${esc(m.name)}</div>
        </div>
        ${progress ? `<div class="prog"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}
      </div>
    </div>
    ${sub ? `<div class="card-sub">${esc(sub)}</div>` : !wide && cardInfoMode() === 'below' ? `<div class="card-sub"><b>${esc(m.name)}</b>${[esc([yearOf(m), genresOf(m)[0]].filter(Boolean).join(' · ')), m.imdbRating ? `<span class="rt ${rateTier(m.imdbRating)}"><svg class="st-ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4l-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z"/></svg> ${esc(m.imdbRating)}</span>` : ''].filter(Boolean).join(' · ')}</div>` : ''}
  </div>`;
}
const skeletons = (n) => Array.from({ length: n }, () => '<div class="skeleton"></div>').join('');

document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-card]'); if (!card) return;
 
  const m = S.metas.get(card.dataset.id) || { id: card.dataset.id, type: card.dataset.type, name: card.getAttribute('aria-label') };
  if (card.dataset.video) { resume(card.dataset.video); return; }
  if (e.target.closest('[data-quickplay]')) quickPlay(m); else openDetail(m);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-card]')) { e.preventDefault(); e.target.click(); }
});

/* Curved IMAX wall geometry */
let wallRaf = 0;
function updateWall() {
  wallRaf = 0; if (!S.wall) return;
  const vh = innerHeight;
  $$('.view.on .rail').forEach((rail) => {
    const rr = rail.getBoundingClientRect(); if (rr.bottom < -200 || rr.top > vh + 200) return;
    const row = rail.closest('.row'); if (row) row.style.setProperty('--rowx', `${clamp(((rr.top + rr.height / 2) - vh / 2) / vh * 18, -14, 14).toFixed(2)}deg`);
    const cx = rr.left + rr.width / 2, half = rr.width / 2;
    for (const c of rail.children) {
      const r = c.getBoundingClientRect(), o = clamp(((r.left + r.width / 2) - cx) / half, -1.4, 1.4);
      c.style.setProperty('--arcy', `${(-o * 26).toFixed(2)}deg`);
      c.style.setProperty('--arcz', `${(o * o * 80).toFixed(1)}px`);
    }
  });
}
const queueWall = () => { if (S.wall && !wallRaf) wallRaf = requestAnimationFrame(updateWall); };
document.addEventListener('scroll', queueWall, { capture: true, passive: true });
addEventListener('resize', queueWall);
function setWall(on) {
  // the curved wall is desktop only: touch screens keep flat rails (and keep a desktop choice saved for that device)
  if (TOUCH_UI) { S.wall = false; document.body.classList.remove('wall'); return; }
  S.wall = on; Store.set('wall', on); document.body.classList.toggle('wall', on);
  $('#vWall').classList.toggle('on', on); $('#vRails').classList.toggle('on', !on);
  if (!on) $$('.rail>.card, .row').forEach((c) => { c.style.removeProperty('--arcy'); c.style.removeProperty('--arcz'); c.style.removeProperty('--rowx'); });
  queueWall();
}

/* =====================================================================
   Rows
   ===================================================================== */
function rowShell(title, sub, { more = null, id = '' } = {}) {
  const sec = document.createElement('section'); sec.className = 'row'; if (id) sec.id = id;
  sec.innerHTML = `<div class="row-head"><h2 class="row-title">${esc(title)}${sub ? ` <small>${esc(sub)}</small>` : ''}</h2>${more ? `<button class="row-more" type="button" data-nav>See all<i data-lucide="chevron-right"></i></button>` : ''}</div><div class="rail">${skeletons(8)}</div>`;
  if (more) sec.querySelector('.row-more').addEventListener('click', more);
  return sec;
}
function fillRail(sec, html, empty = 'Nothing here yet.') {
  const rail = sec.querySelector('.rail'); rail.innerHTML = html || `<div class="rail-empty">${esc(empty)}</div>`; icons(); queueWall();
}
function continueItems() { return Object.values(S.progress).sort((a, b) => b.at - a.at); }
function progressSub(p) {
  const left = Math.max(0, p.d - p.t);
  return `${p.season != null && p.type === 'series' ? `S${p.season} · E${p.episode} · ` : ''}${fmtTime(left)} left`;
}
async function renderHome() {
  const rows = $('#homeRows'); rows.innerHTML = '';
  const cw = Layout.shows('cw') ? continueItems() : [];
  if (cw.length) {
    const sec = rowShell('Continue watching', `${cw.length} in progress`, { id: 'cwRow' }); rows.appendChild(sec);
    fillRail(sec, cw.slice(0, 20).map((p) => cardHTML({ id: p.metaId, type: p.type, name: p.type === 'series' ? `${p.name}` : p.name, poster: p.poster, background: p.background, genres: p.genres }, { wide: true, progress: p, sub: progressSub(p) })).join(''));
  }
  if (Layout.shows('picks')) renderForYouRow(rows);
  if (S.watchlist.length && Layout.shows('watchlist')) {
    const sec = rowShell('My watchlist', `${S.watchlist.length} saved`, { more: () => go('library') }); sec.dataset.rk = 'watchlist'; rows.appendChild(sec);
    fillRail(sec, S.watchlist.slice(0, 30).map((m) => cardHTML(m)).join(''));
  }
  // Settings › Home: movies or series first (or only), and whether addon catalogs show at all
  const lay = Layout.get();
  const cats = Layout.shows('catalogs') ? Layout.catalogs(engine.catalogs().filter((c) => c.type !== 'tv' && (lay.traktLists || !Layout.traktList(c)) && (typeof AddonUI === 'undefined' || AddonUI.place(c) === 'home'))).slice(0, 16) : [];
  let heroSet = false;
  if (!cats.length && Layout.shows('catalogs')) rows.insertAdjacentHTML('beforeend', `<div class="empty-state"><i data-lucide="${engine.offline ? 'cloud-off' : 'library'}"></i><h3>${engine.offline ? 'Cinemeta is unreachable' : 'No catalogs installed'}</h3><p>${engine.offline ? 'MKCinema has no titles of its own. Once Cinemeta answers, your catalogs appear here.' : 'Open the addon manager to add a catalog addon.'}</p></div>`);
  await Promise.allSettled(cats.map(async (cat, i) => {
    const sec = rowShell(cat.name, `${cat.type} · ${cat.addon.manifest.name}`, { more: () => openCatalog(cat) }); sec.dataset.rk = `cat:${cat.addon.manifest.id}/${cat.type}/${cat.id}`; rows.appendChild(sec);
    try {
      const metas = await engine.fetchCatalog(cat);
      // Home only shows rows that have something in them; empty or failing catalogs stay in Discover and the addon manager
      if (!metas.length) { sec.remove(); return; }
      { const shown = IS_TV ? 24 : (typeof HomeLazy !== 'undefined' ? HomeLazy.first() : 40); const ax = typeof AddonUI === 'undefined' ? 'poster' : AddonUI.layout(cat, metas); sec._ax = ax; if (ax !== 'poster') sec.classList.add(`ax-${ax}`); fillRail(sec, metas.slice(0, shown).map((m, k) => (ax === 'poster' ? cardHTML(m) : AddonUI.card(m, ax, k))).join('')); if (typeof Endless !== 'undefined') Endless.attach(sec, cat, metas, Math.min(shown, metas.length)); }
      if (!heroSet && i <= 2) { heroSet = true; setHeroList(metas.filter((m) => m.background || m.poster).slice(0, 8)); }
    } catch (e) { sec.remove(); console.warn('Home row skipped:', cat.name, e.message); }
  }));
  $('#hero').hidden = !heroSet;
  icons(); queueWall();
}

/* =====================================================================
   Hero billboard
   ===================================================================== */
function setHeroList(list) {
  S.hero = list.map(remember); S.heroIdx = 0;
  $('#heroDots').innerHTML = S.hero.map((_, i) => `<button type="button" aria-label="Show featured ${i + 1}"></button>`).join('');
  $$('#heroDots button').forEach((b, i) => b.addEventListener('click', () => showHero(i, i < S.heroIdx ? -1 : 1)));
  showHero(0);
}
// The billboard only advances while it can be seen, so nothing repaints under an open panel or in a background tab
let TV_KEY_AT = 0; if (IS_TV) addEventListener('keydown', () => { TV_KEY_AT = performance.now(); }, true);
function nextHero() {
  if (document.hidden || document.body.classList.contains('layer-open') || document.body.classList.contains('saver-on') || S.view !== 'home' || scrollY > innerHeight || (IS_TV && performance.now() - TV_KEY_AT < 8000)) { S.heroTimer = setTimeout(nextHero, 3000); return; }
  showHero(S.heroIdx + 1, 1);
}
function showHero(i, dir = 1) {
  if (!S.hero.length) return;
  S.heroIdx = (i + S.hero.length) % S.hero.length; const m = S.hero[S.heroIdx];
  $('#hero').dataset.dir = dir < 0 ? 'p' : 'n';
  const bg = $('#heroBg'); const olds = $$('img', bg);
  bg.insertAdjacentHTML('beforeend', imgTag(metaBg(m), m.name, m.id, { wide: true, lazy: false }));
  const img = bg.lastElementChild; img.style.position = 'absolute'; img.style.inset = '0'; img.style.opacity = '0'; img.draggable = false;
  requestAnimationFrame(() => { img.style.opacity = '1'; img.classList.add('in'); });
  if (olds.length) setTimeout(() => olds.forEach((o) => o.remove()), 1000);
  const logo = metaLogo(m);
  $('#heroLogoWrap').innerHTML = `${logo ? imgTag(logo, m.name, m.id, { nofb: true, cls: 'hero-logo', lazy: false }) : ''}<h1 class="hero-title" data-logo-alt ${logo ? 'hidden' : ''}>${esc(m.name)}</h1>`;
  $('#heroMeta').innerHTML = [m.imdbRating ? `<span class="imdb ${rateTier(m.imdbRating)}"><b>IMDb</b>${esc(m.imdbRating)}</span>` : '', yearOf(m) ? `<span>${esc(yearOf(m))}</span>` : '', m.runtime ? `<span>${esc(m.runtime)}</span>` : '', (genresOf(m).length ? `<span class="hm-gs">${genresOf(m).slice(0, 3).map((g, i) => `<span class="hm-g${i}">${i ? ' · ' : ''}${esc(g)}</span>`).join('')}</span>` : ''), `<span class="tag-s">${esc(m.type)}</span>`].filter(Boolean).join('');
  $('#heroDesc').textContent = m.description || '';
  { const hb = $('#hero .hero-body'); hb.classList.remove('swap'); requestAnimationFrame(() => hb.classList.add('swap')); }
  $('#heroEyebrow').innerHTML = `<i data-lucide="flame"></i>Featured · ${esc(m._addon || 'Catalog')}`;
  $$('#heroDots button').forEach((b, k) => b.classList.toggle('on', k === S.heroIdx));
  $('#heroList').innerHTML = inWatchlist(m.id) ? '<i data-lucide="check"></i>In watchlist' : '<i data-lucide="plus"></i>Watchlist';
  icons();
  clearTimeout(S.heroTimer); S.heroTimer = setTimeout(nextHero, IS_TV ? 14000 : 9000);
}

/* =====================================================================
   Watchlist + progress
   ===================================================================== */
const inWatchlist = (id) => S.watchlist.some((m) => m.id === id);
function toggleWatchlist(m) {
  if (inWatchlist(m.id)) { S.watchlist = S.watchlist.filter((x) => x.id !== m.id); toast(`Removed ${m.name} from your watchlist`); }
  else { S.watchlist.unshift({ id: m.id, type: m.type, name: m.name, poster: metaPoster(m), background: metaBg(m), releaseInfo: yearOf(m), genres: genresOf(m).slice(0, 3), imdbRating: m.imdbRating }); toast(`Added ${m.name} to your watchlist`, 'ok'); }
  Store.set('watchlist', S.watchlist);
}
/* Finished episodes and movies (Spoiler Guard, the calendar and Trakt/Simkl use this) */
let WATCHED = null;
const watchedMap = () => WATCHED || (WATCHED = Store.get('watched', {}));
function markWatched(id) { const w = watchedMap(); if (w[id]) return; w[id] = Date.now(); Store.set('watched', w); }
const isWatched = (id) => !!watchedMap()[id];
function saveProgress(force) {
  const ctx = P.ctx, cur = pNow(), dur = pDur(); if (!ctx || !P.stream || P.stream._local || !isFinite(dur) || dur < 30) return;
  const now = Date.now(); if (!force && now - P.lastSave < 5000) return; P.lastSave = now;
  const key = ctx.video ? ctx.video.id : ctx.meta.id;
  if (cur / dur > .95) { delete S.progress[key]; markWatched(key); }
  else if (cur > 5) {
    S.progress[key] = {
      videoId: key, metaId: ctx.meta.id, type: ctx.meta.type, name: ctx.meta.name, poster: metaPoster(ctx.meta), background: metaBg(ctx.meta), genres: genresOf(ctx.meta).slice(0, 2),
      thumb: ctx.video && ctx.video.thumbnail, epTitle: ctx.video && (ctx.video.name || ctx.video.title), season: ctx.video && ctx.video.season, episode: ctx.video && ctx.video.episode,
      t: cur, d: dur, at: now, bingeGroup: P.stream.behaviorHints && P.stream.behaviorHints.bingeGroup, addon: P.stream._addon,
    };
  }
  Store.set('progress', S.progress);
}

/* =====================================================================
   Navigation between views
   ===================================================================== */
function go(view, opts = {}) {
  S.view = view;
  $$('#tabs .tab, #mtabs [data-view]').forEach((t) => t.classList.toggle('on', t.dataset.view === view));
  const id = view === 'movie' || view === 'series' ? 'discover' : view;
  $$('.view').forEach((v) => { const on = v.id === `view-${id}`; if (on) { v.classList.remove('on'); void v.offsetWidth; } v.classList.toggle('on', on); });
  scrollTo({ top: 0, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' });
  if (view === 'movie' || view === 'series') renderDiscover(view, opts);
  if (view === 'tv') renderTV();
  if (view === 'library') renderLibrary();
  if (view === 'studio') renderStudio();
  if (view === 'calendar') Calendar.render();
  if (view === 'home') queueWall();
  try { history.replaceState(null, '', `#${view}`); } catch (e) { /* sandboxed */ }
}
function openCatalog(cat) { go(cat.type === 'series' ? 'series' : 'movie', { catalog: cat }); }

/* =====================================================================
   Discover (catalog browser with genre filters + skip pagination)
   ===================================================================== */
function discoverCatalogs(type) {
  return engine.catalogs({ type, includeRequired: true }).filter((c) => !c.required.length || c.required.every((r) => r === 'genre'));
}
function renderDiscover(type, { catalog } = {}) {
  const D = S.disc; D.type = type;
  const cats = discoverCatalogs(type);
  $('#discTitle').textContent = type === 'series' ? 'Series' : 'Movies';
  $('#discSub').textContent = `${cats.length} catalog${cats.length === 1 ? '' : 's'} from your addons. Pick one, filter by genre, and keep scrolling.`;
  if (catalog) { const i = cats.findIndex((c) => c.addon === catalog.addon && c.id === catalog.id); D.cat = i < 0 ? 0 : i; D.genre = ''; }
  if (D.cat >= cats.length) D.cat = 0;
  $('#discCatalog').innerHTML = cats.map((c, i) => `<option value="${i}" ${i === D.cat ? 'selected' : ''}>${esc(c.name)} · ${esc(c.addon.manifest.name)}</option>`).join('');
  const cat = cats[D.cat];
  if (!cat) { $('#discGenres').innerHTML = ''; $('#discGrid').innerHTML = '<div class="empty">No catalogs for this type yet. Install an addon that provides one.</div>'; $('#discMore').hidden = true; return; }
  if (cat.genreRequired && !D.genre) D.genre = cat.genres[0] || '';
  $('#discGenres').innerHTML = (cat.genreRequired ? [] : [['', 'All']]).concat(cat.genres.slice(0, 60).map((g) => [g, g]))
    .map(([v, l]) => `<button class="chip ${D.genre === v ? 'on' : ''}" type="button" data-nav data-genre="${esc(v)}">${esc(l)}</button>`).join('');
  $$('#discGenres .chip').forEach((b) => b.addEventListener('click', () => { D.genre = b.dataset.genre; renderDiscover(type); }));
  D.skip = 0; D.done = false; $('#discGrid').innerHTML = skeletons(12);
  loadDiscover(cat, true);
}
async function loadDiscover(cat, fresh) {
  const D = S.disc; if (D.loading && !fresh) return; D.loading = true; const token = ++D.token;
  $('#discMore').hidden = true;
  try {
    const metas = await engine.fetchCatalog(cat, { genre: D.genre || undefined, skip: D.skip || undefined });
    if (token !== D.token) return;
    const grid = $('#discGrid'); if (fresh) grid.innerHTML = '';
    const seen = new Set($$('#discGrid [data-card]').map((c) => c.dataset.id));
    const add = metas.filter((m) => !seen.has(m.id));
    const ax = typeof AddonUI === 'undefined' ? 'poster' : AddonUI.layout(cat, metas); const gx = ax === 'landscape' || ax === 'square' ? ax : 'poster'; if (fresh || !grid.dataset.ax) grid.dataset.ax = gx; grid.insertAdjacentHTML('beforeend', add.map((m) => (gx === 'poster' ? cardHTML(m) : AddonUI.card(m, gx, 99))).join(''));
    if (fresh && !metas.length) grid.innerHTML = '<div class="empty">No titles match this filter.</div>';
    D.skip += metas.length; D.done = !metas.length || !cat.extras.some((e) => e.name === 'skip');
    $('#discMore').hidden = D.done; icons();
  } catch (e) {
    if (token === D.token) $('#discGrid').insertAdjacentHTML('beforeend', `<div class="empty">Could not load the catalog (${esc(e.message)}).</div>`);
  } finally { if (token === D.token) D.loading = false; }
}

/* =====================================================================
   Live TV + EPG
   ===================================================================== */
async function renderTV() {
  const cats = engine.catalogs({ type: 'tv' }).concat(engine.catalogs({ type: 'channel' }));
  const providers = [...new Set(cats.map((c) => c.addon))];
  $('#tvSources').innerHTML = [['', 'All sources'], ...providers.map((a) => [a.baseUrl, a.manifest.name])].map(([v, l]) => {
    const a = providers.find((p) => p.baseUrl === v); const epg = a && a.manifest.behaviorHints && a.manifest.behaviorHints.epgProvider;
    return `<button class="chip ${S.tvFilter === v ? 'on' : ''}" type="button" data-nav data-src="${esc(v)}">${esc(l)}${epg ? ` <span class="tag-s c">EPG · ${esc(epg)}</span>` : ''}</button>`;
  }).join('');
  $$('#tvSources .chip').forEach((b) => b.addEventListener('click', () => { S.tvFilter = b.dataset.src; renderTV(); }));
  const epg = $('#epg');
  if (!cats.length) {
    epg.innerHTML = `<div class="empty-state"><i data-lucide="radio-tower"></i><h3>No live TV source installed</h3><p>MKCinema does not ship any channels of its own. Live TV fills in when you install a Stremio addon that provides TV channels (catalog type "tv" or "channel").</p><button class="btn btn-prime" type="button" id="tvAddAddon"><i data-lucide="puzzle"></i>Open addons</button></div>`;
    $('#tvAddAddon').onclick = () => $('#openAddons').click(); icons(); return;
  }
  epg.innerHTML = '<div style="padding:22px" class="status-line"><span class="spin"></span>Tuning channels…</div>';
  const use = cats.filter((c) => !S.tvFilter || c.addon.baseUrl === S.tvFilter);
  const res = await Promise.allSettled(use.map((c) => engine.fetchCatalog(c)));
  let channels = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).slice(0, 60);
  channels = await Promise.all(channels.map(async (ch) => { if (ch.videos) return remember(ch); try { return remember((await engine.fetchMeta(ch.type, ch.id)) || ch); } catch (e) { return remember(ch); } }));
  const PX = 8, now = Date.now(), t0 = Math.floor((now - 30 * 60000) / (30 * 60000)) * 30 * 60000, span = 180, t1 = t0 + span * 60000;
  const x = (t) => ((t - t0) / 60000) * PX;
  const times = Array.from({ length: span / 30 }, (_, i) => `<span style="width:${30 * PX}px">${new Date(t0 + i * 30 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`).join('');
  const rows = channels.map((ch) => {
    const progs = (ch.videos || []).map((v, i, arr) => ({ title: v.title || v.name, start: +new Date(v.released), end: v._end ? +new Date(v._end) : arr[i + 1] ? +new Date(arr[i + 1].released) : +new Date(v.released) + 3600000 }))
      .filter((p) => p.end > t0 && p.start < t1);
    const blocks = (progs.length ? progs : [{ title: `Live · ${ch.name}`, start: t0, end: t1 }]).map((p) => {
      const l = Math.max(0, x(p.start)), w = Math.min(x(p.end), span * PX) - l; const on = p.start <= now && now < p.end;
      return `<button class="epg-prog ${on ? 'now' : ''}" type="button" data-nav data-ch="${esc(ch.id)}" style="left:${l}px;width:${Math.max(30, w - 4)}px"><b>${esc(p.title)}</b><small>${new Date(p.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(p.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></button>`;
    }).join('');
    return `<div class="epg-row"><button class="epg-ch" type="button" data-nav data-ch="${esc(ch.id)}">${imgTag(ch.logo || ch.poster, ch.name, ch.id)}<span><b>${esc(ch.name)}</b><small>${esc(genresOf(ch)[0] || ch._addon || '')}</small></span></button><div class="epg-track">${blocks}</div></div>`;
  }).join('');
  epg.innerHTML = channels.length ? `<div class="epg-scroll"><div class="epg-grid"><div class="epg-times">${times}</div>${rows}<div class="epg-now" style="left:${220 + x(now)}px"></div></div></div>` : '<div class="empty" style="margin:16px">The tv catalogs returned no channels.</div>';
  $$('#epg [data-ch]').forEach((b) => b.addEventListener('click', () => tuneChannel(S.metas.get(b.dataset.ch))));
  const sc = $('#epg .epg-scroll'); if (sc) sc.scrollLeft = Math.max(0, x(now) - 120);
}
async function tuneChannel(ch) {
  if (!ch) return;
  toast(`Tuning ${ch.name}…`);
  const { streams } = await engine.fetchStreams(ch.type || 'tv', ch.id);
  const best = pickBest(streams);
  if (!best) { toast(`No playable stream for ${ch.name}`, 'err'); return; }
  playStream({ meta: ch, video: null, streams }, best);
}

/* =====================================================================
   Library
   ===================================================================== */
function renderLibrary() {
  const root = $('#libRows'); root.innerHTML = '';
  const cw = continueItems();
  const a = rowShell('Continue watching', cw.length ? `${cw.length} in progress` : ''); root.appendChild(a);
  fillRail(a, cw.map((p) => cardHTML({ id: p.metaId, type: p.type, name: p.name, poster: p.poster, background: p.background, genres: p.genres }, { wide: true, progress: p, sub: progressSub(p) })).join(''), 'Start something and it will show up here with its exact timestamp.');
  if (cw.length) { const b = document.createElement('button'); b.className = 'btn btn-ghost btn-sm'; b.type = 'button'; b.innerHTML = '<i data-lucide="trash-2"></i>Clear progress'; b.style.marginTop = '8px'; b.onclick = () => { S.progress = {}; Store.set('progress', {}); renderLibrary(); }; a.appendChild(b); }
  const w = document.createElement('section'); w.className = 'row';
  w.innerHTML = `<div class="row-head"><h2 class="row-title">My watchlist <small>${S.watchlist.length} saved</small></h2></div><div class="grid">${S.watchlist.map((m) => cardHTML(m)).join('') || '<div class="empty">Use the Watchlist button on any title to save it here.</div>'}</div>`;
  root.appendChild(w); icons();
}

/* =====================================================================
   Detail view
   ===================================================================== */
const D = { meta: null, season: null, video: null, streams: [], filter: 'all', token: 0, status: null };
function seasonsOf(meta) {
  const map = new Map();
  for (const v of (meta.videos || [])) { const s = Number(v.season ?? 1); if (!map.has(s)) map.set(s, []); map.get(s).push(v); }
  for (const list of map.values()) list.sort((a, b) => (a.episode || 0) - (b.episode || 0));
  return [...map.entries()].sort((a, b) => (a[0] === 0) - (b[0] === 0) || a[0] - b[0]);
}
function orderedEpisodes(meta) { return seasonsOf(meta).filter(([s]) => s !== 0).flatMap(([, l]) => l); }
function nextVideo(meta, video) { const list = orderedEpisodes(meta); const i = list.findIndex((v) => v.id === video.id); return i >= 0 ? list[i + 1] || null : null; }
function videoIdFor(meta, v) { return v.id || StremioEngine.seriesId(meta.id, v.season, v.episode); }

const MENU_LAYERS = ['epSheet', 'detail', 'addons', 'palette', 'settings', 'tastePick', 'askLayer', 'tour', 'stremioImport', 'trailer', 'partyLayer', 'castLayer'];
/* While any layer is up, body.layer-open lets CSS stop painting the page underneath. On phones Chrome can fall behind
   rasterizing a long scrolling panel, and any tile it has not drawn yet would otherwise show the page through it. */
let layerT = 0;
function syncLayers() {
  const open = [...MENU_LAYERS, 'player'].some((x) => !$(`#${x}`).hidden), b = document.body.classList;
  b.toggle('locked', open); clearTimeout(layerT);
  // The page stops painting only once the panel has faded in over it
  if (open) layerT = setTimeout(() => b.toggle('layer-open', [...MENU_LAYERS, 'player'].some((x) => !$(`#${x}`).hidden)), 320); else b.remove('layer-open');
  if (IS_TV && typeof Nav !== 'undefined') Nav.settle();
}
function openLayer(id) { const el = $(`#${id}`); el.classList.remove('leaving'); el.hidden = false; syncLayers(); return el; }
/* A closed layer is hidden at once (all logic sees it as closed), but CSS keeps .leaving[hidden] on screen for a short fade */
function closeLayer(id) {
  if (id === 'detail') EpSheet.close();
  const el = $(`#${id}`); if (el.hidden) return;
  el.hidden = true; syncLayers();
  if (CFG.reduceMotion) return;
  el.classList.add('leaving'); clearTimeout(el._leaveT); el._leaveT = setTimeout(() => el.classList.remove('leaving'), 240);
}

/* Episode sheet: picking an episode opens its streams right there, over the list, instead of somewhere further down
   the page. It slides up from the bottom on phones and in from the right on wide screens, with Play, the previous and
   next episode, and the full source list. The page underneath keeps its scroll position. */
const EpSheet = {
  box: null,
  isOpen() { return !$('#epSheet').hidden; },
  open() {
    const m = D.meta, v = D.video; if (!m || !v) return;
    this.box = this.box || $('#esBox'); this.box.id = 'dStreams';
    this.head(); openLayer('epSheet'); $('#epSheet .ep-sheet').scrollTop = 0; renderStreamsPanel();
  },
  close() { const el = $('#epSheet'); if (!el || el.hidden) return; closeLayer('epSheet'); if (this.box) this.box.id = 'esBox'; },
  head() {
    const m = D.meta, v = D.video, id = videoIdFor(m, v), p = S.progress[id], air = v.released || v.firstAired;
    const list = orderedEpisodes(m), i = list.findIndex((x) => x.id === v.id), prev = list[i - 1], next = list[i + 1];
    const hide = Spoilers.guarded(id, false, !!p);
    const resumeAt = p && p.t > 30 && p.t / p.d < 0.95 ? p.t : 0;
    $('#esHead').innerHTML = `
      <div class="es-still${hide ? ' spoil' : ''}">${imgTag(v.thumbnail || metaBg(m), v.name || v.title || '', id, { wide: true, lazy: false })}${p ? `<div class="prog"><i style="width:${clamp(p.t / p.d * 100, 0, 100).toFixed(1)}%"></i></div>` : ''}</div>
      <div class="es-info">
        <div class="es-num">${esc(m.name)} · S${esc(v.season)} · E${esc(v.episode)}${air ? ` · ${esc(fmtDate(air))}` : ''}</div>
        <h3>${esc(v.name || v.title || `Episode ${v.episode}`)}</h3>
        ${hide ? '<p class="es-hidden">Synopsis hidden by Spoiler Guard</p>' : (v.overview || v.description) ? `<p>${esc(v.overview || v.description)}</p>` : ''}
        <div class="es-acts">
          <button class="btn btn-bolt cta" type="button" id="esPlay" data-nav><span class="cta-ring" aria-hidden="true"></span><i data-lucide="play"></i><span class="sp-l">${resumeAt ? `Resume ${fmtTime(resumeAt)}` : 'Play'}<small>Best source</small></span></button>
          <button class="ibtn es-step" type="button" id="esPrev" data-nav aria-label="Previous episode" ${prev ? '' : 'disabled'}><i data-lucide="chevron-left"></i></button>
          <button class="ibtn es-step" type="button" id="esNext" data-nav aria-label="Next episode" ${next ? '' : 'disabled'}><i data-lucide="chevron-right"></i></button>
        </div>
      </div>
      <button class="ibtn es-x" type="button" id="esClose" data-nav aria-label="Close"><i data-lucide="x"></i></button>`;
    icons();
    $('#esPlay').onclick = () => smartPlayDetail();
    $('#esClose').onclick = () => this.close();
    const go = (to) => { if (!to) return; D.video = to; D.season = Number(to.season); markEpisodes(); this.head(); loadDetailStreams(); };
    $('#esPrev').onclick = () => go(prev); $('#esNext').onclick = () => go(next);
  },
};
// Highlights the chosen episode in the list without rebuilding the page (so its scroll position stays put)
function markEpisodes() {
  if (!D.meta || !$('#dEps')) return;
  const cur = D.video ? videoIdFor(D.meta, D.video) : '';
  const shown = Number(($('#dSeasons .chip.on') || {}).dataset ? $('#dSeasons .chip.on').dataset.season : NaN);
  if (D.video && shown !== Number(D.video.season)) { renderDetail(false); return; }
  $$('#dEps [data-vid]').forEach((b) => b.classList.toggle('on', b.dataset.vid === cur));
}
$('#epSheet').addEventListener('click', (e) => { if (e.target.id === 'epSheet' || e.target.closest('.es-grab')) EpSheet.close(); });

async function openDetail(seed, { videoId } = {}) {
  remember(seed); HlsLoad.warm();
  const el = openLayer('detail'); el.scrollTop = 0;
  const token = ++D.token;
  Object.assign(D, { meta: seed, season: null, video: null, streams: [], filter: 'all', status: null });
  renderDetail.popId = null; renderDetail(true);
  let meta = seed;
  try { meta = (await engine.fetchMeta(seed.type, seed.id)) || seed; } catch (e) { toast(`Showing basic details only (${e.message})`, 'err'); }
  if (token !== D.token) return;
  meta = remember({ ...seed, ...meta }); D.meta = meta;
  if (meta.type === 'series' && meta.videos && meta.videos.length) {
    const target = videoId && meta.videos.find((v) => videoIdFor(meta, v) === videoId);
    const resumeV = !target && continueItems().find((p) => p.metaId === meta.id);
    const rv = resumeV && meta.videos.find((v) => videoIdFor(meta, v) === resumeV.videoId);
    D.video = target || rv || null;
    const ss = seasonsOf(meta); D.season = D.video ? Number(D.video.season) : (ss.find(([s]) => s !== 0) || ss[0])[0];
  }
  renderDetail(false);
  if (meta.type !== 'series' || D.video) loadDetailStreams();
  if (meta.type === 'series' && videoId && D.video) EpSheet.open();
}
function detailStreamTarget() {
  const m = D.meta;
  if (m.type === 'series') return D.video ? { type: 'series', id: videoIdFor(m, D.video) } : null;
  return { type: m.type, id: (m.behaviorHints && m.behaviorHints.defaultVideoId) || m.id };
}
async function loadDetailStreams() {
  const tgt = detailStreamTarget(); if (!tgt) return;
  const token = D.token; D.streams = []; D.status = { pending: true, answered: 0, total: 0, errors: [] };
  renderStreamsPanel();
  const r = await engine.fetchStreams(tgt.type, tgt.id, (all, info) => {
    if (token !== D.token) return; D.streams = all.slice().sort((a, b) => b._tel.score - a._tel.score);
    D.status.answered++; if (!info.ok) D.status.errors.push(`${info.addon.manifest.name}: ${info.error}`); renderStreamsPanel();
  });
  if (token !== D.token) return;
  D.streams = r.streams; D.status = { pending: false, answered: r.addons, total: r.addons, errors: r.errors.map((e) => `${e.addon.manifest.name}: ${e.error}`) };
  renderStreamsPanel();
}
/* 2.28.2: the details page draws twice (card data first, full details a moment later). The backdrop and logo that
   are already on screen are carried over to the second draw when they are the same pictures, so they never blank
   out while a new copy decodes; pictures still on their way fade in when they arrive. */
const DetailImgs = {
  SEL: '.d-hero > img.bg, .d-hero .hero-logo',
  take(panel) {
    const m = new Map();
    panel.querySelectorAll(this.SEL).forEach((im) => { if (im.dataset.osrc) m.set(`${im.classList.contains('bg') ? 'bg' : 'logo'}|${im.dataset.osrc}`, im); });
    return m;
  },
  settle(panel, keep) {
    panel.querySelectorAll(this.SEL).forEach((im) => {
      const src = im.getAttribute('src') || ''; im.dataset.osrc = src;
      const old = keep.get(`${im.classList.contains('bg') ? 'bg' : 'logo'}|${src}`);
      if (old && old !== im) {
        im.replaceWith(old);
        // a logo that failed earlier stays hidden, and its title text shows in its place
        if (old.hidden) { const alt = old.nextElementSibling; if (alt && alt.hasAttribute('data-logo-alt')) alt.hidden = false; }
        return;
      }
      if (im.complete && im.naturalWidth) return;
      im.classList.add('d-wait');
      const done = () => im.classList.remove('d-wait');
      im.addEventListener('load', done, { once: true }); im.addEventListener('error', done, { once: true });
      setTimeout(done, 6000);
    });
  },
};
function renderDetail(loading) {
  const m = D.meta, panel = $('#detailPanel');
  const logo = metaLogo(m);
  const cast = m.cast || (m.links || []).filter((l) => l.category === 'Cast').map((l) => l.name);
  const directors = m.director || (m.links || []).filter((l) => l.category === 'Directors').map((l) => l.name);
  const writers = m.writer || (m.links || []).filter((l) => l.category === 'Writers').map((l) => l.name);
  const seasons = m.type === 'series' ? seasonsOf(m) : [];
  // the title pops out in 3D when the page opens; later re-renders (full details arriving, spoiler toggle, season switch)
  // pick the animation up where it is, through --t0, so it never restarts or jumps
  if (renderDetail.popId !== m.id) { renderDetail.popId = m.id; renderDetail.popAt = performance.now(); }
  const t0 = ((performance.now() - renderDetail.popAt) / 1000).toFixed(3);
  const keepImgs = DetailImgs.take(panel);
  panel.innerHTML = `
    <button class="ibtn panel-close" type="button" data-close aria-label="Close"><i data-lucide="x"></i></button>
    <div class="d-hero">
      ${imgTag(metaBg(m), m.name, m.id, { wide: true, cls: 'bg', lazy: false })}
      <div class="d-body" style="padding-top:80px;width:100%">
        <div class="logo3d pop${logo ? ' has-logo' : ''}" style="--t0:${t0}s${logo ? `;--logo:url(&quot;${esc(logo)}&quot;)` : ''}">${logo ? imgTag(logo, m.name, m.id, { nofb: true, cls: 'hero-logo', lazy: false }) : ''}<h1 class="hero-title" data-logo-alt ${logo ? 'hidden' : ''}>${esc(m.name)}</h1>${logo ? '<span class="lg-sheen" aria-hidden="true"><i></i></span>' : ''}</div>
        <div class="metaline${loading ? ' ml-wait' : ''}">${[m.imdbRating ? `<span class="imdb ${rateTier(m.imdbRating)}"><b>IMDb</b>${esc(m.imdbRating)}</span>` : '', yearOf(m) ? `<span>${esc(yearOf(m))}</span>` : '', m.runtime ? `<span>${esc(m.runtime)}</span>` : '', genresOf(m).slice(0, 4).map(esc).join(' · '), `<span class="tag-s">${esc(m.type)}</span>`, m._addon ? `<span class="tag-s v">${esc(m._addon)}</span>` : ''].filter(Boolean).join('')}</div>
        <div class="actions">
          <button class="btn btn-bolt cta" type="button" id="dSmart" data-nav><span class="cta-ring" aria-hidden="true"></span><i data-lucide="play"></i><span class="sp-l">Smart Play<small>Best stream, picked for you</small></span></button>
          <button class="btn btn-ghost" type="button" id="dTrailer" data-nav><i data-lucide="clapperboard"></i>Trailer</button>
          <button class="btn btn-ghost" type="button" id="dList" data-nav>${inWatchlist(m.id) ? '<i data-lucide="check"></i>In watchlist' : '<i data-lucide="plus"></i>Watchlist'}</button>
          ${m.imdb_id || String(m.id).startsWith('tt') ? `<a class="btn btn-ghost" data-nav href="https://www.imdb.com/title/${esc(m.imdb_id || String(m.id).split(':')[0])}/" target="_blank" rel="noopener"><i data-lucide="external-link"></i>IMDb</a>` : ''}
        </div>
      </div>
    </div>
    <div class="d-body">
      <div class="d-grid${seasons.length ? ' solo' : ''}">
        <div style="min-width:0">
          ${loading ? '<div class="status-line"><span class="spin"></span>Loading full details…</div>' : ''}
          <p class="d-desc">${esc(m.description || 'No synopsis available.')}</p>
          <div class="credits">${directors && directors.length ? `<b>Director</b><span>${esc(directors.slice(0, 3).join(', '))}</span>` : ''}${writers && writers.length ? `<b>Writers</b><span>${esc(writers.slice(0, 3).join(', '))}</span>` : ''}${cast && cast.length ? `<b>Cast</b><span>${esc(cast.slice(0, 8).join(', '))}</span>` : ''}${m.country ? `<b>Country</b><span>${esc(m.country)}</span>` : ''}${m.awards ? `<b>Awards</b><span>${esc(m.awards)}</span>` : ''}</div>
          ${seasons.length ? `<h3 class="sec-title"><i data-lucide="list-video"></i>Episodes<button class="chip sg-chip ${CFG.spoilerGuard ? 'on' : ''}" type="button" id="dSpoil" data-nav title="Blur episodes you have not watched"><i data-lucide="${CFG.spoilerGuard ? 'eye-off' : 'eye'}"></i>Spoiler Guard</button></h3>
            <div class="seasons" id="dSeasons">${seasons.map(([s, l]) => `<button class="chip ${s === D.season ? 'on' : ''}" type="button" data-nav data-season="${s}">${s === 0 ? 'Specials' : `Season ${s}`} <span class="tag-s">${l.length}</span></button>`).join('')}</div>
            <div class="eps" id="dEps">${episodesHTML(m, D.season, D.video)}</div>` : ''}
        </div>
        ${seasons.length ? '' : `<div style="min-width:0">
          <h3 class="sec-title"><i data-lucide="layers"></i>Streams <small class="mono" style="color:var(--dim);font-weight:400;font-size:calc(11px * var(--ts,1))" id="dStreamFor"></small></h3>
          <div id="dStreams"></div>
        </div>`}
      </div>
    </div>`;
  DetailImgs.settle(panel, keepImgs);
  icons();
  panel.querySelector('[data-close]').onclick = () => { closeLayer('detail'); };
  $('#dSmart').onclick = () => smartPlayDetail();
  const sg = $('#dSpoil'); if (sg) sg.onclick = () => { setCfg('spoilerGuard', !CFG.spoilerGuard); renderDetail(false); $$('#toasts .toast').forEach((t) => { if (/^Spoiler Guard/.test(t.dataset.msg || '')) t.remove(); }); toast(CFG.spoilerGuard ? 'Spoiler Guard on: unwatched episodes are hidden' : 'Spoiler Guard off', 'info', 2200); };
  Ratings.critics(m);
  $('#dTrailer').onclick = () => playTrailer(m);
  $('#dList').onclick = () => { toggleWatchlist(m); renderDetail(false); renderStreamsPanel(); };
  $$('#dSeasons [data-season]').forEach((b) => b.addEventListener('click', () => { D.season = Number(b.dataset.season); renderDetail(false); renderStreamsPanel(); }));
  bindEpisodes($('#dEps'), m, (v) => { D.video = v; D.season = Number(v.season); markEpisodes(); EpSheet.open(); loadDetailStreams(); });
  renderStreamsPanel();
}
function episodesHTML(meta, season, cur) {
  const list = (seasonsOf(meta).find(([s]) => s === season) || [0, []])[1];
  return list.map((v) => {
    const id = videoIdFor(meta, v), p = S.progress[id];
    const air = v.released || v.firstAired;
    const spoil = Spoilers.guarded(id, cur && cur.id === v.id, !!p);
    return `<button class="ep ${cur && cur.id === v.id ? 'on' : ''}${spoil ? ' spoil' : ''}" type="button" data-nav data-vid="${esc(id)}">
      <div class="th">${imgTag(v.thumbnail, v.name || v.title || `Episode ${v.episode}`, id, { wide: true })}${p ? `<div class="prog"><i style="width:${clamp(p.t / p.d * 100, 0, 100).toFixed(1)}%"></i></div>` : ''}${spoil ? '<span class="reveal" data-reveal role="button" tabindex="0" aria-label="Reveal episode"><i data-lucide="eye"></i>Reveal</span>' : ''}${isWatched(id) ? '<span class="seen" title="Watched"><i data-lucide="check"></i></span>' : ''}</div>
      <div style="min-width:0"><div class="num">S${esc(v.season)} · E${esc(v.episode)}${air ? ` · ${fmtDate(air)}` : ''}</div><h4>${esc(v.name || v.title || `Episode ${v.episode}`)}</h4><p>${esc(v.overview || v.description || '')}</p></div>
    </button>`;
  }).join('') || '<div class="empty">No episodes listed for this season.</div>';
}
function bindEpisodes(root, meta, onPick) {
  if (!root) return;
  $$('[data-vid]', root).forEach((b) => b.addEventListener('click', (e) => {
    if (e.target.closest('[data-reveal]') || (b.classList.contains('spoil') && e.target.closest('p'))) { e.stopPropagation(); Spoilers.reveal(b.dataset.vid); b.classList.remove('spoil'); const r = $('[data-reveal]', b); if (r) r.remove(); return; }
    const v = meta.videos.find((x) => videoIdFor(meta, x) === b.dataset.vid); if (v) onPick(v);
  }));
}
/* Browser only mode (Settings › Playback, off by default): for people who cannot install VLC or another player.
   Only sources this browser can play with picture and sound are listed. It reads the release name, so a badly
   labelled file can still slip through; the automatic source switch then moves on to the next one. */
/* 2.66.2 Dolby Vision as HDR10: profiles 7, 8.1 and 8.4 carry an HDR10 or HLG picture that any HEVC decoder shows.
   Profile 5 (most "DV" only web releases) has no such layer, so only devices that decode Dolby Vision get it. */
const DvBase = {
  native() { return BrowserPlay.can('video/mp4; codecs="dvh1.05.06"') || BrowserPlay.can('video/mp4; codecs="dvh1.08.06"'); },
  layer(T) {
    const rest = String(T || '').toLowerCase().replace(/dolby[\s.-]?vision|\bdovi\b|\bdv\b/g, ' ');
    return /\bhdr(10)?\+?|\bhdr10plus\b|\bhlg\b/.test(rest) || /\b(remux|bd-?remux|blu-?ray|uhd[\s.-]?bd|bd50|bd66|bd100)\b/.test(rest);
  },
  ok(T) {
    if (this.native()) return true;
    return this.layer(T) && (BrowserPlay.can('video/mp4; codecs="hvc1.2.4.L153.B0"') || BrowserPlay.can('video/mp4; codecs="hvc1.2.4.L120.90"'));
  },
};
const BrowserPlay = {
  cache: {},
  can(type) {
    if (!(type in this.cache)) { let ok = false; try { ok = (window.MediaSource && MediaSource.isTypeSupported(type)) || document.createElement('video').canPlayType(type) === 'probably'; } catch (e) { /* no media support */ } this.cache[type] = !!ok; }
    return this.cache[type];
  },
  // audio the browser cannot decode is fine when your MKCinema server can convert it (audio rescue)
  rescue() {
    if (typeof Rescue === 'undefined') return false;
    if (!Rescue.server && !this.asked) { this.asked = true; Rescue.caps().then((ok) => { if (ok && CFG.browserOnly && $('#dStreams')) renderStreamsPanel(); }); }
    return !!(Rescue.server && Rescue.server.remux);
  },
  ok(s) {
    const t = s._tel, bh = s.behaviorHints || {};
    if (t.isTrailer || t.kind === 'yt') return true;
    if (t.kind === 'ext' || t.kind === 'none') return false;
    if (t.kind === 'p2p' ? !t.debrid : !t.webReady) return false;   // a torrent needs your debrid service to become a web link
    const T = [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' ').toLowerCase();
    if (t.codec === 'HEVC' && !this.can('video/mp4; codecs="hvc1.1.6.L120.90"')) return false;
    if (t.codec === 'AV1' && !this.can('video/mp4; codecs="av01.0.08M.08"')) return false;
    if (t.hdr === 'Dolby Vision' && !DvBase.ok(T)) return false;
    if (t.codec !== 'HEVC' && t.codec !== 'AV1' && /\b(10[\s.-]?bit|hi10p?)\b/.test(T)) return false;
    const dolby = /\b(e-?ac-?3|ddp\d?|dd\+|ac-?3|dd[\s.]?[257][\s.]?[01]|dolby digital)\b/.test(T) || /atmos/.test(T);
    const hard = /truehd|\bdts/.test(T) || (dolby && !this.can('audio/mp4; codecs="ec-3"'));
    if (hard && !this.rescue()) return false;
    // MKV files rarely say when their sound is browser friendly; keep only those that do
    if (t.mkv && !/\b(aac|opus|mp3|flac|vorbis)\b/.test(T) && !this.rescue()) return false;
    return true;
  },
};
/* Audio language: a release that only names other languages (Torrentio's flags, ITA, FRENCH, LATINO, HINDI…) is a dub.
   Untagged releases are usually the original English audio, and MULTi or Dual releases keep the original track, so both stay. */
const AudioPref = {
  FLAG: { GB: 'eng', US: 'eng', IT: 'ita', FR: 'fre', ES: 'spa', MX: 'spa', DE: 'ger', RU: 'rus', PT: 'por', BR: 'por', KR: 'kor', JP: 'jpn', CN: 'chi', TW: 'chi', HK: 'chi', IN: 'hin', NL: 'dut', PL: 'pol', CZ: 'cze', HU: 'hun', TR: 'tur', UA: 'ukr', SA: 'ara', TH: 'tha', BG: 'bul', HR: 'hrv', GR: 'gre', SE: 'swe', DK: 'dan', NO: 'nor', FI: 'fin', RO: 'rum', IL: 'heb', VN: 'vie', ID: 'ind' },
  WORD: [[/\b(eng|english)\b/, 'eng'], [/\b(ita|italian|italiano)\b/, 'ita'], [/\b(french|truefrench|vff|vfq|vfi|vf2?)\b/, 'fre'], [/\b(spa|spanish|castellano|espanol|esp|lat|latino)\b/, 'spa'],
    [/\b(ger|german|deutsch)\b/, 'ger'], [/\b(rus|russian)\b/, 'rus'], [/\b(hin|hindi)\b/, 'hin'], [/\b(tam|tamil)\b/, 'tam'], [/\b(tel|telugu)\b/, 'tel'], [/\b(kor|korean)\b/, 'kor'],
    [/\b(jpn|japanese)\b/, 'jpn'], [/\b(por|portuguese|dublado)\b/, 'por'], [/\b(polish|lektor)\b/, 'pol'], [/\b(turkish)\b/, 'tur'], [/\b(arabic)\b/, 'ara']],
  langs(s) {
    const bh = s.behaviorHints || {}, text = [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' ');
    // the film's own name never counts ("The Italian Job" is not a dub); each title word is skipped once, so a later ITALIAN tag still does
    const own = [D.meta, P.ctx && P.ctx.meta].filter(Boolean).flatMap((m) => String(m.name || '').toLowerCase().split(/[^a-z0-9]+/)).filter((w) => w.length > 2);
    const strip = (part) => { const left = new Set(own); return String(part).toLowerCase().replace(/[._\-\[\]()+/|]/g, ' ').split(/\s+/).filter((w) => !left.delete(w)).join(' '); };
    const out = new Set(), T = [s.name, s.title, s.description, bh.filename].filter(Boolean).map(strip).join(' ');
    for (const m of text.matchAll(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/gu)) { const cc = String.fromCharCode(m[1].codePointAt(0) - 0x1F1E6 + 65, m[2].codePointAt(0) - 0x1F1E6 + 65); out.add(this.FLAG[cc] || cc.toLowerCase()); }
    if (/🇬🇧|🏴/u.test(text)) out.add('eng');
    this.WORD.forEach(([re, l]) => { if (re.test(T)) out.add(l); });
    return { langs: out, multi: /\b(multi|multi audio|dual|dual audio)\b/.test(T) };
  },
  ok(s) {
    const want = CFG.audioOnly; if (!want || want === 'any' || !s._tel || s._tel.isTrailer || s._tel.kind === 'yt') return true;
    const { langs, multi } = this.langs(s);
    return !langs.size || langs.has(want) || multi || (!!CFG.srAudio && CFG.srAudio !== 'any' && langs.has(CFG.srAudio));
  },
};
function visibleStreams(streams) {
  return streams.filter((s) => !(CFG.hideP2P && s._tel.kind === 'p2p') && !(!CFG.showTrailers && s._tel.isTrailer) && (!CFG.browserOnly || BrowserPlay.ok(s)) && AudioPref.ok(s));
}
const pickBest = (streams, opts) => engine.pickBest(visibleStreams(streams), opts);
function filterStreams(streams, f) {
  streams = visibleStreams(streams);
  if (f === '4k') return streams.filter((s) => s._tel.res === '4K UHD');
  if (f === 'web') return streams.filter((s) => s._tel.webReady);
  if (f === 'cached') return streams.filter((s) => s._tel.cached === true);
  if (f.startsWith('addon:')) return streams.filter((s) => s._addon === f.slice(6));
  return streams;
}
function filterChips(streams, cur) {
  const addons = [...new Set(visibleStreams(streams).map((s) => s._addon))];
  const opts = [['all', 'All', filterStreams(streams, 'all').length], ['4k', '4K UHD', filterStreams(streams, '4k').length], ['web', 'Instant Web-Ready', filterStreams(streams, 'web').length], ...(filterStreams(streams, 'cached').length ? [['cached', 'Cached', filterStreams(streams, 'cached').length]] : []), ...addons.map((a) => [`addon:${a}`, a, filterStreams(streams, `addon:${a}`).length])];
  return opts.map(([v, l, n]) => `<button class="chip ${cur === v ? 'on' : ''}" type="button" data-nav data-filter="${esc(v)}">${esc(l)} <span class="tag-s">${n}</span></button>`).join('');
}
// Release names read like titles ("Project Hail Mary 2026 IMAX …"): dots and underscores become spaces,
// except in channel counts such as 7.1 or DDP5.1 and in H.264 / H.265
const prettyRelease = (n) => String(n).replace(/[._]/g, (m, i, x) => /(^|\D)\d$/.test(x.slice(0, i)) && /^\d(\D|$)/.test(x.slice(i + 1)) ? m : ' ').replace(/\bH (26[45])\b/g, 'H.$1').replace(/\s{2,}/g, ' ').trim();
// Addon lines that only repeat what the tags already say (👤 seeds, 💾 size, ⚙️ tracker) are dropped
const STAT_LINE = /[\u{1F464}\u{1F4BE}\u{2699}\u{1F465}\u{1F4E6}\u{1F310}]/u;
function streamRowHTML(s, idx, { best, current } = {}) {
  const t = s._tel;
  const headline = t.lines[0] || t.headline || 'Stream';
  const tracker = (t.lines.join(' ').match(/\u{2699}\u{FE0F}?\s*([^\n\u{1F464}\u{1F4BE}]+)/u) || [])[1];
  const rest = t.lines.slice(1).filter((l) => !STAT_LINE.test(l)).slice(0, 2).join('\n');
  const icon = t.kind === 'p2p' || t.kind === 'ext' ? 'external-link' : t.kind === 'yt' ? 'youtube' : 'play';
  const meta = [t.codec, t.size, t.seeds ? `${t.seeds} peers` : '', tracker && tracker.trim(), s._addon].filter(Boolean);
  return `<button class="stream ${best ? 'best' : ''} ${current ? 'cur' : ''}" type="button" data-nav data-si="${idx}" title="${esc(headline)}">
    <div class="s-main">${best ? '<span class="s-best"><i data-lucide="zap"></i>Best match</span>' : ''}<div class="t1">${esc(prettyRelease(headline))}</div><div class="tele">${Telemetry.badges(s, t, '', true)}</div>${meta.length ? `<div class="s-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</div>` : ''}${rest ? `<div class="t2">${esc(rest)}</div>` : ''}</div>
    <span class="go"><i data-lucide="${icon}"></i></span></button>`;
}
function renderStreamsPanel() {
  const box = $('#dStreams'); if (!box) return;
  const tgt = detailStreamTarget();
  const sf = $('#dStreamFor'); if (sf) sf.textContent = D.video ? `S${D.video.season} · E${D.video.episode}` : '';
  if (!tgt) { box.innerHTML = '<div class="empty">Pick an episode to see its streams, or press Smart Play to start from the first unwatched one.</div>'; return; }
  const st = D.status || { pending: true, answered: 0, total: 0, errors: [] };
  const total = engine.addons.filter((a) => engine.supports(a, 'stream', tgt.type, tgt.id)).length;
  const list = filterStreams(D.streams, D.filter), best = pickBest(D.streams);
  box.innerHTML = `
    <div class="status-line">${st.pending ? '<span class="spin"></span>' : '<i data-lucide="radar"></i>'}<span>${st.pending ? `Asking ${total} addon${total === 1 ? '' : 's'} in parallel · ${st.answered} answered` : `${total} addon${total === 1 ? '' : 's'} answered`} · ${D.streams.length} stream${D.streams.length === 1 ? '' : 's'}</span></div>
    ${CFG.browserOnly && D.streams.length ? `<div class="status-line bo-line"><i data-lucide="globe"></i><span>Only sources that play here: ${D.streams.length - visibleStreams(D.streams).length} source${D.streams.length - visibleStreams(D.streams).length === 1 ? '' : 's'} that need VLC or another player are hidden. Change it in Settings › Playback.</span></div>` : ''}
    ${(() => { const n = D.streams.filter((x) => !AudioPref.ok(x)).length; return n ? `<div class="status-line bo-line"><i data-lucide="languages"></i><span>${n} source${n === 1 ? '' : 's'} dubbed in other languages ${n === 1 ? 'is' : 'are'} hidden (only ${esc(langName(CFG.audioOnly))} audio). Change it in Settings › Playback.</span></div>` : ''; })()}
    ${st.errors.length ? `<div class="status-line" style="color:var(--bad)"><i data-lucide="alert-triangle"></i><span>${esc(st.errors.slice(0, 3).join(' · '))}</span></div>` : ''}
    <div class="chips" style="margin-bottom:10px">${filterChips(D.streams, D.filter)}</div>
    <div class="streams">${list.map((s) => streamRowHTML(s, D.streams.indexOf(s), { best: s === best })).join('') || (st.pending ? skeletons(0) + '<div class="empty">Waiting for addons…</div>' : '<div class="empty">No streams for this filter. Install more stream addons from the addon manager.<button type="button" class="linkish" data-nav data-trouble="nostreams">Why no streams?</button></div>')}</div>`;
  icons();
  $$('[data-filter]', box).forEach((b) => b.addEventListener('click', () => { D.filter = b.dataset.filter; renderStreamsPanel(); }));
  $$('[data-si]', box).forEach((b) => b.addEventListener('click', () => { playStream({ meta: D.meta, video: D.video, streams: D.streams }, D.streams[Number(b.dataset.si)]); }));
}
async function smartPlayDetail() {
  const m = D.meta;
  if (m.type === 'series' && !D.video) {
    const eps = orderedEpisodes(m); if (!eps.length) { toast('This series lists no episodes yet', 'err'); return; }
    const resumeP = continueItems().find((p) => p.metaId === m.id);
    D.video = (resumeP && m.videos.find((v) => videoIdFor(m, v) === resumeP.videoId)) || eps.find((v) => !S.progress[videoIdFor(m, v)]) || eps[0];
    D.season = Number(D.video.season); renderDetail(false);
  }
  if (!D.streams.length || (D.status && D.status.pending)) await loadDetailStreams();
  const best = pickBest(D.streams);
  if (!best) { toast('No browser-playable stream yet. Pick a source to hand off to an external player.', 'err'); return; }
  playStream({ meta: D.meta, video: D.video, streams: D.streams }, best);
}
async function quickPlay(seed) {}
async function resume(videoId) {
  const p = S.progress[videoId]; if (!p) return;
  let meta = { id: p.metaId, type: p.type, name: p.name, poster: p.poster };
  try { meta = remember({ ...meta, ...((await engine.fetchMeta(p.type, p.metaId)) || {}) }); } catch (e) { /* keep saved data */ }
  const video = p.type === 'series' && meta.videos ? meta.videos.find((v) => videoIdFor(meta, v) === videoId) || null : null;
  const { streams } = await engine.fetchStreams(p.type, videoId);
  const pick = pickBest(streams, { bingeGroup: p.bingeGroup });
  if (!pick) { openDetail(meta, { videoId }); return; }
  playStream({ meta, video, streams }, pick, { startAt: p.t });
}
async function playTrailer(meta) {
  const t = (meta.trailerStreams || [])[0] || ((meta.trailers || [])[0] && { ytId: meta.trailers[0].source, title: meta.name });
  if (!t || !t.ytId) { toast('No official trailer is listed for this title', 'err'); return; }
  openTrailer(t.ytId);
}

/* =====================================================================
   Trailer pop-up. YouTube's own controls are switched off (controls=0) and driven through the official
   IFrame API, so the pop-up shows the picture plus a slim bar: play/pause, seek, time, mute, full screen.
   YouTube may still show its own branding in the frame; MKCinema never covers or blocks it.
   ===================================================================== */
const TR = { yt: null, id: '', tick: 0, drag: null, apiP: null };
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (TR.apiP) return TR.apiP;
  TR.apiP = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch (e) { /* ignore */ } res(window.YT); };
    const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; sc.async = true;
    sc.onerror = () => { TR.apiP = null; rej(new Error('YouTube player did not load')); };
    document.head.appendChild(sc);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) { TR.apiP = null; rej(new Error('YouTube player timed out')); } }, 12000);
  });
  return TR.apiP;
}
function trMsg(html) { const m = $('#trMsg'); m.hidden = !html; m.innerHTML = html || ''; $('#trBar').hidden = !!html; $('#trSlot').style.visibility = html ? 'hidden' : ''; icons(); }
function trIcon(id, name) { const b = $(id); if (b.dataset.icon === name) return; b.dataset.icon = name; b.innerHTML = `<i data-lucide="${name}"></i>`; icons(); }
function trSync() {
  const y = TR.yt; if (!y || !y.getDuration) return;
  const d = y.getDuration() || 0, c = TR.drag != null ? TR.drag * d : (y.getCurrentTime() || 0), st = y.getPlayerState ? y.getPlayerState() : -1;
  const pct = d ? clamp(c / d * 100, 0, 100) : 0;
  $('#trFill').style.width = `${pct}%`; $('#trKnob').style.left = `${pct}%`;
  $('#trCur').textContent = fmtTime(c); $('#trDur').textContent = fmtTime(d);
  const playing = st === 1 || st === 3;
  trIcon('#trPlay', playing ? 'pause' : 'play'); $('#trPlay').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  trIcon('#trMute', y.isMuted && y.isMuted() ? 'volume-x' : 'volume-2');
}
async function openTrailer(id) {
  const link = `<a class="btn btn-ghost" href="https://www.youtube.com/watch?v=${esc(id)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Open the trailer in a new tab</a>`;
  if (CFG.trailerMode === 'link') { window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, '_blank', 'noopener'); return; }
  // TVs: the YouTube app decodes with the TV's video hardware, so trailers play smoothly where a web player stutters
  if (CFG.trailerMode !== 'embed' && IS_TV && window.MKAndroid && typeof MKAndroid.youtube === 'function') {
    let ok = false; try { ok = MKAndroid.youtube(String(id)); } catch (e) { ok = false; }
    if (ok) return;
  }
  closeTrailer(true);
  TR.id = id; openLayer('trailer'); trMsg('');
  clearTimeout(TR.hideT); TR.hideT = setTimeout(() => { if (!$('#trailer').hidden) document.body.classList.add('tr-on'); }, 300);
  $('#trSlot').innerHTML = '<div id="trYt"></div>'; $('#trFill').style.width = '0%'; $('#trKnob').style.left = '0%'; $('#trCur').textContent = '0:00'; $('#trDur').textContent = '0:00';
  if (engine.offline) { trMsg(`<p>This preview blocks embedded video.</p>${link}`); return; }
  if (!/^https?:$/.test(location.protocol)) {
    // Pages opened as a file get YouTube error 153; the companion server's /yt page gives the embed a real origin
    if (await proxyOnline()) { $('#trSlot').innerHTML = `<iframe src="${esc(`${String(S.proxy).replace(/\/+$/, '')}/yt/${encodeURIComponent(id)}`)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Trailer"></iframe>`; $('#trBar').hidden = true; return; }
    trMsg(`<p>Trailers need MKCinema opened from a web address. Start mkcinema-server.js and open http://127.0.0.1:7000.</p>${link}`); return;
  }
  try {
    const YT = await loadYouTubeApi(); if (TR.id !== id || $('#trailer').hidden) return;
    TR.yt = new YT.Player('trYt', {
      host: 'https://www.youtube-nocookie.com', videoId: id, width: '100%', height: '100%',
      playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, cc_load_policy: 0, origin: location.origin, widget_referrer: location.origin },
      events: {
        onReady: (e) => { try { e.target.playVideo(); } catch (err) { /* autoplay may need a tap */ } trSync(); },
        // closing at the end means YouTube's grid of suggested videos never appears
        onStateChange: (e) => { trSync(); if (e.data === 0) closeTrailer(); },
        onError: () => trMsg(`<p>YouTube will not play this trailer inside other sites.</p>${link}`),
      },
    });
    clearInterval(TR.tick); TR.tick = setInterval(trSync, 250);
  } catch (e) { trMsg(`<p>${esc(e.message)}.</p>${link}`); }
}
function closeTrailer(silent) {
  clearInterval(TR.tick); TR.tick = 0;
  if (TR.yt) { try { TR.yt.destroy(); } catch (e) { /* already gone */ } TR.yt = null; }
  $('#trSlot').innerHTML = ''; TR.drag = null;
  if (document.fullscreenElement && document.fullscreenElement.closest && document.fullscreenElement.closest('#trailer')) document.exitFullscreen().catch(() => {});
  clearTimeout(TR.hideT); document.body.classList.remove('tr-on');
  if (!silent) closeLayer('trailer');
}
$('#trClose').onclick = () => closeTrailer();
$('#trPlay').onclick = () => { const y = TR.yt; if (!y || !y.getPlayerState) return; const st = y.getPlayerState(); if (st === 1 || st === 3) y.pauseVideo(); else y.playVideo(); setTimeout(trSync, 60); };
$('#trMute').onclick = () => { const y = TR.yt; if (!y || !y.isMuted) return; if (y.isMuted()) y.unMute(); else y.mute(); setTimeout(trSync, 60); };
$('#trFull').onclick = () => { const box = $('#trailer .tr-box'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (box.requestFullscreen) box.requestFullscreen().then(() => { if (TOUCH_UI && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {}); };
document.addEventListener('fullscreenchange', () => trIcon('#trFull', document.fullscreenElement && document.fullscreenElement.matches('#trailer .tr-box') ? 'minimize' : 'maximize'));
(() => {
  const seek = $('#trSeek'), at = (e) => { const r = seek.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
  seek.addEventListener('pointerdown', (e) => { if (!TR.yt || !TR.yt.getDuration) return; seek.setPointerCapture(e.pointerId); seek.classList.add('drag'); TR.drag = at(e); trSync(); });
  seek.addEventListener('pointermove', (e) => { if (TR.drag != null) { TR.drag = at(e); trSync(); } });
  const end = () => { if (TR.drag == null) return; const d = TR.yt.getDuration() || 0; TR.yt.seekTo(TR.drag * d, true); TR.drag = null; seek.classList.remove('drag'); setTimeout(trSync, 120); };
  seek.addEventListener('pointerup', end); seek.addEventListener('pointercancel', end); seek.addEventListener('lostpointercapture', end);
  seek.addEventListener('keydown', (e) => { const y = TR.yt; if (!y || !y.getDuration) return; const k = { ArrowLeft: -5, ArrowRight: 5 }[e.key]; if (k) { e.preventDefault(); e.stopPropagation(); y.seekTo(clamp((y.getCurrentTime() || 0) + k, 0, y.getDuration() || 0), true); setTimeout(trSync, 120); } });
})();

/* =====================================================================
   Player: HLS.js + native, ambilight, sources, subtitles, binge engine, handoff
   ===================================================================== */
const P = { ctx: null, stream: null, hls: null, amb: CFG.ambilight && !IS_TV, subs: [], subDelay: 0, idleT: 0, lastSave: 0, curSub: -1, upNextT: 0, upNextDismissed: false, filter: 'all', retried: false, raf: 0, remux: null, ducking: false };
const video = $('#video');
/* Player clock. While the audio rescue remux runs, the video element starts at 0 from the point the server began
   converting, so its time is offset and its duration comes from the server's probe. Everything reads time through these. */
const pNow = () => video.currentTime + (P.remux ? P.remux.offset : 0);
const pDur = () => (P.remux && P.remux.duration ? P.remux.duration : video.duration);
function pSeek(t, { user = true } = {}) {
  const d = pDur(); if (!isFinite(d)) return;
  t = clamp(t, 0, d - .5); const from = pNow();
  if (user) Skip.noteSeek(from, t);
  if (P.remux) {
    // inside what the server already sent, a plain seek is instant; anywhere else the conversion restarts there
    const local = t - P.remux.offset, b = video.buffered;
    for (let i = 0; i < b.length; i++) if (local >= b.start(i) && local <= b.end(i) - 0.5) { video.currentTime = local; return; }
    Rescue.restart(t);
  } else video.currentTime = t;
}
const TOUCH_PLAYER = matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1366px)');
function proxify(url, headers) {
  const base = String(S.proxy || '').replace(/\/+$/, '');
  if (!base) return url;
  return `${base}/proxy?url=${encodeURIComponent(url)}${headers && Object.keys(headers).length ? `&headers=${encodeURIComponent(b64json(headers))}` : ''}`;
}
function magnetOf(s) {
  const tr = (s.sources || []).filter((x) => x.startsWith('tracker:')).map((x) => `&tr=${encodeURIComponent(x.slice(8))}`).join('');
  return `magnet:?xt=urn:btih:${s.infoHash}&dn=${encodeURIComponent((s._tel && s._tel.lines[0]) || s.name || 'stream')}${tr}`;
}
/* ---------------- External players (like Stremio's "Play in external player") ----------------
   Each platform only has the hand-off routes it really supports:
   Android Chrome opens intent:// links in an installed app, iOS and macOS apps register their own URL schemes,
   and desktop players without a scheme (VLC, mpv, MPC on Windows and Linux) get an .m3u playlist the OS opens in them. */
const PLATFORM = (() => {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua) || /Android/i.test((navigator.userAgentData || {}).platform || '')) return 'android';
  // Android Chrome in desktop mode (the default on tablets) claims to be Linux; a Linux desktop almost never has a touch screen
  if (/Linux/i.test(ua) && !/CrOS/i.test(ua) && navigator.maxTouchPoints > 0) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'windows';
  return 'linux';
})();
/* VLC plays every codec browsers cannot (MKV with EAC3, DTS, TrueHD, HEVC...), so MKCinema recommends it by name.
   Store links go straight to the official listing for this device; both are free. */
const VLC_STORES = [
  { os: 'android', label: 'Google Play', icon: 'play', href: 'https://play.google.com/store/apps/details?id=org.videolan.vlc' },
  { os: 'ios', label: 'App Store', icon: 'smartphone', href: 'https://apps.apple.com/app/vlc-media-player/id650377962' },
  { os: 'desktop', label: 'videolan.org', icon: 'monitor-down', href: 'https://www.videolan.org/vlc/' },
];
/* Store badges drawn in the style of the official ones, so the platform is recognisable at a glance */
const STORE_ART = {
  android: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#00d7fe" d="M2.6 1.2 13.3 12 2.6 22.8c-.4-.2-.6-.7-.6-1.2V2.4c0-.5.2-1 .6-1.2z"/><path fill="#00f076" d="M2.6 1.2c.4-.2.9-.2 1.4.1l12.7 7.3-3.4 3.4z"/><path fill="#ff3a44" d="M13.3 12l3.4 3.4L4 22.7c-.5.3-1 .3-1.4.1z"/><path fill="#ffd400" d="m16.7 8.6 3.9 2.2c.9.5.9 1.9 0 2.4l-3.9 2.2-3.4-3.4z"/></svg>',
  ios: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12.15 6.9c-.95 0-2.42-1.08-3.96-1.04-2.04.03-3.91 1.18-4.96 3.01-2.12 3.68-.55 9.1 1.52 12.09 1.01 1.45 2.21 3.09 3.79 3.04 1.52-.07 2.09-.99 3.94-.99 1.83 0 2.35.99 3.96.95 1.64-.03 2.68-1.48 3.68-2.95 1.16-1.69 1.64-3.33 1.66-3.42-.04-.01-3.18-1.22-3.22-4.86-.03-3.04 2.48-4.49 2.6-4.56-1.43-2.09-3.62-2.32-4.39-2.38-2-.16-3.68 1.09-4.62 1.09zm3.38-3.07c.84-1.01 1.4-2.43 1.25-3.83-1.21.05-2.66.81-3.53 1.82-.78.9-1.45 2.34-1.27 3.71 1.34.1 2.71-.69 3.55-1.7z"/></svg>',
  desktop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ff8800" d="M9.6 2.2h4.8l1.3 5.2H8.3zM7.7 9.8h8.6l1.4 5.5H6.3z"/><path fill="#fff" d="M8.3 7.4h7.4l.6 2.4H7.7zM6.3 15.3h11.4l.6 2.4H5.7z"/><path fill="#ff8800" d="M5.7 17.7h12.6l.5 2H5.2zM3 19.7h18c.6 0 1 .4 1 1v.8c0 .3-.2.5-.5.5h-19a.5.5 0 0 1-.5-.5v-.8c0-.6.4-1 1-1z"/></svg>',
};
const STORE_TEXT = { android: ['GET VLC ON', 'Google Play'], ios: ['Get VLC on the', 'App Store'], desktop: ['Download VLC for', 'Windows · Mac · Linux'] };
function storeBadge(x, { small = false } = {}) {
  const [top, big] = STORE_TEXT[x.os];
  return `<a class="store-badge sb-${x.os}${small ? ' sm' : ''}" href="${x.href}" target="_blank" rel="noopener" aria-label="${esc(`${top} ${big}`)}">${STORE_ART[x.os]}<span><small>${esc(top)}</small><b>${esc(big)}</b></span></a>`;
}
function vlcButtons({ all = false, small = true } = {}) {
  const mine = PLATFORM === 'android' || PLATFORM === 'ios' ? PLATFORM : 'desktop';
  const list = all ? VLC_STORES.slice().sort((a, b) => (b.os === mine) - (a.os === mine)) : VLC_STORES.filter((x) => x.os === mine);
  return `<span class="store-row">${list.map((x) => storeBadge(x, { small })).join('')}</span>`;
}
const PLATFORM_NAME = { android: 'Android', ios: 'iPhone and iPad', mac: 'Mac', windows: 'Windows', linux: 'Linux' }[PLATFORM];
function intentUrl(url, title, pkg) {
  const u = new URL(url); u.hash = '';
  const rest = u.href.slice(u.protocol.length + 2);
  return `intent://${rest}#Intent;scheme=${u.protocol.slice(0, -1)};action=android.intent.action.VIEW;type=video/*;${pkg ? `package=${pkg};S.browser_fallback_url=${encodeURIComponent(`https://play.google.com/store/apps/details?id=${pkg}`)};` : ''}S.title=${encodeURIComponent(title || '')};end`;
}
const enc = encodeURIComponent;
const PLAYERS = [
  { id: 'android', os: 'android', name: 'Ask every time (Android app picker)', short: 'your video app', link: (u, t) => intentUrl(u, t) },
  { id: 'vlc-android', os: 'android', name: 'VLC', link: (u, t) => intentUrl(u, t, 'org.videolan.vlc') },
  { id: 'mx', os: 'android', name: 'MX Player', link: (u, t) => intentUrl(u, t, 'com.mxtech.videoplayer.ad') },
  { id: 'mx-pro', os: 'android', name: 'MX Player Pro', link: (u, t) => intentUrl(u, t, 'com.mxtech.videoplayer.pro') },
  { id: 'just', os: 'android', name: 'Just Player', link: (u, t) => intentUrl(u, t, 'com.brouken.player') },
  { id: 'mpv-android', os: 'android', name: 'mpv', link: (u, t) => intentUrl(u, t, 'is.xyz.mpv') },
  { id: 'vlc-ios', os: 'ios', name: 'VLC', link: (u) => `vlc-x-callback://x-callback-url/stream?url=${enc(u)}` },
  { id: 'infuse', os: 'ios mac', name: 'Infuse', link: (u) => `infuse://x-callback-url/play?url=${enc(u)}` },
  { id: 'outplayer', os: 'ios', name: 'Outplayer', link: (u) => `outplayer://${u}` },
  { id: 'nplayer', os: 'ios', name: 'nPlayer', link: (u) => `nplayer-${u}` },
  { id: 'iina', os: 'mac', name: 'IINA', link: (u) => `iina://weblink?url=${enc(u)}` },
  { id: 'potplayer', os: 'windows', name: 'PotPlayer', link: (u) => `potplayer://${u}` },
  { id: 'm3u', os: 'mac windows linux android', name: 'Playlist file (.m3u) for VLC, mpv or any player', short: 'a playlist file', m3u: true },
];
const playersHere = () => PLAYERS.filter((p) => p.os.split(' ').includes(PLATFORM));
const extPlayerId = () => (CFG.extPlayers || {})[PLATFORM] || 'builtin';
const extPlayer = () => playersHere().find((p) => p.id === extPlayerId()) || null;
/* The URL an outside app can fetch. Header-bound streams go through the MKCinema proxy, which only works when that app can reach it. */
function handoffUrl(s) {
  if (!s || !s.url || s._local || !/^https?:/i.test(s.url)) return null;
  return s.behaviorHints && s.behaviorHints.proxyHeaders ? proxify(s.url, s.behaviorHints.proxyHeaders.request) : s.url;
}
const streamTitle = (ctx) => (ctx && ctx.meta ? [ctx.meta.name, ctx.video ? `S${ctx.video.season}E${ctx.video.episode}` : ''].filter(Boolean).join(' ') : 'MKCinema stream');
function downloadM3U(url, title) {
  const blob = new Blob([`#EXTM3U\n#EXTINF:-1,${String(title).replace(/[\r\n]/g, ' ')}\n${url}\n`], { type: 'audio/x-mpegurl' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${String(title).replace(/[^\w\- ]+/g, '').trim() || 'stream'}.m3u`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
const playerName = (p) => p.short || p.name.split(' (')[0];
function playerBtn(p, url, title, prime) {
  const cls = `btn ${prime ? 'btn-prime' : 'btn-ghost'}`;
  if (p.m3u) return `<button class="${cls}" type="button" data-m3u="${esc(url)}" data-title="${esc(title)}"><i data-lucide="list-video"></i>${prime ? 'Download again' : '.m3u playlist'}</button>`;
  return `<a class="${cls}" href="${esc(p.link(url, title))}" data-ext="${esc(p.id)}"><i data-lucide="external-link"></i>${prime ? (p.short ? 'Open again' : `Open ${esc(playerName(p))} again`) : esc(playerName(p))}</a>`;
}
/* 2.37.0: links that come from addons or other services open only as web or Stremio links (never javascript:, data:, intent:) */
function safeHref(u) { const s = String(u == null ? '' : u).trim(); return /^(https?:\/\/|stremio:\/\/)/i.test(s) ? s : ''; }
function handoffHTML(s) {
  const url = handoffUrl(s), title = streamTitle(P.ctx);
  const items = [];
  if (safeHref(s.externalUrl)) items.push(`<a class="btn btn-prime" href="${esc(safeHref(s.externalUrl))}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Open link</a>`);
  if (s.infoHash) {
    const mag = magnetOf(s);
    items.push(`<a class="btn btn-prime" href="${esc(mag)}"><i data-lucide="magnet"></i>Open magnet</a>`, `<button class="btn btn-ghost" type="button" data-copy="${esc(mag)}"><i data-lucide="copy"></i>Copy magnet</button>`);
  }
  if (url) {
    items.push(...playersHere().map((p) => playerBtn(p, url, title, false)),
      `<button class="btn btn-ghost" type="button" data-copy="${esc(url)}"><i data-lucide="copy"></i>Copy stream URL</button>`);
  }
  return items.join('');
}
/* Hand-off to an outside player (2.7.23). The in-app player never opens for it: MKCinema stays on the film's page with
   its sources, so leaving VLC (or any player) lands right back there. If the page never loses focus, the app did not
   take over, and a quiet note says so; the source list underneath is already there to pick again. */
const Handoff = {
  t: 0, left: false,
  init() {
    const gone = () => { if (this.t) this.left = true; };
    addEventListener('blur', gone); addEventListener('pagehide', gone);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') gone(); });
  },
  launch(p, ctx, stream) {
    const url = handoffUrl(stream), title = streamTitle(ctx), name = playerName(p);
    // Land on this film's page (and episode) so coming back shows its sources
    const sameFilm = !$('#detail').hidden && D.meta && D.meta.id === ctx.meta.id && (!ctx.video || (D.video && D.video.id === ctx.video.id));
    if (!sameFilm) openDetail(ctx.meta, { videoId: ctx.video ? videoIdFor(ctx.meta, ctx.video) : undefined });
    if (p.m3u) { downloadM3U(url, title); toast(`Playlist saved. Open it to start ${title} in your video player.`, 'ok', 5200, 'handoff'); return; }
    toast(`Opening in ${name}…`, 'info', 2400, 'handoff');
    this.left = false; const t0 = this.t = Date.now();
    try { location.href = p.link(url, title); } catch (e) { /* reported below */ }
    setTimeout(() => {
      if (this.t !== t0) return; this.t = 0;
      // A late timer means the page was frozen while the app played, so it did open
      if (this.left || document.visibilityState === 'hidden' || Date.now() - t0 > 6000) return;
      toast(`${name[0].toUpperCase() + name.slice(1)} did not open. Check it is installed, or pick the source again. Settings › Playback can switch to the built-in player.`, 'err', 7000, 'handoff');
    }, 2600);
  },
};
Handoff.init();
function showMsg(title, body, actions = '') {
  const m = $('#pMsg'); m.hidden = false;
  m.innerHTML = `<div class="box glass-solid"><h3>${esc(title)}</h3><p>${body}</p><div class="actions">${actions}</div></div>`;
  icons();
  $$('[data-copy]', m).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
  $$('[data-m3u]', m).forEach((b) => b.addEventListener('click', () => downloadM3U(b.dataset.m3u, b.dataset.title)));
  $$('[data-act]', m).forEach((b) => b.addEventListener('click', () => playerAct(b.dataset.act)));
}
function hideMsg() { $('#pMsg').hidden = true; $('#pMsg').innerHTML = ''; }
function playerAct(a) {
  if (a === 'next-src') { const list = P.ctx.streams.filter((s) => (s._tel.webReady && !s._tel.isTrailer && !s.ytId) || s === P.stream); const i = list.indexOf(P.stream); const n = list[i + 1]; if (n) playStream(P.ctx, n, { startAt: 0 }); else toast('No other playable sources', 'err'); }
  if (a === 'sources') openDrawer('src');
  if (a === 'close') closePlayer();
  if (a === 'force') { P.force = true; playStream(P.ctx, P.stream, { startAt: 0 }); }
}
function teardown() {
  if (P.hls) { try { P.hls.destroy(); } catch (e) { /* ignore */ } P.hls = null; }
  video.pause(); video.removeAttribute('src'); video.srcObject = null;
  $$('track', video).forEach((t) => t.remove()); video.load();
  $('#ytwrap').innerHTML = ''; hideMsg(); $('#upNext').hidden = true; P.upNextDismissed = false; clearInterval(P.upNextT);
  P.remux = null; video.playbackRate = CFG.speed || 1; PlayerPlus.reset();
}
async function playStream(ctx, stream, { startAt } = {}) {
  if (!stream) return;
  if (stream.ytId) { if (!$('#player').hidden) closePlayer(); openTrailer(stream.ytId); return; }
  stream._tel = stream._tel || Telemetry.parse(stream);
  if (stream._tel.kind !== 'ext' && stream._tel.kind !== 'p2p' && extPlayer() && handoffUrl(stream) && !P.force) {
    if (!$('#player').hidden) closePlayer();
    Handoff.launch(extPlayer(), ctx, stream); return;
  }
  const wasOpen = !$('#player').hidden;
  if (!wasOpen) { openLayer('player'); }
  const prevCtx = P.ctx; P.ctx = ctx; P.stream = stream; P.retried = false;
  const key = ctx.video ? ctx.video.id : ctx.meta.id;
  if (startAt == null) { const p = CFG.resume && S.progress[key]; startAt = p && p.t > 20 && p.t < p.d * .95 ? p.t : 0; }
  $('#pTitle').textContent = ctx.meta.name || '';
  $('#pSub').textContent = [ctx.video ? `S${ctx.video.season} · E${ctx.video.episode} · ${ctx.video.name || ctx.video.title || ''}` : yearOf(ctx.meta), stream._addon, stream._tel.res, stream._tel.source].filter(Boolean).join('  ·  ');
  $('#pEpsBtn').hidden = !(ctx.meta.type === 'series' && ctx.meta.videos && ctx.meta.videos.length);
  $('#pNext').hidden = !(ctx.video && nextVideo(ctx.meta, ctx.video));
  teardown();
  // the bar starts at the real starting point (0 or the resume point), not where the last video left it
  { const pr = S.progress[key], d0 = pr && pr.d, pct = startAt && d0 > 0 ? clamp(startAt / d0 * 100, 0, 100) : 0; MkSeekPaint.cur(pct / 100); MkSeekPaint.buf(0); $('#pTime').textContent = d0 > 0 ? `${fmtTime(startAt || 0)} / ${fmtTime(d0)}` : fmtTime(startAt || 0); }
  Loader.show(ctx.meta);
  renderSourceDrawer();
  if (ctx.meta.type === 'series' && (!prevCtx || prevCtx.meta.id !== ctx.meta.id)) P.epSeason = ctx.video ? Number(ctx.video.season) : null;
  renderEpisodeDrawer();
  wakeHud();
  const t = stream._tel;
  $('#player').classList.toggle('yt', !!stream.ytId);
  if (t.kind === 'ext') { showMsg('This source opens outside MKCinema', 'The addon gave a web page or app link instead of a video stream.', handoffHTML(stream) + '<button class="btn btn-ghost" type="button" data-act="sources"><i data-lucide="layers"></i>Other sources</button>'); }
  else if (t.kind === 'p2p') {
    showMsg('This is a peer-to-peer torrent stream', 'Browsers cannot play BitTorrent info hashes directly. Hand it to a torrent-capable player, or pick a web-ready source.', handoffHTML(stream) + '<button class="btn btn-ghost" type="button" data-act="sources"><i data-lucide="layers"></i>Other sources</button>');
  } else if (stream.url && (stream.behaviorHints || {}).notWebReady && !(stream.behaviorHints || {}).proxyHeaders && !P.force) {
    showMsg('The addon marked this stream as not web-ready', 'It may use a container or codec browsers cannot decode. An external player is the safer choice, or you can try it here anyway.', `<button class="btn btn-prime" type="button" data-act="force"><i data-lucide="play"></i>Try in browser</button>${handoffHTML(stream)}<button class="btn btn-ghost" type="button" data-act="sources"><i data-lucide="layers"></i>Other sources</button>`);
  } else if (stream.url) {
    await DSP.prepare(stream); if (P.stream !== stream) return;
    loadUrl(stream, startAt);
  }
  else showMsg('This stream has nothing to play', 'The addon returned a stream object without a URL.', '<button class="btn btn-ghost" type="button" data-act="sources"><i data-lucide="layers"></i>Other sources</button>');
  P.force = false;
  if (!$('#pMsg').hidden) Loader.hide();
  loadSubtitles(ctx, stream);
  startAmbilight();
  PlayerPlus.started(ctx, stream);
  if (window.MkRec) MkRec.playing(ctx, stream);
}
/* perf-2.7.33: hls.js (400 KB) is fetched when a details page opens, not at startup; an .m3u8 waits for it */
const HlsLoad = {
  p: null, failed: false, tok: 0,
  get() {
    if (window.Hls) return Promise.resolve(window.Hls);
    return this.p || (this.p = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js'; s.async = true;
      s.integrity = 'sha384-w6Gb3fXHb5e1LUYa/hYA5Q41bEDglN5ZPCG7Jvnoo8/X90oGnlPqBlBJCe38mEMm'; s.crossOrigin = 'anonymous';
      s.onload = () => res(window.Hls); s.onerror = () => { this.p = null; this.failed = true; s.remove(); rej(new Error('hls.js did not load')); };
      document.head.appendChild(s);
    }));
  },
  warm() { if (window.Hls || this.p) return; const go = () => this.get().catch(() => {}); if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 1200); },
};
function loadUrl(stream, startAt) {
  const hlsTok = ++HlsLoad.tok;
  if (!window.Hls && !HlsLoad.failed && !stream._local && /\.m3u8(\?|$)/i.test(stream.url || '')) {
    HlsLoad.get().catch(() => {}).then(() => { if (hlsTok === HlsLoad.tok && P.stream === stream && !$('#player').hidden) loadUrl(stream, startAt); });
    return;
  }
  const bh = stream.behaviorHints || {};
  const headers = bh.proxyHeaders && bh.proxyHeaders.request;
  // stream._cors is set by DSP.prepare: 'proxy' routes through the MKCinema proxy so Night Mode can read the audio
  const src = stream._local ? stream.url : (bh.proxyHeaders || CFG.alwaysProxy || stream._cors === 'proxy') ? proxify(stream.url, headers || {}) : stream.url;
  if (stream._cors === 'direct' || stream._cors === 'proxy' || (DSP.attached && !stream._local)) video.crossOrigin = 'anonymous'; else video.removeAttribute('crossorigin');
  Failover.arm(stream);
  const hlsLike = !stream._local && /\.m3u8(\?|$)/i.test(stream.url);
  if (P._onMeta) video.removeEventListener('loadedmetadata', P._onMeta);
  const onMeta = P._onMeta = () => { P._onMeta = null; if (P.stream && P.stream !== stream) return; if (startAt && isFinite(video.duration) && startAt < video.duration - 5) video.currentTime = startAt; video.playbackRate = CFG.speed || 1; video.play().catch(() => wakeHud(true)); if (!P.hls) setTimeout(addEmbeddedSubs, 300); };
  video.addEventListener('loadedmetadata', onMeta, { once: true });
  if (hlsLike && window.Hls && Hls.isSupported()) {
    const hls = P.hls = new Hls({ enableWorker: true, startPosition: startAt || -1, maxBufferLength: 40, backBufferLength: 60, capLevelToPlayerSize: !IS_TV });
    MkHeal.hls(hls, stream, src);
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, addEmbeddedSubs);
    hls.on(Hls.Events.MANIFEST_PARSED, () => { addEmbeddedSubs(); if (!$('#optMenu').hidden) renderOptMenu(); });
    hls.on(Hls.Events.LEVEL_SWITCHED, () => { if (!$('#optMenu').hidden) renderOptMenu(); });
    hls.loadSource(src); hls.attachMedia(video);
  } else {
    video.src = src;
  }
}
video.addEventListener('error', () => { if (P.stream && !P.hls && P.stream.url) MkHeal.native(P.stream, (video.error && ({ 1: 'aborted', 2: 'network error', 3: 'decode error', 4: 'format not supported or blocked' })[video.error.code]) || 'unknown error'); });
function playbackFailed(stream, reason) {
  if (!$('#player').hidden && P.stream === stream) {
    Loader.hide();
    const cc = typeof CloudConvert !== 'undefined' ? CloudConvert : null;
    if (cc && stream._cloud && cc.nextUrl(stream)) return;
    if (Failover.onError(stream, reason)) return;
    if (cc && cc.onFail(stream, reason, P.mkReal ? pNow() : (P.mkWant || P.startAt || 0))) return;
    if (DSP.attached && !stream._local && stream._cors === 'none') { DSP.blockedMsg(stream); return; }
    const proxied = stream.behaviorHints && stream.behaviorHints.proxyHeaders;
    const body = `${esc(reason)}. ${proxied ? 'This stream is routed through your MKCinema proxy at <span class="mono">' + esc(S.proxy) + '</span>. Make sure mkcinema-server.js is running.' : stream._tel.mkv ? 'MKV files often use audio or video codecs browsers cannot decode. VLC is recommended: it plays them all, and MKCinema can hand the stream to it in one tap.' : 'The host may block browser playback (CORS or an unsupported codec).'} You can try another source or hand it to an external player.`;
    showMsg('This stream would not play here', body, `<button class="btn btn-prime" type="button" data-act="next-src"><i data-lucide="skip-forward"></i>Try next source</button><button class="btn btn-ghost" type="button" data-act="sources"><i data-lucide="layers"></i>Sources</button>${handoffHTML(stream)}${stream._tel.mkv ? vlcButtons() : ''}`);
  }
}
let proxyCheck = { t: 0, ok: false };
async function proxyOnline() {
  if (Date.now() - proxyCheck.t < 15000) return proxyCheck.ok;
  try { const r = await fetchT(`${String(S.proxy).replace(/\/+$/, '')}/health`, {}, 2500); proxyCheck = { t: Date.now(), ok: r.ok }; }
  catch (e) { proxyCheck = { t: Date.now(), ok: false }; }
  return proxyCheck.ok;
}
async function closePlayer() {
  saveProgress(true); teardown(); closeLayer('player');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $('#player').classList.remove('full'); cancelAnimationFrame(P.raf);
  closeDrawers(); $('#subMenu').hidden = true; $('#optMenu').hidden = true; P.aspect = 'fit'; P.zoom = 1; applyPicture(); setLock(false); releaseWake();
  P.ctx = null; P.stream = null; if (window.MkRec) MkRec.playing(null);
  if (S.view === 'home') renderHome(); if (S.view === 'library') renderLibrary();
  if (!$('#detail').hidden && D.meta) renderDetail(false);
}

/* Ambilight: draw live frames into a tiny canvas, then blur it across the theatre */
function startAmbilight() {
  cancelAnimationFrame(P.raf);
  // Phones and touch tablets use a full-screen stage, so the glow would never be seen: skip the per-frame work there
  if (TOUCH_PLAYER.matches || IS_TV) return;
  const c = $('#amb'), g = c.getContext('2d'); let n = 0;
  const [ma, mb] = moodFor(P.ctx.meta);
  let last = 0;
  const tick = (now = 0) => {
    P.raf = requestAnimationFrame(tick);
    if (!P.amb || now - last < 66) return; last = now;
    if (video.readyState >= 2 && !$('#ytwrap').firstChild) {
      try { g.drawImage(video, 0, 0, c.width, c.height); } catch (e) { /* not drawable yet */ }
    } else if (n++ % 8 === 0) {
      const t = performance.now() / 3000, gr = g.createLinearGradient(0, 0, c.width, c.height);
      gr.addColorStop(0, ma); gr.addColorStop(.5 + Math.sin(t) * .3, '#03050a'); gr.addColorStop(1, mb); g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    }
  };
  tick();
}

/* HUD */
function wakeHud(stay) {
  if (P.locked) return;
  const hud = $('#hud'); hud.classList.remove('idle'); clearTimeout(P.idleT);
  if (!stay) P.idleT = setTimeout(() => { if (!video.paused && !P.scrubbing && !$('#player .drawer.open') && $('#subMenu').hidden && $('#optMenu').hidden && $('#dspPop').hidden) hud.classList.add('idle'); }, 2800);
}
['pointermove', 'pointerdown', 'touchstart'].forEach((ev) => $('#player').addEventListener(ev, () => wakeHud(), { passive: true }));
function setPlayIcon() { const h = `<i data-lucide="${video.paused ? 'play' : 'pause'}"></i>`; $('#pPlay').innerHTML = h; $('#pmPlay').innerHTML = h; icons(); }
video.addEventListener('play', () => { setPlayIcon(); wakeHud(); });
video.addEventListener('pause', () => { setPlayIcon(); wakeHud(true); saveProgress(true); });
video.addEventListener('timeupdate', () => {
  const d = pDur(), t = pNow(), live = !isFinite(d);
  if (Number.isNaN(d)) return;
  const pct = live ? 100 : (t / d) * 100 || 0;
  if (!P.scrubbing) MkSeekPaint.cur(pct / 100);
  if (!live && video.buffered.length) MkSeekPaint.buf((video.buffered.end(video.buffered.length - 1) + (P.remux ? P.remux.offset : 0)) / d);
  saveProgress(false);
  PlayerPlus.tick(t, d);
  if (!live && P.ctx && P.ctx.video && d > 120 && !P.upNextDismissed && (d - t < (Number(CFG.upNextAt) || 45) || Skip.inCredits(t))) showUpNext();
});
video.addEventListener('ended', () => { saveProgress(true); if (CFG.autoNext && P.ctx && P.ctx.video && nextVideo(P.ctx.meta, P.ctx.video)) playNext(); });
video.addEventListener('volumechange', () => { if (P.ducking || Rescue.userMuted != null) return; $('#pMute').innerHTML = `<i data-lucide="${video.muted || video.volume === 0 ? 'volume-x' : 'volume-2'}"></i>`; $('#pVol').value = video.muted ? 0 : video.volume; icons(); Store.set('volume', video.volume); });
video.volume = CFG.rememberVolume ? Store.get('volume', 1) : 1;
const togglePlay = () => { if (video.srcObject || video.currentSrc) (video.paused ? video.play().catch(() => {}) : video.pause()); };
const step = () => Number(CFG.seekStep) || 10;
const seekBy = (s) => { if (isFinite(pDur())) { pSeek(pNow() + s); wakeHud(); } };
$('#pPlay').onclick = togglePlay; $('#pmPlay').onclick = togglePlay;
$('#pBack').onclick = () => seekBy(-step()); $('#pFwd').onclick = () => seekBy(step());
$('#pmBack').onclick = () => { seekBy(-step()); seekFx(-1); }; $('#pmFwd').onclick = () => { seekBy(step()); seekFx(1); };
/* Picture: aspect ratio (VLC-style forced ratios) and zoom */
const ASPECTS = [['fit', 'Fit'], ['fill', 'Fill'], ['stretch', 'Stretch'], ['16:9', '16:9'], ['4:3', '4:3'], ['21:9', '21:9']];
P.aspect = 'fit'; P.zoom = 1;
function applyPicture() {
  const v = video, a = P.aspect || 'fit';
  v.style.width = ''; v.style.height = ''; v.style.margin = '';
  if (a === 'fit' || a === 'fill' || a === 'stretch') v.style.objectFit = { fit: 'contain', fill: 'cover', stretch: 'fill' }[a];
  else {
    const [x, y] = a.split(':').map(Number), R = x / y, st = $('#stage').getBoundingClientRect();
    let w = st.width, h = w / R; if (h > st.height) { h = st.height; w = h * R; }
    v.style.objectFit = 'fill'; v.style.width = `${w}px`; v.style.height = `${h}px`; v.style.margin = `${(st.height - h) / 2}px auto 0`;
  }
  v.style.transform = P.zoom !== 1 ? `scale(${P.zoom})` : '';
}
addEventListener('resize', () => { if (!$('#player').hidden && P.aspect.includes(':')) applyPicture(); });
/* Lock: hides every control so a pocket or a stray thumb can't pause or seek */
function setLock(on) {
  P.locked = on; $('#player').classList.toggle('locked', on); $('#pUnlock').hidden = true;
  if (on) { closeDrawers(); $('#subMenu').hidden = true; $('#optMenu').hidden = true; $('#hud').classList.add('idle'); toast('Controls locked. Tap the screen, then Unlock.'); } else wakeHud();
}
$('#pLock').onclick = () => setLock(true);
$('#pUnlock').onclick = (e) => { e.stopPropagation(); setLock(false); };
/* Keep the phone screen awake while a video plays */
async function holdWake() { try { if ('wakeLock' in navigator && !P.wake && document.visibilityState === 'visible') { P.wake = await navigator.wakeLock.request('screen'); P.wake.addEventListener('release', () => { P.wake = null; }); } } catch (e) { /* not allowed here */ } }
function releaseWake() { if (P.wake) { P.wake.release().catch(() => {}); P.wake = null; } }
video.addEventListener('play', holdWake); video.addEventListener('pause', releaseWake);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !video.paused && !$('#player').hidden) holdWake(); });
/* Two-finger pinch: spread to fill the screen, pinch to fit */
(() => {
  let d0 = 0, d1 = 0; const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  $('#stage').addEventListener('touchstart', (e) => { if (e.touches.length === 2) { d0 = d1 = dist(e.touches); } }, { passive: true });
  $('#stage').addEventListener('touchmove', (e) => { if (e.touches.length === 2 && d0) d1 = dist(e.touches); }, { passive: true });
  $('#stage').addEventListener('touchend', () => {
    if (!d0 || P.locked) { d0 = 0; return; }
    const k = d1 / d0; d0 = 0;
    if (k > 1.15 && P.aspect !== 'fill') { P.aspect = 'fill'; applyPicture(); toast('Fill screen'); }
    else if (k < .87 && P.aspect !== 'fit') { P.aspect = 'fit'; P.zoom = 1; applyPicture(); toast('Fit to screen'); }
  }, { passive: true });
})();
function seekFx(dir) {
  const fx = $('#seekFx'); fx.hidden = false; fx.className = `seek-fx ${dir < 0 ? 'l' : 'r'}`; void fx.offsetWidth; fx.style.animation = 'none'; void fx.offsetWidth; fx.style.animation = '';
  fx.innerHTML = `<i data-lucide="${dir < 0 ? 'rewind' : 'fast-forward'}"></i>${dir < 0 ? '−' : '+'}${step()}s`; icons();
  clearTimeout(P.fxT); P.fxT = setTimeout(() => { fx.hidden = true; }, 650);
}
/* Mouse: click plays or pauses, double-click goes fullscreen.
   Touch: tap shows or hides the controls, double-tap the left or right third to skip, like the YouTube and Netflix apps. */
(() => {
  const hud = $('#hud'); let touch = false, wasIdle = false, lastTap = 0, lastZone = 0, tapT = 0;
  $('#player').addEventListener('pointerdown', (e) => { touch = e.pointerType === 'touch' || e.pointerType === 'pen'; wasIdle = hud.classList.contains('idle'); }, { capture: true, passive: true });
  $('#player').addEventListener('click', (e) => {
    // icons() can swap a tapped icon out of the DOM mid-click, so a detached target counts as a control tap
    if (!e.target.isConnected || e.target.closest('button, a, input, select, textarea, .menu, .drawer, .upnext, .p-msg, #ytwrap, .seek, .pp-ui')) return;
    if (P.locked) { const u = $('#pUnlock'); u.hidden = false; clearTimeout(P.unlockT); P.unlockT = setTimeout(() => { u.hidden = true; }, 2500); return; }
    if (!$('#subMenu').hidden || !$('#optMenu').hidden) { $('#subMenu').hidden = true; $('#optMenu').hidden = true; wakeHud(); return; }
    if (!touch) { if (e.target === video) togglePlay(); return; }
    const r = $('#player').getBoundingClientRect(), x = (e.clientX - r.left) / r.width, zone = x < 1 / 3 ? -1 : x > 2 / 3 ? 1 : 0, now = performance.now();
    if (zone && zone === lastZone && now - lastTap < 350) { clearTimeout(tapT); lastTap = now; seekBy(zone * step()); seekFx(zone); return; }
    lastTap = now; lastZone = zone; clearTimeout(tapT);
    tapT = setTimeout(() => { if (wasIdle) wakeHud(); else hud.classList.add('idle'); }, zone ? 280 : 0);
  });
  video.addEventListener('dblclick', () => { if (!touch) toggleFull(); });
})();
$('#pMute').onclick = () => { video.muted = !video.muted; };
$('#pVol').oninput = (e) => { video.volume = Number(e.target.value); video.muted = video.volume === 0; };
$('#pClose').onclick = () => closePlayer();
$('#pNext').onclick = () => playNext();
$('#pAmb').onclick = () => { P.amb = !P.amb; $('#pAmb').classList.toggle('on', P.amb); $('#amb').style.opacity = P.amb ? '' : '0'; };
$('#pPip').onclick = async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); } catch (e) { toast('Picture in picture is not available here', 'err'); } };
async function toggleFull() {
  const el = $('#player');
  try {
    if (document.fullscreenElement) { await document.exitFullscreen(); try { screen.orientation.unlock(); } catch (e) { /* not supported */ } }
    else { await el.requestFullscreen(); if (TOUCH_UI && screen.orientation && screen.orientation.lock && video.videoWidth >= video.videoHeight) screen.orientation.lock('landscape').catch(() => {}); }
  }
  catch (e) { el.classList.toggle('full'); }
}
document.addEventListener('fullscreenchange', () => $('#player').classList.toggle('full', !!document.fullscreenElement));
$('#pFull').onclick = toggleFull;
/* Seek bar. While dragging only the bar moves; the video seeks once on release, so the thumb never jumps back
   and remote streams don't rebuffer on every finger movement. The controls stay pinned until the drag ends. */
(() => {
  const seek = $('#seek'); let drag = null;
  const at = (e) => { const r = seek.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
  const tip = (p) => {
    const d = pDur(), t = p * d, delta = t - pNow();
    $('#sTip').style.left = `${clamp(p * 100, 4, 96)}%`;
    $('#sTip').textContent = !isFinite(d) ? 'LIVE' : drag && Math.abs(delta) >= 1 ? `${fmtTime(t)}  ${delta < 0 ? '−' : '+'}${fmtTime(Math.abs(delta))}` : fmtTime(t);
  };
  const show = (p) => { MkSeekPaint.cur(p); tip(p); };
  seek.addEventListener('pointerdown', (e) => {
    if (!isFinite(pDur()) || e.button > 0) return;
    e.preventDefault(); drag = { p: at(e) }; P.scrubbing = true;
    try { seek.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
    seek.classList.add('drag'); clearTimeout(P.idleT); $('#hud').classList.remove('idle'); show(drag.p);
  });
  seek.addEventListener('pointermove', (e) => { if (drag) { drag.p = at(e); show(drag.p); } else if (e.pointerType === 'mouse') tip(at(e)); });
  const end = () => {
    if (!drag) return; const p = drag.p; drag = null; seek.classList.remove('drag');
    if (isFinite(pDur())) pSeek(p * pDur());
    P.scrubbing = false; wakeHud(video.paused);
  };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => seek.addEventListener(ev, end));
})();

/* Up next + binge engine (behaviorHints.bingeGroup) */
function showUpNext() {
  const nv = nextVideo(P.ctx.meta, P.ctx.video); if (!nv || !$('#upNext').hidden) return;
  const box = $('#upNext'); box.hidden = false;
  box.innerHTML = `${imgTag(nv.thumbnail, nv.name || nv.title || '', videoIdFor(P.ctx.meta, nv), { wide: true })}<div style="min-width:0"><small>Up next · S${esc(nv.season)} E${esc(nv.episode)}</small><b>${esc(nv.name || nv.title || `Episode ${nv.episode}`)}</b><div class="actions"><button class="btn btn-prime btn-sm" type="button" id="unPlay">Play now</button><button class="btn btn-ghost btn-sm" type="button" id="unCancel">Hide</button></div></div>`;
  $('#unPlay').onclick = () => playNext(); $('#unCancel').onclick = () => { P.upNextDismissed = true; box.hidden = true; };
}
async function playEpisode(v) {
  const meta = P.ctx.meta, group = P.stream && P.stream.behaviorHints && P.stream.behaviorHints.bingeGroup;
  const id = videoIdFor(meta, v);
  toast(`Loading S${v.season} · E${v.episode}${group ? ' from the same source group' : ''}…`);
  const { streams } = await engine.fetchStreams('series', id);
  const pick = pickBest(streams, { bingeGroup: group });
  if (!pick) { toast('No playable stream for that episode', 'err'); return; }
  playStream({ meta, video: v, streams }, pick);
}
function playNext() { if (!P.ctx || !P.ctx.video) return; const nv = nextVideo(P.ctx.meta, P.ctx.video); if (nv) playEpisode(nv); }

/* Drawers */
function openDrawer(which) {
  const id = { src: '#srcDrawer', ep: '#epDrawer', party: '#partyDrawer', tx: '#txDrawer' }[which];
  closeDrawers(); $('#subMenu').hidden = true; $('#optMenu').hidden = true; $('#dspPop').hidden = true;
  $(id).classList.add('open'); wakeHud(true); const f = $(`${id} [data-nav]`); if (f) f.focus({ preventScroll: true });
}
function closeDrawers() { $$('#player .drawer.open').forEach((d) => d.classList.remove('open')); }
$$('[data-dclose]').forEach((b) => b.addEventListener('click', closeDrawers));
$('#pSrcBtn').onclick = () => ($('#srcDrawer').classList.contains('open') ? closeDrawers() : openDrawer('src'));
$('#pEpsBtn').onclick = () => ($('#epDrawer').classList.contains('open') ? closeDrawers() : openDrawer('ep'));
function renderSourceDrawer() {
  const streams = P.ctx.streams || [], best = pickBest(streams);
  $('#srcFilters').innerHTML = filterChips(streams, P.filter);
  $$('#srcFilters [data-filter]').forEach((b) => b.addEventListener('click', () => { P.filter = b.dataset.filter; renderSourceDrawer(); }));
  $('#srcList').innerHTML = filterStreams(streams, P.filter).map((s) => streamRowHTML(s, streams.indexOf(s), { best: s === best, current: s === P.stream })).join('') || '<div class="empty">No sources for this filter.</div>';
  $$('#srcList [data-si]').forEach((b) => b.addEventListener('click', () => {
    const s = streams[Number(b.dataset.si)]; const at = isFinite(pDur()) ? pNow() : 0;
    closeDrawers(); playStream(P.ctx, s, { startAt: at });
    if (at) toast(`Switched source at ${fmtTime(at)}`, 'ok');
  }));
  icons();
}
function renderEpisodeDrawer() {
  const meta = P.ctx.meta; if (!(meta.type === 'series' && meta.videos)) return;
  const ss = seasonsOf(meta); if (P.epSeason == null) P.epSeason = (ss.find(([s]) => s !== 0) || ss[0])[0];
  $('#epDrawerTitle').textContent = meta.name;
  $('#epDrawerSeasons').innerHTML = ss.map(([s]) => `<button class="chip ${s === P.epSeason ? 'on' : ''}" type="button" data-nav data-season="${s}">${s === 0 ? 'Specials' : `S${s}`}</button>`).join('');
  $$('#epDrawerSeasons [data-season]').forEach((b) => b.addEventListener('click', () => { P.epSeason = Number(b.dataset.season); renderEpisodeDrawer(); }));
  $('#epDrawerList').innerHTML = episodesHTML(meta, P.epSeason, P.ctx.video);
  bindEpisodes($('#epDrawerList'), meta, (v) => { closeDrawers(); playEpisode(v); });
  icons();
}

/* Subtitles: addons + stream.subtitles + tracks inside HLS/MP4 + local files.
   SRT, VTT, ASS/SSA and MicroDVD .sub are converted to WebVTT blobs. */
const langName = (code) => LANGS[String(code || '').toLowerCase()] || code || 'Unknown';
async function loadSubtitles(ctx, stream) {
  P.subs = (stream.subtitles || []).map((s) => ({ ...s, kind: 'url', _addon: stream._addon }));
  P.curSub = -1; P.subUserChoice = false; P.subDelay = 0; renderSubMenu();
  if (stream._local) return;
  const id = ctx.video ? ctx.video.id : ctx.meta.id;
  const bh = stream.behaviorHints || {};
  const extra = {}; if (bh.videoHash) extra.videoHash = bh.videoHash; if (bh.videoSize) extra.videoSize = bh.videoSize; if (bh.filename) extra.filename = bh.filename;
  P.subsLoading = true; renderSubMenu();
  try {
    const subs = await engine.fetchSubtitles(ctx.meta.type, id, extra);
    if (P.stream !== stream) return;
    P.subs = SubRank.merge(P.subs.concat(subs.map((x) => ({ ...x, kind: 'url' }))), stream);
  } catch (e) { /* no subtitle addons answered */ }
  P.subsLoading = false; renderSubMenu(); autoPickSub(); SubAuto.offer();
}
function addEmbeddedSubs() {
  P.subs = P.subs.filter((s) => s.kind !== 'hls' && s.kind !== 'native');
  if (P.hls && P.hls.subtitleTracks) P.hls.subtitleTracks.forEach((t, i) => P.subs.push({ kind: 'hls', idx: i, lang: t.lang, _label: `${t.name || langName(t.lang)} · in stream` }));
  else Array.from(video.textTracks).forEach((t, i) => { if (!t._mkc && (t.kind === 'subtitles' || t.kind === 'captions')) P.subs.push({ kind: 'native', idx: i, lang: t.language, _label: `${t.label || langName(t.language)} · in file` }); });
  renderSubMenu(); autoPickSub();
}
function autoPickSub() {
  const cur = P.subs && P.subs[P.curSub];
  if (!CFG.subAuto || P.subUserChoice || (P.curSub >= 0 && !(cur && cur._tr)) || !CFG.subLang || CFG.subLang === 'off') return;
  const i = SubRank.pick(P.subs);
  if (i >= 0) selectSub(i, { auto: true }); else SubAuto.offer();
}
const subLabel = (s) => s._label || `${langName(s.lang)}${s._addon ? ` · ${s._addon}` : ''}`;
function renderSubMenu() {
  const m = $('#subMenu'); if (!P.subs) return;
  const byLang = SubRank.order(P.subs);
  const subAddons = engine.addons.filter((a) => a.enabled && StremioEngine.resources(a.manifest).some((r) => r.name === 'subtitles')).length;
  const hasOS = engine.addons.some((a) => /opensubtitles/i.test(a.baseUrl) && !a.error);
  m.innerHTML = `<h5>Subtitles · ${P.subsLoading ? 'searching…' : `${P.subs.length} found`}</h5>
    <div class="seg-row"><button type="button" data-delay="-0.25">−0.25s</button><button type="button" data-delay="0" title="Reset delay">${P.subDelay >= 0 ? '+' : ''}${P.subDelay.toFixed(2)}s</button><button type="button" data-delay="0.25">+0.25s</button></div>
    <h5>Size · position</h5><div class="seg-row"><button type="button" data-ssize="-10" aria-label="Smaller subtitles">A−</button><button type="button" data-ssize="0" title="Reset size">${CFG.subSize}%</button><button type="button" data-ssize="10" aria-label="Larger subtitles">A+</button>${[['bottom', 'Low'], ['higher', 'Raised'], ['top', 'Top']].map(([v, l]) => `<button type="button" class="${CFG.subPos === v ? 'on' : ''}" data-spos="${v}">${l}</button>`).join('')}</div>
    <button type="button" class="${P.curSub < 0 ? 'on' : ''}" data-sub="-1"><i data-lucide="captions-off"></i>Off</button>
    ${byLang.slice(0, 120).map(([s, i]) => `<button type="button" class="${P.curSub === i ? 'on' : ''}" data-sub="${i}"><i data-lucide="${s._tr ? 'languages' : s.kind === 'file' ? 'file-text' : s.kind === 'url' ? 'captions' : 'film'}"></i>${esc(subLabel(s))}</button>`).join('')}
    ${!P.subs.length && !P.subsLoading ? `<p style="color:var(--mute);font-size:calc(12.5px * var(--ts,1));margin:6px 12px 8px;max-width:30ch">${subAddons ? 'Your subtitle addons had nothing for this title.' : 'No subtitle addon is installed or reachable.'}${hasOS ? '' : ' Add OpenSubtitles v3 to search thousands of languages.'}</p>` : ''}
    <button type="button" data-subfile><i data-lucide="file-up"></i>Load subtitle file…</button>
    ${hasOS ? '' : '<button type="button" data-addos><i data-lucide="plus"></i>Add OpenSubtitles v3</button>'}`;
  $$('[data-sub]', m).forEach((b) => b.addEventListener('click', () => { P.subUserChoice = true; selectSub(Number(b.dataset.sub)); }));
  $$('[data-ssize]', m).forEach((b) => b.addEventListener('click', () => { const k = Number(b.dataset.ssize); setCfg('subSize', k ? clamp(CFG.subSize + k, 50, 220) : 100); renderSubMenu(); }));
  $$('[data-spos]', m).forEach((b) => b.addEventListener('click', () => { setCfg('subPos', b.dataset.spos); renderSubMenu(); }));
  $$('[data-delay]', m).forEach((b) => b.addEventListener('click', () => setSubDelay(Number(b.dataset.delay) === 0 ? 0 : P.subDelay + Number(b.dataset.delay))));
  const f = $('[data-subfile]', m); if (f) f.onclick = () => $('#fileSubs').click();
  const os = $('[data-addos]', m); if (os) os.onclick = async () => { await installAddon(OPENSUBS); if (P.ctx) loadSubtitles(P.ctx, P.stream); };
  icons();
}
function clearSubTracks() {
  $$('track', video).forEach((t) => { if (t.src.startsWith('blob:')) URL.revokeObjectURL(t.src); t.remove(); });
  for (const tt of video.textTracks) tt.mode = 'disabled';
  if (P.hls) { P.hls.subtitleDisplay = false; P.hls.subtitleTrack = -1; }
}
async function selectSub(i, { auto = false } = {}) {
  clearSubTracks();
  const pick = P.subPick = (P.subPick || 0) + 1;
  P.curSub = i; renderSubMenu(); if (i < 0) return;
  const s = P.subs[i];
  try {
    if (s.kind === 'hls') { P.hls.subtitleTrack = s.idx; P.hls.subtitleDisplay = true; setTimeout(styleCues, 400); }
    else if (s.kind === 'native') { video.textTracks[s.idx].mode = 'showing'; styleCues(); }
    else {
      let text = s.text;
      if (text == null) { const res = await fetch(s.url); if (!res.ok) throw new Error(`HTTP ${res.status}`); text = await res.text(); }
      // another subtitle was picked while this one downloaded: two tracks would both stay on screen
      if (pick !== P.subPick) return;
      clearSubTracks();
      const vtt = StremioEngine.toVtt(text, s.fileName || s.url || '');
      const tr = document.createElement('track'); tr.kind = 'subtitles'; tr.label = subLabel(s); tr.srclang = String(s.lang || 'und').slice(0, 3); tr.default = true;
      tr.src = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
      video.appendChild(tr); tr.track._mkc = true;
      const show = () => { tr.track.mode = 'showing'; styleCues(); applySubDelay(); };
      tr.addEventListener('load', show); setTimeout(show, 80);
    }
    if (!auto) toast(`Subtitles: ${subLabel(s)}`, 'ok'); else toast(`${langName(s.lang)} subtitles on`, 'info', 2400, 'subs');
  } catch (e) { P.curSub = -1; renderSubMenu(); toast(`Could not load those subtitles (${e.message}). The host may block cross-origin requests.`, 'err'); }
}
function activeTrack() { return Array.from(video.textTracks).find((t) => t.mode === 'showing'); }
/* Delay shifts every cue of the showing track; originals are kept so it never drifts. */
function applySubDelay() {
  const t = activeTrack(); if (!t || !t.cues) return;
  for (const c of t.cues) { if (c._s == null) { c._s = c.startTime; c._e = c.endTime; } c.startTime = Math.max(0, c._s + P.subDelay); c.endTime = Math.max(0, c._e + P.subDelay); }
}
function setSubDelay(v) {}
function styleCues() {
  const line = { bottom: 'auto', higher: -4, top: 1 }[CFG.subPos];
  const t = activeTrack(); if (!t || !t.cues) return;
  for (const c of t.cues) { try { c.line = line; if (CFG.subPos === 'top') c.snapToLines = true; } catch (e) { /* read-only cue */ } }
}
async function loadSubFile(file) {
  const text = await file.text();
  const lang = (file.name.match(/[._-]([a-z]{2,3})\.(srt|vtt|ass|ssa|sub)$/i) || [])[1] || 'und';
  P.subs.unshift({ kind: 'file', text, fileName: file.name, lang, _label: `${file.name} · this device` });
  P.subUserChoice = true; selectSub(0);
}
$('#fileSubs').addEventListener('change', (e) => { const f = e.target.files[0]; if (f && P.ctx) loadSubFile(f); e.target.value = ''; });
$('#pSubs').onclick = () => { const m = $('#subMenu'); $('#optMenu').hidden = true; $('#dspPop').hidden = true; m.hidden = !m.hidden; wakeHud(true); };

/* Player options: speed, HLS quality levels, audio tracks, picture fit, ambilight */
function renderOptMenu() {
  const m = $('#optMenu'); const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  const levels = P.hls && P.hls.levels ? P.hls.levels : [];
  const audio = P.hls && P.hls.audioTracks && P.hls.audioTracks.length > 1 ? P.hls.audioTracks.map((t, i) => ({ i, label: t.name || langName(t.lang), on: P.hls.audioTrack === i }))
    : video.audioTracks && video.audioTracks.length > 1 ? Array.from(video.audioTracks).map((t, i) => ({ i, label: t.label || langName(t.language), on: t.enabled })) : [];
  m.innerHTML = `<h5>Speed</h5><div class="seg-row">${speeds.map((v) => `<button type="button" class="${video.playbackRate === v ? 'on' : ''}" data-speed="${v}">${v}×</button>`).join('')}</div>
    ${levels.length > 1 ? `<h5>Quality</h5><div class="seg-row"><button type="button" class="${P.hls.autoLevelEnabled ? 'on' : ''}" data-level="-1">Auto${P.hls.autoLevelEnabled && levels[P.hls.currentLevel] ? ` · ${levels[P.hls.currentLevel].height}p` : ''}</button>${levels.map((l, i) => [l, i]).sort((a, b) => b[0].height - a[0].height).map(([l, i]) => `<button type="button" class="${!P.hls.autoLevelEnabled && P.hls.currentLevel === i ? 'on' : ''}" data-level="${i}">${l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k`}</button>`).join('')}</div>` : ''}
    ${audio.length ? `<h5>Audio</h5>${audio.map((a) => `<button type="button" class="${a.on ? 'on' : ''}" data-audio="${a.i}"><i data-lucide="audio-lines"></i>${esc(a.label)}</button>`).join('')}` : ''}
    <h5>Aspect ratio</h5><div class="seg-row">${ASPECTS.map(([v, l]) => `<button type="button" class="${P.aspect === v ? 'on' : ''}" data-fit="${v}">${l}</button>`).join('')}</div>
    <h5>Zoom</h5><div class="seg-row">${[1, 1.1, 1.25, 1.5].map((z) => `<button type="button" class="${P.zoom === z ? 'on' : ''}" data-zoom="${z}">${Math.round(z * 100)}%</button>`).join('')}</div>
    ${TOUCH_UI && !IS_TV ? '<button type="button" data-lock><i data-lucide="lock"></i>Lock controls</button>' : ''}
    <button type="button" data-amb><i data-lucide="sun"></i>Ambilight ${P.amb ? 'on' : 'off'}</button>
    ${handoffUrl(P.stream) ? `<h5>Open in another app</h5>${playersHere().map((p) => `<button type="button" data-xp="${esc(p.id)}"><i data-lucide="${p.m3u ? 'list-video' : 'external-link'}"></i>${esc(p.m3u ? '.m3u playlist' : p.name)}</button>`).join('')}<button type="button" data-xcopy><i data-lucide="copy"></i>Copy stream link</button>` : ''}`;
  $$('[data-speed]', m).forEach((b) => b.addEventListener('click', () => { video.playbackRate = Number(b.dataset.speed); renderOptMenu(); }));
  $$('[data-level]', m).forEach((b) => b.addEventListener('click', () => { P.hls.currentLevel = Number(b.dataset.level); renderOptMenu(); }));
  $$('[data-audio]', m).forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.audio); if (P.hls && P.hls.audioTracks.length > 1) P.hls.audioTrack = i; else Array.from(video.audioTracks).forEach((t, k) => { t.enabled = k === i; }); renderOptMenu(); }));
  $$('[data-fit]', m).forEach((b) => b.addEventListener('click', () => { P.aspect = b.dataset.fit; applyPicture(); renderOptMenu(); }));
  $$('[data-zoom]', m).forEach((b) => b.addEventListener('click', () => { P.zoom = Number(b.dataset.zoom); applyPicture(); renderOptMenu(); }));
  const lk = $('[data-lock]', m); if (lk) lk.onclick = () => { m.hidden = true; setLock(true); };
  const amb = $('[data-amb]', m); if (amb) amb.onclick = () => { $('#pAmb').click(); renderOptMenu(); };
  $$('[data-xp]', m).forEach((b) => b.addEventListener('click', () => { const p = PLAYERS.find((x) => x.id === b.dataset.xp), ctx = P.ctx, st = P.stream; m.hidden = true; closePlayer(); Handoff.launch(p, ctx, st); }));
  const xc = $('[data-xcopy]', m); if (xc) xc.onclick = () => copyText(handoffUrl(P.stream));
  icons();
}
$('#pOpts').onclick = () => { const m = $('#optMenu'); $('#subMenu').hidden = true; $('#dspPop').hidden = true; m.hidden = !m.hidden; if (!m.hidden) renderOptMenu(); wakeHud(true); };
const cycleSub = () => { if (!P.subs.length) { toast('No subtitles for this stream'); return; } P.subUserChoice = true; const n = P.curSub + 1 >= P.subs.length ? -1 : P.curSub + 1; selectSub(n); if (n < 0) toast('Subtitles off'); };
const cycleAudio = () => {
  if (P.hls && P.hls.audioTracks.length > 1) { P.hls.audioTrack = (P.hls.audioTrack + 1) % P.hls.audioTracks.length; toast(`Audio: ${P.hls.audioTracks[P.hls.audioTrack].name || langName(P.hls.audioTracks[P.hls.audioTrack].lang)}`); }
  else if (!(typeof AudioLang !== 'undefined' && AudioLang.cycle())) toast('This stream has a single audio track');
};
const nudgeSpeed = (d) => { video.playbackRate = d === 0 ? 1 : clamp(Math.round((video.playbackRate + d) * 100) / 100, 0.25, 3); toast(`Speed ${video.playbackRate}×`, 'info', 1200); };

/* =====================================================================
   Addon manager
   ===================================================================== */
function renderAddons() {
  $('#addonSuggest').innerHTML = SUGGESTED.map((s) => `<button class="chip" type="button" data-nav data-url="${esc(s.url)}"><i data-lucide="plus"></i>${esc(s.name)}</button>`).join('');
  $$('#addonSuggest [data-url]').forEach((b) => b.addEventListener('click', () => { $('#addonUrl').value = b.dataset.url; if (!TOUCH_UI) $('#addonUrl').focus(); }));
  $('#addonList').innerHTML = engine.addons.map((a, i) => {
    const m = a.manifest, res = StremioEngine.resources(m);
    return `<div class="addon ${a.enabled ? '' : 'off'}">
      ${m.logo ? `<img class="logo" src="${esc(m.logo)}" alt="" data-nofb="1" referrerpolicy="no-referrer"><div class="logo" data-logo-alt hidden>${esc((m.name || '?').slice(0, 2).toUpperCase())}</div>` : `<div class="logo">${esc((m.name || '?').slice(0, 2).toUpperCase())}</div>`}
      <div style="min-width:0">
        <h4>${esc(m.name)} <span class="tag-s">v${esc(m.version || '?')}</span>${a.builtin ? '<span class="tag-s c">built-in</span>' : ''}${a.virtual ? '<span class="tag-s v">in-browser</span>' : ''}${a.studio ? '<span class="tag-s g">studio</span>' : ''}${a.error ? '<span class="tag-s r">unreachable</span>' : a.stale ? '<span class="tag-s">saved copy</span>' : ''}</h4>
        <p>${esc(a.error ? `Could not load the manifest: ${a.error}` : a.stale ? `Its server did not answer (${a.stale}), so MKCinema is using the copy it saved last time. Retry to check again.` : m.description || '')}</p>
        <div class="tele" style="margin-bottom:6px">${res.map((r) => `<span class="tag-s ${r.name === 'stream' ? 'g' : r.name === 'catalog' ? 'c' : 'v'}">${esc(r.name)}${r.types && r.types.length ? ` · ${esc(r.types.join('/'))}` : ''}${r.idPrefixes && r.idPrefixes.length ? ` · ${esc(r.idPrefixes.slice(0, 3).join(' '))}` : ''}</span>`).join('')}${(m.catalogs || []).length ? `<span class="tag-s">${m.catalogs.length} catalog${m.catalogs.length === 1 ? '' : 's'}</span>` : ''}${m.behaviorHints && m.behaviorHints.epgProvider ? `<span class="tag-s c">EPG</span>` : ''}</div>
        <div class="url">${esc(a.virtual ? `${a.baseUrl} (runs inside MKCinema)` : `${a.baseUrl}/manifest.json`)}</div>
      </div>
      <div class="addon-tools">
        <button class="ibtn" type="button" data-up="${i}" aria-label="Move up" title="Higher priority"><i data-lucide="chevron-up"></i></button>
        ${a.error || a.stale ? `<button class="ibtn" type="button" data-retry="${esc(a.baseUrl)}" aria-label="Retry" title="Retry"><i data-lucide="refresh-cw"></i></button>` : ''}
        ${a.virtual ? '' : `<button class="ibtn" type="button" data-copyurl="${esc(a.baseUrl)}/manifest.json" aria-label="Copy link" title="Copy manifest link"><i data-lucide="link"></i></button>`}
        ${a.builtin ? '' : `<button class="ibtn" type="button" data-rm="${esc(a.baseUrl)}" aria-label="Remove" title="Remove"><i data-lucide="trash-2"></i></button>`}
        <button class="switch ${a.enabled ? 'on' : ''}" type="button" data-toggle="${esc(a.baseUrl)}" aria-label="${a.enabled ? 'Disable' : 'Enable'} ${esc(m.name)}" role="switch" aria-checked="${a.enabled}"></button>
      </div></div>`;
  }).join('');
  icons();
  $$('#addonList [data-toggle]').forEach((b) => b.addEventListener('click', () => { engine.toggle(b.dataset.toggle); }));
  $$('#addonList [data-rm]').forEach((b) => b.addEventListener('click', () => { const a = engine.addons.find((x) => x.baseUrl === b.dataset.rm); if (a && a.studio) Store.set('studioMounted', false); engine.remove(b.dataset.rm); toast('Addon removed'); }));
  $$('#addonList [data-up]').forEach((b) => b.addEventListener('click', () => engine.move(engine.addons[Number(b.dataset.up)].baseUrl, -1)));
  $$('#addonList [data-copyurl]').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copyurl)));
  $$('#addonList [data-retry]').forEach((b) => b.addEventListener('click', () => installAddon(b.dataset.retry, true)));
  $('#proxyUrl').value = S.proxy;
  if (typeof AddonHealth !== 'undefined') AddonHealth.draw();
}
async function installAddon(url, retry) {
  try {
    const a = await engine.install(url, { builtin: url.startsWith('https://v3-cinemeta') || url.startsWith(OPENSUBS.replace('/manifest.json', '')) });
    if (a.baseUrl.includes('v3-cinemeta')) { engine.offline = false; $('#offlineNotice').hidden = true; MetaBackup.sync(); }
    toast(`${retry ? 'Reconnected' : 'Installed'} ${a.manifest.name}`, 'ok'); $('#addonUrl').value = '';
    return a;
  } catch (e) {
    const msg = /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? 'the server did not answer or blocks browser requests (CORS)' : e.message;
    toast(`Could not install: ${msg}`, 'err', 6000);
  }
}
$('#addonForm').addEventListener('submit', (e) => { e.preventDefault(); installAddon($('#addonUrl').value); });
$('#proxyUrl').addEventListener('change', (e) => { S.proxy = e.target.value.trim().replace(/\/+$/, ''); Store.set('proxy', S.proxy); toast('Proxy URL saved', 'ok'); });
$('#proxyTest').onclick = async () => {
  const st = $('#proxyState'); st.className = 'tag-s'; st.textContent = 'checking…';
  try {
    const r = await fetchT(`${String($('#proxyUrl').value).replace(/\/+$/, '')}/health`, {}, 5000); const j = await r.json();
    st.className = 'tag-s c'; st.textContent = `online · ${j.name || 'proxy'} ${j.version || ''}`;
  } catch (e) { st.className = 'tag-s r'; st.textContent = 'offline'; }
};
// on phones and tablets a focused field pops the keyboard over the list, so only keyboards-and-mice get the head start
$('#openAddons').onclick = () => { renderAddons(); openLayer('addons'); if (!TOUCH_UI) setTimeout(() => $('#addonUrl').focus(), 50); };

/* =====================================================================
   Addon Studio UI
   ===================================================================== */
const STUDIO_TYPES = ['movie', 'series', 'tv', 'channel'];
let studioTab = 'code';
const saveStudio = debounce(() => Store.set('studio', S.studio), 300);
function renderStudio() {
  const p = S.studio;
  const bind = (sel, key) => { const el = $(sel); el.value = p[key] ?? ''; el.oninput = () => { p[key] = el.value; studioChanged(); }; };
  bind('#st-id', 'id'); bind('#st-version', 'version'); bind('#st-name', 'name'); bind('#st-desc', 'description'); bind('#st-prefixes', 'prefixes'); bind('#st-catname', 'catalogName'); bind('#st-port', 'port');
  $('#st-types').innerHTML = STUDIO_TYPES.map((t) => `<label class="check"><input type="checkbox" id="st-type-${t}" value="${t}" ${p.types.includes(t) ? 'checked' : ''}>${t}</label>`).join('');
  $$('#st-types input').forEach((cb) => cb.addEventListener('change', () => { p.types = $$('#st-types input:checked').map((x) => x.value); renderStudioLists(); studioChanged(); }));
  renderStudioLists(); studioChanged();
}
function renderStudioLists() {
  const p = S.studio;
  $('#st-items').innerHTML = p.items.map((it, i) => `<div class="item-box"><header><span>Item ${i + 1}</span><button class="ibtn" type="button" data-rmitem="${i}" aria-label="Remove item"><i data-lucide="x"></i></button></header>
    <div class="s-grid" style="margin-bottom:0">
      <div class="field"><label for="it-${i}-id">ID</label><input class="inp mono" id="it-${i}-id" data-i="${i}" data-k="id" value="${esc(it.id)}"></div>
      <div class="field"><label for="it-${i}-type">Type</label><select class="inp" id="it-${i}-type" data-i="${i}" data-k="type">${(p.types.length ? p.types : ['movie']).map((t) => `<option ${it.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field full"><label for="it-${i}-name">Name</label><input class="inp" id="it-${i}-name" data-i="${i}" data-k="name" value="${esc(it.name)}"></div>
      <div class="field full"><label for="it-${i}-poster">Poster URL</label><input class="inp mono" id="it-${i}-poster" data-i="${i}" data-k="poster" value="${esc(it.poster)}" placeholder="https://…/poster.jpg (optional)"></div>
      <div class="field"><label for="it-${i}-genres">Genres</label><input class="inp" id="it-${i}-genres" data-i="${i}" data-k="genres" value="${esc(it.genres)}"></div>
      <div class="field"><label for="it-${i}-year">${it.type === 'series' ? 'Year · episodes' : 'Year'}</label><div class="inrow"><input class="inp" id="it-${i}-year" data-i="${i}" data-k="year" value="${esc(it.year)}">${it.type === 'series' ? `<input class="inp" id="it-${i}-eps" data-i="${i}" data-k="episodes" value="${esc(it.episodes || '1')}" inputmode="numeric" aria-label="Episode count" style="flex:0 1 80px">` : ''}</div></div>
      <div class="field full"><label for="it-${i}-desc">Description</label><input class="inp" id="it-${i}-desc" data-i="${i}" data-k="description" value="${esc(it.description)}"></div>
    </div></div>`).join('') || '<div class="empty" style="margin-bottom:12px">No items yet.</div>';
  $('#st-rules').innerHTML = p.rules.map((r, i) => `<div class="item-box"><header><span>Rule ${i + 1}</span><button class="ibtn" type="button" data-rmrule="${i}" aria-label="Remove rule"><i data-lucide="x"></i></button></header>
    <div class="s-grid" style="margin-bottom:0">
      <div class="field"><label for="ru-${i}-match">Match ID prefix</label><input class="inp mono" id="ru-${i}-match" data-r="${i}" data-k="match" value="${esc(r.match)}"></div>
      <div class="field"><label for="ru-${i}-name">Source name</label><input class="inp" id="ru-${i}-name" data-r="${i}" data-k="name" value="${esc(r.name)}"></div>
      <div class="field full"><label for="ru-${i}-url">Stream URL (.m3u8 or .mp4)</label><input class="inp mono" id="ru-${i}-url" data-r="${i}" data-k="url" value="${esc(r.url)}"></div>
      <div class="field full"><label for="ru-${i}-title">Title (multi-line, shown as telemetry)</label><textarea class="inp" rows="2" id="ru-${i}-title" data-r="${i}" data-k="title">${esc(r.title)}</textarea></div>
      <div class="field"><label for="ru-${i}-bg">bingeGroup</label><input class="inp mono" id="ru-${i}-bg" data-r="${i}" data-k="bingeGroup" value="${esc(r.bingeGroup)}"></div>
      <div class="field"><label for="ru-${i}-h">proxyHeaders.request (JSON)</label><input class="inp mono" id="ru-${i}-h" data-r="${i}" data-k="headers" value="${esc(r.headers)}" placeholder='{"Referer":"https://…"}'></div>
      <div class="field full"><label class="check" style="text-transform:none;letter-spacing:0;font-family:var(--f-body);font-size:calc(13px * var(--ts,1));color:var(--ink)"><input type="checkbox" id="ru-${i}-nwr" data-r="${i}" data-k="notWebReady" ${r.notWebReady ? 'checked' : ''}>notWebReady (forces external-player handoff)</label></div>
    </div></div>`).join('') || '<div class="empty" style="margin-bottom:12px">No stream rules yet.</div>';
  icons();
  $$('#st-items [data-k]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { p.items[el.dataset.i][el.dataset.k] = el.value; if (el.dataset.k === 'type') renderStudioLists(); studioChanged(); }));
  $$('#st-rules [data-k]').forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
    p.rules[el.dataset.r][el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.k === 'headers') el.style.borderColor = Studio.parseHeaders(el.value) === undefined ? 'var(--bad)' : '';
    studioChanged();
  }));
  $$('[data-rmitem]').forEach((b) => b.addEventListener('click', () => { p.items.splice(Number(b.dataset.rmitem), 1); renderStudioLists(); studioChanged(); }));
  $$('[data-rmrule]').forEach((b) => b.addEventListener('click', () => { p.rules.splice(Number(b.dataset.rmrule), 1); renderStudioLists(); studioChanged(); }));
}
const studioChanged = debounce(() => {
  saveStudio();
  const code = studioTab === 'code' ? Studio.code(S.studio) : JSON.stringify(Studio.manifest(S.studio), null, 2);
  $('#st-code').innerHTML = Studio.highlight(code);
  $('#st-url').textContent = `http://127.0.0.1:${Number(S.studio.port) || 7001}/manifest.json`;
}, 120);
$('#st-additem').onclick = () => { const t = S.studio.types[0] || 'movie'; S.studio.items.push({ id: `${Studio.splitList(S.studio.prefixes)[0] || 'studio:'}item-${S.studio.items.length + 1}`, type: t, name: 'New title', poster: '', genres: '', year: String(new Date().getFullYear()), description: '', episodes: '1' }); renderStudioLists(); studioChanged(); };
$('#st-addrule').onclick = () => { S.studio.rules.push({ match: Studio.splitList(S.studio.prefixes)[0] || '*', name: S.studio.name, title: '1080p · HLS', url: '', bingeGroup: '', headers: '', notWebReady: false }); renderStudioLists(); studioChanged(); };
$('#st-tab-code').onclick = () => { studioTab = 'code'; $('#st-tab-code').classList.add('on'); $('#st-tab-man').classList.remove('on'); studioChanged(); };
$('#st-tab-man').onclick = () => { studioTab = 'man'; $('#st-tab-man').classList.add('on'); $('#st-tab-code').classList.remove('on'); studioChanged(); };
function mountStudio(quiet) {
  const p = S.studio; const man = Studio.manifest(p);
  engine.addons.filter((a) => a.studio && a.id !== man.id).forEach((a) => engine.remove(a.baseUrl));
  engine.mountVirtual(man, Studio.handlers(p), { studio: true });
  Store.set('studioMounted', true);
  if (!quiet) { toast(`${man.name} is live inside MKCinema. Its catalog is on Home now.`, 'ok', 5000); }
}
$('#st-mount').onclick = () => mountStudio(false);
$('#st-export').onclick = () => {
  const code = Studio.code(S.studio);
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); a.download = 'addon.js';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Exported addon.js. If no download started (some previews block them), use Copy code.', 'ok', 5200);
  } catch (e) { copyText(code); }
};
$('#st-copy').onclick = () => copyText(Studio.code(S.studio));
$('#st-reset').onclick = () => { S.studio = STUDIO_DEFAULT(); Store.set('studio', S.studio); renderStudio(); toast('Studio reset to a blank addon'); };

/* =====================================================================
   Command palette (Ctrl/Cmd + K)
   ===================================================================== */
const COMMANDS = [
  { label: 'Go to Home', icon: 'house', run: () => go('home') },
  { label: 'Browse Movies', icon: 'clapperboard', run: () => go('movie') },
  { label: 'Browse Series', icon: 'tv', run: () => go('series') },
  { label: 'Open Live TV guide', icon: 'radio-tower', run: () => go('tv') },
  { label: 'Open Library', icon: 'bookmark', run: () => go('library') },
  { label: 'Open Addon Studio', icon: 'blocks', run: () => go('studio') },
  { label: 'Manage addons', icon: 'puzzle', run: () => $('#openAddons').click() },
  { label: 'Get Your Picks (describe what you want)', icon: 'sparkles', run: () => openPalette('', { ask: true }) },
  { label: 'Pick my favorites (taste)', icon: 'wand-sparkles', run: () => openQuickPick() },
  { label: 'Import from Stremio', icon: 'download', run: () => openStremioImport() },
  { label: 'Replay the walkthrough', icon: 'map', run: () => openTour(0) },
  ...(TOUCH_UI ? [] : [{ label: 'Toggle curved IMAX wall', icon: 'gallery-horizontal', run: () => setWall(!S.wall) }]),
  ...(IS_TV ? [] : [{ label: 'Toggle sound', icon: 'volume-2', run: () => toggleMute() }]),
];
/* Search: titles appear instantly from everything MKCinema has already loaded, then each addon's results
   stream in as soon as that addon answers (no waiting for the slowest one). Results are ranked by how well the
   title matches what you typed, then by rating. */
const PAL = { items: [], sel: 0, token: 0, ask: false, q: '' };
const normTitle = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
function titleMatch(name, q) {
  const n = normTitle(name), t = normTitle(q); if (!t) return 0;
  if (n === t) return 100; if (n.startsWith(t)) return 85; if (` ${n}`.includes(` ${t}`)) return 65; if (n.includes(t)) return 45;
  const ws = t.split(' '); if (ws.every((w) => n.includes(w))) return 35;
  if (ws.length > 1 && ws.filter((w) => n.includes(w)).length >= ws.length - 1) return 15;
  return 0;
}
const titleRank = (m, q, base = 0) => titleMatch(m.name, q) + base + (Number(m.imdbRating) || 0) * .6;
function openPalette(q = '', { ask = false } = {}) {
  openLayer('palette'); PAL.ask = ask;
  $('#palInput').value = typeof q === 'string' ? q : '';
  $('#palInput').placeholder = ask ? 'Describe it: “funny crime series”, “something like Arrival”…' : 'Search movies, series, channels, addons…';
  renderPalette($('#palInput').value); setTimeout(() => $('#palInput').focus(), 30);
}
function closePalette() { closeLayer('palette'); }
const recentSearches = () => Store.get('recentSearches', []);
function rememberSearch(q) { q = q.trim(); if (q.length < 2) return; Store.set('recentSearches', [q, ...recentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8)); }
function titleItem(m, q, why) {
  return { kind: 'title', group: m.type === 'series' ? 'Series' : m.type === 'movie' ? 'Movies' : 'Channels & more', m, label: m.name, sub: why || [yearOf(m), genresOf(m).slice(0, 2).join(', ')].filter(Boolean).join(' · '), run: () => { rememberSearch(q); openDetail(m); } };
}
function palCompose(q, titles, pending) {
  const t = q.trim(), lt = t.toLowerCase(), items = [];
  if (t && (PAL.ask || looksLikeAsk(t))) items.push({ kind: 'row', group: 'Your Picks', label: `Get picks for “${t}”`, sub: 'Plain-language recommendations, made on this device', icon: 'sparkles', run: () => { rememberSearch(t); showAsk(t); } });
  if (titles.length) {
    const [top, ...rest] = titles;
    items.push({ ...titleItem(top, t), kind: 'top', group: 'Top result' });
    ['Movies', 'Series', 'Channels & more'].forEach((g) => rest.filter((m) => titleItem(m, t).group === g).slice(0, 12).forEach((m) => items.push(titleItem(m, t))));
  }
  if (pending && t.length >= 2) items.push({ kind: 'status', group: titles.length ? 'Searching' : 'Titles', label: titles.length ? 'More results on the way…' : `Searching for “${t}”…`, icon: 'loader', run: () => {} });
  else if (t.length >= 2 && !titles.length && !items.length) items.push({ kind: 'status', group: 'Titles', label: `No titles found for “${t}”`, sub: 'Check the spelling, or install an addon with a search catalog.', icon: 'search-x', run: () => {} });
  const cmds = COMMANDS.filter((c) => (!lt ? false : c.label.toLowerCase().includes(lt))).map((c) => ({ ...c, kind: 'row', group: 'Commands' }));
  const addons = lt ? engine.addons.filter((a) => a.manifest.name.toLowerCase().includes(lt)).map((a) => ({ kind: 'row', group: 'Addons', label: a.manifest.name, sub: a.enabled ? 'Enabled' : 'Disabled', icon: 'puzzle', run: () => $('#openAddons').click() })) : [];
  if (!t) {
    const rec = recentSearches();
    if (rec.length) items.push({ kind: 'chips', group: 'Recent', chips: rec });
    (S.hero || []).slice(0, 8).forEach((m) => items.push({ ...titleItem(m, ''), group: 'Popular now' }));
    COMMANDS.slice(0, 6).forEach((c) => items.push({ ...c, kind: 'row', group: 'Jump to' }));
  }
  PAL.items = [...items, ...addons, ...cmds].map((it, i) => ({ ...it, i }));
  PAL.sel = Math.min(PAL.sel, Math.max(0, PAL.items.length - 1));
  palRender();
}
function palRender() {
  const groups = []; for (const it of PAL.items) { const g = groups[groups.length - 1]; if (g && g.name === it.group) g.items.push(it); else groups.push({ name: it.group, items: [it] }); }
  const on = (it) => (it.i === PAL.sel ? ' on' : '');
  const html = groups.map(({ name, items }) => {
    const k = items[0].kind;
    if (k === 'chips') return `<div class="pal-grp">${esc(name)}</div><div class="pal-chips">${items[0].chips.map((c) => `<button type="button" class="chip" data-recent="${esc(c)}"><i data-lucide="history"></i>${esc(c)}</button>`).join('')}</div>`;
    if (k === 'top') { const it = items[0], m = it.m; return `<div class="pal-grp">${esc(name)}</div><button class="pal-top${on(it)}" type="button" data-pi="${it.i}"><span class="pt-bg">${imgTag(metaBg(m) || metaPoster(m), '', m.id, { wide: true, nofb: true })}</span>${imgTag(metaPoster(m), m.name, m.id)}<span class="pt-body"><b>${esc(m.name)}</b><span class="pt-meta">${m.imdbRating ? `<span class="imdb ${rateTier(m.imdbRating)}"><b>IMDb</b>${esc(m.imdbRating)}</span>` : ''}<span>${esc([m.type === 'series' ? 'Series' : 'Movie', yearOf(m), genresOf(m).slice(0, 2).join(', ')].filter(Boolean).join(' · '))}</span></span>${m.description ? `<small>${esc(m.description)}</small>` : ''}</span><span class="pt-go"><i data-lucide="arrow-right"></i></span></button>`; }
    if (k === 'title') return `<div class="pal-grp">${esc(name)}</div><div class="pal-grid">${items.map((it) => `<button class="pal-tile${on(it)}" type="button" data-pi="${it.i}">${imgTag(metaPoster(it.m), it.m.name, it.m.id)}<b>${esc(it.m.name)}</b><small>${esc(it.sub)}</small></button>`).join('')}</div>`;
    return `<div class="pal-grp">${esc(name)}</div>${items.map((it) => `<button class="pal-item${on(it)}${it.kind === 'status' ? ' status' : ''}" type="button" data-pi="${it.i}"><span class="ic"><i data-lucide="${it.icon || 'circle'}"></i></span><span style="min-width:0"><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`).join('')}`;
  }).join('');
  $('#palRes').innerHTML = html || '<div class="empty" style="margin:8px">Type to search.</div>';
  icons();
  $$('#palRes [data-pi]').forEach((b) => { b.addEventListener('click', () => palRun(Number(b.dataset.pi))); });
  $$('#palRes [data-recent]').forEach((b) => b.addEventListener('click', () => { $('#palInput').value = b.dataset.recent; renderPalette(b.dataset.recent); $('#palInput').focus(); }));
  const el = $('#palRes .on'); if (el) el.scrollIntoView({ block: 'nearest' });
}
function palRun(i) { const it = PAL.items[i]; if (!it || it.kind === 'status' || it.kind === 'chips') return; closePalette(); it.run(); }
/* Instant: titles MKCinema has already seen. Then every search catalog, merged as each one answers. */
function renderPalette(q) {
  const t = q.trim(), token = ++PAL.token; PAL.sel = 0; PAL.q = t;
  const local = t.length ? [...S.metas.values()].filter((m) => m && m.name && titleMatch(m.name, t) >= 35).sort((a, b) => titleRank(b, t) - titleRank(a, t)).slice(0, 10) : [];
  palCompose(q, local, t.length >= 2);
  if (t.length < 2) return;
  palRemote(t, token, local);
}
const palRemote = debounce((t, token, local) => {
  if (token !== PAL.token) return;
  const cats = engine.catalogs({ needs: 'search', includeRequired: true });
  const found = new Map(local.map((m) => [m.id, { m, base: 0 }])); let pending = cats.length;
  const flush = () => {
    if (token !== PAL.token) return;
    const list = [...found.values()].filter(({ m }) => m.name).sort((a, b) => titleRank(b.m, t, b.base) - titleRank(a.m, t, a.base)).map((x) => x.m);
    const keepSel = PAL.sel; palCompose(t, list, pending > 0); PAL.sel = Math.min(keepSel, PAL.items.length - 1);
  };
  if (!cats.length) { pending = 0; flush(); return; }
  cats.forEach((c) => engine.fetchCatalog(c, { search: t })
    .then((metas) => metas.slice(0, 16).forEach((m, i) => { remember(m); const prev = found.get(m.id); const base = 12 - i * .6; if (!prev || prev.base < base) found.set(m.id, { m: { ...(prev ? prev.m : {}), ...m }, base }); }))
    .catch(() => {}).finally(() => { pending--; flush(); }));
}, 140);
$('#palInput').addEventListener('input', (e) => renderPalette(e.target.value));
$('#palInput').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); PAL.sel = clamp(PAL.sel + (e.key === 'ArrowDown' ? 1 : -1), 0, PAL.items.length - 1); palRender(); }
  if (e.key === 'Enter') { e.preventDefault(); const it = PAL.items[PAL.sel]; if (it && (it.kind === 'status' || it.kind === 'chips') && PAL.q && looksLikeAsk(PAL.q)) { closePalette(); showAsk(PAL.q); } else palRun(PAL.sel); }
});
$('#palClear').onclick = () => { $('#palInput').value = ''; renderPalette(''); $('#palInput').focus(); };
$('#openPalette').onclick = () => openPalette();

/* =====================================================================
   Spatial navigation: keyboard arrows + HTML5 Gamepad API
   ===================================================================== */
const Nav = {
  root() {
    for (const id of ['castLayer', 'partyLayer']) if (!$(`#${id}`).hidden) return $(`#${id}`);
    // TV: the Home-layout question and the donation prompt float over the page, so the remote goes to them first
    if (IS_TV && $('#player').hidden && !document.body.classList.contains('layer-open')) { const fa = document.getElementsByClassName('focus-ask')[0], sa = document.getElementsByClassName('sup-ask')[0], ask = fa && sa ? (fa.compareDocumentPosition(sa) & 4 ? fa : sa) : fa || sa; if (ask) return ask; }
    if (!$('#player').hidden && !$('#xray').hidden && $('#xray').contains(document.activeElement)) return $('#xray');
    if (!$('#player').hidden) { const d = $('.drawer.open', $('#player')); return d || (!$('#subMenu').hidden ? $('#subMenu') : !$('#optMenu').hidden ? $('#optMenu') : !$('#dspPop').hidden ? $('#dspPop') : (!$('#pMsg').hidden ? $('#pMsg') : $('#hud'))); }
    for (const id of ['tour', 'stremioImport', 'palette', 'settings', 'tastePick', 'addons', 'epSheet', 'detail', 'askLayer']) if (!$(`#${id}`).hidden) return $(`#${id}`);
    return $('#app');
  },
  // each candidate is measured once per key press (rects), not once to filter and again to score
  rects: new Map(),
  items(root) {
    const out = [], rects = this.rects; rects.clear();
    const railR = new Map(), vh = innerHeight;
    for (const el of root.querySelectorAll('[data-nav], button, a[href], input, select, textarea, [tabindex="0"]')) {
      if (el.disabled || el.tabIndex < 0 || el.style.visibility === 'hidden') continue;
      const pr = el.parentElement;
      if (pr && pr.classList.contains('rail')) {
        let rr = railR.get(pr);
        if (rr === undefined) { const b = pr.getBoundingClientRect(); rr = b.bottom > -vh * 1.5 && b.top < vh * 2.5; railR.set(pr, rr); }
        if (!rr) continue;
      }
      const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || el.closest('[hidden]')) continue;
      rects.set(el, r); out.push(el);
    }
    return out;
  },
  /* Left/Right inside a row: the next poster along, without measuring the whole page */
  step(cur, dir) {
    if (!cur.matches('.rail>.card')) return null;
    let el = cur;
    do { el = dir === 'right' ? el.nextElementSibling : el.previousElementSibling; } while (el && !el.matches('[data-nav]'));
    return el && !el.closest('[hidden]') ? el : null;
  },
  mem: new WeakMap(), auto: null, settleT: 0,
  focus(el, fast) {
    $$('.nav-focus').forEach((x) => x.classList.remove('nav-focus'));
    el.classList.add('nav-focus'); el.focus({ preventScroll: true });
    this.mem.set(this.root(), el); const rail = el.closest('.rail'); if (rail) { rail._navLast = el; if (rail._inf) Endless.near(rail, el); }
    if (!IS_TV) { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); return; }
    // TV: holding a direction scrolls instantly (smooth scrolls would queue up), the focused row sits mid-screen,
    // and the billboard comes fully back into view when you return to it
    const behavior = fast ? 'auto' : 'smooth';
    if (el.closest('#hero') && this.root().id === 'app') { scrollTo({ top: 0, behavior }); return; }
    if (el.closest('#hud')) return;
    const dk = el.closest('.dock'); /* 2.38.2: the rail scrolls inside itself; keep the focused item in view */
    if (dk) { const a = el.getBoundingClientRect(), d = dk.getBoundingClientRect(); if (a.top < d.top) dk.scrollTop -= d.top - a.top + 8; else if (a.bottom > d.bottom) dk.scrollTop += a.bottom - d.bottom + 8; return; }
    if (el.closest('.dock-wrap')) return;
    // inside a panel (details, settings...), anything in its top part scrolls the panel all the way up, so the
    // close button and the panel's top edge are never left cut off by the screen edge
    const lay = !rail && el.closest('.layer-ov');
    if (lay && lay.scrollTop > 0) { const y = el.getBoundingClientRect().bottom - lay.getBoundingClientRect().top + lay.scrollTop; if (y < lay.clientHeight * .7) { lay.scrollTo({ top: 0, behavior }); return; } }
    el.scrollIntoView({ block: rail ? 'center' : 'nearest', inline: 'nearest', behavior });
  },
  /* where the remote lands when nothing in the open panel has focus yet */
  start(root, list) {
    if (root.id === 'hud') return list.find((el) => el.id === 'pPlay') || list[0];
    if (root.id === 'app') return list.find((el) => el.id === 'heroPlay') || list.find((el) => el.matches('.card')) || list.find((el) => !el.closest('.dock-wrap')) || list[0];
    if (root.id === 'settings') return list.find((el) => el.matches('#setNav .on')) || list.find((el) => el.closest('#setNav [data-sec]')) || list[0];
    return list.find((el) => el.matches('.btn-prime')) || list.find((el) => !/close|back/i.test(`${el.getAttribute('aria-label') || ''} ${el.className}`)) || list[0];
  },
  restore(fast = true) {
    const root = this.root(), list = this.items(root); if (!list.length) return false;
    let el = this.mem.get(root); if (!el || !el.isConnected || !list.includes(el)) el = this.start(root, list);
    this.focus(el, fast); return el;
  },
  /* TV: after a panel opens or closes, put the focus somewhere visible (the last item used there, or its main button) */
  settle() {
    if (!IS_TV) return; clearTimeout(this.settleT);
    const run = (again) => {
      if (!$('#player').hidden) return;
      const root = this.root(), a = document.activeElement, inside = a && a !== document.body && root.contains(a) && !a.closest('[hidden]');
      if (inside && !(again && a === this.auto)) return;
      this.auto = this.restore(true) || null;
      if (!again) this.settleT = setTimeout(() => run(true), 650);
    };
    this.settleT = setTimeout(() => run(false), 140);
  },
  move(dir, fast) {
    const root = this.root();
    const cur = root.contains(document.activeElement) && document.activeElement !== document.body ? document.activeElement : null;
    if (cur && (dir === 'left' || dir === 'right')) { const n = this.step(cur, dir); if (n) { this.focus(n, fast); return; } }
    const list = this.items(root); if (!list.length) return;
    if (!cur) { if (IS_TV) this.restore(fast); else this.focus(list[0]); return; }
    // 2.67.1 tv-playback: a lane (a film's cast and crew names) is one stop going up or down; Left and Right walk its names
    const lane = cur.closest('[data-nav-lane]'), vert = dir === 'up' || dir === 'down';
    if (lane && !vert) { const m = list.filter((x) => lane.contains(x)), n = m[m.indexOf(cur) + (dir === 'right' ? 1 : -1)]; if (n) { this.rects.clear(); this.focus(n, fast); return; } }
    // leaving a lane up or down starts from its left edge, so the row below gets its first item, not the one under a name
    const a = cur.getBoundingClientRect(), ax = lane && vert ? Math.min(a.left + a.width / 2, lane.getBoundingClientRect().left + 40) : a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur || el.contains(cur) || cur.contains(el)) continue;
      if (lane && vert && lane.contains(el)) continue;
      const b = this.rects.get(el) || el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      let main, cross, overlap;
      if (dir === 'left' || dir === 'right') { main = dir === 'right' ? dx : -dx; cross = Math.abs(dy); overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0; }
      else { main = dir === 'down' ? dy : -dy; cross = Math.abs(dx); overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0; }
      if (main <= 4) continue;
      if (root.id === 'xray' && (dir === 'left' || dir === 'right') && !overlap) continue;
      const score = main + cross * (overlap ? .6 : 2.6);
      // TV: the dock floats over the page, so from the page it is only picked when nothing else lies that way
      if (IS_TV && root.id === 'app' && el.closest('.dock-wrap') && !cur.closest('.dock-wrap')) { if (1e6 + score < bestScore) { bestScore = 1e6 + score; best = el; } continue; }
      if (score < bestScore) { bestScore = score; best = el; }
    }
    // Moving up or down into another row returns to the poster you last had in it, if it is still on screen
    if (best && (dir === 'up' || dir === 'down')) {
      const rail = best.closest('.rail'), last = rail && rail !== cur.closest('.rail') && rail._navLast;
      if (last && last.isConnected && this.rects.has(last)) { const r = this.rects.get(last); if (r.right > 0 && r.left < innerWidth) best = last; }
    }
    if (best) this.focus(best, fast);
    // TV, X-Ray open: Left from the player controls goes into the panel, Right out of it goes back to them
    else if (IS_TV && dir === 'left' && root.id === 'hud' && !$('#xray').hidden) { const l = this.items($('#xray')); if (l.length) this.focus(l.find((x) => x.matches('.xr2-p, .xr2-n')) || l[0], fast); }
    else if (IS_TV && dir === 'right' && root.id === 'xray') { const h = $('#hud'), l = this.items(h), t = this.mem.get(h); if (l.length) this.focus(t && t.isConnected && l.includes(t) ? t : this.start(h, l), fast); }
    this.rects.clear();
  },
};
function back() {
  for (const id of ['castLayer', 'partyLayer']) if (!$(`#${id}`).hidden) { closeLayer(id); return; }
  if (IS_TV && Nav.root().matches('.focus-ask, .sup-ask')) { Nav.root().remove(); tvBackHook(); Nav.settle(); return; }
  if (IS_TV && $('#player').hidden && !document.body.classList.contains('layer-open') && typeof Remote !== 'undefined' && Remote.hintEl) { Remote.unhint(); return; }
  if (!$('#player').hidden) {
    if (PlayerPlus.back()) return;
    if (!$('#subMenu').hidden || !$('#optMenu').hidden) { $('#subMenu').hidden = true; $('#optMenu').hidden = true; return; }
    if ($('.drawer.open', $('#player'))) { closeDrawers(); return; }
    if (IS_TV && $('#hud').contains(document.activeElement) && !$('#hud').classList.contains('idle')) { document.activeElement.blur(); $$('.nav-focus').forEach((x) => x.classList.remove('nav-focus')); $('#hud').classList.add('idle'); return; }
    closePlayer(); return;
  }
  if (!$('#trailer').hidden) { closeTrailer(); return; }
  if (!$('#tour').hidden) { endTour(); return; }
  if (!$('#stremioImport').hidden) { closeLayer('stremioImport'); return; }
  if (!$('#palette').hidden) { closePalette(); return; }
  if (EpSheet.isOpen()) { EpSheet.close(); return; }
  if (!$('#detail').hidden && !$('#askLayer').hidden) { closeLayer('detail'); return; }
  if (!$('#askLayer').hidden) { closeLayer('askLayer'); return; }
  if (!$('#tastePick').hidden) { closeLayer('tastePick'); return; }
  if (!$('#settings').hidden) { closeLayer('settings'); return; }
  if (!$('#addons').hidden) { closeLayer('addons'); if (S.view === 'home') renderHome(); return; }
  if (!$('#detail').hidden) { closeLayer('detail'); return; }
}
/* Android TV app 1.2 hands Back to the page only while an element with a known id shows; #remote is one of them and is
   otherwise unused, so whichever floating prompt is on screen carries it and Back closes that prompt, not the app. */
function tvBackHook() {
  if (!IS_TV || $('#remote')) return;
  const el = $('.focus-ask, .sup-ask') || (typeof Remote !== 'undefined' && Remote.hintEl && Remote.hintEl.isConnected ? Remote.hintEl : null);
  if (el) el.id = 'remote';
}
function handleKey(e) {
  const k = e.key, tag = (e.target && e.target.tagName) || '', typing = /INPUT|TEXTAREA|SELECT/.test(tag) && e.target.type !== 'checkbox' && e.target.type !== 'range';
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'k') { e.preventDefault(); $('#palette').hidden ? openPalette() : closePalette(); return; }
  if (k === 'Escape') { e.preventDefault(); back(); return; }
  if (e.keyCode === 461 || e.keyCode === 10009 || k === 'XF86Back' || k === 'GoBack' || k === 'BrowserBack') {
    e.preventDefault();
    const open = ['remote', 'castLayer', 'partyLayer', 'player', 'trailer', 'tour', 'stremioImport', 'palette', 'epSheet', 'askLayer', 'tastePick', 'settings', 'addons', 'detail'].some((id) => { const el = $(`#${id}`); return el && !el.hidden; });
    if (open) back(); else if (/Web0S|webOS/.test(navigator.userAgent)) window.close();
    return;
  }
  if (typing && IS_TV && !e.defaultPrevented && /^Arrow/.test(k) && e.target.tagName === 'INPUT') {
    // A remote has no Tab key: Up/Down always leave a text box, Left/Right leave it at either end of the text
    let edge = k === 'ArrowUp' || k === 'ArrowDown';
    if (!edge) { try { const t = e.target, a = t.selectionStart, z = t.selectionEnd; edge = a == null || (k === 'ArrowLeft' ? a === 0 && z === 0 : a === t.value.length); } catch (x) { edge = true; } }
    if (edge) { e.preventDefault(); Nav.move(k.slice(5).toLowerCase(), e.repeat); return; }
  }
  if (typing) return;
  const playerOpen = !$('#player').hidden, drawer = $('#player .drawer.open') || !$('#dspPop').hidden || !$('#subMenu').hidden || !$('#optMenu').hidden || !$('#pMsg').hidden;
  if (playerOpen && !drawer && IS_TV) {
    // TV remote in the player: Up/Down reach the controls, Left/Right seek unless a control has focus, OK plays/pauses
    const hud = $('#hud'), idle = hud.classList.contains('idle'), a = document.activeElement, xr = $('#xray'), onCtl = !!a && a !== document.body && ((!idle && hud.contains(a)) || (!xr.hidden && xr.contains(a)));
    if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); if (idle || !onCtl) { wakeHud(); Nav.restore(true); } else { Nav.move(k === 'ArrowUp' ? 'up' : 'down', e.repeat); wakeHud(); } return; }
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && onCtl) { e.preventDefault(); Nav.move(k === 'ArrowLeft' ? 'left' : 'right', e.repeat); wakeHud(); return; }
    if (k === 'Enter' && !onCtl && !Skip.visible()) { e.preventDefault(); if (a && a !== document.body) a.blur(); togglePlay(); wakeHud(); return; }
  }
  if (playerOpen && !drawer) {
    const map = { ' ': togglePlay, k: togglePlay, j: () => seekBy(-step()), l: () => seekBy(step()), ArrowLeft: () => seekBy(-step()), ArrowRight: () => seekBy(step()), g: () => setSubDelay(P.subDelay - .25), h: () => setSubDelay(P.subDelay + .25), v: cycleSub, b: cycleAudio, '[': () => nudgeSpeed(-.25), ']': () => nudgeSpeed(.25), '=': () => nudgeSpeed(0), o: () => $('#pOpts').click(), ArrowUp: () => { video.volume = clamp(video.volume + .1, 0, 1); }, ArrowDown: () => { video.volume = clamp(video.volume - .1, 0, 1); }, f: toggleFull, m: () => { video.muted = !video.muted; }, n: playNext, s: () => openDrawer('src'), e: () => !$('#pEpsBtn').hidden && openDrawer('ep'), c: () => $('#pSubs').click(), a: () => DSP.toggle(), p: () => Party.openPanel(), Backspace: back };
    if (map[k] && !(k === ' ' && e.target.tagName === 'BUTTON' && e.target !== document.body)) { e.preventDefault(); map[k](); wakeHud(); return; }
    if (k === 'Enter' && Skip.visible()) { e.preventDefault(); Skip.go(); return; }
    if (k === 'Enter' && document.activeElement === document.body) { togglePlay(); return; }
  }
  const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  if (dirs[k]) {
    e.preventDefault();
    // 2.67.1 tv-playback: a held arrow repeats faster than a slow TV box draws; a repeat that comes before the last move
    // reached the screen is dropped, so the highlight never runs ahead of what you see and OK opens what is shown
    if (IS_TV && e.repeat && Nav.drawing) return;
    Nav.move(dirs[k], e.repeat);
    if (IS_TV) { Nav.drawing = true; requestAnimationFrame(() => setTimeout(() => { Nav.drawing = false; }, 0)); }
    return;
  }
  if (IS_TV && k === 'Enter' && !playerOpen && (document.activeElement === document.body || !document.activeElement)) { e.preventDefault(); Nav.restore(true); return; }
  if (k === 'Backspace') { e.preventDefault(); back(); }
  if (k === '/' && $('#palette').hidden) { e.preventDefault(); openPalette(); }
}
document.addEventListener('keydown', handleKey);
document.addEventListener('pointerdown', () => $$('.nav-focus').forEach((x) => x.classList.remove('nav-focus')), { passive: true });

const Pad = {
  prev: {}, repeat: {}, active: false,
  start() { if (this.active) return; this.active = true; const loop = () => { if (!this.poll()) { this.active = false; return; } requestAnimationFrame(loop); }; requestAnimationFrame(loop); },
  press(name) {
    const fake = (key) => handleKey({ key, target: document.activeElement || document.body, preventDefault() {}, ctrlKey: false, metaKey: false });
    const playerOpen = !$('#player').hidden;
    switch (name) {
      case 'up': case 'down': case 'left': case 'right':
        if (playerOpen && !$('#player .drawer.open')) { Nav.move(name); wakeHud(); } else Nav.move(name); break;
      case 'a': { if (playerOpen && Skip.visible()) { Skip.go(); break; } const el = document.activeElement; if (el && el !== document.body) el.click(); else if (playerOpen) togglePlay(); break; }
      case 'b': back(); break;
      case 'x': if (playerOpen) togglePlay(); break;
      case 'y': if (playerOpen) openDrawer('src'); else openPalette(); break;
      case 'start': $('#palette').hidden ? openPalette() : closePalette(); break;
      case 'lb': case 'rb': {
        if (playerOpen) { seekBy(name === 'rb' ? 30 : -30); break; }
        const tabs = $$('#tabs .tab').filter((t) => getComputedStyle(t).display !== 'none'), i = tabs.findIndex((t) => t.classList.contains('on'));
        const n = tabs[clamp(i + (name === 'rb' ? 1 : -1), 0, tabs.length - 1)]; if (n) n.click(); break;
      }
      default: fake(name);
    }
  },
  poll() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    if (!pads.length) return false;
    const gp = pads[0], now = performance.now();
    const st = {
      up: gp.buttons[12]?.pressed || gp.axes[1] < -.55, down: gp.buttons[13]?.pressed || gp.axes[1] > .55,
      left: gp.buttons[14]?.pressed || gp.axes[0] < -.55, right: gp.buttons[15]?.pressed || gp.axes[0] > .55,
      a: gp.buttons[0]?.pressed, b: gp.buttons[1]?.pressed, x: gp.buttons[2]?.pressed, y: gp.buttons[3]?.pressed,
      lb: gp.buttons[4]?.pressed, rb: gp.buttons[5]?.pressed, start: gp.buttons[9]?.pressed,
    };
    for (const [k, v] of Object.entries(st)) {
      if (v && !this.prev[k]) { this.press(k); this.repeat[k] = now + 380; }
      else if (v && ['up', 'down', 'left', 'right'].includes(k) && now > this.repeat[k]) { this.press(k); this.repeat[k] = now + 140; }
      this.prev[k] = v;
    }
    return true;
  },
};
addEventListener('gamepadconnected', (e) => { toast(`Controller connected: ${e.gamepad.id.split('(')[0].trim()}. D-pad moves, A selects, B goes back.`, 'ok', 5000); Pad.start(); });

/* =====================================================================
   Intro orchestration + sound
   ===================================================================== */
const INTRO = { tl: null, skipping: false };
function setMuteIcon() { $('#muteBtn').innerHTML = `<i data-lucide="${sfx.muted ? 'volume-x' : 'volume-2'}"></i>`; $('#muteBtn').classList.toggle('on', !sfx.muted && !!sfx.ctx && sfx.ctx.state === 'running'); icons(); }
async function toggleMute() { sfx.setMuted(!sfx.muted); if (!sfx.muted) await sfx.unlock(); setMuteIcon(); }
function layoutWord() { $('#introWord').innerHTML = [...'MKCINEMA'].map((c, i) => `<span class="${i < 2 ? 'c1' : 'c2'}">${c}</span>`).join(''); }
function revealApp(instant) {
  const app = $('#app');
  if (instant || !window.gsap) { app.classList.remove('pre'); app.style.cssText = ''; return; }
  gsap.fromTo(app, { opacity: 0, scale: .97 }, { opacity: 1, scale: 1, duration: .9, ease: 'power3.out', delay: .1, onStart: () => app.classList.remove('pre'), onComplete: () => { app.style.cssText = ''; } });
}
function finishIntro() {
  $('#intro').hidden = true; $('#skip').hidden = true; $('#soundgate').hidden = true; document.body.classList.remove('intro-on');
  Store.set('lastIntro', new Date().toDateString());
  $('#app').classList.remove('pre'); $('#app').style.cssText = '';
  if (window.gsap) gsap.killTweensOf('#app');
  syncLayers();
  INTRO.tl = null; INTRO.skipping = false;
}
const GSAP_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
/* GSAP used to block the page head on every launch; now it is fetched here, only when the intro plays */
function loadGsap(ms = 3000) {
  if (window.gsap) return Promise.resolve(true);
  if (!INTRO.gsapP) INTRO.gsapP = new Promise((res) => {
    const s = document.createElement('script'); s.src = GSAP_SRC; s.async = true;
    s.integrity = 'sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt'; s.crossOrigin = 'anonymous';
    s.onload = () => res(!!window.gsap); s.onerror = () => { INTRO.gsapP = null; res(false); };
    document.head.appendChild(s);
  });
  return Promise.race([INTRO.gsapP, new Promise((r) => setTimeout(() => r(!!window.gsap), ms))]);
}
function runIntro() {
  layoutWord();
  if (IS_TV) { revealApp(true); finishIntro(); return; }
  const intro = $('#intro'); intro.hidden = false; intro.style.opacity = '1';
  $('#introTag').style.opacity = '0'; $('#app').classList.add('pre'); document.body.classList.add('locked', 'intro-on');
  if (!window.gsap && !INTRO.gsapTried && !matchMedia('(prefers-reduced-motion: reduce)').matches && !CFG.reduceMotion) {
    INTRO.gsapTried = true; const ask = INTRO.ask = {}; loadGsap().then(() => { if (INTRO.ask === ask && !$('#intro').hidden) runIntro(); }); return;
  }
  if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches || CFG.reduceMotion) { revealApp(true); finishIntro(); return; }
  $('#skip').hidden = false; icons();
  $('#soundgate').hidden = !!(sfx.ctx && sfx.ctx.state === 'running') || sfx.muted;
  if (!INTRO.skipping) sfx.riser(2.6);
  gsap.set('.sp-ring', { strokeDashoffset: 1 }); gsap.set('.sp-mono, .sp-glow, .sp-line, #introWord span, #introTag', { opacity: 0 }); gsap.set('.sp-stage', { clearProps: 'all' });
  gsap.set('.sp-emblem', { opacity: 0, rotateY: -38, scale: .9 }); gsap.set('.sp-rule', { opacity: 0, scaleX: 0 });
  const tl = INTRO.tl = gsap.timeline({ onComplete: finishIntro });
  /* A hairline of light, the emblem turning in from the dark as its two rings draw, a platinum sheen across the
     monogram, then the wordmark set letter by letter above a fine rule. Transform and opacity only. */
  tl.fromTo('.sp-line', { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: .9, ease: 'expo.out' }, 0)
    .to('.sp-line', { opacity: 0, duration: .6 }, .8)
    .to('.sp-glow', { opacity: 1, duration: 1.4, ease: 'power2.out' }, .2)
    .to('.sp-emblem', { opacity: 1, rotateY: 0, scale: 1, duration: 1.7, ease: 'expo.out' }, .2)
    .to('.sp-r1', { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' }, .25)
    .to('.sp-r2', { strokeDashoffset: 0, duration: 1.2, ease: 'power2.inOut' }, .42)
    .to('.sp-mono', { opacity: 1, duration: .9, ease: 'power2.out' }, .75)
    .add(() => { if (!INTRO.skipping) sfx.chord(); }, 1.2)
    .fromTo('.sp-sheen', { attr: { x: -40 } }, { attr: { x: 170 }, duration: 1.15, ease: 'power2.inOut' }, 1.15)
    .fromTo('#introWord span', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .8, stagger: .05, ease: 'expo.out' }, 1.3)
    .fromTo('#introWord span', { backgroundPosition: '100% 0' }, { backgroundPosition: '0% 0', duration: 1.4, ease: 'power2.inOut' }, 1.5)
    .to('.sp-rule', { opacity: 1, scaleX: 1, duration: 1, ease: 'expo.out' }, 1.65)
    .fromTo('#introTag', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .9, ease: 'power3.out' }, 1.8)
    .add(() => revealApp(false), 3.05)
    .to('.sp-stage', { scale: 1.06, opacity: 0, duration: .7, ease: 'power2.in' }, 3)
    .to('#intro', { opacity: 0, duration: .6, ease: 'power1.in' }, 3.25);
}
function skipIntro() { if (!INTRO.tl) return; INTRO.skipping = true; INTRO.tl.progress(1); finishIntro(); revealApp(true); }
async function replayIntro() { await sfx.unlock(); setMuteIcon(); closeDrawers(); INTRO.skipping = false; window.scrollTo(0, 0); runIntro(); }
$('#skip').onclick = skipIntro;
$('#soundgate').onclick = async () => { await sfx.unlock(); $('#soundgate').hidden = true; setMuteIcon(); };
$('#openParty').onclick = () => Party.openPanel();
$('#muteBtn').onclick = toggleMute;
document.addEventListener('pointerdown', () => { if (!sfx.muted && (!sfx.ctx || sfx.ctx.state !== 'running')) sfx.unlock().then(setMuteIcon); }, { once: true, capture: true });

/* =====================================================================
   Wiring + boot
   ===================================================================== */
$$('#tabs .tab, #mtabs [data-view]').forEach((t) => t.addEventListener('click', () => go(t.dataset.view)));
$('#vRails').onclick = () => setWall(false); $('#vWall').onclick = () => setWall(true);
$('#discCatalog').addEventListener('change', (e) => { S.disc.cat = Number(e.target.value); S.disc.genre = ''; renderDiscover(S.disc.type); });
$('#discMore').onclick = () => { const cat = discoverCatalogs(S.disc.type)[S.disc.cat]; if (cat) loadDiscover(cat, false); };
/* Featured banner: swipe (or drag) sideways to move through the featured titles; arrows on desktop */
(function heroSwipe() {
  const el = $('#hero'), body = el.querySelector('.hero-body'); let st = null, moved = false;
  el.addEventListener('pointerdown', (e) => {
    if (S.hero.length < 2 || (e.pointerType === 'mouse' && e.button)) return;
    st = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, lock: null }; moved = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.lock && Math.hypot(dx, dy) > 8) st.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
    if (st.lock !== 'x') return;
    moved = true; st.dx = dx; clearTimeout(S.heroTimer); el.classList.add('dragging');
    body.style.transform = `translate3d(${(dx * .45).toFixed(1)}px,0,0)`; body.style.opacity = String(1 - Math.min(.65, Math.abs(dx) / 420));
  });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = st.dx, w = el.clientWidth; st = null; el.classList.remove('dragging'); body.style.transform = ''; body.style.opacity = '';
    if (Math.abs(dx) > Math.min(70, w * .12)) showHero(S.heroIdx + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    else if (moved) S.heroTimer = setTimeout(nextHero, 9000);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  // a swipe that started on a button is not a tap on it
  el.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  $('#heroPrev').onclick = () => showHero(S.heroIdx - 1, -1);
  $('#heroNext').onclick = () => showHero(S.heroIdx + 1, 1);
})();
$('#heroPlay').onclick = () => { const m = S.hero[S.heroIdx]; if (m) quickPlay(m); };
$('#heroInfo').onclick = () => { const m = S.hero[S.heroIdx]; if (m) openDetail(m); };
// Catalog entries often carry no trailer list, so the full metadata is fetched on demand
$('#heroTrailer').onclick = async () => {
  const m = S.hero[S.heroIdx]; if (!m) return;
  if (!(m.trailerStreams || []).length && !(m.trailers || []).length) {
    const b = $('#heroTrailer'); b.disabled = true;
    try { Object.assign(m, remember({ ...m, ...((await engine.fetchMeta(m.type, m.id)) || {}) })); } catch (e) { /* playTrailer explains */ }
    b.disabled = false;
  }
  playTrailer(m);
};
$('#heroList').onclick = () => { const m = S.hero[S.heroIdx]; if (m) { toggleWatchlist(m); showHero(S.heroIdx); renderHome(); } };
$$('[data-close]').forEach((b) => b.addEventListener('click', () => { const ov = b.closest('.layer-ov'); if (ov) { closeLayer(ov.id); if (ov.id === 'addons' && S.view === 'home') renderHome(); } }));
$$('.layer-ov').forEach((ov) => ov.addEventListener('click', (e) => { if (e.target === ov) back(); }));
$('#retryCinemeta').onclick = () => installAddon(CINEMETA, true);
// Infinite scroll for Movies and Series: one check per frame at most, and only on those views
let moreRaf = 0;
addEventListener('scroll', () => {
  if (moreRaf || (S.view !== 'movie' && S.view !== 'series')) return;
  moreRaf = requestAnimationFrame(() => { moreRaf = 0; const s = document.getElementById('discMore'); if (s && !s.hidden && s.getBoundingClientRect().top < innerHeight + 400) s.click(); });
}, { passive: true });
addEventListener('beforeunload', () => saveProgress(true));

const rerender = debounce(() => {
  if (S.view === 'home') renderHome();
  if (S.view === 'movie' || S.view === 'series') renderDiscover(S.view);
  if (S.view === 'tv') renderTV();
  if (!$('#addons').hidden) renderAddons();
}, 120);
engine.on((ev) => { if (ev === 'addons' && S.booted) rerender(); });

async function loadAddons() {
  // read the saved lists before any install, and save once at the end
  const saved = { addons: Store.get('addons', []), order: Store.get('order', []), disabled: Store.get('disabled', []) };
  engine.booting = true;
  // an addon with a saved manifest is drawn from it at once; only addons new to this device wait for their server
  const recheck = [];
  const open = async (u, opt = {}) => {
    const base = StremioEngine.normalize(u), c = ManifestMemo.get(base);
    if (c) { engine.mount(base, c.m, { ...opt, silent: true }); recheck.push(base); return; }
    await engine.install(u, { ...opt, silent: true });
  };
  try {
  const [cm, os] = await Promise.allSettled([open(CINEMETA, { builtin: true }), open(OPENSUBS, { builtin: true })]);
  if (cm.status === 'fulfilled') engine.offline = false; else { engine.offline = true; engine.placeholder(StremioEngine.normalize(CINEMETA), 'Cinemeta', cm.reason.message, true); }
  if (os.status === 'rejected') engine.placeholder(StremioEngine.normalize(OPENSUBS), 'OpenSubtitles v3', os.reason.message, true);
  // keep Cinemeta first, OpenSubtitles second
  engine.addons.sort((a, b) => (b.baseUrl.includes('v3-cinemeta') - a.baseUrl.includes('v3-cinemeta')) || (b.baseUrl.includes('opensubtitles') - a.baseUrl.includes('opensubtitles')));
  const tr = trailersAddon(engine); engine.mountVirtual(tr.manifest, tr.handlers, { builtin: true });
  if (Store.get('studioMounted', false)) mountStudio(true);
  const stored = (Array.isArray(saved.addons) ? saved.addons : []).filter((u) => typeof u === 'string' && u && !u.includes('v3-cinemeta') && !u.includes('opensubtitles-v3.strem.io'));
  await Promise.allSettled(stored.map((u) => open(u).catch((e) => engine.placeholder(u, u.replace(/^https?:\/\//, ''), e.message, false))));
  const disabled = Array.isArray(saved.disabled) ? saved.disabled : []; engine.addons.forEach((a) => { if (disabled.includes(a.baseUrl)) a.enabled = false; });
  if (Array.isArray(saved.order) && saved.order.length) Store.set('order', saved.order);
  engine.applyOrder();
  } finally { engine.booting = false; }
  engine.persist();
  $('#offlineNotice').hidden = !engine.offline;
  MetaBackup.sync();
  // saved manifests are checked once Home is up; nothing waits for it
  if (recheck.length) setTimeout(() => engine.refresh(recheck).then(() => { $('#offlineNotice').hidden = !engine.offline; MetaBackup.sync(); if (!$('#addons').hidden) renderAddons(); }), 1500);
}
async function boot() {
  icons();
  setWall(S.wall && !TOUCH_UI); setMuteIcon();
  const start = (location.hash || '').replace('#', '');
  // 2.64.2: no intro splash; the boot cover is the only opening screen
  layoutWord(); revealApp(true); finishIntro();
  await loadAddons();
  icons();
  S.booted = true;
  const views = ['movie', 'series', 'tv', 'library', 'studio', 'calendar'], first = Layout.get().start;
  if (views.includes(start)) go(start); else if (views.includes(first) && !/^(play\?|remote=|party=|login=)/.test(start)) go(first); else renderHome();
  if (!/^login=/.test(start)) maybeTour();
  Deep.handle(); Governor.init(); PWA.init(); Support.maybe();
  setTimeout(() => Layout.ask(), 1500);
  if (IS_TV) { setTimeout(() => Nav.settle(), 1200); setTimeout(() => Nav.settle(), 3500); }
  if (navigator.getGamepads && Array.from(navigator.getGamepads()).some(Boolean)) Pad.start();
}
