# MKCinema 2.7.6: one calm, self-updating status while auto-switch tries sources, instead of a stack of
# "Source failed ... Switched to <long release name>" toasts. Usage: python3 2.7.6-quiet-failover.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)

# 03-core: toast(msg, kind, ms, key): a toast with a key replaces the one on screen with that key
rep("""function toast(msg, kind = 'info', ms = 3600) {
  // The same message never stacks: a repeat replaces the one on screen, and at most three show at once
  const box = $('#toasts');
  [...box.children].forEach((t) => { if (t.dataset.msg === String(msg)) t.remove(); });""", """function toast(msg, kind = 'info', ms = 3600, key = '') {
  // The same message never stacks: a repeat (or one with the same key) replaces the one on screen, and at most three show at once
  const box = $('#toasts');
  [...box.children].forEach((t) => { if (t.dataset.msg === String(msg) || key && t.dataset.key === key) t.remove(); });""")
rep("""  const el = document.createElement('div'); el.dataset.msg = String(msg);""", """  const el = document.createElement('div'); el.dataset.msg = String(msg); if (key) el.dataset.key = key;""")

# 058-player: Failover says it once, in plain words, and counts instead of naming every release
rep("""    if (key !== this.key) { this.key = key; this.tried = new Set(); }""", """    if (key !== this.key) { this.key = key; this.tried = new Set(); this.hops = 0; }""")
rep("""    toast(`Source ${reason}. Switched to ${n._tel.lines[0] || n._tel.headline || n._addon}`, 'info', 4200);""",
    """    this.hops = (this.hops || 0) + 1;
    const why = /not supported|blocked|decode/i.test(reason) ? 'won’t play in this browser' : /3\\.5 s|start/i.test(reason) ? 'was slow to start' : /stalled/i.test(reason) ? 'stalled' : /cached/i.test(reason) ? 'isn’t cached yet' : 'didn’t work';
    toast(this.hops > 1 ? `Still looking for a source that plays here… (try ${this.hops + 1})` : `That source ${why}. Trying the next best one…`, 'info', 4200, 'failover');""")

# 05-app: the automatic subtitle pick is a short note that replaces itself
rep("""else toast(`Subtitles on: ${subLabel(s)} (change in Settings › Subtitles)`, 'info', 3000);""",
    """else toast(`${langName(s.lang)} subtitles on`, 'info', 2400, 'subs');""")
open(p, 'w').write(s); print('patched')
