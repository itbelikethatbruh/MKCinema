/* ---------------- Channels: your own TV playlists ----------------
   M3U / M3U8 playlists (a link or a file), Xtream logins (server, user name, password) and XMLTV guides, shown in Live TV
   next to channels from addons: groups, favourites, search and a timeline guide. MKCinema ships no channels; a playlist is
   the user's own. Playlist text is cached on this device (Cache Storage) so big lists open instantly.
   Browsers refuse plain http:// on a secure page, so http playlists need the file uploaded or a proxy, and http streams
   open in VLC (or play through the user's own MKCinema server). */
const Channels = {
  CACHE: 'mkc-channels', TTL: 12 * 3600e3,
  data: new Map(),      // list id -> { channels, epg: Map(channelKey -> programmes), at }
  get() { return { lists: [], favs: [], ...(Store.get('channels', {}) || {}) }; },
  save(d) { Store.set('channels', d); if (typeof Account !== 'undefined') Account.schedule(); },
  lists() { return this.get().lists; },
  favs() { return new Set(this.get().favs); },
  key: (ch) => `${ch.list}|${ch.tvgId || ch.name}`,
  toggleFav(k) { const d = this.get(), s = new Set(d.favs); s.has(k) ? s.delete(k) : s.add(k); d.favs = [...s]; this.save(d); },
  xtream(l) {
    const base = String(l.server || '').replace(/\/+$/, ''), q = `username=${encodeURIComponent(l.user || '')}&password=${encodeURIComponent(l.pass || '')}`;
    return { m3u: `${base}/get.php?${q}&type=m3u_plus&output=m3u8`, epg: `${base}/xmltv.php?${q}` };
  },
  src(l) { return l.kind === 'xtream' ? this.xtream(l) : { m3u: l.url, epg: l.epg || '' }; },

  /* ---- fetching ---- */
  async text(url, { gz } = {}) {
    if (!url) throw new Error('No address');
    const tries = [];
    if (!X8.mixedBlocked(url)) tries.push(url);
    if (S.proxy) tries.push(proxify(url));
    if (!tries.length) throw new Error('This address starts with http://, which browsers block on a secure page. Upload the file instead, or set your MKCinema server as the proxy in Addons.');
    let last;
    for (const u of tries) {
      try {
        const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if ((gz || /\.gz(\?|$)/i.test(url)) && window.DecompressionStream) {
          const buf = new Uint8Array(await r.arrayBuffer());
          if (buf[0] === 0x1f && buf[1] === 0x8b) return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
          return new TextDecoder().decode(buf);
        }
        return await r.text();
      } catch (e) { last = e; }
    }
    throw new Error(/Failed to fetch|NetworkError|Load failed/i.test(String(last && last.message)) ? 'The server did not answer, or it blocks requests from web pages (CORS). Upload the playlist file instead, or route it through your MKCinema server.' : String(last && last.message || last));
  },
  async cached(id, kind, fresh, fetcher) {
    const req = new Request(`https://mkc.local/${id}/${kind}`);
    let c = null; try { c = await caches.open(this.CACHE); } catch (e) { /* no Cache Storage */ }
    if (c && !fresh) { const hit = await c.match(req); if (hit && Date.now() - Number(hit.headers.get('x-at') || 0) < this.TTL) return hit.text(); }
    const text = await fetcher();
    if (c) c.put(req, new Response(text, { headers: { 'x-at': String(Date.now()) } })).catch(() => {});
    return text;
  },

  /* ---- parsing ---- */
  parseM3U(text, list) {
    const out = [], lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    let cur = null, group = '', head = lines[0] || '';
    const attr = (s, k) => { const m = s.match(new RegExp(`${k}="([^"]*)"`, 'i')); return m ? m[1].trim() : ''; };
    const epg = attr(head, 'url-tvg') || attr(head, 'x-tvg-url');
    for (const raw of lines) {
      const l = raw.trim(); if (!l) continue;
      if (l.startsWith('#EXTINF')) {
        const name = l.slice(l.lastIndexOf(',') + 1).trim();
        cur = { list: list.id, name: name || attr(l, 'tvg-name') || 'Channel', tvgId: attr(l, 'tvg-id'), logo: attr(l, 'tvg-logo'), group: attr(l, 'group-title') || group, catchup: attr(l, 'catchup') };
      } else if (l.startsWith('#EXTGRP:')) group = l.slice(8).trim();
      else if (l.startsWith('#EXTVLCOPT:') && cur) { const m = l.match(/http-(user-agent|referrer)=(.+)/i); if (m) (cur.headers = cur.headers || {})[m[1].toLowerCase() === 'referrer' ? 'Referer' : 'User-Agent'] = m[2]; }
      else if (!l.startsWith('#')) { if (cur) { cur.url = l; cur.group = cur.group || 'Other'; out.push(cur); } cur = null; }
    }
    return { channels: out, epg };
  },
  /* XMLTV can be tens of megabytes: read it with plain string scans, keep only the next few hours of the channels we have */
  parseXMLTV(text, channels) {
    const want = new Map(), byName = new Map();
    channels.forEach((c) => { if (c.tvgId) want.set(c.tvgId.toLowerCase(), c); byName.set(normTitle(c.name), c); });
    const ids = new Map();
    const chRe = /<channel\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/g; let m;
    while ((m = chRe.exec(text))) {
      const id = m[1].toLowerCase(); if (want.has(id)) { ids.set(id, want.get(id)); continue; }
      const dn = (m[2].match(/<display-name[^>]*>([^<]+)</) || [])[1]; const c = dn && byName.get(normTitle(dn.replace(/&amp;/g, '&'))); if (c) ids.set(id, c);
    }
    const now = Date.now(), lo = now - 3 * 3600e3, hi = now + 8 * 3600e3, map = new Map();
    const t = (s) => { const x = String(s).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/); if (!x) return NaN; const tz = x[7] ? (Number(x[7].slice(0, 3)) * 60 + Math.sign(Number(x[7].slice(0, 3)) || 1) * Number(x[7].slice(3))) : 0; return Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5], +(x[6] || 0)) - tz * 60000; };
    const unx = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").trim();
    const pRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
    while ((m = pRe.exec(text))) {
      const a = m[1], cid = ((a.match(/channel="([^"]+)"/) || [])[1] || '').toLowerCase(); const c = ids.get(cid); if (!c) continue;
      const start = t((a.match(/start="([^"]+)"/) || [])[1]), end = t((a.match(/stop="([^"]+)"/) || [])[1]);
      if (!(end > lo && start < hi)) continue;
      const title = unx((m[2].match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]) || 'Programme';
      const desc = unx((m[2].match(/<desc[^>]*>([\s\S]*?)<\/desc>/) || [])[1]).slice(0, 300);
      const k = this.key(c); if (!map.has(k)) map.set(k, []); map.get(k).push({ title, desc, start, end });
    }
    map.forEach((l) => l.sort((x, y) => x.start - y.start));
    return map;
  },
  async load(l, fresh = false) {
    if (!fresh && this.data.has(l.id)) return this.data.get(l.id);
    const src = this.src(l);
    const text = l.kind === 'file' ? (await this.cached(l.id, 'm3u', false, async () => { throw new Error('Upload the playlist file again'); })) : await this.cached(l.id, 'm3u', fresh, () => this.text(src.m3u));
    const { channels, epg } = this.parseM3U(text, l);
    const d = { channels, epg: new Map(), at: Date.now(), epgUrl: src.epg || epg || '' };
    this.data.set(l.id, d);
    if (d.epgUrl) this.cached(l.id, 'epg', fresh, () => this.text(d.epgUrl)).then((x) => { d.epg = this.parseXMLTV(x, channels); if (S.view === 'tv' && S.tvFilter === `iptv:${l.id}`) this.renderGuide(); }).catch((e) => { d.epgError = e.message; });
    return d;
  },
  all() { return [...this.data.values()].flatMap((d) => d.channels); },

  /* ---- adding and editing ---- */
  openAdd(edit) {
    X8.layer('chAdd', { label: 'Add a playlist', icon: 'list-video', eyebrow: 'Channels' });
    const l = edit || { kind: 'm3u' }, b = X8.body('chAdd');
    const paint = () => {
      b.innerHTML = `<h3 class="x8-h">${edit ? 'Edit playlist' : 'Add your own channels'}</h3>
        <p class="sub">Bring a playlist from a service you subscribe to. MKCinema ships no channels, and your playlist stays on this device${CFG.syncKeys !== false ? ' and in your own account' : ''}.</p>
        <div class="segc" role="radiogroup" aria-label="Playlist type">${[['m3u', 'Playlist link'], ['xtream', 'Xtream login'], ['file', 'Playlist file']].map(([v, t]) => `<button type="button" data-nav data-k="${v}" class="${l.kind === v ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="x8-form">
          <label>Name<input class="inp" id="chName" value="${esc(l.name || '')}" placeholder="My TV" autocomplete="off"></label>
          ${l.kind === 'm3u' ? `<label>Playlist address (.m3u or .m3u8)<input class="inp mono" id="chUrl" value="${esc(l.url || '')}" placeholder="https://…/playlist.m3u" spellcheck="false" autocomplete="off"></label>` : ''}
          ${l.kind === 'xtream' ? `<label>Server<input class="inp mono" id="chServer" value="${esc(l.server || '')}" placeholder="https://provider.example:8080" spellcheck="false" autocomplete="off"></label>
            <div class="x8-2"><label>User name<input class="inp mono" id="chUser" value="${esc(l.user || '')}" autocomplete="off" spellcheck="false"></label><label>Password<input class="inp mono" id="chPass" type="password" value="${esc(l.pass || '')}" autocomplete="off"></label></div>` : ''}
          ${l.kind === 'file' ? `<label>Playlist file<input class="inp" id="chFile" type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/x-mpegurl,application/vnd.apple.mpegurl,text/plain"></label>` : ''}
          ${l.kind !== 'xtream' ? `<label>TV guide (XMLTV, optional)<input class="inp mono" id="chEpg" value="${esc(l.epg || '')}" placeholder="https://…/guide.xml or .xml.gz" spellcheck="false" autocomplete="off"></label>` : '<p class="tour-note">The guide comes from your Xtream login automatically.</p>'}
        </div>
        <p class="tour-note" id="chMsg"></p>
        <div class="actions"><button class="btn btn-prime" type="button" data-nav id="chSave"><i data-lucide="check"></i>${edit ? 'Save' : 'Add playlist'}</button>${edit ? '<button class="btn btn-ghost danger" type="button" data-nav id="chDel"><i data-lucide="trash-2"></i>Remove</button>' : ''}</div>`;
      icons();
      $$('[data-k]', b).forEach((x) => x.addEventListener('click', () => { Object.assign(l, this.readForm(b, l)); l.kind = x.dataset.k; paint(); }));
      $('#chSave').onclick = () => this.submit(b, l, !!edit);
      const del = $('#chDel'); if (del) del.onclick = () => confirmTwice(del, () => { const d = this.get(); d.lists = d.lists.filter((x) => x.id !== l.id); d.favs = d.favs.filter((k) => !k.startsWith(`${l.id}|`)); this.save(d); this.data.delete(l.id); X8.close('chAdd'); S.tvFilter = ''; renderTV(); toast('Playlist removed'); });
    };
    paint(); X8.open('chAdd');
  },
  readForm(b, l) {
    const v = (id) => { const el = $(`#${id}`, b); return el ? el.value.trim() : undefined; };
    const o = {}; [['name', 'chName'], ['url', 'chUrl'], ['server', 'chServer'], ['user', 'chUser'], ['pass', 'chPass'], ['epg', 'chEpg']].forEach(([k, id]) => { const x = v(id); if (x !== undefined) o[k] = x; });
    return o;
  },
  async submit(b, l, edit) {
    Object.assign(l, this.readForm(b, l));
    const msg = $('#chMsg', b), say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? 'var(--bad)' : ''; };
    if (l.kind === 'm3u' && !/^https?:\/\//i.test(l.url || '')) return say('Paste the full playlist address, starting with https:// or http://', true);
    if (l.kind === 'xtream' && (!/^https?:\/\//i.test(l.server || '') || !l.user || !l.pass)) return say('Fill in the server address (with http:// or https://), the user name and the password.', true);
    l.id = l.id || `p${Date.now().toString(36)}`; l.name = l.name || (l.kind === 'xtream' ? (l.server || '').replace(/^https?:\/\//, '').split(/[:/]/)[0] : 'My channels');
    say('Reading the playlist…');
    try {
      if (l.kind === 'file') {
        const f = $('#chFile', b).files[0];
        if (!f && !edit) return say('Choose the playlist file first.', true);
        if (f) { const text = await f.text(); await this.cached(l.id, 'm3u', true, async () => text); }
        l.fileName = f ? f.name : l.fileName;
      }
      this.data.delete(l.id);
      const d = await this.load(l, true);
      if (!d.channels.length) throw new Error('No channels found in that playlist');
      const all = this.get(); all.lists = [...all.lists.filter((x) => x.id !== l.id), { ...l }]; this.save(all);
      X8.close('chAdd'); S.tvFilter = `iptv:${l.id}`; go('tv'); renderTV();
      toast(`${d.channels.length} channels added`, 'ok');
    } catch (e) { say(e.message, true); }
  },

  /* ---- Live TV guide ---- */
  st: { group: '', q: '', page: 1 },
  chips() {
    const box = $('#tvSources'); if (!box || $('#chAddChip')) return;
    const mine = this.lists().map((l) => `<button class="chip ${S.tvFilter === `iptv:${l.id}` ? 'on' : ''}" type="button" data-nav data-iptv="${esc(l.id)}"><i data-lucide="list-video"></i>${esc(l.name)}</button>`).join('');
    box.insertAdjacentHTML('beforeend', `${mine}<button class="chip" type="button" data-nav id="chAddChip"><i data-lucide="plus"></i>Add playlist</button><button class="chip" type="button" data-nav id="chSplitChip"><i data-lucide="layout-grid"></i>Split Screen</button>`);
    $$('[data-iptv]', box).forEach((b) => b.addEventListener('click', () => { S.tvFilter = `iptv:${b.dataset.iptv}`; this.st = { group: '', q: '', page: 1 }; renderTV(); }));
    $('#chAddChip').onclick = () => this.openAdd();
    $('#chSplitChip').onclick = () => Split.open();
    icons();
  },
  addonChips() {
    const cats = engine.catalogs({ type: 'tv' }).concat(engine.catalogs({ type: 'channel' }));
    const providers = [...new Set(cats.map((c) => c.addon))];
    $('#tvSources').innerHTML = (providers.length ? [['', 'All sources'], ...providers.map((a) => [a.baseUrl, a.manifest.name])] : []).map(([v, l]) => `<button class="chip" type="button" data-nav data-src="${esc(v)}">${esc(l)}</button>`).join('');
    $$('#tvSources [data-src]').forEach((b) => b.addEventListener('click', () => { S.tvFilter = b.dataset.src; renderTV(); }));
  },
  async renderGuide() {
    const id = S.tvFilter.slice(5), l = this.lists().find((x) => x.id === id), epg = $('#epg');
    if (!l) { S.tvFilter = ''; return renderTV(); }
    if (!this.data.has(id)) epg.innerHTML = '<div style="padding:22px" class="status-line"><span class="spin"></span>Reading your playlist…</div>';
    let d; try { d = await this.load(l); } catch (e) {
      epg.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle"></i><h3>${esc(l.name)} could not be read</h3><p>${esc(e.message)}</p><div class="actions"><button class="btn btn-ghost" type="button" data-nav id="chRetry"><i data-lucide="refresh-cw"></i>Try again</button><button class="btn btn-ghost" type="button" data-nav id="chEdit"><i data-lucide="pencil"></i>Edit playlist</button></div></div>`;
      icons(); $('#chRetry').onclick = () => { this.data.delete(id); this.renderGuide(); }; $('#chEdit').onclick = () => this.openAdd(l); return;
    }
    const favs = this.favs(), groups = [...new Set(d.channels.map((c) => c.group))].sort((a, b) => a.localeCompare(b));
    const q = normTitle(this.st.q);
    let list = d.channels.filter((c) => (this.st.group === '★' ? favs.has(this.key(c)) : !this.st.group || c.group === this.st.group) && (!q || normTitle(c.name).includes(q)));
    const total = list.length, per = IS_TV ? 40 : 80; list = list.slice(0, per * this.st.page);
    const PX = IS_TV ? 7 : 8, now = Date.now(), t0 = Math.floor((now - 30 * 60000) / (30 * 60000)) * 30 * 60000, span = 180, t1 = t0 + span * 60000, x = (t) => ((t - t0) / 60000) * PX;
    const times = Array.from({ length: span / 30 }, (_, i) => `<span style="width:${30 * PX}px">${new Date(t0 + i * 30 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`).join('');
    const hm = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const rows = list.map((c, i) => {
      const k = this.key(c), progs = (d.epg.get(k) || []).filter((p) => p.end > t0 && p.start < t1);
      const blocks = (progs.length ? progs : [{ title: c.group ? `Live · ${c.group}` : 'Live', start: t0, end: t1, none: true }]).map((p) => {
        const left = Math.max(0, x(p.start)), w = Math.min(x(p.end), span * PX) - left, on = p.start <= now && now < p.end;
        return `<button class="epg-prog ${on ? 'now' : ''}" type="button" data-nav data-ci="${i}" style="left:${left}px;width:${Math.max(30, w - 4)}px" title="${esc(p.desc || p.title)}"><b>${esc(p.title)}</b><small>${p.none ? esc(c.name) : `${hm(p.start)}–${hm(p.end)}`}</small></button>`;
      }).join('');
      return `<div class="epg-row"><div class="epg-ch ch-cell"><button class="ch-tune" type="button" data-nav data-ci="${i}">${c.logo ? `<img src="${esc(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="ch-mono">${esc((c.name || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase())}</span>`}<span><b>${esc(c.name)}</b><small>${esc(c.group)}</small></span></button><button class="ch-fav ${favs.has(k) ? 'on' : ''}" type="button" data-nav data-fav="${i}" aria-label="${favs.has(k) ? 'Remove from' : 'Add to'} favourites"><i data-lucide="star"></i></button></div><div class="epg-track">${blocks}</div></div>`;
    }).join('');
    epg.innerHTML = `<div class="ch-bar">
        <div class="ch-search"><i data-lucide="search"></i><input class="inp" id="chQ" type="search" placeholder="Find a channel in ${esc(l.name)}" value="${esc(this.st.q)}" autocomplete="off"></div>
        <select class="sel" id="chGroup" aria-label="Group"><option value="">All groups · ${d.channels.length}</option><option value="★" ${this.st.group === '★' ? 'selected' : ''}>★ Favourites · ${d.channels.filter((c) => favs.has(this.key(c))).length}</option>${groups.map((g) => `<option value="${esc(g)}" ${this.st.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>
        <button class="btn btn-ghost btn-sm" type="button" data-nav id="chRefresh" title="Read the playlist again"><i data-lucide="refresh-cw"></i>Refresh</button>
        <button class="btn btn-ghost btn-sm" type="button" data-nav id="chEdit"><i data-lucide="pencil"></i>Edit</button>
      </div>
      ${d.epgError ? `<p class="tour-note ch-note">The guide could not be read (${esc(d.epgError)}). Channels still play.</p>` : !d.epgUrl ? '<p class="tour-note ch-note">No TV guide for this playlist. Add an XMLTV address under Edit to see what is on.</p>' : ''}
      ${list.length ? `<div class="epg-scroll"><div class="epg-grid"><div class="epg-times">${times}</div>${rows}<div class="epg-now" style="left:${220 + x(now)}px"></div></div></div>` : `<div class="empty" style="margin:16px">${this.st.group === '★' ? 'Star a channel to keep it here.' : 'No channels match.'}</div>`}
      ${total > list.length ? `<div class="actions" style="justify-content:center;margin:14px 0"><button class="btn btn-ghost" type="button" data-nav id="chMore">Show more · ${total - list.length} left</button></div>` : ''}`;
    icons();
    const sc = $('#epg .epg-scroll'); if (sc) sc.scrollLeft = Math.max(0, x(now) - 120);
    $$('#epg [data-ci]').forEach((b) => b.addEventListener('click', () => this.tune(list[Number(b.dataset.ci)])));
    $$('#epg [data-fav]').forEach((b) => b.addEventListener('click', () => { const c = list[Number(b.dataset.fav)]; this.toggleFav(this.key(c)); const on = this.favs().has(this.key(c)); b.classList.toggle('on', on); toast(on ? `${c.name} added to favourites` : `${c.name} removed from favourites`, 'ok', 1800, 'chfav'); }));
    const qi = $('#chQ'); qi.addEventListener('input', debounce(() => { this.st.q = qi.value; this.st.page = 1; this.renderGuide().then(() => { const n = $('#chQ'); if (n && !TOUCH_UI) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 250));
    $('#chGroup').onchange = (e) => { this.st.group = e.target.value; this.st.page = 1; this.renderGuide(); };
    $('#chRefresh').onclick = async () => { this.data.delete(id); toast('Reading the playlist again…', 'info', 1800, 'chr'); await this.load(l, true).catch(() => {}); this.renderGuide(); };
    $('#chEdit').onclick = () => this.openAdd(l);
    const more = $('#chMore'); if (more) more.onclick = () => { this.st.page++; this.renderGuide(); };
  },
  stream(c) {
    const st = { name: (this.lists().find((l) => l.id === c.list) || {}).name || 'Channels', title: c.name, url: c.url, _addon: 'Channels', behaviorHints: c.headers ? { proxyHeaders: { request: c.headers } } : {} };
    st._tel = Telemetry.parse(st); return st;
  },
  meta(c) { return remember({ id: `iptv:${hash(this.key(c)).toString(36)}`, type: 'tv', name: c.name, poster: c.logo, logo: c.logo, background: c.logo, genres: c.group ? [c.group] : [], _iptv: c }); },
  tune(c) {
    if (!c) return;
    const st = this.stream(c), meta = this.meta(c);
    if (X8.mixedBlocked(c.url) && !S.proxy) {
      // the page is https and the channel is http: the browser would refuse it, so offer the outside players straight away
      X8.layer('chExt', { label: 'Open in another player', icon: 'external-link', eyebrow: 'Channels' });
      const b = X8.body('chExt');
      b.innerHTML = `<h3 class="x8-h">${esc(c.name)} needs another player</h3><p class="sub">This channel is sent over plain http://, which browsers refuse on a secure page. Open it in VLC or another player, or set your MKCinema server as the proxy in Addons to play it here.</p><div class="actions x8-wrap">${handoffHTML(st)}</div>`;
      $$('[data-copy]', b).forEach((x) => x.addEventListener('click', () => copyText(x.dataset.copy)));
      $$('[data-m3u]', b).forEach((x) => x.addEventListener('click', () => downloadM3U(x.dataset.m3u, c.name)));
      icons(); X8.open('chExt'); void meta;
      return;
    }
    if (X8.mixedBlocked(c.url) && S.proxy) st.url = proxify(c.url, c.headers);
    playStream({ meta, video: null, streams: [st] }, st);
  },
  init() {
    const base = renderTV;
    renderTV = async function () {
      if (S.tvFilter && S.tvFilter.startsWith('iptv:')) { Channels.addonChips(); Channels.chips(); return Channels.renderGuide(); }
      const r = await base.apply(this, arguments);
      Channels.chips();
      const empty = $('#tvAddAddon');
      if (empty && !$('#tvAddList')) {
        empty.insertAdjacentHTML('afterend', '<button class="btn btn-ghost" type="button" data-nav id="tvAddList"><i data-lucide="list-video"></i>Add your own playlist</button>');
        const p = empty.parentElement.querySelector('p'); if (p) p.textContent = 'MKCinema ships no channels of its own. Add a playlist from a TV service you subscribe to (M3U, Xtream or XMLTV), or install a Stremio addon that provides TV channels.';
        $('#tvAddList').onclick = () => Channels.openAdd(); icons();
      }
      return r;
    };
    // Setup Cloner and account sync carry the playlists; Xtream passwords travel only when key sync is on
    const ex = exportData;
    exportData = function () { const d = ex.apply(this, arguments); const c = Channels.get(); d.channels = { ...c, lists: c.lists.map((l) => (CFG.syncKeys === false ? { ...l, pass: '' } : l)) }; return d; };
    const ap = Account.applyRemote.bind(Account);
    Account.applyRemote = function (d) {
      ap(d);
      if (d && d.channels && Array.isArray(d.channels.lists)) {
        const mine = Channels.get(), byId = new Map(mine.lists.map((l) => [l.id, l]));
        d.channels.lists.forEach((l) => { const had = byId.get(l.id); byId.set(l.id, { ...l, pass: l.pass || (had && had.pass) || '' }); });
        Channels.save({ lists: [...byId.values()], favs: [...new Set([...(mine.favs || []), ...(d.channels.favs || [])])] });
      }
    };
    COMMANDS.push({ label: 'Add a TV playlist (M3U, Xtream)', icon: 'list-video', run: () => { go('tv'); Channels.openAdd(); } }, { label: 'Split Screen: up to four at once', icon: 'layout-grid', run: () => Split.open() });
  },
};

/* ---------------- Split Screen ----------------
   Up to four live channels or streams side by side (two on a TV, whose decoder can rarely run more). One tile has the
   sound: tap or select it to move the sound there. Tiles use their own <video> elements and hls.js instances and are torn
   down completely on close, so nothing keeps downloading in the background. */
const Split = {
  tiles: [], focus: 0, max: () => (IS_TV || matchMedia('(max-width: 760px)').matches ? 2 : 4),
  el: null,
  build() {
    this.el = X8.layer('splitLayer', { label: 'Split Screen', full: true });
    X8.onClose.splitLayer = () => this.stopAll();
    X8.backHook.splitLayer = () => { const s = $('#splitPick'); if (s && !s.hidden) { s.hidden = true; Nav.settle(); return true; } return false; };
  },
  open(seed) {
    if (!this.el) this.build();
    if (!$('#player').hidden) closePlayer();
    if (seed) this.add(seed);
    this.paint(); X8.open('splitLayer');
    if (!this.tiles.length) this.pick();
  },
  paint() {
    const box = X8.body('splitLayer'), n = this.tiles.length;
    box.innerHTML = `<div class="sp-top"><span class="pk-mark">Split Screen</span><span class="sp-hint">${n ? 'Select a tile to give it the sound' : 'Pick up to ' + this.max() + ' channels or streams'}</span><span class="sp-sp"></span>
        ${n < this.max() ? '<button class="btn btn-ghost btn-sm" type="button" data-nav id="spAdd"><i data-lucide="plus"></i>Add</button>' : ''}
        <button class="ibtn" type="button" data-nav data-x8close aria-label="Close Split Screen"><i data-lucide="x"></i></button></div>
      <div class="sp-grid n${Math.max(1, n)}" id="spGrid"></div>
      <div class="sp-pick x8-sub" id="splitPick" hidden></div>`;
    const grid = $('#spGrid', box);
    this.tiles.forEach((t, i) => {
      const cell = document.createElement('div'); cell.className = `sp-tile${i === this.focus ? ' on' : ''}`;
      cell.innerHTML = `<button class="sp-hit" type="button" data-nav data-sf="${i}" aria-label="Sound from ${esc(t.name)}"></button><div class="sp-cap"><i data-lucide="${i === this.focus ? 'volume-2' : 'volume-x'}"></i><b>${esc(t.name)}</b></div><button class="ibtn sp-x" type="button" data-nav data-sx="${i}" aria-label="Remove ${esc(t.name)}"><i data-lucide="x"></i></button><div class="sp-msg" ${t.err ? '' : 'hidden'}>${esc(t.err || '')}</div>`;
      cell.prepend(t.v); grid.appendChild(cell);
      t.v.muted = i !== this.focus;
    });
    if (!n) grid.innerHTML = '<div class="empty-state"><i data-lucide="layout-grid"></i><h3>Nothing on yet</h3><p>Add channels from your playlists, or paste any stream link.</p></div>';
    icons();
    $$('[data-sf]', box).forEach((b) => b.addEventListener('click', () => { this.focus = Number(b.dataset.sf); this.paint(); }));
    $$('[data-sx]', box).forEach((b) => b.addEventListener('click', () => this.remove(Number(b.dataset.sx))));
    const add = $('#spAdd', box); if (add) add.onclick = () => this.pick();
    if (IS_TV) Nav.settle();
  },
  async pick() {
    const box = $('#splitPick'); if (!box) return;
    const lists = Channels.lists();
    await Promise.allSettled(lists.map((l) => Channels.load(l)));
    const favs = Channels.favs(), all = Channels.all(), sorted = all.slice().sort((a, b) => favs.has(Channels.key(b)) - favs.has(Channels.key(a)));
    const draw = (q) => {
      const nq = normTitle(q), hits = sorted.filter((c) => !nq || normTitle(c.name).includes(nq)).slice(0, 60);
      $('#spList').innerHTML = hits.map((c, i) => `<button type="button" class="sp-item" data-nav data-pi="${all.indexOf(c)}">${c.logo ? `<img src="${esc(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '<i data-lucide="tv"></i>'}<span><b>${favs.has(Channels.key(c)) ? '★ ' : ''}${esc(c.name)}</b><small>${esc(c.group)}</small></span></button>`).join('') || `<p class="sub">${all.length ? 'No channels match.' : 'No playlists yet. Add one in Live TV, or paste a stream link above.'}</p>`;
      icons(); $$('#spList [data-pi]').forEach((b) => b.addEventListener('click', () => { const c = all[Number(b.dataset.pi)]; box.hidden = true; this.add({ name: c.name, url: c.url, headers: c.headers }); }));
    };
    box.innerHTML = `<div class="modal glass-solid pp-modal"><h3 class="x8-h">Add to Split Screen</h3>
      <div class="inrow"><input class="inp mono" id="spUrl" placeholder="Paste a stream link (.m3u8 or video)" autocomplete="off" spellcheck="false"><button class="btn btn-prime" type="button" data-nav id="spUrlGo">Add</button></div>
      <div class="ch-search" style="margin-top:12px"><i data-lucide="search"></i><input class="inp" id="spQ" type="search" placeholder="Find a channel" autocomplete="off"></div>
      <div class="sp-list" id="spList"></div><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-nav id="spPickClose">Close</button></div></div>`;
    box.hidden = false; draw('');
    $('#spQ').addEventListener('input', (e) => draw(e.target.value));
    $('#spUrl').addEventListener('keydown', (e) => e.stopPropagation()); $('#spQ').addEventListener('keydown', (e) => { if (!/^Arrow(Up|Down)$/.test(e.key)) e.stopPropagation(); });
    $('#spUrlGo').onclick = () => { const u = $('#spUrl').value.trim(); if (!/^https?:\/\//i.test(u)) { toast('Paste a full link starting with https://', 'err'); return; } box.hidden = true; this.add({ name: u.split('/').pop().split('?')[0] || 'Stream', url: u }); };
    $('#spPickClose').onclick = () => { box.hidden = true; if (IS_TV) Nav.settle(); };
    icons(); if (IS_TV) Nav.settle();
  },
  add(src) {
    if (this.tiles.length >= this.max()) { toast(`Split Screen holds ${this.max()} at a time here`, 'err'); return; }
    const v = document.createElement('video'); v.playsInline = true; v.autoplay = true; v.className = 'sp-v';
    const t = { ...src, v, hls: null, err: '' }; this.tiles.push(t);
    if (this.tiles.length === 1) this.focus = 0;
    let url = src.url;
    if (X8.mixedBlocked(url)) { if (S.proxy) url = proxify(url, src.headers); else t.err = 'Plain http:// links need your MKCinema server as the proxy (Addons › MKCinema proxy).'; }
    else if (src.headers && S.proxy) url = proxify(url, src.headers);
    if (!t.err) {
      const fail = () => { t.err = 'This stream did not play here.'; if (this.el && !this.el.hidden) this.paint(); };
      v.addEventListener('error', fail, { once: true });
      if (/\.m3u8(\?|$)/i.test(url) && !v.canPlayType('application/vnd.apple.mpegurl')) {
        HlsLoad.get().then((Hls) => { if (!this.tiles.includes(t)) return; if (!Hls.isSupported()) return fail(); t.hls = new Hls({ maxBufferLength: 12, backBufferLength: 10, capLevelToPlayerSize: true }); t.hls.on(Hls.Events.ERROR, (e, d) => { if (d.fatal) fail(); }); t.hls.loadSource(url); t.hls.attachMedia(v); }).catch(fail);
      } else v.src = url;
      v.play().catch(() => {});
    }
    this.paint();
  },
  stop(t) { try { if (t.hls) t.hls.destroy(); } catch (e) { /* gone */ } t.v.pause(); t.v.removeAttribute('src'); t.v.load(); },
  remove(i) { const t = this.tiles[i]; if (!t) return; this.stop(t); this.tiles.splice(i, 1); if (this.focus >= this.tiles.length) this.focus = 0; this.paint(); },
  stopAll() { this.tiles.forEach((t) => this.stop(t)); this.tiles = []; this.focus = 0; },
};
Channels.init();
