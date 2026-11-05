#!/usr/bin/env python3
"""2.8.9 Faster Smart Play, new-episode alerts, kids-seat lock, neutral debrid order (Drake, 2026-11-05).
Smart Play starts on the first confirmed-cached source; the remote's Play button plays the selected poster; a New episodes
row and notice; a kids seat needs a grown-up PIN, with a lockout after 5 wrong tries and a 10-minute unlock; with several
debrid keys the first one you added is used (no built-in service order).
Rebuilds the 2.8 feature block from 2.8.0-features. Usage: python3 -I this.py index.html sw.js   (on 2.8.7; idempotent)"""
import os, re, sys
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '2.8.0-features')
p, swp = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if "const APP_VERSION = '2.8.9'" in s: print('already applied'); sys.exit(0)
js = '\n'.join(open(os.path.join(here, 'js', f), encoding='utf-8').read() for f in sorted(os.listdir(os.path.join(here, 'js'))) if f.endswith('.js'))
css = open(os.path.join(here, 'features.css'), encoding='utf-8').read()
assert '</script' not in js.lower() and '</style' not in css.lower()
s, n = re.subn(r'<style id="mkc-28css">\n.*?\n</style>', lambda m: f'<style id="mkc-28css">\n{css}\n</style>', s, flags=re.S); assert n == 1
s, n = re.subn(r'<script id="mkc-28">\n.*?\n</script>', lambda m: f'<script id="mkc-28">\n{js}\n</script>', s, flags=re.S); assert n == 1
def sub(a, b):
    global s
    assert s.count(a) == 1, a[:60]
    s = s.replace(a, b, 1)
sub("service() { const v = this.cfg(); if (v.off) return null; return ['tb', 'rd', 'ad', 'pm'].find((k) => v[k]) || null; },",
    "service() { const v = this.cfg(); if (v.off) return null; return [...(v.order || []), 'ad', 'pm', 'rd', 'tb'].find((k) => DEBRID[k] && v[k]) || null; },")
sub("save(k, key) { const v = this.cfg(); if (key) v[k] = key.trim(); else delete v[k]; Store.set('vault', v);",
    "save(k, key) { const v = this.cfg(); const o = (v.order || []).filter((x) => x !== k); if (key) { v[k] = key.trim(); o.push(k); } else delete v[k]; v.order = o; Store.set('vault', v);")
sub("help: 'Torrent results get a Debrid badge (Instant when TorBox or Premiumize already has them) and Smart Play prefers them. If more than one key is saved, TorBox goes first, then Real-Debrid, AllDebrid, Premiumize.'",
    "help: 'Torrent results get a Debrid badge (Instant when your service reports them cached) and Smart Play prefers them. If more than one key is saved, the one you added first is used.'")
s, n = re.subn(r"const APP_VERSION = '2\.8\.8';", "const APP_VERSION = '2.8.9';", s); assert n == 1
open(p, 'w', encoding='utf-8').write(s)
sw = open(swp).read(); sw, n = re.subn(r"const VERSION = 'mkc-[\d.]+';", "const VERSION = 'mkc-2.8.9';", sw); assert n == 1; open(swp, 'w').write(sw)
import shutil; nd = os.path.join(os.path.dirname(os.path.abspath(p)), 'net'); shutil.copytree(os.path.join(here, 'net'), nd, dirs_exist_ok=True)  # network logos
print('applied: 2.8.9')
