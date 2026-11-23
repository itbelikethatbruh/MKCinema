#!/bin/bash
# 1.17.10 own update download on an emulator (see .github/workflows/android-update-test.yml, job own-download).
# $APK is a test build that calls itself 1.0.0 and is signed with a throwaway key, so the live update (signed with the
# real key) must download in full, then be refused by the app's signature check. Seeing that refusal on the page
# proves the download itself worked without Android's DownloadManager. Needs a booted emulator, $APK, $OUT.
set -u
mkdir -p "$OUT"; P=com.mkcinema.app
note() { echo "[$(date +%T)] $*" | tee -a "$OUT/steps.txt"; }
screen() { adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1; adb shell cat /sdcard/ui.xml 2>/dev/null | python3 -c "
import sys, re, html; x = sys.stdin.read(); print(' | '.join(html.unescape(t) for t in re.findall(r'(?:text|content-desc)=\"([^\"]+)\"', x)))"; }
adb shell settings put global window_animation_scale 0; adb shell settings put global transition_animation_scale 0
sleep 45
adb install -r "$APK" 2>&1 | tee -a "$OUT/steps.txt"
adb shell appops set $P REQUEST_INSTALL_PACKAGES allow
adb logcat -c; adb logcat -v time > "$OUT/logcat.txt" 2>&1 & LC=$!
adb shell monkey -p $P -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
note "opened the test app (calls itself 1.0.0)"
res=FAIL; seenMB=""
for i in $(seq 1 36); do
  sleep 5
  s=$(screen)
  m=$(echo "$s" | grep -oE "[0-9.]+ MB of [0-9.]+ MB[^|]*" | head -1); [ -n "$m" ] && { seenMB="$m"; note "progress: $m"; }
  if echo "$s" | grep -q "not signed by MKCinema"; then note "page: $(echo "$s" | grep -oE "The update did not finish[^|]*\| [^|]*")"; res=PASS; break; fi
  if echo "$s" | grep -qiE "did not start|Reason:"; then note "page: $s"; break; fi
done
adb exec-out screencap -p > "$OUT/end.png"
note "RESULT: $res (progress seen: ${seenMB:-none})"
kill $LC 2>/dev/null
grep -iE "mkcinema|mk-update|AndroidRuntime|FATAL" "$OUT/logcat.txt" | grep -v Accessibility > "$OUT/logcat-app.txt"
[ "$res" = PASS ]
