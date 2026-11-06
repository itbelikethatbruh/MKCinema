#!/usr/bin/env python3
"""Web 2.35.1 row header fix (Drake, 2026-11-06: "Every film in order is being cut off in a mobile browser").
.rail has padding-top 18px + margin-top -18px. .uni-rail (2.34.0) and .net-rail cut the padding to 4/6px but kept
the -18px margin, so the Universes cards rose 14px over the header and covered "See all" (Networks logos 12px).
Fix: match the margin to the padding outside TV (TV rails use their own 24px pair). Idempotent.
Usage: python3 -I patch.py /mnt/project-files/mkcinema"""
import sys, re, json, pathlib
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
VER = '2.35.1'
newer = lambda a, b: tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))
CSS = """html:not(.tv) .uni-rail{margin-top:-4px}
html:not(.tv) .net-rail{margin-top:-6px}
"""
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8')
s = re.sub(r'<style id="mkc-2351css">.*?</style>\n', '', s, flags=re.S)
assert s.count('</body>') == 1
s = s.replace('</body>', f'<style id="mkc-2351css">\n{CSS}</style>\n</body>', 1)
if "{ v: '2.35.1'" not in s:
    s = s.replace("const RELEASES = [\n", """const RELEASES = [
  { v: '2.35.1', date: '2026-11-06', items: [
    ['better', 'Universes header on phones', 'The franchise cards no longer cover “See all” and the “every film in order” line.'],
  ] },
""", 1)
cur = re.search(r"const APP_VERSION = '([\d.]+)'", s).group(1)
if newer(VER, cur):
    s = s.replace(f"const APP_VERSION = '{cur}'", f"const APP_VERSION = '{VER}'")
    sw = root / 'sw.js'; t = sw.read_text(); sw.write_text(re.sub(r"const VERSION = 'mkc-[\d.]+'", f"const VERSION = 'mkc-{VER}'", t))
    vj = root / 'version.json'; j = json.loads(vj.read_text()); j['web'] = VER; vj.write_text(json.dumps(j, indent=2) + '\n')
ix.write_text(s, encoding='utf-8')
print('ok', VER)
