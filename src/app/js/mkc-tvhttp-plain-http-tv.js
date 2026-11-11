
'use strict';
/* ---------------- 2.67 Plain http:// TV services on computers ----------------
   Browsers refuse anything on plain http:// inside an https page, and no page code can change that. They do let a page
   talk to 127.0.0.1, so in the MKCinema app for Windows and Mac a small helper on the person's own computer
   (MKDesktop.pass, route /tv) fetches their TV service for the page: the M3U playlist or Xtream login, the guide,
   and every part of each channel (HLS playlists are rewritten so their segments come through it too).
   Nothing goes through any MKCinema server, and the helper only reaches public addresses.
   It also helps https:// services that don't allow web pages (no CORS).
   In a plain browser nothing changes: the MKCinema server, the playlist file or the Android app, as before. */
(() => {
  if (typeof Channels === 'undefined' || typeof X8 === 'undefined' || typeof playStream !== 'function') return;
  const C = Channels;
  const LOOP = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//i;

  const T = {
    base: '', p: null,
    on() { try { return !!(window.MKDesktop && MKDesktop.pass && typeof MKDesktop.pass.start === 'function'); } catch (e) { return false; } },
    // the Android app reads TV services itself, so the helper is for the desktop apps only
    want() { return this.on() && !(C.nat && C.nat()); },
    start() {
      if (this.base) return Promise.resolve(this.base);
      if (!this.want()) return Promise.resolve('');
      if (!this.p) {
        this.p = Promise.resolve().then(() => MKDesktop.pass.start())
          .then((b) => (/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}$/.test(String(b)) ? String(b) : ''), () => '')
          .then((b) => { if (b) this.base = b; else this.p = null; return b; });
      }
      return this.p;
    },
    // h goes before u, so the address still ends in .m3u8 when the channel's does (that is how the player spots HLS)
    url(u, headers) {
      const h = headers && typeof headers === 'object' && Object.keys(headers).length ? `h=${encodeURIComponent(JSON.stringify(headers))}&` : '';
      return `${this.base}/tv?${h}u=${encodeURIComponent(u)}`;
    },
    mine(u) { return !!this.base && String(u || '').startsWith(`${this.base}/`); },
  };
  window.MkTvPass = T;

  // a page may always reach this computer (127.0.0.1, localhost), even from https: that is not mixed content
  const mb0 = X8.mixedBlocked;
  X8.mixedBlocked = (url) => (LOOP.test(String(url || '')) ? false : mb0(url));

  // the helper's addresses already carry the playlist's headers: never send them to the MKCinema server on top
  if (typeof proxify === 'function') {
    const px = proxify;
    proxify = function (url) { return T.mine(url) ? url : px.apply(this, arguments); };
  }

  // playlists, Xtream answers and guides: through the helper when the page can't read them itself
  const text0 = C.text.bind(C);
  C.text = async function (url, opt) {
    if (!T.want() || !/^https?:\/\//i.test(String(url || '')) || LOOP.test(url)) return text0(url, opt);
    const gz = !!((opt && opt.gz) || /\.gz(\?|$)/i.test(url));
    if (X8.mixedBlocked(url)) {
      const b = await T.start();
      if (b) return text0(T.url(url), { ...(opt || {}), gz });
      return text0(url, opt);
    }
    try { return await text0(url, opt); } catch (e) {
      // an https service that doesn't allow web pages (or didn't answer the page): one more try from the app itself
      if (!/did not answer|CORS|Failed to fetch|NetworkError|Load failed/i.test(String(e && e.message))) throw e;
      const b = await T.start();
      if (!b) throw e;
      return text0(T.url(url), { ...(opt || {}), gz });
    }
  };

  // channels, catch-up, films and episodes on http://: played through the helper
  const tune1 = C.tune.bind(C);
  C.tune = function (c, metaIn) {
    if (!c || !c.url || !T.want() || !X8.mixedBlocked(c.url)) return tune1(c, metaIn);
    return T.start().then((b) => {
      if (!b) return tune1(c, metaIn);
      const st = this.stream(c), meta = metaIn || this.meta(c);
      st.url = T.url(c.url, c.headers);
      st._noNative = true;
      if (st.behaviorHints) delete st.behaviorHints.proxyHeaders;
      playStream({ meta, video: null, streams: [st] }, st);
    });
  };

  // Split Screen tiles
  if (typeof Split !== 'undefined' && typeof Split.add === 'function') {
    const add0 = Split.add.bind(Split);
    Split.add = function (src) {
      if (src && src.url && T.base && T.want() && mb0(src.url) && !LOOP.test(src.url)) src = { ...src, url: T.url(src.url, src.headers), headers: undefined };
      return add0(src);
    };
  }

  // start it before the first channel is picked when the person has lists, so a tap plays at once
  const warm = () => { try { if (T.want() && C.lists().length) T.start(); } catch (e) { /* not yet */ } };
  if (document.readyState === 'complete') setTimeout(warm, 1500); else addEventListener('load', () => setTimeout(warm, 1500), { once: true });
  const save0 = C.save.bind(C);
  C.save = function () { const r = save0.apply(this, arguments); warm(); return r; };
})();
