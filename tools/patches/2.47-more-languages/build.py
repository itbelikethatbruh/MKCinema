#!/usr/bin/env python3
"""Builds i18n/<code>.json for Tamil, Telugu, Bengali, Malayalam and Samoan.
src/en.json is the English list (the same keys the 2.15 languages use), src/<code>.tsv holds index<TAB>translation,
and src/<code>.shared.json holds human translations from the MIT-licensed stremio-translations project for the
few strings it has in common with MKCinema (see README). Usage: python3 build.py [out_dir]"""
import json, re, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here / 'i18n'
out.mkdir(parents=True, exist_ok=True)
en = json.loads((here / 'src/en.json').read_text(encoding='utf-8'))
CODES = ['ta', 'te', 'bn', 'ml', 'sm']
# Shared strings whose wording doesn't fit MKCinema's meaning there, or that would clash with the rest of the list
SKIP_SHARED = {'Top', 'Raised', 'Catalog', 'Addons', 'Movies', 'Skip intro', 'Horror', 'Standard', 'Range', 'Series', 'Featured', 'Back', 'Comedy', 'Drama', 'Live TV', 'Trailer', 'Fullscreen', 'Text color', 'Delete', 'Clear', 'Clear progress'}
DIGITS = str.maketrans('০১২৩৪৫৬৭৮৯', '0123456789')
KEEP = re.compile(r'https?://\S+|[a-z0-9.-]+\.(?:com|org|tv|me|app|co|net|dev|js|html)\b[/\w.-]*|MKCinema|Dee Lavish')
problems = 0
for code in CODES:
    rows = {}
    for line in (here / f'src/{code}.tsv').read_text(encoding='utf-8').splitlines():
        if '\t' in line:
            i, t = line.split('\t', 1); rows[int(i)] = t.strip()
    shared = {}
    sp = here / f'src/{code}.shared.json'
    if sp.exists():
        shared = {int(k): v for k, v in json.loads(sp.read_text(encoding='utf-8')).items()}
    strings, used = {}, 0
    for i, k in enumerate(en):
        t = rows.get(i, '')
        if i in shared and k not in SKIP_SHARED:
            t = shared[i]; used += 1
        if code == 'bn':
            t = t.translate(DIGITS)
        if not t:
            continue
        for tok in {x.rstrip('.') for x in KEEP.findall(k)}:
            if tok not in t:
                print(f'{code} #{i}: "{tok}" missing'); problems += 1
        strings[k] = t
    (out / f'{code}.json').write_text(json.dumps({'lang': code, 'strings': strings}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{code}: {len(strings)}/{len(en)} strings, {used} from the shared translations')
sys.exit(1 if problems else 0)
