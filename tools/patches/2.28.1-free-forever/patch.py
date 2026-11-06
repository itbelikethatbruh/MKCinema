#!/usr/bin/env python3
"""MKCinema 2.28.1: the "Free forever" promise, everywhere in the app.

- Welcome tour: a "Free forever" line under the three pillars; the "Why MKCinema" price row and the
  "Coming from Stremio?" step say forever.
- Settings > Support: the intro, and a pledge block above the Ko-fi QR text. The rare thank-you prompt says
  donations never unlock anything.
- Settings > About: the same pledge block under the GPL note.
- What's new: a 2.28.1 entry at the top of RELEASES.
- i18n: es, pt, fr, de, it, hi strings (only added when missing).
- Version: 2.28.1 in APP_VERSION, sw.js and version.json, only when the build is lower.

Run:  python3 -I patch.py /path/to/mkcinema      Idempotent.
"""
import json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
VER = '2.28.1'
MARK = 'free-pledge'

T = 'Free forever'
B = 'MKCinema is free and always will be. No paid plan, no premium tier, no ads and nothing locked, now or later. Every feature is for everyone.'
K = 'Donations on Ko-fi are optional and never unlock anything.'
PLEDGE = f'<div class="free-pledge"><b>{T}</b><p>{B}</p><p>{K}</p></div>'

EDITS = [
    # welcome tour
    ("<b>${t}</b></div>`).join('')}</div>",
     "<b>${t}</b></div>`).join('')}</div>\n      <p class=\"tw-free\">Free forever. Nothing to pay, now or later.</p>"),
    ("'Free. No ads, no cookies'", "'Free forever. No ads, no cookies'"),
    ('All free. No plans, no ads.', 'All free, forever. No plans, no ads.'),
    # Settings > Support
    ("MKCinema is free, with no ads. It is made and kept online by Drake Christopher.",
     "MKCinema is free forever, with no ads and nothing locked. It is made and kept online by Drake Christopher."),
    ('<p>MKCinema is built and kept online by', PLEDGE + '\n        <p>MKCinema is built and kept online by'),
    ('and runs on donations. Thank you for keeping it alive.</small>',
     'and runs on donations, which never unlock anything: MKCinema stays free either way. Thank you for keeping it alive.</small>'),
    # Settings > About
    ('under the terms of that license.</p>', 'under the terms of that license.</p>\n    ' + PLEDGE),
    # What's new
    ("const RELEASES = [",
     "const RELEASES = [\n  { v: '2.28.1', date: '2026-11-06', items: [\n"
     "    ['new', 'Free forever', 'MKCinema will never charge for anything. No paid plan, no premium tier and nothing locked, now or later. Ko-fi donations stay optional and never unlock a feature. The promise is in Settings › About.'],\n"
     "  ] },"),
    # styles, next to the 2.28 fs-free style
    ('.fs-free{',
     '.free-pledge{margin:14px 0 4px;padding:14px 16px;border-radius:14px;border:1px solid color-mix(in srgb,var(--champ,var(--gold)) 45%,transparent);background:color-mix(in srgb,var(--champ,var(--gold)) 8%,transparent)}'
     '.free-pledge b{display:block;color:var(--champ,var(--gold));font-size:1.05em;letter-spacing:.02em;margin-bottom:6px}'
     '.free-pledge p{margin:0 0 6px;line-height:1.5}.free-pledge p:last-child{margin:0;opacity:.8}'
     '.tw-free{margin:18px 0 0;color:var(--champ,var(--gold));font-weight:600;letter-spacing:.02em;text-align:center}\n.fs-free{'),
]

TR = {
 'es': ['Gratis para siempre', 'MKCinema es gratis y siempre lo será. Sin plan de pago, sin nivel premium, sin anuncios y nada bloqueado, ni ahora ni después. Cada función es para todos.', 'Las donaciones en Ko-fi son opcionales y nunca desbloquean nada.', 'Gratis para siempre. Nada que pagar, ni ahora ni después.', 'Gratis para siempre. Sin anuncios ni cookies', 'Todo gratis, para siempre. Sin planes ni anuncios.', 'MKCinema es gratis para siempre, sin anuncios y sin nada bloqueado. Lo crea y lo mantiene en línea Drake Christopher.', 'MKCinema nunca cobrará por nada. Sin plan de pago, sin nivel premium y nada bloqueado, ni ahora ni después. Las donaciones en Ko-fi siguen siendo opcionales y nunca desbloquean ninguna función. La promesa está en Ajustes › Acerca de.'],
 'pt': ['Grátis para sempre', 'O MKCinema é grátis e sempre será. Sem plano pago, sem nível premium, sem anúncios e nada bloqueado, nem agora nem depois. Todos os recursos são para todos.', 'Doações no Ko-fi são opcionais e nunca desbloqueiam nada.', 'Grátis para sempre. Nada a pagar, nem agora nem depois.', 'Grátis para sempre. Sem anúncios, sem cookies', 'Tudo grátis, para sempre. Sem planos, sem anúncios.', 'O MKCinema é grátis para sempre, sem anúncios e sem nada bloqueado. É feito e mantido no ar por Drake Christopher.', 'O MKCinema nunca vai cobrar por nada. Sem plano pago, sem nível premium e nada bloqueado, nem agora nem depois. Doações no Ko-fi continuam opcionais e nunca desbloqueiam um recurso. A promessa está em Configurações › Sobre.'],
 'fr': ['Gratuit pour toujours', 'MKCinema est gratuit et le restera. Pas d’abonnement payant, pas d’offre premium, pas de publicité et rien de verrouillé, ni aujourd’hui ni demain. Chaque fonction est pour tout le monde.', 'Les dons sur Ko-fi sont facultatifs et ne débloquent jamais rien.', 'Gratuit pour toujours. Rien à payer, ni aujourd’hui ni demain.', 'Gratuit pour toujours. Sans pub, sans cookies', 'Tout est gratuit, pour toujours. Pas d’abonnement, pas de pub.', 'MKCinema est gratuit pour toujours, sans publicité et sans rien de verrouillé. Il est créé et maintenu en ligne par Drake Christopher.', 'MKCinema ne fera jamais rien payer. Pas d’abonnement payant, pas d’offre premium et rien de verrouillé, ni aujourd’hui ni demain. Les dons sur Ko-fi restent facultatifs et ne débloquent jamais une fonction. La promesse se trouve dans Réglages › À propos.'],
 'de': ['Für immer kostenlos', 'MKCinema ist kostenlos und bleibt es auch. Kein Bezahlplan, keine Premium-Stufe, keine Werbung und nichts gesperrt, weder jetzt noch später. Jede Funktion ist für alle da.', 'Spenden über Ko-fi sind freiwillig und schalten nie etwas frei.', 'Für immer kostenlos. Nichts zu bezahlen, weder jetzt noch später.', 'Für immer kostenlos. Ohne Werbung, ohne Cookies', 'Alles kostenlos, für immer. Keine Abos, keine Werbung.', 'MKCinema ist für immer kostenlos, ohne Werbung und ohne gesperrte Funktionen. Entwickelt und online gehalten von Drake Christopher.', 'MKCinema wird nie für irgendetwas Geld verlangen. Kein Bezahlplan, keine Premium-Stufe und nichts gesperrt, weder jetzt noch später. Spenden über Ko-fi bleiben freiwillig und schalten nie eine Funktion frei. Das Versprechen steht unter Einstellungen › Über.'],
 'it': ['Gratis per sempre', 'MKCinema è gratis e lo sarà sempre. Nessun piano a pagamento, nessun livello premium, niente pubblicità e niente bloccato, né ora né dopo. Ogni funzione è per tutti.', 'Le donazioni su Ko-fi sono facoltative e non sbloccano mai nulla.', 'Gratis per sempre. Niente da pagare, né ora né dopo.', 'Gratis per sempre. Niente pubblicità, niente cookie', 'Tutto gratis, per sempre. Niente piani, niente pubblicità.', 'MKCinema è gratis per sempre, senza pubblicità e senza nulla di bloccato. È creato e mantenuto online da Drake Christopher.', 'MKCinema non farà mai pagare nulla. Nessun piano a pagamento, nessun livello premium e niente bloccato, né ora né dopo. Le donazioni su Ko-fi restano facoltative e non sbloccano mai una funzione. La promessa è in Impostazioni › Info.'],
 'hi': ['हमेशा के लिए मुफ़्त', 'MKCinema मुफ़्त है और हमेशा रहेगा। कोई पेड प्लान नहीं, कोई प्रीमियम टियर नहीं, कोई विज्ञापन नहीं और कुछ भी लॉक नहीं, न अभी, न बाद में। हर फ़ीचर सबके लिए है।', 'Ko-fi पर दान वैकल्पिक है और इससे कभी कुछ अनलॉक नहीं होता।', 'हमेशा के लिए मुफ़्त। कुछ भी चुकाना नहीं, न अभी, न बाद में।', 'हमेशा के लिए मुफ़्त। न विज्ञापन, न कुकीज़', 'सब कुछ मुफ़्त, हमेशा के लिए। न प्लान, न विज्ञापन।', 'MKCinema हमेशा के लिए मुफ़्त है, बिना विज्ञापन और बिना किसी लॉक के। इसे Drake Christopher बनाते और ऑनलाइन रखते हैं।', 'MKCinema कभी किसी चीज़ के पैसे नहीं लेगा। कोई पेड प्लान नहीं, कोई प्रीमियम टियर नहीं और कुछ भी लॉक नहीं, न अभी, न बाद में। Ko-fi दान वैकल्पिक रहेंगे और कभी कोई फ़ीचर अनलॉक नहीं करेंगे। यह वादा सेटिंग्स › About में है।'],
}
EN = [T, B, K, 'Free forever. Nothing to pay, now or later.', 'Free forever. No ads, no cookies', 'All free, forever. No plans, no ads.',
      'MKCinema is free forever, with no ads and nothing locked. It is made and kept online by Drake Christopher.',
      'MKCinema will never charge for anything. No paid plan, no premium tier and nothing locked, now or later. Ko-fi donations stay optional and never unlock a feature. The promise is in Settings › About.']


def newer(a, b):
    return tuple(int(x) for x in a.split('.')) > tuple(int(x) for x in b.split('.'))


def index(root):
    p = os.path.join(root, 'index.html'); s = open(p, encoding='utf-8').read()
    if MARK in s:
        print('index.html: 2.28.1 already applied')
    else:
        for old, new in EDITS:
            assert s.count(old) == 1, f'anchor not found once: {old[:60]}'
            s = s.replace(old, new)
        print('index.html: pledge added')
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    if newer(VER, cur):
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';"); print(f'APP_VERSION {cur} -> {VER}')
    open(p, 'w', encoding='utf-8').write(s)


def i18n(root):
    added = 0
    for code, vals in TR.items():
        jp = os.path.join(root, 'i18n', f'{code}.json')
        if not os.path.exists(jp):
            continue
        d = json.load(open(jp, encoding='utf-8'))
        for k, v in zip(EN, vals):
            if k not in d['strings']:
                d['strings'][k] = v; added += 1
        json.dump(d, open(jp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'i18n: {added} strings added')


def versions(root):
    sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
    cur = re.search(r"const VERSION = 'mkc-([\d.]+)';", w).group(1)
    if newer(VER, cur):
        w = w.replace(f"const VERSION = 'mkc-{cur}';", f"const VERSION = 'mkc-{VER}';")
    open(sp, 'w', encoding='utf-8').write(w)
    vp = os.path.join(root, 'version.json'); v = json.load(open(vp, encoding='utf-8'))
    if newer(VER, v.get('web', '0.0.0')):
        v['web'] = VER
    json.dump(v, open(vp, 'w', encoding='utf-8'))
    print('version.json:', v)


if __name__ == '__main__':
    root = sys.argv[1]
    assert all(len(v) == len(EN) for v in TR.values())
    index(root); i18n(root); versions(root)
