
/* 2.91.3 Android's install screen opens by itself. Apps installed from the browser (almost every MKCinema phone and
   TV) are not their own installer, so Android never lets them install an update silently: "installs by itself after
   you leave the app" could never happen there, and the update just waited. Now, as soon as the update has downloaded
   and the app is on screen (no film playing), the page opens Android's install screen (MKAndroid.updateInstall,
   in every app since 1.13), so the only step left is Android's own Update button. Once per version per visit;
   Install on the bar still works after a Cancel. */
(function () {
  const P = window.MkUpdProg; if (!P) return;
  const has = (n) => { try { return !!(window.MKAndroid && typeof MKAndroid[n] === 'function'); } catch (e) { return false; } };
  if (!has('updateInstall')) return;
  const playing = () => { const p = document.getElementById('player'); return !!(p && !p.hidden); };
  const say = (txt) => { const el = document.getElementById('updBar'), sm = el && el.querySelector('small'); if (sm) sm.textContent = txt; };
  P.opened = '';
  P.soon = function () {
    clearTimeout(this.w);
    const key = this.ver || 'app';
    if (this.opened === key) return;
    const go = () => {
      if (!document.getElementById('updBar')) return; // Install or Later was tapped
      if (document.hidden || playing()) { this.w = setTimeout(go, 5000); return; } // never during a film
      this.opened = key;
      let ok = false; try { ok = MKAndroid.updateInstall(); } catch (e) { ok = false; }
      if (ok) say('Tap Update on the next screen to finish. Your settings stay.');
      try { if (typeof MKLog !== 'undefined') MKLog.add('update', `install screen opened by itself: ${ok}`); } catch (e) { /* no log */ }
    };
    this.w = setTimeout(go, 1500);
  };
  const ready = P.ready.bind(P);
  P.ready = function () {
    const r = ready();
    if (document.getElementById('updBar')) { say('Tap Install, then Update on the next screen. Your settings stay.'); this.soon(); }
    return r;
  };
  if (window.MkAutoUpd && typeof MkAutoUpd.ask === 'function') {
    const ask = MkAutoUpd.ask.bind(MkAutoUpd);
    MkAutoUpd.ask = function () { const r = ask(); if (document.getElementById('updBar')) P.soon(); return r; };
  }
})();
