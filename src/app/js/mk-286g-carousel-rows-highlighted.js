
'use strict';
/* ---- Carousel rows: the highlighted poster stays near the left edge and grows, the rest of the row dims (made for TV remotes) ---- */
const CarouselRows = {
  on() { return CFG.rowStyle === 'carousel'; },
  apply() { document.documentElement.classList.toggle('tv-carousel', this.on()); },
  init() {
    this.apply();
    document.addEventListener('focusin', (e) => {
      if (!this.on()) return;
      const c = e.target && e.target.closest && e.target.closest('.rail > .card'); if (!c) return;
      const rail = c.parentElement; setTimeout(() => { const x = Math.max(0, c.offsetLeft - rail.clientWidth * 0.06); rail.scrollTo({ left: x, behavior: CFG.reduceMotion ? 'auto' : 'smooth' }); }, 0);
    });
  },
};
/* ---- TV keyboard: the TV's own, or MKCinema's A to Z or QWERTY keys that work with the remote ---- */
const TvKb = {
  want() { return IS_TV && (CFG.tvKb === 'abc' || CFG.tvKb === 'qwerty'); },
  open(el) {
    this.el = el;
    X8.layer('tvKb', { label: 'Keyboard', icon: 'keyboard', eyebrow: 'Type', wide: true });
    const b = X8.body('tvKb'), rows = CFG.tvKb === 'qwerty' ? ['1234567890', 'qwertyuiop', 'asdfghjkl\'', 'zxcvbnm-.'] : ['abcdefghi', 'jklmnopqr', 'stuvwxyz\'', '1234567890'];
    b.innerHTML = `<div class="kb-out" aria-live="polite"><span id="kbText"></span><i class="kb-caret"></i></div>
      <div class="kb-keys">${rows.map((r) => `<div class="kb-row">${[...r].map((ch) => `<button type="button" class="kb-k" data-nav data-kk="${esc(ch)}">${esc(ch.toUpperCase())}</button>`).join('')}</div>`).join('')}
      <div class="kb-row kb-wide"><button type="button" class="kb-k" data-nav data-kk=" "><i data-lucide="space"></i>Space</button><button type="button" class="kb-k" data-nav data-kb="del"><i data-lucide="delete"></i>Delete</button><button type="button" class="kb-k" data-nav data-kb="clear">Clear</button><button type="button" class="kb-k kb-done" data-nav data-kb="done"><i data-lucide="check"></i>Done</button></div></div>`;
    const paint = () => { $('#kbText', b).textContent = el.value; };
    const put = (v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); paint(); };
    $$('[data-kk]', b).forEach((k) => k.addEventListener('click', () => put(el.value + k.dataset.kk)));
    $$('[data-kb]', b).forEach((k) => k.addEventListener('click', () => {
      const a = k.dataset.kb;
      if (a === 'del') put(el.value.slice(0, -1)); else if (a === 'clear') put('');
      else { X8.close('tvKb'); el.dispatchEvent(new Event('change', { bubbles: true })); setTimeout(() => Nav.settle(), 60); }
    }));
    paint(); icons(); X8.open('tvKb');
    setTimeout(() => { const f = $('[data-kk]', b); if (f) Nav.focus(f, true); }, 60);
  },
};
window.MkTvKb = TvKb;
/* ---- Award winners, from Wikidata (open data), kept for a week ---- */
const Awards = {
  LIST: [['picture', 'Q102427', 'Best Picture', 'Oscars', 'movie'], ['intl', 'Q105304', 'International Feature', 'Oscars', 'movie'], ['animated', 'Q106800', 'Animated Feature', 'Oscars', 'movie'],
    ['palme', 'Q179808', 'Palme d’Or', 'Cannes', 'movie'], ['lion', 'Q209459', 'Golden Lion', 'Venice', 'movie'], ['bear', 'Q154590', 'Golden Bear', 'Berlin', 'movie'], ['bafta', 'Q139184', 'Best Film', 'BAFTA', 'movie'],
    ['globe', 'Q1011509', 'Best Drama', 'Golden Globes', 'movie'], ['emmyd', 'Q989438', 'Drama Series', 'Emmys', 'series'], ['emmyc', 'Q2110156', 'Comedy Series', 'Emmys', 'series'], ['anime', 'Q2510955', 'Animation of the Year', 'Japan Academy', 'movie']],
  cur: 'picture',
  async get(a) {
    const k = `award:${a[0]}`, c = Store.get(k, null); if (c && Date.now() - c.t < 7 * 864e5 && Array.isArray(c.l)) return c.l;
    const lang = String(appLocale() || 'en').slice(0, 2);
    const q = `SELECT ?imdb ?itemLabel (MAX(YEAR(?d)) AS ?y) WHERE { ?item p:P166 ?st. ?st ps:P166 wd:${a[1]}. OPTIONAL { ?st pq:P585 ?d } ?item wdt:P345 ?imdb. FILTER(STRSTARTS(?imdb, "tt")) SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en". } } GROUP BY ?imdb ?itemLabel ORDER BY DESC(?y) LIMIT 150`;
    const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { Accept: 'application/sparql-results+json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const seen = new Set(), l = ((await r.json()).results || {}).bindings.map((b) => ({ id: b.imdb.value, name: (b.itemLabel || {}).value || '', y: b.y ? Number(b.y.value) : 0 }))
      .filter((x) => /^tt\d+$/.test(x.id) && !/^Q\d+$/.test(x.name) && !seen.has(x.id) && seen.add(x.id));
    Store.set(k, { t: Date.now(), l }); return l;
  },
  open(id) {
    if (id) this.cur = id;
    X8.layer('awards', { label: 'Award winners', icon: 'trophy', eyebrow: 'Award winners', wide: true });
    this.paint(); X8.open('awards');
  },
  async paint() {
    const b = X8.body('awards'), a = this.LIST.find((x) => x[0] === this.cur) || this.LIST[0];
    b.innerHTML = `<div class="aw-chips">${this.LIST.map(([k, , n, by]) => `<button type="button" class="chip${k === a[0] ? ' on' : ''}" data-nav data-aw="${k}"><b>${esc(by)}</b>&nbsp;${esc(n)}</button>`).join('')}</div><div class="grid aw-grid" id="awGrid">${skeletons(12)}</div>`;
    $$('[data-aw]', b).forEach((x) => x.addEventListener('click', () => { this.cur = x.dataset.aw; this.paint(); }));
    try {
      const l = await this.get(a); if (this.cur !== a[0] || !$('#awGrid')) return;
      $('#awGrid').innerHTML = l.map((x) => cardHTML({ id: x.id, type: a[4], name: x.name, releaseInfo: x.y ? String(x.y) : '' }, { sub: x.y ? String(x.y) : '' })).join('') || '<div class="empty">Nothing listed yet.</div>';
      icons();
    } catch (e) { if ($('#awGrid')) $('#awGrid').innerHTML = '<div class="empty">The list did not load. Try again in a moment.</div>'; }
    if (IS_TV) { const f = $('[data-aw].on', b); if (f) Nav.focus(f, true); }
  },
};
window.MkAwards = Awards;
COMMANDS.push({ label: 'Award winners (Oscars, Cannes, Emmys and more)', icon: 'trophy', run: () => Awards.open() });
/* ---- Similar addons in Find addons: same kind of content, and similar words in the description ---- */
const AddonRel = {
  words(a) { return new Set(String(a.kd || '').split(' ').filter((w) => w.length >= 5)); },
  similar(a, dir) {
    const aw = this.words(a), at = new Set([...a.types, ...a.res]);
    return (dir.list || []).filter((x) => x !== a && x.url !== a.url && x.kn !== a.kn && (!x.adult || dir.adult)).map((x) => {
      const xt = [...x.types, ...x.res], inter = xt.filter((t) => at.has(t)).length, uni = new Set([...xt, ...at]).size || 1;
      let w = 0; this.words(x).forEach((t) => { if (aw.has(t)) w++; });
      return { x, s: inter / uni + w * 0.5 };
    }).filter((r) => r.s >= 1).sort((p, q) => q.s - p.s).slice(0, 6).map((r) => r.x);
  },
  html(a, dir) {
    const l = this.similar(a, dir);
    return `<div class="mkd-rel"><b>Similar addons</b>${l.length ? l.map((x) => `<button type="button" class="chip" data-nav data-mkq="${esc(x.name)}">${esc(x.name)}</button>`).join('') : '<span>Nothing close enough.</span>'}</div>`;
  },
  bind(body, dir) {
    $$('[data-mkr]', body).forEach((x) => x.addEventListener('click', () => { const i = Number(x.dataset.mkr); dir.rel = dir.rel === i ? null : i; dir.paintList(i); }));
    $$('[data-mkq]', body).forEach((x) => x.addEventListener('click', () => { dir.q = x.dataset.mkq; dir.rel = null; const q = $('#mkdQ'); if (q) q.value = dir.q; dir.n = 30; dir.paintList(0); }));
  },
};
window.MkAddonRel = AddonRel;
/* ---- Calendar: All / Episodes / Films filter with counts, and the most anticipated titles (with a Trakt app ID) ---- */
const CalPlus = {
  f: '',
  after(body, eps) {
    const nEp = eps.filter((e) => !e.film).length, nFilm = eps.length - nEp;
    if (nEp && nFilm) {
      const bar = document.createElement('div'); bar.className = 'segc cal-filter'; bar.setAttribute('role', 'radiogroup'); bar.setAttribute('aria-label', 'Show');
      bar.innerHTML = [['', 'All', eps.length], ['ep', 'Episodes', nEp], ['film', 'Films', nFilm]].map(([k, l, n]) => `<button type="button" data-nav data-calf="${k}" class="${this.f === k ? 'on' : ''}" role="radio" aria-checked="${this.f === k}">${l} <span class="tnum">${n}</span></button>`).join('');
      const nx = $('.cal-next', body); if (nx) nx.after(bar); else body.prepend(bar);
      $$('[data-calf]', bar).forEach((x) => x.addEventListener('click', () => { this.f = x.dataset.calf; $$('[data-calf]', bar).forEach((y) => { const on = y === x; y.classList.toggle('on', on); y.setAttribute('aria-checked', on); }); this.filter(body); }));
      this.filter(body);
    }
    this.anticipated(body);
  },
  filter(body) {
    $$('.cal-ep', body).forEach((r) => { const film = r.classList.contains('cal-film'); r.hidden = (this.f === 'ep' && film) || (this.f === 'film' && !film); });
    $$('.cal-day', body).forEach((d) => { d.hidden = !$$('.cal-ep', d).some((r) => !r.hidden); });
  },
  async anticipated(body) {
    const c = typeof Trakt !== 'undefined' ? Trakt.cfg() : {}; if (!c.clientId) return;
    let l = []; try {
      const [mv, sh] = await Promise.all([Trakt.api('/movies/anticipated?limit=12'), Trakt.api('/shows/anticipated?limit=12')]);
      const pick = (arr, k, type) => (arr || []).map((x) => x && x[k]).filter((x) => x && x.ids && /^tt\d+$/.test(x.ids.imdb || '')).map((x) => ({ id: x.ids.imdb, type, name: x.title, releaseInfo: x.year ? String(x.year) : '' }));
      const a = pick(mv, 'movie', 'movie'), b = pick(sh, 'show', 'series');
      for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) l.push(a[i]); if (b[i]) l.push(b[i]); }
    } catch (e) { return; }
    if (!l.length || !body.isConnected || $('.cal-ant', body)) return;
    const sec = rowShell('Most anticipated', ''); sec.classList.add('cal-ant'); body.appendChild(sec); fillRail(sec, l.map((m) => cardHTML(m)).join('')); icons();
  },
};
window.MkCalPlus = CalPlus;
/* ---- "Top on" rows for the streaming apps picked in Settings › Home › Your apps ---- */
const NetTop = {
  MAP: [[/netflix/i, 'nfx'], [/disney/i, 'dnp'], [/hbo|^max\b/i, 'hbm'], [/prime|amazon/i, 'amp'], [/apple tv/i, 'atp'], [/hulu/i, 'hlu'], [/paramount/i, 'pmp'], [/peacock/i, 'pcp'], [/crunchyroll/i, 'cru'], [/starz/i, 'stz']],
  cache: new Map(),
  ids() {
    if (CFG.netTop === false || typeof YourApps === 'undefined' || typeof Networks === 'undefined') return [];
    const out = []; YourApps.mine().forEach((x) => { const m = this.MAP.find(([re]) => re.test(String(x.name || ''))); if (m && !out.includes(m[1])) out.push(m[1]); });
    return out.slice(0, 6);
  },
  async metas(id) {
    const c = this.cache.get(id); if (c && Date.now() - c.t < 30 * 60e3) return c.l;
    const ad = Networks.addon(), got = await Promise.allSettled(['movie', 'series'].map((t) => engine.call(ad, 'catalog', t, id, {}).then((r) => (r.metas || []).filter((m) => m && m.id).map((m) => ({ ...m, type: m.type || t })))));
    const [a, b] = got.map((g) => (g.status === 'fulfilled' ? g.value : [])), l = [];
    for (let i = 0; i < 20; i++) { if (a[i]) l.push(a[i]); if (b[i]) l.push(b[i]); }
    this.cache.set(id, { t: Date.now(), l }); return l;
  },
  place() {
    if (typeof Seats !== 'undefined' && Seats.kids()) return;
    const ids = this.ids(), anchor = $('#holidayRow') || $('#netRow'); if (!anchor) return;
    $$('#homeRows > section.ntop-row').forEach((s) => { if (!ids.includes(s.dataset.net)) s.remove(); });
    let after = anchor;
    ids.forEach((id) => {
      let sec = $(`#ntop-${id}`);
      if (!sec) {
        sec = rowShell(`Top on ${Networks.net(id)[1]}`, '', { id: `ntop-${id}`, more: () => Networks.open(id) }); sec.classList.add('ntop-row'); sec.dataset.net = id;
        fillRail(sec, skeletons(8));
        this.metas(id).then((l) => { if (sec.isConnected) { fillRail(sec, l.slice(0, 24).map((m) => cardHTML(m)).join(''), ''); if (!l.length) sec.remove(); icons(); } }).catch(() => sec.remove());
      }
      if (after.nextElementSibling !== sec) after.after(sec);
      after = sec;
    });
  },
};
window.MkNetTop = NetTop;
/* ---- Hidden arcade: type "arcade" in the command bar. Two small games for the remote, a keyboard or a finger ---- */
const Arcade = {
  open() {
    X8.layer('arcade', { label: 'Arcade', icon: 'gamepad-2', eyebrow: 'You found the arcade', wide: true });
    const b = X8.body('arcade'), best = Store.get('arcadeBest', {}) || {};
    b.innerHTML = `<h3 class="x8-h">The back-row arcade</h3><p class="tour-note">Two quick games while the popcorn pops.</p>
      <div class="ar-cabs"><button type="button" class="ar-cab" data-nav data-ar="pop"><i data-lucide="popcorn"></i><b>Popcorn Catch</b><small>Catch the kernels. Left and Right move the bucket.${best.pop ? ` Best: ${best.pop}` : ''}</small></button>
      <button type="button" class="ar-cab" data-nav data-ar="mem"><i data-lucide="layout-grid"></i><b>Poster Pairs</b><small>Find the matching posters.${best.mem ? ` Best: ${best.mem} turns` : ''}</small></button></div><div id="arStage"></div>`;
    $$('[data-ar]', b).forEach((x) => x.addEventListener('click', () => (x.dataset.ar === 'pop' ? this.pop() : this.mem())));
    icons(); X8.open('arcade'); X8.backHook.arcade = () => { this.stop(); return false; };
    if (IS_TV) setTimeout(() => { const f = $('[data-ar]', b); if (f) Nav.focus(f, true); }, 60);
  },
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; if (this.keyFn) { removeEventListener('keydown', this.keyFn, true); this.keyFn = null; } },
  best(k, v, lower) { const b = Store.get('arcadeBest', {}) || {}; if (!b[k] || (lower ? v < b[k] : v > b[k])) { b[k] = v; Store.set('arcadeBest', b); return true; } return false; },
  pop() {
    this.stop();
    const st = $('#arStage'); st.innerHTML = '<canvas class="ar-cv" id="arCv" width="640" height="400" aria-label="Popcorn Catch"></canvas><div class="ar-hud"><span id="arScore">0</span><span id="arLives">♥♥♥</span></div>';
    const cv = $('#arCv'), g = cv.getContext('2d'), W = 640, H = 400;
    let x = W / 2, vx = 0, score = 0, lives = 3, items = [], t0 = performance.now(), last = t0, spawn = 0, over = false;
    const held = { l: false, r: false };
    this.keyFn = (e) => {
      if (!$('#arCv')) return this.stop();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); x = Math.max(40, Math.min(W - 40, x + (e.key === 'ArrowLeft' ? -34 : 34))); held[e.key === 'ArrowLeft' ? 'l' : 'r'] = true; setTimeout(() => { held.l = held.r = false; }, 160); }
      if ((e.key === 'Enter' || e.key === ' ') && over) { e.preventDefault(); e.stopPropagation(); this.pop(); }
    };
    addEventListener('keydown', this.keyFn, true);
    cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); x = ((e.clientX - r.left) / r.width) * W; });
    cv.addEventListener('click', () => { if (over) this.pop(); });
    const step = (now) => {
      const dt = Math.min(50, now - last) / 1000; last = now; const el = (now - t0) / 1000;
      vx = held.l ? -520 : held.r ? 520 : 0; x = Math.max(40, Math.min(W - 40, x + vx * dt));
      spawn -= dt; if (spawn <= 0 && !over) { spawn = Math.max(0.35, 1.1 - el * 0.02); items.push({ x: 30 + Math.random() * (W - 60), y: -10, v: 120 + el * 4 + Math.random() * 60, bad: Math.random() < 0.15 }); }
      items.forEach((k) => { k.y += k.v * dt; });
      items = items.filter((k) => {
        if (k.y > H - 46 && k.y < H - 20 && Math.abs(k.x - x) < 44) { if (k.bad) lives--; else score++; return false; }
        if (k.y > H + 10) { if (!k.bad) lives--; return false; }
        return true;
      });
      if (lives <= 0 && !over) { over = true; const nb = this.best('pop', score); items = []; $('#arScore').textContent = `${score}${nb ? ' · New best!' : ''} · OK to play again`; }
      g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, W, H);
      items.forEach((k) => { g.fillStyle = k.bad ? '#5a3b2a' : '#f6eccf'; g.beginPath(); g.arc(k.x, k.y, k.bad ? 7 : 9, 0, 7); g.fill(); if (!k.bad) { g.fillStyle = '#f0c27b'; g.beginPath(); g.arc(k.x + 4, k.y - 3, 4, 0, 7); g.fill(); } });
      g.fillStyle = '#c0392b'; g.fillRect(x - 36, H - 40, 72, 32); g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) g.fillRect(x - 30 + i * 18, H - 40, 8, 32);
      if (!over) { $('#arScore').textContent = String(score); $('#arLives').textContent = '♥'.repeat(Math.max(0, lives)); }
      if ($('#arCv')) this.raf = requestAnimationFrame(step); else this.stop();
    };
    this.raf = requestAnimationFrame(step);
  },
  mem() {
    this.stop();
    const pool = [...S.metas.values()].filter((m) => m && metaPoster(m)).slice(0, 60), picks = X8.seeded(pool, `ar${Date.now()}`).slice(0, 6);
    const st = $('#arStage'); if (picks.length < 6) { st.innerHTML = '<p class="tour-note">Browse a few rows first, so there are posters to match.</p>'; return; }
    const deck = X8.seeded([...picks, ...picks].map((m, i) => ({ m, i })), `d${Date.now()}`);
    let open = [], done = 0, turns = 0, lock = false;
    st.innerHTML = `<div class="ar-mem">${deck.map((c, k) => `<button type="button" class="ar-card" data-nav data-mc="${k}" aria-label="Card ${k + 1}"><span class="ar-back"><i data-lucide="film"></i></span><span class="ar-face" style="background-image:url('${esc(String(metaPoster(c.m)).replace(/'/g, '%27'))}')"></span></button>`).join('')}</div><p class="tour-note" id="arMemNote">Turns: 0</p>`;
    icons();
    $$('[data-mc]', st).forEach((b) => b.addEventListener('click', () => {
      if (lock || b.classList.contains('up')) return;
      b.classList.add('up'); open.push(b);
      if (open.length < 2) return;
      turns++; $('#arMemNote').textContent = `Turns: ${turns}`;
      const [p, q] = open, same = deck[p.dataset.mc].m.id === deck[q.dataset.mc].m.id; open = [];
      if (same) { done++; p.classList.add('ok'); q.classList.add('ok'); if (done === 6) { const nb = this.best('mem', turns, true); $('#arMemNote').textContent = `All pairs in ${turns} turns${nb ? ' · New best!' : ''}`; } }
      else { lock = true; setTimeout(() => { p.classList.remove('up'); q.classList.remove('up'); lock = false; }, 800); }
    }));
    if (IS_TV) setTimeout(() => { const f = $('[data-mc]', st); if (f) Nav.focus(f, true); }, 60);
  },
};
window.MkArcade = Arcade;
/* ---- settings ---- */
{
  const home = secById('home');
  if (home && !home.rows().some((r) => r.key === 'rowStyle')) {
    const rows = home.rows;
    home.rows = () => [...rows(),
      { key: 'rowStyle', label: 'Row style', help: 'Carousel keeps the highlighted poster near the left edge and makes it bigger. Made for the TV remote.', type: 'select', options: [['standard', 'Standard'], ['carousel', 'Carousel']], get: () => CFG.rowStyle || 'standard', set: (v) => { setCfg('rowStyle', v); CarouselRows.apply(); } },
      { key: 'netTop', label: '"Top on" rows for your apps', help: 'A row of what is popular on each streaming app you picked under Your apps.', type: 'toggle', get: () => CFG.netTop !== false, set: (v) => { setCfg('netTop', v); NetTop.place(); } },
      ...(IS_TV ? [{ key: 'tvKb', label: 'Keyboard', help: 'MKCinema’s own keys are easy to reach with the remote. The TV’s keyboard may offer voice typing.', type: 'select', options: [['system', 'The TV’s own keyboard'], ['abc', 'A to Z keys'], ['qwerty', 'QWERTY keys']], get: () => CFG.tvKb || 'system', set: (v) => setCfg('tvKb', v) }] : [])];
  }
}
CarouselRows.init();
