# MKCinema 2.7.5: subtitle lines that stay on screen. Every subtitle is re-parsed into clean WebVTT
# (tolerant of missing/whitespace blank lines, bad or overlapping timings), and a slow download can no
# longer leave a second track showing. Usage: python3 2.7.5-subs.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, a[:80]
    s = s.replace(a, b)

# 03-core: StremioEngine.toVtt tidies whatever it produced
rep("""  static toVtt(text, name = '') {
    const t = String(text).replace(/^\\uFEFF/, '');
    if (/^\\s*WEBVTT/.test(t)) return t;
    if (/\\[Events\\]/i.test(t) || /\\.(ass|ssa)$/i.test(name)) return StremioEngine.assToVtt(t);
    if (/^\\s*\\{\\d+\\}\\{\\d*\\}/.test(t)) return StremioEngine.microDvdToVtt(t);
    return StremioEngine.srtToVtt(t);
  }""", """  static toVtt(text, name = '') {
    const t = String(text).replace(/^\\uFEFF/, '');
    const raw = /^\\s*WEBVTT/.test(t) ? t : /\\[Events\\]/i.test(t) || /\\.(ass|ssa)$/i.test(name) ? StremioEngine.assToVtt(t) : /^\\s*\\{\\d+\\}\\{\\d*\\}/.test(t) ? StremioEngine.microDvdToVtt(t) : StremioEngine.srtToVtt(t);
    return StremioEngine.tidyVtt(raw) || raw;
  }
  /* Real-world SRT files often have a blank line holding spaces, a missing blank line, an end time before the start, or a line
     that lasts minutes. Browsers then keep that line on screen. The cues are read again line by line and written out clean:
     a cue ends before the next one starts, and none lasts longer than 12 s. */
  static tidyVtt(text) {
    const T = /^\\s*((?:\\d+:)?\\d{1,2}:\\d{2}[.,]\\d{1,3})\\s*-->\\s*((?:\\d+:)?\\d{1,2}:\\d{2}[.,]\\d{1,3})(.*)$/;
    const sec = (v) => { const p = v.replace(',', '.').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
    const lines = String(text).replace(/\\r\\n?/g, '\\n').split('\\n'), cues = [];
    let cur = null;
    for (let i = 0; i < lines.length; i++) {
      const m = T.exec(lines[i]);
      if (m) {
        // a cue number written right above the timing line belongs to the new cue, not to the old one's text
        if (cur && cur.text.length && /^\\s*\\d+\\s*$/.test(cur.text[cur.text.length - 1])) cur.text.pop();
        cur = { s: sec(m[1]), e: sec(m[2]), set: (m[3] || '').trim(), text: [] }; cues.push(cur); continue;
      }
      if (!lines[i].trim()) { cur = null; continue; }
      if (cur) cur.text.push(lines[i].trim());
    }
    const out = cues.map((c) => ({ ...c, body: c.text.join('\\n').replace(/<(?!\\/?(b|i|u)>)[^>]+>/gi, '').trim() })).filter((c) => c.body && isFinite(c.s) && isFinite(c.e)).sort((a, b) => a.s - b.s);
    if (!out.length) return null;
    // identical start: one cue with both lines; otherwise a cue stops where the next begins
    const merged = [];
    for (const c of out) { const last = merged[merged.length - 1]; if (last && Math.abs(last.s - c.s) < 0.01) { if (last.body !== c.body) last.body += `\\n${c.body}`; last.e = Math.max(last.e, c.e); } else merged.push(c); }
    merged.forEach((c, i) => {
      const n = merged[i + 1];
      if (!(c.e > c.s)) c.e = c.s + 3;
      if (c.e - c.s > 12) c.e = c.s + 12;
      if (n && c.e > n.s) c.e = Math.max(c.s + 0.2, n.s);
    });
    const ok = (v) => /^(line|position|align|size|vertical):\\S+$/.test(v);
    return 'WEBVTT\\n\\n' + merged.map((c) => `${StremioEngine.vttTime(c.s)} --> ${StremioEngine.vttTime(c.e)}${c.set ? ' ' + c.set.split(/\\s+/).filter(ok).join(' ') : ''}\\n${c.body}`).join('\\n\\n') + '\\n';
  }""")

# 05-app: only the latest pick may attach its track
rep("""async function selectSub(i, { auto = false } = {}) {
  clearSubTracks();
  P.curSub = i; renderSubMenu(); if (i < 0) return;
  const s = P.subs[i];""", """async function selectSub(i, { auto = false } = {}) {
  clearSubTracks();
  const pick = P.subPick = (P.subPick || 0) + 1;
  P.curSub = i; renderSubMenu(); if (i < 0) return;
  const s = P.subs[i];""")
rep("""      if (text == null) { const res = await fetch(s.url); if (!res.ok) throw new Error(`HTTP ${res.status}`); text = await res.text(); }
      const vtt""", """      if (text == null) { const res = await fetch(s.url); if (!res.ok) throw new Error(`HTTP ${res.status}`); text = await res.text(); }
      // another subtitle was picked while this one downloaded: two tracks would both stay on screen
      if (pick !== P.subPick) return;
      clearSubTracks();
      const vtt""")
open(p, 'w').write(s); print('patched')
