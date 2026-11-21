
/* 2.86 Are you still watching? Any key, tap, click or remote press counts as someone being there. */
const StillAsk = {
  last: Date.now(), IDLE: 90 * 60e3,
  init() { ['keydown', 'pointerdown', 'touchstart', 'wheel'].forEach((t) => addEventListener(t, () => { this.last = Date.now(); }, { capture: true, passive: true })); },
  hold(go) {
    if (CFG.stillAsk === false || Date.now() - this.last < this.IDLE) return false;
    try { video.pause(); } catch (e) { /* no video */ }
    const box = $('#upNext'); if (!box) return false;
    box.hidden = false; box.classList.remove('countdown'); box.classList.add('still-ask');
    box.innerHTML = `<div style="min-width:0"><small>Paused</small><b>Are you still watching?</b>
      <div class="actions"><button class="btn btn-prime btn-sm" type="button" id="saYes" data-nav><i data-lucide="play"></i>Keep watching</button><button class="btn btn-ghost btn-sm" type="button" id="saNo" data-nav>Stop</button></div></div>`;
    icons();
    const done = () => { box.hidden = true; box.classList.remove('still-ask'); };
    $('#saYes').onclick = () => { this.last = Date.now(); done(); go(); };
    $('#saNo').onclick = () => { done(); if (typeof closePlayer === 'function') closePlayer(); };
    setTimeout(() => { const b = $('#saYes'); if (b) { if (IS_TV && typeof Nav !== 'undefined') Nav.focus(b, true); else b.focus({ preventScroll: true }); } }, 60);
    return true;
  },
};
StillAsk.init();

/* 2.86 Holiday row: films for the season on Home, from MKCinema's own lists (no key needed). Around Christmas,
   Halloween, Thanksgiving (US and Canada), Valentine's Day and New Year. Settings › Home switches it off. */
const Holiday = {
  tok: 0, memo: null,
  kids() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  // the 4th Thursday of November (US Thanksgiving), as a day of the month
  thx(y) { const d = new Date(y, 10, 1).getDay(); return 1 + ((4 - d + 7) % 7) + 21; },
  now(d = new Date()) {
    const m = d.getMonth() + 1, day = d.getDate(), y = d.getFullYear(); let rg = 'US'; try { rg = WhereToWatch.region(); } catch (e) { /* US */ }
    const t = this.thx(y), thxOn = rg === 'US' || rg === 'CA';
    if ((m === 12 && day >= 26) || (m === 1 && day <= 2)) return { id: 'newyear', title: 'New Year’s Eve films', kw: '613' };
    if (m === 12 || (m === 11 && day > (thxOn ? t : 14))) return { id: 'xmas', title: 'Christmas films', kw: '207317', ng: '27' };
    if (m === 11 && thxOn && day <= t) return { id: 'thx', title: 'Thanksgiving films', kw: '4543', ng: '27' };
    if (m === 10) return { id: 'hallo', title: 'Halloween films', kw: '3335' };
    if (m === 2 && day <= 14) return { id: 'val', title: 'Valentine’s Day films', kw: '160404', ng: '27' };
    return null;
  },
  async list(h) {
    const key = `${h.id}|${X8.dayKey()}|${this.kids()}`;
    if (this.memo && this.memo.key === key) return this.memo.list;
    const q = { kind: 'movie', sort: 'pop', kw: h.kw, n: '20', ...(h.ng ? { ng: h.ng } : {}), ...(this.kids() ? { fam: '1', g: '10751' } : {}) };
    const j = await MetaBackup.relay('discover', q);
    let list = ((j && j.results) || []).map((x) => Recs.fromTmdb(x)).filter((m) => m && m.id);
    if (this.kids()) list = list.filter((m) => Seats.kidSafe(m));
    this.memo = { key, list }; return list;
  },
  place() {
    const old = $('#holRow');
    const h = CFG.holidayRow === false ? null : this.now(); if (!h) { if (old) old.remove(); return; }
    const anchor = $('#chRow') || $('#netRow'); if (!anchor || !anchor.isConnected) return;
    if (old && old.dataset.hol === h.id) { if (anchor.nextElementSibling !== old) anchor.after(old); return; }
    const tok = ++this.tok;
    this.list(h).then((list) => {
      if (tok !== this.tok || list.length < 6) return;
      const a = $('#chRow') || $('#netRow'); if (!a || !a.isConnected) return;
      const sec = rowShell(h.title, ''); sec.id = 'holRow'; sec.dataset.hol = h.id;
      const prev = $('#holRow'); if (prev) prev.remove();
      a.after(sec); fillRail(sec, list.slice(0, 20).map((m) => cardHTML(m)).join(''));
      if (IS_TV && typeof Nav !== 'undefined') Nav.settle();
    }).catch(() => { /* the row simply stays away */ });
  },
};
window.MkHoliday = Holiday;
{ const hm = typeof secById === 'function' && secById('home'); if (hm) { const rows = hm.rows; hm.rows = () => [...rows(), { key: 'holidayRow', label: 'Holiday row', help: 'Films for the season on Home around Christmas, Halloween, Thanksgiving, Valentine’s Day and New Year.', type: 'toggle', get: () => CFG.holidayRow !== false, set: (v) => { setCfg('holidayRow', v); Holiday.place(); } }]; } }
