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
3. **Privacy first.** No analytics, tracking or outside AI services. Your Picks runs on the device.
4. **Do not cover or strip YouTube's player branding or ads** in trailers.
5. **One theme: Noir.** Matte black, graphite and platinum type. No interface sounds. Animations use `transform` and `opacity` only. Avoid `backdrop-filter` and `preserve-3d` inside scrolling rows (they cause black tiles on Android Chrome).
6. **Phones are first-class.** Test at 390 px wide on Android Chrome. Nothing may scroll sideways.

## Making a change

1. Fork the repo and create a branch: `git checkout -b fix/short-description`.
2. Make your change in the matching folder (`app/`, `site/`, `android/`, `windows/`, `mac/` or `linux/`).
3. Test it. For the web app, run `node app/mkcinema-server.js` and check desktop and phone widths. For a native app, build it with the steps in the [README](README.md#build-from-source).
4. Write clear commit messages: a short summary line, then what changed and why.
5. Open a pull request and fill in the template.

## License

By contributing, you agree that your contributions are licensed under the [GPL-3.0](LICENSE).
