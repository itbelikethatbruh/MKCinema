
/* ---------------- 2.45.0 Addons as they are, shown better ----------------
   Nothing here needs an addon developer to change anything. MKCinema reads what addons already send:
   1. InfoRows: ratings addons that put a fake "stream" in the source list (IMDb Ratings, Ratings Aggregator and the
      like) become the same score icons as the title line (IMDb, TMDB, Rotten Tomatoes…) and a rating next to each episode. The rows leave
      the source list. Only rows MKCinema understands are moved: no link to play, an https page link, and a score.
   2. AddonNotice: debrid addons answer a failed or not-yet-downloaded source with a short notice clip (20 or 30 s,
      from their own host). That clip is caught when it loads, explained in
      plain words, and the next source plays instead. The clip is still one tap away.
   3. AddonSettings: addons built with Stremio's addon SDK describe their settings in manifest.config. The Addons
      screen shows that form itself, so it works on a TV, and saving swaps the addon in place, order kept.
   Settings › Playback › "Addons as they are" turns 1 and 2 off. */
const InfoRows = {
  KEY: 'infoAddons', TTL: 6 * 60 * 60 * 1000,
  SEED: ['imdb.ratings.local', 'community.ratings.aggregator'],
  SHORT: { 'rotten tomatoes': 'RT', rt: 'RT', tomatometer: 'RT', metacritic: 'MC', mc: 'MC', letterboxd: 'LB', kinopoisk: 'KP', 'кинопоиск': 'KP',
    imdb: 'IMDb', episode: 'IMDb', tmdb: 'TMDb', trakt: 'Trakt', mal: 'MAL', myanimelist: 'MAL', anilist: 'AniList', simkl: 'Simkl', series: 'Series' },
  AGE: /^(G|PG|PG-13|R|NC-17|NR|U|12A?|15|18|TV-(?:Y7?|G|PG|14|MA)|FSK ?\d{1,2}|\d{1,2}\+)$/i,
  data: new Map(), // `${type}/${id}` -> { by: Map(aid -> { from, title, eps, flat }), seasons: Set }
  on() { return CFG.infoRows !== false && !AddonUI.safe; },
  known() { const o = Store.raw.get(this.KEY, {}); return o && typeof o === 'object' ? o : {}; },
  learn(aid) { if (!aid || this.SEED.includes(aid)) return; const o = this.known(); if (!o[aid]) { o[aid] = Date.now(); Store.raw.set(this.KEY, o); } },
  /* ---- reading one row ---- */
  short(label) { const k = String(label).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim(); return this.SHORT[k] || AddonUI.txt(label, 7); },
  num(v) {
    const m = String(v).match(/^(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:\/\s*(10|100|5)\b|(%))?/); if (!m) return '';
    const n = m[1].replace(',', '.');
    if (m[2] === '100' || m[3]) return `${Math.round(parseFloat(n))}%`;
    if (m[2] === '5') return `${n}/5`;
    return n;
  },
  votes(v) {
    const t = String(v).replace(/[\s,]/g, ''); const m = t.match(/^([\d.]+)([KMB]?)$/i); if (!m) return '';
    const n = parseFloat(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()] || 1);
    return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
  },
  parse(s) {
    if (!s || s.infoHash || s.ytId || typeof s.externalUrl !== 'string') return null;
    if (s.url && s.url !== s.externalUrl) return null; // a row with something to play stays a source
    const link = AddonUI.url(s.externalUrl); if (!link) return null;
    const text = [s.name, s.description || s.title].filter((x) => typeof x === 'string').join('\n').slice(0, 2000);
    const out = { ratings: [], age: '', link }; let last = null;
    for (const raw of text.split('\n')) {
      const l = raw.replace(/^[^\p{L}\p{N}(]+/u, '').replace(/[\s─━—–=_-]+$/u, '').trim(); if (!l) continue;
      let m;
      if ((m = l.match(/^\(?\s*([\d.,]+\s*[KMB]?)\s+votes?\s*\)?$/i))) { if (last && !last.votes) last.votes = this.votes(m[1]); continue; }
      if ((m = l.match(/^(.{1,24}?)\s*[:：]\s*(.{1,48})$/))) {
        const label = m[1].trim(), val = m[2].trim(), sc = this.num(val);
        if (sc) { const vm = val.match(/\(([\d.,]+\s*[KMB]?)\s*votes?\)/i); last = { label: AddonUI.txt(label, 24), short: this.short(label), score: sc, votes: vm ? this.votes(vm[1]) : '' }; if (out.ratings.length < 6) out.ratings.push(last); continue; }
        if (/mpaa|rated|age|certif|fsk|bbfc/i.test(label) && this.AGE.test(val)) { out.age = out.age || val.toUpperCase(); continue; }
        continue;
      }
      if (this.AGE.test(l)) out.age = out.age || l.toUpperCase();
    }
    return out.ratings.length || out.age ? out : null;
  },
  info(s) { if (!this.on()) return null; if (s._infoP === undefined) s._infoP = this.parse(s); if (s._infoP) this.learn(s._addonId); return s._infoP; },
  /* ---- which addons to ask: ones seen sending such rows, plus two well-known ratings addons ---- */
  addons(type, id) {
    const k = this.known();
    return (engine.addons || []).filter((a) => a.enabled !== false && !a.virtual && a.manifest && (this.SEED.includes(a.manifest.id) || k[a.manifest.id])
      && AddonUI.allowed(a) && engine.supports(a, 'stream', type, id));
  },
  async ask(a, type, id) {
    const r = await engine.http(StremioEngine.streamUrl(a.baseUrl, type, id), { ttl: this.TTL, timeout: 8000 });
    const list = r && Array.isArray(r.streams) ? r.streams.slice(0, 20) : [];
    for (const s of list) { const p = this.parse(s); if (p) return p; }
    return null;
  },
  async pool(jobs, n) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) { const j = jobs[i++]; try { await j(); } catch (e) { /* that one stays empty */ } } })); },
  /* the title (a film), or the episodes of the season on screen; a series-wide score repeated on every episode
     (the same value three times) is shown once for the series instead */
  async load(m) {
    if (!this.on() || !m || !m.id) return false;
    const k = `${m.type}/${m.id}`, list = this.addons(m.type, m.id); if (!list.length) return false;
    const rec = this.data.get(k) || { by: new Map(), seasons: new Set() }; this.data.set(k, rec);
    if (this.data.size > 60) this.data.delete(this.data.keys().next().value);
    const slot = (a) => { const aid = a.manifest.id; if (!rec.by.has(aid)) rec.by.set(aid, { from: AddonUI.txt(a.manifest.name, 40) || 'an addon', title: null, eps: {}, flat: false, done: false }); return rec.by.get(aid); };
    const eps = m.type === 'series' && Array.isArray(m.videos) && m.videos.length;
    if (!eps) {
      const todo = list.filter((a) => !slot(a).done); if (!todo.length) return false;
      await Promise.all(todo.map(async (a) => { const x = slot(a); x.done = true; try { x.title = await this.ask(a, m.type, m.id); } catch (e) { /* none */ } }));
      return todo.some((a) => slot(a).title);
    }
    const season = D.season; if (season == null || rec.seasons.has(season)) return false; rec.seasons.add(season);
    const vids = ((seasonsOf(m).find(([s]) => s === season) || [0, []])[1]).slice(0, 60).map((v) => videoIdFor(m, v));
    let got = false;
    await Promise.all(list.map(async (a) => {
      const x = slot(a); if (x.flat) return;
      const first = vids.filter((v) => !(v in x.eps)).slice(0, 3);
      await this.pool(first.map((v) => async () => { x.eps[v] = await this.ask(a, 'series', v); }), 3);
      const seen = first.map((v) => x.eps[v]).filter(Boolean);
      if (seen.length >= 2 && seen.every((p) => JSON.stringify(p.ratings) === JSON.stringify(seen[0].ratings)) && vids.length > 2) {
        x.flat = true; x.title = x.title || seen[0]; x.eps = {}; got = true; return;
      }
      const rest = vids.filter((v) => !(v in x.eps));
      await this.pool(rest.map((v) => async () => { x.eps[v] = await this.ask(a, 'series', v); }), 4);
      // a "Series" score in an episode row belongs to the whole show
      if (!x.title) { const ser = Object.values(x.eps).find((p) => p && p.ratings.some((r) => r.short === 'Series')); if (ser) x.title = { ratings: ser.ratings.filter((r) => r.short === 'Series').map((r) => ({ ...r, short: 'IMDb', label: 'Series' })), age: ser.age, link: ser.link }; }
      if (!x.title) { const ag = Object.values(x.eps).find((p) => p && p.age); if (ag) x.title = { ratings: [], age: ag.age, link: '' }; }
      got = got || Object.values(x.eps).some(Boolean) || !!x.title;
    }));
    return got;
  },
  /* ---- drawing: the same score icons as the title line (rate/*.svg), never a generic panel ---- */
  ICON: { IMDb: 'imdb', TMDb: 'tmdb', RT: 'tomatoes', MC: 'metacritic', Trakt: 'trakt', LB: 'letterboxd' },
  NAME: { imdb: 'IMDb', tmdb: 'TMDB', tomatoes: 'Rotten Tomatoes', metacritic: 'Metacritic', trakt: 'Trakt', letterboxd: 'Letterboxd' },
  key(r) { return r.label === 'Series' ? 'imdb' : this.ICON[r.short] || ''; },
  badge(r, cls) {
    const k = this.key(r), sc = esc(AddonUI.txt(String(r.score).replace(/\/10$/, ''), 12));
    if (k === 'imdb') return `<span class="imdb ${cls} ${typeof rateTier === 'function' ? rateTier(parseFloat(r.score)) : ''}"><b>IMDb</b>${sc}</span>`;
    if (k) return `<span class="rbadge ${cls}" data-s="${k}" title="${esc(this.NAME[k])}"><img src="rate/${k}.svg" alt="${esc(this.NAME[k])}">${sc}</span>`;
    return `<span class="rbadge ${cls}" title="${esc(r.label)}"><b class="ir-src">${esc(AddonUI.txt(r.short, 7))}</b>${sc}</span>`;
  },
  rec() { const m = D.meta; return m && this.on() ? this.data.get(`${m.type}/${m.id}`) : null; },
  paintTitle() {
    const line = $('#detailPanel .metaline'); if (!line) return;
    $$('.ir-x', line).forEach((x) => x.remove());
    const rec = this.rec(); if (!rec) return;
    const have = new Set($$('.rbadges [data-s]', line).map((x) => x.dataset.s)), im = $('.imdb', line);
    if (im) have.add('imdb');
    const parts = [], seen = new Set(); let age = '', votes = '';
    rec.by.forEach((x) => {
      const t = x.title; if (!t) return;
      t.ratings.forEach((r) => {
        const k = this.key(r) || `x:${r.short}`;
        if (k === 'imdb' && r.votes && !votes) votes = r.votes;
        if (seen.has(k) || have.has(k)) return; seen.add(k);
        if (k === 'imdb') parts.push(`<span class="imdb ir-x ${typeof rateTier === 'function' ? rateTier(parseFloat(r.score)) : ''}"><b>IMDb</b>${esc(AddonUI.txt(r.score, 6))}</span>`);
        else parts.push(this.badge(r, 'ir-x'));
      });
      if (t.age && !age) age = t.age;
    });
    let html = parts.join('');
    if (votes) html = `<span class="ir-votes ir-x">${esc(votes)} votes</span>` + html;
    if (age) html += `<span class="tag-s ir-x" title="Age rating">${esc(AddonUI.txt(age, 10))}</span>`;
    if (!html) return;
    const at = $('.rbadges', line) || im;
    if (at) at.insertAdjacentHTML('afterend', html); else line.insertAdjacentHTML('afterbegin', html);
  },
  paintEps(root) {
    const rec = this.rec(); if (!root || !rec) return;
    $$('.ep[data-vid]', root).forEach((b) => {
      const num = b.querySelector('.num'); if (!num) return;
      const old = num.querySelector('.ir-ep'); if (old) old.remove();
      let r = null; rec.by.forEach((x) => { const p = !r && x.eps[b.dataset.vid]; if (p) r = p.ratings.find((q) => q.label !== 'Series') || null; });
      if (r) num.insertAdjacentHTML('beforeend', this.badge(r, 'ir-ep'));
    });
  },
  paint() { try { this.paintTitle(); this.paintEps(document.getElementById('detail')); } catch (e) { /* the page works without it */ } },
  rows() {
    return [
      { group: 'Addons as they are' },
      { key: 'infoRows', label: 'Ratings rows as badges', help: 'Ratings addons that show up as a row in the source list are shown on the film page and next to each episode instead.', type: 'toggle', get: () => CFG.infoRows !== false },
      { key: 'addonNotice', label: 'Explain addon notice clips', help: 'When an addon plays a short notice instead of the film (not downloaded yet, a limit, a failed link), MKCinema says why and tries the next source.', type: 'toggle', get: () => CFG.addonNotice !== false },
    ];
  },
  init() {
    // the rows leave the source list (and so automatic picking, which never chose them anyway)
    const vs = visibleStreams;
    visibleStreams = function (streams) { return vs.call(this, streams).filter((s) => !InfoRows.info(s)); };
    const eh = episodesHTML;
    episodesHTML = function () { const h = eh.apply(this, arguments); if (!InfoRows.rec()) return h; const box = document.createElement('div'); box.innerHTML = h; InfoRows.paintEps(box); return box.innerHTML; };
    // scores from the viewer's own keys (2.34) arrive later; ours step aside for any site they already show
    const rp = RateBadges.put;
    RateBadges.put = function () { const r = rp.apply(this, arguments); InfoRows.paintTitle(); return r; };
    const rd = renderDetail;
    renderDetail = function () {
      const r = rd.apply(this, arguments);
      try {
        const m = D.meta;
        if (m && m.id && InfoRows.on()) { InfoRows.paint(); InfoRows.load(m).then((got) => { if (got && D.meta && D.meta.id === m.id) InfoRows.paint(); }).catch(() => {}); }
      } catch (e) { /* the page works without it */ }
      return r;
    };
    const pb = secById('playback'); if (pb) { const rows = pb.rows; pb.rows = () => [...rows(), ...this.rows()]; }
  },
};

/* ---------------- Notice clips instead of the film ---------------- */
const AddonNotice = {
  LENS: [20, 30], block: null,
  on() { return CFG.addonNotice !== false; },
  addonOf(s) { return (engine.addons || []).find((x) => x.manifest && x.manifest.id === s._addonId && !x.virtual) || null; },
  // the clip comes from the addon's own host, through a link that resolves the source when it is opened
  suspect(s) {
    if (!this.on() || !s || !s.url || s._local || s.ytId || s._handoff || (s._tel && s._tel.isTrailer)) return false;
    const a = this.addonOf(s); if (!a) return false;
    try { return new URL(s.url).host === new URL(a.baseUrl).host; } catch (e) { return false; }
  },
  isClip() { const d = video.duration; return isFinite(d) && this.LENS.some((L) => Math.abs(d - L) < 0.3); },
  waiting(s) { const t = [s.name, s.title, s.description].filter(Boolean).join(' '); return (s._tel && s._tel.cached === false) || /\bdownload\b|uncached|not cached|⏳/i.test(t); },
  caught(s) {
    s._notice = true; this.block = s; video.pause(); video.style.opacity = '0'; Loader.hide();
    const a = this.addonOf(s), name = esc((a && a.manifest.name) || s._addon || 'The addon'), wait = this.waiting(s);
    if (s._tel) s._tel.cached = false; // never picked again by the automatic switch this episode
    try { MKLog.add('info', `notice clip from ${(a && a.manifest.id) || '?'} (${wait ? 'not downloaded yet' : 'failed'})`); } catch (e) { /* no log */ }
    const n = CFG.failover && Failover.candidates(s)[0];
    if (n) {
      Failover.tried.add(s); Failover.hops = (Failover.hops || 0) + 1;
      toast(wait ? `That source isn’t downloaded to your debrid service yet. Trying the next one…` : `${(a && a.manifest.name) || 'The addon'} couldn’t open that source. Trying the next one…`, 'info', 4600, 'failover');
      playStream(P.ctx, n, { startAt: P.startAt || 0 });
      return;
    }
    const body = wait
      ? `${name} asked your debrid service to download this file, so for now it sends a short notice clip instead of the film. That can take a few minutes. Pick another source, or try this one again later.`
      : `${name} couldn’t get a playable file for this source and sent a short notice clip instead. Usually the debrid service couldn’t open the file, your account reached a limit, or the addon’s settings need a key. The clip says which.`;
    showMsg('The addon sent a notice, not the film', body,
      `<button class="btn btn-prime" type="button" data-act="sources"><i data-lucide="layers"></i>Other sources</button><button class="btn btn-ghost" type="button" data-mkn="retry"><i data-lucide="refresh-cw"></i>Try again</button><button class="btn btn-ghost" type="button" data-mkn="show"><i data-lucide="message-square-text"></i>Show the notice</button>`);
    $$('#pMsg [data-mkn]').forEach((b) => b.addEventListener('click', () => {
      if (P.stream !== s) return;
      if (b.dataset.mkn === 'show') { this.block = null; video.style.opacity = ''; hideMsg(); video.currentTime = 0; video.play().catch(() => wakeHud(true)); }
      else { this.block = null; s._notice = false; hideMsg(); playStream(P.ctx, s, { startAt: P.startAt || 0 }); }
    }));
  },
  init() {
    // registered before any loadUrl() listener, so it runs before playback starts
    video.addEventListener('loadedmetadata', () => { const s = P.stream; if (s && !$('#player').hidden && this.suspect(s) && this.isClip()) this.caught(s); });
    video.addEventListener('play', () => { if (this.block && this.block === P.stream) video.pause(); });
    video.addEventListener('loadstart', () => { if (this.block !== P.stream || !this.block) { this.block = null; video.style.opacity = ''; } });
  },
};

/* ---------------- Settings forms from the addon SDK's manifest.config ----------------
   The SDK reads settings from the path: {base}/{encodeURIComponent(JSON.stringify(config))}/manifest.json, values as
   text, a ticked checkbox as "on" and an unticked one left out. That is what its own /configure page builds. */
const AddonSettings = {
  open: '', TYPES: ['text', 'number', 'password', 'checkbox', 'select'],
  fields(a) {
    const c = a && !a.virtual && !a.builtin && a.manifest && a.manifest.config;
    if (!Array.isArray(c)) return [];
    return c.filter((f) => f && typeof f.key === 'string' && /^[\w.-]{1,60}$/.test(f.key) && this.TYPES.includes(f.type)).slice(0, 60);
  },
  split(base) {
    const u = new URL(base), segs = u.pathname.split('/').filter(Boolean); let cur = null;
    const last = segs[segs.length - 1];
    if (last) { try { const v = JSON.parse(decodeURIComponent(last)); if (v && typeof v === 'object' && !Array.isArray(v)) { cur = v; segs.pop(); } } catch (e) { /* not a settings segment */ } }
    return { root: u.origin + (segs.length ? `/${segs.join('/')}` : ''), cur };
  },
  label(f) { return AddonUI.txt(f.title || f.key, 80); },
  value(f, cur) { const v = cur ? cur[f.key] : f.default; return v == null ? '' : String(v); },
  html(a) {
    const fs = this.fields(a); let cur = null; try { cur = this.split(a.baseUrl).cur; } catch (e) { /* plain link */ }
    const row = (f, i) => {
      const id = `mkcf${i}`, req = f.required ? ' <em>required</em>' : '', v = this.value(f, cur);
      if (f.type === 'checkbox') { const on = cur ? cur[f.key] === 'on' || cur[f.key] === true : f.default === 'checked' || f.default === true || f.default === 'on'; return `<div class="mk-cf mk-cf-b"><span>${esc(this.label(f))}</span><button class="switch ${on ? 'on' : ''}" type="button" data-nav role="switch" aria-checked="${on}" data-cfk="${esc(f.key)}" aria-label="${esc(this.label(f))}"></button></div>`; }
      if (f.type === 'select') {
        const opts = (Array.isArray(f.options) ? f.options : []).filter((o) => typeof o === 'string' || typeof o === 'number').slice(0, 40).map(String);
        const sel = opts.includes(v) ? v : opts[0] || '';
        return `<div class="mk-cf"><span>${esc(this.label(f))}${req}</span><div class="segc mk-cf-o" data-cfk="${esc(f.key)}" data-v="${esc(sel)}">${opts.map((o) => `<button type="button" data-nav class="${o === sel ? 'on' : ''}" data-o="${esc(o)}" aria-pressed="${o === sel}">${esc(AddonUI.txt(o, 40))}</button>`).join('')}</div></div>`;
      }
      const t = f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text';
      return `<label class="mk-cf" for="${id}"><span>${esc(this.label(f))}${req}</span><input class="inp${t === 'text' ? '' : ' mono'}" id="${id}" type="${t}" data-cfk="${esc(f.key)}" value="${esc(v)}" autocomplete="off" spellcheck="false"${t === 'number' ? ' inputmode="decimal"' : ''}></label>`;
    };
    return `<form class="mk-cfg" data-cfg="${esc(a.baseUrl)}" novalidate><p class="mk-cfg-h">Settings for ${esc(AddonUI.txt(a.manifest.name, 40))}. They’re saved in the addon link, the same way its own setup page does it.</p>
      ${fs.map(row).join('')}
      <div class="mk-cfg-a"><button class="btn btn-prime btn-sm" type="submit" data-nav><i data-lucide="check"></i>Save</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-cfx><i data-lucide="x"></i>Cancel</button></div></form>`;
  },
  read(form, a) {
    const out = {}, miss = [];
    this.fields(a).forEach((f) => {
      const el = form.querySelector(`[data-cfk="${CSS.escape(f.key)}"]`); if (!el) return;
      if (f.type === 'checkbox') { if (el.classList.contains('on')) out[f.key] = 'on'; return; }
      const v = f.type === 'select' ? el.dataset.v || '' : String(el.value || '').trim();
      if (v !== '') out[f.key] = v; else if (f.required) miss.push(this.label(f));
    });
    return { out, miss };
  },
  async save(form, a) {
    const { out, miss } = this.read(form, a);
    if (miss.length) { toast(`Fill in ${miss.slice(0, 2).join(' and ')} first`, 'err', 4200); return; }
    const { root } = this.split(a.baseUrl);
    const url = Object.keys(out).length ? `${root}/${encodeURIComponent(JSON.stringify(out))}/manifest.json` : `${root}/manifest.json`;
    const btn = form.querySelector('[type=submit]'); if (btn) btn.disabled = true;
    try {
      const i = engine.addons.indexOf(a), on = a.enabled, old = a.baseUrl;
      const nb = await engine.install(url, { position: i < 0 ? undefined : i, silent: true });
      if (nb.baseUrl !== old) engine.addons = engine.addons.filter((x) => x.baseUrl !== old);
      nb.enabled = on; this.open = '';
      engine.clearCache(); engine.persist(); engine.emit('addons');
      toast(`Saved. ${a.manifest.name} uses the new settings now.`, 'ok');
    } catch (e) {
      toast(`Couldn’t save: ${/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? 'the addon did not answer' : e.message}`, 'err', 6000);
      if (btn) btn.disabled = false;
    }
  },
  draw() {
    const cards = $$('#addonList > .addon'); if (cards.length !== engine.addons.length) return;
    cards.forEach((c, i) => {
      const a = engine.addons[i]; if (!this.fields(a).length || $('[data-cfgo]', c)) return;
      const tools = $('.addon-tools', c), sw = tools && $('.switch', tools); if (!sw) return;
      sw.insertAdjacentHTML('beforebegin', `<button class="ibtn${this.open === a.baseUrl ? ' on' : ''}" type="button" data-cfgo="${i}" aria-label="Settings for ${esc(a.manifest.name)}" title="Settings"><i data-lucide="settings-2"></i></button>`);
      if (this.open === a.baseUrl) { const at = $('.url', c); if (at) at.insertAdjacentHTML('afterend', this.html(a)); }
    });
    icons();
    $$('#addonList [data-cfgo]').forEach((b) => b.addEventListener('click', () => {
      const a = engine.addons[Number(b.dataset.cfgo)]; if (!a) return;
      this.open = this.open === a.baseUrl ? '' : a.baseUrl; renderAddons();
      if (this.open) { const f = $(`#addonList .mk-cfg`); const first = f && f.querySelector('input, .switch, .segc button'); if (first && !TOUCH_UI) setTimeout(() => (typeof Nav !== 'undefined' && IS_TV ? Nav.focus(first) : first.focus({ preventScroll: false })), 40); }
    }));
    const form = $('#addonList .mk-cfg'); if (!form) return;
    const a = engine.addons.find((x) => x.baseUrl === form.dataset.cfg); if (!a) return;
    $$('.switch[data-cfk]', form).forEach((b) => b.addEventListener('click', () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }));
    $$('.mk-cf-o', form).forEach((g) => $$('[data-o]', g).forEach((b) => b.addEventListener('click', () => { g.dataset.v = b.dataset.o; $$('[data-o]', g).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); })));
    $('[data-cfx]', form).addEventListener('click', () => { this.open = ''; renderAddons(); });
    form.addEventListener('submit', (e) => { e.preventDefault(); this.save(form, a); });
  },
  init() {
    const ra = renderAddons;
    renderAddons = function () { const r = ra.apply(this, arguments); try { AddonSettings.draw(); } catch (e) { /* the list still works */ } return r; };
  },
};

[InfoRows, AddonNotice, AddonSettings].forEach((m) => {
  try { m.init(); } catch (e) { try { MKLog.add('error', `2.45 ${Object.keys(m)[0]}: ${e.message}`); } catch (_) { /* no log */ } console.warn('2.45 module skipped', e); }
});
