#!/usr/bin/env python3
"""2.7.38 Peak Cinema on TVs: the picture sat far up the screen, with a purple area over the rest (Dee, 2026-11-04).

Android TV web views draw video on a hardware layer placed from the page's coordinates. Peak Cinema is a fixed layer
over Home; when Home was scrolled down, the layer was placed against the scrolled page, so the picture sat up and off the
screen and the hole left for it showed as a flat purple area.
Fix (TV only): the page scrolls to the top while Peak Cinema is open (its place is restored on close), and the scene's
box keeps the film's shape (no object-fit letterboxing, which these web views drew top-aligned in 2.7.33) and is centred
by flex layout in the page flow instead of left/top offsets.
Desktops and phones are unchanged.
Usage: python3 this.py index.html sw.js   (idempotent)"""
import re, sys
p, swp = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if 'pk-2738' in s: print('already applied'); sys.exit(0)
def rep(a, b):
    global s
    assert s.count(a) == 1, ('anchor', s.count(a), a[:80])
    s = s.replace(a, b)
rep("    el.classList.add('pk-empty'); openLayer('peak');",
    "    /* pk-2738: TV video layers are placed against the scrolled page, so the page goes to the top while Peak is open */\n"
    "    if (IS_TV) { this.scrollY0 = scrollY; if (scrollY) scrollTo(0, 0); }\n"
    "    el.classList.add('pk-empty'); openLayer('peak');")
rep("    $('#pkHowBox').hidden = true; closeLayer('peak');\n  },",
    "    $('#pkHowBox').hidden = true; closeLayer('peak');\n"
    "    if (IS_TV && this.scrollY0) { const y = this.scrollY0; this.scrollY0 = 0; requestAnimationFrame(() => scrollTo(0, y)); }\n  },")
# TV: the scene's box keeps the film's own shape (so object-fit never letterboxes, which these web views drew top-aligned)
# and is centred by flex layout in the page flow, with no left/top offsets for the hardware video layer to misplace
rep("    Object.assign(v.style, { width: `${w}px`, height: `${h}px`, left: `${Math.round((W - w) / 2)}px`, top: `${Math.round((H - h) / 2)}px` });",
    "    if (IS_TV) { Object.assign(v.style, { width: `${w}px`, height: `${h}px` }); v.style.removeProperty('left'); v.style.removeProperty('top'); return; }\n"
    "    Object.assign(v.style, { width: `${w}px`, height: `${h}px`, left: `${Math.round((W - w) / 2)}px`, top: `${Math.round((H - h) / 2)}px` });")
rep("html.tv .pk-v{transition:none}",
    "html.tv .pk-v{transition:none}\n/* pk-2738: on TVs the scene is centred by layout, not by offsets */\n"
    "html.tv .pk-stage{display:flex;align-items:center;justify-content:center}\n"
    "html.tv .pk-v{position:static;display:block;flex:none;max-width:100%;max-height:100%}")
old = re.search(r"const APP_VERSION = '2\.7\.(\d+)';", s).group(1); new = f'2.7.{int(old) + 1}'
s = s.replace(f"const APP_VERSION = '2.7.{old}';", f"const APP_VERSION = '{new}';")
open(p, 'w', encoding='utf-8').write(s)
sw = open(swp).read(); sw = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{new}';", sw); open(swp, 'w').write(sw)
print('applied:', f'2.7.{old} ->', new)
