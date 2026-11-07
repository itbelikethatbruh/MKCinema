# Addon extras: playback events, skip times and device info

MKCinema 2.43 adds three optional things a Stremio addon can do. They sit next to [Addon looks](addon-looks.md) and
follow the same rules. They're opt-in, and Stremio and other apps ignore fields they don't know, so your addon keeps
working everywhere without changes.

| What | How you turn it on | What you get |
|---|---|---|
| Playback events | `"mkcinema": { "progress": true }` in the manifest | A POST when playback starts, pauses, resumes, stops or finishes |
| Skip times | `"skips"` in `resources` | Your intro, recap, credits and scene times on MKCinema's Skip button |
| Device info | `"mkcinema": { "device": true }` in the manifest | Stream requests tell you which codecs and resolution this device plays |

## 1. Playback events

Use these to mark an episode as watched only when it's actually finished, to keep progress or history on your side,
to drive a tracker, or to collect stats for your own users.

```json
{
  "id": "com.example.tracker",
  "resources": ["catalog"],
  "types": ["movie", "series"],
  "idPrefixes": ["tt"],
  "mkcinema": { "progress": true }
}
```

`progress` can also be an object, `{ "types": ["series"], "idPrefixes": ["tt", "kitsu:"] }`, to hear about fewer
titles. Without it, your manifest's own `types` and `idPrefixes` are used.

**Consent.** The viewer is asked once when they install your addon ("asks to know what you watch, to keep your
progress on its side"), and they can change it any time on the Addons screen. Until they allow it, nothing is sent.

**What MKCinema sends.** A `POST` to `{your addon's base URL}/mkcinema/progress`. The base URL is the manifest URL
without `/manifest.json`, so it includes your configuration path and you know which of your users it is. The body is
JSON sent as `text/plain`, so the browser needs no preflight. Answer with any 2xx status; the body is ignored. CORS
headers are welcome but not required.

```json
{
  "v": 1,
  "event": "stop",
  "type": "series",
  "id": "tt0903747",
  "name": "Breaking Bad",
  "videoId": "tt0903747:1:2",
  "season": 1,
  "episode": 2,
  "position": 2843,
  "duration": 2900,
  "percent": 98,
  "finished": true,
  "at": "2026-11-07T00:12:44.000Z",
  "app": "MKCinema",
  "appVersion": "2.43.0",
  "stream": { "infoHash": "…", "fileIdx": 3, "filename": "…", "bingeGroup": "…" }
}
```

- `event` is one of `start`, `pause`, `resume`, `progress` (every 5 minutes while playing), `stop` and `end`.
- `position` and `duration` are in seconds, and `percent` is 0 to 100. `finished` is true at 90 % or at the end.
- `stream` is only there when the playing source came from **your** addon. It holds the hash, file index, filename
  and binge group from your own result. You never get another addon's results.
- A quick reconnect of the same title, for example when the viewer changes the sound mode or picks another source,
  doesn't produce extra stop and start events.
- MKCinema never sends stream links, debrid keys, account details or device ids.

## 2. Skip times (the `skips` resource)

The format follows the open proposal for a `skips` resource in Stremio's addon SDK (stremio-addon-sdk PR #360), so
the same handler can serve both apps.

```
GET {base}/skips/{type}/{id}.json        e.g. /skips/series/tt0903747:1:2.json
```

```json
{
  "skips": [
    { "id": "op-1", "startMs": 5000, "endMs": 92000, "category": "intro" },
    { "id": "rc-1", "startMs": 0, "endMs": 4000, "category": "recap", "description": "Previously on" },
    { "id": "ed-1", "startMs": 2780000, "endMs": 2900000, "category": "outro" },
    { "id": "v-1", "startMs": 1800000, "endMs": 1860000, "category": "violence", "severity": "high", "description": "Fight in the lobby", "action": "warn" }
  ]
}
```

- **`intro`** and **`outro`** go on the Skip intro button and the credits timing, wherever the file's chapters,
  AniSkip and TheIntroDB have nothing.
- **`recap`** shows a "Skip recap" button.
- **`ad`** is skipped automatically.
- **`nudity`, `sex`, `violence`, `language`, `drugs`, `fear`** follow the viewer's choice in Settings › Playback:
  play them (the default), show a Skip button, or skip them, filtered by `severity` (`low`, `medium`, `high`). Kids
  seats skip them by default. `"action": "warn"` always shows a button instead of skipping.
- `startMs` and `endMs` are milliseconds. Up to 200 segments per answer. Unknown categories are ignored.

Declare it like any other resource: `"resources": ["stream", "skips"]`, or `{ "name": "skips", "types": [...],
"idPrefixes": [...] }`.

## 3. Device info

```json
{ "mkcinema": { "device": true } }
```

Your stream requests then carry what the device can play as Stremio extra values:

```
/stream/movie/tt0111161/player=web&video=h264%2Chevc&audio=aac%2Cac3%2Ceac3&mkv=1&hdr=0&maxres=1080.json
```

| Key | Values |
|---|---|
| `player` | `web` (the in-app player), `tv` (the Android TV app's own player) or `external` (handed to VLC or similar) |
| `video` | Codecs that decode here: `h264`, `hevc`, `vp9`, `av1` |
| `audio` | `aac`, `ac3`, `eac3`, `opus`, `flac`, `dts` |
| `mkv` | `1` if MKV files play in place |
| `hdr` | `1` if the screen shows HDR |
| `maxres` | `720`, `1080` or `2160` |

Addons built with the official SDK get these in `args.extra`. A hand-written router should accept an optional extra
segment before `.json`, just as it does for catalogs. Device info is on by default for addons that ask, and the viewer
can switch it off on the Addons screen. It describes the device, never the person.

## Rules

- Everything here is optional, and an addon that uses none of it works exactly as before.
- MKCinema only sends what this page lists. It never runs addon code and never shares one addon's data with another.

## Questions

Open an issue on this repository. Feedback on these formats is welcome, especially before they settle.
