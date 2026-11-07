# MKCinema for LG webOS

A hosted web app that opens https://mkcinema.pages.dev full screen on LG TVs (webOS 5 or later, 2020 models on; TVs older than webOS 22 get the converted app in `tv-legacy.html`, an early beta).

Build: `npx @webos-tools/cli ares-package webos -o site/download` from the repo root makes `com.mkcinema.app_1.1.0_all.ipk`. Packages are not committed: upload the .ipk to the website and attach it to the GitHub release.

Installing needs the TV in Developer Mode (LG Developer Mode app, an LG developer account, and `ares-install`) or a rooted TV with Homebrew Channel. Normal users can only get webOS apps through the LG Content Store, which needs an LG Seller Lounge account and LG's review.

Bump `version` in appinfo.json for each release.

## Homebrew Channel

`homebrew-channel.yml` is the listing for the webOS Homebrew Channel (rooted LG TVs). `com.mkcinema.app.manifest.json`
is published next to the .ipk on the download site (site/download/) and must carry the .ipk's version and SHA-256:
update both whenever the .ipk changes. To list the app, open a pull request to https://github.com/webosbrew/apps-repo
adding `packages/com.mkcinema.app.yml` with that content. Their rules require the submitter to disclose AI use.
