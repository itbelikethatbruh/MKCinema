# MKCinema 2.7.15 (Dee, 2026-10-31)
# - The featured banner no longer changes height from one film to the next: it keeps the tallest height it has
#   needed at the current width, and phones reserve room for a two-line title, meta and description up front.
# - Display serif: Bodoni Moda -> Fraunces at opsz 72 (the website's heading face; Bodoni's hairlines read badly
#   on Android), loaded with font-display:block so the intro and welcome never flash a fallback serif first.
# - Import from Stremio also brings watched history: films marked watched, and watched episodes decoded from
#   Stremio's watched bitfield (format from stremio-core's stremio-watched-bitfield crate).
# Usage: python3 2.7.15-hero-font-watched.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)

# ---- Featured banner height
rep("""  { const hb = $('#hero .hero-body'); hb.classList.remove('swap'); void hb.offsetWidth; hb.classList.add('swap'); }""",
    """  { const hb = $('#hero .hero-body'); hb.classList.remove('swap'); void hb.offsetWidth; hb.classList.add('swap'); }
  heroHold();""")
rep("""function showHero(i, dir = 1) {""",
    """/* The banner keeps the tallest height any slide has needed at this width, so swiping never makes it jump */
function heroHold() {
  const h = $('#hero'); if (S.heroW !== innerWidth) { S.heroW = innerWidth; S.heroH = 0; }
  h.style.minHeight = ''; S.heroH = Math.max(S.heroH || 0, h.offsetHeight); h.style.minHeight = `${S.heroH}px`;
}
function showHero(i, dir = 1) {""")
rep(""".hero-desc{color:#c9cfdd;margin:0 0 22px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;max-width:58ch}""",
    """.hero-desc{color:#c9cfdd;margin:0 0 22px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;max-width:58ch}
.hero-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hero-title[hidden]{display:none}
@media (max-width:760px){.hero{min-height:max(clamp(380px,56vh,620px),550px)}}""")

# ---- Display serif
rep("family=Bodoni+Moda:opsz,wght@6..96,400..700&", "")
rep('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,400..700,0..100,0..1;1,9..144,400..700,0..100,0..1&display=block">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora')
rep(""":root{--f-serif:"Bodoni Moda","Didot","Bodoni 72","Times New Roman",serif;--champ:#d9d4c7}""",
    """:root{--f-serif:"Fraunces",Georgia,"Times New Roman",serif;--champ:#d9d4c7}
#intro h1,.brand .word,.gs-n,.avatar,.tour-modal h2.tw-name,.tw-tag,.tw-pillars b,.tour-modal h2.tw-h,.tw-list em,.tw-cr b,.xr-ph::before{font-optical-sizing:none;font-variation-settings:"opsz" 72,"SOFT" 0,"WONK" 0}""")

# ---- Stremio watched history
rep("""        <label class="check"><input type="checkbox" id="siProg" checked>Watch progress (Continue watching)</label>""",
    """        <label class="check"><input type="checkbox" id="siProg" checked>Watch progress (Continue watching)</label>
        <label class="check"><input type="checkbox" id="siSeen" checked>Watched history (films and episodes you finished)</label>""")
rep(""".si-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0 8px}""",
    """.si-sum{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:16px 0 8px}""")
rep("""  async run(email, password, { library, progress, addons }) {""",
    """  /* Stremio stores a series' watched episodes as "anchorVideoId:anchorLength:base64(zlib(bits))", one bit per episode
     with episodes sorted by season, episode, then release date (stremio-core, stremio-watched-bitfield). */
  async seenEpisodes(it) {
    const parts = String((it.state || {}).watched || '').split(':'); if (parts.length < 3) return [];
    const b64 = parts.pop(), len = Number(parts.pop()), anchor = parts.join(':');
    const zipped = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bits = new Uint8Array(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const meta = await engine.fetchMeta('series', it._id);
    const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? -Infinity : Number(v));
    const cmp = (a, b) => (a === b ? 0 : a < b ? -1 : 1);
    const ids = ((meta && meta.videos) || []).filter((v) => v && v.id)
      .sort((a, b) => cmp(num(a.season), num(b.season)) || cmp(num(a.episode), num(b.episode)) || cmp(num(Date.parse(a.released)), num(Date.parse(b.released))))
      .map((v) => v.id);
    const at = ids.indexOf(anchor); if (at < 0 || !(len > 0)) return [];
    const off = len - at - 1;
    return ids.filter((id, i) => { const k = i + off; return k >= 0 && (k >> 3) < bits.length && (bits[k >> 3] >> (k % 8)) & 1; });
  },
  async run(email, password, { library, progress, addons, seen }) {""")
rep("""    const out = { saved: 0, progress: 0, addons: 0, skippedAddons: 0 };""",
    """    const out = { saved: 0, progress: 0, watched: 0, addons: 0, skippedAddons: 0 };""")
rep("""      if (library || progress) {""", """      if (library || progress || seen) {""")
rep("""          const st = it.state || {};
          if (library && !it.removed""",
    """          const st = it.state || {};
          if (seen) {
            const w = watchedMap(), when = Date.parse(st.lastWatched) || Date.now();
            const mark = (id) => { if (!w[id]) { w[id] = when; out.watched++; } };
            if (type === 'movie' && (st.timesWatched > 0 || st.flaggedWatched > 0)) mark(it._id);
            if (type === 'series' && st.watched) seenJobs.push(() => this.seenEpisodes(it).then((ids) => ids.forEach(mark)).catch(() => {}));
          }
          if (library && !it.removed""")
rep("""        const items = (await this.call('datastoreGet', { authKey, collection: 'libraryItem', ids: [], all: true })) || [];""",
    """        const items = (await this.call('datastoreGet', { authKey, collection: 'libraryItem', ids: [], all: true })) || [];
        const seenJobs = [];""")
rep("""        Store.set('watchlist', S.watchlist); Store.set('progress', S.progress);""",
    """        // series need their episode lists, so these run four at a time
        await Promise.all(Array.from({ length: 4 }, async () => { while (seenJobs.length) await seenJobs.shift()(); }));
        Store.set('watchlist', S.watchlist); Store.set('progress', S.progress); if (seen) Store.set('watched', watchedMap());""")
rep("""{ library: $('#siLib').checked, progress: $('#siProg').checked, addons: $('#siAdd').checked }""",
    """{ library: $('#siLib').checked, progress: $('#siProg').checked, seen: $('#siSeen').checked, addons: $('#siAdd').checked }""")
rep("""[[r.saved, 'titles added to your library'], [r.progress, 'items in progress'], [r.addons, 'addons installed']]""",
    """[[r.saved, 'titles added to your library'], [r.progress, 'items in progress'], [r.watched, 'films and episodes marked watched'], [r.addons, 'addons installed']]""")
rep("""help: 'Copies your Stremio library, watch progress and addons into MKCinema.""",
    """help: 'Copies your Stremio library, watch progress, watched history and addons into MKCinema.""")
open(p, 'w').write(s); print('patched')
# Review fix: Stremio keeps titles played but never saved as temporary library items; their progress and watched
# state now import too, while only saved items are added to the library.
s = open(p).read()
rep("if (!it || !it._id || it.temp) continue;", "if (!it || !it._id) continue;")
rep("if (library && !it.removed && ", "if (library && !it.temp && !it.removed && ")
open(p, 'w').write(s); print('patched temp items')
