
'use strict';
/* 2.60.1 Audio language: mark the track that is really playing. Chromium plays the first audio track it can decode,
   so a file with Italian AC3 first and English AAC second plays English on Android. TorBox's stream index (when its
   track list gives one) is what goes to TorBox, since it can count every stream in the file, picture included. */
(() => {
  if (typeof AudioLang === 'undefined') return;
  const MIME = { aac: 'audio/mp4; codecs="mp4a.40.2"', ac3: 'audio/mp4; codecs="ac-3"', eac3: 'audio/mp4; codecs="ec-3"', opus: 'audio/mp4; codecs="opus"', flac: 'audio/mp4; codecs="flac"', mp3: 'audio/mpeg', vorbis: 'audio/webm; codecs="vorbis"' };
  // true: this browser decodes it; false: it never does; null: unknown codec name
  const playable = (c) => {
    const k0 = String(c || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (!k0) return null;
    if (/dts|dca|truehd|mlp|pcm/.test(k0)) return false;
    const k = /^(eac3|ec3|ddp|ddplus)/.test(k0) ? 'eac3' : /^(ac3|dd)$/.test(k0) ? 'ac3' : /aac|mp4a/.test(k0) ? 'aac' : k0;
    if (!MIME[k]) return null;
    try { return !!BrowserPlay.can(MIME[k]); } catch (e) { return null; }
  };
  const tracks0 = AudioLang.tracks.bind(AudioLang);
  AudioLang.tracks = function (list) {
    const out = tracks0(list);
    (Array.isArray(list) ? list : []).forEach((t, n) => {
      if (!t || typeof t !== 'object' || !out[n]) return;
      out[n].codec = String(t.codec || t.codec_name || '');
      const x = Number(t.index != null ? t.index : t.stream_index);
      if (Number.isInteger(x) && x >= 0) out[n].src = x;
    });
    return out;
  };
  if (/Chrome\//.test(navigator.userAgent) && !('audioTracks' in HTMLMediaElement.prototype)) {
    AudioLang.defIndex = (tracks) => { const t = (tracks || []).find((x) => playable(x.codec) !== false); return t ? t.i : 0; };
  }
  const tb0 = AudioLang.tbStream.bind(AudioLang);
  AudioLang.tbStream = function (ref, idx) {
    const st = P.stream && this.info.get(P.stream), t = st && st.ref === ref && (st.tracks || []).find((x) => x.i === idx);
    return tb0(ref, t && t.src != null ? t.src : idx);
  };
})();
