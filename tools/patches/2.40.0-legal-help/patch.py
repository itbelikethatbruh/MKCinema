#!/usr/bin/env python3
"""2.40.0 Legal pages + troubleshooting guide.
- terms.html (new): what MKCinema is, no hosted content, user responsibilities, open source, copyright concerns, no warranty.
- privacy.html: watch parties/voice, desktop and Android extras, fonts/CDNs, more services, your choices, link to terms.
  Keeps the '<li>Two small relays run by MKCinema on Supabase.' anchor the 2.39.0 patch uses, so either can run first.
- index.html: in-app reader for both pages (Settings > About & licenses > Legal), Troubleshooting guide (Settings > Help,
  command palette, #help), a 'Why no streams?' link on the empty source list, and a terms line under Create account.
Usage: python3 -I patch.py <webroot>   (default /mnt/project-files/mkcinema). Idempotent: re-running changes nothing."""
import sys, re, json, pathlib
HERE = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
VER = '2.40.0'
vt = lambda v: tuple(int(x) for x in v.split('.'))

ix = root / 'index.html'; s = ix.read_text(encoding='utf-8'); o = s

def rep(old, new, mark):
    global s
    if mark in s: return
    assert s.count(old) == 1, ('anchor', old[:90], s.count(old))
    s = s.replace(old, new, 1)

CSS = """.lg-doc h2{font:600 calc(17px * var(--ts,1))/1.3 var(--f-head,inherit);margin:26px 0 6px;color:var(--ink)}
.lg-doc p,.lg-doc li{color:var(--mute);line-height:1.6}.lg-doc b{color:var(--ink)}
.lg-doc ul{padding-left:20px;margin:6px 0}.lg-doc li{margin:4px 0}
.lg-doc .card{border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:12px 0;color:var(--ink);line-height:1.6}
.lg-doc .sub{margin:4px 0 12px}
.lg-doc a{color:var(--ink);text-underline-offset:3px}
.lg-doc [tabindex="0"]:focus-visible{outline:2px solid var(--ink);outline-offset:4px;border-radius:6px}
.lg-foot{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px;padding-top:16px;border-top:1px solid var(--line)}
.ts-search{display:flex;align-items:center;gap:10px;margin:4px 0 10px}.ts-search .lucide{width:18px;height:18px;flex:none;opacity:.7}.ts-search .inp{flex:1;min-width:0}
.ts-item{border-bottom:1px solid var(--line)}.ts-item[hidden]{display:none}
.ts-item summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:22px minmax(0,1fr) 18px;align-items:center;gap:12px;padding:14px 4px;border-radius:10px}
.ts-item summary::-webkit-details-marker{display:none}
.ts-item summary b{font-weight:600;color:var(--ink)}
.ts-ic{width:20px;height:20px;opacity:.75}
.ts-item[open] .lic-chev{transform:rotate(180deg)}
.ts-body{padding:0 4px 16px 38px}
.ts-body ol{margin:0;padding-left:18px}.ts-body li{margin:6px 0;color:var(--mute);line-height:1.55}.ts-body li b{color:var(--ink)}
.ts-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.ts-still{margin-top:20px;padding:16px 18px;border:1px solid var(--line);border-radius:14px}.ts-still p{color:var(--mute);margin:6px 0 0;line-height:1.55}
.ts-hl{box-shadow:0 0 0 2px var(--ink);border-radius:12px}
.acct-legal{margin:10px 0 0;font-size:calc(12.5px * var(--ts,1));color:var(--mute);line-height:1.5}.acct-legal .linkish{font-size:inherit}
.empty .linkish{margin-left:4px}
@media (max-width:560px){.ts-body{padding-left:4px}}
"""
rep("#toasts{position:fixed;", CSS + "#toasts{position:fixed;", ".ts-item summary{")

# the module, in its own script block before the analytics block
JS = (HERE / 'module.js').read_text(encoding='utf-8')
if '<script id="mkc-240l">' not in s:
    a = '<script id="mkc-cfwa">'
    assert s.count(a) == 1, 'cfwa anchor'
    s = s.replace(a, '<script id="mkc-240l">\n' + JS + '\n</script>\n' + a, 1)

# film page: the empty source list says why and links the guide
rep("No streams for this filter. Install more stream addons from the addon manager.</div>",
    "No streams for this filter. Install more stream addons from the addon manager.<button type=\"button\" class=\"linkish\" data-nav data-trouble=\"nostreams\">Why no streams?</button></div>",
    'data-trouble="nostreams"')

# sign-in card: agreeing to the terms when creating an account
rep("""${this.signupOff ? '' : `<button class="btn btn-ghost" type="button" id="acc-up">Create account</button>`}</div>""",
    """${this.signupOff ? '' : `<button class="btn btn-ghost" type="button" id="acc-up">Create account</button>`}</div>
      ${this.signupOff ? '' : `<p class="acct-legal">Creating an account means you agree to the <button type="button" class="linkish" data-nav data-legal="terms">Terms of use</button> and the <button type="button" class="linkish" data-nav data-legal="privacy">Privacy policy</button>.</p>`}""",
    'class="acct-legal"')

# What's new
if "{ v: '%s'" % VER not in s:
    m = re.search(r"const RELEASES = \[\n", s); assert m, 'RELEASES'
    entry = ("  { v: '%s', date: '2026-11-06', items: [\n"
             "    ['new', 'Troubleshooting guide', 'Settings › Help now opens with quick fixes for no streams, buffering, sound, subtitles, addons, TV remotes and updates. Each fix has a button that takes you straight to the right setting.'],\n"
             "    ['new', 'Terms of use and privacy, inside the app', 'Read the privacy policy and the new terms of use in Settings › About & licenses, on any device, TVs included.'],\n"
             "  ] },\n") % VER
    s = s[:m.end()] + entry + s[m.end():]

cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
if vt(cur) < vt(VER): s = s.replace("const APP_VERSION = '%s';" % cur, "const APP_VERSION = '%s';" % VER, 1)
if s != o: ix.write_text(s, encoding='utf-8'); print('index.html changed')

sw = root / 'sw.js'; t = sw.read_text(); m = re.search(r"const VERSION = 'mkc-([\d.]+)';", t)
if m and vt(m.group(1)) < vt(VER): sw.write_text(t.replace(m.group(0), "const VERSION = 'mkc-%s';" % VER)); print('sw.js changed')
vj = root / 'version.json'; d = json.loads(vj.read_text())
if vt(d['web']) < vt(VER): d['web'] = VER; vj.write_text(json.dumps(d, indent=2) + '\n'); print('version.json changed')

# terms.html
tm = root / 'terms.html'; new = (HERE / 'terms.html').read_text(encoding='utf-8')
if not tm.exists() or tm.read_text(encoding='utf-8') != new: tm.write_text(new, encoding='utf-8'); print('terms.html written')

# privacy.html
pv = root / 'privacy.html'; t = pv.read_text(encoding='utf-8'); po = t
def prep(old, new, mark):
    global t
    if mark in t: return
    assert t.count(old) == 1, ('privacy anchor', old[:90])
    t = t.replace(old, new, 1)
t = re.sub(r'Last updated \d+ \w+ 2026\.', 'Last updated 6 November 2026.', t, count=1)
prep('LG webOS, Windows, Mac and Linux, which all load that web app.', 'LG webOS, Samsung, Windows, Mac and Linux, which all load that web app.', 'LG webOS, Samsung,')
prep('<h2>Visit counts</h2>', """<h2>Watch parties, phone remote and voice chat</h2>
<p>When you start or join a watch party, pair a phone as a remote, or use voice chat, the devices find each other through Supabase Realtime, which passes short messages along (play, pause, position, chat) and doesn't keep them. Where the network allows, the devices then talk to each other directly. To set up that direct link they ask public STUN servers run by Google and Cloudflare for their own internet address. As with any video call, the other people in the party can see your IP address. Voice is sent live between devices and never recorded or stored.</p>

<h2>Visit counts</h2>""", '<h2>Watch parties, phone remote and voice chat</h2>')
prep('<li>Services you connect yourself: Trakt, Simkl, AniList, MyAnimeList and MDBList.</li>',
     """<li>Services you connect yourself: Trakt, Simkl, AniList, MyAnimeList and MDBList, your own Plex or Jellyfin server, and a custom poster service such as Pictorium if you add its link.</li>
<li>Extra details when you use them: OMDb and RPDB scores if you add a key, Wikipedia and Wikidata for X-Ray, AniSkip, Jikan and arm.haglund.dev for anime episode matching, and Cloudflare's speed test server for <b>Test my connection</b>.</li>
<li>Fonts from Google Fonts and code libraries from cdnjs, jsDelivr and unpkg. Like any website, these servers see your IP address when they send the files.</li>""",
     'Fonts from Google Fonts and code libraries')
prep('<h2>New-episode notifications</h2>', """<h2>Extras in the computer and Android apps</h2>
<ul>
<li><b>Torrent engine</b> (Windows and Android apps, off by default). If you turn it on, your device joins BitTorrent swarms to fetch the file, and other people in each swarm can see your IP address.</li>
<li><b>Discord status</b> (Windows app, off by default). If you turn it on, the title you're watching is sent to the Discord app on your computer, which shows it on your profile.</li>
</ul>

<h2>New-episode notifications</h2>""", '<h2>Extras in the computer and Android apps</h2>')
prep('<h2>Children</h2>', """<h2>Your choices</h2>
<ul>
<li><b>See or move your data:</b> Settings › Data › Setup Cloner exports your library, addons and settings as one file or code.</li>
<li><b>Correct it:</b> change anything in the app; with Cloud sync on, your account updates within seconds.</li>
<li><b>Stop syncing:</b> turn off Cloud sync or key syncing, or sign out. Nothing new is uploaded after that.</li>
<li><b>Delete it:</b> see "Deleting your data" above.</li>
</ul>

<h2>Children</h2>""", '<h2>Your choices</h2>')
prep('<p>If this policy changes, the date at the top changes too.', '<p>The rules for using MKCinema are in the <a href="terms.html">terms of use</a>. If this policy changes, the date at the top changes too.', 'href="terms.html"')
if t != po: pv.write_text(t, encoding='utf-8'); print('privacy.html changed')
