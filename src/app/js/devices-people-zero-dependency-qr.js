
'use strict';
/* =====================================================================
   MKCinema · devices and people
   A zero-dependency QR encoder, QR handoff to a phone, the phone remote, WebRTC watch parties,
   the Setup Cloner, and deep links (#play?…, #remote=…, #party=…).
   Signaling uses Supabase Realtime broadcast with the built-in publishable key (no sign-in needed),
   plus a BroadcastChannel so two tabs on one computer find each other without the network.
   ===================================================================== */

/* ---------------- QR code (ISO/IEC 18004, byte mode, versions 1–40, error correction M by default) ---------------- */
const QR = (() => {
  const ECW = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const NBLK = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];
  const FORMAT = [1, 0, 3, 2]; // L, M, Q, H
  const bit = (x, i) => ((x >>> i) & 1) !== 0;
  const rawModules = (v) => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECW[e][v] * NBLK[e][v];
  const gmul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
  function rsDivisor(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gmul(root, 0x02); }
    return r;
  }
  function rsRemainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gmul(c, f); }); }
    return r;
  }
  function encode(text, level = 'M') {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let e = { L: 0, M: 1, Q: 2, H: 3 }[level], ver = 1;
    const need = (v) => 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
    for (; ; ver++) { if (ver > 40) throw new Error('Too much data for a QR code'); if (need(ver) <= dataCodewords(ver, e) * 8) break; }
    for (let k = e + 1; k <= 3; k++) if (need(ver) <= dataCodewords(ver, k) * 8) e = k;
    const bb = []; const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); };
    push(4, 4); push(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => push(b, 8));
    const cap = dataCodewords(ver, e) * 8;
    push(0, Math.min(4, cap - bb.length)); push(0, (8 - (bb.length % 8)) % 8);
    for (let pad = 0xEC; bb.length < cap; pad ^= 0xEC ^ 0x11) push(pad, 8);
    const data = []; for (let i = 0; i < bb.length; i += 8) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bb[i + j]; data.push(v); }

    // error correction, split into blocks and interleaved
    const nb = NBLK[e][ver], ecl = ECW[e][ver], raw = Math.floor(rawModules(ver) / 8), nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
    const div = rsDivisor(ecl), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1)); k += dat.length;
      const ecc = rsRemainder(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= nShort) all.push(b[i]); });

    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setF = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const align = [];
    if (ver > 1) { const n = Math.floor(ver / 7) + 2, step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2; align.push(6); for (let p = size - 7; align.length < n; p -= step) align.splice(1, 0, p); }
    align.forEach((ax, i) => align.forEach((ay, j) => { if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
    const formatBits = (mask) => {
      const d = (FORMAT[e] << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(b, i));
      setF(8, 7, bit(b, 6)); setF(8, 8, bit(b, 7)); setF(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(b, i));
      setF(8, size - 8, true);
    };
    formatBits(0);
    if (ver >= 7) {
      let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      const b = (ver << 12) | r;
      for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), c = Math.floor(i / 3); setF(a, c, bit(b, i)); setF(c, a, bit(b, i)); }
    }
    // data in the zigzag
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < all.length * 8) { mod[y][x] = bit(all[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
    const masks = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0, (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
    const applyMask = (k) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && masks[k](x, y)) mod[y][x] = !mod[y][x]; };
    // penalty: long runs, 2×2 blocks, finder look-alikes and dark/light balance
    const penalty = () => {
      let p = 0, dark = 0;
      const lines = (get) => {
        for (let a = 0; a < size; a++) {
          let run = 1, seq = '';
          for (let b = 0; b < size; b++) {
            const c = get(a, b); seq += c ? '1' : '0';
            if (b > 0) { if (c === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
          }
          let k = -1; while ((k = seq.indexOf('1011101', k + 1)) !== -1) { if (seq.slice(Math.max(0, k - 4), k) === '0000' || seq.slice(k + 7, k + 11) === '0000') p += 40; }
        }
      };
      lines((a, b) => mod[a][b]); lines((a, b) => mod[b][a]);
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      mod.forEach((row) => row.forEach((c) => { if (c) dark++; }));
      const total = size * size; p += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let k = 0; k < 8; k++) { applyMask(k); formatBits(k); const pk = penalty(); if (pk < bestP) { bestP = pk; best = k; } applyMask(k); }
    applyMask(best); formatBits(best);
    return { size, modules: mod, version: ver };
  }
  function svg(text, { level = 'M', margin = 4 } = {}) {
    const q = encode(text, level), n = q.size + margin * 2; let d = '';
    q.modules.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + margin} ${y + margin}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  return { encode, svg };
})();

/* ---------------- Message bus: Supabase Realtime broadcast + BroadcastChannel, de-duplicated ---------------- */
const rid = (n = 10) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
// rejection sampling: 248 is the largest multiple of 31 below 256, so every character is equally likely
const roomCode = () => { const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; while (s.length < 6) for (const b of crypto.getRandomValues(new Uint8Array(8))) if (b < 248 && s.length < 6) s += A[b % 31]; return s; };
async function realtimeClient() {
  if (Account.client) return Account.client;
  const c = Account.config(); if (!c) return null;
  try { await Account.loadLib(); Account.rt = Account.rt || window.supabase.createClient(c.url.replace(/\/+$/, ''), c.anonKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'mkc:rt' } }); return Account.rt; }
  catch (e) { return null; }
}
class Bus {
  constructor(topic, onMsg, id) { this.topic = topic; this.onMsg = onMsg; this.id = id || rid(); this.seen = new Set(); this.ch = null; this.online = false;
    try { this.bc = new BroadcastChannel(`mkc:${topic}`); this.bc.onmessage = (e) => this.recv(e.data); } catch (e) { this.bc = null; }
  }
  async connect() {
    const c = await realtimeClient(); if (!c) return false;
    this.ch = c.channel(`mkc-${this.topic}`, { config: { broadcast: { self: false, ack: false } } });
    this.ch.on('broadcast', { event: 'm' }, ({ payload }) => this.recv(payload));
    // online follows every later status too: a channel can come up after the 9 s wait, or drop much later
    const ch = this.ch;
    this.online = await new Promise((res) => { let done = false; const fin = (v) => { if (!done) { done = true; clearTimeout(t); res(v); } }; const t = setTimeout(() => fin(false), 9000); ch.subscribe((st) => { if (st !== 'SUBSCRIBED' && st !== 'CHANNEL_ERROR' && st !== 'TIMED_OUT' && st !== 'CLOSED') return; const up = st === 'SUBSCRIBED'; if (!done) { fin(up); return; } if (this.ch === ch) { this.online = up; if (this.onState) this.onState(up); } }); });
    return this.online;
  }
  /* a fresh realtime subscription on the same topic; the BroadcastChannel and the de-duplication stay */
  async reconnect() {
    const ch = this.ch; this.ch = null; this.online = false;
    if (ch) { ch.unsubscribe().catch(() => {}); try { ch.socket && ch.socket.remove && ch.socket.remove(ch); } catch (e) { /* gone */ } }
    return this.connect();
  }
  send(msg) {
    const m = { ...msg, _from: this.id, _id: rid(8) }; this.seen.add(m._id);
    try { this.bc && this.bc.postMessage(m); } catch (e) { /* closed */ }
    if (this.ch && this.online) this.ch.send({ type: 'broadcast', event: 'm', payload: m }).catch(() => {});
    return m;
  }
  recv(m) {
    if (!m || m._from === this.id || this.seen.has(m._id)) return; this.seen.add(m._id);
    if (this.seen.size > 2000) this.seen = new Set([...this.seen].slice(-500));
    if (m._to && m._to !== this.id) return;
    this.onMsg(m);
  }
  close() { try { this.bc && this.bc.close(); } catch (e) { /* ignore */ } if (this.ch) { this.ch.unsubscribe().catch(() => {}); try { this.ch.socket && this.ch.socket.remove && this.ch.socket.remove(this.ch); } catch (e) { /* ignore */ } } this.ch = null; this.online = false; }
}
const appLink = (hash) => (/^https?:$/.test(location.protocol) ? `${PUBLIC_ORIGIN}${location.pathname}#${hash}` : '');

/* ---------------- Phone: QR handoff (watch this on your phone) and remote control (your phone drives this screen) ---------------- */
const Cast = {
  tab: 'handoff',
  open(tab) {
    if (tab) this.tab = tab; else this.tab = P.stream && !$('#player').hidden && !IS_TV ? 'handoff' : 'remote';
    openLayer('castLayer'); this.render();
  },
  handoffLink() {
    if (!P.ctx || !P.stream) return '';
    const m = P.ctx.meta, s = P.stream, q = new URLSearchParams({ type: m.type, id: m.id });
    if (P.ctx.video) q.set('video', P.ctx.video.id);
    const url = !s._local && /^https?:/i.test(s.url || '') ? s.url : '';
    if (url) q.set('stream', url);
    const h = s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request; if (url && h) q.set('h', b64json(h));
    q.set('t', String(Math.floor(pNow() || 0)));
    return appLink(`play?${q.toString()}`);
  },
  render() {
    const body = $('#castBody'), tabs = `<div class="segc cast-tabs" role="tablist"><button type="button" data-ct="handoff" class="${this.tab === 'handoff' ? 'on' : ''}">Watch on phone</button><button type="button" data-ct="remote" class="${this.tab === 'remote' ? 'on' : ''}">Phone remote</button><button type="button" data-ct="join" class="${this.tab === 'join' ? 'on' : ''}">Control another screen</button></div>`;
    let inner = '';
    if (!/^https?:$/.test(location.protocol)) inner = '<p class="sub">QR codes need MKCinema on a web address (your Cloudflare Pages site, or mkcinema-server.js at http://…:7000). A file opened from disk has no address a phone can reach.</p>';
    else if (this.tab === 'handoff') {
      const link = this.handoffLink();
      inner = link ? `<div class="qr-wrap">${QR.svg(link)}</div><p class="sub">Scan with your phone camera. It opens ${esc(P.ctx.meta.name)} at <b class="tnum">${fmtTime(pNow())}</b> on the same source.</p>
        <p class="tour-note">The code contains this stream’s link. Debrid links are tied to your account, so only show it to people you would hand the link to.</p><div class="actions"><button class="btn btn-ghost btn-sm" type="button" id="castCopy"><i data-lucide="copy"></i>Copy link</button></div>`
        : `<p class="sub">${P.stream && P.stream._local ? 'Files opened from this device stay on this device, so they cannot be sent to a phone. Online sources can.' : 'Start a video first, then come back here to send it to your phone at the same moment.'}</p>`;
    } else if (this.tab === 'remote') {
      const code = Remote.code || (Remote.code = Remote.storedCode()); Remote.host();
      inner = `<div class="rmx"><div class="rmx-qr">${QR.svg(Remote.link(code))}</div><div class="rmx-t">
        <h3 class="rmx-h">Use your phone as a remote</h3>
        <p class="rmx-s">Point your phone’s camera at the code.</p>
        <p class="rmx-s">No camera? On your phone, open this address and enter the code:</p><p class="rmx-addr">${esc(Remote.link().replace(/^https?:\/\//, ''))}</p>
        <div class="rmx-code tnum" id="rmCode" aria-label="Code ${esc(code.split('').join(' '))}">${code.split('').map((c) => `<span>${esc(c)}</span>`).join('')}</div>
        <div class="rmx-foot"><span class="rmx-st" id="castState" data-s="${Remote.stateKind()}"><i></i><span>${Remote.stateLine()}</span></span><button class="rmx-new" type="button" id="rmNew"><i data-lucide="refresh-cw"></i>New code</button></div></div></div>`;
    } else {
      inner = `<p class="sub">Enter the code shown on the other screen. This opens MKCinema Remote, which remembers the screen for next time.</p><div class="inrow"><input class="inp mono rm-code" id="castCode" maxlength="6" autocapitalize="characters" placeholder="ABC123"><button class="btn btn-prime" type="button" id="castJoin"><i data-lucide="link"></i>Connect</button></div>`;
    }
    body.innerHTML = (IS_TV && this.tab === 'remote' ? '' : tabs) + inner; icons();
    $$('[data-ct]', body).forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.ct; this.render(); }));
    const cp = $('#castCopy'); if (cp) cp.onclick = () => copyText(this.handoffLink());
    const j = $('#castJoin'); if (j) j.onclick = () => { const c = $('#castCode').value.trim().toUpperCase(); if (RM_CODE.test(c)) Remote.join(c); else toast('Codes have 6 characters', 'err'); };
    const nw = $('#rmNew'); if (nw) nw.onclick = () => Remote.renew();
  },
};
$('#pCast').onclick = () => Cast.open();

/* ---------------- Phone remote (2.7.21) ----------------
   The phone opens remote.html (served as /remote), a small page of its own that loads instantly and talks over one bare
   Realtime socket. This screen hosts channel remote-<CODE>; the code is kept, so a phone paired once reconnects by itself.
   Phones send keys (the same path as the TV's own remote), text for the focused box, and player commands; this screen
   answers with what is on it: the highlighted title, the player position, and whether a text box wants typing. */
const RM_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/;
const rmText = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|email|password|url|tel|number)$/.test(el.type || 'text'))) && !el.closest('[hidden]');
const Remote = {
  code: '', bus: null, peers: new Map(), last: '', lastAt: 0, soonT: 0, beatT: 0, hintEl: null,
  device() {
    const u = navigator.userAgent;
    return /AFT[A-Z]/.test(u) ? 'Fire TV' : /Web0S|webOS/.test(u) ? 'LG TV' : /GoogleTV/.test(u) ? 'Google TV' : /Android TV|MKCinemaTV|BRAVIA/.test(u) ? 'Android TV' : /Tizen/.test(u) ? 'Samsung TV' : IS_TV ? 'TV'
      : /Android|iPad/.test(u) ? 'Tablet' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows PC' : 'Computer';
  },
  storedCode() { let c = Store.get('rcode', ''); if (!RM_CODE.test(c)) { c = roomCode(); Store.set('rcode', c); } return c; },
  link(code) {
    if (!/^https?:$/.test(location.protocol)) return '';
    // a screen on its own Supabase project hands the phone that project too (url and publishable key, both public)
    let extra = ''; const c = Account.config();
    if (code && c && c.url && c.anonKey && c.url.replace(/\/+$/, '') !== SUPABASE_PROJECT.url) extra = `.${btoa(JSON.stringify({ u: c.url.replace(/\/+$/, ''), k: c.anonKey })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
    return `${PUBLIC_ORIGIN}${location.pathname.replace(/[^/]*$/, '')}remote${code ? `#${code}${typeof RmSec !== 'undefined' ? RmSec.frag(code) : ''}${extra}` : ''}`;
  },
  async host(auto) {
    if (this.bus) return this.bus.online;
    this.code = this.storedCode(); // known at once, so the panel never draws without it
    // one tab hosts the remote: a second tab of this browser would otherwise answer the same phones twice
    if (typeof RmSec !== 'undefined' && !(await RmSec.claim(auto === 'auto'))) { this.paintCast(); return false; }
    if (this.bus) return this.bus.online;
    this.code = this.storedCode();
    const bus = this.bus = new (typeof RmBus !== 'undefined' ? RmBus : Bus)(`remote-${this.code}`, (m) => this.onMsg(m));
    clearInterval(this.beatT); this.beatT = setInterval(() => this.beat(), 1000);
    const ok = await bus.connect(); if (this.bus !== bus) return false;
    this.paintCast(); return ok;
  },
  /* a new code: every paired phone is told, then has to scan again */
  async renew() {
    // the goodbye goes out sealed with each phone's old key, then every allowed phone is forgotten
    const old = this.bus;
    if (old) { old.send({ t: 'gone' }); setTimeout(() => old.close(), 900); }
    this.bus = null; this.peers.clear();
    if (typeof RmSec !== 'undefined') RmSec.reset();
    Store.set('rcode', roomCode()); await this.host(); if (typeof Cast !== 'undefined' && !$('#castLayer').hidden) Cast.render();
    toast('New remote code. Every paired phone was removed and needs to scan again.', 'ok', 4200);
  },
  /* this device becomes the remote: the remote page is its own, lighter app */
  join(code) {
    const l = this.link(RM_CODE.test(code || '') ? code : '');
    if (!l) { toast('The phone remote needs MKCinema on a web address, such as app.mkcinema.app.', 'err', 6000); return; }
    location.href = l;
  },
  leave() { /* the remote lives on its own page now */ },
  stateKind() { return this.peers.size ? 'on' : !this.bus && typeof RmSec !== 'undefined' && RmSec.elsewhere ? 'away' : this.bus && this.bus.online ? 'ready' : 'wait'; },
  stateLine() {
    const n = this.peers.size;
    if (n) return n === 1 ? 'Phone connected' : `${n} phones connected`;
    if (!this.bus && typeof RmSec !== 'undefined' && RmSec.elsewhere) return 'Open in another MKCinema window. Reopen this panel to move it here.';
    if (this.bus && this.bus.online) return 'Ready for your phone';
    return 'Getting ready…';
  },
  paintCast() {
    const st = $('#castState'); if (!st) return;
    const k = this.stateKind(), t = $('span', st); if (st.dataset.s !== k) st.dataset.s = k; if (t) t.textContent = this.stateLine();
    const cb = $('#rmCode'); if (cb && this.code && cb.textContent !== this.code) { if (typeof Cast !== 'undefined') Cast.render(); }
  },
  beat() {
    const now = Date.now();
    this.peers.forEach((p, id) => { if (now - p.at > 15000) this.peers.delete(id); });
    // a channel that never came up is retried every 20 s
    if (this.bus && !this.bus.online && now - (this.retryAt || 0) > 20000) { this.retryAt = now; const b = this.bus; this.bus = null; b.close(); this.host(); return; }
    if (this.peers.size) this.push();
  },
  onMsg(m) {
    const id = m._from; if (!id) return;
    if (m.t === 'bye') { this.peers.delete(id); this.paintCast(); return; }
    const known = this.peers.get(id);
    this.peers.set(id, { name: String(m.name || (known && known.name) || 'Phone').slice(0, 30), at: Date.now(), v: Number(m.v) || (known && known.v) || 0 });
    if (!known) {
      toast(`${m.name && m.name !== 'Phone' ? m.name.replace(/^\w/, (c) => c.toUpperCase()) : 'Your phone'} is connected as a remote`, 'ok', 3200);
      Store.set('rmPaired', true); this.unhint(); this.paintCast();
    }
    switch (m.t) {
      case 'hi': this.push(true); return;
      case 'key': this.key(String(m.k || '')); break;
      case 'cmd': this.cmd(m.c, m.v); break;
      case 'text': this.text(String(m.v == null ? '' : m.v)); break;
      case 'enter': this.enter(); break;
      default: return;
    }
    this.soon();
  },
  soon() { clearTimeout(this.soonT); this.soonT = setTimeout(() => this.push(), 40); },
  /* ---- keys: the same path a TV remote's keys take ---- */
  press(key) {
    const a = document.activeElement, t = a && a !== document.body && a.isConnected ? a : document.body;
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); t.dispatchEvent(ev);
    // a text box keeps the arrows on a computer; a remote has no other way out of it
    if (!ev.defaultPrevented && /^Arrow/.test(key) && rmText(t)) Nav.move(key.slice(5).toLowerCase());
    return ev;
  },
  layerOpen() { return ['castLayer', 'partyLayer', 'player', 'trailer', 'tour', 'stremioImport', 'palette', 'epSheet', 'askLayer', 'tastePick', 'settings', 'addons', 'detail'].some((id) => { const el = $(`#${id}`); return el && !el.hidden; }); },
  key(k) {
    TV_KEY_AT = performance.now();
    const dirs = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }, playing = !$('#player').hidden;
    if (dirs[k]) { this.press(dirs[k]); return; }
    switch (k) {
      case 'ok': this.ok(); break;
      case 'back': if (this.layerOpen()) back(); else if (S.view !== 'home') { go('home'); this.focusHome(); } break;
      case 'home': this.home(); break;
      case 'search': this.typeIn(); break;
      case 'menu': if (playing) $('#pOpts').click(); break;
      case 'playpause': if (playing) { togglePlay(); wakeHud(); } else if (!$('#trailer').hidden) this.press(' '); break;
      case 'rew': case 'ff': if (playing) { seekBy(k === 'ff' ? step() : -step()); seekFx(k === 'ff' ? 1 : -1); } break;
      case 'volup': case 'voldown': this.cmd(k); break;
      default: break;
    }
  },
  ok() {
    const a = document.activeElement, el = a && a !== document.body && a.isConnected && !a.closest('[hidden]') ? a : null, player = $('#player');
    if (rmText(el)) { if (el.value && (el.id === 'palInput' || el.type === 'search')) this.press('Enter'); else this.push(true); return; }
    if (!player.hidden) {
      if (Skip.visible()) { Skip.go(); return; }
      const hud = $('#hud');
      if (!el || !player.contains(el) || (hud.contains(el) && hud.classList.contains('idle'))) { togglePlay(); wakeHud(); return; }
    }
    if (!el) { if (IS_TV) Nav.restore(true); else Nav.move('down'); return; }
    if (this.press('Enter').defaultPrevented || !el.isConnected) return;
    if (el.tagName === 'SELECT') { if (el.options.length) { el.selectedIndex = (el.selectedIndex + 1) % el.options.length; el.dispatchEvent(new Event('change', { bubbles: true })); } return; }
    el.click();
  },
  home() {
    for (let i = 0; i < 12 && this.layerOpen(); i++) back();
    if (!$('#player').hidden) closePlayer();
    if (S.view !== 'home') go('home'); else scrollTo({ top: 0 });
    this.focusHome();
  },
  focusHome() { setTimeout(() => { const h = $('#heroPlay'); if (h && h.getBoundingClientRect().width) Nav.focus(h, true); else Nav.restore(true); }, 140); },
  /* typing from the phone: the TV's own on-screen keyboard stays down until its remote is used again */
  quiet(el) {
    if (!el || el.dataset.rmq != null) return;
    el.dataset.rmq = el.getAttribute('inputmode') == null ? '-' : el.getAttribute('inputmode'); el.setAttribute('inputmode', 'none');
    const undo = () => { const v = el.dataset.rmq; delete el.dataset.rmq; if (v === '-') el.removeAttribute('inputmode'); else el.setAttribute('inputmode', v); el.removeEventListener('blur', undo); removeEventListener('keydown', real, true); };
    const real = (e) => { if (e.isTrusted) undo(); };
    el.addEventListener('blur', undo); addEventListener('keydown', real, true);
  },
  typeIn() {
    const a = document.activeElement; if (rmText(a)) { this.quiet(a); return a; }
    const el = $('#palInput'); this.quiet(el);
    if ($('#palette').hidden) openPalette(); else el.focus();
    return el;
  },
  text(v) {
    const el = this.typeIn(); v = v.slice(0, 500);
    if (el.value === v) return;
    el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  enter() {
    const el = document.activeElement; if (!rmText(el)) return;
    const ev = this.press('Enter');
    if (!ev.defaultPrevented && el.form) { try { el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); } catch (e) { /* invalid form */ } }
  },
  /* ---- player commands (older phone remotes send these too) ---- */
  cmd(c, v) {
    if ($('#player').hidden) return;
    const setVol = (x) => { x = clamp(x, 0, 1); if (P.ducking) { Duck.base = x; video.volume = x * Duck.target; } else { video.volume = x; video.muted = false; } };
    const cur = () => (P.ducking ? Duck.base : video.volume);
    switch (c) {
      case 'toggle': togglePlay(); break;
      case 'back': seekBy(-step()); seekFx(-1); break;
      case 'fwd': seekBy(step()); seekFx(1); break;
      case 'seek': { const t = Number(v), d = pDur(); if (isFinite(t) && isFinite(d)) { pSeek(clamp(t, 0, Math.max(0, d - 1))); seekFx(t >= pNow() ? 1 : -1); } break; }
      case 'vol': setVol(Number(v) / 100); break;
      case 'volup': setVol(cur() + 0.1); toast(`Volume ${Math.round(cur() * 100)}%`, 'info', 900, 'rmvol'); break;
      case 'voldown': setVol(cur() - 0.1); toast(`Volume ${Math.round(cur() * 100)}%`, 'info', 900, 'rmvol'); break;
      case 'dsp': DSP.cycle(); break;
      case 'subs': if (P.curSub >= 0) { selectSub(-1); toast('Subtitles off'); } else cycleSub(); break;
      default: break;
    }
    wakeHud();
  },
  /* ---- what the phone shows ---- */
  where() {
    const L = { trailer: 'Trailer', tour: 'Welcome', palette: 'Search', castLayer: 'Phone', partyLayer: 'Watch party', epSheet: 'Episodes', settings: 'Settings', addons: 'Addons', detail: 'Details' };
    for (const id of Object.keys(L)) { const el = $(`#${id}`); if (el && !el.hidden) return L[id]; }
    return { home: 'Home', movie: 'Movies', series: 'Series', tv: 'Live TV', library: 'Library', calendar: 'Calendar', studio: 'Studio' }[S.view] || 'Browsing';
  },
  state() {
    const a = document.activeElement, pl = !$('#player').hidden && P.ctx, s = { t: 'st', v: pl ? 'player' : 'browse', dev: this.device(), step: step(), app: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '', caps: ['sec', 'lsn', 'ps', 'cm', 'ad', 'pv'] };
    if (pl) {
      const m = P.ctx.meta, v = P.ctx.video, d = pDur();
      Object.assign(s, { title: m.name || '', sub: v ? `S${v.season} · E${v.episode}${v.name || v.title ? ` · ${v.name || v.title}` : ''}` : [m.year || m.releaseInfo, (m.genres || [])[0]].filter(Boolean).join(' · '),
        art: (v && v.thumbnail) || m.background || m.poster || '', cur: Math.round((pNow() || 0) * 10) / 10, dur: P.stream && isFinite(d) ? Math.round(d) : 0,
        paused: video.paused, vol: Math.round((P.ducking ? Duck.base : video.volume) * 100), subs: P.curSub >= 0 });
    } else {
      const card = a && a.closest ? a.closest('[data-card]') : null;
      const m = card ? (S.metas.get(card.dataset.id) || { name: card.getAttribute('aria-label') || '' }) : (!$('#detail').hidden && D.meta) || null;
      s.where = this.where();
      if (m) { s.title = m.name || ''; s.sub = [m.year || m.releaseInfo, m.type === 'series' ? 'Series' : m.type === 'movie' ? 'Film' : ''].filter(Boolean).join(' · '); s.art = m.background || m.poster || ''; }
      else s.title = s.where;
    }
    if (rmText(a)) {
      const lab = a.id === 'palInput' ? 'Search' : a.placeholder || a.getAttribute('aria-label') || (a.labels && a.labels[0] ? a.labels[0].textContent.trim() : '');
      s.kb = { val: a.type === 'password' ? '' : a.value, ph: lab.slice(0, 60), pw: a.type === 'password', type: a.type, go: a.id === 'palInput' || a.type === 'search' ? 'search' : 'enter' };
    }
    if (typeof TvLogin !== 'undefined' && TvLogin.bus && (TvLogin.state === 'waiting' || TvLogin.state === 'phone')) s.login = TvLogin.link();
    return s;
  },
  push(force) {
    if (!this.bus || !this.peers.size) return;
    const s = this.state(), sig = JSON.stringify({ ...s, cur: 0 }), now = Date.now();
    // the phone runs its progress bar by itself: a playing film needs a fresh position every 3 s, or at once after a jump
    const exp = (this.lastCur || 0) + (this.lastRun ? (now - this.lastAt) / 1000 : 0), jump = s.v === 'player' && Math.abs((s.cur || 0) - exp) > 1.5;
    if (!force && !jump && sig === this.last && now - this.lastAt < (s.v === 'player' && !s.paused ? 3000 : 4000)) return;
    this.last = sig; this.lastAt = now; this.lastCur = s.cur || 0; this.lastRun = s.v === 'player' && !s.paused; this.bus.send(s);
  },
  status() { this.soon(); },
  /* TV: a quiet corner card the first few launches, until a phone has paired */
  hint() {
    if (!IS_TV || this.hintEl || this.peers.size || Store.get('rmPaired', false)) return;
    // never over the welcome tour or an open panel: wait for the home screen
    if (this.layerOpen() || (window.MKCalm ? MKCalm.busy() : document.body.classList.contains('intro-on'))) { clearTimeout(this.hintT); this.hintT = setTimeout(() => this.hint(), 3000); return; }
    const n = Store.get('rmHint', 0), link = this.link(this.code); if (n >= 3 || !link) return; Store.set('rmHint', n + 1);
    const el = this.hintEl = document.createElement('div'); el.className = 'rm-hint'; el.setAttribute('role', 'status');
    el.innerHTML = `<div class="qr-wrap">${QR.svg(link, { margin: 2 })}</div><div class="rm-hint-t"><small>Phone remote</small><b>Use your phone as a remote</b><span>Scan with your phone camera, or open ${esc(this.link().replace(/^https?:\/\//, ''))} and type <b class="mono">${esc(this.code)}</b></span></div>`;
    document.body.appendChild(el); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on'))); tvBackHook();
    setTimeout(() => this.unhint(), 18000);
  },
  unhint() { const el = this.hintEl; if (!el) return; this.hintEl = null; el.classList.remove('on'); if (el.id === 'remote') el.removeAttribute('id'); tvBackHook(); setTimeout(() => el.remove(), 700); },
};
['play', 'pause', 'seeked', 'loadedmetadata'].forEach((ev) => video.addEventListener(ev, () => { if (Remote.peers.size) Remote.soon(); }));
document.addEventListener('focusin', () => { if (Remote.peers.size) Remote.soon(); });
/* A TV, or a screen a phone has paired with before, listens for its phones from launch */
if (IS_TV || Store.get('rmPaired', false)) {
  const start = () => {
    if (document.body.classList.contains('intro-on')) { setTimeout(start, 600); return; }
    setTimeout(() => Remote.host('auto').then((ok) => { if (ok) setTimeout(() => Remote.hint(), 1600); }), 1200);
  };
  setTimeout(start, 2500);
}

/* ---------------- 2.37 Ask first: a confirm pop-up for links and phones ----------------
   One question at a time, in the house pop-up, with the TV remote's focus on it. Answers true (yes), false (no) or
   null (Back, closed, timed out). */
const Gate = {
  q: [], cur: null, hooked: false, t: 0,
  ask(o) { return new Promise((res) => { this.q.push({ ...o, res }); this.next(); }); },
  next() {
    // a link opened at start-up can ask before the rest of the app has loaded: wait for it
    if (this.cur || !this.q.length) return;
    if (typeof X8 === 'undefined' || document.readyState === 'loading') { if (!this.waiting) { this.waiting = true; addEventListener('DOMContentLoaded', () => { this.waiting = false; this.next(); }, { once: true }); } return; }
    const o = this.q.shift(); this.cur = o;
    if (!this.hooked) { this.hooked = true; const root = Nav.root.bind(Nav); Nav.root = function () { const g = $('#mkGate'); return g && !g.hidden ? g : root(); }; }
    const el = X8.layer('mkGate', { label: 'Check' }); el.classList.add('mk-gate');
    X8.onClose.mkGate = () => this.done(null);
    const b = X8.body('mkGate');
    b.innerHTML = `<span class="eyebrow"><i data-lucide="${esc(o.icon || 'shield-check')}"></i>${esc(o.eyebrow || 'Check first')}</span><h2 class="x8-h">${esc(o.title)}</h2><p class="sc-p">${o.html || ''}</p>
      <div class="inrow mk-gate-acts"><button class="btn btn-prime" type="button" data-nav data-gate="1">${esc(o.yes || 'OK')}</button><button class="btn btn-ghost" type="button" data-nav data-gate="0">${esc(o.no || 'Cancel')}</button></div>`;
    icons();
    const t0 = performance.now();
    $$('[data-gate]', b).forEach((x) => { x.onclick = () => { if (this.cur !== o || performance.now() - t0 < (o.arm || 0)) return; this.done(x.dataset.gate === '1'); }; });
    X8.open('mkGate');
    clearTimeout(this.t); if (o.timeout) this.t = setTimeout(() => { if (this.cur === o) this.done(null); }, o.timeout);
    setTimeout(() => { const y = $('[data-gate="1"]', b); if (y && this.cur === o) { if (IS_TV) Nav.focus(y, true); else y.focus({ preventScroll: true }); } }, 80);
  },
  done(v) {
    const o = this.cur; if (!o) return; this.cur = null; clearTimeout(this.t);
    X8.close('mkGate'); o.res(v);
    setTimeout(() => this.next(), 280);
  },
  drop(test) { this.q = this.q.filter((o) => { if (!test(o)) return true; o.res(null); return false; }); if (this.cur && test(this.cur)) this.done(null); },
};

/* ---------------- 2.37 Phone remote pairing: phones are allowed on this screen, and talk to it encrypted ----------------
   The QR code carries a pairing key after the code (remote#CODE_KEY). A new phone sends an ECDH public key (sealed with
   that key when it scanned the QR); this screen answers with one of its own, both sides derive a key for that phone
   alone, and this screen asks "Allow this phone?" with a 4-digit check number the phone shows too. Allowed phones are
   remembered (Settings › Devices lists them, each with Remove); from then on every message, both ways, is AES-GCM
   sealed with that phone's key. The code alone, or anyone else listening on the channel, can neither drive this screen
   nor read what it sends (typed text, sign-in links, stream links). New code forgets every phone.
   A phone page from before 2.37 is told to update instead of being obeyed. A screen without WebCrypto (plain http on
   the LAN server) still asks before a phone may control it, and then talks in the clear. */
const RM_PHONE_T = new Set(['hi', 'key', 'cmd', 'text', 'enter', 'lsn', 'lrtc', 'lice', 'lping', 'ad', 'ps', 'cm', 'bye']);
const RmSec = {
  can: !!(window.crypto && crypto.subtle && window.isSecureContext !== false),
  sn: rid(10), keys: new Map(), pend: new Map(), ivs: new Set(), told: new Map(), asks: [], epoch: 0,
  held: false, queued: false, elsewhere: false,
  te: new TextEncoder(), td: new TextDecoder(),
  enc(b) { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(s) { s = String(s || ''); return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)); },
  cat(a, b) { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; },
  async hash(b) { return new Uint8Array(await crypto.subtle.digest('SHA-256', b)); },
  aes(raw) { return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); },
  aad(dir, code, id) { return this.te.encode(`mkc-rm3|${dir}|${code}|${id}`); },
  async seal(key, obj, aad) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, this.te.encode(JSON.stringify(obj))); return { iv: this.enc(iv), e: this.enc(new Uint8Array(ct)) }; },
  async open(key, m, aad) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.dec(m.iv), additionalData: aad }, key, this.dec(m.e)); return JSON.parse(this.td.decode(pt)); },
  async sealText(key, text) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, this.te.encode(text)); return { iv: this.enc(iv), e: this.enc(new Uint8Array(ct)) }; },
  async openText(key, e, iv) { return this.td.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.dec(iv) }, key, this.dec(e))); },
  async sas(a, b) { const h = await this.hash(this.te.encode(`${a}|${b}`)); return String((((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0) % 10000).padStart(4, '0'); },
  /* ---- what this screen remembers ---- */
  phones() { const l = Store.get('rphones', []); return Array.isArray(l) ? l.filter((p) => p && typeof p.id === 'string' && p.id) : []; },
  phone(id) { return this.phones().find((p) => p.id === id) || null; },
  blocked(id) { const l = Store.get('rblock', []); return Array.isArray(l) && l.includes(id); },
  qkey() { let k = Store.get('rkey', ''); if (!/^[A-Za-z0-9_-]{22}$/.test(k)) { k = this.enc(crypto.getRandomValues(new Uint8Array(16))); Store.set('rkey', k); } return k; },
  frag(code) { return this.can && code && code === Store.get('rcode', '') ? `_${this.qkey()}` : ''; },
  async keyFor(p) { const c = this.keys.get(p.id); if (c && c.k === p.k) return c.key; const key = await this.aes(this.dec(p.k)); this.keys.set(p.id, { k: p.k, key }); return key; },
  reset() { this.epoch++; Store.set('rphones', []); Store.set('rblock', []); Store.set('rkey', ''); this.keys.clear(); this.pend.clear(); Gate.drop((o) => o.rmPair); },
  remove(id) {
    const p = this.phone(id); if (!p) return;
    if (Remote.bus) Remote.bus.send({ t: 'unpaired', _to: id }); // sealed with its key, sent before the key goes
    Store.set('rphones', this.phones().filter((x) => x.id !== id)); this.keys.delete(id);
    Remote.peers.delete(id); Remote.paintCast(); toast(`${p.name} can no longer control this screen`, 'ok', 3200);
  },
  rows() {
    const l = this.phones(); if (!l.length) return [];
    return l.map((p, i) => ({ key: `rmPhone${i}`, label: p.name || 'Phone', help: `Allowed phone, since ${new Date(p.at || Date.now()).toLocaleDateString(appLocale())}. It can control this screen.`, type: 'button', text: 'Remove', icon: 'trash-2', run: () => { this.remove(p.id); renderSettingsBody(); } }));
  },
  /* ---- one tab hosts the remote (a second tab of the same browser would answer the same phones twice) ---- */
  claim(auto) {
    if (this.held || !navigator.locks || !navigator.locks.request) return Promise.resolve(true);
    return new Promise((res) => {
      navigator.locks.request('mkc-remote-host', auto ? { ifAvailable: true } : { steal: true }, (lock) => {
        if (!lock) { this.elsewhere = true; res(false); this.queue(); return undefined; }
        this.held = true; this.elsewhere = false; res(true); return new Promise(() => {});
      }).catch(() => { if (this.held) this.lost(); else res(true); });
    });
  },
  queue() {
    if (this.queued) return; this.queued = true;
    navigator.locks.request('mkc-remote-host', () => { this.queued = false; this.held = true; this.elsewhere = false; if (!Remote.bus) Remote.host('auto'); return new Promise(() => {}); })
      .catch(() => { this.queued = false; if (this.held) this.lost(); });
  },
  lost() { this.held = false; this.elsewhere = true; const b = Remote.bus; Remote.bus = null; Remote.peers.clear(); if (b) b.close(); Remote.paintCast(); this.queue(); },
  /* ---- messages from the channel ---- */
  async inbound(m, bus) {
    const from = m._from; if (typeof from !== 'string' || !from || from.length > 40) return null;
    if (m.t === 'x') {
      if (!this.can) return null;
      const p = this.phone(from); if (!p || !p.k) { this.tell(bus, from, { t: 'unpaired', _to: from }); return null; }
      let x; try { x = await this.open(await this.keyFor(p), m, this.aad('p2t', bus.code, from)); } catch (e) { return null; }
      if (!x || typeof x.t !== 'string' || x.t === 'x') return null;
      if (this.ivs.has(m.iv)) return null; this.ivs.add(m.iv); if (this.ivs.size > 4000) this.ivs = new Set([...this.ivs].slice(-1000));
      // a message from before this screen (re)started is never acted on again: only hi and bye are timeless
      // (it counts as a hello instead, so the phone gets this screen's new session at once)
      if (x.t !== 'hi' && x.t !== 'bye' && x.sn !== this.sn) return { t: 'hi', _from: from, _id: m._id, _sec: true };
      const { sn, ...rest } = x;
      return { ...rest, _from: from, _id: m._id, _sec: true };
    }
    if (m.t === 'pair') { this.pair(m, bus); return null; }
    const p = this.phone(from);
    if (p && p.plain && !this.can) return m;
    if (!RM_PHONE_T.has(m.t)) return null; // what another screen sends (a second tab on the same code): never a phone
    if (this.blocked(from)) return null;
    if (this.can) {
      // a phone page from before 2.37: it may see this, and nothing else
      this.tell(bus, from, { t: 'st', _to: from, v: 'browse', upd: 1, dev: Remote.device(), step: 10, where: 'Update', title: 'Update this remote page', sub: 'Reload this page: the TV now asks before a phone may control it.' }, 8000);
      return null;
    }
    if (m.t !== 'bye') this.pair({ ...m, plain: true }, bus);
    return null;
  },
  tell(bus, to, msg, every = 5000) { const now = Date.now(), k = `${to}|${msg.t}`; if (now - (this.told.get(k) || 0) < every) return; this.told.set(k, now); if (this.told.size > 300) this.told.clear(); bus.raw(msg); },
  /* ---- a new phone asks ---- */
  async pair(m, bus) {
    const from = m._from, name = String(m.name || 'Phone').replace(/[^\p{L}\p{N} '’.()-]/gu, '').trim().slice(0, 24) || 'Phone', epoch = this.epoch;
    if (this.blocked(from)) { this.tell(bus, from, { t: 'pair-no', _to: from }); return; }
    const plain = !this.can;
    if (!plain && (m.plain || typeof m.pub !== 'string' || m.pub.length > 120)) { this.tell(bus, from, { t: 'pair-no', _to: from, why: 'https' }); return; }
    const was = this.pend.get(from);
    if (was) { if (was.reply && (plain || was.pub === m.pub)) bus.raw(was.reply); return; }
    // never a pile of prompts: three phones waiting at most, and at most six new requests a minute
    const now = Date.now(); this.asks = this.asks.filter((t) => now - t < 60000);
    if (this.pend.size >= 3 || this.asks.length >= 6) return;
    this.asks.push(now);
    const pend = { pub: m.pub, at: now, k: null, sas: '', scanned: false, reply: null }; this.pend.set(from, pend);
    try {
      if (!plain) {
        const P256 = { name: 'ECDH', namedCurve: 'P-256' };
        const theirs = await crypto.subtle.importKey('raw', this.dec(m.pub), P256, false, []);
        const mine = await crypto.subtle.generateKey(P256, false, ['deriveBits']);
        const pub = this.enc(new Uint8Array(await crypto.subtle.exportKey('raw', mine.publicKey)));
        const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: theirs }, mine.privateKey, 256));
        pend.k = await this.hash(this.cat(bits, this.te.encode(`mkc-rm3|${bus.code}|${from}|${m.pub}|${pub}`)));
        pend.sas = await this.sas(m.pub, pub);
        const qk = await this.aes(this.dec(this.qkey()));
        if (m.q && m.qiv) { try { pend.scanned = (await this.openText(qk, m.q, m.qiv)) === `pair|${bus.code}|${from}|${m.pub}`; } catch (e) { pend.scanned = false; } }
        const proof = await this.sealText(qk, `tv|${bus.code}|${from}|${m.pub}|${pub}`);
        pend.reply = { t: 'pair-tv', _to: from, pub, q: proof.e, qiv: proof.iv, dev: Remote.device() };
      } else pend.reply = { t: 'pair-tv', _to: from, plain: true, dev: Remote.device() };
      bus.raw(pend.reply);
    } catch (e) { this.pend.delete(from); this.tell(bus, from, { t: 'pair-no', _to: from, why: 'error' }); return; }
    const how = plain ? '' : pend.scanned ? 'It scanned the code on this screen. ' : 'It typed this screen’s code. ';
    const ok = await Gate.ask({ rmPair: true, icon: 'smartphone', eyebrow: 'Phone remote', title: `Allow ${name}?`, yes: 'Allow', no: 'Block', arm: 900, timeout: 120000,
      html: `${how}Allow it only if it’s yours or belongs to someone here. It can then control this screen, type here and change add-ons.${pend.sas ? `<br>Check that the phone shows <b class="mono">${esc(pend.sas)}</b>.` : ''}` });
    this.pend.delete(from);
    // the channel may have been reopened meanwhile (same code): answer on the current one
    if (epoch !== this.epoch || !Remote.bus || Remote.bus.code !== bus.code || !Remote.bus.raw) return;
    bus = Remote.bus;
    if (ok === true) {
      const l = this.phones().filter((x) => x.id !== from); l.push({ id: from, name, k: pend.k ? this.enc(pend.k) : '', plain, at: Date.now(), scanned: pend.scanned });
      Store.set('rphones', l.slice(-12)); this.keys.delete(from);
      if (plain) bus.raw({ t: 'paired', _to: from, plain: true }); else bus.send({ t: 'paired', _to: from });
      Remote.onMsg({ t: 'hi', name, _from: from, _id: rid(8) });
      if (!$('#settings').hidden && typeof renderSettingsBody === 'function') renderSettingsBody();
    } else if (ok === false) {
      const b = Store.get('rblock', []); Store.set('rblock', [...(Array.isArray(b) ? b : []).filter((x) => x !== from), from].slice(-50));
      bus.raw({ t: 'pair-no', _to: from });
    } else bus.raw({ t: 'pair-no', _to: from, why: 'later' });
  },
  /* ---- messages to phones: sealed for each allowed phone, never sent to anyone else ---- */
  async outbound(bus, msg, p) {
    const { _to, ...body } = msg;
    if (p.plain) { if (!this.can) bus.raw(this.scrub({ ...body, _to: p.id })); return; }
    if (!this.can || !p.k) return;
    const env = await this.seal(await this.keyFor(p), { ...body, sn: this.sn }, this.aad('t2p', bus.code, p.id));
    bus.raw({ t: 'x', _to: p.id, ...env });
  },
  /* in the clear (a screen on plain http), sign-in links and typed secrets stay off the channel */
  scrub(s) {
    if (s.t !== 'st') return s;
    const o = { ...s }; delete o.login;
    if (o.kb && (o.kb.pw || /url|link|key|token|secret|pass|mail/i.test(`${o.kb.ph} ${o.kb.type}`))) o.kb = { ...o.kb, val: '' };
    return o;
  },
};
class RmBus extends Bus {
  constructor(topic, onMsg, id) { super(topic, onMsg, id); this.code = topic.replace(/^remote-/, ''); this.qin = Promise.resolve(); this.qout = Promise.resolve(); }
  raw(msg) { return super.send(msg); }
  recv(m) {
    if (!m || m._from === this.id || this.seen.has(m._id)) return; this.seen.add(m._id);
    if (this.seen.size > 2000) this.seen = new Set([...this.seen].slice(-500));
    if (m._to && m._to !== this.id) return;
    this.qin = this.qin.then(() => RmSec.inbound(m, this)).then((x) => { if (x && Remote.bus === this) this.onMsg(x); }).catch((e) => console.warn('remote', e));
  }
  send(msg) {
    if (!msg) return null;
    // who gets it is decided now (with each phone's key as it is now), so "New code" can still say goodbye with the old keys
    const ids = msg._to ? [msg._to] : [...Remote.peers.keys()];
    ids.forEach((id) => { const p = RmSec.phone(id); if (p) this.qout = this.qout.then(() => RmSec.outbound(this, msg, p)).catch(() => {}); });
    return msg;
  }
}
/* the watch party learns host hand-off once every other party module has wrapped the member list */
const PartyHost = {
  init() {
    const rm = Party.renderMembers;
    Party.renderMembers = function (...a) {
      const r = rm.apply(this, a);
      if (this.code && this.isHost()) this.peers.forEach((p) => {
        if (p.voice) return;
        $$(`.pm-row[data-pid="${CSS.escape(p.id)}"]`).forEach((row) => {
          if ($('.pm-mk', row)) return;
          row.insertAdjacentHTML('beforeend', `<button class="pm-mk" type="button" data-nav aria-label="Make ${esc(p.name)} the host">Make host</button>`);
          $('.pm-mk', row).onclick = () => Party.handOff(p.id);
        });
      });
      return r;
    };
    Party.handOff = function (id) {
      const p = this.peers.get(id); if (!this.isHost() || !p || p.voice) return;
      this.send({ t: 'host', to: id }); this.hostId = id; this.sysLine(`${p.name} is the host now`); this.render();
    };
  },
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => PartyHost.init()); else setTimeout(() => PartyHost.init(), 0);
document.head.insertAdjacentHTML('beforeend', `<style id="mkc-237-rmsec">
#mkGate{z-index:90}
#mkGate .sc-p b.mono{font-size:calc(18px * var(--ts,1));letter-spacing:.18em}
.mk-gate-acts{margin:10px -6px 0;padding:6px;gap:10px;flex-wrap:wrap}
.pm-mk{margin-left:auto;flex:none;font-size:calc(11px * var(--ts,1));padding:5px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.18);color:inherit;background:none;cursor:pointer}
.pm-mk:hover,.pm-mk.nav-focus,.pm-mk:focus-visible{border-color:rgba(255,255,255,.5)}
.tvl-chk{margin-top:8px}
.tvl-chk b{font-size:calc(20px * var(--ts,1));letter-spacing:.24em;margin-left:6px}
</style>`);

/* ---------------- Watch party: WebRTC mesh with "perfect negotiation", data channels for sync, chat and reactions ----------------
   Clocks are compared with ping/pong; the room creator (or the earliest member left) sends a heartbeat, and everyone else
   corrects drift by nudging playback speed up to 5 %, or seeking when more than a second off. Target: under 150 ms. */
const Party = {
  code: '', me: { id: rid(), name: '' }, bus: null, peers: new Map(), hostId: '', chat: [], applying: false, mic: null, speaking: new Set(), offsets: new Map(), hbT: 0, pingT: 0, vadT: 0, rateT: 0, actx: null,
  name() { return CFG.partyName || (Account.user ? Account.name().split('@')[0] : '') || `Guest ${this.me.id.slice(0, 4).toUpperCase()}`; },
  isHost() { return this.hostId === this.me.id; },
  openPanel() {
    if (!$('#player').hidden) { openDrawer('party'); this.render(); }
    else { openLayer('partyLayer'); this.render(); }
  },
  async create() { await this.join(roomCode(), true); },
  async join(code, creating) {
    code = String(code || '').trim().toUpperCase(); if (code.length !== 6) { toast('Party codes have 6 characters', 'err'); return; }
    if (this.code) this.leave(true);
    this.code = code; this.hostId = creating ? this.me.id : ''; this.chat = []; this.peers.clear(); this.offsets.clear();
    this.bus = new Bus(`party-${code}`, (m) => this.onMsg(m), this.me.id);
    this.render(); this.pill();
    const ok = await this.bus.connect();
    if (!ok) toast('The realtime service did not answer. Only other tabs on this computer can join right now.', 'err', 7000);
    this.bus.send({ t: 'hello', name: this.name(), host: this.isHost() });
    clearInterval(this.hbT); this.hbT = setInterval(() => this.heartbeat(), 2000);
    // pings (clock offsets, and proof that a member is still there) only while someone else is in the room
    clearInterval(this.pingT); this.pingT = setInterval(() => { if (this.peers.size) this.send({ t: 'ping', a: Date.now() }); }, 5000);
    if (creating) toast(`Party ${code} is open. Share the code or link.`, 'ok', 5000);
    this.render(); this.pill();
  },
  leave(quiet) {
    if (!this.code) return;
    try { this.bus && this.bus.send({ t: 'bye' }); } catch (e) { /* ignore */ }
    this.peers.forEach((p) => this.dropPeer(p.id)); this.peers.clear();
    if (this.mic) { this.mic.getTracks().forEach((t) => t.stop()); this.mic = null; }
    clearInterval(this.hbT); clearInterval(this.pingT); clearInterval(this.vadT); this.speaking.clear(); Duck.set(false);
    this.bus && this.bus.close(); this.bus = null; this.code = ''; this.hostId = '';
    video.playbackRate = CFG.speed || 1;
    if (!quiet) toast('You left the party'); this.render(); this.pill();
  },
  /* Data channel when open, the realtime bus otherwise; receivers drop duplicates by id */
  send(msg) {
    if (!this.bus) return;
    const m = { ...msg, _from: this.me.id, _id: rid(8) }; this.bus.seen.add(m._id);
    let viaBus = false;
    this.peers.forEach((p) => { if (p.dc && p.dc.readyState === 'open') { try { p.dc.send(JSON.stringify(m)); } catch (e) { viaBus = true; } } else viaBus = true; });
    if (viaBus || !this.peers.size) { try { this.bus.bc && this.bus.bc.postMessage(m); } catch (e) { /* closed */ } if (this.bus.ch && this.bus.online) this.bus.ch.send({ type: 'broadcast', event: 'm', payload: m }).catch(() => {}); }
  },
  onMsg(m) {
    const from = m._from; if (!from || from === this.me.id) return;
    const seen = this.peers.get(from); if (seen) seen.seen = Date.now();
    switch (m.t) {
      case 'hello': {
        m.name = String(m.name || 'Guest').slice(0, 40);
        this.peerFor(from, m.name).seen = Date.now();
        // the room's creator is its host; a claim counts only while no host is here, so nobody can take over
        if (m.host && from !== this.hostId && !this.isHost() && !(this.hostId && this.peers.has(this.hostId))) { this.hostId = from; this.render(); }
        if (!m.reply) this.bus.send({ t: 'hello', name: this.name(), reply: true, host: this.isHost(), _to: from });
        if (this.isHost() && P.ctx) setTimeout(() => this.broadcastState('welcome'), 600);
        this.sysLine(`${m.name} joined`); break;
      }
      case 'signal': this.onSignal(from, m.data); break;
      case 'bye': { const n = (this.peers.get(from) || {}).name; this.dropPeer(from); this.sysLine(`${n || 'Someone'} left`); this.electHost(); break; }
      // playback follows the host only, with sane values: members (or anyone who knows the code) can't drive the room
      case 'state': if (from === this.hostId && this.stateOk(m)) { if (typeof PartyLine !== 'undefined') PartyLine.lastSt = m; this.applyState(m); } break;
      case 'host': if (from === this.hostId && typeof m.to === 'string' && (m.to === this.me.id || this.peers.has(m.to))) { this.hostId = m.to; this.sysLine(m.to === this.me.id ? 'You are the host now' : `${(this.peers.get(m.to) || {}).name || 'Someone'} is the host now`); this.render(); if (this.isHost() && P.ctx) this.broadcastState('host'); } break;
      case 'chat': this.chat.push({ name: m.name, text: String(m.text).slice(0, 400), at: Date.now() }); this.renderChat(); if (!$('#player').hidden && !$('#partyDrawer').classList.contains('open')) toast(`${m.name}: ${String(m.text).slice(0, 80)}`, 'info', 3000); break;
      case 'react': this.float(m.e); break;
      case 'ping': this.send({ t: 'pong', a: m.a, b: Date.now(), _to: from }); break;
      case 'pong': if (m._to === this.me.id) { const now = Date.now(), rtt = now - m.a, off = m.b - (m.a + rtt / 2); const prev = this.offsets.get(from); this.offsets.set(from, prev == null ? off : prev * 0.7 + off * 0.3); const p = this.peers.get(from); if (p) { p.rtt = rtt; this.renderMembers(); } } break;
      default: break;
    }
  },
  stateOk(m) {
    const n = (v) => typeof v === 'number' && isFinite(v), md = m.media;
    if (!n(m.pos) || m.pos < 0 || m.pos > 172800 || !n(m.at) || (m.rate != null && (!n(m.rate) || m.rate < 0.25 || m.rate > 4))) return false;
    if (!md || typeof md !== 'object' || typeof md.metaId !== 'string' || !md.metaId || md.metaId.length > 300 || (md.videoId != null && typeof md.videoId !== 'string')) return false;
    if (md.url && (typeof md.url !== 'string' || md.url.length > 4000 || !/^https?:\/\//i.test(md.url))) return false;
    if (md.headers != null && (typeof md.headers !== 'object' || Object.keys(md.headers).length > 20 || Object.values(md.headers).some((x) => typeof x !== 'string' || x.length > 2000))) return false;
    return true;
  },
  electHost() {},
  /* ---- WebRTC ---- */
  peerFor(id, name) {
    let p = this.peers.get(id); if (p) { if (name) p.name = name; this.renderMembers(); return p; }
    const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }] });
    p = { id, name: name || 'Guest', pc, dc: null, polite: this.me.id > id, makingOffer: false, ignoreOffer: false, audio: null, an: null, rtt: 0, seen: Date.now() };
    this.peers.set(id, p);
    pc.onnegotiationneeded = async () => { try { p.makingOffer = true; await pc.setLocalDescription(); this.signal(id, { description: pc.localDescription && pc.localDescription.toJSON() }); } catch (e) { /* retried on the next change */ } finally { p.makingOffer = false; } };
    pc.onicecandidate = ({ candidate }) => { if (candidate) this.signal(id, { candidate: candidate.toJSON() }); };
    pc.ondatachannel = (e) => this.wire(p, e.channel);
    pc.ontrack = (e) => this.voiceIn(p, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.restartIce(); this.renderMembers(); };
    if (!p.polite) this.wire(p, pc.createDataChannel('mkc', { ordered: true }));
    if (this.mic) this.mic.getTracks().forEach((t) => pc.addTrack(t, this.mic));
    this.renderMembers(); return p;
  },
  wire(p, dc) { p.dc = dc; dc.onopen = () => this.renderMembers(); dc.onclose = () => this.renderMembers(); dc.onmessage = (e) => { try { const m = JSON.parse(e.data); if (!this.bus || this.bus.seen.has(m._id)) return; this.bus.seen.add(m._id); if (m._to && m._to !== this.me.id) return; this.onMsg(m); } catch (err) { /* bad message */ } }; },
  signal(to, data) { this.bus && this.bus.send({ t: 'signal', _to: to, data }); },
  async onSignal(from, { description, candidate } = {}) {
    const p = this.peerFor(from), pc = p.pc;
    try {
      if (description) {
        const collision = description.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision; if (p.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') { await pc.setLocalDescription(); this.signal(from, { description: pc.localDescription.toJSON() }); }
      } else if (candidate) { try { await pc.addIceCandidate(candidate); } catch (e) { if (!p.ignoreOffer) throw e; } }
    } catch (e) { console.warn('party signaling', e); }
  },
  dropPeer(id) { const p = this.peers.get(id); if (!p) return; try { p.pc.close(); } catch (e) { /* closed */ } if (p.audio) p.audio.remove(); this.peers.delete(id); this.speaking.delete(id); this.renderMembers(); },
  /* ---- Voice: mic out, voices in, and ducking while anyone talks ---- */
  async toggleMic() {
    if (this.mic) {
      this.mic.getTracks().forEach((t) => t.stop());
      this.peers.forEach((p) => p.pc.getSenders().forEach((s) => { if (s.track && s.track.kind === 'audio') { try { p.pc.removeTrack(s); } catch (e) { /* closed */ } } }));
      this.mic = null; this.render(); return;
    }
    // a plain http address (the LAN server) is not a secure context: browsers hide the microphone there entirely
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Voice needs MKCinema on an https address, such as app.mkcinema.app', 'err', 6000); return; }
    try { this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { toast(e && e.name === 'NotFoundError' ? 'No microphone was found' : 'Microphone permission was not given', 'err'); return; }
    this.peers.forEach((p) => this.mic.getTracks().forEach((t) => p.pc.addTrack(t, this.mic)));
    toast('Your mic is on. The film dips while anyone talks.', 'ok'); this.render();
  },
  voiceIn(p, stream) {
    if (!p.audio) { p.audio = document.createElement('audio'); p.audio.autoplay = true; p.audio.playsInline = true; $('#partyAudio').appendChild(p.audio); }
    p.audio.srcObject = stream; p.audio.play().catch(() => {});
    try {
      const AC = window.AudioContext || window.webkitAudioContext; this.actx = this.actx || new AC();
      const an = this.actx.createAnalyser(); an.fftSize = 512; this.actx.createMediaStreamSource(stream).connect(an); p.an = an; p.buf = new Float32Array(an.fftSize); p.loud = 0; p.quietAt = 0;
      if (this.actx.state !== 'running') this.actx.resume().catch(() => {});
    } catch (e) { p.an = null; }
    clearInterval(this.vadT); this.vadT = setInterval(() => this.vad(), 50);
  },
  vad() {
    const now = performance.now(); let any = false;
    this.peers.forEach((p) => {
      if (!p.an) return; p.an.getFloatTimeDomainData(p.buf); let sum = 0; for (let i = 0; i < p.buf.length; i++) sum += p.buf[i] * p.buf[i];
      const rms = Math.sqrt(sum / p.buf.length);
      if (rms > 0.025) { p.loud = Math.min(p.loud + 1, 4); p.quietAt = now; } else if (now - p.quietAt > 600) p.loud = 0;
      const on = p.loud >= 2 || (p.loud > 0 && now - p.quietAt < 600); if (on) { any = true; this.speaking.add(p.id); } else this.speaking.delete(p.id);
    });
    Duck.set(any); $$('.pm-row').forEach((r) => r.classList.toggle('talk', this.speaking.has(r.dataset.pid)));
  },
  /* ---- Playback sync ---- */
  mediaInfo() {
    if (!P.ctx || !P.stream) return null; const m = P.ctx.meta, s = P.stream;
    // only the host shares a link, only when they chose to, and never one that carries a server key or a login
    const url = this.isHost() && CFG.partyShareLink && !s._local && /^https?:/i.test(s.url || '') && this.shareable(s) ? s.url : '';
    return { type: m.type, metaId: m.id, videoId: P.ctx.video ? P.ctx.video.id : '', name: m.name, url, headers: url && s.behaviorHints && s.behaviorHints.proxyHeaders ? s.behaviorHints.proxyHeaders.request : null, local: !!s._local };
  },
  shareable(s) {
    const u = String(s.url || ''), h = (s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request) || {};
    if (/[?&#;](api[_-]?key|apikey|x-plex-token|x-emby-token|x-mediabrowser-token|access_token|token|auth|authorization|password|passwd)=/i.test(u) || /^[a-z]+:\/\/[^/?#]*@/i.test(u)) return false;
    return !Object.keys(h).some((k) => /authorization|token|cookie|api[-_]?key|password/i.test(k)) && !Object.values(h).some((v) => /token=|mediabrowser/i.test(String(v)));
  },
  broadcastState(reason) {},
  heartbeat() {
    if (!this.code) return;
    const now = Date.now();
    // a member that went quiet (power cut, killed browser, lost network) is dropped, and a lost host hands over
    let lost = false;
    this.peers.forEach((p) => {
      const quiet = now - (p.seen || now), up = p.pc && p.pc.connectionState === 'connected';
      if ((!p.voice && quiet > 20000) || (quiet > 20000 && !up)) { this.dropPeer(p.id); this.sysLine(`${p.name || 'Someone'} left`); lost = true; }
    });
    if (lost) this.electHost();
    // a party whose realtime channel didn't come up, or dropped, keeps trying every 20 s
    if (this.bus && !this.bus.online && this.bus.reconnect && now - (this.retryAt || 0) > 20000) { this.retryAt = now; const b = this.bus; b.reconnect().then((ok) => { if (ok && this.bus === b) b.send({ t: 'hello', name: this.name(), host: this.isHost() }); }).catch(() => {}); }
    if (this.isHost() && this.peers.size && P.ctx && !video.paused) this.broadcastState('beat');
    this.pill();
  },
  mediaChanged() {
    // a new title or episode starts its own dialogue line-up (reference subtitles, map and nudge)
    if (typeof PartyLine !== 'undefined' && P.ctx) { const k = `${P.ctx.meta.id}|${P.ctx.video ? P.ctx.video.id : ''}`; if (k !== PartyLine.vkey) { PartyLine.vkey = k; PartyLine.ref = ''; PartyLine.map = null; PartyLine.mapFor = ''; if (!this.applying) PartyLine.manual = 0; } }
    if (this.code && !this.applying && this.isHost()) setTimeout(() => this.broadcastState('media'), 800);
  },
  local(ev) {
    if (!this.code || this.applying || !P.ctx || Rescue.active && ev === 'seeked') return;
    // only the host leads; a guest's own play, pause and seek stay on their screen
    if (!this.isHost()) { if (this.peers.size && !this.toldGuest) { this.toldGuest = true; toast('Only the host’s play, pause and seek move the whole party', 'info', 3600); } return; }
    // the seek this screen made to follow the room is not news for the room
    if (ev === 'seeked' && this.expect != null && Date.now() - this.expectAt < 10000 && Math.abs(pNow() - this.expect) < 0.6) { this.expect = null; return; }
    this.broadcastState(ev);
  },
  async applyState(st) {},
  async loadMedia(media, at) {
    if (media.local) { toast('The host is playing a file from their own device, so it cannot be shared', 'err'); return; }
    const lk = `${media.metaId}|${media.videoId || ''}`; if (this.loadingKey === lk) return; this.loadingKey = lk;
    this.applying = true;
    try {
      let meta = { id: media.metaId, type: media.type, name: String(media.name || '').slice(0, 200) };
      try { meta = remember({ ...meta, ...((await engine.fetchMeta(media.type, media.metaId)) || {}) }); } catch (e) { /* keep basics */ }
      if (typeof Seats !== 'undefined' && Seats.kids() && !Seats.kidSafe(meta)) { toast('The party is watching something that isn’t on the kids seat', 'err', 5000); return; }
      const vid = media.type === 'series' && meta.videos ? meta.videos.find((v) => videoIdFor(meta, v) === media.videoId) || null : null;
      const { streams } = await engine.fetchStreams(media.type, media.videoId || media.metaId);
      let pick = null;
      if (media.url) {
        pick = streams.find((s) => s.url === media.url) || null;
        // the host's own link plays only after a tap: it can point anywhere and carry request headers
        if (!pick && await this.askLink(media)) { pick = { name: 'Party host', title: 'The host’s source', url: media.url, _addon: 'Watch party', behaviorHints: media.headers ? { proxyHeaders: { request: media.headers } } : {} }; pick._tel = Telemetry.parse(pick); streams.unshift(pick); }
        if (!pick) pick = pickBest(streams);
      } else pick = pickBest(streams);
      if (!pick) { toast('None of your addons has a playable stream for what the party is watching', 'err', 6000); return; }
      toast(`Party: ${media.name}`, 'info');
      await playStream({ meta, video: vid, streams }, pick, { startAt: at });
    } finally { this.loadingKey = ''; setTimeout(() => { this.applying = false; }, 1500); }
  },
  async askLink(media) {
    let host = ''; try { host = new URL(media.url).host; } catch (e) { return false; }
    const k = `${this.code}|${media.url}`; this.linkOk = this.linkOk || new Map();
    if (this.linkOk.has(k)) return this.linkOk.get(k);
    const ok = (await Gate.ask({ icon: 'link', eyebrow: 'Watch party', title: 'Play the host’s link?', yes: 'Play their link', no: 'Use my add-ons',
      html: `The host shares their own source for <b>${esc(media.name || 'this title')}</b>, from <b>${esc(host)}</b>. Play it, or look for it on your own add-ons?` })) === true;
    this.linkOk.set(k, ok); return ok;
  },
  /* ---- Chat and reactions ---- */
  say(text) { text = text.trim(); if (!text || !this.code) return; this.chat.push({ name: this.name(), text, at: Date.now(), me: true }); this.send({ t: 'chat', name: this.name(), text }); this.renderChat(); },
  react(e) { if (!this.code) return; this.send({ t: 'react', e }); this.float(e); },
  float(e) {
    if (!/^[\p{Extended_Pictographic}‍️]{1,8}$/u.test(e)) return;
    const box = $('#player').hidden ? null : $('#reacts'); if (!box) { toast(e, 'info', 1200); return; }
    const s = document.createElement('span'); s.textContent = e; s.style.left = `${8 + Math.random() * 84}%`; s.style.setProperty('--dx', `${(Math.random() * 60 - 30).toFixed(0)}px`);
    box.appendChild(s); setTimeout(() => s.remove(), 2600);
  },
  sysLine(text) { this.chat.push({ sys: true, text, at: Date.now() }); this.renderChat(); this.pill(); },
  /* ---- UI ---- */
  pill() { const on = !!this.code; $('#partyPill').hidden = !on || !$('#player').hidden; if (on) $('#partyPillTxt').textContent = `Party ${this.code} · ${this.peers.size + 1}`; },
  html() {},
  render() {
    [$('#partyDrawerBody'), $('#partyLayerBody')].forEach((root) => {
      if (!root || root.closest('[hidden]') && root.id === 'partyLayerBody' && $('#partyLayer').hidden) return;
      root.innerHTML = this.html(); icons();
      const on = (sel, ev, fn) => { const el = $(sel, root); if (el) el.addEventListener(ev, fn); };
      on('#pyName', 'change', (e) => setCfg('partyName', e.target.value.trim()));
      on('#pyNew', 'click', () => this.create());
      on('#pyJoin', 'click', () => this.join($('#pyCode', root).value));
      on('#pyCode', 'keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.join(e.target.value); });
      on('#pyLink', 'change', (e) => setCfg('partyShareLink', e.target.checked));
      on('#pyCopy', 'click', () => copyText(appLink(`party=${this.code}`) || this.code));
      on('#pyQr', 'click', () => { const b = $('#pyQrBox', root); b.hidden = !b.hidden; });
      on('#pyMic', 'click', () => this.toggleMic());
      on('#pyLeave', 'click', () => this.leave());
      $$('[data-react]', root).forEach((b) => b.addEventListener('click', () => this.react(b.dataset.react)));
      on('#pySay', 'submit', (e) => { e.preventDefault(); const i = $('#pyText', root); this.say(i.value); i.value = ''; });
      on('#pyText', 'keydown', (e) => e.stopPropagation());
    });
    this.renderMembers(); this.renderChat();
  },
  renderMembers() {},
  renderChat() {
    $$('#pyChat').forEach((box) => { box.innerHTML = this.chat.slice(-80).map((c) => (c.sys ? `<p class="py-sys">${esc(c.text)}</p>` : `<p class="${c.me ? 'me' : ''}"><b>${esc(c.name)}</b>${esc(c.text)}</p>`)).join('') || '<p class="py-sys">No messages yet.</p>'; box.scrollTop = box.scrollHeight; });
  },
};
$('#pParty').onclick = () => (Party.code && $('#partyDrawer').classList.contains('open') ? closeDrawers() : Party.openPanel());
$('#partyPillBtn').onclick = () => Party.openPanel();
['play', 'pause', 'seeked'].forEach((ev) => video.addEventListener(ev, () => Party.local(ev)));
addEventListener('beforeunload', () => { Party.leave(true); });
{
  // keep the floating party pill off the player, and back once it closes
  const base = syncLayers; syncLayers = function () { base(); Party.pill(); };
}

/* ---------------- Setup Cloner: your whole setup as a code or a .mkcinema file, restored without a reload ---------------- */
const b64url = { enc: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)) };
async function pipeBytes(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
const Cloner = {
  snapshot({ secrets = false } = {}) {
    const d = { app: 'MKCinema', kind: 'setup', version: 3, at: new Date().toISOString(), cfg: { ...CFG }, addons: Store.get('addons', []), disabled: Store.get('disabled', []), studio: S.studio, watchlist: S.watchlist, progress: S.progress, watched: watchedMap(), taste: Store.get('taste', null), proxy: S.proxy, wall: S.wall, homeLayout: Store.get('homeLayout', null) };
    if (secrets) { d.vault = Store.get('vault', {}); d.keys = Store.get('keys', {}); }
    return d;
  },
  async code(opts) {
    let bytes = new TextEncoder().encode(JSON.stringify(this.snapshot(opts)));
    if (window.CompressionStream) return `mkc://g.${b64url.enc(await pipeBytes(bytes, new CompressionStream('gzip')))}`;
    return `mkc://j.${b64url.enc(bytes)}`;
  },
  async parse(text) {
    text = String(text || '').trim();
    if (text.startsWith('mkc://')) {
      const [kind, body] = [text.slice(6, 7), text.slice(8)];
      let bytes = b64url.dec(body);
      if (kind === 'g') { if (!window.DecompressionStream) throw new Error('This browser cannot unpack setup codes'); bytes = await pipeBytes(bytes, new DecompressionStream('gzip')); }
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    return JSON.parse(text);
  },
  async file(opts) {
    const blob = new Blob([JSON.stringify(this.snapshot(opts), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `MKCinema setup ${new Date().toISOString().slice(0, 10)}.mkcinema`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  },
  /* Apply everything in place: settings, library, addons (installs what is missing, removes what is not in the setup) */
  /* opt: what to take from the code. Settings, library and addons are on unless turned off; the proxy, custom CSS
     and keys are only taken when asked for (a shared code could otherwise route streams or read keys) */
  async restore(d, opt) {
    if (!d || d.app !== 'MKCinema') throw new Error('That is not an MKCinema setup');
    opt = { settings: true, library: true, addons: true, proxy: false, css: false, keys: false, ...(opt || {}) };
    if (!opt.library) d = { ...d, watchlist: null, progress: null, watched: null, taste: null, homeLayout: null, wall: null, studio: null };
    if (d.cfg && !opt.settings) d = { ...d, cfg: opt.css && d.cfg.customCss != null ? { customCss: d.cfg.customCss } : null };
    if (d.cfg) { const keep = { cfgRev: CFG.cfgRev }, inc = { ...d.cfg }; if (!opt.css) delete inc.customCss; if (!opt.keys) Object.keys(inc).forEach((k) => { if (/(Key|Token|Secret|Pass)$/.test(k)) delete inc[k]; }); Object.assign(CFG, inc, keep); if (CFG.quality !== 'custom') CFG.quality = applyPreset(CFG.quality); saveCfg(); applyAll(); }
    if (d.watchlist) { S.watchlist = d.watchlist; Store.set('watchlist', d.watchlist); }
    if (d.progress) { S.progress = d.progress; Store.set('progress', d.progress); }
    if (d.watched) { Store.set('watched', d.watched); WATCHED = null; }
    if (d.taste) Store.set('taste', d.taste);
    if (d.homeLayout) Store.set('homeLayout', d.homeLayout);
    if (d.proxy && opt.proxy) { S.proxy = d.proxy; Store.set('proxy', d.proxy); proxyCheck.t = 0; }
    if (typeof d.wall === 'boolean') setWall(d.wall);
    if (d.vault && opt.keys) Store.set('vault', d.vault);
    if (d.keys && opt.keys) Store.set('keys', d.keys);
    if (d.studio) { S.studio = d.studio; Store.set('studio', d.studio); if (Store.get('studioMounted', false)) mountStudio(true); }
    let added = 0, removed = 0;
    if (Array.isArray(d.addons) && opt.addons) {
      const want = new Set(d.addons.map((u) => StremioEngine.normalize(u)));
      for (const a of engine.addons.slice()) if (!a.builtin && !a.studio && !want.has(a.baseUrl)) { engine.remove(a.baseUrl); removed++; }
      const have = new Set(engine.addons.map((a) => a.baseUrl));
      const results = await Promise.allSettled(d.addons.filter((u) => !have.has(StremioEngine.normalize(u))).map((u) => engine.install(u, { silent: true })));
      added = results.filter((r) => r.status === 'fulfilled').length;
      const off = new Set(d.disabled || []); engine.addons.forEach((a) => { a.enabled = !off.has(a.baseUrl); }); Store.set('disabled', [...off]);
      engine.applyOrder(); engine.clearCache(); engine.emit('addons');
    }
    rerender(); if (S.view === 'home') renderHome(); if (S.view === 'library') renderLibrary();
    if (!$('#settings').hidden) renderSettings();
    return { added, removed };
  },
};
/* ---------------- Sign in a TV from a phone ----------------
   The TV shows a QR code with a room code and a one-time key. The phone signs in a fresh session of its own, encrypts
   the tokens with that key (AES-GCM) and sends them on the room; the TV decrypts them and adopts the session.
   The key is only ever in the QR code, and the phone's own sign-in is left alone. */
const TvLogin = {
  code: '', key: '', bus: null, state: '', t: 0, auto: false,
  isTV: () => document.documentElement.classList.contains('tv') || /MKCinemaTV|Android TV|GoogleTV|AFT[A-Z]|SMART-TV|SmartTV|Web0S|webOS|Tizen|BRAVIA/i.test(navigator.userAgent),
  aes: (key) => crypto.subtle.importKey('raw', b64url.dec(key), 'AES-GCM', false, ['encrypt', 'decrypt']),
  link() { return appLink(`login=${this.code}.${this.key}.2`); },
  html() {
    const st = this.state, head = '<h5><i data-lucide="smartphone"></i>Sign in with your phone</h5>';
    if (!st) return `<div class="tvl" id="tvl">${head}<p>Scan a code with your phone and sign in there. Handy on a TV, where typing is slow.</p><div class="inrow"><button class="btn btn-ghost btn-sm" type="button" id="tvl-go"><i data-lucide="qr-code"></i>Show QR code</button></div></div>`;
    if (st === 'unsupported') return `<div class="tvl" id="tvl">${head}<p>This needs MKCinema opened from its web address, such as app.mkcinema.app.</p></div>`;
    if (st === 'expired' || st === 'offline') return `<div class="tvl" id="tvl">${head}<p>${st === 'expired' ? 'That code expired.' : 'Could not reach the sign-in service. Check the connection and try again.'}</p><div class="inrow"><button class="btn btn-ghost btn-sm" type="button" id="tvl-go"><i data-lucide="refresh-cw"></i>New code</button></div></div>`;
    const line = st === 'connecting' ? 'Getting a code ready…' : st === 'phone' ? 'Phone connected. Finish signing in on your phone.' : 'Scan with your phone camera, then sign in on the phone. The phone asks for the check number below. The code works for 10 minutes.';
    return `<div class="tvl" id="tvl">${head}<div class="qr-wrap sm">${QR.svg(this.link())}</div><p>${line}</p>${this.check ? `<p class="tvl-chk">Check number<b class="mono">${esc(this.check)}</b></p>` : ''}</div>`;
  },
  paint() { const box = $('#tvl'); if (!box) return; box.outerHTML = this.html(); icons(); this.bind(); },
  bind() {
    const go = $('#tvl-go'); if (go) go.onclick = () => this.start();
    // on a TV the code is the whole point, so it shows straight away
    if (!this.state && !this.auto && this.isTV() && $('#tvl')) { this.auto = true; this.start(); }
  },
  async start() {
    this.stop();
    if (!appLink('x') || !(window.crypto && crypto.subtle)) { this.state = 'unsupported'; this.paint(); return; }
    this.code = roomCode(); this.key = b64url.enc(crypto.getRandomValues(new Uint8Array(16)));
    this.check = String(1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000)); // typed on the phone: only shown here, never in the link
    this.state = 'connecting'; this.paint();
    const bus = this.bus = new Bus(`login-${this.code}`, (m) => this.onMsg(m));
    const ok = await bus.connect(); if (this.bus !== bus) return;
    this.state = ok ? 'waiting' : 'offline'; if (!ok) this.stop(true); this.paint();
    this.t = setTimeout(() => { if (this.bus === bus) { this.stop(true); this.state = 'expired'; this.paint(); } }, 10 * 60000);
  },
  stop(keepState) { clearTimeout(this.t); if (this.bus) this.bus.close(); this.bus = null; if (!keepState) { this.code = ''; this.key = ''; this.state = ''; } },
  async onMsg(m) {
    if (m.t === 'hello') { if (this.state === 'waiting') { this.state = 'phone'; this.paint(); } return; }
    if (m.t !== 'session' || !this.key) return;
    const bus = this.bus;
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64url.dec(m.iv) }, await this.aes(this.key), b64url.dec(m.data));
      const tok = JSON.parse(new TextDecoder().decode(plain));
      if (String(tok.c || '') !== this.check) throw new Error('the check number didn’t match. Type the number shown on this TV (update MKCinema on the phone if it never asks)');
      try { await SyncCrypt.fromTv(tok); } catch (e) { /* an older phone sends no key: Settings › Debrid asks for the password */ }
      if (!Account.client && Account.ensure) await Account.ensure();
      if (!Account.client) throw new Error('accounts are not connected on this screen');
      const { error } = await Account.client.auth.setSession({ access_token: tok.a, refresh_token: tok.r }); if (error) throw error;
      bus.send({ t: 'done' });
      setTimeout(() => { this.stop(); Account.render(); }, 1200);
    } catch (e) { bus.send({ t: 'fail', msg: e.message || String(e) }); toast(`Phone sign-in: ${e.message || e}`, 'err', 7000); }
  },

  /* The phone: opened from the QR code */
  /* Step 1 says what this does and, for a TV from 2.37 on, asks for the check number shown on that TV: a link someone
     sent can't quietly get a phone to sign a stranger's TV into its account */
  join(code, key, ver) {
    if (!/^[A-Z0-9]{6}$/.test(code) || !key) { toast('That sign-in code is not complete. Scan it again.', 'err'); return; }
    const body = $('#castBody'); openLayer('castLayer');
    const need = ver === '2';
    body.innerHTML = `<h2>Sign in a TV?</h2><p class="sub">This signs a TV into your MKCinema account: it gets your library, settings and any keys you sync. Only continue if that TV is in front of you right now.</p>
      ${need ? '<label class="fld"><span>Check number shown on the TV</span><input class="inp mono" id="tvl-chk" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="0000"></label>' : ''}
      <p class="tour-note" id="tvl-cmsg" role="status"></p>
      <div class="actions"><button class="btn btn-prime" type="button" id="tvl-yes"><i data-lucide="tv"></i>The TV is here</button><button class="btn btn-ghost" type="button" id="tvl-no">Cancel</button></div>`;
    icons(); setTimeout(() => { const f = $(need ? '#tvl-chk' : '#tvl-yes'); if (f) f.focus(); }, 60);
    $('#tvl-no').onclick = () => closeLayer('castLayer');
    const go = () => {
      const c = need ? String($('#tvl-chk').value || '').replace(/\D/g, '') : '';
      if (need && c.length !== 4) { $('#tvl-cmsg').textContent = 'Type the 4 digits shown under the QR code on your TV.'; return; }
      this.form(code, key, c);
    };
    $('#tvl-yes').onclick = go;
    const ci = $('#tvl-chk'); if (ci) ci.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
  },
  async form(code, key, check) {
    const body = $('#castBody'); openLayer('castLayer');
    const email = (Account.user && Account.user.email) || '';
    body.innerHTML = `<h2>Sign in your TV</h2><p class="sub">Sign in here and your TV signs in to the same account. This phone stays as it is.</p>
      <form id="tvlForm" autocomplete="on"><label class="fld"><span>Email</span><input class="inp" id="tvl-email" type="email" autocomplete="username" required value="${esc(email)}"></label>
      <label class="fld"><span>Password</span><input class="inp" id="tvl-pass" type="password" autocomplete="current-password" required></label>
      <p class="tour-note" id="tvl-msg" role="status">Connecting to your TV…</p>
      <div class="actions"><button class="btn btn-prime" type="submit" id="tvl-send"><i data-lucide="tv"></i>Sign in TV</button></div></form>`;
    icons(); setTimeout(() => { const f = $(email ? '#tvl-pass' : '#tvl-email'); if (f) f.focus(); }, 60);
    const msg = (t) => { const el = $('#tvl-msg'); if (el) el.textContent = t; };
    let answer = null;
    const bus = new Bus(`login-${code}`, (m) => { if (m.t === 'done' || m.t === 'fail') { if (answer) answer(m); } });
    // the form is live straight away; sending waits for the connection
    const ready = bus.connect().then((ok) => { bus.send({ t: 'hello' }); msg(ok ? 'Connected to your TV.' : 'Could not reach your TV. Check this phone’s connection.'); return ok; });
    $('#tvlForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#tvl-send'); btn.disabled = true; msg('Signing in…');
      try {
        await ready;
        const c = Account.config(); if (!c) throw new Error('accounts are not set up');
        await Account.loadLib();
        // a separate, throwaway client: the TV gets its own session instead of sharing this phone's
        const tmp = window.supabase.createClient(c.url.replace(/\/+$/, ''), c.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mkc:tvlogin' } });
        const tvPass = $('#tvl-pass').value; const tvR = await Kdf2.signIn(tmp, $('#tvl-email').value.trim(), tvPass), { data, error } = tvR;
        if (error) throw error;
        $('#tvl-pass').value = '';
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.aes(key), new TextEncoder().encode(JSON.stringify({ a: data.session.access_token, r: data.session.refresh_token, c: check || '', ...(await SyncCrypt.forTv(tmp, data, tvPass, tvR.d)) })));
        const reply = new Promise((res) => { answer = res; setTimeout(() => res(null), 15000); });
        bus.send({ t: 'session', iv: b64url.enc(iv), data: b64url.enc(new Uint8Array(sealed)) });
        msg('Sending to your TV…');
        const r = await reply;
        if (!r) throw new Error('your TV did not answer. Make sure the code is still on its screen');
        if (r.t === 'fail') throw new Error(r.msg || 'your TV could not sign in');
        body.innerHTML = '<h2>Your TV is signed in</h2><p class="sub">You can put your phone down. Your library, progress and addons load on the TV now.</p>';
        bus.close();
      } catch (err) { msg(`Could not sign in: ${err.message || err}`); btn.disabled = false; }
    });
    setTimeout(() => bus.close(), 10 * 60000);
  },
};
/* ---------------- Deep links: QR handoff, remote and party invites ---------------- */
const Deep = {
  async handle() {
    const h = location.hash.replace(/^#/, '');
    // a link can come from anyone: each one says what it will do and waits for a tap
    if (h.startsWith('play?')) { history.replaceState(null, '', location.pathname); const q = new URLSearchParams(h.slice(5)); if (await this.askPlay(q)) await this.play(q); }
    else if (h.startsWith('remote=')) { const c = h.slice(7).toUpperCase(); if (RM_CODE.test(c)) { location.replace(Remote.link(c)); return; } history.replaceState(null, '', location.pathname); }
    else if (h.startsWith('login=')) { history.replaceState(null, '', location.pathname); const [code, key, ver] = h.slice(6).split('.'); TvLogin.join((code || '').toUpperCase(), key, ver); }
    else if (h.startsWith('party=')) {
      history.replaceState(null, '', location.pathname);
      const c = h.slice(6).trim().toUpperCase(); if (!/^[A-Z0-9]{6}$/.test(c)) { toast('That party link isn’t complete', 'err'); return; }
      if (Party.code === c) { Party.openPanel(); return; }
      if ((await Gate.ask({ icon: 'users', eyebrow: 'Watch party', title: `Join watch party ${c}?`, yes: 'Join', no: 'Not now', html: 'A link invites you to a watch party. The others see your name and chat, and the host picks what plays. You can leave at any time.' })) !== true) return;
      openLayer('partyLayer'); Party.render(); await Party.join(c);
    }
  },
  async askPlay(q) {
    const type = q.get('type'), id = q.get('id'), url = q.get('stream') || '', t = Number(q.get('t')) || 0;
    if (!type || !id) return false;
    let host = ''; if (url) { try { host = new URL(url).host; } catch (e) { toast('That link isn’t complete', 'err'); return false; } }
    let meta = null; try { meta = await Promise.race([engine.fetchMeta(type, id), new Promise((r) => setTimeout(() => r(null), 4000))]); } catch (e) { meta = null; }
    if (typeof Seats !== 'undefined' && Seats.kids() && !Seats.kidSafe(meta || { id, type })) { toast('Not on the kids seat', 'err', 2600, 'kids'); return false; }
    const name = esc((meta && meta.name) || 'this title'), at = t ? ` at ${fmtTime(t)}` : '';
    return (await Gate.ask({ icon: 'play', eyebrow: 'Opened from a link', title: `Play ${(meta && meta.name) || 'this'}?`, yes: 'Play', no: 'Cancel',
      html: url ? `A link wants to play <b>${name}</b>${at} from <b>${esc(host)}</b>. Play it only if you trust whoever sent the link.` : `A link opens <b>${name}</b>${at} on your own add-ons.` })) === true;
  },
  async play(q) {},
};
addEventListener('hashchange', () => { if (/^#(play\?|remote=|party=|login=)/.test(location.hash)) Deep.handle(); });

COMMANDS.push(
  { label: 'Start or join a watch party', icon: 'users', run: () => Party.openPanel() },
  { label: 'Use this phone as a remote', icon: 'smartphone', run: () => Remote.join('') },
  { label: 'Control this screen from my phone', icon: 'qr-code', run: () => Cast.open('remote') },
);
