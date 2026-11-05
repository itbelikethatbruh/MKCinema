"""MKCinema 2.22.0: the Anime look, comic edition. A new anime MKCinema logo, Dela Gothic One titles with ink and
crimson shadows, an anime icon set, comic-panel posters, slash wipes, impact bursts, a redrawn Miko and a layered
night city with parallax. Full effects only on fast devices, with a self-check that steps down to Calm.

Run once on a 2.21.x+ build:  python3 -I patch.py /path/to/mkcinema
  - index.html: <style id="mkc-222css"> and <script id="mkc-222"> right before <script id="mkc-cfwa">.
  - anime/: miko.svg (redrawn), scene-back.webp + scene-near.webp (baked from gen_scene.py's SVGs by bake.js), branch.svg.
  - sw.js and version.json: 2.22.0 unless newer.
"""
import os, re, shutil, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.22.0'


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    assert 'id="mkc-222"' not in s, 'already applied'
    assert 'const AnimeLook' in s, 'needs the 2.16 Anime look'
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    rd = lambda n: open(os.path.join(here, n), encoding='utf-8').read()
    sys.path.insert(0, here); import gen_jag
    css, js = gen_jag.fill(rd('comic.css')), rd('icons.js') + '\n' + rd('comic.js')
    assert '%JAG_' not in css
    assert '</script' not in js and '</style' not in css
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, f'<style id="mkc-222css">\n{css}</style>\n<script id="mkc-222">\n\'use strict\';\n{js}</script>\n{a}')
    bump = newer(VER, cur)
    if bump:
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
    open(p, 'w', encoding='utf-8').write(s)
    os.makedirs(os.path.join(root, 'anime'), exist_ok=True)
    for n in ('miko.svg', 'scene-back.webp', 'scene-near.webp', 'branch.svg'):
        shutil.copyfile(os.path.join(here, 'anime', n), os.path.join(root, 'anime', n))
    if bump:
        sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
        w2 = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{VER}';", w); assert w2 != w
        open(sp, 'w', encoding='utf-8').write(w2)
        vp = os.path.join(root, 'version.json'); v = open(vp, encoding='utf-8').read()
        v2 = re.sub(r'"web":\s*"[\d.]+"', f'"web": "{VER}"', v); assert v2 != v
        open(vp, 'w', encoding='utf-8').write(v2)
    print(f'{VER} applied to {root} (version {"set to " + VER if bump else "kept at " + cur})')


if __name__ == '__main__':
    main(sys.argv[1])
