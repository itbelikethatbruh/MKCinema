# MKCinema 2.7.11: the Rails / IMAX switch does nothing on phones and tablets (touch-ui flattens the curved wall
# for scroll performance), so touch devices no longer show the switch, the setting or the palette command,
# and a saved IMAX choice is ignored there. Usage: python3 2.7.11-no-imax-on-touch.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
# 01-head CSS
rep("""body.touch-ui.wall .rail{transform-style:flat}""", """body.touch-ui.wall .rail{transform-style:flat}
body.touch-ui .dock .seg{display:none}""")
# 05-app: boot never turns the wall on for touch
rep("""  setWall(S.wall); setMuteIcon();""", """  setWall(S.wall && !TOUCH_UI); setMuteIcon();""")
rep("""function setWall(on) {
  S.wall = on; Store.set('wall', on);""", """function setWall(on) {
  // the curved wall is desktop only: touch screens keep flat rails (and keep a desktop choice saved for that device)
  if (TOUCH_UI) { S.wall = false; document.body.classList.remove('wall'); return; }
  S.wall = on; Store.set('wall', on);""")
rep("""  { label: 'Toggle curved IMAX wall', icon: 'gallery-horizontal', run: () => setWall(!S.wall) },""",
    """  ...(TOUCH_UI ? [] : [{ label: 'Toggle curved IMAX wall', icon: 'gallery-horizontal', run: () => setWall(!S.wall) }]),""")
# 06-settings
i = s.index("    { key: 'wall', label: 'Curved IMAX wall',"); j = s.index('\n', i)
line = s[i:j]
assert line.endswith('},')
s = s[:i] + "    ...(TOUCH_UI ? [] : [" + line.strip()[:-1] + "]),"  + s[j:]
open(p, 'w').write(s); print('patched')
