
/* ---------------- 2.27.0 App fonts ----------------
   Settings › Appearance › Font. Each choice pairs a display face (titles, headings) with a readable body face.
   All are free OFL fonts from Google Fonts, fetched only when chosen. The logo, the intro title and subtitles
   keep their own fonts. The head script sets html[data-font] and the stylesheet before the first paint. */
const AppFont = {
  LIST: {"studio": {"label": "Studio", "d": "'Sora',sans-serif", "b": "'Onest',sans-serif", "q": null, "bold": false}, "editorial": {"label": "Editorial", "d": "'Bodoni Moda',serif", "b": "'Manrope',sans-serif", "q": "Bodoni+Moda:opsz,wght@6..96,400..900&family=Manrope:wght@400..800", "bold": false}, "classic": {"label": "Classic", "d": "'DM Serif Display',serif", "b": "'DM Sans',sans-serif", "q": "DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400..700", "bold": false}, "wide": {"label": "Wide", "d": "'Unbounded',sans-serif", "b": "'Inter',sans-serif", "q": "Unbounded:wght@400..800&family=Inter:opsz,wght@14..32,400..700", "bold": false}, "condensed": {"label": "Condensed", "d": "'Oswald',sans-serif", "b": "'Barlow',sans-serif", "q": "Oswald:wght@400..700&family=Barlow:wght@400;500;600;700", "bold": false}, "rounded": {"label": "Rounded", "d": "'Nunito',sans-serif", "b": "'Nunito',sans-serif", "q": "Nunito:wght@400..900", "bold": false}, "deco": {"label": "Deco", "d": "'Josefin Sans',sans-serif", "b": "'Jost',sans-serif", "q": "Josefin+Sans:wght@300..700&family=Jost:wght@400..700", "bold": false}, "slab": {"label": "Slab", "d": "'Zilla Slab',serif", "b": "'IBM Plex Sans',sans-serif", "q": "Zilla+Slab:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600;700", "bold": false}, "techno": {"label": "Techno", "d": "'Chakra Petch',sans-serif", "b": "'Barlow',sans-serif", "q": "Chakra+Petch:wght@400;600;700&family=Barlow:wght@400;500;600;700", "bold": false}, "groovy": {"label": "Groovy", "d": "'Shrikhand',sans-serif", "b": "'Onest',sans-serif", "q": "Shrikhand", "bold": true}, "bubble": {"label": "Bubble", "d": "'Bagel Fat One',sans-serif", "b": "'Onest',sans-serif", "q": "Bagel+Fat+One", "bold": true}, "graffiti": {"label": "Graffiti", "d": "'Sedgwick Ave Display',sans-serif", "b": "'Onest',sans-serif", "q": "Sedgwick+Ave+Display", "bold": true}, "gothic": {"label": "Gothic", "d": "'Pirata One',sans-serif", "b": "'Onest',sans-serif", "q": "Pirata+One", "bold": true}, "street": {"label": "Street", "d": "'Bungee',sans-serif", "b": "'Onest',sans-serif", "q": "Bungee", "bold": true}, "outline": {"label": "Outline", "d": "'Rampart One',sans-serif", "b": "'Onest',sans-serif", "q": "Rampart+One", "bold": true}, "drip": {"label": "Drip", "d": "'Rubik Wet Paint',sans-serif", "b": "'Onest',sans-serif", "q": "Rubik+Wet+Paint", "bold": true}, "heavy": {"label": "Heavy", "d": "'Climate Crisis',sans-serif", "b": "'Onest',sans-serif", "q": "Climate+Crisis", "bold": true}, "brush": {"label": "Brush", "d": "'Kaushan Script',sans-serif", "b": "'Onest',sans-serif", "q": "Kaushan+Script", "bold": true}},
  cur() { return this.LIST[CFG.font] ? CFG.font : 'studio'; },
  url(q) { return `https://fonts.googleapis.com/css2?family=${q}&display=swap`; },
  apply() {
    const id = this.cur(), de = document.documentElement, f = this.LIST[id];
    let l = document.getElementById('mkcFont');
    if (!f.q) { de.removeAttribute('data-font'); if (l) l.remove(); }
    else {
      if (!l) { l = document.createElement('link'); l.rel = 'stylesheet'; l.id = 'mkcFont'; document.head.appendChild(l); }
      const u = this.url(f.q); if (l.getAttribute('href') !== u) l.href = u;
      de.setAttribute('data-font', id);
    }
    const ts = CFG.textScale >= 85 && CFG.textScale <= 130 ? CFG.textScale : 100;
    const tsv = ts / 100 * (window.__mkBoost ? window.__mkBoost() : 1); if (tsv === 1) de.style.removeProperty('--ts'); else de.style.setProperty('--ts', String(+tsv.toFixed(3)));
    // tab labels change width with the font: refit the top menu once the faces arrive
    const refit = () => { if (typeof DockFit !== 'undefined') DockFit.run(); };
    refit(); try { document.fonts.ready.then(refit); setTimeout(refit, 1200); } catch (e) { refit(); }
  },
  // previews in Settings: every face, cut down to the few letters each card shows
  preview() {
    if (document.getElementById('mkcFontPv')) return;
    const fams = Object.values(this.LIST).filter((f) => f.q).map((f) => f.q).join('&family=');
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.id = 'mkcFontPv';
    l.href = `https://fonts.googleapis.com/css2?family=${fams}&display=swap&text=${encodeURIComponent('Film nightAaBbGg Studio Editorial Classic Wide Condensed Rounded Deco Slab Techno')}`;
    document.head.appendChild(l);
  },
  html() {
    const cur = this.cur();
    const card = ([id, f]) => `<button type="button" class="fnt-opt${id === cur ? ' on' : ''}" data-nav data-font="${id}" role="radio" aria-checked="${id === cur}"><span class="fs" style="font-family:${f.d}">Film night</span><span class="fb">${f.label}</span></button>`;
    const all = Object.entries(this.LIST), clean = all.filter(([, f]) => !f.bold), bold = all.filter(([, f]) => f.bold);
    return `<div class="fnt-box" role="radiogroup" aria-label="Font"><div class="fnt-grid">${clean.map(card).join('')}</div><p class="fnt-sub">Bold headings (your text stays easy to read)</p><div class="fnt-grid">${bold.map(card).join('')}</div></div>`;
  },
  bind() {
    const box = $('#setBody .fnt-box'); if (!box) return;
    this.preview();
    $$('[data-font]', box).forEach((b) => b.addEventListener('click', () => {
      setCfg('font', b.dataset.font);
      $$('[data-font]', box).forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
    }));
  },
  init() {
    const ap = secById('appearance');
    if (ap) {
      const rows = ap.rows;
      ap.rows = () => {
        const r = typeof rows === 'function' ? rows() : rows;
        const i = r.findIndex((d) => d && d.group === 'Text');
        const add = [{ group: 'Font' }, { html: () => this.html() }, { key: 'textScale', label: 'Text size', help: 'Makes every word in the app bigger or smaller. Subtitles keep their own size in Playback.', type: 'range', min: 85, max: 130, step: 5, live: true, fmt: (v) => `${v}%` }];
        return i < 0 ? [...r, ...add] : [...r.slice(0, i), ...add, ...r.slice(i)];
      };
      const bind = ap.bind;
      ap.bind = () => { if (bind) bind(); this.bind(); };
    }
    if (!(CFG.textScale >= 85 && CFG.textScale <= 130)) CFG.textScale = 100;
    CFG_HOOKS.push((k) => { if (k === 'font' || k === 'textScale') this.apply(); });
    // a font picked on another device arrives with the account settings
    if (typeof applyAll === 'function') { const aa = applyAll; window.applyAll = function () { const r = aa.apply(this, arguments); try { AppFont.apply(); } catch (e) { /* cosmetic */ } return r; }; }
    this.apply();
  },
};
AppFont.init();
