# MKCinema plugins and themes

This folder is the gallery shown in **Settings › Plugins & themes**. The app only installs files listed in
`registry.json`, from this folder, and checks each file's SHA-256 before running it.

- `themes/*.css`: a stylesheet added after MKCinema's own styles.
- `scripts/*.js`: a plugin. It runs with one argument, `MK`:
  - `MK.on(event, fn)` with `view`, `detail`, `play`, `pause`, `resume`, `close`
  - `MK.toast(text, kind)`, `MK.css(text)`, `MK.get(key, default)`, `MK.set(key, value)`
  - `MK.app` (web app version), `MK.tv`, `MK.touch`

## Submitting one

Open a pull request that adds your file and its entry in `registry.json` (run `python3 build_registry.py`, which
fills in the checksums). Plugins can read everything the app can, so every submission is reviewed line by line
before it is merged. No trackers, no remote code loading, no network calls except to the service the plugin is about.
