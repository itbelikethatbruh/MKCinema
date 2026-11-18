
/* ---------------- 2.78 Guests by link: anyone opens a party link and watches, no account and no addons ----------------
   A guest whose MKCinema can't find the film itself (no account, no stream addons, or nothing that plays) asks the host
   for the picture. The host's player is captured (video.captureStream) and sent to that guest over its own one-way
   WebRTC connection, so no stream link, addon address or debrid key ever leaves the host. The host always makes the
   offer, the guest only answers, so the two never talk over each other. Guests get a temporary name, no host controls,
   and the host can remove them, stop new people joining, and the room holds 10 people (4 of them on the host's picture). */
const PartyGuest = {
  CAP: 10, PIC_CAP: 4,
  open: true, banned: new Set(), flags: new Map(),
  relays: new Map(), wanting: new Set(), cap: null, forcing: false, capBusy: null, told: new Set(),
  rx: null, want: false, idle: false, media: null, askT: 0, tries: 0, why: '', volT: 0,
  ICE: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }],

  /* ---------- who is who ---------- */
  isGuest(id) { return id === Party.me.id ? !!Party.guestFlag() : !!this.flags.get(id); },
  anyGuest() { return [...Party.peers.keys()].some((id) => this.flags.get(id)); },
  // this screen can't find films itself: no stream addons of its own
  needsPic() { try { return typeof StreamsNudge !== 'undefined' ? !StreamsNudge.own() : !engine.addons.length; } catch (e) { return true; } },
  hostName() { const h = Party.peers.get(Party.hostId); return (h && h.name) || 'the host'; },
  relaying() { return this.forcing || (Party.isHost() && this.relays.size > 0); },

  /* ---------- the host's door: who may come in ---------- */
  gate(m, from) {
    this.flags.set(from, !!m.g);
    if (this.banned.has(from)) { if (Party.isHost() && Party.bus) Party.bus.send({ t: 'kick', id: from }); return true; }
    if (!Party.isHost() || Party.peers.has(from) || m.voice) return false;
    const n = 1 + [...Party.peers.values()].filter((p) => !p.voice).length;
    if (!this.open || n >= this.CAP) { Party.bus && Party.bus.send({ t: 'deny', why: this.open ? 'full' : 'locked', _to: from }); return true; }
    return false;
  },
  onMsg(m, from) {
    switch (m.t) {
      case 'pic?': if (m._to === Party.me.id) this.give(from); break;
      case 'pic-no': if (m._to === Party.me.id && from === Party.hostId) this.refused(m.why); break;
      case 'rsig': if (m._to === Party.me.id) { if (Party.isHost()) this.hostSig(from, m.data || {}); else if (from === Party.hostId) this.guestSig(from, m.data || {}); } break;
      case 'deny': if (m._to === Party.me.id) { const why = m.why === 'locked' ? 'The host isn’t letting new people in right now' : 'This party is full (10 people)'; Party.leave(true); this.hide(); toast(why, 'err', 6000); } break;
      case 'kick':
        if (from !== Party.hostId || typeof m.id !== 'string') break;
        if (m.id === Party.me.id) { const c = Party.code; try { sessionStorage.setItem(`mkc:pgban:${c}`, '1'); } catch (e) { /* private mode */ } Party.leave(true); this.hide(); toast('The host removed you from the party', 'err', 6000); }
        else { this.banned.add(m.id); const p = Party.peers.get(m.id); if (p) { Party.dropPeer(m.id); Party.sysLine(`${p.name} was removed`); } }
        break;
      case 'pic-idle': if (from === Party.hostId) { this.idle = true; this.paint(); } break;
      case 'pic-on': if (from === Party.hostId) { this.idle = false; this.paint(); } break;
      case 'lock': if (from === Party.hostId) { this.open = !m.on; Party.render(); } break;
      default: break;
    }
  },
  remove(id) {
    const p = Party.peers.get(id); if (!Party.isHost() || !p) return;
    Gate.ask({ icon: 'user-x', eyebrow: 'Watch party', title: `Remove ${p.name}?`, yes: 'Remove', no: 'Cancel', html: 'They leave the party at once and can’t come back in with this link while the party lasts.' }).then((ok) => {
      if (ok !== true) return;
      this.banned.add(id); Party.send({ t: 'kick', id }); this.drop(id); Party.dropPeer(id); Party.sysLine(`${p.name} was removed`);
    });
  },
  setOpen(on) { this.open = !!on; if (Party.isHost()) Party.send({ t: 'lock', on: !on }); Party.render(); toast(on ? 'New people can join with the link' : 'No one new can join for now', 'info', 2600, 'pglock'); },

  /* ---------- the party panel ---------- */
  tags(id, you) {
    const t = [];
    if (this.isGuest(id) && id !== Party.hostId) t.push('<span class="pm-host pg-tag">Guest</span>');
    if (!you && Party.isHost() && this.relays.has(id)) t.push('<span class="pm-host pg-tag pg-pic">Sees your screen</span>');
    if (!you && Party.isHost() && id !== Party.hostId && !(Party.peers.get(id) || {}).voice) t.push(`<button class="pm-mk pg-rm" type="button" data-pgrm="${esc(id)}" data-nav aria-label="Remove ${esc((Party.peers.get(id) || {}).name || 'this person')}">Remove</button>`);
    return t.join('');
  },
  wire(box) { $$('[data-pgrm]', box).forEach((b) => { b.onclick = () => this.remove(b.dataset.pgrm); }); },
  hostHtml() {
    if (!Party.code || !Party.isHost()) return '';
    return `<div class="pg-door"><label class="pz-switch"><input type="checkbox" role="switch" id="pgOpen" ${this.open ? 'checked' : ''} data-nav><span class="pz-track" aria-hidden="true"></span><span class="pz-sw-t"><b>Anyone with the link can join</b><small>No account or setup needed. Guests without MKCinema of their own see your screen. Up to 10 people. Turn off to keep anyone new out.</small></span></label></div>`;
  },
  bind(root) { const o = $('#pgOpen', root); if (o) o.addEventListener('change', (e) => this.setOpen(e.target.checked)); },
  async share() {
    if (!Party.code) return;
    const url = appLink(`party=${Party.code}`);
    if (!url) { copyText(Party.code, 'Party code copied'); return; }
    const title = `Watch with me on MKCinema (party ${Party.code})`;
    if (navigator.share && TOUCH_UI && !IS_TV) { try { await navigator.share({ title, text: 'Tap to join. No account needed.', url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    if (!(await copyText(url, 'Invite link copied. Anyone who opens it joins, no account needed.', 4200))) prompt('Copy this link', url);
  },
  // a source's long-press menu: start a party on this source and send the invite
  async together(st, row) {
    const inPlayer = !!(row && row.closest && row.closest('#srcList') && P.ctx);
    const ctx = inPlayer ? P.ctx : (typeof D !== 'undefined' && D.meta ? { meta: D.meta, video: D.video, streams: D.streams } : P.ctx);
    if (!ctx || !st) return;
    if (!Party.code) await Party.create();
    await this.share();
    if (!(inPlayer && P.stream === st)) playStream(ctx, st, inPlayer ? { startAt: pNow() } : {});
  },

  /* ---------- the invitation a link opens ---------- */
  async invite(code) {
    let banned = false; try { banned = sessionStorage.getItem(`mkc:pgban:${code}`) === '1'; } catch (e) { /* private mode */ }
    if (banned) { toast('The host removed you from this party', 'err', 5000); return; }
    if (Party.code === code) { if (this.rx || this.want) this.show(); else Party.openPanel(); return; }
    const r = await this.card(code); if (!r) return;
    if (r.name && r.name !== Party.name()) setCfg('partyName', r.name);
    const pic = this.needsPic();
    if (pic) this.show('Joining the party…'); else { openLayer('partyLayer'); Party.render(); }
    await Party.join(code);
    if (!Party.code) return;
    // mic and camera go on once the first connection is up, so their offers never cross the opening one
    if (r.mic || r.cam) for (let i = 0; i < 40 && Party.code && ![...Party.peers.values()].some((p) => p.dc && p.dc.readyState === 'open'); i++) await new Promise((ok) => setTimeout(ok, 250));
    if (!Party.code) return;
    if (r.mic && !Party.mic) await Party.toggleMic();
    // one change at a time on the party's connections, so the camera lane isn't offered while the mic's offer is out
    if (r.mic && r.cam) await new Promise((ok) => setTimeout(ok, 900));
    if (r.cam && typeof Cams !== 'undefined' && !Cams.cam && Party.code) await Cams.toggle();
    if (pic) this.take(null);
  },
  avOk() { return !IS_TV && window.isSecureContext && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
  async perm(kind) { try { return (await navigator.permissions.query({ name: kind })).state; } catch (e) { return 'prompt'; } },
  card(code) {
    return new Promise((done) => {
      let el = $('#pgInvite'); if (el) el.remove();
      const av = this.avOk(), guest = !!Party.guestFlag();
      document.body.insertAdjacentHTML('beforeend', `<div id="pgInvite" class="pg-inv" role="dialog" aria-modal="true" aria-labelledby="pgInvH"><div class="pg-card">
        <span class="eyebrow"><i data-lucide="users"></i>Watch party</span>
        <h2 class="x8-h" id="pgInvH">You’re invited to watch together</h2>
        <p class="pg-sub">Party <b class="mono">${esc(code.split('').join(' '))}</b>${guest ? ' · No account needed' : ''}</p>
        <label class="pg-name"><span>Your name</span><input class="inp" id="pgName" maxlength="24" value="${esc(Party.name())}" autocomplete="nickname" data-nav></label>
        ${av ? `<div class="pg-av" role="group" aria-label="Join with">
          <button type="button" class="pg-tile on" data-av="mic" aria-pressed="true" data-nav><i data-lucide="mic"></i><b>Microphone</b><small data-avs="mic">On</small></button>
          <button type="button" class="pg-tile on" data-av="cam" aria-pressed="true" data-nav><i data-lucide="video"></i><b>Camera</b><small data-avs="cam">On</small></button>
        </div><p class="pg-fine" id="pgFine">Your browser asks once. Voice and video go straight between the people in the party and are never recorded.</p>` : ''}
        <div class="inrow pg-acts"><button class="btn btn-prime" type="button" id="pgGo" data-nav><i data-lucide="log-in"></i>Join now</button><button class="btn btn-ghost" type="button" id="pgNo" data-nav>Not now</button></div>
      </div></div>`);
      el = $('#pgInvite'); icons();
      const state = { mic: av, cam: av }, fine = $('#pgFine', el);
      const paint = (k, s) => {
        const b = $(`[data-av="${k}"]`, el); if (!b) return;
        b.classList.toggle('on', state[k]); b.setAttribute('aria-pressed', String(state[k]));
        $(`[data-avs="${k}"]`, el).textContent = s === 'denied' ? 'Blocked' : state[k] ? 'On' : 'Off';
        b.classList.toggle('blocked', s === 'denied');
      };
      const blockedHelp = () => {
        if (!fine) return;
        fine.innerHTML = PLATFORM === 'ios' ? 'Blocked earlier. On iPhone: Settings › Safari › Camera and Microphone › Ask, then reload this page.'
          : PLATFORM === 'android' && !/Chrome\//.test(navigator.userAgent) ? 'Blocked earlier. Allow them under Android Settings › Apps › MKCinema › Permissions.'
            : 'Blocked earlier. Tap the icon left of the address, allow Camera and Microphone, then reload this page.';
        fine.classList.add('warn');
      };
      if (av) {
        ['mic', 'cam'].forEach((k) => this.perm(k === 'mic' ? 'microphone' : 'camera').then((s) => { if (s === 'denied') { state[k] = false; paint(k, s); blockedHelp(); } }));
        $$('[data-av]', el).forEach((b) => b.addEventListener('click', () => { const k = b.dataset.av; if (b.classList.contains('blocked')) return; state[k] = !state[k]; paint(k); }));
      }
      const name = $('#pgName', el); name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('#pgGo', el).click(); });
      const close = (v) => { el.classList.add('leaving'); setTimeout(() => el.remove(), 200); done(v); };
      $('#pgNo', el).onclick = () => close(null);
      el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } });
      $('#pgGo', el).onclick = async () => {
        let n = name.value.trim().replace(/\s+/g, ' ').slice(0, 24);
        if (/mkcinema|admin|support|moderator|dee ?lavish/i.test(n)) n = '';
        let mic = state.mic, cam = state.cam;
        // one browser question for both, inside this tap; the party turns them on right after joining
        if (mic || cam) {
          $('#pgGo', el).disabled = true;
          try { const s = await navigator.mediaDevices.getUserMedia({ audio: mic, video: cam }); s.getTracks().forEach((t) => t.stop()); }
          catch (e) {
            // a missing camera shouldn't cost the microphone, so try each on its own
            const one = async (c) => { try { const s = await navigator.mediaDevices.getUserMedia(c); s.getTracks().forEach((t) => t.stop()); return true; } catch (er) { return false; } };
            if (mic && cam) { mic = await one({ audio: true }); cam = await one({ video: true }); } else { mic = false; cam = false; }
            if (!mic && !cam) toast(e && e.name === 'NotFoundError' ? 'No camera or microphone was found. Joining without them.' : 'Camera and microphone weren’t allowed. Joining without them; the party panel can turn them on later.', 'info', 5200);
          }
        }
        close({ name: n, mic, cam });
      };
      setTimeout(() => { const g = $('#pgGo', el); if (!g) return; if (IS_TV && typeof Nav !== 'undefined') Nav.focus(g, true); else g.focus({ preventScroll: true }); }, 80);
    });
  },

  /* ---------- guest: ask for the host's picture ---------- */
  // true when this screen watches through the host's picture (or just asked for it); Party.loadMedia stops there
  take(media, none) {
    if (media) { this.media = media; this.idle = false; }
    if (Party.isHost() || (typeof Seats !== 'undefined' && Seats.kids && Seats.kids())) return false;
    if (!this.want && !none && !this.needsPic()) return false;
    this.want = true; this.show(); this.paint();
    if (!this.rx) this.ask();
    return true;
  },
  ask() {
    clearTimeout(this.askT);
    if (!Party.code || !this.want) return;
    if (!Party.hostId || Party.hostId === Party.me.id) { this.askT = setTimeout(() => this.ask(), 1200); return; }
    if (this.rx && this.rx.from === Party.hostId && this.rx.live) return;
    this.tries++; this.why = this.why === 'idle' ? 'idle' : '';
    Party.send({ t: 'pic?', _to: Party.hostId });
    this.paint();
    // nothing came: ask again, then say so (an older MKCinema on the host's side doesn't answer)
    this.askT = setTimeout(() => { if (this.rx && this.rx.live) return; if (this.tries >= 3 && this.why !== 'idle') { this.why = 'silent'; this.paint(); } this.ask(); }, this.why === 'idle' ? 15000 : 9000);
  },
  refused(why) {
    this.why = String(why || 'none'); this.paint();
    if (this.why === 'idle') { clearTimeout(this.askT); this.askT = setTimeout(() => this.ask(), 15000); }
  },
  guestSig(from, { description, candidate } = {}) {
    if (!this.rx || this.rx.from !== from) this.rxOpen(from);
    const pc = this.rx.pc;
    (async () => {
      try {
        if (description) {
          await pc.setRemoteDescription(description);
          if (description.type === 'offer') { await pc.setLocalDescription(); Party.send({ t: 'rsig', _to: from, data: { description: pc.localDescription.toJSON() } }); }
        } else if (candidate) await pc.addIceCandidate(candidate).catch(() => {});
      } catch (e) { console.warn('party picture', e); }
    })();
  },
  rxOpen(from) {
    this.rxClose();
    const pc = new RTCPeerConnection({ iceServers: this.ICE });
    const rx = this.rx = { from, pc, stream: new MediaStream(), live: false };
    pc.onicecandidate = ({ candidate }) => { if (candidate) Party.send({ t: 'rsig', _to: from, data: { candidate: candidate.toJSON() } }); };
    pc.ontrack = (e) => {
      const t = e.track; rx.stream.getTracks().filter((x) => x.kind === t.kind && x !== t).forEach((x) => rx.stream.removeTrack(x));
      if (!rx.stream.getTracks().includes(t)) rx.stream.addTrack(t);
      const v = this.vid(); if (v.srcObject !== rx.stream) v.srcObject = rx.stream;
      const live = () => { rx.live = rx.stream.getVideoTracks().some((x) => x.readyState === 'live' && !x.muted); this.paint(); };
      t.onmute = live; t.onunmute = live; t.onended = live; live();
      this.play();
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed') { rx.live = false; this.why = 'net'; this.paint(); setTimeout(() => { if (this.rx === rx) { this.rxClose(); this.ask(); } }, 3000); }
      if (s === 'connected') { this.why = ''; this.tries = 0; this.paint(); }
    };
  },
  rxClose() { const r = this.rx; this.rx = null; if (!r) return; try { r.pc.close(); } catch (e) { /* closed */ } r.stream.getTracks().forEach((t) => t.stop()); },
  play() {
    const v = this.vid(); v.muted = false; this.vol();
    v.play().then(() => { $('#pgTap').hidden = true; }).catch(() => { v.muted = true; v.play().catch(() => {}); $('#pgTap').hidden = false; });
  },

  /* ---------- host: send the picture ---------- */
  no(to, why) { Party.send({ t: 'pic-no', why, _to: to }); },
  async give(from) {
    if (!Party.isHost()) return;
    const p = Party.peers.get(from); if (!p || p.voice || this.banned.has(from)) return;
    if (this.relays.has(from)) { const r = this.relays.get(from); if (r.pc.connectionState === 'connected') { this.sync(r); return; } this.drop(from); }
    if (this.relays.size >= this.PIC_CAP) { this.no(from, 'full'); return; }
    const why = await this.capture();
    if (why) {
      if (why === 'idle') this.wanting.add(from);
      this.no(from, why);
      if (why !== 'idle' && !this.told.has(why)) { this.told.add(why); toast(this.hostWhy(why), 'info', 7000, 'pgwhy'); }
      return;
    }
    if (!Party.peers.has(from) || this.relays.has(from) || !Party.isHost()) return;
    this.wanting.delete(from);
    const pc = new RTCPeerConnection({ iceServers: this.ICE });
    const r = { pc, snd: {}, id: from }; this.relays.set(from, r);
    pc.onicecandidate = ({ candidate }) => { if (candidate) Party.send({ t: 'rsig', _to: from, data: { candidate: candidate.toJSON() } }); };
    pc.onnegotiationneeded = async () => { if (pc.signalingState !== 'stable') return; try { await pc.setLocalDescription(); Party.send({ t: 'rsig', _to: from, data: { description: pc.localDescription.toJSON() } }); } catch (e) { /* the next change tries again */ } };
    pc.onconnectionstatechange = () => { const s = pc.connectionState; if (s === 'connected') setTimeout(() => this.tune(r), 800); if (s === 'failed' || s === 'closed') { this.drop(from); Party.renderMembers(); } };
    this.sync(r);
    if (!this.told.has(`ok:${from}`)) { this.told.add(`ok:${from}`); toast(`${p.name} has no MKCinema setup, so they see your screen`, 'info', 4200, 'pgok'); }
    Party.renderMembers();
  },
  hostSig(from, { description, candidate } = {}) {
    const r = this.relays.get(from); if (!r) return;
    (async () => {
      try { if (description && description.type === 'answer') { if (r.pc.signalingState === 'have-local-offer') await r.pc.setRemoteDescription(description); } else if (candidate) await r.pc.addIceCandidate(candidate).catch(() => {}); }
      catch (e) { console.warn('party picture', e); }
    })();
  },
  // every connection carries the picture and sound playing now
  sync(r) {
    if (!this.cap) return;
    ['video', 'audio'].forEach((kind) => {
      const t = this.cap.getTracks().find((x) => x.kind === kind && x.readyState === 'live') || null;
      if (t && kind === 'video') try { t.contentHint = 'motion'; } catch (e) { /* older browser */ }
      const s = r.snd[kind];
      try { if (s) { if (s.track !== t) s.replaceTrack(t).catch(() => {}); } else if (t) r.snd[kind] = r.pc.addTrack(t, this.cap); } catch (e) { /* closed */ }
    });
  },
  syncAll() { this.relays.forEach((r) => this.sync(r)); },
  hostWhy(why) {
    return {
      browser: 'Guests without MKCinema need your picture, and this browser can’t send it. Chrome or Edge on a computer or Android phone can.',
      cors: 'This source doesn’t allow its picture to be shared, so guests without MKCinema can’t see it. Another source usually works.',
      yt: 'Trailers can’t be sent to guests. A film or episode can.',
    }[why] || 'Your picture couldn’t be sent to a guest.';
  },
  until(ev, ms) { return new Promise((res) => { const f = () => { clearTimeout(t); res(true); }; const t = setTimeout(() => { video.removeEventListener(ev, f); res(false); }, ms); video.addEventListener(ev, f, { once: true }); }); },
  // '' when the picture is ready, otherwise why not
  capture() {
    if (this.capBusy) return this.capBusy;
    this.capBusy = (async () => {
      try {
        const live = () => this.cap && this.cap.getVideoTracks().some((t) => t.readyState === 'live');
        if (!P.ctx || !P.stream || $('#player').hidden) return 'idle';
        if (P.stream.ytId) return 'yt';
        if (typeof video.captureStream !== 'function') return 'browser';
        const s = P.stream;
        // the native player draws outside the page, and a source without CORS can't be captured: reopen it so it can
        const native = !!(window.MkNative && MkNative.active);
        if (native || (!s._local && !DSP.clean())) {
          this.forcing = true;
          try {
            if (!native) { await DSP.prepare(s); if (P.stream !== s) return 'idle'; if (s._cors !== 'direct' && s._cors !== 'proxy') return 'cors'; }
            toast('Switching to the built-in player so guests can see it…', 'info', 2600, 'pgsw');
            const at = pNow(); playStream(P.ctx, s, { startAt: at });
            await this.until('playing', 20000);
          } finally { this.forcing = false; }
          if (P.stream !== s) return 'idle';
          if (!s._local && !DSP.clean() && !P.hls && !P.remux) return 'cors';
        }
        if (live()) return '';
        try { this.cap = video.captureStream(); } catch (e) { return 'cors'; }
        this.cap.onaddtrack = () => this.syncAll(); this.cap.onremovetrack = () => this.syncAll();
        return live() || video.readyState < 2 ? '' : 'cors';
      } finally { setTimeout(() => { this.capBusy = null; }, 0); }
    })();
    return this.capBusy;
  },
  async tune(r) {
    try {
      const st = await r.pc.getStats(); let relay = false;
      st.forEach((x) => { if (x.type === 'candidate-pair' && x.nominated && x.state === 'succeeded') { const l = st.get(x.localCandidateId), m = st.get(x.remoteCandidateId); relay = relay || (l && l.candidateType === 'relay') || (m && m.candidateType === 'relay'); } });
      const s = r.snd.video; if (!s) return;
      const pr = s.getParameters(); if (!pr.encodings || !pr.encodings.length) return;
      // through the relay a smaller picture keeps the free relay free; straight between homes, up to 1080p
      const h = video.videoHeight || 1080, top = relay ? 720 : 1080;
      pr.encodings[0].maxBitrate = relay ? 1500000 : 5000000; pr.encodings[0].maxFramerate = 30;
      pr.encodings[0].scaleResolutionDownBy = Math.max(1, h / top);
      pr.degradationPreference = 'balanced';
      await s.setParameters(pr);
    } catch (e) { /* older browser: its own defaults */ }
  },
  // the host started (or changed) what plays: keep the picture flowing
  playing() {
    if (!Party.code || !Party.isHost()) return;
    if (this.relays.size) Party.send({ t: 'pic-on' });
    if (this.relays.size && !(this.cap && this.cap.getVideoTracks().some((t) => t.readyState === 'live'))) { this.cap = null; this.capture().then((w) => { if (!w) this.syncAll(); }); }
    else if (this.relays.size) this.syncAll();
    if (this.wanting.size) [...this.wanting].forEach((id) => { this.wanting.delete(id); this.give(id); });
  },
  // the host closed the player: guests see the waiting card, not a frozen last frame
  closed() { if (Party.code && Party.isHost() && this.relays.size) Party.send({ t: 'pic-idle' }); },
  drop(id) { const r = this.relays.get(id); this.wanting.delete(id); if (!r) return; this.relays.delete(id); try { r.pc.close(); } catch (e) { /* closed */ } if (!this.relays.size && this.cap) { this.cap.getTracks().forEach((t) => t.stop()); this.cap = null; } },
  end() {
    [...this.relays.keys()].forEach((id) => this.drop(id)); this.wanting.clear(); this.flags.clear(); this.banned.clear(); this.told.clear(); this.open = true;
    this.rxClose(); this.want = false; this.idle = false; this.media = null; this.tries = 0; this.why = ''; clearTimeout(this.askT); this.hide();
  },

  /* ---------- guest: the screen ---------- */
  vid() { this.build(); return $('#pgVid'); },
  build() {
    if ($('#pgScreen')) return;
    document.body.insertAdjacentHTML('beforeend', `<div id="pgScreen" class="pg-scr" hidden>
      <video id="pgVid" playsinline autoplay></video>
      <div class="pg-wait" id="pgWait" role="status" aria-live="polite"><span class="pg-ring" aria-hidden="true"></span><b id="pgWaitH"></b><small id="pgWaitS"></small><button class="btn btn-ghost btn-sm" type="button" id="pgAdd" data-nav hidden><i data-lucide="puzzle"></i>Add my own streams</button></div>
      <button class="btn btn-prime pg-tap" type="button" id="pgTap" data-nav hidden><i data-lucide="volume-2"></i>Tap for sound</button>
      <div class="pg-reacts reacts" id="pgReacts" aria-hidden="true"></div>
      <div class="pg-bar" id="pgBar">
        <div class="pg-t"><small id="pgWho"></small><b id="pgTitle"></b></div>
        <div class="pg-b">
          <input type="range" class="rng pg-vol" id="pgVol" min="0" max="100" step="5" aria-label="Volume" data-nav>
          <button class="ibtn" type="button" id="pgAskP" data-nav aria-label="Ask the host to pause" title="Ask the host to pause"><i data-lucide="hand"></i></button>
          <button class="ibtn" type="button" id="pgParty" data-nav aria-label="Party: people, chat, mic and camera" title="Party"><i data-lucide="users"></i></button>
          <button class="ibtn" type="button" id="pgFull" data-nav aria-label="Full screen" title="Full screen"><i data-lucide="maximize"></i></button>
          <button class="ibtn danger" type="button" id="pgLeave" data-nav aria-label="Leave the party" title="Leave"><i data-lucide="log-out"></i></button>
        </div>
      </div>
    </div>`);
    icons();
    const el = $('#pgScreen'), v = $('#pgVid'), vol = $('#pgVol');
    vol.value = String(Math.round((CFG.pgVol != null ? CFG.pgVol : 1) * 100));
    vol.addEventListener('input', () => { setCfg('pgVol', Number(vol.value) / 100, { silent: true }); this.vol(); });
    vol.addEventListener('keydown', (e) => { if (/^Arrow/.test(e.key)) e.stopPropagation(); });
    $('#pgTap').onclick = () => { v.muted = false; v.play().catch(() => {}); $('#pgTap').hidden = true; };
    $('#pgParty').onclick = () => { openLayer('partyLayer'); Party.render(); };
    $('#pgAskP').onclick = () => { const now = Date.now(); if (now - (this.apAt || 0) < 8000) return; this.apAt = now; Party.send({ t: 'askpause', name: Party.name() }); toast('You asked the host to pause for everyone', 'info', 2600, 'ap'); };
    $('#pgFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else (el.requestFullscreen ? el.requestFullscreen() : Promise.reject()).catch(() => { if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); }); };
    $('#pgLeave').onclick = () => Party.leave();
    $('#pgAdd').onclick = () => { Party.leave(true); const b = $('#openAddons'); if (b) b.click(); };
    // the bar fades away while the film plays, and comes back on any touch or move
    const wake = () => { el.classList.add('awake'); clearTimeout(this.barT); this.barT = setTimeout(() => { if (this.rx && this.rx.live && !el.contains(document.activeElement)) el.classList.remove('awake'); }, 3200); };
    ['pointermove', 'pointerdown', 'keydown'].forEach((e) => el.addEventListener(e, wake)); wake();
    el.addEventListener('dblclick', (e) => { if (e.target === v) $('#pgFull').click(); });
  },
  // film volume, and the same dip under people's voices as the main player
  vol() {
    const v = $('#pgVid'); if (!v) return;
    const base = CFG.pgVol != null ? CFG.pgVol : 1, dip = typeof Duck !== 'undefined' && Duck.target < 1 ? Duck.target : 1;
    const want = Math.max(0, Math.min(1, base * dip)); if (Math.abs(v.volume - want) > 0.01) v.volume = want;
  },
  show(line) {
    this.build(); const el = $('#pgScreen');
    if (el.hidden) { el.hidden = false; document.documentElement.classList.add('pg-on'); clearInterval(this.volT); this.volT = setInterval(() => this.vol(), 120); }
    if (line) { $('#pgWaitH').textContent = line; $('#pgWaitS').textContent = ''; }
    else this.paint();
    if (IS_TV) setTimeout(() => { const b = $('#pgParty'); if (b && typeof Nav !== 'undefined' && !$('#pgScreen').hidden) Nav.focus(b, true); }, 60);
  },
  hide() {
    const el = $('#pgScreen'); if (!el || el.hidden) return;
    el.hidden = true; document.documentElement.classList.remove('pg-on'); clearInterval(this.volT);
    const v = $('#pgVid'); if (v) { try { v.pause(); } catch (e) { /* fine */ } v.srcObject = null; }
    if (document.fullscreenElement === el) document.exitFullscreen().catch(() => {});
  },
  reactBox() { const el = $('#pgScreen'); return el && !el.hidden ? $('#pgReacts') : null; },
  paint() {
    const el = $('#pgScreen'); if (!el || el.hidden) return;
    const host = this.hostName(), live = !!(this.rx && this.rx.live) && !this.idle;
    el.classList.toggle('live', live);
    $('#pgWho').textContent = Party.code ? `Watching with ${host} · Party ${Party.code}` : '';
    $('#pgTitle').textContent = (this.media && this.media.name) || '';
    let h = '', s = '', add = false;
    if (!Party.code) h = 'Joining the party…';
    else if (!Party.hostId) { h = 'Looking for the host…'; s = 'If this takes long, the party may have ended.'; }
    else if (this.why === 'idle' || this.idle || (!this.media && !live)) { h = `Waiting for ${host} to start a film`; s = 'It shows here the moment they press play. Say hi in the party chat meanwhile.'; }
    else if (this.why === 'full') { h = `${host}’s screen is already shared with ${this.PIC_CAP} guests`; s = 'That’s the most one screen can send. Add your own streams to watch on your own source.'; add = true; }
    else if (this.why === 'browser') { h = `${host}’s browser can’t share its picture`; s = 'Ask them to host from Chrome or Edge on a computer or Android phone, or add your own streams.'; add = true; }
    else if (this.why === 'cors' || this.why === 'yt') { h = 'This source can’t be shared'; s = `${host} can pick another source, or you can add your own streams.`; add = true; }
    else if (this.why === 'silent') { h = `${host}’s MKCinema didn’t answer`; s = 'They may need to reload MKCinema to get the newest version. Still trying…'; add = true; }
    else if (this.why === 'net') { h = 'The connection dropped'; s = 'Reconnecting…'; }
    else if (!live) { h = `Connecting to ${host}’s screen…`; s = 'This takes a few seconds.'; }
    $('#pgWaitH').textContent = h; $('#pgWaitS').textContent = s; $('#pgAdd').hidden = !add || IS_TV;
    $('#pgWait').hidden = live;
  },
};
// the host's player started something: send it to the guests waiting for a picture
video.addEventListener('playing', () => { if (Party.code) PartyGuest.playing(); });
CFG_HOOKS.push((k) => { if (k === 'partyName' && Party.code) Party.render(); });
