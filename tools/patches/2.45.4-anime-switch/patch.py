#!/usr/bin/env python3
"""2.45.4 Anime look switch: Settings > Appearance row + a switch on the Anime page + a command.
Appends block.html before the last </body>, adds a What's new entry, bumps APP_VERSION to 2.45.4 if lower.
Usage: python3 patch.py path/to/index.html   (idempotent)"""
import os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
s = open(p, encoding='utf-8').read()
blk = open(os.path.join(here, 'block.html'), encoding='utf-8').read().rstrip() + '\n'
VER = '2.45.4'

if 'id="mkc-anisw"' not in s:
    i = s.rfind('</body>')
    assert i > 0, '</body> not found'
    s = s[:i] + blk + s[i:]

note = "['new', 'Anime look switch', 'Turn the Anime look on or off in Settings, Appearance, or right on the Anime page.'],"
m = re.search(r"const APP_VERSION = '(\d+)\.(\d+)\.(\d+)';", s)
assert m, 'APP_VERSION not found'
newer = tuple(map(int, m.groups())) >= (2, 45, 4)
if "'Anime look switch', 'Turn" not in s:
    anchor = 'const RELEASES = [\n'
    assert s.count(anchor) == 1, 'RELEASES not found'
    a = s.index(anchor)
    if newer:
        # a later release is already being built: the note joins its top entry
        e = s.index('items: [\n', a) + len('items: [\n')
        s = s[:e] + '    ' + note + '\n' + s[e:]
    else:
        s = s.replace(anchor, anchor + f"  {{ v: '{VER}', date: '2026-11-07', items: [\n    {note}\n  ] }},\n", 1)
if not newer:
    s = s[:m.start()] + f"const APP_VERSION = '{VER}';" + s[m.end():]

open(p, 'w', encoding='utf-8').write(s)
print('patched', p)
