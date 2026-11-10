
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
