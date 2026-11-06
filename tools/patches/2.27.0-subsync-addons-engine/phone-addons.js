/* ---------------- 2.27.0 Manage add-ons from your phone ----------------
   The TV's Add-ons screen shows a QR code. It opens the phone remote (same pairing code and channel as 2.7.21) with
   its Add-ons sheet open, where links can be pasted with the phone's own keyboard, and add-ons turned off, moved up
   or removed. Messages: phone 'ad' {op: list|add|tog|up|down|rm, id, url} -> TV 'adl' {list, res}.
   Add-on links can hold private settings (debrid keys in a configured add-on's address), so the TV never sends
   them back: the phone only sees each add-on's name, version, host and an id made from a hash of its address. */
const PhoneAddons = {
  until: 0, sendT: 0,
  id(u) { let h = 5381; for (let i = 0; i < u.length; i++) h = ((h << 5) + h + u.charCodeAt(i)) >>> 0; return h.toString(36); },
  host(a) { if (a.virtual) return 'inside MKCinema'; try { return new URL(a.baseUrl).host; } catch (e) { return ''; } },
  list() {
    return engine.addons.map((a) => {
      const m = a.manifest || {}, res = StremioEngine.resources(m).map((r) => r.name);
      return { id: this.id(a.baseUrl), name: String(m.name || this.host(a) || 'Add-on').slice(0, 60), v: String(m.version || '').slice(0, 16), logo: /^https:\/\//.test(m.logo || '') ? String(m.logo).slice(0, 400) : '',
        host: this.host(a), on: !!a.enabled, fixed: !!a.builtin, err: !!a.error, res: res.filter((x, i) => res.indexOf(x) === i).slice(0, 5) };
    });
  },
  find(id) { return engine.addons.find((a) => this.id(a.baseUrl) === id); },
  send(res) { if (Remote.bus) Remote.bus.send({ t: 'adl', list: this.list(), ...(res ? { res } : {}) }); },
  // changes made on the TV itself show up on the phone while its sheet is open
  soon() { if (Date.now() > this.until) return; clearTimeout(this.sendT); this.sendT = setTimeout(() => this.send(), 250); },
  async onMsg(m) {
    this.until = Date.now() + 10 * 60000;
    const a = m.id ? this.find(String(m.id)) : null, name = a ? a.manifest.name : '';
    switch (m.op) {
      case 'list': this.send(); return;
      case 'add': {
        const url = String(m.url || '').trim().slice(0, 4000);
        if (!/^(stremio|https?):\/\/\S+$/i.test(url)) { this.send({ ok: false, msg: 'That doesn’t look like an add-on link' }); return; }
        const done = await installAddon(url);
        this.send(done ? { ok: true, msg: `Added ${done.manifest.name}` } : { ok: false, msg: 'Your TV couldn’t install it. Check the link. Some add-ons don’t allow browsers.' });
        break;
      }
      case 'tog': if (a) { engine.toggle(a.baseUrl); toast(`${a.enabled ? 'Turned on' : 'Turned off'} from your phone: ${name}`, 'info', 2600, 'phad'); } this.send(); break;
      case 'up': case 'down': if (a) engine.move(a.baseUrl, m.op === 'up' ? -1 : 1); this.send(); break;
      case 'rm':
        if (a && !a.builtin) { if (a.studio) Store.set('studioMounted', false); engine.remove(a.baseUrl); toast(`Removed from your phone: ${name}`, 'info', 3000, 'phad'); }
        this.send(a && !a.builtin ? { ok: true, msg: `Removed ${name}` } : { ok: false, msg: 'That add-on can’t be removed' });
        break;
      default: return;
    }
    if (!$('#addons').hidden) renderAddons();
  },
  link() { const l = Remote.link(Remote.storedCode()); return l ? `${l}~addons` : ''; },
  /* the card on the TV's Add-ons screen */
  card() {
    if (!IS_TV) return;
    const box = $('#addons .modal'), link = this.link(); if (!box || !link) return;
    if (!Remote.bus) Remote.host();
    let el = $('#phAdCard');
    if (el && el.dataset.link === link) return;
    if (!el) { el = document.createElement('div'); el.id = 'phAdCard'; el.className = 'ph-ad'; const sub = $('#addons .modal > .sub'); (sub || $('#addonsTitle')).after(el); }
    el.dataset.link = link;
    el.innerHTML = `<div class="qr-wrap">${QR.svg(link, { margin: 2 })}</div><div class="ph-ad-t"><small>Easier than the TV keyboard</small><b>Manage add-ons from your phone</b><span>Scan with your phone camera to paste add-on links, turn add-ons on or off, and remove them.</span><span class="ph-ad-code">Or open <b>${esc(Remote.link().replace(/^https?:\/\//, ''))}</b> and type <b class="mono">${esc(Remote.storedCode())}</b></span></div>`;
  },
};
{
  const om = Remote.onMsg.bind(Remote);
  Remote.onMsg = function (m) {
    om(m); // pairs the phone like any remote message
    if (m && m.t === 'ad' && m._from) PhoneAddons.onMsg(m).catch((e) => MKLog.add('error', `Phone add-ons: ${e.message}`));
  };
  engine.on((ev) => { if (ev === 'addons') PhoneAddons.soon(); });
  const ra = renderAddons;
  renderAddons = function () { const r = ra.apply(this, arguments); try { PhoneAddons.card(); } catch (e) { /* no QR here */ } return r; };
}
