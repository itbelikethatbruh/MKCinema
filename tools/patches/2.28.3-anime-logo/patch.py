"""2.28.3: the small katakana line under the anime logo looked doubled on phones.
Cause: a CSS drop-shadow(6px 6px) on the whole logo svg. On a phone the logo is ~240 px wide, so the 8 px katakana got a
6 px dark copy almost a full letter away. Fix: the shadow moves inside the svg (feDropShadow in viewBox units, so it
scales with the logo), covers the shapes and MK CINEMA only, and the katakana gets a thin dark outline instead.
Usage: python3 patch.py <app dir>   (index.html, sw.js, version.json)"""
import sys, os, re
d = sys.argv[1]
p = os.path.join(d, 'index.html'); s = open(p, encoding='utf-8').read()
def rep(old, new, n=1):
    global s
    assert s.count(old) == n, (old[:80], s.count(old)); s = s.replace(old, new)
if 'anLsh' not in s:
    rep('transform:translateY(-50%) rotate(-4deg);filter:drop-shadow(6px 6px 0 rgba(20,8,24,.85))}',
        'transform:translateY(-50%) rotate(-4deg)}')
    rep('''  logo(cls = '') {
    return `<svg class="an-logo ${cls}" viewBox="0 0 440 130" role="img" aria-label="MKCinema">
      <path d="M8 96L60 18L432 6L388 92Z"''',
        '''  logo(cls = '') {
    /* 2.28.3: the big logo's shadow lives inside the svg (viewBox units, so it shrinks with the logo on phones) and
       skips the small katakana line, which a fixed 6 px CSS shadow used to double. */
    const sh = /\\bbig\\b/.test(cls) ? 'anLsh' + (this.lsh = (this.lsh || 0) + 1) : '';
    return `<svg class="an-logo ${cls}" viewBox="0 0 440 130" role="img" aria-label="MKCinema">${sh ? `<defs><filter id="${sh}" x="-5%" y="-5%" width="115%" height="125%"><feDropShadow dx="5" dy="5" stdDeviation="0" flood-color="#140818" flood-opacity=".85"/></filter></defs>` : ''}
      <g${sh ? ` filter="url(#${sh})"` : ''}><path d="M8 96L60 18L432 6L388 92Z"''')
    rep('''        <text x="226" y="70" class="s" fill="#140818">CINEMA</text><text x="222" y="66" class="s" fill="#fff">CINEMA</text>
      </g>
      <text x="384" y="116" class="k" text-anchor="end" fill="#ffd1df">エムケー・シネマ</text>
      <path d="M420 20l4 9l9 4l-9 4l-4 9l-4-9l-9-4l9-4Z" fill="#fff"/></svg>`;''',
        '''        <text x="226" y="70" class="s" fill="#140818">CINEMA</text><text x="222" y="66" class="s" fill="#fff">CINEMA</text>
      </g>
      <path d="M420 20l4 9l9 4l-9 4l-4 9l-4-9l-9-4l9-4Z" fill="#fff"/></g>
      <text x="384" y="116" class="k" text-anchor="end" fill="#ffd1df" stroke="#140818" stroke-width="3" stroke-linejoin="round" paint-order="stroke">エムケー・シネマ</text></svg>`;''')
    rep("const APP_VERSION = '2.28.2';", "const APP_VERSION = '2.28.3';")
    rep("const RELEASES = [\n", """const RELEASES = [
  { v: '2.28.3', date: '2026-11-06', items: [
    ['fixed', 'Clean anime logo on phones', 'The small Japanese line under the anime MK Cinema logo no longer looks doubled on phones.'],
  ] },
""")
    open(p, 'w', encoding='utf-8').write(s)
for f, a, b in [('sw.js', "mkc-2.28.2", "mkc-2.28.3"), ('version.json', '"web": "2.28.2"', '"web": "2.28.3"')]:
    q = os.path.join(d, f); t = open(q, encoding='utf-8').read()
    if a in t: open(q, 'w', encoding='utf-8').write(t.replace(a, b))
print('ok')
