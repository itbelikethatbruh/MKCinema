# 2.47 Smoother, sturdier player (patch)

Apply: `python3 patch.py path/to/index.html` (re-runnable). Built and tested on web 2.46.4 (after 2.46.2 simple-player).
It swaps 7 small spots in the core player code and adds block `mk-2470player` before the last </body>.
It stops without writing if a spot is missing. Apply it after any patch that wraps saveProgress, playStream,
wakeHud, toggleFull, renderSourceDrawer or PxLayout.paint (it must be the outer wrapper).

Suggested What's new line (public):
['better', 'Smoother, sturdier player', 'Keyboard and screen-reader friendly seek bar (0-9, Home and End jump), HLS streams ride out short network drops, playback starts sooner, a lighter progress bar, real full screen on iPhone and seek previews for HLS streams.']
