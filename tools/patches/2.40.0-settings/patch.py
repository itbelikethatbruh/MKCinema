#!/usr/bin/env python3
"""2.40.0 Settings, redesigned: search across every setting, tinted groups, large page titles, two-line explanations
with More, new switches, menus and sliders. Same sections, rows and behaviour.
Usage: python3 -I patch.py <webroot> [version]
Re-runnable: it strips its own blocks and writes them again. The What's new item joins an existing entry for the same
version (another thread may have added it first) or starts one. Version bumps only if lower."""
import sys, pathlib, re, json
here = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
VER = sys.argv[2] if len(sys.argv) > 2 else '2.40.0'
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8'); o = s

# 1. drop an earlier copy of this patch's blocks
s = re.sub(r'<style id="mkc-240setcss">.*?</style>\n', '', s, flags=re.S)
s = re.sub(r'<script id="mkc-240set">.*?</script>\n', '', s, flags=re.S)
# 2. write them at the end of the page, so they run after every module that adds a section
css = (here / 'style.css').read_text(encoding='utf-8'); js = (here / 'module.js').read_text(encoding='utf-8')
assert '</script>' not in js and '</style>' not in css
a = '</body>'
assert s.count(a) == 1, ('anchor', a, s.count(a))
s = s.replace(a, '<style id="mkc-240setcss">\n' + css + '</style>\n<script id="mkc-240set">\n' + js + '</script>\n' + a, 1)

# 3. What's new
TITLE = 'Settings, redesigned'
ITEM = "    ['better', '%s', 'Every Settings page has a fresh look: a search box that finds any option, clearer groups, larger titles, and shorter explanations with More when you want the detail. Nothing moved and nothing was removed.'],\n" % TITLE
if "'%s'" % TITLE not in s:
    m = re.search(r"  \{ v: '%s', date: '[^']*', items: \[\n" % re.escape(VER), s)
    if m: s = s[:m.end()] + ITEM + s[m.end():]
    else:
        a = 'const RELEASES = [\n'
        assert s.count(a) == 1
        s = s.replace(a, a + "  { v: '%s', date: '2026-11-06', items: [\n%s  ] },\n" % (VER, ITEM), 1)

def vt(v): return tuple(int(x) for x in v.split('.'))
m = re.search(r"const APP_VERSION = '([\d.]+)';", s)
if vt(m.group(1)) < vt(VER): s = s.replace(m.group(0), "const APP_VERSION = '%s';" % VER, 1)
if s != o: ix.write_text(s, encoding='utf-8'); print('index.html changed')
sw = root / 'sw.js'; t = sw.read_text(); m = re.search(r"const VERSION = 'mkc-([\d.]+)';", t)
if m and vt(m.group(1)) < vt(VER): sw.write_text(t.replace(m.group(0), "const VERSION = 'mkc-%s';" % VER)); print('sw.js changed')
vj = root / 'version.json'; d = json.loads(vj.read_text())
if vt(d['web']) < vt(VER): d['web'] = VER; vj.write_text(json.dumps(d, indent=2) + '\n'); print('version.json changed')

# 4. UI languages
TR = {
  'Search settings': {'pt': 'Buscar nas configurações', 'es': 'Buscar en ajustes', 'fr': 'Rechercher dans les réglages', 'de': 'Einstellungen durchsuchen', 'it': 'Cerca nelle impostazioni', 'hi': 'सेटिंग्स खोजें'},
  'No setting matches that.': {'pt': 'Nenhuma configuração corresponde.', 'es': 'Ningún ajuste coincide.', 'fr': 'Aucun réglage ne correspond.', 'de': 'Keine Einstellung passt.', 'it': 'Nessuna impostazione corrisponde.', 'hi': 'कोई सेटिंग मेल नहीं खाती।'},
  'Help and legal': {'pt': 'Ajuda e jurídico', 'es': 'Ayuda y legal', 'fr': 'Aide et mentions légales', 'de': 'Hilfe und Rechtliches', 'it': 'Aiuto e note legali', 'hi': 'मदद और कानूनी'},
  'Section': {'pt': 'Seção', 'es': 'Sección', 'fr': 'Section', 'de': 'Bereich', 'it': 'Sezione', 'hi': 'अनुभाग'},
  'Less': {'pt': 'Menos', 'es': 'Menos', 'fr': 'Moins', 'de': 'Weniger', 'it': 'Meno', 'hi': 'कम'},
  'Players, addons and your first sources': {'pt': 'Players, addons e suas primeiras fontes', 'es': 'Reproductores, addons y tus primeras fuentes', 'fr': 'Lecteurs, addons et vos premières sources', 'de': 'Player, Addons und deine ersten Quellen', 'it': 'Player, addon e le tue prime fonti', 'hi': 'प्लेयर, ऐडऑन और आपके पहले स्रोत'},
  TITLE: {'pt': 'Configurações redesenhadas', 'es': 'Ajustes rediseñados', 'fr': 'Réglages repensés', 'de': 'Einstellungen neu gestaltet', 'it': 'Impostazioni ridisegnate', 'hi': 'सेटिंग्स का नया रूप'},
  'Every Settings page has a fresh look: a search box that finds any option, clearer groups, larger titles, and shorter explanations with More when you want the detail. Nothing moved and nothing was removed.': {
    'pt': 'Todas as páginas de Configurações ganharam um visual novo: uma busca que encontra qualquer opção, grupos mais claros, títulos maiores e explicações mais curtas com Mais quando você quiser o detalhe. Nada mudou de lugar e nada foi removido.',
    'es': 'Todas las páginas de Ajustes tienen un aspecto nuevo: un buscador que encuentra cualquier opción, grupos más claros, títulos más grandes y explicaciones más cortas con Más cuando quieras el detalle. Nada se movió y nada se quitó.',
    'fr': 'Toutes les pages des Réglages ont un nouveau look : une recherche qui trouve n’importe quelle option, des groupes plus clairs, des titres plus grands et des explications plus courtes avec Plus quand vous voulez le détail. Rien n’a bougé, rien n’a été retiré.',
    'de': 'Jede Einstellungsseite sieht neu aus: eine Suche, die jede Option findet, klarere Gruppen, größere Titel und kürzere Erklärungen mit Mehr, wenn du die Details willst. Nichts wurde verschoben oder entfernt.',
    'it': 'Ogni pagina delle Impostazioni ha un aspetto nuovo: una ricerca che trova qualsiasi opzione, gruppi più chiari, titoli più grandi e spiegazioni più brevi con Altro quando vuoi i dettagli. Niente è stato spostato o rimosso.',
    'hi': 'हर सेटिंग्स पेज का नया रूप: कोई भी विकल्प ढूंढने वाला सर्च, साफ़ समूह, बड़े शीर्षक और छोटी व्याख्याएं, पूरी जानकारी के लिए More। कुछ भी हटाया या खिसकाया नहीं गया।'},
}
for lang in ['pt', 'es', 'fr', 'de', 'it', 'hi']:
    f = root / 'i18n' / ('%s.json' % lang)
    if not f.exists(): continue
    d = json.loads(f.read_text(encoding='utf-8')); n = 0
    for k, v in TR.items():
        if lang in v and k not in d['strings']: d['strings'][k] = v[lang]; n += 1
    if n: f.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')), encoding='utf-8'); print(f.name, 'changed')
