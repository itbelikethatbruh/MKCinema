"""MKCinema 2.27.2: Samsung TVs through TizenBrew.

- Back on a Samsung remote (key 10009 / XF86Back) works like Back on LG: closes what's open, then the exit prompt
  (only when the Tizen app API is there to really exit; otherwise Back at Home does nothing, as in a browser).
- Media keys (play/pause, stop, fast-forward, rewind) work in the player: script block mkc-2272s before mkc-cfwa.
- The "Any other TV" line and the Settings platform label name Samsung.
- Version 2.27.2 in APP_VERSION, sw.js and version.json, only when the build is lower.

Run:  python3 -I patch.py /path/to/mkcinema      Idempotent.
"""
import json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.27.2'
TZ = "(/Tizen/.test(this.ua) && !!(window.tizen && tizen.application))"


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def index(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    if 'id="mkc-2272s"' in s:
        print('index.html: Samsung block already there')
    else:
        def once(old, new):
            nonlocal s
            assert s.count(old) == 1, f'{old[:70]!r} found {s.count(old)} times'
            s = s.replace(old, new)
        # Back key in the main handler
        once("if (e.keyCode === 461 || k === 'GoBack' || k === 'BrowserBack') {\n    e.preventDefault();",
             "if (e.keyCode === 461 || e.keyCode === 10009 || k === 'XF86Back' || k === 'GoBack' || k === 'BrowserBack') {\n    e.preventDefault();")
        # exit prompt: Samsung joins LG when TizenBrew's page can close the app
        once("able() { return IS_TV && /MKCinemaAndroid|MKCinemaTV|Web0S|webOS/.test(this.ua); },",
             f"able() {{ return IS_TV && (/MKCinemaAndroid|MKCinemaTV|Web0S|webOS/.test(this.ua) || {TZ}); }},\n  tizen() {{ return {TZ}; }},")
        once("canQuit() { return this.webos() || ", "canQuit() { return this.webos() || this.tizen() || ")
        once("    try { if (window.webOSSystem && webOSSystem.close) { webOSSystem.close(); return; } } catch (e) { /* not webOS */ }\n",
             "    try { if (window.webOSSystem && webOSSystem.close) { webOSSystem.close(); return; } } catch (e) { /* not webOS */ }\n"
             "    try { if (window.tizen && tizen.application) { tizen.application.getCurrentApplication().exit(); return; } } catch (e) { /* not Samsung */ }\n")
        once("if (ExitAsk.webos()) document.addEventListener('keydown', (e) => {\n      if (!(e.keyCode === 461 || e.key === 'GoBack' || e.key === 'BrowserBack')) return;",
             "if (ExitAsk.webos() || ExitAsk.tizen()) document.addEventListener('keydown', (e) => {\n      if (!(e.keyCode === 461 || e.keyCode === 10009 || e.key === 'XF86Back' || e.key === 'GoBack' || e.key === 'BrowserBack')) return;")
        once("if ((e.keyCode === 461 || e.key === 'GoBack' || e.key === 'BrowserBack') && X8.top())",
             "if ((e.keyCode === 461 || e.keyCode === 10009 || e.key === 'XF86Back' || e.key === 'GoBack' || e.key === 'BrowserBack') && X8.top())")
        once("Install MKCinema on it: Android TV, Fire TV and LG webOS have apps", "Install MKCinema on it: Android TV, Fire TV, LG webOS and Samsung (TizenBrew) have apps")
        once("'LG webOS app' : 'Android TV or Fire TV app'", "'LG webOS app' : /Tizen/i.test(navigator.userAgent) ? 'Samsung TV (TizenBrew)' : 'Android TV or Fire TV app'")
        js = open(os.path.join(here, 'samsung.js'), encoding='utf-8').read()
        assert '</script' not in js.lower()
        once('<script id="mkc-cfwa">', f'<script id="mkc-2272s">\n{js}</script>\n<script id="mkc-cfwa">')
        print('index.html: Samsung support added')
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    if newer(VER, cur):
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';"); print(f'APP_VERSION {cur} -> {VER}')
    open(p, 'w', encoding='utf-8').write(s)


def versions(root):
    sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
    cur = re.search(r"const VERSION = 'mkc-([\d.]+)';", w).group(1)
    if newer(VER, cur):
        open(sp, 'w', encoding='utf-8').write(w.replace(f"const VERSION = 'mkc-{cur}';", f"const VERSION = 'mkc-{VER}';"))
    vp = os.path.join(root, 'version.json'); v = json.load(open(vp, encoding='utf-8'))
    if newer(VER, v.get('web', '0.0.0')):
        v['web'] = VER
    json.dump(v, open(vp, 'w', encoding='utf-8')); print('version.json:', v)


if __name__ == '__main__':
    index(sys.argv[1]); versions(sys.argv[1])
