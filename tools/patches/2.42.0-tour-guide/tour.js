/* ---------------- 2.42.0 Welcome tour, redesigned ----------------
   Six steps: welcome, how you watch (2.26.0 PlayerAsk), what's inside, coming from Stremio (2.28.0), favorites, ready.
   Nothing in the tour ever scrolls. After a step renders it is measured; if it does not fit, #tourBody steps down
   through compact levels (f1 to f3) and, as a last resort, the step is scaled to fit. The favorites step shows only
   the posters that fit and pages through the rest with Show others. The 2.38.1 TV remote rules stay as they are. */
const Tour240 = {
  CHAPTER: { welcome: 'Welcome', player: 'Your player', inside: 'What’s inside', stremio: 'From Stremio', taste: 'Your taste', ready: 'Ready' },
  feats() {
    return [
      ['Watch', [
        ['wand-sparkles', 'Smart Play', 'Picks the best source and switches if one stalls.'],
        ['languages', 'Subtitles in your language', 'One list from all your addons, translated when yours is missing.'],
        ['text-search', 'Find a line', 'Type words someone says and play from that moment.'],
      ]],
      ['Discover', [
        ['sparkles', 'Your Picks', 'Recommendations made on this device. Your taste never leaves it.'],
        ['orbit', 'Universes', 'Franchises from Marvel to Middle-earth, in release order.'],
        ['clapperboard', 'Anime and Sports', 'Their own sections, filled by your addons.'],
      ]],
      ['Together', [
        ['users', 'Watch party', 'Watch in sync with friends, with voice chat.'],
        ['smartphone', 'Phone remote', 'Scan a code and your phone runs the TV.'],
        ['armchair', 'Seats for the house', 'Profiles with PINs, and kids seats by age rating.'],
      ]],
    ];
  },
  also() {
    return [IS_TV ? '' : 'Downloads in the Android and Windows apps', 'Plex and Jellyfin', IS_TV ? '' : 'Sharp upscaling', 'Couch match', 'Four looks'].filter(Boolean).join(' · ');
  },
  welcome() {
    return `<div class="tw">
      <div class="tw-mark">${$('.brand svg.mk') ? $('.brand svg.mk').outerHTML : ''}</div>
      <span class="tw-kicker">Welcome to</span>
      <h2 class="tw-name">MKCinema</h2>
      <p class="tw-tag">Every source. One cinema.</p>
      <span class="tw-rule"></span>
      <p class="tw-lede">Bring the addons you trust and MKCinema turns them into one private cinema. It picks the best source, plays it here or in the player you like, and follows you to every screen.</p>
      <div class="tw-pillars">${[['Library', 'Every addon you choose'], ['Privacy', 'No ads. No cookies, no profiles.'], ['Everywhere', 'Phone, tablet, PC and TV']].map(([k, t]) => `<div><small>${k}</small><b>${t}</b></div>`).join('')}</div>
      <span class="t4-free"><i data-lucide="infinity" aria-hidden="true"></i>Free forever. Nothing to pay, now or later.</span>
    </div>`;
  },
  inside() {
    let k = 0;
    return `<div class="tw-sec"><span class="tw-kicker">What’s inside</span><h2 class="tw-h">Made for movie night</h2>
      <div class="t4-in">${this.feats().map(([h, list]) => `<div class="t4-col"><small>${h}</small>${list.map(([i, t, d]) => `<div class="t4-f" style="--k:${k++}"><span class="t4-ic"><i data-lucide="${i}" aria-hidden="true"></i></span><div><b>${t}</b><span>${d}</span></div></div>`).join('')}</div>`).join('')}</div>
      <p class="t4-also"><b>Also</b>${this.also()}</p></div>`;
  },
  taste() {
    return `<div class="tw-sec"><span class="tw-kicker">Make it yours</span><h2 class="tw-h">Pick three favorites</h2><p class="t4-sub">Shows, movies or genres. Your Picks row is built from them, on this device.</p></div><div id="tourPick"></div>`;
  },
  ready() {
    const go = (attr, icon, t, d, prime) => `<button type="button" class="t4-go${prime ? ' prime' : ''}" ${attr} data-nav><span class="t4-ic"><i data-lucide="${icon}" aria-hidden="true"></i></span><b>${t}</b><span>${d}</span></button>`;
    return `<div class="tour-hero tw tw-end"><span class="tw-kicker">You’re set</span><h2 class="tw-name">Enjoy the show</h2><span class="tw-rule"></span>
      <div class="t4-go-list">
        ${go('data-tour-guide', 'compass', 'Get started', 'Pick a player, add your first addons and connect a service if you use one.', true)}
        ${go('data-tour-addons', 'puzzle', 'Add addons', 'Paste a link from an addon you trust, or browse the community directory.')}
        ${go('data-tour-end', 'play', 'Start watching', 'Go straight to Home. Get started stays in Settings.')}
      </div>
      <p class="t4-tip">${Voice.ok ? 'Tap the mic in search to search by voice. ' : ''}Replay this tour any time from Settings.</p></div>`;
  },
  // --- fit: no scrolling, ever ---
  fit() {
    const b = $('#tourBody'), st = b && b.firstElementChild; if (!st || $('#tour').hidden) return;
    st.style.transform = ''; st.style.marginBottom = ''; st.style.flex = ''; st.style.height = '';
    const taste = st.dataset.step === 'taste';
    const over = () => b.scrollHeight > b.clientHeight + 1 || (taste && this.tasteOver());
    let lv = 0; const set = () => { for (let i = 1; i <= 3; i++) b.classList.toggle(`f${i}`, lv >= i); if (taste) this.tasteFit(); };
    set();
    while (lv < 3 && over()) { lv++; set(); }
    if (b.scrollHeight > b.clientHeight + 1) {
      const h = Math.max(st.offsetHeight, st.scrollHeight), s = Math.max(0.5, (b.clientHeight - 4) / h);
      st.style.flex = 'none'; st.style.height = `${h}px`;
      st.style.transform = `scale(${s.toFixed(4)})`; st.style.marginBottom = `${-Math.ceil(h * (1 - s))}px`;
    }
    b.scrollTop = 0; const m = $('#tour .tour-modal'); if (m) m.scrollTop = 0; $('#tour').scrollTop = 0;
  },
  queue() { cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(() => this.fit()); },
  // favorites: the fixed parts must fit before the poster grid gets the rest
  tasteOver() { const g = $('#qpGrid'); return !!g && g.clientHeight < 150; },
  page: 0,
  tasteFit() {
    const g = $('#qpGrid'); if (!g) return;
    const kids = [...g.children].filter((x) => !x.classList.contains('qp-empty'));
    kids.forEach((x) => { x.hidden = false; });
    if (!kids.length) { this.moreBtn(false); return; }
    // size the posters so whole rows fill the space: the biggest posters that still show about a dozen titles
    g.style.gridTemplateColumns = ''; g.style.minHeight = ''; g.classList.remove('qp-nolab');
    const cs = getComputedStyle(g), gap = parseFloat(cs.columnGap) || 10, W = g.clientWidth, H = g.clientHeight;
    const r0 = kids[0].getBoundingClientRect(), lab = Math.max(0, r0.height - r0.width * 1.5);
    const maxW = IS_TV ? 170 : 150, minW = 64, want = Math.min(12, kids.length); let best = null;
    for (let r = 1; r <= 6; r++) {
      const row = (H - (r - 1) * gap) / r; let w = (row - lab) / 1.5, nl = false;
      if (w < 84) { w = row / 1.5; nl = true; } // small posters drop their titles; the art carries the name
      w = Math.min(maxW, w); if (w < minW) break;
      const c = Math.max(1, Math.floor((W + gap) / (w + gap))), n = c * r, o = { c, r, w, n, nl };
      if (!best || (best.n < want && n > best.n) || (n >= want && best.n >= want && w > best.w)) best = o;
    }
    // not even one row fits: keep one whole row (never a cut poster) and let the step scale down instead
    if (!best) { best = { c: Math.max(1, Math.floor((W + gap) / (minW + gap))), r: 1, w: minW, nl: true }; g.style.minHeight = `${Math.ceil(minW * 1.5)}px`; }
    g.classList.toggle('qp-nolab', !!best.nl); g.style.gridTemplateColumns = `repeat(${best.c}, ${Math.floor(best.w)}px)`;
    const cap = best.c * best.r;
    const pages = Math.max(1, Math.ceil(kids.length / cap)); if (this.page >= pages) this.page = 0;
    kids.forEach((x, i) => { x.hidden = Math.floor(i / cap) !== this.page; });
    this.moreBtn(pages > 1);
  },
  moreBtn(on) {
    const foot = $('#tourPick .qp-foot'); if (!foot) return;
    let m = $('.t4-more', foot);
    if (!m) {
      foot.insertAdjacentHTML('afterbegin', '<button class="btn btn-ghost btn-sm t4-more" type="button" aria-label="Show others" data-nav><i data-lucide="shuffle"></i><span class="t4-ml">Show others</span></button>');
      m = $('.t4-more', foot); icons();
      m.onclick = () => { this.page++; this.tasteFit(); };
    }
    m.hidden = !on;
  },
  // --- steps, top bar, background ---
  init() {
    const by = (id) => TOUR.find((s) => s.id === id);
    const player = by('player'), stremio = by('stremio');
    const steps = [
      { id: 'welcome', html: () => this.welcome() },
      player,
      { id: 'inside', html: () => this.inside() },
      stremio,
      { id: 'taste', html: () => this.taste(), after: async () => {
        this.page = 0; QP.onDone = () => tourGo(1);
        const root = $('#tourPick'); await quickPickHTML(root, { compact: true });
        const g = $('#qpGrid', root); if (g && !g._t4) { g._t4 = new MutationObserver(() => { this.page = 0; this.queue(); }); g._t4.observe(g, { childList: true }); }
        this.queue();
      } },
      { id: 'ready', html: () => this.ready() },
    ].filter(Boolean);
    TOUR.length = 0; steps.forEach((s) => TOUR.push(s));
    // 2.26.0 player step: name the player apps this device supports, without singling one out
    if (typeof PlayerAsk !== 'undefined' && !PlayerAsk._t4) {
      PlayerAsk._t4 = true; const ph = PlayerAsk.html.bind(PlayerAsk);
      const apps = () => playersHere().filter((p) => !p.m3u && p.id !== 'android').map((p) => playerName(p)).filter((x, i, a) => a.indexOf(x) === i);
      PlayerAsk.html = () => { const n = apps(); return ph()
        .replace('and VLC is always one tap away.', 'and a player app is always one tap away.')
        .replace('Opens streams in VLC, Infuse or MX Player. VLC is free and plays nearly everything.', n.length ? `Opens streams in ${n.length > 1 ? `${n.slice(0, -1).join(', ')} or ${n[n.length - 1]}` : n[0]}, which play nearly every file.` : 'Opens streams in the player app you already use. Most play nearly every file.'); };
    }
    const tour = $('#tour'); if (!tour) return;
    if (!$('.t4-glow', tour)) tour.insertAdjacentHTML('afterbegin', '<div class="t4-glow" aria-hidden="true"></div>');
    const top = $('.tour-top', tour); if (top && !$('#t4Count', top)) top.insertAdjacentHTML('afterbegin', '<span class="t4-count" id="t4Count"><b></b><em></em></span>');
    const render = window.renderTour;
    window.renderTour = () => {
      render();
      const st = TOUR[tourIdx] || {}, solo = typeof PlayerAsk !== 'undefined' && PlayerAsk.solo, c = $('#t4Count');
      if (c) { c.style.visibility = solo ? 'hidden' : ''; $('b', c).textContent = `${String(tourIdx + 1).padStart(2, '0')} / ${String(TOUR.length).padStart(2, '0')}`; $('em', c).textContent = this.CHAPTER[st.id] || ''; }
      tour.style.setProperty('--t4x', `${((tourIdx / Math.max(1, TOUR.length - 1)) - 0.5) * 36}vw`);
      if (st.id === 'taste') $('#tourNext').innerHTML = 'Skip for now<i data-lucide="chevron-right"></i>';
      icons(); this.fit(); this.queue(); setTimeout(() => this.fit(), 260);
      // TV: the ready step starts on Get started, not on Skip
      if (IS_TV && st.id === 'ready') setTimeout(() => { const g = $('#tourBody .t4-go.prime'); if (g && g.isConnected && !tour.hidden) Nav.focus(g, true); }, 80);
    };
    // TV remote on the favorites step: Up and Down walk whole rows (genres, search, posters, buttons, Back and Next)
    // and land on the item closest across, so no row of posters is jumped over
    if (IS_TV) addEventListener('keydown', (e) => {
      const vert = e.key === 'ArrowUp' || e.key === 'ArrowDown', side = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if ((!vert && !side) || tour.hidden || (side && document.activeElement && document.activeElement.tagName === 'INPUT')) return;
      const b = $('#tourBody'), st = b && b.firstElementChild; if (!st || st.dataset.step !== 'taste') return;
      const a = document.activeElement; if (!a || !tour.contains(a)) return;
      const els = [...$$('.qp-g, #qpSearch, .qp-mic, .qp-t, .qp-foot button', b), $('#tourBack'), $('#tourNext')].filter((x) => {
        if (!x || x.disabled || x.hidden || x.closest('[hidden]') || x.style.visibility === 'hidden') return false;
        const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0;
      });
      const rows = []; els.map((x) => ({ x, r: x.getBoundingClientRect() })).sort((p, q) => p.r.top - q.r.top).forEach((o) => {
        const last = rows[rows.length - 1]; if (last && Math.abs(last.top - o.r.top) < 12) last.items.push(o); else rows.push({ top: o.r.top, items: [o] });
      });
      const i = rows.findIndex((row) => row.items.some((o) => o.x === a)); if (i < 0) return;
      if (side) { // Left and Right stay in the row; at its end nothing moves
        e.preventDefault(); e.stopImmediatePropagation();
        const row = rows[i].items.sort((p, q) => p.r.left - q.r.left), j = row.findIndex((o) => o.x === a), n = row[j + (e.key === 'ArrowRight' ? 1 : -1)];
        if (n) Nav.focus(n.x, true); return;
      }
      const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
      e.preventDefault(); e.stopImmediatePropagation();
      if (!next) { if (e.key === 'ArrowUp') Nav.focus($('#tourSkip'), true); return; }
      const ar = a.getBoundingClientRect(), cx = ar.left + ar.width / 2;
      const t = next.items.reduce((m, o) => (Math.abs(o.r.left + o.r.width / 2 - cx) < Math.abs(m.r.left + m.r.width / 2 - cx) ? o : m));
      Nav.focus(t.x, true);
    }, true);
    // the layer and the page under it stay still while the tour is open
    new MutationObserver(() => document.documentElement.classList.toggle('t4-open', !tour.hidden)).observe(tour, { attributes: true, attributeFilter: ['hidden'] });
    const body = $('#tourBody');
    body.addEventListener('scroll', () => { if (body.scrollTop) body.scrollTop = 0; }, { passive: true });
    tour.addEventListener('scroll', () => { if (tour.scrollTop) tour.scrollTop = 0; }, { passive: true });
    tour.addEventListener('wheel', (e) => { if (!e.target.closest('input, textarea, select')) e.preventDefault(); }, { passive: false });
    addEventListener('resize', () => { if (!tour.hidden) this.queue(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!tour.hidden) this.queue(); });
    // a choice that opens more options (another player app, Only sources that play here) re-measures the step
    body.addEventListener('click', () => setTimeout(() => this.queue(), 0));
    body.addEventListener('load', () => this.queue(), true);
  },
};
try { Tour240.init(); } catch (e) { console.warn('Tour 2.40:', e); }
