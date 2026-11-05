/* ---------------- Atelier: make your own theme ----------------
   Pick a colour for the blacks, a colour for the small highlights, how strongly they show, a type pairing and corner
   shape. Atelier recolours the same tokens the four built-in themes use, with the same lightness for every surface, so
   contrast, focus rings and the TV light-on-dark rules hold whatever is picked. Video stays true black. A theme travels
   as a short code (export and import) and syncs with the account like any setting. No new effects. */
const Atelier = {
  SHADOWS: [['graphite', 'Graphite', 0, 0], ['ink', 'Ink', 222, 0.42], ['slate', 'Slate', 208, 0.2], ['teal', 'Teal', 188, 0.38], ['forest', 'Forest', 150, 0.3], ['plum', 'Plum', 285, 0.32], ['oxblood', 'Oxblood', 346, 0.36], ['umber', 'Umber', 30, 0.3]],
  LIGHTS: [['platinum', 'Platinum', 0, 0], ['ice', 'Ice', 214, 0.42], ['mint', 'Mint', 160, 0.4], ['champagne', 'Champagne', 42, 0.38], ['rose', 'Rose gold', 18, 0.4], ['amber', 'Amber', 38, 0.62], ['lilac', 'Lilac', 270, 0.38], ['coral', 'Coral', 8, 0.55]],
  FONTS: { modern: ['Modern', '"Sora",system-ui,sans-serif', '"Onest",system-ui,sans-serif'], classic: ['Classic', '"Fraunces",Georgia,serif', '"Onest",system-ui,sans-serif'], system: ['System', 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'] },
  CORNERS: { sharp: ['Sharp', 4, 6, 10], soft: ['Soft', 8, 10, 18], round: ['Round', 12, 16, 26] },
  def: () => ({ shadow: 'ink', light: 'champagne', strength: 'rich', font: 'modern', corners: 'soft' }),
  get() { return { ...this.def(), ...(CFG.atelier || {}) }; },
  /* colour maths, the same as the built-in themes */
  rgb2hls(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, l, 0]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h / 6, l, s]; },
  hls2rgb(h, l, s) { if (!s) return [l, l, l].map((x) => Math.round(x * 255)); const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255)); },
  params(a) {
    const sh = this.SHADOWS.find((x) => x[0] === a.shadow) || this.SHADOWS[1], li = this.LIGHTS.find((x) => x[0] === a.light) || this.LIGHTS[3];
    const k = a.strength === 'subtle' ? 0.55 : 1;
    return { hd: sh[2], sd: sh[3] * k, lift: sh[3] ? 0.034 * k : 0.012, sl: sh[3] ? 0.2 * k : 0, ha: li[2], sa: li[3] * (a.strength === 'subtle' ? 0.7 : 1) };
  },
  themed([r, g, b], t) {
    const [, l] = this.rgb2hls(r, g, b), warm = l > 0.35 && r - b >= 8;
    let hue, sat; if (warm) { hue = t.ha; sat = t.sa; } else { hue = t.hd; const q = Math.min(1, Math.max(0, (l - 0.2) / 0.4)); sat = t.sd + (t.sl - t.sd) * q; }
    const l2 = l < 0.5 ? t.lift + l * (1 - t.lift) : l;
    return this.hls2rgb(hue / 360, l2, sat);
  },
  tokens() {
    if (this._tok) return this._tok;
    const css = ($('#looks') || {}).textContent || '', rule = (css.match(/html\[data-look="midnight"\]\{([^}]*)\}/) || [])[1] || '';
    return (this._tok = [...new Set([...rule.matchAll(/(--n([0-9a-f]{6})):/g)].map((m) => m[2]))]);
  },
  css(a) {
    const t = this.params(a), hex = (c) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
    const decl = this.tokens().map((h) => { const c = this.themed([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)), t); return `--n${h}:${hex(c)};--n${h}-c:${c.join(',')}`; });
    const f = this.FONTS[a.font] || this.FONTS.modern, r = this.CORNERS[a.corners] || this.CORNERS.soft;
    decl.push(`--f-display:${f[1]}`, `--f-body:${f[2]}`, `--r-s:${r[1]}px`, `--r-m:${r[2]}px`, `--r-l:${r[3]}px`);
    const sw = (rgb) => hex(this.themed(rgb, t));
    this.swatch = { l0: sw([0, 0, 0]), lb: sw([17, 17, 19]), li: sw([242, 242, 243]), la: sw([217, 212, 199]) };
    return `html[data-look="atelier"]{${decl.join(';')}}`;
  },
  apply(a, { select = true } = {}) {
    const css = this.css(a);
    let st = $('#atelier'); if (!st) { st = document.createElement('style'); st.id = 'atelier'; document.head.appendChild(st); }
    st.textContent = css;
    try { localStorage.setItem('mkc:atelierCss', JSON.stringify(css)); } catch (e) { /* blocked */ }
    LOOKS.atelier = { label: 'Atelier', blurb: 'Your own colours, type and corners.', ...this.swatch, meta: this.swatch.l0 };
    CFG.atelier = a; saveCfg();
    if (select) setCfg('look', 'atelier'); else applyAll();
    Account.schedule();
  },
  code(a) { return `MKA1.${X8.b64e(a)}`; },
  html() {
    const a = this.get(), on = CFG.look === 'atelier';
    const sw = (list, key) => list.map(([id, label, h, s]) => { const c = this.hls2rgb(h / 360, key === 'shadow' ? 0.22 : 0.74, s || 0); return `<button type="button" data-nav data-at="${key}" data-v="${id}" class="at-sw ${a[key] === id ? 'on' : ''}" style="--c:rgb(${c.join(',')})" title="${esc(label)}"><i></i><span>${esc(label)}</span></button>`; }).join('');
    const seg = (key, obj) => `<div class="segc">${Object.entries(obj).map(([id, v]) => `<button type="button" data-nav data-at="${key}" data-v="${id}" class="${a[key] === id ? 'on' : ''}">${esc(v[0])}</button>`).join('')}</div>`;
    return `<div class="atelier" id="atelierBox"><div class="at-head"><div><b>Atelier</b><small>${on ? 'Your own theme is on. Every change shows straight away.' : 'Make your own theme. The first change switches it on.'}</small></div>
        <div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav id="atCopy"><i data-lucide="copy"></i>Copy code</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="atImp"><i data-lucide="download"></i>Use a code</button></div></div>
      <div class="at-lab">Blacks</div><div class="at-sws">${sw(this.SHADOWS, 'shadow')}</div>
      <div class="at-lab">Highlights</div><div class="at-sws">${sw(this.LIGHTS, 'light')}</div>
      <div class="at-grid"><div><div class="at-lab">Strength</div><div class="segc">${[['subtle', 'Subtle'], ['rich', 'Rich']].map(([id, l]) => `<button type="button" data-nav data-at="strength" data-v="${id}" class="${a.strength === id ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div><div class="at-lab">Type</div>${seg('font', this.FONTS)}</div><div><div class="at-lab">Corners</div>${seg('corners', this.CORNERS)}</div></div>
      <div class="inrow at-imp" id="atImpRow" hidden><input class="inp mono" id="atCode" placeholder="MKA1.…" autocomplete="off" spellcheck="false"><button class="btn btn-prime btn-sm" type="button" data-nav id="atCodeGo">Use</button></div></div>`;
  },
  bind() {
    const box = $('#atelierBox'); if (!box) return;
    $$('[data-at]', box).forEach((b) => b.addEventListener('click', () => { const a = this.get(); a[b.dataset.at] = b.dataset.v; this.apply(a); renderSettingsBody(); const n = $(`#atelierBox [data-at="${b.dataset.at}"][data-v="${b.dataset.v}"]`); if (n && IS_TV) Nav.focus(n, true); }));
    $('#atCopy').onclick = () => { copyText(this.code(this.get())); };
    $('#atImp').onclick = () => { $('#atImpRow').hidden = false; if (!TOUCH_UI) $('#atCode').focus(); if (IS_TV) Nav.settle(); };
    $('#atCode').addEventListener('keydown', (e) => e.stopPropagation());
    $('#atCodeGo').onclick = () => {
      try { const raw = $('#atCode').value.trim(); if (!raw.startsWith('MKA1.')) throw new Error('not an Atelier code'); const a = { ...this.def(), ...X8.b64d(raw.slice(5)) };
        ['shadow', 'light'].forEach((k) => { if (!(k === 'shadow' ? this.SHADOWS : this.LIGHTS).some((x) => x[0] === a[k])) throw new Error('unknown colour'); });
        this.apply(a); renderSettingsBody(); toast('Theme applied', 'ok'); } catch (e) { toast(`That code did not work (${e.message})`, 'err'); }
    };
  },
  init() {
    if (CFG.atelier || CFG.look === 'atelier') { try { this.css(this.get()); LOOKS.atelier = { label: 'Atelier', blurb: 'Your own colours, type and corners.', ...this.swatch, meta: this.swatch.l0 }; if (!$('#atelier')) this.apply(this.get(), { select: false }); } catch (e) { console.warn('atelier', e); } }
    const sec = secById('appearance'); if (!sec) return;
    const rows = sec.rows, bind = sec.bind;
    sec.rows = () => { const r = rows(), i = r.findIndex((d) => d.html === lookHTML); const add = { html: () => this.html() }; if (i >= 0) r.splice(i + 1, 0, add); else r.unshift(add); return [...r, { group: 'For power users' }, { html: () => CustomCss.html() }]; };
    sec.bind = () => { if (bind) bind(); this.bind(); CustomCss.bind(); };
  },
};

/* Custom CSS: for people who want to restyle one detail. Kept in settings (so it syncs) and added last */
const CustomCss = {
  apply() { let st = $('#customCss'); if (!st) { st = document.createElement('style'); st.id = 'customCss'; document.head.appendChild(st); } st.textContent = String(CFG.customCss || '').replace(/<\/?style[^>]*>/gi, ''); },
  html() { return `<div class="set-row x8-css"><div><b>Custom CSS</b><small>Added after MKCinema’s own styles on this account. Clear it if something looks wrong.</small></div></div><textarea class="inp mono x8-ta" id="ccss" rows="5" spellcheck="false" placeholder=".row-title { letter-spacing: .02em }">${esc(CFG.customCss || '')}</textarea><div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-nav id="ccssGo"><i data-lucide="check"></i>Apply</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="ccssClr"><i data-lucide="eraser"></i>Clear</button></div>`; },
  bind() {
    const t = $('#ccss'); if (!t) return; t.addEventListener('keydown', (e) => e.stopPropagation());
    $('#ccssGo').onclick = () => { setCfg('customCss', t.value.slice(0, 20000)); this.apply(); toast('Custom CSS applied', 'ok'); };
    $('#ccssClr').onclick = () => { t.value = ''; setCfg('customCss', ''); this.apply(); toast('Custom CSS cleared'); };
  },
};
Atelier.init();
if (CFG.customCss) CustomCss.apply();
CFG_HOOKS.push((k) => { if (k === 'customCss') CustomCss.apply(); });
