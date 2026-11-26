#!/usr/bin/env python3
"""2.95.9 Load more by itself: near the bottom of any list, grid or guide the next page comes in with nothing to press,
on phones (swipe), computers (wheel/scroll) and TVs (moving the remote highlight down). Replaces the Movies/Series-only
infinite scroll with one shared check that covers every "Load more" / "Show more" button.
python3 patch.py <APP_DIR>  (source form, idempotent; then minify + csp-hash. No new inline blocks, no new UI text.)"""
import sys, os
F = os.path.join(sys.argv[1], 'index.html'); s = open(F, encoding='utf-8').read()
MARK = '/* 2.95.9 load more by itself */'
if MARK in s: print('already patched'); sys.exit()
R = [
# 1. the one shared check (replaces the Movies/Series-only window scroll check, in the same place)
("""// Infinite scroll for Movies and Series: one check per frame at most, and only on those views
let moreRaf = 0;
addEventListener('scroll', () => {
  if (moreRaf || (S.view !== 'movie' && S.view !== 'series')) return;
  moreRaf = requestAnimationFrame(() => { moreRaf = 0; const s = document.getElementById('discMore'); if (s && !s.hidden && s.getBoundingClientRect().top < innerHeight + 400) s.click(); });
}, { passive: true });
""",
"""""" + MARK + """
/* Nobody presses "Load more": when a list, grid or guide is near its bottom (a swipe, the wheel, or the TV remote moving
   the highlight down), its next page loads by itself. Each list keeps its own button and loading code; the button just
   shows as a quiet spinner that taps and the remote skip. If a page fails to arrive twice, the button comes back as a
   normal button so the next page can still be asked for by hand, and pressing it turns the automatic loading back on. */
const AutoMore = {
  SEL: '#discMore,#chMore,#mkdMore,#netMore,#animeMore,#xtMore,#ltMore,#nbMore,#brMore,#cpAll',
  raf: 0,
  later() { if (!this.raf) this.raf = requestAnimationFrame(() => this.check()); },
  // the nearest box that scrolls (a layer or panel), or null for the page itself
  box(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.scrollHeight > p.clientHeight + 4) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll') return p; }
    }
    return null;
  },
  quiet(b) { b.classList.add('am-on'); b.tabIndex = -1; b.setAttribute('aria-busy', 'true'); },
  // two pages in a row did not arrive: a normal button again, and a press restarts the automatic loading
  stop(b) {
    b._amStop = true; b.classList.remove('am-on'); b.removeAttribute('tabindex'); b.removeAttribute('aria-busy');
    b.addEventListener('click', () => { b._amStop = false; b._amFail = 0; b._amW = null; }, { once: true, capture: true });
  },
  check() {
    this.raf = 0;
    if (document.hidden || document.body.classList.contains('mk-player-on')) return;
    for (const b of document.querySelectorAll(this.SEL)) {
      if (b.hidden || b.disabled || b._amStop) continue;
      if (!b.classList.contains('am-on')) this.quiet(b);
      if (!b.getClientRects().length || b.closest('[hidden],[inert]')) continue;
      if (b._amBox === undefined || (b._amBox && !b._amBox.contains(b))) b._amBox = this.box(b);
      const box = b._amBox, h = box ? box.scrollHeight : document.documentElement.scrollHeight, w = b._amW, now = performance.now();
      if (w) {
        if (h > w.h + 8) { b._amW = null; b._amFail = 0; } // the page arrived: ready for the next one
        else if (now - w.at < 8000) continue; // still on its way
        else { b._amW = null; if ((b._amFail = (b._amFail || 0) + 1) >= 2) { this.stop(b); continue; } }
      }
      const br = box && box.getBoundingClientRect(), top = br ? Math.max(0, br.top) : 0, bot = br ? Math.min(innerHeight, br.bottom) : innerHeight;
      if (b.getBoundingClientRect().top > bot + Math.max(480, (bot - top) * 1.2)) continue; // not near the bottom yet
      b._amW = { h, at: now };
      b.click();
    }
  },
};
document.addEventListener('scroll', () => AutoMore.later(), { capture: true, passive: true });
document.addEventListener('focusin', () => AutoMore.later());
addEventListener('resize', () => AutoMore.later(), { passive: true });
// lists too short to scroll, and pages that open already near their end
setInterval(() => AutoMore.later(), 600);
"""),
# 2. a person's filmography grows 60 at a time like every other list, instead of drawing hundreds of rows at once
("""    const all = $('#cpAll'); if (all) all.onclick = () => { this.limit = 100000; this.paint(); };""",
"""    const all = $('#cpAll'); if (all) all.onclick = () => { this.limit = (this.limit || 60) + 60; this.paint(); };"""),
# 3. the look: a small spinning ring where the button was (transform-only animation)
(""".rail>.skeleton.rail-sk{flex:none;width:clamp(132px,14vw,192px)}""",
""".rail>.skeleton.rail-sk{flex:none;width:clamp(132px,14vw,192px)}
.btn.am-on{pointer-events:none;position:relative;min-width:48px;color:transparent!important;background:none!important;border-color:transparent!important;box-shadow:none!important;outline:0!important}
.btn.am-on>*{opacity:0}
.btn.am-on::before{display:none!important}
.btn.am-on::after,html.tv .btn.am-on::after{content:""!important;display:block!important;position:absolute!important;left:50%!important;top:50%!important;bottom:auto!important;width:22px!important;height:22px!important;margin:-11px 0 0 -11px;z-index:auto!important;border-radius:50%;background:none!important;border:2px solid rgba(var(--kffffff-c,255,255,255),.14);border-top-color:rgba(var(--kffffff-c,255,255,255),.7);transform:none;transition:none!important;animation:rot .8s linear infinite}"""),
]
for a, b in R:
    n = s.count(a)
    if n != 1: sys.exit(f'anchor found {n} times: {a[:90]!r}')
    s = s.replace(a, b)
open(F, 'w', encoding='utf-8').write(s)
print('patched', F)
