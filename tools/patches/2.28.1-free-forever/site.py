#!/usr/bin/env python3
"""Marketing site: the "Free forever" promise (hero chip, FAQ, a pledge band before Support, Support copy, footer).
Edits in place, never touches #compare. Run: python3 -I site.py /path/to/mkcinema-site   Idempotent."""
import os, sys

MARK = 'id="free-forever"'
SECTION = '''<section id="free-forever" style="padding-top:0">
  <div class="wrap">
    <div class="band rv">
      <div>
        <span class="eyebrow">Our promise</span>
        <h2>Free forever.<br><em>Nothing to pay, ever.</em></h2>
        <p class="lead">MKCinema will never charge for anything. There is no paid plan, no premium tier and no feature behind a paywall, and there never will be. What you get today stays free, and everything we add later is free too.</p>
        <p class="lead">Donations on Ko-fi are optional and never unlock anything. The code is open under GPL-3.0, so nobody can ever take the free version away.</p>
      </div>
      <ul class="vows">
        <li><svg><use href="#i-check"/></svg><span><b>No paid plan</b>Not now, not later</span></li>
        <li><svg><use href="#i-check"/></svg><span><b>Nothing locked</b>Every feature for everyone</span></li>
        <li><svg><use href="#i-check"/></svg><span><b>No ads</b>No cookies, no tracking profiles</span></li>
        <li><svg><use href="#i-check"/></svg><span><b>Donations unlock nothing</b>They only say thank you</span></li>
      </ul>
    </div>
  </div>
</section>
'''
CSS = ('.vows{list-style:none;margin:0;padding:0;display:grid;gap:12px}'
       '.vows li{display:flex;gap:14px;align-items:center;padding:16px 18px;border-radius:16px;background:#101012;box-shadow:inset 0 0 0 1px var(--line2)}'
       '.vows svg{width:22px;height:22px;color:var(--champ);flex:none}'
       '.vows span{font-size:14px;color:var(--mute)}.vows b{display:block;color:var(--ink);font:500 19px var(--serif);margin-bottom:2px}'
       '#free-forever .lead+.lead{margin-top:14px}\n')

EDITS = [
    ('<span><svg><use href="#i-check"/></svg>Free, no ads</span>', '<span><svg><use href="#i-check"/></svg>Free forever, no ads</span>'),
    ('<div class="a">Yes to both. Every feature is included, with no ads and no paid tier, and the code',
     '<div class="a">Yes to both, and it stays free forever: MKCinema will never charge for anything. Every feature is included, with no ads and no paid tier, and the code'),
    ('with an optional donation (card or PayPal).</div>', 'with an optional donation (card or PayPal). Donations never unlock anything.</div>'),
    ('<section id="support" style="padding-top:0">', SECTION + '\n<section id="support" style="padding-top:0">'),
    ('<h3 style="margin-top:14px">Keep MKCinema free</h3><p>MKCinema is made by Drake Christopher, with no ads and no paid tier.',
     '<h3 style="margin-top:14px">Keep MKCinema free</h3><p>MKCinema is made by Drake Christopher, with no ads and no paid tier, and it stays free forever. Donations are optional and never unlock anything.'),
    ('<p class="legal">© <span id="yr">2026</span> MKCinema · Open source', '<p class="legal">© <span id="yr">2026</span> MKCinema · Free forever · Open source'),
    ('.band h2{', CSS + '.band h2{'),
]

p = os.path.join(sys.argv[1], 'index.html'); s = open(p, encoding='utf-8').read()
if MARK in s:
    print('site: free-forever already applied')
else:
    for old, new in EDITS:
        assert s.count(old) == 1, f'anchor not found once: {old[:70]}'
        s = s.replace(old, new)
    open(p, 'w', encoding='utf-8').write(s)
    print('site: free-forever added')
