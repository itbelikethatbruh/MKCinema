/* ---------------- 2.8.9 Your media servers: Plex, Jellyfin and Emby as sources ----------------
   Films and episodes you already own on your own Plex, Jellyfin or Emby server show up as sources next to your addons,
   matched by their IMDb id, and Smart Play picks them first. Sign-ins stay on this device: Plex uses its link code
   (plex.tv/link), Jellyfin and Emby a username and password that are sent only to your server, which returns a token;
   the password is never stored. Servers on a plain http:// address can only be reached through the MKCinema companion
   server, because browsers block http requests from an https page. */
const srvNorm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const Servers = {
  list() { return Store.raw.get('mservers', []) || []; },
  save(l) { Store.raw.set('mservers', l); engine.clearCache && engine.clearCache(); },
  dev() { let d = Store.raw.get('mserverDev', ''); if (!d) { d = `mkc-${Math.random().toString(36).slice(2, 12)}`; Store.raw.set('mserverDev', d); } return d; },
  // a plain http server from an https page has to go through the user's own companion server
  reach(url) {
    if (/^http:/i.test(url) && location.protocol === 'https:') { if (!S.proxy) return null; return proxify(url); }
    return url;
  },
  async json(url, opts = {}, ms = 6000) {
    const u = this.reach(url); if (!u) throw new Error('http-blocked');
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(u, { ...opts, signal: ctl.signal, headers: { Accept: 'application/json', ...(opts.headers || {}) } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
    finally { clearTimeout(t); }
  },
  /* ---- Jellyfin and Emby ---- */
  jfAuth(token) { return `MediaBrowser Client="MKCinema", Device="${IS_TV ? 'TV' : 'Web'}", DeviceId="${this.dev()}", Version="${APP_VERSION}"${token ? `, Token="${token}"` : ''}`; },
  async jfConnect(url, user, pw) {
    url = String(url || '').trim().replace(/\/+$/, ''); if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (!this.reach(url)) throw new Error('http-blocked');
    let info = {}; try { info = await this.json(`${url}/System/Info/Public`); } catch (e) { if (e.message === 'http-blocked') throw e; throw new Error('No Jellyfin or Emby server answered at that address'); }
    const auth = this.jfAuth();
    const r = await this.json(`${url}/Users/AuthenticateByName`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth, 'X-Emby-Authorization': auth }, body: JSON.stringify({ Username: user, Pw: pw }) }, 10000)
      .catch((e) => { throw new Error(/401|403/.test(e.message) ? 'That username or password is not right' : 'The server did not accept the sign-in'); });
    const kind = /emby/i.test(info.ProductName || '') ? 'emby' : 'jellyfin';
    const s = { id: `${kind}:${info.Id || url}`, kind, name: info.ServerName || (kind === 'emby' ? 'Emby' : 'Jellyfin'), url, token: r.AccessToken, user: (r.User || {}).Id };
    this.save([...this.list().filter((x) => x.id !== s.id), s]);
    return s;
  },
  jfQ(s, extra) { return `api_key=${encodeURIComponent(s.token)}&ApiKey=${encodeURIComponent(s.token)}${extra ? `&${extra}` : ''}`; },
  async jfFind(s, meta, type, imdb) {
    const q = `searchTerm=${encodeURIComponent(meta.name)}&IncludeItemTypes=${type === 'movie' ? 'Movie' : 'Series'}&Recursive=true&Fields=ProviderIds,MediaSources,ProductionYear&Limit=25${s.user ? `&userId=${s.user}` : ''}`;
    const r = await this.json(`${s.url}/Items?${this.jfQ(s, q)}`);
    const items = r.Items || [];
    return items.find((x) => String((x.ProviderIds || {}).Imdb || (x.ProviderIds || {}).IMDB || '').toLowerCase() === imdb)
      || items.find((x) => srvNorm(x.Name) === srvNorm(meta.name) && Math.abs((x.ProductionYear || 0) - Number(yearOf(meta) || 0)) <= 1) || null;
  },
  async jfStreams(s, meta, type, imdb, se) {
    let item = await this.jfFind(s, meta, type, imdb); if (!item) return [];
    if (type === 'series') {
      const r = await this.json(`${s.url}/Shows/${item.Id}/Episodes?${this.jfQ(s, `season=${se[0]}&Fields=MediaSources${s.user ? `&userId=${s.user}` : ''}`)}`);
      item = (r.Items || []).find((e) => Number(e.IndexNumber) === se[1] && Number(e.ParentIndexNumber) === se[0]); if (!item) return [];
    }
    let src = (item.MediaSources || [])[0];
    if (!src) { const full = await this.json(`${s.url}/Items?${this.jfQ(s, `ids=${item.Id}&Fields=MediaSources${s.user ? `&userId=${s.user}` : ''}`)}`); src = ((full.Items || [])[0] || {}).MediaSources ? full.Items[0].MediaSources[0] : null; }
    if (!src) return [];
    const v = (src.MediaStreams || []).find((m) => m.Type === 'Video') || {}, a = (src.MediaStreams || []).find((m) => m.Type === 'Audio') || {};
    const file = String(src.Path || src.Name || '').split(/[\\/]/).pop();
    const desc = [v.Height ? `${v.Height >= 2000 ? '2160p' : `${v.Height}p`}` : '', v.Codec ? String(v.Codec).toUpperCase() : '', v.VideoRangeType && v.VideoRangeType !== 'SDR' ? v.VideoRangeType : '', a.Codec ? String(a.Codec).toUpperCase() : '', a.Channels ? `${a.Channels === 6 ? '5.1' : a.Channels === 8 ? '7.1' : `${a.Channels}ch`}` : '', src.Size ? fmtBytes(src.Size) : ''].filter(Boolean).join(' ');
    const label = s.kind === 'emby' ? 'Emby' : 'Jellyfin';
    const base = `${s.url}/Videos/${item.Id}/stream`;
    return [
      { name: `${label}\n${s.name}`, title: `${file}\n${desc}`, url: this.reach(`${base}.${src.Container || 'mkv'}?${this.jfQ(s, `static=true&mediaSourceId=${src.Id}&deviceId=${this.dev()}`)}`), behaviorHints: { filename: file, videoSize: src.Size }, _srv: label },
      { name: `${label}\n${s.name}`, title: `Converted for this device\n${desc.replace(/\b(HEVC|H265|AV1|DTS|TRUEHD|EAC3|AC3|HDR10\+?|HDR|DOVI|DV)\b/gi, '').replace(/\s+/g, ' ').trim()} H.264 AAC`, url: this.reach(`${base}.mp4?${this.jfQ(s, `container=mp4&videoCodec=h264&audioCodec=aac&maxAudioChannels=2&mediaSourceId=${src.Id}&deviceId=${this.dev()}&playSessionId=${Date.now().toString(36)}`)}`), _srv: label, _conv: true },
    ].filter((x) => x.url);
  },
  /* ---- Plex ---- */
  plexQ(extra) { return `X-Plex-Product=MKCinema&X-Plex-Version=${APP_VERSION}&X-Plex-Client-Identifier=${this.dev()}&X-Plex-Platform=${IS_TV ? 'Android' : 'Web'}&X-Plex-Device-Name=${encodeURIComponent(IS_TV ? 'MKCinema TV' : 'MKCinema')}${extra ? `&${extra}` : ''}`; },
  async plexPin() { return this.json(`https://plex.tv/api/v2/pins?${this.plexQ('strong=false')}`, { method: 'POST' }); },
  async plexPoll(pin, onTick) {
    const until = Date.now() + 10 * 60e3;
    while (Date.now() < until && !this.plexStop) {
      await new Promise((r) => setTimeout(r, 2500)); if (this.plexStop) break;
      try { const r = await this.json(`https://plex.tv/api/v2/pins/${pin.id}?${this.plexQ()}`); if (r.authToken) return r.authToken; } catch (e) { /* keep waiting */ }
      onTick && onTick();
    }
    return null;
  },
  async plexServers(token) {
    const list = await this.json(`https://plex.tv/api/v2/resources?${this.plexQ(`includeHttps=1&includeRelay=1&X-Plex-Token=${encodeURIComponent(token)}`)}`, {}, 10000);
    const out = [];
    for (const r of (list || []).filter((x) => /server/.test(x.provides || ''))) {
      const conns = (r.connections || []).filter((c) => /^https:/.test(c.uri)).sort((a, b) => (b.local - a.local) || (a.relay - b.relay));
      let uri = null;
      for (const c of conns) { try { await this.json(`${c.uri}/identity?X-Plex-Token=${encodeURIComponent(r.accessToken || token)}`, {}, 3500); uri = c.uri; break; } catch (e) { /* next */ } }
      if (!uri && conns.length) uri = conns[0].uri;
      if (uri) out.push({ id: `plex:${r.clientIdentifier}`, kind: 'plex', name: r.name || 'Plex', url: uri, token: r.accessToken || token, conns: conns.map((c) => c.uri) });
    }
    if (out.length) this.save([...this.list().filter((x) => !out.some((o) => o.id === x.id)), ...out]);
    return out;
  },
  async plexGet(s, path, ms) {
    const tryOne = (u) => this.json(`${u}${path}${path.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(s.token)}`, {}, ms);
    try { return await tryOne(s.url); } catch (e) {
      for (const u of (s.conns || []).filter((x) => x !== s.url)) { try { const r = await tryOne(u); s.url = u; this.save(this.list().map((x) => (x.id === s.id ? { ...x, url: u } : x))); return r; } catch (e2) { /* next */ } }
      throw e;
    }
  },
  async plexStreams(s, meta, type, imdb, se) {
    const secs = ((await this.plexGet(s, '/library/sections')).MediaContainer || {}).Directory || [];
    const want = type === 'movie' ? 'movie' : 'show';
    let item = null;
    for (const d of secs.filter((x) => x.type === want)) {
      const r = ((await this.plexGet(s, `/library/sections/${d.key}/all?title=${encodeURIComponent(meta.name)}&includeGuids=1`)).MediaContainer || {}).Metadata || [];
      item = r.find((x) => (x.Guid || []).some((g) => String(g.id).toLowerCase() === `imdb://${imdb}`)) || r.find((x) => srvNorm(x.title) === srvNorm(meta.name) && Math.abs((x.year || 0) - Number(yearOf(meta) || 0)) <= 1);
      if (item) break;
    }
    if (!item) return [];
    if (type === 'series') {
      const eps = ((await this.plexGet(s, `/library/metadata/${item.ratingKey}/allLeaves`)).MediaContainer || {}).Metadata || [];
      item = eps.find((e) => Number(e.parentIndex) === se[0] && Number(e.index) === se[1]); if (!item) return [];
    }
    const m = (item.Media || [])[0], p = m && (m.Part || [])[0]; if (!p) return [];
    const file = String(p.file || '').split(/[\\/]/).pop();
    const desc = [m.videoResolution ? (/^\d+$/.test(m.videoResolution) ? `${m.videoResolution}p` : m.videoResolution === '4k' ? '2160p' : m.videoResolution) : '', m.videoCodec ? String(m.videoCodec).toUpperCase() : '', m.audioCodec ? String(m.audioCodec).toUpperCase() : '', m.audioChannels ? (m.audioChannels === 6 ? '5.1' : m.audioChannels === 8 ? '7.1' : `${m.audioChannels}ch`) : '', p.size ? fmtBytes(p.size) : ''].filter(Boolean).join(' ');
    const tk = `X-Plex-Token=${encodeURIComponent(s.token)}`;
    return [
      { name: `Plex\n${s.name}`, title: `${file}\n${desc}`, url: `${s.url}${p.key}?${tk}`, behaviorHints: { filename: file, videoSize: p.size }, _srv: 'Plex' },
      { name: `Plex\n${s.name}`, title: `Converted for this device\n${desc.replace(/\b(HEVC|H265|AV1|DTS|TRUEHD|EAC3|AC3|HDR10\+?|HDR|DOVI|DV)\b/gi, '').replace(/\s+/g, ' ').trim()} H.264 AAC HLS`, url: `${s.url}/video/:/transcode/universal/start.m3u8?path=${encodeURIComponent(`/library/metadata/${item.ratingKey}`)}&mediaIndex=0&partIndex=0&protocol=hls&fastSeek=1&directPlay=0&directStream=1&videoQuality=100&maxVideoBitrate=20000&session=${this.dev()}-${Date.now().toString(36)}&${this.plexQ(tk)}`, _srv: 'Plex', _conv: true },
    ];
  },
  /* ---- the source hook ---- */
  async streams(type, id) {
    const list = this.list(); if (!list.length || (type !== 'movie' && type !== 'series')) return [];
    const parts = String(id).split(':'), imdb = parts[0].toLowerCase(); if (!/^tt\d+$/.test(imdb)) return [];
    const se = type === 'series' ? [Number(parts[1]), Number(parts[2])] : null; if (se && !(se[0] >= 0 && se[1] > 0)) return [];
    let meta = S.metas.get(parts[0]); if (!meta || !meta.name) { try { meta = remember({ id: parts[0], type, ...((await engine.fetchMeta(type, parts[0])) || {}) }); } catch (e) { return []; } }
    if (!meta || !meta.name) return [];
    const res = await Promise.allSettled(list.map((s) => (s.kind === 'plex' ? this.plexStreams(s, meta, type, imdb, se) : this.jfStreams(s, meta, type, imdb, se))));
    return res.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value).map((s) => {
      const t = Telemetry.parse(s);
      t.webReady = true; t.cached = true; t.source = `Your ${s._srv}`; t.headline = `Your ${s._srv}`;
      // your own copy goes first: the original file when the browser can play it, the converted one otherwise
      t.score += 2600 + (s._conv ? (t.mkv || t.codec === 'HEVC' ? 40 : -40) : 0);
      return { ...s, _addon: `Your ${s._srv}`, _addonId: `mkc.servers.${s._srv.toLowerCase()}`, _tel: t };
    });
  },
  init() {
    const fs = engine.fetchStreams.bind(engine);
    engine.fetchStreams = async function (type, id, onPartial) {
      const mine = Servers.streams(type, id).catch(() => []);
      let own = [];
      const wrap = onPartial ? (all, info) => onPartial([...own, ...all], info) : undefined;
      mine.then((l) => { own = l; if (l.length && onPartial) onPartial(l.slice(), { addon: { manifest: { name: 'Your media servers', id: 'mkc.servers' } }, ok: true, count: l.length }); });
      const r = await fs(type, id, wrap);
      own = await mine;
      const streams = [...own, ...r.streams].sort((x, y) => y._tel.score - x._tel.score);
      return { ...r, streams };
    };
    SECTIONS.splice(SECTIONS.findIndex((s) => s.id === 'debrid') + 1, 0, this.section());
    const g = SET_GROUPS.find(([n]) => n === 'Watching'); if (g) g[1].push('servers');
    SET_BLURB.servers = 'Plex, Jellyfin and Emby';
  },
  /* ---- Settings › Media servers ---- */
  section() {
    return { id: 'servers', icon: 'server', label: 'Media servers', intro: 'Play what you already own. Films and episodes on your own Plex, Jellyfin or Emby server show up as sources next to your addons, and Smart Play picks them first. Sign-ins stay on this device.', bind: () => this.bind(), rows: () => [
      { html: () => { const l = this.list(); return l.length ? `<div class="seat-rows">${l.map((s) => `<div class="seat-row"><span class="seat-av srv-av"><i data-lucide="server"></i></span><div><b>${esc(s.name)}</b><small>${s.kind === 'plex' ? 'Plex' : s.kind === 'emby' ? 'Emby' : 'Jellyfin'} · ${esc(String(s.url).replace(/^https?:\/\//, '').replace(/\?.*$/, '').slice(0, 48))}</small></div><div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav data-srvdel="${esc(s.id)}">Remove</button></div></div>`).join('')}</div>` : '<p class="tour-note">No servers yet. Connect one below.</p>'; } },
      { html: () => `<div class="srv-box"><b>Plex</b><small>Sign in with a code on plex.tv/link. Works on TVs too, no typing a password.</small><div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav id="srvPlex"><i data-lucide="link"></i>Connect Plex</button></div><div id="srvPlexCode" hidden></div></div>` },
      { html: () => `<div class="srv-box"><b>Jellyfin or Emby</b><small>Your server's address, username and password. The password is sent only to your server and is not saved.</small>
          <div class="x8-form"><input class="inp" id="srvUrl" placeholder="https://jellyfin.example.com" autocomplete="off" inputmode="url"><input class="inp" id="srvUser" placeholder="Username" autocomplete="username"><input class="inp" id="srvPw" type="password" placeholder="Password" autocomplete="current-password"></div>
          <div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav id="srvJf"><i data-lucide="log-in"></i>Connect</button></div></div>` },
      { html: () => '<p class="tour-note">A server on a plain http:// address can only be reached through the MKCinema companion server (Settings › Streams & addons › MKCinema proxy URL), because browsers block it from an https page. Plex servers use secure addresses by themselves.</p>' },
    ] };
  },
  bind() {
    const b = $('#setBody'); if (!b) return;
    ['#srvUrl', '#srvUser', '#srvPw'].forEach((sel) => { const el = $(sel, b); if (el) el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('#srvJf').click(); }); });
    $$('[data-srvdel]', b).forEach((x) => x.addEventListener('click', () => { this.save(this.list().filter((s) => s.id !== x.dataset.srvdel)); renderSettingsBody(); toast('Server removed'); }));
    const jf = $('#srvJf', b);
    if (jf) jf.onclick = async () => {
      const url = $('#srvUrl').value.trim(), user = $('#srvUser').value.trim(), pw = $('#srvPw').value;
      if (!url || !user) { toast('Add the server address and your username', 'err'); return; }
      jf.disabled = true;
      try { const s = await this.jfConnect(url, user, pw); toast(`${s.name} connected`, 'ok'); renderSettingsBody(); }
      catch (e) { toast(e.message === 'http-blocked' ? 'That is an http:// address. Use https://, or set up the MKCinema companion server first' : e.message, 'err', 6000); }
      finally { jf.disabled = false; }
    };
    const px = $('#srvPlex', b);
    if (px) px.onclick = async () => {
      const box = $('#srvPlexCode'); px.disabled = true; this.plexStop = false;
      try {
        const pin = await this.plexPin();
        box.hidden = false; box.innerHTML = `<div class="srv-code"><small>On your phone or computer, go to</small><b>plex.tv/link</b><small>and enter</small><span class="srv-pin tnum">${esc(pin.code)}</span><small class="srv-wait">Waiting for Plex…</small></div>`;
        const token = await this.plexPoll(pin);
        if (!token) { box.hidden = true; if (!this.plexStop) toast('The Plex code ran out. Try again', 'err'); return; }
        $('.srv-wait', box) && ($('.srv-wait', box).textContent = 'Finding your servers…');
        const found = await this.plexServers(token);
        toast(found.length ? `${found.map((s) => s.name).join(', ')} connected` : 'Signed in, but no Plex server was found on this account', found.length ? 'ok' : 'err', 5000);
        renderSettingsBody();
      } catch (e) { box.hidden = true; toast('Plex could not be reached. Try again in a moment', 'err'); }
      finally { px.disabled = false; }
    };
  },
};
Servers.init();
