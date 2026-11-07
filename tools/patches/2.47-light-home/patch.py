#!/usr/bin/env python3
"""2.47 Lighter Home (audit P4 + P6). Idempotent: run on index.html as often as you like.
Usage: python3 patch.py path/to/index.html
- Adds/refreshes the <script id="mkc-p4p6"> block just before </body> (after mkc-fast).
- renderHome: Home rows start with HomeLazy.first() posters instead of 40 (TV keeps 24).
- Endless.attach: waits for a row that is not built yet.
"""
import os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
s = open(path, encoding='utf-8').read()
block = open(os.path.join(here, 'block.html'), encoding='utf-8').read().strip()

# 1. the block
START, END = '<script id="mkc-p4p6">', '<!-- mk-p4p6:end -->'
if START in s:
    i, j = s.index(START), s.index(END) + len(END)
    s = s[:i] + block + s[j:]
else:
    k = s.rindex('</body>')
    s = s[:k] + block + '\n' + s[k:]

# 2. renderHome starting count
OLD = "const shown = IS_TV ? 24 : 40;"
NEW = "const shown = IS_TV ? 24 : (typeof HomeLazy !== 'undefined' ? HomeLazy.first() : 40);"
if NEW not in s:
    assert s.count(OLD) == 1, 'renderHome anchor not found'
    s = s.replace(OLD, NEW)

# 3. Endless.attach waits for a row that is built later
OLD = "attach(sec, cat, metas, shown) {\n    const rail = sec.querySelector('.rail'); if (!rail) return;\n"
NEW = OLD + "    if (sec._lazy) { sec._lazy.attach = [cat, metas, shown]; return; }\n"
if NEW not in s:
    assert s.count(OLD) == 1, 'Endless.attach anchor not found'
    s = s.replace(OLD, NEW)

open(path, 'w', encoding='utf-8').write(s)
print('2.47 light-home applied to', path)
