#!/usr/bin/env python3
"""Builds the static guide pages under site/<slug>/index.html and site/sitemap.xml.
Run from the repo root: python3 tools/build-guides.py
Each page is plain HTML with one small inline stylesheet (same look as the home page), a canonical link,
Open Graph tags and BreadcrumbList data. Edit the PAGES list below, then re-run."""
import html, json, os, datetime

SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
ORIGIN = 'https://mkcinema.app'
TODAY = datetime.date.today().isoformat()

CSS = """
@font-face{font-family:"Fraunces";font-style:normal;font-weight:400 600;font-display:swap;src:url(/fonts/fraunces-v1.woff2) format("woff2")}
@font-face{font-family:"Fraunces";font-style:italic;font-weight:400 600;font-display:swap;src:url(/fonts/fraunces-italic-v1.woff2) format("woff2")}
@font-face{font-family:"Onest";font-style:normal;font-weight:400 600;font-display:swap;src:url(/fonts/onest-v1.woff2) format("woff2")}
:root{--bg:#050505;--card:#0f0f0f;--ink:#f3f0e9;--ink2:#c9c5bc;--mute:#8f8b84;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--gold:#d8c29a;--serif:"Fraunces",Georgia,serif;--sans:"Onest",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/1.65 var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:var(--gold)}img{display:block;max-width:100%;height:auto}
.wrap{max-width:860px;margin:0 auto;padding:0 clamp(16px,4vw,32px)}
.skip{position:absolute;left:12px;top:-60px;padding:10px 16px;border-radius:10px;background:var(--ink);color:#0a0a0a;font-weight:600;text-decoration:none}.skip:focus{top:12px}
header.bar{border-bottom:1px solid var(--line)}
.bar-in{display:flex;align-items:center;gap:18px;height:68px;max-width:1180px;margin:0 auto;padding:0 clamp(16px,4vw,32px)}
.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font:500 18px/1 var(--serif);letter-spacing:.02em}
.brand img{width:34px;height:34px}.brand b{font-weight:600}.brand i{font-style:normal;color:var(--ink2)}
.bar nav{margin-left:auto;display:flex;align-items:center;gap:20px}.bar nav a.t{color:var(--ink2);text-decoration:none;font-size:14px}.bar nav a.t:hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 22px;border-radius:999px;font:600 15px/1 var(--sans);text-decoration:none;white-space:nowrap}
.btn.plat{color:#0a0a0a;background:linear-gradient(180deg,#fbf9f4,#d9d5cc);box-shadow:inset 0 1px 0 #fff,0 10px 30px -10px rgba(216,194,154,.5)}
.btn.ghost{color:var(--ink);border:1px solid var(--line2);background:rgba(255,255,255,.03)}
.crumbs{font-size:13px;color:var(--mute);margin:40px 0 0}.crumbs a{color:var(--ink2);text-decoration:none}.crumbs a:hover{color:var(--ink)}
.eyebrow{margin-top:28px;font:600 11.5px/1 var(--sans);letter-spacing:.24em;text-transform:uppercase;color:var(--gold)}
h1,h2,h3{font-family:var(--serif);font-weight:400;letter-spacing:-.02em;margin:0}
h1{font-size:clamp(38px,6.4vw,66px);line-height:1.02;margin-top:14px}h1 em,h2 em{font-style:italic;color:var(--gold)}
h2{font-size:clamp(26px,3.6vw,36px);line-height:1.1;margin-top:56px}
h3{font-size:20px;margin-top:28px}
.lead{font-size:clamp(17px,1.8vw,20px);color:var(--ink2);margin-top:22px;max-width:62ch}
p{margin:16px 0 0;color:var(--ink2)}
ol,ul{margin:16px 0 0;padding-left:22px;color:var(--ink2);display:grid;gap:10px}
li b,p b{color:var(--ink);font-weight:600}
code{font:500 13.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(255,255,255,.07);padding:3px 7px;border-radius:6px;color:var(--ink)}
.shot{margin:34px 0 0;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:var(--card)}
.shot figcaption{padding:12px 18px;font-size:13px;color:var(--mute);border-top:1px solid var(--line)}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.note{margin-top:22px;padding:16px 20px;border:1px solid var(--line);border-radius:14px;background:var(--card);font-size:14.5px;color:var(--ink2)}
details{border:1px solid var(--line);border-radius:14px;background:#0a0a0a;margin-top:10px}
summary{cursor:pointer;list-style:none;padding:18px 22px;font-weight:500;color:var(--ink)}summary::-webkit-details-marker{display:none}
summary::after{content:"+";float:right;color:var(--gold);font-size:20px;line-height:1}details[open] summary::after{content:"\\2212"}
.det{padding:0 22px 20px;color:var(--ink2);font-size:15px}.det p{margin-top:0}
.more{display:grid;gap:10px;margin-top:18px}.more a{display:block;padding:16px 20px;border:1px solid var(--line);border-radius:14px;background:var(--card);text-decoration:none;color:var(--ink)}
.more a span{display:block;font-size:14px;color:var(--mute);margin-top:4px}.more a:hover{border-color:rgba(216,194,154,.5)}
footer{border-top:1px solid var(--line);margin-top:80px;padding:40px 0 calc(40px + env(safe-area-inset-bottom));font-size:13.5px;color:var(--mute)}
.foot{display:flex;flex-wrap:wrap;gap:8px 22px}.foot a{color:var(--ink2);text-decoration:none}.foot a:hover{color:var(--ink)}
.legal{margin-top:22px;font-size:12.5px;line-height:1.6;color:var(--mute)}
:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:6px}
@media(max-width:560px){.bar nav a.t{display:none}}
"""

GUIDES = [
    ('stremio-addons', 'Stremio addons'), ('fire-tv', 'Fire TV and Android TV'),
    ('iphone-ipad', 'iPhone and iPad'), ('mkv-in-browser', 'MKV in the browser'), ('skip-intro', 'Skip intro and credits'),
]

PAGES = [
 dict(
  slug='stremio-addons',
  title='Stremio addon player for phone, TV, Windows, Mac and Linux · MKCinema',
  desc='MKCinema is a free, open-source player for Stremio-compatible addons. Paste an addon link, bring your own debrid key, and watch on Android, TV, Windows, Mac, Linux, iPhone and the web.',
  crumb='Stremio addons',
  eyebrow='Works with your addons',
  h1='A free player for <em>Stremio addons</em>, on every screen.',
  lead='MKCinema speaks the Stremio addon protocol, so the addons you already use for catalogues, subtitles and streams work here. You get a player made for films, a seat for everyone in the house, and apps for phones, TVs and computers. It is free forever and open source.',
  img=('shots/home-960.webp', 960, 600, 'The MKCinema home screen with rows of films and shows', 'The MKCinema home screen.'),
  body="""
<h2>Add an addon in <em>three steps</em></h2>
<ol>
<li>Open the <b>Addons</b> page in MKCinema.</li>
<li>Paste the addon's link (it ends in <code>manifest.json</code>). MKCinema reads it and lists what it offers.</li>
<li>Open any film or show. Sources from your addons appear in the source list, and Smart Play picks the best one that works on your device.</li>
</ol>
<p>Each person brings their own addons and debrid key. MKCinema hosts no titles, channels or streams. The only built-in source is official trailers.</p>

<h2>Moving over from <em>Stremio</em></h2>
<p>Go to <b>Settings › Account › Import from Stremio</b>. Your library, progress and addons are copied over. Your Stremio password is used once to fetch them and is never stored.</p>

<h2>What you get on top of <em>the addons you have</em></h2>
<ul>
<li><b>Source failover.</b> If a source does not start in time, errors, or stalls, the next best one takes over at the same spot.</li>
<li><b>A real film player.</b> Keyboard and remote friendly, subtitle styling and sync, audio track menu, and styled anime subtitles.</li>
<li><b>Watch parties</b> with voice and cameras, and a phone that works as a remote.</li>
<li><b>Skip intro, recap and credits</b> where times are known. <a href="/skip-intro/">How skipping works</a>.</li>
<li><b>Your keys stay yours.</b> Debrid keys sync only to your own account row, and you can switch that off in Settings › Debrid.</li>
</ul>

<h2>Every <em>screen</em></h2>
<p>Android, Android TV, Google TV and Fire TV, Windows, Mac, Linux, LG webOS (beta), Samsung TV (beta), and any browser. On iPhone and iPad, open the web app and add it to your Home Screen.</p>
<div class="cta"><a class="btn plat" href="https://app.mkcinema.app/">Open MKCinema</a><a class="btn ghost" href="/#download">Download the app</a></div>
""",
  faq=[
   ('Do I need a Stremio account?', 'No. You can add addons by pasting their link. An account is only needed if you want to import your Stremio library.'),
   ('Does MKCinema include movies or shows?', 'No. It hosts nothing. Catalogues, subtitles and streams come from addons you choose to install, and you are responsible for what you watch.'),
   ('Is it really free?', 'Yes. Every feature is free, with no ads and no paid tier, and the code is public on GitHub under GPL-3.0.'),
   ('Which debrid services work?', 'The major debrid services work with your own key. Use whichever you prefer.'),
  ]),
 dict(
  slug='fire-tv',
  title='Install MKCinema on Fire TV, Fire Stick and Android TV · MKCinema',
  desc='How to install MKCinema on a Fire TV Stick, Android TV or Google TV: type one short address into the Downloader app. Free, with remote control support and a phone remote.',
  crumb='Fire TV and Android TV',
  eyebrow='Install guide',
  h1='Install MKCinema on <em>Fire TV</em> and Android TV.',
  lead='It takes a minute and needs no computer. You type one short address into the Downloader app on your TV.',
  img=('shots/tv-home-960.webp', 960, 540, 'MKCinema on a TV screen', 'MKCinema on a TV.'),
  body="""
<h2>Fire TV and Fire Stick, <em>step by step</em></h2>
<ol>
<li>Install the free <b>Downloader</b> app from the Amazon Appstore.</li>
<li>In Fire TV <b>Settings › My Fire TV › Developer options</b>, allow <b>Install unknown apps</b> for Downloader.</li>
<li>Open Downloader and type <code>tv.mkcinema.app</code> into the address box, then choose <b>Go</b>.</li>
<li>When the download finishes, choose <b>Install</b>, then <b>Open</b>.</li>
</ol>
<p>The menu names on Fire TV change a little between versions. If you cannot find Developer options, the setting for unknown apps is also reachable from the Downloader prompt.</p>

<h2>Android TV and <em>Google TV</em></h2>
<p>Use the same address in any browser or downloader app on the TV, or download the TV app from the <a href="/#download">download section</a> on another device and send it to the TV. Android may ask you to allow installs from the app you used. That is normal for apps installed outside a store.</p>

<h2>Using it with <em>the remote</em></h2>
<ul>
<li>The directional pad moves around the screen, and OK selects.</li>
<li>Back goes up one level.</li>
<li>Your phone can be the remote. Scan the code shown on the TV to pair it.</li>
<li>Sign in with email and password to bring your library, progress, addons and settings to the TV.</li>
</ul>

<h2>Other <em>TVs</em></h2>
<p>LG webOS and Samsung TV (2023 and newer, through TizenBrew) are available as betas. See the <a href="https://github.com/itbelikethatbruh/MKCinema">project page on GitHub</a> for the steps.</p>
<div class="cta"><a class="btn plat" href="/#download">See all downloads</a><a class="btn ghost" href="/stremio-addons/">Using addons</a></div>
""",
  faq=[
   ('Is the Fire TV app safe?', 'The app is MKCinema itself and its source is public on GitHub. It is signed with MKCinema\'s own key, and every download is listed with a SHA-256 checksum.'),
   ('Why does Fire TV warn me about unknown apps?', 'Fire TV shows that warning for any app that does not come from the Amazon Appstore. You allow it once for the Downloader app.'),
   ('Does it update itself?', 'The app loads the latest MKCinema every time it opens, so features arrive without reinstalling.'),
  ]),
 dict(
  slug='iphone-ipad',
  title='MKCinema on iPhone and iPad: add it to your Home Screen · MKCinema',
  desc='Use MKCinema on iPhone and iPad as a Home Screen web app. Open it in Safari, tap Share, then Add to Home Screen. Free, with the built-in player and watch parties.',
  crumb='iPhone and iPad',
  eyebrow='Install guide',
  h1='MKCinema on <em>iPhone</em> and iPad.',
  lead='There is no App Store download. MKCinema runs as a web app that you add to your Home Screen, and then it opens full screen like any other app.',
  img=('shots/phone-home-480.webp', 480, 1041, 'MKCinema on a phone', 'MKCinema on a phone.'),
  body="""
<h2>Add it to the <em>Home Screen</em></h2>
<ol>
<li>Open <code>app.mkcinema.app</code> in <b>Safari</b>.</li>
<li>Tap the <b>Share</b> button.</li>
<li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
</ol>
<p>Open it from the new icon. Sign in with email and password and your library, progress, addons and settings follow you from your other devices.</p>

<h2>What works <em>on iPhone</em></h2>
<ul>
<li>The built-in player, with most MKV files playing right in the browser.</li>
<li>Watch parties, and your phone as a remote for another screen.</li>
<li>Bigger words, posters and episode cards on phones, adjustable in Settings › Appearance › Text size.</li>
</ul>
<div class="note">Safari cannot decode every format. When a file will not play, MKCinema can hand it to a player app in one tap.</div>
<div class="cta"><a class="btn plat" href="https://app.mkcinema.app/">Open MKCinema</a><a class="btn ghost" href="/mkv-in-browser/">About MKV playback</a></div>
""",
  faq=[
   ('Is there an App Store app?', 'No. The web app on your Home Screen is how MKCinema runs on iPhone and iPad.'),
   ('Does it work on iPad?', 'Yes, the same way. Add it to the Home Screen from Safari.'),
   ('Will I lose my place if I switch devices?', 'Not if you sign in. Progress syncs across your devices.'),
  ]),
 dict(
  slug='mkv-in-browser',
  title='Play MKV files in the browser, with Dolby and DTS sound · MKCinema',
  desc='MKCinema plays most MKV files straight in the browser and converts Dolby and DTS audio to a format browsers can play. No plugins, free and open source.',
  crumb='MKV in the browser',
  eyebrow='How it works',
  h1='Play <em>MKV</em> files in the browser.',
  lead='Browsers do not normally play MKV files, and many films have Dolby or DTS sound that browsers drop without a warning. MKCinema deals with both inside the app.',
  img=('shots/player-960.webp', 960, 600, 'The MKCinema player', 'The MKCinema player.'),
  body="""
<h2>What happens <em>behind the scenes</em></h2>
<ul>
<li><b>MKV.</b> MKCinema repackages the file on your device as it plays, so the browser can play it. The picture is not re-encoded.</li>
<li><b>Dolby and DTS audio.</b> This sound is converted to AAC on your device so you hear it.</li>
<li><b>Subtitles and chapters.</b> The subtitle tracks, chapters and fonts inside the file are listed, and fetched without downloading the whole file.</li>
<li><b>HEVC (H.265) video.</b> On computers there is an optional software decoder, off by default.</li>
</ul>

<h2>When a file <em>still will not play</em></h2>
<p>Some files are too heavy or use formats a browser cannot handle. MKCinema then tries the next best source, and you can also open the stream in VLC in one tap. VLC plays nearly everything.</p>
<div class="cta"><a class="btn plat" href="https://app.mkcinema.app/">Open MKCinema</a><a class="btn ghost" href="/iphone-ipad/">iPhone and iPad</a></div>
""",
  faq=[
   ('Does it need a plugin or server?', 'No. The conversion happens in the app. A companion server is optional and adds more audio conversion for heavy files.'),
   ('Is the picture quality reduced?', 'No. Video is copied as it is, only the container and unsupported audio are converted.'),
   ('Why recommend VLC?', 'Browsers cannot decode every format. VLC can, and MKCinema hands a stream to it in one tap.'),
  ]),
 dict(
  slug='skip-intro',
  title='Skip intro, recap and credits automatically · MKCinema',
  desc='MKCinema can skip intros, recaps and credits for you, using chapters in the file, anime skip times and a community database. Free, open source, on every screen.',
  crumb='Skip intro and credits',
  eyebrow='Playback',
  h1='Skip <em>intros</em>, recaps and credits.',
  lead='MKCinema looks for the start and end of intros, recaps and credits and gives you a Skip button, or skips for you when you turn that on.',
  img=('shots/player-960.webp', 960, 600, 'The MKCinema player', 'The MKCinema player.'),
  body="""
<h2>Where the <em>times</em> come from</h2>
<ul>
<li><b>Chapters inside the file</b>, when the release has them.</li>
<li><b>Anime skip times</b> for anime that can be matched.</li>
<li><b>A community database</b> of intro, recap and credits times, looked up by show, season and episode.</li>
<li><b>Times your addons supply</b>, when an addon provides them.</li>
<li><b>Your own skips.</b> If you skip the same stretch on earlier episodes, MKCinema remembers it for that series.</li>
</ul>

<h2>How much is <em>covered</em></h2>
<p>We checked popular shows in November 2026. The community database had skip times for about two in three episodes, and a little under half had a known intro. Anime was better covered than other shows. Where no time is known, there is no button, because guessing wrongly is worse than not skipping.</p>

<h2>Settings</h2>
<p>Look in <b>Settings › Playback</b> for the skip options. Pressing Enter on a keyboard or A on a gamepad presses the Skip button while it shows.</p>
<div class="cta"><a class="btn plat" href="https://app.mkcinema.app/">Open MKCinema</a><a class="btn ghost" href="/stremio-addons/">Using addons</a></div>
""",
  faq=[
   ('Does it skip the waiting clip some debrid sources show?', 'Short waiting clips are not the film. Recent versions notice a source that sends only a short clip and move on to the next source.'),
   ('Can I turn it off?', 'Yes, in Settings › Playback.'),
   ('Does it work on the TV app?', 'The Android TV player (TV app 1.9 or newer) shows Skip intro, Skip recap and Next episode using the same times.'),
  ]),
]


def page(p):
    url = f'{ORIGIN}/{p["slug"]}/'
    t, d = html.escape(p['title']), html.escape(p['desc'])
    crumbs = {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'MKCinema', 'item': ORIGIN + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': p['crumb'], 'item': url}]}
    art = {'@context': 'https://schema.org', '@type': 'Article', 'headline': p['title'].split(' · ')[0], 'description': p['desc'],
           'dateModified': TODAY, 'mainEntityOfPage': url, 'image': ORIGIN + '/og.jpg',
           'author': {'@type': 'Person', 'name': 'Dee Lavish'}, 'publisher': {'@type': 'Organization', 'name': 'MKCinema', 'url': ORIGIN + '/'}}
    src, w, h, alt, cap = p['img']
    faq = ''.join(f'<details><summary>{html.escape(q)}</summary><div class="det"><p>{a}</p></div></details>' for q, a in p['faq'])
    more = ''.join(f'<a href="/{s}/">{html.escape(n)}<span>MKCinema guide</span></a>' for s, n in GUIDES if s != p['slug'])
    foot_links = ''.join(f'<a href="/{s}/">{html.escape(n)}</a>' for s, n in GUIDES)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{t}</title>
<meta name="description" content="{d}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#050505">
<meta name="color-scheme" content="dark">
<meta property="og:type" content="article">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:image" content="{ORIGIN}/og.jpg">
<meta property="og:url" content="{url}">
<meta property="og:site_name" content="MKCinema">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{ORIGIN}/og.jpg">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/fraunces-v1.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/onest-v1.woff2" as="font" type="font/woff2" crossorigin>
<script type="application/ld+json">{json.dumps(crumbs, separators=(',', ':'))}</script>
<script type="application/ld+json">{json.dumps(art, separators=(',', ':'))}</script>
<style>{CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar"><div class="bar-in">
  <a class="brand" href="/" aria-label="MKCinema home"><img src="/icon-192.png" width="34" height="34" alt=""><span><b>MK</b><i>Cinema</i></span></a>
  <nav aria-label="Main"><a class="t" href="/#download">Download</a><a class="t" href="/#faq">FAQ</a><a class="btn plat" href="https://app.mkcinema.app/">Open MKCinema</a></nav>
</div></header>
<main id="main" class="wrap">
  <p class="crumbs"><a href="/">MKCinema</a> › {html.escape(p['crumb'])}</p>
  <div class="eyebrow">{html.escape(p['eyebrow'])}</div>
  <h1>{p['h1']}</h1>
  <p class="lead">{p['lead']}</p>
  <figure class="shot"><img src="/{src}" width="{w}" height="{h}" alt="{html.escape(alt)}" fetchpriority="high"><figcaption>{html.escape(cap)}</figcaption></figure>
  {p['body']}
  <h2>Questions, <em>answered.</em></h2>
  {faq}
  <h2>More <em>guides</em></h2>
  <div class="more">{more}</div>
</main>
<footer><div class="wrap">
  <div class="foot"><a href="/">Home</a>{foot_links}<a href="/#download">Download</a><a href="https://github.com/itbelikethatbruh/MKCinema">GitHub</a><a href="https://ko-fi.com/mkcinema">Ko-fi</a></div>
  <p class="legal">MKCinema does not host, provide or link to any copyrighted content. It plays sources from third-party addons that users install themselves. Stremio is a trademark of its owner; MKCinema is an independent project, not affiliated with or endorsed by Stremio. © {datetime.date.today().year} MKCinema · Made by Dee Lavish · Free forever · Open source under GPL-3.0</p>
</div></footer>
</body>
</html>
"""


def main():
    for p in PAGES:
        d = os.path.join(SITE, p['slug']); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(page(p))
    urls = [('/', '1.0')] + [(f'/{p["slug"]}/', '0.7') for p in PAGES]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
        f'  <url><loc>{ORIGIN}{u}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>\n' for u, pr in urls) + '</urlset>\n'
    open(os.path.join(SITE, 'sitemap.xml'), 'w', encoding='utf-8').write(xml)
    print('built', len(PAGES), 'pages')


main()
