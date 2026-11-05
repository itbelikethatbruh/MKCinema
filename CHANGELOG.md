# Changelog

All notable changes to MKCinema. The web app version and the native app versions are listed separately, because the native apps load the latest web app.

## Web app 2.13.2 (2026-11-05)

- **Faster start**: each launch no longer downloads the app a second time in the background (about 360 KB) while checking for a self-hosted server setting.
- **First visit**: the walkthrough always shows. It could lose a race with the menu question and then not appear, which also skipped the "What do you watch most?" question.
- **Small phones**: on screens 360 px wide or narrower, the Settings button no longer sticks out of the top bar or disappears.
- **TV**: rows no longer stick out 2 px past the screen edge, which let the page shift sideways.
- **TV**: Back from a section to Home now puts the focus on Home, so the next press of the remote isn't lost.
- **Black title logos are readable**: logos drawn in black, which vanished on the dark banner and details page, are now shown in white. Coloured logos are left alone.
- **Details**: the awards line no longer appears twice.
- **Phones use less data at start**: posters now load as their row comes near, instead of about 110 at once (about 50 now, same full-size images).
- **TV**: Left on the banner's Smart Play now shows the previous featured title instead of jumping across the screen to the arrows.
- The keyboard shortcut hint at the bottom of the page is hidden on phones, tablets and TVs.

## Web app 2.13.1 (2026-11-05)

- **TV: the whole side menu is reachable**: with the side menu on, Down from Calendar now continues to Addons, Account, Watch party and Settings instead of jumping into the catalog.
- **TV: every option in Settings is reachable**: Up and Down walk the options row by row, so buttons at the right edge (such as Add in Plugins & themes, and Text color in Subtitles) are no longer skipped.
- **Walkthrough buttons stay put**: Back and Next sit in the same place on every step. A longer step scrolls inside the panel (Up and Down on a remote).
- **Phone Back button**: Back closes what is open, then returns to the previous screen, and at the start screen asks for a second press before leaving the app.

## Web app 2.13.0 and Android/TV app 1.3.0 (2026-11-05)

- **Torrents on Android, Android TV and Fire TV** (Settings › Torrents, off by default): the app now carries the same download-only torrent engine as the Windows app. On a TV stick it keeps one torrent at a time, stops if free storage runs low, and deletes everything when you turn it off or close the app. Settings explains that peers can see your IP before it can be turned on. Older 32-bit Fire TV Sticks are included.

## Windows app 1.2.1 (2026-11-05)

- **Discord status is available**: turn on Settings › Desktop app › "Show what I'm watching on Discord" to show "Watching" and the title on your profile while the Discord app is open.

## Web app 2.12.0 and Windows app 1.2.0 (2026-11-05)

- **Anime skip times with any addon**: series with IMDb ids (the usual catalog) now get opening and ending times from AniSkip too, including seasons split into parts. A **Skip ending** button appears when more episode follows the ending, and both are marked on the seek bar.
- **Plugins & themes** (Settings › Look and feel): a reviewed gallery from this repository's `plugins/` folder. Every file is checked against its SHA-256 before it runs, and adding a plugin from a link is tucked under "For developers" with a warning. Start with `#safe` in the address to skip all plugins.
- **Windows app: play torrent sources on this PC** (Settings › Desktop app, off by default). Download only, never uploads or seeds, and the downloaded pieces are deleted when it is turned off or the app closes. Settings explains that peers can see your IP before it can be turned on.
- **Windows app: Discord status** ("Watching" and the title) through Discord's local pipe, off by default.

## Web app 2.11.1 (2026-11-05)

- **TV: the keyboard opens only when you ask**: moving the remote past a text box (an API key, a playlist link, a search box) no longer pops up the on-screen keyboard. Press OK on the box to type.
- **TV: steadier focus in Settings**: Up and Down stay in the column you are in, Left from an option goes back to its section, and Right from the section list goes into its options instead of the close button.

## Web app 2.11.0 (2026-11-05)

- **Side menu (optional)**: the main menu can now sit down the left side instead of across the top. On desktop it lists every section with its name. On narrower screens and TVs it shows icons, and opens with the names when you point at it or press Left on the remote. On phones, a menu button slides the sections in from the left. MKCinema asks once which you prefer, and you can switch any time in Settings › Appearance. The choice is kept per device.
- **Simpler Appearance**: one colour wheel replaces the theme cards and the custom theme builder. Turn the wheel (Left and Right on a TV remote) and the whole app follows; Classic black goes back to the original look. A look you already picked keeps working.

## Web app 2.10.0 (2026-11-05)

- **Seat pictures**: MKCinema now has its own set of soft 3D-style portraits, covering a range of skin tones, hair types and head coverings, plus six playful characters for kids. Surprise me rolls a new one. Your main seat shows your account's profile photo if you added one.
- **Edit seats from Who's watching**: a Manage seats button lets you rename a seat, change its picture or set a PIN, without going into Settings. A kids seat still needs the grown-up PIN, and a locked seat asks for its own PIN first.
- On another seat, the account button shows that seat's picture.

## Windows app 1.1.0 (2026-11-05)

- **Fixes the app closing right after it opens.** When Microsoft Edge WebView2 failed to start, the app crashed with no message. Start-up errors are now caught and explained, with a link to reinstall WebView2 when that's the fix, and details go to `%LOCALAPPDATA%\MKCinema\mkcinema.log`.
- WebView2Loader.dll is loaded from disk instead of from memory, which some antivirus tools block.
- One window only: opening MKCinema again brings it to the front.
- The window fits your screen and display scale, starts maximized on small screens, remembers its size and position, and has a dark title bar with no white flash while loading.
- Video fullscreen now fills the whole screen, and F11 toggles fullscreen. Right-click Copy and Paste work in text fields.
- Links that open a new window (YouTube, GitHub) open in your browser. The page reloads itself if it crashes.

## Web app 2.9.9 (2026-11-05)

- **One-tap install from addon setup pages**: addons that need your own settings or token end their setup page with an Install button. On Android and TV (app 1.2.8), that button now opens MKCinema, which shows the addon's name and asks before installing. In the browser, when you come back from a setup page, MKCinema offers to install the link you copied. Installing the same addon with new settings replaces the old copy.

## Web app 2.9.8 and Android app 1.2.8 (2026-11-05)

- **Sources that need request headers play on TV**: some addons mark a stream as needing headers such as a Referer. The TV app's own player now sends them itself, so these streams play without the companion server. Older TV apps and browsers keep the previous behaviour.
- **Clearer source tag**: such streams are tagged "needs headers" instead of "via proxy".
- **Addon Install links open the app**: Android app 1.2.8 opens stremio:// Install links from addon setup pages.

## Web app 2.9.7 (2026-11-05)

- **Anonymous visit counts (optional)**: MKCinema now uses Cloudflare Web Analytics on the app, the website and the TV help page. Once per visit it counts the page, the site you came from, browser, country and load speed. It sets no cookies and no IDs, and it never sees your addons, keys or what you watch. Turn it off under Settings › Data › Share anonymous visit counts. Privacy wording updated to match: no ads, no cookies, no profiles.

## Web app 2.9.6 (2026-11-05)

- **Update bar on TV**: the remote can now reach Update and Later on the "TV app is ready" bar. The bar takes focus when it appears, Left and Right move between its buttons, and Back puts it away.

## Web app 2.9.5 (2026-11-05)

- **Community addon directory on TV**: the remote no longer gets stuck on the All filter, and the search box no longer flashes the on-screen keyboard. The keyboard opens only when you press OK on the search box. Up and Down move cleanly from search to the filters to the list, one addon at a time, and typing updates the list without redrawing the search box.

## Web app 2.9.4 (2026-11-05)

- **Peak Cinema details**: Details (or Menu on the remote) pauses the scene and slides in the story, cast, director, running time and ratings. Back returns to the scene where it paused; Keep watching, From the start and Full page are one press away.

## Android app 1.2.7 (2026-11-05)

- **A proper Fire TV tile**: the app tile on TVs is now a square monogram-and-wordmark icon. Fire TV draws sideloaded apps in a square box, and the wide banner art was being squeezed into it.

## Web app 2.9.3 (2026-11-05)

- **Watch Party, redesigned**: Host and Join side by side, a six-cell code entry, a switch for sharing your stream link, and inside a party the code as letter tiles, members as avatar chips, reactions and chat. It follows your theme, and TV focus rings stay inside the panel.
- **Split Screen from any film page**: a Split Screen chip next to the source filters puts the best source into a tile.

## Web app 2.9.2 and Android app 1.2.6 (2026-11-05)

- **Sharper Ambient Mode**: the screensaver draws at the screen's full resolution (it drew at half size on TVs before) and uses full-size art, with 4K catalog backdrops when no keys are set. Memory limits for streaming sticks stay in place.
- **Picture-in-picture on phones**: in the Android app, pressing Home while a film plays shrinks it into a floating window. Swiping the window away pauses it.
- **Accessibility**: film pages and the player are announced as dialogs, player messages are read out, Library tabs and filters have proper roles, and the page has a heading for screen readers.

## Web app 2.9.1 and Android app 1.2.5 (2026-11-05)

- **The TV player**: on Android TV and Fire TV, streams play in the TV's own hardware player, so MKV, HEVC, HDR and Dolby Vision play the way the TV plays them. OK pauses, Left and Right skip, Menu switches the audio track, and your subtitle language comes along. MKCinema still picks the source, saves where you stopped and moves on to the next episode. If a source won't open there, the MKCinema player takes over. Settings › Playback › TV player switches back.
- **Frame-rate matching**: the TV switches to the film's frame rate while it plays (24p without judder) and back afterwards. It can be turned off.
- **One-tap updates** in the Android app: Update downloads the new version and opens the installer.
- **Home media servers on http://**: Jellyfin and Emby on a plain home address now work inside the Android app.

## Web app 2.9.0 (2026-11-05)

- **A real Library**: tabs for Watchlist, In progress, Watched and your own lists, Films or Series, sorting by date added, title, year or rating, Hide watched and a filter box. A Lists button on every film page adds it to any list; lists follow your account.
- **Source rules** (Settings): hide cam and screener copies, set a lowest resolution, a largest file size and an HDR preference, block your own words, and choose which debrid service goes first.
- **Lock-screen and media keys**: phones, headphones, keyboards and remotes show what is playing and can play, pause, seek and skip to the next episode.
- **Update notice**: a quiet bar says when a newer MKCinema or Android app is out.
- **Fixes**: the banner arrows no longer cover the rating line; on TVs the menu's selection ring stays inside its tab.

## Web app 2.8.9 (2026-11-05)

- **Your own media servers**: connect Plex (a code on plex.tv/link), Jellyfin or Emby, and films and episodes you own show up as sources; Smart Play picks them first.
- **New episodes**: a row under Continue watching and one quiet notice when a series you follow has a new episode.
- **Kids seats need a grown-up PIN**, with a one-minute lockout after five wrong tries; an unlock lasts ten minutes.
- **Faster Smart Play**: it starts on the first ready source instead of waiting for the slowest addon. On TVs the remote's Play button plays the selected poster.
- **Debrid order**: with several keys saved, the one you added first is used.

## Web app 2.8.8 (2026-11-05)

- **Calm ratings**: one dark pill with white numbers and a soft gold star, instead of green, yellow and red.
- **Roomier Seats**: each seat in its own card, names on one line, a clear "Watching now" line.

## Web app 2.8.7 and Android app 1.2.4 (2026-11-05)

- **Smooth trailers on TVs**: trailers open in the YouTube app, which uses the TV's own video hardware. Without it they play inside MKCinema as before; Settings › Trailers can switch back.

## Web app 2.8.6 and Android app 1.2.3 (2026-11-05)

- **No more stuck remote**: on Movies and Series the Catalog drop-down kept every arrow press, so the remote was trapped until you backed out. Arrows now always leave drop-downs and multi-line boxes. If nothing lies above, Up goes to the top menu, and a panel that can still scroll moves a step instead of doing nothing.
- **Rows glide without jitter on TVs**: moving along a row no longer re-centres the page on every press, and the row no longer slips back a few pixels at the start of each move. One steady glide follows the remote, faster when a button is held.
- **Networks without boxes**: each service is its raised logo with a stepped edge and soft shadow; a see-through glass edge marks the selected one. Logos float gently (on TVs only the selected one), drift against the row as it scrolls and lean toward the pointer on computers.
- **Full-width TV tile**: Android app 1.2.3 gives TVs the wide MKCinema banner as the app icon, so Fire TV no longer shows a small square between grey bars. Phones keep the square icon.

## Web app 2.8.4 (2026-11-05)

- **A simpler Home**: one clear order (Continue watching, My watchlist, Top 10, Networks, Popular films and series, your picks, themed rows, Critically acclaimed), with the extras at the bottom. Rows have plain names such as "Popular films", a film shows once on Home, and the banner just says Featured.

## Web app 2.8.3 and Android app 1.2.2 (2026-11-05)

- **No white bar on TVs**: the white bar down the right edge at start-up was the Android TV app's own scrollbar, which the page cannot hide. Android app 1.2.2 turns it off (and the edge glow). Reinstall it once from mkctv.pages.dev.
- **Rows slide like Netflix on TVs**: the selected poster stays at the left of the row and the row slides under it. Quick or held presses move instantly so the TV never falls behind, and Right on the last poster goes round to the first.
- **Solid Top 10 numbers**: the thin outlined rank numbers are now solid and crisp.
- **Network logos**: the Networks row and each service's page show the service's real logo, lifted off its tile with a soft glow and shadow. The logos ship with the app.

## Web app 2.8.2 (2026-11-05)

- **Networks**: a Networks row under Top 10 opens what's on Netflix, Disney+, HBO Max, Prime Video, Apple TV+, Hulu, Paramount+, Peacock, Crunchyroll and Starz in your country, as films or series, with more on demand. The lists come from the community Streaming Catalogs addon and need no key; playing still goes through your own addons. Kids seats don't show the row.
- **Banner arrows on TVs**: the featured banner's arrows show on TVs and the remote reaches them: Left from Smart Play goes to the previous film's arrow, Right from Watchlist to the next.
- **Rows stop at their ends on TVs**: pressing Right on the last poster in a row (Top 10 included) stays there instead of jumping to a button somewhere else on the page. Endless rows load more and carry on.
- **Where to watch shows each service once**: rent and buy share one row, and a service you can stream on is not listed again under rent or buy.

## Web app 2.8.1 (2026-11-05)

- **Loading screen polish**: Fire TV showed its own white scrollbar down the right edge while Home was still building. The page can no longer scroll while the loading screen is up, and scrollbars stay hidden from the first frame. The loading screen now shows the platinum MK monogram from the intro with MKCINEMA under it.

## Web app 2.8.0 (2026-11-05)

- **Smooth first look**: on a fresh start Home used to appear in stages, with unstyled cards, an empty banner and text fading in. A plain MK cover with a progress bar now holds until the styles, the first row and the banner art are ready, then Home fades in once, complete. It never holds longer than 3.5 seconds on a TV or 4.5 seconds elsewhere.
- **Smoother YouTube trailers**: the trailer pop-up was see-through, so the whole app under it was redrawn with every video frame. Nothing under a playing trailer is drawn now, and on TVs and phones the frame drops its rounded clip so the video can use the hardware path.
- **Send to TV**: cast the playing stream to a Chromecast or Google TV (AirPlay where the browser offers it), with a small remote bar and "Play here" to take it back.
- **Channels and guide**: add your own M3U playlist, Xtream login or playlist file, with an optional XMLTV guide. Live TV shows a guide grid with search, groups and favourites. A channel your browser cannot open offers a hand-off to VLC.
- **Split Screen**: watch up to four channels or streams at once (two on TVs and phones). Sound follows the tile you pick.
- **Player tools**: sleep timer with a gentle fade, A-B repeat, save a still frame, second subtitles, seek previews and your own key bindings in Settings › Shortcuts.
- **Source Check**: sources that are executables, archives, samples, password-locked or the wrong episode are hidden; cinema recordings, screeners and suspicious sizes are flagged. Each best match says why it was picked.
- **Curated Home rows**: Top 10 films today, Under 90 minutes, Hidden gems, Award winners and a decade of the day, plus the Shortlist: twenty picks to skip or save.
- **Where to watch and honours**: a film page shows its streaming services for your region (with your own TMDB key) and its awards.
- **Seats**: profiles for everyone in the house, each with its own watchlist, progress and picks, an optional PIN, and kids seats that only show Animation and Family titles.
- **Atelier**: build your own theme from blacks, highlights, type and corners, and share it as a code. Custom CSS for those who want it.
- **Addon directory, line check and problem reports**: browse community addons in the app, measure your connection to get a quality suggestion, and file a report with diagnostics that never include keys.

## Web app 2.7.38 (2026-11-04)

- **Peak Cinema on TVs**: the scene sat far up the screen with a purple area below it when Home had been scrolled. The page now goes to the top while Peak Cinema is open, and the scene is centred by layout instead of offsets.

## Web app 2.7.37 (2026-11-04)

- **Peak Cinema follows your theme again**: 2.7.36 was built from a copy that had lost the theme colours on Peak Cinema, so it always showed in Noir. Midnight, Velvet and Sepia now apply to it again, as they did in 2.7.35.

## Web app 2.7.36 (2026-11-04)

- **Peak Cinema on TVs tries the film's other source**: when the first cached copy of a scene will not open, the film's second cached source is tried before Peak Cinema moves on to another film.

## Web app 2.7.35 (2026-11-04)

- **Faster start on every device**: the app no longer waits for 840 KB of third-party scripts before it can draw. The icon library (1,700 icons, 355 KB) is replaced by the 146 icons MKCinema uses, built in (27 KB); an icon outside that set still loads the full library on its own. The video streaming library (hls.js, 413 KB) loads when a film's page opens, and a stream waits for it if needed. TVs skip the intro animation library, since they never show the intro. In a Fire TV profile with a 6x slower CPU, script work while starting fell from about 0.67 s to 0.26 s.
- **Smoother remote on TVs**: posters' info overlay and buttons still faded on every focus move, which repainted the whole page on each frame. On a TV every focus change is now instant. Per remote press, style work fell about 70%, painting about 50% and layer building about 60% in the same profile.

## Web app 2.7.34 (2026-11-04)

- **Four themes**: Noir stays the default, and Settings › Appearance adds Midnight (ink blue blacks, ice silver type), Velvet (deep oxblood, soft ivory, rose gold highlights) and Sepia (warm umber blacks, cream type, amber highlights). Each theme keeps Noir's lightness for every colour, so contrast, the TV light-on-dark rules and focus states carry over. Video surfaces stay true black in every theme. No new effects.

## Web app 2.7.33 (2026-11-04)

- **Ambient Mode shows each title once**: fanart.tv "clear art" cutouts have the title printed on them, and so do TMDB backdrops tagged with a language. Textless backdrops are now preferred. When the art carries the title, our own logo stays off, and the cutout sits higher so its title stays on screen.
- **Ambient Mode on Fire TV**: it could crash after a few films. Every film now frees its images when it leaves, large art is shrunk once and the full-size copy released, skipped preloads are freed, a stuck image can no longer stall a scene, a lost WebGL context falls back to the CSS mode, and TVs get a flat stage with no nested 3D layers or animated filters. In a Fire TV profile, 16 films in a row hold 1 to 2 live images and a steady 11 to 12 MB heap.
- Includes the Peak Cinema fix from its own thread.

## Web app 2.7.32 (2026-11-04)

- **Ambient Mode** replaces the screensaver: a layered 3D scene for each film from Home, your watchlist and Continue watching. Each scene lasts 14 seconds, the next one is loaded 5 seconds ahead, and scenes change with a 2-second Z-warp (the old scene pushes past you while the new one settles in).
  - **Shadowbox** (when a transparent character cutout exists on fanart.tv): backdrop, particles, the cutout and the logo sit on separate 3D planes that pan against each other, with a rim glow taken from the backdrop's two main colours.
  - **Depth** (a CORS-readable backdrop and WebGL): a fragment shader builds a depth map from the image (centre weight, brightness and contrast) and orbits a virtual camera by up to 2.5%, with the edges anchored.
  - **Classic** (anything else): a slow pan with the same particles and HUD.
  - Particles follow the genre: fog and ash for horror, sci-fi and thriller; embers and bokeh for action and crime; projector dust in a light beam otherwise. The HUD shows year, IMDb rating, genres and a pulsing "Press OK to watch".
  - Remote: Left and Right browse, OK opens the film's page, Back or any other button returns. A frame-time governor steps the effects down when the device can't keep up.
- Starts after 90 seconds idle by default on TVs and desktops (phones stay off). Settings › Home: **Screensaver / Ambient Mode** starts it now. Optional free **Fanart.tv** and **TMDB** keys unlock cutouts, clean logos and the depth mode; they stay on the device.

## Web app 2.7.31 (2026-11-04)

- **Featured banner back to calm**: the Home banner is back to how it was before 2.7.25, a rounded card with still art and a plain title. The dots, motion, edge-to-edge layout and turning title are gone, along with the extra graphics work they caused (Fire TV profile: layers back from 15 to 10 MPx). Only the top-biased crop stays, so faces aren't cut off. All the 3D and depth effects now live only in the screensaver.
- Includes 2.7.30 (Peak Cinema on TVs uses one video element).

## Web app 2.7.29 (2026-11-04)

- **Wallpapers with real depth**: the Home banner and the screensaver are now layered scenes that move at different speeds. The key art pushes in and pans (a Ken Burns move), two layers of drifting light (fine dust and soft bokeh) float between the art and the title and move faster than it, and the title logo slowly turns in 3D after it pops in. On a desktop, the mouse moves the layers against each other. Art is cropped toward faces (the top third) instead of the centre. Phones keep the calm banner.
- **Screensaver**: the MKCinema mark in the corner is larger, bolder and brighter so it reads from the sofa, and the push is gentler so the art stays sharp on a TV. **Start screensaver** now sits at the top of Settings › Home.
- 2.7.27 and 2.7.28 (exit prompt, endless rows, cropped art, TV contrast) are included; their own notes come with their pull requests.

## Web app 2.7.28 (2026-11-04)

- **Endless rows**: Home catalog rows keep loading as you scroll right (touch, trackpad, mouse wheel) or press Right on a TV remote, first from the page already fetched and then from the addon's next page (the Stremio `skip` extra). "See all" stays in the row heading, and a See all tile closes the row when the catalog runs out (or after 240 posters on a TV, 400 elsewhere). The remote no longer measures posters in rows far off screen, so long rows don't slow every key press.
- **Art keeps faces in view**: the details banner crops from the bottom, under the fade, instead of the middle, and is a little taller on wide screens, so heads are no longer cut off at the top.
- **TV: no dark text on light buttons**: on some TVs dark text on the white Smart Play button, selected chips, the IMDb badge and the stream tags showed as white on white. On TV they are now light text on dark with a platinum edge.
- Builds on 2.7.27 (Exit prompt on TV Back).

## Web app 2.7.27 (2026-11-04)

- **Exit prompt on TV**: on the Android TV / Fire TV app and LG webOS, Back now closes whatever is open, then returns to Home, then asks "Leaving MKCinema?" instead of quitting straight away. Press Back again to exit, or OK on "Keep watching" to stay. A Back pressed within 0.7 s of the prompt appearing is ignored, so mashing Back can't exit by accident. Works with the installed TV app 1.2.1, so no reinstall is needed.

## Web app 2.7.26 (2026-11-04)

- **Peak Cinema, a scene surfer for when you can't decide**: start it from the panel under the featured banner on Home (or search "Peak Cinema"). It plays 90-second scenes from films in your catalogs and watchlist, one after another, with moods (Action, Sci-Fi, Thriller, Comedy, Horror, Animation, Drama). Keep watching opens the film in the player from that exact second, From the start opens it from the beginning, and Next scene skips. TV remotes: arrows and OK, plus Next track or Channel up/down to skip.
- **Honest scene picking**: there is no public database of best-scene timestamps, so none is faked. A scene starts between about a third and three quarters of the way in, past the opening and before the credits. Skips and keeps are learned on the device only (genres you keep come up more, and the window moves toward the moments you stayed for), and the info button explains it and can reset it.
- **Gentle on your accounts**: only sources your debrid service already has cached, in formats the device can decode, are used (1080p H.264 first, since many 4K HEVC files will not decode in browsers or TV apps). The browser jumps straight to the scene with a range request. One film is looked up at a time, at least 2.5 s apart, only the next scene is buffered, and a debrid link is requested only for the scene that plays next.

## Web app 2.7.25 (2026-11-04)

- **Wallpapers with 3D titles**: on TVs and desktops, Home's featured banner is now a wallpaper. The film's official key art runs edge to edge, up under the dock, and drifts slowly toward you. The title logo has a solid 3D edge (a thin rim light, a seven-step extruded side and a soft cast shadow) and pops forward each time the film changes. On a desktop, the art and the title move against each other with the mouse. Phones keep the rounded banner and get the 3D title and a short settle-in of the art. The banner's height comes from the screen, never the film, so the rows below never move.
- **Screensaver**: when nothing has been pressed for a while, the screen fills with key art and 3D title logos from Home, your watchlist and Continue watching, with a clock, alternating sides so nothing burns in. Any button (or Back on the remote) returns you exactly where you were, and the press is not passed on. It never starts while something plays. Settings › Home › Screensaver: TV after 3 minutes, desktop after 10, phones off by default, plus a "Show now" preview.
- In a Fire TV profile with a 6x slower CPU, rendering work while moving around Home is within run-to-run noise of 2.7.24 (no frames over 50 ms either way).

## Web app 2.7.24 (2026-11-04)

- **TV film pages open at the top**, and the TV top bar is larger so it reads from the sofa.

## Web app 2.7.23 (2026-11-04)

- **Back from VLC lands on the film's page**: playing a source in VLC or another outside player no longer opens the in-app player with an "Opening in VLC" panel (whose buttons overlapped the player controls). MKCinema stays on the film's page, or opens it when you started from Home, and hands the stream to the app, so pressing Back in the player returns you to the source list. A short note says it is opening; if the app never takes over (not installed, or the browser wanted a tap), a quiet note says so and the sources are right there. The player's own "Open in another app" menu works the same way.

## Web app 2.7.22 (2026-11-03)

- **Smart TV speed, measured properly**: on a TV every row of posters was split into extra graphics layers as wide as the whole row (about 33 megapixels of layers on Home), and the animated focus on posters rebuilt them twice on every remote press. Rows are now self-contained, and the poster lift and ring switch instantly on a TV. In a Fire TV profile with a 6x slower CPU, the page's rendering work per remote press fell by about 60%, frames over 50 ms while moving fell from 30 to 2, and none go over 100 ms. Moving left and right along a row no longer measures the whole page, and Home rows hold 24 posters on a TV (See all has the rest).
- **No splash on TV**: the app opens straight to Home, ready for the remote, and builds no intro audio. Desktop and phones keep the intro.
- **TV fixes**: the welcome tour's last step no longer leaves OK doing nothing; the Home-layout question and the donation prompt can be reached and answered with the remote, and Back closes them (and the phone-remote card) instead of leaving the app; a focused row heading no longer hides under the dock; the featured banner no longer forces a full page layout on each change.

## Web app 2.7.21 (2026-11-02)

- **MKCinema Remote, your phone as a TV remote**: scan the QR code on the TV (it shows in a corner the first few launches, and any time in Settings › Devices › Phone remote) and the phone opens a dedicated remote page at `/remote`. It loads instantly (no app boot, no SDK download), and it talks to the TV over one Realtime socket, about 40 ms phone to TV. It has a touchpad (swipe to move, hold a swipe to keep going, flick for several steps, tap for OK) or a D-pad with OK, plus Back, Home, and Type. Type opens a keyboard whose letters show up on the TV as you type, with voice search where the phone's browser supports it. The keyboard also opens by itself when the TV selects a text box. The page shows what the TV has selected or is playing, with artwork and a progress bar you can drag to seek, and it has play/pause, skip, volume and subtitles. Pairing is remembered on both sides: the TV keeps its code, and the phone reconnects to the last TV when opened (it also reconnects by itself after the screen locks). The remote can be added to the home screen as its own app. "New code" in Settings unpairs every phone. When the TV is showing its sign-in QR code, the remote offers to sign the TV in from the phone.
- The old in-app phone trackpad is replaced by the new remote, and old `#remote=` links forward to it.

## Web app 2.7.20 (2026-11-02)

- **Featured banner keeps its shape**: the banner and the rows under it no longer move as the featured films cycle. 2.7.15 held only the banner's outer height and measured it before the film's logo had loaded, so logos still popped in and pushed the title up, and on short screens (laptops, phones turned sideways) the banner still grew and shrank and moved the rows below. Now the logo, title, details line and description each have a fixed slot, so nothing a film brings can change the layout.

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
