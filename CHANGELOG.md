# Changelog

All notable changes to MKCinema. The web app version and the native app versions are listed separately, because the native apps load the latest web app.

## Native apps 1.1 (2026-10-26)

- **Smart TV**: the Android app now runs on Android TV, Google TV and Fire TV. It appears in the TV's apps row with an MKCinema banner, lays the app out at 1280×720 for viewing from the sofa, and works with the remote: arrows and OK move around, Back closes whatever is open (then goes Home, then exits), and play/pause, rewind, fast-forward and next work from the media keys. Same package and signing key as the phone app, so 1.1 installs over 1.0. Download `MKCinema-TV.apk`, or enter `mkcinema-site.pages.dev/tv` in Downloader.
- **LG webOS** (beta): `com.mkcinema.app_1.1.0_all.ipk`, a hosted web app. Needs Developer Mode or Homebrew Channel. The web app (2.7.12) handles the webOS Back button.
- Samsung Tizen isn't supported yet: Samsung requires a Samsung-issued signing certificate.

## Native apps 1.0 (2026-10-26)

- **Android** app (`MKCinema.apk`): full-screen WebView, intent hand-off to VLC, MX Player, Just Player and mpv, subtitle file picker, microphone for watch-party push-to-talk, offline screen.
- **Windows** app (`MKCinema.exe`): Microsoft Edge WebView2 window, data kept in `%LOCALAPPDATA%\MKCinema`, prompts to install WebView2 when it's missing.
- **Mac** app (`MKCinema-1.0.dmg`): WKWebView window with standard menus, full screen and keyboard shortcuts; player links (Infuse, IINA) open in their apps.
- **Linux** app (`.deb` and `.tar.gz`): WebKitGTK 4.1 window with a launcher entry and icon; Ctrl+Q quits, F5 reloads.
- New website at [mkcinema-site.pages.dev](https://mkcinema-site.pages.dev) with downloads for every platform.
- MKCinema is now open source under GPL-3.0.

## Web app 2.7.2 (2026-10-26)

- Loading screen: no progress line under the title; the logo keeps a gentle pulse even with reduced motion on.

## Web app 2.7 (2026-10-26)

- Top bar keeps full tab labels and moves tabs onto their own row when space runs short.
- Pop-ups share one solid graphite finish.
- Clearer stream rows with a "Best match" label and plain-text size, peers and tracker.
- X-Ray: cast photos, actor pages, About (Wikipedia, release facts, OMDb awards) and This scene.

## Web app 2.6

- Watch party button in the dock, Browser only mode, profile photo, high text contrast by default, PayPal support button, new welcome walkthrough, MK app icons.

## Web app 2.5

- Readability pass, raised dock buttons, swipeable featured banner, 3D title logos, colour rating badges, store badges, landscape episode sheet.

## Web app 2.4

- New Didone MK monogram, episode sheet with sources, Get started guide (VLC and TorBox), "VLC recommended" tags, grouped settings.

## Web app 2.3

- Loading screen, Skip Intro, next-episode countdown, failover, Night Mode audio presets, X-Ray, bookmarks, subtitle sync, Spoiler Guard, audio rescue with ffmpeg, debrid, ratings, watch party, watch on phone, phone as remote, Trakt and Simkl, airing calendar, Setup Cloner.
