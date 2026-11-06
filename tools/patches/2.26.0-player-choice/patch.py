"""MKCinema 2.26.0: first-launch player choice.

A step in the welcome walkthrough, right after the welcome screen, asks where streams should play (MKCinema's
player, the TV's own player in the TV app, or an outside app such as VLC) and explains Browser only mode.
It writes the same settings as Settings › Playback. People who skipped the walkthrough before this step, or
finished it before 2.26.0 without picking a player, see this one step on its own, once per device.

Run once on a 2.25.x build:  python3 -I patch.py /path/to/mkcinema
Idempotent: a build that already has the block is left alone (translations are only added if missing).
"""
import json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.26.0'
MARK = 'id="mkc-playerask"'


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
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
    if MARK in s:
        print('2.26.0 player choice block already in', p, f'({added} translations added)'); return
    for need in ('const TOUR = [', 'function renderTour()', 'function endTour()', 'function tourGo(d)', 'const BrowserPlay = {',
                 'const extPlayerId = ', 'const Guide = {', 'function tourMore()', "$('#tourSkip').onclick = endTour;"):
        assert need in s, f'missing {need!r}'
    js = open(os.path.join(here, 'player-choice.js'), encoding='utf-8').read()
    css = open(os.path.join(here, 'player-choice.css'), encoding='utf-8').read()
    assert '</script' not in js and '</style' not in css
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, f'<style id="mkc-playeraskcss">\n{css}</style>\n<script {MARK}>\n{js}</script>\n{a}')
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    bump = newer(VER, cur)
    if bump:
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
    open(p, 'w', encoding='utf-8').write(s)
    if bump:
        sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
        w2 = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{VER}';", w); assert w2 != w or f"'mkc-{VER}'" in w
        open(sp, 'w', encoding='utf-8').write(w2)
        vp = os.path.join(root, 'version.json'); v = open(vp, encoding='utf-8').read()
        v2 = re.sub(r'"web":\s*"[\d.]+"', f'"web": "{VER}"', v); assert v2 != v or f'"{VER}"' in v
        open(vp, 'w', encoding='utf-8').write(v2)
    print(f'{VER} player choice applied to {root} (version {"set to " + VER if bump else "kept at " + cur}, {added} translations added)')


if __name__ == '__main__':
    main(sys.argv[1])
