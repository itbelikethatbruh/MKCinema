# MKCinema 2.7.25 (Dee, 2026-11-04): wallpapers with 3D titles.
# 1. Home's featured banner becomes a full-bleed wallpaper on TVs and desktops: the film's key art runs edge to edge under
#    the dock, drifts slowly (a compositor-only transform), and the title logo sits on it with a 3D edge (rim light, a few
#    hard layers of thickness, a soft cast shadow) and pops forward each time the film changes. Desktops add a gentle
#    mouse parallax (art and title move against each other). Phones keep the rounded banner but get the 3D title and a
#    short settle-in of the art. Every slot keeps the fixed sizes from 2.7.20.
# 2. A screensaver: after a few idle minutes (TV 3, desktop 10, phones off; Settings > Home), the screen fills with
#    official key art and 3D title logos from Home, your watchlist and Continue watching, plus a clock. Any button (or
#    Back on the remote) returns you exactly where you were. It never starts while anything plays.
# Usage: python3 2.7.25-wallpapers.py index.html sw.js   (idempotent; bumps the version only when it applies)
import re, sys
p, swp = sys.argv[1], sys.argv[2]; s = open(p).read()
if 'id="saver"' in s or "const Saver = {" in s:
    print('already applied'); sys.exit(0)
def rep(a, b):
    global s
    assert s.count(a) == 1, ('anchor', s.count(a), a[:90])
    s = s.replace(a, b)

# ---------- showHero: drifting art + 3D title wrapper ----------
rep("const img = bg.lastElementChild; img.style.position = 'absolute'; img.style.inset = '0'; img.style.opacity = '0'; img.draggable = false;",
    "const img = bg.lastElementChild; img.style.position = 'absolute'; img.style.inset = '0'; img.style.opacity = '0'; img.draggable = false; img.classList.add('wp');")
rep("""$('#heroLogoWrap').innerHTML = `${logo ? imgTag(logo, m.name, m.id, { nofb: true, cls: 'hero-logo', lazy: false }) : ''}<h1 class="hero-title" data-logo-alt ${logo ? 'hidden' : ''}>${esc(m.name)}</h1>`;""",
    """$('#heroLogoWrap').innerHTML = `<div class="wp-logo">${logo ? imgTag(logo, m.name, m.id, { nofb: true, cls: 'hero-logo', lazy: false }) : ''}<h1 class="hero-title" data-logo-alt ${logo ? 'hidden' : ''}>${esc(m.name)}</h1></div>`;""")
# the banner does not advance behind the screensaver
rep("if (document.hidden || document.body.classList.contains('layer-open') || S.view !== 'home'",
    "if (document.hidden || document.body.classList.contains('layer-open') || document.body.classList.contains('saver-on') || S.view !== 'home'")

# ---------- Settings > Home ----------
hl = "{ key: 'hlStart', label: 'Open on', type: 'select', options: [['home', 'Home'], ['movie', 'Movies'], ['series', 'Series'], ['tv', 'Live TV'], ['library', 'Library'], ['calendar', 'Calendar']], get: () => Layout.get().start, set: (v) => Layout.set({ start: v }) },"
rep(hl, hl + """
    { key: 'saverAfter', label: 'Screensaver', help: 'Fills the screen with key art and 3D titles from your Home, watchlist and Continue watching when nothing has been pressed for a while. Any button brings you back. It never starts while something plays.', type: 'select', num: true, options: [[0, 'Off'], [1, 'After 1 minute'], [3, 'After 3 minutes'], [5, 'After 5 minutes'], [10, 'After 10 minutes'], [20, 'After 20 minutes']], get: () => Saver.after(), set: (v) => Saver.setAfter(v) },
    { key: 'saverNow', label: 'Preview the screensaver', type: 'button', text: 'Show now', icon: 'image', run: () => { closeLayer('settings'); setTimeout(() => Saver.open(true), 450); } },""")

# ---------- Styles + screensaver module (a new block after the last script) ----------
CSS = r"""<style>
/* ===== 2.7.25 Wallpapers: key art edge to edge, titles with a 3D edge, and an idle screensaver ===== */
/* The 3D title: a thin rim light on top, three hard dark layers for thickness, then a soft cast shadow.
   Painted once per film inside its own layer; only transform and opacity ever animate. */
.wp-logo{display:flex;align-items:flex-end;height:100%;max-width:100%;min-width:0;transform-origin:0 100%}
/* three chained hard shadows at 1x, 2x and 4x the offset fill a solid edge seven steps deep, lighter near the face */
#heroLogoWrap .wp-logo .hero-logo,.sv-logo .hero-logo{filter:drop-shadow(0 -1px 0 rgba(255,255,255,.3)) drop-shadow(.6px 1px 0 #3a3a3f) drop-shadow(1.2px 2px 0 #222226) drop-shadow(2.4px 4px 0 #111113) drop-shadow(0 22px 26px rgba(0,0,0,.75))}
.wp-logo .hero-title{text-shadow:0 -1px 0 rgba(255,255,255,.3),.6px 1px 0 #3a3a3f,1.2px 2px 0 #2c2c30,1.8px 3px 0 #222226,2.4px 4px 0 #19191c,3px 5px 0 #111113,3.6px 6px 0 #0b0b0c,0 22px 34px rgba(0,0,0,.85)}
html.tv #heroLogoWrap .wp-logo .hero-logo{filter:drop-shadow(.6px 1px 0 #3a3a3f) drop-shadow(1.2px 2px 0 #222226) drop-shadow(2.4px 4px 0 #111113) drop-shadow(0 14px 16px rgba(0,0,0,.72))}
@keyframes wpPop{0%{opacity:0;transform:perspective(1000px) translate3d(0,28px,-170px) rotateX(26deg) scale(.86)}55%{opacity:1}100%{opacity:1;transform:perspective(1000px) translate3d(0,0,0) rotateX(0) scale(1)}}
body.fx .hero-body.swap .wp-logo{animation:wpPop 1.15s cubic-bezier(.16,1,.3,1) both}
/* the art drifts slowly toward you, like a camera easing in; it stops while the banner is off screen */
@keyframes wpDrift{from{transform:scale(1.13) translate3d(1.6%,.8%,0)}to{transform:scale(1.03) translate3d(-1.1%,-.3%,0)}}
@keyframes wpSettle{from{transform:scale(1.07)}to{transform:scale(1)}}
body.fx #heroBg img.wp{animation:wpDrift 20s cubic-bezier(.3,.1,.3,1) both}
body.fx #hero.still #heroBg img.wp{animation-play-state:paused}

/* TVs and desktops: the banner is a wallpaper, edge to edge and up under the dock. Its height is fixed by the screen,
   never by the film, so the rows below never move (2.7.20). */
@media (min-width:761px){
  #view-home>.hero{--hl:150px;--gut:calc(max(0px,(100vw - 1480px) / 2) + 16px + clamp(8px,2vw,40px));
    margin:calc(-28px - var(--dock-h) - env(safe-area-inset-top,0px)) calc(50% - 50vw) 28px;border-radius:0;border:0;background:var(--void);min-height:0;height:clamp(500px,88vh,940px)}
  #view-home>.hero::before{background:linear-gradient(90deg,rgba(0,0,0,.86) 0%,rgba(0,0,0,.5) 34%,rgba(0,0,0,.08) 62%,transparent 80%),linear-gradient(0deg,var(--void) 0%,rgba(0,0,0,.72) 16%,transparent 46%),linear-gradient(180deg,rgba(0,0,0,.6) 0%,transparent 22%)}
  #view-home>.hero .hero-body{padding:0 0 clamp(54px,9vh,104px) var(--gut);max-width:calc(var(--gut) + 700px)}
  #view-home>.hero .hero-logo{max-width:min(560px,100%)}
  #view-home>.hero .hero-dots{right:var(--gut);bottom:clamp(60px,9.6vh,110px)}
  #view-home>.hero .hero-nav.prev{left:max(12px,calc(var(--gut) - 64px))}
  #view-home>.hero .hero-nav.next{right:max(12px,calc(var(--gut) - 64px))}
}
@media (min-width:761px) and (orientation:landscape) and (max-height:540px){#view-home>.hero{--hl:96px;height:max(100vh,420px)}}
/* phones keep the rounded banner: the art settles in once instead of drifting under a scrolling page */
@media (max-width:760px){body.fx #heroBg img.wp{animation:wpSettle 1.8s cubic-bezier(.16,1,.3,1) both}}
/* desktops: art and title move against each other with the mouse */
@media (hover:hover) and (pointer:fine){
  html:not(.tv) body.fx #heroBg{transform:translate3d(calc(var(--mx,0) * -14px),calc(var(--my,0) * -9px),0) scale(1.03);transition:transform .7s cubic-bezier(.2,.8,.2,1)}
  html:not(.tv) body.fx #hero:not(.dragging) .hero-body{transform:translate3d(calc(var(--mx,0) * 9px),calc(var(--my,0) * 5px),0)}
}

/* ---------- Screensaver ---------- */
#saver{position:fixed;inset:0;z-index:9500;background:#000;opacity:0;transition:opacity 1.1s ease;overflow:hidden;cursor:none;contain:strict;color:#fff}
#saver[hidden]{display:none}
#saver.on{opacity:1}
#saver:not(.on){transition-duration:.4s}
.sv-s{position:absolute;inset:0;opacity:0;transition:opacity 1.6s ease}
.sv-s.on{opacity:1}
.sv-s>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
@keyframes svDrift{from{transform:scale(1.15) translate3d(2%,1%,0)}to{transform:scale(1.02) translate3d(-1.6%,-.6%,0)}}
@keyframes svDriftR{from{transform:scale(1.15) translate3d(-2%,1%,0)}to{transform:scale(1.02) translate3d(1.6%,-.6%,0)}}
body.fx .sv-s>img{animation:svDrift 24s linear both}
body.fx .sv-s.r>img{animation-name:svDriftR}
.sv-s::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.88) 0%,rgba(0,0,0,.35) 30%,transparent 55%),linear-gradient(90deg,rgba(0,0,0,.62) 0%,transparent 52%),linear-gradient(180deg,rgba(0,0,0,.45),transparent 18%)}
.sv-s.r::after{background:linear-gradient(0deg,rgba(0,0,0,.88) 0%,rgba(0,0,0,.35) 30%,transparent 55%),linear-gradient(270deg,rgba(0,0,0,.62) 0%,transparent 52%),linear-gradient(180deg,rgba(0,0,0,.45),transparent 18%)}
.sv-info{position:absolute;z-index:1;left:6vw;bottom:10vh;width:min(48vw,680px);display:flex;flex-direction:column;align-items:flex-start}
.sv-s.r .sv-info{left:auto;right:6vw;align-items:flex-end;text-align:right}
.sv-logo{height:clamp(96px,24vh,250px);width:100%;display:flex;align-items:flex-end;margin-bottom:20px}
.sv-s.r .sv-logo{justify-content:flex-end}
.sv-s.r .sv-logo .wp-logo{transform-origin:100% 100%;justify-content:flex-end}
.sv-logo .hero-logo{display:block;max-height:100%;max-width:100%;object-fit:contain;object-position:left bottom}
.sv-s.r .sv-logo .hero-logo{object-position:right bottom}
.sv-logo .hero-title{font-family:var(--f-display);font-weight:800;font-size:clamp(40px,6.4vw,96px);line-height:1;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sv-meta{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:clamp(14px,1.5vw,20px);color:#e4e4e8;text-shadow:0 1px 3px rgba(0,0,0,.9)}
.sv-s.r .sv-meta{justify-content:flex-end}
.sv-meta .imdb{font-size:.8em}
body.fx .sv-s.on .wp-logo{animation:wpPop 1.5s cubic-bezier(.16,1,.3,1) .45s both}
@keyframes svUp{from{opacity:0;transform:translate3d(0,14px,0)}}
body.fx .sv-s.on .sv-meta{animation:svUp 1s cubic-bezier(.16,1,.3,1) 1.1s both}
.sv-top{position:absolute;z-index:2;top:5vh;left:5vw;right:5vw;display:flex;align-items:center;justify-content:space-between;pointer-events:none}
.sv-brand{display:flex;align-items:center;gap:12px;font-family:var(--f-mono);font-size:12px;letter-spacing:.32em;color:rgba(255,255,255,.72)}
.sv-brand svg{width:34px;height:34px}
.sv-clock{font-family:var(--f-display);font-weight:600;font-size:clamp(26px,3.4vw,52px);letter-spacing:.01em;color:rgba(255,255,255,.9);text-shadow:0 2px 14px rgba(0,0,0,.7);font-variant-numeric:tabular-nums}
.sv-hint{position:absolute;z-index:2;left:0;right:0;bottom:3.6vh;text-align:center;font-family:var(--f-mono);font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:rgba(255,255,255,.55);opacity:0;animation:svHint 7s ease 1.2s both}
@keyframes svHint{0%{opacity:0}12%,72%{opacity:1}100%{opacity:0}}
/* once the screensaver covers everything, the app underneath stops painting */
body.saver-full #app{visibility:hidden}
@media (max-width:760px){.sv-info{width:auto;right:6vw}.sv-s.r .sv-info{left:6vw}.sv-logo{height:clamp(80px,16vh,150px)}}
</style>"""

JS = r"""<script>
/* =====================================================================
   2.7.25 Wallpapers: banner parallax + idle screensaver
   ===================================================================== */
// The banner's art pauses while it is off screen; desktops get a light mouse parallax
(() => {
  const hero = $('#hero'); if (!hero) return;
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => es.forEach((e) => hero.classList.toggle('still', !e.isIntersecting))).observe(hero);
  if (IS_TV || TOUCH_UI || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  let raf = 0, x = 0, y = 0;
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect(); x = ((e.clientX - r.left) / r.width - .5) * 2; y = ((e.clientY - r.top) / r.height - .5) * 2;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; hero.style.setProperty('--mx', x.toFixed(3)); hero.style.setProperty('--my', y.toFixed(3)); });
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { hero.style.setProperty('--mx', 0); hero.style.setProperty('--my', 0); });
})();

/* Screensaver: official key art with the title logo popping out in 3D, a clock and nothing else. It starts after the
   idle time in Settings › Home (TV 3 min, desktop 10, phones off), never while anything plays, and any button ends it. */
const Saver = {
  el: null, isOpen: false, last: Date.now(), tok: 0, list: [], i: 0, side: 0,
  after() { const v = Store.get('saverAfter', null); return v == null ? (IS_TV ? 3 : TOUCH_UI ? 0 : 10) : Number(v) || 0; },
  setAfter(v) { Store.set('saverAfter', Number(v) || 0); this.last = Date.now(); },
  init() {
    const poke = () => { this.last = Date.now(); };
    // Keys end the screensaver and are swallowed, so the first press never also moves or opens something underneath
    addEventListener('keydown', (e) => { poke(); if (!this.isOpen) return; e.preventDefault(); e.stopImmediatePropagation(); if (Date.now() - this.at > 500) this.close(); }, true);
    ['pointerdown', 'wheel', 'touchstart'].forEach((t) => addEventListener(t, poke, { capture: true, passive: true }));
    let px = -1, py = -1;
    addEventListener('pointermove', (e) => {
      if (!this.isOpen) { if (e.pointerType === 'mouse') poke(); return; }
      if (px < 0) { px = e.clientX; py = e.clientY; return; }
      if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) > 24 && Date.now() - this.at > 900) { px = -1; this.close(); }
    }, { capture: true, passive: true });
    this.resetMove = () => { px = -1; };
    setInterval(() => this.tick(), 10000);
    // Back on a TV remote (the Android TV app calls back() directly) closes the screensaver first
    const prev = back; back = function () { if (Saver.isOpen) { Saver.close(); return; } return prev.apply(this, arguments); };
  },
  tick() {
    const a = this.after(); if (!a || this.isOpen || Date.now() - this.last < a * 60000) return;
    if (this.allowed()) this.open();
  },
  allowed() {
    const b = document.body.classList, ae = document.activeElement;
    if (document.hidden || b.contains('intro-on') || b.contains('locked')) return false;
    if (!$('#player').hidden || !$('#trailer').hidden) return false;
    if ($$('video').some((v) => !v.paused && !v.ended)) return false;
    if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return false;
    return this.pool().length >= 2;
  },
  pool() {
    const seen = new Set(), out = [];
    const add = (m) => { if (!m || !m.id || seen.has(m.id) || !metaBg(m)) return; seen.add(m.id); out.push(m); };
    (S.hero || []).forEach(add); (S.watchlist || []).forEach(add);
    try { continueItems().forEach((p) => add({ id: p.metaId, type: p.type, name: p.name, background: p.background, genres: p.genres })); } catch (e) { /* no progress yet */ }
    return out;
  },
  build() {
    const el = document.createElement('div'); el.id = 'saver'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="sv-stage"></div><div class="sv-top"><div class="sv-brand"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="55" fill="none" stroke="url(#mkRing)" stroke-width="2"/><use href="#mkLetters" transform="translate(60 60) scale(.84)" fill="url(#mkPlat)"/></svg>MKCINEMA</div><div class="sv-clock"></div></div><div class="sv-hint">Press any button to return</div><i class="sv-back"></i>`;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (Date.now() - this.at > 500) this.close(); });
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    document.body.appendChild(el); return (this.el = el);
  },
  open(manual) {
    if (this.isOpen) return;
    const pool = this.pool(); if (pool.length < (manual ? 1 : 2)) { if (manual) toast('The screensaver needs a few titles on Home first.', 'info'); return; }
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
    const el = this.el || this.build();
    this.list = pool; this.i = 0; this.isOpen = true; this.at = Date.now(); this.resetMove();
    $('.sv-stage', el).innerHTML = ''; el.hidden = false; document.body.classList.add('saver-on');
    // The Android TV app forwards Back only while an element with a known id shows; borrow #remote if it is free
    if (IS_TV && !$('#remote')) $('.sv-back', el).id = 'remote';
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    clearTimeout(this.fullT); this.fullT = setTimeout(() => { if (this.isOpen) document.body.classList.add('saver-full'); }, 1300);
    const clock = $('.sv-clock', el), tickClock = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
    tickClock(); clearInterval(this.clk); this.clk = setInterval(tickClock, 15000);
    this.next();
  },
  load(src, ms) {
    return new Promise((res, rej) => {
      const img = new Image(); img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.alt = '';
      const t = setTimeout(() => rej(new Error('slow')), ms);
      img.onload = () => { clearTimeout(t); (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => res(img)); };
      img.onerror = () => { clearTimeout(t); rej(new Error('failed')); };
      img.src = src;
    });
  },
  async next() {
    const tok = ++this.tok;
    for (let tries = 0; tries < Math.min(this.list.length, 6); tries++) {
      const m = this.list[this.i++ % this.list.length], lg = metaLogo(m);
      let art, logo = null;
      try { [art, logo] = await Promise.all([this.load(metaBg(m), 9000), lg ? this.load(lg, 6000).catch(() => null) : null]); } catch (e) { if (tok !== this.tok) return; continue; }
      if (tok !== this.tok || !this.isOpen) return;
      this.paint(m, art, logo);
      this.cyc = setTimeout(() => this.next(), IS_TV ? 22000 : 18000);
      return;
    }
    if (tok === this.tok) this.cyc = setTimeout(() => this.next(), 30000);
  },
  paint(m, art, logo) {
    const stage = $('.sv-stage', this.el), olds = $$('.sv-s', stage);
    const s = document.createElement('div'); this.side ^= 1; s.className = `sv-s${this.side ? '' : ' r'}`;
    s.appendChild(art);
    const meta = [m.imdbRating ? `<span class="imdb ${rateTier(m.imdbRating)}"><b>IMDb</b>${esc(m.imdbRating)}</span>` : '', yearOf(m) ? `<span>${esc(yearOf(m))}</span>` : '', genresOf(m).slice(0, 3).map(esc).join(' · ')].filter(Boolean).join('');
    s.insertAdjacentHTML('beforeend', `<div class="sv-info"><div class="sv-logo"><div class="wp-logo"><h2 class="hero-title"></h2></div></div><div class="sv-meta">${meta}</div></div>`);
    const box = $('.wp-logo', s), h = $('.hero-title', s); h.textContent = m.name || '';
    if (logo) { logo.className = 'hero-logo'; box.insertBefore(logo, h); h.hidden = true; }
    stage.appendChild(s);
    requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('on')));
    olds.forEach((o) => { o.classList.remove('on'); setTimeout(() => o.remove(), 1700); });
  },
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; this.tok++; this.last = Date.now();
    clearTimeout(this.cyc); clearInterval(this.clk); clearTimeout(this.fullT);
    const el = this.el; document.body.classList.remove('saver-full'); el.classList.remove('on');
    const b = $('#remote', el); if (b) b.removeAttribute('id');
    setTimeout(() => {
      if (this.isOpen) return;
      el.hidden = true; $('.sv-stage', el).innerHTML = ''; document.body.classList.remove('saver-on');
      if (typeof tvBackHook === 'function') tvBackHook();
    }, 450);
  },
};
Saver.init();
</script>
"""

anchor = "    return failed(stream, reason);\n  };\n}\n</script>\n"
rep(anchor, anchor + JS + CSS + "\n")

old = re.search(r"const APP_VERSION = '([\d.]+)';", s).group(1)
s = s.replace(f"const APP_VERSION = '{old}';", "const APP_VERSION = '2.7.25';")
open(p, 'w').write(s)
sw = open(swp).read(); sw = re.sub(r"const VERSION = 'mkc-[\d.]+';", "const VERSION = 'mkc-2.7.25';", sw); open(swp, 'w').write(sw)
print('applied over', old)
