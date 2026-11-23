
/* 2.91.5: a stream filter pick (or addons answering) redraws the source list; keep remote focus and scroll where they were */
(() => {
  'use strict';
  const KEYS = ['filter', 'sort', 'si', 'mkpin', 'trouble'];
  const keyOf = (el) => { for (const k of KEYS) if (el.dataset && el.dataset[k] !== undefined) return [k, el.dataset[k]]; return el.id ? ['#', el.id] : null; };
  const ok = (el, list) => el && list.some((b) => b && b.contains(el)) && !el.closest('[hidden]') && el.getClientRects().length ? el : null;
  const find = (list, key) => {
    if (!key) return null;
    if (key[0] === '#') return ok(document.getElementById(key[1]), list);
    for (const b of list) { const el = b && ok(b.querySelector(`[data-${key[0]}="${CSS.escape(key[1])}"]`), list); if (el) return el; }
    return null;
  };
  const chipOn = (list) => { for (const b of list) { const el = b && ok(b.querySelector('[data-filter].on'), list); if (el) return el; } return null; };
  const scroller = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { if (a.scrollHeight > a.clientHeight + 1) { const o = getComputedStyle(a).overflowY; if (o === 'auto' || o === 'scroll') return a; } } return null; };
  const keep = (name, boxes) => {
    const fn = window[name]; if (typeof fn !== 'function' || fn._mkStay) return;
    const w = function () {
      const a = document.activeElement, list = boxes(), box = a && a !== document.body ? list.find((b) => b && b.contains(a)) : null;
      if (!box) return fn.apply(this, arguments);
      const key = keyOf(a), sc = scroller(a), top = sc ? sc.scrollTop : 0, y = scrollY, navf = a.classList.contains('nav-focus');
      const r = fn.apply(this, arguments);
      const put = () => {
        const now = document.activeElement;
        if (now && now !== document.body) return; /* focus already somewhere (kept, or the pick opened something) */
        const pl = document.getElementById('player'); if (pl && !pl.hidden && !pl.contains(box)) return; /* a source started playing */
        const el = find(list, key) || (key && key[0] === 'si' ? chipOn(list) : null); if (!el) return;
        if (navf) { for (const x of [...document.getElementsByClassName('nav-focus')]) x.classList.remove('nav-focus'); el.classList.add('nav-focus'); }
        try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
        try { if (typeof Nav === 'object' && Nav.mem) Nav.mem.set(Nav.root(), el); } catch (e) { /* no remote */ }
        if (sc && sc.isConnected) sc.scrollTop = top; else if (Math.abs(scrollY - y) > 2) scrollTo(scrollX, y);
      };
      try { put(); requestAnimationFrame(put); } catch (e) { /* the list still shows */ }
      return r;
    };
    w._mkStay = true; window[name] = w;
    try { if (name === 'renderStreamsPanel') renderStreamsPanel = w; else renderSourceDrawer = w; } catch (e) { /* window copy is enough */ }
  };
  const box = (id) => () => [document.getElementById(id)];
  keep('renderStreamsPanel', box('dStreams'));
  keep('renderSourceDrawer', () => [document.getElementById('srcFilters'), document.getElementById('srcList')]);
})();
