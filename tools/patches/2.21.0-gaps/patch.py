"""MKCinema 2.21.0: the "what MKCinema still needs" list.
Delete account (Settings > Account and /#delete-account), privacy.html, status.html, logs.html (owner only),
folded duplicate sources, audio sync, on-device subtitle translation, Letterboxd import, share a title link.

Needs supabase.sql run once (mkcinema_delete_me + owner-only log policies). Applies on any 2.1x/2.2x build,
order-agnostic. Run once:  python3 -I patch.py /path/to/mkcinema
  - index.html: <style id="mkc-221css"> and <script id="mkc-221"> right before <script id="mkc-cfwa">.
  - privacy.html, status.html, logs.html in the web root (publishable key copied from index.html).
  - sw.js: those pages are never served from or cached as the app shell; version 2.21.0 unless newer.
"""
import os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.21.0'


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    assert 'id="mkc-221"' not in s, 'already applied'
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    assert cur.startswith('2.'), cur
    key = re.search(r"SUPABASE_PROJECT = \{ url: '[^']+', anonKey: '(sb_publishable_[A-Za-z0-9_-]+)' \}", s).group(1)
    rd = lambda n: open(os.path.join(here, n), encoding='utf-8').read()
    css, js = rd('style.css'), rd('gaps.js')
    assert '</script' not in js and '</style' not in css
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, f'<style id="mkc-221css">\n{css}</style>\n<script id="mkc-221">\n{js}</script>\n{a}')
    bump = newer(VER, cur)
    if bump:
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
    open(p, 'w', encoding='utf-8').write(s)
    base = rd('pages/_base.css')
    for n in ('privacy.html', 'status.html', 'logs.html'):
        h = rd(f'pages/{n}').replace('/*BASE*/', base).replace('%KEY%', key)
        open(os.path.join(root, n), 'w', encoding='utf-8').write(h)
    sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
    if 'privacy|status|logs' not in w:
        anchor = "    const page = /\\/remote(\\.html)?$/.test(url.pathname) ? 'remote.html' : 'index.html';"
        assert w.count(anchor) == 1, 'sw.js navigate block changed'
        w = w.replace(anchor, "    // stand-alone pages are never the app shell\n    if (/\\/(privacy|status|logs)(\\.html)?$/.test(url.pathname)) return;\n" + anchor)
    if bump:
        w2 = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{VER}';", w); assert w2 != w; w = w2
        vp = os.path.join(root, 'version.json'); v = open(vp, encoding='utf-8').read()
        v2 = re.sub(r'"web":\s*"[\d.]+"', f'"web": "{VER}"', v); assert v2 != v
        open(vp, 'w', encoding='utf-8').write(v2)
    open(sp, 'w', encoding='utf-8').write(w)
    print(f'{VER} applied to {root} (version {"set to " + VER if bump else "kept at " + cur})')


if __name__ == '__main__':
    main(sys.argv[1])
