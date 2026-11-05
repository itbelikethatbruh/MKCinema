/* ---------------- 2.17.0 Anime list sync: AniList ----------------
   Finish an anime episode or film (past 80 %, the same point Trakt and Simkl count it) and your AniList entry moves
   to that episode: Watching while you are in the middle, Completed at the last episode. It never lowers your progress.
   Works for anime addons (Kitsu and MAL ids) and for Cinemeta-style IMDb ids (mapped through ARM, the same way AniSkip
   finds skip times). "Import my list" adds your AniList Watching and Planning entries to your MKCinema watchlist.
   Sign-in uses your own free AniList API client (like Trakt); the token stays on this device. */
const AnimeIds = {
  async kitsuMal(k) {
    const map = Store.get('kitsuMal', {}); if (map[k]) return map[k];
    const r = await fetch(`https://kitsu.io/api/edge/anime/${k}/mappings`, { headers: { Accept: 'application/vnd.api+json' } });
    const j = await r.json(); const hit = (j.data || []).find((x) => x.attributes && x.attributes.externalSite === 'myanimelist/anime');
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
const AnimeSync = {
  async watched(ctx) {
    if (!AniList.on() || !ctx || !ctx.meta || !AnimeIds.anime(ctx)) return;
    try {
      const hit = await AnimeIds.of(ctx); if (!hit) return;
      if (await AniList.progress(hit.mal, hit.ep)) toast('Updated on AniList', 'ok', 2000);
    } catch (e) { toast(e.message, 'err', 3500); }
  },
  init() {
    // same moment Trakt and Simkl count it: past 80 %
    const chk = Scrobble.check.bind(Scrobble);
    Scrobble.check = function () { const was = this.done, ctx = this.ctx; chk(); if (!was && this.done && ctx) AnimeSync.watched(ctx); };
    const sec = SECTIONS.find((x) => x.id === 'sync'); if (!sec) return;
    sec.label = 'Trakt, Simkl & AniList';
    const rows = sec.rows, bind = sec.bind;
    sec.rows = () => [...rows(),
      { group: 'AniList' },
      { key: 'anilistId', label: 'Client ID', help: 'Create a client at anilist.co/settings/developer with the redirect URL https://anilist.co/api/v2/oauth/pin. Its ID is all MKCinema needs.', type: 'secret', get: () => AniList.cfg().clientId || '', set: (v) => AniList.save({ clientId: String(v || '').trim() }) },
      { html: () => {
        const c = AniList.cfg();
        if (AniList.on()) return `<div class="set-row"><div><b>Connected</b><small id="ani-st">${c.user ? `<span translate="no">${esc(c.user)}</span> · ` : ''}<span>Finished anime episodes update your AniList progress.</span></small></div><div class="set-ctl"><button class="btn btn-ghost btn-sm" type="button" id="ani-in"><i data-lucide="download"></i>Import my list</button><button class="btn btn-ghost btn-sm danger" type="button" id="ani-x">Disconnect</button></div></div>`;
        return `<div class="set-row ani-row"><div><b>Not connected</b><small id="ani-st">Save the client ID, then connect. AniList shows a token: paste it here.</small><div class="ani-tok" id="ani-tokBox" hidden><input class="inp" id="ani-tok" type="password" autocomplete="off" spellcheck="false" placeholder="Paste the AniList token"><button class="btn btn-prime btn-sm" type="button" id="ani-save">Save token</button></div><div class="qr-wrap sm ani-qr" id="ani-qr" hidden></div></div><div class="set-ctl"><button class="btn btn-prime btn-sm" type="button" id="ani-go"><i data-lucide="link"></i>Connect AniList</button></div></div>`;
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
    };
  },
};
AnimeSync.init();
