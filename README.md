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

## About

MKCinema is an independent project, designed, built and maintained by Drake Christopher. It started as a better-looking way to watch from Stremio addons and grew into a full media app: one codebase that runs on eight platforms, the browser included, with a player, a library, account sync, TV support, watch parties and tools for addon developers.

A few principles shape everything in it:

- **Free forever.** MKCinema will never charge for anything. There is no paid tier, no ads and no feature behind a paywall. Donations on [Ko-fi](https://ko-fi.com/mkcinema) are optional and unlock nothing.
- **Your addons, your accounts.** MKCinema ships no titles or streams. Catalogs come from Cinemeta, subtitles from OpenSubtitles, and the only built-in source is official trailers. Everything else comes from addons and debrid accounts you add yourself, and your keys stay in your own account.
- **Addons first.** Any addon that speaks the Stremio addon protocol works as it is, and MKCinema does extra work to make it look and behave better without its developer changing anything.
- **Private by default.** No ads, cookies or tracking profiles, and recommendations are worked out on your device.
- **Open source.** The full code is here under GPL-3.0.

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

## What's built

**Sources and debrid**
- Every installed addon is queried in parallel, and results appear as each one answers.
- Debrid support for the common services with your own key, a connection test, and cached results marked so they play right away.
- Smart Play picks the best source and explains why. Source Check hides fakes, samples, archives and wrong episodes, and flags cinema recordings.
- Source rules across all addons: lowest resolution, largest file size, HDR preference, blocked words and debrid order.
- Automatic failover to the next source when a stream shows no picture or stalls.
- Plex, Jellyfin and Emby libraries next to addon sources, with your own copy picked first.
- Optional torrent playback in the desktop, Android and TV apps, off until you turn it on.

**Player**
- HLS and direct playback, with hand-off to VLC, mpv, IINA, Infuse, MX Player, Just Player or PotPlayer.
- Styled ASS subtitles through libass, embedded MKV subtitles and chapters, OpenSubtitles built in, drag-to-sync timing, and automatic translation when no subtitle exists in your language.
- Audio track selection, sound modes (Clear voices, Night), audio delay and volume boost to 200%.
- Skip intro, recap and credits from TheIntroDB, AniSkip, the file's chapters and addons, with a countdown to the next episode.
- X-Ray on pause (cast, bios, release facts, picture and sound details), touch gestures, picture-in-picture, Chromecast and media keys.
- Optional on-device sharpening and upscaling.

**Library and discovery**
- Watchlist, Continue watching, Watched and custom lists, with sorting and filters.
- New-episode row and alerts, and sync with Trakt, Simkl, AniList and MyAnimeList.
- One-step import of addons, library and progress from a Stremio account.
- Your Picks: a For you row and plain-language search ("funny crime series"), worked out entirely on the device.
- Top 10 today, Universes, More like this, MDBList rows, an Anime section, and Peak Cinema for browsing films by their best scenes.
- Live TV from your own M3U or Xtream playlists with an XMLTV guide, and Split Screen for up to four streams.

**TV and the living room**
- Apps for Android TV, Google TV, Fire TV, LG webOS and Samsung (TizenBrew), built for the remote.
- On Android TV and Fire TV, streams play in the TV's hardware player, with HEVC, HDR, Dolby Vision and frame-rate matching.
- Your phone becomes a remote by scanning a QR code, with no app to install.
- Listen on phone: the film plays on the TV and the sound comes out of your phone, for headphones.
- Ambient Mode turns an idle TV into a screensaver of your films.

**Household and social**
- Seats for everyone in the house, each with its own picture, watchlist, progress and Home, with optional PINs.
- Kids seats filtered by the age rating where you live.
- Watch parties with synced playback, chat, reactions and push-to-talk, peer to peer.
- Discord status from the Windows app, off until you turn it on.

**Make it yours**
- Five looks (Noir, Midnight, Velvet, Sepia, Anime) and a colour wheel that tints the whole app.
- Menus in English, Spanish, Portuguese, French, German, Italian and Hindi.
- Arrange Home: hide, move or rename any row, per seat.
- Plugins and themes from a reviewed gallery, each checked against its checksum before it runs.

**For addon developers**
- Addon Studio: design a Stremio addon visually, test it in the app, and export a ready-to-run server.
- Addon Finder: search the community addon list and install in one press.
- One-tap install links from an addon's setup page.
- The optional `mkcinema` manifest field described above, with a built-in checker.

**Support**
- A troubleshooting guide in Settings with buttons that go straight to the right setting.
- A Diagnostic, a speed test, and Send log, which gives you a short code to paste into a bug report.

Screenshots and longer descriptions are in [docs/features.md](docs/features.md).

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

The only measurement is an anonymous visit count from Cloudflare Web Analytics, which can be turned off in Settings › Data. It never sees your addons, keys or what you watch. MKCinema only plays what your addons return, and you are responsible for using them lawfully where you live. See the [terms of use](https://app.mkcinema.app/terms.html) and [privacy policy](https://app.mkcinema.app/privacy.html).

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and report security issues privately as described in [SECURITY.md](SECURITY.md). If MKCinema is useful to you, a star helps other people find it.

## License

[GPL-3.0](LICENSE), with additional terms under section 7 in [NOTICE](NOTICE): forks must credit MKCinema and its author, mark themselves as modified, and use their own name and icon. Created by Drake Christopher.

MKCinema is an independent project and is not affiliated with or endorsed by Stremio. Third-party names are used only to describe compatibility.
