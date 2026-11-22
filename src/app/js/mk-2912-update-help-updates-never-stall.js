
/* 2.91.2 Updates never stall without a way out. On top of 2.90.3 (MkUpdProg):
   - Android app 1.17.6+ says why an update failed (MkUpdProg.fail, or "err" in MKAndroid.updateProgress); the bar
     shows the reason with Try again and "Install from the browser".
   - Older apps say nothing when their update fails: if no Install has come after 2 minutes, the bar offers the same
     browser install, which uses Android's own installer and always works. */
(function () {
  const P = window.MkUpdProg; if (!P) return;
  const apk = () => ((typeof Updater !== 'undefined' && Updater.v && Updater.v.apk) || 'https://mkcinema.app/download/MKCinema.apk');
  const has = (n) => { try { return !!(window.MKAndroid && typeof MKAndroid[n] === 'function'); } catch (e) { return false; } };
  const settle = () => { try { Nav.settle(); } catch (e) { /* no remote */ } };
  const focus = (id) => { if (IS_TV) setTimeout(() => { const b = document.getElementById(id); if (b && b.isConnected) try { Nav.focus(b, true); } catch (e) { /* no remote */ } }, 60); };
  const browser = () => {
    try { window.open(apk(), '_blank', 'noopener'); } catch (e) { location.href = apk(); }
    toast('The download opens in your browser. Tap it when it is done and install over this one. Your settings stay.', 'info', 9000);
  };
  P.shown = '';
  P.fail = function (why) {
    this.stop(); why = String(why || '');
    const el = this.mount(`<div><b>The update did not finish</b><small>${why ? `Reason: ${esc(why)}.` : 'Check your connection, then try again.'} You can also install it from the browser.</small></div><div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="updGo">Try again</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="updWeb">Install from the browser</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="updLater">Later</button></div>`);
    el.classList.remove('upd-dl');
    document.getElementById('updLater').onclick = () => { el.remove(); settle(); };
    document.getElementById('updWeb').onclick = () => { el.remove(); settle(); browser(); };
    document.getElementById('updGo').onclick = () => { el.remove(); settle(); try { Updates.run('app'); } catch (e) { browser(); } };
    focus('updGo');
    try { if (typeof MKLog !== 'undefined' && why) MKLog.add('update', `update bar: ${why}`); } catch (e) { /* no log */ }
  };
  P.failed = function () { this.fail(''); };
  const tick = P.tick.bind(P);
  P.tick = function () {
    let s = null; try { s = JSON.parse(MKAndroid.updateProgress() || 'null'); } catch (e) { s = null; }
    if (s && s.err && s.a !== 2 && s.st !== 1 && s.st !== 2 && s.st !== 4) { if (this.shown !== s.err) { this.shown = s.err; return this.fail(s.err); } this.stop(); return; }
    return tick();
  };
  const show = P.show.bind(P);
  P.show = function (ver, manual) {
    this.shown = '';
    const r = show(ver, manual);
    if (!has('updateProgress')) {
      // an older app: no word comes when its update fails, so offer the browser after 2 minutes without Install
      if (this.slow) return r; // already counting for this download
      this.slow = setTimeout(() => {
        this.slow = 0;
        const bar = document.getElementById('updBar'); if (!bar || !bar.classList.contains('upd-dl')) return;
        this.stop(); bar.classList.remove('upd-dl'); bar.classList.add('upd-slow');
        const sub = document.getElementById('updSub'); if (sub) sub.textContent = 'This is taking longer than it should. Install it from the browser instead.';
        const row = bar.querySelector('.inrow');
        if (row && !document.getElementById('updWeb')) { const b = document.createElement('button'); b.className = 'btn btn-prime btn-sm'; b.type = 'button'; b.id = 'updWeb'; b.setAttribute('data-nav', ''); b.textContent = 'Install from the browser'; b.onclick = () => { bar.remove(); settle(); browser(); }; row.prepend(b); focus('updWeb'); }
      }, manual ? 75e3 : 120e3);
    }
    return r;
  };
  const ready = P.ready.bind(P);
  P.ready = function () { clearTimeout(this.slow); this.slow = 0; return ready(); };
  // a check while the update is downloading keeps the download bar instead of offering Update again
  if (typeof Updater !== 'undefined') {
    const bar = Updater.bar.bind(Updater);
    Updater.bar = function (kind, v) {
      const cur = document.getElementById('updBar');
      if (kind === 'app' && cur && cur.classList.contains('upd-dl') && v && v.android === P.ver) return;
      return bar(kind, v);
    };
  }
  // the page reloaded after an update failed (app 1.17.6+): say so once
  if (has('updateProgress')) setTimeout(() => { let s = null; try { s = JSON.parse(MKAndroid.updateProgress() || 'null'); } catch (e) { s = null; } if (s && s.err && s.a === 0 && !document.getElementById('updBar')) { P.shown = s.err; P.fail(s.err); } }, 3500);
})();
