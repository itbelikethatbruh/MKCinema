# Changelog

All notable changes to MKCinema. The web app version and the native app versions are listed separately, because the native apps load the latest web app.

## Web app 2.7.19 (2026-11-01)

- **Smart TV speed**: the splash now runs as a CSS animation on the TV's graphics chip, so it stays smooth while the app loads behind it, and it is shorter (2.9 s). Icons are drawn once and reused: before, every featured-banner change redrew all 200+ icons on the page, a stall of about 100 ms on a slow TV every 9 seconds. The intro sound's reverb is built about 60 times faster. On a TV the featured banner waits while you are using the remote and changes every 14 seconds, card titles and the banner logo use lighter shadows, and the hidden ambilight no longer runs a frame loop during playback.

## Web app 2.7.18 (2026-11-01)

- **About & licenses** in Settings › More: the app version, Stremio's original MIT copyright notice (for the Stremio Add-on SDK and stremio-core), and the full license text of every other third-party library, font and server package MKCinema uses. GSAP's terms are linked, because GreenSock publishes them only on its website.
- **MKCinema's own license made real**: the project always said GPL-3.0 but had no LICENSE file. The repo now has the official GNU GPL v3 text, the companion server's `package.json` says `GPL-3.0-only` instead of the wrong `MIT`, and the About page shows © 2026 Drake Christopher with the GPL's no-warranty notice.
- About also credits the data sources: Wikipedia text (CC BY-SA 4.0) and the other services MKCinema connects to, used under their own terms.

## Web app 2.7.17 and native apps 1.2 (2026-10-31)

- **Smart TV remote**: a bold platinum focus ring with a small lift on whatever is selected, so it reads from the sofa. The remote starts on Smart Play, remembers your place in each row and each panel, and puts you back on the poster you came from when you close details or the player. Up/Down always leave a text box (TV remotes have no Tab key). In the player, Up/Down reach the controls, Left/Right seek when no control is selected, OK plays/pauses, and Back leaves the controls before it leaves the player.
- **Smooth at High on TVs**: TVs get solid panels (no glass blur), no ambilight canvas, no endless decorative animations, no scroll snapping, and focus motion uses only transform and opacity. The effects governor never drops a TV to Low, and a TV it already dropped goes back to High once. The dock hides items that don't apply on a TV (play a local file, intro sound, rails/IMAX switch, Addon Studio).
- **Voice search on Android and TVs** (app 1.2): WebViews have no Web Speech API, so the app now runs the system speech recognizer and hands the text to search. The remote's search key starts voice search. If a TV offers no speech service to apps (Fire TV's mic belongs to Alexa), the search box opens the on-screen keyboard instead.

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
