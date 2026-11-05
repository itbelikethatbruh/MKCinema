# MKCinema 2.17.0: AniList sync

Settings › Trakt, Simkl & AniList now has an **AniList** group.

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

MyAnimeList is not in this patch. Its API does not allow browser calls (no CORS), so it needs a relay. That is Drake's decision.
