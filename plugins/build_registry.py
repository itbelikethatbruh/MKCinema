#!/usr/bin/env python3
"""Refresh the sha256 of every entry in registry.json from the files in scripts/ and themes/."""
import hashlib, json, os
here = os.path.dirname(os.path.abspath(__file__))
reg = json.load(open(os.path.join(here, 'registry.json')))
for it in reg['items']:
    p = os.path.join(here, 'scripts' if it['kind'] == 'plugin' else 'themes', it['file'])
    it['sha256'] = hashlib.sha256(open(p, 'rb').read()).hexdigest()
json.dump(reg, open(os.path.join(here, 'registry.json'), 'w'), indent=2)
print('updated', len(reg['items']))
