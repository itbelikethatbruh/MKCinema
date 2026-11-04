# MKCinema 2.7.8: Chrome on Android tablets (and "Desktop site" on phones) sends a Linux desktop user agent,
# so MKCinema thought it was a Linux PC and hid VLC, MX Player, Just Player, mpv and the app picker.
# A touch screen with a Linux user agent that is not ChromeOS is treated as Android. Usage: python3 2.7.8-android-desktop-mode.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
a = """  if (/Android/i.test(ua)) return 'android';"""
assert s.count(a) == 1
s = s.replace(a, """  if (/Android/i.test(ua) || /Android/i.test((navigator.userAgentData || {}).platform || '')) return 'android';
  // Android Chrome in desktop mode (the default on tablets) claims to be Linux; a Linux desktop almost never has a touch screen
  if (/Linux/i.test(ua) && !/CrOS/i.test(ua) && navigator.maxTouchPoints > 0) return 'android';""")
open(p, 'w').write(s); print('patched')
