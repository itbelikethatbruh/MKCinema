
'use strict';
/* ---------------- 2.28.0 What's new ----------------
   After an update, the first time MKCinema opens on the new version it shows one calm card with what changed since the
   version this device last ran: new, improved and fixed, newest first (at most three releases, the rest are a tap away).
   It waits until the intro, the walkthrough, any open panel and the player are gone, and never shows on a first visit
   (the walkthrough covers that). Settings › More › What's new keeps the full list, with a switch to stop the card.
   Add each release at the top of RELEASES when its version goes out. */
/* 2.67.1 tv-playback */
const RELEASES = [
  { v: '2.69.3', date: '2026-11-13', items: [
    ['new', 'Sign in with Google', 'One tap on the Account page, no password to remember.'],
    ['new', 'Watch on your TV', 'A TV button at the top of the main page connects to your TV before you press play, so the film goes straight to the big screen.'],
    ['better', 'Subtitles on your TV', 'With AirPlay on, MKCinema switches to the subtitles inside the file so they show on your TV, and explains Screen Mirroring when there are none.'],
  ] },
  { v: '2.69.2', date: '2026-11-12', items: [
    ['better', 'AirPlay for MKV files', 'Send to TV on iPhone and iPad now gets a TV-ready copy of MKV files from your debrid service, so the film plays on your TV with the picture.'],
  ] },
  { v: '2.69.1', date: '2026-11-12', items: [
    ['better', 'AirPlay with the picture', 'Send to TV on iPhone and iPad now switches to a source AirPlay can show, so your TV gets the film, not just the sound.'],
    ['better', 'No more double pictures', '3D copies, which show the same film twice side by side, are no longer picked for you. They are tagged 3D in the source list.'],
  ] },
  { v: '2.69.0', date: '2026-11-12', items: [
    ['new', 'Discover', 'Discover: a new page in the menu with trending films and series, new releases to watch at home, brand-new series and little-known gems.'],
  ] },
  { v: '2.68.4', date: '2026-11-12', items: [
    ['better', 'Peak Cinema in your language', 'Peak Cinema now checks each file’s own audio track and plays only scenes in your language.'],
  ] },
  { v: '2.68.3', date: '2026-11-12', items: [
    ['new', 'Peak Cinema your way', 'Peak Cinema: choose Films, Series or Anime, each with its own genres.'],
  ] },
  { v: '2.68.2', date: '2026-11-12', items: [
    ['better', 'Smoother panels', 'Panels open smoothly: no more jumps or flicker behind them, and the update card waits until the app has finished starting.'],
  ] },
  { v: '2.68.1', date: '2026-11-12', items: [
    ['better', 'Peak Cinema with series', 'Peak Cinema now surfs series too, and only plays scenes in your language.'],
  ] },
  { v: '2.68.0', date: '2026-11-12', items: [
    ['new', 'Your cloud', 'Browse and play the films and episodes already in your debrid account, from Library or Settings › Debrid.'],
    ['new', 'Setup links', 'Pass your whole addon setup to another screen or a friend in one press. It always asks before adding anything.'],
    ['new', 'Folders on Home', 'Put any row into a folder from Arrange Home, and share a folder with a short code.'],
    ['better', 'A faster Home', 'Home opens instantly with your last rows, then refreshes quietly, and keeps your place when you come back.'],
    ['new', 'Shuffle, chapters and remembered subtitles', 'Shuffle a series, jump by chapter in the player, and your subtitle choice is remembered for each title.'],
    ['new', 'More subtitle choices', 'Forced subtitles for foreign-language scenes, an option to hide SDH, and an option to wait for your language at the start.'],
    ['new', 'Trakt reviews', 'Reviews on film and series pages, with spoilers covered until you open them.'],
    ['better', 'Clearer details', 'More detail in the audio menu, dates in your language, logos and trailers in your language, and Search again on the source list.'],
    ['better', 'Smoother on TVs', 'Calmer artwork while you scroll, live TV that rides out short outages, and a source speed test in Settings › Help.'],
  ] },
  { v: '2.67.5', date: '2026-11-12', items: [
    ['better', 'Smoother video starts and stops', 'Opening and closing a video on Android is now clean and steady, with no flashes, and the loading logo moves more smoothly on phones.'],
  ] },
  { v: '2.67.4', date: '2026-11-11', items: [
    ['better', 'Miko’s natural voice', 'Miko’s natural voice is now on by default when she reads answers aloud, much faster on newer phones and computers, with smoother, more natural reading.'],
  ] },
  { v: '2.67.3', date: '2026-11-11', items: [
    ['better', 'Miko follows the conversation', 'Answer Miko’s question with a simple “yes” and she does what she offered, and her answers read cleaner.'],
  ] },
  { v: '2.67.2', date: '2026-11-11', items: [
    ['new', 'Miko’s built-in AI', 'Miko now has a built-in AI, free for everyone. Say anything in your own words, no key needed. Your own Groq or Gemini key still works in Miko’s settings.'],
  ] },
  { v: '2.67.1', date: '2026-11-11', items: [
    ['better', 'Your TV service adds first time', 'In the Android and Android TV app, a TV service on plain http:// (or one that doesn’t allow web pages) now adds straight from Live TV › Add playlist.'],
    ['better', 'Sharper picks on Android TV', 'Smart Play on Android TV now picks for the TV player, which plays MKV, HEVC and HDR on the box’s own hardware, so it no longer settles for a lower quality file. When a source won’t open, the next one goes straight to the TV player.'],
    ['better', 'Smoother on smaller TV boxes', 'Held arrows no longer run ahead of the screen, and the side menu folds away as soon as you pick a page.'],
    ['better', 'Fewer stops on film pages', 'With a remote, the director, writers and cast are now one stop: Left and Right move along the names, Up and Down move past them.'],
  ] },
  { v: '2.67.0', date: '2026-11-11', items: [
    ['new', '30 languages', 'MKCinema now speaks 30 languages besides English, including 中文, العربية, Русский, 日本語, 한국어, Bahasa Indonesia, Türkçe and Kiswahili, and every menu, setting and message is translated. Pick one in Settings › Appearance › Language.'],
    ['new', 'Record live TV', 'Record the channel you’re watching (for 30 minutes, an hour, until the programme ends, or until you stop), or pick a programme later in the guide and it records when it starts. Xtream catch-up programmes save to a file in one press. Find them all in Live TV › Recordings.'],
    ['better', 'Recording in the Android app', 'The Android and Android TV app records any channel from your TV service, keeps going in the background, and plays your recordings from Library › Downloads.'],
    ['new', 'Any TV service on your computer', 'In the MKCinema app for Windows and Mac, TV services on plain http:// now work: your playlist, Xtream login, guide, catch-up, films and series all load and play.'],
    ['new', 'Addon health check', 'Addons › Check my addons tests every addon: how fast it answers, whether its catalogs, sources and subtitles work, and whether its key or setup has a problem. Then it tells you in plain words what to fix.'],
    ['new', 'One-press fixes', 'Turn off the addon that slows every Play, move a slow one down, keep one copy of an addon installed twice, or open its setup page to renew a key.'],
    ['better', 'See the slow one at a glance', 'After a check, each addon in your list shows Healthy, Slow, Needs setup or Not working, with how long it takes to find sources.'],
  ] },
  { v: '2.66.2', date: '2026-11-11', items: [
    ['better', 'Dolby Vision plays in more browsers', 'Dolby Vision films that carry an HDR10 picture now play in browsers that decode HEVC, shown in HDR10. Films without one still go to a player that can show them.'],
  ] },
  { v: '2.66.1', date: '2026-11-11', items: [
    ['new', 'Copy a source’s link in one tap', 'Every source now has a link button: copy the stream link or file name, or send it to VLC.'],
    ['new', 'VLC on Mac', 'Pick VLC as your player on a Mac: MKCinema copies the link, then press ⌘N in VLC and paste. Set it in Settings › Playback.'],
    ['better', 'Links follow your pick', 'When your source fails and MKCinema tries backups, the copy and player buttons on the last screen use the source you picked.'],
    ['better', 'Sharper Smart Play picks', 'More 1080p sources are checked before Smart Play settles, so it starts in 720p less often.'],
    ['better', 'Your audio language more often', 'In browsers that can’t switch tracks inside a file, Smart Play prefers copies with only your audio language.'],
  ] },
  { v: '2.66.0', date: '2026-11-11', items: [
    ['new', 'The Social Hub', 'Friends is now the Social Hub: a live feed, your friends, their activity and your profile in one place, with who is online right beside it on bigger screens.'],
    ['new', 'Posts, reactions and replies', 'Share what you are watching or how a film made you feel, attach a title, react with 🔥 😂 😭 😮 ❤️ 👍 and reply under any post.'],
    ['new', 'Tag your friends', 'Type @ and a friend’s name to tag them in a post or reply. They get a notification in the hub.'],
    ['new', 'How I’m feeling', 'Set a mood and a short status that friends see next to your name. It clears itself after a few hours, or stays until you change it.'],
    ['better', 'Made for phones', 'On phones the hub fills the screen, every screen scrolls, and nothing gets cut off at the edges.'],
  ] },
  { v: '2.65.1', date: '2026-11-11', items: [
    ['better', 'Friends colours fit on phones', 'Profile colours in Friends setup now show in full on narrow screens, including the selected ring.'],
  ] },
  { v: '2.65.0', date: '2026-11-11', items: [
    ['new', 'Miko picks like a film buff', 'Ask for “something like Arrival but scarier”, “a Korean thriller under 2 hours” or “Christmas films for the kids” and she picks real, fitting titles, re-ranked for your taste on your device.'],
    ['better', 'Scrub previews show right away', 'The picture preview above the progress bar now appears almost instantly while you drag to find your spot.'],
    ['new', 'Free AI keys and a natural voice', 'Add a free Groq or Gemini key in Miko’s settings to chat in your own words, and turn on her new natural voice under Read answers aloud.'],
  ] },
  { v: '2.64.4', date: '2026-11-11', items: [
    ['fix', 'Friends setup scrolls on phones', 'On phones, the username screen now scrolls, so the Save button is always within reach.'],
  ] },
  { v: '2.64.3', date: '2026-11-11', items: [
    ['better', 'Tidier phone menus', 'On phones, the top bar buttons now fit inside the bar, and the side menu is a slimmer panel with rounded corners.'],
    ['fix', 'Friends setup fits the screen', 'The username box and colour choices no longer get cut off at the edges.'],
  ] },
  { v: '2.64.2', date: '2026-11-11', items: [
    ['better', 'Opens straight to Home', 'The web app no longer plays an opening animation. The MKCinema loading screen shows while Home gets ready, then you are in.'],
  ] },
  { v: '2.64.1', date: '2026-11-11', items: [
    ['better', 'Addons start instantly', 'Addons start instantly from a saved copy and keep working if their server blinks. If Cinemeta ever stops answering, Home, search and title pages carry on from TMDB.'],
  ] },
  { v: '2.64.0', date: '2026-11-10', items: [
    ['fix', 'TV remote in Settings and X-Ray', 'On TVs, Settings pages open at the top and the remote walks every row, and the remote can now move into X-Ray: press Left from the player controls, then OK on an actor. Back returns.'],
    ['better', 'Fewer interruptions mid-film', 'When the connection to a source drops or freezes, the player now reconnects to the same copy at the same second, and waits for your network to come back, before it tries another copy. Your audio language and subtitles stay as they were.'],
    ['new', 'Cloud convert', 'When a file from your debrid service won’t play in your browser (its format, no sound, or Safari) and no other copy is left, MKCinema asks your own service for the web-ready version it makes, where the service offers one, and plays that instead. Nothing passes through MKCinema.'],
    ['better', 'A cleaner X-Ray', 'Pause and X-Ray shows one calm panel: the cast with their faces, who made it, the story, and quick actions for this moment. Picture and sound details fold away until you want them.'],
    ['better', 'Settings, easier to scan', 'Long Settings pages are split into short, named groups, menus sit beside their label on phones, and watch parties, film nights and ticket stubs have their own page, Watch together. Every setting is still there.'],
    ['new', 'Social hub', 'Friends now has three tabs. Activity shows who is watching now, what friends finished lately and a friendly this-month board. You shows your profile, trophies and stats, and a QR code to carry it all to your phone.'],
    ['new', 'Profiles and trophies', 'Add a short bio and four favourites, and earn trophies as you watch: first feature to 250 films, streaks, marathons, night owl, years on MKCinema and more. Tap a friend to see their profile and what you both watched.'],
    ['new', 'Kudos', 'Give a friend a small thank-you: Great taste, Party host, Gem finder, Binge legend or Great company. Take it back any time.'],
    ['better', 'Your history stays yours', 'Sharing what you watch is off until you turn it on, comes from one seat only, and single titles can be hidden. Trophies can be hidden too.'],
    ['new', 'Ideas and thank-you notes', 'Suggest a feature or send a thank-you note from Settings › Ideas & thanks. If you are signed in, you can see whether your idea is planned or done, and any reply.'],
    ['better', 'Play stands out', 'The Play and Smart Play buttons now glow with a soft light that runs round their edge, so the next thing to press is easy to find. It stays still on TVs, Low graphics and Reduce motion.'],
    ['better', 'Peak Cinema in your language', 'Peak Cinema now only plays scenes in your audio language. Releases dubbed in other languages, and untagged copies of films made in another language, are skipped.'],
    ['fix', 'One sound on Who’s watching', 'The profile picker no longer plays its sound twice when it opens.'],
    ['new', 'Miko got a lot more human', 'Miko remembers your name, chats back, understands “the second one” and “the other one”, can continue what you were watching or surprise you from your watchlist, and speaks with a natural female voice.'],
    ['fix', 'Starts normally with damaged saved data', 'MKCinema now starts normally even if some saved data on your device gets damaged, and newly added addons are still kept when your browser’s storage is full.'],
    ['better', 'Smoother Home', 'Home rows below the screen are skipped until you scroll to them, so Home starts lighter on phones and TVs.'],
  ] },
  { v: '2.63.1', date: '2026-11-10', items: [
    ['better', 'Faster screen changes', 'Moving between screens now does about half the styling work, most noticeable on TVs.'],
  ] },
  { v: '2.63.0', date: '2026-11-10', items: [
    ['new', 'Friends', 'Choose a username and display name, then add friends by typing their username. See who is online and, if they choose to share it, what they are watching, and open the same title in one press. Requests need their OK, and Remove, Block and Report are always one tap away.'],
    ['new', 'Messages and watch party invites', 'Chat with friends inside MKCinema, and send a watch party invite they can join straight from the chat. Messages never pop up over a film: the Friends button shows a count instead.'],
    ['new', 'Calls that wait for the credits', 'Call a friend by voice, with camera if you like. Calls are off until you turn them on in Settings › Friends, and “When I’m not watching” never rings during a film: your friend sees you are busy and you get a missed call later.'],
    ['new', 'Xtream logins, done properly', 'Sign in with your TV service’s Xtream login and MKCinema now reads the service itself: your account (active, end date, screens in use), live channels in their categories, Catch-up for channels that keep past programmes, and Movies and Series with every season and episode.'],
    ['better', 'Your TV service in the Android app', 'In the Android and Android TV app (1.10.0 and later), any TV service you add loads directly, plain http:// ones included, and channels, catch-up, films and episodes play in the app’s own player.'],
    ['better', 'Multi-language files on Android phones', 'Android phones: multi-language files start in your audio language.'],
  ] },
  { v: '2.62.6', date: '2026-11-10', items: [
    ['better', 'Your audio language plays first', 'When a film or episode has more than one language, MKCinema now starts the one you chose in Settings (Preferred audio language, or Audio language) wherever this device lets it choose: MKV files in the built-in player, streams with several audio tracks, Safari and the Mac app, debrid services that offer their own streams, and the TV player. Picking a language in the Audio menu still wins.'],
    ['better', 'More sources play in the app', 'Sources an addon marks as not web-ready now play in MKCinema’s own player when this device can handle them, and Smart Play can pick them, instead of stopping at a “Try in browser” screen. If one won’t play, MKCinema moves to the next copy by itself.'],
  ] },
  { v: '2.62.5', date: '2026-11-08', items: [
    ['better', 'Finds a working copy before it plays', 'When Play picks a copy for you, MKCinema now checks the best few first, behind the title’s logo with “Sourcing a working copy…”, and starts one whose picture shows and whose sound plays here. A copy that fails is no longer shown as an error, and the time always starts at 0:00 (or where you left off).'],
    ['better', 'A bigger, smoother side menu', 'On computers the side menu now has larger names and icons that are easier to read, and it glides open and closed instead of snapping.'],
  ] },
  { v: '2.62.4', date: '2026-11-08', items: [
    ['new', 'Top 10s for every taste', 'The Top 10 on Home now stands out, and you can change it: Top 10 worldwide or in your country, on one network, in one category, or from one year or decade.'],
    ['new', 'A home for Series, and one for Films', 'Series and Films now open with their own Top 10, with the same filters, and the networks, before the rows.'],
    ['new', 'Pick a year anywhere', 'A Year menu sits next to every catalog and genre in Films and Series, and on each network page.'],
    ['better', 'Peak Cinema, front and centre', 'Peak Cinema now sits right under the Top 10. Tap Start surfing for ninety-second scenes, back to back, and keep watching the one that grabs you.'],
  ] },
  { v: '2.62.3', date: '2026-11-08', items: [
    ['new', 'Miko is on every screen', 'Tap Miko in the bottom-right corner of any screen and say or type what you want: “play Dune”, “trailer for Oppenheimer”, “who’s in this?”, “films with Zendaya”, “open my library”, “something funny for tonight”. She steps aside while a film plays. Don’t want her? Turn her off in Settings › Appearance.'],
  ] },
  { v: '2.62.2', date: '2026-11-08', items: [
    ['fixed', 'Addons follow you to every device', 'Addons now follow you to every device you sign in on.'],
  ] },
  { v: '2.62.1', date: '2026-11-08', items: [
    ['better', 'Sized for your screen', 'On phones held upright, MKCinema now fills the screen at a comfortable size even when your phone is set to show more on screen. Big computer screens get a larger home screen too. Interface size in Settings still lets you fine-tune it.'],
    ['better', 'A side menu you can’t miss', 'The side menu now sits right against the left edge of the screen. Push the mouse to the edge and it opens every time, smoothly, and its highlights sit neatly inside it.'],
  ] },
  { v: '2.61.3', date: '2026-11-08', items: [
    ['better', 'Smart Play skips bad links', 'Smart Play now passes over camera recordings, sample clips, archives and files too small to be the real film. It remembers links that didn’t work and file servers that are down, so it tries them last next time, and it checks the best sources as you reach for Smart Play. When a source is slow, it switches sooner to one that already checked out. All of this stays on your device.'],
  ] },
  { v: '2.61.2', date: '2026-11-08', items: [
    ['better', 'Films start on the first try in the MKCinema player', 'With Highest quality set to 4K, Play now in the MKCinema player now starts with a 1080p source, since most 4K files can’t play in a browser. 4K is still used when it is the only choice, and VLC and the TV player keep your full setting.'],
  ] },
  { v: '2.61.1', date: '2026-11-08', items: [
    ['new', 'Recovery code', 'The next time you sign in, MKCinema gives you a recovery code. If you ever forget your password, it brings your synced keys back. You can make a new one in Settings › Debrid.'],
  ] },
  { v: '2.61.0', date: '2026-11-08', items: [
    ['better', 'Faster sync between your devices', 'A change on your phone shows up on your TV almost at once, and anything you change offline is sent the moment you are back online.'],
    ['fixed', 'No more waiting clips', 'Some sources that are not ready yet send a short waiting clip instead of the film. MKCinema now spots it and moves on to the next source by itself.'],
    ['new', 'Straight to the scene after the credits', 'When the credits are followed by more of the episode or film, Skip credits takes you right to it.'],
    ['new', 'Intros, recaps and credits skip themselves', 'When MKCinema knows where an intro, a “previously on” recap or the credits are, it now skips them for you. A Watch button shows for a few seconds in case you wanted to see it. Choose Automatically, a Skip button, or Off in Settings › Playback.'],
  ] },
  { v: '2.60.2', date: '2026-11-08', items: [
    ['fixed', 'A quieter sync notice', 'The “synced from your account” message after you sign in no longer covers buttons. It is now a small note in the corner that you can tap straight through, and it fades away on its own.'],
  ] },
  { v: '2.60.1', date: '2026-11-08', items: [
    ['fixed', 'The right audio language is ticked', 'On some films in Chrome and on Android, the Audio menu ticked one language while another was playing, and picking it played the wrong one. It now ticks the language you hear, and picking another switches to it.'],
    ['better', 'A source your device can play comes first', 'Play now picks a source your phone, tablet or computer can actually play, so films start on the first try more often. On phones it also starts with 1080p instead of huge 4K files.'],
    ['better', 'A tidier Audio menu', 'The Audio tab now lists the language first, then sound mode, volume and audio delay, in one consistent style, with a tick beside what is playing.'],
  ] },
  { v: '2.60.0', date: '2026-11-08', items: [
    ['new', 'Captions for films without subtitles', 'No subtitles for a film? Open Subtitles and tap Make captions with AI. MKCinema listens to the film on your device and writes captions a minute or two ahead of what you’re watching, and English viewers get foreign films translated into English. The speech model downloads once (about 77 MB), and the sound never leaves your device. It works on sources that let the browser read the file, and best on computers. For everything else, the same menu shows how to switch on Live Caption on your phone or computer.'],
  ] },
  { v: '2.59.2', date: '2026-11-08', items: [
    ['better', 'Films start on the first try', 'Sources get more time to start on their first play, so a film no longer gives up on links that were just getting ready.'],
    ['better', 'Steadier page changes', 'Moving between films, shows and Home no longer blinks to black: the next page fades in over the last one, a title’s backdrop stays put until the new one has loaded, and the Home banner text doesn’t replay when you come back.'],
    ['fixed', 'Episode pictures', 'Episode pictures now match their episodes.'],
  ] },
  { v: '2.59.1', date: '2026-11-08', items: [
    ['new', 'MKCinema on iPhone and iPad', 'iPhone and iPad are now fully supported. Open app.mkcinema.app in Safari, tap Share, then Add to Home Screen, and MKCinema opens full screen like any other app. Most MKV files play right in the browser, no extra app needed.'],
    ['better', 'Easier to see on phones', 'Words, posters and episode cards are bigger on phones, and they grow to fit phones whose browser shows pages small. Settings › Appearance › Text size still makes them bigger or smaller.'],
  ] },
  { v: '2.59.0', date: '2026-11-08', items: [
    ['new', 'HEVC films on any computer', 'When your browser can’t play an HEVC (x265) film, MKCinema now plays it itself on your computer, up to 1080p, with HDR films shown in normal colour. Copies your browser plays by itself still come first, and if a computer can’t keep up, MKCinema moves to another copy on its own. You can turn it off in Settings › Playback.'],
  ] },
  { v: '2.58.0', date: '2026-11-08', items: [
    ['new', 'More films play with sound', 'MP4 and TS files with Dolby Digital, Dolby Digital Plus or DTS sound now play with sound in MKCinema’s own player, and TS files from TV recordings and Blu-ray backups play at all. If a film ever starts without sound, MKCinema now fixes it on your device by itself, or moves straight to a copy that plays with sound. Blu-ray picture subtitles show in MKV files, surround sound stays 5.1 when your speakers can play it, and Dolby Vision plays as Dolby Vision on Apple devices.'],
  ] },
  { v: '2.57.2', date: '2026-11-08', items: [
    ['better', 'Scrolling that lands cleanly', 'Rows of films and shows, the source list, episodes, cast and menus now come to rest on a whole item when you swipe, so nothing is left half cut off.'],
    ['new', 'Copy a source’s link', 'Press and hold any source (or right-click it) to copy its stream link or file name, for another player or a friend.'],
  ] },
  { v: '2.57.1', date: '2026-11-08', items: [
    ['better', 'Smoother episode opening', 'Opening an episode now shows its sheet together with the page, without a flash, and the still image fades in gently.'],
  ] },
  { v: '2.57.0', date: '2026-11-08', items: [
    ['new', 'MKV files play right here', 'MKV files now play in MKCinema’s own player on Safari, and films with Dolby Digital, Dolby Digital Plus, DTS or TrueHD sound no longer play silent in Chrome, Edge and Firefox. The sound is converted on your device and the picture is never touched, so it looks exactly as it should. You can switch the sound language from the player menu too. Turn it off in Settings › Playback.'],
  ] },
  { v: '2.56.1', date: '2026-11-08', items: [
    ['better', 'Clearer menu previews', 'Both menu layouts in Settings › Appearance, and in the first-run menu chooser, now light up gold, so you can see each one clearly before you pick.'],
  ] },
  { v: '2.56.0', date: '2026-11-08', items: [
    ['new', 'A better phone remote', 'The touchpad and buttons always fit on your phone now, with the extras in one tidy grid. Hold the touchpad, then slide to scrub through a film (slide down for finer steps). Set the swipe speed in the remote’s menu, and search by voice with the new Voice key.'],
    ['new', 'Meet Miko, your AI assistant', 'Tap Miko on the phone remote, then say or type what you want: “pause”, “back 30 seconds”, “subtitles off”, “next episode”, “how long is left?”, “who’s in this?”, “play Dune”, “films with Zendaya”. It works on every phone, free. If you like, add your own AI key in Miko’s settings to say anything in your own words. The key stays on your phone.'],
    ['new', 'Cast and details on your phone', 'Tap what’s on your TV in the phone remote to see its story, cast, crew, episodes and where to watch. Tap anyone for their life and whole filmography, then any title they made, as far as you like. Explore finds any film, show or person, and Show on TV, Trailer and Watchlist send it to the TV.'],
  ] },
  { v: '2.55.0', date: '2026-11-07', items: [
    ['better', 'A welcome tour in depth', 'The welcome tour now gives every feature its own screen, with a preview, how it works and where to find it. Skip the features to go straight to setting up, or Skip to leave the tour.'],
    ['new', 'Subtitles on smart glasses', 'Read the subtitles in your smart glasses (Brilliant Labs Frame, Even Realities G1 or G2, or Meta Ray-Ban Display), in step with the film. On the phone remote: Subtitles on this phone, then the glasses button (Meta glasses get a link to add in the Meta AI app). On a computer with Chrome or Edge: Player › More › Glasses.'],
    ['new', 'Sensory-friendly', 'Like a sensory-friendly cinema showing: sudden loud bangs are softened and flashing light is dimmed as it happens, all on your device. Player › Picture, or Settings › Playback.'],
    ['new', 'Party cameras', 'See each other in a watch party. Turn on your camera in the party panel, or use your phone as the TV’s camera: open the phone remote and tap Party camera. Video goes straight between your devices.'],
  ] },
  { v: '2.54.0', date: '2026-11-07', items: [
    ['new', 'TV player: Skip intro and Next episode', 'The Android TV player now shows Skip intro, Skip recap and Next episode, using the same times as the MKCinema player. Needs the TV app 1.9.0.'],
    ['new', 'TV player: styled anime subtitles', 'ASS/SSA subtitles keep their fonts, colours, positions and signs in the Android TV player. Settings › Playback.'],
    ['new', 'TV player: Dolby Vision on more TVs', 'Dolby Vision profile 7 files play their HDR10 picture on TVs without Dolby Vision instead of failing.'],
    ['better', 'TV player: Trakt and Simkl', 'Watching in the Android TV player now updates Trakt, Simkl, AniList and MyAnimeList, like the MKCinema player.'],
  ] },
  { v: '2.53.0', date: '2026-11-07', items: [
    ['new', 'Your stats', 'Your top films and shows, how much you’ve watched, when you watch, your genres and your longest streak, for this month, this year or all time. Save it as a picture to share. Library › Your stats.'],
  ] },
  { v: '2.52.0', date: '2026-11-07', items: [
    ['new', 'Catch up to the room', 'Joining a watch party late? Catch up from the start or ten minutes back at 1.5× with subtitles, and you rejoin the room by yourself when you reach them.'],
    ['new', 'Which cut is this?', 'The player tells you which cut of a film you’re watching, from its length and its release name. Player › Options.'],
    ['new', 'Shape of the film', 'A curve of how much is said, and how heated it gets, across the film. Tap it to jump. Player › Options.'],
    ['new', 'Ticket stubs', 'Every film you finish keeps a stub with the date, the seat and who you watched with. Save one as a picture. Settings › Playback.'],
    ['new', 'Film night', 'Seats take turns picking. The picker’s shortlist goes to a vote on your phones, or straight to a watch party.'],
  ] },
  { v: '2.51.0', date: '2026-11-07', items: [
    ['new', 'Your apps', 'Pick the streaming services you pay for in Settings › Home. A film on one of them gets a Watch on button that opens the app on Android, Android TV and Fire TV.'],
    ['new', 'Where to watch for everyone', 'Where to watch on title pages no longer needs your own TMDB key.'],
    ['new', 'Other ways to watch', 'When your addons find nothing, the title page offers your apps, the trailer, your media server and Live TV instead of an empty list.'],
    ['new', 'On your server', 'A Home row with the newest films and shows on your Plex, Jellyfin or Emby server. With no source addon installed, Home shows the ways to watch that need none.'],
    ['new', 'Every seat its own language', 'Each seat can keep its own subtitle and sound language. Settings › Subtitles, while that seat is in use.'],
    ['new', 'Your language on your phone', 'On the phone remote, Hear it in your language plays a dub from another source on your phone, in step with the TV, while the TV keeps its sound for the room.'],
    ['new', 'Watch-along', 'Record your own commentary over a film and share the file. It lines itself up with anyone’s copy using the dialogue. Player › Options.'],
    ['better', 'Clearer messages when a file is removed', 'When a service removes a file, MKCinema says so plainly and points to other ways to watch.'],
  ] },
  { v: '2.50.0', date: '2026-11-07', items: [
    ['better', 'Movies and Series, worth a tap', 'The Movies and Series tabs now open on rows to browse, from your other catalogs and genre by genre, with every title underneath. Pick a genre to jump straight to it.'],
    ['better', 'A rounder search', 'The search field is one rounded bar with the mic and Clear inside it.'],
    ['fixed', 'Settings and Account open again', 'The Settings and Account buttons in the top bar respond on every device.'],
    ['fixed', 'Whole lines in the banner', 'The featured description no longer cuts a line in half when your phone uses larger text.'],
    ['new', 'Family Helper', 'The person who set MKCinema up for you can now help from their phone, from anywhere: see what’s on the screen, turn subtitles on, fix the sound and send a message. You always see when they’re connected. Settings › Devices.'],
    ['new', 'Take it with you', 'Leaving the room? Tap Take it with you on the phone remote and the film carries on on your phone at the same line. Send it back to the TV the same way.'],
    ['new', 'MK Channel', 'Switch on and something is already playing. Channels made from your progress, your watchlist and your Home, plus Scenes. Settings › Playback.'],
    ['new', 'Learn mode', 'Tap any word in the subtitles to translate it, see the line translated underneath, pause after each line and keep a list of your words. Player › Options.'],
    ['new', 'Sound from another source', 'Keep the picture you like and play the sound of another release, such as a dub in your language. MKCinema keeps them in step. Phones and computers.'],
    ['better', 'Sleep timer stops at a good moment', 'It now waits for a pause in the dialogue, so it never cuts someone off mid-sentence.'],
    ['better', 'Subtitles when you go back', 'Going back a few seconds turns subtitles on for just the part you missed.'],
    ['new', 'Welcome tour sounds', 'Soft chimes as you move through the welcome tour, rising with each step. Turn them off with Interface sounds in Settings.'],
  ] },
  { v: '2.49.1', date: '2026-11-07', items: [
    ['fixed', 'Clearer VLC button', 'The store button on the “couldn’t play” card now says it gets VLC.'],
  ] },
  { v: '2.49.0', date: '2026-11-07', items: [
    ['better', 'Sources, side by side', 'Addons can now describe each source as data, so quality, HDR, sound, size and cache state look the same for every addon. Filter by HDR or Atmos, and sort by size.'],
    ['new', 'Scene times from addons', 'Addons can mark intros, recaps, credits and highlights right on a title or a file. The Skip buttons use them, and Peak Cinema starts on the highlights they mark.'],
  ] },
  { v: '2.48.0', date: '2026-11-07', items: [
    ['better', 'One title on the banner', 'The Home banner and title pages now pick art without the name printed on it, so a title never shows twice.'],
    ['new', 'Cast pages', 'Tap any actor, director or writer on a film or show to see their photo, life story and full filmography, then open any title from it. Back takes you to where you were.'],
    ['better', 'Who’s watching comes first', 'With more than one seat, MKCinema now opens straight on the seat picker, and Home loads once you pick. No more Home flashing up first.'],
    ['new', 'Addons can say more', 'An addon can now show a short notice on its card, a link to support its developer, and what changed in a new version. Results it can’t play show as a plain message instead of a video clip.'],
    ['new', 'Buttons from your addons', 'Addons can add their own buttons to a title, like “Add to my list” on their side. With your yes, they can also hear when one of their links fails, or tag and sort results for you.'],
    ['better', 'Paste a link again to update it', 'Pasting an addon you already have, with new settings, now updates it in place. Its spot in your list stays the same. Settings forms can fill in a debrid key you already saved, with one tap.'],
    ['new', 'Addon Lab', 'For addon makers: Addons › Addon Lab lists every addon request with its time and result, and replays any of them.'],
    ['better', 'Cleaner look everywhere', 'Text sizes, corners and icons are more consistent across MKCinema, with a clearer focus ring for keyboards. Tips and questions now show one at a time.'],
    ['new', 'More tab on phones', 'Phones get a More tab in the bottom bar, big screens use the full width, and browsers show a notice when you are offline.'],
  ] },
  { v: '2.47.0', date: '2026-11-07', items: [
    ['new', 'Five more languages', 'MKCinema now speaks Tamil, Telugu, Bengali, Malayalam and Samoan. Pick one in Settings › Appearance › Language.'],
    ['better', 'Plugins checked at launch', 'Gallery plugins are checked against the gallery each time MKCinema opens, and account sync and the companion server are tidier.'],
    ['better', 'Lighter Home', 'Home builds rows as you reach them and loads pictures at the size they are shown, so it opens faster and uses less data.'],
    ['better', 'Smoother, sturdier player', 'A keyboard-friendly seek bar (0-9, Home and End jump), streams that ride out short network drops, faster starts, real full screen on iPhone and seek previews for more streams.'],
  ] },
  { v: '2.46.5', date: '2026-11-07', items: [
    ['new', 'Sepia look', 'Sepia now has its own warm umber blacks and cream type.'],
    ['better', 'Your own theme colours', 'Colours picked in Make your own theme apply across the whole app again.'],
    ['better', 'Calmer player', 'The pointer hides with the controls, and Home rests behind the player.'],
  ] },
  { v: '2.46.4', date: '2026-11-07', items: [
    ['better', 'Faster start on phones', 'The featured banner shows up sooner and the first screen downloads less.'],
    ['better', 'Intro once a day', 'The opening animation plays on your first launch each day, so later launches go straight to Home. Change it in Settings.'],
  ] },
  { v: '2.46.3', date: '2026-11-07', items: [
    ['better', 'Simpler player', 'Menus that fit your phone either way round, a cleaner font, and only the sound options your source supports.'],
  ] },
  { v: '2.46.2', date: '2026-11-07', items: [
    ['better', 'Cleaner banner swipes', 'The next featured title slides in beside your finger, with no blink after the swipe.'],
  ] },
  { v: '2.46.1', date: '2026-11-07', items: [
    ['better', 'Smoother pages', 'No flashes or jumps when opening pages, switching chips or changing settings.'],
    ['better', 'Featured banner swipes like a card', 'It follows your finger and flies off, and short swipes spring back.'],
    ['better', 'Colour wheel', 'The colour wheel is centred on phones.'],
  ] },
  { v: '2.46.0', date: '2026-11-07', items: [
    ['new', 'Universe logos', 'Universes now show each franchise\u2019s own title logo, and network logos are bigger.'],
    ['new', 'Anime look switch', 'Turn the Anime look on or off in Settings, Appearance, or right on the Anime page.'],
    ['better', 'Sources that just play', 'While a film starts, MKCinema checks the next sources in the background. If one fails it switches straight to a source that works, and it stops with a clear message instead of trying forever.'],
    ['better', 'Tidier Top 10 rows', 'Top 10 numbers no longer overlap titles on phones.'],
  ] },
  { v: '2.45.0', date: '2026-11-07', items: [
    ['new', 'Ratings where you look', 'Ratings addons that used to add a row to the source list now show their scores on the film page and next to each episode.'],
    ['better', 'Clearer source problems', 'When an addon plays a short notice instead of the film, MKCinema says why and moves on to the next source.'],
    ['new', 'Addon settings, TV included', 'Addons that describe their settings can be set up right on the Addons screen, with the remote too.'],
  ] },
  { v: '2.44.0', date: '2026-11-06', items: [
    ['new', 'Ratings from your addons, everywhere', 'Rating addons can now put their scores on posters from any catalog, on film pages and next to each episode, instead of in the source list. MKCinema asks you first.'],
    ['new', 'Your watchlist in your addons', 'An addon can keep a copy of your watchlist so it shows up in its own lists, only if you allow it.'],
    ['better', 'Discover follows the addon', 'Wide and square catalogs keep their shape on Discover pages, and catalogs an addon keeps off Home stay off it.'],
  ] },
  { v: '2.43.0', date: '2026-11-07', items: [
    ['new', 'Sound modes', 'Clear voices and Night are back, in the player’s Audio tab under Volume. Original is always one tap away.'],
    ['new', 'More like this', 'Every film and series page now ends with similar titles.'],
    ['better', 'Next episode, faster', 'The next episode’s source is found a few minutes early, so it starts as soon as the last one ends.'],
    ['new', 'Scene skips from addons', 'Addons can now add intro, recap and credit times to the Skip button. Settings › Playback can also skip scenes an addon marks.'],
    ['better', 'Audio delay', 'A clearer control in the Audio tab for sound that runs ahead of the picture.'],
  ] },
  { v: '2.42.0', date: '2026-11-06', items: [
    ['better', 'Smoother switching', 'Switching lists, genres and seasons now flows: the new posters glide in instead of snapping, and Anime lists you have already opened come back instantly.'],
    ['better', 'A new welcome tour', 'Redesigned from the first screen to the last, with everything MKCinema does today. It fits your screen, so nothing scrolls, on a phone, a computer or a TV.'],
    ['better', 'Get started, rewritten', 'Pick the MKCinema player or any player app you like, install a few popular addons in one tap, and skip the debrid step if you do not use one. Used Stremio before? Its own tab imports everything or installs a whole list of addon links at once.'],
    ['new', 'Addon lists in Library', 'Show any list from your addons as its own Library tab. Open Library and press Add from addons.'],
    ['new', 'Addon looks', 'Addons can now choose how their rows look (wide, square or Top 10), add small badges to their posters and an info box to film pages, always in your theme. Turn it off per addon in Settings › Appearance.'],
    ['better', 'Square and wide rows', 'Addons that ask for square or wide pictures now get them, instead of tall posters.'],
  ] },
  { v: '2.41.0', date: '2026-11-06', items: [
    ['new', 'Find addons', 'Search the community addon list right from Addons and install most addons in one press. The list opens instantly and filters by streams, catalogs, subtitles, anime and more.'],
    ['better', 'Easier addon setup', 'Addons that need your settings now walk you through it in their own row: set it up, copy the link, press Paste and install. On a TV, scan a QR code to set it up on your phone.'],
    ['better', 'A simpler Addons screen', 'Find addons comes first, then a box for addon links and your addons. The stream proxy and local helpers moved under Advanced.'],
  ] },
  { v: '2.40.0', date: '2026-11-06', items: [
    ['better', 'Settings, redesigned', 'Every Settings page has a fresh look: a search box that finds any option, clearer groups, larger titles, and shorter explanations with More when you want the detail. Nothing moved and nothing was removed.'],
    ['new', 'Troubleshooting guide', 'Settings › Help now opens with quick fixes for no streams, buffering, sound, subtitles, addons, TV remotes and updates. Each fix has a button that takes you straight to the right setting.'],
    ['new', 'Terms of use and privacy, inside the app', 'Read the privacy policy and the new terms of use in Settings › About & licenses, on any device, TVs included.'],
  ] },
  { v: '2.39.0', date: '2026-11-06', items: [
    ['new', 'Subtitles in your language', 'No subtitles in your language? MKCinema now translates the best one it finds, line by line as you watch, and marks it Translated in the subtitle menu. Turn it off in Settings \u203a Subtitles.'],
    ['better', 'One tidy subtitle list', 'Subtitles from all your add-ons now arrive as one list without repeats. The ones made for your exact file come first, then the closest release.'],
  ] },
  { v: '2.38.2', date: '2026-11-06', items: [
    ['better', 'Side menu fits every window', 'The side menu now fits short and small windows: rows tighten up, and if there is still not enough room it scrolls instead of squeezing.'],
  ] },
  { v: '2.38.1', date: '2026-11-06', items: [
    ['better', 'Smoother remote in the welcome tour', 'On a TV, the remote now reaches every option in the welcome tour and always keeps a button highlighted.'],
  ] },
  { v: '2.38.0', date: '2026-11-06', items: [
    ['new', 'Signs & Songs with dubs', 'Watching an anime dub with subtitles on? The player now picks the file\u2019s Signs & Songs track, so you get on-screen text and lyrics without dialogue lines that don\u2019t match the dub. Turn it off in Settings \u203a Subtitles.'],
  ] },
  { v: '2.37.3', date: '2026-11-06', items: [
    ['better', 'Mouse scrolling everywhere', 'Season pickers, filters, tabs, cast and every other sideways list now have the arrows and click-and-drag too.'],
  ] },
  { v: '2.37.2', date: '2026-11-06', items: [
    ['better', 'Scroll rows with your mouse', 'Arrows appear at the ends of a row when you point at it, and you can click and drag a row sideways.'],
  ] },
  { v: '2.37.1', date: '2026-11-06', items: [
    ['new', 'Service notices', 'When something is being updated or fixed, a short note now shows at the top of the app and on the status page.'],
  ] },
  { v: '2.37.0', date: '2026-11-06', items: [
    ['better', 'Opens faster', 'MKCinema now starts straight from your device and only downloads an update when there is one.'],
    ['better', 'Smoother Home', 'Home and the player use less battery and memory, and missing posters no longer slow scrolling.'],
    ['better', 'Lighter sync', 'Watching a film no longer re-uploads your profile every few seconds, and changes from your other devices show up when you come back.'],
    ['fixed', 'Works offline', 'Network logos and Universes now show on Home even without a connection.'],
  ] },
  { v: '2.36.2', date: '2026-11-06', items: [
    ['fixed', 'Your addons stay put', 'Addons you installed, their order and the ones you switched off no longer reset when the app starts.'],
  ] },
  { v: '2.36.1', date: '2026-11-06', items: [
    ['better', 'Cleaner Universes row', 'The Universes row is just its name now, and the cards sit below “See all” on phones.'],
  ] },
  { v: '2.36.0', date: '2026-11-06', items: [
    ['new', 'Sharp upscaling', 'Videos smaller than your screen are sharpened and upscaled on your own graphics chip, so 720p and 1080p look crisper on big screens. Files that already match your screen play untouched. Player › Picture, or Settings › Playback. Off by default, not on TVs.'],
  ] },
  { v: '2.35.1', date: '2026-11-06', items: [
    ['better', 'Universes header on phones', 'The franchise cards no longer cover “See all”.'],
  ] },
  { v: '2.35.0', date: '2026-11-06', items: [
    ['new', 'Watch party on any version', 'Friends can each use their own source, even a different release or frame rate. MKCinema lines everyone up by the dialogue, and you can nudge it by hand.'],
    ['new', 'Find a line', 'Type words someone says and play from that moment. In the player (More) or on a film’s page.'],
    ['new', 'Subtitles on your phone', 'Everyone reads their own language on their own phone, in step with the TV. Scan the code from the player’s More tab.'],
    ['new', 'Last time…', 'Back after a few days? The last lines before you stopped show first. Only what you already saw.'],
    ['new', 'Notes at the moment', 'Leave a note at a scene. It pops up for the rest of the house at that moment, and you can share your notes with friends as a link.'],
    ['new', 'Couch match', 'Can’t decide? Everyone swipes on their phone and the first title you all like plays on the TV. On the Your Picks row, or Settings › Devices.'],
    ['new', 'Shows per day for kids', 'A kids seat can have a daily limit. It stops at the end of an episode, never mid-scene, and a grown-up PIN allows one more.'],
    ['new', 'Share this moment', 'A link that opens your friend’s MKCinema at the same line, on whatever source they have.'],
    ['better', 'Same line on any source', 'Resume and automatic source switching land on the line you left, even when the new source is a different version.'],
    ['better', 'Never miss a line', 'After a pause, playback picks up at the start of the sentence that was being spoken.'],
  ] },
  { v: '2.34.3', date: '2026-11-06', items: [
    ['better', 'Network logos pop', 'Bigger network logos that lift off the page.'],
    ['new', '142 universes', 'Universes now covers 142 franchises in 8 groups (superheroes, sci-fi, action, horror, animation, anime, comedy and more), with a See all page.'],
    ['better', 'Clearer banner buttons', 'Trailer, Details and Watchlist stand out from the artwork, and nothing shows above the top menu while you scroll.'],
  ] },
  { v: '2.34.0', date: '2026-11-06', items: [
    ['new', 'Universes', 'A new row on Home with 48 film universes: Marvel, DC, Star Wars, the Wizarding World, Middle-earth, Bond, Star Trek, horror classics and more. Open one to see every film in release order.'],
    ['new', 'Scores from other sites', 'TMDB, Rotten Tomatoes, Metacritic, Trakt and Letterboxd scores with their own icons, next to IMDb. Add a free MDBList key in Settings › Appearance › Scores.'],
    ['better', 'Floating network logos', 'The Networks row drops its boxes: each logo floats on its own.'],
  ] },
  { v: '2.33.0', date: '2026-11-06', items: [
    ['new', 'Download films on your TV', 'Coming in a TV app update: download films and episodes to the TV or to a USB drive, and see what fits. Watch them with no internet in Library › Downloads.'],
    ['new', 'Play your computer’s downloads on your TV', 'Coming in a Windows app update: Library › Downloads › Share with my TV, and your TV plays them over your home Wi-Fi.'],
    ['new', 'Slow internet mode', 'Smaller versions come first and the player loads further ahead, so it stops less. Settings › Playback.'],
  ] },
  { v: '2.32.1', date: '2026-11-06', items: [
    ['better', 'Tidier buttons on phones', 'On a phone held upright, Smart Play gets its own row and Trailer, Details and Watchlist sit evenly underneath, on Home and on every film page.'],
    ['better', 'Lighter and smoother', 'The app no longer downloads a large icon library on every start, and the network logos on Home stay still on phones to save battery.'],
  ] },
  { v: '2.32.0', date: '2026-11-06', items: [
    ['new', 'Text size', 'Make every word in the app bigger or smaller in Settings › Appearance › Font. Subtitles keep their own size.'],
    ['better', 'Fonts reach the menus', 'The font you pick now styles the top menu, the side menu and the phone menu too.'],
    ['fixed', 'Cleaner opening', 'The thin line that flashed across the MKCinema logo when the app opens is gone.'],
  ] },
  { v: '2.31.2', date: '2026-11-06', items: [
    ['better', 'Thanks, Eful97', "The Custom poster URL setting now credits Pictorium's creator, Eful97, who suggested it. Find it in Settings › Appearance › Posters."],
  ] },
  { v: '2.31.1', date: '2026-11-06', items: [
    ['better', 'A shorter welcome tour', 'Fewer, shorter pages, and Next always opens the next page at the top.'],
    ['better', 'Clearer player choice', '“Browser only mode” is now “Only sources that play here”, an option of the MKCinema player.'],
  ] },
  { v: '2.31.0', date: '2026-11-06', items: [
    ['new', 'Custom poster URL', 'Use posters from a poster service such as Pictorium by Eful97, who suggested it, with ratings, logos and badges built in. Paste its link in Settings › Appearance › Custom poster URL. Wide cards switch to landscape art automatically.'],
  ] },
  { v: '2.30.0', date: '2026-11-06', items: [
    ['new', 'Kitsune, now in HUD mode', 'The Anime page banner is a tactical anime HUD. Kitsune is new art that breathes and sways, a reticle ring and live telemetry sit behind her, and her dialogue box has a nameplate, a voice waveform and a new line every few seconds. It stays light on TVs.'],
  ] },
  { v: '2.29.0', date: '2026-11-06', items: [
    ['better', 'Anime look, refined', 'The zigzag borders are gone. Panels now have thin pink outlines with cut corners, small manga details and a soft halftone, and posters stay clean until you point at one.'],
  ] },
  { v: '2.28.3', date: '2026-11-06', items: [
    ['fixed', 'Clean anime logo on phones', 'The small Japanese line under the anime MK Cinema logo no longer looks doubled on phones.'],
  ] },
  { v: '2.28.2', date: '2026-11-06', items: [
    ['fixed', 'Steady title pages', 'Opening a film or show no longer flickers. The logo keeps its place from the first frame, and the backdrop and logo fade in instead of popping in.'],
  ] },
  { v: '2.28.1', date: '2026-11-06', items: [
    ['new', 'Free forever', 'MKCinema will never charge for anything. No paid plan, no premium tier and nothing locked, now or later. Ko-fi donations stay optional and never unlock a feature. The promise is in Settings › About.'],
  ] },
  { v: '2.28.0', date: '2026-11-06', items: [
    ['new', 'Arrange Home', 'Hide, move or rename any row on Home, addon catalogs included. Each seat keeps its own. Find it under the rows or in Settings › Home.'],
    ['new', 'Kids seats go by age rating', 'A kids seat now checks the title’s age rating where you live, so adult cartoons stay off it. Pick up to 6, 9 or 12 in Settings › Seats.'],
    ['new', 'Coming from Stremio?', 'Bring your addons, library and Continue watching over in one step from the welcome tour or Settings.'],
    ['new', 'What’s new', 'This card. It shows once after each update, and the full list lives in Settings › More.'],
  ] },
  { v: '2.27.2', date: '2026-11-06', items: [
    ['new', 'Samsung TVs (beta)', 'MKCinema runs on Samsung TVs from 2023 on through TizenBrew, with the remote’s Back and media keys working.'],
  ] },
  { v: '2.27.0', date: '2026-11-06', items: [
    ['new', 'Subtitles line up by themselves', 'A downloaded subtitle is matched to the film’s own timing, and Undo puts the old timing back.'],
    ['new', 'Manage add-ons from your phone', 'Scan the code on the TV’s Add-ons screen to paste links, switch add-ons on or off and reorder them.'],
    ['new', 'Pick a font', 'Nine reading fonts and nine bold heading fonts in Settings › Appearance.'],
    ['better', 'Glass side menu', 'A faint smoked-glass menu and a new logo on computers.'],
    ['fixed', 'Continue watching', 'Tapping a film in progress no longer plays its trailer when no source could start. It opens the film’s sources instead.'],
  ] },
  { v: '2.26.0', date: '2026-11-06', items: [
    ['new', 'Pick your player first', 'The welcome tour asks whether to play in MKCinema or in an app like VLC, and how to show only sources that play here.'],
  ] },
  { v: '2.25.1', date: '2026-11-06', items: [
    ['fixed', 'Audio menu', 'Night Mode presets are gone because they could freeze the player, and the Audio language list shows straight away.'],
  ] },
  { v: '2.25.0', date: '2026-11-06', items: [
    ['new', 'Sports', 'Live games and channels from your own addons, sorted by sport and league.'],
  ] },
  { v: '2.24.1', date: '2026-11-06', items: [
    ['fixed', 'iPhone and iPad', 'Streams play in Safari on iPhone and iPad.'],
  ] },
  { v: '2.24.0', date: '2026-11-06', items: [
    ['better', 'Watch party voice', 'Voices get their own volume, the film dips while people talk, and you can hear the party on your phone.'],
  ] },
  { v: '2.23.0', date: '2026-11-06', items: [
    ['new', 'Smallest file and preferred audio language', 'Two new source rules in Settings › Streams.'],
    ['better', 'Where to watch', 'One tidy dropdown instead of a row of logos.'],
  ] },
  { v: '2.22.0', date: '2026-11-05', items: [
    ['new', 'Anime look, comic edition', 'A redrawn Miko and a layered night city.'],
  ] },
  { v: '2.21.1', date: '2026-11-05', items: [
    ['fixed', 'Phones and seats', 'The phone side menu closes Settings properly, and every seat can be renamed from Who’s watching.'],
  ] },
  { v: '2.20.0', date: '2026-11-05', items: [
    ['new', 'The player, rebuilt', 'A fixed seek bar, options in tabs, volume up to 200 %, Listen on phone, picture adjustments and phone gestures.'],
  ] },
];
const WhatsNew = {
  KEY: 'seenVer', OFF: 'whatsNewOff',
  newer: (a, b) => (typeof Updater !== 'undefined' ? Updater.newer(a, b) : String(a) > String(b)),
  KINDS: { new: ['sparkles', 'New'], better: ['trending-up', 'Improved'], fixed: ['wrench', 'Fixed'] },
  since(prev) { return RELEASES.filter((r) => this.newer(r.v, prev) && !this.newer(r.v, APP_VERSION)); },
  when(d) { try { return new Date(`${d}T12:00:00Z`).toLocaleDateString(appLocale(), { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return d; } },
  list(rels) {
    return rels.map((r) => `<section class="wn-rel"><div class="wn-v"><b>${esc(r.v)}</b><small>${esc(this.when(r.date))}</small></div><ul class="wn-items">${r.items.map(([k, t, d]) => {
      const [ic, label] = this.KINDS[k] || this.KINDS.new;
      return `<li class="wn-${esc(k)}"><span class="wn-tag"><i data-lucide="${ic}"></i>${label}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></li>`;
    }).join('')}</ul></section>`).join('');
  },
  open(prev) {
    const all = this.since(prev || '0'); if (!all.length) return;
    const shown = all.slice(0, 3), more = all.length - shown.length;
    const el = X8.layer('whatsNew', { label: 'What’s new', icon: 'sparkles', eyebrow: 'Updated' });
    el.querySelector('.x8-modal').classList.add('wn-modal');
    const b = X8.body('whatsNew');
    b.innerHTML = `<h2 class="x8-h">What’s new in MKCinema ${esc(APP_VERSION)}</h2>${this.list(shown)}
      ${more > 0 ? `<p class="tour-note">${more === 1 ? 'One more update since you last opened MKCinema.' : `${more} more updates since you last opened MKCinema.`}</p>` : ''}
      <div class="inrow wn-foot"><button class="btn btn-ghost btn-sm" type="button" data-nav data-wn-all><i data-lucide="list"></i>All updates</button><button class="btn btn-prime btn-sm" type="button" data-nav data-x8close><i data-lucide="check"></i>Got it</button></div>`;
    icons();
    $('[data-wn-all]', b).onclick = () => { X8.close('whatsNew'); openSettings('whatsnew'); };
    X8.open('whatsNew');
    if (IS_TV) setTimeout(() => { const f = $('#whatsNew .wn-foot [data-x8close]'); if (f) Nav.focus(f, true); }, 60);
  },
  /* waits for a quiet moment, like the other first-run cards */
  later(prev) {
    let n = 0;
    const wait = () => setTimeout(() => {
      const busy = (window.MKCalm ? MKCalm.busy() : document.body.classList.contains('intro-on')) || document.body.classList.contains('layer-open') || !$('#player').hidden || [...MENU_LAYERS, 'tour'].some((x) => $(`#${x}`) && !$(`#${x}`).hidden) || $('.focus-ask, .sup-ask');
      if (!busy) this.open(prev); else if (n++ < 120) wait();
    }, n ? 1500 : 2500);
    wait();
  },
  section() {
    return { id: 'whatsnew', icon: 'sparkles', label: 'What’s new', intro: `You’re on MKCinema ${APP_VERSION}. Every update in the last few days, newest first. The full history is in CHANGELOG.md on GitHub.`, rows: () => [
      { key: 'wnCard', label: 'Show what’s new after an update', help: 'One card, once per update, the first time MKCinema opens on the new version.', type: 'toggle', get: () => !Store.raw.get(this.OFF, false), set: (v) => Store.raw.set(this.OFF, !v) },
      { html: () => `<div class="wn-all">${this.list(RELEASES.filter((r) => !this.newer(r.v, APP_VERSION)))}</div>` },
      { html: () => '<p class="tour-note"><a class="u" href="https://github.com/itbelikethatbruh/MKCinema/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Full changelog on GitHub</a> · <a class="u" href="https://github.com/itbelikethatbruh/mkcinema/issues/new/choose" target="_blank" rel="noopener">Report a problem</a></p>' },
    ] };
  },
  init() {
    if (!SECTIONS.some((s) => s.id === 'whatsnew')) {
      const at = SECTIONS.findIndex((s) => s.id === 'about');
      SECTIONS.splice(at < 0 ? SECTIONS.length : at, 0, this.section());
      const g = SET_GROUPS.find(([n]) => n === 'More'); if (g && !g[1].includes('whatsnew')) { const i = g[1].indexOf('about'); g[1].splice(i < 0 ? g[1].length : i, 0, 'whatsnew'); }
      SET_BLURB.whatsnew = 'Updates, new features and fixes';
    }
    COMMANDS.push({ label: 'What’s new in MKCinema', icon: 'sparkles', run: () => openSettings('whatsnew') });
    let prev = Store.raw.get(this.KEY, '');
    // someone who set MKCinema up before this card existed sees the newest release once; a first visit sees nothing
    if (!prev) prev = Store.get('toured', false) ? (RELEASES[1] && RELEASES[1].v) || '' : APP_VERSION;
    Store.raw.set(this.KEY, APP_VERSION);
    if (!this.newer(APP_VERSION, prev) || Store.raw.get(this.OFF, false)) return;
    this.later(prev);
  },
};
try { WhatsNew.init(); } catch (e) { console.warn('What’s new:', e); }
