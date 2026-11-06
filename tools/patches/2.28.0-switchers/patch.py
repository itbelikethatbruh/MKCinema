#!/usr/bin/env python3
"""MKCinema 2.28.0: Arrange Home, kids seats by age rating, "Coming from Stremio?".

- index.html: style block mkc-228css + script block mkc-228 before mkc-cfwa (switchers.js, switchers.css).
  renderHome gives catalog rows and My watchlist stable keys (data-rk) so Arrange Home can tell them apart.
- index.html: What's new card after an update + Settings › More › What's new (block mkc-228w, whatsnew.js/css).
  Add each new release at the top of RELEASES in whatsnew.js.
- kids/ages.json: age ratings for 1,356 popular animation, family and kids titles (built with build_ages.py from TMDB).
- sw.js: kids/ages.json is cached like the language files, so kids seats keep their ratings offline.
- i18n: new strings for es, pt, fr, de, it, hi (only added when missing).
- Version: 2.28.0 in APP_VERSION, sw.js and version.json, only when the build is lower.

Run:  python3 -I patch.py /path/to/mkcinema      Idempotent.
"""
import json, os, re, shutil, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.28.0'


def rd(n):
    return open(os.path.join(here, n), encoding='utf-8').read()


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def index(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    def once(old, new):
        nonlocal s
        if new in s: return
        assert s.count(old) == 1, f'index.html: {old[:70]!r} found {s.count(old)} times'
        s = s.replace(old, new)
    once("const sec = rowShell(cat.name, `${cat.type} · ${cat.addon.manifest.name}`, { more: () => openCatalog(cat) }); rows.appendChild(sec);",
         "const sec = rowShell(cat.name, `${cat.type} · ${cat.addon.manifest.name}`, { more: () => openCatalog(cat) }); sec.dataset.rk = `cat:${cat.addon.manifest.id}/${cat.type}/${cat.id}`; rows.appendChild(sec);")
    once("const sec = rowShell('My watchlist', `${S.watchlist.length} saved`, { more: () => go('library') }); rows.appendChild(sec);",
         "const sec = rowShell('My watchlist', `${S.watchlist.length} saved`, { more: () => go('library') }); sec.dataset.rk = 'watchlist'; rows.appendChild(sec);")
    if 'id="mkc-228"' in s:
        print('index.html: 2.28.0 block already there')
    else:
        for need in ('const Seats = {', 'kidSafe(m) {', 'const SEAT_KEYS = [', 'const TOUR = [', 'function openStremioImport()', 'const X8 = {',
                     'function exportData', "{ id: 'home', icon:", 'const Keys = {', 'function setHeroList('):
            assert need in s, f'missing {need!r}'
        js, css = rd('switchers.js'), rd('switchers.css')
        assert '</script' not in js.lower() and '</style' not in css.lower()
        a = '<script id="mkc-cfwa">'
        assert s.count(a) == 1
        s = s.replace(a, f'<style id="mkc-228css">\n{css}</style>\n<script id="mkc-228">\n{js}</script>\n{a}')
    if 'id="mkc-228w"' in s:
        print('index.html: What\'s new block already there')
    else:
        js, css = rd('whatsnew.js'), rd('whatsnew.css')
        assert '</script' not in js.lower() and '</style' not in css.lower()
        a = '<script id="mkc-cfwa">'
        assert s.count(a) == 1 and 'const Updater = {' in s
        s = s.replace(a, f'<style id="mkc-228wcss">\n{css}</style>\n<script id="mkc-228w">\n{js}</script>\n{a}')
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    if newer(VER, cur):
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
        print(f'APP_VERSION {cur} -> {VER}')
    open(p, 'w', encoding='utf-8').write(s)


def ages(root):
    os.makedirs(os.path.join(root, 'kids'), exist_ok=True)
    shutil.copyfile(os.path.join(here, 'ages.json'), os.path.join(root, 'kids', 'ages.json'))
    print('kids/ages.json copied')


def i18n(root):
    tr = json.load(open(os.path.join(here, 'tr.json'), encoding='utf-8'))
    added = 0
    for code, add in tr.items():
        jp = os.path.join(root, 'i18n', f'{code}.json')
        if not os.path.exists(jp):
            continue
        d = json.load(open(jp, encoding='utf-8'))
        for k, v in add.items():
            if k not in d['strings']:
                d['strings'][k] = v; added += 1
        json.dump(d, open(jp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'i18n: {added} strings added')


def versions(root):
    sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
    old = r"/\/i18n\/[a-z]{2}\.json$/.test(url.pathname)"
    new = r"/\/(i18n\/[a-z]{2}|kids\/ages)\.json$/.test(url.pathname)"
    if new not in w:
        assert w.count(old) == 1, 'sw.js: i18n cache rule not found'
        w = w.replace(old, new)
    cur = re.search(r"const VERSION = 'mkc-([\d.]+)';", w).group(1)
    if newer(VER, cur):
        w = w.replace(f"const VERSION = 'mkc-{cur}';", f"const VERSION = 'mkc-{VER}';")
    open(sp, 'w', encoding='utf-8').write(w)
    vp = os.path.join(root, 'version.json'); v = json.load(open(vp, encoding='utf-8'))
    if newer(VER, v.get('web', '0.0.0')):
        v['web'] = VER
    json.dump(v, open(vp, 'w', encoding='utf-8'))
    print('version.json:', v)


if __name__ == '__main__':
    root = sys.argv[1]
    index(root); ages(root); i18n(root); versions(root)
