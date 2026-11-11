
'use strict';
/* ---------------- 2.64 Social hub ----------------
   The Friends panel grows into a small social hub with three tabs:
   - Friends: the 2.63 list (requests, chat, calls). A friend's name opens their profile.
   - Activity: what friends finished lately, who is watching now, and a friendly "this month" board.
   - You: your profile card (bio, four favourites), your trophy case, kudos and stats, and a QR code to carry the hub to your phone.
   Privacy follows Friends: only friends you both accepted see anything, and "Share what I watch and my stats" is OFF until
   you turn it on (the server throws away history and stats while it is off). Trophies show to friends unless hidden.
   History and stats come from one seat only (the main seat unless you pick another), never from the rest of the household,
   and never from a kids seat. Single titles can be hidden from friends. Nothing ever pops up over a film. */
const Social = {
  tab: 'friends', view: null, mine: null, feed: [], feedAt: 0, off: false, pubSig: '', pubAt: 0, busy: false, viewCard: null,
  POSTER_HOSTS: /^https:\/\/(image\.tmdb\.org|images\.metahub\.space|live\.metahub\.space|episodes\.metahub\.space|media\.kitsu\.(app|io)|cdn\.myanimelist\.net|s4\.anilist\.co|assets\.fanart\.tv|m\.media-amazon\.com|artworks\.thetvdb\.com)\//,
  KUDOS: [['taste', 'Great taste', 'sparkles'], ['host', 'Party host', 'popcorn'], ['gem', 'Gem finder', 'gem'], ['binge', 'Binge legend', 'flame'], ['pal', 'Great company', 'heart']],
  TIERS: { b: 'Bronze', s: 'Silver', g: 'Gold', p: 'Platinum' },
  /* [id, name, how to earn it, icon, tier, metric, goal]. Ids the server awards itself (years, early, friends, kudos) have no metric. */
  TRO: [
    ['film1', 'First feature', 'Finish your first film', 'clapperboard', 'b', 'films', 1],
    ['film10', 'Regular', 'Finish 10 films', 'clapperboard', 'b', 'films', 10],
    ['film50', 'Film buff', 'Finish 50 films', 'film', 's', 'films', 50],
    ['film100', 'Cinephile', 'Finish 100 films', 'award', 'g', 'films', 100],
    ['film250', 'Auteur', 'Finish 250 films', 'crown', 'p', 'films', 250],
    ['ep10', 'Hooked', 'Finish 10 episodes', 'tv', 'b', 'eps', 10],
    ['ep100', 'Binge-watcher', 'Finish 100 episodes', 'tv', 's', 'eps', 100],
    ['ep500', 'Couch legend', 'Finish 500 episodes', 'medal', 'g', 'eps', 500],
    ['ep1000', 'Series royalty', 'Finish 1,000 episodes', 'crown', 'p', 'eps', 1000],
    ['shows10', 'Channel surfer', 'Watch 10 different shows', 'layers', 'b', 'shows', 10],
    ['hours10', 'Ten-hour club', 'Play 10 hours in MKCinema’s player', 'clock', 'b', 'hours', 10],
    ['hours100', 'Centurion', 'Play 100 hours in MKCinema’s player', 'timer', 's', 'hours', 100],
    ['hours500', 'Lifer', 'Play 500 hours in MKCinema’s player', 'infinity', 'g', 'hours', 500],
    ['streak7', 'Week streak', 'Watch 7 days in a row', 'flame', 'b', 'streak', 7],
    ['streak30', 'Month streak', 'Watch 30 days in a row', 'flame', 's', 'streak', 30],
    ['streak100', 'Unstoppable', 'Watch 100 days in a row', 'flame', 'g', 'streak', 100],
    ['marathon', 'Marathon', 'One sitting of 4 hours', 'mountain', 's', 'sitting', 4],
    ['ironseat', 'Iron seat', 'One sitting of 8 hours', 'mountain', 'g', 'sitting', 8],
    ['owl', 'Night owl', 'Play 10 hours after 10 pm', 'moon', 'b', 'night', 10],
    ['bird', 'Early bird', 'Play 10 hours before noon', 'sunrise', 'b', 'morning', 10],
    ['genres8', 'Explorer', 'Watch titles from 8 genres', 'compass', 's', 'genres', 8],
    ['bingeday', 'Binge day', 'Finish 8 episodes in one day', 'zap', 's', 'bingeDay', 8],
    ['anime50', 'Otaku', 'Finish 50 anime episodes', 'sparkles', 's', 'anime', 50],
    ['party1', 'Better together', 'Watch something in a watch party', 'popcorn', 'b', 'parties', 1],
    ['party10', 'Party regular', 'Watch in 10 watch parties', 'party-popper', 's', 'parties', 10],
    ['profile', 'Ready for the premiere', 'Add a bio and a favourite', 'badge-check', 'b', 'profile', 1],
    ['early', 'Early member', 'Joined MKCinema before 2027', 'rocket', 'g'],
    ['pals1', 'First friend', 'Become friends with someone', 'users', 'b'],
    ['pals10', 'Inner circle', 'Have 10 friends', 'users', 's'],
    ['liked10', 'Well liked', 'Get 10 kudos from friends', 'heart', 's'],
    ['liked50', 'Fan favourite', 'Get 50 kudos from friends', 'heart', 'g'],
  ],
  troDef(id) {
    const d = this.TRO.find((t) => t[0] === id); if (d) return d;
    const y = /^club(\d{1,2})$/.exec(id); if (y) { const n = +y[1]; return [id, `${n}-Year Club`, `${n} year${n > 1 ? 's' : ''} on MKCinema`, 'cake', n >= 5 ? 'g' : n >= 2 ? 's' : 'b']; }
    return null;
  },
  ready() { return typeof Friends !== 'undefined' && Friends.on() && !!Friends.me && !this.off; },
  seatOk() { return (CFG.socSeat || '') === (SEAT || '') && !Seats.kids(); },
  seatName() { const s = Seats.all().find((x) => (x.id || '') === (CFG.socSeat || '')); return (s && s.name) || 'Main'; },
  hidden() { const h = Store.raw.get('socHide', []); return Array.isArray(h) ? h : []; },
  poster(x) {
    if (x && typeof x.p === 'string' && this.POSTER_HOSTS.test(x.p)) return x.p;
    if (x && /^tt\d+$/.test(String(x.id || ''))) return `https://images.metahub.space/poster/medium/${x.id}/img`;
    return Posters.make((x && x.t) || '', `soc:${(x && (x.id || x.t)) || ''}`, 200, 300);
  },
  openTitle(x) {
    if (!x || !x.id) return;
    X8.close('friendsLayer');
    openDetail({ id: x.id, type: x.k === 'movie' ? 'movie' : 'series', name: x.t || '', poster: this.poster(x) });
  },
  ago(at) { return at ? Friends.ago(at) : ''; },

  /* ---- what this seat has done: the numbers behind trophies and shared stats ---- */
  metrics() {
    const c = WatchStats.compute('all'), l = WatchStats.load(), W = watchedMap();
    const sum = (idx) => Object.values(l.h).reduce((a, arr) => a + idx.reduce((b, i) => b + ((arr && arr[i]) || 0), 0), 0) / 3600;
    const perDay = new Map(); let anime = 0;
    const keys = new Set();
    Object.entries(W).forEach(([id, at]) => {
      if (!at) return; const sh = WatchStats.showOf(id); keys.add(sh || id);
      if (sh) { const d = WatchStats.day(at); perDay.set(d, (perDay.get(d) || 0) + 1); if (/^(kitsu|mal):/.test(sh)) anime++; }
    });
    const gs = new Set(); Object.values(l.t).forEach((t) => (t.g || []).forEach((g) => gs.add(g)));
    [...keys].slice(0, 300).forEach((k) => { const i = WatchStats.info(k); if (i) (i.genres || []).forEach((g) => gs.add(g)); });
    const parties = WatchStats.stubs().filter((x) => Array.isArray(x.with) && x.with.length).length;
    const mine = this.mine || {};
    return {
      c, films: c.films, eps: c.eps, shows: c.shows, hours: c.secs / 3600, streak: c.best,
      sitting: l.long.reduce((a, x) => Math.max(a, x.s || 0), 0) / 3600,
      night: sum([22, 23, 0, 1, 2, 3]), morning: sum([5, 6, 7, 8, 9, 10, 11]),
      genres: gs.size, bingeDay: Math.max(0, ...perDay.values()), anime, parties,
      profile: (mine.bio && (mine.favs || []).length) ? 1 : 0,
    };
  },
  /* trophies earned on this device for the sharing seat, with the time each was first seen. Never taken away. */
  earned(m) {
    const key = `socTro:${CFG.socSeat || 'main'}`, got = Store.raw.get(key, {}) || {}, now = Date.now(), fresh = [];
    const seeded = Store.raw.get(`${key}:seeded`, false);
    this.TRO.forEach(([id, , , , , metric, goal]) => { if (metric && !got[id] && (m[metric] || 0) >= goal) { got[id] = now; fresh.push(id); } });
    Store.raw.set(key, got);
    if (!seeded) Store.raw.set(`${key}:seeded`, true);
    else if (fresh.length) {
      const d = this.troDef(fresh[fresh.length - 1]);
      Friends.note(fresh.length > 1 ? `${fresh.length} new trophies, including ${d[1]}` : `Trophy unlocked: ${d[1]}`);
    }
    return got;
  },
  statsOut(m) {
    const per = (k) => { const c = k === 'all' ? m.c : WatchStats.compute(k); return { s: Math.round(c.secs), f: c.films, e: c.eps, sh: c.shows }; };
    const d = new Date(), mon = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, old = (this.mine && this.mine.stats) || {};
    const o = { m: per('month'), y: per('year'), a: per('all'), cur: m.c.cur, best: m.c.best, mon, g: m.c.genres.slice(0, 3).map(([g]) => String(g).slice(0, 24)) };
    const pers = WatchStats.persona(m.c.hours, m.c.week); if (pers) o.p = pers.name;
    // time is counted per device: keep the larger figure another of your devices already shared for the same period
    if (old.mon === mon && old.m && old.m.s > o.m.s) o.m.s = old.m.s;
    if (old.mon && old.mon.slice(0, 4) === mon.slice(0, 4) && old.y && old.y.s > o.y.s) o.y.s = old.y.s;
    if (old.a && old.a.s > o.a.s) o.a.s = old.a.s;
    return o;
  },
  /* the last 20 things finished, a show counted once with its newest episode */
  recentOut() {
    const W = watchedMap(), hide = new Set(this.hidden()), out = [], by = new Map();
    const ents = Object.entries(W).filter(([, at]) => at > 0).sort((a, b) => b[1] - a[1]).slice(0, 400);
    for (const [id, at] of ents) {
      const sh = WatchStats.showOf(id), key = sh || id;
      if (hide.has(key)) continue;
      const had = by.get(key); if (had) { if (sh) had.n = (had.n || 1) + 1; continue; }
      if (out.length >= 20) continue;
      const i = WatchStats.info(key); if (!i || !i.name) continue;
      const x = { t: String(i.name).slice(0, 120), k: sh ? (/^(kitsu|mal):/.test(key) ? 'anime' : 'series') : 'movie', at: Math.round(at) };
      if (/^(tt\d+|tmdb:\d+|kitsu:\d+|mal:\d+)$/.test(key)) x.id = key;
      if (i.poster && this.POSTER_HOSTS.test(i.poster) && !/images\.metahub\.space\/poster/.test(i.poster)) x.p = String(i.poster).slice(0, 300);
      if (sh) { const p = String(id).split(':'), e = +p[p.length - 1], s = +p[p.length - 2]; x.ep = /^tt/.test(key) && p.length >= 3 ? `S${s} E${e}` : `E${e}`; x.n = 1; }
      out.push(x); by.set(key, x);
    }
    return out;
  },

  /* ---- talking to the server ---- */
  async rpc(fn, args) {
    try { return await Friends.rpc(fn, args); } catch (e) { if (/not switched on/.test(e.message)) { this.off = true; } throw e; }
  },
  async start() {
    if (!Friends.on() || !Friends.me) return;
    try { this.mine = await this.rpc('mkc_card', { other: Friends.me.id }); this.off = false; } catch (e) { return; }
    this.publish();
  },
  stop() { this.mine = null; this.feed = []; this.feedAt = 0; this.view = null; this.viewCard = null; this.pubSig = ''; },
  /* send my card. Seat-based parts (trophies, history, stats) are only worked out on the sharing seat. */
  async publish(force, change) {
    if (!this.ready() || this.busy) return;
    if (!this.mine) { try { this.mine = await this.rpc('mkc_card', { other: Friends.me.id }); } catch (e) { return; } }
    const mine = this.mine || {}, share = CFG.socShare === true, seat = this.seatOk();
    let tro = {}, stats = mine.stats || null, recent = mine.recent || null;
    Object.entries(mine.trophies || {}).forEach(([k, v]) => { if (this.TRO.some((t) => t[0] === k && t[5])) tro[k] = v; });
    if (seat) {
      let m = null; try { m = this.metrics(); } catch (e) { m = null; }
      if (m) {
        Object.entries(this.earned(m)).forEach(([k, v]) => { tro[k] = tro[k] ? Math.min(tro[k], v) : v; });
        if (share) { stats = this.statsOut(m); recent = this.recentOut(); }
      }
    } else if (!force) return;
    const body = Object.assign({ p_bio: mine.bio || '', p_favs: mine.favs || [], p_trophies: tro, p_show_trophies: CFG.socTrophies !== false, p_share: share, p_stats: share ? stats : null, p_recent: share ? recent : null }, change || {});
    const sig = JSON.stringify([body.p_bio, body.p_favs, Object.keys(body.p_trophies).sort(), body.p_show_trophies, body.p_share, body.p_stats && [body.p_stats.m, body.p_stats.y, body.p_stats.cur], body.p_recent && body.p_recent.map((x) => [x.t, x.ep, x.n])]);
    if (!force && sig === this.pubSig && Date.now() - this.pubAt < 6 * 3600e3) return;
    this.busy = true;
    try { this.mine = await this.rpc('mkc_card_set', body); this.pubSig = sig; this.pubAt = Date.now(); }
    catch (e) { if (force) throw e; }
    finally { this.busy = false; }
  },
  async loadFeed(force) {
    if (!this.ready()) return;
    if (!force && Date.now() - this.feedAt < 60000) return;
    try { this.feed = (await this.rpc('mkc_social')) || []; this.feedAt = Date.now(); } catch (e) { this.feed = []; }
  },

  /* ---- the hub ---- */
  tabs() {
    const t = [['friends', 'Friends', 'users'], ['activity', 'Activity', 'activity'], ['you', 'You', 'trophy']];
    return `<div class="segc soc-tabs" role="tablist" aria-label="Social">${t.map(([k, l, i]) => `<button type="button" role="tab" class="${this.tab === k ? 'on' : ''}" aria-selected="${this.tab === k}" data-nav data-soctab="${k}"><i data-lucide="${i}"></i><span>${l}</span></button>`).join('')}</div>`;
  },
  /* the Friends panel asks this first: true when the hub paints instead of the friends list */
  owns() { return !!(this.view || this.tab !== 'friends'); },
  setTab(t) {
    this.tab = t; this.view = null; this.viewCard = null;
    const b = X8.body('friendsLayer'); if (!b) return;
    Friends.chat = null; Friends.mode = '';
    if (t === 'friends') { b.innerHTML = ''; Friends.paint(); } else this.paint(b);
    const n = $(`[data-soctab="${t}"]`, b); if (n && IS_TV) Nav.focus(n, true);
  },
  paint(b) {
    b = b || X8.body('friendsLayer'); if (!b) return;
    if (!Friends.me) { Friends.paint(); return; }
    if (this.view) { this.paintProfile(b); return; }
    b.innerHTML = `${this.tabs()}<div class="soc-pane" id="socPane"><p class="fr-dim">Loading…</p></div>`;
    this.bind(b); icons();
    if (this.off) { $('#socPane', b).innerHTML = '<p class="x8-p">Profiles and trophies are not switched on for this server yet. Friends and messages still work.</p>'; return; }
    const pane = $('#socPane', b), tab = this.tab;
    const go = async () => {
      if (tab === 'activity') { await this.loadFeed(); if (this.tab === tab && pane.isConnected && !this.view) this.paintActivity(pane); }
      else { if (!this.mine) { try { this.mine = await this.rpc('mkc_card', { other: Friends.me.id }); } catch (e) { /* off */ } } this.publish().catch(() => {}); if (this.tab === tab && pane.isConnected && !this.view) this.paintYou(pane); }
    };
    // what is already known paints at once; fresh data repaints quietly
    if (tab === 'activity' && this.feedAt) this.paintActivity(pane);
    if (tab === 'you' && this.mine) this.paintYou(pane);
    go().catch(() => {});
  },
  bind(b) {
    if (b.dataset.socb) return; b.dataset.socb = '1';
    b.addEventListener('click', (e) => {
      const x = e.target.closest('[data-soc],[data-soctab]'); if (!x || !b.contains(x)) return;
      if (x.dataset.soctab) { this.setTab(x.dataset.soctab); return; }
      const id = x.dataset.id, f = id ? Friends.byId(id) : null;
      switch (x.dataset.soc) {
        case 'profile': if (f) this.profile(f); break;
        case 'title': this.openTitle(this.titleFrom(x)); break;
        case 'back': this.closeView(); break;
        case 'msg': if (f) { this.view = null; Friends.openChat(f); } break;
        case 'call': if (f) FCall.start(f); break;
        case 'party': if (f) { this.view = null; Friends.openChat(f); Friends.inviteParty(); } break;
        case 'more': if (f) Friends.more(f); break;
        case 'kudos': this.kudos(x); break;
        case 'share': this.setShare(!CFG.socShare); break;
        case 'seat': setCfg('socSeat', SEAT || ''); this.pubSig = ''; this.publish(true).catch(() => {}); this.paint(); toast(`Your profile now uses the ${this.seatName()} seat`, 'ok'); break;
        case 'edit': this.editCard(); break;
        case 'names': Friends.mode = 'edit'; this.tab = 'friends'; this.view = null; b.innerHTML = ''; Friends.paint(); break;
        case 'locked': this.showLocked = !this.showLocked; this.paintYou($('#socPane', b)); break;
        case 'hide': this.hideTitle(x.dataset.key); break;
        case 'stats': X8.close('friendsLayer'); WatchStats.open(); break;
        case 'privacy': X8.close('friendsLayer'); openSettings('friends'); break;
        default: break;
      }
    });
  },
  titleFrom(x) { try { return JSON.parse(x.dataset.t || '{}'); } catch (e) { return null; } },
  tAttr(x) { return esc(JSON.stringify({ id: x.id || '', k: x.k || '', t: x.t || '', p: x.p || '' })); },
  posterBtn(x, sub) {
    const can = !!x.id;
    return `<button type="button" class="soc-post" data-nav ${can ? `data-soc="title" data-t="${this.tAttr(x)}"` : 'disabled'} aria-label="${esc(x.t)}"><img src="${esc(this.poster(x))}" alt="" loading="lazy" decoding="async"><span>${esc(x.t)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
  },
  hm(s) { return WatchStats.hm(s || 0); },

  /* Activity: who is watching now, what friends finished, and this month's board */
  paintActivity(pane) {
    const friends = Friends.list.filter((f) => f.state === 'friend'), byId = new Map(this.feed.map((x) => [x.id, x]));
    if (!friends.length) { pane.innerHTML = `<div class="soc-empty"><i data-lucide="users"></i><p>Add a friend in the Friends tab and their activity shows up here, if they choose to share it.</p><button class="btn btn-prime btn-sm" type="button" data-nav data-soctab="friends"><i data-lucide="user-plus"></i>Add a friend</button></div>`; icons(); return; }
    const now = friends.filter((f) => f.on && f.watching && f.watching.t);
    const items = [];
    this.feed.forEach((p) => (p.recent || []).forEach((x) => { if (x && x.t) items.push({ x, p }); }));
    items.sort((a, b) => (b.x.at || 0) - (a.x.at || 0));
    const dayName = (at) => { const d = new Date(at), t = new Date(); const diff = Math.round((new Date(t.toDateString()) - new Date(d.toDateString())) / 864e5); return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }); };
    let prev = '';
    const feed = items.slice(0, 40).map(({ x, p }) => {
      const f = Friends.byId(p.id) || p, d = x.at ? dayName(x.at) : '', head = d !== prev ? `<h4 class="soc-day">${esc(d)}</h4>` : ''; prev = d;
      const what = x.k === 'movie' ? 'finished' : 'watched', ep = x.ep ? ` · ${x.ep}${x.n > 1 ? ` and ${x.n - 1} more` : ''}` : '';
      return `${head}<div class="soc-item"><button type="button" class="soc-who" data-nav data-soc="profile" data-id="${esc(p.id)}" aria-label="${esc(Friends.label(f))}">${Friends.av(f)}</button>
        <div class="soc-line"><b>${esc(Friends.label(f))}</b> ${what} <span class="soc-t">${esc(x.t)}</span><small>${esc(ep.replace(/^ · /, ''))}${x.at ? `${ep ? ' · ' : ''}${esc(this.ago(x.at))}` : ''}</small></div>
        <button type="button" class="soc-thumb" data-nav ${x.id ? `data-soc="title" data-t="${this.tAttr(x)}"` : 'disabled'} aria-label="Open ${esc(x.t)}"><img src="${esc(this.poster(x))}" alt="" loading="lazy" decoding="async"></button></div>`;
    }).join('');
    const sharing = this.feed.filter((p) => p.stats || (p.recent && p.recent.length)).length;
    const nowHtml = now.length ? `<section class="soc-sec"><h3>Watching now</h3><div class="soc-row">${now.map((f) => `<button type="button" class="soc-now" data-nav ${f.watching.id ? `data-soc="title" data-t="${this.tAttr({ id: f.watching.id, k: f.watching.k, t: f.watching.t, p: f.watching.p })}"` : `data-soc="profile" data-id="${esc(f.id)}"`}>
        <img src="${esc(this.poster({ id: f.watching.id, t: f.watching.t, p: f.watching.p }))}" alt="" loading="lazy" decoding="async"><span>${Friends.av(f)}<b>${esc(Friends.label(f))}</b></span><small>${esc(f.watching.t)}${f.watching.ep ? ` · ${esc(f.watching.ep)}` : ''}</small></button>`).join('')}</div></section>` : '';
    pane.innerHTML = `${nowHtml}${this.boardHtml()}
      <section class="soc-sec"><h3>Lately</h3>${feed || `<div class="soc-empty sm"><p>${sharing ? 'Nothing finished lately.' : 'None of your friends share what they watch yet. Sharing is off until each person turns it on.'}</p>${CFG.socShare ? '' : '<button class="btn btn-ghost btn-sm" type="button" data-nav data-soc="share"><i data-lucide="share-2"></i>Share mine</button>'}</div>`}</section>`;
    icons(); byId.clear();
  },
  /* this month: hours played, for friends who share (and you, shown to you either way) */
  boardHtml() {
    const d = new Date(), mon = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rows = this.feed.filter((p) => p.stats && p.stats.mon === mon && p.stats.m).map((p) => ({ f: Friends.byId(p.id) || p, s: p.stats.m.s || 0, n: (p.stats.m.f || 0) + (p.stats.m.e || 0) }));
    let me = null; try { if (this.seatOk()) { const c = WatchStats.compute('month'); me = { f: Object.assign({}, Friends.me, { on: false }), s: c.secs, n: c.films + c.eps, me: true }; } } catch (e) { /* no stats */ }
    if (me) rows.push(me);
    if (rows.length < 2) return '';
    rows.sort((a, b) => b.s - a.s || b.n - a.n);
    const top = Math.max(rows[0].s, 1);
    return `<section class="soc-sec"><h3>This month</h3><div class="soc-board">${rows.slice(0, 10).map((r, i) => `<div class="soc-rank${r.me ? ' me' : ''}" style="--v:${Math.max(0.04, r.s / top).toFixed(3)}"><span class="tnum soc-n">${i + 1}</span>${Friends.av(r.f)}<b>${r.me ? 'You' : esc(Friends.label(r.f))}</b><small class="tnum">${r.s >= 60 ? esc(this.hm(r.s)) : `${r.n} finished`}</small></div>`).join('')}</div>
      ${me && !CFG.socShare ? '<p class="fr-dim">Only you see your own row until you share.</p>' : ''}</section>`;
  },

  /* trophies: medallions in tier colours, earned first */
  troList(tro, withLocked, m) {
    const got = Object.entries(tro || {}).map(([id, at]) => [this.troDef(id), at]).filter(([d]) => d);
    const order = { p: 0, g: 1, s: 2, b: 3 };
    got.sort((a, b) => order[a[0][4]] - order[b[0][4]] || (b[1] || 0) - (a[1] || 0));
    let html = got.map(([d, at]) => `<div class="soc-tro t-${d[4]}" title="${esc(`${d[1]}: ${d[2]}`)}"><span class="soc-med"><i data-lucide="${d[3]}"></i></span><b>${esc(d[1])}</b><small>${esc(at > 1e11 ? new Date(at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : this.TIERS[d[4]])}</small></div>`).join('');
    if (withLocked && m) {
      html += this.TRO.filter((d) => d[5] && !tro[d[0]]).map((d) => { const have = Math.min(d[6], Math.floor(m[d[5]] || 0)); return `<div class="soc-tro locked" title="${esc(d[2])}"><span class="soc-med"><i data-lucide="lock"></i></span><b>${esc(d[1])}</b><small>${esc(d[2])}</small><span class="soc-prog" style="--v:${(have / d[6]).toFixed(3)}"><i></i></span><small class="tnum">${have.toLocaleString()} / ${d[6].toLocaleString()}</small></div>`; }).join('');
    }
    return html;
  },
  kudosHtml(card, give) {
    const k = card.kudos || {}, gave = new Set(card.gave || []);
    if (!give) { const l = this.KUDOS.filter(([id]) => k[id]); return l.length ? `<div class="soc-kudos">${l.map(([id, n, i]) => `<span class="soc-kd"><i data-lucide="${i}"></i>${esc(n)}<em class="tnum">${k[id]}</em></span>`).join('')}</div>` : ''; }
    return `<div class="soc-kudos">${this.KUDOS.map(([id, n, i]) => `<button type="button" class="soc-kd${gave.has(id) ? ' on' : ''}" aria-pressed="${gave.has(id)}" data-nav data-soc="kudos" data-k="${id}" data-id="${esc(card.id)}"><i data-lucide="${i}"></i>${esc(n)}${k[id] ? `<em class="tnum">${k[id]}</em>` : ''}</button>`).join('')}</div>`;
  },
  statsHtml(st, mine) {
    if (!st) return '';
    const y = st.y || {}, m = st.m || {}, d = new Date(), thisMon = st.mon === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const tiles = [[thisMon && m.s >= 60 ? this.hm(m.s) : '0 m', 'This month'], [(y.f || 0).toLocaleString(), 'Films this year'], [(y.e || 0).toLocaleString(), 'Episodes this year'], [`${st.best || 0}`, 'Best streak (days)']];
    return `<div class="soc-tiles">${tiles.map(([v, k]) => `<div><b class="tnum">${esc(v)}</b><small>${esc(k)}</small></div>`).join('')}</div>
      ${st.p || (st.g && st.g.length) ? `<p class="soc-taste">${st.p ? `<span class="ws-tag"><i data-lucide="sparkles"></i>${esc(st.p)}</span>` : ''}${st.g && st.g.length ? `<span>Mostly ${esc(st.g.join(', '))}</span>` : ''}</p>` : ''}
      ${mine ? '<button class="btn btn-ghost btn-sm" type="button" data-nav data-soc="stats"><i data-lucide="bar-chart-3"></i>All your stats</button>' : ''}`;
  },

  /* You: your card as friends see it, trophies with what is left to earn, sharing and the phone */
  paintYou(pane) {
    if (!pane) return;
    const me = Friends.me, card = this.mine || { favs: [], trophies: {}, kudos: {} };
    let m = null; if (this.seatOk()) { try { m = this.metrics(); } catch (e) { m = null; } }
    const tro = Object.assign({}, card.trophies || {}); if (m) Object.entries(this.earned(m)).forEach(([k, v]) => { if (!tro[k]) tro[k] = v; });
    const nGot = Object.keys(tro).filter((k) => this.troDef(k)).length, nAll = this.TRO.filter((d) => d[5]).length + Object.keys(tro).filter((k) => !this.TRO.some((d) => d[0] === k && d[5]) && this.troDef(k)).length;
    const seats = Seats.all().filter((s) => !s.kids), otherSeat = seats.length > 1 && !this.seatOk();
    const share = CFG.socShare === true;
    pane.innerHTML = `<section class="soc-card">${Friends.av(Object.assign({}, me, { on: CFG.frOnline !== false }), true)}
        <div class="soc-id"><b>${esc(me.name || me.username)}</b><small>@${esc(me.username)}</small>${card.bio ? `<p>${esc(card.bio)}</p>` : '<p class="fr-dim">No bio yet.</p>'}</div>
        <div class="soc-acts"><button class="btn btn-ghost btn-sm" type="button" data-nav data-soc="edit"><i data-lucide="pencil"></i><span>Edit profile</span></button></div></section>
      ${this.kudosHtml(card, false)}
      <section class="soc-sec"><h3>Favourites</h3>${(card.favs || []).length ? `<div class="soc-favs">${card.favs.map((x) => this.posterBtn(x)).join('')}</div>` : '<p class="fr-dim">Pick up to four films or shows in Edit profile. Friends see them on your profile.</p>'}</section>
      <section class="soc-sec"><h3>Trophies <span class="fr-dim tnum">${nGot}${m ? ` of ${nAll}` : ''}</span></h3>
        <div class="soc-tros">${this.troList(tro, this.showLocked, m) || '<p class="fr-dim">Your first trophy is one finished film away.</p>'}</div>
        ${m ? `<button class="btn btn-ghost btn-sm" type="button" data-nav data-soc="locked"><i data-lucide="${this.showLocked ? 'eye-off' : 'trophy'}"></i>${this.showLocked ? 'Hide the ones to earn' : 'Show the ones to earn'}</button>` : ''}
        ${CFG.socTrophies === false ? '<p class="fr-dim">Your trophies are hidden from friends (Settings › Friends).</p>' : ''}</section>
      <section class="soc-sec"><h3>Your stats</h3>
        <div class="fr-opt"><div><b>Share what I watch and my stats</b><small>${share ? `Friends you accepted see your last 20 finished titles and these numbers, from the ${esc(this.seatName())} seat.` : 'Off. Only you see this. Friends see your profile and trophies.'}</small></div><button class="switch ${share ? 'on' : ''}" type="button" role="switch" aria-checked="${share}" data-nav data-soc="share" aria-label="Share what I watch and my stats"></button></div>
        ${otherSeat ? `<div class="fr-opt"><div><b>Seat</b><small>Your profile uses the ${esc(this.seatName())} seat. This seat is ${esc((Seats.cur() || {}).name || 'Main')}.</small></div><button class="btn btn-ghost btn-sm" type="button" data-nav data-soc="seat">Use this seat</button></div>` : ''}
        ${m ? this.statsHtml(this.statsOut(m), true) : '<p class="fr-dim">Stats come from the seat your profile uses.</p>'}</section>
      ${share && this.seatOk() ? this.hideHtml() : ''}
      ${this.phoneHtml()}
      <p class="fr-dim soc-foot">Only friends you both accepted can open your profile. <button class="linkish" type="button" data-nav data-soc="privacy">Privacy settings</button></p>`;
    icons();
  },
  hideHtml() {
    const list = this.recentOut().slice(0, 12), hidden = this.hidden();
    if (!list.length && !hidden.length) return '';
    return `<details class="soc-sec soc-hide"><summary data-nav>What friends see lately <span class="fr-dim tnum">${list.length}</span></summary>
      ${list.map((x) => `<div class="soc-hrow"><span>${esc(x.t)}${x.ep ? ` <small>${esc(x.ep)}</small>` : ''}</span><button class="btn btn-ghost btn-sm" type="button" data-nav data-soc="hide" data-key="${esc(x.id || x.t)}"><i data-lucide="eye-off"></i>Hide</button></div>`).join('')}
      ${hidden.length ? `<p class="fr-dim">${hidden.length} title${hidden.length === 1 ? '' : 's'} hidden. <button class="linkish" type="button" data-nav data-soc="hide" data-key="">Show them again</button></p>` : ''}</details>`;
  },
  hideTitle(key) {
    let h = this.hidden();
    if (!key) h = []; else if (!h.includes(key)) h = [key, ...h].slice(0, 300);
    Store.raw.set('socHide', h);
    this.publish(true).catch(() => {}).then(() => this.paintYou($('#socPane')));
    const d = $('.soc-hide'); if (d) d.open = true;
  },
  /* the hub on your phone: a QR code to the same page. Everything syncs with your account. */
  phoneHtml() {
    if (!/^https?:$/.test(location.protocol) || (TOUCH_UI && !IS_TV && matchMedia('(max-width: 760px)').matches)) return '';
    const host = location.hostname, link = /(^|\.)mkcinema\.app$|\.pages\.dev$/.test(host) ? 'https://app.mkcinema.app/#social' : `${location.origin}${location.pathname}#social`;
    let qr = ''; try { qr = QR.svg(link); } catch (e) { return ''; }
    return `<section class="soc-sec soc-phone"><div class="qr-wrap">${qr}</div><div><h3>Take it with you</h3><p class="fr-dim">Scan with your phone camera to open your friends, activity and trophies there. Sign in with the same account and it all follows you.</p></div></section>`;
  },
  async setShare(v) {
    setCfg('socShare', !!v);
    if (v && !(Seats.all().length > 1) && CFG.socSeat == null) setCfg('socSeat', SEAT || '');
    try { await this.publish(true); toast(v ? 'Friends can now see what you finish and your stats' : 'Sharing is off. Your history and stats were removed from the server.', 'ok', 4200); }
    catch (e) { toast(e.message || String(e), 'err'); }
    const p = $('#socPane'); if (p && this.tab === 'you') this.paintYou(p);
  },
  editCard() {
    const pane = $('#socPane'); if (!pane) return;
    const card = this.mine || {}, sel = (card.favs || []).map((x) => ({ ...x }));
    const seen = new Set(), cands = [];
    const add = (x) => { const k = x.id || x.t; if (!x.t || seen.has(k) || cands.length >= 36) return; seen.add(k); cands.push(x); };
    sel.forEach(add);
    try { this.recentOut().forEach((x) => add({ id: x.id, k: x.k, t: x.t, p: x.p })); } catch (e) { /* no history */ }
    (S.watchlist || []).forEach((m) => { if (m && m.name && /^(tt\d+|tmdb:\d+|kitsu:\d+|mal:\d+)$/.test(String(m.id))) add({ id: m.id, k: m.type === 'movie' ? 'movie' : 'series', t: String(m.name).slice(0, 120), p: this.POSTER_HOSTS.test(m.poster || '') ? m.poster : undefined }); });
    const isSel = (x) => sel.some((y) => (y.id || y.t) === (x.id || x.t));
    pane.innerHTML = `<h3 class="x8-h">Edit profile</h3>
      <label class="fr-lbl" for="socBio">Bio <span class="fr-dim">(friends only)</span></label>
      <textarea class="inp" id="socBio" maxlength="160" rows="3" placeholder="What you love to watch, in a line or two" data-nav>${esc(card.bio || '')}</textarea>
      <small class="fr-hint"><span id="socBioN" class="tnum">${(card.bio || '').length}</span> / 160</small>
      <div class="fr-lbl">Favourites <span class="fr-dim">(up to 4)</span></div>
      ${cands.length ? `<div class="soc-pick">${cands.map((x, i) => `<button type="button" class="soc-post${isSel(x) ? ' sel' : ''}" aria-pressed="${isSel(x)}" data-nav data-pick="${i}"><img src="${esc(this.poster(x))}" alt="" loading="lazy" decoding="async"><span>${esc(x.t)}</span></button>`).join('')}</div>` : '<p class="fr-dim">Finish something or add titles to your Watchlist, and you can pick them here.</p>'}
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="socSave"><i data-lucide="check"></i>Save</button><button class="btn btn-ghost" type="button" data-nav data-soc="names"><i data-lucide="user"></i>Name and colour</button><button class="btn btn-ghost" type="button" data-nav id="socCancel">Cancel</button></div>`;
    icons();
    const bio = $('#socBio', pane); if (IS_TV) TvType.guard(bio);
    bio.addEventListener('input', () => { $('#socBioN', pane).textContent = bio.value.length; });
    $$('[data-pick]', pane).forEach((el) => el.addEventListener('click', () => {
      const x = cands[+el.dataset.pick], k = x.id || x.t, i = sel.findIndex((y) => (y.id || y.t) === k);
      if (i >= 0) sel.splice(i, 1); else { if (sel.length >= 4) { toast('Four favourites at most. Tap one to remove it first.', 'info', 2600); return; } sel.push(x); }
      el.classList.toggle('sel', i < 0); el.setAttribute('aria-pressed', i < 0);
    }));
    $('#socCancel', pane).onclick = () => this.paintYou(pane);
    $('#socSave', pane).onclick = async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        await this.publish(true, { p_bio: bio.value.trim().slice(0, 160), p_favs: sel.slice(0, 4).map((x) => ({ id: x.id, k: x.k, t: x.t, p: x.p })) });
        toast('Profile saved', 'ok'); this.paintYou(pane);
      } catch (err) { toast(err.message || String(err), 'err', 5000); if (btn.isConnected) btn.disabled = false; }
    };
    if (IS_TV) Nav.focus(bio, true);
  },

  /* a friend's profile, inside the same panel (Back returns to where you were) */
  async profile(f) {
    const b = X8.body('friendsLayer'); if (!b || !f) return;
    this.view = f.id; this.viewCard = null; Friends.chat = null; Friends.mode = 'profile';
    this.paintProfile(b);
    let card = null; try { card = await this.rpc('mkc_card', { other: f.id }); } catch (e) { card = { error: e.message }; }
    if (this.view !== f.id) return;
    this.viewCard = card || { gone: true }; this.paintProfile(b);
  },
  closeView() {
    this.view = null; this.viewCard = null; Friends.mode = '';
    const b = X8.body('friendsLayer'); if (!b) return;
    if (this.tab === 'friends') { b.innerHTML = ''; Friends.paint(); } else this.paint(b);
  },
  paintProfile(b) {
    const f = Friends.byId(this.view); if (!f) { this.closeView(); return; }
    const c = this.viewCard, keepK = document.activeElement && b.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    const [can, why] = Friends.canCall(f);
    let body = '<p class="fr-dim">Loading…</p>';
    if (c && c.error) body = `<p class="fr-dim">${esc(c.error)}</p>`;
    else if (c && c.gone) body = '<p class="fr-dim">This profile is not available.</p>';
    else if (c) {
      const W = watchedMap(), mineKeys = new Set(Object.keys(W).map((id) => WatchStats.showOf(id) || id));
      const theirs = [...(c.favs || []), ...(c.recent || [])], common = []; const cs = new Set();
      theirs.forEach((x) => { if (x.id && mineKeys.has(x.id) && !cs.has(x.id)) { cs.add(x.id); common.push(x); } });
      body = `${c.bio ? `<p class="soc-bio">${esc(c.bio)}</p>` : ''}
        ${common.length ? `<section class="soc-sec"><h3>You both watched <span class="fr-dim tnum">${common.length}</span></h3><div class="soc-row">${common.slice(0, 12).map((x) => this.posterBtn(x)).join('')}</div></section>` : ''}
        ${(c.favs || []).length ? `<section class="soc-sec"><h3>Favourites</h3><div class="soc-favs">${c.favs.map((x) => this.posterBtn(x)).join('')}</div></section>` : ''}
        <section class="soc-sec"><h3>Trophies</h3>${c.show_trophies === false ? '<p class="fr-dim">Hidden by them.</p>' : `<div class="soc-tros">${this.troList(c.trophies) || '<p class="fr-dim">No trophies yet.</p>'}</div>`}</section>
        <section class="soc-sec"><h3>Kudos</h3><p class="fr-dim">A small thank-you. They see the count, and you can take yours back any time.</p>${this.kudosHtml(c, true)}</section>
        ${c.share ? `<section class="soc-sec"><h3>Stats</h3>${this.statsHtml(c.stats, false) || '<p class="fr-dim">Nothing counted yet.</p>'}</section>
          ${(c.recent || []).length ? `<section class="soc-sec"><h3>Lately</h3><div class="soc-row">${c.recent.map((x) => this.posterBtn(x, [x.ep, x.at ? this.ago(x.at) : ''].filter(Boolean).join(' · '))).join('')}</div></section>` : ''}`
          : `<p class="fr-dim soc-foot">${esc(Friends.label(f))} doesn’t share what they watch.</p>`}`;
    }
    b.innerHTML = `<div class="soc-phead"><button class="ibtn sm" type="button" data-nav data-soc="back" aria-label="Back"><i data-lucide="arrow-left"></i></button><span class="fr-dim">Profile</span>
        <span class="soc-phx"><button class="ibtn sm" type="button" data-nav data-soc="call" data-id="${esc(f.id)}" ${can ? '' : 'disabled'} aria-label="${can ? 'Call' : esc(why)}" title="${can ? 'Call' : esc(why)}"><i data-lucide="phone"></i></button>
        <button class="ibtn sm" type="button" data-nav data-soc="more" data-id="${esc(f.id)}" aria-label="Remove, block or report"><i data-lucide="menu"></i></button></span></div>
      <div class="soc-pane soc-prof"><section class="soc-card">${Friends.av(f, true)}<div class="soc-id"><b>${esc(f.name || f.username)}</b><small>@${esc(f.username)} · <span class="${f.on ? 'fr-live' : ''}">${esc(Friends.status(f))}</span></small></div></section>
      <div class="soc-acts wide"><button class="btn btn-prime btn-sm" type="button" data-nav data-soc="msg" data-id="${esc(f.id)}"><i data-lucide="message-circle"></i>Message</button>
        <button class="btn btn-ghost btn-sm" type="button" data-nav data-soc="party" data-id="${esc(f.id)}"><i data-lucide="popcorn"></i>Watch party</button></div>
      ${body}</div>`;
    this.bind(b); icons();
    const back = keepK ? $(`[data-k="${CSS.escape(keepK)}"]`, b) : null;
    if (back) { if (IS_TV) Nav.focus(back, true); else back.focus({ preventScroll: true }); }
    else if (IS_TV) { const x = $('[data-soc="msg"]', b); if (x) Nav.focus(x, true); }
  },
  async kudos(x) {
    const id = x.dataset.id, k = x.dataset.k, on = !x.classList.contains('on');
    x.disabled = true;
    try {
      const card = await this.rpc('mkc_kudos_give', { other: id, p_kind: k, p_on: on });
      if (this.view === id && card) { this.viewCard = card; this.paintProfile(X8.body('friendsLayer')); }
      if (on) Friends.poke(id, { t: 'k' });
    } catch (e) { toast(e.message || String(e), 'err', 4000); if (x.isConnected) x.disabled = false; }
  },

  settingsRows() {
    return [
      { key: 'socShare', label: 'Share what I watch and my stats', help: 'Off until you turn it on. Friends you accepted see your last 20 finished titles and your stats, from one seat only. Hide single titles in Friends › You.', type: 'toggle', get: () => CFG.socShare === true, set: (v) => { this.setShare(v); } },
      { key: 'socTrophies', label: 'Show my trophies and kudos', help: 'Friends see the trophies you earned on your profile. Off hides them.', type: 'toggle', get: () => CFG.socTrophies !== false, set: (v) => { setCfg('socTrophies', v); this.publish(true).catch((e) => toast(e.message, 'err')); } },
    ];
  },
  init() {
    if (typeof Friends === 'undefined') return;
    X8.backHook.friendsLayer = () => {
      if (this.view) { this.closeView(); return true; }
      if (Friends.chat) { Friends.closeChat(); return true; }
      return false;
    };
    // the hub again on a schedule, never while a film plays, and only when something changed
    setInterval(() => { if (document.visibilityState === 'visible' && !Friends.playerOpen() && this.ready()) this.publish().catch(() => {}); }, 10 * 60e3);
    // app.mkcinema.app/#social opens the hub (the QR code on TVs and computers points here)
    const deep = () => {
      if (!/^#(social|friends)$/.test(location.hash)) return;
      const t = location.hash === '#social' ? 'activity' : 'friends';
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => { if (Friends.kids()) return; this.tab = t; Friends.open(); }, 600);
    };
    addEventListener('hashchange', deep); deep();
  },
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Social.init()); else setTimeout(() => Social.init(), 0);
