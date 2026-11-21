
/* 2.86 Alerts: new episodes and reminders sent to your own Discord channel or Telegram chat. The webhook and bot
   token stay on this device (and in your account when Sync keys is on). Nothing goes through MKCinema. */
const Alerts = {
  cfg() { const k = Keys.get(); return { hook: String(k.discordHook || '').trim(), tg: String(k.tgToken || '').trim(), chat: String(k.tgChat || '').trim() }; },
  on() { const c = this.cfg(); return /^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//.test(c.hook) || (/^\d+:[\w-]{20,}$/.test(c.tg) && /^-?\d+$|^@\w+$/.test(c.chat)); },
  send(text) {
    const c = this.cfg(), out = [];
    if (/^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\//.test(c.hook)) {
      const fd = new FormData(); fd.append('payload_json', JSON.stringify({ username: 'MKCinema', content: String(text).slice(0, 1900) }));
      out.push(fetch(c.hook, { method: 'POST', body: fd, mode: 'no-cors' }));
    }
    if (/^\d+:[\w-]{20,}$/.test(c.tg) && c.chat) out.push(fetch(`https://api.telegram.org/bot${encodeURIComponent(c.tg).replace(/%3A/g, ':')}/sendMessage?chat_id=${encodeURIComponent(c.chat)}&text=${encodeURIComponent(String(text).slice(0, 3900))}`, { mode: 'no-cors' }));
    return Promise.allSettled(out).then((r) => r.length && r.every((x) => x.status === 'fulfilled'));
  },
  episodes(list) {
    if (!this.on() || CFG.alertEps === false) return;
    const lines = list.slice(0, 8).map((e) => `• ${e.name} S${e.s} · E${e.e}${e.title ? ` · ${e.title}` : ''}`);
    this.send(`New episode${list.length > 1 ? 's' : ''} to watch\n${lines.join('\n')}${list.length > 8 ? `\n…and ${list.length - 8} more` : ''}`);
  },
  rows() {
    return [{ group: 'Alerts to Discord or Telegram' },
      { key: 'discordHook', label: 'Discord webhook', help: 'In Discord: channel settings › Integrations › Webhooks › New webhook › Copy webhook URL. New episodes and your reminders are posted there.', type: 'secret', placeholder: 'https://discord.com/api/webhooks/…', get: () => Keys.get().discordHook || '', set: (v) => Keys.set('discordHook', String(v || '').trim()) },
      { key: 'tgToken', label: 'Telegram bot token', help: 'Message @BotFather in Telegram, send /newbot and paste the token here. Then send your bot any message.', type: 'secret', placeholder: '123456:ABC…', get: () => Keys.get().tgToken || '', set: (v) => Keys.set('tgToken', String(v || '').trim()) },
      { key: 'tgChat', label: 'Telegram chat ID', help: 'Your own chat ID (message @userinfobot to see it) or a channel such as @mychannel where your bot can post.', type: 'text', get: () => Keys.get().tgChat || '', set: (v) => Keys.set('tgChat', String(v || '').trim()) },
      { key: 'alertEps', label: 'Send new episodes', type: 'toggle', get: () => CFG.alertEps !== false, set: (v) => setCfg('alertEps', v) },
      { key: 'alertTest', label: 'Test', help: 'Sends a short message to check it arrives.', type: 'button', text: 'Send a test', icon: 'send', run: async () => { if (!this.on()) { toast('Add a Discord webhook, or a Telegram bot token and chat ID, first', 'err', 4200); return; } await this.send('MKCinema alerts are working.'); toast('Sent. Check Discord or Telegram.', 'ok', 3600); } }];
  },
};
{ const dv = typeof secById === 'function' && secById('devices'); if (dv) { const rows = dv.rows; dv.rows = () => [...rows(), ...Alerts.rows()]; } }

/* 2.86 Reminders: Remind me on anything that has not aired yet. Checked every minute while MKCinema is open;
   a reminder that came due while it was closed shows the next time it opens. */
const Remind = {
  all() { const o = Store.get('reminders', {}) || {}; return typeof o === 'object' ? o : {}; },
  has(k) { return !!this.all()[k]; },
  btn(k, name, sub, at) { const on = this.has(k); return `<button class="btn btn-ghost btn-sm mk-remind${on ? ' on' : ''}" type="button" data-nav data-remind="${esc(k)}" data-rn="${esc(name)}" data-rs="${esc(sub || '')}" data-ra="${Number(at) || 0}" aria-pressed="${on}"><i data-lucide="${on ? 'bell-ring' : 'bell'}"></i>${on ? 'Reminder set' : 'Remind me'}</button>`; },
  wire(root) { $$('[data-remind]', root).forEach((b) => { b.onclick = () => this.toggle(b); }); },
  toggle(b) {
    const o = this.all(), k = b.dataset.remind;
    if (o[k]) delete o[k]; else o[k] = { name: b.dataset.rn, sub: b.dataset.rs, at: Number(b.dataset.ra) || 0 };
    Store.set('reminders', o);
    const on = !!o[k]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.innerHTML = `<i data-lucide="${on ? 'bell-ring' : 'bell'}"></i>${on ? 'Reminder set' : 'Remind me'}`; icons();
    toast(on ? `We'll remind you when ${b.dataset.rn} is out` : 'Reminder removed', on ? 'ok' : 'info', 2600);
  },
  check() {
    const o = this.all(), now = Date.now(), due = Object.entries(o).filter(([, r]) => r && r.at && r.at <= now);
    if (!due.length) return;
    due.forEach(([k]) => delete o[k]); Store.set('reminders', o);
    const t = due.map(([, r]) => `${r.name}${r.sub ? ` ${r.sub}` : ''}`);
    toast(`Out now: ${t.slice(0, 2).join(', ')}${t.length > 2 ? ` and ${t.length - 2} more` : ''}`, 'info', 7000);
    if (typeof Alerts !== 'undefined' && Alerts.on()) Alerts.send(`Out now\n${t.map((x) => `• ${x}`).join('\n')}`);
  },
  /* at the end of the newest episode: when the next one airs, with Remind me */
  nextAirs() {
    const box = $('#upNext'); if (!P.ctx || !P.ctx.video || !box || !box.hidden || P.nextAirsShown === P.ctx.video.id) return;
    const cur = Number(P.ctx.video.season) * 1000 + Number(P.ctx.video.episode), now = Date.now();
    const nv = (P.ctx.meta.videos || []).map((v) => ({ v, at: Date.parse(v.released || v.firstAired || ''), k: Number(v.season) * 1000 + Number(v.episode) }))
      .filter((x) => x.at > now && x.k > cur && Number(x.v.season) > 0).sort((a, b) => a.k - b.k)[0];
    if (!nv) return;
    P.nextAirsShown = P.ctx.video.id;
    const when = new Date(nv.at).toLocaleDateString(appLocale(), { weekday: 'long', month: 'long', day: 'numeric' });
    box.hidden = false; box.classList.remove('countdown');
    box.innerHTML = `<div style="min-width:0"><small>Next episode · S${esc(nv.v.season)} E${esc(nv.v.episode)}</small><b>Airs ${esc(when)}</b>
      <div class="actions">${this.btn(videoIdFor(P.ctx.meta, nv.v), P.ctx.meta.name, `S${nv.v.season} · E${nv.v.episode}`, nv.at)}<button class="btn btn-ghost btn-sm" type="button" id="naHide" data-nav>Hide</button></div></div>`;
    icons(); this.wire(box); $('#naHide').onclick = () => { box.hidden = true; };
  },
};
setTimeout(() => Remind.check(), 15000); setInterval(() => Remind.check(), 60000);

/* 2.86 New labels on the Home banner: New film, New series, New season, New episodes */
const NewTag = {
  label(m, full) {
    const now = Date.now(), d = (t) => (now - t) / 864e5, rel = Date.parse((m && m.released) || '');
    if (m.type === 'movie') return rel && d(rel) >= 0 && d(rel) <= 60 ? 'New film' : '';
    const vs = ((full || m).videos || []).filter((v) => Number(v.season) > 0).map((v) => ({ s: Number(v.season), e: Number(v.episode), at: Date.parse(v.released || v.firstAired || '') })).filter((v) => v.at && v.at <= now);
    if (!vs.length) return rel && d(rel) <= 60 ? 'New series' : '';
    const last = vs.sort((a, b) => b.at - a.at)[0], first = vs.reduce((a, b) => (a.at < b.at ? a : b));
    if (d(first.at) <= 60) return 'New series';
    const s1 = vs.filter((v) => v.s === last.s).reduce((a, b) => (a.at < b.at ? a : b));
    if (d(s1.at) <= 45) return 'New season';
    if (d(last.at) <= 14) return 'New episodes';
    return '';
  },
  hero() {
    const m = S.hero && S.hero[S.heroIdx]; if (!m) return;
    const put = (t) => { const e = $('#heroEyebrow'); if (!e || S.hero[S.heroIdx] !== m) return; e.innerHTML = t ? `<i data-lucide="sparkles"></i>${esc(t)}` : '<i data-lucide="flame"></i>Featured'; icons(); };
    const t0 = this.label(m, S.metas.get(m.id)); if (t0 || m.type !== 'series') { put(t0); return; }
    engine.fetchMeta('series', m.id).then((full) => { if (full) put(this.label(m, full)); }).catch(() => {});
  },
};

/* 2.86 Cinema mode: a trailer for a new film before your film starts, like at the cinema. Off by default.
   Only before a film started from the beginning; Back or the close button skips it and your film starts. */
const CinemaMode = {
  pool: null, played: new Set(),
  async pick(skipId) {
    if (!this.pool) {
      const j = await Promise.race([MetaBackup.relay('trending', { kind: 'movie', page: '1' }), new Promise((r) => setTimeout(() => r(null), 3500))]).catch(() => null);
      this.pool = ((j && j.results) || []).map((x) => Recs.fromTmdb(x)).filter((m) => m && m.id && /^tt\d+$/.test(m.id));
    }
    const list = X8.seeded(this.pool.filter((m) => m.id !== skipId && !this.played.has(m.id) && !isWatched(m.id)), `${Date.now()}`);
    for (const m of list.slice(0, 4)) {
      const full = await Promise.race([engine.fetchMeta('movie', m.id), new Promise((r) => setTimeout(() => r(null), 2500))]).catch(() => null);
      const t = full && (((full.trailerStreams || [])[0] || {}).ytId || ((full.trailers || [])[0] || {}).source);
      if (t) { this.played.add(m.id); return { id: t, name: full.name }; }
    }
    return null;
  },
  async hold(ctx, stream, startAt) {
    if (!CFG.cinemaMode || !ctx || !ctx.meta || ctx.meta.type !== 'movie' || ctx.video || (startAt || 0) > 30 || !stream || stream.ytId) return false;
    if ((typeof Seats !== 'undefined' && Seats.kids()) || (typeof Party !== 'undefined' && Party.code) || CFG.trailerMode === 'link') return false;
    let t = null; try { t = await this.pick(ctx.meta.id); } catch (e) { t = null; }
    if (!t) return false;
    TR.after = () => playStream(ctx, stream, { startAt, _cin: 1 });
    toast(`A trailer before ${ctx.meta.name}: ${t.name}. Press Back to skip it.`, 'info', 5000);
    openTrailer(t.id);
    return true;
  },
};
{ const pb = typeof secById === 'function' && secById('playback'); if (pb) { const rows = pb.rows; pb.rows = () => [...rows(), { key: 'cinemaMode', label: 'Cinema mode', help: 'Plays the official trailer of a new film before your film starts, like at the cinema. Back skips it.', type: 'toggle', get: () => !!CFG.cinemaMode, set: (v) => setCfg('cinemaMode', v) }]; } }
{ const hm = typeof secById === 'function' && secById('home'); if (hm) { const rows = hm.rows; hm.rows = () => { const r = rows(); const i = r.findIndex((x) => x.key === 'saverAfter'); const row = { key: 'saverSleep', label: 'Let the TV sleep', help: 'After the screensaver has run this long, MKCinema steps aside (on TVs it closes, keeping your place) so the TV can go to sleep on its own.', type: 'select', num: true, options: [[0, 'Never'], [15, 'After 15 minutes'], [30, 'After 30 minutes'], [60, 'After 1 hour'], [120, 'After 2 hours']], get: () => Number(Store.get('saverSleep', 0)) || 0, set: (v) => Store.set('saverSleep', Number(v) || 0) }; if (i >= 0) r.splice(i + 1, 0, row); return r; }; } }

/* 2.86 Swipe to choose: one person's deck of titles from your lists, picks and what is trending. Right adds to
   the watchlist, left skips it for good, Up or Play starts it. */
const Swipe = {
  deck: [], i: 0,
  async build() {
    let l = []; try { l = await Couch.build(); } catch (e) { l = []; }
    if (l.length < 20) {
      try {
        const tr = await DiscoverPage.ask('discover', { kind: 'movie', sort: 'top', yf: String(new Date().getFullYear() - 3), n: '20' });
        const seen = new Set(l.map((x) => x.id)); tr.forEach((m) => { if (!seen.has(m.id) && !isWatched(m.id) && (!Seats.kids() || Seats.kidSafe(m))) l.push({ id: m.id, type: m.type, name: m.name, poster: metaPoster(m) || '', year: yearOf(m) || '', g: genresOf(m).slice(0, 2).join(' · '), r: m.imdbRating || '' }); });
      } catch (e) { /* lists only */ }
    }
    const no = new Set(Store.get('swipeNo', []) || []);
    return l.filter((m) => !no.has(m.id) && !inWatchlist(m.id)).slice(0, 40);
  },
  async open() {
    const el = X8.layer('swipe', { label: 'Swipe to choose', icon: 'layers', eyebrow: 'Swipe to choose' }); el.classList.add('sw-ov');
    X8.body('swipe').innerHTML = '<div class="status-line"><span class="spin"></span>Picking titles for you…</div>';
    X8.open('swipe');
    this.deck = await this.build(); this.i = 0; this.paint();
  },
  paint() {
    const b = X8.body('swipe'); if (!b) return;
    const m = this.deck[this.i];
    if (!m) { b.innerHTML = '<p class="sc-p">That’s everything for now. Titles you liked are in your watchlist.</p><div class="actions"><button class="btn btn-prime" type="button" data-nav id="swLib"><i data-lucide="bookmark"></i>Open my watchlist</button></div>'; icons(); $('#swLib').onclick = () => { X8.close('swipe'); go('library'); }; return; }
    b.innerHTML = `<div class="sw-card" id="swCard"><div class="sw-poster" style="background-image:url('${esc(String(m.poster || '').replace(/'/g, '%27').replace(/\\/g, '%5C'))}')"></div>
      <div class="sw-info"><b translate="no">${esc(m.name)}</b><small>${[m.year, m.g, m.r ? `IMDb ${m.r}` : ''].filter(Boolean).map(esc).join(' · ')}</small></div></div>
      <div class="sw-acts"><button class="ibtn sw-no" type="button" data-nav data-sw="no" aria-label="Not for me"><i data-lucide="x"></i></button><button class="btn btn-ghost" type="button" data-nav data-sw="info"><i data-lucide="info"></i>Details</button><button class="btn btn-ghost" type="button" data-nav data-sw="play"><i data-lucide="play"></i>Play</button><button class="ibtn sw-yes" type="button" data-nav data-sw="yes" aria-label="Add to watchlist"><i data-lucide="heart"></i></button></div>
      <p class="tour-note">${this.i + 1} of ${this.deck.length} · ${TOUCH_UI ? 'Swipe right to save, left to skip' : '→ save · ← skip'}</p>`;
    icons();
    $$('[data-sw]', b).forEach((x) => x.addEventListener('click', () => this.act(x.dataset.sw)));
    const card = $('#swCard'); let x0 = null;
    card.addEventListener('pointerdown', (e) => { x0 = e.clientX; card.setPointerCapture(e.pointerId); });
    card.addEventListener('pointermove', (e) => { if (x0 == null) return; const dx = e.clientX - x0; card.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`; });
    const up = (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; card.style.transform = ''; if (Math.abs(dx) > 90) this.act(dx > 0 ? 'yes' : 'no'); };
    card.addEventListener('pointerup', up); card.addEventListener('pointercancel', () => { x0 = null; card.style.transform = ''; });
    if (IS_TV) setTimeout(() => Nav.focus($('[data-sw="yes"]', b), true), 40);
  },
  act(a) {
    const m = this.deck[this.i]; if (!m) return;
    const meta = () => remember(S.metas.get(m.id) || { id: m.id, type: m.type, name: m.name, poster: m.poster });
    if (a === 'info') { X8.close('swipe'); openDetail(meta()); return; }
    if (a === 'play') { X8.close('swipe'); quickPlay(meta()); return; }
    const card = $('#swCard'); if (card) card.classList.add(a === 'yes' ? 'out-r' : 'out-l');
    if (a === 'yes' && !inWatchlist(m.id)) toggleWatchlist(meta());
    if (a === 'no') Store.set('swipeNo', [m.id, ...(Store.get('swipeNo', []) || [])].slice(0, 400));
    this.i++; setTimeout(() => this.paint(), card ? 180 : 0);
  },
  key(e) { if ($('#swipe') && !$('#swipe').hidden && !IS_TV) { if (e.key === 'ArrowRight') { e.preventDefault(); this.act('yes'); } else if (e.key === 'ArrowLeft') { e.preventDefault(); this.act('no'); } } },
};
addEventListener('keydown', (e) => Swipe.key(e), true);
COMMANDS.push({ label: 'Swipe to choose what to watch', icon: 'layers', run: () => Swipe.open() });

/* 2.86 Critics' Pick on Discover: one acclaimed title a day, plus the Swipe to choose button */
const CriticsPick = {
  async place() {
    const rows = $('#dxRows'); if (!rows || $('#dxPick')) return;
    const kind = DiscoverPage.kind(), y = new Date().getFullYear();
    let list = []; try { list = await DiscoverPage.ask('discover', { kind: kind === 'series' ? 'tv' : 'movie', sort: 'top', yf: String(y - 6), n: '20' }); } catch (e) { return; }
    list = list.filter((m) => m && m.id && m.description && !isWatched(m.id) && (!DiscoverPage.kids() || Seats.kidSafe(m)));
    const m = X8.seeded(list, `cp${X8.dayKey()}`)[0]; if (!m || !$('#dxRows') || $('#dxPick')) return;
    const box = document.createElement('section'); box.className = 'dx-pick'; box.id = 'dxPick';
    box.innerHTML = `<div class="dxp-poster" style="background-image:url('${esc(String(metaPoster(m) || '').replace(/'/g, '%27'))}')"></div><div class="dxp-body"><span class="eyebrow"><i data-lucide="award"></i>Critics’ Pick · today</span><h3 translate="no">${esc(m.name)}</h3><small>${[yearOf(m), genresOf(m).slice(0, 2).join(', '), m.imdbRating ? `IMDb ${m.imdbRating}` : ''].filter(Boolean).map(esc).join(' · ')}</small><p>${esc(String(m.description).slice(0, 260))}${String(m.description).length > 260 ? '…' : ''}</p>
      <div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="dxpOpen"><i data-lucide="info"></i>Details</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="dxpAwards"><i data-lucide="trophy"></i>Award winners</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="dxpSwipe"><i data-lucide="layers"></i>Swipe to choose</button></div></div>`;
    rows.before(box); icons();
    $('#dxpOpen').onclick = () => openDetail(remember(m)); $('#dxpSwipe').onclick = () => Swipe.open(); { const aw = $('#dxpAwards'); if (aw) aw.onclick = () => window.MkAwards && MkAwards.open(); }
  },
};
