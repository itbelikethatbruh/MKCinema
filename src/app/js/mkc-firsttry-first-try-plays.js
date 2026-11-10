
/* ---------------- First try plays, every episode its own picture (2.59.2) ----------------
   1) Sources were given 3.5 s to start on Chrome, Edge and Firefox. A debrid link that is played for the first time has
      to be prepared by the addon and the debrid service first, which often takes longer, so a source that was about to
      play was dropped, then the next one, until "None of the sources would start" after three. By then the services had
      prepared the files, which is why Try again worked. A start now gets 10 s (12 s on TV), and keeps waiting up to 25 s
      while the file is still arriving. If every try only ran out of time, MKCinema tries once more by itself, as Try
      again does, before it shows that message. Safari keeps its own rules.
   2) Episode pictures from the catalog come from a shared picture service that can be out of step with TMDB, so two
      episodes could show the same picture, or one of a different episode. For shows with an IMDb id the season's own
      TMDB stills replace them, only where TMDB's episode has the same name or air date, and only over the catalog's
      shared pictures (an addon's own picture is never replaced). A viewer with their own TMDB key asks TMDB directly;
      everyone else asks MKCinema's tmdb-person function (lookup `stills`). Answers are kept for three days. */
(() => {
  /* ---------- 1) start time ---------- */
  const WK = !!(window.MKSafari && MKSafari.on);
  const Start = {
    BASE: IS_TV ? 12000 : 10000, MAX: 25000, lastProg: 0,
    allSlow: true, retried: new Set(),
    slow: (r) => /did not start within/i.test(String(r || '')),
  };
  window.MkStart = Start;
  if (!WK && typeof Failover !== 'undefined') {
    video.addEventListener('progress', () => { Start.lastProg = performance.now(); });
    const arm = Failover.arm.bind(Failover);
    Failover.arm = function (stream) {
      const key = P.ctx ? (P.ctx.video ? P.ctx.video.id : P.ctx.meta.id) : '';
      if (key !== this.key) Start.allSlow = true; // a new title: the bookkeeping below starts over too
      arm(stream);
      if (!CFG.failover || stream._local || stream._handoff || stream._audioTry) return;
      clearTimeout(this.t);
      const t0 = performance.now(); Start.lastProg = 0;
      const check = () => {
        if (P.stream !== stream || $('#player').hidden || video.readyState >= 1 || !$('#pMsg').hidden) return;
        const now = performance.now();
        // bytes still arriving: the file is on its way, so keep waiting a little longer
        if (now - t0 < Start.MAX && Start.lastProg && now - Start.lastProg < 4000) { Failover.t = setTimeout(check, 3000); return; }
        Failover.next(stream, `did not start within ${Math.round((now - t0) / 1000)} s`, P.startAt || 0);
      };
      this.t = setTimeout(check, Start.BASE);
    };
    const next = Failover.next.bind(Failover);
    Failover.next = function (failed, reason, at) {
      if (!Start.slow(reason)) Start.allSlow = false;
      return next(failed, reason, at);
    };
  }
  // one quiet retry per episode when every source only ran out of time: they are usually ready by then
  if (!WK && typeof Preflight !== 'undefined') {
    const give = Preflight.giveUp.bind(Preflight);
    Preflight.giveUp = function (stream, reason) {
      const ctx = P.ctx;
      const key = ctx ? (ctx.video ? ctx.video.id : ctx.meta.id) : '';
      if (ctx && !$('#player').hidden && key && Start.allSlow && Start.slow(reason) && !Start.retried.has(key)) {
        Start.retried.add(key);
        const s = pickBest(ctx.streams || []);
        if (s) {
          try { MKLog.add('info', 'sources were slow to start; trying the best one again'); } catch (e) { /* no log */ }
          (ctx.streams || []).forEach((x) => this.res.delete(x));
          Failover.tried = new Set(); Failover.hops = 0; Failover.key = ''; Start.allSlow = true;
          this.tok++; clearTimeout(Failover.t); clearTimeout(Failover.stallT);
          toast('The sources are getting ready. Starting again…', 'info', 3600, 'failover');
          playStream(ctx, s, { startAt: P.startAt || 0 });
          return;
        }
      }
      return give(stream, reason);
    };
  }

  /* ---------- 2) episode pictures ---------- */
  const Stills = {
    FN: 'tmdb-person', IMG: 'https://image.tmdb.org/t/p/w780', TTL: 3 * 86400e3,
    mem: null, wait: new Map(), offUntil: 0,
    tt(m) { const id = String((m && (m.imdb_id || m.id)) || '').split(':')[0]; return /^tt\d{5,10}$/.test(id) ? id : null; },
    store() {
      if (!this.mem) {
        const raw = Store.raw.get('stillCache', {}), now = Date.now(); this.mem = new Map();
        Object.entries(raw && typeof raw === 'object' ? raw : {}).forEach(([k, v]) => { if (v && Array.isArray(v.e) && now - v.t < this.TTL) this.mem.set(k, v); });
      }
      return this.mem;
    },
    save() {
      const m = this.store(); while (m.size > 120) m.delete(m.keys().next().value);
      clearTimeout(this.saveT); this.saveT = setTimeout(() => Store.raw.set('stillCache', Object.fromEntries(m)), 800);
    },
    // only the catalog's shared pictures are replaced; an addon's own picture stays
    shared: (u) => !u || /^https?:\/\/episodes\.metahub\.space\//i.test(String(u)),
    norm: (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
    day: (d) => { const t = Date.parse(String(d || '').slice(0, 10)); return isFinite(t) ? t / 864e5 : NaN; },
    async ask(tt, season) {
      if (TMDB.key()) {
        const f = await TMDB.find(tt); const tv = f && (f.tv_results || [])[0]; if (!tv) return [];
        const j = await TMDB.get(`tv/${tv.id}/season/${season}`);
        return ((j && j.episodes) || []).map((e) => ({ e: e.episode_number, n: e.name || '', d: e.air_date || '', s: e.still_path || '' }));
      }
      if (Date.now() < this.offUntil) return null;
      const c = (typeof Account !== 'undefined' && Account.config && Account.config()) || {}; if (!c.url) return null;
      const r = await netFetch(`${String(c.url).replace(/\/+$/, '')}/functions/v1/${this.FN}?a=stills&tt=${tt}&season=${season}`, { headers: { apikey: c.anonKey || '', accept: 'application/json' } }, 10000);
      // an older function without this lookup, not set up, or busy: keep the catalog's pictures for a while
      if (r.status === 400 || r.status === 503 || r.status === 429) { this.offUntil = Date.now() + 30 * 60e3; return null; }
      if (!r.ok) return null;
      const j = await r.json(); return Array.isArray(j.eps) ? j.eps : [];
    },
    get(tt, season) {
      const k = `${tt}:${season}`, have = this.store().get(k);
      if (have) return Promise.resolve(have);
      if (!this.wait.has(k)) {
        this.wait.set(k, this.ask(tt, season).then((e) => {
          if (!e) return undefined;
          const v = { e: e.filter((x) => x && x.s).map((x) => [Number(x.e), String(x.n || ''), String(x.d || ''), String(x.s)]), t: Date.now() };
          this.store().set(k, v); this.save(); return v;
        }).catch(() => undefined).finally(() => this.wait.delete(k)));
      }
      return this.wait.get(k);
    },
    // TMDB's still for this episode, when TMDB's episode is clearly the same one (same name or air date)
    match(v, eps) {
      const n = this.norm(v.name || v.title), d = this.day(v.released || v.firstAired), num = Number(v.episode);
      const same = (x) => (n && n.length >= 3 && this.norm(x[1]) === n) || (isFinite(d) && Math.abs(this.day(x[2]) - d) <= 1);
      const byNum = eps.find((x) => x[0] === num);
      if (byNum && same(byNum)) return byNum[3];
      if (n.length >= 6) { const hits = eps.filter((x) => this.norm(x[1]) === n); if (hits.length === 1) return hits[0][3]; }
      return '';
    },
    // puts the stills on the show itself, so the list, the episode sheet, Up next and Continue watching all agree
    apply(meta, season, v) {
      if (!v || !v.e.length) return [];
      const changed = [];
      (meta.videos || []).forEach((ep) => {
        if (Number(ep.season ?? 1) !== season || !this.shared(ep.thumbnail)) return;
        const p = this.match(ep, v.e); if (!p) return;
        const url = this.IMG + p; if (ep.thumbnail === url) return;
        ep.thumbnail = url; changed.push(ep);
      });
      return changed;
    },
    // a late answer swaps the pictures already on screen
    paint(meta, eps) {
      eps.forEach((ep) => {
        const id = videoIdFor(meta, ep);
        $$(`#dEps [data-vid="${CSS.escape(id)}"] .th img`).forEach((img) => {
          img.removeAttribute('data-fb'); img.removeAttribute('srcset'); img.src = ep.thumbnail;
        });
        try { if (D.video === ep && EpSheet.isOpen()) $$('#esHead .es-still img').forEach((img) => { img.removeAttribute('data-fb'); img.removeAttribute('srcset'); img.src = ep.thumbnail; }); } catch (e) { /* no sheet */ }
      });
    },
    fix(meta, season) {
      const tt = this.tt(meta); if (!tt || meta.type !== 'series' || !(season >= 1)) return;
      if (!(meta.videos || []).some((ep) => Number(ep.season ?? 1) === season && this.shared(ep.thumbnail))) return;
      const k = `${tt}:${season}`, have = this.store().get(k);
      if (have) { this.apply(meta, season, have); return; }
      this.get(tt, season).then((v) => { if (v) this.paint(meta, this.apply(meta, season, v)); });
    },
  };
  window.MkStills = Stills;
  if (typeof episodesHTML === 'function') {
    const eh = episodesHTML;
    episodesHTML = function (meta, season) {
      try { if (meta) Stills.fix(meta, Number(season)); } catch (e) { /* the catalog's pictures stay */ }
      return eh.apply(this, arguments);
    };
  }
  // the episode sheet can open straight from Continue watching, before the list is drawn
  if (typeof EpSheet !== 'undefined' && typeof EpSheet.head === 'function') {
    const head = EpSheet.head;
    EpSheet.head = function () {
      try { if (D.meta && D.video) Stills.fix(D.meta, Number(D.video.season)); } catch (e) { /* the catalog's picture stays */ }
      return head.apply(this, arguments);
    };
  }
})();
