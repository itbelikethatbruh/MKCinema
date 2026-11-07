#!/usr/bin/env python3
"""UI design system: one type scale, corner tokens, focus ring, icons, layouts, first-run cards and Early access badge.
Usage: python3 -I patch.py path/to/index.html   (idempotent: a second run changes nothing)
Apply LAST, after every other patch: it normalises font sizes, weights and corner radii in all <style> blocks,
so re-run it whenever another patch brings new CSS in.

What it does
  * <style> blocks: font sizes snapped to a 12-step scale, unloaded weights (550/620/650) to loaded ones,
    fixed corner radii rewritten as multiples of --r-s/--r-m/--r-l (same look by default, and the Corners
    setting now reaches every corner).
  * small markup fixes: cards are role="button", Reveal is keyboard-reachable, emoji become icons, the banner's
    genre line can shorten on phones, and the wordmark carries an Early access badge.
  * block.html (between mk-ds markers, re-inserted on every run) before </body>.
"""
import re, sys, pathlib

here = pathlib.Path(__file__).resolve().parent
p = pathlib.Path(sys.argv[1])
s = p.read_text(encoding='utf-8')
block = (here / 'block.html').read_text(encoding='utf-8').strip()

# ---------- 1. the runtime block ----------
s = re.sub(r'\n?<!-- mk-ds:start -->.*?<!-- mk-ds:end -->', '', s, flags=re.S)

# ---------- 2. markup ----------
def rep(old, new, label, count=1):
    global s
    if new in s:
        return
    n = s.count(old)
    assert n == count, f'{label}: expected {count}, found {n}'
    s = s.replace(old, new)

STAR = '<svg class="st-ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4l-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z"/></svg>'
CROSS = '<svg class="ds-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>'

# U8 cards and bookmarks are buttons for assistive tech; Space is handled in block.html
rep('tabindex="0" data-nav data-card data-id', 'tabindex="0" role="button" data-nav data-card data-id', 'card role')
rep('<div class="card wide bm" tabindex="0" data-nav', '<div class="card wide bm" tabindex="0" role="button" data-nav', 'bookmark role')
rep('<span class="reveal" data-reveal role="button" tabindex="-1">', '<span class="reveal" data-reveal role="button" tabindex="0" aria-label="Reveal episode">', 'reveal')
# U11 emoji used as UI become icons
rep('Tap <b>🎯 Sync here</b>', 'Tap <b>Sync here</b>', 'sync hint')
rep('title="This line is being spoken right now">🎯 Sync here</button>', f'title="This line is being spoken right now">{CROSS}Sync here</button>', 'sync button')
rep('title="Rotten Tomatoes critics">🍅 ', 'title="Rotten Tomatoes critics"><img class="crit-ic" src="rate/tomatoes.svg" alt="" width="14" height="14">', 'tomato')
rep('.pm-row.talk b::after{content:" 🎙"}', '.pm-row.talk b::after{content:""}', 'mic')
rep('<span class="badge-r ${rateTier(m.imdbRating)}"><i>★</i>', f'<span class="badge-r ${{rateTier(m.imdbRating)}}"><i>{STAR}</i>', 'badge star')
rep('<span class="rt ${rateTier(m.imdbRating)}">★ ', f'<span class="rt ${{rateTier(m.imdbRating)}}">{STAR} ', 'rt star', 2)
# U13 banner genres as separate spans, so phones can show only the first
G_OLD = "genresOf(m).slice(0, 3).map(esc).join(' · ')"
G_NEW = "(genresOf(m).length ? `<span class=\"hm-gs\">${genresOf(m).slice(0, 3).map((g, i) => `<span class=\"hm-g${i}\">${i ? ' · ' : ''}${esc(g)}</span>`).join('')}</span>` : '')"
if G_NEW not in s:
    i = s.index("$('#heroMeta').innerHTML = [")
    j = s.index('\n', i)
    line = s[i:j]
    assert line.count(G_OLD) == 1, 'hero genres'
    s = s[:i] + line.replace(G_OLD, G_NEW) + s[j:]
# F2 Early access badge rides with the wordmark; the brand's label says it for screen readers
rep('<div class="brand" role="img" aria-label="MKCinema"><svg class="mk"', '<div class="brand" role="img" aria-label="MKCinema, early access"><svg class="mk"', 'brand label')
rep('<span class="word">MK<em>Cinema</em></span></div>',
    '<span class="word">MK<em>Cinema</em><span class="ea-badge" aria-hidden="true">Early access</span></span><i class="ea-dot" aria-hidden="true"></i></div>', 'badge')

# ---------- 3. style blocks: type scale, weights, radii ----------
STEPS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32]

def snap(n):
    if n < 9 or n >= 34 or n in STEPS:
        return n
    best = None
    for st in STEPS:
        d = abs(st - n)
        if best is None or d < best[0] - 1e-9:
            best = (d, st)
        elif abs(d - best[0]) < 1e-9:
            # a tie: small text rounds up (readability), larger text rounds down (room)
            if n < 16:
                best = (d, max(best[1], st))
            else:
                best = (d, min(best[1], st))
    return best[1]

def fmt(x):
    return ('%g' % x)

def fix_size(m):
    n = float(m.group(1))
    return f'calc({fmt(snap(n))}px * var(--ts,1))'

BASES = (('--r-s', 8), ('--r-m', 10), ('--r-l', 18))

def radius_token(tok):
    m = re.fullmatch(r'(\d+(?:\.\d+)?)px', tok)
    if not m:
        return tok
    n = float(m.group(1))
    if n == 0 or n >= 99:
        return tok
    name, base = BASES[0] if n <= 8 else BASES[1] if n <= 13 else BASES[2]
    if n == base:
        return f'var({name})'
    return f'calc(var({name}) * {fmt(round(n / base, 4))})'

def fix_radius(m):
    prop, val, end = m.group(1), m.group(2), m.group(3)
    if 'var(' in val or '/' in val or 'calc(' in val:
        return m.group(0)
    imp = ''
    v = val.strip()
    if v.endswith('!important'):
        imp, v = '!important', v[:-10].strip()
    parts = v.split()
    new = ' '.join(radius_token(t) for t in parts)
    return f'{prop}:{new}{imp}{end}'

def fix_css(css):
    css = re.sub(r'calc\((\d+(?:\.\d+)?)px \* var\(--ts,1\)\)', fix_size, css)
    css = re.sub(r'(font-weight:\s*)550\b', r'\g<1>500', css)
    css = re.sub(r'(font-weight:\s*)6[25]0\b', r'\g<1>600', css)
    css = re.sub(r'(font:\s*)550(\s)', r'\g<1>500\2', css)
    css = re.sub(r'(font:\s*)6[25]0(\s)', r'\g<1>600\2', css)
    css = re.sub(r'(border(?:-(?:top|bottom)-(?:left|right))?-radius)\s*:\s*([^;}]+?)(\s*[;}])', fix_radius, css)
    return css

s = re.sub(r'(<style\b[^>]*>)(.*?)(</style>)', lambda m: m.group(1) + fix_css(m.group(2)) + m.group(3), s, flags=re.S)

# ---------- 4. insert the block ----------
i = s.rindex('</body>')
s = s[:i] + block + '\n' + s[i:]
p.write_text(s, encoding='utf-8')
print('patched', p)
