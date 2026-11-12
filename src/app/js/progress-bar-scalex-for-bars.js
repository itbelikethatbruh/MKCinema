
(() => {
  'use strict';
  const safe = (name, fn) => { try { fn(); } catch (e) { console.warn('2.47 player:', name, e); } };
  const $id = (id) => document.getElementById(id);
  const menusOpen = () => !!($('#player .drawer.open') || !$('#subMenu').hidden || !$('#optMenu').hidden || !$('#dspPop').hidden || !$('#pMsg').hidden);

  /* ---------- Progress bar: scaleX for the bars, translateX for the knob ---------- */
  const rail = (() => {
    const seek = $id('seek'), knob = $id('sKnob'); if (!seek || !knob) return null;
    if (knob.parentElement && knob.parentElement.classList.contains('mk-krail')) return knob.parentElement;
    const r = document.createElement('div'); r.className = 'mk-krail'; seek.insertBefore(r, knob); r.appendChild(knob); return r;
  })();
  window.MkSeekPaint = {
    c: -1, b: -1,
    cur(p) {
      p = Math.min(1, Math.max(0, Number(p) || 0)); if (Math.abs(p - this.c) < 0.0002) return; this.c = p;
      const c = $id('sCur'); if (c) c.style.transform = `scaleX(${p})`;
      if (rail) rail.style.transform = `translateX(${p * 100}%)`;
      this.aria();
    },
    buf(p) {
      p = Math.min(1, Math.max(0, Number(p) || 0)); if (Math.abs(p - this.b) < 0.001) return; this.b = p;
      const b = $id('sBuf'); if (b) b.style.transform = `scaleX(${p})`;
    },
    /* the seek bar is a slider for screen readers, updated about once a second */
    at: 0,
    aria(force) {
      const now = performance.now(); if (!force && now - this.at < 1000) return; this.at = now;
      const s = $id('seek'); if (!s) return;
      const d = pDur(), t = pNow();
      if (!isFinite(d)) { s.setAttribute('aria-valuetext', 'Live'); s.removeAttribute('aria-valuenow'); return; }
      if (!(d > 0)) return;
      s.setAttribute('aria-valuemax', String(Math.round(d)));
      s.setAttribute('aria-valuenow', String(Math.round(Math.min(d, Math.max(0, t)))));
      s.setAttribute('aria-valuetext', `${fmtTime(t)} of ${fmtTime(d)}`);
    },
  };

  /* ---------- Time and speed labels: written only when they change, and not while the controls are hidden ---------- */
  safe('labels', () => {
    if (typeof PxLayout === 'undefined' || !PxLayout.paint) return;
    const hud = $id('hud'); let dirty = false;
    const set = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
    PxLayout.paint = function () {
      const cur = $('#pxCur'), end = $('#pxEnd'); if (!cur) return;
      if (hud.classList.contains('idle')) { dirty = true; return; }
      dirty = false;
      const d = pDur(), t = pNow() || 0, live = !isFinite(d) && !Number.isNaN(d);
      const sp = $('#pxSpeed'); if (sp) { const r = video.playbackRate || 1; set(sp, `${r}×`); sp.classList.toggle('on', r !== 1); }
      if (live) { set(cur, fmtTime(t)); set(end, 'LIVE'); return; }
      if (!(d > 0)) return;
      set(cur, fmtTime(t));
      const left = Math.max(0, d - t), rate = video.playbackRate || 1;
      set(end, this.endMode === 'left' ? `−${fmtTime(left)}` : this.endMode === 'clock' ? `Ends ${PxUtil.fmtClock(new Date(Date.now() + left / rate * 1000))}` : fmtTime(d));
    };
    new MutationObserver(() => { if (dirty && !hud.classList.contains('idle')) PxLayout.paint(); }).observe(hud, { attributes: true, attributeFilter: ['class'] });
  });

  /* ---------- Keyboard and screen readers ---------- */
  safe('keys', () => {
    const seek = $id('seek'), hud = $id('hud'), player = $id('player');
    seek.setAttribute('role', 'slider'); seek.setAttribute('aria-label', 'Seek'); seek.setAttribute('aria-valuemin', '0');
    if (!IS_TV) seek.tabIndex = 0; // TV remotes keep their own Up/Down/Left/Right handling
    const jump = (t) => { const d = pDur(); if (!isFinite(d) || !(d > 0)) return; pSeek(Math.min(Math.max(0, t), Math.max(0, d - 1))); wakeHud(); MkSeekPaint.aria(true); };
    seek.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = step(), map = { ArrowLeft: -st, ArrowDown: -st, ArrowRight: st, ArrowUp: st, PageDown: -60, PageUp: 60 };
      let t = null;
      if (e.key in map) t = pNow() + map[e.key];
      else if (e.key === 'Home') t = 0;
      else if (e.key === 'End') t = Infinity;
      if (t == null) return;
      e.preventDefault(); e.stopPropagation(); jump(t === Infinity ? pDur() : t);
    });
    // 0-9 jump to 0-90 %, Home and End to the start and the end
    document.addEventListener('keydown', (e) => {
      if (player.hidden || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || menusOpen()) return;
      const t = e.target, tag = (t && t.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || (t && t.isContentEditable)) return;
      const d = pDur(); if (!isFinite(d) || !(d > 0)) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); jump(d * Number(e.key) / 10); }
      else if (e.key === 'Home') { e.preventDefault(); jump(0); }
      else if (e.key === 'End') { e.preventDefault(); jump(d); }
    });
    try { PxKeys.LIST.push(['0 – 9', 'Jump to 0 – 90 %'], ['Home / End', 'Start or end']); } catch (e) { /* no key list */ }

    // controls wake up when focus or a key reaches them, and stay a little longer while a key works them
    const kbd = () => { const a = document.activeElement; if (!a || a === document.body || !hud.contains(a)) return false; try { return a.matches(':focus-visible'); } catch (x) { return true; } };
    const wk = wakeHud;
    wakeHud = function (stay) {
      if (!stay && !IS_TV && !P.locked && kbd()) {
        wk.call(this, true);
        P.idleT = setTimeout(() => wk.call(null, false), 5000);
        return;
      }
      return wk.apply(this, arguments);
    };
    player.addEventListener('focusin', () => { if (!P.locked) wakeHud(); });
    player.addEventListener('focusout', () => setTimeout(() => { if (!player.hidden && !player.contains(document.activeElement)) wakeHud(video.paused); }, 0));
    document.addEventListener('keydown', (e) => { if (!player.hidden && (e.key === 'Tab' || hud.contains(document.activeElement))) wakeHud(); }, true);
    video.addEventListener('timeupdate', () => MkSeekPaint.aria());
    video.addEventListener('loadedmetadata', () => MkSeekPaint.aria(true));
  });

  /* ---------- Steadier HLS and direct-file playback ---------- */
  window.MkHeal = {
    hls(hls, stream, src) {
      const st = { net: 0, media: 0, mediaAt: 0, timer: 0, on: null };
      const alive = () => P.hls === hls && P.stream === stream && !$('#player').hidden;
      const ok = () => { st.net = 0; st.liveAt = 0; };
      const isLive = () => { try { const l = hls.levels && hls.levels[Math.max(0, hls.currentLevel)]; return !isFinite(video.duration) || !!(l && l.details && l.details.live); } catch (e) { return false; } };
      const stop = () => { clearTimeout(st.timer); if (st.on) { removeEventListener('online', st.on); st.on = null; } };
      [Hls.Events.MANIFEST_LOADED, Hls.Events.LEVEL_LOADED, Hls.Events.FRAG_LOADED].forEach((ev) => hls.on(ev, ok));
      hls.on(Hls.Events.DESTROYING, stop);
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal || !alive()) return;
        const why = d.details || d.type, code = d.response && d.response.code;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !/parsing/i.test(why)) {
          // a missing or refused file (4xx) gets one more try; a dropped connection gets three, spaced out
          const cap = code >= 400 && code < 500 && code !== 408 && code !== 429 ? 1 : 3;
          if (st.net >= cap && isLive() && navigator.onLine !== false) {
            if (!st.liveAt) st.liveAt = Date.now();
            if (Date.now() - st.liveAt < 15000) { stop(); st.timer = setTimeout(() => { if (alive()) { if (/manifest/i.test(why)) hls.loadSource(src); else hls.startLoad(); } }, 1500); return; }
          }
          if (st.net >= cap) { playbackFailed(stream, why); return; }
          const wait = 700 * 2 ** st.net++;
          const go = () => { st.on = null; if (!alive()) return; if (/manifest/i.test(why)) hls.loadSource(src); else hls.startLoad(); };
          stop();
          if (navigator.onLine === false) {
            st.on = () => { stop(); go(); }; addEventListener('online', st.on);
            st.timer = setTimeout(() => { stop(); if (alive()) playbackFailed(stream, why); }, 30000);
            return;
          }
          st.timer = setTimeout(go, wait); return;
        }
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
          const now = Date.now(); if (now - st.mediaAt > 20000) st.media = 0; st.mediaAt = now;
          st.media++;
          if (st.media === 1) { hls.recoverMediaError(); return; }
          if (st.media === 2) { try { hls.swapAudioCodec(); } catch (e) { /* older hls.js */ } hls.recoverMediaError(); return; }
        }
        playbackFailed(stream, why);
      });
    },
    /* the browser's own player: a dropped connection or a stall reconnects the same copy at the same second, up to three
       times in three minutes (0.8 s, 2.5 s, 6 s apart; when the device is offline it waits for the network, up to a minute).
       If that copy still does not play within 14 s, the next copy takes over (or the usual message shows). */
    can(stream) {
      const src = video.getAttribute('src');
      return !!(stream && stream.url && !stream._local && !P.remux && !P.hls && src && !/^blob:/i.test(src));
    },
    reconnect(stream, at) {
      if (P.stream !== stream || $('#player').hidden || !this.can(stream)) return false;
      const now = Date.now(), h = stream._mkHeal || (stream._mkHeal = { n: 0, since: now, tok: 0 });
      if (now - h.since > 180000) { h.n = 0; h.since = now; }
      if (h.n >= 3) return false;
      h.n++; const tok = ++h.tok, t = at != null ? at : (video.currentTime || 0);
      try { MKLog.add('play', `reconnecting the same copy at ${Math.round(t)} s (try ${h.n})`); } catch (e) { /* no log */ }
      const live = () => P.stream === stream && h.tok === tok && !P.hls && !$('#player').hidden;
      const go = () => {
        if (!live()) return;
        video.addEventListener('loadedmetadata', () => {
          if (!live()) return;
          if (t > 1 && isFinite(video.duration)) video.currentTime = Math.min(t, video.duration - 5);
          video.playbackRate = CFG.speed || 1; video.play().catch(() => wakeHud(true));
        }, { once: true });
        video.load();
        clearTimeout(Failover.healT);
        Failover.healT = setTimeout(() => {
          if (!live() || video.readyState >= 3) return;
          if (!(CFG.failover && Failover.next(stream, 'stalled after reconnecting', t))) playbackFailed(stream, 'the connection to this copy keeps dropping');
        }, 14000);
      };
      Loader.wait();
      if (navigator.onLine === false) {
        const on = () => { clearTimeout(cap); setTimeout(go, 400); };
        const cap = setTimeout(() => { removeEventListener('online', on); if (live()) playbackFailed(stream, 'this device is offline'); }, 60000);
        addEventListener('online', on, { once: true });
        return true;
      }
      setTimeout(go, [800, 2500, 6000][h.n - 1]);
      return true;
    },
    native(stream, reason) {
      if (video.error && video.error.code === 2 && this.reconnect(stream, video.currentTime || 0)) return;
      playbackFailed(stream, reason);
    },
  };

  /* ---------- A faster start ---------- */
  safe('start', () => {
    // the source and episode lists are drawn when they are opened, or once the film is under way
    const lazy = { src: false, ep: false, t: 0 };
    const rs = renderSourceDrawer, re = renderEpisodeDrawer;
    const isOpen = (id) => { const el = $id(id); return !!(el && el.classList.contains('open')); };
    const flush = () => {
      lazy.t = 0; if (!P.ctx || $('#player').hidden) { lazy.src = lazy.ep = false; return; }
      if (lazy.src) { lazy.src = false; rs(); }
      if (lazy.ep) { lazy.ep = false; re(); }
    };
    const later = () => { if (lazy.t) return; lazy.t = window.requestIdleCallback ? requestIdleCallback(flush, { timeout: 2500 }) : setTimeout(flush, 1200); };
    renderSourceDrawer = function () { if (isOpen('srcDrawer') || !P.ctx) return rs.apply(this, arguments); lazy.src = true; later(); };
    renderEpisodeDrawer = function () { if (isOpen('epDrawer') || !P.ctx) return re.apply(this, arguments); lazy.ep = true; later(); };
    const od = openDrawer;
    openDrawer = function (which) { if ((which === 'src' && lazy.src) || (which === 'ep' && lazy.ep)) { if (lazy.t) { (window.cancelIdleCallback || clearTimeout)(lazy.t); } flush(); } return od.apply(this, arguments); };

    // one health check of the proxy at a time, started alongside the host check
    const po = proxyOnline; let inflight = null;
    proxyOnline = function () { if (inflight) return inflight; inflight = Promise.resolve(po.apply(this, arguments)).finally(() => { inflight = null; }); return inflight; };
    const prep = DSP.prepare;
    DSP.prepare = function (s) {
      try {
        const bh = (s && s.behaviorHints) || {};
        if (s && s.url && !s._local && DSP.wants() && !bh.proxyHeaders && !CFG.alwaysProxy && !/\.m3u8(\?|$)/i.test(s.url)) {
          let host = ''; try { host = new URL(s.url).host; } catch (e) { /* bad url */ }
          if (host && !DSP.probes.has(host)) proxyOnline().catch(() => {});
        }
      } catch (e) { /* keep going */ }
      return prep.apply(this, arguments);
    };

    // open the connection to the stream's host while the player gets ready
    const seen = new Set();
    const pre = (url, cors) => {
      let o = ''; try { o = new URL(url, location.href).origin; } catch (e) { return; }
      if (!/^https?:/.test(o) || o === location.origin || seen.has(o + cors)) return; seen.add(o + cors);
      const l = document.createElement('link'); l.rel = 'preconnect'; l.href = o; if (cors) l.crossOrigin = 'anonymous'; document.head.appendChild(l);
    };
    const ps = playStream;
    playStream = function (ctx, stream) {
      try {
        if (stream && stream.url && !stream._local && !stream.ytId && /^https?:/i.test(stream.url)) {
          const bh = stream.behaviorHints || {};
          const viaProxy = (bh.proxyHeaders || CFG.alwaysProxy) && S.proxy;
          const u = viaProxy ? S.proxy : stream.url, hlsLike = /\.m3u8(\?|$)/i.test(stream.url);
          pre(u, hlsLike || DSP.wants()); if (!hlsLike) pre(u, false);
        }
      } catch (e) { /* only a hint */ }
      return ps.apply(this, arguments);
    };
  });

  /* ---------- Progress saves: every 15 s while playing, at once on pause, close and leaving the page ---------- */
  safe('progress', () => {
    const KEEP = 300; let last = 0;
    const prune = () => {
      const keys = Object.keys(S.progress || {}); if (keys.length <= KEEP) return;
      keys.sort((a, b) => ((S.progress[b] && S.progress[b].at) || 0) - ((S.progress[a] && S.progress[a].at) || 0)).slice(KEEP).forEach((k) => { delete S.progress[k]; });
    };
    const sp = saveProgress;
    saveProgress = function (force) {
      const now = Date.now();
      if (!force && now - last < 15000) return; last = now;
      if (force) prune();
      return sp.apply(this, arguments);
    };
    const flush = () => { if (!$('#player').hidden && P.ctx) saveProgress(true); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    addEventListener('pagehide', flush);
  });

  /* ---------- Full screen: the iPad's prefixed API, and the iPhone's own video full screen ---------- */
  safe('fullscreen', () => {
    const tf = toggleFull, el = $id('player');
    toggleFull = async function () {
      if (!el.requestFullscreen && el.webkitRequestFullscreen) {
        try { if (document.webkitFullscreenElement) document.webkitExitFullscreen(); else el.webkitRequestFullscreen(); return; } catch (e) { /* fall through */ }
      }
      if (!el.requestFullscreen && !el.webkitRequestFullscreen && video.webkitEnterFullscreen && video.webkitSupportsFullscreen && !$('#ytwrap').firstChild) {
        if (el.classList.contains('full')) { el.classList.remove('full'); return; }
        try { video.webkitEnterFullscreen(); return; } catch (e) { /* fall through */ }
      }
      return tf.apply(this, arguments);
    };
    $id('pFull').onclick = () => toggleFull();
    document.addEventListener('webkitfullscreenchange', () => el.classList.toggle('full', !!document.webkitFullscreenElement));
    video.addEventListener('webkitendfullscreen', () => { if (!el.hidden) wakeHud(video.paused); });
  });

  /* ---------- Seek previews for HLS streams (computers, on hover) ---------- */
  safe('hls-preview', () => {
    const seek = $id('seek'), box = seek && seek.querySelector('.sp-prev'); if (!box) return;
    const HP = {
      hls: null, v: null, of: null, bad: null, ready: false, want: null, t: -1, pend: 0,
      ok() { return CFG.seekPreview !== false && !NO_HOVER.matches && !IS_TV && !!P.hls && !!P.stream && !P.remux && !!window.Hls && this.bad !== P.hls && !!P.hls.url; },
      ensure() {
        if (this.hls && this.of === P.hls) { if (this.v.parentNode !== box) { box.querySelectorAll('video').forEach((x) => x.remove()); box.insertBefore(this.v, box.firstChild); } return; }
        this.drop();
        const v = this.v = document.createElement('video'); v.className = 'mk-hprev'; v.muted = true; v.playsInline = true; v.preload = 'auto';
        const h = this.hls = new Hls({ enableWorker: true, autoStartLoad: false, startLevel: 0, maxBufferLength: 2, maxMaxBufferLength: 4, backBufferLength: 0, maxBufferSize: 8e6 });
        this.of = P.hls; this.ready = false; this.t = -1;
        h.on(Hls.Events.MANIFEST_PARSED, () => { h.autoLevelCapping = 0; this.ready = true; if (this.want != null) { const t = this.want; this.want = null; h.startLoad(t); this.started = true; } });
        h.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { this.bad = this.of; this.drop(); box.hidden = true; } });
        v.addEventListener('seeked', () => { Tools.keepFrame(v, `hls:${P.hls && P.hls.url}`, v.currentTime); box.classList.remove('cached'); box.classList.add('ok'); });
        this.started = false; h.loadSource(P.hls.url); h.attachMedia(v);
        box.innerHTML = ''; box.appendChild(v);
      },
      seek(t) {
        if (!this.hls || Math.abs(t - this.t) < 1) return; this.t = t; if (!box.querySelector('canvas.sp-c')) box.classList.remove('ok');
        if (!this.ready) { this.want = t; return; }
        if (!this.started) { this.started = true; this.hls.startLoad(t); return; }
        try { this.v.currentTime = t; } catch (e) { /* not seekable yet */ }
      },
      drop() {
        clearTimeout(this.pend);
        if (this.hls) { try { this.hls.destroy(); } catch (e) { /* gone */ } }
        if (this.v) { try { this.v.removeAttribute('src'); this.v.load(); this.v.remove(); } catch (e) { /* gone */ } }
        this.hls = this.v = this.of = null; this.ready = false; this.want = null;
      },
    };
    seek.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !HP.ok()) return;
      const d = pDur(); if (!isFinite(d) || !(d > 0)) return;
      HP.ensure();
      const r = seek.getBoundingClientRect(), p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      box.hidden = false; box.style.left = `${Math.min(92, Math.max(8, p * 100))}%`;
      Tools.showNear(box, `hls:${P.hls.url}`, p * d, d);
      clearTimeout(HP.pend); HP.pend = setTimeout(() => HP.seek(p * d), 80);
    });
    const dp = Tools.dropPreview.bind(Tools);
    Tools.dropPreview = function () { HP.drop(); return dp(); };
  });
})();
