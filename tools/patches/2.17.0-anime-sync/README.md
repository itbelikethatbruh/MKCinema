# MKCinema 2.17.0: AniList and MyAnimeList sync

Settings › Trakt, Simkl, AniList & MAL now has an **AniList** group and a **MyAnimeList** group. Both work the same way for progress and import.

- **Progress:** an anime episode or film counts once it passes 80 %, the same point Trakt and Simkl use. At that moment its AniList entry moves to that episode. It becomes Watching, or Completed at the last episode.
  - Progress is never lowered. Planning entries become Watching.
- **IDs:** anime addons send Kitsu or MAL ids, and those map directly (Kitsu → MAL through Kitsu's mappings). Cinemeta IMDb ids for animated series go through ARM plus Jikan, the same path AniSkip uses for skip times.
- **Import my list:** Watching, Planning and Rewatching entries are added to the MKCinema watchlist. It uses the IMDb id when ARM knows one, otherwise `kitsu:ID`. Entries with neither are skipped.
- **Sign-in:** each user brings their own free AniList client (like Trakt), with redirect URL `https://anilist.co/api/v2/oauth/pin`. MKCinema opens the approval page, AniList shows a token, and the user pastes it in.
  - On TV the approval page is a QR code, and the token is pasted with the phone remote's keyboard.
  - The token stays on the device (Store `anilist`, not synced to the account).
- **Expired token:** a 401 signs the user out with "AniList signed you out. Connect again."

## Ship

```
python3 -I patches/2.17.0-anime-sync/patch.py <copy of mkcinema>
```

- It can run in any order against the 2.15.0 languages and 2.16.0 subtitles/support patches.
- It sets 2.17.0 unless the base is already higher.
- Its UI strings are already in the 2.15.0 language lists.

## Tested (Chromium, AniList/Kitsu/ARM mocked: this sandbox cannot reach them)

`node test.js <outdir> [tv]` against the build on localhost:8801. These all pass on desktop and on a Fire TV user agent:

- connect and paste the token (full pin URL accepted)
- Kitsu episode through the real 80 % hook → progress 5, CURRENT
- lower episode → no write
- IMDb anime, last episode → COMPLETED
- non-anime → no calls
- import → 2 of 3 added (one IMDb, one Kitsu)
- 401 → signed out

**Not verified live:** the real AniList pin page and the token format. That needs one real sign-in after deploy.

## MyAnimeList

MAL's API and token endpoint send no CORS headers, so every MAL call goes through the Supabase Edge Function `mal-relay`
(Drake chose "Small relay on Supabase", 2026-11-05). It is **already deployed** on project wogffhgdixgrayowewnf (verify_jwt off);
source in `mkcinema/supabase/functions/mal-relay/index.ts`. It only answers MKCinema origins (mkcinema.pages.dev and its
subdomains, localhost), only forwards api.myanimelist.net/v2/* and myanimelist.net/v1/oauth2/token, and stores and logs nothing.

- **Sign-in:** each user creates their own MAL API client (App Type "other", redirect `https://mkcinema.pages.dev/`) and
  pastes the client ID. OAuth2 with PKCE (plain), no client secret.
  - On mkcinema.pages.dev the page goes to MAL and comes back with `?code&state`; `Mal.boot()` finishes it and cleans the address.
  - Anywhere else (desktop apps, localhost) MAL opens in a new window and the user pastes the address it lands on.
  - TV: QR code; the phone approves and lands on pages.dev, which says to paste that address into the TV's box (phone remote keyboard).
  - Token and refresh token stay on the device (Store `mal`). Expired tokens refresh once; a refused refresh signs out.
- **Progress:** GET `/anime/{id}?fields=num_episodes,my_list_status`, then PATCH `my_list_status` with `num_watched_episodes`
  and watching/completed. Never lowered, capped at the show's episode count, rewatching kept.
- **Import:** Watching and Plan to Watch, mapped through ARM `source=myanimelist`.

`node maltest.js <outdir> [tv]` (relay + MAL mocked) passes on desktop and Fire TV: missing client ID, authorize URL
(plain PKCE, state, redirect), wrong state refused, paste-finish, Kitsu episode → 5 watching, no lowering, last episode →
completed, import 2 of 3, 401 → refresh → retry, refused refresh → signed out, `?code&state` return on load.

**Not verified live:** the real MAL sign-in and the relay from pages.dev (this sandbox cannot reach either). Needs one real sign-in after deploy.
