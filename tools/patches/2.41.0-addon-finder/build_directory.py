#!/usr/bin/env python3
"""Build addons/directory.json: a small, same-origin copy of the community addon lists.

The app used to download the 1.3 MB list from stremio-addons.net in the browser. That server often takes 30+ seconds
on a cold cache or answers 503 without CORS headers, which Firefox reports as "NetworkError". This script fetches the
lists once at release time, keeps only what the Addon Finder shows, and writes about 250 KB of JSON next to index.html.

Sources: stremio-addons.net (community index) and api.strem.io/addonscollection.json (Stremio's own catalog; those
addons are marked 's'). Only https transport URLs are kept.

Usage: python3 -I build_directory.py <webroot> [--keep-old]
  --keep-old  if every source fails, keep the existing file (exit 0) instead of failing
  --clean     only re-filter the existing addons/directory.json (no network)
"""
import base64, datetime, json, pathlib, re, sys, time, urllib.parse, urllib.request

SOURCES = [
    ('https://stremio-addons.net/api/addon_catalog/all/stremio-addons.net.json', 'community'),
    ('https://api.strem.io/addonscollection.json', 'stremio'),
]

def fetch(url, tries=4):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'MKCinema-directory-build/1.0', 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:  # noqa: BLE001
            last = e; time.sleep(2 ** i * 2)
    raise RuntimeError(f'{url}: {last}')

# Some community entries are a person's own configured link: their settings, sometimes with an account token or email,
# packed into the path. Those are theirs, not a public addon, so they never go into the directory.
CRED_KEY = re.compile(r'(?i)(token|secret|pass(word|wd)?|api_?key|apikey|auth|session|cookie|e-?mail|debrid)')
CRED_TEXT = re.compile(r'(?i)(real-?debrid|all-?debrid|premiumize|torbox|debrid-?link|offcloud|put\.?io|easydebrid|api_?key|apikey|token|password|passwd|secret)=[^|&/,;]{6,}')
EMAIL = re.compile(r'[^\s@/"\'{}]+@[^\s@/"\'{}]+\.[A-Za-z]{2,}')

def _decode(seg):
    out = [urllib.parse.unquote(seg)]
    if len(seg) >= 16 and re.fullmatch(r'[A-Za-z0-9_\-+/=]+', seg):
        try: out.append(base64.b64decode(seg.replace('-', '+').replace('_', '/') + '=' * (-len(seg) % 4)).decode('utf-8'))
        except Exception: pass  # noqa: BLE001
    return out

def _json_has_cred(v, k=''):
    if isinstance(v, dict): return any(_json_has_cred(x, str(kk)) for kk, x in v.items())
    if isinstance(v, list): return any(_json_has_cred(x, k) for x in v)
    if isinstance(v, (int, float)) and not isinstance(v, bool) and CRED_KEY.search(k) and v: return True
    if isinstance(v, str) and v.strip():
        return bool(CRED_KEY.search(k)) or bool(EMAIL.search(v))
    return False

def personal(u):
    """True when an addon link carries someone's credentials or account details."""
    p = urllib.parse.urlsplit(u)
    if p.username or p.password or p.query or p.fragment: return True
    for seg in p.path.split('/'):
        for t in _decode(seg):
            t = t.strip()
            if t.startswith('{') or t.startswith('['):
                try:
                    if _json_has_cred(json.loads(t)): return True
                    continue
                except Exception: pass  # noqa: BLE001
            if CRED_TEXT.search(t) or EMAIL.search(t): return True
    return False

def clip(s, n):
    s = ' '.join(str(s or '').split())
    return s if len(s) <= n else s[:n - 1].rstrip() + '…'

def slim(a, stremio):
    m = a.get('manifest') or {}
    u = str(a.get('transportUrl') or '').strip()
    if not u.lower().startswith('https://') or not m.get('name') or personal(u):
        return None
    res = []
    for r in m.get('resources') or []:
        n = r if isinstance(r, str) else (r or {}).get('name')
        if n and n not in res: res.append(n)
    bh = m.get('behaviorHints') or {}
    flags = ''.join(f for f, on in (('a', bh.get('adult')), ('c', bh.get('configurable')), ('q', bh.get('configurationRequired')), ('s', stremio)) if on)
    logo = str(m.get('logo') or '')
    row = {'u': u, 'i': clip(m.get('id'), 120), 'n': clip(m.get('name'), 80), 'v': clip(m.get('version'), 20),
           'd': clip(m.get('description'), 240), 't': [clip(t, 20) for t in (m.get('types') or [])][:8], 'r': res[:8]}
    if logo.lower().startswith('https://') and len(logo) < 400: row['l'] = logo
    if flags: row['h'] = flags
    return row

def key(u):
    return u.lower().rstrip('/').removesuffix('/manifest.json')

def build():
    rows, seen, ok, stremio_keys = [], {}, [], set()
    data = {}
    for url, name in SOURCES:
        try:
            j = fetch(url)
            data[name] = j.get('addons') if isinstance(j, dict) else j
            ok.append(name)
        except Exception as e:  # noqa: BLE001
            print('source failed:', e, file=sys.stderr)
    for a in data.get('stremio') or []:
        if a and a.get('transportUrl'): stremio_keys.add(key(a['transportUrl']))
    # community list first (its order is newest first), then anything only Stremio's catalog has
    for name in ('community', 'stremio'):
        for a in data.get(name) or []:
            if not a: continue
            r = slim(a, key(str(a.get('transportUrl') or '')) in stremio_keys)
            if not r or key(r['u']) in seen: continue
            seen[key(r['u'])] = True; rows.append(r)
    return ok, rows

def main():
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.')
    out = root / 'addons' / 'directory.json'
    if '--clean' in sys.argv:  # drop personal links from the existing file without fetching anything
        doc = json.loads(out.read_text(encoding='utf-8')); before = len(doc.get('addons') or [])
        doc['addons'] = [r for r in doc.get('addons') or [] if r and not personal(str(r.get('u') or ''))]
        out.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'directory: removed {before - len(doc["addons"])} personal links -> {out}'); return
    ok, rows = build()
    if 'community' not in ok or len(rows) < 100:
        if '--keep-old' in sys.argv and out.exists():
            print(f'directory: sources incomplete ({ok}), kept {out}'); return
        sys.exit(f'directory: sources incomplete ({ok}, {len(rows)} rows)')
    out.parent.mkdir(parents=True, exist_ok=True)
    doc = {'v': 1, 'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'src': ok, 'addons': rows}
    out.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'directory: {len(rows)} addons from {ok}, {out.stat().st_size // 1024} KB -> {out}')

if __name__ == '__main__':
    main()
