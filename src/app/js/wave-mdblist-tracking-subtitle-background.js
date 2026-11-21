
'use strict';
/* 2.87 wave 6: MDBList tracking, subtitle background colour */
(() => {
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('2.87f', e); } };
  if (typeof CFG_DEFAULTS === 'object') Object.assign(CFG_DEFAULTS, { mdbTrack: false, subBgColor: '#000000' });
  ['mdbTrack', 'subBgColor'].forEach((k) => { if (!(k in CFG)) CFG[k] = CFG_DEFAULTS[k]; });

  /* ---- subtitles: the background box in any colour (the opacity slider still sets how solid it is) ---- */
  const hex = (h) => (/^#[0-9a-f]{6}$/i.test(h || '') ? h : '#000000');
  const subBg = () => safe(() => {
    const c = hex(CFG.subBgColor), a = clamp((Number(CFG.subBg) || 0) / 100, 0, 1);
    document.documentElement.style.setProperty('--sub-bg', `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`);
  });
  safe(() => { const aa = applyAll; applyAll = function () { const r = aa.apply(this, arguments); subBg(); return r; }; });
  CFG_HOOKS.push((k) => { if (k === 'subBg' || k === 'subBgColor' || k === 'subColor') { subBg(); if (typeof styleCues === 'function') safe(() => styleCues()); } });

  /* ---- MDBList tracking: what you watch is scrobbled to your MDBList account, and watched history syncs both ways ----
     Your own free MDBList API key (the same one that reads MDBList rows and scores). Writes go straight to MDBList;
     if the browser can't reach it that way, they go through MKCinema's MDBList relay (nothing is stored or logged there). */
  const MdbT = {
    B: 'https://api.mdblist.com', busy: false, q: new Map(), qT: 0,
    key() { return (safe(() => Keys.get().mdblist) || '').trim(); },
    on() { return CFG.mdbTrack === true && !!this.key(); },
    how() { return safe(() => Store.get('mdbHow', '')) || ''; },
    relay() {
      const c = safe(() => Account.config()); if (!c || !c.url) return null;
      return { u: `${String(c.url).replace(/\/+$/, '')}/functions/v1/mdblist-relay`, k: c.anonKey || '' };
    },
    err(r) { return new Error(r.status === 401 || r.status === 403 ? 'MDBList did not accept the API key' : r.status === 429 ? 'MDBList is busy. Try again in a few minutes.' : `MDBList ${r.status}`); },
    async post(path, body) {
      const k = this.key(); if (!k) throw new Error('Add your free MDBList API key first');
      const txt = JSON.stringify(body);
      if (this.how() !== 'relay') {
        // a plain-text body needs no browser pre-check, which MDBList does not answer
        let r = null; try { r = await fetch(`${this.B}${path}?apikey=${encodeURIComponent(k)}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: txt }); } catch (e) { r = null; }
        if (r && r.ok) { safe(() => Store.set('mdbHow', 'direct')); return r.json().catch(() => ({})); }
        if (r && (r.status === 401 || r.status === 403 || r.status === 429)) throw this.err(r);
        if (r && r.status !== 400 && r.status !== 415) throw this.err(r);
      }
      const rl = this.relay(); if (!rl) throw new Error('MDBList could not be reached');
      const r = await fetch(`${rl.u}?path=${encodeURIComponent(path)}`, { method: 'POST', headers: { apikey: rl.k, 'x-mdb-key': k, 'content-type': 'application/json' }, body: txt });
      if (!r.ok) throw this.err(r);
      safe(() => Store.set('mdbHow', 'relay'));
      return r.json().catch(() => ({}));
    },
    async get(path, qs) {
      const k = this.key(); if (!k) throw new Error('Add your free MDBList API key first');
      const u = new URL(this.B + path); Object.entries(qs || {}).forEach(([a, b]) => { if (b != null && b !== '') u.searchParams.set(a, b); }); u.searchParams.set('apikey', k);
      const r = await fetch(u.href); if (!r.ok) throw this.err(r); return r.json();
    },
    item(ctx) {
      const x = safe(() => Trakt.ids(ctx)); if (!x || !x.id) return null;
      return ctx.video ? { show: { ids: { imdb: x.id }, season: Number(x.season), episode: Number(x.episode) } } : { movie: { ids: { imdb: x.id } } };
    },
    scrobble(action, ctx, pct) {
      if (!this.on() || !ctx) return;
      const it = this.item(ctx); if (!it) return;
      this.post(`/scrobble/${action}`, { ...it, progress: Number((pct || 0).toFixed(2)), app_name: 'MKCinema', app_version: typeof APP_VERSION === 'string' ? APP_VERSION : '' }).catch(() => {});
    },
    /* a title marked watched by hand goes up on its own (no date, so one already on MDBList is not counted twice) */
    queue(id) {
      if (!this.on() || !/^tt\d+(:\d+:\d+)?$/.test(String(id))) return;
      this.q.set(id, 1); clearTimeout(this.qT); this.qT = setTimeout(() => { const ids = [...this.q.keys()]; this.q.clear(); this.push(ids, false).catch(() => {}); }, 3000);
    },
    body(ids, dated) {
      const w = watchedMap(), movies = [], shows = new Map();
      ids.forEach((id) => {
        const at = dated && w[id] ? new Date(w[id]).toISOString() : undefined;
        const m = /^(tt\d+)(?::(\d+):(\d+))?$/.exec(id); if (!m) return;
        if (!m[2]) { movies.push(at ? { ids: { imdb: m[1] }, watched_at: at } : { ids: { imdb: m[1] } }); return; }
        if (!shows.has(m[1])) shows.set(m[1], new Map());
        const ss = shows.get(m[1]); if (!ss.has(m[2])) ss.set(m[2], []);
        ss.get(m[2]).push(at ? { number: Number(m[3]), watched_at: at } : { number: Number(m[3]) });
      });
      return { movies, shows: [...shows].map(([imdb, ss]) => ({ ids: { imdb }, seasons: [...ss].map(([n, eps]) => ({ number: Number(n), episodes: eps })) })) };
    },
    async push(ids, dated) {
      let n = 0;
      for (let i = 0; i < ids.length; i += 400) {
        const b = this.body(ids.slice(i, i + 400), dated);
        for (let j = 0; j < Math.max(1, Math.ceil(b.shows.length / 150)); j++) {
          const part = { movies: j ? [] : b.movies, shows: b.shows.slice(j * 150, (j + 1) * 150) };
          if (!part.movies.length && !part.shows.length) continue;
          await this.post('/sync/watched', part); n += part.movies.length + part.shows.reduce((a, s) => a + s.seasons.reduce((x, y) => x + y.episodes.length, 0), 0);
        }
      }
      return n;
    },
    /* both ways: what MDBList has comes in, what only MKCinema has goes up with the day you watched it */
    async sync(quiet) {
      if (this.busy) return; if (!this.key()) { if (!quiet) toast('Add your free MDBList API key first', 'err'); return; }
      this.busy = true; this.paint();
      try {
        const there = new Set(), got = {};
        let cursor = '', pages = 0;
        do {
          const j = await this.get('/sync/watched', { limit: 1000, cursor });
          (j.movies || []).forEach((x) => { const id = x.movie && x.movie.ids && x.movie.ids.imdb; if (id) { there.add(id); got[id] = Date.parse(x.watched_at || x.last_watched_at || '') || Date.now(); } });
          (j.episodes || []).forEach((x) => { const e = x.episode || {}, sh = e.show || x.show || {}, id = sh.ids && sh.ids.imdb; if (id && e.season != null && e.number != null) { const k = `${id}:${e.season}:${e.number}`; there.add(k); got[k] = Date.parse(x.last_watched_at || x.watched_at || '') || Date.now(); } });
          cursor = (j.pagination && j.pagination.next_cursor) || ''; pages++;
        } while (cursor && pages < 30);
        const w = watchedMap(); let inN = 0;
        Object.entries(got).forEach(([k, t]) => { if (!w[k]) { w[k] = t; inN++; } });
        if (inN) Store.set('watched', w);
        const up = Object.keys(w).filter((k) => /^tt\d+(:\d+:\d+)?$/.test(k) && !there.has(k));
        const upN = up.length ? await this.push(up, true) : 0;
        Store.set('mdbSyncAt', Date.now());
        if (!quiet || inN || upN) toast(inN || upN ? `MDBList synced: ${inN} watched brought in, ${upN} sent.` : 'MDBList and MKCinema already match.', 'ok', 5000, 'mdb');
        if (inN && typeof rerender === 'function') safe(() => rerender());
      } catch (e) { if (!quiet) toast(`MDBList sync didn’t finish: ${e.message}`, 'err', 6000, 'mdb'); }
      finally { this.busy = false; this.paint(); }
    },
    paint() {
      const st = document.getElementById('mdbT-st'), b = document.getElementById('mdbT-sync'); if (!st) return;
      const at = Number(Store.get('mdbSyncAt', 0));
      st.textContent = !this.key() ? 'Add your API key above.' : this.busy ? 'Syncing…' : at ? `Last synced ${new Date(at).toLocaleString(typeof appLocale === 'function' ? appLocale() : undefined, { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Not synced yet.';
      if (b) b.disabled = this.busy || !this.key();
    },
  };
  window.MkMdbTrack = MdbT;
  safe(() => {
    const send = Scrobble.send;
    Scrobble.send = function (action) { const r = send.apply(this, arguments); safe(() => MdbT.scrobble(action, this.ctx, this.pct())); return r; };
    const mw = markWatched;
    markWatched = function (id) { const had = isWatched(id), r = mw.apply(this, arguments); if (!had && isWatched(id)) safe(() => { const c = P.ctx, key = c ? (c.video ? c.video.id : c.meta.id) : ''; if (key !== id) MdbT.queue(id); }); return r; };
  });
  // a daily sync when tracking is on
  setTimeout(() => safe(() => { if (MdbT.on() && Date.now() - Number(Store.get('mdbSyncAt', 0)) > 864e5) MdbT.sync(true); }), 25000);
  CFG_HOOKS.push((k, v) => { if (k === 'mdbTrack' && v === true) safe(() => { if (MdbT.key()) MdbT.sync(false); }); });

  /* ---- settings rows ---- */
  safe(() => {
    const sb = typeof secById === 'function' && secById('subtitles');
    if (sb) {
      const rows = sb.rows;
      sb.rows = () => { const r = rows(), at = r.findIndex((x) => x.key === 'subBg'); r.splice(at >= 0 ? at + 1 : r.length, 0,
        { key: 'subBgColor', label: 'Background color', help: 'The colour of the box behind the words. Set Background opacity to 100% for a solid box, such as white words on black.', type: 'color', get: () => hex(CFG.subBgColor) });
        return r; };
    }
    const plan = typeof SetTidy === 'object' && SetTidy.PLAN && SetTidy.PLAN.subtitles;
    if (plan) { const g = plan.find((x) => Array.isArray(x[1]) && x[1].includes('subBg')); if (g && !g[1].includes('subBgColor')) g[1].splice(g[1].indexOf('subBg') + 1, 0, 'subBgColor'); }
    const sy = typeof secById === 'function' && secById('sync');
    if (sy) {
      sy.label = 'Trakt, Simkl & MDBList';
      const rows = sy.rows, bind = sy.bind;
      sy.rows = () => [...rows(),
        { group: 'MDBList' },
        { key: 'mdbKeySync', label: 'MDBList API key', help: 'Free at mdblist.com/preferences. The same key reads MDBList rows and scores. Syncs with your other keys.', type: 'secret', get: () => Keys.get().mdblist || '', set: (v) => setMdbKey(v) },
        { key: 'mdbTrack', label: 'Track what you watch on MDBList', help: 'Films and episodes you play show up on MDBList as you watch, and count as watched past 80%. Your watched history syncs both ways once a day.', type: 'toggle' },
        { html: () => `<div class="set-row"><div><b>Watched history</b><small id="mdbT-st"></small></div><div class="set-ctl"><button class="btn btn-ghost btn-sm" type="button" id="mdbT-sync"><i data-lucide="refresh-ccw"></i>Sync now</button></div></div>` }];
      sy.bind = function () { const v = bind ? bind.apply(this, arguments) : undefined; safe(() => { const b = document.getElementById('mdbT-sync'); if (b) b.onclick = () => MdbT.sync(false); MdbT.paint(); }); return v; };
    }
  });
  subBg();
})();
