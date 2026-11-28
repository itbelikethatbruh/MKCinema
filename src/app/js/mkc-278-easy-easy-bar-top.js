
'use strict';
/* 2.78 Easy bar.
   - Top menu on phones, tablets and computers: one floating bar (Home, Movies, Series, Anime, Live TV, Library,
     Search, menu) with the seat button on the right. Every other section and tool moves into the menu with its name
     written out. The menu is built from the hidden buttons each time it opens, so anything another block adds to the
     bar shows up in the menu by itself.
   - Phones keep the bottom bar. Their top shrinks to the logo, Search, the menu and the seat button.
   - Home banner and film pages: one Play button and one small pill (Watchlist + Details, or Watchlist + More).
     The sources list sits behind "Choose a source"; anything that asks for the sources opens it first.
   - First open asks nothing: no walkthrough on its own (it is in the menu and in Settings), no top-or-side menu question,
     and no player question where the MKCinema player is the right pick for the device.
   TVs keep their layout; only the first-open questions change there. */
(() => {
  if (window.MKEasy) return;
  const KEEP = ['home', 'movie', 'series', 'anime', 'tv', 'music', 'library'];
  const q = (s, r) => (r || document).querySelector(s), qa = (s, r) => [...(r || document).querySelectorAll(s)];
  const tv = () => { try { return !!IS_TV; } catch (e) { return false; } };
  const ic = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const paint = () => { try { icons(); } catch (e) { try { lucide.createIcons(); } catch (e2) { /* icons stay as markers */ } } };
  const iconOf = (el) => { const i = el && el.querySelector('[data-lucide]'); return (i && i.getAttribute('data-lucide')) || 'circle'; };
  const textOf = (el) => (el.getAttribute('aria-label') || (el.querySelector('.lbl') || el).textContent || el.title || '').replace(/\s+/g, ' ').trim();
  const local = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

  const E = window.MKEasy = {
    // ---------- first open asks nothing ----------
    quiet() {
      try {
        if (typeof Store === 'undefined') return;
        if (!Store.raw.get('navAsked', false)) Store.raw.set('navAsked', true);   // TVs get the side menu, the rest the top menu
        if (!Store.get('toured', false)) { Store.set('toured', true); local.set('mk:easyFresh', '1'); }   // the walkthrough waits in the menu
        if (typeof PlayerAsk !== 'undefined' && !Store.get(PlayerAsk.KEY, false)) {
          const r = PlayerAsk.rec();
          if (r.pick !== 'ext') {   // where VLC really is the better pick (old iOS, browsers without HEVC) the question stays
            Store.set(PlayerAsk.KEY, true);
            if (r.bo && !CFG.browserOnly) { try { setCfg('browserOnly', true); } catch (e) { CFG.browserOnly = true; try { saveCfg(); } catch (e2) { /* next save keeps it */ } } }
          }
        }
        if (!Store.get('askedFocus', false) && !Store.get('homeLayout', null)) Store.set('askedFocus', true);   // Movies, Series or both: both
      } catch (e) { console.warn('Easy bar, first open:', e); }
    },

    // ---------- the bar ----------
    mode() {
      const de = document.documentElement, bar = true;   // 2.81: this bar is the only menu, on every screen
      de.classList.toggle('ezb-bar', bar); de.classList.toggle('ezb-lean', !tv());
      if (!bar) this.close();
      if (bar) this.build();
    },
    build() {
      const tabs = q('#tabs'), tools = q('.dock-tools'); if (!tabs || !tools) return;
      qa('.tab', tabs).forEach((t) => t.classList.toggle('ezb-off', !KEEP.includes(t.dataset.view)));
      if (!q('#ezbSearch', tabs)) {
        tabs.insertAdjacentHTML('beforeend', `<span class="ezb-sep" aria-hidden="true"></span><button type="button" class="ezb-ib" id="ezbSearch" data-nav aria-label="Search" title="Search">${ic('search')}</button><button type="button" class="ezb-ib" id="ezbMenuB" data-nav aria-label="Menu" title="Menu" aria-haspopup="menu" aria-expanded="false">${ic('menu')}</button>`);
        q('#ezbSearch').addEventListener('click', (e) => { e.stopPropagation(); const s = q('#openPalette'); if (s) s.click(); });
        q('#ezbMenuB').addEventListener('click', (e) => { e.stopPropagation(); this.toggle(e.currentTarget); });
        paint();
      } else if (tabs.lastElementChild && tabs.lastElementChild.id !== 'ezbMenuB') {   // a tab added later goes before Search
        qa('.ezb-sep, #ezbSearch, #ezbMenuB', tabs).forEach((n) => tabs.appendChild(n));
      }
      if (!q('#ezbMenuP', tools)) {
        tools.insertAdjacentHTML('beforeend', `<button type="button" class="ibtn" id="ezbMenuP" data-nav aria-label="Menu" title="Menu" aria-haspopup="menu" aria-expanded="false">${ic('menu')}</button>`);
        q('#ezbMenuP').addEventListener('click', (e) => { e.stopPropagation(); this.toggle(e.currentTarget); });
        paint();
      }
      try { if (typeof DockFit !== 'undefined') DockFit.run(); } catch (e) { /* layout still fits */ }
    },
    // what the menu holds, read from the hidden buttons each time
    items() {
      const has = (id) => { const b = q(`#${id}`); return b ? b : null; };
      const places = qa('#tabs .tab').filter((t) => t.dataset.view !== 'sports' && !KEEP.includes(t.dataset.view));   // Sports lives inside Live TV
      const known = ['openPalette', 'openAccount', 'openParty', 'openSettings', 'muteBtn', 'ezbMenuP', 'vRails', 'vWall'];
      const order = ['openFriends', 'homeCast', 'openAddons', 'openFile'];
      const tools = qa('.dock-tools > button').filter((b) => !known.includes(b.id));
      tools.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
      return { party: has('openParty'), places, tools, rails: has('vRails'), wall: has('vWall'), mute: has('muteBtn'), settings: has('openSettings') };
    },
    toggle(btn) { if (q('#ezbMenu') && !q('#ezbMenu').hidden) this.close(); else this.open(btn); },
    open(btn) {
      const it = this.items();
      let m = q('#ezbMenu');
      if (!m) { m = document.createElement('div'); m.id = 'ezbMenu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', 'Menu'); document.body.appendChild(m); }
      const row = (key, icon, label, extra) => `<button type="button" role="menuitem" data-nav data-mk="${key}">${ic(icon)}<span>${esc(label)}</span>${extra || ''}</button>`;
      let h = '';
      if (it.party) h += `<button type="button" role="menuitem" data-nav class="ezb-big" data-mk="#openParty"><span class="ezb-ic">${ic('users')}</span><span><b>Start a watch party</b><small>Watch together, in sync</small></span><span class="ezb-go">${ic('chevron-right')}</span></button>`;
      it.tools.forEach((b) => { h += row(`#${b.id}`, iconOf(b), textOf(b)); });
      if (it.places.length) { h += '<hr><div class="ezb-lab">Explore</div>'; it.places.forEach((t) => { h += row(`view:${t.dataset.view}`, iconOf(t), textOf(t)); }); }
      if (it.rails && it.wall && innerWidth > 760) {
        const wall = it.wall.classList.contains('on');
        h += `<hr><div class="ezb-lab">Home style</div><div class="ezb-seg" role="group" aria-label="Home style"><button type="button" data-nav data-mk="#vRails" aria-pressed="${!wall}">Rails</button><button type="button" data-nav data-mk="#vWall" aria-pressed="${wall}">IMAX</button></div>`;
      }
      h += '<hr>';
      if (it.mute) { const off = /off|x|mute/i.test(iconOf(it.mute)); h += row('#muteBtn', off ? 'volume-x' : 'volume-2', 'Sound', `<span class="ezb-state">${off ? 'Off' : 'On'}</span>`); }
      h += row('updates', 'refresh-cw', 'Updates', typeof Updates !== 'undefined' && Updates.due() ? '<span class="ezb-state ezb-new">New</span>' : '');
      h += row('tour', 'map', 'Take the tour');
      if (it.settings) h += row('#openSettings', 'settings-2', 'Settings');
      m.innerHTML = `<div class="ezb-top"><button type="button" class="ezb-x" data-nav aria-label="Close menu" title="Close menu">${ic('x')}</button></div>${h}`; paint();
      q('.ezb-x', m).addEventListener('click', (e) => { e.stopPropagation(); this.close(); const o = this._opener; if (o) try { o.focus({ preventScroll: true }); } catch (e2) { /* opener gone */ } });
      qa('[data-mk]', m).forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = b.dataset.mk, keep = k === '#vRails' || k === '#vWall';
        if (!keep) this.close();
        if (k === 'tour') { try { openTour(0); } catch (e2) { /* walkthrough missing */ } return; }
        if (k === 'updates') { openSettings('updates'); return; }
        if (k.startsWith('view:')) { const t = q(`#tabs .tab[data-view="${k.slice(5)}"]`); if (t) t.click(); else try { go(k.slice(5)); } catch (e2) { /* view gone */ } return; }
        const o = q(k); if (o) o.click();
        if (keep) setTimeout(() => qa('.ezb-seg [data-mk]', m).forEach((s) => s.setAttribute('aria-pressed', String(!!(q(s.dataset.mk) || {}).classList?.contains('on')))), 60);
      }));
      // place it under the button that opened it
      const r = (btn || q('#ezbMenuB')).getBoundingClientRect();
      m.style.top = `${Math.round(r.bottom + 10)}px`;
      m.style.left = `${Math.round(Math.min(innerWidth - 316, Math.max(12, r.right - 304 + 24)))}px`;
      m.hidden = false; requestAnimationFrame(() => m.classList.add('open'));
      document.documentElement.classList.add('ezb-menu-open');   // the page behind stays still (see still() in run)
      qa('#ezbMenuB, #ezbMenuP').forEach((b) => b.setAttribute('aria-expanded', 'true'));
      this._opener = btn;
      setTimeout(() => { const f = q('[data-mk]', m); if (f && (tv() || document.activeElement === btn)) { try { Nav.focus(f, true); } catch (e) { f.focus(); } } }, 30);
    },
    close() {
      const m = q('#ezbMenu'); if (!m || m.hidden) return false;
      m.classList.remove('open'); setTimeout(() => { if (!m.classList.contains('open')) m.hidden = true; }, 220);
      document.documentElement.classList.remove('ezb-menu-open');
      qa('#ezbMenuB, #ezbMenuP').forEach((b) => b.setAttribute('aria-expanded', 'false'));
      return true;
    },
    // ---------- one Play button + one pill ----------
    relabel(root) {
      qa('.sp-l', root).forEach((l) => { const n = l.firstChild; if (n && n.nodeType === 3 && n.nodeValue.trim() === 'Smart Play') n.nodeValue = 'Play'; });
    },
    hero() {
      const play = q('#heroPlay'); if (tv() || !play || q('#ezbHeroPill')) return;
      const p = document.createElement('span'); p.className = 'ezb-pill'; p.id = 'ezbHeroPill';
      p.innerHTML = `<button type="button" data-nav data-tip="Watchlist" aria-label="Watchlist">${ic('plus')}</button><button type="button" data-nav data-tip="Details" aria-label="Details">${ic('info')}</button>`;
      play.after(p); paint();
      const [add, info] = qa('button', p);
      add.addEventListener('click', () => { const b = q('#heroList'); if (b) b.click(); });
      info.addEventListener('click', () => { const b = q('#heroInfo'); if (b) b.click(); });
      this.relabel(play);
    },
    detail() {
      const smart = q('#dSmart'); if (!smart) return;
      const act = smart.parentElement; if (!act || act.dataset.mkLean === '1') { this.mirror(); return; }
      act.dataset.mkLean = '1';
      this.relabel(act);
      const moved = [...act.children].filter((c) => c !== smart && (c.tagName === 'BUTTON' || c.tagName === 'A') && !c.classList.contains('ezb-pill'));
      moved.forEach((c) => c.classList.add('ezb-moved'));
      const list = q('#dList', act), more = moved.filter((c) => c !== list);
      const p = document.createElement('span'); p.className = 'ezb-pill'; p.id = 'ezbDetailPill';
      p.innerHTML = `${list ? `<button type="button" data-nav id="ezbDList" data-tip="Watchlist" aria-label="Watchlist">${ic('plus')}</button>` : ''}${more.length ? `<button type="button" data-nav id="ezbDMore" data-tip="More" aria-label="More" aria-haspopup="menu" aria-expanded="false">${ic('ellipsis')}</button><div id="ezbMore" role="menu" hidden></div>` : ''}`;
      smart.after(p);
      if (list) q('#ezbDList', p).addEventListener('click', () => { list.click(); setTimeout(() => this.mirror(), 120); });
      const mb = q('#ezbDMore', p), menu = q('#ezbMore', p);
      if (mb) {
        menu.innerHTML = more.map((c, i) => `<button type="button" role="menuitem" data-nav data-i="${i}">${ic(iconOf(c) === 'search' ? 'text-search' : iconOf(c))}<span>${esc(textOf(c))}</span></button>`).join('');
        qa('button', menu).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = true; mb.setAttribute('aria-expanded', 'false'); more[+b.dataset.i].click(); }));
        mb.addEventListener('click', (e) => {
          e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; mb.setAttribute('aria-expanded', String(open));
          if (open && tv()) { const f = q('button', menu); if (f) try { Nav.focus(f, true); } catch (e2) { f.focus(); } }
        });
      }
      this.sources(act);
      paint(); this.mirror();
    },
    mirror() {
      const list = q('#dList'), b = q('#ezbDList'); if (!list || !b) return;
      const on = iconOf(list) === 'check', want = on ? 'check' : 'plus', label = textOf(list) || 'Watchlist';
      if (b.dataset.st !== want) { b.dataset.st = want; b.innerHTML = ic(want); paint(); }
      b.setAttribute('aria-label', label); b.dataset.tip = label; b.setAttribute('aria-pressed', String(on));
    },
    sources(act) {
      const st = q('#dStreams'); if (!st) return;
      const grid = st.closest('.d-grid'), col = grid && [...grid.children].find((c) => c.contains(st)); if (!grid || !col) return;
      col.classList.add('ezb-srccol');
      const want = local.get('mk:srcOpen') === '1';
      grid.classList.toggle('ezb-src-off', !want);
      /* 2.97.7 series row steady */ // a series still waiting for its full details: the full page lists episodes, not sources,
      // so the source row would vanish when they arrive and pull Play down with it
      if (typeof D !== 'undefined' && D.meta && D.meta.type === 'series' && q('#detail .metaline.ml-wait')) { grid.classList.add('ezb-src-off'); const o = q('.ezb-src', act.parentElement); if (o) o.remove(); return; }
      let s = q('.ezb-src', act.parentElement);
      if (!s) {
        s = document.createElement('div'); s.className = 'ezb-src';
        s.innerHTML = `<button type="button" data-nav id="ezbSrcBtn" aria-expanded="false">${ic('layers')}<span></span>${ic('chevron-down')}</button>`;
        act.after(s);
        q('#ezbSrcBtn', s).addEventListener('click', () => this.showSources(grid.classList.contains('ezb-src-off'), true));
      }
      this.srcLabel();
      // anything that asks for the sources (other sources from the player, Choose source) opens them first
      st.scrollIntoView = function () { E.showSources(true); return HTMLElement.prototype.scrollIntoView.apply(this, arguments); };
    },
    showSources(on, user) {
      const st = q('#dStreams'), grid = st && st.closest('.d-grid'); if (!grid) return;
      grid.classList.toggle('ezb-src-off', !on);
      if (user) local.set('mk:srcOpen', on ? '1' : '0');
      this.srcLabel();
      if (on && user) setTimeout(() => { try { st.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* stays put */ } }, 40);
    },
    srcLabel() {
      const b = q('#ezbSrcBtn'), st = q('#dStreams'); if (!b || !st) return;
      const open = !st.closest('.d-grid').classList.contains('ezb-src-off');
      q('span', b).textContent = open ? 'Hide sources' : 'Choose a source';
      b.setAttribute('aria-expanded', String(open));
    },

    init() {
      this.quiet();
      const run = () => {
        this.mode(); this.hero();
        const dp = q('#detailPanel') || q('#detail');
        let t = 0; const later = () => { if (!t) t = requestAnimationFrame(() => { t = 0; if (!tv()) { this.detail(); this.relabel(q('#hero')); } }); };
        if (dp) new MutationObserver(later).observe(dp, { childList: true, subtree: true });
        const hero = q('#hero'); if (hero) new MutationObserver(later).observe(hero, { childList: true, subtree: true, characterData: true });
        // only when another script took away this bar's own classes (any other <html> class change, like a scroll, costs nothing)
        new MutationObserver(() => { const de = document.documentElement; if (!de.classList.contains('ezb-bar') || de.classList.contains('ezb-lean') === tv()) this.mode(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        const tools = q('.dock-tools'); if (tools) new MutationObserver(() => { if (document.documentElement.classList.contains('ezb-bar')) this.build(); }).observe(tools, { childList: true });
        const tabs = q('#tabs'); if (tabs) new MutationObserver(() => { if (document.documentElement.classList.contains('ezb-bar')) this.build(); }).observe(tabs, { childList: true });
        document.addEventListener('click', (e) => {
          if (!e.target.closest('#ezbMenu')) this.close();
          const mm = q('#ezbMore'); if (mm && !mm.hidden && !e.target.closest('#ezbDetailPill')) { mm.hidden = true; const b = q('#ezbDMore'); if (b) b.setAttribute('aria-expanded', 'false'); }
        });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') { if (this.close()) { e.preventDefault(); e.stopPropagation(); const o = this._opener; if (o) o.focus(); } }
          else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.documentElement.classList.contains('ezb-bar') && e.target.closest && e.target.closest('#tabs .tab') && !tv() && !(typeof Nav !== 'undefined' && Nav.kb)) {   // a remote-style keyboard walks the bar itself
            const vis = qa('#tabs .tab').filter((x) => !x.classList.contains('ezb-off')), i = vis.indexOf(e.target.closest('.tab'));
            const n = vis[i + (e.key === 'ArrowRight' ? 1 : -1)]; if (n) { e.preventDefault(); n.focus(); n.click(); }
          }
        }, true);
        addEventListener('resize', () => { if (!tv()) this.close(); });
        // a remote or keyboard inside the open menu: Up/Down walk it, Left/Right switch Rails/IMAX, Back closes it
        addEventListener('keydown', (e) => {
          const m = q('#ezbMenu'); if (!m || m.hidden) return;
          const back = e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack' || e.key === 'BrowserBack' || e.keyCode === 4 || e.keyCode === 10009 || e.keyCode === 461;
          const k = e.key;
          if (!back && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) return;
          if (back && e.target && e.target.matches && e.target.matches('input, textarea')) return;
          e.preventDefault(); e.stopImmediatePropagation();
          if (back) { this.close(); const o = this._opener || q('#ezbMenuB'); if (o) try { Nav.focus(o, true); } catch (e2) { o.focus(); } return; }
          const bs = qa('button', m).filter((b) => b.offsetParent), a = document.activeElement, i = bs.indexOf(a);
          const go = (b) => { if (!b) return; try { Nav.focus(b, true); } catch (e2) { b.focus(); } b.scrollIntoView({ block: 'nearest' }); };
          if (i < 0) { go(q('[data-mk]', m)); return; }
          if (k === 'ArrowLeft' || k === 'ArrowRight') { const seg = a.closest('.ezb-seg'); if (seg) { const s2 = qa('button', seg), j = s2.indexOf(a) + (k === 'ArrowRight' ? 1 : -1); go(s2[j]); } return; }
          const down = k === 'ArrowDown' || (k === 'Tab' && !e.shiftKey);
          let j = i + (down ? 1 : -1);
          if (a.closest('.ezb-seg') && down) { const s2 = qa('button', a.closest('.ezb-seg')); j = bs.indexOf(s2[s2.length - 1]) + 1; }
          go(bs[Math.max(0, Math.min(bs.length - 1, j))]);
        }, true);
        // while the menu is open, drags and the wheel outside it don't move the page; inside, only a menu taller than the screen scrolls
        const still = (e) => {
          if (!document.documentElement.classList.contains('ezb-menu-open')) return;
          const m = q('#ezbMenu'), t = e.target;
          if (m && t && t.closest && t.closest('#ezbMenu') && m.scrollHeight > m.clientHeight + 1) return;
          if (e.cancelable) e.preventDefault();
        };
        addEventListener('touchmove', still, { passive: false }); addEventListener('wheel', still, { passive: false });
        if (!tv()) { this.detail(); }
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
    },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  E.init();
})();
/* 2.78 Live hub: Live TV and Sports on one page. On top, the next big game (or the one on now) with a countdown,
   and the games coming up. Under it, Channels (the guide) and Sports in your sources, one tap apart.
   Game times come from a public scoreboard feed; MKCinema plays nothing from it. A game links to your own channel
   when one of the networks showing it is in your playlists. Hidden on kids seats. */
(() => {
  if (window.MKLiveHub) return;
  const q = (s, r) => (r || document).querySelector(s), qa = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tv = () => { try { return !!IS_TV; } catch (e) { return false; } };
  const paint = () => { try { icons(); } catch (e) { /* markers stay */ } };
  const LEAGUES = [['football/nfl', 'NFL'], ['basketball/nba', 'NBA'], ['hockey/nhl', 'NHL'], ['baseball/mlb', 'MLB'], ['soccer/eng.1', 'Premier League'], ['soccer/usa.1', 'MLS']];
  const API = 'https://site.web.api.espn.com/apis/site/v2/sports/';
  const H = window.MKLiveHub = {
    games: [], at: 0, pick: 0, busy: null, TTL: 5 * 60 * 1000,
    kids() { try { return typeof SportsHub !== 'undefined' && SportsHub.kids(); } catch (e) { return false; } },
    async load(force) {
      if (!force && this.games.length && Date.now() - this.at < this.TTL) return this.games;
      if (this.busy) return this.busy;
      this.busy = (async () => {
        const out = [], ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
        const day = async (date) => Promise.all(LEAGUES.map(async ([path, short]) => {
          try {
            const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
            const r = await fetch(`${API}${path}/scoreboard?dates=${ymd(date)}`, { signal: ctl.signal, credentials: 'omit' }); clearTimeout(t);
            if (!r.ok) return;
            const d = await r.json(), lg = (d.leagues && d.leagues[0]) || {};
            (d.events || []).forEach((ev) => {
              const c = ev.competitions && ev.competitions[0]; if (!c) return;
              const st = (ev.status && ev.status.type) || {}, side = (k) => (c.competitors || []).find((x) => x.homeAway === k);
              const team = (x) => x && x.team ? { abbr: x.team.abbreviation || '', short: x.team.shortDisplayName || x.team.name || '', loc: x.team.location || '', name: x.team.name || x.team.shortDisplayName || '', color: x.team.color || '333333', alt: x.team.alternateColor || '111111', logo: x.team.logo || '', rec: (x.records && x.records[0] && x.records[0].summary) || '', score: x.score } : null;
              const home = team(side('home')), away = team(side('away')); if (!home || !away) return;
              const nets = [...new Set([...(c.broadcasts || []).flatMap((b) => b.names || []), ...(c.geoBroadcasts || []).map((g) => g.media && g.media.shortName).filter(Boolean)])];
              if (out.some((x) => x.id === ev.id)) return;
              out.push({ id: ev.id, league: lg.name || short, short, date: new Date(ev.date).getTime(), state: st.state || 'pre', detail: st.shortDetail || '', home, away, venue: (c.venue && c.venue.fullName) || '', nets });
            });
          } catch (e) { /* this league stays out */ }
        }));
        const today = new Date(); await day(today);
        const now = Date.now(), soon = now + 36 * 3600 * 1000;
        if (out.filter((g) => g.state !== 'post' && g.date >= now - 4 * 3600 * 1000).length < 4) { const tm = new Date(today); tm.setDate(today.getDate() + 1); await day(tm); }
        const keep = out.filter((g) => g.state === 'in' || (g.state === 'pre' && g.date >= now - 15 * 60 * 1000 && g.date <= soon));
        keep.sort((a, b) => (a.state === 'in' ? 0 : 1) - (b.state === 'in' ? 0 : 1) || a.date - b.date);
        this.games = keep.slice(0, 12); this.at = Date.now(); this.busy = null;
        return this.games;
      })();
      return this.busy;
    },
    // a channel in the user's playlists that shows this game
    norm: (s) => String(s || '').toLowerCase().replace(/^[a-z]{2,3}\s*[:|\-]\s*/, '').replace(/\b(hd|fhd|uhd|4k|sd|east|west|usa|us)\b/g, '').replace(/[^a-z0-9+]+/g, ' ').trim(),
    channelFor(g) {
      try {
        if (typeof Channels === 'undefined' || !Channels.all) return null;
        const all = Channels.all(); if (!all || !all.length) return null;
        for (const n of g.nets) { const k = this.norm(n); if (!k) continue; const ch = all.find((c) => { const m = this.norm(c.name); return m === k || m.startsWith(k + ' '); }); if (ch) return { ch, net: n }; }
      } catch (e) { /* no playlists */ }
      return null;
    },
    when(g) {
      if (g.state === 'in') return { big: 'Live', small: g.detail };
      const m = Math.max(0, Math.round((g.date - Date.now()) / 60000));
      const big = m < 1 ? 'Now' : m < 60 ? `${m}m` : m < 24 * 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : new Date(g.date).toLocaleDateString(undefined, { weekday: 'short' });
      return { big, small: this.day(g) };
    },
    day(g) {
      const d = new Date(g.date), t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      const today = new Date(); const tm = new Date(today); tm.setDate(today.getDate() + 1);
      const same = (a, b) => a.toDateString() === b.toDateString();
      return `${same(d, today) ? 'Today' : same(d, tm) ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' })} · ${t}`;
    },
    logo: (t, cls) => t.logo ? `<img class="${cls}" src="${esc(t.logo)}" alt="" loading="lazy" decoding="async" data-gone>` : `<span class="${cls} lh-noimg">${esc(t.abbr)}</span>`,
    feature(g) {
      const w = this.when(g), hit = this.channelFor(g), c1 = `#${g.away.color}`, c2 = `#${g.home.color}`;
      const live = g.state === 'in';
      return `<div class="lh-feat" style="--c1:${esc(c1)};--c2:${esc(c2)}">
        <div class="lh-team"><span class="lh-logo-wrap">${this.logo(g.away, 'lh-logo')}</span><small>${esc(g.away.loc)}</small><b>${esc(g.away.name)}</b><em>${live ? esc(g.away.score) : esc(g.away.rec)}</em></div>
        <div class="lh-mid"><span class="lh-league">${esc(g.short)}</span><span class="lh-k">${live ? '<i class="lh-dot"></i>Live now' : 'Starts in'}</span><b class="lh-count">${esc(w.big)}</b><span class="lh-when">${esc(w.small)}</span>
          <div class="lh-acts">${hit ? `<button type="button" class="btn btn-bolt lh-watch" data-nav data-lhwatch><i data-lucide="play"></i>Watch on ${esc(hit.net)}</button>` : g.nets.length ? `<span class="lh-on">Airs on ${esc(g.nets.slice(0, 3).join(', '))}</span>` : ''}</div></div>
        <div class="lh-team"><span class="lh-logo-wrap">${this.logo(g.home, 'lh-logo')}</span><small>${esc(g.home.loc)}</small><b>${esc(g.home.name)}</b><em>${live ? esc(g.home.score) : esc(g.home.rec)}</em></div>
        ${g.venue ? `<span class="lh-venue">${esc(g.venue)}</span>` : ''}</div>`;
    },
    row(g, i) {
      const live = g.state === 'in';
      return `<button type="button" class="lh-g${i === this.pick ? ' on' : ''}" data-nav data-lhg="${i}"><span class="lh-gl">${esc(g.short)}</span><span class="lh-gr">
        <span class="lh-gt">${this.logo(g.away, 'lh-sl')}${esc(g.away.abbr)}</span><span class="lh-gm">${live ? `<i class="lh-dot"></i>${esc(g.away.score)}-${esc(g.home.score)}` : esc(new Date(g.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))}<small>${live ? esc(g.detail) : esc(this.day(g).split(' · ')[0])}</small></span><span class="lh-gt r">${esc(g.home.abbr)}${this.logo(g.home, 'lh-sl')}</span></span></button>`;
    },
    switcher(view) {
      return `<div class="segc lh-sw" role="tablist" aria-label="Live" data-nav-band><button type="button" role="tab" data-nav data-lhv="tv" class="${view === 'tv' ? 'on' : ''}" aria-selected="${view === 'tv'}"><i data-lucide="radio-tower"></i>Channels</button><button type="button" role="tab" data-nav data-lhv="sports" class="${view === 'sports' ? 'on' : ''}" aria-selected="${view === 'sports'}"><i data-lucide="trophy"></i>Sports in your sources</button></div>`;
    },
    host() { return q('#view-tv.on') ? 'tv' : q('#view-sports.on') ? 'sports' : ''; },
    async show() {
      const v = this.host(); if (!v) { clearInterval(this.tick); this.tick = 0; return; }
      const sec = q(`#view-${v}`); let el = q('#lhHub');
      if (!el) { el = document.createElement('div'); el.id = 'lhHub'; el.className = 'lh'; }
      if (el.parentElement !== sec) sec.insertBefore(el, sec.firstChild);
      document.documentElement.classList.add('lh-on');
      const kids = this.kids();
      el.innerHTML = `${kids ? '' : '<div class="lh-top" aria-live="polite"><div class="lh-feat lh-wait"></div><div class="lh-list"></div></div>'}${this.switcher(v)}`;
      this.bindSw(el); paint();
      if (kids) return;
      const games = await this.load();
      if (!games.length) { const t = q('.lh-top', el); if (t) t.remove(); return; }
      this.draw();
      if (!this.tick) this.tick = setInterval(() => { if (!this.host()) { clearInterval(this.tick); this.tick = 0; return; } if (Date.now() - this.at > this.TTL) this.load(true).then(() => this.draw()); else this.drawCount(); }, 30000);
    },
    draw() {
      const el = q('#lhHub .lh-top'); if (!el || !this.games.length) return;
      if (this.pick >= this.games.length) this.pick = 0;
      const g = this.games[this.pick];
      el.innerHTML = `${this.feature(g)}<div class="lh-list"><div class="lh-lh"><b>Up next</b><span>${this.games.length}</span></div><div class="lh-scroll">${this.games.map((x, i) => this.row(x, i)).join('')}</div></div>`;
      paint();
      qa('[data-lhg]', el).forEach((b) => b.addEventListener('click', () => { this.pick = +b.dataset.lhg; this.draw(); }));
      const w = q('[data-lhwatch]', el); if (w) w.addEventListener('click', () => { const hit = this.channelFor(g); if (hit) try { Channels.tune(hit.ch); } catch (e) { toast('That channel did not start', 'err'); } });
    },
    drawCount() { const g = this.games[this.pick], c = q('#lhHub .lh-count'); if (g && c) c.textContent = this.when(g).big; },
    bindSw(el) { qa('[data-lhv]', el).forEach((b) => b.addEventListener('click', () => { if (!b.classList.contains('on')) go(b.dataset.lhv); })); },
    init() {
      if (tv() && !q('#view-tv')) return;
      const sync = () => {
        const v = this.host();
        // one place in the bar: Sports lives inside Live TV
        const tvTab = q('#tabs .tab[data-view="tv"]'); if (tvTab) tvTab.classList.toggle('on', v === 'tv' || v === 'sports');
        qa('#mtabs [data-view="tv"]').forEach((b) => b.classList.toggle('on', v === 'tv' || v === 'sports'));
        if (v) this.show(); else document.documentElement.classList.remove('lh-on');
      };
      let t = 0; const later = () => { clearTimeout(t); t = setTimeout(sync, 30); };
      qa('.view').forEach((s) => new MutationObserver(later).observe(s, { attributes: true, attributeFilter: ['class'] }));
      // a view added later (Sports is added by its own block)
      const main = q('main .wrap') || q('main'); if (main) new MutationObserver(() => { qa('.view').forEach((s) => { if (!s._lh) { s._lh = 1; new MutationObserver(later).observe(s, { attributes: true, attributeFilter: ['class'] }); } }); }).observe(main, { childList: true });
      qa('.view').forEach((s) => { s._lh = 1; });
      sync();
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => H.init(), { once: true }); else H.init();
})();
