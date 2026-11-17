"""Fake Apple TV (AirPlay 2 video receiver) to test the MKCinema Java sender. Server crypto: pyatv/srptools/cryptography."""
import socket, threading, plistlib, os, sys, binascii, time, struct
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives import serialization
from pyatv.auth.hap_srp import hkdf_expand
from pyatv.auth.hap_tlv8 import read_tlv, write_tlv, TlvValue as T
from pyatv.auth.hap_session import HAPSession
from pyatv.support import chacha20
from pyatv.protocols.airplay.server_auth import generate_keys
import hashlib
from srptools import SRPContext, SRPServerSession, constants
def new_server_session(keys, pin):
    ctx = SRPContext('Pair-Setup', str(pin), prime=constants.PRIME_3072, generator=constants.PRIME_3072_GEN, hash_func=hashlib.sha512, bits_salt=128, bits_random=512)
    username, verifier, salt = ctx.get_user_data_triplet()
    ctx2 = SRPContext(username, prime=constants.PRIME_3072, generator=constants.PRIME_3072_GEN, hash_func=hashlib.sha512, bits_salt=128, bits_random=512)
    sess = SRPServerSession(ctx2, password_verifier=verifier)
    return sess, (salt if isinstance(salt, bytes) else binascii.unhexlify(salt))
PIN = os.environ.get('PIN', '1234'); ALLOW_TRANSIENT = os.environ.get('TRANSIENT') == '1'
raw = lambda k: k.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
keys = generate_keys(os.urandom(32)); SERVER_ID = b'AA:BB:CC:00:11:22'
paired = {}  # client id -> ltpk
log = []
def L(*a): print('ATV:', *a, flush=True); log.append(' '.join(map(str, a)))

class Conn:
    def __init__(s, sock): s.sock = sock; s.buf = b''; s.hap = None; s.pending_hap = None
    def recv_more(s):
        d = s.sock.recv(65536)
        if not d: raise EOFError
        s.buf += s.hap.decrypt(d) if s.hap else d
    def read_msg(s):
        while b'\r\n\r\n' not in s.buf: s.recv_more()
        head, s.buf = s.buf.split(b'\r\n\r\n', 1)
        lines = head.decode().split('\r\n'); hdr = {}
        for l in lines[1:]:
            k, v = l.split(':', 1); hdr[k.strip().lower()] = v.strip()
        n = int(hdr.get('content-length', 0))
        while len(s.buf) < n: s.recv_more()
        body, s.buf = s.buf[:n], s.buf[n:]
        return lines[0], hdr, body
    def send(s, proto, code, body=b'', hdr=None):
        h = f'{proto} {code} {"OK" if code == 200 else "Error"}\r\nContent-Length: {len(body)}\r\n'
        for k, v in (hdr or {}).items(): h += f'{k}: {v}\r\n'
        msg = h.encode() + b'\r\n' + body
        s.sock.sendall(s.hap.encrypt(msg) if s.hap else msg)
        if s.pending_hap: s.hap, s.pending_hap = s.pending_hap, None

def enable(conn, secret, later=True):
    h = HAPSession(); h.enable(hkdf_expand('Control-Salt', 'Control-Read-Encryption-Key', secret), hkdf_expand('Control-Salt', 'Control-Write-Encryption-Key', secret))
    if later: conn.pending_hap = h
    else: conn.hap = h

def event_server(secret, ready):
    srv = socket.socket(); srv.bind(('127.0.0.1', 0)); srv.listen(1); ready.append(srv.getsockname()[1])
    c, _ = srv.accept(); h = HAPSession()
    h.enable(hkdf_expand('Events-Salt', 'Events-Write-Encryption-Key', secret), hkdf_expand('Events-Salt', 'Events-Read-Encryption-Key', secret))
    time.sleep(0.3)
    c.sendall(h.encrypt(b'POST /command RTSP/1.0\r\nCSeq: 7\r\nServer: AirTunes/700\r\nContent-Length: 0\r\n\r\n'))
    data = b''
    while b'\r\n\r\n' not in data: data += h.decrypt(c.recv(4096))
    L('event channel reply:', data.split(b'\r\n')[0].decode(), 'cseq7' if b'CSeq: 7' in data else 'NO CSEQ')

def timing_probe(port):
    u = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); u.settimeout(3)
    pkt = struct.pack('>BBHIIIIIII', 0x80, 0xd2, 7, 0, 0, 0, 0, 0, 1234, 5678)
    u.sendto(pkt, ('127.0.0.1', port)); d, _ = u.recvfrom(64)
    f = struct.unpack('>BBHIIIIIII', d)
    L('timing reply ok' if f[4] == 1234 and f[5] == 5678 and f[1] == 0xd3 else f'timing reply BAD {f}')

def handle(sock):
    c = Conn(sock); st = {}; polls = [0]
    try:
        while True:
            first, hdr, body = c.read_msg(); method, path, proto = first.split(' ')
            if path == '/pair-pin-start': L('pair-pin-start hkp', hdr.get('x-apple-hkp')); c.send(proto, 200); continue
            if path == '/pair-setup':
                t = read_tlv(body); state = t[T.SeqNo][0]
                if state == 1:
                    transient = T.Flags in t and t[T.Flags][0] & 0x10
                    if transient and not ALLOW_TRANSIENT: L('transient refused'); c.send(proto, 200, write_tlv({T.SeqNo: b'\x02', T.Error: b'\x02'})); continue
                    st['transient'] = transient
                    st['srp'], salt = new_server_session(keys, '3939' if transient else PIN); st['salt'] = salt
                    c.send(proto, 200, write_tlv({T.SeqNo: b'\x02', T.Salt: salt, T.PublicKey: binascii.unhexlify(st['srp'].public)})); continue
                if state == 3:
                    srp = st['srp']; srp.process(binascii.hexlify(t[T.PublicKey]).decode(), binascii.hexlify(st['salt']).decode())
                    if not srp.verify_proof(binascii.hexlify(t[T.Proof]).decode()): L('wrong pin'); c.send(proto, 200, write_tlv({T.SeqNo: b'\x04', T.Error: b'\x02'})); continue
                    L('srp proof ok', 'transient' if st['transient'] else 'pin')
                    c.send(proto, 200, write_tlv({T.SeqNo: b'\x04', T.Proof: binascii.unhexlify(srp.key_proof_hash)}))
                    if st['transient']: enable(c, binascii.unhexlify(srp.key), later=False); st['secret'] = binascii.unhexlify(srp.key)
                    continue
                if state == 5:
                    K = binascii.unhexlify(st['srp'].key)
                    ek = hkdf_expand('Pair-Setup-Encrypt-Salt', 'Pair-Setup-Encrypt-Info', K)
                    ch = chacha20.Chacha20Cipher8byteNonce(ek, ek)
                    sub = read_tlv(ch.decrypt(t[T.EncryptedData], nonce=b'PS-Msg05'))
                    x = hkdf_expand('Pair-Setup-Controller-Sign-Salt', 'Pair-Setup-Controller-Sign-Info', K)
                    Ed25519PublicKey.from_public_bytes(sub[T.PublicKey]).verify(sub[T.Signature], x + sub[T.Identifier] + sub[T.PublicKey])
                    paired[bytes(sub[T.Identifier])] = bytes(sub[T.PublicKey]); L('paired client', sub[T.Identifier][:8])
                    ax = hkdf_expand('Pair-Setup-Accessory-Sign-Salt', 'Pair-Setup-Accessory-Sign-Info', K)
                    sig = keys.sign.sign(ax + SERVER_ID + keys.auth_pub)
                    enc = ch.encrypt(write_tlv({T.Identifier: SERVER_ID, T.PublicKey: keys.auth_pub, T.Signature: sig}), nonce=b'PS-Msg06')
                    c.send(proto, 200, write_tlv({T.SeqNo: b'\x06', T.EncryptedData: enc})); continue
            if path == '/pair-verify':
                t = read_tlv(body); state = t[T.SeqNo][0]
                if state == 1:
                    eph = X25519PrivateKey.generate(); st['ceph'] = bytes(t[T.PublicKey]); st['seph'] = raw(eph.public_key())
                    st['secret'] = eph.exchange(X25519PublicKey.from_public_bytes(st['ceph']))
                    k = hkdf_expand('Pair-Verify-Encrypt-Salt', 'Pair-Verify-Encrypt-Info', st['secret']); st['vk'] = k
                    sig = keys.sign.sign(st['seph'] + SERVER_ID + st['ceph'])
                    enc = chacha20.Chacha20Cipher8byteNonce(k, k).encrypt(write_tlv({T.Identifier: SERVER_ID, T.Signature: sig}), nonce=b'PV-Msg02')
                    c.send(proto, 200, write_tlv({T.SeqNo: b'\x02', T.PublicKey: st['seph'], T.EncryptedData: enc})); continue
                if state == 3:
                    k = st['vk']; sub = read_tlv(chacha20.Chacha20Cipher8byteNonce(k, k).decrypt(t[T.EncryptedData], nonce=b'PV-Msg03'))
                    cid = bytes(sub[T.Identifier])
                    if cid not in paired: L('verify: unknown client'); c.send(proto, 200, write_tlv({T.SeqNo: b'\x04', T.Error: b'\x02'})); continue
                    Ed25519PublicKey.from_public_bytes(paired[cid]).verify(sub[T.Signature], st['ceph'] + cid + st['seph'])
                    L('pair-verify ok'); enable(c, st['secret']); c.send(proto, 200, write_tlv({T.SeqNo: b'\x04'})); continue
            if c.hap is None: L('UNENCRYPTED request refused', first); c.send(proto, 403); continue
            if method == 'SETUP':
                b = plistlib.loads(body); L('SETUP timingPort', b['timingPort'], 'name', b['name'])
                ready = []; threading.Thread(target=event_server, args=(st['secret'], ready), daemon=True).start()
                while not ready: time.sleep(0.01)
                threading.Thread(target=timing_probe, args=(b['timingPort'],), daemon=True).start()
                c.send(proto, 200, plistlib.dumps({'eventPort': ready[0], 'timingPort': 0}, fmt=plistlib.FMT_BINARY), {'CSeq': hdr.get('cseq'), 'Content-Type': 'application/x-apple-binary-plist'}); continue
            if path == '/play':
                b = plistlib.loads(body); L('PLAY', b['Content-Location'], 'start', b.get('Start-Position-Seconds')); st['pos'] = b.get('Start-Position-Seconds', 0); c.send(proto, 200); continue
            if path == '/playback-info':
                polls[0] += 1; st['pos'] = st.get('pos', 0) + 1
                info = {'duration': 100.0, 'position': float(st['pos']), 'rate': 0.0 if st.get('paused') else 1.0, 'readyToPlay': True} if polls[0] < 7 else {}
                c.send(proto, 200, plistlib.dumps(info, fmt=plistlib.FMT_BINARY)); continue
            if path.startswith('/rate'): st['paused'] = path.endswith('=0.000000'); L('RATE', path, proto)
            if path.startswith('/scrub'): st['pos'] = float(path.split('=')[1]); L('SCRUB', path)
            if path.startswith('/setProperty'): L('PROP', path, plistlib.loads(body))
            if method in ('RECORD',) or path in ('/feedback', '/stop'): L(method, path)
            c.send(proto, 200, b'', {'CSeq': hdr['cseq']} if 'cseq' in hdr else None)
    except (EOFError, ConnectionResetError, OSError): pass

srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); srv.bind(('127.0.0.1', int(sys.argv[1]))); srv.listen(5)
print('ready', flush=True)
while True:
    s, _ = srv.accept(); threading.Thread(target=handle, args=(s,), daemon=True).start()
