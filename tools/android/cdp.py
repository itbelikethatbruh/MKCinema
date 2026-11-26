#!/usr/bin/env python3
"""Tiny Chrome DevTools client for the app's WebView (debuggable test builds only), used by back-test.sh.
   python3 cdp.py <port> '<js expression>'   prints the JSON value. The expression runs as a user gesture."""
import json, sys, urllib.request, websocket
port, expr = sys.argv[1], sys.argv[2]
pages = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json', timeout=15))
pg = next((p for p in pages if p.get('type') == 'page' and 'mkcinema' in p.get('url', '')), None) or pages[0]
ws = websocket.create_connection(pg['webSocketDebuggerUrl'], timeout=30, suppress_origin=True)
ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expr, 'returnByValue': True, 'awaitPromise': True, 'userGesture': True}}))
while True:
    m = json.loads(ws.recv())
    if m.get('id') == 1: break
r = m.get('result', {})
print(json.dumps(r.get('result', {}).get('value', r.get('exceptionDetails', r))))
