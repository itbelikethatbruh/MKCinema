#!/usr/bin/env python3
"""Web 2.36.0 Sharp upscaling (Drake, 2026-11-06).
A WebGL pass that
sharpens (CAS) at the video's size and upscales with clamped Catmull-Rom to the screen's real pixels, only when the
screen is clearly bigger than the video. Off by default, never on TVs, auto-off when frames drop. See app.js header.
Adds app.css + app.js to index.html, a What's new entry, and bumps the version. Idempotent.
Usage: python3 -I patch.py /mnt/project-files/mkcinema"""
import sys, re, json, pathlib
here = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
VER = '2.36.0'
newer = lambda a, b: tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8')
css = (here / 'app.css').read_text(encoding='utf-8'); js = (here / 'app.js').read_text(encoding='utf-8')
s = re.sub(r'<style id="mkc-236css">.*?</style>\n', '', s, flags=re.S)
s = re.sub(r'<script id="mkc-236">.*?</script>\n', '', s, flags=re.S)
block = f'<style id="mkc-236css">\n{css}</style>\n<script id="mkc-236">\n\'use strict\';\n{js}</script>\n'
assert s.count('</body>') == 1
s = s.replace('</body>', block + '</body>', 1)
if "{ v: '2.36.0'" not in s:
    s = s.replace("const RELEASES = [\n", """const RELEASES = [
  { v: '2.36.0', date: '2026-11-06', items: [
    ['new', 'Sharp upscaling', 'Videos smaller than your screen are sharpened and upscaled on your own graphics chip, so 720p and 1080p look crisper on big screens. Files that already match your screen play untouched. Player › Picture, or Settings › Playback. Off by default, not on TVs.'],
  ] },
""", 1)
cur = re.search(r"const APP_VERSION = '([\d.]+)'", s).group(1)
if newer(VER, cur):
    s = s.replace(f"const APP_VERSION = '{cur}'", f"const APP_VERSION = '{VER}'")
    sw = root / 'sw.js'; t = sw.read_text(); sw.write_text(re.sub(r"const VERSION = 'mkc-[\d.]+'", f"const VERSION = 'mkc-{VER}'", t))
    vj = root / 'version.json'; j = json.loads(vj.read_text()); j['web'] = VER; vj.write_text(json.dumps(j, indent=2) + '\n')
ix.write_text(s, encoding='utf-8')
print('ok', VER)
