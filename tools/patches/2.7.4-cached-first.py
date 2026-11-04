# MKCinema 2.7.4: cached debrid sources first. Usage: python3 2.7.4-cached-first.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)

# 05-app: "Cached" filter chip (only when some sources say they are cached)
rep("""  if (f === 'web') return streams.filter((s) => s._tel.webReady);
""", """  if (f === 'web') return streams.filter((s) => s._tel.webReady);
  if (f === 'cached') return streams.filter((s) => s._tel.cached === true);
""")
rep("""['web', 'Instant Web-Ready', filterStreams(streams, 'web').length], ...addons""",
    """['web', 'Instant Web-Ready', filterStreams(streams, 'web').length], ...(filterStreams(streams, 'cached').length ? [['cached', 'Cached', filterStreams(streams, 'cached').length]] : []), ...addons""")

# 058-player: automatic failover never jumps to a source that is not cached yet
rep("""filter((s) => s._tel && s._tel.webReady && !s._tel.isTrailer && !this.tried.has(s));""",
    """filter((s) => s._tel && s._tel.webReady && !s._tel.isTrailer && s._tel.cached !== false && !this.tried.has(s));""")

# 0595-services: read cache state from the debrid addon's own tags and rank it hard
rep("""    const t = parse(s), k = s.infoHash && !s.url && Vault.service();
    if (k) {
      const inst = Vault.cached.get(String(s.infoHash).toLowerCase());
      t.debrid = k; t.instant = !!inst; t.webReady = true; t.source = `Debrid · ${DEBRID[k].label}`;
      // undo the "browsers cannot play torrents" penalty and prefer what is already cached
      t.score += 2000 + 60 + (inst ? 120 : inst === false ? -150 : 0);
    }""", """    const t = parse(s), k = s.infoHash && !s.url && Vault.service();
    if (k) {
      const inst = Vault.cached.get(String(s.infoHash).toLowerCase());
      t.debrid = k; t.instant = !!inst; t.webReady = true; t.source = `Debrid · ${DEBRID[k].label}`;
      if (inst != null) t.cached = !!inst;
      // undo the "browsers cannot play torrents" penalty; what is already cached goes first
      t.score += 2000 + 60;
    } else if (s.url) {
      // debrid addons tag each result: Torrentio "[TB+]" cached, "[TB download]" not yet; Comet and others use ⚡ and ⬇️ or ⏳
      const n = String(s.name || ''), tag = /\\[(RD|TB|AD|PM|DL|OC|ED|PD|PR|EN|DLS)\\b[^\\]]*\\]/i.exec(n);
      if (tag) t.cached = !/download|⬇|⏳/i.test(tag[0]) && (/\\+|⚡/.test(tag[0]) || /⚡/.test(n)) ? true : /download|⬇|⏳/i.test(tag[0]) ? false : undefined;
    }
    // an uncached file plays as the addon's "being downloaded to debrid" notice, so it goes to the bottom
    if (t.cached === true) t.score += 500; else if (t.cached === false) t.score -= 1600;""")
rep("""  Telemetry.badges = (s, tel, a, c) => `${tel.debrid || s._debrid ? `<span class="tb deb">Debrid${tel.instant || s._debrid ? ' · Instant' : ''}</span>` : ''}${badges(s, tel, a, c)}`;""",
    """  Telemetry.badges = (s, tel, a, c) => `${tel.debrid || s._debrid ? `<span class="tb deb">Debrid${tel.instant || s._debrid ? ' · Instant' : ''}</span>` : tel.cached === true ? '<span class="tb deb">Cached</span>' : ''}${tel.cached === false ? '<span class="tb unc">Not cached</span>' : ''}${badges(s, tel, a, c)}`;""")
# heads-up when someone picks an uncached source on purpose
rep("""  const play = playStream;
  playStream = async function (ctx, stream, opts) {
""", """  const play = playStream;
  playStream = async function (ctx, stream, opts) {
    if (stream && stream._tel && stream._tel.cached === false) toast('This source is not cached on your debrid service yet, so it may show a "downloading" notice. Cached sources at the top of the list play right away.', 'info', 6500);
""")
rep(""".tb.deb{color:#000;background:var(--gold);border-color:var(--gold);font-weight:700}""",
    """.tb.deb{color:#000;background:var(--gold);border-color:var(--gold);font-weight:700}
.tb.unc{color:#c9c4ba;background:transparent;border-color:rgba(255,255,255,.22)}""")
open(p, 'w').write(s); print('patched')
