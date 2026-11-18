
/* 2.28.4 MKCinema lives at app.mkcinema.app. mkcinema.pages.dev keeps serving the installed apps (Android, TVs, Windows,
   Mac, Linux, webOS, Samsung) and installed web apps untouched. A plain browser tab that isn't signed in moves right away,
   keeping the path and #link; a signed-in tab gets a bar (moving origin means signing in once, synced data follows).
   OAuth callbacks (MyAnimeList ?code=) are never moved. */
(function () {
  try {
    if (location.hostname !== 'mkcinema.pages.dev' || window.top !== window) return;
    var ua = navigator.userAgent;
    if (/MKCinema|; wv\)|Android TV|GoogleTV|AFT[A-Z]|SMART-TV|SmartTV|Web0S|webOS|Tizen|BRAVIA/i.test(ua)) return;
    if (window.MKAndroid || window.tizen || (window.chrome && window.chrome.webview) || (window.webkit && window.webkit.messageHandlers)) return;
    if ((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone) return;
    if (/[?&](code|state|error)=/.test(location.search)) return;
    var to = 'https://app.mkcinema.app' + location.pathname + location.search + location.hash, signed = false;
    var local = false;
    try { signed = !!localStorage.getItem('mkc:auth'); } catch (e) { signed = false; }
    // a library kept only in this browser (no account) can't follow on its own: it gets the bar and a way to save it
    try { local = ['mkc:addons', 'mkc:progress', 'mkc:watchlist', 'mkc:watched'].some(function (k) { var v = localStorage.getItem(k); return v && v.length > 4; }); } catch (e) { local = false; }
    if (!signed && !local) { location.replace(to); return; }
    var later = 0; try { later = +localStorage.getItem('mkc:movedLater') || 0; } catch (e) { later = 0; }
    if (Date.now() - later < 3 * 864e5) return;
    var show = function () {
      if (document.getElementById('mkcMove')) return;
      var b = document.createElement('div'); b.id = 'mkcMove'; b.setAttribute('role', 'status');
      b.innerHTML = (signed ? '<span>MKCinema has a new home: <b>app.mkcinema.app</b>. Sign in there once and your synced library comes with you.</span>'
        : '<span>MKCinema has a new home: <b>app.mkcinema.app</b>. Your library is saved in this browser only: save it to a file, then open that file there in Settings.</span><button type="button" class="mv-go mv-save">Save my library</button>') +
        '<a class="mv-go" href="' + to.replace(/"/g, '&quot;') + '">Open app.mkcinema.app</a><button type="button" class="mv-x" aria-label="Later">Later</button>';
      var sv = b.querySelector('.mv-save');
      if (sv) sv.onclick = function () {
        try {
          var u = URL.createObjectURL(new Blob([JSON.stringify(exportData())], { type: 'application/json' })), a = document.createElement('a');
          a.href = u; a.download = 'My library.mkcinema'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
        } catch (e) { /* the app has not finished starting */ }
      };
      b.querySelector('.mv-x').onclick = function () { try { localStorage.setItem('mkc:movedLater', String(Date.now())); } catch (e) { /* private mode */ } b.remove(); };
      document.body.appendChild(b);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 1200); }); else setTimeout(show, 1200);
  } catch (e) { /* never block the app */ }
})();
