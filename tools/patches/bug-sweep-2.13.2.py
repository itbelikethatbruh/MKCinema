#!/usr/bin/env python3
"""2.13.x bug sweep (web app). Idempotent, independent of the Back-button and TV-focus patches.
Usage: python3 -I bug-sweep-2.13.2.py index.html

1. Boot no longer downloads the whole app a second time: on static hosting (Cloudflare Pages) /config.json falls back
   to index.html (~360 KB compressed, cache: no-store, every launch). Non-JSON answers are now cut off at the headers.
2. First visit: the walkthrough could lose a race with the "Top menu or side menu?" prompt and then never appear
   that session (the Home-layout question waits for the walkthrough, so it was lost too). The walkthrough now waits
   for open panels, the menu question waits for the walkthrough, and new users don't see "New / can now" wording.
3. Phones 360 px wide and smaller: the dock's Settings button stuck out of the bar (half cut at 360 px, gone at 320 px).
4. TV: rows bled 2 px past the screen edge, giving the page a sideways scroll.
5. Title logos drawn in black (some metahub/TMDB logos) were nearly invisible on the dark banner; they are now shown in white.
6. Details: the awards line was shown twice (the honours line and an "Awards" credit row with the same text).
7. The keyboard-shortcut hint in the footer is hidden on touch screens and TVs, where it doesn't apply.
8. TV: Back from a section (Movies, a streaming network page...) to Home left nothing focused, so the next press was lost.
"""
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
MARK = '/* bug-sweep-2.13.2 */'
if MARK in s:
    print('already applied'); sys.exit(0)

def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        sys.exit(f'patch target found {n}x (want {count}): {old[:90]!r}')
    s = s.replace(old, new)

# 1. config.json: stop at the headers unless the answer is JSON
rep("""        const r = await fetch('config.json', { signal: ctl.signal, cache: 'no-store' });
        if (r.ok) { const j = await r.json();""",
    """        const r = await fetch('config.json', { signal: ctl.signal, cache: 'no-store' });
        // static hosts answer an unknown path with the whole app page: drop it at the headers instead of downloading it
        if (!/json/i.test(r.headers.get('content-type') || '')) ctl.abort();
        else if (r.ok) { const j = await r.json();""")

# 2a. walkthrough waits for panels that are open instead of giving up for the session
rep("""  const wait = () => (document.body.classList.contains('intro-on') ? setTimeout(wait, 400) : setTimeout(() => { if ([...MENU_LAYERS, 'player'].every((x) => $(`#${x}`).hidden)) openTour(0); }, 700));""",
    """  let n = 0;
  const wait = () => (document.body.classList.contains('intro-on') ? setTimeout(wait, 400) : setTimeout(() => {
    if (Store.get('toured', false) || !$('#tour').hidden) return;
    if ([...MENU_LAYERS, 'player'].every((x) => $(`#${x}`).hidden)) openTour(0); else if (n++ < 90) wait();
  }, 700));""")

# 2b. the menu question waits for the walkthrough on a first visit (up to two minutes), and reads right for new users
rep("""    const busy = () => document.body.classList.contains('intro-on') || !$('#tour').hidden || document.body.classList.contains('layer-open')""",
    """    const fresh = !Store.get('toured', false); this.fresh = fresh;
    const busy = () => (fresh && !Store.get('toured', false) && n < 120) || document.body.classList.contains('intro-on') || !$('#tour').hidden || document.body.classList.contains('layer-open')""")
rep("""    X8.layer('navPick', { label: 'Menu', icon: 'panel-left', eyebrow: 'New' });""",
    """    X8.layer('navPick', { label: 'Menu', icon: 'panel-left', eyebrow: this.fresh ? 'Menu' : 'New' });""")
rep("""<p class="x8-p">MKCinema can now put its menu down the left side, the way most TV apps do. Pick the one you like.""",
    """<p class="x8-p">${this.fresh ? 'MKCinema can show its menu across the top or down the left side, the way most TV apps do.' : 'MKCinema can now put its menu down the left side, the way most TV apps do.'} Pick the one you like.""")

# 3 + 4 + 5 + 7: CSS, added once as the last stylesheet in <head>
CSS = """
""" + MARK + """
@media (max-width:400px){.dock-tools{gap:2px}.dock .dock-tools .ibtn{width:40px}.dock .brand{padding-right:4px}}
@media (max-width:340px){.dock .dock-tools .ibtn{width:36px}.dock .brand{padding-right:2px}}
html.tv .rail{margin-left:-16px;margin-right:-16px;padding-left:16px;padding-right:16px;scroll-padding-inline:16px}
.hero-logo.logo-dark,.pk-det-logo.logo-dark,#pLoadArt img.logo-dark{filter:brightness(0) invert(1) drop-shadow(0 4px 18px rgba(0,0,0,.65))!important}
@media (hover:none){.foot>span:last-child{display:none}}
html.tv .foot>span:last-child{display:none}
"""
rep('</style>\n</head>', '</style>\n<style>' + CSS + '</style>\n</head>')

# 5. dark title logos: measure once per logo (a small CORS copy), then show it in white
JS = """
""" + MARK + """
/* Some title logos are drawn in black and vanish on the dark banner. Each logo is measured once (a small copy fetched
   with CORS; hosts that refuse are left alone), and one that is mostly dark with a see-through background is shown in white. */
const LogoTone = {
  cache: new Map(),
  measure(src) {
    return new Promise((res) => {
      const t = new Image(); t.crossOrigin = 'anonymous'; t.referrerPolicy = 'no-referrer';
      t.onload = () => {
        try {
          const w = 64, h = Math.max(1, Math.min(64, Math.round(64 * t.naturalHeight / Math.max(1, t.naturalWidth))));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(t, 0, 0, w, h);
          const d = g.getImageData(0, 0, w, h).data; let solid = 0, dark = 0, clear = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 100) { clear++; continue; }
            solid++; if (Math.max(d[i], d[i + 1], d[i + 2]) < 72) dark++; // brightness, so a red or blue logo is never counted as dark
          }
          res(solid > 20 && clear / (w * h) > 0.15 && dark / solid > 0.6);
        } catch (e) { res(false); }
      };
      t.onerror = () => res(false);
      // images.metahub.space answers with a redirect that has no CORS header; its target (live.metahub.space) has one
      t.src = src.replace('//images.metahub.space/', '//live.metahub.space/');
    });
  },
  check(img) {
    const src = img.currentSrc || img.src; if (!src || /^data:/.test(src)) return;
    let v = this.cache.get(src);
    if (v === undefined) { v = this.measure(src); this.cache.set(src, v); v.then((x) => this.cache.set(src, x)); }
    Promise.resolve(v).then((dark) => { if (img.isConnected) img.classList.toggle('logo-dark', !!dark); });
  },
};
document.addEventListener('load', (e) => {
  const t = e.target;
  if (t instanceof HTMLImageElement && t.matches('.hero-logo, .pk-det-logo, #pLoadArt img')) LogoTone.check(t);
}, true);
"""
anchor = "const imgTag = (src, title, seed,"
rep(anchor, JS.lstrip('\n') + anchor)

# 6. details: the honours line already says it, so drop the duplicate Awards credit row
rep("""      const r = base.apply(this, arguments); const m = D.meta;
      const desc = $('#detail .d-desc');""",
    """      const r = base.apply(this, arguments); const m = D.meta;
      const desc = $('#detail .d-desc');
      const dropAwards = () => { if (!$('#detail .d-honours')) return; const b = $$('#detail .credits b').find((x) => x.textContent.trim() === 'Awards'); if (b) { if (b.nextElementSibling) b.nextElementSibling.remove(); b.remove(); } };""")
rep("""        desc.insertAdjacentHTML('afterend', `${WhereToWatch.honours(m)}${WhereToWatch.key() ? '<div class="wtw" id="dWtw"></div>' : ''}`);
        icons(); if (!loading) WhereToWatch.fill(m);""",
    """        desc.insertAdjacentHTML('afterend', `${WhereToWatch.honours(m)}${WhereToWatch.key() ? '<div class="wtw" id="dWtw"></div>' : ''}`);
        dropAwards(); icons(); if (!loading) WhereToWatch.fill(m);""")

# 8. TV: Back to Home puts the focus on Home again
rep("""    const h = $('#tabs .tab'); if (h && !h.classList.contains('on')) { h.click(); return; }""",
    """    const h = $('#tabs .tab'); if (h && !h.classList.contains('on')) { h.click(); Nav.settle(); return; }""")

open(p, 'w', encoding='utf-8').write(s)
print('applied')
