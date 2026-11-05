/* 2.13.0: the Android and TV app (1.3.0+) has the same torrent engine, through MKAndroid.p2pStart/p2pStop. On a TV
   stick it keeps one torrent at a time and stops when free storage runs low. */
const androidP2P = (() => { try { const a = window.MKAndroid; if (!a || !a.p2pStart || !(a.p2pAvailable ? a.p2pAvailable() : true)) return null;
  const call = (r) => { if (!r || /^error/i.test(r)) throw new Error(String(r || 'the engine did not start').replace(/^error:\s*/i, '')); return r; };
  return { platform: IS_TV ? 'tv' : 'android', version: a.version ? a.version() : '', p2p: { start: async () => call(a.p2pStart()), stop: async () => a.p2pStop() }, fresh: true }; } catch (e) { return null; } })();
/* ---------------- 2.12.0 Desktop app extras: torrents on this computer, Discord status ----------------
   Only in the Windows app (window.MKDesktop, set by the app before the page loads). Both are off until turned on.
   Torrents: the app runs a small torrent engine on this PC that only downloads (never uploads or seeds), serves
   the file to the player on 127.0.0.1, and deletes everything when it stops or the app closes.
   Discord: "Watching <title>" on your Discord profile while something plays, through Discord's local pipe. */
const Desktop = {
  d: window.MKDesktop || androidP2P,
  here() { return this.d && this.d.platform === 'windows' ? 'this computer' : this.d && this.d.platform === 'tv' ? 'this TV' : 'this device'; },
  base: null,
  p2pOn() { return !!(this.d && this.d.p2p && Store.raw.get('p2pOn', false)); },
  discordOn() { return !!(this.d && this.d.setPresence && Store.raw.get('discordOn', false)); },
  async engine() {
    if (this.base && !this.d.fresh) return this.base;
    this.base = await this.d.p2p.start(); if (!this.base) throw new Error('the engine did not start');
    return this.base;
  },
  async stop() { this.base = null; try { await this.d.p2p.stop(); } catch (e) { /* already stopped */ } },
  urlFor(base, s) {
    const tr = (s.sources || []).filter((x) => /^tracker:/i.test(x)).map((x) => `&tr=${encodeURIComponent(x.replace(/^tracker:/i, ''))}`).slice(0, 20).join('');
    return `${base}/stream?ih=${String(s.infoHash).toLowerCase()}&idx=${s.fileIdx != null ? Number(s.fileIdx) : -1}${tr}`;
  },
  /* ---- Discord ---- */
  presence(paused) {
    if (!this.discordOn() || $('#player').hidden || !P.ctx || !P.ctx.meta) return;
    const m = P.ctx.meta, v = P.ctx.video, d = video.duration, t = video.currentTime || 0, now = Date.now();
    const poster = /^https:\/\//.test(m.poster || '') ? m.poster : '';
    this.d.setPresence({
      title: m.name || 'Something good', sub: v ? `S${v.season} · E${v.episode}${v.name || v.title ? ` · ${v.name || v.title}` : ''}` : (paused ? 'Paused' : yearOf(m) || ''),
      start: paused ? 0 : now - t * 1000, end: !paused && d && isFinite(d) ? now + (d - t) * 1000 : 0, paused: !!paused, image: poster,
    }).catch(() => {});
  },
  clearPresence() { if (this.d && this.d.setPresence) this.d.setPresence(null).catch(() => {}); },
  /* ---- Settings › Desktop app ---- */
  confirming: false,
  section() {
    return { id: 'desktop', icon: this.d.platform === 'windows' ? 'monitor' : 'magnet', label: this.d.platform === 'windows' ? 'Desktop app' : 'Torrents', intro: this.d.platform === 'windows' ? 'Extras that only the desktop app can do. Both are off until you turn them on.' : 'Play torrent sources without a debrid service. Off until you turn it on.', bind: () => this.bind(), rows: () => [{ html: () => this.html() }] };
  },
  html() {
    const on = this.p2pOn();
    const warn = this.confirming ? `<div class="dk-warn"><p><b>Before you turn this on</b></p><ul>
        <li>Torrent sources play straight from other people's devices. They can see your IP address, the same as any torrent app.</li>
        <li>MKCinema only downloads. It never uploads or seeds, and it deletes what it downloaded when you turn this off or close the app.${this.d.platform === 'windows' ? '' : ' It keeps one torrent at a time and stops if storage runs low.'}</li>
        <li>You are responsible for what you play. Many places have laws about torrents; a debrid service or a VPN keeps your IP private.</li></ul>
        <div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="dkYes">I understand, turn it on</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="dkNo">Cancel</button></div></div>` : '';
    return `<div class="set-row"><div><b>Play torrent sources on ${this.here()}</b><small>${on ? 'On. Sources marked “Torrent” play in MKCinema. Your IP is visible to peers while they play.' : 'Off. Torrent sources need a debrid service or another player.'}</small></div><div class="set-ctl"><button class="switch ${on ? 'on' : ''}" type="button" data-nav id="dkP2p" role="switch" aria-checked="${on}" aria-label="Play torrent sources on ${this.here()}"></button></div></div>${warn}
      ${this.d.setPresence ? `<div class="set-row"><div><b>Show what I'm watching on Discord</b><small>“Watching” and the title on your Discord profile while something plays. Needs the Discord app open on this computer.</small></div><div class="set-ctl"><button class="switch ${this.discordOn() ? 'on' : ''}" type="button" data-nav id="dkDiscord" role="switch" aria-checked="${this.discordOn()}" aria-label="Show what I'm watching on Discord"></button></div></div>` : ''}
      <p class="tour-note">MKCinema for ${esc({ windows: 'Windows', tv: 'TV', android: 'Android' }[this.d.platform] || 'desktop')} ${esc(this.d.version || '')}</p>`;
  },
  repaint() { if (!$('#settings').hidden) renderSettingsBody(); },
  // the open title's sources were ranked before the switch changed: rank them again
  rerank() { try { if (D && D.streams) { D.streams.forEach((s) => { if (s.infoHash && !s.url) s._tel = Telemetry.parse(s); }); if (!$('#detail').hidden) renderStreamsPanel(); } } catch (e) { /* no title open */ } },
  bind() {
    const sw = $('#dkP2p');
    if (sw) sw.onclick = async () => {
      if (this.p2pOn()) { Store.raw.set('p2pOn', false); this.rerank(); await this.stop(); toast('Torrent playback is off. Downloaded pieces were deleted.', 'info'); this.repaint(); return; }
      this.confirming = true; this.repaint(); const y = $('#dkYes'); if (y && IS_TV) Nav.focus(y, true);
    };
    const yes = $('#dkYes'), no = $('#dkNo');
    if (yes) yes.onclick = () => { Store.raw.set('p2pOn', true); this.rerank(); this.confirming = false; toast('Torrent sources now play here', 'ok'); this.repaint(); };
    if (no) no.onclick = () => { this.confirming = false; this.repaint(); };
    const dc = $('#dkDiscord');
    if (dc) dc.onclick = () => { const v = !this.discordOn(); Store.raw.set('discordOn', v); dc.classList.toggle('on', v); dc.setAttribute('aria-checked', v); if (v) this.presence(video.paused); else this.clearPresence(); };
  },
  init() {
    if (!this.d) return;
    if (this.d.p2p) {
      // a torrent with no debrid key is playable here: rank it after debrid and web links, but no longer "unplayable"
      const parse = Telemetry.parse.bind(Telemetry);
      Telemetry.parse = function (s) {
        const t = parse(s);
        if (s.infoHash && !s.url && !t.debrid && Desktop.p2pOn()) { t.webReady = true; t.source = `Torrent · ${Desktop.d.platform === 'windows' ? 'this PC' : 'this device'}`; t.score += 1900; }
        if (s._p2p) t.source = `Torrent · ${Desktop.d.platform === 'windows' ? 'this PC' : 'this device'}`;
        return t;
      };
      const play = playStream;
      playStream = async function (ctx, stream, opts) {
        if (stream && stream.infoHash && !stream.url && !(stream._tel && stream._tel.debrid) && Desktop.p2pOn()) {
          if ($('#player').hidden && !extPlayer()) openLayer('player');
          if (ctx && ctx.meta && !$('#player').hidden) { P.ctx = ctx; Loader.show(ctx.meta); }
          try {
            const base = await Desktop.engine();
            stream._infoHash = stream.infoHash; delete stream.infoHash; stream._p2p = true;
            stream.url = Desktop.urlFor(base, { ...stream, infoHash: stream._infoHash }); stream._tel = Telemetry.parse(stream);
            toast('Finding peers for this torrent. The first start can take up to a minute.', 'info', 5000, 'p2p');
          } catch (e) { Loader.hide(); toast(`Torrent engine: ${e.message || e}`, 'err', 6000); }
        }
        return play(ctx, stream, opts);
      };
    }
    if (this.d.setPresence) {
      ['playing', 'seeked'].forEach((ev) => video.addEventListener(ev, () => { if (!video.paused) this.presence(false); }));
      video.addEventListener('pause', () => this.presence(true));
      const cp = closePlayer; closePlayer = function () { const r = cp.apply(this, arguments); if (Desktop.discordOn()) Desktop.clearPresence(); return r; };
    }
    SECTIONS.push(this.section());
    const grp = SET_GROUPS.find(([n]) => /watching/i.test(n)); if (grp) grp[1].push('desktop');
    SET_BLURB.desktop = this.d.platform === 'windows' ? 'Torrents on this PC, Discord status' : 'Torrents without debrid';
  },
};
Desktop.init();
