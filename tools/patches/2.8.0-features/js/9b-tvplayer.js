/* ---------------- 2.9.1 The TV player (Android TV app 1.2.5) ----------------
   On a TV with app 1.2.5 or later, streams play in the TV's own hardware player (MKAndroid.play): MKV, HEVC, HDR and
   Dolby Vision play the way the TV plays them, and with frame-rate matching the TV switches to the film's frame rate.
   MKCinema keeps everything else: it picks the source, sends your subtitle language along, saves where you stopped,
   marks it watched and moves on to the next episode. Settings › Playback › TV player can switch back to the in-app
   player (subtitle styling, Night Mode, X-Ray). If the TV player can't open a source, the in-app player takes over. */
const TvPlayer = {
  on() {
    if (!IS_TV || CFG.tvPlayer === 'web') return false;
    try { return !!(window.MKAndroid && typeof MKAndroid.play === 'function'); } catch (e) { return false; }
  },
  cur: null,
  async subUrl(ctx) {
    if (CFG.subAuto === false || !CFG.subLang || CFG.subLang === 'off') return '';
    const id = ctx.video ? (ctx.video.id || videoIdFor(ctx.meta, ctx.video)) : ctx.meta.id;
    try {
      const list = await Promise.race([engine.fetchSubtitles(ctx.meta.type, id), new Promise((r) => setTimeout(() => r([]), 2500))]);
      const want = String(CFG.subLang).slice(0, 3).toLowerCase();
      const s = (list || []).find((x) => String(x.lang || '').toLowerCase().startsWith(want)); return s && /^https:/.test(s.url) ? s.url : '';
    } catch (e) { return ''; }
  },
  save(pos, dur) {
    const c = this.cur; if (!c || !(dur > 30000)) return;
    const ctx = c.ctx, key = ctx.video ? ctx.video.id : ctx.meta.id, t = pos / 1000, d = dur / 1000;
    if (t / d > 0.95) { delete S.progress[key]; markWatched(key); }
    else if (t > 5) S.progress[key] = { videoId: key, metaId: ctx.meta.id, type: ctx.meta.type, name: ctx.meta.name, poster: metaPoster(ctx.meta), background: metaBg(ctx.meta), genres: genresOf(ctx.meta).slice(0, 2), thumb: ctx.video && ctx.video.thumbnail, epTitle: ctx.video && (ctx.video.name || ctx.video.title), season: ctx.video && ctx.video.season, episode: ctx.video && ctx.video.episode, t, d, at: Date.now(), bingeGroup: c.stream.behaviorHints && c.stream.behaviorHints.bingeGroup, addon: c.stream._addon };
    Store.set('progress', S.progress); if (Account.user) Account.schedule();
  },
  init() {
    const lu = loadUrl;
    loadUrl = function (stream, startAt) {
      if (!TvPlayer.on() || !P.ctx || stream._local || stream._noNative) return lu.apply(this, arguments);
      const bh = stream.behaviorHints || {}, headers = bh.proxyHeaders && bh.proxyHeaders.request;
      // streams that ask for request headers (Referer, User-Agent...): TV app 1.2.8 sends them itself, no proxy needed
      const nativeHdr = !!(headers && Object.keys(headers).length && (() => { try { return Updater.newer(MKAndroid.version(), '1.2.7'); } catch (e) { return false; } })());
      if (bh.proxyHeaders && !S.proxy && !nativeHdr) return lu.apply(this, arguments);
      const src = nativeHdr ? stream.url : (bh.proxyHeaders || CFG.alwaysProxy) ? proxify(stream.url, headers || {}) : stream.url;
      const ctx = P.ctx, v = ctx.video;
      TvPlayer.cur = { ctx, stream, startAt };
      (async () => {
        const subUrl = await TvPlayer.subUrl(ctx);
        if (P.stream !== stream) return;
        const ok = (() => { try { return MKAndroid.play(JSON.stringify({ url: src, title: ctx.meta.name || '', sub: v ? `S${v.season} · E${v.episode}${v.name || v.title ? ` · ${v.name || v.title}` : ''}` : [yearOf(ctx.meta), stream._tel && stream._tel.res].filter(Boolean).join(' · '), startMs: Math.round((startAt || 0) * 1000), subUrl, matchRate: CFG.matchRate !== false, headers: nativeHdr ? headers : undefined })); } catch (e) { return false; } })();
        if (!ok) { TvPlayer.cur = null; lu.call(this, stream, startAt); return; }
        Loader.hide && Loader.hide();
      })();
    };
    window.MKNative = {
      done(pos, dur, ended, next, err) {
        const c = TvPlayer.cur; if (!c) return;
        if (err && !(pos > 0)) {
          // the TV player could not open it: the in-app player tries the same source
          TvPlayer.cur = null; c.stream._noNative = true; toast('Playing in the MKCinema player instead', 'info', 3000); lu(c.stream, c.startAt); return;
        }
        TvPlayer.save(pos, dur);
        TvPlayer.cur = null;
        const hasNext = c.ctx.video && nextVideo(c.ctx.meta, c.ctx.video);
        if (hasNext && (next || (ended && CFG.autoNext))) { playNext(); return; }
        if (!$('#player').hidden) closePlayer();
        if (S.view === 'home') renderHome(); else if (S.view === 'library') renderLibrary();
      },
    };
    const sec = SECTIONS.find((s) => s.id === 'playback');
    if (sec && IS_TV && window.MKAndroid) {
      const rows = sec.rows;
      sec.rows = () => [...rows(),
        { key: 'tvPlayer', label: 'TV player', help: 'The TV player uses your TV’s own video hardware: MKV, HEVC, HDR and Dolby Vision play smoothly. The MKCinema player keeps subtitle styling, Night Mode and X-Ray. Needs the MKCinema TV app 1.2.5 or later.', type: 'select', options: [['native', 'TV player (smoothest)'], ['web', 'MKCinema player']], get: () => CFG.tvPlayer || 'native' },
        { key: 'matchRate', label: 'Match the film’s frame rate', help: 'The TV switches to 24 Hz for films shot at 24 frames, so panning shots don’t judder, and switches back afterwards. Some TVs blank for a second while switching.', type: 'toggle', get: () => CFG.matchRate !== false },
      ];
    }
  },
};
TvPlayer.init();

/* Jellyfin and Emby on plain http:// addresses work inside the Android app from 1.2.5 */
{
  const r = Servers.reach.bind(Servers);
  Servers.reach = function (url) { try { if (/^http:/i.test(url) && window.MKAndroid && Updater.newer(MKAndroid.version(), '1.2.4')) return url; } catch (e) { /* older app */ } return r(url); };
}
