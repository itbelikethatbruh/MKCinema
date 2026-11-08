# MKCinema engine (play MKV, MP4 and TS files in the built-in player)

`mkv-engine.js` runs on the page, `mkv-engine.worker.js` in a dedicated worker. Loaded by `index.html` with
`<script src="engine/mkv-engine.js" defer>`, after every inline block, so its wrappers are the outermost ones.

- **What it does:** reads an MKV/WebM, MP4/MOV or MPEG-TS/M2TS file with HTTP Range requests straight from its host, copies the video into
  fragmented MP4 (never re-encoded), and copies the audio or converts it to AAC-LC stereo. Media Source Extensions
  play it (`ManagedMediaSource` on iPhone/iPad, so AirPlay is off while it plays).
- **When:** MKV: on Chrome, Edge and Firefox only when their own player would play the file badly (Dolby Digital/Plus,
  DTS, TrueHD or PCM sound, or a default audio track that isn't the first one); on Safari every MKV whose video the
  device can decode. TS/M2TS: always (browsers can't open them). MP4: when the name says Dolby/DTS sound, or when any
  film (MP4 or MKV) the browser opened itself plays without sound (`Rescue.found` hook, before the older offers).
- **Sound:** copied when the browser plays it, else converted to AAC-LC: 5.1 (AAC channel configuration 6, layout
  0x3F; 0x60F makes FFmpeg write a PCE that browsers reject) when the device reports six output channels, else stereo.
- **Picture subtitles:** Blu-ray PGS tracks in MKV are decoded on the page and drawn on a canvas over the video.
- **Dolby Vision:** profiles 5/8 play as Dolby Vision where the browser decodes it (Apple); profile 5 is refused
  elsewhere (no HDR10 layer, wrong colours), other profiles play their HDR10/SDR base layer.
- **Fallback:** browser player → engine → external player. A host that doesn't allow browser reads (no CORS), a
  video codec the device can't decode, Dolby Vision profile 5, or an error mid-film goes back to the old behaviour.
  The reason shows in Playback stats and X-Ray. MKCinema never relays the video.
- **Seeking:** MKV: the Cues index, or cluster timestamps (8 reads at most) without one. MP4: the sample tables.
  TS: byte-position guesses narrowed by PES timestamps (10 reads at most), starting 3 s early for a keyframe.
- **Software HEVC (computers only, on by default):** Settings › Playback › "Play HEVC films on this computer"
  (`CFG.swHevc`), offered only where the browser can't decode HEVC, never on phones/tablets. Up to 1080p. The sound
  plays through the normal `<video>` element (MSE, audio only) as the clock; the engine worker sends the video samples
  over a MessagePort to `hevc-decoder.worker.js` (FFmpeg HEVC decoder, WebAssembly, one thread), and `soft-hevc.js`
  (loaded on demand) draws the pictures with WebGL 2 over the video, HDR10/HLG tone-mapped to SDR. After a seek, or
  when decoding falls far behind, the sound holds (playbackRate 0) until the picture catches up; when slightly behind,
  the decoder skips pictures nothing refers to. 4K and Dolby Vision 5 are refused (VLC).
  When the browser can't play HEVC itself, the automatic pick prefers a 720p-or-better copy it plays natively. Stutter
  guard: three catch-up holds in 30 s, or 8 s straight behind, marks the computer slow for 14 days (`mkc.softSlow`,
  cleared by switching the setting on again) and moves to the next non-HEVC copy.
- **Not handled:** fragmented MP4 input, AVI, TS TrueHD, PGS inside TS.
- **Settings:** Settings › Playback › "Play MKV and TS files in MKCinema" (`CFG.engine`, on by default).

## audio/: FFmpeg audio decoders (LGPL 2.1)

`libav-6.10.9.0-mkc-audio.*` is a custom [libav.js](https://github.com/Yahweasel/libav.js) 6.10.9 build of FFmpeg 9.0
(single-threaded, no SIMD, LGPL, no GPL parts): decoders ac3, eac3, dca, truehd, mlp, flac, opus, vorbis, mp3, mp2,
aac, alac, pcm; encoder aac; filters aresample/aformat/anull. It is loaded only when a file's sound needs converting.
DTS and TrueHD decoding are the most legally sensitive part, so they live only in this folder: deleting `audio/`
switches conversion off and the engine then plays the picture and says the sound needs another player.

Rebuild (emsdk 4.0.15, sources from the libav.js npm package `sources/`):

```
cd libav.js/configs && ./mkconfig.js mkc-audio '["avcodec","avfilter","swresample","filter-aresample","filter-aformat","filter-anull","decoder-ac3","decoder-eac3","decoder-dca","decoder-truehd","decoder-mlp","decoder-flac","decoder-opus","decoder-vorbis","decoder-mp3","decoder-mp2","decoder-aac","decoder-alac","decoder-pcm_s16le","decoder-pcm_s24le","decoder-pcm_s32le","decoder-pcm_f32le","decoder-pcm_s16be","decoder-pcm_s24be","encoder-aac"]'
cd .. && make dist/libav-6.10.9.0-mkc-audio.wasm.js dist/libav-6.10.9.0-mkc-audio.js
```

## hevc/: FFmpeg HEVC decoder (LGPL 2.1)

`libav-6.10.9.0-mkc-hevc.*` is the same libav.js 6.10.9 / FFmpeg 9.0 build setup with only the HEVC decoder
(`["avcodec","decoder-hevc"]`), built with `-O3 -msimd128` (about 500 KB gzipped). Measured on one 2.1 GHz server core:
1080p 8-bit 55 fps, 10-bit 40 to 50 fps. Loaded only when a film is software-decoded.

```
cd libav.js/configs && ./mkconfig.js mkc-hevc '["avcodec","decoder-hevc"]'
cd .. && make OPTFLAGS="-O3 -msimd128" dist/libav-6.10.9.0-mkc-hevc.wasm.js dist/libav-6.10.9.0-mkc-hevc.js
```
