# Older-TV build (`tv-legacy.html`)

Samsung TVs from 2019-2022 (Tizen 5-6) and LG TVs from 2020-2021 (webOS 5-6) have browsers based on Chromium 63-87.
The web app needs Chromium 88 or newer, so on those TVs it would not start, or would start with broken layout.

This tool makes a converted copy of the finished web app for them. The main `index.html` is not converted, so phones,
computers and newer TVs keep exactly the same app.

## Run it at every web release

After all patches are applied to the web folder, and before deploying:

```bash
cd tools/legacy-tv && npm ci
node build.js /path/to/web --inject
```

It writes:

- `tv-legacy.html`: the converted app.
- `vendor/legacy/supabase.js`, `vendor/legacy/lucide.min.js`: converted copies of the two CDN libraries that use
  newer syntax, pinned by their own sha384 hash.
- With `--inject`: a small check at the top of `index.html` (`<script id="mkc-legacy-tv">`) that sends older TV
  browsers to `tv-legacy.html`. It only acts on TV browsers (Tizen, webOS and similar) without `aspect-ratio`
  support (Chromium < 88), never inside the Android TV app, and `?modern` in the address skips it.

The build stops with an error if any script in the result still has syntax that Chromium 63 cannot read.

## What it converts

| Problem on Chromium 63-87 | Fix |
|---|---|
| `?.`, `??`, class fields, object spread, `catch {}` | esbuild lowers the syntax |
| `\p{L}` in regular expressions (Chromium 64) | regexpu spells the characters out |
| `Array.flat`, `Object.fromEntries`, `Promise.allSettled`, `matchAll`, `AbortController`, `Blob.stream`, `DecompressionStream`, ... | `polyfills.js` (core-js, fflate, small shims) |
| `inset`, logical properties, colour mixing, CSS nesting | lightningcss |
| `:focus-visible` (Chromium 86) | becomes `:focus`: a TV is always driven by keys |
| `:is()`, `:where()`, `:not(a, b)` (Chromium 88) | spelled out into plain selectors |
| `min()`, `max()`, `clamp()` (Chromium 79) | a fixed fallback worked out for a 1920x1080 screen |
| `dvh` units | `vh` |
| `gap` in grid layouts (Chromium 66) | `grid-gap` added |
| `gap` in flex layouts (Chromium 84) | `layout.js` adds the same space as margins, at runtime |
| `aspect-ratio` (Chromium 88) | `layout.js` sets the height from the width, at runtime |
| `<button>` as a grid container (Chromium 83) | `layout.js` moves the button's children into a grid `<span class="mkc-bg">`; build.js adds `button > .mkc-bg > child` selectors |
| `var()` next to an unsupported function (the whole declaration fails when computed, wiping out any fallback) | the value is replaced, not given a fallback; values that cannot be worked out are dropped so earlier rules apply |

Not converted: `:has()` rules (dropped), `backdrop-filter` (no blur), the individual `translate`/`scale` properties,
and CSS that the app writes at runtime (themes, plugins). Samsung TVs from 2018 (Chromium 56) have no CSS grid at
all and are not supported.

## Testing

Tested in a real Chromium 68 (the engine of LG webOS 5 and close to Samsung Tizen 5.5) from Google's snapshot archive,
under Xvfb, driven over the DevTools protocol with a webOS user agent: the redirect, setup tour, Home, rows, remote
navigation, the film page and episode list all work with no script errors. Not yet tried on a real TV.
