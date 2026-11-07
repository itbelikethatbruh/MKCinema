"""MKCinema 2.27.0 (part): glass side menu, a new side-menu logo lockup, and a choice of app fonts.

Dee (2026-11-06): "The left side menu should have some barely barely translucent liquid glass but clean and
not visually upsetting, and the logo looks basic on the left side menu, also can we add different built in font
types across the whole app besides the logo?"

- Side rail (desktop): faint smoked glass with a specular rim. Real blur only where the app already allows blur
  (not body.noblur, so never on phones/tablets/TVs or Low graphics); those get the same tint, solid.
- Phone drawer: same look, solid tint (no backdrop-filter on touch devices: Android Chrome black tiles).
- Logo: emblem with a soft halo plus a stacked platinum wordmark and a hairline, in the rail and the drawer.
- Fonts: Settings > Appearance > Font. Nine pairings of free OFL Google Fonts (display + body). The logo, the
  intro title and subtitles keep their own fonts. Loaded only when chosen; the choice syncs with the account (CFG).

Idempotent. Run:  python3 -I patch.py /path/to/mkcinema
Bumps version.json / sw.js / APP_VERSION to 2.27.0 only when the build is older.
"""
import json, os, re, sys

VER = '2.27.0'
MARK = 'mkc-227fcss'

# id: (label, display family css, body family css, google families query)
FONTS = {
    'studio':    ('Studio',    '"Sora"',             '"Onest"',          None),
    'editorial': ('Editorial', '"Bodoni Moda"',      '"Manrope"',        'Bodoni+Moda:opsz,wght@6..96,400..900&family=Manrope:wght@400..800'),
    'classic':   ('Classic',   '"DM Serif Display"', '"DM Sans"',        'DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400..700'),
    'wide':      ('Wide',      '"Unbounded"',        '"Inter"',          'Unbounded:wght@400..800&family=Inter:opsz,wght@14..32,400..700'),
    'condensed': ('Condensed', '"Oswald"',           '"Barlow"',         'Oswald:wght@400..700&family=Barlow:wght@400;500;600;700'),
    'rounded':   ('Rounded',   '"Nunito"',           '"Nunito"',         'Nunito:wght@400..900'),
    'deco':      ('Deco',      '"Josefin Sans"',     '"Jost"',           'Josefin+Sans:wght@300..700&family=Jost:wght@400..700'),
    'slab':      ('Slab',      '"Zilla Slab"',       '"IBM Plex Sans"',  'Zilla+Slab:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600;700'),
    'techno':    ('Techno',    '"Chakra Petch"',     '"Barlow"',         'Chakra+Petch:wght@400;600;700&family=Barlow:wght@400;500;600;700'),
    # Bold: loud heading faces in the spirit of street / Y2K lettering; body text stays Onest so it reads well
    'groovy':    ('Groovy',    '"Shrikhand"',        '"Onest"',          'Shrikhand'),
    'bubble':    ('Bubble',    '"Bagel Fat One"',    '"Onest"',          'Bagel+Fat+One'),
    'graffiti':  ('Graffiti',  '"Sedgwick Ave Display"', '"Onest"',      'Sedgwick+Ave+Display'),
    'gothic':    ('Gothic',    '"Pirata One"',       '"Onest"',          'Pirata+One'),
    'street':    ('Street',    '"Bungee"',           '"Onest"',          'Bungee'),
    'outline':   ('Outline',   '"Rampart One"',      '"Onest"',          'Rampart+One'),
    'drip':      ('Drip',      '"Rubik Wet Paint"',  '"Onest"',          'Rubik+Wet+Paint'),
    'heavy':     ('Heavy',     '"Climate Crisis"',   '"Onest"',          'Climate+Crisis'),
    'brush':     ('Brush',     '"Kaushan Script"',   '"Onest"',          'Kaushan+Script'),
}
BOLD = ['groovy', 'bubble', 'graffiti', 'gothic', 'street', 'outline', 'drip', 'heavy', 'brush']
SANS = 'system-ui,-apple-system,"Segoe UI",sans-serif'
SERIF = 'Georgia,"Times New Roman",serif'
SERIFS = {'editorial', 'classic', 'slab'}

GF = {k: v[3] for k, v in FONTS.items() if v[3]}

HEAD = ("try{var _fn=JSON.parse(localStorage.getItem('mkc:cfg')||'{}').font,_FF=" + json.dumps(GF, separators=(',', ':')) +
        ";if(_FF[_fn]){document.documentElement.setAttribute('data-font',_fn);var _fl=document.createElement('link');"
        "_fl.rel='stylesheet';_fl.id='mkcFont';_fl.href='https://fonts.googleapis.com/css2?family='+_FF[_fn]+'&display=swap';"
        "document.head.appendChild(_fl)}}catch(e){}")

CSS_BOLDSEL = ','.join(f'[data-font="{k}"]' for k in BOLD)
font_css = []
for k, (label, d, b, q) in FONTS.items():
    if not q:
        continue
    font_css.append(f'html[data-font="{k}"]{{--f-display:{d},{SERIF if k in SERIFS else SANS};--f-body:{b},{SANS}}}')
FONT_CSS = '\n'.join(font_css)


CSS = r"""
/* ===== 2.27.0 fonts: the logo and the intro title keep their own type ===== */
""" + FONT_CSS + r"""
html[data-font] #intro h1{font-family:"Sora",system-ui,sans-serif}
html[data-font] .dock .brand{font-family:"Sora",system-ui,sans-serif}
/* display faces that only come in one weight must not be faux-bolded */
html[data-font="classic"]{font-synthesis-weight:none}
/* optical fixes so every pairing sits at the same visual size as Studio */
html[data-font="wide"] :is(.hero-title,.page-title){font-weight:700;letter-spacing:-.02em;font-size:clamp(24px,3.6vw,46px)}
html[data-font="wide"] .row-title{font-weight:600;font-size:clamp(15px,1.5vw,19px);letter-spacing:-.01em}
html[data-font="condensed"] :is(.hero-title,.page-title){font-weight:600;letter-spacing:.005em;text-transform:uppercase}
html[data-font="condensed"] .row-title{font-weight:500;font-size:clamp(17px,1.85vw,23px);letter-spacing:.02em}
html[data-font="editorial"] :is(.hero-title,.page-title){font-weight:600;letter-spacing:-.01em}
html[data-font="editorial"] .row-title{font-weight:600;font-size:clamp(17px,1.85vw,23px)}
html[data-font="classic"] .row-title{font-weight:400;font-size:clamp(18px,1.9vw,24px)}
html[data-font="classic"] :is(.hero-title,.page-title){font-weight:400}
html[data-font="deco"] .row-title{font-weight:600;font-size:clamp(17px,1.8vw,22px);letter-spacing:.02em}
html[data-font="deco"] :is(.hero-title,.page-title){font-weight:700;letter-spacing:.01em}
html[data-font="rounded"] :is(.hero-title,.page-title){font-weight:900}
html[data-font="rounded"] .row-title{font-weight:800}
html[data-font="slab"] .row-title{font-size:clamp(17px,1.8vw,22px)}
html[data-font="techno"] .row-title{font-weight:600;letter-spacing:.01em}
html[data-font="techno"] :is(.hero-title,.page-title){letter-spacing:0}
/* Bold set: one-weight display faces, drawn as designed (no faux bold), a little larger so their character shows */
html:is(__BOLDSEL__){font-synthesis-weight:none}
html:is(__BOLDSEL__) :is(.row-title,.page-title,.hero-title,.sec-title,.modal h2,.s-card h3){font-weight:400;letter-spacing:0;text-transform:none}
html:is(__BOLDSEL__) .row-title{font-size:clamp(18px,2vw,25px);line-height:1.15}
html:is([data-font="street"],[data-font="heavy"]) .row-title{font-size:clamp(15px,1.6vw,20px)}
html[data-font="heavy"] :is(.hero-title,.page-title){font-size:clamp(22px,3.2vw,40px)}
html[data-font="graffiti"] .row-title{font-size:clamp(21px,2.3vw,29px)}
html[data-font="brush"] .row-title{font-size:clamp(20px,2.2vw,27px)}
html[data-font="gothic"] .row-title{font-size:clamp(21px,2.3vw,28px)}
.fnt-sub{margin:14px 0 4px;font-size:12px;color:var(--mute)}

/* Settings > Appearance > Font */
.fnt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:6px 0}
.fnt-opt{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0;padding:14px 14px 12px;border-radius:14px;border:1px solid var(--line);background:transparent;color:var(--ink);cursor:pointer;text-align:left;transition:border-color .15s,background-color .15s}
.fnt-opt:hover{border-color:var(--line-hi)}
.fnt-opt.on{border-color:var(--ink);background:rgba(255,255,255,.045)}
.fnt-opt .fs{font-size:26px;line-height:1.1;white-space:nowrap;overflow:hidden;max-width:100%}
.fnt-opt .fb{font-size:12.5px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
html.tv .fnt-grid{grid-template-columns:repeat(3,1fr)}
/* the sample scales to the card so it never gets cut off (smaller fixed size for older browsers) */
.fnt-opt{container-type:inline-size}
.fnt-opt .fs{font-size:20px;font-size:min(26px,15cqi);text-overflow:clip}
.fnt-opt[data-font="wide"] .fs,.fnt-opt[data-font="heavy"] .fs{font-size:16px;font-size:min(20px,11cqi)}
.fnt-opt[data-font="street"] .fs{font-size:17px;font-size:min(22px,12.5cqi)}
@media (max-width:760px){.fnt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
html.tv .fnt-opt.nav-focus{box-shadow:inset 0 0 0 3px #f2f2f3;border-color:transparent}

/* ===== 2.27.0 side menu: faint liquid glass + logo lockup ===== */
@media (min-width:761px){
  html.nav-side:not(.tv):not([data-look="anime"]) .dock{position:relative;isolation:isolate;
    background:linear-gradient(168deg,rgba(255,255,255,.07) 0,rgba(255,255,255,.02) 26%,rgba(255,255,255,.008) 62%,rgba(255,255,255,.035) 100%),rgba(var(--n0b0b0c-c,11,11,12),.6);
    border:1px solid rgba(255,255,255,.07);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.12),inset 1px 0 0 rgba(255,255,255,.035),inset 0 -1px 0 rgba(var(--n000000-c,0,0,0),.45),0 30px 70px -36px var(--n000000,#000);
    -webkit-backdrop-filter:blur(28px) saturate(150%);backdrop-filter:blur(28px) saturate(150%)}
  /* specular rim: brightest on the top-left edge, fading away; static */
  html.nav-side:not(.tv):not([data-look="anime"]) .dock::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;padding:1px;pointer-events:none;
    background:linear-gradient(162deg,rgba(255,255,255,.3) 0,rgba(255,255,255,.07) 18%,rgba(255,255,255,0) 45%,rgba(255,255,255,0) 80%,rgba(255,255,255,.1) 100%);
    -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
  /* Low graphics, touch screens: the same tint, solid, no blur */
  html.nav-side:not(.tv):not([data-look="anime"]) body.noblur .dock{-webkit-backdrop-filter:none;backdrop-filter:none;
    background:linear-gradient(168deg,rgba(255,255,255,.06) 0,rgba(255,255,255,.016) 26%,rgba(255,255,255,0) 62%,rgba(255,255,255,.03) 100%),var(--n0b0b0c,#0b0b0c)}

  /* logo lockup */
  html.nav-side:not([data-look="anime"]) .dock .brand{position:relative;gap:13px;min-height:58px;padding:4px 10px 22px;margin-bottom:8px}
  html.nav-side:not([data-look="anime"]) .dock .brand::after{content:"";position:absolute;left:10px;right:10px;bottom:8px;height:1px;background:linear-gradient(90deg,rgba(255,255,255,.2),rgba(255,255,255,.05) 65%,rgba(255,255,255,0))}
  html.nav-side:not([data-look="anime"]) .dock .brand .mk{width:42px;height:42px;flex:none;border-radius:50%;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 8px 22px -6px var(--n000000,#000),0 0 26px -4px rgba(232,227,216,.16)}
  html.nav-side:not([data-look="anime"]) .dock .brand .word{display:inline-flex!important;flex-direction:column;align-items:flex-start;line-height:1;font-family:var(--f-serif);font-size:27px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;
    background:linear-gradient(176deg,#fff 0,#ece8df 42%,#a8a49c 58%,#f3efe7 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
  html.nav-side:not([data-look="anime"]) .dock .brand .word em{display:block;margin:7px 0 0 .1em;font-family:var(--f-serif);font-size:9.5px;font-weight:500;letter-spacing:.62em;line-height:1;color:var(--nb4b4bc,#b4b4bc);-webkit-text-fill-color:var(--nb4b4bc,#b4b4bc);background:none}
  html.side-mini:not([data-look="anime"]) .dock .brand{padding-inline:0;justify-content:center}
  @media (max-height:820px){html.nav-side:not([data-look="anime"]) .dock .brand{min-height:48px;padding-bottom:16px;margin-bottom:4px}html.nav-side:not([data-look="anime"]) .dock .brand .mk{width:36px;height:36px}html.nav-side:not([data-look="anime"]) .dock .brand .word{font-size:23px}}
  html.side-mini:not([data-look="anime"]) .dock .brand::after{left:14px;right:14px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.16),rgba(255,255,255,0))}
  html.side-mini:not([data-look="anime"]) .dock-wrap:is(:hover,:focus-within) .brand{justify-content:flex-start;padding-inline:10px}
  html.side-mini:not([data-look="anime"]) .dock-wrap:is(:hover,:focus-within) .brand .word{display:inline-flex!important}
}
html.tv.nav-side .dock .brand{display:none}

/* phone drawer: same tint and rim, fully solid: unblurred see-through text behind it looks messy, and touch screens get no backdrop-filter */
#sideDrawer .sd-panel{background:linear-gradient(168deg,rgba(255,255,255,.065) 0,rgba(255,255,255,.018) 24%,rgba(255,255,255,0) 60%,rgba(255,255,255,.03) 100%),var(--n0b0b0c,#0b0b0c);border-right:1px solid rgba(255,255,255,.09);box-shadow:inset -1px 0 0 rgba(255,255,255,.03),inset 0 1px 0 rgba(255,255,255,.1),24px 0 60px -30px var(--n000000,#000)}
body:not(.noblur) #sideDrawer .sd-panel{background:linear-gradient(168deg,rgba(255,255,255,.07) 0,rgba(255,255,255,.02) 24%,rgba(255,255,255,0) 60%,rgba(255,255,255,.035) 100%),rgba(var(--n0b0b0c-c,11,11,12),.66);-webkit-backdrop-filter:blur(28px) saturate(150%);backdrop-filter:blur(28px) saturate(150%)}
#sideDrawer .sd-top{padding:2px 4px 18px 8px;margin-bottom:8px;position:relative}
#sideDrawer .sd-top::after{content:"";position:absolute;left:8px;right:4px;bottom:6px;height:1px;background:linear-gradient(90deg,rgba(255,255,255,.2),rgba(255,255,255,.05) 65%,rgba(255,255,255,0))}
#sideDrawer .sd-brand{display:flex;align-items:center;gap:13px;font-size:inherit;letter-spacing:0;text-transform:none}
#sideDrawer .sd-brand .mk{width:42px;height:42px;flex:none;border-radius:50%;box-shadow:0 0 0 1px rgba(255,255,255,.06),0 8px 22px -6px var(--n000000,#000),0 0 26px -4px rgba(232,227,216,.16)}
#sideDrawer .sd-word{display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1;font-family:var(--f-serif);font-size:27px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;font-optical-sizing:none;font-variation-settings:"opsz" 72,"SOFT" 0,"WONK" 0;
  background:linear-gradient(176deg,#fff 0,#ece8df 42%,#a8a49c 58%,#f3efe7 100%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
#sideDrawer .sd-word em{display:block;margin:7px 0 0 .1em;font-style:normal;font-size:9.5px;letter-spacing:.62em;color:var(--nb4b4bc,#b4b4bc);-webkit-text-fill-color:var(--nb4b4bc,#b4b4bc)}
html[data-look="anime"] #sideDrawer .sd-brand :is(.mk,.sd-word){display:none}
html[data-look="anime"] #sideDrawer .sd-top::after{display:none}
"""

CSS = CSS.replace('__BOLDSEL__', CSS_BOLDSEL)

JS = r"""
/* ---------------- 2.27.0 App fonts ----------------
   Settings › Appearance › Font. Each choice pairs a display face (titles, headings) with a readable body face.
   All are free OFL fonts from Google Fonts, fetched only when chosen. The logo, the intro title and subtitles
   keep their own fonts. The head script sets html[data-font] and the stylesheet before the first paint. */
const AppFont = {
  LIST: __FONTS__,
  cur() { return this.LIST[CFG.font] ? CFG.font : 'studio'; },
  url(q) { return `https://fonts.googleapis.com/css2?family=${q}&display=swap`; },
  apply() {
    const id = this.cur(), de = document.documentElement, f = this.LIST[id];
    let l = document.getElementById('mkcFont');
    if (!f.q) { de.removeAttribute('data-font'); if (l) l.remove(); }
    else {
      if (!l) { l = document.createElement('link'); l.rel = 'stylesheet'; l.id = 'mkcFont'; document.head.appendChild(l); }
      const u = this.url(f.q); if (l.getAttribute('href') !== u) l.href = u;
      de.setAttribute('data-font', id);
    }
    // tab labels change width with the font: refit the top menu once the faces arrive
    const refit = () => { if (typeof DockFit !== 'undefined') DockFit.run(); };
    refit(); try { document.fonts.ready.then(refit); setTimeout(refit, 1200); } catch (e) { refit(); }
  },
  // previews in Settings: every face, cut down to the few letters each card shows
  preview() {
    if (document.getElementById('mkcFontPv')) return;
    const fams = Object.values(this.LIST).filter((f) => f.q).map((f) => f.q).join('&family=');
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.id = 'mkcFontPv';
    l.href = `https://fonts.googleapis.com/css2?family=${fams}&display=swap&text=${encodeURIComponent('Film nightAaBbGg Studio Editorial Classic Wide Condensed Rounded Deco Slab Techno')}`;
    document.head.appendChild(l);
  },
  html() {
    const cur = this.cur();
    const card = ([id, f]) => `<button type="button" class="fnt-opt${id === cur ? ' on' : ''}" data-nav data-font="${id}" role="radio" aria-checked="${id === cur}"><span class="fs" style="font-family:${f.d}">Film night</span><span class="fb">${f.label}</span></button>`;
    const all = Object.entries(this.LIST), clean = all.filter(([, f]) => !f.bold), bold = all.filter(([, f]) => f.bold);
    return `<div class="fnt-box" role="radiogroup" aria-label="Font"><div class="fnt-grid">${clean.map(card).join('')}</div><p class="fnt-sub">Bold headings (your text stays easy to read)</p><div class="fnt-grid">${bold.map(card).join('')}</div></div>`;
  },
  bind() {
    const box = $('#setBody .fnt-box'); if (!box) return;
    this.preview();
    $$('[data-font]', box).forEach((b) => b.addEventListener('click', () => {
      setCfg('font', b.dataset.font);
      $$('[data-font]', box).forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
    }));
  },
  init() {
    const ap = secById('appearance');
    if (ap) {
      const rows = ap.rows;
      ap.rows = () => {
        const r = typeof rows === 'function' ? rows() : rows;
        const i = r.findIndex((d) => d && d.group === 'Text');
        const add = [{ group: 'Font' }, { html: () => this.html() }];
        return i < 0 ? [...r, ...add] : [...r.slice(0, i), ...add, ...r.slice(i)];
      };
      const bind = ap.bind;
      ap.bind = () => { if (bind) bind(); this.bind(); };
    }
    CFG_HOOKS.push((k) => { if (k === 'font') this.apply(); });
    // a font picked on another device arrives with the account settings
    if (typeof applyAll === 'function') { const aa = applyAll; window.applyAll = function () { const r = aa.apply(this, arguments); try { AppFont.apply(); } catch (e) { /* cosmetic */ } return r; }; }
    this.apply();
  },
};
AppFont.init();
"""

DRAWER_OLD = '<span class="sd-brand">MK<em>Cinema</em></span>'
DRAWER_NEW = ('<span class="sd-brand"><svg class="mk" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="55" fill="#050505" stroke="url(#mkRing)" stroke-width="3"/>'
              '<use href="#mkLetters" fill="url(#mkPlat)" transform="translate(60 60) scale(.8)"/></svg><span class="sd-word">MK<em>Cinema</em></span></span>')


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def rep(s, a, b):
    assert s.count(a) == 1, ('anchor count', s.count(a), a[:80])
    return s.replace(a, b)


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    # re-runnable: an earlier run of this patch is taken out and written again, so newer fonts and fixes land
    s = re.sub(r"try\{var _fn=JSON\.parse.*?catch\(e\)\{\}(?=try\{var _lk=)", '', s, count=1, flags=re.S)
    s = re.sub(r'<style id="' + MARK + r'">.*?</style>\n<script id="mkc-227f">.*?</script>\n', '', s, count=1, flags=re.S)
    # head: data-font + stylesheet before first paint
    s = rep(s, "try{var _lk=JSON.parse", HEAD + "try{var _lk=JSON.parse")
    # subtitles keep the default faces whatever the app font is
    if "sans: 'var(--f-body)'" in s:
        s = rep(s, "sans: 'var(--f-body)'", "sans: '\"Onest\", system-ui, sans-serif'")
        s = rep(s, "display: 'var(--f-display)'", "display: '\"Sora\", system-ui, sans-serif'")
    # drawer logo lockup
    if DRAWER_OLD in s:
        s = rep(s, DRAWER_OLD, DRAWER_NEW)
    lst = {k: {'label': v[0], 'd': v[1].replace('"', "'") + (',serif' if k in SERIFS or k == 'classic' else ',sans-serif'),
               'b': v[2].replace('"', "'") + ',sans-serif', 'q': v[3], 'bold': k in BOLD} for k, v in FONTS.items()}
    js = JS.replace('__FONTS__', json.dumps(lst, ensure_ascii=False))
    s = rep(s, '</body>', f'<style id="{MARK}">{CSS}</style>\n<script id="mkc-227f">{js}</script>\n</body>')

    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    if newer(VER, cur):
        s = rep(s, f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
        sw = os.path.join(root, 'sw.js'); t = open(sw, encoding='utf-8').read()
        t = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{VER}';", t, count=1)
        open(sw, 'w', encoding='utf-8').write(t)
        vj = os.path.join(root, 'version.json'); v = json.load(open(vj, encoding='utf-8'))
        v['web'] = VER; open(vj, 'w', encoding='utf-8').write(json.dumps(v))
        print(f'version {cur} -> {VER}')
    else:
        print(f'version stays {cur}')
    open(p, 'w', encoding='utf-8').write(s)
    print('applied 2.27.0 glass + fonts')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
