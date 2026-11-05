"""MKCinema 2.16.0: styled anime subtitles (libass), subtitles/chapters/fonts read from MKV files, Send log codes,
Diagnostic, TheIntroDB skip times, Apple TV trailers with a YouTube fallback (and the other way round), artwork from
several sources, an Anime section, the Anime look (early access) and soft interface sounds.

Applies on top of web 2.14.x or any later 2.1x build (order-agnostic with 2.15 languages, 2.17 AniList, 2.18 MDBList,
2.19 episode alerts). Run once:  python3 -I patch.py /path/to/mkcinema
  - index.html: <style id="mkc-216css"> and <script id="mkc-216"> right before <script id="mkc-cfwa">; nothing else.
  - vendor/jassub/: JASSUB 1.8.8 (LGPL, unmodified) so the worker is same-origin. anime/: night.svg, miko.svg.
  - sw.js and version.json: 2.16.0 unless the build is already newer.
"""
import os, re, shutil, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.16.0'


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    assert 'id="mkc-216"' not in s, 'already applied'
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    assert cur.startswith('2.1'), cur
    rd = lambda n: open(os.path.join(here, n), encoding='utf-8').read()
    css = rd('anime-vars.css') + rd('style.css')
    js = rd('support.js') + '\n' + rd('subs.js') + '\n' + rd('anime.js')
    assert '</script' not in js and '</style' not in css
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, f'<style id="mkc-216css">\n{css}</style>\n<script id="mkc-216">\n{js}</script>\n{a}')
    bump = newer(VER, cur)
    if bump:
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
    open(p, 'w', encoding='utf-8').write(s)
    for sub in ('vendor/jassub', 'anime'):
        os.makedirs(os.path.join(root, sub), exist_ok=True)
    for f in os.listdir(os.path.join(here, 'vendor/jassub')):
        shutil.copy(os.path.join(here, 'vendor/jassub', f), os.path.join(root, 'vendor/jassub', f))
    shutil.copy(os.path.join(here, 'night.svg'), os.path.join(root, 'anime/night.svg'))
    shutil.copy(os.path.join(here, 'mascot.svg'), os.path.join(root, 'anime/miko.svg'))
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
