"""TV player options (Android 1.6.1): audio language passed to the TV player, its Sources / Full player buttons handled,
and leaving the TV player always lands on the film's page. Usage: python3 patch.py index.html (idempotent)"""
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
if 'MKNative 1.6.1' in s: print('already patched'); sys.exit(0)
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:70]
    s = s.replace(a, b)
rep("subUrl, matchRate: CFG.matchRate !== false, headers: nativeHdr ? headers : undefined }))",
    "subUrl, matchRate: CFG.matchRate !== false, audioLang: CFG.audioOnly || '', headers: nativeHdr ? headers : undefined }))")
rep("""      done(pos, dur, ended, next, err) {
        const c = TvPlayer.cur; if (!c) return;""", """      done(pos, dur, ended, next, err, act) { // MKNative 1.6.1: act = 'sources' | 'web' from the TV player's options row
        const c = TvPlayer.cur; if (!c) return;
        if (act === 'web') {
          // keep watching in MKCinema's own player (subtitle search and styling, every audio track, sources drawer)
          TvPlayer.save(pos, dur); TvPlayer.cur = null; c.stream._noNative = true; lu(c.stream, pos > 0 ? pos / 1000 : c.startAt); return;
        }""")
rep("""        if (!$('#player').hidden) closePlayer();
        if (S.view === 'home') renderHome(); else if (S.view === 'library') renderLibrary();
      },""", """        if (!$('#player').hidden) closePlayer();
        if (S.view === 'home') renderHome(); else if (S.view === 'library') renderLibrary();
        // like outside players, leaving the TV player lands on the film's page with its sources, never back on Home
        const m = c.ctx.meta, onIt = !$('#detail').hidden && D.meta && D.meta.id === m.id;
        if (!onIt) openDetail(m, { videoId: c.ctx.video ? videoIdFor(m, c.ctx.video) : undefined });
        if (act === 'sources') {
          let n = 0; const go = () => { const st = $('#dStreams'), f = st && st.querySelector('[data-nav],button,a');
            if (f) { st.scrollIntoView({ block: 'start' }); Nav.focus(f, true); } else if (++n < 20) setTimeout(go, 250); };
          setTimeout(go, onIt ? 60 : 400);
        }
      },""")
open(p, 'w', encoding='utf-8').write(s); print('patched')
