
'use strict';
/* ---------------- 2.39.0 Subtitles: one ranked list, and a translated track when your language is missing ----------------
   SubRank merges what every subtitle add-on returned into one list: the same file offered twice (two add-ons, or an
   add-on plus the stream itself) shows once. Order inside the menu: your language, then the same language from another
   region (Portuguese for Portuguese (BR)), then a Translated track, then the rest. Inside each group: subtitles made for
   this exact file (hash match from the add-on, or inside the file), then the closest release name, then add-on order.
   SubAuto adds "<your language> · Translated" when no subtitle in your language exists, and turns it on by itself when
   Auto-select is on. It translates the best English track (or the best other one) with the browser's Translator when
   there is one, otherwise with SubCloud. Auto-sync (CFG.subAutoSync) runs on it like on any downloaded subtitle. */
const SubLang = {
  T: { eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt', pob: 'pt-BR', pb: 'pt-BR', rus: 'ru', jpn: 'ja', kor: 'ko', chi: 'zh', zho: 'zh', zht: 'zh-TW', ara: 'ar', hin: 'hi', dut: 'nl', nld: 'nl', pol: 'pl', tur: 'tr', swe: 'sv', nor: 'no', nob: 'no', dan: 'da', fin: 'fi', gre: 'el', ell: 'el', heb: 'he', cze: 'cs', ces: 'cs', hun: 'hu', rum: 'ro', ron: 'ro', vie: 'vi', tha: 'th', ind: 'id', ukr: 'uk', bul: 'bg', hrv: 'hr', srp: 'sr', slv: 'sl', slo: 'sk', slk: 'sk', est: 'et', lav: 'lv', lit: 'lt', per: 'fa', fas: 'fa', may: 'ms', msa: 'ms', ben: 'bn', tam: 'ta', tel: 'te', cat: 'ca', glg: 'gl', baq: 'eu', eus: 'eu', alb: 'sq', sqi: 'sq', mac: 'mk', mkd: 'mk', bos: 'bs', ice: 'is', isl: 'is', fil: 'fil', tgl: 'tl', mal: 'ml', urd: 'ur', ea: 'es-419', spl: 'es-419' },
  /* any code the add-ons or settings use -> a BCP 47 tag ('' when unknown) */
  bcp(code) {
    const c = String(code || '').trim(); if (!c) return ''; const l = c.toLowerCase().replace('_', '-');
    if (this.T[l]) return this.T[l];
    if (/^[a-z]{2}$/.test(l)) return l;
    const m = /^([a-z]{2})-([a-z]{2,4})$/.exec(l); if (m) return `${m[1]}-${m[2].length === 2 ? m[2].toUpperCase() : m[2][0].toUpperCase() + m[2].slice(1)}`;
    const n = LANGS[l]; if (n) { const k = Object.keys(LANGS).find((x) => x.length === 2 && LANGS[x] === n); if (k) return k; }
    return '';
  },
  base(tag) { return String(tag || '').split('-')[0]; },
  name(tag) { const t = String(tag || ''); return t === 'pt-BR' ? langName('pob') : LANGS[t.toLowerCase()] ? langName(t) : langName(this.base(t)); },
  want() { return CFG.subLang && CFG.subLang !== 'off' ? this.bcp(CFG.subLang) : ''; },
};

/* MKCinema's translation service for browsers without a Translator (subs.mkcinema.app, Cloudflare Workers AI).
   Only the subtitle lines are sent, 40 at a time, just ahead of what is playing. When it is busy or its daily
   allowance is used up, the original lines simply stay on screen. */
const SubCloud = {
  url: 'https://subs.mkcinema.app/translate', until: 0, told: 0, memo: new Map(),
  can(from, to) { return !!(from && to) && from !== to && navigator.onLine !== false; },
  ready() { return Date.now() >= this.until; },
  async post(from, to, lines) {
    const key = `${from}>${to}\u0001${lines.join('\u0001')}`; if (this.memo.has(key)) return this.memo.get(key);
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, lines }), signal: ctl.signal });
      if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
      const j = await r.json(); const out = Array.isArray(j.lines) ? j.lines : [];
      if (this.memo.size > 400) this.memo.clear(); this.memo.set(key, out); return out;
    } finally { clearTimeout(tm); }
  },
  /* lines -> translated lines (null where a line could not be translated); long blocks are split */
  async run(from, to, lines) {
    const size = lines.reduce((n, l) => n + l.length, 0);
    if (lines.length > 1 && (size > 5500 || lines.length > 60)) {
      const h = Math.ceil(lines.length / 2);
      return (await this.run(from, to, lines.slice(0, h))).concat(await this.run(from, to, lines.slice(h)));
    }
    return this.post(from, to, lines);
  },
  fail(e) {
    const st = e && e.status;
    this.until = Date.now() + (st === 429 ? 20000 : st === 503 ? 10 * 60000 : 60000);
    MKLog.add('info', `Subtitle translation paused: ${e && e.message}`);
    if (st === 503 && Date.now() - this.told > 30 * 60000) { this.told = Date.now(); toast('Subtitle translation is busy right now, so the original lines stay on. It tries again in a few minutes.', 'info', 6000, 'subtr'); }
  },
};

const SubRank = {
  words(t) { return String(t || '').toLowerCase().replace(/\.(srt|vtt|ass|ssa|sub|mkv|mp4|avi)\b/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !/^(the|and|of|a|eng|english|subs?|subtitles?|cd\d|forced|sdh|hi|utf8)$/.test(w)); },
  release(stream) {
    if (!stream) return null; const bh = stream.behaviorHints || {};
    const name = bh.filename || [stream.title, stream.name, stream.description].filter(Boolean).join(' ');
    const w = new Set(this.words(name)); if (!w.size) return null;
    const grp = (/-([a-z0-9]+)(?:\.[a-z0-9]{2,4})?$/i.exec(String(bh.filename || '').trim()) || [])[1];
    return { w, grp: grp ? grp.toLowerCase() : '' };
  },
  /* 0..1: how close a subtitle's release name is to the file being played */
  match(s, rel) {
    if (!rel) return 0;
    const name = [s.subtitleFileName, s.movieReleaseName, s.releaseName, s.release, s.fileName, s.name, s.title, s.label].filter((x) => typeof x === 'string').join(' ');
    const w = new Set(this.words(name)); if (!w.size) return 0;
    let hit = 0; w.forEach((x) => { if (rel.w.has(x)) hit++; });
    let m = hit / Math.min(w.size, rel.w.size);
    const g = String(s.releaseGroup || '').toLowerCase(); if (rel.grp && (g === rel.grp || w.has(rel.grp))) m = Math.max(m, 0.6) + 0.3;
    return Math.min(1, m);
  },
  hash(s) { return s.m === 'h' || s.hashMatch === true || /hash/i.test(String(s.matchedBy || s.match || '')); },
  keys(s) {
    const k = [];
    if (s.url) k.push(`u:${String(s.url).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`);
    if (s.id != null && /^\d+$/.test(String(s.id)) && /strem\.io|opensubtitles/i.test(String(s.url || ''))) k.push(`o:${s.id}`);
    return k;
  },
  /* one list without duplicates; the copy kept is the better-ranked one */
  merge(list, stream) {
    const rel = this.release(stream), seen = new Map(), out = [];
    for (const s of list) {
      if (s.kind !== 'url' || s._tr) { out.push(s); continue; }
      s._hash = this.hash(s); s._rel = this.match(s, rel); s._own = !!(stream && s._addon === stream._addon && (stream.subtitles || []).some((x) => x.url === s.url));
      const ks = this.keys(s), dup = ks.map((k) => seen.get(k)).find((x) => x);
      if (dup) {
        dup._also = (dup._also || 1) + 1;
        if (s._hash && !dup._hash) { dup._hash = true; }
        dup._rel = Math.max(dup._rel || 0, s._rel || 0);
        ks.forEach((k) => seen.set(k, dup)); continue;
      }
      ks.forEach((k) => seen.set(k, s)); out.push(s);
    }
    out.forEach((s) => { if (s.kind === 'url' && !s._tr && !s._label) s._label = this.label(s); });
    return out;
  },
  label(s) {
    const tag = s._hash ? ' · made for this file' : s._own ? ' · from this source' : s._rel >= 0.75 ? ' · same release' : '';
    return `${langName(s.lang)}${s._addon ? ` · ${s._addon}` : ''}${tag}`;
  },
  /* 0 your language, 1 same language from another region, 2 translated, 3 the rest */
  tier(s) {
    const w = SubLang.want(); if (!w) return s._tr ? 2 : 3;
    if (s._tr) return 2;
    if (langName(s.lang) === langName(CFG.subLang)) return 0;
    const b = SubLang.bcp(s.lang); if (b && b === w) return 0;
    if (b && SubLang.base(b) === SubLang.base(w)) return 1;
    return 3;
  },
  score(s) {
    const own = s.kind === 'mkv' || s.kind === 'native' || s.kind === 'hls';
    return (s._hash ? 100 : 0) + (own ? 90 : 0) + (s._own ? 70 : 0) + Math.round((s._rel || 0) * 60) + (s.kind === 'file' ? 200 : 0) - ((s._mkv && s._mkv.forced) ? 50 : 0);
  },
  order(list) {
    return list.map((s, i) => [s, i]).sort((a, b) => (this.tier(a[0]) - this.tier(b[0])) || (this.score(b[0]) - this.score(a[0])) || (a[1] - b[1]));
  },
  /* the best real subtitle in your language (then the same language from another region), or -1 */
  pick(list) {
    const best = this.order(list).find(([s]) => this.tier(s) <= 1 && !(s._mkv && s._mkv.forced));
    return best ? best[1] : -1;
  },
};

const SubAuto = {
  on() { return CFG.subAutoTranslate !== false; },
  usable(s) { return !s._tr && (s.kind === 'url' || s.kind === 'file' || (s.kind === 'mkv' && s._mkv && !s._mkv.forced && !(s._mkv.ass && AssR.enabled()))) && !!SubLang.bcp(s.lang); },
  /* English first (the strongest source for translation), then the language of the app, then the best of the rest */
  source(to) {
    const ui = SubLang.bcp(CFG.uiLang && CFG.uiLang !== 'auto' ? CFG.uiLang : navigator.language);
    const cand = P.subs.map((s, i) => [s, i]).filter(([s]) => this.usable(s) && SubLang.base(SubLang.bcp(s.lang)) !== SubLang.base(to));
    if (!cand.length) return null;
    const pref = (s) => { const b = SubLang.base(SubLang.bcp(s.lang)); return b === 'en' ? 2 : ui && b === SubLang.base(ui) ? 1 : 0; };
    cand.sort((a, b) => (pref(b[0]) - pref(a[0])) || (SubRank.score(b[0]) - SubRank.score(a[0])) || (a[1] - b[1]));
    return cand[0][0];
  },
  offer() {
    if (!P.subs || P.subsLoading || !P.stream) return;
    const to = SubLang.want(); if (!to) return;
    // a subtitle in your exact language: nothing to add. The same language from another region still gets the offer,
    // but the human one stays the automatic pick.
    const have = P.subs.some((s) => !s._tr && SubRank.tier(s) === 0);
    const old = P.subs.findIndex((s) => s._tr);
    if (have || !this.on()) return;
    if (old < 0) {
      const src = this.source(to); if (!src) return;
      const from = SubLang.bcp(src.lang);
      P.subs.push({ ...src, text: src.kind === 'url' ? null : src.text, lang: CFG.subLang, _tr: { from, to, src }, _label: `${langName(CFG.subLang)} · Translated from ${langName(src.lang)}` });
      renderSubMenu();
    }
    const i = P.subs.findIndex((s) => s._tr);
    if (i >= 0 && CFG.subAuto && !P.subUserChoice && P.curSub < 0 && !P.subs.some((s) => !s._tr && SubRank.tier(s) <= 1)) selectSub(i, { auto: true });
  },
};

{
  // the translated entry downloads its source as plain timed text (styled files become plain lines), then translates
  const sel = selectSub;
  selectSub = async function (i, opts = {}) {
    const s = i >= 0 && P.subs ? P.subs[i] : null;
    if (s && s._tr && (s.kind === 'url' || s.kind === 'file') && !s._vtt) {
      try {
        const src = s._tr.src; let text = src.text;
        if (text == null) { const r = await fetch(s.url); if (!r.ok) throw new Error(`HTTP ${r.status}`); text = await r.text(); src.text = text; }
        s.text = StremioEngine.toVtt(text, s.fileName || s.url || ''); s._vtt = true;
      } catch (e) { if (!opts.auto) toast(`Could not load those subtitles (${e.message})`, 'err'); return; }
    }
    const r = await sel.apply(this, arguments);
    if (s && s._tr && P.curSub === i) {
      const ok = await SubTranslate.start({ from: s._tr.from, to: s._tr.to, auto: true });
      if (P.curSub !== i) { if (SubTranslate.on) SubTranslate.stop(true); return r; }
      if (ok) toast(`${langName(CFG.subLang)} subtitles on, translated${SubTranslate.engine === 'device' ? ' on this device' : ''}`, 'info', 3200, 'subs');
      else if (!opts.auto) toast('Translation could not start here. Showing the original subtitles.', 'err', 5000);
    }
    return r;
  };
  // a real subtitle in your language that turns up later (a slow add-on, the file's own tracks) replaces the translated one
  const amk = MkvSubs.autoPick.bind(MkvSubs);
  MkvSubs.autoPick = function () { const r = amk(); SubAuto.offer(); return r; };
  // Settings › Subtitles
  const sec = SECTIONS.find((x) => x.id === 'subtitles');
  if (sec) {
    const rows = sec.rows;
    sec.rows = () => { const r = rows(); const at = r.findIndex((x) => x.key === 'subLang'); r.splice(at < 0 ? r.length : at + 1, 0, { key: 'subAutoTranslate', label: 'Translate when your language is missing', help: 'When no subtitle exists in your language, MKCinema translates the best one it finds and marks it Translated. It uses your browser’s built-in translator when it has one; otherwise the lines are translated by MKCinema’s translation service.', type: 'toggle', get: () => CFG.subAutoTranslate !== false }); return r; };
  }
}
