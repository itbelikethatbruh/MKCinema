# MKCinema 2.19.0 + Android 1.5.0: new-episode notifications (on the device, no server)

This is the option recommended to Dee on a decision card on 2026-11-05, and it is still waiting on his choice. If he picks
Supabase web push instead, drop this patch and revert the Android 1.5.0 changes listed below.

## Web (2.19.0): `patch.py`, `epalerts.js`, `test.js`

- **Setting:** Settings › Home › Notifications › New-episode notifications.
  - It only appears inside the Android app 1.5.0+ on a phone or tablet (needs `MKAndroid.epEnable`). TVs, browsers and older apps see nothing.
  - Turning it on asks Android 13+ for notification permission.
- **What the page hands the app:** the series you follow (watchlist and Continue watching, Cinemeta `tt` ids only, at most 60) and the furthest episode reached in each, from progress plus the watched map.
  - It is sent after every in-app new-episode check, when the app goes to the background, and 15 s after start.
- **Deep link:** `#open?type=series&id=tt…&video=tt…:S:E` opens that episode's page. Notifications use it.
- **Ship:** `python3 -I patch.py <copy>`. It runs in any order with 2.15–2.18 and sets 2.19.0 unless the base is higher.
  - Leave version.json `android` alone until the 1.5.0 APK is on the site.
- **Tested** with the bridge mocked:
  - phone: permission flow, toggle on, sync payload (Kitsu ids dropped, reached = S2E3 from the watched map), deep link opens the show
  - TV and plain browser: no setting
  - no page errors

## Android 1.5.0 (versionCode 14): edited in `/mnt/project-files/mkcinema-android`, NOT compiled

- **`EpisodeAlerts.java` (new):** a JobService that runs every 12 h on any network, persisted across reboots.
  - It reads each followed series from Cinemeta (`v3-cinemeta.strem.io/meta/series/ID.json`).
  - It notifies once per episode that aired in the last 3 days past the one reached, with one notification per series (+N more).
  - Tapping opens `https://mkcinema.pages.dev/#open?...` in MainActivity.
  - It remembers the last 400 announced episode ids.
- **`MainActivity.java`:**
  - VER 1.5.0.
  - Bridge `epEnable(boolean)` returns on/off/asking/tv; `epOn()`; `epSync(json)`.
  - The POST_NOTIFICATIONS request result (REQ_NOTIFY) calls `MKEpPerm(ok)` in the page.
  - Refused on TV and off the MKCinema host.
- **`AndroidManifest.xml`:** POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, and the `.EpisodeAlerts` service with BIND_JOB_SERVICE.
- **`res/drawable/ic_notify.xml`:** a white vector notification icon.
- **Verification so far:** `EpisodeAlerts.java` type-checks against hand-written stubs of the Android/org.json APIs it uses. This thread has no Android SDK. Build with `build.sh` in a thread that has it and fix any javac error.
