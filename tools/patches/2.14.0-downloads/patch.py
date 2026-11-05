"""2.14.0: offline downloads (Android 1.4.0 phones/tablets, Windows 1.3.0) + Mac/Linux torrent labels.
Adds a separate <style id="mkc-214css"> and <script id="mkc-214"> block on top of the live 2.13.2 build (the mkc-28
block is NOT rebuilt from 2.8.0-features: 2.13.1 and 2.13.2 edited it in place). Usage: patch.py index.html sw.js [version.json]"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
idx, sw = sys.argv[1], sys.argv[2]
vj = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else os.path.join(os.path.dirname(idx), 'version.json')
s = open(idx, encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    c = s.count(a); assert c == n, f'{c} x {a[:80]!r}'; s = s.replace(a, b)
assert "APP_VERSION = '2.13.2'" in s, 'expected the live 2.13.2 build'
rep("APP_VERSION = '2.13.2'", "APP_VERSION = '2.14.0'")
# Mac and Linux apps 1.1 have the torrent engine too: name the computer properly
rep("here() { return this.d && this.d.platform === 'windows' ? 'this computer' : this.d && this.d.platform === 'tv' ? 'this TV' : 'this device'; }",
    "here() { const p = this.d && this.d.platform; return p === 'mac' ? 'this Mac' : p === 'windows' || p === 'linux' ? 'this computer' : p === 'tv' ? 'this TV' : 'this device'; }")
rep("this.d.platform === 'windows' ? '' : ' It keeps one torrent", "/^(windows|mac|linux)$/.test(this.d.platform) ? '' : ' It keeps one torrent")
rep("{ windows: 'Windows', tv: 'TV', android: 'Android' }", "{ windows: 'Windows', mac: 'Mac', linux: 'Linux', tv: 'TV', android: 'Android' }")
rep("Desktop.d.platform === 'windows' ? 'this PC' : 'this device'", "({ windows: 'this PC', mac: 'this Mac', linux: 'this computer' }[Desktop.d.platform] || 'this device')", 2)
css = open(os.path.join(HERE, 'offline.css'), encoding='utf-8').read()
js = open(os.path.join(HERE, 'offline.js'), encoding='utf-8').read()
assert '</script>' not in js and '</style>' not in css
assert 'id="mkc-214' not in s, 'already patched'
rep('<script id="mkc-cfwa"', f'<style id="mkc-214css">\n{css}</style>\n<script id="mkc-214">\n{js}</script>\n<script id="mkc-cfwa"')
open(idx, 'w', encoding='utf-8').write(s)
w = open(sw, encoding='utf-8').read()
assert "const VERSION = 'mkc-2.13.2';" in w
open(sw, 'w', encoding='utf-8').write(w.replace("const VERSION = 'mkc-2.13.2';", "const VERSION = 'mkc-2.14.0';"))
v = json.load(open(vj)) if os.path.exists(vj) else {}
v['web'] = '2.14.0'
# the Android version is bumped to 1.4.0 only when the 1.4.0 APK is on the site (else phones loop on the update prompt):
# run this with --apk once MKCinema.apk 1.4.0 is uploaded
if '--apk' in sys.argv:
    v.update({'android': '1.4.0', 'apk': 'https://mkcinema-site.pages.dev/download/MKCinema.apk'})
open(vj, 'w').write(json.dumps(v) + '\n')
print('patched to 2.14.0')
