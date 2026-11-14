# MKCinema for Android and Android TV

A WebView wrapper around https://mkcinema.pages.dev: full-screen video, intent:// hand-off to VLC/MX Player/Just Player/mpv, file picker for subtitles, microphone for watch-party push-to-talk, Back button navigation.

Free forever: the app is free and will never charge for anything, with no in-app purchases, no paid tier and no ads. Ko-fi donations are optional and never unlock anything. The promise is shown in the app under Settings › About and Settings › Support (it comes from the web app). Any store listing must say the same and must never add in-app purchases.

Build: `OUT=/some/dir sh build.sh` with Android SDK build-tools 35 and platform 35 at $SDK (defaults to $ANDROID_HOME). The signing key defaults to keystore/; set `KS=/path/mkcinema.jks KS_PASS=file:/path/password.txt` to use one kept elsewhere.

KEEP keystore/ SAFE AND PRIVATE. Every future update must be signed with keystore/mkcinema.jks, or Android refuses to install it over the old version. Never publish keystore/.
Bump android:versionCode in AndroidManifest.xml for each release.

Android TV, Google TV and Fire TV: the same APK. It declares a LEANBACK_LAUNCHER entry and a 16:9 banner, and doesn't require a touchscreen.

Launcher art (1.2.1): the icon (`@drawable/ic_launcher`, 48 dp) and banner (`@drawable/banner`, 160x90 dp, so 320x180 at xhdpi) are plain PNGs in drawable-mdpi through drawable-xxxhdpi, set on both <application> and the activity. Never point the icon at a mipmap folder or an adaptive-icon XML: Fire OS's launcher reloads sideloaded apps' tiles from that file and can't read either, so the tile turns into a grey broken image some time after install. Re-render the PNGs from art/icon.png and art/banner.png (made with art/art.html). On a TV (UI mode television, leanback or Fire TV feature) it sets a 1280-wide viewport, appends MKCinemaTV/1.2.1 to the user agent, maps Back to the web app's back() and maps the remote's media keys to the player shortcuts. D-pad focus movement comes from the web app's own Nav.

Voice search (1.2): WebViews have no Web Speech API, so the page calls window.MKAndroid.voice(lang). The app opens the system speech screen (Android TV / Google TV) or, failing that, the SpeechRecognizer service with the app's microphone permission, and sends the text back to MKVoice.nativeDone. The remote's search key (KEYCODE_SEARCH / VOICE_ASSIST, or onSearchRequested) opens search and starts listening. If the TV offers neither (likely on Fire TV, where the remote's mic belongs to Alexa), the page opens the on-screen keyboard instead.

## 1.4.0: offline downloads (phones and tablets)

`Downloads.java` uses the system DownloadManager to save into the app's own Movies folder (no storage permission). The
page uses `MKAndroid.dlStart/dlList/dlRemove/dlPlay`, which are refused on TVs. Finished films play in `PlayerActivity`,
which now has touch controls on phones: tap shows the bar, double-tap a side skips 10 s, and the bar can be dragged.
When the app can't load at all, the "You're offline" page lists finished downloads (`mkdl:` links).

## 1.5.0 (versionCode 14): new-episode notifications (not compiled yet)

`EpisodeAlerts.java` is a JobService that runs every 12 h, reads the followed series from Cinemeta and notifies about episodes
from the last 3 days. The page sends the list with `MKAndroid.epSync`, and `epEnable`/`epOn` turn it on or off (Android 13+
asks for permission). There is no server. Details are in the [2.19.0 episode alerts notes](https://github.com/itbelikethatbruh/mkcinema/blob/3b48ed4/tools/patches/2.19.0-episode-alerts/README.md).
It needs web 2.19.0 for the setting. Older pages simply don't show it.

## 1.13.1 (versionCode 32): steadier returns from the TV player and back-to-back recordings

- Results for the page (the TV player closing, Google sign-in coming back) wait until the page is loaded and can take
  them (`callPage`), so they are not lost when Android rebuilt the page to free memory on 1-2 GB TV sticks.
- A planned recording on a channel that is already recording extends the running recording to the later end time.

## 1.13.0 (versionCode 31): updates install by themselves

`MKAndroid.updateAuto(url)` downloads the update in the background (same checks as `update`: MKCinema's own download
address, signed with this app's key, not older). It installs a few minutes after the app is left, never while the TV
player, a recording, a download or an AirPlay session is running. Installs now go through a `PackageInstaller` session,
so MKCinema becomes the app that installed itself; from then on Android 12+ installs updates without asking
(`setRequireUserAction(USER_ACTION_NOT_REQUIRED)`). When Android still wants a tap, the page offers Install
(`MKAndroid.updateInstall()`) the next time the app opens. `UpdateResult` receives the installer's answer. Manual
Update uses the session too and falls back to the old installer screen if a session can't be made. Needs web 2.70
(page side: Settings › About › Update the app by itself); older pages keep the Update bar.

## 1.12.2 (versionCode 29): add a TV by its address

`MKAndroid.apAdd(ip)` checks one address in the background: AirPlay `GET /info` on port 7000 (no pairing needed; name,
model, deviceID and features come from its binary plist), else an open Chromecast port 8009. It answers in
`MKAirPlay.added({ok, name|msg})`, keeps the address in the app's settings and checks it again on every scan.
`MKAndroid.apDiag()` returns what the last scan heard (kind, name, address, and why anything was left out), shown in the
same card. Needs web 2.69.8 (the updated block); older pages don't show it.

## 1.12.1 (versionCode 28): every TV on the Wi-Fi

Send to TV lists Chromecast / Google TV and DLNA smart TVs next to AirPlay ones, all through the same bridge
(`MKAirPlay.devices` rows now carry `kind`: `airplay`, `cast` or `dlna`) and the same foreground service.
`Cast.java` speaks CASTV2 (protobuf frames over TLS on port 8009, found with Bonjour `_googlecast._tcp`, speakers and
groups skipped by the `ca` video bit) and opens Google's Default Media Receiver, which fetches the link itself.
`Dlna.java` finds renderers with SSDP (AVTransport) and drives them with SOAP (SetAVTransportURI, Play, Pause, Seek,
GetTransportInfo/GetPositionInfo). AirPlay TVs from Samsung, LG, Sony and Vizio don't set the Apple TV "video" bit, so
the filter also accepts HTTP Live Streaming (bit 4) or Screen (bit 7); receivers and HomePods set none of them.
A TV found several ways is one row (same address): Cast, then Apple TV AirPlay, then DLNA, then non-Apple AirPlay.
Lookups that fail on a busy network are retried. Needs web 2.69.8 for the new list; web 2.69.4 shows the rows as AirPlay.
Tests: `tools/airplay-test` has a simulated Chromecast and DLNA TV. Not tested on real Cast or DLNA TVs yet; a DLNA TV
may refuse https links or some formats, which shows as an error and the film stays on the phone.

## 1.12.0 (versionCode 27): AirPlay to an Apple TV

`AirPlay.java` is an AirPlay video sender in plain Java (no libraries, nothing Android in it); `AirPlayService.java` finds
receivers with Bonjour (`_airplay._tcp`, video feature bit only) and keeps the session in a `mediaPlayback` foreground
service, because the Apple TV stops the film when the phone's connection closes. The Apple TV fetches and plays the
stream link itself (MP4 or HLS), the phone only sends it and the controls. Pairing is HomeKit pair-setup (SRP-6a 3072/SHA-512,
Ed25519) with the 4-digit code the TV shows, kept in the app's private settings; every session runs pair-verify (X25519)
and ChaCha20-Poly1305. AirPlay 2 receivers get RTSP SETUP (NTP timing port, event channel), RECORD, then `/play`.
TVs that let everyone AirPlay pair without a code (transient pairing). The steps follow pyatv (MIT).
Page side: `MKAndroid.apScan/apPlay/apPin/apCtl/apForget/apState`, answers in `MKAirPlay.devices/state`; needs web 2.69.4.
Tests on a computer: `tools/airplay-test` (crypto against the JDK, the whole session against a simulated Apple TV).
Not tested on a real Apple TV yet. FairPlay-protected video (Apple TV+, Netflix) is out of scope: MKCinema only sends
plain web links. Subtitles MKCinema adds are not sent (AirPlay link playback has no way to carry them).

## 1.11.0 (versionCode 24): live TV recording

`RecService.java`: the page asks with `MKAndroid.recStart` and the app records the channel itself, so every TV service
the person added works, plain `http://` included. It follows a live HLS channel (best variant with its own sound,
AES-128 pieces decrypted), saves a catch-up programme from start to end, or keeps a plain MPEG-TS stream (joined again
after a drop). It runs in a foreground service with a Stop button in the notification, and stops at the time the page
asked for, after 8 hours, or when less than 300 MB is free. Files are the channel's own `.ts` in the app's Movies folder,
listed with the downloads (`"rec": true`), so they play from Library › Downloads. A programme picked in the guide
(`MKAndroid.recPlan`/`recUnplan`) starts from an exact alarm (`RecService.Alarm`), with the app closed too, and the
alarms are set again after a restart. Nothing is re-encoded and nothing leaves the device. Needs web 2.67 (mk-record).

## 1.10.0 (versionCode 23): your own TV service in the app

`Iptv.java`: the TV services the person adds in Live TV › Add playlist (Xtream login or playlist link) load directly in
the app, plain `http://` ones included and with no CORS headers needed. The page sends their addresses with
`MKAndroid.iptvHosts` (kept in the app's settings), and requests from the page to those servers, or to the servers they
redirect to or name in a channel's HLS playlist, are fetched by the app and handed back to the page. Every other address
keeps the 1.8.1 rules in `cleartext()`. Channels, catch-up, films and episodes play in the app's own player
(`MKAndroid.play`) on phones as well as TVs. Needs web 2.63.0 for the Xtream API screens (Catch-up, Movies, Series).

## 1.9.1 (versionCode 22): camera for party cameras

`onPermissionRequest` now grants `RESOURCE_VIDEO_CAPTURE` as well as `RESOURCE_AUDIO_CAPTURE`, only to pages on
`mkcinema.pages.dev`, after Android's own runtime prompt (`CAMERA`, `RECORD_AUDIO`). A refused camera still lets the
microphone through. The manifest adds `CAMERA` and marks `android.hardware.camera`/`camera.front` as not required, so TVs
without a camera can still install it. Needs web 2.55.0 for the Camera button.

## 1.9.0 (versionCode 21): styled subtitles, Dolby Vision profile 7, Skip intro in the TV player

- **ASS/SSA styling** (`Ass.java`): libass through ass-media 0.4.0 (MIT, built for Media3 1.8.0) in `OVERLAY_CANVAS` mode.
  `AssSubtitleView` sits over the video surface with the same size and place. MKV-embedded and downloaded `.ass` files
  both use it. `libs/fetch.sh` downloads the classes.jar files, the Kotlin stdlib and the arm64-v8a/armeabi-v7a native
  libraries (`libs/ass-jni/`, not committed), and build.sh adds them to the APK. If libass can't load, the player keeps
  Media3's plain subtitles. If the app dies while the libass layer is on screen (pref `assLive`), styled subtitles turn
  off for that app version (pref `assOff`). The page can turn it off with `ass: false` (setting "Styled anime subtitles
  in the TV player").
- **Dolby Vision profile 7** (`DvFallback.java`): Media3 refuses to give profile 7 to an HEVC decoder. This video
  renderer relabels the track as HEVC when no Dolby Vision decoder takes profile 7 or the screen has no Dolby Vision,
  so the HDR10 base layer plays. TVs with real profile 7 support keep Dolby Vision.
- **Skip intro / recap / ending, Next episode**: the page sends `skips` ({recap, intro, ed: [s, e], credits: s} in
  seconds), `hasNext` and `autoSkip` in `MKAndroid.play`. OK presses the button while it shows. Needs web 2.54.0.

## 1.7.0 (versionCode 18): ExoPlayer engine for the TV player

`PlayerActivity` talks to an `Engine`: `ExoEngine` (Media3 ExoPlayer 1.8.0, the default) or `MpEngine` (the system MediaPlayer
used from 1.2.5 to 1.6.2). If ExoPlayer can't open a file, the activity retries it once with `MpEngine` before reporting the
error to the page (which then plays it in MKCinema's own player). The page can force the basic engine with
`MKAndroid.setEngine("system")` (Settings › Playback › TV player engine); the choice is kept in SharedPreferences "mk".
The jars live in `libs/` and `libs/fetch.sh` downloads them (checked against `libs/SHA256SUMS`); build.sh calls it when they
are missing. Only the AARs' classes.jar is used: ExoPlayer needs no Android resources for what the player calls, except
`androidx.collection` (async MediaCodec queue on Android 12+), which is included. `android:largeHeap` is on so the
buffer (a third of the large-heap budget, 48 to 160 MB) fits.
