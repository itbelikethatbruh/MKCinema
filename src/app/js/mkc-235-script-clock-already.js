
'use strict';
/* =====================================================================
   2.35.0 Script clock
   MKCinema already knows when people speak in a release (2.27 subtitle auto-sync). This uses the dialogue as a clock
   that is the same in every release of a film, so a 25 fps file, a 23.976 fps file and one with an extra studio logo
   all agree on "the moment someone says this line". Built on it:
   1  Any-release watch party: guests on their own sources stay on the same line, not the same second.
   2  Resume and auto-switching land on the same line on a different source.
   3  Find a line: type a line you remember and play from there.
   4  Phone subtitles: each person reads their own language on their phone.
   5  Last time: the final lines before you stopped, when you come back after a few days.
   6  Margins: notes left at a moment pop up for the rest of the house (and friends you share them with).
   7  Couch match: phones swipe, the first title everyone likes plays on the TV.
   8  Kids episode allowance: stops at the end of an episode, never mid-scene.
   9  Scene links: a link that opens your friend's MKCinema at the same line, on their own source.
   10 Never miss a line: after a pause, playback picks up at the start of the sentence.
   Everything runs on this device. Nothing here sends what you watch anywhere, except the notes you choose to share.
   ===================================================================== */
const SC_FPS = [1, 23.976 / 25, 25 / 23.976, 24 / 25, 25 / 24, 23.976 / 24, 24 / 23.976];
const scAddRows = (id, afterKey, extra) => {
  const sec = SECTIONS.find((x) => x.id === id); if (!sec) return;
  const rows = sec.rows;
  sec.rows = () => {
    const r = (typeof rows === 'function' ? rows() : rows).slice();
    const at = afterKey ? r.findIndex((x) => x.key === afterKey) : -1;
    r.splice(at < 0 ? r.length : at + 1, 0, ...(typeof extra === 'function' ? extra() : extra));
    return r;
  };
};

const ScriptClock = {
  cache: new Map(), // subtitle key -> Promise<cues>
  solved: new Map(), // `${stream}|${sub}` -> { k, off, how }
  busy: new Map(),
  streamKey(s) { s = s || P.stream; return s ? String(s.url || s.infoHash || s.ytId || s.name || '').slice(0, 400) : ''; },
  subKey(s) { return s ? String(s.url || s.id || s.fileName || '').slice(0, 400) : ''; },
  /* cue list [{ s, e, t }] in the subtitle file's own time */
  parse(vtt) {
    const out = [], blocks = String(vtt || '').replace(/\r/g, '').split(/\n{2,}/);
    const re = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/;
    const t = (h, mi, s, ms) => (Number(h) || 0) * 3600 + Number(mi) * 60 + Number(s) + Number(ms) / 1000;
    for (const b of blocks) {
      const lines = b.split('\n'), i = lines.findIndex((l) => re.test(l)); if (i < 0) continue;
      const m = lines[i].match(re);
      const text = lines.slice(i + 1).join(' ').replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
      if (text) out.push({ s: t(m[1], m[2], m[3], m[4]), e: t(m[5], m[6], m[7], m[8]), t: text });
    }
    return out.sort((a, b) => a.s - b.s);
  },
  text(sub) {
    const k = this.subKey(sub); if (!k) return Promise.resolve([]);
    if (!this.cache.has(k)) {
      const job = (async () => {
        let text = sub.text;
        if (text == null && sub.url) {
          const ac = new AbortController(), to = setTimeout(() => ac.abort(), 15000);
          try { const r = await fetch(sub.url, { signal: ac.signal }); if (r.ok) text = await r.text(); } catch (e) { /* host blocks it */ } finally { clearTimeout(to); }
        }
        if (!text) return [];
        try { return this.parse(StremioEngine.toVtt(text, sub.fileName || sub.url || '')); } catch (e) { return this.parse(text); }
      })();
      this.cache.set(k, job);
      job.then((c) => { if (!c.length) this.cache.delete(k); });
      if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
    }
    return this.cache.get(k);
  },
  /* which downloadable subtitle stands in for the script: the one on screen, else your language, else English */
  pick(prefer) {
    const subs = (P.subs || []).filter((s) => (s.kind === 'url' && /^https?:/i.test(s.url || '')) || (s.kind === 'file' && s.text));
    if (prefer) { const p = subs.find((s) => this.subKey(s) === prefer); if (p) return p; }
    const cur = P.curSub >= 0 ? P.subs[P.curSub] : null; if (cur && subs.includes(cur)) return cur;
    const want = CFG.subLang ? langName(CFG.subLang) : '';
    return (want && subs.find((s) => langName(s.lang) === want)) || subs.find((s) => /^(en|eng|english)$/i.test(String(s.lang || ''))) || subs[0] || null;
  },
  /* the mapping already known for this source: video time = subtitle time × k + off */
  known(sub) {
    if (!sub || !P.stream) return null;
    const i = (P.subs || []).indexOf(sub);
    if (i >= 0 && i === P.curSub) {
      if (SubSync.last && SubSync.last.i === i && SubSync.last.stream === P.stream) return { k: SubSync.last.k, off: SubSync.last.off, how: 'auto' };
      if (P.subUserChoice && (P.subDelay || (P.subScale && P.subScale !== 1))) return { k: P.subScale || 1, off: P.subDelay || 0, how: 'hand' };
    }
    return this.solved.get(`${this.streamKey()}|${this.subKey(sub)}`) || null;
  },
  /* works the mapping out quietly, without touching what is on screen. Heavy on a slow TV, so only on demand */
  async solve(sub, { wait = 15000 } = {}) {
    const have = this.known(sub); if (have) return have;
    const stream = P.stream; if (!sub || !stream || stream._local) return null;
    const key = `${this.streamKey(stream)}|${this.subKey(sub)}`;
    if (this.busy.has(key)) return this.busy.get(key);
    const job = (async () => {
      try {
        const ref = await SubSync.reference(stream, wait); if (!ref || P.stream !== stream) return null;
        const cues = await this.text(sub); if (cues.length < 20 || P.stream !== stream) return null;
        const r = await SubSync.align(SubSync.merge(cues.map((c) => [c.s, c.e])), SubSync.merge(ref.list), { range: 120, scales: SC_FPS });
        if (!r || P.stream !== stream || !(r.z >= 5 && r.j >= 0.25 && r.j >= r.rival * 1.15)) { MKLog.add('info', `Script clock: no sure match${r ? ` (match ${(r.j * 100).toFixed(0)}%, z ${r.z.toFixed(1)})` : ''}`); return null; }
        const m = { k: r.k, off: r.off, how: 'file' }; this.solved.set(key, m);
        MKLog.add('info', `Script clock: shift ${r.off}s, rate ${r.k.toFixed(4)}`);
        return m;
      } catch (e) { MKLog.add('info', `Script clock: ${e.message}`); return null; } finally { this.busy.delete(key); }
    })();
    this.busy.set(key, job); return job;
  },
  remember(sub, m) { if (sub && m && P.stream) this.solved.set(`${this.streamKey()}|${this.subKey(sub)}`, m); },
  toVideo(s, m) { return m ? s * m.k + m.off : s; },
  toScript(v, m) { return m ? (v - m.off) / m.k : v; },
  /* two lengths that differ by a frame-rate change (the 4 % PAL speed-up and friends) */
  fps(dFrom, dTo) {
    if (!(dFrom > 120 && dTo > 120)) return 1;
    const r = dTo / dFrom; for (const k of SC_FPS) if (k !== 1 && Math.abs(r / k - 1) < 0.0025) return k;
    return 1;
  },
  /* the script position right now, when it is known: for saving progress, notes and links */
  now() {
    const sub = this.pick(); const m = this.known(sub); if (!m) return null;
    return { su: this.subKey(sub), ss: Math.round(this.toScript(pNow(), m) * 100) / 100 };
  },
  /* cues in this video's time, for the line tools. Raw subtitle time when no mapping is known */
  async cues(sub) {
    sub = sub || this.pick(); if (!sub) return { list: [], mapped: false, sub: null };
    const cues = await this.text(sub), m = this.known(sub);
    return { sub, mapped: !!m, list: cues.map((c) => ({ s: this.toVideo(c.s, m), e: this.toVideo(c.e, m), t: c.t, ss: c.s })) };
  },
};
{
  // "these subtitles already match the film" is a mapping too
  const dc = SubSync.decide.bind(SubSync);
  SubSync.decide = function (i, r) {
    const out = dc.apply(SubSync, arguments);
    if (r && Math.abs(r.off) < 0.15 && r.k === 1 && r.j0 >= 0.25 && P.subs && P.subs[i]) ScriptClock.remember(P.subs[i], { k: 1, off: 0, how: 'same' });
    return out;
  };
}

/* ---------------- 1 Any-release watch party ----------------
   Everyone still plays their own source. Each state message now also carries where the sender is in the room's
   script (the host's subtitle file), so a guest on a different release lands on the same line. No shared subtitle
   or no sure match: two lengths that differ by a frame-rate change are scaled; otherwise a nudge lines it up by hand. */
const PartyLine = {
  ref: '', manual: 0, map: null, mapFor: '', solving: false, status: '',
  myMap() {
    if (!this.ref || !P.stream) return null;
    const p = ScriptClock.pick(this.ref), sub = p && ScriptClock.subKey(p) === this.ref ? p : { url: this.ref, kind: 'url' };
    if (!/^https?:/i.test(sub.url || '') && sub.kind !== 'file') return null;
    const m = ScriptClock.known(sub); if (m) return m;
    const key = `${ScriptClock.streamKey()}|${this.ref}`;
    if (!this.solving && this.mapFor !== key) {
      this.solving = true; this.mapFor = key;
      ScriptClock.solve(sub, { wait: 20000 }).then((r) => { this.solving = false; if (r) { ScriptClock.remember(sub, r); this.status = 'script'; Party.renderMembers(); toast('Party: lined up with the others by dialogue', 'ok', 3200, 'pline'); } });
    }
    return null;
  },
  room(pos) {
    const m = this.myMap();
    return m ? { rt: Math.round(ScriptClock.toScript(pos - this.manual, m) * 1000) / 1000, ru: this.ref } : null;
  },
  /* someone else's position, in this player's time */
  local(st) {
    const d = pDur(), m = st.ru && st.ru === this.ref ? this.myMap() : null;
    if (st.rt != null && m) { this.status = 'script'; return ScriptClock.toVideo(st.rt, m) + this.manual; }
    const k = ScriptClock.fps(st.d, d);
    if (k !== 1) { this.status = 'fps'; return st.pos * k + this.manual; }
    this.status = st.d && isFinite(d) && Math.abs(st.d - d) > 3 ? 'differs' : 'same';
    return st.pos + this.manual;
  },
  html() {
    if (!Party.code || !P.ctx) return '';
    const line = { script: 'Lined up by dialogue: every source stays on the same line.', fps: 'Lined up by speed: your version runs at a different frame rate.', differs: 'Your version is a different length. If you hear things early or late, nudge it.', same: 'Same timing as the host.' }[this.status] || 'Each person can use their own source.';
    return `<div class="pl-box"><b><i data-lucide="subtitles"></i>Different versions</b><small>${esc(line)}</small>
      <div class="pl-nudge" role="group" aria-label="Nudge your timing">${[[-1, '−1 s'], [-0.25, '−¼'], [0.25, '+¼'], [1, '+1 s']].map(([v, l]) => `<button type="button" class="chip" data-nav data-pln="${v}">${l}</button>`).join('')}<span class="tnum pl-v">${this.manual ? `${this.manual > 0 ? '+' : ''}${this.manual.toFixed(2)} s` : 'no nudge'}</span></div></div>`;
  },
  init() {
    Party.broadcastState = function (reason) {
      if (!this.code || !P.ctx) return;
      if (this.isHost() && !PartyLine.ref) { const s = ScriptClock.pick(); if (s) PartyLine.ref = ScriptClock.subKey(s); }
      const pos = pNow(), d = pDur();
      this.send({ t: 'state', reason, paused: video.paused, pos: pos - PartyLine.manual, rate: CFG.speed || 1, at: Date.now(), media: this.mediaInfo(), d: isFinite(d) ? Math.round(d * 100) / 100 : 0, ...(PartyLine.room(pos) || {}), ref: PartyLine.ref || '' });
    };
    Party.applyState = async function (st) {
      if (!st.media) return;
      if (st.ref && st._from === this.hostId && st.ref !== PartyLine.ref) { PartyLine.ref = st.ref; PartyLine.mapFor = ''; }
      const mine = this.mediaInfo(), off = this.offsets.get(st._from) || 0;
      const elapsed = st.paused ? 0 : Math.max(0, (Date.now() + off - st.at) / 1000) * (st.rate || 1);
      if (!mine || mine.metaId !== st.media.metaId || mine.videoId !== st.media.videoId) { PartyLine.manual = 0; await this.loadMedia(st.media, st.pos + elapsed); return; }
      const target = (st.media.url && P.stream && st.media.url === P.stream.url ? st.pos + PartyLine.manual : PartyLine.local(st)) + elapsed;
      this.applying = true; clearTimeout(this.applyT); this.applyT = setTimeout(() => { this.applying = false; }, 600);
      if (st.paused && !video.paused) video.pause();
      if (!st.paused && video.paused) video.play().catch(() => toast('Tap play to join the party playback', 'info'));
      if (P.remux && (Loader.hold || video.readyState < 3)) { this.renderMembers(); return; }
      const drift = pNow() - target, rate = st.rate || 1, seekAt = P.remux ? 3 : 1;
      clearTimeout(this.rateT);
      if (st.paused || Math.abs(drift) > seekAt) { if (Math.abs(drift) > 0.15) { this.expect = target; this.expectAt = Date.now(); pSeek(target, { user: false }); } video.playbackRate = rate; }
      else if (Math.abs(drift) > 0.15) { video.playbackRate = rate * (drift > 0 ? 0.95 : 1.05); this.rateT = setTimeout(() => { video.playbackRate = rate; }, Math.min(4000, Math.abs(drift) / 0.05 * 1000)); }
      else video.playbackRate = rate;
      this.lastDrift = drift; this.renderMembers();
    };
    const rm = Party.renderMembers.bind(Party);
    Party.renderMembers = function () {
      rm();
      $$('#pyMembers').forEach((box) => {
        let el = box.parentElement && box.parentElement.querySelector('.pl-wrap');
        const html = PartyLine.html();
        if (!html) { if (el) el.remove(); return; }
        if (!el) { el = document.createElement('div'); el.className = 'pl-wrap'; box.after(el); }
        if (el.dataset.h === html) return; el.dataset.h = html; el.innerHTML = html; icons();
        $$('[data-pln]', el).forEach((b) => b.addEventListener('click', () => { PartyLine.manual = Math.round((PartyLine.manual + Number(b.dataset.pln)) * 100) / 100; Party.renderMembers(); if (!Party.isHost() && PartyLine.lastSt) Party.applyState(PartyLine.lastSt); }));
      });
    };
    const lv = Party.leave.bind(Party);
    Party.leave = function () { PartyLine.ref = ''; PartyLine.manual = 0; PartyLine.status = ''; return lv.apply(Party, arguments); };
  },
};

/* ---------------- 2 Land on the same line ----------------
   Resume, auto-switching to another source and scene links remember the line as well as the second. When the new
   source turns out to be a different release, playback moves to the same line once it is known. */
const Land = {
  pending: null,
  init() {
    const sp = saveProgress;
    saveProgress = function () {
      const r = sp.apply(this, arguments);
      try {
        const ctx = P.ctx; if (!ctx) return r;
        const key = ctx.video ? ctx.video.id : ctx.meta.id, p = S.progress[key];
        if (p && !p.su) { const n = ScriptClock.now(); if (n) { p.su = n.su; p.ss = n.ss; Store.set('progress', S.progress); } }
        else if (p && p.su) { const n = ScriptClock.now(); if (n && n.su === p.su) { p.ss = n.ss; Store.set('progress', S.progress); } else if (!n) { delete p.su; delete p.ss; } }
      } catch (e) { /* keep the plain position */ }
      return r;
    };
    video.addEventListener('loadedmetadata', () => this.arrived());
  },
  /* called from the playStream wrapper before the new source loads */
  plan(ctx, stream, opts, prev) {
    this.pending = null;
    const key = ctx.video ? ctx.video.id : ctx.meta.id;
    let at = opts.startAt, d = 0, su = '', ss = null;
    if (opts.land) ({ d = 0, su = '', ss = null } = opts.land);
    else if (prev && prev.key === key && prev.stream !== stream && at != null) { d = prev.d; if (prev.n) { su = prev.n.su; ss = prev.n.ss; } }
    else {
      const p = S.progress[key];
      if (p && (at == null ? CFG.resume && p.t > 20 && p.t < p.d * 0.95 : Math.abs(at - p.t) < 2)) { at = at == null ? p.t : at; d = p.d; su = p.su || ''; ss = p.ss; }
    }
    if (at == null || !(at > 5)) return;
    this.pending = { stream, at, d, su, ss, set: Date.now() };
  },
  arrived() {
    const L = this.pending; if (!L || L.stream !== P.stream) return;
    const d = pDur(); if (!isFinite(d)) return;
    const k = ScriptClock.fps(L.d, d);
    if (k !== 1 && Math.abs(pNow() - L.at) < 30) {
      L.at = L.at * k; pSeek(L.at, { user: false });
      toast('This version runs at a different speed, so it picked up at the same moment', 'info', 3600, 'land');
    }
    if (L.su && L.ss != null) this.refine(L);
    else this.pending = null;
  },
  async refine(L) {
    // the subtitles list arrives a moment after the video
    for (let i = 0; i < 40 && P.stream === L.stream && P.subsLoading; i++) await sleep(250);
    if (P.stream !== L.stream) return;
    const pk = ScriptClock.pick(L.su), sub = pk && ScriptClock.subKey(pk) === L.su ? pk : { kind: 'url', url: L.su };
    if (!/^https?:/i.test(sub.url || '') && sub.kind !== 'file') return;
    const m = await ScriptClock.solve(sub, { wait: 20000 });
    if (!m || P.stream !== L.stream || this.pending !== L) return;
    this.pending = null;
    const want = ScriptClock.toVideo(L.ss, m), ran = video.paused ? 0 : (Date.now() - L.set) / 1000;
    const expect = L.at + ran;
    // only when the viewer has not moved since it started
    if (Math.abs(pNow() - expect) > 6) return;
    const target = want + (pNow() - L.at);
    if (Math.abs(target - pNow()) < 1.2) return;
    pSeek(target, { user: false });
    toast('Lined up with the same line you left off on', 'ok', 3200, 'land');
  },
};

/* ---------------- 3 Find a line ---------------- */
const Lines = {
  ctx: null, list: [], q: '',
  norm: (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9Ѐ-ӿ؀-ۿऀ-ॿ぀-ヿ一-鿿 ]+/g, ' ').replace(/\s+/g, ' ').trim(),
  layer() {
    const el = X8.layer('findLine', { label: 'Find a line', icon: 'search', eyebrow: 'Find a line', wide: true });
    return el;
  },
  /* in the player: the film's own subtitles; on a details page: subtitles fetched for the title */
  async openPlayer() {
    if (!P.ctx || !P.stream) return;
    this.ctx = { player: true, meta: P.ctx.meta, video: P.ctx.video };
    this.show('Loading the script…');
    const { list, sub } = await ScriptClock.cues();
    this.list = list; this.su = sub ? ScriptClock.subKey(sub) : '';
    this.ready();
  },
  async openDetail() {
    const m = D.meta; if (!m) return;
    let v = D.video;
    if (m.type === 'series' && !v) { const eps = orderedEpisodes(m); const p = continueItems().find((x) => x.metaId === m.id); v = (p && m.videos.find((x) => videoIdFor(m, x) === p.videoId)) || eps[0] || null; }
    this.ctx = { player: false, meta: m, video: v };
    this.show('Loading the script…');
    try {
      const id = v ? videoIdFor(m, v) : m.id;
      const subs = (await engine.fetchSubtitles(m.type, id, {})).filter((s) => /^https?:/i.test(s.url || ''));
      const want = CFG.subLang ? langName(CFG.subLang) : '';
      const sub = (want && subs.find((s) => langName(s.lang) === want)) || subs.find((s) => /^(en|eng)/i.test(String(s.lang || ''))) || subs[0];
      if (!sub) { this.list = []; this.ready('No subtitles were found for this title, so there is no script to search.'); return; }
      const cues = await ScriptClock.text(sub);
      this.su = ScriptClock.subKey(sub);
      this.list = cues.map((c) => ({ s: c.s, e: c.e, t: c.t, ss: c.s }));
      this.ready();
    } catch (e) { this.list = []; this.ready('The subtitle add-ons did not answer. Try again in a moment.'); }
  },
  show(msg) {
    this.layer(); const b = X8.body('findLine'), m = this.ctx.meta, v = this.ctx.video;
    b.innerHTML = `<h2 class="x8-h">Find a line</h2><p class="sc-p">${esc(m.name)}${v ? ` · S${v.season} E${v.episode}` : ''}. Type words someone says, then pick the moment.</p>
      <div class="fl-in"><i data-lucide="search"></i><input class="inp" id="flQ" type="search" autocomplete="off" spellcheck="false" placeholder="Like “bigger boat”" aria-label="Words from the line"></div>
      <div class="fl-res" id="flRes"><div class="status-line"><span class="spin"></span>${esc(msg)}</div></div>`;
    icons(); X8.open('findLine');
    const q = $('#flQ'); if (IS_TV) TvType.guard(q);
    q.addEventListener('input', () => { this.q = q.value; this.render(); });
    q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const f = $('#flRes [data-fl]'); if (f) f.click(); } });
    setTimeout(() => { if (IS_TV) Nav.focus(q, true); else q.focus(); }, 60);
  },
  ready(err) {
    const box = $('#flRes'); if (!box) return;
    if (err || !this.list.length) { box.innerHTML = `<p class="sc-p">${esc(err || 'No script for this source. Turn on subtitles from an add-on, or try another source.')}</p>`; return; }
    this.render();
  },
  render() {
    const box = $('#flRes'); if (!box || !this.list.length) return;
    const q = this.norm(this.q);
    if (q.length < 2) { box.innerHTML = `<p class="sc-p">${this.list.length} lines in the script. Search runs on this device.</p>`; return; }
    const words = q.split(' ');
    let found = [];
    for (let i = 0; i < this.list.length && found.length < 300; i++) {
      // a line split over two subtitles still matches; the words in that order come first
      const c = this.list[i], n = this.list[i + 1], t = this.norm(c.t), both = n && n.s - c.e < 1.5 ? `${t} ${this.norm(n.t)}` : t;
      const nt = n ? this.norm(n.t) : '', exact = t.includes(q) || (both.includes(q) && !nt.includes(q));
      if (exact || words.every((w) => t.includes(w))) found.push({ c, x: exact ? 1 : 0 });
    }
    const hits = found.sort((a, b) => b.x - a.x || a.c.s - b.c.s).slice(0, 40).map((h) => h.c);
    const mark = (txt) => { let h = esc(txt); words.filter((w) => w.length > 1).forEach((w) => { h = h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'), '<mark>$1</mark>'); }); return h; };
    box.innerHTML = hits.length ? hits.map((c, i) => `<button type="button" class="fl-row" data-nav data-fl="${i}"><span class="tnum">${fmtTime(c.s)}</span><span>${mark(c.t)}</span><i data-lucide="play"></i></button>`).join('')
      : '<p class="sc-p">No line with those words. Try fewer words, or another spelling.</p>';
    icons();
    $$('[data-fl]', box).forEach((b) => b.addEventListener('click', () => this.go(hits[Number(b.dataset.fl)])));
  },
  async go(c) {
    X8.close('findLine');
    const at = Math.max(0, c.s - 2.5);
    if (this.ctx.player && P.ctx) { pSeek(at); if (video.paused) video.play().catch(() => {}); wakeHud(); return; }
    const { meta, video: v } = this.ctx;
    toast(`Playing from ${fmtTime(at)}…`, 'info', 2400);
    const { streams } = await engine.fetchStreams(meta.type, v ? videoIdFor(meta, v) : meta.id);
    const best = pickBest(streams); if (!best) { toast('No source plays here yet. Pick one from the list.', 'err'); return; }
    playStream({ meta, video: v, streams }, best, { startAt: at, land: { su: this.su, ss: Math.max(0, c.ss - 2.5) } });
  },
};

/* ---------------- 4 Phone subtitles ----------------
   A paired phone asks for the subtitle list, picks a language, gets the subtitle link and this source's timing,
   and shows the lines itself in step with the TV. Phone 'ps' {op: list|pick, i} -> TV 'psl' {list} and 'psm' {...}. */
const PhoneSubs = {
  list() {
    const seen = new Set();
    return (P.subs || []).map((s, i) => ({ s, i })).filter(({ s }) => s.kind === 'url' && /^https?:/i.test(s.url || ''))
      .filter(({ s }) => { const k = `${langName(s.lang)}|${s._addon || ''}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .map(({ s, i }) => ({ i, lang: langName(s.lang) || 'Unknown', code: String(s.lang || ''), from: s._addon || '' }));
  },
  async pick(i, to) {
    const s = P.subs && P.subs[i]; if (!s || !/^https?:/i.test(s.url || '')) return;
    const send = (m) => Remote.bus && Remote.bus.send({ t: 'psm', _to: to, i, url: s.url, lang: langName(s.lang), k: m ? m.k : 1, off: m ? m.off : (P.curSub === i ? P.subDelay || 0 : 0), how: m ? m.how : 'raw', title: P.ctx ? P.ctx.meta.name : '' });
    const m = ScriptClock.known(s); send(m);
    if (m) return;
    // fall back to lining it up against the film (or against the subtitles on screen)
    const r = await ScriptClock.solve(s, { wait: 15000 });
    if (r) { send(r); return; }
    const cur = P.curSub >= 0 ? P.subs[P.curSub] : null, cm = cur && cur !== s ? ScriptClock.known(cur) : null;
    if (cur && cur !== s) {
      // the subtitles on screen are right for this film: line the phone's language up with them
      try {
        const [a, b] = await Promise.all([ScriptClock.text(s), ScriptClock.text(cur)]);
        if (a.length > 20 && b.length > 20) {
          const ref = b.map((c) => [ScriptClock.toVideo(c.s, cm) + (cm ? 0 : P.subDelay || 0), ScriptClock.toVideo(c.e, cm) + (cm ? 0 : P.subDelay || 0)]);
          const x = await SubSync.align(SubSync.merge(a.map((c) => [c.s, c.e])), SubSync.merge(ref), { range: 120, scales: SC_FPS });
          if (x && x.z >= 5 && x.j >= 0.25) send({ k: x.k, off: x.off, how: 'subs' });
        }
      } catch (e) { /* the phone keeps the plain timing */ }
    }
  },
  init() {
    const on = Remote.onMsg.bind(Remote);
    Remote.onMsg = function (m) {
      if (m && m.t === 'ps' && m._from) {
        Remote.peers.set(m._from, { ...(Remote.peers.get(m._from) || { name: 'Phone' }), at: Date.now() });
        if (m.op === 'list') Remote.bus.send({ t: 'psl', _to: m._from, list: $('#player').hidden ? [] : PhoneSubs.list(), playing: !$('#player').hidden });
        if (m.op === 'pick') PhoneSubs.pick(Number(m.i), m._from);
        return;
      }
      return on(m);
    };
  },
  /* the TV shows how to start it */
  async open() {
    await Remote.host();
    const link = Remote.link(Remote.code); if (!link) { toast('Phone subtitles need MKCinema on a web address, such as app.mkcinema.app.', 'err', 6000); return; }
    const el = X8.layer('phoneSubs', { label: 'Subtitles on your phone', icon: 'smartphone', eyebrow: 'Phone subtitles' });
    X8.body('phoneSubs').innerHTML = `<h2 class="x8-h">Read subtitles on your phone</h2><p class="sc-p">Everyone picks their own language. The TV stays clean, or keeps its own subtitles. Scan with each phone.</p>
      <div class="qr-wrap ps-qr">${QR.svg(`${link}~subs`)}</div><p class="tour-note">Or open ${esc(Remote.link().replace(/^https?:\/\//, ''))} and type <b class="mono">${esc(Remote.code)}</b>, then tap <b>Subtitles on this phone</b>.</p>`;
    el.querySelector('.x8-modal').classList.add('ps-modal'); icons(); X8.open('phoneSubs');
  },
};

/* ---------------- 5 Last time… ---------------- */
const LastTime = {
  t: 0,
  on() { return CFG.lastTime !== false; },
  arm(ctx, stream, at, p) {
    clearTimeout(this.t); this.hide();
    if (!this.on() || !p || !(at > 60) || stream.ytId || Party.code) return;
    if (Date.now() - (p.at || 0) < 2 * 86400e3) return;
    this.wait(stream, at);
  },
  async wait(stream, at) {
    for (let i = 0; i < 60 && P.stream === stream && (P.subsLoading || video.readyState < 2); i++) await sleep(250);
    if (P.stream !== stream) return;
    const { list } = await ScriptClock.cues(); if (P.stream !== stream) return;
    // spoken in the four minutes before you stopped, nothing after
    const lines = list.filter((c) => c.e <= at + 0.5 && c.s >= at - 240).slice(-6);
    if (lines.length < 2) return;
    this.show(lines);
  },
  show(lines) {
    const pl = $('#player'); if (!pl || pl.hidden) return;
    let el = $('#lastTime'); if (!el) { el = document.createElement('div'); el.id = 'lastTime'; el.className = 'lt-card'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Last time'); pl.appendChild(el); }
    const was = !video.paused; if (was) video.pause();
    el.innerHTML = `<span class="lt-eye"><i data-lucide="history"></i>Last time</span><div class="lt-lines">${lines.map((c) => `<p>${esc(c.t)}</p>`).join('')}</div>
      <div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="ltGo"><i data-lucide="play"></i>Carry on</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="ltBack"><i data-lucide="rewind"></i>Rewind 1 min</button></div>`;
    icons(); el.hidden = false; requestAnimationFrame(() => el.classList.add('on'));
    const go = (back) => { if (back) pSeek(Math.max(0, pNow() - 60)); this.hide(); video.play().catch(() => {}); wakeHud(); };
    $('#ltGo').onclick = () => go(false); $('#ltBack').onclick = () => go(true);
    if (IS_TV) setTimeout(() => Nav.focus($('#ltGo'), true), 60);
    this.t = setTimeout(() => { if ($('#lastTime') && !$('#lastTime').hidden) go(false); }, 25000);
  },
  hide() { const el = $('#lastTime'); if (!el || el.hidden) return; el.classList.remove('on'); setTimeout(() => { el.hidden = true; }, 260); },
};

/* ---------------- 6 Margins ----------------
   Notes at a moment. Kept on this device (every seat sees them, marked with who wrote them), and shared with
   friends as a link that holds the notes themselves. Nothing goes through a server. */
const Margins = {
  shown: new Set(), last: -1,
  all() { return Store.raw.get('margins', {}) || {}; },
  save(a) { Store.raw.set('margins', a); },
  key(ctx) { ctx = ctx || P.ctx; return ctx ? (ctx.video ? ctx.video.id : ctx.meta.id) : ''; },
  of(key) { return (this.all()[key] || []).slice(); },
  me() { try { return Seats.cur().name || 'Me'; } catch (e) { return 'Me'; } },
  add(text, at) {
    const ctx = P.ctx; if (!ctx || !text) return;
    const key = this.key(), a = this.all(), n = ScriptClock.now(), d = pDur();
    const note = { id: rid(8), t: Math.round(at * 100) / 100, txt: String(text).slice(0, 140), by: this.me(), seat: SEAT || '', at: Date.now(), d: isFinite(d) ? Math.round(d) : 0, name: ctx.meta.name, type: ctx.meta.type, metaId: ctx.meta.id };
    if (n) { note.su = n.su; note.ss = Math.round((n.ss - (pNow() - at)) * 100) / 100; }
    a[key] = [...(a[key] || []), note].sort((x, y) => x.t - y.t).slice(-200);
    this.save(a); this.shown.add(note.id); toast('Note left here. It pops up for others at this moment.', 'ok', 3200);
  },
  remove(key, id) { const a = this.all(); a[key] = (a[key] || []).filter((n) => n.id !== id); if (!a[key].length) delete a[key]; this.save(a); },
  /* where a note falls in this source */
  when(n) {
    if (n.su && n.ss != null) { const pk = ScriptClock.pick(n.su), m = ScriptClock.known(pk && ScriptClock.subKey(pk) === n.su ? pk : { kind: 'url', url: n.su }); if (m) return ScriptClock.toVideo(n.ss, m); }
    const k = ScriptClock.fps(n.d, pDur()); return n.t * k;
  },
  tick() {
    if (CFG.margins === false || !P.ctx || video.paused || $('#player').hidden) return;
    const list = this.of(this.key()); if (!list.length) return;
    const now = pNow();
    if (Math.abs(now - this.last) > 2) { list.forEach((n) => { if (this.when(n) < now - 0.5) this.shown.add(n.id); }); }
    this.last = now;
    const n = list.find((x) => !this.shown.has(x.id) && Math.abs(this.when(x) - now) < 0.6);
    if (n) { this.shown.add(n.id); this.pop(n); }
  },
  pop(n) {
    const pl = $('#player'); if (!pl) return;
    const el = document.createElement('div'); el.className = 'mg-pop';
    const mine = n.seat === (SEAT || '') && n.by === this.me();
    el.innerHTML = `<span class="mg-by">${esc(mine ? 'Your note' : n.by)}</span><p>${esc(n.txt)}</p>`;
    pl.appendChild(el); requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); }, 6500);
  },
  open() {
    if (!P.ctx) return;
    const at = pNow(), key = this.key();
    const el = X8.layer('margins', { label: 'Notes', icon: 'message-square-text', eyebrow: 'Margins' });
    const paint = () => {
      const list = this.of(key);
      X8.body('margins').innerHTML = `<h2 class="x8-h">Leave a note at ${fmtTime(at)}</h2><p class="sc-p">It pops up at this moment for the rest of the house, and for friends you share notes with. Even on a different version of the film.</p>
        <div class="mg-quick">${['😂', '😱', '😭', '🔥', '👀', '❤️'].map((e) => `<button type="button" class="chip" data-nav data-mge="${e}">${e}</button>`).join('')}</div>
        <div class="fl-in"><i data-lucide="message-square-text"></i><input class="inp" id="mgText" maxlength="140" autocomplete="off" placeholder="Your note" aria-label="Your note"></div>
        <div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="mgSave"><i data-lucide="check"></i>Leave it here</button>${list.length ? `<button class="btn btn-ghost btn-sm" type="button" data-nav id="mgShare"><i data-lucide="share-2"></i>Share notes</button>` : ''}</div>
        ${list.length ? `<h5 class="mg-h">Notes in ${esc(P.ctx.meta.name)}</h5><div class="mg-list">${list.map((n) => `<div class="mg-row"><button type="button" class="tnum" data-nav data-mgt="${n.id}">${fmtTime(this.when(n))}</button><span><b>${esc(n.by)}</b>${esc(n.txt)}</span><button type="button" class="ibtn" data-nav data-mgx="${n.id}" aria-label="Delete note"><i data-lucide="trash-2"></i></button></div>`).join('')}</div>` : ''}
        <label class="check"><input type="checkbox" id="mgOn" ${CFG.margins === false ? '' : 'checked'}>Show notes while watching</label>`;
      icons();
      const t = $('#mgText'); if (IS_TV) TvType.guard(t);
      t.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); $('#mgSave').click(); } });
      $$('[data-mge]').forEach((b) => b.addEventListener('click', () => { t.value = `${t.value}${b.dataset.mge}`.slice(0, 140); }));
      $('#mgSave').onclick = () => { const v = t.value.trim(); if (!v) { toast('Write a note or pick an emoji first'); return; } this.add(v, at); X8.close('margins'); };
      const sh = $('#mgShare'); if (sh) sh.onclick = () => this.share(key);
      $$('[data-mgt]').forEach((b) => b.addEventListener('click', () => { const n = this.of(key).find((x) => x.id === b.dataset.mgt); if (n) { X8.close('margins'); pSeek(Math.max(0, this.when(n) - 2)); } }));
      $$('[data-mgx]').forEach((b) => b.addEventListener('click', () => { this.remove(key, b.dataset.mgx); paint(); }));
      $('#mgOn').onchange = (e) => setCfg('margins', e.target.checked);
    };
    paint(); X8.open('margins');
    const was = !video.paused; if (was) video.pause();
    X8.onClose.margins = was ? () => { video.play().catch(() => {}); } : null;
    setTimeout(() => { const t = $('#mgText'); if (t) { if (IS_TV) Nav.focus(t, true); else t.focus(); } }, 60);
  },
  link(key) {
    const list = this.of(key).slice(-40); if (!list.length) return '';
    const n0 = list[0];
    const pack = { v: 1, from: this.me(), key, m: n0.metaId, ty: n0.type, nm: n0.name, n: list.map((n) => [n.t, n.txt, n.by, n.su || '', n.ss != null ? n.ss : '', n.d || 0]) };
    return `${Gaps.BASE}#margins=${X8.b64e(pack)}`;
  },
  async share(key) {
    const url = this.link(key); if (!url) return;
    const title = `My notes on ${(this.of(key)[0] || {}).name || 'a film'} in MKCinema`;
    if (navigator.share && TOUCH_UI) { try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    if (IS_TV) { const b = X8.body('margins'); if (b) { b.insertAdjacentHTML('beforeend', `<div class="qr-wrap ps-qr">${QR.svg(url)}</div><p class="tour-note">Scan to send these notes to your phone, then pass the link on.</p>`); } return; }
    if (!(await copyText(url, 'Link copied. Friends who open it get your notes for this title.', 4200))) prompt('Copy this link', url);
  },
  import(raw) {
    let p; try { p = X8.b64d(raw); } catch (e) { toast('That notes link is broken', 'err'); return; }
    if (!p || p.v !== 1 || !p.key || !Array.isArray(p.n)) return;
    const a = this.all(), have = a[p.key] || [], from = String(p.from || 'A friend').slice(0, 24);
    const fresh = p.n.slice(0, 60).map(([t, txt, by, su, ss, d]) => ({ id: rid(8), t: Number(t) || 0, txt: String(txt || '').slice(0, 140), by: String(by || from).slice(0, 24), seat: '-friend', at: Date.now(), su: su || undefined, ss: ss === '' || ss == null ? undefined : Number(ss), d: Number(d) || 0, name: String(p.nm || '').slice(0, 120), type: p.ty, metaId: p.m }))
      .filter((n) => n.txt && !have.some((h) => h.txt === n.txt && Math.abs(h.t - n.t) < 1));
    a[p.key] = [...have, ...fresh].sort((x, y) => x.t - y.t).slice(-200); this.save(a);
    toast(fresh.length ? `${fresh.length} note${fresh.length === 1 ? '' : 's'} from ${from} added. They pop up when you watch ${p.nm || 'it'}.` : 'You already have these notes', 'ok', 5200);
    if (fresh.length && p.m && p.ty) engine.fetchMeta(p.ty, p.m).then((m) => { if (m) openDetail(remember(m)); }).catch(() => {});
  },
  init() {
    video.addEventListener('timeupdate', () => this.tick());
    video.addEventListener('loadedmetadata', () => { this.shown.clear(); this.last = -1; });
  },
};

/* ---------------- 7 Couch match ---------------- */
const Couch = {
  id: '', deck: [], phones: new Map(), votes: new Map(), matched: null,
  async build() {
    const out = new Map(), add = (m, w) => { if (!m || !m.id || !m.name) return; const o = out.get(m.id) || { m, w: 0 }; o.w += w; out.set(m.id, o); };
    try { Seats.all().forEach((s) => { const wl = s.id === SEAT ? S.watchlist : (s.id ? Seats.seatData(s.id).watchlist : Store.raw.get('watchlist', [])); (wl || []).slice(0, 40).forEach((m) => add(m, 3)); }); } catch (e) { (S.watchlist || []).forEach((m) => add(m, 3)); }
    try { (await Recs.forYou()).slice(0, 24).forEach((m, i) => add(m, 2 - i / 24)); } catch (e) { /* no addons answered */ }
    let list = [...out.values()].sort((a, b) => b.w - a.w).map((x) => x.m);
    if (Seats.kids()) list = list.filter((m) => Seats.kidSafe(m));
    return X8.seeded(list.slice(0, 30), `${Date.now()}`).slice(0, 20).map((m) => ({ id: m.id, type: m.type, name: m.name, poster: metaPoster(m) || '', year: yearOf(m) || '', g: genresOf(m).slice(0, 2).join(' · '), r: m.imdbRating || '' }));
  },
  async open() {
    await Remote.host();
    const link = Remote.link(Remote.code); if (!link) { toast('Couch match needs MKCinema on a web address, such as app.mkcinema.app.', 'err', 6000); return; }
    const el = X8.layer('couchMatch', { label: 'Couch match', icon: 'users', eyebrow: 'Couch match', wide: true });
    el.querySelector('.x8-modal').classList.add('cm-modal');
    this.id = rid(6); this.votes.clear(); this.phones.clear(); this.matched = null;
    X8.body('couchMatch').innerHTML = '<div class="status-line"><span class="spin"></span>Picking titles from everyone’s lists and picks…</div>';
    X8.open('couchMatch');
    this.deck = await this.build();
    if (!this.deck.length) { X8.body('couchMatch').innerHTML = '<p class="sc-p">Nothing to pick from yet. Add titles to a watchlist, or set your favourites in Your Picks.</p>'; return; }
    this.paint(); this.push();
    clearInterval(this.liveT); this.liveT = setInterval(() => this.tidy(), 5000);
    X8.onClose.couchMatch = () => { this.send({ op: 'end' }); this.id = ''; };
  },
  send(m, to) { if (Remote.bus) Remote.bus.send({ t: 'cm', id: this.id, ...m, ...(to ? { _to: to } : {}) }); },
  push(to) { if (this.id) this.send({ op: 'deck', list: this.deck, matched: this.matched ? this.matched.id : '' }, to); },
  paint() {
    const b = X8.body('couchMatch'); if (!b || !this.id) return;
    if (this.matched) {
      const m = this.matched;
      b.innerHTML = `<div class="cm-match"><div class="cm-poster" style="background-image:url('${esc(String(m.poster || '').replace(/'/g, '%27').replace(/\\/g, '%5C'))}')"></div><div><span class="eyebrow"><i data-lucide="heart"></i>It’s a match</span><h2 class="x8-h">${esc(m.name)}</h2><p class="sc-p">${esc([m.year, m.g].filter(Boolean).join(' · '))}</p>
        <div class="inrow"><button class="btn btn-prime" type="button" data-nav id="cmPlay"><i data-lucide="play"></i>Play</button><button class="btn btn-ghost" type="button" data-nav id="cmInfo"><i data-lucide="info"></i>Details</button><button class="btn btn-ghost" type="button" data-nav id="cmMore"><i data-lucide="rotate-ccw"></i>Keep going</button></div></div></div>`;
      icons();
      const meta = () => remember(S.metas.get(m.id) || { id: m.id, type: m.type, name: m.name, poster: m.poster });
      $('#cmPlay').onclick = () => { X8.close('couchMatch'); quickPlay(meta()); };
      $('#cmInfo').onclick = () => { X8.close('couchMatch'); openDetail(meta()); };
      $('#cmMore').onclick = () => { this.votes.delete(m.id); this.deck = this.deck.filter((x) => x.id !== m.id); this.matched = null; this.paint(); this.push(); };
      if (IS_TV) setTimeout(() => Nav.focus($('#cmPlay'), true), 60);
      return;
    }
    const n = this.phones.size, link = `${Remote.link(Remote.code)}~match`;
    const top = this.deck.map((m) => ({ m, y: (this.votes.get(m.id) || new Set()).size })).filter((x) => x.y).sort((a, b) => b.y - a.y).slice(0, 6);
    b.innerHTML = `<div class="cm-grid"><div><h2 class="x8-h">Can’t decide? Swipe together.</h2><p class="sc-p">Everyone scans with their phone and swipes on ${this.deck.length} titles from your lists and picks. The first one everybody likes is the match.</p>
      <div class="qr-wrap ps-qr">${QR.svg(link)}</div><p class="tour-note">Or open ${esc(Remote.link().replace(/^https?:\/\//, ''))}, type <b class="mono">${esc(Remote.code)}</b> and tap <b>Couch match</b>.</p></div>
      <div><h5 class="mg-h">${n ? `${n} ${n === 1 ? 'phone' : 'phones'} swiping` : 'Waiting for phones'}</h5>${n ? '' : '<p class="sc-p">Phones show up here as they join. Titles everyone likes rise to the top.</p>'}<div class="cm-dots">${[...this.phones.values()].map((p) => `<span class="cm-ph${p.done ? ' done' : ''}"><i data-lucide="smartphone"></i>${esc(p.name)}</span>`).join('')}</div>
      ${top.length ? `<h5 class="mg-h">Leading</h5><div class="cm-top">${top.map(({ m, y }) => `<span class="cm-t"><span class="cm-poster" style="background-image:url('${esc(String(m.poster || '').replace(/'/g, '%27').replace(/\\/g, '%5C'))}')"></span><b>${esc(m.name)}</b><small>${y} of ${n}</small></span>`).join('')}</div>` : ''}</div></div>`;
    icons();
  },
  /* phones still connected (locked or closed ones drop out after 15 s), so one phone that left can't block a match */
  active() { return [...this.phones.keys()].filter((id) => Remote.peers.has(id)); },
  check(only) {
    if (this.matched || !this.id) return;
    const everyone = this.active(); if (!everyone.length) return;
    for (const [mid, s] of this.votes) {
      if (only && mid !== only) continue;
      if (everyone.every((id) => s.has(id))) { this.matched = this.deck.find((x) => x.id === mid) || null; if (this.matched) { this.send({ op: 'match', mid }); this.paint(); } return; }
    }
  },
  tidy() {
    if (!this.id) { clearInterval(this.liveT); return; }
    let gone = false; this.phones.forEach((p, id) => { if (!Remote.peers.has(id)) { this.phones.delete(id); gone = true; } });
    if (gone && !this.matched) { this.paint(); this.check(); }
  },
  onMsg(m) {
    if (!m || m.t !== 'cm' || !m._from) return false;
    if (!this.id) { if (m.op === 'join') Remote.bus.send({ t: 'cm', op: 'end', _to: m._from }); return true; }
    const from = m._from, ph = this.phones.get(from) || { name: String(m.name || 'Phone').slice(0, 20), done: false };
    if (m.op === 'join') { this.phones.set(from, ph); this.push(from); this.paint(); return true; }
    if (m.id !== this.id) return true;
    this.phones.set(from, ph);
    if (m.op === 'vote' && m.mid) {
      const s = this.votes.get(m.mid) || new Set(); if (m.yes) s.add(from); else s.delete(from); this.votes.set(m.mid, s);
      if (m.yes) this.check(m.mid);
    }
    if (m.op === 'done') ph.done = true;
    this.paint(); return true;
  },
  init() {
    const on = Remote.onMsg.bind(Remote);
    Remote.onMsg = function (m) { if (m && m.t === 'cm') { if (m._from) Remote.peers.set(m._from, { ...(Remote.peers.get(m._from) || { name: 'Phone' }), at: Date.now() }); Couch.onMsg(m); return; } return on(m); };
    COMMANDS.push({ label: 'Couch match: swipe on phones to pick a film together', icon: 'users', run: () => Couch.open() });
    // next to "Tune" on the For you row
    const fy = renderForYouRow;
    renderForYouRow = async function () {
      const r = await fy.apply(this, arguments);
      try { const t = $('[data-fy-tune]'); if (t && !$('[data-fy-couch]')) { t.insertAdjacentHTML('afterend', '<button class="btn btn-ghost btn-sm" type="button" data-nav data-fy-couch><i data-lucide="users"></i>Couch match</button>'); $('[data-fy-couch]').onclick = () => Couch.open(); icons(); } } catch (e) { /* row not drawn */ }
      return r;
    };
  },
};

/* ---------------- 8 Kids episode allowance ---------------- */
const Allowance = {
  day: () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10), // the day turns over at 4 am
  limit() { if (!Seats.kids()) return 0; const n = Number(Seats.cur().epLimit) || 0; return n > 0 ? n : 0; },
  state() { const s = Store.raw.get(`allow:${SEAT}`, null); return s && s.day === this.day() ? s : { day: this.day(), ids: [], extra: 0 }; },
  count() { return this.state().ids.length; },
  left() { const l = this.limit(); if (!l) return Infinity; const s = this.state(); return l + (s.extra || 0) - s.ids.length; },
  note(id) { if (!this.limit()) return; const s = this.state(); if (!s.ids.includes(id)) { s.ids.push(id); Store.raw.set(`allow:${SEAT}`, s); } },
  goodnight(after) {
    const el = X8.layer('goodnight', { label: 'That’s all for today', full: true });
    const n = this.count();
    X8.body('goodnight').innerHTML = `<div class="gn-box"><span class="gn-moon"><i data-lucide="moon"></i></span><h2 class="x8-h">That’s all for today</h2><p class="sc-p">${n} ${n === 1 ? 'show' : 'shows'} watched. See you tomorrow!</p>
      <div class="inrow"><button class="btn btn-prime" type="button" data-nav data-x8close>OK</button>${Seats.owner().pin ? '<button class="btn btn-ghost btn-sm" type="button" data-nav id="gnMore"><i data-lucide="lock"></i>Grown-up: one more</button>' : ''}</div></div>`;
    icons(); X8.open('goodnight'); requestAnimationFrame(() => el.classList.add('gn-on'));
    const m = $('#gnMore');
    if (m) m.onclick = () => { Seats.unlocked = false; Seats.guard(() => { const s = this.state(); s.extra = (s.extra || 0) + 1; Store.raw.set(`allow:${SEAT}`, s); X8.close('goodnight'); toast('One more, then bedtime', 'ok'); if (after) after(); }); };
    if (IS_TV) setTimeout(() => { const b = $('#goodnight [data-x8close]'); if (b) Nav.focus(b, true); }, 80);
  },
  init() {
    const mw = markWatched;
    markWatched = function (id) { Allowance.note(id); return mw.apply(this, arguments); };
    // the setting sits on the kids seat, next to its age limit
    const sec = SECTIONS.find((s) => s.id === 'seats');
    if (sec) {
      const rows = sec.rows;
      sec.rows = () => {
        const r = (typeof rows === 'function' ? rows() : rows).slice(); if (!Seats.list().some((s) => s.kids)) return r;
        const at = r.findIndex((x) => x.key === 'kidsAge');
        r.splice(at < 0 ? r.length : at + 1, 0, { key: 'kidsEpLimit', label: 'Kids seats: shows per day', help: 'Episodes and films a kids seat can watch each day. It stops at the end of one, never in the middle, and a grown-up PIN can allow one more. The day starts at 4 am.', type: 'select', num: true,
          options: [[0, 'No limit'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']],
          get: () => { const k = Seats.list().find((s) => s.kids); return k ? Number(k.epLimit) || 0 : 0; },
          set: (v) => { Seats.saveList(Seats.list().map((s) => (s.kids ? { ...s, epLimit: Number(v) || 0 } : s))); toast(v ? `Kids seats: ${v} a day` : 'Kids seats: no daily limit', 'ok'); } });
        return r;
      };
    }
    video.addEventListener('ended', () => { if (this.limit() && this.left() <= 0 && !$('#player').hidden && P.stream && !P.stream.ytId) { closePlayer(); this.goodnight(); } });
  },
  /* from the playStream wrapper: false stops playback */
  allow(ctx, stream, go) {
    if (!this.limit() || stream.ytId) return true;
    const id = ctx.video ? ctx.video.id : ctx.meta.id;
    if (this.state().ids.includes(id) || this.left() > 0) return true;
    // finishing something started before the limit was reached is fine
    const p = S.progress[id]; if (p && p.t > 60) return true;
    if (!$('#player').hidden) closePlayer();
    this.goodnight(go); return false;
  },
};

/* ---------------- 9 Scene links ---------------- */
const SceneLink = {
  url() {
    const ctx = P.ctx; if (!ctx) return '';
    const n = ScriptClock.now(), d = pDur();
    const q = new URLSearchParams({ type: ctx.meta.type, id: ctx.meta.id, t: String(Math.floor(pNow())) });
    if (ctx.video) q.set('video', ctx.video.id);
    if (isFinite(d)) q.set('d', String(Math.round(d)));
    if (n) { q.set('su', n.su); q.set('ss', String(n.ss)); }
    return `${Gaps.BASE}#play?${q.toString()}`;
  },
  async share() {
    const url = this.url(); if (!url) return;
    const m = P.ctx.meta, title = `${m.name} at ${fmtTime(pNow())} · MKCinema`;
    if (navigator.share && TOUCH_UI && !IS_TV) { try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    if (IS_TV) {
      X8.layer('sceneLink', { label: 'Share this moment', icon: 'share-2', eyebrow: 'Share this moment' });
      X8.body('sceneLink').innerHTML = `<h2 class="x8-h">${esc(m.name)} at ${fmtTime(pNow())}</h2><p class="sc-p">Scan to get the link on your phone. It opens MKCinema at this line, on whatever source your friend has.</p><div class="qr-wrap ps-qr">${QR.svg(url)}</div>`;
      X8.open('sceneLink'); return;
    }
    if (!(await copyText(url, 'Link copied. It opens this moment in your friend’s MKCinema, on their own source.', 4600))) prompt('Copy this link', url);
  },
  init() {
    // Deep.play now also reads the line (su, ss) and the length (d)
    Deep.play = async function (q) {
      const type = q.get('type'), id = q.get('id'), vid = q.get('video'), url = q.get('stream'), t = Number(q.get('t')) || 0;
      if (!type || !id) return;
      let meta = { id, type, name: 'Loading…' };
      try { meta = remember({ ...meta, ...((await engine.fetchMeta(type, id)) || {}) }); } catch (e) { /* basics */ }
      const v = type === 'series' && meta.videos ? meta.videos.find((x) => videoIdFor(meta, x) === vid) || null : null;
      let streams = [], pick = null;
      if (url && /^https?:/i.test(url)) {
        let headers = null; try { headers = q.get('h') ? JSON.parse(decodeURIComponent(escape(atob(q.get('h'))))) : null; } catch (e) { headers = null; }
        pick = { name: 'Handoff', title: 'Sent from your other screen', url, _addon: 'Handoff', _handoff: true, behaviorHints: headers ? { proxyHeaders: { request: headers } } : {} };
        pick._tel = Telemetry.parse(pick); streams = [pick];
        engine.fetchStreams(type, vid || id).then((r) => { if (P.stream === pick && P.ctx) { P.ctx.streams = [pick, ...r.streams]; renderSourceDrawer(); } }).catch(() => {});
      } else { streams = (await engine.fetchStreams(type, vid || id)).streams; pick = pickBest(streams); }
      if (!pick) { openDetail(meta, { videoId: vid }); return; }
      const su = q.get('su') || '', ss = q.get('ss'), d = Number(q.get('d')) || 0;
      if (!Allowance.allow({ meta, video: v }, pick, null)) return;
      toast(`Picking up ${meta.name} at ${fmtTime(t)}`, 'ok');
      playStream({ meta, video: v, streams }, pick, { startAt: t, land: { d, su: /^https?:/i.test(su) ? su : '', ss: ss != null && ss !== '' ? Number(ss) : null } });
    };
    const h = Deep.handle.bind(Deep);
    Deep.handle = async function () {
      if (location.hash.startsWith('#margins=')) { const raw = location.hash.slice(9); history.replaceState(null, '', location.pathname); Margins.import(raw); return; }
      return h();
    };
    addEventListener('hashchange', () => { if (location.hash.startsWith('#margins=')) Deep.handle(); });
    if (location.hash.startsWith('#margins=')) setTimeout(() => Deep.handle(), 1200);
  },
};

/* ---------------- 10 Never miss a line ---------------- */
const LineSnap = {
  pausedAt: null, pausedWhen: 0, skip: false,
  on() { return CFG.lineSnap !== false; },
  init() {
    video.addEventListener('pause', () => { if (video.seeking || video.ended) return; this.pausedAt = pNow(); this.pausedWhen = Date.now(); const s = ScriptClock.pick(); if (s) ScriptClock.text(s); });
    video.addEventListener('seeking', () => { if (!video.paused) return; if (this.pausedAt != null && Math.abs(pNow() - this.pausedAt) > 0.5) this.pausedAt = null; });
    video.addEventListener('play', () => this.resume());
  },
  async resume() {
    const at = this.pausedAt, when = this.pausedWhen; this.pausedAt = null;
    if (!this.on() || at == null || Date.now() - when < 1500 || Party.applying || Party.code || P.remux || $('#lastTime:not([hidden])')) return;
    // the subtitles on screen first (their times are what you saw), else the script when its timing is known
    let cues = null;
    const tr = typeof activeTrack === 'function' ? activeTrack() : null;
    if (tr && tr.cues && tr.cues.length) cues = Array.from(tr.cues).map((c) => ({ s: c.startTime, e: c.endTime }));
    else { const sub = ScriptClock.pick(); if (sub && ScriptClock.known(sub) && ScriptClock.cache.has(ScriptClock.subKey(sub))) cues = (await ScriptClock.cues(sub)).list; }
    if (!cues || !cues.length || Math.abs(pNow() - at) > 0.6) return;
    // the line being spoken when you paused, or one that had just started
    const c = cues.find((x) => x.s <= at + 0.05 && x.e >= at - 0.3);
    if (!c) return;
    const back = at - c.s;
    if (back < 0.4 || back > 8) return;
    pSeek(Math.max(0, c.s - 0.25), { user: false });
  },
};

/* ---------------- Player wiring ---------------- */
{
  const ps = playStream;
  playStream = async function (ctx, stream, opts = {}) {
    if (!stream || !ctx) return ps.apply(this, arguments);
    if (!Allowance.allow(ctx, stream, () => ps.call(this, ctx, stream, opts))) return;
    const key = ctx.video ? ctx.video.id : ctx.meta.id;
    const prev = P.stream && P.ctx ? { stream: P.stream, key: P.ctx.video ? P.ctx.video.id : P.ctx.meta.id, d: pDur(), n: ScriptClock.now() } : null;
    try { Land.plan(ctx, stream, opts || {}, prev); } catch (e) { /* plain resume */ }
    const p = S.progress[key], at = opts && opts.startAt != null ? opts.startAt : (p && CFG.resume ? p.t : null);
    const r = await ps.call(this, ctx, stream, opts);
    if (!stream.ytId && P.stream === stream && (!prev || prev.key !== key)) LastTime.arm(ctx, stream, at, p);
    return r;
  };
  // Find a line, Notes and Share this moment in the player's More tab
  const mh = PxMore.html.bind(PxMore), mb = PxMore.bind.bind(PxMore);
  PxMore.html = function () {
    return `${mh()}<h5>Info · this moment</h5>
      <button type="button" data-scfind><i data-lucide="search"></i>Find a line</button>
      <button type="button" data-scnote><i data-lucide="message-square-text"></i>Leave a note here</button>
      <button type="button" data-sclink><i data-lucide="share-2"></i>Share this moment</button>
      <button type="button" data-scphone><i data-lucide="smartphone"></i>Subtitles on phones</button>`;
  };
  PxMore.bind = function (m) {
    mb(m);
    const on = (sel, fn) => { const b = $(sel, m); if (b) b.onclick = () => { m.hidden = true; fn(); }; };
    on('[data-scfind]', () => Lines.openPlayer());
    on('[data-scnote]', () => Margins.open());
    on('[data-sclink]', () => SceneLink.share());
    on('[data-scphone]', () => PhoneSubs.open());
  };
  // X-Ray's "This scene" tab gets the same three
  const xr = XRay.render.bind(XRay);
  XRay.render = function () {
    xr();
    if (this.tab !== 'scene') return;
    const mk = $('#xrMark'); if (!mk || $('#xrLine')) return;
    mk.insertAdjacentHTML('beforeend', '<button class="btn btn-ghost btn-sm" type="button" id="xrLine"><i data-lucide="search"></i>Find a line</button><button class="btn btn-ghost btn-sm" type="button" id="xrNoteB"><i data-lucide="message-square-text"></i>Leave a note</button><button class="btn btn-ghost btn-sm" type="button" id="xrShare"><i data-lucide="share-2"></i>Share this moment</button>');
    icons();
    $('#xrLine').onclick = () => { this.hide(); Lines.openPlayer(); };
    $('#xrNoteB').onclick = () => { this.hide(); Margins.open(); };
    $('#xrShare').onclick = () => SceneLink.share();
  };
  // the details page: Find a line next to Share
  const rd = renderDetail;
  renderDetail = function () {
    const r = rd.apply(this, arguments);
    try {
      const anchor = $('#dShare') || $('#dList');
      if (anchor && !$('#dLine') && D.meta && (D.meta.type === 'movie' || D.meta.type === 'series')) { anchor.insertAdjacentHTML('afterend', '<button class="btn btn-ghost" type="button" id="dLine" data-nav><i data-lucide="search"></i>Find a line</button>'); $('#dLine').onclick = () => Lines.openDetail(); icons(); }
    } catch (e) { /* details still work */ }
    return r;
  };
  const cp = closePlayer;
  closePlayer = async function () { LastTime.hide(); clearTimeout(LastTime.t); Land.pending = null; return cp.apply(this, arguments); };
  COMMANDS.push(
    { label: 'Find a line in what’s playing', icon: 'search', run: () => (P.ctx && !$('#player').hidden ? Lines.openPlayer() : D.meta && !$('#detail').hidden ? Lines.openDetail() : toast('Open a film or play it first')) },
    { label: 'Read subtitles on your phone', icon: 'smartphone', run: () => PhoneSubs.open() },
  );
  scAddRows('subtitles', 'subAutoSync', [
    { key: 'lineSnap', label: 'Never miss a line', help: 'After a pause, playback picks up at the start of the sentence that was being spoken.', type: 'toggle', get: () => CFG.lineSnap !== false, set: (v) => setCfg('lineSnap', v) },
    { key: 'lastTime', label: 'Last time…', help: 'Coming back after two days or more, the last few lines before you stopped show first. Only what you already saw.', type: 'toggle', get: () => CFG.lastTime !== false, set: (v) => setCfg('lastTime', v) },
    { key: 'margins', label: 'Notes while watching', help: 'Notes left at a moment (by another seat, or a friend’s shared notes) pop up at that moment.', type: 'toggle', get: () => CFG.margins !== false, set: (v) => setCfg('margins', v) },
    { key: 'phoneSubs', label: 'Subtitles on phones', help: 'Everyone reads their own language on their own phone, in step with this screen.', type: 'button', text: 'Show the code', icon: 'smartphone', run: () => { closeLayer('settings'); PhoneSubs.open(); } },
  ]);
  scAddRows('devices', null, [
    { key: 'couchMatch', label: 'Couch match', help: 'Everyone swipes on their phone through titles from your watchlists and picks. The first one everybody likes plays here.', type: 'button', text: 'Start', icon: 'users', run: () => { closeLayer('settings'); Couch.open(); } },
  ]);
}
PartyLine.init(); Land.init(); PhoneSubs.init(); Margins.init(); Couch.init(); Allowance.init(); SceneLink.init(); LineSnap.init();
