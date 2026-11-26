
/* 2.90.3 App updates you can see. The Android app's update used to download silently ("Update the app by itself") and
   only install minutes after you left the app, so it looked like nothing happened. Now a bar shows the download with a
   progress line, then Install as soon as it is ready. Android app 1.17.4+ reports the real progress
   (MKAndroid.updateProgress); older apps show a moving line and switch to Install when their download finishes. */
(function () {
  const has = (n) => { try { return !!(window.MKAndroid && typeof MKAndroid[n] === 'function'); } catch (e) { return false; } };
  const read = () => { try { return JSON.parse(MKAndroid.updateProgress() || 'null'); } catch (e) { return null; } };
  const mb = (b) => `${(b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0)} MB`;
  const P = {
    t: 0, ver: '', hid: '', manual: false, seen: false, at: 0,
    stop() { if (this.t) clearInterval(this.t); this.t = 0; },
    mount(html) {
      let el = document.getElementById('updBar'); if (el) el.remove();
      el = document.createElement('div'); el.id = 'updBar'; el.className = 'upd-dl'; el.setAttribute('role', 'status');
      el.innerHTML = html; document.body.appendChild(el); return el;
    },
    label() { return `${IS_TV ? 'TV app' : 'Android app'}${this.ver ? ` ${esc(this.ver)}` : ''}`; },
    /* the download has started: a bar with a progress line (real numbers on app 1.17.4+) */
    show(ver, manual) {
      this.ver = ver || this.ver; this.manual = !!manual; this.seen = false; this.at = Date.now();
      if (!manual && this.hid && this.hid === this.ver && !this.t) return;
      const live = has('updateProgress');
      const sub = live ? 'Starting the download…' : manual ? 'The installer opens when it is done.' : 'Install appears here when it is done.';
      const el = this.mount(`<div><b>Downloading ${this.label()}</b><small id="updSub">${sub}</small><span class="upd-prog${live ? '' : ' ind'}"><i id="updLine"></i></span></div><div class="inrow"><button class="btn btn-ghost btn-sm" type="button" data-nav id="updLater">Hide</button></div>`);
      document.getElementById('updLater').onclick = () => { this.hid = this.ver; el.remove(); try { Nav.settle(); } catch (e) { /* no remote */ } };
      this.stop();
      if (live) { this.t = setInterval(() => this.tick(), 700); this.tick(); }
      else if (!manual) this.t = setInterval(() => { // older app: if no "ready" comes, say how it finishes
        if (Date.now() - this.at < 4 * 60e3) return; this.stop();
        const s = document.getElementById('updSub'); if (s) s.textContent = 'It installs by itself a few minutes after you leave the app.';
      }, 15e3);
      else setTimeout(() => { const b = document.getElementById('updBar'); if (b && b.classList.contains('upd-dl') && !this.t) b.remove(); }, 90e3);
    },
    tick() {
      const s = read(); if (!s) return;
      const bar = document.getElementById('updBar');
      if (s.a === 2) return this.ready();
      if (s.st === 16) { this.stop(); return this.failed(); }
      if (s.st === 1 || s.st === 2 || s.st === 4) {
        this.seen = true; if (!bar || !bar.classList.contains('upd-dl')) return;
        const line = document.getElementById('updLine'), sub = document.getElementById('updSub');
        const f = s.t > 0 ? Math.min(1, s.d / s.t) : 0;
        if (line) line.style.transform = `scaleX(${f})`;
        if (sub) sub.textContent = s.st === 4 ? (s.why || 'Waiting for a connection…') : s.t > 0 ? `${mb(s.d)} of ${mb(s.t)} · ${Math.round(f * 100)}%` : `${mb(s.d)}`;
        return;
      }
      // gone from the download list: a hand-started update has reached the installer, or nothing has started yet
      if (this.seen || Date.now() - this.at > 20e3) { this.stop(); if (bar && bar.classList.contains('upd-dl')) bar.remove(); }
    },
    failed() {
      const el = this.mount(`<div><b>The update did not download</b><small>Check your connection, then try again.</small></div><div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="updGo">Try again</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="updLater">Later</button></div>`);
      document.getElementById('updLater').onclick = () => { el.remove(); try { Nav.settle(); } catch (e) { /* no remote */ } };
      document.getElementById('updGo').onclick = () => { el.remove(); try { Updates.run('app'); } catch (e) { toast('Open Settings › Updates to try again', 'err', 6000); } };
      if (IS_TV) setTimeout(() => { if (el.isConnected) try { Nav.focus(document.getElementById('updGo'), true); } catch (e) { /* no remote */ } }, 60);
    },
    /* downloaded and checked: Install right away (the app's own install prompt), or later when you leave the app */
    ready() {
      this.stop();
      if (!has('updateInstall')) return;
      const el = this.mount(`<div><b>${this.label()} is ready to install</b><small>${this.asked ? 'Install it now. Your settings stay.' : 'Install it now. Your settings stay. Or it installs by itself after you leave the app.'}</small><span class="upd-prog"><i style="transform:scaleX(1)"></i></span></div><div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="updGo">Install</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="updLater">Later</button></div>`);
      el.classList.remove('upd-dl');
      document.getElementById('updLater').onclick = () => { el.remove(); try { Nav.settle(); } catch (e) { /* no remote */ } };
      document.getElementById('updGo').onclick = () => {
        el.remove(); try { Nav.settle(); } catch (e) { /* no remote */ }
        let ok = false; try { ok = MKAndroid.updateInstall(); } catch (e) { ok = false; }
        toast(ok ? 'Opening the installer…' : 'The update could not install. Use Settings › Updates to update', ok ? 'info' : 'err', 6000);
      };
      if (IS_TV) setTimeout(() => { if (el.isConnected) try { Nav.focus(document.getElementById('updGo'), true); } catch (e) { /* no remote */ } }, 60);
    },
    init() {
      if (!has('updateAuto') && !has('update')) return;
      if (window.MkAutoUpd) { MkAutoUpd.ready = () => this.ready(); MkAutoUpd.ask = () => { this.asked = true; this.ready(); }; }
      if (typeof Updater !== 'undefined') {
        const bar = Updater.bar.bind(Updater);
        Updater.bar = function (kind, v) {
          const before = document.getElementById('updBar');
          const r = bar(kind, v), now = document.getElementById('updBar');
          // the "by itself" path started the download and showed nothing: show it now
          if (kind === 'app' && v && v.android && (!now || now === before)) P.show(v.android, false);
          return r;
        };
      }
      // the page reloaded while an update was downloading or waiting (app 1.17.4+)
      if (has('updateProgress')) setTimeout(() => { const s = read(); if (!s) return; if (s.a === 2) this.ready(); else if (s.st === 1 || s.st === 2 || s.st === 4) this.show(s.v || '', !s.auto); }, 3000);
    },
  };
  window.MkUpdProg = P;
  try { P.init(); } catch (e) { /* updates keep the old way */ }
})();
