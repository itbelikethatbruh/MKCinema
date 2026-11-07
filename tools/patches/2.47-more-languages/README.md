# MKCinema 2.47: Tamil, Telugu, Bengali, Malayalam and Samoan

Adds five interface languages to Settings › Appearance › Language. "Match this device" picks them up automatically.

## Ship

```
python3 -I build.py                      # only if src/ changed; rebuilds i18n/*.json
python3 -I patch.py <mkcinema folder>    # idempotent; copies i18n/{ta,te,bn,ml,sm}.json next to index.html
```

- It adds one What's new line under the current APP_VERSION and does not change the version.
- The deploy must include the five new `i18n/*.json` files. The service worker already caches any `i18n/<code>.json`.

## What changes

- `<head>`: the early fetch of the language file knows the five new codes.
- `I18N.langs`: தமிழ், తెలుగు, বাংলা, മലയാളം, Gagana Samoa.
- The Hindi-only Devanagari font helper is now `I18N.SCRIPT` + `deva()`. It adds Noto Sans Devanagari, Tamil, Telugu,
  Bengali or Malayalam to every web font, for that script's range only, with local fallbacks. `[data-deva]` text gets
  `letter-spacing:0`. Samoan uses Latin letters and needs no font.
- About & licenses: the Stremio MIT block now also credits stremio-translations, with a link.

## Sources

- `src/en.json` lists the 890 English strings the existing languages use. `src/<code>.tsv` holds `index<TAB>translation`.
- `src/ta.shared.json` and `src/bn.shared.json` hold the human translations from stremio-translations
  (MIT, commit in `src/shared-source-commit.txt`) for strings with the same English text. `build.py` uses them
  except where the wording doesn't fit MKCinema's meaning (`SKIP_SHARED`). That's 54 Tamil and 57 Bengali strings.
  Telugu has only 2 strings there, and Malayalam and Samoan have none.
- Everything else is machine-drafted and needs review by native speakers. Samoan has the least source material, so it needs the most review.

## Limits

- These are the same 890 strings as the 2.15 languages. UI text added since then stays English in every language,
  which includes Get started, parts of Appearance, and Account deletion. About 200 strings would fill that gap.
- Strings over 400 characters are skipped by the translation layer (one trailer-help paragraph).

## Tested (Chromium, scratch copy of 2.46.5)

- Desktop 1440×900 for all five languages, plus a Pixel 7 for Tamil, Malayalam and Bengali. No page errors.
  Each language had 890 strings loaded and the right Noto font in `#mkc-deva`. The text renders with no boxes and no overflow in the settings rows.
