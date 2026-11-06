"""MKCinema 2.29.0: Anime look, manga frames. The 2.22 zigzag borders (menu bar, banner, every poster) give way to a
quieter manga design language: thin pink ink outlines with cut corners, corner brackets and hatch ticks, a faint
halftone on panel surfaces, and soft pink glows on hover. Posters stay clean until you point at one. CSS only.

Run once on a 2.28.x build:  python3 -I patch.py /path/to/mkcinema
  - index.html: <style id="mkc-229css"> right before <script id="mkc-cfwa">, the What's new entry, APP_VERSION.
  - sw.js and version.json: 2.29.0 unless the build is already newer.
"""
import os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.29.0'
NOTE = """  { v: '2.29.0', date: '2026-11-06', items: [
    ['better', 'Anime look, refined', 'The zigzag borders are gone. Panels now have thin pink outlines with cut corners, small manga details and a soft halftone, and posters stay clean until you point at one.'],
  ] },
"""


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    assert 'id="mkc-229css"' not in s, 'already applied'
    assert 'id="mkc-222css"' in s, 'needs the 2.22 comic look'
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    sys.path.insert(0, here); import svgs
    css = svgs.fill(open(os.path.join(here, 'manga.css'), encoding='utf-8').read())
    assert '%SVG_' not in css and '</style' not in css
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, f'<style id="mkc-229css">\n{css}</style>\n{a}')
    assert s.count('const RELEASES = [\n') == 1
    s = s.replace('const RELEASES = [\n', 'const RELEASES = [\n' + NOTE)
    bump = newer(VER, cur)
    if bump:
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
    open(p, 'w', encoding='utf-8').write(s)
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
