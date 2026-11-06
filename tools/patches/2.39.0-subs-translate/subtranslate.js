/* ---------------- Subtitle translation ----------------
   Uses the browser's own Translator (Chrome, Edge) when it has the language pair. Everywhere else (Firefox, Safari,
   the Android and TV apps) the lines go to MKCinema's translation service (SubCloud, 2.39.0) in small batches just
   ahead of the playhead. Original lines are kept, so stopping puts them back. */
const SubTranslate = {
  on: false, tr: null, from: '', to: '', engine: '', orig: new WeakMap(), timer: 0, busy: false,
  api: () => typeof self.Translator !== 'undefined',
  target() { const ui = CFG.uiLang && CFG.uiLang !== 'auto' ? CFG.uiLang : ''; return SubLang.bcp(CFG.subTranslateTo || ui || navigator.language || 'en') || 'en'; },
  track() { return Array.from(video.textTracks).find((t) => t.mode === 'showing' || (t.mode === 'hidden' && t.cues && t.cues.length)); },
  race(p, ms) { return Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]); },
  async waitTrack(ms) {
    const end = Date.now() + ms;
    for (;;) { const t = this.track(); if (t && t.cues && t.cues.length) return t; if (Date.now() >= end) return null; await new Promise((r) => setTimeout(r, 200)); }
  },
  async detect(text) {
    const cur = P.subs && P.subs[P.curSub]; const l = cur && cur.lang ? SubLang.bcp(cur.lang) : '';
    if (l) return l;
    try { if (self.LanguageDetector) { const d = await LanguageDetector.create(); const r = await d.detect(text); return r[0] && r[0].detectedLanguage; } } catch (e) { /* no detector */ }
    return 'en';
  },
  /* the browser's translator, trying the exact language first (pt-BR) and then its base (pt) */
  async device(from, to, quiet) {
    if (!this.api()) return null;
    for (const t of [...new Set([to, SubLang.base(to)])]) {
      for (const f of [...new Set([from, SubLang.base(from)])]) {
        try {
          const av = await this.race(Translator.availability({ sourceLanguage: f, targetLanguage: t }), 3000);
          if (av == null) return null; // the translator does not answer here
          if (av !== 'available' && (quiet || !av || av === 'unavailable')) continue; // a model download needs a tap; auto uses the service
          if (av !== 'available') toast('Downloading the translation model once. It stays on this device…', 'info', 4000);
          const tr = await this.race(Translator.create({ sourceLanguage: f, targetLanguage: t }), av === 'available' ? 8000 : 120000);
          if (tr) return tr;
        } catch (e) { /* not this pair */ }
      }
    }
    return null;
  },
  async start(o = {}) {
    const auto = !!o.auto;
    const t = await this.waitTrack(auto ? 8000 : 1500);
    if (!t) { if (!auto) toast('Pick a subtitle first, then translate it', 'err'); return false; }
    const from = o.from || await this.detect(Array.from(t.cues).slice(0, 20).map((c) => c.text).join('\n'));
    const to = o.to || this.target();
    if (from === to || (!o.to && SubLang.base(from) === SubLang.base(to))) { if (!auto) toast('These subtitles are already in your language', 'info'); return false; }
    this.stop(true);
    const tr = await this.device(from, to, auto);
    if (tr) { this.tr = tr; this.engine = 'device'; }
    else if (SubCloud.can(from, to)) this.engine = 'cloud';
    else { if (!auto) toast(`Translation from ${SubLang.name(from)} to ${SubLang.name(to)} is not available`, 'err', 5000); return false; }
    this.on = true; this.from = from; this.to = to; this.tick(); clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 1500);
    if (!auto) toast(this.engine === 'device' ? `Translating subtitles to ${SubLang.name(to)} on this device` : `Translating subtitles to ${SubLang.name(to)}`, 'ok');
    if (!$('#subMenu').hidden) renderSubMenu();
    return true;
  },
  stop(quiet) {
    const was = this.on; this.on = false; clearInterval(this.timer); const t = this.track();
    if (t && t.cues) Array.from(t.cues).forEach((c) => { const o = this.orig.get(c); if (o != null) c.text = o; });
    this.orig = new WeakMap();
    try { this.tr && this.tr.destroy && this.tr.destroy(); } catch (e) { /* gone */ } this.tr = null; this.engine = '';
    if (was && !quiet && !$('#subMenu').hidden) renderSubMenu();
  },
  async tick() {
    if (!this.on || this.busy) return; const t = this.track(); if (!t || !t.cues) return;
    const cues = Array.from(t.cues), now = video.currentTime, ahead = this.engine === 'cloud' ? 150 : 90;
    const todo = cues.filter((c) => c.endTime > now - 2 && c.startTime < now + ahead && !this.orig.has(c));
    if (!todo.length) return; this.busy = true;
    try {
      if (this.engine === 'device') {
        for (const c of todo.slice(0, 12)) {
          if (!this.on) break; const o = c.text; this.orig.set(c, o);
          try { const tags = o.match(/^(<[^>]+>)+/); const plain = o.replace(/<[^>]+>/g, ''); const out = await this.tr.translate(plain); c.text = tags ? tags[0] + out : out; } catch (e) { /* keep original line */ }
        }
      } else {
        if (!SubCloud.ready()) return;
        // fixed blocks, so everyone watching the same subtitle file asks for the same blocks (and hits the cache).
        // A line about to show gets a small block of 10 (a few seconds); lines further ahead go 40 at a time.
        const k = cues.indexOf(todo[0]), n = todo[0].startTime < now + 8 ? 10 : 40, a = Math.floor(k / n) * n;
        const batch = cues.slice(a, a + n).filter((c) => !this.orig.has(c));
        const send = batch.filter((c) => c.text.replace(/<[^>]+>/g, '').trim());
        batch.forEach((c) => { if (!send.includes(c)) this.orig.set(c, c.text); });
        if (!send.length) return;
        const out = await SubCloud.run(this.from, this.to, send.map((c) => c.text));
        if (!this.on || this.track() !== t) return;
        send.forEach((c, j) => { const o = c.text; this.orig.set(c, o); if (out[j]) c.text = out[j]; });
      }
    } catch (e) { SubCloud.fail(e); } finally { this.busy = false; }
  },
  init() {
    const rs = renderSubMenu;
    renderSubMenu = function () {
      const r = rs.apply(this, arguments); const m = $('#subMenu'); if (!m || !P.subs) return r;
      const cur = P.subs[P.curSub];
      if (cur && cur._tr) return r;
      const lbl = SubTranslate.on ? 'Stop translating' : `Translate to ${SubLang.name(SubTranslate.target())}`;
      m.insertAdjacentHTML('beforeend', `<button type="button" data-subtr class="${SubTranslate.on ? 'on' : ''}"><i data-lucide="languages"></i>${esc(lbl)}</button>`);
      $('[data-subtr]', m).onclick = () => (SubTranslate.on ? SubTranslate.stop() : SubTranslate.start()); icons(); return r;
    };
    const ss = selectSub; selectSub = function () { if (SubTranslate.on) SubTranslate.stop(true); return ss.apply(this, arguments); };
    const td = teardown; teardown = function () { if (SubTranslate.on) SubTranslate.stop(true); return td.apply(this, arguments); };
  },
};

