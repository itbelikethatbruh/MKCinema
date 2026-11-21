
'use strict';
/* 2.86 Looks
   - Appearance: your own font file (.woff2, .woff, .ttf, .otf, up to 900 KB) and a background picture (made smaller on this
     device). Both stay on this device. A look file (.mklook) saves the Atelier theme, the film page style and the player
     look, with the font and picture inside, so it can be opened on another device or sent to a friend.
   - Film page styles: Classic, Tall, Short, Centred, Poster beside, Plain.
   - Player look: progress bar Thin, Standard, Thick, Glow or Accent, and an optional big Play button while paused.
   - First start: the walkthrough has a "Pick your look" step. */
const LookKit = {
  PAGES: [['classic', 'Classic'], ['tall', 'Tall'], ['short', 'Short'], ['center', 'Centred'], ['poster', 'Poster beside'], ['plain', 'Plain']],
  BARS: [['std', 'Standard'], ['thin', 'Thin'], ['thick', 'Thick'], ['glow', 'Glow'], ['accent', 'Accent']],
  K_FONT: 'mkc:lookFont', K_BG: 'mkc:lookBg',
  ls(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); return true; } catch (e) { return false; } },
  apply() {
    const de = document.documentElement, ps = this.PAGES.some(([k]) => k === CFG.pageStyle) ? CFG.pageStyle : 'classic', sb = this.BARS.some(([k]) => k === CFG.seekStyle) ? CFG.seekStyle : 'std';
    this.PAGES.forEach(([k]) => de.classList.toggle(`dp-${k}`, k === ps && k !== 'classic'));
    this.BARS.forEach(([k]) => de.classList.toggle(`sb-${k}`, k === sb && k !== 'std'));
    de.classList.toggle('pd-bigplay', !!CFG.bigPlay); this.bigPlay();
    // own font
    const font = this.ls(this.K_FONT);
    if (font && font !== this._font) {
      this._font = font;
      try { const ff = new FontFace('MKC Own', `url(${font})`); ff.load().then((f) => { document.fonts.add(f); de.classList.add('lk-font'); }).catch(() => { de.classList.remove('lk-font'); toast('That font file could not be read', 'err'); }); } catch (e) { /* no FontFace */ }
    } else if (!font) { this._font = ''; de.classList.remove('lk-font'); }
    // own background picture
    const bg = this.ls(this.K_BG);
    de.classList.toggle('lk-bg', !!bg);
    if (bg) de.style.setProperty('--lk-bg', `url("${bg}")`); else de.style.removeProperty('--lk-bg');
  },
  poster(m) {
    if (CFG.pageStyle !== 'poster' || !m) return '';
    const src = metaPoster(m); return src ? `<div class="d-pst">${imgTag(src, m.name, m.id, { lazy: false })}</div>` : '';
  },
  bigPlay() {
    let b = $('#pBigPlay');
    if (!CFG.bigPlay) { if (b) b.hidden = true; return; }
    if (!b) {
      const hud = $('#hud'); if (!hud) return;
      b = document.createElement('button'); b.id = 'pBigPlay'; b.type = 'button'; b.className = 'p-bigplay'; b.setAttribute('aria-label', 'Play'); b.setAttribute('data-nav', '');
      b.innerHTML = '<i data-lucide="play"></i>'; hud.appendChild(b); icons();
      b.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
      const sync = () => { b.hidden = !CFG.bigPlay || !video.paused || !(video.currentSrc || video.srcObject); };
      video.addEventListener('play', sync); video.addEventListener('pause', sync); video.addEventListener('emptied', sync);
      this._sync = sync;
    }
    if (this._sync) this._sync();
  },
  /* ---- Atelier additions ---- */
  atHtml() {
    const font = !!this.ls(this.K_FONT), bg = !!this.ls(this.K_BG);
    return `<div class="set-row"><div><b>Font and background</b><small>Use your own font file and a picture behind the app. Both stay on this device.</small></div></div>
      <div class="inrow lk-own"><button class="btn btn-ghost btn-sm" type="button" data-nav data-lk="font"><i data-lucide="type"></i>${font ? 'Change font' : 'Use a font file'}</button>${font ? '<button class="btn btn-ghost btn-sm" type="button" data-nav data-lk="nofont"><i data-lucide="x"></i>Remove font</button>' : ''}
        <button class="btn btn-ghost btn-sm" type="button" data-nav data-lk="bg"><i data-lucide="image"></i>${bg ? 'Change picture' : 'Background picture'}</button>${bg ? '<button class="btn btn-ghost btn-sm" type="button" data-nav data-lk="nobg"><i data-lucide="x"></i>Remove picture</button>' : ''}</div>
      <div class="set-row"><div><b>Look files</b><small>A look file keeps your colour, font, picture, film page style and player look, so you can open it on another screen or send it to a friend.</small></div></div>
      <div class="inrow lk-own"><button class="btn btn-ghost btn-sm" type="button" data-nav data-lk="save"><i data-lucide="download"></i>Save look file</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-lk="open"><i data-lucide="folder-open"></i>Open a look file</button></div>`;
  },
  atBind(box) {
    $$('[data-lk]', box).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.lk;
      if (k === 'font') this.pick('.woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf', (f) => this.setFont(f));
      else if (k === 'bg') this.pick('image/*', (f) => this.setBg(f));
      else if (k === 'nofont') { this.ls(this.K_FONT, ''); this.apply(); renderSettingsBody(); toast('Font removed'); }
      else if (k === 'nobg') { this.ls(this.K_BG, ''); this.apply(); renderSettingsBody(); toast('Picture removed'); }
      else if (k === 'save') this.save();
      else if (k === 'open') this.pick('.mklook,application/json,.json', (f) => this.open(f));
    }));
  },
  pick(accept, fn) { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => { const f = i.files && i.files[0]; if (f) fn(f); }; i.click(); },
  read(f) { return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(f); }); },
  async setFont(f) {
    if (f.size > 900 * 1024) { toast('That font file is too big. Pick one under 900 KB (a .woff2 is smallest).', 'err', 5000); return; }
    if (!/\.(woff2?|ttf|otf)$/i.test(f.name)) { toast('Pick a .woff2, .woff, .ttf or .otf file', 'err'); return; }
    const url = (await this.read(f)).replace(/^data:[^;,]*/, `data:font/${f.name.split('.').pop().toLowerCase()}`);
    if (!this.ls(this.K_FONT, url)) { toast('This device has no room left to keep the font', 'err'); return; }
    this._font = ''; this.apply(); renderSettingsBody(); toast('Your font is on', 'ok');
  },
  async setBg(f) {
    try {
      const img = await createImageBitmap(f), s = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.78);
      if (!this.ls(this.K_BG, url)) { toast('This device has no room left to keep the picture', 'err'); return; }
      this.apply(); renderSettingsBody(); toast('Background picture on', 'ok');
    } catch (e) { toast('That picture could not be opened', 'err'); }
  },
  pack() {
    return { kind: 'mklook', v: 1, atelier: typeof Atelier !== 'undefined' ? Atelier.get() : null, look: CFG.look || 'noir', pageStyle: CFG.pageStyle || 'classic', seekStyle: CFG.seekStyle || 'std', bigPlay: !!CFG.bigPlay, font: this.ls(this.K_FONT) || '', bg: this.ls(this.K_BG) || '' };
  },
  save() {
    const blob = new Blob([JSON.stringify(this.pack())], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'my-look.mklook'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Look file saved', 'ok');
  },
  async open(f) {
    try {
      if (f.size > 4 * 1024 * 1024) throw new Error('too big');
      const d = JSON.parse(await f.text()); if (!d || d.kind !== 'mklook') throw new Error('not a look file');
      const pick = (v, list, def) => (list.some(([k]) => k === v) ? v : def);
      if (d.atelier && typeof d.atelier === 'object' && typeof Atelier !== 'undefined') {
        const a = { ...Atelier.def(), ...d.atelier };
        if (typeof a.hue === 'number' && isFinite(a.hue)) a.hue = ((Math.round(a.hue) % 360) + 360) % 360; else delete a.hue;
        if (a.hue != null || (Atelier.SHADOWS.some((x) => x[0] === a.shadow) && Atelier.LIGHTS.some((x) => x[0] === a.light))) Atelier.apply(a, { select: d.look === 'atelier' });
      }
      if (d.look !== 'atelier' && LOOKS[d.look]) setCfg('look', d.look);
      setCfg('pageStyle', pick(d.pageStyle, this.PAGES, 'classic')); setCfg('seekStyle', pick(d.seekStyle, this.BARS, 'std')); setCfg('bigPlay', !!d.bigPlay);
      if (typeof d.font === 'string' && /^data:font\/(woff2?|ttf|otf);base64,[A-Za-z0-9+/=]+$/.test(d.font) && d.font.length < 1.3e6) this.ls(this.K_FONT, d.font);
      if (typeof d.bg === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(d.bg) && d.bg.length < 2.5e6) this.ls(this.K_BG, d.bg);
      this._font = ''; applyAll(); this.apply(); renderSettingsBody(); toast('Look applied', 'ok');
    } catch (e) { toast(`That file didn’t work (${e.message})`, 'err'); }
  },
  /* ---- first start ---- */
  tourHtml() {
    const lk = LOOKS[CFG.look] ? CFG.look : 'noir', cs = CFG.cardSize || 'm', ps = CFG.pageStyle || 'classic';
    const looks = Object.entries(LOOKS).filter(([k]) => k !== 'atelier');
    return `<div class="tw-sec lk-tour"><span class="tw-kicker">Make it yours</span><h2 class="tw-h">Pick your look</h2>
      <div class="lk-t-lab">Theme</div><div class="lk-looks">${looks.map(([k, v]) => `<button type="button" class="lk-lookb${k === lk ? ' on' : ''}" data-nav data-lkt="look" data-v="${k}" style="--l0:${v.l0};--lb:${v.lb};--li:${v.li};--la:${v.la}"><i></i><span>${esc(v.label)}</span></button>`).join('')}</div>
      <div class="lk-t-lab">Posters</div><div class="segc">${[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([k, l]) => `<button type="button" class="${k === cs ? 'on' : ''}" data-nav data-lkt="cards" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="lk-t-lab">Film pages</div><div class="segc lk-wrap">${this.PAGES.map(([k, l]) => `<button type="button" class="${k === ps ? 'on' : ''}" data-nav data-lkt="page" data-v="${k}">${l}</button>`).join('')}</div>
      <p class="tour-note">You can change all of this later in Settings › Appearance.</p></div>`;
  },
  tourBind() {
    $$('#tourBody [data-lkt]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.lkt, v = b.dataset.v;
      if (k === 'look' && LOOKS[v]) setCfg('look', v);
      if (k === 'cards') { setCfg('cardSize', v); applyAll(); }
      if (k === 'page') { setCfg('pageStyle', v); this.apply(); }
      $$(`#tourBody [data-lkt="${k}"]`).forEach((x) => x.classList.toggle('on', x === b));
    }));
  },
  init() {
    if (typeof CFG_HOOKS !== 'undefined') CFG_HOOKS.push((k) => { if (k === 'look') applyAll(); });
    const ap = secById('appearance');
    if (ap && !ap.rows().some((r) => r.key === 'pageStyle')) {
      const rows = ap.rows;
      const bind = ap.bind; ap.bind = () => { if (bind) bind(); const b = $('#setBody'); if (b) this.atBind(b); };
      ap.rows = () => [...rows(), { group: 'Your own look' }, { html: () => this.atHtml() }, { group: 'Film pages' }, { key: 'pageStyle', label: 'Film page style', help: 'How the top of a film or series page looks: a tall picture, a short one, everything centred, the poster beside the title, or no picture at all.', type: 'select', options: this.PAGES, get: () => CFG.pageStyle || 'classic', set: (v) => { setCfg('pageStyle', v); this.apply(); } }];
    }
    const pb = secById('playback');
    if (pb && !pb.rows().some((r) => r.key === 'seekStyle')) {
      const rows = pb.rows;
      pb.rows = () => { const r = rows(), at = r.findIndex((x) => x.key === 'hdrDim'); r.splice(at >= 0 ? at + 1 : r.length, 0,
        { key: 'seekStyle', label: 'Progress bar look', type: 'select', options: this.BARS, get: () => CFG.seekStyle || 'std', set: (v) => { setCfg('seekStyle', v); this.apply(); } },
        { key: 'bigPlay', label: 'Big Play button while paused', help: 'A large Play button in the middle of the picture whenever the film is paused.', type: 'toggle', get: () => !!CFG.bigPlay, set: (v) => { setCfg('bigPlay', v); this.apply(); } }); return r; };
    }
    this.apply();
  },
};
window.MkLookKit = LookKit;
LookKit.init();
