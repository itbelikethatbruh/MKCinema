"""Prints jagged clip-path polygons for comic.css: teeth along each edge, depth in px. python3 -I gen_jag.py"""
import random
def jag(nx, ny, d, seed):
    r = random.Random(seed); pts = []
    def j(): return d * r.uniform(.55, 1.0)
    for i in range(nx):  # top, left to right
        pts += [f'{i / nx * 100:.2f}% 0', f'{(i + .5) / nx * 100:.2f}% {j():.1f}px']
    for i in range(ny):  # right
        pts += [f'100% {i / ny * 100:.2f}%', f'calc(100% - {j():.1f}px) {(i + .5) / ny * 100:.2f}%']
    for i in range(nx):  # bottom, right to left
        pts += [f'{100 - i / nx * 100:.2f}% 100%', f'{100 - (i + .5) / nx * 100:.2f}% calc(100% - {j():.1f}px)']
    for i in range(ny):  # left
        pts += [f'0 {100 - i / ny * 100:.2f}%', f'{j():.1f}px {100 - (i + .5) / ny * 100:.2f}%']
    return 'polygon(' + ','.join(pts) + ')'
SHAPES = {'POSTER': (6, 9, 7, 1), 'BAR': (34, 2, 7, 2), 'RAIL': (2, 26, 8, 3), 'PANEL': (22, 8, 10, 4), 'TAB': (4, 2, 5, 5)}


def fill(css):
    for k, a in SHAPES.items():
        css = css.replace(f'%JAG_{k}%', jag(*a))
    return css


if __name__ == '__main__':
    for k, a in SHAPES.items():
        print(k, jag(*a)[:80])
