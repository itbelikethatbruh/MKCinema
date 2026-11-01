#!/usr/bin/env python3
"""Draws stats.svg from the repository's real numbers on GitHub.

Run by .github/workflows/readme-stats.yml, which publishes the card to the
readme-assets branch. Every number comes from the GitHub API at run time.

    GITHUB_REPOSITORY=owner/name GITHUB_TOKEN=... python3 stats.py out/stats.svg
"""
import datetime, json, os, re, sys, urllib.request

OUT_PATH = sys.argv[1] if len(sys.argv) > 1 else "stats.svg"
import generate as g  # fonts and helpers

REPO = os.environ["GITHUB_REPOSITORY"]
TOKEN = os.environ.get("GITHUB_TOKEN", "")


def api(path):
    req = urllib.request.Request("https://api.github.com/repos/" + REPO + path,
                                 headers={"Accept": "application/vnd.github+json",
                                          "User-Agent": "mkcinema-readme-stats",
                                          **({"Authorization": "Bearer " + TOKEN} if TOKEN else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r), r.headers


repo, _ = api("")
releases, page = [], 1
while True:
    batch, _ = api(f"/releases?per_page=100&page={page}")
    releases += batch
    if len(batch) < 100:
        break
    page += 1
downloads = sum(a["download_count"] for r in releases for a in r.get("assets", []))
latest = next((r for r in releases if not r["draft"] and not r["prerelease"]), None)
_, h = api("/commits?per_page=1")
m = re.search(r'page=(\d+)>; rel="last"', h.get("Link", ""))
commits = int(m.group(1)) if m else 1


def short(n):
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M".replace(".0M", "M")
    if n >= 10_000:
        return f"{n/1000:.0f}K"
    if n >= 1000:
        return f"{n/1000:.1f}K".replace(".0K", "K")
    return str(n)


tiles = [
    ("i-play", "LATEST RELEASE", latest["tag_name"] if latest else "soon"),
    ("i-down", "APP DOWNLOADS", short(downloads)),
    ("i-sync", "COMMITS", short(commits)),
    ("i-tv", "PLATFORMS", "8"),
]
W, H = 1280, 210
tw = (W - 2 * 40 - 3 * 20) / 4
parts = []
for i, (icon, label, value) in enumerate(tiles):
    x = 40 + i * (tw + 20)
    attrs, body = g.symbol(icon)
    parts.append(f'''
<g transform="translate({x:.1f} 30)">
<rect width="{tw:.1f}" height="150" rx="26" fill="url(#bg)"/>
<rect x=".5" y=".5" width="{tw-1:.1f}" height="149" rx="25.5" fill="none" stroke="url(#st)"/>
<svg x="28" y="28" width="22" height="22" viewBox="0 0 24 24" {attrs} color="#d9d4c7">{body}</svg>
<path d="{g.SANS_MD.path(label, 12, 60, 44, track=0.24)}" fill="#9a9aa3"/>
<path class="n" style="animation-delay:{i*0.15:.2f}s" d="{g.SERIF.path(value, 58, 26, 122)}" fill="url(#p)"/>
</g>''')

stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%-d %b %Y").upper()
foot = g.SANS_MD.path(f"RELEASE, DOWNLOADS AND COMMITS LIVE FROM THE GITHUB API  ·  {stamp}", 11, W / 2, 202, track=0.26, anchor="middle")
svg = f'''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img"
 aria-label="Latest release {latest['tag_name'] if latest else 'none'}, {downloads} app downloads, {commits} commits, 8 platforms">
<title>MKCinema on GitHub</title>
<style>.n{{opacity:0;animation:n 1.2s cubic-bezier(.2,.7,.2,1) forwards}}@keyframes n{{from{{opacity:0;transform:translateY(10px)}}to{{opacity:1;transform:none}}}}
@media (prefers-reduced-motion: reduce){{.n{{animation:none;opacity:1}}}}</style>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17171a"/><stop offset="1" stop-color="#080809"/></linearGradient>
<linearGradient id="st" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".36"/><stop offset=".5" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity=".22"/></linearGradient>
<linearGradient id="p" x1="0" y1="0" x2="1" y2="1">{g.PLAT}</linearGradient>
</defs>
{"".join(parts)}
<path d="{foot}" fill="#6f6f78"/>
</svg>'''
svg = re.sub(r">\s+<", "><", svg.strip())
os.makedirs(os.path.dirname(os.path.abspath(OUT_PATH)), exist_ok=True)
with open(OUT_PATH, "w", encoding="utf-8") as fh:
    fh.write(svg + "\n")
print(f"stars={repo['stargazers_count']} downloads={downloads} commits={commits} latest={latest and latest['tag_name']}")
