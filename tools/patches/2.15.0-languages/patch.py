"""MKCinema 2.15.0: interface languages (Spanish, Portuguese (Brazil), French, German, Italian, Hindi).

Applies on top of web 2.14.0 or later. Run once:  python3 -I patch.py /path/to/mkcinema [--version X.Y.Z]
(without --version: 2.14.x becomes 2.15.0; a base already at 2.15.0 or later keeps its version, so the order
against the 2.16.0 subtitles/support patch does not matter)
  - index.html: <script id="mkc-215"> (i18n.js) before mkc-cfwa, an early fetch of the language file in the head,
    and the four Library checks that read "My watchlist"/"Continue watching" back from the page now read the English.
  - sw.js: mkc-2.15.0, and /i18n/*.json is cached (stale-while-revalidate) so languages work offline.
  - version.json: web 2.15.0 (android is left alone).
  - i18n/<code>.json built from src/en.json + src/<code>.tsv ("index<TAB>translation"; a missing index stays English).
"""
import json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
LANGS = ['es', 'pt', 'fr', 'de', 'it', 'hi']


def build(out_dir):
    en = json.load(open(os.path.join(here, 'src', 'en.json'), encoding='utf-8'))
    os.makedirs(out_dir, exist_ok=True)
    for c in LANGS:
        strings = {}
        for line in open(os.path.join(here, 'src', f'{c}.tsv'), encoding='utf-8'):
            line = line.rstrip('\n')
            if not line.strip():
                continue
            i, t = line.split('\t')
            t = t.strip()
            if t and t != en[int(i)]:
                strings[en[int(i)]] = t
        json.dump({'lang': c, 'strings': strings}, open(os.path.join(out_dir, f'{c}.json'), 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        print(f'i18n/{c}.json: {len(strings)} strings')


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()

    def rep(a, b, n=1):
        nonlocal s
        c = s.count(a)
        assert c == n, f'{c} x {a[:80]!r}'
        s = s.replace(a, b)

    assert 'id="mkc-215"' not in s, 'already applied'
    m = re.search(r"const APP_VERSION = '(\d+)\.(\d+)\.(\d+)';", s)
    assert m, 'APP_VERSION not found'
    cur = tuple(int(x) for x in m.groups())
    # never move the version backwards: a base already at 2.15.0 or later (e.g. 2.16.0) keeps its number
    new = VERSION or ('.'.join(map(str, cur)) if cur >= (2, 15, 0) else '2.15.0')
    if new != '.'.join(map(str, cur)):
        rep(m.group(0), f"const APP_VERSION = '{new}';")
    # start downloading the language file while the rest of the page is still parsing
    early = ("try{var _ul=JSON.parse(localStorage.getItem('mkc:cfg')||'{}').uiLang||'auto',_uc=_ul!=='auto'?_ul:"
             "((navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'en'])"
             ".map(function(x){return String(x).slice(0,2).toLowerCase()})"
             ".filter(function(x){return /^(en|es|pt|fr|de|it|hi)$/.test(x)})[0]||'en');"
             "if(/^(es|pt|fr|de|it|hi)$/.test(_uc))window.__i18nP=fetch('i18n/'+_uc+'.json')}catch(e){}")
    rep('<script>if (/MKCinemaTV|', '<script>' + early + 'if (/MKCinemaTV|')
    # checks that read row titles back: compare the English, not the translated text
    rep("!/My watchlist/.test(el.textContent.slice(0, 40))",
        "!/My watchlist/.test((window.i18nEn ? i18nEn(el) : el.textContent).slice(0, 40))")
    rt = "(sec.querySelector('.row-title') || {}).textContent || ''"
    rt2 = "window.i18nEn ? i18nEn(sec.querySelector('.row-title')) : ((sec.querySelector('.row-title') || {}).textContent || '')"
    rep(f"/^My watchlist/.test({rt})", f"/^My watchlist/.test({rt2})", 2)
    rep(f"/^(My watchlist|Continue watching)/.test({rt})", f"/^(My watchlist|Continue watching)/.test({rt2})")
    js = open(os.path.join(here, 'i18n.js'), encoding='utf-8').read()
    assert '</script' not in js
    rep('<script id="mkc-cfwa">', f'<script id="mkc-215">\n{js}</script>\n<script id="mkc-cfwa">')
    open(p, 'w', encoding='utf-8').write(s)

    sp = os.path.join(root, 'sw.js')
    w = open(sp, encoding='utf-8').read()
    w, k = re.subn(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{new}';", w)
    assert k == 1, 'sw VERSION not found'
    assert '/i18n/' not in w
    a = '  if (CDN.test(req.url)) {'
    assert w.count(a) == 1
    w = w.replace(a, "  // CDN libraries, and the interface language files (i18n/*.json), are cached and refreshed in the background\n"
                     "  if (CDN.test(req.url) || (url.origin === location.origin && /\\/i18n\\/[a-z]{2}\\.json$/.test(url.pathname))) {")
    open(sp, 'w', encoding='utf-8').write(w)

    vp = os.path.join(root, 'version.json')
    v = open(vp, encoding='utf-8').read()
    v2, k = re.subn(r'"web":\s*"[\d.]+"', f'"web": "{new}"', v)
    assert k == 1, 'version.json web not found'
    open(vp, 'w', encoding='utf-8').write(v2)

    build(os.path.join(root, 'i18n'))
    print(f'{new} (interface languages) applied to', root)


VERSION = None
if __name__ == '__main__':
    if '--version' in sys.argv:
        i = sys.argv.index('--version'); VERSION = sys.argv[i + 1]; del sys.argv[i:i + 2]
    if sys.argv[1:] == ['--build-only']:
        build(os.path.join(here, 'i18n'))
    else:
        main(sys.argv[1])
