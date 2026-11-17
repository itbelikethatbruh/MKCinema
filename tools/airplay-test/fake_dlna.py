"""A pretend DLNA TV for testing Dlna.java: SSDP answers on 239.255.255.250:1900 (if the network allows it), a device
description and an AVTransport SOAP control. Usage: python3 fake_dlna.py HTTP_PORT. Plays a 20 s "film" at 4x speed."""
import re, socket, struct, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1])
DESC = f"""<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><specVersion><major>1</major><minor>0</minor></specVersion>
<device><deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType><friendlyName>[TV] Living Room &amp; Co</friendlyName>
<manufacturer>Samsung Electronics</manufacturer><modelName>QN65Q80</modelName><UDN>uuid:fake-dlna-1</UDN>
<serviceList><service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType><controlURL>/rc</controlURL></service>
<service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><serviceId>urn:upnp-org:serviceId:AVTransport</serviceId><controlURL>upnp/control/AVTransport1</controlURL></service></serviceList></device></root>"""
st = {"uri": None, "state": "NO_MEDIA_PRESENT", "pos": 0.0, "t": time.time(), "dur": 20.0}
def tick():
    now = time.time()
    if st["state"] == "PLAYING":
        st["pos"] += (now - st["t"]) * 4
        if st["pos"] >= st["dur"]: st["pos"] = 0; st["state"] = "STOPPED"; print("TV: film finished", flush=True)
    st["t"] = now
def hms(s): s = int(s); return "%d:%02d:%02d" % (s // 3600, s // 60 % 60, s % 60)

class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def reply(self, code, body, chunked=False):
        b = body.encode()
        self.send_response(code); self.send_header("Content-Type", 'text/xml; charset="utf-8"')
        if chunked:
            self.send_header("Transfer-Encoding", "chunked"); self.end_headers()
            for i in range(0, len(b), 100): self.wfile.write(b"%x\r\n" % len(b[i:i+100]) + b[i:i+100] + b"\r\n")
            self.wfile.write(b"0\r\n\r\n")
        else:
            self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path == "/desc.xml": self.reply(200, DESC, chunked=True)
        else: self.reply(404, "")
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        action = self.headers.get("SOAPACTION", "").strip('"').split("#")[-1]
        tick(); out = ""
        if action == "SetAVTransportURI":
            st["uri"] = re.search(r"<CurrentURI>(.*?)</CurrentURI>", body).group(1).replace("&amp;", "&")
            meta = re.search(r"<CurrentURIMetaData>(.*?)</CurrentURIMetaData>", body, re.S).group(1)
            print("TV: SetAVTransportURI", st["uri"], "| meta has title:", "dc:title" in meta.replace("&lt;", "<"), flush=True)
            st["state"] = "STOPPED"; st["pos"] = 0
        elif action == "Play":
            if not st["uri"]: return self.fault(701)
            st["state"] = "PLAYING"; print("TV: Play", flush=True)
        elif action == "Pause": st["state"] = "PAUSED_PLAYBACK"; print("TV: Pause at", round(st["pos"], 1), flush=True)
        elif action == "Stop":
            if st["state"] != "NO_MEDIA_PRESENT": print("TV: Stop", flush=True)
            st["state"] = "STOPPED"
        elif action == "Seek":
            tgt = re.search(r"<Target>(.*?)</Target>", body).group(1); h, m, s = tgt.split(":")
            st["pos"] = int(h) * 3600 + int(m) * 60 + float(s); print("TV: Seek", tgt, flush=True)
        elif action == "GetTransportInfo": out = f"<CurrentTransportState>{st['state']}</CurrentTransportState><CurrentTransportStatus>OK</CurrentTransportStatus>"
        elif action == "GetPositionInfo": out = f"<TrackDuration>{hms(st['dur'])}</TrackDuration><RelTime>{hms(st['pos'])}</RelTime>"
        else: return self.fault(401)
        self.reply(200, f'<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:{action}Response xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">{out}</u:{action}Response></s:Body></s:Envelope>')
    def fault(self, code):
        self.reply(500, f'<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>{code}</errorCode><errorDescription>Transition not available</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>')

def ssdp():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("", 1900)); s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, struct.pack("4sl", socket.inet_aton("239.255.255.250"), socket.INADDR_ANY))
    except OSError as e: print("TV: no SSDP here:", e, flush=True); return
    while True:
        d, a = s.recvfrom(4096)
        if b"M-SEARCH" in d and b"AVTransport" in d:
            s.sendto(f"HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nLOCATION: http://127.0.0.1:{PORT}/desc.xml\r\nST: urn:schemas-upnp-org:service:AVTransport:1\r\nUSN: uuid:fake-dlna-1\r\n\r\n".encode(), a)
threading.Thread(target=ssdp, daemon=True).start()
print("TV: fake DLNA on", PORT, flush=True)
ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
