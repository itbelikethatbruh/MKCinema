"""MKCinema 2.27.0: subtitle auto-sync, manage add-ons from your phone, TV player engine setting.

- index.html: style block mkc-227ncss + script block mkc-227n before mkc-cfwa (subsync.js, phone-addons.js, tvengine.js).
- remote.html: the phone's "Add-ons on your TV" sheet (menu item, a button when the TV shows its Add-ons screen,
  and #CODE~addons links from the TV's QR code open it straight away).
- i18n: new strings for es, pt, fr, de, it, hi (only added when missing).
- Version: 2.27.0 in APP_VERSION, sw.js and version.json, only when the build is lower (another 2.27.0 patch may run first).
- --android 1.7.0 also sets version.json "android" (run it only once that APK is on the download sites).

Run:  python3 -I patch.py /path/to/mkcinema [--android 1.7.0]
Idempotent: blocks that are already there are left alone.
"""
import json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.27.0'


def rd(n):
    return open(os.path.join(here, n), encoding='utf-8').read()


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def index(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    if 'id="mkc-227n"' in s:
        print('index.html: 2.27.0 block already there')
    else:
        for need in ('const SubTools = {', 'function activeTrack()', 'const MkvSubs = {', 'const DSP = {', 'const Remote = {', 'function renderAddons()',
                     'async function installAddon(', 'const QR = (', 'function setCfg(', "{ id: 'subtitles',", "{ id: 'playback',", 'const AssR = {'):
            assert need in s, f'missing {need!r}'
        js = '\n'.join(rd(f) for f in ('subsync.js', 'phone-addons.js', 'tvengine.js'))
        css = rd('features.css')
        assert '</script' not in js.lower() and '</style' not in css.lower()
        a = '<script id="mkc-cfwa">'
        assert s.count(a) == 1
        s = s.replace(a, f'<style id="mkc-227ncss">\n{css}</style>\n<script id="mkc-227n">\n{js}</script>\n{a}')
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    if newer(VER, cur):
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
        print(f'APP_VERSION {cur} -> {VER}')
    open(p, 'w', encoding='utf-8').write(s)


def remote(root):
    p = os.path.join(root, 'remote.html')
    s = open(p, encoding='utf-8').read()
    if 'id="ads"' in s:
        print('remote.html: add-ons sheet already there'); return
    def once(old, new):
        nonlocal s
        assert s.count(old) == 1, f'remote.html: {old[:60]!r} found {s.count(old)} times'
        s = s.replace(old, new)
    once('</style>', rd('remote-addons.css') + '</style>')
    once('  </defs>', '    <symbol id="i-trash" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></symbol>\n'
              '    <symbol id="i-clip" viewBox="0 0 24 24"><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></symbol>\n'
              '    <symbol id="i-plug" viewBox="0 0 24 24"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></symbol>\n  </defs>')
    m = re.search(r'  <button class="item" type="button" id="mPair">.*?</button>\n', s)
    assert m
    s = s[:m.end()] + '  <button class="item" type="button" id="mAddons"><svg class="i"><use href="#i-plug"/></svg>Add-ons on your TV</button>\n' + s[m.end():]
    m = re.search(r'  <button class="login lsn" type="button" id="lsnBtn".*?</button>\n', s)
    assert m
    s = s[:m.end()] + '  <button class="login" type="button" id="adBtn" hidden><svg class="i"><use href="#i-plug"/></svg><span class="grow"><b>Manage add-ons from this phone</b><small>Paste links with your phone’s keyboard</small></span><svg class="i"><use href="#i-right"/></svg></button>\n' + s[m.end():]
    once('<div class="toast" id="toast"', rd('remote-addons.html') + '\n<div class="toast" id="toast"')
    js = rd('remote-addons.js'); assert '</script' not in js.lower()
    once('/* ---------- Start ---------- */', js + '\n/* ---------- Start ---------- */')
    once(".replace(/^(remote=|code=)/i, ''), [c, cfg] = raw.split('.');",
         ".replace(/^(remote=|code=)/i, '').replace(/~addons$/i, () => { Ads.want = true; return ''; }), [c, cfg] = raw.split('.');")
    open(p, 'w', encoding='utf-8').write(s)
    print('remote.html: add-ons sheet added')


def i18n(root):
    tr = json.load(open(os.path.join(here, 'tr.json'), encoding='utf-8'))
    added = 0
    for code, add in tr.items():
        jp = os.path.join(root, 'i18n', f'{code}.json')
        if not os.path.exists(jp):
            continue
        d = json.load(open(jp, encoding='utf-8'))
        for k, v in add.items():
            if k not in d['strings']:
                d['strings'][k] = v; added += 1
        json.dump(d, open(jp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'i18n: {added} strings added')


def versions(root, android):
    sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
    cur = re.search(r"const VERSION = 'mkc-([\d.]+)';", w).group(1)
    if newer(VER, cur):
        open(sp, 'w', encoding='utf-8').write(w.replace(f"const VERSION = 'mkc-{cur}';", f"const VERSION = 'mkc-{VER}';"))
    vp = os.path.join(root, 'version.json'); v = json.load(open(vp, encoding='utf-8'))
    if newer(VER, v.get('web', '0.0.0')):
        v['web'] = VER
    if android and newer(android, v.get('android', '0.0.0')):
        v['android'] = android
    json.dump(v, open(vp, 'w', encoding='utf-8'))
    print('version.json:', v)


if __name__ == '__main__':
    root = sys.argv[1]
    android = sys.argv[sys.argv.index('--android') + 1] if '--android' in sys.argv else None
    index(root); remote(root); i18n(root); versions(root, android)
