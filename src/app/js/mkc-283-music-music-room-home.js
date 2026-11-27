
/* 2.83 Music room: a home for music next to films and TV.
   Full songs come only from places the household already has the right to play: their own Plex, Jellyfin, Emby or
   Navidrome (Subsonic) server, music files on the device, free live radio (radio-browser.info, stations' own streams)
   and music addons they install themselves. Discovery (charts, artists, albums, search, artwork) is Apple's public
   iTunes catalog, which also gives a 30-second preview when no full source is found. Lyrics are LRCLIB (free, open).
   Listens can go to ListenBrainz with the user's own token. Nothing here downloads or strips anything from a service. */
const Music = {
  TABS: [['home', 'Home', 'house'], ['explore', 'Explore', 'compass'], ['library', 'Library', 'library-big'], ['radio', 'Radio', 'radio'], ['search', 'Search', 'search'], ['sources', 'Sources', 'plug']],
  GENRES: [[14, 'Pop'], [18, 'Hip-Hop/Rap'], [6, 'Country'], [15, 'R&B/Soul'], [21, 'Rock'], [20, 'Alternative'], [7, 'Electronic'], [17, 'Dance'], [12, 'Latin'], [11, 'Jazz'], [5, 'Classical'], [24, 'Reggae'], [2, 'Blues'], [22, 'Christian'], [16, 'Soundtrack'], [27, 'J-Pop'], [51, 'K-Pop'], [8, 'Holiday']],
  MOODS: [['chill', 'Chill'], ['workout', 'Workout'], ['focus', 'Focus'], ['party', 'Party'], ['sleep', 'Sleep'], ['romance', 'Romance'], ['road trip', 'Road trip'], ['throwback', 'Throwback']],
  tab: 'home', page: null, stack: [], tok: 0, cache: {},
  q: [], qi: -1, cur: null, audio: null, repeat: 'off', shuffle: false, from: '', lrc: null, lrcFor: '', nowTab: 'lyrics', heard: 0, lastT: 0, scrobbled: '',
  files: [],
  /* ---------------- small helpers ---------------- */
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  cc() { const m = String(navigator.language || 'en-US').match(/-([A-Za-z]{2})\b/); return (m ? m[1] : 'us').toLowerCase(); },
  big(u, n = 600) { return u ? String(u).replace(/\/\d+x\d+(bb|cc|sr)?(-\d+)?\.(jpg|png|webp)$/i, `/${n}x${n}bb.jpg`) : ''; },
  dur(s) { s = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
  async j(url, ms = 9000, opts = {}) {
    if (this.cache[url] && Date.now() - this.cache[url].at < 30 * 60e3) return this.cache[url].v;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const v = await r.json(); if (!opts.method) this.cache[url] = { at: Date.now(), v }; return v;
    } finally { clearTimeout(t); }
  },
  lib() { const d = { likes: [], lists: [], hist: [], lb: '' }; return Object.assign(d, Store.get('music', d)); },
  saveLib(l) { l.likes = l.likes.slice(0, 500); l.hist = l.hist.slice(0, 120); l.lists = l.lists.slice(0, 50); Store.set('music', l); },
  slim(t) { const o = {}; ['id', 't', 'a', 'al', 'art', 'dur', 'pv', 'aid', 'cid', 'ex', 'src', 'kind'].forEach((k) => { if (t[k] != null && t[k] !== '') o[k] = t[k]; }); if (o.src && /^blob:/.test(o.src)) delete o.src; return o; },
  liked(t) { return !!t && this.lib().likes.some((x) => x.id === t.id); },
  /* ---------------- catalog (Apple's public iTunes Search API and its RSS charts, both open to browsers) ---------------- */
  fromIt(r) {
    if (!r || (r.kind && r.kind !== 'song')) return null;
    return { id: `it:${r.trackId}`, t: r.trackName, a: r.artistName, al: r.collectionName || '', art: this.big(r.artworkUrl100, 600), dur: (r.trackTimeMillis || 0) / 1000, pv: r.previewUrl || '', aid: r.artistId, cid: r.collectionId, ex: r.trackExplicitness === 'explicit', g: r.primaryGenreName || '' };
  },
  fromRss(e) {
    const L = (x) => (x && x.label) || '', att = (x) => (x && x.attributes) || {};
    const links = [].concat(e.link || []).map(att), pv = links.find((a) => /audio/.test(a.type || '')), page = links.find((a) => /html/.test(a.type || '')) || {};
    const art = [].concat(e['im:image'] || []).map(L).pop() || '';
    const aidm = String(att(e['im:artist']).href || '').match(/\/(?:id)?(\d+)(?:\?|$)/), cidm = String(page.href || '').match(/\/(?:id)?(\d+)\?i=/);
    const col = e['im:collection'] || {};
    return { id: `it:${att(e.id)['im:id']}`, t: L(e['im:name']), a: L(e['im:artist']), al: L(col['im:name']), art: this.big(art, 600), dur: 0, pv: pv ? pv.href : '', aid: aidm ? Number(aidm[1]) : 0, cid: cidm ? Number(cidm[1]) : 0, ex: false, g: att(e.category).label || '' };
  },
  albumRss(e) {
    const L = (x) => (x && x.label) || '', att = (x) => (x && x.attributes) || {};
    return { cid: Number(att(e.id)['im:id']), t: L(e['im:name']), a: L(e['im:artist']), art: this.big([].concat(e['im:image'] || []).map(L).pop(), 600) };
  },
  async top(kind = 'topsongs', genre = 0, n = 30) {
    const u = `https://itunes.apple.com/${this.cc()}/rss/${kind}/limit=${n}${genre ? `/genre=${genre}` : ''}${this.kids() ? '/explicit=false' : ''}/json`;
    const r = await this.j(u); const e = [].concat((r.feed && r.feed.entry) || []);
    return kind === 'topalbums' ? e.map((x) => this.albumRss(x)) : this.clean(e.map((x) => this.fromRss(x)));
  },
  async find(term, entity = 'song', n = 30) {
    const u = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=${entity}&limit=${n}&country=${this.cc()}${this.kids() ? '&explicit=No' : ''}`;
    const r = await this.j(u); return r.results || [];
  },
  async artist(aid) {
    const r = await this.j(`https://itunes.apple.com/lookup?id=${aid}&entity=song&limit=50&country=${this.cc()}`);
    const a = await this.j(`https://itunes.apple.com/lookup?id=${aid}&entity=album&limit=40&country=${this.cc()}`).catch(() => ({ results: [] }));
    const info = (r.results || []).find((x) => x.wrapperType === 'artist') || {};
    return { info, songs: this.clean((r.results || []).map((x) => this.fromIt(x))), albums: (a.results || []).filter((x) => x.wrapperType === 'collection').map((x) => ({ cid: x.collectionId, t: x.collectionName, a: x.artistName, art: this.big(x.artworkUrl100, 600), y: String(x.releaseDate || '').slice(0, 4) })) };
  },
  async album(cid) {
    const r = await this.j(`https://itunes.apple.com/lookup?id=${cid}&entity=song&limit=100&country=${this.cc()}`);
    const info = (r.results || []).find((x) => x.wrapperType === 'collection') || {};
    return { info: { cid, t: info.collectionName, a: info.artistName, aid: info.artistId, art: this.big(info.artworkUrl100, 900), y: String(info.releaseDate || '').slice(0, 4), g: info.primaryGenreName, n: info.trackCount }, songs: this.clean((r.results || []).map((x) => this.fromIt(x))) };
  },
  clean(list) { const seen = new Set(); return list.filter((t) => t && t.t && !seen.has(t.id) && seen.add(t.id) && !(this.kids() && t.ex)); },
  /* ---------------- full-song sources the household owns ---------------- */
  subs() { return Store.raw.get('msubsonic', []) || []; },
  md5(s) {
    // small MD5 for the Subsonic token (md5(password + salt)); the password itself is never stored
    const k = [], r = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]; for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
    const b = unescape(encodeURIComponent(s)), n = ((b.length + 8) >> 6) + 1, w = new Array(n * 16).fill(0);
    for (let i = 0; i < b.length; i++) w[i >> 2] |= b.charCodeAt(i) << ((i % 4) * 8);
    w[b.length >> 2] |= 0x80 << ((b.length % 4) * 8); w[n * 16 - 2] = b.length * 8;
    let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    for (let o = 0; o < w.length; o += 16) {
      let [A, B, C, D] = [a0, b0, c0, d0];
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        const tmp = D; D = C; C = B; const x = (A + F + k[i] + w[o + g]) | 0, sh = r[(i >> 4) * 4 + (i % 4)]; B = (B + ((x << sh) | (x >>> (32 - sh)))) | 0; A = tmp;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    return [a0, b0, c0, d0].map((v) => [0, 1, 2, 3].map((i) => ((v >>> (i * 8)) & 255).toString(16).padStart(2, '0')).join('')).join('');
  },
  ssUrl(s, path, extra = '') { const base = typeof Servers !== 'undefined' ? Servers.reach(s.url) : s.url; if (!base) return null; return `${base}/rest/${path}?u=${encodeURIComponent(s.user)}&t=${s.tok}&s=${s.salt}&v=1.16.1&c=MKCinema&f=json${extra ? `&${extra}` : ''}`; },
  async ssAdd(url, user, pass) {
    url = String(url || '').trim().replace(/\/+$/, ''); if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const salt = Math.random().toString(36).slice(2, 12), s = { id: `ss:${hash(url + user)}`, url, user: String(user || '').trim(), salt, tok: this.md5(String(pass || '') + salt), name: '' };
    const u = this.ssUrl(s, 'ping'); if (!u) throw new Error('This server uses plain http://. Open MKCinema in the Windows or Mac app, or give the server an https address.');
    const r = await this.j(u, 8000).catch(() => { throw new Error('No Navidrome or Subsonic server answered at that address'); });
    const sr = r['subsonic-response'] || {}; if (sr.status !== 'ok') throw new Error((sr.error && sr.error.message) || 'The server said no to that username and password');
    s.name = sr.type ? `${sr.type[0].toUpperCase()}${sr.type.slice(1)}` : 'Music server';
    Store.raw.set('msubsonic', [...this.subs().filter((x) => x.id !== s.id), s]); return s;
  },
  media() { return (typeof Servers !== 'undefined' ? Servers.list() : []).filter((s) => s && s.url && s.token); },
  norm(x) { return String(x || '').toLowerCase().replace(/\(.*?\)|\[.*?\]|feat\..*$/g, '').replace(/[^a-z0-9]+/g, ''); },
  same(t, title, artist) { const a = this.norm(t.t), b = this.norm(title); return a && b && (a === b || a.startsWith(b) || b.startsWith(a)) && (!artist || !t.a || this.norm(artist).includes(this.norm(t.a).slice(0, 6)) || this.norm(t.a).includes(this.norm(artist).slice(0, 6))); },
  async fromServers(t) {
    const jobs = [];
    for (const s of this.subs()) jobs.push((async () => {
      const u = this.ssUrl(s, 'search3', `query=${encodeURIComponent(t.t)}&songCount=12&artistCount=0&albumCount=0`); if (!u) return null;
      const r = await this.j(u, 7000); const songs = (((r['subsonic-response'] || {}).searchResult3 || {}).song) || [];
      const hit = songs.find((x) => this.same(t, x.title, x.artist)); return hit ? { url: this.ssUrl(s, 'stream', `id=${encodeURIComponent(hit.id)}`), from: s.name || 'Your music server' } : null;
    })());
    for (const s of this.media()) jobs.push((async () => {
      if (s.kind === 'plex') {
        const r = await Servers.plexGet(s, `/search?type=10&query=${encodeURIComponent(t.t)}`, 7000); const list = ((r.MediaContainer || {}).Metadata) || [];
        const hit = list.find((x) => this.same(t, x.title, x.grandparentTitle || x.originalTitle)); const p = hit && hit.Media && hit.Media[0] && hit.Media[0].Part && hit.Media[0].Part[0];
        return p ? { url: `${s.url}${p.key}?X-Plex-Token=${encodeURIComponent(s.token)}`, from: s.name || 'Plex' } : null;
      }
      const r = await Servers.json(`${s.url}/Items?${Servers.jfQ(s, `searchTerm=${encodeURIComponent(t.t)}&IncludeItemTypes=Audio&Recursive=true&Limit=15${s.user ? `&userId=${s.user}` : ''}`)}`, {}, 7000);
      const hit = (r.Items || []).find((x) => this.same(t, x.Name, (x.Artists || [])[0] || x.AlbumArtist)); if (!hit) return null;
      const base = Servers.reach(s.url); return base ? { url: `${base}/Audio/${hit.Id}/universal?${Servers.jfQ(s, `UserId=${s.user || ''}&Container=opus,webm|opus,mp3,aac,m4a|aac,m4a|alac,flac,webma,wav,ogg&TranscodingContainer=mp3&AudioCodec=mp3&DeviceId=${Servers.dev()}`)}`, from: s.name || 'Your media server' } : null;
    })());
    const res = await Promise.allSettled(jobs); const ok = res.find((x) => x.status === 'fulfilled' && x.value); return ok ? ok.value : null;
  },
  /* Music addons: an addon whose manifest lists the "music" resource answers
     GET {base}/music/track/{id}/artist={a}&title={t}&album={al}&duration={s}.json  ->  { streams: [{ url, title }] } */
  mAddons() { try { return engine.addons.filter((a) => a.enabled !== false && !a.error && StremioEngine.resources(a.manifest).some((r) => r.name === 'music')); } catch (e) { return []; } },
  async fromAddons(t) {
    const ex = `artist=${encodeURIComponent(t.a || '')}&title=${encodeURIComponent(t.t || '')}&album=${encodeURIComponent(t.al || '')}&duration=${Math.round(t.dur || 0)}`;
    for (const a of this.mAddons()) {
      try {
        const base = String(a.baseUrl).replace(/\/manifest\.json$/, '').replace(/\/+$/, '');
        const r = await this.j(`${base}/music/track/${encodeURIComponent(t.id)}/${ex}.json`, 9000);
        const s = [].concat(r.streams || []).find((x) => x && /^https:\/\//i.test(x.url || '')); if (s) return { url: s.url, from: a.manifest.name || 'Music addon' };
      } catch (e) { /* next addon */ }
    }
    return null;
  },
  async resolve(t) {
    if (t.kind === 'radio' || t.kind === 'file' || t.kind === 'own') return { url: t.src, from: t.fromName || '' };
    const own = await this.fromServers(t).catch(() => null); if (own) return own;
    const ad = await this.fromAddons(t).catch(() => null); if (ad) return ad;
    return t.pv ? { url: t.pv, from: 'Preview', preview: true } : null;
  },
  /* ---------------- playback ---------------- */
  el() {
    if (this.audio) return this.audio;
    const a = this.audio = new Audio(); a.preload = 'auto'; a.crossOrigin = null;
    a.addEventListener('timeupdate', () => this.tick());
    a.addEventListener('play', () => this.paintState()); a.addEventListener('pause', () => this.paintState());
    a.addEventListener('ended', () => this.next(true));
    a.addEventListener('error', () => { if (!this.cur) return; toast(`${this.cur.t} could not play here. Skipping.`, 'err', 3200, 'mus'); setTimeout(() => this.next(true), 900); });
    return a;
  },
  async play(list, i = 0, from = '') {
    list = (list || []).filter(Boolean); if (!list.length) return;
    if (typeof document !== 'undefined' && !$('#player').hidden) { try { closePlayer(); } catch (e) { /* film player already closing */ } }
    this.q = list.slice(0, 300); this.qi = Math.max(0, Math.min(i, this.q.length - 1)); this.from = from || this.from;
    if (this.shuffle) this.shuffleRest();
    return this.start();
  },
  async start() {
    const t = this.cur = this.q[this.qi]; if (!t) return;
    const tok = ++this.tok, a = this.el(); a.pause();
    this.cur.res = null; this.lrc = null; this.heard = 0; this.lastT = 0; this.paintAll();
    const r = await this.resolve(t); if (tok !== this.tok) return;
    if (!r || !r.url) { toast(`No source for ${t.t}. Add your music server in Music › Sources.`, 'err', 4200, 'mus'); return; }
    t.res = r; a.src = r.url; a.play().catch(() => this.paintState());
    this.remember(t); this.session(); this.paintAll(); this.lyrics(t); this.nowPlaying(t);
  },
  toggle() { const a = this.el(); if (!this.cur) return; if (a.paused) a.play().catch(() => {}); else a.pause(); },
  next(auto) {
    if (!this.q.length) return;
    if (auto && this.repeat === 'one') { this.el().currentTime = 0; this.el().play().catch(() => {}); return; }
    if (this.qi < this.q.length - 1) this.qi++; else if (this.repeat === 'all' || !auto) this.qi = 0; else { this.paintState(); return; }
    this.start();
  },
  prev() { const a = this.el(); if (a.currentTime > 4 || this.qi === 0) { a.currentTime = 0; return; } this.qi--; this.start(); },
  shuffleRest() { const head = this.q.slice(0, this.qi + 1), rest = this.q.slice(this.qi + 1); for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; } this.q = head.concat(rest); },
  stop() { this.tok++; if (this.audio) { this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load(); } this.cur = null; this.q = []; this.qi = -1; this.paintAll(); X8.close('musicNow'); try { navigator.mediaSession.metadata = null; } catch (e) { /* no media session */ } },
  remember(t) { if (t.kind === 'file') return; const l = this.lib(); l.hist = [{ ...this.slim(t), at: Date.now() }, ...l.hist.filter((x) => x.id !== t.id)]; this.saveLib(l); },
  like(t) {
    t = t || this.cur; if (!t || t.kind === 'file') return; const l = this.lib(), on = l.likes.some((x) => x.id === t.id);
    l.likes = on ? l.likes.filter((x) => x.id !== t.id) : [this.slim(t), ...l.likes]; this.saveLib(l);
    toast(on ? 'Removed from Liked songs' : 'Added to Liked songs', 'ok', 2000, 'mlike'); this.paintAll();
  },
  async radioFor(t) {
    t = t || this.cur; if (!t) return;
    let list = [];
    if (t.aid) { try { list = (await this.artist(t.aid)).songs; } catch (e) { /* fall back to search */ } }
    if (t.g || t.a) { try { list = list.concat(this.clean((await this.find(`${t.g || t.a}`, 'song', 40)).map((x) => this.fromIt(x)))); } catch (e) { /* what we have */ } }
    list = list.filter((x) => x.id !== t.id); for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    if (!list.length) { toast('No radio for this song yet', 'err', 2400, 'mus'); return; }
    if (this.cur && this.cur.id === t.id) { this.q = [this.cur, ...list.slice(0, 60)]; this.qi = 0; this.from = `${t.t} radio`; this.paintAll(); toast(`${t.t} radio is up next`, 'ok', 2200, 'mus'); }
    else this.play([t, ...list.slice(0, 60)], 0, `${t.t} radio`);
  },
  seek(f) { const a = this.el(); if (a.duration && isFinite(a.duration)) a.currentTime = Math.max(0, Math.min(a.duration - .2, f * a.duration)); },
  tick() {
    const a = this.audio; if (!a || !this.cur) return;
    const d = isFinite(a.duration) ? a.duration : 0, f = d ? a.currentTime / d : 0;
    $$('.mu-fill').forEach((x) => { x.style.transform = `scaleX(${f})`; });
    $$('.mu-knob').forEach((x) => { x.style.left = `${f * 100}%`; });
    const c = $('#muCur'), e = $('#muEnd'); if (c) c.textContent = this.dur(a.currentTime); if (e) e.textContent = this.cur.kind === 'radio' ? 'LIVE' : this.dur(d);
    if (a.currentTime > this.lastT && a.currentTime - this.lastT < 2) this.heard += a.currentTime - this.lastT; this.lastT = a.currentTime;
    this.scrobble(d);
    this.lyricTick(a.currentTime);
    try { if (d && navigator.mediaSession && navigator.mediaSession.setPositionState) navigator.mediaSession.setPositionState({ duration: d, position: Math.min(d, a.currentTime), playbackRate: 1 }); } catch (e) { /* not supported */ }
  },
  /* ---------------- ListenBrainz (the user's own token, from listenbrainz.org/settings) ---------------- */
  async lbSend(type, t) {
    const tok = this.lib().lb; if (!tok || !t || t.kind === 'radio' || (t.res && t.res.preview)) return;
    const meta = { artist_name: t.a || '', track_name: t.t, release_name: t.al || undefined, additional_info: { media_player: 'MKCinema', submission_client: 'MKCinema', submission_client_version: APP_VERSION, duration_ms: t.dur ? Math.round(t.dur * 1000) : undefined } };
    const body = { listen_type: type, payload: [type === 'single' ? { listened_at: Math.floor(Date.now() / 1000), track_metadata: meta } : { track_metadata: meta }] };
    try { await fetch('https://api.listenbrainz.org/1/submit-listens', { method: 'POST', headers: { Authorization: `Token ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) { /* offline: skip */ }
  },
  scrobble(d) {
    const t = this.cur; if (!t || this.scrobbled === `${t.id}:${this.tok}`) return;
    const need = Math.min(240, (d || t.dur || 0) / 2); if (need > 15 && this.heard >= need) { this.scrobbled = `${t.id}:${this.tok}`; this.lbSend('single', t); }
  },
  /* ---------------- lyrics (LRCLIB) ---------------- */
  async lyrics(t) {
    const key = t.id; this.lrcFor = key; this.lrc = null; this.paintLyrics();
    if (t.kind === 'radio') return;
    try {
      const qs = `artist_name=${encodeURIComponent(t.a || '')}&track_name=${encodeURIComponent(t.t)}${t.al ? `&album_name=${encodeURIComponent(t.al)}` : ''}${t.dur ? `&duration=${Math.round(t.dur)}` : ''}`;
      let r = await this.j(`https://lrclib.net/api/get?${qs}`, 8000).catch(() => null);
      if (!r || (!r.syncedLyrics && !r.plainLyrics)) { const l = await this.j(`https://lrclib.net/api/search?track_name=${encodeURIComponent(t.t)}&artist_name=${encodeURIComponent(t.a || '')}`, 8000).catch(() => []); r = (l || []).find((x) => x.syncedLyrics) || (l || [])[0] || null; }
      if (this.lrcFor !== key) return;
      if (!r) { this.lrc = { none: true }; } else if (r.instrumental) { this.lrc = { inst: true }; } else if (r.syncedLyrics) {
        const lines = []; String(r.syncedLyrics).split('\n').forEach((ln) => { const m = ln.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/); if (m) lines.push({ at: Number(m[1]) * 60 + Number(m[2]), x: m[3] }); });
        this.lrc = { lines: lines.filter((l, i) => l.x || (lines[i + 1] && lines[i + 1].x)), synced: true };
      } else this.lrc = { lines: String(r.plainLyrics || '').split('\n').map((x) => ({ at: -1, x })), synced: false };
    } catch (e) { this.lrc = { none: true }; }
    this.paintLyrics();
  },
  lyricTick(now) {
    if (!this.lrc || !this.lrc.synced) return; const box = $('#muLyr'); if (!box || box.closest('[hidden]')) return;
    let i = -1; this.lrc.lines.forEach((l, k) => { if (l.at <= now + .25) i = k; });
    if (i === this.lrcI) return; this.lrcI = i;
    $$('.mu-ln', box).forEach((n, k) => { n.classList.toggle('on', k === i); n.classList.toggle('past', k < i); });
    const on = $$('.mu-ln', box)[i]; if (on) box.scrollTo({ top: on.offsetTop - box.clientHeight * .32, behavior: CFG.reduceMotion ? 'auto' : 'smooth' });
  },
  paintLyrics() {
    const box = $('#muLyr'); if (!box) return; this.lrcI = -2;
    const l = this.lrc;
    if (!this.cur) { box.innerHTML = ''; return; }
    if (this.cur.kind === 'radio') { box.innerHTML = '<p class="mu-soft">Live radio has no lyrics.</p>'; return; }
    if (!l) { box.innerHTML = '<p class="mu-soft">Finding the lyrics…</p>'; return; }
    if (l.inst) { box.innerHTML = '<p class="mu-soft">Instrumental. Just listen.</p>'; return; }
    if (l.none || !l.lines || !l.lines.length) { box.innerHTML = '<p class="mu-soft">No lyrics for this song yet.</p>'; return; }
    box.innerHTML = l.lines.map((x, k) => `<p class="mu-ln${l.synced ? '' : ' flat'}" data-at="${x.at}" ${l.synced ? 'data-nav tabindex="-1"' : ''}>${esc(x.x) || '&nbsp;'}</p>`).join('');
    if (l.synced) $$('.mu-ln', box).forEach((n) => n.addEventListener('click', () => { const at = Number(n.dataset.at); if (at >= 0 && this.audio) this.audio.currentTime = at; }));
    this.lyricTick(this.audio ? this.audio.currentTime : 0);
  },
  /* ---------------- lock screen, headphones, car ---------------- */
  session() {
    const t = this.cur; if (!t || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.t, artist: t.a || '', album: t.al || '', artwork: t.art ? [{ src: this.big(t.art, 512), sizes: '512x512', type: 'image/jpeg' }] : [] });
      const set = (k, fn) => { try { navigator.mediaSession.setActionHandler(k, fn); } catch (e) { /* not supported */ } };
      set('play', () => this.el().play()); set('pause', () => this.el().pause()); set('nexttrack', () => this.next()); set('previoustrack', () => this.prev());
      set('seekto', (d) => { if (d && d.seekTime != null) this.el().currentTime = d.seekTime; });
    } catch (e) { /* no media session */ }
    this.lbSend('playing_now', t);
  },
  /* ---------------- markup pieces ---------------- */
  tile(t, i, set, wide) {
    return `<button class="mu-tile${wide ? ' wide' : ''}" type="button" data-nav data-mset="${set}" data-mi="${i}" title="${esc(`${t.t} · ${t.a || ''}`)}"><span class="mu-art">${t.art ? `<img src="${esc(t.art)}" alt="" loading="lazy" decoding="async">` : `<i data-lucide="${t.kind === 'radio' ? 'radio' : 'music-2'}"></i>`}<span class="mu-play"><i data-lucide="play"></i></span></span><b>${esc(t.t)}</b><small>${esc(t.a || t.sub || '')}</small></button>`;
  },
  albumTile(x, set, i) {
    return `<button class="mu-tile" type="button" data-nav data-malb="${set}" data-mi="${i}" title="${esc(x.t)}"><span class="mu-art">${x.art ? `<img src="${esc(x.art)}" alt="" loading="lazy" decoding="async">` : '<i data-lucide="disc-3"></i>'}</span><b>${esc(x.t)}</b><small>${esc([x.a, x.y].filter(Boolean).join(' · '))}</small></button>`;
  },
  row(title, items, html, more) {
    if (!items || !items.length) return '';
    return `<section class="row mu-row"><div class="row-head"><h2 class="row-title">${esc(title)}</h2>${more ? `<button class="row-more" type="button" data-nav data-mmore="${esc(more)}">See all<i data-lucide="chevron-right"></i></button>` : ''}</div><div class="rail mu-rail">${html}</div></section>`;
  },
  list(tracks, set, opts = {}) {
    return `<ol class="mu-list">${tracks.map((t, i) => `<li><button class="mu-li${this.cur && this.cur.id === t.id ? ' now' : ''}" type="button" data-nav data-mset="${set}" data-mi="${i}"><span class="mu-n">${opts.num === false ? '' : i + 1}</span><span class="mu-th">${t.art ? `<img src="${esc(this.big(t.art, 120))}" alt="" loading="lazy" decoding="async">` : '<i data-lucide="music-2"></i>'}</span><span class="mu-tt"><b>${esc(t.t)}${t.ex ? ' <em class="mu-e" title="Explicit">E</em>' : ''}</b><small>${esc([t.a, t.al].filter(Boolean).join(' · '))}</small></span><span class="mu-d">${t.kind === 'radio' ? 'LIVE' : t.dur ? this.dur(t.dur) : ''}</span></button></li>`).join('')}</ol>`;
  },
  pill(on) {
    return `<nav class="mu-tabs" role="tablist" aria-label="Music">${this.TABS.map(([id, l, ic]) => `<button type="button" role="tab" data-nav data-mtab="${id}" class="${on === id ? 'on' : ''}" aria-selected="${on === id}"><i data-lucide="${ic}"></i><span>${esc(l)}</span></button>`).join('')}</nav>`;
  },
  head() {
    return `<header class="mu-head"><div class="mu-brand"><span class="mu-mark"><i data-lucide="audio-lines"></i></span><b>Music</b></div>${this.pill(this.page ? '' : this.tab)}<div class="mu-tools"><button class="ibtn" type="button" data-nav data-mgo="sources" title="Music sources" aria-label="Music sources"><i data-lucide="settings-2"></i></button></div></header>`;
  },
  hero(t, set, eyebrow) {
    if (!t) return '';
    return `<section class="mu-hero"><img class="mu-hero-bg" src="${esc(this.big(t.art, 300))}" alt="" aria-hidden="true"><div class="mu-hero-in"><span class="mu-hero-art"><img src="${esc(this.big(t.art, 900))}" alt=""></span><div class="mu-hero-txt"><span class="mu-eye">${esc(eyebrow)}</span><h2>${esc(t.t)}</h2><p>${esc([t.a, t.al].filter(Boolean).join(' · '))}</p><div class="inrow"><button class="mu-cta" type="button" data-nav data-mset="${set}" data-mi="0"><i data-lucide="play"></i>Play</button>${t.aid ? `<button class="btn btn-ghost" type="button" data-nav data-mart="${t.aid}"><i data-lucide="mic-vocal"></i>Artist</button>` : ''}<button class="btn btn-ghost" type="button" data-nav data-mradio="${set}"><i data-lucide="radio"></i>Radio</button></div></div></div></section>`;
  },
  /* ---------------- the page ---------------- */
  sets: {},
  async render() {
    const box = $('#musicBody'); if (!box || S.view !== 'music') return;
    const tok = ++this.rtok || (this.rtok = 1); this.sets = {};
    box.innerHTML = `${this.head()}<div class="mu-body"><div class="mu-load">${typeof skeletons === 'function' ? skeletons(8) : ''}</div></div>`;
    this.bind(box); icons();
    let html = '';
    try {
      if (this.page) html = await this['page_' + this.page.k](this.page);
      else html = await this['tab_' + this.tab]();
    } catch (e) { html = `<div class="empty">Music could not load (${esc(e.message || 'offline')}). <button class="btn btn-ghost btn-sm" type="button" data-nav data-mretry>Try again</button></div>`; }
    if (tok !== this.rtok || S.view !== 'music') return;
    $('.mu-body', box).innerHTML = html;
    this.bind($('.mu-body', box)); icons();
    if (IS_TV) Nav.settle();
  },
  put(list) { const k = `s${Object.keys(this.sets).length}`; this.sets[k] = list; return k; },
  async tab_home() {
    const l = this.lib();
    const [songs, albums, r1, r2] = await Promise.all([
      this.top('topsongs', 0, 40).catch(() => []), this.top('topalbums', 0, 24).catch(() => []),
      this.top('topsongs', this.homeGenre(l, 0), 24).catch(() => []), this.top('topsongs', this.homeGenre(l, 1), 24).catch(() => []),
    ]);
    const heroT = l.hist[0] && Date.now() - l.hist[0].at < 3 * 864e5 ? l.hist[0] : songs[0];
    const hs = this.put(heroT ? [heroT, ...songs.filter((x) => x.id !== heroT.id)] : []);
    const ts = this.put(songs), as = this.put(albums), hi = this.put(l.hist), lk = this.put(l.likes), a1 = this.put(r1), a2 = this.put(r2);
    const forgot = l.likes.filter((x) => !l.hist.slice(0, 30).some((h) => h.id === x.id)).slice(0, 20), fg = this.put(forgot);
    const g = (n) => (this.GENRES.find((x) => x[0] === this.homeGenre(l, n)) || [0, ''])[1];
    return this.hero(heroT, hs, heroT === l.hist[0] ? 'Pick up where you left off' : 'Top song right now')
      + this.row('Recently played', l.hist, l.hist.slice(0, 20).map((t, i) => this.tile(t, i, hi)).join(''))
      + this.row('Top songs', songs, songs.slice(1, 25).map((t, i) => this.tile(t, i + 1, ts)).join(''))
      + this.row('Forgotten favorites', forgot, forgot.map((t, i) => this.tile(t, i, fg)).join(''))
      + this.row('New and popular albums', albums, albums.map((x, i) => this.albumTile(x, as, i)).join(''))
      + this.row(`Top ${g(0)}`, r1, r1.map((t, i) => this.tile(t, i, a1)).join(''))
      + this.row(`Top ${g(1)}`, r2, r2.map((t, i) => this.tile(t, i, a2)).join(''))
      + this.row('Liked songs', l.likes, l.likes.slice(0, 20).map((t, i) => this.tile(t, i, lk)).join(''), 'likes')
      + (this.subs().length || this.media().length ? '' : `<p class="tour-note mu-note"><i data-lucide="info"></i> Full songs play from your own music server, your music files, radio or a music addon. Everything else plays a 30-second preview. <button class="linkbtn" type="button" data-nav data-mgo="sources">Add your music</button></p>`);
  },
  homeGenre(l, n) {
    // the two genres this seat listens to most, else Pop and Hip-Hop
    const c = {}; l.hist.slice(0, 60).forEach((t) => { const g = this.GENRES.find((x) => x[1] === t.g); if (g) c[g[0]] = (c[g[0]] || 0) + 1; });
    const ord = Object.keys(c).sort((a, b) => c[b] - c[a]).map(Number).concat([14, 18, 6]); return [...new Set(ord)][n] || 14;
  },
  async tab_explore() {
    const g = this.ex || { k: 'genre', v: 14 };
    let list = [];
    if (g.k === 'genre') list = await this.top('topsongs', g.v, 60); else list = this.clean((await this.find(`${g.v}`, 'song', 50)).map((x) => this.fromIt(x)));
    const s = this.put(list);
    return `<div class="mu-chips"><span class="mu-lab">Genres</span>${this.GENRES.map(([id, l]) => `<button class="chip${g.k === 'genre' && g.v === id ? ' on' : ''}" type="button" data-nav data-mex="genre:${id}">${esc(l)}</button>`).join('')}</div>
      <div class="mu-chips"><span class="mu-lab">Moods</span>${this.MOODS.map(([id, l]) => `<button class="chip${g.k === 'mood' && g.v === id ? ' on' : ''}" type="button" data-nav data-mex="mood:${esc(id)}">${esc(l)}</button>`).join('')}</div>
      <div class="inrow mu-acts"><button class="btn btn-primary btn-sm" type="button" data-nav data-mset="${s}" data-mi="0"><i data-lucide="play"></i>Play all</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-mshuf="${s}"><i data-lucide="shuffle"></i>Shuffle</button></div>
      <div class="mu-grid">${list.map((t, i) => this.tile(t, i, s)).join('')}</div>`;
  },
  async tab_library() {
    const l = this.lib(), lk = this.put(l.likes), hi = this.put(l.hist), fs = this.put(this.files);
    const lists = l.lists.map((p, i) => `<button class="mu-tile" type="button" data-nav data-mlist="${i}"><span class="mu-art mu-stack">${p.items.slice(0, 4).map((t) => (t.art ? `<img src="${esc(this.big(t.art, 200))}" alt="" loading="lazy">` : '<i data-lucide="music-2"></i>')).join('') || '<i data-lucide="list-music"></i>'}</span><b>${esc(p.name)}</b><small>${p.items.length} song${p.items.length === 1 ? '' : 's'}</small></button>`).join('');
    return `<div class="mu-libtop"><button class="mu-big" type="button" data-nav data-mmore="likes"><i data-lucide="heart"></i><b>Liked songs</b><small>${l.likes.length} song${l.likes.length === 1 ? '' : 's'}</small></button><button class="mu-big" type="button" data-nav data-mnewlist><i data-lucide="list-plus"></i><b>New playlist</b><small>Save songs together</small></button><button class="mu-big" type="button" data-nav data-mfiles><i data-lucide="folder-open"></i><b>Music on this device</b><small>${this.files.length ? `${this.files.length} file${this.files.length === 1 ? '' : 's'} open` : 'Play your own files'}</small></button></div>
      ${lists ? `<section class="row mu-row"><div class="row-head"><h2 class="row-title">Your playlists</h2></div><div class="rail mu-rail">${lists}</div></section>` : ''}
      ${this.files.length ? `<section class="mu-sec"><h2 class="row-title">On this device</h2>${this.list(this.files, fs)}</section>` : ''}
      ${l.hist.length ? `<section class="mu-sec"><h2 class="row-title">History</h2>${this.list(l.hist.slice(0, 50), hi)}</section>` : '<p class="tour-note mu-note">Songs you play will show up here.</p>'}`;
  },
  async rb(path) {
    const hosts = ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://fi1.api.radio-browser.info'];
    for (const h of hosts) { try { return await this.j(`${h}/json/${path}`, 8000); } catch (e) { /* next mirror */ } }
    throw new Error('Radio directory did not answer');
  },
  station(x) {
    const hlsOK = !!(this.el().canPlayType('application/vnd.apple.mpegurl'));
    if (!x || !x.url_resolved || !/^https:\/\//i.test(x.url_resolved) || (x.hls && !hlsOK) || x.lastcheckok === 0) return null;
    return { id: `rb:${x.stationuuid}`, kind: 'radio', t: x.name.trim(), a: [x.state, x.country].filter(Boolean).join(', ') || 'Live radio', sub: (x.tags || '').split(',').slice(0, 2).join(' · '), art: /^https:/.test(x.favicon || '') ? x.favicon : '', src: x.url_resolved, fromName: 'Live radio', uuid: x.stationuuid };
  },
  async tab_radio() {
    const g = this.rq || '';
    const path = g ? `stations/search?name=${encodeURIComponent(g)}&order=clickcount&reverse=true&limit=60&hidebroken=true&is_https=true` : `stations/search?countrycode=${this.cc().toUpperCase()}&order=clickcount&reverse=true&limit=48&hidebroken=true&is_https=true`;
    const [near, world] = await Promise.all([this.rb(path), g ? Promise.resolve([]) : this.rb('stations/topclick/40?hidebroken=true')]);
    const A = (near || []).map((x) => this.station(x)).filter(Boolean), B = (world || []).map((x) => this.station(x)).filter(Boolean).filter((x) => !A.some((y) => y.id === x.id));
    const a = this.put(A), b = this.put(B);
    const tags = ['news', 'jazz', 'classical', 'hits', 'country', 'rock', 'hip hop', 'lofi', 'talk', 'sports', 'christmas'];
    return `<form class="mu-search" data-mrform><i data-lucide="search"></i><input id="muRq" type="search" placeholder="Find a station" value="${esc(g)}" autocomplete="off" enterkeyhint="search" data-nav></form>
      <div class="mu-chips">${tags.map((x) => `<button class="chip${g === x ? ' on' : ''}" type="button" data-nav data-mrtag="${esc(x)}">${esc(x[0].toUpperCase() + x.slice(1))}</button>`).join('')}</div>
      ${A.length ? `<section class="mu-sec"><h2 class="row-title">${g ? 'Stations' : 'Popular near you'}</h2><div class="mu-grid radio">${A.map((t, i) => this.tile(t, i, a)).join('')}</div></section>` : '<p class="tour-note mu-note">No stations found.</p>'}
      ${B.length ? `<section class="mu-sec"><h2 class="row-title">Popular around the world</h2><div class="mu-grid radio">${B.map((t, i) => this.tile(t, i, b)).join('')}</div></section>` : ''}
      <p class="tour-note mu-note">Stations from the free Radio Browser directory, playing each station's own stream.</p>`;
  },
  async tab_search() {
    const term = this.sq || ''; let body = '';
    if (term.trim().length > 1) {
      const [songs, artists, albums] = await Promise.all([this.find(term, 'song', 25), this.find(term, 'musicArtist', 8), this.find(term, 'album', 12)]);
      const S1 = this.clean(songs.map((x) => this.fromIt(x))), s = this.put(S1);
      const AL = albums.map((x) => ({ cid: x.collectionId, t: x.collectionName, a: x.artistName, art: this.big(x.artworkUrl100, 600), y: String(x.releaseDate || '').slice(0, 4) })), al = this.put(AL);
      const art = (aid) => (S1.find((t) => t.aid === aid) || AL.find((x) => x.a && albums.find((y) => y.collectionId === x.cid && y.artistId === aid)) || {}).art;
      body = (artists.length ? `<section class="mu-sec"><h2 class="row-title">Artists</h2><div class="mu-arts">${artists.map((x) => `<button class="mu-artist" type="button" data-nav data-mart="${x.artistId}"><span>${art(x.artistId) ? `<img src="${esc(this.big(art(x.artistId), 300))}" alt="" loading="lazy">` : '<i data-lucide="mic-vocal"></i>'}</span><b>${esc(x.artistName)}</b><small>${esc(x.primaryGenreName || 'Artist')}</small></button>`).join('')}</div></section>` : '')
        + (S1.length ? `<section class="mu-sec"><h2 class="row-title">Songs</h2>${this.list(S1, s)}</section>` : '')
        + this.row('Albums', AL, AL.map((x, i) => this.albumTile(x, al, i)).join(''))
        || '<p class="tour-note mu-note">Nothing found. Try another spelling.</p>';
    } else {
      body = `<div class="mu-chips mu-browse">${this.GENRES.map(([id, l]) => `<button class="mu-gcard" type="button" data-nav data-mex="genre:${id}" style="--h:${(id * 47) % 360}"><b>${esc(l)}</b></button>`).join('')}</div>`;
    }
    return `<form class="mu-search" data-msform><i data-lucide="search"></i><input id="muSq" type="search" placeholder="Songs, artists, albums" value="${esc(term)}" autocomplete="off" enterkeyhint="search" data-nav></form>${body}`;
  },
  async tab_sources() {
    const subs = this.subs(), media = this.media(), adds = this.mAddons(), lb = this.lib().lb;
    const row = (ic, name, sub, del) => `<div class="seat-row"><span class="seat-av srv-av"><i data-lucide="${ic}"></i></span><div><b>${esc(name)}</b><small>${esc(sub)}</small></div>${del ? `<div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav data-mssdel="${esc(del)}">Remove</button></div>` : ''}</div>`;
    return `<section class="mu-sec mu-src"><h2 class="row-title">Where full songs come from</h2>
      <p class="tour-note">MKCinema plays full songs from music you already have: your own server, your files, live radio, or a music addon you choose. When none of them has a song, you hear a 30-second preview.</p>
      <div class="seat-rows">${media.map((s) => row('server', s.name, `${s.kind === 'plex' ? 'Plex' : s.kind === 'emby' ? 'Emby' : 'Jellyfin'} · music on this server plays in full`)).join('')}${subs.map((s) => row('server', s.name || 'Music server', `${String(s.url).replace(/^https?:\/\//, '')} · ${s.user}`, s.id)).join('')}${adds.map((a) => row('puzzle', a.manifest.name, 'Music addon')).join('')}${row('radio', 'Live radio', 'Always on, from the Radio Browser directory')}${row('folder-open', 'Files on this device', 'Library › Music on this device')}</div>
      ${!media.length ? `<p class="tour-note">Plex, Jellyfin and Emby connect once for films and music: <button class="linkbtn" type="button" data-nav data-msrv>Settings › Media servers</button></p>` : ''}</section>
      <section class="mu-sec mu-src"><h2 class="row-title">Navidrome or Subsonic</h2><p class="tour-note">Your server's address, username and password. The password never leaves this device; only a one-way code is saved.</p>
      <form class="srv-box mu-form" data-mssform><input id="muSsUrl" type="url" placeholder="https://music.example.com" autocomplete="off" data-nav><input id="muSsUser" type="text" placeholder="Username" autocomplete="username" data-nav><input id="muSsPass" type="password" placeholder="Password" autocomplete="current-password" data-nav><button class="btn btn-primary btn-sm" type="submit" data-nav><i data-lucide="plug"></i>Connect</button></form></section>
      <section class="mu-sec mu-src"><h2 class="row-title">ListenBrainz</h2><p class="tour-note">Keep a history of what you listen to on ListenBrainz, the free, open music history. Paste your user token from listenbrainz.org/settings.</p>
      <form class="srv-box mu-form" data-mlbform><input id="muLb" type="password" placeholder="${lb ? 'Connected. Paste a new token to change it' : 'User token'}" autocomplete="off" data-nav><button class="btn btn-primary btn-sm" type="submit" data-nav>${lb ? 'Save' : 'Connect'}</button>${lb ? '<button class="btn btn-ghost btn-sm" type="button" data-nav data-mlboff>Disconnect</button>' : ''}</form></section>`;
  },
  async page_artist(p) {
    const r = await this.artist(p.id), s = this.put(r.songs), al = this.put(r.albums);
    const art = (r.albums[0] || r.songs[0] || {}).art || '';
    return `<button class="mu-back" type="button" data-nav data-mback><i data-lucide="arrow-left"></i><span>Artist</span></button>
      <section class="mu-ahead"><span class="mu-aimg">${art ? `<img src="${esc(this.big(art, 600))}" alt="">` : '<i data-lucide="mic-vocal"></i>'}</span><div><h1>${esc(r.info.artistName || (r.songs[0] || {}).a || 'Artist')}</h1><p>${esc([r.info.primaryGenreName, `${r.songs.length} songs`].filter(Boolean).join(' · '))}</p><div class="inrow"><button class="mu-cta" type="button" data-nav data-mset="${s}" data-mi="0"><i data-lucide="play"></i>Play</button><button class="btn btn-ghost" type="button" data-nav data-mshuf="${s}"><i data-lucide="shuffle"></i>Shuffle</button><button class="btn btn-ghost" type="button" data-nav data-mradio="${s}"><i data-lucide="radio"></i>Radio</button></div></div></section>
      <section class="mu-sec"><h2 class="row-title">Popular</h2>${this.list(r.songs.slice(0, 20), s)}</section>
      ${this.row('Albums', r.albums, r.albums.map((x, i) => this.albumTile(x, al, i)).join(''))}`;
  },
  async page_album(p) {
    const r = await this.album(p.id), s = this.put(r.songs), i = r.info;
    return `<button class="mu-back" type="button" data-nav data-mback><i data-lucide="arrow-left"></i><span>Album</span></button>
      <section class="mu-ahead alb"><span class="mu-aimg sq">${i.art ? `<img src="${esc(i.art)}" alt="">` : '<i data-lucide="disc-3"></i>'}</span><div><span class="mu-eye">Album</span><h1>${esc(i.t || '')}</h1><p>${i.aid ? `<button class="linkbtn" type="button" data-nav data-mart="${i.aid}">${esc(i.a || '')}</button>` : esc(i.a || '')}${esc([i.y, i.g, `${r.songs.length} songs`].filter(Boolean).map((x) => ` · ${x}`).join(''))}</p><div class="inrow"><button class="mu-cta" type="button" data-nav data-mset="${s}" data-mi="0"><i data-lucide="play"></i>Play</button><button class="btn btn-ghost" type="button" data-nav data-mshuf="${s}"><i data-lucide="shuffle"></i>Shuffle</button></div></div></section>
      <section class="mu-sec">${this.list(r.songs, s, { num: true })}</section>`;
  },
  async page_likes() {
    const l = this.lib(), s = this.put(l.likes);
    return `<button class="mu-back" type="button" data-nav data-mback><i data-lucide="arrow-left"></i><span>Library</span></button><section class="mu-ahead alb"><span class="mu-aimg sq mu-likeart"><i data-lucide="heart"></i></span><div><span class="mu-eye">Playlist</span><h1>Liked songs</h1><p>${l.likes.length} songs</p><div class="inrow"><button class="mu-cta" type="button" data-nav data-mset="${s}" data-mi="0" ${l.likes.length ? '' : 'disabled'}><i data-lucide="play"></i>Play</button><button class="btn btn-ghost" type="button" data-nav data-mshuf="${s}" ${l.likes.length ? '' : 'disabled'}><i data-lucide="shuffle"></i>Shuffle</button></div></div></section><section class="mu-sec">${l.likes.length ? this.list(l.likes, s) : '<p class="tour-note mu-note">Tap the heart on any song to keep it here.</p>'}</section>`;
  },
  async page_list(p) {
    const l = this.lib(), pl = l.lists[p.id]; if (!pl) { this.page = null; return this.tab_library(); }
    const s = this.put(pl.items);
    return `<button class="mu-back" type="button" data-nav data-mback><i data-lucide="arrow-left"></i><span>Library</span></button><section class="mu-ahead alb"><span class="mu-aimg sq mu-stack">${pl.items.slice(0, 4).map((t) => (t.art ? `<img src="${esc(this.big(t.art, 300))}" alt="">` : '')).join('') || '<i data-lucide="list-music"></i>'}</span><div><span class="mu-eye">Playlist</span><h1>${esc(pl.name)}</h1><p>${pl.items.length} songs</p><div class="inrow"><button class="mu-cta" type="button" data-nav data-mset="${s}" data-mi="0" ${pl.items.length ? '' : 'disabled'}><i data-lucide="play"></i>Play</button><button class="btn btn-ghost" type="button" data-nav data-mshuf="${s}" ${pl.items.length ? '' : 'disabled'}><i data-lucide="shuffle"></i>Shuffle</button><button class="btn btn-ghost" type="button" data-nav data-mldel="${p.id}"><i data-lucide="trash-2"></i>Delete</button></div></div></section><section class="mu-sec">${pl.items.length ? this.list(pl.items, s) : '<p class="tour-note mu-note">Add songs from Now Playing with the Playlist button.</p>'}</section>`;
  },
  /* ---------------- navigation inside Music ---------------- */
  open(page) { this.stack.push(this.page ? { page: this.page } : { tab: this.tab }); this.page = page; this.render(); scrollTo({ top: 0 }); },
  goTab(t) { this.page = null; this.stack = []; this.tab = t; this.render(); scrollTo({ top: 0 }); },
  backOne() { const p = this.stack.pop(); if (!p) return false; if (p.page) this.page = p.page; else { this.page = null; this.tab = p.tab; } this.render(); return true; },
  bind(box) {
    const on = (sel, fn) => $$(sel, box).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); fn(b); }));
    on('[data-mtab]', (b) => this.goTab(b.dataset.mtab));
    on('[data-mgo]', (b) => this.goTab(b.dataset.mgo));
    on('[data-mset]', (b) => { const l = this.sets[b.dataset.mset]; if (l) this.play(l, Number(b.dataset.mi), this.page ? this.page.title || '' : this.TABS.find((x) => x[0] === this.tab)[1]); });
    on('[data-mshuf]', (b) => { const l = this.sets[b.dataset.mshuf]; if (!l || !l.length) return; this.shuffle = true; this.play(l, Math.floor(Math.random() * l.length)); });
    on('[data-mradio]', (b) => { const l = this.sets[b.dataset.mradio]; if (l && l[0]) this.radioFor(l[0]); });
    on('[data-malb]', (b) => { const x = (this.sets[b.dataset.malb] || [])[Number(b.dataset.mi)]; if (x && x.cid) this.open({ k: 'album', id: x.cid, title: x.t }); });
    on('[data-mart]', (b) => this.open({ k: 'artist', id: Number(b.dataset.mart) }));
    on('[data-mmore]', () => this.open({ k: 'likes', title: 'Liked songs' }));
    on('[data-mlist]', (b) => this.open({ k: 'list', id: Number(b.dataset.mlist) }));
    on('[data-mback]', () => { if (!this.backOne()) this.goTab(this.tab); });
    on('[data-mretry]', () => { this.cache = {}; this.render(); });
    on('[data-mex]', (b) => { const [k, v] = b.dataset.mex.split(':'); this.ex = { k, v: k === 'genre' ? Number(v) : v }; if (this.tab !== 'explore' || this.page) this.goTab('explore'); else this.render(); });
    on('[data-mrtag]', (b) => { this.rq = this.rq === b.dataset.mrtag ? '' : b.dataset.mrtag; this.render(); });
    on('[data-mnewlist]', () => this.newList());
    on('[data-mldel]', (b) => { const l = this.lib(); const p = l.lists[Number(b.dataset.mldel)]; if (!p || !confirmSoft(`Delete ${p.name}?`)) return; l.lists.splice(Number(b.dataset.mldel), 1); this.saveLib(l); this.backOne() || this.goTab('library'); });
    on('[data-mfiles]', () => this.pickFiles());
    on('[data-msrv]', () => { try { openSettings('servers'); } catch (e) { $('#openSettings').click(); } });
    on('[data-mssdel]', (b) => { Store.raw.set('msubsonic', this.subs().filter((x) => x.id !== b.dataset.mssdel)); this.render(); });
    on('[data-mlboff]', () => { const l = this.lib(); l.lb = ''; this.saveLib(l); toast('ListenBrainz disconnected', 'ok', 2000); this.render(); });
    $$('form[data-msform]', box).forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); this.sq = $('#muSq').value.trim(); this.render(); }));
    $$('form[data-mrform]', box).forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); this.rq = $('#muRq').value.trim(); this.render(); }));
    $$('form[data-mssform]', box).forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = $('button[type=submit]', f); btn.disabled = true;
      try { const s = await this.ssAdd($('#muSsUrl').value, $('#muSsUser').value, $('#muSsPass').value); toast(`${s.name} connected. Its songs now play in full.`, 'ok', 3600); this.render(); }
      catch (err) { toast(err.message, 'err', 5200); btn.disabled = false; }
    }));
    $$('form[data-mlbform]', box).forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault(); const v = $('#muLb').value.trim(); if (!v) return;
      try { const r = await fetch('https://api.listenbrainz.org/1/validate-token', { headers: { Authorization: `Token ${v}` } }).then((x) => x.json()); if (!r.valid) throw new Error('ListenBrainz did not accept that token'); const l = this.lib(); l.lb = v; this.saveLib(l); toast(`ListenBrainz connected as ${r.user_name}`, 'ok', 3200); this.render(); }
      catch (err) { toast(err.message || 'ListenBrainz did not answer', 'err', 4200); }
    }));
    $$('input[type=search], .mu-form input', box).forEach((i) => { try { if (typeof X8 !== 'undefined' && X8.inputKeys) X8.inputKeys(i); } catch (e) { /* plain input */ } });
  },
  newList(addT) {
    const name = (prompt('Name your playlist', 'My playlist') || '').trim().slice(0, 60); if (!name) return;
    const l = this.lib(); l.lists.unshift({ name, items: addT ? [this.slim(addT)] : [], at: Date.now() }); this.saveLib(l);
    toast(addT ? `Added to ${name}` : `${name} is ready`, 'ok', 2200, 'mlist'); if (S.view === 'music' && this.tab === 'library' && !this.page) this.render();
  },
  addTo(t) {
    t = t || this.cur; if (!t || t.kind === 'radio' || t.kind === 'file') return;
    const l = this.lib(); const box = $('#muAdd'); if (!box) return;
    box.hidden = !box.hidden; if (box.hidden) return;
    box.innerHTML = `<button class="mu-addi" type="button" data-nav data-maddnew><i data-lucide="list-plus"></i>New playlist</button>${l.lists.map((p, i) => `<button class="mu-addi" type="button" data-nav data-maddto="${i}"><i data-lucide="list-music"></i>${esc(p.name)}<small>${p.items.length}</small></button>`).join('')}`;
    icons();
    $$('[data-maddnew]', box).forEach((b) => b.onclick = () => { box.hidden = true; this.newList(t); });
    $$('[data-maddto]', box).forEach((b) => b.onclick = () => { const L = this.lib(), p = L.lists[Number(b.dataset.maddto)]; if (!p) return; if (!p.items.some((x) => x.id === t.id)) p.items.push(this.slim(t)); this.saveLib(L); box.hidden = true; toast(`Added to ${p.name}`, 'ok', 2000, 'mlist'); });
    if (IS_TV) Nav.focus($('.mu-addi', box), true);
  },
  pickFiles() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,.flac,.m4a,.mp3,.ogg,.opus,.wav,.aac'; inp.multiple = true;
    inp.onchange = () => {
      const fs = [...inp.files].filter((f) => /^audio\//.test(f.type) || /\.(flac|m4a|mp3|ogg|opus|wav|aac)$/i.test(f.name)); if (!fs.length) return;
      this.files.forEach((t) => { try { URL.revokeObjectURL(t.src); } catch (e) { /* gone */ } });
      this.files = fs.sort((a, b) => a.name.localeCompare(b.name)).map((f, i) => { const base = f.name.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]+/, ''); const m = base.split(/\s+-\s+/); return { id: `file:${i}:${f.name}`, kind: 'file', t: m.length > 1 ? m.slice(1).join(' - ') : base, a: m.length > 1 ? m[0] : 'On this device', src: URL.createObjectURL(f), fromName: 'This device' }; });
      this.play(this.files, 0, 'Music on this device'); if (S.view === 'music') this.goTab('library');
    };
    inp.click();
  },
  /* ---------------- Now Playing (full screen) and the mini player ---------------- */
  nowHTML() {
    const t = this.cur; if (!t) return '';
    const radio = t.kind === 'radio', pv = t.res && t.res.preview, from = this.from || (t.res && t.res.from) || 'Music';
    const chip = (d, ic, l, on) => `<button class="mu-chip${on ? ' on' : ''}" type="button" data-nav ${d}><i data-lucide="${ic}"></i>${esc(l)}</button>`;
    return `<img class="mu-now-bg" src="${esc(this.big(t.art, 300))}" alt="" aria-hidden="true" ${t.art ? '' : 'hidden'}>
      <div class="mu-now-top"><button class="ibtn" type="button" data-nav data-mnclose aria-label="Close"><i data-lucide="chevron-down"></i></button><span class="mu-eye">Now playing</span><span class="mu-sp"></span><button class="ibtn" type="button" data-nav data-mnsleep title="Sleep timer" aria-label="Sleep timer"><i data-lucide="moon"></i></button><button class="ibtn" type="button" data-nav data-mnstop title="Stop" aria-label="Stop music"><i data-lucide="square"></i></button></div>
      <div class="mu-now-in">
        <div class="mu-now-art">${t.art ? `<img src="${esc(this.big(t.art, 1000))}" alt="">` : `<i data-lucide="${radio ? 'radio' : 'music-2'}"></i>`}</div>
        <div class="mu-now-side">
          <span class="mu-eye mu-from">Playing from ${esc(from)}${pv ? ' · <b class="mu-pv">30-second preview</b>' : ''}</span>
          <h1 class="mu-now-t">${esc(t.t)}</h1>
          <p class="mu-now-a">${t.aid ? `<button class="linkbtn" type="button" data-nav data-mnart="${t.aid}">${esc(t.a || '')}</button>` : esc(t.a || '')}${t.al ? `<small>${t.cid ? `<button class="linkbtn" type="button" data-nav data-mnalb="${t.cid}">${esc(t.al)}</button>` : esc(t.al)}</small>` : ''}</p>
          <div class="mu-chips mu-now-chips">${radio || t.kind === 'file' ? '' : chip('data-mnlike', 'heart', this.liked(t) ? 'Liked' : 'Like', this.liked(t)) + chip('data-mnadd', 'list-plus', 'Playlist') + chip('data-mnradio', 'radio', 'Radio')}${radio ? '' : chip('data-mnshuf', 'shuffle', 'Shuffle', this.shuffle) + chip('data-mnrep', this.repeat === 'one' ? 'repeat-1' : 'repeat', this.repeat === 'one' ? 'Repeat one' : this.repeat === 'all' ? 'Repeat all' : 'Repeat', this.repeat !== 'off')}</div>
          <div class="mu-add" id="muAdd" hidden></div>
          ${radio ? '<div class="mu-live"><span class="mu-dot"></span>Live</div>' : `<div class="mu-bar" data-mnseek role="slider" aria-label="Seek" tabindex="0" data-nav><span class="mu-track"><span class="mu-fill"></span></span><span class="mu-knob"></span></div><div class="mu-times"><span id="muCur">0:00</span><span id="muEnd">${this.dur(t.dur)}</span></div>`}
          <div class="mu-ctl">${radio ? '' : '<button class="ibtn" type="button" data-nav data-mnprev aria-label="Previous"><i data-lucide="skip-back"></i></button>'}<button class="mu-pp" type="button" data-nav data-mnpp aria-label="Play or pause"><i data-lucide="${this.audio && !this.audio.paused ? 'pause' : 'play'}"></i></button>${radio ? '' : '<button class="ibtn" type="button" data-nav data-mnnext aria-label="Next"><i data-lucide="skip-forward"></i></button>'}</div>
          <div class="mu-ntabs" role="tablist">${[['lyrics', 'Lyrics'], ['next', 'Up next'], ['info', 'Info']].map(([id, l]) => `<button type="button" role="tab" data-nav data-mntab="${id}" class="${this.nowTab === id ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="mu-npan" ${this.nowTab === 'lyrics' ? '' : 'hidden'}><div class="mu-lyr" id="muLyr"></div></div>
          <div class="mu-npan" ${this.nowTab === 'next' ? '' : 'hidden'}>${this.q.length > this.qi + 1 ? this.list(this.q.slice(this.qi + 1, this.qi + 40), 'q', { num: false }) : '<p class="mu-soft">Nothing queued. Press Radio for more like this.</p>'}</div>
          <div class="mu-npan" ${this.nowTab === 'info' ? '' : 'hidden'}><dl class="mu-info">${[['Song', t.t], ['Artist', t.a], ['Album', t.al], ['Genre', t.g], ['Length', t.dur ? this.dur(t.dur) : ''], ['Playing from', t.res ? t.res.from : 'Finding a source…']].filter((x) => x[1]).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${pv ? '<p class="mu-soft">Add your own music server or a music addon in Music › Sources to hear the full song.</p>' : ''}</div>
        </div>
      </div>`;
  },
  nowPlaying() { const box = X8.body('musicNow'); if (box && !$('#musicNow').hidden) this.paintNow(); },
  openNow() { if (!this.cur) return; X8.layer('musicNow', { label: 'Now playing', full: true }); $('#musicNow').classList.add('mu-now'); this.paintNow(); X8.open('musicNow'); if (IS_TV) setTimeout(() => { const b = $('[data-mnpp]'); if (b) Nav.focus(b, true); }, 320); },
  paintNow() {
    const box = X8.body('musicNow'); if (!box) return; box.innerHTML = this.nowHTML(); icons(); this.paintLyrics(); this.tick();
    const on = (sel, fn) => $$(sel, box).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); fn(b, e); }));
    on('[data-mnclose]', () => X8.close('musicNow'));
    on('[data-mnstop]', () => this.stop());
    on('[data-mnpp]', () => this.toggle()); on('[data-mnnext]', () => this.next()); on('[data-mnprev]', () => this.prev());
    on('[data-mnlike]', () => this.like()); on('[data-mnadd]', () => this.addTo()); on('[data-mnradio]', () => this.radioFor());
    on('[data-mnshuf]', () => { this.shuffle = !this.shuffle; if (this.shuffle) this.shuffleRest(); this.paintNow(); });
    on('[data-mnrep]', () => { this.repeat = { off: 'all', all: 'one', one: 'off' }[this.repeat]; this.paintNow(); });
    on('[data-mntab]', (b) => { this.nowTab = b.dataset.mntab; this.paintNow(); if (IS_TV) Nav.focus($(`[data-mntab="${this.nowTab}"]`, box), true); });
    on('[data-mnart]', (b) => { X8.close('musicNow'); go('music'); this.open({ k: 'artist', id: Number(b.dataset.mnart) }); });
    on('[data-mnalb]', (b) => { X8.close('musicNow'); go('music'); this.open({ k: 'album', id: Number(b.dataset.mnalb) }); });
    on('[data-mnsleep]', () => this.sleepCycle());
    on('[data-mset="q"]', (b) => { this.qi = this.qi + 1 + Number(b.dataset.mi); this.start(); });
    const bar = $('[data-mnseek]', box);
    if (bar) {
      const at = (e) => { const r = bar.getBoundingClientRect(); this.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); };
      bar.addEventListener('pointerdown', (e) => { at(e); bar.setPointerCapture(e.pointerId); bar.onpointermove = at; });
      bar.addEventListener('pointerup', () => { bar.onpointermove = null; });
      bar.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); this.el().currentTime += e.key === 'ArrowLeft' ? -10 : 10; } });
    }
  },
  sleepCycle() {
    const steps = [0, 15, 30, 60, -1]; const i = (steps.indexOf(this.sleepM || 0) + 1) % steps.length; this.sleepM = steps[i]; clearTimeout(this.sleepT); this.sleepEnd = false;
    if (this.sleepM > 0) { this.sleepT = setTimeout(() => { if (this.audio) this.audio.pause(); toast('Sleep timer: music paused', 'ok', 3000); this.sleepM = 0; }, this.sleepM * 60e3); toast(`Music stops in ${this.sleepM} minutes`, 'ok', 2200, 'msleep'); }
    else if (this.sleepM === -1) { this.sleepEnd = true; toast('Music stops after this song', 'ok', 2200, 'msleep'); }
    else toast('Sleep timer off', 'ok', 1800, 'msleep');
  },
  mini() {
    let m = $('#muMini');
    if (!this.cur) { if (m) m.hidden = true; document.body.classList.remove('mu-on'); return; }
    if (!m) {
      document.body.insertAdjacentHTML('beforeend', '<div id="muMini" class="mu-mini" role="region" aria-label="Music"></div>'); m = $('#muMini');
      let x0 = null;
      m.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
      m.addEventListener('pointerup', (e) => { if (x0 != null && Math.abs(e.clientX - x0) > 90) { m.classList.add('gone'); setTimeout(() => { m.classList.remove('gone'); this.stop(); }, 200); x0 = null; e.preventDefault(); return; } x0 = null; });
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-mm]'); if (!b) return; e.stopPropagation(); const k = b.dataset.mm; if (k === 'pp') this.toggle(); else if (k === 'next') this.next(); else if (k === 'x') this.stop(); else this.openNow(); });
    }
    const t = this.cur;
    m.hidden = false; document.body.classList.add('mu-on');
    m.innerHTML = `<button class="mu-mini-main" type="button" data-nav data-mm="open" aria-label="Open Now Playing"><span class="mu-mini-art">${t.art ? `<img src="${esc(this.big(t.art, 120))}" alt="">` : '<i data-lucide="music-2"></i>'}</span><span class="mu-mini-tt"><b>${esc(t.t)}</b><small>${esc(t.a || '')}</small></span></button><button class="ibtn" type="button" data-nav data-mm="pp" aria-label="Play or pause"><i data-lucide="${this.audio && !this.audio.paused ? 'pause' : 'play'}"></i></button>${t.kind === 'radio' ? '' : '<button class="ibtn hide-xs" type="button" data-nav data-mm="next" aria-label="Next"><i data-lucide="skip-forward"></i></button>'}<button class="ibtn" type="button" data-nav data-mm="x" aria-label="Stop music"><i data-lucide="x"></i></button><span class="mu-mini-bar"><span class="mu-fill"></span></span>`;
    icons();
  },
  paintState() {
    const p = this.audio && !this.audio.paused;
    $$('[data-mnpp] i, [data-mm="pp"] i, [data-mnpp] svg, [data-mm="pp"] svg').forEach((n) => { n.outerHTML = `<i data-lucide="${p ? 'pause' : 'play'}"></i>`; }); icons();
    document.body.classList.toggle('mu-playing', !!p);
    if (this.sleepEnd && this.audio && this.audio.ended) { this.sleepEnd = false; }
  },
  paintAll() {
    this.mini();
    if ($('#musicNow') && !$('#musicNow').hidden) this.paintNow();
    $$('.mu-li').forEach((b) => b.classList.remove('now'));
  },
  /* ---------------- set-up ---------------- */
  init() {
    if (!$('#view-music')) {
      const anchor = $('#view-tv') || $('.view:last-of-type');
      anchor.insertAdjacentHTML('afterend', '<section class="view" id="view-music" aria-label="Music"><div id="musicBody" class="mu-page"></div></section>');
    }
    const after = (sel) => $(sel);
    const tv = after('#tabs .tab[data-view="tv"]') || after('#tabs .tab[data-view="library"]');
    if (tv && !$('#tabs .tab[data-view="music"]')) {
      tv.insertAdjacentHTML('afterend', '<button class="tab" data-view="music" data-nav type="button" title="Music"><i data-lucide="audio-lines"></i><span class="lbl">Music</span></button>');
      $('#tabs .tab[data-view="music"]').addEventListener('click', () => go('music'));
    }
    const mtv = after('#mtabs [data-view="tv"]') || after('#mtabs [data-view="library"]');
    if (mtv && !$('#mtabs [data-view="music"]')) {
      mtv.insertAdjacentHTML('afterend', '<button type="button" data-view="music" data-nav><i data-lucide="audio-lines"></i><span>Music</span></button>');
      $('#mtabs [data-view="music"]').addEventListener('click', () => go('music'));
    }
    const g0 = go; go = function (view) { const r = g0.apply(this, arguments); if (view === 'music') Music.render(); return r; };
    // Back inside Music steps back from an artist or album page before it leaves the section
    const b0 = back; back = function () {
      const free = $('#player').hidden && !document.body.classList.contains('layer-open') && [...MENU_LAYERS].every((x) => !$(`#${x}`) || $(`#${x}`).hidden);
      if (S.view === 'music' && free && Music.page) { if (!Music.backOne()) Music.goTab(Music.tab); return; }
      return b0.apply(this, arguments);
    };
    // a film or show starting pauses the music (the two never play over each other)
    const pv = window.playStream; if (typeof pv === 'function') window.playStream = function () { if (Music.audio && !Music.audio.paused) Music.audio.pause(); return pv.apply(this, arguments); };
    document.addEventListener('play', (e) => { if (e.target !== Music.audio && e.target && e.target.tagName === 'VIDEO' && Music.audio && !Music.audio.paused) Music.audio.pause(); }, true);
    // keep the sleep-after-this-song promise
    this.el().addEventListener('ended', () => { if (this.sleepEnd) { this.sleepEnd = false; this.sleepM = 0; this.tok++; this.audio.pause(); } }, true);
    COMMANDS.push({ label: 'Music', icon: 'audio-lines', run: () => go('music') });
    COMMANDS.push({ label: 'Live radio', icon: 'radio', run: () => { go('music'); Music.goTab('radio'); } });
    COMMANDS.push({ label: 'Play music files from this device', icon: 'folder-open', run: () => Music.pickFiles() });
    icons();
    if (/^#music$/.test(location.hash)) setTimeout(() => go('music'), 0);
  },
};
function confirmSoft(msg) { try { return confirm(msg); } catch (e) { return true; } }
Music.init();

/* 2.83 Household gaps: rate what you watched, episodes left on Continue watching, playback info, what this device
   plays, Scores and tables for sports, and a playlist manager for Live TV. */
const Gap283 = {
  /* ---------------- episodes left (counted when progress is saved, from the show's own episode list) ---------------- */
  left(ctx) {
    try {
      const v = ctx && ctx.video, vids = ctx && ctx.meta && ctx.meta.videos; if (!v || !Array.isArray(vids) || v.season == null) return undefined;
      const s = Number(v.season), e = Number(v.episode), now = Date.now();
      return vids.filter((x) => Number(x.season) > 0 && (Number(x.season) > s || (Number(x.season) === s && Number(x.episode) > e)) && (!x.released || new Date(x.released).getTime() <= now)).length;
    } catch (err) { return undefined; }
  },
  leftText(p) { return p && p.type === 'series' && p.left > 0 ? ` · ${p.left === 1 ? '1 episode left' : `${p.left} episodes left`}` : ''; },
};

/* ---------------- Rate a film or show: half stars, sent to Trakt and Simkl ---------------- */
const Rate = {
  get(id) { return (Store.get('ratings', {}) || {})[id] || 0; },
  set(id, v) { const r = Store.get('ratings', {}) || {}; if (v) r[id] = v; else delete r[id]; Store.set('ratings', r); },
  imdb(m) { const id = String((m && (m.imdb_id || m.id)) || '').split(':')[0]; return /^tt\d+$/.test(id) ? id : ''; },
  stars(v) {
    // 10 steps: each star is two halves
    return `<div class="rt-stars" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map((n) => `<span class="rt-star${v >= n * 2 ? ' full' : v === n * 2 - 1 ? ' half' : ''}"><i data-lucide="star"></i><button type="button" data-nav data-rt="${n * 2 - 1}" aria-label="${n - .5} stars"></button><button type="button" data-nav data-rt="${n * 2}" aria-label="${n} stars"></button></span>`).join('')}</div>`;
  },
  open(m, { after = false } = {}) {
    if (!m) return; const id = this.imdb(m) || m.id;
    X8.layer('rateLayer', { label: 'Rate', icon: 'star', eyebrow: after ? 'How was it?' : 'Your rating' });
    const box = X8.body('rateLayer'), cur = this.get(id);
    const who = [Trakt.on() ? 'Trakt' : '', Simkl.on() ? 'Simkl' : ''].filter(Boolean);
    box.innerHTML = `<h2 class="rt-t">${esc(m.name || '')}</h2>${this.stars(cur)}<p class="rt-v" id="rtV">${cur ? `${cur / 2} of 5` : 'Tap a star. Tap the left half for a half star.'}</p>
      <p class="tour-note">${who.length ? `Your rating goes to ${who.join(' and ')} too.` : 'Connect Trakt or Simkl in Settings › Accounts and your ratings go there too.'}</p>
      <div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav data-rtx ${cur ? '' : 'hidden'}>Remove my rating</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-x8close>${after ? 'Not now' : 'Done'}</button></div>
      <div class="rt-res" id="rtRes"></div>`;
    icons();
    $$('[data-rt]', box).forEach((b) => b.addEventListener('click', () => this.send(m, id, Number(b.dataset.rt))));
    const x = $('[data-rtx]', box); if (x) x.onclick = () => this.send(m, id, 0);
    X8.open('rateLayer');
    if (IS_TV) setTimeout(() => { const b = $(`[data-rt="${cur || 8}"]`, box); if (b) Nav.focus(b, true); }, 250);
  },
  async send(m, id, v) {
    this.set(id, v);
    const box = X8.body('rateLayer'); if (!box) return;
    const st = $('.rt-stars', box); if (st) { st.outerHTML = this.stars(v); icons(); $$('[data-rt]', box).forEach((b) => b.addEventListener('click', () => this.send(m, id, Number(b.dataset.rt)))); }
    $('#rtV', box).textContent = v ? `${v / 2} of 5` : 'Rating removed';
    const x = $('[data-rtx]', box); if (x) x.hidden = !v;
    const imdb = this.imdb(m), res = [];
    if (imdb) {
      const kind = m.type === 'series' ? 'shows' : 'movies', at = new Date().toISOString();
      const body = { [kind]: [{ ids: { imdb }, ...(v ? { rating: v, rated_at: at } : {}) }] };
      if (Trakt.on()) res.push(Trakt.api(v ? '/sync/ratings' : '/sync/ratings/remove', { method: 'POST', body }).then(() => 'Trakt: saved').catch((e) => `Trakt: ${e.message || 'did not answer'}`));
      if (Simkl.on()) res.push(Simkl.api(v ? '/sync/ratings' : '/sync/ratings/remove', { method: 'POST', body }).then(() => 'Simkl: saved').catch((e) => `Simkl: ${e.message || 'did not answer'}`));
    }
    const out = await Promise.all(res); const r = $('#rtRes'); if (r) r.innerHTML = out.map((t) => `<span class="chip">${esc(t)}</span>`).join('');
    const btn = $('#dRate'); if (btn && D.meta && (this.imdb(D.meta) || D.meta.id) === id) btn.innerHTML = this.label(id);
    icons();
  },
  label(id) { const v = this.get(id); return v ? `<i data-lucide="star"></i>${v / 2}` : '<i data-lucide="star"></i>Rate'; },
  button() {
    const m = typeof D !== 'undefined' && D.meta; const list = $('#dList'); if (!m || !list || $('#dRate') || (m.type !== 'movie' && m.type !== 'series')) return;
    const id = this.imdb(m) || m.id;
    list.insertAdjacentHTML('afterend', `<button class="btn btn-ghost" type="button" id="dRate" data-nav title="Rate">${this.label(id)}</button>`);
    $('#dRate').onclick = () => this.open(D.meta);
    icons();
  },
  // optional: ask once a film is finished (Settings › Playback, off by default)
  asked: new Set(),
  finished(key) {
    try {
      if (!CFG.rateAsk || !P.ctx || P.ctx.video || P.ctx.meta.type !== 'movie') return;
      const m = P.ctx.meta, id = this.imdb(m) || m.id; if (this.get(id) || this.asked.has(id) || key !== m.id) return;
      this.asked.add(id);
      const wait = () => { if ($('#player').hidden) this.open(m, { after: true }); else setTimeout(wait, 1500); }; setTimeout(wait, 1500);
    } catch (e) { /* no film */ }
  },
};

/* ---------------- Playback info: what is actually playing and how healthy the buffer is ---------------- */
const PlayInfo = {
  on: false, t: 0,
  toggle(v) { this.on = v == null ? !this.on : !!v; clearInterval(this.t); const b = $('#pInfo'); if (b) b.remove(); if (!this.on) return; this.draw(); this.t = setInterval(() => this.draw(), 1000); },
  draw() {
    const pl = $('#player'); if (!pl || pl.hidden) { this.toggle(false); return; }
    let box = $('#pInfo'); if (!box) { pl.insertAdjacentHTML('beforeend', '<div id="pInfo" class="p-info" role="status" aria-live="off"></div>'); box = $('#pInfo'); }
    const v = video, q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
    let ahead = 0; try { for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + .2 && v.buffered.end(i) > v.currentTime) ahead = v.buffered.end(i) - v.currentTime; } catch (e) { /* none */ }
    let br = ''; try { if (P.hls && P.hls.levels && P.hls.levels[P.hls.currentLevel]) br = `${(P.hls.levels[P.hls.currentLevel].bitrate / 1e6).toFixed(1)} Mbps`; else if (P.hls && P.hls.bandwidthEstimate) br = `~${(P.hls.bandwidthEstimate / 1e6).toFixed(1)} Mbps line`; } catch (e) { /* none */ }
    const s = P.stream || {}, name = String(s.title || s.name || '').split('\n')[0].slice(0, 70);
    const mem = performance.memory ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : '';
    const rows = [['Picture', v.videoWidth ? `${v.videoWidth} × ${v.videoHeight}` : '—'], ['Buffer ahead', `${ahead.toFixed(1)} s`], ['Bitrate', br], ['Dropped frames', q ? `${q.droppedVideoFrames} of ${q.totalVideoFrames}` : ''], ['Speed', `${v.playbackRate}×`], ['Source', name], ['Engine', P.hls ? 'HLS (adaptive)' : P.remux ? 'MKV engine' : 'Direct'], ['App memory', mem]].filter((x) => x[1]);
    box.innerHTML = `<b>Playback info</b><dl>${rows.map(([k, x]) => `<dt>${k}</dt><dd>${esc(x)}</dd>`).join('')}</dl><small>Press I to hide</small>`;
  },
};

/* ---------------- What this device plays (picture, sound and screen) ---------------- */
const DevicePlays = {
  async check() {
    const mc = navigator.mediaCapabilities, v = document.createElement('video'), a = document.createElement('audio');
    const dec = async (codec, w = 3840, h = 2160, extra = {}) => {
      try { if (mc && mc.decodingInfo) { const r = await mc.decodingInfo({ type: 'media-source', video: { contentType: `video/mp4; codecs="${codec}"`, width: w, height: h, bitrate: 20e6, framerate: 24, ...extra } }); return r.supported ? (r.smooth ? 'yes' : 'slow') : 'no'; } } catch (e) { /* fall back */ }
      return v.canPlayType(`video/mp4; codecs="${codec}"`) ? 'yes' : 'no';
    };
    const snd = (t) => (a.canPlayType(t) || (window.MediaSource && MediaSource.isTypeSupported && MediaSource.isTypeSupported(t)) ? 'yes' : 'no');
    const hdrScreen = matchMedia('(dynamic-range: high)').matches || matchMedia('(video-dynamic-range: high)').matches;
    const [h264, hevc, av1, vp9, dv, hevc10] = await Promise.all([dec('avc1.640028', 1920, 1080), dec('hvc1.1.6.L153.B0'), dec('av01.0.12M.10'), dec('vp09.00.51.08'), dec('dvh1.05.06'), dec('hvc1.2.4.L153.B0', 3840, 2160, { transferFunction: 'pq', colorGamut: 'rec2020' })]);
    const W = Math.round(screen.width * (devicePixelRatio || 1)), H = Math.round(screen.height * (devicePixelRatio || 1));
    return {
      picture: [['H.264 (most films)', h264], ['HEVC / H.265', hevc], ['HDR10 (10-bit HEVC)', hevc10], ['Dolby Vision', dv], ['AV1', av1], ['VP9', vp9]],
      sound: [['AAC / stereo', snd('audio/mp4; codecs="mp4a.40.2"')], ['Dolby Digital (AC-3)', snd('audio/mp4; codecs="ac-3"')], ['Dolby Digital Plus / Atmos (E-AC-3)', snd('audio/mp4; codecs="ec-3"')], ['Opus', snd('audio/webm; codecs="opus"')], ['FLAC', snd('audio/flac')]],
      screen: [['Screen', `${W} × ${H}`], ['HDR screen', hdrScreen ? 'yes' : 'no'], ['Colour depth', `${screen.colorDepth}-bit`]],
    };
  },
  async open() {
    X8.layer('devPlays', { label: 'What this device plays', icon: 'monitor-check', eyebrow: 'This device', wide: true });
    const box = X8.body('devPlays'); box.innerHTML = '<h2 class="rt-t">What this device plays</h2><p class="tour-note">Checking…</p>'; X8.open('devPlays');
    const r = await this.check();
    const mark = (x) => (x === 'yes' ? '<span class="dp-y"><i data-lucide="check"></i>Plays</span>' : x === 'slow' ? '<span class="dp-s"><i data-lucide="triangle-alert"></i>Plays, not smoothly</span>' : x === 'no' ? '<span class="dp-n"><i data-lucide="x"></i>Not here</span>' : `<span>${esc(x)}</span>`);
    const sec = (t, l) => `<section class="dp-sec"><h3>${t}</h3><dl>${l.map(([k, x]) => `<dt>${esc(k)}</dt><dd>${mark(x)}</dd>`).join('')}</dl></section>`;
    box.innerHTML = `<h2 class="rt-t">What this device plays</h2>${sec('Picture', r.picture)}${sec('Sound', r.sound)}${sec('Screen', r.screen)}
      <p class="tour-note">Smart Play already prefers sources this device plays. When one says Not here, a different source or ${typeof PLATFORM !== 'undefined' && /android/i.test(PLATFORM) ? 'the MKCinema player engine in Settings › Playback' : 'the MKCinema app for this device'} usually plays it.</p>`;
    icons(); if (IS_TV) Nav.settle();
  },
};

/* ---------------- Scores and tables: more leagues, game pages, your teams, score alerts ---------------- */
const SportsPlus = {
  API: 'https://site.web.api.espn.com/apis/site/v2/sports/', STAND: 'https://site.web.api.espn.com/apis/v2/sports/',
  LEAGUES: [['football/nfl', 'NFL'], ['basketball/nba', 'NBA'], ['hockey/nhl', 'NHL'], ['baseball/mlb', 'MLB'], ['basketball/wnba', 'WNBA'], ['football/college-football', 'College football'], ['basketball/mens-college-basketball', 'College basketball'],
    ['soccer/eng.1', 'Premier League'], ['soccer/esp.1', 'LaLiga'], ['soccer/ita.1', 'Serie A'], ['soccer/ger.1', 'Bundesliga'], ['soccer/fra.1', 'Ligue 1'], ['soccer/uefa.champions', 'Champions League'], ['soccer/uefa.europa', 'Europa League'], ['soccer/usa.1', 'MLS'], ['soccer/mex.1', 'Liga MX'], ['soccer/eng.2', 'Championship'], ['soccer/ned.1', 'Eredivisie'], ['soccer/por.1', 'Primeira Liga'], ['soccer/sco.1', 'Scottish Premiership'],
    ['mma/ufc', 'UFC'], ['racing/f1', 'Formula 1']],
  st: { lg: 'football/nfl', tab: 'games', day: 0 }, games: [], at: 0, seen: {},
  follows() { return Store.get('sportsFollow', []) || []; },
  follow(t) { const l = this.follows(), on = l.some((x) => x.id === t.id); Store.set('sportsFollow', on ? l.filter((x) => x.id !== t.id) : [...l, t].slice(0, 40)); toast(on ? `${t.name} unfollowed` : `Following ${t.name}. You'll get score alerts while MKCinema is open.`, 'ok', 3200, 'spf'); if (!on && !IS_TV) { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch (e) { /* no notifications */ } } this.watch(); return !on; },
  isF(id) { return this.follows().some((x) => x.id === id); },
  hide() { return !!CFG.hideScores; },
  sc(x) { return this.hide() ? '•' : esc(x == null ? '' : x); },
  async j(u) { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000); try { const r = await fetch(u, { signal: ctl.signal, credentials: 'omit' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); } finally { clearTimeout(t); } },
  ymd(off) { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; },
  team(x) { const t = (x && (x.team || x.athlete)) || {}; return { id: `${t.id || ''}`, name: t.displayName || t.shortDisplayName || t.name || t.fullName || '', short: t.shortDisplayName || t.abbreviation || t.displayName || '', abbr: t.abbreviation || '', logo: t.logo || (t.logos && t.logos[0] && t.logos[0].href) || (t.flag && t.flag.href) || '', color: t.color || '2a2a30', score: x && x.score, win: !!(x && x.winner), rec: x && x.records && x.records[0] ? x.records[0].summary : '' }; },
  game(ev, lg) {
    const c = ev.competitions && ev.competitions[0]; if (!c) return null; const st = (ev.status && ev.status.type) || {};
    const cs = c.competitors || [], home = cs.find((x) => x.homeAway === 'home') || cs[0], away = cs.find((x) => x.homeAway === 'away') || cs[1];
    return { id: ev.id, lg, name: ev.shortName || ev.name, date: new Date(ev.date).getTime(), state: st.state || 'pre', detail: st.shortDetail || st.detail || '', home: this.team(home), away: this.team(away), nets: (c.broadcasts || []).flatMap((b) => b.names || []), venue: (c.venue && c.venue.fullName) || '' };
  },
  async scoreboard(lg, off) { const d = await this.j(`${this.API}${lg}/scoreboard?dates=${this.ymd(off)}`); return (d.events || []).map((e) => this.game(e, lg)).filter((g) => g && g.home && g.away); },
  async standings(lg) {
    const d = await this.j(`${this.STAND}${lg}/standings`), groups = (d.children && d.children.length ? d.children : [d]).filter((g) => g.standings);
    return groups.map((g) => ({ name: g.name, rows: (g.standings.entries || []).map((e) => { const s = {}; (e.stats || []).forEach((x) => { s[x.name] = x.displayValue; }); return { t: this.team({ team: e.team }), s }; }).sort((a, b) => (Number(a.s.rank || a.s.playoffSeed || 99) - Number(b.s.rank || b.s.playoffSeed || 99)) || (parseFloat(b.s.winPercent || b.s.points || 0) - parseFloat(a.s.winPercent || a.s.points || 0))) }));
  },
  /* ---------------- the page ---------------- */
  async open(lg) {
    // 2.96: the match centre (mk-296-sports) is the sports page now
    if (window.SportsLive) { SportsLive.open(lg); return; }
    if (lg) this.st.lg = lg;
    X8.layer('sportsPlus', { label: 'Scores and tables', full: true }); $('#sportsPlus').classList.add('spx');
    X8.open('sportsPlus'); this.render();
  },
  head() {
    const L = this.LEAGUES, f = this.follows();
    return `<div class="spx-top"><button class="ibtn" type="button" data-nav data-x8close aria-label="Close"><i data-lucide="arrow-left"></i></button><b class="spx-h">Scores and tables</b><span class="mu-sp"></span>
      <button class="chip${this.hide() ? ' on' : ''}" type="button" data-nav data-spxhide><i data-lucide="${this.hide() ? 'eye-off' : 'eye'}"></i>${this.hide() ? 'Scores hidden' : 'Hide scores'}</button></div>
      <div class="spx-lg">${f.length ? `<button class="chip${this.st.lg === 'mine' ? ' on' : ''}" type="button" data-nav data-spxlg="mine"><i data-lucide="star"></i>My teams</button>` : ''}${L.map(([id, n]) => `<button class="chip${this.st.lg === id ? ' on' : ''}" type="button" data-nav data-spxlg="${id}">${esc(n)}</button>`).join('')}</div>
      ${this.st.lg === 'mine' ? '' : `<div class="segc spx-tabs" role="tablist">${[['games', 'Games'], ['table', 'Table']].map(([id, l]) => `<button type="button" role="tab" data-nav data-spxtab="${id}" class="${this.st.tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>`}`;
  },
  async render() {
    const box = X8.body('sportsPlus'); if (!box) return; const tok = this.tok = (this.tok || 0) + 1;
    box.innerHTML = `<div class="spx-in">${this.head()}<div class="spx-body"><div class="status-line"><span class="spin"></span>Loading…</div></div></div>`; this.bind(box); icons();
    let html = '';
    try { html = this.st.lg === 'mine' ? await this.mine() : this.st.tab === 'table' ? await this.table() : await this.day(); }
    catch (e) { html = `<div class="empty">The scores feed did not answer (${esc(e.message)}). Try again in a minute.</div>`; }
    if (tok !== this.tok) return;
    $('.spx-body', box).innerHTML = html; this.bind($('.spx-body', box)); icons(); if (IS_TV) Nav.settle();
  },
  card(g, i) {
    const live = g.state === 'in', post = g.state === 'post', mine = this.isF(g.home.id) || this.isF(g.away.id);
    const side = (t) => `<span class="spx-tm${post && t.win ? ' win' : ''}">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : `<i class="spx-nl">${esc(t.abbr || t.short.slice(0, 3))}</i>`}<b>${esc(t.short || t.name)}</b>${this.isF(t.id) ? '<i data-lucide="star" class="spx-fs"></i>' : ''}<em>${live || post ? this.sc(t.score) : esc(t.rec)}</em></span>`;
    const when = live ? `<span class="spx-live"><i class="lh-dot"></i>${esc(this.hide() ? 'Live' : g.detail)}</span>` : post ? `<span>${this.hide() ? 'Final' : esc(g.detail)}</span>` : `<span>${new Date(g.date).toLocaleTimeString(appLocale(), { hour: 'numeric', minute: '2-digit' })}</span>`;
    return `<button class="spx-g${mine ? ' mine' : ''}" type="button" data-nav data-spxg="${i}" style="--c1:#${esc(g.away.color)};--c2:#${esc(g.home.color)}">${side(g.away)}${side(g.home)}<span class="spx-meta">${when}${g.nets.length ? `<small>${esc(g.nets.slice(0, 2).join(', '))}</small>` : ''}</span></button>`;
  },
  async day() {
    const off = this.st.day, list = await this.scoreboard(this.st.lg, off); this.games = list;
    list.sort((a, b) => ((this.isF(b.home.id) || this.isF(b.away.id)) - (this.isF(a.home.id) || this.isF(a.away.id))) || ((a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1)) || a.date - b.date);
    const days = [-1, 0, 1, 2, 3].map((d) => { const x = new Date(); x.setDate(x.getDate() + d); return [d, d === 0 ? 'Today' : d === -1 ? 'Yesterday' : d === 1 ? 'Tomorrow' : x.toLocaleDateString(appLocale(), { weekday: 'short' })]; });
    return `<div class="spx-days">${days.map(([d, l]) => `<button class="chip${d === off ? ' on' : ''}" type="button" data-nav data-spxday="${d}">${esc(l)}</button>`).join('')}</div>${list.length ? `<div class="spx-grid">${list.map((g, i) => this.card(g, i)).join('')}</div>` : '<p class="tour-note">No games that day.</p>'}`;
  },
  async mine() {
    const f = this.follows(), lgs = [...new Set(f.map((x) => x.lg))], out = [];
    await Promise.all(lgs.map(async (lg) => { for (const off of [0, 1]) { try { (await this.scoreboard(lg, off)).forEach((g) => { if ((this.isF(g.home.id) || this.isF(g.away.id)) && !out.some((x) => x.id === g.id)) out.push(g); }); } catch (e) { /* that league stays out */ } } }));
    out.sort((a, b) => ((a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1)) || a.date - b.date); this.games = out;
    return `<div class="spx-follow">${f.map((t) => `<span class="chip">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : ''}${esc(t.name)}<button type="button" data-nav data-spxunf="${esc(t.id)}" aria-label="Unfollow ${esc(t.name)}"><i data-lucide="x"></i></button></span>`).join('')}</div>
      ${out.length ? `<h3 class="spx-sub">Live now and coming up</h3><div class="spx-grid">${out.map((g, i) => this.card(g, i)).join('')}</div>` : '<p class="tour-note">None of your teams play today or tomorrow.</p>'}`;
  },
  async table() {
    const groups = await this.standings(this.st.lg), soccer = /^soccer\//.test(this.st.lg);
    const cols = soccer ? [['gamesPlayed', 'P'], ['wins', 'W'], ['ties', 'D'], ['losses', 'L'], ['pointDifferential', 'GD'], ['points', 'Pts']] : [['wins', 'W'], ['losses', 'L'], ...(/hockey/.test(this.st.lg) ? [['otLosses', 'OTL'], ['points', 'Pts']] : [['winPercent', 'PCT'], ['gamesBehind', 'GB']]), ['streak', 'Strk']];
    if (!groups.length || !groups.some((g) => g.rows.length)) return '<p class="tour-note">No table for this one.</p>';
    return groups.map((g) => `<section class="spx-tab"><h3 class="spx-sub">${esc(g.name)}</h3><table><thead><tr><th>#</th><th class="l">Team</th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>${g.rows.map((r, i) => `<tr class="${this.isF(r.t.id) ? 'mine' : ''}"><td>${i + 1}</td><td class="l"><span class="spx-tn">${r.t.logo ? `<img src="${esc(r.t.logo)}" alt="" loading="lazy">` : ''}${esc(r.t.name)}</span></td>${cols.map(([k]) => `<td>${esc(r.s[k] == null ? '' : r.s[k])}</td>`).join('')}<td><button class="ibtn spx-star${this.isF(r.t.id) ? ' on' : ''}" type="button" data-nav data-spxf="${esc(JSON.stringify({ id: r.t.id, name: r.t.name, logo: r.t.logo, lg: this.st.lg }))}" aria-label="Follow ${esc(r.t.name)}"><i data-lucide="star"></i></button></td></tr>`).join('')}</tbody></table></section>`).join('');
  },
  async gamePage(g) {
    const box = X8.body('sportsPlus'); if (!box) return;
    const body = $('.spx-body', box); body.innerHTML = '<div class="status-line"><span class="spin"></span>Loading the game…</div>';
    let d = {}; try { d = await this.j(`${this.API}${g.lg}/summary?event=${g.id}`); } catch (e) { /* header only */ }
    const live = g.state === 'in', post = g.state === 'post';
    const fb = (t) => `<button class="chip spx-fb${this.isF(t.id) ? ' on' : ''}" type="button" data-nav data-spxf="${esc(JSON.stringify({ id: t.id, name: t.name, logo: t.logo, lg: g.lg }))}"><i data-lucide="star"></i>${this.isF(t.id) ? 'Following' : 'Follow'}</button>`;
    const side = (t) => `<div class="spx-bt">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : ''}<b>${esc(t.name)}</b><small>${esc(t.rec)}</small>${fb(t)}</div>`;
    const plays = (d.scoringPlays || (d.keyEvents || []).filter((k) => k.scoringPlay) || []).slice(-12).reverse();
    const stats = ((d.boxscore && d.boxscore.teams) || []).map((t) => { const m = {}; (t.statistics || []).forEach((s) => { m[s.label || s.name] = s.displayValue; }); return { id: `${(t.team || {}).id}`, m }; });
    const statRows = stats.length === 2 ? Object.keys(stats[0].m).filter((k) => stats[1].m[k] != null && /^[\d.]+%?$/.test(String(stats[0].m[k])) && /^[\d.]+%?$/.test(String(stats[1].m[k]))).slice(0, 10) : [];
    const awayIdx = stats.findIndex((s) => s.id === g.away.id), A = stats[awayIdx < 0 ? 0 : awayIdx], Hm = stats[awayIdx < 0 ? 1 : 1 - awayIdx];
    const lineups = (d.rosters || []).filter((r) => r.roster && r.roster.length);
    const ch = typeof MKLiveHub !== 'undefined' && MKLiveHub.channelFor ? MKLiveHub.channelFor(g) : null;
    body.innerHTML = `<button class="mu-back" type="button" data-nav data-spxback><i data-lucide="arrow-left"></i><span>${esc((this.LEAGUES.find((x) => x[0] === g.lg) || [0, ''])[1])}</span></button>
      <section class="spx-board" style="--c1:#${esc(g.away.color)};--c2:#${esc(g.home.color)}">${side(g.away)}<div class="spx-mid">${live || post ? `<b class="spx-score">${this.sc(g.away.score)} <span>–</span> ${this.sc(g.home.score)}</b>` : `<b class="spx-score sm">${new Date(g.date).toLocaleString(appLocale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</b>`}<span class="${live ? 'spx-live' : ''}">${live ? '<i class="lh-dot"></i>' : ''}${esc(this.hide() && (live || post) ? (live ? 'Live' : 'Final') : g.detail)}</span>${g.venue ? `<small>${esc(g.venue)}</small>` : ''}
      ${ch ? `<button class="btn btn-bolt btn-sm" type="button" data-nav data-spxwatch><i data-lucide="play"></i>Watch on ${esc(ch.net)}</button>` : g.nets.length ? `<small>On ${esc(g.nets.join(', '))}</small>` : ''}</div>${side(g.home)}</section>
      ${this.hide() && (live || post) ? '<p class="tour-note">Scores are hidden. Turn off Hide scores at the top to see what happened.</p>' : `
      ${plays.length ? `<section class="spx-sec"><h3 class="spx-sub">Scoring</h3><ol class="spx-plays">${plays.map((p) => `<li><span>${esc((p.clock && p.clock.displayValue) || '')}${p.period && p.period.number ? ` · ${p.period.number}` : ''}</span><b>${esc(p.text || (p.type && p.type.text) || '')}</b>${p.awayScore != null ? `<em>${esc(p.awayScore)}–${esc(p.homeScore)}</em>` : ''}</li>`).join('')}</ol></section>` : ''}
      ${statRows.length ? `<section class="spx-sec"><h3 class="spx-sub">Team stats</h3>${statRows.map((k) => { const a = parseFloat(A.m[k]) || 0, h = parseFloat(Hm.m[k]) || 0, sum = a + h || 1; return `<div class="spx-stat"><span>${esc(A.m[k])}</span><div><small>${esc(k)}</small><i class="spx-bars"><b style="transform:scaleX(${a / sum})"></b><b class="h" style="transform:scaleX(${h / sum})"></b></i></div><span>${esc(Hm.m[k])}</span></div>`; }).join('')}</section>` : ''}
      ${lineups.length ? `<section class="spx-sec"><h3 class="spx-sub">Line-ups</h3><div class="spx-lu">${lineups.map((r) => `<div><b>${esc(((r.team || {}).displayName) || '')}${r.formation ? ` · ${esc(r.formation)}` : ''}</b><ol>${r.roster.filter((p) => p.starter).map((p) => `<li><span>${esc(p.jersey || '')}</span>${esc((p.athlete || {}).displayName || '')}<small>${esc(((p.position || {}).abbreviation) || '')}</small></li>`).join('')}</ol></div>`).join('')}</div></section>` : ''}`}`;
    this.bind(body); icons(); if (IS_TV) Nav.settle();
    const w = $('[data-spxwatch]', body); if (w) w.onclick = () => { X8.close('sportsPlus'); try { Channels.tune(ch.ch); } catch (e) { /* no channel */ } };
  },
  bind(box) {
    const on = (sel, fn) => $$(sel, box).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); fn(b); }));
    on('[data-spxlg]', (b) => { this.st.lg = b.dataset.spxlg; this.st.day = 0; this.render(); });
    on('[data-spxtab]', (b) => { this.st.tab = b.dataset.spxtab; this.render(); });
    on('[data-spxday]', (b) => { this.st.day = Number(b.dataset.spxday); this.render(); });
    on('[data-spxhide]', () => { setCfg('hideScores', !CFG.hideScores); document.body.classList.toggle('no-scores', !!CFG.hideScores); this.render(); });
    on('[data-spxg]', (b) => { const g = this.games[Number(b.dataset.spxg)]; if (g) this.gamePage(g); });
    on('[data-spxback]', () => this.render());
    on('[data-spxf]', (b) => { try { const t = JSON.parse(b.dataset.spxf); const now = this.follow(t); b.classList.toggle('on', now); if (b.classList.contains('spx-fb')) b.innerHTML = `<i data-lucide="star"></i>${now ? 'Following' : 'Follow'}`; icons(); } catch (e) { /* bad data */ } });
    on('[data-spxunf]', (b) => { Store.set('sportsFollow', this.follows().filter((x) => x.id !== b.dataset.spxunf)); if (!this.follows().length) this.st.lg = 'football/nfl'; this.render(); });
  },
  /* score alerts for followed teams while the app is open: every minute while one of their games is on */
  async watch() {
    clearTimeout(this.wt); const f = this.follows(); if (!f.length || this.kids()) return;
    let next = 15 * 60e3;
    try {
      const lgs = [...new Set(f.map((x) => x.lg))];
      for (const lg of lgs) {
        const list = await this.scoreboard(lg, 0).catch(() => []);
        list.filter((g) => this.isF(g.home.id) || this.isF(g.away.id)).forEach((g) => {
          const key = g.id, was = this.seen[key], now = `${g.state}|${g.away.score}|${g.home.score}`;
          if (g.state === 'in') next = 60e3; else if (g.state === 'pre' && g.date - Date.now() < 20 * 60e3) next = Math.min(next, 2 * 60e3);
          if (was && was !== now && !this.hide()) {
            const fin = g.state === 'post';
            this.alert(fin ? 'Full time' : 'Score', `${g.away.short} ${g.away.score} – ${g.home.score} ${g.home.short}${fin ? '' : ` · ${g.detail}`}`);
          }
          this.seen[key] = now;
        });
      }
    } catch (e) { /* try again later */ }
    this.wt = setTimeout(() => this.watch(), next);
  },
  alert(title, body) {
    toast(`${title}: ${body}`, 'ok', 8000, 'spxa');
    try { if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: '/icon-192.png', tag: 'mkc-score' }); } catch (e) { /* no notifications */ }
  },
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  init() {
    document.body.classList.toggle('no-scores', !!CFG.hideScores);
    // a way in from the Live hub, next to Channels and Sports in your sources
    try {
      if (window.MKLiveHub && MKLiveHub.switcher) {
        const s0 = MKLiveHub.switcher.bind(MKLiveHub);
        MKLiveHub.switcher = (v) => s0(v).replace(/<\/div>\s*$/, '<button type="button" data-nav data-spxopen><i data-lucide="trophy"></i>Scores and tables</button></div>');
      }
    } catch (e) { /* hub not there */ }
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-spxopen]'); if (b) { e.preventDefault(); if (this.kids()) { toast('Not on the kids seat', 'err', 2400); return; } this.open(); } });
    COMMANDS.push({ label: 'Scores and tables', icon: 'trophy', run: () => this.open() });
    setTimeout(() => this.watch(), 25000);
  },
};

/* ---------------- Live TV: your playlists in one place ---------------- */
const ListsMgr = {
  off() { return Store.get('chSeatOff', []) || []; },
  open() {
    X8.layer('listsMgr', { label: 'Your playlists', icon: 'list-video', eyebrow: 'Live TV', wide: true });
    this.paint(); X8.open('listsMgr');
  },
  paint() {
    const box = X8.body('listsMgr'); if (!box) return;
    const all = Channels.get().lists || [], off = new Set(this.off());
    const count = (l) => { try { const d = Channels.data.get(l.id); return d ? d.channels.length : null; } catch (e) { return null; } };
    box.innerHTML = `<h2 class="rt-t">Your playlists</h2><p class="tour-note">Refresh them all at once, and choose which ones show on this seat.</p>
      <div class="seat-rows">${all.map((l) => { const n = count(l); return `<div class="seat-row"><span class="seat-av srv-av"><i data-lucide="${l.kind === 'xtream' ? 'key-round' : 'list-video'}"></i></span><div><b>${esc(l.name || 'Playlist')}</b><small>${l.kind === 'xtream' ? 'Xtream login' : 'M3U playlist'}${n != null ? ` · ${n} channels` : ''}${l.epg || l.kind === 'xtream' ? ' · guide' : ''}</small></div><div class="inrow"><button class="chip${off.has(l.id) ? '' : ' on'}" type="button" data-nav data-lmseat="${esc(l.id)}">${off.has(l.id) ? 'Hidden on this seat' : 'Shows on this seat'}</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-lmedit="${esc(l.id)}">Edit</button></div></div>`; }).join('') || '<p class="tour-note">No playlists yet.</p>'}</div>
      <div class="inrow"><button class="btn btn-primary btn-sm" type="button" data-nav data-lmall ${all.length ? '' : 'disabled'}><i data-lucide="refresh-cw"></i>Update all</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-lmadd><i data-lucide="plus"></i>Add a playlist</button></div><p class="tour-note" id="lmMsg"></p>`;
    icons();
    $$('[data-lmseat]', box).forEach((b) => b.onclick = () => { const s = new Set(this.off()); s.has(b.dataset.lmseat) ? s.delete(b.dataset.lmseat) : s.add(b.dataset.lmseat); Store.set('chSeatOff', [...s]); this.paint(); this.refresh(); });
    $$('[data-lmedit]', box).forEach((b) => b.onclick = () => { const l = (Channels.get().lists || []).find((x) => x.id === b.dataset.lmedit); X8.close('listsMgr'); go('tv'); setTimeout(() => Channels.openAdd(l), 200); });
    const add = $('[data-lmadd]', box); if (add) add.onclick = () => { X8.close('listsMgr'); go('tv'); setTimeout(() => Channels.openAdd(), 200); };
    const up = $('[data-lmall]', box); if (up) up.onclick = async () => {
      up.disabled = true; const msg = $('#lmMsg'); const L = Channels.get().lists || []; let ok = 0;
      for (const [i, l] of L.entries()) { if (msg) msg.textContent = `Updating ${i + 1} of ${L.length}: ${l.name || 'Playlist'}…`; try { await Channels.load(l, true); ok++; } catch (e) { /* counted below */ } }
      this.paint(); const m2 = $('#lmMsg'); if (m2) m2.textContent = `${ok} of ${L.length} updated${ok < L.length ? '. The others did not answer.' : '.'}`; this.refresh();
    };
  },
  refresh() { try { if (S.view === 'tv' && typeof renderTV === 'function') renderTV(); } catch (e) { /* guide redraws next time */ } },
  init() {
    // playlists hidden on this seat stay out of the guide, search and sports here; they stay saved for the other seats
    const l0 = Channels.lists.bind(Channels);
    Channels.lists = () => { const off = new Set(this.off()); return off.size ? l0().filter((l) => !off.has(l.id)) : l0(); };
    COMMANDS.push({ label: 'Your playlists (Live TV)', icon: 'list-video', run: () => this.open() });
    // a chip next to Add playlist in the guide
    const c0 = Channels.chips.bind(Channels);
    Channels.chips = function () { const r = c0(...arguments); const add = $('#chAddChip'); if (add && !$('#chMgrChip') && (Channels.get().lists || []).length) { add.insertAdjacentHTML('afterend', '<button class="chip" type="button" data-nav id="chMgrChip"><i data-lucide="list-video"></i>Your playlists</button>'); $('#chMgrChip').onclick = () => ListsMgr.open(); icons(); } return r; };
  },
};

/* ---------------- wiring ---------------- */
(() => {
  // the Rate button on every film and show page
  const rd0 = renderDetail; renderDetail = function () { const r = rd0.apply(this, arguments); try { Rate.button(); } catch (e) { /* page without actions */ } return r; };
  const mw0 = markWatched; markWatched = function (id) { const r = mw0.apply(this, arguments); Rate.finished(id); return r; };
  // the episodes-left count on Continue watching
  const ps0 = progressSub; progressSub = function (p) { return ps0.apply(this, arguments) + Gap283.leftText(p); };
  // I in the player shows or hides Playback info
  document.addEventListener('keydown', (e) => { if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.metaKey && !$('#player').hidden && !/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) { e.preventDefault(); PlayInfo.toggle(); } }, true);
  COMMANDS.push({ label: 'Playback info', icon: 'activity', run: () => PlayInfo.toggle() });
  COMMANDS.push({ label: 'What this device plays', icon: 'monitor-check', run: () => DevicePlays.open() });
  // Settings rows
  try {
    const pb = secById('playback'); if (pb) { const r0 = pb.rows; pb.rows = () => [...r0(), { key: 'rateAsk', label: 'Ask me to rate a film when it ends', help: 'Half stars, saved on this seat and sent to Trakt and Simkl when they are connected. Rate anything any time with Rate on its page.', type: 'toggle' }, { key: 'playInfoBtn', label: 'Playback info', help: 'Picture size, buffer, bitrate and dropped frames over the film. Press I in the player, or turn it on here for the next film.', type: 'button', text: 'Show while playing', icon: 'activity', run: () => { closeLayer('settings'); toast('Playback info shows when the next film starts. Press I to hide it.', 'ok', 3600); PlayInfo.pending = true; } }]; }
    const hp = secById('help'); if (hp) { const r1 = hp.rows; hp.rows = () => [...r1(), { key: 'devPlays', label: 'What this device plays', help: 'HDR, Dolby Vision, HEVC, AV1, Dolby Atmos and more, checked on this device.', type: 'button', text: 'Check this device', icon: 'monitor-check', run: () => { closeLayer('settings'); setTimeout(() => DevicePlays.open(), 300); } }]; }
  } catch (e) { console.warn('2.83 settings rows', e); }
  video.addEventListener('playing', () => { if (PlayInfo.pending) { PlayInfo.pending = false; PlayInfo.toggle(true); } });
  SportsPlus.init(); ListsMgr.init();
})();
