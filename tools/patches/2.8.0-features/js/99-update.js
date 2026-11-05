/* ---------------- 2.9.0 Update prompt ----------------
   version.json (deployed next to the app) names the newest web app and Android app. A screen left open for days, like a
   TV, checks it every half hour and when it comes back into view. A newer web app shows a quiet bar with Refresh; an
   older Android or TV app shows Update, which downloads and opens the installer from app 1.2.5 on, and explains the
   Downloader code on older apps. Each version is offered once unless you tap Later. */
const Updater = {
  EVERY: 30 * 60e3, last: 0,
  newer(a, b) { const x = String(a || '').split('.').map(Number), y = String(b || '').split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; },
  appVer() { try { return window.MKAndroid && typeof MKAndroid.version === 'function' ? MKAndroid.version() : ''; } catch (e) { return ''; } },
  async check(force) {
    if (!force && Date.now() - this.last < this.EVERY) return; this.last = Date.now();
    if (!/^https?:$/.test(location.protocol)) return;
    let v; try { const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) return; v = await r.json(); } catch (e) { return; }
    if (v.web && this.newer(v.web, APP_VERSION) && Store.raw.get('updSkip', '') !== `web:${v.web}`) return this.bar('web', v);
    const app = this.appVer();
    if (app && v.android && this.newer(v.android, app) && Store.raw.get('updSkip', '') !== `app:${v.android}`) return this.bar('app', v);
  },
  bar(kind, v) {
    let el = $('#updBar'); if (el) el.remove();
    const tvApp = IS_TV, canSelf = (() => { try { return typeof MKAndroid.update === 'function'; } catch (e) { return false; } })();
    const msg = kind === 'web' ? `MKCinema ${esc(v.web)} is ready` : `${tvApp ? 'TV app' : 'Android app'} ${esc(v.android)} is ready`;
    const sub = kind === 'web' ? 'Refresh to get the newest version.' : canSelf ? 'Download it and install over this one. Your settings stay.' : tvApp ? 'Open Downloader on your TV and enter mkctv.pages.dev, then install over this one.' : 'Download it and install over this one. Your settings stay.';
    el = document.createElement('div'); el.id = 'updBar'; el.setAttribute('role', 'status');
    el.innerHTML = `<div><b>${msg}</b><small>${sub}</small></div><div class="inrow">${kind === 'app' && !canSelf && tvApp ? '' : `<button class="btn btn-prime btn-sm" type="button" data-nav id="updGo">${kind === 'web' ? 'Refresh' : 'Update'}</button>`}<button class="btn btn-ghost btn-sm" type="button" data-nav id="updLater">Later</button></div>`;
    document.body.appendChild(el);
    // TV: the bar sits outside the page the remote moves in, so it takes the remote while it shows (see init)
    if (IS_TV) setTimeout(() => { if (el.isConnected && $('#player').hidden && !document.body.classList.contains('layer-open')) { const f = $('#updGo') || $('#updLater'); if (f) Nav.focus(f, true); } }, 60);
    $('#updLater').onclick = () => { Store.raw.set('updSkip', kind === 'web' ? `web:${v.web}` : `app:${v.android}`); el.remove(); Nav.settle && Nav.settle(); };
    const go = $('#updGo');
    if (go) go.onclick = () => {
      if (kind === 'web') { location.reload(); return; }
      const url = v.apk || 'https://mkcinema-site.pages.dev/download/MKCinema.apk';
      if (canSelf) { let ok = false; try { ok = MKAndroid.update(url); } catch (e) { ok = false; } toast(ok ? 'Downloading the update… the installer opens when it is done' : 'The download could not start', ok ? 'info' : 'err', 6000); if (ok) { el.remove(); Nav.settle(); } return; }
      window.open(url, '_blank', 'noopener');
    };
  },
  init() {
    // TV: while the bar shows on a page with no panel open, the remote moves inside it (Update, Later) and Back puts it away
    const onTvBar = () => { const el = IS_TV && $('#updBar'); return el && $('#player').hidden && !document.body.classList.contains('layer-open') ? el : null; };
    const root = Nav.root.bind(Nav); Nav.root = function (...a) { return onTvBar() || root(...a); };
    const pb = back; back = function (...a) { const el = onTvBar(); if (el) { el.remove(); Nav.settle(); return; } return pb.apply(this, a); };
    setTimeout(() => this.check(true), 20000);
    setInterval(() => this.check(), this.EVERY);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
  },
};
Updater.init();

