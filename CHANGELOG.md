# Changelog

All notable changes to MKCinema. The web app version and the native app versions are listed separately, because the native apps load the latest web app.

## Web app 2.7.29 (2026-11-04)

- **Wallpapers with real depth**: the Home banner and the screensaver are now layered scenes that move at different speeds. The key art pushes in and pans (a Ken Burns move), two layers of drifting light (fine dust and soft bokeh) float between the art and the title and move faster than it, and the title logo slowly turns in 3D after it pops in. On a desktop, the mouse moves the layers against each other. Art is cropped toward faces (the top third) instead of the centre. Phones keep the calm banner.
- **Screensaver**: the MKCinema mark in the corner is larger, bolder and brighter so it reads from the sofa, and the push is gentler so the art stays sharp on a TV. **Start screensaver** now sits at the top of Settings › Home.
- 2.7.27 and 2.7.28 (exit prompt, endless rows, cropped art, TV contrast) are included; their own notes come with their pull requests.

## Web app 2.7.25 (2026-11-04)

- **Wallpapers with 3D titles**: on TVs and desktops, Home's featured banner is now a wallpaper. The film's official key art runs edge to edge, up under the dock, and drifts slowly toward you. The title logo has a solid 3D edge (a thin rim light, a seven-step extruded side and a soft cast shadow) and pops forward each time the film changes. On a desktop, the art and the title move against each other with the mouse. Phones keep the rounded banner and get the 3D title and a short settle-in of the art. The banner's height comes from the screen, never the film, so the rows below never move.
- **Screensaver**: when nothing has been pressed for a while, the screen fills with key art and 3D title logos from Home, your watchlist and Continue watching, with a clock, alternating sides so nothing burns in. Any button (or Back on the remote) returns you exactly where you were, and the press is not passed on. It never starts while something plays. Settings › Home › Screensaver: TV after 3 minutes, desktop after 10, phones off by default, plus a "Show now" preview.
- In a Fire TV profile with a 6x slower CPU, rendering work while moving around Home is within run-to-run noise of 2.7.24 (no frames over 50 ms either way).

## Web app 2.7.26 (2026-11-04)

- **Peak Cinema, a scene surfer for when you can't decide**: start it from the panel under the featured banner on Home (or search "Peak Cinema"). It plays 90-second scenes from films in your catalogs and watchlist, one after another, with moods (Action, Sci-Fi, Thriller, Comedy, Horror, Animation, Drama). Keep watching opens the film in the player from that exact second, From the start opens it from the beginning, and Next scene skips. TV remotes: arrows and OK, plus Next track or Channel up/down to skip.
- **Honest scene picking**: there is no public database of best-scene timestamps, so none is faked. A scene starts between about a third and three quarters of the way in, past the opening and before the credits. Skips and keeps are learned on the device only (genres you keep come up more, and the window moves toward the moments you stayed for), and the info button explains it and can reset it.
- **Gentle on your accounts**: only sources your debrid service already has cached, in formats the device can decode, are used (1080p H.264 first, since many 4K HEVC files will not decode in browsers or TV apps). The browser jumps straight to the scene with a range request. One film is looked up at a time, at least 2.5 s apart, only the next scene is buffered, and a debrid link is requested only for the scene that plays next.
## Web app 2.7.23 (2026-11-04)

- **Back from VLC lands on the film's page**: playing a source in VLC or another outside player no longer opens the in-app player with an "Opening in VLC" panel (whose buttons overlapped the player controls). MKCinema stays on the film's page, or opens it when you started from Home, and hands the stream to the app, so pressing Back in the player returns you to the source list. A short note says it is opening; if the app never takes over (not installed, or the browser wanted a tap), a quiet note says so and the sources are right there. The player's own "Open in another app" menu works the same way.

## Web app 2.7.22 (2026-11-03)

- **Smart TV speed, measured properly**: on a TV every row of posters was split into extra graphics layers as wide as the whole row (about 33 megapixels of layers on Home), and the animated focus on posters rebuilt them twice on every remote press. Rows are now self-contained, and the poster lift and ring switch instantly on a TV. In a Fire TV profile with a 6x slower CPU, the page's rendering work per remote press fell by about 60%, frames over 50 ms while moving fell from 30 to 2, and none go over 100 ms. Moving left and right along a row no longer measures the whole page, and Home rows hold 24 posters on a TV (See all has the rest).
- **No splash on TV**: the app opens straight to Home, ready for the remote, and builds no intro audio. Desktop and phones keep the intro.
- **TV fixes**: the welcome tour's last step no longer leaves OK doing nothing; the Home-layout question and the donation prompt can be reached and answered with the remote, and Back closes them (and the phone-remote card) instead of leaving the app; a focused row heading no longer hides under the dock; the featured banner no longer forces a full page layout on each change.

## Web app 2.7.21 (2026-11-02)

- **MKCinema Remote, your phone as a TV remote**: scan the QR code on the TV (it shows in a corner the first few launches, and any time in Settings › Devices › Phone remote) and the phone opens a dedicated remote page at `/remote`. It loads instantly (no app boot, no SDK download), and it talks to the TV over one Realtime socket, about 40 ms phone to TV. It has a touchpad (swipe to move, hold a swipe to keep going, flick for several steps, tap for OK) or a D-pad with OK, plus Back, Home, and Type. Type opens a keyboard whose letters show up on the TV as you type, with voice search where the phone's browser supports it. The keyboard also opens by itself when the TV selects a text box. The page shows what the TV has selected or is playing, with artwork and a progress bar you can drag to seek, and it has play/pause, skip, volume and subtitles. Pairing is remembered on both sides: the TV keeps its code, and the phone reconnects to the last TV when opened (it also reconnects by itself after the screen locks). The remote can be added to the home screen as its own app. "New code" in Settings unpairs every phone. When the TV is showing its sign-in QR code, the remote offers to sign the TV in from the phone.
- The old in-app phone trackpad is replaced by the new remote, and old `#remote=` links forward to it.

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
