
/* 2.7.27 Exit prompt */
const ExitAsk = {
  el: null, at: 0, key: null, armed: false,
  ua: navigator.userAgent,
  // only where Back really can leave the app: the MKCinema TV app and LG webOS
  able() { return IS_TV && (/MKCinemaAndroid|MKCinemaTV|Web0S|webOS/.test(this.ua) || (/Tizen/.test(this.ua) && !!(window.tizen && tizen.application)) || !!window.MKCinemaTizenBrew); },
  tizen() { return (/Tizen/.test(this.ua) && !!(window.tizen && tizen.application)); },
  webos() { return /Web0S|webOS/.test(this.ua); },
  canQuit() { return this.webos() || this.tizen() || !!(window.MKAndroid && typeof MKAndroid.exit === 'function'); },
  hold() {
    if (!this.able()) return;
    if (!this.key) { this.key = document.createElement('i'); this.key.className = 'tv-back-key'; this.key.setAttribute('aria-hidden', 'true'); document.body.appendChild(this.key); }
    // any other element still carrying the id (a prompt, Peak, the screensaver) gives it up; back() closes those itself
    const other = $('#remote'); if (other && other !== this.key) other.removeAttribute('id');
    this.key.id = 'remote';
  },
  release() { if (this.key && this.key.id === 'remote') this.key.removeAttribute('id'); },
  // something is on screen that Back should close first
  busy() {
    if (document.fullscreenElement) return true;
    if (!$('#player').hidden || document.body.classList.contains('layer-open')) return true;
    if (['castLayer', 'partyLayer', 'trailer', 'tour', 'stremioImport', 'palette', 'epSheet', 'askLayer', 'tastePick', 'settings', 'addons', 'detail'].some((id) => { const e = $(`#${id}`); return e && !e.hidden; })) return true;
    if (typeof EpSheet !== 'undefined' && EpSheet.isOpen()) return true;
    if ($('.focus-ask, .sup-ask')) return true;
    if (typeof Remote !== 'undefined' && Remote.hintEl) return true;
    if (typeof Saver !== 'undefined' && Saver.isOpen) return true;
    if (typeof Peak !== 'undefined' && Peak.on) return true;
    return false;
  },
  open() {
    if (this.el) return;
    this.prevFocus = document.activeElement;
    const quit = this.canQuit();
    const t = document.createElement('div'); t.className = 'exit-ask'; t.setAttribute('role', 'alertdialog'); t.setAttribute('aria-modal', 'true'); t.setAttribute('aria-labelledby', 'exitAskT');
    t.innerHTML = `<div class="xa-card"><span class="xa-mark" aria-hidden="true">MK</span><h2 id="exitAskT">Leaving MKCinema?</h2><p>Press <b>Back</b> again to exit.</p><div class="xa-row"><button class="btn xa-stay" type="button" data-xa="stay">Keep watching</button>${quit ? '<button class="btn btn-ghost xa-quit" type="button" data-xa="quit">Exit</button>' : ''}</div></div>`;
    document.body.appendChild(t); this.el = t; this.at = Date.now();
    $('[data-xa="stay"]', t).onclick = () => this.close();
    const q = $('[data-xa="quit"]', t); if (q) q.onclick = () => this.quit();
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('on')));
    Nav.focus($('[data-xa="stay"]', t));
    // a Back pressed by accident right after (a held or mashed key) only keeps the prompt; after that, Back exits
    this.armed = false; clearTimeout(this.armT); this.armT = setTimeout(() => { if (this.el === t) { this.armed = true; this.release(); } }, 700);
  },
  close() {
    const t = this.el; if (!t) return;
    this.el = null; this.armed = false; clearTimeout(this.armT); this.hold();
    t.classList.remove('on'); setTimeout(() => t.remove(), 300);
    const f = this.prevFocus; this.prevFocus = null;
    if (f && f.isConnected && f !== document.body) Nav.focus(f); else Nav.settle();
  },
  quit() {
    try { if (window.MKAndroid && typeof MKAndroid.exit === 'function') { MKAndroid.exit(); return; } } catch (e) { /* older app */ }
    try { if (window.webOSSystem && webOSSystem.close) { webOSSystem.close(); return; } } catch (e) { /* not webOS */ }
    try { if (window.tizen && tizen.application) { tizen.application.getCurrentApplication().exit(); return; } } catch (e) { /* not Samsung */ }
    window.close();
  },
  // Back from the very top: leave fullscreen, then go to Home, then ask
  root() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    const h = $('#tabs .tab'); if (h && !h.classList.contains('on')) { h.click(); Nav.settle(); return; }
    this.open();
  },
  init() {
    if (!this.able()) return;
    this.hold();
    // whoever hands out the id from now on, the key keeps it
    const hook = tvBackHook; tvBackHook = function () { hook.apply(this, arguments); ExitAsk.armed ? ExitAsk.release() : ExitAsk.hold(); };
    const prev = back;
    back = function () {
      if (ExitAsk.el) { if (ExitAsk.armed) ExitAsk.close(); return; }
      if (!ExitAsk.busy()) { ExitAsk.root(); return; }
      return prev.apply(this, arguments);
    };
    const root = Nav.root.bind(Nav);
    Nav.root = function () { return ExitAsk.el || root(); };
    // webOS sends Back as a key; while the prompt is armed it closes the app, otherwise back() runs
    if (ExitAsk.webos() || ExitAsk.tizen()) document.addEventListener('keydown', (e) => {
      if (!(e.keyCode === 461 || e.keyCode === 10009 || e.key === 'XF86Back' || e.key === 'GoBack' || e.key === 'BrowserBack')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (ExitAsk.el && ExitAsk.armed) { ExitAsk.quit(); return; }
      back();
    }, true);
    // the prompt never sits over a film the phone remote started
    setInterval(() => { if (ExitAsk.el && ExitAsk.busy()) ExitAsk.close(); }, 1000);
  },
};
ExitAsk.init();
