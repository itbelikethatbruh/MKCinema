# MKCinema engine (play MKV files in the built-in player)

`mkv-engine.js` runs on the page, `mkv-engine.worker.js` in a dedicated worker. Loaded by `index.html` with
`<script src="engine/mkv-engine.js" defer>`, after every inline block, so its wrappers are the outermost ones.

- **What it does:** reads an MKV/WebM file with HTTP Range requests straight from its host, copies the video into
  fragmented MP4 (never re-encoded), and copies the audio or converts it to AAC-LC stereo. Media Source Extensions
  play it (`ManagedMediaSource` on iPhone/iPad, so AirPlay is off while it plays).
- **When:** MKV sources only. On Chrome, Edge and Firefox it is used only when their own player would play the file
  badly: Dolby Digital/Plus, DTS, TrueHD or PCM sound, or a default audio track that isn't the first one. On Safari it
  plays every MKV whose video the device can decode.
- **Fallback:** browser player → engine → external player. A host that doesn't allow browser reads (no CORS), a
  video codec the device can't decode, Dolby Vision profile 5, or an error mid-film goes back to the old behaviour.
  The reason shows in Playback stats and X-Ray. MKCinema never relays the video.
- **Seeking:** the file's Cues index; files without Cues are searched by cluster timestamps (8 reads at most).
- **Settings:** Settings › Playback › "Play MKV files in MKCinema" (`CFG.engine`, on by default).

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
