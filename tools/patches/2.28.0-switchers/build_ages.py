#!/usr/bin/env python3
"""Builds kids/ages.json: IMDb id -> age ratings for popular animation, family and kids titles, from TMDB.
Needs network access to api.themoviedb.org with a key (TMDB_KEY env, or a proxy that adds it).
Output: {"v":1,"c":["US","BR","IN","GB","DE"],"a":{"tt123":[17,16,null,15,16],...}} (minimum age per country).
Usage: python3 -I build_ages.py out.json"""
import json, os, re, sys, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ.get('TMDB_KEY', '')
C = ['US', 'BR', 'IN', 'GB', 'DE']


def get(path, **q):
    if KEY: q['api_key'] = KEY
    url = f'https://api.themoviedb.org/3/{path}?{urllib.parse.urlencode(q)}'
    for _ in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.load(r)
        except Exception as e:
            err = e
    print('fail', path, err, file=sys.stderr); return {}


def age(country, r):
    r = (r or '').strip().upper()
    if not r or r in ('NR', 'NOT RATED', 'UNRATED'): return None
    if country == 'US':
        m = {'TV-Y': 0, 'TV-G': 0, 'G': 0, 'TV-Y7': 7, 'TV-Y7-FV': 7, 'PG': 8, 'TV-PG': 10, 'PG-13': 13, 'TV-14': 14, 'R': 17, 'TV-MA': 17, 'NC-17': 18}
        return m.get(r)
    if country == 'BR':
        if r in ('L', 'AL', 'LIVRE'): return 0
    if country == 'IN':
        m = {'U': 0, 'UA': 12, 'U/A': 12, 'A': 18, 'S': 18}
        if r in m: return m[r]
    if country == 'GB':
        m = {'U': 0, 'UC': 0, 'PG': 8, '12A': 12, 'R18': 18}
        if r in m: return m[r]
    n = re.search(r'(\d{1,2})', r)
    return int(n.group(1)) if n else None


def ids(kind, genre, pages):
    out = []
    for p in range(1, pages + 1):
        d = get(f'discover/{kind}', with_genres=genre, sort_by='popularity.desc', page=p, **({'vote_count.gte': 5}))
        out += [x['id'] for x in d.get('results', [])]
        if p >= d.get('total_pages', 0): break
    return out


def tv(i):
    d = get(f'tv/{i}', append_to_response='content_ratings,external_ids')
    imdb = (d.get('external_ids') or {}).get('imdb_id')
    rs = {r['iso_3166_1']: r['rating'] for r in (d.get('content_ratings') or {}).get('results', [])}
    return imdb, [age(c, rs.get(c)) for c in C]


def movie(i):
    d = get(f'movie/{i}', append_to_response='release_dates')
    imdb = d.get('imdb_id')
    rs = {}
    for r in (d.get('release_dates') or {}).get('results', []):
        certs = [x.get('certification') for x in r.get('release_dates', []) if x.get('certification')]
        if certs: rs[r['iso_3166_1']] = certs[0]
    return imdb, [age(c, rs.get(c)) for c in C]


if __name__ == '__main__':
    out = sys.argv[1]
    tvs = set(ids('tv', 16, 30)) | set(ids('tv', 10762, 15))
    mvs = set(ids('movie', 16, 30)) | set(ids('movie', 10751, 20))
    print('tv', len(tvs), 'movies', len(mvs), file=sys.stderr)
    a = {}
    with ThreadPoolExecutor(12) as ex:
        for imdb, ages in list(ex.map(tv, tvs)) + list(ex.map(movie, mvs)):
            if imdb and re.match(r'^tt\d+$', imdb) and any(x is not None for x in ages):
                while ages and ages[-1] is None: ages.pop()
                a[imdb] = ages
    json.dump({'v': 1, 'c': C, 'src': 'TMDB', 'a': dict(sorted(a.items()))}, open(out, 'w'), separators=(',', ':'))
    print('wrote', len(a), 'titles to', out, file=sys.stderr)
