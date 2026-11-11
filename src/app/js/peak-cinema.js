
/* 2.7.26 Peak Cinema */
/* =====================================================================
   2.7.26 Peak Cinema: flip through 90-second scenes, one film after another
   ---------------------------------------------------------------------
   There is no public list of "best scene" timestamps, so none is pretended. A scene is a point between about a third and
   three quarters of the way into the film (past the opening, well before the credits). What you skip and what you keep
   watching is learned on this device only and nudges both that window and which genres come up.
   Only sources your debrid service already has cached, in formats this browser can decode, are used. The browser jumps
   straight to the scene with an HTTP range request on your own stream link. To spare addons and your debrid account, only
   one film is looked up at a time (at least 2.5 s apart), only the next scene is buffered, and a debrid link is only
   requested for the scene that plays next.
   ===================================================================== */
const Peak = {
  CLIP: 90, GAP: 2500, MAX_MISS: 10,
  MOODS: [
    ['any', 'Anything', null], ['action', 'Action', /action|adventure|war|western/i], ['scifi', 'Sci-Fi', /sci-?fi|science fiction|fantasy/i],
    ['thriller', 'Thriller', /thriller|crime|mystery/i], ['comedy', 'Comedy', /comed/i], ['horror', 'Horror', /horror/i],
    ['animation', 'Animation', /animat|family/i], ['drama', 'Drama', /drama|romance|history/i],
  ],
  el: null, on: false, tok: 0, mood: 'any', pool: [], used: new Set(), staged: null, next: null, cur: null, n: 0, miss: 0,
  busy: false, dry: false, lookAt: 0, linkAt: 0, idleT: 0, muted: false,
  learn() { return Object.assign({ g: {}, kept: [], seen: {} }, Store.get('peakLearn', {})); },
  saveLearn(l) { const now = Date.now(); for (const k in l.seen) if (now - l.seen[k] > 3 * 864e5) delete l.seen[k]; Store.set('peakLearn', l); },
  // the window a scene is picked from, as a share of the running time; scenes you kept watching pull it toward them
  band() {
    const k = this.learn().kept; if (k.length < 3) return [.35, .75];
    const c = clamp(k.reduce((a, b) => a + b, 0) / k.length, .42, .68); return [c - .17, c + .17];
  },
  feedback(clip, kind) {
    if (!clip) return; const l = this.learn(), w = { skip: -1, full: 1, keep: 3 }[kind] || 0;
    genresOf(clip.meta).forEach((g) => { l.g[g] = clamp((l.g[g] || 0) + w, -8, 8); });
    if (kind === 'keep' && clip.d) { l.kept.push(+(clip.v.currentTime / clip.d).toFixed(3)); l.kept = l.kept.slice(-10); }
    this.saveLearn(l);
  },

  build() {
    const el = document.createElement('div'); el.id = 'peak'; el.className = 'pk'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Peak Cinema');
    el.innerHTML = `
      <div class="pk-stage"><video class="pk-v" playsinline preload="auto"></video><video class="pk-v" playsinline preload="auto"></video><div class="pk-shade"></div></div>
      <div class="pk-ui">
        <div class="pk-top">
          <div class="pk-brand"><span class="pk-mark">Peak Cinema</span><span class="pk-sub" id="pkCount"></span></div>
          <div class="pk-moods chips" id="pkMoods">${this.MOODS.map(([k, l]) => `<button class="chip${k === this.mood ? ' on' : ''}" type="button" data-nav data-mood="${k}">${l}</button>`).join('')}</div>
          <div class="pk-tools">
            <button class="ibtn" id="pkMute" type="button" data-nav aria-label="Sound"><i data-lucide="volume-2"></i></button>
            <button class="ibtn" id="pkHow" type="button" data-nav aria-label="How scenes are picked"><i data-lucide="info"></i></button>
            <button class="ibtn" id="pkClose" type="button" data-nav aria-label="Close Peak Cinema"><i data-lucide="x"></i></button>
          </div>
        </div>
        <div class="pk-status" id="pkStatus" hidden></div>
        <div class="pk-bottom">
          <div class="pk-info" id="pkInfo"></div>
          <div class="pk-acts">
            <button class="btn btn-bolt" id="pkKeep" type="button" data-nav><i data-lucide="play"></i><span class="sp-l">Keep watching<small id="pkFrom">From here</small></span></button>
            <button class="btn btn-ghost" id="pkStart" type="button" data-nav><i data-lucide="rotate-ccw"></i>From the start</button>
            <button class="btn btn-ghost" id="pkSkip" type="button" data-nav><i data-lucide="skip-forward"></i>Next scene</button>
            <button class="btn btn-ghost" id="pkDetails" type="button" data-nav><i data-lucide="info"></i>Details</button>
          </div>
          <div class="pk-foot"><div class="pk-next" id="pkNext"></div><div class="pk-bar"><i id="pkBar"></i></div></div>
        </div>
      </div>
      <div class="pk-how" id="pkHowBox" hidden>
        <div class="pk-how-box">
          <h3>How Peak Cinema picks scenes</h3>
          <p>MKCinema has no database of famous scenes, and none is pretended. Each scene starts at a point between about a third and three quarters of the way into the film, past the opening and well before the credits.</p>
          <p>What you skip and what you keep watching teaches it, on this device only: genres you keep come up more, and the window moves toward the moments you stayed for.</p>
          <p>Only sources your debrid service already has cached, in formats this device can play, and in your audio language (Settings › Audio language), are used. MKCinema looks up one film at a time and buffers only the next scene, so your addons and your debrid account are never flooded.</p>
          <div class="pk-how-acts"><button class="btn btn-ghost" id="pkForget" type="button" data-nav><i data-lucide="eraser"></i>Forget what it learned</button><button class="btn btn-prime" id="pkHowOk" type="button" data-nav>Got it</button></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.vids = $$('.pk-v', el);
    // TVs: Fire TV and Android TV boxes give a web page one hardware video decoder, so a second video loading in the
    // background takes the picture away from the one playing (sound, no picture). TVs use one video element: the next
    // scene is looked up and its link fetched ahead, and it loads into the same element when its turn comes.
    if (IS_TV) { this.vids[1].parentNode.removeChild(this.vids[1]); this.vids.length = 1; }
    this.vids.forEach((v) => {
      v.addEventListener('timeupdate', () => this.tick(v));
      // the picture box is sized to the film's own shape and centred, so it never leans on object-fit (TV web views
      // drew some films top-aligned and cut off at the side)
      v.addEventListener('loadedmetadata', () => this.fit(v)); v.addEventListener('resize', () => this.fit(v));
      v.addEventListener('ended', () => { if (this.cur && this.cur.v === v) { this.feedback(this.cur, 'full'); this.advance(); } });
      v.addEventListener('error', () => { if (this.cur && this.cur.v === v) { this.status('That scene stopped loading, so here is the next one.'); this.advance(); } });
    });
    $('#pkClose', el).onclick = () => this.close();
    $('#pkSkip', el).onclick = () => this.skip();
    $('#pkKeep', el).onclick = () => this.keep(false);
    $('#pkStart', el).onclick = () => this.keep(true);
    $('#pkDetails', el).onclick = () => { const c = this.cur; if (!c) return; this.close(); openDetail(c.meta); };
    $('#pkMute', el).onclick = () => this.setMuted(!this.muted);
    $('#pkHow', el).onclick = () => this.how(true);
    $('#pkHowOk', el).onclick = () => this.how(false);
    $('#pkForget', el).onclick = () => { Store.set('peakLearn', {}); toast('Peak Cinema starts fresh', 'ok', 2400); this.how(false); };
    $$('[data-mood]', el).forEach((b) => b.addEventListener('click', () => this.setMood(b.dataset.mood)));
    ['pointermove', 'pointerdown'].forEach((t) => el.addEventListener(t, () => this.wake(), { passive: true }));
    // a click on the picture pauses or plays; on touch screens a tap only resumes a paused scene (the first tap shows the controls)
    $('.pk-stage', el).addEventListener('click', () => { const c = this.cur; if (!c) return; if (c.v.paused) c.v.play().catch(() => {}); else if (!TOUCH_UI) c.v.pause(); });
    icons(); return el;
  },
  how(show) { $('#pkHowBox').hidden = !show; this.wake(true); if (IS_TV) Nav.restore(true); else if (show) $('#pkHowOk').focus(); },

  async open() {
    if (this.on) return;
    const el = this.el;
    this.on = true; this.tok++; this.n = 0; this.miss = 0; this.dry = false; this.cur = this.next = this.staged = null; this.used.clear();
    this.muted = !!Store.get('peakMuted', false); this.setMuted(this.muted);
    $('#pkInfo').innerHTML = ''; $('#pkNext').textContent = ''; $('#pkBar').style.transform = 'scaleX(0)'; $('#pkCount').textContent = '';
    /* pk-2738: TV video layers are placed against the scrolled page, so the page goes to the top while Peak is open */
    if (IS_TV) { this.scrollY0 = scrollY; if (scrollY) scrollTo(0, 0); }
    el.classList.add('pk-empty'); openLayer('peak');
    this.claimBack();
    this.wake(true);
    if (!engine.addons.some((a) => a.enabled !== false && !a.builtin && engine.supports(a, 'stream', 'movie', 'tt0111161'))) { this.blocked('none'); return; }
    this.status('Finding a scene your sources have ready…', true);
    await this.buildPool(this.tok);
    this.fill();
  },
  close() {
    if (!this.on) return;
    this.on = false; this.tok++; clearTimeout(this.idleT);
    this.vids.forEach((v) => this.unload(v));
    this.cur = this.next = this.staged = null;
    const s = $('.pk-stage', this.el); if (s.id === 'remote') { s.removeAttribute('id'); tvBackHook(); }
    $('#pkHowBox').hidden = true; closeLayer('peak');
    if (IS_TV && this.scrollY0) { const y = this.scrollY0; this.scrollY0 = 0; requestAnimationFrame(() => scrollTo(0, y)); }
  },
  fit(v) {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) { v.style.removeProperty('width'); v.style.removeProperty('height'); v.style.removeProperty('left'); v.style.removeProperty('top'); return; }
    const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight, r = vw / vh;
    let w = W, h = Math.round(W / r); if (h > H) { h = H; w = Math.round(H * r); }
    if (IS_TV) { Object.assign(v.style, { width: `${w}px`, height: `${h}px` }); v.style.removeProperty('left'); v.style.removeProperty('top'); return; }
    Object.assign(v.style, { width: `${w}px`, height: `${h}px`, left: `${Math.round((W - w) / 2)}px`, top: `${Math.round((H - h) / 2)}px` });
  },
  claimBack() { if (IS_TV && this.on && !$('#remote')) $('.pk-stage', this.el).id = 'remote'; },
  unload(v) { this.fit({ videoWidth: 0, style: v.style }); v.pause(); v.removeAttribute('src'); v.load(); v.classList.remove('on'); v._clip = null; },
  setMuted(m) {
    this.muted = m; Store.set('peakMuted', m);
    if (this.cur) this.cur.v.muted = m;
    const b = $('#pkMute'); if (b) { b.innerHTML = `<i data-lucide="${m ? 'volume-x' : 'volume-2'}"></i>`; b.setAttribute('aria-label', m ? 'Sound on' : 'Mute'); icons(); }
  },
  setMood(k) {
    if (k === this.mood && this.pool.length) return;
    this.mood = k; $$('#pkMoods [data-mood]').forEach((b) => b.classList.toggle('on', b.dataset.mood === k));
    // what is already buffered for the old mood is let go; the scene on screen keeps playing until the new one is ready
    const tok = ++this.tok; this.miss = 0; this.dry = false;
    if (this.next) { if (this.next.v) this.unload(this.next.v); this.next = null; }
    this.staged = null; this.busy = false; $('#pkNext').textContent = '';
    this.buildPool(tok).then(() => { if (tok === this.tok) { this.fill(); if (this.cur) this.status(`Switching to ${this.MOODS.find((m) => m[0] === k)[1].toLowerCase()} after this scene`, false, 2600); } });
  },

  /* Films come from the catalogs on your Home and your watchlist; a mood uses the catalogs' own genre filter when they have one */
  async buildPool(tok) {
    const mood = this.MOODS.find((m) => m[0] === this.mood), re = mood[2];
    const cats = engine.catalogs({ type: 'movie' }).filter((c) => !c.required.length).slice(0, 8);
    const lists = await Promise.allSettled(cats.map((c) => {
      const g = re && c.genres.find((x) => re.test(x));
      return engine.fetchCatalog(c, g ? { genre: g } : {});
    }));
    if (tok !== this.tok) return;
    const seen = new Set(), out = [];
    const add = (m) => { if (!m || !m.id || seen.has(m.id) || (m.type && m.type !== 'movie') || !/^tt\d/.test(m.id)) return; if (re && genresOf(m).length && !genresOf(m).some((g) => re.test(g))) return; seen.add(m.id); out.push(m); };
    lists.forEach((r) => { if (r.status === 'fulfilled') r.value.forEach(add); });
    (S.watchlist || []).forEach(add);
    this.pool = out;
  },
  /* weighted draw: genres you kept come up more, ones you skip less, and nothing you surfed in the last three days repeats */
  pick() {
    const l = this.learn(), now = Date.now();
    let c = this.pool.filter((m) => !this.used.has(m.id) && !(l.seen[m.id] && now - l.seen[m.id] < 3 * 864e5));
    if (!c.length) c = this.pool.filter((m) => !this.used.has(m.id));
    if (!c.length) return null;
    const w = c.map((m) => { const a = genresOf(m).reduce((s, g) => s + (l.g[g] || 0), 0), r = parseFloat(m.imdbRating) || 6.5; return Math.exp(clamp(a, -8, 8) * .16) * (0.4 + r / 10); });
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < c.length; i++) { x -= w[i]; if (x <= 0) return c[i]; }
    return c[c.length - 1];
  },
  async gate(key, gap) { const wait = this[key] - Date.now(); if (wait > 0) await sleep(wait); this[key] = Date.now() + gap; },

  /* Which of a film's sources can open straight on a scene here: cached on your debrid service, a plain file (not HLS),
     a format this device decodes. 1080p goes first, since many 4K HEVC remuxes will not decode in browsers or TV apps. */
  /* 2.63.3 Peak Cinema plays your audio language only (Settings > Audio language, or Source rules > Preferred audio
     language). A release that names your language alone is used first. A release that names no language is taken to be
     in the film's own language (from the catalog's country), so an Italian film with no tag is skipped when you chose
     English. MULTi and dual-audio files are used only where the browser lets MKCinema pick the track (video.audioTracks,
     e.g. Safari); elsewhere the file's first track would play, which may be the wrong one. */
  COUNTRY: { 'united states': 'eng', usa: 'eng', 'united kingdom': 'eng', uk: 'eng', australia: 'eng', 'new zealand': 'eng', ireland: 'eng', canada: 'eng',
    france: 'fre', belgium: 'fre', italy: 'ita', spain: 'spa', mexico: 'spa', argentina: 'spa', colombia: 'spa', chile: 'spa', germany: 'ger', austria: 'ger',
    japan: 'jpn', 'south korea': 'kor', korea: 'kor', china: 'chi', 'hong kong': 'chi', taiwan: 'chi', india: 'hin', russia: 'rus', brazil: 'por', portugal: 'por',
    netherlands: 'dut', poland: 'pol', turkey: 'tur', sweden: 'swe', denmark: 'dan', norway: 'nor', finland: 'fin', greece: 'gre', israel: 'heb', thailand: 'tha',
    'czech republic': 'cze', czechia: 'cze', hungary: 'hun', romania: 'rum', iran: 'per', egypt: 'ara', 'saudi arabia': 'ara', indonesia: 'ind', vietnam: 'vie', ukraine: 'ukr' },
  want() { return typeof MkAudioWant === 'function' ? MkAudioWant() : (CFG.audioOnly && CFG.audioOnly !== 'any' ? CFG.audioOnly : ''); },
  canSwitch() { return !!(this.vids && this.vids[0] && this.vids[0].audioTracks); },
  /* 2 = names your language only, 1 = names none but the film is in your language, or several with a track switch here; 0 = not used */
  langFit(s, meta, w) {
    if (!w || s._tel.isTrailer) return 2;
    const bh = s.behaviorHints || {}, title = String((meta && meta.name) || '').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2);
    const strip = (t) => { const left = new Set(title); return String(t).toLowerCase().replace(/[._\-\[\]()+/|]/g, ' ').split(/\s+/).filter((x) => !left.delete(x)).join(' '); };
    const raw = [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' '), T = [s.name, s.title, s.description, bh.filename].filter(Boolean).map(strip).join(' ');
    const langs = new Set();
    for (const m of raw.matchAll(/([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/gu)) { const cc = String.fromCharCode(m[1].codePointAt(0) - 0x1F1E6 + 65, m[2].codePointAt(0) - 0x1F1E6 + 65); langs.add(AudioPref.FLAG[cc] || cc.toLowerCase()); }
    AudioPref.WORD.forEach(([re, l]) => { if (re.test(T)) langs.add(l); });
    const multi = /\b(multi|multi audio|dual|dual audio)\b/.test(T) || langs.size > 1;
    if (multi) return langs.size && !langs.has(w) ? 0 : this.canSwitch() ? 1 : 0;
    if (langs.size) return langs.has(w) ? 2 : 0;
    const cs = String((meta && meta.country) || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
    if (!cs.length) return w === 'eng' ? 1 : 0;
    const own = cs.map((c) => this.COUNTRY[c] || '');
    return (w === 'eng' ? own.includes('eng') : own[0] === w) ? 1 : 0;
  },
  /* where the browser lists a file's audio tracks (Safari, the Mac app), your language is switched on, and a file without it is left out */
  audioOk(v) {
    const w = this.want(), at = v.audioTracks;
    if (!w || !at || !at.length || typeof MkAudioMatch !== 'function') return true;
    let i = -1; for (let k = 0; k < at.length; k++) if (MkAudioMatch(at[k].language, at[k].label, w)) { i = k; break; }
    if (i < 0) return !(at.length > 1 || Array.from(at).some((t) => t.language && !/^(und|unk|mis|zxx)$/i.test(t.language)));
    for (let k = 0; k < at.length; k++) at[k].enabled = k === i;
    return true;
  },
  choose(streams, meta) {
    const w = this.want();
    // the general audio filter reads the open title's name to skip its own words ("The Italian Job" is not a dub): give it this film
    const dm = typeof D === 'object' && D ? D.meta : undefined; let vis;
    try { if (meta && dm !== undefined) D.meta = meta; vis = visibleStreams(streams); } finally { if (meta && dm !== undefined) D.meta = dm; }
    const ok = vis.filter((s) => {
      const t = s._tel, bh = s.behaviorHints || {};
      if (t.cached !== true || t.isTrailer || bh.proxyHeaders || bh.notWebReady) return false;
      if (!(t.kind === 'http' || (t.kind === 'p2p' && t.debrid))) return false;
      return BrowserPlay.ok(s);
    });
    const rank = (s) => { const t = s._tel, gb = (t.sizeBytes || 0) / 1073741824; return ({ '1080p': 60, '720p': 40, '4K UHD': 30, '1440p': 45, SD: 5 }[t.res] || 25) + (t.codec === 'H.264' ? 15 : 0) - (t.mkv ? 10 : 0) - (gb > 25 ? 15 : 0); };
    ok.forEach((s) => { s._pkLang = this.langFit(s, meta, w); });
    return ok.filter((s) => s._pkLang > 0).sort((a, b) => (b._pkLang - a._pkLang) * 1000 + rank(b) - rank(a));
  },
  /* one film looked up: its addons are asked once, then the debrid cache check is waited for (no second request) */
  async stage(tok) {
    for (let tries = 0; tries < 3 && tok === this.tok; tries++) {
      const meta = this.pick(); if (!meta) return null;
      this.used.add(meta.id);
      await this.gate('lookAt', this.GAP); if (tok !== this.tok) return null;
      let streams = [];
      try { streams = (await engine.fetchStreams('movie', (meta.behaviorHints && meta.behaviorHints.defaultVideoId) || meta.id)).streams; } catch (e) { /* counted as a miss */ }
      if (tok !== this.tok) return null;
      const hashes = streams.filter((s) => s.infoHash && !s.url);
      for (let i = 0; i < 12 && hashes.length && Vault.service() && hashes.some((s) => !Vault.cached.has(String(s.infoHash).toLowerCase())); i++) await sleep(250);
      hashes.forEach((s) => { s._tel = Telemetry.parse(s); });
      const list = this.choose(streams, meta);
      if (list.length) { this.miss = 0; return { meta: remember(meta), streams, list }; }
      this.miss++;
      if (this.miss >= this.MAX_MISS) return null;
    }
    return 'retry';
  },
  /* the next scene: its debrid link is requested now (only for this one), and the browser seeks straight to the scene */
  async load(st, tok) {
    const lazy = IS_TV && this.cur, v = lazy ? null : this.vids.find((x) => !x._clip && (!this.cur || this.cur.v !== x)); if (!v && !lazy) return null;
    const list = st.list.slice(0, 2);
    for (const [i, s] of list.entries()) {
      let url = s.url;
      if (!url && s.infoHash) {
        await this.gate('linkAt', 2000); if (tok !== this.tok) return null;
        try { url = await Vault.resolve(s, { meta: st.meta, video: null }); s._infoHash = s.infoHash; delete s.infoHash; s.url = url; s._debrid = s._tel.debrid; s._tel = Telemetry.parse(s); } catch (e) { continue; }
        if (tok !== this.tok) return null;
      }
      // TV: the other candidate travels with it, so a copy that will not open falls back to the film's next source
      if (IS_TV && this.cur) return { meta: st.meta, stream: s, streams: st.streams, v: null, url, lazy: true, offset: 0, d: 0, alt: { ...st, list: list.slice(i + 1) } };
      const clip = { meta: st.meta, stream: s, streams: st.streams, v, offset: 0, d: 0 };
      v._clip = clip;
      const ok = await this.seekTo(v, url, clip, tok);
      if (tok !== this.tok) { if (v._clip === clip) this.unload(v); return null; }
      if (ok) return clip;
      this.unload(v);
    }
    return null;
  },
  seekTo(v, url, clip, tok) {
    return new Promise((done) => {
      let fin = false; const end = (ok) => { if (fin) return; fin = true; clearTimeout(t); v.removeEventListener('error', err); done(ok); };
      const err = () => end(false), t = setTimeout(() => end(false), 25000);
      v.addEventListener('error', err);
      v.muted = true; v.preload = 'auto'; v.src = url;
      v.addEventListener('loadedmetadata', () => {
        const d = v.duration;
        if (tok !== this.tok || !isFinite(d) || d < 1200 || !this.audioOk(v)) { end(false); return; }
        const [lo, hi] = this.band(), credits = Math.max(480, d * .1);
        const a = Math.max(600, d * lo), b = Math.min(d * hi, d - credits - this.CLIP);
        if (b <= a) { end(false); return; }
        clip.d = d; clip.offset = Math.round(a + Math.random() * (b - a));
        v.currentTime = clip.offset;
        const ready = () => {
          // a video track this device cannot decode still plays its sound with no picture: such files are left out
          if (!v.videoWidth) { end(false); return; }
          if (v.readyState >= 3) end(true); else v.addEventListener('canplay', () => end(!!v.videoWidth), { once: true });
        };
        v.addEventListener('seeked', ready, { once: true });
      }, { once: true });
    });
  },
  /* keeps one scene ready behind the one on screen, and one more film looked up (addon answer only, no debrid link) */
  async fill() {
    if (this.busy || !this.on) return; this.busy = true; const tok = this.tok;
    try {
      while (tok === this.tok && this.on && !this.next) {
        if (!this.staged) {
          if (!this.cur) this.status('Finding a scene your sources have ready…', true);
          const st = await this.stage(tok); if (tok !== this.tok) return;
          if (st === 'retry') continue;
          if (!st) { this.dry = true; if (!this.cur) this.blocked(this.miss >= this.MAX_MISS ? 'miss' : 'empty'); else $('#pkNext').textContent = ''; return; }
          this.staged = st;
        }
        const st = this.staged; this.staged = null;
        if (this.cur) $('#pkNext').innerHTML = `<span class="spin"></span>Up next: ${esc(st.meta.name)}`;
        const clip = await this.load(st, tok); if (tok !== this.tok) return;
        if (!clip) { this.miss++; if (this.miss >= this.MAX_MISS && !this.cur) { this.blocked('miss'); return; } continue; }
        this.next = clip;
        if (!this.cur) this.advance();
        else $('#pkNext').innerHTML = `<span class="pk-dot"></span>Up next: ${esc(clip.meta.name)}`;
      }
      // the film after next is looked up while this scene plays, so a skip never waits on addons
      if (tok === this.tok && this.on && !this.staged && this.cur) { const st = await this.stage(tok); if (tok === this.tok && !st) this.dry = true; else if (tok === this.tok && st !== 'retry') this.staged = st; }
    } finally {
      if (tok === this.tok) {
        this.busy = false;
        // a scene was used up while a lookup ran: carry on, unless the films have run out
        if (this.on && this.cur && !this.dry && (!this.next || !this.staged)) setTimeout(() => this.fill(), 60);
      }
    }
  },
  /* TV: the scene on screen stops, then the next one loads into the same video element */
  async loadLazy(n, old) {
    const tok = this.tok, v = this.vids[0]; this.next = null; this.cur = null;
    if (old) this.unload(old.v);
    this.el.classList.add('pk-empty'); $('#pkInfo').innerHTML = ''; $('#pkNext').textContent = '';
    this.status(`Loading ${n.meta.name}…`, true);
    n.v = v; v._clip = n;
    const ok = await this.seekTo(v, n.url, n, tok);
    // a mood change while this loaded: free the only video element for the new mood's scenes
    if (tok !== this.tok) { if (v._clip === n) this.unload(v); return; }
    if (!ok) {
      this.unload(v);
      // the film's other cached source is tried before moving on to another film
      const alt = n.alt && n.alt.list.length ? await this.load(n.alt, tok) : null;
      if (tok !== this.tok) { if (alt && alt.v) this.unload(alt.v); return; }
      if (!alt) { this.miss++; this.advance(); return; }
      n = alt;
    }
    n.lazy = false; this.next = n; this.advance();
  },
  advance() {
    const n = this.next, old = this.cur;
    if (!n) {
      // nothing buffered yet: keep the last frame up and say what is happening
      if (old) { old.v.pause(); this.cur = null; this.unload(old.v); }
      this.el.classList.add('pk-empty'); $('#pkInfo').innerHTML = ''; this.fill(); this.status('Finding the next scene…', true); return;
    }
    if (n.lazy) { this.loadLazy(n, old); return; }
    this.next = null; this.cur = n; this.n++;
    const l = this.learn(); l.seen[n.meta.id] = Date.now(); this.saveLearn(l);
    n.v.muted = this.muted; n.startedAt = Date.now();
    n.v.play().catch(() => { n.v.muted = true; this.setMuted(true); n.v.play().catch(() => {}); });
    n.v.classList.add('on'); this.el.classList.remove('pk-empty');
    if (old) { old.v.classList.remove('on'); setTimeout(() => { if (old.v._clip === old) this.unload(old.v); this.fill(); }, 500); }
    this.render(); this.status(''); $('#pkNext').textContent = ''; this.wake();
    // the remote starts on Keep watching once there is something to keep watching
    if (IS_TV && !old) { Nav.mem.delete(this.el); Nav.focus($('#pkKeep'), true); }
    clearTimeout(this.silentT);
    // a file whose sound this device cannot decode plays silently: say so once it is clear, and move on
    this.silentT = setTimeout(() => { const c = this.cur; if (c === n && !c.v.paused && !c.v.muted && 'webkitAudioDecodedByteCount' in c.v && c.v.webkitAudioDecodedByteCount === 0) { this.status('That file had no sound this device can play, so here is the next scene.', false, 4000); this.advance(); } }, 4500);
    if (!old) this.fill();
  },
  tick(v) {
    const c = this.cur; if (!c || c.v !== v) return;
    const p = clamp((v.currentTime - c.offset) / this.CLIP, 0, 1);
    $('#pkBar').style.transform = `scaleX(${p.toFixed(4)})`;
    const f = `From ${fmtTime(v.currentTime)}`; if ($('#pkFrom').textContent !== f) $('#pkFrom').textContent = f;
    if (p >= 1) { this.feedback(c, 'full'); this.advance(); }
  },
  render() {
    const c = this.cur, m = c.meta, logo = metaLogo(m);
    $('#pkCount').textContent = `Scene ${this.n}`;
    $('#pkInfo').innerHTML = `
      <div class="pk-eye">${esc(fmtTime(c.offset))} of ${esc(fmtTime(c.d))} · ${esc([c.stream._tel.res, c.stream._addon].filter(Boolean).join(' · '))}</div>
      <div class="pk-logo">${logo ? imgTag(logo, m.name, m.id, { nofb: true, cls: 'hero-logo', lazy: false }) : ''}<h2 class="pk-title" data-logo-alt ${logo ? 'hidden' : ''}>${esc(m.name)}</h2></div>
      <div class="metaline">${[m.imdbRating ? `<span class="imdb ${rateTier(m.imdbRating)}"><b>IMDb</b>${esc(m.imdbRating)}</span>` : '', yearOf(m) ? `<span>${esc(yearOf(m))}</span>` : '', genresOf(m).slice(0, 3).map(esc).join(' · ')].filter(Boolean).join('')}</div>`;
    $('#pkFrom').textContent = `From ${fmtTime(c.offset)}`;
  },
  status(msg, spin, ms) {
    const s = $('#pkStatus'); clearTimeout(this.stT);
    if (!msg) { s.hidden = true; return; }
    s.hidden = false; s.innerHTML = `${spin ? '<span class="spin"></span>' : ''}<span>${esc(msg)}</span>`;
    if (ms) this.stT = setTimeout(() => { s.hidden = true; }, ms);
  },
  blocked(why) {
    const msg = {
      none: ['Peak Cinema needs a stream addon', 'It plays scenes from sources your debrid service already has cached. Add a stream addon, and your debrid key in Settings › Debrid.'],
      miss: ['No cached copies turned up', `The last ${this.MAX_MISS} films had no cached source in a format this device can play. Try another mood, or check your debrid key in Settings › Debrid.`],
      empty: ['That is every film for now', 'Your catalogs have no more films for this mood. Try another one.'],
    }[why];
    const s = $('#pkStatus'); s.hidden = false; this.el.classList.add('pk-empty');
    s.innerHTML = `<div class="pk-block"><h3>${esc(msg[0])}</h3><p>${esc(msg[1])}</p><div class="pk-how-acts">${why === 'none' ? '<button class="btn btn-prime" type="button" data-nav data-pk="addons"><i data-lucide="puzzle"></i>Open addons</button>' : '<button class="btn btn-prime" type="button" data-nav data-pk="again"><i data-lucide="refresh-cw"></i>Keep looking</button>'}<button class="btn btn-ghost" type="button" data-nav data-pk="close">Close</button></div></div>`;
    icons();
    $$('[data-pk]', s).forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.pk;
      if (a === 'close') this.close();
      if (a === 'addons') { this.close(); $('#openAddons').click(); }
      if (a === 'again') { this.miss = 0; this.dry = false; this.used.clear(); this.fill(); }
    }));
    if (IS_TV) Nav.restore(true);
  },
  skip() { const c = this.cur; if (c && Date.now() - c.startedAt < 12000) this.feedback(c, 'skip'); this.advance(); this.wake(); },
  /* hooked: the full film opens in the normal player, from this second or from the very start, with all its sources */
  keep(fromStart) {
    const c = this.cur; if (!c) return;
    this.feedback(c, 'keep');
    const at = fromStart ? 0 : Math.floor(c.v.currentTime), streams = [c.stream, ...c.streams.filter((s) => s !== c.stream)];
    this.close();
    playStream({ meta: c.meta, video: null, streams }, c.stream, { startAt: at });
  },
  wake(stay) {
    if (!this.el) return; this.el.classList.remove('idle'); clearTimeout(this.idleT);
    if (!stay) this.idleT = setTimeout(() => { if (this.on && this.cur && $('#pkHowBox').hidden && $('#pkStatus').hidden) this.el.classList.add('idle'); }, 4200);
  },
  key(e) {
    if (!this.on || !$('#player').hidden) return;
    const k = e.key, tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    const idle = this.el.classList.contains('idle');
    // the first press on a quiet screen only brings the controls back
    if (idle && /^(Arrow|Enter$)/.test(k)) { e.preventDefault(); e.stopImmediatePropagation(); this.wake(); if (IS_TV || !document.activeElement || document.activeElement === document.body) Nav.restore(true); return; }
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); this.wake(); };
    if (k === 'MediaTrackNext' || k === 'ChannelUp' || k === 'ChannelDown' || e.keyCode === 427 || e.keyCode === 428 || k === 'n' || k === 'N') { stop(); this.skip(); return; }
    if (k === 'MediaPlayPause' || k === 'MediaPlay' || k === 'MediaPause' || k === 'k' || (k === ' ' && tag !== 'BUTTON')) { stop(); const c = this.cur; if (c) (c.v.paused ? c.v.play().catch(() => {}) : c.v.pause()); return; }
    if (k === 'm' || k === 'M') { stop(); this.setMuted(!this.muted); return; }
    this.wake();
  },
  /* the Home invitation, first thing under the featured banner */
  strip() {
    const rows = $('#homeRows'); if (!rows || $('#pkStrip')) return;
    rows.insertAdjacentHTML('afterbegin', `<section class="pk-strip" id="pkStrip" aria-label="Peak Cinema">
      <div class="pk-strip-t"><span class="pk-mark">Peak Cinema</span><h3>Can't decide? Surf scenes instead.</h3><p>Ninety seconds from the middle of one film, then the next, from sources your debrid service already has cached. Keep watching from that second, or start from the top.</p></div>
      <button class="btn btn-bolt" id="pkGo" type="button" data-nav><i data-lucide="film"></i><span class="sp-l">Start surfing<small>Scenes, back to back</small></span></button></section>`);
    $('#pkGo').onclick = () => this.open(); icons();
  },
  init() {
    this.el = this.build(); MENU_LAYERS.push('peak');
    document.addEventListener('keydown', (e) => this.key(e), true);
    // leaving the app pauses the scene; coming back picks it up again
    addEventListener('resize', () => { if (this.on) this.vids.forEach((v) => { if (v._clip) this.fit(v); }); });
    document.addEventListener('visibilitychange', () => {
      const c = this.cur; if (!this.on || !c) return;
      if (document.hidden) { if (!c.v.paused) { c.v.pause(); c.hiddenPause = true; } }
      else if (c.hiddenPause) { c.hiddenPause = false; c.v.play().catch(() => {}); }
    });
    // Android TV app 1.2 only hands Back to the page while an element with a known id shows; #remote is one of them,
    // so while Peak Cinema is open it holds that id whenever no floating prompt does
    const hook = tvBackHook; tvBackHook = function () { hook.apply(this, arguments); Peak.claimBack(); };
    const prevBack = back;
    back = function () {
      if (Peak.on && $('#player').hidden && !(typeof Saver !== 'undefined' && Saver.isOpen)) { if (!$('#pkHowBox').hidden) Peak.how(false); else Peak.close(); return; }
      return prevBack.apply(this, arguments);
    };
    const root = Nav.root.bind(Nav), start = Nav.start.bind(Nav);
    Nav.root = function () {
      if (Peak.on && $('#player').hidden && $('#castLayer').hidden && $('#partyLayer').hidden) return !$('#pkHowBox').hidden ? $('#pkHowBox') : (!$('#pkStatus').hidden && $('.pk-block', Peak.el)) ? $('#pkStatus') : Peak.el;
      return root();
    };
    Nav.start = function (r, list) {
      if (r === Peak.el) return list.find((el) => el.id === (Peak.cur ? 'pkKeep' : 'pkSkip')) || list[0];
      return start(r, list);
    };
    const home = renderHome;
    renderHome = function () { const p = home.apply(this, arguments); Peak.strip(); return p; };
    Peak.strip();
    COMMANDS.splice(1, 0, { label: 'Peak Cinema: surf scenes', icon: 'film', run: () => Peak.open() });
  },
};
Peak.init();
