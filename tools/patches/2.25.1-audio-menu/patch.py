"""MKCinema 2.25.1: the player's Audio tab no longer freezes or spins.

- Night Mode audio and its modes (Vocal Clarity Boost, Late-Night, 3D Spatial) are removed: they reloaded the stream
  through Web Audio, which stalls on hosts without CORS and can't be undone without reloading the app.
- Audio language shows at once from the source's own tags; no "Checking the languages in this file..." spinner.

Run on a 2.25.x or later build:  python3 -I patch.py /path/to/mkcinema
Idempotent: a build that already has the block is left alone. Never moves the version backwards.
"""
import os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.25.1'
MARK = 'id="mkc-2251"'

# (old, new, required)
EDITS = [
    ("wants() { return CFG.dsp !== 'flat' || this.attached; },", "wants() { return this.attached; },", True),
    ("const p = DSP_PRESETS[name] || DSP_PRESETS.flat, n = this.n;", "const p = DSP_PRESETS.flat, n = this.n;", True),
    ('      <button type="button" data-pp="dsp"><i data-lucide="audio-lines"></i>Night Mode audio · ${esc(DSP_PRESETS[CFG.dsp].label)}</button>\n', '', True),
    ("['A', 'Night Mode audio']", "['A', 'Audio menu']", False),
    (" Night Mode below evens out loud scenes.", "", False),
    ("settings, Night Mode, proxy", "settings, proxy", False),
    ("    ['Night Mode', 'Quiet scenes louder, explosions softer, so nobody reaches for the remote.'],\n", "", False),
    ("subtitle styling, Night Mode and X-Ray", "subtitle styling and X-Ray", False),
    ("watch party, Night Mode, skip intro", "watch party, skip intro", False),
    ('title="Night Mode audio (A)" aria-label="Night Mode audio"', 'title="Audio (A)" aria-label="Audio"', False),
    ("['Audio', DSP.attached ? DSP_PRESETS[CFG.dsp].label :", "['Audio', DSP.attached ? 'Processed' :", False),
]
SETTING = re.compile(r"\n    \{ key: 'dsp', label: 'Night Mode audio',[^\n]*\},")
CSS = '#optMenu .al-row{cursor:default}#optMenu .al-row:not(.on){opacity:.82}\n'


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    if MARK in s:
        print('2.25.1 audio block already in', p); return
    for need in ('const DSP = {', 'const AudioLang = {', 'const PxMenu', 'const AudioPref = {', '#optMenu .al-note{'):
        assert need in s, f'missing {need!r}'
    for old, new, req in EDITS:
        n = s.count(old)
        assert n <= 1, f'{old!r} found {n} times'
        if req:
            assert n == 1, f'missing {old!r}'
        s = s.replace(old, new)
    s, k = SETTING.subn('', s)
    assert k == 1, 'Night Mode setting not found'
    js = open(os.path.join(here, 'audio.js'), encoding='utf-8').read()
    assert '</script' not in js
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, f'<script {MARK}>\n{js}</script>\n{a}')
    s = s.replace('#optMenu .al-note{', CSS + '#optMenu .al-note{', 1)
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
    print(f'{VER} audio block applied to {root} (version {"set to " + VER if bump else "kept at " + cur})')


if __name__ == '__main__':
    main(sys.argv[1])
