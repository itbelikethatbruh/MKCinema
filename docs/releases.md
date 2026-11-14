# Releases

Every app is built from source by GitHub Actions when a version tag is pushed. Nobody builds on their own computer,
and every file carries a checksum and a build provenance attestation.

## Cutting a release

1. Bump the version of each app that changed:
   - Android and Android TV: `android:versionName` and `android:versionCode` in `android/AndroidManifest.xml`
   - Windows: `version` in `windows/main.go`
   - macOS: `CFBundleShortVersionString` and `CFBundleVersion` in `mac/Info.plist`, and `V=` in `mac/package.sh`
   - Linux: `V=` in `linux/package.sh`

   `python3 tools/release/versions.py` prints what a release will carry and stops if the Mac numbers disagree.
2. Optional: write the notes in `.github/release/<tag>.md`. Without one, the release gets a table of every file.
3. Push a tag: `git tag v2.0 && git push origin v2.0`. Or run **Actions › Release › Run workflow** with the tag.
4. Approve the `android-release` run when GitHub asks (the signing key lives in that environment).

The **Release** workflow then runs five jobs side by side and publishes when all of them pass:

| Job | Runner | Makes |
|---|---|---|
| android | ubuntu-latest | `MKCinema.apk` (also attached as `MKCinema-TV.apk`), signed with the release key; fails if the certificate is not the one in SECURITY.md |
| windows | ubuntu-latest | `MKCinema.exe` (cross-compiled), after `go vet` and `go test`, and `MKCinema-engine-windows-x64.zip` (the native player's engine, pinned in `tools/release/libmpv.sh`; the exe downloads it from this release and checks its SHA-256) |
| linux | ubuntu-22.04 | `mkcinema_<v>_amd64.deb` and `mkcinema-<v>-linux-x86_64.tar.gz`, built on the oldest supported Ubuntu so the binary runs on older systems |
| macos | macos-15 | `MKCinema-<v>-mac.zip` and `MKCinema-<v>.dmg` (universal: Apple silicon and Intel) |
| publish | ubuntu-latest | `release.json`, `SHA256SUMS`, attestations and the GitHub release |

The webOS `.ipk` is not built in CI yet: tag releases carry the one mkcinema.app serves, checked against
`site/download/SHA256SUMS`. The same happens to the APK when the signing secrets are missing; the run log says so.

The release title names the Android version, like **MKCinema 2.0 · Android 1.9.1**. Updaters rely on that.

### Signing

- **Android**: signed with the release key from the `android-release` environment (see
  [release-signing.md](release-signing.md)). That environment's deployment rules must allow tags matching `v*`,
  or GitHub refuses to run the signing job for a tag.
- **Windows**: not code-signed. SmartScreen shows "Windows protected your PC" on first run (More info › Run anyway).
- **macOS**: not signed with a Developer ID and not notarized. Notarization needs a paid Apple developer account in
  a real person's name, so it is left out on purpose. On first open, go to **System Settings › Privacy & Security ›
  Open Anyway**.
- **Linux**: packages are not signed; check them against `SHA256SUMS`.

### Website downloads

mkcinema.app serves its own copies in `/download/`. After a tag release, put the release's files there, regenerate
`site/download/SHA256SUMS` with `tools/download-checksums.sh <folder>` and commit it. That commit publishes a
"website files" release, which is never marked as latest and has no Android version in its title, so updaters ignore
it.

## release.json

Every release has a `release.json`. The newest tag release's copy is always at

    https://github.com/itbelikethatbruh/MKCinema/releases/latest/download/release.json

```json
{
  "format": 1,
  "app": "MKCinema",
  "tag": "v2.0",
  "title": "MKCinema 2.0 · Android 1.9.1",
  "published": "2026-11-08T12:00:00Z",
  "commit": "<full commit SHA>",
  "release_url": "https://github.com/itbelikethatbruh/MKCinema/releases/tag/v2.0",
  "checksums_url": "https://github.com/itbelikethatbruh/MKCinema/releases/download/v2.0/SHA256SUMS",
  "platforms": {
    "android": {
      "version": "1.9.1",
      "build": 22,
      "needs": "Android 7 or later",
      "signing": "apk-signature-v2-v3",
      "built_from_source": true,
      "files": [
        { "name": "MKCinema.apk", "kind": "apk", "size": 17700000, "sha256": "…",
          "url": "https://github.com/itbelikethatbruh/MKCinema/releases/download/v2.0/MKCinema.apk" }
      ]
    },
    "android-tv": { "…": "same shape" },
    "windows": { "…": "same shape" },
    "macos": { "…": "same shape, files: zip and dmg" },
    "linux": { "…": "same shape, files: deb and tar.gz" },
    "webos": { "…": "same shape" }
  },
  "obtainium": { "link": "obtainium://app/…", "settings": { "…": "see below" } }
}
```

- `format` changes only when a field is removed or changes meaning. New fields may appear at any time.
- `version` is the app's own version (Android's `versionName`), comparable dot by dot. `build` is Android's
  `versionCode`. A platform's `version` is `null` when the release copied a file whose version it cannot tell.
- `built_from_source` is false for files copied from mkcinema.app.
- `sha256` matches `SHA256SUMS`. An updater must check it before installing.

An updater compares `platforms.<its platform>.version` with its own, downloads the file whose `kind` it can
install, checks `sha256`, then offers the install. The Android app already updates itself through the web app's
`version.json`; desktop apps can use `release.json` the same way.

## Obtainium

Obtainium reads GitHub releases directly. Releases are tagged by release (v2.0), not by Android version, so
Obtainium needs four settings to compare the right numbers. The link in `release.json` (`obtainium.link`) adds
MKCinema with all of them set, in one tap:

| Setting | Value | Why |
|---|---|---|
| Use release title as version | on | the title carries the Android version |
| Filter release titles by regular expression | `Android \d` | skips website-files releases and older releases without an Android version |
| Version extraction regular expression | `Android (\d+(?:\.\d+)+)`, match group `1` | gives `1.9.1`, the same as the installed app's version |
| Filter APKs by regular expression | `^MKCinema\.apk$` | the TV APK is the same file, so Obtainium never asks which one to install |

`python3 tools/release/manifest.py --obtainium-link --repo itbelikethatbruh/MKCinema`
prints the link. It only finds releases from the first tag release onward, because older release titles carry no
Android version. Anyone who added MKCinema by its plain GitHub address can tap the link once to switch over.
