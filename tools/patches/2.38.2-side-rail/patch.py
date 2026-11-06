#!/usr/bin/env python3
"""2.38.2 side menu rail fix. Idempotent.
Usage: python3 patch.py <path/to/index.html> [more files...]
- The rail scrolls inside itself instead of squeezing/clipping items (9 tabs + 6 tools did not fit short windows).
- Shorter windows get compact rows so most heights need no scrolling.
- Collapsed rail hides the MK CINEMA wordmark again (a 2.27 rule out-ranked the hide rule), so the emblem is centred.
- Bumps APP_VERSION/sw/version.json to 2.38.2 only when older, adds a What's new entry before 2.38.1's.
"""
import re, sys, os

CSS = r'''<style id="mkc-2382rail">
/* 2.38.2 side menu: never overlap at any window height */
@media (min-width:761px){
  html.nav-side .dock{overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none}
  html.nav-side .dock::-webkit-scrollbar{display:none}
  html.nav-side .dock>*,html.nav-side #tabs .tab,html.nav-side .dock-tools>.ibtn{flex-shrink:0}
  html.side-mini .dock-wrap:not(:hover):not(:focus-within) .dock .brand .word{display:none!important}
  html.side-mini .dock-wrap:not(:hover):not(:focus-within) .dock .brand{justify-content:center;padding-inline:0;gap:0}
}
@media (min-width:761px) and (max-height:900px){
  html.nav-side:not(.tv) .dock{padding-top:14px;padding-bottom:10px;gap:2px}
  html.nav-side:not(.tv) #tabs{gap:2px}
  html.nav-side:not(.tv) #tabs .tab{height:40px}
  html.nav-side:not(.tv) .dock-tools>.ibtn{height:38px}
  html.nav-side:not(.tv) .dock-tools>.searchbtn{margin-bottom:6px}
}
@media (min-width:761px) and (max-height:720px){
  html.nav-side:not(.tv) .dock{padding-top:10px;padding-bottom:8px;gap:1px}
  html.nav-side:not(.tv) #tabs{gap:1px}
  html.nav-side:not(.tv) .dock .brand{min-height:36px;padding-top:2px;padding-bottom:10px;margin-bottom:2px}
  html.nav-side:not(.tv) .dock .brand .mk{width:30px;height:30px}
  html.nav-side:not(.tv) #tabs .tab{height:34px}
  html.nav-side:not(.tv) .dock-tools>.ibtn{height:32px}
  html.nav-side:not(.tv) .dock-tools>.searchbtn{margin-bottom:4px}
}
</style>
'''
ENTRY = "  { v: '2.38.2', date: '2026-11-06', items: [\n    ['better', 'Side menu fits every window', 'The side menu now fits short and small windows: rows tighten up, and if there is still not enough room it scrolls instead of squeezing.'],\n  ] },\n"

def vt(s): return tuple(int(x) for x in s.split('.'))

def patch_index(p):
    s = open(p, encoding='utf-8').read()
    s = re.sub(r'<style id="mkc-2382rail">.*?</style>\n?', '', s, flags=re.S)
    i = s.rfind('</body>')
    if i < 0: sys.exit('no </body> in ' + p)
    s = s[:i] + CSS + s[i:]
    old = "    if (el.closest('.dock-wrap, #hud')) return;"
    new = ("    if (el.closest('#hud')) return;\n"
           "    const dk = el.closest('.dock'); /* 2.38.2: the rail scrolls inside itself; keep the focused item in view */\n"
           "    if (dk) { const a = el.getBoundingClientRect(), d = dk.getBoundingClientRect(); if (a.top < d.top) dk.scrollTop -= d.top - a.top + 8; else if (a.bottom > d.bottom) dk.scrollTop += a.bottom - d.bottom + 8; return; }\n"
           "    if (el.closest('.dock-wrap')) return;")
    if new not in s:
        if s.count(old) != 1: sys.exit('Nav.focus dock line not found exactly once in ' + p)
        s = s.replace(old, new)
    m = re.search(r"const APP_VERSION = '([\d.]+)';", s)
    if m and vt(m.group(1)) < (2, 38, 2):
        s = s.replace(m.group(0), "const APP_VERSION = '2.38.2';")
    if "v: '2.38.2'" not in s:
        k = s.find("  { v: '2.38.1'")
        if k < 0: sys.exit('no 2.38.1 RELEASES entry in ' + p)
        s = s[:k] + ENTRY + s[k:]
    open(p, 'w', encoding='utf-8').write(s)
    print('patched', p)

def bump(p, pat, fmt):
    if not os.path.exists(p): return
    s = open(p, encoding='utf-8').read()
    m = re.search(pat, s)
    if m and vt(m.group(1)) < (2, 38, 2):
        s = s.replace(m.group(0), fmt); open(p, 'w', encoding='utf-8').write(s); print('bumped', p)

for p in sys.argv[1:]:
    patch_index(p)
    d = os.path.dirname(os.path.abspath(p))
    bump(os.path.join(d, 'sw.js'), r"const VERSION = 'mkc-([\d.]+)';", "const VERSION = 'mkc-2.38.2';")
    bump(os.path.join(d, 'version.json'), r'"web": "([\d.]+)"', '"web": "2.38.2"')
