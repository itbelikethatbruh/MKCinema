"""2.24.0 Watch party voice: its own channel and volume, and voices on your phone.

A redditor's suggestion (Dee, 2026-11-06): voice chat on a separate channel from the film, and an option to have
voices only on the phone. Usage: python3 patch.py <folder with index.html and remote.html>
Version-agnostic: sets 2.24.0 only when the folder is older.
"""
import os, re, sys

VER = '2.24.0'


def newer(a, b):
    return tuple(int(x) for x in a.split('.')) > tuple(int(x) for x in b.split('.'))


def rep(s, a, b):
    assert s.count(a) == 1, f'expected one match for: {a[:80]!r} (found {s.count(a)})'
    return s.replace(a, b, 1)


CSS = r"""<style id="mkc-224css">
/* 2.24.0 party voice controls */
.pzv{display:grid;gap:10px;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.025)}
.pzv-row{display:flex;align-items:center;justify-content:space-between;gap:8px 14px;flex-wrap:wrap}
.pzv-l{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:var(--ink);min-width:0}
.pzv-l svg{width:16px;height:16px;color:var(--mute);flex:none}
.pzv-c{display:flex;align-items:center;gap:10px}
input[type=range].pzv-rng{width:min(180px,44vw)}
.pzv-n{font-size:12.5px;color:var(--mute);min-width:40px;text-align:right;font-weight:600}
.pzv-seg button{height:32px;padding-inline:12px;font-size:12.5px}
.pzv-st{min-width:44px;justify-content:center;font-size:18px}
.pzv-sel{max-width:260px;height:36px}
.pzv-note{margin:0;font-size:12px;color:var(--mute);line-height:1.4;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pzv-note.ok{color:var(--ok,#9ccfb0)}
.pm-v{margin-left:6px}
html.tv .pzv-seg button{height:40px}
/* phones: reactions get their own row instead of a one-emoji-wide column between Mic and Leave */
@media (max-width:560px){.pz-ctl{justify-content:space-between}.pz-ctl .py-reacts{order:3;flex:1 1 100%}}
html.tv .pzv .nav-focus{outline:2px solid #f2f2f3;outline-offset:2px}
</style>
"""

JS = r"""<script id="mkc-224">
/* ---------------- 2.24.0 Watch party voice: its own channel, and voices on your phone ----------------
   Voices play on their own audio elements, apart from the film, so they get their own volume (and, on a computer,
   their own speakers or headset). How far the film dips while people talk is a choice. Voices can also move to the
   phone paired as a remote: the phone joins the party as a voice-only member, hears everyone and talks with its own
   mic, and this screen mutes voices once the phone is in. A phone that belongs to this screen is never played here,
   because it is in the same room. */
{
  const DIPS = [[1, 'Off'], [0.6, 'A little'], [0.35, 'A lot']];
  const vol = () => { const v = Number(CFG.partyVoiceVol); return CFG.partyVoiceVol == null || CFG.partyVoiceVol === '' || !isFinite(v) ? 1 : clamp(v, 0, 1); };
  const dip = () => { const d = Number(CFG.partyDip); return DIPS.some(([x]) => x === d) ? d : 0.35; };
  const pct = () => Math.round(vol() * 100);
  const canSink = !IS_TV && !TOUCH_UI && typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  // the film's dip follows the setting; "Off" never touches the film
  Duck.set = function (on) {
    if (on && dip() >= 1) on = false;
    const tgt = on ? dip() : 1; if (tgt === this.target) return; this.target = tgt;
    if (DSP.n) { const g = DSP.n.duck.gain, t = DSP.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(tgt, t + 0.15); return; }
    cancelAnimationFrame(this.raf);
    if (on && !P.ducking) { this.base = video.volume; P.ducking = true; }
    const from = video.volume, to = this.base * tgt, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 150); video.volume = clamp(from + (to - from) * k, 0, 1);
      if (k < 1) this.raf = requestAnimationFrame(step); else if (!on) P.ducking = false;
    };
    this.raf = requestAnimationFrame(step);
  };

  Party.ownPhone = function (p) { return !!p && !!p.voice && p.of === this.me.id; };
  Party.phoneIn = function () { return [...this.peers.values()].some((p) => this.ownPhone(p) && p.pc.connectionState === 'connected'); };
  Party.applyVoice = function () {
    const phone = !!CFG.partyVoicePhone && this.phoneIn(), v = vol(), out = CFG.partyVoiceOut || '';
    this.peers.forEach((p) => {
      if (this.ownPhone(p)) { p.an = null; this.speaking.delete(p.id); } // your own voice never dips your own film
      const a = p.audio; if (!a) return;
      if (a.volume !== v) a.volume = v;
      const mute = phone || this.ownPhone(p); if (a.muted !== mute) a.muted = mute;
      if (canSink && a.sinkId !== out) a.setSinkId(out).catch(() => {});
    });
  };

  const onMsg = Party.onMsg;
  Party.onMsg = function (m) {
    const r = onMsg.call(this, m);
    if (m && m.t === 'hello') {
      const p = this.peers.get(m._from);
      if (p) { p.voice = !!m.voice; p.of = p.voice ? String(m.of || '') : ''; if (p.voice && this.hostId === p.id) { this.hostId = ''; this.electHost(); } this.applyVoice(); this.renderMembers(); }
    }
    return r;
  };
  // a voice-only phone never leads playback
  Party.electHost = function () {
    const h = this.peers.get(this.hostId);
    if (this.hostId && (this.hostId === this.me.id || (h && !h.voice))) return;
    const ids = [this.me.id, ...[...this.peers.values()].filter((p) => !p.voice).map((p) => p.id)].sort(); this.hostId = ids[0]; this.render();
  };
  const vin = Party.voiceIn;
  Party.voiceIn = function (p, stream) { vin.call(this, p, stream); this.applyVoice(); };

  const note = () => {
    if (!CFG.partyVoicePhone) return { t: 'Voices have their own volume, apart from the film’s.' };
    if (Party.phoneIn()) return { t: 'Voices are on your phone, and its mic talks to the party. This screen plays only the film.', ok: true };
    if (Remote.peers.size) return { t: 'On your phone’s remote, tap Party voice. Until then, voices play here.' };
    return { t: 'Pair your phone as a remote first. Until then, voices play here.', pair: true };
  };
  const paintVoice = () => {
    const n = note(), html = `<span>${esc(n.t)}</span>${n.pair ? '<button class="btn btn-ghost btn-sm pzv-pair" type="button" data-nav><i data-lucide="qr-code"></i>Pair a phone</button>' : ''}`;
    $$('.pzv').forEach((box) => {
      const p = $('.pzv-note', box);
      if (p && p.dataset.h !== html) {
        p.dataset.h = html; p.innerHTML = html; p.classList.toggle('ok', !!n.ok);
        const b = $('.pzv-pair', p); if (b) { b.onclick = () => Cast.open('remote'); icons(); }
      }
      $$('[data-vw]', box).forEach((b) => { const on = (b.dataset.vw === 'phone') === !!CFG.partyVoicePhone; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      $$('[data-dip]', box).forEach((b) => { const on = Number(b.dataset.dip) === dip(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      $$('.pzv-n', box).forEach((b) => { b.textContent = `${pct()}%`; });
      const r = $('.pzv-rng', box); if (r && document.activeElement !== r) r.value = String(pct());
    });
  };
  const voiceHtml = () => {
    const step = (d, l) => `<button class="btn btn-ghost btn-sm pzv-st" type="button" data-vstep="${d}" data-nav aria-label="${l}">${d < 0 ? '−' : '+'}</button>`;
    return `<section class="pzv" aria-label="Voice chat">
      <div class="pzv-row"><span class="pzv-l"><i data-lucide="volume-2"></i><span>Voice volume</span></span>
        <span class="pzv-c">${IS_TV ? step(-1, 'Quieter voices') : `<input type="range" class="rng pzv-rng" min="0" max="100" step="5" value="${pct()}" aria-label="Voice volume" data-nav>`}<b class="pzv-n tnum">${pct()}%</b>${IS_TV ? step(1, 'Louder voices') : ''}</span></div>
      <div class="pzv-row"><span class="pzv-l"><i data-lucide="film"></i><span>Film dips while people talk</span></span>
        <span class="segc pzv-seg" role="group" aria-label="Film dips while people talk">${DIPS.map(([v, l]) => `<button type="button" data-dip="${v}" data-nav>${l}</button>`).join('')}</span></div>
      <div class="pzv-row"><span class="pzv-l"><i data-lucide="smartphone"></i><span>Voices play on</span></span>
        <span class="segc pzv-seg" role="group" aria-label="Voices play on"><button type="button" data-vw="screen" data-nav>This screen</button><button type="button" data-vw="phone" data-nav>My phone</button></span></div>
      <div class="pzv-row pzv-out" hidden><span class="pzv-l"><i data-lucide="headphones"></i><span>Voices come out of</span></span><select class="inp pzv-sel" aria-label="Voices come out of" data-nav></select></div>
      <p class="pzv-note"></p>
    </section>`;
  };
  const html = Party.html;
  Party.html = function () { const h = html.call(this); return this.code ? h.replace('<div class="py-chat"', `${voiceHtml()}<div class="py-chat"`) : h; };

  const render = Party.render;
  Party.render = function (...a) {
    const r = render.apply(this, a);
    $$('.pzv').forEach((box) => {
      if (box.dataset.w) return; box.dataset.w = '1';
      const rng = $('.pzv-rng', box);
      if (rng) {
        rng.addEventListener('input', () => { setCfg('partyVoiceVol', Number(rng.value) / 100, { silent: true }); this.applyVoice(); paintVoice(); });
        rng.addEventListener('keydown', (e) => { if (/^Arrow/.test(e.key)) e.stopPropagation(); });
      }
      $$('[data-vstep]', box).forEach((b) => b.addEventListener('click', () => { setCfg('partyVoiceVol', clamp(Math.round((vol() + Number(b.dataset.vstep) * 0.1) * 10) / 10, 0, 1), { silent: true }); this.applyVoice(); paintVoice(); }));
      $$('[data-dip]', box).forEach((b) => b.addEventListener('click', () => { setCfg('partyDip', Number(b.dataset.dip), { silent: true }); if (Duck.target < 1) Duck.set(true); paintVoice(); }));
      $$('[data-vw]', box).forEach((b) => b.addEventListener('click', () => {
        const ph = b.dataset.vw === 'phone'; setCfg('partyVoicePhone', ph, { silent: true });
        if (ph && !Remote.bus) Remote.host();
        this.applyVoice(); paintVoice(); Remote.soon();
      }));
      const sel = $('.pzv-sel', box);
      if (canSink && sel && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices().then((list) => {
          const outs = list.filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
          // labels only show once this site may use the mic; without them the choice would be guesswork
          if (outs.length < 2 || !outs.some((d) => d.label)) return;
          sel.innerHTML = `<option value="">Same as the film</option>${outs.map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === CFG.partyVoiceOut ? ' selected' : ''}>${esc(d.label || `Speaker ${i + 1}`)}</option>`).join('')}`;
          sel.closest('.pzv-out').hidden = false;
        }).catch(() => {});
        sel.addEventListener('change', () => { setCfg('partyVoiceOut', sel.value, { silent: true }); this.applyVoice(); });
      }
    });
    paintVoice();
    return r;
  };
  const members = Party.renderMembers;
  Party.renderMembers = function (...a) {
    const r = members.apply(this, a);
    this.peers.forEach((p) => {
      if (!p.voice) return;
      $$(`.pm-row[data-pid="${CSS.escape(p.id)}"]`).forEach((row) => { if (!$('.pm-v', row)) row.insertAdjacentHTML('beforeend', `<span class="pm-host pm-v">${this.ownPhone(p) ? 'Your phone' : 'Phone'}</span>`); });
    });
    this.applyVoice(); paintVoice();
    return r;
  };

  // the paired phone learns the party code from the remote state, only while voices are set to the phone
  const st = Remote.state.bind(Remote);
  Remote.state = function () { const s = st(); if (Party.code && CFG.partyVoicePhone) s.pv = { code: Party.code, tv: Party.me.id, name: Party.name() }; return s; };
  const join = Party.join, leave = Party.leave;
  Party.join = async function (...a) { const r = await join.apply(this, a); Remote.soon(); return r; };
  Party.leave = function (...a) { const r = leave.apply(this, a); Remote.soon(); return r; };
}
</script>
"""

R_CSS = r"""/* 2.24.0 party voice on this phone */
.pv-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-top:8px;padding:10px 14px;border-radius:16px;border:1px solid var(--line);background:var(--glass)}
.pv-mic{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line-hi);font-size:13px;font-weight:600}
.pv-mic .i{width:18px;height:18px}
.pv-mic.on{background:var(--plat);color:#08080a;border-color:transparent}
.pv-vol{display:flex;align-items:center;gap:8px;flex:1;min-width:140px;font-size:12px;color:var(--mute)}
.pv-vol input{flex:1;min-width:0;accent-color:var(--champ)}
"""

R_HTML = """  <div id="pvBox" hidden>
    <button class="login lsn" type="button" id="pvBtn"><svg class="i"><use href="#i-mic"/></svg><span class="grow"><b id="pvT">Party voice on this phone</b><small id="pvS">Hear your friends here instead of on the TV</small></span></button>
    <div class="pv-ctl" id="pvCtl" hidden>
      <button class="pv-mic" type="button" id="pvMic" aria-pressed="false"><svg class="i"><use href="#i-mic"/></svg><span id="pvMicT">Mic off</span></button>
      <label class="pv-vol"><span>Voices</span><input type="range" id="pvVol" min="0" max="100" step="5" aria-label="Voice volume"></label>
      <label class="pv-vol" id="pvFilmRow" hidden><span>Film</span><input type="range" id="pvFilm" min="0" max="100" step="5" aria-label="Film volume"></label>
    </div>
  </div>
"""

R_JS = r"""
/* ---------- 2.24.0 Party voice on this phone ----------
   When the TV is in a watch party with "Voices play on: My phone", this phone can join the party as a voice-only
   member. It hears everyone through its own speaker or headphones, with a volume of its own, and can talk with its
   own mic. The TV mutes voices once the phone is in, and never plays this phone's voice (you are in the same room).
   This phone does the same for the TV's mic. The film's sound stays separate: Listen on this phone has its own slider. */
const PV = {
  on: false, link: null, id: '', code: '', tv: '', name: '', net: '', peers: new Map(), mic: null,
  ICE: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }],
  vol() { return clamp(Number(Store.get('pvVol', 1)), 0, 1); },
  film() { return clamp(Number(Store.get('pvFilm', 1)), 0, 1); },
  info() { const s = R.st, v = s && s.pv; return v && /^[A-Z0-9]{6}$/.test(String(v.code || '')) ? v : null; },
  others() { let n = 0; this.peers.forEach((p) => { if (p.id !== this.tv && p.pc.connectionState === 'connected') n++; }); return n; },
  paint() {
    const box = $('#pvBox'); if (!box) return;
    box.hidden = !(this.info() || this.on);
    const live = this.on && [...this.peers.values()].some((p) => p.pc.connectionState === 'connected'), n = this.others();
    $('#pvBtn').classList.toggle('on', this.on);
    $('#pvT').textContent = this.on ? (live ? `Party voice · ${this.code}` : 'Joining the party voice…') : 'Party voice on this phone';
    $('#pvS').textContent = this.on ? (live ? `${n ? `${n} ${n === 1 ? 'friend' : 'friends'} connected` : 'Only you so far'} · Tap to leave` : this.net === 'online' ? 'Finding the others…' : 'Connecting…')
      : 'Hear your friends here instead of on the TV';
    $('#pvCtl').hidden = !this.on;
    const m = $('#pvMic'); m.classList.toggle('on', !!this.mic); m.setAttribute('aria-pressed', String(!!this.mic)); $('#pvMicT').textContent = this.mic ? 'Mic on' : 'Mic off';
    $('#pvVol').value = String(Math.round(this.vol() * 100));
    $('#pvFilmRow').hidden = !(this.on && Listen.on); $('#pvFilm').value = String(Math.round(this.film() * 100));
  },
  toggle() { if (this.on) this.leave(); else this.join(); },
  join() {
    const pv = this.info(); if (!pv || this.on || !R.link) return;
    this.on = true; this.code = pv.code; this.tv = String(pv.tv || ''); this.name = `${String(pv.name || 'Guest').slice(0, 20)} (phone)`; this.id = `~${rid()}`; this.net = '';
    buzz(10);
    // a tap is the user gesture the phone needs before it may play the voices that arrive later
    try { const a = new Audio(); a.muted = true; a.play().catch(() => {}); } catch (e) { /* nothing to unlock */ }
    this.link = new Link(this.code, (m) => this.onMsg(m), (s) => { this.net = s; if (s === 'online') this.hello(); this.paint(); }, R.sb,
      { topic: `realtime:mkc-party-${this.code}`, bc: `mkc:party-${this.code}`, id: this.id });
    this.paint();
  },
  leave(why) {
    if (!this.on) return;
    this.on = false;
    [...this.peers.keys()].forEach((id) => this.drop(id));
    if (this.mic) { this.mic.getTracks().forEach((t) => t.stop()); this.mic = null; }
    if (this.link) this.link.close(); this.link = null; this.code = ''; this.net = '';
    if (why) toast(why, 3200);
    this.paint();
  },
  hello(to) { if (this.link) this.link.send({ t: 'hello', name: this.name, host: false, voice: true, of: this.tv, ...(to ? { reply: true, _to: to } : {}) }); },
  send(to, data) { if (this.link) this.link.send({ t: 'signal', _to: to, data }); },
  onMsg(m) {
    const from = m && m._from; if (!from || !this.on) return;
    if (m.t === 'hello') { this.peer(from, m.name); if (!m.reply) this.hello(from); }
    else if (m.t === 'signal') this.signal(from, m.data || {});
    else if (m.t === 'bye') this.drop(from);
  },
  /* the same "perfect negotiation" the app's party uses; this phone's id sorts last, so it is always the polite side */
  peer(id, name) {
    let p = this.peers.get(id); if (p) { if (name) p.name = name; return p; }
    const pc = new RTCPeerConnection({ iceServers: this.ICE });
    p = { id, name: name || 'Guest', pc, polite: this.id > id, makingOffer: false, ignoreOffer: false, audio: null, dc: null };
    this.peers.set(id, p);
    pc.onnegotiationneeded = async () => { try { p.makingOffer = true; await pc.setLocalDescription(); this.send(id, { description: pc.localDescription && pc.localDescription.toJSON() }); } catch (e) { /* retried on the next change */ } finally { p.makingOffer = false; } };
    pc.onicecandidate = ({ candidate }) => { if (candidate) this.send(id, { candidate: candidate.toJSON() }); };
    pc.ondatachannel = (e) => { p.dc = e.channel; }; // party sync and chat are for screens; a voice phone only keeps the channel open
    pc.ontrack = (e) => this.voice(p, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { try { pc.restartIce(); } catch (x) { /* closed */ } } this.paint(); };
    if (this.mic) this.mic.getTracks().forEach((t) => pc.addTrack(t, this.mic));
    this.paint(); return p;
  },
  async signal(from, { description, candidate }) {
    const p = this.peer(from), pc = p.pc;
    try {
      if (description) {
        const collision = description.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision; if (p.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        if (description.type === 'offer') { await pc.setLocalDescription(); this.send(from, { description: pc.localDescription.toJSON() }); }
      } else if (candidate) { try { await pc.addIceCandidate(candidate); } catch (e) { if (!p.ignoreOffer) throw e; } }
    } catch (e) { console.warn('party voice signaling', e); }
  },
  voice(p, stream) {
    if (!p.audio) { const a = p.audio = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); document.body.appendChild(a); }
    p.audio.srcObject = stream; this.level();
    p.audio.play().catch(() => toast('Tap Party voice again to let this phone play sound', 3600));
  },
  level() { const v = this.vol(); this.peers.forEach((p) => { if (p.audio) { p.audio.volume = v; p.audio.muted = p.id === this.tv; } }); },
  drop(id) {
    const p = this.peers.get(id); if (!p) return;
    try { p.pc.close(); } catch (e) { /* closed */ }
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    this.peers.delete(id); this.paint();
  },
  async toggleMic() {
    if (this.mic) {
      this.mic.getTracks().forEach((t) => t.stop());
      this.peers.forEach((p) => p.pc.getSenders().forEach((s) => { if (s.track && s.track.kind === 'audio') { try { p.pc.removeTrack(s); } catch (e) { /* closed */ } } }));
      this.mic = null; buzz(6); this.paint(); return;
    }
    let mic;
    try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { toast('Microphone permission was not given', 3600); return; }
    if (!this.on) { mic.getTracks().forEach((t) => t.stop()); return; }
    this.mic = mic; this.peers.forEach((p) => mic.getTracks().forEach((t) => p.pc.addTrack(t, mic)));
    buzz(10); this.paint();
  },
};
{
  const on = R.onMsg;
  R.onMsg = (m) => {
    on(m);
    if (m.t !== 'st') return;
    const pv = PV.info();
    if (PV.on && !pv) PV.leave('Party voice moved back to the TV');
    else if (PV.on && pv.code !== PV.code) PV.leave('The TV joined another party. Tap Party voice to join it.');
    PV.paint();
  };
  const lv = R.leave;
  R.leave = () => { PV.leave(); lv(); };
  const la = Listen.audio.bind(Listen);
  Listen.audio = () => { const a = la(); a.volume = PV.film(); return a; };
  const lp = Listen.paint.bind(Listen);
  Listen.paint = () => { lp(); PV.paint(); };
  $('#pvBtn').onclick = () => PV.toggle();
  $('#pvMic').onclick = () => PV.toggleMic();
  $('#pvVol').addEventListener('input', (e) => { Store.set('pvVol', Number(e.target.value) / 100); PV.level(); });
  $('#pvFilm').addEventListener('input', (e) => { Store.set('pvFilm', Number(e.target.value) / 100); if (Listen.el) Listen.el.volume = PV.film(); });
  addEventListener('pagehide', () => { if (PV.on && PV.link) PV.link.close(); });
}
"""


def main(root):
    p = os.path.join(root, 'index.html')
    s = open(p, encoding='utf-8').read()
    assert 'id="mkc-224"' not in s, 'already applied'
    cur = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
    s = rep(s, '<script id="mkc-cfwa">', CSS + JS + '<script id="mkc-cfwa">')
    s = rep(s, "help: 'Synced playback, voice chat that lowers the film while people talk, text chat and reactions.",
            "help: 'Synced playback, voice chat with its own volume (or on your phone), text chat and reactions.")
    bump = newer(VER, cur)
    if bump:
        s = rep(s, f"const APP_VERSION = '{cur}';", f"const APP_VERSION = '{VER}';")
    open(p, 'w', encoding='utf-8').write(s)

    rp = os.path.join(root, 'remote.html')
    r = open(rp, encoding='utf-8').read()
    assert 'id="pvBox"' not in r
    # the realtime link can join any channel under its own member id (the party uses its own topic and ids)
    r = rep(r, "  constructor(code, onMsg, onState, sb) {\n    this.sb = sb || SB_DEFAULT; this.code = code; this.topic = `realtime:mkc-remote-${code}`;",
            "  constructor(code, onMsg, onState, sb, opt) {\n    opt = opt || {}; this.id = opt.id || ME;\n    this.sb = sb || SB_DEFAULT; this.code = code; this.topic = opt.topic || `realtime:mkc-remote-${code}`;")
    r = rep(r, "try { this.bc = new BroadcastChannel(`mkc:remote-${code}`);", "try { this.bc = new BroadcastChannel(opt.bc || `mkc:remote-${code}`);")
    r = rep(r, "    const m = { ...msg, _from: ME, _id: rid(8) }; this.seen.add(m._id);\n    try { this.bc && this.bc.postMessage(m); } catch (e) { /* closed */ }\n    if (this.joined)",
            "    const m = { ...msg, _from: this.id, _id: rid(8) }; this.seen.add(m._id);\n    try { this.bc && this.bc.postMessage(m); } catch (e) { /* closed */ }\n    if (this.joined)")
    r = rep(r, "    if (!m || m._from === ME || this.seen.has(m._id)) return; this.seen.add(m._id);\n    if (this.seen.size > 1500)",
            "    if (!m || m._from === this.id || this.seen.has(m._id)) return; this.seen.add(m._id);\n    if (this.seen.size > 1500)")
    r = rep(r, "    if (m._to && m._to !== ME) return;\n    this.onMsg(m);", "    if (m._to && m._to !== this.id) return;\n    this.onMsg(m);")
    r = rep(r, ".login .grow{flex:1}\n", ".login .grow{flex:1}\n" + R_CSS)
    r = rep(r, '<small id="lsnS">Plug in headphones to watch without waking anyone</small></span></button>\n',
            '<small id="lsnS">Plug in headphones to watch without waking anyone</small></span></button>\n' + R_HTML)
    r = rep(r, "\n/* ---------- Start ---------- */", R_JS + "\n/* ---------- Start ---------- */")
    open(rp, 'w', encoding='utf-8').write(r)

    if bump:
        sp = os.path.join(root, 'sw.js'); w = open(sp, encoding='utf-8').read()
        w2 = re.sub(r"const VERSION = 'mkc-[\d.]+';", f"const VERSION = 'mkc-{VER}';", w); assert w2 != w
        open(sp, 'w', encoding='utf-8').write(w2)
        vp = os.path.join(root, 'version.json'); v = open(vp, encoding='utf-8').read()
        v2 = re.sub(r'"web":\s*"[\d.]+"', f'"web": "{VER}"', v); assert v2 != v
        open(vp, 'w', encoding='utf-8').write(v2)
    print(f'{VER} party voice applied to {root} (version {"set to " + VER if bump else "kept at " + cur})')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
