#!/usr/bin/env python3
"""2.8.7 TV trailers (Drake, 2026-11-05): on TVs, trailers open in the YouTube app, which plays them with the TV's own
video hardware instead of an embedded web player. Needs Android app 1.2.4 (MKAndroid.youtube); older apps, browsers and
phones keep the embedded player. Settings > Trailers gains "Best for this device" (the new default).
Usage: python3 -I this.py index.html sw.js   (on 2.8.6; idempotent)"""
import re, sys
p, swp = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if "const APP_VERSION = '2.8.7'" in s: print('already applied'); sys.exit(0)

def sub(a, b):
    global s
    assert s.count(a) == 1, a[:60]
    s = s.replace(a, b, 1)

sub("introMode: 'always', sfxVolume: 70, trailerMode: 'embed',", "introMode: 'always', sfxVolume: 70, trailerMode: 'auto',")
sub("""if (CFG.cfgRev < 9) {
  // rev 9: High text contrast is the default; a choice the user made themselves is kept
  if (!CFG.contrastChosen) CFG.contrast = 'high';
  CFG.cfgRev = 9;
}""", """if (CFG.cfgRev < 9) {
  // rev 9: High text contrast is the default; a choice the user made themselves is kept
  if (!CFG.contrastChosen) CFG.contrast = 'high';
  CFG.cfgRev = 9;
}
if (CFG.cfgRev < 10) {
  // rev 10: trailers default to "Best for this device" (the YouTube app on TVs); "Open on YouTube" is kept
  if (CFG.trailerMode !== 'link') CFG.trailerMode = 'auto';
  CFG.cfgRev = 10;
}""")
sub("""  if (CFG.trailerMode === 'link') { window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, '_blank', 'noopener'); return; }
  closeTrailer(true);""", """  if (CFG.trailerMode === 'link') { window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, '_blank', 'noopener'); return; }
  // TVs: the YouTube app decodes with the TV's video hardware, so trailers play smoothly where a web player stutters
  if (CFG.trailerMode !== 'embed' && IS_TV && window.MKAndroid && typeof MKAndroid.youtube === 'function') {
    let ok = false; try { ok = MKAndroid.youtube(String(id)); } catch (e) { ok = false; }
    if (ok) return;
  }
  closeTrailer(true);""")
sub("type: 'select', options: [['embed', 'Play inside MKCinema'], ['link', 'Open on YouTube']] },",
    "type: 'select', options: [['auto', 'Best for this device'], ['embed', 'Play inside MKCinema'], ['link', 'Open on YouTube']] },")
sub("{ key: 'trailerMode', label: 'Trailers', help: 'Embedded trailers",
    "{ key: 'trailerMode', label: 'Trailers', help: 'Best for this device opens trailers in the YouTube app on TVs with the MKCinema TV app 1.2.4 or later, where they play smoothly, and plays them inside MKCinema everywhere else. Embedded trailers")
s, n = re.subn(r"const APP_VERSION = '2\.8\.6';", "const APP_VERSION = '2.8.7';", s); assert n == 1
open(p, 'w', encoding='utf-8').write(s)
sw = open(swp).read(); sw, n = re.subn(r"const VERSION = 'mkc-[\d.]+';", "const VERSION = 'mkc-2.8.7';", sw); assert n == 1; open(swp, 'w').write(sw)
print('applied: 2.8.7')
