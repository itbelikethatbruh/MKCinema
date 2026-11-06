# Addon looks: let your Stremio addon shape how it shows in MKCinema

MKCinema 2.42 lets a Stremio addon choose how its own content looks: the style of its rows, where its catalogs live
(Home, Discover or Library), small badges on its posters, and info panels on the film page.

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

The standard Stremio `posterShape` on metas (`square`, `landscape`) is honoured too, for every addon.

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

## Rules

- Plain text only. Markup is shown as text, never run.
- Unknown fields and values are dropped silently; anything over a limit is cut or dropped.
- The `mkcinema` object may be at most 16 KB per manifest and per meta.
- Images and links must be `https://`.
- Viewers can turn your looks off per addon in Settings › Appearance › Addon looks. Your catalogs keep working as plain
  rows.
- The version number lets the format grow. Version 1 apps ignore fields they don't know.

## Questions

Open an issue on this repository. If you ship it in your addon, tell us and we'll list it here.
