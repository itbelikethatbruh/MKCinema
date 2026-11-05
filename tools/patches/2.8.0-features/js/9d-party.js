/* ---------------- 2.9.3 Watch Party, redesigned ----------------
   Before a party: a title, then two side-by-side cards (Host / Join with six code cells), then your name and a
   switch for sharing your stream link. In a party: the code as letter tiles with invite and QR, members as
   avatar chips, reactions, and the chat. Same element ids as before, so Party.render() wires it all up. */
{
  const initials = (n) => String(n || '?').replace(/\(you\)/, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  Party.html = function () {
    if (!this.code) return `<div class="pz">
      <h3 class="pz-title">Watch together</h3>
      <p class="pz-lede">In perfect sync, with voice and chat, on any screen.</p>
      <div class="pz-cards">
        <section class="pz-card pz-host">
          <span class="pz-ic" aria-hidden="true"><i data-lucide="sparkles"></i></span>
          <h4>Host a party</h4>
          <p>Get a code and invite anyone. You lead play, pause and seek.</p>
          <button class="btn btn-prime pz-go" type="button" id="pyNew" data-nav><i data-lucide="plus"></i>Start a party</button>
        </section>
        <section class="pz-card pz-join">
          <span class="pz-ic" aria-hidden="true"><i data-lucide="ticket"></i></span>
          <h4>Join a party</h4>
          <label class="pz-cells" for="pyCode"><input class="pz-codein mono" id="pyCode" maxlength="6" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Party code, 6 characters" data-nav>${'<i></i>'.repeat(6)}</label>
          <button class="btn btn-ghost pz-go" type="button" id="pyJoin" data-nav disabled><i data-lucide="log-in"></i>Join</button>
        </section>
      </div>
      <div class="pz-foot">
        <label class="pz-name"><span>Your name</span><input class="inp" id="pyName" maxlength="24" value="${esc(this.name())}" autocomplete="nickname" data-nav></label>
        <label class="pz-switch"><input type="checkbox" role="switch" id="pyLink" ${CFG.partyHostLink ? 'checked' : ''} data-nav><span class="pz-track" aria-hidden="true"></span><span class="pz-sw-t"><b>Share my stream link</b><small>Guests play the same file you do. Off: everyone uses their own addons.</small></span></label>
      </div>
    </div>`;
    const link = appLink(`party=${this.code}`);
    return `<div class="pz pz-room">
      <div class="pz-codebar">
        <div class="pz-tiles" aria-label="Party code ${esc(this.code.split('').join(' '))}">${this.code.split('').map((c) => `<b class="mono">${esc(c)}</b>`).join('')}</div>
        <div class="pz-acts"><button class="btn btn-ghost btn-sm" type="button" id="pyCopy" data-nav><i data-lucide="copy"></i>Copy invite</button><button class="btn btn-ghost btn-sm" type="button" id="pyQr" data-nav><i data-lucide="qr-code"></i>QR</button></div>
      </div>
      <div class="qr-wrap sm" id="pyQrBox" hidden>${link ? QR.svg(link) : ''}</div>
      <div class="py-members" id="pyMembers"></div>
      <div class="pz-ctl"><button class="btn ${this.mic ? 'btn-prime' : 'btn-ghost'} btn-sm" type="button" id="pyMic" data-nav aria-pressed="${!!this.mic}"><i data-lucide="${this.mic ? 'mic' : 'mic-off'}"></i>${this.mic ? 'Mic on' : 'Mic off'}</button>
        <div class="py-reacts" role="group" aria-label="Reactions">${['😂', '😮', '😍', '👏', '🔥', '😢', '😱', '🍿'].map((e) => `<button type="button" data-react="${e}" data-nav aria-label="React ${e}">${e}</button>`).join('')}</div>
        <button class="btn btn-ghost btn-sm danger" type="button" id="pyLeave" data-nav><i data-lucide="log-out"></i>Leave</button></div>
      <div class="py-chat" id="pyChat" role="log" aria-live="polite"></div>
      <form class="py-say" id="pySay"><input class="inp" id="pyText" maxlength="400" placeholder="Say something…" autocomplete="off" data-nav><button class="ibtn" type="submit" aria-label="Send" data-nav><i data-lucide="send"></i></button></form>
    </div>`;
  };
  Party.renderMembers = function () {
    const rows = [{ id: this.me.id, name: this.name(), you: true, state: 'self' }, ...[...this.peers.values()].map((p) => ({ id: p.id, name: p.name, state: p.dc && p.dc.readyState === 'open' ? 'direct' : p.pc.connectionState === 'connecting' || p.pc.connectionState === 'new' ? 'connecting' : 'relay', rtt: p.rtt }))];
    $$('#pyMembers').forEach((box) => {
      box.innerHTML = rows.map((r) => {
        const note = r.state === 'self' ? (this.lastDrift != null && !this.isHost() ? `${Math.round(Math.abs(this.lastDrift) * 1000)} ms off` : 'You') : r.state === 'direct' ? `Direct${r.rtt ? ` · ${r.rtt} ms` : ''}` : r.state === 'relay' ? 'Via relay' : 'Connecting…';
        return `<div class="pm-row ${this.speaking.has(r.id) ? 'talk' : ''}" data-pid="${esc(r.id)}"><span class="pm-av ${r.state}" aria-hidden="true">${esc(initials(r.name))}</span><span class="pm-txt"><b>${esc(r.name)}</b><small>${esc(note)}</small></span>${r.id === this.hostId ? '<span class="pm-host">Host</span>' : ''}</div>`;
      }).join('');
    });
  };
  const pr = Party.render;
  Party.render = function (...a) {
    const r = pr.apply(this, a);
    $$('#pyCode').forEach((inp) => {
      const join = inp.closest('.pz-join'), btn = join && $('#pyJoin', join);
      const sync = () => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); if (v !== inp.value) inp.value = v; if (btn) btn.disabled = v.length !== 6; $$('.pz-cells i', join).forEach((c, i) => { c.textContent = v[i] || ''; c.classList.toggle('on', i === v.length && document.activeElement === inp); }); };
      ['input', 'focus', 'blur'].forEach((ev) => inp.addEventListener(ev, sync)); sync();
    });
    return r;
  };
}
