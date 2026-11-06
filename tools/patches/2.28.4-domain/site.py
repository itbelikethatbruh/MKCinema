#!/usr/bin/env python3
"""2.28.4 site: everything points at mkcinema.app / app.mkcinema.app / tv.mkcinema.app; the old pages.dev site and www move
browsers to https://mkcinema.app. Idempotent. Usage: python3 -I site.py /mnt/project-files/mkcinema-site /mnt/project-files/mkctv-site"""
import sys, os
site = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema-site'
tv = sys.argv[2] if len(sys.argv) > 2 else '/mnt/project-files/mkctv-site'
p = os.path.join(site, 'index.html'); s = open(p, encoding='utf-8').read()
s = s.replace('Every app is MKCinema itself, opening mkcinema.pages.dev in its own window', 'Every app is MKCinema itself, opening the MKCinema web app in its own window')
s = s.replace('<a class="u" href="https://mkcinema.pages.dev/">mkcinema.pages.dev</a>', '<a class="u" href="https://app.mkcinema.app/">app.mkcinema.app</a>')
s = s.replace("location.hostname === 'mkcinema-site.pages.dev') { var s = document.createElement", "/^(mkcinema\\.app|mkcinema-site\\.pages\\.dev)$/.test(location.hostname)) { var s = document.createElement")
s = s.replace('https://mkcinema.pages.dev/', 'https://app.mkcinema.app/')
s = s.replace('mkctv.pages.dev', 'tv.mkcinema.app')
s = s.replace('https://mkcinema-site.pages.dev/', 'https://mkcinema.app/')
MOVE = """<link rel="canonical" href="https://mkcinema.app/">
<script id="mkc-home">/* the site lives at mkcinema.app; the old address and www send browsers there, keeping the #section */
(function () { var h = location.hostname; if (h === 'mkcinema-site.pages.dev' || h === 'www.mkcinema.app') location.replace('https://mkcinema.app' + location.pathname + location.search + location.hash); })();</script>
"""
if 'id="mkc-home"' not in s:
    j = s.index('\n', s.index('name="viewport"')) + 1
    s = s[:j] + MOVE + s[j:]
open(p, 'w', encoding='utf-8').write(s)
m = os.path.join(site, 'download', 'com.mkcinema.app.manifest.json')
if os.path.exists(m):
    t = open(m).read().replace('https://mkcinema-site.pages.dev/download/', 'https://mkcinema.app/download/'); open(m, 'w').write(t)
h = os.path.join(tv, 'help.html'); t = open(h, encoding='utf-8').read()
t = t.replace("location.hostname === 'mkctv.pages.dev')", "/^(tv\\.mkcinema\\.app|mkctv\\.pages\\.dev)$/.test(location.hostname))")
t = t.replace('mkctv.pages.dev', 'tv.mkcinema.app').replace('mkcinema-site.pages.dev', 'mkcinema.app')
t = t.replace("/^(tv\\.mkcinema\\.app|tv\\.mkcinema\\.app)$/", "/^(tv\\.mkcinema\\.app|mkctv\\.pages\\.dev)$/")
open(h, 'w', encoding='utf-8').write(t)
print('ok')
