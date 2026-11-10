
/* 2.46.6: addon links that carry a key, and TV playlist logins, sync inside the sealed keys box with the debrid keys.
   The plain row keeps only links without a key and playlists without logins; _sync.ks=false tells 2.46 and older apps
   to keep their own copies (as they already do for "Sync keys" off), and _sync.sa=1 tells this version to rebuild the
   full lists from the sealed box. A device that cannot seal (no password key, locked) keeps sending the full lists. */
(() => {
  if (typeof Account === 'undefined' || !Account.compose || Account._rel2466) return;
  Account._rel2466 = true;
  const keyed = (u) => { try { const x = new URL(String(u)); return keyedAddon(u) || !!(x.search || x.username || x.password); } catch (e) { return false; } };
  const credUrl = (u) => /[?@]/.test(String(u || ''));
  const ext = () => {
    const addons = (Store.get('addons', []) || []).filter((u) => typeof u === 'string'), chan = {};
    let lists = []; try { lists = (typeof Channels !== 'undefined' ? Channels.get().lists : []) || []; } catch (e) { lists = []; }
    lists.forEach((l) => { if (!l || !l.id) return; const c = {}; if (l.user) c.user = l.user; if (l.pass) c.pass = l.pass; if (credUrl(l.url)) c.url = l.url; if (credUrl(l.epg)) c.epg = l.epg; if (Object.keys(c).length) chan[l.id] = c; });
    return { addons, chan };
  };
  const prep = Account.prepare;
  Account.prepare = async function () {
    await prep.apply(this, arguments);
    const sc = this.secCache, uid = this.user && this.user.id;
    if (CFG.syncKeys === false || !this.canWriteSecrets() || !sc || sc.uid !== uid || !this.keyRec || sc.salt !== this.keyRec.salt) return;
    const e = ext(), ej = JSON.stringify(e);
    if (sc.ext === ej && sc.extBox) { sc.box = sc.extBox; return; }
    let obj; try { obj = JSON.parse(sc.plain); } catch (er) { return; }
    obj.ext = e; sc.box = sc.extBox = await SyncCrypt.seal(this.keyRec, obj); sc.ext = ej;
  };
  const comp = Account.compose;
  Account.compose = function () {
    const r = comp.apply(this, arguments), out = r.doc, sc = this.secCache;
    if (!out || !sc || !sc.extBox || out.secrets !== sc.extBox || sc.ext !== JSON.stringify(ext())) return r;
    if (Array.isArray(out.addons)) out.addons = out.addons.filter((u) => !keyed(u));
    if (out.channels && Array.isArray(out.channels.lists)) out.channels = { ...out.channels, lists: out.channels.lists.map((l) => (l && typeof l === 'object' ? { ...l, user: '', pass: '', url: credUrl(l.url) ? '' : l.url || '', epg: credUrl(l.epg) ? '' : l.epg || '' } : l)) };
    out._sync = { ...(out._sync || {}), ks: false, sa: 1 };
    return r;
  };
  const mg = Account.merge;
  Account.merge = async function (R) {
    try {
      const sy = R && R._sync;
      if (sy && sy.sa && CFG.syncKeys !== false && SyncCrypt.isBox(R.secrets)) {
        const rec = this.keyRec || (this.user ? await SyncCrypt.load(this.user.id) : null);
        const obj = await SyncCrypt.open(rec, R.secrets), e = obj && obj.ext;
        if (e && typeof e === 'object') {
          R = { ...R };
          if (Array.isArray(e.addons)) { R.addons = e.addons.filter((u) => typeof u === 'string'); R._sync = { ...sy, ks: true }; }
          const ch = e.chan && typeof e.chan === 'object' ? e.chan : null;
          if (ch && R.channels && Array.isArray(R.channels.lists)) R.channels = { ...R.channels, lists: R.channels.lists.map((l) => { const c = l && ch[l.id]; if (!c || typeof c !== 'object') return l; const o = { ...l }; ['user', 'pass', 'url', 'epg'].forEach((k) => { if (typeof c[k] === 'string' && c[k]) o[k] = c[k]; }); return o; }) };
        }
      }
    } catch (e) { /* the plain row merges as before */ }
    return mg.call(this, R);
  };
})();
