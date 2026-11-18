
/* 2.73.4: tell a newcomer where streams are added */
const StreamsNudge = {
  own() { try { return engine.addons.some((a) => !a.error && !a.builtin && !String(a.baseUrl || '').startsWith('mkc-virtual:') && (a.manifest.resources || []).some((r) => (r.name || r) === 'stream')); } catch (e) { return true; } },
  need() { try { return engine.addons.length > 0 && !this.own() && !Store.get('snOff', false) && !(typeof Seats !== 'undefined' && Seats.kids && Seats.kids()); } catch (e) { return false; } },
  html() {
    return `<div class="notice glass sn-strip" id="snStrip" role="region" aria-label="Streams"><i data-lucide="puzzle"></i><div class="sn-body"><strong>Add your streams</strong><p>MKCinema has no films of its own. Add a stream addon and every title can play. It takes about a minute.</p><div class="sn-act"><button class="btn btn-prime btn-sm" type="button" id="snAdd" data-nav><i data-lucide="plus"></i>Add streams</button><button class="btn btn-ghost btn-sm" type="button" id="snGuide" data-nav><i data-lucide="compass"></i>Get started guide</button><button class="btn btn-ghost btn-sm" type="button" id="snOff" data-nav>Not now</button></div></div></div>`;
  },
  sync() {
    const host = $('#homeRows'), el = $('#snStrip');
    if (!host) return;
    if (!this.need()) { if (el) el.remove(); return; }
    if (el) return;
    host.insertAdjacentHTML('beforebegin', this.html());
    $('#snAdd').onclick = () => $('#openAddons').click();
    $('#snGuide').onclick = () => openSettings('start');
    $('#snOff').onclick = () => { Store.set('snOff', true); const b = $('#snStrip'); if (b) { const f = b.nextElementSibling && b.nextElementSibling.querySelector('[data-nav]'); b.remove(); if (f && f.focus && IS_TV) f.focus(); } };
    if (typeof icons === 'function') icons();
  },
};
{
  const rh = renderHome;
  renderHome = function () { const p = rh.apply(this, arguments); Promise.resolve(p).then(() => StreamsNudge.sync()); return p; };
  const cl = closeLayer;
  closeLayer = function (id) { const r = cl.apply(this, arguments); if (id === 'addons') setTimeout(() => StreamsNudge.sync(), 400); return r; };
  setTimeout(() => StreamsNudge.sync(), 2500);
}
