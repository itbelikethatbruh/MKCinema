
/* 2.91.4 An update downloads once. The Android app remembers a finished update download only in memory, so when
   Android closed the app in the background (Fire TV sticks do this all the time), or the install screen was closed,
   the next check downloaded the whole update again, and again. The checked copy is still on the device, so the page
   now remembers which version finished downloading and opens the installer on that copy (MKAndroid.updateInstall,
   every app since 1.13) instead of downloading it again. Only if that copy is gone does it download. */
(function () {
  const P = window.MkUpdProg; if (!P || typeof Updater === 'undefined') return;
  const has = (n) => { try { return !!(window.MKAndroid && typeof MKAndroid[n] === 'function'); } catch (e) { return false; } };
  if (!has('updateInstall')) return;
  const KEY = 'mkc:updGot';
  const get = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  const set = (v) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* private mode */ } };
  const playing = () => { const p = document.getElementById('player'); return !!(p && !p.hidden); };
  // installed already: forget it
  const have = Updater.appVer(), got = get();
  if (got && have && !Updater.newer(got, have)) set('');
  // a download finished and passed the app's check: remember its version
  const ready = P.ready.bind(P);
  P.ready = function () { const v = this.ver || ((Updater.v || {}).android) || ''; if (v) set(v); return ready(); };
  const bar = Updater.bar.bind(Updater);
  Updater.bar = function (kind, v) {
    const want = v && v.android, app = Updater.appVer();
    if (kind === 'app' && want && get() === want && app && Updater.newer(want, app)) {
      if (document.hidden || playing()) return; // the next check (on return, or after the film) opens it
      if (P.opened === want) { P.ver = want; return P.ready(); } // asked once this visit: just show Install
      let ok = false; try { ok = MKAndroid.updateInstall(); } catch (e) { ok = false; }
      try { if (typeof MKLog !== 'undefined') MKLog.add('update', `reused the downloaded ${want}: ${ok}`); } catch (e) { /* no log */ }
      if (ok) { P.ver = want; P.opened = want; return P.ready(); }
      set(''); // the copy is gone: download it again below
    }
    return bar(kind, v);
  };
})();
