/* ---------------- 2.18.0 MDBList lists as Home rows ----------------
   Paste any mdblist.com list (yours or anyone's public one) in Settings › Home and it becomes a row on Home, after
   the curated rows and before your addon catalogs. Items are IMDb titles, so Cinemeta and every stream addon know
   them. Lists are saved with your Home layout (they follow your account). MDBList's API needs a free API key (kept in
   Keys, synced like the TMDB key): its public JSON pages do not allow browser requests (no CORS), the API does.
   Each list is cached for 6 hours. */
const MDB = {
  lists() { return (Layout.get().mdb || []).filter((l) => l && l.user && l.slug); },
  parse(raw) {
    const s = String(raw || '').trim().replace(/[?#].*$/, '').replace(/\/(json|items)\/?$/, '').replace(/\/+$/, '');
    const m = s.match(/^(?:https?:\/\/)?(?:www\.)?mdblist\.com\/lists\/([\w.-]+)\/([\w.-]+)$/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (!m) throw new Error('Paste a list link like mdblist.com/lists/user/list-name');
    return { user: m[1], slug: m[2] };
  },
  title(l) { return l.name || l.slug.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()); },
  async items(l) {
    const ck = `${l.user}/${l.slug}`, cache = Store.get('mdbCache', {});
    if (cache[ck] && Date.now() - cache[ck].t < 6 * 3600e3) return cache[ck].v;
    const key = Keys.get().mdblist; if (!key) throw new Error('Add your free MDBList API key first');
    const r = await fetch(`https://api.mdblist.com/lists/${encodeURIComponent(l.user)}/${encodeURIComponent(l.slug)}/items?limit=60&apikey=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(r.status === 404 ? 'MDBList has no list at that address' : r.status === 401 || r.status === 403 ? 'MDBList did not accept the API key' : `MDBList ${r.status}`);
    const j = await r.json();
    const raw = Array.isArray(j) ? j : [...(j.movies || []), ...(j.shows || []), ...(j.items || [])];
    const v = raw.filter((x) => x && /^tt\d+$/.test(x.imdb_id || '')).sort((a, b) => (a.rank || 0) - (b.rank || 0)).slice(0, 60)
      .map((x) => ({ id: x.imdb_id, type: /show|series/i.test(x.mediatype || '') ? 'series' : 'movie', name: x.title || '', releaseInfo: String(x.release_year || '') }));
    cache[ck] = { t: Date.now(), v }; const keys = Object.keys(cache); if (keys.length > 30) delete cache[keys[0]];
    Store.set('mdbCache', cache); return v;
  },
  async render() {
    const rows = $('#homeRows'); if (!rows || S.view !== 'home') return;
    $$('#homeRows [data-mdb]').forEach((x) => x.remove());
    const lists = this.lists(); if (!lists.length || !Keys.get().mdblist) return;
    const focus = Layout.get().focus;
    const anchor = [...rows.children].find((el) => el.matches('section.row') && !el.id && !el.dataset.curate && !el.dataset.mdb && !/^(My watchlist|Continue watching)/.test((window.i18nEn ? i18nEn(el) : el.textContent).slice(0, 40)) && !el.matches('.picks-row, #picksRow, #cwRow')) || null;
    const secs = lists.map((l) => { const s = rowShell(this.title(l), 'MDBList'); s.dataset.mdb = `${l.user}/${l.slug}`; s.querySelector('.row-title').setAttribute('translate', 'no'); rows.insertBefore(s, anchor); return [l, s]; });
    await Promise.all(secs.map(async ([l, s]) => {
      let v; try { v = await this.items(l); } catch (e) { v = null; }
      if (focus === 'movies') v = v && v.filter((m) => m.type === 'movie'); else if (focus === 'series') v = v && v.filter((m) => m.type === 'series');
      if (!v || !v.length || !s.isConnected) { s.remove(); return; }
      fillRail(s, v.map((m) => cardHTML(m)).join(''));
    }));
    icons();
  },
  async add(raw) {
    const l = this.parse(raw), have = this.lists();
    if (have.some((x) => x.user === l.user && x.slug === l.slug)) throw new Error('That list is already on Home');
    if (have.length >= 10) throw new Error('Up to 10 lists');
    const v = await this.items(l); if (!v.length) throw new Error('That list has no films or series with IMDb ids');
    Layout.set({ mdb: [...have, l] }); return v.length;
  },
  remove(id) { Layout.set({ mdb: this.lists().filter((l) => `${l.user}/${l.slug}` !== id) }); },
  init() {
    const home = renderHome;
    renderHome = function () { const p = home.apply(this, arguments); Promise.resolve(p).then(() => MDB.render()); return p; };
    const sec = SECTIONS.find((x) => x.id === 'home'); if (!sec) return;
    const rows = sec.rows, bind = sec.bind;
    sec.rows = () => [...rows(),
      { group: 'MDBList lists' },
      { key: 'mdbKey', label: 'MDBList API key', help: 'Needed to read lists. It is free at mdblist.com/preferences (API key). Syncs with your other keys.', type: 'secret', get: () => Keys.get().mdblist || '', set: (v) => { Keys.set('mdblist', String(v || '').trim()); Store.set('mdbCache', {}); } },
      { html: () => {
        const ls = this.lists();
        const list = ls.map((l) => `<div class="mdb-item"><span><b>${esc(this.title(l))}</b><small translate="no">mdblist.com/lists/${esc(l.user)}/${esc(l.slug)}</small></span><button class="btn btn-ghost btn-sm danger" type="button" data-mdbx="${esc(`${l.user}/${l.slug}`)}">Remove</button></div>`).join('');
        return `<div class="set-row mdb-row"><div><b>Add a list</b><small>Paste a list link from mdblist.com. It becomes a row on Home, after the curated rows.</small><div class="mdb-add"><input class="inp" id="mdbUrl" type="url" autocomplete="off" spellcheck="false" placeholder="mdblist.com/lists/user/list-name"><button class="btn btn-prime btn-sm" type="button" id="mdbGo"><i data-lucide="plus"></i>Add list</button></div>${list ? `<div class="mdb-list">${list}</div>` : ''}</div></div>`;
      } },
    ];
    sec.bind = (...a) => {
      if (bind) bind(...a);
      const go = $('#mdbGo'); if (!go) return;
      go.onclick = async () => {
        go.disabled = true;
        try { const n = await MDB.add(($('#mdbUrl') || {}).value); toast(`List added to Home (${n} titles)`, 'ok'); renderSettingsBody(); }
        catch (e) { toast(e.message === 'Failed to fetch' ? 'MDBList did not answer. Check your connection and try again.' : e.message, 'err', 4000); }
        go.disabled = false;
      };
      const inp = $('#mdbUrl'); if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
      $$('[data-mdbx]').forEach((b) => { b.onclick = () => { MDB.remove(b.dataset.mdbx); renderSettingsBody(); }; });
    };
  },
};
MDB.init();
