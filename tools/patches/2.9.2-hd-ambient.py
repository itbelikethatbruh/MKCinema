#!/usr/bin/env python3
"""2.9.2 Sharp Ambient Mode art: full-size TMDB art, scenes kept at screen resolution, the depth shader drawn
at the screen's real pixel size (it was drawn at half size on TVs and then stretched).
Rebuilds the 2.8 feature block from 2.8.0-features. Usage: python3 -I this.py index.html sw.js   (on 2.9.1; idempotent). Also: phone picture-in-picture (9c-pip.js, Android app 1.2.6) and an accessibility pass."""
import os, re, sys
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '2.8.0-features')
p, swp = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if "const APP_VERSION = '2.9.2'" in s: print('already applied'); sys.exit(0)
js = '\n'.join(open(os.path.join(here, 'js', f), encoding='utf-8').read() for f in sorted(os.listdir(os.path.join(here, 'js'))) if f.endswith('.js'))
css = open(os.path.join(here, 'features.css'), encoding='utf-8').read()
assert '</script' not in js.lower() and '</style' not in css.lower()
s, n = re.subn(r'<style id="mkc-28css">\n.*?\n</style>', lambda m: f'<style id="mkc-28css">\n{css}\n</style>', s, flags=re.S); assert n == 1
s, n = re.subn(r'<script id="mkc-28">\n.*?\n</script>', lambda m: f'<script id="mkc-28">\n{js}\n</script>', s, flags=re.S); assert n == 1
def sub(a, b):
    global s
    assert s.count(a) == 1, a[:60]
    s = s.replace(a, b, 1)

# TMDB: the original file instead of the 1280 px copy (memory stays bounded by shrink() below)
sub("b.bg = `https://image.tmdb.org/t/p/w1280${bd.file_path}`;", "b.bg = `https://image.tmdb.org/t/p/original${bd.file_path}`;")
sub("if (lg) b.logo = `https://image.tmdb.org/t/p/w500${lg.file_path}`;", "if (lg) b.logo = `https://image.tmdb.org/t/p/original${lg.file_path}`;")
# Keep the backdrop at the screen's own pixel width (TVs 1920, computers up to 2560) instead of 1280 on TVs
sub("if (cors) img = AmbientArt.shrink(img, IS_TV ? 1280 : 1920);",
    "img = AmbientArt.shrink(img, AmbientArt.px());")
# Without keys: the catalog's large backdrop (often 4K) instead of its medium copy (often only 1280 px);
# the medium one stays the fallback. Drawing a cross-origin image onto a canvas only blocks reading it back.
sub("  base(m) { return { m, bg: metaBg(m), bgCors: false,",
    "  hd: (u) => (u ? String(u).replace(/(images\\.metahub\\.space\\/background\\/)(small|medium)\\//, '$1large/') : u),\n"
    "  base(m) { return { m, bg: this.hd(metaBg(m)), bgCors: false,")
sub("  release(root) {",
    "  // The screen's width in real pixels, capped so a 4K backdrop never decodes larger than needed on a stick\n"
    "  px() { return Math.round(Math.min(IS_TV ? 1920 : 2560, Math.max(1280, innerWidth * (devicePixelRatio || 1)))); },\n"
    "  release(root) {")
# Depth shader: full real-pixel resolution at High (was half size on TVs, three quarters elsewhere, ignoring pixel density)
sub("    this.scale = level >= 2 ? (IS_TV ? .5 : .75) : .4;\n    this.cv.width = Math.round(innerWidth * this.scale); this.cv.height = Math.round(innerHeight * this.scale);",
    "    const full = AmbientArt.px() / innerWidth; this.scale = full * (level >= 2 ? 1 : .6);\n    this.cv.width = Math.round(innerWidth * this.scale); this.cv.height = Math.round(innerHeight * this.scale);")
# Accessibility pass: one page heading, film pages and the player announced as dialogs, live player messages,
# a named setup progress bar
sub('<div class="brand" role="img" aria-label="MKCinema">', '<h1 class="sr-only">MKCinema</h1><div class="brand" role="img" aria-label="MKCinema">')
sub('<div id="detail" class="layer-ov" hidden>', '<div id="detail" class="layer-ov" role="dialog" aria-modal="true" aria-label="Title details" hidden>')
sub('<div id="player" hidden>', '<div id="player" role="dialog" aria-label="Player" hidden>')
sub('<div class="p-msg" id="pMsg" hidden></div>', '<div class="p-msg" id="pMsg" role="status" aria-live="polite" hidden></div>')
sub('<div class="gs-prog" role="progressbar" aria-valuemin="0"', '<div class="gs-prog" role="progressbar" aria-label="Setup progress" aria-valuemin="0"')

s, n = re.subn(r"const APP_VERSION = '2\.9\.1';", "const APP_VERSION = '2.9.2';", s); assert n == 1
open(p, 'w', encoding='utf-8').write(s)
sw = open(swp).read(); sw, n = re.subn(r"const VERSION = 'mkc-[\d.]+';", "const VERSION = 'mkc-2.9.2';", sw); assert n == 1; open(swp, 'w').write(sw)
import shutil; nd = os.path.join(os.path.dirname(os.path.abspath(p)), 'net'); shutil.copytree(os.path.join(here, 'net'), nd, dirs_exist_ok=True)  # network logos
import json; json.dump({'web': '2.9.2', 'android': '1.2.6', 'apk': 'https://mkcinema-site.pages.dev/download/MKCinema.apk'}, open(os.path.join(os.path.dirname(os.path.abspath(p)), 'version.json'), 'w'))
print('applied: 2.9.2')
