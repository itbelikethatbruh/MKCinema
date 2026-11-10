
/* ---------------- 2.33.0 Downloads on TVs, a USB drive, and Slow internet mode ----------------
   TV app 1.8.0 downloads films and episodes like the phone app does, to the TV itself or to a USB drive plugged into it
   (a Fire TV Stick has about 5 GB free, so the download list says what fits). Phones with an SD card get the same
   choice. Older TV apps don't have it, so nothing changes there. Slow internet mode (Settings › Playback) puts smaller
   files first, makes the player load further ahead before it starts and after a stall, and asks the TV player to keep
   minutes of the film ready instead of seconds. */
const DlSpace = {
  vol: -1, size: 0,
  can() { try { return !!(window.MKAndroid && typeof MKAndroid.dlSpace === 'function'); } catch (e) { return false; } },
  list() { try { return JSON.parse(MKAndroid.dlSpace() || '[]').filter((v) => v && v.free >= 0); } catch (e) { return []; } },
  name(v) { return v.removable ? (IS_TV ? 'USB drive' : 'SD card') : IS_TV ? 'this TV' : 'this phone'; },
  pick(list) {
    const saved = Number(CFG.dlVol);
    if (list.some((v) => v.vol === saved) && this.vol < 0) this.vol = saved;
    if (!list.some((v) => v.vol === this.vol)) this.vol = (list.slice().sort((a, b) => b.free - a.free)[0] || { vol: 0 }).vol;
    return list.find((v) => v.vol === this.vol) || list[0];
  },
  fits(bytes, v) { return !bytes || !v || bytes + 268435456 <= v.free; },
  badge(bytes, v) {
    if (!v) return '';
    if (!bytes) return '<em class="dlx-fit q">Size not listed</em>';
    return this.fits(bytes, v) ? `<em class="dlx-fit ok">Fits · leaves ${fmtBytes(v.free - bytes)}</em>` : `<em class="dlx-fit no">Too big for ${esc(this.name(v))}</em>`;
  },
  // the room on each drive and the fit of each version, at the top of the Download list
  decorate(pop) {
    const list = this.list(); if (!list.length) return;
    const draw = () => {
      const cur = this.pick(list);
      let w = $('.dlx-where', pop);
      if (!w) { w = document.createElement('div'); w.className = 'dlx-where'; const h = $('.dl-pop-h', pop); (h || pop.firstChild) ? (h || pop.firstChild).after(w) : pop.prepend(w); }
      w.innerHTML = list.length > 1
        ? `<small>Save to</small><div class="dlx-vols">${list.map((v) => `<button type="button" class="chip${v.vol === cur.vol ? ' on' : ''}" data-nav data-dlvol="${v.vol}"><i data-lucide="${v.removable ? 'save' : IS_TV ? 'tv' : 'smartphone'}"></i>${esc(this.name(v).replace(/^this /, 'This '))} <span class="tnum">${fmtBytes(v.free)} free</span></button>`).join('')}</div>`
        : `<small><i data-lucide="${IS_TV ? 'tv' : 'smartphone'}"></i>${fmtBytes(cur.free)} free on ${esc(this.name(cur))}${IS_TV ? '. Plug in a USB drive for more room.' : ''}</small>`;
      $$('[data-dlsrc]', pop).forEach((b) => {
        const s = D.streams[Number(b.dataset.dlsrc)], bytes = (s && s._tel && s._tel.sizeBytes) || 0;
        let e = $('.dlx-fit', b); if (e) e.remove();
        const span = $('span', b); if (span) span.insertAdjacentHTML('beforeend', this.badge(bytes, cur));
        b.classList.toggle('dlx-no', !this.fits(bytes, cur));
      });
      const h = $('.dl-pop-h', pop); if (h) h.textContent = h.textContent.replace(/^Download to .*?(?=( · S\d|$))/, `Download to ${this.name(cur)}`);
      $$('[data-dlvol]', w).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.vol = Number(b.dataset.dlvol); setCfg('dlVol', this.vol); draw(); const f = $(`[data-dlvol="${this.vol}"]`, pop); if (f && IS_TV) f.focus({ preventScroll: true }); }));
      icons();
    };
    draw();
  },
  init() {
    // TV app 1.8.0: the downloads module skipped TVs at start-up; set it up now
    if (IS_TV && !Offline.api && this.can() && typeof MKAndroid.dlStart === 'function') {
      const st = Offline.setup;
      Offline.setup = function () {
        const a = window.MKAndroid;
        return { platform: 'tv', native: true, here: 'this TV',
          start: async (o) => { const r = a.dlStart(JSON.stringify(o)); if (!r || /^error/i.test(r)) throw new Error(String(r || 'the download did not start').replace(/^error:\s*/i, '')); return r; },
          list: async () => { try { return JSON.parse(a.dlList() || '[]'); } catch (e) { return []; } },
          remove: async (id) => a.dlRemove(String(id)),
          play: async (r, startMs) => a.dlPlay(String(r.id), Math.round(startMs || 0)) };
      };
      Offline.init();
      Offline.setup = st;
    }
    if (!Offline.api || !this.can()) return;
    // every download says where it goes and how big it is; the TV checks the room before asking the debrid service
    const start = Offline.api.start;
    Offline.api.start = (o) => start(Object.assign(o, { vol: Math.max(0, this.vol), size: this.size || 0 }, IS_TV ? { wifiOnly: false } : {}));
    const get = Offline.get.bind(Offline);
    Offline.get = async (ctx, s) => {
      const list = this.list(), cur = list.length ? this.pick(list) : null, bytes = (s && s._tel && s._tel.sizeBytes) || 0;
      if (cur && !this.fits(bytes, cur)) {
        const more = list.find((v) => v.vol !== cur.vol && this.fits(bytes, v));
        toast(`It needs ${fmtBytes(bytes)} and ${fmtBytes(cur.free)} is free on ${this.name(cur)}. ${more ? `Pick ${this.name(more)} at the top of the list` : `Pick a smaller version${IS_TV && list.length < 2 ? ' or plug in a USB drive' : ''}`}.`, 'err', 8000, 'dl');
        return;
      }
      this.size = bytes;
      try { return await get(ctx, s); } finally { this.size = 0; }
    };
    const menu = Offline.menu.bind(Offline);
    Offline.menu = async (btn) => { await menu(btn); const pop = $('#dlPop'); if (pop) this.decorate(pop); };
    const label = Offline.label.bind(Offline);
    Offline.label = (r) => [label(r), r.vol > 0 ? (IS_TV ? 'USB drive' : 'SD card') : ''].filter(Boolean).join(' · ');
  },
};
DlSpace.init();

const SlowNet = {
  on() { return CFG.srSlow === true; },
  holding: false, stalls: [], told: false,
  ahead() { try { const b = video.buffered, t = video.currentTime; for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.5 && b.end(i) > t) return b.end(i) - t; } catch (e) { /* none */ } return 0; },
  pill(text) {
    let p = $('#slowPill');
    if (!text) { if (p) p.hidden = true; return; }
    if (!p) { p = document.createElement('div'); p.id = 'slowPill'; p.className = 'slow-pill'; p.setAttribute('role', 'status'); $('#player').appendChild(p); }
    p.hidden = false; p.textContent = text;
  },
  // pause until `need` seconds are loaded ahead, or loading stops growing, or 45 s pass
  hold(need) {
    if (this.holding || $('#player').hidden || video.paused || !isFinite(pDur()) || pDur() - pNow() < need + 5) return;
    this.holding = true; const t0 = Date.now(); let last = -1, still = Date.now();
    video.pause();
    const tick = () => {
      if (!this.holding) return;
      const a = this.ahead();
      if (a > last + 0.5) { last = a; still = Date.now(); }
      this.pill(`Slow connection: loading ahead · ${Math.min(need, Math.floor(a))} of ${need} s ready`);
      if (a >= need || Date.now() - still > 6000 || Date.now() - t0 > 45000 || $('#player').hidden) { this.release(true); return; }
      this.t = setTimeout(tick, 500);
    };
    tick();
  },
  release(play) { if (!this.holding) return; this.holding = false; clearTimeout(this.t); this.pill(''); if (play && !$('#player').hidden) video.play().catch(() => {}); },
  push() { try { if (window.MKAndroid && typeof MKAndroid.setSlow === 'function') MKAndroid.setSlow(this.on()); } catch (e) { /* older app */ } },
  init() {
    // smaller files first: about 10 points per GB (an episode counts four times), 4K far down, 720p up
    const parse = Telemetry.parse.bind(Telemetry);
    Telemetry.parse = function (s) {
      const t = parse(s);
      if (SlowNet.on() && t && !t.isTrailer && t.kind !== 'yt') {
        let ep = false; try { ep = SourceRules.isEpisode(); } catch (e) { /* none */ }
        const gb = (t.sizeBytes || 0) / 1073741824 * (ep ? 4 : 1);
        t.score += (t.sizeBytes ? -Math.min(160, gb * 10) : -25) + ({ '4K UHD': -80, '1440p': -30, '720p': 25, SD: 10 }[t.res] || 0);
      }
      return t;
    };
    // the player: load further ahead at the start and after each stall
    let first = false, waitT = 0;
    const ps = playStream;
    playStream = function () { first = true; SlowNet.release(false); return ps.apply(this, arguments); };
    video.addEventListener('playing', () => {
      if (P.hls && SlowNet.on()) try { Object.assign(P.hls.config, { maxBufferLength: 180, maxMaxBufferLength: 600, maxBufferSize: 200 * 1024 * 1024 }); } catch (e) { /* older hls.js */ }
      if (first && SlowNet.on() && !P.hls && SlowNet.ahead() < 15) { first = false; SlowNet.hold(20); return; }
      first = false;
    });
    video.addEventListener('waiting', () => {
      clearTimeout(waitT);
      if (SlowNet.holding || $('#player').hidden) return;
      waitT = setTimeout(() => {
        if (video.paused || video.readyState >= 3 || $('#player').hidden) return;
        if (SlowNet.on()) { if (!P.hls) SlowNet.hold(30); return; }
        // without the mode: after three long stalls in ten minutes, say once where it is
        const now = Date.now(); SlowNet.stalls = SlowNet.stalls.filter((x) => now - x < 600000); SlowNet.stalls.push(now);
        if (SlowNet.stalls.length >= 3 && !SlowNet.told) { SlowNet.told = true; toast('Keeps stopping? Turn on Slow internet mode in Settings › Playback.', 'info', 8000, 'slow'); }
      }, 3000);
    });
    video.addEventListener('play', () => { if (SlowNet.holding) SlowNet.release(false); });
    const cp = closePlayer;
    closePlayer = function () { SlowNet.release(false); return cp.apply(this, arguments); };
    const sc = setCfg;
    setCfg = function (k) { const r = sc.apply(this, arguments); if (k === 'srSlow') SlowNet.push(); return r; };
    const sec = SECTIONS.find((x) => x.id === 'playback');
    if (sec) {
      const rows = sec.rows;
      sec.rows = () => { const r = rows(); r.splice(0, 0, { key: 'srSlow', label: 'Slow internet mode', help: 'For slow connections: smaller versions of films come first, and the player loads further ahead before it starts and after it stops, so it stops less often.' + (window.MKAndroid && typeof MKAndroid.setSlow === 'function' ? ' The TV player keeps minutes of the film ready instead of seconds.' : '') + ' On a very slow connection, download the film first.', type: 'toggle', get: () => CFG.srSlow === true, set: (v) => setCfg('srSlow', v) }); return r; };
    }
    setTimeout(() => this.push(), 1500);
  },
};
SlowNet.init();

/* ---------------- 2.33.0 Play your computer's downloads on your TV ----------------
   The Windows app 1.4.0 can share its finished downloads on the home network (Library › Downloads › Share with my TV).
   The films stay on the computer: it serves them on its home network address with a secret key, and only the list
   (titles, sizes and that address) goes to your account, so MKCinema on your TV, signed in to the same account, lists
   them under "On <computer>" in Library › Downloads and plays them from the computer. Keep MKCinema open on the
   computer while you watch. Works with every TV app version (the TV player plays the address directly). */
const PcShare = {
  info: null, sig: '', on: false,
  desk() { return !!(window.MKDesktop && MKDesktop.dl && typeof MKDesktop.dl.share === 'function' && Offline.api); },
  tvOn() { const s = CFG.pcShare; return IS_TV && !!(s && s.on && s.base && Array.isArray(s.list) && s.list.length); },
  async enable(on, quiet) {
    if (on && !Account.user) { if (!quiet) toast('Sign in with the same account on this computer and on your TV first', 'err', 7000, 'pcs'); return; }
    let r = null;
    try { r = await MKDesktop.dl.share(on); } catch (e) { if (!quiet) toast(`Sharing with your TV: ${e.message || e}`, 'err', 8000, 'pcs'); r = { on: false }; }
    this.on = !!(r && r.on); this.info = r; Store.set('pcShareOn', this.on);
    this.publish(true);
    if (on && this.on && !quiet) toast('Your TV can play these now. If Windows asks, allow MKCinema on private networks.', 'ok', 9000, 'pcs');
    Offline.sig = ''; Offline.paint();
  },
  publish(force) {
    const val = this.on && this.info && this.info.base
      ? { on: true, name: String(this.info.name || 'your computer').slice(0, 40), base: this.info.base, list: Offline.recs.filter((r) => r.state === 'done').slice(0, 150).map((r) => ({ id: String(r.id), file: r.file || '', size: r.size || 0, meta: r.meta || {} })) }
      : { on: false };
    const sig = JSON.stringify(val);
    if (!force && sig === this.sig) return;
    this.sig = sig;
    setCfg('pcShare', { ...val, at: Date.now() });
  },
  deskCard(box) {
    if ($('#pcsCard', box)) return;
    const name = (this.info && this.info.name) || 'this computer';
    box.insertAdjacentHTML('beforeend', `<div class="pcs-card" id="pcsCard"><i data-lucide="tv"></i><div><b>${this.on ? 'Sharing with your TV' : 'Play these on your TV'}</b><small>${this.on
      ? `MKCinema on your TV lists them in Library › Downloads under “On ${esc(name)}”. Keep MKCinema open here while you watch, on the same Wi-Fi.`
      : 'Your TV plays them straight from this computer over your home Wi-Fi. The films stay here; only the list goes to your account.'}</small></div><button class="btn ${this.on ? 'btn-ghost' : 'btn-prime'} btn-sm" type="button" data-nav id="pcsBtn">${this.on ? 'Stop sharing' : 'Share with my TV'}</button></div>`);
    icons();
    $('#pcsBtn', box).onclick = () => this.enable(!this.on);
  },
  tvRows(box) {
    if ($('#pcsList', box) || !this.tvOn()) return;
    const s = CFG.pcShare;
    const rows = s.list.map((r) => { const m = r.meta || {}, art = m.thumb || m.background || m.poster;
      return `<div class="dl-row" data-pc="${esc(r.id)}"><div class="dl-art"><i data-lucide="monitor"></i>${art ? `<img src="${esc(art)}" alt="" loading="lazy" data-gone>` : ''}</div>
        <div class="dl-main"><b>${esc(m.name || r.file || 'Film')}</b><small>${esc([Offline.label({ meta: m }), m.res, r.size > 0 ? fmtBytes(r.size) : ''].filter(Boolean).join(' · '))}</small></div>
        <div class="dl-act"><button class="btn btn-prime btn-sm" type="button" data-nav data-pcplay="${esc(r.id)}"><i data-lucide="play"></i>Play</button></div></div>`; }).join('');
    box.insertAdjacentHTML('beforeend', `<div id="pcsList"><div class="pcs-h"><i data-lucide="monitor"></i>On ${esc(s.name)}<small>Plays from your computer. MKCinema needs to be open on it.</small></div>${rows}</div>`);
    icons();
    $$('[data-pcplay]', box).forEach((b) => b.addEventListener('click', () => this.play(b.dataset.pcplay)));
  },
  play(id) {
    const s = CFG.pcShare, r = s && (s.list || []).find((x) => String(x.id) === String(id)); if (!r) return;
    const ctx = Offline.ctxOf(r), p = S.progress[(r.meta || {}).key];
    const startAt = p && p.t > 20 && p.d && p.t < p.d * 0.95 ? p.t : 0;
    P.force = true;
    playStream(ctx, { url: `${s.base}/f/${encodeURIComponent(r.id)}`, name: `On ${s.name}`, title: `${(r.meta || {}).name || ''}\n${fmtBytes(r.size || 0)}`, _addon: `On ${s.name}`, _pc: true, behaviorHints: { filename: r.file || '' } }, { startAt });
  },
  init() {
    // TV apps older than 1.8.0 don't download, but they can still play the computer's films: give them the Downloads tab
    if (IS_TV && !Offline.api && this.tvOn() && window.MKAndroid && typeof MKAndroid.play === 'function') {
      const st = Offline.setup;
      Offline.setup = () => ({ platform: 'tv-pc', native: true, here: 'this TV', start: async () => { throw new Error('this TV app can’t download yet'); }, list: async () => [], remove: async () => false, play: async () => false });
      Offline.init(); Offline.setup = st;
      document.documentElement.classList.add('dl-pc-only');
    }
    if (!Offline.api) return;
    const paint = Offline.paint.bind(Offline);
    Offline.paint = () => {
      paint();
      const box = $('#dlList');
      if (this.desk()) { if (this.on) this.publish(); if (box) this.deskCard(box); }
      if (box && IS_TV) this.tvRows(box);
    };
    if (this.desk() && Store.get('pcShareOn', false)) setTimeout(() => this.enable(true, true), 2500); // the address can change between starts
    // the computer's film failed to open in the TV player: say why it may be
    const nd = window.MKNative && window.MKNative.done;
    if (nd && IS_TV) window.MKNative.done = function (pos, dur, ended, next, err) {
      const c = TvPlayer.cur;
      if (c && c.stream && c.stream._pc && err && !(pos > 0)) { TvPlayer.cur = null; toast(`Couldn’t reach ${CFG.pcShare ? CFG.pcShare.name : 'your computer'}. Check that it’s on, MKCinema is open there, and both are on the same Wi-Fi.`, 'err', 9000, 'pcs'); return; }
      return nd.apply(this, arguments);
    };
  },
};
PcShare.init();
