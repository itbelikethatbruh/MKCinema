
/* 2.96 Sports: the match centre (replaces the old "Scores and tables" page; SportsPlus keeps its data, follows,
   Hide scores and alerts). A game's page has Stats, Events, Line-ups, Table and Match facts, and finds every channel
   in the person's own playlists that shows it: the networks the scoreboard lists, and the programmes in their own TV
   guides whose title names both teams. Game data comes from a public scoreboard feed; MKCinema plays nothing from it.
   Hidden on kids seats. Updates itself every 30 seconds while a game is live and the page is open. */
(() => {
  if (window.SportsLive) return;
  const q = (s, r) => (r || document).querySelector(s), qa = (s, r) => [...(r || document).querySelectorAll(s)];
  const E = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tv = () => { try { return !!IS_TV; } catch (e) { return false; } };
  const SP = () => (typeof SportsPlus !== 'undefined' ? SportsPlus : null);
  const loc = () => { try { return appLocale(); } catch (e) { return undefined; } };
  const hm = (t) => new Date(t).toLocaleTimeString(loc(), { hour: 'numeric', minute: '2-digit' });
  const I = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    starOn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    live: '<span class="slv-dot"></span>',
    tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="m17 2-5 5-5-5"/></svg>',
  };
  const SOCCER_STATS = [['totalShots', 'Shots'], ['shotsOnTarget', 'On target'], ['wonCorners', 'Corners'], ['saves', 'Saves'], ['foulsCommitted', 'Fouls'], ['offsides', 'Offsides'], ['yellowCards', 'Yellow cards'], ['redCards', 'Red cards'], ['accuratePasses', 'Accurate passes'], ['effectiveTackles', 'Tackles won']];
  const STOP = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'as', 'cd', 'ud', 'sd', 'rc', 'club', 'city', 'united', 'utd', 'town', 'real', 'sporting', 'athletic', 'atletico', 'the', 'and', 'de', 'del', 'la', 'le', 'los', 'las', 'of', 'st', 'saint', 'hove', 'albion', 'county', 'rovers', 'wanderers', 'state', 'university', 'college', 'new', 'san', 'los', 'north', 'south', 'east', 'west']);
  const SL = window.SportsLive = {
    st: { pick: 'live', day: 0, game: null, tab: 'stats', screen: 'list', cat: '' },
    days: {}, sums: {}, tables: {}, tick: 0, bug: null,
    sport(lg) { return String(lg || '').split('/')[0]; },
    soccer(g) { return this.sport(g && g.lg) === 'soccer'; },
    lgName(lg) { const l = SP() && SP().LEAGUES.find((x) => x[0] === lg); return l ? l[1] : ''; },
    kids() { try { return SP().kids(); } catch (e) { return false; } },
    hide() { try { return SP().hide(); } catch (e) { return false; } },
    sc(x) { return this.hide() ? '•' : E(x == null ? '' : x); },
    narrow() { return !tv() && (innerWidth < 900 || (innerWidth < 1100 && innerHeight > innerWidth)); },
    open(arg) {
      this._k = '';
      if (this.kids()) { toast('Not on the kids seat', 'err', 2400); return; }
      try { Usage.add('feat', 'sportsLive'); } catch (e) { /* counts off */ }
      if (arg && typeof arg === 'object' && arg.id) { this.st.game = { id: String(arg.id), lg: arg.lg || arg.path || '' }; this.st.screen = 'match'; }
      else if (typeof arg === 'string' && arg) { this.st.pick = arg; this.st.game = null; this.st.screen = 'list'; }
      X8.layer('sportsPlus', { label: 'Sports', full: true });
      const el = q('#sportsPlus'); el.classList.remove('spx'); el.classList.add('slv');
      X8.open('sportsPlus');
      if (!this._back) { this._back = 1; X8.backHook.sportsPlus = () => { if (this.narrow() && this.st.screen === 'match') { this.st.screen = 'list'; this.render(); return true; } return false; }; }
      this.render(true); this.load();
      try { if (typeof SportsHub !== 'undefined') SportsHub.refresh().then(() => this.paintSoft()).catch(() => {}); } catch (e) { /* no hub */ }
      clearInterval(this.tick); this.tick = setInterval(() => this.beat(), 30000);
      if (!this._rs) { this._rs = 1; let t = 0; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (this.isOpen() && this._nar !== this.narrow()) this.render(); }, 200); }); }
    },
    isOpen() { const el = q('#sportsPlus.slv'); return !!(el && !el.hidden); },
    /* ---------------- data ---------------- */
    async day(off, force) {
      const c = this.days[off], anyLive = c && c.games.some((g) => g.state === 'in');
      if (!force && c && Date.now() - c.at < (anyLive ? 25e3 : 4 * 60e3)) return c.games;
      if (c && c.busy) return c.busy;
      const busy = (async () => {
        const out = [], sp = SP(); if (!sp) return out;
        await Promise.all(sp.LEAGUES.map(async ([lg]) => { try { (await sp.scoreboard(lg, off)).forEach((g) => { if (!out.some((x) => x.id === g.id)) out.push(g); }); } catch (e) { /* this league stays out */ } }));
        out.sort((a, b) => (a.state === 'in' ? 0 : a.state === 'pre' ? 1 : 2) - (b.state === 'in' ? 0 : b.state === 'pre' ? 1 : 2) || a.date - b.date);
        this.days[off] = { at: Date.now(), games: out }; return out;
      })();
      this.days[off] = { ...(c || { at: 0, games: [] }), busy };
      try { return await busy; } finally { if (this.days[off]) delete this.days[off].busy; }
    },
    games() { const c = this.days[this.st.day]; return c ? c.games : []; },
    async load(force) {
      const tok = this.tok = (this.tok || 0) + 1;
      await this.day(this.st.day, force);
      if (tok !== this.tok || !this.isOpen()) return;
      const g = this.cur();
      if (!g && !this.narrow()) { const list = this.list(), f = list.find((x) => !this.solo(x)) || list[0]; if (f) this.st.game = { id: f.id, lg: f.lg }; }
      this.render();
      const now = this.cur(); if (now) this.summary(now, force).then(() => { if (tok === this.tok) this.render(); });
    },
    cur() { const s = this.st.game; if (!s) return null; for (const k of Object.keys(this.days)) { const g = (this.days[k].games || []).find((x) => x.id === s.id); if (g) return g; } return s.g || null; },
    async summary(g, force) {
      const c = this.sums[g.id];
      if (!force && c && Date.now() - c.at < (g.state === 'in' ? 25e3 : 10 * 60e3)) return c.d;
      try { const d = await SP().j(`${SP().API}${g.lg}/summary?event=${encodeURIComponent(g.id)}`); this.sums[g.id] = { at: Date.now(), d }; return d; } catch (e) { if (c && c.d) return c.d; this.sums[g.id] = { at: Date.now(), d: null, fail: 1 }; return null; }
    },
    sum(g) { const c = g && this.sums[g.id]; return c ? c.d : null; },
    failed(g) { const c = g && this.sums[g.id]; return !!(c && c.fail && !c.d); },
    /* a race or other event without two teams */
    solo(g) { return !!g && !(g.home && g.away && g.home.name && g.away.name); },
    list() {
      const all = this.games(), p = this.st.pick, sp = SP();
      if (p === 'live') { const l = all.filter((g) => g.state === 'in'); return l.length ? l : all.filter((g) => g.state === 'pre').slice(0, 20); }
      if (p === 'today') return all;
      if (p === 'mine') return all.filter((g) => sp.isF(g.home.id) || sp.isF(g.away.id));
      if (p.startsWith('ch:')) return [];
      return all.filter((g) => g.lg === p);
    },
    async beat() {
      if (!this.isOpen()) { clearInterval(this.tick); this.tick = 0; return; }
      const g = this.cur(), live = this.games().some((x) => x.state === 'in'), now = Date.now();
      // a listed game that should have started: check now and then, so kick-off shows without reopening
      const due = !live && this.games().some((x) => x.state === 'pre' && x.date <= now + 60e3 && x.date > now - 3 * 3600e3) && now - (this._dueAt || 0) > 120e3;
      if (!live && !due && !(g && g.state === 'in')) return;
      if (due) this._dueAt = now;
      await this.day(this.st.day, true);
      if (g && g.state !== 'post') await this.summary(g, true);
      this.paintSoft();
    },
    /* repaint without pulling the remote's place out from under the person */
    paintSoft() { if (this.isOpen()) this.render(); },
    /* ---------------- channels: the person's own playlists and guides ---------------- */
    norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^[a-z]{2,3}\s*[:|\-]\s*/, '').replace(/\b(hd|fhd|uhd|4k|sd|east|west|usa|us|uk)\b/g, '').replace(/[^a-z0-9+]+/g, ' ').trim(); },
    toks(t) { const w = new Set(); [t.name, t.short].forEach((s) => this.norm(s).split(' ').forEach((x) => { if (x.length >= 4 && !STOP.has(x)) w.add(x); })); const s = this.norm(t.short); if (s.length >= 3) w.add(s); return [...w]; },
    hit(title, t) { const n = ` ${this.norm(title)} `; return this.toks(t).some((w) => n.includes(` ${w} `)); },
    watch(g) {
      const out = [], seen = new Set(), add = (o) => { const k = o.ch.url || o.ch.name; if (seen.has(k)) return; seen.add(k); out.push(o); };
      if (!g || typeof Channels === 'undefined' || !Channels.data) return out;
      const sum = this.sum(g), nets = [...new Set([...(g.nets || []), ...((sum && sum.broadcasts) || []).map((b) => b.media && (b.media.shortName || b.media.name)).filter(Boolean)])];
      // slv-seat-lists: only playlists shown on this seat (hidden ones can still be loaded in Channels.data)
      let vis = null; try { vis = new Set((Channels.lists() || []).map((l) => l.id)); } catch (e) { vis = null; }
      const shown = (id) => !vis || vis.has(id);
      let all = []; try { all = (Channels.all() || []).filter((c) => shown(c.list)); } catch (e) { /* no playlists */ }
      for (const n of nets) { const k = this.norm(n); if (!k) continue; all.filter((c) => { const m = this.norm(c.name); return m === k || m.startsWith(`${k} `); }).slice(0, 3).forEach((ch) => add({ ch, how: 'net', net: n })); }
      const t0 = g.date - 45 * 60e3, t1 = g.date + 3.5 * 3600e3;
      try {
        for (const [id, d] of Channels.data) {
          if (!shown(id) || !d.epg || !d.epg.size) continue;
          for (const ch of d.channels) {
            const progs = d.epg.get(Channels.key(ch)); if (!progs) continue;
            for (const p of progs) { if (!p.title || p.end < t0 || p.start > t1) continue; if (this.hit(p.title, g.home) && this.hit(p.title, g.away)) { add({ ch, how: 'guide', p }); break; } }
            if (out.length >= 12) break;
          }
        }
      } catch (e) { /* guides not loaded */ }
      return out;
    },
    tune(o) { if (!o) return; X8.close('sportsPlus'); try { Channels.tune(o.ch); } catch (e) { toast('That channel did not start', 'err'); } },
    split(o) { if (!o) return; X8.close('sportsPlus'); try { Split.open({ name: o.ch.name, url: o.ch.url, headers: o.ch.headers, poster: o.ch.logo || null, live: true }); } catch (e) { toast('Split Screen did not open', 'err'); } },
    /* sports channels and games from the person's playlists and addons, sorted by sport (SportsHub reads them) */
    hub() { try { return (typeof SportsHub !== 'undefined' && SportsHub.items) || []; } catch (e) { return []; } },
    hubCats() { const c = {}; this.hub().forEach((x) => { c[x.cat] = (c[x.cat] || 0) + 1; }); try { return SportsHub.CATS.filter(([id]) => c[id]).map(([id, l]) => [id, l, c[id]]); } catch (e) { return []; } },
    leagueOf(it) { const t = this.norm(`${it.name} ${it.tag || ''} ${(it.iptv && it.iptv.group) || ''}`); const sp = SP(); if (!sp) return ''; const l = sp.LEAGUES.find(([, n]) => t.includes(this.norm(n))); return l ? l[1] : ''; },
    /* ---------------- pieces ---------------- */
    logo(t, cls) { return `<span class="${cls || 'slv-lg'}">${t.logo ? `<img src="${E(t.logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-gone>` : E((t.abbr || t.short || '?').slice(0, 3))}</span>`; },
    img(t) { return t.logo ? `<img src="${E(t.logo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-gone>` : ''; },
    status(g) { if (g.state === 'in') return this.hide() ? 'Live' : g.detail; if (g.state === 'post') return this.hide() ? 'Final' : (g.detail || 'Final'); return `${new Date(g.date).toLocaleDateString(loc(), { weekday: 'short' })} ${hm(g.date)}`; },
    short(g) { return g.state === 'pre' ? hm(g.date) : g.state === 'in' ? (this.hide() ? 'Live' : g.detail) : (g.detail || 'FT'); },
    colors(g, sum) {
      const pick = (t, side) => { let c = t.color || '444444'; try { const cc = sum && sum.header.competitions[0].competitors.find((x) => x.homeAway === side).team; if (cc && cc.color) c = cc.color; } catch (e) { /* scoreboard colour */ } return /^[0-9a-f]{6}$/i.test(c) ? c : '444444'; };
      let h = pick(g.home, 'home'), a = pick(g.away, 'away');
      const near = (x, y) => { const v = (s) => [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); const p = v(x), r = v(y); return Math.abs(p[0] - r[0]) + Math.abs(p[1] - r[1]) + Math.abs(p[2] - r[2]) < 120; };
      const dark = (x) => Math.max(...[0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16))) < 70;
      if (dark(h)) h = 'd9d4c7'; if (dark(a)) a = '8d8b93';
      if (near(h, a)) a = 'f3f0e8';
      return { h, a };
    },
    gameRow(g, i, on) {
      if (this.solo(g)) {
        if (this.narrow()) return `<button type="button" class="slv-g solo" data-nav data-k="g${E(g.id)}" data-slvg="${E(g.id)}"><span class="slv-mw ${g.state === 'in' ? 'live' : ''}" translate="no">${E(this.short(g))}</span><span class="slv-mt"><div><span translate="no">${E(g.name)}</span></div></span></button>`;
        return `<button type="button" class="slv-g solo${on ? ' on' : ''}" data-nav data-k="g${E(g.id)}" data-slvg="${E(g.id)}"><span class="h"><span translate="no">${E(g.name)}</span></span><span class="s ${g.state === 'in' ? 'live' : ''}"><span style="font-size:.86em" translate="no">${E(g.state === 'pre' ? hm(g.date) : this.short(g))}</span><small translate="no">${E(new Date(g.date).toLocaleDateString(loc(), { weekday: 'short' }))}</small></span></button>`;
      }
      if (this.narrow()) {
        const live = g.state === 'in', show = g.state !== 'pre';
        return `<button type="button" class="slv-g" data-nav data-k="g${E(g.id)}" data-slvg="${E(g.id)}"><span class="slv-mw ${live ? 'live' : ''}" translate="no">${E(this.short(g))}</span><span class="slv-mt"><div>${this.img(g.home)}<span translate="no">${E(g.home.short || g.home.name)}</span></div><div>${this.img(g.away)}<span translate="no">${E(g.away.short || g.away.name)}</span></div></span><span class="slv-ms">${show ? `<span>${this.sc(g.home.score)}</span><span>${this.sc(g.away.score)}</span>` : ''}</span></button>`;
      }
      return `<button type="button" class="slv-g${on ? ' on' : ''}" data-nav data-k="g${E(g.id)}" data-slvg="${E(g.id)}"><span class="a"><span translate="no">${E(g.home.short || g.home.name)}</span>${this.img(g.home)}</span><span class="s ${g.state === 'in' ? 'live' : ''}">${g.state === 'pre' ? `<span style="font-size:.86em">${E(hm(g.date))}</span>` : `${this.sc(g.home.score)}–${this.sc(g.away.score)}`}<small translate="no">${E(g.state === 'pre' ? new Date(g.date).toLocaleDateString(loc(), { weekday: 'short' }) : this.short(g))}</small></span><span class="h">${this.img(g.away)}<span translate="no">${E(g.away.short || g.away.name)}</span></span></button>`;
    },
    form(sum, id) {
      try { const f = (sum.lastFiveGames || []).find((x) => String(x.team && x.team.id) === String(id)); const r = ((f && f.events) || []).map((e) => e.gameResult).filter(Boolean).slice(0, 5); return r.length ? `<div class="slv-form">${r.map((x) => `<i class="${E(x)}">${E(x)}</i>`).join('')}</div>` : ''; } catch (e) { return ''; }
    },
    periods(g, sum) {
      try {
        const cs = sum.header.competitions[0].competitors, h = cs.find((x) => x.homeAway === 'home'), a = cs.find((x) => x.homeAway === 'away');
        const hl = (h.linescores || []).map((x) => x.displayValue), al = (a.linescores || []).map((x) => x.displayValue); if (!hl.length || this.hide()) return '';
        const s = this.sport(g.lg), halves = /college-basketball/.test(g.lg), name = (i) => halves ? (i < 2 ? `H${i + 1}` : 'OT') : s === 'soccer' ? ['1st half', '2nd half', 'Extra time', 'Extra time', 'Penalties'][i] || `${i + 1}` : s === 'hockey' ? (i < 3 ? `P${i + 1}` : 'OT') : s === 'baseball' ? `${i + 1}` : (s === 'basketball' || s === 'football') ? (i < 4 ? `Q${i + 1}` : 'OT') : `${i + 1}`;
        return `<div class="slv-per">${hl.slice(0, 12).map((v, i) => `<div>${E(name(i))}<b>${E(v)}–${E(al[i] == null ? '' : al[i])}</b></div>`).join('')}</div>`;
      } catch (e) { return ''; }
    },
    keyEv(sum) { return (sum && sum.keyEvents) || []; },
    who(k) { try { const p = (k.participants || [])[0]; if (p && p.athlete) return p.athlete.shortName || p.athlete.displayName; } catch (e) { /* text */ } const m = String(k.text || '').match(/\.\s*([^.(]+?)\s*\(/); return m ? m[1] : ''; },
    hero(g, sum, wt) {
      if (this.solo(g)) {
        const o = wt[0], nar = this.narrow(), lg = this.lgName(g.lg);
        const acts = `<div class="${nar ? 'slv-pacts' : 'slv-acts'}">${o ? `<button type="button" class="slv-btn p" data-nav data-k="watch" data-slvw="0">${I.play}<span>Watch on ${E(o.ch.name)}</span></button>` : (nar ? '' : `<button type="button" class="slv-btn" disabled>${I.tv}Not in your playlists</button>`)}${o ? `<button type="button" class="slv-btn${nar ? ' i' : ''}" data-nav data-k="split" data-slvsplit${nar ? ' aria-label="Add to Split Screen"' : ''}>${I.grid}${nar ? '' : 'Add to Split Screen'}</button>` : ''}</div>`;
        return `<section class="slv-hero slv-pan"><div class="slv-meta"><b translate="no">${E(lg)}</b>${g.venue ? `<span>·</span><span translate="no">${E(g.venue)}</span>` : ''}</div><h2 class="slv-ev" translate="no">${E(g.name)}</h2><div class="slv-st ${g.state === 'in' ? 'live' : ''}" style="justify-content:flex-start">${g.state === 'in' ? I.live : ''}<span translate="no">${E(this.status(g))}</span></div>${nar ? '' : acts}</section>${nar && (o) ? acts : ''}`;
      }
      const sp = SP(), started = g.state !== 'pre', venue = (sum && sum.gameInfo && sum.gameInfo.venue) || null, lg = this.lgName(g.lg);
      const goals = this.soccer(g) && started && !this.hide() ? this.keyEv(sum).filter((k) => k.scoringPlay) : [];
      const reds = this.soccer(g) && started && !this.hide() ? this.keyEv(sum).filter((k) => /red card/i.test((k.type && k.type.text) || '')) : [];
      const side = (id) => [...goals.filter((k) => String(k.team && k.team.id) === String(id)).map((k) => `⚽ ${this.who(k)} ${(k.clock && k.clock.displayValue) || ''}`), ...reds.filter((k) => String(k.team && k.team.id) === String(id)).map((k) => `🟥 ${this.who(k)} ${(k.clock && k.clock.displayValue) || ''}`)].join(' · ');
      const first = wt[0], nar = this.narrow();
      const team = (t, r) => `<div class="slv-tm${r ? ' r' : ''}">${this.logo(t)}<div style="min-width:0"><h2 translate="no"${!nar && t.short && t.short !== t.name ? ` data-short="${E(t.short)}"` : ''}>${E(nar ? (t.short || t.name) : t.name)}</h2>${nar ? '' : this.form(sum, t.id)}</div></div>`;
      const acts = nar
        ? `<div class="slv-pacts">${first ? `<button type="button" class="slv-btn p" data-nav data-k="watch" data-slvw="0">${I.play}<span>Watch on ${E(first.ch.name)}</span></button>` : ''}<button type="button" class="slv-btn i${this.bug && this.bug.id === g.id ? ' on' : ''}" data-nav data-k="pin" data-slvpin aria-label="Keep score on screen">${I.pin}</button>${first ? `<button type="button" class="slv-btn i" data-nav data-k="split" data-slvsplit aria-label="Add to Split Screen">${I.grid}</button>` : ''}</div>`
        : `<div class="slv-acts">${first ? `<button type="button" class="slv-btn p" data-nav data-k="watch" data-slvw="0">${I.play}<span>Watch on ${E(first.ch.name)}</span></button>` : `<button type="button" class="slv-btn" disabled>${I.tv}Not in your playlists</button>`}
          <button type="button" class="slv-btn${this.bug && this.bug.id === g.id ? ' on' : ''}" data-nav data-k="pin" data-slvpin>${I.pin}${this.bug && this.bug.id === g.id ? 'Score stays on screen' : 'Keep score on screen'}</button>
          ${first ? `<button type="button" class="slv-btn" data-nav data-k="split" data-slvsplit>${I.grid}Add to Split Screen</button>` : ''}
          <button type="button" class="slv-btn${sp.isF(g.home.id) ? ' on' : ''}" data-nav data-k="fh" data-slvf="home">${sp.isF(g.home.id) ? I.starOn : I.star}<span translate="no">${E(g.home.short || g.home.name)}</span></button>
          <button type="button" class="slv-btn${sp.isF(g.away.id) ? ' on' : ''}" data-nav data-k="fa" data-slvf="away">${sp.isF(g.away.id) ? I.starOn : I.star}<span translate="no">${E(g.away.short || g.away.name)}</span></button></div>`;
      return `<section class="slv-hero slv-pan"><div class="slv-meta"><b translate="no">${E(lg)}</b>${venue && venue.fullName ? `<span>·</span><span translate="no">${E(venue.fullName)}</span>` : ''}${!nar && sum && sum.gameInfo && sum.gameInfo.attendance ? `<span>·</span><span>${Number(sum.gameInfo.attendance).toLocaleString(loc())}</span>` : ''}</div>
        <div class="slv-hrow">${team(g.home)}<div class="slv-sc">${started ? `<div class="slv-big" data-slv-score>${this.sc(g.home.score)}<span>–</span>${this.sc(g.away.score)}</div>` : `<div class="slv-big sm">${E(hm(g.date))}</div>`}<div class="slv-st ${g.state === 'in' ? 'live' : ''}">${g.state === 'in' ? I.live : ''}<span translate="no">${E(this.status(g))}</span></div>${nar ? '' : this.periods(g, sum)}</div>${team(g.away, 1)}</div>${nar ? this.periods(g, sum) : ''}
        ${goals.length || reds.length ? `<div class="slv-goals"><div translate="no">${E(side(g.home.id))}</div><div translate="no">${E(side(g.away.id))}</div></div>` : ''}
        ${nar ? '' : acts}</section>${nar ? acts : ''}`;
    },
    tabs(g, sum) {
      const t = [['stats', 'Stats'], ['events', 'Events'], ['lineups', 'Line-ups'], ['table', 'Standings'], ['facts', this.narrow() ? 'Facts' : 'Match facts']];
      if (!this.soccer(g) && !((sum && sum.rosters) || []).some((r) => (r.roster || []).length)) t.splice(2, 1);
      if (this.solo(g)) t.splice(0, t.length - 1);
      else if (!sum && this.failed(g)) { for (const k of ['stats', 'events', 'lineups']) { const i = t.findIndex((x) => x[0] === k); if (i >= 0) t.splice(i, 1); } }
      if (!t.some((x) => x[0] === this.st.tab)) this.st.tab = t[0][0];
      return `<div class="slv-tabs" role="tablist">${t.map(([k, l]) => `<button type="button" role="tab" class="slv-tab${this.st.tab === k ? ' on' : ''}" aria-selected="${this.st.tab === k}" data-nav data-nav-down=".slv-body[data-nav], .slv-body [data-nav], .slv-sec [data-nav]" data-k="t${k}" data-slvtab="${k}">${l}</button>`).join('')}</div>`;
    },
    bar(h, a, label) {
      const hv = parseFloat(h) || 0, av = parseFloat(a) || 0, m = Math.max(hv, av) || 1;
      return `<div class="slv-bar"><span class="v ${hv < av ? 'lo' : ''}">${E(h)}</span><div><small>${E(label)}</small><div class="slv-tr"><i><b class="${hv < av ? 'dim' : ''}" style="transform:scaleX(${(hv / m).toFixed(3)})"></b></i><i><b class="${av < hv ? 'dim' : ''}" style="transform:scaleX(${(av / m).toFixed(3)})"></b></i></div></div><span class="v r ${av < hv ? 'lo' : ''}">${E(a)}</span></div>`;
    },
    statsOf(g, sum) {
      const teams = (sum && sum.boxscore && sum.boxscore.teams) || []; if (teams.length !== 2) return null;
      const by = (t) => { const o = {}; (t.statistics || []).forEach((s) => { o[s.name] = s; }); return o; };
      const hT = teams.find((t) => String(t.team && t.team.id) === String(g.home.id)) || teams[1], aT = teams.find((t) => t !== hT) || teams[0];
      return { h: by(hT), a: by(aT) };
    },
    pct(v) { const n = parseFloat(v); if (!isFinite(n)) return v; return `${Math.round(n <= 1 ? n * 100 : n)}%`; },
    body(g, sum) {
      const tab0 = this.st.tab;
      if (!sum && !this.solo(g) && !(this.failed(g) && (tab0 === 'facts' || tab0 === 'table'))) return this.failed(g) ? '<div class="slv-note">No details for this game.</div>' : `<div class="slv-note"><span class="spin"></span> Loading the game…</div>`;
      if (this.hide() && g.state !== 'pre' && /^(stats|events)$/.test(this.st.tab)) return '<div class="slv-note">Scores are hidden. Turn off Hide scores (the eye at the top) to see what happened.</div>';
      const tab = this.st.tab, nar = this.narrow();
      if (tab === 'stats') {
        const s = this.statsOf(g, sum); if (!s || g.state === 'pre') return `<div class="slv-note">${g.state === 'pre' ? 'Stats start at kick-off.' : 'No stats for this game yet.'}</div>`;
        let rows = [], ring = '';
        if (this.soccer(g)) {
          rows = SOCCER_STATS.filter(([k]) => s.h[k] && s.a[k]).slice(0, nar ? 6 : 8).map(([k, l]) => this.bar(s.h[k].displayValue, s.a[k].displayValue, l));
          if (s.h.possessionPct) {
            const ph = Math.round(parseFloat(s.h.possessionPct.displayValue) || 0), pa = Math.max(0, 100 - ph);
            if (nar) ring = `<div class="slv-poss"><b>${ph}%</b><div class="pb"><i style="width:${ph}%;background:var(--c1)"></i><i style="width:${pa}%;background:var(--c2)"></i></div><b>${pa}%</b></div>`;
            else { const r = 96, C = 2 * Math.PI * r, gp = 6; ring = `<div class="slv-ring"><svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="14"/><circle cx="110" cy="110" r="${r}" fill="none" stroke="var(--c1)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${Math.max(0, ph / 100 * C - gp)} ${C}" transform="rotate(-90 110 110)"/><circle cx="110" cy="110" r="${r}" fill="none" stroke="var(--c2)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${Math.max(0, pa / 100 * C - gp)} ${C}" transform="rotate(${-90 + ph * 3.6} 110 110)"/></svg><div class="c"><div><small>Possession</small><b>${ph}%</b><em translate="no">${pa}% ${E(g.away.abbr || g.away.short)}</em></div></div></div>`; }
          }
        } else {
          const keys = Object.keys(s.h).filter((k) => s.a[k] && /^[\d.]+%?$/.test(String(s.h[k].displayValue)) && /^[\d.]+%?$/.test(String(s.a[k].displayValue))).slice(0, nar ? 7 : 9);
          rows = keys.map((k) => { const l = s.h[k].label || k, pc = /%|pct/i.test(`${l} ${k}`); return this.bar(pc ? this.pct(s.h[k].displayValue) : s.h[k].displayValue, pc ? this.pct(s.a[k].displayValue) : s.a[k].displayValue, l); });
        }
        if (!rows.length && !ring) return '<div class="slv-note">No stats for this game yet.</div>';
        return nar ? `${ring}<div class="slv-bars">${rows.join('')}</div>` : `<div class="slv-sg" style="${ring ? '' : 'grid-template-columns:1fr'}">${ring}<div class="slv-bars">${rows.join('')}</div></div>`;
      }
      if (tab === 'events') {
        if (this.soccer(g)) {
          let html = '';
          for (const k of this.keyEv(sum)) {
            const ty = (k.type && k.type.text) || '', min = (k.clock && k.clock.displayValue) || '';
            if (/^halftime$/i.test(ty)) { html += `<div class="sep">Half time</div>`; continue; }
            let ic = '', tx = '';
            if (k.scoringPlay) { ic = '<span class="slv-ball"></span>'; tx = `<span class="g" translate="no">${E(this.who(k))}${/own goal/i.test(ty) ? ' (o.g.)' : ''}</span>`; }
            else if (/yellow card/i.test(ty)) { ic = '<span class="slv-card y"></span>'; tx = `<span translate="no">${E(this.who(k))}</span>`; }
            else if (/red card/i.test(ty)) { ic = '<span class="slv-card r"></span>'; tx = `<span translate="no">${E(this.who(k))}</span>`; }
            else if (/substitution/i.test(ty)) { const m = String(k.text || '').match(/\.\s*(.+?) replaces (.+?)(?: because|\.|$)/); ic = '<span class="slv-sub">⇅</span>'; tx = `<span translate="no">${E(m ? `${m[1]} ↔ ${m[2]}` : this.who(k))}</span>`; }
            else continue;
            const home = String(k.team && k.team.id) === String(g.home.id);
            html += `<div class="l">${home ? tx + ic : ''}</div><div class="m">${E(min)}</div><div class="rr">${home ? '' : ic + tx}</div>`;
          }
          if (g.state === 'post') html += `<div class="sep">Full time</div>`;
          return html ? `<div class="slv-evs">${html}</div>` : `<div class="slv-note">${g.state === 'pre' ? 'Goals, cards and changes show here once the game starts.' : 'Nothing has happened yet.'}</div>`;
        }
        const plays = (sum.scoringPlays || []).slice(-40).reverse();
        return plays.length ? `<ol class="slv-plays">${plays.map((p) => `<li><span>${E((p.clock && p.clock.displayValue) || '')}${p.period && p.period.number ? ` · ${E(p.period.number)}` : ''}</span><b translate="no">${E(p.text || (p.type && p.type.text) || '')}</b>${p.homeScore != null ? `<em>${E(p.homeScore)}–${E(p.awayScore)}</em>` : ''}</li>`).join('')}</ol>` : `<div class="slv-note">${g.state === 'pre' ? 'Scoring shows here once the game starts.' : 'No scoring list for this game.'}</div>`;
      }
      if (tab === 'lineups') return this.lineups(g, sum);
      if (tab === 'table') {
        const t = this.tables[g.lg];
        if (!t) { SP().standings(g.lg).then((x) => { this.tables[g.lg] = x; this.paintSoft(); }).catch(() => { this.tables[g.lg] = []; this.paintSoft(); }); return '<div class="slv-note"><span class="spin"></span> Loading the table…</div>'; }
        if (!t.length || !t.some((x) => x.rows.length)) return '<div class="slv-note">No table for this one.</div>';
        const soc = this.soccer(g), cols = soc ? [['gamesPlayed', 'P'], ['wins', 'W'], ['ties', 'D'], ['losses', 'L'], ['pointDifferential', 'GD'], ['points', 'Pts']] : [['wins', 'W'], ['losses', 'L'], ...(/hockey/.test(g.lg) ? [['otLosses', 'OTL'], ['points', 'Pts']] : [['winPercent', 'PCT'], ['gamesBehind', 'GB']])];
        const ids = [String(g.home.id), String(g.away.id)];
        const groups = t.filter((x) => x.rows.length).sort((a, b) => (b.rows.some((r) => ids.includes(String(r.t.id))) ? 1 : 0) - (a.rows.some((r) => ids.includes(String(r.t.id))) ? 1 : 0)).slice(0, 4);
        return groups.map((gr) => `${t.length > 1 ? `<div class="slv-tab-h" translate="no">${E(gr.name)}</div>` : ''}<table class="slv-tab-t"><thead><tr><th class="l">#</th><th class="l"></th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${gr.rows.map((r, i) => `<tr class="${ids.includes(String(r.t.id)) ? 'me' : ''}"><td class="l">${i + 1}</td><td class="l"><span class="slv-tn">${this.img(r.t)}<span translate="no">${E(nar ? (r.t.short || r.t.name) : r.t.name)}</span></span></td>${cols.map(([k]) => `<td>${E(r.s[k] == null ? '' : r.s[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
      }
      // match facts
      const gi = (sum && sum.gameInfo) || {}, v = gi.venue || {}, f = [];
      f.push(['Kick-off', new Date(g.date).toLocaleString(loc(), { weekday: 'long', hour: 'numeric', minute: '2-digit' })]);
      if (!v.fullName && g.venue) f.push(['Ground', g.venue]);
      if (v.fullName) f.push(['Ground', `${v.fullName}${v.address && v.address.city ? `, ${v.address.city}` : ''}`]);
      if (gi.attendance) f.push(['Crowd', Number(gi.attendance).toLocaleString(loc())]);
      if (gi.weather && gi.weather.temperature != null) f.push(['Weather', `${gi.weather.temperature}°${gi.weather.displayValue ? ` · ${gi.weather.displayValue}` : ''}`]);
      const refs = (gi.officials || []).map((o) => o.displayName || o.fullName).filter(Boolean); if (refs.length) f.push(['Referee', refs[0]]);
      if ((g.nets || []).length) f.push(['On TV', g.nets.slice(0, 4).join(', ')]);
      const sp = SP(), card = (t, side) => `<div class="slv-fact"><small>Recent form</small><b translate="no">${E(t.name)}</b>${this.form(sum, t.id) || '<span class="slv-note" style="padding:0">Not listed</span>'}${nar ? `<button type="button" class="slv-btn${sp.isF(t.id) ? ' on' : ''}" data-nav data-k="f${side}" data-slvf="${side}">${sp.isF(t.id) ? I.starOn : I.star}${sp.isF(t.id) ? 'Following' : 'Follow'}</button>` : ''}</div>`;
      return `<div class="slv-facts">${f.map(([k, val]) => `<div class="slv-fact"><small>${E(k)}</small><b translate="no">${E(val)}</b></div>`).join('')}${this.solo(g) ? '' : card(g.home, 'home') + card(g.away, 'away')}</div>`;
    },
    lineups(g, sum) {
      const rs = ((sum && sum.rosters) || []).filter((r) => (r.roster || []).length);
      if (!rs.length) return `<div class="slv-note">${g.state === 'pre' ? 'Line-ups usually arrive about an hour before kick-off.' : 'No line-ups for this game.'}</div>`;
      const hR = rs.find((r) => String(r.team && r.team.id) === String(g.home.id)) || rs[0], aR = rs.find((r) => r !== hR) || null;
      const nar = this.narrow(), bench = (r) => (r.roster || []).filter((p) => !p.starter).map((p) => `${p.jersey ? `${p.jersey} ` : ''}${(p.athlete && (p.athlete.shortName || p.athlete.displayName)) || ''}`).join(' · ');
      if (!this.soccer(g) || !aR) {
        return `<div class="slv-lu">${[hR, aR].filter(Boolean).map((r) => `<div><b translate="no">${E((r.team && r.team.displayName) || '')}</b><ol>${(r.roster || []).filter((p) => p.starter).map((p) => `<li><span>${E(p.jersey || '')}</span><span translate="no" style="width:auto;text-align:left;color:inherit;font-family:inherit">${E((p.athlete && p.athlete.displayName) || '')}</span><small>${E((p.position && p.position.abbreviation) || '')}</small></li>`).join('')}</ol></div>`).join('')}</div>`;
      }
      const line = (pos) => { const p = String(pos || '').toUpperCase(); if (p === 'G' || p === 'GK') return 0; if (/^(CD|CB|LB|RB|LWB|RWB|D|SW)/.test(p)) return 1; if (/^(DM|CDM)/.test(p)) return 2; if (/^(CM|LM|RM|M)(-|$)/.test(p)) return 3; if (/^(AM|CAM|LW|RW|W)/.test(p)) return 4; return 5; };
      const lat = (pos) => { const p = String(pos || '').toUpperCase(); return /^L/.test(p) ? -2 : /-L$/.test(p) ? -1 : /^R/.test(p) ? 2 : /-R$/.test(p) ? 1 : 0; };
      const place = (r, side) => {
        const xi = (r.roster || []).filter((p) => p.starter); const by = {};
        xi.forEach((p) => { const l = line(p.position && p.position.abbreviation); (by[l] = by[l] || []).push(p); });
        const ls = Object.keys(by).map(Number).sort((a, b) => a - b), n = ls.length;
        return ls.map((l, li) => { const ps = by[l].sort((a, b) => lat(a.position && a.position.abbreviation) - lat(b.position && b.position.abbreviation) || Number(a.formationPlace || 0) - Number(b.formationPlace || 0));
          const x = n > 1 ? .06 + li * (.38 / (n - 1)) : .06;
          return ps.map((p, i) => { const y = (i + 1) / (ps.length + 1); let X = side === 'h' ? x : 1 - x, Y = side === 'h' ? y : 1 - y; if (nar) [X, Y] = [Y, 1 - X];
            return `<div class="pl ${side}" style="left:${(X * 100).toFixed(1)}%;top:${(Y * 100).toFixed(1)}%"><i>${E(p.jersey || '')}</i><span translate="no">${E((p.athlete && (p.athlete.shortName || p.athlete.displayName)) || '')}</span></div>`; }).join(''); }).join('');
      };
      const c = this.colors(g, sum), ink = (hex) => { const [r, gg, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)); return r * .3 + gg * .59 + b * .11 > 150 ? '#111' : '#fff'; };
      const lines = nar
        ? '<div class="ln" style="inset:12px"></div><div class="ln" style="left:12px;right:12px;top:50%;height:0;border-width:1.5px 0 0"></div><div class="ln" style="left:50%;top:50%;width:26%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%)"></div><div class="ln" style="left:25%;right:25%;top:12px;height:14%;border-top:0"></div><div class="ln" style="left:25%;right:25%;bottom:12px;height:14%;border-bottom:0"></div>'
        : '<div class="ln" style="inset:14px"></div><div class="ln" style="top:14px;bottom:14px;left:50%;width:0;border-width:0 0 0 1.5px"></div><div class="ln" style="left:50%;top:50%;height:26%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%)"></div><div class="ln" style="top:25%;bottom:25%;left:14px;width:11%;border-left:0"></div><div class="ln" style="top:25%;bottom:25%;right:14px;width:11%;border-right:0"></div>';
      const fm = nar
        ? `<span class="fm" style="left:20px;bottom:20px" translate="no">${E(g.home.abbr || '')} · ${E(hR.formation || '')}</span><span class="fm" style="left:20px;top:20px" translate="no">${E(aR.formation || '')} · ${E(g.away.abbr || '')}</span>`
        : `<span class="fm" style="left:26px;top:22px" translate="no">${E(g.home.abbr || '')} · ${E(hR.formation || '')}</span><span class="fm" style="right:26px;top:22px" translate="no">${E(aR.formation || '')} · ${E(g.away.abbr || '')}</span>`;
      return `<div class="slv-pitch" style="--hc:${ink(c.h)};--ac:${ink('f3f0e8')}">${lines}${fm}${place(hR, 'h')}${place(aR, 'a')}</div>${nar ? `<div class="slv-bench"><b translate="no">${E(g.home.short)}</b> · ${E(bench(hR))}<br><b translate="no">${E(g.away.short)}</b> · ${E(bench(aR))}</div>` : ''}`;
    },
    chRow(o, i) {
      const now = Date.now(), p = o.p;
      const sub = o.how === 'guide' ? `<span translate="no">${E(p.title)}</span> · ${E(hm(p.start))}–${E(hm(p.end))}` : `<span translate="no">${E(o.net)}</span>`;
      const prog = p && p.start < now && p.end > now ? `<div class="slv-prog"><i style="transform:scaleX(${((now - p.start) / (p.end - p.start)).toFixed(3)})"></i></div>` : '';
      return `<button type="button" class="slv-ch${i === 0 && !this.narrow() ? ' on' : ''}" data-nav data-k="w${i}" data-slvw="${i}"><span class="slv-cl">${o.ch.logo ? `<img src="${E(o.ch.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-gone>` : E(String(o.ch.name).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 4).toUpperCase())}</span><span class="slv-ct"><b translate="no">${E(o.ch.name)}</b><small>${sub}</small>${prog}</span><span class="slv-tag">${o.how === 'guide' ? 'In your guide' : 'Shows this game'}</span></button>`;
    },
    watchPanel(g, sum, wt) {
      const head = `<div class="slv-wh"><h3>Watch</h3><span class="t">${wt.length ? (wt.length === 1 ? '1 channel found' : `${wt.length} channels found`) : ''}</span></div>`;
      if (!g) return head + '<div class="slv-empty">Pick a game to see where it is on.</div>';
      const o = wt[0];
      const card = `<div class="slv-now"><div class="pic"></div>${g.state !== 'pre' && !this.solo(g) ? `<div class="slv-bug">${this.img(g.home)}<b>${this.sc(g.home.score)}–${this.sc(g.away.score)}</b>${this.img(g.away)}<span style="color:var(--mu)" translate="no">${E(this.short(g))}</span></div>` : ''}${o ? `<span class="chl">${o.ch.logo ? `<img src="${E(o.ch.logo)}" alt="" referrerpolicy="no-referrer" data-gone>` : E(String(o.ch.name).slice(0, 4))}</span>` : ''}<div class="cap"><b translate="no">${E(o ? o.ch.name : (g.nets || []).slice(0, 2).join(', ') || this.lgName(g.lg))}</b><span translate="no">${this.solo(g) ? E(g.name) : `${E(g.home.short)} – ${E(g.away.short)}`}</span></div></div>`;
      const rows = wt.length ? wt.map((x, i) => this.chRow(x, i)).join('') : `<div class="slv-note" style="padding:4px 18px 8px">None of the channels in your playlists or TV guides show this game.</div>${(g.nets || []).length ? `<div class="slv-note" style="padding:0 18px 8px"><span translate="no">${E(g.nets.slice(0, 3).join(', '))}</span></div>` : ''}`;
      return head + card + rows;
    },
    /* ---------------- screens ---------------- */
    top(nar) {
      const back = nar && this.st.screen === 'match';
      return `<div class="slv-top"><button type="button" class="slv-ib" data-nav data-k="close" ${back ? 'data-slvback' : 'data-x8close'} aria-label="${back ? 'Back' : 'Close'}">${I.back}</button><h1>${back ? `<span translate="no">${E(this.lgName((this.cur() || {}).lg) || 'Sports')}</span>` : 'Sports'}</h1><span class="sp"></span>
        <button type="button" class="slv-ib${this.hide() ? ' on' : ''}" data-nav data-k="hide" data-slvhide aria-label="${this.hide() ? 'Show scores' : 'Hide scores'}" title="${this.hide() ? 'Show scores' : 'Hide scores'}">${this.hide() ? I.eyeOff : I.eye}</button></div>`;
    },
    rail() {
      const all = this.games(), sp = SP(), p = this.st.pick, live = all.filter((g) => g.state === 'in').length, mine = all.filter((g) => sp.isF(g.home.id) || sp.isF(g.away.id)).length;
      const ri = (k, ic, label, n, liveN) => `<button type="button" class="slv-ri${p === k ? ' on' : ''}" data-nav data-k="r${E(k)}" data-slvpick="${E(k)}"><span class="slv-ic">${ic}</span><span translate="${/^(soccer|football|basketball|hockey|baseball|mma|racing)\//.test(k) ? 'no' : 'yes'}">${label}</span><span class="n">${liveN ? I.live : ''}${n == null ? '' : n}</span></button>`;
      const lgs = sp.LEAGUES.map(([lg, n]) => { const gs = all.filter((g) => g.lg === lg); return [lg, n, gs.length, gs.filter((g) => g.state === 'in').length]; }).filter((x) => x[2] || x[0] === p).sort((a, b) => b[3] - a[3]);
      const cats = this.hubCats();
      const day = (o, l) => `<button type="button" class="${this.st.day === o ? 'on' : ''}" data-nav data-k="d${o}" data-slvday="${o}">${l}</button>`;
      return `<div class="slv-pan slv-rail slv-scroll" data-scroll="rail">
        ${ri('live', I.live, 'Live now', live, 0)}${ri('today', '<span>✦</span>', this.st.day === 0 ? 'All today' : 'All games', all.length)}${sp.follows().length ? ri('mine', I.starOn.replace('<svg', '<svg width="13" height="13"'), 'My teams', mine) : ''}
        ${lgs.length ? `<div class="slv-rh">Leagues</div>${lgs.map(([lg, n, c, l]) => ri(lg, E(n.split(/\s+/).map((w) => w[0]).join('').slice(0, 3)), E(n), c, l)).join('')}` : ''}
        ${cats.length ? `<div class="slv-rh">Your sports channels</div>${cats.map(([id, l, c]) => ri(`ch:${id}`, I.tv, E(l), c)).join('')}` : ''}<div class="slv-rh">Day</div><div class="slv-days">${day(-1, 'Yesterday')}${day(0, 'Today')}${day(1, 'Tomorrow')}</div></div>`;
    },
    chTiles(cat) {
      const items = this.hub().filter((x) => x.cat === cat), now = Date.now();
      if (!items.length) return '<div class="slv-empty">Nothing here right now.</div>';
      const groups = {}; items.forEach((it) => { const k = cat === 'football' ? (this.leagueOf(it) || 'More football') : ''; (groups[k] = groups[k] || []).push(it); });
      const tile = (it) => { const i = this.hub().indexOf(it), sub = it.ev ? `${it.ev.start <= now ? 'On now' : hm(it.ev.start)} · ${it.ev.ch}` : (it.tag || it.source || ''); return `<button type="button" class="slv-tile" data-nav data-k="h${i}" data-slvhub="${i}"><span class="slv-cl">${it.logo ? `<img src="${E(it.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-gone>` : E(String(it.name).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 4).toUpperCase())}</span><span class="slv-ct"><b translate="no">${E(it.name)}</b><small translate="no">${E(sub)}</small></span>${it.live ? '<span class="slv-tag" style="color:#ff9a9e">Live</span>' : ''}</button>`; };
      return Object.keys(groups).sort((a, b) => (a === 'More football') - (b === 'More football')).map((k) => `${k ? `<div class="slv-tab-h" translate="no">${E(k)}</div>` : ''}<div class="slv-tiles">${groups[k].slice(0, 120).map(tile).join('')}</div>`).join('');
    },
    wide() {
      const g = this.cur(), sum = this.sum(g), list = this.list(), p = this.st.pick;
      const c = g ? this.colors(g, sum) : { h: 'd9d4c7', a: '8d8b93' };
      const wt = this.watch(g);
      let main;
      if (p.startsWith('ch:')) main = `<section class="slv-pan slv-body slv-scroll" data-scroll="main"><div class="slv-wh" style="padding:0 0 12px"><h3>${E((this.hubCats().find((x) => `ch:${x[0]}` === p) || [0, ''])[1])}</h3><span class="t">From your playlists and addons</span></div>${this.chTiles(p.slice(3))}</section>`;
      else if (!g) main = `<section class="slv-pan slv-body"><div class="slv-empty">${this.days[this.st.day] ? `<b>No games here</b>${p === 'live' ? 'Nothing is live right now. Pick a league or another day on the left.' : 'Pick another league or day on the left.'}` : '<span class="spin"></span> Loading games…'}</div></section>`;
      else main = `${this.hero(g, sum, wt)}${this.tabs(g, sum)}<section class="slv-pan slv-body slv-scroll" data-scroll="body">${this.body(g, sum)}</section>`;
      const gl = p.startsWith('ch:') ? [] : list;
      let lastLg = '';
      const games = gl.length ? gl.map((x, i) => { const head = (p === 'live' || p === 'today' || p === 'mine') && x.lg !== lastLg ? `<div class="slv-lgh" translate="no">${E(this.lgName(x.lg))}</div>` : ''; lastLg = x.lg; return head + this.gameRow(x, i, g && x.id === g.id); }).join('') : '';
      return `<div class="slv-grid" style="--c1:#${c.h};--c2:#${c.a}"><div class="slv-col">${this.rail()}</div><div class="slv-col">${main}</div>
        <div class="slv-col"><div class="slv-pan slv-scroll" data-scroll="side" style="flex:1">${p.startsWith('ch:') ? '' : this.watchPanel(g, sum, wt)}${games ? `<div class="slv-wh" style="padding-top:18px"><h3>${p === 'live' && this.games().some((x) => x.state === 'in') ? 'Live scores' : 'Games'}</h3><span class="t">${gl.length}</span></div>${games}` : ''}<div style="height:12px"></div></div></div></div>`;
    },
    narrowList() {
      const all = this.games(), sp = SP(), p = this.st.pick, live = all.filter((x) => x.state === 'in');
      const chip = (k, label, n, dot) => `<button type="button" class="slv-chip${p === k ? ' on' : ''}" data-nav data-k="r${E(k)}" data-slvpick="${E(k)}">${dot ? I.live : ''}<span>${label}</span>${n != null ? `<em>${n}</em>` : ''}</button>`;
      const lgs = sp.LEAGUES.filter(([lg]) => all.some((x) => x.lg === lg) || lg === p);
      const chips = `<div class="slv-chips">${chip('live', 'Live', live.length, 1)}${chip('today', this.st.day === 0 ? 'Today' : 'All games', all.length)}${sp.follows().length ? chip('mine', 'My teams', null) : ''}${lgs.map(([lg, n]) => chip(lg, `<span translate="no">${E(n)}</span>`, all.filter((x) => x.lg === lg).length)).join('')}${this.hubCats().map(([id, l, c]) => chip(`ch:${id}`, E(l), c)).join('')}</div>`;
      const days = `<div class="slv-chips" style="padding-top:0">${[[-1, 'Yesterday'], [0, 'Today'], [1, 'Tomorrow']].map(([o, l]) => `<button type="button" class="slv-chip${this.st.day === o ? ' on' : ''}" data-nav data-k="d${o}" data-slvday="${o}" style="padding:6px 12px">${l}</button>`).join('')}</div>`;
      if (p.startsWith('ch:')) return chips + `<div style="padding:4px 14px">${this.chTiles(p.slice(3))}</div>`;
      const list = this.list(), feat = list.filter((x) => !this.solo(x)).find((x) => x.state === 'in') || list.find((x) => !this.solo(x));
      let html = chips + days;
      if (!this.days[this.st.day]) return html + '<div class="slv-empty"><span class="spin"></span> Loading games…</div>';
      if (feat) {
        const c = this.colors(feat, this.sum(feat)), wt = this.watch(feat);
        html += `<div style="--c1:#${c.h};--c2:#${c.a}"><section class="slv-hero slv-pan" style="padding:14px"><div class="slv-meta">${feat.state === 'in' ? `${I.live}<b style="color:#ff9a9e" translate="no">${E(this.status(feat))}</b><span>·</span>` : ''}<span translate="no">${E(this.lgName(feat.lg))}</span></div>
          <div class="slv-hrow"><div class="slv-tm">${this.logo(feat.home)}<h2 translate="no">${E(feat.home.short || feat.home.name)}</h2></div><div class="slv-sc">${feat.state === 'pre' ? `<div class="slv-big sm">${E(hm(feat.date))}</div>` : `<div class="slv-big" style="font-size:38px">${this.sc(feat.home.score)}<span>–</span>${this.sc(feat.away.score)}</div>`}</div><div class="slv-tm r">${this.logo(feat.away)}<h2 translate="no">${E(feat.away.short || feat.away.name)}</h2></div></div>
          <div style="display:flex;gap:8px;margin-top:12px">${wt[0] ? `<button type="button" class="slv-btn p" style="flex:1;justify-content:center" data-nav data-k="fw" data-slvfw="${E(feat.id)}">${I.play}<span translate="no">${E(wt[0].ch.name)}</span></button>` : ''}<button type="button" class="slv-btn" style="${wt[0] ? '' : 'flex:1;justify-content:center'}" data-nav data-k="fo" data-slvg="${E(feat.id)}">Match centre</button></div></section></div>`;
      }
      const onNow = this.hub().filter((x) => x.ev && x.ev.start <= Date.now() && x.ev.end > Date.now()).slice(0, 14);
      if (onNow.length) html += `<div class="slv-secT">On your channels now<small>From your guide</small></div><div class="slv-chrow">${onNow.map((it) => { const i = this.hub().indexOf(it); return `<button type="button" class="slv-chc" data-nav data-k="h${i}" data-slvhub="${i}"><span class="slv-cl">${it.logo ? `<img src="${E(it.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-gone>` : E(String(it.ev.ch).slice(0, 4))}</span><b translate="no">${E(it.ev.ch)}</b><small translate="no">${E(it.name)}</small><div class="slv-prog"><i style="transform:scaleX(${((Date.now() - it.ev.start) / (it.ev.end - it.ev.start)).toFixed(3)})"></i></div></button>`; }).join('')}</div>`;
      if (!list.length) return html + `<div class="slv-empty"><b>No games here</b>${p === 'live' ? 'Nothing is live right now.' : 'Try another day or league.'}</div>`;
      const by = []; list.forEach((x) => { let gr = by.find((b) => b.lg === x.lg); if (!gr) { gr = { lg: x.lg, gs: [] }; by.push(gr); } gr.gs.push(x); });
      return html + by.map((gr) => `<div class="slv-secT"><span translate="no">${E(this.lgName(gr.lg))}</span><small>${gr.gs.length === 1 ? '1 game' : `${gr.gs.length} games`}</small></div>${gr.gs.map((x, i) => this.gameRow(x, i)).join('')}`).join('');
    },
    narrowMatch() {
      const g = this.cur(); if (!g) { this.st.screen = 'list'; return this.narrowList(); }
      const sum = this.sum(g), wt = this.watch(g), c = this.colors(g, sum);
      return `<div style="--c1:#${c.h};--c2:#${c.a}">${this.hero(g, sum, wt)}${this.tabs(g, sum)}<div class="slv-sec">${this.body(g, sum)}</div>
        <div class="slv-sec"><h4><span>Watch</span>${wt.length ? ` · <span>${wt.length === 1 ? '1 channel found' : `${wt.length} channels found`}</span>` : ''}</h4>${wt.length ? wt.map((x, i) => this.chRow(x, i)).join('') : `<div class="slv-note" style="padding:0">None of the channels in your playlists or TV guides show this game.</div>`}</div></div>`;
    },
    /* team names break only between words: a name whose longest word does not fit, or that runs past three lines, gets smaller, then the short name */
    fitNames(box) {
      qa('.slv-tm h2[data-short]', box).forEach((h) => {
        const bad = () => h.scrollWidth > h.clientWidth + 1 || h.offsetHeight > parseFloat(getComputedStyle(h).lineHeight) * 3.2;
        if (!bad()) return; h.classList.add('sm'); if (!bad()) return; h.textContent = h.dataset.short; if (bad()) h.classList.add('xs');
      });
    },
    render(first) {
      const box = X8.body('sportsPlus'); if (!box) return;
      const nar = this._nar = this.narrow();
      // keep the remote's place and each column's scroll across repaints
      const act = document.activeElement, k = (act && box.contains(act) && act.dataset && act.dataset.k) || this._k || '';
      if (!box._slvK) { box._slvK = 1; box.addEventListener('focusin', (e) => { const t = e.target.closest && e.target.closest('[data-k]'); if (t) this._k = t.dataset.k; }); }
      const scr = {}; qa('[data-scroll]', box).forEach((s) => { scr[s.dataset.scroll] = s.scrollTop; });
      const one = q('.slv-one', box), oneTop = one ? one.scrollTop : 0;
      const g = this.cur(), c = g ? this.colors(g, this.sum(g)) : null;
      box.innerHTML = `<div class="slv-in${nar ? ' nar' : ''}${first ? ' slv-fade' : ''}" ${c ? `style="--c1:#${c.h};--c2:#${c.a}"` : ''}>${this.top(nar)}${nar ? `<div class="slv-one" data-scroll="one">${this.st.screen === 'match' ? this.narrowMatch() : this.narrowList()}</div>` : this.wide()}</div>`;
      qa('[data-scroll]', box).forEach((s) => { if (scr[s.dataset.scroll] != null) s.scrollTop = scr[s.dataset.scroll]; });
      if (one && q('.slv-one', box) && !this._jump) q('.slv-one', box).scrollTop = oneTop; this._jump = false;
      this.bind(box);
      try { icons(); } catch (e) { /* plain */ }
      this.fitNames(box);
      if (tv()) {
        qa('.slv-evs .m, .slv-plays li, .slv-tab-t tbody tr td:first-child, .slv-fact, .slv-tile', box).forEach((x) => { if (!x.hasAttribute('data-nav')) { x.setAttribute('data-nav', ''); x.tabIndex = 0; } });
        qa('[data-scroll="body"]', box).forEach((x) => { if (!q('[data-nav]', x)) { x.setAttribute('data-nav', ''); x.dataset.k = 'body'; x.tabIndex = 0; } x.setAttribute('data-nav-band', ''); });
        const el = (k && q(`[data-k="${CSS.escape(k)}"]`, box)) || q('[data-k="watch"]', box) || q('.slv-ri.on', box) || q('.slv-chip.on', box) || q('[data-nav]', box);
        if (el) try { Nav.focus(el, true); } catch (e) { el.focus({ preventScroll: true }); }
        try { Nav.settle(); } catch (e) { /* remote not ready */ }
      }
    },
    pickGame(id) {
      const g = this.games().find((x) => x.id === id) || Object.values(this.days).flatMap((d) => d.games || []).find((x) => x.id === id); if (!g) return;
      this.st.game = { id: g.id, lg: g.lg, g }; if (this.narrow()) { this.st.screen = 'match'; this._jump = true; const one = q('#sportsPlus .slv-one'); if (one) one.scrollTop = 0; }
      this.render(); this.summary(g).then(() => { if (this.st.game && this.st.game.id === g.id) this.render(); });
    },
    bind(box) {
      const on = (sel, fn) => qa(sel, box).forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); fn(b); }));
      on('[data-slvpick]', (b) => { this.st.pick = b.dataset.slvpick; const l = this.list(); if (!this.narrow() && l[0] && !(this.cur() && l.some((x) => x.id === this.cur().id))) { this.st.game = { id: l[0].id, lg: l[0].lg }; this.summary(l[0]).then(() => this.paintSoft()); } this.render(); });
      on('[data-slvday]', (b) => { this.st.day = Number(b.dataset.slvday); this.st.game = null; this.render(); this.load(); });
      on('[data-slvg]', (b) => this.pickGame(b.dataset.slvg));
      on('[data-slvtab]', (b) => { this.st.tab = b.dataset.slvtab; this.render(); });
      on('[data-slvback]', () => { this.st.screen = 'list'; this.render(); });
      on('[data-slvhide]', () => { setCfg('hideScores', !CFG.hideScores); document.body.classList.toggle('no-scores', !!CFG.hideScores); this.render(); if (this.bug) this.paintBug(); });
      on('[data-slvw]', (b) => { const g = this.cur(); this.tune(this.watch(g)[Number(b.dataset.slvw)]); });
      on('[data-slvfw]', (b) => { const g = this.games().find((x) => x.id === b.dataset.slvfw); this.tune(this.watch(g)[0]); });
      on('[data-slvsplit]', () => { const g = this.cur(); this.split(this.watch(g)[0]); });
      on('[data-slvpin]', () => { const g = this.cur(); if (!g || this.solo(g)) return; if (this.bug && this.bug.id === g.id) this.unpin(); else this.pin(g); this.render(); });
      on('[data-slvf]', (b) => { const g = this.cur(); if (!g || this.solo(g)) return; const t = g[b.dataset.slvf]; SP().follow({ id: t.id, name: t.name, logo: t.logo, lg: g.lg }); this.render(); });
      on('[data-slvhub]', (b) => { const it = this.hub()[Number(b.dataset.slvhub)]; if (!it) return; X8.close('sportsPlus'); try { SportsHub.open(it); } catch (e) { toast('That did not open', 'err'); } });
    },
    /* ---------------- the score kept on screen (over the app and its player; outside players cannot show it) ---------------- */
    pin(g) { this.bug = { id: g.id, lg: g.lg, g }; try { Store.set('slvBug', { id: g.id, lg: g.lg, at: Date.now() }); } catch (e) { /* not kept */ } this.paintBug(); clearInterval(this.bugT); this.bugT = setInterval(() => this.bugBeat(), 45000); toast('The score stays on screen while you watch. Tap × on it to remove it.', 'ok', 4200, 'slvbug'); },
    unpin() { this.bug = null; clearInterval(this.bugT); try { Store.set('slvBug', null); } catch (e) { /* fine */ } const b = q('#slvBug'); if (b) b.remove(); },
    async bugBeat() {
      const b = this.bug; if (!b) return;
      try { const list = await SP().scoreboard(b.lg, 0); let g = list.find((x) => x.id === b.id); if (!g) { const y = await SP().scoreboard(b.lg, -1); g = y.find((x) => x.id === b.id); } if (g) { b.g = g; if (g.state === 'post' && Date.now() - (b.end || (b.end = Date.now())) > 15 * 60e3) { this.unpin(); return; } } } catch (e) { /* try next time */ }
      this.paintBug();
    },
    paintBug() {
      const b = this.bug; if (!b) return; const g = b.g; let el = q('#slvBug');
      if (!el) { el = document.createElement('div'); el.id = 'slvBug'; el.setAttribute('role', 'status'); document.body.appendChild(el); el.addEventListener('click', (e) => { if (e.target.closest('button')) this.unpin(); }); }
      el.innerHTML = `${this.img(g.home)}<b>${this.sc(g.home.score)}–${this.sc(g.away.score)}</b>${this.img(g.away)}<span class="st" translate="no">${E(g.state === 'pre' ? hm(g.date) : this.short(g))}</span><button type="button" aria-label="Remove the score">${I.x}</button>`;
    },
    init() {
      try { const b = Store.get('slvBug', null); if (b && b.id && Date.now() - b.at < 4 * 3600e3) { this.bug = { id: b.id, lg: b.lg, g: { id: b.id, lg: b.lg, home: { score: '' }, away: { score: '' }, state: 'pre', date: Date.now() } }; this.bugBeat(); this.bugT = setInterval(() => this.bugBeat(), 45000); } } catch (e) { /* none kept */ }
      // the Live hub's featured game opens its match page
      document.addEventListener('click', (e) => {
        const f = e.target.closest && e.target.closest('#lhHub .lh-feat');
        if (!f || e.target.closest('button')) return;
        try { const g = MKLiveHub.games[MKLiveHub.pick]; const path = SP().LEAGUES.find(([, n]) => n === g.short); this.open(path ? { id: g.id, lg: path[0] } : undefined); } catch (x) { this.open(); }
      });
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => SL.init(), { once: true }); else SL.init();
})();
