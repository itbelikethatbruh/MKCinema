#!/usr/bin/env python3
"""2.42.0 Welcome tour and Get started, redesigned.
- Tour: never scrolls on any screen (compact levels, then scale), six steps covering current features, the favorites
  step shows only the posters that fit (Show others pages through), new top bar and ready step.
- Get started: a fair player choice (MKCinema player or any outside app on this device), one-tap starter addons,
  debrid marked optional, and an Experienced track (import, paste many links, where the advanced settings live).
Usage: python3 -I patch.py <webroot>   (idempotent: the two blocks are replaced on every run; version bump only if lower)
Run the 2.7.35-perf patch afterwards so the inline icon set picks up new icon names."""
import sys, pathlib, re, json
here = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8'); o = s

# 1. the module (style + script), replaced on every run so a re-run picks up edits
css = (here / 'tour.css').read_text(encoding='utf-8') + '\n' + (here / 'guide.css').read_text(encoding='utf-8')
js = (here / 'tour.js').read_text(encoding='utf-8') + '\n' + (here / 'guide.js').read_text(encoding='utf-8')
block = '<style id="mkc-242tcss">\n' + css + '</style>\n<script id="mkc-242t">\n' + js + '</script>\n'
s = re.sub(r'<style id="mkc-242tcss">.*?</style>\n<script id="mkc-242t">.*?</script>\n', '', s, flags=re.S)
a = '</body>'
assert s.count(a) == 1, ('anchor', s.count(a))
s = s.replace(a, block + a, 1)

# 2. What's new + version
VER = '2.42.0'
if "{ v: '%s'" % VER not in s:
    a = 'const RELEASES = [\n'
    assert s.count(a) == 1
    s = s.replace(a, a + """  { v: '%s', date: '2026-11-06', items: [
    ['better', 'A new welcome tour', 'Redesigned from the first screen to the last, with everything MKCinema does today. It fits your screen, so nothing scrolls, on a phone, a computer or a TV.'],
    ['better', 'Get started, rewritten', 'Pick the MKCinema player or any player app you like, install a few popular addons in one tap, and skip the debrid step if you do not use one. Used Stremio before? Its own tab imports everything or installs a whole list of addon links at once.'],
  ] },
""" % VER, 1)
else:
    # 2.42.0 already has an entry (another 2.42.0 change shipped first): add ours to it once
    if "'A new welcome tour'" not in s:
        a = "  { v: '%s', date: '2026-11-06', items: [\n" % VER
        assert s.count(a) == 1
        s = s.replace(a, a + """    ['better', 'A new welcome tour', 'Redesigned from the first screen to the last, with everything MKCinema does today. It fits your screen, so nothing scrolls, on a phone, a computer or a TV.'],
    ['better', 'Get started, rewritten', 'Pick the MKCinema player or any player app you like, install a few popular addons in one tap, and skip the debrid step if you do not use one. Used Stremio before? Its own tab imports everything or installs a whole list of addon links at once.'],
""", 1)
def vt(v): return tuple(int(x) for x in v.split('.'))
m = re.search(r"const APP_VERSION = '([\d.]+)';", s)
if vt(m.group(1)) < vt(VER): s = s.replace(m.group(0), "const APP_VERSION = '%s';" % VER, 1)
# 3. refresh the inline icon set (same method as the 2.7.35 perf patch, whose head anchors have since moved)
LJ = next((x for x in [here / 'lucide-0.454.0-icons.json', here.parent / '2.7.35-perf' / 'lucide-0.454.0-icons.json'] if x.exists()), None)
if LJ and '<script id="mkc-icons">' in s:
    full = json.loads(LJ.read_text())
    pascal = lambda n: re.sub(r'(\w)(\w*)(_|-|\s*)', lambda m: m.group(1).upper() + m.group(2).lower(), n)
    body = re.sub(r'<script id="mkc-icons">.*?</script>', '', s, flags=re.S)
    names = set(re.findall(r'data-lucide="([a-z0-9-]+)"', body))
    names |= {t for t in re.findall(r"['\"]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['\"]", body) if pascal(t) in full}
    used = {pascal(n): full[pascal(n)] for n in sorted(names) if pascal(n) in full}
    cur = re.search(r'<script id="mkc-icons">(.*?)window\.lucide=\{icons:(\{.*?\}),createElement', s, flags=re.S)
    assert cur, 'icon block layout changed'
    have = json.loads(cur.group(2)); have.update(used)
    s = s[:cur.start(2)] + json.dumps(have, separators=(',', ':')) + s[cur.end(2):]
else:
    print('WARNING: icon set not refreshed (lucide json or mkc-icons block missing)')

if s != o: ix.write_text(s, encoding='utf-8'); print('index.html changed')

sw = root / 'sw.js'; t = sw.read_text(); m = re.search(r"const VERSION = 'mkc-([\d.]+)';", t)
if m and vt(m.group(1)) < vt(VER): sw.write_text(t.replace(m.group(0), "const VERSION = 'mkc-%s';" % VER)); print('sw.js changed')
vj = root / 'version.json'; d = json.loads(vj.read_text())
if vt(d['web']) < vt(VER): d['web'] = VER; vj.write_text(json.dumps(d, indent=2) + '\n'); print('version.json changed')
