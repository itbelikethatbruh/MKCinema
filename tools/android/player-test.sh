#!/usr/bin/env bash
# MKCinema Player (android/PlayerActivity with the mpv engine) on an Android emulator: opens a test MKV with two audio
# languages (DTS and AC3) and a subtitle track through "Open with MKCinema", then switches audio and subtitles with the
# remote's keys and checks mpv switched while the film kept playing. Used by .github/workflows/android-player.yml.
#
#   APK=build/MKCinema.apk OUT=out bash tools/android/player-test.sh     (needs adb, an emulator running, ffmpeg)
set -euo pipefail
APK=${APK:?} OUT=${OUT:-out}
mkdir -p "$OUT/www"
cat > "$OUT/subs.srt" <<'SRT'
1
00:00:00,500 --> 00:00:30,000
Hola, esto es una prueba
SRT
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=24 -f lavfi -i sine=frequency=440:sample_rate=48000 \
  -f lavfi -i sine=frequency=880:sample_rate=48000 -i "$OUT/subs.srt" -t 30 \
  -map 0:v -map 1:a -map 2:a -map 3:s -c:v libx264 -preset veryfast -pix_fmt yuv420p \
  -c:a:0 dca -strict -2 -ac:a:0 2 -c:a:1 ac3 -c:s srt \
  -metadata:s:a:0 language=eng -metadata:s:a:0 title="English DTS" -metadata:s:a:1 language=fra -metadata:s:s:0 language=spa \
  "$OUT/www/test.mkv"
ffprobe -v error -show_entries stream=index,codec_name:stream_tags=language -of compact "$OUT/www/test.mkv"
(cd "$OUT/www" && exec python3 -m http.server 8000 > /dev/null 2>&1) & srv=$!
trap 'kill $srv 2>/dev/null || true' EXIT

adb install -r -g "$APK" > /dev/null
adb logcat -c
adb shell am start -W -a android.intent.action.VIEW -d http://10.0.2.2:8000/test.mkv -t video/x-matroska -n com.mkcinema.app/.OpenActivity
log() { adb logcat -d -s MKCPlayer:* MKCinema:* > "$OUT/logcat.txt" || true; }
wait_for() { for _ in $(seq 1 60); do log; grep -q "$1" "$OUT/logcat.txt" && return 0; sleep 2; done; echo "timed out waiting for: $1"; cat "$OUT/logcat.txt"; return 1; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }

wait_for "engine mpv"
wait_for "mpv ready"
sleep 5; shot playing
key() { adb shell input keyevent "$1"; sleep 1.5; }
# Audio: the remote's Menu key opens the audio list; Down, OK picks the second language
key KEYCODE_MENU; shot audio-list
key KEYCODE_DPAD_DOWN; key KEYCODE_DPAD_CENTER
wait_for "aid 2 now 2"
sleep 3; shot audio-switched
# Subtitles: Down opens the options row, Right to Subtitles, OK, then Down to the Spanish track and OK
key KEYCODE_DPAD_DOWN; key KEYCODE_DPAD_RIGHT; key KEYCODE_DPAD_CENTER; shot subs-list
key KEYCODE_DPAD_DOWN; key KEYCODE_DPAD_CENTER
wait_for "sid 1 now 1"
sleep 3; shot subs-on
log
if grep -q "mpv error\|engine exo" "$OUT/logcat.txt"; then echo "mpv failed or fell back"; cat "$OUT/logcat.txt"; exit 1; fi
# the film kept playing through both switches: the positions logged at each switch move forward, no reload to 0
python3 - "$OUT/logcat.txt" <<'PY'
import re, sys
t = open(sys.argv[1]).read()
a = [float(x) for x in re.findall(r"(?:aid|sid) \d+ now \d+ at ([0-9.]+)", t)]
print("positions at the switches:", a)
assert len(a) >= 2 and a[0] > 1 and a[1] > a[0], "playback did not keep going through the switches"
PY
echo "MKCinema Player: mpv played, audio and subtitles switched live"
