#!/usr/bin/env python3
"""2.13.1 TV remote fixes (Reddit feedback):
1. Side menu: Up/Down inside the rail walk the rail in order, so Addons, Account, Watch party and Settings
   (pinned to the bottom) are reachable. Before, at 1280x720 TV viewports Down from Calendar jumped to Home.
2. Settings: Up/Down choose only among the column you are in (lane), so right-aligned buttons such as
   Plugins & themes "Add" are reachable from the tabs. Before, the best geometric pick was in the section list,
   which 2.11.1 refused, so focus never moved.
3. Walkthrough: the panel has a fixed height and the step scrolls inside it, so Back/Next stay in one place.
Idempotent. Usage: python3 -I 2.13.1-tv-nav-focus.py index.html"""
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
MARK = '2.13.1 TV remote: side menu lane'
if MARK in s:
    print('already applied'); sys.exit(0)

JS = r"""/* ---------------- 2.13.1 TV remote: side menu lane, Settings lanes ----------------
   Reported on Reddit (Android TV, side menu): "when you scroll past Calendar focus moves right, over to the catalog"
   and, in Settings › Plugins & themes, Down never reached the Add buttons.
   1. In the side menu, Up and Down walk the menu in order, from Search down to Settings at the bottom, and stop there.
   2. In the walkthrough, Up and Down scroll a step that is taller than the screen.
   3. In Settings, Up and Down walk the column the focus is in row by row, so a button on the far right of the options
      is found from a tab on the left and no row is skipped. Back closes Settings, as before. */
(() => {
  if (!IS_TV) return;
  let lane = null;
  const it = Nav.items.bind(Nav);
  Nav.items = function (root) { const l = it(root); return lane ? l.filter((x) => lane.contains(x)) : l; };
  const within = (box, fn) => { lane = box; try { return fn(); } finally { lane = null; } };
  const mv = Nav.move.bind(Nav);
  Nav.move = function (dir, fast) {
    const a = document.activeElement, root = Nav.root();
    if (!a || a === document.body || !root || (dir !== 'up' && dir !== 'down')) return mv(dir, fast);
    // 1. side menu
    const rail = root.id === 'app' && SideNav.side() && a.closest('.dock-wrap');
    if (rail) {
      const list = Nav.items(root).filter((x) => rail.contains(x)), top = (x) => (Nav.rects.get(x) || x.getBoundingClientRect()).top;
      list.sort((p, q) => top(p) - top(q)); Nav.rects.clear();
      const i = list.indexOf(a); if (i < 0) return mv(dir, fast);
      const n = list[i + (dir === 'down' ? 1 : -1)]; if (n) Nav.focus(n, fast);
      return;
    }
    // 2. walkthrough: a long step (the comparison table) scrolls with Up and Down when nothing to focus lies that way
    if (root.id === 'tour') {
      const tb = $('#tourBody');
      if (dir === 'up' && tb && tb.scrollTop > 0 && a.closest('.tour-nav') && !tb.querySelector('[data-nav], button, a[href], input')) { tb.scrollBy({ top: -220, behavior: fast ? 'auto' : 'smooth' }); return; }
      const r = mv(dir, fast);
      if (document.activeElement === a && tb && tb.scrollHeight > tb.clientHeight + 4) tb.scrollBy({ top: dir === 'down' ? 220 : -220, behavior: fast ? 'auto' : 'smooth' });
      return r;
    }
    // 3. Settings columns: walk the column row by row (the nearest row that way, then the control in it closest
    //    across), so a small control at the end of a row, such as Text color under a wide slider, is never skipped
    if (root.id === 'settings') {
      const nav = $('#setNav'), body = $('#setBody'), pane = nav && nav.contains(a) ? nav : body && body.contains(a) ? body : null;
      if (!pane) return mv(dir, fast);
      const A = a.getBoundingClientRect(), ay = A.top + A.height / 2, ax = A.left + A.width / 2, down = dir === 'down';
      const cand = []; let near = Infinity;
      for (const el of within(pane, () => Nav.items(root))) {
        if (el === a || el.contains(a) || a.contains(el)) continue;
        const dt = el.closest('details'); if (dt && !dt.open && !el.closest('summary')) continue;   // inside a closed licence
        const r = Nav.rects.get(el) || el.getBoundingClientRect(), dy = down ? r.top + r.height / 2 - ay : ay - (r.top + r.height / 2);
        const gap = down ? r.top - A.bottom : A.top - r.bottom;
        if (dy <= 4 || gap < -A.height / 2) continue;
        cand.push([el, r, gap]); if (gap < near) near = gap;
      }
      Nav.rects.clear();
      const row = cand.filter((c) => c[2] <= near + 16);
      let best = null, bd = Infinity;
      for (const [el, r] of row) { const d = Math.abs(r.left + r.width / 2 - ax); if (d < bd) { bd = d; best = el; } }
      if (best) { if (pane === body) Nav.mem.set(body, best); Nav.focus(best, fast); return; }
      if (pane === body) { const sc = a.closest('.set-body, .layer-ov') || body; sc.scrollBy({ top: down ? 200 : -200, behavior: 'smooth' }); }
      return;
    }
    return mv(dir, fast);
  };
})();

"""
ANCHOR = '/* ---------------- 2.12.0 Anime skipping for every addon'
assert s.count(ANCHOR) == 1, 'js anchor'
s = s.replace(ANCHOR, JS + ANCHOR)

CSS_ANCHOR = '#tour .tour-modal{max-width:1040px'
CSS = ("/* 2.13.1 walkthrough: one fixed panel height, the step scrolls inside it, so Back and Next never move */\n"
       "#tour .tour-modal{display:flex;flex-direction:column;height:calc(100vh - 40px);height:calc(100dvh - 40px);max-height:none;overflow:hidden}\n"
       "#tour #tourBody{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column}\n"
       "#tour #tourBody>.tour-step{margin-block:auto;width:100%}\n"
       "#tour .tour-top,#tour .tour-nav{flex:none}\n"
       "#tour #tourBody .qp-foot{bottom:0;background:linear-gradient(0deg,var(--n000000,#000) 70%,transparent)}\n"
       "#tour #tourBody.more{-webkit-mask-image:linear-gradient(180deg,#000 82%,transparent);mask-image:linear-gradient(180deg,#000 82%,transparent)}\n"
       "@media (max-width:620px){#tour .tour-modal{height:100vh;height:100dvh;min-height:0}}\n")
i = s.index(CSS_ANCHOR)
s = s[:i] + CSS + s[i:]

OLD = "  $('#tour .modal').scrollTop = 0;\n"
assert s.count(OLD) == 1, 'tour scroll'
s = s.replace(OLD, "  $('#tour .modal').scrollTop = 0; body.scrollTop = 0; tourMore();\n")
OLD2 = "$('#tourNext').onclick = () => tourGo(1);\n"
assert s.count(OLD2) == 1, 'tour next'
s = s.replace(OLD2, OLD2 + "/* 2.13.1: a step taller than the panel fades at the bottom until it is scrolled to the end */\nfunction tourMore() { const b = $('#tourBody'); if (b) b.classList.toggle('more', !b.querySelector('.qp-foot') && b.scrollTop + b.clientHeight < b.scrollHeight - 4); }\n$('#tourBody').addEventListener('scroll', tourMore, { passive: true }); addEventListener('resize', tourMore);\n")

open(p, 'w', encoding='utf-8').write(s)
print('applied')
