"""MKCinema 2.33.0: downloads on TVs (TV app 1.8.0) and to a USB drive or SD card, Slow internet mode, and playing the
Windows app's downloads on a TV over the home network (Windows app 1.4.0).

- index.html: style block mkc-233dcss + script block mkc-233d after the 2.14.0 Offline downloads block (mkc-215 follows it).
- What's new: a 2.33.0 entry (added to an existing 2.33.0 entry if another patch made one).
- Version 2.33.0 in APP_VERSION, sw.js and version.json, only when the build is lower.
- --android 1.8.0 also sets version.json "android" (run it only once that APK is on the download sites).

Run:  python3 -I patch.py /path/to/mkcinema [--android 1.8.0]      Idempotent.
"""
import json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.33.0'
ITEMS = [
    "    ['new', 'Download films on your TV', 'The TV app 1.8.0 downloads films and episodes to the TV or to a USB drive, and shows what fits. Watch them with no internet in Library › Downloads.'],\n",
    "    ['new', 'Play your computer’s downloads on your TV', 'In the Windows app 1.4.0, Library › Downloads › Share with my TV. Your TV plays them over your home Wi-Fi.'],\n",
    "    ['new', 'Slow internet mode', 'Smaller versions come first and the player loads further ahead, so it stops less. Settings › Playback.'],\n",
]


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def index(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    if 'id="mkc-233d"' in s:
        print('index.html: 2.33.0 block already there')
    else:
        js = open(os.path.join(here, 'tvdl.js'), encoding='utf-8').read() + open(os.path.join(here, 'pcshare.js'), encoding='utf-8').read()
        css = open(os.path.join(here, 'tvdl.css'), encoding='utf-8').read()
        assert '</script' not in js.lower() and '</style' not in css.lower()
        for need in ('const Offline = {', 'Offline.init();\n</script>', 'const SourceRules = {', 'function setCfg(', 'const RELEASES = [\n'):
            assert need in s, f'missing {need!r}'
        a = 'Offline.init();\n</script>\n'
        assert s.count(a) == 1
        s = s.replace(a, a + f'<style id="mkc-233dcss">\n{css}</style>\n<script id="mkc-233d">\n{js}</script>\n')
        print('index.html: TV downloads + Slow internet mode added')
    if "Download films on your TV" not in s:
        if "{ v: '2.33.0'" in s:
            m = re.search(r"\{ v: '2\.33\.0', date: '[^']*', items: \[\n", s)
            s = s[:m.end()] + ''.join(ITEMS) + s[m.end():]
        else:
            s = s.replace('const RELEASES = [\n', "const RELEASES = [\n  { v: '2.33.0', date: '2026-11-06', items: [\n" + ''.join(ITEMS) + '  ] },\n', 1)
        print("What's new: 2.33.0 items added")
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    if newer(VER, cur):
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';"); print(f'APP_VERSION {cur} -> {VER}')
    open(p, 'w', encoding='utf-8').write(s)


def versions(root, android):
    sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
    cur = re.search(r"const VERSION = 'mkc-([\d.]+)';", w).group(1)
    if newer(VER, cur):
        open(sp, 'w', encoding='utf-8').write(w.replace(f"const VERSION = 'mkc-{cur}';", f"const VERSION = 'mkc-{VER}';"))
    vp = os.path.join(root, 'version.json'); v = json.load(open(vp, encoding='utf-8'))
    if newer(VER, v.get('web', '0.0.0')):
        v['web'] = VER
    if android and newer(android, v.get('android', '0.0.0')):
        v['android'] = android
    json.dump(v, open(vp, 'w', encoding='utf-8')); print('version.json:', v)


if __name__ == '__main__':
    root = sys.argv[1]
    android = sys.argv[sys.argv.index('--android') + 1] if '--android' in sys.argv else None
    index(root); versions(root, android)
