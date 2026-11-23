#!/bin/bash
# Real update test, tapping like a person (see .github/workflows/android-update-test.yml).
# Needs a booted emulator, $APK (an old release), $OUT. Installs the old app from "the browser" (no installer of record),
# waits for the page's Install button, taps it, taps Android's own Update/Install prompt, and checks the new version.
# Then it restarts the screen (font size change) to check the page comes back instead of a black screen.
set -u
mkdir -p "$OUT"; P=com.mkcinema.app
shot() { adb exec-out screencap -p > "$OUT/$1.png" 2>/dev/null; }
vname() { adb shell dumpsys package $P | grep -m1 versionName | tr -d '\r ' | cut -d= -f2; }
note() { echo "[$(date +%T)] $*" | tee -a "$OUT/steps.txt"; }
# tap the centre of the first on-screen node whose text or description matches $1 (regex); prints what it tapped
tapnode() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1; adb shell cat /sdcard/ui.xml > "$OUT/ui.xml" 2>/dev/null
  python3 - "$1" "$OUT/ui.xml" <<'PY'
import re, sys, subprocess, xml.etree.ElementTree as ET
pat = re.compile(sys.argv[1], re.I)
try: root = ET.parse(sys.argv[2]).getroot()
except Exception: sys.exit(1)
for n in root.iter('node'):
    label = (n.get('text') or '') + '|' + (n.get('content-desc') or '')
    t = (n.get('text') or n.get('content-desc') or '').strip()
    if t and pat.fullmatch(t):
        m = re.findall(r'\d+', n.get('bounds', ''))
        if len(m) == 4:
            x, y = (int(m[0]) + int(m[2])) // 2, (int(m[1]) + int(m[3])) // 2
            if x > 0 and y > 0:
                subprocess.run(['adb', 'shell', 'input', 'tap', str(x), str(y)])
                print(t, n.get('package'), x, y); sys.exit(0)
sys.exit(1)
PY
}
adb shell settings put global window_animation_scale 0; adb shell settings put global transition_animation_scale 0
sleep 45 # let the emulator finish its own first-boot changes
adb install -r "$APK" 2>&1 | tee -a "$OUT/steps.txt"
adb shell appops set $P REQUEST_INSTALL_PACKAGES allow
adb shell pm grant $P android.permission.POST_NOTIFICATIONS 2>/dev/null
FROM=$(vname); note "installed $FROM"
adb logcat -c; adb logcat -v time > "$OUT/logcat.txt" 2>&1 & LC=$!
adb shell monkey -p $P -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
note "opened the app"
tapped=""
for i in $(seq 1 24); do
  sleep 10
  if r=$(tapnode 'install|install now|install update'); then note "page button tapped: $r"; tapped=1; shot "1-page-install"; break; fi
  # an app with "update by itself" off shows the Update button first; tap it once, then wait for Install
  if [ -z "${upd:-}" ] && r=$(tapnode 'update'); then note "page Update tapped: $r"; upd=1; shot "0-page-update"; fi
done
[ -z "$tapped" ] && { note "RESULT: no Install button on the page after 240 s"; shot "1-no-install"; }
ok=""
if [ -n "$tapped" ]; then
  for i in $(seq 1 12); do
    sleep 5
    if r=$(tapnode 'update|install'); then
      case "$r" in *packageinstaller*|*android.packageinstaller*|*permissioncontroller*) note "Android prompt tapped: $r"; shot "2-android-prompt"; ok=1; break;; esac
    fi
  done
  [ -z "$ok" ] && { note "RESULT: Android's install prompt never showed"; shot "2-no-prompt"; }
fi
for i in $(seq 1 18); do sleep 5; [ "$(vname)" != "$FROM" ] && break; done
TO=$(vname); shot "3-after"
if [ "$TO" != "$FROM" ]; then note "RESULT: updated $FROM -> $TO"; else note "RESULT: still $FROM"; fi
# black screen check: restart the screen the way Android does on a settings change
adb shell monkey -p $P -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1; sleep 40; shot "4-before-restart"
n0=$(grep -c "CONSOLE" "$OUT/logcat.txt")
adb shell settings put system font_scale 1.15; sleep 40; shot "5-after-restart"
adb shell settings put system font_scale 1.0
n1=$(grep -c "CONSOLE" "$OUT/logcat.txt")
note "page log lines before restart $n0, after $n1 (a black screen leaves no new lines)"
kill $LC 2>/dev/null
grep -iE "mkcinema|PackageInstaller|InstallSession|chromium.*CONSOLE|AndroidRuntime|FATAL" "$OUT/logcat.txt" | grep -v Accessibility > "$OUT/logcat-update.txt"
note "done"
exit 0
