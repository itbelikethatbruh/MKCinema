# MKCinema: Ambient Mode fixes from Drake's Fire TV photos (2026-11-04).
#  - The title showed twice: TMDB backdrops tagged with a language have the title printed on them. Textless backdrops
#    (or fanart.tv backgrounds) are preferred now, and over titled art our own logo stays off.
#  - It crashed after 2-3 films on a Fire TV stick: memory. Big art is shrunk once and released, every scene frees
#    its images when it leaves, skipped preloads are freed, a stuck image decode can no longer hold a scene, a lost
#    WebGL context hands the scene to the CSS mode, and on TVs the stage is flat (no nested 3D layers or animated filters).
# Usage: python3 this.py index.html sw.js   (reads old/new ambient.js and ambient.css next to this file; idempotent)
import os, re, sys
p, swp = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
rd = lambda n: open(os.path.join(here, n)).read().rstrip('\n')
OLD_JS, NEW_JS, OLD_CSS, NEW_CSS = rd('ambient-2732.js'), rd('ambient.js'), rd('ambient-2732.css'), rd('ambient.css')
s = open(p).read()
if 'Saver.glLost()' in s: print('already applied'); sys.exit(0)
for a, b in ((OLD_JS, NEW_JS), (OLD_CSS, NEW_CSS)):
    assert s.count(a) == 1, ('anchor', s.count(a), a[:80])
    s = s.replace(a, b)
old = re.search(r"const APP_VERSION = '2\.7\.(\d+)';", s).group(1); new = f'2.7.{int(old) + 1}'
s = s.replace(f"const APP_VERSION = '2.7.{old}';", f"const APP_VERSION = '{new}';")
open(p, 'w').write(s)
sw = open(swp).read(); sw = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{new}';", sw); open(swp, 'w').write(sw)
print('applied:', f'2.7.{old} ->', new)
