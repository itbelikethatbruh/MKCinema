
/* =====================================================================
   2.53 Your stats: top films and shows, time watched, when you watch, streaks and who you watch with.
   Per seat and on this device only. Time counts what plays in MKCinema's own player from the day this
   arrives; finished films and episodes count from the very start of the seat's history.
   ===================================================================== */
if (!SEAT_KEYS.includes('watchLog')) SEAT_KEYS.push('watchLog');
const WatchStats = {
  log: null, dirty: false, last: null, sess: null, period: 'year',
  blank() { return { v: 1, since: Date.now(), d: {}, h: {}, t: {}, long: [] }; },
  load() {
    if (this.log) return this.log;
    let l = Store.get('watchLog', null);
    if (!l || typeof l !== 'object' || l.v !== 1) l = this.blank();
    ['d', 'h', 't'].forEach((k) => { if (!l[k] || typeof l[k] !== 'object') l[k] = {}; });
    if (!Array.isArray(l.long)) l.long = [];
    return (this.log = l);
  },
  flush() {
    if (!this.dirty || !this.log) return; this.dirty = false;
    const l = this.log, ids = Object.keys(l.t);
    if (ids.length > 900) ids.sort((a, b) => (l.t[b].last || 0) - (l.t[a].last || 0)).slice(900).forEach((k) => delete l.t[k]);
    const days = Object.keys(l.d); if (days.length > 800) days.sort().slice(0, days.length - 800).forEach((k) => delete l.d[k]);
    const mons = Object.keys(l.h); if (mons.length > 40) mons.sort().slice(0, mons.length - 40).forEach((k) => delete l.h[k]);
    Store.set('watchLog', l);
  },
  day: (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  /* one sample every 10 s: only time that really plays (position moving, tab or app showing the player) counts */
  tick() {
    const now = Date.now();
    const on = !!(P.ctx && P.ctx.meta && P.stream && !$('#player').hidden && !video.paused && !video.ended && video.readyState > 2);
    let pos = 0; try { pos = pNow(); } catch (e) { /* no media */ }
    const L = this.last;
    // the stretch since the last sample counts if the film moved on, so a pause keeps its last few seconds too
    if (L && P.ctx && L.ctx === P.ctx && now - L.at < 30000 && pos > L.pos) this.add(Math.min(30, (now - L.at) / 1000, (pos - L.pos) * 2 + 1), now);
    this.last = on ? { at: now, pos, ctx: P.ctx } : null;
    if (!on && L) this.flush();
  },
  add(sec, now) {
    const l = this.load(), m = P.ctx.meta, v = P.ctx.video, id = String(m.id || ''); if (!id) return;
    const d = new Date(now), mon = this.day(now).slice(0, 7), day = this.day(now);
    const t = l.t[id] || (l.t[id] = { s: 0, m: {} });
    t.n = String(m.name || t.n || '').slice(0, 120); t.ty = v || m.type === 'series' ? 'series' : (m.type || 'movie');
    const p = metaPoster(m); if (p && !String(p).startsWith('data:')) t.p = String(p).slice(0, 400);
    const g = genresOf(m).slice(0, 3); if (g.length) t.g = g;
    t.s += sec; t.m[mon] = (t.m[mon] || 0) + sec; t.last = now;
    l.d[day] = (l.d[day] || 0) + sec;
    const h = l.h[mon] || (l.h[mon] = new Array(24).fill(0)); h[d.getHours()] += sec;
    // a sitting ends after 20 minutes without playback
    const S2 = this.sess;
    if (!S2 || now - S2.end > 20 * 60e3) this.sess = { at: now, end: now, s: 0, titles: [t.n] };
    const s = this.sess; s.end = now; s.s += sec; if (t.n && !s.titles.includes(t.n)) s.titles.push(t.n);
    if (s.s >= 45 * 60) {
      const i = l.long.findIndex((x) => x.at === s.at);
      const rec = { at: s.at, s: Math.round(s.s), n: s.titles.slice(0, 3) };
      if (i >= 0) l.long[i] = rec; else l.long.push(rec);
      l.long.sort((a, b) => b.s - a.s); l.long = l.long.slice(0, 24);
    }
    this.dirty = true;
    if (!this.flushAt || now - this.flushAt > 60000) { this.flushAt = now; this.flush(); }
  },

  /* ---- reading ---- */
  inP(ts, per) {
    if (per === 'all') return true;
    const d = new Date(ts), n = new Date();
    return d.getFullYear() === n.getFullYear() && (per === 'year' || d.getMonth() === n.getMonth());
  },
  keyIn(k, per) { const n = this.day(Date.now()); return per === 'all' || (per === 'year' ? k.slice(0, 4) === n.slice(0, 4) : k.slice(0, 7) === n.slice(0, 7)); },
  /* tt123:1:4 is an episode of tt123; kitsu:9:3 an episode of kitsu:9; tt123 or kitsu:9 alone is a film */
  showOf(id) {
    const p = String(id).split(':');
    if (/^tt\d+$/.test(p[0])) return p.length >= 3 ? p[0] : null;
    return p.length >= 4 ? p.slice(0, 2).join(':') : p.length === 3 && /^\d+$/.test(p[2]) ? p.slice(0, 2).join(':') : null;
  },
  stubs() { const me = (Seats.cur() || {}).name || ''; return (typeof Stubs !== 'undefined' ? Stubs.list() : []).filter((x) => !x.seat || x.seat === me); },
  info(id) {
    const l = this.load(), t = l.t[id];
    if (t && t.n) return { name: t.n, poster: t.p || metaPoster({ id }) || '', genres: t.g || [] };
    const m = S.metas.get(id) || S.watchlist.find((x) => x.id === id) || Object.values(S.progress).find((p) => p.metaId === id) || this.stubs().find((x) => x.id === id);
    return m && m.name ? { name: m.name, poster: m.poster || metaPoster({ id }) || '', genres: genresOf(m) } : null;
  },
  compute(per) {
    const l = this.load(), W = watchedMap(), now = Date.now();
    let secs = 0; Object.entries(l.d).forEach(([k, v]) => { if (this.keyIn(k, per)) secs += v; });
    const films = [], eps = [], shows = new Map(), finDay = new Map();
    Object.entries(W).forEach(([id, at]) => {
      if (!at || !this.inP(at, per)) return;
      const sh = this.showOf(id), dk = this.day(at);
      finDay.set(dk, (finDay.get(dk) || 0) + 1);
      if (sh) { eps.push(id); const x = shows.get(sh) || { id: sh, eps: 0, secs: 0, last: 0 }; x.eps++; x.last = Math.max(x.last, at); shows.set(sh, x); } else films.push({ id, at });
    });
    const tSec = (t) => (per === 'all' ? t.s : Object.entries(t.m || {}).reduce((a, [k, v]) => a + (this.keyIn(k, per) ? v : 0), 0));
    const filmMap = new Map(films.map((f) => [f.id, { id: f.id, secs: 0, done: f.at }]));
    Object.entries(l.t).forEach(([id, t]) => {
      const s = tSec(t); if (s < 60) return;
      if (t.ty === 'series') { const x = shows.get(id) || { id, eps: 0, secs: 0, last: t.last || 0 }; x.secs += s; shows.set(id, x); }
      else { const x = filmMap.get(id) || { id, secs: 0, done: 0 }; x.secs += s; filmMap.set(id, x); }
    });
    const topFilms = [...filmMap.values()].sort((a, b) => b.secs - a.secs || b.done - a.done).slice(0, 5);
    const topShows = [...shows.values()].sort((a, b) => b.eps - a.eps || b.secs - a.secs).slice(0, 5);
    // genres: playing time where it is known, plus a fixed weight for each finish
    const gen = new Map(), addG = (gs, w) => (gs || []).slice(0, 3).forEach((g) => gen.set(g, (gen.get(g) || 0) + w));
    Object.values(l.t).forEach((t) => { const s = tSec(t); if (s >= 60) addG(t.g, s); });
    films.forEach((f) => { if (!(l.t[f.id] && tSec(l.t[f.id]) >= 60)) { const i = this.info(f.id); if (i) addG(i.genres, 5400); } });
    shows.forEach((x) => { if (!(l.t[x.id] && tSec(l.t[x.id]) >= 60)) { const i = this.info(x.id); if (i) addG(i.genres, 1500 * x.eps); } });
    const gTot = [...gen.values()].reduce((a, b) => a + b, 0) || 1;
    const genres = [...gen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g, v]) => [g, v / gTot]);
    // when: hours of the day and days of the week, by time played (or by finishes before any time was counted)
    const hours = new Array(24).fill(0), week = new Array(7).fill(0);
    Object.entries(l.h).forEach(([k, arr]) => { if (this.keyIn(k, per)) arr.forEach((v, i) => { hours[i] += v || 0; }); });
    Object.entries(l.d).forEach(([k, v]) => { if (this.keyIn(k, per)) week[new Date(`${k}T12:00:00`).getDay()] += v; });
    let byTime = hours.some((v) => v > 0);
    if (!byTime) Object.values(W).forEach((at) => { if (at && this.inP(at, per)) { const d = new Date(at); hours[d.getHours()]++; week[d.getDay()]++; } });
    // streaks: any day with a finish or ten minutes of playing
    const days = new Set([...finDay.keys()]); Object.entries(l.d).forEach(([k, v]) => { if (v >= 600 && this.keyIn(k, per)) days.add(k); });
    const sorted = [...days].sort(); let best = 0, run = 0, prev = null;
    sorted.forEach((k) => { const t = new Date(`${k}T12:00:00`).getTime(); run = prev && Math.round((t - prev) / 864e5) === 1 ? run + 1 : 1; prev = t; best = Math.max(best, run); });
    let cur = 0; { let t = new Date(); if (!days.has(this.day(t))) t = new Date(t - 864e5); while (days.has(this.day(t))) { cur++; t = new Date(t - 864e5); } }
    let busy = null; finDay.forEach((n, k) => { if (!busy || n > busy.n) busy = { k, n }; });
    const long = l.long.filter((x) => this.inP(x.at, per))[0] || null;
    const withWho = new Map(); this.stubs().forEach((x) => { if (this.inP(x.at, per)) (x.with || []).forEach((n) => withWho.set(n, (withWho.get(n) || 0) + 1)); });
    const pals = [...withWho.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return { secs, films: films.length, eps: eps.length, shows: shows.size, topFilms, topShows, genres, hours, week, byTime, best, cur, busy, long, pals, since: l.since, empty: !secs && !films.length && !eps.length && !topFilms.length };
  },
  persona(h, w) {
    const sum = (a, b) => { let s = 0; for (let i = a; i !== b; i = (i + 1) % 24) s += h[i]; return s; };
    const tot = h.reduce((a, b) => a + b, 0); if (!tot) return null;
    const P4 = [['Night owl', 'Most of it after 10 pm.', sum(22, 4)], ['Early bird', 'Most of it before noon.', sum(4, 12)], ['Matinee regular', 'Most of it in the afternoon.', sum(12, 18)], ['Prime-timer', 'Most of it between 6 and 10 pm.', sum(18, 22)]];
    const top = P4.sort((a, b) => b[2] - a[2])[0]; const wt = w.reduce((a, b) => a + b, 0) || 1;
    const wkend = (w[0] + w[6]) / wt;
    return { name: top[0], why: top[1] + (wkend > .5 ? ' And mostly at weekends.' : '') };
  },
  hm(s) { s = Math.round(s / 60); const h = Math.floor(s / 60), m = s % 60; return h ? `${h.toLocaleString()} h${m ? ` ${m} m` : ''}` : `${m} m`; },
  /* something to compare the hours with, chosen so the number stays readable */
  likeness(sec) {
    const h = sec / 3600; if (h < 2) return '';
    const L = [[24 * 7, 'whole weeks, day and night'], [24, 'whole days, without a break'], [11, 'long-haul flights'], [8, 'full nights of sleep'], [2, 'feature films back to back']];
    for (const [v, t] of L) { const n = h / v; if (n >= 2 && n < 100) return `About ${n < 3 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n)} ${t}.`; }
    return '';
  },
  label(per) { const n = new Date(); return per === 'all' ? 'All time' : per === 'year' ? `${n.getFullYear()} so far` : `${n.toLocaleDateString(appLocale(), { month: 'long' })} so far`; },

  /* ---- the pop-up ---- */
  open(per) {
    this.flush(); if (per) this.period = per;
    const el = X8.layer('watchStats', { label: 'Your stats', wide: true });
    el.querySelector('.x8-modal').classList.add('ws-modal');
    this.paint(); X8.open('watchStats');
    this.names();
  },
  paint() {
    const body = X8.body('watchStats'); if (!body) return;
    const per = this.period, c = this.compute(per), seat = (Seats.cur() || {}).name || 'Main', me = Seats.all().length > 1 ? `${seat}’s` : 'Your';
    const pers = this.persona(c.hours, c.week), like = this.likeness(c.secs);
    const since = new Date(c.since).toLocaleDateString(appLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
    const row = (x, i, sub) => { const n = this.info(x.id) || { name: '', poster: '' }; return `<button type="button" class="ws-item" data-nav data-wsopen="${esc(x.id)}" style="--i:${i}"><span class="ws-rank tnum">${i + 1}</span>${n.poster ? `<img src="${esc(n.poster)}" alt="" loading="lazy">` : '<span class="ws-ph"></span>'}<span class="ws-it"><b>${esc(n.name || 'Loading…')}</b><small>${esc(sub)}</small></span></button>`; };
    const bars = (arr, labels, cls) => { const mx = Math.max(...arr, 1); return `<div class="ws-bars ${cls}">${arr.map((v, i) => `<span class="ws-b" title="${esc(labels[i])}"><i style="--v:${Math.max(.03, v / mx).toFixed(3)}"></i><em>${labels[i].length <= 3 ? esc(labels[i]) : ''}</em></span>`).join('')}</div>`; };
    const hrs = c.hours.map((_, i) => (i % 6 === 0 ? `${i}` : '')).map((t, i) => t || `${i}:00`);
    const wkOrder = [1, 2, 3, 4, 5, 6, 0], wkNames = wkOrder.map((d) => new Date(2024, 0, 7 + d).toLocaleDateString(appLocale(), { weekday: 'short' }));
    const tiles = [['Films finished', c.films.toLocaleString()], ['Episodes finished', c.eps.toLocaleString()], ['Shows', c.shows.toLocaleString()], ['Longest streak', `${c.best} day${c.best === 1 ? '' : 's'}`]];
    const facts = [];
    if (c.busy && c.busy.n > 1) facts.push(['Busiest day', `${c.busy.n} finished on ${new Date(`${c.busy.k}T12:00:00`).toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}`]);
    if (c.long) facts.push(['Longest sitting', `${this.hm(c.long.s)}${c.long.n.length ? `, ${c.long.n.join(', ')}` : ''}`]);
    if (per === 'all' && c.cur > 1) facts.push(['Current streak', `${c.cur} days in a row`]);
    if (c.pals.length) facts.push(['Watched with most', c.pals.map(([n, k]) => `${n} (${k})`).join(', ')]);
    body.innerHTML = `<div class="ws-head"><h2 class="x8-h">${esc(me)} stats</h2>
      <div class="segc ws-per" role="radiogroup" aria-label="Period">${[['month', 'This month'], ['year', 'This year'], ['all', 'All time']].map(([v, t]) => `<button type="button" class="${per === v ? 'on' : ''}" role="radio" aria-checked="${per === v}" data-nav data-wsper="${v}">${t}</button>`).join('')}</div></div>
      ${c.empty ? `<p class="sc-p ws-empty">Nothing to count for ${esc(this.label(per).toLowerCase())} yet. Finish a film or a few episodes and your stats start filling in.</p>` : `
      <section class="ws-hero" style="--i:0"><small>${esc(this.label(per))} · time watched</small><b class="tnum">${c.secs >= 60 ? esc(this.hm(c.secs)) : '0 m'}</b>
        <p>${esc(like || (c.secs < 60 ? `Time is counted from ${since}, as you play.` : ''))}</p>${pers ? `<span class="ws-tag"><i data-lucide="sparkles"></i>${esc(pers.name)}<em>${esc(pers.why)}</em></span>` : ''}</section>
      <div class="ws-tiles">${tiles.map(([k, v], i) => `<div class="ws-tile" style="--i:${i + 1}"><b class="tnum">${esc(v)}</b><small>${esc(k)}</small></div>`).join('')}</div>
      <div class="ws-cols">
        <section class="ws-card"><h3>Top films</h3>${c.topFilms.length ? c.topFilms.map((x, i) => row(x, i, x.secs >= 60 ? this.hm(x.secs) : 'Finished')).join('') : '<p class="ws-none">No films yet.</p>'}</section>
        <section class="ws-card"><h3>Top shows</h3>${c.topShows.length ? c.topShows.map((x, i) => row(x, i, [x.eps ? `${x.eps} episode${x.eps === 1 ? '' : 's'}` : '', x.secs >= 60 ? this.hm(x.secs) : ''].filter(Boolean).join(' · '))).join('') : '<p class="ws-none">No shows yet.</p>'}</section>
      </div>
      <div class="ws-cols">
        <section class="ws-card"><h3>Your genres</h3>${c.genres.length ? c.genres.map(([g, f], i) => `<div class="ws-g" style="--i:${i}"><span>${esc(g)}</span><span class="ws-gt"><i style="--v:${f.toFixed(3)}"></i></span><em class="tnum">${Math.round(f * 100)}%</em></div>`).join('') : '<p class="ws-none">Genres show up as you watch.</p>'}</section>
        <section class="ws-card"><h3>When you watch</h3>${bars(c.hours, hrs, 'ws-hours')}<div class="ws-ax"><span>Midnight</span><span>Noon</span><span>11 pm</span></div>${bars(wkOrder.map((d) => c.week[d]), wkNames, 'ws-week')}<p class="ws-none">${c.byTime ? 'By time played.' : 'By finishes, until time starts counting.'}</p></section>
      </div>
      ${facts.length ? `<section class="ws-card ws-facts">${facts.map(([k, v]) => `<div><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</section>` : ''}`}
      <p class="ws-foot">${esc(seat)} seat, kept on this device only. Time counts what plays in MKCinema’s player since ${esc(since)}; finished films and episodes count from the start.</p>
      <div class="ws-acts">${c.empty ? '' : '<button class="btn btn-prime btn-sm" type="button" data-nav data-wsa="save"><i data-lucide="download"></i>Save as picture</button>'}<button class="btn btn-ghost btn-sm" type="button" data-nav data-wsa="reset"><i data-lucide="eraser"></i>Reset time counts</button></div>`;
    icons();
    body.onclick = (e) => {
      const p = e.target.closest('[data-wsper]'); if (p) { this.period = p.dataset.wsper; this.paint(); this.names(); const n = $(`[data-wsper="${p.dataset.wsper}"]`, body); if (n && IS_TV) Nav.focus(n, true); return; }
      const o = e.target.closest('[data-wsopen]'); if (o) { const id = o.dataset.wsopen, t = this.load().t[id], sh = c.topShows.some((x) => x.id === id); X8.close('watchStats'); openDetail({ id, type: sh || (t && t.ty === 'series') ? 'series' : 'movie', name: (this.info(id) || {}).name || '' }); return; }
      const a = e.target.closest('[data-wsa]'); if (!a) return;
      if (a.dataset.wsa === 'save') this.save(c);
      if (a.dataset.wsa === 'reset') confirmTwice(a, () => { this.log = this.blank(); this.dirty = true; this.flush(); this.paint(); toast('Time counts reset. Finished titles stay.', 'ok'); });
    };
  },
  /* names for titles only known by id: asked of your addons once, then kept with the stats */
  async names() {
    const c = this.compute(this.period), need = [...c.topFilms.map((x) => [x.id, 'movie']), ...c.topShows.map((x) => [x.id, 'series'])].filter(([id]) => !this.info(id)).slice(0, 10);
    if (!need.length) return;
    let got = 0;
    await Promise.all(need.map(async ([id, type]) => {
      try { const m = await engine.fetchMeta(type, id); if (m && m.name) { remember(m); const l = this.load(); const t = l.t[id] || (l.t[id] = { s: 0, m: {} }); t.n = String(m.name).slice(0, 120); t.ty = type; const p = metaPoster(m); if (p) t.p = String(p).slice(0, 400); const g = genresOf(m).slice(0, 3); if (g.length) t.g = g; got++; } } catch (e) { /* stays unnamed */ }
    }));
    if (got) { this.dirty = true; this.flush(); const el = $('#watchStats'); if (el && !el.hidden) this.paint(); }
  },
  /* the stats as a picture: drawn on a canvas, text only, so nothing cross-site is needed */
  save(c) {
    const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const gold = 'rgba(217,212,199,.9)', dim = 'rgba(255,255,255,.62)', F = (w, s) => `${w} ${s}px Sora, system-ui, sans-serif`;
    g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, W, H);
    const gr = g.createRadialGradient(W * .8, 120, 20, W * .8, 120, 700); gr.addColorStop(0, 'rgba(217,212,199,.14)'); gr.addColorStop(1, 'rgba(217,212,199,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 2; g.strokeRect(36, 36, W - 72, H - 72);
    const seat = (Seats.cur() || {}).name || 'Main';
    g.fillStyle = gold; g.font = F(600, 24); g.fillText(`MKCINEMA · ${String(seat).toUpperCase().slice(0, 18)} · ${this.label(this.period).toUpperCase()}`, 90, 130);
    g.fillStyle = '#fff'; g.font = F(700, 132); g.fillText(c.secs >= 60 ? this.hm(c.secs) : `${c.films + c.eps}`, 84, 290);
    g.fillStyle = dim; g.font = F(500, 30); g.fillText(c.secs >= 60 ? 'watched' : 'titles finished', 90, 340);
    const pers = this.persona(c.hours, c.week); if (pers) { g.fillStyle = gold; g.font = F(600, 30); g.fillText(pers.name, 90, 395); }
    const tiles = [[c.films, 'films'], [c.eps, 'episodes'], [c.shows, 'shows'], [c.best, 'day streak']];
    tiles.forEach(([v, k], i) => { const x = 90 + i * 232; g.fillStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.roundRect(x, 440, 210, 140, 20); g.fill(); g.fillStyle = '#fff'; g.font = F(700, 52); g.fillText(String(v), x + 24, 515); g.fillStyle = dim; g.font = F(500, 24); g.fillText(k, x + 24, 556); });
    const list = (title, items, y) => {
      g.fillStyle = gold; g.font = F(600, 24); g.fillText(title.toUpperCase(), 90, y);
      items.slice(0, 3).forEach((x, i) => { const n = (this.info(x.id) || {}).name || ''; g.fillStyle = 'rgba(255,255,255,.4)'; g.font = F(700, 40); g.fillText(String(i + 1), 90, y + 62 + i * 58); g.fillStyle = '#fff'; g.font = F(600, 38); let t = n; while (t.length > 3 && g.measureText(t).width > W - 260) t = t.slice(0, -2); g.fillText(t === n ? t : `${t.trim()}…`, 150, y + 62 + i * 58); });
      return y + 62 + Math.max(1, Math.min(3, items.length)) * 58 + 22;
    };
    let y = 650; if (c.topFilms.length) y = list('Top films', c.topFilms, y); if (c.topShows.length) y = list('Top shows', c.topShows, y);
    if (c.genres.length && y < H - 140) { g.fillStyle = gold; g.font = F(600, 24); g.fillText('MOSTLY', 90, y); g.fillStyle = '#fff'; g.font = F(600, 36); g.fillText(c.genres.slice(0, 3).map(([n]) => n).join(' · '), 90, y + 52); }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.font = F(500, 22); g.fillText('mkcinema.app', 90, H - 80);
    cv.toBlob((b) => { if (!b) return; const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `MKCinema stats ${this.label(this.period)}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000); toast('Saved your stats as a picture', 'ok', 2400); }, 'image/png');
  },
  init() {
    this.load();
    setInterval(() => { try { this.tick(); } catch (e) { /* never block playback */ } }, 10000);
    const fl = () => { try { this.tick(); this.flush(); } catch (e) { /* storage blocked */ } };
    addEventListener('pagehide', fl);
    document.addEventListener('visibilitychange', () => { if (document.hidden) fl(); });
    video.addEventListener('pause', () => { try { this.tick(); this.flush(); } catch (e) { /* ok */ } });
    video.addEventListener('playing', () => { try { this.tick(); } catch (e) { /* ok */ } });
  },
};

{
  WatchStats.init();
  // Library: a Your stats chip beside New list
  const lr = Library.render.bind(Library);
  Library.render = function () {
    const r = lr(); const nb = $('#libNew');
    if (nb && !$('#libStats')) { nb.insertAdjacentHTML('beforebegin', '<button type="button" class="chip lib-new" data-nav id="libStats"><i data-lucide="bar-chart-3"></i>Your stats</button>'); $('#libStats').onclick = () => WatchStats.open(); icons(); }
    return r;
  };
  scAddRows('playback', 'stubsBtn', [
    { key: 'watchStatsBtn', label: 'Your stats', help: 'Top films and shows, time watched, when you watch and your streaks. Per seat, on this device only.', type: 'button', text: 'Open', icon: 'bar-chart-3', run: () => { closeLayer('settings'); WatchStats.open(); } },
  ]);
  COMMANDS.push({ label: 'Your stats', icon: 'bar-chart-3', run: () => WatchStats.open() });
}
