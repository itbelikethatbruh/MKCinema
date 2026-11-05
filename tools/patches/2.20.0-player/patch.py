"""MKCinema 2.20.0: the player rebuilt, plus Listen on phone. Applies on top of web 2.18.0 or later (any order with
2.19.0). Run once:
    python3 -I patch.py /path/to/mkcinema [--version X.Y.Z]
Without --version, a base below 2.20.0 becomes 2.20.0 and a higher base keeps its number.
index.html: <style id="mkc-220css"> + <script id="mkc-220"> before mkc-cfwa. remote.html: the Listen button and its
script. Then bumps index, sw and version.json (android untouched)."""
import os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VERSION = None
if '--version' in sys.argv:
    i = sys.argv.index('--version'); VERSION = sys.argv[i + 1]; del sys.argv[i:i + 2]
root = sys.argv[1]
rd = lambda n: open(os.path.join(here, n), encoding='utf-8').read()

p = os.path.join(root, 'index.html')
s = open(p, encoding='utf-8').read()
assert 'id="mkc-220"' not in s, 'already applied'
assert s.count('<script id="mkc-cfwa">') == 1
for need in ('function renderOptMenu(', 'const PlayerPlus = {', 'const Remote = {', 'const DSP = {', 'const AudioLang = {', 'id="seek"', 'id="pVol"', 'id="pDsp"', 'function setSubDelay(', 'async function selectSub('):
    assert need in s, need
m = re.search(r"const APP_VERSION = '(\d+)\.(\d+)\.(\d+)';", s); assert m
cur = tuple(int(x) for x in m.groups())
new = VERSION or ('.'.join(map(str, cur)) if cur >= (2, 20, 0) else '2.20.0')
s = s.replace(m.group(0), f"const APP_VERSION = '{new}';")
js, css = rd('player.js'), rd('player.css')
assert '</script' not in js and '</style' not in css
s = s.replace('<script id="mkc-cfwa">', f'<style id="mkc-220css">\n{css}</style>\n<script id="mkc-220">\n{js}</script>\n<script id="mkc-cfwa">')
open(p, 'w', encoding='utf-8').write(s)

rp = os.path.join(root, 'remote.html')
r = open(rp, encoding='utf-8').read()
assert 'id="lsnBtn"' not in r
sym = '<symbol id="i-head" viewBox="0 0 24 24"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></symbol>'
a = '<symbol id="i-x" viewBox="0 0 24 24">'; assert r.count(a) == 1; r = r.replace(a, sym + '\n    ' + a)
btn = '<button class="login lsn" type="button" id="lsnBtn" hidden><svg class="i"><use href="#i-head"/></svg><span class="grow"><b id="lsnT">Listen on this phone</b><small id="lsnS">Plug in headphones to watch without waking anyone</small></span></button>'
k = r.index('id="loginBtn"'); e = r.index('</button>', k) + len('</button>'); r = r[:e] + '\n  ' + btn + r[e:]
cssr = '.login.lsn{border-color:var(--line);background:var(--glass)}\n.login.lsn.on{border-color:rgba(217,212,199,.55);background:rgba(217,212,199,.12)}\n.login.lsn.on b{color:var(--champ)}\n'
a = '.login b{'; assert r.count(a) == 1; r = r.replace(a, cssr + a)
a = '/* ---------- Start ---------- */'; assert r.count(a) == 1
lj = rd('remote-listen.js'); assert '</script' not in lj
r = r.replace(a, lj + '\n' + a)
open(rp, 'w', encoding='utf-8').write(r)

sp = os.path.join(root, 'sw.js')
w = open(sp, encoding='utf-8').read()
w, n = re.subn(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{new}';", w); assert n == 1
open(sp, 'w', encoding='utf-8').write(w)
vp = os.path.join(root, 'version.json')
v = open(vp, encoding='utf-8').read()
v, n = re.subn(r'"web":\s*"[\d.]+"', f'"web": "{new}"', v); assert n == 1
open(vp, 'w', encoding='utf-8').write(v)
print(f'{new} (player overhaul + Listen on phone) applied to', root)
