#!/usr/bin/env python3
"""Simpler player (2.46.2): no blue tap boxes, modern font in the player, menus that fit portrait and landscape,
audio options only when the source supports them, pop-ups over a full-screen player, quiet sync notice.
Re-runnable: replaces its own block if present, else inserts it before the last </body>.
Usage: python3 patch.py path/to/index.html"""
import re, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
target = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema/index.html')
html = target.read_text(encoding='utf-8')
block = (here / 'simple.html').read_text(encoding='utf-8').strip()
start, end = '<!-- mk-simpleplayer:start -->', '<!-- mk-simpleplayer:end -->'
wrapped = f'{start}\n{block}\n{end}\n'
if start in html:
    html = re.sub(re.escape(start) + r'.*?' + re.escape(end) + r'\n?', lambda m: wrapped, html, flags=re.S)
    print('mk-simpleplayer: replaced')
else:
    i = html.rfind('</body>')
    assert i > 0, 'no </body>'
    html = html[:i] + wrapped + html[i:]
    print('mk-simpleplayer: inserted')
target.write_text(html, encoding='utf-8')
