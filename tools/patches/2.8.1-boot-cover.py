#!/usr/bin/env python3
"""2.8.1 loading cover polish (Drake, 2026-11-05, photo of the Fire TV):
- a white bar ran down the right edge while loading: the page was still growing, so the TV's own scrollbar showed.
  The page cannot scroll while the cover is up now, and scrollbars are hidden from the first paint.
- the cover said only "MK": it now uses the real platinum monogram from the intro, with MKCINEMA under it.
Usage: python3 -I this.py index.html sw.js   (idempotent)"""
import re, sys
p, swp = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if 'bc-2881' in s: print('already applied'); sys.exit(0)
def rep(a, b):
    global s
    assert s.count(a) == 1, ('anchor', s.count(a), a[:80])
    s = s.replace(a, b)

rep('<div id="bootCover" aria-hidden="true"><div class="bc-mk">MK</div>',
    '<div id="bootCover" aria-hidden="true"><svg class="bc-mark" viewBox="0 0 120 120">'
    '<circle cx="60" cy="60" r="56" fill="none" stroke="url(#mkRing)" stroke-width=".9"/>'
    '<circle cx="60" cy="60" r="52.5" fill="none" stroke="url(#mkRing)" stroke-width=".35"/>'
    '<use href="#mkLetters" fill="url(#mkPlat)" transform="translate(60 60) scale(.84)"/></svg>'
    '<div class="bc-word">MKCINEMA</div>')
# old text badge styles go; the monogram and wordmark take their place
s, n = re.subn(r"html\.tv #bootCover \.bc-mk\{[^}]*\}", "", s); assert n == 1
s, n = re.subn(r"#bootCover \.bc-mk\{[^}]*\}", "", s); assert n == 1
rep("#bootCover.out{opacity:0;pointer-events:none}",
    "#bootCover.out{opacity:0;pointer-events:none}"
    "/* bc-2881 */html.booting,html.booting body{overflow:hidden}html.booting ::-webkit-scrollbar{display:none}"
    "#bootCover .bc-mark{width:92px;height:92px;display:block}"
    "#bootCover .bc-word{margin-top:-8px;padding-left:.42em;font:500 15px/1 'Fraunces',Didot,'Bodoni 72',Georgia,serif;letter-spacing:.42em;color:var(--nd9d4c7,#d9d4c7)}"
    "html.tv #bootCover .bc-mark{width:116px;height:116px}html.tv #bootCover .bc-word{font-size:19px}")
rep("(function(){var c=document.getElementById('bootCover'),",
    "(function(){document.documentElement.classList.add('booting');var c=document.getElementById('bootCover'),")
rep("function gone(){if(done)return;done=true;",
    "function gone(){if(done)return;done=true;document.documentElement.classList.remove('booting');")

old = re.search(r"const APP_VERSION = '2\.8\.(\d+)';", s).group(1); new = f'2.8.{int(old) + 1}'
s = s.replace(f"const APP_VERSION = '2.8.{old}';", f"const APP_VERSION = '{new}';")
open(p, 'w', encoding='utf-8').write(s)
sw = open(swp).read(); sw, n = re.subn(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{new}';", sw); assert n == 1; open(swp, 'w').write(sw)
print('applied:', f'2.8.{old} ->', new)
