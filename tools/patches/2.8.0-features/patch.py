#!/usr/bin/env python3
"""2.8.0 feature release: Send to TV, Channels + guide, Split Screen, player tools, Source Check, curated rows,
Shortlist, Where to watch, Seats (profiles), Atelier (custom theme), Addon directory, Line check, Report a problem.
The feature code lives next to this file (js/*.js in order, features.css) and is added as one block before </body>.
Usage: python3 -I patch.py index.html sw.js   (idempotent). Re-run the 2.7.35 icon patch afterwards."""
import os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
p, swp = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if 'id="mkc-28"' in s: print('already applied'); sys.exit(0)
def rep(a, b):
    global s
    assert s.count(a) == 1, ('anchor', s.count(a), a[:80])
    s = s.replace(a, b)

# Seats: library keys are stored per seat; Store.raw always reaches the shared (main seat) keys
rep("const Store = {\n  get(k, d) { try { const v = localStorage.getItem('mkc:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },\n  set(k, v) { try { localStorage.setItem('mkc:' + k, JSON.stringify(v)); } catch (e) { /* storage blocked: keep running in memory */ } },\n};",
    "/* 2.8 Seats: the library keys below belong to the seat in use; the main seat keeps the plain keys */\n"
    "const SEAT_KEYS = ['watchlist', 'progress', 'watched', 'taste', 'recentSearches', 'bookmarks', 'slSkipped'];\n"
    "const SEAT = (() => { try { const v = localStorage.getItem('mkc:seat') || ''; return /^[a-z0-9]{4,16}$/.test(v) ? v : ''; } catch (e) { return ''; } })();\n"
    "const Store = {\n"
    "  key(k) { return SEAT && SEAT_KEYS.includes(k) ? `mkc:seat:${SEAT}:${k}` : 'mkc:' + k; },\n"
    "  get(k, d) { try { const v = localStorage.getItem(this.key(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },\n"
    "  set(k, v) { try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch (e) { /* storage blocked: keep running in memory */ } },\n"
    "  raw: {\n"
    "    get(k, d) { try { const v = localStorage.getItem('mkc:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },\n"
    "    set(k, v) { try { localStorage.setItem('mkc:' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },\n"
    "  },\n"
    "};")

# Atelier: the custom theme's colours are written before first paint, like the built-in looks
rep("document.documentElement.setAttribute('data-look',_lk);}catch(e){}</script>",
    "document.documentElement.setAttribute('data-look',_lk);if(_lk==='atelier'){var _ac=JSON.parse(localStorage.getItem('mkc:atelierCss')||'null');if(typeof _ac==='string'){var _st=document.createElement('style');_st.id='atelier';_st.textContent=_ac;document.head.appendChild(_st);}}}catch(e){}</script>")

# Boot cover (Drake, 2026-11-05): Home used to paint in stages on a fresh start (unstyled cards, an empty banner, text
# fading in). A plain cover with an honest progress bar now holds until the styles, the first row and the banner art
# are in, then fades once. Capped so a slow network never holds the app hostage. Static on TVs apart from the bar.
rep("</head>",
    "<style>#bootCover{position:fixed;inset:0;z-index:79;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;"
    "background:var(--n000000,#000);transition:opacity .42s ease}#bootCover.out{opacity:0;pointer-events:none}"
    "#bootCover .bc-mk{width:84px;height:84px;border-radius:50%;border:1px solid rgba(217,212,199,.42);display:grid;place-items:center;"
    "font:500 30px/1 'Fraunces',Georgia,'Times New Roman',serif;letter-spacing:-.04em;color:var(--nd9d4c7,#d9d4c7)}"
    "#bootCover .bc-bar{width:148px;height:2px;border-radius:2px;background:rgba(255,255,255,.09);overflow:hidden}"
    "#bootCover .bc-bar i{display:block;height:100%;background:var(--nd9d4c7,#d9d4c7);transform-origin:0 50%;transform:scaleX(.08);transition:transform .35s ease}"
    "html.tv #bootCover .bc-mk{width:104px;height:104px;font-size:38px}html.tv #bootCover .bc-bar{width:200px;height:3px}</style>\n</head>")
rep('<body class="locked">',
    '<body class="locked">\n<div id="bootCover" aria-hidden="true"><div class="bc-mk">MK</div><div class="bc-bar"><i id="bcFill"></i></div></div>\n'
    "<script>/* 2.8 boot cover: hold Home until it is ready to look at */(function(){var c=document.getElementById('bootCover'),f=document.getElementById('bcFill'),"
    "t0=Date.now(),cap=document.documentElement.classList.contains('tv')?3500:4500,done=false,p=.08;"
    "function set(v){if(v>p){p=v;f.style.transform='scaleX('+v+')';}}"
    "function gone(){if(done)return;done=true;clearInterval(iv);set(1);setTimeout(function(){c.classList.add('out');setTimeout(function(){c.remove();},460);},180);}"
    "function img(el){return !el||el.complete;}"
    "function step(){if(Date.now()-t0>cap)return gone();if(document.readyState==='loading'){set(.25);return;}set(.45);"
    "var view=null;try{view=S.view;}catch(e){}if(view&&view!=='home'){return gone();}"
    "var rows=document.getElementById('homeRows'),hero=document.getElementById('hero');if(!rows||!rows.querySelector('.card,img'))return;set(.7);"
    "if(hero&&!hero.hidden){var bg=document.querySelector('#heroBg img');if(!bg||!img(bg)||!img(document.querySelector('#heroLogoWrap img')))return;}set(.9);"
    "if(document.fonts&&document.fonts.status!=='loaded')return;clearInterval(iv);requestAnimationFrame(function(){requestAnimationFrame(gone);});setTimeout(gone,400);}"
    "var iv=setInterval(step,100);window.addEventListener('error',function(){setTimeout(gone,800);});})();</script>")

# Trailers (Drake, 2026-11-05: YouTube trailers stutter and buffer, nothing else does). The pop-up was see-through, so the
# whole app (and any open details page) kept being composited under every video frame, and the rounded clip on the
# frame keeps the video off the hardware overlay path on TVs and phones. While a trailer plays, everything under it
# stops painting once the pop-up has faded in, the backdrop goes solid, and TVs/phones drop the clip.
rep("  TR.id = id; openLayer('trailer'); trMsg('');",
    "  TR.id = id; openLayer('trailer'); trMsg('');\n"
    "  clearTimeout(TR.hideT); TR.hideT = setTimeout(() => { if (!$('#trailer').hidden) document.body.classList.add('tr-on'); }, 300);")
rep("  if (!silent) closeLayer('trailer');",
    "  clearTimeout(TR.hideT); document.body.classList.remove('tr-on');\n  if (!silent) closeLayer('trailer');")
rep("</head>",
    "<style>/* 2.8 trailers: nothing paints under a playing trailer */body.tr-on #app,body.tr-on .layer-ov:not(#trailer),body.tr-on .x8-full,body.tr-on .x8-modal{visibility:hidden}"
    "body.tr-on #trailer{background:var(--n000000,#000)}html.tv .tr-frame,body.touch-ui .tr-frame{border-radius:0;box-shadow:none;overflow:visible}</style>\n</head>")

js = '\n'.join(open(os.path.join(here, 'js', f), encoding='utf-8').read() for f in sorted(os.listdir(os.path.join(here, 'js'))) if f.endswith('.js'))
css = open(os.path.join(here, 'features.css'), encoding='utf-8').read()
assert '</script' not in js.lower() and '</style' not in css.lower()
idx = s.rindex('</body>')
s = s[:idx] + f'<style id="mkc-28css">\n{css}\n</style>\n<script id="mkc-28">\n{js}\n</script>\n' + s[idx:]

s, n = re.subn(r"const APP_VERSION = '[\d.]+';", "const APP_VERSION = '2.8.0';", s); assert n == 1
open(p, 'w', encoding='utf-8').write(s)
sw = open(swp).read(); sw, n = re.subn(r"const VERSION = 'mkc-[\d.]+';", "const VERSION = 'mkc-2.8.0';", sw); assert n == 1; open(swp, 'w').write(sw)
print('applied: 2.8.0')
