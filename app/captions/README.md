# MKCinema captions (films without subtitles)

`auto-captions.js` runs on the page (loaded with `<script src="captions/auto-captions.js" defer>` right after the
engine), `asr.worker.js` runs the speech model in a module worker.

- **Make captions with AI (on this device):** a second copy of `engine/mkv-engine.worker.js` in listen mode
  (`mode: 'pcm', listen: true`) reads the film's sound straight from its host, a minute or two ahead of the playhead
  (MKV/WebM, MP4/MOV, TS/M2TS), decodes it with the engine's FFmpeg build and resamples it to 16 kHz mono. The page cuts
  it into pieces of up to 28 s at the quietest moment and `asr.worker.js` turns each piece into timed lines with
  Whisper base. Lines go straight into a live text track, so size, position, delay and the subtitle tools all work.
  Seeking carries on from what is already captioned. English viewers get foreign-language films translated into
  English (the only language Whisper translates into).
- **Needs:** a host that lets the browser read the file (CORS), the same as the engine. MKV and TS store sound and
  picture together, so the file is read a second time; MP4 reads only the sound. Not offered on TVs or HLS streams.
- **Speed:** measured on one 2.1 GHz server core, 60 s of film sound takes about 19 s (WebAssembly, one thread: the app
  isn't cross-origin isolated). Phones can fall behind; the menu says so.
- **Live Caption on this device:** the menu also shows how to switch on the captions built into Chrome, Android,
  Windows 11, iPhone/iPad and Mac, which work on any source.
- **Settings:** `CFG.genCaps` ("Make them by themselves when a film has none", off by default), in the subtitle menu.

## vendor/

[Transformers.js](https://github.com/huggingface/transformers.js) 3.8.1 (`transformers.min.js`, Apache 2.0, see
`LICENSE-transformers.js.txt`) and the ONNX Runtime Web 1.22 WebAssembly files it loads (`ort-wasm-simd-threaded.jsep.*`,
MIT). Served from this site so the page's script policy stays closed. The model,
[onnx-community/whisper-base](https://huggingface.co/onnx-community/whisper-base) (OpenAI Whisper, MIT; 8-bit,
about 77 MB), downloads once from Hugging Face into the browser's cache. The sound never leaves the device.
