#!/usr/bin/env python3
"""Builds the Addon looks showcase: a static Stremio catalog addon (metadata only, no streams) that shows every field of
the MKCinema addon looks spec. Data from TMDB (this product uses the TMDB API but is not endorsed or certified by TMDB).
Usage: python3 -I build_showcase.py <out dir>   (writes manifest.json and catalog/<type>/<id>.json)
Needs TMDB access: TMDB_TOKEN in the environment, or a proxy that adds it."""
import sys, os, json, pathlib, urllib.request, datetime

out = pathlib.Path(sys.argv[1]); TOK = os.environ.get('TMDB_TOKEN', 'proxy')
IMG = 'https://image.tmdb.org/t/p/'
def get(path):
    r = urllib.request.Request('https://api.themoviedb.org/3' + path, headers={'Authorization': 'Bearer ' + TOK, 'Accept': 'application/json'})
    with urllib.request.urlopen(r, timeout=20) as f: return json.load(f)
today = datetime.date.today()
def badges(x, date):
    b = [{'text': f"{x['vote_average']:.1f}", 'tone': 'gold', 'icon': 'star'}] if x.get('vote_count', 0) >= 50 else []
    try:
        if date and (today - datetime.date.fromisoformat(date)).days <= 45: b.append({'text': 'New', 'tone': 'green', 'icon': 'sparkles'})
    except ValueError: pass
    return b
def item(kind, x):
    ext = get(f"/{kind}/{x['id']}/external_ids"); imdb = ext.get('imdb_id')
    if not imdb: return None
    date = x.get('release_date') or x.get('first_air_date') or ''
    lang = (x.get('original_language') or '').upper()
    facts = [{'label': 'Original title', 'value': x.get('original_title') or x.get('original_name') or ''}, {'label': 'Language', 'value': lang}, {'label': 'First release', 'value': date}]
    return {
        'id': imdb, 'type': 'movie' if kind == 'movie' else 'series', 'name': x.get('title') or x.get('name'),
        'poster': IMG + 'w500' + x['poster_path'] if x.get('poster_path') else None,
        'background': IMG + 'w1280' + x['backdrop_path'] if x.get('backdrop_path') else None,
        'description': x.get('overview') or '', 'releaseInfo': date[:4],
        'mkcinema': {
            'badges': badges(x, date),
            'panels': [
                {'kind': 'ratings', 'title': 'Scores', 'items': [{'source': 'TMDB', 'score': f"{x['vote_average']:.1f}/10"}, {'source': 'Votes', 'score': f"{x.get('vote_count', 0):,}"}]},
                {'kind': 'facts', 'title': 'At a glance', 'items': [f for f in facts if f['value']],
                 'links': [{'label': 'TMDB page', 'url': f"https://www.themoviedb.org/{kind}/{x['id']}"}]},
            ],
        },
    }
def build(kind, path, n, landscape=False):
    res = []
    for x in get(path)['results']:
        it = item(kind, x)
        if it:
            if landscape: it['posterShape'] = 'landscape'
            res.append({k: v for k, v in it.items() if v is not None})
        if len(res) >= n: break
    return res
cats = {
    ('movie', 'axs-top10'): build('movie', '/trending/movie/week', 10),
    ('series', 'axs-wide'): build('tv', '/tv/top_rated', 16, landscape=True),
    ('movie', 'axs-square'): build('movie', '/movie/top_rated', 16),
}
manifest = {
    'id': 'app.mkcinema.looks-showcase', 'version': '1.0.0', 'name': 'Addon Looks Showcase',
    'description': 'A catalog-only example of MKCinema addon looks: a Top 10 row, a wide row, a square row, poster badges and film-page panels. Other apps show plain catalogs. Data from TMDB.',
    'logo': 'https://app.mkcinema.app/icon-192.png',
    'resources': ['catalog'], 'types': ['movie', 'series'], 'idPrefixes': ['tt'],
    'catalogs': [
        {'type': 'movie', 'id': 'axs-top10', 'name': 'Top 10 films this week'},
        {'type': 'series', 'id': 'axs-wide', 'name': 'Acclaimed series'},
        {'type': 'movie', 'id': 'axs-square', 'name': 'All-time favourites'},
    ],
    'behaviorHints': {'configurable': False},
    'mkcinema': {'version': 1, 'catalogs': [
        {'type': 'movie', 'id': 'axs-top10', 'layout': 'top10', 'place': 'home'},
        {'type': 'series', 'id': 'axs-wide', 'layout': 'landscape', 'place': 'home'},
        {'type': 'movie', 'id': 'axs-square', 'layout': 'square', 'place': 'library'},
    ]},
}
out.mkdir(parents=True, exist_ok=True)
(out / 'manifest.json').write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding='utf-8')
for (t, i), metas in cats.items():
    p = out / 'catalog' / t; p.mkdir(parents=True, exist_ok=True)
    (p / f'{i}.json').write_text(json.dumps({'metas': metas}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(t, i, len(metas))
