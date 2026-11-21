
'use strict';
/* 2.86 Watch party extras
   - Point and draw: a tap on the picture shows a dot with your name to everyone; drag to draw. Strokes fade in 4 s.
   - Start together: the host counts 3-2-1 on every screen, then the film starts for everyone at once.
   - Room PIN: the host can add a 4-digit PIN; someone who joins with the code is asked for it, and the room ignores
     them until the host's device has checked it. A light lock like seat PINs: it keeps out people who only have the code.
   - Alerts: a system notification when someone joins, leaves or writes while MKCinema is in the background.
   - Status: each person's state (watching, paused, loading, browsing, away) shows next to their name. */
const PartyPlus = {
  drawing: false, locked: false, pin: '', admitted: new Set(), pending: new Map(), strokes: [], dots: new Map(), lastSt: '', stAt: 0, raf: 0,
  COLORS: ['#e8d7b8', '#9ccfb0', '#bccde4', '#e5a3a3', '#c9b6e4', '#a3d3e5', '#f0c27b', '#f4a6c8'],
  color(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % this.COLORS.length; },
  hash(txt) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < txt.length; i++) { const c = txt.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36); },
  pk(id, pin) { return this.hash(`mkc-party:${Party.code}:${pin}:${id}`); },
  stLabel(s) { return { watching: 'Watching', paused: 'Paused', loading: 'Loading', browsing: 'Browsing', away: 'Away' }[s] || ''; },
  ctlHtml() {
    const host = Party.isHost();
    return `<div class="pp-row" role="group" aria-label="Party tools">
      <button type="button" class="chip${this.drawing ? ' on' : ''}" data-nav data-ppx="draw" aria-pressed="${this.drawing}"><i data-lucide="pen-line"></i>Point and draw</button>
      ${host ? '<button type="button" class="chip" data-nav data-ppx="count"><i data-lucide="timer"></i>Start together</button>' : ''}
      ${host ? `<button type="button" class="chip${this.locked ? ' on' : ''}" data-nav data-ppx="pin"><i data-lucide="${this.locked ? 'lock' : 'lock-open'}"></i>${this.locked ? 'PIN on' : 'Add a PIN'}</button>` : (this.locked ? '<span class="chip on pp-ro"><i data-lucide="lock"></i>PIN on</span>' : '')}
      <button type="button" class="chip${CFG.partyAlerts ? ' on' : ''}" data-nav data-ppx="alerts" aria-pressed="${!!CFG.partyAlerts}"><i data-lucide="bell"></i>Alerts</button>
    </div>`;
  },
  refresh() { if (Party.code) Party.render(); },
  click(k) {
    if (k === 'draw') { this.drawing = !this.drawing; this.pad(); this.refresh(); toast(this.drawing ? (!$('#player').hidden ? 'Tap the picture to point, drag to draw' : 'Open the film, then tap the picture to point or drag to draw') : 'Drawing off', 'info', 2600); return; }
    if (k === 'count') { this.startTogether(); return; }
    if (k === 'pin') { this.setPin(); return; }
    if (k === 'alerts') {
      const on = !CFG.partyAlerts;
      if (on && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(() => this.refresh()).catch(() => {});
      if (on && !('Notification' in window)) { toast('This browser can’t show alerts', 'err'); return; }
      setCfg('partyAlerts', on); this.refresh(); toast(on ? 'You’ll get an alert when someone joins or writes while MKCinema is in the background' : 'Party alerts off', 'info', 3200);
    }
  },
  alert(text) {
    try { if (!CFG.partyAlerts || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return; new Notification('Watch party', { body: String(text).slice(0, 160), tag: 'mk-party', silent: false }); } catch (e) { /* not allowed */ }
  },
  /* ---- status ---- */
  myStatus() { if (document.hidden) return 'away'; if (!P.ctx || $('#player').hidden) return 'browsing'; if (!video.paused && video.readyState < 3) return 'loading'; return video.paused ? 'paused' : 'watching'; },
  tick() {
    if (!Party.code) { this.lastSt = ''; return; }
    const s = this.myStatus(), now = Date.now();
    if (s !== this.lastSt || now - this.stAt > 10000) { this.lastSt = s; this.stAt = now; Party.send({ t: 'st', s }); }
  },
  /* ---- room PIN ---- */
  setPin() {
    if (!Party.isHost()) return;
    if (this.locked) { this.locked = false; this.pin = ''; this.admitted.clear(); Party.send({ t: 'lock', on: false }); this.refresh(); toast('PIN removed'); return; }
    const pin = (prompt('Choose a 4-digit PIN for this party') || '').trim();
    if (!/^\d{4}$/.test(pin)) { if (pin) toast('A PIN is 4 digits', 'err'); return; }
    this.pin = pin; this.locked = true; this.admitted = new Set([Party.me.id, ...Party.peers.keys()]);
    Party.send({ t: 'lock', on: true, ids: [...this.admitted] }); this.refresh();
    toast(`PIN ${pin} is on. People joining with the code are asked for it.`, 'ok', 5000);
  },
  gate(m, from) {
    if (!this.locked || this.admitted.has(from) || from === Party.hostId) return false;
    if (Party.isHost()) {
      if (typeof m.pk === 'string' && m.pk === this.pk(from, this.pin)) { this.admitted.add(from); setTimeout(() => { if (this.locked) Party.send({ t: 'admit', ids: [...this.admitted] }); }, 500); return false; }   // after the hello reply, so the new member knows the host
      Party.bus && Party.bus.send({ t: 'pinNeed', _to: from, bad: typeof m.pk === 'string' });
      return true;
    }
    this.pending.set(from, m); return true;   // the host's device decides
  },
  drop(m, from) { return this.locked && m.t !== 'hello' && m.t !== 'admit' && m.t !== 'lock' && from !== Party.hostId && !this.admitted.has(from); },
  /* ---- drawing ---- */
  pad() {
    let pad = $('#ppPad'), cv = $('#ppInk');
    const st = $('#stage'); if (!st) return;
    if (!cv) { cv = document.createElement('canvas'); cv.id = 'ppInk'; cv.className = 'pp-ink'; cv.setAttribute('aria-hidden', 'true'); st.appendChild(cv); }
    if (!pad) {
      pad = document.createElement('div'); pad.id = 'ppPad'; pad.className = 'pp-pad'; st.appendChild(pad);
      let cur = null, sent = 0, moved = false, t0 = 0;
      const pt = (e) => { const r = st.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000]; };
      const flush = () => { if (!cur || cur.pts.length - sent < 2) return; const part = cur.pts.slice(Math.max(0, sent - 1)); sent = cur.pts.length; Party.send({ t: 'ink', c: this.color(Party.me.id), pts: part.slice(0, 80) }); };
      pad.addEventListener('pointerdown', (e) => { if (!Party.code) return; e.preventDefault(); e.stopPropagation(); pad.setPointerCapture(e.pointerId); cur = { c: this.color(Party.me.id), pts: [pt(e)], at: Date.now() }; this.strokes.push(cur); sent = 0; moved = false; t0 = Date.now(); this.loop(); });
      pad.addEventListener('pointermove', (e) => { if (!cur) return; const p = pt(e), l = cur.pts[cur.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) < 0.004) return; moved = true; cur.pts.push(p); cur.at = Date.now(); if (cur.pts.length - sent >= 12) flush(); });
      const end = (e) => { if (!cur) return; if (!moved || (cur.pts.length < 3 && Date.now() - t0 < 300)) { const p = cur.pts[0]; this.strokes.pop(); this.dot(Party.me.id, Party.name(), p[0], p[1]); Party.send({ t: 'ptr', x: p[0], y: p[1] }); } else flush(); cur = null; };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
      pad.addEventListener('click', (e) => e.stopPropagation());
    }
    pad.hidden = !this.drawing || !Party.code;
  },
  ok(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1; },
  dot(id, name, x, y) {
    const st = $('#stage'); if (!st) return;
    let d = this.dots.get(id);
    if (!d || !d.isConnected) { d = document.createElement('div'); d.className = 'pp-dot'; d.innerHTML = '<i></i><span></span>'; st.appendChild(d); this.dots.set(id, d); }
    d.style.setProperty('--pc', this.COLORS[this.color(id)]); d.querySelector('span').textContent = name;
    d.style.left = `${x * 100}%`; d.style.top = `${y * 100}%`; d.classList.remove('go'); void d.offsetWidth; d.classList.add('go');
    clearTimeout(d._t); d._t = setTimeout(() => d.remove(), 2600);
  },
  loop() {
    if (this.raf) return;
    const draw = () => {
      const cv = $('#ppInk'); if (!cv) { this.raf = 0; return; }
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
      const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
      const now = Date.now(); this.strokes = this.strokes.filter((k) => now - k.at < 4000);
      g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(3, cv.width / 260);
      this.strokes.forEach((k) => {
        g.globalAlpha = Math.max(0, Math.min(1, (4000 - (now - k.at)) / 1200)); g.strokeStyle = this.COLORS[k.c] || '#fff';
        g.beginPath(); k.pts.forEach(([x, y], i) => (i ? g.lineTo(x * cv.width, y * cv.height) : g.moveTo(x * cv.width, y * cv.height))); g.stroke();
      });
      g.globalAlpha = 1;
      if (this.strokes.length) this.raf = requestAnimationFrame(draw); else this.raf = 0;
    };
    this.raf = requestAnimationFrame(draw);
  },
  /* ---- 3-2-1 ---- */
  startTogether() {
    if (!Party.isHost()) return;
    if (!P.ctx || $('#player').hidden) { toast('Start a film first, then press Start together'); return; }
    if (!video.paused) video.pause();
    const at = Date.now() + 3600; Party.send({ t: 'count', at }); this.count(at, true);
  },
  count(at, host) {
    let o = $('#ppCount'); if (o) o.remove();
    o = document.createElement('div'); o.id = 'ppCount'; o.className = 'pp-count'; o.setAttribute('aria-live', 'assertive');
    ($('#player').hidden ? document.body : $('#player')).appendChild(o);
    const show = () => {
      const left = at - Date.now();
      if (left <= 0) { o.remove(); if (host && video.paused) video.play().catch(() => {}); return; }
      const n = String(Math.min(3, Math.ceil(left / 1000)));
      if (o.textContent !== n) { o.textContent = n; o.classList.remove('go'); void o.offsetWidth; o.classList.add('go'); }
      setTimeout(show, Math.min(120, left));
    };
    show();
  },
  onMsg(m, from) {
    const p = Party.peers.get(from);
    switch (m.t) {
      case 'st': if (p && /^(watching|paused|loading|browsing|away)$/.test(m.s) && p.st !== m.s) { p.st = m.s; Party.renderMembers(); } break;
      case 'ptr': if (this.ok(m.x) && this.ok(m.y) && !$('#player').hidden) this.dot(from, (p && p.name) || 'Guest', m.x, m.y); break;
      case 'ink': if (Array.isArray(m.pts) && m.pts.length >= 2 && m.pts.length <= 80 && m.pts.every((q) => Array.isArray(q) && this.ok(q[0]) && this.ok(q[1])) && !$('#player').hidden) {
        this.pad(); this.strokes.push({ c: Number.isInteger(m.c) && m.c >= 0 && m.c < this.COLORS.length ? m.c : 0, pts: m.pts, at: Date.now() }); if (this.strokes.length > 200) this.strokes.shift(); this.loop();
      } break;
      case 'count': if (from === Party.hostId && typeof m.at === 'number') { const off = Party.offsets.get(from) || 0, local = m.at - off; if (local - Date.now() < 8000 && local - Date.now() > -500) this.count(local, false); } break;
      case 'pinNeed': if (m._to === Party.me.id) {
        const pin = (prompt(m.bad ? 'That PIN didn’t match. Try again:' : 'This party has a PIN. Ask the host for it:') || '').trim();
        if (!/^\d{4}$/.test(pin)) { toast('You need the party’s PIN to join', 'err', 4000); Party.leave(true); return; }
        Party.bus && Party.bus.send({ t: 'hello', g: Party.guestFlag(), name: Party.name(), host: false, pk: this.pk(Party.me.id, pin) });
      } break;
      case 'lock': if (from === Party.hostId) { this.locked = !!m.on; this.admitted = new Set(Array.isArray(m.ids) ? m.ids.filter((x) => typeof x === 'string').slice(0, 64) : []); this.refresh(); } break;
      case 'admit': if (from === Party.hostId && Array.isArray(m.ids)) {
        this.locked = true; this.admitted = new Set(m.ids.filter((x) => typeof x === 'string').slice(0, 64));
        this.pending.forEach((hello, id) => { if (this.admitted.has(id)) { this.pending.delete(id); Party.onMsg(hello); } });
      } break;
      default: break;
    }
  },
  reset() { this.locked = false; this.pin = ''; this.admitted.clear(); this.pending.clear(); this.drawing = false; const pad = $('#ppPad'); if (pad) pad.hidden = true; },
  init() {
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-ppx]'); if (b) { e.preventDefault(); this.click(b.dataset.ppx); } });
    setInterval(() => { try { this.tick(); if (this.drawing) this.pad(); } catch (e) { /* party gone */ } }, 3000);
    document.addEventListener('visibilitychange', () => { try { this.tick(); } catch (e) { /* ok */ } });
  },
};
PartyPlus.init();
