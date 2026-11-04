# MKCinema: Ambient Mode, a 2.5D multi-plane parallax screensaver (Drake, 2026-11-04). Replaces the 2.7.25/2.7.29
# screensaver code and styles. See the header comment of the Ambient Mode script for the design.
# Usage: python3 this.py index.html sw.js [ambient.js ambient.css]   (idempotent; bumps the patch version when it applies)
import os, re, sys
p, swp = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
JS = open(sys.argv[3] if len(sys.argv) > 3 else os.path.join(here, 'ambient.js')).read()
CSS = open(sys.argv[4] if len(sys.argv) > 4 else os.path.join(here, 'ambient.css')).read()
s = open(p).read()
if 'const AmbientGL = {' in s: print('already applied'); sys.exit(0)
def rep(a, b):
    global s
    assert s.count(a) == 1, ('anchor', s.count(a), a[:90])
    s = s.replace(a, b)
def cut(start, end, keep_end=True, new=''):
    # replace from `start` up to `end` (end kept unless keep_end is False)
    global s
    i = s.index(start); assert s.count(start) == 1, start[:60]
    j = s.index(end, i); s = s[:i] + new + (s[j:] if keep_end else s[j + len(end):])

# 1. the old Saver module -> Ambient Mode
cut('/* Screensaver: official key art with the title logo popping out in 3D', 'Saver.init();\n', keep_end=False, new=JS.rstrip('\n') + '\n')
# 2. old screensaver styles out (2.7.25 block and the 2.7.29 depth block), new styles in
cut('/* ===== 2.7.25 Wallpapers: key art edge to edge', '/* ---------- Screensaver ---------- */', keep_end=False, new='')
cut('#saver{position:fixed;inset:0;z-index:9500;background:#000;opacity:0;transition:opacity 1.1s ease', '</style>', keep_end=True, new=CSS.rstrip('\n') + '\n')
cut('/* wallpaper depth (2.7.28+) */', '</style>', keep_end=True, new='/* the featured banner crops art from the top third, where faces are */\n.hero-bg img{object-position:50% 22%}\n')
# 3. settings: 90-second default, Ambient Mode naming, optional art keys
rep("{ key: 'saverNow', label: 'Start screensaver', help: 'Full-screen key art with 3D titles, right now. Any button brings you back.', type: 'button', text: 'Start screensaver', icon: 'monitor-play',",
    "{ key: 'saverNow', label: 'Screensaver / Ambient Mode', help: 'Full-screen 3D parallax art with atmosphere, right now. Left and Right browse, OK opens the film, Back returns.', type: 'button', text: 'Start Ambient Mode', icon: 'monitor-play',")
rep("{ key: 'saverAfter', label: 'Screensaver', help: 'Fills the screen with key art and 3D titles from your Home, watchlist and Continue watching when nothing has been pressed for a while. Any button brings you back. It never starts while something plays.', type: 'select', num: true, options: [[0, 'Off'], [1, 'After 1 minute'],",
    "{ key: 'saverAfter', label: 'Start Ambient Mode when idle', help: 'Films from your Home, watchlist and Continue watching, in 3D, when nothing has been pressed for a while. It never starts while something plays.', type: 'select', num: true, options: [[0, 'Off'], [1, 'After 1 minute'], [1.5, 'After 90 seconds'],")
rep("[20, 'After 20 minutes']], get: () => Saver.after(), set: (v) => Saver.setAfter(v) },",
    """[20, 'After 20 minutes']], get: () => Saver.after(), set: (v) => Saver.setAfter(v) },
    { key: 'fanartKey', label: 'Fanart.tv key (optional)', help: 'Unlocks the full 3D shadowbox: transparent character cutouts and clean logos from fanart.tv. Get a free personal key at fanart.tv. Stays on this device.', type: 'secret', get: () => Keys.get().fanart || '', set: (v) => { Keys.set('fanart', v); AmbientArt.cache.clear(); } },
    { key: 'tmdbKey', label: 'TMDB key (optional)', help: 'Backdrops and logos from themoviedb.org, and the depth effect for films without a cutout. Free API key (v3) at themoviedb.org. Stays on this device.', type: 'secret', get: () => Keys.get().tmdb || '', set: (v) => { Keys.set('tmdb', v); AmbientArt.cache.clear(); } },""")

for gone in ['.sv-s{', 'svDriftR', 'wp-dust', '.wp-logo{']:
    assert gone not in s, ('leftover', gone)
old = re.search(r"const APP_VERSION = '2\.7\.(\d+)';", s).group(1); new = f'2.7.{int(old) + 1}'
s = s.replace(f"const APP_VERSION = '2.7.{old}';", f"const APP_VERSION = '{new}';")
open(p, 'w').write(s)
sw = open(swp).read(); sw = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{new}';", sw); open(swp, 'w').write(sw)
print('applied:', f'2.7.{old} ->', new)
