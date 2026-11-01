#!/usr/bin/env python3
"""Draws marquee.svg: a lit cinema marquee for the README.

Run daily by .github/workflows/readme-stats.yml, which publishes it to the
readme-assets branch.

What it shows, in order:
1. The community's pick: the open issue labelled both "marquee" and
   "approved" with the most thumbs-up reactions. Nominations come from the
   "Nominate a film" issue form; the maintainer adds "approved" so nothing
   unreviewed reaches the README.
2. Otherwise a classic from the list below, changing every day.

Titles only: no posters, no links to any content.

    GITHUB_REPOSITORY=owner/name GITHUB_TOKEN=... python3 marquee.py out/marquee.svg
"""
import datetime, json, os, re, sys, unicodedata, urllib.request
from xml.sax.saxutils import escape

OUT_PATH = sys.argv[1] if len(sys.argv) > 1 else "marquee.svg"
import generate as g  # fonts and helpers

REPO = os.environ.get("GITHUB_REPOSITORY", "itbelikethatbruh/MKCinema")
TOKEN = os.environ.get("GITHUB_TOKEN", "")

CLASSICS = [
    ("Metropolis", 1927), ("The General", 1926), ("City Lights", 1931), ("M", 1931),
    ("It Happened One Night", 1934), ("Modern Times", 1936), ("Stagecoach", 1939),
    ("The Wizard of Oz", 1939), ("His Girl Friday", 1940), ("Citizen Kane", 1941),
    ("The Maltese Falcon", 1941), ("Casablanca", 1942), ("Double Indemnity", 1944),
    ("Brief Encounter", 1945), ("It's a Wonderful Life", 1946), ("Bicycle Thieves", 1948),
    ("The Third Man", 1949), ("Sunset Boulevard", 1950), ("Rashomon", 1950),
    ("All About Eve", 1950), ("Singin' in the Rain", 1952), ("Tokyo Story", 1953),
    ("Seven Samurai", 1954), ("Rear Window", 1954), ("On the Waterfront", 1954),
    ("The Night of the Hunter", 1955), ("The Searchers", 1956), ("12 Angry Men", 1957),
    ("Wild Strawberries", 1957), ("Vertigo", 1958), ("North by Northwest", 1959),
    ("Some Like It Hot", 1959), ("The 400 Blows", 1959), ("Breathless", 1960),
    ("Psycho", 1960), ("The Apartment", 1960), ("La Dolce Vita", 1960),
    ("Lawrence of Arabia", 1962), ("8½", 1963), ("Dr. Strangelove", 1964),
    ("The Good, the Bad and the Ugly", 1966), ("Persona", 1966), ("Playtime", 1967),
    ("2001: A Space Odyssey", 1968), ("Once Upon a Time in the West", 1968),
    ("The Godfather", 1972), ("Chinatown", 1974), ("Jaws", 1975), ("Taxi Driver", 1976),
    ("Alien", 1979), ("Blade Runner", 1982), ("Back to the Future", 1985),
    ("My Neighbor Totoro", 1988), ("Cinema Paradiso", 1988), ("Goodfellas", 1990),
]


def api(path):
    req = urllib.request.Request("https://api.github.com/repos/" + REPO + path,
                                 headers={"Accept": "application/vnd.github+json",
                                          "User-Agent": "mkcinema-readme-marquee",
                                          **({"Authorization": "Bearer " + TOKEN} if TOKEN else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def clean(title):
    """Keep letters, digits and simple punctuation, at most 36 characters."""
    title = unicodedata.normalize("NFC", title)
    title = re.sub(r"^\s*(marquee|vote|nominate|nomination)\s*[:\-]\s*", "", title, flags=re.I)
    title = re.sub(r"[^\w\s'&:,.!?½\-]", "", title).strip()
    title = re.sub(r"\s+", " ", title)
    return title[:36].strip()


def pick():
    try:
        issues = api("/issues?state=open&labels=marquee,approved&per_page=100")
    except Exception as e:  # no network or rate limit: fall back to a classic
        print("issues unavailable:", e)
        issues = []
    best = None
    for it in issues:
        if "pull_request" in it:
            continue
        votes = it.get("reactions", {}).get("+1", 0)
        title = clean(it["title"])
        if title and (best is None or votes > best[1] or (votes == best[1] and it["number"] < best[2])):
            best = (title, votes, it["number"])
    if best:
        v = best[1]
        return best[0], f"CHOSEN BY THE COMMUNITY  ·  {v} VOTE{'' if v == 1 else 'S'}"
    day = datetime.date.today().toordinal()
    title, year = CLASSICS[day % len(CLASSICS)]
    return title, f"TODAY'S CLASSIC  ·  {year}"


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
