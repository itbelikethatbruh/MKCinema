
'use strict';
/* ---------------- 2.91.3 Kids seats: strict ages, a Top 10 of their own, kids rows and a banner ----------------
   Owner (2026-11-23): kids seats had no Top 10 and grown-up titles got through. A kids seat now shows a title only when
   its age rating is known and at or under the seat's limit (Seats.kidSafe + KidsAge.ok fail closed: no id, no rating,
   no answer = hidden). Titles on screen without a rating are looked up in the background and the Home redraws when
   new ones pass. Playing anything checks the same rule (playStream), so a link, the party or an old Continue watching
   entry cannot start a title the seat would not show. */
const KidsPlus = {
  memo: new Map(), redraws: 0,
  on() { try { return typeof Seats !== 'undefined' && Seats.kids(); } catch (e) { return false; } },
  ready() { return KidsAge.data ? Promise.resolve() : Promise.race([KidsAge.load(), new Promise((r) => setTimeout(r, 4000))]); },
  /* kid-safe titles from Cinemeta's popular list in one category, more pages until `need` pass */
  list(type, genre, need) { const a = Top10.cine(); return Top10.pages((skip) => Top10.cat(a, type, 'top', { genre, skip }), (m) => Seats.kidSafe(m), need, 5); },
  async pick(type, need) {
    const key = `${type}|${need}|${KidsAge.limit()}|${KidsAge.country()}`, hit = this.memo.get(key);
    if (hit && Date.now() - hit.t < 6 * 3600e3) return hit.l;
    await this.ready();
    const ls = await Promise.all(['Animation', 'Family'].map((g) => this.list(type, g, need).catch(() => [])));
    // both lists are in popularity order: take turns, so the Top 10 is the most popular of each
    const out = [], seen = new Set();
    for (let i = 0; out.length < need && i < Math.max(...ls.map((l) => l.length), 0); i++) ls.forEach((l) => { const m = l[i]; if (m && !seen.has(m.id) && out.length < need) { seen.add(m.id); out.push(m); } });
    if (out.length) this.memo.set(key, { t: Date.now(), l: out });
    return out;
  },
  top(type) { return this.pick(type, 10); },
  /* Home: the banner and three rows made for kids (the addon rows above are often nearly empty once filtered) */
  ROWS: [['movie', 'Animation', 'Animation'], ['movie', 'Family', 'Family'], ['series', 'Animation', 'Animated series']],
  async home() {
    const rows = $('#homeRows'); if (!rows || S.view !== 'home') return;
    rows.querySelectorAll('[data-kid-row]').forEach((x) => x.remove());
    const secs = this.ROWS.map(([type, genre, title], i) => { const s = rowShell(title, ''); s.dataset.brRank = String(2.1 + i / 10); // right under Top 10 (SimpleHome.rank)
      s.id = `kidRow-${type}-${genre.toLowerCase()}`; s.dataset.kidRow = `${type}-${genre}`; s.dataset.rk = `kid:${type}/${genre}`; return [s, type, genre]; });
    const t10 = rows.querySelector(':scope > section[data-curate="top10"]');
    let at = t10 || rows.querySelector(':scope > #cwRow') || null;
    secs.forEach(([s]) => { if (at) at.after(s); else rows.prepend(s); at = s; });
    await this.ready();
    await Promise.all(secs.map(async ([s, type, genre]) => {
      const l = await this.list(type, genre, 24).catch(() => []);
      if (!s.isConnected) return;
      if (l.length < 4) { s.remove(); return; }
      fillRail(s, l.slice(0, 24).map((m) => cardHTML(m)).join(''));
    }));
    icons(); if (typeof queueWall === 'function') queueWall();
    if (!S.hero.length && CFG.banner !== 'off') {
      const l = (await this.top('movie').catch(() => [])).filter((m) => m.background || m.poster);
      if (l.length && S.view === 'home' && !S.hero.length) { setHeroList(l.slice(0, 8)); if (S.hero.length) $('#hero').hidden = false; }
    }
  },
  /* new ratings came in: draw Home again so the titles that now pass show (only when nobody is in the middle of it) */
  refresh() {
    clearTimeout(this.rt);
    this.rt = setTimeout(() => {
      const pal = $('#palette'); if (pal && !pal.hidden && typeof PAL !== 'undefined' && PAL.q) { renderPalette(PAL.q); return; }
      if (S.view !== 'home' || scrollY > 400 || this.redraws >= 4 || document.body.classList.contains('layer-open') || !$('#player').hidden || !$('#detail').hidden) return;
      this.redraws++; renderHome();
    }, 1500);
  },
  init() {
    if (!this.on()) return;
    // titles the seat would hide only because their rating is unknown are looked up (a few at a time)
    KidsAge.want = new Map();
    KidsAge.need = function (m) {
      const id = m && m.id; if (!id || !/^tt\d+$/.test(id) || this.ages(id) || (this.cache && this.cache[id] === 0) || this.asked.has(id)) return;
      if (!Seats.kidGenre(m)) return;
      this.want.set(id, m.type === 'series' ? 'series' : 'movie'); this.later();
    };
    const sc = KidsAge.scan.bind(KidsAge);
    KidsAge.scan = function () {
      if (this.want.size && !this.running && (this.data || this.cache)) {
        const need = [...this.want.entries()]; this.want.clear(); need.slice(40).forEach(([id, t]) => this.want.set(id, t));
        this.running = true;
        this.lookup(need.slice(0, 40)).then((got) => { this.running = false; if (got) KidsPlus.refresh(); if (this.want.size) this.later(); }).catch(() => { this.running = false; });
        return;
      }
      return sc();
    };
    // Search: the same rule for every result (it draws its own tiles, not cards)
    const pc = palCompose;
    palCompose = function (q, titles, pending) { return pc.call(this, q, (titles || []).filter((m) => { if (Seats.kidSafe(m)) return true; try { KidsAge.need(m); } catch (e) { /* no lookup */ } return false; }), pending); };
    const rh = renderHome;
    renderHome = async function () { const out = await rh.apply(this, arguments); try { await KidsPlus.home(); } catch (e) { console.warn('Kids Home:', e); } return out; };
  },
};
try { KidsPlus.init(); } catch (e) { console.warn('Kids seat:', e); }
