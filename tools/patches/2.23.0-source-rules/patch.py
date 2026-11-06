"""MKCinema 2.23.0: two new Source rules, across every addon.

- Smallest file (CFG.srMinGB): hides tiny files (often fakes). Episodes use a quarter of it. Unknown sizes stay.
  Dropped first, with the other limits, when the rules would leave nothing.
- Preferred audio language (CFG.srAudio): matching sources score +150 (MULTi/Dual +60), so they sort first
  and Smart Play picks them; the Audio language filter (CFG.audioOnly) never hides them.

Run once on a 2.22.x build:  python3 -I patch.py /path/to/mkcinema
"""
import json, os, re, sys

VER = '2.23.0'


def newer(a, b):
    return tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))


def rep(s, a, b):
    assert s.count(a) == 1, a[:80]
    return s.replace(a, b)


LANG_OPTS = ("[['', 'No preference'], ['eng', 'English'], ['spa', 'Spanish'], ['fre', 'French'], ['ger', 'German'], ['ita', 'Italian'], "
             "['por', 'Portuguese'], ['hin', 'Hindi'], ['tam', 'Tamil'], ['tel', 'Telugu'], ['jpn', 'Japanese'], ['kor', 'Korean'], "
             "['rus', 'Russian'], ['ara', 'Arabic'], ['pol', 'Polish'], ['tur', 'Turkish']]")

MIN_HELP = 'Hides very small files, which are often fakes or poor quality. Episodes use a quarter of this. Files that list no size stay.'
AUD_HELP = ('Sources in this language move to the top, so Smart Play picks them first, and the Audio language setting never hides them. '
            'MULTi and Dual Audio releases move up a little.')
BLURB = 'Size, quality, audio language, no cam copies, debrid order'

TR = {
    'es': {'Smallest file': 'Archivo más pequeño', 'Preferred audio language': 'Idioma de audio preferido', BLURB: 'Tamaño, calidad, idioma de audio, sin copias de cine, orden de debrid',
           MIN_HELP: 'Oculta archivos muy pequeños, que a menudo son falsos o de mala calidad. Los episodios usan una cuarta parte. Los archivos sin tamaño indicado se mantienen.',
           AUD_HELP: 'Las fuentes en este idioma suben al principio, así Smart Play las elige primero, y el ajuste Idioma de audio nunca las oculta. Las versiones MULTi y Dual Audio suben un poco.',
           'Hindi': 'Hindi', 'Tamil': 'Tamil', 'Telugu': 'Telugu'},
    'pt': {'Smallest file': 'Menor arquivo', 'Preferred audio language': 'Idioma de áudio preferido', BLURB: 'Tamanho, qualidade, idioma do áudio, sem cópias de cinema, ordem do debrid',
           MIN_HELP: 'Oculta arquivos muito pequenos, que muitas vezes são falsos ou de baixa qualidade. Episódios usam um quarto disso. Arquivos sem tamanho informado continuam.',
           AUD_HELP: 'Fontes neste idioma vão para o topo, então o Smart Play as escolhe primeiro, e o ajuste Idioma do áudio nunca as oculta. Versões MULTi e Dual Audio sobem um pouco.',
           'Hindi': 'Hindi', 'Tamil': 'Tâmil', 'Telugu': 'Telugo'},
    'fr': {'Smallest file': 'Fichier le plus petit', 'Preferred audio language': 'Langue audio préférée', BLURB: 'Taille, qualité, langue audio, sans copies caméra, ordre debrid',
           MIN_HELP: 'Masque les fichiers très petits, souvent faux ou de mauvaise qualité. Les épisodes utilisent un quart de cette valeur. Les fichiers sans taille indiquée restent.',
           AUD_HELP: 'Les sources dans cette langue passent en tête, Smart Play les choisit donc en premier, et le réglage Langue audio ne les masque jamais. Les versions MULTi et Dual Audio montent un peu.',
           'Hindi': 'Hindi', 'Tamil': 'Tamoul', 'Telugu': 'Télougou'},
    'de': {'Smallest file': 'Kleinste Datei', 'Preferred audio language': 'Bevorzugte Audiosprache', BLURB: 'Größe, Qualität, Audiosprache, keine Kinomitschnitte, Debrid-Reihenfolge',
           MIN_HELP: 'Blendet sehr kleine Dateien aus, die oft Fälschungen oder von schlechter Qualität sind. Episoden nutzen ein Viertel davon. Dateien ohne Größenangabe bleiben.',
           AUD_HELP: 'Quellen in dieser Sprache rücken nach oben, Smart Play wählt sie also zuerst, und die Einstellung Audiosprache blendet sie nie aus. MULTi- und Dual-Audio-Versionen rücken etwas nach oben.',
           'Hindi': 'Hindi', 'Tamil': 'Tamil', 'Telugu': 'Telugu'},
    'it': {'Smallest file': 'File più piccolo', 'Preferred audio language': 'Lingua audio preferita', BLURB: 'Dimensione, qualità, lingua audio, niente copie cam, ordine debrid',
           MIN_HELP: 'Nasconde i file molto piccoli, spesso falsi o di bassa qualità. Gli episodi usano un quarto di questo valore. I file senza dimensione indicata restano.',
           AUD_HELP: 'Le fonti in questa lingua salgono in cima, così Smart Play le sceglie per prime, e l’impostazione Lingua audio non le nasconde mai. Le versioni MULTi e Dual Audio salgono un po’.',
           'Hindi': 'Hindi', 'Tamil': 'Tamil', 'Telugu': 'Telugu'},
    'hi': {'Smallest file': 'सबसे छोटी फ़ाइल', 'Preferred audio language': 'पसंदीदा ऑडियो भाषा', BLURB: 'आकार, क्वालिटी, ऑडियो भाषा, कैम कॉपी नहीं, डेब्रिड क्रम',
           MIN_HELP: 'बहुत छोटी फ़ाइलें छिपाता है, जो अक्सर नकली या ख़राब क्वालिटी की होती हैं। एपिसोड के लिए इसका एक चौथाई लगता है। जिन फ़ाइलों का आकार नहीं लिखा, वे दिखती रहती हैं।',
           AUD_HELP: 'इस भाषा के सोर्स सबसे ऊपर आते हैं, इसलिए Smart Play उन्हें पहले चुनता है, और ऑडियो भाषा सेटिंग उन्हें कभी नहीं छिपाती। MULTi और Dual Audio रिलीज़ थोड़ा ऊपर आती हैं।',
           'Hindi': 'हिंदी', 'Tamil': 'तमिल', 'Telugu': 'तेलुगु'},
}


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    assert 'srMinGB' not in s, 'already applied'
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)

    # Audio language filter never hides the preferred language
    s = rep(s, "    return !langs.size || langs.has(want) || multi;\n",
            "    return !langs.size || langs.has(want) || multi || (!!CFG.srAudio && CFG.srAudio !== 'any' && langs.has(CFG.srAudio));\n")

    # Smallest file: episodes use a quarter, unknown sizes stay, loose mode drops it
    s = rep(s, "    const min = loose ? 0 : this.RES[CFG.srMinRes] || 0;",
            "    const mgb = loose ? 0 : Number(CFG.srMinGB) || 0; if (mgb && t.sizeBytes && t.sizeBytes < mgb * (this.isEpisode() ? 0.25 : 1) * 1073741824) return false;\n"
            "    const min = loose ? 0 : this.RES[CFG.srMinRes] || 0;")
    s = rep(s, "  words() { return String(CFG.srWords || '')",
            "  isEpisode() { try { const m = (!$('#detail').hidden && D.meta) || (P.ctx && P.ctx.meta) || D.meta; return !!m && m.type === 'series'; } catch (e) { return false; } },\n"
            "  // 2.23.0 preferred audio language: +150 for a match (untagged counts as English), +60 for MULTi or Dual Audio\n"
            "  audioBonus(s, t) {\n"
            "    const want = CFG.srAudio; if (!want || want === 'any' || !t || t.isTrailer || t.kind === 'yt') return 0;\n"
            "    const { langs, multi } = AudioPref.langs(s);\n"
            "    if (langs.has(want) || (want === 'eng' && !langs.size)) return 150;\n"
            "    return multi ? 60 : 0;\n"
            "  },\n"
            "  words() { return String(CFG.srWords || '')")
    s = rep(s, "Telemetry.parse = function (s) { const t = parse(s); if (CFG.srHdr === 'prefer' && t.hdr) t.score += 60; return t; };",
            "Telemetry.parse = function (s) { const t = parse(s); if (CFG.srHdr === 'prefer' && t.hdr) t.score += 60; try { t.score += SourceRules.audioBonus(s, t); } catch (e) { /* no title open */ } return t; };")

    # Settings rows
    s = rep(s, "      { key: 'srHdr', label: 'HDR and Dolby Vision',",
            f"      {{ key: 'srMinGB', label: 'Smallest file', help: '{MIN_HELP}', type: 'select', options: [['', 'No limit'], ['0.2', '200 MB'], ['0.5', '500 MB'], ['1', '1 GB'], ['2', '2 GB'], ['4', '4 GB']] }},\n"
            f"      {{ key: 'srAudio', label: 'Preferred audio language', help: '{AUD_HELP}', type: 'select', options: {LANG_OPTS} }},\n"
            "      { key: 'srHdr', label: 'HDR and Dolby Vision',")
    s = rep(s, "SET_BLURB.rules = 'Size, quality, no cam copies, debrid order';", f"SET_BLURB.rules = '{BLURB}';")

    bump = newer(VER, cur)
    if bump:
        s = s.replace(f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
    open(p, 'w', encoding='utf-8').write(s)

    for code, add in TR.items():
        jp = os.path.join(root, 'i18n', f'{code}.json')
        d = json.load(open(jp, encoding='utf-8'))
        for k, v in add.items():
            d['strings'].setdefault(k, v)
        json.dump(d, open(jp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

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
