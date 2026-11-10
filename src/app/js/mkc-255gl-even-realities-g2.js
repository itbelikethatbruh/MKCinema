
/* ---------- 2.55 Even Realities G2 link ----------
   The G2 speaks a different protocol from the G1: protobuf messages in "aa 21" frames with a CRC, a start-up handshake,
   an app-launch prelude, a page with a text box, and a heartbeat every 5 s. This is a trimmed port of the protocol layer
   of even-g2-js (https://github.com/mrahtz/even-g2-js, commit 1c5fa60), which is community reverse-engineered and not
   affiliated with Even Realities. Only what subtitles need is kept: connect, text, clear, disconnect.

   even-g2-js: MIT License, Copyright (c) 2026 Matthew Rahtz.
   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
   documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
   persons to whom the Software is furnished to do so, subject to the following conditions:
   The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
   Software.
   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
   COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. */
const G2Link = (() => {
  const uuid = (sfx) => `00002760-08c2-11e1-9073-0e8ac72e${sfx}`;
  const U = { write: uuid('5401'), notify: uuid('5402'), services: ['0000', '5450', '6450', '7450'].map(uuid) };
  const SID = { app: 0x01, settings: 0x09, handshake: 0x80, hub: 0xe0 };
  const REQ = 0x20, NOTIFY = 0x01, W = 576, H = 288;
  const Cmd = { create: 0, textUpgrade: 5, rebuild: 7, heartbeat: 12 };
  function crc16(bytes) {
    let c = 0xffff;
    for (const b of bytes) { c ^= b << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; }
    return c;
  }
  function frames(payload, seq, sid, flag = REQ, chunk = 200) {
    const crc = crc16(payload), body = new Uint8Array(payload.length + 2);
    body.set(payload); body[payload.length] = crc & 0xff; body[payload.length + 1] = crc >> 8;
    const total = Math.max(1, Math.ceil(body.length / chunk)), out = [];
    for (let i = 0; i < total; i++) {
      const piece = body.subarray(i * chunk, Math.min(body.length, (i + 1) * chunk)), f = new Uint8Array(8 + piece.length);
      f.set([0xaa, 0x21, seq & 0xff, piece.length, total, i + 1, sid, flag]); f.set(piece, 8); out.push(f);
    }
    return out;
  }
  /* minimal protobuf writer: zero and empty scalars are left out, sub-messages always written */
  class PB {
    constructor() { this.b = []; }
    static build(fn) { const w = new PB(); fn(w); return new Uint8Array(w.b); }
    varint(v) { let n = BigInt(v); while (n >= 0x80n) { this.b.push(Number(n & 0x7fn) | 0x80); n >>= 7n; } this.b.push(Number(n)); }
    key(f, wire) { this.varint((f << 3) | wire); }
    uint(f, v) { if (v) { this.key(f, 0); this.varint(v); } return this; }
    bool(f, v) { return this.uint(f, v ? 1 : 0); }
    raw(f, d) { this.key(f, 2); this.varint(d.length); for (const x of d) this.b.push(x); return this; }
    string(f, s) { if (s) this.raw(f, new TextEncoder().encode(s)); return this; }
    message(f, fn) { return this.raw(f, PB.build(fn)); }
  }
  function decode(buf) {
    const fields = new Map(); let i = 0;
    const varint = () => { let v = 0n, s = 0n; while (i < buf.length) { const c = buf[i++]; v |= BigInt(c & 0x7f) << s; if (!(c & 0x80)) return v; s += 7n; } throw new Error('truncated'); };
    const add = (f, v) => { if (!fields.has(f)) fields.set(f, []); fields.get(f).push(v); };
    try {
      while (i < buf.length) {
        const k = Number(varint()), f = k >> 3, wire = k & 7;
        if (wire === 0) add(f, Number(varint()));
        else if (wire === 2) { const n = Number(varint()); add(f, buf.subarray(i, i + n)); i += n; }
        else if (wire === 5) { i += 4; } else if (wire === 1) { i += 8; } else return null;
      }
    } catch (e) { return null; }
    const last = (f) => { const a = fields.get(f); return a ? a[a.length - 1] : undefined; };
    return { has: (f) => fields.has(f), uint: (f) => (typeof last(f) === 'number' ? last(f) : 0), message: (f) => (last(f) instanceof Uint8Array ? decode(last(f)) : null) };
  }
  const hub = (cmd, magic, fn = () => {}) => PB.build((w) => { w.uint(1, cmd).uint(2, magic); fn(w); });
  const msg = {
    create: (magic) => hub(Cmd.create, magic, (w) => w.message(3, (m) => {
      m.uint(1, 1).message(2, (o) => {
        o.uint(3, W).uint(4, H).uint(9, 1).string(10, 'mkc');
        o.message(11, (it) => { it.uint(1, 1).bool(3, true).string(4, 'MKCinema'); });
        o.bool(12, true);
      }).uint(5, 10000);
    })),
    rebuildText: (magic, name, content) => hub(Cmd.rebuild, magic, (w) => w.message(7, (m) => {
      m.uint(1, 1).message(3, (o) => { o.uint(3, W).uint(4, H).uint(9, 1).string(10, name).bool(11, true).string(12, content); });
    })),
    textUpgrade: (magic, name, content) => hub(Cmd.textUpgrade, magic, (w) => w.message(9, (m) => {
      m.uint(1, 1).string(2, name).uint(4, new TextEncoder().encode(content).length).string(5, content);
    })),
    heartbeat: (magic) => hub(Cmd.heartbeat, magic, (w) => w.message(14, () => {})),
  };
  /* the Even app's start-up exchange: without it the glasses drop the link after about 27 s */
  function handshake(now = Date.now()) {
    const clock = (magic) => PB.build((w) => w.uint(1, 128).uint(2, magic).message(128, (m) => { m.uint(1, Math.floor(now / 1000)).uint(2, 0xffffffffffffffe8n); }));
    return [
      [0x00, new Uint8Array([0x08, 0x04, 0x10, 0x0c, 0x1a, 0x04, 0x08, 0x01, 0x10, 0x04])],
      [0x20, new Uint8Array([0x08, 0x05, 0x10, 0x0e, 0x22, 0x02, 0x08, 0x02])],
      [0x20, clock(0x0f)],
      [0x00, new Uint8Array([0x08, 0x04, 0x10, 0x10, 0x1a, 0x04, 0x08, 0x01, 0x10, 0x04])],
      [0x00, new Uint8Array([0x08, 0x04, 0x10, 0x11, 0x1a, 0x04, 0x08, 0x01, 0x10, 0x04])],
      [0x20, new Uint8Array([0x08, 0x05, 0x10, 0x12, 0x22, 0x02, 0x08, 0x01])],
      [0x20, clock(0x13)],
    ];
  }
  /* the app-launch frame, as the Even app sends it; its reply echoes 156 */
  const PRELUDE = new Uint8Array([0xaa, 0x21, 0x92, 0x13, 0x01, 0x01, 0x01, 0x20, 0x08, 0x02, 0x10, 0x9c, 0x01, 0x22, 0x0a, 0x1a,
    0x08, 0x12, 0x06, 0x12, 0x04, 0x08, 0x00, 0x10, 0x00, 0xa1, 0x42]);
  class Link {
    constructor(dev) { this.dev = dev; this.seq = 0x40; this.magic = 100; this.wait = new Map(); this.q = Promise.resolve(); this.parts = new Map(); this.name = ''; this.flip = false; this.live = false; this.hb = 0; }
    next() { this.magic = this.magic >= 255 ? 100 : this.magic + 1; return this.magic; }
    async open() {
      const server = await this.dev.gatt.connect();
      for (const s of await server.getPrimaryServices()) {
        for (const c of await s.getCharacteristics().catch(() => [])) { if (c.uuid === U.write) this.w = c; if (c.uuid === U.notify) this.n = c; }
      }
      if (!this.w || !this.n) throw Object.assign(new Error('these don’t look like G2 glasses'), { name: 'WrongArm' });
      this.n.addEventListener('characteristicvaluechanged', (e) => { const v = e.target.value; this.got(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); });
      await this.n.startNotifications();
      await this.session();
      this.hb = setInterval(() => { const m = this.next(); this.send(SID.hub, msg.heartbeat(m), m, REQ, 2000).catch(() => {}); }, 5000);
    }
    async session() {
      for (const [flag, p] of handshake()) await this.send(SID.handshake, p, decode(p).uint(2), flag, 1000);
      const launch = this.waitFor(SID.app, 156, 4000);
      await this.writeAll([PRELUDE]);
      if (!(await launch)) throw Object.assign(new Error('the glasses didn’t accept the session. Close the Even app on your phone (or turn its Bluetooth off) and try again'), { name: 'WrongArm' });
      const m = this.next();
      await this.send(SID.hub, msg.create(m), m, REQ, 4000);
      this.live = true; this.name = '';
    }
    close() { clearInterval(this.hb); this.hb = 0; this.wait.forEach((r) => r(null)); this.wait.clear(); }
    writeAll(list) {
      const run = this.q.then(async () => { for (const f of list) await (this.w.writeValueWithoutResponse ? this.w.writeValueWithoutResponse(f) : this.w.writeValue(f)); });
      this.q = run.catch(() => {}); return run;
    }
    waitFor(sid, magic, ms) {
      const key = `${sid}:${magic}`, old = this.wait.get(key); if (old) old(null);
      return new Promise((res) => {
        const done = (r) => { clearTimeout(t); res(r); };
        const t = setTimeout(() => { if (this.wait.get(key) === done) { this.wait.delete(key); res(null); } }, ms);
        this.wait.set(key, done);
      });
    }
    async send(sid, payload, magic, flag = REQ, ms = 3000) {
      if (!this.dev.gatt.connected) throw new Error('not connected');
      const r = this.waitFor(sid, magic, ms), seq = this.seq; this.seq = (this.seq + 1) & 0xff;
      await this.writeAll(frames(payload, seq, sid, flag));
      return r;
    }
    got(raw) {
      if (raw.length < 8 || raw[0] !== 0xaa || (raw[1] !== 0x12 && raw[1] !== 0x21)) return;
      const seq = raw[2], len = raw[3], total = raw[4], idx = raw[5], sid = raw[6], flag = raw[7], chunk = raw.subarray(8, 8 + len);
      let body = chunk;
      if (total > 1) {
        if (idx === 1 || !this.parts.has(seq)) this.parts.set(seq, new Map());
        const p = this.parts.get(seq); p.set(idx, chunk); if (p.size < total) return;
        this.parts.delete(seq);
        const all = [...Array(total).keys()].map((i) => p.get(i + 1) || new Uint8Array());
        body = new Uint8Array(all.reduce((n, x) => n + x.length, 0)); let o = 0; all.forEach((x) => { body.set(x, o); o += x.length; });
      }
      const pb = decode(body.subarray(0, Math.max(0, body.length - 2)));
      if (flag !== NOTIFY && pb && pb.has(2)) { const key = `${sid}:${pb.uint(2)}`, w = this.wait.get(key); if (w) { this.wait.delete(key); w(pb); return; } }
      // the wearer left our page from the glasses' own menu: build it again on the next line
      if (sid === SID.hub && (flag === NOTIFY || flag === 0x06) && pb && pb.uint(1) === 2) { const d = pb.message(13), s = d && d.message(3); if (s && [6, 7].includes(s.uint(1))) this.live = false; }
    }
    async text(raw) {
      let content = raw || ' ';
      while (new TextEncoder().encode(content).length > 990) content = content.slice(0, -1);
      if (!this.live) await this.session();
      if (this.name) {
        const m = this.next(), ack = await this.send(SID.hub, msg.textUpgrade(m, this.name, content), m);
        if (ack) { const r = ack.message(10); if (!r || r.uint(1) !== 9) return; } // 9: the box is gone, so build it again
      }
      this.flip = !this.flip;
      const name = `mkc-${this.flip ? 'a' : 'b'}`, m = this.next();
      await this.send(SID.hub, msg.rebuildText(m, name, content), m);
      this.name = name;
    }
  }
  return { U, Link, crc16, frames, PRELUDE };
})();
/* ---------- 2.55 Subtitles on smart glasses ----------
   Sends the subtitle line that is showing to smart glasses over Bluetooth, straight from this browser (Chrome or Edge on
   Android, Windows, Mac, Linux and ChromeOS). Nothing goes through a server.
   Brilliant Labs Frame: Lua over its own Bluetooth service (frame.display.text + show).
   Even Realities G1: the 0x4E text command from Even Realities' own demo app, left arm first, then right.
   Even Realities G2: a different protocol (see G2Link), spoken to the right temple only.
   Glasses that work as a plain screen over USB-C need none of this: they just mirror the phone. */
const Glasses = {
  kind: '', dev: [], tx: [], rx: [], g2: null, busy: false, want: null, shown: null, seq: 0, max: 100, onchange: null, acks: [],
  FRAME: { svc: '7a230001-5475-a6a4-654c-8431f6ad49c4', tx: '7a230002-5475-a6a4-654c-8431f6ad49c4', rx: '7a230003-5475-a6a4-654c-8431f6ad49c4' },
  NUS: { svc: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', tx: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', rx: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' },
  NAMES: { frame: 'Brilliant Labs Frame', g1: 'Even Realities G1', g2: 'Even Realities G2' },
  can() {
    try { return !!(window.isSecureContext && navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function' && !window.MKDesktop); } catch (e) { return false; }
  },
  on() { return !!this.kind && this.dev.length > 0 && this.dev.every((d) => d.gatt && d.gatt.connected); },
  label() { return this.on() ? this.NAMES[this.kind] : ''; },
  why(e) {
    const n = e && e.name, m = String((e && e.message) || e || '');
    if (n === 'NotFoundError' && /cancel/i.test(m)) return '';
    if (n === 'WrongArm') return `Almost: ${m}.`;
    if (n === 'NotFoundError') return 'No glasses picked. Turn them on, keep them close and try again.';
    if (n === 'SecurityError' || n === 'NotAllowedError') return 'Bluetooth is blocked for this page. Allow it in the browser’s site settings.';
    if (n === 'NotSupportedError') return 'This browser can’t use Bluetooth. Use Chrome or Edge.';
    return `The glasses didn’t answer (${m || 'Bluetooth error'}). Turn them off and on, then try again.`;
  },
  changed() { try { this.onchange && this.onchange(this.on()); } catch (e) { /* ui gone */ } },
  async connect(kind) {
    if (!this.can()) throw Object.assign(new Error('no bluetooth'), { name: 'NotSupportedError' });
    await this.disconnect(true);
    const bt = navigator.bluetooth;
    if (kind === 'frame') {
      const d = await bt.requestDevice({ filters: [{ services: [this.FRAME.svc] }, { namePrefix: 'Frame' }], optionalServices: [this.FRAME.svc] });
      const { tx, rx } = await this.open(d, this.FRAME);
      this.kind = 'frame'; this.dev = [d]; this.tx = [tx]; this.rx = [rx];
      // stop whatever app the glasses are running, so they listen to us, then ask how long one message may be
      await this.raw(tx, new Uint8Array([3])).catch(() => {});
      this.max = 100;
      const got = new Promise((res) => { this.frameReply = res; setTimeout(() => res(''), 1500); });
      await this.lua('print(frame.bluetooth.max_length())').catch(() => {});
      const n = parseInt(await got, 10); if (n >= 20 && n <= 512) this.max = n;
      this.frameReply = null;
    } else if (kind === 'g2') {
      // each temple shows up on its own; the right one carries the display
      const d = await bt.requestDevice({ filters: [{ namePrefix: 'Even G2' }, { namePrefix: 'G2_' }], optionalServices: G2Link.U.services });
      if (/_L_/i.test(d.name || '')) throw Object.assign(new Error('pick the right temple (its name has _R_)'), { name: 'WrongArm' });
      const link = new G2Link.Link(d);
      try { await link.open(); } catch (e) { link.close(); try { d.gatt.disconnect(); } catch (x) { /* gone */ } throw e; }
      this.kind = 'g2'; this.dev = [d]; this.g2 = link;
    } else {
      // two arms, two connections: the browser asks for each one
      const pick = (side) => bt.requestDevice({ filters: [{ namePrefix: 'Even G1' }, { namePrefix: 'G1' }], optionalServices: [this.NUS.svc] })
        .then((d) => { if (!new RegExp(`_${side}_`, 'i').test(d.name || '') && /_[LR]_/i.test(d.name || '')) throw Object.assign(new Error(`pick the ${side === 'L' ? 'left' : 'right'} arm (its name has _${side}_)`), { name: 'WrongArm' }); return d; });
      const L = await pick('L'); const l = await this.open(L, this.NUS);
      let R, r;
      try { R = await pick('R'); r = await this.open(R, this.NUS); } catch (e) { try { L.gatt.disconnect(); } catch (x) { /* gone */ } throw e; }
      this.kind = 'g1'; this.dev = [L, R]; this.tx = [l.tx, r.tx]; this.rx = [l.rx, r.rx];
    }
    this.dev.forEach((d) => d.addEventListener('gattserverdisconnected', () => { if (this.dev.includes(d)) { this.forget(); this.changed(); } }));
    this.shown = null; this.changed();
    this.show(['MKCinema', 'Subtitles will show here']);
    return this.label();
  },
  async open(d, S) {
    const g = await d.gatt.connect(), s = await g.getPrimaryService(S.svc);
    const tx = await s.getCharacteristic(S.tx), rx = await s.getCharacteristic(S.rx);
    try { await rx.startNotifications(); rx.addEventListener('characteristicvaluechanged', (e) => this.heard(e.target.value)); } catch (e) { /* replies are optional */ }
    return { tx, rx };
  },
  heard(v) {
    const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    if (this.kind === 'g1' || (!this.kind && b[0] === 0x4e)) { const a = this.acks.shift(); if (a) a(b); return; }
    if (this.frameReply) { try { this.frameReply(new TextDecoder().decode(b).trim()); } catch (e) { /* not text */ } }
  },
  forget() { if (this.g2) this.g2.close(); this.g2 = null; this.kind = ''; this.dev = []; this.tx = []; this.rx = []; this.busy = false; this.want = null; this.shown = null; this.acks = []; },
  async disconnect(quiet) {
    const ds = this.dev.slice();
    if (ds.length) { try { await this.send([]); } catch (e) { /* gone */ } }
    this.forget();
    ds.forEach((d) => { try { d.gatt.disconnect(); } catch (e) { /* gone */ } });
    if (!quiet) this.changed();
  },
  raw(c, bytes) { return (c.writeValueWithResponse ? c.writeValueWithResponse(bytes) : c.writeValue(bytes)); },
  lua(code) { return this.raw(this.tx[0], new TextEncoder().encode(code)); },
  /* lines of text in, wrapped to what the glasses can show */
  wrap(lines, width, rows) {
    const out = [];
    lines.forEach((l) => {
      let cur = '';
      String(l).replace(/\s+/g, ' ').trim().split(' ').forEach((w) => {
        while (w.length > width) { if (cur) { out.push(cur); cur = ''; } out.push(w.slice(0, width)); w = w.slice(width); }
        if (!w) return;
        if (!cur) cur = w; else if (cur.length + 1 + w.length <= width) cur += ` ${w}`; else { out.push(cur); cur = w; }
      });
      if (cur) out.push(cur);
    });
    if (out.length > rows) { out.length = rows; out[rows - 1] = `${out[rows - 1].slice(0, width - 1)}…`; }
    return out;
  },
  /* Lua string literal: printable ASCII as is, everything else as \ddd bytes */
  luaStr(s) {
    let o = '';
    new TextEncoder().encode(s).forEach((c) => { o += c === 34 || c === 92 ? `\\${String.fromCharCode(c)}` : c >= 32 && c < 127 ? String.fromCharCode(c) : `\\${c}`; });
    return `"${o}"`;
  },
  /* the latest wanted text always wins: lines that came and went while the glasses were busy are skipped */
  show(lines) {
    if (!this.on()) return;
    const clean = (Array.isArray(lines) ? lines : [lines]).map((l) => String(l || '').trim()).filter(Boolean);
    const key = clean.join('\n'); if (key === this.shown && !this.busy) return;
    this.want = clean; if (!this.busy) this.pump();
  },
  clear() { this.show([]); },
  async pump() {
    this.busy = true;
    try {
      while (this.want && this.on()) {
        const l = this.want; this.want = null; const key = l.join('\n');
        if (key === this.shown) continue;
        await this.send(l); this.shown = key;
      }
    } catch (e) { this.shown = null; } finally { this.busy = false; }
  },
  async send(lines) {
    if (this.kind === 'frame') {
      const rows = this.wrap(lines, 24, 5), top = Math.max(40, 200 - rows.length * 30);
      for (let i = 0; i < rows.length; i++) {
        let s = rows[i], cmd;
        // keep each message inside one Bluetooth packet
        while ((cmd = `frame.display.text(${this.luaStr(s)},40,${top + i * 60})`).length > this.max - 4 && s.length > 1) s = s.slice(0, -1);
        await this.lua(cmd);
      }
      await this.lua('frame.display.show()');
      return;
    }
    if (this.kind === 'g2') {
      // about 10 rows of 44 on the lens: subtitles sit low and centred, like on a screen
      const rows = this.wrap(lines, 44, 4), top = Math.max(0, 9 - rows.length);
      await this.g2.text(rows.length ? '\n'.repeat(top) + rows.map((l) => ' '.repeat(Math.max(0, Math.floor((44 - [...l].length) / 2))) + l).join('\n') : ' ');
      return;
    }
    if (this.kind === 'g1') {
      const rows = this.wrap(lines, 26, 5), body = new TextEncoder().encode(rows.join('\n') || ' ');
      const per = 180, total = Math.max(1, Math.ceil(body.length / per)), seq = this.seq = (this.seq + 1) & 255;
      for (let p = 0; p < total; p++) {
        const part = body.slice(p * per, (p + 1) * per), pkt = new Uint8Array(9 + part.length);
        pkt.set([0x4e, seq, total, p, 0x71, 0, 0, 1, 1]); pkt.set(part, 9);
        for (let side = 0; side < 2; side++) {
          const ack = new Promise((res) => {
            const f = (b) => { clearTimeout(t); res(b); };
            const t = setTimeout(() => { const i = this.acks.indexOf(f); if (i >= 0) this.acks.splice(i, 1); res(null); }, 400);
            this.acks.push(f);
          });
          await this.raw(this.tx[side], pkt);
          await ack; // the left arm must take it before the right one gets it
        }
      }
    }
  },
};
/* ---------- 2.55 Subtitles on glasses (this device's player) ----------
   On a computer or phone browser with Bluetooth (Chrome, Edge), the subtitle line showing in the player also goes to
   smart glasses. Styled anime subtitles are drawn by their own renderer, so for those the glasses read the same file
   as plain text. Not on TVs, the native players or the desktop apps (their web views have no Bluetooth). */
const GlPlayer = {
  t: 0, plain: null, plainKey: '',
  can() { return !PX_TV && !IS_TV && Glasses.can(); },
  native() { return typeof TvPlayer !== 'undefined' && !!TvPlayer.cur; },
  track() { return Array.from(video.textTracks).find((t) => t.mode === 'showing') || Array.from(video.textTracks).find((t) => t.mode === 'hidden' && t._learn) || null; },
  async plainCues() {
    const s = P.subs && P.subs[P.curSub]; if (!s) return null;
    const key = `${P.curSub}|${s.url || s.fileName || ''}`;
    if (key === this.plainKey) return this.plain;
    this.plainKey = key; this.plain = null;
    try { const l = await ScriptClock.text(s); if (this.plainKey === key) this.plain = Array.isArray(l) ? l : null; } catch (e) { this.plain = null; }
    return this.plain;
  },
  lines() {
    if ($('#player').hidden || P.curSub < 0) return [];
    const tr = this.track();
    if (tr && tr.activeCues && tr.activeCues.length) {
      return Array.from(tr.activeCues).map((c) => String(c.text || '').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '')).join('\n').split('\n');
    }
    if (document.body.classList.contains('ass-on')) {
      if (!this.plain) { this.plainCues(); return []; }
      const at = (typeof pNow === 'function' ? pNow() : video.currentTime) - (P.subDelay || 0), c = this.plain.find((x) => x.s <= at && x.e >= at);
      return c ? [c.t] : [];
    }
    return [];
  },
  tick() { if (!Glasses.on()) { this.stop(); return; } Glasses.show(this.lines()); },
  start() { if (this.t || !Glasses.on()) return; this.t = setInterval(() => this.tick(), 120); this.tick(); },
  stop() { clearInterval(this.t); this.t = 0; },
  async pick(kind) {
    if (kind === 'g1') toast('Pick the left arm first, then the right arm', 'info', 3600, 'gl');
    if (kind === 'g2') toast('Close the Even app on your phone first, then pick the one with _R_ in its name', 'info', 4200, 'gl');
    try { const n = await Glasses.connect(kind); toast(`${n} connected: subtitles show there now`, 'ok', 3000, 'gl'); this.start(); }
    catch (e) { const w = Glasses.why(e); if (w) toast(w, 'err', 6000, 'gl'); }
    this.redraw();
  },
  redraw() { const m = $('#optMenu'); if (m && !m.hidden) renderOptMenu(); },
  html() {
    if (!this.can() || !P.stream || this.native()) return '';
    if (Glasses.on()) {
      return `<h5>Glasses</h5><button type="button" data-glx="off"><i data-lucide="glasses"></i>${esc(Glasses.label())} · connected. Disconnect</button>
        ${P.curSub < 0 ? '<p class="gl-note">Turn on subtitles to see them on your glasses.</p>' : ''}`;
    }
    return `<h5>Glasses</h5><button type="button" data-glx="frame"><i data-lucide="glasses"></i>Subtitles on Brilliant Labs Frame</button>
      <button type="button" data-glx="g1"><i data-lucide="glasses"></i>Subtitles on Even Realities G1</button>
      <button type="button" data-glx="g2"><i data-lucide="glasses"></i>Subtitles on Even Realities G2</button>
      <p class="gl-note">The line on screen shows in your glasses. Turn them on and keep them close.</p>`;
  },
  bind(m) {
    $$('[data-glx]', m).forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); const k = b.dataset.glx;
      if (k === 'off') { this.stop(); Glasses.disconnect(); toast('Glasses disconnected', 'info', 1600, 'gl'); this.redraw(); return; }
      this.pick(k);
    }));
  },
  init() {
    if (!this.can()) return;
    Glasses.onchange = (on) => { if (!on) { this.stop(); toast('Glasses disconnected', 'info', 2200, 'gl'); } this.redraw(); };
    const mh = PxMore.html.bind(PxMore), mb = PxMore.bind.bind(PxMore);
    PxMore.html = function () { return GlPlayer.html() + mh(); };
    PxMore.bind = function (m) { mb(m); GlPlayer.bind(m); };
    video.addEventListener('playing', () => this.start());
    video.addEventListener('emptied', () => { this.plainKey = ''; this.plain = null; if (Glasses.on()) Glasses.clear(); });
    COMMANDS.push({ label: 'Subtitles on smart glasses', icon: 'glasses', run: () => { if (!$('#player').hidden) PxMenu.open('more'); else toast('Start a film, then open the player’s More tab', 'info', 3200, 'gl'); } });
  },
};
GlPlayer.init();
