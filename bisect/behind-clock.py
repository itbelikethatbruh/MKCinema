#!/usr/bin/env python3
"""2.95.8 behind the clock: on phones drawn edge to edge (Android app 1.17.13+, iPhone home-screen app) pictures
scroll up behind the clock and the camera under a soft fade, instead of a solid black band; the top menu is never
clipped by it. CSS only. python3 patch.py <APP_DIR>"""
import sys, os
F = os.path.join(sys.argv[1], 'index.html'); s = open(F, encoding='utf-8').read()
MARK = 'id="mk-2958-behind-clock"'
if MARK in s: print('already patched'); sys.exit()
css = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'behind.css'), encoding='utf-8').read().strip()
assert s.count('</head>') == 1
s = s.replace('</head>', '<style ' + MARK + '>\n' + css + '\n</style>\n</head>')
open(F, 'w', encoding='utf-8').write(s); print('patched')
