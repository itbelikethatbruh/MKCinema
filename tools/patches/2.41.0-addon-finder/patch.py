#!/usr/bin/env python3
"""2.41.0 Addon Finder: the community addon list ships with the app (addons/directory.json), so it opens at once and
no longer fails when stremio-addons.net is slow or down; results are no longer hidden by ad blockers (no "ad-" class
names, in the app and on the phone remote); ranked search; one-press install; guided setup in the row for addons that
need settings (QR to the phone on TV); a simpler Addons screen (Find addons first, link box, Your addons, Advanced).

Apply on top of 2.39.0 (any later version works too; the version only goes up). Re-runnable: a second run refreshes the
block, the CSS and the directory snapshot.
Usage: python3 -I patch.py <webroot> [--no-fetch]
  --no-fetch  do not download the lists; use the snapshot bundled next to this script
"""
import sys, pathlib, re, subprocess, shutil

HERE = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '/mnt/project-files/mkcinema')
VER = '2.41.0'
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8'); o = s
js = (HERE / 'module.js').read_text(encoding='utf-8').rstrip('\n') + '\n'
css = (HERE / 'style.css').read_text(encoding='utf-8').rstrip('\n')
assert '</script' not in js.lower() and '</style' not in css.lower()

# 1. the Addon Finder replaces the 2.9 addon directory block (TvType above it stays)
NEW = '/* ---------------- 2.41.0 Addon Finder ----------------'
if NEW in s:
    s, n = re.subn(re.escape(NEW) + r'.*?\nAddonDir\.init\(\);\n', lambda m: js, s, count=1, flags=re.S); assert n == 1, 'finder block'
else:
    s, n = re.subn(r"const AddonDir = \{\n  URL: 'https://stremio-addons\.net.*?\nAddonDir\.init\(\);\n", lambda m: js, s, count=1, flags=re.S); assert n == 1, 'old AddonDir block'

# 2. styles (own tag, refreshed on every run); the old .ad-* rules go
STYLE = f'<style id="mkc-241a">\n{css}\n</style>\n'
if '<style id="mkc-241a">' in s:
    s = re.sub(r'<style id="mkc-241a">\n.*?\n</style>\n', lambda m: STYLE, s, count=1, flags=re.S)
else:
    assert s.count('</head>') == 1; s = s.replace('</head>', STYLE + '</head>', 1)
s = re.sub(r'/\* Addon directory \*/\n(?:\.ad-[^\n]*\n)+@media \(max-width:640px\)\{\.ad-item[^\n]*\n', '', s, count=1)

# 3. the phone add-ons card on the TV: "ph-ad" is a class ad blockers hide
s = s.replace(".ph-ad{display:flex", ".phx-card{display:flex").replace(".ph-ad .qr-wrap{", ".phx-card .qr-wrap{").replace("el.className = 'ph-ad';", "el.className = 'phx-card';")

# 4. version (only ever goes up) and What's new
def vt(v): return tuple(int(x) for x in v.split('.'))
m = re.search(r"const APP_VERSION = '(\d+\.\d+\.\d+)';", s); cur = m.group(1)
if vt(cur) < vt(VER): s = s.replace(m.group(0), f"const APP_VERSION = '{VER}';", 1)
if f"{{ v: '{VER}'" not in s:
    a = 'const RELEASES = [\n'; assert s.count(a) == 1
    s = s.replace(a, a + f"""  {{ v: '{VER}', date: '2026-11-06', items: [
    ['new', 'Find addons', 'Search the community addon list right from Addons and install most addons in one press. The list opens instantly and filters by streams, catalogs, subtitles, anime and more.'],
    ['better', 'Easier addon setup', 'Addons that need your settings now walk you through it in their own row: set it up, copy the link, press Paste and install. On a TV, scan a QR code to set it up on your phone.'],
    ['better', 'A simpler Addons screen', 'Find addons comes first, then a box for addon links and your addons. The stream proxy and local helpers moved under Advanced.'],
  ] }},
""", 1)
if s != o: ix.write_text(s, encoding='utf-8'); print('index.html changed')

# 5. phone remote: its add-on list used "ad-" class names too
rp = root / 'remote.html'
if rp.exists():
    t = rp.read_text(encoding='utf-8')
    t2 = re.sub(r'(?<![\w-])ad-(row|txt|list|logo|sw|ib|empty)(?![\w-])', r'pa-\1', t)
    if t2 != t: rp.write_text(t2, encoding='utf-8'); print('remote.html changed')

# 6. service worker: the snapshot is an app file (served from the cache, refreshed behind it); cache name follows the version
sw = root / 'sw.js'; t = sw.read_text(encoding='utf-8'); t2 = t
if 'addons\\/directory\\.json' not in t2:
    t2 = t2.replace("const LOCAL = /\\/(?:i18n", "const LOCAL = /\\/(?:addons\\/directory\\.json|i18n", 1)
    assert t2 != t, 'sw LOCAL'
mv = re.search(r"const VERSION = 'mkc-(\d+\.\d+\.\d+)';", t2)
if mv and vt(mv.group(1)) < vt(VER): t2 = t2.replace(mv.group(0), f"const VERSION = 'mkc-{VER}';", 1)
if t2 != t: sw.write_text(t2, encoding='utf-8'); print('sw.js changed')
vj = root / 'version.json'
if vj.exists():
    t = vj.read_text(encoding='utf-8'); mw = re.search(r'"web": "(\d+\.\d+\.\d+)"', t)
    if mw and vt(mw.group(1)) < vt(VER): vj.write_text(t.replace(mw.group(0), f'"web": "{VER}"', 1), encoding='utf-8'); print('version.json changed')

# 7. the directory snapshot: fresh from the two lists, else the bundled copy
out = root / 'addons' / 'directory.json'
ok = False
if '--no-fetch' not in sys.argv:
    r = subprocess.run([sys.executable, '-I', str(HERE / 'build_directory.py'), str(root)], capture_output=True, text=True)
    print((r.stdout or r.stderr).strip()); ok = r.returncode == 0
if not ok and not out.exists():
    out.parent.mkdir(parents=True, exist_ok=True); shutil.copy(HERE / 'directory.json', out); print('directory: bundled snapshot copied')
if ok: shutil.copy(out, HERE / 'directory.json')  # keep the bundled copy current

# 8. inline icon set: add the icons the Finder names (the app loads the whole icon library for a missing one)
import json
lj = HERE.parent / '2.7.35-perf' / 'lucide-0.454.0-icons.json'
if lj.exists():
    full = json.loads(lj.read_text(encoding='utf-8'))
    pascal = lambda n: re.sub(r'(\w)(\w*)(_|-|\s*)', lambda m: m.group(1).upper() + m.group(2).lower(), n)
    s = ix.read_text(encoding='utf-8')
    m = re.search(r'(<script id="mkc-icons">[^\n]*\n)window\.lucide=\{icons:(\{.*?\}),createElement', s, flags=re.S)
    if m:
        have = json.loads(m.group(2))
        want = set(re.findall(r'data-lucide="([a-z0-9-]+)"', js)) | set(re.findall(r"\['\w+', '[^']+', '([a-z0-9-]+)'\]", js))
        add = {pascal(n): full[pascal(n)] for n in sorted(want) if pascal(n) in full and pascal(n) not in have}
        if add:
            have.update(add)
            s = s[:m.start(2)] + json.dumps(have, separators=(',', ':')) + s[m.end(2):]
            ix.write_text(s, encoding='utf-8')
        print('icons added:', sorted(add) or 'none')
    else: print('icons: inline set not found, skipped')
print('2.41.0 addon finder: done')
