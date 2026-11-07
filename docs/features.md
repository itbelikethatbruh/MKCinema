# MKCinema features

Everything MKCinema does today. Back to the [README](../README.md).

## Addons as they are

Install the addons you already use. MKCinema makes them look and work better, with no changes from the addon's developer (2.45):

- **Ratings in the right place.** Ratings addons show their scores on the title line with the IMDb, TMDB and Rotten Tomatoes icons, and an IMDb rating next to each episode, instead of extra rows in the source list.
- **No notice clips.** When a debrid addon plays a short notice clip instead of the film, MKCinema says what happened and moves on to the next source.
- **Settings forms.** Addons built with the Stremio addon SDK that describe their settings can be set up right on the Addons screen, with a TV remote too.

Both of the first two can be turned off in Settings › Playback › Addons as they are.

Addon developers can go further with one optional, data-only `mkcinema` field: row styles, badges, panels, catalog placement, Library tabs, a copy of the watchlist, playback events, skip times and device info. See [Addon looks](addon-looks.md) and [Addon extras](addon-extras.md).

<a name="new"></a>
### New in 2.43

<table>
<tr>
<td width="33%" valign="top"><img src="readme/icon-vol.svg" width="52" alt=""><br><b>Sound modes</b><br><sub>Clear voices brings dialogue forward. Night keeps quiet lines audible and loud scenes softer. Original is one tap away.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-film.svg" width="52" alt=""><br><b>More like this</b><br><sub>Every film and series page ends with similar titles, starting with the rest of a film's universe.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-skip.svg" width="52" alt=""><br><b>Scene skips from addons</b><br><sub>Addons can add intro, recap and credit times, and mark scenes you can choose to skip. Kids seats skip them by default.</sub></td>
</tr>
</table>

### New in 2.37

<table>
<tr>
<td width="33%" valign="top"><img src="readme/icon-bolt.svg" width="52" alt=""><br><b>Opens faster</b><br><sub>MKCinema starts from the copy on your device and only downloads an update when there is one. Home uses less battery and memory, and network logos and Universes show even offline.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-sync.svg" width="52" alt=""><br><b>Sync that merges</b><br><sub>Changes from all your devices come together instead of the last one winning, and they show up when you come back to the app. Watching no longer re-uploads your profile every few seconds.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-phone.svg" width="52" alt=""><br><b>Your TV, your phones</b><br><sub>The TV asks before a new phone can take control, and Settings › Devices lists allowed phones. In a watch party the host leads and can hand over with one tap.</sub></td>
</tr>
</table>

### New in 2.15 to 2.20

<table>
<tr>
<td width="33%" valign="top"><img src="readme/icon-head.svg" width="52" alt=""><br><b>Listen on your phone</b><br><sub>The film plays on the TV and its sound comes out of your phone, live and in stereo, so you can use headphones while the house sleeps. It works from the phone remote, so there is no app to install.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-sliders.svg" width="52" alt=""><br><b>A player rebuilt</b><br><sub>Edge-to-edge picture, times beside the bar, and options in four tabs: Playback, Picture, Audio and More. Playback stats on <kbd>I</kbd>, every shortcut on <kbd>?</kbd>.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-vol.svg" width="52" alt=""><br><b>Volume to 200 %</b><br><sub>A real boost through the audio engine. The slider turns champagne past 100 % so you know you're boosting. The mouse wheel works too.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-torii.svg" width="52" alt=""><br><b>Anime mode</b><br><sub>An Anime tab with Trending, Airing now, Most popular and Top rated, and an Anime look in crimson and violet with sakura and Miko, our mascot.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-cc.svg" width="52" alt=""><br><b>Styled anime subtitles</b><br><sub>Fansub fonts, signs, positions and karaoke render as they were made (libass), and subtitles and chapters inside MKV files show up by themselves.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-sync.svg" width="52" alt=""><br><b>AniList and MyAnimeList</b><br><sub>Episodes you finish are marked on your list, and your lists come in on import. Trakt and Simkl still work alongside.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-palette.svg" width="52" alt=""><br><b>Five looks, any colour</b><br><sub>Noir, Midnight, Velvet, Sepia and Anime, plus one colour wheel that tints the whole app. Your choice follows your account.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-lang.svg" width="52" alt=""><br><b>Speaks your language</b><br><sub>Menus in English, Español, Português, Français, Deutsch, Italiano and हिन्दी. It follows your device, or pick one in Settings.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-list.svg" width="52" alt=""><br><b>MDBList rows</b><br><sub>Add any MDBList list as a row on Home with your own free API key.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-phone.svg" width="52" alt=""><br><b>Gestures that feel native</b><br><sub>Hold for 2× speed, swipe the left side for brightness, the right for volume, and sideways to seek. Speed is remembered per title, subtitle timing per file.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-skip.svg" width="52" alt=""><br><b>Every skip, every chapter</b><br><sub>Intro, recap, credits and preview times from TheIntroDB and AniSkip, plus the file's own chapters.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-life.svg" width="52" alt=""><br><b>Support built in</b><br><sub>Settings › Support runs a Diagnostic and a speed test, and Send log gives you a six-character code to paste into a bug report. Nothing is sent until you tap it.</sub></td>
</tr>
</table>

### Everything else

<table>
<tr>
<td width="33%" valign="top"><img src="readme/icon-puzzle.svg" width="52" alt=""><br><b>Your addons, your rules</b><br><sub>Install any Stremio addon by link, reorder them, and see results from each one the moment it answers.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-bolt.svg" width="52" alt=""><br><b>Debrid built in</b><br><sub>Bring your own key from the debrid service you already use and press Test. Cached results are marked ⚡ and play right away.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-ext.svg" width="52" alt=""><br><b>One tap to VLC</b><br><sub>Hand any stream to VLC, Infuse, MX Player, Just Player, mpv, IINA or PotPlayer. Only players your device supports are listed.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-import.svg" width="52" alt=""><br><b>Your own media servers</b><br><sub>Connect Plex, Jellyfin or Emby and the films you own sit next to your addon sources. Smart Play picks your own copy first.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-tv.svg" width="52" alt=""><br><b>The TV's own player</b><br><sub>On Android TV and Fire TV, streams play in the TV's hardware player, so HEVC, HDR and Dolby Vision play natively, with frame-rate matching. MKCinema still picks the source and saves your place.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-users.svg" width="52" alt=""><br><b>Watch party</b><br><sub>Share a six-character room. Play, pause and seek stay in sync, with chat, reactions and push-to-talk, peer to peer.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-eye.svg" width="52" alt=""><br><b>X-Ray</b><br><sub>Pause for a second to see the cast, actor bios, release facts, and the picture and sound details.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-spark.svg" width="52" alt=""><br><b>Your Picks</b><br><sub>A <i>For you</i> row from your favourites and history. Ask in plain words, like “funny crime series”. It runs entirely on your device.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-skip.svg" width="52" alt=""><br><b>Skip Intro, next episode</b><br><sub>Skip intros, endings and credits (anime too, from any addon), with a 10-second countdown to the next episode while its sources load.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-sync.svg" width="52" alt=""><br><b>Automatic failover</b><br><sub>If a source shows no picture or stalls, MKCinema moves to the next one by itself.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-wave.svg" width="52" alt=""><br><b>Audio languages</b><br><sub>When a stream carries several languages or a commentary, pick one in the player’s Audio tab. Files the browser can’t switch open in VLC or your own player.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-film.svg" width="52" alt=""><br><b>A real Library</b><br><sub>Watchlist, In progress, Watched and your own lists, with sorting and filters. Lists follow your account.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-bell.svg" width="52" alt=""><br><b>New episodes</b><br><sub>A row under Continue watching, and one quiet notice when a series you follow gets a new episode.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-shield.svg" width="52" alt=""><br><b>Source rules</b><br><sub>Hide cam copies, set a lowest resolution, a largest file size and an HDR preference, block words, and choose which debrid service goes first.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-eye.svg" width="52" alt=""><br><b>Source Check</b><br><sub>Fakes, samples, archives and the wrong episode are hidden; cinema recordings and odd sizes are flagged, and every pick says why.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-spark.svg" width="52" alt=""><br><b>Top 10 and Shortlist</b><br><sub>Top 10 today, Under 90 minutes, Hidden gems, Award winners and twenty quick picks to skip or save.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-globe.svg" width="52" alt=""><br><b>Browser only mode</b><br><sub>No player installed? MKCinema lists only the sources your browser can play with picture and sound.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-users.svg" width="52" alt=""><br><b>Seats</b><br><sub>A seat for everyone in the house with its own picture, watchlist and progress. Kids seats show Animation and Family only, behind a grown-up PIN.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-phone.svg" width="52" alt=""><br><b>Phone as a remote</b><br><sub>Scan a code and your phone becomes a trackpad with volume, skip, audio presets and subtitles.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-tv.svg" width="52" alt=""><br><b>Made for the big screen</b><br><sub>Android TV, Google TV, Fire TV, LG webOS and Samsung, with a platinum focus ring, remembered rows, voice search and an optional side menu.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-monitor.svg" width="52" alt=""><br><b>Ambient Mode</b><br><sub>Leave the TV idle and your Home becomes a living screensaver: each film as a layered 3D scene with its own atmosphere. OK opens the film, Back returns.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-film.svg" width="52" alt=""><br><b>Peak Cinema</b><br><sub>Can't decide? Surf 90-second scenes from films in your catalogs and watchlist, filtered by mood, and keep watching from that exact second.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-tv.svg" width="52" alt=""><br><b>Channels and guide</b><br><sub>Your own M3U, Xtream or file playlists with an XMLTV guide, favourites, and Split Screen for up to four streams at once.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-cc.svg" width="52" alt=""><br><b>Subtitles that fit</b><br><sub>OpenSubtitles built in, your own files by drag and drop, and a sync strip you drag into place.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-ext.svg" width="52" alt=""><br><b>Send to TV and keep control</b><br><sub>Cast to a Chromecast or Google TV, control playback from the lock screen, headphones or media keys, and keep watching in picture-in-picture on Android.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-eye.svg" width="52" alt=""><br><b>Spoiler Guard</b><br><sub>Blur the stills of episodes you haven't watched yet. Off until you turn it on.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-puzzle.svg" width="52" alt=""><br><b>Plugins and themes</b><br><sub>Add community features and looks from a reviewed gallery in <a href="../plugins/">plugins/</a>. Each file is checked against its checksum before it runs.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-monitor.svg" width="52" alt=""><br><b>Show it on Discord</b><br><sub>The Windows app can show “Watching” and the title on your Discord profile, with the poster and time left. Off until you turn it on.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-import.svg" width="52" alt=""><br><b>Move from Stremio</b><br><sub>Import your library, progress and addons in one step. Scrobble to Trakt or Simkl.</sub></td>
</tr>
<tr>
<td width="33%" valign="top"><img src="readme/icon-shield.svg" width="52" alt=""><br><b>Your keys stay yours</b><br><sub>Keys live on your device and, if you sign in, in your own row that only you can read.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-puzzle.svg" width="52" alt=""><br><b>Addon Studio</b><br><sub>Design a Stremio addon visually, try it inside MKCinema straight away, then export a ready-to-run addon server.</sub></td>
<td width="33%" valign="top"><img src="readme/icon-sync.svg" width="52" alt=""><br><b>One-tap addon install</b><br><sub>An addon's setup page ends with Install, and MKCinema opens, shows the addon's name and asks before it adds it.</sub></td>
</tr>
</table>

## Free forever

**MKCinema will never charge for anything.** There is no paid plan, no premium tier and no feature behind a paywall, and there never will be. Everything that ships today stays free, and everything added later is free too. No ads, ever.

Donations on Ko-fi are optional and only say thank you: they never unlock a feature, a seat, a look or anything else. The code is open under GPL-3.0, so the free version can never be taken away. Addons and debrid services are run by other people and may cost money; that is their choice, not ours.

Everything below ships today and costs nothing:

- **Seats** for the whole house (main seat plus 7), each with its own watchlist, progress, picks and Home, and an optional PIN.
- **Kids seats by age rating** where you live (US, Brazil, India, UK or Germany), not just by genre. Pick up to 6, 9 or 12.
- **Arrange Home:** hide, move or rename any row, addon catalogs included. Each seat keeps its own, synced with your account.
- **Source rules** across every addon: lowest resolution, largest or smallest file, preferred audio language, blocked words.
- **Subtitles that sync themselves** in the built-in player, plus a delay you can drag into place.
- **Skip intro**, ending and credits.
- **Downloads** in the Android and Windows apps.
- **Five looks** and a colour wheel.
- **Custom poster URL** for poster services such as [Pictorium](https://github.com/Eful97/Pictorium), with ratings, logos and landscape art. Thanks to its creator, [Eful97](https://github.com/Eful97), for suggesting it.

Coming from Stremio? **Settings › Account › Import from Stremio** (also in the welcome tour) copies your addons, library, Continue watching and watched episodes in one step. Your password goes only to Stremio and is never saved.

## Screenshots

<p align="center"><img src="screenshots/app-home.webp" width="100%" alt="MKCinema Home in the Noir look, with the featured banner and Top 10 films today"></p>

<table>
<tr>
<td width="40%" align="center"><img src="screenshots/app-anime.webp" alt="The Anime tab"><br><sub>The Anime tab: trending, airing now, most popular, top rated</sub></td>
<td width="40%" align="center"><img src="screenshots/app-anime-home.webp" alt="Home in the Anime look"><br><sub>Home in the Anime look, with sakura</sub></td>
<td width="20%" align="center" rowspan="2"><img src="screenshots/app-phone-anime.webp" alt="The Anime tab on a phone"><br><sub>Phones are first-class</sub></td>
</tr>
<tr>
<td align="center"><img src="screenshots/app-player.webp" alt="The player’s Audio tab listing English, Spanish and Commentary tracks for Elephants Dream"><br><sub>The Audio tab: 200 % volume, Listen on phone and a film’s audio languages</sub></td>
<td align="center"><img src="screenshots/app-tv.webp" alt="MKCinema on a TV"><br><sub>On a TV: big type, a focus ring and remembered rows</sub></td>
</tr>
</table>

<table>
<tr>
<td width="40%" align="center"><img src="screenshots/app-detail.webp" alt="A film page with Smart Play and its streams"><br><sub>Every pick says why</sub></td>
<td width="40%" align="center"><img src="screenshots/app-party.webp" alt="Watch party"><br><sub>Watch party with synced playback and voice</sub></td>
<td width="20%" align="center" rowspan="2"><img src="screenshots/app-listen.webp" alt="Listen on this phone, on the phone remote"><br><sub>Listen on phone</sub></td>
</tr>
<tr>
<td align="center"><img src="screenshots/app-picks.webp" alt="Pick your favourites to build Your Picks"><br><sub>Your Picks, built on your device</sub></td>
<td align="center"><img src="screenshots/app-addon-studio.jpg" alt="Addon Studio"><br><sub>Addon Studio: design a Stremio addon visually</sub></td>
</tr>
</table>

<p align="center"><sub>The player shots show <a href="https://studio.blender.org/films/sintel/">Sintel</a> © Blender Foundation, CC BY 3.0. Poster and backdrop art comes from the catalogues and belongs to its owners.</sub></p>

## Privacy

- **Your keys stay yours.** Debrid keys live in your browser and, if you sign in, in your own Supabase row, which row-level security keeps readable only by you. You can turn sync off and keep them on one device.
- **No tracking.** No ads, no cookies and no profiles. The only measurement is an anonymous visit count (Cloudflare Web Analytics: page, browser, country, load speed), which you can turn off in Settings › Data. It never sees your addons, keys or what you watch, and Your Picks never sends your taste to an outside service.
- **Bring your own sources.** MKCinema only plays what your addons return. You are responsible for using them lawfully where you live.

## Questions

<details>
<summary><b>Does MKCinema provide movies or shows?</b></summary>

No. MKCinema hosts and links to no content. It plays what your own addons return, plus official trailers.
See the [terms of use](https://app.mkcinema.app/terms.html) and the [privacy policy](https://app.mkcinema.app/privacy.html), also in the app under Settings › About & licenses.
</details>

<details>
<summary><b>Which debrid service and player should I use?</b></summary>

Use the debrid service you already have, or compare a few and pick the one that suits you. MKCinema works with all the common ones. For a player, **VLC** is the easy choice: it's free and plays almost any file. Settings › Get started walks you through both.
</details>

<details>
<summary><b>Do I need an account?</b></summary>

No. Everything works without one. Sign in with email only if you want sync between devices.
</details>

<details>
<summary><b>Is iPhone supported?</b></summary>

No. iPhone and iPad are not supported platforms.
</details>

<details>
<summary><b>Can I move from Stremio?</b></summary>

Yes. Settings › Account › Import from Stremio copies your library, progress and addons. Your Stremio password is used once and never stored.
</details>
