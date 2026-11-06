"""MKCinema 2.24.1: streams play in Safari on iPhone and iPad (and Safari on a Mac).

Failover gave each source 3.5 s, Safari often waits for a tap before loading, and it can't open MKV, so every
source "was slow to start" in turn. See safari.js for the details.

Run once on a 2.24.x build:  python3 -I patch.py /path/to/mkcinema
Idempotent: a build that already has the block is left alone.
"""
import os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.24.1'
MARK = 'id="mkc-safari"'


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    if MARK in s:
        print('2.24.1 Safari block already in', p); return
    for need in ('const Failover = {', 'function loadUrl(stream, startAt)', 'const PLATFORM = ', 'const HlsLoad = {'):
        assert need in s, f'missing {need!r}'
    js = open(os.path.join(here, 'safari.js'), encoding='utf-8').read()
    assert '</script' not in js
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, f'<script {MARK}>\n{js}</script>\n{a}')
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
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
    print(f'{VER} Safari block applied to {root} (version {"set to " + VER if bump else "kept at " + cur})')


if __name__ == '__main__':
    main(sys.argv[1])
