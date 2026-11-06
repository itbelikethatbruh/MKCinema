/* ---------------- 2.24.1 Safari playback (iPhone, iPad and Safari on a Mac) ----------------
   Why streams "were too slow" on iPhone: failover gave every source 3.5 s to load its metadata. Safari often loads
   nothing until a tap starts playback, can't open MKV files at all, and debrid hosts can take longer than 3.5 s to
   answer on mobile data, so every source failed in turn. On Safari (every iOS browser is Safari underneath):
   - playback is started right away, and when Safari wants a tap first, a Play button asks for it (no failover);
   - MKV and AVI files, which Safari can't open, rank last, carry a "Not for Safari" tag and are skipped;
   - .m3u8 streams use Safari's own HLS player instead of waiting for hls.js;
   - a source gets 10 s to start, longer while data is still arriving;
   - after 4 automatic switches, or when nothing playable is left, an honest message replaces the loop. */
{
  const ua = navigator.userAgent || '';
  const WK = !IS_TV && (PLATFORM === 'ios' || (/Safari\//.test(ua) && /Apple/.test(navigator.vendor || '') && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg\/|Android/.test(ua)));
  const can = (t) => { try { return !!video.canPlayType(t); } catch (e) { return false; } };
  const noMkv = !can('video/x-matroska');
  const nativeHls = can('application/vnd.apple.mpegurl') || can('application/x-mpegURL');
  const MAX_HOPS = 4;
  const fileOf = (s) => `${s.url || ''} ${(s.behaviorHints || {}).filename || ''}`;
  const badFormat = (s, t) => (t.mkv && noMkv ? 'mkv' : /\.avi(\?|\s|$)/i.test(fileOf(s)) ? 'avi' : '');

  const Safari = {
    on: WK, tok: 0, lastProg: 0, forced: new WeakSet(),
    /* Start loading now: Safari may not fetch anything before play(). A refused play() means it wants a tap. */
    kick(stream) {
      const tok = ++this.tok; this.lastProg = 0;
      let p; try { p = video.play(); } catch (e) { return; }
      if (p && p.catch) p.catch((e) => { if (tok === this.tok && P.stream === stream && !$('#player').hidden && e && e.name === 'NotAllowedError') this.askTap(stream); });
    },
    askTap(stream) {
      clearTimeout(Failover.t); Loader.hide();
      showMsg('Tap to start', 'Safari needs a tap before a video can play.', '<button class="btn btn-prime" type="button" id="wkTap"><i data-lucide="play"></i>Play</button><button class="btn btn-ghost" type="button" data-act="sources"><i data-lucide="layers"></i>Sources</button>');
      const b = $('#wkTap'); if (!b) return;
      b.addEventListener('click', () => {
        if (P.stream !== stream) return;
        hideMsg(); if (P.ctx) Loader.show(P.ctx.meta);
        const tok = ++this.tok;
        video.play().catch((e) => { if (tok === this.tok && P.stream === stream && e && e.name === 'NotAllowedError') this.askTap(stream); });
        this.arm(stream);
      }, { once: true });
      try { b.focus(); } catch (e) { /* ignore */ }
    },
    /* Replaces the 3.5 s start limit: 10 s, extended while bytes are still arriving (up to 25 s). */
    arm(stream) {
      clearTimeout(Failover.t);
      if (!CFG.failover || stream._local || stream._handoff || stream._audioTry) return;
      const t0 = performance.now();
      const check = () => {
        if (P.stream !== stream || $('#player').hidden || video.readyState >= 1 || !$('#pMsg').hidden) return;
        const now = performance.now();
        if (now - t0 < 25000 && this.lastProg && now - this.lastProg < 4000) { Failover.t = setTimeout(check, 3000); return; }
        Failover.next(stream, `did not start within ${Math.round((now - t0) / 1000)} s`, P.startAt || 0);
      };
      Failover.t = setTimeout(check, 10000);
    },
    /* A file Safari can't open: switch to the next source that can, or say so plainly. */
    refuse(stream) {
      Failover.arm(stream); Failover.clear();
      if (CFG.failover && Failover.next(stream, 'format not supported in Safari', P.startAt || 0)) return;
      this.explain(stream, 'format');
    },
    explain(stream, why) {
      if (P.stream !== stream || $('#player').hidden) return;
      clearTimeout(Failover.t); Loader.hide();
      const t = stream._tel || {}, fmt = t._wkBad;
      const title = why === 'format' ? 'Safari can’t play this file' : 'These sources won’t play in Safari';
      const lead = why === 'format'
        ? `This source is ${fmt === 'avi' ? 'an AVI' : 'an MKV'} file, and Safari can’t open those.`
        : 'MKCinema tried a few sources and none of them started.';
      const body = `${lead} Safari on iPhone and iPad plays MP4 and HLS (.m3u8) streams. Many debrid files are MKV, or use audio Safari can’t decode. VLC is free and plays all of them: open this one there, or pick an MP4 or HLS source.`;
      const force = why === 'format' ? '<button class="btn btn-ghost" type="button" id="wkForce"><i data-lucide="play"></i>Try anyway</button>' : '';
      showMsg(title, body, `${handoffHTML(stream)}<button class="btn btn-ghost" type="button" data-act="sources"><i data-lucide="layers"></i>Sources</button>${force}${vlcButtons()}`);
      const f = $('#wkForce');
      if (f) f.addEventListener('click', () => { this.forced.add(stream); playStream(P.ctx, stream, { startAt: P.startAt || 0 }); }, { once: true });
    },
  };
  window.MKSafari = Safari;

  if (WK) {
    video.addEventListener('progress', () => { Safari.lastProg = performance.now(); });

    // rank what Safari can't open last, and tag it in the source list
    const parse = Telemetry.parse.bind(Telemetry), badges = Telemetry.badges.bind(Telemetry);
    Telemetry.parse = function (s) {
      const t = parse(s);
      if (t && !s._local && (t.kind === 'http' || t.kind === 'hls' || t.debrid)) { const b = badFormat(s, t); if (b) { t._wkBad = b; t.score -= 1500; } }
      return t;
    };
    Telemetry.badges = (s, tel, a, c) => `${tel && tel._wkBad ? '<span class="tb unc">Not for Safari</span>' : ''}${badges(s, tel, a, c)}`;

    // failover only switches to sources Safari can open, and stops looping after a few tries
    const cands = Failover.candidates.bind(Failover), next = Failover.next.bind(Failover);
    Failover.candidates = function (failed) { return cands(failed).filter((s) => !s._tel._wkBad); };
    Failover.next = function (failed, reason, at) {
      if ((this.hops || 0) >= MAX_HOPS) { Safari.explain(failed, 'tries'); return true; }
      if (next(failed, reason, at)) return true;
      if (P.stream === failed && !$('#player').hidden) { Safari.explain(failed, /not supported/i.test(reason) && failed._tel && failed._tel._wkBad ? 'format' : 'tries'); return true; }
      return false;
    };

    const lu = loadUrl;
    loadUrl = function (stream, startAt) {
      if (!stream || stream._local || !stream.url) return lu.apply(this, arguments);
      if (stream._tel && stream._tel._wkBad && !Safari.forced.has(stream)) {
        // after playStream finishes its own steps, so the switch doesn't run inside them
        setTimeout(() => { if (P.stream === stream && !$('#player').hidden) Safari.refuse(stream); }, 0); return;
      }
      if (/\.m3u8(\?|$)/i.test(stream.url) && nativeHls) {
        // Safari's own HLS player: no 400 KB hls.js download, and no MediaSource quirks on iPhone
        const H = window.Hls, failed = HlsLoad.failed;
        try { window.Hls = undefined; HlsLoad.failed = true; lu.apply(this, arguments); } finally { window.Hls = H; HlsLoad.failed = failed; }
      } else {
        lu.apply(this, arguments);
        // hls.js is still downloading: loadUrl runs again once it is here
        if (!video.getAttribute('src') && !P.hls) return;
      }
      Safari.arm(stream);
      Safari.kick(stream);
    };
  }
}
