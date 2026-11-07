#!/usr/bin/env python3
"""2.8.2 TV Home (Dee, 2026-11-05): banner arrows for the remote, rows that stop at their ends instead of jumping away,
Networks (Netflix, Disney+, HBO Max and more), and Where to watch showing each service once (rent and buy share a row).
The 2.8 feature block is rebuilt from tools/patches/2.8.0-features (which now holds js/90-tvhome.js and the fixes).
Usage: python3 -I this.py index.html sw.js   (on 2.8.1; idempotent)"""
import os, re, sys
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '2.8.0-features')
p, swp = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if "const APP_VERSION = '2.8.2'" in s: print('already applied'); sys.exit(0)
js = '\n'.join(open(os.path.join(here, 'js', f), encoding='utf-8').read() for f in sorted(os.listdir(os.path.join(here, 'js'))) if f.endswith('.js'))
css = open(os.path.join(here, 'features.css'), encoding='utf-8').read()
assert '</script' not in js.lower() and '</style' not in css.lower()
s, n = re.subn(r'<style id="mkc-28css">\n.*?\n</style>', lambda m: f'<style id="mkc-28css">\n{css}\n</style>', s, flags=re.S); assert n == 1
s, n = re.subn(r'<script id="mkc-28">\n.*?\n</script>', lambda m: f'<script id="mkc-28">\n{js}\n</script>', s, flags=re.S); assert n == 1
s, n = re.subn(r"const APP_VERSION = '2\.8\.1';", "const APP_VERSION = '2.8.2';", s); assert n == 1
open(p, 'w', encoding='utf-8').write(s)
sw = open(swp).read(); sw, n = re.subn(r"const VERSION = 'mkc-[\d.]+';", "const VERSION = 'mkc-2.8.2';", sw); assert n == 1; open(swp, 'w').write(sw)
print('applied: 2.8.2')
