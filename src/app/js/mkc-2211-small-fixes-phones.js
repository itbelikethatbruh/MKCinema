
/* ---------------- 2.21.1 Small fixes ----------------
   1. Phones: picking Side menu inside Settings changed nothing you could see (Settings covers the screen and the
      side menu on a phone is only a menu button). Now Settings closes, the menu slides in once, and a toast says
      where it lives. The "Top menu" card says "Bottom bar" on phones, which is where that bar is.
   2. Who's watching: every seat has a pencil to change its name and picture, without going into Manage seats.
      The main seat no longer defaults to the email's first half: it uses the account name, or a tidied email name. */
(() => {
  const PHONE = () => !IS_TV && innerWidth <= 760;
  if (typeof SideNav !== 'undefined') {
    const opt = SideNav.optHTML.bind(SideNav);
    SideNav.optHTML = function (cur) {
      const h = opt(cur);
      return PHONE() ? h.replace('<b>Top menu</b><small>The menu runs across the top. The current layout.</small>', '<b>Bottom bar</b><small>Sections in a bar along the bottom of the screen.</small>') : h;
    };
    const bind = SideNav.bindOpts.bind(SideNav);
    SideNav.bindOpts = function (root, closeAfter) {
      bind(root, closeAfter);
      if (closeAfter || IS_TV) return;
      $$('[data-navmode]', root).forEach((x) => x.addEventListener('click', () => {
        const side = x.dataset.navmode === 'side';
        if (!PHONE()) { toast(side ? 'Side menu on' : 'Top menu on', 'ok', 2400, 'navmode'); return; }
        try { closeLayer('settings'); } catch (e) { /* not open */ }
        toast(side ? 'Side menu on. Tap ☰ at the top left to open it' : 'Bottom bar on', 'ok', 4200, 'navmode');
        if (side) setTimeout(() => { if (SideNav.side()) SideNav.open(); }, 420);
      }));
    };
  }
  if (typeof Seats !== 'undefined') {
    Seats.niceName = function () {
      const u = typeof Account !== 'undefined' && Account.user; if (!u) return 'Main';
      const m = u.user_metadata || {}, n = String(m.full_name || m.name || m.user_name || '').trim();
      if (n && !n.includes('@')) return n.split(/\s+/)[0].slice(0, 20);
      const l = String(u.email || '').split('@')[0].replace(/\d+$/, '').replace(/[._+-]+/g, ' ').trim().split(' ')[0];
      return l ? (l[0].toUpperCase() + l.slice(1)).slice(0, 20) : 'Main';
    };
    const owner = Seats.owner.bind(Seats);
    Seats.owner = function () { const o = owner(); if (!Store.raw.get('ownerSeatName', '')) o.name = this.niceName(); return o; };
    const pick = Seats.pick.bind(Seats);
    Seats.pick = function (o) {
      const r = pick(o), b = $('#seatPick');
      if (!b || b.hidden) return r;
      const mg = $('#seatManage');
      if (mg && !this.managing) mg.innerHTML = '<i data-lucide="pencil"></i>Edit seats';
      if (!this.managing && !IS_TV) {
        $$('[data-seat]', b).forEach((x) => {
          const f = x.querySelector('.seat-face'); if (!f || f.querySelector('.seat-ed')) return;
          const s = this.all().find((y) => y.id === x.dataset.seat);
          f.insertAdjacentHTML('beforeend', `<span class="seat-ed" role="button" tabindex="-1" aria-label="Edit ${esc(s ? s.name : 'seat')}" title="Change name and picture"><i data-lucide="pencil"></i></span>`);
          f.lastElementChild.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this.editFromPicker(x.dataset.seat); });
        });
      }
      icons();
      return r;
    };
  }
})();
