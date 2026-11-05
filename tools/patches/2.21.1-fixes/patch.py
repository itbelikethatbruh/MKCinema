"""MKCinema 2.21.1: phone side menu feedback, a pencil on every seat in Who's watching, nicer default main-seat
name, and the status page layout fix (status.html regenerated from patches/2.21.0-gaps/pages).

Run once on a 2.21.x build:  python3 -I patch.py /path/to/mkcinema
"""
import os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
gaps = os.path.join(here, '..', '2.21.0-gaps')
VER = '2.21.1'


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    assert 'id="mkc-2211"' not in s, 'already applied'
    assert 'id="mkc-221"' in s, 'needs 2.21.0'
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    key = re.search(r"SUPABASE_PROJECT = \{ url: '[^']+', anonKey: '(sb_publishable_[A-Za-z0-9_-]+)' \}", s).group(1)
    rd = lambda d, n: open(os.path.join(d, n), encoding='utf-8').read()
    css, js = rd(here, 'style.css'), rd(here, 'fixes.js')
    assert '</script' not in js and '</style' not in css
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, f'<style id="mkc-2211css">\n{css}</style>\n<script id="mkc-2211">\n{js}</script>\n{a}')
    bump = newer(VER, cur)
    if bump:
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
    open(p, 'w', encoding='utf-8').write(s)
    h = rd(gaps, 'pages/status.html').replace('/*BASE*/', rd(gaps, 'pages/_base.css')).replace('%KEY%', key)
    open(os.path.join(root, 'status.html'), 'w', encoding='utf-8').write(h)
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
