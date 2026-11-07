# MKCinema 2.7.20 (Dee, 2026-11-02)
# The featured banner kept changing shape between films. 2.7.15 only held the banner's OUTER height (a min-height
# ratchet measured right after each swap), but it measured before the logo image had loaded, so every logo still
# popped in from 0px and pushed the eyebrow and title up; descriptions of 1-3 lines and wrapping meta lines moved the
# buttons too. Now every slot inside the banner has a fixed size, so nothing a film brings (logo, title, meta,
# description) can reflow the banner or the rows under it. The JS ratchet is removed.
# Usage: python3 2.7.20-hero-fixed-size.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)

rep("""/* The banner keeps the tallest height any slide has needed at this width, so swiping never makes it jump */
function heroHold() {
  const h = $('#hero'); if (S.heroW !== innerWidth) { S.heroW = innerWidth; S.heroH = 0; }
  h.style.minHeight = ''; S.heroH = Math.max(S.heroH || 0, h.offsetHeight); h.style.minHeight = `${S.heroH}px`;
}
""", "")
rep("""  heroHold();
""", "")

rep("""/* Short landscape screens (a phone turned sideways) */""",
"""/* Featured banner (2.7.20): every slot has a fixed size, so a film's logo, title length, meta or description can never
   change the banner's shape or move the rows below it. Logos fade in inside a reserved box instead of growing it. */
.hero{--hl:120px}
.hero .eyebrow{white-space:nowrap;overflow:hidden;min-width:0;height:17px}
#heroLogoWrap{height:var(--hl);margin-bottom:18px;display:flex;align-items:flex-end;min-width:0;overflow:hidden}
#heroLogoWrap .hero-logo{max-height:100%;margin:0;flex:none}
#heroLogoWrap .hero-title{margin:0}
.hero .metaline{flex-wrap:nowrap;white-space:nowrap;overflow:hidden;height:22px;-webkit-mask:linear-gradient(90deg,#000 88%,transparent);mask:linear-gradient(90deg,#000 88%,transparent)}
.hero .metaline>*{flex:none}
.hero .hero-desc{line-height:1.5;height:4.5em}
@media (orientation:landscape) and (max-height:540px){
  .hero{--hl:76px}
  #heroLogoWrap{margin-bottom:10px}
  #heroLogoWrap .hero-title{font-size:clamp(24px,4.4vw,34px)}
  .hero .hero-desc{height:3em}
}

/* Short landscape screens (a phone turned sideways) */""")
s = s.replace("const APP_VERSION = '2.7.19';", "const APP_VERSION = '2.7.20';")
open(p, 'w').write(s); print('patched')
