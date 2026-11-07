#!/usr/bin/env python3
"""Smoother, sturdier player (2.47): keyboard and screen-reader friendly controls, steadier HLS playback,
faster start, a lighter progress bar, cheaper progress saves, real full screen on iPhone, seek previews for HLS.
Re-runnable: each code swap is skipped once applied, and its own block is replaced if present, else inserted
before the last </body>. Stops without writing if any required spot is missing.
Usage: python3 patch.py path/to/index.html"""
import re, sys, pathlib
here = pathlib.Path(__file__).resolve().parent
target = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema/index.html')
html = target.read_text(encoding='utf-8')

# (name, old, new, required)
SWAPS = [
  ('bar-start',
   "$('#sCur').style.width = `${pct}%`; $('#sKnob').style.left = `${pct}%`; $('#sBuf').style.width = '0%';",
   "MkSeekPaint.cur(pct / 100); MkSeekPaint.buf(0);", True),
  ('bar-time',
   "  $('#pTime').textContent = live ? `LIVE · ${fmtTime(t)}` : `${fmtTime(t)} / ${fmtTime(d)}`;\n",
   "", True),
  ('bar-tick',
   "if (!P.scrubbing) { $('#sCur').style.width = `${pct}%`; $('#sKnob').style.left = `${pct}%`; }",
   "if (!P.scrubbing) MkSeekPaint.cur(pct / 100);", True),
  ('bar-buf',
   "$('#sBuf').style.width = `${((video.buffered.end(video.buffered.length - 1) + (P.remux ? P.remux.offset : 0)) / d) * 100}%`;",
   "MkSeekPaint.buf((video.buffered.end(video.buffered.length - 1) + (P.remux ? P.remux.offset : 0)) / d);", True),
  ('bar-drag',
   "const show = (p) => { $('#sCur').style.width = `${p * 100}%`; $('#sKnob').style.left = `${p * 100}%`; tip(p); };",
   "const show = (p) => { MkSeekPaint.cur(p); tip(p); };", True),
  ('hls-heal',
   """    const hls = P.hls = new Hls({ enableWorker: true, startPosition: startAt || -1, maxBufferLength: 40, backBufferLength: 60 });
    let netRetries = 0;
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return;
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !/manifest|level/i.test(d.details || '') && netRetries++ < 1) { hls.startLoad(); return; }
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && netRetries++ < 2) { hls.recoverMediaError(); return; }
      playbackFailed(stream, d.details || d.type);
    });
""",
   """    const hls = P.hls = new Hls({ enableWorker: true, startPosition: startAt || -1, maxBufferLength: 40, backBufferLength: 60, capLevelToPlayerSize: !IS_TV });
    MkHeal.hls(hls, stream, src);
""", True),
  ('native-retry',
   "video.addEventListener('error', () => { if (P.stream && !P.hls && P.stream.url) playbackFailed(P.stream, ",
   "video.addEventListener('error', () => { if (P.stream && !P.hls && P.stream.url) MkHeal.native(P.stream, ", True),
  ('preview-help',
   "It reads a little of the file in the background; HLS and Split Screen don’t use it.",
   "It reads a little of the file in the background; Split Screen doesn’t use it.", False),
]
missing = []
for name, old, new, req in SWAPS:
    if old in html:
        html = html.replace(old, new, 1); print(f'{name}: applied')
    elif new and new in html:
        print(f'{name}: already applied')
    elif not new and name == 'bar-time' and 'MkSeekPaint.cur(pct / 100);' in html:
        print(f'{name}: already applied')
    else:
        print(f'{name}: NOT FOUND'); (missing.append(name) if req else None)
if missing:
    sys.exit('stopped, nothing written: could not find ' + ', '.join(missing))

block = (here / 'player.html').read_text(encoding='utf-8').strip()
start, end = '<!-- mk-2470player:start -->', '<!-- mk-2470player:end -->'
wrapped = f'{start}\n{block}\n{end}\n'
if start in html:
    html = re.sub(re.escape(start) + r'.*?' + re.escape(end) + r'\n?', lambda m: wrapped, html, flags=re.S)
    print('mk-2470player: replaced')
else:
    i = html.rfind('</body>')
    assert i > 0, 'no </body>'
    html = html[:i] + wrapped + html[i:]
    print('mk-2470player: inserted')
target.write_text(html, encoding='utf-8')
