# MKCinema: wallpaper depth (Dee, 2026-11-04: "like Netflix's, with parallax or 3D effects").
# The banner and the screensaver become layered scenes that move at different speeds, so depth reads from across a room:
#   far    the key art, with a Ken Burns push (zooms in about 18% while panning), biased toward faces
#   middle two drifting layers of light (fine dust and soft bokeh), moving faster than the art
#   near   the title logo, which turns slowly in 3D (perspective rotateY/rotateX) after it pops in
# On a desktop the mouse moves the layers against each other. Everything animates transform/opacity only, pauses while
# the banner is off screen, and stays off phones' scrolling page (phones keep the 2.7.25 settle-in).
# Art is cropped from the top third (faces), not the centre.
# Usage: python3 this.py index.html sw.js   (idempotent; bumps the patch version only when it applies)
import re, sys
p, swp = sys.argv[1], sys.argv[2]; s = open(p).read()
MARK = '/* wallpaper depth (2.7.28+) */'
if MARK in s: print('already applied'); sys.exit(0)
assert 'const Saver = {' in s, 'needs 2.7.25 wallpapers first'
def rep(a, b):
    global s
    assert s.count(a) == 1, ('anchor', s.count(a), a[:90])
    s = s.replace(a, b)

# Settings > Home: "Start screensaver" moves to the top of the section, where it is easy to find
rep("""
    { key: 'saverNow', label: 'Preview the screensaver', type: 'button', text: 'Show now', icon: 'image', run: () => { closeLayer('settings'); setTimeout(() => Saver.open(true), 450); } },""", "")
rep("{ id: 'home', icon: 'layout-dashboard', label: 'Home', intro: 'Choose what MKCinema opens on and what your Home shows.', rows: () => [",
    """{ id: 'home', icon: 'layout-dashboard', label: 'Home', intro: 'Choose what MKCinema opens on and what your Home shows.', rows: () => [
    { key: 'saverNow', label: 'Start screensaver', help: 'Full-screen key art with 3D titles, right now. Any button brings you back.', type: 'button', text: 'Start screensaver', icon: 'monitor-play', run: () => { closeLayer('settings'); setTimeout(() => Saver.open(true), 450); } },""")

# Dust layers: deterministic dots, painted once as gradients
import random
R = random.Random(28)
fine = ','.join(f'radial-gradient(circle at {R.uniform(2,98):.1f}% {R.uniform(2,98):.1f}%,rgba(255,244,228,{R.uniform(.35,.8):.2f}) 0 {R.uniform(.8,1.6):.1f}px,transparent {R.uniform(2.2,3.2):.1f}px)' for _ in range(34))
bokeh = ','.join(f'radial-gradient(circle at {R.uniform(4,96):.1f}% {R.uniform(4,96):.1f}%,rgba(255,236,214,{R.uniform(.07,.16):.2f}) 0,transparent {R.randint(26,58)}px)' for _ in range(12))
DUST = '<div class="wp-dust" aria-hidden="true"><i></i><i></i></div>'

# banner: dust layers sit between the art and the text
rep('<div class="hero-bg" id="heroBg"></div>', '<div class="hero-bg" id="heroBg"></div>' + DUST)
# screensaver slides get their own dust
rep("""s.insertAdjacentHTML('beforeend', `<div class="sv-info">""", """s.insertAdjacentHTML('beforeend', `""" + DUST + """<div class="sv-info">""")

CSS = """<style>
""" + MARK + """
/* faces live in the top third of most key art: crop and zoom from there, not the centre */
.hero-bg img,.sv-s>img{object-position:50% 22%;transform-origin:50% 28%}
/* far plane: the art pushes in and pans (Ken Burns) */
@keyframes wpPush{from{transform:scale(1.04) translate3d(2.4%,.8%,0)}to{transform:scale(1.22) translate3d(-2.8%,-1%,0)}}
body.fx #heroBg img.wp{animation:wpPush 17s cubic-bezier(.3,.08,.3,1) both}
/* middle planes: dust and bokeh drift faster than the art, so the eye reads distance */
.wp-dust{position:absolute;inset:-14%;z-index:-1;pointer-events:none}
.wp-dust i{position:absolute;inset:0;background-repeat:no-repeat}
.wp-dust i:first-child{background-image:""" + fine + """;animation:wpDustA 15s ease-in-out infinite alternate}
.wp-dust i:last-child{background-image:""" + bokeh + """;animation:wpDustB 21s ease-in-out infinite alternate}
@keyframes wpDustA{from{transform:translate3d(7%,3%,0)}to{transform:translate3d(-7%,-4%,0)}}
@keyframes wpDustB{from{transform:translate3d(-5%,4%,0) scale(1.04)}to{transform:translate3d(9%,-3%,0) scale(1.16)}}
body:not(.fx) .wp-dust i{animation:none}
/* near plane: the title turns in 3D after it pops in */
@keyframes wpTurn{0%{transform:perspective(720px) rotateY(-15deg) rotateX(5deg) translate3d(-8px,0,0)}50%{transform:perspective(720px) rotateY(1deg) rotateX(-2deg) translate3d(6px,-7px,0)}100%{transform:perspective(720px) rotateY(13deg) rotateX(4deg) translate3d(12px,-2px,0)}}
@keyframes wpTurnR{0%{transform:perspective(720px) rotateY(15deg) rotateX(5deg) translate3d(8px,0,0)}50%{transform:perspective(720px) rotateY(-1deg) rotateX(-2deg) translate3d(-6px,-7px,0)}100%{transform:perspective(720px) rotateY(-13deg) rotateX(4deg) translate3d(-12px,-2px,0)}}
@media (min-width:761px){
  #view-home>.hero #heroLogoWrap{overflow:visible}
  body.fx #view-home>.hero .wp-logo>*{transform-origin:35% 60%;animation:wpTurn 8s ease-in-out 1.1s infinite alternate}
  /* desktops: the mouse moves the planes against each other */
  html:not(.tv) body.fx #hero .wp-dust{transform:translate3d(calc(var(--mx,0) * -34px),calc(var(--my,0) * -20px),0);transition:transform .8s cubic-bezier(.2,.8,.2,1)}
  html:not(.tv) body.fx #heroBg{transform:translate3d(calc(var(--mx,0) * -12px),calc(var(--my,0) * -8px),0) scale(1.03)}
  html:not(.tv) body.fx #hero:not(.dragging) .hero-body{transform:translate3d(calc(var(--mx,0) * 16px),calc(var(--my,0) * 9px),0)}
}
/* everything stops while the banner is off screen or covered */
#hero.still .wp-dust i,#hero.still #heroBg img.wp,#hero.still .wp-logo>*{animation-play-state:paused}
/* phones keep the calm banner: the art settles once, no drifting layers under a scrolling page */
@media (max-width:760px){body.fx #heroBg img.wp{animation:wpSettle 1.8s cubic-bezier(.16,1,.3,1) both}.hero .wp-dust{display:none}}
/* screensaver: a deeper push, its own light, and the title turning toward the middle of the screen */
@keyframes svPush{from{transform:scale(1.05) translate3d(2.6%,1%,0)}to{transform:scale(1.17) translate3d(-2.4%,-1.2%,0)}}
@keyframes svPushR{from{transform:scale(1.05) translate3d(-2.6%,1%,0)}to{transform:scale(1.17) translate3d(2.4%,-1.2%,0)}}
body.fx .sv-s>img{animation:svPush 24s cubic-bezier(.3,.08,.3,1) both}
body.fx .sv-s.r>img{animation-name:svPushR}
.sv-s .wp-dust{z-index:1}
.sv-info{z-index:2}
body.fx .sv-s.on .sv-logo .wp-logo>*{transform-origin:35% 60%;animation:wpTurn 9s ease-in-out 2s infinite alternate}
body.fx .sv-s.r.on .sv-logo .wp-logo>*{transform-origin:65% 60%;animation-name:wpTurnR}
/* the brand in the corner reads from the sofa: a larger monogram and a bolder, brighter wordmark */
.sv-top{top:4.5vh}
.sv-brand{gap:clamp(12px,1.4vw,20px);font-family:var(--f-display);font-weight:700;font-size:clamp(17px,1.9vw,30px);letter-spacing:.3em;color:#f4f2ec;text-shadow:0 2px 12px rgba(0,0,0,.85),0 0 1px rgba(0,0,0,.9)}
.sv-brand svg{width:clamp(48px,5.4vw,84px);height:clamp(48px,5.4vw,84px);filter:drop-shadow(0 3px 10px rgba(0,0,0,.7))}
.sv-brand svg circle{stroke-width:3.5}
</style>
"""
rep('</body>\n</html>', CSS + '</body>\n</html>')

old = re.search(r"const APP_VERSION = '2\.7\.(\d+)';", s).group(1); new = f'2.7.{int(old) + 1}'
s = s.replace(f"const APP_VERSION = '2.7.{old}';", f"const APP_VERSION = '{new}';")
open(p, 'w').write(s)
sw = open(swp).read(); sw = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{new}';", sw); open(swp, 'w').write(sw)
print('applied:', f'2.7.{old} ->', new)
