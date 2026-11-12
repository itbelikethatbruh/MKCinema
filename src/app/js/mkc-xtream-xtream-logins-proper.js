
'use strict';
/* ---------------- 2.63 Xtream logins, the proper way ----------------
   An Xtream login now talks to the service's own API (player_api.php) instead of turning it into a playlist link:
   the account (active or not, expiry, screens in use), live channels in their categories, Catch-up (past programmes
   on channels that keep them), Movies and Series with their seasons and episodes. A service that has no API still
   falls back to its playlist (get.php), as before.
   Android and Android TV app 1.10.0 and later: the app fetches the person's own TV servers itself (only the servers
   typed into Add playlist, see MKAndroid.iptvHosts), so plain http:// services and services without CORS work, and
   channels, catch-up, films and episodes play in the app's own player (MPEG-TS, HLS, every audio track).
   In a browser nothing changes about what browsers allow: an https:// service that permits web pages works,
   a plain http:// one still needs the playlist file, the MKCinema server, or the Android app. */
(() => {
  if (typeof Channels === 'undefined' || typeof playStream !== 'function') return;
  const C = Channels;

  /* ---------- the app fetches the person's own TV servers ---------- */
  C.nat = () => { try { return !!(window.MKAndroid && typeof MKAndroid.iptvHosts === 'function'); } catch (e) { return false; } };
  // the saved playlists, plus the one being added or edited right now (Channels.submit)
  const mineAll = () => (C._draft ? [...C.lists(), C._draft] : C.lists());
  C.allow = function () {
    if (!this.nat()) return;
    const urls = [];
    mineAll().forEach((l) => { [l.server, l.url, l.epg].forEach((u) => { if (/^https?:\/\//i.test(String(u || ''))) urls.push(String(u).trim()); }); });
    const key = JSON.stringify(urls);
    if (key === this._allowed) return;
    try { if (MKAndroid.iptvHosts(key) >= 0) this._allowed = key; } catch (e) { /* older app */ }
  };
  const hostIn = (url) => { try { const h = new URL(url).hostname.toLowerCase(); return mineAll().some((l) => [l.server, l.url, l.epg].some((u) => { try { return new URL(u).hostname.toLowerCase() === h; } catch (e) { return false; } })); } catch (e) { return false; } };
  const save0 = C.save.bind(C);
  C.save = function (d) { save0(d); this.allow(); };

  // fetching: in the app, the person's own servers are asked directly (any scheme, no CORS needed)
  const text0 = C.text.bind(C);
  C.text = async function (url, opt) {
    if (!(this.nat() && hostIn(url))) {
      try { return await text0(url, opt); } catch (e) {
        if (/^http:\/\//i.test(url) || /CORS/.test(e.message)) e.message += ' The MKCinema app for Android and Android TV reads any TV service directly.';
        throw e;
      }
    }
    this.allow();
    let r;
    try { r = await fetch(url, { cache: 'no-store', credentials: 'omit' }); } catch (e) { throw new Error('The TV service did not answer. Check the address (and its port), then try again.'); }
    if (!r.ok) throw new Error(`The TV service answered with an error (HTTP ${r.status}).`);
    if (((opt && opt.gz) || /\.gz(\?|$)/i.test(url)) && window.DecompressionStream) {
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf[0] === 0x1f && buf[1] === 0x8b) return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      return new TextDecoder().decode(buf);
    }
    return r.text();
  };

  /* ---------- the Xtream API ---------- */
  const b64 = (s) => { try { return decodeURIComponent(escape(atob(String(s || '')))); } catch (e) { return String(s || ''); } };
  const arr = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);
  const Xt = {
    base: (l) => String(l.server || '').trim().replace(/\/+$/, '').replace(/\/(player_api|get|xmltv|panel_api)\.php.*$/i, ''),
    q: (l) => `username=${encodeURIComponent(l.user || '')}&password=${encodeURIComponent(l.pass || '')}`,
    async api(l, action, extra = '') {
      const t = await C.text(`${this.base(l)}/player_api.php?${this.q(l)}${action ? `&action=${action}` : ''}${extra}`);
      try { return JSON.parse(t); } catch (e) { const err = new Error('not-xtream'); err.nx = true; throw err; }
    },
    async login(l) {
      let j;
      try { j = await this.api(l, ''); } catch (e) { if (e.nx || /HTTP (40[0-9]|41[0-9])\b/.test(e.message)) { const x = new Error('not-xtream'); x.nx = true; throw x; } throw e; }
      if (!j || typeof j !== 'object' || !j.user_info) { const x = new Error('not-xtream'); x.nx = true; throw x; }
      if (String(j.user_info.auth) === '0') { const x = new Error('The TV service turned down that user name or password.'); x.auth = true; throw x; }
      return j;
    },
    seg: (s) => encodeURIComponent(String(s || '')),
    path(l, kind, id, ext) { return `${this.base(l)}/${kind}/${this.seg(l.user)}/${this.seg(l.pass)}/${encodeURIComponent(String(id))}.${String(ext || 'ts').replace(/[^a-z0-9]/gi, '') || 'ts'}`; },
    liveExt(info) {
      const f = arr(info && info.user_info && info.user_info.allowed_output_formats).map(String);
      if (C.nat() && (!f.length || f.includes('ts'))) return 'ts';   // the app's player plays MPEG-TS, with the least delay
      return !f.length || f.includes('m3u8') ? 'm3u8' : 'ts';
    },
    async live(l, info) {
      const [cats, streams] = await Promise.all([this.api(l, 'get_live_categories').catch(() => []), this.api(l, 'get_live_streams')]);
      const cn = new Map(arr(cats).map((c) => [String(c.category_id), String(c.category_name || '').trim()]));
      const ext = this.liveExt(info);
      return arr(streams).filter((s) => s && s.stream_id != null).map((s) => ({
        list: l.id, name: String(s.name || 'Channel').trim(), tvgId: String(s.epg_channel_id || ''), logo: String(s.stream_icon || ''),
        group: cn.get(String(s.category_id)) || 'Other', url: this.path(l, 'live', s.stream_id, ext), xid: s.stream_id,
        archive: Number(s.tv_archive) === 1 ? Math.max(1, Number(s.tv_archive_duration) || 1) : 0,
      }));
    },
    account(info) {
      const u = (info && info.user_info) || {}, out = [];
      const st = String(u.status || '').trim(), bad = st && !/^active$/i.test(st);
      if (st) out.push(`<b>${esc(st)}</b>`);
      const exp = Number(u.exp_date);
      if (exp > 0) { const d = new Date(exp * 1000); out.push(`${d < new Date() ? 'ended' : 'until'} ${esc(d.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric' }))}`); }
      else if (u.exp_date === null || u.exp_date === '' || u.exp_date === '0') out.push('no end date');
      const max = Number(u.max_connections);
      if (max > 0) out.push(`${Number(u.active_cons) || 0} of ${max} screen${max === 1 ? '' : 's'} in use`);
      if (String(u.is_trial) === '1') out.push('trial');
      return out.length ? `<p class="tour-note xt-acct${bad ? ' bad' : ''}">Account: ${out.join(' · ')}</p>` : '';
    },
  };
  window.MkXtream = Xt;

  C.xtream = function (l) { const base = Xt.base(l), q = Xt.q(l); return { m3u: `${base}/get.php?${q}&type=m3u_plus&output=${C.nat() ? 'ts' : 'm3u8'}`, epg: `${base}/xmltv.php?${q}` }; };

  // loading a list: Xtream logins use the API first, everything else (and services without the API) as before
  const load0 = C.load.bind(C);
  C.load = async function (l, fresh = false) {
    if (!fresh && this.data.has(l.id)) return this.data.get(l.id);
    this.allow();
    if (l.kind === 'xtream') {
      let info = null;
      let why = null;
      try { info = await Xt.login(l); } catch (e) { if (e.auth) throw e; why = e; }
      // no API answer: the service's playlist (get.php), and if that fails too, the first reason
      if (!info) { try { return await load0(l, fresh); } catch (e2) { throw why && !why.nx ? why : e2; } }
      if (info) {
        const raw = await this.cached(l.id, 'xt-live', fresh, async () => JSON.stringify(await Xt.live(l, info)));
        let channels = []; try { channels = JSON.parse(raw); } catch (e) { channels = []; }
        const d = { channels, epg: new Map(), at: Date.now(), epgUrl: this.xtream(l).epg, xt: info };
        this.data.set(l.id, d);
        this.cached(l.id, 'epg', fresh, () => this.text(d.epgUrl)).then((x) => { d.epg = this.parseXMLTV(x, channels); if (S.view === 'tv' && S.tvFilter === `iptv:${l.id}` && (this.st.mode || 'live') === 'live') this.renderGuide(); }).catch((e) => { d.epgError = e.message; });
        return d;
      }
    }
    return load0(l, fresh);
  };

  /* ---------- playing: the app's own player when there is one ---------- */
  let natCur = null;
  const hookDone = () => {
    const N = window.MKNative; if (!N || N._xt) return;
    const done0 = N.done;
    N.done = function (pos, dur, ended, next, err) {
      if (natCur && !(typeof TvPlayer !== 'undefined' && TvPlayer.cur)) {
        const c = natCur; natCur = null;
        if (err && !(pos > 0)) {
          // the in-app player can't read MPEG-TS, so a live channel is asked for as HLS
          const st = { ...c.st, url: c.st.url.replace(/(\/live\/[^?#]+)\.ts$/, '$1.m3u8'), _noNative: true };
          if (!X8.mixedBlocked(st.url)) { toast('Playing in the MKCinema player instead', 'info', 3000); playStream({ meta: c.meta, video: null, streams: [st] }, st); }
          else toast(`${c.meta.name} would not play. The service may be busy or the channel offline.`, 'err', 6000);
        }
        return;
      }
      return done0.apply(this, arguments);
    };
    N._xt = true;
  };
  C.playNative = function (st, meta, sub = '') {
    if (!this.nat() || CFG.iptvPlayer === 'web') return false;
    try { if (typeof MKAndroid.play !== 'function') return false; } catch (e) { return false; }
    hookDone();
    const h = st.behaviorHints && st.behaviorHints.proxyHeaders && st.behaviorHints.proxyHeaders.request;
    let ok = false;
    try { ok = MKAndroid.play(JSON.stringify({ url: st.url, title: meta.name || '', sub, startMs: 0, matchRate: CFG.matchRate !== false, audioLang: CFG.audioOnly || '', headers: h && Object.keys(h).length ? h : undefined })); } catch (e) { ok = false; }
    if (ok) natCur = { st, meta };
    return ok;
  };
  C.playAny = function (st, meta, sub) {
    if (this.playNative(st, meta, sub)) return;
    if (X8.mixedBlocked(st.url) && !this.nat()) return this.tune({ list: st._list, name: meta.name, url: st.url, group: sub || '' }, meta);
    st._noNative = true;   // TV app players older than 1.10 would be asked through the proxy
    playStream({ meta, video: null, streams: [st] }, st);
  };
  const tune0 = C.tune.bind(C);
  C.tune = function (c, metaIn) {
    if (!c) return;
    if (this.nat() && c.url) {
      const st = this.stream(c), meta = metaIn || this.meta(c);
      if (this.playNative(st, meta, c.group || '')) return;
      // inside the app the page may load the stream itself, so there is no need for the outside-player step
      st._noNative = true; playStream({ meta, video: null, streams: [st] }, st); return;
    }
    return tune0(c);
  };

  // films and episodes from a TV service are not addon titles: keep them out of Continue watching
  if (typeof saveProgress === 'function') {
    const sp0 = saveProgress;
    saveProgress = function () { if (P.ctx && P.ctx.meta && /^xtv:/.test(String(P.ctx.meta.id || ''))) return; return sp0.apply(this, arguments); };
  }

  /* ---------- Live · Catch-up · Movies · Series ---------- */
  const TABS = [['live', 'Live TV', 'tv'], ['catchup', 'Catch-up', 'history'], ['vod', 'Movies', 'film'], ['series', 'Series', 'clapperboard']];
  const tabsHTML = (mode) => `<div class="segc xt-tabs" role="tablist" aria-label="What to show">${TABS.map(([k, t]) => `<button type="button" data-nav data-xtab="${k}" class="${mode === k ? 'on' : ''}" role="tab" aria-selected="${mode === k}">${t}</button>`).join('')}</div>`;
  const bindTabs = (box) => $$('[data-xtab]', box).forEach((b) => b.addEventListener('click', () => { C.st = { group: '', q: '', page: 1, mode: b.dataset.xtab, cat: '' }; C.renderGuide(); }));
  const cache = new Map();   // `${list}|${what}` -> data, for this visit
  const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; })); return cache.get(key); };

  const rg0 = C.renderGuide.bind(C);
  C.renderGuide = async function () {
    const id = S.tvFilter.slice(5), l = this.lists().find((x) => x.id === id), epg = $('#epg');
    if (!l || !epg) return rg0();
    const mode = this.st.mode || 'live';
    const d = this.data.get(id);
    if (l.kind !== 'xtream' || (d && !d.xt)) return rg0();
    const tabs = () => { const dd = this.data.get(id), bar = $('#epg .ch-bar'); if (dd && dd.xt && bar && !$('#epg .xt-tabs')) { bar.insertAdjacentHTML('beforebegin', tabsHTML('live') + Xt.account(dd.xt)); bindTabs(epg); } };
    if (!d) { await rg0(); const d2 = this.data.get(id); if (!d2 || !d2.xt) return; if (mode === 'live') return tabs(); return this.renderGuide(); }
    if (mode === 'live') { await rg0(); return tabs(); }
    epg.innerHTML = `${tabsHTML(mode)}${Xt.account(d.xt)}<div id="xtBody"><div style="padding:22px" class="status-line"><span class="spin"></span>Loading…</div></div>`;
    bindTabs(epg); icons();
    try {
      if (mode === 'catchup') await this.xtCatchup(l, d);
      else await this.xtVod(l, d, mode);
    } catch (e) {
      const b = $('#xtBody'); if (b) b.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle"></i><h3>That could not be loaded</h3><p>${esc(e.message)}</p></div>`;
      icons();
    }
  };

  const barHTML = (ph, cats, cur) => `<div class="ch-bar">
      <div class="ch-search"><i data-lucide="search"></i><input class="inp" id="xtQ" type="search" placeholder="${esc(ph)}" value="${esc(C.st.q || '')}" autocomplete="off"></div>
      ${cats ? `<select class="sel" id="xtCat" aria-label="Category">${cats.map(([v, t]) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}
    </div>`;
  const bindBar = (again) => {
    const qi = $('#xtQ'); if (qi) qi.addEventListener('input', debounce(() => { C.st.q = qi.value; C.st.page = 1; again().then(() => { const n = $('#xtQ'); if (n && !TOUCH_UI) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 250));
    const cs = $('#xtCat'); if (cs) cs.onchange = (e) => { C.st.cat = e.target.value; C.st.page = 1; again(); };
  };
  const more = (total, shown, again) => {
    if (total <= shown) return;
    $('#xtBody').insertAdjacentHTML('beforeend', `<div class="actions" style="justify-content:center;margin:14px 0"><button class="btn btn-ghost" type="button" data-nav id="xtMore">Show more · ${total - shown} left</button></div>`);
    $('#xtMore').onclick = () => { C.st.page = (C.st.page || 1) + 1; again(); };
  };

  // Catch-up: the channels that keep past programmes, then that channel's past few days
  C.xtCatchup = async function (l, d) {
    const again = () => this.xtCatchup(l, d);
    const box = $('#xtBody'); if (!box) return;
    const all = d.channels.filter((c) => c.archive > 0), q = normTitle(this.st.q || '');
    const groups = [...new Set(all.map((c) => c.group))].sort((a, b) => a.localeCompare(b));
    const list0 = all.filter((c) => (!this.st.cat || c.group === this.st.cat) && (!q || normTitle(c.name).includes(q)));
    const per = IS_TV ? 40 : 80, list = list0.slice(0, per * (this.st.page || 1));
    box.innerHTML = all.length ? `${barHTML(`Find a channel with catch-up in ${l.name}`, [['', `All groups · ${all.length}`], ...groups.map((g) => [g, g])], this.st.cat || '')}
      <p class="tour-note ch-note">Pick a channel to see what it showed over the past few days.</p>
      <div class="xt-list">${list.map((c, i) => `<button class="xt-row" type="button" data-nav data-cu="${i}">${c.logo ? `<img src="${esc(c.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-gone>` : ''}<span><b>${esc(c.name)}</b><small>${esc(c.group)}</small></span><span class="xt-when">${c.archive} day${c.archive === 1 ? '' : 's'} back</span></button>`).join('') || '<div class="empty">No channels match.</div>'}</div>`
      : '<div class="empty" style="margin:16px">This service keeps no past programmes (catch-up) on any channel.</div>';
    icons(); bindBar(again);
    $$('[data-cu]', box).forEach((b) => b.addEventListener('click', () => this.xtPast(l, d, list[Number(b.dataset.cu)])));
    more(list0.length, list.length, again);
  };
  C.xtPast = async function (l, d, c) {
    X8.layer('xtPast', { label: 'Catch-up', icon: 'history', eyebrow: 'Catch-up', wide: true });
    const b = X8.body('xtPast');
    b.innerHTML = `<h3 class="x8-h">${esc(c.name)}</h3><div style="padding:22px" class="status-line"><span class="spin"></span>Reading what was on…</div>`;
    X8.open('xtPast');
    let rows = [];
    try {
      const j = await Xt.api(l, 'get_simple_data_table', `&stream_id=${encodeURIComponent(c.xid)}`);
      const now = Date.now() / 1000, from = now - c.archive * 86400;
      rows = arr(j && j.epg_listings).map((p) => ({ title: b64(p.title) || 'Programme', desc: b64(p.description), start: String(p.start || ''), s: Number(p.start_timestamp), e: Number(p.stop_timestamp || p.end_timestamp), arch: String(p.has_archive) === '1' }))
        .filter((p) => p.s && p.e && p.e <= now && p.s >= from && (p.arch || p.has_archive === undefined)).sort((x, y) => y.s - x.s);
    } catch (e) { b.innerHTML = `<h3 class="x8-h">${esc(c.name)}</h3><p class="sub">${esc(e.message === 'not-xtream' ? 'The service sent no programme list for this channel.' : e.message)}</p>`; return; }
    const day = (t) => new Date(t * 1000).toLocaleDateString(appLocale(), { weekday: 'short', day: 'numeric', month: 'short' });
    const hm = (t) => new Date(t * 1000).toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
    b.innerHTML = `<h3 class="x8-h">${esc(c.name)}</h3>${rows.length ? `<div class="xt-list">${rows.slice(0, 300).map((p, i) => `<div class="xt-pair"><button class="xt-row" type="button" data-nav data-pi="${i}" title="${esc(p.desc)}"><span><b>${esc(p.title)}</b><small>${esc(day(p.s))} · ${esc(hm(p.s))}–${esc(hm(p.e))}</small></span><span class="xt-when"><i data-lucide="play"></i></span></button>${window.MkRec ? `<button class="ibtn xt-rec" type="button" data-nav data-pr="${i}" title="Save to a file" aria-label="Save ${esc(p.title)} to a file"><i data-lucide="download"></i></button>` : ''}</div>`).join('')}</div>` : '<p class="sub">Nothing to catch up on for this channel yet.</p>'}`;
    icons();
    const pick = (p) => {
      // Xtream wants the start in the service's own time zone, which is how it lists it ("2026-11-10 20:00:00")
      const m = p.start.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
      let at;
      if (m) at = `${m[1]}:${m[2]}-${m[3]}`;
      else { const tz = d.xt.server_info && d.xt.server_info.timezone; const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(p.s * 1000)); const g = (k) => (f.find((y) => y.type === k) || {}).value; at = `${g('year')}-${g('month')}-${g('day')}:${g('hour') === '24' ? '00' : g('hour')}-${g('minute')}`; }
      const mins = Math.max(1, Math.ceil((p.e - p.s) / 60));
      const url = `${Xt.base(l)}/timeshift/${Xt.seg(l.user)}/${Xt.seg(l.pass)}/${mins}/${at}/${encodeURIComponent(String(c.xid))}.${C.nat() ? 'ts' : 'm3u8'}`;   // browsers can't read MPEG-TS
      const meta = { id: `xtv:${l.id}:c${c.xid}:${p.s}`, type: 'tv', name: `${p.title}`, poster: c.logo, logo: c.logo, background: c.logo, genres: [c.name] };
      const st = { name: l.name, title: p.title, url, _addon: 'Channels', _list: l.id, behaviorHints: {} };
      st._tel = Telemetry.parse(st);
      return { st, meta, sub: `${c.name} · ${day(p.s)} ${hm(p.s)}` };
    };
    $$('[data-pi]', b).forEach((x) => x.addEventListener('click', () => { const k = pick(rows[Number(x.dataset.pi)]); X8.close('xtPast'); this.playAny(k.st, remember(k.meta), k.sub); }));
    $$('[data-pr]', b).forEach((x) => x.addEventListener('click', () => { const p = rows[Number(x.dataset.pr)], k = pick(p); MkRec.start({ url: k.st.url, name: p.title, channel: c.name, logo: c.logo, kind: 'catchup' }); }));
  };

  // Movies and Series, a category at a time
  C.xtVod = async function (l, d, mode) {
    const again = () => this.xtVod(l, d, mode);
    const box = $('#xtBody'); if (!box) return;
    const series = mode === 'series';
    const cats = arr(await once(`${l.id}|${mode}-cats`, () => Xt.api(l, series ? 'get_series_categories' : 'get_vod_categories')));
    if (!cats.length && !this.st.cat) this.st.cat = '*';
    if (!this.st.cat) this.st.cat = String(cats[0].category_id);
    const cat = this.st.cat;
    const items = arr(await once(`${l.id}|${mode}|${cat}`, () => Xt.api(l, series ? 'get_series' : 'get_vod_streams', cat === '*' ? '' : `&category_id=${encodeURIComponent(cat)}`)));
    const q = normTitle(this.st.q || '');
    const list0 = items.filter((x) => x && (!q || normTitle(String(x.name || '')).includes(q)));
    const per = IS_TV ? 36 : 72, list = list0.slice(0, per * (this.st.page || 1));
    const opts = [...cats.map((c) => [String(c.category_id), String(c.category_name || '').trim() || 'Other']), ['*', 'Everything (can be slow)']];
    const yr = (x) => String(x.year || x.releaseDate || x.releasedate || '').slice(0, 4);
    box.innerHTML = `${barHTML(series ? `Find a series in ${l.name}` : `Find a film in ${l.name}`, opts, cat)}
      ${list.length ? `<div class="xt-grid">${list.map((x, i) => { const art = x.stream_icon || x.cover || ''; return `<button class="xt-card" type="button" data-nav data-vi="${i}"><span class="xt-art">${art ? `<img src="${esc(art)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-gone>` : `<span>${esc(x.name || '')}</span>`}</span><b>${esc(x.name || '')}</b>${yr(x) ? `<small>${esc(yr(x))}</small>` : ''}</button>`; }).join('')}</div>` : `<div class="empty" style="margin:16px">${q ? 'Nothing matches.' : 'Nothing in this category.'}</div>`}`;
    icons(); bindBar(again);
    $$('[data-vi]', box).forEach((b) => b.addEventListener('click', () => {
      const x = list[Number(b.dataset.vi)];
      if (series) return this.xtSeries(l, x);
      const meta = remember({ id: `xtv:${l.id}:m${x.stream_id}`, type: 'movie', name: String(x.name || 'Film'), poster: x.stream_icon || '', background: x.stream_icon || '' });
      const st = { name: l.name, title: meta.name, url: Xt.path(l, 'movie', x.stream_id, x.container_extension || 'mp4'), _addon: 'Channels', _list: l.id, behaviorHints: {} };
      st._tel = Telemetry.parse(st);
      this.playAny(st, meta, [yr(x), l.name].filter(Boolean).join(' · '));
    }));
    more(list0.length, list.length, again);
  };
  C.xtSeries = async function (l, x) {
    X8.layer('xtSer', { label: 'Series', icon: 'clapperboard', eyebrow: 'Series', wide: true });
    const b = X8.body('xtSer');
    b.innerHTML = `<h3 class="x8-h">${esc(x.name || '')}</h3><div style="padding:22px" class="status-line"><span class="spin"></span>Reading the episodes…</div>`;
    X8.open('xtSer');
    let j;
    try { j = await once(`${l.id}|ser|${x.series_id}`, () => Xt.api(l, 'get_series_info', `&series_id=${encodeURIComponent(x.series_id)}`)); }
    catch (e) { b.innerHTML = `<h3 class="x8-h">${esc(x.name || '')}</h3><p class="sub">${esc(e.message === 'not-xtream' ? 'The service sent no episodes for this series.' : e.message)}</p>`; return; }
    const eps = (j && j.episodes) || {};
    const seasons = Object.keys(eps).sort((a, c) => Number(a) - Number(c));
    if (!seasons.length) { b.innerHTML = `<h3 class="x8-h">${esc(x.name || '')}</h3><p class="sub">The service lists no episodes for this series.</p>`; return; }
    let cur = seasons[0];
    const paint = () => {
      const list = arr(eps[cur]).slice().sort((a, c) => Number(a.episode_num) - Number(c.episode_num));
      b.innerHTML = `<h3 class="x8-h">${esc(x.name || '')}</h3>
        ${seasons.length > 1 ? `<div class="segc" role="radiogroup" aria-label="Season" style="flex-wrap:wrap">${seasons.map((s) => `<button type="button" data-nav data-se="${esc(s)}" class="${s === cur ? 'on' : ''}">Season ${esc(s)}</button>`).join('')}</div>` : ''}
        <div class="xt-list">${list.map((e, i) => { const info = e.info || {}; return `<button class="xt-row" type="button" data-nav data-ei="${i}">${info.movie_image ? `<img src="${esc(info.movie_image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-gone>` : ''}<span><b>${esc(`${e.episode_num ? `${e.episode_num}. ` : ''}${e.title || 'Episode'}`)}</b>${info.duration ? `<small>${esc(info.duration)}</small>` : ''}</span><span class="xt-when"><i data-lucide="play"></i></span></button>`; }).join('')}</div>`;
      icons();
      $$('[data-se]', b).forEach((s) => s.addEventListener('click', () => { cur = s.dataset.se; paint(); }));
      $$('[data-ei]', b).forEach((y) => y.addEventListener('click', () => {
        const e = list[Number(y.dataset.ei)];
        const meta = remember({ id: `xtv:${l.id}:s${x.series_id}:${e.id}`, type: 'series', name: String(x.name || 'Series'), poster: x.cover || '', background: x.cover || '' });
        const st = { name: l.name, title: e.title || '', url: Xt.path(l, 'series', e.id, e.container_extension || 'mp4'), _addon: 'Channels', _list: l.id, behaviorHints: {} };
        st._tel = Telemetry.parse(st);
        X8.close('xtSer');
        this.playAny(st, meta, `S${cur} · E${e.episode_num || ''} · ${e.title || ''}`);
      }));
    };
    paint();
  };

  // after adding a login, say what the account looks like
  const submit0 = C.submit.bind(C);
  C.submit = async function (b, l, edit) {
    C.st = { group: '', q: '', page: 1, mode: 'live', cat: '' };
    await submit0(b, l, edit);
    const d = this.data.get(l.id);
    if (d && d.xt && d.xt.user_info) {
      const u = d.xt.user_info, exp = Number(u.exp_date);
      if (exp > 0 && exp * 1000 < Date.now()) toast('That account has ended. The service may not play anything until it is renewed.', 'err', 7000);
    }
  };

  C.allow();
})();
