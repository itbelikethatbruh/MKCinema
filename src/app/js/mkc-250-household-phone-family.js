
/* =====================================================================
   2.50 Household and phone
   1  Family Helper: someone you trust looks after this screen from their phone, from anywhere. They see what is on it,
      fix the usual things (subtitles, sound, a stuck film) and can send a message to the screen. A banner shows while
      they are connected, and Settings removes them.
   2  Take it with you: one tap on the phone remote and the film carries on on the phone at the same line. Send it back
      to the TV the same way.
   4  Sound from another source: picture from one source, sound from another release (a dub), kept in step.
   5  MK Channel: switch on and something is already playing. Channels made from your own progress, watchlist and Home.
   7  Stop at a good moment: the sleep timer waits for a pause in the dialogue, so it never stops mid-sentence.
   9  Learn mode: tap any word in the subtitles to translate it, a translated line underneath, pause after each line,
      and a list of the words you saved.
   10 Replay with captions: going back a few seconds turns subtitles on for just those seconds.
   Everything runs on this device. Phone messages travel sealed over the paired remote channel.
   ===================================================================== */
const F50 = {
  base() { return `${PUBLIC_ORIGIN}${location.pathname.replace(/[^/]*$/, '')}`; },
  played() { return !$('#player').hidden && P.ctx && P.stream; },
  /* the subtitle a viewer would want: their own language, else English, else the first */
  subIdx() {
    const l = P.subs || []; if (!l.length) return -1;
    const want = CFG.subLang && CFG.subLang !== 'off' ? langName(CFG.subLang) : '';
    let i = want ? l.findIndex((s) => langName(s.lang) === want) : -1;
    if (i < 0) i = l.findIndex((s) => /^(en|eng|english)$/i.test(String(s.lang || '')));
    return i < 0 ? 0 : i;
  },
  def(key, v) { if (CFG[key] === undefined) { CFG[key] = v; saveCfg(); } },
  raw: {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  },
};

/* ---------------- 10 Replay with captions ----------------
   A jump back of 4 to 40 seconds while subtitles are off turns them on until playback is back where you were. Jumps
   made by the app itself (picking up a sentence after a pause, a watch party, landing on a line) never count. */
const ReplayCC = {
  until: 0, idx: -1, stream: null, key: '', at: 0, lastT: 0, playAt: 0,
  on() { return CFG.replayCC !== false; },
  init() {
    video.addEventListener('timeupdate', () => { if (!video.seeking) this.lastT = pNow(); this.tick(); });
    video.addEventListener('play', () => { this.playAt = Date.now(); });
    video.addEventListener('seeking', () => {
      const from = this.lastT, to = pNow(), back = from - to;
      if (!this.on() || !F50.played() || back < 4 || back > 40) return;
      if (Date.now() - this.playAt < 1500 || (typeof Party !== 'undefined' && (Party.applying || Party.code))) return;
      this.start(from);
    });
  },
  async start(until) {
    if (this.until) { this.until = Math.max(this.until, until); return; }
    if (P.curSub >= 0 || !P.subs || !P.subs.length) return;
    const i = F50.subIdx(); if (i < 0) return;
    this.until = until; this.idx = i; this.stream = P.stream; this.key = ScriptClock.subKey(P.subs[i]); this.at = Date.now();
    await selectSub(i, { auto: true });
    if (this.until && this.mine()) toast('Subtitles on for the replay', 'info', 2000, 'subs');
  },
  /* ours while the subtitle on screen is the one turned on here (the list can be re-sorted as more add-ons answer) */
  mine() { const c = P.curSub >= 0 ? P.subs[P.curSub] : null; return !!c && ScriptClock.subKey(c) === this.key; },
  tick() {
    if (!this.until) return;
    if (P.stream !== this.stream) { this.clear(); return; }
    // turning on takes a moment (the file downloads); after that, a change by the viewer ends it
    if (!this.mine()) { if (Date.now() - this.at > 4000) this.clear(); return; }
    if (pNow() >= this.until) { this.clear(); selectSub(-1); }
  },
  clear() { this.until = 0; this.idx = -1; this.stream = null; this.key = ''; },
};

/* ---------------- 7 Stop at a good moment ----------------
   About three minutes before a sleep timer runs out, the subtitles (or the script, when its timing is known) show where
   the dialogue pauses. The timer moves to the nearest real pause and fades out there. No dialogue to read: the timer
   runs as before. */
const SmartSleep = {
  vt: 0, planned: false, fadeAt: 0, vol0: null,
  on() { return CFG.sleepSmart !== false; },
  clear() { if (this.vol0 != null) { video.volume = this.vol0; this.vol0 = null; } this.vt = 0; this.planned = false; this.fadeAt = 0; },
  async cues() {
    const tr = typeof activeTrack === 'function' ? activeTrack() : null;
    if (tr && tr.cues && tr.cues.length > 20) return Array.from(tr.cues).map((c) => ({ s: c.startTime, e: c.endTime }));
    try { const r = await ScriptClock.cues(); if (r && r.mapped && r.list.length > 20) return r.list; } catch (e) { /* no script */ }
    return null;
  },
  /* the best pause near video time T: long ones win, near ones win */
  pick(list, T) {
    let best = null;
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1], gap = b.s - a.e;
      if (gap < 3 || a.e < T - 120 || a.e > T + 240 || a.e < pNow() + 20) continue;
      const score = Math.min(gap, 12) * 10 - Math.abs(a.e - T) / 6;
      if (!best || score > best.score) best = { at: a.e, gap, score };
    }
    return best;
  },
  async plan() {
    this.planned = true;
    const left = (Tools.sleepAt - Date.now()) / 1000; if (!(left > 0)) return;
    const list = await this.cues(); if (!list || !Tools.sleepAt) return;
    const T = pNow() + left * (video.playbackRate || 1), p = this.pick(list.slice().sort((x, y) => x.s - y.s), T);
    if (!p) { MKLog.add('info', 'Sleep timer: no pause in the dialogue nearby, keeping the time'); return; }
    this.vt = p.at + 0.3; Tools.sleepAt = 0; Tools.paintMarks();
    MKLog.add('info', `Sleep timer: stopping in a ${p.gap.toFixed(1)} s pause at ${fmtTime(this.vt)}`);
  },
  tick() {
    if (!this.vt || $('#player').hidden) return;
    const t = pNow();
    if (t < this.vt - 900) { this.clear(); return; } // went far back: start over
    if (t < this.vt) return;
    if (!this.fadeAt) { this.fadeAt = Date.now(); this.vol0 = video.volume; }
    const k = (Date.now() - this.fadeAt) / 2500;
    if (k < 1) { video.volume = Math.max(0, this.vol0 * (1 - k)); return; }
    video.pause(); this.clear();
    showMsg('Sleep timer', 'Paused in a quiet moment, between lines. Press play to carry on.', '<button class="btn btn-prime" type="button" id="slpGo"><i data-lucide="play"></i>Keep watching</button>');
    const g = $('#slpGo'); if (g) g.onclick = () => { hideMsg(); video.play().catch(() => {}); };
    icons();
  },
  init() {
    F50.def('sleepSmart', true);
    const set = Tools.setSleep.bind(Tools);
    Tools.setSleep = function (min) { SmartSleep.clear(); return set(min); };
    const tick = Tools.tick.bind(Tools);
    Tools.tick = function () {
      if (SmartSleep.on() && Tools.sleepAt && !SmartSleep.planned && Tools.sleepAt - Date.now() < 180000) SmartSleep.plan();
      SmartSleep.tick();
      return tick();
    };
    const label = Tools.sleepLabel.bind(Tools);
    Tools.sleepLabel = function () { return SmartSleep.vt ? `at ${fmtTime(SmartSleep.vt)}, in a pause` : label(); };
    const reset = Tools.reset.bind(Tools);
    Tools.reset = function () { SmartSleep.clear(); return reset(); };
  },
};

/* ---------------- 9 Learn mode ----------------
   The subtitle on screen is drawn by MKCinema instead of the browser, so every word can be tapped. A tap pauses and
   translates the word (on this device when the browser can, else the subtitle translation service), with the line
   translated underneath. Pause after each line, replay the line, and keep the words you save. */
const LearnMode = {
  on: false, last: '', box: null, autoPause: false, pauseAt: -1, tr: null, trKey: '', memo: new Map(), cur: null,
  words() { const l = Store.get('learnWords', []); return Array.isArray(l) ? l : []; },
  saveWords(l) { Store.set('learnWords', l.slice(-500)); },
  from() { const s = P.subs && P.subs[P.curSub]; return s && s.lang ? SubLang.bcp(s.lang) || 'en' : 'en'; },
  to() { return SubTranslate.target(); },
  start() {
    if (!F50.played()) return;
    if (P.curSub < 0) { const i = F50.subIdx(); if (i < 0) { toast('Learn mode needs subtitles. This film has none yet.', 'err', 4200); return; } selectSub(i, { auto: true }); }
    if (typeof AssR !== 'undefined' && AssR.on && AssR.on()) toast('Styled subtitles are shown as plain text in Learn mode', 'info', 3200, 'learn');
    this.on = true; document.body.classList.add('learn-on'); this.paint(true);
    toast('Learn mode: tap a word to translate it', 'ok', 3200, 'learn');
  },
  stop() {
    this.on = false; this.cur = null; this.last = ''; document.body.classList.remove('learn-on');
    const t = activeTrack() || Array.from(video.textTracks).find((x) => x.mode === 'hidden' && x._learn);
    if (t && t._learn) { t.mode = 'showing'; t._learn = false; }
    if (this.box) this.box.hidden = true; this.hidePop();
  },
  track() { return Array.from(video.textTracks).find((t) => t.mode === 'showing' || (t.mode === 'hidden' && t._learn)) || null; },
  paint(force) {
    if (!this.on) return;
    if ($('#player').hidden) { this.stop(); return; }
    const t = this.track();
    if (t && t.mode === 'showing') { t.mode = 'hidden'; t._learn = true; }
    let box = this.box;
    if (!box) { box = this.box = document.createElement('div'); box.id = 'learnLine'; box.className = 'learn-line'; box.setAttribute('aria-live', 'off'); $('#stage').appendChild(box); box.addEventListener('click', (e) => this.click(e)); }
    box.hidden = false;
    const cues = t && t.activeCues ? Array.from(t.activeCues) : [];
    const text = cues.map((c) => String(c.text || '').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '')).join('\n').trim();
    if (!force && text === this.last) return;
    // pause after each line: the line that just ended
    if (this.autoPause && this.cur && !text && !video.paused && this.pauseAt !== this.cur.s) { this.pauseAt = this.cur.s; video.pause(); }
    this.last = text; this.cur = cues[0] ? { s: cues[0].startTime, e: cues[0].endTime, t: text } : this.cur && !text ? this.cur : null;
    if (!text) { box.innerHTML = ''; return; }
    const words = (l) => l.split(/(\s+)/).map((w) => (/\S/.test(w) ? `<span class="lw" data-lw="${esc(w)}">${esc(w)}</span>` : w)).join('');
    box.innerHTML = `<div class="ll-o">${text.split('\n').map((l) => `<div>${words(l)}</div>`).join('')}</div><div class="ll-t" id="learnTr"></div>`;
    this.translateLine(text);
  },
  async translator(from, to) {
    const key = `${from}>${to}`; if (this.trKey === key) return this.tr;
    this.trKey = key; this.tr = null;
    try { this.tr = await SubTranslate.device(from, to, true); } catch (e) { this.tr = null; }
    return this.tr;
  },
  async translate(text) {
    const from = this.from(), to = this.to();
    if (!text || SubLang.base(from) === SubLang.base(to)) return '';
    const key = `${from}>${to}|${text}`; if (this.memo.has(key)) return this.memo.get(key);
    let out = '';
    try {
      const tr = await this.translator(from, to);
      if (tr) out = await tr.translate(text);
      else if (SubCloud.can(from, to) && SubCloud.ready()) out = ((await SubCloud.run(from, to, [text])) || [])[0] || '';
    } catch (e) { if (!this.tr) SubCloud.fail(e); }
    if (this.memo.size > 600) this.memo.clear(); this.memo.set(key, out || ''); return out || '';
  },
  async translateLine(text) {
    const want = text, out = await this.translate(text.replace(/\n/g, ' '));
    const el = $('#learnTr'); if (el && this.last === want) el.textContent = out;
  },
  clean(w) { return String(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); },
  async click(e) {
    const w = e.target.closest('[data-lw]'); if (!w) return;
    e.stopPropagation();
    const word = this.clean(w.dataset.lw); if (!word) return;
    if (!video.paused) video.pause();
    const line = this.last.replace(/\n/g, ' ');
    let pop = $('#learnPop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'learnPop'; pop.className = 'learn-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Word'); $('#stage').appendChild(pop); }
    const saved = this.words().some((x) => x.w.toLowerCase() === word.toLowerCase() && x.lang === this.from());
    pop.innerHTML = `<b class="lp-w">${esc(word)}</b><span class="lp-t">Translating…</span><div class="lp-acts"><button class="btn btn-prime btn-sm" type="button" data-nav data-lp="save"${saved ? ' disabled' : ''}><i data-lucide="bookmark"></i>${saved ? 'Saved' : 'Save word'}</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-lp="line"><i data-lucide="rotate-ccw"></i>Hear the line again</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-lp="close">Close</button></div>`;
    pop.hidden = false; icons(); wakeHud(true);
    const r = w.getBoundingClientRect(), st = $('#stage').getBoundingClientRect();
    pop.style.left = `${clamp(r.left - st.left + r.width / 2, 120, st.width - 120)}px`; pop.style.top = `${Math.max(12, r.top - st.top - 12)}px`;
    const tr = await this.translate(word), el = $('.lp-t', pop);
    if (el) el.textContent = tr && tr.toLowerCase() !== word.toLowerCase() ? tr : tr ? 'Same in your language' : 'No translation available here';
    pop.onclick = (ev) => {
      const b = ev.target.closest('[data-lp]'); if (!b) return; ev.stopPropagation();
      if (b.dataset.lp === 'save') { const l = this.words(); l.push({ w: word, t: tr || '', lang: this.from(), line, title: P.ctx.meta.name, at: Date.now(), link: typeof SceneLink !== 'undefined' ? SceneLink.url() : '' }); this.saveWords(l); b.disabled = true; b.innerHTML = '<i data-lucide="check"></i>Saved'; icons(); toast(`Saved “${word}” to My words`, 'ok', 1800, 'learn'); }
      if (b.dataset.lp === 'line') { this.hidePop(); this.replay(); }
      if (b.dataset.lp === 'close') this.hidePop();
    };
  },
  hidePop() { const p = $('#learnPop'); if (p) p.hidden = true; },
  replay() { const c = this.cur; if (!c) return; this.pauseAt = -1; pSeek(Math.max(0, c.s - 0.3), { user: false }); video.play().catch(() => {}); },
  wordsHTML() {
    const l = this.words().slice().reverse();
    if (!l.length) return '<p class="sc-p">No saved words yet. Turn on Learn mode in the player (Options › Tools), then tap a word in the subtitles.</p>';
    return `<div class="lw-list">${l.slice(0, 200).map((x, i) => `<div class="lw-row"><span><b>${esc(x.w)}</b>${x.t ? ` · ${esc(x.t)}` : ''}<small>${esc(x.line)}</small><small class="lw-src">${esc(x.title || '')} · ${esc(SubLang.name ? SubLang.name(x.lang) : x.lang)}</small></span><span class="lw-acts">${x.link ? `<a class="btn btn-ghost btn-sm" href="${esc(x.link)}" data-nav>Play</a>` : ''}<button class="btn btn-ghost btn-sm" type="button" data-nav data-lwdel="${l.length - 1 - i}" aria-label="Remove ${esc(x.w)}"><i data-lucide="trash-2"></i></button></span></div>`).join('')}</div>`;
  },
  openWords() {
    X8.layer('learnWords', { label: 'My words', icon: 'book-open', eyebrow: 'Learn mode', wide: true });
    const body = X8.body('learnWords'), paint = () => {
      body.innerHTML = `<h2 class="x8-h">My words</h2>${this.wordsHTML()}${this.words().length ? '<div class="actions"><button class="btn btn-ghost btn-sm" type="button" data-nav id="lwCopy"><i data-lucide="copy"></i>Copy as a list</button></div>' : ''}`;
      $$('[data-lwdel]', body).forEach((b) => b.addEventListener('click', () => { const l = this.words(); l.splice(Number(b.dataset.lwdel), 1); this.saveWords(l); paint(); }));
      const cp = $('#lwCopy', body); if (cp) cp.onclick = () => copyText(this.words().map((x) => `${x.w}\t${x.t}\t${x.line}`).join('\n'), 'Copied. Paste it into your flashcard app.');
      icons(); if (IS_TV) Nav.settle();
    };
    paint(); X8.open('learnWords');
  },
  init() {
    video.addEventListener('timeupdate', () => this.paint());
    video.addEventListener('seeked', () => { this.last = '\u0000'; this.paint(); });
    document.addEventListener('keydown', (e) => {
      if (!this.on || $('#player').hidden || e.ctrlKey || e.metaKey || e.altKey || rmText(document.activeElement)) return;
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); e.stopImmediatePropagation(); this.replay(); }
    }, true);
    const cp = closePlayer; closePlayer = async function () { LearnMode.stop(); return cp.apply(this, arguments); };
  },
};

/* ---------------- 4 Sound from another source ----------------
   A second, hidden audio player plays the other release; the film's own sound is muted. Releases at another frame rate
   (the 4 % PAL speed-up and friends) are scaled by their lengths; the rest lines up with a nudge, remembered per pair. */
const DubMix = {
  a: null, s: null, k: 1, off: 0, nudge: 0, key: '', loop: 0, how: '', guard: false, base: 1, vol: 1,
  active() { return !!this.a; },
  label(s) {
    let langs = []; try { const r = AudioPref.langs(s), set = r && r.langs ? r.langs : r; langs = [...(set || [])].map((l) => langName(l)); } catch (e) { langs = []; }
    return { langs, name: String(s.name || s._addon || 'Source').replace(/\s+/g, ' ').slice(0, 60), title: String(s.title || s.description || (s.behaviorHints && s.behaviorHints.filename) || '').replace(/\s+/g, ' ').slice(0, 120) };
  },
  candidates() {
    const l = (P.ctx && P.ctx.streams) || [];
    return l.filter((s) => s && s !== P.stream && !s.ytId && /^https?:/i.test(s.url || '') && !(s.behaviorHints && s.behaviorHints.proxyHeaders) && (!s._tel || BrowserPlay.ok(s)) && !X8.mixedBlocked(s.url)).slice(0, 60);
  },
  open() {
    if (!F50.played()) return;
    if (IS_TV) { toast('Sound from another source works on phones and computers. TVs can only play one source at a time.', 'info', 5200); return; }
    X8.layer('dubPick', { label: 'Sound from another source', icon: 'audio-lines', eyebrow: 'Sound from another source', wide: true });
    const body = X8.body('dubPick'), list = this.candidates();
    const rows = list.map((s, i) => { const L = this.label(s); return `<button class="dub-row" type="button" data-nav data-dub="${i}"><span class="dub-l">${L.langs.length ? L.langs.map((x) => `<em>${esc(x)}</em>`).join('') : '<em class="dim">Language not listed</em>'}</span><b>${esc(L.name)}</b><small>${esc(L.title)}</small></button>`; }).join('');
    body.innerHTML = `<h2 class="x8-h">Sound from another source</h2><p class="sc-p">Keep this picture and play the sound of another release, such as a dub in your language. MKCinema keeps the two in step. Releases at another frame rate are lined up by themselves; for others, use the nudge buttons until voices match lips.</p>
      ${this.active() ? `<div class="dub-now"><span>Now: <b>${esc(this.label(this.s).langs.join(', ') || this.label(this.s).name)}</b> · ${esc(this.howText())}</span>${this.nudgeHTML()}<button class="btn btn-ghost btn-sm" type="button" data-nav data-dub="off"><i data-lucide="x"></i>Back to this source’s sound</button></div>` : ''}
      ${rows ? `<div class="dub-list">${rows}</div>` : '<p class="sc-p">No other source of this title can play in this browser. Open the source list, wait for more add-ons to answer, then try again.</p>'}`;
    body.onclick = (e) => {
      const n = e.target.closest('[data-dubn]'); if (n) { this.setNudge(this.nudge + Number(n.dataset.dubn)); this.open(); return; }
      const b = e.target.closest('[data-dub]'); if (!b) return;
      if (b.dataset.dub === 'off') { this.stop(); X8.close('dubPick'); toast('Original sound back', 'ok', 1800, 'dub'); return; }
      const s = list[Number(b.dataset.dub)]; X8.close('dubPick'); if (s) this.start(s);
    };
    icons(); X8.open('dubPick');
  },
  nudgeHTML() { return `<div class="pl-nudge" role="group" aria-label="Nudge the sound">${[[-1, '−1 s'], [-0.25, '−¼'], [0.25, '+¼'], [1, '+1 s']].map(([v, l]) => `<button type="button" class="chip" data-nav data-dubn="${v}">${l}</button>`).join('')}<span class="tnum pl-v">${this.nudge ? `${this.nudge > 0 ? '+' : ''}${this.nudge.toFixed(2)} s` : 'no nudge'}</span></div>`; },
  howText() { return { fps: 'lined up by frame rate', same: 'same length as this picture', differs: 'a different length: nudge until voices match lips', '': 'getting ready' }[this.how] || ''; },
  pairKey(s) { return `${ScriptClock.streamKey(P.stream)}|${ScriptClock.streamKey(s)}`.slice(0, 600); },
  setNudge(v) {
    this.nudge = Math.round(v * 100) / 100; const m = Store.get('dubNudge', {}) || {}; m[this.key] = this.nudge;
    const keys = Object.keys(m); if (keys.length > 80) delete m[keys[0]]; Store.set('dubNudge', m); this.sync(true);
    toast(`Sound ${this.nudge > 0 ? '+' : ''}${this.nudge.toFixed(2)} s`, 'info', 1200, 'dub');
  },
  target() { return pNow() * this.k + this.off + this.nudge; },
  async start(s) {
    this.stop(true);
    const a = this.a = new Audio(); this.s = s; a.preload = 'auto'; a.src = s.url;
    this.key = this.pairKey(s); this.nudge = Number((Store.get('dubNudge', {}) || {})[this.key]) || 0; this.how = '';
    toast('Getting the other sound ready…', 'info', 3000, 'dub');
    const ok = await new Promise((res) => { const to = setTimeout(() => res(false), 25000); a.addEventListener('loadedmetadata', () => { clearTimeout(to); res(true); }, { once: true }); a.addEventListener('error', () => { clearTimeout(to); res(false); }, { once: true }); });
    if (this.a !== a) return;
    if (!ok || !isFinite(a.duration)) { this.stop(true); toast('That source’s sound could not be played here. Try another one.', 'err', 4600, 'dub'); return; }
    const dMain = pDur(), dDub = a.duration;
    this.k = isFinite(dMain) ? ScriptClock.fps(dMain, dDub) : 1; this.off = 0;
    this.how = this.k !== 1 ? 'fps' : isFinite(dMain) && Math.abs(dMain - dDub) <= 2 ? 'same' : 'differs';
    this.vol = video.muted ? 0 : video.volume; this.guard = true; video.muted = true; this.guard = false;
    a.volume = this.vol; this.sync(true);
    if (!video.paused) a.play().catch(() => { toast('Tap play once more to start the other sound', 'info', 3000, 'dub'); });
    clearInterval(this.loop); this.loop = setInterval(() => this.sync(false), 500);
    MKLog.add('info', `Other sound: ${this.how}, rate ${this.k.toFixed(4)}, nudge ${this.nudge}`);
    toast(`Sound from ${this.label(s).langs.join(', ') || 'the other source'} · ${this.howText()}`, 'ok', 3600, 'dub');
  },
  sync(hard) {
    const a = this.a; if (!a || a.readyState < 1) return;
    if (!F50.played()) { this.stop(); return; }
    this.base = (video.playbackRate || 1) * this.k;
    const want = this.target(), drift = a.currentTime - want;
    if (hard || Math.abs(drift) > 0.35) { try { a.currentTime = Math.max(0, want); } catch (e) { /* not seekable yet */ } a.playbackRate = this.base; }
    else if (Math.abs(drift) > 0.06) a.playbackRate = this.base * (1 - clamp(drift, -0.05, 0.05));
    else a.playbackRate = this.base;
    if (video.paused !== a.paused) { if (video.paused) a.pause(); else a.play().catch(() => {}); }
  },
  stop(quiet) {
    clearInterval(this.loop); this.loop = 0;
    const a = this.a; this.a = null; this.s = null; this.how = '';
    if (a) { try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) { /* gone */ } this.guard = true; video.muted = false; video.volume = this.vol; this.guard = false; }
    void quiet;
  },
  init() {
    ['play', 'pause', 'seeking', 'ratechange'].forEach((ev) => video.addEventListener(ev, () => { if (this.a) this.sync(ev === 'seeking'); }));
    video.addEventListener('waiting', () => { if (this.a) this.a.pause(); });
    video.addEventListener('volumechange', () => {
      if (!this.a || this.guard) return;
      // the film's own sound stays off; the volume you set goes to the other sound
      if (!video.muted) { this.vol = video.volume; this.a.volume = clamp(video.volume, 0, 1); this.guard = true; video.muted = true; this.guard = false; }
    });
    const ps = playStream; playStream = function () { DubMix.stop(true); return ps.apply(this, arguments); };
    const cp = closePlayer; closePlayer = async function () { DubMix.stop(true); return cp.apply(this, arguments); };
  },
};

/* ---------------- 5 MK Channel ----------------
   Channels made from what you have: Up next (your progress), Your watchlist, Films from your Home and a Series
   marathon, plus Peak Cinema scenes. Up next and the watchlist pick up where you left off; the Home channels run on the
   clock like real television, so you join a film already playing. A film ends, the next one starts. */
const MkChan = {
  on: false, ch: 0, list: [], i: 0, switching: false, hudT: 0, built: null, builtAt: 0,
  day() { return new Date().toISOString().slice(0, 10); },
  runtime(m) { const r = X8.runtimeMin(m); return r > 20 && r < 400 ? r : m.type === 'series' ? 45 : 105; },
  seen(m) { return typeof isWatched === 'function' && isWatched(m.id); },
  build() {
    if (this.built && Date.now() - this.builtAt < 60000) return this.built;
    const kid = (m) => !(typeof Seats !== 'undefined' && Seats.kids() && !Seats.kidSafe(m));
    const uniq = (l) => { const s = new Set(); return l.filter((m) => m && m.id && !s.has(m.id) && s.add(m.id)); };
    const up = []; const seenMeta = new Set();
    continueItems().forEach((p) => { if (seenMeta.has(p.metaId)) return; seenMeta.add(p.metaId); up.push({ meta: { id: p.metaId, type: p.type, name: p.name, poster: p.poster, background: p.background }, videoId: p.videoId, sub: p.type === 'series' && p.season != null ? `S${p.season} · E${p.episode}` : 'Pick up where you left off' }); });
    const wl = uniq(S.watchlist.slice()).filter((m) => !this.seen(m) && kid(m)).map((m) => ({ meta: m, sub: 'From your watchlist' }));
    const home = uniq([...S.metas.values()]).filter((m) => m.name && (m.poster || m.background) && kid(m));
    const films = X8.seeded(home.filter((m) => m.type === 'movie' && !this.seen(m)), `f${this.day()}`).slice(0, 40);
    const shows = X8.seeded(home.filter((m) => m.type === 'series' && !continueItems().some((p) => p.metaId === m.id)), `s${this.day()}`).slice(0, 30);
    const c = [
      { id: 'up', name: 'Up next', icon: 'play', items: up.slice(0, 30), mode: 'resume' },
      { id: 'wl', name: 'Your watchlist', icon: 'bookmark', items: wl.slice(0, 40), mode: 'resume' },
      { id: 'films', name: 'Films on now', icon: 'clapperboard', items: films.map((m) => ({ meta: m })), mode: 'clock' },
      { id: 'shows', name: 'Series marathon', icon: 'tv', items: shows.map((m) => ({ meta: m, sub: 'From episode one' })), mode: 'resume' },
      { id: 'scenes', name: 'Scenes', icon: 'flame', items: [], mode: 'peak' },
    ].filter((x) => x.items.length || x.mode === 'peak');
    this.built = c; this.builtAt = Date.now(); return c;
  },
  /* the clock channels: what is on now, and how far into it */
  now(chan) {
    if (chan.mode !== 'clock' || !chan.items.length) return { i: 0, at: 0 };
    const d = new Date(), t = (d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds();
    let s = 0, total = chan.items.reduce((n, x) => n + this.runtime(x.meta) * 60, 0), cur = t % Math.max(1, total);
    for (let i = 0; i < chan.items.length; i++) { const len = this.runtime(chan.items[i].meta) * 60; if (cur < s + len) { const at = cur - s; return at > len - 600 ? { i: (i + 1) % chan.items.length, at: 0 } : { i, at }; } s += len; }
    return { i: 0, at: 0 };
  },
  next(chan, i) { if (chan.mode === 'clock') return chan.items[(i + 1) % chan.items.length]; return chan.items[i + 1] || null; },
  async play(ch, idx) {
    const c = this.build(); if (!c.length) { toast('Add something to your watchlist or start a film, then MK Channel has something to show', 'info', 5000); return; }
    this.ch = (ch + c.length) % c.length; const chan = c[this.ch];
    if (chan.mode === 'peak') { this.on = false; if (!$('#player').hidden) { this.switching = true; await closePlayer(); this.switching = false; } X8.close('mkChan'); Peak.open(); return; }
    const n = this.now(chan); this.i = idx != null ? idx : n.i; const item = chan.items[this.i]; if (!item) return;
    this.on = true; X8.close('mkChan'); this.hud(chan, item);
    this.switching = true;
    try {
      if (chan.mode === 'resume' && item.videoId && S.progress[item.videoId]) await resume(item.videoId);
      else await quickPlay(item.meta);
      if (chan.mode === 'clock' && n.at > 60 && idx == null) {
        const want = n.at, id = item.meta.id;
        const jump = () => { if (P.ctx && P.ctx.meta.id === id && isFinite(pDur()) && pDur() > want + 60) pSeek(want, { user: false }); };
        video.addEventListener('loadedmetadata', jump, { once: true }); setTimeout(jump, 1200);
      }
    } finally { setTimeout(() => { this.switching = false; }, 1500); }
  },
  zap(d) { if (!this.on) return; this.play(this.ch + d); },
  advance() {
    if (!this.on) return; const chan = this.build()[this.ch]; if (!chan) return;
    const nx = this.next(chan, this.i); if (!nx) { this.on = false; toast(`That’s everything on ${chan.name}`, 'info', 3600); return; }
    this.play(this.ch, chan.items.indexOf(nx));
  },
  hud(chan, item) {
    let el = $('#mkChanHud');
    if (!el) { el = document.createElement('div'); el.id = 'mkChanHud'; el.className = 'mkc-hud'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = `<small>MK Channel ${this.ch + 1}</small><b>${esc(chan.name)}</b><span>${esc(item.meta.name || '')}</span><em>${IS_TV ? 'Options › Next channel' : 'Page Up / Page Down to change'}</em>`;
    el.classList.add('on'); clearTimeout(this.hudT); this.hudT = setTimeout(() => el.classList.remove('on'), 4200);
  },
  guide() {
    this.built = null; const c = this.build();
    X8.layer('mkChan', { label: 'MK Channel', icon: 'radio-tower', eyebrow: 'MK Channel', wide: true });
    const body = X8.body('mkChan');
    body.innerHTML = `<h2 class="x8-h">What’s on</h2><p class="sc-p">Channels made from your own progress, watchlist and Home. Pick one and something is already playing. Films on now runs on the clock like real TV.</p>
      <div class="mkc-grid">${c.map((ch, k) => {
        const n = this.now(ch), it = ch.items[n.i], nx = it ? this.next(ch, n.i) : null;
        return `<button class="mkc-ch" type="button" data-nav data-mkch="${k}"><span class="mkc-n tnum">${k + 1}</span><span class="mkc-t"><b><i data-lucide="${ch.icon}"></i>${esc(ch.name)}</b>${ch.mode === 'peak' ? '<small>Surf scenes by mood</small>' : `<small>Now: ${esc(it ? it.meta.name : '')}${ch.mode === 'clock' && n.at > 60 ? ` · ${Math.round(n.at / 60)} min in` : ''}</small>${nx ? `<small class="dim">Next: ${esc(nx.meta.name)}</small>` : ''}`}</span></button>`;
      }).join('')}</div>`;
    body.onclick = (e) => { const b = e.target.closest('[data-mkch]'); if (b) this.play(Number(b.dataset.mkch)); };
    icons(); X8.open('mkChan');
  },
  init() {
    video.addEventListener('ended', () => {
      if (!this.on) return;
      if (CFG.autoNext && P.ctx && P.ctx.video && nextVideo(P.ctx.meta, P.ctx.video)) return; // the next episode plays by itself
      setTimeout(() => this.advance(), 900);
    });
    const nd = window.MKNative && window.MKNative.done;
    if (nd) window.MKNative.done = function (pos, dur, ended) { const r = nd.apply(this, arguments); if (MkChan.on && ended) setTimeout(() => MkChan.advance(), 1200); return r; };
    const cp = closePlayer; closePlayer = async function () { if (!MkChan.switching) MkChan.on = false; return cp.apply(this, arguments); };
    document.addEventListener('keydown', (e) => {
      if (!this.on || $('#player').hidden) return;
      const d = { ChannelUp: 1, PageUp: 1, ChannelDown: -1, PageDown: -1 }[e.key]; if (!d) return;
      e.preventDefault(); e.stopImmediatePropagation(); this.zap(d);
    }, true);
  },
};

/* ---------------- 2 Take it with you ----------------
   Phone 'tk' {op: take} -> TV pauses and answers 'tk' {op: link, url}: the app link at this line, on this source when
   a phone can play it. The phone app keeps which TV it came from, so "Send back to the TV" opens the remote, which sends
   'tk' {op: back, type, id, video, pos, su, ss, d} and the TV lands on the same line. */
const TakeIt = {
  heavy(s) { const t = s && s._tel; const T = [s && s.name, s && s.title, s && s.behaviorHints && s.behaviorHints.filename].filter(Boolean).join(' ').toLowerCase(); return !!(t && (t.codec === 'HEVC' || t.codec === 'AV1' || t.hdr === 'Dolby Vision')) || /\b(2160p|4k|uhd|x265|hevc|remux)\b/.test(T) || !!(s && s._local) || !!P.remux; },
  link() {
    const m = P.ctx.meta, s = P.stream, q = new URLSearchParams({ type: m.type, id: m.id });
    if (P.ctx.video) q.set('video', P.ctx.video.id);
    if (!this.heavy(s) && /^https?:/i.test(s.url || '')) {
      q.set('stream', s.url);
      const h = s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request; if (h) q.set('h', b64json(h));
    }
    q.set('t', String(Math.floor(pNow() || 0)));
    const d = pDur(); if (isFinite(d)) q.set('d', String(Math.round(d)));
    const n = ScriptClock.now(); if (n) { q.set('su', n.su); q.set('ss', String(n.ss)); }
    return `${F50.base()}#play?${q.toString()}`;
  },
  take(from) {
    if (!F50.played() || !/^https?:$/.test(location.protocol)) { Remote.bus.send({ t: 'tk', op: 'none', _to: from }); return; }
    const url = this.link(), m = P.ctx.meta;
    Remote.bus.send({ t: 'tk', op: 'link', _to: from, url, title: m.name || '' });
    video.pause(); toast(`${m.name} carries on on your phone`, 'ok', 3600, 'tk');
  },
  async back(m) {
    if (m._from && Remote.bus) Remote.bus.send({ t: 'tk', op: 'landed', _to: m._from });
    if (Date.now() - (this.backAt || 0) < 8000) return; // the phone sends it more than once
    this.backAt = Date.now();
    const t = Math.max(0, Number(m.pos) || 0), d = Number(m.d) || 0, su = typeof m.su === 'string' ? m.su : '', ss = m.ss != null ? Number(m.ss) : null;
    if (!m.type || !m.id) return;
    const same = F50.played() && P.ctx.meta.id === m.id && (!m.video || (P.ctx.video && P.ctx.video.id === m.video));
    if (same) {
      let at = t;
      const sub = su ? (P.subs || []).find((x) => ScriptClock.subKey(x) === su) : null, map = sub ? ScriptClock.known(sub) : null;
      if (map && ss != null && isFinite(ss)) at = ScriptClock.toVideo(ss, map); else if (d) at = t * ScriptClock.fps(d, pDur());
      pSeek(at, { user: false }); video.play().catch(() => {});
    } else {
      const q = new URLSearchParams({ type: m.type, id: m.id, t: String(Math.floor(t)) });
      if (m.video) q.set('video', m.video); if (d) q.set('d', String(d)); if (su && ss != null) { q.set('su', su); q.set('ss', String(ss)); }
      Deep.play(q);
    }
    toast('Welcome back: picked up where your phone left off', 'ok', 3600, 'tk');
  },
  /* phone app: it came from a TV, so it can go back */
  from() { const x = F50.raw.get('mkc:tk'); return x && /^[A-Z0-9]{6}$/.test(x.code || '') && Date.now() - (x.at || 0) < 12 * 3600000 ? x : null; },
  sendBack() {
    const x = this.from(); if (!x || !F50.played()) return;
    const m = P.ctx.meta, n = ScriptClock.now(), d = pDur();
    F50.raw.set('mkc:tkback', { type: m.type, id: m.id, video: P.ctx.video ? P.ctx.video.id : '', t: Math.floor(pNow()), d: isFinite(d) ? Math.round(d) : 0, su: n ? n.su : '', ss: n ? n.ss : null, at: Date.now() });
    video.pause(); location.href = `${F50.base()}remote#${x.code}~back`;
  },
};

/* ---------------- 1 Family Helper ----------------
   Any phone this screen allowed can turn on help mode. While it is on, the screen shows who is helping. The phone can
   read what is on the screen (no picture, only names and states), apply simple fixes and leave a message. "Ask for help"
   leaves a note the helper's remote shows the next time it opens, from wherever they are. */
const FamilyHelp = {
  helpers: new Map(), paused: new Set(),
  asked() { const a = Store.get('fhAsk', 0); return a && Date.now() - a < 24 * 3600000 ? a : 0; },
  info() {
    const a = document.activeElement, s = Remote.state(), pl = F50.played();
    const focus = a && a !== document.body ? String(a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    let addons = 0; try { addons = engine.addons.filter((x) => x.enabled !== false && !x.builtin).length; } catch (e) { addons = 0; }
    let debrid = false; try { debrid = !!(typeof Vault !== 'undefined' && Vault.service && Vault.service()); } catch (e) { debrid = false; }
    return {
      where: s.where || (pl ? 'Playing' : ''), title: s.title || '', focus, dev: Remote.device(), app: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
      online: navigator.onLine !== false, addons, debrid, seat: typeof Seats !== 'undefined' && Seats.cur && Seats.cur() ? String(Seats.cur().name || '').slice(0, 24) : '',
      player: pl ? { title: P.ctx.meta.name || '', pos: Math.round(pNow() || 0), dur: isFinite(pDur()) ? Math.round(pDur()) : 0, paused: video.paused, subs: P.curSub >= 0 && P.subs[P.curSub] ? subLabel(P.subs[P.curSub]) : 'off', nsubs: (P.subs || []).length, vol: Math.round((P.ducking ? Duck.base : video.volume) * 100), muted: video.muted && !DubMix.active(), waiting: video.readyState < 3 && !video.paused } : null,
      errors: (X8.errors || []).slice(-3),
    };
  },
  reply(to, op, extra) { if (Remote.bus) Remote.bus.send({ t: 'fh', op, _to: to, ...(extra || {}) }); },
  fix(what) {
    const pl = F50.played();
    switch (what) {
      case 'home': Remote.home(); break;
      case 'back': if (Remote.layerOpen()) back(); else if (pl) closePlayer(); break;
      case 'resume': if (pl && video.paused) video.play().catch(() => {}); hideMsg(); break;
      case 'pause': if (pl && !video.paused) video.pause(); break;
      case 'subs-on': if (pl && P.curSub < 0) { const i = F50.subIdx(); if (i >= 0) { P.subUserChoice = true; selectSub(i); } } break;
      case 'subs-off': if (pl && P.curSub >= 0) { P.subUserChoice = true; selectSub(-1); } break;
      case 'unmute': if (pl) { video.muted = false; if (video.volume < 0.3) video.volume = 0.7; } break;
      case 'louder': Remote.cmd('volup'); break;
      case 'quieter': Remote.cmd('voldown'); break;
      case 'sources': if (pl) openDrawer('src'); break;
      case 'close': if (pl) closePlayer(); break;
      case 'reload': setTimeout(() => location.reload(), 500); break;
      default: return false;
    }
    return true;
  },
  note(text, name) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 280); if (!text) return;
    X8.layer('fhNote', { label: 'Message', icon: 'message-circle', eyebrow: 'Message' });
    X8.body('fhNote').innerHTML = `<h2 class="x8-h">From ${esc(name || 'your helper')}</h2><p class="fh-note">${esc(text)}</p><div class="actions"><button class="btn btn-prime" type="button" data-nav data-x8close>OK</button></div>`;
    icons(); X8.open('fhNote');
    setTimeout(() => { const b = $('#fhNote [data-x8close].btn'); if (b && IS_TV) Nav.focus(b, true); }, 120);
  },
  banner() {
    let el = $('#fhPill'); const n = [...this.helpers.values()];
    if (!n.length) { if (el) el.classList.remove('on'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'fhPill'; el.className = 'fh-pill'; el.setAttribute('role', 'status'); document.body.appendChild(el); el.addEventListener('click', (e) => { if (e.target.closest('[data-fhstop]')) this.stopAll(); }); }
    el.innerHTML = `<i data-lucide="life-buoy"></i><span><b>${esc(n.map((x) => x.name).join(', '))}</b> ${n.length > 1 ? 'are' : 'is'} helping on this screen</span>${IS_TV ? '' : '<button type="button" data-fhstop>Stop</button>'}`;
    el.classList.add('on'); icons();
  },
  stopAll() { this.helpers.forEach((x, id) => { this.reply(id, 'stop'); this.paused.add(id); }); this.helpers.clear(); this.banner(); toast('Help stopped. Remove a helper for good in Settings › Devices.', 'ok', 4200); },
  onMsg(m) {
    const id = m._from, op = m.op;
    if (this.paused.has(id) && op !== 'hello') return;
    const name = String(m.name || (this.helpers.get(id) || {}).name || 'Your helper').replace(/[^\p{L}\p{N} '’.-]/gu, '').trim().slice(0, 24) || 'Your helper';
    if (op === 'hello') { this.paused.delete(id); const was = this.helpers.has(id); this.helpers.set(id, { name, at: Date.now() }); this.banner(); if (!was) toast(`${name} is helping on this screen`, 'info', 4000, 'fh'); this.reply(id, 'peek', { info: this.info(), asked: this.asked() }); return; }
    if (op === 'bye') { this.helpers.delete(id); this.banner(); return; }
    if (!this.helpers.has(id)) return;
    this.helpers.get(id).at = Date.now();
    if (op === 'peek') { this.reply(id, 'peek', { info: this.info(), asked: this.asked() }); return; }
    if (op === 'seen') { Store.set('fhAsk', 0); return; }
    if (op === 'fix') { const ok = this.fix(String(m.what || '')); setTimeout(() => this.reply(id, 'peek', { info: this.info(), asked: this.asked(), done: ok ? m.what : '' }), 700); return; }
    if (op === 'note') { this.note(m.text, name); this.reply(id, 'noted'); }
  },
  beat() { const now = Date.now(); let ch = false; this.helpers.forEach((x, id) => { if (now - x.at > 30000 || !Remote.peers.has(id)) { this.helpers.delete(id); ch = true; } }); if (ch) this.banner(); },
  async addHelper() {
    await Remote.host();
    const link = Remote.link(Remote.code); if (!link) { toast('Family Helper needs MKCinema on a web address, such as app.mkcinema.app.', 'err', 6000); return; }
    X8.layer('fhAdd', { label: 'Family Helper', icon: 'life-buoy', eyebrow: 'Family Helper', wide: true });
    X8.body('fhAdd').innerHTML = `<h2 class="x8-h">Let someone help with this screen</h2><p class="sc-p">The person who set this up for you scans this with their phone. This screen asks you to allow them once. After that they can help from anywhere: see what’s on the screen, turn subtitles on, fix the sound, start a film and send you a message. You always see when they’re connected, and you can remove them in Settings › Devices.</p>
      <div class="qr-wrap ps-qr">${QR.svg(`${link}~help`)}</div><p class="tour-note">Or open ${esc(Remote.link().replace(/^https?:\/\//, ''))} and type <b class="mono">${esc(Remote.code)}</b>, then tap <b>Help on this screen</b>.</p>`;
    icons(); X8.open('fhAdd');
  },
  ask() {
    Store.set('fhAsk', Date.now());
    Remote.host().then(() => { this.helpers.forEach((x, id) => this.reply(id, 'ask')); Remote.soon(); });
    const n = RmSec.phones().length;
    toast(n ? 'Asked for help. Your helper sees it as soon as they open MKCinema Remote on their phone.' : 'No helper yet. Show them the code first: Settings › Devices › Family Helper.', n ? 'ok' : 'info', 6000, 'fh');
  },
  init() {
    const st = Remote.state.bind(Remote);
    Remote.state = function () {
      const s = st();
      if (Array.isArray(s.caps)) s.caps = [...new Set([...s.caps, 'fh', 'tk'])];
      const a = FamilyHelp.asked(); if (a) s.help = a;
      return s;
    };
    const on = Remote.onMsg.bind(Remote);
    Remote.onMsg = function (m) {
      if (m && (m.t === 'fh' || m.t === 'tk') && m._from) {
        Remote.peers.set(m._from, { ...(Remote.peers.get(m._from) || { name: 'Phone' }), at: Date.now() });
        if (m.t === 'fh') FamilyHelp.onMsg(m);
        else if (m.op === 'take') TakeIt.take(m._from);
        else if (m.op === 'back') TakeIt.back(m);
        return;
      }
      return on(m);
    };
    setInterval(() => this.beat(), 5000);
  },
};

/* ---------------- Wiring: player options, settings, commands ---------------- */
{
  F50.def('replayCC', true);
  ReplayCC.init(); SmartSleep.init(); LearnMode.init(); DubMix.init(); MkChan.init(); FamilyHelp.init();
  const base = renderOptMenu;
  renderOptMenu = function () {
    base(); const m = $('#optMenu'); if (!m || !P.ctx) return;
    const subs = (P.subs || []).length, back = !IS_TV && TakeIt.from();
    const html = `<h5>Watch your way</h5>
      ${subs ? `<button type="button" data-f50="learn"><i data-lucide="graduation-cap"></i>Learn mode · ${LearnMode.on ? 'on' : 'off'}</button>${LearnMode.on ? `<button type="button" data-f50="lpause"><i data-lucide="pause"></i>Pause after each line · ${LearnMode.autoPause ? 'on' : 'off'}</button>` : ''}` : ''}
      ${!IS_TV && P.stream && !P.stream.ytId ? `<button type="button" data-f50="dub"><i data-lucide="audio-lines"></i>Sound from another source · ${DubMix.active() ? esc(DubMix.label(DubMix.s).langs.join(', ') || 'on') : 'off'}</button>` : ''}
      ${MkChan.on ? '<button type="button" data-f50="chnext"><i data-lucide="chevrons-up"></i>Next channel</button><button type="button" data-f50="chguide"><i data-lucide="radio-tower"></i>Channel guide</button>' : ''}
      ${back ? '<button type="button" data-f50="tvback"><i data-lucide="tv"></i>Send back to your TV</button>' : ''}`;
    const tools = $('h5', m); if (tools) tools.insertAdjacentHTML('beforebegin', html); else m.insertAdjacentHTML('afterbegin', html);
    $$('[data-f50]', m).forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.f50;
      if (a === 'lpause') { LearnMode.autoPause = !LearnMode.autoPause; renderOptMenu(); return; }
      m.hidden = true;
      if (a === 'learn') { if (LearnMode.on) LearnMode.stop(); else LearnMode.start(); }
      if (a === 'dub') DubMix.open();
      if (a === 'chnext') MkChan.zap(1);
      if (a === 'chguide') MkChan.guide();
      if (a === 'tvback') TakeIt.sendBack();
    }));
    icons();
  };
  scAddRows('subtitles', null, [
    { group: 'Learn and replay' },
    { key: 'replayCC', label: 'Subtitles when you go back', help: 'Going back a few seconds turns subtitles on until you’re past the part you missed, then off again.', type: 'toggle' },
    { key: 'learnWordsBtn', label: 'My words', help: 'Words you saved in Learn mode, with the line they came from and a link back to the moment.', type: 'button', text: 'Open', icon: 'book-open', run: () => { closeLayer('settings'); LearnMode.openWords(); } },
  ]);
  scAddRows('playback', null, [
    { group: 'Sleep and channels' },
    { key: 'sleepSmart', label: 'Stop at a good moment', help: 'The sleep timer waits for a pause in the dialogue nearby, so it never stops in the middle of a sentence.', type: 'toggle' },
    { key: 'mkChannelBtn', label: 'MK Channel', help: 'Switch on and something is already playing: Up next, Your watchlist, Films on now, a Series marathon and Scenes.', type: 'button', text: 'What’s on', icon: 'radio-tower', run: () => { closeLayer('settings'); MkChan.guide(); } },
  ]);
  scAddRows('devices', null, [
    { group: 'Family Helper' },
    { key: 'fhAdd', label: 'Let someone help', help: 'The person who looks after this screen scans a code once. Then they can fix things from their phone, from anywhere. You see when they’re connected.', type: 'button', text: 'Show the code', icon: 'life-buoy', run: () => { closeLayer('settings'); FamilyHelp.addHelper(); } },
    { key: 'fhAsk', label: 'Ask for help', help: 'Your helper sees the request as soon as they open MKCinema Remote on their phone.', type: 'button', text: 'Ask', icon: 'hand-helping', run: () => FamilyHelp.ask() },
  ]);
  COMMANDS.push(
    { label: 'MK Channel: something is already playing', icon: 'radio-tower', run: () => MkChan.guide() },
    { label: 'My words (Learn mode)', icon: 'book-open', run: () => LearnMode.openWords() },
    { label: 'Family Helper: let someone help with this screen', icon: 'life-buoy', run: () => FamilyHelp.addHelper() },
    { label: 'Ask your helper for help', icon: 'hand-helping', run: () => FamilyHelp.ask() },
  );
}
