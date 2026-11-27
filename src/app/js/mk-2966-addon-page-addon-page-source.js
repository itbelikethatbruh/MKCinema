/* 2.96.6 addon page: a source that is really a web page (an addon's "please reinstall / set me up again" notice, whose link
   is its settings page) is shown as the addon's message with a button to that page. It is never handed to a player, so
   the MKCinema Player is not blamed for it and the web player never sits at 0:00 on it. */
(() => {
  if (typeof engine === 'undefined' || typeof playStream !== 'function') return;
  const MEDIA = /\.(m3u8?|mpd|ts|m2ts|mts|mp4|m4v|m4s|mkv|webm|mov|avi|wmv|flv|mpe?g|ogv|ogg|oga|mp3|aac|ac3|flac|m4a|opus|wav|ism)$/i;
  // a Stremio addon's own pages: never a video
  const PAGE = /\/(configure|install|login|signin|sign-in|signup|sign-up|register|subscribe|upgrade|donate|account)\/?$/i;
  const WORDS = /\bre-?install\b|\breconfigure\b|\bnew addon link\b|\bconfigure\b[^\n]{0,40}\baddon\b|\baddon\b[^\n]{0,40}\b(configure|re-?install|new link)\b/i;
  const txt = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  const host = (u) => { try { return new URL(u).host; } catch (e) { return ''; } };
  const pathOf = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.pathname : null; } catch (e) { return null; } };
  const AddonPage = {
    notes: new Map(),
    is(s) {
      if (!s || typeof s !== 'object' || typeof s.url !== 'string' || s.infoHash || s.ytId || s._local || s._handoff || s.externalUrl || s._addon === 'Channels') return false;
      const p = pathOf(s.url);
      if (p == null || MEDIA.test(p)) return false;
      if (PAGE.test(p)) return true;
      return WORDS.test([s.name, s.title, s.description].filter((x) => typeof x === 'string').join(' '));
    },
    addon(s) { const a = (engine.addons || []).find((x) => x && x.manifest && x.manifest.id === s._addonId); return (a && a.manifest && a.manifest.name) || s._addon || ''; },
    note(s) { const addon = txt(this.addon(s), 40), name = txt(s.name, 60); return { addon, title: name && name.toLowerCase() !== addon.toLowerCase() ? name : '', text: txt(s.title || s.description, 220), url: typeof safeHref === 'function' ? safeHref(s.url) : s.url }; },
    log(s, why) { try { MKLog.add('play', `addon page instead of a video (${why}): ${host(s.url)}`); } catch (e) { /* no log */ } },
    quote(n) { return n.title || n.text ? `<blockquote class="mk-apg-q">${n.addon ? `<b>${esc(n.addon)}</b>` : ''}${n.title ? `<span>${esc(n.title)}</span>` : ''}${n.text ? `<span>${esc(n.text)}</span>` : ''}</blockquote>` : ''; },
    link(n, prime) { return n.url ? `<a class="btn ${prime ? 'btn-prime' : 'btn-ghost'}" href="${esc(n.url)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Open the addon’s page</a>` : ''; },
    others(ctx, s) { try { return visibleStreams((ctx && ctx.streams) || []).some((x) => x && x !== s && !AddonPage.is(x) && (x.url || x.infoHash || x.ytId)); } catch (e) { return false; } },
    TITLE: 'The addon sent a message, not a video',
    BODY: 'This source is a web page from the addon, not a video. Usually the addon needs to be set up again on its own page.',
    PAGE_TITLE: 'This source is a web page, not a video',
    PAGE_BODY: 'The addon gave a link to a web page instead of a video. Open the page to see what the addon says, or pick another source.',
    // the player is already open: the same box as its other messages
    inPlayer(s, page) {
      const n = this.note(s);
      try { if (window.MkNative && MkNative.active) MkNative.stop(); } catch (e) { /* ignore */ }
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) { /* ignore */ }
      try { Loader.hold = false; Loader.hide(); } catch (e) { /* ignore */ }
      showMsg(page ? this.PAGE_TITLE : this.TITLE, esc(page ? this.PAGE_BODY : this.BODY), `${this.link(n, true)}${this.others(P.ctx, s) ? '<button class="btn btn-ghost" type="button" data-act="sources"><i data-lucide="layers"></i>Other sources</button>' : ''}`);
      const p = $('#pMsg .box p'); if (p) p.insertAdjacentHTML('afterend', this.quote(n));
    },
    // not playing yet: a sheet, and the player never opens
    sheet(s) {
      const n = this.note(s);
      X8.layer('addonPage', { label: 'Message from the addon', icon: 'message-square-text', eyebrow: n.addon || 'Addon' });
      const b = X8.body('addonPage');
      b.innerHTML = `<h3 class="x8-h">${esc(this.TITLE)}</h3><p class="sub">${esc(this.BODY)}</p>${this.quote(n)}<div class="actions x8-wrap">${this.link(n, true)}<button class="btn btn-ghost" type="button" data-apg="close"><i data-lucide="x"></i>Close</button></div>`;
      $$('[data-apg="close"]', b).forEach((x) => x.addEventListener('click', () => X8.close('addonPage')));
      icons(); X8.open('addonPage');
    },
    // only the answer's type is read (the body is dropped); a site that doesn't allow the question counts as "not a page"
    async html(u) {
      const c = typeof AbortController === 'function' ? new AbortController() : null;
      const t = setTimeout(() => { try { if (c) c.abort(); } catch (e) { /* ignore */ } }, 2500);
      try {
        const r = await fetch(u, { method: 'GET', credentials: 'omit', cache: 'no-store', signal: c ? c.signal : undefined });
        const ct = String(r.headers.get('content-type') || '');
        try { if (c) c.abort(); } catch (e) { /* ignore */ }
        return /text\/html|application\/xhtml/i.test(ct);
      } catch (e) { return false; } finally { clearTimeout(t); }
    },
    init() {
      // 1. the source list: the notice becomes the addon's note above the sources (with its link), not a source to play
      const fs = engine.fetchStreams.bind(engine);
      engine.fetchStreams = async function (type, id) {
        const r = await fs.apply(this, arguments);
        try {
          const k = `${type}/${id}`, pages = (r && Array.isArray(r.streams) ? r.streams : []).filter((s) => AddonPage.is(s));
          // with real sources beside it the notice leaves the list; alone, it stays so Play shows the message (never a player)
          if (pages.length) { if (pages.length < r.streams.length) r.streams = r.streams.filter((s) => !pages.includes(s)); AddonPage.notes.set(k, pages.slice(0, 2).map((s) => AddonPage.note(s))); pages.forEach((s) => AddonPage.log(s, 'list')); }
          else AddonPage.notes.delete(k);
        } catch (e) { /* the plain list still works */ }
        return r;
      };
      if (typeof AddonStatusRows !== 'undefined' && typeof AddonStatusRows.render === 'function') {
        const rr = AddonStatusRows.render.bind(AddonStatusRows);
        AddonStatusRows.render = function () {
          const out = rr.apply(this, arguments);
          try {
            const box = $('#dStreams'), tgt = typeof detailStreamTarget === 'function' && detailStreamTarget();
            const list = box && tgt && AddonPage.notes.get(`${tgt.type}/${tgt.id}`), at = box && $('.chips', box);
            if (list && list.length && at && !$('.mk-pnote', box)) {
              at.insertAdjacentHTML('beforebegin', list.map((n) => `<div class="status-line mk-snote mk-snote-warn mk-pnote"><i data-lucide="alert-triangle"></i><span>${n.addon ? `<b>${esc(n.addon)}</b> ` : ''}${n.title ? `${esc(n.title)}: ` : ''}${esc(n.text)}</span>${n.url ? `<a class="btn btn-ghost btn-sm" href="${esc(n.url)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i>Open the addon’s page</a>` : ''}</div>`).join(''));
              icons();
            }
          } catch (e) { /* ignore */ }
          return out;
        };
      }
      // 2. any other way in (a saved source, the sports Watch button, the next source): never handed to a player
      const ps = playStream;
      playStream = function (ctx, s) {
        if (AddonPage.is(s)) {
          AddonPage.log(s, 'play');
          try { if (s._tel) s._tel.webReady = false; } catch (e) { /* ignore */ }
          if (!$('#player').hidden && P.ctx) { P.stream = s; AddonPage.inPlayer(s); } else AddonPage.sheet(s);
          return undefined;
        }
        return ps.apply(this, arguments);
      };
      // 3. the MKCinema Player could not open a link that turns out to be a web page: say so instead of the web-player fallback
      if (window.MkNative && typeof MkNative.fail === 'function') {
        const f0 = MkNative.fail.bind(MkNative);
        MkNative.fail = function (msg) {
          const s = this.cur, p = s && pathOf(s.url);
          if (!s || s._mkPageAsked || p == null || MEDIA.test(p)) return f0(msg);
          s._mkPageAsked = true;
          AddonPage.html(s.url).then((h) => {
            if (!h || P.stream !== s || $('#player').hidden) return f0(msg);
            AddonPage.log(s, 'web page'); AddonPage.inPlayer(s, true);
            return undefined;
          });
          return undefined;
        };
      }
    },
  };
  window.MkAddonPage = AddonPage;
  AddonPage.init();
})();
