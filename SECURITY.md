# Security policy

## Supported versions

Security fixes go into the latest web app at https://app.mkcinema.app and the latest native app release. The native apps load the web app, so most fixes reach every platform without a new download.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Instead, use GitHub's private reporting: go to the **Security** tab of this repository and click **Report a vulnerability**.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get a reply as soon as possible, and credit in the release notes if you'd like it.

## Scope

In scope: the web app, the companion server (`mkcinema-server.js`), the debrid relay, the website and the native apps.

Out of scope: third-party addons, debrid services and other services MKCinema connects to. Report those to their owners.

## Verifying downloads

Every release on the [Releases page](https://github.com/itbelikethatbruh/mkcinema/releases) from v1.7 on lists the SHA-256 checksum of each file in its notes, and attaches the same list as `SHA256SUMS`. Releases up to v1.6 don't include checksums; use the latest release. Download only from mkcinema.app or that page, then check the file before you install it:

- **Windows** (PowerShell): `Get-FileHash .\MKCinema.exe -Algorithm SHA256`
- **Mac**: `shasum -a 256 MKCinema-1.1.1-mac.zip`
- **Linux**: put the file next to `SHA256SUMS` and run `sha256sum --ignore-missing -c SHA256SUMS`
- **Android**: on a computer, `sha256sum MKCinema.apk`. Android also checks the app's signature on every update; the MKCinema signing certificate's SHA-256 is
  `9F:B8:08:4D:9A:61:2D:3A:3B:80:49:21:A2:92:95:9F:D2:FE:DD:F1:9B:8C:DF:81:C0:AC:E8:24:B1:CF:7F:D9`
  (check with `apksigner verify --print-certs MKCinema.apk` or `keytool -printcert -jarfile MKCinema.apk`).

The number you get must match the one in the release notes exactly. If it does not, don't install the file, and tell us (see above).

Releases from now on also carry a build provenance attestation. With the GitHub CLI: `gh attestation verify MKCinema.exe -R itbelikethatbruh/mkcinema`. It proves the file was published by this repository's release workflow from a specific commit.

The Windows app is not code-signed yet and the Mac app is not notarized, so Windows SmartScreen and macOS Gatekeeper warn the first time. That warning alone does not mean the file is bad, but it is exactly why you should compare the checksum.

## Plugins and themes

The gallery in **Settings › Plugins & themes** comes from `plugins/registry.json` in this repository. The list is signed with an Ed25519 key that only the maintainer holds; the app has the public key built in and refuses a list whose signature does not match. Each file is then checked against the SHA-256 in that signed list before it runs. On the few browsers that cannot check Ed25519 signatures yet, the app falls back to the checksum check alone and says so.

A plugin added from a link is not reviewed. The app shows "This plugin can read your keys" and runs it only after you say yes. Plugins run inside the app and can read what the app can, including your debrid keys, so only add one from someone you trust.

## Notes

- The Supabase publishable key in the app is public by design. Row-level security keeps each user's row private.
- Never post your debrid keys, account passwords or addon links with keys in an issue.
