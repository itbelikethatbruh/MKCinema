#!/usr/bin/env bash
# Phones: Back while a film fills the screen (MKCinema Player under the web page) must close the film and land on the
# page it came from, without first showing the film turned upright. Plays the test film through the real web app
# (app.mkcinema.app) in a debuggable build, presses Back (the key, then the gesture), records the screen, and checks
# the player closed. Run after player-test.sh (it serves $OUT/www on :8000). Used by .github/workflows/android-player.yml.
set -uo pipefail
OUT=${OUT:-out}; P=9333; D=$(dirname "$0")
pip install -q websocket-client > /dev/null 2>&1 || true
(cd "$OUT/www" && exec python3 -m http.server 8000 > /dev/null 2>&1) & srv=$!
trap 'kill $srv 2>/dev/null || true' EXIT
js() { python3 "$D/cdp.py" $P "$1" 2>&1 | tail -1; }
rot() { adb shell dumpsys window displays 2>/dev/null | grep -o "mCurrentRotation=[^ ]*" | head -1; }
state() { js "JSON.stringify({player:!document.getElementById('player').hidden,fs:!!document.fullscreenElement,w:innerWidth,h:innerHeight,b:window.__mkb||[]})"; }
start_app() {
  adb shell am force-stop com.mkcinema.app; adb logcat -c
  adb shell am start -W -n com.mkcinema.app/.MainActivity > /dev/null; sleep 25
  local pid; pid=$(adb shell pidof com.mkcinema.app | tr -d '\r'); adb forward --remove-all; adb forward tcp:$P localabstract:webview_devtools_remote_$pid > /dev/null
  js "localStorage.setItem('mkc:toured','true');localStorage.setItem('mkc:langAsked','1');localStorage.setItem('mkc:prompt','1');location.reload();1"; sleep 20
  js "(()=>{window.__mkb=[];const f=window.MKFsBack;window.MKFsBack=function(){let r;try{r=f()}catch(e){r='throw '+e.message}window.__mkb.push(String(r));return r};return typeof f})()"
}
play() {
  js "(async()=>{try{openDetail({id:'tt0111161',type:'movie',name:'Back test'})}catch(e){};await new Promise(r=>setTimeout(r,4000));playStream({meta:{id:'tt0111161',type:'movie',name:'Back test'},type:'movie'},{url:'http://10.0.2.2:8000/test.mkv',name:'Test',title:'Back.Test.1080p.WEB-DL.English'});return 'started'})()"
  sleep 15; echo "playing: $(state) $(rot)"
}
backtest() { # $1 name, $2 how
  adb shell screenrecord --time-limit 9 --bit-rate 4000000 /sdcard/$1.mp4 & rec=$!; sleep 1.5
  if [ "$2" = key ]; then adb shell input keyevent KEYCODE_BACK
  else read -r W H < <(adb shell wm size | tail -1 | grep -o '[0-9]*x[0-9]*' | tr x ' '); adb shell input swipe 1 $((H/2)) $((W/3)) $((H/2)) 180; fi
  sleep 1; echo "$1 +1s: $(state) $(rot)"; sleep 3; echo "$1 +4s: $(state) $(rot)"
  wait $rec; adb pull /sdcard/$1.mp4 "$OUT/$1.mp4" > /dev/null 2>&1
  ffmpeg -loglevel error -y -i "$OUT/$1.mp4" -vf "fps=6,scale=240:-1,tile=8x7" -frames:v 1 "$OUT/$1-sheet.png" || true
  adb logcat -d -s MKCPlayer:* MKCinema:* chromium:* > "$OUT/$1-logcat.txt" || true
}
start_app; play; adb exec-out screencap -p > "$OUT/back-playing.png"; backtest back-key key
start_app; adb shell cmd overlay enable com.android.internal.systemui.navbar.gestural || true; sleep 3; play; backtest back-gesture swipe
echo "back test done"
