"""A pretend Chromecast for testing Cast.java: CASTV2 over TLS with the Default Media Receiver.
Usage: python3 fake_cast.py PORT [fail]   ("fail" answers LOAD with LOAD_FAILED). Plays a 20 s "film" at 4x speed."""
import json, socket, ssl, struct, subprocess, sys, tempfile, threading, time, os

PORT = int(sys.argv[1]); FAIL = len(sys.argv) > 2 and sys.argv[2] == "fail"
NS_CONN, NS_BEAT, NS_RECV, NS_MEDIA = ("urn:x-cast:com.google.cast.tp.connection", "urn:x-cast:com.google.cast.tp.heartbeat",
                                      "urn:x-cast:com.google.cast.receiver", "urn:x-cast:com.google.cast.media")

def varint(n):
    o = b""
    while n > 0x7f: o += bytes([(n & 0x7f) | 0x80]); n >>= 7
    return o + bytes([n])
def field(tag, s): b = s.encode(); return bytes([tag]) + varint(len(b)) + b
def frame(src, dst, ns, payload):
    m = b"\x08\x00" + field(0x12, src) + field(0x1a, dst) + field(0x22, ns) + b"\x28\x00" + field(0x32, json.dumps(payload))
    return struct.pack(">I", len(m)) + m
def unframe(m):
    i, f = 0, {}
    while i < len(m):
        key = 0; sh = 0
        while True:
            c = m[i]; i += 1; key |= (c & 0x7f) << sh; sh += 7
            if not c & 0x80: break
        fn, wt = key >> 3, key & 7
        if wt == 0:
            while m[i] & 0x80: i += 1
            i += 1
        elif wt == 2:
            ln = 0; sh = 0
            while True:
                c = m[i]; i += 1; ln |= (c & 0x7f) << sh; sh += 7
                if not c & 0x80: break
            f[fn] = m[i:i + ln].decode(); i += ln
    return f.get(2), f.get(3), f.get(4), f.get(6)

d = tempfile.mkdtemp()
subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", d + "/k.pem", "-out", d + "/c.pem", "-days", "1", "-subj", "/CN=fake-cast"], check=True, capture_output=True)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(d + "/c.pem", d + "/k.pem")

def serve(conn):
    st = {"app": False, "loaded": False, "playing": False, "pos": 0.0, "t": time.time(), "dur": 20.0, "msid": 7}
    lock = threading.Lock()
    def send(src, dst, ns, p):
        with lock: conn.sendall(frame(src, dst, ns, p))
    def tick():
        now = time.time()
        if st["playing"]: st["pos"] = min(st["dur"], st["pos"] + (now - st["t"]) * 4)
        st["t"] = now
    def status(rid=0):
        tick()
        if st["loaded"] and st["pos"] >= st["dur"]:
            s = [{"mediaSessionId": st["msid"], "playerState": "IDLE", "idleReason": "FINISHED", "currentTime": st["dur"]}]
        elif st["loaded"]:
            s = [{"mediaSessionId": st["msid"], "playerState": "PLAYING" if st["playing"] else "PAUSED", "currentTime": st["pos"], "media": {"duration": st["dur"]}}]
        else: s = []
        return {"type": "MEDIA_STATUS", "requestId": rid, "status": s}
    buf = b""
    while True:
        try:
            h = conn.recv(4)
            if len(h) < 4: break
            n = struct.unpack(">I", h)[0]; m = b""
            while len(m) < n: m += conn.recv(n - len(m))
        except Exception: break
        src, dst, ns, payload = unframe(m); p = json.loads(payload); t = p.get("type")
        if ns == NS_BEAT and t == "PING": send(dst, src, NS_BEAT, {"type": "PONG"})
        elif ns == NS_RECV and t == "LAUNCH":
            st["app"] = True; print("TV: launched", p["appId"], flush=True)
            send("receiver-0", src, NS_RECV, {"type": "RECEIVER_STATUS", "requestId": p["requestId"], "status": {"applications": [{"appId": p["appId"], "transportId": "web-5", "sessionId": "s-1"}]}})
        elif ns == NS_RECV and t == "STOP": print("TV: app stopped", flush=True); st["app"] = False
        elif ns == NS_MEDIA and t == "LOAD":
            print("TV: LOAD", p["media"]["contentId"], p["media"]["contentType"], "at", p.get("currentTime"), "title", p["media"]["metadata"]["title"], flush=True)
            if FAIL: send("web-5", src, NS_MEDIA, {"type": "LOAD_FAILED", "requestId": p["requestId"]}); continue
            st.update(loaded=True, playing=True, pos=float(p.get("currentTime", 0)), t=time.time())
            send("web-5", src, NS_MEDIA, status(p["requestId"]))
        elif ns == NS_MEDIA and t == "GET_STATUS": send("web-5", src, NS_MEDIA, status(p["requestId"]))
        elif ns == NS_MEDIA and t in ("PAUSE", "PLAY"):
            tick(); st["playing"] = t == "PLAY"; print("TV:", t, "at", round(st["pos"], 1), flush=True); send("web-5", src, NS_MEDIA, status(p["requestId"]))
        elif ns == NS_MEDIA and t == "SEEK":
            tick(); st["pos"] = float(p["currentTime"]); print("TV: SEEK", st["pos"], flush=True); send("web-5", src, NS_MEDIA, status(p["requestId"]))
        elif ns == NS_MEDIA and t == "STOP": print("TV: media STOP", flush=True); st["loaded"] = False
    conn.close(); print("TV: sender left", flush=True)

srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); srv.bind(("127.0.0.1", PORT)); srv.listen(2)
print("TV: fake Chromecast on", PORT, flush=True)
while True:
    c, _ = srv.accept()
    threading.Thread(target=serve, args=(ctx.wrap_socket(c, server_side=True),), daemon=True).start()
