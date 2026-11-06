#!/usr/bin/env python3
"""Sign plugins/registry.json with the gallery's Ed25519 key.

The app downloads registry.json and registry.json.sig and checks the signature against the public key built into
the app (Plugins.PUBKEY in index.html, the same key as registry-signing.pub here) before it shows the gallery.
Each file's SHA-256 inside registry.json is then checked as before, so one signature covers every file.

  python3 sign_registry.py                      # key from $PLUGIN_SIGNING_KEY (PEM text), as in CI
  python3 sign_registry.py --key path/to/key    # key from a file
  python3 sign_registry.py --verify             # only check registry.json.sig (no key needed)

It refuses to sign when a checksum in registry.json is out of date (run build_registry.py first).
It uses the `cryptography` package when it is installed, otherwise the openssl command (3.0 or newer), so the CI
job that holds the key runs no third-party Python code. The private key is never printed.
"""
import argparse, base64, hashlib, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(HERE, 'registry.json')
SIG = os.path.join(HERE, 'registry.json.sig')
PUB = os.path.join(HERE, 'registry-signing.pub')


def fail(msg):
    print(f'sign_registry: {msg}', file=sys.stderr)
    sys.exit(1)


def check_registry(data):
    if data.startswith(b'\xef\xbb\xbf'):
        fail('registry.json starts with a byte-order mark; save it as plain UTF-8')
    try:
        reg = json.loads(data.decode('utf-8'))
    except ValueError as e:
        fail(f'registry.json is not valid JSON: {e}')
    for it in reg.get('items', []):
        p = os.path.join(HERE, 'scripts' if it.get('kind') == 'plugin' else 'themes', it.get('file', ''))
        if not os.path.isfile(p):
            fail(f'{it.get("id")}: {p} does not exist')
        if hashlib.sha256(open(p, 'rb').read()).hexdigest() != it.get('sha256'):
            fail(f'{it.get("id")}: checksum is out of date, run build_registry.py first')


def openssl(args, key_pem=None):
    with tempfile.TemporaryDirectory() as td:
        args = [a.replace('{td}', td) for a in args]
        if key_pem is not None:
            kp = os.path.join(td, 'k.pem')
            fd = os.open(kp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'wb') as fh:
                fh.write(key_pem)
            args = [a.replace('{key}', kp) for a in args]
        r = subprocess.run(['openssl'] + args, capture_output=True)
        return r


def sign(data, key_pem):
    try:
        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        k = load_pem_private_key(key_pem, password=None)
        return k.sign(data)
    except ImportError:
        pass
    with tempfile.TemporaryDirectory() as td:
        msg = os.path.join(td, 'm')
        open(msg, 'wb').write(data)
        r = openssl(['pkeyutl', '-sign', '-rawin', '-inkey', '{key}', '-in', msg], key_pem)
        if r.returncode != 0:
            fail('openssl could not sign (is the key an Ed25519 PEM key, and openssl 3.0 or newer?)')
        return r.stdout


def verify(data, sig, pub_pem):
    if len(sig) != 64:
        return False
    try:
        from cryptography.hazmat.primitives.serialization import load_pem_public_key
        from cryptography.exceptions import InvalidSignature
        try:
            load_pem_public_key(pub_pem).verify(sig, data)
            return True
        except InvalidSignature:
            return False
    except ImportError:
        pass
    with tempfile.TemporaryDirectory() as td:
        m, s, p = (os.path.join(td, n) for n in ('m', 's', 'p'))
        open(m, 'wb').write(data); open(s, 'wb').write(sig); open(p, 'wb').write(pub_pem)
        r = subprocess.run(['openssl', 'pkeyutl', '-verify', '-rawin', '-pubin', '-inkey', p, '-in', m, '-sigfile', s],
                           capture_output=True)
        return r.returncode == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--key', help='private key file (PEM). Default: $PLUGIN_SIGNING_KEY')
    ap.add_argument('--verify', action='store_true', help='only verify registry.json.sig')
    a = ap.parse_args()
    data = open(REG, 'rb').read()
    pub = open(PUB, 'rb').read()
    if a.verify:
        try:
            sig = base64.b64decode(open(SIG, 'rb').read().strip(), validate=True)
        except (OSError, ValueError):
            fail('registry.json.sig is missing or not base64')
        if not verify(data, sig, pub):
            fail('registry.json.sig does not match registry.json (re-sign it)')
        print('registry.json.sig is valid')
        return
    check_registry(data)
    if a.key:
        key_pem = open(a.key, 'rb').read()
    else:
        key_pem = os.environ.get('PLUGIN_SIGNING_KEY', '').encode()
    if b'PRIVATE KEY' not in key_pem:
        fail('no signing key: pass --key or set PLUGIN_SIGNING_KEY')
    sig = sign(data, key_pem)
    if not verify(data, sig, pub):
        fail('the key does not match registry-signing.pub (wrong key?)')
    new = base64.b64encode(sig) + b'\n'
    old = open(SIG, 'rb').read() if os.path.exists(SIG) else b''
    if old != new:
        open(SIG, 'wb').write(new)
        print('signed registry.json -> registry.json.sig')
    else:
        print('registry.json.sig already up to date')


if __name__ == '__main__':
    main()
