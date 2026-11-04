# MKCinema for Android and Android TV

A WebView wrapper around https://mkcinema.pages.dev: full-screen video, intent:// hand-off to VLC/MX Player/Just Player/mpv, file picker for subtitles, microphone for watch-party push-to-talk, Back button navigation.

Build: `OUT=/some/dir sh build.sh` with Android SDK build-tools 35 and platform 35 at $SDK.

KEEP keystore/ SAFE AND PRIVATE. Every future update must be signed with keystore/mkcinema.jks, or Android refuses to install it over the old version. Never publish keystore/.
Bump android:versionCode in AndroidManifest.xml for each release.

Android TV, Google TV and Fire TV: the same APK. It declares a LEANBACK_LAUNCHER entry and a 16:9 banner, and doesn't require a touchscreen.

Launcher art (1.2.1): the icon (`@drawable/ic_launcher`, 48 dp) and banner (`@drawable/banner`, 160x90 dp, so 320x180 at xhdpi) are plain PNGs in drawable-mdpi through drawable-xxxhdpi, set on both <application> and the activity. Never point the icon at a mipmap folder or an adaptive-icon XML: Fire OS's launcher reloads sideloaded apps' tiles from that file and can't read either, so the tile turns into a grey broken image some time after install. Re-render the PNGs from art/icon.png and art/banner.png (made with art/art.html). On a TV (UI mode television, leanback or Fire TV feature) it sets a 1280-wide viewport, appends MKCinemaTV/1.2.1 to the user agent, maps Back to the web app's back() and maps the remote's media keys to the player shortcuts. D-pad focus movement comes from the web app's own Nav.

Voice search (1.2): WebViews have no Web Speech API, so the page calls window.MKAndroid.voice(lang). The app opens the system speech screen (Android TV / Google TV) or, failing that, the SpeechRecognizer service with the app's microphone permission, and sends the text back to MKVoice.nativeDone. The remote's search key (KEYCODE_SEARCH / VOICE_ASSIST, or onSearchRequested) opens search and starts listening. If the TV offers neither (likely on Fire TV, where the remote's mic belongs to Alexa), the page opens the on-screen keyboard instead.
