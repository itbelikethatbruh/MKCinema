# Changelog

All notable changes to MKCinema. The web app version and the native app versions are listed separately, because the native apps load the latest web app.

## Web app 2.42.0 (2026-11-06)

- **A new welcome tour.** Redesigned from the first screen to the last, with everything MKCinema does today. It fits your screen, so nothing scrolls, on a phone, a computer or a TV.
- **Get started, rewritten.** Pick the MKCinema player or any player app you like, install a few popular addons in one tap, and skip the debrid step if you don't use one. There's a separate path for people coming from Stremio.
- **Addon looks.** Addons can choose how their rows look (wide, square or Top 10), add small badges and info panels, and show any of their lists as a Library tab. Spec: docs/addon-looks.md.
- **Smoother switching.** Switching lists, genres and seasons now flows: new posters glide in instead of snapping, and Anime lists you've already opened come back instantly.

## Web app 2.41.0 (2026-11-06)

- **Find addons.** Search the community addon list right from Addons and install most addons in one press. The list opens instantly and filters by streams, catalogs, subtitles, anime and more.
- **Easier addon setup.** Addons that need your settings walk you through it in their own row. On a TV, scan a QR code to set it up on your phone.

## Web app 2.40.0 (2026-11-06)

- **Settings, redesigned.** A search box that finds any option, clearer groups, larger titles and shorter explanations, with More when you want the detail.
- **Troubleshooting guide.** Settings › Help now opens with quick fixes for no streams, buffering, sound, subtitles, addons, debrid keys, sign-in, TV remotes, updates, watch parties and trailers. Each fix has buttons that take you straight to the right setting, with the Diagnostic and Send log underneath. Also in the command palette and at app.mkcinema.app/#help.
- **Terms of use and privacy, inside the app.** New terms of use page, a fuller privacy policy, and both readable in Settings › About & licenses on every device, TVs included. A *Why no streams?* link on an empty source list opens the right fix.
- Legal and privacy requests now go to a private address, legal@mkcinema.app. Sent logs are deleted after 90 days. TMDB attribution is in Settings › About & licenses.

## Web app 2.39.0 (2026-11-06)

- **Subtitles in your language.** When no subtitle exists in your language, MKCinema translates the best one it finds, line by line as you watch, and marks it *Translated* in the subtitle menu. Chrome and Edge translate on your device; other browsers and the Android and TV apps use MKCinema's translation service. Turn it off in Settings › Subtitles.
- **One tidy subtitle list.** Subtitles from all your add-ons now arrive as one list without repeats. The ones made for your exact file come first, then the closest release. Auto-sync works on every one, translated ones included.

## Web app 2.38.2 (2026-11-06)

- **Side menu fits every window.** In short and small windows the rows tighten up, and the menu scrolls inside itself if there still isn't enough room.

## Web app 2.38.1 (2026-11-06)

- **Smoother remote in the welcome tour.** On a TV, the remote now reaches every option in the welcome tour and always keeps a button highlighted.

## Web app 2.38.0 (2026-11-06)

- **Mouse scrolling everywhere.** Season pickers, filter chips, tabs, cast and every other sideways list now have the arrows and click-and-drag on a computer, like the Home rows.
- **Signs & Songs with dubs.** Watching an anime dub with subtitles on? The player picks the file's Signs & Songs track, so you get on-screen text and lyrics without dialogue lines that don't match the dub. Turn it off in Settings › Subtitles.
- Chrome-based players (including the Windows app) now pick the right audio track when a file lists its dub second.

## Android app 1.8.1 (2026-11-06)

- **New built-in player** based on ExoPlayer, on phones, tablets and Android TV.

## Web app 2.37.2 (2026-11-06)

- **Scroll rows with your mouse.** On a computer, arrows appear at the ends of a row when you point at it, and you can click and drag a row sideways. TVs and touch screens work as before.

## Mac app 1.1.1 (2026-11-06)

- Fixed the Mac app closing with "protocol does not exist" on start (#101). The app now writes a launch log to `~/Library/Logs/MKCinema/launch.log`.

## Web app 2.37.1 (2026-11-06)

- **Service notices.** When something is being updated or fixed, a short note shows at the top of the app and on the status page (`status.html`). Only the project owner's account can set it, from Settings › Account.

## Web app 2.37.0 (2026-11-06)

- **Opens faster.** The app starts from the copy already on your device and checks `version.json` in the background. A new version downloads only when there is one, and the Refresh bar offers it.
- **Smoother Home.** Fewer timers and resize listeners, a 3 KB Universes file for Home (the full list loads when you open one), and light SVG placeholders for missing posters. Home and the player use less battery and memory.
- **Works offline.** Network logos and Universes stay on Home without a connection.
- **Lighter sync.** Changes from all your devices merge section by section and entry by entry, instead of the last device overwriting the others. Watching a film no longer re-uploads your profile every few seconds, and changes arrive when you come back to the app. Big pictures are shrunk before they sync.
- **Phone remote.** The TV asks "Allow this phone?" the first time a phone connects, and Settings › Devices lists allowed phones with Remove. Phones paired before need one Allow.
- **Watch party.** The person who starts the party leads it. They can hand over with "Make host", and if they drop out the party passes to someone else after about 20 seconds.
- **Smaller app.** The deployed app is minified (about 18 % smaller over the network); the source in `app/` stays readable.
- Many smaller fixes across addons, debrid, ratings, MyAnimeList, Trakt, Simkl and the TV apps.

## Web app 2.36.2 (2026-11-06)

- **Your addons stay put.** Addons you installed, their order and the ones you switched off no longer reset when the app starts.

## Web app 2.36.1 (2026-11-06)

- **Cleaner Universes row.** The row is just its name now, and the cards sit below "See all" on phones.

## Web app 2.36.0 (2026-11-06)

- **Sharp upscaling.** Videos smaller than the screen are drawn by MKCinema on the device's GPU (WebGL) instead of being stretched by the browser: contrast-adaptive sharpening at the video's own size (after AMD FidelityFX CAS, MIT), then a Catmull-Rom upscale to the screen's real pixels, clamped to the nearest source pixels so edges get no halos. It only runs when the screen clearly has more pixels than the video; a file that already matches the screen plays untouched. Off by default (Off / Natural / Crisp in Player › Picture and Settings › Playback), not offered on TVs, and it switches itself off for the session if frames start dropping. Browsers only allow this for hosts that send CORS headers; other hosts play as before and no stream is ever routed through a server for it. While it is on, subtitles are drawn above the picture in the same style.

## Web app 2.35.1 (2026-11-06)

- **Universes header on phones.** The franchise cards rose 14 px over the row header and covered "See all" and the "every film in order" line. The Universes and Networks rails now cancel only the top padding they actually have (outside TV).

## Web app 2.35.0 (2026-11-06)

Ten features built on one idea: MKCinema already knows when people speak in each release (subtitle auto-sync), so the dialogue works as a clock that is the same in every version of a film.

- **Watch party on any version.** Guests can each use their own source, even a different release or frame rate. Every state message also carries the sender's place in the room's script (the host's subtitle file), so everyone hears the same line together. Without a sure match, two lengths that differ by a frame-rate change are scaled, and a nudge (±¼ s, ±1 s) lines it up by hand.
- **Same line on any source.** Resume, automatic source switching and links land on the line you left, also when the new source is a different version (for example 25 fps against 23.976 fps, nearly 5 minutes apart by the end of a 2-hour film).
- **Find a line.** Type words someone says and play from that moment. In the player (More tab, X-Ray's This scene) and on a film's page. Search runs on the device.
- **Subtitles on your phone.** Paired phones pick their own language and show the lines in step with the TV. The phone downloads the subtitle file itself; the TV sends its timing.
- **Last time…** Coming back after two days or more, the last lines before you stopped show first, with Carry on and Rewind 1 min. Only what you already saw.
- **Notes at the moment (Margins).** Leave a note at a scene; it pops up at that moment for the other seats, and can be shared with friends as a link that holds the notes. Stored on the device, no server.
- **Couch match.** Phones scan the TV's code and swipe through titles from everyone's watchlists and on-device picks. The first title every phone likes is the match. From the Your Picks row, Settings › Devices, or search.
- **Shows per day for kids.** A kids seat can have a daily limit. It stops at the end of an episode, never mid-scene, with a calm goodnight screen; the grown-up PIN allows one more.
- **Share this moment.** A link (or a QR code on TV) that opens a friend's MKCinema at the same line, on their own source.
- **Never miss a line.** After a pause, playback picks up at the start of the sentence that was being spoken.

## Web app 2.32.1 (2026-11-06)

- **Balanced buttons on phones.** On a phone held upright, the featured banner on Home shows Smart Play on its own row with Trailer, Details and Watchlist as three even buttons underneath (icon over label), instead of two half-width rows with Watchlist left alone. Film pages use the same layout: every secondary button (Trailer, Watchlist, Share, Lists, Download, IMDb) shares one even row, or two rows of three when there are six. Heights are fixed in CSS and follow the Text size setting.
- **Phone tab bar.** Long translated labels (for example German "Mediathek") end in an ellipsis instead of running into the next tab.
- **Settings on phones.** Each section's description now uses the full width under the title instead of a narrow column beside the icon, and the account cards lose a layer of padding.
- **Faster start.** The Arrange Home icon was missing from the built-in icon set, so every start downloaded the full 355 KB icon library from unpkg. It is included now.
- **Battery.** The network logos on Home no longer float in a loop on phones (30 endless animations over layered shadows, running even off screen). They still lift when touched. TVs already worked this way.

## Web app 2.31.2 (2026-11-06)

- **Credit for Pictorium.** The Custom poster URL setting, the What's new card and the credits list now credit Pictorium's creator, [Eful97](https://github.com/Eful97), who suggested the integration. The README and the website mention it too.

## Web app 2.31.0 (2026-11-06)

- **Custom poster URL.** Settings › Appearance › Posters has a new **Custom poster URL** field for poster services such as [Pictorium](https://github.com/Eful97/Pictorium) by [Eful97](https://github.com/Eful97), who suggested it (free public instance at pictorium.elfhosted.com, or your own on Vercel or Docker). Paste the link template from Pictorium's Install Hub (Nuvio tab). MKCinema fills in `{type}`, `{imdb_id}`, `{tmdb_id}`, `{tmdb_id|imdb_id}` and `{shape}`; with `{shape}` in the link, wide cards ask for landscape art. It takes over from RPDB while set, and any title the service cannot draw keeps its normal poster. The link syncs with your account like your other keys (unless key sync is off). No Pictorium code is bundled: MKCinema only loads the images your instance serves.

## Web app 2.29.0 (2026-11-06)

- **Anime look, refined.** The zigzag borders from 2.22 (around the menu bar, the featured banner and every poster) are replaced by a quieter manga design language. Panels get thin pink ink outlines with cut top-left and bottom-right corners, a second crimson cut inside each corner, small hatch ticks and a faint halftone that fades out from one corner. Settings cards and pop-up windows get corner brackets and a hairline. Posters stay clean: the one you point at gets corner brackets and a soft pink glow, and the halftone dots no longer cover the art on tilt. Row titles get a thin double slash, and outline buttons glow pink on hover. The colours, Miko, the anime logo, the fonts and every feature stay the same. Nothing new moves, and scrolling is as fast as before (a little faster on computers, since the posters lost their extra frames).

## Web app 2.28.4 (2026-11-06)

- **MKCinema has its own address: [mkcinema.app](https://mkcinema.app).** The web app is at [app.mkcinema.app](https://app.mkcinema.app), and on a Fire TV you type `tv.mkcinema.app` into Downloader. Every link, QR code and share in the app and on the website now uses the new address.
- The old addresses still work. A browser tab on mkcinema.pages.dev that isn't signed in moves to app.mkcinema.app by itself. A signed-in tab shows a bar with the new address instead: sign in there once and your synced library comes with you. The installed apps for Android, TVs, Windows, Mac and Linux keep working as they are.

## Web app 2.28.2 (2026-11-06)

- **Steady title pages.** Tapping a film or show no longer flickers before its page opens. The title logo had no size until its picture arrived, so everything under it (Smart Play, Trailer, Watchlist, the synopsis) jumped down about 100 px in the middle of the fade-in, and the backdrop popped in at the same moment. The logo now keeps its place from the first frame, the backdrop and logo fade in, the second draw (when the full details arrive) keeps the pictures already on screen instead of rebuilding them, and on phones the info line keeps room for its second line so the buttons no longer drop when the runtime arrives.

## Web app 2.28.1 (2026-11-06)

- **Free forever.** MKCinema will never charge for anything: no paid plan, no premium tier and nothing locked, now or later. The promise is in Settings › About, Settings › Support and the welcome tour, and on the website and README. Ko-fi donations stay optional and never unlock a feature. Translated into all six interface languages.

## Web app 2.28.0 (2026-11-06)

- **Arrange Home.** Hide, move or rename any row on Home, addon catalogs included. Open it from the Arrange Home button under the rows, from Settings › Home or from the search bar. Each seat keeps its own arrangement, and it syncs with your account. Reset Home puts everything back. Works by touch, mouse and TV remote.
- **Kids seats go by age rating.** Before, a kids seat let in anything tagged Animation or Family, so adult cartoons got through. Now a title also has to be rated for the seat's age: up to 6, 9 or 12 (Settings › Seats). MKCinema uses the rating where you live (US, Brazil, India, UK or Germany), else the US one. Ratings for about 1,350 popular animated, family and kids titles are built in, and others are looked up as they appear (with your own TMDB key if you added one, otherwise films through Wikidata). A title with no rating anywhere falls back to the old genre rule.
- **Coming from Stremio?** The welcome tour has a new step that imports your addons, library, Continue watching and watched episodes in one go, and an empty Home offers the same button.
- **What's new.** The first time MKCinema opens after an update, one card lists what's new, improved and fixed since the version you last used (up to three releases). Settings › More › What's new keeps the list, with a switch to turn the card off. It never shows on a first visit.

## Web app 2.27.2 (2026-11-06)

- **Samsung TVs (beta).** MKCinema runs on Samsung TVs from 2023 on through TizenBrew, a free community app loader (Samsung only installs apps from its own store). The remote's Back key closes what's open and then asks before leaving, and play/pause, stop, fast-forward and rewind work in the player. Setup steps are in `tizen/README.md` and on the download page.
- LG webOS: the app now has a listing ready for the webOS Homebrew Channel.

## Android and Android TV app 1.7.0 (2026-11-06)

- **New TV player engine: ExoPlayer** (Media3), the engine most Android TV apps use. It reads MKV files more reliably, plays HLS, shows picture subtitles (PGS) from Blu-ray rips, names every audio track with its format (E-AC3 5.1, Atmos, DTS and so on), hides audio tracks your TV can't decode, sends a source's request headers on every request, and picks up again by itself when the connection drops mid-film.
- If ExoPlayer can't open a file, the TV's basic player (the engine from 1.2.5 to 1.6.2) tries it before MKCinema's own player does. Settings › Playback › TV player engine can switch to the basic player for good.
- Frame-rate matching now reads the frame rate from the player itself, so it no longer opens a second connection to the file.

## Web app 2.27.0 (2026-11-06)

- **The side menu is now faint glass.** On computers the left menu is a barely-there smoked glass with a soft light along its edge, so the page shows through very slightly when the menu opens over it. Phones, tablets, TVs and Low graphics get the same tint as a solid panel, with no blur.
- **A new logo in the side menu**: the MK emblem with a soft glow, a stacked platinum "MK / CINEMA" wordmark and a fine line under it, in the computer side menu and the phone menu drawer.
- **Pick a font for the app** in Settings › Appearance › Font: Studio (the current look), Editorial, Classic, Wide, Condensed, Rounded, Deco, Slab and Techno. Each one pairs a heading font with an easy-to-read text font. A second row of **bold heading fonts** has more character: Groovy, Bubble, Graffiti, Gothic, Street, Outline, Drip, Heavy and Brush. With these, your text stays in the easy-to-read font. They are all free, open-licence fonts and load only when you pick them. The logo and subtitles keep their own fonts, and your choice syncs to your account.
- **Subtitles line up by themselves.** When you turn on a downloaded subtitle, MKCinema compares it with the subtitles inside the file (an MKV's subtitle index, in any language, read without downloading the film) and shifts it to match. It also fixes the common frame-rate mix-ups (23.976, 24 and 25 fps). When the browser can hear the film, it can line up with the dialogue instead. Only a clear match is applied, a timing you set by hand always wins, and Undo puts the old timing back. Subtitles › Auto-sync now runs it on demand. Turn it off in Settings › Subtitles.
- **Manage add-ons from your phone.** The Add-ons screen on a TV shows a QR code. Scan it and the phone remote opens a list of the TV's add-ons: paste a link with your phone's keyboard, turn add-ons on or off, move them up or remove them. Add-on addresses (which can hold your settings) never leave the TV.
- **TV player engine** setting for the TV app 1.7.0 (ExoPlayer or the basic player).

## Android and Android TV app 1.6.2 (2026-11-06)

- **The TV player has VLC-style track lists**: audio and subtitle tracks are listed by language and name, and you can switch them during playback.
- **TV player options row**: Audio, Subtitles, Other sources (back to the film's sources) and Full player (keep watching in MKCinema's own player). The TV player starts in your Audio language from Settings › Playback, and leaving it lands on the film's page instead of Home.
- Includes the 1.6.1 fixes: the app no longer restarts on Home when Android closes its page during a stream, and the TV player reads the frame rate only after the film opens.

## Web app 2.26.0 (2026-11-06)

- **Pick your player before you start.** The welcome walkthrough now asks, right after the welcome screen, where streams should play: the MKCinema player or another player app (VLC, Infuse, MX Player and others, with the ones that work on your device). On the Android TV and Fire TV app it asks between the TV player and the MKCinema player instead.
- It explains **Browser only mode** in plain words (for a work laptop, a school Chromebook or a TV browser where you can't install apps) and turns it on with one switch.
- It marks the best option for your device and says why, for example that Safari on iPhone and iPad can't open MKV files, or that this browser can't play HEVC (x265).
- Your choice goes to the same settings as Settings › Playback and syncs to your account. Nothing changes unless you tap an option, and Skip keeps everything as it is.
- It shows once per device. If you skip the walkthrough before this step, or you set MKCinema up before 2.26.0 and never picked a player, you get this one question on its own, once.
- Translated into all interface languages.

## Web app 2.25.1 (2026-11-06)

- **Night Mode audio is gone** (Vocal Clarity Boost, Late-Night Mode and 3D Spatial Theater). These modes could freeze the player: the browser can only process a stream's sound when its host allows it, so picking a mode reloaded the film, and on many hosts it stalled. Once the sound was routed that way it couldn't be switched back without reloading the app. Anyone who had a mode on is set back to the normal sound.
- **Audio language shows straight away.** No more "Checking the languages in this file…". The menu lists the languages the source names (flags, ENG, ITA, MULTi and so on), or "Original audio" when it names none. When a file has several languages, the menu says the browser plays the file's default track and offers your video app (VLC and others) to switch. If a debrid service or your MKCinema server can switch tracks, the buttons still appear once they’re found.
- Volume boost above 100 % and Listen on phone are unchanged.

## Web app 2.25.0 (2026-11-06)

- **Sports**, a new section in the menu (top bar, phone bar, side menu and TV). It gathers live sports from your own sources and sorts them by sport: Football, American football, Basketball, Baseball, Ice hockey, Fight sports, Motorsport, Tennis, Cricket, Rugby, Golf, Cycling, More sports and Sports channels.
- It reads the live TV and channel catalogs of the addons you installed, any catalog whose name says it is about sport, and your own TV playlists (M3U or Xtream). MKCinema ships no sports streams or channels of its own, so the page stays empty until you add a source.
- Games and channels are sorted by their name, genre and group, including league names (Premier League, NBA, UFC, F1 and so on) and team names for matchups like "Lakers vs Celtics".
- Show everything as rows, or pick one sport for a full grid, and narrow it to one source. Channels tune straight away like Live TV; events open their page so you can pick a source.
- Hidden on kids seats, because live sports come straight from your sources and are not filtered for age.

## Web app 2.24.1 (2026-11-06)

- **Streams play in Safari on iPhone and iPad.** Every source used to fail with "That source was slow to start" because each one got only 3.5 seconds, Safari often waits for a tap before it loads anything, and it can't open MKV files at all. On Safari (and every iPhone browser, which all use Safari underneath):
  - Playback starts right away. If Safari wants a tap first, a **Play** button asks for it instead of skipping the source.
  - MKV and AVI files, which Safari can't open, go to the bottom of the list with a **Not for Safari** tag and are skipped when switching sources.
  - HLS (.m3u8) streams use Safari's own player.
  - A source gets 10 seconds to start, and longer while data is still arriving.
  - After four automatic switches, or when nothing playable is left, MKCinema says so plainly and offers VLC, Infuse and the other iPhone players, the source list, or **Try anyway**, instead of looping.

## Web app 2.24.0 (2026-11-06)

- **Watch party voice gets its own channel.** Voices always played apart from the film; now they have their own **Voice volume** in the party panel, separate from the film's volume. On a computer you can also send voices to a different output (for example a headset while the film stays on the speakers).
- **Film dips while people talk** is now a choice: Off, A little or A lot (A lot is the old behaviour).
- **Voices on your phone.** Set "Voices play on" to **My phone** and the phone paired as a remote shows a **Party voice** button. Tap it and the phone joins the party as a voice-only member: you hear everyone on the phone or its headphones with their own slider, and the phone's mic talks to the party (handy, since most TVs have no mic). The TV mutes voices once the phone is in and plays only the film. With Listen on this phone, the film also gets its own slider on the phone.
- A voice-only phone never becomes the party host, and your own phone's voice never plays on your own TV or dips your film.
- Phones: party reactions sit on their own row instead of a one-emoji column.

## Web app 2.23.0 (2026-11-06)

- **Smallest file** (Settings › Source rules): hides very small files, which are often fakes or poor quality. Pick 200 MB, 500 MB, 1 GB, 2 GB or 4 GB. Episodes use a quarter of the limit, and files that list no size stay. Like the other limits, it is dropped if it would leave no sources at all.
- **Preferred audio language** (Settings › Source rules): sources in your language move to the top of the list and Smart Play picks them first, across every addon. The Audio language filter never hides them, and MULTi and Dual Audio releases move up a little. 15 languages.
- Both settings are translated into all interface languages.
- **Where to watch** on phones is now one tidy dropdown instead of a wall of service pills.
- Android and Android TV app 1.6.1: if Android closes the app's page in the background while a stream plays, the page is rebuilt instead of the app restarting on Home.

## Web app 2.22.1 (2026-11-05)

- **Ko-fi**: MKCinema now has a Ko-fi page at [ko-fi.com/mkcinema](https://ko-fi.com/mkcinema). Ko-fi replaces the PayPal button everywhere (Ko-fi itself takes cards and PayPal). Settings › Support and the occasional thank-you note show a "Support on Ko-fi" button, and the QR code opens Ko-fi.
- Website, README and the GitHub Sponsor button link to Ko-fi instead of PayPal.
- Final 2.22.0 Anime look assets are now in the repo (baked scene-back/scene-near WebP layers that replace sky/far/near SVGs).

## Web app 2.22.0 (2026-11-05)

- **The Anime look, comic edition**: the whole interface turns into a manga when you pick Anime in Settings › Appearance.
  - A new anime MKCinema logo (with エムケー・シネマ), and a star-burst MK badge in the menu bar.
  - Titles in Dela Gothic One with ink and crimson shadows. Row titles sit behind a crimson slash.
  - An anime icon set for the menu, and slanted comic buttons.
  - Posters framed as comic panels, toasts as speech bubbles, and a splash panel with Miko on the Anime page.
- **Miko, redrawn**: a cel-shaded fox shrine maiden in place of the old drawing.
- **A layered night city**: moon, skyline, rooftops and a sakura branch. On fast devices it moves in parallax as you scroll and point.
- **Motion on fast devices only**: slash wipes with sound-effect lettering between sections, impact bursts when you press, and 3D tilt with a halftone shine on posters.
  - TVs, slower phones, Low graphics and Reduce motion get the same look, still.
  - If frames start dropping, the effects step down by themselves.
  - Choose Auto, Full or Calm in Settings › Appearance › Anime effects.
  - The featured banner never moves.

## Web app 2.21.1 (2026-11-05)

- **Side menu on phones**: picking Side menu in Settings now closes Settings, slides the menu in once and says where it lives (the ☰ button at the top left). Before, nothing visible changed until you left Settings. On phones the other option is now called Bottom bar, which is where that bar is.
- **Rename seats from Who's watching**: every seat has a pencil to change its name and picture. "Manage seats" is now "Edit seats".
- **Main seat name**: a main seat that was never named shows the account name, or a tidied name from the email, instead of the raw first half of the email address.
- **Status page**: each service's name and description no longer show as a box inside a box.

## Web app 2.20.0 (2026-11-05)

- **The player, rebuilt**: the picture fills the screen edge to edge on every device, TVs included (the framed view with the colour glow is now an option under Picture). The elapsed time and the length sit either side of the seek bar. Tap the length to switch to time left, or to the clock time the film ends.
- **Seek bar fixed**: since 2.12.0 the bar's track was zero pixels wide, so only the dot showed. The progress line is back.
- **Options in tabs**: Playback, Picture, Audio and More, instead of one long list. The waveform button opens Audio, and a speed chip shows the current speed.
- **Volume up to 200 %**: drag the slider past the middle, scroll the mouse wheel over the picture, or pick 125/150/200 % under Audio. It works on any source whose sound the browser may process (HLS, local files, sources that allow it, or through your MKCinema server).
- **Listen on phone**: on a paired phone remote, tap **Listen on this phone**. The TV's sound plays on the phone (and its headphones) and the TV goes quiet. When the TV can process the source, the sound is sent live from the TV. When it can't, the phone plays the same source itself and stays in step with the TV. The phone's lock screen controls the TV. It needs the MKCinema player on the TV (Settings › Playback › TV player).
- **Picture adjustments**: brightness, contrast and colour, with Vivid, Lift dark scenes and Soft presets (not on TVs).
- **Phone gestures**: hold for 2× speed, swipe up or down on the left for brightness and on the right for volume, and swipe sideways to seek with a time preview.
- **Frame by frame** with `,` and `.`, **playback stats** (`I`: resolution, frame rate, dropped frames, buffer, stream type, network), and a **shortcut sheet** (`?`).
- **Remembers per title**: your speed for a series or film, and your subtitle timing for the exact file.
- More speeds (0.25× to 3×). The error panel on phones no longer sits under the play buttons. The audio-language note no longer names one debrid service.

## Web app 2.14.0, Android/TV app 1.4.0, Windows app 1.3.0, Mac and Linux apps 1.1 (2026-11-05)

- **Offline downloads on phones, tablets and Windows**: a Download button on film and episode pages saves the file to the device, and Library › Downloads lists what you've saved, with play and delete. Downloads aren't offered on TVs or in a plain browser.
- **Android 1.4.0**: films download in the background through Android's download manager into the app's own folder (no storage permission, and they're removed if you uninstall). A Wi-Fi only setting is on by default. If the app starts with no internet, it opens straight to your downloads. The phone player gets touch controls.
- **Windows 1.3.0**: downloads go to `Videos\MKCinema`, two at a time, and resume after a dropped connection. Subtitles are saved next to the film so VLC picks them up.
- **Mac 1.1 and Linux 1.1: torrents** (Settings › Desktop app, off by default), with the same download-only engine as Windows and Android. Nothing is uploaded or seeded, and the pieces are deleted when it's turned off or the app closes.
- The Mac app now ships as a `.zip` instead of a `.dmg`.

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
