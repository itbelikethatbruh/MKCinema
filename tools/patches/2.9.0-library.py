#!/usr/bin/env python3
"""2.9.0 Lock-screen and media-key controls, Source rules, update prompt, a real Library (Drake, 2026-11-05).
Rebuilds the 2.8 feature block from 2.8.0-features. Usage: python3 -I this.py index.html sw.js   (on 2.8.7; idempotent)"""
import os, re, sys
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '2.8.0-features')
p, swp = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if "const APP_VERSION = '2.9.0'" in s: print('already applied'); sys.exit(0)
js = '\n'.join(open(os.path.join(here, 'js', f), encoding='utf-8').read() for f in sorted(os.listdir(os.path.join(here, 'js'))) if f.endswith('.js'))
css = open(os.path.join(here, 'features.css'), encoding='utf-8').read()
assert '</script' not in js.lower() and '</style' not in css.lower()
s, n = re.subn(r'<style id="mkc-28css">\n.*?\n</style>', lambda m: f'<style id="mkc-28css">\n{css}\n</style>', s, flags=re.S); assert n == 1
s, n = re.subn(r'<script id="mkc-28">\n.*?\n</script>', lambda m: f'<script id="mkc-28">\n{js}\n</script>', s, flags=re.S); assert n == 1
def sub(a, b):
    global s
    assert s.count(a) == 1, a[:60]
    s = s.replace(a, b, 1)
sub("Your watchlist and everything you have started. Saved in this browser.", "Your watchlist, your lists and everything you have started. Signed in, they follow you to every device.")
s, n = re.subn(r"const APP_VERSION = '2\.8\.9';", "const APP_VERSION = '2.9.0';", s); assert n == 1
open(p, 'w', encoding='utf-8').write(s)
sw = open(swp).read(); sw, n = re.subn(r"const VERSION = 'mkc-[\d.]+';", "const VERSION = 'mkc-2.9.0';", sw); assert n == 1; open(swp, 'w').write(sw)
import shutil; nd = os.path.join(os.path.dirname(os.path.abspath(p)), 'net'); shutil.copytree(os.path.join(here, 'net'), nd, dirs_exist_ok=True)  # network logos
import json; json.dump({'web': '2.9.0', 'android': '1.2.4', 'apk': 'https://mkcinema-site.pages.dev/download/MKCinema.apk'}, open(os.path.join(os.path.dirname(os.path.abspath(p)), 'version.json'), 'w'))
print('applied: 2.9.0')
