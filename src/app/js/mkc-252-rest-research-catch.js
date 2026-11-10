
/* =====================================================================
   2.52 The rest of the research
   1  Catch up to the room: joining a watch party late, you can start from the beginning (or ten minutes back) at
      1.5x speed with subtitles, and you rejoin the room's playback when you reach it.
   2  Which cut is this?: the player compares this copy's length with the film's listed runtime and reads edition
      words in the release name, and says which cut it probably is, and how sure that is.
   3  Shape of the film: a curve of how much is said, and how intensely, across the film, drawn from the subtitles.
      Tap it to jump. It shows no plot.
   4  Ticket stubs: each film you finish keeps a stub with the date, the seat and who you watched with. Save one as
      a picture to share.
   5  Film night: seats take turns picking. Tonight's picker's watchlist goes to a phone vote (Couch match), or
      straight to a watch party.
   Everything runs on this device.
   ===================================================================== */
const F52 = {
  played: () => !$('#player').hidden && !!P.ctx && !!P.stream,
  fmt(s) { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; },
  mins(s) { const m = Math.round(Math.abs(s) / 60); return `${m} min`; },
};

/* ---------------- 1 Catch up to the room ---------------- */
const CatchUp = {
  on: false, st: null, asked: new Set(), rate: 1.5, pillT: 0,
  target(st) {
    if (!st) return null;
    const off = Party.offsets.get(st._from) || 0;
    const elapsed = st.paused ? 0 : Math.max(0, (Date.now() + off - st.at) / 1000) * (st.rate || 1);
    const base = st.media && st.media.url && P.stream && st.media.url === P.stream.url ? st.pos + PartyLine.manual : PartyLine.local(st);
    return base + elapsed;
  },
  offer(at) {
    X8.layer('catchUp', { label: 'Catch up', icon: 'fast-forward', eyebrow: 'Watch party' });
    const body = X8.body('catchUp'), back = Math.max(0, at - 600);
    body.innerHTML = `<h2 class="x8-h">They’re ${F52.fmt(at)} in</h2>
      <p class="sc-p">Jump in where they are, or catch up at 1.5× with subtitles on. You rejoin their playback by yourself when you reach them.</p>
      <div class="cu-acts"><button class="btn btn-prime" type="button" data-nav data-cu="now"><i data-lucide="users"></i>Jump in now</button>
      ${at > 900 ? `<button class="btn btn-ghost" type="button" data-nav data-cu="${back}"><i data-lucide="rewind"></i>Catch up from ten minutes back</button>` : ''}
      <button class="btn btn-ghost" type="button" data-nav data-cu="0"><i data-lucide="fast-forward"></i>Catch up from the start</button></div>
      <p class="sc-p cu-note">At 1.5× you gain half a minute every minute, so ${F52.mins(at > 900 ? 600 : at)} behind takes about ${F52.mins((at > 900 ? 600 : at) * 2)}.</p>`;
    body.onclick = (e) => { const b = e.target.closest('[data-cu]'); if (!b) return; X8.close('catchUp'); if (b.dataset.cu !== 'now') this.start(Number(b.dataset.cu)); };
    icons(); X8.open('catchUp');
  },
  async start(from) {
    this.on = true; pSeek(from, { user: false });
    video.playbackRate = this.rate;
    if (P.curSub < 0 && (P.subs || []).length && typeof F50 !== 'undefined') { try { await selectSub(F50.subIdx(), { auto: true }); this.subsByUs = true; } catch (e) { /* no subtitles */ } }
    if (video.paused) video.play().catch(() => {});
    this.pill(true); Party.sysLine && Party.sysLine('You’re catching up at 1.5×');
  },
  stop(joined) {
    if (!this.on) return; this.on = false; video.playbackRate = CFG.speed || 1; this.pill(false);
    if (this.subsByUs && P.curSub >= 0) { selectSub(-1); } this.subsByUs = false;
    if (joined) { toast('You’re caught up and back with the room', 'ok', 3200); if (this.st) Party.applyState(this.st); }
  },
  pill(on) {
    let el = $('#cuPill');
    if (!on) { if (el) el.remove(); clearInterval(this.pillT); return; }
    if (!el) { document.body.insertAdjacentHTML('beforeend', '<div class="cu-pill" id="cuPill" role="status"><b>Catching up</b><span id="cuLeft"></span><button type="button" data-nav id="cuJump">Jump in</button></div>'); el = $('#cuPill'); $('#cuJump').onclick = () => { this.stop(false); if (this.st) Party.applyState(this.st); }; }
    clearInterval(this.pillT);
    this.pillT = setInterval(() => {
      if (!this.on) return; const t = this.target(this.st); const l = $('#cuLeft'); if (l && t != null) l.textContent = `${F52.fmt(Math.max(0, t - pNow()))} behind`;
      if (t != null && pNow() >= t - 1) this.stop(true);
      if (video.playbackRate !== this.rate && !video.paused) video.playbackRate = this.rate;
    }, 1000);
  },
  init() {
    const ap = Party.applyState;
    Party.applyState = async function (st) {
      if (st && st.media) CatchUp.st = st;
      if (CatchUp.on && st && st.media) {
        const mine = this.mediaInfo();
        if (mine && mine.metaId === st.media.metaId && mine.videoId === st.media.videoId) { const t = CatchUp.target(st); if (t == null || pNow() < t - 1) return; CatchUp.stop(true); return; }
        CatchUp.stop(false);
      }
      return ap.apply(this, arguments);
    };
    const lm = Party.loadMedia;
    Party.loadMedia = async function (media, at) {
      const r = await lm.apply(this, arguments);
      const key = `${this.code}|${media && media.metaId}|${media && media.videoId}`;
      if (!this.isHost() && at > 180 && !CatchUp.asked.has(key) && CFG.catchUpAsk !== false) { CatchUp.asked.add(key); setTimeout(() => { if (F52.played()) CatchUp.offer(at); }, 1200); }
      return r;
    };
    const lv = Party.leave;
    Party.leave = function () { CatchUp.stop(false); return lv.apply(this, arguments); };
    const close = closePlayer;
    closePlayer = async function () { CatchUp.stop(false); return close.apply(this, arguments); };
  },
};

/* ---------------- 2 Which cut is this? ---------------- */
const WhichCut = {
  TAGS: [[/director'?s[ ._-]?cut|\bdc\b/i, 'Director’s cut'], [/extended/i, 'Extended cut'], [/\bunrated\b/i, 'Unrated cut'], [/\buncut\b/i, 'Uncut'], [/theatrical/i, 'Theatrical cut'], [/ultimate/i, 'Ultimate cut'], [/final[ ._-]?cut/i, 'Final cut'], [/\bredux\b/i, 'Redux'], [/special[ ._-]?edition/i, 'Special edition'], [/\bimax\b/i, 'IMAX version'], [/remastered/i, 'Remastered']],
  guess() {
    if (!F52.played() || P.ctx.video) return null;
    const s = P.stream, bh = s.behaviorHints || {}, name = [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' ');
    const tags = this.TAGS.filter(([re]) => re.test(name)).map(([, l]) => l);
    const listed = X8.runtimeMin(P.ctx.meta) * 60, d = pDur();
    const diff = listed && isFinite(d) && d > 600 ? d - listed : null;
    let verdict = '', sure = '';
    if (tags.length) { verdict = tags[0]; sure = 'the release name says so'; }
    else if (diff != null && diff > 8 * 60) { verdict = 'A longer cut'; sure = `${F52.mins(diff)} longer than the listed runtime, more than credits explain`; }
    else if (diff != null && diff < -6 * 60) { verdict = 'A shorter version'; sure = `${F52.mins(diff)} shorter than the listed runtime, maybe cut for TV or a different region`; }
    else if (diff != null) { verdict = 'Probably the usual cut'; sure = `within a few minutes of the listed runtime`; }
    else { verdict = 'Not sure'; sure = 'the film has no listed runtime to compare with'; }
    return { verdict, sure, tags, listed, d, diff };
  },
  open() {
    const g = this.guess(); if (!g) { toast('Which cut works on films', 'info', 2400); return; }
    X8.layer('whichCut', { label: 'Which cut is this?', icon: 'scissors', eyebrow: 'Which cut is this?' });
    const body = X8.body('whichCut');
    const row = (k, v) => `<div class="wc-r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
    body.innerHTML = `<h2 class="x8-h">${esc(g.verdict)}</h2><p class="sc-p">Because ${esc(g.sure)}.</p>
      ${row('This copy', F52.fmt(g.d))}${g.listed ? row('Listed runtime', F52.fmt(g.listed)) : ''}${g.diff != null ? row('Difference', `${g.diff >= 0 ? '+' : '−'}${F52.fmt(Math.abs(g.diff))}`) : ''}${g.tags.length > 1 ? row('Also in the name', g.tags.slice(1).join(', ')) : ''}
      <p class="sc-p wc-note">Listed runtimes usually include the credits, so a few minutes either way is normal. Subtitles made for another cut drift apart in the middle; the subtitle sync in the player fixes the start and the speed, not missing scenes.</p>`;
    icons(); X8.open('whichCut');
  },
};

/* ---------------- 3 Shape of the film ---------------- */
const FilmShape = {
  N: 60,
  async data() {
    const sub = ScriptClock.pick(); if (!sub) return null;
    const r = await ScriptClock.cues(sub); const cues = (r && r.list) || []; if (cues.length < 40) return null;
    const d = pDur(); const end = isFinite(d) && d > 0 ? d : cues[cues.length - 1].e;
    const words = new Array(this.N).fill(0), heat = new Array(this.N).fill(0);
    cues.forEach((c) => {
      const i = Math.min(this.N - 1, Math.max(0, Math.floor(c.s / end * this.N))); const t = String(c.t);
      const w = t.split(/\s+/).filter(Boolean).length; words[i] += w;
      heat[i] += (t.match(/!/g) || []).length * 2 + (t.match(/\?/g) || []).length + (t.match(/\b[A-Z]{3,}\b/g) || []).length * 2 + (/^[-–]/.test(t) ? 1 : 0);
    });
    const norm = (a) => { const m = Math.max(1, ...a); return a.map((x) => x / m); };
    const smooth = (a) => a.map((x, i) => (a[i - 1] ?? x) * 0.25 + x * 0.5 + (a[i + 1] ?? x) * 0.25);
    return { end, words: norm(smooth(words)), heat: norm(smooth(heat)), lang: sub.lang || '' };
  },
  path(a, w, h) { return a.map((v, i) => `${i ? 'L' : 'M'}${(i / (a.length - 1) * w).toFixed(1)},${(h - v * (h - 6) - 3).toFixed(1)}`).join(' '); },
  async open() {
    if (!F52.played()) { toast('Start the film first', 'info', 2200); return; }
    X8.layer('filmShape', { label: 'Shape of the film', icon: 'activity', eyebrow: 'Shape of the film', wide: true });
    const body = X8.body('filmShape'); body.innerHTML = '<h2 class="x8-h">Shape of the film</h2><p class="sc-p">Reading the subtitles…</p>'; icons(); X8.open('filmShape');
    const s = await this.data();
    if (!s) { body.innerHTML = '<h2 class="x8-h">Shape of the film</h2><p class="sc-p">This needs subtitles for the film. Turn some on (any language), then open this again.</p>'; return; }
    const W = 600, H = 120, at = Math.min(1, pNow() / s.end);
    body.innerHTML = `<h2 class="x8-h">Shape of the film</h2>
      <p class="sc-p">How much is said, and how heated it gets, from start to end. Quiet stretches are usually action, music or silence. Tap anywhere to jump there. No plot is shown.</p>
      <svg class="fs-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Talk and intensity across the film">
        <path class="fs-talk" d="${this.path(s.words, W, H)} L${W},${H} L0,${H} Z"/><path class="fs-heat" d="${this.path(s.heat, W, H)}"/>
        <line class="fs-now" x1="${(at * W).toFixed(1)}" x2="${(at * W).toFixed(1)}" y1="0" y2="${H}"/></svg>
      <div class="fs-legend"><span><i class="fs-k talk"></i>How much is said</span><span><i class="fs-k heat"></i>How heated</span><span class="fs-t">${F52.fmt(s.end)}</span></div>`;
    icons();
    $('.fs-svg', body).onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); const f = (e.clientX - r.left) / r.width; pSeek(Math.max(0, f * s.end)); X8.close('filmShape'); };
  },
};

/* ---------------- 4 Ticket stubs ---------------- */
const Stubs = {
  list() { const l = Store.get('stubs', []); return Array.isArray(l) ? l : []; },
  keep(ctx) {
    const m = ctx && ctx.meta; if (!m || ctx.video || !m.id || String(m.id).startsWith('local:')) return;
    const l = this.list(); if (l.some((x) => x.id === m.id && Date.now() - x.at < 6 * 3600e3)) return;
    const seat = (Seats.cur() || {}).name || '';
    const withWho = Party.code ? [...Party.peers.values()].map((p) => p.name).filter(Boolean).slice(0, 4) : [];
    l.unshift({ id: m.id, name: m.name || '', year: yearOf(m) || '', poster: metaPoster(m) || '', at: Date.now(), seat, with: withWho, n: l.length + 1 });
    Store.set('stubs', l.slice(0, 500));
    toast(`Ticket stub kept for ${m.name}`, 'ok', 2400, 'stub');
  },
  /* the stub as a picture: drawn on a canvas, no network, poster left out so nothing cross-site is needed */
  draw(x) {
    const c = document.createElement('canvas'), W = 1080, H = 540; c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#111113'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1b1b1f'; g.beginPath(); g.roundRect(40, 40, W - 80, H - 80, 28); g.fill();
    g.strokeStyle = 'rgba(217,212,199,.35)'; g.setLineDash([10, 10]); g.beginPath(); g.moveTo(W - 300, 70); g.lineTo(W - 300, H - 70); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#111113'; [[W - 300, 40], [W - 300, H - 40]].forEach(([cx, cy]) => { g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = 'rgba(217,212,199,.8)'; g.font = '600 22px system-ui, sans-serif'; g.fillText('MKCINEMA · ADMIT ONE', 90, 110);
    g.fillStyle = '#fff'; g.font = '700 56px system-ui, sans-serif';
    const words = String(x.name).split(' '); let line = '', y = 200; const lines = [];
    words.forEach((w) => { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > W - 440 && line) { lines.push(line); line = w; } else line = t; }); lines.push(line);
    lines.slice(0, 3).forEach((l) => { g.fillText(l, 90, y); y += 64; });
    g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '500 26px system-ui, sans-serif';
    const d = new Date(x.at); g.fillText([x.year, d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })].filter(Boolean).join(' · '), 90, y + 10);
    if (x.with && x.with.length) g.fillText(`With ${x.with.join(', ')}`, 90, y + 50);
    g.fillStyle = 'rgba(217,212,199,.85)'; g.font = '600 22px system-ui, sans-serif'; g.fillText('SEAT', W - 250, 150); g.fillText('No.', W - 250, 300);
    g.fillStyle = '#fff'; g.font = '700 40px system-ui, sans-serif'; g.fillText(String(x.seat || 'Main').slice(0, 10), W - 250, 200); g.fillText(String(x.n || 1).padStart(4, '0'), W - 250, 350);
    return c;
  },
  save(x) { const c = this.draw(x); c.toBlob((b) => { if (!b) return; const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `${String(x.name).replace(/[\\/:*?"<>|]+/g, ' ').trim()} ticket stub.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 30000); }, 'image/png'); },
  open() {
    X8.layer('stubs', { label: 'Ticket stubs', icon: 'ticket', eyebrow: 'Ticket stubs', wide: true });
    const body = X8.body('stubs'), l = this.list();
    body.innerHTML = `<h2 class="x8-h">Your ticket stubs</h2><p class="sc-p">One for every film you finish, with the date, the seat and who you watched with. Save one as a picture to share.</p>
      ${l.length ? `<div class="st-list">${l.slice(0, 120).map((x, i) => `<div class="st-row"><div><b>${esc(x.name)}</b><small>${esc([x.year, new Date(x.at).toLocaleDateString(), x.seat, x.with && x.with.length ? `with ${x.with.join(', ')}` : ''].filter(Boolean).join(' · '))}</small></div><button class="btn btn-ghost btn-sm" type="button" data-nav data-stub="${i}"><i data-lucide="download"></i>Save</button></div>`).join('')}</div>`
    : '<p class="sc-p">No stubs yet. Finish a film and its stub appears here.</p>'}`;
    body.onclick = (e) => { const b = e.target.closest('[data-stub]'); if (b) this.save(l[Number(b.dataset.stub)]); };
    icons(); X8.open('stubs');
  },
  init() {
    const mw = markWatched;
    markWatched = function (id) { const had = !!watchedMap()[id]; const r = mw.apply(this, arguments); try { if (!had && P.ctx && P.ctx.meta && P.ctx.meta.id === id && CFG.stubs !== false) Stubs.keep(P.ctx); } catch (e) { /* never block progress */ } return r; };
  },
};

/* ---------------- 5 Film night ---------------- */
const FilmNight = {
  pool: null,
  turn() {
    const seats = Seats.all().filter((s) => !s.kids); if (!seats.length) return null;
    const st = Store.raw.get('filmNight', { i: 0 }) || { i: 0 };
    return seats[(Number(st.i) || 0) % seats.length];
  },
  advance() { const st = Store.raw.get('filmNight', { i: 0 }) || { i: 0 }; Store.raw.set('filmNight', { i: (Number(st.i) || 0) + 1, at: Date.now() }); },
  wl(s) { try { return (s.id === SEAT ? S.watchlist : s.id ? Seats.seatData(s.id).watchlist : Store.raw.get('watchlist', [])) || []; } catch (e) { return []; } },
  open() {
    const s = this.turn(); if (!s) return;
    X8.layer('filmNight', { label: 'Film night', icon: 'popcorn', eyebrow: 'Film night', wide: true });
    const body = X8.body('filmNight'), wl = this.wl(s).filter((m) => m && m.id && m.name).slice(0, 24), pick = new Set();
    const paint = () => {
      body.innerHTML = `<h2 class="x8-h">${esc(s.name)} picks tonight</h2>
        <p class="sc-p">Seats take turns. ${esc(s.name)} chooses up to three from their watchlist, then the room votes on their phones, or it goes straight to a watch party for friends who aren’t here.</p>
        ${wl.length ? `<div class="fn-grid">${wl.map((m, i) => `<button type="button" class="fn-t${pick.has(i) ? ' on' : ''}" data-nav data-fn="${i}" aria-pressed="${pick.has(i)}">${m.poster ? `<img src="${esc(m.poster)}" alt="" loading="lazy">` : ''}<span>${esc(m.name)}</span></button>`).join('')}</div>`
    : `<p class="sc-p">${esc(s.name)}’s watchlist is empty. Add a few films to it, or skip to the next seat.</p>`}
        <div class="fn-acts">${pick.size ? `${pick.size > 1 ? '<button class="btn btn-prime" type="button" data-nav data-fna="vote"><i data-lucide="smartphone"></i>Vote on our phones</button>' : '<button class="btn btn-prime" type="button" data-nav data-fna="play"><i data-lucide="play"></i>Play it</button>'}<button class="btn btn-ghost" type="button" data-nav data-fna="party"><i data-lucide="users"></i>${pick.size > 1 ? 'Party with the first' : 'Make it a watch party'}</button>` : ''}
        <button class="btn btn-ghost" type="button" data-nav data-fna="skip"><i data-lucide="skip-forward"></i>Next seat’s turn</button></div>`;
      icons();
    };
    body.onclick = async (e) => {
      const t = e.target.closest('[data-fn]'); if (t) { const i = Number(t.dataset.fn); if (pick.has(i)) pick.delete(i); else if (pick.size < 3) pick.add(i); else toast('Three is the most', 'info', 1600); paint(); return; }
      const a = e.target.closest('[data-fna]'); if (!a) return; const k = a.dataset.fna, list = [...pick].map((i) => wl[i]);
      if (k === 'skip') { this.advance(); X8.close('filmNight'); this.open(); return; }
      X8.close('filmNight'); this.advance();
      if (k === 'vote') { this.pool = list; Couch.open(); }
      if (k === 'play') quickPlay(list[0]);
      if (k === 'party') { await Party.create(); quickPlay(list[0]); }
    };
    paint(); X8.open('filmNight');
  },
  init() {
    const b = Couch.build.bind(Couch);
    Couch.build = async function () {
      const p = FilmNight.pool; if (!p) return b();
      FilmNight.pool = null;
      return p.map((m) => ({ id: m.id, type: m.type, name: m.name, poster: metaPoster(m) || m.poster || '', year: yearOf(m) || '', g: genresOf(m).slice(0, 2).join(' · '), r: m.imdbRating || '' }));
    };
  },
};

/* ---------------- Wiring ---------------- */
{
  if (CFG.catchUpAsk === undefined) CFG.catchUpAsk = true;
  if (CFG.stubs === undefined) CFG.stubs = true;
  CatchUp.init(); Stubs.init(); FilmNight.init();
  const base = renderOptMenu;
  renderOptMenu = function () {
    base(); const m = $('#optMenu'); if (!m || !P.ctx || !P.stream) return;
    const html = `${!P.ctx.video ? '<button type="button" data-f52="cut"><i data-lucide="scissors"></i>Which cut is this?</button>' : ''}<button type="button" data-f52="shape"><i data-lucide="activity"></i>Shape of the film</button>`;
    const anchor = [...m.querySelectorAll('[data-f51],[data-f50]')].pop();
    if (anchor) anchor.insertAdjacentHTML('afterend', html); else { const tools = $('h5', m); if (tools) tools.insertAdjacentHTML('beforebegin', html); else m.insertAdjacentHTML('afterbegin', html); }
    $$('[data-f52]', m).forEach((b) => b.addEventListener('click', () => { m.hidden = true; if (b.dataset.f52 === 'cut') WhichCut.open(); else FilmShape.open(); }));
    icons();
  };
  scAddRows('playback', null, [
    { group: 'Together' },
    { key: 'catchUpAsk', label: 'Offer to catch up in a watch party', help: 'Joining late, you can catch up at 1.5× with subtitles instead of jumping in.', type: 'toggle' },
    { key: 'filmNightBtn', label: 'Film night', help: 'Seats take turns picking. The picker’s shortlist goes to a vote on your phones.', type: 'button', text: 'Start', icon: 'popcorn', run: () => { closeLayer('settings'); FilmNight.open(); } },
    { key: 'stubs', label: 'Keep ticket stubs', help: 'A stub for every film you finish, with the date, the seat and who you watched with.', type: 'toggle' },
    { key: 'stubsBtn', label: 'Your ticket stubs', help: 'See them all and save one as a picture.', type: 'button', text: 'Open', icon: 'ticket', run: () => { closeLayer('settings'); Stubs.open(); } },
  ]);
  COMMANDS.push({ label: 'Film night: whose pick is it?', icon: 'popcorn', run: () => FilmNight.open() });
  COMMANDS.push({ label: 'Your ticket stubs', icon: 'ticket', run: () => Stubs.open() });
}
