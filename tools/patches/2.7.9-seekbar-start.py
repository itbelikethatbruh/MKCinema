# MKCinema 2.7.9: the seek-bar dot starts where the film will really start (0, or the resume point) instead of
# wherever the last video left it / mid-bar while the length is still unknown. Usage: python3 2.7.9-seekbar-start.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
# 05-app playStream: place the bar before anything loads
rep("""  teardown();
  Loader.show(ctx.meta);
  renderSourceDrawer();""", """  teardown();
  // the bar starts at the real starting point (0 or the resume point), not where the last video left it
  { const pr = S.progress[key], d0 = pr && pr.d, pct = startAt && d0 > 0 ? clamp(startAt / d0 * 100, 0, 100) : 0; $('#sCur').style.width = `${pct}%`; $('#sKnob').style.left = `${pct}%`; $('#sBuf').style.width = '0%'; $('#pTime').textContent = d0 > 0 ? `${fmtTime(startAt || 0)} / ${fmtTime(d0)}` : fmtTime(startAt || 0); }
  Loader.show(ctx.meta);
  renderSourceDrawer();""")
# 05-app timeupdate: an unknown length (NaN, before metadata) is not a live stream, so the dot is left alone
rep("""video.addEventListener('timeupdate', () => {
  const d = pDur(), t = pNow(), live = !isFinite(d);""", """video.addEventListener('timeupdate', () => {
  const d = pDur(), t = pNow(), live = !isFinite(d);
  if (Number.isNaN(d)) return;""")
# 01-head CSS: the dot's resting place is the start
rep(""".seek .knob{position:absolute;width:14px;""", """.seek .knob{position:absolute;left:0;width:14px;""")
open(p, 'w').write(s); print('patched')
