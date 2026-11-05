/* ---------------- 2.12.0 Anime skipping for every addon ----------------
   Skip.load already asks AniSkip when the episode id is a Kitsu or MAL id (anime addons). Most people watch anime
   through Cinemeta-style IMDb ids (tt…:season:episode), so those never got skip times. Now an animated series with
   an IMDb id is looked up in the ARM mapping service (arm.haglund.dev: IMDb → MyAnimeList, per season), split
   seasons ("Part 2") are followed with Jikan's episode counts, and AniSkip answers as before.
   Also new: "Skip ending" when an ending is followed by more episode, and both segments marked on the seek bar. */
const AniSkip = {
  async arm(imdb) {
    const all = Store.get('armMap', {}); if (all[imdb] && Date.now() - all[imdb].t < 14 * 864e5) return all[imdb].v;
    const r = await fetch(`https://arm.haglund.dev/api/v2/imdb?id=${encodeURIComponent(imdb)}`); if (!r.ok) throw new Error(`ARM ${r.status}`);
    const v = (await r.json() || []).filter((e) => e && e.myanimelist).map((e) => ({ mal: e.myanimelist, media: e.media, s: e['thetvdb-season'] != null ? e['thetvdb-season'] : e['themoviedb-season'] }));
    all[imdb] = { t: Date.now(), v }; const keys = Object.keys(all); if (keys.length > 300) delete all[keys[0]];
    Store.set('armMap', all); return v;
  },
  async eps(mal) {
    const all = Store.get('malEps', {}); if (all[mal] != null) return all[mal];
    let n = 0;
    try { const r = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query: `query{Media(idMal:${Number(mal)},type:ANIME){episodes}}` }) }); n = (((await r.json()).data || {}).Media || {}).episodes || 0; } catch (e) { /* try Jikan */ }
    if (!n) try { const r = await fetch(`https://api.jikan.moe/v4/anime/${mal}`); if (r.ok) n = ((await r.json()).data || {}).episodes || 0; } catch (e) { /* unknown */ }
    if (n) { all[mal] = n; Store.set('malEps', all); } return n;
  },
  /* the MAL entry and episode number that AniSkip knows this IMDb episode by */
  async find(imdb, season, ep) {
    const list = (await this.arm(imdb)).filter((e) => e.s === season && (!e.media || e.media === 'TV' || e.media === 'ONA')).sort((a, b) => a.mal - b.mal);
    for (let i = 0; i < list.length; i++) {
      if (i === list.length - 1) return { mal: list[i].mal, ep };
      const n = await this.eps(list[i].mal); if (!n || ep <= n) return { mal: list[i].mal, ep };
      ep -= n;   // a split season: this episode is in the next part
    }
    return null;
  },
  animeish(meta) { const g = (meta.genres || meta.genre || []).map((x) => String(x).toLowerCase()); return g.some((x) => /anim/.test(x)); },
  marks() {
    const trk = $('#seek .trk'); if (!trk) return; $$('.sk-mark', trk).forEach((x) => x.remove());
    const m = Skip.m, d = video.duration; if (!m || !d || !isFinite(d)) return;
    const seg = (a, b, cls) => { if (a == null || b == null || b <= a) return; const l = Math.max(0, a / d * 100), w = Math.min(100 - l, (b - a) / d * 100); trk.insertAdjacentHTML('beforeend', `<span class="sk-mark ${cls}" style="left:${l}%;width:${w}%"></span>`); };
    if (m.intro) seg(m.intro[0], m.intro[1], 'op');
    if (m.ed) seg(m.ed[0], m.ed[1], 'ed'); else if (m.credits) seg(m.credits, d, 'ed');
  },
  init() {
    const load = Skip.load.bind(Skip);
    Skip.load = async function (ctx) {
      await load(ctx);
      const token = Skip.token;
      try {
        if (!ctx || !ctx.video || !ctx.meta || ctx.meta.type !== 'series' || (Skip.m && Skip.m.src === 'AniSkip')) return;
        const imdb = String(ctx.meta.imdb_id || ctx.meta.id || ''), season = Number(ctx.video.season), ep = Number(ctx.video.episode);
        if (!/^tt\d+$/.test(imdb) || !season || !ep || !AniSkip.animeish(ctx.meta)) return;
        const hit = await AniSkip.find(imdb, season, ep); if (!hit || token !== Skip.token) return;
        const r = await fetch(`https://api.aniskip.com/v2/skip-times/${hit.mal}/${hit.ep}?types[]=op&types[]=ed&episodeLength=0`); const j = await r.json();
        if (token !== Skip.token) return;
        const op = (j.results || []).find((x) => x.skipType === 'op'), ed = (j.results || []).find((x) => x.skipType === 'ed');
        if (op || ed) Skip.m = { intro: op ? [op.interval.startTime, op.interval.endTime] : Skip.m && Skip.m.intro, credits: ed ? ed.interval.startTime : null, ed: ed ? [ed.interval.startTime, ed.interval.endTime] : null, src: 'AniSkip' };
      } catch (e) { /* ARM, Jikan or AniSkip unreachable: keep what we have */ }
      AniSkip.marks();
    };
    // Kitsu/MAL episodes: keep the ending's end too, so "Skip ending" can work for them as well
    const tick = Skip.tick.bind(Skip);
    Skip.tick = function (t) {
      const m = this.m, d = video.duration;
      const ed = m && (m.ed || null);
      if (CFG.skipIntro && ed && !P.locked && d && t >= ed[0] && t < ed[1] - 1 && ed[1] < d - 20) {
        const b = $('#skipBtn'); if (!this._edShown) { this._edShown = true; this.shownAt = performance.now(); const s = $('span', b); if (s) s.textContent = 'Skip ending'; b.dataset.seg = 'ed'; b.hidden = false; }
        else if (performance.now() - this.shownAt > 8000) b.hidden = true;
        return;
      }
      if (this._edShown) { this._edShown = false; const b = $('#skipBtn'); const s = $('span', b); if (s) s.textContent = 'Skip intro'; delete b.dataset.seg; b.hidden = true; }
      return tick(t);
    };
    const go = Skip.go.bind(Skip);
    Skip.go = function (auto) { const b = $('#skipBtn'); if (b.dataset.seg === 'ed' && this.m && this.m.ed) { pSeek(this.m.ed[1], { user: false }); b.hidden = true; delete b.dataset.seg; toast('Ending skipped', 'info', 1400); return; } return go(auto); };
    video.addEventListener('durationchange', () => AniSkip.marks());
    video.addEventListener('loadedmetadata', () => setTimeout(() => AniSkip.marks(), 500));
  },
};
AniSkip.init();
