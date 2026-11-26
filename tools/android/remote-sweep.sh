#!/usr/bin/env bash
# 1.17.17: the TV player (android/PlayerActivity, MKCinema Player = mpv) and the remote, in every state a film can be in.
# Each case opens the test film, puts the player in one state (loading a stream that never answers, playing, paused,
# the options row on each button, the audio list, held seeking, a stream that stops mid-film) and checks that Back
# leaves within 1.5 s (2 presses where a list is open: the first closes the list). It also checks the film starts
# behind the start gate with its picture on screen, and that a film opened right after Back still plays.
# Needs adb, a running emulator with MKCinema installed, ffmpeg. Used by .github/workflows/android-player.yml.
#
#   OUT=out bash tools/android/remote-sweep.sh
set -uo pipefail
OUT=${OUT:-out}; mkdir -p "$OUT/www" "$OUT/sweep"
F="$OUT/www/test.mkv"
[ -f "$F" ] || ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=24 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 120 \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -metadata:s:a:0 language=eng "$F"

# :8000 serves the film normally; :8001 sends the start of the film and then nothing (a source that stops answering);
# :8002 sends the first 2 MB (a few seconds of film) and then nothing (a connection that drops mid-film)
cat > "$OUT/sweep/stall.py" <<'PY'
import http.server, os, sys, time, threading
path, port, cut = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
size = os.path.getsize(path)
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.send_header("Content-Type", "video/x-matroska"); self.send_header("Content-Length", str(size)); self.end_headers()
        with open(path, "rb") as f: self.wfile.write(f.read(cut)); self.wfile.flush()
        time.sleep(900)
class S(http.server.ThreadingHTTPServer): daemon_threads = True
S(("0.0.0.0", port), H).serve_forever()
PY
(cd "$OUT/www" && exec python3 -m http.server 8000 > /dev/null 2>&1) & s0=$!
python3 "$OUT/sweep/stall.py" "$F" 8001 65536 & s1=$!
python3 "$OUT/sweep/stall.py" "$F" 8002 2000000 & s2=$!
trap 'kill $s0 $s1 $s2 2>/dev/null || true' EXIT
sleep 1

A() { timeout 60 adb "$@"; }
log() { A logcat -d -s MKCPlayer:* mpv:* AndroidRuntime:E ActivityTaskManager:I ActivityManager:I > "$OUT/sweep/logcat.txt" 2>/dev/null || true; }
wait_for() { for _ in $(seq 1 45); do log; grep -q "$1" "$OUT/sweep/logcat.txt" && return 0; sleep 1; done; echo "  timed out waiting for: $1"; return 1; }
player_up() { A shell dumpsys activity activities 2>/dev/null | grep -E "mResumedActivity|topResumedActivity" | grep -q PlayerActivity; }
key() { A shell input keyevent "$1"; sleep "${2:-1}"; }
fails=0; results=()
open_film() { # $1 port
  A shell am force-stop com.mkcinema.app; A logcat -c
  A shell am start -W -a android.intent.action.VIEW -d "http://10.0.2.2:$1/test.mkv" -t video/x-matroska -n com.mkcinema.app/.OpenActivity > /dev/null
  wait_for "engine " > /dev/null
}
playing() { wait_for "start: " > /dev/null && sleep 2; key KEYCODE_DPAD_UP 0.5; } # Up only shows the bar (and leaves touch mode on the emulator)
back_leaves() { # $1 case name, $2 Back presses allowed
  local n=0 t0 t1
  t0=$(date +%s%N)
  while [ "$n" -lt "$2" ]; do
    A shell input keyevent KEYCODE_BACK; n=$((n + 1))
    for _ in $(seq 1 15); do player_up || break; sleep 0.1; done
    player_up || break
  done
  t1=$(date +%s%N); local ms=$(( (t1 - t0) / 1000000 ))
  A exec-out screencap -p > "$OUT/sweep/$1.png" 2>/dev/null
  log; local opened; opened=$(grep -c "player screen opened" "$OUT/sweep/logcat.txt")
  if [ "$opened" -gt 1 ]; then results+=("FAIL  $1: $opened player screens were opened for one film"); fails=$((fails + 1)); fi
  if player_up; then results+=("FAIL  $1: still in the film after $n Back presses"); fails=$((fails + 1))
  else results+=("PASS  $1: left after $n Back press(es), ${ms} ms"); fi
  log; cp "$OUT/sweep/logcat.txt" "$OUT/sweep/$1-logcat.txt"
}

echo "== loading a stream that never answers"
open_film 8001; sleep 4; back_leaves loading-stalled 1
echo "== a film opened right after that still plays (the closing player lets go first)"
A logcat -c
A shell am start -W -a android.intent.action.VIEW -d http://10.0.2.2:8000/test.mkv -t video/x-matroska -n com.mkcinema.app/.OpenActivity > /dev/null
if wait_for "start: "; then results+=("PASS  reopen-after-stalled: $(grep -ho 'start: .*' "$OUT/sweep/logcat.txt" | head -1)"); else results+=("FAIL  reopen-after-stalled: the next film did not start"); fails=$((fails + 1)); fi
grep -h "mpv closed in\|waited .* ms for the last film" "$OUT/sweep/logcat.txt" || true

echo "== start gate: picture on screen once the film plays"
open_film 8000
if wait_for "start: "; then
  sleep 1.5; A exec-out screencap -p > "$OUT/sweep/started.png"
  Y=$(ffmpeg -loglevel error -i "$OUT/sweep/started.png" -vf "signalstats,metadata=print:file=-" -f null - 2>/dev/null | grep -m1 YAVG | sed 's/.*=//')
  grep -h "start: \|first picture" "$OUT/sweep/logcat.txt"
  if python3 -c "import sys; sys.exit(0 if float('${Y:-0}') > 40 else 1)"; then results+=("PASS  picture-at-start: brightness $Y 1.5 s after play")
  else results+=("FAIL  picture-at-start: screen dark (brightness ${Y:-?}) 1.5 s after the film started playing"); fails=$((fails + 1)); fi
else results+=("FAIL  picture-at-start: the film never started"); fails=$((fails + 1)); fi
back_leaves playing 1

echo "== paused"; open_film 8000; playing; key KEYCODE_DPAD_CENTER; back_leaves paused 1
echo "== held seeking"; open_film 8000; playing; A shell input keyevent --longpress KEYCODE_DPAD_RIGHT; back_leaves after-held-seek 1
for i in 0 1 2 3; do
  echo "== options row, button $i"; open_film 8000; playing; key KEYCODE_DPAD_DOWN
  for _ in $(seq 1 "$i"); do key KEYCODE_DPAD_RIGHT 0.5; done
  back_leaves "options-row-$i" 1
done
echo "== audio list open (Menu)"; open_film 8000; playing; key KEYCODE_MENU; back_leaves audio-list 2
echo "== subtitles list open"; open_film 8000; playing; key KEYCODE_DPAD_DOWN; key KEYCODE_DPAD_RIGHT 0.5; key KEYCODE_DPAD_CENTER; back_leaves subs-list 2
echo "== Stop key"; open_film 8000; playing; A shell input keyevent KEYCODE_MEDIA_STOP
for _ in $(seq 1 15); do player_up || break; sleep 0.1; done
if player_up; then results+=("FAIL  stop-key: Stop did not leave the film"); fails=$((fails + 1)); A shell input keyevent KEYCODE_BACK; else results+=("PASS  stop-key: Stop leaves the film"); fi
echo "== connection drops mid-film (buffering)"; open_film 8002; wait_for "start: " > /dev/null; sleep 12; log
grep -h "start: " "$OUT/sweep/logcat.txt" | tail -1; back_leaves buffering-stalled 1

echo; echo "Remote sweep:"; printf '%s\n' "${results[@]}"
[ "$fails" -eq 0 ] || { echo "$fails case(s) failed"; exit 1; }
echo "Remote sweep: every case passed"
