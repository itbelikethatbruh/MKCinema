/* mkcinema.app languages. The page is written in English; this swaps each piece of text for the visitor's language
   (their pick in the menu, else their device language). Words live in /i18n/<code>.json. Nothing is sent anywhere:
   the choice stays in this browser. */
(() => {
  const NAMES = { en: 'English', es: 'Español', pt: 'Português (Brasil)', fr: 'Français', de: 'Deutsch', it: 'Italiano', pl: 'Polski', tr: 'Türkçe', ru: 'Русский', id: 'Bahasa Indonesia', vi: 'Tiếng Việt', tl: 'Filipino', sw: 'Kiswahili', ha: 'Hausa', sm: 'Gagana Samoa', ar: 'العربية', fa: 'فارسی', ur: 'اردو', hi: 'हिन्दी', mr: 'मराठी', bn: 'বাংলা', pa: 'ਪੰਜਾਬੀ', gu: 'ગુજરાતી', ta: 'தமிழ்', te: 'తెలుగు', kn: 'ಕನ್ನಡ', ml: 'മലയാളം', th: 'ไทย', zh: '中文（简体）', ja: '日本語', ko: '한국어' };
  const root = document.documentElement, code = root.getAttribute('data-lang') || 'en';
  const SKIP = '.brand,[translate="no"],code,pre,script,style,svg,textarea,input,select,.lang-pick,#yr';
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  // ---- the picker ----
  const pick = () => {
    const s = document.createElement('select'); s.className = 'lang-pick'; s.setAttribute('aria-label', 'Language'); s.setAttribute('translate', 'no');
    for (const [c, n] of Object.entries(NAMES)) { const o = document.createElement('option'); o.value = c; o.textContent = n; if (c === code) o.selected = true; s.appendChild(o); }
    s.addEventListener('change', () => { try { localStorage.setItem('mkc-lang', s.value); } catch (e) {} location.reload(); });
    return s;
  };
  const head = document.querySelector('.nav-in .gh') || document.querySelector('.bar-in nav .btn');
  if (head) head.parentNode.insertBefore(pick(), head);
  const menu = document.querySelector('#links'); // the phone menu
  if (menu) { const m = pick(); m.classList.add('lang-menu'); menu.appendChild(m); }
  const foot = document.querySelector('.ft-brand') || document.querySelector('footer .wrap');
  if (foot) { const w = document.createElement('div'); w.className = 'lang-foot'; w.appendChild(pick()); foot.appendChild(w); }
  if (code === 'en') return;

  // ---- translating ----
  let U, S, P = [];
  const sig = (e) => e.tagName + '|' + [...e.attributes].map((a) => a.name + '=' + a.value).join('&');
  // swap a paragraph's words while keeping its links and inner elements (and anything listening to them) as they are
  const swap = (el, html) => {
    const t = document.createElement('template'); t.innerHTML = html;
    const pool = new Map(); el.querySelectorAll('*').forEach((o) => { const k = sig(o); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(o); });
    [...t.content.querySelectorAll('*')].reverse().forEach((n) => { const l = pool.get(sig(n)); if (l && l.length) { const o = l.pop(); o.replaceChildren(...n.childNodes); n.replaceWith(o); } });
    el.replaceChildren(t.content);
  };
  const pat = (k) => {
    for (const [re, out] of P) { const m = re.exec(k); if (m) return out.replace(/\{(\d+)\}/g, (_, i) => m[+i + 1] ?? ''); }
    return '';
  };
  const done = new WeakSet();
  const text = (n) => {
    const v = n.nodeValue, k = v && norm(v); if (!k || done.has(n)) return;
    const p = n.parentElement; if (!p || p.closest(SKIP)) return;
    const t = S[k] || pat(k); if (!t || t === k) return;
    done.add(n); n.nodeValue = v.replace(v.trim(), t);
    if (rtl) p.setAttribute('data-rtl', '');
  };
  const attrs = (el) => {
    for (const a of ['alt', 'aria-label', 'title', 'placeholder']) {
      const v = el.getAttribute(a); if (!v || el.closest(SKIP)) continue;
      const t = S[norm(v)] || pat(norm(v)); if (t && t !== v) el.setAttribute(a, t);
    }
  };
  const walk = (r) => {
    if (r.nodeType === 3) return text(r);
    if (r.nodeType !== 1 || r.closest(SKIP)) return;
    const els = [r, ...r.querySelectorAll('*')];
    for (const el of els) {
      if (done.has(el) || !el.isConnected || el.closest(SKIP)) continue;
      const h = U[norm(el.innerHTML)];
      if (h) { done.add(el); swap(el, h); el.querySelectorAll('*').forEach((x) => done.add(x)); if (rtl) el.setAttribute('data-rtl', ''); }
    }
    const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) text(n);
    els.forEach((el) => el.hasAttribute && attrs(el));
  };
  const rtl = /^(ar|fa|ur)$/.test(code);
  const show = () => root.classList.remove('i18n-wait');
  (window.__sl || fetch(`/i18n/${code}.json`)).then((r) => r.json()).then((d) => {
    U = d.units || {}; S = d.strings || {};
    P = Object.entries(d.patterns || {}).map(([en, out]) => {
      const parts = en.split(/\{\d+\}/);
      return [new RegExp('^' + parts.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$'), out];
    });
    root.lang = code === 'pt' ? 'pt-BR' : code === 'zh' ? 'zh-Hans' : code;
    if (S[norm(document.title)]) document.title = S[norm(document.title)];
    document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"]').forEach((m) => { const t = S[norm(m.content)]; if (t) m.content = t; });
    walk(document.body); show();
    new MutationObserver((ms) => { for (const m of ms) {
      if (m.type === 'childList') m.addedNodes.forEach((n) => { if (n.nodeType === 3 && done.has(n)) return; done.delete(n); walk(n); });
      else if (m.type === 'characterData') { done.delete(m.target); text(m.target); }
    } }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }).catch(show);
})();
