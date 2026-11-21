
'use strict';
/* 2.86 Library groups, poster labels, source reasons, filler labels and seat sections */
const LibGroups = {
  OPTS: [['', 'No groups'], ['decade', 'By decade'], ['genre', 'By genre'], ['rating', 'By rating']],
  mine(m) { try { return typeof Rate !== 'undefined' ? Rate.get(Rate.imdb(m) || m.id) || 0 : 0; } catch (e) { return 0; } },
  yr(m) { return Number(String(m.releaseInfo || m.year || yearOf(m) || '').slice(0, 4)) || 0; },
  key(m, g) {
    if (g === 'decade') { const y = this.yr(m); return y ? `${Math.floor(y / 10) * 10}s` : 'Year unknown'; }
    if (g === 'genre') return genresOf(m)[0] || 'Other';
    const r = parseFloat(m.imdbRating);
    return !(r > 0) ? 'Not rated' : r >= 8 ? '8 and up' : r >= 7 ? '7 to 8' : r >= 6 ? '6 to 7' : 'Under 6';
  },
  card(m) { return cardHTML(m, m._p ? { progress: m._p, sub: progressSub(m._p) } : {}); },
  html(list, s) {
    const g = s.group;
    if (!g || list.length < 2) return list.map((m) => this.card(m)).join('');
    const map = new Map(); list.forEach((m) => { const k = this.key(m, g); if (!map.has(k)) map.set(k, []); map.get(k).push(m); });
    let keys = [...map.keys()];
    if (g === 'decade') keys.sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0));
    else if (g === 'genre') keys.sort((a, b) => (a === 'Other') - (b === 'Other') || map.get(b).length - map.get(a).length || a.localeCompare(b));
    else { const o = ['8 and up', '7 to 8', '6 to 7', 'Under 6', 'Not rated']; keys.sort((a, b) => o.indexOf(a) - o.indexOf(b)); }
    return keys.map((k) => `<h3 class="lib-gh">${esc(k)}</h3>${map.get(k).map((m) => this.card(m)).join('')}`).join('');
  },
  /* phones: a strip of letters down the side, sorted A to Z; touch or slide on it to jump */
  az(box, s, list) {
    if (!TOUCH_UI || IS_TV || s.sort !== 'az' || s.group || list.length < 24) return;
    const L = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
    const nav = document.createElement('nav'); nav.className = 'lib-az'; nav.setAttribute('aria-label', 'Jump to a letter');
    nav.innerHTML = L.map((c) => `<button type="button" data-az="${c}" tabindex="-1">${c}</button>`).join('');
    box.appendChild(nav);
    const first = (c) => { const ch = String(c.getAttribute('aria-label') || '').trim().charAt(0).toUpperCase(); return /[A-Z]/.test(ch) ? ch : '#'; };
    let last = '';
    const jump = (x, y) => {
      const el = document.elementFromPoint(x, y), b = el && el.closest && el.closest('[data-az]'); if (!b || b.dataset.az === last) return;
      last = b.dataset.az; const want = L.indexOf(last), cards = $$('.lib-grid [data-card]', box);
      const c = cards.find((k) => L.indexOf(first(k)) >= want) || cards[cards.length - 1]; if (!c) return;
      $$('[data-az]', nav).forEach((z) => z.classList.toggle('on', z === b));
      const top = c.getBoundingClientRect().top + scrollY - 90; scrollTo({ top, behavior: 'auto' });
    };
    nav.addEventListener('pointerdown', (e) => { e.preventDefault(); last = ''; nav.setPointerCapture(e.pointerId); jump(e.clientX, e.clientY); });
    nav.addEventListener('pointermove', (e) => { if (nav.hasPointerCapture(e.pointerId)) jump(e.clientX, e.clientY); });
    nav.addEventListener('pointerup', () => setTimeout(() => $$('[data-az].on', nav).forEach((z) => z.classList.remove('on')), 500));
  },
};
/* the best picture found for a title is kept for 60 days, so its poster label is there on the next visit */
const QualTags = {
  K: 'qualTags', MAX: 800, DAYS: 60,
  save(id, v) {
    const all = Store.get(this.K, {}) || {}; all[id] = { v, t: Date.now() };
    const keys = Object.keys(all); if (keys.length > this.MAX) keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - this.MAX).forEach((k) => delete all[k]);
    Store.set(this.K, all);
  },
  load() {
    const all = Store.get(this.K, {}) || {}, old = Date.now() - this.DAYS * 864e5;
    Object.entries(all).forEach(([k, x]) => { if (x && typeof x.v === 'string' && x.t > old && !engine.qualityCache.has(k)) engine.qualityCache.set(k, x.v); });
  },
};
window.MkQualSet = (map, id, v) => { map.set(id, v); try { QualTags.save(id, v); } catch (e) { /* storage full */ } };
try { QualTags.load(); } catch (e) { /* nothing saved */ }
const SrcWhy = {
  group(st) { const r = st && st._tel && st._tel.res; return r === '4K UHD' ? '4K' : r === 'SD' ? 'Smaller files' : r || 'Quality not given'; },
  why(g) {
    return {
      '4K': 'Sharpest picture. Needs a fast connection and a 4K screen.',
      '1440p': 'Sharper than Full HD, lighter than 4K.',
      '1080p': 'Full HD. Sharp on most TVs and starts quickly.',
      '720p': 'Lighter. Good on phones or a slow connection.',
      'Smaller files': 'Lowest picture. Pick it when nothing else plays.',
      'Quality not given': 'The source doesn’t say how sharp it is.',
    }[g] || '';
  },
};
/* Anime: episodes that are filler (not from the original story) or recaps get a small label. Episode lists come
   from MyAnimeList through Jikan, matched to seasons the same way skip markers are; kept for a week. */
const Filler = {
  K: 'fillerMap', busy: new Map(),
  async list(mal) {
    const all = Store.get(this.K, {}) || {}, x = all[mal];
    if (x && Date.now() - x.t < 7 * 864e5) return x;
    if (this.busy.has(mal)) return this.busy.get(mal);
    const p = (async () => {
      const f = [], r = []; let page = 1, more = true;
      while (more && page <= 20) {
        const res = await fetch(`https://api.jikan.moe/v4/anime/${Number(mal)}/episodes?page=${page}`); if (!res.ok) break;
        const j = await res.json(); (j.data || []).forEach((e) => { if (e.filler) f.push(e.mal_id); if (e.recap) r.push(e.mal_id); });
        more = !!(j.pagination && j.pagination.has_next_page); page++;
        if (more) await new Promise((ok) => setTimeout(ok, 450));   // Jikan allows about 3 calls a second
      }
      const v = { t: Date.now(), f, r }; const a2 = Store.get(this.K, {}) || {}; a2[mal] = v;
      const keys = Object.keys(a2); if (keys.length > 150) delete a2[keys[0]];
      Store.set(this.K, a2); return v;
    })().catch(() => null).finally(() => this.busy.delete(mal));
    this.busy.set(mal, p); return p;
  },
  async paint(meta) {
    if (CFG.fillerTags === false || !meta || meta.type !== 'series' || typeof AniSkip === 'undefined' || !AniSkip.animeish(meta)) return;
    const imdb = String(meta.imdb_id || meta.id || '').split(':')[0]; if (!/^tt\d+$/.test(imdb)) return;
    const season = D.season, eps = $$('#dEps [data-vid]'); if (!eps.length) return;
    const tok = (this.tok = (this.tok || 0) + 1);
    for (const b of eps) {
      if (tok !== this.tok || !b.isConnected) return;
      const v = (meta.videos || []).find((x) => videoIdFor(meta, x) === b.dataset.vid); if (!v || seasonNo(v) !== season) continue;
      let hit; try { hit = await AniSkip.find(imdb, season, Number(v.episode)); } catch (e) { return; }
      if (!hit) return;
      const l = await this.list(hit.mal); if (!l || tok !== this.tok) return;
      const kind = l.f.includes(hit.ep) ? 'Filler' : l.r.includes(hit.ep) ? 'Recap' : '';
      const n = $('.num', b); if (kind && n && !$('.ep-fill', n)) n.insertAdjacentHTML('beforeend', ` <span class="ep-fill${kind === 'Recap' ? ' rc' : ''}">${kind}</span>`);
    }
  },
};
window.MkFiller = Filler;
/* Each seat can leave out sections it never uses (Live TV, Sports, Music, Anime, Calendar). Changing it on another
   seat takes that seat's PIN, like every other seat change. */
const SeatHide = {
  VIEWS: [['tv', 'Live TV'], ['sports', 'Sports'], ['music', 'Music'], ['anime', 'Anime'], ['calendar', 'Calendar']],
  clean(l) { const ok = this.VIEWS.map(([v]) => v); return Array.isArray(l) ? l.filter((v) => ok.includes(v)) : []; },
  cur() { try { return this.clean((Seats.cur() || {}).hide); } catch (e) { return []; } },
  blocked(view) { return this.cur().includes(view); },
  html(s) {
    const h = this.clean(s.hide);
    return `<div class="se-hide"><b>Sections this seat sees</b><small>Tap one to leave it out of the menu for this seat.</small><div class="se-hide-l">${this.VIEWS.map(([v, l]) => `<button type="button" class="chip${h.includes(v) ? '' : ' on'}" data-nav data-shv="${v}" aria-pressed="${!h.includes(v)}">${l}</button>`).join('')}</div></div>`;
  },
  bind(b, s) {
    s.hide = this.clean(s.hide);
    $$('[data-shv]', b).forEach((x) => x.addEventListener('click', () => {
      const v = x.dataset.shv, off = s.hide.includes(v);
      s.hide = off ? s.hide.filter((y) => y !== v) : [...s.hide, v];
      x.classList.toggle('on', off); x.setAttribute('aria-pressed', String(off));
    }));
  },
  apply() {
    const h = this.cur(); let st = $('#seatHideCss');
    if (!st) { st = document.createElement('style'); st.id = 'seatHideCss'; document.head.appendChild(st); }
    st.textContent = h.map((v) => `[data-view="${v}"]:not(.view){display:none!important}`).join('\n');
    if (h.includes(S.view)) go('home');
  },
};
document.documentElement.classList.toggle('mk-noprog', CFG.cardProg === false);
document.documentElement.classList.toggle('mk-noq', CFG.qualTags === false);
try { SeatHide.apply(); } catch (e) { /* seats not ready */ }
{
  const sec = secById('player') || secById('playback');
  if (sec && !sec.rows().some((r) => r.key === 'fillerTags')) {
    const rows = sec.rows;
    sec.rows = () => { const r = rows(), at = r.findIndex((x) => x.key === 'spoilerGuard'); r.splice(at >= 0 ? at + 1 : r.length, 0, { key: 'fillerTags', label: 'Filler and recap labels on anime', help: 'Marks anime episodes that are filler (not from the original story) or a recap, so you can skip them.', type: 'toggle', get: () => CFG.fillerTags !== false, set: (v) => setCfg('fillerTags', v) }); return r; };
  }
}
