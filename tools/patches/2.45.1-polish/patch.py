#!/usr/bin/env python3
"""2.45.1 polish: tour feature icons centred, bigger posters on Pick three favorites, side menu slides open smoothly and returns to the top when you leave it.
Usage: python3 -I patch.py <webroot>  (idempotent; apply after 2.42.0-tour-guide; no version bump of its own,
ships inside the next release)"""
import sys, pathlib, re
here = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8')
s = re.sub(r'<style id="mkc-2451css">.*?</style>\n<script id="mkc-2451">.*?</script>\n', '', s, flags=re.S)
block = ('<style id="mkc-2451css">\n' + (here / 'fix.css').read_text() + '</style>\n<script id="mkc-2451">\n'
         + (here / 'fix.js').read_text() + '</script>\n')
assert s.count('</body>') == 1 and 'const Tour240' in s
s = s.replace('</body>', block + '</body>', 1)
ix.write_text(s, encoding='utf-8'); print('2.45.1 polish applied')
