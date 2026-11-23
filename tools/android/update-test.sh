#!/bin/bash
# Real update test (see .github/workflows/android-update-test.yml). Needs a booted emulator, $APK (an old release), $OUT.
set -u
mkdir -p "$OUT"; P=com.mkcinema.app
shot() { adb exec-out screencap -p > "$OUT/$1.png" 2>/dev/null; }
ver() { adb shell dumpsys package $P | grep -E "versionName|versionCode|installerPackageName|lastUpdateTime" | tr -d '\r' | sed 's/^ */  /'; }
note() { echo "[$(date +%T)] $*" | tee -a "$OUT/steps.txt"; }
adb shell settings put global window_animation_scale 0; adb shell settings put global transition_animation_scale 0
adb install -r "$APK" 2>&1 | tee -a "$OUT/steps.txt"
adb shell appops set $P REQUEST_INSTALL_PACKAGES allow
adb shell pm grant $P android.permission.POST_NOTIFICATIONS 2>/dev/null
note "installed:"; ver | tee -a "$OUT/steps.txt"
adb logcat -c
adb logcat -v time > "$OUT/logcat.txt" 2>&1 &
LC=$!
adb shell monkey -p $P -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
note "opened the app"
for t in 30 60 90 120 150 180 240; do
  sleep $(( t - ${last:-0} )); last=$t
  shot "open-${t}s"; note "after ${t}s:"; ver | grep versionName | tee -a "$OUT/steps.txt"
  adb shell ls -la /sdcard/Android/data/$P/files/Download/ 2>&1 | tail -3 | tee -a "$OUT/steps.txt"
  adb shell dumpsys activity top | grep -m1 -E "ACTIVITY" | tee -a "$OUT/steps.txt"
done
adb shell content query --uri content://downloads/my_downloads 2>&1 | head -5 | tee -a "$OUT/steps.txt"
note "leaving the app (Home) for 4 minutes"
adb shell input keyevent KEYCODE_HOME
sleep 240; shot "after-home"; note "after leaving:"; ver | tee -a "$OUT/steps.txt"
adb shell dumpsys activity top | grep -m1 -E "ACTIVITY" | tee -a "$OUT/steps.txt"
note "opening the app again"
adb shell monkey -p $P -c android.intent.category.LAUNCHER 1 > /dev/null 2>&1
sleep 30; shot "reopen-30s"; ver | grep versionName | tee -a "$OUT/steps.txt"
sleep 30; shot "reopen-60s"
# an Install button on the page, if one shows: tap the middle-bottom area where the bar sits is unreliable, so only record
kill $LC 2>/dev/null
grep -iE "mkcinema|DownloadManager|DownloadProvider|PackageInstaller|InstallSession|PackageManager|chromium.*CONSOLE|AndroidRuntime|FATAL" "$OUT/logcat.txt" | grep -v "Accessibility" > "$OUT/logcat-update.txt"
note "done"; ver | tee -a "$OUT/steps.txt"
exit 0
