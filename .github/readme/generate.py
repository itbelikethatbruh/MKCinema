#!/usr/bin/env python3
"""Draws the download buttons in docs/readme/.

Everything is plain SVG with text converted to outlines, so it looks the same on
every machine and needs no web fonts. The art is drawn still: write() strips the
CSS animation out, because GitHub's mobile app re-renders animated SVGs and the
README flashes in and out there.

    cd .github/readme
    npm pack @fontsource/space-grotesk   # font (SIL OFL)
    for f in *.tgz; do mkdir -p "${f%.tgz}" && tar xzf "$f" -C "${f%.tgz}" --strip-components 1; done
    pip install fonttools brotli
    python3 generate.py

Outputs: download-*.svg (the download buttons in docs/install.md).
"""
import glob, os, re, sys

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

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


PLAT = ('<stop offset="0" stop-color="#ffffff"/><stop offset=".38" stop-color="#dcd9d1"/>'
        '<stop offset=".56" stop-color="#8f8c86"/><stop offset=".76" stop-color="#efebe2"/>'
        '<stop offset="1" stop-color="#a9a59d"/>')
REDUCED = "@media (prefers-reduced-motion: reduce){*{animation:none!important}}"


STILL = {"h": ".5", "ring": ".8", "pt": ".7"}  # resting opacity for pulsing parts


def still(svg):
    """Freeze the art: drop the <style> animations and the parts that only exist
    while moving (sheens, the travelling beam), and give pulsing parts a resting
    opacity. Off-canvas start positions would otherwise leave them hidden."""
    svg = re.sub(r"<style>.*?</style>", "", svg, flags=re.S)
    svg = re.sub(r'<rect class="(?:g|sheen|run)"[^>]*/>', "", svg)

    def tag(m):
        name, cls, rest = m.group(1), m.group(2).split()[0], m.group(3)
        rest = re.sub(r'\s*style="animation-delay:[^"]*"', "", rest)
        op = f' opacity="{STILL[cls]}"' if cls in STILL and "opacity=" not in rest else ""
        return f"<{name}{op}{rest}"

    svg = re.sub(r'<(\w+) class="([^"]+)"([^>]*>)', tag, svg)
    assert "animation" not in svg, "animated SVG left in the README art"
    return svg


def write(name, svg):
    svg = still(re.sub(r">\s+<", "><", svg.strip()))
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
        fh.write(svg + "\n")
    print(f"{name:28s} {len(svg)/1024:7.1f} KB")


# ---------------------------------------------------------- download buttons
DOWNLOADS = [
    ("android", "b-android", "Android", "Phones and tablets", ".apk · 11.4 MB"),
    ("tv", "i-tv", "Android TV", "Google TV · Fire TV", ".apk · 11.4 MB"),
    ("webos", "b-lg", "LG webOS", "Beta · Developer Mode", ".ipk · 144 KB"),
    ("windows", "b-windows", "Windows", "10 and 11 · 64-bit", ".exe · 14.0 MB"),
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


if __name__ == "__main__":
    download_buttons()
