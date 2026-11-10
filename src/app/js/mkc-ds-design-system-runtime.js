
/* Design system runtime: one first-run card per session, the taste question inside the tour, keyboard-ready cards,
   look-matched glow, the phone More tab, the top-menu wordmark, the Early access badge and the browser offline notice */
(function () {
  'use strict';
  const q = (s, r) => (r || document).querySelector(s), qa = (s, r) => Array.from((r || document).querySelectorAll(s));
  const safe = (n, f) => { try { f(); } catch (e) { try { MKLog.add('error', `ds ${n}: ${e.message}`); } catch (_) { /* no log */ } console.warn('ds', n, e); } };

  /* ---- one first-run card per session ---- */
  const Gate = window.MKPrompt = {
    K: 'mkc:prompt1', mem: '',
    cur() { try { return sessionStorage.getItem(this.K) || this.mem; } catch (e) { return this.mem; } },
    free(n) { const c = this.cur(); return !c || c === n; },
    take(n) { if (!this.free(n)) return false; this.mem = n; try { sessionStorage.setItem(this.K, n); } catch (e) { /* memory only */ } return true; },
  };
  const FOCUS = [['movies-first', 'Movies'], ['series-first', 'Series'], ['both', 'Both']];
  const tasteStep = () => {
    const st = (typeof TOUR !== 'undefined' ? TOUR : []).find((s) => s && s.id === 'taste');
    if (!st || st._ds) return; st._ds = true;
    const h = st.html, a = st.after;
    st.html = function () {
      const out = h.apply(this, arguments);
      if (Store.get('askedFocus', false) && !st._dsKeep) return out;
      st._dsKeep = true;
      const cur = (Store.get('homeLayout', null) || {}).focus;
      const row = `<div class="ds-focus" role="group" aria-label="What do you watch most?"><span>I mostly watch</span>${FOCUS.map(([v, l]) => `<button type="button" class="chip${cur === v ? ' on' : ''}" data-nav data-dsf="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
      return out.includes('<div id="tourPick">') ? out.replace('<div id="tourPick">', `${row}<div id="tourPick">`) : out + row;
    };
    st.after = function () {
      const r = a ? a.apply(this, arguments) : undefined;
      qa('#tour [data-dsf]').forEach((b) => b.addEventListener('click', () => {
        try { Layout.set({ focus: b.dataset.dsf }); } catch (e) { /* layout unchanged */ }
        Store.set('askedFocus', true);
        qa('#tour [data-dsf]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      }));
      return r;
    };
  };
  safe('tour', () => {
    tasteStep();
    const ot = window.openTour;
    if (typeof ot === 'function' && !ot._ds) {
      window.openTour = function () { tasteStep(); if (!Store.get('toured', false)) Gate.take('tour'); return ot.apply(this, arguments); };
      window.openTour._ds = true;
    }
  });
  safe('nav', () => {
    if (typeof SideNav === 'undefined' || SideNav.chooser._ds) return;
    const ch = SideNav.chooser;
    SideNav.chooser = function () {
      if (!Gate.take('nav')) { if (this.fresh) try { localStorage.setItem('mkc:dsNavFresh', '1'); } catch (e) { /* asks as new */ } return; }
      try { if (localStorage.getItem('mkc:dsNavFresh')) { this.fresh = true; localStorage.removeItem('mkc:dsNavFresh'); } } catch (e) { /* fine */ }
      return ch.apply(this, arguments);
    };
    SideNav.chooser._ds = true;
  });
  safe('player', () => {
    if (typeof PlayerAsk === 'undefined' || PlayerAsk.openSolo._ds) return;
    const os = PlayerAsk.openSolo;
    PlayerAsk.openSolo = function () { if (!Gate.take('player')) return; return os.apply(this, arguments); };
    PlayerAsk.openSolo._ds = true;
  });
  safe('whatsnew', () => {
    if (typeof WhatsNew === 'undefined' || WhatsNew.open._ds) return;
    const op = WhatsNew.open;
    WhatsNew.open = function (prev) {
      // another card already showed this session: keep the update for the next launch
      if (!Gate.take('whatsnew')) { try { Store.raw.set(this.KEY, prev || ''); } catch (e) { /* shown next update */ } return; }
      return op.apply(this, arguments);
    };
    WhatsNew.open._ds = true;
  });
  safe('focus', () => {
    if (typeof Layout === 'undefined' || Layout.ask._ds) return;
    const la = Layout.ask;
    Layout.ask = function () { if (Store.get('askedFocus', false) || Store.get('homeLayout', null) || !Gate.free('focus')) return; return la.apply(this, arguments); };
    Layout.ask._ds = true;
  });
  safe('support', () => {
    if (typeof Support === 'undefined' || Support.maybe._ds) return;
    const sm = Support.maybe;
    Support.maybe = function () { if (!Gate.free('support')) return; return sm.apply(this, arguments); };
    Support.maybe._ds = true;
  });
  // the two small cards are added straight to the page: claim the session's slot, or wait for the next launch
  safe('cards', () => new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1 || !n.classList) return;
    const k = n.classList.contains('sup-ask') ? 'support' : n.classList.contains('focus-ask') ? 'focus' : '';
    if (!k || Gate.take(k)) return;
    n.remove();
    if (k === 'focus') Store.set('askedFocus', false);
    else { const st = Store.get('support', null); if (st) { st.at = 0; Store.set('support', st); } }
    if (typeof IS_TV !== 'undefined' && IS_TV) { try { tvBackHook(); Nav.settle(); } catch (e) { /* focus stays */ } }
  }))).observe(document.body, { childList: true }));

  /* ---- cards and Reveal work from the keyboard (Space as well as Enter) ---- */
  document.addEventListener('keydown', (e) => {
    const t = e.target; if (!t || !t.matches) return;
    if (e.key === 'Enter' && t.matches('[data-reveal]')) { e.preventDefault(); e.stopPropagation(); t.click(); return; }
    if (e.key !== ' ' && e.key !== 'Spacebar') return;
    if (!t.matches('[data-card],[data-bm],[data-reveal]')) return;
    e.preventDefault(); e.stopPropagation(); t.click();
  }, true);

  /* ---- trailer glow takes its colours from the look ---- */
  safe('mood', () => {
    if (typeof moodFor !== 'function') return;
    window.moodFor = function () {
      const cs = getComputedStyle(document.documentElement);
      const a = (cs.getPropertyValue('--champ') || cs.getPropertyValue('--gold') || '').trim() || '#d9d4c7';
      const b = (cs.getPropertyValue('--s3') || '').trim() || '#19191c';
      return [a, b];
    };
  });

  /* ---- phone tab bar: at most five, the rest behind More ---- */
  const MORE_SVG = '<svg class="ds-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
  const KEEP = ['home', 'movie', 'series', 'anime', 'library'];
  const Tabs = {
    fit() {
      const bar = q('#mtabs'); if (!bar) return;
      const all = qa('[data-view]', bar);
      let more = q('[data-dsmore]', bar);
      if (all.length <= 5) { all.forEach((b) => b.classList.remove('ds-hide')); if (more) more.hidden = true; return; }
      const keep = KEEP.filter((v) => all.some((b) => b.dataset.view === v)).slice(0, 4);
      all.forEach((b) => b.classList.toggle('ds-hide', !keep.includes(b.dataset.view)));
      if (!more) {
        bar.insertAdjacentHTML('beforeend', `<button type="button" data-nav data-dsmore aria-label="More sections">${MORE_SVG}<span>More</span></button>`);
        more = q('[data-dsmore]', bar);
        more.addEventListener('click', () => { try { SideNav.open(); } catch (e) { /* drawer missing */ } });
      }
      more.hidden = false;
      const on = all.some((b) => b.classList.contains('ds-hide') && b.classList.contains('on'));
      if (more.classList.contains('on') !== on) more.classList.toggle('on', on);
    },
    init() {
      const bar = q('#mtabs'); if (!bar) return;
      let t = 0; const later = () => { clearTimeout(t); t = setTimeout(() => safe('tabs', () => this.fit()), 30); };
      new MutationObserver((ms) => { if (ms.some((m) => m.type === 'childList' || (m.target.dataset && m.target.dataset.view))) later(); })
        .observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      this.fit();
    },
  };
  safe('tabs', () => Tabs.init());

  /* ---- top menu: show the wordmark (and the badge) whenever they fit ---- */
  safe('dock', () => {
    if (typeof DockFit === 'undefined' || DockFit.run._ds) return;
    const dr = DockFit.run;
    DockFit.run = function () {
      const b = document.body; b.classList.remove('ds-w', 'ds-nob');
      const r = dr.apply(this, arguments);
      safe('dockfit', () => {
        const de = document.documentElement; if (innerWidth <= 860 || de.classList.contains('nav-side') || de.classList.contains('tv') || de.dataset.look === 'anime') return;
        if (b.classList.contains('dk2')) { if (this.over()) b.classList.add('ds-nob'); return; }
        if (b.classList.contains('dkw')) return;
        const word = q('.dock .brand .word'); if (!word) return;
        if (getComputedStyle(word).display !== 'none') { if (this.over()) b.classList.add('ds-nob'); return; }
        b.classList.add('ds-w'); if (!this.over()) return;
        b.classList.add('ds-nob'); if (this.over()) b.classList.remove('ds-w', 'ds-nob');
      });
      return r;
    };
    DockFit.run._ds = true;
    DockFit.run();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => DockFit.run());
  });

  /* ---- Early access in the phone menu drawer ---- */
  const BADGE = '<span class="ea-badge" aria-hidden="true">Early access</span>';
  safe('drawer', () => {
    if (typeof SideNav === 'undefined' || SideNav.open._dsb) return;
    const so = SideNav.open;
    SideNav.open = function () {
      const r = so.apply(this, arguments);
      safe('drawer badge', () => { const w = q('#sideDrawer .sd-word'); if (w && !q('.ea-badge', w)) { w.insertAdjacentHTML('beforeend', BADGE); w.parentNode.setAttribute('aria-label', 'MKCinema, early access'); } });
      return r;
    };
    SideNav.open._dsb = true;
  });
  // the collapsed rail's dot sits on the logo's top-right edge
  safe('dot', () => {
    const place = () => { const br = q('.dock .brand'), mk = br && q('svg.mk', br); if (!mk) return; const a = br.getBoundingClientRect(), m = mk.getBoundingClientRect(); if (!m.width) return; br.style.setProperty('--ea-dot-x', `${Math.round(m.right - a.left - 6)}px`); br.style.setProperty('--ea-dot-y', `${Math.round(m.top - a.top - 1)}px`); };
    if (document.documentElement.classList.contains('side-mini')) { setTimeout(place, 600); addEventListener('resize', () => setTimeout(place, 100)); }
  });

  /* ---- offline notice for every browser (apps with downloads already have their own) ---- */
  safe('offline', () => {
    if (typeof Offline !== 'undefined' && Offline.api) return;
    const bar = document.createElement('div'); bar.id = 'dsOffline'; bar.className = 'ds-off'; bar.setAttribute('role', 'status'); bar.hidden = true;
    bar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h.01"/><path d="M8.5 16.4a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8"/><path d="M19 12.9a10 10 0 0 0-2.3-1.7"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M22 8.8a15 15 0 0 0-11.3-3.8"/><path d="m2 2 20 20"/></svg><div><b>You’re offline.</b> <span>Films and shows need a connection. Your lists and settings still open.</span></div>';
    document.body.appendChild(bar);
    const set = (off) => { bar.hidden = !off; };
    addEventListener('offline', () => set(true));
    addEventListener('online', () => { if (!bar.hidden) { set(false); try { toast('Back online', 'ok', 2500, 'offline'); } catch (e) { /* quiet */ } } });
    if (navigator.onLine === false) set(true);
  });
})();
