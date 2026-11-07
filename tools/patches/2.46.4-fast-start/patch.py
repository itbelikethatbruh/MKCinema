#!/usr/bin/env python3
"""2.46.4 Faster first screen: light first banner art, 1280 px TMDB banner art on phones, side art waits,
image-host preconnects, and the intro's animation library is fetched from the page head.
Usage: python3 patch.py path/to/index.html   (idempotent; apply after steady-web)"""
import re, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
p = pathlib.Path(sys.argv[1])
s = p.read_text(encoding='utf-8')
block = (here / 'block.html').read_text(encoding='utf-8').strip()
s = re.sub(r'\n?<!-- mk-fast:start -->.*?<!-- mk-fast:end -->', '', s, flags=re.S)
i = s.rindex('</body>'); s = s[:i] + block + '\n' + s[i:]
# head hints
HINT = '<!-- mk-fast-head -->'
if HINT not in s:
    anchor = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    assert s.count(anchor) == 1, 'font preconnect anchor'
    head = (HINT + '\n<link rel="preconnect" href="https://images.metahub.space">\n<link rel="preconnect" href="https://live.metahub.space">\n'
            '<script>(function(){try{var tv=/Android TV|AFT|BRAVIA|SMART-TV|SmartTV|Tizen|Web0S|webOS|GoogleTV|CrKey/i.test(navigator.userAgent);'
            'var c=JSON.parse(localStorage.getItem("mkc:cfg")||"{}")||{};if(!localStorage.getItem("mkc:introDaily")){localStorage.setItem("mkc:introDaily","1");if(c.introMode==="always"){c.introMode="daily";localStorage.setItem("mkc:cfg",JSON.stringify(c));if(window.__CFG0&&window.__CFG0.introMode==="always")window.__CFG0.introMode="daily";}}var m=c.introMode||"daily";'
            'var last=JSON.parse(localStorage.getItem("mkc:lastIntro")||"\\"\\"");'
            'if(tv||m==="never"||(m==="daily"&&last===new Date().toDateString())||c.reduceMotion||matchMedia("(prefers-reduced-motion: reduce)").matches)return;'
            'var l=document.createElement("link");l.rel="preload";l.as="script";l.href="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";'
            'l.integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt";l.crossOrigin="anonymous";document.head.appendChild(l);}catch(e){}})();</script>\n')
    s = s.replace(anchor, anchor + '\n' + head, 1)
# side-art warm-up waits for the first banner (steady-web block)
W_OLD = "    const warmSides = () => {\n      const n = S.hero.length; if (n < 2) return;"
W_NEW = "    const warmSides = () => {\n      if (window.MK_WARM_OK === false) { setTimeout(warmSides, 1500); return; }\n      const n = S.hero.length; if (n < 2) return;"
if W_NEW not in s:
    assert s.count(W_OLD) == 1, 'warmSides anchor'
    s = s.replace(W_OLD, W_NEW)
# intro plays once a day by default (Drake, 2026-11-07); the head script moves saved 'always' to 'daily' once
D_OLD = "  introMode: 'always', sfxVolume"
if D_OLD in s: s = s.replace(D_OLD, "  introMode: 'daily', sfxVolume")
p.write_text(s, encoding='utf-8')
print('patched', p)
