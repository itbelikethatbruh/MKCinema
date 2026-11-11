
'use strict';
/* =====================================================================
   MKCinema · accounts (Supabase Auth, email + password only) and cloud sync
   SUPABASE_PROJECT is built in so every user just signs in, with no setup. A server .env
   (SUPABASE_URL / SUPABASE_ANON_KEY) or Settings › Account can point a copy at another project.
   The anon / publishable key (sb_publishable_…) is meant to be public; Row Level Security
   protects the data. Never put the service_role or sb_secret_ key here.
   ===================================================================== */
const SUPABASE_PROJECT = { url: 'https://wogffhgdixgrayowewnf.supabase.co', anonKey: 'sb_publishable_ZpiFwB_oM579GwCunYpHWg_jelRazT-' };
const SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js';
const SUPABASE_SRI = 'sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R'; // change together with SUPABASE_LIB
const SYNC_TABLE = 'mkcinema_profiles';

const isSecretKey = (k) => {
  if (/^sb_secret_/.test(k)) return true;
  try { return /service_role/.test(atob((k.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return false; }
};
/* ---- Cloud sync helpers ----
   The row keeps the top-level keys older apps read. `_sync` adds the format version, a timestamp per section and per
   setting, and tombstones for removed watchlist, progress and watched entries, so devices merge instead of overwriting.
   `secrets` is sealed with AES-GCM under a key derived from the account password (PBKDF2-SHA256, per-user salt kept in
   the sealed box). The key never leaves the device except inside the already sealed "Sign in with your phone" hand-off. */
const SYNC_V = 4, SYNC_V_OLD = 3, SYNC_AV_MAX = 40000;
const SYNC_SECTIONS = ['cfg', 'watchlist', 'progress', 'watched', 'addons', 'disabled', 'studio', 'taste', 'homeLayout', 'homeArrange', 'avatar', 'lists', 'channels', 'seats', 'secrets'];
const SYNC_ITEMS = ['watchlist', 'progress', 'watched'];
const SYNC_NEWER = 'A newer MKCinema saved your account. Reload to update, then sync again.';
const syncSection = (lk) => {
  if (/^seat:[a-z0-9]{4,16}:(watchlist|progress|watched|taste|homeArrange)$/.test(lk) || /^(seats|ownerSeatName|ownerPin|ownerAv)$/.test(lk)) return 'seats';
  if (lk === 'vault' || lk === 'keys') return 'secrets';
  return lk !== 'cfg' && SYNC_SECTIONS.includes(lk) ? lk : '';
};
/* addon links that carry a key or an account config in their path (Torrentio-style option=…|realdebrid=KEY, base64 configs) */
const keyedAddon = (u) => { try { const p = new URL(String(u)).pathname.split('/').filter(Boolean); if (/manifest\.json$/i.test(p[p.length - 1] || '')) p.pop(); return p.some((x) => x.length >= 24 || /[=|%]/.test(x)); } catch (e) { return false; } };
/* big pictures (old avatars) are shrunk before they go into the account row */
async function shrinkDataUrl(src, max) {
  const img = new Image(); img.src = src; await img.decode();
  const w0 = img.naturalWidth || 256, h0 = img.naturalHeight || 256; let side = 256, q = 0.82, out = src;
  for (let i = 0; i < 8 && out.length > max; i++) {
    const r = Math.min(1, side / Math.max(w0, h0)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * r)); c.height = Math.max(1, Math.round(h0 * r));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); out = c.toDataURL('image/jpeg', q);
    side = Math.round(side * 0.8); q = Math.max(0.5, q - 0.06);
  }
  return out.length <= max ? out : null;
}
/* the account's clock: the database stamps every row write, so each device learns how far its own clock is off and
   stamps its changes with the corrected time. Ignored below 2 s (network jitter). */
const SyncClock = {
  off: (() => { try { return +localStorage.getItem('mkc:clockOff') || 0; } catch (e) { return 0; } })(),
  now() { return Date.now() + this.off; },
  learn(iso) {
    const t = Date.parse(iso || ''); if (!t) return;
    const off = t - Date.now(); if (Math.abs(off) < 2000 && Math.abs(this.off) < 2000) return;
    this.off = Math.abs(off) < 2000 ? 0 : Math.round(off);
    try { localStorage.setItem('mkc:clockOff', String(this.off)); } catch (e) { /* this session only */ }
  },
};
const SyncCrypt = {
  ITER: 310000, mem: null,
  enc: (b) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec: (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0)),
  newSalt() { return this.enc(crypto.getRandomValues(new Uint8Array(16))); },
  isBox: (x) => !!(x && typeof x === 'object' && x.enc === 1 && typeof x.ct === 'string' && typeof x.iv === 'string' && typeof x.salt === 'string'),
  idb(mode, fn) {
    return new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('no IndexedDB')); return; }
      const o = indexedDB.open('mkc-sync', 1);
      o.onupgradeneeded = () => o.result.createObjectStore('k');
      o.onerror = () => rej(o.error || new Error('IndexedDB'));
      o.onsuccess = () => {
        const db = o.result; let out;
        try {
          const tx = db.transaction('k', mode), rq = fn(tx.objectStore('k'));
          rq.onsuccess = () => { out = rq.result; };
          tx.oncomplete = () => { db.close(); res(out); };
          tx.onerror = tx.onabort = () => { db.close(); rej(tx.error || new Error('IndexedDB')); };
        } catch (e) { db.close(); rej(e); }
      };
    });
  },
  /* the device's key for this account: a non-extractable CryptoKey in IndexedDB (raw in localStorage only where IndexedDB fails) */
  async load(uid) {
    if (!uid || !(window.crypto && crypto.subtle)) return null;
    if (this.mem && this.mem.uid === uid) return this.mem;
    let rec = null;
    try { rec = await this.idb('readonly', (st) => st.get('sec')); } catch (e) { rec = null; }
    if (!rec || !rec.key) { try { const j = JSON.parse(localStorage.getItem('mkc:syncKeyRaw') || 'null'); rec = j && j.raw ? { uid: j.uid, salt: j.salt, key: await crypto.subtle.importKey('raw', this.dec(j.raw), 'AES-GCM', false, ['encrypt', 'decrypt']) } : null; } catch (e) { rec = null; } }
    this.mem = rec && rec.uid === uid && rec.key ? rec : null; return this.mem;
  },
  async bits(password, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: this.dec(salt), iterations: this.ITER }, base, 256));
  },
  async keep(uid, salt, raw) {
    const rec = { uid, salt, key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
    this.mem = rec;
    try { await this.idb('readwrite', (st) => st.put(rec, 'sec')); try { localStorage.removeItem('mkc:syncKeyRaw'); } catch (e) { /* blocked */ } }
    catch (e) { try { localStorage.setItem('mkc:syncKeyRaw', JSON.stringify({ uid, salt, raw: this.enc(raw) })); } catch (e2) { /* this session only */ } }
    return rec;
  },
  async fromPassword(uid, password, salt) { return this.keep(uid, salt, await this.bits(password, salt)); },
  async forget() { this.mem = null; try { localStorage.removeItem('mkc:syncKeyRaw'); } catch (e) { /* blocked */ } try { await this.idb('readwrite', (st) => st.delete('sec')); } catch (e) { /* none */ } },
  async seal(rec, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, rec.key, new TextEncoder().encode(JSON.stringify(obj)));
    return { enc: 1, alg: 'AES-GCM/PBKDF2-SHA256', it: this.ITER, salt: rec.salt, iv: this.enc(iv), ct: this.enc(new Uint8Array(ct)) };
  },
  async open(rec, box) {
    if (!rec || !this.isBox(box) || box.salt !== rec.salt) return null;
    try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.dec(box.iv) }, rec.key, this.dec(box.ct)))); } catch (e) { return null; }
  },
  /* "Sign in with your phone": the phone derives the key from the password just typed and adds it to the sealed session (older TVs ignore it) */
  async forTv(tmp, data, password) {
    try {
      const uid = data.user.id, { data: row } = await tmp.from(SYNC_TABLE).select('data->secrets').eq('user_id', uid).maybeSingle();
      const box = row && row.secrets, mine = await this.load(uid);
      const salt = this.isBox(box) ? box.salt : mine ? mine.salt : this.newSalt(), raw = await this.bits(password, salt);
      if (this.isBox(box)) { const k = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']); await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.dec(box.iv) }, k, this.dec(box.ct)); }
      return { u: uid, k: { s: salt, r: this.enc(raw) } };
    } catch (e) { return {}; }
  },
  async fromTv(tok) { if (tok && tok.u && tok.k && tok.k.s && tok.k.r) await this.keep(tok.u, tok.k.s, this.dec(tok.k.r)); },
};
/* ---- Account keys, format 2 ----
   The password never leaves the device. From it (and the email as salt) the app derives two unrelated keys:
   a login key, which is what Supabase receives as the account password, and a wrap key, which never leaves the
   device. A random vault key seals the synced keys; the vault key is stored in the account only wrapped, once by
   the wrap key and once by a recovery code shown to the user. Changing the password re-wraps the vault key only. */
const Kdf2 = {
  ITER: 600000, PREFIX: 'mkc2.',
  te: new TextEncoder(),
  b64: (b) => SyncCrypt.enc(b), unb64: (s) => SyncCrypt.dec(s),
  isBox: (x) => !!(x && typeof x === 'object' && x.enc === 2 && typeof x.ct === 'string' && typeof x.iv === 'string' && typeof x.salt === 'string' && x.wraps && typeof x.wraps === 'object'),
  norm: (email) => String(email || '').trim().toLowerCase(),
  async hash(s) { return new Uint8Array(await crypto.subtle.digest('SHA-256', this.te.encode(s))); },
  async hkdf(ikm, info) {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: this.te.encode(info) }, k, 256));
  },
  /* one slow step per sign-in; the result is reused for login, unlock and re-wrapping */
  /* the salt is fixed when an account moves (kept in its metadata as mkc_salt), so a later email change keeps working */
  async saltOf(email) { return this.b64(await this.hash(`mkcinema|${this.norm(email)}`)); },
  async derive(email, password, salt) {
    salt = salt || await this.saltOf(email);
    const base = await crypto.subtle.importKey('raw', this.te.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const master = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: this.unb64(salt), iterations: this.ITER }, base, 256));
    return { email: this.norm(email), salt, login: this.PREFIX + this.b64(await this.hkdf(master, 'mkc-login')), wrap: await this.hkdf(master, 'mkc-wrap') };
  },
  /* which format an account uses, asked before sign-in so the plain password is only ever sent to an account that
     has not moved yet. { v: 1 } = not moved; { v: 2, s } = moved, with its salt; null = could not ask (older server) */
  async format(client, email) {
    try {
      const { data, error } = await client.rpc('mkc_account_format', { p_email: this.norm(email) });
      if (error || !data || typeof data !== 'object') return null;
      return data.v === 2 && typeof data.s === 'string' && data.s ? { v: 2, s: data.s } : data.v === 1 ? { v: 1 } : null;
    } catch (e) { return null; }
  },
  metaSalt: (user) => { const m = (user && user.user_metadata) || {}; return typeof m.mkc_salt === 'string' && m.mkc_salt ? m.mkc_salt : ''; },
  aad: (uid, what) => new TextEncoder().encode(`mkc-${what}|${uid}`),
  async aes(raw, extractable) { return crypto.subtle.importKey('raw', raw, 'AES-GCM', !!extractable, ['encrypt', 'decrypt']); },
  async wrapWith(raw, vaultRaw, uid) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: this.aad(uid, 'vault') }, await this.aes(raw), vaultRaw);
    return { iv: this.b64(iv), ct: this.b64(new Uint8Array(ct)) };
  },
  async unwrapWith(raw, w, uid) {
    if (!w || typeof w.iv !== 'string' || typeof w.ct !== 'string') return null;
    try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.unb64(w.iv), additionalData: this.aad(uid, 'vault') }, await this.aes(raw), this.unb64(w.ct))); } catch (e) { return null; }
  },
  /* recovery code: 16 random bytes as 26 Crockford base32 characters, shown as MKC-XXXX-XXXX-... */
  ALPHA: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
  newCode() {
    const b = crypto.getRandomValues(new Uint8Array(16)); let bits = 0, n = 0, out = '';
    for (const x of b) { n = (n << 8) | x; bits += 8; while (bits >= 5) { out += this.ALPHA[(n >> (bits - 5)) & 31]; bits -= 5; } }
    if (bits) out += this.ALPHA[(n << (5 - bits)) & 31];
    return `MKC-${out.match(/.{1,4}/g).join('-')}`;
  },
  codeBytes(code) {
    const s = String(code || '').toUpperCase().replace(/^MKC-?/, '').replace(/[^0-9A-Z]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
    if (s.length !== 26) return null;
    let bits = 0, n = 0; const out = [];
    for (const ch of s) { const v = this.ALPHA.indexOf(ch); if (v < 0) return null; n = ((n << 5) | v) & 0xffff; bits += 5; if (bits >= 8) { out.push((n >> (bits - 8)) & 255); bits -= 8; } }
    return out.length >= 16 ? new Uint8Array(out.slice(0, 16)) : null;
  },
  async codeKey(code) { const b = this.codeBytes(code); return b ? this.hkdf(b, 'mkc-recovery') : null; },
  /* a fresh vault: new vault key, wrapped by the password and by a new recovery code */
  async newVault(uid, wrap) {
    const vault = crypto.getRandomValues(new Uint8Array(32)), code = this.newCode();
    const wraps = { at: Date.now(), pw: { it: this.ITER, ...(await this.wrapWith(wrap, vault, uid)) }, rc: await this.wrapWith(await this.codeKey(code), vault, uid) };
    return { vault, code, wraps, vid: this.b64(crypto.getRandomValues(new Uint8Array(9))) };
  },
  /* the device keeps the vault key (exportable, so it can be re-wrapped after a password change or handed to a TV) */
  async keep(uid, vid, vaultRaw, wraps) {
    const rec = { uid, v: 2, vid, salt: `v2:${vid}`, wraps, key: await this.aes(vaultRaw, true) };
    SyncCrypt.mem = rec;
    try { await SyncCrypt.idb('readwrite', (st) => st.put(rec, 'sec')); try { localStorage.removeItem('mkc:syncKeyRaw'); } catch (e) { /* blocked */ } }
    catch (e) { try { localStorage.setItem('mkc:syncKeyRaw', JSON.stringify({ v: 2, uid, vid, wraps, raw: this.b64(vaultRaw) })); } catch (e2) { /* this session only */ } }
    return rec;
  },
  async raw(rec) { return new Uint8Array(await crypto.subtle.exportKey('raw', rec.key)); },
  /* sign in with the login key and/or the plain password. Order: a device that has seen this account on format 2
     never sends the plain password; otherwise UPGRADE decides which goes first. Returns { data, error, mode, d }. */
  UPGRADE: true,
  hintKey: async (email) => `mkc:kdf2:${SyncCrypt.enc((await Kdf2.hash(`hint|${Kdf2.norm(email)}`)).slice(0, 9))}`,
  async signIn(client, email, password, d, known) {
    const fmt = await this.format(client, email);
    if (fmt && fmt.v === 2 && (!d || d.salt !== fmt.s)) d = await this.derive(email, password, fmt.s);
    d = d || await this.derive(email, password);
    const hk = await this.hintKey(email); try { known = known || localStorage.getItem(hk) === '1'; } catch (e) { /* blocked */ }
    const tryKey = async () => ({ ...(await client.auth.signInWithPassword({ email, password: d.login })), mode: 2 });
    const tryRaw = async () => ({ ...(await client.auth.signInWithPassword({ email, password })), mode: 1 });
    // the server says which one: no guessing, so a mistyped password never goes out in plain for a moved account
    const order = fmt ? (fmt.v === 2 ? [tryKey] : [tryRaw]) : known ? [tryKey] : this.UPGRADE ? [tryKey, tryRaw] : [tryRaw, tryKey];
    let r = null;
    for (const f of order) { r = await f(); if (!r.error) break; if (!/invalid/i.test(`${r.error.message || ''} ${r.error.code || ''}`)) break; }
    if (r && !r.error && r.mode === 2) { try { localStorage.setItem(hk, '1'); } catch (e) { /* blocked */ } }
    return { ...r, d };
  },
  async markKnown(email) { try { localStorage.setItem(await this.hintKey(email), '1'); } catch (e) { /* blocked */ } },
};
/* SyncCrypt learns format 2: same call sites, a rec of v:2 seals and opens format 2 boxes */
(() => {
  const isBox1 = SyncCrypt.isBox, seal1 = SyncCrypt.seal.bind(SyncCrypt), open1 = SyncCrypt.open.bind(SyncCrypt), load1 = SyncCrypt.load.bind(SyncCrypt);
  SyncCrypt.isBox = (x) => isBox1(x) || Kdf2.isBox(x);
  /* wraps change on another device (new password, new recovery code): the newest set wins, matched by vault id */
  Kdf2.freshWraps = (rec) => {
    const r = typeof Account !== 'undefined' ? Account.remoteSecrets : null;
    if (Kdf2.isBox(r) && r.vid === rec.vid && (+(r.wraps && r.wraps.at) || 0) > (+(rec.wraps && rec.wraps.at) || 0)) {
      rec.wraps = r.wraps; SyncCrypt.idb('readwrite', (st) => st.put(rec, 'sec')).catch(() => {});
    }
    return rec.wraps;
  };
  SyncCrypt.seal = async function (rec, obj) {
    if (!rec || rec.v !== 2) return seal1(rec, obj);
    Kdf2.freshWraps(rec);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Kdf2.aad(rec.uid, 'secrets') }, rec.key, new TextEncoder().encode(JSON.stringify(obj)));
    return { enc: 2, alg: 'AES-GCM/vault', salt: rec.salt, vid: rec.vid, iv: this.enc(iv), ct: this.enc(new Uint8Array(ct)), wraps: rec.wraps };
  };
  SyncCrypt.open = async function (rec, box) {
    if (!Kdf2.isBox(box)) return rec && rec.v === 2 ? null : open1(rec, box);
    if (!rec || rec.v !== 2 || box.salt !== rec.salt) return null;
    try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: this.dec(box.iv), additionalData: Kdf2.aad(rec.uid, 'secrets') }, rec.key, this.dec(box.ct)))); } catch (e) { return null; }
  };
  SyncCrypt.load = async function (uid) {
    if (this.mem && this.mem.uid === uid) return this.mem;
    try { const j = JSON.parse(localStorage.getItem('mkc:syncKeyRaw') || 'null'); if (j && j.v === 2 && j.uid === uid && j.raw) { this.mem = { uid, v: 2, vid: j.vid, salt: `v2:${j.vid}`, wraps: j.wraps, key: await Kdf2.aes(this.dec(j.raw), true) }; return this.mem; } } catch (e) { /* none */ }
    return load1(uid);
  };
  /* "Sign in with your phone": the phone opens the account's vault with the password just typed and hands the TV
     the vault key inside the already sealed session (format 1 accounts keep the old hand-off) */
  const forTv1 = SyncCrypt.forTv.bind(SyncCrypt), fromTv1 = SyncCrypt.fromTv.bind(SyncCrypt);
  SyncCrypt.forTv = async function (tmp, data, password, d) {
    try {
      const uid = data.user.id, { data: row } = await tmp.from(SYNC_TABLE).select('data->secrets').eq('user_id', uid).maybeSingle();
      const box = row && row.secrets;
      if (!Kdf2.isBox(box)) return forTv1(tmp, data, password);
      d = d || await Kdf2.derive(data.user.email, password);
      const vault = await Kdf2.unwrapWith(d.wrap, box.wraps.pw, uid);
      return vault ? { u: uid, k2: { vid: box.vid, w: box.wraps, r: this.enc(vault) } } : { u: uid };
    } catch (e) { return {}; }
  };
  SyncCrypt.fromTv = async function (tok) {
    if (tok && tok.u && tok.k2 && tok.k2.r && tok.k2.vid) { await Kdf2.keep(tok.u, tok.k2.vid, this.dec(tok.k2.r), tok.k2.w); return; }
    return fromTv1(tok);
  };
})();
const Account = {
  client: null, user: null, source: null, serverCfg: null, error: '',
  sync: { state: 'idle', at: Store.get('syncAt', null), error: '' }, pushT: 0, applying: false,

  config() {
    const own = Store.get('supabase', null);
    if (own && own.url && own.anonKey) return { ...own, source: 'settings' };
    if (this.serverCfg) return { ...this.serverCfg, source: 'mkcinema-server' };
    if (SUPABASE_PROJECT.url && SUPABASE_PROJECT.anonKey) return { ...SUPABASE_PROJECT, source: 'built in' };
    return null;
  },
  canRedirect: () => /^https?:$/.test(location.protocol),
  redirectTo: () => location.href.split('#')[0].split('?')[0],

  async init() {
    // A failed provider sign-in comes back as ?error=…&error_description=… (or in the #hash)
    const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ''));
    const bad = q.get('error_description') || h.get('error_description');
    if (bad) {
      setTimeout(() => toast(`Sign-in failed: ${bad.replace(/\+/g, ' ')}`, 'err', 9000), 1500);
      history.replaceState(null, '', location.pathname);
    }
    if (this.canRedirect() && !/(^|\.)(mkcinema\.app|pages\.dev)$/.test(location.hostname)) {
      try {
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 2500);
        const r = await fetch('config.json', { signal: ctl.signal, cache: 'no-store' });
        // static hosts answer an unknown path with the whole app page: drop it at the headers instead of downloading it
        if (!/json/i.test(r.headers.get('content-type') || '')) ctl.abort();
        else if (r.ok) { const j = await r.json(); if (j.supabaseUrl && j.supabaseAnonKey) this.serverCfg = { url: j.supabaseUrl, anonKey: j.supabaseAnonKey }; }
      } catch (e) { /* not served by mkcinema-server */ }
    }
    const c = this.config(); this.render();
    if (c && !this.needLib(c)) { this.lazy = true; return; }
    if (c) await this.connect(c);
  },
  /* the library (about 48 KB over the wire) is needed at start only when this device has a session, the
     page is a sign-in or reset link coming back, or the project is not the built-in one */
  needLib(c) {
    let auth = false; try { auth = !!localStorage.getItem('mkc:auth'); } catch (e) { auth = true; }
    return auth || c.source !== 'built in' || /(access_token|refresh_token|error_description|type=(recovery|signup|invite|magiclink|email_change))=?/.test(location.hash) || /[?&](code|token_hash|error_description)=/.test(location.search);
  },
  /* connect now if start-up skipped it (Account opened, sign-in pressed, a TV sign-in arriving) */
  async ensure() {
    if (this.client) return true;
    const c = this.config(); if (!c) return false;
    this.lazy = false; if (!this.connecting) this.connecting = this.connect(c).finally(() => { this.connecting = null; });
    await this.connecting; return !!this.client;
  },
  async loadLib() {
    if (window.supabase && window.supabase.createClient) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = SUPABASE_LIB; s.async = true; s.integrity = SUPABASE_SRI; s.crossOrigin = 'anonymous';
      s.onload = res; s.onerror = () => rej(new Error('Could not load the Supabase library (check your connection)'));
      document.head.appendChild(s);
    });
  },
  /* Ask the project whether new sign-ups are allowed, so the button only shows when it works */
  async loadProviders(c) {
    try {
      const r = await fetchT(`${c.url.replace(/\/+$/, '')}/auth/v1/settings`, { headers: { apikey: c.anonKey } }, 6000);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json(); this.signupOff = !!j.disable_signup;
    } catch (e) { /* unknown: keep the button */ }
    this.render();
  },
  async connect(c) {
    this.error = ''; this.source = c.source;
    try {
      if (!/^https:\/\/[^/]+/.test(c.url)) throw new Error('The project URL should look like https://abcd1234.supabase.co');
      await this.loadLib();
      this.client = window.supabase.createClient(c.url.replace(/\/+$/, ''), c.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'mkc:auth' } });
      this.loadProviders(c);
      this.client.auth.onAuthStateChange((ev, session) => { this.session = session || null; setTimeout(() => this.setUser(session ? session.user : null, ev), 0); });
      const { data, error } = await this.client.auth.getSession();
      this.session = (data && data.session) || null;
      if (error) toast(`Sign-in did not finish: ${error.message}`, 'err', 8000); // e.g. a provider error handed back in the URL
      this.setUser(data.session ? data.session.user : null, 'INITIAL');
    } catch (e) { this.client = null; this.error = e.message || String(e); this.render(); }
  },
  setUser(user, ev) {
    const before = this.user && this.user.id; this.user = user || null;
    if (ev === 'SIGNED_IN' && user && user.id !== before) toast(`Signed in as ${user.email || 'your account'}`, 'ok');
    if (ev === 'SIGNED_OUT' && before) { toast('Signed out', 'info'); this.signedOut(); }
    if (user && user.id !== before) this.pull({ signin: true });
    if (ev === 'PASSWORD_RECOVERY') { openSettings('account'); toast('Choose a new password below', 'info', 6000); this.recovering = true; }
    this.render();
  },
  name() { const u = this.user; if (!u) return ''; const m = u.user_metadata || {}; return m.full_name || m.name || m.user_name || u.email || 'Signed in'; },

  async run(label, fn) {
    if (!this.client && this.config()) await this.ensure();
    if (!this.client) { toast('Connect a Supabase project first', 'err'); return; }
    // disable the buttons in place; re-rendering here would wipe what was typed
    const btns = $$('#setBody .acct-card button'); btns.forEach((x) => { x.disabled = true; });
    try { const msg = await fn(); if (msg) toast(msg, 'ok', 6000); } catch (e) { toast(`${label}: ${e.message || e}`, 'err', 7000); }
    btns.forEach((x) => { if (x.isConnected) x.disabled = false; });
  },
  creds() {
    const email = ($('#acc-email') || {}).value || '', password = ($('#acc-pass') || {}).value || '';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Enter a valid email address');
    return { email: email.trim(), password };
  },
  signIn() { return this.run('Sign in', async () => { const { email, password } = this.creds(); if (!password) throw new Error('Enter your password'); this.pendingPass = password; const { error } = await this.client.auth.signInWithPassword({ email, password }); if (error) { this.pendingPass = ''; throw error; } setTimeout(() => { if (this.pendingPass && this.user) this.pull({ force: true, quiet: true }); }, 1500); }); },
  signUp() {
    return this.run('Create account', async () => {
      const { email, password } = this.creds(); if (password.length < 10) throw new Error('Use a password of at least 10 characters');
      this.pendingPass = password;
      const { data, error } = await this.client.auth.signUp({ email, password, options: this.canRedirect() ? { emailRedirectTo: this.redirectTo() } : {} }); if (error) throw error;
      return data.session ? '' : 'Check your inbox to confirm your email, then sign in.';
    });
  },
  reset() {
    return this.run('Reset password', async () => {
      if (!this.canRedirect()) throw new Error('Reset links need MKCinema on a web address. Run mkcinema-server.js and open http://127.0.0.1:7000');
      const { email } = this.creds(); const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: this.redirectTo() }); if (error) throw error;
      return `Password reset link sent to ${email}`;
    });
  },
  newPassword() {
    return this.run('New password', async () => {
      const password = ($('#acc-newpass') || {}).value || ''; if (password.length < 10) throw new Error('Use a password of at least 10 characters');
      const { error } = await this.client.auth.updateUser({ password }); if (error) throw error; this.recovering = false; await this.rekey(password); return 'Password updated';
    });
  },
  signOut(all) { return this.run(all ? 'Sign out everywhere' : 'Sign out', async () => { await this.flush(); const { error } = await this.client.auth.signOut(all ? { scope: 'global' } : { scope: 'local' }); if (error) throw error; return all ? 'Signed out on all your devices' : ''; }); },
  saveProject() {
    const url = ($('#acc-url') || {}).value.trim(), anonKey = ($('#acc-key') || {}).value.trim();
    if (!url || !anonKey) { toast('Paste both the project URL and the anon key', 'err'); return; }
    if (isSecretKey(anonKey)) { toast('That is a secret key. Use the publishable (anon) key; secret keys must never be in a web app.', 'err', 8000); return; }
    Store.set('supabase', { url, anonKey }); this.connect({ url, anonKey, source: 'settings' }).then(() => { if (this.client) toast('Supabase connected', 'ok'); });
  },
  forgetProject() {
    if (this.client) this.client.auth.signOut().catch(() => {});
    Store.set('supabase', null); this.client = null; this.user = null; this.error = '';
    const c = this.config(); if (c) this.connect(c); else this.render();
  },

  /* ---- Cloud sync: one row per user in mkcinema_profiles (see README for the SQL) ---- */
  setSync(state, error = '') { this.sync.state = state; this.sync.error = error; this.render(); },
  syncError(e) {
    const m = (e && (e.message || e.code)) || String(e);
    return /relation .* does not exist|PGRST205|42P01|Could not find the table/i.test(`${m} ${e && e.code}`) ? `The ${SYNC_TABLE} table is missing. Run the SQL from the README in your Supabase SQL editor.` : m;
  },
  /* ---- Sync engine (2.37). Every synced section carries its own time; a pull merges newest per section (newest per
     setting for cfg, entry by entry for watchlist, progress and watched, with tombstones for removals); a push is a conditional
     update on the row's updated_at, so a device that missed changes merges them first instead of overwriting them. ---- */
  meta: null, extra: {}, q: null, busy: false, lastPull: 0, lastProg: Date.now(), lastNonProg: 0, lastPushAt: 0, composedAt: 0, pushDue: 0,
  keyRec: null, keyChecked: false, remoteSecrets: undefined, boxLocked: false, forceSeal: false, secCache: null, avCache: null,
  m() {
    if (!this.meta) {
      let x = null; try { x = JSON.parse(localStorage.getItem('mkc:syncMeta') || 'null'); } catch (e) { x = null; }
      x = x && typeof x === 'object' ? x : {};
      this.meta = { at: x.at || {}, rat: x.rat || {}, cf: x.cf || {}, rcf: x.rcf || {}, del: x.del || {}, add: x.add || {} };
    }
    return this.meta;
  },
  saveMeta() { try { localStorage.setItem('mkc:syncMeta', JSON.stringify(this.m())); } catch (e) { /* full or blocked */ } },
  resetMeta() { this.meta = { at: {}, rat: {}, cf: {}, rcf: {}, del: {}, add: {} }; this.saveMeta(); this.extra = {}; try { localStorage.removeItem('mkc:syncExtra'); } catch (e) { /* blocked */ } },
  /* the Store wrappers call these: note which section changed on this device, and which list entries were removed */
  peek(lk) { if (!syncSection(lk)) return undefined; try { return localStorage.getItem(`mkc:${lk}`); } catch (e) { return undefined; } },
  touched(lk, prev) {
    if (prev === undefined || this.applying) return;
    let now; try { now = localStorage.getItem(`mkc:${lk}`); } catch (e) { return; }
    if (now === prev) return;
    const m = this.m(), s = syncSection(lk), t = Date.now(), ts = SyncClock.now();
    m.at[s] = Math.max(ts, (m.rat[s] || 0) + 1);
    if (!/(^|:)progress$/.test(lk)) this.lastNonProg = t;
    if (SYNC_ITEMS.includes(lk)) {
      const ids = (x) => (Array.isArray(x) ? x.map((i) => i && i.id).filter(Boolean) : x && typeof x === 'object' ? Object.keys(x) : []);
      let a = [], b = []; try { a = ids(JSON.parse(prev)); b = ids(JSON.parse(now)); } catch (e) { /* unreadable */ }
      const was = new Set(a), keep = new Set(b), del = m.del[lk] || (m.del[lk] = {});
      a.forEach((id) => { if (!keep.has(id)) del[id] = ts; });
      if (lk === 'watchlist') b.forEach((id) => { if (!was.has(id)) { m.add[id] = ts; delete del[id]; } });
    }
    this.saveMeta(); this.schedule();
  },
  markCfg() {
    let cur; try { cur = JSON.parse(JSON.stringify(CFG)); } catch (e) { return; }
    const was = this.cfgSnap; this.cfgSnap = cur;
    if (!was || this.applying) return;
    const m = this.m(), t = Date.now(); let hit = false;
    new Set([...Object.keys(was), ...Object.keys(cur)]).forEach((k) => {
      if (k === 'cfgRev' || JSON.stringify(was[k]) === JSON.stringify(cur[k])) return;
      m.cf[k] = Math.max(SyncClock.now(), (m.rcf[k] || 0) + 1); hit = true;
    });
    if (!hit) return;
    this.lastNonProg = t;
    if ((was.syncKeys !== false) !== (cur.syncKeys !== false)) ['addons', 'channels'].forEach((s) => { m.at[s] = Math.max(SyncClock.now(), (m.rat[s] || 0) + 1); });
    this.saveMeta();
  },
  canWriteSecrets() { const rec = this.keyRec, r = this.remoteSecrets; return !!rec && (this.forceSeal || !SyncCrypt.isBox(r) || (r.salt === rec.salt && !this.boxLocked)); },
  keysSync() { return !!(this.user && CFG.cloudSync !== false && CFG.syncKeys !== false && this.canWriteSecrets()); },
  needsUnlock() {
    const u = this.user, prov = u && u.app_metadata && u.app_metadata.provider;
    return !!(u && u.email && (!prov || prov === 'email') && this.keyChecked && CFG.cloudSync !== false && CFG.syncKeys !== false && !this.canWriteSecrets());
  },
  dirty() {
    const m = this.m();
    const out = SYNC_SECTIONS.filter((s) => s !== 'cfg' && (m.at[s] || 0) > (m.rat[s] || 0) && (s !== 'secrets' || (CFG.syncKeys !== false && this.canWriteSecrets())));
    if (Object.keys(m.cf).some((k) => m.cf[k] > (m.rcf[k] || 0))) out.push('cfg');
    return out;
  },
  schedule(fast) {
    this.markCfg();
    if (this.applying || this.deleting || !this.client || !this.user || CFG.cloudSync === false || !this.dirty().length) return;
    // progress ticks ride along at most once a minute; any other change goes up after 2.5 s
    const wait = fast || this.lastNonProg > this.lastPushAt ? 2500 : Math.max(2500, 60000 - (Date.now() - this.lastProg)), due = Date.now() + wait;
    if (this.pushT && this.pushDue <= due) return;
    clearTimeout(this.pushT); this.pushDue = due; this.pushT = setTimeout(() => { this.pushT = 0; this.push(); }, wait);
  },
  soon() { this.schedule(true); },
  async flush() { clearTimeout(this.pushT); this.pushT = 0; if (this.user && this.dirty().length) await this.push(); },
  serial(fn) {
    const run = async () => { this.busy = true; try { return await fn(); } finally { this.busy = false; } };
    const p = (this.q || Promise.resolve()).then(run, run); this.q = p.catch(() => {}); return p;
  },
  pull(o = {}) {
    if (!this.client || !this.user || CFG.cloudSync === false) return Promise.resolve();
    if (o.soon && (this.busy || Date.now() - this.lastPull < (o.every || 15000))) return Promise.resolve();
    this.lastPull = Date.now();
    return this.serial(() => this._pull(o));
  },
  push(o = {}) { return this.serial(() => this._push(o)); },
  async _pull(o = {}) {
    if (!this.client || !this.user || CFG.cloudSync === false) return;
    const uid = this.user.id, loud = !o.quiet, lockWas = this.needsUnlock();
    if (loud) this.setSync('syncing');
    try {
      this.ownerCheck(uid);
      // a cheap look first: the row is only downloaded when it changed since this device last merged it
      if (this.loadedOnce && !o.force && !this.pendingPass) {
        const { data: h, error: he } = await this.client.from(SYNC_TABLE).select('updated_at').eq('user_id', uid).maybeSingle();
        if (he) throw he;
        if (h && this.sync.at && Date.parse(h.updated_at) === Date.parse(this.sync.at)) {
          if (loud || this.sync.state === 'error') this.setSync(this.newer ? 'error' : 'ok', this.newer ? SYNC_NEWER : '');
          if (!o.noPush) this.schedule(true);
          return;
        }
      }
      const { data, error } = await this.client.from(SYNC_TABLE).select('data, updated_at').eq('user_id', uid).maybeSingle();
      if (error) throw error;
      if (!this.user || this.user.id !== uid) return;
      const R = data && data.data && typeof data.data === 'object' ? data.data : null;
      if (this.pendingPass) await this.derive(uid, R && R.secrets);
      this.keyRec = await SyncCrypt.load(uid); this.keyChecked = true; this.loadedOnce = true;
      if (!R) {
        this.noRow = true; this.remoteSecrets = undefined;
        if (!o.noPush) await this._push({ force: true }); else if (loud) this.setSync('ok');
      } else {
        this.noRow = false;
        this.rowAt = data.updated_at; const changed = await this.merge(R);
        this.sync.at = data.updated_at; Store.set('syncAt', data.updated_at);
        if (this.newer) this.setSync('error', SYNC_NEWER); else if (loud || this.sync.state !== 'ok') this.setSync('ok');
        if (changed) {
          if (o.signin) toast('Synced your library and settings from your account', 'ok');
          rerender(); if (typeof renderHome === 'function' && S.view === 'home') renderHome();
        }
        if (!o.noPush) this.schedule(true);
      }
      if (lockWas !== this.needsUnlock() && !$('#settings').hidden && typeof renderSettingsBody === 'function') renderSettingsBody();
    } catch (e) { this.applying = false; this.setSync('error', this.syncError(e)); }
  },
  /* sign-in on a device that held another account's data: its keys go, and its library merges as if new */
  ownerCheck(uid) {
    const owner = Store.raw.get('syncOwner', '');
    if (owner === uid) return;
    if (owner) { this.resetMeta(); this.sync.at = null; Store.set('syncAt', null); this.loadedOnce = false; this.dropKeys(); }
    Store.raw.set('syncOwner', uid);
  },
  /* the password was just typed (sign in, sign up, unlock): derive this device's key with the salt in the account's sealed box */
  async derive(uid, box) {
    const pw = this.pendingPass; this.pendingPass = '';
    if (!pw || !(window.crypto && crypto.subtle)) return;
    try {
      if (SyncCrypt.isBox(box)) {
        const rec = await SyncCrypt.fromPassword(uid, pw, box.salt);
        if (await SyncCrypt.open(rec, box)) return;
        // sealed under an older password (reset by email): keep this device's keys and seal them again
        await SyncCrypt.fromPassword(uid, pw, SyncCrypt.newSalt()); this.forceSeal = true;
        const m = this.m(); m.at.secrets = Math.max(SyncClock.now(), (m.rat.secrets || 0) + 1); this.saveMeta();
        return;
      }
      const mine = await SyncCrypt.load(uid);
      await SyncCrypt.fromPassword(uid, pw, mine ? mine.salt : SyncCrypt.newSalt());
    } catch (e) { /* keys keep syncing as before on this device */ }
  },
  async rekey(password) {
    if (!this.user || !(window.crypto && crypto.subtle)) return;
    try {
      this.keyRec = await SyncCrypt.fromPassword(this.user.id, password, SyncCrypt.newSalt()); this.keyChecked = true; this.forceSeal = true;
      const m = this.m(); m.at.secrets = Math.max(SyncClock.now(), (m.rat.secrets || 0) + 1); this.saveMeta(); this.schedule(true);
    } catch (e) { /* keys stay as they are */ }
  },
  mergeItems(s, L, R, o) {
    const gone = (id, t) => o.del[id] != null && o.del[id] >= t;
    if (s === 'watchlist') {
      const la = Array.isArray(L) ? L : [], ra = Array.isArray(R) ? R : [];
      const lm = new Map(la.filter((x) => x && x.id).map((x) => [x.id, x])), rm = new Map(ra.filter((x) => x && x.id).map((x) => [x.id, x]));
      const tl = (id) => +o.addL[id] || 0, tr = (id) => (o.legacy ? o.rt : +o.addR[id] || 0);
      const rFirst = o.rt >= o.lt, out = [], seen = new Set();
      [...(rFirst ? ra : la), ...(rFirst ? la : ra)].forEach((x) => {
        if (!x || !x.id || seen.has(x.id)) return; seen.add(x.id);
        const t = Math.max(lm.has(x.id) ? tl(x.id) : -1, rm.has(x.id) ? tr(x.id) : -1);
        if (!gone(x.id, t)) out.push((rFirst ? rm.get(x.id) : lm.get(x.id)) || x);
      });
      return out;
    }
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {}), lo = obj(L), ro = obj(R), out = {};
    const ts = (v, side) => (s === 'progress' ? +(v && v.at) : typeof v === 'number' ? v : 0) || side;
    new Set([...Object.keys(lo), ...Object.keys(ro)]).forEach((id) => {
      const a = lo[id], b = ro[id], ta = a === undefined ? -1 : ts(a, o.lt), tb = b === undefined ? -1 : ts(b, o.rt);
      const [v, t] = tb >= ta ? [b, tb] : [a, ta];
      if (!gone(id, t)) out[id] = v;
    });
    return out;
  },
  /* merge the account's row into this device; returns true when anything here changed */
  async merge(R) {
    const m = this.m(), sy = R._sync && typeof R._sync === 'object' ? R._sync : null, T = Date.parse(this.rowAt || '') || 0;
    this.newer = !!(sy && +sy.v > SYNC_V);
    const rowT = T || Date.now();
    // a row from an older app has no times: everything in it counts as written when the row was
    const rTs = (s) => (sy ? +((sy.at || {})[s]) || 0 : R[s] !== undefined ? rowT : 0);
    const rDel = sy && sy.del && typeof sy.del === 'object' ? sy.del : {};
    let local = {}; try { local = exportData(); } catch (e) { local = {}; }
    const known = new Set([...SYNC_SECTIONS, '_sync', 'app', 'version', 'wall', 'proxy']);
    this.extra = Object.fromEntries(Object.entries(R).filter(([k]) => !known.has(k) && !(k in local)));
    try { localStorage.setItem('mkc:syncExtra', JSON.stringify(this.extra)); } catch (e) { /* full */ }
    const d = {}; let changed = false;
    if (!sy) d._legacy = true;
    // settings: newest per setting
    if (R.cfg && typeof R.cfg === 'object') {
      const rcf = sy ? sy.cf || {} : null, win = {};
      Object.keys(R.cfg).forEach((k) => {
        if (k === 'cfgRev') return;
        const rt = rcf ? +rcf[k] || 0 : rowT;
        if (rt > (m.cf[k] || 0)) { if (JSON.stringify(R.cfg[k]) !== JSON.stringify(CFG[k])) win[k] = R.cfg[k]; m.cf[k] = rt; }
        m.rcf[k] = rt;
      });
      if ('contrast' in win) win.contrastChosen = R.cfg.contrastChosen;
      if (Object.keys(win).length) d.cfg = win;
    }
    // watchlist, progress, watched: entry by entry; a removal beats any older copy
    SYNC_ITEMS.forEach((s) => {
      const rt = rTs(s), lt = m.at[s] || 0, del = { ...(m.del[s] || {}) };
      Object.entries(rDel[s] || {}).forEach(([id, t]) => { if (!(del[id] >= +t)) del[id] = +t; });
      m.del[s] = del;
      const L = Store.raw.get(s, s === 'watchlist' ? [] : {}), Rv = R[s] !== undefined ? R[s] : s === 'watchlist' ? [] : {};
      const addR = sy && sy.add && typeof sy.add === 'object' ? sy.add : {};
      const merged = this.mergeItems(s, L, Rv, { lt, rt, del, legacy: !sy, addL: m.add, addR });
      if (s === 'watchlist') Object.entries(addR).forEach(([id, t]) => { if (!(m.add[id] >= +t)) m.add[id] = +t; });
      const ms = JSON.stringify(merged);
      if (ms !== JSON.stringify(L)) { d[s] = merged; changed = true; }
      m.at[s] = R[s] !== undefined && ms === JSON.stringify(R[s]) ? rt : Math.max(SyncClock.now(), rt + 1);
      m.rat[s] = rt;
    });
    // everything else: the newer copy wins as a whole, so removed addons, playlists and lists stay removed
    SYNC_SECTIONS.forEach((s) => {
      if (s === 'cfg' || s === 'secrets' || SYNC_ITEMS.includes(s)) return;
      const rt = rTs(s), lt = m.at[s] || 0;
      if (rt > lt) {
        if (R[s] !== undefined) {
          let v = R[s];
          // a device with key sync off leaves its keyed addon links out: keep this device's own
          if (s === 'addons' && Array.isArray(v) && sy && sy.ks === false) { const mine = (Store.get('addons', []) || []).filter(keyedAddon); v = [...v, ...mine.filter((u) => !v.includes(u))]; }
          const lv = s === 'avatar' ? Store.get('avatar', null) : local[s];
          if (JSON.stringify(v) !== JSON.stringify(lv === undefined ? null : lv)) { d[s] = v; changed = true; }
        }
        m.at[s] = rt;
      }
      m.rat[s] = rt;
    });
    if (Object.keys(d).some((k) => k !== '_legacy')) { this.applying = true; try { this.applyRemote(d); this.markCfg(); } finally { this.applying = false; } }
    if (await this.mergeSecrets(R.secrets, rTs('secrets'), !sy)) changed = true;
    this.saveMeta();
    return changed;
  },
  async mergeSecrets(box, rt, legacy) {
    const m = this.m(), lt = m.at.secrets || 0;
    this.remoteSecrets = box == null ? undefined : box; this.boxLocked = false; m.rat.secrets = rt;
    if (CFG.syncKeys === false || !box || typeof box !== 'object') return false;
    let obj = null; const sealed = SyncCrypt.isBox(box);
    if (sealed) { obj = await SyncCrypt.open(this.keyRec, box); this.boxLocked = !obj && !!this.keyRec && box.salt === this.keyRec.salt; if (!obj) return false; }
    else obj = box;
    const unite = legacy || this.unlocking || !sealed;
    if (!unite && !(rt > lt)) return false;
    let changed = false, extra = false; this.applying = true;
    try {
      ['vault', 'keys'].forEach((k) => {
        const v = obj[k] && typeof obj[k] === 'object' ? obj[k] : {}, mine = Store.get(k, {}) || {};
        const next = unite ? { ...mine, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x != null)) } : v;
        if (unite && JSON.stringify(next) !== JSON.stringify(v)) extra = true;
        if (JSON.stringify(next) !== JSON.stringify(mine)) { Store.set(k, next); changed = true; }
      });
    } finally { this.applying = false; }
    if (changed) { try { engine.clearCache(); Vault.cached.clear(); } catch (e) { /* not ready yet */ } }
    // keys from an older app are plain text: a device with the key seals them on its next upload
    m.at.secrets = (extra || !sealed) && this.keyRec ? Math.max(SyncClock.now(), rt + 1) : Math.max(unite ? lt : 0, rt);
    return changed;
  },
  applyRemote(d) {
    if (d.cfg) { const keep = { cfgRev: CFG.cfgRev }; const rc = { ...d.cfg }; if (!rc.contrastChosen) delete rc.contrast; Object.assign(CFG, rc, keep); if (CFG.quality !== 'custom') CFG.quality = applyPreset(CFG.quality); saveCfg(); applyAll(); }
    if (d.watchlist) { S.watchlist = d.watchlist; Store.set('watchlist', d.watchlist); }
    if (d.progress) { S.progress = d.progress; Store.set('progress', d.progress); }
    if (d.watched) { Store.set('watched', d.watched); WATCHED = null; }
    if (d.studio) { S.studio = d.studio; Store.set('studio', d.studio); }
    if (d.disabled) Store.set('disabled', d.disabled);
    if (d.taste) Store.set('taste', d.taste);
    if (d.homeLayout) Store.set('homeLayout', d.homeLayout);
    if (d.avatar !== undefined) Store.set('avatar', d.avatar);
    // keys are merged by mergeSecrets (sealed with the account key)
    if (Array.isArray(d.addons)) {
      Store.set('addons', d.addons);
      const have = new Set(engine.addons.map((a) => a.baseUrl));
      d.addons.filter((u) => !have.has(u)).forEach((u) => engine.install(u, { silent: true }).catch(() => {}));
    }
  },
  async prepare() {
    const uid = this.user && this.user.id;
    if (!this.keyChecked && uid) { this.keyRec = await SyncCrypt.load(uid); this.keyChecked = true; }
    if (CFG.syncKeys !== false && this.canWriteSecrets()) {
      const obj = { vault: Store.get('vault', {}), keys: Store.get('keys', {}) }, plain = JSON.stringify(obj), sc = this.secCache;
      if (!sc || sc.uid !== uid || sc.plain !== plain || sc.salt !== this.keyRec.salt) this.secCache = { uid, plain, salt: this.keyRec.salt, box: await SyncCrypt.seal(this.keyRec, obj) };
    }
    const av = Store.get('avatar', null);
    if (typeof av === 'string' && av.length > SYNC_AV_MAX && (!this.avCache || this.avCache.src !== av)) this.avCache = { src: av, small: await shrinkDataUrl(av, SYNC_AV_MAX).catch(() => null) };
  },
  /* the row this device uploads: same top-level keys as before (2.36 apps read it), plus _sync */
  compose() {
    const m = this.m(), uid = this.user && this.user.id, at = {}, cf = {};
    const d = exportData(); delete d.proxy; delete d.wall; // wall is per device
    const out = { ...(this.extra || {}), ...d };
    SYNC_SECTIONS.forEach((s) => { at[s] = Math.max(m.at[s] || 0, m.rat[s] || 0) || 1; });
    const keep = (s) => { at[s] = m.rat[s] || 1; };
    // settings: very large values (pictures) stay on the device
    out.cfg = { ...CFG }; Object.keys(out.cfg).forEach((k) => { if (typeof out.cfg[k] === 'string' && out.cfg[k].length > SYNC_AV_MAX) delete out.cfg[k]; else cf[k] = Math.max(m.cf[k] || 0, m.rcf[k] || 0) || 1; });
    // keys: sealed on this device; a device that cannot seal (locked, or key sync off) leaves the account's copy as it is
    const plain = JSON.stringify({ vault: Store.get('vault', {}), keys: Store.get('keys', {}) }), sc = this.secCache;
    if (CFG.syncKeys !== false && this.canWriteSecrets() && sc && sc.uid === uid && sc.plain === plain && sc.salt === this.keyRec.salt) out.secrets = sc.box;
    else { if (this.remoteSecrets !== undefined) out.secrets = this.remoteSecrets; else delete out.secrets; keep('secrets'); }
    // pictures over ~40 KB are shrunk first
    const av = Store.get('avatar', null); out.avatar = av;
    if (typeof av === 'string' && av.length > SYNC_AV_MAX) { if (this.avCache && this.avCache.src === av && this.avCache.small) out.avatar = this.avCache.small; else { delete out.avatar; keep('avatar'); } }
    if (out.seats && typeof out.seats === 'object') {
      const big = (x) => typeof x === 'string' && x.length > SYNC_AV_MAX;
      out.seats = { ...out.seats, ownerAv: big(out.seats.ownerAv) ? '' : out.seats.ownerAv, list: Array.isArray(out.seats.list) ? out.seats.list.map((x) => (x && big(x.av) ? { ...x, av: '' } : x)) : out.seats.list };
    }
    // key sync off: addon links that carry a key stay on this device
    if (CFG.syncKeys === false && Array.isArray(out.addons)) out.addons = out.addons.filter((u) => !keyedAddon(u));
    const cut = Date.now() - 90 * 864e5, del = {};
    SYNC_ITEMS.forEach((s) => { const e = Object.entries(m.del[s] || {}).filter(([, t]) => t > cut).sort((a, b) => b[1] - a[1]).slice(0, 800); m.del[s] = Object.fromEntries(e); if (e.length) del[s] = m.del[s]; });
    const wl = new Set((Array.isArray(out.watchlist) ? out.watchlist : []).map((x) => x && x.id));
    m.add = Object.fromEntries(Object.entries(m.add || {}).filter(([id, t]) => wl.has(id) && t > cut));
    out._sync = { v: Kdf2.isBox(out.secrets) ? SYNC_V : SYNC_V_OLD, app: typeof APP_VERSION === 'string' ? APP_VERSION : '', at, cf, del, add: m.add, ks: CFG.syncKeys !== false };
    this.composedAt = Date.now();
    return { doc: out, at, cf };
  },
  async _push(o = {}) {
    if (!this.client || !this.user || CFG.cloudSync === false || this.deleting) return;
    const uid = this.user.id;
    if (!this.loadedOnce) { await this._pull({ noPush: true, force: true, quiet: true }); if (!this.loadedOnce) return; }
    if (this.newer) { this.setSync('error', SYNC_NEWER); return; }
    if (!o.force && !this.noRow && !this.dirty().length) { if (this.sync.state !== 'ok') this.setSync('ok'); return; }
    this.setSync('syncing');
    try {
      for (let i = 0; i < 4; i++) {
        await this.prepare();
        if (!this.user || this.user.id !== uid || this.deleting) return;
        const { doc, at, cf } = this.compose(), updated_at = new Date().toISOString(), q = this.client.from(SYNC_TABLE);
        const res = this.noRow
          ? await q.insert({ user_id: uid, data: doc, updated_at }).select('updated_at')
          : await q.update({ data: doc, updated_at }).eq('user_id', uid).eq('updated_at', this.sync.at || '1970-01-01T00:00:00Z').select('updated_at');
        if (!this.user || this.user.id !== uid) return;
        if (res.error && res.error.code !== '23505') throw res.error;
        if (!res.error && Array.isArray(res.data) && res.data.length) { this.pushed(res.data[0].updated_at || updated_at, at, cf, doc); return; }
        // the row moved on (another device, or an older app): merge it first, then try again
        await this._pull({ noPush: true, force: true, quiet: true });
        if (this.newer) { this.setSync('error', SYNC_NEWER); return; }
      }
      throw new Error('Your account kept changing on another device. Try Sync now in a moment.');
    } catch (e) { this.setSync('error', this.syncError(e)); }
  },
  pushed(updatedAt, at, cf, doc) {
    const m = this.m(); Object.assign(m.rat, at); Object.assign(m.rcf, cf);
    this.sync.at = updatedAt; Store.set('syncAt', updatedAt);
    this.noRow = false; this.forceSeal = false; this.boxLocked = false; this.remoteSecrets = doc.secrets;
    this.lastPushAt = this.composedAt || Date.now(); this.lastProg = Date.now();
    this.saveMeta(); this.setSync('ok');
  },
  /* the tab is closing or going to the background: send what is pending in one request that outlives the page */
  flushNow() {
    try {
      if (!this.client || !this.user || !this.session || CFG.cloudSync === false || this.newer || this.deleting || !this.loadedOnce || this.noRow || this.busy) return;
      if (!this.dirty().length) return;
      const c = this.config(); if (!c) return;
      clearTimeout(this.pushT); this.pushT = 0;
      const uid = this.user.id, base = this.sync.at || '1970-01-01T00:00:00Z', { doc, at, cf } = this.compose(), updated_at = new Date().toISOString();
      const body = JSON.stringify({ data: doc, updated_at }), size = new TextEncoder().encode(body).length;
      fetch(`${c.url.replace(/\/+$/, '')}/rest/v1/${SYNC_TABLE}?user_id=eq.${encodeURIComponent(uid)}&updated_at=eq.${encodeURIComponent(base)}&select=updated_at`, {
        method: 'PATCH', keepalive: size < 60000, body,
        headers: { apikey: c.anonKey, Authorization: `Bearer ${this.session.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      }).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (Array.isArray(j) && j.length && this.user && this.user.id === uid && (this.sync.at || '1970-01-01T00:00:00Z') === base) this.pushed(j[0].updated_at || updated_at, at, cf, doc);
        else if (document.visibilityState === 'visible') this.schedule(true);
      }).catch(() => {});
    } catch (e) { /* best effort */ }
  },
  /* sign-out: this device keeps the library but not the keys */
  signedOut() {
    clearTimeout(this.pushT); this.pushT = 0; this.pendingPass = ''; this.loadedOnce = false; this.keyChecked = false; this.noRow = false; this.newer = false;
    this.sync.at = null; Store.set('syncAt', null); this.resetMeta(); this.dropKeys();
  },
  dropKeys() {
    let had = false; this.applying = true;
    try {
      ['vault', 'keys'].forEach((k) => {
        const v = Store.get(k, null);
        if (v && typeof v === 'object' && Object.keys(v).some((x) => x !== 'order' && x !== 'off' && v[x])) had = true;
        try { localStorage.removeItem(`mkc:${k}`); } catch (e) { /* blocked */ }
      });
      const ch = Store.get('channels', null);
      if (ch && Array.isArray(ch.lists) && ch.lists.some((l) => l && l.pass)) { had = true; Store.set('channels', { ...ch, lists: ch.lists.map((l) => ({ ...l, pass: '' })) }); }
    } finally { this.applying = false; }
    try { engine.clearCache(); Vault.cached.clear(); } catch (e) { /* not ready yet */ }
    this.keyRec = null; this.secCache = null; this.remoteSecrets = undefined; this.boxLocked = false; this.forceSeal = false;
    SyncCrypt.forget();
    if (had) toast('Your keys were removed from this device', 'info', 6000);
    return had;
  },
  /* delete account: everything that came from the account leaves this device */
  wipeAll() {
    const drop = ['watchlist', 'progress', 'watched', 'taste', 'studio', 'homeLayout', 'homeArrange', 'vault', 'keys', 'avatar', 'channels', 'lists', 'seats', 'ownerSeatName', 'ownerPin', 'ownerAv', 'addons', 'disabled', 'order', 'mfc', 'syncAt', 'syncMeta', 'syncExtra', 'syncOwner', 'syncKeyRaw', 'seat', 'seatChosen', 'trakt', 'simkl', 'anilist', 'mal', 'malAuth', 'kitsuMal'];
    this.applying = true;
    try {
      const ks = []; for (let i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i));
      ks.forEach((k) => { if (/^mkc:seat:/.test(k) || (/^mkc:/.test(k) && drop.includes(k.slice(4)))) localStorage.removeItem(k); });
    } catch (e) { /* storage blocked */ } finally { this.applying = false; }
    this.meta = null; this.keyRec = null; this.secCache = null; this.remoteSecrets = undefined;
    SyncCrypt.forget();
  },
  /* Settings › Debrid: a device that has no key for the sealed keys (restored session, older phone sign-in) asks for the password once */
  unlockHTML() {
    if (!this.needsUnlock()) return '';
    return `<div class="set-row" id="sk-row"><div><b>Unlock synced keys</b><small>Enter your password to unlock synced keys on this device.</small></div><div class="set-ctl"><input class="inp" type="password" id="sk-pass" autocomplete="current-password" placeholder="Password" aria-label="Account password" style="width:min(200px,100%)"><button class="btn btn-ghost btn-sm" type="button" id="sk-go" data-nav>Unlock</button></div></div>`;
  },
  bindUnlock() {
    const b = $('#sk-go'), p = $('#sk-pass'); if (!b || !p) return;
    const go = async () => {
      if (!p.value) { p.focus(); return; }
      b.disabled = true;
      try { toast(await this.unlock(p.value), 'ok', 6000); p.value = ''; } catch (e) { toast(e.message || String(e), 'err', 6000); }
      b.disabled = false; if (!$('#settings').hidden && typeof renderSettingsBody === 'function') renderSettingsBody();
    };
    b.onclick = go; p.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  },
  async unlock(pass) {
    if (!this.user || !this.client) throw new Error('Sign in first');
    const c = this.config(); await this.loadLib();
    const tmp = window.supabase.createClient(c.url.replace(/\/+$/, ''), c.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mkc:unlock' } });
    const { error } = await tmp.auth.signInWithPassword({ email: this.user.email || '', password: pass });
    if (error) throw new Error(/invalid/i.test(error.message || '') ? 'That password did not work' : error.message);
    tmp.auth.signOut({ scope: 'local' }).catch(() => {});
    this.pendingPass = pass; this.unlocking = true;
    try { await this.pull({ force: true, quiet: true }); } finally { this.unlocking = false; }
    return this.canWriteSecrets() ? 'Synced keys unlocked on this device' : 'Could not unlock your keys. Try again.';
  },

  /* ---- UI ---- */
  chip() {
    const b = $('#openAccount'); if (!b) return;
    if (this.user) { const n = this.name(); b.innerHTML = this.avatarHTML(); b.title = `Account: ${n}`; }
    else { b.innerHTML = '<i data-lucide="circle-user-round"></i>'; b.title = 'Account'; icons(); }
  },
  /* Profile photo: cropped to a square, shrunk to 256 px and kept in the user's own synced row, so it follows them to every device */
  avatarHTML(lg) {
    const src = Store.get('avatar', null), n = this.name();
    return src ? `<span class="avatar ph${lg ? ' lg' : ''}"><img src="${esc(src)}" alt=""></span>` : `<span class="avatar${lg ? ' lg' : ''}">${esc((n[0] || '?').toUpperCase())}</span>`;
  },
  async setAvatar(file) {
    if (!file || !/^image\//.test(file.type)) { toast('Choose an image file', 'err'); return; }
    try {
      const bmp = await createImageBitmap(file);
      const side = Math.min(bmp.width, bmp.height), c = document.createElement('canvas'); c.width = c.height = 256;
      c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
      Store.set('avatar', c.toDataURL('image/jpeg', .85)); this.render(); toast('Profile photo saved', 'ok');
    } catch (e) { toast(`Could not read that image (${e.message})`, 'err'); }
  },
  render() { this.chip(); if (!$('#settings').hidden && setSection === 'account') renderSettings(); },
  panelHTML() {
    const c = this.config();
    if (c && this.lazy && !this.client) setTimeout(() => this.ensure(), 0);
    if (!c || (!this.client && this.error && c.source === 'settings')) {
      return `<div class="acct-card">
        <h4><i data-lucide="plug"></i>Connect your Supabase project</h4>
        <p>Accounts run on your own Supabase project. In the Supabase dashboard open <b>Project Settings › API Keys</b> and copy the <b>Project URL</b> and the <b>publishable</b> (or legacy anon) key. That key is safe to put in a web app; your data is protected by Row Level Security.</p>
        ${this.error ? `<p class="acct-err">${esc(this.error)}</p>` : ''}
        <label class="fld"><span>Project URL</span><input class="inp mono" id="acc-url" placeholder="https://abcd1234.supabase.co" spellcheck="false" autocomplete="off" value="${esc((Store.get('supabase', null) || {}).url || SUPABASE_PROJECT.url || '')}"></label>
        <label class="fld"><span>Publishable (anon) key</span><input class="inp mono" id="acc-key" placeholder="sb_publishable_… or eyJhbGciOi…" spellcheck="false" autocomplete="off"></label>
        <div class="inrow"><button class="btn btn-prime" type="button" id="acc-save"><i data-lucide="link"></i>Connect</button></div>
        <p class="acct-note">Running mkcinema-server.js? Set SUPABASE_URL and SUPABASE_ANON_KEY there instead and every browser that opens it is connected.</p>
      </div>`;
    }
    const proj = esc(c.url.replace(/^https:\/\//, ''));
    if (!this.client) return `<div class="acct-card"><h4><i data-lucide="loader"></i>Connecting to ${proj}…</h4>${this.error ? `<p class="acct-err">${esc(this.error)}</p><div class="inrow"><button class="btn btn-ghost" type="button" id="acc-forget">Use a different project</button></div>` : ''}</div>`;
    if (this.user) {
      const u = this.user, st = this.sync, prov = (u.app_metadata && u.app_metadata.provider) || 'email';
      const syncLine = CFG.cloudSync === false ? 'Cloud sync is off.' : st.state === 'syncing' ? 'Syncing…' : st.state === 'error' ? `<span class="acct-err">${esc(st.error)}</span>` : st.at ? `Last synced ${esc(new Date(st.at).toLocaleString())}` : 'Not synced yet.';
      return `<div class="acct-card">
        <div class="acct-who"><button type="button" class="av-pick" id="acc-avatar" aria-label="Change profile picture">${this.avatarHTML(true)}<span class="av-edit"><i data-lucide="camera"></i></span></button><div><b>${esc(this.name())}</b><small>${esc(u.email || '')} · signed in with ${esc(prov)}</small><span class="av-acts"><button type="button" class="linkish" id="acc-avatar2">${Store.get('avatar', null) ? 'Change photo' : 'Add a profile photo'}</button>${Store.get('avatar', null) ? ' · <button type="button" class="linkish" id="acc-avatar-rm">Remove</button>' : ''}</span></div></div>
        <input type="file" id="acc-avatar-file" accept="image/*" hidden>
        <p class="acct-note">${syncLine}</p>
        ${this.needsUnlock() ? '<p class="acct-note">Synced keys are locked on this device. Unlock them in Settings › Debrid.</p>' : ''}
        ${this.recovering ? `<label class="fld"><span>New password</span><input class="inp" id="acc-newpass" type="password" autocomplete="new-password"></label><div class="inrow"><button class="btn btn-prime" type="button" id="acc-setpass">Save new password</button></div>` : ''}
        <div class="inrow"><button class="btn btn-ghost" type="button" id="acc-sync"><i data-lucide="refresh-cw"></i>Sync now</button><button class="btn btn-ghost" type="button" id="acc-out"><i data-lucide="log-out"></i>Sign out</button><button class="btn btn-ghost" type="button" id="acc-outall">Sign out everywhere</button></div>
      </div>`;
    }
    const web = this.canRedirect();
    return `<div class="acct-card">
      <h4><i data-lucide="log-in"></i>Sign in to MKCinema</h4>
      <p>Your watchlist, progress, addons and settings follow you to every device.</p>
      ${typeof TvLogin !== 'undefined' && TvLogin.isTV() ? TvLogin.html() : ''}
      <label class="fld"><span>Email</span><input class="inp" id="acc-email" type="email" autocomplete="email" placeholder="you@example.com"></label>
      <label class="fld"><span>Password</span><input class="inp" id="acc-pass" type="password" autocomplete="current-password"></label>
      <div class="inrow"><button class="btn btn-prime" type="button" id="acc-in"><i data-lucide="log-in"></i>Sign in</button>${this.signupOff ? '' : `<button class="btn btn-ghost" type="button" id="acc-up">Create account</button>`}</div>
      ${this.signupOff ? '' : `<p class="acct-legal">Creating an account means you agree to the <button type="button" class="linkish" data-nav data-legal="terms">Terms of use</button> and the <button type="button" class="linkish" data-nav data-legal="privacy">Privacy policy</button>.</p>`}
      ${web ? `<div class="inrow acct-links"><button type="button" class="linkish" id="acc-reset">Forgot password</button></div>` : ''}
      ${c.source === 'settings' ? `<p class="acct-note">Project: <span class="mono">${proj}</span> · <button type="button" class="linkish" id="acc-forget">change</button></p>` : ''}
      ${typeof TvLogin !== 'undefined' && !TvLogin.isTV() ? TvLogin.html() : ''}
    </div>`;
  },
  bind() {
    const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    const pick = () => $('#acc-avatar-file').click();
    on('#acc-avatar', pick); on('#acc-avatar2', pick); on('#acc-avatar-rm', () => { Store.set('avatar', null); this.render(); });
    const f = $('#acc-avatar-file'); if (f) f.onchange = () => { this.setAvatar(f.files[0]); f.value = ''; };
    on('#acc-save', () => this.saveProject()); on('#acc-forget', () => this.forgetProject());
    on('#acc-in', () => this.signIn()); on('#acc-up', () => this.signUp()); on('#acc-reset', () => this.reset());
    on('#acc-out', () => this.signOut()); on('#acc-outall', () => this.signOut(true)); on('#acc-sync', () => this.pull({ force: true }).then(() => this.push({ force: true }))); on('#acc-setpass', () => this.newPassword());
    const pass = $('#acc-pass'); if (pass) pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.signIn(); });
    if (typeof TvLogin !== 'undefined') TvLogin.bind();
  },
};
/* Any change to synced data is noted per section and schedules an upload */
{
  const set = Store.set.bind(Store); Store.set = (k, v) => { const lk = Store.key(k).slice(4), prev = Account.peek(lk); set(k, v); Account.touched(lk, prev); };
  const rset = Store.raw.set.bind(Store.raw); Store.raw.set = (k, v) => { const prev = Account.peek(k); rset(k, v); Account.touched(k, prev); };
  const save = saveCfg; saveCfg = () => { save(); Account.schedule(); };
  Account.markCfg();
  try { Account.extra = JSON.parse(localStorage.getItem('mkc:syncExtra') || '{}') || {}; } catch (e) { Account.extra = {}; }
  // other devices' changes arrive when the app comes back to the front, and every minute while it is on screen (not during playback)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Account.pull({ quiet: true, soon: true }); else Account.flushNow(); });
  addEventListener('focus', () => Account.pull({ quiet: true, soon: true }));
  addEventListener('pagehide', () => Account.flushNow());
  setInterval(() => { const pl = document.getElementById('player'); if (document.visibilityState === 'visible' && (!pl || pl.hidden)) Account.pull({ quiet: true, soon: true, every: 50000 }); }, 60000);
  // pausing, finishing or closing the player sends progress within seconds instead of at the next minute
  const sp = saveProgress; saveProgress = function (force) { const r = sp.apply(this, arguments); if (force) Account.soon(); return r; };
}
