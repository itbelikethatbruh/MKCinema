
/* 2.38.0 Signs & Songs with dubs. Full subtitles in a dual-audio file are written for the original voices, so they don't
   match an English dub. When the voices playing are in your subtitle language and the title is anime (or the audio
   track says it's a dub), MKCinema picks the file's Signs & Songs (forced) track instead: on-screen text and lyrics only.
   - Chromium (Chrome, Edge, Android WebView, the Windows app) plays a file's FIRST audio track whatever its default
     flag says (checked in Chromium with two-audio MKVs), so that is the track assumed unless the Audio menu chose another.
   - After a language is picked in the Audio menu (TorBox's own stream), the subtitles are still read from the original
     file, which has the same timeline. */
const DubSigns = {
  on: () => CFG.subDubSigns !== false,
  // the file's audio track that is playing, as { i, t }
  audio(f) {
    const aud = f.tracks.filter((t) => t.type === 2); if (!aud.length) return null;
    const s = P.stream, at = video.audioTracks;
    if (s && s._audio != null && s._audio >= 0 && aud[s._audio]) return { i: s._audio, t: aud[s._audio] };
    if (at && at.length === aud.length) for (let i = 0; i < at.length; i++) if (at[i].enabled) return { i, t: aud[i] };
    return { i: 0, t: aud[0] };
  },
  // a dub in your subtitle language: two or more audio languages, yours is playing, and it's anime or says "dub"
  isDub(f, a, want) {
    const langs = new Set(f.tracks.filter((t) => t.type === 2).map((t) => langName(t.lang)));
    if (langs.size < 2 || langName(a.t.lang) !== want) return false;
    if (/\bdub/i.test(a.t.name || '')) return true;
    try { return !!(P.ctx && P.ctx.meta && AnimeIds.anime(P.ctx)); } catch (e) { return false; }
  },
  // the Signs & Songs track in your language: forced flag or the name says so, never "Full", and it has an index
  pick(f, want) {
    const c = P.subs.map((s, i) => [s, i]).filter(([s]) => s.kind === 'mkv' && langName(s.lang) === want && s._mkv
      && (s._mkv.forced || /sign|song|forced/i.test(s._mkv.name || '')) && !/\bfull\b|dialog/i.test(s._mkv.name || '')
      && f.cues.some((x) => x.track === s._mkv.num));
    const score = (t) => (t.forced ? 2 : 0) + (/sign|song/i.test(t.name || '') ? 2 : 0) + (t.ass ? 1 : 0);
    c.sort((a, b) => score(b[0]._mkv) - score(a[0]._mkv));
    return c.length ? c[0][1] : -1;
  },
};
{
  const pick0 = MkvSubs.autoPick, isMkv0 = MkvSubs.isMkv, reader0 = MkvSubs.reader;
  MkvSubs.autoPick = function () {
    const f = this.file;
    if (DubSigns.on() && f && CFG.subAuto && !P.subUserChoice && CFG.subLang && CFG.subLang !== 'off') {
      const cur = P.subs[P.curSub];
      if (!(cur && cur.kind === 'mkv')) {
        const want = langName(CFG.subLang), a = DubSigns.audio(f);
        if (a && DubSigns.isDub(f, a, want)) {
          const i = DubSigns.pick(f, want);
          if (i >= 0) {
            MKLog.add('info', `Dub in ${want} (audio track ${a.i + 1}): Signs & Songs subtitles "${P.subs[i]._mkv.name || 'forced'}"`);
            selectSub(i, { auto: true });
            toast(`Signs & Songs subtitles for the ${want} dub`, 'info', 3200, 'dubsigns');
            return;
          }
        }
      }
    }
    return pick0.apply(this, arguments);
  };
  // after a language is picked in the Audio menu the stream becomes TorBox's HLS; its subtitles still come from the file
  const base = (s) => s && s._audioBase && s._audioBase !== s.url ? s._audioBase : null;
  MkvSubs.isMkv = function (stream) {
    const b = base(stream); if (!b) return isMkv0.call(this, stream);
    const h = P.hls; P.hls = null;
    try { return isMkv0.call(this, { ...stream, url: b }); } finally { P.hls = h; }
  };
  MkvSubs.reader = function (stream) { const b = base(stream); return reader0.call(this, b ? { ...stream, url: b } : stream); };
  video.addEventListener('loadedmetadata', () => { const st = P.stream; if (st && P.hls && base(st)) setTimeout(() => { if (P.stream === st) MkvSubs.probe(st); }, 700); });
  // the Audio menu treated the file's default-flagged track as the one playing. In Chromium that's the first track, so
  // picking a default-flagged dub listed second fell back to the original file and played the first language again.
  if (/Chrome\//.test(navigator.userAgent) && !('audioTracks' in HTMLMediaElement.prototype)) AudioLang.defIndex = () => 0;
}
