/* ---------------- 2.25.0 Sports hub ----------------
   Live sports from the user's own sources, sorted by sport. MKCinema ships no sports streams or channels: the hub reads
   the tv and channel catalogs of the installed addons, any catalog whose own name says it is about sport, and the
   user's own TV playlists, then sorts what it finds into Football, Basketball, Fight sports and so on by name, genre
   and group. Channels tune straight away, like Live TV; events and replays open their page so a source can be picked. */
const SportsHub = {
  CATS: [
    ['football', 'Football', /\b(soccer|football club|futbol|futebol|fussball|calcio|premier league|epl|la ?liga|laliga|serie a|bundesliga|ligue 1|eredivisie|champions league|europa league|conference league|uefa|fifa|world cup|copa|mls|liga mx|efl|fa cup|carabao|scottish premiership|saudi pro league|eliteserien|allsvenskan|super lig|primeira liga|a-league|j1 league|k league|real madrid|barcelona|man(chester)? (united|city|utd)|liverpool|arsenal|chelsea|tottenham|juventus|psg|bayern|inter miami|celtic|rangers fc)\b/],
    ['american', 'American football', /\b(nfl|ncaaf|college football|american football|super bowl|redzone|red zone|cfl|xfl|ufl)\b/],
    ['basketball', 'Basketball', /\b(basketball|nba|wnba|ncaab|march madness|euroleague|eurocup|fiba|nbl|g league)\b/],
    ['baseball', 'Baseball', /\b(baseball|mlb|npb|kbo|world series)\b/],
    ['hockey', 'Ice hockey', /\b(hockey|nhl|khl|ahl|shl|liiga|stanley cup)\b/],
    ['fight', 'Fight sports', /\b(ufc|mma|boxing|box(ing)? nation|bellator|pfl|one championship|one fc|bkfc|kickboxing|glory|muay thai|wwe|aew|wrestling|smackdown|njpw|ppv|fight night|dazn boxing)\b/],
    ['motor', 'Motorsport', /\b(f1|formula ?1|formula one|formula [234e]|motogp|moto ?gp|moto2|moto3|nascar|indycar|wrc|rally|dakar|le mans|wec|imsa|supercars|btcc|dtm|superbike|wsbk|motorsport|motor sport|grand prix)\b/],
    ['tennis', 'Tennis', /\b(tennis|atp|wta|wimbledon|roland garros|french open|us open tennis|australian open|davis cup|tennis channel)\b/],
    ['cricket', 'Cricket', /\b(cricket|ipl|icc|bbl|big bash|psl|the hundred|test match|t20|odi|willow)\b/],
    ['rugby', 'Rugby', /\b(rugby|six nations|nrl|super rugby|premiership rugby|top 14|urc|rugby league|rugby union)\b/],
    ['golf', 'Golf', /\b(golf|pga|lpga|liv golf|dp world tour|ryder cup|the masters|open championship)\b/],
    ['cycling', 'Cycling', /\b(cycling|tour de france|giro|vuelta|uci)\b/],
    ['other', 'More sports', /\b(darts|snooker|pdc|volleyball|handball|olympics?|paralympics?|swimming|gymnastics|skiing|biathlon|esports?|horse racing|racing tv|equestrian|table tennis|badminton|lacrosse|afl|gaa|hurling|netball|curling|sailing|surfing|poker)\b/],
    ['channels', 'Sports channels', /\b(sports?|espn|sky sports?|bein|dazn|tnt sports?|bt sport|eurosport|fox sports?|fs1|fs2|nbc ?sn|cbs sports|tsn|sportsnet|supersport|star sports|sony (ten|six|sports)|ssc|arena sport|sport ?tv|eleven sports|premier sports|viaplay sports?|canal\+ sport|movistar (deportes|laliga|liga)|setanta|optus sport|kayo|stan sport|nfl network|nba tv|mlb network|nhl network|golf channel|willow|redzone|deportes|esporte|sportitalia)\b/],
  ],
  // American football is checked before Football, so "NFL football" lands there; plain "football" is the world's game
  MATCH: ['american', 'football', 'basketball', 'baseball', 'hockey', 'fight', 'motor', 'tennis', 'cricket', 'rugby', 'golf', 'cycling', 'other', 'channels'],
  // a matchup ("Lakers vs Celtics") with no league in its name: the team names decide, the sport with most hits wins
  VS: /\s(vs?\.?|v\.?|@|at|x)\s/i,
  TEAMS: [
    ['basketball', /\b(lakers|celtics|warriors|knicks|bulls|76ers|sixers|bucks|nuggets|suns|mavericks|mavs|clippers|grizzlies|pelicans|timberwolves|wolves|thunder|rockets|raptors|cavaliers|cavs|pistons|pacers|hornets|wizards|trail blazers|blazers)\b/g],
    ['hockey', /\b(bruins|maple leafs|canadiens|habs|red wings|blackhawks|penguins|flyers|capitals|caps|lightning|oilers|flames|canucks|avalanche|golden knights|kraken|blue jackets|sabres|senators|predators|hurricanes|islanders|devils|ducks|sharks|utah hockey club)\b/g],
    ['baseball', /\b(yankees|red sox|dodgers|mets|cubs|white sox|astros|braves|phillies|padres|mariners|orioles|blue jays|guardians|royals|marlins|nationals|brewers|pirates|rockies|diamondbacks|d backs|rays)\b/g],
    ['american', /\b(chiefs|bills|patriots|cowboys|eagles|packers|steelers|ravens|bengals|browns|49ers|niners|seahawks|broncos|raiders|chargers|dolphins|commanders|buccaneers|bucs|saints|falcons|vikings|bears|lions|texans|colts|titans|jaguars|rams)\b/g],
  ],
  matchup(name) {
    const t = this.norm(name); if (!this.VS.test(` ${t} `)) return null;
    let best = null, top = 0;
    for (const [id, re] of this.TEAMS) { const n = (t.match(re) || []).length; if (n > top) { top = n; best = id; } }
    return best;
  },
  SPORTY: /\b(sports?|live ?events?|events?|matches|fixtures|games? today|ppv|deportes|esportes?|sportif|fußball|fussball|football|soccer|nfl|nba|mlb|nhl|ufc|f1|motogp|boxing|wrestling|cricket|rugby|tennis|golf)\b/,
  TTL: 4 * 60e3,
  st: { cat: '', src: '' }, items: [], at: 0, busy: null, token: 0, failed: [],
  icon() {
    if (window.lucide && lucide.icons && !lucide.icons.Trophy) lucide.icons.Trophy = [['path', { d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }], ['path', { d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }], ['path', { d: 'M4 22h16' }], ['path', { d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }], ['path', { d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }], ['path', { d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' }]];
  },
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_|/·•:\-–—()[\]]+/g, ' ').replace(/\s+/g, ' '); },
  sporty(s) { return this.SPORTY.test(this.norm(s)); },
  /* the sport an item belongs to: its own name first, then its genres, then the catalog or playlist group it came from */
  classify(name, tags, from) {
    const vs = this.matchup(name);
    for (const text of [name, tags, from]) {
      const t = this.norm(text); if (!t) continue;
      for (const id of this.MATCH) { if (id === 'other' && vs) return vs; const re = this.CATS.find((c) => c[0] === id)[2]; if (re.test(t)) return id; }
      if (text === name && vs) return vs;
    }
    return null;
  },
  /* catalogs worth reading: every tv or channel catalog, and any other catalog that says it is about sport.
     Movie and series catalogs only count when their own name does, so a "Sport" film genre never fills the hub. */
  sources() {
    const out = [];
    for (const c of engine.catalogs({ includeRequired: true })) {
      if (c.required.some((r) => r !== 'genre')) continue;
      const live = c.type === 'tv' || c.type === 'channel' || c.type === 'events';
      const named = this.sporty(`${c.type} ${c.id} ${c.name}`);
      if (!live && !named) continue;
      const genres = (c.genres || []).filter((g) => this.sporty(g) || this.classify(g, '', '')).slice(0, 8);
      if (c.genreRequired && !genres.length) continue;
      const reqs = [];
      if (!c.genreRequired) reqs.push({ extra: {}, tag: '' });
      genres.forEach((g) => reqs.push({ extra: { genre: g }, tag: g }));
      out.push({ c, live, named, reqs });
    }
    return out;
  },
  async collect() {
    const found = new Map(), failed = [];
    const add = (it) => { const k = it.key; if (!found.has(k)) found.set(k, it); else if (!found.get(k).tag && it.tag) found.get(k).tag = it.tag; };
    const jobs = [];
    for (const { c, named, reqs } of this.sources()) {
      for (const r of reqs.slice(0, 9)) {
        jobs.push(engine.fetchCatalog(c, r.extra).then((metas) => {
          metas.slice(0, 200).forEach((m) => {
            const tags = genresOf(m).join(' '), from = `${r.tag} ${c.name}`;
            let cat = this.classify(m.name, tags, from);
            // a plain tv catalog only gives what is about sport; a sport catalog gives everything it lists
            if (!cat && (named || r.tag)) cat = 'other';
            if (!cat) return;
            const type = m.type || c.type;
            add({ key: `${type}:${m.id}`, cat, tag: r.tag, name: m.name || m.id, type, meta: remember({ ...m, type }), source: c.addon.manifest.name, src: c.addon.baseUrl, live: type === 'tv' || type === 'channel' });
          });
        }).catch((e) => { failed.push(c.addon.manifest.name); MKLog.add('warn', `sports: ${c.addon.manifest.name}/${c.id} ${e.message}`); }));
      }
    }
    // the user's own TV playlists: channels whose name or group is about sport
    const lists = typeof Channels !== 'undefined' && Channels.lists ? Channels.lists() : [];
    for (const l of lists) {
      jobs.push(Channels.load(l).then((d) => {
        let n = 0;
        for (const ch of d.channels) {
          if (n >= 400) break;
          const cat = this.classify(ch.name, '', ch.group); if (!cat) continue;
          n++;
          add({ key: `iptv:${l.id}:${ch.url}`, cat, tag: ch.group || '', name: ch.name, type: 'tv', iptv: ch, logo: ch.logo, source: l.name, src: `iptv:${l.id}`, live: true });
        }
      }).catch(() => failed.push(l.name)));
    }
    await Promise.allSettled(jobs);
    this.failed = [...new Set(failed)];
    return [...found.values()];
  },
  async refresh(force) {
    if (!force && this.items.length && Date.now() - this.at < this.TTL) return this.items;
    if (this.busy) return this.busy;
    this.busy = this.collect().then((x) => { this.items = x; this.at = Date.now(); return x; }).finally(() => { this.busy = null; });
    return this.busy;
  },
  label(id) { const c = this.CATS.find((x) => x[0] === id); return c ? c[1] : id; },
  art(it) {
    const m = it.meta || {}, bg = m.background, pic = it.logo || m.logo || m.poster;
    if (bg) return `<img src="${esc(bg)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`;
    if (pic) return `<img class="shub-logo" src="${esc(pic)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">`;
    return `<span class="shub-mono">${esc((it.name || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase())}</span>`;
  },
  tile(it, i) {
    const sub = [it.tag && this.norm(it.tag) !== this.norm(this.label(it.cat)) ? it.tag : '', it.source].filter(Boolean).join(' · ');
    return `<button class="shub-tile" type="button" data-nav data-sp="${i}" aria-label="${esc(it.name)}"><span class="shub-art">${this.art(it)}${it.live ? '<span class="shub-live">Live</span>' : ''}</span><span class="shub-meta"><b>${esc(it.name)}</b><small>${esc(sub)}</small></span></button>`;
  },
  open(it) {
    if (!it) return;
    if (it.iptv) { Channels.tune(it.iptv); return; }
    if (it.type === 'tv' || it.type === 'channel') { tuneChannel(it.meta); return; }
    openDetail(it.meta);
  },
  head(counts, total) {
    const srcs = [...new Map(this.items.map((x) => [x.src, x.source])).entries()];
    const chips = [['', `All · ${total}`], ...this.CATS.filter(([id]) => counts[id]).map(([id, l]) => [id, `${l} · ${counts[id]}`])];
    return `<div class="net-head shub-head"><h1 class="page-title">Sports</h1>
      <p class="page-sub">Live sports and sports channels from your own addons and playlists, sorted by sport. MKCinema ships none of its own.</p>
      <div class="toolbar shub-bar"><div class="chips" id="spCats" role="radiogroup" aria-label="Sport">${chips.map(([id, l]) => `<button type="button" class="chip ${this.st.cat === id ? 'on' : ''}" role="radio" aria-checked="${this.st.cat === id}" data-nav data-spcat="${id}">${esc(l)}</button>`).join('')}</div>
      ${srcs.length > 1 ? `<select class="sel" id="spSrc" aria-label="Source"><option value="">All sources</option>${srcs.map(([v, l]) => `<option value="${esc(v)}" ${this.st.src === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
      <button class="btn btn-ghost btn-sm" type="button" data-nav id="spRefresh" title="Ask your sources again"><i data-lucide="refresh-cw"></i>Refresh</button></div></div>`;
  },
  empty() {
    return `<div class="net-head shub-head"><h1 class="page-title">Sports</h1></div><div class="empty-state"><i data-lucide="trophy"></i><h3>No sports sources yet</h3>
      <p>MKCinema does not ship any sports streams or channels. This page fills in from your own sources: Stremio addons with live TV, channel or sport catalogs, and TV playlists from services you subscribe to. Games and channels are sorted into Football, Basketball, Fight sports, Motorsport and more.</p>
      <div class="actions" style="justify-content:center"><button class="btn btn-prime" type="button" data-nav id="spAddons"><i data-lucide="puzzle"></i>Open addons</button>${typeof Channels !== 'undefined' ? '<button class="btn btn-ghost" type="button" data-nav id="spList"><i data-lucide="list-video"></i>Add your own playlist</button>' : ''}</div></div>`;
  },
  async render(force) {
    const box = $('#sportsBody'); if (!box) return;
    if (this.kids()) { box.innerHTML = '<div class="empty-state"><i data-lucide="lock"></i><h3>Not on kids seats</h3><p>Live sports come straight from your sources and are not filtered for age.</p></div>'; icons(); return; }
    const tok = ++this.token;
    const hasSrc = this.sources().length || (typeof Channels !== 'undefined' && Channels.lists && Channels.lists().length);
    if (!hasSrc) { this.items = []; box.innerHTML = this.empty(); this.bindEmpty(box); return; }
    if (force || !this.items.length || Date.now() - this.at >= this.TTL) {
      box.innerHTML = `<div class="net-head shub-head"><h1 class="page-title">Sports</h1></div><div class="status-line" style="padding:22px 2px"><span class="spin"></span>Finding live sports in your sources…</div>`;
    }
    await this.refresh(force);
    if (tok !== this.token || S.view !== 'sports' || !$('#sportsBody')) return;
    this.paint();
  },
  paint() {
    const box = $('#sportsBody'); if (!box) return;
    const pool = this.items.filter((x) => !this.st.src || x.src === this.st.src);
    const counts = {}; pool.forEach((x) => { counts[x.cat] = (counts[x.cat] || 0) + 1; });
    if (this.st.cat && !counts[this.st.cat]) this.st.cat = '';
    if (!this.items.length) {
      box.innerHTML = `${this.head(counts, 0)}<div class="empty-state"><i data-lucide="trophy"></i><h3>No sports found right now</h3><p>Your sources answered, but nothing in them looks like sport${this.failed.length ? `, and ${esc(this.failed.join(', '))} did not answer` : ''}. Live events often appear shortly before kick-off, so try again later, or add a source that lists sport.</p><div class="actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-nav id="spAddons"><i data-lucide="puzzle"></i>Open addons</button></div></div>`;
      this.bindHead(box); this.bindEmpty(box); return;
    }
    this.view = pool;
    let body;
    if (this.st.cat) {
      const list = pool.map((x, i) => [x, i]).filter(([x]) => x.cat === this.st.cat).slice(0, IS_TV ? 120 : 300);
      body = `<div class="shub-grid">${list.map(([x, i]) => this.tile(x, i)).join('')}</div>`;
    } else {
      body = `<div class="rows shub-rows">${this.CATS.filter(([id]) => counts[id]).map(([id, l]) => {
        const list = pool.map((x, i) => [x, i]).filter(([x]) => x.cat === id), more = list.length > 24;
        return `<section class="row shub-row"><div class="row-head"><h2 class="row-title">${esc(l)} <small>${list.length}</small></h2>${more ? `<button class="row-more" type="button" data-nav data-spall="${id}">See all<i data-lucide="chevron-right"></i></button>` : ''}</div><div class="rail">${list.slice(0, 24).map(([x, i]) => this.tile(x, i)).join('')}</div></section>`;
      }).join('')}</div>`;
    }
    const note = this.failed.length ? `<p class="tour-note shub-note">${esc(this.failed.join(', '))} did not answer. What they list will show after a refresh.</p>` : '';
    box.innerHTML = this.head(counts, pool.length) + note + body;
    this.bindHead(box);
    $$('[data-sp]', box).forEach((b) => b.addEventListener('click', () => this.open(this.view[Number(b.dataset.sp)])));
    $$('[data-spall]', box).forEach((b) => b.addEventListener('click', () => { this.st.cat = b.dataset.spall; this.paint(); scrollTo({ top: 0 }); }));
    icons();
    if (IS_TV) Nav.settle();
  },
  bindHead(box) {
    $$('[data-spcat]', box).forEach((b) => b.addEventListener('click', () => {
      this.st.cat = b.dataset.spcat; this.paint();
      if (IS_TV) { const n = $(`[data-spcat="${this.st.cat}"]`); if (n) Nav.focus(n, true); }
    }));
    const s = $('#spSrc', box); if (s) s.onchange = () => { this.st.src = s.value; this.paint(); };
    const r = $('#spRefresh', box); if (r) r.onclick = () => this.render(true);
  },
  bindEmpty(box) {
    icons();
    const a = $('#spAddons', box); if (a) a.onclick = () => $('#openAddons').click();
    const l = $('#spList', box); if (l) l.onclick = () => { go('tv'); Channels.openAdd(); };
  },
  init() {
    this.icon();
    if (!$('#view-sports')) {
      const anchor = $('#view-tv') || $('.view:last-of-type');
      anchor.insertAdjacentHTML('afterend', '<section class="view" id="view-sports" aria-label="Sports"><div id="sportsBody"></div></section>');
    }
    const tv = $('#tabs .tab[data-view="tv"]');
    if (tv && !$('#tabs .tab[data-view="sports"]')) {
      tv.insertAdjacentHTML('afterend', '<button class="tab" data-view="sports" data-nav type="button" title="Sports"><i data-lucide="trophy"></i><span class="lbl">Sports</span></button>');
      $('#tabs .tab[data-view="sports"]').addEventListener('click', () => go('sports'));
    }
    const mtv = $('#mtabs [data-view="tv"]');
    if (mtv && !$('#mtabs [data-view="sports"]')) {
      mtv.insertAdjacentHTML('afterend', '<button type="button" data-view="sports" data-nav><i data-lucide="trophy"></i><span>Sports</span></button>');
      $('#mtabs [data-view="sports"]').addEventListener('click', () => go('sports'));
    }
    const g0 = go; go = function (view) { const r = g0.apply(this, arguments); if (view === 'sports') SportsHub.render(); return r; };
    // new or removed addons change what the hub can read
    const again = debounce(() => { if (S.view === 'sports') SportsHub.render(); }, 500);
    engine.on((ev) => { if (ev !== 'addons') return; SportsHub.at = 0; again(); });
    COMMANDS.push({ label: 'Browse live sports', icon: 'trophy', run: () => go('sports') });
    icons();
    if (/^#sports$/.test(location.hash)) setTimeout(() => go('sports'), 0);
  },
};
SportsHub.init();
