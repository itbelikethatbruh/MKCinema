/* ---------------- 2.15.0 Interface languages ----------------
   Menus, buttons, settings and messages in Spanish, Portuguese (Brazil), French, German or Italian. "Match this
   device" (the default) follows the phone, TV or browser language. Titles, descriptions and stream names come from
   your addons and stay exactly as they send them. The words live in i18n/<code>.json; text that has no translation
   yet stays in English. The page is translated as it is drawn: each piece of interface text is looked up in the
   language's list and swapped in place, so the app's own code keeps working in English underneath. */
const I18N = {
  langs: { en: 'English', es: 'Español', pt: 'Português (Brasil)', fr: 'Français', de: 'Deutsch', it: 'Italiano' },
  code: 'en', map: null, done: new WeakMap(), orig: new WeakMap(), attrDone: new WeakMap(),
  SKIP: '.card-title,.hero-title,.hero-desc,.d-desc,h1,.stream .t1,.stream .t2,.s-meta,#pTitle,#pSub,pre,code,textarea,input,select.inp-raw,[translate="no"],[data-card] .card-sub,.dl-main b,#set-uiLang option',
  ATTRS: ['placeholder', 'aria-label', 'title'],
  pick() {
    const c = CFG.uiLang || 'auto';
    if (c !== 'auto') return this.langs[c] ? c : 'en';
    const n = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']).map((x) => String(x).slice(0, 2).toLowerCase()).find((x) => this.langs[x]);
    return n || 'en';
  },
  skip(el) { return !el || !!el.closest(this.SKIP); },
  node(n) {
    const v = n.nodeValue;
    if (!v || v === this.done.get(n)) return;
    const k = v.trim(); if (!k || k.length > 400) return;
    const t = this.map.get(k); if (!t || t === k) return;
    const p = n.parentElement; if (this.skip(p)) return;
    const nv = v.replace(k, t);
    this.orig.set(n, v); this.done.set(n, nv); n.nodeValue = nv;
  },
  attrs(el) {
    if (el.nodeType !== 1) return;
    for (const a of this.ATTRS) {
      const v = el.getAttribute(a); if (!v) continue;
      const seen = this.attrDone.get(el); if (seen && seen[a] === v) continue;
      const t = this.map.get(v.trim()); if (!t || t === v) continue;
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
  t(s) { return (this.map && this.map.get(s)) || s; },
  async init() {
    this.code = this.pick();
    document.documentElement.lang = this.code === 'pt' ? 'pt-BR' : this.code;
    if (this.code !== 'en') {
      try {
        const r = await (window.__i18nP || fetch(`i18n/${this.code}.json`));
        const d = await (r.clone ? r.clone() : r).json();
        this.map = new Map(Object.entries(d.strings || {}));
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
