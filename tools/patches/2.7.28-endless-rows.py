#!/usr/bin/env python3
"""Endless rows + uncropped art + TV contrast.
1. Home catalog rows load more as you scroll right (touch, trackpad, mouse wheel) or press Right on a TV remote near
   the end: first the rest of the page already fetched, then the next addon page (Stremio skip= extra). "See all"
   stays in the row header, and a See all tile closes the row when the catalog runs out (or at a cap: 240 on TV).
   Nav.items skips posters in rows far off screen, so longer rows don't slow every key press on TV.
2. Detail-page art crops from the bottom (under the fade) instead of the middle, so heads and faces stay in view,
   and the detail banner is a little taller on wide screens.
3. TV: no dark text on light fills. Smart Play, selected chips, the IMDb badge, stream tags and the exit prompt's
   Stay button become light text on dark with a platinum edge (on Drake's TV, dark text on white showed as white).
Adds one <script> and one <style> before </body>, patches Nav, and bumps the version by one.
Idempotent. Usage: python3 this.py index.html [sw.js]"""
import re, sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
MARK = '/* Endless rows (2.7.28+) */'

JS = r'''
/* Scrolling or pressing Right near the end of a Home row adds the next titles; "See all" stays in the header */
const Endless = {
  CHUNK: IS_TV ? 24 : 40, CAP: IS_TV ? 240 : 400,
  attach(sec, cat, metas, shown) {
    const rail = sec.querySelector('.rail'); if (!rail) return;
    const ids = new Set(metas.map((m) => m.id));
    rail._inf = { cat, buf: metas.slice(shown), ids, skip: metas.length, count: shown, done: !cat.extras.some((e) => e.name === 'skip'), busy: false, ended: false, fails: 0, waitTill: 0 };
    if (rail._inf.done && !rail._inf.buf.length) this.end(rail);
    else if (rail.scrollWidth <= rail.clientWidth * 1.5) this.near(rail);
  },
  // el: the poster the remote is on (TV), or nothing for a scroll
  near(rail, el) {
    const st = rail._inf; if (!st || st.busy || st.ended || performance.now() < st.waitTill) return;
    if (el) { let x = el; for (let n = 0; n < 8 && x; n++) x = x.nextElementSibling; if (x) return; }
    else if (rail.scrollLeft + rail.clientWidth < rail.scrollWidth - rail.clientWidth * 1.5) return;
    this.more(rail);
  },
  async more(rail) {
    const st = rail._inf; st.busy = true;
    try {
      if (st.buf.length < this.CHUNK && !st.done) {
        if (!st.buf.length) rail.insertAdjacentHTML('beforeend', '<div class="skeleton rail-sk"></div>'.repeat(3));
        try {
          const metas = await engine.fetchCatalog(st.cat, { skip: st.skip });
          st.skip += metas.length; st.fails = 0;
          const add = metas.filter((m) => !st.ids.has(m.id)); add.forEach((m) => st.ids.add(m.id));
          if (!add.length) st.done = true; else st.buf.push(...add);
        } catch (e) { if (++st.fails >= 3) st.done = true; else st.waitTill = performance.now() + 4000; }
        rail.querySelectorAll('.rail-sk').forEach((x) => x.remove());
      }
      if (!rail.isConnected) return;
      const take = st.buf.splice(0, Math.max(0, Math.min(this.CHUNK, this.CAP - st.count)));
      st.count += take.length;
      if (take.length) { rail.insertAdjacentHTML('beforeend', take.map((m) => cardHTML(m)).join('')); icons(); queueWall(); }
      if (st.count >= this.CAP || (st.done && !st.buf.length)) this.end(rail);
    } finally { st.busy = false; }
  },
  end(rail) {
    const st = rail._inf; if (!st || st.ended) return; st.ended = true;
    rail.insertAdjacentHTML('beforeend', '<button class="rail-all" type="button" data-nav><i data-lucide="layout-grid"></i><span>See all</span></button>');
    rail.lastElementChild.addEventListener('click', () => openCatalog(st.cat)); icons();
  },
};
{
  let pend = new Set(), raf = 0;
  document.addEventListener('scroll', (e) => {
    const r = e.target; if (!r || !r._inf || r._inf.ended) return;
    pend.add(r); if (!raf) raf = requestAnimationFrame(() => { raf = 0; pend.forEach((x) => Endless.near(x)); pend.clear(); });
  }, { capture: true, passive: true });
}
'''

CSS = r'''
/* Art crops from the bottom, under the fade, so heads and faces stay in view */
.d-hero .bg,.pal-top .pt-bg img{object-position:50% 12%}
@media (min-width:761px) and (min-height:541px){.d-hero{min-height:clamp(300px,54vh,560px)}}
/* the tile that ends an endless row */
.rail-all{flex:none;align-self:stretch;width:clamp(120px,11vw,160px);display:grid;place-content:center;justify-items:center;gap:10px;border-radius:var(--r-m);border:1px solid var(--line-hi);background:rgba(255,255,255,.03);color:var(--ink);font-weight:600;font-size:14px;scroll-snap-align:start}
.rail-all .lucide{width:26px;height:26px}
@media (hover:hover){.rail-all:hover{background:rgba(255,255,255,.07)}}
.rail>.skeleton.rail-sk{flex:none;width:clamp(132px,14vw,192px)}
/* TV: no dark text on a light fill. Light text on dark with a platinum edge reads on every TV picture mode */
html.tv .btn-prime,html.tv .btn-bolt,html.tv a.btn.btn-prime,html.tv a.btn.btn-bolt,html.tv .exit-ask .xa-stay{color:#fff!important;background:linear-gradient(180deg,#2b2b30,#121215)!important;box-shadow:inset 0 0 0 2px #e6e6e9!important;border:0}
html.tv .btn-bolt>svg.lucide{background:#f2f2f3;color:#000;fill:#000;box-shadow:none}
html.tv .sp-l small{color:rgba(255,255,255,.66)}
html.tv .btn-bolt::after{display:none}
html.tv .chip.on,html.tv .pk .chip.on,html.tv .segc button.on,html.tv .qp-g.on{color:#fff!important;background:#26262b!important;border-color:#f2f2f3!important;box-shadow:inset 0 0 0 1px #f2f2f3!important}
html.tv .chip.on .tag-s{color:#fff!important;background:rgba(255,255,255,.12)!important;border-color:rgba(255,255,255,.45)!important}
html.tv .tb.res,html.tv .tb.res.k4,html.tv .tb.deb{color:#fff;background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.6)}
html.tv .tb.res.k4,html.tv .tb.deb{color:#efe7d2;border-color:#d9d4c7;background:rgba(217,212,199,.14)}
html.tv .imdb,html.tv .imdb.r-hi,html.tv .imdb.r-lo{color:#fff;background:#141417;box-shadow:inset 0 0 0 1.5px #f5c518}
html.tv .imdb.r-hi{box-shadow:inset 0 0 0 1.5px #3fd98a}
html.tv .imdb.r-lo{box-shadow:inset 0 0 0 1.5px #f07a66}
html.tv .badge-r.r-hi,html.tv .badge-r.r-mid,html.tv .badge-r.r-lo{color:#fff;background:rgba(10,10,12,.88);box-shadow:inset 0 0 0 1.5px currentColor}
html.tv .badge-r.r-hi{color:#7af0b4}html.tv .badge-r.r-mid{color:#ffd76a}html.tv .badge-r.r-lo{color:#ff9a85}
html.tv .rail-all.nav-focus{background:rgba(255,255,255,.08)}
'''

def sub1(old, new):
    global s
    assert s.count(old) == 1, ('anchor not found once', old[:80])
    s = s.replace(old, new)

if MARK not in s:
    # Home catalog rows hand their page to Endless
    sub1("fillRail(sec, metas.slice(0, IS_TV ? 24 : 40).map((m) => cardHTML(m)).join(''));",
         "{ const shown = IS_TV ? 24 : 40; fillRail(sec, metas.slice(0, shown).map((m) => cardHTML(m)).join('')); if (typeof Endless !== 'undefined') Endless.attach(sec, cat, metas, Math.min(shown, metas.length)); }")
    # TV remote: Right near the end loads more
    sub1("this.mem.set(this.root(), el); const rail = el.closest('.rail'); if (rail) rail._navLast = el;",
         "this.mem.set(this.root(), el); const rail = el.closest('.rail'); if (rail) { rail._navLast = el; if (rail._inf) Endless.near(rail, el); }")
    # Nav.items: posters in rows far above or below the screen are never measured
    sub1("""    for (const el of root.querySelectorAll('[data-nav], button, a[href], input, select, textarea, [tabindex="0"]')) {
      if (el.disabled || el.tabIndex < 0) continue;""",
         """    const railR = new Map(), vh = innerHeight;
    for (const el of root.querySelectorAll('[data-nav], button, a[href], input, select, textarea, [tabindex="0"]')) {
      if (el.disabled || el.tabIndex < 0) continue;
      const pr = el.parentElement;
      if (pr && pr.classList.contains('rail')) {
        let rr = railR.get(pr);
        if (rr === undefined) { const b = pr.getBoundingClientRect(); rr = b.bottom > -vh * 1.5 && b.top < vh * 2.5; railR.set(pr, rr); }
        if (!rr) continue;
      }""")
    end = '</body>'
    assert s.count(end) == 1
    s = s.replace(end, '<script>\n' + MARK + JS + '</script>\n<style>\n/* ===== Endless rows, uncropped art, TV contrast ===== */' + CSS + '</style>\n' + end)
    m = re.search(r"const APP_VERSION = '2\.7\.(\d+)';", s); old = int(m.group(1)); new = old + 1
    s = s.replace(m.group(0), f"const APP_VERSION = '2.7.{new}';")
    open(p, 'w', encoding='utf-8').write(s)
    if len(sys.argv) > 2:
        w = open(sys.argv[2], encoding='utf-8').read()
        w2 = w.replace(f"mkc-2.7.{old}'", f"mkc-2.7.{new}'"); assert w2 != w, 'sw version not found'
        open(sys.argv[2], 'w', encoding='utf-8').write(w2)
    print(f'patched: 2.7.{old} -> 2.7.{new}')
else:
    print('already patched')
