# MKCinema: the featured banner goes back to its pre-2.7.25 look (Drake, 2026-11-04: the effects were only wanted on
# the screensaver). Removes from Home's banner: the edge-to-edge layout, the drifting/pushing art, the dust and bokeh
# layers, the mouse parallax, the 3D edge, pop and turning title. The screensaver keeps all of it. The banner keeps the
# top-biased crop (faces) from 2.7.29, which is static.
# Usage: python3 this.py index.html sw.js   (idempotent; bumps the patch version only when it applies)
import re, sys
p, swp = sys.argv[1], sys.argv[2]; s = open(p).read()
MARK = '/* banner back to calm (screensaver keeps the effects) */'
if MARK in s: print('already applied'); sys.exit(0)
def rep(a, b):
    global s
    assert s.count(a) == 1, ('anchor', s.count(a), a[:90])
    s = s.replace(a, b)
def drop_line(prefix):
    global s
    lines = s.split('\n'); hits = [i for i, l in enumerate(lines) if l.startswith(prefix)]
    assert len(hits) == 1, ('line', len(hits), prefix[:80])
    del lines[hits[0]]; s = '\n'.join(lines)
def drop_block(start, end_line='}'):
    # removes from the line starting with `start` through the next line equal to end_line
    global s
    lines = s.split('\n'); hits = [i for i, l in enumerate(lines) if l.startswith(start)]
    assert len(hits) == 1, ('block', len(hits), start[:80])
    i = hits[0]; j = i
    while lines[j] != end_line: j += 1
    del lines[i:j + 1]; s = '\n'.join(lines)

# markup + showHero
rep('<div class="hero-bg" id="heroBg"></div><div class="wp-dust" aria-hidden="true"><i></i><i></i></div>', '<div class="hero-bg" id="heroBg"></div>')
rep(" img.draggable = false; img.classList.add('wp');", ' img.draggable = false;')
rep("""$('#heroLogoWrap').innerHTML = `<div class="wp-logo">${logo ? imgTag(logo, m.name, m.id, { nofb: true, cls: 'hero-logo', lazy: false }) : ''}<h1 class="hero-title" data-logo-alt ${logo ? 'hidden' : ''}>${esc(m.name)}</h1></div>`;""",
    """$('#heroLogoWrap').innerHTML = `${logo ? imgTag(logo, m.name, m.id, { nofb: true, cls: 'hero-logo', lazy: false }) : ''}<h1 class="hero-title" data-logo-alt ${logo ? 'hidden' : ''}>${esc(m.name)}</h1>`;""")
# banner observer + mouse parallax
drop_block("// The banner's art pauses while it is off screen", '})();')

# 2.7.25 banner CSS (screensaver rules stay)
rep('#heroLogoWrap .wp-logo .hero-logo,.sv-logo .hero-logo{', '.sv-logo .hero-logo{')
drop_line('html.tv #heroLogoWrap .wp-logo .hero-logo{')
drop_line('body.fx .hero-body.swap .wp-logo{')
drop_line('/* the art drifts slowly toward you')
drop_line('body.fx #heroBg img.wp{animation:wpDrift')
drop_line('body.fx #hero.still #heroBg img.wp{')
drop_line('/* TVs and desktops: the banner is a wallpaper')
drop_line('   never by the film, so the rows below never move (2.7.20). */')
def drop_media(inner):
    global s
    lines = s.split('\n'); hits = [k for k, l in enumerate(lines) if l.startswith(inner)]
    assert len(hits) == 1, ('media', len(hits), inner[:80])
    i = hits[0] - 1; assert lines[i].startswith('@media'), lines[i]; j = i
    while lines[j] != '}': j += 1
    del lines[i:j + 1]; s = '\n'.join(lines)
drop_media('  #view-home>.hero{--hl:150px')
drop_line('@media (min-width:761px) and (orientation:landscape) and (max-height:540px){#view-home>.hero{')
drop_line('/* phones keep the rounded banner: the art settles in once')
drop_line('@media (max-width:760px){body.fx #heroBg img.wp{animation:wpSettle 1.8s cubic-bezier(.16,1,.3,1) both}}')
drop_line('/* desktops: art and title move against each other with the mouse */')
drop_media('  html:not(.tv) body.fx #heroBg{transform:translate3d(calc(var(--mx,0) * -14px)')

# 2.7.29 depth CSS on the banner
rep('.hero-bg img,.sv-s>img{object-position:50% 22%;transform-origin:50% 28%}', '.hero-bg img{object-position:50% 22%}\n.sv-s>img{object-position:50% 22%;transform-origin:50% 28%}')
drop_line('body.fx #heroBg img.wp{animation:wpPush')
drop_media('  #view-home>.hero #heroLogoWrap{overflow:visible}')
drop_line('/* everything stops while the banner is off screen or covered */')
drop_line('#hero.still .wp-dust i,#hero.still #heroBg img.wp')
drop_line('/* phones keep the calm banner: the art settles once')
drop_line('@media (max-width:760px){body.fx #heroBg img.wp{animation:wpSettle 1.8s cubic-bezier(.16,1,.3,1) both}.hero .wp-dust')

assert 'wp-dust" aria-hidden="true"><i></i><i></i></div><div class="sv-info">' in s
assert '#view-home>.hero' not in s and '#heroBg img.wp' not in s and '--mx' not in s, 'banner leftovers'
rep('</body>\n</html>', '<style>' + MARK + '</style>\n</body>\n</html>')
old = re.search(r"const APP_VERSION = '2\.7\.(\d+)';", s).group(1); new = f'2.7.{int(old) + 1}'
s = s.replace(f"const APP_VERSION = '2.7.{old}';", f"const APP_VERSION = '{new}';")
open(p, 'w').write(s)
sw = open(swp).read(); sw = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{new}';", sw); open(swp, 'w').write(sw)
print('applied:', f'2.7.{old} ->', new)
