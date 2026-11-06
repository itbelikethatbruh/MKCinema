
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
      return `<div class="dl-row" data-pc="${esc(r.id)}"><div class="dl-art"><i data-lucide="monitor"></i>${art ? `<img src="${esc(art)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>
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
      Offline.setup = () => ({ platform: 'tv-pc', native: true, here: 'this TV', start: async () => { throw new Error('this TV app can’t download. Update it to 1.8.0'); }, list: async () => [], remove: async () => false, play: async () => false });
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
