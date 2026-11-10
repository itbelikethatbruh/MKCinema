
/* ---------------- 2.48 Addon extras: more ways an addon can talk to MKCinema ----------------
   Every field is optional and read from what the addon already serves (manifest.mkcinema, or stream.mkcinema).
   Stremio and other apps ignore them. MKCinema validates every value, draws everything itself, and sends an
   addon only what the viewer agreed to. Spec: docs/addon-extras.md, sections 4-12.
   1. Same addon, new link: pasting an addon again with new settings replaces it in place (order and on/off kept).
      Addon settings forms can fill a debrid key field from the key saved in MKCinema, after a tap.
   2. Status, support link and changelog on the addon card; status rows in the source list instead of clips.
   3. Failed-link reports, after a yes: the addon hears which of ITS results would not play, and why.
   4. Action buttons on the film page (POST {base}/mkcinema/action/{id}).
   5. Embedded subtitles shared with a subtitle addon, after a yes.
   6. Result stylers, after a yes: an addon may tag, rank or hide results. It never sees links, hashes or keys.
   7. Addon Lab: every addon request with its time and outcome, replay, and slow or blocked warnings. */
const AddonX = {
  ext(a) { return (a && typeof AddonPerm !== 'undefined') ? AddonPerm.ext(a) : {}; },
  live(a) { return !!(a && a.enabled && !a.virtual && a.manifest && (typeof AddonUI === 'undefined' || AddonUI.allowed(a))); },
  txt(v, n) { return typeof AddonUI !== 'undefined' ? AddonUI.txt(v, n) : String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); },
  https(u) { try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.href : ''; } catch (e) { return ''; } },
  ctxIds(ctx) {
    if (!ctx || !ctx.meta) return null;
    const v = ctx.video, vid = v ? videoIdFor(ctx.meta, v) : ctx.meta.id;
    return { type: ctx.meta.type, id: ctx.meta.id, name: ctx.meta.name || '', videoId: vid, season: v ? Number(v.season) : undefined, episode: v ? Number(v.episode) : undefined };
  },
  own(s) { const bh = (s && s.behaviorHints) || {}; return { infoHash: s.infoHash || undefined, fileIdx: s.fileIdx != null ? s.fileIdx : undefined, filename: bh.filename || undefined, bingeGroup: bh.bingeGroup || undefined }; },
  beacon(url, obj) {
    const body = JSON.stringify(obj);
    try { if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return; } catch (e) { /* fall back */ }
    fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body }).catch(() => {});
  },
  async post(url, obj, ms = 10000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(obj), signal: ctl.signal });
      let j = null; try { j = await r.json(); } catch (e) { /* no JSON */ }
      return { ok: r.ok, status: r.status, j };
    } finally { clearTimeout(t); }
  },
  byId(aid) { return engine.addons.find((x) => x.manifest && x.manifest.id === aid); },
};

/* ---- 1. same addon, new link: replace in place ---- */
const AddonSwap = {
  init() {
    const inst = engine.install.bind(engine);
    engine.install = async function (input, opts = {}) {
      if (opts.position != null || opts.builtin) return inst(input, opts);
      let base; try { base = StremioEngine.normalize(input); } catch (e) { return inst(input, opts); }
      if (this.addons.some((a) => a.baseUrl === base)) return inst(input, opts);
      let m = null; try { m = await this.http(`${base}/manifest.json`, { ttl: 0, timeout: 12000 }); } catch (e) { return inst(input, opts); }
      let host = ''; try { host = new URL(base).host; } catch (e) { /* ignore */ }
      const old = m && m.id && this.addons.find((a) => !a.virtual && !a.builtin && a.manifest && a.manifest.id === m.id && (() => { try { return new URL(a.baseUrl).host === host; } catch (e) { return false; } })());
      if (!old) return inst(input, opts);
      const i = this.addons.indexOf(old), on = old.enabled;
      const nb = await inst(input, { ...opts, position: i, silent: true });
      this.addons = this.addons.filter((x) => x !== old); nb.enabled = on; nb._replaced = true;
      this.clearCache(); this.persist(); if (!opts.silent) this.emit('addons');
      return nb;
    };
    const ia = installAddon;
    installAddon = async function () {
      const a = await ia.apply(this, arguments);
      if (a && a._replaced) { delete a._replaced; toast(`Updated ${a.manifest.name}. Same place in your list, new link.`, 'ok', 4200); }
      return a;
    };
  },
};

/* the settings form can use a debrid key you already saved, only when you tap it */
const AddonKeyFill = {
  RX: [['rd', /real.?debrid|\brd\b/i], ['tb', /torbox|\btb\b/i], ['ad', /all.?debrid|\bad\b/i], ['pm', /premiumize|\bpm\b/i]],
  which(f) {
    const s = `${f.key} ${f.title || ''}`;
    for (const [k, rx] of this.RX) if (rx.test(s)) return k;
    return /debrid/i.test(s) && /key|token|api/i.test(s) ? (typeof Vault !== 'undefined' && Vault.service()) || null : null;
  },
  draw() {
    const form = $('#addonList .mk-cfg'); if (!form || form.dataset.kf) return; form.dataset.kf = '1';
    const a = engine.addons.find((x) => x.baseUrl === form.dataset.cfg); if (!a || typeof Vault === 'undefined') return;
    const v = Vault.cfg() || {};
    AddonSettings.fields(a).forEach((f) => {
      if (f.type !== 'password' && f.type !== 'text') return;
      const k = this.which(f); if (!k || !v[k] || typeof DEBRID === 'undefined' || !DEBRID[k]) return;
      const el = form.querySelector(`input[data-cfk="${CSS.escape(f.key)}"]`); if (!el || el.value) return;
      el.insertAdjacentHTML('afterend', `<button class="chip mk-kf" type="button" data-nav data-kf="${esc(f.key)}"><i data-lucide="key"></i>Use my saved ${esc(DEBRID[k].label)} key</button>`);
      const b = el.nextElementSibling;
      b.addEventListener('click', () => { el.value = (Vault.cfg() || {})[k] || ''; b.remove(); toast(`${DEBRID[k].label} key filled in. It goes into this addon’s link when you save.`, 'info', 4200); });
    });
    icons();
  },
};

/* ---- 2. addon card: status, support, what changed ---- */
const AddonCard = {
  SEEN: 'addonSeenVer',
  status(a) {
    const s = AddonX.ext(a).status; if (!s || typeof s !== 'object') return null;
    const text = AddonX.txt(s.text, 160); if (!text) return null;
    return { kind: ['info', 'warn', 'down'].includes(s.kind) ? s.kind : 'info', text };
  },
  support(a) {
    const s = AddonX.ext(a).support; if (!s) return null;
    const url = AddonX.https(typeof s === 'string' ? s : s.url); if (!url) return null;
    return { url, label: AddonX.txt((s && s.label) || 'Support the developer', 28) || 'Support the developer' };
  },
  log(a) {
    const c = AddonX.ext(a).changelog; if (!Array.isArray(c)) return [];
    return c.filter((x) => x && typeof x === 'object').slice(0, 5).map((x) => ({ v: AddonX.txt(x.version, 20), text: AddonX.txt(x.text, 200) })).filter((x) => x.text);
  },
  /* a new version is "Updated" for a week after MKCinema first sees it */
  fresh(a) {
    if (a.virtual || a.builtin || !a.manifest || !a.manifest.version) return null;
    const all = Store.raw.get(this.SEEN, {}) || {}, id = a.manifest.id, v = String(a.manifest.version), r = all[id];
    if (!r) { all[id] = { v, at: 0 }; Store.raw.set(this.SEEN, all); return null; }
    if (r.v !== v) { all[id] = { v, prev: r.v, at: Date.now() }; Store.raw.set(this.SEEN, all); return all[id]; }
    return r.at && Date.now() - r.at < 7 * 864e5 && r.prev ? r : null;
  },
  html(a) {
    if (!AddonX.live(a) && !(a.manifest && !a.virtual)) return '';
    const st = this.status(a), sp = this.support(a), up = this.fresh(a), log = this.log(a);
    let h = '';
    if (st) h += `<div class="mk-ast mk-ast-${st.kind}"><i data-lucide="${st.kind === 'info' ? 'megaphone' : 'alert-triangle'}"></i><span>${esc(st.text)}</span></div>`;
    if (up || log.length) {
      const head = up ? `Updated to v${esc(AddonX.txt(up.v, 20))}${up.prev ? ` (was v${esc(AddonX.txt(up.prev, 20))})` : ''}` : 'What’s new';
      h += `<details class="mk-alog"${up ? ' data-up="1"' : ''}><summary data-nav><i data-lucide="history"></i>${head}</summary>${log.length ? `<ul>${log.map((x) => `<li>${x.v ? `<b>v${esc(x.v)}</b> ` : ''}${esc(x.text)}</li>`).join('')}</ul>` : '<p>No notes from the developer for this version.</p>'}</details>`;
    }
    if (sp) h += `<a class="chip mk-asup" data-nav href="${esc(sp.url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="heart"></i>${esc(sp.label)}</a>`;
    return h ? `<div class="mk-acard">${h}</div>` : '';
  },
  draw() {
    const cards = $$('#addonList > .addon'); if (cards.length !== engine.addons.length) return;
    cards.forEach((c, i) => {
      const a = engine.addons[i]; if ($('.mk-acard', c)) return;
      const h = this.html(a); if (!h) return;
      const p = $('h4', c) && $('h4', c).nextElementSibling; if (p) p.insertAdjacentHTML('afterend', h);
      const up = $('.mk-alog[data-up]', c), t = $('h4', c);
      if (up && t && !$('.mk-new', t)) t.insertAdjacentHTML('beforeend', '<span class="tag-s g mk-new">updated</span>');
    });
  },
};

/* status rows: an addon can answer with a message instead of a video clip */
const AddonStatusRows = {
  notes: new Map(),
  is(s) { const x = s && s.mkcinema; return !!(x && typeof x === 'object' && x.status && !s.url && !s.infoHash && !s.ytId && !s.externalUrl); },
  read(s) {
    const x = s.mkcinema.status || {}, text = AddonX.txt(x.text || s.description || s.title, 200);
    return { kind: ['info', 'warn', 'error'].includes(x.kind) ? x.kind : 'info', title: AddonX.txt(x.title || s.name, 60), text, addon: s._addon || '' };
  },
  key(type, id) { return `${type}/${id}`; },
  render() {
    const box = $('#dStreams'), tgt = typeof detailStreamTarget === 'function' && detailStreamTarget(); if (!box || !tgt) return;
    const list = this.notes.get(this.key(tgt.type, tgt.id)); if (!list || !list.length) return;
    const at = $('.chips', box); if (!at || $('.mk-snote', box)) return;
    at.insertAdjacentHTML('beforebegin', list.slice(0, 4).map((n) => `<div class="status-line mk-snote mk-snote-${n.kind}"><i data-lucide="${n.kind === 'info' ? 'info' : 'alert-triangle'}"></i><span>${n.addon ? `<b>${esc(AddonX.txt(n.addon, 40))}</b> ` : ''}${n.title ? `${esc(n.title)}: ` : ''}${esc(n.text)}</span></div>`).join(''));
    icons();
  },
};

/* ---- 3. failed-link reports ---- */
const AddonFeedback = {
  sent: new Set(),
  send(s, reason) {
    if (!s || !s._addonId) return;
    const a = AddonX.byId(s._addonId); if (!AddonX.live(a) || !AddonX.ext(a).feedback || !AddonPerm.ok(a, 'feedback')) return;
    const ids = AddonX.ctxIds(P.ctx); if (!ids) return;
    const k = `${a.manifest.id}|${ids.videoId}|${s.infoHash || s.url || ''}|${reason}`; if (this.sent.has(k)) return; this.sent.add(k);
    AddonX.beacon(`${a.baseUrl}/mkcinema/feedback`, { v: 1, event: 'failed', reason: this.code(reason), detail: AddonX.txt(reason, 120), ...ids, stream: AddonX.own(s), at: new Date().toISOString(), app: 'MKCinema', appVersion: APP_VERSION });
  },
  code(r) {
    const t = String(r || '').toLowerCase();
    if (t === 'notice') return 'notice';
    if (/codec|decode|format|support/.test(t)) return 'unsupported';
    if (/stall|timed? ?out|slow/.test(t)) return 'stalled';
    if (/40[13]|denied|forbidden/.test(t)) return 'denied';
    if (/404|not found|gone/.test(t)) return 'missing';
    return 'network';
  },
  init() {
    const pf = playbackFailed;
    playbackFailed = function (stream, reason) { try { AddonFeedback.send(stream, reason); } catch (e) { /* never in the way */ } return pf.apply(this, arguments); };
    if (typeof AddonNotice !== 'undefined' && AddonNotice.caught) {
      const c = AddonNotice.caught.bind(AddonNotice);
      AddonNotice.caught = function (s) { try { AddonFeedback.send(s || P.stream, 'notice'); } catch (e) { /* ignore */ } return c.apply(this, arguments); };
    }
  },
};

/* ---- 4. action buttons on the film page ---- */
const AddonActions = {
  ICONS: ['send', 'bookmark', 'star', 'heart', 'download', 'sparkles', 'check', 'plus', 'share-2'],
  list(m) {
    const out = [];
    engine.addons.forEach((a) => {
      if (!AddonX.live(a)) return;
      const acts = AddonX.ext(a).actions; if (!Array.isArray(acts)) return;
      acts.slice(0, 2).forEach((x) => {
        if (!x || typeof x.id !== 'string' || !/^[\w-]{1,40}$/.test(x.id)) return;
        const label = AddonX.txt(x.label, 28); if (!label) return;
        if (Array.isArray(x.types) && x.types.length && !x.types.includes(m.type)) return;
        if (Array.isArray(x.idPrefixes) && x.idPrefixes.length && !x.idPrefixes.some((p) => String(m.id).startsWith(p))) return;
        out.push({ a, id: x.id, label, icon: this.ICONS.includes(x.icon) ? x.icon : 'send' });
      });
    });
    return out.slice(0, 4);
  },
  draw() {
    const m = D.meta, row = $('#detailPanel .d-hero .actions'); if (!m || !row || $('.mk-act', row)) return;
    const acts = this.list(m); if (!acts.length) return;
    row.insertAdjacentHTML('beforeend', acts.map((x, i) => `<button class="btn btn-ghost mk-act" type="button" data-nav data-mkact="${i}" title="${esc(`${x.label} · ${x.a.manifest.name}`)}"><i data-lucide="${x.icon}"></i>${esc(x.label)}</button>`).join(''));
    icons();
    $$('[data-mkact]', row).forEach((b) => b.addEventListener('click', () => this.run(acts[Number(b.dataset.mkact)], b)));
  },
  async run(x, b) {
    if (!x || b.disabled) return; b.disabled = true;
    const ids = AddonX.ctxIds({ meta: D.meta, video: D.video }), name = x.a.manifest.name;
    try {
      const r = await AddonX.post(`${x.a.baseUrl}/mkcinema/action/${encodeURIComponent(x.id)}`, { v: 1, action: x.id, ...ids, at: new Date().toISOString(), app: 'MKCinema', appVersion: APP_VERSION });
      const msg = r.j && AddonX.txt(r.j.message, 140);
      if (r.ok) toast(msg || `${name}: done`, 'ok', 3600); else toast(msg || `${name} said no (${r.status})`, 'err', 4200);
    } catch (e) {
      toast(`${name} did not answer. ${/abort/i.test(e.name || e.message) ? 'It took too long.' : 'It may block browser requests.'}`, 'err', 4800);
    } finally { b.disabled = false; }
  },
};

/* ---- 5. embedded subtitles shared with a subtitle addon ---- */
const AddonSubShare = {
  sent: new Set(),
  targets() { return engine.addons.filter((a) => AddonX.live(a) && AddonX.ext(a).subtitlesIn && AddonPerm.ok(a, 'subtitles')); },
  vtt(t) {
    const rows = Array.from(t.lines.values()).map((x) => {
      if (x.text != null) return x;
      const p = String(x.line || '').split(','); return { s: x.s, e: x.e, text: p.slice(9).join(',').replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').replace(/\\h/g, ' ').trim() };
    }).filter((x) => x.text).sort((a, b) => a.s - b.s);
    if (rows.length < 20) return '';
    return 'WEBVTT\n\n' + rows.map((x) => `${StremioEngine.vttTime(x.s)} --> ${StremioEngine.vttTime(x.e)}\n${x.text}`).join('\n\n') + '\n';
  },
  async share(t, total) {
    const list = this.targets(); if (!list.length || !t || t.forced || !t.lines) return;
    if (/sign|song/i.test(t.name || '') || t.lines.size < total * 0.9) return;
    const ids = AddonX.ctxIds(P.ctx); if (!ids) return;
    const text = this.vtt(t); if (!text || text.length > 1024 * 1024) return;
    const s = P.stream || {};
    for (const a of list) {
      const k = `${a.manifest.id}|${ids.videoId}|${t.lang}|${t.num}`; if (this.sent.has(k)) continue; this.sent.add(k);
      AddonX.post(`${a.baseUrl}/mkcinema/subtitles`, { v: 1, ...ids, lang: String(t.lang || 'und').slice(0, 8), label: AddonX.txt(t.name, 60), format: 'vtt', filename: (s.behaviorHints || {}).filename || undefined, text, app: 'MKCinema', appVersion: APP_VERSION }, 20000)
        .then((r) => { if (r.ok) MKLog.add('info', `Shared ${t.lang || 'und'} subtitles with ${a.manifest.name}`); }).catch(() => {});
    }
  },
  init() {
    const sh = MkvSubs.show.bind(MkvSubs);
    MkvSubs.show = async function (s) {
      const r = await sh(s);
      try { const f = MkvSubs.file, t = s && s._mkv; if (f && t) AddonSubShare.share(t, f.cues.filter((c) => c.track === t.num).length); } catch (e) { /* ignore */ }
      return r;
    };
  },
};

/* ---- 6. result stylers ---- */
const AddonStyler = {
  CLEAN: /\b(?:https?|magnet|stremio):\S+/gi,
  targets() { return engine.addons.filter((a) => AddonX.live(a) && AddonX.ext(a).style && AddonPerm.ok(a, 'style')); },
  card(s, i) {
    const t = s._tel || {};
    return { i, addon: AddonX.txt(s._addon, 60), name: AddonX.txt(String(s.name || '').replace(this.CLEAN, ''), 120), title: String(s.title || s.description || '').replace(this.CLEAN, '').slice(0, 400),
      res: t.res || undefined, hdr: t.hdr || undefined, codec: t.codec || undefined, size: t.size || undefined, cached: t.cached, kind: t.kind || undefined };
  },
  async apply(type, id, streams) {
    const list = this.targets(); if (!list.length || !streams.length) return;
    const cards = streams.slice(0, 200).map((s, i) => this.card(s, i));
    for (const a of list) {
      try {
        const r = await AddonX.post(`${a.baseUrl}/mkcinema/style`, { v: 1, type, id, streams: cards, app: 'MKCinema', appVersion: APP_VERSION }, 2500);
        const out = r.ok && r.j && Array.isArray(r.j.streams) ? r.j.streams : [];
        out.slice(0, 200).forEach((x) => {
          const s = x && Number.isInteger(x.i) && streams[x.i]; if (!s) return;
          if (Array.isArray(x.tags)) s._mkcTags = [...new Set([...(s._mkcTags || []), ...x.tags.map((g) => AddonX.txt(g, 16)).filter(Boolean)])].slice(0, 3);
          if (typeof x.rank === 'number' && isFinite(x.rank)) s._mkcRank = (s._mkcRank || 0) + Math.max(-100, Math.min(100, x.rank));
          if (x.hide === true) s._mkcHide = true;
        });
      } catch (e) { /* a slow or broken styler never holds the list */ }
    }
    if (streams.some((s) => s._mkcRank)) {
      const pos = new Map(streams.map((s, i) => [s, i]));
      streams.sort((x, y) => (y._mkcRank || 0) - (x._mkcRank || 0) || pos.get(x) - pos.get(y));
    }
  },
};

/* engine hooks shared by status rows and stylers */
const AddonStreamHooks = {
  init() {
    const fs = engine.fetchStreams.bind(engine);
    engine.fetchStreams = async function (type, id, onPartial) {
      const r = await fs(type, id, onPartial);
      try {
        const notes = r.streams.filter((s) => AddonStatusRows.is(s));
        if (notes.length) { r.streams = r.streams.filter((s) => !AddonStatusRows.is(s)); AddonStatusRows.notes.set(AddonStatusRows.key(type, id), notes.map((s) => AddonStatusRows.read(s))); }
        else AddonStatusRows.notes.delete(AddonStatusRows.key(type, id));
        await AddonStyler.apply(type, id, r.streams);
      } catch (e) { /* the plain list still works */ }
      return r;
    };
    const vs = visibleStreams;
    visibleStreams = function (streams) { return vs.call(this, streams).filter((s) => !s._mkcHide && !AddonStatusRows.is(s)); };
    const b = Telemetry.badges.bind(Telemetry);
    Telemetry.badges = function (s) {
      const h = b.apply(this, arguments);
      return s && s._mkcTags && s._mkcTags.length ? h + s._mkcTags.map((g) => `<span class="tb mk-tag">${esc(g)}</span>`).join('') : h;
    };
    const rs = renderStreamsPanel;
    renderStreamsPanel = function () { const r = rs.apply(this, arguments); try { AddonStatusRows.render(); } catch (e) { /* ignore */ } return r; };
  },
};

/* ---- 7. Addon Lab ---- */
const AddonLab = {
  log: [], MAX: 80,
  short(u) {
    try {
      const x = new URL(u), segs = x.pathname.split('/').map((p) => (p.length > 40 || /%7B|^ey[A-Za-z0-9_-]{20,}/i.test(p) ? '…' : p));
      return `${x.host}${segs.join('/')}`;
    } catch (e) { return String(u).slice(0, 120); }
  },
  addonFor(u) { return engine.addons.find((a) => !a.virtual && u.startsWith(`${a.baseUrl}/`)); },
  init() {
    const h = engine.http.bind(engine);
    engine.http = async function (url, opts = {}) {
      const hit = this.cache.get(url), cached = !!(hit && Date.now() - hit.t < (opts.ttl == null ? 6e5 : opts.ttl));
      const t0 = performance.now(), row = { url, at: Date.now(), cached, ms: 0, ok: false, err: '' };
      try { const v = await h(url, opts); row.ok = true; row.v = v; return v; }
      catch (e) { row.err = /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? 'blocked' : AddonX.txt(e.message, 60); throw e; }
      finally {
        row.ms = Math.round(performance.now() - t0);
        if (!cached) { AddonLab.log.unshift(row); if (AddonLab.log.length > AddonLab.MAX) AddonLab.log.length = AddonLab.MAX; const lab = document.getElementById('mkLab'); if (lab && !lab.hidden) AddonLab.paint(); }
      }
    };
  },
  warn(r) {
    if (r.err === 'blocked') return 'Blocked or offline. Browsers need the addon to send Access-Control-Allow-Origin: *';
    if (r.err) return r.err;
    if (r.ms > 3000) return `Slow: ${(r.ms / 1000).toFixed(1)} s. Viewers wait for this.`;
    return '';
  },
  open() {
    let el = $('#mkLab');
    if (!el) {
      document.body.insertAdjacentHTML('beforeend', `<div id="mkLab" class="mk-lab glass-solid" role="dialog" aria-label="Addon Lab" hidden><div class="mk-lab-h"><b><i data-lucide="wrench"></i>Addon Lab</b><span>Every addon request on this device, newest first. Nothing leaves your device.</span><button class="ibtn" type="button" data-nav data-labx aria-label="Close"><i data-lucide="x"></i></button></div><div class="mk-lab-l"></div><pre class="mk-lab-p" hidden></pre></div>`);
      el = $('#mkLab'); $('[data-labx]', el).onclick = () => { el.hidden = true; };
    }
    el.hidden = false; this.paint(); icons();
    const f = $('[data-labx]', el); if (f && IS_TV && typeof Nav !== 'undefined') Nav.focus(f);
  },
  paint() {
    const el = $('#mkLab'); if (!el) return;
    const rows = this.log;
    $('.mk-lab-l', el).innerHTML = rows.length ? rows.map((r, i) => {
      const a = this.addonFor(r.url), w = this.warn(r);
      return `<button class="mk-lab-r${r.ok ? (w ? ' warn' : '') : ' bad'}" type="button" data-nav data-labi="${i}"><span class="mk-lab-s">${r.ok ? (w ? '!' : '✓') : '✕'}</span><span class="mk-lab-u"><b>${esc(a ? a.manifest.name : 'Other')}</b><small class="mono">${esc(this.short(r.url))}</small>${w ? `<small class="mk-lab-w">${esc(w)}</small>` : ''}</span><span class="mk-lab-ms mono">${r.ms} ms</span></button>`;
    }).join('') : '<div class="empty">No addon requests yet. Open a title or a catalog and they show up here.</div>';
    $$('[data-labi]', el).forEach((b) => b.addEventListener('click', () => this.replay(this.log[Number(b.dataset.labi)])));
  },
  async replay(r) {
    const p = $('#mkLab .mk-lab-p'); if (!r || !p) return;
    p.hidden = false; p.textContent = 'Asking again…';
    try { const v = await engine.http(r.url, { ttl: 0 }); const s = JSON.stringify(v, null, 2); p.textContent = s.length > 6000 ? `${s.slice(0, 6000)}\n… (${s.length} characters)` : s; }
    catch (e) { p.textContent = `Failed: ${e.message}`; }
  },
  button() {
    const f = $('#addonForm'); if (!f || $('#mkLabBtn')) return;
    f.insertAdjacentHTML('afterend', '<button class="chip mk-lab-b" id="mkLabBtn" type="button" data-nav><i data-lucide="wrench"></i>Addon Lab</button>');
    $('#mkLabBtn').onclick = () => this.open(); icons();
  },
};

/* consent: the new asks join the switches on the addon card, default off */
const AddonAsks = {
  TEXT: {
    feedback: ['Tell it when its links fail', 'When one of its own results won’t play, it hears which one and a short reason, so it can fix or drop it.'],
    subtitles: ['Share subtitles from your files', 'When a file has its own subtitles, they are sent to this addon so other viewers can use them. Only the text.'],
    style: ['Let it sort and tag results', 'It sees source names and quality, never links, hashes or keys, and may tag, reorder or hide results.'],
  },
  init() {
    const asks = AddonPerm.asks.bind(AddonPerm);
    AddonPerm.asks = function (a) {
      const out = asks(a); if (!a || !a.manifest || a.virtual) return out;
      const x = this.ext(a);
      if (x.feedback) out.push('feedback');
      if (x.subtitlesIn) out.push('subtitles');
      if (x.style) out.push('style');
      return out;
    };
    Object.assign(AddonPermUI.TEXT, this.TEXT);
    const ask = AddonPermUI.ask.bind(AddonPermUI);
    AddonPermUI.ask = function (a) {
      ask(a);
      try {
        if (!a || !a.manifest) return;
        const want = ['feedback', 'subtitles', 'style'].filter((k) => AddonPerm.asks(a).includes(k) && AddonPerm.get(a.manifest.id, k) === undefined);
        if (!want.length) return;
        const box = document.createElement('div'); box.className = 'toast glass-solid t-info mk-ask'; box.setAttribute('role', 'dialog');
        box.innerHTML = `<i data-lucide="activity"></i><span><b>${esc(a.manifest.name)}</b> asks to: ${want.map((k) => esc(AddonAsks.TEXT[k][0].toLowerCase())).join(', ')}. It never sees your keys.</span><span class="mk-ask-b"><button class="btn btn-prime btn-sm" type="button" data-nav data-y>Allow</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-n>Not now</button></span>`;
        $('#toasts').appendChild(box); icons();
        const done = (v) => { want.forEach((k) => AddonPerm.set(a.manifest.id, k, v)); box.remove(); if ($('#addonList')) try { renderAddons(); } catch (e) { /* not on screen */ } };
        $('[data-y]', box).onclick = () => done(true); $('[data-n]', box).onclick = () => done(false);
        setTimeout(() => { if (box.isConnected) box.remove(); }, 30000);
      } catch (e) { /* ignore */ }
    };
  },
};

const AddonExtras = {
  init() {
    AddonSwap.init(); AddonAsks.init(); AddonFeedback.init(); AddonSubShare.init(); AddonStreamHooks.init(); AddonLab.init();
    const ra = renderAddons;
    renderAddons = function () {
      const r = ra.apply(this, arguments);
      try { AddonCard.draw(); AddonKeyFill.draw(); AddonLab.button(); } catch (e) { MKLog.add('error', `addon card: ${e.message}`); }
      return r;
    };
    const rd = renderDetail;
    renderDetail = function () { const r = rd.apply(this, arguments); try { AddonActions.draw(); } catch (e) { /* the page works without it */ } return r; };
  },
};
try { AddonExtras.init(); } catch (e) { try { MKLog.add('error', `2.48 addon extras: ${e.message}`); } catch (_) { /* no log */ } console.warn('2.48 addon extras skipped', e); }
