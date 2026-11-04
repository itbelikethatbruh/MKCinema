#!/usr/bin/env python3
"""MKCinema 2.7.22: Smart TV speed and bug pass.
Usage: python3 2.7.22-tv-fast.py <dir with index.html and sw.js>

Profiled with a Fire TV user agent at 1280x720, 1.5x pixels and a 6x CPU throttle:
 - Every row's posters were split off into extra GPU layers as wide as the whole row (up to 7906x325 each, about
   33 megapixels of layers on Home). The rows scroll, but positioned posters inside them (z-index on the focused
   poster and its ring) belonged to the page's stacking context, so the browser had to lift them out of the
   scroller. Making each row its own stacking context (isolation) keeps them inside: paint per key press -77%,
   layerize -68%.
 - Focus animations (poster scale, ring fade, play orb) created and destroyed those layers twice per key press.
   On TV focus changes are now instant (scale + ring with no transition) and the hover orb is gone.
 - Nav: each key measured every focusable twice; now once, and Left/Right inside a row steps to the neighbour directly.
 - No splash on TV: the app opens straight to Home, no intro audio graph is built.
 - Bugs: the tour's last step left focus on a hidden button (OK did nothing); the Home-layout question and the
   donation prompt could not be reached with a remote; the focused row title could sit under the dock;
   the banner forced a full layout on every slide change; rows had 40 posters each on TV.
"""
import sys, re, pathlib
d = pathlib.Path(sys.argv[1]); f = d / 'index.html'; s = f.read_text()

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count} of {old[:80]!r}, found {n}'
    s = s.replace(old, new)

# --- version
rep("const APP_VERSION = '2.7.21';", "const APP_VERSION = '2.7.22';")

# --- mark TVs before anything paints, so the splash markup never shows
rep('<meta charset="utf-8">\n', '<meta charset="utf-8">\n<script>if (/MKCinemaTV|Android TV|GoogleTV|AFT[A-Z]|SMART-TV|SmartTV|Web0S|webOS|Tizen|BRAVIA/i.test(navigator.userAgent)) document.documentElement.classList.add(\'tv\');</script>\n')

# --- TV CSS: replace the animated poster focus and the CSS splash
start = s.index('/* posters: lift + platinum ring, animated with transform and opacity only */')
end = s.index('html.tv .card.nav-focus .card-sub{color:var(--ink)}')
s = s[:start] + '''/* Rows are their own stacking context (2.7.22). Without it the focused poster and its ring (positioned, z-indexed)
   belonged to the page, so the browser lifted every poster after them out of the scrolling row into extra GPU layers
   as wide as the row: about 33 megapixels of layers on Home, rebuilt on every key press. */
html.tv .rail,html.tv .tabs,html.tv .chips,html.tv .ep-list,html.tv .seasons{isolation:isolate}
/* posters: lift + platinum ring, switched instantly. An animated focus re-created those layers twice per press. */
html.tv .card{outline:none!important}
html.tv .card-inner{transition:none!important;box-shadow:0 0 0 1px rgba(255,255,255,.07)}
html.tv .card-inner::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:4;box-shadow:0 0 0 3px #f2f2f3,0 0 0 7px rgba(0,0,0,.7),0 22px 40px -18px #000;opacity:0}
html.tv .card.nav-focus,html.tv .card:focus-visible{z-index:3}
html.tv .card.nav-focus .card-inner,html.tv .card:focus-visible .card-inner{transform:scale(1.07);box-shadow:0 0 0 1px rgba(255,255,255,.07)}
html.tv .card.nav-focus .card-inner::after,html.tv .card:focus-visible .card-inner::after{opacity:1}
html.tv .card .orb{display:none!important}
''' + s[end:]

start = s.index('/* TV splash (2.7.19): compositor-only keyframes */')
end = s.index('/* TV paint: cheaper text and logo shadows, still legible on artwork */')
s = s[:start] + '''/* No splash on a TV (2.7.22): the app opens straight to Home, ready for the remote */
html.tv #intro,html.tv #skip,html.tv #soundgate{display:none!important}
/* the focused item never hides under the floating dock */
html.tv{scroll-padding-top:104px;scroll-padding-bottom:24px}
''' + s[end:]
rep('html.tv .btn,html.tv .ibtn,html.tv .tab,html.tv .chip,html.tv .row-more,html.tv #hud button{transition:transform .18s cubic-bezier(.2,.8,.2,1)}',
    'html.tv .btn,html.tv .ibtn,html.tv .tab,html.tv .chip,html.tv .row-more,html.tv #hud button{transition:transform .14s cubic-bezier(.2,.8,.2,1)}')

# --- intro: none on TV
start = s.index('/* Smart TV splash: the same emblem and wordmark')
end = s.index('function runIntro() {')
s = s[:start] + s[end:]
rep("  if (IS_TV && !matchMedia('(prefers-reduced-motion: reduce)').matches && !CFG.reduceMotion) { runIntroTV(); return; }\n",
    "  if (IS_TV) { revealApp(true); finishIntro(); return; }\n")
rep("  if (skip) { layoutWord(); revealApp(true); finishIntro(); } else runIntro();",
    "  if (skip || IS_TV) { layoutWord(); revealApp(true); finishIntro(); } else runIntro();")
rep("  { label: 'Replay intro', icon: 'rotate-ccw', run: () => replayIntro() },\n  { label: 'Toggle sound', icon: 'volume-2', run: () => toggleMute() },\n",
    "  ...(IS_TV ? [] : [{ label: 'Replay intro', icon: 'rotate-ccw', run: () => replayIntro() }, { label: 'Toggle sound', icon: 'volume-2', run: () => toggleMute() }]),\n")
rep("  { id: 'sound', icon: 'volume-2', label: 'Intro & sound', intro: 'The boot sequence and its soundtrack. The interface itself makes no sounds.', rows: () => [\n",
    "  { id: 'sound', icon: 'volume-2', label: 'Intro & sound', intro: IS_TV ? 'On a TV, MKCinema opens straight to Home with no intro, so the remote is ready right away. The interface makes no sounds.' : 'The boot sequence and its soundtrack. The interface itself makes no sounds.', rows: () => IS_TV ? [] : [\n")

# --- Nav: measure once, step along a row directly, reach the bottom prompts
rep('''  root() {
    for (const id of ['castLayer', 'partyLayer']) if (!$(`#${id}`).hidden) return $(`#${id}`);''',
'''  root() {
    for (const id of ['castLayer', 'partyLayer']) if (!$(`#${id}`).hidden) return $(`#${id}`);
    // TV: the Home-layout question and the donation prompt float over the page, so the remote goes to them first
    if (IS_TV && $('#player').hidden && !document.body.classList.contains('layer-open')) { const ask = $('.focus-ask, .sup-ask'); if (ask) return ask; }''')
rep('''  items(root) {
    return $$('[data-nav], button, a[href], input, select, textarea, [tabindex="0"]', root).filter((el) => {
      if (el.disabled || el.tabIndex < 0 || el.closest('[hidden]')) return false;
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    });
  },''',
'''  // each candidate is measured once per key press (rects), not once to filter and again to score
  rects: new Map(),
  items(root) {
    const out = [], rects = this.rects; rects.clear();
    for (const el of root.querySelectorAll('[data-nav], button, a[href], input, select, textarea, [tabindex="0"]')) {
      if (el.disabled || el.tabIndex < 0) continue;
      const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || el.closest('[hidden]')) continue;
      rects.set(el, r); out.push(el);
    }
    return out;
  },
  /* Left/Right inside a row: the next poster along, without measuring the whole page */
  step(cur, dir) {
    if (!cur.matches('.rail>.card')) return null;
    let el = cur;
    do { el = dir === 'right' ? el.nextElementSibling : el.previousElementSibling; } while (el && !el.matches('[data-nav]'));
    return el && !el.closest('[hidden]') ? el : null;
  },''')
rep('''    const cur = root.contains(document.activeElement) && document.activeElement !== document.body ? document.activeElement : null;
    if (!cur) { if (IS_TV) this.restore(fast); else this.focus(list[0]); return; }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;''',
'''    const cur = root.contains(document.activeElement) && document.activeElement !== document.body ? document.activeElement : null;
    if (!cur) { if (IS_TV) this.restore(fast); else this.focus(list[0]); return; }
    if (dir === 'left' || dir === 'right') { const n = this.step(cur, dir); if (n) { this.focus(n, fast); return; } }
    const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;''')
rep('''      const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;''',
'''      const b = this.rects.get(el) || el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;''')
rep('''      if (last && last.isConnected && list.includes(last)) { const r = last.getBoundingClientRect(); if (r.right > 0 && r.left < innerWidth) best = last; }''',
'''      if (last && last.isConnected && this.rects.has(last)) { const r = this.rects.get(last); if (r.right > 0 && r.left < innerWidth) best = last; }''')

# move() reads list before items() recomputes for step(): step() runs after items(); fine. Free the rects after a move.
rep("    if (best) this.focus(best, fast);\n  },\n};\nfunction back() {",
    "    if (best) this.focus(best, fast);\n    this.rects.clear();\n  },\n};\nfunction back() {")

# Back closes the floating prompts on TV
rep("function back() {\n  for (const id of ['castLayer', 'partyLayer']) if (!$(`#${id}`).hidden) { closeLayer(id); return; }",
    "function back() {\n  for (const id of ['castLayer', 'partyLayer']) if (!$(`#${id}`).hidden) { closeLayer(id); return; }\n  if (IS_TV && Nav.root().matches('.focus-ask, .sup-ask')) { Nav.root().remove(); tvBackHook(); Nav.settle(); return; }\n  if (IS_TV && $('#player').hidden && !document.body.classList.contains('layer-open') && typeof Remote !== 'undefined' && Remote.hintEl) { Remote.unhint(); return; }")
# The Android TV app (1.2) only hands Back to the page when an element with one of its known ids is showing; '#remote'
# is one of them and nothing else uses it, so the floating prompt on screen carries it and Back closes the prompt
# instead of leaving the app.
rep("function handleKey(e) {", """/* Android TV app 1.2 hands Back to the page only while an element with a known id shows; #remote is one of them and is
   otherwise unused, so whichever floating prompt is on screen carries it and Back closes that prompt, not the app. */
function tvBackHook() {
  if (!IS_TV || $('#remote')) return;
  const el = $('.focus-ask, .sup-ask') || (typeof Remote !== 'undefined' && Remote.hintEl && Remote.hintEl.isConnected ? Remote.hintEl : null);
  if (el) el.id = 'remote';
}
function handleKey(e) {""")
rep("    const open = ['castLayer', 'partyLayer', 'player',", "    const open = ['remote', 'castLayer', 'partyLayer', 'player',")

# OK with nothing focused (focus lost to a removed or hidden button) puts the focus back instead of doing nothing
rep("  const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };\n  if (dirs[k]) { e.preventDefault(); Nav.move(dirs[k], e.repeat); return; }",
    "  const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };\n  if (dirs[k]) { e.preventDefault(); Nav.move(dirs[k], e.repeat); return; }\n  if (IS_TV && k === 'Enter' && !playerOpen && (document.activeElement === document.body || !document.activeElement)) { e.preventDefault(); Nav.restore(true); return; }")

# prompts: put the remote on them when they appear on a TV
rep("    document.body.appendChild(t);\n    $$('[data-focus]', t).forEach((b) => b.addEventListener('click', () => { this.set({ focus: b.dataset.focus }); t.remove(); toast('Home layout saved', 'ok'); }));\n    setTimeout(() => { if (t.isConnected) t.remove(); }, 30000);",
    "    document.body.appendChild(t);\n    $$('[data-focus]', t).forEach((b) => b.addEventListener('click', () => { this.set({ focus: b.dataset.focus }); t.remove(); toast('Home layout saved', 'ok'); if (IS_TV) { tvBackHook(); Nav.settle(); } }));\n    if (IS_TV) { tvBackHook(); Nav.settle(); }\n    setTimeout(() => { if (t.isConnected) { t.remove(); if (IS_TV) { tvBackHook(); Nav.settle(); } } }, 30000);")
rep("      document.body.appendChild(t); icons();\n      const close = () => t.remove();",
    "      document.body.appendChild(t); icons(); if (IS_TV) { tvBackHook(); Nav.settle(); }\n      const close = () => { t.remove(); if (IS_TV) { tvBackHook(); Nav.settle(); } };")
rep("    document.body.appendChild(el); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));\n    setTimeout(() => this.unhint(), 18000);",
    "    document.body.appendChild(el); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on'))); tvBackHook();\n    setTimeout(() => this.unhint(), 18000);")
rep("  unhint() { const el = this.hintEl; if (!el) return; this.hintEl = null; el.classList.remove('on'); setTimeout(() => el.remove(), 700); },",
    "  unhint() { const el = this.hintEl; if (!el) return; this.hintEl = null; el.classList.remove('on'); if (el.id === 'remote') el.removeAttribute('id'); tvBackHook(); setTimeout(() => el.remove(), 700); },")

# tour: a step change that hides the focused button (the last step) moves the focus to that step's own buttons
rep("  $('#tour .modal').scrollTop = 0;\n}", "  $('#tour .modal').scrollTop = 0;\n  if (IS_TV) { const a = document.activeElement; if (!a || a === document.body || a.hidden || !a.isConnected || a.closest('[hidden]')) { $$('.nav-focus').forEach((x) => x.classList.remove('nav-focus')); Nav.settle(); } }\n}")

# --- banner: restart the text animation on the next frame instead of forcing a full layout
rep("  { const hb = $('#hero .hero-body'); hb.classList.remove('swap'); void hb.offsetWidth; hb.classList.add('swap'); }",
    "  { const hb = $('#hero .hero-body'); hb.classList.remove('swap'); requestAnimationFrame(() => hb.classList.add('swap')); }")

# --- Home rows: 24 posters each on a TV (See all has the rest)
rep("      fillRail(sec, metas.slice(0, 40).map((m) => cardHTML(m)).join(''));\n      if (!heroSet",
    "      fillRail(sec, metas.slice(0, IS_TV ? 24 : 40).map((m) => cardHTML(m)).join(''));\n      if (!heroSet")

# --- phone-landscape dock auto-hide never applies on a TV: no scroll listener there
rep("(function dockAutoHide() {\n", "(function dockAutoHide() {\n  if (IS_TV) return;\n")

f.write_text(s)
sw = d / 'sw.js'; t = sw.read_text(); assert "const VERSION = 'mkc-2.7.21';" in t
sw.write_text(t.replace("const VERSION = 'mkc-2.7.21';", "const VERSION = 'mkc-2.7.22';"))
print('ok 2.7.22')

# Codex review: try the in-row step before measuring every candidate on the page
s = (d / 'index.html').read_text()
old = """    const root = this.root(); const list = this.items(root); if (!list.length) return;
    const cur = root.contains(document.activeElement) && document.activeElement !== document.body ? document.activeElement : null;
    if (!cur) { if (IS_TV) this.restore(fast); else this.focus(list[0]); return; }
    if (dir === 'left' || dir === 'right') { const n = this.step(cur, dir); if (n) { this.focus(n, fast); return; } }
"""
new = """    const root = this.root();
    const cur = root.contains(document.activeElement) && document.activeElement !== document.body ? document.activeElement : null;
    if (cur && (dir === 'left' || dir === 'right')) { const n = this.step(cur, dir); if (n) { this.focus(n, fast); return; } }
    const list = this.items(root); if (!list.length) return;
    if (!cur) { if (IS_TV) this.restore(fast); else this.focus(list[0]); return; }
"""
assert s.count(old) == 1; s = s.replace(old, new); (d / 'index.html').write_text(s)
print('ok step-first')
