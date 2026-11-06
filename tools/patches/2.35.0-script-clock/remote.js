/* ---------- 2.35.0 Subtitles on this phone ----------
   Phone 'ps' {op: list|pick, i} -> TV 'psl' {list} and 'psm' {url, k, off}. The phone downloads the subtitle file
   itself and shows each line when the TV reaches it: video time = subtitle time × k + off. */
const PSub = {
  want: false, list: null, cues: [], k: 1, off: 0, url: '', lang: '', delay: 0, size: 1, raf: 0, lock: null, last: '',
  h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  open() { closeSheet(true); openSheet('psub'); this.list = null; this.paint(); R.send({ t: 'ps', op: 'list' }); clearTimeout(this.waitT); this.waitT = setTimeout(() => { if (!this.list && sheet === 'psub') $('#psList').innerHTML = '<div class="ad-empty">Your TV hasn’t answered. Keep MKCinema open and playing on the TV, and update it if this keeps happening.</div>'; }, 7000); },
  paint() {
    const box = $('#psList'); if (!box) return;
    if (!this.list) { box.innerHTML = '<div class="ad-empty">Asking your TV…</div>'; return; }
    if (!this.list.length) { box.innerHTML = `<div class="ad-empty">${this.playing ? 'This film has no downloadable subtitles. Turn on an add-on like OpenSubtitles on the TV.' : 'Start a film on the TV first.'}</div>`; return; }
    box.innerHTML = this.list.map((s) => `<button class="item" type="button" data-psi="${s.i}"><svg class="i"><use href="#i-cc"/></svg><span class="grow"><b>${this.h(s.lang)}</b>${s.from ? `<small>${this.h(s.from)}</small>` : ''}</span></button>`).join('');
  },
  parse(text) {
    const out = [], re = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})/;
    const t = (h, mi, s, ms) => (Number(h) || 0) * 3600 + Number(mi) * 60 + Number(s) + Number(ms) / 1000;
    String(text || '').replace(/^﻿/, '').replace(/\r/g, '').split(/\n{2,}/).forEach((b) => {
      const lines = b.split('\n'), i = lines.findIndex((l) => re.test(l)); if (i < 0) return;
      const m = lines[i].match(re), body = lines.slice(i + 1).map((l) => l.replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '').trim()).filter(Boolean);
      if (body.length) out.push({ s: t(m[1], m[2], m[3], m[4]), e: t(m[5], m[6], m[7], m[8]), l: body });
    });
    return out.sort((a, b) => a.s - b.s);
  },
  onMsg(m) {
    if (!m) return false;
    if (m.t === 'psl') { clearTimeout(this.waitT); this.list = Array.isArray(m.list) ? m.list : []; this.playing = !!m.playing; this.paint(); return true; }
    if (m.t !== 'psm') return false;
    this.load(m); return true;
  },
  async load(m) {
    this.k = Number(m.k) || 1; this.off = Number(m.off) || 0;
    if (m.url !== this.url) {
      this.url = m.url; this.lang = m.lang || ''; this.cues = [];
      this.show(`Loading ${this.lang} subtitles…`);
      try { const r = await fetch(m.url); if (!r.ok) throw new Error(String(r.status)); this.cues = this.parse(await r.text()); }
      catch (e) { this.cues = []; }
      if (!this.cues.length) { this.show('These subtitles could not be loaded on this phone. Try another language.'); return; }
    }
    $('#psHow').textContent = { file: 'Timed to the film', auto: 'Timed to the film', same: 'Timed to the film', subs: 'Timed to the TV’s subtitles', hand: 'Timed like the TV', raw: 'Timing as downloaded' }[m.how] || '';
    this.run();
  },
  show(msg) {
    closeSheet(true);
    const v = $('#psView'); v.hidden = false; requestAnimationFrame(() => v.classList.add('on'));
    $('#psLang').textContent = this.lang || 'Subtitles'; $('#psText').innerHTML = `<p class="ps-wait">${this.h(msg)}</p>`;
    try { if (navigator.wakeLock && !this.lock) navigator.wakeLock.request('screen').then((l) => { this.lock = l; }).catch(() => {}); } catch (e) { /* not allowed */ }
  },
  run() {
    this.show(''); cancelAnimationFrame(this.raf);
    const box = $('#psText');
    const loop = () => {
      if ($('#psView').hidden) return;
      const b = R.base, t = b.cur + (b.paused ? 0 : (performance.now() - b.at) / 1000) - this.delay;
      const at = (t - this.off) / this.k; // subtitle time now
      const c = this.cues.find((x) => x.s <= at && x.e >= at);
      const html = c ? c.l.map((l) => `<p>${this.h(l)}</p>`).join('') : '';
      if (html !== this.last) { this.last = html; box.innerHTML = html || '<p class="ps-gap">·</p>'; }
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  },
  close() {
    cancelAnimationFrame(this.raf); const v = $('#psView'); v.classList.remove('on'); setTimeout(() => { v.hidden = true; }, 260);
    this.url = ''; this.cues = []; this.last = ''; if (this.lock) { try { this.lock.release(); } catch (e) { /* gone */ } this.lock = null; }
  },
  st(m) {
    const b = $('#psBtn'); if (b) b.hidden = m.v !== 'player';
    if (this.want && m.v === 'player') { this.want = false; this.open(); }
  },
};
$('#psList').addEventListener('click', (e) => { const b = e.target.closest('[data-psi]'); if (!b) return; buzz(8); const s = (PSub.list || []).find((x) => String(x.i) === b.dataset.psi); PSub.lang = s ? s.lang : ''; PSub.url = ''; R.send({ t: 'ps', op: 'pick', i: Number(b.dataset.psi) }); PSub.show(`Getting ${PSub.lang} ready…`); });
$('#psBtn').onclick = () => PSub.open();
$('#mSubs').onclick = () => PSub.open();
$('#psClose').onclick = () => PSub.close();
$('#psLangBtn').onclick = () => { PSub.close(); PSub.open(); };
$('#psBig').onclick = () => { PSub.size = Math.min(1.8, PSub.size + 0.15); $('#psText').style.setProperty('--pss', PSub.size); };
$('#psSmall').onclick = () => { PSub.size = Math.max(0.7, PSub.size - 0.15); $('#psText').style.setProperty('--pss', PSub.size); };
$('#psEarly').onclick = () => { PSub.delay -= 0.5; toast(`Subtitles ${PSub.delay > 0 ? '+' : ''}${PSub.delay.toFixed(1)} s`, 1200); PSub.last = ''; };
$('#psLate').onclick = () => { PSub.delay += 0.5; toast(`Subtitles ${PSub.delay > 0 ? '+' : ''}${PSub.delay.toFixed(1)} s`, 1200); PSub.last = ''; };

/* ---------- 2.35.0 Couch match ----------
   TV 'cm' {op: deck|match|end, list} <-> phone 'cm' {op: join|vote|done, mid, yes}. One card at a time. */
const CM = {
  want: false, id: '', deck: [], i: 0, yes: new Set(),
  h: (s) => PSub.h(s),
  join() { closeSheet(true); openSheet('cm'); this.paint('Asking your TV…'); R.send({ t: 'cm', op: 'join', name: phoneName() }); clearTimeout(this.waitT); this.waitT = setTimeout(() => { if (!this.deck.length && sheet === 'cm') this.paint('No couch match is open. Start one on the TV: Settings › Devices › Couch match.'); }, 7000); },
  onMsg(m) {
    if (!m || m.t !== 'cm') return false;
    clearTimeout(this.waitT);
    if (m.op === 'end') { if (sheet === 'cm') this.paint('Couch match ended on the TV.'); this.id = ''; return true; }
    if (m.op === 'deck') {
      if (m.id !== this.id) { this.id = m.id; this.i = 0; this.yes.clear(); }
      const left = this.deck.slice(this.i).map((x) => x.id);
      this.deck = Array.isArray(m.list) ? m.list : [];
      if (left.length) this.i = Math.max(0, this.deck.findIndex((x) => x.id === left[0]));
      if (sheet !== 'cm') openSheet('cm');
      this.card(); return true;
    }
    if (m.op === 'match') { const x = this.deck.find((d) => d.id === m.mid); buzz([20, 60, 20]); this.paint(`It’s a match: ${x ? x.name : 'one for everyone'}! Look at the TV.`); return true; }
    return true;
  },
  paint(msg) { $('#cmBody').innerHTML = `<div class="ad-empty">${this.h(msg)}</div>`; },
  card() {
    const x = this.deck[this.i];
    if (!x) { this.paint('That’s every title. Waiting for the others…'); R.send({ t: 'cm', id: this.id, op: 'done' }); return; }
    $('#cmBody').innerHTML = `<div class="cm-card" id="cmCard"><div class="cm-art" style="background-image:url('${this.h(x.poster).replace(/'/g, '%27')}')"></div><div class="cm-meta"><b>${this.h(x.name)}</b><small>${this.h([x.year, x.g, x.r ? `IMDb ${x.r}` : ''].filter(Boolean).join(' · '))}</small></div></div>
      <div class="cm-acts"><button class="cm-b no" type="button" data-cm="0" aria-label="Not tonight"><svg class="i"><use href="#i-x"/></svg></button><span class="tnum cm-n">${this.i + 1} / ${this.deck.length}</span><button class="cm-b yes" type="button" data-cm="1" aria-label="Yes">Yes</button></div>`;
    this.swipe($('#cmCard'));
  },
  vote(yes) {
    const x = this.deck[this.i]; if (!x) return;
    R.send({ t: 'cm', id: this.id, op: 'vote', mid: x.id, yes: !!yes }); buzz(yes ? 14 : 6);
    const c = $('#cmCard'); if (c) { c.style.transition = 'transform .28s ease, opacity .28s ease'; c.style.transform = `translate3d(${yes ? 120 : -120}%,0,0) rotate(${yes ? 8 : -8}deg)`; c.style.opacity = '0'; }
    this.i++; setTimeout(() => this.card(), 220);
  },
  swipe(el) {
    if (!el) return; let x0 = null, dx = 0;
    el.addEventListener('pointerdown', (e) => { x0 = e.clientX; dx = 0; try { el.setPointerCapture(e.pointerId); } catch (x) { /* gone */ } });
    el.addEventListener('pointermove', (e) => { if (x0 == null) return; dx = e.clientX - x0; el.style.transform = `translate3d(${dx}px,0,0) rotate(${dx / 30}deg)`; });
    const end = () => { if (x0 == null) return; x0 = null; if (Math.abs(dx) > 90) this.vote(dx > 0); else el.style.transform = ''; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  },
};
$('#cmBody').addEventListener('click', (e) => { const b = e.target.closest('[data-cm]'); if (b) CM.vote(b.dataset.cm === '1'); });
$('#mMatch').onclick = () => CM.join();
{
  const on = R.onMsg;
  R.onMsg = (m) => { if (PSub.onMsg(m) || CM.onMsg(m)) return; on(m); if (m.t === 'st') { PSub.st(m); if (CM.want) { CM.want = false; CM.join(); } } };
  const lv = R.leave;
  R.leave = function () { PSub.close(); if (sheet === 'psub' || sheet === 'cm') closeSheet(true); return lv.apply(this, arguments); };
}
