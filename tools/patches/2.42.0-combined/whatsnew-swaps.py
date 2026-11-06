#!/usr/bin/env python3
"""Adds the transitions line (2.40-smooth-swaps has no What's new entry) to the 2.42.0 entry. Idempotent.
Combined 2.42.0 order: 2.39.0-subs-translate, 2.38.2-side-rail, 2.40.0-legal-help, 2.41.0-addon-finder,
2.40.0-settings, 2.40-smooth-swaps, 2.42.0-tour-guide, then this."""
import sys, pathlib
ix = pathlib.Path(sys.argv[1]) / 'index.html'; s = ix.read_text(encoding='utf-8')
if "'Smoother switching'" not in s:
    a = "  { v: '2.42.0', date: '2026-11-06', items: [\n"
    assert s.count(a) == 1
    s = s.replace(a, a + "    ['better', 'Smoother switching', 'Switching lists, genres and seasons now flows: the new posters glide in instead of snapping, and Anime lists you have already opened come back instantly.'],\n", 1)
    ix.write_text(s, encoding='utf-8'); print('index.html changed')
