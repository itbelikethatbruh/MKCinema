# MKCinema 2.7.7: "Audio language" filter. Sources whose release info names only other dub languages
# (Torrentio flags, ITA/FRENCH/LATINO/HINDI tags...) are hidden, so Smart Play and auto-switch never pick them.
# Untagged and MULTi/Dual releases stay. Usage: python3 2.7.7-english-audio.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)

# 025-config: default English
rep("""  hideP2P: false, browserOnly: false, showTrailers: true,""", """  hideP2P: false, browserOnly: false, audioOnly: 'eng', showTrailers: true,""")

# 05-app: language detection + filter
rep("""function visibleStreams(streams) {
  return streams.filter((s) => !(CFG.hideP2P && s._tel.kind === 'p2p') && !(!CFG.showTrailers && s._tel.isTrailer) && (!CFG.browserOnly || BrowserPlay.ok(s)));""",
"""/* Audio language: a release that only names other languages (Torrentio's flags, ITA, FRENCH, LATINO, HINDI…) is a dub.
   Untagged releases are usually the original English audio, and MULTi or Dual releases keep the original track, so both stay. */
const AudioPref = {
  FLAG: { GB: 'eng', US: 'eng', IT: 'ita', FR: 'fre', ES: 'spa', MX: 'spa', DE: 'ger', RU: 'rus', PT: 'por', BR: 'por', KR: 'kor', JP: 'jpn', CN: 'chi', TW: 'chi', HK: 'chi', IN: 'hin', NL: 'dut', PL: 'pol', CZ: 'cze', HU: 'hun', TR: 'tur', UA: 'ukr', SA: 'ara', TH: 'tha', BG: 'bul', HR: 'hrv', GR: 'gre', SE: 'swe', DK: 'dan', NO: 'nor', FI: 'fin', RO: 'rum', IL: 'heb', VN: 'vie', ID: 'ind' },
  WORD: [[/\\b(eng|english)\\b/, 'eng'], [/\\b(ita|italian|italiano)\\b/, 'ita'], [/\\b(french|truefrench|vff|vfq|vfi|vf2?)\\b/, 'fre'], [/\\b(spa|spanish|castellano|espanol|esp|lat|latino)\\b/, 'spa'],
    [/\\b(ger|german|deutsch)\\b/, 'ger'], [/\\b(rus|russian)\\b/, 'rus'], [/\\b(hin|hindi)\\b/, 'hin'], [/\\b(tam|tamil)\\b/, 'tam'], [/\\b(tel|telugu)\\b/, 'tel'], [/\\b(kor|korean)\\b/, 'kor'],
    [/\\b(jpn|japanese)\\b/, 'jpn'], [/\\b(por|portuguese|dublado)\\b/, 'por'], [/\\b(polish|lektor)\\b/, 'pol'], [/\\b(turkish)\\b/, 'tur'], [/\\b(arabic)\\b/, 'ara']],
  langs(s) {
    const bh = s.behaviorHints || {}, text = [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' ');
    const out = new Set(), T = text.toLowerCase().replace(/[._\\-\\[\\]()+/|]/g, ' ');
    for (const m of text.matchAll(/([\\u{1F1E6}-\\u{1F1FF}])([\\u{1F1E6}-\\u{1F1FF}])/gu)) { const cc = String.fromCharCode(m[1].codePointAt(0) - 0x1F1E6 + 65, m[2].codePointAt(0) - 0x1F1E6 + 65); out.add(this.FLAG[cc] || cc.toLowerCase()); }
    if (/🇬🇧|🏴/u.test(text)) out.add('eng');
    this.WORD.forEach(([re, l]) => { if (re.test(T)) out.add(l); });
    return { langs: out, multi: /\\b(multi|multi audio|dual|dual audio)\\b/.test(T) };
  },
  ok(s) {
    const want = CFG.audioOnly; if (!want || want === 'any' || !s._tel || s._tel.isTrailer || s._tel.kind === 'yt') return true;
    const { langs, multi } = this.langs(s);
    return !langs.size || langs.has(want) || multi;
  },
};
function visibleStreams(streams) {
  return streams.filter((s) => !(CFG.hideP2P && s._tel.kind === 'p2p') && !(!CFG.showTrailers && s._tel.isTrailer) && (!CFG.browserOnly || BrowserPlay.ok(s)) && AudioPref.ok(s));""")

# 05-app: say how many were hidden
rep("""    ${st.errors.length ? `<div class="status-line" style="color:var(--bad)">""", """    ${(() => { const n = D.streams.filter((x) => !AudioPref.ok(x)).length; return n ? `<div class="status-line bo-line"><i data-lucide="languages"></i><span>${n} source${n === 1 ? '' : 's'} dubbed in other languages ${n === 1 ? 'is' : 'are'} hidden (only ${esc(langName(CFG.audioOnly))} audio). Change it in Settings › Playback.</span></div>` : ''; })()}
    ${st.errors.length ? `<div class="status-line" style="color:var(--bad)">""")

# 06-settings: the choice
rep("""    { key: 'failover', label: 'Switch sources automatically',""", """    { key: 'audioOnly', label: 'Audio language', help: 'Hides sources dubbed only in other languages, so Smart Play and auto-switch never pick them. Releases that name no language, or MULTi and Dual Audio releases, stay listed.', type: 'select', options: [['eng', 'English'], ['spa', 'Spanish'], ['fre', 'French'], ['ger', 'German'], ['ita', 'Italian'], ['por', 'Portuguese'], ['hin', 'Hindi'], ['any', 'Any language']] },
    { key: 'failover', label: 'Switch sources automatically',""")
open(p, 'w').write(s); print('patched')
