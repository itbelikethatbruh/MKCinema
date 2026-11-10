
/* 2.61 live sync: devices tell each other the moment the account row changes, pending changes go up as soon as the
   network is back, and failed uploads retry on their own. The nudge travels on a private channel only the signed-in
   owner can join, and carries just the row time and a random device id: no library data, no keys. */
(() => {
  if (typeof Account === 'undefined' || Account._live261) return;
  Account._live261 = true;
  let dev = ''; try { dev = localStorage.getItem('mkc:devId') || ''; if (!dev) { dev = SyncCrypt.newSalt(); localStorage.setItem('mkc:devId', dev); } } catch (e) { dev = Math.random().toString(36).slice(2); }
  const L = { ch: null, key: '', held: false, tries: 0, retryT: 0 };
  const playing = () => { const pl = document.getElementById('player'); return !!(pl && !pl.hidden); };
  const nudged = (at) => {
    if (!Account.user || CFG.cloudSync === false || (at && at === Account.sync.at)) return;
    if (playing()) { L.held = true; return; }
    Account.pull({ quiet: true });
  };
  const drop = () => { const c = L.ch; L.ch = null; L.key = ''; if (c) { try { Account.client.removeChannel(c); } catch (e) { /* gone */ } } };
  const ensure = () => {
    const c = Account.client, u = Account.user, want = c && u && CFG.cloudSync !== false && typeof c.channel === 'function' ? `${u.id}` : '';
    if (want === L.key) return;
    drop(); if (!want) return;
    try {
      const ch = c.channel(`mkc-sync:${want}`, { config: { private: true, broadcast: { self: false } } });
      ch.on('broadcast', { event: 'row' }, (m) => { const p = m && m.payload; if (p && p.d !== dev) nudged(typeof p.at === 'string' ? p.at : ''); });
      ch.subscribe((st) => { if (st === 'SUBSCRIBED') Account.pull({ quiet: true, soon: true, every: 5000 }); });
      L.ch = ch; L.key = want;
    } catch (e) { L.ch = null; L.key = ''; }
  };
  // after every upload this device made, tell the others
  const pushed = Account.pushed;
  Account.pushed = function (updatedAt) {
    const r = pushed.apply(this, arguments);
    try { SyncClock.learn(updatedAt); } catch (e) { /* keep the old offset */ }
    try { if (L.ch) L.ch.send({ type: 'broadcast', event: 'row', payload: { at: updatedAt, d: dev } }); } catch (e) { /* the minute pull still catches it */ }
    return r;
  };
  // failed uploads retry by themselves: 5 s, 15 s, then every minute while the error lasts
  const setSync = Account.setSync;
  Account.setSync = function (state) {
    const r = setSync.apply(this, arguments);
    if (state === 'ok') { L.tries = 0; clearTimeout(L.retryT); L.retryT = 0; }
    else if (state === 'error' && !this.newer && this.user && !L.retryT) {
      const wait = [5000, 15000][L.tries] || 60000; L.tries++;
      L.retryT = setTimeout(() => { L.retryT = 0; if (navigator.onLine !== false && Account.user) Account.pull({ quiet: true, force: true }); }, wait);
    }
    return r;
  };
  addEventListener('online', () => { if (!Account.user) return; L.tries = 0; Account.pull({ quiet: true }); });
  // progress and watched marks use the account clock too, so a device whose clock runs fast cannot win every time
  const fix = (map, before) => { const off = SyncClock.off; if (!off || !map) return false; let hit = false; const now = Date.now();
    Object.keys(map).forEach((k) => { const v = map[k]; if (v && typeof v === 'object' && typeof v.at === 'number' && v.at >= before && v.at <= now) { v.at += off; hit = true; } else if (typeof v === 'number' && v >= before && v <= now) { map[k] = v + off; hit = true; } }); return hit; };
  if (typeof saveProgress === 'function') {
    const sp = saveProgress;
    saveProgress = function () { const t = Date.now(); const r = sp.apply(this, arguments); try { if (fix(S.progress, t)) Store.set('progress', S.progress); } catch (e) { /* as saved */ } return r; };
  }
  if (typeof markWatched === 'function') {
    const mw = markWatched;
    markWatched = function () { const t = Date.now(); const r = mw.apply(this, arguments); try { const w = watchedMap(); if (fix(w, t)) { Store.set('watched', w); WATCHED = null; } } catch (e) { /* as saved */ } return r; };
  }
  // keys only ever leave this device sealed: a readable keys box is never passed back up, and a device that cannot
  // seal keeps addon links that carry a key to itself (ks:false tells other devices to keep their own)
  const comp = Account.compose;
  Account.compose = function () {
    const r = comp.apply(this, arguments), out = r && r.doc; if (!out) return r;
    if (out.secrets !== undefined && !SyncCrypt.isBox(out.secrets)) delete out.secrets;
    if (!SyncCrypt.isBox(out.secrets) || !(out._sync && out._sync.sa)) {
      const keyed = (u) => { try { const x = new URL(String(u)); return keyedAddon(u) || !!(x.search || x.username || x.password); } catch (e) { return false; } };
      if (Array.isArray(out.addons) && out.addons.some(keyed)) { out.addons = out.addons.filter((u) => !keyed(u)); out._sync = { ...(out._sync || {}), ks: false }; }
    }
    return r;
  };
  setInterval(() => { ensure(); if (L.held && !playing()) { L.held = false; nudged(''); } }, 3000);
  ensure();
})();
