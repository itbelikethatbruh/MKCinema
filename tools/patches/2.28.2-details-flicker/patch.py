#!/usr/bin/env python3
"""MKCinema 2.28.2: opening a title's page no longer flickers.

Dee (2026-11-06, phone browser): "When selecting movie/show it suddenly flicker and then open".

Cause (measured frame by frame in phone emulation): the details page draws at once, but the title logo has no size
until its image arrives, so the logo slot starts 18 px tall and jumps to its full height (138 px) mid fade-in. Every
button and line below it jumps down about 100 px, and the backdrop pops in at the same moment. A moment later the page
is drawn a second time when the full details arrive, which rebuilt the backdrop and logo images from scratch, so a
phone could show them blank for a frame or two before they decoded again.

Fix:
- The logo slot keeps its final height from the first frame (120 px, 84 px on short landscape phones), with the logo
  drawn at the bottom left of it, as before.
- The backdrop and logo fade in when they arrive (opacity only) instead of popping in.
- The second draw keeps the backdrop and logo images that are already on screen when they are the same pictures.
- On phones the info line (year, runtime, genres, source) keeps room for its usual second line while the full
  details load, so the buttons don't drop 32 px when the runtime and source tag arrive.

Idempotent. Run:  python3 -I patch.py /path/to/mkcinema
Bumps version.json / sw.js / APP_VERSION to 2.28.2 only when the build is older.
"""
import json, os, re, sys

VER = '2.28.2'
MARK = '/* 2.28.2 steady details */'

CSS = MARK + r"""
.d-hero .logo3d.has-logo .hero-logo{height:120px;width:auto}
@media (orientation:landscape) and (max-height:540px){.d-hero .logo3d.has-logo .hero-logo{height:84px}}
.d-hero .bg,.d-hero .hero-logo{transition:opacity .32s ease-out}
.d-hero .bg.d-wait,.d-hero .hero-logo.d-wait{opacity:0}
/* while the full details load, a phone keeps room for the second line the runtime and source tags usually need */
@media (max-width:600px){.d-hero .metaline.ml-wait{min-height:55px}}
"""

OLD_RENDER_HEAD = "  const t0 = ((performance.now() - renderDetail.popAt) / 1000).toFixed(3);\n  panel.innerHTML = `"
NEW_RENDER_HEAD = ("  const t0 = ((performance.now() - renderDetail.popAt) / 1000).toFixed(3);\n"
                   "  const keepImgs = DetailImgs.take(panel);\n"
                   "  panel.innerHTML = `")

OLD_RENDER_TAIL = "  icons();\n  panel.querySelector('[data-close]').onclick = () => { closeLayer('detail'); };"
NEW_RENDER_TAIL = ("  DetailImgs.settle(panel, keepImgs);\n"
                   "  icons();\n  panel.querySelector('[data-close]').onclick = () => { closeLayer('detail'); };")

JS = r"""
/* 2.28.2: the details page draws twice (card data first, full details a moment later). The backdrop and logo that
   are already on screen are carried over to the second draw when they are the same pictures, so they never blank
   out while a new copy decodes; pictures still on their way fade in when they arrive. */
const DetailImgs = {
  SEL: '.d-hero > img.bg, .d-hero .hero-logo',
  take(panel) {
    const m = new Map();
    panel.querySelectorAll(this.SEL).forEach((im) => { if (im.dataset.osrc) m.set(`${im.classList.contains('bg') ? 'bg' : 'logo'}|${im.dataset.osrc}`, im); });
    return m;
  },
  settle(panel, keep) {
    panel.querySelectorAll(this.SEL).forEach((im) => {
      const src = im.getAttribute('src') || ''; im.dataset.osrc = src;
      const old = keep.get(`${im.classList.contains('bg') ? 'bg' : 'logo'}|${src}`);
      if (old && old !== im) {
        im.replaceWith(old);
        // a logo that failed earlier stays hidden, and its title text shows in its place
        if (old.hidden) { const alt = old.nextElementSibling; if (alt && alt.hasAttribute('data-logo-alt')) alt.hidden = false; }
        return;
      }
      if (im.complete && im.naturalWidth) return;
      im.classList.add('d-wait');
      const done = () => im.classList.remove('d-wait');
      im.addEventListener('load', done, { once: true }); im.addEventListener('error', done, { once: true });
      setTimeout(done, 6000);
    });
  },
};
"""

ANCHOR_JS = "function renderDetail(loading) {"

RELEASE = ("const RELEASES = [\n  { v: '2.28.2', date: '2026-11-06', items: [\n"
           "    ['fixed', 'Steady title pages', 'Opening a film or show no longer flickers. The logo keeps its place from the first frame, and the backdrop and logo fade in instead of popping in.'],\n"
           "  ] },")

TR = {
    'es': ['Páginas de título estables', 'Abrir una película o serie ya no parpadea. El logo mantiene su sitio desde el primer momento, y el fondo y el logo aparecen con un fundido en lugar de saltar.'],
    'pt': ['Páginas de título estáveis', 'Abrir um filme ou série não pisca mais. O logo fica no lugar desde o primeiro instante, e o fundo e o logo aparecem suavemente em vez de surgir de repente.'],
    'fr': ['Pages de titre stables', 'Ouvrir un film ou une série ne clignote plus. Le logo garde sa place dès la première image, et le fond et le logo apparaissent en fondu au lieu de surgir.'],
    'de': ['Ruhige Titelseiten', 'Ein Film oder eine Serie öffnet sich jetzt ohne Flackern. Das Logo hat vom ersten Bild an seinen Platz, und Hintergrund und Logo blenden sanft ein, statt aufzuspringen.'],
    'it': ['Pagine dei titoli stabili', 'Aprire un film o una serie non sfarfalla più. Il logo resta al suo posto dal primo istante, e sfondo e logo compaiono in dissolvenza invece di apparire di colpo.'],
    'hi': ['स्थिर टाइटल पेज', 'फ़िल्म या शो खोलते समय अब स्क्रीन नहीं झपकती। लोगो पहले पल से अपनी जगह पर रहता है, और बैकग्राउंड व लोगो अचानक आने के बजाय धीरे से दिखते हैं।'],
}
EN = ['Steady title pages', 'Opening a film or show no longer flickers. The logo keeps its place from the first frame, and the backdrop and logo fade in instead of popping in.']


def newer(a, b):
    return tuple(int(x) for x in a.split('.')) > tuple(int(x) for x in b.split('.'))


def index(root):
    p = os.path.join(root, 'index.html'); s = open(p, encoding='utf-8').read()
    if MARK in s:
        print('index.html: 2.28.2 already applied')
    else:
        edits = [
            (OLD_RENDER_HEAD, NEW_RENDER_HEAD),
            (OLD_RENDER_TAIL, NEW_RENDER_TAIL),
            (ANCHOR_JS, JS.strip('\n') + '\n' + ANCHOR_JS),
            ("const RELEASES = [", RELEASE),
        ]
        # the info line under the logo on the details page (the only one that shows the source addon tag)
        lines = s.split('\n'); hit = [i for i, l in enumerate(lines) if 'm._addon ? `<span class="tag-s v">' in l and '<div class="metaline">' in l]
        assert len(hit) == 1, f'metaline anchor found {len(hit)} times'
        lines[hit[0]] = lines[hit[0]].replace('<div class="metaline">', '<div class="metaline${loading ? \' ml-wait\' : \'\'}">', 1)
        s = '\n'.join(lines)
        for old, new in edits:
            assert s.count(old) == 1, f'anchor found {s.count(old)} times: {old[:70]}'
            s = s.replace(old, new)
        # styles go at the end of the last stylesheet in <head>, after every rule they refine
        i = s.index('</head>'); j = s.rindex('</style>', 0, i)
        s = s[:j] + CSS + s[j:]
        print('index.html: steady details applied')
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    if newer(VER, cur):
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';"); print(f'APP_VERSION {cur} -> {VER}')
    open(p, 'w', encoding='utf-8').write(s)


def i18n(root):
    added = 0
    for code, vals in TR.items():
        jp = os.path.join(root, 'i18n', f'{code}.json')
        if not os.path.exists(jp):
            continue
        d = json.load(open(jp, encoding='utf-8'))
        for k, v in zip(EN, vals):
            if k not in d['strings']:
                d['strings'][k] = v; added += 1
        json.dump(d, open(jp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'i18n: {added} strings added')


def versions(root):
    sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
    cur = re.search(r"const VERSION = 'mkc-([\d.]+)';", w).group(1)
    if newer(VER, cur):
        w = w.replace(f"const VERSION = 'mkc-{cur}';", f"const VERSION = 'mkc-{VER}';")
    open(sp, 'w', encoding='utf-8').write(w)
    vp = os.path.join(root, 'version.json'); v = json.load(open(vp, encoding='utf-8'))
    if newer(VER, v.get('web', '0.0.0')):
        v['web'] = VER
    json.dump(v, open(vp, 'w', encoding='utf-8'))
    print('version.json:', v)


if __name__ == '__main__':
    root = sys.argv[1]
    index(root); i18n(root); versions(root)
