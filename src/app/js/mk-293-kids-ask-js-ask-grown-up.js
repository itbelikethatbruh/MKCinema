
'use strict';
/* 2.93 Ask a grown-up. On a kids seat, Search hides titles over the seat's age (or with no known rating). Instead of a
   dead end, Search now says how many more titles need a grown-up, with one row to ask. After the grown-up PIN (the same
   one that guards Settings and leaving the seat), the grown-up sees those titles and allows any of them for this seat.
   Allowed titles pass the kids rule everywhere on this seat (Search, title page, play). Settings › Seats lists them and
   takes any back. Stored on this device only (mkc:kidsAllow, per seat). Nothing is sent anywhere. */
(function () {
  if (typeof Seats === 'undefined' || typeof palCompose !== 'function' || typeof X8 === 'undefined') return;
  const K = 'kidsAllow';
  const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
  const KidsAsk = window.KidsAsk = {
    hidden: [],
    all() { const v = Store.raw.get(K, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; },
    of(seat) { const a = this.all()[seat]; return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; },
    has(m) { return !!(m && m.id && safe(() => Seats.kids(), false) && this.of(SEAT)[m.id]); },
    set(seat, m, on) {
      const all = this.all(), mine = { ...this.of(seat) };
      if (on) mine[m.id] = { n: String(m.name || '').slice(0, 120), t: m.type || '', at: Date.now() };
      else delete mine[m.id];
      all[seat] = mine; Store.raw.set(K, all);
    },
    age(m) {
      const v = safe(() => (typeof KidsAge !== 'undefined' ? KidsAge.of(m.id) : null), null);
      return v == null ? 'No age rating known' : v <= 0 ? 'Rated for all ages' : `Rated ${v}+`;
    },
    ask() {
      const list = this.hidden.slice(); if (!list.length) return;
      Seats.guard(() => this.panel(list));
    },
    focus(el) { if (!el) return; if (IS_TV && typeof Nav !== 'undefined') Nav.focus(el, true); else if (!TOUCH_UI) el.focus({ preventScroll: true }); },
    panel(list) {
      const seat = Seats.cur();
      X8.layer('kidsAsk', { label: 'Ask a grown-up', icon: 'lock-open', eyebrow: 'Kids seat', wide: true });
      const body = X8.body('kidsAsk');
      const paint = () => {
        const mine = this.of(SEAT);
        body.innerHTML = `<h2 class="x8-h">Allow for ${esc(seat.name || 'this seat')}</h2>
          <p class="ka-intro">These titles are hidden on this seat because their age rating is over the seat’s limit or not known. Allowed titles show in Search and can play on this seat only.</p>
          ${Seats.owner().pin ? '' : '<p class="tour-note seat-warn ka-warn">There is no grown-up PIN yet, so anyone can allow titles here. Edit your main seat and set one.</p>'}
          <div class="ka-grid">${list.map((m, i) => { const on = !!mine[m.id]; return `<button type="button" class="ka-t${on ? ' on' : ''}" data-nav data-ka="${i}" aria-pressed="${on}"><span class="ka-art">${safe(() => imgTag(metaPoster(m), m.name, m.id), '')}<span class="ka-st"><i data-lucide="${on ? 'check' : 'plus'}"></i>${on ? 'Allowed' : 'Allow'}</span></span><b>${esc(m.name || '')}</b><small>${esc([safe(() => yearOf(m), ''), this.age(m)].filter(Boolean).join(' · '))}</small></button>`; }).join('')}</div>
          <div class="ka-foot"><button type="button" class="btn btn-prime" data-nav id="kaDone"><i data-lucide="check"></i>Done</button></div>`;
        icons();
        $$('[data-ka]', body).forEach((b) => b.addEventListener('click', () => {
          const m = list[Number(b.dataset.ka)]; if (!m) return;
          this.set(SEAT, m, !this.of(SEAT)[m.id]); const k = b.dataset.ka; paint();
          this.focus($(`[data-ka="${k}"]`, body));
        }));
        $('#kaDone', body).onclick = () => X8.close('kidsAsk');
      };
      paint(); X8.open('kidsAsk');
      setTimeout(() => this.focus($('[data-ka]', body)), 60);
    },
  };

  /* an allowed title passes the kids rule on that seat */
  const ks = Seats.kidSafe.bind(Seats);
  Seats.kidSafe = function (m) { return KidsAsk.has(m) || ks(m); };

  /* Search: say how many more titles a grown-up could allow, instead of a dead end */
  const pc = palCompose;
  palCompose = function (q, titles, pending) {
    const kids = safe(() => Seats.kids(), false), t = String(q || '').trim();
    const hid = kids && t.length >= 2 ? (titles || []).filter((m) => m && m.id && /^tt\d+$/.test(m.id) && !safe(() => Seats.kidSafe(m), true)) : [];
    const r = pc.apply(this, arguments);
    if (!hid.length || typeof PAL === 'undefined' || !Array.isArray(PAL.items)) return r;
    KidsAsk.hidden = hid.slice(0, 24);
    const none = PAL.items.find((it) => it.kind === 'status' && /^No titles found/.test(it.label || ''));
    if (none) { none.label = 'Nothing for this seat yet'; none.sub = ''; none.icon = 'baby'; }
    const n = hid.length;
    PAL.items.push({ kind: 'row', group: 'Kids seat', label: n === 1 ? '1 more title needs a grown-up' : `${n} more titles need a grown-up`, sub: 'Ask a grown-up to allow it for this seat', icon: 'lock', run: () => KidsAsk.ask(), i: PAL.items.length });
    palRender();
    return r;
  };

  /* Settings › Seats: what a grown-up allowed, and taking it back */
  const sec = typeof secById === 'function' && secById('seats');
  if (sec) {
    const rows = sec.rows, bind = sec.bind;
    sec.rows = () => {
      const out = rows();
      const seats = Seats.all().filter((s) => s.kids && Object.keys(KidsAsk.of(s.id)).length);
      if (seats.length) out.push({ html: () => `<div class="ka-set">${seats.map((s) => `<h4>Allowed by a grown-up for ${esc(s.name)}</h4><div class="ka-chips">${Object.entries(KidsAsk.of(s.id)).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).map(([id, x]) => `<button type="button" class="chip" data-nav data-kax="${esc(s.id)}|${esc(id)}" aria-label="Take back ${esc(x.n || id)}">${esc(x.n || id)}<i data-lucide="x"></i></button>`).join('')}</div>`).join('')}<p class="tour-note">These titles show on that kids seat even though their age rating is over its limit or not known. Tap one to take it back.</p></div>` });
      return out;
    };
    sec.bind = function () {
      const r = bind ? bind.apply(this, arguments) : undefined;
      $$('#setBody [data-kax]').forEach((b) => b.addEventListener('click', () => {
        const [sid, id] = b.dataset.kax.split('|'); KidsAsk.set(sid, { id }, false);
        try { renderSettingsBody(); } catch (e) { b.remove(); }
      }));
      return r;
    };
  }
})();
