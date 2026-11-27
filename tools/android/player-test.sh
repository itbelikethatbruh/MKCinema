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
00:00:00,500 --> 00:02:00,000
Hola, esto es una prueba
SRT
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=24 -f lavfi -i sine=frequency=440:sample_rate=48000 \
  -f lavfi -i sine=frequency=880:sample_rate=48000 -i "$OUT/subs.srt" -t 120 \
  -map 0:v -map 1:a -map 2:a -map 3:s -c:v libx264 -preset veryfast -pix_fmt yuv420p \
  -c:a:0 dca -strict -2 -ac:a:0 2 -c:a:1 ac3 -c:s srt \
  -metadata:s:a:0 language=eng -metadata:s:a:0 title="English DTS" -metadata:s:a:1 language=fra -metadata:s:s:0 language=spa \
  "$OUT/www/test.mkv"
ffprobe -v error -show_entries stream=index,codec_name:stream_tags=language -of compact "$OUT/www/test.mkv"
(cd "$OUT/www" && exec python3 -m http.server 8000 > /dev/null 2>&1) & srv=$!
trap 'kill $srv 2>/dev/null || true' EXIT

adb install -r -g "$APK" > /dev/null
adb logcat -c
adb shell setprop log.tag.MKCPlayer DEBUG
openfilm() { adb shell am start -W -a android.intent.action.VIEW -d http://10.0.2.2:8000/test.mkv -t video/x-matroska -n com.mkcinema.app/.OpenActivity; }
log() { adb logcat -d -s MKCPlayer:* MKCinema:* mpv:* AndroidRuntime:E > "$OUT/logcat.txt" || true; }
wait_for() { for _ in $(seq 1 60); do log; grep -q "$1" "$OUT/logcat.txt" && return 0; sleep 2; done; echo "timed out waiting for: $1"; cat "$OUT/logcat.txt"; return 1; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
# 1.17.17: true while the player screen is the one in front
player_up() { adb shell dumpsys activity activities 2>/dev/null | grep -E "mResumedActivity|topResumedActivity" | grep -q PlayerActivity; }
closed_within() { # $1 what, $2 tenths of a second
  for _ in $(seq 1 "$2"); do player_up || { echo "$1: the player closed"; return 0; }; sleep 0.1; done
  echo "$1: the player was still open after $(( $2 / 10 )) s"; log; tail -40 "$OUT/logcat.txt"; return 1
}

# 1.17.17: Back while the film is still opening closes the player at once, and the same film opens again right after
openfilm
wait_for "engine mpv"
adb shell input keyevent KEYCODE_BACK
closed_within "Back while opening" 20
wait_for "back while opening\|back$"
adb logcat -c
openfilm
wait_for "engine mpv"
wait_for "mpv ready"
# the film opens paused and plays once the screen is ready (the emulator has one refresh rate, so at once)
wait_for "start: "
grep -h "start: \|first picture\|mpv closed in\|waited .* ms for the last film" "$OUT/logcat.txt" || true
sleep 5; shot playing
key() { adb shell input keyevent "$1"; sleep 1.5; }
# Audio: the remote's Menu key opens the audio list; Down, OK picks the second language
# the first navigation key on a touch device only leaves touch mode and is not delivered; real remotes never are in touch mode
key KEYCODE_DPAD_UP; sleep 1
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

# 1.17.17: Back while the options row under the bar is open leaves the film (it used to only close the row)
key KEYCODE_DPAD_DOWN; shot options-row
adb shell input keyevent KEYCODE_BACK
closed_within "Back from the options row" 15
wait_for "back from the options row"
wait_for "mpv closed in"
grep -h "mpv closed in" "$OUT/logcat.txt" | tail -1
echo "MKCinema Player: Back leaves at once while opening and from the options row"

# 1.15.0: MKCinema Player under the web player (phones and tablets). A debuggable test build started with underTest
# plays the film under a blank page using the page's own commands (UnderPlayer.selfTest) and logs what mpv reports.
adb shell am force-stop com.mkcinema.app || true
adb logcat -c || true
# 1.17.18: a server that sends the start of the film and then stops answering, like a busy debrid server
cat > "$OUT/stall.py" <<'PY'
import http.server, socketserver, sys, time, os
F = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        n = os.path.getsize(F); self.send_response(200); self.send_header('Content-Type', 'video/x-matroska')
        self.send_header('Content-Length', str(n)); self.end_headers()
        with open(F, 'rb') as f: self.wfile.write(f.read(n * 2 // 5)); self.wfile.flush()
        time.sleep(120)
    def log_message(self, *a): pass
socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer(('', 8001), H).serve_forever()
PY
python3 "$OUT/stall.py" "$OUT/www/test.mkv" & stall=$!
trap 'kill $srv $stall 2>/dev/null || true' EXIT
adb shell am start -W -n com.mkcinema.app/.MainActivity --es underTest http://10.0.2.2:8000/test.mkv --es underSlow http://10.0.2.2:8001/test.mkv
wait_for "under-test: PASS\|under-test: FAIL"
sleep 1; shot under-playing; log
grep "under-test\|under:" "$OUT/logcat.txt"
grep -q "under-test: PASS" "$OUT/logcat.txt" || { echo "MKCinema Player under the web player failed"; cat "$OUT/logcat.txt"; exit 1; }
# the picture itself must be on screen (not only mpv's state): the test film is bright, a black screenshot means the surface is hidden
Y=$(ffmpeg -loglevel error -i "$OUT/under-playing.png" -vf "signalstats,metadata=print:file=-" -f null - 2>/dev/null | grep -m1 "YAVG" | sed 's/.*=//')
echo "screenshot average brightness: $Y"
python3 -c "import sys; sys.exit(0 if float('${Y:-0}') > 40 else 1)" || { echo "MKCinema Player under the web player: mpv played but the screen is black"; exit 1; }
echo "MKCinema Player under the web player: played, both languages and the subtitle listed, switched live"
# 1.17.18: leaving the film never holds the screen (taps on the page wait on Android's screen thread)
wait_for "under-close: PASS\|under-close: FAIL"
grep -h "under-close\|under: " "$OUT/logcat.txt" | tail -30
grep -q "under-close: PASS" "$OUT/logcat.txt" || { echo "MKCinema Player under the web player: closing the film held the screen"; exit 1; }
echo "MKCinema Player under the web player: closing the film never holds the screen"
