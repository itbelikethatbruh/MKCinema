
/* 2.84.1 Torrent wait (GitHub issue #302): torrents on this device get the time they need, and say what went wrong.
   1) A torrent played by the app's own helper needs up to a minute to find peers and the file's details, but every
      source got 10 s (25 s while bytes arrive) before failover dropped it, so torrents that were still connecting
      failed and the Mac app said "These sources won't play in Safari". Torrent sources now follow the helper's own
      status: peers found, details received, bytes arriving. They fail over only when nobody shares the torrent, the
      network can't reach any peers, or no video arrives, and the message says which.
   2) The Mac app no longer calls itself Safari in its playback messages.
   3) Notice clips that some addons send instead of sources (a file named like error-general.mp4) rank last and are
      never picked by Smart Play or failover.
   4) The Mac app (1.3.2+) saves .m3u playlists through the app: its window can't download files. */
(() => {
  const D = (typeof Desktop !== 'undefined' && Desktop.d) || null;

  /* ---------- 3) notice clips ---------- */
  const NOTICE = /^(error|errors|failed|failure|expired|invalid|unauthori[sz]ed|forbidden|blocked|banned|rate[-_]?limit(ed)?|no[-_]?results?|not[-_]?found|unavailable|notice|warning|access[-_]?denied|download[-_]?failed|key[-_]?(invalid|expired|missing))([-_][\w-]*)?\.(mp4|m4v|webm|mkv|mov)$/i;
  const isNotice = (s) => { try { if (!s || !s.url || s.infoHash || s._local) return false; const f = new URL(s.url).pathname.split('/').pop(); return NOTICE.test(decodeURIComponent(f)); } catch (e) { return false; } };
  if (typeof Telemetry !== 'undefined') {
    const parse = Telemetry.parse.bind(Telemetry);
    Telemetry.parse = function (s) { const t = parse(s); if (t && isNotice(s)) { t.notice = true; t.score -= 6000; } return t; };
  }
  if (typeof Failover !== 'undefined' && Failover.candidates) {
    const cands = Failover.candidates.bind(Failover);
    Failover.candidates = function (failed) { return cands(failed).filter((s) => !(s._tel && s._tel.notice)); };
  }

  /* ---------- 4) .m3u in the Mac app ---------- */
  if (D && typeof downloadM3U === 'function') {
    const dl = downloadM3U;
    downloadM3U = function (url, title) { // eslint-disable-line no-global-assign
      const d = window.MKDesktop;
      if (!d || typeof d.savePlaylist !== 'function') return dl.apply(this, arguments);
      const name = String(title || 'stream').replace(/[\r\n]/g, ' ');
      d.savePlaylist(name, `#EXTM3U\n#EXTINF:-1,${name}\n${url}\n`)
        .then(() => toast('Saved the playlist in Downloads and opened it', 'ok', 3500))
        .catch((e) => toast(`Couldn’t save the playlist: ${(e && e.message) || e}`, 'err', 5000));
    };
  }

  if (!D || !D.p2p || typeof Failover === 'undefined') return;

  /* ---------- 1) torrents wait for the helper ---------- */
  const isP2P = (s) => !!(s && s._p2p && /\/stream\?ih=[0-9a-f]{40}/i.test(s.url || ''));
  const W = {
    cur: null, t: 0, why: new WeakMap(),
    stop() { clearTimeout(this.t); this.cur = null; },
    watch(stream) {
      if (this.cur === stream) return;
      this.stop(); this.cur = stream; this.why.delete(stream);
      const url = stream.url.replace('/stream?', '/status?');
      const t0 = performance.now(); let infoAt = 0, read = 0, readAt = 0, seen = false;
      const tick = async () => {
        if (this.cur !== stream) return;
        if (P.stream !== stream || $('#player').hidden || video.readyState >= 1 || !$('#pMsg').hidden) { this.stop(); return; }
        let st = null;
        try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) st = await r.json(); } catch (e) { st = null; }
        if (this.cur !== stream || P.stream !== stream || video.readyState >= 1) return;
        const now = performance.now(), sec = (now - t0) / 1000;
        if (st && st.known) {
          seen = true;
          if (st.info && !infoAt) infoAt = now;
          if ((st.read || 0) > read) { read = st.read; readAt = now; }
          const n = st.peers || 0;
          toast(read ? `Downloading the start of the video: ${fmtBytes(read)} from ${n} peers` : st.info ? `Connected to ${n} peers. Waiting for the start of the video…` : n ? `Connected to ${n} peers. Getting the torrent’s details…` : 'Finding peers for this torrent…', 'info', 4500, 'p2p');
        }
        let why = '';
        if (!seen && sec > 30) why = 'helper';
        else if (seen && !infoAt && sec > 70) why = st && st.found === 0 ? (st.dht === 0 ? 'net' : 'nobody') : 'slow';
        else if (infoAt && !read && now - infoAt > 45000) why = 'nodata';
        else if (read && now - readAt > 40000) why = 'nodata';
        if (why) { this.give(stream, why); return; }
        this.t = setTimeout(tick, 2000);
      };
      this.t = setTimeout(tick, 1500);
    },
    TEXT: {
      nobody: ['Nobody is sharing this torrent right now', 'MKCinema looked for people sharing this torrent for over a minute and found none. Pick another source, ideally one with more peers.'],
      net: ['Torrents can’t connect on this network', 'MKCinema couldn’t reach anyone on the torrent network. A firewall, VPN or network setting may be blocking torrents. Try another network, or play this through a debrid service.'],
      slow: ['This torrent is too slow to start', 'MKCinema found peers, but none of them sent the torrent’s details in time. Try again, or pick a source with more peers.'],
      nodata: ['This torrent isn’t sending the video', 'Peers were found, but the start of the video didn’t arrive. Pick another source with more peers.'],
      helper: ['The torrent helper didn’t answer', 'Turn Play torrent sources off and on again in Settings › Torrents, or restart MKCinema.'],
    },
    give(stream, why) {
      this.stop(); this.why.set(stream, why);
      try { MKLog.add('warn', `torrent: ${why}`); } catch (e) { /* no log */ }
      toast(this.TEXT[why][0], 'info', 5000, 'p2p');
      let more = true; try { more = Failover.candidates(stream).length > 0; } catch (e) { more = true; }
      if (more && CFG.failover && Failover.next(stream, `torrent: ${why}`, P.startAt || 0)) return;
      this.show(stream);
    },
    show(stream) {
      if (P.stream !== stream || $('#player').hidden) return false;
      const why = this.why.get(stream); if (!why) return false;
      clearTimeout(Failover.t); Loader.hide();
      const [title, body] = this.TEXT[why];
      showMsg(title, esc(body), '<button class="btn btn-prime" type="button" data-act="sources"><i data-lucide="layers"></i>Sources</button>');
      return true;
    },
  };
  window.MkTorrentWait = W;
  const after = (stream) => { if (!isP2P(stream) || !CFG.failover) return; clearTimeout(Failover.t); W.watch(stream); };
  const arm = Failover.arm.bind(Failover);
  Failover.arm = function (stream) { arm(stream); after(stream); };
  if (window.MKSafari && MKSafari.arm) { const sa = MKSafari.arm.bind(MKSafari); MKSafari.arm = function (stream) { sa(stream); after(stream); }; }
  video.addEventListener('loadedmetadata', () => W.stop());

  /* ---------- 2) the Mac app is not Safari ---------- */
  if (window.MKSafari && D.platform === 'mac') {
    const ex = MKSafari.explain.bind(MKSafari);
    MKSafari.explain = function (stream, why) {
      if (W.show(stream)) return;
      ex(stream, why);
      const m = $('#pMsg'); if (!m || m.hidden) return;
      const h = m.querySelector('h3'), p = m.querySelector('p'); if (!h || !p || !/Safari/.test(h.textContent)) return;
      const fmt = stream && stream._tel && stream._tel._wkBad;
      if (why === 'format') {
        h.textContent = 'This file won’t play in MKCinema for Mac';
        p.textContent = fmt === 'avi' ? 'It’s an AVI file, and the video engine built into macOS can’t open those. Pick another source, or open this one in VLC.' : 'MKCinema couldn’t prepare this MKV file for the video engine built into macOS. Pick another source, or open this one in VLC.';
      } else {
        h.textContent = 'None of these sources started';
        p.textContent = 'MKCinema tried a few sources and none of them started on this Mac. Pick another source from the list.';
      }
    };
  }
})();
