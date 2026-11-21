
'use strict';
/* 2.87 Poster glow + stream badges */
(() => {
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('2.87a', e); } };
  if (typeof CFG_DEFAULTS === 'object') Object.assign(CFG_DEFAULTS, { glow: true, glowColor: '#4aa8ff', bdgStyle: 'classic', bdgOff: [] });
  ['glow', 'glowColor', 'bdgStyle', 'bdgOff'].forEach((k) => { if (!(k in CFG)) CFG[k] = CFG_DEFAULTS[k]; });

  /* ---------------- Poster glow ---------------- */
  const SW = [['#4aa8ff', 'Blue'], ['#2ee6ff', 'Cyan'], ['#ffffff', 'White'], ['#f5c451', 'Gold'], ['#ff8a3d', 'Orange'], ['#ff3b4e', 'Red'], ['#ff5fae', 'Pink'], ['#a66bff', 'Violet'], ['#3ee08f', 'Green']];
  const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); if (!m) return '74,168,255'; const n = parseInt(m[1], 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
  const Glow = {
    apply() {
      const de = document.documentElement, on = CFG.glow !== false;
      de.classList.toggle('mk-glow', on);
      const c = /^#[0-9a-f]{6}$/i.test(CFG.glowColor || '') ? CFG.glowColor : '#4aa8ff';
      de.style.setProperty('--glow', c); de.style.setProperty('--glow-c', rgb(c));
    },
    /* "From the poster": the poster's strongest colour, read once from a 24x36 copy and kept for the session */
    memo: new Map(),
    clear() { $$('.card').forEach((x) => { if (x._glw) { x._glw = 0; x.style.setProperty('--glow', ''); x.style.setProperty('--glow-c', ''); } }); },
    tint(card) {
      if (CFG.glow === false || CFG.glowColor !== 'poster' || !card || card._glw) return;
      const img = card.querySelector('.card-inner img'); const src = img && (img.currentSrc || img.src); if (!src || !/^https:/.test(src)) return;
      const put = (c) => { if (!c) return; card._glw = 1; card.style.setProperty('--glow', `rgb(${c})`); card.style.setProperty('--glow-c', c); };
      if (this.memo.has(src)) { put(this.memo.get(src)); return; }
      const t = new Image(); t.crossOrigin = 'anonymous'; t.decoding = 'async';
      t.onload = () => { const c = safe(() => {
        const cv = document.createElement('canvas'); cv.width = 24; cv.height = 36; const g = cv.getContext('2d'); g.drawImage(t, 0, 0, 24, 36);
        const d = g.getImageData(0, 0, 24, 36).data; let best = null, bw = -1;
        for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0, w = sat * mx; if (mx > 70 && w > bw) { bw = w; best = [r, gg, b]; } }
        if (!best || bw < 40) return '220,220,225';
        const k = 255 / Math.max(...best); return best.map((v) => Math.round(Math.min(255, v * k * .95))).join(',');
      }); if (c) { this.memo.set(src, c); if (this.memo.size > 400) this.memo.delete(this.memo.keys().next().value); put(c); } };
      // art that may not be read (no CORS): the film's genre colour instead
      t.onerror = () => { const c = safe(() => { const m = typeof S === 'object' && S.metas && S.metas.get(card.dataset.id); if (!m) return ''; const g = document.createElement('canvas').getContext('2d'); const gm = typeof GENRE_MOOD === 'object' ? GENRE_MOOD : {}; const k = (m.genres || m.genre || []).map((x) => gm[String(x).toLowerCase()]).find(Boolean); g.fillStyle = k ? k[0] : `hsl(${(typeof hash === 'function' ? hash(m.id || m.name) : 0) % 360}, 90%, 60%)`; return rgb(g.fillStyle); }); if (c) { this.memo.set(src, c); put(c); } };
      t.src = src;
    },
    html() {
      const cur = String(CFG.glowColor || '#4aa8ff').toLowerCase();
      return `<div class="set-row" id="glwRow"${CFG.glow === false ? ' hidden' : ''}><div><b>Glow color</b><small>Pick a colour, take it from each film (the rainbow button), or choose any colour with the last button.</small></div><div class="set-ctl glw-sw">${SW.map(([c, n]) => `<button type="button" data-nav data-glw="${c}" class="${cur === c ? 'on' : ''}" style="--c:${c}" aria-label="${esc(n)}" title="${esc(n)}"></button>`).join('')}<button type="button" data-nav data-glw="poster" class="glw-art${cur === 'poster' ? ' on' : ''}" aria-label="From the poster" title="From the poster"></button><input class="clr" type="color" id="glwPick" value="${esc(/^#[0-9a-f]{6}$/.test(cur) ? cur : '#4aa8ff')}" aria-label="Your own colour"></div></div>`;
    },
    bind() {
      const row = document.getElementById('glwRow'); if (!row) return;
      const pick = (c) => { setCfg('glowColor', c); $$('[data-glw]', row).forEach((b) => b.classList.toggle('on', b.dataset.glw === c)); const i = $('#glwPick', row); if (i && c !== 'poster') i.value = c; Glow.clear(); };
      $$('[data-glw]', row).forEach((b) => b.addEventListener('click', () => pick(b.dataset.glw)));
      const i = $('#glwPick', row); if (i) i.addEventListener('input', () => pick(i.value.toLowerCase()));
    },
  };
  window.MkGlow = Glow;
  const near = (e) => e.target && e.target.closest && e.target.closest('.card');
  document.addEventListener('pointerover', (e) => { if (CFG.glowColor === 'poster') Glow.tint(near(e)); }, { passive: true });
  document.addEventListener('focusin', (e) => { if (CFG.glowColor === 'poster') Glow.tint(near(e)); });
  CFG_HOOKS.push((k) => { if (k === 'glow' || k === 'glowColor') { Glow.apply(); if (k === 'glow') { const r = document.getElementById('glwRow'); if (r) r.hidden = CFG.glow === false; } } if (k === 'bdgStyle' || k === 'bdgOff') Bdg.apply(); });

  /* ---------------- Stream badges ---------------- */
  const Bdg = {
    STYLES: [['classic', 'Classic'], ['glass', 'Glass'], ['solid', 'Solid'], ['neon', 'Neon'], ['outline', 'Outline'], ['minimal', 'Minimal'], ['light', 'Light'], ['mono', 'Black and white'], ['pastel', 'Pastel']],
    GROUPS: [['ed', 'Editions', 'IMAX, Director’s Cut, Extended and others'], ['src', 'Release type', 'Remux, Blu-ray, WEB-DL, WEBRip, TV recording, camera copy'], ['svc', 'Streaming service', 'Where a web release came from'], ['vid', 'Video details', '10-bit, 12-bit, 60 fps, HLG'], ['lang', 'Audio language and subtitles', 'Audio languages, Multi audio, Dubbed, Subtitles']],
    ED: [[/\bimax\b/, 'IMAX'], [/director'?s[\s._-]?cut/, 'Director’s Cut'], [/\bextended\b/, 'Extended'], [/\bunrated\b/, 'Unrated'], [/\buncut\b/, 'Uncut'], [/\bremaster(ed)?\b/, 'Remastered'], [/\bcriterion\b/, 'Criterion'], [/\btheatrical\b/, 'Theatrical'], [/\bopen[\s._-]?matte\b/, 'Open Matte'], [/\bfinal[\s._-]?cut\b/, 'Final Cut'], [/\bspecial[\s._-]?edition\b/, 'Special Edition'], [/\banniversary\b/, 'Anniversary'], [/\bdirectors?[\s._-]?edition\b/, 'Director’s Edition']],
    SRC: [[/\bremux\b/, 'Remux'], [/\b(uhd[\s._-]?blu-?ray|blu-?ray|bdrip|brrip|bd25|bd50|bd-?rip)\b/, 'Blu-ray'], [/\bweb[\s._-]?dl\b|\bwebdl\b/, 'WEB-DL'], [/\bweb-?rip\b/, 'WEBRip'], [/\bhdtv\b|\bpdtv\b/, 'TV recording'], [/\bdvd(rip|5|9|r)?\b/, 'DVD'], [/\b(hd)?cam(rip)?\b|\btelesync\b|\bhdts\b|\bhd-ts\b/, 'Camera copy']],
    SVC: [[/\b(nf|netflix)\b/, 'Netflix'], [/\b(amzn|amazon)\b/, 'Prime Video'], [/\b(dsnp|dsny|disney\+?)\b/, 'Disney+'], [/\b(atvp|aptv)\b/, 'Apple TV+'], [/\b(hmax|hbo[\s._-]?max)\b/, 'Max'], [/\bhulu\b/, 'Hulu'], [/\b(pmtp|paramount\+?)\b/, 'Paramount+'], [/\b(pcok|peacock)\b/, 'Peacock'], [/\bcrav\b/, 'Crave'], [/\bstan\b/, 'Stan'], [/\b(htsr|hotstar|jiohotstar)\b/, 'JioHotstar'], [/\bzee5\b/, 'ZEE5'], [/\bmubi\b/, 'MUBI'], [/\bcrunchyroll\b|\bcrunchy\b/, 'Crunchyroll'], [/\b(itunes)\b/, 'iTunes'], [/\bbbc[\s._-]?iplayer\b/, 'BBC iPlayer'], [/\btubi\b/, 'Tubi'], [/\bsho\b|\bshowtime\b/, 'Showtime'], [/\bstarz\b/, 'Starz'], [/\bvikiv?\b/, 'Viki']],
    off(g) { return Array.isArray(CFG.bdgOff) && CFG.bdgOff.includes(g); },
    extra(s, t) {
      if (!t || t.isTrailer || t.kind === 'yt') return [];
      const bh = s.behaviorHints || {};
      const raw = [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' ');
      const T = raw.toLowerCase().replace(/[._]/g, ' ');
      const out = [], one = (list) => { const f = list.find(([re]) => re.test(T)); return f && f[1]; };
      if (!this.off('ed')) this.ED.forEach(([re, l]) => { if (re.test(T) && out.length < 3) out.push(['bx-ed', l]); });
      if (!this.off('src') && !t.release) { const r = one(this.SRC); if (r) out.push([r === 'Remux' ? 'bx-src bx-hero' : r === 'Camera copy' ? 'bx-src warn' : 'bx-src', r]); }
      if (!this.off('svc') && /\bweb\b|web[\s-]?(dl|rip)/.test(T)) { const v = one(this.SVC); if (v) out.push(['bx-svc', v]); }
      if (!this.off('vid')) {
        const b = (T.match(/\b(10|12)[\s-]?bit\b/) || [])[1]; if (b) out.push(['bx-vid', `${b}-bit`]);
        const f = (T.match(/\b(50|60|120)\s?fps\b/) || [])[1]; if (f) out.push(['bx-vid', `${f} fps`]);
        if (/\bhlg\b/.test(T) && !t.hdr) out.push(['bx-vid', 'HLG']);
      }
      // warnings: picture that may look wrong on many screens
      if (t.hdr === 'Dolby Vision' && !/\bhdr(10)?\b|hdr10\+|\bhybrid\b/.test(T)) out.push(['warn bx-warn', 'Dolby Vision only']);
      if (/\bupscaled?\b|\bai[\s-]?upscal/.test(T)) out.push(['warn bx-warn', 'Upscaled']);
      if (!this.off('lang')) {
        if (!(t.langs && t.langs.length) && typeof AudioPref === 'object') {
          const r = safe(() => AudioPref.langs(s)) || { langs: new Set(), multi: false };
          if (r.multi) out.push(['bx-lang', /\bdual\b/.test(T) ? 'Dual audio' : 'Multi audio']);
          const ls = [...r.langs].filter((l) => /^[a-z]{2,3}$/.test(l)).slice(0, 3);
          if (ls.length) out.push(['bx-lang', ls.map((l) => l.toUpperCase()).join(' · ')]);
        }
        if (/\bdub(bed)?\b/.test(T)) out.push(['bx-lang', 'Dubbed']);
        if (/\b(e?subs?|subbed|subtitled|multi[\s-]?subs?)\b/.test(T)) out.push(['bx-lang', 'Subtitles']);
      }
      return out;
    },
    hero(h) {
      return h.replace(/<span class="tb res k4">/g, '<span class="tb res k4 bx-hero">').replace(/<span class="tb hdr">Dolby Vision/g, '<span class="tb hdr bx-hero">Dolby Vision').replace(/<span class="tb aud">Atmos/g, '<span class="tb aud bx-hero">Atmos');
    },
    apply() { const de = document.documentElement; const v = this.STYLES.some(([k]) => k === CFG.bdgStyle) ? CFG.bdgStyle : 'classic'; if (v === 'classic') de.removeAttribute('data-bdg'); else de.setAttribute('data-bdg', v); },
    sample() {
      const s = { name: 'Sample', title: 'Film.2024.IMAX.2160p.AMZN.WEB-DL.DV.HDR10.DDP5.1.Atmos.10bit.MULTi.ESub', url: 'https://example.invalid/a.mp4' };
      const t = Telemetry.parse(s); t.cached = true; return Telemetry.badges(s, t, '', true);
    },
    html() {
      const off = Array.isArray(CFG.bdgOff) ? CFG.bdgOff : [];
      return `<div class="set-group">Stream badges</div>
        <div class="set-row"><div><b>Badge style</b><small>How the labels on each source look.</small><div class="tele bdg-prev" id="bdgPrev">${safe(() => this.sample()) || ''}</div></div><div class="set-ctl"><select class="sel" id="bdgStyle" aria-label="Badge style">${this.STYLES.map(([k, l]) => `<option value="${k}"${(CFG.bdgStyle || 'classic') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
        ${this.GROUPS.map(([g, l, h]) => `<div class="set-row"><div><b>${esc(l)}</b><small>${esc(h)}</small></div><div class="set-ctl"><button class="switch ${off.includes(g) ? '' : 'on'}" type="button" role="switch" data-nav data-bdgg="${g}" aria-checked="${!off.includes(g)}" aria-label="${esc(l)}"></button></div></div>`).join('')}`;
    },
    bind() {
      const sel = document.getElementById('bdgStyle'); if (!sel) return;
      const prev = () => { const p = document.getElementById('bdgPrev'); if (p) p.innerHTML = safe(() => this.sample()) || ''; };
      sel.addEventListener('change', () => { setCfg('bdgStyle', sel.value); prev(); });
      $$('[data-bdgg]').forEach((b) => b.addEventListener('click', () => {
        const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
        const set = new Set(Array.isArray(CFG.bdgOff) ? CFG.bdgOff : []); if (on) set.delete(b.dataset.bdgg); else set.add(b.dataset.bdgg);
        setCfg('bdgOff', [...set]); prev();
      }));
    },
  };
  window.MkBadges = Bdg;

  safe(() => {
    if (typeof Telemetry !== 'object' || typeof Telemetry.badges !== 'function') return;
    const base = Telemetry.badges;
    Telemetry.badges = function (s, tel) {
      const h = base.apply(this, arguments);
      return safe(() => { const x = Bdg.extra(s || {}, tel); return Bdg.hero(h) + x.map(([c, l]) => `<span class="tb ${c}">${esc(l)}</span>`).join(''); }) || h;
    };
  });

  /* ---------------- Settings rows ---------------- */
  safe(() => {
    const ap = typeof secById === 'function' && secById('appearance');
    if (ap) {
      const rows = ap.rows, bind = ap.bind;
      ap.rows = () => { const r = rows(); const at = r.findIndex((x) => x.key === 'cardInfo'); r.splice(at >= 0 ? at + 1 : r.length, 0,
        { key: 'glow', label: 'Poster glow', help: 'A soft glow around the film or series you point at or reach with the remote.', type: 'toggle', get: () => CFG.glow !== false },
        { html: () => Glow.html() }); return r; };
      ap.bind = function () { const v = bind ? bind.apply(this, arguments) : undefined; safe(() => Glow.bind()); return v; };
    }
    const st = typeof secById === 'function' && secById('streams');
    if (st) {
      const rows = st.rows, bind = st.bind;
      st.rows = () => [...rows(), { html: () => Bdg.html() }];
      st.bind = function () { const v = bind ? bind.apply(this, arguments) : undefined; safe(() => Bdg.bind()); return v; };
    }
  });
  Glow.apply(); Bdg.apply();
})();
