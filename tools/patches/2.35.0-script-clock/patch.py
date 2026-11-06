#!/usr/bin/env python3
"""Web 2.35.0 Script clock (Drake, 2026-11-06: "Build all 10 now").
Ten features built on dialogue timing (see app.js header): any-release watch party, land on the same line,
Find a line, phone subtitles, Last time, Margins notes, Couch match, kids shows-per-day, scene links,
Never miss a line. Adds app.css + app.js to index.html, the phone side to remote.html, a What's new entry,
and bumps the version. Idempotent. Usage: python3 -I patch.py /mnt/project-files/mkcinema"""
import sys, re, json, pathlib
here = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
VER = '2.35.0'
newer = lambda a, b: tuple(map(int, a.split('.'))) > tuple(map(int, b.split('.')))

# ---------- index.html ----------
ix = root / 'index.html'; s = ix.read_text(encoding='utf-8')
css = (here / 'app.css').read_text(encoding='utf-8'); js = (here / 'app.js').read_text(encoding='utf-8')
s = re.sub(r'<style id="mkc-235css">.*?</style>\n', '', s, flags=re.S)
s = re.sub(r'<script id="mkc-235">.*?</script>\n', '', s, flags=re.S)
block = f'<style id="mkc-235css">\n{css}</style>\n<script id="mkc-235">\n\'use strict\';\n{js}</script>\n'
assert s.count('</body>') == 1
s = s.replace('</body>', block + '</body>', 1)
if "{ v: '2.35.0'" not in s:
    s = s.replace("const RELEASES = [\n", """const RELEASES = [
  { v: '2.35.0', date: '2026-11-06', items: [
    ['new', 'Watch party on any version', 'Friends can each use their own source, even a different release or frame rate. MKCinema lines everyone up by the dialogue, and you can nudge it by hand.'],
    ['new', 'Find a line', 'Type words someone says and play from that moment. In the player (More) or on a film’s page.'],
    ['new', 'Subtitles on your phone', 'Everyone reads their own language on their own phone, in step with the TV. Scan the code from the player’s More tab.'],
    ['new', 'Last time…', 'Back after a few days? The last lines before you stopped show first. Only what you already saw.'],
    ['new', 'Notes at the moment', 'Leave a note at a scene. It pops up for the rest of the house at that moment, and you can share your notes with friends as a link.'],
    ['new', 'Couch match', 'Can’t decide? Everyone swipes on their phone and the first title you all like plays on the TV. On the Your Picks row, or Settings › Devices.'],
    ['new', 'Shows per day for kids', 'A kids seat can have a daily limit. It stops at the end of an episode, never mid-scene, and a grown-up PIN allows one more.'],
    ['new', 'Share this moment', 'A link that opens your friend’s MKCinema at the same line, on whatever source they have.'],
    ['better', 'Same line on any source', 'Resume and automatic source switching land on the line you left, even when the new source is a different version.'],
    ['better', 'Never miss a line', 'After a pause, playback picks up at the start of the sentence that was being spoken.'],
  ] },
""", 1)
cur = re.search(r"const APP_VERSION = '([\d.]+)'", s).group(1)
if newer(VER, cur):
    s = s.replace(f"const APP_VERSION = '{cur}'", f"const APP_VERSION = '{VER}'")
    sw = root / 'sw.js'; t = sw.read_text(); sw.write_text(re.sub(r"const VERSION = 'mkc-[\d.]+'", f"const VERSION = 'mkc-{VER}'", t))
    vj = root / 'version.json'; j = json.loads(vj.read_text()); j['web'] = VER; vj.write_text(json.dumps(j, indent=2) + '\n')
ix.write_text(s, encoding='utf-8')

# ---------- remote.html ----------
rm = root / 'remote.html'; r = rm.read_text(encoding='utf-8')
rjs = (here / 'remote.js').read_text(encoding='utf-8')
r = re.sub(r'<style id="rm-235css">.*?</style>\n', '', r, flags=re.S)
r = re.sub(r'/\* ---------- 2\.35\.0 Subtitles on this phone ----------.*?(?=/\* ---------- Start ---------- \*/)', '', r, flags=re.S)
r = re.sub(r'<!-- 2\.35\.0 -->.*?<!-- /2\.35\.0 -->\n', '', r, flags=re.S)
RCSS = '''<style id="rm-235css">
/* 2.35.0 phone subtitles + couch match */
.sheet.ps{max-height:calc(100dvh - 36px);overflow-y:auto;overscroll-behavior:contain}
#psView{position:fixed;inset:0;z-index:40;background:#000;display:flex;flex-direction:column;padding:calc(var(--sat, 0px) + 14px) 18px calc(var(--sab) + 18px);opacity:0;transition:opacity .25s ease}
#psView.on{opacity:1}
.ps-top{display:flex;align-items:center;gap:10px}
.ps-top .grow{flex:1;min-width:0}
.ps-top b{display:block;font:600 15px/1.2 var(--f-display);color:#fff}
.ps-top small{display:block;color:var(--dim);font-size:12px;margin-top:2px}
#psText{--pss:1;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:20px 4px}
#psText p{margin:0;color:#fff;font:500 calc(26px * var(--pss)) /1.35 var(--f-body);text-wrap:balance}
#psText .ps-gap{color:rgba(255,255,255,.12)}
#psText .ps-wait{color:var(--dim);font-size:16px}
.ps-ctl{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.ps-ctl button{height:48px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:#fff;font:600 13px/1 var(--f-body)}
.cm-card{position:relative;border-radius:22px;overflow:hidden;background:#111;touch-action:pan-y;user-select:none;margin:4px auto 0;width:min(300px,72vw)}
.cm-art{aspect-ratio:2/3;background:#1a1a1d center/cover no-repeat}
.cm-meta{position:absolute;left:0;right:0;bottom:0;padding:44px 16px 14px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.92))}
.cm-meta b{display:block;color:#fff;font:600 18px/1.2 var(--f-display)}
.cm-meta small{display:block;color:rgba(255,255,255,.7);font-size:12.5px;margin-top:4px}
.cm-acts{display:flex;align-items:center;justify-content:center;gap:22px;margin:16px 0 4px}
.cm-b{width:64px;height:64px;border-radius:50%;border:1px solid var(--line);background:rgba(255,255,255,.05);color:#fff;display:grid;place-items:center;font:700 15px/1 var(--f-body)}
.cm-b.yes{background:#fff;color:#000;border-color:#fff}
.cm-n{color:var(--dim);font-size:13px}
</style>
'''
r = r.replace('</head>', RCSS + '</head>', 1)
# icons
if 'id="i-users"' not in r:
    r = r.replace('</defs>', '    <symbol id="i-users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></symbol>\n  </defs>', 1)
# controller button + menu items
BTN = '<!-- 2.35.0 --><button class="login" type="button" id="psBtn" hidden><svg class="i"><use href="#i-cc"/></svg><span class="grow"><b>Subtitles on this phone</b><small>Read your own language, in step with the TV</small></span><svg class="i"><use href="#i-right"/></svg></button><!-- /2.35.0 -->\n'
anchor = r.index('<button class="login" type="button" id="adBtn"')
r = r[:anchor] + BTN + r[anchor:]
MENU = '<!-- 2.35.0 --><button class="item" type="button" id="mSubs"><svg class="i"><use href="#i-cc"/></svg>Subtitles on this phone</button><button class="item" type="button" id="mMatch"><svg class="i"><use href="#i-users"/></svg>Couch match</button><!-- /2.35.0 -->\n'
anchor = r.index('<button class="item" type="button" id="mAddons">')
r = r[:anchor] + MENU + r[anchor:]
SHEETS = '''<!-- 2.35.0 --><div class="sheet ps" id="psub" role="dialog" aria-label="Subtitles on this phone">
  <div class="grab"></div>
  <h3>Subtitles on this phone</h3>
  <p class="kbnote">Pick a language. The lines show here, in step with the TV.</p>
  <div id="psList"></div>
</div>
<div class="sheet ps" id="cm" role="dialog" aria-label="Couch match">
  <div class="grab"></div>
  <h3>Couch match</h3>
  <p class="kbnote">Swipe right or tap Yes for what you’d watch tonight. The first title everyone likes plays on the TV.</p>
  <div id="cmBody"></div>
</div>
<div id="psView" hidden role="dialog" aria-label="Subtitles">
  <div class="ps-top"><span class="grow"><b id="psLang">Subtitles</b><small id="psHow"></small></span><button class="iconbtn" type="button" id="psLangBtn" aria-label="Change language"><svg class="i"><use href="#i-cc"/></svg></button><button class="iconbtn" type="button" id="psClose" aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button></div>
  <div id="psText"></div>
  <div class="ps-ctl"><button type="button" id="psSmall">A−</button><button type="button" id="psBig">A+</button><button type="button" id="psEarly">−0.5 s</button><button type="button" id="psLate">+0.5 s</button></div>
</div><!-- /2.35.0 -->
'''
anchor = r.index('<div class="toast" id="toast"')
r = r[:anchor] + SHEETS + r[anchor:]
# script, and the ~subs / ~match flags in the QR link
anchor = r.index('/* ---------- Start ---------- */')
r = r[:anchor] + rjs + '\n' + r[anchor:]
if "~(subs|match)" not in r:
    r = r.replace(".replace(/~addons$/i, () => { Ads.want = true; return ''; })", ".replace(/~addons$/i, () => { Ads.want = true; return ''; }).replace(/~(subs|match)$/i, (x, w) => { if (/subs/i.test(w)) PSub.want = true; else CM.want = true; return ''; })", 1)
    assert "~(subs|match)" in r
rm.write_text(r, encoding='utf-8')
print('ok', VER)
