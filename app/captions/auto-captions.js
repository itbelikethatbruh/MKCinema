/* MKCinema captions for films without subtitles (2.60).
   1. "Make captions with AI": a second copy of the engine worker (engine/mkv-engine.worker.js, listen mode) reads the
      film's sound straight from its host a minute or two ahead of what is playing, decodes it to 16 kHz mono, and
      captions/asr.worker.js turns it into timed lines with Whisper running on this device. The sound never leaves the
      device; the speech model (about 77 MB) downloads once from Hugging Face and stays in the browser's cache.
      It needs a host that lets the browser read the file (CORS), the same as the engine. MKV and TS files are read a
      second time for this (sound and picture are stored together); MP4 reads only the sound.
   2. "Live Caption on this device": the steps for the captions built into Chrome, Android, Windows 11, iPhone and Mac,
      which work on any source because they listen to the device's own output.
   Loaded after the engine (<script src="captions/auto-captions.js" defer>), so it wraps renderSubMenu and selectSub
   from the outside. Not on TVs (too slow for speech recognition, and no Live Caption there). */
'use strict';
(() => {
  if (typeof renderSubMenu !== 'function' || typeof selectSub !== 'function' || typeof video === 'undefined' || typeof P === 'undefined') return;
  if (typeof IS_TV !== 'undefined' && IS_TV) return;
  const ENG = () => window.MkEngine;
  const CAN = !!(window.Worker && window.WebAssembly && window.ReadableStream && window.AbortController && typeof VTTCue !== 'undefined');
  const AHEAD = TOUCH_UI ? 75 : 150; // seconds of sound read ahead of the playhead
  const SEG = 28, MINCUT = 16; // seconds per speech-recognition piece; cut at the quietest moment after MINCUT
  if (CFG_DEFAULTS.genCaps === undefined) CFG_DEFAULTS.genCaps = false; // make captions by themselves when a film has none
  const log = (k, m) => { try { MKLog.add(k, m); } catch (e) { /* no log */ } };
  const UA = navigator.userAgent || '';
  // things Whisper writes on silence or music that aren't speech
  const JUNK = /^(?:thank you\.?|thanks for watching!?|thank you for watching\.?|please subscribe.*|subtitles by.*|subtitled by.*|transcribed by.*|captions? by.*|amara\.org.*|you|\.+|-+|bye\.?)$/i;
  const MUSIC = /^[\s([]*(?:music|music playing|upbeat music|dramatic music|soft music|instrumental|singing|♪+)[\s)\]]*$/i;

  const G = {
    state: 'idle', // idle | loading | running | blocked | failed
    stream: null, lw: null, aw: null, gen: 0, pct: 0, why: '', lang: '', task: 'transcribe', label: '',
    buf: [], bufLen: 0, bufT0: null, q: [], busy: false, seq: 0, ready: false,
    done: [], // transcribed time ranges [from, to]
    cues: [], // { s, e, text }
    readTo: 0, edge: 0, timer: 0, told: false, rtf: 0, behind: false, lastT: 0,

    entry() { return P.subs ? P.subs.findIndex((s) => s && s._gen) : -1; },
    supported(s) {
      if (!CAN || !ENG() || !s || !s.url || s._local || s._capNo) return false;
      return /^https?:/i.test(s.url) && !/\.m3u8(\?|$)/i.test(s.url);
    },
    covered(t) { return this.done.some(([a, b]) => t >= a - 0.5 && t < b); },
    coverEnd(t) { let e = t; for (const [a, b] of this.done) if (e >= a - 0.5 && e < b) e = b; return e; },
    addDone(a, b) {
      this.done.push([a, b]); this.done.sort((x, y) => x[0] - y[0]);
      const m = []; for (const r of this.done) { const l = m[m.length - 1]; if (l && r[0] <= l[1] + 0.5) l[1] = Math.max(l[1], r[1]); else m.push([...r]); }
      this.done = m;
    },

    async start(opts = {}) {
      const s = P.stream;
      if (!s) return;
      if (!this.supported(s)) {
        if (!opts.auto) { toast(s && /\.m3u8/i.test(s.url || '') ? 'Captions can’t be made for live streams yet. Try Live Caption on this device.' : 'Captions can’t be made for this source. Try Live Caption on this device.', 'err', 6000); this.showHelp(); }
        return;
      }
      if (this.stream === s && (this.state === 'running' || this.state === 'loading')) { this.select(); return; }
      this.stop(true);
      this.stream = s; this.state = 'loading'; this.pct = 0; this.why = ''; this.done = []; this.cues = []; this.q = []; this.busy = false;
      this.buf = []; this.bufLen = 0; this.bufT0 = null; this.behind = false; this.told = false;
      // the menu entry the captions show under
      const want = SubLang.want();
      this.addEntry('und', 'Captions · made by AI on this device');
      if (!opts.auto || P.curSub < 0) this.select(opts.auto);
      renderSubMenu();
      // the speech model (downloads once)
      try { this.aw = this.aw || new Worker(new URL('captions/asr.worker.js', location.href), { type: 'module' }); }
      catch (e) { return this.fail('this browser can’t run the speech model'); }
      this.aw.onmessage = (e) => this.onAsr(e.data || {});
      this.aw.onerror = (e) => this.fail(`the speech model stopped (${(e && e.message) || 'error'})`);
      if (!this.ready) this.aw.postMessage({ op: 'load' });
      // the film's sound
      let w;
      try { w = this.lw = new Worker(new URL('engine/mkv-engine.worker.js', location.href)); } catch (e) { return this.fail('workers are blocked here'); }
      const bh = s.behaviorHints || {};
      const info = await new Promise((res) => {
        const t = setTimeout(() => res({ fail: 'the host took too long to answer' }), 9000);
        w.onmessage = (e) => { const m = e.data || {}; if (m.op === 'info') { clearTimeout(t); res(m.info); } if (m.op === 'fail') { clearTimeout(t); res({ fail: m.reason }); } };
        w.onerror = () => { clearTimeout(t); res({ fail: 'the reader could not start' }); };
        w.postMessage({ op: 'open', url: s.url, headers: (bh.proxyHeaders && bh.proxyHeaders.request) || {} });
      });
      if (this.stream !== s || this.lw !== w) { try { w.terminate(); } catch (e) { /* gone */ } return; }
      if (info.fail) {
        const blocked = /Failed to fetch|NetworkError|Load failed|network|byte-range/i.test(info.fail);
        log('info', `captions: can't read the sound (${info.fail})`);
        s._capNo = true;
        return this.fail(blocked ? 'this source doesn’t let the browser read its sound' : `the file can’t be read here (${info.fail})`, blocked ? 'blocked' : 'failed');
      }
      const E = ENG();
      const auds = info.audio || [];
      let ai = E && E.active && E.stream === s && E.aIdx >= 0 ? E.aIdx : auds.findIndex((x) => !x.enc);
      if (ai < 0 || !auds[ai]) return this.fail('the file has no sound track MKCinema can read');
      const a = auds[ai];
      const spoken = SubLang.base(SubLang.bcp(a.lang)) || '';
      // English viewers get foreign films translated into English (Whisper can only translate into English)
      this.task = spoken && spoken !== 'en' && SubLang.base(want) === 'en' ? 'translate' : 'transcribe';
      this.lang = spoken;
      const shown = this.task === 'translate' ? 'en' : spoken;
      this.label = this.task === 'translate' ? `English · AI translation of the ${langName(a.lang)} sound` : `${shown ? `${SubLang.name(shown)} · ` : ''}Captions made by AI on this device`;
      this.addEntry(shown ? SubLang.bcp(shown) : 'und', this.label);
      w.onmessage = (e) => this.onPcm(e.data || {}, w);
      w.onerror = () => this.fail('the sound reader stopped');
      this.ai = ai;
      this.restart(Math.max(0, video.currentTime - 1));
      clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 1000);
      log('info', `captions: ${a.kind || a.codec} track ${ai}, ${this.task}${spoken ? ` (${spoken})` : ''}`);
    },
    restart(t) {
      if (!this.lw) return;
      this.gen++; this.buf = []; this.bufLen = 0; this.bufT0 = null; this.q = this.q.filter((x) => x.keep);
      this.readTo = t; this.lastT = t;
      this.lw.postMessage({ op: 'start', gen: this.gen, t, audio: this.ai, mode: 'pcm', listen: true, until: t + Math.min(AHEAD, 40) });
    },
    /* every second: read further ahead, follow seeks, notice when captions fall behind */
    tick() {
      if (P.stream !== this.stream || !this.stream) { this.stop(true); return; }
      if (this.state !== 'running' && this.state !== 'loading') return;
      const now = video.currentTime;
      const jumped = Math.abs(now - this.lastT) > 8; this.lastT = now;
      if (jumped) {
        // a seek: carry on from the end of what is already captioned there, or start reading at the new spot
        const from = this.covered(now) ? this.coverEnd(now) : now - 1;
        const reading = this.bufT0 != null && now >= this.bufT0 - 30 && now <= this.readTo + 5;
        if (!reading || from > this.readTo + 5) this.restart(Math.max(0, from));
      }
      // don't read much further than the speech model has got through
      const until = Math.min(now + AHEAD, Math.max(this.edge, now) + (this.ready ? 60 : 30));
      if (this.lw) this.lw.postMessage({ op: 'until', t: until, gen: this.gen });
      const behind = this.ready && !video.paused && !this.covered(now + 1) && now > 5;
      if (behind !== this.behind) { this.behind = behind; if (!$('#subMenu').hidden) renderSubMenu(); }
    },
    onPcm(m, w) {
      if (w !== this.lw) return;
      if (m.op === 'error' || (m.op === 'note' && m.audioFail)) { this.fail(m.op === 'note' ? 'this film’s sound can’t be decoded here' : `reading stopped (${m.reason})`); return; }
      if (m.op !== 'pcm' || m.gen !== this.gen) return;
      const d = new Float32Array(m.data);
      if (this.bufT0 == null) this.bufT0 = m.t0;
      if (d.length) { this.buf.push(d); this.bufLen += d.length; }
      this.readTo = this.bufT0 + this.bufLen / 16000;
      while (this.bufLen >= SEG * 16000) this.cut(false);
      if (m.end && this.bufLen) this.cut(true);
      this.pump();
    },
    /* take one piece off the front of the buffer, cut at the quietest 0.25 s after MINCUT seconds */
    cut(all) {
      const pcm = new Float32Array(this.bufLen); let o = 0; for (const b of this.buf) { pcm.set(b, o); o += b.length; }
      let n = pcm.length;
      if (!all) {
        const W = 4000; let best = SEG * 16000, bestE = Infinity;
        for (let i = MINCUT * 16000; i + W <= Math.min(pcm.length, SEG * 16000); i += 2000) {
          let e = 0; for (let j = i; j < i + W; j += 4) e += pcm[j] * pcm[j];
          if (e < bestE) { bestE = e; best = i + W / 2; }
        }
        n = best;
      }
      const piece = pcm.slice(0, n), rest = pcm.slice(n);
      const t0 = this.bufT0;
      this.buf = rest.length ? [rest] : []; this.bufLen = rest.length; this.bufT0 = t0 + n / 16000;
      if (!this.covered(t0 + 1) || !this.covered(t0 + n / 16000 - 1)) this.q.push({ t0, pcm: piece, gen: this.gen });
    },
    pump() {
      if (this.busy || !this.aw || !this.q.length) return;
      const now = video.currentTime;
      // pieces the film has already passed are skipped, except the one playing now
      while (this.q.length > 1 && this.q[0].t0 + this.q[0].pcm.length / 16000 < now - 2) this.q.shift();
      const x = this.q.shift(); if (!x) return;
      this.busy = true; const id = ++this.seq; this.cur = x;
      this.aw.postMessage({ op: 'run', id, t0: x.t0, dur: x.pcm.length / 16000, data: x.pcm.buffer, lang: this.lang || null, task: this.task }, [x.pcm.buffer]);
    },
    onAsr(m) {
      if (m.op === 'progress') {
        const pct = m.total ? Math.round((m.loaded / m.total) * 100) : 0;
        if (pct !== this.pct) { this.pct = pct; if (!$('#subMenu').hidden) renderSubMenu(); }
        if (!this.told && this.state === 'loading') { this.told = true; toast('Downloading the caption model once (about 77 MB). It stays on this device.', 'info', 6000, 'gencap'); }
        return;
      }
      if (m.op === 'ready') {
        this.ready = true;
        if (this.state === 'loading') { this.state = 'running'; toast(`Making captions on this device${TOUCH_UI ? '. On phones they can fall behind; a short pause lets them catch up' : ''}`, 'ok', 4000, 'gencap'); }
        renderSubMenu(); this.pump(); return;
      }
      if (m.op === 'fail') { this.fail(`the speech model could not load (${m.reason})`); return; }
      if (m.op === 'error') { this.busy = false; log('warn', `captions: ${m.reason}`); this.pump(); return; }
      if (m.op !== 'text') return;
      this.busy = false;
      if (this.state === 'loading') this.state = 'running';
      this.rtf = m.dur ? (m.ms / 1000) / m.dur : 0;
      this.addDone(m.t0, m.t0 + m.dur); this.edge = Math.max(this.edge, m.t0 + m.dur);
      this.addLines(m.chunks, m.t0, m.dur);
      if (!$('#subMenu').hidden) renderSubMenu();
      this.pump();
    },
    /* Whisper's timed pieces → cues of at most two short lines */
    addLines(chunks, t0, dur) {
      const out = [];
      chunks.forEach((c, i) => {
        let text = String(c.text || '').replace(/\s+/g, ' ').trim();
        // "- Line. - Line." (the same line twice as a dialogue pair) is one line
        const pair = text.split(/(?:^|\s)-\s+/).map((x) => x.trim()).filter(Boolean);
        if (pair.length > 1 && pair.every((x) => x === pair[0])) text = pair[0];
        if (!text || JUNK.test(text)) return;
        if (MUSIC.test(text) || /^[[(][^\])]*[\])]$/.test(text)) text = '♪';
        const ts = c.timestamp || [];
        let s = Number(ts[0]), e = Number(ts[1]);
        if (!Number.isFinite(s)) return;
        const next = chunks[i + 1] && chunks[i + 1].timestamp && Number(chunks[i + 1].timestamp[0]);
        if (!Number.isFinite(e) || e <= s) e = Math.min(dur, Number.isFinite(next) && next > s ? next : s + Math.max(1.5, text.length / 15));
        s = Math.min(s, dur); e = Math.min(Math.max(e, s + 0.6), dur + 0.5);
        if (text === '♪') { const l = out[out.length - 1]; if (l && l.text === '♪' && s - l.e < 2) { l.e = e; return; } }
        // long pieces split into readable cues, timed by their share of the words
        const parts = this.split(text), total = parts.reduce((a, p) => a + p.length, 0) || 1;
        let at = s;
        for (const p of parts) { const len = (e - s) * (p.length / total); out.push({ s: t0 + at, e: t0 + at + len, text: p }); at += len; }
      });
      // Whisper sometimes repeats one line over and over (music, crowd noise): one copy stays, at most 4 s long
      const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const kept = [];
      for (const c of out) {
        const l = kept[kept.length - 1];
        if (l && norm(l.text) === norm(c.text) && c.s - l.e < 3) { l.e = Math.max(l.e, Math.min(l.s + 4, c.e)); continue; }
        kept.push(c);
      }
      // and nothing that repeats a line already shown in the same place (an overlap after a seek)
      const fresh = kept.filter((c) => !this.cues.some((x) => c.s < x.e + 1 && c.e > x.s - 1 && norm(x.text) === norm(c.text)));
      this.cues.push(...fresh); this.cues.sort((a, b) => a.s - b.s);
      this.show(fresh);
    },
    split(text) {
      const MAX = 84; if (text.length <= MAX) return [this.lines(text)];
      const sent = text.match(/[^.!?…]+[.!?…]*["”’)]?\s*/g) || [text];
      const parts = []; let cur = '';
      for (const s0 of sent) {
        const s = s0.trim(); if (!s) continue;
        if ((cur + ' ' + s).trim().length <= MAX) { cur = (cur + ' ' + s).trim(); continue; }
        if (cur) parts.push(cur);
        if (s.length <= MAX) { cur = s; continue; }
        // one long sentence: break between words
        const words = s.split(' '); cur = '';
        for (const w of words) { if ((cur + ' ' + w).trim().length > MAX && cur) { parts.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
      }
      if (cur) { if (parts.length && cur.length < 16 && parts[parts.length - 1].length + cur.length < MAX + 16) parts[parts.length - 1] += ` ${cur}`; else parts.push(cur); }
      return parts.map((p) => this.lines(p));
    },
    lines(t) {
      if (t.length <= 42) return t;
      const mid = t.length / 2; let best = -1;
      for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
      return best > 0 ? `${t.slice(0, best)}\n${t.slice(best + 1)}` : t;
    },

    /* the captions' own text track, filled as lines arrive */
    track() { const tr = this.trEl; return tr && tr.parentNode === video ? tr.track : null; },
    mount() {
      if (typeof clearSubTracks === 'function') clearSubTracks();
      const tr = document.createElement('track'); tr.kind = 'subtitles'; tr.label = this.label || 'Captions (AI)'; tr.srclang = 'und'; tr.default = true;
      tr.src = URL.createObjectURL(new Blob(['WEBVTT\n\n'], { type: 'text/vtt' }));
      video.appendChild(tr); tr.track._mkc = true; this.trEl = tr;
      const show = () => { tr.track.mode = 'showing'; this.show(this.cues); };
      tr.addEventListener('load', show, { once: true }); setTimeout(show, 80);
    },
    show(list) {
      const t = this.track(); if (!t || this.entry() !== P.curSub) return;
      if (t.mode !== 'showing') t.mode = 'showing';
      const line = { bottom: 'auto', higher: -4, top: 1 }[CFG.subPos];
      for (const c of list) {
        if (c.vc && c.vc.track === t) continue;
        try {
          const vc = new VTTCue(Math.max(0, c.s + (P.subDelay || 0)), Math.max(0, c.e + (P.subDelay || 0)), c.text);
          vc._s = c.s; vc._e = c.e; try { vc.line = line; if (CFG.subPos === 'top') vc.snapToLines = true; } catch (e) { /* read-only */ }
          t.addCue(vc); c.vc = vc;
        } catch (e) { /* bad cue */ }
      }
    },
    addEntry(lang, label) {
      if (!P.subs) P.subs = [];
      const i = this.entry();
      if (i >= 0) { P.subs[i].lang = lang; P.subs[i]._label = label; }
      else P.subs.push({ kind: 'gen', _gen: true, lang, _label: label });
    },
    select(auto) {
      const i = this.entry(); if (i < 0) return;
      if (!auto) P.subUserChoice = true;
      selectSub(i, { auto: !!auto });
    },
    fail(why, state = 'failed') {
      const was = this.state;
      this.why = why; this.state = state; this.stopReader();
      log('info', `captions: ${why}`);
      if (was !== 'idle') {
        toast(state === 'blocked' ? 'This source doesn’t let the browser read its sound, so captions can’t be made here. Live Caption on this device still works.' : `Captions couldn’t be made: ${why}`, 'err', 7000, 'gencap');
        this.helpOpen = state === 'blocked';
      }
      const i = this.entry(); if (i >= 0 && P.curSub === i) { selectSub(-1); }
      if (i >= 0 && !this.cues.length) { P.subs.splice(i, 1); if (P.curSub > i) P.curSub--; }
      renderSubMenu();
    },
    stopReader() { if (this.lw) { try { this.lw.postMessage({ op: 'close' }); this.lw.terminate(); } catch (e) { /* gone */ } } this.lw = null; this.q = []; },
    stop(quiet) {
      clearInterval(this.timer); this.timer = 0; this.stopReader();
      if (this.trEl) { try { URL.revokeObjectURL(this.trEl.src); } catch (e) { /* ignore */ } }
      this.trEl = null; this.stream = null; this.state = 'idle'; this.cues = []; this.done = []; this.edge = 0; this.busy = false;
      // the speech model's worker is kept (and its model loaded) for the next film
      if (!quiet) renderSubMenu();
    },
    showHelp() { this.helpOpen = true; const m = $('#subMenu'); if (m.hidden) m.hidden = false; renderSubMenu(); },
  };

  /* Live Caption: where to switch it on, for this device */
  function liveSteps() {
    const ios = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
    const android = /Android/.test(UA), win = /Windows/.test(UA), mac = /Macintosh/.test(UA) && !ios;
    const chrome = /Chrome\//.test(UA) && !/Edg\//.test(UA), edge = /Edg\//.test(UA);
    const s = [];
    if (ios) s.push('iPhone or iPad: Settings › Accessibility › Live Captions (where Apple offers it).');
    else if (android) s.push('Android: press a volume button, then tap the captions icon under the volume bar (Live Caption). On Samsung phones it is also in Settings › Accessibility › Hearing enhancements.');
    else {
      if (chrome) s.push('Chrome: Settings › Accessibility › Live Caption.');
      if (win) s.push('Windows 11: press Windows + Ctrl + L for Live captions.');
      if (mac) s.push('Mac: System Settings › Accessibility › Live Captions.');
      if (edge && !win) s.push('Edge: use your computer’s own captions.');
      if (!s.length) s.push('Chrome: Settings › Accessibility › Live Caption. Windows 11: Windows + Ctrl + L. Mac: System Settings › Accessibility › Live Captions.');
    }
    return s;
  }

  /* subtitle menu: the AI captions entry, its status, the automatic switch and the Live Caption steps */
  const render0 = renderSubMenu;
  renderSubMenu = function () {
    const r = render0.apply(this, arguments);
    try {
      const m = $('#subMenu'); if (!m || !P.subs || !P.stream) return r;
      const own = P.subs.filter((s) => !s._gen && !s._tr).length;
      const i = G.entry(), mine = G.stream === P.stream;
      let status = '';
      if (mine && G.state === 'loading') status = G.pct && G.pct < 100 ? `Downloading the caption model · ${G.pct}%` : 'Getting the captions ready…';
      else if (mine && G.state === 'running') status = G.behind ? 'Captions are catching up. A short pause helps.' : G.cues.length ? 'Captions are being made as the film plays.' : 'Listening to the film…';
      else if (G.state === 'blocked' || G.state === 'failed') status = G.why ? `Captions couldn’t be made: ${G.why}.` : '';
      const p = (t) => `<p class="gencap-note" style="color:var(--mute);font-size:calc(12.5px * var(--ts,1));margin:4px 12px 8px;max-width:32ch">${esc(t)}</p>`;
      const wrap = document.createElement('div'); wrap.className = 'gencap';
      const can = G.supported(P.stream);
      wrap.innerHTML = `<h5>${own ? 'More captions' : 'No subtitles?'}</h5>
        ${can && !(mine && (G.state === 'running' || G.state === 'loading')) ? '<button type="button" data-gencap><i data-lucide="sparkles"></i>Make captions with AI (on this device)</button>' : ''}
        ${mine && (G.state === 'running' || G.state === 'loading') ? '<button type="button" data-genstop><i data-lucide="captions-off"></i>Stop making captions</button>' : ''}
        ${status ? p(status) : ''}
        ${can ? `<button type="button" data-genauto class="${CFG.genCaps ? 'on' : ''}" aria-pressed="${CFG.genCaps ? 'true' : 'false'}"><i data-lucide="wand-sparkles"></i>Make them by themselves when a film has none: ${CFG.genCaps ? 'On' : 'Off'}</button>` : ''}
        <button type="button" data-livecap aria-expanded="${G.helpOpen ? 'true' : 'false'}"><i data-lucide="captions"></i>Live Caption on this device</button>
        ${G.helpOpen ? p(`Your device can caption any sound, on any source, by itself. ${liveSteps().join(' ')}`) : ''}`;
      m.appendChild(wrap);
      // the generated entry shows its own icon
      if (i >= 0) { const b = m.querySelector(`[data-sub="${i}"]`); const ic = b && b.firstElementChild; if (ic) { const n = document.createElement('i'); n.setAttribute('data-lucide', 'sparkles'); ic.replaceWith(n); } }
      const gb = $('[data-gencap]', wrap); if (gb) gb.onclick = () => G.start();
      const sb = $('[data-genstop]', wrap); if (sb) sb.onclick = () => { const j = G.entry(); if (j >= 0 && P.curSub === j) selectSub(-1); G.stop(true); const k = G.entry(); if (k >= 0) P.subs.splice(k, 1); renderSubMenu(); };
      const ab = $('[data-genauto]', wrap); if (ab) ab.onclick = () => { setCfg('genCaps', !CFG.genCaps); if (CFG.genCaps && !(G.stream === P.stream && G.state !== 'idle') && P.curSub < 0) G.start(); else renderSubMenu(); };
      const lb = $('[data-livecap]', wrap); if (lb) lb.onclick = () => { G.helpOpen = !G.helpOpen; renderSubMenu(); };
      icons();
    } catch (e) { /* the menu still works without this */ }
    return r;
  };

  /* picking the AI entry shows its live track; picking anything else hides it (the captions keep being made) */
  const sel0 = selectSub;
  selectSub = function (i, opts = {}) {
    const s = i >= 0 && P.subs ? P.subs[i] : null;
    if (s && s._gen) {
      if (typeof clearSubTracks === 'function') clearSubTracks();
      P.curSub = i; P.subPick = (P.subPick || 0) + 1;
      G.mount(); renderSubMenu();
      if (!(G.stream === P.stream && (G.state === 'running' || G.state === 'loading'))) G.start({ auto: !!opts.auto });
      return Promise.resolve();
    }
    G.trEl = null;
    return sel0.apply(this, arguments);
  };

  /* Automatic: when switched on and the film ends up with nothing to show, start by itself a few seconds in */
  let autoTok = 0;
  const offer0 = SubAuto.offer.bind(SubAuto);
  SubAuto.offer = function () {
    const r = offer0.apply(this, arguments);
    if (CFG.genCaps && P.stream && !P.subsLoading && G.stream !== P.stream && G.supported(P.stream)) {
      const tok = ++autoTok, s = P.stream;
      setTimeout(() => {
        if (tok !== autoTok || P.stream !== s || P.subsLoading || G.stream === s) return;
        const usable = P.subs && P.subs.some((x) => !x._gen && (x._tr || SubRank.tier(x) <= 1));
        if (P.curSub < 0 && !usable) G.start({ auto: true });
      }, 4000);
    }
    return r;
  };

  window.MkCaptions = G;
})();
