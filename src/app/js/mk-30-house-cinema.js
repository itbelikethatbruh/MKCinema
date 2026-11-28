'use strict';
/* 3.0 house cinema */
/* ---------------- 3.0 Player: your buttons, hold for 2x, Headphones, your own keys, Previously on ----------------
   1) BtnPick (Settings › Playback › Player buttons): hide any of the optional player buttons and choose their order.
      Pure CSS (display and flex order), so the buttons' code and their keyboard keys are untouched.
   2) Hold2x: on computers, holding the left mouse button on the picture plays at 2x until it is let go.
   3) Headphones (a Sound mode): surround is folded to two channels and each ear hears a little of the other side,
      softened and 0.3 ms late, the way speakers in a room sound. Native players get the same through mpv
      (crossfeed) in the next Windows and Android app builds; older apps keep the Original sound.
   4) MyKeys (Settings › Shortcuts › Change keys): any player key can be moved to another key.
   5) Recap: starting an episode after four days or more away from a series shows "Previously on" with the last
      episode's summary for a few seconds while it starts. Never pauses anything. */
const BtnPick = {
  LIST: [['pmBack', 'Back 10 s', 'rotate-ccw'], ['pmFwd', 'Forward 10 s', 'rotate-cw'], ['pxSpeed', 'Speed', 'gauge'], ['rxPic', 'Picture', 'image'], ['pSubs', 'Audio & subtitles', 'captions'],
    ['pSrcBtn', 'Sources', 'layers'], ['pEpsBtn', 'Episodes', 'list'], ['pNext', 'Next episode', 'skip-forward'], ['rxSleep', 'Sleep timer', 'moon'], ['pMute', 'Sound and volume', 'volume-2'], ['pOpts', 'Settings', 'settings-2'],
    ['pMini', 'Keep playing in a corner', 'minimize-2'], ['pPip', 'Picture in picture', 'picture-in-picture-2'], ['pCast', 'Phone', 'smartphone'], ['pParty', 'Watch party', 'users'],
    ['pDev', 'Share and other screens', 'cast'], ['pFull', 'Fullscreen', 'maximize'], ['pLock', 'Lock controls', 'lock']],
  st() { const v = Store.raw.get('mkBtns', null); return v && typeof v === 'object' ? { hide: Array.isArray(v.hide) ? v.hide : [], order: Array.isArray(v.order) ? v.order : [] } : { hide: [], order: [] }; },
  save(v) { Store.raw.set('mkBtns', v); this.apply(); },
  ids() { return this.LIST.map((x) => x[0]); },
  all() { const ids = this.ids(), o = this.st().order.filter((id) => ids.includes(id)); return [...o, ...ids.filter((id) => !o.includes(id))]; },
  /* the piece that moves: the volume button moves with its slider */
  item(id) { const b = document.getElementById(id); if (!b || !b.closest('#hud')) return null; return b.parentElement && b.parentElement.id === 'rxVol' ? b.parentElement : b; },
  idOf(el) { if (!el) return ''; if (el.id === 'rxVol') return 'pMute'; return el.id || ''; },
  where(id) { const el = this.item(id), p = el && el.parentElement; if (!p || p.id === 'rxPark' || p.closest('#rxPark')) return ''; return p.closest('.hud-top') ? 'top' : p.closest('.hud-bot') ? 'bot' : p.id === 'hudMid' ? 'mid' : ''; },
  apply() {
    let el = document.getElementById('mkBtnCss'); if (!el) { el = document.createElement('style'); el.id = 'mkBtnCss'; document.head.appendChild(el); }
    const v = this.st(), ids = this.ids();
    el.textContent = v.hide.filter((id) => ids.includes(id)).map((id) => `#hud #${id}${id === 'pMute' ? ',#hud #rxVol' : ''}{display:none!important}`).join('');
    const all = this.all(), parents = new Set(ids.map((id) => this.item(id)).filter(Boolean).map((x) => x.parentElement).filter(Boolean));
    parents.forEach((p) => {
      const kids = [...p.children];
      if (!v.order.length) { kids.forEach((k) => { k.style.order = ''; }); return; }
      const mine = kids.filter((k) => all.includes(this.idOf(k))), slots = mine.map((k) => kids.indexOf(k));
      kids.forEach((k, i) => { k.style.order = String(i); });
      mine.sort((a, b) => all.indexOf(this.idOf(a)) - all.indexOf(this.idOf(b))).forEach((k, j) => { k.style.order = String(slots[j]); });
    });
  },
  open() {
    X8.layer('mkBtnPick', { label: 'Player buttons', icon: 'layout-grid', eyebrow: 'Player buttons' });
    const body = X8.body('mkBtnPick');
    const G = [['top', 'Top right'], ['mid', 'Middle'], ['bot', 'Bottom bar']];
    const paint = (focus) => {
      const v = this.st(), all = this.all(), name = (id) => this.LIST.find((x) => x[0] === id);
      const row = (id, i, n) => { const x = name(id), on = !v.hide.includes(id);
        return `<div class="mkb-row${on ? '' : ' off'}"><i data-lucide="${x[2]}"></i><span>${esc(x[1])}</span>
        <button class="ibtn" type="button" data-nav data-up="${id}" aria-label="Move earlier"${i ? '' : ' disabled'}><i data-lucide="arrow-up"></i></button><button class="ibtn" type="button" data-nav data-dn="${id}" aria-label="Move later"${i < n - 1 ? '' : ' disabled'}><i data-lucide="arrow-down"></i></button>
        <button class="switch ${on ? 'on' : ''}" type="button" role="switch" data-nav data-sw="${id}" aria-checked="${on}" aria-label="${esc(x[1])}"></button></div>`; };
      // the player is built on its first open: before that, every button is listed in one group
      const groups = G.map(([g, label]) => [label, all.filter((id) => this.where(id) === g)]).filter(([, l]) => l.length);
      const list = groups.length ? groups : [['Buttons', all]];
      body.innerHTML = `<h2 class="x8-h">Choose your player buttons</h2><p class="sc-p">Switch off what you never use and move the rest. Their keys keep working.</p>
        <div class="mkb-list">${list.map(([label, l]) => `<div class="set-group">${esc(label)}</div>${l.map((id, i) => row(id, i, l.length)).join('')}`).join('')}</div>
        <div class="x8-acts"><button class="btn btn-ghost btn-sm" type="button" data-nav id="mkbReset"><i data-lucide="rotate-ccw"></i>Back to the usual</button><button class="btn btn-prime btn-sm" type="button" data-nav data-x8close>Done</button></div>`;
      icons();
      body.querySelectorAll('[data-sw]').forEach((b) => { b.onclick = () => { const st = this.st(), id = b.dataset.sw; st.hide = st.hide.includes(id) ? st.hide.filter((x) => x !== id) : [...st.hide, id]; this.save(st); paint(`[data-sw="${id}"]`); }; });
      const mv = (id, d) => {
        const st = this.st(), a = this.all(), grp = list.find(([, l]) => l.includes(id))[1], i = grp.indexOf(id), other = grp[i + d]; if (!other) return;
        const x = a.indexOf(id), y = a.indexOf(other); [a[x], a[y]] = [a[y], a[x]]; st.order = a; this.save(st); paint(`[data-${d < 0 ? 'up' : 'dn'}="${id}"]`);
      };
      body.querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => mv(b.dataset.up, -1); });
      body.querySelectorAll('[data-dn]').forEach((b) => { b.onclick = () => mv(b.dataset.dn, 1); });
      $('#mkbReset').onclick = () => { this.save({ hide: [], order: [] }); paint('#mkbReset'); toast('Player buttons are back to the usual', 'info', 2200); };
      if (focus) { const f = body.querySelector(`${focus}:not([disabled])`) || body.querySelector(focus.replace(/data-(up|dn)/, 'data-sw')); if (f && (IS_TV || Nav.kb)) Nav.focus(f, true); else if (f) try { f.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
    };
    paint(); X8.open('mkBtnPick');
  },
};

const Hold2x = {
  init() {
    const pl = $('#player'); if (!pl) return;
    let t = 0, on = false, rate = 1, eat = 0, pill = null;
    const show = (v) => { if (!pill) { pill = document.createElement('div'); pill.className = 'mk-x2'; pill.setAttribute('aria-live', 'polite'); $('#stage').appendChild(pill); } pill.innerHTML = `<i data-lucide="fast-forward"></i>${v ? '2× speed' : ''}`; if (v) icons(); pill.classList.toggle('on', v); };
    const stop = () => { clearTimeout(t); t = 0; if (!on) return; on = false; try { video.playbackRate = rate; } catch (e) { /* ok */ } show(false); eat = performance.now(); };
    pl.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target !== video || CFG.hold2x === false || P.locked || video.paused) return;
      if (P.stream && (P.stream.ytId || (P.ctx && P.ctx.meta && P.ctx.meta._iptv))) return;
      clearTimeout(t); t = setTimeout(() => { if (video.paused) return; on = true; rate = video.playbackRate || 1; try { video.playbackRate = 2; } catch (x) { return; } show(true); }, 450);
    }, true);
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => pl.addEventListener(ev, stop, true));
    window.addEventListener('blur', stop);
    // the click that ends a hold does not also pause
    pl.addEventListener('click', (e) => { if (performance.now() - eat < 350) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  },
};

/* Headphones: one more Sound mode. The audio graph gets a crossfeed stage (built with the graph, silent in other modes). */
const Phones = {
  MODE: { k: 'headphones', label: 'Headphones', note: 'Surround folded in, like speakers in front of you', icon: 'headphones', hp: 10, f: 2200, eq: 0, comp: null, makeup: 0, xf: true },
  build(ctx, n) {
    try {
      const sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2), out = ctx.createGain(); out.gain.value = 0;
      [[0, 1], [1, 0]].forEach(([from, to]) => {
        const lp = ctx.createBiquadFilter(), dl = ctx.createDelay(0.01), g = ctx.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.5; dl.delayTime.value = 0.0003; g.gain.value = 0.42;
        sp.connect(lp, from); lp.connect(dl); dl.connect(g); g.connect(mg, 0, to);
      });
      n.makeup.connect(sp); mg.connect(out); out.connect(n.duck); n.xf = out;
    } catch (e) { /* the other modes still work */ }
  },
  apply(n, p, t) { if (n && n.xf) { n.xf.gain.cancelScheduledValues(t); n.xf.gain.setTargetAtTime(p && p.xf ? 1 : 0, t, 0.08); if (p && p.xf) n.dry.gain.setTargetAtTime(0.8, t, 0.08); } },
  init() { if (typeof SoundModes !== 'undefined' && !SoundModes.LIST.some((x) => x.k === 'headphones')) SoundModes.LIST.push(this.MODE); },
};

const MyKeys = {
  ACTS: [['k', 'Play / pause'], ['j', 'Back'], ['l', 'Forward'], ['f', 'Fullscreen'], ['m', 'Mute'], ['n', 'Next episode'], ['s', 'Sources'], ['e', 'Episodes'], ['c', 'Audio & subtitles'],
    ['v', 'Next subtitle'], ['b', 'Next audio track'], ['g', 'Subtitles earlier'], ['h', 'Subtitles later'], ['[', 'Slower'], [']', 'Faster'], ['o', 'Options'], ['a', 'Audio menu'], ['p', 'Watch party']],
  map() { const v = Store.raw.get('mkKeys', {}); return v && typeof v === 'object' ? v : {}; },
  label(k) { return k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k; },
  init() {
    window.addEventListener('keydown', (e) => {
      const m = this.map(); if (this.grab || !Object.keys(m).length || !e.isTrusted || e.ctrlKey || e.metaKey || e.altKey) return;
      if ($('#player').hidden || $('#player .drawer.open') || !$('#subMenu').hidden || !$('#optMenu').hidden) return;
      const t = e.target, tag = (t && t.tagName) || ''; if (/INPUT|TEXTAREA|SELECT/.test(tag) && t.type !== 'range' && t.type !== 'checkbox') return;
      const kk = e.key.length === 1 ? e.key.toLowerCase() : e.key, own = Object.entries(m).find(([, v]) => v === kk);
      if (own) { e.preventDefault(); e.stopImmediatePropagation(); (t || document).dispatchEvent(new KeyboardEvent('keydown', { key: own[0], bubbles: true, cancelable: true })); return; }
      if (m[kk] && kk.length === 1) { e.preventDefault(); e.stopImmediatePropagation(); }   // a key that moved away does nothing now
    }, true);
  },
  open() {
    X8.layer('mkKeys', { label: 'Change keys', icon: 'keyboard', eyebrow: 'Shortcuts', wide: true });
    const body = X8.body('mkKeys');
    const paint = () => {
      const m = this.map();
      body.innerHTML = `<h2 class="x8-h">Your player keys</h2><p class="sc-p">Pick an action, then press the key you want for it. Letters, numbers and signs work.</p>
        <div class="mkk-grid">${this.ACTS.map(([d, l]) => `<button class="mkk" type="button" data-nav data-act="${esc(d)}"><span>${esc(l)}</span><b class="kbd${m[d] ? ' own' : ''}">${esc(this.label(m[d] || d))}</b></button>`).join('')}</div>
        <div class="x8-acts"><button class="btn btn-ghost btn-sm" type="button" data-nav id="mkkReset"><i data-lucide="rotate-ccw"></i>Usual keys</button><button class="btn btn-prime btn-sm" type="button" data-nav data-x8close>Done</button></div>`;
      icons();
      body.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => this.take(b, paint); });
      $('#mkkReset').onclick = () => { Store.raw.set('mkKeys', {}); paint(); toast('The usual keys are back', 'info', 2200); };
    };
    paint(); X8.open('mkKeys');
  },
  take(b, paint) {
    const d = b.dataset.act; b.querySelector('b').textContent = 'Press a key…'; b.classList.add('wait'); this.grab = true;
    const done = (e) => {
      e.preventDefault(); e.stopImmediatePropagation(); window.removeEventListener('keydown', done, true); this.grab = false;
      const k = e.key.length === 1 ? e.key.toLowerCase() : '';
      if (e.key === 'Escape' || !k || /^[\s]$/.test(k) && k !== ' ') { paint(); return; }
      if (k === ' ' && d !== 'k') { toast('Space stays Play / pause', 'info', 2400); paint(); return; }
      const m = this.map(), taken = this.ACTS.find(([a]) => a !== d && (m[a] || a) === k);
      if (taken) { toast(`${this.label(k)} is ${taken[1]} now. Move that one first.`, 'err', 3200); paint(); return; }
      if (k === d) delete m[d]; else m[d] = k;
      Store.raw.set('mkKeys', m); paint();
      const f = $(`#mkKeys [data-act="${CSS.escape(d)}"]`); if (f) try { f.focus({ preventScroll: true }); } catch (x) { /* ok */ }
    };
    window.addEventListener('keydown', done, true);
  },
};

const Recap = {
  DAYS: 4,
  seen() { const v = Store.raw.get('mkLastSeen', {}); return v && typeof v === 'object' ? v : {}; },
  mark() { try { const c = P.ctx; if (!c || !c.meta || !c.video || c.meta._iptv) return; const v = this.seen(); v[c.meta.id] = Date.now(); const ks = Object.keys(v); if (ks.length > 300) ks.sort((a, b) => v[a] - v[b]).slice(0, ks.length - 300).forEach((k) => delete v[k]); Store.raw.set('mkLastSeen', v); } catch (e) { /* ok */ } },
  last(meta, vid) {
    let at = Number(this.seen()[meta.id]) || 0;
    Object.values(S.progress || {}).forEach((p) => { if (p && p.metaId === meta.id && p.videoId !== vid) at = Math.max(at, Number(p.at) || 0); });
    return at;
  },
  shown: null,
  check() {
    try {
      const c = P.ctx; if (CFG.recapCard === false || !c || !c.meta || !c.video || c.meta._iptv || !P.stream || P.stream.ytId || (typeof Party !== 'undefined' && Party.code)) return;
      const key = `${c.meta.id}|${c.video.id}`; if (this.shown === key) return; this.shown = key;
      const at = this.last(c.meta, videoIdFor(c.meta, c.video)); if (!at || Date.now() - at < this.DAYS * 864e5) return;
      const eps = orderedEpisodes(c.meta), i = eps.findIndex((v) => v.id === c.video.id), prev = i > 0 ? eps[i - 1] : null;
      const text = prev && String(prev.overview || prev.description || '').trim(); if (!text) return;
      const box = document.createElement('div'); box.className = 'mk-recap'; box.setAttribute('role', 'status');
      const days = Math.round((Date.now() - at) / 864e5);
      box.innerHTML = `<span class="eyebrow"><i data-lucide="history"></i>The story so far</span><b>${esc(c.meta.name || '')} · S${prev.season || 1} · E${prev.episode || i}${prev.name || prev.title ? ` · ${esc(prev.name || prev.title)}` : ''}</b><p>${esc(text.length > 320 ? `${text.slice(0, 317)}…` : text)}</p><small>${days >= 60 ? 'It has been a while.' : `Last watched ${days} days ago.`}</small><button class="ibtn" type="button" aria-label="Hide"><i data-lucide="x"></i></button>`;
      $('#stage').appendChild(box); icons();
      const go = () => { box.classList.remove('on'); setTimeout(() => box.remove(), 400); };
      box.querySelector('button').onclick = (e) => { e.stopPropagation(); go(); };
      requestAnimationFrame(() => box.classList.add('on'));
      setTimeout(go, 14000);
    } catch (e) { /* the episode plays */ }
  },
};

const Mk30a = {
  init() {
    BtnPick.apply(); video.addEventListener('loadstart', () => setTimeout(() => BtnPick.apply(), 50)); Hold2x.init(); Phones.init(); MyKeys.init();
    video.addEventListener('playing', () => Recap.check());
    ['pause', 'ended'].forEach((ev) => video.addEventListener(ev, () => Recap.mark()));
    window.addEventListener('pagehide', () => { if (!$('#player').hidden) Recap.mark(); });
    const pb = secById('playback');
    if (pb) { const rows = pb.rows; pb.rows = () => [...rows(),
      { key: 'btnPick', label: 'Player buttons', help: 'Hide the player buttons you never use and put the rest in your order.', type: 'button', text: 'Choose', icon: 'layout-grid', run: () => BtnPick.open() },
      { key: 'hold2x', label: 'Hold the mouse for 2× speed', help: 'On a computer, hold the left mouse button on the picture to play twice as fast until you let go.', type: 'toggle', get: () => CFG.hold2x !== false, set: (v) => setCfg('hold2x', v) },
      { key: 'recapCard', label: 'The story so far', help: 'After four days or more away from a series, the next episode starts with a short reminder of the last one, while it loads.', type: 'toggle', get: () => CFG.recapCard !== false, set: (v) => setCfg('recapCard', v) },
    ]; }
    const ks = secById('keys');
    if (ks) { const rows = ks.rows; ks.rows = () => [{ key: 'myKeys', label: 'Change keys', help: 'Move any player key to the key you like.', type: 'button', text: 'Change', icon: 'keyboard', run: () => MyKeys.open() }, ...rows()]; }
  },
};
Mk30a.init();
window.MkBtnPick = BtnPick; window.MkPhones = Phones; window.MkMyKeys = MyKeys; window.MkRecap = Recap;
/* ---------------- 3.0 Choosing: Pick for us, play a list in order, series status ----------------
   1) PickUs (Menu › Pick for us, or the quick jump ring): four ways to settle what to watch, all from the watchlist
      first and then what Home shows. Kids seats and content filters apply.
        Three questions (who, mood, length), Coin toss (two titles, one flip), Knockout (eight titles, pick one of two
        until one is left), Ends by (only what finishes before a time you pick).
   2) Queue (Library › a list or the watchlist › Play in order / Shuffle): films play one after another, a series
      plays from where you are. Between titles a card counts down 8 s (Play now / Stop). Stopping keeps the place,
      and the list's tab offers to carry on.
   3) StatusLine on title pages: Returning series, Ended (with seasons), Limited series, and award winners. */
const PickUs = {
  MOODS: [['laugh', 'A good laugh', 'laugh', ['Comedy', 'Animation', 'Family']], ['edge', 'Edge of my seat', 'zap', ['Thriller', 'Action', 'Crime', 'Mystery', 'Horror']],
    ['feel', 'Something to feel', 'heart', ['Drama', 'Romance', 'Music']], ['mind', 'Mind-bending', 'brain', ['Science Fiction', 'Sci-Fi', 'Mystery', 'Fantasy']], ['big', 'Big and loud', 'flame', ['Action', 'Adventure', 'War', 'Western']],
    ['true', 'Real stories', 'book-open', ['Documentary', 'History', 'Biography']]],
  ok(m) { if (!m || !m.id || !m.name || !/^(movie|series)$/.test(m.type)) return false; if (Seats.kids() && !Seats.kidSafe(m)) return false; if (window.MkFilt && MkFilt.why(m)) return false; return !isWatched(m.id); },
  pool() {
    const seen = new Set(), out = [], add = (m, w) => { if (m && !seen.has(m.id) && this.ok(m)) { seen.add(m.id); out.push({ m, w }); } };
    (S.watchlist || []).forEach((m) => add(S.metas.get(m.id) ? { ...m, ...S.metas.get(m.id) } : m, 3));
    [...S.metas.values()].forEach((m) => add(m, (Number(m.imdbRating) || 6) / 4));
    return out.sort((a, b) => b.w - a.w + (Math.random() - 0.5) * 2).map((x) => x.m);
  },
  card(m, extra = '') {
    return `<div class="pk-card"><span class="po">${metaPoster(m) ? `<img src="${esc(metaPoster(m))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}</span><b>${esc(m.name)}</b><small>${esc([yearOf(m), m.type === 'series' ? 'Series' : X8.runtimeMin(m) ? `${X8.runtimeMin(m)} min` : 'Film', m.imdbRating ? `IMDb ${m.imdbRating}` : ''].filter(Boolean).join(' · '))}</small>${extra}</div>`;
  },
  acts(m) { return `<div class="x8-acts pu-acts"><button class="btn btn-prime" type="button" data-nav data-pk="play" data-id="${esc(m.id)}"><i data-lucide="play"></i>Play</button><button class="btn btn-ghost" type="button" data-nav data-pk="info" data-id="${esc(m.id)}"><i data-lucide="info"></i>Details</button><button class="btn btn-ghost" type="button" data-nav data-pk="home"><i data-lucide="dices"></i>Another way</button></div>`; },
  open() {
    X8.layer('mkPick', { label: 'Pick for us', icon: 'dices', eyebrow: 'Pick for us', wide: true });
    const body = X8.body('mkPick');
    if (!body.dataset.bound) {
      body.dataset.bound = '1';
      body.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pk]'); if (!b) return; const k = b.dataset.pk, m = b.dataset.id && (this.byId[b.dataset.id] || S.metas.get(b.dataset.id));
        if (k === 'play' && m) { X8.close('mkPick'); quickPlay(m); return; }
        if (k === 'info' && m) { X8.close('mkPick'); openDetail(m); return; }
        if (k === 'home') { this.home(); return; }
        if (this[k]) this[k](b);
      });
    }
    this.home(); X8.open('mkPick');
  },
  byId: {},
  keep(l) { l.forEach((m) => { this.byId[m.id] = m; }); return l; },
  set(h, f) { const body = X8.body('mkPick'); body.innerHTML = h; icons(); const el = f && body.querySelector(f); if (el && (IS_TV || Nav.kb)) Nav.focus(el, true); },
  home() {
    const n = this.pool().length;
    if (n < 2) { this.set('<h2 class="x8-h">Nothing to pick from yet</h2><p class="sc-p">Add a few titles to your watchlist, or open Home so its rows load, then try again.</p>'); return; }
    const w = [['q3', 'message-circle-question', 'Three questions', 'Who is watching, the mood and how long'], ['coin', 'circle-dollar-sign', 'Coin toss', 'Two titles, one flip'],
      ['ko', 'swords', 'Knockout', 'Eight titles, keep the one you like more each time'], ['ends', 'alarm-clock', 'Ends by', 'Only what finishes before a time you pick']];
    this.set(`<h2 class="x8-h">How should we choose?</h2><div class="pk-ways">${w.map(([k, ic, t, d]) => `<button class="pk-way" type="button" data-nav data-pk="${k}"><i data-lucide="${ic}"></i><b>${t}</b><small>${d}</small></button>`).join('')}</div>`, '[data-pk="q3"]');
  },
  /* ---- Three questions ---- */
  q3() { this.ans = {}; this.q3a(); },
  q3a() {
    const q = [['me', 'user', 'Just me'], ['two', 'users', 'The two of us'], ['fam', 'baby', 'Family with kids'], ['friends', 'party-popper', 'Friends over']];
    this.set(`<span class="pk-step">1 of 3</span><h2 class="x8-h">Who is watching?</h2><div class="pk-ways">${q.map(([k, ic, t]) => `<button class="pk-way sm" type="button" data-nav data-pk="q3w" data-v="${k}"><i data-lucide="${ic}"></i><b>${t}</b></button>`).join('')}</div>`, '[data-pk="q3w"]');
  },
  q3w(b) { this.ans.who = b.dataset.v; this.set(`<span class="pk-step">2 of 3</span><h2 class="x8-h">What are you in the mood for?</h2><div class="pk-ways">${this.MOODS.map(([k, t, ic]) => `<button class="pk-way sm" type="button" data-nav data-pk="q3m" data-v="${k}"><i data-lucide="${ic}"></i><b>${t}</b></button>`).join('')}</div>`, '[data-pk="q3m"]'); },
  q3m(b) {
    this.ans.mood = b.dataset.v;
    const q = [['short', 'Under 1½ hours'], ['mid', 'Up to 2 hours'], ['long', 'A long one is fine'], ['ep', 'An episode of a series']];
    this.set(`<span class="pk-step">3 of 3</span><h2 class="x8-h">How long have you got?</h2><div class="pk-ways">${q.map(([k, t]) => `<button class="pk-way sm" type="button" data-nav data-pk="q3l" data-v="${k}"><i data-lucide="${k === 'ep' ? 'tv' : 'clock'}"></i><b>${t}</b></button>`).join('')}</div>`, '[data-pk="q3l"]');
  },
  async q3l(b) {
    this.ans.len = b.dataset.v; this.set('<div class="status-line"><span class="spin"></span>Finding the right one…</div>');
    const a = this.ans, mood = this.MOODS.find((x) => x[0] === a.mood), want = new Set(mood ? mood[3] : []);
    let list = this.pool().filter((m) => (a.len === 'ep' ? m.type === 'series' : m.type === 'movie'));
    if (a.who === 'fam') list = list.filter((m) => Seats.kidSafe(m));
    const score = (m) => genresOf(m).filter((g) => want.has(g)).length * 3 + (Number(m.imdbRating) || 6) / 3 + (S.watchlist.some((w) => w.id === m.id) ? 2 : 0) + Math.random();
    list = list.filter((m) => genresOf(m).some((g) => want.has(g)) || !genresOf(m).length).sort((x, y) => score(y) - score(x)).slice(0, 24);
    if (a.len !== 'ep' && a.len !== 'long') { const full = await this.full(list.slice(0, 16)); const max = a.len === 'short' ? 95 : 125; list = full.filter((m) => { const r = X8.runtimeMin(m); return r && r <= max; }); }
    const top = this.keep(list.slice(0, 3));
    if (!top.length) { this.set(`<h2 class="x8-h">Nothing fits all three</h2><p class="sc-p">Try another mood or length, or add more to your watchlist.</p><div class="x8-acts"><button class="btn btn-prime" type="button" data-nav data-pk="q3">Ask again</button><button class="btn btn-ghost" type="button" data-nav data-pk="home">Another way</button></div>`, '[data-pk="q3"]'); return; }
    this.set(`<h2 class="x8-h">${top.length > 1 ? 'Our picks for you' : 'Our pick for you'}</h2><div class="pk-row">${top.map((m) => `<div class="pk-col">${this.card(m)}<div class="pk-two"><button class="btn btn-prime btn-sm" type="button" data-nav data-pk="play" data-id="${esc(m.id)}"><i data-lucide="play"></i>Play</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-pk="info" data-id="${esc(m.id)}">Details</button></div></div>`).join('')}</div><div class="x8-acts"><button class="btn btn-ghost" type="button" data-nav data-pk="q3">Ask again</button><button class="btn btn-ghost" type="button" data-nav data-pk="home">Another way</button></div>`, '[data-pk="play"]');
  },
  async full(list) {
    const out = []; let i = 0;
    const one = async () => { while (i < list.length) { const m = list[i++]; try { out.push(remember({ ...m, ...((await engine.fetchMeta(m.type, m.id)) || {}) })); } catch (e) { out.push(m); } } };
    await Promise.all([one(), one(), one(), one()]); return out;
  },
  /* ---- Coin toss ---- */
  coin() {
    const p = this.pool(); const two = this.keep(p.slice(0, 12).sort(() => Math.random() - 0.5).slice(0, 2)); this.two = two;
    this.set(`<h2 class="x8-h">Heads or tails?</h2><div class="pk-vs">${this.card(two[0], '<span class="pk-side">Heads</span>')}<div class="pk-coin" id="pkCoin" aria-hidden="true"><i>H</i><i>T</i></div>${this.card(two[1], '<span class="pk-side">Tails</span>')}</div><div class="x8-acts"><button class="btn btn-prime" type="button" data-nav data-pk="flip"><i data-lucide="refresh-cw"></i>Flip the coin</button><button class="btn btn-ghost" type="button" data-nav data-pk="coin">Two others</button></div>`, '[data-pk="flip"]');
  },
  flip() {
    const c = $('#pkCoin'); if (!c || c.classList.contains('spin')) return; const win = Math.random() < 0.5 ? 0 : 1;
    c.classList.add('spin', win ? 'tails' : 'heads');
    setTimeout(() => { const m = this.two[win]; this.set(`<span class="pk-step">${win ? 'Tails' : 'Heads'}</span><h2 class="x8-h">Tonight it is</h2><div class="pk-one">${this.card(m)}</div>${this.acts(m)}`, '[data-pk="play"]'); }, window.MK_LITE ? 300 : 1500);
  },
  /* ---- Knockout ---- */
  ko() { this.left = this.keep(this.pool().slice(0, 16).sort(() => Math.random() - 0.5).slice(0, 8)); this.next = []; this.koPaint(); },
  koPaint() {
    if (this.left.length + this.next.length === 1) { const m = this.left[0] || this.next[0]; this.set(`<span class="pk-step">The winner</span><h2 class="x8-h">${esc(m.name)}</h2><div class="pk-one">${this.card(m)}</div>${this.acts(m)}`, '[data-pk="play"]'); return; }
    if (this.left.length < 2) { this.left = [...this.next, ...this.left]; this.next = []; }
    const [a, b] = this.left, round = { 8: 'Quarter-finals', 7: 'Quarter-finals', 6: 'Quarter-finals', 5: 'Quarter-finals', 4: 'Semi-finals', 3: 'Semi-finals', 2: 'The final' }[this.left.length + this.next.length] || 'Round one';
    this.set(`<span class="pk-step">${round}</span><h2 class="x8-h">Which would you rather watch?</h2><div class="pk-vs"><button class="pk-pick" type="button" data-nav data-pk="koWin" data-i="0">${this.card(a)}</button><span class="pk-or">or</span><button class="pk-pick" type="button" data-nav data-pk="koWin" data-i="1">${this.card(b)}</button></div>`, '[data-pk="koWin"]');
  },
  koWin(b) { const [x, y] = this.left; this.left = this.left.slice(2); this.next.push(b.dataset.i === '0' ? x : y); this.koPaint(); },
  /* ---- Ends by ---- */
  ends() {
    const now = new Date(), opts = [];
    for (let h = 1; h <= 5; h++) { const d = new Date(now.getTime() + (h * 60 + 30) * 6e4); d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0); opts.push(d); }
    const fmt = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    this.set(`<h2 class="x8-h">It has to end by…</h2><div class="pk-ways">${opts.map((d) => `<button class="pk-way sm" type="button" data-nav data-pk="endsGo" data-t="${d.getTime()}"><i data-lucide="alarm-clock"></i><b>${esc(fmt(d))}</b><small>${Math.round((d - now) / 6e4)} min from now</small></button>`).join('')}</div>`, '[data-pk="endsGo"]');
  },
  async endsGo(b) {
    const mins = Math.round((Number(b.dataset.t) - Date.now()) / 6e4) - 5; this.set('<div class="status-line"><span class="spin"></span>Checking running times…</div>');
    const films = await this.full(this.pool().filter((m) => m.type === 'movie').slice(0, 20));
    let fit = films.filter((m) => { const r = X8.runtimeMin(m); return r && r <= mins; });
    let eps = 0; if (!fit.length) { fit = this.pool().filter((m) => m.type === 'series').slice(0, 6); eps = 1; }
    const top = this.keep(fit.slice(0, 3));
    if (!top.length) { this.set('<h2 class="x8-h">Nothing that short yet</h2><p class="sc-p">Pick a later time, or add shorter films to your watchlist.</p><div class="x8-acts"><button class="btn btn-prime" type="button" data-nav data-pk="ends">Another time</button></div>', '[data-pk="ends"]'); return; }
    const end = (m) => { const r = X8.runtimeMin(m) || 45; return new Date(Date.now() + r * 6e4).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
    this.set(`<h2 class="x8-h">${eps ? 'No film fits, but an episode does' : 'These finish in time'}</h2><div class="pk-row">${top.map((m) => `<div class="pk-col">${this.card(m, `<span class="pk-side">Ends about ${esc(end(m))}</span>`)}<div class="pk-two"><button class="btn btn-prime btn-sm" type="button" data-nav data-pk="play" data-id="${esc(m.id)}"><i data-lucide="play"></i>Play</button><button class="btn btn-ghost btn-sm" type="button" data-nav data-pk="info" data-id="${esc(m.id)}">Details</button></div></div>`).join('')}</div><div class="x8-acts"><button class="btn btn-ghost" type="button" data-nav data-pk="ends">Another time</button><button class="btn btn-ghost" type="button" data-nav data-pk="home">Another way</button></div>`, '[data-pk="play"]');
  },
};

const Queue = {
  cur() { const q = Store.raw.get('mkQueue', null); return q && Array.isArray(q.items) && q.items.length ? q : null; },
  save(q) { Store.raw.set('mkQueue', q); },
  items(tab) {
    if (tab === 'watchlist') return S.watchlist.slice();
    if (tab === 'unwatched' && window.MkLibMore) return MkLibMore.items('unwatched');
    const l = Library.lists().find((x) => x.id === tab); return l ? l.items.slice() : [];
  },
  name(tab) { if (tab === 'watchlist') return 'Watchlist'; if (tab === 'unwatched') return 'Not watched yet'; const l = Library.lists().find((x) => x.id === tab); return l ? l.name : 'your list'; },
  html(tab) {
    const n = this.items(tab).filter((m) => m && m.id).length; if (n < 2) return '';
    const q = this.cur(), mine = q && q.tab === tab && q.i < q.items.length;
    return `<button type="button" class="btn btn-ghost btn-sm" data-nav data-mkq="order"><i data-lucide="list-video"></i>Play in order</button><button type="button" class="btn btn-ghost btn-sm" data-nav data-mkq="shuffle"><i data-lucide="shuffle"></i>Shuffle</button>${mine ? `<button type="button" class="btn btn-ghost btn-sm" data-nav data-mkq="go"><i data-lucide="play"></i>Carry on (${q.i + 1} of ${q.items.length})</button>` : ''}`;
  },
  start(tab, shuffle) {
    let items = this.items(tab).filter((m) => m && m.id && /^(movie|series)$/.test(m.type)).map((m) => ({ id: m.id, type: m.type, name: m.name, poster: m.poster || '' }));
    if (Seats.kids()) items = items.filter((m) => Seats.kidSafe(S.metas.get(m.id) || m));
    if (shuffle) for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    if (!items.length) return;
    this.save({ tab, name: this.name(tab), items, i: 0, at: Date.now() }); this.play();
  },
  play() { const q = this.cur(); if (!q || q.i >= q.items.length) return; toast(`Playing ${q.name}: ${q.i + 1} of ${q.items.length}`, 'info', 2600, 'mkq'); quickPlay(q.items[q.i]); },
  /* film-end and our own end check ask: is the end of this title ours to handle? */
  takes(ctx) { const q = this.cur(); return !!(q && ctx && ctx.meta && q.items[q.i] && q.items[q.i].id === ctx.meta.id && Date.now() - (q.at || 0) < 864e5 * 2); },
  ended() {
    const ctx = P.ctx; if (!this.takes(ctx) || (ctx.video && nextVideo(ctx.meta, ctx.video)) || (typeof Party !== 'undefined' && Party.code)) return;
    const q = this.cur(); q.i++; q.at = Date.now(); this.save(q);
    if (q.i >= q.items.length) { toast(`That was the last one in ${q.name}`, 'info', 4200, 'mkq'); Store.raw.set('mkQueue', null); return; }
    const nx = q.items[q.i], box = document.createElement('div'); box.className = 'mk-qnext glass-solid'; let n = 8;
    box.innerHTML = `<span class="eyebrow"><i data-lucide="list-video"></i>Next in ${esc(q.name)}</span><b>${esc(nx.name || '')}</b><div class="x8-acts"><button class="btn btn-prime btn-sm" type="button" data-nav data-q="go"><i data-lucide="play"></i>Play now <span class="tnum">${n}</span></button><button class="btn btn-ghost btn-sm" type="button" data-nav data-q="stop">Stop</button></div>`;
    $('#stage').appendChild(box); icons(); if (IS_TV || Nav.kb) Nav.focus(box.querySelector('[data-q="go"]'), true);
    const end = () => { clearInterval(t); box.remove(); };
    const t = setInterval(() => { n--; const s = box.querySelector('.tnum'); if (s) s.textContent = n; if (n <= 0) { end(); this.play(); } }, 1000);
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (!b) return; e.stopPropagation(); end(); if (b.dataset.q === 'go') this.play(); else { closePlayer(); toast('Stopped. The list carries on from here next time.', 'info', 3600, 'mkq'); } });
    video.addEventListener('play', end, { once: true });
  },
  init() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mkq]'); if (!b) return; const tab = Library.st.tab;
      if (b.dataset.mkq === 'go') this.play(); else this.start(tab, b.dataset.mkq === 'shuffle');
    });
    video.addEventListener('ended', () => setTimeout(() => this.ended(), 300));
  },
};

const StatusLine = {
  html(m) {
    if (!m || CFG.statusLine === false) return '';
    const bits = [], st = String(m.status || ''), seasons = m.type === 'series' && Array.isArray(m.videos) ? new Set(m.videos.map((v) => Number(v.season)).filter((x) => x > 0)).size : 0;
    if (m.type === 'series') {
      if (/ended|canceled|cancelled/i.test(st)) bits.push(seasons === 1 ? ['book-check', 'Limited series'] : ['flag', seasons > 1 ? `Ended · ${seasons} seasons` : 'Ended']);
      else if (/continuing|returning|production/i.test(st)) {
        const now = Date.now(), nx = (m.videos || []).filter((v) => Number(v.season) > 0 && v.released && Date.parse(v.released) > now).sort((a, b) => Date.parse(a.released) - Date.parse(b.released))[0];
        bits.push(['radio', nx ? `Returning · new episode ${new Date(nx.released).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : 'Returning series']);
      }
    }
    const aw = String(m.awards || ''), osc = /Won (\d+) Oscars?/i.exec(aw), em = /Won (\d+) (?:Primetime )?Emmys?/i.exec(aw), nom = /Nominated for (\d+) Oscars?/i.exec(aw);
    if (osc) bits.push(['award', Number(osc[1]) > 1 ? `${osc[1]} Oscars` : 'Oscar winner']); else if (em) bits.push(['award', Number(em[1]) > 1 ? `${em[1]} Emmys` : 'Emmy winner']); else if (nom) bits.push(['award', 'Oscar nominee']);
    return bits.length ? `<div class="d-stat">${bits.map(([i, t]) => `<span><i data-lucide="${i}"></i>${esc(t)}</span>`).join('')}</div>` : '';
  },
};

const Mk30b = {
  init() {
    Queue.init();
    // the Menu lists the buttons in the top bar's tools, so Pick for us joins it there
    const tools = document.querySelector('.dock-tools');
    if (tools && !$('#openPick')) { tools.insertAdjacentHTML('beforeend', '<button class="ibtn" id="openPick" type="button" data-nav hidden title="Pick for us" aria-label="Pick for us"><i data-lucide="dices"></i></button>'); $('#openPick').onclick = () => PickUs.open(); }
    const tp = secById('playback');
    if (tp) { const rows = tp.rows; tp.rows = () => [...rows(), { key: 'statusLine', label: 'Series status on title pages', help: 'Shows Returning, Ended or Limited series, the next new episode and award wins under the title.', type: 'toggle', get: () => CFG.statusLine !== false, set: (v) => setCfg('statusLine', v) }]; }
  },
};
Mk30b.init();
window.MkPickUs = PickUs; window.MkQueue = Queue; window.MkStatusLine = StatusLine;
/* ---------------- 3.0 Home cinema: lights cue, quick jump ring ----------------
   1) Lights (Settings › Devices › Lights cue): up to three web addresses (webhooks from a smart-home app) that
      MKCinema calls when a film starts or carries on, when it pauses, and when it ends or closes. A POST with a small
      JSON body ({ "event": "start" | "pause" | "end", "title": ... }); no-cors, so any https hook works. Trailers and
      watch-party guests' own players do not call them. Plain http works only for addresses on this device (browsers block the rest).
   2) Ring (R on a keyboard, outside text boxes and the player): every place in MKCinema around one circle. Arrows or
      the mouse aim, Enter or a click opens, 1-9 and 0 jump straight there, R or Esc closes. */
const Lights = {
  EV: [['start', 'lightStart', 'When a film starts or carries on'], ['pause', 'lightPause', 'When it pauses'], ['end', 'lightEnd', 'When it ends or closes']],
  last: '', t: 0,
  url(k) { return this.okUrl(CFG[k]); },
  okUrl(v) { const u = String(v || '').trim(); return /^https:\/\/[^\s]+$/i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u) ? u : ''; },
  on() { return this.EV.some(([, k]) => this.url(k)); },
  fire(ev, now) {
    if (!this.on() || !P.stream || P.stream.ytId) return;
    clearTimeout(this.t);
    const go = () => {
      if (this.last === ev) return; this.last = ev;
      const k = this.EV.find((x) => x[0] === ev)[1], u = this.url(k); if (!u) return;
      const m = P.ctx && P.ctx.meta, body = JSON.stringify({ event: ev, title: (m && m.name) || '', type: (m && m.type) || '', app: 'MKCinema' });
      try { fetch(u, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body, credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => {}); } catch (e) { /* a cue never stops the film */ }
    };
    // a pause shorter than a second (a seek, a buffer) does not flash the lights
    if (now) go(); else this.t = setTimeout(go, ev === 'pause' ? 1200 : 300);
  },
  test(k) {
    const u = this.url(k); if (!u) { toast('Add an https address first', 'err', 3000); return; }
    fetch(u, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ event: 'test', title: 'MKCinema test', app: 'MKCinema' }), credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(() => toast('Sent. Your lights should change now.', 'ok', 3200), () => toast('That address did not answer. Check it in your smart-home app.', 'err', 4200));
  },
  init() {
    video.addEventListener('playing', () => { if (!video.seeking) this.fire('start'); });
    video.addEventListener('pause', () => { if (!video.ended && !video.seeking) this.fire('pause'); });
    video.addEventListener('ended', () => this.fire('end', true));
    const cp = closePlayer;
    closePlayer = function (...a) { try { if (!$('#player').hidden) Lights.fire('end', true); } catch (e) { /* close anyway */ } return cp.apply(this, a); };   // eslint-disable-line no-global-assign
    const dv = secById('devices');
    if (dv) { const rows = dv.rows; dv.rows = () => [...rows(), { group: 'Lights cue' },
      ...this.EV.map(([ev, k, label]) => ({ key: k, label, help: ev === 'start' ? 'Paste a webhook address from your smart-home app (it starts with https). MKCinema calls it at that moment, so your lights can dim, rise or turn off.' : '', type: 'text', get: () => CFG[k] || '', set: (v) => { const ok = !v || !!this.okUrl(v); setCfg(k, ok ? v : ''); if (!ok) toast('Use an address that starts with https://', 'err', 3600); } })),
      { key: 'lightTest', label: 'Try the start cue', type: 'button', text: 'Send a test', icon: 'lightbulb', run: () => this.test('lightStart') },
    ]; }
  },
};

const Ring = {
  open: false,
  items() {
    const out = [], seen = new Set(), add = (k, icon, label, run) => { if (!seen.has(k) && label) { seen.add(k); out.push({ k, icon, label, run }); } };
    add('search', 'search', 'Search', () => { const b = $('#openPalette'); if (b) b.click(); });
    const tabs = [...document.querySelectorAll('#tabs .tab[data-view]')].filter((t) => t.dataset.view !== 'sports' && !t.hidden);   // Sports lives inside Live TV
    const tab = (t) => { const i = t.querySelector('[data-lucide]'); add(`v:${t.dataset.view}`, (i && i.getAttribute('data-lucide')) || 'circle', (t.getAttribute('aria-label') || t.textContent || '').replace(/\s+/g, ' ').trim(), () => t.click()); };
    const shown = tabs.filter((t) => t.getClientRects().length); shown.forEach(tab);
    add('pick', 'dices', 'Pick for us', () => window.MkPickUs && MkPickUs.open());
    if ($('#openParty')) add('party', 'users', 'Watch party', () => $('#openParty').click());
    add('settings', 'settings-2', 'Settings', () => openSettings());
    tabs.filter((t) => !shown.includes(t)).forEach(tab);
    return out.slice(0, 12);
  },
  show() {
    if (this.open) { this.hide(); return; }
    const it = this.items(); if (!it.length) return;
    let el = $('#mkJump'); if (!el) { el = document.createElement('div'); el.id = 'mkJump'; el.setAttribute('role', 'menu'); el.setAttribute('aria-label', 'Quick jump'); document.body.appendChild(el); }
    const n = it.length, R = Math.min(220, innerHeight * 0.32, innerWidth * 0.36);
    el.innerHTML = `<div class="rg-in">${it.map((x, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return `<button type="button" role="menuitem" class="rg-b" data-ri="${i}" style="transform:translate(${Math.round(Math.cos(a) * R)}px,${Math.round(Math.sin(a) * R)}px)"><i data-lucide="${esc(x.icon)}"></i><span>${esc(x.label)}</span>${i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ''}</button>`; }).join('')}<div class="rg-mid" aria-hidden="true"><b>Quick jump</b><small>Number, arrows or a click</small></div></div>`;
    icons(); this.it = it; this.sel = 0; this.open = true; el.hidden = false;
    requestAnimationFrame(() => { el.classList.add('on'); this.mark(); });
    el.onclick = (e) => { const b = e.target.closest('[data-ri]'); if (b) this.go(Number(b.dataset.ri)); else if (e.target === el || e.target.classList.contains('rg-in')) this.hide(); };
    el.onmousemove = (e) => { const b = e.target.closest('[data-ri]'); if (b && Number(b.dataset.ri) !== this.sel) { this.sel = Number(b.dataset.ri); this.mark(); } };
  },
  mark() { document.querySelectorAll('#mkJump .rg-b').forEach((b, i) => b.classList.toggle('on', i === this.sel)); const b = document.querySelector(`#mkJump [data-ri="${this.sel}"]`); if (b) try { b.focus({ preventScroll: true }); } catch (e) { /* ok */ } },
  hide() { const el = $('#mkJump'); this.open = false; if (el) { el.classList.remove('on'); el.hidden = true; } },
  go(i) { const x = this.it && this.it[i]; this.hide(); if (x) setTimeout(() => { try { x.run(); } catch (e) { /* place gone */ } }, 30); },
  init() {
    window.addEventListener('keydown', (e) => {
      const k = e.key, t = e.target, typing = t && /INPUT|TEXTAREA|SELECT/.test(t.tagName || '') || (t && t.isContentEditable);
      if (this.open) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (k === 'Escape' || k === 'r' || k === 'R' || k === 'Backspace') this.hide();
        else if (k === 'Enter' || k === ' ') this.go(this.sel);
        else if (/^[0-9]$/.test(k)) { const i = k === '0' ? 9 : Number(k) - 1; if (i < this.it.length) this.go(i); }
        else if (/^Arrow/.test(k)) { const n = this.it.length; this.sel = (this.sel + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1) + n) % n; this.mark(); }
        return;
      }
      if (IS_TV || CFG.quickRing === false || typing || e.ctrlKey || e.metaKey || e.altKey || e.repeat || (k !== 'r' && k !== 'R')) return;
      if (!$('#player').hidden || document.body.classList.contains('layer-open') || document.documentElement.classList.contains('ezb-menu-open')) return;
      e.preventDefault(); e.stopImmediatePropagation(); this.show();
    }, true);
    const ks = secById('keys');
    if (ks) { const rows = ks.rows; ks.rows = () => [...rows(), { key: 'quickRing', label: 'Quick jump ring', help: 'Press R anywhere outside the player to see every place in a circle, then a number, the arrows or a click.', type: 'toggle', get: () => CFG.quickRing !== false, set: (v) => setCfg('quickRing', v) }]; }
  },
};

const Mk30c = { init() { Lights.init(); Ring.init(); } };
Mk30c.init();
window.MkLights = Lights; window.MkRing = Ring;
