
/* ---------------- 2.17.0 Anime list sync: AniList and MyAnimeList ----------------
   Finish an anime episode or film (past 80 %, the same point Trakt and Simkl count it) and your AniList entry moves
   to that episode: Watching while you are in the middle, Completed at the last episode. It never lowers your progress.
   Works for anime addons (Kitsu and MAL ids) and for Cinemeta-style IMDb ids (mapped through ARM, the same way AniSkip
   finds skip times). "Import my list" adds your AniList Watching and Planning entries to your MKCinema watchlist.
   Sign-in uses your own free AniList API client (like Trakt); the token stays on this device. */
const AnimeIds = {
  async kitsuMal(k) {
    const map = Store.get('kitsuMal', {}); if (map[k]) return map[k];
    const r = await netFetch(`https://kitsu.io/api/edge/anime/${k}/mappings`, { headers: { Accept: 'application/vnd.api+json' } }, 10000);
    if (!r.ok) throw new Error(`Kitsu ${r.status}`); const j = await r.json(); const hit = (j.data || []).find((x) => x.attributes && x.attributes.externalSite === 'myanimelist/anime');
    if (!hit) return null;
    map[k] = hit.attributes.externalId; Store.set('kitsuMal', map); return map[k];
  },
  anime(ctx) {
    const id = String((ctx.video && ctx.video.id) || ctx.meta.id || '');
    return /^(kitsu|mal|anilist):/.test(id) || /^(kitsu|mal|anilist):/.test(String(ctx.meta.id || '')) || AniSkip.animeish(ctx.meta);
  },
  /* { mal, ep } for what is playing, or null when it is not an anime we can place */
  async of(ctx) {
    const vid = String((ctx.video && ctx.video.id) || ''), mid = String(ctx.meta.id || '');
    let m = vid.match(/^mal:(\d+):(\d+)$/); if (m) return { mal: Number(m[1]), ep: Number(m[2]) };
    m = vid.match(/^kitsu:(\d+):(\d+)$/); if (m) { const mal = await this.kitsuMal(m[1]); return mal ? { mal: Number(mal), ep: Number(m[2]) } : null; }
    if (!ctx.video) {
      m = mid.match(/^mal:(\d+)$/); if (m) return { mal: Number(m[1]), ep: 1 };
      m = mid.match(/^kitsu:(\d+)$/); if (m) { const mal = await this.kitsuMal(m[1]); return mal ? { mal: Number(mal), ep: 1 } : null; }
    }
    const imdb = imdbOf(ctx.meta); if (!imdb || !AniSkip.animeish(ctx.meta)) return null;
    if (ctx.video) {
      const season = Number(ctx.video.season), ep = Number(ctx.video.episode); if (!season || !ep) return null;
      const hit = await AniSkip.find(imdb, season, ep); return hit ? { mal: Number(hit.mal), ep: Number(hit.ep) } : null;
    }
    const films = (await AniSkip.arm(imdb)).filter((e) => e.media === 'MOVIE');
    return films.length === 1 ? { mal: Number(films[0].mal), ep: 1 } : null;
  },
};
const AniList = {
  base: 'https://graphql.anilist.co',
  cfg() { return Store.get('anilist', {}); }, save(v) { Store.set('anilist', { ...this.cfg(), ...v }); },
  on() { return !!this.cfg().token; },
  authUrl() { return `https://anilist.co/api/v2/oauth/authorize?client_id=${encodeURIComponent(this.cfg().clientId || '')}&response_type=token`; },
  async q(query, variables) {
    const c = this.cfg();
    const r = await fetch(this.base, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}) }, body: JSON.stringify({ query, variables }) });
    const j = await r.json().catch(() => ({}));
    const err = (j.errors || [])[0];
    if (c.token && (r.status === 401 || (err && (err.status === 401 || /invalid token|unauthori[sz]ed/i.test(err.message || ''))))) { this.save({ token: '', user: '' }); throw new Error('AniList signed you out. Connect again.'); }
    if (!r.ok || err) throw new Error(`AniList: ${(err && err.message) || r.status}`);
    return j.data;
  },
  // accepts the bare token or the whole address AniList lands on (…#access_token=…)
  async setToken(raw) {
    const m = String(raw || '').match(/access_token=([^&\s]+)/); const t = (m ? m[1] : String(raw || '')).trim();
    if (!/^[\w.-]{40,}$/.test(t)) throw new Error('That does not look like an AniList token');
    this.save({ token: t });
    try { const d = await this.q('query{Viewer{id name}}'); this.save({ user: d.Viewer.name, uid: d.Viewer.id }); return d.Viewer.name; }
    catch (e) { this.save({ token: '', user: '' }); throw e; }
  },
  /* move the entry to this episode; never lowers progress */
  async progress(mal, ep) {
    const d = await this.q('query($m:Int){Media(idMal:$m,type:ANIME){id episodes mediaListEntry{progress status}}}', { m: mal });
    const media = d && d.Media; if (!media) return false;
    const e = media.mediaListEntry, have = (e && e.progress) || 0;
    if (media.episodes) ep = Math.min(ep, media.episodes); // a site that counts past the end never asks for more episodes than the show has
    if (e && have >= ep && e.status !== 'PLANNING') return false;
    const last = media.episodes && ep >= media.episodes;
    const status = last ? 'COMPLETED' : (e && e.status === 'REPEATING') ? 'REPEATING' : 'CURRENT';
    await this.q('mutation($id:Int,$p:Int,$s:MediaListStatus){SaveMediaListEntry(mediaId:$id,progress:$p,status:$s){id}}', { id: media.id, p: Math.max(have, ep), s: status });
    return true;
  },
  /* Watching + Planning → MKCinema watchlist (IMDb id where one exists, so Cinemeta and every addon know it; else Kitsu) */
  async importList() {
    const c = this.cfg(); if (!c.uid) await this.setToken(c.token);
    const d = await this.q('query($u:Int){MediaListCollection(userId:$u,type:ANIME,status_in:[CURRENT,PLANNING,REPEATING]){lists{entries{media{id idMal format title{english romaji} startDate{year} coverImage{large}}}}}}', { u: this.cfg().uid });
    const media = []; const seen = new Set();
    ((d.MediaListCollection || {}).lists || []).forEach((l) => (l.entries || []).forEach((x) => { if (x.media && !seen.has(x.media.id)) { seen.add(x.media.id); media.push(x.media); } }));
    const ids = Store.get('anilistArm', {}), items = [];
    const look = async (m) => {
      let v = ids[m.id];
      if (!v) { try { const r = await fetch(`https://arm.haglund.dev/api/v2/ids?source=anilist&id=${m.id}`); v = r.ok ? (await r.json()) || {} : {}; } catch (e) { v = {}; } ids[m.id] = { imdb: v.imdb || '', kitsu: v.kitsu || '' }; v = ids[m.id]; }
      const id = v.imdb || (v.kitsu ? `kitsu:${v.kitsu}` : ''); if (!id) return;
      items.push({ id, type: m.format === 'MOVIE' ? 'movie' : 'series', name: (m.title && (m.title.english || m.title.romaji)) || '', releaseInfo: String((m.startDate && m.startDate.year) || ''), poster: id.startsWith('tt') ? undefined : (m.coverImage && m.coverImage.large) || undefined });
    };
    for (let i = 0; i < Math.min(media.length, 300); i += 4) await Promise.all(media.slice(i, i + 4).map(look));
    Store.set('anilistArm', ids);
    return Watch.merge(items);
  },
};
/* MyAnimeList: its API sends no CORS headers, so every call goes through MKCinema's own relay on Supabase
   (functions/v1/mal-relay: only api.myanimelist.net/v2 and the token endpoint, only from MKCinema's own sites, nothing
   stored). Each user brings their own MAL API client ID (App Type "other", redirect URL: the site they use, see Mal.REDIRECT).
   Sign-in is OAuth with PKCE: MAL sends you back to MKCinema with a code; if that lands in another browser or on your
   phone (TV sign-in), paste the address you landed on into the box instead. Tokens last 31 days and refresh themselves. */
const Mal = {
  /* MyAnimeList sends you back to the site you started on (app.mkcinema.app or mkcinema.pages.dev), so
     sign-in finishes by itself there. Elsewhere (desktop apps, TVs, localhost) it stays mkcinema.pages.dev and you paste
     the address. A client set up with a different redirect URL can name it in Settings. */
  HOSTS: /^(app\.mkcinema\.app|mkcinema\.pages\.dev)$/,
  get REDIRECT() {
    const own = location.protocol === 'https:' && this.HOSTS.test(location.hostname), set = String(this.cfg().redirect || '').trim();
    return /^https?:\/\/\S+$/i.test(set) ? set : 'https://mkcinema.pages.dev/';
  },
  cfg() { return Store.get('mal', {}); }, save(v) { Store.set('mal', { ...this.cfg(), ...v }); },
  on() { return !!this.cfg().token; },
  relay(u) { const sb = (Account.config() || {}).url; if (!sb) throw new Error('The MyAnimeList relay is not available'); return `${String(sb).replace(/\/+$/, '')}/functions/v1/mal-relay?url=${encodeURIComponent(u)}`; },
  async raw(u, { method = 'GET', form, auth = true } = {}) {
    const c = this.cfg(), headers = { Accept: 'application/json', 'x-mal-client': c.clientId || '' };
    if (auth && c.token) headers['x-mal-auth'] = `Bearer ${c.token}`;
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const url = this.relay(u);
    // a v2 relay checks the project's publishable key; an older one is not sent it
    try { const st = await Vault.probe(url.slice(0, url.indexOf('?'))); const k = (Account.config() || {}).anonKey; if (st.key && k) headers.apikey = k; } catch (e) { /* send without it */ }
    return netFetch(url, { method, headers, body: form ? new URLSearchParams(form).toString() : undefined }, 20000);
  },
  async api(path, opts = {}) {
    if (this.cfg().expires && Date.now() > this.cfg().expires - 86400e3) await this.refresh().catch(() => {});
    let r = await this.raw(`https://api.myanimelist.net/v2${path}`, opts);
    if (r.status === 401 && this.cfg().refresh) { await this.refresh(); r = await this.raw(`https://api.myanimelist.net/v2${path}`, opts); }
    if (r.status === 401) { this.save({ token: '', refresh: '', user: '' }); throw new Error('MyAnimeList signed you out. Connect again.'); }
    if (!r.ok) throw new Error(`MyAnimeList ${r.status}`);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  },
  async token(form) {
    const r = await this.raw('https://myanimelist.net/v1/oauth2/token', { method: 'POST', auth: false, form: { client_id: this.cfg().clientId, ...form } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`MyAnimeList refused the sign-in (${j.message || j.error || r.status})`);
    this.save({ token: j.access_token, refresh: j.refresh_token || this.cfg().refresh, expires: Date.now() + (j.expires_in || 2678400) * 1000 });
  },
  refresh() { return this.token({ grant_type: 'refresh_token', refresh_token: this.cfg().refresh }); },
  authUrl() {
    const b = new Uint8Array(48); crypto.getRandomValues(b);
    const verifier = Array.from(b, (x) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[x % 66]).join('') + Date.now().toString(36);
    const state = `mkc${Math.random().toString(36).slice(2, 10)}`;
    Store.set('malAuth', { verifier, state, at: Date.now(), redirect: this.REDIRECT });
    return `https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(this.cfg().clientId)}&code_challenge=${verifier}&code_challenge_method=plain&state=${state}&redirect_uri=${encodeURIComponent(this.REDIRECT)}`;
  },
  // finishes sign-in from the address MAL sent you to (…?code=…&state=…), here or pasted
  async finish(href) {
    let q; try { q = new URL(String(href || '').trim()).searchParams; } catch (e) { q = new URLSearchParams(String(href || '').replace(/^.*\?/, '')); }
    const code = q.get('code'), state = q.get('state'), a = Store.get('malAuth', null);
    if (!code) throw new Error('That address has no MyAnimeList code in it');
    if (!a || a.state !== state || Date.now() - a.at > 30 * 60e3) throw new Error('That sign-in was started somewhere else or expired. Press Connect MyAnimeList again.');
    await this.token({ grant_type: 'authorization_code', code, redirect_uri: a.redirect || this.REDIRECT, code_verifier: a.verifier });
    Store.set('malAuth', null);
    try { const me = await this.api('/users/@me'); this.save({ user: me.name }); } catch (e) { /* name is cosmetic */ }
    return this.cfg().user || 'MyAnimeList';
  },
  async boot() {
    const q = new URLSearchParams(location.search); if (!q.get('code') || !/^mkc/.test(q.get('state') || '')) return;
    const href = location.href; history.replaceState(null, '', location.pathname + location.hash);
    const a = Store.get('malAuth', null);
    if (!a || a.state !== q.get('state')) { toast('Approved on MyAnimeList. If you started on another screen, paste this page’s address into its MyAnimeList box.', 'info', 9000); try { await navigator.clipboard.writeText(href); } catch (e) { /* optional */ } return; }
    try { const n = await this.finish(href); toast(`Connected to MyAnimeList as ${n}`, 'ok'); } catch (e) { toast(e.message, 'err', 5000); }
  },
  /* moves the entry to this episode; never lowers progress */
  async progress(mal, ep) {
    const a = await this.api(`/anime/${mal}?fields=num_episodes,my_list_status`); if (!a) return false;
    const st = a.my_list_status || {}, have = st.num_episodes_watched || 0, total = a.num_episodes || 0;
    if (total) ep = Math.min(ep, total); // MAL refuses more watched episodes than the show has
    if (have >= ep && st.status && st.status !== 'plan_to_watch') return false;
    const n = Math.max(have, ep);
    const form = { num_watched_episodes: String(n), status: total && n >= total ? 'completed' : 'watching' };
    if (st.is_rewatching) { delete form.status; form.is_rewatching = 'true'; }
    await this.api(`/anime/${mal}/my_list_status`, { method: 'PATCH', form });
    return true;
  },
  async importList() {
    const items = [], ids = Store.get('malArm', {});
    for (const status of ['watching', 'plan_to_watch']) {
      const j = await this.api(`/users/@me/animelist?status=${status}&limit=500&fields=media_type,start_season`);
      for (const x of (j && j.data) || []) items.push(x.node && { mal: x.node.id, name: x.node.title, movie: x.node.media_type === 'movie', year: x.node.start_season && x.node.start_season.year, poster: x.node.main_picture && (x.node.main_picture.large || x.node.main_picture.medium) });
    }
    const out = [], list = items.filter(Boolean).slice(0, 300);
    const look = async (m) => {
      let v = ids[m.mal];
      if (!v) { try { const r = await fetch(`https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=${m.mal}`); v = r.ok ? (await r.json()) || {} : {}; } catch (e) { v = {}; } ids[m.mal] = { imdb: v.imdb || '', kitsu: v.kitsu || '' }; v = ids[m.mal]; }
      const id = v.imdb || (v.kitsu ? `kitsu:${v.kitsu}` : ''); if (!id) return;
      out.push({ id, type: m.movie ? 'movie' : 'series', name: m.name || '', releaseInfo: String(m.year || ''), poster: id.startsWith('tt') ? undefined : m.poster || undefined });
    };
    for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map(look));
    Store.set('malArm', ids);
    return Watch.merge(out);
  },
};
const AnimeSync = {
  async watched(ctx) {
    if ((!AniList.on() && !Mal.on()) || !ctx || !ctx.meta || !AnimeIds.anime(ctx)) return;
    let hit; try { hit = await AnimeIds.of(ctx); } catch (e) { hit = null; } if (!hit) return;
    if (AniList.on()) try { if (await AniList.progress(hit.mal, hit.ep)) toast('Updated on AniList', 'ok', 2000); } catch (e) { toast(e.message, 'err', 3500); }
    if (Mal.on()) try { if (await Mal.progress(hit.mal, hit.ep)) toast('Updated on MyAnimeList', 'ok', 2000); } catch (e) { toast(e.message, 'err', 3500); }
  },
  init() {
    // same moment Trakt and Simkl count it: past 80 %
    const chk = Scrobble.check.bind(Scrobble);
    Scrobble.check = function () { const was = this.done, ctx = this.ctx; chk(); if (!was && this.done && ctx) AnimeSync.watched(ctx); };
    const sec = SECTIONS.find((x) => x.id === 'sync'); if (!sec) return;
    sec.label = 'Trakt, Simkl, AniList & MAL';
    const rows = sec.rows, bind = sec.bind;
    sec.rows = () => [...rows(),
      { group: 'AniList' },
      { key: 'anilistId', label: 'Client ID', help: 'Create a client at anilist.co/settings/developer with the redirect URL https://anilist.co/api/v2/oauth/pin. Its ID is all MKCinema needs.', type: 'secret', get: () => AniList.cfg().clientId || '', set: (v) => AniList.save({ clientId: String(v || '').trim() }) },
      { html: () => {
        const c = AniList.cfg();
        if (AniList.on()) return `<div class="set-row"><div><b>Connected</b><small id="ani-st">${c.user ? `<span translate="no">${esc(c.user)}</span> · ` : ''}<span>Finished anime episodes update your AniList progress.</span></small></div><div class="set-ctl"><button class="btn btn-ghost btn-sm" type="button" id="ani-in"><i data-lucide="download"></i>Import my list</button><button class="btn btn-ghost btn-sm danger" type="button" id="ani-x">Disconnect</button></div></div>`;
        return `<div class="set-row ani-row"><div><b>Not connected</b><small id="ani-st">Save the client ID, then connect. AniList shows a token: paste it here.</small><div class="ani-tok" id="ani-tokBox" hidden><input class="inp" id="ani-tok" type="password" autocomplete="off" spellcheck="false" placeholder="Paste the AniList token"><button class="btn btn-prime btn-sm" type="button" id="ani-save">Save token</button></div><div class="qr-wrap sm ani-qr" id="ani-qr" hidden></div></div><div class="set-ctl"><button class="btn btn-prime btn-sm" type="button" id="ani-go"><i data-lucide="link"></i>Connect AniList</button></div></div>`;
      } },
      { group: 'MyAnimeList' },
      { key: 'malId', label: 'Client ID', help: `Create an API client at myanimelist.net/apiconfig: App Type "other", App Redirect URL ${esc(Mal.REDIRECT)}. Its ID is all MKCinema needs.`, type: 'secret', get: () => Mal.cfg().clientId || '', set: (v) => Mal.save({ clientId: String(v || '').trim() }) },
      { key: 'malRedirect', label: 'Redirect URL', help: 'Only if your MyAnimeList client lists a different App Redirect URL. Leave it empty to use https://mkcinema.pages.dev/.', type: 'text', get: () => Mal.cfg().redirect || '', set: (v) => { const u = String(v || '').trim(); Mal.save({ redirect: /^https?:\/\/\S+$/i.test(u) ? u : '' }); } },
      { html: () => {
        const c = Mal.cfg();
        if (Mal.on()) return `<div class="set-row"><div><b>Connected</b><small id="mal-st">${c.user ? `<span translate="no">${esc(c.user)}</span> · ` : ''}<span>Finished anime episodes update your MyAnimeList progress.</span></small></div><div class="set-ctl"><button class="btn btn-ghost btn-sm" type="button" id="mal-in"><i data-lucide="download"></i>Import my list</button><button class="btn btn-ghost btn-sm danger" type="button" id="mal-x">Disconnect</button></div></div>`;
        return `<div class="set-row ani-row"><div><b>Not connected</b><small id="mal-st">Save the client ID, then connect. MyAnimeList sends you back here when you approve.</small><div class="ani-tok" id="mal-tokBox" hidden><input class="inp" id="mal-tok" type="url" autocomplete="off" spellcheck="false" placeholder="Paste the address MyAnimeList sent you to"><button class="btn btn-prime btn-sm" type="button" id="mal-save">Finish</button></div><div class="qr-wrap sm ani-qr" id="mal-qr" hidden></div></div><div class="set-ctl"><button class="btn btn-prime btn-sm" type="button" id="mal-go"><i data-lucide="link"></i>Connect MyAnimeList</button></div></div>`;
      } },
    ];
    sec.bind = (...a) => {
      if (bind) bind(...a);
      const run = (id, fn) => { const b = $(id); if (b) b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { toast(e.message, 'err'); } b.disabled = false; }; };
      run('#ani-go', async () => {
        if (!AniList.cfg().clientId) throw new Error('Paste your AniList client ID first');
        const url = AniList.authUrl(), box = $('#ani-tokBox'), st = $('#ani-st');
        box.hidden = false;
        if (IS_TV) { const q = $('#ani-qr'); q.innerHTML = QR.svg(url); q.hidden = false; st.textContent = 'Scan this with your phone and approve. Then paste the token AniList shows into the box with the phone remote’s keyboard (Settings › Devices).'; }
        else { window.open(url, '_blank', 'noopener'); st.textContent = 'Approve MKCinema on AniList, copy the token it shows, and paste it below.'; }
        const inp = $('#ani-tok'); if (inp) inp.focus();
      });
      run('#ani-save', async () => { const name = await AniList.setToken(($('#ani-tok') || {}).value); toast(`Connected to AniList as ${name}`, 'ok'); renderSettingsBody(); });
      const tok = $('#ani-tok'); if (tok) tok.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#ani-save').click(); } });
      run('#ani-in', async () => toast(`Added ${await AniList.importList()} titles from AniList`, 'ok'));
      run('#ani-x', async () => { Store.set('anilist', { clientId: AniList.cfg().clientId }); renderSettingsBody(); });
      run('#mal-go', async () => {
        if (!Mal.cfg().clientId) throw new Error('Paste your MyAnimeList client ID first');
        const url = Mal.authUrl(), st = $('#mal-st'); $('#mal-tokBox').hidden = false;
        if (IS_TV) { const q = $('#mal-qr'); q.innerHTML = QR.svg(url); q.hidden = false; st.textContent = 'Scan this with your phone and approve. Then paste the address your phone lands on into the box with the phone remote’s keyboard.'; }
        // MAL sends people back to Mal.REDIRECT. When that is this site, it happens in this tab; anywhere else (a desktop
        // app, localhost) it opens in a new window and the address it lands on is pasted here.
        else if (location.origin === new URL(Mal.REDIRECT).origin) location.href = url;
        else { window.open(url, '_blank', 'noopener'); st.textContent = 'Paste the address MyAnimeList sent you to'; const i = $('#mal-tok'); if (i) i.focus(); }
      });
      run('#mal-save', async () => { const n = await Mal.finish(($('#mal-tok') || {}).value); toast(`Connected to MyAnimeList as ${n}`, 'ok'); renderSettingsBody(); });
      const mt = $('#mal-tok'); if (mt) mt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#mal-save').click(); } });
      run('#mal-in', async () => toast(`Added ${await Mal.importList()} titles from MyAnimeList`, 'ok'));
      run('#mal-x', async () => { Store.set('mal', { clientId: Mal.cfg().clientId }); renderSettingsBody(); });
    };
  },
};
AnimeSync.init();
Mal.boot();
