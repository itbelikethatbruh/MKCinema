# MKCinema 2.15.0: interface languages

Adds Spanish, Portuguese (Brazil), French, German, Italian and Hindi to menus, buttons, settings and help text.
The setting lives in Settings › Appearance › Language. "Match this device" is the default, and it follows the phone, TV or browser language.
Titles, descriptions, stream names and subtitles come from addons and are never translated.

## Ship

The plan is to ship it together with the subtitles/support patch (2.16.0) as one build:

```
python3 -I patches/2.15.0-languages/patch.py <copy of mkcinema>   # order vs. 2.16.0 does not matter
```

- On a 2.14.x base it sets 2.15.0. On a base at 2.15.0 or later it keeps that version.
- It writes `i18n/*.json` next to index.html. The deploy must include that folder.

## How it works

`i18n.js` runs as the `mkc-215` block.
- It looks up each piece of visible text (text nodes plus placeholder, aria-label and title) by exact match in `i18n/<code>.json` and swaps it in place.
- A MutationObserver handles anything drawn later.
- The app's code is untouched and keeps working in English underneath.
- `i18nEn(el)` returns the original English for the few checks that read text back. The four "My watchlist" / "Continue watching" checks in Library use it.

Sources:
- `src/en.json` is the English list, and `src/<code>.tsv` holds the matching `index<TAB>translation` lines.
- A missing index stays English. Brand names (X-Ray, Studio, Smart Play, Peak Cinema…) are left out on purpose.

## Limits

- Sentences built from pieces (with a number, a name or inline code) stay English. Examples: "2 addons answered · 1 stream", the Addon Studio help, toasts with numbers, and the license list.
- New strings added in later releases stay English until they are added to `src/en.json` and the TSVs.
- The translations are machine-drafted. A native speaker should review them, especially the long help texts.

## Tested (Chromium, scratch build)

- es-ES, fr-FR and en-US desktop, plus pt-BR on a Fire TV user agent.
- Navigation, rows and settings are translated. Card titles, hero titles and descriptions stay as the addon sent them.
- Switching to German from Settings reloads in German.
- hi-IN on desktop, a Fire TV user agent and a Pixel 7 (`shots/phone-hi.js`): 0 leftover English strings from the list, no errors.

## Hindi

- Added 2026-11-05 at Drake's request (many Indian users from Reddit). Machine-drafted, so a native speaker should review it.
- The app's fonts have no Devanagari letters. In Hindi, `I18N.deva()` adds Noto Sans Devanagari (Google Fonts) to every web
  font the app loads, for the Devanagari range only, with local Noto / Nirmala UI / Kohinoor fallbacks. Latin text keeps its font.
- Translated Hindi text gets `letter-spacing:0` (`[data-deva]`), because tracking pulls Devanagari letters apart.
- The MKCinema logo (`.brand`, `.sd-brand`) is skipped in every language. Before this fix it showed "MK Kino" / "MK Cine".
- `i18nEn` returns "My watchlist" for "Meine Merkliste".
- The service worker caches `i18n/<code>.json`.
- No page errors. Translating 3000 new nodes takes about 15 ms.

Screenshots and the test scripts are in `shots/`.
