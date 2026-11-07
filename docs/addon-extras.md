# Addon extras: how your addon can talk to MKCinema

MKCinema 2.43 adds three optional things a Stremio addon can do. They sit next to [Addon looks](addon-looks.md) and
follow the same rules. They're opt-in, and Stremio and other apps ignore fields they don't know, so your addon keeps
working everywhere without changes.

| What | How you turn it on | What you get |
|---|---|---|
| Playback events | `"mkcinema": { "progress": true }` in the manifest | A POST when playback starts, pauses, resumes, stops or finishes |
| Skip times | `"skips"` in `resources` | Your intro, recap, credits and scene times on MKCinema's Skip button |
| Device info | `"mkcinema": { "device": true }` in the manifest | Stream requests tell you which codecs and resolution this device plays |

MKCinema 2.48 adds more, in sections 4 to 12:

| What | How you turn it on | Viewer asked first? |
|---|---|---|
| Card notice | `"status"` in the manifest's `mkcinema` | No |
| Support link | `"support"` | No |
| What changed | `"changelog"` | No |
| Message rows | `"mkcinema": { "status": … }` on a stream with no link | No |
| Failed-link reports | `"feedback": true` | Yes |
| Action buttons | `"actions"` | No: the viewer taps the button |
| Shared embedded subtitles | `"subtitlesIn": true` | Yes |
| Result styler | `"style": true` | Yes |

Two things need no change at all: pasting your addon again with new settings updates it in place, and
Addons › Addon Lab shows every request MKCinema makes to your addon (section 12).

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

## 4. A notice on your addon's card

```json
"mkcinema": { "status": { "kind": "warn", "text": "Cache server is slow tonight. Results may take longer." } }
```

`kind` is `info`, `warn` or `down`. `text` is up to 160 characters. It shows at the top of your card on the Addons
screen until your manifest stops sending it. MKCinema reads your manifest when it starts, so a change shows on the
viewer's next launch.

## 5. A support link

```json
"mkcinema": { "support": { "url": "https://ko-fi.com/yourname", "label": "Buy me a coffee" } }
```

`url` must be `https://`. `label` is up to 28 characters (default "Support the developer"). It opens in a new tab.
MKCinema itself is free and takes no cut.

## 6. What changed

```json
"mkcinema": { "changelog": [
  { "version": "1.4.0", "text": "Faster searches and fewer duplicates." },
  { "version": "1.3.0", "text": "Anime support." }
] }
```

Up to 5 entries, 200 characters each. When your manifest's `version` changes, your card says "updated" for a week,
with "Updated to v1.4.0 (was v1.3.0)" and your notes one tap away.

## 7. Message rows instead of video clips

When a result can't play (an expired key, a file still downloading), answer with a message instead of a short video.
Send a stream with no `url`, `infoHash`, `ytId` or `externalUrl`, and a `mkcinema.status`:

```json
{ "name": "My Addon", "title": "Your key expired",
  "mkcinema": { "status": { "kind": "warn", "title": "Key expired", "text": "Renew your key in the addon settings." } } }
```

`kind` is `info`, `warn` or `error`. `title` is up to 60 characters and `text` up to 200. MKCinema shows it as a line
above the source list, never as something to play. Apps that don't know the field show a row that does nothing,
because it has no link.

## 8. Failed-link reports

Turn it on with `"mkcinema": { "feedback": true }`. The viewer is asked once, and it's off until they say yes. When one
of **your own** results won't play, MKCinema sends one POST to `{your addon URL}/mkcinema/feedback`, with body type
`text/plain`, so no preflight:

```json
{ "v": 1, "event": "failed", "reason": "missing", "detail": "HTTP 404",
  "type": "series", "id": "tt0903747", "name": "Breaking Bad", "videoId": "tt0903747:1:1", "season": 1, "episode": 1,
  "stream": { "infoHash": "…", "fileIdx": 0, "filename": "…", "bingeGroup": "…" },
  "at": "2026-11-07T15:00:00Z", "app": "MKCinema", "appVersion": "2.48.0" }
```

`reason` is one of `network`, `stalled`, `unsupported` (this device can't decode the file), `denied`, `missing` or
`notice` (the result turned out to be a short notice clip). `stream` holds only fields you sent: never the playable
link, and never another addon's results. Each failure is sent once.

## 9. Action buttons

```json
"mkcinema": { "actions": [
  { "id": "save", "label": "Save to my list", "icon": "bookmark", "types": ["movie", "series"] }
] }
```

Up to 2 per addon and 4 on a page. They sit with the film page's buttons. `id` uses letters, numbers, `-` and `_`
(up to 40). `label` is up to 28 characters. `icon` is one of `send` (default), `bookmark`, `star`, `heart`,
`download`, `sparkles`, `check`, `plus` and `share-2`. `types` and `idPrefixes` narrow where the button shows.

A tap sends a POST to `{your addon URL}/mkcinema/action/{id}`, `text/plain`:

```json
{ "v": 1, "action": "save", "type": "movie", "id": "tt0068646", "name": "The Godfather", "videoId": "tt0068646",
  "at": "…", "app": "MKCinema", "appVersion": "2.48.0" }
```

Answer within 10 seconds with JSON, `{ "message": "Saved to your list" }` (up to 140 characters), and
`Access-Control-Allow-Origin: *`, and MKCinema shows your message. A non-2xx answer shows as a failure. Settings that
belong to the viewer, such as their account on your side, live in your addon link, as usual.

## 10. Shared embedded subtitles

Turn it on with `"mkcinema": { "subtitlesIn": true }`. The viewer is asked once, and it's off until they say yes. When
a viewer reads a file's own subtitles to the end (MKV text tracks), MKCinema sends them to
`{your addon URL}/mkcinema/subtitles`, `text/plain`:

```json
{ "v": 1, "type": "movie", "id": "tt0068646", "videoId": "tt0068646", "lang": "spa", "label": "Español",
  "format": "vtt", "filename": "…", "text": "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n…", "app": "MKCinema", "appVersion": "2.48.0" }
```

Only full tracks (90% of lines read) are sent. Forced tracks and "Signs & Songs" tracks are skipped. A track is sent
once per title and at most 1 MB. Styling is removed, so you get plain WebVTT text.

## 11. Result stylers

Turn it on with `"mkcinema": { "style": true }`. The viewer is asked once, and it's off until they say yes. After
every addon has answered for a title, MKCinema sends a description of each result to `{your addon URL}/mkcinema/style`,
`text/plain`:

```json
{ "v": 1, "type": "movie", "id": "tt0068646", "streams": [
  { "i": 0, "addon": "Some Addon", "name": "4K", "title": "Movie.2020.2160p.HDR.x265", "res": "4K UHD", "hdr": "HDR",
    "codec": "HEVC", "size": "18.2 GB", "cached": true, "kind": "http" } ] }
```

It never holds a link, hash, key or file index, and any link in the text is cut out. Answer within 2.5 seconds, with
`Access-Control-Allow-Origin: *`:

```json
{ "streams": [ { "i": 0, "tags": ["Best audio"], "rank": 20 }, { "i": 3, "hide": true } ] }
```

`tags` gives up to 3 per result, 16 characters each, shown with the quality tags. `rank` (-100 to 100) moves a result
up or down, and Smart Play follows the new order. `hide: true` removes it from the list. A slow or failed answer
leaves the list as it was.

## 12. Paste again to update, and Addon Lab

- **Same addon, new link.** When a viewer pastes your addon with different settings, so it has the same manifest `id`
  on the same host, MKCinema replaces the old copy in place. The addon keeps its place and on/off state. Your
  configure page needs no change.
- **Saved debrid keys.** In the settings form MKCinema draws from `manifest.config`, a `password` or `text` field whose
  key or title names a debrid service (Real-Debrid, TorBox, AllDebrid, Premiumize, or "debrid … key") gets a
  "Use my saved … key" button. The key is only filled in when the viewer taps it.
- **Addon Lab** (Addons screen) lists the last 80 addon requests on that device: which addon, the path (long settings
  segments hidden), the time taken, and a warning for slow answers (over 3 s) or blocked ones (usually a missing
  `Access-Control-Allow-Origin: *`). Tap one to send it again and see the JSON. Nothing in the Lab leaves the device.

## Rules

- Everything here is optional, and an addon that uses none of it works exactly as before.
- MKCinema only sends what this page lists. It never runs addon code and never shares one addon's data with another.
- Every text field is plain text, cut to its limit. Unknown values are dropped. The viewer can turn each "asked first"
  switch on or off on your card at any time.
- Requests that need a yes are never sent before it.

## Questions

Open an issue on this repository. Feedback on these formats is welcome, especially before they settle.
