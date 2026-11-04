# MKCinema 2.7.14: fixes from the 2026-10-30 audit.
# - A blocked YouTube embed no longer has MKCinema's message drawn on top of YouTube's own error and logo.
# - Wide addon logos (OpenSubtitles) fit their tile instead of being cropped to "pen S".
# - The first-run "What do you watch most?" buttons are one style, so none looks pre-selected.
# - Accessibility: the main tabs are no longer a tablist without tabs, the logo has role img,
#   the two pop-up prompts have names.
# - Relay copy no longer singles out one debrid service.
# Usage: python3 2.7.14-audit.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)

rep("function trMsg(html) { const m = $('#trMsg'); m.hidden = !html; m.innerHTML = html || ''; $('#trBar').hidden = !!html; icons(); }",
    "function trMsg(html) { const m = $('#trMsg'); m.hidden = !html; m.innerHTML = html || ''; $('#trBar').hidden = !!html; $('#trSlot').style.visibility = html ? 'hidden' : ''; icons(); }")

rep(".addon .logo{color:#fff;background:linear-gradient(160deg,#2a2a2e,#0e0e10);border:1px solid var(--line)}",
    ".addon .logo{color:#fff;background:linear-gradient(160deg,#2a2a2e,#0e0e10);border:1px solid var(--line)}\n.addon img.logo{object-fit:contain;padding:6px;background:#141416}")

rep("""`<button class="btn ${v === 'both' ? 'btn-ghost' : 'btn-prime'} btn-sm" type="button" data-focus="${v}">${l}</button>`""",
    """`<button class="btn btn-ghost btn-sm" type="button" data-focus="${v}">${l}</button>`""")

rep("""<div class="tabs" id="tabs" role="tablist">""", """<div class="tabs" id="tabs">""")
rep("""<div class="brand" aria-label="MKCinema">""", """<div class="brand" role="img" aria-label="MKCinema">""")
rep("""t.className = 'focus-ask glass-solid'; t.setAttribute('role', 'dialog');""",
    """t.className = 'focus-ask glass-solid'; t.setAttribute('role', 'dialog'); t.setAttribute('aria-label', 'Home layout');""")
rep("""t.className = 'sup-ask glass-solid'; t.setAttribute('role', 'dialog');""",
    """t.className = 'sup-ask glass-solid'; t.setAttribute('role', 'dialog'); t.setAttribute('aria-label', 'Support MKCinema');""")

rep("? 'TorBox and the other debrid services refuse direct calls from a web page,", "? 'Debrid services refuse direct calls from a web page,")
rep(": 'TorBox and the other debrid services refuse direct calls from a web page,", ": 'Debrid services refuse direct calls from a web page,")
open(p, 'w').write(s); print('patched')
# Review fix: the audio-cycle shortcut threw on a TorBox HLS stream with no track list (tracks: []).
s = open(p).read()
rep("    if (st && st.state === 'ok') { const n = st.tracks[",
    "    if (st && st.state === 'ok' && !st.tracks.length) { if (!s._audioTry) this.pick(-1); else toast('Pick a language from the audio menu', 'info'); return true; }\n    if (st && st.state === 'ok') { const n = st.tracks[")
open(p, 'w').write(s); print('patched cycle guard')
