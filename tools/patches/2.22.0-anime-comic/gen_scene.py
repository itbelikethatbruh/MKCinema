"""Draws the Anime look's parallax scene as three SVG layers (sky, far city, near rooftops) into anime/.
Deterministic (seeded), so re-running gives the same files.  python3 -I gen_scene.py
"""
import math, os, random

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, 'anime')
W, H = 1920, 1080
INK = '#0a0410'


def svg(body, defs=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice">'
            f'<defs>{defs}</defs>{body}</svg>\n')


def sky():
    r = random.Random(7)
    d = ('<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07030f"/>'
         '<stop offset=".45" stop-color="#1a0a33"/><stop offset=".75" stop-color="#4a0f45"/><stop offset="1" stop-color="#8c1640"/></linearGradient>'
         '<radialGradient id="m" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#fff6f8"/><stop offset=".7" stop-color="#ffd3df"/><stop offset="1" stop-color="#ff9db6"/></radialGradient>'
         '<radialGradient id="h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff4d7a" stop-opacity=".45"/><stop offset="1" stop-color="#ff4d7a" stop-opacity="0"/></radialGradient>'
         '<pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="7" cy="7" r="2.2" fill="#ff8fb0"/></pattern>'
         '<clipPath id="mc"><circle cx="1380" cy="330" r="190"/></clipPath>')
    b = [f'<rect width="{W}" height="{H}" fill="url(#g)"/>']
    # speed lines from the moon, very faint
    cx, cy = 1380, 330
    for i in range(72):
        a = i / 72 * math.tau + r.uniform(-.02, .02)
        r0, r1 = 230 + r.uniform(0, 40), 1400
        w = r.uniform(1.5, 5)
        b.append(f'<path d="M{cx + math.cos(a) * r0:.0f} {cy + math.sin(a) * r0:.0f}L{cx + math.cos(a + .006 * w) * r1:.0f} {cy + math.sin(a + .006 * w) * r1:.0f}L{cx + math.cos(a - .006 * w) * r1:.0f} {cy + math.sin(a - .006 * w) * r1:.0f}Z" fill="#ffd6e2" opacity="{r.uniform(.025, .06):.3f}"/>')
    # stars: dots and four-point sparkles
    for i in range(140):
        x, y, s = r.uniform(0, W), r.uniform(0, H * .62), r.uniform(.6, 2.2)
        b.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{s:.1f}" fill="#fff" opacity="{r.uniform(.35, .9):.2f}"/>')
    for i in range(14):
        x, y, s = r.uniform(60, W - 60), r.uniform(40, H * .5), r.uniform(7, 15)
        b.append(f'<path d="M{x:.0f} {y - s:.0f}Q{x:.0f} {y:.0f} {x + s:.0f} {y:.0f}Q{x:.0f} {y:.0f} {x:.0f} {y + s:.0f}Q{x:.0f} {y:.0f} {x - s:.0f} {y:.0f}Q{x:.0f} {y:.0f} {x:.0f} {y - s:.0f}Z" fill="#ffe4ee" opacity=".85"/>')
    # moon: glow, disc, halftone shading, ink rim, crimson slash
    b.append(f'<circle cx="{cx}" cy="{cy}" r="420" fill="url(#h)"/>')
    b.append(f'<circle cx="{cx}" cy="{cy}" r="190" fill="url(#m)"/>')
    b.append(f'<g clip-path="url(#mc)"><circle cx="{cx + 120}" cy="{cy + 90}" r="210" fill="url(#dots)" opacity=".55"/>'
             f'<circle cx="{cx - 60}" cy="{cy - 30}" r="34" fill="#ffc2d2" opacity=".55"/><circle cx="{cx + 50}" cy="{cy + 60}" r="22" fill="#ffc2d2" opacity=".5"/><circle cx="{cx + 70}" cy="{cy - 80}" r="14" fill="#ffc2d2" opacity=".5"/></g>')
    b.append(f'<circle cx="{cx}" cy="{cy}" r="190" fill="none" stroke="{INK}" stroke-width="6" opacity=".5"/>')
    # clouds: flat manga wisps with an ink edge
    for (x, y, s) in [(260, 470, 1.25), (900, 560, 1), (1560, 600, 1.15), (560, 250, .8)]:
        p = f'M{x} {y}c{30 * s:.0f} {-34 * s:.0f} {80 * s:.0f} {-34 * s:.0f} {100 * s:.0f} {-6 * s:.0f}c{24 * s:.0f} {-30 * s:.0f} {84 * s:.0f} {-26 * s:.0f} {96 * s:.0f} {6 * s:.0f}c{40 * s:.0f} {-10 * s:.0f} {78 * s:.0f} {6 * s:.0f} {84 * s:.0f} {30 * s:.0f}h{-300 * s:.0f}c{-22 * s:.0f} 0 {-30 * s:.0f} {-24 * s:.0f} {20 * s:.0f} {-30 * s:.0f}Z'
        b.append(f'<path d="{p}" fill="#2c0f3f" stroke="#ff6f95" stroke-opacity=".35" stroke-width="3"/>')
    return svg(''.join(b), d)


def far():
    r = random.Random(11)
    b = []
    x = -20
    while x < W + 20:
        w = r.choice([60, 70, 90, 110, 130])
        h = r.uniform(140, 330)
        y = H - h - 120
        b.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w}" height="{h + 200:.0f}" fill="#240c3a"/>')
        if r.random() < .3:
            b.append(f'<rect x="{x + w / 2 - 2:.0f}" y="{y - 40:.0f}" width="4" height="40" fill="#240c3a"/><circle cx="{x + w / 2:.0f}" cy="{y - 42:.0f}" r="4" fill="#ff2d55"/>')
        for wy in range(int(y + 14), int(H - 100), 22):
            for wx in range(int(x + 10), int(x + w - 12), 18):
                if r.random() < .16:
                    c = r.choice(['#ff7aa0', '#ffd27a', '#b48cff'])
                    b.append(f'<rect x="{wx}" y="{wy}" width="8" height="10" fill="{c}" opacity="{r.uniform(.45, .9):.2f}"/>')
        x += w + r.uniform(-8, 6)
    # a lattice radio tower and a pagoda on the skyline
    tx, ty = 560, H - 640
    b.append(f'<path d="M{tx} {ty}L{tx - 70} {H}L{tx + 70} {H}Z" fill="none" stroke="#ff2d55" stroke-width="6"/>')
    for i in range(1, 12):
        yy = ty + i * 46; hw = 70 * (yy - ty) / (H - ty)
        b.append(f'<path d="M{tx - hw:.0f} {yy}L{tx + hw:.0f} {yy}M{tx - hw:.0f} {yy}L{tx + hw * .7:.0f} {yy + 46}M{tx + hw:.0f} {yy}L{tx - hw * .7:.0f} {yy + 46}" stroke="#ff2d55" stroke-width="2.5" opacity=".8"/>')
    b.append(f'<rect x="{tx - 26}" y="{ty + 160}" width="52" height="16" fill="#ff2d55"/><rect x="{tx - 3}" y="{ty - 60}" width="6" height="60" fill="#ff2d55"/><circle cx="{tx}" cy="{ty - 64}" r="6" fill="#fff"/>')
    px, py = 1660, H - 520
    for i in range(5):
        wv = 150 - i * 24; yy = py + i * 64
        b.append(f'<path d="M{px - wv} {yy + 30}Q{px - wv * .5:.0f} {yy + 14} {px} {yy}Q{px + wv * .5:.0f} {yy + 14} {px + wv} {yy + 30}L{px + wv - 18} {yy + 34}L{px - wv + 18} {yy + 34}Z" fill="#1a0629"/>'
                 f'<rect x="{px - wv * .6:.0f}" y="{yy + 34}" width="{wv * 1.2:.0f}" height="30" fill="#2a0c40"/>'
                 f'<rect x="{px - 10}" y="{yy + 40}" width="20" height="16" fill="#ffb36b" opacity=".7"/>')
    b.append(f'<rect x="{px - 3}" y="{py - 70}" width="6" height="70" fill="#1a0629"/>')
    b.append(f'<rect y="{H - 130}" width="{W}" height="130" fill="#240c3a"/>')
    return svg(''.join(b))


def near():
    r = random.Random(23)
    b = []
    x = -40
    tops = []
    while x < W + 40:
        w = r.uniform(160, 320); h = r.uniform(70, 200); y = H - h
        b.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h + 10:.0f}" fill="{INK}" stroke="#ff2d55" stroke-opacity=".35" stroke-width="2"/>')
        b.append(f'<path d="M{x:.0f} {y:.0f}h{w:.0f}" stroke="#b48cff" stroke-opacity=".5" stroke-width="2"/>')
        k = r.random()
        if k < .35:  # water tank
            cx = x + w * r.uniform(.25, .7)
            b.append(f'<rect x="{cx - 26:.0f}" y="{y - 70:.0f}" width="52" height="46" rx="6" fill="{INK}" stroke="#b48cff" stroke-opacity=".45" stroke-width="2"/>'
                     f'<path d="M{cx - 20:.0f} {y - 24:.0f}L{cx - 26:.0f} {y:.0f}M{cx + 20:.0f} {y - 24:.0f}L{cx + 26:.0f} {y:.0f}" stroke="{INK}" stroke-width="5"/>')
        elif k < .6:  # railing
            b.append(f'<path d="M{x + 10:.0f} {y - 22:.0f}h{w - 20:.0f}" stroke="{INK}" stroke-width="4"/>' + ''.join(
                f'<path d="M{xx:.0f} {y - 22:.0f}v22" stroke="{INK}" stroke-width="3"/>' for xx in [x + 10 + i * 18 for i in range(int((w - 20) / 18) + 1)]))
        tops.append((x, y, w))
        x += w + r.uniform(0, 24)
    # power poles with sagging wires
    poles = [180, 820, 1460]
    for p in poles:
        b.append(f'<rect x="{p - 6}" y="{H - 560}" width="12" height="560" fill="{INK}"/>'
                 f'<rect x="{p - 60}" y="{H - 530}" width="120" height="9" fill="{INK}"/><rect x="{p - 44}" y="{H - 490}" width="88" height="7" fill="{INK}"/>')
    for i, yo in enumerate([526, 522, 487]):
        for a, c in zip(poles, poles[1:] + [W + 400]):
            sag = 70 + i * 12
            b.append(f'<path d="M{a - 50 + i * 30} {H - yo}Q{(a + c) / 2:.0f} {H - yo + sag} {c - 50 + i * 30} {H - yo}" fill="none" stroke="{INK}" stroke-width="2.5"/>')
        b.append(f'<path d="M{-400} {H - yo}Q{(-400 + poles[0]) / 2:.0f} {H - yo + 70} {poles[0] - 50 + i * 30} {H - yo}" fill="none" stroke="{INK}" stroke-width="2.5"/>')
    # torii on a hill at the right edge
    gx, gy = 1760, H - 300
    b.append(f'<path d="M{gx - 150} {gy}Q{gx} {gy - 26} {gx + 150} {gy}L{gx + 140} {gy + 22}Q{gx} {gy}{gx - 140} {gy + 22}Z" fill="#e3123f" stroke="{INK}" stroke-width="5"/>'
             f'<rect x="{gx - 120}" y="{gy + 44}" width="240" height="16" fill="#e3123f" stroke="{INK}" stroke-width="4"/>'
             f'<rect x="{gx - 98}" y="{gy + 18}" width="22" height="300" fill="#e3123f" stroke="{INK}" stroke-width="5"/>'
             f'<rect x="{gx + 76}" y="{gy + 18}" width="22" height="300" fill="#e3123f" stroke="{INK}" stroke-width="5"/>')
    return svg(''.join(b))


def branch():
    """A sakura branch for the top-left corner, the nearest layer."""
    r = random.Random(5)
    b = [f'<path d="M-40 60C120 90 240 70 380 150C460 196 520 190 600 170" fill="none" stroke="{INK}" stroke-width="22" stroke-linecap="round"/>'
         f'<path d="M-40 60C120 90 240 70 380 150C460 196 520 190 600 170" fill="none" stroke="#5a2a6e" stroke-width="3" stroke-linecap="round" transform="translate(0 -8)"/>'
         f'<path d="M200 86C230 140 230 190 210 240M380 150C400 200 440 230 470 240" fill="none" stroke="{INK}" stroke-width="10" stroke-linecap="round"/>']
    pts = [(r.uniform(40, 620), r.uniform(30, 260)) for _ in range(46)]
    for (x, y) in pts:
        s = r.uniform(.7, 1.3); rot = r.uniform(0, 72)
        petals = ''.join(f'<path d="M0 0C-9 -6 -9 -20 0 -24C9 -20 9 -6 0 0Z" transform="rotate({k * 72 + rot:.0f})"/>' for k in range(5))
        b.append(f'<g transform="translate({x:.0f} {y:.0f}) scale({s:.2f})" fill="#ffc4d6" stroke="#ff5d86" stroke-width="1.5">{petals}<circle r="4" fill="#ff2d55" stroke="none"/></g>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 0 700 300">{"".join(b)}</svg>\n'


for name, fn in [('sky', sky), ('far', far), ('near', near)]:
    open(os.path.join(out, f'{name}.svg'), 'w').write(fn())
open(os.path.join(out, 'branch.svg'), 'w').write(branch())
print('scene written')
