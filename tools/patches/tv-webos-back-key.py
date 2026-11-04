# MKCinema TV: the Back button on an LG webOS remote (keyCode 461, key 'GoBack'/'BrowserBack') closes whatever is open,
# like Escape, and leaves the app from Home. Needed by the webOS app, which turns off webOS's own history-back handling.
# Android TV doesn't need this: its wrapper handles Back natively. Usage: python3 tv-webos-back-key.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
rep("""  if (k === 'Escape') { e.preventDefault(); back(); return; }
  if (typing) return;""",
    """  if (k === 'Escape') { e.preventDefault(); back(); return; }
  if (e.keyCode === 461 || k === 'GoBack' || k === 'BrowserBack') {
    e.preventDefault();
    const open = ['remote', 'castLayer', 'partyLayer', 'player', 'trailer', 'tour', 'stremioImport', 'palette', 'epSheet', 'askLayer', 'tastePick', 'settings', 'addons', 'detail'].some((id) => { const el = $(`#${id}`); return el && !el.hidden; });
    if (open) back(); else if (/Web0S|webOS/.test(navigator.userAgent)) window.close();
    return;
  }
  if (typing) return;""")
open(p, 'w').write(s); print('patched')
