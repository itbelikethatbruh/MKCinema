#!/usr/bin/env python3
"""2.7.27 Exit prompt: on the Android TV / Fire TV app and LG webOS, Back with nothing left to close asks
"Leaving MKCinema?" instead of quitting (or doing nothing). Works with the installed TV app 1.2.1, no reinstall:
the app hands Back to the page while an element with id="remote" exists, so a hidden key element holds that id
at all times, and lets go of it only while the prompt is up, so the next Back falls through and the app exits.
Adds one <script> and one <style> before </body> and bumps the version. Idempotent. Usage: python3 this.py index.html [sw.js]"""
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
MARK = '/* 2.7.27 Exit prompt */'
JS = r'''
const ExitAsk = {
  el: null, at: 0, key: null, armed: false,
  ua: navigator.userAgent,
  // only where Back really can leave the app: the MKCinema TV app and LG webOS
  able() { return IS_TV && /MKCinemaAndroid|MKCinemaTV|Web0S|webOS/.test(this.ua); },
  webos() { return /Web0S|webOS/.test(this.ua); },
  canQuit() { return this.webos() || !!(window.MKAndroid && typeof MKAndroid.exit === 'function'); },
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
    window.close();
  },
  // Back from the very top: leave fullscreen, then go to Home, then ask
  root() {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    const h = $('#tabs .tab'); if (h && !h.classList.contains('on')) { h.click(); return; }
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
    if (ExitAsk.webos()) document.addEventListener('keydown', (e) => {
      if (!(e.keyCode === 461 || e.key === 'GoBack' || e.key === 'BrowserBack')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (ExitAsk.el && ExitAsk.armed) { ExitAsk.quit(); return; }
      back();
    }, true);
    // the prompt never sits over a film the phone remote started
    setInterval(() => { if (ExitAsk.el && ExitAsk.busy()) ExitAsk.close(); }, 1000);
  },
};
ExitAsk.init();
'''
CSS = r'''
.tv-back-key{display:none!important}
.exit-ask{position:fixed;inset:0;z-index:95;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 50% 45%,rgba(8,9,12,.82),rgba(0,0,0,.94) 70%);opacity:0;transition:opacity .28s var(--ease,ease)}
.exit-ask.on{opacity:1}
.exit-ask .xa-card{position:relative;width:min(520px,100%);display:grid;justify-items:center;gap:10px;padding:40px 40px 34px;border-radius:22px;text-align:center;color:#ececee;background:linear-gradient(160deg,#17181c,#0b0b0d 70%);border:1px solid rgba(255,255,255,.1);box-shadow:0 40px 90px -30px #000,inset 0 1px 0 rgba(255,255,255,.06);transform:translateY(14px) scale(.97);opacity:0;transition:transform .34s var(--ease,ease),opacity .3s}
.exit-ask.on .xa-card{transform:none;opacity:1}
.exit-ask .xa-mark{font-family:var(--f-serif,Georgia,serif);font-size:26px;letter-spacing:.06em;background:linear-gradient(120deg,#f4f4f5,#a1a1aa 55%,#e4e4e7);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:4px}
.exit-ask h2{margin:0;font-family:var(--f-display);font-size:28px;font-weight:600;letter-spacing:-.01em;color:#f4f4f5}
.exit-ask p{margin:0;color:#a1a1aa;font-size:16px}
.exit-ask p b{color:#e4e4e7;font-weight:600}
.exit-ask .xa-row{display:flex;gap:12px;margin-top:18px;flex-wrap:wrap;justify-content:center}
.exit-ask .btn{height:52px;padding-inline:28px;font-size:16px;border-radius:14px}
.exit-ask .xa-stay{color:#0b0b0d;background:linear-gradient(120deg,#fafafa,#d4d4d8);border:0}
.exit-ask .xa-quit{color:#e4e4e7;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16)}
'''
if MARK in s:
    print('Exit prompt already applied')
else:
    end = '</body>\n</html>'
    assert s.count(end) == 1, 'end of document not found'
    s = s.replace(end, '<script>\n' + MARK + JS + '</script>\n<style>\n/* ===== 2.7.27 Exit prompt ===== */' + CSS + '</style>\n' + end)
    s = s.replace("const APP_VERSION = '2.7.26';", "const APP_VERSION = '2.7.27';")
    open(p, 'w', encoding='utf-8').write(s); print('applied Exit prompt')
if len(sys.argv) > 2:
    w = open(sys.argv[2], encoding='utf-8').read().replace("mkc-2.7.26", "mkc-2.7.27")
    open(sys.argv[2], 'w', encoding='utf-8').write(w)
