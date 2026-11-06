#!/usr/bin/env python3
"""2.42.0 Addon looks: Stremio addons can shape how their own content shows in MKCinema, with data only (row style,
placement, poster badges, film-page panels), validated against a fixed schema and drawn by MKCinema. Stremio's standard
posterShape is honoured. Any addon catalog can be pinned as a Library tab ("Add from addons").
Spec: docs/addon-looks.md in the repo.

Apply on top of 2.39.0 or later (the version only goes up). Re-runnable: it strips its own blocks and writes them again.
Usage: python3 -I patch.py <webroot>
"""
import sys, pathlib, re, json

HERE = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
VER = '2.42.0'
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8'); o = s
js = (HERE / 'module.js').read_text(encoding='utf-8'); css = (HERE / 'style.css').read_text(encoding='utf-8')
assert '</script' not in js.lower() and '</style' not in css.lower()

def rep(old, new):
    global s
    if new in s: return
    assert s.count(old) == 1, ('anchor', old[:90], s.count(old))
    s = s.replace(old, new, 1)

# 1. Home: catalogs an addon keeps in Discover or Library leave Home; rows use the addon's style or Stremio's posterShape
rep("engine.catalogs().filter((c) => c.type !== 'tv' && (lay.traktLists || !Layout.traktList(c)))",
    "engine.catalogs().filter((c) => c.type !== 'tv' && (lay.traktLists || !Layout.traktList(c)) && (typeof AddonUI === 'undefined' || AddonUI.place(c) === 'home'))")
rep("{ const shown = IS_TV ? 24 : 40; fillRail(sec, metas.slice(0, shown).map((m) => cardHTML(m)).join(''));",
    "{ const shown = IS_TV ? 24 : 40; const ax = typeof AddonUI === 'undefined' ? 'poster' : AddonUI.layout(cat, metas); sec._ax = ax; if (ax !== 'poster') sec.classList.add(`ax-${ax}`); fillRail(sec, metas.slice(0, shown).map((m, k) => (ax === 'poster' ? cardHTML(m) : AddonUI.card(m, ax, k))).join(''));")
# 2. endless rows keep the row's style
rep("if (take.length) { rail.insertAdjacentHTML('beforeend', take.map((m) => cardHTML(m)).join(''));",
    "if (take.length) { const sx = rail.closest('section'), ax = (sx && sx._ax) || 'poster', k0 = st.count - take.length; rail.insertAdjacentHTML('beforeend', take.map((m, k) => (ax === 'poster' ? cardHTML(m) : AddonUI.card(m, ax, k0 + k))).join(''));")

# 2b. Home removes posters already shown higher up, except in Top 10 rows; an addon's Top 10 row keeps all ten too
old = "isTop = sec.dataset.curate === 'top10';"
if old in s and "sec.classList.contains('ax-top10')" not in s:
    s = s.replace(old, "isTop = sec.dataset.curate === 'top10' || sec.classList.contains('ax-top10');", 1)
elif "sec.classList.contains('ax-top10')" not in s: print('WARNING: Home de-duplication anchor not found; addon Top 10 rows may skip numbers')

# 3. blocks at the end of the page (after Library, Settings and every renderDetail wrapper)
s = re.sub(r'<style id="mkc-242axcss">.*?</style>\n', '', s, flags=re.S)
s = re.sub(r'<script id="mkc-242ax">.*?</script>\n', '', s, flags=re.S)
assert s.count('</body>') == 1
s = s.replace('</body>', f'<style id="mkc-242axcss">\n{css}</style>\n<script id="mkc-242ax">\n{js}</script>\n</body>', 1)

# 4. What's new + version (only goes up)
if f"{{ v: '{VER}'" not in s:
    a = 'const RELEASES = [\n'; assert s.count(a) == 1
    s = s.replace(a, a + f"""  {{ v: '{VER}', date: '2026-11-06', items: [
    ['new', 'Addon lists in Library', 'Show any list from your addons as its own Library tab. Open Library and press Add from addons.'],
    ['new', 'Addon looks', 'Addons can now choose how their rows look (wide, square or Top 10), add small badges to their posters and an info box to film pages, always in your theme. Turn it off per addon in Settings › Appearance.'],
    ['better', 'Square and wide rows', 'Addons that ask for square or wide pictures now get them, instead of tall posters.'],
  ] }},
""", 1)
def vt(v): return tuple(int(x) for x in v.split('.'))
m = re.search(r"const APP_VERSION = '(\d+\.\d+\.\d+)';", s)
if vt(m.group(1)) < vt(VER): s = s.replace(m.group(0), f"const APP_VERSION = '{VER}';", 1)

# 5. inline icon subset: icons this module names
lj = HERE.parent / '2.7.35-perf' / 'lucide-0.454.0-icons.json'
mi = re.search(r'(<script id="mkc-icons">[^\n]*\n)window\.lucide=\{icons:(\{.*?\}),createElement', s, flags=re.S)
if lj.exists() and mi:
    full = json.loads(lj.read_text(encoding='utf-8')); have = json.loads(mi.group(2))
    pascal = lambda n: ''.join(p[:1].upper() + p[1:] for p in n.split('-'))
    want = ['blocks', 'external-link', 'x', 'film', 'tv', 'star', 'award', 'trophy', 'flame', 'heart', 'check', 'clock', 'sparkles']
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
# 6. the showcase addon (static, catalog only) at /addons/showcase/, readable by other apps (CORS)
import shutil
src = HERE / 'showcase'
if src.exists():
    dst = root / 'addons' / 'showcase'
    if dst.exists(): shutil.rmtree(dst)
    shutil.copytree(src, dst); print('showcase addon copied')
hd = root / '_headers'
if hd.exists():
    t = hd.read_text(encoding='utf-8')
    if '/addons/showcase/*' not in t:
        hd.write_text(t.rstrip('\n') + '\n\n# The Addon looks showcase is a public Stremio addon: any app may read it\n/addons/showcase/*\n  Access-Control-Allow-Origin: *\n', encoding='utf-8'); print('_headers changed')
print('2.42.0 addon looks: done')
