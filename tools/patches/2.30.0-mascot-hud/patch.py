"""MKCinema 2.30.0: the Anime page banner becomes a tactical anime HUD. The flat SVG girl gives way to a puppet rig
(anime/mascot-main.webp, breathing and sway, optional layered slices). Behind her are a 1px reticle ring, chamfered
plates, telemetry and an equalizer, opened by a mechanical shutter. The white bubble becomes a dialogue cassette
with a KITSUNE // AI GUIDE nameplate, a voice waveform and five quotes that change every 8 s.
Only transform and opacity animate. The loops pause off screen, and TV / Calm keep breathing and sway only.

Run once on a 2.29.x build:  python3 -I patch.py /path/to/mkcinema
  - index.html: <style id="mkc-230css"> + <script id="mkc-230"> before <script id="mkc-cfwa">, What's new, APP_VERSION
  - anime/mascot-main.webp (cut out of the supplied art by key.py)
  - sw.js and version.json: 2.30.0 unless newer
"""
import os, re, shutil, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.30.0'
NOTE = """  { v: '2.30.0', date: '2026-11-06', items: [
    ['new', 'Kitsune, now in HUD mode', 'The Anime page banner is a tactical anime HUD. Kitsune is new art that breathes and sways, a reticle ring and live telemetry sit behind her, and her dialogue box has a nameplate, a voice waveform and a new line every few seconds. It stays light on TVs.'],
  ] },
"""


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    assert 'id="mkc-230"' not in s, 'already applied'
    assert 'id="mkc-222"' in s and 'splash()' in s, 'needs the 2.22 comic look'
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    rd = lambda n: open(os.path.join(here, n), encoding='utf-8').read()
    css, js = rd('hud.css'), rd('hud.js')
    assert '</style' not in css and '</script' not in js
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, f'<style id="mkc-230css">\n{css}</style>\n<script id="mkc-230">\n\'use strict\';\n{js}</script>\n{a}')
    assert s.count('const RELEASES = [\n') == 1
    s = s.replace('const RELEASES = [\n', 'const RELEASES = [\n' + NOTE)
    bump = newer(VER, cur)
    if bump:
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
    open(p, 'w', encoding='utf-8').write(s)
    os.makedirs(os.path.join(root, 'anime'), exist_ok=True)
    shutil.copyfile(os.path.join(here, 'anime', 'mascot-main.webp'), os.path.join(root, 'anime', 'mascot-main.webp'))
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
