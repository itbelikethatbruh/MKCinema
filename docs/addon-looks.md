# Addon looks: let your Stremio addon shape how it shows in MKCinema

MKCinema lets a Stremio addon choose how its content looks: the style of its rows, where its catalogs live (Home,
Discover or Library), small badges on its posters, and info panels on the film page (2.42). A ratings or info addon can
add badges and panels to **any** title, including a badge next to every episode, and an addon can keep a copy of the
viewer's watchlist (2.44).

You add one optional `mkcinema` object to the JSON you already serve. Stremio and other apps ignore unknown fields, so
nothing changes for them. MKCinema validates every value and draws everything with its own components, in the theme
the viewer picked, and the TV remote reaches every part of it. You send data, never HTML, CSS, scripts or colours.

Try it: install `https://app.mkcinema.app/addons/showcase/manifest.json` (a catalog-only example that uses every
field below) and look at its rows, posters, film pages and its Library tab.

## 1. Rows and placement (manifest)

```json
{
  "id": "com.example.lists",
  "catalogs": [
    { "type": "movie", "id": "top", "name": "Top 10 this week" },
    { "type": "series", "id": "wide", "name": "New episodes" },
    { "type": "movie", "id": "mine", "name": "My list" }
  ],
  "mkcinema": {
    "version": 1,
    "catalogs": [
      { "type": "movie", "id": "top", "layout": "top10" },
      { "type": "series", "id": "wide", "layout": "landscape" },
      { "type": "movie", "id": "mine", "layout": "square", "place": "library" }
    ]
  }
}
```

Each entry matches a catalog by `type` and `id`.

| Field | Values | What it does |
| --- | --- | --- |
| `layout` | `poster` (default), `landscape`, `square`, `top10` | Row style on Home. `landscape` uses the meta's `background`. `top10` puts big numbers next to the first ten posters. |
| `place` | `home` (default), `discover`, `library` | `discover` keeps the catalog off Home (still in Discover and search). `library` shows it as its own tab in Library instead of a Home row. |

Viewers can also pin any catalog as a Library tab themselves (Library › Add from addons), with no addon change.

Without a `mkcinema` field, MKCinema still honours the standard Stremio `posterShape` on metas (`square`,
`landscape`) and `"showInHome": false` on a catalog (it then stays in Discover), on Home and on Discover pages.

## 2. Poster badges (metas in catalog responses)

```json
{ "id": "tt0111161", "type": "movie", "name": "The Shawshank Redemption",
  "mkcinema": { "badges": [ { "text": "9.3", "tone": "gold", "icon": "star" }, { "text": "New", "tone": "green" } ] } }
```

| Field | Values |
| --- | --- |
| `text` | Up to 10 characters. Plain text. |
| `tone` | `plain` (default), `gold`, `green`, `red`, `blue`. Drawn in the viewer's theme. |
| `icon` | Optional: `star`, `award`, `trophy`, `flame`, `heart`, `check`, `clock`, `tv`, `film`, `sparkles`. |

At most 2 badges per poster. They sit in a fixed corner and step aside while the poster's own info shows.

## 3. Film-page panels (metas in catalog or meta responses)

```json
"mkcinema": {
  "panels": [
    { "kind": "ratings", "title": "Scores", "items": [ { "source": "IMDb", "score": "9.3" }, { "source": "Letterboxd", "score": "4.6" } ] },
    { "kind": "facts", "title": "At a glance", "items": [ { "label": "Budget", "value": "$25M" } ],
      "links": [ { "label": "Full stats", "url": "https://example.com/tt0111161" } ] },
    { "kind": "list", "title": "Watch next", "items": [ { "id": "tt0068646", "type": "movie", "name": "The Godfather", "poster": "https://..." } ] },
    { "kind": "text", "title": "Why it's here", "text": "Short plain text." }
  ]
}
```

Panels show on the film page under a "From <your addon name>" heading.

| `kind` | `items` | Limits |
| --- | --- | --- |
| `ratings` | `{ source, score }` | 8 items, 24 / 12 characters |
| `facts` | `{ label, value }` | 12 items, 24 / 80 characters |
| `list` | `{ id, type, name, poster }` | 20 items; `type` is `movie` or `series`; they open in MKCinema |
| `text` | `text` instead of `items` | 600 characters |

Every panel takes an optional `title` (40 characters) and up to 4 `links` (`{ label, url }`, https only). Links show
their website and open after a second press.

At most 3 panels per title. Panels in a catalog meta carry over to the film page when it is opened from your catalog, so a catalog-only addon can use them.

## 4. Ratings and info on any title (enrichment)

For an addon whose job is information about titles it doesn't list itself: ratings, age ratings, awards, anime filler
flags. No more ratings disguised as fake entries in the stream list.

```json
"mkcinema": {
  "version": 1,
  "enrich": { "types": ["movie", "series"], "idPrefixes": ["tt"], "posters": true, "details": true }
}
```

Your manifest still needs at least one normal resource (for example `"resources": ["stream"]` that answers
`{ "streams": [] }`) so other apps accept it.

MKCinema asks the viewer once, in plain words, whether your addon may do this ("It will see the ids of the titles you
browse and open, sent to <your host>"). Nothing is requested before they press Allow.

**Film pages** (`details`, on by default). When a title in your `types` and `idPrefixes` opens:

`GET {your addon URL}/mkcinema/meta/{type}/{id}.json`

```json
{
  "badges": [ { "text": "IMDb 9.5", "tone": "gold", "icon": "star" }, { "text": "TV-MA" } ],
  "panels": [ { "kind": "ratings", "title": "Ratings", "items": [ { "source": "IMDb", "score": "9.5" }, { "source": "Votes", "score": "2.3M" } ] } ],
  "episodes": {
    "tt0903747:1:1": [ { "text": "9.0", "tone": "gold", "icon": "star" } ],
    "tt0903747:1:2": [ { "text": "8.6", "tone": "gold", "icon": "star" } ]
  }
}
```

`badges` show under the credits, `panels` as in section 3, and `episodes` puts up to 2 badges next to each episode
in the episode list, keyed by the video id the meta addon uses (Cinemeta: `tt…:season:episode`). Up to 1,000
episodes, 64 KB per answer.

**Posters** (`posters: true`). For the posters on screen, MKCinema asks in batches of up to 40:

`GET {your addon URL}/mkcinema/badges/{type}/{id},{id},{id}.json`

```json
{ "badges": { "tt0111161": [ { "text": "9.3", "tone": "gold", "icon": "star" } ], "tt0068646": [ { "text": "9.2", "tone": "gold", "icon": "star" } ] } }
```

Ids you don't know can be left out. Answers are cached for 6 hours, so send a normal `Cache-Control` too.

## 5. A copy of the watchlist (library)

```json
"mkcinema": { "version": 1, "library": { "push": true } }
```

After the viewer allows it ("It will receive the title, type and id of each film or series on your watchlist"),
MKCinema sends:

`POST {your addon URL}/mkcinema/library` with a plain-text JSON body:

```json
{ "event": "replace", "items": [ { "id": "tt0111161", "type": "movie", "name": "The Shawshank Redemption" } ] }
```

`replace` comes once with the whole watchlist, then `add` or `remove` with one item as the viewer changes it. It is
sent as `text/plain` so no CORS preflight is needed; MKCinema does not read your answer. Use a per-user addon URL (a
token in the path, as configurable addons already do) to know whose list it is. Serve the list back as a catalog with
`"place": "library"` and it shows as a Library tab.

## 6. Checking your addon

Install it, then open Settings › Appearance › Addon looks › **Check**. MKCinema lists what it took from your manifest,
your first catalog and your `/mkcinema/` answers, and every value it dropped or cut, with the reason.

## A small enrichment addon in Node

```js
const http = require('http');
const rating = (id) => lookUp(id); // your data: { score: '8.7', votes: '1.2M' } or null
const json = (res, o) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=21600' }); res.end(JSON.stringify(o)); };
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]); let m;
  if (u === '/manifest.json') return json(res, { id: 'org.example.ratings', version: '1.0.0', name: 'Example Ratings',
    resources: ['stream'], types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: [],
    mkcinema: { version: 1, enrich: { types: ['movie', 'series'], idPrefixes: ['tt'], posters: true } } });
  if (u.startsWith('/stream/')) return json(res, { streams: [] });
  if ((m = u.match(/^\/mkcinema\/badges\/(movie|series)\/(.+)\.json$/))) {
    const out = {}; for (const id of m[2].split(',')) { const r = rating(id); if (r) out[id] = [{ text: r.score, tone: 'gold', icon: 'star' }]; }
    return json(res, { badges: out });
  }
  if ((m = u.match(/^\/mkcinema\/meta\/(movie|series)\/(.+)\.json$/))) {
    const r = rating(m[2]); if (!r) return json(res, {});
    return json(res, { badges: [{ text: `IMDb ${r.score}`, tone: 'gold', icon: 'star' }], panels: [{ kind: 'ratings', title: 'Ratings', items: [{ source: 'IMDb', score: r.score }, { source: 'Votes', score: r.votes }] }] });
  }
  res.writeHead(404); res.end();
}).listen(7000);
```

## Rules

- Plain text only. Markup is shown as text, never run.
- Unknown fields and values are dropped silently; anything over a limit is cut or dropped.
- The `mkcinema` object may be at most 16 KB per manifest and per meta; `/mkcinema/meta` answers 64 KB, `/mkcinema/badges` answers 128 KB.
- Images and links must be `https://`.
- Viewers can turn your looks off per addon in Settings › Appearance › Addon looks, and answer the two questions
  (add to titles, copy of the watchlist) again there. Your catalogs keep working as plain rows.
- The version number lets the format grow. Version 1 apps ignore fields they don't know.

## Questions

Open an issue on this repository. If you ship it in your addon, tell us and we'll list it here.
