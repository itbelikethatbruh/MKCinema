<h1 align="center">MKCinema</h1>

<p align="center">
  <b>Your addons look better here.</b><br>
  A free, open-source player for Stremio addons, with debrid support, account sync<br>
  and apps for Android, Android TV, Windows, macOS, Linux and smart TVs.
</p>

<p align="center">
  <a href="https://github.com/itbelikethatbruh/MKCinema/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/itbelikethatbruh/MKCinema?style=flat-square&label=release"></a>
  <a href="LICENSE"><img alt="License: GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square"></a>
  <a href="https://github.com/itbelikethatbruh/MKCinema/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/itbelikethatbruh/MKCinema?style=flat-square"></a>
  <a href="https://app.mkcinema.app"><img alt="Web app" src="https://img.shields.io/badge/web%20app-live-brightgreen?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://app.mkcinema.app">Web app</a> ·
  <a href="https://mkcinema.app">Website</a> ·
  <a href="docs/install.md">Install</a> ·
  <a href="docs/features.md">Features</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center"><img src="docs/screenshots/app-home.webp" width="100%" alt="MKCinema Home screen"></p>

## Overview

MKCinema plays content from the Stremio addons you install. It ships no titles or streams of its own: catalogs come from Cinemeta, subtitles from OpenSubtitles, and the only built-in source is official trailers.

The project's focus is making existing addons work better without asking their developers to change anything. Any addon that speaks the Stremio addon protocol works as it is, and addons that want more can opt into an optional, data-only manifest field.

MKCinema is free. There is no paid tier, no ads and nothing locked behind donations.

## Addon support

Works with unchanged addons (web app 2.45):

- **Ratings.** Ratings addons that return their scores as stream rows are shown as IMDb, TMDB and Rotten Tomatoes ratings on the title line, with an IMDb rating per episode. The rows are removed from the source list.
- **Debrid notice clips.** When a debrid addon returns a short notice clip instead of the film, the player explains the problem and moves on to the next source.
- **Settings forms.** Addons built with the Stremio addon SDK that declare `manifest.config` can be configured in the app, including with a TV remote.

Opt-in for addon developers, through an optional `mkcinema` object in manifest and meta responses:

- Row layouts (poster, landscape, square, Top 10) and catalog placement (Home, Discover, Library)
- Poster badges, film-page panels and per-episode ratings on any title
- Library tabs and a copy of the viewer's watchlist
- Playback events, a `skips` resource for intro, recap and credit times, and device capabilities

Everything is validated data. MKCinema draws it with its own components and never runs addon code, HTML or CSS, and other clients ignore the field. Specs: [docs/addon-looks.md](docs/addon-looks.md) and [docs/addon-extras.md](docs/addon-extras.md).

## Features

- **Sources:** parallel addon queries, debrid with your own key, cached-result detection, source rules (resolution, file size, blocked words), fake and sample filtering, and automatic failover when a stream stalls.
- **Player:** HLS and direct playback, styled ASS subtitles via libass, embedded MKV subtitles and chapters, audio track selection, volume boost, skip intro and credits, and hand-off to external players such as VLC and mpv.
- **Library:** watchlist, progress, custom lists, new-episode alerts, Trakt, Simkl, AniList and MyAnimeList sync, and import from a Stremio account.
- **Households:** profiles with PINs, and kids profiles filtered by age rating.
- **TV:** remote-first navigation, a phone remote paired by QR code, TV sound on your phone for headphones, and the TV's hardware player on Android TV and Fire TV.
- **Social:** watch parties with synced playback, chat and push-to-talk, peer to peer.
- **Media servers and live TV:** Plex, Jellyfin and Emby libraries next to addon sources, and M3U or Xtream playlists with an XMLTV guide.
- **Recommendations:** a For you row computed entirely on the device.

The full list, with screenshots, is in [docs/features.md](docs/features.md).

## Platforms

| Platform | Package | Notes |
|---|---|---|
| Web | [app.mkcinema.app](https://app.mkcinema.app) | Installable as a PWA |
| Android | [APK](https://github.com/itbelikethatbruh/MKCinema/releases/latest) | Phones and tablets |
| Android TV, Google TV, Fire TV | [APK](https://github.com/itbelikethatbruh/MKCinema/releases/latest) | Fire TV: enter `tv.mkcinema.app` in Downloader |
| Windows | [EXE](https://github.com/itbelikethatbruh/MKCinema/releases/latest) | Not code-signed yet |
| macOS | [ZIP](https://mkcinema.app/download/MKCinema-1.1.1-mac.zip) | Not notarized yet |
| Linux | [DEB, tar.gz](https://github.com/itbelikethatbruh/MKCinema/releases/latest) | x86_64, WebKitGTK 4.1 |
| LG webOS | [IPK](https://github.com/itbelikethatbruh/MKCinema/releases/latest) | Beta, needs Developer Mode |
| Samsung Tizen | [TizenBrew module](tizen/README.md) | Beta, 2023 models and later |

iOS is not supported. Per-platform install notes are in [docs/install.md](docs/install.md).

## Architecture

```
  native apps ──load──► web app (app/index.html) ──HTTP──► Stremio addons
  (Android, Windows,     UI, addon engine, player  ──────► debrid APIs (relay where CORS blocks)
   macOS, Linux, TV)                               ──────► Supabase auth + per-user row (optional)
```

- **Web app** (`app/`): a single-page app served as static files from Cloudflare Pages. The native apps load the same hosted build, so every platform updates together.
- **Native shells:** Android (Java WebView with intent hand-off to video players), Windows (Go and WebView2), macOS (WKWebView through JavaScript for Automation) and Linux (C and WebKitGTK). They add native torrent playback (off by default), and Android and Windows add downloads.
- **Sync:** optional email sign-in through Supabase Auth. Each user's data lives in one row protected by row-level security, and debrid keys can be kept on the device only.
- **Companion server** (`app/mkcinema-server.js`, optional): a local trailer addon, a CORS proxy for streams that need headers, and audio transcoding when ffmpeg is installed.

## Building

```sh
cd app
npm install
node mkcinema-server.js   # app at http://127.0.0.1:7000/
```

The web app also runs from any static host. Build steps for Android, Windows, macOS, Linux and webOS are in [docs/install.md](docs/install.md#build-from-source).

## Repository layout

| Path | Contents |
|---|---|
| [`app/`](app) | Web app, PWA files, companion server, Supabase schema and Edge Functions |
| [`android/`](android) | Android, Android TV and Fire TV app |
| [`windows/`](windows), [`mac/`](mac), [`linux/`](linux) | Desktop apps |
| [`webos/`](webos), [`tizen/`](tizen) | LG and Samsung TV packages |
| [`site/`](site), [`tv-site/`](tv-site) | Website and the Fire TV download page |
| [`plugins/`](plugins) | Reviewed community plugins and themes |
| [`docs/`](docs) | Features, install guide and addon developer specs |
| [`tools/`](tools) | Release and build tooling |

## Privacy

No ads, cookies or tracking profiles. The only measurement is an anonymous visit count from Cloudflare Web Analytics, which can be turned off in Settings › Data. Recommendations are computed on the device. MKCinema only plays what your addons return, and you are responsible for using them lawfully where you live. See the [terms of use](https://app.mkcinema.app/terms.html) and [privacy policy](https://app.mkcinema.app/privacy.html).

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and report security issues privately as described in [SECURITY.md](SECURITY.md). Donations on [Ko-fi](https://ko-fi.com/mkcinema) are optional and unlock nothing.

## License

[GPL-3.0](LICENSE), with additional terms under section 7 in [NOTICE](NOTICE): forks must credit MKCinema and its author, mark themselves as modified, and use their own name and icon. Created by Drake Christopher.

MKCinema is an independent project and is not affiliated with or endorsed by Stremio. Third-party names are used only to describe compatibility.
