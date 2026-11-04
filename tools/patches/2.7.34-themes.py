#!/usr/bin/env python3
"""2.7.34 Themes: Noir (default) plus Midnight, Velvet and Sepia.

Colour-only. Every near-neutral colour in the app's CSS becomes a token with the
Noir value as its fallback, so Noir renders exactly as before. Each theme sets
those tokens to the same lightness with its own hue, so contrast, light-on-dark
TV rules and focus states carry over unchanged. Video surfaces (#player,
#trailer) stay true black in every theme. No new effects.

Usage: python3 2.7.34-themes.py path/to/index.html   (edits in place, idempotent)
"""
import colorsys, re, sys

P = sys.argv[1]
s = open(P, encoding='utf-8').read()
if 'data-look' in s:
    print('already patched'); sys.exit(0)

# id: (label, blurb, dark hue, dark sat, black lift, light sat, accent hue, accent sat)
THEMES = {
    'midnight': ('Midnight', 'Ink blue blacks and ice silver type, like a cinema before the lights go down.', 222, .42, .034, .20, 214, .42),
    'velvet':   ('Velvet', 'Deep oxblood and soft ivory, with rose gold for the small highlights.', 346, .36, .03, .14, 18, .40),
    'sepia':    ('Sepia', 'Warm umber blacks, cream type and amber highlights, like old film stock.', 30, .30, .03, .24, 38, .52),
}

def hx(c): return '#%02x%02x%02x' % c
def parse_hex(h):
    h = h[1:]
    if len(h) == 3: h = ''.join(ch * 2 for ch in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def neutral(rgb):
    r, g, b = rgb
    if max(rgb) - min(rgb) > 26: return False
    l = (max(rgb) + min(rgb)) / 510
    return l < .975          # pure white stays white

def warm(rgb):
    r, g, b = rgb; l = (max(rgb) + min(rgb)) / 510
    return l > .35 and r - b >= 8

def themed(rgb, t):
    _, _, hd, sd, lift, sl, ha, sa = t
    h, l, _s = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    if warm(rgb):
        hue, sat = ha, sa
    else:
        hue = hd
        k = min(1, max(0, (l - .2) / .4))
        sat = sd + (sl - sd) * k
    l2 = lift + l * (1 - lift) if l < .5 else l
    r, g, b = colorsys.hls_to_rgb(hue / 360, l2, sat)
    return tuple(round(c * 255) for c in (r, g, b))

used = {}   # rgb -> token name

def tok(rgb):
    n = '--n' + hx(rgb)[1:]
    used[rgb] = n
    return n

HEX = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
RGBA = re.compile(r'rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*[\d.]+\s*)?\)')

def css_fix(css):
    # keep url(...) and existing token fallbacks untouched
    parts = re.split(r'(url\([^)]*\))', css)
    out = []
    for i, p in enumerate(parts):
        if i % 2:
            out.append(p); continue
        def rh(m):
            rgb = parse_hex(m.group(0))
            if not neutral(rgb): return m.group(0)
            return 'var(%s,%s)' % (tok(rgb), m.group(0))
        def rr(m):
            rgb = tuple(int(m.group(i)) for i in (1, 2, 3))
            if not neutral(rgb): return m.group(0)
            a = m.group(4) or ''
            fn = 'rgba' if a else 'rgb'
            return '%s(var(%s-c,%d,%d,%d)%s)' % (fn, tok(rgb), *rgb, a)
        p = RGBA.sub(rr, p)
        p = HEX.sub(rh, p)
        out.append(p)
    return ''.join(out)

# Only stylesheet text: <style> blocks (including ones JS writes) and the --plat style vars
s = re.sub(r'(<style[^>]*>)(.*?)(</style>)', lambda m: m.group(1) + css_fix(m.group(2)) + m.group(3), s, flags=re.S)

def theme_css():
    rows = []
    for tid, t in THEMES.items():
        decl = []
        for rgb, n in sorted(used.items()):
            c = themed(rgb, t)
            decl.append('%s:%s;%s-c:%d,%d,%d' % (n, hx(c), n, *c))
        rows.append('html[data-look="%s"]{%s}' % (tid, ';'.join(decl)))
    reset = ';'.join('%s:initial;%s-c:initial' % (n, n) for n in sorted(used.values()))
    rows.append('html[data-look] #player,html[data-look] #trailer{%s}' % reset)
    # theme picker
    rows.append('''.looks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:8px 0 6px}
.lk{display:flex;flex-direction:column;gap:9px;text-align:left;padding:10px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink);transition:border-color .2s,background-color .2s}
.lk:hover{border-color:var(--line-hi)}
.lk.on{border-color:var(--ink);background:rgba(255,255,255,.04)}
.lk-scr{position:relative;aspect-ratio:2.39;border-radius:7px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--lb);border:1px solid rgba(255,255,255,.1)}
.lk-scr::before,.lk-scr::after{content:"";position:absolute;left:0;right:0;height:13%;background:var(--l0)}
.lk-scr::before{top:0}.lk-scr::after{bottom:0}
.lk-scr i{font-style:normal;font-family:var(--f-display);font-weight:700;font-size:13px;letter-spacing:.04em;color:var(--li)}
.lk-scr i em{font-style:normal;font-weight:400;font-size:.62em;letter-spacing:.34em;margin-left:.4em;color:var(--la)}
.lk-dots{display:flex;gap:5px}
.lk-dots span{width:14px;height:14px;border-radius:50%;background:var(--c);border:1px solid rgba(255,255,255,.16)}
.lk b{font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:6px}
.lk b svg.lucide{width:14px;height:14px;display:none}
.lk.on b svg.lucide{display:block}
.lk small{font-size:12px;line-height:1.4;color:var(--mute)}
@media (max-width:1100px){.looks{grid-template-columns:repeat(2,minmax(0,1fr))}}
html.tv .lk.on{border-color:#f2f2f3;box-shadow:inset 0 0 0 1px #f2f2f3}''')
    return '<style id="looks">\n' + '\n'.join(rows) + '\n</style>\n'

def look_js():
    def sw(t):
        if t is None:
            return dict(l0='#000000', lb='#111113', li='#f2f2f3', la='#d9d4c7', meta='#000000')
        f = lambda h: hx(themed(parse_hex(h), t))
        return dict(l0=f('#000'), lb=f('#111113'), li=f('#f2f2f3'), la=f('#d9d4c7'), meta=f('#000'))
    items = [("noir", "Noir", "Matte black, platinum type and fine hairlines. The original.", sw(None))]
    for tid, t in THEMES.items():
        items.append((tid, t[0], t[1], sw(t)))
    js = ',\n  '.join("%s: { label: '%s', blurb: '%s', l0: '%s', lb: '%s', li: '%s', la: '%s', meta: '%s' }" %
                      (i, l, b.replace("'", "\\'"), c['l0'], c['lb'], c['li'], c['la'], c['meta']) for i, l, b, c in items)
    return 'const LOOKS = {\n  ' + js + '\n};\n'

# 1. theme tokens go after the last stylesheet so they win over everything
idx = s.rfind('</body>')
s = s[:idx] + theme_css() + s[idx:]

# 2. set the theme before first paint (no flash of Noir)
s = s.replace("document.documentElement.classList.add('tv');</script>",
              "document.documentElement.classList.add('tv');try{var _lk=JSON.parse(localStorage.getItem('mkc:cfg')||'{}').look;if(_lk&&_lk!=='noir'&&/^[a-z]+$/.test(_lk))document.documentElement.setAttribute('data-look',_lk);}catch(e){}</script>", 1)
assert 'data-look' in s

# 3. config + palette
s = s.replace("  cardInfo: 'hover', uiScale: 100,", "  look: 'noir', cardInfo: 'hover', uiScale: 100,", 1)
s = s.replace("const PALETTE = {", look_js() + "const PALETTE = {", 1)

# 4. applyAll: CSS owns the palette now (inline vars would override the theme)
old = "  root.setProperty('--void', PALETTE.void); root.setProperty('--cyan', PALETTE.a1); root.setProperty('--violet', PALETTE.a2); root.setProperty('--gold', PALETTE.a3);\n"
assert old in s
s = s.replace(old, """  ['--void', '--cyan', '--violet', '--gold'].forEach((k) => root.removeProperty(k));
  { const lk = LOOKS[CFG.look] ? CFG.look : 'noir', de = document.documentElement; if (lk === 'noir') de.removeAttribute('data-look'); else de.setAttribute('data-look', lk); const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', LOOKS[lk].meta); }
""", 1)

# 5. Settings > Appearance: the picker
old_intro = "intro: 'MKCinema has one look, Noir: matte black, platinum type and fine hairlines, so nothing competes with the poster art.', rows: () => ["
assert old_intro in s
s = s.replace(old_intro, "intro: 'Four looks, all dark and quiet so nothing competes with the poster art. Your choice syncs to your account.', bind: () => $$('#setBody [data-look]').forEach((b) => b.addEventListener('click', () => { setCfg('look', b.dataset.look); $$('#setBody [data-look]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); })), rows: () => [", 1)
m = re.search(r"function lookHTML\(\) \{\n.*?\n\}\n", s, re.S)
assert m
s = s[:m.start()] + """function lookHTML() {
  const cur = LOOKS[CFG.look] ? CFG.look : 'noir';
  return `<div class="looks" role="radiogroup" aria-label="Theme">${Object.entries(LOOKS).map(([id, t]) => `<button type="button" class="lk ${id === cur ? 'on' : ''}" role="radio" aria-checked="${id === cur}" data-look="${id}" data-nav style="--l0:${t.l0};--lb:${t.lb};--li:${t.li};--la:${t.la}"><span class="lk-scr"><i>MK<em>CINEMA</em></i></span><b><svg class="lucide" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>${t.label}</b><small>${t.blurb}</small><span class="lk-dots"><span style="--c:${t.l0}"></span><span style="--c:${t.lb}"></span><span style="--c:${t.li}"></span><span style="--c:${t.la}"></span></span></button>`).join('')}</div>`;
}
""" + s[m.end():]

open(P, 'w', encoding='utf-8').write(s)
print('patched', len(used), 'tokens')
