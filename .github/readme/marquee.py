#!/usr/bin/env python3
"""Draws marquee.svg: a lit cinema marquee for the README.

Run daily by .github/workflows/readme-stats.yml, which publishes it to the
readme-assets branch.

It shows one major film from 2025-2026, a different one every day, from the
list below. Titles only: no posters, no links to any content. Keep the list to
films that have already opened; add new releases as they come out.

    GITHUB_REPOSITORY=owner/name GITHUB_TOKEN=... python3 marquee.py out/marquee.svg
"""
import datetime, json, os, re, sys, urllib.request
from xml.sax.saxutils import escape

OUT_PATH = sys.argv[1] if len(sys.argv) > 1 else "marquee.svg"
import generate as g  # fonts and helpers

REPO = os.environ.get("GITHUB_REPOSITORY", "itbelikethatbruh/MKCinema")
TOKEN = os.environ.get("GITHUB_TOKEN", "")

FEATURES = [
    ("Sinners", 2025), ("Mission: Impossible The Final Reckoning", 2025), ("Superman", 2025),
    ("Jurassic World Rebirth", 2025), ("The Fantastic Four: First Steps", 2025), ("Thunderbolts", 2025),
    ("How to Train Your Dragon", 2025), ("Lilo & Stitch", 2025), ("F1", 2025), ("Weapons", 2025),
    ("28 Years Later", 2025), ("One Battle After Another", 2025), ("Frankenstein", 2025),
    ("Tron: Ares", 2025), ("Wicked: For Good", 2025), ("Zootopia 2", 2025), ("Avatar: Fire and Ash", 2025),
    ("Predator: Badlands", 2025), ("The Running Man", 2025), ("Final Destination Bloodlines", 2025),
    ("KPop Demon Hunters", 2025), ("Marty Supreme", 2025), ("Hamnet", 2025), ("Bugonia", 2025),
    ("Project Hail Mary", 2026), ("The Super Mario Galaxy Movie", 2026), ("The Mandalorian and Grogu", 2026),
    ("Toy Story 5", 2026), ("Supergirl", 2026), ("Spider-Man: Brand New Day", 2026), ("The Odyssey", 2026),
    ("Michael", 2026), ("Scream 7", 2026), ("The Devil Wears Prada 2", 2026),
]


def api(path):
    req = urllib.request.Request("https://api.github.com/repos/" + REPO + path,
                                 headers={"Accept": "application/vnd.github+json",
                                          "User-Agent": "mkcinema-readme-marquee",
                                          **({"Authorization": "Bearer " + TOKEN} if TOKEN else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def pick():
    day = datetime.date.today().toordinal()
    title, year = FEATURES[day % len(FEATURES)]
    return title, f"FEATURE PRESENTATION  ·  {year}"


def stats():
    try:
        rel = api("/releases?per_page=100")
    except Exception:
        return ""
    downloads = sum(a["download_count"] for r in rel for a in r.get("assets", []))
    latest = next((r["tag_name"] for r in rel if not r["draft"] and not r["prerelease"]), "")
    return f"{latest.upper()}  ·  8 PLATFORMS  ·  {downloads:,} APP DOWNLOADS"


def wrap(text, width):
    words, lines, cur = text.upper().split(), [], ""
    for w in words:
        if len(w) > width:
            w = w[: width - 1] + "…"
        if not cur:
            cur = w
        elif len(cur) + 1 + len(w) <= width:
            cur += " " + w
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) > 2:
        lines = [lines[0], (lines[1][: width - 1] + "…")]
    return lines


def draw(title, credit, foot):
    W, H = 960, 470
    cols, tw, th, gap = 17, 46, 62, 5
    lines = wrap(title, cols)
    board_w = cols * (tw + gap) - gap
    bx = (W - board_w) / 2
    rows_h = len(lines) * th + (len(lines) - 1) * 10
    by = 150 + (142 - rows_h) / 2
    tiles = []
    for r, line in enumerate(lines):
        x0 = bx + (cols - len(line)) * (tw + gap) / 2
        y = by + r * (th + 10)
        for i, ch in enumerate(line):
            x = x0 + i * (tw + gap)
            if ch == " ":
                continue
            face = g.SANS_SB
            if ord(ch) not in face.cmap:
                ch = "?"
            tiles.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{tw}" height="{th}" rx="5" fill="url(#tile)"/>'
                         f'<path d="{face.path(ch, 40, x + tw / 2, y + 45, anchor="middle")}" fill="url(#p)"/>')
    # chasing bulbs around the frame (opacity only)
    bulbs, k = [], 0
    m, step = 22, 26
    pts = []
    x = m
    while x <= W - m:
        pts.append((x, m)); x += step
    y = m + step
    while y <= H - m:
        pts.append((W - m, y)); y += step
    x = W - m - step
    while x >= m:
        pts.append((x, H - m)); x -= step
    y = H - m - step
    while y > m:
        pts.append((m, y)); y -= step
    for k, (x, y) in enumerate(pts):
        bulbs.append(f'<circle class="b b{k % 3}" cx="{x:.0f}" cy="{y:.0f}" r="4.2"/>')
    kicker = g.SANS_MD.path("NOW SHOWING", 17, W / 2, 113, track=0.45, anchor="middle")
    brand = g.SERIF.path("MK", 30, W / 2 - 2, 78, anchor="end")
    brand2 = g.SERIF_IT.path("Cinema", 30, W / 2 - 2, 78)
    cred = g.SANS_MD.path(credit, 20, W / 2, 354, track=0.26, anchor="middle")
    foot_p = g.SANS_MD.path(foot, 16, W / 2, 414, track=0.26, anchor="middle") if foot else ""
    alt = f"Now showing: {title}. {credit.title()}."
    svg = f'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{escape(alt, {'"': '&quot;'})}">
<title>{escape(alt)}</title>
<style>
.b{{fill:#ffe7b0;animation:chase 1.5s steps(1) infinite}}.b1{{animation-delay:-.5s}}.b2{{animation-delay:-1s}}
@keyframes chase{{0%{{opacity:1}}33%{{opacity:.28}}66%{{opacity:.5}}}}
.glow{{animation:glow 4s ease-in-out infinite}}@keyframes glow{{0%,100%{{opacity:.55}}50%{{opacity:1}}}}
{g.REDUCED}
</style>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141416"/><stop offset="1" stop-color="#060607"/></linearGradient>
<linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f1f23"/><stop offset="1" stop-color="#0c0c0e"/></linearGradient>
<linearGradient id="p" x1="0" y1="0" x2="1" y2="1">{g.PLAT}</linearGradient>
<linearGradient id="st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".4"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient>
<radialGradient id="warm" cx="50%" cy="48%" r="60%"><stop offset="0" stop-color="#ffd98a" stop-opacity=".10"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>
<filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
</defs>
<rect x="2" y="2" width="{W - 4}" height="{H - 4}" rx="30" fill="url(#bg)"/>
<rect class="glow" x="2" y="2" width="{W - 4}" height="{H - 4}" rx="30" fill="url(#warm)"/>
<rect x="2.5" y="2.5" width="{W - 5}" height="{H - 5}" rx="29.5" fill="none" stroke="url(#st)"/>
<rect x="40" y="40" width="{W - 80}" height="{H - 80}" rx="16" fill="none" stroke="#ffffff14"/>
<g filter="url(#bloom)" opacity=".7">{"".join(bulbs)}</g>
<g>{"".join(bulbs)}</g>
<path d="{brand}" fill="url(#p)"/><path d="{brand2}" fill="url(#p)"/>
<rect x="{W / 2 - 150}" y="106" width="70" height="1" fill="#d9d4c7" opacity=".5"/><rect x="{W / 2 + 80}" y="106" width="70" height="1" fill="#d9d4c7" opacity=".5"/>
<path d="{kicker}" fill="#ffe7b0" fill-opacity=".9"/>
<rect x="{bx - 14:.1f}" y="140" width="{board_w + 28:.1f}" height="162" rx="12" fill="#030303" stroke="#ffffff12"/>
{"".join(tiles)}
<path d="{cred}" fill="#d9d4c7"/>
<rect x="{W / 2 - 260}" y="378" width="520" height="1" fill="#ffffff14"/>
<path d="{foot_p}" fill="#8a8a93"/>
</svg>'''
    svg = re.sub(r">\s+<", "><", svg.strip())
    os.makedirs(os.path.dirname(os.path.abspath(OUT_PATH)), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        fh.write(svg + "\n")


if __name__ == "__main__":
    t, c = pick()
    draw(t, c, stats())
    print("marquee:", t, "|", c)
