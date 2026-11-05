/* =====================================================================
   MKCinema 2.8 · the big screen release
   Send to TV, Channels (your own playlists), Split Screen, player tools, Source Check, Discover rows, Shortlist,
   Where to watch, Seats, Atelier, the addon directory, Line check, problem reports and custom CSS.
   Everything here is MKCinema's own code and design. It wraps the existing modules the same way Peak Cinema does,
   so nothing above this script changes behaviour unless one of these features is used.
   ===================================================================== */

/* ---------------- Shared helpers: pop-up layers, errors ring, small utils ---------------- */
const X8 = {
  layers: [],
  /* A pop-up in the house finish (solid graphite, hairline, round close), registered with Back, the TV remote and syncLayers */
  layer(id, { label, icon = 'sparkles', eyebrow = '', wide = false, full = false } = {}) {
    if ($(`#${id}`)) return $(`#${id}`);
    const el = document.createElement('div');
    el.id = id; el.className = full ? 'layer-ov x8-full' : 'layer-ov center top-layer'; el.hidden = true;
    el.innerHTML = full ? '<div class="x8-fullbox" role="dialog" aria-label="' + esc(label) + '"></div>'
      : `<div class="modal glass-solid pp-modal x8-modal${wide ? ' wide' : ''}" role="dialog" aria-label="${esc(label)}">
      <button class="ibtn panel-close" data-x8close type="button" aria-label="Close"><i data-lucide="x"></i></button>
      ${eyebrow ? `<span class="eyebrow"><i data-lucide="${icon}"></i>${esc(eyebrow)}</span>` : ''}<div class="x8-body"></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target.closest('[data-x8close]')) X8.close(id); else if (e.target === el && !full) X8.close(id); });
    MENU_LAYERS.push(id); this.layers.push(id);
    return el;
  },
  body(id) { const el = $(`#${id}`); return el && (el.querySelector('.x8-body') || el.querySelector('.x8-fullbox')); },
  open(id) {
    openLayer(id); this.order = [id, ...(this.order || []).filter((x) => x !== id)];
    // the Android TV app hands Back to the page only while an element with a known id (#remote) shows
    if (IS_TV) { const b = this.body(id); if (b && !$('#remote')) { b.id = 'remote'; b.dataset.x8remote = '1'; } Nav.settle(); }
  },
  close(id) { const el = $(`#${id}`); if (!el || el.hidden) return; closeLayer(id); const b = this.body(id); if (b && b.dataset.x8remote) { b.removeAttribute('id'); delete b.dataset.x8remote; } this.order = (this.order || []).filter((x) => x !== id); const fn = this.onClose[id]; if (fn) fn(); if (IS_TV) Nav.settle(); },
  onClose: {},
  top() { return (this.order || []).find((id) => { const el = $(`#${id}`); return el && !el.hidden; }) || null; },
  errors: [],
  dayKey: () => new Date().toISOString().slice(0, 10),
  seeded(arr, seed) { const a = arr.slice(); let h = hash(seed); for (let i = a.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  b64e: (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  b64d: (s) => JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))))),
  mixedBlocked: (url) => location.protocol === 'https:' && /^http:\/\//i.test(String(url || '')),
  runtimeMin: (m) => { const r = String((m && m.runtime) || ''); const h = r.match(/(\d+)\s*h/i), mi = r.match(/(\d+)\s*min/i); const n = (h ? +h[1] * 60 : 0) + (mi ? +mi[1] : 0); return n || (/^\d+$/.test(r) ? +r : 0); },
};
addEventListener('error', (e) => { X8.errors.push(`${new Date().toISOString().slice(11, 19)} ${String(e.message || e.error || 'error').slice(0, 200)}`); if (X8.errors.length > 12) X8.errors.shift(); });
addEventListener('unhandledrejection', (e) => { const r = e.reason; X8.errors.push(`${new Date().toISOString().slice(11, 19)} promise: ${String((r && r.message) || r).slice(0, 200)}`); if (X8.errors.length > 12) X8.errors.shift(); });

/* Back, the TV remote's focus root and the open-layer list all learn about the 2.8 layers (the newest one answers first) */
X8.backHook = {};
{
  const prevBack = back;
  back = function () {
    const id = X8.top();
    if (id) { if (X8.backHook[id] && X8.backHook[id]()) return; X8.close(id); return; }
    return prevBack.apply(this, arguments);
  };
  const root = Nav.root.bind(Nav);
  Nav.root = function () {
    const id = X8.top();
    if (id && $('#castLayer').hidden && $('#partyLayer').hidden) { const el = $(`#${id}`), sub = el.querySelector('.x8-sub:not([hidden])'); return sub || el; }
    return root();
  };
}
// webOS and some remotes send GoBack: a 2.8 layer answers it before the app would close
document.addEventListener('keydown', (e) => {
  if ((e.keyCode === 461 || e.key === 'GoBack' || e.key === 'BrowserBack') && X8.top()) { e.preventDefault(); e.stopImmediatePropagation(); back(); }
}, true);
