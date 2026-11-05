'use strict';
/* =====================================================================
   MKCinema 2.21.0 · the "what MKCinema still needs" list
   - Delete account (Settings › Account, and mkcinema.pages.dev/#delete-account for Google Play)
   - Privacy policy, status page and the owner's log reader (privacy.html, status.html, logs.html)
   - Duplicate sources from several addons fold into one row ("also in …")
   - Audio sync: delay the sound when it runs ahead of the picture
   - Subtitle translation on the device (browsers with the built-in Translator)
   - Letterboxd import, share a title link
   - Android TV app 1.6.0: frame-rate matching in the in-app player, Continue watching on the TV home screen
   ===================================================================== */

const Gaps = {
  BASE: 'https://mkcinema.pages.dev/',
  sync() { try { if (Account.user && CFG.cloudSync !== false) Account.schedule(); } catch (e) { /* not signed in */ } },
};

/* ---------------- Delete account ---------------- */
const DeleteAccount = {
  async run(btn) {
    if (!Account.user || !Account.client) { toast('Sign in first, then delete your account here', 'err'); return; }
    confirmTwice(btn, async () => {
      btn.disabled = true;
      try {
        const { data, error } = await Account.client.rpc('mkcinema_delete_me');
        if (error) throw error;
        // nothing of this account stays on this device either
        ['watchlist', 'progress', 'watched', 'taste', 'studio', 'homeLayout', 'vault', 'keys'].forEach((k) => { try { localStorage.removeItem(Store.key(k)); localStorage.removeItem(`mkc:${k}`); } catch (e) { /* gone */ } });
        try { await Account.client.auth.signOut(); } catch (e) { /* already signed out */ }
        toast(data === 'account' ? 'Your account and everything synced with it are deleted' : 'Your MKCinema data is deleted. Your sign-in is shared with another app, so only MKCinema data was removed.', 'ok', 8000);
        setTimeout(() => location.reload(), 2500);
      } catch (e) {
        btn.disabled = false;
        toast(/function .* does not exist|PGRST202/i.test(`${e.message} ${e.code}`) ? 'Account deletion is being set up. Try again in a few minutes.' : `Could not delete: ${e.message || e}`, 'err', 7000);
      }
    });
  },
  init() {
    const sec = secById('account'); if (!sec) return;
    const rows = sec.rows;
    sec.rows = () => [...rows(), { group: 'Delete account' }, {
      key: 'deleteAccount', label: 'Delete my account', danger: true, type: 'button', text: 'Delete account', icon: 'user-x',
      help: 'Removes your MKCinema account and everything synced with it: library, progress, addons, settings and saved keys. This cannot be undone. Anything stored only on this device is cleared too.',
      run: (el) => this.run(el),
    }];
    // the public link stores ask for: mkcinema.pages.dev/#delete-account
    const go = () => { if (location.hash !== '#delete-account') return; history.replaceState(null, '', location.pathname); setTimeout(() => { openSettings('account'); setTimeout(() => { const b = $('#set-deleteAccount'); if (b) { b.scrollIntoView({ block: 'center' }); if (IS_TV) Nav.focus(b); } }, 120); }, 300); };
    addEventListener('hashchange', go); go();
  },
};

/* ---------------- Privacy, status, logs (About and Help) ---------------- */
const InfoPages = {
  init() {
    const ab = secById('about');
    if (ab) { const rows = ab.rows; ab.rows = () => [{ key: 'privacyPage', label: 'Privacy policy', help: 'What MKCinema stores, where, and how to delete it.', type: 'button', text: 'Read privacy policy', icon: 'shield-check', run: () => window.open('privacy.html', '_blank', 'noopener') }, ...rows()]; }
    const hp = secById('help');
    if (hp) { const rows = hp.rows; hp.rows = () => [...rows(), { key: 'statusPage', label: 'Service status', help: 'Checks MKCinema, sign-in, the relays and the title and artwork sources from your connection.', type: 'button', text: 'Open status page', icon: 'activity', run: () => window.open('status.html', '_blank', 'noopener') }]; }
  },
};

/* ---------------- One row per source: duplicates across addons fold together ---------------- */
const Dedupe = {
  key(s) {
    const bh = s.behaviorHints || {};
    if (s.infoHash) return `h:${String(s.infoHash).toLowerCase()}:${s.fileIdx == null ? '' : s.fileIdx}`;
    const name = bh.filename || '', size = bh.videoSize || 0;
    if (name && size) return `f:${name.toLowerCase()}:${size}`;
    return '';
  },
  apply(list) {
    if (CFG.dedupeStreams === false) return list;
    const seen = new Map(), out = [];
    for (const s of list) {
      const k = this.key(s);
      if (!k) { out.push(s); continue; }
      const first = seen.get(k);
      if (!first) { s._dups = []; seen.set(k, s); out.push(s); continue; }
      if (s._addon && s._addon !== first._addon && !first._dups.includes(s._addon)) first._dups.push(s._addon);
      // keep the cached / browser-ready copy when only the duplicate has it
      if ((s._tel.cached === true && first._tel.cached !== true) || (s._tel.webReady && !first._tel.webReady)) { out[out.indexOf(first)] = s; s._dups = [first._addon, ...first._dups.filter((a) => a !== s._addon)]; seen.set(k, s); }
    }
    return out;
  },
  init() {
    const vs = visibleStreams; visibleStreams = function (streams) { return Dedupe.apply(vs.apply(this, arguments)); };
    const row = streamRowHTML;
    streamRowHTML = function (s) {
      const h = row.apply(this, arguments);
      if (!s._dups || !s._dups.length) return h;
      return h.replace('</div>\n    <span class="go">', `<div class="s-also">Also in ${esc(s._dups.slice(0, 3).join(', '))}${s._dups.length > 3 ? ` +${s._dups.length - 3}` : ''}</div></div>\n    <span class="go">`);
    };
    const st = secById('streams');
    if (st) { const rows = st.rows; st.rows = () => { const r = rows(); r.splice(Math.min(2, r.length), 0, { key: 'dedupeStreams', label: 'Fold duplicate sources', help: 'When several addons find the same file, show it once with "Also in …" underneath. The cached or browser-ready copy is the one kept.', type: 'toggle', get: () => CFG.dedupeStreams !== false }); return r; }; }
  },
};

/* ---------------- Audio sync: delay the sound when it is ahead of the picture ---------------- */
const AudioSync = {
  ms: 0, delay: null, wired: false,
  html() {
    return `<h5>Audio sync · sound ${this.ms ? `${this.ms} ms later` : 'in sync'}</h5><div class="seg-row" data-async><button type="button" data-asd="-50" aria-label="Less delay">−50</button><button type="button" data-asd="0" title="Reset">${this.ms} ms</button><button type="button" data-asd="50" aria-label="More delay">+50</button><button type="button" data-asd="250">+250</button></div>
      <p class="as-note">Use this when voices come before lips move. Sound that comes late is usually Bluetooth: your phone or TV corrects that itself.</p>`;
  },
  bind(m) {
    $$('[data-asd]', m).forEach((b) => b.addEventListener('click', () => { const d = Number(b.dataset.asd); this.set(d ? this.ms + d : 0); }));
  },
  wire() {
    if (typeof PxBoost !== 'undefined') { if (!PxBoost.graph()) return false; }
    else if (!DSP.attached && !DSP.attach()) return false;
    const ctx = DSP.ctx;
    if (!this.delay || this.delay.context !== ctx) this.delay = ctx.createDelay(2.5);
    if (!this.wired) {
      const tail = typeof PxBoost !== 'undefined' ? PxBoost.out : DSP.n.an;
      try { tail.disconnect(ctx.destination); } catch (e) { try { tail.disconnect(); } catch (e2) { /* fresh */ } }
      tail.connect(this.delay); this.delay.connect(ctx.destination); this.wired = true;
    }
    return true;
  },
  async set(ms) {
    ms = clamp(Math.round(ms / 10) * 10, 0, 2000);
    if (ms && !this.wire()) {
      if (P.stream && !P.stream._local && !P.hls) {
        const s = P.stream; if (typeof PxBoost !== 'undefined') PxBoost.need = true; else CFG.dsp = CFG.dsp || 'flat';
        this.ms = ms; this.pending = true; await DSP.prepare(s);
        if (s._cors === 'none') { this.ms = 0; this.pending = false; toast('This source does not let the browser move its sound. Another source or your MKCinema server can.', 'err', 6000); return; }
        toast('Reconnecting the stream so its sound can be shifted…', 'info', 2200);
        playStream(P.ctx, s, { startAt: pNow() }); return;
      }
      toast('Audio sync is not available for this source', 'err'); return;
    }
    this.ms = ms;
    if (this.delay) { const t = this.delay.context.currentTime; this.delay.delayTime.cancelScheduledValues(t); this.delay.delayTime.setTargetAtTime(ms / 1000, t, 0.05); }
    toast(ms ? `Sound ${ms} ms later` : 'Audio sync reset', 'info', 900, 'async');
    if (!$('#optMenu').hidden) renderOptMenu();
  },
  init() {
    if (typeof PxAudio !== 'undefined' && PxAudio.html) { const ah = PxAudio.html.bind(PxAudio); PxAudio.html = () => ah() + this.html(); }
    const ro = renderOptMenu;
    renderOptMenu = function () {
      const r = ro.apply(this, arguments); const m = $('#optMenu');
      if (!$('[data-async]', m)) { m.insertAdjacentHTML('beforeend', AudioSync.html()); }
      AudioSync.bind(m); return r;
    };
    // the graph belongs to the element: re-apply after a reconnect, forget at the end of a title
    video.addEventListener('playing', () => { if (this.pending || this.ms) { this.pending = false; this.wired = false; if (this.wire() && this.delay) this.delay.delayTime.value = this.ms / 1000; } });
    const td = teardown; teardown = function () { if (!AudioSync.pending) AudioSync.ms = 0; AudioSync.wired = false; if (AudioSync.delay) try { AudioSync.delay.delayTime.value = 0; } catch (e) { /* closed */ } return td.apply(this, arguments); };
  },
};

/* ---------------- Subtitle translation on the device ---------------- */
const SubTranslate = {
  on: false, tr: null, from: '', orig: new WeakMap(), timer: 0, busy: false,
  api: () => typeof self.Translator !== 'undefined',
  target() { return String(CFG.subTranslateTo || CFG.uiLang || navigator.language || 'en').slice(0, 2).toLowerCase(); },
  track() { return Array.from(video.textTracks).find((t) => t.mode === 'showing' || (t.mode === 'hidden' && t.cues && t.cues.length)); },
  async detect(text) {
    const cur = P.subs && P.subs[P.curSub]; const l = cur && cur.lang ? String(cur.lang).slice(0, 2).toLowerCase() : '';
    if (l && /^[a-z]{2}$/.test(l)) return l;
    try { if (self.LanguageDetector) { const d = await LanguageDetector.create(); const r = await d.detect(text); return r[0] && r[0].detectedLanguage; } } catch (e) { /* no detector */ }
    return 'en';
  },
  async start() {
    const t = this.track(); if (!t || !t.cues || !t.cues.length) { toast('Pick a subtitle first, then translate it', 'err'); return; }
    const sample = Array.from(t.cues).slice(0, 20).map((c) => c.text).join('\n');
    const from = await this.detect(sample), to = this.target();
    if (from === to) { toast('These subtitles are already in your language', 'info'); return; }
    try {
      const av = await Translator.availability({ sourceLanguage: from, targetLanguage: to });
      if (av === 'unavailable') { toast(`Your browser cannot translate ${langName(from)} to ${langName(to)}`, 'err', 5000); return; }
      if (av !== 'available') toast('Downloading the translation model once. It stays on this device…', 'info', 4000);
      this.tr = await Translator.create({ sourceLanguage: from, targetLanguage: to });
    } catch (e) { toast(`Translation could not start: ${e.message || e}`, 'err', 5000); return; }
    this.on = true; this.from = from; this.tick(); clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 1500);
    toast(`Translating subtitles to ${langName(to)} on this device`, 'ok');
    renderSubMenu();
  },
  stop() {
    this.on = false; clearInterval(this.timer); const t = this.track();
    if (t && t.cues) Array.from(t.cues).forEach((c) => { const o = this.orig.get(c); if (o != null) c.text = o; });
    try { this.tr && this.tr.destroy && this.tr.destroy(); } catch (e) { /* gone */ } this.tr = null;
    if (!$('#subMenu').hidden) renderSubMenu();
  },
  async tick() {
    if (!this.on || this.busy || !this.tr) return; const t = this.track(); if (!t || !t.cues) return;
    const now = video.currentTime, todo = Array.from(t.cues).filter((c) => c.endTime > now - 2 && c.startTime < now + 90 && !this.orig.has(c)).slice(0, 12);
    if (!todo.length) return; this.busy = true;
    try {
      for (const c of todo) {
        if (!this.on) break; const o = c.text; this.orig.set(c, o);
        try { const tags = o.match(/^(<[^>]+>)+/); const plain = o.replace(/<[^>]+>/g, ''); const out = await this.tr.translate(plain); c.text = tags ? tags[0] + out : out; } catch (e) { /* keep original line */ }
      }
    } finally { this.busy = false; }
  },
  init() {
    if (!this.api()) return;
    const rs = renderSubMenu;
    renderSubMenu = function () {
      const r = rs.apply(this, arguments); const m = $('#subMenu'); if (!m || !P.subs) return r;
      const lbl = SubTranslate.on ? 'Stop translating' : `Translate to ${langName(SubTranslate.target())}`;
      m.insertAdjacentHTML('beforeend', `<button type="button" data-subtr class="${SubTranslate.on ? 'on' : ''}"><i data-lucide="languages"></i>${esc(lbl)}</button>`);
      $('[data-subtr]', m).onclick = () => (SubTranslate.on ? SubTranslate.stop() : SubTranslate.start()); icons(); return r;
    };
    const ss = selectSub; selectSub = function () { if (SubTranslate.on) SubTranslate.stop(); return ss.apply(this, arguments); };
    const td = teardown; teardown = function () { if (SubTranslate.on) SubTranslate.stop(); return td.apply(this, arguments); };
  },
};

/* ---------------- Letterboxd import ---------------- */
const Letterboxd = {
  csv(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; continue; }
      if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
    }
    if (f || row.length) { row.push(f); rows.push(row); }
    const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
    return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  },
  /* a Letterboxd export is a .zip: read its CSVs without a library */
  async unzip(buf) {
    const dv = new DataView(buf), out = {}; let p = 0;
    while (p + 30 < buf.byteLength && dv.getUint32(p, true) === 0x04034b50) {
      const method = dv.getUint16(p + 8, true), csize = dv.getUint32(p + 18, true), nlen = dv.getUint16(p + 26, true), xlen = dv.getUint16(p + 28, true);
      const name = new TextDecoder().decode(new Uint8Array(buf, p + 30, nlen)); const start = p + 30 + nlen + xlen; const data = new Uint8Array(buf, start, csize);
      if (/\.csv$/i.test(name) && !name.includes('/')) {
        if (method === 0) out[name.toLowerCase()] = new TextDecoder().decode(data);
        else if (method === 8 && self.DecompressionStream) out[name.toLowerCase()] = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
      }
      p = start + csize;
    }
    return out;
  },
  cache: new Map(),
  async find(name, year) {
    const k = `${name}|${year}`; if (this.cache.has(k)) return this.cache.get(k);
    let hit = null;
    try {
      const r = await fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(name)}.json`); const j = await r.json();
      const metas = j.metas || []; const yr = Number(year);
      hit = metas.find((m) => String(m.name).toLowerCase() === name.toLowerCase() && Math.abs(parseInt(m.releaseInfo || m.year, 10) - yr) <= 1)
        || metas.find((m) => Math.abs(parseInt(m.releaseInfo || m.year, 10) - yr) <= 0) || null;
    } catch (e) { hit = null; }
    this.cache.set(k, hit); return hit;
  },
  async run(files) {
    let csvs = {};
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) Object.assign(csvs, await this.unzip(await f.arrayBuffer()));
      else if (/\.csv$/i.test(f.name)) csvs[f.name.toLowerCase()] = await f.text();
    }
    const watched = [...this.csv(csvs['watched.csv'] || ''), ...this.csv(csvs['diary.csv'] || '')], list = this.csv(csvs['watchlist.csv'] || '');
    if (!watched.length && !list.length) { toast('No watched.csv or watchlist.csv found. Export from Letterboxd › Settings › Data › Export.', 'err', 7000); return; }
    const all = new Map(); [...watched.map((r) => ({ r, w: true })), ...list.map((r) => ({ r, w: false }))].forEach(({ r, w }) => { const k = `${r.name}|${r.year}`; const o = all.get(k) || { name: r.name, year: r.year }; if (w) o.watched = true; else o.list = true; all.set(k, o); });
    const items = [...all.values()].filter((x) => x.name);
    let done = 0, added = 0, seen = 0, missed = 0;
    toast(`Matching ${items.length} films…`, 'info', 3000, 'lbx');
    const queue = items.slice(); const workers = Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const it = queue.shift(); const m = await this.find(it.name, it.year); done++;
        if (!m) missed++;
        else {
          if (it.watched && !isWatched(m.id)) { const w = watchedMap(); w[m.id] = Date.now(); seen++; }
          if (it.list && !it.watched && !inWatchlist(m.id)) { S.watchlist.push({ id: m.id, type: 'movie', name: m.name, poster: m.poster, background: m.background, releaseInfo: m.releaseInfo, genres: (m.genres || []).slice(0, 3), imdbRating: m.imdbRating }); added++; }
        }
        if (done % 25 === 0) toast(`Matched ${done} of ${items.length}…`, 'info', 1500, 'lbx');
      }
    });
    await Promise.all(workers);
    Store.set('watched', watchedMap()); Store.set('watchlist', S.watchlist); Gaps.sync();
    if (S.view === 'library' && typeof renderLibrary === 'function') renderLibrary();
    toast(`Letterboxd: ${seen} marked watched, ${added} added to your watchlist${missed ? `, ${missed} not found` : ''}`, 'ok', 8000);
  },
  pick() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.zip,.csv'; inp.multiple = true;
    inp.onchange = () => { if (inp.files.length) this.run(Array.from(inp.files)); }; inp.click();
  },
  init() {
    if (IS_TV) return;
    const ac = secById('account');
    if (ac) { const rows = ac.rows; ac.rows = () => { const r = rows(); const i = r.findIndex((x) => x.key === 'importStremio'); r.splice(i < 0 ? 1 : i + 1, 0, { key: 'importLetterboxd', label: 'Import from Letterboxd', help: 'Choose the .zip from Letterboxd › Settings › Data › Export. Films you logged are marked watched and your Letterboxd watchlist joins yours. Nothing is sent to Letterboxd.', type: 'button', text: 'Import from Letterboxd', icon: 'file-up', run: () => this.pick() }); return r; }; }
  },
};

/* ---------------- Share a title ---------------- */
const ShareTitle = {
  url(m) { return `${Gaps.BASE}#title?type=${encodeURIComponent(m.type)}&id=${encodeURIComponent(m.id)}`; },
  async share(m) {
    const url = this.url(m), title = `${m.name}${yearOf(m) ? ` (${yearOf(m)})` : ''} on MKCinema`;
    if (navigator.share && TOUCH_UI) { try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(url); toast('Link copied. It opens this title in MKCinema.', 'ok'); } catch (e) { prompt('Copy this link', url); }
  },
  async open() {
    const h = location.hash; if (!h.startsWith('#title?')) return;
    const q = new URLSearchParams(h.slice(7)); history.replaceState(null, '', location.pathname);
    const type = q.get('type'), id = q.get('id'); if (!/^(movie|series|anime|tv|channel)$/.test(type || '') || !id || id.length > 80) return;
    let meta = { id, type, name: '' };
    try { meta = remember({ ...meta, ...((await engine.fetchMeta(type, id)) || {}) }); } catch (e) { /* basics only */ }
    openDetail(meta);
  },
  init() {
    const rd = renderDetail;
    renderDetail = function () {
      const r = rd.apply(this, arguments); const l = $('#dList');
      if (l && !$('#dShare') && !IS_TV) { l.insertAdjacentHTML('afterend', '<button class="btn btn-ghost" type="button" id="dShare" data-nav><i data-lucide="share-2"></i>Share</button>'); $('#dShare').onclick = () => ShareTitle.share(D.meta); icons(); }
      return r;
    };
    addEventListener('hashchange', () => this.open());
    if (location.hash.startsWith('#title?')) setTimeout(() => this.open(), 400);
  },
};

/* ---------------- Android TV 1.6.0: frame-rate matching for the in-app player, Continue watching on the home screen ---------------- */
const TvBridge = {
  has: (f) => IS_TV && window.MKAndroid && typeof MKAndroid[f] === 'function',
  RATES: [23.976, 24, 25, 29.97, 30, 47.952, 48, 50, 59.94, 60],
  measured: null,
  measure() {
    if (!this.has('fps') || CFG.matchRate === false || !video.requestVideoFrameCallback || this.measured === P.stream) return;
    this.measured = P.stream; const times = [];
    const step = (now, md) => {
      times.push(md.mediaTime);
      if (times.length < 48 && !video.paused) { video.requestVideoFrameCallback(step); return; }
      const d = times.slice(1).map((t, i) => t - times[i]).filter((x) => x > 0.005 && x < 0.1).sort((a, b) => a - b);
      if (d.length < 12) return;
      const fps = 1 / d[Math.floor(d.length / 2)], snap = this.RATES.reduce((a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a));
      if (Math.abs(snap - fps) / snap < 0.03) { try { MKAndroid.fps(snap); } catch (e) { /* old app */ } }
    };
    video.requestVideoFrameCallback(step);
  },
  sent: {}, last: {},
  progress(all) {
    if (!this.has('watchNext')) return;
    const now = Date.now();
    // newest progress per title goes to the home screen row, at most once a minute per title
    const byMeta = {}; Object.values(all || {}).forEach((p) => { if (p && p.metaId && (!byMeta[p.metaId] || p.at > byMeta[p.metaId].at)) byMeta[p.metaId] = p; });
    Object.values(byMeta).forEach((p) => {
      if (!p.at || now - p.at > 15000 || (this.sent[p.metaId] && now - this.sent[p.metaId] < 60000)) return;
      this.sent[p.metaId] = now;
      try { MKAndroid.watchNext(JSON.stringify({ id: p.metaId, type: p.type, name: p.name, poster: p.poster, background: p.background, positionMs: Math.round((p.t || 0) * 1000), durationMs: Math.round((p.d || 0) * 1000), season: p.season, episode: p.episode, episodeTitle: p.epTitle || '' })); } catch (e) { /* old app */ }
    });
    // titles that left Continue watching (finished or cleared) leave the home screen too
    Object.keys(this.last).forEach((id) => { if (!byMeta[id]) { try { MKAndroid.watchNextRemove(id); } catch (e) { /* old app */ } delete this.sent[id]; } });
    this.last = byMeta;
  },
  init() {
    if (!IS_TV || !window.MKAndroid) return;
    video.addEventListener('playing', () => setTimeout(() => this.measure(), 1500));
    const td = teardown; teardown = function () { if (TvBridge.measured) { TvBridge.measured = null; try { MKAndroid.fps(0); } catch (e) { /* old app */ } } return td.apply(this, arguments); };
    const set = Store.set.bind(Store); Store.set = function (k, v) { const r = set(k, v); if (k === 'progress') { try { TvBridge.progress(v); } catch (e) { /* never block saving */ } } return r; };
    this.last = {}; Object.values(S.progress || {}).forEach((p) => { if (p && p.metaId) this.last[p.metaId] = p; });
  },
};

[DeleteAccount, InfoPages, Dedupe, AudioSync, SubTranslate, Letterboxd, ShareTitle, TvBridge].forEach((m) => { try { m.init(); } catch (e) { console.error('2.21', e); } });
