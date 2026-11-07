"""Ko-fi only (Dee, 2026-11-05: Ko-fi already takes PayPal and cards). Run after patch.py / site.py.

python3 -I nopaypal.py app /path/to/mkcinema
python3 -I nopaypal.py site /path/to/site/index.html
python3 -I nopaypal.py repo /path/to/repo   (README.md, app/README.md, .github/FUNDING.yml)
"""
import os, sys

PP = 'https://www.paypal.com/qrcodes/p2pqrc/W7NTDVZTZVQMU'


def edit(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a[:70])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)


kind, target = sys.argv[1], sys.argv[2]
if kind == 'app':
    edit(os.path.join(target, 'index.html'), [
        ('<div class="inrow">${kfBadge()}${ppBadge()}</div>', '<div class="inrow">${kfBadge()}</div>'),
        ('<div class="inrow">${kfBadge(true)}${ppBadge(true)}', '<div class="inrow">${kfBadge(true)}'),
        ('Opens Ko-fi’s or PayPal’s own secure page, so MKCinema never sees your payment details.',
         'Opens Ko-fi’s own secure page (card or PayPal), so MKCinema never sees your payment details.'),
        ('// Ko-fi sits beside PayPal (cards, Apple Pay, Google Pay, PayPal; one-off or monthly)',
         '// Ko-fi is the one donation link (it takes cards and PayPal; one-off or monthly). ppBadge is kept but unused.'),
        ("   One PayPal link (it also takes cards).", "   One Ko-fi link (it takes cards and PayPal)."),
    ])
elif kind == 'site':
    edit(target, [
        ("a coffee on Ko-fi or a PayPal donation of any size keeps it growing.", "a coffee on Ko-fi of any size keeps it growing."),
        (f'<a class="btn btn-ghost" href="{PP}" target="_blank" rel="noopener"><svg><use href="#b-paypal"/></svg>Donate with PayPal</a>', ''),
        ('or with an optional PayPal donation.', 'with an optional donation (card or PayPal).'),
    ])
elif kind == 'repo':
    edit(os.path.join(target, '.github/FUNDING.yml'), [(f'custom: ["{PP}"]\n', '')])
    edit(os.path.join(target, 'README.md'), [
        ('\n  <a href="#support"><img alt="Donate with PayPal" src="https://img.shields.io/badge/donate-PayPal-d9d4c7?style=for-the-badge&labelColor=0a0a0b&logo=paypal&logoColor=white"></a>', ''),
        ('- **Donate** on Ko-fi (one-off or monthly) or PayPal to keep it growing.',
         '- **Donate** on Ko-fi, one-off or monthly, by card or PayPal, to keep it growing.'),
        (f' <a href="{PP}"><img alt="Donate with PayPal" src="https://img.shields.io/badge/Donate%20with%20PayPal-0a0a0b?style=for-the-badge&logo=paypal&logoColor=white"></a>', ''),
    ])
    edit(os.path.join(target, 'app/README.md'), [
        ('Settings › Support has a Ko-fi button and QR code (ko-fi.com/mkcinema) plus a PayPal button for donations to Dee Lavish.',
         'Settings › Support has a Ko-fi button and QR code (ko-fi.com/mkcinema) for donations to Dee Lavish, by card or PayPal.'),
        ('- **Support**: a "Support on Ko-fi" button in Ko-fi blue beside the "Donate with PayPal" button in PayPal\'s colours.',
         '- **Support**: a "Support on Ko-fi" button in Ko-fi blue.'),
    ])
print(kind, 'ok')
