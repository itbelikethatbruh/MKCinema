# Run MKCinema on your own server

MKCinema works straight from [app.mkcinema.app](https://app.mkcinema.app) and needs no server. If you'd rather run your own copy at home (a NAS, a mini PC, an Unraid or Synology box), one container gives you the web app plus the companion server:

- the full web app, the same build as the hosted one
- a stream proxy for sources that need special headers, and plain `http://` TV playlists in the browser
- audio rescue: Dolby, DTS and TrueHD sound converted on the fly so browsers can play it (ffmpeg is included)
- a relay for debrid services that browsers can't reach directly

Nothing is preinstalled: no addons, sources, channels or keys. You add your own, as in the hosted app.

## Start it

```sh
docker run -d --name mkcinema --restart unless-stopped -p 7000:7000 \
  -e PROXY_TOKEN=pick-a-long-random-word \
  ghcr.io/itbelikethatbruh/mkcinema:latest
```

Then open `http://<server address>:7000/t/pick-a-long-random-word/` once in each browser. It remembers the word, so after that `http://<server address>:7000/` is enough.

With Docker Compose, use the [`compose.yaml`](../compose.yaml) in this repository: change `PROXY_TOKEN`, then `docker compose up -d`.

The image runs on 64-bit Intel/AMD and ARM (Raspberry Pi 4 and newer, Apple silicon).

## Settings

| Variable | What it does |
|---|---|
| `PROXY_TOKEN` | A shared secret. The proxy, audio rescue and relay only answer pages that know it. Strongly recommended. |
| `PORT` | Listen port inside the container (default 7000). |
| `PUBLIC_URL` | The address people use when the server sits behind a reverse proxy, for example `https://mkcinema.example.com`. |
| `PROXY_ALLOW_PRIVATE=1` | Lets the proxy reach addresses on your own network, such as Jellyfin, Plex or a local addon. |
| `PROXY_ALLOW_HOSTS` | Optional list of the only hosts the proxy may reach, separated by commas. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Point sign-in and sync at your own Supabase project instead of MKCinema's. |

## Updating

`docker pull ghcr.io/itbelikethatbruh/mkcinema:latest` and recreate the container (`docker compose pull && docker compose up -d`). Your library and settings live in each browser or in your MKCinema account, not in the container, so nothing is lost.

## Use it from the apps

In any MKCinema app, open **Settings › Streams & addons › MKCinema proxy URL** and enter `http://<server address>:7000/t/<PROXY_TOKEN>`. The app then sends header-locked streams and audio rescue through your server.

## Safety

- Keep `PROXY_TOKEN` set when the server can be reached from outside your home.
- Put it behind HTTPS (a reverse proxy such as Caddy or Nginx Proxy Manager) before opening it to the internet.
- The proxy refuses private-network addresses unless you set `PROXY_ALLOW_PRIVATE=1`.
