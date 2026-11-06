#!/usr/bin/env python3
"""2.26.1: tapping an in-progress title (Library > In progress, Continue watching) played the official trailer
when none of the user's sources could play in the browser yet. pickBest() fell back to a trailer stream, and
resume() / quickPlay() / next-episode played whatever pickBest returned. Now pickBest never picks a trailer, so
those paths open the title's page on that episode with the source list instead.
Idempotent. Usage: python3 patch.py /path/to/index.html"""
import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema/index.html'
s = open(p, encoding='utf-8').read()
MARK = '/* 2.26.1: never auto-pick a trailer */'
if MARK in s:
    print('already applied'); sys.exit(0)
old_b = "if (bingeGroup) { const m = streams.find((s) => s.behaviorHints?.bingeGroup === bingeGroup && ok(s) && (s._tel.webReady || s.ytId)); if (m) return m; }"
new_b = MARK + " if (bingeGroup) { const m = streams.find((s) => s.behaviorHints?.bingeGroup === bingeGroup && ok(s) && s._tel.webReady && !s._tel.isTrailer && !s.ytId); if (m) return m; }"
old_r = "return streams.find((s) => s._tel.webReady && !s._tel.isTrailer && ok(s)) || streams.find((s) => s._tel.webReady && !s._tel.isTrailer) || streams.find((s) => s._tel.webReady) || streams.find((s) => s.ytId) || null;"
new_r = "// a trailer is never a stand-in for the film: with no playable source the caller opens the source list instead\n    const film = (s) => s._tel.webReady && !s._tel.isTrailer && !s.ytId;\n    return streams.find((s) => film(s) && ok(s)) || streams.find(film) || null;"
old_n = "const list = P.ctx.streams.filter((s) => s._tel.webReady || s.ytId);"
new_n = "const list = P.ctx.streams.filter((s) => (s._tel.webReady && !s._tel.isTrailer && !s.ytId) || s === P.stream);"
for o, n in ((old_b, new_b), (old_r, new_r), (old_n, new_n)):
    c = s.count(o)
    if c != 1: sys.exit(f'anchor found {c} times: {o[:70]}')
    s = s.replace(o, n)
open(p, 'w', encoding='utf-8').write(s)
print('patched', p)
