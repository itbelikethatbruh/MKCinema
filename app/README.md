# MKCinema

Files:

- `index.html`: the whole app (Noir UI, Stremio engine, addon manager, ambilight player, Addon Studio). Open it in a browser, or let the server below serve it.
- `supabase.sql`: the table and access rules for account sync.
- `.env.example`: optional server settings. You don't need it.
- `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`: make MKCinema installable as an app (PWA). Upload them next to `index.html`.
- `mkcinema-server.js` + `package.json`: a `stremio-addon-sdk` addon that adds official trailers as a source, the `/yt` trailer relay, `/config.json` for Supabase settings, plus a CORS-open `/proxy` that forwards `Range`, passes `206`/`Content-Range` through, injects `behaviorHints.proxyHeaders.request`, and rewrites HLS playlists.

## Run

```sh
npm install
node mkcinema-server.js
# App:   http://127.0.0.1:7000/
# Addon: http://127.0.0.1:7000/manifest.json  (install it from the puzzle icon in MKCinema)
# Proxy: http://127.0.0.1:7000/proxy?url=<encoded>&headers=<base64 JSON>
```

Serving the app over http (instead of double-clicking the file) matters: YouTube refuses embeds from `file://` pages (error 153), and some addons reject a `null` origin. If you do open the file directly, keep the server running: MKCinema detects it and relays trailers through `http://127.0.0.1:7000/yt/<videoId>`, which gives the embed a real origin.

Trailers open in a clean pop-up (from the featured banner, a title's page or the sources list) with MKCinema's own play/pause, seek, mute and full-screen bar. YouTube's built-in controls are switched off through its official IFrame API; YouTube can still show its own branding inside the frame, and MKCinema does not cover it. Trailers use `youtube-nocookie.com`. That limits tracking cookies, but YouTube can still show ads in it, and MKCinema does not block or strip them. Settings › Playback can open trailers on YouTube instead.

### Deploying to Cloudflare Pages

The site lives at https://mkcinema.pages.dev. To publish a new version, open the Cloudflare dashboard, go to Workers & Pages › mkcinema › Create deployment, and upload the whole folder (not only `index.html`). The app also needs `manifest.webmanifest`, `sw.js`, `apple-touch-icon.png` and the `icon-*.png` files next to `index.html`. Without them it still works; it just cannot be installed and has no offline shell. After a redeploy the service worker picks up the new `index.html` on the next visit (it always asks the network first).

Environment variables: `PORT` (7000), `HOST` (127.0.0.1; use 0.0.0.0 for TVs/phones on your LAN), `PUBLIC_URL` (base used in subtitle/relay links), `PROXY_ALLOW_PRIVATE=1` (let the proxy reach LAN addresses; blocked by default to prevent SSRF), `PROXY_ALLOW_HOSTS=a.com,b.com` (optional upstream allowlist), `SUPABASE_URL` and `SUPABASE_ANON_KEY` (optional, for accounts), `FFMPEG_PATH` / `FFPROBE_PATH` (if ffmpeg is not on your PATH).

## What ships built in

MKCinema ships no titles, channels or streams of its own. Catalogs come from Cinemeta, subtitles from OpenSubtitles v3, and the only built-in source is "Official Trailers", which adds the YouTube trailers listed in a title's Cinemeta metadata. Anything playable beyond trailers comes from Stremio addons you install. Live TV stays empty until you install an addon with a `tv` or `channel` catalog.

## Accounts (Supabase)

Like Stremio, every user brings their own addons and debrid accounts. Installed addons (including any debrid key inside an addon's link) live in that user's browser and, if they sign in, in their own row of `mkcinema_profiles`, which Row Level Security keeps private to them. Your Supabase publishable key only lets people sign in to your service; it is not a secret and gives no access to your addons or anyone's data.

Sign-in is plain email and password through Supabase Auth, with a password reset link. Signed-in users get cloud sync of their watchlist, progress, addons, Studio project and settings.

1. In Supabase, open Project Settings › API and copy the Project URL and the anon public key. Never put the service_role key in the app.
2. Nothing to configure: your project URL and publishable key are built into `index.html`, so every user just signs in. (Optional: a `.env` with `SUPABASE_URL` / `SUPABASE_ANON_KEY` next to the server, or Settings › Account, points a copy at a different project.)
3. Run `supabase.sql` in the Supabase SQL editor. It creates the `mkcinema_profiles` table with Row Level Security, so each user can only read and write their own row.
4. Supabase's "Confirm email" setting (Authentication › Sign In / Providers › Email) is on by default, so new users must click a link in their inbox before signing in. Turn it off for instant sign-up. If you keep it on, set Authentication › URL Configuration › Site URL to where you serve MKCinema (for example `http://127.0.0.1:7000`) so the link lands back in the app. Supabase's built-in mailer only sends a few emails per hour; add your own SMTP under Authentication › Emails for real use.

## Settings (gear icon, top right)

- Account: Supabase sign-in and cloud sync.
- Intro & sound: the intro and its soundtrack. The interface itself makes no sounds.
- Appearance: one look, Noir (matte black, platinum type, hairlines; champagne only for small highlights). There are no themes and nothing animates behind the page, which keeps scrolling smooth on phones. Poster text (on hover, below the poster, or always), the optional curved IMAX wall (desktop), interface size, reduced motion.
- Performance: Low is the default (solid black panels). High and Balanced add frosted glass on desktop; phones and tablets always use solid panels. Glass blur can be fine-tuned, and the frame rate can be shown. Video quality is unaffected.
- Playback: play streams in MKCinema or an outside app (see below), max quality, preferred format, autoplay next, resume, seek step, default speed, ambilight and its strength.
- Subtitles: auto-select a language, size, color, background, font, outline and position.
- Streams & addons: hide P2P sources or trailers, request timeout, always use the proxy.
- Data: export, import and reset.

## External players (Settings › Playback › Play streams in)

Like Stremio, MKCinema can hand a stream to another app instead of playing it in the browser. The list only shows what your platform supports:

| Platform | Players | How it opens |
|---|---|---|
| Android (Chrome, most browsers) | Ask every time, VLC, MX Player, MX Player Pro, Just Player, mpv | `intent://` link; opens the Play Store if the app is missing |
| iPhone / iPad | VLC, Infuse, Outplayer, nPlayer | the app's own link scheme; Safari asks before switching |
| Mac | Infuse, IINA, `.m3u` playlist | link scheme; VLC and mpv for Mac have none, so use the playlist |
| Windows | PotPlayer, `.m3u` playlist | link scheme; VLC, mpv and MPC-HC have none, so the playlist opens in your default `.m3u` player |
| Linux | `.m3u` playlist | opens in your default player |

The choice is saved per platform and syncs with your account. The player's options menu also has "Open in another app" and "Copy stream link" for one-off hand-offs.

Limits: torrent (magnet) sources, local files and YouTube trailers always play in MKCinema. Subtitles picked in MKCinema don't carry over. Streams that need custom headers are routed through your MKCinema proxy, so the outside app must be able to reach that address (a phone can't reach `127.0.0.1` on your PC). If a browser blocks the automatic switch, tap "Open again".

## Player options

The options menu (sliders icon) has speed, quality and audio track (when the stream has several), aspect ratio (Fit, Fill, Stretch, 16:9, 4:3, 21:9), zoom (100 to 150%), and on desktop ambilight. The subtitle menu has size, position (low, raised, top) and timing offset.

## Phones and tablets

Below 760 px wide the section tabs move to a bottom bar. On touch screens the player controls span the whole screen, with large play and skip buttons; tap to show or hide them, and double-tap the left or right third to skip back or forward. Player menus open as bottom sheets (side sheets in landscape). Dragging the seek bar shows a large thumb and a time bubble (with how far you're jumping); the video seeks when you let go. Pinch out to fill the screen, pinch in to fit. The lock button (top right) hides every control until you tap Unlock. Fullscreen turns the phone to landscape, and the screen stays awake while a video plays. Poster titles show below posters because touch screens can't hover. Safe-area insets keep controls clear of notches and the home bar.

## Your Picks (recommendations)

On first visit a short walkthrough explains MKCinema and asks for at least 3 favorite shows, movies or genres. From those, plus your watchlist and what you watch, MKCinema builds a **For you** row on Home. Everything runs in the browser: no outside AI service sees your taste. You can also describe what you want in search ("funny crime series", "something like Arrival from the 90s"); Your Picks reads genres, type, decade and "like <title>" from the words and ranks matching titles from your catalog addons. Edit favorites, ask, or replay the walkthrough from Settings › Your Picks. Favorites sync with your account.

## Search and voice

Search (Ctrl/⌘ K, `/`, or the magnifier) shows titles instantly from everything already loaded, then adds each addon's results as soon as that addon answers, ranked by how closely the title matches. Recent searches and popular titles show when the box is empty. The mic button uses the browser's speech recognition (Chrome, Edge, Safari; not Firefox). In Chrome the audio is processed by Google's speech service.

## Import from Stremio

Settings › Account › Import from Stremio copies your Stremio library, watch progress and addons (with their configured keys). It signs in to api.strem.io once, reads the data, then signs that session out; the password is never stored. If the browser blocks the direct request, the app relays it through `mkcinema-server.js` (`POST /stremio-api/:method`, only login, logout, datastoreGet and addonCollectionGet, nothing logged). Stremio accounts that use Facebook sign-in need a Stremio password first.

## Subtitles

OpenSubtitles v3 is installed by default, so most IMDb titles get subtitles in many languages. You can also load `.srt`, `.vtt`, `.ass`, `.ssa` or MicroDVD `.sub` files from the player's subtitle menu, or drop one on the player. `G` and `H` shift timing by 0.25 s.

## Local files (ported from webvlc)

The folder button (or drag and drop anywhere) plays a video from your computer, with an optional subtitle file dropped alongside it. This takes the useful parts of addyosmani/webvlc (MIT): local playback, drag and drop, subtitle files and VLC-style hotkeys. Like webvlc, it uses the browser's own decoders. That means H.264, VP9 and AV1 video with AAC, MP3 or Opus audio play. HEVC/x265 video, or AC3, DTS and TrueHD audio (common in MKV releases), will not play in a browser; use desktop VLC for those.

Hotkeys: Space/K play, J/L or arrows seek, Up/Down volume, M mute, F fullscreen, V cycle subtitles, B cycle audio, `[` `]` speed, `=` normal speed, G/H subtitle delay, O options, S sources, N next episode.

## New in 2.3

### Player
- **Loading screen**: the title's logo pulses in 3D while a stream buffers (flat pulse on phones and with Reduce motion). Mid-film stalls bring it back after 0.7 s.
- **Skip Intro**: a button appears during intros and credits. Times come from your own earlier skips of that show (a skip of 40 to 150 s near the start is remembered), AniSkip for anime (Kitsu and MAL ids), or chapter markers. Settings › Playback can skip automatically.
- **Next episode in 10 s**: a countdown card with Play now and Cancel. It shows 45 s before the end or when the credits start, pauses while the video is paused, and warms up the next episode's sources.
- **Failover**: if a source shows no picture within 3.5 s, errors, or stalls for 12 s, MKCinema moves to the next one (same release group first), once per source.
- **Night Mode / audio presets** (waveform button or `A`): Cinema Flat, Vocal Boost, Night Mode (compressor plus make-up gain, so whispers and explosions sit closer together) and Spatial Widen, with a live spectrum. Browsers only hand audio to Web Audio when the stream allows it (CORS). MKCinema checks first and routes the stream through your MKCinema server when needed; on a stream that allows neither, the preset cannot apply and MKCinema says so instead of going silent.
- **X-Ray** (pause for a second): cast chips that search, plus picture size, dropped frames, bitrate, buffer and audio preset. **Bookmarks** save a scene with a note and thumbnail; they appear in your Library.
- **Subtitle sync**: a 20-second strip of upcoming lines you drag under a marker, plus ±1 s/100 ms/10 ms steps. **Transcript** lists every line; tap 🎯 *Sync here* on a line the moment it is spoken and the delay is set for you.
- **Spoiler Guard** (Settings › Playback, or the chip on a show's episode list) hides thumbnails and descriptions of episodes you have not watched.

### Audio rescue (needs ffmpeg on your server)
Many MKV releases use EAC3, AC3, DTS or TrueHD audio, which browsers cannot play: the picture works and the sound is silent. MKCinema notices the silence. If `mkcinema-server.js` runs on a machine with ffmpeg, it converts the audio to stereo AAC on the fly (`/remux`), copying the video untouched, so it costs little CPU. Seeking restarts the conversion at the nearest keyframe (`/remux/seek`) and MKCinema fast-forwards silently behind the loading screen to the exact second. Without ffmpeg you get a banner to try the next source or open the file in VLC or another player. Cloudflare Pages cannot run ffmpeg; this needs your own server (a PC, a Raspberry Pi, a VPS).

Install ffmpeg: `winget install ffmpeg` (Windows), `brew install ffmpeg` (macOS), `sudo apt install ffmpeg` (Debian/Ubuntu). The server prints `Audio rescue: on (ffmpeg)` when it finds it.

### Debrid (Settings › Debrid)
Paste your own Real-Debrid, TorBox, AllDebrid or Premiumize key and press Test. Torrent results from your addons are then resolved through your account and play in the browser, cached ones marked ⚡. Signed in, your keys (debrid, RPDB, OMDb) sync to your own account row, which Supabase row-level security lets only you read, so they load on every device you sign in on. Turn off *Sync keys with my account* in Settings › Debrid to keep them on one device. Keys are never in setup codes unless you tick the box, and only ever sent to that service (or through a debrid relay, which only talks to those four API hosts; see *Debrid relay* below). MKCinema does not search for or provide any content; it only resolves links your addons already returned.

### Ratings
Star badges use the IMDb rating from Cinemeta. RPDB posters (with ratings printed on them) work with your RPDB key, or the free tier. Add a free OMDb key to show Rotten Tomatoes and Metacritic on title pages. MKCinema does not make up scores.

### Watch together and phones (Settings › Devices)
- **Watch party** (people icon or `P`): a 6-character room. Everyone opens the same title from their own sources; play, pause and seeks stay in sync (drift is corrected by nudging speed, or seeking past 1 s). Chat, reactions and push-to-talk voice run peer to peer over WebRTC; the room itself uses Supabase Realtime with the built-in key. Very strict networks (some corporate or mobile carriers) block peer connections without a TURN server, which MKCinema does not provide.
- **Watch on phone**: a QR code that opens the same title, source and second on your phone. It contains the stream link, so only show it to people you would give that link.
- **Phone as remote**: scan a QR code and your phone becomes a trackpad (tap to pause, swipe to skip 15 s, slide for volume) plus buttons for audio preset and subtitles.

### Trakt, Simkl and the Airing Calendar
Connect Trakt with your own free API app (trakt.tv/oauth/applications, redirect `urn:ietf:wg:oauth:2.0:oob`) or Simkl with a client ID. MKCinema scrobbles as you watch (past 80 % counts as watched) and can import or export your watchlist. The Calendar tab lists upcoming and recent episodes of shows in your watchlist and Continue watching.

### Setup Cloner (Settings › Data)
One code or file carries your addons, settings, library, progress, home layout and taste profile to another device. Debrid and other keys are left out unless you tick the box. Restoring installs and removes addons live, no reload.

### Home, contrast and performance
- First visit asks what you watch most (films, shows, or both) and opens on that. Settings › Home sets the start page and which rows show.
- Secondary text is brighter, and Settings › Appearance has a High contrast option.
- The GPU governor drops to Low graphics on low battery or when scrolling stutters.

### Support
Settings › Support has a PayPal link and QR code for donations to Drake Christopher. After a few visits MKCinema asks once every three weeks, never during playback, with a "Don't ask again" button.

## Premium pass (2.4)
- **New brand**: a Didone MK monogram whose letters share one stem, in a platinum double ring, with the MKCINEMA wordmark in Bodoni Moda. The splash draws the rings, turns the emblem in from the dark and sweeps light across it.
- **Episodes**: tapping an episode opens a sheet with that episode's Play button, previous/next, and its full source list (a bottom sheet on phones, a side panel on wide screens). No more scrolling to find sources.
- **Get started** (first item in Settings): install VLC from Google Play, the App Store or videolan.org; connect TorBox step by step (account, torbox.app/settings › API Key, paste, test); add sources; sign in.
- **VLC recommended**: MKV sources carry an orange "VLC recommended" tag, and a failed MKV offers the VLC store link for your device.
- **Settings**: grouped sections; on phones a list of sections with a page per section and a back bar.
- **Effects**: High is the default on every device. Buttons are raised with a brushed-metal edge and a light sweep; posters lift with a little perspective; the loading logo pulses in 3D. Phones get everything except frosted glass (blur caused black tiles on Android Chrome). Slow scrolling or a low battery drops to Low automatically.
- **Trailers** close themselves at the end so YouTube's suggestion grid never shows. YouTube's own title, share link and "More videos" still appear while a trailer is paused or touched; YouTube's terms don't allow sites to cover them.
- Toasts no longer stack: a repeated message replaces the one on screen.

## Polish pass (2.5)
- **Readable text**: secondary text is brighter, larger and heavier; labels use the UI typeface instead of mono. Row subtitles sit under the row title.
- **Dock**: raised icon buttons with a lit edge and a soft shadow; the active tab is raised too. On a phone held sideways the dock slides away while you scroll down and returns when you scroll up.
- **Home**: Trakt's Watchlist and Collection rows are off by default (Settings › Home turns them back on), and any catalog that comes back empty or fails is left off Home.
- **Featured banner**: swipe (or drag) sideways through the featured titles; arrows on hover on desktop; dots on phones too.
- **Title pages**: the logo pops out in 3D, then floats gently with a slow light sweep (effects on).
- **Ratings**: colour badges, green 7.5 and up, gold 6 to 7.4, coral below 6.
- **Store badges**: Google Play, App Store and VLC desktop badges drawn like the official ones.
- **Landscape phones**: the episode sheet fills the screen, the episode on the left and its sources on the right, each scrolling on its own.
- **Intro sound**: a slow, warm pad and one soft chime replace the riser and the hit.

### Debrid relay
TorBox and the other debrid services refuse calls made directly from a web page (the browser blocks them, CORS). A Cloudflare Pages site uploaded from the dashboard only serves files (dashboard uploads do not deploy Pages Functions), so MKCinema needs a small relay to pass those calls on. It tries, in order:
1. `/debrid` on the same site, which exists when `mkcinema-server.js` serves the app. On Pages this path returns the app page with no `x-mkc-relay` header, so MKCinema skips it.
2. The `debrid-relay` Edge Function on the Supabase project the app signs in with (`supabase/functions/debrid-relay`, deployed with JWT verification off). It answers only https://mkcinema.pages.dev, its preview subdomains and localhost, and it is what makes debrid work on the dashboard-uploaded site.
3. The proxy URL from Settings (your own `mkcinema-server.js`).

Every relay only reaches the four debrid API hosts, takes the user's own key per request and stores nothing.


## 2.6
- **Dock**: search is a plain magnifier, the replay-intro button is gone (Settings › Sound still has it) and a **Watch party** button takes its place. When the dock runs out of room it drops labels and extras instead of letting tabs slide off screen.
- **Browser only mode** (Settings › Playback, off by default): for devices where VLC or another player can't be installed. Only sources this browser can play with picture and sound are listed: H.264 (or HEVC/AV1 where the device supports them), no Dolby Vision, no 10-bit H.264, AAC/Opus-style sound, and MKV files only when they name browser-friendly sound. Torrents show only with a debrid service. With your own MKCinema server running, audio rescue makes Dolby/DTS sound playable, so those come back. It reads release names, so a mislabelled file can slip through; automatic source switching then moves on.
- **Profile photo**: Settings › Account, tap the avatar. It is cropped to a square, shrunk to 256 px and synced in your own account row.
- **High text contrast** is the default (a choice you make yourself is kept).
- **Support**: a "Donate with PayPal" button in PayPal's colours.
- **Welcome walkthrough**: new cinematic first screen, nine features, and an updated comparison with a typical streaming app.
- **App icons**: the MK monogram for iPhone/iPad (apple-touch-icon.png) and Android (including a maskable icon). Remove and re-add a home-screen shortcut to see it.

## 2.7: premium polish

- Top bar keeps full tab labels. When space runs short it first tucks away the layout switch, local file and sound buttons (still in the palette and Settings), then moves the tabs onto their own centred row. Nothing scrolls sideways. Home uses a house icon.
- Pop-ups share the player subtitle panel's finish: solid graphite, hairline edge, round close button, flat controls.
- Selected chips and filters stay dark-on-light with High contrast on.
- Stream rows: readable release names, a "Best match" label, fewer tags, and size, peers and tracker as plain text. Repeated addon stat lines are dropped.
- Poster hover chips drop whole instead of being cut off; the IMDb chip is skipped when the corner rating badge already shows it.
- The "Resolving the best stream" pop-up is gone; the loading logo already says it.
- X-Ray: Cast (photos, character names, crew), actor pages with bio and other titles, About (Wikipedia summary, release facts, OMDb awards and box office with your key), This scene (bookmark, picture and sound). Photos and bios come from Wikipedia's free API. Scene-by-scene "who's on screen" and music IDs need data only Amazon has, so they are not included.
