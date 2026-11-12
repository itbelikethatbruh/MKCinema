
'use strict';
/* =====================================================================
   MKCinema · services
   Debrid Vault, rating posters and critic scores, Trakt and Simkl sync, the Airing Calendar,
   the effects governor, the installable app (PWA), Home layout, and supporting the creator.
   Every key here is the user's own. With Sync keys on, keys travel in the user's account sealed with their password (SyncCrypt); none is shipped.
   ===================================================================== */
const Keys = { get: () => Store.get('keys', {}), set(k, v) { const all = this.get(); if (v) all[k] = v; else delete all[k]; Store.set('keys', all); } };
/* a fetch that gives up after a while, and the service's own error message instead of a bare status */
const netFetch = async (url, opts = {}, ms = 15000) => {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); }
  catch (e) { if (e && e.name === 'AbortError') throw new Error('Timed out'); throw e; }
  finally { clearTimeout(t); }
};
const svcError = async (name, r) => {
  let j = null; try { j = JSON.parse(await r.text()); } catch (e) { j = null; }
  const msg = (j && ((j.error && j.error.message) || j.error_description || j.detail || j.message || (typeof j.error === 'string' && j.error))) || '';
  return new Error(`${name} ${r.status}${msg ? `: ${String(msg).slice(0, 160)}` : ''}`);
};
/* every TMDB lookup goes through here, with one key (Settings), one cache and a timeout.
   An answer (also "not found") is kept for 6 hours; a network error is not kept, so the next look tries again. */
const TMDB = {
  BASE: 'https://api.themoviedb.org/3',
  cache: new Map(),
  key: () => String(Keys.get().tmdb || '').trim(),
  get(path, params = {}, ms = 8000) {
    const key = this.key(); if (!key) return Promise.resolve(null);
    const q = Object.entries(params).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
    const url = `${this.BASE}/${path}?api_key=${encodeURIComponent(key)}${q}`, hit = this.cache.get(url);
    if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.p;
    const p = netFetch(url, {}, ms).then((r) => {
      if (r.ok) return r.json();
      if (r.status === 404 || r.status === 401) return null; // unknown title, or a wrong key: a real answer
      throw new Error(`TMDB ${r.status}`);
    });
    this.cache.set(url, { t: Date.now(), p });
    p.catch(() => { const h = this.cache.get(url); if (h && h.p === p) this.cache.delete(url); });
    if (this.cache.size > 800) this.cache.delete(this.cache.keys().next().value);
    return p;
  },
  find(tt) { return this.get(`find/${tt}`, { external_source: 'imdb_id' }); },
  images(kind, id) { return this.get(`${kind}/${id}/images`, { include_image_language: 'en,null' }); },
  externalIds(id) { return this.get(`tv/${id}/external_ids`); },
  // both TMDB key fields in Settings save through here, so every feature that uses the key starts fresh
  setKey(v) {
    Keys.set('tmdb', String(v || '').trim()); this.cache.clear();
    [() => AmbientArt.cache, () => WhereToWatch.cache, () => ArtFallback.tm].forEach((c) => { try { c().clear(); } catch (e) { /* not loaded */ } });
  },
};
/* both MDBList key fields clear both MDBList caches */
const setMdbKey = (v) => { Keys.set('mdblist', String(v || '').trim()); Store.set('mdbCache', {}); try { RateBadges.cache.clear(); } catch (e) { /* not loaded */ } };

/* ---------------- Debrid Vault: resolve torrent results through your own debrid account ----------------
   Real-Debrid (addMagnet → selectFiles → unrestrict), TorBox (createtorrent → requestdl), AllDebrid and Premiumize.
   Browsers may block some of these APIs (CORS); then the call goes through a relay (see Vault.relay). */
const DEBRID = {
  rd: { label: 'Real-Debrid', short: 'RD', help: 'real-debrid.com/apitoken' },
  tb: { label: 'TorBox', short: 'TB', help: 'torbox.app/settings (API key)' },
  ad: { label: 'AllDebrid', short: 'AD', help: 'alldebrid.com/apikeys' },
  pm: { label: 'Premiumize', short: 'PM', help: 'premiumize.me/account (API key)' },
};
const VIDEO_EXT = /\.(mkv|mp4|m4v|webm|mov|avi|ts|m2ts|wmv|flv|mpg|mpeg)$/i;
const Vault = {
  cached: new Map(),
  cfg() { return Store.get('vault', {}); },
  service() { const v = this.cfg(); if (v.off) return null; return [...(v.order || []), 'ad', 'pm', 'rd', 'tb'].find((k) => DEBRID[k] && v[k]) || null; },
  label(k = this.service()) { return k ? DEBRID[k].label : ''; },
  save(k, key) { const v = this.cfg(); const o = (v.order || []).filter((x) => x !== k); if (key) { v[k] = key.trim(); o.push(k); } else delete v[k]; v.order = o; Store.set('vault', v); engine.clearCache(); this.cached.clear(); },
  async call(url, { method = 'GET', headers = {}, body, timeout = 15000 } = {}) {
    let r; const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
    try { r = await fetch(url, { method, headers, body, signal: ctl.signal }); }
    catch (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') throw new Error('Timed out');
      if (!(e instanceof TypeError)) throw e;
      r = await this.relay(url, { method, headers, body });
      if (!r) throw new Error(this.relayHelp());
    }
    let text; try { text = await r.text(); } catch (e) { throw e && e.name === 'AbortError' ? new Error('Timed out') : e; } finally { clearTimeout(timer); }
    let j; try { j = JSON.parse(text); } catch (e) { j = { raw: text }; }
    // AllDebrid and Premiumize report errors as HTTP 200 with status "error"; TorBox says success: false
    const failed = !r.ok || (j && ((j.status === 'error' && /alldebrid\.com|premiumize\.me/.test(url)) || j.success === false));
    if (failed) throw new Error((j && ((j.error && j.error.message) || j.detail || (typeof j.error === 'string' && j.error) || j.message)) || `HTTP ${r.status}`);
    return j;
  },
  /* Debrid APIs such as TorBox refuse direct calls from a web page (CORS), so the call then goes through a relay:
     the debrid-relay function on the account's Supabase project first, then this site's own /debrid when mkcinema-server.js
     serves the app (Cloudflare Pages has no /debrid and answers with the app page, so it is skipped there), then the proxy URL
     from Settings. Each relay is pinged once per session (?ping=1) and only reaches the four debrid API hosts.
     A v2 Supabase relay gets query-string keys (apikey=, token=) in the x-debrid-query header instead, so they never appear
     in the request address that Supabase records. */
  SECRET_Q: ['apikey', 'token', 'presigned_token'],
  relays() {
    const out = [], px = String(S.proxy || '').replace(/\/+$/, ''), c = Account.config() || {}, sb = c.url ? String(c.url).replace(/\/+$/, '') : '';
    if (sb) out.push({ id: sb, sb: true, key: c.anonKey || '', base: `${sb}/functions/v1/debrid-relay` });
    if (/^https?:$/.test(location.protocol) && !/(^|\.)(pages\.dev|mkcinema\.app)$/.test(location.hostname)) out.push({ id: location.origin, base: `${location.origin}/debrid` });
    if (px && px !== location.origin) out.push({ id: px, base: `${px}/debrid` });
    return out;
  },
  relayState: new Map(), relayPing: new Map(),
  // asks a relay once per session whether it is there and which protocol it speaks; a failed ping is retried after a minute
  probe(base) {
    const sk = `mkc:relay:${base}`; let st = this.relayState.get(base);
    if (!st) { try { st = JSON.parse(sessionStorage.getItem(sk) || 'null'); } catch (e) { st = null; } if (st) this.relayState.set(base, st); }
    if (st && (st.ok || st.final || Date.now() - st.at < 60000)) return Promise.resolve(st);
    if (this.relayPing.has(base)) return this.relayPing.get(base);
    const p = (async () => {
      let n = { ok: false, v: 0, key: false, final: false, at: Date.now() };
      try {
        const r = await fetch(`${base}?ping=1`, { cache: 'no-store' });
        const j = r.headers.get('x-mkc-relay') && /json/i.test(r.headers.get('content-type') || '') ? await r.json().catch(() => null) : null;
        if (j && j.ok) n = { ...n, ok: true, v: Number(j.v) || 1, key: !!j.key };
        else if (r.status !== 429 && r.status < 500) n.final = true; // it answered, but it is not a relay (an app page, 404 or 405)
      } catch (e) { /* offline or not there: ask again in a minute */ }
      this.relayState.set(base, n); this.relayPing.delete(base);
      if (n.ok || n.final) try { sessionStorage.setItem(sk, JSON.stringify(n)); } catch (e) { /* private mode */ }
      return n;
    })();
    this.relayPing.set(base, p); return p;
  },
  markDown(base) { this.relayState.set(base, { ok: false, v: 0, key: false, final: false, at: Date.now() }); try { sessionStorage.removeItem(`mkc:relay:${base}`); } catch (e) { /* ignore */ } },
  // moves the key-like query parameters out of a debrid URL, keeping the rest exactly as written
  splitQuery(url) {
    const i = url.indexOf('?'); if (i < 0) return { url, secret: '' };
    const keep = [], secret = [];
    for (const part of url.slice(i + 1).split('&')) if (part) (this.SECRET_Q.includes(part.split('=')[0]) ? secret : keep).push(part);
    return { url: url.slice(0, i) + (keep.length ? `?${keep.join('&')}` : ''), secret: secret.join('&') };
  },
  async relay(url, { method, headers = {}, body }) {
    for (const r of this.relays()) {
      const st = await this.probe(r.base); if (!st.ok) continue;
      let h = headers, target = url, rb = r.base;
      // on Supabase the user's key travels in x-debrid-auth, so it never meets Supabase's own Authorization header
      if (r.sb) {
        h = { ...headers }; const a = h.Authorization || h.authorization; delete h.Authorization; delete h.authorization; if (a) h['x-debrid-auth'] = a;
        if (st.v >= 2) { const q = this.splitQuery(url); target = q.url; if (q.secret) h['x-debrid-query'] = q.secret; if (st.key && r.key) h.apikey = r.key; }
      } else {
        // own server: its token and the key-like query parameters ride in headers, so they stay out of access logs
        const m = /^(.*)\/t\/([^/?#]+)(\/debrid)$/.exec(rb); if (m) { try { h = { ...h, 'x-mkc-token': decodeURIComponent(m[2]) }; rb = m[1] + m[3]; } catch (e) { /* keep the path form */ } }
        if (st.v >= 2) { const q = this.splitQuery(url); target = q.url; if (q.secret) h = { ...h, 'x-debrid-query': q.secret }; }
      }
      try {
        const res = await fetch(`${rb}?url=${encodeURIComponent(target)}`, { method, headers: h, body });
        if (res.headers.get('x-mkc-relay')) return res;
      } catch (e) { /* this relay is not there */ }
      this.markDown(r.base);
    }
    return null;
  },
  relayHelp() {
    return /pages\.dev$/.test(location.hostname)
      ? 'Debrid services refuse direct calls from a web page, so MKCinema passes them through a small relay, and no relay is switched on for this site yet. The site owner can turn one on (see the README, "Debrid relay").'
      : 'Debrid services refuse direct calls from a web page, so MKCinema needs its relay: open the app from your MKCinema server, or start mkcinema-server.js and set it as the proxy URL.';
  },
  form(obj) { const f = new URLSearchParams(); Object.entries(obj).forEach(([k, v]) => f.append(k, v)); return f; },
  pickFile(files, s, ctx) {
    const bh = s.behaviorHints || {}, vids = files.filter((f) => VIDEO_EXT.test(f.name || '')) || files;
    if (typeof s.fileIdx === 'number' && files[s.fileIdx] && VIDEO_EXT.test(files[s.fileIdx].name || '')) return files[s.fileIdx];
    if (bh.filename) { const hit = files.find((f) => String(f.name || '').split('/').pop() === bh.filename); if (hit) return hit; }
    if (ctx && ctx.video) {
      const se = Number(ctx.video.season), ep = Number(ctx.video.episode), re = new RegExp(`(s0*${se}[ ._-]*e0*${ep}(?!\\d))|(\\b${se}x0*${ep}(?!\\d))`, 'i');
      const hit = vids.find((f) => re.test(f.name || '')); if (hit) return hit;
    }
    return (vids.length ? vids : files).slice().sort((a, b) => (b.size || 0) - (a.size || 0))[0];
  },
  within(p, ms, msg = 'Timed out') { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms); })]).finally(() => clearTimeout(t)); },
  // a stalled debrid API or relay ends in a clear error (and failover) instead of an endless loader
  resolve(s, ctx) { return this.within(this.resolveNow(s, ctx), 45000); },
  async resolveNow(s, ctx) {
    const k = this.service(), key = this.cfg()[k], hash = String(s.infoHash).toLowerCase(), mag = magnetOf(s);
    if (k === 'rd') {
      const H = { Authorization: `Bearer ${key}` }, base = 'https://api.real-debrid.com/rest/1.0';
      const add = await this.call(`${base}/torrents/addMagnet`, { method: 'POST', headers: H, body: this.form({ magnet: mag }) });
      let info = await this.call(`${base}/torrents/info/${add.id}`, { headers: H });
      for (let i = 0; i < 6 && info.status === 'magnet_conversion'; i++) { await new Promise((r) => setTimeout(r, 1000)); info = await this.call(`${base}/torrents/info/${add.id}`, { headers: H }); }
      if (info.status === 'waiting_files_selection') {
        const files = (info.files || []).map((f) => ({ ...f, name: f.path, size: f.bytes }));
        const f = this.pickFile(files, s, ctx); await this.call(`${base}/torrents/selectFiles/${add.id}`, { method: 'POST', headers: H, body: this.form({ files: String(f ? f.id : 'all') }) });
      }
      for (let i = 0; i < 8; i++) { info = await this.call(`${base}/torrents/info/${add.id}`, { headers: H }); if (info.status === 'downloaded' && info.links && info.links.length) break; await new Promise((r) => setTimeout(r, 1000)); }
      if (info.status !== 'downloaded') throw new Error(`Real-Debrid does not have it cached yet (${info.status}${info.progress != null ? `, ${info.progress}%` : ''}). It keeps downloading in your account.`);
      const un = await this.call(`${base}/unrestrict/link`, { method: 'POST', headers: H, body: this.form({ link: info.links[0] }) });
      if (un.id) s._rd = String(un.id);
      return un.download;
    }
    if (k === 'tb') {
      const H = { Authorization: `Bearer ${key}` }, base = 'https://api.torbox.app/v1/api/torrents';
      const fd = new FormData(); fd.append('magnet', mag); fd.append('allow_zip', 'false');
      const c = await this.call(`${base}/createtorrent`, { method: 'POST', headers: H, body: fd });
      const id = (c.data || {}).torrent_id || (c.data || {}).id; if (!id) throw new Error(c.detail || 'TorBox did not accept the torrent');
      let t = null;
      for (let i = 0; i < 8; i++) { const l = await this.call(`${base}/mylist?id=${id}&bypass_cache=true`, { headers: H }); t = l.data; if (t && (t.download_present || t.download_finished) && (t.files || []).length) break; await new Promise((r) => setTimeout(r, 1000)); }
      if (!t || !(t.download_present || t.download_finished)) throw new Error('TorBox does not have it cached yet. It keeps downloading in your account.');
      const f = this.pickFile(t.files.map((x) => ({ ...x, name: x.name || x.short_name })), s, ctx);
      const dl = await this.call(`${base}/requestdl?token=${encodeURIComponent(key)}&torrent_id=${id}&file_id=${f.id}&redirect=false`, { headers: H });
      s._tb = { id, fileId: f.id };
      return dl.data;
    }
    if (k === 'ad') {
      const q = `agent=mkcinema&apikey=${encodeURIComponent(key)}`, base = 'https://api.alldebrid.com';
      const up = await this.call(`${base}/v4/magnet/upload?${q}&magnets[]=${encodeURIComponent(mag)}`);
      const m = ((up.data || {}).magnets || [])[0]; if (!m || m.error) throw new Error((m && m.error && m.error.message) || 'AllDebrid did not accept the magnet');
      let links = null;
      for (let i = 0; i < 8; i++) {
        let st;
        try { st = await this.call(`${base}/v4.1/magnet/status?${q}`, { method: 'POST', body: this.form({ id: m.id }) }); } catch (e) { st = await this.call(`${base}/v4/magnet/status?${q}&id=${m.id}`); }
        const sd = st.data || {}, mg = Array.isArray(sd.magnets) ? sd.magnets[0] : sd.magnets;
        if (mg && mg.statusCode === 4) {
          links = mg.links || (((((await this.call(`${base}/v4/magnet/files?${q}&id[]=${m.id}`)).data || {}).magnets || [])[0] || {}).files) || null;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (!links) throw new Error('AllDebrid does not have it cached yet.');
      const flat = []; const walk = (arr, p = '') => arr.forEach((x) => { if (x.e) walk(x.e, `${p}${x.n}/`); else flat.push({ name: x.filename || `${p}${x.n}`, size: x.size || x.s, link: x.link || x.l }); }); walk(links);
      const f = this.pickFile(flat, s, ctx);
      const un = await this.call(`${base}/v4/link/unlock?${q}&link=${encodeURIComponent(f.link)}`);
      if (!un.data || !un.data.link) throw new Error('AllDebrid did not unlock the file');
      return un.data.link;
    }
    if (k === 'pm') {
      const d = await this.call(`https://www.premiumize.me/api/transfer/directdl?apikey=${encodeURIComponent(key)}`, { method: 'POST', body: this.form({ src: mag }) });
      if (d.status !== 'success' || !(d.content || []).length) throw new Error(d.message || 'Premiumize does not have it cached');
      const f = this.pickFile(d.content.map((x) => ({ ...x, name: x.path })), s, ctx);
      return f.stream_link && /\.mp4(\?|$)/i.test(f.stream_link) ? f.stream_link : f.link;
    }
    throw new Error('No debrid service is set up');
  },
  /* Which of these hashes your service already has (TorBox and Premiumize can tell without adding them) */
  async mark(streams) {
    const k = this.service(); if (!k || (k !== 'tb' && k !== 'pm')) return false;
    const key = this.cfg()[k], hashes = [...new Set(streams.filter((s) => s.infoHash && !this.cached.has(String(s.infoHash).toLowerCase())).map((s) => String(s.infoHash).toLowerCase()))].slice(0, 80);
    if (!hashes.length) return false;
    try {
      if (k === 'tb') {
        const r = await this.call(`https://api.torbox.app/v1/api/torrents/checkcached?hash=${hashes.join(',')}&format=object&list_files=false`, { headers: { Authorization: `Bearer ${key}` } });
        const have = new Set(Object.keys(r.data || {}).map((h) => h.toLowerCase())); hashes.forEach((h) => this.cached.set(h, have.has(h)));
      } else {
        const r = await this.call(`https://www.premiumize.me/api/cache/check?apikey=${encodeURIComponent(key)}&${hashes.map((h) => `items[]=${h}`).join('&')}`);
        hashes.forEach((h, i) => this.cached.set(h, !!(r.response || [])[i]));
      }
    } catch (e) { return false; }
    streams.forEach((s) => { if (s.infoHash && !s.url) s._tel = Telemetry.parse(s); });
    streams.sort((a, b) => b._tel.score - a._tel.score);
    return true;
  },
  test(k) { return this.within(this.testNow(k), 30000); },
  async testNow(k) {
    const key = this.cfg()[k]; if (!key) throw new Error('Paste a key first');
    if (k === 'rd') { const u = await this.call('https://api.real-debrid.com/rest/1.0/user', { headers: { Authorization: `Bearer ${key}` } }); return `${u.username} · ${u.type}${u.expiration ? ` until ${fmtDate(u.expiration)}` : ''}`; }
    if (k === 'tb') { const u = await this.call('https://api.torbox.app/v1/api/user/me', { headers: { Authorization: `Bearer ${key}` } }); return `${(u.data || {}).email || 'Account'} · plan ${(u.data || {}).plan ?? '?'}`; }
    if (k === 'ad') { const u = await this.call(`https://api.alldebrid.com/v4/user?agent=mkcinema&apikey=${encodeURIComponent(key)}`), us = (u.data || {}).user || {}; return `${us.username || 'Account'}${us.isPremium ? ' · premium' : ''}`; }
    const u = await this.call(`https://www.premiumize.me/api/account/info?apikey=${encodeURIComponent(key)}`); if (u.status !== 'success') throw new Error(u.message || 'Rejected'); return `Customer ${u.customer_id} · premium until ${new Date(u.premium_until * 1000).toLocaleDateString(appLocale())}`;
  },
};
{
  const parse = Telemetry.parse.bind(Telemetry), badges = Telemetry.badges.bind(Telemetry);
  Telemetry.parse = function (s) {
    const t = parse(s), k = s.infoHash && !s.url && Vault.service();
    if (k) {
      const inst = Vault.cached.get(String(s.infoHash).toLowerCase());
      t.debrid = k; t.instant = !!inst; t.webReady = true; t.source = `Debrid · ${DEBRID[k].label}`;
      if (inst != null) t.cached = !!inst;
      // undo the "browsers cannot play torrents" penalty; what is already cached goes first
      t.score += 2000 + 60;
    } else if (s.url) {
      // debrid addons tag each result: Torrentio "[TB+]" cached, "[TB download]" not yet; Comet and others use ⚡ and ⬇️ or ⏳
      const n = String(s.name || ''), tag = /\[(RD|TB|AD|PM|DL|OC|ED|PD|PR|EN|DLS)\b[^\]]*\]/i.exec(n);
      if (tag) t.cached = !/download|⬇|⏳/i.test(tag[0]) && (/\+|⚡/.test(tag[0]) || /⚡/.test(n)) ? true : /download|⬇|⏳/i.test(tag[0]) ? false : undefined;
    }
    // an uncached file plays as the addon's "being downloaded to debrid" notice, so it goes to the bottom
    if (t.cached === true) t.score += 500; else if (t.cached === false) t.score -= 1600;
    if (s._debrid) t.source = `Debrid · ${DEBRID[s._debrid].label}`;
    return t;
  };
  Telemetry.badges = (s, tel, a, c) => `${tel.debrid || s._debrid ? `<span class="tb deb">Debrid${tel.instant || s._debrid ? ' · Instant' : ''}</span>` : tel.cached === true ? '<span class="tb deb">Cached</span>' : ''}${tel.cached === false ? '<span class="tb unc">Not cached</span>' : ''}${badges(s, tel, a, c)}`;
  const fetchStreams = engine.fetchStreams.bind(engine);
  engine.fetchStreams = async function (type, id, onPartial) {
    const r = await fetchStreams(type, id, onPartial);
    // later wrappers (media servers, anime) give the panel a new array of the same stream objects,
    // so the open panel is matched by its streams and re-sorted with the cache marks
    Vault.mark(r.streams).then((changed) => {
      if (!changed || $('#detail').hidden || !Array.isArray(D.streams)) return;
      if (D.streams !== r.streams) { if (!r.streams.some((x) => D.streams.includes(x))) return; D.streams.sort((a, b) => b._tel.score - a._tel.score); }
      renderStreamsPanel();
    });
    return r;
  };
  const play = playStream;
  playStream = async function (ctx, stream, opts) {
    if (stream && stream._tel && stream._tel.cached === false) toast('This source is not cached on your debrid service yet, so it may show a "downloading" notice. Cached sources at the top of the list play right away.', 'info', 6500);
    if (stream && stream.infoHash && !stream.url && stream._tel && stream._tel.debrid) {
      const k = stream._tel.debrid;
      if ($('#player').hidden) openLayer('player');
      P.ctx = ctx; Loader.show(ctx.meta); const tok = Vault.playTok = (Vault.playTok || 0) + 1;
      try {
        const url = await Vault.resolve(stream, ctx);
        if (tok !== Vault.playTok || $('#player').hidden) return; // another source was picked, or the player closed, meanwhile
        stream._infoHash = stream.infoHash; delete stream.infoHash; stream.url = url; stream._debrid = k; stream._tel = Telemetry.parse(stream);
      } catch (e) {
        if (tok !== Vault.playTok || $('#player').hidden) return;
        Loader.hide(); toast(`${DEBRID[k].label}: ${e.message}`, 'err', 7000);
        Failover.tried.add(stream);
        if (CFG.failover && Failover.next(stream, 'is not cached', opts && opts.startAt)) return;
        // say what the debrid service said, not the "peer-to-peer torrent" notice
        teardown(); P.stream = stream; $('#pTitle').textContent = ctx.meta.name || '';
        showMsg(`${DEBRID[k].label} could not play this`, esc(e.message || 'Something went wrong'), `${handoffHTML(stream)}<button class="btn btn-ghost" type="button" data-act="sources"><i data-lucide="layers"></i>Other sources</button>`);
        return;
      }
    }
    return play(ctx, stream, opts);
  };
}

/* ---------------- Ratings: IMDb star, quality tag, RPDB rating posters, and critic scores with your OMDb key ---------------- */
/* custom-poster-2.31.0 */
/* Custom poster URL: a link template from a poster service (Pictorium, or any service that serves one image per title).
   MKCinema fills {type}, {imdb_id}, {tmdb_id}, {tmdb_id|imdb_id} (tmdb:<n> when known, else the IMDb id) and
   {shape} (poster, or landscape on wide cards). A title with no usable id, or an image that fails, falls back to the normal art. */
const CustomPoster = {
  tpl() { const t = String(Keys.get().posterUrl || '').trim(); return /^https?:\/\/[^\s"'<>]+$/i.test(t) ? t : ''; },
  url(m, shape = 'poster') {
    const t = this.tpl(); if (!t || !m) return null;
    if (shape === 'landscape' && !/\{shape\}/i.test(t)) return null;
    const imdb = imdbOf(m);
    const rawT = String(m.moviedb_id || m.tmdb_id || (String(m.id || '').match(/^tmdb:(\d+)/i) || [])[1] || '');
    const tmdb = /^\d+$/.test(rawT) ? rawT : '';
    let miss = false;
    const need = (v) => { if (!v) miss = true; return v || ''; };
    const out = t.replace(/\{([a-z_|]+)\}/gi, (all, k) => {
      switch (k.toLowerCase()) {
        case 'type': return m.type === 'movie' ? 'movie' : 'series';
        case 'shape': return shape === 'landscape' ? 'landscape' : 'poster';
        case 'imdb_id': return need(imdb);
        case 'tmdb_id': return need(tmdb);
        case 'tmdb_id|imdb_id': case 'imdb_id|tmdb_id': case 'id': return need(tmdb ? 'tmdb:' + tmdb : imdb);
        default: return all;
      }
    });
    return miss ? null : out;
  },
};
const imdbOf = (m) => { const id = String(m.imdb_id || m.id || '').split(':')[0]; return /^tt\d+$/.test(id) ? id : null; };
const Ratings = {
  cache: new Map(),
  poster(m) { const c = CustomPoster.url(m, 'poster'); if (c) return c; if (!CFG.rpdb) return null; const id = imdbOf(m); return id ? `https://api.ratingposterdb.com/${encodeURIComponent(Keys.get().rpdb || 't0-free-rpdb')}/imdb/poster-default/${id}.jpg?fallback=true` : null; },
  async critics(m) {},
};

/* ---------------- Trakt and Simkl: scrobbling and two-way watchlist ----------------
   Trakt needs your own API app (client ID and secret) from trakt.tv/oauth/applications.
   Simkl only needs a client ID from simkl.com/settings/developer. Tokens stay in this browser. */
const Trakt = {
  base: 'https://api.trakt.tv',
  cfg() { return Store.get('trakt', {}); }, save(v) { Store.set('trakt', { ...this.cfg(), ...v }); },
  on() { const c = this.cfg(); return !!(c.token && c.clientId); },
  async api(path, { method = 'GET', body } = {}) {
    const c = this.cfg();
    if (c.token && c.expires && Date.now() > c.expires - 86400e3 && c.refresh) await this.refresh();
    const r = await netFetch(this.base + path, { method, headers: { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': c.clientId, ...(this.cfg().token ? { Authorization: `Bearer ${this.cfg().token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 204 || r.status === 409) return null;
    if (!r.ok) throw await svcError('Trakt', r);
    return r.json();
  },
  async refresh() {
    const c = this.cfg();
    const r = await fetch(`${this.base}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: c.refresh, client_id: c.clientId, client_secret: c.secret, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob', grant_type: 'refresh_token' }) });
    if (r.ok) { const j = await r.json(); this.save({ token: j.access_token, refresh: j.refresh_token, expires: (j.created_at + j.expires_in) * 1000 }); }
  },
  async connect(onCode) {
    const c = this.cfg(); if (!c.clientId || !c.secret) throw new Error('Paste your Trakt client ID and secret first');
    const r = await fetch(`${this.base}/oauth/device/code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: c.clientId }) });
    if (!r.ok) throw new Error(`Trakt refused the client ID (${r.status})`);
    const d = await r.json(); onCode(d.user_code, d.verification_url);
    const until = Date.now() + d.expires_in * 1000;
    while (Date.now() < until) {
      await new Promise((res) => setTimeout(res, d.interval * 1000));
      const t = await fetch(`${this.base}/oauth/device/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: d.device_code, client_id: c.clientId, client_secret: c.secret }) });
      if (t.status === 200) { const j = await t.json(); this.save({ token: j.access_token, refresh: j.refresh_token, expires: (j.created_at + j.expires_in) * 1000 }); return true; }
      if (t.status === 418) throw new Error('You declined the request on Trakt');
      if (t.status === 410 || t.status === 404) throw new Error('The code expired. Try again.');
    }
    throw new Error('The code expired. Try again.');
  },
  /* Kitsu episodes carry their IMDb season and episode (imdbSeason/imdbEpisode), which is what Trakt,
     Simkl and AniSkip's IMDb mapping know; Kitsu's own season numbers start at 1 for every part */
  ids(ctx) {
    const v = ctx.video, id = imdbOf(ctx.meta) || (v && /^tt\d+$/.test(String(v.imdb_id || '')) ? v.imdb_id : null); if (!id) return null;
    if (!v) return { id };
    const mapped = !/^tt\d+/.test(String(v.id || '')) && v.imdbSeason != null && v.imdbEpisode != null;
    return { id, season: Number(mapped ? v.imdbSeason : v.season), episode: Number(mapped ? v.imdbEpisode : v.episode) };
  },
  item(ctx) {
    const x = this.ids(ctx); if (!x) return null;
    return ctx.video ? { show: { ids: { imdb: x.id } }, episode: { season: x.season, number: x.episode } } : { movie: { ids: { imdb: x.id } } };
  },
  async importList() {
    const [mv, sh] = await Promise.all([this.api('/sync/watchlist/movies'), this.api('/sync/watchlist/shows')]);
    const items = [...(mv || []).map((x) => ({ type: 'movie', o: x.movie })), ...(sh || []).map((x) => ({ type: 'series', o: x.show }))];
    return Watch.merge(items.filter((x) => x.o && x.o.ids && x.o.ids.imdb).map((x) => ({ id: x.o.ids.imdb, type: x.type, name: x.o.title, releaseInfo: String(x.o.year || '') })));
  },
  async exportList() {
    const tt = S.watchlist.filter((m) => /^tt\d+$/.test(m.id));
    await this.api('/sync/watchlist', { method: 'POST', body: { movies: tt.filter((m) => m.type === 'movie').map((m) => ({ ids: { imdb: m.id } })), shows: tt.filter((m) => m.type === 'series').map((m) => ({ ids: { imdb: m.id } })) } });
    return tt.length;
  },
};
const Simkl = {
  base: 'https://api.simkl.com',
  cfg() { return Store.get('simkl', {}); }, save(v) { Store.set('simkl', { ...this.cfg(), ...v }); },
  on() { const c = this.cfg(); return !!(c.token && c.clientId); },
  async api(path, { method = 'GET', body } = {}) {
    const c = this.cfg();
    const r = await netFetch(this.base + path, { method, headers: { 'Content-Type': 'application/json', 'simkl-api-key': c.clientId, ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw await svcError('Simkl', r);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  },
  async connect(onCode) {
    const c = this.cfg(); if (!c.clientId) throw new Error('Paste your Simkl client ID first');
    const d = await this.api(`/oauth/pin?client_id=${encodeURIComponent(c.clientId)}`); onCode(d.user_code, d.verification_url);
    const until = Date.now() + (d.expires_in || 900) * 1000;
    while (Date.now() < until) {
      await new Promise((res) => setTimeout(res, (d.interval || 5) * 1000));
      const t = await this.api(`/oauth/pin/${encodeURIComponent(d.user_code)}?client_id=${encodeURIComponent(c.clientId)}`);
      if (t && t.access_token) { this.save({ token: t.access_token }); return true; }
    }
    throw new Error('The code expired. Try again.');
  },
  async history(ctx) {
    const x = Trakt.ids(ctx); if (!x) return; const id = x.id;
    const body = ctx.video ? { shows: [{ ids: { imdb: id }, seasons: [{ number: x.season, episodes: [{ number: x.episode }] }] }] } : { movies: [{ ids: { imdb: id } }] };
    await this.api('/sync/history', { method: 'POST', body });
  },
  async importList() {
    const [mv, sh] = await Promise.all([this.api('/sync/all-items/movies/plantowatch').catch(() => null), this.api('/sync/all-items/shows/plantowatch').catch(() => null)]);
    const items = [...((mv && mv.movies) || []).map((x) => ({ type: 'movie', o: x.movie })), ...((sh && sh.shows) || []).map((x) => ({ type: 'series', o: x.show }))];
    return Watch.merge(items.filter((x) => x.o && x.o.ids && x.o.ids.imdb).map((x) => ({ id: x.o.ids.imdb, type: x.type, name: x.o.title, releaseInfo: String(x.o.year || '') })));
  },
  async exportList() {
    const tt = S.watchlist.filter((m) => /^tt\d+$/.test(m.id));
    await this.api('/sync/add-to-list', { method: 'POST', body: { movies: tt.filter((m) => m.type === 'movie').map((m) => ({ to: 'plantowatch', ids: { imdb: m.id } })), shows: tt.filter((m) => m.type === 'series').map((m) => ({ to: 'plantowatch', ids: { imdb: m.id } })) } });
    return tt.length;
  },
};
const Watch = {
  merge(items) {
    const have = new Set(S.watchlist.map((m) => m.id)); let n = 0;
    items.forEach((m) => { if (!have.has(m.id)) { have.add(m.id); S.watchlist.push({ ...m, poster: metaPoster(m), background: metaBg(m), genres: [] }); n++; } });
    Store.set('watchlist', S.watchlist); rerender(); return n;
  },
};
/* Scrobbling: Trakt hears start, pause and stop; past 80 % the title counts as watched on Trakt and Simkl */
const Scrobble = {
  ctx: null, done: false,
  pct() { const d = pDur(); return isFinite(d) && d > 0 ? clamp(pNow() / d * 100, 0, 100) : 0; },
  start(ctx, stream) { this.ctx = ctx; this.done = false; if (stream && stream._local) this.ctx = null; },
  send(action) {
    const ctx = this.ctx; if (!ctx) return; const pct = this.pct();
    if (Trakt.on()) { const it = Trakt.item(ctx); if (it) Trakt.api(`/scrobble/${action}`, { method: 'POST', body: { ...it, progress: Number(pct.toFixed(2)) } }).catch(() => {}); }
  },
  check() {
    if (!this.ctx || this.done || this.pct() < 80) return;
    this.done = true; this.send('stop');
    if (Simkl.on()) Simkl.history(this.ctx).catch(() => {});
  },
};
video.addEventListener('play', () => { if (Scrobble.ctx && !Scrobble.done) Scrobble.send('start'); });
video.addEventListener('pause', () => { if (Scrobble.ctx && !Scrobble.done && !video.ended) Scrobble.send('pause'); Scrobble.check(); });
video.addEventListener('timeupdate', () => { if (Scrobble.ctx && !Scrobble.done && Math.random() < 0.05) Scrobble.check(); });
video.addEventListener('ended', () => Scrobble.check());

/* ---------------- Airing Calendar: the next 7 or 30 days of your series ---------------- */
const Calendar = {
  days: 7, tickT: 0, token: 0,
  shows() {
    const seen = new Map();
    S.watchlist.filter((m) => m.type === 'series').forEach((m) => seen.set(m.id, m));
    continueItems().filter((p) => p.type === 'series').forEach((p) => { if (!seen.has(p.metaId)) seen.set(p.metaId, { id: p.metaId, type: 'series', name: p.name, poster: p.poster }); });
    return [...seen.values()].slice(0, 40);
  },
  async render() {
    const body = $('#calBody'), token = ++this.token, shows = this.shows();
    $$('#calRange [data-days]').forEach((b) => { const on = Number(b.dataset.days) === this.days; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    if (!shows.length) { body.innerHTML = '<div class="empty-state"><i data-lucide="calendar-days"></i><h3>No series to follow yet</h3><p>Add series to your watchlist, or start watching one, and their new episodes show up here.</p></div>'; icons(); return; }
    body.innerHTML = `<div class="status-line"><span class="spin"></span>Checking ${shows.length} series…</div>`;
    const now = Date.now(), from = now - 3 * 86400e3, to = now + this.days * 86400e3, eps = [];
    await Promise.allSettled(shows.map(async (s) => {
      const meta = remember({ ...s, ...((await engine.fetchMeta('series', s.id)) || {}) });
      (meta.videos || []).forEach((v) => { const at = Date.parse(v.released || v.firstAired || ''); if (at >= from && at <= to && Number(v.season) !== 0) eps.push({ meta, v, at }); });
    }));
    if (token !== this.token) return;
    eps.sort((a, b) => a.at - b.at);
    $('#calNote').textContent = `${eps.length} episode${eps.length === 1 ? '' : 's'} · ${shows.length} series`;
    if (!eps.length) { body.innerHTML = `<div class="empty">Nothing airing in the next ${this.days} days for your series.</div>`; return; }
    const day = (t) => { const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0); const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400e3); return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : d.toLocaleDateString(appLocale(), { weekday: 'long', month: 'short', day: 'numeric' }); };
    const groups = []; eps.forEach((e) => { const k = day(e.at); const g = groups[groups.length - 1]; if (g && g.k === k) g.list.push(e); else groups.push({ k, list: [e] }); });
    body.innerHTML = groups.map((g) => `<section class="cal-day"><h3>${esc(g.k)}</h3>${g.list.map((e) => {
      const id = videoIdFor(e.meta, e.v), aired = e.at <= now;
      return `<div class="cal-ep ${aired ? 'aired' : ''}">${imgTag(metaPoster(e.meta), e.meta.name, e.meta.id)}<div class="cal-t"><b>${esc(e.meta.name)}</b><small>S${esc(e.v.season)} · E${esc(e.v.episode)}${e.v.name || e.v.title ? ` · ${esc(e.v.name || e.v.title)}` : ''}</small><span class="cal-when tnum" data-at="${e.at}"></span></div>
        ${aired ? `<button class="btn btn-prime btn-sm" type="button" data-cplay="${esc(id)}" data-meta="${esc(e.meta.id)}"><i data-lucide="play"></i>${isWatched(id) ? 'Watch again' : 'Play'}</button>` : `<button class="btn btn-ghost btn-sm" type="button" data-cinfo="${esc(e.meta.id)}"><i data-lucide="info"></i>Details</button>`}</div>`;
    }).join('')}</section>`).join('');
    icons(); this.tick();
    $$('[data-cplay]', body).forEach((b) => b.addEventListener('click', () => this.play(b.dataset.meta, b.dataset.cplay, b)));
    $$('[data-cinfo]', body).forEach((b) => b.addEventListener('click', () => { const m = S.metas.get(b.dataset.cinfo); if (m) openDetail(m); }));
    clearInterval(this.tickT); this.tickT = setInterval(() => { if (S.view === 'calendar') this.tick(); else clearInterval(this.tickT); }, 30000);
  },
  tick() {
    const now = Date.now();
    $$('#calBody [data-at]').forEach((el) => {
      const d = Number(el.dataset.at) - now, a = Math.abs(d), dd = Math.floor(a / 86400e3), hh = Math.floor(a % 86400e3 / 3600e3), mm = Math.floor(a % 3600e3 / 60e3);
      const span = dd ? `${dd}d ${hh}h` : hh ? `${hh}h ${mm}m` : `${mm}m`;
      el.textContent = d > 0 ? `in ${span}` : `aired ${span} ago`;
    });
  },
  async play(metaId, vid, btn) {
    const meta = S.metas.get(metaId); if (!meta) return;
    btn.disabled = true; const v = (meta.videos || []).find((x) => videoIdFor(meta, x) === vid) || null;
    const { streams } = await engine.fetchStreams('series', vid); const pick = pickBest(streams); btn.disabled = false;
    if (!pick) { openDetail(meta, { videoId: vid }); return; }
    playStream({ meta, video: v, streams }, pick, { startAt: 0 });
  },
};
$$('#calRange [data-days]').forEach((b) => b.addEventListener('click', () => { Calendar.days = Number(b.dataset.days); Calendar.render(); }));

/* ---------------- Effects governor: drops to Low on slow frames or a low battery ---------------- */
const Governor = {
  done: false,
  init() {
    // TVs: the TV layout is built to hold High, so never auto-drop. A TV the governor already dropped goes back to High once.
    if (IS_TV) { if (!Store.get('tvHigh', false)) { Store.set('tvHigh', true); if (CFG.quality === 'low') { CFG.quality = applyPreset('high'); saveCfg(); applyAll(); } } return; }
    if (!CFG.governor) return;
    if (navigator.getBattery) navigator.getBattery().then((b) => { const chk = () => { if (!b.charging && b.level <= 0.2) this.saver('Battery is low'); }; b.addEventListener('levelchange', chk); b.addEventListener('chargingchange', chk); chk(); }).catch(() => {});
    // sample frame pacing during the first seconds of each scroll while effects are on (phones included)
    let sampling = false, slow = 0;
    addEventListener('scroll', () => {
      if (sampling || this.done || CFG.quality === 'low' || !CFG.governor) return; sampling = true;
      let n = 0, last = performance.now(), sum = 0;
      const f = (now) => { sum += now - last; last = now; n++; if (n < 60) requestAnimationFrame(f); else { const avg = sum / n; slow = avg > 26 ? slow + 1 : 0; if (slow >= 2) this.saver('Scrolling was dropping frames'); setTimeout(() => { sampling = false; }, 4000); } };
      requestAnimationFrame(f);
    }, { passive: true });
  },
  saver(why) {
    if (this.done || !CFG.governor) return; this.done = true;
    const changed = CFG.quality !== 'low' || P.amb;
    if (CFG.quality !== 'low') { CFG.quality = 'low'; applyPreset('low'); saveCfg(); applyAll(); }
    if (P.amb && why.startsWith('Battery')) { P.amb = false; $('#pAmb').classList.remove('on'); $('#amb').style.opacity = '0'; }
    if (changed) toast(`${why}, so effects are now Low${why.startsWith('Battery') ? ' and ambilight is off' : ''}. Change it in Settings › Performance.`, 'info', 6000);
  },
};

/* ---------------- Installable app: manifest.webmanifest + sw.js next to index.html ---------------- */
const PWA = {
  prompt: null,
  init() {
    addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.prompt = e; });
    addEventListener('appinstalled', () => { this.prompt = null; toast('MKCinema is installed', 'ok'); });
    let framed = false; try { framed = window.top !== window; } catch (e) { framed = true; }
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !framed) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sw.js not deployed */ });
      // the worker serves the stored app and says when it has stored a newer one
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'mkc:update' && typeof Updater !== 'undefined') Updater.check(true); });
    }
  },
  installed: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  async install() {
    if (this.prompt) { this.prompt.prompt(); await this.prompt.userChoice.catch(() => {}); this.prompt = null; return; }
    toast(PLATFORM === 'ios' ? 'In Safari, tap Share, then Add to Home Screen.' : 'Open your browser menu and choose Install app (or Add to Home screen).', 'info', 7000);
  },
};

/* ---------------- Home layout: what opens first, movies or series, and which rows show ---------------- */
const HOME_ROWS = [['cw', 'Continue watching'], ['picks', 'Your Picks'], ['watchlist', 'My watchlist'], ['catalogs', 'Catalogs from your addons']];
const Layout = {
  get() { return { start: 'home', focus: 'both', hidden: [], traktLists: false, ...(Store.get('homeLayout', {}) || {}) }; },
  set(patch) { Store.set('homeLayout', { ...this.get(), ...patch }); if (S.view === 'home') renderHome(); },
  shows(row) { return !this.get().hidden.includes(row); },
  /* catalogs filtered and ordered by the movies / series focus */
  catalogs(list) {
    const f = this.get().focus;
    if (f === 'movies') return list.filter((c) => c.type !== 'series');
    if (f === 'series') return list.filter((c) => c.type !== 'movie');
    if (f === 'movies-first') return list.slice().sort((a, b) => (a.type === 'movie' ? 0 : 1) - (b.type === 'movie' ? 0 : 1));
    if (f === 'series-first') return list.slice().sort((a, b) => (a.type === 'series' ? 0 : 1) - (b.type === 'series' ? 0 : 1));
    return list;
  },
  /* Trakt's own Watchlist and Collection catalogs repeat My watchlist and are usually empty, so Home leaves them out unless asked */
  traktList(c) { return /trakt/i.test(`${c.addon.manifest.id} ${c.addon.manifest.name}`) && /watchlist|collection/i.test(`${c.id} ${c.name}`); },
  /* First visit: one question, so Home opens on what you actually watch */
  ask() {
    if (Store.get('askedFocus', false) || Store.get('homeLayout', null)) return;
    // wait for the intro, the walkthrough and any open panel to be gone
    if (document.body.classList.contains('intro-on') || document.body.classList.contains('locked') || document.body.classList.contains('layer-open') || !Store.get('toured', false) || $('.sup-ask')) { setTimeout(() => this.ask(), 2000); return; }
    Store.set('askedFocus', true);
    const t = document.createElement('div'); t.className = 'focus-ask glass-solid'; t.setAttribute('role', 'dialog'); t.setAttribute('aria-label', 'Home layout');
    t.innerHTML = `<b>What do you watch most?</b><small>Home puts it first. Change it any time in Settings › Home.</small><div class="inrow">${[['movies-first', 'Movies'], ['series-first', 'Series'], ['both', 'Both']].map(([v, l]) => `<button class="btn btn-ghost btn-sm" type="button" data-focus="${v}">${l}</button>`).join('')}</div>`;
    document.body.appendChild(t);
    $$('[data-focus]', t).forEach((b) => b.addEventListener('click', () => { this.set({ focus: b.dataset.focus }); t.remove(); toast('Home layout saved', 'ok'); if (IS_TV) { tvBackHook(); Nav.settle(); } }));
    if (IS_TV) { tvBackHook(); Nav.settle(); }
    setTimeout(() => { if (t.isConnected) { t.remove(); if (IS_TV) { tvBackHook(); Nav.settle(); } } }, 30000);
  },
};
/* ---------------- Support the creator ----------------
   One Ko-fi link (it takes cards and PayPal). A gentle thank-you shows at most every 21 days, only after real use,
   never during playback, and "Don't ask again" means it. */
const DONATE = { name: 'Dee Lavish', kofi: 'https://ko-fi.com/mkcinema' };
// Ko-fi is the one donation link (one-off or monthly).
const kfBadge = (small) => `<a class="kf-badge${small ? ' sm' : ''}" href="${esc(DONATE.kofi)}" target="_blank" rel="noopener noreferrer" aria-label="Support on Ko-fi"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M3 6.5h13.5v6.2a5.3 5.3 0 0 1-5.3 5.3H8.3A5.3 5.3 0 0 1 3 12.7z"/><path fill="none" stroke="#fff" stroke-width="2" d="M16.5 8h1.2a2.8 2.8 0 0 1 0 5.6h-1.6"/><path fill="#ff5e5b" d="M9.75 9.2c.6-.9 2.4-.7 2.4.8 0 1.3-1.6 2.4-2.4 3-.8-.6-2.4-1.7-2.4-3 0-1.5 1.8-1.7 2.4-.8z"/></svg><span>Support on Ko-fi</span></a>`;
const Support = {
  html() {
    return `<div class="sup">
      <div class="sup-qr">${QR.svg(DONATE.kofi)}<small class="sup-qr-cap">Scan for Ko-fi</small></div>
      <div class="sup-t"><b>Keep MKCinema going</b>
        <div class="free-pledge"><b>Free forever</b><p>MKCinema is free and always will be. No paid plan, no premium tier, no ads and nothing locked, now or later. Every feature is for everyone.</p><p>Donations on Ko-fi are optional and never unlock anything.</p></div>
        <p>MKCinema is built and kept online by ${esc(DONATE.name)}, with no ads, no cookies and no profiles. Donations pay for hosting, the domain and the hours that go into new features. If it has made your movie nights better, a coffee’s worth goes a long way.</p>
        <p class="sup-thanks">Thank you for watching, and for keeping this project alive. · ${esc(DONATE.name.split(' ')[0])}</p>
        <div class="inrow">${kfBadge()}</div>
        <small class="sup-note">Opens Ko-fi’s own secure page (card or PayPal), so MKCinema never sees your payment details.</small>
      </div></div>`;
  },
  maybe() {
    const st = Store.get('support', { opens: 0, at: 0, never: false }); st.opens++; Store.set('support', st);
    if (st.never || st.opens < 4 || Date.now() - st.at < 21 * 86400e3) return;
    setTimeout(() => {
      if (!$('#player').hidden || document.body.classList.contains('layer-open') || $('.focus-ask')) return;
      st.at = Date.now(); Store.set('support', st);
      const t = document.createElement('div'); t.className = 'sup-ask glass-solid'; t.setAttribute('role', 'dialog'); t.setAttribute('aria-label', 'Support MKCinema');
      t.innerHTML = `<button class="ibtn sup-x" type="button" aria-label="Close"><i data-lucide="x"></i></button><b><i data-lucide="heart"></i>Enjoying MKCinema?</b><small>It is made by ${esc(DONATE.name)} and runs on donations, which never unlock anything: MKCinema stays free either way. Thank you for keeping it alive.</small><div class="inrow">${kfBadge(true)}<button class="btn btn-ghost btn-sm" type="button" data-sup="later">Maybe later</button><button class="linkish" type="button" data-sup="never">Don’t ask again</button></div>`;
      document.body.appendChild(t); icons(); if (IS_TV) { tvBackHook(); Nav.settle(); }
      const close = () => { t.remove(); if (IS_TV) { tvBackHook(); Nav.settle(); } };
      $('.sup-x', t).onclick = close; $('[data-sup="later"]', t).onclick = close;
      $('[data-sup="never"]', t).onclick = () => { Store.set('support', { ...Store.get('support', {}), never: true }); close(); };
      t.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { Store.set('support', { ...Store.get('support', {}), at: Date.now() + 60 * 86400e3 }); setTimeout(close, 300); }));
    }, 45000);
  },
};
COMMANDS.push(
  { label: 'Airing calendar', icon: 'calendar-days', run: () => go('calendar') },
  { label: 'Support MKCinema (donate)', icon: 'heart', run: () => openSettings('support') },
  { label: 'Install MKCinema as an app', icon: 'download', run: () => PWA.install() },
  { label: 'Copy my setup code', icon: 'copy', run: async () => copyText(await Cloner.code()) },
);
