#!/usr/bin/env python3
"""2.47 More interface languages: Tamil, Telugu, Bengali, Malayalam and Samoan.
Usage: python3 -I patch.py path/to/mkcinema   (the folder that holds index.html; idempotent)
- copies i18n/{ta,te,bn,ml,sm}.json next to index.html (run build.py first if you changed src/)
- adds the five languages to the early fetch in <head> and to I18N.langs (Settings > Appearance > Language)
- turns the Hindi-only Devanagari font helper into one helper for Devanagari, Tamil, Telugu, Bengali and Malayalam
- adds the stremio-translations MIT credit to Settings > About & licenses
- adds one What's new line under the current APP_VERSION (does not change the version)"""
import re, sys, json, shutil, pathlib
here = pathlib.Path(__file__).resolve().parent
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema')
p = root / 'index.html'
s = p.read_text(encoding='utf-8')
NEW = ['ta', 'te', 'bn', 'ml', 'sm']

def must(old, new, label):
    global s
    if new in s:
        return
    if s.count(old) != 1:
        sys.exit(f'patch: anchor for {label} found {s.count(old)} times')
    s = s.replace(old, new)

# 1. early fetch in <head>: both regexes list the language codes
for a, b in [(r"/^(en|es|pt|fr|de|it|hi)$/", r"/^(en|es|pt|fr|de|it|hi|ta|te|bn|ml|sm)$/"),
             (r"/^(es|pt|fr|de|it|hi)$/", r"/^(es|pt|fr|de|it|hi|ta|te|bn|ml|sm)$/")]:
    must(a, b, 'head language list')

# 2. the language list in Settings
must("hi: 'हिन्दी' },", "hi: 'हिन्दी', ta: 'தமிழ்', te: 'తెలుగు', bn: 'বাংলা', ml: 'മലയാളം', sm: 'Gagana Samoa' },", 'I18N.langs')
must("""/* ---------------- 2.15.0 Interface languages ----------------
   Menus, buttons, settings and messages in Spanish, Portuguese (Brazil), French, German, Italian or Hindi.""",
     """/* ---------------- 2.15.0 Interface languages ----------------
   Menus, buttons, settings and messages in Spanish, Portuguese (Brazil), French, German, Italian, Hindi, Tamil, Telugu,
   Bengali, Malayalam or Samoan (2.47).""", 'header comment')

# 3. one font helper for every Indian script
must("if (this.code === 'hi' && !p.hasAttribute('data-deva')) p.setAttribute('data-deva', ''); // see deva()",
     "if (this.SCRIPT[this.code] && !p.hasAttribute('data-deva')) p.setAttribute('data-deva', ''); // see deva()", 'node() marker')
must("if (this.code === 'hi') this.deva();", "if (this.SCRIPT[this.code]) this.deva();", 'init() font call')
a = s.find("  // Hindi: the app's fonts (Onest, Sora")
b = s.find("    new MutationObserver(scan).observe(document.head, { childList: true });\n  },", a)
if "SCRIPT: {" not in s:
    if a < 0 or b < 0:
        sys.exit('patch: deva() block not found')
    b += len("    new MutationObserver(scan).observe(document.head, { childList: true });\n  },")
    s = s[:a] + (here / 'deva.js').read_text(encoding='utf-8').rstrip('\n') + s[b:]

# 4. licence credit (the shared translations are MIT, same notice as the SDK)
must("<b>Stremio Add-on SDK and stremio-core</b><small>The companion server uses the Stremio Add-on SDK to serve its add-on. Stremio import reads watched history in the format stremio-core stores it (its watched-bitfield module). Both are MIT licensed under this notice.</small>",
     "<b>Stremio Add-on SDK, stremio-core and stremio-translations</b><small>The companion server uses the Stremio Add-on SDK to serve its add-on. Stremio import reads watched history in the format stremio-core stores it (its watched-bitfield module). Some Tamil and Bengali interface words come from stremio-translations and its volunteer translators. All three are MIT licensed under this notice.</small>",
     'licence text')
must("""<i data-lucide="external-link"></i>stremio-core</a></div>""",
     """<i data-lucide="external-link"></i>stremio-core</a><a class="lic-link" href="https://github.com/Stremio/stremio-translations" target="_blank" rel="noopener" data-nav><i data-lucide="external-link"></i>stremio-translations</a></div>""",
     'licence link')

# 5. What's new
ver = re.search(r"APP_VERSION = '([^']+)'", s).group(1)
item = "    ['new', 'Five more languages', 'MKCinema now speaks Tamil, Telugu, Bengali, Malayalam and Samoan. Pick one in Settings › Appearance › Language.'],\n"
if 'Five more languages' not in s:
    m = re.search(r"const RELEASES = \[\n  \{ v: '([^']+)', date: '[^']+', items: \[\n", s)
    if m and m.group(1) == ver:
        s = s[:m.end()] + item + s[m.end():]
    else:
        at = s.index('const RELEASES = [\n') + len('const RELEASES = [\n')
        s = s[:at] + f"  {{ v: '{ver}', date: '2026-11-07', items: [\n{item}  ] }},\n" + s[at:]

p.write_text(s, encoding='utf-8')
(root / 'i18n').mkdir(exist_ok=True)
for c in NEW:
    shutil.copyfile(here / 'i18n' / f'{c}.json', root / 'i18n' / f'{c}.json')
print('patched', p, 'version', ver)
