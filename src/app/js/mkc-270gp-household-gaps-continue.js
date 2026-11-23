
'use strict';
/* 2.70 household gaps
   1. Continue watching menu: hold a card (or right-click it, or hold OK on a TV remote) to mark it watched or take it off.
   2. Your Jellyfin and Emby libraries become A to Z rows (the existing "On your server" row keeps the newest) and search
      results, titles without an IMDb id included (they open from the server itself), and what you finish is marked watched on your server.
      Settings › Media servers can also bring watched and in-progress titles over from the server.
   3. Android app 1.13: updates download and install by themselves (the page side; see MkAutoUpd).
   4. Anime: episodes are matched between anime numbering (Kitsu) and season numbering (IMDb/TMDB), so sources from
      addons that only know one of them still show up; Anime-Skip adds intro times next to AniSkip.
   6. Group sources by addon (Settings › Streams & addons, off by default). */
(() => {
  const TOUCH_HOLD = 480, KEY_HOLD = 600;
  const okKey = (e) => e.key === 'Enter' || e.keyCode === 23 || e.keyCode === 66;
  const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };
  if (typeof CFG_DEFAULTS === 'object') Object.assign(CFG_DEFAULTS, { srcGroup: false, srvLib: true, srvSync: true, autoUpdate: true });

  /* ================= 1. Continue watching menu ================= */
  const CwMenu = {
    el: null, card: null,
    close(refocus) {
      const m = this.el; if (!m) return; this.el = null; m.classList.remove('on'); setTimeout(() => m.remove(), 180);
      if (refocus && this.card && this.card.isConnected) { const c = this.card; safe(() => (window.Nav && Nav.focus ? Nav.focus(c, true) : c.focus({ preventScroll: true }))); }
    },
    open(card, x, y) {
      this.close(); const vid = card.dataset.video, p = vid && S.progress[vid]; if (!p) return;
      this.card = card;
      const m = document.createElement('div'); m.className = 'cw-menu'; m.setAttribute('role', 'menu');
      const h = document.createElement('div'); h.className = 'cw-h';
      h.textContent = p.type === 'series' && p.season != null ? `${p.name} · S${p.season} E${p.episode}` : p.name || ''; m.appendChild(h);
      const add = (icon, label, fn) => {
        const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem');
        b.innerHTML = `<i data-lucide="${icon}"></i>`; b.appendChild(document.createTextNode(label));
        b.addEventListener('click', (e) => { e.stopPropagation(); this.close(false); fn(); }); m.appendChild(b); return b;
      };
      const first = add('circle-check', 'Mark as watched', () => this.watched(card, vid));
      add('circle-x', 'Remove from Continue watching', () => this.remove(card, vid));
      add('info', 'Details', () => { const meta = S.metas.get(p.metaId) || { id: p.metaId, type: p.type, name: p.name, poster: p.poster }; openDetail(meta, { videoId: p.type === 'series' ? vid : undefined }); });
      document.body.appendChild(m); if (typeof icons === 'function') icons();
      const r = m.getBoundingClientRect(), cr = card.getBoundingClientRect();
      if (x == null) { x = cr.left + cr.width / 2; y = cr.top + cr.height / 2; }
      m.style.left = `${Math.max(8, Math.min(x - r.width / 2, innerWidth - r.width - 8))}px`;
      m.style.top = `${Math.max(8, Math.min(y - r.height - 12 > 8 ? y - r.height - 12 : y + 12, innerHeight - r.height - 8))}px`;
      this.el = m; requestAnimationFrame(() => m.classList.add('on'));
      first.focus({ preventScroll: true });
      if (navigator.vibrate) safe(() => navigator.vibrate(12));
    },
    gone(card) {
      const all = $$(`.card[data-video="${CSS.escape(card.dataset.video)}"]`);
      all.forEach((c) => c.classList.add('cw-gone'));
      setTimeout(() => {
        all.forEach((c) => {
          const rail = c.parentElement, next = c.nextElementSibling || c.previousElementSibling; const had = document.activeElement === c; c.remove();
          if (had && next && next.matches && next.matches('[data-card]')) safe(() => (window.Nav && Nav.focus ? Nav.focus(next, true) : next.focus()));
          const sec = rail && rail.closest('section.row');
          if (sec && sec.id === 'cwRow' && !rail.querySelector('[data-card]')) sec.remove();
        });
        $$('#cwRow .row-title small').forEach((s) => { const n = Object.keys(S.progress).length; s.textContent = ''; });
      }, 230);
    },
    drop(vid) {
      delete S.progress[vid]; Store.set('progress', S.progress);
      if (window.MKAndroid && typeof MKAndroid.watchNextRemove === 'function') safe(() => MKAndroid.watchNextRemove(vid));
    },
    watched(card, vid) {
      const p = S.progress[vid]; if (!p) return;
      this.drop(vid); markWatched(vid); this.gone(card);
      toast(`${p.name} marked as watched`, 'ok');
    },
    remove(card, vid) {
      const p = S.progress[vid]; if (!p) return;
      this.drop(vid); this.gone(card);
      toast(`${p.name} removed from Continue watching`);
    },
  };
  window.MkCwMenu = CwMenu;
  // TV: while the menu is up, the remote moves inside it (the same way the update bar takes the remote)
  if (window.Nav && typeof Nav.root === 'function') { const root = Nav.root.bind(Nav); Nav.root = function (...a) { return CwMenu.el || root(...a); }; }
  { // touch hold, right-click, and holding OK (or the Menu key) on a remote
    let timer = 0, sx = 0, sy = 0, el = null, fired = false, kTimer = 0, kCard = null, kEat = false;
    const cancel = () => { clearTimeout(timer); timer = 0; if (el) el.classList.remove('cw-hold'); el = null; };
    const cardOf = (t) => t && t.closest && t.closest('.card[data-video]');
    document.addEventListener('pointerdown', (e) => {
      if (CwMenu.el && !CwMenu.el.contains(e.target)) CwMenu.close(false);
      const c = cardOf(e.target); if (!c || e.button > 0 || e.pointerType === 'mouse') return;
      fired = false; sx = e.clientX; sy = e.clientY; el = c; c.classList.add('cw-hold');
      timer = setTimeout(() => { fired = true; c.classList.remove('cw-hold'); CwMenu.open(c, sx, sy); }, TOUCH_HOLD);
    }, true);
    document.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); }, true);
    ['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, cancel, true));
    document.addEventListener('scroll', cancel, true);
    document.addEventListener('click', (e) => { if (fired && cardOf(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; } }, true);
    document.addEventListener('contextmenu', (e) => { const c = cardOf(e.target); if (!c) return; e.preventDefault(); cancel(); fired = e.pointerType !== 'mouse' && !!e.pointerType; CwMenu.open(c, e.clientX, e.clientY); }, true);
    document.addEventListener('keydown', (e) => {
      const m = CwMenu.el;
      if (m) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 4 || e.keyCode === 10009 || e.keyCode === 461) { e.preventDefault(); e.stopImmediatePropagation(); CwMenu.close(true); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); e.stopImmediatePropagation();
          const bs = $$('button', m), i = bs.indexOf(document.activeElement), j = Math.max(0, Math.min(bs.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : -1)));
          bs[j].focus({ preventScroll: true }); return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (okKey(e) && m.contains(document.activeElement)) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) document.activeElement.click(); return; }
        return;
      }
      const c = cardOf(e.target); if (!c || e.target !== c) return;
      if (e.key === 'ContextMenu' || e.keyCode === 82 || e.keyCode === 93) { e.preventDefault(); e.stopImmediatePropagation(); CwMenu.open(c); return; }
      if (!okKey(e)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat || kTimer) return;
      kCard = c; c.classList.add('cw-hold');
      kTimer = setTimeout(() => { kTimer = 0; kEat = true; c.classList.remove('cw-hold'); kCard = null; CwMenu.open(c); }, KEY_HOLD);
    }, true);
    document.addEventListener('keyup', (e) => {
      // the OK release that ends a hold, and Back/Escape while the menu is up, stay with the menu
      if (CwMenu.el && (okKey(e) || e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || e.keyCode === 4)) { if (okKey(e) && !kEat) return; kEat = false; e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (okKey(e) && kEat) { kEat = false; e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (!okKey(e) || !kTimer) return;
      e.preventDefault(); e.stopImmediatePropagation();
      clearTimeout(kTimer); kTimer = 0; const c = kCard; kCard = null; if (c) { c.classList.remove('cw-hold'); c.click(); }
    }, true);
    addEventListener('blur', () => { if (kTimer) { clearTimeout(kTimer); kTimer = 0; if (kCard) kCard.classList.remove('cw-hold'); kCard = null; } });
  }

  /* ================= 2. Jellyfin and Emby libraries ================= */
  const MyLib = {
    BASE: 'mkc-virtual://mkc.mylibrary', ID: 'mkc.mylibrary',
    jf() { return typeof Servers === 'undefined' ? [] : Servers.list().filter((s) => (s.kind === 'jellyfin' || s.kind === 'emby') && s.token && s.user); },
    key(s) { return String(s.id).replace(/[^a-z0-9]/gi, '').slice(-14).toLowerCase(); },
    byKey(k) { return this.jf().find((s) => this.key(s) === k) || null; },
    hdr(s) { const a = Servers.jfAuth(s.token); return { Authorization: a, 'X-Emby-Authorization': a, 'X-Emby-Token': s.token, 'X-MediaBrowser-Token': s.token }; },
    get(s, path, ms = 8000) { return Servers.json(`${s.url}${path}`, { headers: this.hdr(s) }, ms); },
    async post(s, path) {
      const u = Servers.reach(`${s.url}${path}`); if (!u) throw new Error('http-blocked');
      const r = await fetch(u, { method: 'POST', headers: this.hdr(s) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return true;
    },
    img(s, id, kind, w) { return Servers.reach(`${s.url}/Items/${id}/Images/${kind}?${kind === 'Primary' ? `maxHeight=${w}` : `maxWidth=${w}`}&quality=85`) || ''; },
    imdb(it) { const p = it.ProviderIds || {}; const v = String(p.Imdb || p.IMDB || p.imdb || '').toLowerCase(); return /^tt\d+$/.test(v) ? v : ''; },
    toMeta(s, it) {
      const type = it.Type === 'Series' ? 'series' : 'movie', imdb = this.imdb(it);
      return {
        id: imdb || `mkjf:${this.key(s)}:${it.Id}`, type, name: it.Name, releaseInfo: it.ProductionYear ? String(it.ProductionYear) : '',
        poster: this.img(s, it.Id, 'Primary', 480), background: (it.BackdropImageTags || []).length ? this.img(s, it.Id, 'Backdrop', 1280) : '',
        description: it.Overview || '', genres: (it.Genres || []).slice(0, 4), imdbRating: it.CommunityRating ? Number(it.CommunityRating).toFixed(1) : undefined,
        runtime: it.RunTimeTicks ? `${Math.round(it.RunTimeTicks / 6e8)} min` : undefined, _srvItem: it.Id,
      };
    },
    manifest() {
      const cats = CFG.srvLib === false ? [] : this.jf().flatMap((s) => [
        { type: 'movie', id: `${this.key(s)}-movie`, name: `Films on ${s.name}`, extra: [{ name: 'skip' }, { name: 'search' }] },
        { type: 'series', id: `${this.key(s)}-series`, name: `Shows on ${s.name}`, extra: [{ name: 'skip' }, { name: 'search' }] },
      ]);
      return { id: this.ID, name: 'Your media servers', version: '1.0.0', description: 'Your own Jellyfin and Emby libraries.', types: ['movie', 'series'], catalogs: cats,
        resources: [{ name: 'catalog' }, { name: 'meta', types: ['movie', 'series'], idPrefixes: ['mkjf:'] }, { name: 'stream', types: ['movie', 'series'], idPrefixes: ['mkjf:'] }] };
    },
    handlers() {
      return {
        catalog: async ({ type, id, extra }) => {
          const [k] = String(id).split('-'), s = this.byKey(k); if (!s) return { metas: [] };
          const q = [`IncludeItemTypes=${type === 'series' ? 'Series' : 'Movie'}`, 'Recursive=true', 'Fields=ProviderIds,ProductionYear,Overview,Genres,CommunityRating,RunTimeTicks,BackdropImageTags',
            extra.search ? `SearchTerm=${encodeURIComponent(extra.search)}` : 'SortBy=SortName&SortOrder=Ascending', `StartIndex=${Number(extra.skip) || 0}`, 'Limit=60', 'EnableTotalRecordCount=false'].join('&');
          const r = await this.get(s, `/Users/${s.user}/Items?${q}`);
          const kids = safe(() => typeof Seats !== 'undefined' && Seats.kids());
          return { metas: (r.Items || []).map((it) => this.toMeta(s, it)).filter((m) => !kids || safe(() => Seats.kidSafe(m))) };
        },
        meta: async ({ id }) => {
          const [, k, item] = String(id).split(':'), s = this.byKey(k); if (!s) return {};
          const it = await this.get(s, `/Users/${s.user}/Items/${item}`);
          const meta = { ...this.toMeta(s, it), id };
          if (meta.type === 'series') {
            const eps = await this.get(s, `/Shows/${item}/Episodes?UserId=${s.user}&Fields=Overview`);
            meta.videos = (eps.Items || []).filter((e) => e.IndexNumber != null).map((e) => ({
              id: `mkjf:${k}:${e.Id}`, season: Number(e.ParentIndexNumber || 1), episode: Number(e.IndexNumber), title: e.Name || `Episode ${e.IndexNumber}`, name: e.Name,
              released: e.PremiereDate || undefined, overview: e.Overview || '', thumbnail: this.img(s, e.Id, 'Primary', 360),
            }));
          }
          return { meta };
        },
        stream: async ({ id }) => {
          const [, k, item] = String(id).split(':'), s = this.byKey(k); if (!s) return { streams: [] };
          const it = await this.get(s, `/Users/${s.user}/Items/${item}`);
          const src = (it.MediaSources || [])[0]; if (!src) return { streams: [] };
          return { streams: this.streamsFor(s, item, src) };
        },
      };
    },
    /* the same two sources the IMDb match gives (Servers.jfStreams): the file as it is, and a copy converted for this device */
    streamsFor(s, item, src) {
      const v = (src.MediaStreams || []).find((m) => m.Type === 'Video') || {}, a = (src.MediaStreams || []).find((m) => m.Type === 'Audio') || {};
      const file = String(src.Path || src.Name || '').split(/[\\/]/).pop();
      const desc = [v.Height ? (v.Height >= 2000 ? '2160p' : `${v.Height}p`) : '', v.Codec ? String(v.Codec).toUpperCase() : '', v.VideoRangeType && v.VideoRangeType !== 'SDR' ? v.VideoRangeType : '', a.Codec ? String(a.Codec).toUpperCase() : ''].filter(Boolean).join(' ');
      const label = s.kind === 'emby' ? 'Emby' : 'Jellyfin', base = `${s.url}/Videos/${item}/stream`;
      return [
        { name: `${label}\n${s.name}`, title: `${file}\n${desc}`, url: Servers.reach(`${base}.${src.Container || 'mkv'}?${Servers.jfQ(s, `static=true&mediaSourceId=${src.Id}&deviceId=${Servers.dev()}`)}`), behaviorHints: { filename: file, videoSize: src.Size } },
        { name: `${label}\n${s.name}`, title: `Converted for this device\n${desc.replace(/\b(HEVC|H265|AV1|DTS|TRUEHD|EAC3|AC3|HDR10\+?|HDR|DOVI|DV)\b/gi, '').replace(/\s+/g, ' ').trim()} H.264 AAC`, url: Servers.reach(`${base}.mp4?${Servers.jfQ(s, `container=mp4&videoCodec=h264&audioCodec=aac&maxAudioChannels=2&mediaSourceId=${src.Id}&deviceId=${Servers.dev()}&playSessionId=${Date.now().toString(36)}`)}`) },
      ].filter((x) => x.url);
    },
    mount() {
      // never before the saved addons have loaded: mounting saves the addon list
      if (typeof engine === 'undefined' || !engine.mountVirtual || !S.booted || engine.booting) return;
      const has = engine.addons.some((a) => a.baseUrl === this.BASE);
      if (!this.jf().length) { if (has) { engine.addons = engine.addons.filter((a) => a.baseUrl !== this.BASE); engine.clearCache(); engine.emit && engine.emit('addons'); } return; }
      engine.mountVirtual(this.manifest(), this.handlers(), { builtin: true });
    },
    /* ---- what you finish is marked watched on your server ---- */
    async itemFor(s, vid) {
      const parts = String(vid).split(':');
      if (parts[0] === 'mkjf') return parts[1] === this.key(s) ? parts[2] : null;
      const imdb = parts[0]; if (!/^tt\d+$/.test(imdb)) return null;
      const se = parts.length >= 3 ? [Number(parts[1]), Number(parts[2])] : null, type = se ? 'series' : 'movie';
      const meta = S.metas.get(imdb) || (await engine.fetchMeta(type, imdb).catch(() => null)) || null; if (!meta || !meta.name) return null;
      const it = await Servers.jfFind(s, meta, type, imdb); if (!it) return null;
      if (!se) return it.Id;
      const r = await this.get(s, `/Shows/${it.Id}/Episodes?UserId=${s.user}&season=${se[0]}`);
      const ep = (r.Items || []).find((e) => Number(e.IndexNumber) === se[1] && Number(e.ParentIndexNumber) === se[0]);
      return ep ? ep.Id : null;
    },
    played(vid) {
      if (CFG.srvSync === false || this.importing) return;
      this.jf().forEach(async (s) => {
        try {
          const id = await this.itemFor(s, vid); if (!id) return;
          await this.post(s, `/Users/${s.user}/PlayedItems/${id}`).catch(() => this.post(s, `/UserPlayedItems/${id}?userId=${s.user}`));
        } catch (e) { /* the server is off or out of reach: nothing to do */ }
      });
    },
    /* ---- bring watched and in-progress titles over from the server ---- */
    async importFrom() {
      const list = this.jf(); if (!list.length) { toast('Connect a Jellyfin or Emby server first', 'err'); return; }
      this.importing = true; let seen = 0, prog = 0;
      try {
        for (const s of list) {
          const q = 'Recursive=true&IncludeItemTypes=Movie,Episode&Fields=ProviderIds,UserData,RunTimeTicks,SeriesId,ParentIndexNumber,IndexNumber&EnableImages=false&Limit=20000';
          const [done, part] = await Promise.all([this.get(s, `/Users/${s.user}/Items?${q}&Filters=IsPlayed`, 30000), this.get(s, `/Users/${s.user}/Items?${q}&Filters=IsResumable`, 30000)]);
          const items = [...(done.Items || []).map((x) => [x, true]), ...(part.Items || []).map((x) => [x, false])];
          const sIds = [...new Set(items.filter(([x]) => x.Type === 'Episode' && x.SeriesId).map(([x]) => x.SeriesId))];
          const series = {};
          for (let i = 0; i < sIds.length; i += 100) {
            const r = await this.get(s, `/Users/${s.user}/Items?Ids=${sIds.slice(i, i + 100).join(',')}&Fields=ProviderIds&EnableImages=false`, 20000);
            (r.Items || []).forEach((x) => { series[x.Id] = x; });
          }
          const w = watchedMap();
          for (const [x, isDone] of items) {
            let vid = '', metaId = '', type = 'movie', name = x.Name;
            if (x.Type === 'Episode') {
              const sr = series[x.SeriesId], imdb = sr && this.imdb(sr); if (!imdb || x.IndexNumber == null) continue;
              vid = `${imdb}:${Number(x.ParentIndexNumber || 1)}:${Number(x.IndexNumber)}`; metaId = imdb; type = 'series'; name = sr.Name;
            } else { const imdb = this.imdb(x); if (!imdb) continue; vid = imdb; metaId = imdb; }
            if (isDone) { if (!w[vid]) { w[vid] = Date.parse((x.UserData || {}).LastPlayedDate || '') || Date.now(); seen++; } delete S.progress[vid]; continue; }
            const ud = x.UserData || {}, t = (ud.PlaybackPositionTicks || 0) / 1e7, d = (x.RunTimeTicks || 0) / 1e7, at = Date.parse(ud.LastPlayedDate || '') || Date.now();
            if (!(t > 5 && d > 30) || w[vid] || (S.progress[vid] && S.progress[vid].at >= at)) continue;
            const m = S.metas.get(metaId) || {};
            S.progress[vid] = { videoId: vid, metaId, type, name, poster: m.poster || this.img(s, x.Type === 'Episode' ? x.SeriesId : x.Id, 'Primary', 480), background: m.background || '', genres: (m.genres || []).slice(0, 2),
              season: type === 'series' ? Number(x.ParentIndexNumber || 1) : undefined, episode: type === 'series' ? Number(x.IndexNumber) : undefined, epTitle: type === 'series' ? x.Name : undefined, t, d, at };
            prog++;
          }
          Store.set('watched', w); Store.set('progress', S.progress);
        }
        toast(seen || prog ? `Brought over ${seen} watched and ${prog} in progress` : 'Nothing new to bring over', 'ok', 5000);
        if (S.view === 'home') renderHome(); else if (S.view === 'library') renderLibrary();
      } catch (e) { toast(e.message === 'http-blocked' ? 'That server is on an http:// address. Set up the MKCinema companion server first' : 'Your server could not be reached. Try again in a moment', 'err', 6000); }
      finally { this.importing = false; }
    },
    init() {
      if (typeof Servers === 'undefined') return;
      const save = Servers.save.bind(Servers);
      Servers.save = (l) => { save(l); safe(() => this.mount()); };
      const mw = markWatched;
      markWatched = function (id) { const had = isWatched(id); const r = mw.apply(this, arguments); if (!had) safe(() => MyLib.played(id)); return r; };
      const sec = typeof secById === 'function' && secById('servers');
      if (sec) {
        const rows = sec.rows;
        sec.rows = () => {
          const r = rows(); if (!this.jf().length) return r;
          const at = Math.max(1, r.findIndex((x) => x.html && /srv-box/.test(safe(() => x.html()) || '')));
          r.splice(at, 0,
            { key: 'srvLib', label: 'Show my libraries', help: 'Your films and shows from Jellyfin and Emby become rows on Home and show up in search. You can move or hide the rows in Arrange Home.', type: 'toggle', get: () => CFG.srvLib !== false, set: (v) => { setCfg('srvLib', v); this.mount(); } },
            { key: 'srvSync', label: 'Mark watched on my server', help: 'When you finish a film or an episode here, your Jellyfin or Emby server marks it watched too.', type: 'toggle', get: () => CFG.srvSync !== false, set: (v) => setCfg('srvSync', v) },
            { key: 'srvImport', label: 'Bring my watch history over', help: 'Films and episodes your server has as watched or half-watched come into MKCinema: watched ones are marked watched, half-watched ones join Continue watching.', type: 'button', text: 'Bring it over', icon: 'download', run: (b) => { if (b) b.disabled = true; this.importFrom().finally(() => { if (b) b.disabled = false; }); } });
          return r;
        };
      }
      const t = setInterval(() => { if (S.booted && !engine.booting) { clearInterval(t); this.mount(); } }, 400);
    },
  };
  window.MyLib = MyLib;
  safe(() => MyLib.init());

  /* ================= 3. Android app: updates by themselves ================= */
  const MkAutoUpd = {
    can() { return !!(window.MKAndroid && typeof MKAndroid.updateAuto === 'function'); },
    ready() { /* downloaded; it installs a few minutes after the app is left */ },
    ask() {
      if (!(window.MKAndroid && typeof MKAndroid.updateInstall === 'function')) return;
      let el = $('#updBar'); if (el) el.remove();
      el = document.createElement('div'); el.id = 'updBar'; el.setAttribute('role', 'status');
      el.innerHTML = '<div><b>An app update is ready</b><small>Install it now. Your settings stay.</small></div><div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="updGo">Install</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="updLater">Later</button></div>';
      document.body.appendChild(el);
      $('#updLater').onclick = () => { el.remove(); safe(() => Nav.settle()); };
      $('#updGo').onclick = () => { el.remove(); safe(() => Nav.settle()); if (!safe(() => MKAndroid.updateInstall())) toast('The update could not install. Use Settings › Updates to update', 'err', 6000); };
      if (IS_TV) setTimeout(() => { if (el.isConnected) safe(() => Nav.focus($('#updGo'), true)); }, 60);
    },
    init() {
      // after an update that installed by itself: say so once
      const want = safe(() => localStorage.getItem('mkc:autoUpd')), have = typeof Updater !== 'undefined' ? Updater.appVer() : '';
      if (want && have) {
        if (!Updater.newer(want, have)) { safe(() => localStorage.removeItem('mkc:autoUpd')); setTimeout(() => toast(`MKCinema updated to ${have}`, 'ok', 6000), 2500); }
      }
      if (typeof Updater === 'undefined' || !this.can()) return;
      const bar = Updater.bar.bind(Updater);
      Updater.bar = function (kind, v) {
        if (kind === 'app' && CFG.autoUpdate !== false && v && v.android) {
          const url = v.apk || 'https://mkcinema.app/download/MKCinema.apk';
          if (safe(() => MKAndroid.updateAuto(url))) { safe(() => localStorage.setItem('mkc:autoUpd', String(v.android))); return; }
        }
        return bar(kind, v);
      };
      const sec = typeof secById === 'function' && (secById('updates') || secById('about'));
      if (sec) {
        const rows = sec.rows;
        // in Settings › Updates it sits under the status card
        sec.rows = () => { const r = rows(), at = sec.id === 'updates' ? 1 : 0; return [...r.slice(0, at), { key: 'autoUpdate', label: 'Update the app by itself', help: 'New versions download in the background and install a few minutes after you leave the app, never during a film. The first time, Android may ask once.', type: 'toggle', get: () => CFG.autoUpdate !== false, set: (v) => setCfg('autoUpdate', v) }, ...r.slice(at)]; };
      }
    },
  };
  window.MkAutoUpd = MkAutoUpd;
  safe(() => MkAutoUpd.init());

  /* ================= 4. Anime numbering and Anime-Skip ================= */
  const ARM = 'https://arm.haglund.dev/api/v2';
  const AnimeMap = {
    mem: new Map(),
    async armMal(mal) {
      const k = `m${mal}`; if (this.mem.has(k)) return this.mem.get(k);
      const p = fetch(`${ARM}/ids?source=myanimelist&id=${encodeURIComponent(mal)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      this.mem.set(k, p); return p;
    },
    async armKitsu(kid) {
      const k = `k${kid}`; if (this.mem.has(k)) return this.mem.get(k);
      const p = fetch(`${ARM}/ids?source=kitsu&id=${encodeURIComponent(kid)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      this.mem.set(k, p); return p;
    },
    /* the episodes that come before this Kitsu entry within the same season (a season split in two parts) */
    async offset(imdb, season, mal) {
      if (typeof AniSkip === 'undefined') return 0;
      const list = (await AniSkip.arm(imdb)).filter((e) => e.s === season && (!e.media || e.media === 'TV' || e.media === 'ONA')).sort((a, b) => a.mal - b.mal);
      let off = 0;
      for (const e of list) { if (e.mal === mal) return off; const n = await AniSkip.eps(e.mal); if (!n) return off; off += n; }
      return 0;
    },
    /* kitsu:ID:EP -> tt:S:E (and kitsu:ID -> tt for films) */
    async toImdb(type, id) {
      const m = String(id).match(/^kitsu:(\d+)(?::(\d+))?$/); if (!m) return null;
      const a = await this.armKitsu(m[1]); if (!a || !/^tt\d+$/.test(a.imdb || '')) return null;
      if (type === 'movie' || !m[2]) return type === 'movie' ? a.imdb : null;
      const season = a['themoviedb-season'] != null ? a['themoviedb-season'] : a['thetvdb-season']; if (season == null) return null;
      const off = a.myanimelist ? await this.offset(a.imdb, season, a.myanimelist) : 0;
      return `${a.imdb}:${season}:${Number(m[2]) + off}`;
    },
    /* tt:S:E -> kitsu:ID:EP */
    async toKitsu(type, id) {
      if (type !== 'series' || typeof AniSkip === 'undefined') return null;
      const m = String(id).match(/^(tt\d+):(\d+):(\d+)$/); if (!m) return null;
      const hit = await AniSkip.find(m[1], Number(m[2]), Number(m[3])); if (!hit) return null;
      const r = await this.armMal(hit.mal);
      return r && r.kitsu ? `kitsu:${r.kitsu}:${hit.ep}` : null;
    },
    animeish(type, id) {
      if (/^kitsu:/.test(id)) return true;
      const meta = S.metas.get(String(id).split(':')[0]);
      return !!(meta && typeof AniSkip !== 'undefined' && AniSkip.animeish(meta));
    },
    async extra(type, id) {
      if ((type !== 'series' && type !== 'movie') || !this.animeish(type, id)) return [];
      const kitsuOnly = (a) => engine.supports(a, 'stream', type, 'kitsu:1:1') && !engine.supports(a, 'stream', type, 'tt0000001:1:1');
      const imdbOnly = (a) => engine.supports(a, 'stream', type, 'tt0000001') && !engine.supports(a, 'stream', type, 'kitsu:1');
      let alt = null, who = [];
      if (/^tt/.test(id)) { who = engine.addons.filter(kitsuOnly); if (who.length) alt = await this.toKitsu(type, id); }
      else if (/^kitsu:/.test(id)) { who = engine.addons.filter(imdbOnly); if (who.length) alt = await this.toImdb(type, id); }
      if (!alt || !who.length) return [];
      const res = await Promise.allSettled(who.map(async (a) => {
        const r = await engine.call(a, 'stream', type, alt);
        return (Array.isArray(r && r.streams) ? r.streams : []).filter((s) => s && typeof s === 'object').map((s) => ({ ...s, _addon: a.manifest.name, _addonId: a.manifest.id, _tel: Telemetry.parse(s) }));
      }));
      return res.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
    },
    init() {
      if (typeof engine === 'undefined') return;
      const fs = engine.fetchStreams.bind(engine);
      engine.fetchStreams = async function (type, id, onPartial) {
        const more = AnimeMap.extra(type, String(id)).catch(() => []);
        let add = [], last = [];
        const wrap = onPartial ? (all, info) => { last = all; onPartial(add.length ? [...all, ...add] : all, info); } : undefined;
        more.then((l) => { add = l; if (l.length && onPartial) onPartial([...last, ...l], { addon: { manifest: { name: 'Anime numbering', id: 'mkc.animemap' } }, ok: true, count: l.length }); });
        const r = await fs(type, id, wrap);
        add = await more; if (!add.length) return r;
        return { ...r, streams: [...r.streams, ...add].sort((x, y) => y._tel.score - x._tel.score) };
      };
    },
  };
  window.MkAnimeMap = AnimeMap;
  safe(() => AnimeMap.init());

  /* Anime-Skip (anime-skip.com, community times): used when AniSkip and the others have no intro for the episode, and
     only when Anime-Skip's copy of the episode is as long as the file playing (within 4 s), so the times fit. */
  const AnimeSkip = {
    API: 'https://api.anime-skip.com/graphql', shows: new Map(), eps: new Map(),
    q(query) { return fetch(this.API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.data) || null); },
    async anilistFor(ctx) {
      const vid = String((ctx.video && ctx.video.id) || '');
      const km = vid.match(/^kitsu:(\d+):(\d+)$/);
      if (km) { const a = await AnimeMap.armKitsu(km[1]); return a && a.anilist ? { al: a.anilist, ep: Number(km[2]) } : null; }
      const ids = safe(() => Trakt.ids(ctx)) || {}, imdb = String(ids.id || ''), season = Number(ids.season), ep = Number(ids.episode);
      if (!/^tt\d+$/.test(imdb) || !season || !ep || typeof AniSkip === 'undefined') return null;
      const hit = await AniSkip.find(imdb, season, ep); if (!hit) return null;
      const r = await AnimeMap.armMal(hit.mal);
      return r && r.anilist ? { al: r.anilist, ep: hit.ep } : null;
    },
    async episodes(al) {
      if (this.eps.has(al)) return this.eps.get(al);
      const p = (async () => {
        const d = await this.q(`{findShowsByExternalId(service:ANILIST,serviceId:"${Number(al)}"){id}}`);
        const show = d && (d.findShowsByExternalId || [])[0]; if (!show) return [];
        const e = await this.q(`{findEpisodesByShowId(showId:"${String(show.id).replace(/[^a-z0-9-]/gi, '')}"){number baseDuration timestamps{at type{name}}}}`);
        return (e && e.findEpisodesByShowId) || [];
      })().catch(() => []);
      this.eps.set(al, p); return p;
    },
    dur() {
      return new Promise((res) => {
        const ok = () => isFinite(video.duration) && video.duration > 60;
        if (ok()) { res(video.duration); return; }
        let n = 0; const t = setInterval(() => { if (ok() || ++n > 40) { clearInterval(t); res(ok() ? video.duration : 0); } }, 500);
      });
    },
    async look(ctx, token) {
      if (!ctx || !ctx.video || !ctx.meta || ctx.meta.type !== 'series' || CFG.animeSkipCom === false) return;
      if (!(/^kitsu:/.test(String(ctx.video.id || '')) || (typeof AniSkip !== 'undefined' && AniSkip.animeish(ctx.meta)))) return;
      if (Skip.m && Skip.m.intro && Skip.m.src !== 'your earlier skips') return;
      const who = await this.anilistFor(ctx); if (!who || token !== Skip.token) return;
      const ep = (await this.episodes(who.al)).find((e) => String(e.number) === String(who.ep)); if (!ep || !(ep.timestamps || []).length) return;
      const d = await this.dur(); if (token !== Skip.token || !d || !ep.baseDuration || Math.abs(ep.baseDuration - d) > 4) return;
      const ts = ep.timestamps.slice().sort((a, b) => a.at - b.at), kind = (t) => String((t.type && t.type.name) || '').toLowerCase();
      const seg = (re) => { const i = ts.findIndex((t) => re.test(kind(t))); if (i < 0) return null; const end = i + 1 < ts.length ? ts[i + 1].at : d; return end > ts[i].at + 5 ? [ts[i].at, end] : null; };
      const intro = seg(/^(new )?intro$/), recap = seg(/^recap$/), cred = seg(/^(new )?credits$/);
      if (!intro && !recap && !cred) return;
      const m = { ...(Skip.m || {}) };
      if (intro && !(Skip.m && Skip.m.intro && Skip.m.src !== 'your earlier skips')) m.intro = intro;
      if (recap && !m.recap) m.recap = recap;
      if (cred && !m.credits) { m.credits = cred[0]; if (cred[1] < d - 20) m.ed = cred; }
      m.src = 'Anime-Skip'; Skip.m = m;
      safe(() => AniSkip.marks());
      safe(() => MKLog.add('info', `skip: times from Anime-Skip (intro ${intro ? intro.map(Math.round).join('-') : 'none'})`));
    },
    init() {
      if (typeof Skip === 'undefined') return;
      const load = Skip.load.bind(Skip);
      Skip.load = async function (ctx) {
        const r = await load(ctx);
        const token = Skip.token;
        AnimeSkip.look(ctx, token).catch(() => {});
        return r;
      };
    },
  };
  window.MkAnimeSkip = AnimeSkip;
  safe(() => AnimeSkip.init());

  /* ================= 6. Sources grouped by addon ================= */
  const SrcGroups = {
    apply(listEl, streams) {
      if (!CFG.srcGroup || !listEl || !streams) return;
      const rows = [...listEl.children].filter((x) => x.matches && x.matches('.stream[data-si]')); if (rows.length < 2) return;
      const groups = new Map();
      rows.forEach((r) => { const st = streams[Number(r.dataset.si)], a = CFG.srcGroup === 'quality' ? SrcWhy.group(st) : (st && st._addon) || 'Other'; if (!groups.has(a)) groups.set(a, []); groups.get(a).push(r); });
      if (groups.size < 2) return;
      $$('.src-grp', listEl).forEach((x) => x.remove());
      const frag = document.createDocumentFragment();
      groups.forEach((list, name) => {
        const h = document.createElement('div'); h.className = 'src-grp'; h.setAttribute('role', 'heading'); h.setAttribute('aria-level', '4');
        const b = document.createElement('b'); b.textContent = name; h.appendChild(b);
        if (CFG.srcGroup === 'quality') { const w = document.createElement('small'); w.className = 'src-why'; w.textContent = SrcWhy.why(name); h.appendChild(w); }
        const n = document.createElement('span'); n.textContent = String(list.length); h.appendChild(n);
        frag.appendChild(h); list.forEach((r) => frag.appendChild(r));
      });
      const tail = [...listEl.children].filter((x) => !rows.includes(x));
      listEl.prepend(frag); tail.forEach((x) => listEl.appendChild(x));
    },
    init() {
      if (typeof renderStreamsPanel !== 'function') return;
      const rs = renderStreamsPanel;
      renderStreamsPanel = function () { const r = rs.apply(this, arguments); safe(() => SrcGroups.apply($('#dStreams .streams'), D.streams)); return r; };
      const list = $('#srcList');
      if (list && window.MutationObserver) {
        let busy = false;
        new MutationObserver(() => { if (busy || !CFG.srcGroup || !P.ctx) return; busy = true; safe(() => SrcGroups.apply(list, P.ctx.streams)); Promise.resolve().then(() => { busy = false; }); }).observe(list, { childList: true });
      }
      const sec = typeof secById === 'function' && secById('streams');
      if (sec) {
        const rows = sec.rows;
        sec.rows = () => { const r = rows(), at = r.findIndex((x) => x.key === 'showTrailers'); r.splice(at >= 0 ? at : r.length, 0, { key: 'srcGroup', label: 'Group sources', help: 'By addon puts each addon’s sources together under its name. By picture quality puts 4K, Full HD and smaller files in their own groups, each with a line on when to pick it.', type: 'select', options: [['', 'One list, best first'], ['addon', 'By addon'], ['quality', 'By picture quality']], get: () => (CFG.srcGroup === true ? 'addon' : CFG.srcGroup || ''), set: (v) => setCfg('srcGroup', v) }); return r; };
      }
    },
  };
  safe(() => SrcGroups.init());
})();
