
'use strict';
/* 2.62 Addons follow the account on every device.
   1. A device that joins the account (first sign-in, or another account was used here before) adds the account's
      addons to its own instead of its own list replacing the account's.
   2. Addon links that carry a key come from the sealed box even when the last device to save could not open it,
      so one locked device no longer hides or removes them for the rest of the account.
   3. A device never drops its own keyed links because of a plain list that cannot hold them.
   4. A device that cannot open the box says so once, with a button to enter the password; after that the
      account's addons arrive on their own. */
(() => {
  if (typeof Account === 'undefined' || typeof SyncCrypt === 'undefined' || !Account.merge || Account._as262) return;
  Account._as262 = true;
  const A = Account;
  const keyed = (u) => { try { const x = new URL(String(u)); return keyedAddon(u) || !!(x.search || x.username || x.password); } catch (e) { return false; } };
  const strs = (a) => (Array.isArray(a) ? a.filter((u) => typeof u === 'string') : []);
  const lockKey = (uid) => `mkc:addonLock:${uid}`;
  const lockGet = (uid) => { try { return localStorage.getItem(lockKey(uid)) === '1'; } catch (e) { return false; } };
  const lockSet = (uid, v) => { try { if (v) localStorage.setItem(lockKey(uid), '1'); else localStorage.removeItem(lockKey(uid)); } catch (e) { /* blocked */ } };
  A.addonsLocked = function () {
    return !!(this.user && CFG.cloudSync !== false && CFG.syncKeys !== false && SyncCrypt.isBox(this.remoteSecrets) && !this.canWriteSecrets());
  };

  const mg = A.merge;
  A.merge = async function (R) {
    if (!R || typeof R !== 'object' || !this.user) return mg.apply(this, arguments);
    const uid = this.user.id, m = this.m(), sy = R._sync && typeof R._sync === 'object' ? R._sync : null;
    let rebuilt = false, locked = false;
    try {
      if (CFG.syncKeys !== false && SyncCrypt.isBox(R.secrets)) {
        const rec = this.keyRec || await SyncCrypt.load(uid);
        const obj = rec ? await SyncCrypt.open(rec, R.secrets) : null, e = obj && obj.ext;
        if (e && typeof e === 'object' && Array.isArray(e.addons)) {
          const ext = strs(e.addons), plain = strs(R.addons), ps = new Set(plain);
          // the sealed list holds the keyed links; the plain list is newer for links without a key when a locked device saved last
          const list = sy && sy.sa ? ext : [...ext.filter((u) => keyed(u) || ps.has(u)), ...plain.filter((u) => !ext.includes(u))];
          R = { ...R, addons: list, _sync: { ...(sy || {}), ks: true } };
          rebuilt = true;
        } else if (!obj) locked = true;
      }
      // a plain list can never hold keyed links: keep this device's own instead of dropping them
      if (!rebuilt && sy && Array.isArray(R.addons) && !R.addons.some(keyed)) R = { ...R, _sync: { ...sy, ks: false } };
    } catch (e) { /* the row merges as before */ }
    const join = R.addons !== undefined && (!m.rat.addons || (rebuilt && lockGet(uid)));
    const before = join ? strs(Store.get('addons', [])) : null, atWas = m.at.addons;
    if (join) m.at.addons = 0; // the account's list comes in first, then this device's extras join it
    let changed = await mg.call(this, R);
    if (join) {
      if (!m.at.addons) m.at.addons = atWas;
      const cur = strs(Store.get('addons', [])), extra = before.filter((u) => !cur.includes(u));
      if (extra.length) { Store.set('addons', [...cur, ...extra]); changed = true; }
      this.saveMeta();
    }
    if (rebuilt) lockSet(uid, false); else if (locked) lockSet(uid, true);
    try { showLock(); } catch (e) { /* not ready */ }
    return changed;
  };

  // a device that cannot seal tells older apps to keep their own keyed links
  const comp = A.compose;
  A.compose = function () {
    const r = comp.apply(this, arguments), out = r && r.doc;
    if (out && !(out._sync && out._sync.sa) && Array.isArray(out.addons) && !out.addons.some(keyed) && SyncCrypt.isBox(out.secrets) && !this.canWriteSecrets()) out._sync = { ...(out._sync || {}), ks: false };
    return r;
  };

  /* ---- the note on a locked device ---- */
  const MSG = 'Addons and keys from your other devices are locked on this one. Enter your password once to bring them here.';
  const SNOOZE = 'mkc:addonLockSnooze';
  let shown = false;
  const unlockNow = () => { $$('#toasts .as-lock').forEach((x) => x.remove()); try { closeLayer('addons'); } catch (e) { /* not open */ } openSettings('debrid'); setTimeout(() => { const p = $('#sk-pass'); if (p) { try { p.scrollIntoView({ block: 'center' }); } catch (e) { /* old browser */ } p.focus(); } }, 120); };
  const showLock = () => {
    const on = A.addonsLocked();
    if (!on) { $$('.as-lock').forEach((x) => x.remove()); return; }
    if (!$('#addons').hidden) renderNote();
    let snoozed = 0; try { snoozed = +localStorage.getItem(SNOOZE) || 0; } catch (e) { snoozed = 0; }
    if (shown || Date.now() < snoozed || $('#toasts .as-lock')) return;
    shown = true;
    const box = $('#toasts'); if (!box) return;
    const el = document.createElement('div'); el.className = 'toast glass-solid t-info as-lock'; el.dataset.key = 'mkc-addon-lock'; el.setAttribute('role', 'status');
    el.innerHTML = `<i data-lucide="lock"></i><span>${esc(MSG)}</span><span class="as-b"><button class="btn btn-prime btn-sm" type="button" data-nav data-as="go">Enter password</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-as="later">Not now</button></span>`;
    box.appendChild(el); icons();
    el.querySelector('[data-as="go"]').onclick = unlockNow;
    el.querySelector('[data-as="later"]').onclick = () => { try { localStorage.setItem(SNOOZE, String(Date.now() + 3 * 864e5)); } catch (e) { /* blocked */ } el.remove(); };
    setTimeout(() => el.remove(), 20000);
  };
  const renderNote = () => {
    const list = $('#addonList'); if (!list) return;
    let n = $('#addons .as-lock');
    if (!A.addonsLocked()) { if (n) n.remove(); return; }
    if (n) return;
    n = document.createElement('div'); n.className = 'as-lock';
    n.innerHTML = `<i data-lucide="lock"></i><span>${esc(MSG)}</span><span class="as-b"><button class="btn btn-ghost btn-sm" type="button" data-nav data-as="go">Enter password</button></span>`;
    list.parentNode.insertBefore(n, list); icons();
    n.querySelector('[data-as="go"]').onclick = unlockNow;
  };
  if (typeof renderAddons === 'function') {
    const ra = renderAddons;
    renderAddons = function () { const r = ra.apply(this, arguments); try { renderNote(); } catch (e) { /* addons screen as before */ } return r; };
  }
  // unlocking or signing out clears the note
  ['unlock', 'recover', 'startFresh', 'signedOut'].forEach((k) => {
    const f = A[k]; if (typeof f !== 'function') return;
    A[k] = function () { const r = f.apply(this, arguments); Promise.resolve(r).finally(() => { try { showLock(); } catch (e) { /* not ready */ } }).catch(() => {}); return r; };
  });
})();
