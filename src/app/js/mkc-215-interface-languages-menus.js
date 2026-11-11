
/* ---------------- 2.15.0 Interface languages ----------------
   Menus, buttons, settings and messages in Spanish, Portuguese (Brazil), French, German, Italian, Hindi, Tamil, Telugu,
   Bengali, Malayalam or Samoan (2.47). "Match this
   device" (the default) follows the phone, TV or browser language. Titles, descriptions and stream names come from
   your addons and stay exactly as they send them. The words live in i18n/<code>.json; text that has no translation
   yet stays in English. The page is translated as it is drawn: each piece of interface text is looked up in the
   language's list and swapped in place, so the app's own code keeps working in English underneath. */
const I18N = {
  langs: { en: 'English', es: 'Español', pt: 'Português (Brasil)', fr: 'Français', de: 'Deutsch', it: 'Italiano', hi: 'हिन्दी', ta: 'தமிழ்', te: 'తెలుగు', bn: 'বাংলা', ml: 'മലയാളം', sm: 'Gagana Samoa', zh: '中文（简体）', ar: 'العربية', ru: 'Русский', ur: 'اردو', id: 'Bahasa Indonesia', ja: '日本語', mr: 'मराठी', tr: 'Türkçe', vi: 'Tiếng Việt', ko: '한국어', fa: 'فارسی', tl: 'Filipino', sw: 'Kiswahili', pa: 'ਪੰਜਾਬੀ', gu: 'ગુજરાતી', th: 'ไทย', pl: 'Polski', kn: 'ಕನ್ನಡ', ha: 'Hausa' },
  RTL: { ar: 1, ur: 1, fa: 1 }, ALIAS: { fil: 'tl', in: 'id', iw: 'he' }, pats: null,
  code: 'en', map: null, done: new WeakMap(), orig: new WeakMap(), attrDone: new WeakMap(),
  SKIP: '.card-title,.hero-title,.hero-desc,.d-desc,h1,.stream .t1,.stream .t2,.s-meta,#pTitle,#pSub,pre,code,textarea,input,select.inp-raw,[translate="no"],[data-card] .card-sub,.dl-main b,#set-uiLang option,.brand,.sd-brand',
  ATTRS: ['placeholder', 'aria-label', 'title'],
  pick() {
    const c = CFG.uiLang || 'auto';
    if (c !== 'auto') return this.langs[c] ? c : 'en';
    const n = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']).map((x) => { const b = String(x).toLowerCase().split('-')[0]; return this.ALIAS[b] || b; }).find((x) => this.langs[x]);
    return n || 'en';
  },
  skip(el) { return !el || !!el.closest(this.SKIP); },
  node(n) {
    const v = n.nodeValue;
    if (!v || v === this.done.get(n)) return;
    const k = v.trim(); if (!k || k.length > 400) return;
    const t = this.map.get(k) || this.pat(k); if (!t || t === k) return;
    const p = n.parentElement; if (this.skip(p)) return;
    const nv = v.replace(k, t);
    this.orig.set(n, v); this.done.set(n, nv); n.nodeValue = nv;
    if ((this.SCRIPT[this.code] || this.CJK[this.code]) && !p.hasAttribute('data-deva')) p.setAttribute('data-deva', ''); // see deva()
    if (this.RTL[this.code] && !p.hasAttribute('data-rtl')) p.setAttribute('data-rtl', '');
  },
  attrs(el) {
    if (el.nodeType !== 1) return;
    for (const a of this.ATTRS) {
      const v = el.getAttribute(a); if (!v) continue;
      const seen = this.attrDone.get(el); if (seen && seen[a] === v) continue;
      const t = this.map.get(v.trim()) || this.pat(v.trim()); if (!t || t === v) continue;
      if (el.hasAttribute('data-card') || this.skip(el)) continue;
      el.setAttribute(a, t); this.attrDone.set(el, { ...(seen || {}), [a]: t });
    }
  },
  walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { this.node(root); return; }
    if (root.nodeType !== 1 || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(root.tagName)) return;
    this.attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) this.node(n);
    root.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => this.attrs(el));
  },
  // the English a piece of the page had before it was translated (for the few checks that read text back)
  en(el) {
    if (!el) return '';
    if (!this.map) return el.textContent;
    let s = ''; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) s += n.nodeValue === this.done.get(n) ? this.orig.get(n) : n.nodeValue;
    return s;
  },
  t(s) { return (this.map && (this.map.get(s) || this.pat(s))) || s; },
  // Patterns are indexed by their first four fixed letters (or last four when they start with a gap), so a text
  // is only tried against the handful of patterns that could fit it. Kept fast for TVs.
  pat(k) {
    const P = this.pats; if (!P || k.length < 4) return '';
    const L = [...(P.head.get(k.slice(0, 4)) || []), ...(P.tail.get(k.slice(-4)) || [])];
    for (const [re, out] of L) { const m = re.exec(k); if (m) return out.replace(/\{(\d+)\}/g, (_, i) => m[+i + 1] ?? ''); }
    return '';
  },
  loadPats(obj) {
    const head = new Map(), tail = new Map(); let n = 0;
    for (const [en, out] of Object.entries(obj || {})) {
      const parts = en.split(/\{\d+\}/); const lead = parts[0], end = parts[parts.length - 1];
      const key = lead.length >= 4 ? ['h', lead.slice(0, 4)] : end.length >= 4 ? ['t', end.slice(-4)] : null; if (!key) continue;
      const re = new RegExp('^' + parts.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$');
      // the translation refers to gaps by number; the regex captures them in English order
      const order = [...en.matchAll(/\{(\d+)\}/g)].map((m) => +m[1]);
      const fixed = out.replace(/\{(\d+)\}/g, (_, i) => `{${order.indexOf(+i)}}`);
      const M = key[0] === 'h' ? head : tail; if (!M.has(key[1])) M.set(key[1], []); M.get(key[1]).push([re, fixed]); n++;
    }
    this.pats = n ? { head, tail } : null;
  },
  // Chinese, Japanese and Korean use the system's own fonts (every phone, TV and computer has them); they only need
  // the small-caps letter-spacing taken off.
  CJK: { zh: 1, ja: 1, ko: 1, th: 1 },
  // Indian scripts: the app's fonts (Onest, Sora, Fraunces, JetBrains Mono…) have no Devanagari, Tamil, Telugu, Bengali
  // or Malayalam letters, and some systems (Linux, some TVs) have no font to fall back to. Each web font the app loads
  // gets the matching Noto Sans font added for that script's range only, so Latin text keeps its own font and the
  // letters never show as boxes. Samoan is written in Latin letters and needs nothing.
  SCRIPT: {
    hi: ['Noto Sans Devanagari', 'devanagari', 'U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF', ['Noto Sans Devanagari', 'NotoSansDevanagari-Regular', 'Nirmala UI', 'Kohinoor Devanagari']],
    ta: ['Noto Sans Tamil', 'tamil', 'U+0B82-0BFA, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Tamil', 'NotoSansTamil-Regular', 'Nirmala UI', 'Tamil Sangam MN', 'Latha']],
    te: ['Noto Sans Telugu', 'telugu', 'U+0C00-0C7F, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Telugu', 'NotoSansTelugu-Regular', 'Nirmala UI', 'Kohinoor Telugu', 'Gautami']],
    bn: ['Noto Sans Bengali', 'bengali', 'U+0980-09FE, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Bengali', 'NotoSansBengali-Regular', 'Nirmala UI', 'Kohinoor Bangla', 'Vrinda']],
    mr: ['Noto Sans Devanagari', 'devanagari', 'U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF', ['Noto Sans Devanagari', 'NotoSansDevanagari-Regular', 'Nirmala UI', 'Kohinoor Devanagari']],
    gu: ['Noto Sans Gujarati', 'gujarati', 'U+0A80-0AFF, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Gujarati', 'NotoSansGujarati-Regular', 'Nirmala UI', 'Gujarati Sangam MN', 'Shruti']],
    pa: ['Noto Sans Gurmukhi', 'gurmukhi', 'U+0A00-0A7F, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Gurmukhi', 'NotoSansGurmukhi-Regular', 'Nirmala UI', 'Gurmukhi MN', 'Raavi']],
    kn: ['Noto Sans Kannada', 'kannada', 'U+0C80-0CF3, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Kannada', 'NotoSansKannada-Regular', 'Nirmala UI', 'Kannada Sangam MN', 'Tunga']],
    ar: ['Noto Sans Arabic', 'arabic', 'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0898-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC', ['Noto Sans Arabic', 'NotoSansArabic-Regular', 'Segoe UI', 'Geeza Pro']],
    ur: ['Noto Sans Arabic', 'arabic', 'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0898-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC', ['Noto Sans Arabic', 'NotoSansArabic-Regular', 'Segoe UI', 'Geeza Pro']],
    fa: ['Noto Sans Arabic', 'arabic', 'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0898-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC', ['Noto Sans Arabic', 'NotoSansArabic-Regular', 'Segoe UI', 'Geeza Pro']],
    ml: ['Noto Sans Malayalam', 'malayalam', 'U+0D00-0D7F, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Malayalam', 'NotoSansMalayalam-Regular', 'Nirmala UI', 'Malayalam Sangam MN', 'Kartika']],
  },
  async deva() {
    const [fam, sub, range0, locals] = this.SCRIPT[this.code];
    // Letter-spacing pulls these letters apart (the app tracks its small caps labels), so translated text gets none.
    const ls = document.createElement('style'); ls.textContent = '[data-deva]{letter-spacing:0!important}'; document.head.appendChild(ls);
    let url = '', range = range0;
    try {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam.replace(/ /g, '+')}:wght@100..900&display=swap`)).text();
      const b = css.split(`/* ${sub} */`)[1] || '';
      url = (b.match(/url\((https:[^)]+)\)/) || [])[1] || '';
      range = (b.match(/unicode-range:\s*([^;]+);/) || [])[1] || range;
    } catch (e) {}
    const st = document.createElement('style'); st.id = 'mkc-deva'; document.head.appendChild(st);
    const seen = new Set();
    const scan = () => {
      const fams = [];
      document.querySelectorAll('link[href*="fonts.googleapis.com"]').forEach((l) => {
        for (const m of l.href.matchAll(/family=([^:&]+)/g)) fams.push(decodeURIComponent(m[1]).replace(/\+/g, ' '));
      });
      const add = fams.filter((f) => !/^Noto Sans (Devanagari|Tamil|Telugu|Bengali|Malayalam|Gujarati|Gurmukhi|Arabic|Kannada)$/i.test(f) && !seen.has(f));
      if (!add.length) return;
      add.forEach((f) => seen.add(f));
      const src = [url && `url(${url}) format('woff2')`, ...locals.map((n) => `local('${n}')`)].filter(Boolean).join(', ');
      st.textContent = [...seen].map((f) => `@font-face{font-family:"${f}";font-style:normal;font-weight:100 900;font-display:swap;src:${src};unicode-range:${range}}`).join('\n');
    };
    scan();
    new MutationObserver(scan).observe(document.head, { childList: true });
  },
  async init() {
    this.code = this.pick();
    document.documentElement.lang = this.code === 'pt' ? 'pt-BR' : this.code;
    if (this.SCRIPT[this.code]) this.deva();
    else if (this.CJK[this.code]) { const ls = document.createElement('style'); ls.textContent = '[data-deva]{letter-spacing:0!important}'; document.head.appendChild(ls); }
    // Arabic, Urdu and Persian: each translated text reads right to left in its own box. The screens keep their
    // layout (the player, rows and remote stay where people expect them), so nothing moves under a TV remote.
    if (this.RTL[this.code]) { const rs = document.createElement('style'); rs.textContent = '[data-rtl]{unicode-bidi:plaintext}'; document.head.appendChild(rs); }
    if (this.code !== 'en') {
      try {
        const r = await (window.__i18nP || fetch(`i18n/${this.code}.json`));
        const d = await (r.clone ? r.clone() : r).json();
        this.map = new Map(Object.entries(d.strings || {}));
        this.loadPats(d.patterns);
      } catch (e) { this.map = null; }
      if (this.map && this.map.size) {
        this.walk(document.body);
        new MutationObserver((ms) => {
          for (const m of ms) {
            if (m.type === 'childList') m.addedNodes.forEach((n) => this.walk(n));
            else if (m.type === 'characterData') this.node(m.target);
            else if (m.type === 'attributes') this.attrs(m.target);
          }
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: this.ATTRS });
      } else this.map = null;
    }
    // Settings › Appearance › Language
    const sec = SECTIONS.find((x) => x.id === 'appearance');
    if (sec) {
      const rows = sec.rows;
      sec.rows = () => [{ key: 'uiLang', label: 'Language', help: 'Menus, buttons and settings. Titles and descriptions come from your addons and stay in the language they send.', type: 'select',
        options: [['auto', `${this.t('Match this device')} (${this.langs[this.pickAuto()]})`], ...Object.entries(this.langs)], get: () => CFG.uiLang || 'auto',
        set: (v) => { setCfg('uiLang', v); toast('Changing the language…', 'info', 2000); setTimeout(() => location.reload(), 350); } }, ...rows()];
    }
  },
  pickAuto() { const keep = CFG.uiLang; CFG.uiLang = 'auto'; const c = this.pick(); CFG.uiLang = keep; return c; },
};
window.i18nEn = (el) => I18N.en(el);
I18N.init();
