#!/usr/bin/env python3
"""Refresh the sha256 of every entry in registry.json from the files in scripts/ and themes/.

  python3 build_registry.py          # rewrite the checksums
  python3 build_registry.py --check  # only report; exit 1 when a checksum is out of date (used by CI)

After a change, registry.json must be signed again (sign_registry.py). CI does that when the change is merged.
"""
import hashlib, json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
check = '--check' in sys.argv[1:]
reg = json.load(open(os.path.join(here, 'registry.json'), encoding='utf-8'))
stale = []
for it in reg['items']:
    p = os.path.join(here, 'scripts' if it['kind'] == 'plugin' else 'themes', it['file'])
    h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
    if it.get('sha256') != h:
        stale.append(it['id'])
    it['sha256'] = h
if check:
    if stale:
        print('out of date:', ', '.join(stale)); sys.exit(1)
    print('all', len(reg['items']), 'checksums match'); sys.exit(0)
json.dump(reg, open(os.path.join(here, 'registry.json'), 'w', encoding='utf-8'), indent=2)
print('updated', len(reg['items']))
