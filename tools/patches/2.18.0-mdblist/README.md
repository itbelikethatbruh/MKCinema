# MKCinema 2.18.0: MDBList lists as Home rows

Settings › Home › MDBList lists:
- Users paste their free MDBList API key, then add up to 10 list links (`mdblist.com/lists/user/list-name`).
- Each list becomes a Home row after the curated rows and before the addon catalogs. Each row is titled with the list name and labelled "MDBList".
- Items are IMDb titles, so Cinemeta and stream addons know them. Movies/Series focus is respected.
- Lists are saved in `homeLayout.mdb`, so they follow the account. The key is in `Keys.mdblist`, synced like the TMDB key.
- Each list is cached for 6 hours (Store `mdbCache`).

**Why a key is required:** on 2026-11-05 a networked thread checked the headers:
- `mdblist.com/lists/…/json` returns 200 but sends no CORS header, so browsers block it.
- `api.mdblist.com/lists/…/items` sends `access-control-allow-origin: *` but needs `apikey`.

## Ship

```
python3 -I patches/2.18.0-mdblist/patch.py <copy of mkcinema>
```

- It can run in any order with 2.15, 2.16 and 2.17.
- It sets 2.18.0 unless the base is higher.
- Its UI strings are in the 2.15.0 language lists.

## Tested

`node test.js <outdir>`, with the build on localhost:8801 and MDBList mocked:
- link parsing (5 forms)
- no-key message
- add, and the 404 message
- the row shows the API items in rank order
- 6-hour cache (no new request on re-render)
- remove
- no page errors

It also passes together with the 2.15 and 2.17 tests on a combined build.

**Not verified live:** the exact JSON shape of `api.mdblist.com/lists/{user}/{list}/items`. The code accepts `{movies, shows}`, `{items}` or an array. Check it with one real key after deploy.
