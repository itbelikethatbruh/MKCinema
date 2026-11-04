# MKCinema 2.7.23 (Drake, 2026-11-04)
# Leaving VLC (or any outside player) dropped people back onto an empty in-app player with an "Opening in VLC" panel,
# whose buttons collided with the player's own play/rewind/forward controls. Now a hand-off to an outside player never
# opens the in-app player at all: MKCinema stays on (or opens) the film's page with its source list, launches the app,
# and that is where you land when you come back. If the app never takes over (not installed, or the browser wanted a
# tap first), a quiet note says so, and the source list is right there to try again.
# Usage: python3 2.7.23-external-return.py index.html sw.js
import sys
p, swp = sys.argv[1], sys.argv[2]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)

rep("""/* Hand the current stream to the chosen app. Called from playStream when Settings › Playback picks an outside player. */
function launchExternal(p, stream) {""",
"""/* Hand-off to an outside player (2.7.23). The in-app player never opens for it: MKCinema stays on the film's page with
   its sources, so leaving VLC (or any player) lands right back there. If the page never loses focus, the app did not
   take over, and a quiet note says so; the source list underneath is already there to pick again. */
const Handoff = {
  t: 0, left: false,
  init() {
    const gone = () => { if (this.t) this.left = true; };
    addEventListener('blur', gone); addEventListener('pagehide', gone);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') gone(); });
  },
  launch(p, ctx, stream) {
    const url = handoffUrl(stream), title = streamTitle(ctx), name = playerName(p);
    // Land on this film's page (and episode) so coming back shows its sources
    const sameFilm = !$('#detail').hidden && D.meta && D.meta.id === ctx.meta.id && (!ctx.video || (D.video && D.video.id === ctx.video.id));
    if (!sameFilm) openDetail(ctx.meta, { videoId: ctx.video ? videoIdFor(ctx.meta, ctx.video) : undefined });
    if (p.m3u) { downloadM3U(url, title); toast(`Playlist saved. Open it to start ${title} in your video player.`, 'ok', 5200, 'handoff'); return; }
    toast(`Opening in ${name}…`, 'info', 2400, 'handoff');
    this.left = false; const t0 = this.t = Date.now();
    try { location.href = p.link(url, title); } catch (e) { /* reported below */ }
    setTimeout(() => {
      if (this.t !== t0) return; this.t = 0;
      // A late timer means the page was frozen while the app played, so it did open
      if (this.left || document.visibilityState === 'hidden' || Date.now() - t0 > 6000) return;
      toast(`${name[0].toUpperCase() + name.slice(1)} did not open. Check it is installed, or pick the source again. Settings › Playback can switch to the built-in player.`, 'err', 7000, 'handoff');
    }, 2600);
  },
};
Handoff.init();
function launchExternal(p, stream) {""")
# The old "Opening in VLC" panel is removed entirely
a = s.index("function launchExternal(p, stream) {"); b = s.index("function showMsg(title"); s = s[:a] + s[b:]
# The player's own "Open in another app" menu closes the player first, so coming back lands on the film's page too
rep("""  $$('[data-xp]', m).forEach((b) => b.addEventListener('click', () => { const p = PLAYERS.find((x) => x.id === b.dataset.xp); saveProgress(true); video.pause(); m.hidden = true; launchExternal(p, P.stream); }));""",
"""  $$('[data-xp]', m).forEach((b) => b.addEventListener('click', () => { const p = PLAYERS.find((x) => x.id === b.dataset.xp), ctx = P.ctx, st = P.stream; m.hidden = true; closePlayer(); Handoff.launch(p, ctx, st); }));""")

rep("""  stream._tel = stream._tel || Telemetry.parse(stream);
  const wasOpen = !$('#player').hidden;""",
"""  stream._tel = stream._tel || Telemetry.parse(stream);
  if (stream._tel.kind !== 'ext' && stream._tel.kind !== 'p2p' && extPlayer() && handoffUrl(stream) && !P.force) {
    if (!$('#player').hidden) closePlayer();
    Handoff.launch(extPlayer(), ctx, stream); return;
  }
  const wasOpen = !$('#player').hidden;""")

rep("""  } else if (extPlayer() && handoffUrl(stream) && !P.force) {
    video.removeAttribute('src'); launchExternal(extPlayer(), stream); P.force = false; startAmbilight(); return;
  } else if""", "  } else if")

rep("const APP_VERSION = '2.7.22';", "const APP_VERSION = '2.7.23';")
open(p, 'w').write(s)
w = open(swp).read(); assert "mkc-2.7.22" in w
open(swp, 'w').write(w.replace("mkc-2.7.22", "mkc-2.7.23"))
print('ok')
