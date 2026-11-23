
/* 2.93.2 A stuck update download never just sits at 0. Android's own downloader (DownloadManager, used by every app
   up to 1.17.9) can stay queued at 0 bytes forever on some phones (owner's phone 2026-11-23, app 1.17.8 -> 1.17.9).
   If nothing has arrived after 25 seconds, or it waits for a connection for a minute, the bar says so and offers the
   browser install (Android's own installer, always works) or Try again. Android 1.17.10+ downloads by itself instead. */
(function () {
  const P = window.MkUpdProg; if (!P) return;
  const apk = () => ((typeof Updater !== 'undefined' && Updater.v && Updater.v.apk) || 'https://mkcinema.app/download/MKCinema.apk');
  const settle = () => { try { Nav.settle(); } catch (e) { /* no remote */ } };
  const read = () => { try { return JSON.parse(MKAndroid.updateProgress() || 'null'); } catch (e) { return null; } };
  P.zeroAt = 0; P.waitAt = 0; P.stuckShown = '';
  P.stuck = function (waiting) {
    this.stop(); this.stuckShown = this.ver || 'app';
    const el = this.mount(`<div><b>The download did not start</b><small>${waiting ? 'Android is still waiting for a connection.' : 'Android’s downloader is not moving on this phone.'} Install it from the browser instead. It takes one tap.</small></div><div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="updWeb">Install from the browser</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="updGo">Try again</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="updLater">Later</button></div>`);
    el.classList.remove('upd-dl');
    document.getElementById('updLater').onclick = () => { el.remove(); settle(); };
    document.getElementById('updWeb').onclick = () => {
      el.remove(); settle();
      try { window.open(apk(), '_blank', 'noopener'); } catch (e) { location.href = apk(); }
      toast('The download opens in your browser. Tap it when it is done and install over this one. Your settings stay.', 'info', 9000);
    };
    document.getElementById('updGo').onclick = () => { el.remove(); settle(); this.stuckShown = ''; try { Updates.run('app'); } catch (e) { /* Settings › Updates */ } };
    if (IS_TV) setTimeout(() => { const b = document.getElementById('updWeb'); if (b && b.isConnected) try { Nav.focus(b, true); } catch (e) { /* no remote */ } }, 60);
    try { if (typeof MKLog !== 'undefined') MKLog.add('update', `download stuck: ${waiting ? 'waiting for a connection' : '0 bytes'}`); } catch (e) { /* no log */ }
  };
  const show = P.show.bind(P);
  P.show = function (ver, manual) { this.zeroAt = 0; this.waitAt = 0; return show(ver, manual); };
  const tick = P.tick.bind(P);
  P.tick = function () {
    const s = read();
    if (s && this.stuckShown !== (this.ver || 'app')) {
      const now = Date.now();
      if ((s.st === 1 || s.st === 2) && !(s.d > 0)) { this.zeroAt = this.zeroAt || now; if (now - this.zeroAt > 25e3) return this.stuck(false); } else this.zeroAt = 0;
      if (s.st === 4) { this.waitAt = this.waitAt || now; if (now - this.waitAt > 60e3) return this.stuck(true); } else this.waitAt = 0;
    }
    return tick();
  };
})();
