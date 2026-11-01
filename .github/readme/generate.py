#!/usr/bin/env python3
"""Draws the README artwork in docs/readme/.

Everything is plain SVG with text converted to outlines, so it looks the same on
every machine and needs no web fonts. Animations are CSS only and stop for
people who ask their system for reduced motion.

    cd .github/readme
    npm pack @fontsource/fraunces @fontsource/space-grotesk   # fonts (SIL OFL)
    for f in *.tgz; do mkdir -p "${f%.tgz}" && tar xzf "$f" -C "${f%.tgz}" --strip-components 1; done
    pip install fonttools brotli pillow
    python3 generate.py

Outputs: hero.svg, download-*.svg, icon-*.svg, h-*.svg, how.svg and footer.svg.
"""
import base64, glob, io, os, re, sys

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "docs", "readme")
os.makedirs(OUT, exist_ok=True)


def font_file(pkg, name):
    hits = glob.glob(os.path.join(HERE, f"*{pkg}*", "files", name))
    if not hits:
        sys.exit(f"missing font {name}: see the header of this script")
    return hits[0]


class Face:
    def __init__(self, path):
        self.f = TTFont(path)
        self.gs = self.f.getGlyphSet()
        self.cmap = self.f.getBestCmap()
        self.upm = self.f["head"].unitsPerEm
        self.hmtx = self.f["hmtx"]

    def width(self, text, size, track=0.0):
        s = size / self.upm
        w = sum(self.hmtx[self.cmap[ord(c)]][0] * s for c in text)
        return w + track * size * max(len(text) - 1, 0)

    def path(self, text, size, x, y, track=0.0, anchor="start"):
        """SVG path data for text with its baseline at y. track is in em."""
        s = size / self.upm
        if anchor != "start":
            w = self.width(text, size, track)
            x -= w if anchor == "end" else w / 2
        pen = SVGPathPen(self.gs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        for c in text:
            g = self.cmap[ord(c)]
            self.gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, y)))
            x += self.hmtx[g][0] * s + track * size
        return pen.getCommands()


SERIF = Face(font_file("fraunces", "fraunces-latin-600-normal.woff2"))
SERIF_IT = Face(font_file("fraunces", "fraunces-latin-400-italic.woff2"))
SERIF_LT_IT = Face(font_file("fraunces", "fraunces-latin-300-italic.woff2"))
SANS = Face(font_file("space-grotesk", "space-grotesk-latin-400-normal.woff2"))
SANS_MD = Face(font_file("space-grotesk", "space-grotesk-latin-500-normal.woff2"))
SANS_SB = Face(font_file("space-grotesk", "space-grotesk-latin-600-normal.woff2"))

# Icons and brand marks come from the website's sprite, so the README and the
# site share one set. Brand marks are Simple Icons (CC0).
SITE = open(os.path.join(ROOT, "site", "index.html"), encoding="utf-8").read()


def symbol(name):
    m = re.search(r'<symbol id="%s"([^>]*)>(.*?)</symbol>' % re.escape(name), SITE, re.S)
    attrs = re.sub(r'\s*viewBox="[^"]*"', "", m.group(1))
    return attrs.strip(), m.group(2)


MK_LETTERS = re.search(r'<path id="mkLetters" d="([^"]+)"', SITE).group(1)

PLAT = ('<stop offset="0" stop-color="#ffffff"/><stop offset=".38" stop-color="#dcd9d1"/>'
        '<stop offset=".56" stop-color="#8f8c86"/><stop offset=".76" stop-color="#efebe2"/>'
        '<stop offset="1" stop-color="#a9a59d"/>')
RING = ('<stop offset="0" stop-color="#f6f3ec"/><stop offset=".5" stop-color="#6d6a65"/>'
        '<stop offset="1" stop-color="#e8e3d8"/>')
REDUCED = "@media (prefers-reduced-motion: reduce){*{animation:none!important}}"


def write(name, svg):
    svg = re.sub(r">\s+<", "><", svg.strip())
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
        fh.write(svg + "\n")
    print(f"{name:28s} {len(svg)/1024:7.1f} KB")


def thumb(path, w=432, h=270, crop_top=0.0):
    im = Image.open(path).convert("RGB")
    sw, sh = im.size
    # cover-crop to w:h
    r = w / h
    if sw / sh > r:
        nw = int(sh * r)
        im = im.crop(((sw - nw) // 2, 0, (sw - nw) // 2 + nw, sh))
    else:
        nh = int(sw / r)
        top = int((sh - nh) * crop_top)
        im = im.crop((0, top, sw, top + nh))
    im = im.resize((w, h), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=62, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


# ------------------------------------------------------------------ hero
def hero():
    W, H = 1280, 640
    shots = [
        thumb(os.path.join(ROOT, "site/shots/desktop.webp")),
        thumb(os.path.join(ROOT, "site/shots/picks.webp"), crop_top=0.15),
        thumb(os.path.join(ROOT, "docs/screenshots/app-welcome.jpg"), crop_top=0.1),
        thumb(os.path.join(ROOT, "site/shots/party.webp"), crop_top=0.3),
        thumb(os.path.join(ROOT, "docs/screenshots/app-addon-studio.jpg")),
    ]
    fw, fh, gap = 216, 135, 18          # frame size inside the strip
    pitch = fh + gap
    loop = pitch * len(shots)
    frames = []
    for rep in range(3):
        for i, src in enumerate(shots):
            y = (rep * len(shots) + i) * pitch
            frames.append(
                f'<rect x="-6" y="{y-6}" width="{fw+12}" height="{fh+12}" rx="5" fill="#000"/>'
                f'<use href="#s{i}" y="{y}"/>'
                f'<rect x="0.5" y="{y+0.5}" width="{fw-1}" height="{fh-1}" rx="4" fill="none" stroke="#ffffff22"/>')
    holes = "".join(
        f'<rect x="-26" y="{y}" width="10" height="7" rx="2"/><rect x="{fw+16}" y="{y}" width="10" height="7" rx="2"/>'
        for y in range(0, loop * 3, 22))
    strip_h = loop * 3

    over = SANS_MD.path("OPEN SOURCE  ·  GPL-3.0  ·  EIGHT PLATFORMS", 13, 132, 172, track=0.32)
    mk = SERIF.path("MK", 128, 80, 316)
    mkw = SERIF.width("MK", 128)
    cin = SERIF_IT.path("Cinema", 128, 80 + mkw - 4, 316)
    tag = SERIF_LT_IT.path("Your addons. A private cinema.", 38, 82, 392)
    sub1 = SANS.path("A premium player for the Stremio addons you choose. Debrid built in,", 19, 82, 440)
    sub2 = SANS.path("one tap to VLC, watch parties, X-Ray and on-device picks.", 19, 82, 467)

    chips, cx = [], 82
    for icon, label in [("b-android", "Android"), ("i-tv", "TV"), ("b-windows", "Windows"),
                        ("b-apple", "macOS"), ("b-linux", "Linux"), ("i-globe", "Web")]:
        tw = SANS_MD.width(label, 15)
        w = 16 + 18 + 9 + tw + 18
        attrs, body = symbol(icon)
        chips.append(
            f'<g transform="translate({cx:.1f} 520)"><rect width="{w:.1f}" height="40" rx="20" fill="#0e0e10" stroke="#ffffff1f"/>'
            f'<svg x="16" y="11" width="18" height="18" viewBox="0 0 24 24" {attrs} color="#d9d4c7">{body}</svg>'
            f'<path d="{SANS_MD.path(label, 15, 43, 25.5)}" fill="#ececee"/></g>')
        cx += w + 10

    svg = f'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="MKCinema. Your addons. A private cinema.">
<title>MKCinema: your addons, a private cinema</title>
<style>
.ring{{transform-box:fill-box;transform-origin:center;animation:breathe 9s ease-in-out infinite}}
.r2{{animation-delay:-3s}}.r3{{animation-delay:-6s}}
@keyframes breathe{{0%,100%{{transform:scale(1);opacity:.55}}50%{{transform:scale(1.035);opacity:1}}}}
.reel{{animation:reel 26s linear infinite}}
@keyframes reel{{from{{transform:translateY(0)}}to{{transform:translateY(-{loop}px)}}}}
.arc{{transform-box:view-box;transform-origin:1010px 320px;animation:spin 24s linear infinite}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
.sheen{{animation:sheen 7s cubic-bezier(.6,0,.2,1) infinite}}
@keyframes sheen{{0%{{transform:translateX(-520px)}}55%,100%{{transform:translateX(980px)}}}}
.rise{{opacity:0;animation:rise 1.4s cubic-bezier(.2,.7,.2,1) forwards}}
.d1{{animation-delay:.25s}}.d2{{animation-delay:.5s}}.d3{{animation-delay:.75s}}.d4{{animation-delay:1s}}
@keyframes rise{{from{{opacity:0;transform:translateY(14px)}}to{{opacity:1;transform:none}}}}
.flick{{animation:flick 5s steps(1) infinite}}
@keyframes flick{{0%,100%{{opacity:.05}}47%{{opacity:.08}}48%{{opacity:.03}}51%{{opacity:.06}}}}
{REDUCED}
@media (prefers-reduced-motion: reduce){{.rise{{opacity:1}}}}
</style>
<defs>
<linearGradient id="plat" x1="0" y1="0" x2="1" y2="1">{PLAT}</linearGradient>
<linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">{RING}</linearGradient>
<radialGradient id="glow" cx="22%" cy="45%" r="70%"><stop offset="0" stop-color="#1d1d20"/><stop offset=".55" stop-color="#09090a"/><stop offset="1" stop-color="#030303"/></radialGradient>
<radialGradient id="beam" cx="1010" cy="320" r="420" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f4f1ea" stop-opacity=".10"/><stop offset="1" stop-color="#f4f1ea" stop-opacity="0"/></radialGradient>
<linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".2" stop-color="#fff"/><stop offset=".8" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="stripMask" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="url(#fade)"/></mask>
{"".join(f'<image id="s{i}" href="{src}" width="{fw}" height="{fh}" preserveAspectRatio="xMidYMid slice"/>' for i, src in enumerate(shots))}
<clipPath id="word"><path d="{mk}{cin}"/></clipPath>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 0"/></filter>
</defs>
<rect width="{W}" height="{H}" fill="url(#glow)"/>
<rect width="{W}" height="{H}" fill="url(#beam)"/>
<g fill="none" stroke="#ffffff" stroke-opacity=".09">
<circle class="ring" cx="1010" cy="320" r="190"/><circle class="ring r2" cx="1010" cy="320" r="270"/><circle class="ring r3" cx="1010" cy="320" r="350"/>
</g>
<g class="arc" fill="none" stroke="url(#ringg)" stroke-width="1.4" stroke-linecap="round" opacity=".7">
<circle cx="1010" cy="320" r="270" stroke-dasharray="120 1576"/>
<circle cx="1010" cy="320" r="350" stroke-dasharray="60 2139" stroke-dashoffset="-900" opacity=".6"/>
</g>
<g mask="url(#stripMask)">
<g transform="translate(905 -40) rotate(9)">
<g class="reel">
<g fill="#0b0b0c"><rect x="-34" y="-20" width="{fw+68}" height="{strip_h+40}" rx="6" stroke="#ffffff14"/></g>
<g fill="#1b1b1e">{holes}</g>
{"".join(frames)}
</g>
</g>
</g>
<g class="rise"><rect x="82" y="165" width="34" height="1" fill="#d9d4c7" opacity=".7"/><path d="{over}" fill="#d9d4c7" fill-opacity=".85"/></g>
<g class="rise d1">
<path d="{mk}" fill="url(#plat)"/><path d="{cin}" fill="url(#plat)"/>
<g clip-path="url(#word)"><rect class="sheen" x="0" y="190" width="160" height="160" fill="url(#sweep)" opacity=".55" transform="translate(-520 0)"/></g>
</g>
<path class="rise d2" d="{tag}" fill="#e7e2d6"/>
<g class="rise d3" fill="#b9b9c1"><path d="{sub1}"/><path d="{sub2}"/></g>
<g class="rise d4">{"".join(chips)}</g>
<rect class="flick" width="{W}" height="{H}" filter="url(#grain)" opacity=".05"/>
</svg>'''
    write("hero.svg", svg)


# ---------------------------------------------------------- download buttons
DOWNLOADS = [
    ("android", "b-android", "Android", "Phones and tablets", ".apk · 357 KB"),
    ("tv", "i-tv", "Android TV", "Google TV · Fire TV", ".apk · 357 KB"),
    ("webos", "b-lg", "LG webOS", "Beta · Developer Mode", ".ipk · 144 KB"),
    ("windows", "b-windows", "Windows", "10 and 11 · 64-bit", ".exe · 2.7 MB"),
    ("macos", "b-apple", "macOS", "Intel and Apple silicon", ".dmg · 1.4 MB"),
    ("linux", "b-linux", "Linux", "Ubuntu · Debian · Mint", ".deb · 203 KB"),
    ("web", "i-globe", "Web app", "Any modern browser", "No install"),
]


def download_buttons():
    W, H = 360, 92
    for i, (key, icon, name, sub, meta) in enumerate(DOWNLOADS):
        attrs, body = symbol(icon)
        kicker = "OPEN IN BROWSER" if key == "web" else "DOWNLOAD FOR"
        svg = f'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{kicker.title()} {name}">
<title>{kicker.title()} {name}</title>
<style>.g{{animation:g 6s cubic-bezier(.6,0,.2,1) infinite;animation-delay:{i*0.55:.2f}s}}
@keyframes g{{0%{{transform:translateX(-200px)}}45%,100%{{transform:translateX({W+60}px)}}}}{REDUCED}</style>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18181b"/><stop offset="1" stop-color="#09090a"/></linearGradient>
<linearGradient id="st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".38"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".07"/><stop offset="1" stop-color="#ffffff" stop-opacity=".26"/></linearGradient>
<linearGradient id="plat" x1="0" y1="0" x2="1" y2="1">{PLAT}</linearGradient>
<linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".09"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="c"><rect x="1" y="1" width="{W-2}" height="{H-2}" rx="22"/></clipPath>
</defs>
<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="22" fill="url(#bg)"/>
<g clip-path="url(#c)"><rect class="g" x="0" y="0" width="140" height="{H}" fill="url(#gl)" transform="translate(-200 0) skewX(-18)"/></g>
<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="22" fill="none" stroke="url(#st)" stroke-width="1.2"/>
<rect x="20" y="20" width="52" height="52" rx="15" fill="#050506" stroke="#ffffff1c"/>
<svg x="32" y="32" width="28" height="28" viewBox="0 0 24 24" {attrs} color="#ece8df">{body}</svg>
<path d="{SANS_MD.path(kicker, 10.5, 90, 34, track=0.24)}" fill="#9a9aa3"/>
<path d="{SANS_SB.path(name, 23, 89, 60)}" fill="url(#plat)"/>
<path d="{SANS.path(sub, 12.5, 90, 77)}" fill="#8a8a93"/>
<path d="{SANS_MD.path(meta, 12, W-22, 34, anchor="end")}" fill="#d9d4c7" fill-opacity=".8"/>
<path d="M{W-38} 56l8 8 8-8M{W-30} 48v15" fill="none" stroke="#d9d4c7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="{0 if key == "web" else .8}"/>
<path d="M{W-40} 64l14-14M{W-36} 50h10v10" fill="none" stroke="#d9d4c7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="{.8 if key == "web" else 0}"/>
</svg>'''
        write(f"download-{key}.svg", svg)


# ------------------------------------------------------------- feature icons
ICONS = ["i-puzzle", "i-bolt", "i-ext", "i-users", "i-eye", "i-spark", "i-skip", "i-sync",
         "i-wave", "i-globe", "i-phone", "i-shield", "i-tv", "i-cc", "i-import"]


def feature_icons():
    for i, name in enumerate(ICONS):
        attrs, body = symbol(name)
        attrs = attrs.replace('stroke="currentColor"', 'stroke="url(#p)"').replace('fill="currentColor"', 'fill="url(#p)"')
        svg = f'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
<style>.h{{animation:h 8s ease-in-out infinite;animation-delay:-{i*0.6:.1f}s}}@keyframes h{{0%,100%{{opacity:.25}}50%{{opacity:.75}}}}{REDUCED}</style>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1c1f"/><stop offset="1" stop-color="#070708"/></linearGradient>
<linearGradient id="st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".55" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity=".22"/></linearGradient>
<radialGradient id="hl" cx=".3" cy=".2" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="p" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">{PLAT}</linearGradient>
</defs>
<rect x="2" y="2" width="68" height="68" rx="20" fill="url(#bg)"/>
<rect class="h" x="2" y="2" width="68" height="68" rx="20" fill="url(#hl)"/>
<rect x="2.5" y="2.5" width="67" height="67" rx="19.5" fill="none" stroke="url(#st)"/>
<svg x="22" y="22" width="28" height="28" viewBox="0 0 24 24" {attrs}>{body}</svg>
</svg>'''
        write(f"icon-{name[2:]}.svg", svg)


# ----------------------------------------------------------- section headers
SECTIONS = [
    ("download", "01", "Download", "Eight platforms, one library"),
    ("features", "02", "Features", "Everything a private cinema needs"),
    ("screenshots", "03", "In motion", "Real screenshots of the live app"),
    ("marquee", "04", "Now showing", "Picked by the community, daily"),
    ("how", "05", "How it works", "Your device, your keys, your addons"),
    ("build", "06", "Build from source", "Every app, from this repository"),
    ("faq", "07", "Questions", "The short answers"),
    ("support", "08", "Support MKCinema", "Free, no ads, made by one person"),
]


def section_headers():
    # 960 wide with no small print, so the title stays readable on a phone
    W, H = 960, 110
    for key, num, title, _sub in SECTIONS:
        tw = SERIF_IT.width(title, 58)
        x0 = 112 + tw + 30
        svg = f'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{title}">
<title>{title}</title>
<style>.ln{{transform-box:fill-box;transform-origin:left;animation:ln 2.4s cubic-bezier(.2,.7,.2,1) both}}@keyframes ln{{from{{transform:scaleX(0)}}to{{transform:none}}}}{REDUCED}</style>
<defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1">{PLAT}</linearGradient>
<linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9d4c7" stop-opacity=".6"/><stop offset="1" stop-color="#d9d4c7" stop-opacity="0"/></linearGradient></defs>
<path d="{SERIF_LT_IT.path(num, 62, 6, 80)}" fill="none" stroke="#d9d4c7" stroke-opacity=".6" stroke-width="1.2"/>
<path d="{SERIF_IT.path(title, 58, 112, 78)}" fill="url(#p)"/>
<rect class="ln" x="{x0:.0f}" y="60" width="{max(W - x0 - 6, 0):.0f}" height="1" fill="url(#l)"/>
</svg>'''
        write(f"h-{key}.svg", svg)


# ------------------------------------------------------------ how it works
def how_diagram():
    """Replaces the Mermaid chart, which GitHub's mobile app shows as raw code.
    Tall and narrow so its text stays readable on a phone."""
    W = 720
    rows = [
        ("b-stremio", "Stremio addons you install", "Catalogues and streams", False),
        ("i-bolt", "Your debrid service", "Connected with your own key", False),
        ("i-shield", "Supabase sync, optional", "Your row only, locked by RLS", False),
        ("i-ext", "VLC, Infuse, mpv, IINA, PotPlayer", "One-tap hand-off", False),
        ("i-users", "Friends' devices", "Watch party, peer to peer", True),
    ]
    top, ch, gap = 196, 96, 18
    H = top + len(rows) * (ch + gap) + 12
    tx = 70
    cards, joins = [], []
    for i, (icon, title, sub, dashed) in enumerate(rows):
        y = top + i * (ch + gap)
        cy = y + ch / 2
        attrs, body = symbol(icon)
        dash = ' stroke-dasharray="5 6"' if dashed else ""
        joins.append(f'<path d="M{tx} {cy - 30} q0 30 30 30 h40" fill="none" stroke="#d9d4c7" stroke-opacity=".45" stroke-width="1.5"{dash}/>'
                     f'<circle class="pt" style="animation-delay:{i * 0.35:.2f}s" cx="{tx + 70}" cy="{cy}" r="4" fill="#ece8df"/>')
        cards.append(f'''<g transform="translate(150 {y})">
<rect width="{W - 160}" height="{ch}" rx="22" fill="url(#bg)"/><rect x=".5" y=".5" width="{W - 161}" height="{ch - 1}" rx="21.5" fill="none" stroke="url(#st)"/>
<rect x="20" y="22" width="52" height="52" rx="15" fill="#050506" stroke="#ffffff1c"/>
<svg x="33" y="35" width="26" height="26" viewBox="0 0 24 24" {attrs} color="#ece8df">{body}</svg>
<path d="{SANS_SB.path(title, 24, 92, 46)}" fill="url(#p)"/>
<path d="{SANS.path(sub, 19, 92, 74)}" fill="#9a9aa3"/>
</g>''')
    last = top + (len(rows) - 1) * (ch + gap) + ch / 2 - 30
    svg = f'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img"
 aria-label="MKCinema runs on your device, with Your Picks on-device. It connects to the Stremio addons you install, your debrid service with your own key, optional Supabase sync to your own row, video players such as VLC, and friends' devices for watch parties, peer to peer.">
<title>How MKCinema works</title>
<style>.pt{{animation:pt 2.8s ease-in-out infinite}}@keyframes pt{{0%,100%{{opacity:.25}}50%{{opacity:1}}}}
.run{{animation:run 3.2s cubic-bezier(.5,0,.5,1) infinite}}@keyframes run{{from{{transform:translateY(-120px)}}to{{transform:translateY({H}px)}}}}{REDUCED}</style>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17171a"/><stop offset="1" stop-color="#09090a"/></linearGradient>
<linearGradient id="st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></linearGradient>
<linearGradient id="p" x1="0" y1="0" x2="1" y2="1">{PLAT}</linearGradient>
<linearGradient id="r" x1="0" y1="0" x2="1" y2="1">{RING}</linearGradient>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="trunk"><rect x="{tx - 1.5}" y="150" width="3" height="{last - 150}"/></clipPath>
</defs>
<g transform="translate(10 10)">
<rect width="{W - 20}" height="150" rx="28" fill="url(#bg)"/><rect x=".5" y=".5" width="{W - 21}" height="149" rx="27.5" fill="none" stroke="url(#st)"/>
<circle cx="80" cy="75" r="44" fill="#050505" stroke="url(#r)" stroke-width="2"/>
<path d="{MK_LETTERS}" fill="url(#p)" transform="translate(80 75) scale(.62)"/>
<path d="{SERIF.path("MKCinema", 40, 148, 68)}" fill="url(#p)"/>
<path d="{SANS.path("On your phone, TV or computer", 20, 150, 98)}" fill="#c9c9d0"/>
<path d="{SANS.path("Your Picks runs here, on the device", 17, 150, 124)}" fill="#8a8a93"/>
</g>
<rect x="{tx - .75}" y="160" width="1.5" height="{last - 160}" fill="#d9d4c7" fill-opacity=".45"/>
<g clip-path="url(#trunk)"><rect class="run" x="{tx - 1.5}" y="0" width="3" height="120" fill="url(#beam)"/></g>
{"".join(joins)}
{"".join(cards)}
</svg>'''
    write("how.svg", svg)


# ------------------------------------------------------------------ footer
def footer():
    W, H = 960, 300
    line = SANS_MD.path("FREE  ·  OPEN SOURCE  ·  NO ADS  ·  NO TRACKING", 15, W / 2, 266, track=0.3, anchor="middle")
    sig = SERIF_LT_IT.path("Made for the love of film by Drake Christopher", 32, W / 2, 224, anchor="middle")
    svg = f'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="Made for the love of film by Drake Christopher">
<title>MKCinema</title>
<style>.o{{transform-box:view-box;transform-origin:480px 96px;animation:o 14s linear infinite}}@keyframes o{{to{{transform:rotate(360deg)}}}}{REDUCED}</style>
<defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1">{PLAT}</linearGradient>
<linearGradient id="r" x1="0" y1="0" x2="1" y2="1">{RING}</linearGradient>
<radialGradient id="gl" cx="480" cy="96" r="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f4f1ea" stop-opacity=".12"/><stop offset="1" stop-color="#f4f1ea" stop-opacity="0"/></radialGradient></defs>
<circle cx="480" cy="96" r="150" fill="url(#gl)"/>
<circle cx="480" cy="96" r="62" fill="#050505" stroke="url(#r)" stroke-width="2.2"/>
<circle class="o" cx="480" cy="96" r="74" fill="none" stroke="url(#r)" stroke-width="1.2" stroke-dasharray="70 395" stroke-linecap="round" opacity=".8"/>
<path d="{MK_LETTERS}" fill="url(#p)" transform="translate(480 96) scale(.92)"/>
<path d="{sig}" fill="#e7e2d6"/>
<path d="{line}" fill="#8a8a93"/>
</svg>'''
    write("footer.svg", svg)


if __name__ == "__main__":
    hero()
    download_buttons()
    feature_icons()
    section_headers()
    how_diagram()
    footer()
