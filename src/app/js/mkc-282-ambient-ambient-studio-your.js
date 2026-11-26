
/* 2.82 Ambient Studio: your own Ambient Mode. Your photos (from this phone or computer, or sent to the TV from a phone),
   your motion, atmosphere, colour, grain and clock, tried full screen on any device before you save.
   Photos live only on the device that holds them (IndexedDB mkc-ambient). Only the recipe (CFG.ambient) syncs.
   The MKCinema mark always stays in the corner of Ambient Mode: nothing here can take it off. */
const AmbStudio = {
  ID: 'ambStudio', MAX: 60, CODE: /^[A-HJ-NP-Z2-9]{6}$/,
  DEF: { v: 1, src: 'films', motion: 'auto', secs: 15, fx: 'auto', tone: 'natural', grain: false, clock: true },
  SRC: [['films', 'Films'], ['mine', 'My photos'], ['both', 'Both']],
  MOTION: [['auto', 'Automatic'], ['drift', 'Slow drift'], ['depth', '3D depth'], ['still', 'Still']],
  SECS: [[8, '8 seconds'], [15, '15 seconds'], [30, '30 seconds'], [60, '1 minute']],
  FX() { return [['auto', 'Automatic'], ['none', 'None'], ['dust', 'Projector dust'], ['fog', 'Fog'], ['embers', 'Embers'], ...(Eggs.has('rosebud') || this.draftHas('fx', 'snow') ? [['snow', 'Snow globe']] : [])]; },
  TONE() { return [['natural', 'Natural'], ['bw', 'Black and white'], ['warm', 'Warm'], ['cool', 'Cool'], ...(Eggs.has('booth') || this.draftHas('tone', 'silver') ? [['silver', 'Silver screen']] : [])]; },
  draftHas(k, v) { return !!(this.draft && this.draft[k] === v); },
  ids: [], draft: null, saved: '', trial: null, urls: [],
  /* the recipe: a saved one is checked field by field, anything unknown falls back to the default */
  clean(a) {
    a = a && typeof a === 'object' ? a : {}; const d = this.DEF, pick = (v, list, def) => (list.some((x) => x[0] === v) ? v : def);
    return {
      v: 1, src: pick(a.src, this.SRC, d.src), motion: pick(a.motion, this.MOTION, d.motion), secs: pick(Number(a.secs), this.SECS, d.secs),
      fx: ['auto', 'none', 'dust', 'fog', 'embers', 'snow'].includes(a.fx) ? a.fx : d.fx,
      tone: ['natural', 'bw', 'warm', 'cool', 'silver'].includes(a.tone) ? a.tone : d.tone,
      grain: typeof a.grain === 'boolean' ? a.grain : d.grain, clock: typeof a.clock === 'boolean' ? a.clock : d.clock,
    };
  },
  cfg() { return this.trial || this.clean(CFG.ambient); },
  /* ---- the photo store (this device only) ---- */
  idb() {
    if (!this._db) this._db = new Promise((res, rej) => {
      try { const o = indexedDB.open('mkc-ambient', 1); o.onupgradeneeded = () => { if (!o.result.objectStoreNames.contains('photos')) o.result.createObjectStore('photos', { keyPath: 'id' }); }; o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); } catch (e) { rej(e); }
    });
    return this._db;
  },
  async req(mode, fn) {
    const db = await this.idb();
    return new Promise((res, rej) => { const t = db.transaction('photos', mode), r = fn(t.objectStore('photos')); t.oncomplete = () => res(r ? r.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort')); });
  },
  async loadIds() { try { this.ids = ((await this.req('readonly', (s) => s.getAllKeys())) || []).map(String).sort(); } catch (e) { this.ids = []; } return this.ids; },
  get(id) { return this.req('readonly', (s) => s.get(id)).catch(() => null); },
  async put(rec) { await this.req('readwrite', (s) => s.put(rec)); if (!this.ids.includes(rec.id)) this.ids.push(rec.id); },
  async del(id) { await this.req('readwrite', (s) => s.delete(id)).catch(() => {}); this.ids = this.ids.filter((x) => x !== id); },
  /* photos are kept at screen size (long side 2400 px, JPEG) with a small copy for the studio's grid */
  canvasBlob(img, w, h, q) {
    const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
    const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => { c.width = c.height = 0; if (b) res(b); else rej(new Error('encode')); }, 'image/jpeg', q));
  },
  async encode(blob, long = 2400, q = 0.85) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await AmbientArt.load(url, false, 30000), w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw new Error('empty');
      const k = Math.min(1, long / Math.max(w, h)), t = Math.min(1, 360 / Math.max(w, h)), W = Math.round(w * k), H = Math.round(h * k);
      const big = await this.canvasBlob(img, W, H, q), thumb = await this.canvasBlob(img, Math.round(w * t), Math.round(h * t), 0.8);
      img.removeAttribute('src');
      return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, blob: big, thumb, w: W, h: H, at: Date.now() };
    } finally { URL.revokeObjectURL(url); }
  },
  async addFiles(files) {
    const list = [...(files || [])].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif|bmp|heic|heif)$/i.test(f.name || ''));
    if (!list.length) { toast('Pick photos (JPEG, PNG or WebP)', 'err'); return; }
    const room = this.MAX - this.ids.length; if (room <= 0) { toast('Ambient Mode holds 60 photos. Remove some first.', 'err', 5000); return; }
    let ok = 0, bad = 0; this.busy = true; this.paintPhotos();
    for (const f of list.slice(0, room)) {
      try { await this.put(await this.encode(f)); ok++; } catch (e) { bad++; }
      const n = $('.as-busy'); if (n) n.textContent = `${ok + bad} / ${Math.min(list.length, room)}`;
    }
    this.busy = false;
    if (ok && this.draft && this.draft.src === 'films') this.draft.src = 'mine';
    this.refresh();
    if (bad) toast(ok ? `${ok} added. ${bad} couldn’t be opened here (try JPEG or PNG).` : 'Those photos couldn’t be opened here. Try JPEG or PNG.', ok ? 'info' : 'err', 6000);
    else if (list.length > room) toast(`${ok} added. Ambient Mode holds 60 photos.`, 'info', 5000);
    else toast(ok === 1 ? '1 photo added' : `${ok} photos added`, 'ok');
  },
  pick() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true; i.hidden = true;
    i.addEventListener('change', () => { const f = i.files; i.remove(); this.addFiles(f); });
    document.body.appendChild(i); i.click();
  },
  /* Saver asks for these: one pseudo-title per photo */
  items() { return this.ids.map((id) => ({ id: `ph:${id}`, photo: id, type: 'photo', name: '' })); },
  pool(films) {
    const a = this.cfg(), ph = a.src === 'films' ? [] : this.items();
    if (a.src === 'mine' && ph.length) return ph;
    return a.src === 'both' ? films.concat(ph) : films;
  },
  /* A photo far from the screen's shape (a phone's portrait shot on a TV) is framed on a soft, dark copy of itself,
     drawn once into one canvas, so the motion and the 3D depth still treat it as one picture. */
  frame(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, W = AmbientArt.px(), H = Math.round(W * innerHeight / Math.max(1, innerWidth));
    const ia = w / h, sa = W / H, c = document.createElement('canvas'), x = c.getContext('2d');
    if (Math.abs(Math.log(ia / sa)) < Math.log(1.3)) {
      const k = Math.min(1, Math.max(W / w, H / h)); c.width = Math.round(w * k); c.height = Math.round(h * k); x.drawImage(img, 0, 0, c.width, c.height); return c;
    }
    c.width = W; c.height = H;
    const t1 = document.createElement('canvas'), t2 = document.createElement('canvas'); t1.width = 24; t1.height = Math.max(2, Math.round(24 / sa)); t2.width = 96; t2.height = Math.max(4, Math.round(96 / sa));
    const kc = Math.max(t1.width / w, t1.height / h); t1.getContext('2d').drawImage(img, (t1.width - w * kc) / 2, (t1.height - h * kc) / 2, w * kc, h * kc);
    const x2 = t2.getContext('2d'); x2.imageSmoothingQuality = 'high'; x2.drawImage(t1, 0, 0, t2.width, t2.height);
    x.imageSmoothingQuality = 'high'; x.drawImage(t2, 0, 0, W, H); x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, 0, W, H);
    const k = Math.min(W * 0.94 / w, H * 0.9 / h), dw = w * k, dh = h * k;
    x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = Math.round(W / 40); x.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    t1.width = t1.height = t2.width = t2.height = 0; c.framed = true;
    return c;
  },
  styleFor(m) {
    const fx = this.cfg().fx;
    if (fx !== 'auto') return fx;
    return m && m.photo ? 'dust' : ambientStyle(m);
  },
  /* films may use the 3D depth shader unless the recipe asks for a flat drift or a still frame */
  depthOK() { const mo = this.cfg().motion; return mo === 'auto' || mo === 'depth'; },
  async prepPhoto(m, sv) {
    const rec = await this.get(m.photo); if (!rec || !rec.blob || !sv.isOpen) return null;
    const url = URL.createObjectURL(rec.blob); let img;
    try { img = await AmbientArt.load(url, false, 15000); } catch (e) { URL.revokeObjectURL(url); return null; }
    const c = this.frame(img); img.removeAttribute('src'); URL.revokeObjectURL(url);
    if (!sv.isOpen) { c.width = c.height = 0; return null; }
    const colors = AmbientArt.colors(c) || AMBIENT_STYLES.dust.colors, style = this.styleFor(m);
    // a framed photo stays flat: the depth shader would bend its edges and the frame around it
    const mode = this.cfg().motion === 'depth' && !c.framed && sv.level > 0 && AmbientGL.ok !== false && (AmbientGL.ok || AmbientGL.init($('.sv-gl', sv.el))) ? 'B' : 'C';
    const side = (sv.side ^= 1);
    const back = document.createElement('div'); back.className = `sv-b ${mode.toLowerCase()} ph${side ? ' r' : ''}`;
    c.className = 'sv-bg'; if (mode !== 'B') back.appendChild(c);
    const front = document.createElement('div'); front.className = `sv-f ${mode.toLowerCase()} ph${side ? ' r' : ''}`;
    return { m, mode, img: c, back, front, style, colors: [colors[0], colors[1] || colors[0]], slot: 0, titled: true };
  },
  /* Saver.open calls this: the recipe dresses the screensaver */
  dress(sv, el) {
    const a = this.cfg();
    sv.CYCLE = Math.max(8, a.secs) * 1000;
    el.style.setProperty('--cyc', `${sv.CYCLE / 1000}s`);
    ['bw', 'warm', 'cool', 'silver'].forEach((t) => el.classList.toggle(`tone-${t}`, a.tone === t));
    el.classList.toggle('mo-still', a.motion === 'still'); el.classList.toggle('no-clock', !a.clock);
    if (!$('.sv-tint', el)) { const ti = document.createElement('div'); ti.className = 'sv-tint'; $('.sv-back', el).after(ti); }
    let g = $('.sv-grain', el); if (!g) { g = document.createElement('div'); g.className = 'sv-grain'; $('.sv-top', el).before(g); }
    g.hidden = !a.grain && a.tone !== 'silver';
    let mid = $('.sv-mid', el); if (!mid) { mid = document.createElement('div'); mid.className = 'sv-mid'; mid.hidden = true; mid.textContent = 'Midnight screening'; $('.sv-clock', el).after(mid); }
    const onlyPhotos = a.src === 'mine' && this.ids.length, hint = $('.sv-hint', el);
    if (hint) hint.innerHTML = `<span>◀ ▶ Browse</span>${onlyPhotos ? '' : `<span>${IS_TV ? 'OK' : 'Enter'} Watch</span>`}<span>Back Return</span>`;
  },
  /* the screensaver's clock ticks every 15 s: at midnight it says so */
  midnight(el) {
    const d = new Date(), on = d.getHours() === 0 && d.getMinutes() === 0, mid = el && $('.sv-mid', el);
    if (mid) mid.hidden = !on || !this.cfg().clock;
    if (on && this.cfg().clock) Eggs.found('midnight');
  },
  closed() {
    if (!this.trial) return;
    this.trial = null;
    const b = $(`#${this.ID}`); if (b && !b.hidden && IS_TV) setTimeout(() => { const t = $(`#${this.ID} [data-ask="try:1"]`); if (t) Nav.focus(t, true); }, 520);
  },
  /* ---- the studio ---- */
  open() {
    const go0 = async () => {
      await this.loadIds();
      this.draft = this.clean(CFG.ambient); this.saved = JSON.stringify(this.draft);
      const el = X8.layer(this.ID, { label: 'Ambient Studio', full: true }); el.classList.add('ls-layer', 'as-layer');
      X8.backHook[this.ID] = () => this.leave();
      X8.onClose[this.ID] = () => this.drop();
      this.render(); X8.open(this.ID);
      if (typeof Remote !== 'undefined' && Remote.hintEl && Remote.unhint) Remote.unhint();   // the phone-remote card would cover the choices
      if (IS_TV) setTimeout(() => { const f = $(`#${this.ID} .as-ctl [data-nav]`); if (f) Nav.focus(f, true); }, 80);
    };
    if (typeof Seats !== 'undefined' && Seats.kids && Seats.kids() && Seats.guard) Seats.guard(go0); else go0();
  },
  dirty() { return !!this.draft && JSON.stringify(this.draft) !== this.saved; },
  leave() {
    if (!this.dirty()) { X8.close(this.ID); return true; }
    Gate.ask({ icon: 'wand-sparkles', eyebrow: 'Ambient Studio', title: 'Save your Ambient Mode?', yes: 'Save', no: 'Don’t save', html: 'You changed your Ambient Mode. Save it, or keep it as it was.' }).then((v) => {
      if (v === true) this.save(); else if (v === false) { this.saved = JSON.stringify(this.draft); X8.close(this.ID); }
    });
    return true;
  },
  save() {
    setCfg('ambient', this.clean(this.draft));
    this.saved = JSON.stringify(this.draft); X8.close(this.ID);
    toast('Ambient Mode saved', 'ok');
  },
  drop() { this.urls.forEach((u) => URL.revokeObjectURL(u)); this.urls = []; },
  chips(key, list, cur) {
    return `<div class="ls-chips">${list.map(([v, l]) => `<button class="chip${String(cur) === String(v) ? ' on' : ''}" type="button" data-nav data-ask="${key}:${esc(String(v))}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
  },
  render() {
    const b = X8.body(this.ID); if (!b) return;
    const d = this.draft, n = Eggs.count();
    const acts = `<button class="btn btn-ghost" type="button" data-nav data-ask="reset:1"><i data-lucide="rotate-ccw"></i><span class="ls-bl">Reset</span></button>
      <button class="btn btn-ghost" type="button" data-nav data-ask="try:1"><i data-lucide="monitor-play"></i>Try it</button>
      <button class="btn btn-prime" type="button" data-nav data-ask="save:1"><i data-lucide="check"></i>Save</button>`;
    b.innerHTML = `<div class="ls-wrap as-wrap">
      <header class="ls-head"><div><span class="eyebrow"><i data-lucide="wand-sparkles"></i>Ambient Studio</span><h2 class="x8-h ls-h">Make your own Ambient Mode</h2></div>
        <div class="ls-hacts">${IS_TV ? acts : ''}<button class="ibtn" type="button" data-nav data-ask="close:1" aria-label="Close"><i data-lucide="x"></i></button></div></header>
      <div class="ls-main as-main">
        <section class="as-stage" aria-label="Preview"><div class="as-pv" id="asPv">${this.preview()}</div>
          <p class="as-note">Try it shows the real thing, full screen, on this ${IS_TV ? 'TV' : 'screen'}. Any key or tap brings you back.</p></section>
        <section class="ls-ctl as-ctl">
          <div class="ls-grp"><h3>Show</h3>${this.chips('src', this.SRC, d.src)}</div>
          <div class="ls-grp" id="asPhotos">${this.photosHtml()}</div>
          <div class="ls-grp"><h3>Motion</h3>${this.chips('motion', this.MOTION, d.motion)}</div>
          <div class="ls-grp"><h3>Change every</h3>${this.chips('secs', this.SECS, d.secs)}</div>
          <div class="ls-grp"><h3>Atmosphere</h3>${this.chips('fx', this.FX(), d.fx)}</div>
          <div class="ls-grp"><h3>Colour</h3>${this.chips('tone', this.TONE(), d.tone)}</div>
          <div class="ls-grp"><h3>Film grain</h3>${this.chips('grain', [['0', 'Off'], ['1', 'On']], d.grain ? '1' : '0')}</div>
          <div class="ls-grp"><h3>Clock</h3>${this.chips('clock', [['1', 'On'], ['0', 'Off']], d.clock ? '1' : '0')}</div>
          ${n ? `<p class="as-eggs"><i data-lucide="sparkles"></i><span>Secrets found: ${n} of ${Eggs.ALL.length}</span></p>` : ''}
        </section>
      </div>
      ${IS_TV ? '' : `<footer class="ls-foot">${acts}</footer>`}</div>`;
    icons(); this.thumbs();
    b.onclick = (e) => { const t = e.target.closest('[data-ask]'); if (t && !t.disabled) this.act(t.dataset.ask); };
  },
  photosHtml() {
    const n = this.ids.length;
    const add = IS_TV ? '<button class="btn btn-ghost btn-sm" type="button" data-nav data-ask="recv:1"><i data-lucide="smartphone"></i>Get photos from your phone</button>'
      : `<button class="btn btn-ghost btn-sm" type="button" data-nav data-ask="add:1"${this.busy ? ' disabled' : ''}><i data-lucide="upload"></i>Add photos</button>${n ? '<button class="btn btn-ghost btn-sm" type="button" data-nav data-ask="send:1"><i data-lucide="tv"></i>Send to TV</button>' : ''}`;
    return `<h3>My photos <small class="as-n tnum">${n} / ${this.MAX}</small></h3>
      ${n ? `<div class="as-grid">${this.ids.map((id) => `<button class="as-th" type="button" data-nav data-ask="rm:${esc(id)}" aria-label="Remove photo" title="Remove photo"><img alt="" data-ph="${esc(id)}"><i data-lucide="x"></i></button>`).join('')}</div>` : ''}
      <div class="inrow as-add">${add}${this.busy ? '<span class="as-busy tnum" aria-live="polite"></span>' : ''}${n > 1 ? '<button class="btn btn-ghost btn-sm" type="button" data-nav data-ask="rmall:1"><i data-lucide="trash-2"></i>Remove all</button>' : ''}</div>
      <p class="as-note">${IS_TV ? 'Photos from your phone stay on this TV. They are never stored online.' : 'Your photos stay on this device. They are never stored online.'}</p>`;
  },
  paintPhotos() { const g = $('#asPhotos'); if (g) { g.innerHTML = this.photosHtml(); icons(); this.thumbs(); } },
  async thumbs() {
    for (const im of $$(`#${this.ID} img[data-ph]`)) {
      const rec = await this.get(im.dataset.ph); if (!rec || !im.isConnected) continue;
      const u = URL.createObjectURL(rec.thumb || rec.blob); this.urls.push(u); im.src = u;
    }
    this.previewArt();
  },
  /* the small preview: the first photo (or the banner's film), the colour, the grain, the corner mark and the clock */
  preview() {
    const d = this.draft, t = new Date().toLocaleTimeString(appLocale(), { hour: 'numeric', minute: '2-digit' });
    return `<div class="as-pvs tone-${d.tone}${d.motion === 'still' ? ' mo-still' : ''}" style="--cyc:${d.secs}s" aria-hidden="true"><img class="as-pvi" alt="">${d.grain || d.tone === 'silver' ? '<i class="as-pvg"></i>' : ''}
      <div class="as-pvt"><span class="as-pvb"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="55" fill="none" stroke="url(#mkRing)" stroke-width="3.5"/><use href="#mkLetters" transform="translate(60 60) scale(.84)" fill="url(#mkPlat)"/></svg>MKCINEMA</span>${d.clock ? `<b class="tnum">${esc(t)}</b>` : ''}</div>
      <span class="as-pvfx as-fx-${d.fx}"></span></div>`;
  },
  async previewArt() {
    const im = $('#asPv .as-pvi'); if (!im) return;
    const d = this.draft, useMine = d.src !== 'films' && this.ids.length;
    if (useMine) { const rec = await this.get(this.ids[0]); if (rec && im.isConnected) { const u = URL.createObjectURL(rec.blob); this.urls.push(u); im.src = u; return; } }
    const hero = (S.hero || []).find((m) => metaBg(m)); if (hero) im.src = metaBg(hero); else im.remove();
  },
  act(k0) {
    const i = k0.indexOf(':'), k = k0.slice(0, i), v = k0.slice(i + 1), d = this.draft;
    if (k === 'close') { this.leave(); return; }
    if (k === 'save') { this.save(); return; }
    if (k === 'try') { this.trial = this.clean(d); Saver.open(true); return; }
    if (k === 'add') { this.pick(); return; }
    if (k === 'send') { this.sendTo(); return; }
    if (k === 'recv') { this.receive(); return; }
    if (k === 'rm') {
      Gate.ask({ icon: 'trash-2', eyebrow: 'Ambient Studio', title: 'Remove this photo?', yes: 'Remove', no: 'Keep', html: 'It comes off Ambient Mode on this device. The photo in your gallery stays where it is.' })
        .then(async (y) => { if (y === true) { await this.del(v); this.refresh('add:1'); } });
      return;
    }
    if (k === 'rmall') {
      Gate.ask({ icon: 'trash-2', eyebrow: 'Ambient Studio', title: 'Remove all photos?', yes: 'Remove all', no: 'Keep', html: 'They come off Ambient Mode on this device. The photos in your gallery stay where they are.' })
        .then(async (y) => { if (y === true) { for (const id of this.ids.slice()) await this.del(id); if (this.draft.src !== 'films') this.draft.src = 'films'; this.refresh('add:1'); } });
      return;
    }
    if (k === 'reset') Object.assign(d, this.clean({}));
    else if (k === 'grain' || k === 'clock') d[k] = v === '1';
    else if (k === 'secs') d.secs = Number(v);
    else if (['src', 'motion', 'fx', 'tone'].includes(k)) d[k] = v;
    this.refresh(k0);
  },
  /* draw again and put the focus back on the same control, so a TV remote never loses its place */
  refresh(focusKey) {
    const b = X8.body(this.ID); if (!b || !this.draft) return;
    const sc = $('.ls-ctl', b), top = sc ? sc.scrollTop : 0, m = $('.ls-main', b), mt = m ? m.scrollTop : 0;
    this.drop(); this.render();
    const nb = X8.body(this.ID), sc2 = $('.ls-ctl', nb); if (sc2) sc2.scrollTop = top; const m2 = $('.ls-main', nb); if (m2) m2.scrollTop = mt;
    let f = focusKey && $(`[data-ask="${CSS.escape(focusKey)}"]`, nb);
    if (!f && /^rm/.test(focusKey || '')) f = $('[data-ask^="rm:"]', nb) || $('[data-ask="add:1"],[data-ask="recv:1"]', nb);
    if (f) { if (IS_TV) Nav.focus(f, true); else f.focus({ preventScroll: true }); }
  },
  /* ---- photos from a phone or computer to the TV: the TV shows a code, the phone types it. The photos travel over the
     same realtime channel as the phone remote, in small pieces, straight to the TV. Nothing is stored online. ---- */
  receive() {
    const el = X8.layer('ambRecv', { label: 'Get photos', icon: 'smartphone', eyebrow: 'Get photos' });
    X8.onClose.ambRecv = () => { if (this.rx) { this.rx.close(); this.rx = null; } clearTimeout(this.rxT); if (this.got) { this.got = 0; this.refresh('recv:1'); } };
    const code = roomCode(), b = X8.body('ambRecv'); this.got = 0;
    const paint = (state, line) => {
      const url = appLink(`ambsend=${code}`);
      let qr = ''; if (url) try { qr = QR.svg(url, { margin: 2 }); } catch (e) { qr = ''; }
      b.innerHTML = `<h2 class="x8-h">Send photos to this TV</h2>
        <p class="sc-p">On your phone, scan the code with the camera. Or open MKCinema on your phone, go to Settings › Home › Ambient Studio, press Send to TV and type this code.</p>
        <div class="ls-code mono" translate="no">${state === 'offline' ? '······' : esc(code.split('').join(' '))}</div>
        ${qr && state !== 'offline' && state !== 'done' ? `<div class="ls-qr">${qr}</div>` : ''}
        <p class="sc-p ls-rxs" aria-live="polite">${line || (state === 'offline' ? 'This TV can’t reach the internet right now. Check the connection and try again.' : state === 'expired' ? 'The code ran out. Open this again for a new one.' : state === 'connecting' ? 'Getting a code…' : 'Waiting for photos… The code works for 10 minutes.')}</p>
        <div class="inrow">${state === 'done' ? '<button class="btn btn-prime" type="button" data-nav data-amr="try"><i data-lucide="monitor-play"></i>Try it</button>' : ''}<button class="btn btn-ghost" type="button" data-nav data-x8close>${state === 'done' ? 'Done' : 'Close'}</button></div>`;
      icons();
      const tr = $('[data-amr="try"]', b); if (tr) tr.onclick = () => { X8.close('ambRecv'); setTimeout(() => this.act('try:1'), 300); };
      if (IS_TV) setTimeout(() => { const f = $('[data-amr="try"]', b) || $('[data-x8close]', b); if (f && f.isConnected) Nav.focus(f, true); }, 60);
    };
    if (this.rx) this.rx.close();
    paint('connecting'); X8.open('ambRecv');
    if (typeof Remote !== 'undefined' && Remote.hintEl && Remote.unhint) Remote.unhint();
    const parts = new Map(), saved = new Set();
    const bus = this.rx = new Bus(`amb-${code}`, async (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello') { bus.send({ t: 'here', room: this.MAX - this.ids.length }); return; }
      if (m.t === 'pc' && Number.isInteger(m.i) && Number.isInteger(m.k) && Number.isInteger(m.of) && m.of > 0 && m.of <= 80 && typeof m.d === 'string' && m.d.length <= 70000) {
        if (saved.has(m.i)) { if (m.k === m.of - 1) bus.send({ t: 'pok', i: m.i }); return; }
        let p = parts.get(m.i); if (!p || p.of !== m.of) { p = { of: m.of, d: [] }; parts.set(m.i, p); }
        p.d[m.k] = m.d;
        if (p.d.filter((x) => typeof x === 'string').length < p.of) return;
        parts.delete(m.i);
        if (this.ids.length >= this.MAX) { bus.send({ t: 'pfull', i: m.i }); return; }
        try {
          const bin = atob(p.d.join('')), u8 = new Uint8Array(bin.length); for (let j = 0; j < bin.length; j++) u8[j] = bin.charCodeAt(j);
          const rec = await this.encode(new Blob([u8], { type: 'image/jpeg' }), 1920, 0.85);
          await this.put(rec); saved.add(m.i); this.got++;
          bus.send({ t: 'pok', i: m.i });
          const s = $('.ls-rxs', b); if (s) s.textContent = this.got === 1 ? 'Got 1 photo…' : `Got ${this.got} photos…`;
        } catch (e) { bus.send({ t: 'pbad', i: m.i }); }
        return;
      }
      if (m.t === 'end') {
        if (m.a && typeof m.a === 'object') { const a = this.clean(m.a); if (a.src === 'films' && this.ids.length) a.src = 'mine'; setCfg('ambient', a); if (this.draft) this.draft = this.clean(a); this.saved = JSON.stringify(this.draft || a); }
        bus.send({ t: 'done', got: this.got });
        paint('done', this.got ? (this.got === 1 ? 'Got 1 photo. Ambient Mode shows it now.' : `Got ${this.got} photos. Ambient Mode shows them now.`) : 'Your Ambient Mode settings arrived.');
      }
    });
    bus.connect().then((ok) => { if (this.rx !== bus) return; paint(ok ? 'waiting' : 'offline'); });
    clearTimeout(this.rxT); this.rxT = setTimeout(() => { if (this.rx === bus && !this.got) { bus.close(); this.rx = null; paint('expired'); } }, 10 * 60000);
  },
  b64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); },
  sendTo(pre) {
    const el = X8.layer('ambSend', { label: 'Send to TV', icon: 'tv', eyebrow: 'Send to TV' }), b = X8.body('ambSend'), n = this.ids.length;
    b.innerHTML = `<h2 class="x8-h">Send your Ambient Mode to a TV</h2>
      <p class="sc-p">On the TV, open Settings › Home › Ambient Studio and press Get photos from your phone. Type the code it shows.</p>
      <p class="sc-p">${n === 1 ? 'Your photo and your settings go to the TV.' : n ? `All ${n} photos and your settings go to the TV.` : 'Your settings go to the TV.'}</p>
      <form class="ls-sendf"><input class="inp mono" id="ambCode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123" aria-label="Code on the TV" value="${esc(pre || '')}">
      <button class="btn btn-prime" type="submit" data-nav><i data-lucide="send"></i>Send</button></form>
      <p class="sc-p ls-txs" aria-live="polite"></p>`;
    icons(); X8.open('ambSend');
    const inp = $('#ambCode'), msg = $('.ls-txs', b), form = $('form', b);
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = inp.value.trim().toUpperCase(), btn = $('button', form);
      if (!this.CODE.test(code)) { msg.textContent = 'Type the 6 letters and numbers shown on the TV.'; inp.focus(); return; }
      btn.disabled = true; msg.textContent = 'Connecting…';
      const r = await this.send(code, (i, tot) => { msg.textContent = `Sending ${i} of ${tot}…`; });
      btn.disabled = false;
      if (r.ok) { X8.close('ambSend'); toast(r.sent === 1 ? 'Sent 1 photo. The TV shows it in Ambient Mode now.' : r.sent ? `Sent ${r.sent} photos. The TV shows them in Ambient Mode now.` : 'Sent. The TV uses your Ambient Mode settings now.', 'ok', 6000); }
      else msg.textContent = r.why;
    });
    if (IS_TV) Nav.focus(inp, true); else setTimeout(() => inp.focus(), 60);
  },
  async send(code, onStep) {
    const wait = new Map(); let here = null;
    const hereP = new Promise((res) => { here = res; setTimeout(() => res(null), 10000); });
    let doneR = null; const doneP = new Promise((res) => { doneR = res; });
    const bus = new Bus(`amb-${code}`, (m) => {
      if (m.t === 'here') here(m);
      else if ((m.t === 'pok' || m.t === 'pbad' || m.t === 'pfull') && wait.has(m.i)) { wait.get(m.i)(m.t); wait.delete(m.i); }
      else if (m.t === 'done') doneR(m);
    });
    const fail = (why) => { bus.close(); return { ok: false, why }; };
    if (!(await bus.connect())) return fail('Couldn’t connect. Check the internet connection and try again.');
    bus.send({ t: 'hello' });
    const h = await hereP; if (!h) return fail('No TV with that code answered. Check the code, and keep the code screen open on the TV.');
    const ids = this.ids.slice(0, Math.max(0, Math.min(this.MAX, Number(h.room) || 0)));
    let sent = 0;
    for (let i = 0; i < ids.length; i++) {
      onStep(i + 1, ids.length);
      const rec = await this.get(ids[i]); if (!rec) continue;
      let data; try { const small = await this.encode(rec.blob, 1920, 0.82); data = await this.b64(small.blob); } catch (e) { continue; }
      const C = 48000, of = Math.ceil(data.length / C);
      if (of > 80) continue;
      let res = null;
      for (let tries = 0; tries < 2 && !res; tries++) {
        const got = new Promise((r2) => { wait.set(i, r2); setTimeout(() => r2(null), 15000); });
        for (let k = 0; k < of; k++) { bus.send({ t: 'pc', i, k, of, d: data.slice(k * C, (k + 1) * C) }); await new Promise((r2) => setTimeout(r2, 40)); }
        res = await got;
      }
      if (res === 'pok') sent++;
      else if (res === 'pfull') break;
      else if (!res) return fail(sent ? `Sent ${sent}, then the TV stopped answering. Try again to send the rest.` : 'The TV stopped answering. Check that it’s still on the code screen and try again.');
    }
    bus.send({ t: 'end', a: this.clean(this.draft || CFG.ambient) });
    await Promise.race([doneP, new Promise((r2) => setTimeout(r2, 8000))]);
    bus.close();
    return { ok: true, sent };
  },
  /* a #ambsend=CODE link (the TV's QR code): open the send screen with the code filled in */
  sendLink(code) {
    code = String(code || '').toUpperCase(); if (!this.CODE.test(code)) { toast('That code isn’t complete', 'err'); return; }
    const tryOpen = (n) => {
      const busy = document.body.classList.contains('intro-on') || !S.booted;
      if (busy && n < 40) { setTimeout(() => tryOpen(n + 1), 500); return; }
      this.loadIds().then(() => { if (!this.draft) this.draft = this.clean(CFG.ambient); this.sendTo(code); });
    };
    tryOpen(0);
  },
  init() { this.loadIds(); },
};

/* ---- Easter eggs: four small secrets, found by playing around. Silent, brief, and they never block anything.
   booth: Up Up Down Down Left Right Left Right on a keyboard or TV remote, or hold the logo for 2.5 s on a phone
          (a film leader counts down; unlocks Silver screen)
   credits: tap the MKCinema logo 7 times, or press Up 7 times at the very top of a screen
   rosebud: search for "rosebud" (snow falls; unlocks the Snow globe atmosphere)
   midnight: Ambient Mode showing at midnight says "Midnight screening" ---- */
const Eggs = {
  ALL: ['booth', 'credits', 'rosebud', 'midnight'],
  list() { return Array.isArray(CFG.eggs) ? CFG.eggs.filter((k) => this.ALL.includes(k)) : []; },
  has(k) { return this.list().includes(k); },
  count() { return this.list().length; },
  found(k) { if (this.has(k)) return false; setCfg('eggs', [...this.list(), k]); return true; },
  busy() { return document.body.classList.contains('saver-on') || !$('#player').hidden || $('#mkEgg'); },
  init() {
    const SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
    let keys = [], ups = 0, upT = 0;
    addEventListener('keydown', (e) => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'TEXTAREA' || ae.isContentEditable || (ae.tagName === 'INPUT' && !/^(checkbox|radio|button|range|submit)$/i.test(ae.type)))) { keys = []; return; }   // typing, not playing
      keys.push(e.key); if (keys.length > SEQ.length) keys.shift();
      if (keys.length === SEQ.length && keys.every((k, i) => k === SEQ[i])) { keys = []; this.booth(); return; }
      // pressing Up at the very top, where nothing moves any more
      if (e.key === 'ArrowUp') {
        const before = document.activeElement, y = scrollY;
        setTimeout(() => {
          if (document.activeElement !== before || scrollY !== y || y > 4 || document.body.classList.contains('layer-open')) { ups = 0; return; }
          const now = Date.now(); ups = now - upT < 1500 ? ups + 1 : 1; upT = now;
          if (ups >= 7) { ups = 0; this.credits(); }
        }, 120);
      } else ups = 0;
    }, true);
    let taps = 0, tapT = 0;
    document.addEventListener('click', (e) => {
      if (!e.target.closest || !e.target.closest('.brand,.ezb-logo,.sn-foot')) { taps = 0; return; }
      const now = Date.now(); taps = now - tapT < 900 ? taps + 1 : 1; tapT = now;
      if (taps >= 7) { taps = 0; this.credits(); }
    }, true);
    // phones and tablets have no arrow keys: holding the logo for 2.5 seconds opens the booth too
    let hold = 0;
    const logo = (e) => e.target && e.target.closest && e.target.closest('.brand,.ezb-logo');
    document.addEventListener('pointerdown', (e) => { clearTimeout(hold); if (logo(e)) hold = setTimeout(() => { taps = 0; this.booth(); }, 2500); }, true);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => document.addEventListener(t, () => clearTimeout(hold), true));
    document.addEventListener('contextmenu', (e) => { if (logo(e)) e.preventDefault(); }, true);
    const pal = $('#palInput');
    if (pal) pal.addEventListener('input', () => { if (pal.value.trim().toLowerCase() === 'rosebud') this.rosebud(); else if (pal.value.trim().toLowerCase() === 'arcade' && window.MkArcade) { pal.value = ''; MkArcade.open(); } });
  },
  /* a film leader counts 3, 2, 1 in the middle of the screen */
  booth() {
    if (this.busy()) return;
    const el = document.createElement('div'); el.id = 'mkEgg'; el.className = 'egg-leader'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="egg-l"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92"/><circle cx="100" cy="100" r="74"/><path d="M100 0v200M0 100h200"/></svg><i class="egg-sw"></i><b class="tnum">3</b></div>';
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
    const num = $('b', el); let n = 3;
    const t = setInterval(() => { n--; if (n > 0) { num.textContent = String(n); return; } clearInterval(t); el.classList.remove('on'); setTimeout(() => el.remove(), 500);
      toast(this.found('booth') ? 'You found the projectionist’s booth. Silver screen is now in Ambient Studio.' : 'The projectionist says hello again.', 'ok', 7000); }, 900);
  },
  /* the closing credits, rolling once */
  credits() {
    if (this.busy() || $('#mkCredits:not([hidden])')) return;
    const fresh = this.found('credits');
    const el = X8.layer('mkCredits', { label: 'Credits', icon: 'clapperboard', eyebrow: 'Credits' }); el.classList.add('egg-cr');
    X8.body('mkCredits').innerHTML = `<div class="egg-roll"><div class="egg-in">
      <svg class="egg-mk" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="55" fill="none" stroke="url(#mkRing)" stroke-width="3.5"/><use href="#mkLetters" transform="translate(60 60) scale(.84)" fill="url(#mkPlat)"/></svg>
      <h2 class="x8-h" translate="no">MKCINEMA</h2><p class="egg-tag">Tomorrow’s cinema. For the whole house.</p>
      <dl><dt>Directed by</dt><dd translate="no">Dee Lavish</dd><dt>Starring</dt><dd>Everyone on your sofa</dd><dt>Projection</dt><dd>Every screen in the house</dd><dt>Popcorn</dt><dd>Bring your own</dd><dt>Ticket price</dt><dd>Free, forever</dd></dl>
      <p class="egg-end">Thank you for watching.</p><p class="egg-ver tnum" translate="no">${esc(APP_VERSION)}</p></div></div>
      <div class="inrow"><button class="btn btn-ghost" type="button" data-nav data-x8close>Close</button></div>`;
    icons(); X8.open('mkCredits');
    if (IS_TV) setTimeout(() => { const f = $('#mkCredits [data-x8close]'); if (f) Nav.focus(f, true); }, 80);
    if (fresh) setTimeout(() => toast('You found the credits. Secrets live in Ambient Studio.', 'ok', 6000), 1200);
  },
  /* snow drifts down the screen for a few seconds */
  rosebud() {
    const fresh = this.found('rosebud');
    const say = () => toast(fresh ? 'Rosebud. Snow globe is now in Ambient Studio.' : 'Rosebud.', 'ok', 6000);
    if (window.MK_LITE || CFG.reduceMotion || $('#mkSnow')) { say(); return; }
    const cv = document.createElement('canvas'); cv.id = 'mkSnow'; cv.setAttribute('aria-hidden', 'true');
    const s = Math.min(1, 1280 / innerWidth); cv.width = Math.round(innerWidth * s); cv.height = Math.round(innerHeight * s);
    document.body.appendChild(cv);
    const x = cv.getContext('2d'), W = cv.width, H = cv.height, r = Math.random, flakes = Array.from({ length: 140 }, () => ({ x: r() * W, y: r() * -H, v: 30 + r() * 60, z: 1 + r() * 2.6, p: r() * 6 }));
    const t0 = performance.now(); let last = t0;
    const step = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000), age = (t - t0) / 1000; last = t;
      x.clearRect(0, 0, W, H); x.fillStyle = '#fff';
      x.globalAlpha = age > 6 ? Math.max(0, 1 - (age - 6) / 1.5) * 0.85 : 0.85;
      flakes.forEach((f) => { f.y += f.v * dt * s * 1.6; f.x += Math.sin(age * 1.3 + f.p) * 18 * dt * s; if (f.y > H + 4 && age < 5) { f.y = -4; f.x = r() * W; } x.beginPath(); x.arc(f.x, f.y, f.z * s * 1.4, 0, 6.283); x.fill(); });
      if (age < 7.5) requestAnimationFrame(step); else cv.remove();
    };
    requestAnimationFrame(step); setTimeout(say, 600);
  },
};
AmbStudio.init();
Eggs.init();

COMMANDS.push({ label: 'Ambient Studio', icon: 'wand-sparkles', run: () => AmbStudio.open() });
