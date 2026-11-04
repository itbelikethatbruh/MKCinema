# MKCinema 2.7.17 (Drake, 2026-10-31): the Smart TV app should be easy to follow with a remote, run smoothly at High
# without dropping to Low, and voice search should work.
# - TV mode (html.tv) is decided by the page itself (UA MKCinemaTV / Android TV / Fire TV / webOS ...), not only by the
#   Android wrapper's late injection, so the first paint is already the TV layout.
# - TVs get the flat, unblurred surfaces phones get (no backdrop-filter, no IMAX wall) and no ambilight canvas.
#   Focus motion is transform/opacity only. Continuous decorative animations are off. High stays High: the frame-time
#   governor never drops a TV to Low, and a TV it already dropped is put back to High once.
# - D-pad: a bold platinum focus ring + lift, a sensible first focus (Smart Play), focus memory per panel and per row,
#   focus restored when a panel closes, arrows leave text boxes, and the player's controls are reachable
#   (Up/Down into the controls, Left/Right seek when no control is focused, OK plays/pauses, Back leaves the controls).
# - Voice: uses the Android app's native speech bridge (window.MKAndroid, app 1.2) when present.
# Usage: python3 2.7.17-tv-smooth.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:90])
    s = s.replace(a, b)

# ---------- TV detection, early
rep("""const NO_HOVER = matchMedia('(hover: none)');""",
    """const NO_HOVER = matchMedia('(hover: none)');
/* Smart TVs (the MKCinema Android TV / Fire TV app, LG webOS, TV browsers): a D-pad remote, sofa distance and a slow GPU */
const IS_TV = document.documentElement.classList.contains('tv') || /MKCinemaTV|Android TV|GoogleTV|AFT[A-Z]|SMART-TV|SmartTV|Web0S|webOS|Tizen|BRAVIA/i.test(navigator.userAgent);
if (IS_TV) document.documentElement.classList.add('tv');""")
rep("""const TOUCH_UI = matchMedia('(pointer: coarse)').matches || NO_HOVER.matches;""",
    """const TOUCH_UI = IS_TV || matchMedia('(pointer: coarse)').matches || NO_HOVER.matches;""")
rep("""    ${TOUCH_UI ? '<button type="button" data-lock><i data-lucide="lock"></i>Lock controls</button>' : ''}""",
    """    ${TOUCH_UI && !IS_TV ? '<button type="button" data-lock><i data-lucide="lock"></i>Lock controls</button>' : ''}""")
rep("""${TOUCH_UI ? ' This device always uses solid panels, because Chrome on Android can black out parts of the screen under glass.' : ''}""",
    """${IS_TV ? ' TVs always use solid panels, which keeps the remote smooth at High.' : TOUCH_UI ? ' This device always uses solid panels, because Chrome on Android can black out parts of the screen under glass.' : ''}""")
# No ambilight canvas on a TV: it samples every video frame and a full-screen TV picture has no bars to light
rep("""amb: CFG.ambilight, subs: []""", """amb: CFG.ambilight && !IS_TV, subs: []""")

# ---------- Governor: a TV keeps High
rep("""  init() {
    if (!CFG.governor) return;""",
    """  init() {
    // TVs: the TV layout is built to hold High, so never auto-drop. A TV the governor already dropped goes back to High once.
    if (IS_TV) { if (!Store.get('tvHigh', false)) { Store.set('tvHigh', true); if (CFG.quality === 'low') { CFG.quality = applyPreset('high'); saveCfg(); applyAll(); } } return; }
    if (!CFG.governor) return;""")

# ---------- D-pad navigation
rep("""  focus(el) {
    $$('.nav-focus').forEach((x) => x.classList.remove('nav-focus'));
    el.classList.add('nav-focus'); el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
   
  },
  move(dir) {
    const root = this.root(); const list = this.items(root); if (!list.length) return;
    const cur = root.contains(document.activeElement) && document.activeElement !== document.body ? document.activeElement : null;
    if (!cur) { this.focus(list[0]); return; }""",
    """  mem: new WeakMap(), auto: null, settleT: 0,
  focus(el, fast) {
    $$('.nav-focus').forEach((x) => x.classList.remove('nav-focus'));
    el.classList.add('nav-focus'); el.focus({ preventScroll: true });
    this.mem.set(this.root(), el); const rail = el.closest('.rail'); if (rail) rail._navLast = el;
    if (!IS_TV) { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); return; }
    // TV: holding a direction scrolls instantly (smooth scrolls would queue up), the focused row sits mid-screen,
    // and the billboard comes fully back into view when you return to it
    const behavior = fast ? 'auto' : 'smooth';
    if (el.closest('#hero') && this.root().id === 'app') { scrollTo({ top: 0, behavior }); return; }
    if (el.closest('.dock-wrap, #hud')) return;
    el.scrollIntoView({ block: rail ? 'center' : 'nearest', inline: 'nearest', behavior });
  },
  /* where the remote lands when nothing in the open panel has focus yet */
  start(root, list) {
    if (root.id === 'hud') return list.find((el) => el.id === 'pPlay') || list[0];
    if (root.id === 'app') return list.find((el) => el.id === 'heroPlay') || list.find((el) => el.matches('.card')) || list.find((el) => !el.closest('.dock-wrap')) || list[0];
    return list.find((el) => el.matches('.btn-prime')) || list.find((el) => !/close|back/i.test(`${el.getAttribute('aria-label') || ''} ${el.className}`)) || list[0];
  },
  restore(fast = true) {
    const root = this.root(), list = this.items(root); if (!list.length) return false;
    let el = this.mem.get(root); if (!el || !el.isConnected || !list.includes(el)) el = this.start(root, list);
    this.focus(el, fast); return el;
  },
  /* TV: after a panel opens or closes, put the focus somewhere visible (the last item used there, or its main button) */
  settle() {
    if (!IS_TV) return; clearTimeout(this.settleT);
    const run = (again) => {
      if (!$('#player').hidden) return;
      const root = this.root(), a = document.activeElement, inside = a && a !== document.body && root.contains(a) && !a.closest('[hidden]');
      if (inside && !(again && a === this.auto)) return;
      this.auto = this.restore(true) || null;
      if (!again) this.settleT = setTimeout(() => run(true), 650);
    };
    this.settleT = setTimeout(() => run(false), 140);
  },
  move(dir, fast) {
    const root = this.root(); const list = this.items(root); if (!list.length) return;
    const cur = root.contains(document.activeElement) && document.activeElement !== document.body ? document.activeElement : null;
    if (!cur) { if (IS_TV) this.restore(fast); else this.focus(list[0]); return; }""")
rep("""      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) this.focus(best);
  },""",
    """      // TV: the dock floats over the page, so from the page it is only picked when nothing else lies that way
      if (IS_TV && root.id === 'app' && el.closest('.dock-wrap') && !cur.closest('.dock-wrap')) { if (1e6 + score < bestScore) { bestScore = 1e6 + score; best = el; } continue; }
      if (score < bestScore) { bestScore = score; best = el; }
    }
    // Moving up or down into another row returns to the poster you last had in it, if it is still on screen
    if (best && (dir === 'up' || dir === 'down')) {
      const rail = best.closest('.rail'), last = rail && rail !== cur.closest('.rail') && rail._navLast;
      if (last && last.isConnected && list.includes(last)) { const r = last.getBoundingClientRect(); if (r.right > 0 && r.left < innerWidth) best = last; }
    }
    if (best) this.focus(best, fast);
  },""")
# panels opening / closing settle the focus on a TV
rep("""  if (open) layerT = setTimeout(() => b.toggle('layer-open', [...MENU_LAYERS, 'player'].some((x) => !$(`#${x}`).hidden)), 320); else b.remove('layer-open');
}""",
    """  if (open) layerT = setTimeout(() => b.toggle('layer-open', [...MENU_LAYERS, 'player'].some((x) => !$(`#${x}`).hidden)), 320); else b.remove('layer-open');
  if (IS_TV && typeof Nav !== 'undefined') Nav.settle();
}""")
# Back on a TV in the player: leave the controls first
rep("""    if ($('.drawer.open', $('#player'))) { closeDrawers(); return; }
    closePlayer(); return;""",
    """    if ($('.drawer.open', $('#player'))) { closeDrawers(); return; }
    if (IS_TV && $('#hud').contains(document.activeElement) && !$('#hud').classList.contains('idle')) { document.activeElement.blur(); $$('.nav-focus').forEach((x) => x.classList.remove('nav-focus')); $('#hud').classList.add('idle'); return; }
    closePlayer(); return;""")
# keys
rep("""  if (typing) return;
  const playerOpen = !$('#player').hidden, drawer""",
    """  if (typing && IS_TV && !e.defaultPrevented && /^Arrow/.test(k) && e.target.tagName === 'INPUT') {
    // A remote has no Tab key: Up/Down always leave a text box, Left/Right leave it at either end of the text
    let edge = k === 'ArrowUp' || k === 'ArrowDown';
    if (!edge) { try { const t = e.target, a = t.selectionStart, z = t.selectionEnd; edge = a == null || (k === 'ArrowLeft' ? a === 0 && z === 0 : a === t.value.length); } catch (x) { edge = true; } }
    if (edge) { e.preventDefault(); Nav.move(k.slice(5).toLowerCase(), e.repeat); return; }
  }
  if (typing) return;
  const playerOpen = !$('#player').hidden, drawer""")
rep("""  if (playerOpen && !drawer) {
    const map = {""",
    """  if (playerOpen && !drawer && IS_TV) {
    // TV remote in the player: Up/Down reach the controls, Left/Right seek unless a control has focus, OK plays/pauses
    const hud = $('#hud'), idle = hud.classList.contains('idle'), a = document.activeElement, onCtl = !idle && a && a !== document.body && hud.contains(a);
    if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); if (idle || !onCtl) { wakeHud(); Nav.restore(true); } else { Nav.move(k === 'ArrowUp' ? 'up' : 'down', e.repeat); wakeHud(); } return; }
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && onCtl) { e.preventDefault(); Nav.move(k === 'ArrowLeft' ? 'left' : 'right', e.repeat); wakeHud(); return; }
    if (k === 'Enter' && !onCtl && !Skip.visible()) { e.preventDefault(); if (a && a !== document.body) a.blur(); togglePlay(); wakeHud(); return; }
  }
  if (playerOpen && !drawer) {
    const map = {""")
rep("""  if (dirs[k]) { e.preventDefault(); Nav.move(dirs[k]); return; }""",
    """  if (dirs[k]) { e.preventDefault(); Nav.move(dirs[k], e.repeat); return; }""")
# first focus on a TV once Home is up
rep("""  setTimeout(() => Layout.ask(), 1500);
  if (navigator.getGamepads""",
    """  setTimeout(() => Layout.ask(), 1500);
  if (IS_TV) { setTimeout(() => Nav.settle(), 1200); setTimeout(() => Nav.settle(), 3500); }
  if (navigator.getGamepads""")

# ---------- Voice: the Android app's native recognizer
rep("""const Voice = {
  Rec: window.SpeechRecognition || window.webkitSpeechRecognition,
  get ok() { return !!this.Rec; },
  active: null,
  start(input, btn) {
    if (this.active) { this.active.stop(); return; }""",
    """const Voice = {
  Rec: window.SpeechRecognition || window.webkitSpeechRecognition,
  /* MKCinema for Android / TV 1.2+: the app hands speech to the system recognizer (WebViews have no Web Speech) */
  native: () => !!(window.MKAndroid && typeof window.MKAndroid.voice === 'function'),
  get ok() { return this.native() || !!this.Rec; },
  active: null, pending: null,
  start(input, btn) {
    if (!input) return;
    if (this.native()) { this.nativeStart(input, btn); return; }
    if (this.active) { this.active.stop(); return; }""")
rep("""    try { r.start(); } catch (e) { btn.classList.remove('live'); this.active = null; toast('Voice search could not start here', 'err'); }
  },
};""",
    """    try { r.start(); } catch (e) { btn.classList.remove('live'); this.active = null; toast('Voice search could not start here', 'err'); }
  },
  nativeStart(input, btn) {
    if (this.pending) { try { MKAndroid.voiceStop(); } catch (e) { /* older app */ } this.nativeDone(null, 'cancelled'); return; }
    this.pending = { input, btn, before: input.placeholder };
    if (btn) btn.classList.add('live'); input.placeholder = 'Listening…';
    let ok = false; try { ok = MKAndroid.voice(navigator.language || 'en-US'); } catch (e) { ok = false; }
    if (!ok) this.nativeDone(null, 'unavailable');
  },
  /* called by the Android app: partial text while you speak */
  nativePartial(text) { const p = this.pending; if (p && text) p.input.value = text; },
  /* called by the Android app with the final text, or an error: cancelled, nomatch, denied, unavailable, error */
  nativeDone(text, err) {
    const p = this.pending; this.pending = null; if (!p) return;
    if (p.btn) p.btn.classList.remove('live'); p.input.placeholder = p.before;
    if (text) {
      p.input.value = text; p.input.dispatchEvent(new Event('input', { bubbles: true }));
      if (p.input.id === 'palInput' && looksLikeAsk(text)) { closePalette(); showAsk(text.trim()); }
      return;
    }
    if (err === 'unavailable') { toast('This TV doesn’t offer voice input to apps. Type with the on-screen keyboard instead; on many TVs its mic key works.', 'info', 7000); p.input.focus(); }
    else if (err === 'denied') toast('MKCinema needs the microphone. Allow it in your TV’s Settings › Apps › MKCinema › Permissions.', 'err', 7000);
    else if (err === 'nomatch') toast('Didn’t catch that. Try again.', 'err');
    else if (err && err !== 'cancelled') toast('Voice search stopped. Try again.', 'err');
  },
};
window.MKVoice = Voice;
/* the remote's search / mic key (Android app 1.2+) */
window.MKVoiceSearch = () => { if ($('#palette').hidden) openPalette(); setTimeout(() => { if (Voice.ok) Voice.start($('#palInput'), $('#palMic')); }, 120); return true; };""")

# ---------- TV CSS: 10-foot focus, compositor-only motion, quiet chrome
rep("""body.reduce-motion .p-load .pl-art{animation:plBreath 2.4s ease-in-out infinite!important;transform:none}
</style>""",
    """body.reduce-motion .p-load .pl-art{animation:plBreath 2.4s ease-in-out infinite!important;transform:none}

/* ---------- Smart TV (html.tv): read from the sofa, driven by a D-pad, smooth on a TV's GPU ---------- */
html.tv .glass,html.tv .glass-solid,html.tv .modal,html.tv .hud-mid .ibtn{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
html.tv #openFile,html.tv #muteBtn,html.tv .dock .seg,html.tv #pLock,html.tv #pPip,html.tv #pVol,html.tv #pAmb,html.tv #amb,html.tv .tab[data-view="studio"]{display:none!important}
/* rows: room for the focused poster to grow, no snapping fighting the remote */
html.tv .rail{padding:24px 18px 32px;margin:-24px -18px -12px;scroll-padding-inline:18px;scroll-snap-type:none}
/* posters: lift + platinum ring, animated with transform and opacity only */
html.tv .card{outline:none!important}
html.tv .card-inner{transition:transform .22s cubic-bezier(.2,.8,.2,1);box-shadow:0 0 0 1px rgba(255,255,255,.07)}
html.tv .card-inner::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:4;box-shadow:0 0 0 3px #f2f2f3,0 0 0 7px rgba(0,0,0,.7),0 26px 50px -18px #000;opacity:0;transition:opacity .16s linear}
html.tv .card.nav-focus,html.tv .card:focus-visible{z-index:3}
html.tv .card.nav-focus .card-inner,html.tv .card:focus-visible .card-inner{transform:scale(1.08);box-shadow:0 0 0 1px rgba(255,255,255,.07)}
html.tv .card.nav-focus .card-inner::after,html.tv .card:focus-visible .card-inner::after{opacity:1}
html.tv .card.nav-focus .card-sub{color:var(--ink)}
/* everything else: a solid ring you can see across the room, and a small lift */
html.tv .nav-focus:not(.card),html.tv :focus-visible:not(.card){outline:3px solid #f2f2f3!important;outline-offset:3px;box-shadow:0 0 0 8px rgba(0,0,0,.55)!important;animation:none!important}
html.tv .btn,html.tv .ibtn,html.tv .tab,html.tv .chip,html.tv .row-more,html.tv #hud button{transition:transform .18s cubic-bezier(.2,.8,.2,1)}
html.tv .btn.nav-focus{transform:scale(1.04)}
html.tv .ibtn.nav-focus,html.tv .tab.nav-focus,html.tv .chip.nav-focus,html.tv #hud button.nav-focus{transform:scale(1.08)}
html.tv .row-more.nav-focus{transform:translateX(4px)}
html.tv input.nav-focus,html.tv textarea.nav-focus,html.tv select.nav-focus{outline-offset:1px}
/* no endless decorative motion on a TV: it costs frames for nothing at sofa distance */
html.tv .skeleton{animation:none;background:rgba(255,255,255,.06)}
html.tv body.fx .logo3d.pop{animation:logoPop 1.15s cubic-bezier(.16,1,.3,1) calc(0s - var(--t0,0s)) both}
html.tv .lg-sheen{display:none!important}
html.tv body.fx .btn-ghost::after,html.tv body.fx .btn-prime::after{display:none}
</style>""")

open(p, 'w').write(s); print('patched')
