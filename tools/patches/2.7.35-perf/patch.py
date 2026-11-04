#!/usr/bin/env python3
"""MKCinema 2.7.33 perf pass. Usage: python3 -I patch.py path/to/index.html
Idempotent: run again after other patches and it only refreshes the inline icon set.
- Startup no longer blocks on 840 KB of third-party scripts:
  * lucide (355 KB, 1700 icons) -> the ~icons the app actually names, inlined; anything missing loads full lucide lazily
  * hls.js (413 KB) -> loaded when a details page opens, and awaited before an .m3u8 plays
  * gsap (72 KB) -> not loaded on TVs (it only drives the desktop/phone intro, which TVs skip)
- TV: focus changes no longer run opacity/transform/colour transitions (each one repainted the page every frame)
Does not touch the Saver / Ambient Mode block."""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
path = sys.argv[1]
s = open(path, encoding='utf-8').read()
orig = s

def sub1(old, new, label):
    global s
    if new and new in s: return
    if not new and old not in s: return
    n = s.count(old)
    if n != 1: sys.exit(f'anchor {label}: found {n} times')
    s = s.replace(old, new)

LUCIDE_URL = 'https://unpkg.com/lucide@0.454.0/dist/umd/lucide.min.js'
HLS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js'
GSAP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js'

# 1) head scripts
sub1(f'<script src="{GSAP_URL}"></script>\n',
     '<script>/* perf-2.7.33: the intro animation library is skipped on TVs, which never show the intro */'
     f'if(!document.documentElement.classList.contains(\'tv\'))document.write(\'<script src="{GSAP_URL}"><\\/script>\')</script>\n', 'gsap')
sub1(f'<script src="{HLS_URL}"></script>\n', '', 'hls')

# 2) icons: inline only the icons the app names (regenerated on every run, so icons added later are picked up)
full = json.load(open(os.path.join(HERE, 'lucide-0.454.0-icons.json')))
pascal = lambda n: re.sub(r'(\w)(\w*)(_|-|\s*)', lambda m: m.group(1).upper() + m.group(2).lower(), n)
body = re.sub(r'<script id="mkc-icons">.*?</script>', '', s, flags=re.S)
names = set(re.findall(r'data-lucide="([a-z0-9-]+)"', body))
names |= {t for t in re.findall(r"['\"]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['\"]", body) if pascal(t) in full}
used = {pascal(n): full[pascal(n)] for n in sorted(names) if pascal(n) in full}
ICONS = ('<script id="mkc-icons">/* perf-2.7.33: lucide 0.454.0 (ISC), only the icons MKCinema uses. An icon not in this set loads the full library */\n'
  'window.lucide={icons:' + json.dumps(used, separators=(',', ':')) + ','
  'createElement(c){const A={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"},'
  'mk=(t,a,k)=>{const e=document.createElementNS("http://www.w3.org/2000/svg",t);for(const n in a)e.setAttribute(n,a[n]);if(k)for(const x of k)e.appendChild(mk(x[0],x[1],x[2]));return e};'
  'return Array.isArray(c[0])?mk("svg",A,c):mk(c[0],c[1],c[2])},'
  f'lazy(){{if(this._p)return;this._p=1;const s=document.createElement("script");s.src="{LUCIDE_URL}";s.async=true;s.onload=()=>{{try{{icons()}}catch(e){{}}}};document.head.appendChild(s)}}}};</script>\n')
if '<script id="mkc-icons">' in s:
    s = re.sub(r'<script id="mkc-icons">.*?</script>\n', lambda m: ICONS, s, count=1, flags=re.S)
else:
    sub1(f'<script src="{LUCIDE_URL}"></script>\n', ICONS, 'lucide')
sub1("if (tpl === undefined) { const node = L.icons[iconKey(name)]; tpl = node ? L.createElement(node) : null; ICON_TPL.set(name, tpl); }",
     "if (tpl === undefined) { const node = L.icons[iconKey(name)]; if (!node && L.lazy) { L.lazy(); continue; } tpl = node ? L.createElement(node) : null; ICON_TPL.set(name, tpl); }", 'icons()')

# 3) hls.js on demand
sub1("function loadUrl(stream, startAt) {\n  const bh = stream.behaviorHints || {};",
"""/* perf-2.7.33: hls.js (400 KB) is fetched when a details page opens, not at startup; an .m3u8 waits for it */
const HlsLoad = {
  p: null, failed: false, tok: 0,
  get() {
    if (window.Hls) return Promise.resolve(window.Hls);
    return this.p || (this.p = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = '%s'; s.async = true;
      s.onload = () => res(window.Hls); s.onerror = () => { this.p = null; this.failed = true; s.remove(); rej(new Error('hls.js did not load')); };
      document.head.appendChild(s);
    }));
  },
  warm() { if (window.Hls || this.p) return; const go = () => this.get().catch(() => {}); if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 1200); },
};
function loadUrl(stream, startAt) {
  const hlsTok = ++HlsLoad.tok;
  if (!window.Hls && !HlsLoad.failed && !stream._local && /\\.m3u8(\\?|$)/i.test(stream.url || '')) {
    HlsLoad.get().catch(() => {}).then(() => { if (hlsTok === HlsLoad.tok && !$('#player').hidden) loadUrl(stream, startAt); });
    return;
  }
  const bh = stream.behaviorHints || {};""" % HLS_URL, 'loadUrl')
sub1("/\\.m3u8(\\?|$)/i.test(stream.url) && window.Hls && Hls.isSupported()) return;",
     "/\\.m3u8(\\?|$)/i.test(stream.url) && (window.Hls ? Hls.isSupported() : !!window.MediaSource)) return;", 'dsp')
sub1("async function openDetail(seed, { videoId } = {}) {\n  remember(seed);",
     "async function openDetail(seed, { videoId } = {}) {\n  remember(seed); HlsLoad.warm();", 'openDetail')

# 4) TV: instant focus everywhere, not just on posters
CSS = """<style id="perf-2733">
/* ===== 2.7.33 perf: on TVs every focus move is instant. Fades on poster info and buttons repainted the whole page on each frame ===== */
html.tv :is(button,a,input,select,[data-nav],[tabindex],.card,.card *,.l1,.info,.badge-q,.chip,.tab,.ibtn,.btn):not(#saver):not(#saver *){transition:none!important}
</style>
"""
if 'id="perf-2733"' not in s:
    sub1('</head>', CSS + '</head>', 'head end')

if s != orig:
    open(path, 'w', encoding='utf-8').write(s)
print(f'ok: {len(used)} icons inlined ({len(json.dumps(used, separators=(",", ":"))) // 1024} KB); changed={s != orig}')
