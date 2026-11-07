#!/usr/bin/env python3
"""2.46 Checked sources: background checks of backup sources, verified switching, a hard stop instead of looping.
Usage: python3 patch.py path/to/index.html   (idempotent; re-run after other patches move blocks)"""
import re, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
p = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema/index.html')
s = p.read_text(encoding='utf-8')
block = (here / 'preflight.js').read_text(encoding='utf-8').strip()
s = re.sub(r'\n?<script id="mkc-preflight">.*?</script>', '', s, flags=re.S)
i = s.rindex('</body>')
s = s[:i] + block + '\n' + s[i:]
# What's new: one line under the version being shipped
ver = re.search(r"APP_VERSION = '([^']+)'", s).group(1)
item = "    ['better', 'Sources that just play', 'While a film starts, MKCinema checks the next sources in the background. If one fails it switches straight to a source that works, and it stops with a clear message instead of trying forever.'],\n"
if 'Sources that just play' not in s:
    m = re.search(r"const RELEASES = \[\n  \{ v: '([^']+)', date: '[^']+', items: \[\n", s)
    if m and m.group(1) == ver:
        s = s[:m.end()] + item + s[m.end():]
    else:
        at = s.index('const RELEASES = [\n') + len('const RELEASES = [\n')
        s = s[:at] + f"  {{ v: '{ver}', date: '2026-11-07', items: [\n{item}  ] }},\n" + s[at:]
p.write_text(s, encoding='utf-8')
print('patched', p, 'version', ver)
