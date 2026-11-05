"""MKCinema 2.19.0: new-episode notifications (needs Android app 1.5.0; inert elsewhere). Applies on top of web 2.14.0 or later, in any order
relative to the 2.15.0 languages, 2.16.0 subtitles/support, 2.17.0 AniList and 2.18.0 MDBList patches. Run once:
    python3 -I patch.py /path/to/mkcinema [--version X.Y.Z]
Without --version, a base below 2.19.0 becomes 2.19.0, and a higher base keeps its number.
Inserts <script id="mkc-219"> before the mkc-cfwa script, then bumps index, sw and
version.json (android untouched)."""
import os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VERSION = None
if '--version' in sys.argv:
    i = sys.argv.index('--version'); VERSION = sys.argv[i + 1]; del sys.argv[i:i + 2]
root = sys.argv[1]
p = os.path.join(root, 'index.html')
s = open(p, encoding='utf-8').read()
assert 'id="mkc-219"' not in s, 'already applied'
assert s.count('<script id="mkc-cfwa">') == 1
for need in ('const Deep = {', 'const NewEps = {', "{ id: 'home',", 'const Calendar = {', 'function markWatched('):
    assert need in s, need
m = re.search(r"const APP_VERSION = '(\d+)\.(\d+)\.(\d+)';", s); assert m
cur = tuple(int(x) for x in m.groups())
new = VERSION or ('.'.join(map(str, cur)) if cur >= (2, 19, 0) else '2.19.0')
s = s.replace(m.group(0), f"const APP_VERSION = '{new}';")
js = open(os.path.join(here, 'epalerts.js'), encoding='utf-8').read()
assert '</script' not in js
s = s.replace('<script id="mkc-cfwa">', f'<script id="mkc-219">\n{js}</script>\n<script id="mkc-cfwa">')
open(p, 'w', encoding='utf-8').write(s)
sp = os.path.join(root, 'sw.js')
w = open(sp, encoding='utf-8').read()
w, k = re.subn(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{new}';", w); assert k == 1
open(sp, 'w', encoding='utf-8').write(w)
vp = os.path.join(root, 'version.json')
v = open(vp, encoding='utf-8').read()
v, k = re.subn(r'"web":\s*"[\d.]+"', f'"web": "{new}"', v); assert k == 1
open(vp, 'w', encoding='utf-8').write(v)
print(f'{new} (new-episode notifications) applied to', root)
