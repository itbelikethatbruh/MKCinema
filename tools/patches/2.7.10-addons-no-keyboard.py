# MKCinema 2.7.10: opening Add-ons (or tapping a suggested addon) no longer focuses the URL field on touch
# devices, so the on-screen keyboard only opens when the field itself is tapped. Usage: python3 2.7.10-addons-no-keyboard.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)
rep("""$('#openAddons').onclick = () => { renderAddons(); openLayer('addons'); setTimeout(() => $('#addonUrl').focus(), 50); };""",
    """// on phones and tablets a focused field pops the keyboard over the list, so only keyboards-and-mice get the head start
$('#openAddons').onclick = () => { renderAddons(); openLayer('addons'); if (!TOUCH_UI) setTimeout(() => $('#addonUrl').focus(), 50); };""")
rep("""{ $('#addonUrl').value = b.dataset.url; $('#addonUrl').focus(); }""", """{ $('#addonUrl').value = b.dataset.url; if (!TOUCH_UI) $('#addonUrl').focus(); }""")
open(p, 'w').write(s); print('patched')
