# MKCinema for Samsung TVs (TizenBrew)

Samsung only installs apps from its own store, so MKCinema runs on Samsung TVs through
[TizenBrew](https://github.com/reisxd/TizenBrew), a free community app loader. This folder is the TizenBrew module.
It opens https://mkcinema.pages.dev on the TV and registers the remote's media keys. The web app does the rest
(TV layout, remote navigation, Back, the exit prompt).

## Install (one time, about 10 minutes, needs a computer on the same Wi-Fi)

1. On the TV, open **Apps**, press **1 2 3 4 5** on the remote, turn **Developer mode** on, and type your
   computer's IP address. Restart the TV.
2. On the computer, download **TizenBrew Installer** from
   https://github.com/reisxd/TizenBrewInstaller/releases/latest, open it and install TizenBrew to the TV.
   Samsung TVs from 2023 on (Tizen 7+) ask you to sign in to a Samsung account in the installer to sign the app.
3. On the TV, open **TizenBrew**, go to **Module manager**, pick **Add GitHub module** and type:

   ```
   itbelikethatbruh/mkcinema@main/tizen
   ```

4. MKCinema now shows in TizenBrew. Open it and sign in. TizenBrew can also launch it straight away on start
   (TizenBrew settings, Autolaunch).

Updates need nothing: every launch loads the current MKCinema from the web.

## Which TVs

Samsung TVs from **2023 or newer** (Tizen 7 and later). Older Samsung TVs have a browser engine that is too old
for MKCinema's layout. Playback uses the TV's own video engine through the web player, so what plays depends on
the TV. For files the TV can't play, use VLC on another device or the phone remote's "Listen on phone".

## Files

- `package.json`: the module (type `mods`, opens `websiteURL`, registers `keys`).
- `userScript.js`: runs in the page after it loads.
