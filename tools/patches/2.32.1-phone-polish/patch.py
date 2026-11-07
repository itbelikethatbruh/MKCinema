#!/usr/bin/env python3
"""Web 2.32.1 phone polish (Dee, 2026-11-06: Smart Play and the other hero buttons were unbalanced on a phone in
portrait, with Watchlist left alone on its own row; plus "go through the whole app and optimize everything").
- Home featured banner, phone portrait (<=560px): Smart Play full width, then Trailer / Details / Watchlist as three
  equal icon-over-label buttons on one row. Fixed heights, no JS measuring.
- Film page, phone portrait: same pattern; all secondary buttons (Trailer, Watchlist, Share, Lists, Download, IMDb)
  share one even row, or two rows of three when there are six.
- Network logos on phones no longer float forever (30 infinite animations, each over a 4-layer drop-shadow, kept the
  GPU busy even off screen). They still lift on tap/focus. TVs already did this.
- Icons: 'layout-list' (Arrange Home) was missing from the inline icon set, so every boot downloaded the full
  355 KB lucide library from unpkg. Re-runs the 2.7.35 icon regeneration.
Font sizes are written as calc(Npx * var(--ts,1)) so they follow the 2.32.0 Text size setting.
Idempotent, order-independent with 2.32.0. Usage: python3 -I patch.py /mnt/project-files/mkcinema"""
import sys, re, json, pathlib, subprocess
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
HERE = pathlib.Path(__file__).resolve().parent
VER = '2.32.1'
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8')

def rep(old, new, count=1):
    global s
    if new in s: return
    assert s.count(old) == count, (old[:90], s.count(old))
    s = s.replace(old, new)

T = lambda px: f'calc({px}px * var(--ts,1))' if isinstance(px, (int, float)) else f'calc({px} * var(--ts,1))'
CSS = """<style id="mkc-2321css">
/* 2.32.1 phone portrait: Smart Play on its own row, the other actions as one even row of icon-over-label buttons */
@media (max-width:560px){
  .hero .actions,.d-hero .actions{display:flex;flex-wrap:wrap;gap:8px;width:100%}
  .hero .actions .btn-bolt,.d-hero .actions .btn-bolt{flex:1 1 100%;height:50px;grid-column:auto}
  .hero .actions .btn-ghost,.d-hero .actions .btn-ghost{flex:1 1 0;min-width:0;height:calc(58px * var(--ts,1));flex-direction:column;justify-content:center;align-items:center;gap:5px;
    padding:6px 4px;border-radius:16px;font-size:""" + T(11.5) + """;font-weight:600;line-height:1.12;letter-spacing:.01em;white-space:normal;text-align:center;overflow:hidden}
  .hero .actions .btn-ghost>svg,.d-hero .actions .btn-ghost>svg{width:19px;height:19px;flex:none;margin:0}
  /* six buttons on the film page: two rows of three instead of six slivers */
  .d-hero .actions:has(> .btn-ghost:nth-child(7)) > .btn-ghost{flex-basis:calc((100% - 16px) / 3)}
}
/* 2.32.1 phone tab bar: long translated labels (Mediathek, Live-TV) no longer run into their neighbours.
   :where() keeps this below the 2.32.0 font rules and the Anime look */
@media (max-width:420px){
  :where(html:not([data-look="anime"]) #mtabs) button{padding-inline:0}
  :where(html:not([data-look="anime"]) #mtabs) button span{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:""" + T('min(10.5px, 2.75vw)') + """;letter-spacing:-.01em}
}
/* 2.32.1 settings on phones: the section blurb uses the full width instead of a narrow column beside the icon,
   and cards inside cards lose a layer of padding */
@media (max-width:560px){
  .set-hd{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 12px;align-items:center}
  .set-hd>div:not(.set-hd-ic){display:contents}
  .set-hd-ic{width:40px;height:40px;border-radius:13px}
  .set-hd h3{margin:0}
  .set-hd p{grid-column:1/-1;margin-top:12px}
  .set-card .acct-card{padding:16px 14px}
}
/* 2.32.1 phones: network logos rest until touched (TVs already did this) */
@media (hover:none) and (pointer:coarse){
  .net-tile .net-logo,.net-tile::before,.net-tile .net-shade{animation:none}
}
</style>
"""
if 'id="mkc-2321css"' not in s:
    s = s.replace('<script id="mkc-227f">', CSS + '<script id="mkc-227f">', 1)
    assert 'id="mkc-2321css"' in s, 'anchor mkc-227f'

# What's new + version
if "{ v: '2.32.1'" not in s: rep("const RELEASES = [\n", """const RELEASES = [
  { v: '2.32.1', date: '2026-11-06', items: [
    ['better', 'Tidier buttons on phones', 'On a phone held upright, Smart Play gets its own row and Trailer, Details and Watchlist sit evenly underneath, on Home and on every film page.'],
    ['better', 'Lighter and smoother', 'The app no longer downloads a large icon library on every start, and the network logos on Home stay still on phones to save battery.'],
  ] },
""")
# keep 2.32.1 above any older entry another patch put on top later (e.g. 2.32.0 applied after this one)
m = re.search(r"  \{ v: '2\.32\.1'.*?\n  \] \},\n", s, flags=re.S)
if m and s.index("const RELEASES = [\n") + len("const RELEASES = [\n") != m.start():
    blk = m.group(0); s = s[:m.start()] + s[m.end():]
    s = s.replace("const RELEASES = [\n", "const RELEASES = [\n" + blk, 1)
cur = re.search(r"const APP_VERSION = '([\d.]+)'", s).group(1)
newer = lambda a, b: tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))
if newer(VER, cur):
    s = s.replace(f"const APP_VERSION = '{cur}'", f"const APP_VERSION = '{VER}'")
    sw = root / 'sw.js'; t = sw.read_text(); sw.write_text(re.sub(r"const VERSION = 'mkc-[\d.]+'", f"const VERSION = 'mkc-{VER}'", t))
    vj = root / 'version.json'; j = json.loads(vj.read_text()); j['web'] = VER; vj.write_text(json.dumps(j, indent=2) + '\n')
ix.write_text(s, encoding='utf-8')

# refresh the inline icon set (idempotent; picks up icons added since 2.7.35, e.g. layout-list)
perf = HERE.parent / '2.7.35-perf' / 'patch.py'
subprocess.run([sys.executable, '-I', str(perf), str(ix)], check=True)
s = ix.read_text(encoding='utf-8')
assert '"LayoutList"' in s, 'layout-list icon still missing'
print('ok', VER)
