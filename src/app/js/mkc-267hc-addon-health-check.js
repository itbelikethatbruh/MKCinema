
/* 2.67 Addon health check, the part shared by the app and the public checker page on mkcinema.app.
   Everything runs in the viewer's own browser. An addon link can carry a private key, so the check sends a link only to
   that addon's own server, never to MKCinema, and never logs or stores it. It only reads what an addon serves to anyone
   (its manifest, a catalog, sources and subtitles for a few very well-known titles); it reports nothing back to the addon. */
const AddonCheck = (() => {
  const T = { manifestOk: 1500, manifestSlow: 4000, catOk: 2500, catSlow: 6000, metaSlow: 3000, streamOk: 3000, streamSlow: 8000, ceiling: 25000 };
  // well-known titles almost every catalog, source and subtitle addon covers, one per id scheme
  const SAMPLES = {
    tt: { movie: ['tt1375666', 'Inception'], series: ['tt0903747:1:1', 'Breaking Bad, episode 1'] },
    tmdb: { movie: ['tmdb:27205', 'Inception'], series: ['tmdb:1396:1:1', 'Breaking Bad, episode 1'] },
    kitsu: { movie: ['kitsu:1', 'Cowboy Bebop'], series: ['kitsu:1:1', 'Cowboy Bebop, episode 1'], anime: ['kitsu:1:1', 'Cowboy Bebop, episode 1'] },
    mal: { movie: ['mal:1', 'Cowboy Bebop'], series: ['mal:1:1', 'Cowboy Bebop, episode 1'], anime: ['mal:1:1', 'Cowboy Bebop, episode 1'] },
    anilist: { movie: ['anilist:1', 'Cowboy Bebop'], series: ['anilist:1:1', 'Cowboy Bebop, episode 1'], anime: ['anilist:1:1', 'Cowboy Bebop, episode 1'] },
  };
  // words an addon puts in a fake "source" when your service key or account has a problem
  const KEY_RX = /(invalid|wrong|expired|missing|bad|incorrect|revoked)[^\n]{0,14}(api[\s_-]?)?(key|token|credentials?)|api[\s_-]?key[^\n]{0,20}(invalid|expired|missing|required|wrong)|unauthori[sz]ed|\b401\b|not (logged|signed) in|log ?in (again|required|failed)|(subscription|premium|membership|plan)[^\n]{0,14}(expired|ended|required|inactive)|account[^\n]{0,14}(expired|suspended|locked|banned|not premium)|(re-?)?configure (the |this |your )?addon|setup required|configuration required/i;
  const ERR_RX = /\berror\b|\bfailed\b|unavailable|rate[\s-]?limit|too many requests|\b429\b|temporarily|blocked|forbidden|maintenance|service (down|unavailable)/i;

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const host = (u) => { try { return new URL(u).host; } catch (e) { return ''; } };
  const sec = (ms) => `${Math.max(0.1, ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || `${a}s`)}`;
  const enc = encodeURIComponent;

  /* stremio:// and https:// links, with or without /manifest.json; returns the base the routes hang off */
  function base(input) {
    let u = String(input || '').trim();
    if (!u) throw new Error('Paste an addon link first.');
    if (/^stremio:\/\//i.test(u)) u = u.replace(/^stremio:\/\//i, 'https://');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = `https://${u}`;
    let p; try { p = new URL(u); } catch (e) { throw new Error('That does not look like an addon link.'); }
    if (!/^https?:$/.test(p.protocol)) throw new Error('An addon link starts with https:// or stremio://');
    return (p.origin + p.pathname).replace(/\/manifest\.json$/i, '').replace(/\/+$/, '');
  }
  function resources(m) {
    return (Array.isArray(m.resources) ? m.resources : []).filter(Boolean).map((r) => (typeof r === 'string'
      ? { name: r, types: m.types || [], idPrefixes: m.idPrefixes || null }
      : { name: r.name, types: r.types || m.types || [], idPrefixes: r.idPrefixes || m.idPrefixes || null }));
  }
  function extras(c) {
    if (Array.isArray(c.extra)) return c.extra.map((e) => (typeof e === 'string' ? { name: e } : e || {}));
    const sup = c.extraSupported || [], req = c.extraRequired || [];
    return sup.map((n) => ({ name: n, isRequired: req.includes(n) }));
  }

  /* one request, timed; never throws */
  async function get(url, ms, signal) {
    const r = { ms: 0, ok: false, status: 0, bytes: 0, json: null, kind: '', redirected: false };
    const ctl = new AbortController(), t0 = now(), tm = setTimeout(() => ctl.abort(), ms);
    const stop = () => ctl.abort(); if (signal) signal.addEventListener('abort', stop);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
      r.status = res.status; r.redirected = res.redirected;
      const text = await res.text(); r.ms = Math.round(now() - t0); r.bytes = text.length;
      if (!res.ok) { r.kind = res.status === 429 ? 'rate' : res.status >= 500 ? 'server' : res.status === 404 ? 'missing' : res.status === 401 || res.status === 403 ? 'denied' : 'http'; return r; }
      try { r.json = JSON.parse(text.replace(/^﻿/, '')); r.ok = r.json && typeof r.json === 'object'; if (!r.ok) r.kind = 'notjson'; } catch (e) { r.kind = /^\s*</.test(text) ? 'html' : 'notjson'; }
    } catch (e) {
      r.ms = Math.round(now() - t0);
      r.kind = signal && signal.aborted ? 'cancel' : e && e.name === 'AbortError' ? 'timeout' : 'network';
    } finally { clearTimeout(tm); if (signal) signal.removeEventListener('abort', stop); }
    return r;
  }
  /* a request the browser hides from the page tells whether the server is up at all, which separates "blocks
     cross-site requests" from "down" */
  async function reachable(url) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
    try { await fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal }); return true; } catch (e) { return false; } finally { clearTimeout(tm); }
  }
  function failText(r, what) {
    switch (r.kind) {
      case 'timeout': return `${what} did not answer within ${sec(r.ms)}`;
      case 'rate': return `${what} answered “too many requests” (HTTP 429): the server is limiting how often it can be asked`;
      case 'server': return `${what} had a server error (HTTP ${r.status})`;
      case 'missing': return `${what} answered “not found” (HTTP 404)`;
      case 'denied': return `${what} refused the request (HTTP ${r.status}), which usually means the key or login in the link is no longer accepted`;
      case 'html': return `${what} sent a web page instead of addon data, often a login, error or “site moved” page`;
      case 'notjson': return `${what} sent something that is not addon data`;
      case 'http': return `${what} answered HTTP ${r.status}`;
      default: return `${what} did not answer`;
    }
  }
  /* picks a test title the addon says it covers */
  function sample(res, type, fallbackId) {
    const pre = res.idPrefixes && res.idPrefixes.length ? res.idPrefixes : null;
    for (const k of ['tt', 'tmdb', 'kitsu', 'mal', 'anilist']) {
      if (pre && !pre.some((p) => String(p).toLowerCase().startsWith(k))) continue;
      const s = SAMPLES[k][type]; if (s) return { id: s[0], label: s[1] };
    }
    return fallbackId ? { id: fallbackId, label: 'a title from its own catalog' } : null;
  }

  /* Reads the sources an addon returned for a famous title. `parse` (optional, the app's own reader) marks cached files. */
  function readStreams(list, parse) {
    const o = { n: list.length, playable: 0, p2p: 0, ext: 0, headers: 0, notWeb: 0, cached: 0, uncached: 0, key: '', err: '' };
    for (const s of list) {
      if (!s || typeof s !== 'object') continue;
      const text = [s.name, s.title, s.description].filter((x) => typeof x === 'string').join(' • ').replace(/\s+/g, ' ').trim();
      const bh = s.behaviorHints || {};
      const fake = !s.url && !s.infoHash && !s.ytId && !s.externalUrl;
      if (s.url) o.playable++; else if (s.infoHash) o.p2p++; else if (s.externalUrl) o.ext++;
      if (bh.proxyHeaders && (bh.proxyHeaders.request || bh.proxyHeaders.response)) o.headers++;
      if (bh.notWebReady) o.notWeb++;
      // an addon that reports a problem does it with a short list, often one entry and often with a link to a notice video
      if (!o.key && KEY_RX.test(text) && (fake || list.length <= 3)) o.key = text.slice(0, 140);
      else if (!o.err && ERR_RX.test(text) && (fake || list.length <= 2)) o.err = text.slice(0, 140);
      let c;
      if (parse) { try { c = parse(s).cached; } catch (e) { c = undefined; } }
      else { const tag = /\[(RD|TB|AD|PM|DL|OC|ED|PD|PR|EN|DLS)\b[^\]]*\]/i.exec(s.name || ''); if (tag) c = /download|⬇|⏳/i.test(tag[0]) ? false : (/\+|⚡/.test(tag[0]) || /⚡/.test(s.name || '')) ? true : undefined; }
      if (c === true) o.cached++; else if (c === false) o.uncached++;
    }
    return o;
  }

  /* Checks one addon. opts: { timeout (the app's addon timeout in s), parse, signal, onStep(text) }
     Returns { base, host, name, logo, version, verdict, ms, tests: [...], findings: [...], manifest, kinds } */
  async function one(input, opts = {}) {
    const b = base(input), hostName = host(b), out = { base: b, host: hostName, name: hostName, logo: '', version: '', verdict: 'good', tests: [], findings: [], manifest: null, kinds: [], stream: null };
    const step = (t) => { if (opts.onStep) try { opts.onStep(t); } catch (e) { /* display only */ } };
    const tags = new Set(), add = (level, text, fix, act, slow, tag) => { if (tag) { if (tags.has(tag)) return; tags.add(tag); } out.findings.push({ level, text, fix: fix || '', act: act || '', slow: !!slow }); };
    const test = (label, r, extra) => { const x = { label, ms: r ? r.ms : 0, ok: !!(r && r.ok), note: '', ...extra }; out.tests.push(x); return x; };
    const W = (app, site) => (opts.site ? site : app);
    const limit = (opts.timeout || 15) * 1000, cap = Math.max(T.ceiling, limit + 5000);

    if (typeof location !== 'undefined' && location.protocol === 'https:' && /^http:/i.test(b)) {
      out.verdict = 'bad';
      add('bad', 'This link starts with http://, and browsers block plain http addons inside a secure (https) page.', 'Use the https:// version of the link if the addon has one. The Android and desktop apps can also use http addons on your home network.');
      return out;
    }
    step('Reading its manifest');
    const mr = await get(`${b}/manifest.json`, 15000, opts.signal);
    if (mr.kind === 'cancel') { out.verdict = 'cancel'; return out; }
    test('Manifest', mr);
    if (!mr.ok) {
      if (mr.kind === 'network') {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) { out.verdict = 'blocked'; add('warn', 'This device is offline, so nothing could be checked.', 'Connect to the internet and run the check again.'); return out; }
        step('Checking whether the server is up');
        const up = await reachable(`${b}/manifest.json`);
        if (up) {
          out.verdict = 'blocked';
          add('warn', `The server is up, but it does not allow requests from web pages (no CORS permission), so a browser cannot test it${W(', or use it in the web app', '')}.`, `This is a setting on the addon’s server, not something wrong on your side. ${W('The Android, Windows and TV apps are not limited by it.', 'Native apps are not limited by it, but web players are.')} If the addon has an official https link, try that one.`);
        } else {
          out.verdict = 'bad';
          add('bad', 'The server did not answer at all. The addon may be down, moved to a new address, or blocked on this network.', 'Try again in a few minutes. If it stays down, check the addon’s own page for a new link, and remove this one.', 'remove');
        }
        return out;
      }
      out.verdict = 'bad';
      add('bad', `${failText(mr, 'The addon')} when asked for its manifest, so nothing it offers can load.`, mr.kind === 'denied' ? 'Open the addon’s setup page, sign in or paste your key again, and install the new link it gives you.' : mr.kind === 'timeout' ? 'The server is overloaded or down. Try again later, or remove it if it keeps happening.' : 'The link may be old. Get a fresh link from the addon’s own page.', mr.kind === 'denied' ? 'setup' : 'remove');
      return out;
    }
    const m = mr.json; out.manifest = m;
    out.name = typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 80) : hostName;
    out.logo = typeof m.logo === 'string' && /^https:\/\//i.test(m.logo) ? m.logo : '';
    out.version = typeof m.version === 'string' ? m.version.slice(0, 20) : '';
    const res = resources(m), bh = m.behaviorHints || {};
    out.kinds = [...new Set(res.map((r) => r.name).filter((n) => typeof n === 'string'))];
    const configurable = !!(bh.configurable || bh.configurationRequired);
    if (!m.id || !m.name || !res.length) {
      out.verdict = 'bad';
      add('bad', `Its manifest is incomplete (${[!m.id && 'no id', !m.name && 'no name', !res.length && 'lists nothing it offers'].filter(Boolean).join(', ')}).`, 'Get a fresh link from the addon’s own page.', 'remove');
      return out;
    }
    if (bh.configurationRequired) {
      add('bad', 'The addon says it still needs to be set up before it can work.', 'Open its setup page, choose your options, and install the link it gives you.', 'setup');
    }
    if (mr.ms > T.manifestSlow) add('warn', `Its manifest took ${sec(mr.ms)} to arrive. ${W('MKCinema keeps a saved copy so start-up does not wait, but a', 'A')} slow manifest usually means a busy server.`, '', '', true);
    if (mr.bytes > 256 * 1024) add('warn', `Its manifest is large (${size(mr.bytes)}), ${W('too big for MKCinema to keep a saved copy, so start-up waits for it every time', 'which slows start-up in most players')}.`, 'If the addon has a setup page, turn off catalogs you do not use there.', configurable ? 'setup' : '');
    if (mr.redirected) add('info', 'Its link redirects to another address. It works, but each request takes an extra trip.', 'Get the current link from the addon’s own page and install that one.');
    const cats = Array.isArray(m.catalogs) ? m.catalogs.filter((c) => c && c.type && c.id) : [];
    if (cats.length > 25) add('info', `It adds ${cats.length} catalogs. Each catalog shown on Home is one more request when Home loads.`, 'Hide the rows you never use, or turn catalogs off on the addon’s setup page.', configurable ? 'setup' : '');

    // catalog: the first one that needs nothing extra
    let fromCat = null;
    const cat = cats.find((c) => !extras(c).some((e) => e.isRequired));
    if (out.kinds.includes('catalog') && cat) {
      step('Loading a catalog');
      const cr = await get(`${b}/catalog/${enc(cat.type)}/${enc(cat.id)}.json`, cap, opts.signal);
      if (cr.kind === 'cancel') { out.verdict = 'cancel'; return out; }
      const metas = cr.ok && Array.isArray(cr.json.metas) ? cr.json.metas.filter((x) => x && (typeof x.id === 'string' || typeof x.id === 'number')) : null;
      const t = test(`Catalog “${String(cat.name || cat.id).slice(0, 40)}”`, cr, { ok: !!(metas && metas.length) });
      if (metas) { fromCat = metas[0] ? { id: String(metas[0].id), type: metas[0].type || cat.type } : null; t.note = plural(metas.length, 'title'); }
      if (!cr.ok) add('bad', `${failText(cr, 'Its catalog')}. Rows from this addon stay empty or keep loading.`, cr.kind === 'denied' ? 'Open the addon’s setup page and install a fresh link.' : '', cr.kind === 'denied' ? 'setup' : '');
      else if (!metas || !metas.length) add('warn', `Its catalog “${String(cat.name || cat.id).slice(0, 40)}” came back empty.`, configurable ? 'Its setup page may need a key or options before it lists anything.' : '', configurable ? 'setup' : '');
      else if (cr.ms > T.catSlow) add('warn', `Its catalog took ${sec(cr.ms)}. Rows from this addon appear late on Home.`, '', '', true);
      if (cr.ok && cr.bytes > 1.5 * 1024 * 1024) add('warn', `One page of its catalog is ${size(cr.bytes)}, heavy for phones and TVs.`);
    } else if (out.kinds.includes('catalog') && cats.length) {
      test('Catalog', null, { ok: true, skip: true, note: 'only search or filtered catalogs' });
    }

    // sources: a famous film, then a famous episode, as the addon covers them
    const sres = res.find((r) => r.name === 'stream');
    if (sres) {
      if (!sres.idPrefixes || !sres.idPrefixes.length) add('info', 'It does not say which kinds of titles it covers, so it is asked for sources on every title, including channels and titles it can never have.');
      const types = (sres.types || []).filter((x) => typeof x === 'string');
      const order = ['movie', 'series', 'anime'].filter((x) => types.includes(x));
      const tries = [];
      for (const ty of order.length ? order : types.slice(0, 1)) {
        const smp = sample(sres, ty, fromCat && fromCat.type === ty ? fromCat.id : null);
        if (smp && !tries.some((x) => x.id === smp.id)) tries.push({ type: ty, ...smp });
        if (tries.length >= 2) break;
      }
      if (!tries.length && fromCat) tries.push({ type: fromCat.type, id: fromCat.id, label: 'a title from its own catalog' });
      if (!tries.length) test('Sources', null, { ok: true, skip: true, note: 'no test title for what it covers' });
      let first = null;
      for (const s of tries) {
        step(`Asking for sources: ${s.label}`);
        const url = `${b}/stream/${enc(s.type)}/${enc(s.id)}.json`;
        const r = await get(url, cap, opts.signal);
        if (r.kind === 'cancel') { out.verdict = 'cancel'; return out; }
        const list = r.ok && Array.isArray(r.json.streams) ? r.json.streams : null;
        const t = test(`Sources for ${s.label}`, r, { ok: !!list });
        if (!list) {
          if (!first && r.kind === 'timeout') out.stream = { ms: r.ms, n: 0, timeout: true };
          add('bad', `${failText(r, `Asking for sources (${s.label})`)}.${r.kind === 'timeout' ? W(' Smart Play and the source list wait for it every time you press Play.', ' Your player waits for it every time you press Play.') : ''}`,
            r.kind === 'denied' ? 'Open the addon’s setup page and install a fresh link with your key.' : r.kind === 'rate' ? 'Wait a while before using it again, and avoid installing several copies of the same addon.' : r.kind === 'timeout' ? 'Turn it off for now and try again later. If it keeps timing out, remove it.' : 'Try again later. If it keeps failing, remove it or get a fresh link.',
            r.kind === 'denied' ? 'setup' : r.kind === 'timeout' ? 'off' : '', false, `sf:${r.kind}`);
          continue;
        }
        const rd = readStreams(list, opts.parse); t.note = plural(rd.n, 'source');
        if (!first) { first = { r, rd, s, url }; out.stream = { ms: r.ms, n: rd.n }; }
        if (rd.key) add('bad', `It returned a warning instead of sources: “${rd.key}”. Your service key or account in this addon’s link is probably wrong, expired or out of credit.`, 'Open the addon’s setup page, paste your current key, and install the new link it gives you. Then remove the old one.', 'setup', false, 'key');
        else if (rd.err) add('warn', `It returned an error message instead of sources: “${rd.err}”.`, 'This is a problem on the addon’s server or with your service. Try again later.', '', false, 'err');
        else if (!rd.n) add('warn', `It found no sources for ${s.label}, one of the most widely available titles.`, configurable ? 'Its setup page may have filters or a missing key that hide everything.' : 'It may only cover other kinds of titles, or its sources are offline.', configurable ? 'setup' : '');
      }
      if (first) {
        const { r, rd } = first;
        const limitHit = r.ms > limit;
        if (limitHit) add('bad', W(`It takes ${sec(r.ms)} to find sources, longer than the ${opts.timeout || 15} s addon timeout, so MKCinema gives up on it every time.`, `It takes ${sec(r.ms)} to find sources, longer than most players wait (about 15 s), so its sources are usually skipped.`), W('Turn it off, or raise Settings › Your addons › Addon timeout if you really want its sources.', 'Turn it off, or remove it if it is always this slow.'), 'off', true);
        else if (r.ms > T.streamSlow) add('warn', `It takes ${sec(r.ms)} to find sources. ${W('Smart Play and the source list wait', 'Your player waits')} for it on every title.`, 'Turn it off if you do not need it.', 'off', true);
        else if (r.ms > T.streamOk) add('info', `It takes ${sec(r.ms)} to find sources, a little slow.`);
        if (r.ms > T.streamOk && !opts.signal?.aborted) {
          step('Asking again to see if it gets faster');
          const again = await get(first.url, cap, opts.signal);
          if (again.ok) {
            test('Same sources, asked again', again);
            if (again.ms < r.ms * 0.45) out.findings.push({ level: 'info', text: `Asked a second time it answered in ${sec(again.ms)}. It looks titles up live the first time and remembers them after, so new titles are slow and repeat titles are quick.`, fix: '', act: '' });
            else if (again.ms > T.streamSlow) out.findings.push({ level: 'info', text: `Asked a second time it was still slow (${sec(again.ms)}), so the server itself is slow or overloaded, not just the first lookup.`, fix: '', act: '' });
          }
        }
        if (rd.n > 300 || r.bytes > 1.5 * 1024 * 1024) add('warn', `It sends ${rd.n} sources (${size(r.bytes)}) for one title. Long lists make ${W('the source list and Smart Play', 'source lists and auto-play')} slower, mostly on TVs and phones.`, configurable ? 'Most addons like this have a setting to limit results per quality. Open its setup page.' : '', configurable ? 'setup' : '');
        if (rd.n && rd.p2p === rd.n && !opts.p2pOk) add('info', W('All of its sources are peer-to-peer links. A web browser cannot play those on its own; they need a debrid service connected in Settings, or the Android or TV app.', 'All of its sources are peer-to-peer links. Web players cannot play those on their own; they need a debrid service or an app with a built-in torrent engine.'));
        if (rd.headers && rd.headers >= rd.n / 2) add('info', `${plural(rd.headers, 'source')} ask for special request headers, which a web page cannot add by itself. ${W('They play through the MKCinema server, or are skipped in the web app', 'Web players skip them unless they run a local helper')}.`);
        if (rd.uncached && !rd.cached && rd.uncached === rd.n) add('info', 'None of its sources for the test title are ready on your debrid service yet, so they would start with a “downloading” notice.');
      }
    }

    // subtitles
    const subr = res.find((r) => r.name === 'subtitles');
    if (subr) {
      const ty = (subr.types || []).includes('movie') ? 'movie' : (subr.types || [])[0] || 'movie';
      const smp = sample(subr, ty, null);
      if (smp) {
        step('Asking for subtitles');
        const r = await get(`${b}/subtitles/${enc(ty)}/${enc(smp.id)}.json`, cap, opts.signal);
        if (r.kind === 'cancel') { out.verdict = 'cancel'; return out; }
        const list = r.ok && Array.isArray(r.json.subtitles) ? r.json.subtitles : null;
        const t = test(`Subtitles for ${smp.label}`, r, { ok: !!list }); if (list) t.note = plural(list.length, 'subtitle');
        if (!list) add('warn', `${failText(r, 'Asking for subtitles')}. Subtitle lists wait for it when a film starts.`, '', r.kind === 'timeout' ? 'off' : '');
        else if (r.ms > T.streamSlow) add('warn', `It takes ${sec(r.ms)} to list subtitles.`, '', '', true);
      }
    }

    // meta: details for a title from its own catalog
    const metr = res.find((r) => r.name === 'meta');
    if (metr && fromCat) {
      step('Opening a title page');
      const r = await get(`${b}/meta/${enc(fromCat.type)}/${enc(fromCat.id)}.json`, cap, opts.signal);
      if (r.kind === 'cancel') { out.verdict = 'cancel'; return out; }
      const ok = r.ok && r.json.meta && typeof r.json.meta === 'object';
      test('Title details', r, { ok });
      if (!ok) add('warn', `${failText(r, 'Asking for title details')}. Its titles may open with missing details.`);
      else if (r.ms > T.metaSlow) add('warn', `Title details take ${sec(r.ms)}, so title pages that use this addon open slowly.`, '', '', true);
    }

    out.ms = out.tests.reduce((a, x) => Math.max(a, x.ms || 0), 0);
    const bad = out.findings.filter((f) => f.level === 'bad'), warn = out.findings.filter((f) => f.level === 'warn');
    out.verdict = bad.some((f) => f.act !== 'setup' && !f.slow) ? 'bad' : bad.some((f) => f.act === 'setup') ? 'setup' : bad.length || warn.some((f) => f.slow) ? 'slow' : warn.length ? 'warn' : 'good';
    return out;
  }

  /* Looks across all addons together: copies, overlap, order and how many sources Smart Play waits for.
     addons: [{ base, name, id, enabled, order, kinds, metaFirst }] in the app's order; reports from one(). */
  function together(reports, opts = {}) {
    const f = [], add = (level, text, fix, act, who) => f.push({ level, text, fix: fix || '', act: act || '', who: who || null });
    const ok = reports.filter((r) => r.manifest);
    // the same addon installed twice (often an old and a new link)
    const byId = new Map();
    ok.forEach((r) => { const k = r.manifest.id; if (!byId.has(k)) byId.set(k, []); byId.get(k).push(r); });
    for (const [, list] of byId) if (list.length > 1) add('warn', `${list[0].name} is installed ${list.length} times, usually an old link and a new one. Every title asks each copy, which doubles the wait and can hit the server’s limits.`, 'Keep the newest copy and remove the others.', 'dupe', list.map((r) => r.base));
    const names = new Map();
    ok.forEach((r) => { const k = r.name.toLowerCase(); if (!names.has(k)) names.set(k, []); names.get(k).push(r); });
    for (const [, list] of names) if (list.length > 1 && new Set(list.map((r) => r.manifest.id)).size > 1) add('info', `${list.length} addons are called “${list[0].name}”. They may be different copies of the same service.`, '', '', list.map((r) => r.base));
    // sources: everything that answers "stream" is asked on every Play, and Smart Play waits for all of them
    const src = ok.filter((r) => r.kinds.includes('stream'));
    const timed = src.filter((r) => r.stream).sort((a, b) => b.stream.ms - a.stream.ms);
    if (timed.length >= 2 && timed[0].stream.ms > 3000) add(timed[0].stream.ms > (opts.timeout || 15) * 1000 ? 'bad' : 'warn', `${opts.site ? 'Players ask every source addon and wait for the answers' : 'Smart Play waits for every source addon before it chooses'}. ${timed[0].name} is the slowest at ${sec(timed[0].stream.ms)}, so every Play waits about that long${timed[1] ? `; without it the wait would be about ${sec(timed[1].stream.ms)}` : ''}.`, 'Turn it off, or remove it if you rarely use its sources.', 'off', [timed[0].base]);
    if (src.length >= 7) add('warn', `${src.length} addons look for sources on every title. Each one is another request to wait for, and they often find the same files.`, 'Keep the 3 to 5 you get the best sources from and turn off the rest.');
    else if (src.length >= 5) add('info', `${src.length} addons look for sources. That works, but each one adds to the wait when you press Play.`);
    const hosts = new Map();
    src.forEach((r) => { hosts.set(r.host, (hosts.get(r.host) || 0) + 1); });
    for (const [h, n] of hosts) if (n >= 3) add('info', `${n} of your source addons run on the same server (${h}). Asked all at once, that server may slow down or start refusing requests.`);
    // title pages ask meta addons in order and take the first answer
    if (opts.metaOrder && opts.metaOrder.length > 1) {
      const slowFirst = [];
      for (const r of opts.metaOrder) { if (r.slow) slowFirst.push(r); else break; }
      if (slowFirst.length) add('warn', `Title pages ask ${slowFirst.map((r) => r.name).join(' and ')} for details first, and ${slowFirst.length === 1 ? 'it is' : 'they are'} slow or failing, so every title page waits before the next addon is asked.`, 'Move it down the list, below an addon that answers quickly.', 'down', slowFirst.map((r) => r.base));
    }
    return f;
  }

  /* plain text for sharing: names and verdicts, never links */
  function text(reports, extra = []) {
    const V = { good: 'Healthy', slow: 'Slow', warn: 'Has warnings', bad: 'Not working', setup: 'Needs setup', blocked: 'Cannot be tested in a browser', cancel: 'Stopped' };
    const lines = [`Addon health check, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`];
    extra.forEach((x) => lines.push(`* ${x.text}`));
    reports.forEach((r) => {
      lines.push('', `${r.name}${r.version ? ` v${r.version}` : ''}: ${V[r.verdict] || r.verdict}`);
      r.tests.forEach((t) => lines.push(`  - ${t.label}: ${t.skip ? 'skipped' : t.ok ? 'OK' : 'failed'}${t.ms ? `, ${sec(t.ms)}` : ''}${t.note ? `, ${t.note}` : ''}`));
      r.findings.forEach((x) => lines.push(`  ! ${x.text}`));
    });
    // a key can sit in the path of a link; links are never added, and a host name is the most a line ever carries
    return lines.join('\n');
  }

  return { one, together, text, base, resources, sec, T, readStreams };
})();

/* 2.67 Addon health check in the Addons screen. "Check my addons" tests every addon that is switched on, three at a
   time, and says in plain words what is slow or broken and what to do, with one-press fixes (turn off, move down, remove
   an extra copy, open the setup page). Results stay in memory for this session only; links are never logged or stored. */
const AddonHealth = {
  last: null, byBase: new Map(), busy: false, ctl: null,
  V: { good: ['Healthy', 'check-circle-2'], slow: ['Slow', 'clock'], warn: ['Check', 'alert-triangle'], bad: ['Not working', 'x-circle'], setup: ['Needs setup', 'key-round'], blocked: ['Can’t test here', 'shield-alert'], cancel: ['Stopped', 'circle'] },
  host(u) { try { return new URL(u).host; } catch (e) { return 'Addon'; } },
  k(u) { try { return AddonCheck.base(u); } catch (e) { return u; } },
  RANK: { bad: 0, setup: 1, slow: 2, warn: 3, blocked: 4, good: 5, cancel: 6 },

  /* the Addons screen: a "Check my addons" card above Your addons, and a result tag on each addon row */
  draw() {
    const list = $('#addonList'); if (!list) return;
    if (!$('#hcRun')) {
      const at = $('#addons .mkd-lbl.mine') || list;
      at.insertAdjacentHTML('beforebegin', `<button class="mkd-find hc-run" type="button" data-nav id="hcRun"><span class="mkd-find-ic hc-ic"><i data-lucide="activity"></i></span><span class="mkd-find-t"><b>Check my addons</b><small id="hcSub">Find out which addon is slow or broken, and how to fix it</small></span><i data-lucide="chevron-right"></i></button>`);
      $('#hcRun').onclick = () => this.open();
      icons();
    }
    const sub = $('#hcSub'); if (sub && this.last) sub.textContent = this.headline(this.last).short;
    $$('#addonList [data-toggle]').forEach((t) => {
      const r = this.byBase.get(t.dataset.toggle), h = t.closest('.addon') && t.closest('.addon').querySelector('h4'); if (!h) return;
      const old = h.querySelector('.hc-tag'); if (old) old.remove();
      if (!r || r.verdict === 'cancel') return;
      h.insertAdjacentHTML('beforeend', `<span class="tag-s hc-tag hc-${r.verdict}" title="Addon health check">${esc(this.V[r.verdict][0])}${r.stream && r.stream.ms ? ` · ${AddonCheck.sec(r.stream.ms)}` : ''}</span>`);
    });
  },
  headline(L) {
    const n = (v) => L.reports.filter((r) => r.verdict === v).length, bad = n('bad'), setup = n('setup'), slow = n('slow'), warn = n('warn'), blocked = n('blocked');
    const issues = bad + setup + slow, all = L.reports.length;
    const parts = [bad && `${bad} not working`, setup && `${setup} need${setup === 1 ? 's' : ''} setup`, slow && `${slow} slow`, warn && `${warn} with warnings`, blocked && `${blocked} can’t be tested here`].filter(Boolean);
    const tone = bad || setup ? 'bad' : slow || L.extra.some((f) => f.level !== 'info') ? 'slow' : warn || blocked ? 'warn' : 'good';
    const title = tone === 'good' ? `All ${all} addons are healthy` : issues ? `${issues} of ${all} addons need${issues === 1 ? 's' : ''} attention` : L.extra.some((f) => f.level !== 'info') ? 'Your addons work, but your setup slows things down' : `${all - warn - blocked} of ${all} addons are healthy`;
    return { tone, title, sub: parts.join(' · ') || 'Fast answers, working catalogs and sources.', short: `Last check: ${parts.join(', ') || 'all healthy'}` };
  },
  open() {
    X8.layer('healthLayer', { label: 'Addon health check', icon: 'activity', eyebrow: 'Addons', wide: true });
    const b = X8.body('healthLayer');
    b.innerHTML = `<h3 class="x8-h">Addon health check</h3>
      <p class="sub hc-lede">Tests every addon you have switched on: how fast it answers, whether its catalogs, sources and subtitles work for well-known titles, and whether its key or setup has a problem. It runs on this ${IS_TV ? 'TV' : 'device'} and talks only to your addons. Your links are not sent anywhere else.</p>
      <div id="hcBody">${this.last ? this.report(this.last) : ''}</div>
      <div class="actions hc-acts"><button class="btn btn-prime" type="button" data-nav id="hcGo"><i data-lucide="activity"></i>${this.last ? 'Check again' : 'Start the check'}</button>${this.last ? '<button class="btn btn-ghost" type="button" data-nav id="hcCopy"><i data-lucide="copy"></i>Copy report</button>' : ''}</div>`;
    icons(); X8.open('healthLayer'); this.bind();
    X8.onClose.healthLayer = () => { if (this.ctl) this.ctl.abort(); };
    if (IS_TV) setTimeout(() => Nav.focus($('#hcGo')), 60);
  },
  bind() {
    const go = $('#hcGo'); if (go) go.onclick = () => (this.busy ? this.ctl && this.ctl.abort() : this.run());
    const cp = $('#hcCopy'); if (cp) cp.onclick = () => this.last && copyText(AddonCheck.text(this.last.reports, this.last.extra), 'Report copied, without your addon links');
    const body = $('#hcBody'); if (!body) return;
    $$('[data-hcact]', body).forEach((x) => { x.onclick = () => this.act(x); });
  },
  async run() {
    const list = engine.addons.filter((a) => a.enabled && !a.virtual);
    const body = $('#hcBody'), go = $('#hcGo'); if (!body) return;
    if (!list.length) { body.innerHTML = '<p class="dg-warn">No addons are switched on, so there is nothing to check.</p>'; return; }
    this.busy = true; this.ctl = new AbortController(); const sig = this.ctl.signal;
    if (go) go.innerHTML = '<i data-lucide="square"></i>Stop';
    const cp = $('#hcCopy'); if (cp) cp.hidden = true;
    body.innerHTML = `<p class="hc-run-t" role="status" aria-live="polite">Checking ${list.length} addon${list.length === 1 ? '' : 's'}. Slow ones can take up to ${Math.max(25, (CFG.timeout || 15) + 5)} seconds.</p>
      <ol class="dg-steps hc-steps">${list.map((a, i) => `<li data-hci="${i}"><i class="dg-dot"></i><span class="hc-n">${esc(a.error || a.manifest.version === '?' ? this.host(a.baseUrl) : a.manifest.name || 'Addon')}</span><small>waiting</small></li>`).join('')}</ol>`;
    icons();
    let p2pOk = false; try { p2pOk = !!((typeof Vault !== 'undefined' && Vault.service()) || (typeof androidP2P !== 'undefined' && androidP2P)); } catch (e) { /* no torrent engine */ }
    const reports = new Array(list.length), q = list.map((a, i) => i);
    const worker = async () => {
      for (let i; (i = q.shift()) !== undefined;) {
        if (sig.aborted) return;
        const a = list[i], li = $(`[data-hci="${i}"]`, body), say = (t) => { if (li) $('small', li).textContent = t; };
        if (li) li.classList.add('on');
        let r;
        try { r = await AddonCheck.one(a.baseUrl, { timeout: CFG.timeout || 15, parse: (s) => Telemetry.parse(s), p2pOk, signal: sig, onStep: say }); }
        catch (e) { r = { base: a.baseUrl, host: '', name: a.manifest.name, verdict: 'bad', tests: [], findings: [{ level: 'bad', text: `The check could not run: ${String(e && e.message || e).slice(0, 80)}`, fix: '', act: '' }], manifest: null, kinds: [] }; }
        // an addon that never loaded is named after its link; only the host is kept, since a path can hold a key
        if (!a.error && a.manifest.version !== '?' && a.manifest.name) r.name = a.manifest.name; else if (!r.manifest) r.name = r.host || 'Addon';
        reports[i] = r;
        if (li) { li.classList.remove('on'); li.classList.add(r.verdict === 'good' ? 'ok' : r.verdict === 'cancel' ? 'skip' : r.verdict === 'bad' || r.verdict === 'setup' ? 'bad' : 'warn'); say(`${this.V[r.verdict][0]}${r.stream && r.stream.ms ? ` · ${AddonCheck.sec(r.stream.ms)}` : ''}`); }
      }
    };
    try { await Promise.all([worker(), worker(), worker()]); this.finish(list, reports, sig); }
    catch (e) { MKLog.add('error', `addon health: ${String(e && e.message || e).slice(0, 120)}`); this.last = null; this.open(); const bb = $('#hcBody'); if (bb) bb.innerHTML = '<p class="dg-warn">The check stopped unexpectedly. Please try again.</p>'; }
    finally { this.busy = false; this.ctl = null; }
  },
  finish(list, reports, sig) {
    this.busy = false;
    const done = reports.filter(Boolean);
    if (sig.aborted && !done.some((r) => r.verdict !== 'cancel')) { this.open(); return; }
    // title pages ask meta addons in list order and take the first that answers
    const metaOrder = engine.addons.filter((a) => a.enabled && !a.virtual && engine.supports(a, 'meta', 'movie', 'tt1375666')).map((a) => {
      const r = done.find((x) => x.base === a.baseUrl) || done.find((x) => x.base === this.k(a.baseUrl)); if (!r) return null;
      const t = r.tests.find((x) => x.label === 'Title details');
      return { name: r.name, base: a.baseUrl, slow: t ? !t.ok || t.ms > 3000 : r.verdict === 'bad' || r.verdict === 'blocked' };
    }).filter(Boolean);
    const extra = AddonCheck.together(done.filter((r) => r.verdict !== 'cancel'), { timeout: CFG.timeout || 15, metaOrder });
    this.last = { at: Date.now(), reports: done, extra };
    this.byBase = new Map(done.map((r) => [list.find((a) => a.baseUrl === r.base || this.k(a.baseUrl) === r.base)?.baseUrl || r.base, r]));
    const n = (v) => done.filter((r) => r.verdict === v).length;
    MKLog.add('info', `addon health: ${done.length} checked, ${n('good')} healthy, ${n('slow')} slow, ${n('bad')} not working, ${n('setup')} need setup, ${n('blocked')} untestable`);
    this.open();
    if (!$('#addons').hidden) renderAddons();
  },
  /* one list of what to fix, worst first, then a card per addon */
  report(L) {
    const h = this.headline(L);
    const fixes = [];
    L.extra.forEach((f) => fixes.push({ ...f, name: '' }));
    L.reports.forEach((r) => r.findings.forEach((f) => { if (f.level !== 'info') fixes.push({ ...f, name: r.name, who: [r.base], r }); }));
    fixes.sort((a, b) => (a.level === 'bad' ? 0 : a.level === 'warn' ? 1 : 2) - (b.level === 'bad' ? 0 : b.level === 'warn' ? 1 : 2));
    const sorted = L.reports.slice().sort((a, b) => this.RANK[a.verdict] - this.RANK[b.verdict]);
    const when = new Date(L.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `<div class="hc-sum hc-t-${h.tone}"><i data-lucide="${h.tone === 'good' ? 'check-circle-2' : h.tone === 'bad' ? 'alert-octagon' : 'alert-triangle'}"></i><div><b>${esc(h.title)}</b><small>${esc(h.sub)} · checked at ${esc(when)}</small></div></div>
      ${fixes.length ? `<h4 class="dg-h">What to fix first</h4><ul class="hc-fix">${fixes.slice(0, 12).map((f, i) => `<li class="hc-l-${f.level}"><i class="hc-dot"></i><div><p>${f.name ? `<b>${esc(f.name)}:</b> ` : ''}${esc(f.text)}</p>${f.fix ? `<small>${esc(f.fix)}</small>` : ''}${this.button(f, `f${i}`)}</div></li>`).join('')}</ul>` : ''}
      <h4 class="dg-h">Each addon</h4>
      <div class="hc-list">${sorted.map((r) => this.card(r)).join('')}</div>
      <p class="hc-foot">Tested with well-known titles (Inception, Breaking Bad, Cowboy Bebop). A browser cannot test addons whose servers refuse requests from web pages; those are marked “Can’t test here”, not broken. Results can change from hour to hour as addon servers get busy.</p>`;
  },
  card(r) {
    const [label, ic] = this.V[r.verdict] || this.V.warn;
    const info = r.findings.filter((f) => f.level === 'info');
    const init = esc((r.name || '?').slice(0, 2).toUpperCase());
    return `<details class="hc-card hc-v-${r.verdict}"${r.verdict !== 'good' && r.verdict !== 'cancel' ? ' open' : ''}><summary data-nav>
        ${r.logo ? `<img class="hc-logo" src="${esc(r.logo)}" alt="" referrerpolicy="no-referrer" data-nofb="1">` : `<span class="hc-logo">${init}</span>`}
        <span class="hc-name"><b>${esc(r.name)}</b><small>${esc([r.version && `v${r.version}`, r.kinds && r.kinds.join(', ')].filter(Boolean).join(' · '))}</small></span>
        <span class="hc-pill hc-p-${r.verdict}"><i data-lucide="${ic}"></i>${esc(label)}</span></summary>
      <div class="hc-in">
        ${r.tests.length ? `<ul class="hc-tests">${r.tests.map((t) => `<li class="${t.skip ? 'skip' : t.ok ? 'ok' : 'bad'}"><i class="hc-dot"></i><span>${esc(t.label)}</span><small>${t.skip ? esc(t.note || 'skipped') : `${t.ms ? AddonCheck.sec(t.ms) : ''}${t.note ? ` · ${esc(t.note)}` : ''}${!t.ok ? ' · failed' : ''}`}</small></li>`).join('')}</ul>` : ''}
        ${info.length ? `<ul class="hc-info">${info.map((f) => `<li>${esc(f.text)}${f.fix ? ` <span>${esc(f.fix)}</span>` : ''}</li>`).join('')}</ul>` : ''}
        ${r.verdict === 'good' && !info.length ? '<p class="hc-good">Fast, and everything it offers answered.</p>' : ''}
      </div></details>`;
  },
  button(f, key) {
    const who = (f.who || []).filter((b) => engine.addons.some((a) => a.baseUrl === b || this.k(a.baseUrl) === b));
    if (!who.length) return '';
    const real = (b) => (engine.addons.find((a) => a.baseUrl === b || this.k(a.baseUrl) === b) || {}).baseUrl;
    const k = esc(key), w = esc(JSON.stringify(who.map(real)));
    if (f.act === 'off' || f.act === 'remove') return `<button class="btn btn-ghost hc-btn" type="button" data-nav data-hcact="off" data-k="${k}" data-who="${w}"><i data-lucide="power"></i>Turn ${who.length > 1 ? 'them' : 'it'} off</button>`;
    if (f.act === 'down') return `<button class="btn btn-ghost hc-btn" type="button" data-nav data-hcact="down" data-who="${w}"><i data-lucide="arrow-down"></i>Move down</button>`;
    if (f.act === 'dupe' && who.length > 1) return `<button class="btn btn-ghost hc-btn" type="button" data-nav data-hcact="dupe" data-who="${w}"><i data-lucide="copy-x"></i>Keep the best copy</button>`;
    if (f.act === 'setup') {
      const r = f.r || {}, m = r.manifest || {}, bh = m.behaviorHints || {};
      if (!(bh.configurable || bh.configurationRequired) || IS_TV) return IS_TV && (bh.configurable || bh.configurationRequired) ? '<small class="hc-tv">Open the addon’s setup page on your phone or computer, then install the new link here.</small>' : '';
      return `<button class="btn btn-ghost hc-btn" type="button" data-nav data-hcact="setup" data-who="${w}"><i data-lucide="external-link"></i>Open its setup page</button>`;
    }
    return '';
  },
  act(x) {
    let who = []; try { who = JSON.parse(x.dataset.who || '[]'); } catch (e) { return; }
    const live = who.map((b) => engine.addons.find((a) => a.baseUrl === b)).filter(Boolean);
    if (!live.length) { toast('That addon is no longer in your list', 'info'); return; }
    const kind = x.dataset.hcact;
    if (kind === 'off') { live.forEach((a) => { if (a.enabled) engine.toggle(a.baseUrl); }); toast(`Turned off ${live.map((a) => a.manifest.name).join(', ')}. Switch it back on in Addons any time.`, 'ok', 5000); }
    else if (kind === 'down') {
      // below the first addon that answers title pages quickly
      const fast = engine.addons.find((a) => a.enabled && !who.includes(a.baseUrl) && engine.supports(a, 'meta', 'movie', 'tt1375666') && !((this.byBase.get(a.baseUrl) || {}).verdict in { bad: 1, blocked: 1 }));
      if (!fast) { toast('No faster addon for title pages to move it below', 'info'); return; }
      live.forEach((a) => { for (let g = 0; g < 200 && engine.addons.indexOf(a) < engine.addons.indexOf(fast); g++) engine.move(a.baseUrl, 1); });
      toast(`Moved ${live.map((a) => a.manifest.name).join(', ')} below ${fast.manifest.name}`, 'ok');
    } else if (kind === 'dupe') {
      const score = (a) => { const r = this.byBase.get(a.baseUrl); return r ? this.RANK[r.verdict] * 100000 - ((r.stream && r.stream.ms) || 0) : -1; };
      const keep = live.slice().sort((a, b) => score(b) - score(a))[0];
      live.filter((a) => a !== keep && !a.builtin).forEach((a) => engine.remove(a.baseUrl));
      toast(`Kept one copy of ${keep.manifest.name}`, 'ok');
    } else if (kind === 'setup') { window.open(`${live[0].baseUrl}/configure`, '_blank', 'noopener'); return; }
    x.disabled = true; x.innerHTML = '<i data-lucide="check"></i>Done'; icons();
    if (!$('#addons').hidden) renderAddons();
  },
};
