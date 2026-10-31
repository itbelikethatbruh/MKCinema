# MKCinema for LG webOS

A hosted web app that opens https://mkcinema.pages.dev full screen on LG TVs (webOS 4 or later).

Build: `npx @webos-tools/cli ares-package webos -o site/download` from the repo root makes `com.mkcinema.app_1.1.0_all.ipk`.

Installing needs the TV in Developer Mode (LG Developer Mode app, an LG developer account, and `ares-install`) or a rooted TV with Homebrew Channel. Normal users can only get webOS apps through the LG Content Store, which needs an LG Seller Lounge account and LG's review.

Bump `version` in appinfo.json for each release.
