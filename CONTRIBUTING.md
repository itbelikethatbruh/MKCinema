# Contributing to MKCinema

Thanks for helping make MKCinema better. A few guidelines keep the project healthy.

## Before you start

- **Search first.** Check [existing issues](https://github.com/itbelikethatbruh/MKCinema/issues) before opening a new one.
- **Discuss big changes.** Open an issue describing a large feature or redesign before you write the code.
- **Security problems** go through [SECURITY.md](SECURITY.md), never a public issue.

## Ground rules

These are product decisions, and pull requests that break them won't be merged:

1. **No built-in content.** MKCinema ships no titles, streams, demo sources or links to pirated material. The only built-in source is official trailers. Content always comes from addons the user installs.
2. **Users bring their own keys.** Never ship anyone's addon config, debrid key or account. Keys stay in the user's browser and their own account row.
3. **Privacy first.** No tracking, profiles or outside AI services, and no new measurement. MKCinema counts anonymous visits with Cloudflare Web Analytics (page, referring site, browser, country and load speed; no cookies or IDs), and it never sees your addons, keys or what you watch. In the app you can turn it off in Settings › Data. Your Picks runs on the device.
4. **Do not cover or strip YouTube's player branding or ads** in trailers.
5. **Five looks, Noir by default.** Noir (black, graphite and platinum type), Midnight, Velvet, Sepia and Anime (early access), plus the colour wheel (Atelier), which recolours the same tokens. Colours come from theme tokens (`var(--nXXXXXX, fallback)`), so new CSS should use those instead of hard-coded neutrals. Video surfaces stay true black in every theme. No interface sounds. Animations use `transform` and `opacity` only. Avoid `backdrop-filter` and `preserve-3d` inside scrolling rows (they cause black tiles on Android Chrome).
6. **Phones are first-class.** Test at 390 px wide on Android Chrome. Nothing may scroll sideways.

## Making a change

1. Fork the repo and create a branch: `git checkout -b fix/short-description`.
2. Make your change in the matching folder (`app/`, `site/`, `android/`, `webos/`, `windows/`, `mac/` or `linux/`). README artwork lives in `.github/readme/`: edit `generate.py` and run it rather than editing the SVGs by hand.
   For the web app, see [How the web app is organised](#how-the-web-app-is-organised) below.
3. Test it. For the web app, run `node app/mkcinema-server.js` and check desktop and phone widths. For a native app, build it with the steps in the [install guide](docs/install.md#build-from-source).
4. Write clear commit messages: a short summary line, then what changed and why.
5. Open a pull request and fill in the template.

## How the web app is organised

The web app ships as one page, `app/index.html`, made of classic `<script>` and `<style>` blocks that share globals and run in order. To make it readable, the same content lives in `src/app/`, one file per block:

- `src/app/index.html` is the page, with a `@@src:js/<name>.js@@` marker where each block goes.
- `src/app/js/` and `src/app/css/` hold the blocks. Their order is the order of the markers.

Both stay byte-for-byte identical, and CI fails if they don't:

```sh
node tools/web-src.mjs build   # after editing files in src/app/
node tools/web-src.mjs split   # after editing app/index.html directly
node tools/web-src.mjs check   # what CI runs
```

**Change code where it is defined.** To change how a function behaves, edit that function in its own file. Don't add a new block later in the page that saves the old function and replaces it with a wrapper. Wrappers stack up, run in an order that is hard to see, and break each other: one wrapper that returns a new array or swallows an argument quietly turns off every wrapper outside it. If several features need to react to the same moment (Home drawn, player closed), add one clearly named hook in the base function and have each feature register with it.

New features that are only used on demand (a full-screen page, a settings tool) should keep their code in their own block and do their setup when they are first opened, not at startup.

## License

By contributing, you agree that your contributions are licensed under the [GPL-3.0](LICENSE). The additional terms in [NOTICE](NOTICE) (author credit, marking changes, and the MKCinema name and logo) apply to the whole project.
