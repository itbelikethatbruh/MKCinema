# Subtitle translation service (`subs.mkcinema.app`)

A small Cloudflare Worker that translates subtitle lines for browsers that have no built-in Translator
(Firefox, Safari, the Android and TV apps). Chrome and Edge translate on the device and never call it.

- `POST /translate` with `{ "from": "en", "to": "pt-BR", "lines": ["…"] }` returns `{ "lines": ["…"] }`
  (a line that could not be translated comes back as `null`, and the app keeps the original).
- Model: `@cf/google/gemma-4-26b-a4b-it` on Workers AI, thinking off.
- Limits: 60 lines and 6,000 characters per call, 30 calls a minute per IP, CORS for `https://app.mkcinema.app`
  and `https://mkcinema.pages.dev` only.
- Runs on the Workers Free plan. When the daily Workers AI allowance is used up, the Worker answers `503 {"error":"busy"}`
  and the app keeps the original lines and tries again later. Results are cached by their text for 30 days.

## Deploy

Worker name `mkcinema-subtitles`, main module `worker.js`, bindings:

```json
[
  { "type": "ai", "name": "AI" },
  { "type": "ratelimit", "name": "RL", "namespace_id": "7391", "simple": { "limit": 30, "period": 60 } }
]
```

Custom domain: `subs.mkcinema.app` (zone `mkcinema.app`).
