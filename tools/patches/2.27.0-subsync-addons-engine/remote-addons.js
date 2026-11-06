/* ---------- 2.27.0 Add-ons on your TV ----------
   Paste an add-on link with the phone's keyboard, turn add-ons on or off, move them up, remove them.
   Phone 'ad' {op, id, url} -> TV 'adl' {list, res}. The TV never sends add-on addresses back (they can hold keys). */
const Ads = {
  want: false, list: null, waitT: 0, addT: 0, sure: '',
  h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  open() { closeSheet(true); openSheet('ads'); this.note(); this.paint(); this.ask(); },
  note(t) { $('#adNote').textContent = t || 'Links start with stremio:// or end in manifest.json. Changes show on the TV straight away.'; },
  ask() {
    R.send({ t: 'ad', op: 'list' });
    clearTimeout(this.waitT);
    this.waitT = setTimeout(() => { if (!this.list && sheet === 'ads') this.note('Your TV hasn’t answered. Keep MKCinema open on the TV, and update it if this keeps happening.'); }, 7000);
  },
  op(op, id, extra) { R.send({ t: 'ad', op, id, ...(extra || {}) }); buzz(8); },
  add() {
    const url = $('#adIn').value.trim();
    if (!/^(stremio|https?):\/\/\S+$/i.test(url)) { toast('Paste a link that starts with stremio:// or https://', 3200); return; }
    $('#adAdd').disabled = true; this.note('Installing on your TV…');
    this.op('add', '', { url });
    clearTimeout(this.addT); this.addT = setTimeout(() => { this.note('Your TV didn’t confirm it. Check the Add-ons screen on the TV.'); this.sync(); }, 20000);
  },
  sync() { $('#adAdd').disabled = !/^(stremio|https?):\/\/\S+$/i.test($('#adIn').value.trim()); },
  onMsg(m) {
    if (!m || m.t !== 'adl') return false;
    clearTimeout(this.waitT);
    this.list = Array.isArray(m.list) ? m.list : [];
    if (m.res) {
      clearTimeout(this.addT); toast(String(m.res.msg || ''), 3800);
      if (m.res.ok) $('#adIn').value = '';
      this.note(); this.sync();
    }
    this.paint(); return true;
  },
  paint() {
    const box = $('#adList'); if (!box) return;
    if (!this.list) { box.innerHTML = '<div class="ad-empty">Asking your TV…</div>'; return; }
    if (!this.list.length) { box.innerHTML = '<div class="ad-empty">No add-ons on this TV yet.</div>'; return; }
    box.innerHTML = this.list.map((a, i) => {
      const logo = a.logo ? `<span class="ad-logo" style="background-image:url('${this.h(a.logo).replace(/'/g, '%27')}')"></span>` : `<span class="ad-logo">${this.h(String(a.name || '?').slice(0, 2).toUpperCase())}</span>`;
      const sub = [a.v ? `v${a.v}` : '', a.err ? 'can’t be reached' : (a.res || []).join(', '), a.host].filter(Boolean).join(' · ');
      return `<div class="ad-row${a.on ? '' : ' off'}" data-id="${this.h(a.id)}">${logo}<span class="ad-txt"><b>${this.h(a.name)}</b><small>${this.h(sub)}</small></span>
        <button class="ad-ib" type="button" data-op="up"${i === 0 ? ' disabled' : ''} aria-label="Move ${this.h(a.name)} up"><svg class="i"><use href="#i-up"/></svg></button>
        ${a.fixed ? '' : `<button class="ad-ib rm${this.sure === a.id ? ' sure' : ''}" type="button" data-op="rm" aria-label="Remove ${this.h(a.name)}">${this.sure === a.id ? 'Remove' : '<svg class="i"><use href="#i-trash"/></svg>'}</button>`}
        <button class="ad-sw" type="button" role="switch" data-op="tog" aria-checked="${!!a.on}" aria-label="${this.h(a.name)}"><i></i></button></div>`;
    }).join('');
  },
  st(m) {
    const b = $('#adBtn'); if (b) b.hidden = !(m.v === 'browse' && m.where === 'Addons');
    if (this.want) { this.want = false; this.open(); }
  },
};
$('#adIn').addEventListener('input', () => Ads.sync());
$('#adIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!$('#adAdd').disabled) Ads.add(); } });
$('#adAdd').onclick = () => Ads.add();
$('#adPaste').onclick = async () => {
  try { const t = await navigator.clipboard.readText(); if (t) { $('#adIn').value = t.trim(); Ads.sync(); return; } } catch (e) { /* not allowed */ }
  $('#adIn').focus(); toast('Long-press the box and tap Paste', 2600);
};
$('#adList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-op]'), row = b && b.closest('.ad-row'); if (!row) return;
  const id = row.dataset.id, op = b.dataset.op;
  if (op === 'rm' && Ads.sure !== id) { Ads.sure = id; Ads.paint(); setTimeout(() => { if (Ads.sure === id) { Ads.sure = ''; Ads.paint(); } }, 4000); return; }
  if (op === 'tog') { b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true'); row.classList.toggle('off'); }
  Ads.sure = ''; Ads.op(op, id);
});
$('#mAddons').onclick = () => Ads.open();
$('#adBtn').onclick = () => Ads.open();
{
  const on = R.onMsg;
  R.onMsg = (m) => { if (Ads.onMsg(m)) return; on(m); if (m.t === 'st') Ads.st(m); };
  const lv = R.leave;
  R.leave = function () { Ads.list = null; Ads.want = false; if (sheet === 'ads') closeSheet(true); return lv.apply(this, arguments); };
}
