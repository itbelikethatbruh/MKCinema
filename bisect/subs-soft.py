#!/usr/bin/env python3
"""2.95.8 softer subtitles: rounded boxes, Inter (modern) as the subtitle font, italic lines upright, and in the MKCinema
player (Android phones 1.17.15+, Windows 1.6.2+) the page draws text subtitles itself so they look the same as the web
player. python3 patch.py <APP_DIR>  (source form; then minify + csp-hash)"""
import sys, os
F = os.path.join(sys.argv[1], 'index.html'); s = open(F, encoding='utf-8').read()
MARK = '/* 2.95.8 softer subtitles */'
if MARK in s: print('already patched'); sys.exit()
R = [
# 1. Inter by default (Drake: "modern font"); people still on the old default move over once
("""subFont: 'sans', subOutline: true, subBold: false, subShadow: 'soft', subLook: """,
 """subFont: 'stream', subOutline: true, subBold: false, subShadow: 'soft', subLook: """),
("""    SUB_LOOKS.box = SUB_LOOKS.box || { subFont: 'sans', subColor: '#ffffff', subBg: 65,""",
 """    SUB_LOOKS.box = SUB_LOOKS.box || { subFont: 'stream', subColor: '#ffffff', subBg: 65,"""),
("""const CFG = Object.assign({}, CFG_DEFAULTS, """, None),  # handled below (insert after the line)
# 2. the MKCinema player: page draws text subtitles (picture and ASS subtitles stay with mpv)
("""    if ('tracks' in n) this.tracks(st.tracks || []);""",
 """    if ('tracks' in n) this.tracks(st.tracks || []);
    if ('tracks' in n || 'sid' in n) this.subDraw();"""),
("""    if (this.embed && ('stext' in n || 't' in n)) this.stext('stext' in n ? n.stext : undefined);
  },""",
 """    if ((this.embed || this._pageSubs) && ('stext' in n || 't' in n)) this.stext('stext' in n ? n.stext : undefined);
  },
  """ + MARK + """
  /* Phones and computers: text subtitles are drawn by the page (rounded box, the chosen font, like the web player) from the
     words mpv reports; mpv only hides its own drawing. Picture (PGS, DVD) and styled ASS subtitles stay with mpv. Apps
     before Android 1.17.15 / Windows 1.6.2 refuse "subdraw" and keep drawing everything themselves. */
  subDraw() {
    if (!this.active || this.embed || this._drawNo) return;
    const t = ((this.st && this.st.tracks) || []).find((x) => x.type === 'sub' && x.selected);
    const page = !!t && !/pgs|dvd|dvb|xsub|^ass$|^ssa$|arib|teletext/i.test(String(t.codec || ''));
    if (page === this._pageWant) return;
    this._pageWant = page;
    this.cmd('subdraw', page ? 'page' : 'mpv').then(() => { this._pageSubs = page; if (!page) this.subClear(); else this.stext(this.st.stext || ''); })
      .catch(() => { this._drawNo = true; this._pageSubs = false; this.subClear(); });
  },"""),
# 3. overlay size: TVs keep their size; phones and computers follow the screen like the web player (5% of the height)
("""el.hidden = !txt; el.style.fontSize = `${Math.round(3.4 * (Number(CFG.subSize) || 100)) / 100}vh`; el.classList.toggle('top', CFG.subPos === 'top'); }""",
 """el.hidden = !txt; this.subFit(el); }"""),
("""  /* the file's own tracks: audio for video.audioTracks, subtitles for the subtitle menu */""",
 """  subFit(el) {
    const k = (Number(CFG.subSize) || 100) / 100;
    el.style.fontSize = this.embed ? `${Math.round(3.4 * k * 100) / 100}vh` : `max(14px, calc(max(5vh, 2.4vw) * ${k}))`;
    el.classList.toggle('top', CFG.subPos === 'top'); el.classList.toggle('higher', CFG.subPos === 'higher');
  },
  /* the file's own tracks: audio for video.audioTracks, subtitles for the subtitle menu */"""),
("""      const el = this._sub; if (el) { el.style.fontSize = `${Math.round(3.4 * (Number(CFG.subSize) || 100)) / 100}vh`; el.classList.toggle('top', CFG.subPos === 'top'); }""",
 """      const el = this._sub; if (el) this.subFit(el);"""),
# 4. soft rounded boxes and upright italics everywhere the page draws subtitles
("""#player .mk-nv-sub>span{background:var(--sub-bg,transparent);padding:.04em .32em;border-radius:.12em;""",
 """#player .mk-nv-sub.higher{bottom:17vh}
#player .mk-nv-sub>span{background:var(--sub-bg,transparent);padding:.08em .5em;border-radius:.45em;"""),
("""#mkSubs i{font-style:italic}""", """#mkSubs i{font-style:normal}"""),
]
CSS_ROUND = [("padding:.04em .32em;border-radius:.12em;", "padding:.08em .5em;border-radius:.45em;", 2),
             ("font-weight:var(--sub-weight,400);padding:.05em .3em;-webkit-box-decoration-break:clone", "font-weight:var(--sub-weight,400);padding:.08em .5em;border-radius:.45em;-webkit-box-decoration-break:clone", 1),
             ("video::cue{", "video::cue(i){font-style:normal}video::cue{", None)]
for a, b in R:
    n = s.count(a)
    if n != 1: sys.exit(f'anchor found {n} times: {a[:90]!r}')
    if b is None:
        i = s.index(a); j = s.index('\n', i) + 1
        s = s[:j] + "/* 2.95.8: subtitles move to Inter (modern) once for people still on the old default font */\nif (!CFG.subSoft) { if (CFG.subFont === 'sans') CFG.subFont = 'stream'; CFG.subSoft = 1; }\n" + s[j:]
    else: s = s.replace(a, b)
for a, b, want in CSS_ROUND:
    n = s.count(a)
    if want is not None and n != want: sys.exit(f'css anchor {n} times (want {want}): {a!r}')
    if n == 0: sys.exit(f'css anchor missing: {a!r}')
    s = s.replace(a, b, 1) if want is None else s.replace(a, b)
open(F, 'w', encoding='utf-8').write(s)
print('patched', F)
