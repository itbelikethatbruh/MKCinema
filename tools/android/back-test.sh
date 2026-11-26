#!/usr/bin/env bash
# Phones: Back while a film fills the screen (MKCinema Player under the web page) must close the film and land on the
# page it came from, without first showing the film turned upright. Plays the test film under a
# stand-in page in a debuggable build, presses Back (the key, then the gesture), records the screen, and checks
# the player closed. Serves $OUT/www on :8000. Used by .github/workflows/android-player.yml.
set -uo pipefail
OUT=${OUT:-out}; P=9333; D=$(dirname "$0")
timeout 120 mkdir -p "$OUT/www"; [ -f "$OUT/www/test.mkv" ] || ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=24 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 300 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -metadata:s:a:0 language=eng "$OUT/www/test.mkv"
timeout 120 pip install -q websocket-client > /dev/null 2>&1 || true; echo "websocket-client: $(python3 -c 'import websocket;print(websocket.__version__)' 2>&1)"
(cd "$OUT/www" && exec python3 -m http.server 8000 > /dev/null 2>&1) & srv=$!
trap 'kill $srv 2>/dev/null || true' EXIT
js() { timeout 45 python3 "$D/cdp.py" $P "$1" 2>&1 | tail -1; }
A() { timeout 60 adb "$@"; }
rot() { A shell dumpsys window displays 2>/dev/null | grep -o "mCurrentRotation=[^ ]*" | head -1; }
state() { js "JSON.stringify({player:!document.getElementById('player').hidden,fs:!!document.fullscreenElement,w:innerWidth,h:innerHeight,b:window.__mkb||[]})"; }
start_app() { # light page: the full web app crashes the emulator's software GPU, so the page here is a stand-in that
  # does what the real page does on Back (MKFsBack closes the film and leaves full screen); MKCinema Player plays under it
  [ -n "${FIRST:-}" ] && A shell am force-stop com.mkcinema.app; FIRST=1; A logcat -c
  A shell am start -n com.mkcinema.app/.MainActivity --es underTest http://10.0.2.2:8000/test.mkv > /dev/null; sleep 12
  local pid; pid=$(A shell pidof com.mkcinema.app | tr -d '\r'); A forward --remove-all; A forward tcp:$P localabstract:webview_devtools_remote_$pid > /dev/null
  echo "app pid $pid, pages: $(timeout 20 curl -s http://127.0.0.1:$P/json | head -c 300)"
  js "(()=>{document.documentElement.style.background='transparent';document.body.style.cssText='margin:0;background:transparent';document.body.innerHTML='<div id=player style=\"position:fixed;inset:0;background:transparent\"><div style=\"position:absolute;left:20px;top:20px;color:#fff;font:40px sans-serif;background:#c00\">FILM</div></div><div id=page style=\"color:#fff;font:40px sans-serif;padding:200px 20px;background:#036\">TITLE PAGE</div>';window.__mkb=[];window.MKFsBack=function(){window.__mkb.push('called');const p=document.getElementById('player');if(!document.fullscreenElement)return false;p.hidden=true;document.exitFullscreen().catch(()=>{});return true};return 'ok'})()"
}
play() {
  js "document.getElementById('player').requestFullscreen().then(()=>'fs',e=>'fs failed '+e.message)"
  sleep 4; echo "playing: $(state) $(rot)"
}
backtest() { # $1 name, $2 how
  timeout 15 adb shell screenrecord --time-limit 9 --bit-rate 4000000 /sdcard/$1.mp4 & rec=$!; sleep 1.5
  if [ "$2" = key ]; then A shell input keyevent KEYCODE_BACK
  else read -r W H < <(A shell wm size | tail -1 | grep -o '[0-9]*x[0-9]*' | tr x ' '); case "$(rot)" in *_90|*_270) read -r W H <<< "$H $W";; esac
    echo "swipe on ${W}x${H}, navigation mode $(A shell settings get secure navigation_mode | tr -d '\r')"; A shell input swipe 2 $((H/2)) $((W/3)) $((H/2)) 150; fi
  sleep 1; echo "$1 +1s: $(state) $(rot)"; sleep 3; echo "$1 +4s: $(state) $(rot)"
  wait $rec; A pull /sdcard/$1.mp4 "$OUT/$1.mp4" > /dev/null 2>&1
  ffmpeg -loglevel error -y -i "$OUT/$1.mp4" -vf "fps=6,scale=240:-1,tile=8x7" -frames:v 1 "$OUT/$1-sheet.png" || true
  A logcat -d -s MKCPlayer:* MKCinema:* chromium:* > "$OUT/$1-logcat.txt" || true
  grep -h "back in full screen\|curtain" "$OUT/$1-logcat.txt" | tail -3
}
start_app; play; A exec-out screencap -p > "$OUT/back-playing.png"; backtest back-key key
# gesture navigation first: switching it restarts the page
A shell cmd overlay enable com.android.internal.systemui.navbar.gestural || true; sleep 5; start_app; play; backtest back-gesture swipe
echo "back test done"
