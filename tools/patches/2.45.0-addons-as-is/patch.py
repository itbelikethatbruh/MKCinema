#!/usr/bin/env python3
"""2.45.0: existing addons shown better, with nothing for their developers to change. Ratings rows from the source
list become film-page ratings and a rating next to each episode, notice clips from debrid addons are explained and
skipped, and addons built with Stremio's SDK get their settings form on the Addons screen (works on TV).

Apply on top of 2.44.0 or later (the version only goes up). Re-runnable: it strips its own blocks and writes them again.
Usage: python3 -I patch.py <webroot>
"""
import sys, pathlib, re, json

HERE = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
VER = '2.45.0'
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8'); o = s
js = (HERE / 'module.js').read_text(encoding='utf-8'); css = (HERE / 'style.css').read_text(encoding='utf-8')
assert '</script' not in js.lower() and '</style' not in css.lower()

# 1. blocks at the end of the page, after every other player and film-page module
s = re.sub(r'<style id="mkc-245css">.*?</style>\n', '', s, flags=re.S)
s = re.sub(r'<script id="mkc-245">.*?</script>\n', '', s, flags=re.S)
assert s.count('</body>') == 1
s = s.replace('</body>', f'<style id="mkc-245css">\n{css}</style>\n<script id="mkc-245">\n{js}</script>\n</body>', 1)

# 2. What's new + version (only goes up)
if f"{{ v: '{VER}'" not in s:
    a = 'const RELEASES = [\n'; assert s.count(a) == 1
    # newest first: go in front of the first entry older than this one (a later release may already be on top)
    i0 = s.index(a) + len(a); at = i0
    for mm in re.finditer(r"^  \{ v: '(\d+\.\d+\.\d+)'", s[i0:i0 + 200000], flags=re.M):
        if tuple(int(x) for x in mm.group(1).split('.')) < tuple(int(x) for x in VER.split('.')): at = i0 + mm.start(); break
    s = s[:at] + f"""  {{ v: '{VER}', date: '2026-11-07', items: [
    ['new', 'Ratings where you look', 'Ratings addons that used to add a row to the source list now show their scores on the film page and next to each episode.'],
    ['better', 'Clearer source problems', 'When an addon plays a short notice instead of the film, MKCinema says why and moves on to the next source.'],
    ['new', 'Addon settings, TV included', 'Addons that describe their settings can be set up right on the Addons screen, with the remote too.'],
  ] }},
""" + s[at:]
def vt(v): return tuple(int(x) for x in v.split('.'))
m = re.search(r"const APP_VERSION = '(\d+\.\d+\.\d+)';", s)
if vt(m.group(1)) < vt(VER): s = s.replace(m.group(0), f"const APP_VERSION = '{VER}';", 1)

# 3. inline icon subset: icons this module names
lj = HERE.parent / '2.7.35-perf' / 'lucide-0.454.0-icons.json'
mi = re.search(r'(<script id="mkc-icons">[^\n]*\n)window\.lucide=\{icons:(\{.*?\}),createElement', s, flags=re.S)
if lj.exists() and mi:
    full = json.loads(lj.read_text(encoding='utf-8')); have = json.loads(mi.group(2))
    pascal = lambda n: ''.join(p[:1].upper() + p[1:] for p in n.split('-'))
    want = ['settings-2', 'message-square-text', 'refresh-cw', 'layers', 'star', 'check', 'x']
    add = {pascal(n): full[pascal(n)] for n in want if pascal(n) in full and pascal(n) not in have}
    if add:
        have.update(add); s = s[:mi.start(2)] + json.dumps(have, separators=(',', ':')) + s[mi.end(2):]
    print('icons added:', sorted(add) or 'none')
else: print('icons: inline set not found, skipped')

if s != o: ix.write_text(s, encoding='utf-8'); print('index.html changed')
sw = root / 'sw.js'
if sw.exists():
    t = sw.read_text(encoding='utf-8'); mv = re.search(r"const VERSION = 'mkc-(\d+\.\d+\.\d+)';", t)
    if mv and vt(mv.group(1)) < vt(VER): sw.write_text(t.replace(mv.group(0), f"const VERSION = 'mkc-{VER}';", 1), encoding='utf-8'); print('sw.js changed')
vj = root / 'version.json'
if vj.exists():
    t = vj.read_text(encoding='utf-8'); mw = re.search(r'"web": "(\d+\.\d+\.\d+)"', t)
    if mw and vt(mw.group(1)) < vt(VER): vj.write_text(t.replace(mw.group(0), f'"web": "{VER}"', 1), encoding='utf-8'); print('version.json changed')
print('2.45.0 addons as they are: done')
