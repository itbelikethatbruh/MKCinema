
'use strict';
/* ---- Live rewind: on a live channel the arrows go back inside the channel's own rewind window; the pill shows how far behind you are and jumps back to live ---- */
const LiveDvr = {
  live() {
    if (!P.stream || $('#player').hidden) return false;
    try { const h = P.hls, l = h && h.levels && h.levels[Math.max(0, h.currentLevel)]; return !isFinite(video.duration) || !!(l && l.details && l.details.live); } catch (e) { return false; }
  },
  win() { const r = video.seekable; if (!r || !r.length) return null; const a = r.start(0), b = r.end(r.length - 1); return b - a > 30 ? [a, b] : null; },
  edgeAt(w) { const h = P.hls, sp = h && h.liveSyncPosition; return isFinite(sp) && sp > 0 ? sp : w ? w[1] - 3 : null; },
  seek(d) {
    if (!this.live()) return false;
    const w = this.win(); if (!w) return false;
    video.currentTime = clamp(video.currentTime + d, w[0] + 1, Math.max(w[0] + 1, this.edgeAt(w))); this.paint(); return true;
  },
  edge() {
    const t = this.edgeAt(this.win()); if (t != null) video.currentTime = t;
    if (video.paused) video.play().catch(() => {});
    this.paint();
  },
  behind() { const w = this.win(); return w ? Math.max(0, this.edgeAt(w) - video.currentTime) : 0; },
  pct() { const w = this.win(); return w ? clamp((video.currentTime - w[0]) / (w[1] - w[0]), 0, 1) * 100 : 100; },
  paint() {
    const b = $('#pLive'); if (!b) return;
    const on = this.live(); if (b.hidden === on) b.hidden = !on;
    if (!on) return;
    const lag = this.behind(), at = lag < 12 || !this.win();
    b.classList.toggle('at', at); b.disabled = at;
    const tx = at ? 'LIVE' : `−${fmtTime(lag)} · Go live`, sp = b.querySelector('span');
    if (sp.textContent !== tx) sp.textContent = tx;
  },
  init() {
    const b = $('#pLive'); if (!b) return;
    b.addEventListener('click', () => { this.edge(); wakeHud(); });
    video.addEventListener('timeupdate', () => this.paint());
    video.addEventListener('emptied', () => { b.hidden = true; });
  },
};
/* ---- Record every episode: a rule per show and channel; each new airing in the guide is set to record ---- */
const RecSeries = {
  K: 'mkc:recSeries',
  all() { try { const v = JSON.parse(localStorage.getItem(this.K) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
  save(l) { try { localStorage.setItem(this.K, JSON.stringify(l.slice(0, 60))); } catch (e) { /* storage full */ } },
  norm(t) { return String(t || '').toLowerCase().replace(/\((new|live|repeat|hd|r)\)|\[[^\]]*\]/g, ' ').replace(/\bs\d+\s*e\d+\b.*$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); },
  find(c, prog) { const t = this.norm(prog && prog.title); return this.all().find((r) => r.url === c.url && r.t === t); },
  has(c, prog) { return !!this.find(c, prog); },
  toggle(c, prog) {
    const r = this.find(c, prog), name = String(prog.title || '').replace(/\s*[([](new|live|repeat|hd|r)[)\]]/gi, '').trim() || prog.title;
    if (r) { this.save(this.all().filter((x) => x.id !== r.id)); toast(`${name} on ${c.name} won’t record every episode any more. Recordings already set stay in Live TV › Recordings.`, 'info', 6500, 'recs'); return; }
    const l = this.all(); l.push({ id: `s${Date.now().toString(36)}`, url: c.url, ch: c.name, logo: c.logo || '', t: this.norm(prog.title), title: name });
    this.save(l);
    this.scan(true);
    toast(MkRec.nat() ? `Every episode of ${name} on ${c.name} will record.` : `Every episode of ${name} on ${c.name} will record. Keep MKCinema open in a tab when they’re on.`, 'ok', 7000, 'recs');
  },
  scan(quiet) {
    if (!window.MkRec || typeof Channels === 'undefined' || (MkRec.oldApp && MkRec.oldApp())) return 0;
    const rules = this.all(); if (!rules.length) return 0;
    const t = Date.now(), chans = Channels.all(); let n = 0;
    for (const r of rules) {
      const c = chans.find((x) => x.url === r.url); if (!c) continue;
      const d = Channels.data.get(c.list), progs = (d && d.epg && d.epg.get(Channels.key(c))) || [];
      for (const p of progs) {
        if (p.none || p.start <= t + 60e3 || p.start > t + 2 * 864e5 || this.norm(p.title) !== r.t) continue;
        if (MkRec.plans().some((x) => x.url === c.url && x.start === p.start)) { n++; continue; }
        MkRec.plan(c, p, true);
        if (MkRec.plans().some((x) => x.url === c.url && x.start === p.start)) n++;
      }
    }
    if (!quiet) MkRec.paint();
    return n;
  },
  html(row, btn) {
    const l = this.all(); if (!l.length) return '';
    return `<p class="rec-sec">Every episode</p>${l.map((r) => row(r.logo, r.title, esc(r.ch), btn(`data-rser="${esc(r.id)}"`, 'x', 'Stop'))).join('')}`;
  },
  bind(b, again) {
    $$('[data-rser]', b).forEach((x) => x.addEventListener('click', () => { this.save(this.all().filter((r) => r.id !== x.dataset.rser)); again(); }));
  },
  init() {
    setTimeout(() => this.scan(true), 20000);
    setInterval(() => { if (this.all().length) this.scan(true); }, 10 * 60e3);
  },
};
/* ---- Smart downloads: while you watch a series, the next episodes download on their own; watched ones are removed ---- */
const SmartDl = {
  K: 'dlAutoIds',
  n() { return Number(CFG.dlAuto) || 0; },
  ids() { const v = Store.get(this.K, []); return Array.isArray(v) ? v : []; },
  busy: false, done: new Set(), seen: '',
  // only a source tagged with your audio language when one is set (an untagged one is never assumed), already cached on your debrid service
  fits(s) {
    if (!Offline.canGet(s) || !s._tel || s._tel.isTrailer || s._tel.cached === false) return false;
    const want = CFG.audioOnly; if (!want || want === 'any') return true;
    return AudioPref.langs(s).langs.has(want);
  },
  async ahead(ctx) {
    const N = this.n(); if (!N || !Offline.api || this.busy || !ctx || !ctx.video || !ctx.meta || navigator.onLine === false) return;
    const k = `${ctx.meta.id}|${ctx.video.id}`; if (this.done.has(k)) return; this.done.add(k);
    this.busy = true;
    try {
      let meta = S.metas.get(ctx.meta.id) || ctx.meta;
      if (!(meta.videos || []).length) { try { meta = (await engine.fetchMeta('series', meta.id)) || meta; } catch (e) { /* use what we have */ } }
      const list = orderedEpisodes(meta), i = list.findIndex((v) => v.id === ctx.video.id || videoIdFor(meta, v) === videoIdFor(meta, ctx.video)); if (i < 0) return;
      const now = Date.now(), want = list.slice(i + 1).filter((v) => !v.released || Date.parse(v.released) <= now).slice(0, N);
      await Offline.refresh();
      const ids = this.ids();
      for (const v of want) {
        const key = videoIdFor(meta, v);
        if (isWatched(key) || Offline.recs.some((r) => r.meta && r.meta.key === key && r.state !== 'failed')) continue;
        let streams = []; try { ({ streams } = await engine.fetchStreams('series', key)); } catch (e) { continue; }
        const ok = streams.filter((x) => this.fits(x)); if (!ok.length) continue;
        const pick = engine.pickBest(ok, PickMemo.opts(meta)) || ok[0];
        await Offline.get({ meta, video: v }, pick);
        if (Offline.recs.some((r) => r.meta && r.meta.key === key)) ids.push(key);
      }
      Store.set(this.K, [...new Set(ids)].slice(-300));
    } finally { this.busy = false; }
  },
  async clean() {
    if (CFG.dlAutoClean === false || !Offline.api) return;
    const ids = this.ids(); if (!ids.length) return;
    await Offline.refresh();
    const keep = new Set(), playing = P.stream && P.stream._dl; let n = 0;
    for (const k of ids) {
      const r = Offline.recs.find((x) => x.meta && x.meta.key === k); if (!r) continue;
      if (r.state === 'done' && isWatched(k) && String(playing) !== String(r.id)) { try { await Offline.api.remove(r.id); n++; continue; } catch (e) { /* keep it */ } }
      keep.add(k);
    }
    Store.set(this.K, [...keep]);
    if (n) { toast(n === 1 ? 'A watched episode that downloaded on its own was removed to free up space.' : `${n} watched episodes that downloaded on their own were removed to free up space.`, 'info', 5500, 'dlc'); Offline.refresh(); }
  },
  cur() {
    if (P.ctx && P.ctx.video && !$('#player').hidden && !video.paused) return P.ctx;
    if (typeof TvPlayer !== 'undefined' && TvPlayer.cur && TvPlayer.cur.ctx && TvPlayer.cur.ctx.video) return TvPlayer.cur.ctx;
    return null;
  },
  tick: 0,
  init() {
    const sec = secById('playback');
    if (sec) {
      const rows = sec.rows;
      sec.rows = () => [...rows(), ...(Offline.api ? [
        { key: 'dlAuto', label: 'Download the next episodes', help: 'While you watch a series, the next episodes download on their own, so they’re ready with no connection. Only sources cached on your debrid service or direct links, in your audio language when you set one.', type: 'select', options: [['0', 'Off'], ['1', 'Next episode'], ['2', 'Next 2 episodes'], ['3', 'Next 3 episodes']], get: () => String(Number(CFG.dlAuto) || 0), set: (v) => setCfg('dlAuto', Number(v) || 0) },
        { key: 'dlAutoClean', label: 'Remove watched episodes that downloaded on their own', help: 'Frees up space once you’ve watched them. Anything you downloaded yourself stays.', type: 'toggle', get: () => CFG.dlAutoClean !== false, set: (v) => setCfg('dlAutoClean', v) },
      ] : [])];
    }
    // an episode counts once it has played for a minute
    setInterval(() => {
      this.tick++;
      if (this.tick % 10 === 3) this.clean();
      const c = this.n() ? this.cur() : null; if (!c) { this.seen = ''; return; }
      const k = `${c.meta.id}|${c.video.id}`;
      if (this.seen === k) this.ahead(c); else this.seen = k;
    }, 60e3);
  },
};
window.MkLiveDvr = LiveDvr; window.MkRecSeries = RecSeries; window.MkSmartDl = SmartDl;
LiveDvr.init(); RecSeries.init(); SmartDl.init();
