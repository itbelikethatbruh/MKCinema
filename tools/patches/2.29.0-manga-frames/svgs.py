"""The small SVGs behind the 2.29.0 manga frames, as CSS url() values. Thin pink ink lines, nothing filled big.
FRAME   9-slice (60 box, slice 20): a panel outline with cut top-left and bottom-right corners. The corners are inked
        firmly, the long edges fade, a second crimson cut sits inside each cut corner, three hatch ticks top-right and
        a small diamond bottom-left. Used by the banner, the Anime splash, the menu bar, the phone tab bar, the drawer.
BRACKET 9-slice (30 box, slice 10): corner brackets only (top-left, bottom-right) and a dot. Posters on hover/focus.
SECTION 9-slice (42 box, slice 14): the brackets plus a faint hairline edge. Settings cards and pop-up windows.
TONE    a 520x340 halftone that fades out from the bottom-left corner. Panel surfaces only, never on posters."""
from urllib.parse import quote

P, R = '#ff8fb4', '#ff2d55'

FRAME = f'''<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60" fill="none" stroke-linecap="square">
<path d="M20 .75H40M59.25 20V40M40 59.25H20M.75 40V20" stroke="{P}" stroke-opacity=".34"/>
<path d="M20 .75H12.3L.75 12.3V20M59.25 40V47.7L47.7 59.25H40" stroke="{P}" stroke-width="1.4"/>
<path d="M40 .75H59.25V20M.75 40V59.25H20" stroke="{P}" stroke-opacity=".62"/>
<path d="M5 15L15 5M45 55L55 45" stroke="{R}" stroke-width="1.6"/>
<path d="M46.5 3.5l-2.5 4M50.5 3.5l-2.5 4M54.5 3.5l-2.5 4" stroke="{P}" stroke-opacity=".85"/>
<path d="M6 51.6l2.2 2.4-2.2 2.4-2.2-2.4z" fill="{P}" stroke="none"/></svg>'''

BRACKET = f'''<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30" fill="none">
<path d="M1 10V1h9M29 20v9h-9" stroke="{P}" stroke-width="1.6"/>
<circle cx="26.5" cy="3.5" r="1.3" fill="{R}"/></svg>'''

SECTION = f'''<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42" fill="none">
<path d="M14 .5h14M41.5 14v14M28 41.5H14M.5 28V14" stroke="{P}" stroke-opacity=".18"/>
<path d="M14 .75H.75V14M41.25 28v13.25H28" stroke="{P}" stroke-width="1.5"/>
<path d="M28 .5h13.5V14M.5 28v13.5H14" stroke="{P}" stroke-opacity=".18"/>
<path d="M4.5 8.5l4-4" stroke="{R}" stroke-width="1.4"/>
<circle cx="36.5" cy="5.5" r="1.2" fill="{R}"/></svg>'''

TONE = f'''<svg xmlns="http://www.w3.org/2000/svg" width="520" height="340"><defs>
<pattern id="d" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4" cy="4" r="1.15" fill="{P}"/></pattern>
<radialGradient id="g" cx="0" cy="1" r="1"><stop offset="0" stop-color="#fff"/><stop offset=".85" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="m"><rect width="520" height="340" fill="url(#g)"/></mask></defs>
<rect width="520" height="340" fill="url(#d)" mask="url(#m)" opacity=".2"/></svg>'''


def url(svg):
    return 'url("data:image/svg+xml,' + quote(' '.join(svg.split()), safe=' =:/,.-') + '")'


def fill(css):
    for k, v in (('FRAME', FRAME), ('BRACKET', BRACKET), ('SECTION', SECTION), ('TONE', TONE)):
        css = css.replace(f'%SVG_{k}%', url(v))
    return css
