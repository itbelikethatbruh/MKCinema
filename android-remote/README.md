# MK Remote for Android

The MKCinema phone remote (`https://app.mkcinema.app/remote`) as its own small Android app (package
`com.mkcinema.remote`, about 70 KB, no libraries). Free, like everything MKCinema: no ads, no purchases.

- Opens straight into the remote, keeps the screen on while open.
- The phone's volume buttons turn the TV's volume while a film plays there (the page's `window.MKRemote.vol`), and the
  phone's own volume the rest of the time.
- Back closes the remote's own sheets and panels first (`window.MKRemote.back`), then leaves the app.
- The TV's QR code opens the app directly: a verified App Link for `https://app.mkcinema.app/remote`, backed by
  `app/.well-known/assetlinks.json` (MKCinema's release key). Without the app the same code opens the browser.
- Party voice and the party camera ask for the microphone or camera only when used. Plain http is off entirely.
- Links that leave the remote (the full app, help pages) open outside: in MKCinema if installed, else the browser.
- No JavaScript bridge: the app only calls the page's `window.MKRemote` hook.

Build: `sh build.sh` with the Android SDK (build-tools 35, platform 35) at `$SDK`, signed with the same key as MKCinema
(`../android/keystore`, or `KS` / `KS_PASS`). The Android APK workflow builds and signs it next to MKCinema.apk.
Bump `android:versionCode` and `VER` in RemoteActivity.java for each release.
