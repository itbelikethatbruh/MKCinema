#!/usr/bin/env python3
"""1.15.0 MKCinema Player under the web player: drives MKAndroid.mpv from the app's own page through WebView debugging
(test builds only, DEBUG_APK=1) and checks that mpv opens the test film, lists both audio languages and the subtitle,
and switches them live. Usage: under-test.py <film url> <out dir>   (adb forward tcp:9222 to the WebView first)"""
import json, sys, time, urllib.request
import websocket  # pip install websocket-client

film, out = sys.argv[1], sys.argv[2]
pages = []
for _ in range(60):
    try:
        pages = [p for p in json.load(urllib.request.urlopen('http://127.0.0.1:9222/json')) if p.get('type') == 'page' and 'mkcinema' in p.get('url', '')]
    except Exception:
        pages = []
    if pages:
        break
    time.sleep(2)
assert pages, 'no MKCinema page in the WebView'
print('page:', pages[0]['url'])
ws = websocket.create_connection(pages[0]['webSocketDebuggerUrl'], timeout=30, suppress_origin=True)
n = [0]
def ev(expr):
    n[0] += 1
    ws.send(json.dumps({'id': n[0], 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True, 'awaitPromise': True}}))
    while True:
        r = json.loads(ws.recv())
        if r.get('id') == n[0]:
            res = r.get('result', {})
            if 'exceptionDetails' in res:
                raise RuntimeError(json.dumps(res['exceptionDetails'])[:500])
            return res.get('result', {}).get('value')

for _ in range(30):
    if ev("typeof (window.MKAndroid && MKAndroid.mpv)") == 'function':
        break
    time.sleep(2)
assert ev("typeof (window.MKAndroid && MKAndroid.mpv)") == 'function', 'MKAndroid.mpv is missing on the page'
# collect mpv's news like MkNative does: merged state
ev("window.__st={};window.MkAndroidPlayer=window.MkAndroidPlayer||{};MkAndroidPlayer._ev=function(n){Object.assign(window.__st,n)};1")
probe = json.loads(ev("MKAndroid.mpv('probe','')"))
print('probe:', probe)
assert probe.get('ok'), 'probe said no'
print('show:', ev("MKAndroid.mpv('show','1')"))
print('open:', ev("MKAndroid.mpv('open'," + json.dumps(json.dumps({'url': film, 'start': 0, 'alang': 'eng', 'title': 'Test'})) + ")"))
def st():
    return ev("JSON.stringify(window.__st)") or '{}'
s = {}
for _ in range(40):
    s = json.loads(st())
    if s.get('loaded') and isinstance(s.get('tracks'), list) and (s.get('t') or 0) > 2:
        break
    time.sleep(1)
tracks = s.get('tracks') or []
audio = [t for t in tracks if t.get('type') == 'audio']
subs = [t for t in tracks if t.get('type') == 'sub']
print('state:', {k: s.get(k) for k in ('t', 'dur', 'paused', 'aid', 'sid', 'hwdec', 'w', 'h')})
print('audio:', [(t.get('id'), t.get('lang'), t.get('codec'), t.get('selected')) for t in audio])
print('subs:', [(t.get('id'), t.get('lang'), t.get('codec')) for t in subs])
assert s.get('loaded') and (s.get('t') or 0) > 2, 'the film did not play'
assert len(audio) == 2 and len(subs) == 1, 'the file\'s languages are not all listed'
assert str(s.get('aid')) == '1', 'English (alang eng) did not start'
t1 = s['t']
print('aid 2:', ev("MKAndroid.mpv('aid','2')"))
time.sleep(3)
s = json.loads(st())
assert str(s.get('aid')) == '2', 'audio did not switch'
assert s['t'] > t1, 'playback jumped back on the audio switch'
t2 = s['t']
print('sid 1:', ev("MKAndroid.mpv('sid','1')"))
time.sleep(3)
s = json.loads(st())
assert str(s.get('sid')) == '1', 'subtitles did not switch'
assert s['t'] > t2, 'playback jumped back on the subtitle switch'
print('refused raw option:', ev("MKAndroid.mpv('loadfile','/sdcard/x')"))
assert ev("MKAndroid.mpv('open',JSON.stringify({url:'file:///sdcard/x'}))").startswith('ERR:'), 'a local path was accepted'
print('positions:', t1, t2, s['t'])
print('MKCinema Player under the web player: played, both languages and the subtitle listed, switched live')
