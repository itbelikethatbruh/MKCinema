#!/usr/bin/env python3
"""2.13.1 phone Back: system Back closes what is open, then goes to the previous screen, then asks before leaving.
Idempotent: inserts the BackNav script once, after Desktop.init(). Usage: python3 -I back-nav-2.13.1.py index.html"""
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
if 'const BackNav = {' in s:
    print('already applied'); sys.exit(0)
BLOCK = r"""
/* ---------------- 2.13.1 Phone Back button ----------------
   Android's Back (the Android app, Chrome and the installed web app) walks the page's history. The app used to keep a
   single history entry, so Back left MKCinema at once. Now each tap keeps a few spare entries, and Back spends one:
   it closes whatever is open first (the same back() the Esc key uses), then returns to the previous screen, and at the
   start screen it asks for a second press before leaving. TVs keep their own Back handling and are left alone. */
const BackNav = {
  DEPTH: 5, views: [], popping: false, skip: false, armT: 0,
  idx() { const s = history.state; return s && typeof s.mkb === 'number' ? s.mkb : 0; },
  // one entry per tap: Chrome lets Back land on entries the page added while the user was interacting with it
  topUp() { const i = this.idx(); if (i >= this.DEPTH) return; try { history.pushState({ mkb: i + 1 }, '', location.href); } catch (e) { /* sandboxed */ } },
  rootView() { const t = $('#tabs .tab'); return (t && t.dataset.view) || 'home'; },
  // did back() close or change anything? Watch the DOM while it runs.
  closeTop() {
    const mo = new MutationObserver(() => {}); mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'open'] });
    try { back(); } catch (e) { /* keep going */ }
    const changed = mo.takeRecords().length > 0; mo.disconnect();
    return changed;
  },
  prevScreen() {
    while (this.views.length) {
      const v = this.views.pop(); if (v.view === S.view) continue;
      this.popping = true; try { go(v.view, v.opts); } finally { this.popping = false; }
      const y = v.y; if (y > 0) setTimeout(() => scrollTo({ top: y, behavior: 'instant' in document.documentElement.style ? 'instant' : 'auto' }), 80);
      return true;
    }
    if (S.view !== this.rootView()) { this.popping = true; try { go(this.rootView()); } finally { this.popping = false; } return true; }
    return false;
  },
  onPop() {
    if (this.skip) { this.skip = false; return; }
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (this.closeTop() || this.prevScreen()) return;
    // the start screen with nothing open: step down to the first entry, so the next Back leaves the app
    const i = this.idx(); if (i > 0) { this.skip = true; history.go(-i); }
    toast('Press Back again to exit', 'info', 2200, 'backexit');
    clearTimeout(this.armT);
    // the Android app's Back only sees history, so put one entry back if they stay
    if (/MKCinemaAndroid/.test(navigator.userAgent)) this.armT = setTimeout(() => { if (!this.idx()) this.topUp(); }, 2400);
  },
  init() {
    if (IS_TV) return;
    // views remember where they came from; the start screen starts a fresh trail
    const g0 = go;
    go = function (view, opts) {
      if (!BackNav.popping && S.view && S.view !== view) {
        if (view === BackNav.rootView()) BackNav.views = [];
        else { BackNav.views.push({ view: S.view, opts: S.view === 'movie' || S.view === 'series' ? S.discoverOpts || {} : {}, y: scrollY }); if (BackNav.views.length > 30) BackNav.views.shift(); }
      }
      if (view === 'movie' || view === 'series') S.discoverOpts = opts || {};
      return g0.apply(this, arguments);
    };
    // other code resets the address with replaceState(null, …); keep the entry's place in the trail
    const rs = history.replaceState.bind(history);
    history.replaceState = function (state, t, u) { const i = BackNav.idx(); if (state == null && i) state = { mkb: i }; return rs(state, t, u); };
    const tap = () => { clearTimeout(BackNav.armT); BackNav.topUp(); };
    addEventListener('pointerup', tap, true); addEventListener('keydown', tap, true);
    addEventListener('popstate', () => this.onPop());
  },
};
BackNav.init();
"""
anchor = 'Desktop.init();\n'
assert s.count(anchor) == 1, 'anchor not found once'
s = s.replace(anchor, anchor + BLOCK, 1)
open(p, 'w', encoding='utf-8').write(s)
print('applied')
