#!/usr/bin/env python3
"""2.39.0 Subtitles: one merged, ranked list across all subtitle add-ons, and a Translated track when your language is
missing (browser Translator first, MKCinema's translation service at subs.mkcinema.app elsewhere).
Usage: python3 -I patch.py <webroot>   (idempotent; version bump only if lower)"""
import sys, pathlib, re, json
here = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8'); o = s

def rep(old, new, mark):
    global s
    if mark in s: return
    assert s.count(old) == 1, ('anchor', old[:100], s.count(old))
    s = s.replace(old, new, 1)

# 1. SubTranslate: the whole 2.21 block is replaced (Translator first, then the translation service)
if 'const SubCloud = {' not in s:
    a = s.index('/* ---------------- Subtitle translation on the device ---------------- */\nconst SubTranslate = {')
    b = s.index('/* ---------------- Letterboxd import ---------------- */', a)
    s = s[:a] + (here / 'subtranslate.js').read_text(encoding='utf-8') + s[b:]

# 2. one list: merge the add-on results when they arrive, and offer a translated track when the list is complete
rep("    P.subs = P.subs.concat(subs.map((x) => ({ ...x, kind: 'url' })));\n",
    "    P.subs = SubRank.merge(P.subs.concat(subs.map((x) => ({ ...x, kind: 'url' }))), stream);\n",
    "P.subs = SubRank.merge(")
rep("  P.subsLoading = false; renderSubMenu(); autoPickSub();\n}",
    "  P.subsLoading = false; renderSubMenu(); autoPickSub(); SubAuto.offer();\n}",
    "autoPickSub(); SubAuto.offer();")
# 3. auto-pick the best-ranked subtitle in your language; a translated one gives way to a real one
rep("""function autoPickSub() {
  if (!CFG.subAuto || P.subUserChoice || P.curSub >= 0 || !CFG.subLang) return;
  const want = langName(CFG.subLang);
  const i = P.subs.findIndex((s) => langName(s.lang) === want);
  if (i >= 0) selectSub(i, { auto: true });
}""", """function autoPickSub() {
  const cur = P.subs && P.subs[P.curSub];
  if (!CFG.subAuto || P.subUserChoice || (P.curSub >= 0 && !(cur && cur._tr)) || !CFG.subLang || CFG.subLang === 'off') return;
  const i = SubRank.pick(P.subs);
  if (i >= 0) selectSub(i, { auto: true }); else SubAuto.offer();
}""", "const i = SubRank.pick(P.subs);")
# 4. the menu uses the same order
rep("  const byLang = P.subs.map((s, i) => [s, i]).sort((a, b) => (langName(a[0].lang) === langName(CFG.subLang) ? -1 : 0) - (langName(b[0].lang) === langName(CFG.subLang) ? -1 : 0) || subLabel(a[0]).localeCompare(subLabel(b[0])));\n",
    "  const byLang = SubRank.order(P.subs);\n",
    "const byLang = SubRank.order(P.subs);")
# translated entries get the languages icon
rep("<i data-lucide=\"${s.kind === 'file' ? 'file-text' : s.kind === 'url' ? 'captions' : 'film'}\"></i>${esc(subLabel(s))}</button>",
    "<i data-lucide=\"${s._tr ? 'languages' : s.kind === 'file' ? 'file-text' : s.kind === 'url' ? 'captions' : 'film'}\"></i>${esc(subLabel(s))}</button>",
    "${s._tr ? 'languages' : s.kind === 'file'")

# 5. the new module, before mkc-cfwa
if 'id="mkc-239s"' not in s:
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1
    s = s.replace(a, '<script id="mkc-239s">\n' + (here / 'module.js').read_text(encoding='utf-8') + '</script>\n' + a, 1)

# 6. What's new + version
VER = '2.39.0'
if "{ v: '%s'" % VER not in s:
    a = 'const RELEASES = [\n'
    assert s.count(a) == 1
    s = s.replace(a, a + """  { v: '%s', date: '2026-11-06', items: [
    ['new', 'Subtitles in your language', 'No subtitles in your language? MKCinema now translates the best one it finds, line by line as you watch, and marks it Translated in the subtitle menu. Turn it off in Settings \\u203a Subtitles.'],
    ['better', 'One tidy subtitle list', 'Subtitles from all your add-ons now arrive as one list without repeats. The ones made for your exact file come first, then the closest release.'],
  ] },
""" % VER, 1)
def vt(v): return tuple(int(x) for x in v.split('.'))
m = re.search(r"const APP_VERSION = '([\d.]+)';", s)
if vt(m.group(1)) < vt(VER): s = s.replace(m.group(0), "const APP_VERSION = '%s';" % VER, 1)
if s != o: ix.write_text(s, encoding='utf-8'); print('index.html changed')

sw = root / 'sw.js'; t = sw.read_text(); m = re.search(r"const VERSION = 'mkc-([\d.]+)';", t)
if m and vt(m.group(1)) < vt(VER): sw.write_text(t.replace(m.group(0), "const VERSION = 'mkc-%s';" % VER)); print('sw.js changed')
vj = root / 'version.json'; d = json.loads(vj.read_text())
if vt(d['web']) < vt(VER): d['web'] = VER; vj.write_text(json.dumps(d, indent=2) + '\n'); print('version.json changed')

# 7. privacy page: the translation service
pv = root / 'privacy.html'
if pv.exists():
    t = pv.read_text(encoding='utf-8')
    if 'subs.mkcinema.app' not in t:
        a = '<li>Two small relays run by MKCinema on Supabase.'
        assert t.count(a) == 1
        t = t.replace(a, '<li>Subtitle translation. When no subtitle exists in your language and your browser has no built-in translator, the subtitle lines (and nothing else) are sent to MKCinema’s translation service at subs.mkcinema.app, which runs on Cloudflare Workers AI. Translations are cached by their text so the same file is not translated twice; nothing about you is stored. Turn it off in <b>Settings › Subtitles</b>.</li>\n' + a, 1)
        pv.write_text(t, encoding='utf-8'); print('privacy.html changed')

# 8. UI languages
TR = {
  'Translate when your language is missing': {'pt': 'Traduzir quando faltar o seu idioma', 'es': 'Traducir cuando falte tu idioma', 'fr': 'Traduire quand votre langue manque', 'de': 'Übersetzen, wenn Ihre Sprache fehlt', 'it': 'Traduci quando manca la tua lingua', 'hi': 'जब आपकी भाषा न हो तो अनुवाद करें'},
  'When no subtitle exists in your language, MKCinema translates the best one it finds and marks it Translated. It uses your browser’s built-in translator when it has one; otherwise the lines are translated by MKCinema’s translation service.': {
    'pt': 'Quando não existe legenda no seu idioma, o MKCinema traduz a melhor que encontrar e a marca como Traduzida. Usa o tradutor do seu navegador quando houver; caso contrário, as falas são traduzidas pelo serviço de tradução do MKCinema.',
    'es': 'Cuando no hay subtítulos en tu idioma, MKCinema traduce los mejores que encuentra y los marca como Traducidos. Usa el traductor de tu navegador si lo tiene; si no, las líneas las traduce el servicio de traducción de MKCinema.',
    'fr': 'Quand aucun sous-titre n’existe dans votre langue, MKCinema traduit le meilleur qu’il trouve et le marque Traduit. Il utilise le traducteur intégré de votre navigateur s’il en a un ; sinon, les répliques sont traduites par le service de traduction de MKCinema.',
    'de': 'Wenn es keine Untertitel in Ihrer Sprache gibt, übersetzt MKCinema die besten gefundenen und markiert sie als Übersetzt. Dafür wird der eingebaute Übersetzer Ihres Browsers genutzt, sonst der Übersetzungsdienst von MKCinema.',
    'it': 'Quando non esistono sottotitoli nella tua lingua, MKCinema traduce i migliori che trova e li segna come Tradotti. Usa il traduttore integrato del browser quando c’è; altrimenti le battute vengono tradotte dal servizio di traduzione di MKCinema.',
    'hi': 'जब आपकी भाषा में कोई सबटाइटल नहीं होता, तो MKCinema सबसे अच्छा सबटाइटल अनुवाद करता है और उसे अनूदित लिखता है। आपके ब्राउज़र में अनुवादक हो तो वही इस्तेमाल होता है, वरना MKCinema की अनुवाद सेवा।'},
  'Stop translating': {'pt': 'Parar de traduzir', 'es': 'Dejar de traducir', 'fr': 'Arrêter la traduction', 'de': 'Übersetzen beenden', 'it': 'Interrompi traduzione', 'hi': 'अनुवाद बंद करें'},
}
for lang in ['pt', 'es', 'fr', 'de', 'it', 'hi']:
    f = root / 'i18n' / ('%s.json' % lang)
    if not f.exists(): continue
    d = json.loads(f.read_text(encoding='utf-8')); n = 0
    for k, v in TR.items():
        if lang in v and k not in d['strings']: d['strings'][k] = v[lang]; n += 1
    if n: f.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')), encoding='utf-8'); print(f.name, 'changed')
