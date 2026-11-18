
'use strict';
/* ---------------- 2.82 Home cards and the Android Continue watching widget ----------------
   Owner, 2026-11-18: "useful widgets on their home screen. No cheesy stuff."
   HomeWidget: MKCinema for Android 1.17.0 has a home-screen widget (ContinueWidget). The page sends it what is in
   progress when it changes and whenever the app goes to the background (the moment the home screen shows), only while a
   widget is placed. Its Resume comes back as #resume?v=VIDEO_ID (cold start) or MKResumeLink(v) (app open), and plays
   from where you stopped, like Resume on the Continue watching row. Only a video in this seat's Continue watching plays.
   HomeCards: optional compact cards at the top of Home, all off by default, each its own switch in Settings › Home:
   Continue watching, Next episode, Tonight's game, Party invites. A card with nothing to say is not shown, and with
   nothing to show the strip is gone. No clocks, weather, quotes or stats. */
const HomeWidget = {
  T: 0, last: '',
  has() { return !IS_TV && !!window.MKAndroid && typeof MKAndroid.widgetSync === 'function'; },
  t(s) { try { return typeof I18N !== 'undefined' && I18N.t ? I18N.t(s) : s; } catch (e) { return s; } },
  art(p) { return p.thumb || p.background || p.poster || ''; },
  soon() { if (!this.has()) return; clearTimeout(this.T); this.T = setTimeout(() => this.sync(), 2500); },
  sync() {
    if (!this.has()) return;
    try { if (typeof MKAndroid.widgetOn === 'function' && !MKAndroid.widgetOn()) { this.last = ''; return; } } catch (e) { return; }
    const items = continueItems().filter((p) => p && p.videoId && p.metaId).slice(0, 4).map((p) => ({
      v: p.videoId, id: p.metaId, type: p.type || 'movie', name: p.name || '', sub: this.t(progressSub(p)),
      pct: p.d ? Math.round(Math.min(1, p.t / p.d) * 100) : 0, art: this.art(p),
    }));
    const labels = { title: this.t('Continue watching'), resume: this.t('Resume'), empty: this.t('Nothing in progress'), emptySub: this.t('Start a film or an episode and it waits here.'), open: this.t('Open MKCinema') };
    const json = JSON.stringify({ labels, items }); if (json === this.last) return; this.last = json;
    try { MKAndroid.widgetSync(json); } catch (e) { /* old app */ }
  },
  /* Resume from the widget (or a Home card): only what is in this seat's Continue watching */
  async resume(v) {
    v = String(v || '');
    if (!v || !S.progress[v]) { if (S.view !== 'home') go('home'); toast('That title is no longer in Continue watching', 'info', 3600, 'hw'); return; }
    const cur = P.ctx && (P.ctx.video ? P.ctx.video.id : P.ctx.meta && P.ctx.meta.id);
    if (cur === v && !$('#player').hidden) return; // already playing it
    toast(`Resuming ${S.progress[v].name || ''}…`, 'info', 2400, 'qs');
    await resume(v);
  },
  init() {
    window.MKResumeLink = (v) => { HomeWidget.resume(v); return 1; };
    if (!this.has()) return;
    document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(this.T); this.sync(); } });
    setTimeout(() => this.sync(), 4000);
  },
};

const HomeCards = {
  KINDS: [
    ['cw', 'Continue watching', 'The title you watched last. One tap carries on where you stopped. Pairs well with switching the Continue watching row off.'],
    ['ep', 'Next episode', 'When the next episode of a series you follow comes out (your watchlist and Continue watching).'],
    ['game', 'Tonight’s game', 'The next game on now or in the next 8 hours, from the TV guides of your own TV playlists. Needs a playlist with a guide.'],
    ['party', 'Party invites', 'A watch party a friend invited you to in the last 3 hours, ready to join. Needs Friends.'],
  ],
  cache: {}, gen: 0, partyT: 0,
  on(k) { const c = Layout.get().cards; return Array.isArray(c) && c.includes(k); },
  any() { return this.KINDS.some(([k]) => this.on(k)); },
  set(k, v) { const c = (Layout.get().cards || []).filter((x) => x !== k); if (v) c.push(k); Layout.set({ cards: c }); },
  rows() {
    return this.KINDS.map(([k, label, help]) => ({ key: `hc-${k}`, label, help, type: 'toggle', get: () => this.on(k), set: (v) => this.set(k, v) }));
  },
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  /* Home was redrawn: the strip goes first, each card fills in when its answer arrives */
  mount(rows) {
    if (!rows || !this.any()) return;
    const gen = ++this.gen;
    // a div, not a section: Home's row tools (Peak Cinema's place, row order) only move sections
    const sec = document.createElement('div'); sec.className = 'hwc-strip'; sec.id = 'homeCards'; sec.hidden = true;
    sec.setAttribute('role', 'region'); sec.setAttribute('aria-label', 'At a glance');
    sec.innerHTML = `<div class="hwc-rail">${this.KINDS.map(([k]) => (this.on(k) ? `<div class="hwc-slot" data-hcs="${k}" hidden></div>` : '')).join('')}</div>`;
    rows.prepend(sec);
    if (this.on('cw')) this.fill('cw', this.cwCard());
    const later = () => {
      if (gen !== this.gen) return;
      if (this.on('ep')) this.nextEp().then((c) => { if (gen === this.gen) this.fill('ep', c); }).catch(() => {});
      if (this.on('game')) this.game().then((c) => { if (gen === this.gen) this.fill('game', c); }).catch(() => {});
      if (this.on('party')) this.party().then((c) => { if (gen === this.gen) this.fill('party', c); }).catch(() => {});
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(later, { timeout: 2500 }); else setTimeout(later, 600);
  },
  fill(k, card) {
    const slot = $(`#homeCards [data-hcs="${k}"]`); if (!slot) return;
    if (!card) { slot.hidden = true; slot.innerHTML = ''; } else {
      slot.innerHTML = `<div class="hwc" data-hc="${k}">
        <button class="hwc-main" type="button" data-nav aria-label="${esc(`${card.eyebrow}: ${card.title}`)}">
          <span class="hwc-art">${card.art ? `<img src="${esc(card.art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-gone>` : `<i data-lucide="${card.icon}"></i>`}${card.pct != null ? `<span class="hwc-bar"><i style="transform:scaleX(${Math.max(0.02, card.pct / 100).toFixed(3)})"></i></span>` : ''}</span>
          <span class="hwc-t"><small class="hwc-eye">${esc(card.eyebrow)}</small><b>${esc(card.title)}</b><small>${esc(card.sub || '')}</small></span>
        </button>
        <button class="hwc-act" type="button" data-nav>${card.live ? '<span class="hwc-dot"></span>' : `<i data-lucide="${card.actIcon || 'play'}"></i>`}<span>${esc(card.act)}</span></button>
        ${card.dismiss ? '<button class="ibtn sm hwc-x" type="button" data-nav aria-label="Dismiss"><i data-lucide="x"></i></button>' : ''}
      </div>`;
      slot.hidden = false;
      const go1 = () => { try { card.run(); } catch (e) { console.warn('home card', e); } };
      $('.hwc-main', slot).onclick = go1; $('.hwc-act', slot).onclick = go1;
      const x = $('.hwc-x', slot); if (x) x.onclick = () => { card.dismiss(); this.fill(k, null); };
      icons();
    }
    const sec = $('#homeCards'); if (!sec) return;
    sec.hidden = !$$('.hwc-slot', sec).some((x) => !x.hidden);
    // rows that arrive later (New episodes, household rows, row order) may land above: the strip stays first
    const box = sec.parentNode; if (box && box.firstElementChild !== sec) box.prepend(sec);
  },
  /* ---- Continue watching ---- */
  cwCard() {
    const p = continueItems()[0]; if (!p || !p.videoId) return null;
    return { eyebrow: 'Continue watching', title: p.name || '', sub: progressSub(p), art: p.thumb || p.background || p.poster, pct: p.d ? Math.min(100, p.t / p.d * 100) : 0, act: 'Resume', run: () => HomeWidget.resume(p.videoId) };
  },
  /* ---- Next episode: the soonest unaired episode of a followed series in the next 14 days (checked every 30 min) ---- */
  when(at, dateOnly) {
    const d = new Date(at), now = new Date(), day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(d) - day(now)) / 86400e3);
    const time = dateOnly ? '' : ` ${d.toLocaleTimeString(appLocale(), { hour: 'numeric', minute: '2-digit' })}`;
    if (diff <= 0) return `Today${time}`;
    if (diff === 1) return `Tomorrow${time}`;
    if (diff < 7) return d.toLocaleDateString(appLocale(), { weekday: 'long' }) + time;
    return d.toLocaleDateString(appLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
  },
  async nextEp() {
    const c = this.cache.ep; if (c && Date.now() - c.at < 30 * 60e3) return c.card;
    const shows = (typeof Calendar !== 'undefined' ? Calendar.shows() : []).slice(0, 24), now = Date.now(), to = now + 14 * 86400e3;
    let best = null;
    await Promise.allSettled(shows.map(async (s) => {
      const meta = remember({ ...s, ...((await engine.fetchMeta('series', s.id)) || {}) });
      (meta.videos || []).forEach((v) => {
        const raw = v.released || v.firstAired || '', at = Date.parse(raw);
        if (!(at > now && at <= to) || Number(v.season) === 0) return;
        if (!best || at < best.at) best = { meta, v, at, dateOnly: /T00:00:00(\.000)?Z$/.test(raw) || !/T/.test(raw) };
      });
    }));
    let card = null;
    if (best) {
      const { meta, v, at, dateOnly } = best, vid = videoIdFor(meta, v);
      card = { eyebrow: 'Next episode', title: meta.name || '', sub: `S${v.season} · E${v.episode} · ${this.when(at, dateOnly)}`, art: v.thumbnail || meta.background || meta.poster, act: 'Details', actIcon: 'calendar-days', run: () => openDetail(meta, { videoId: vid }) };
    }
    this.cache.ep = { at: Date.now(), card };
    return card;
  },
  /* ---- Tonight's game: from the TV guides of the person's own playlists (SportsHub keeps it for 4 minutes) ---- */
  async game() {
    if (this.kids() || typeof SportsHub === 'undefined') return null;
    const items = await SportsHub.refresh(), now = Date.now();
    const evs = (items || []).filter((x) => x.ev && x.ev.end > now).sort((a, b) => (a.ev.start <= now ? 0 : 1) - (b.ev.start <= now ? 0 : 1) || a.ev.start - b.ev.start);
    const it = evs[0]; if (!it) return null;
    const live = it.ev.start <= now, hm = (t) => new Date(t).toLocaleTimeString(appLocale(), { hour: 'numeric', minute: '2-digit' });
    return { eyebrow: 'Tonight’s game', title: it.name, sub: [live ? `On now until ${hm(it.ev.end)}` : this.when(it.ev.start), it.ev.ch].filter(Boolean).join(' · '), art: it.logo || '', icon: 'trophy', live, act: live ? 'Watch' : 'Details', actIcon: 'tv', run: () => SportsHub.open(it) };
  },
  /* ---- Party invites: a friend's watch party invite from the last 3 hours that you haven't joined or dismissed ---- */
  seen() { return Store.get('hcPartySeen', []) || []; },
  async party() {
    if (this.kids() || typeof Friends === 'undefined' || !Friends.me || !Friends.loaded) return null;
    const seen = this.seen(), now = Date.now();
    const who = Friends.list.filter((f) => f.state === 'friend' && f.unread).slice(0, 4);
    let best = null;
    await Promise.allSettled(who.map(async (f) => {
      const l = (await Friends.rpc('mkc_chat', { other: f.id, before_id: null })) || [];
      l.forEach((m) => {
        const at = new Date(m.created_at).getTime();
        if (m.sender !== f.id || m.kind !== 'party' || !/^[A-Z2-9]{6}$/.test(m.body) || now - at > 3 * 3600e3 || seen.includes(m.body) || m.body === Party.code) return;
        if (!best || at > best.at) best = { f, code: m.body, at };
      });
    }));
    if (!best) return null;
    const { f, code, at } = best, mark = () => Store.set('hcPartySeen', [code, ...this.seen()].slice(0, 30));
    return { eyebrow: 'Watch party', title: `${Friends.label(f)} invited you`, sub: `${code} · ${Friends.ago(at)}`, art: '', icon: 'popcorn', act: 'Join', actIcon: 'users',
      run: () => { mark(); this.fill('party', null); Party.join(code).then(() => Party.openPanel()); }, dismiss: mark };
  },
  /* a friend's message arrived: an invite card can appear without leaving Home */
  later(k) {
    if (k !== 'party' || !this.on('party') || S.view !== 'home') return;
    clearTimeout(this.partyT); const gen = this.gen;
    this.partyT = setTimeout(() => this.party().then((c) => { if (gen === this.gen) this.fill('party', c); }).catch(() => {}), 1500);
  },
};
HomeWidget.init();
