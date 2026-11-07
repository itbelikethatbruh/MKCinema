#!/usr/bin/env python3
"""2.7.24: TV details page (and every other TV layer) scrolls fully back to the top.
Going Up to the top of a panel used scrollIntoView('nearest'), which stopped with the
close X cut off by the screen edge and the panel's top padding scrolled away.
Idempotent: safe to run on top of other 2.7.24+ patches. Usage: python3 this.py index.html"""
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
MARK = '/* 2.7.24 layer-top */'
if MARK in s:
    print('scroll fix already applied')
else:
    old_js = "    el.scrollIntoView({ block: rail ? 'center' : 'nearest', inline: 'nearest', behavior });\n  },"
    new_js = ("    // inside a panel (details, settings...), anything in its top part scrolls the panel all the way up, so the\n"
              "    // close button and the panel's top edge are never left cut off by the screen edge\n"
              "    const lay = !rail && el.closest('.layer-ov');\n"
              "    if (lay && lay.scrollTop > 0) { const y = el.getBoundingClientRect().bottom - lay.getBoundingClientRect().top + lay.scrollTop; if (y < lay.clientHeight * .7) { lay.scrollTo({ top: 0, behavior }); return; } }\n"
              + old_js)
    assert s.count(old_js) == 1, 'Nav.focus anchor not found'
    s = s.replace(old_js, new_js)
    old_css = "html.tv{scroll-padding-top:104px;scroll-padding-bottom:24px}\n"
    new_css = old_css + MARK + "\nhtml.tv .layer-ov{scroll-padding-block:40px 32px}\n"
    assert s.count(old_css) == 1, 'TV scroll-padding anchor not found'
    s = s.replace(old_css, new_css)
    open(p, 'w', encoding='utf-8').write(s); print('applied scroll fix')


# --- part 2: bigger TV top bar (Dee: Home/Movies/Series buttons too small on the TV) ---
s = open(p, encoding='utf-8').read()
MARK2 = '/* 2.7.24 tv-dock */'
if MARK2 not in s:
    anchor = "html.tv{scroll-padding-top:104px;scroll-padding-bottom:24px}\n"
    assert s.count(anchor) == 1
    css = (MARK2 + "\n"
           "html.tv{--dock-h:78px;scroll-padding-top:116px}\n"
           "html.tv .dock{gap:10px;padding-inline:14px 12px;border-radius:20px}\n"
           "html.tv .dock .brand .mk{width:46px;height:46px}\n"
           "html.tv .tabs{gap:4px;padding:9px 8px;margin:-9px 0}\n"
           "html.tv .tab{color:#d2d2d8;font-size:17.5px;font-weight:600;gap:9px;padding:12px 16px;border-radius:13px}\n"
           "html.tv .tab .lucide{width:22px;height:22px}\n"
           "html.tv .tab:not(.on) .lbl{display:inline}\n"
           "html.tv .dock-tools{gap:8px}\n"
           "html.tv .dock .ibtn,html.tv .dock .searchbtn{width:52px;height:52px;padding:0;border-radius:15px}\n"
           "html.tv .dock .ibtn .lucide,html.tv .dock .searchbtn .lucide{width:24px;height:24px}\n"
           "html.tv .dock .searchbtn .kbd,html.tv .dock .searchbtn>span{display:none}\n")
    s = s.replace(anchor, anchor + css)
    open(p, 'w', encoding='utf-8').write(s); print('applied tv dock')
