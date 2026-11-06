"""MKCinema 2.25.0: Sports hub.

A Sports section (top bar, phone bar, side menu, TV rail, command palette, #sports) that gathers live sports from the
user's OWN sources and sorts them by sport: Football, American football, Basketball, Baseball, Ice hockey, Fight
sports, Motorsport, Tennis, Cricket, Rugby, Golf, Cycling, More sports, Sports channels.

Sources read: every tv / channel / events catalog of the installed addons (only items that look like sport), any
other catalog whose own type, id or name says sport (everything in it), sporty genre options of those catalogs, and
the user's own TV playlists (channels whose name or group looks like sport). MKCinema bundles no sources.

Run once on a 2.24.x build:  python3 -I patch.py /path/to/mkcinema
Idempotent: a build that already has the block is left alone.
"""
import os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.25.0'
MARK = 'id="mkc-sports"'


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    if MARK in s:
        print('2.25.0 Sports block already in', p); return
    for need in ('const Channels = {', 'async function tuneChannel(ch)', 'const AnimeHub = {', 'const MKLog = {', 'id="view-tv"'):
        assert need in s, f'missing {need!r}'
    js = open(os.path.join(here, 'sports.js'), encoding='utf-8').read()
    css = open(os.path.join(here, 'sports.css'), encoding='utf-8').read()
    assert '</script' not in js and '</style' not in css
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, f'<style id="mkc-sportscss">\n{css}</style>\n<script {MARK}>\n{js}</script>\n{a}')
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
    print(f'{VER} Sports block applied to {root} (version {"set to " + VER if bump else "kept at " + cur})')


if __name__ == '__main__':
    main(sys.argv[1])
