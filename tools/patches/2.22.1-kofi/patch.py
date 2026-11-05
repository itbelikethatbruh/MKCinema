"""MKCinema 2.22.1: Ko-fi (https://ko-fi.com/mkcinema) next to PayPal in Settings > Support and the thank-you prompt.

Run once on a 2.22.x build:  python3 -I patch.py /path/to/mkcinema
"""
import os, re, sys

VER = '2.22.1'
KOFI = 'https://ko-fi.com/mkcinema'

CSS = """
.kf-badge{display:inline-flex;align-items:center;gap:9px;height:50px;padding:0 24px;border-radius:999px;background:#72a4f2;color:#fff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:16px;font-weight:700;box-shadow:inset 0 1px 0 rgba(255,255,255,.25);transition:transform .15s,filter .15s}
.kf-badge svg{width:24px;height:24px;flex:none}
.kf-badge.sm{height:38px;padding:0 15px;font-size:13.5px;gap:7px}.kf-badge.sm svg{width:19px;height:19px}
@media (hover:hover){.kf-badge:hover{filter:brightness(1.06);transform:translateY(-1px)}}
.kf-badge:active{transform:scale(.97)}
.sup .inrow{flex-wrap:wrap;gap:10px}
.sup-qr-cap{display:block;margin-top:4px;text-align:center;font-size:11px;font-weight:600;color:#333}
.pp-badge,.pp-word{white-space:nowrap}
.sup-ask .pp-word b{display:inline;font-size:inherit}
"""

# A coffee cup with a heart, drawn for this button (not Ko-fi's logo file)
CUP = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M3 6.5h13.5v6.2a5.3 5.3 0 0 1-5.3 5.3H8.3A5.3 5.3 0 0 1 3 12.7z"/>'
       '<path fill="none" stroke="#fff" stroke-width="2" d="M16.5 8h1.2a2.8 2.8 0 0 1 0 5.6h-1.6"/>'
       '<path fill="#ff5e5b" d="M9.75 9.2c.6-.9 2.4-.7 2.4.8 0 1.3-1.6 2.4-2.4 3-.8-.6-2.4-1.7-2.4-3 0-1.5 1.8-1.7 2.4-.8z"/></svg>')


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def rep(s, a, b):
    assert s.count(a) == 1, a[:70]
    return s.replace(a, b)


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    assert 'ko-fi.com/mkcinema' not in s, 'already applied'
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    s = rep(s, "const DONATE = { name: 'Drake Christopher', paypal: 'https://www.paypal.com/qrcodes/p2pqrc/W7NTDVZTZVQMU' };",
            f"const DONATE = {{ name: 'Drake Christopher', paypal: 'https://www.paypal.com/qrcodes/p2pqrc/W7NTDVZTZVQMU', kofi: '{KOFI}' }};\n"
            "// Ko-fi sits beside PayPal (cards, Apple Pay, Google Pay, PayPal; one-off or monthly)\n"
            f"const kfBadge = (small) => `<a class=\"kf-badge${{small ? ' sm' : ''}}\" href=\"${{esc(DONATE.kofi)}}\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"Support on Ko-fi\">{CUP}<span>Support on Ko-fi</span></a>`;")
    # both buttons wherever the PayPal one appears
    s = rep(s, '<div class="inrow">${ppBadge()}</div>', '<div class="inrow">${kfBadge()}${ppBadge()}</div>')
    s = rep(s, '<div class="inrow">${ppBadge(true)}', '<div class="inrow">${kfBadge(true)}${ppBadge(true)}')
    s = rep(s, '<div class="sup-qr">${QR.svg(DONATE.paypal)}</div>',
            '<div class="sup-qr">${QR.svg(DONATE.kofi)}<small class="sup-qr-cap">Scan for Ko-fi</small></div>')
    s = rep(s, "<small class=\"sup-note\">Opens PayPal’s own secure page, so MKCinema never sees your payment details.</small>",
            "<small class=\"sup-note\">Opens Ko-fi’s or PayPal’s own secure page, so MKCinema never sees your payment details.</small>")
    # a click on either button snoozes the prompt (it used to watch only the first link)
    s = rep(s, "$('a', t).addEventListener('click', () => {", "t.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {")
    s = rep(s, "at: Date.now() + 60 * 86400e3 }); setTimeout(close, 300); });",
            "at: Date.now() + 60 * 86400e3 }); setTimeout(close, 300); }));")
    a = '<script id="mkc-cfwa">'
    s = rep(s, a, f'<style id="mkc-2221css">{CSS}</style>\n{a}')
    bump = newer(VER, cur)
    if bump:
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
    open(p, 'w', encoding='utf-8').write(s)
    if bump:
        sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
        w2 = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{VER}';", w); assert w2 != w
        open(sp, 'w', encoding='utf-8').write(w2)
        vp = os.path.join(root, 'version.json'); v = open(vp, encoding='utf-8').read()
        v2 = re.sub(r'"web":\s*"[\d.]+"', f'"web": "{VER}"', v); assert v2 != v
        open(vp, 'w', encoding='utf-8').write(v2)
    print(f'{VER} applied to {root} (version {"set to " + VER if bump else "kept at " + cur})')


if __name__ == '__main__':
    main(sys.argv[1])
