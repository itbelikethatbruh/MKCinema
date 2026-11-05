"""Marketing site: Ko-fi button beside PayPal, FAQ + footer mention.  python3 -I site.py /path/to/site/index.html"""
import sys

p = sys.argv[1]
s = open(p, encoding='utf-8').read()
assert 'ko-fi.com/mkcinema' not in s, 'already applied'


def rep(a, b):
    global s
    assert s.count(a) == 1, a[:60]
    s = s.replace(a, b)


rep('<symbol id="b-paypal"',
    '<symbol id="b-kofi" viewBox="0 0 24 24"><path fill="currentColor" d="M3 6.5h13.5v6.2a5.3 5.3 0 0 1-5.3 5.3H8.3A5.3 5.3 0 0 1 3 12.7z"/>'
    '<path fill="none" stroke="currentColor" stroke-width="2" d="M16.5 8h1.2a2.8 2.8 0 0 1 0 5.6h-1.6"/>'
    '<path fill="#ff5e5b" d="M9.75 9.2c.6-.9 2.4-.7 2.4.8 0 1.3-1.6 2.4-2.4 3-.8-.6-2.4-1.7-2.4-3 0-1.5 1.8-1.7 2.4-.8z"/></symbol>\n    <symbol id="b-paypal"')
rep("If it's become your favourite way to watch, a PayPal donation of any size keeps it growing.</p></div>\n"
    '      <a class="btn btn-plat" href="https://www.paypal.com/qrcodes/p2pqrc/W7NTDVZTZVQMU" target="_blank" rel="noopener"><svg><use href="#b-paypal"/></svg>Donate with PayPal</a>',
    "If it's become your favourite way to watch, a coffee on Ko-fi or a PayPal donation of any size keeps it growing.</p></div>\n"
    '      <div class="sup-btns"><a class="btn btn-plat" href="https://ko-fi.com/mkcinema" target="_blank" rel="noopener"><svg><use href="#b-kofi"/></svg>Support on Ko-fi</a>'
    '<a class="btn btn-ghost" href="https://www.paypal.com/qrcodes/p2pqrc/W7NTDVZTZVQMU" target="_blank" rel="noopener"><svg><use href="#b-paypal"/></svg>Donate with PayPal</a></div>')
rep('you can support development with an optional PayPal donation.',
    'you can support development on <a href="https://ko-fi.com/mkcinema" target="_blank" rel="noopener">Ko-fi</a> or with an optional PayPal donation.')
rep('<a href="#support">Donate</a>', '<a href="#support">Donate</a><a href="https://ko-fi.com/mkcinema" target="_blank" rel="noopener">Ko-fi</a>')
rep('</style>', '.sup-btns{display:flex;flex-wrap:wrap;gap:12px}\n@media (max-width:640px){.sup-btns{width:100%}}\n</style>')
open(p, 'w', encoding='utf-8').write(s)
print('site ok')
