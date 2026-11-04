#!/usr/bin/env python3
"""MKCinema 2.7.19: Smart TV performance.
- icons(): draws only new <i data-lucide> placeholders from cached SVG templates (was: rebuilt every icon on the page each call)
- TV splash: CSS-only, compositor-driven (opacity/transform), app shown underneath with no full-page scale
- Sound: reverb impulse built cheaply (shorter on TV), so audio setup no longer blocks the first frames
- Featured banner: on TV it waits while the remote is in use and advances more slowly
- TV paint: no blurred text-shadow on card titles, one drop-shadow on the banner logo, no ambilight loop
Usage: python3 2.7.19-tv-perf.py <index.html> <sw.js>
"""
import sys

p_html, p_sw = sys.argv[1], sys.argv[2]
s = open(p_html, encoding='utf-8').read()


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)


# 1) icons(): cached templates, only unconverted placeholders
rep("""const icons = () => { try { window.lucide && lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); } catch (e) { /* icons are cosmetic */ } };""",
"""/* Icons: lucide's createIcons() rebuilds every icon already on the page on each call (200+ SVGs), which stalled TVs on
   every banner change. Here only new <i data-lucide> placeholders are drawn, each cloned from a cached template. */
const ICON_TPL = new Map();
const iconKey = (n) => n.replace(/(\\w)(\\w*)(_|-|\\s*)/g, (g0, g1, g2) => g1.toUpperCase() + g2.toLowerCase());
const icons = () => {
  const L = window.lucide; if (!L) return;
  if (!L.icons || !L.createElement) { try { L.createIcons({ attrs: { 'aria-hidden': 'true' } }); } catch (e) { /* icons are cosmetic */ } return; }
  const list = document.querySelectorAll('i[data-lucide]');
  for (let k = 0; k < list.length; k++) {
    const el = list[k];
    try {
      const name = el.getAttribute('data-lucide');
      let tpl = ICON_TPL.get(name);
      if (tpl === undefined) { const node = L.icons[iconKey(name)]; tpl = node ? L.createElement(node) : null; ICON_TPL.set(name, tpl); }
      if (!tpl || !el.parentNode) continue;
      const svg = tpl.cloneNode(true);
      svg.setAttribute('data-lucide', name); svg.setAttribute('aria-hidden', 'true');
      for (const a of el.attributes) if (a.name !== 'class') svg.setAttribute(a.name, a.value);
      svg.setAttribute('class', `lucide lucide-${name}${el.className ? ` ${el.className}` : ''}`);
      el.parentNode.replaceChild(svg, el);
    } catch (e) { /* icons are cosmetic */ }
  }
};""")

# 2) Sound: cheap impulse (envelope sampled every 64 samples), shorter on TV
rep("this.verb = this.ctx.createConvolver(); this.verb.buffer = this.impulse(3.6, 3.2);",
    "this.verb = this.ctx.createConvolver(); this.verb.buffer = IS_TV ? this.impulse(1.8, 2.6) : this.impulse(3.6, 3.2);")
rep("""    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }""",
"""    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i += 64) { const env = Math.pow(1 - i / len, decay), e = Math.min(len, i + 64); for (let j = i; j < e; j++) d[j] = (Math.random() * 2 - 1) * env; }
    }""")

# 3) TV splash: CSS keyframes on the compositor, no GSAP, no full-app scale
rep("""function runIntro() {
  layoutWord();""",
"""/* Smart TV splash: the same emblem and wordmark, run by CSS on the compositor so it stays smooth while the app loads
   underneath. Opacity and transform only; the rings are drawn, not traced, and the app appears beneath the fade. */
function runIntroTV() {
  const intro = $('#intro'); intro.hidden = false; intro.style.opacity = ''; intro.classList.remove('tvs'); void intro.offsetWidth;
  $('#app').classList.remove('pre'); $('#app').style.cssText = '';
  document.body.classList.add('locked', 'intro-on'); $('#skip').hidden = true; $('#soundgate').hidden = true;
  intro.classList.add('tvs');
  if (!INTRO.skipping) setTimeout(() => { if (INTRO.tl) sfx.riser(2.2); }, 60);
  const t1 = setTimeout(() => { if (INTRO.tl && !INTRO.skipping) sfx.chord(); }, 1100);
  const t2 = setTimeout(() => { intro.classList.remove('tvs'); finishIntro(); }, 2900);
  INTRO.tl = { progress() { clearTimeout(t1); clearTimeout(t2); intro.classList.remove('tvs'); } };
}
function runIntro() {
  layoutWord();
  if (IS_TV && !matchMedia('(prefers-reduced-motion: reduce)').matches && !CFG.reduceMotion) { runIntroTV(); return; }""")

# TV splash CSS (appended to the Smart TV block)
rep("""html.tv body.fx .btn-ghost::after,html.tv body.fx .btn-prime::after{display:none}""",
"""html.tv body.fx .btn-ghost::after,html.tv body.fx .btn-prime::after{display:none}
/* TV splash (2.7.19): compositor-only keyframes */
html.tv #intro{background:#000;will-change:opacity}
html.tv #intro .sp-glow,html.tv #intro .sp-line{display:none}
html.tv #intro .sp-stage{perspective:none;will-change:opacity}
html.tv #intro .sp-ring{stroke-dashoffset:0}
html.tv #intro .sp-sheen{display:none}
html.tv #intro .sp-mark{width:150px;height:150px}
html.tv #intro .sp-emblem,html.tv #intro #introWord span,html.tv #intro .sp-rule,html.tv #intro #introTag{opacity:0;will-change:opacity,transform}
html.tv #intro .sp-mono{opacity:1}
html.tv #intro #introWord span{background:none;color:#f1ede4;-webkit-text-fill-color:#f1ede4}
html.tv #intro.tvs .sp-emblem{animation:tvsEmblem 1.1s cubic-bezier(.16,1,.3,1) .1s both}
html.tv #intro.tvs #introWord span{animation:tvsUp .7s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(.75s + var(--i,0) * 45ms)}
html.tv #intro.tvs #introWord span:nth-child(2){--i:1}html.tv #intro.tvs #introWord span:nth-child(3){--i:2}html.tv #intro.tvs #introWord span:nth-child(4){--i:3}
html.tv #intro.tvs #introWord span:nth-child(5){--i:4}html.tv #intro.tvs #introWord span:nth-child(6){--i:5}html.tv #intro.tvs #introWord span:nth-child(7){--i:6}html.tv #intro.tvs #introWord span:nth-child(8){--i:7}
html.tv #intro.tvs .sp-rule{animation:tvsRule .9s cubic-bezier(.16,1,.3,1) 1.1s both}
html.tv #intro.tvs #introTag{animation:tvsUp .8s cubic-bezier(.16,1,.3,1) 1.25s both}
html.tv #intro.tvs{animation:tvsOut .55s ease-in 2.3s both}
@keyframes tvsEmblem{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:none}}
@keyframes tvsUp{from{opacity:0;transform:translate3d(0,14px,0)}to{opacity:1;transform:none}}
@keyframes tvsRule{from{opacity:0;transform:scaleX(0)}to{opacity:1;transform:scaleX(1)}}
@keyframes tvsOut{from{opacity:1}to{opacity:0}}
/* TV paint: cheaper text and logo shadows, still legible on artwork */
html.tv .card-title{text-shadow:0 1px 2px rgba(0,0,0,.9)}
html.tv .hero-logo,html.tv .logo3d .hero-logo{filter:drop-shadow(0 3px 10px rgba(0,0,0,.7))}""")

# 4) Featured banner on TV: wait while the remote is in use, slower cadence
rep("""function nextHero() { if (document.hidden || document.body.classList.contains('layer-open') || S.view !== 'home' || scrollY > innerHeight) { S.heroTimer = setTimeout(nextHero, 3000); return; } showHero(S.heroIdx + 1, 1); }""",
"""let TV_KEY_AT = 0; if (IS_TV) addEventListener('keydown', () => { TV_KEY_AT = performance.now(); }, true);
function nextHero() {
  if (document.hidden || document.body.classList.contains('layer-open') || S.view !== 'home' || scrollY > innerHeight || (IS_TV && performance.now() - TV_KEY_AT < 8000)) { S.heroTimer = setTimeout(nextHero, 3000); return; }
  showHero(S.heroIdx + 1, 1);
}""")
rep("""  icons();
  clearTimeout(S.heroTimer); S.heroTimer = setTimeout(nextHero, 9000);""",
"""  icons();
  clearTimeout(S.heroTimer); S.heroTimer = setTimeout(nextHero, IS_TV ? 14000 : 9000);""")

# 5) No ambilight frame loop on TV (the glow is hidden there)
rep("""  if (TOUCH_PLAYER.matches) return;
  const c = $('#amb'), g = c.getContext('2d'); let n = 0;""",
"""  if (TOUCH_PLAYER.matches || IS_TV) return;
  const c = $('#amb'), g = c.getContext('2d'); let n = 0;""")

# 6) version
rep("const APP_VERSION = '2.7.18';", "const APP_VERSION = '2.7.19';")

open(p_html, 'w', encoding='utf-8').write(s)
w = open(p_sw, encoding='utf-8').read()
assert w.count("const VERSION = 'mkc-2.7.18';") == 1
open(p_sw, 'w', encoding='utf-8').write(w.replace("const VERSION = 'mkc-2.7.18';", "const VERSION = 'mkc-2.7.19';"))
print('patched 2.7.19')
