
'use strict';
/* 2.61 Automatic skips. Exact times (chapters, addon times, AniSkip, TheIntroDB) skip on their own and leave a
   "Watch" pill for 6 s; guessed times (neighbouring episodes, your own earlier skips) only show the button.
   Short waiting clips that some sources send instead of the film are spotted and passed over. */
(() => {
  if (typeof Skip === 'undefined' || typeof Marks === 'undefined') return;
  const NAME = { recap: 'Recap', intro: 'Intro', ed: 'Credits' };
  const now = () => performance.now();

  /* ---- one setting: Automatically / Show a Skip button / Off ---- */
  if (typeof CFG_DEFAULTS === 'object') CFG_DEFAULTS.skipAuto = 'auto';
  if (CFG.skipAuto == null) { CFG.skipAuto = CFG.skipIntro === false ? 'off' : 'auto'; saveCfg(); }
  const mode = () => (CFG.skipAuto === 'ask' || CFG.skipAuto === 'off' ? CFG.skipAuto : 'auto');
  const mirror = () => { CFG.skipIntro = mode() !== 'off'; CFG.autoSkipIntro = mode() === 'auto'; };
  mirror();
  const pb = typeof secById === 'function' && secById('playback');
  if (pb) {
    const rows = pb.rows;
    pb.rows = () => {
      const r = rows(), at = r.findIndex((x) => x.key === 'skipIntro' || x.key === 'autoSkipIntro');
      const out = r.filter((x) => x.key !== 'skipIntro' && x.key !== 'autoSkipIntro');
      const row = { key: 'skipAuto', label: 'Skip intros, recaps and credits', type: 'select',
        help: 'Times come from chapters in the file, your addons, AniSkip for anime and TheIntroDB. After an automatic skip a Watch button shows for a few seconds. Times guessed from nearby episodes or from your own skips only ever show the button. Enter or gamepad A presses it.',
        options: [['auto', 'Automatically'], ['ask', 'Show a Skip button'], ['off', 'Off']], get: mode,
        set: (v) => { setCfg('skipAuto', v); mirror(); saveCfg(); } };
      out.splice(at >= 0 ? at : out.length, 0, row);
      return out;
    };
  }

  /* ---- TheIntroDB, keeping the end of the credits, plus neighbouring episodes when an episode has no intro ---- */
  const A = {
    tok: -1, est: null, undo: null, seg: null, quiet: {},
    ids(ctx) {
      if (!ctx || !ctx.meta) return null;
      const meta = ctx.meta, v = ctx.video;
      let imdb = String((v && v.id) || meta.id || '').split(':')[0], season = v && Number(v.season), ep = v && Number(v.episode);
      if (!/^tt\d+$/.test(imdb)) { imdb = (v && v.imdb_id) || meta.imdb_id || ''; if (v) { season = Number(v.imdbSeason); ep = Number(v.imdbEpisode); } }
      if (!/^tt\d+$/.test(imdb) || (v && !(season >= 0 && ep > 0))) return null;
      return { imdb, season: v ? season : null, ep: v ? ep : null };
    },
    one(imdb, season, ep) {
      const q = `imdb_id=${imdb}${season != null ? `&season=${season}&episode=${ep}` : ''}`;
      if (Marks.cache.has(q)) return Marks.cache.get(q);
      const p = (async () => {
        const r = await fetch(`https://api.theintrodb.org/v2/media?${q}`); if (!r.ok) return null;
        const j = await r.json(), seg = (k) => (Array.isArray(j[k]) ? j[k][0] : j[k]) || null, m = {};
        const i = seg('intro'), rc = seg('recap'), cr = seg('credits');
        if (i && i.end_ms > (i.start_ms || 0)) m.intro = [(i.start_ms || 0) / 1000, i.end_ms / 1000];
        if (rc && rc.end_ms > (rc.start_ms || 0)) m.recap = [(rc.start_ms || 0) / 1000, rc.end_ms / 1000];
        if (cr && cr.start_ms) {
          m.credits = cr.start_ms / 1000;
          // credits that end before the file does: more of the story follows, so they get their own skip
          if (cr.end_ms > cr.start_ms) m.ed = [cr.start_ms / 1000, cr.end_ms / 1000];
        }
        return Object.keys(m).length ? m : null;
      })().catch(() => null);
      Marks.cache.set(q, p); return p;
    },
    async near(ctx, tok) {
      const id = this.ids(ctx); if (!id || id.season == null || CFG.introDb === false) return;
      const own = await this.one(id.imdb, id.season, id.ep); if (tok !== Skip.token || (own && own.intro)) return;
      const nb = (await Promise.all([id.ep - 1, id.ep + 1].filter((e) => e > 0).map((e) => this.one(id.imdb, id.season, e))))
        .map((m) => m && m.intro).filter(Boolean);
      if (tok !== Skip.token || nb.length < 2) return;
      const [a, b] = nb; if (Math.abs(a[0] - b[0]) > 3 || Math.abs(a[1] - b[1]) > 3) return;
      this.est = { k: 'intro', s: (a[0] + b[0]) / 2, e: (a[1] + b[1]) / 2 };
      MKLog.add('info', `skip: intro guessed from the episodes either side (${Math.round(this.est.s)}-${Math.round(this.est.e)} s)`);
    },
    /* the intro you taught it by skipping earlier episodes yourself is a guess too */
    learned(m) {
      try {
        const l = P.ctx && Store.get('introLearn', {})[P.ctx.meta.id];
        return !!(l && m.intro && Math.abs(m.intro[0] - Math.max(0, l.s - 3)) < 0.01 && Math.abs(m.intro[1] - l.e) < 0.01);
      } catch (e) { return false; }
    },
    segs(m, d) {
      const out = [];
      if (m) for (const k of ['recap', 'intro', 'ed']) {
        const w = m[k]; if (!Array.isArray(w) || !(w[1] > w[0])) continue;
        if (k === 'ed' && !(d && w[1] < d - 20)) continue; // credits to the end: Up next takes over
        out.push({ k, s: w[0], e: w[1], est: k === 'intro' && this.learned(m) });
      }
      if (this.est && !out.some((x) => x.k === 'intro')) out.push({ ...this.est, est: true });
      return out;
    },
    label(k, m) { return k === 'ed' ? (/AniSkip|chapters/.test((m && m.src) || '') ? 'Skip ending' : 'Skip credits') : k === 'recap' ? 'Skip recap' : 'Skip intro'; },
    pill(text, undo) {
      const b = $('#skipBtn'); if (!b) return;
      const sp = $('span', b); if (sp && sp.textContent !== text) sp.textContent = text;
      b.classList.toggle('sk-undo', !!undo); b.classList.remove('out'); b.hidden = false;
    },
    guest() { try { return !!(Party.code && !Party.isHost()); } catch (e) { return false; } },
  };
  window.MkAutoSkip = A;
  Marks.introdb = function (ctx) {
    if (CFG.introDb === false) return Promise.resolve(null);
    const id = A.ids(ctx); return id ? A.one(id.imdb, id.season, id.ep) : Promise.resolve(null);
  };
  const ld = Skip.load.bind(Skip);
  Skip.load = function (ctx) {
    const r = ld(ctx); A.est = null; A.undo = null; A.seg = null; A.quiet = {}; A.tok = Skip.token;
    A.near(ctx, Skip.token).catch(() => {});
    return r;
  };

  /* ---- the button, the automatic skip and its Watch pill ---- */
  Skip.tick = function (t) {
    const m = this.m, md = mode();
    if (A.undo) {
      if (now() < A.undo.until && !P.locked) { A.pill(`Watch ${NAME[A.undo.k].toLowerCase()}`, true); return; }
      A.undo = null; $('#skipBtn').classList.remove('sk-undo'); this.hide();
    }
    if (md === 'off' || P.locked) { this.hide(); return; }
    const seg = A.segs(m, pDur()).find((x) => t >= x.s && t < x.e - 1);
    A.seg = seg || null;
    if (!seg || A.quiet[seg.k]) { this.hide(); this.shownAt = 0; this.cur = null; return; }
    if (this.cur !== seg.k) { this.cur = seg.k; this.shownAt = 0; }
    if (md === 'auto' && !seg.est && !A.guest() && !this.usedK[seg.k] && t < seg.e - 3) { this.usedK[seg.k] = true; this.go(true); return; }
    if (!this.shownAt) { this.shownAt = now(); A.pill(A.label(seg.k, m), false); }
    else if (now() - this.shownAt > 8000) this.hide();
  };
  Skip.go = function (auto) {
    const u = A.undo;
    if (!auto && u && now() < u.until) {
      A.undo = null; A.quiet[u.k] = true; this.usedK[u.k] = true; this.cur = u.k; this.shownAt = now() + 1e9;
      $('#skipBtn').classList.remove('sk-undo'); this.hide(); pSeek(u.s, { user: false });
      return;
    }
    const seg = A.seg; if (!seg) return;
    this.usedK[seg.k] = true; this.cur = seg.k; this.shownAt = now() + 1e9;
    pSeek(seg.e, { user: false });
    if (auto) { A.undo = { k: seg.k, s: Math.max(0, seg.s - 0.5), until: now() + 6000 }; A.pill(`Watch ${NAME[seg.k].toLowerCase()}`, true); }
    else this.hide();
    toast(`${NAME[seg.k]} skipped${auto ? ' automatically' : ''}`, 'info', 1400, 'autoskip');
    MKLog.add('info', `skip ${seg.k} ${auto ? 'auto' : 'button'} ${Math.round(seg.s)}-${Math.round(seg.e)} s (${(this.m && this.m.src) || (seg.est ? 'guess' : '?')})`);
  };

  /* ---- TV player: autoSkip follows the setting, and guessed intros are not sent ---- */
  if (typeof TvParity !== 'undefined' && TvParity.prep) {
    const prep = TvParity.prep.bind(TvParity);
    TvParity.prep = async function (ctx) {
      mirror();
      const out = await prep(ctx);
      try {
        out.autoSkip = mode() === 'auto' && !A.guest();
        if (out.skips && out.skips.intro && Skip.m && A.learned(Skip.m) && out.autoSkip) delete out.skips.intro;
      } catch (e) { /* plays without */ }
      return out;
    };
  }

  /* ---- waiting clips: a "not ready yet" video a few seconds long, sent in place of the film ---- */
  const Stub = {
    seen: new WeakSet(),
    check() {
      const s = P.stream, ctx = P.ctx; if (!s || !ctx || $('#player').hidden || this.seen.has(s)) return;
      if (s._local || s._handoff || (s._tel && s._tel.isTrailer) || P.hls || P.remux) return;
      if (/^blob:/.test(video.currentSrc || '')) return; // streamed by a player engine: its duration can grow while it loads
      const d = video.duration; if (!isFinite(d) || d <= 0 || d >= 60) return;
      const type = ctx.meta && ctx.meta.type; if (type !== 'movie' && type !== 'series' && type !== 'anime') return;
      const rt = parseInt(ctx.meta.runtime, 10); if (rt > 0 && rt < 3) return;
      this.seen.add(s);
      MKLog.add('info', `waiting clip (${d.toFixed(1)} s) instead of the film: ${MKLog.describe ? MKLog.describe(s) : ''}`);
      if (s._tel) s._tel.cached = false;
      if (CFG.failover && Failover.candidates(s).length && Failover.next(s, 'isn’t cached yet', P.startAt || 0)) return;
      // the player starts it a moment later, so it is held on the first frame then too
      const hold = () => { if (P.stream === s) video.pause(); };
      hold(); video.addEventListener('playing', hold, { once: true }); setTimeout(() => video.removeEventListener('playing', hold), 5000);
      toast('This source isn’t ready yet. It sent a short waiting clip instead of the film. Pick another source, or try this one again in a few minutes.', 'info', 8000, 'stubclip');
    },
  };
  ['loadedmetadata', 'durationchange'].forEach((ev) => video.addEventListener(ev, () => { try { Stub.check(); } catch (e) { /* playback goes on */ } }));
  window.MkStubClip = Stub;
})();
