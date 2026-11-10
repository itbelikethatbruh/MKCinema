
/* =====================================================================
   2.51 Future-proof: MKCinema still works when sources change
   1  Your apps: films on a streaming service you pay for open in that service's app (Android, Android TV, Fire TV),
      and Where to watch works for everyone, with or without a TMDB key (MKCinema's tmdb-person function answers).
   2  Other ways to watch: when your addons find nothing, the film page offers your apps, your media server, the trailer
      and Live TV instead of an empty list. Home gets "On your server" when a Plex, Jellyfin or Emby server is connected,
      and a "Watch without addons" card when no source addon is installed.
   3  Every seat its own language: each seat keeps its own subtitle and audio language.
   4  Your language on your phone: Listen on this phone can play a dub from another source in step with the TV, while
      the TV keeps the original sound for the room.
   5  Watch-along tracks: record your own commentary over a film, share the file, and anyone plays it over their own
      release. The dialogue lines it carries line it up, whatever the release.
   6  Source changes: a source that a service took down explains itself plainly and points to the other ways to watch.
   Everything runs on this device, except the Where to watch lookup without a key, which asks MKCinema's function for a
   title's providers and keeps nothing.
   ===================================================================== */
const F51 = {
  android: () => !!window.MKAndroid || /Android/i.test(navigator.userAgent),
  norm: (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
  imdb(m) { const id = String((m && (m.imdb_id || m.id)) || ''); const x = id.match(/^tt\d{5,10}/); return x ? x[0] : ''; },
  played: () => !$('#player').hidden && !!P.ctx && !!P.stream,
  sourceAddons() { try { return engine.addons.filter((a) => a.manifest && a.manifest.id !== 'org.mkcinema.trailers' && ((a.manifest && a.manifest.resources) || []).some((r) => (typeof r === 'string' ? r : r && r.name) === 'stream')); } catch (e) { return []; } },
};

/* ---------------- 1 Your apps ---------------- */
const YourApps = {
  /* streaming services: how to search them on the web, and their Android apps (phone, TV). An app that doesn't take
     the link falls back to the web search, so a wrong guess never strands anyone */
  TABLE: [
    [/^netflix/i, 'https://www.netflix.com/search?q=%s', 'com.netflix.mediaclient', 'com.netflix.ninja'],
    [/prime video|^amazon video/i, 'https://www.primevideo.com/search?phrase=%s', 'com.amazon.avod.thirdpartyclient', 'com.amazon.amazonvideo.livingroom'],
    [/^disney/i, 'https://www.disneyplus.com/search?q=%s', 'com.disney.disneyplus', 'com.disney.disneyplus'],
    [/^(hbo )?max\b/i, 'https://play.max.com/search?q=%s', 'com.wbd.stream', 'com.wbd.stream'],
    [/^hulu/i, 'https://www.hulu.com/search?q=%s', 'com.hulu.plus', 'com.hulu.livingroomplus'],
    [/^apple tv/i, 'https://tv.apple.com/search?term=%s', '', ''],
    [/^paramount/i, 'https://www.paramountplus.com/search/?q=%s', 'com.cbs.app', 'com.cbs.ott'],
    [/^peacock/i, 'https://www.peacocktv.com/search?q=%s', 'com.peacocktv.peacockandroid', 'com.peacocktv.peacockandroid'],
    [/^crunchyroll/i, 'https://www.crunchyroll.com/search?q=%s', 'com.crunchyroll.crunchyroid', 'com.crunchyroll.crunchyroid'],
    [/^tubi/i, 'https://tubitv.com/search/%s', 'com.tubitv', 'com.tubitv'],
    [/^pluto/i, 'https://pluto.tv/search/details?query=%s', 'tv.pluto.android', 'tv.pluto.android'],
    [/^youtube/i, 'https://www.youtube.com/results?search_query=%s', 'com.google.android.youtube', 'com.google.android.youtube.tv'],
    [/^google play/i, 'https://play.google.com/store/search?q=%s&c=movies', '', ''],
    [/^plex/i, 'https://watch.plex.tv/search?q=%s', 'com.plexapp.android', 'com.plexapp.android'],
    [/^mubi/i, 'https://mubi.com/search/films?query=%s', 'com.mubi', 'com.mubi'],
    [/^(the )?criterion/i, 'https://www.criterionchannel.com/search?q=%s', '', ''],
    [/^kanopy/i, 'https://www.kanopy.com/search?query=%s', 'com.kanopy', 'com.kanopy'],
    [/^starz/i, 'https://www.starz.com/search?q=%s', 'com.bydeluxe.d3.android.program.starz', ''],
    [/^now( tv)?\b/i, 'https://www.nowtv.com/search?q=%s', '', ''],
    [/^bbc iplayer/i, 'https://www.bbc.co.uk/iplayer/search?q=%s', 'bbc.iplayer.android', 'uk.co.bbc.iplayer'],
    [/^(itvx|itv)/i, 'https://www.itv.com/watch/search?q=%s', '', ''],
    [/^(channel 4|4od)/i, 'https://www.channel4.com/search?q=%s', '', ''],
  ],
  mine() { const l = Store.get('myApps', []); return Array.isArray(l) ? l : []; },
  setMine(l) { Store.set('myApps', l.slice(0, 40)); },
  has(p) { return this.mine().some((x) => x.id === p.provider_id || F51.norm(x.name) === F51.norm(p.provider_name)); },
  row(name) { return this.TABLE.find(([re]) => re.test(String(name || '').trim())) || null; },
  /* where a tap goes: the app on Android, else the service's own search on the web */
  link(p, m) {
    const r = this.row(p.provider_name), q = encodeURIComponent(String((m && m.name) || '').slice(0, 120));
    const web = r ? r[1].replace('%s', q) : '';
    if (!web) return { href: '', web: '' };
    const pkg = r && (IS_TV ? r[3] : r[2]);
    if (F51.android() && pkg) {
      const u = new URL(web);
      return { href: `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;action=android.intent.action.VIEW;package=${pkg};S.browser_fallback_url=${encodeURIComponent(web)};end`, web };
    }
    return { href: web, web };
  },
  open(p, m) {
    const l = this.link(p, m);
    if (!l.href) { toast(`Open ${p.provider_name} and search for ${m.name}`, 'info', 4200); return; }
    // a TV without Android has nowhere to send a link: say what to do instead
    if (IS_TV && !window.MKAndroid) { toast(`Open ${p.provider_name} on this TV and search for ${m.name}`, 'info', 5200); return; }
    MKLog.add('info', `Your apps: ${p.provider_name}`);
    if (/^intent:/.test(l.href)) location.href = l.href; else window.open(l.href, '_blank', 'noopener');
  },
  /* the region's services, for the picker: your own TMDB key first, then MKCinema's function */
  async catalog() {
    const reg = WhereToWatch.region(), ck = `ya:${reg}`;
    if (this.cat && this.cat.k === ck) return this.cat.v;
    let list = [];
    try {
      if (TMDB.key()) {
        const [a, b] = await Promise.all([TMDB.get('watch/providers/movie', { watch_region: reg }), TMDB.get('watch/providers/tv', { watch_region: reg })]);
        const seen = new Map(); [...((a && a.results) || []), ...((b && b.results) || [])].forEach((p) => { if (!seen.has(p.provider_id)) seen.set(p.provider_id, p); });
        list = [...seen.values()].sort((x, y) => ((x.display_priorities || {})[reg] ?? x.display_priority ?? 99) - ((y.display_priorities || {})[reg] ?? y.display_priority ?? 99));
      } else { const j = await People.relay('providers', { region: reg }); list = (j && j.results) || []; }
    } catch (e) { list = []; }
    list = list.slice(0, 80).map((p) => ({ provider_id: p.provider_id, provider_name: p.provider_name, logo_path: p.logo_path }));
    this.cat = { k: ck, v: list }; return list;
  },
  logo: (p, w = 'w92') => (p.logo_path ? `<img src="https://image.tmdb.org/t/p/${w}${esc(p.logo_path)}" alt="" loading="lazy">` : `<span class="ya-mono">${esc(String(p.provider_name || '?').slice(0, 1))}</span>`),
  async pick() {
    X8.layer('yaPick', { label: 'Your streaming apps', icon: 'tv', eyebrow: 'Your apps', wide: true });
    const body = X8.body('yaPick');
    body.innerHTML = '<h2 class="x8-h">Which services do you pay for?</h2><p class="sc-p">Getting the list for your region…</p>';
    X8.open('yaPick'); icons();
    const list = await this.catalog(); if (!$('#yaPick') || $('#yaPick').hidden) return;
    const mine = new Set(this.mine().map((x) => x.id));
    body.innerHTML = `<h2 class="x8-h">Which services do you pay for?</h2>
      <p class="sc-p">A film on one of these opens straight in its app on Android, Android TV and Fire TV, and in your browser elsewhere. Your list stays on this device and in your own account. Region: ${esc(WhereToWatch.region())} (Settings › Home).</p>
      ${list.length ? `<div class="ya-grid">${list.map((p) => `<button type="button" class="ya-svc${mine.has(p.provider_id) ? ' on' : ''}" data-nav data-ya="${p.provider_id}" aria-pressed="${mine.has(p.provider_id)}">${this.logo(p)}<span>${esc(p.provider_name)}</span></button>`).join('')}</div>`
    : '<p class="sc-p">The list could not load. Check your connection and try again.</p>'}`;
    body.onclick = (e) => {
      const b = e.target.closest('[data-ya]'); if (!b) return;
      const id = Number(b.dataset.ya), p = list.find((x) => x.provider_id === id); if (!p) return;
      const cur = this.mine(), on = !cur.some((x) => x.id === id);
      this.setMine(on ? [...cur, { id, name: p.provider_name, logo: p.logo_path || '' }] : cur.filter((x) => x.id !== id));
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      if (D.meta && !$('#detail').hidden) WhereToWatch.fill(D.meta);
    };
    icons();
  },
  /* the title's providers for the film page; the same shape as TMDB's answer, from your key or MKCinema's function */
  init() {
    const get = WhereToWatch.get.bind(WhereToWatch);
    WhereToWatch.key = () => TMDB.key() || 'mkc';
    WhereToWatch.get = function (m) {
      if (TMDB.key()) return get(m);
      const tt = F51.imdb(m); if (!tt) return Promise.resolve(null);
      const ck = `${tt}|${this.region()}|mkc`; if (this.cache.has(ck)) return this.cache.get(ck);
      const p = People.relay('watch', { tt, region: this.region() }).then((j) => (j && j.result) || null).catch(() => { this.cache.delete(ck); return null; });
      this.cache.set(ck, p); return p;
    };
    const fill = WhereToWatch.fill.bind(WhereToWatch);
    WhereToWatch.fill = async function (m) {
      await fill(m);
      const box = $('#dWtw'); if (!box || D.meta !== m) return;
      const r = await this.get(m).catch(() => null); if (!r || !$('#dWtw') || D.meta !== m) return;
      const all = ['flatrate', 'free', 'ads', 'rent', 'buy'].flatMap((k) => (r[k] || []).map((p) => ({ ...p, _k: k })));
      // each service in the list opens its own app or search, not the general page
      $$('.wtw-p', box).forEach((a) => {
        const name = a.querySelector('span') ? a.querySelector('span').textContent : ''; const p = all.find((x) => x.provider_name === name); if (!p) return;
        const l = YourApps.link(p, m); if (!l.href) return;
        a.href = l.web || a.href; a.onclick = (e) => { e.preventDefault(); YourApps.open(p, m); };
      });
      // a service you pay for goes first, as its own button
      const yours = all.filter((p) => (p._k === 'flatrate' || p._k === 'free' || p._k === 'ads') && YourApps.has(p));
      $$('.ya-mine', box.parentNode).forEach((x) => x.remove());
      if (yours.length) {
        const p = yours[0];
        box.insertAdjacentHTML('beforebegin', `<button type="button" class="btn btn-ghost ya-mine" data-nav id="yaMine">${YourApps.logo(p)}<span>Watch on ${esc(p.provider_name)}<small>You have this · opens ${F51.android() && YourApps.row(p.provider_name) && YourApps.row(p.provider_name)[IS_TV ? 3 : 2] ? 'the app' : 'in your browser'}</small></span></button>`);
        $('#yaMine').onclick = () => YourApps.open(p, m);
      }
      YourApps.last = { m, yours, all };
      if (typeof OtherWays !== 'undefined') OtherWays.paint();
    };
  },
};

/* ---------------- 2 Other ways to watch, On your server, Watch without addons ---------------- */
const OtherWays = {
  /* the film page when no addon found anything: what else this title can be watched with */
  paint() {
    const box = $('#dStreams'); if (!box || $('#detail').hidden || !D.meta) return;
    const st = D.status || {}; const old = $('#owBox');
    const empty = !st.pending && !(D.streams || []).length && typeof detailStreamTarget === 'function' && detailStreamTarget();
    if (!empty) { if (old) old.remove(); return; }
    const m = D.meta, ya = YourApps.last && YourApps.last.m === m ? YourApps.last : null;
    const apps = ya ? (ya.yours.length ? ya.yours : ya.all.filter((p) => p._k === 'flatrate' || p._k === 'free' || p._k === 'ads')).slice(0, 4) : [];
    const srv = Servers.list().length, src = F51.sourceAddons().length;
    const btn = (k, icon, label) => `<button type="button" class="btn btn-ghost btn-sm" data-nav data-ow="${k}"><i data-lucide="${icon}"></i>${esc(label)}</button>`;
    const html = `<div class="ow-box" id="owBox"><b>${src ? 'Your addons found nothing for this one' : 'No source addon is installed'}</b>
      <small>${src ? 'Sources change. These still work:' : 'MKCinema still plays a lot without one:'}</small>
      <div class="ow-acts">${apps.map((p, i) => `<button type="button" class="btn btn-ghost btn-sm ya-chip" data-nav data-owapp="${i}">${YourApps.logo(p)}${esc(p.provider_name)}${YourApps.has(p) ? ' · yours' : ''}</button>`).join('')}
      ${btn('trailer', 'clapperboard', 'Trailer')}${srv ? '' : btn('servers', 'server', 'Connect Plex or Jellyfin')}${btn('tv', 'radio-tower', 'Live TV')}${apps.length || !YourApps.mine().length ? '' : btn('apps', 'tv', 'Your apps')}${btn('addons', 'blocks', 'Find addons')}</div></div>`;
    if (old) old.outerHTML = html; else box.insertAdjacentHTML('beforeend', html);
    const ow = $('#owBox');
    ow.onclick = (e) => {
      const a = e.target.closest('[data-owapp]'); if (a) { YourApps.open(apps[Number(a.dataset.owapp)], m); return; }
      const b = e.target.closest('[data-ow]'); if (!b) return;
      const k = b.dataset.ow;
      if (k === 'trailer') playTrailer(m);
      if (k === 'servers') openSettings('servers');
      if (k === 'tv') go('tv');
      if (k === 'apps') YourApps.pick();
      if (k === 'addons') { const c = COMMANDS.find((x) => /addon finder|find addons/i.test(x.label)); if (c) c.run(); else openSettings('streams'); }
    };
    icons();
  },
  /* newest films and shows on your own server, matched to their IMDb ids so they open the normal title page */
  async serverItems(s) {
    const out = [];
    try {
      if (s.kind === 'plex') {
        const secs = ((await Servers.plexGet(s, '/library/sections', 6000)).MediaContainer || {}).Directory || [];
        for (const d of secs.filter((x) => x.type === 'movie' || x.type === 'show').slice(0, 4)) {
          const r = ((await Servers.plexGet(s, `/library/sections/${d.key}/all?sort=addedAt:desc&includeGuids=1&X-Plex-Container-Start=0&X-Plex-Container-Size=24`, 8000)).MediaContainer || {}).Metadata || [];
          r.forEach((x) => {
            const g = (x.Guid || []).map((y) => y.id).find((y) => /^imdb:\/\/tt\d+/.test(y)); if (!g) return;
            const tok = `X-Plex-Token=${encodeURIComponent(s.token)}`;
            const poster = x.thumb ? Servers.reach(`${s.url}/photo/:/transcode?width=300&height=450&minSize=1&url=${encodeURIComponent(x.thumb)}&${tok}`) : '';
            out.push({ at: Number(x.addedAt) || 0, m: { id: g.slice(7), type: d.type === 'show' ? 'series' : 'movie', name: x.title, poster: poster || undefined, releaseInfo: x.year ? String(x.year) : '', _srvName: s.name } });
          });
        }
      } else {
        const q = `IncludeItemTypes=Movie,Series&Recursive=true&SortBy=DateCreated&SortOrder=Descending&Limit=40&Fields=ProviderIds,ProductionYear,DateCreated${s.user ? `&userId=${s.user}` : ''}`;
        const r = await Servers.json(`${s.url}/Items?${Servers.jfQ(s, q)}`, {}, 8000);
        (r.Items || []).forEach((x) => {
          const tt = String((x.ProviderIds || {}).Imdb || (x.ProviderIds || {}).IMDB || ''); if (!/^tt\d+/.test(tt)) return;
          const poster = Servers.reach(`${s.url}/Items/${x.Id}/Images/Primary?maxHeight=450&quality=85&${Servers.jfQ(s)}`);
          out.push({ at: Date.parse(x.DateCreated || '') || 0, m: { id: tt, type: x.Type === 'Series' ? 'series' : 'movie', name: x.Name, poster: poster || undefined, releaseInfo: x.ProductionYear ? String(x.ProductionYear) : '', _srvName: s.name } });
        });
      }
    } catch (e) { MKLog.add('info', `On your server: ${s.name} ${e.message}`); }
    return out;
  },
  async serverRow(rows) {
    const list = Servers.list(); if (!list.length || CFG.homeServers === false) return;
    if (typeof Seats !== 'undefined' && Seats.kids()) return;
    const sec = rowShell('On your server', list.map((s) => s.name).join(' · ').slice(0, 60), { id: 'srvRow' }); sec.dataset.rk = 'servers';
    const after = $('#cwRow', rows); if (after) after.after(sec); else rows.prepend(sec);
    const got = (await Promise.all(list.slice(0, 3).map((s) => this.serverItems(s)))).flat().sort((a, b) => b.at - a.at);
    const seen = new Set(), metas = got.map((x) => x.m).filter((m) => !seen.has(m.id) && seen.add(m.id)).slice(0, 30);
    if (!metas.length) { sec.remove(); return; }
    fillRail(sec, metas.map((m) => cardHTML(m)).join(''));
  },
  /* Home with no source addon: one card with the ways in that need none */
  noAddonCard(rows) {
    if (F51.sourceAddons().length || CFG.noAddonCard === false || (typeof Seats !== 'undefined' && Seats.kids())) return;
    const el = document.createElement('section'); el.className = 'row ow-home'; el.id = 'owHome';
    el.innerHTML = `<div class="ow-card"><div><b>Watch without addons</b><small>MKCinema plays what you already have. Source addons are optional.</small></div>
      <div class="ow-acts">${[['servers', 'server', 'Plex, Jellyfin or Emby'], ['tv', 'radio-tower', 'Live TV playlists'], ['file', 'folder-open', 'A file on this device'], ['apps', 'tv', 'Your streaming apps'], ['peak', 'film', 'Peak Cinema trailers']]
    .filter(([k]) => !(k === 'file' && IS_TV)).map(([k, i, l]) => `<button type="button" class="btn btn-ghost btn-sm" data-nav data-owh="${k}"><i data-lucide="${i}"></i>${esc(l)}</button>`).join('')}</div>
      <button type="button" class="ibtn ow-x" data-nav data-owh="hide" aria-label="Hide this card"><i data-lucide="x"></i></button></div>`;
    rows.prepend(el);
    el.onclick = (e) => {
      const b = e.target.closest('[data-owh]'); if (!b) return; const k = b.dataset.owh;
      if (k === 'hide') { setCfg('noAddonCard', false); el.remove(); toast('Hidden. Settings › Home brings it back.', 'info', 2600); return; }
      if (k === 'servers') openSettings('servers');
      if (k === 'tv') go('tv');
      if (k === 'file') { const f = $('#fileVideo'); if (f) f.click(); }
      if (k === 'apps') YourApps.pick();
      if (k === 'peak') { if (typeof Peak !== 'undefined') Peak.open(); }
    };
    icons();
  },
  init() {
    const rs = renderStreamsPanel;
    renderStreamsPanel = function () { const r = rs.apply(this, arguments); try { OtherWays.paint(); } catch (e) { /* the list still shows */ } return r; };
    const rh = renderHome;
    renderHome = async function () {
      const p = rh.apply(this, arguments);
      const rows = $('#homeRows');
      try { OtherWays.noAddonCard(rows); OtherWays.serverRow(rows); } catch (e) { console.warn('2.51 home', e); }
      return p;
    };
  },
};

/* ---------------- 3 Every seat its own language ----------------
   A seat's own subtitle and audio language stand in for the shared ones while that seat is in use. The shared
   settings file, the account copy and other devices keep the house's choice: only reads see the seat's. */
const SeatLang = {
  KEYS: { subLang: 'sub', srAudio: 'audio' },
  base: {},
  seat() { if (!SEAT) return null; return Seats.list().find((s) => s.id === SEAT) || null; },
  pref(k) { const s = this.seat(); const v = s && s.lang && s.lang[this.KEYS[k]]; return v || ''; },
  setPref(k, v) {
    const l = Seats.list(), i = l.findIndex((s) => s.id === SEAT); if (i < 0) return;
    const lang = { ...(l[i].lang || {}) }; if (v) lang[this.KEYS[k]] = v; else delete lang[this.KEYS[k]];
    l[i] = { ...l[i], lang }; Seats.saveList(l);
  },
  init() {
    Object.keys(this.KEYS).forEach((k) => {
      this.base[k] = CFG[k];
      Object.defineProperty(CFG, k, {
        enumerable: true, configurable: true,
        get: () => this.pref(k) || this.base[k],
        // a change made in Settings while a seat with its own language is in use changes that seat's language
        set: (v) => { if (this.pref(k) && !(typeof Account !== 'undefined' && Account.applying) && !this.writingBase) this.setPref(k, v); else this.base[k] = v; },
      });
    });
    // what gets saved and synced is always the house's value
    const self = this;
    Object.defineProperty(CFG, 'toJSON', { enumerable: false, configurable: true, value() { const o = {}; Object.keys(this).forEach((k) => { o[k] = k in self.KEYS ? self.base[k] : this[k]; }); return o; } });
    if (typeof Account !== 'undefined' && Account.compose) {
      const c = Account.compose.bind(Account);
      Account.compose = function () { const out = c.apply(this, arguments); if (out && out.cfg) Object.keys(self.KEYS).forEach((k) => { if (self.base[k] === undefined) delete out.cfg[k]; else out.cfg[k] = self.base[k]; }); return out; };
    }
    scAddRows('subtitles', null, () => (!SEAT || !this.seat() ? [] : [
      { group: `${this.seat().name}’s languages` },
      { key: 'seatSub', label: 'Subtitles for this seat', help: 'Everyone else keeps the house’s choice. Changing the subtitle language above while this is set changes this seat’s.', type: 'select', options: [['', 'Same as the house'], ...LANG_CHOICES], get: () => this.pref('subLang'), set: (v) => { this.setPref('subLang', v); toast(v ? `${this.seat().name} gets ${langName(v)} subtitles` : 'Back to the house’s subtitles', 'ok', 2200); } },
      { key: 'seatAudio', label: 'Sound language for this seat', help: 'Sources in this language move to the top for this seat, so Smart Play picks them first.', type: 'select', options: [['', 'Same as the house'], ...['eng', 'spa', 'fre', 'ger', 'ita', 'por', 'hin', 'tam', 'tel', 'jpn', 'kor', 'rus', 'pol', 'tur', 'ara', 'chi', 'dut'].map((c) => [c, langName(c)])], get: () => this.pref('srAudio'), set: (v) => { this.setPref('srAudio', v); toast(v ? `${this.seat().name} hears ${langName(v)} first` : 'Back to the house’s sound language', 'ok', 2200); } },
    ]));
  },
};

/* ---------------- 4 Your language on your phone ----------------
   Listen on this phone already plays the film's sound on a phone. Here the phone can ask for another source's sound
   (a dub), plays it in step with the TV, and the TV keeps its own sound for everyone else in the room. */
const PhoneLang = {
  peers: new Map(), // phone id -> { s, at }
  syncT: 0,
  langOf(s) { let set = null; try { const r = AudioPref.langs(s); set = r && r.langs ? r.langs : r; } catch (e) { set = null; } return [...(set || [])]; },
  /* the other-language sources a phone can play: a plain https link, no special headers, a language we can name */
  choices() {
    if (!F51.played() || P.stream._local) return [];
    const cur = new Set(this.langOf(P.stream)), out = [], seen = new Set();
    for (const s of (P.ctx.streams || [])) {
      if (!s || s === P.stream || s.ytId || !(location.protocol === 'http:' ? /^https?:\/\//i : /^https:\/\//i).test(s.url || '') || (s.behaviorHints && s.behaviorHints.proxyHeaders)) continue;
      const langs = this.langOf(s).filter((l) => !cur.has(l)); if (!langs.length) continue;
      const k = langs[0]; if (seen.has(k)) continue; seen.add(k);
      out.push({ k, l: langName(k), s }); if (out.length >= 8) break;
    }
    return out;
  },
  start(id, k) {
    const c = this.choices().find((x) => x.k === k);
    if (!c) { PxListen.send(id, { t: 'lsn-st', ok: false, code: 'lang', why: 'That language isn’t among this film’s sources any more. Pick another one.' }); return; }
    this.peers.set(id, { s: c.s, k, at: Date.now() });
    PxListen.send(id, { t: 'lsn-st', ok: true, mode: 'direct', alt: k, altL: c.l, dur: Math.round(pDur() * 1000) / 1000, url: c.s.url, title: P.ctx.meta.name || '', ...PxListen.pos() });
    toast(`${c.l} sound is playing on a phone. This screen keeps its sound.`, 'ok', 3200);
    clearInterval(this.syncT); this.syncT = setInterval(() => this.sync(), 1000);
    Remote.soon && Remote.soon();
  },
  stop(id) { if (!this.peers.delete(id)) return false; if (!this.peers.size) clearInterval(this.syncT); return true; },
  sync() { if (!this.peers.size || !Remote.bus) { clearInterval(this.syncT); return; } this.peers.forEach((p, id) => PxListen.send(id, { t: 'lsync', ...PxListen.pos() })); },
  init() {
    const on = Remote.onMsg.bind(Remote);
    Remote.onMsg = function (m) {
      if (m && m._from && m.t === 'lsn') {
        if (m.on && typeof m.alt === 'string' && m.alt) { PxListen.stop(m._from, true); PhoneLang.start(m._from, m.alt.slice(0, 8)); const k = Remote.peers.get(m._from); if (k) k.at = Date.now(); return; }
        if (!m.on && PhoneLang.stop(m._from)) return;
      }
      if (m && m._from && m.t === 'bye') PhoneLang.stop(m._from);
      return on(m);
    };
    const st = Remote.state.bind(Remote);
    Remote.state = function () {
      const s = st();
      if (s.lsn && s.lsn.ok) { const c = PhoneLang.choices(); if (c.length) s.lsn.langs = c.map((x) => ({ k: x.k, l: x.l })); }
      if (Array.isArray(s.caps) && !s.caps.includes('lng')) s.caps.push('lng');
      return s;
    };
    ['play', 'pause', 'seeked', 'ratechange'].forEach((ev) => video.addEventListener(ev, () => { if (this.peers.size) this.sync(); }));
    // a phone listening in its own language stays connected while its screen is off
    const beat = Remote.beat.bind(Remote);
    Remote.beat = function () { PhoneLang.peers.forEach((p, id) => { const k = Remote.peers.get(id); if (k) k.at = Date.now(); }); return beat(); };
    const close = closePlayer;
    closePlayer = async function () { PhoneLang.peers.forEach((p, id) => PxListen.send(id, { t: 'lsn-st', ok: false, code: 'stopped' })); PhoneLang.peers.clear(); clearInterval(PhoneLang.syncT); return close.apply(this, arguments); };
  },
};

/* ---------------- 5 Watch-along tracks ----------------
   Record: the microphone records while the film plays; pausing pauses it and every jump starts a new piece, so the file
   knows which moment of the film each second of talk belongs to. It also keeps the film's dialogue lines with their times.
   Play: the lines in the file are matched to the lines of the viewer's own subtitles, which gives the shift and the
   speed between the two releases, so the talk lands at the same moment on any release. A file is one .mkwa (JSON with
   the sound inside). Nothing is uploaded: people share the file however they like. */
const WatchAlong = {
  rec: null, t: null, a: null, map: null, loop: 0, nudge: 0, vol0: null,
  /* ---- recording ---- */
  canRecord: () => !IS_TV && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder),
  mime() { return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((x) => { try { return MediaRecorder.isTypeSupported(x); } catch (e) { return false; } }) || ''; },
  async record() {
    if (!F51.played()) { toast('Start the film first', 'info', 2200); return; }
    if (!this.canRecord()) { toast('Recording needs a computer or phone with a microphone', 'info', 3600); return; }
    if (this.rec) { this.finish(); return; }
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { toast('MKCinema needs the microphone to record a watch-along', 'err', 4200); return; }
    const mime = this.mime(), mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
    const r = this.rec = { mr, stream, chunks: [], segs: [], acc: 0, since: 0, meta: P.ctx.meta, video: P.ctx.video, stream0: P.stream, mime: mr.mimeType || mime || 'audio/webm' };
    mr.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
    const now = () => r.acc + (r.since ? (performance.now() - r.since) / 1000 : 0);
    r.now = now;
    r.mark = () => { const a = Math.round(now() * 1000) / 1000, v = Math.round(pNow() * 1000) / 1000, k = video.playbackRate || 1; const last = r.segs[r.segs.length - 1]; if (last && Math.abs(last[0] - a) < 0.05) r.segs.pop(); r.segs.push([a, v, k]); };
    r.on = { play: () => { if (mr.state === 'paused') mr.resume(); r.since = performance.now(); r.mark(); }, pause: () => { if (mr.state === 'recording') mr.pause(); if (r.since) { r.acc += (performance.now() - r.since) / 1000; r.since = 0; } }, seeked: () => r.mark(), ratechange: () => r.mark() };
    Object.entries(r.on).forEach(([ev, fn]) => video.addEventListener(ev, fn));
    mr.start(4000);
    if (video.paused) { mr.pause(); } else { r.since = performance.now(); }
    r.mark();
    this.recPill(true);
    toast('Recording your watch-along. Talk over the film; pausing pauses the recording.', 'ok', 4200);
  },
  recPill(on) {
    let el = $('#waRec');
    if (!on) { if (el) el.remove(); clearInterval(this.pillT); return; }
    if (!el) { document.body.insertAdjacentHTML('beforeend', '<div class="wa-rec" id="waRec" role="status"><span class="wa-dot"></span><b>Recording</b><span id="waRecT">0:00</span><button type="button" data-nav id="waRecStop">Finish</button></div>'); el = $('#waRec'); $('#waRecStop').onclick = () => this.finish(); }
    clearInterval(this.pillT); this.pillT = setInterval(() => { const r = this.rec, t = $('#waRecT'); if (!r || !t) return; const s = Math.floor(r.now()); t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; $('#waRec').classList.toggle('paused', !r.since); }, 500);
  },
  async anchors() {
    try {
      const sub = ScriptClock.pick(); if (!sub) return { lang: '', lines: [] };
      const cues = ((await ScriptClock.cues(sub)) || {}).list || [];
      return { lang: String(sub.lang || ''), lines: cues.filter((c) => c.t && c.t.length >= 6).slice(0, 2500).map((c) => [Math.round(c.s * 100) / 100, String(c.t).slice(0, 90)]) };
    } catch (e) { return { lang: '', lines: [] }; }
  },
  async finish(cancel) {
    const r = this.rec; if (!r) return; this.rec = null; this.recPill(false);
    Object.entries(r.on).forEach(([ev, fn]) => video.removeEventListener(ev, fn));
    const total = r.now();
    const done = new Promise((res) => { r.mr.onstop = res; });
    try { if (r.mr.state !== 'inactive') r.mr.stop(); } catch (e) { /* stopped */ }
    await Promise.race([done, new Promise((res) => setTimeout(res, 3000))]);
    r.stream.getTracks().forEach((t) => t.stop());
    if (cancel || total < 3) { toast(cancel ? 'Recording thrown away' : 'Too short to keep', 'info', 2200); return; }
    toast('Saving your watch-along…', 'info', 2000);
    const blob = new Blob(r.chunks, { type: r.mime });
    const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(blob); });
    const anc = await this.anchors();
    const m = r.meta, v = r.video;
    const file = { mkwa: 1, app: `MKCinema ${APP_VERSION}`, at: new Date().toISOString(), by: (Seats.cur() || {}).name || '', title: m.name || '', id: m.id || '', imdb: F51.imdb(m), type: m.type || '', video: v ? v.id : '', ep: v ? `S${v.season}E${v.episode}` : '',
      dur: Math.round(pDur() * 100) / 100, len: Math.round(total * 100) / 100, segs: r.segs, lang: anc.lang, lines: anc.lines, mime: r.mime, audio: b64 };
    const name = `${String(m.name || 'film').replace(/[\\/:*?"<>|]+/g, ' ').trim()}${v ? ` S${v.season}E${v.episode}` : ''} watch-along.mkwa`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(`Saved “${name}”. Send it to anyone: it plays over their own copy of the film.`, 'ok', 6000);
    MKLog.add('info', `Watch-along recorded: ${Math.round(total)} s, ${r.segs.length} pieces, ${anc.lines.length} lines`);
  },
  /* ---- playing ---- */
  open() {
    if (!F51.played()) { toast('Start the film first', 'info', 2200); return; }
    X8.layer('waPick', { label: 'Watch-along', icon: 'mic', eyebrow: 'Watch-along', wide: true });
    const body = X8.body('waPick'), t = this.t;
    body.innerHTML = `<h2 class="x8-h">Watch-along</h2>
      <p class="sc-p">Play someone’s commentary over this film, or record your own. A watch-along lines itself up with your release using the dialogue, so it works on any copy. Subtitles help it line up exactly.</p>
      ${t ? `<div class="dub-now"><span>Now: <b>${esc(t.by ? `${t.by}’s watch-along` : 'Watch-along')}</b> · ${esc(this.howText())}</span>${this.nudgeHTML()}<button class="btn btn-ghost btn-sm" type="button" data-nav data-wa="off"><i data-lucide="x"></i>Stop it</button></div>` : ''}
      <div class="wa-acts"><button class="btn btn-ghost" type="button" data-nav data-wa="file"><i data-lucide="folder-open"></i>Open a watch-along file</button>
      <div class="field wa-url"><input class="inp" id="waUrl" type="url" placeholder="Or paste a link to a .mkwa file" autocomplete="off"><button class="btn btn-ghost btn-sm" type="button" data-nav data-wa="url">Load</button></div>
      ${this.canRecord() ? `<button class="btn btn-ghost" type="button" data-nav data-wa="rec"><i data-lucide="mic"></i>${this.rec ? 'Finish recording' : 'Record your own'}</button>` : ''}</div>
      <input type="file" id="waFile" accept=".mkwa,application/json" hidden>`;
    body.onclick = (e) => {
      const n = e.target.closest('[data-wan]'); if (n) { this.setNudge(this.nudge + Number(n.dataset.wan)); this.open(); return; }
      const b = e.target.closest('[data-wa]'); if (!b) return; const k = b.dataset.wa;
      if (k === 'off') { this.stop(); X8.close('waPick'); toast('Watch-along stopped', 'info', 1600); }
      if (k === 'file') $('#waFile').click();
      if (k === 'url') this.fromUrl($('#waUrl').value);
      if (k === 'rec') { X8.close('waPick'); this.record(); }
    };
    $('#waFile').onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) f.text().then((x) => this.load(x)).catch(() => toast('That file could not be read', 'err', 3000)); };
    icons(); X8.open('waPick');
  },
  async fromUrl(u) {
    u = String(u || '').trim(); if (!/^https:\/\//i.test(u)) { toast('Paste an https link to a .mkwa file', 'info', 3000); return; }
    toast('Getting the watch-along…', 'info', 2000);
    try { const r = await fetch(u); if (!r.ok) throw new Error(`HTTP ${r.status}`); this.load(await r.text()); }
    catch (e) { toast('That link didn’t give a watch-along file. The host has to allow downloads from other sites.', 'err', 5200); }
  },
  load(text) {
    let t; try { t = JSON.parse(text); } catch (e) { t = null; }
    if (!t || t.mkwa !== 1 || !t.audio || !Array.isArray(t.segs) || !t.segs.length) { toast('That isn’t a watch-along file', 'err', 3000); return; }
    const m = P.ctx.meta, mine = F51.imdb(m);
    if (t.imdb && mine && t.imdb !== mine) { toast(`That watch-along is for ${t.title || 'another title'}`, 'err', 4200); return; }
    const v = P.ctx.video; if (t.ep && v && t.ep !== `S${v.season}E${v.episode}`) { toast(`That watch-along is for ${t.ep}`, 'err', 4200); return; }
    X8.close('waPick'); this.start(t);
  },
  /* the viewer's time to the recorder's: T = (v - off) / k */
  async align(t) {
    const pairs = [];
    try {
      const want = t.lang ? langName(t.lang) : '';
      const subs = (P.subs || []).filter((s) => (s.kind === 'url' && /^https?:/i.test(s.url || '')) || (s.kind === 'file' && s.text));
      const sub = (want && subs.find((s) => langName(s.lang) === want)) || ScriptClock.pick();
      const cues = sub && (t.lines || []).length >= 8 ? (((await ScriptClock.cues(sub)) || {}).list || []) : [];
      if (cues && cues.length) {
        const key = (x) => F51.norm(x).slice(0, 60), mine = new Map(), theirs = new Map();
        cues.forEach((c) => { const k = key(c.t); if (k.length >= 8) mine.set(k, mine.has(k) ? null : c.s); });
        t.lines.forEach(([s, x]) => { const k = key(x); if (k.length >= 8) theirs.set(k, theirs.has(k) ? null : s); });
        theirs.forEach((s, k) => { const v = mine.get(k); if (s != null && v != null) pairs.push([s, v]); });
      }
    } catch (e) { /* no lines to use */ }
    if (pairs.length >= 8) {
      let best = null;
      for (const k of SC_FPS) {
        const offs = pairs.map(([a, v]) => v - a * k).sort((x, y) => x - y), off = offs[offs.length >> 1];
        const hit = pairs.filter(([a, v]) => Math.abs(v - (a * k + off)) < 0.7).length;
        if (!best || hit > best.hit) best = { k, off, hit };
      }
      if (best && best.hit >= Math.max(6, pairs.length * 0.3)) {
        const good = pairs.filter(([a, v]) => Math.abs(v - (a * best.k + best.off)) < 0.7), offs = good.map(([a, v]) => v - a * best.k).sort((x, y) => x - y);
        return { k: best.k, off: offs[offs.length >> 1], how: 'lines', n: good.length };
      }
    }
    const d = pDur(); const k = isFinite(d) && t.dur ? ScriptClock.fps(t.dur, d) : 1;
    return { k, off: 0, how: 'length', n: 0 };
  },
  howText() { const m = this.map; if (!m) return 'getting ready'; return m.how === 'lines' ? `lined up by ${m.n} lines of dialogue` : 'lined up by length: nudge it if voices come early or late'; },
  nudgeHTML() { return `<div class="pl-nudge" role="group" aria-label="Nudge the watch-along">${[[-1, '−1 s'], [-0.25, '−¼'], [0.25, '+¼'], [1, '+1 s']].map(([v, l]) => `<button type="button" class="chip" data-nav data-wan="${v}">${l}</button>`).join('')}</div>`; },
  setNudge(v) { this.nudge = Math.round(v * 100) / 100; this.sync(true); toast(`Watch-along ${this.nudge > 0 ? '+' : ''}${this.nudge.toFixed(2)} s`, 'info', 1200, 'wa'); },
  async start(t) {
    this.stop();
    const bin = atob(t.audio), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const a = this.a = new Audio(); a.preload = 'auto'; a.src = this.blobUrl = URL.createObjectURL(new Blob([u8], { type: t.mime || 'audio/webm' }));
    this.t = t; this.nudge = 0; this.map = null;
    toast('Lining up the watch-along…', 'info', 2400, 'wa');
    this.map = await this.align(t); if (this.a !== a) return;
    // pieces in the recorder's film time: [audio start, film start, speed, length]
    const s = t.segs; this.pieces = s.map((x, i) => ({ a: x[0], v: x[1], k: x[2] || 1, len: (i + 1 < s.length ? s[i + 1][0] : t.len) - x[0] })).filter((p) => p.len > 0.05);
    this.vol0 = video.volume; if (CFG.waDuck !== false) video.volume = Math.max(0.05, video.volume * 0.45);
    a.volume = 1;
    clearInterval(this.loop); this.loop = setInterval(() => this.sync(false), 400); this.sync(true);
    MKLog.add('info', `Watch-along: ${this.map.how}, rate ${this.map.k.toFixed(4)}, shift ${this.map.off.toFixed(2)}`);
    toast(`${t.by ? `${t.by}’s watch-along` : 'Watch-along'} on · ${this.howText()}`, 'ok', 4200, 'wa');
    if (typeof renderOptMenu === 'function' && !$('#optMenu').hidden) renderOptMenu();
  },
  /* where in the talk we should be right now, or null for silence */
  want() {
    const m = this.map; if (!m) return null;
    const T = (pNow() - m.off - this.nudge) / m.k; let hit = null;
    for (const p of this.pieces) { const end = p.v + p.len * p.k; if (T >= p.v && T < end) hit = p; } // a later piece wins: the recorder went back
    return hit ? hit.a + (T - hit.v) / hit.k : null;
  },
  sync(hard) {
    const a = this.a; if (!a) return;
    if (!F51.played()) { this.stop(); return; }
    const w = this.want(), rate = (video.playbackRate || 1) / ((this.map && this.map.k) || 1);
    if (w == null || video.paused || video.readyState < 3) { if (!a.paused) a.pause(); return; }
    if (a.readyState >= 1 && (hard || Math.abs(a.currentTime - w) > 0.3)) { try { a.currentTime = w; } catch (e) { /* not ready */ } }
    a.playbackRate = rate;
    if (a.paused) a.play().catch(() => {});
  },
  stop() {
    clearInterval(this.loop);
    if (this.a) { try { this.a.pause(); } catch (e) { /* gone */ } this.a.removeAttribute('src'); this.a = null; }
    if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = ''; }
    if (this.vol0 != null) { video.volume = this.vol0; this.vol0 = null; }
    this.t = null; this.map = null;
  },
  init() {
    const close = closePlayer;
    closePlayer = async function () { if (WatchAlong.rec) await WatchAlong.finish(); WatchAlong.stop(); return close.apply(this, arguments); };
    video.addEventListener('seeked', () => { if (this.a) this.sync(true); });
  },
};

/* ---------------- 6 When a service takes a file down ----------------
   Debrid services and hosts now remove files by name. Their messages are short codes; this says it plainly once and
   points at the other ways to watch, instead of a generic error. */
const SourceShock = {
  RE: /\b(451|infringing|copyright|dmca|removed (for|due to)|unavailable for legal|takedown|blocked by (the )?(host|provider))\b/i,
  seen: new Set(),
  note(text) {
    if (!this.RE.test(String(text || ''))) return false;
    const m = (P.ctx && P.ctx.meta) || D.meta; const key = m ? m.id : '';
    if (this.seen.has(key)) return true; this.seen.add(key);
    toast('Your service removed this file. That happens to every app that uses it, not just MKCinema. Try another source, or the other ways to watch on the film’s page.', 'err', 7000, 'shock');
    MKLog.add('warn', 'A source was taken down by its service');
    return true;
  },
  init() {
    // stream lists and playback errors both pass through the log
    const add = MKLog.add.bind(MKLog);
    MKLog.add = function (lvl, msg) { const r = add.apply(this, arguments); try { if (lvl !== 'info' && msg && !/taken down by its service/.test(msg)) SourceShock.note(msg); } catch (e) { /* never break logging */ } return r; };
  },
};

/* ---------------- Wiring ---------------- */
{
  if (CFG.waDuck === undefined) CFG.waDuck = true;
  if (CFG.homeServers === undefined) CFG.homeServers = true;
  if (CFG.noAddonCard === undefined) CFG.noAddonCard = true;
  YourApps.init(); OtherWays.init(); SeatLang.init(); PhoneLang.init(); WatchAlong.init(); SourceShock.init();
  const base = renderOptMenu;
  renderOptMenu = function () {
    base(); const m = $('#optMenu'); if (!m || !P.ctx || !P.stream) return;
    const h = $$('h5', m).find((x) => x.textContent === 'Watch your way');
    const html = `<button type="button" data-f51="wa"><i data-lucide="mic"></i>Watch-along · ${WatchAlong.t ? 'on' : WatchAlong.rec ? 'recording' : 'off'}</button>`;
    if (h) { const last = [...m.querySelectorAll('[data-f50]')].pop(); (last || h).insertAdjacentHTML('afterend', html); }
    else { const tools = $('h5', m); const block = `<h5>Watch your way</h5>${html}`; if (tools) tools.insertAdjacentHTML('beforebegin', block); else m.insertAdjacentHTML('afterbegin', block); }
    $$('[data-f51]', m).forEach((b) => b.addEventListener('click', () => { m.hidden = true; if (b.dataset.f51 === 'wa') WatchAlong.open(); }));
    icons();
  };
  scAddRows('home', null, [
    { group: 'Your apps and your server' },
    { key: 'yaPickBtn', label: 'Your streaming apps', help: 'Pick the services you pay for. A film on one of them gets a Watch on button that opens the app on Android, Android TV and Fire TV.', type: 'button', text: 'Choose', icon: 'tv', run: () => { closeLayer('settings'); YourApps.pick(); } },
    { key: 'homeServers', label: 'On your server', help: 'A row on Home with the newest films and shows on your Plex, Jellyfin or Emby server.', type: 'toggle' },
    { key: 'noAddonCard', label: 'Watch without addons card', help: 'When no source addon is installed, Home shows the ways to watch that need none.', type: 'toggle' },
  ]);
  scAddRows('playback', null, [
    { group: 'Watch-along' },
    { key: 'waDuck', label: 'Lower the film under a watch-along', help: 'The film plays quieter while someone’s commentary plays over it.', type: 'toggle' },
  ]);
  COMMANDS.push({ label: 'Your streaming apps', icon: 'tv', run: () => YourApps.pick() });
  COMMANDS.push({ label: 'Watch-along: play or record commentary', icon: 'mic', run: () => WatchAlong.open() });
}
