
'use strict';
/* 2.87 Live TV extras */
(() => {
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('2.87d', e); } };
  if (typeof Channels === 'undefined' || typeof X8 === 'undefined') return;
  const C = Channels;
  if (typeof CFG_DEFAULTS === 'object') Object.assign(CFG_DEFAULTS, { chClean: false, chBackup: true, clockShow: 'off' });
  ['chClean', 'chBackup', 'clockShow'].forEach((k) => { if (!(k in CFG)) CFG[k] = CFG_DEFAULTS[k]; });

  /* ---- names and logos: your own edits, and an optional tidy-up. The original name stays the channel's key, so
     favourites, hidden channels and the guide keep matching. ---- */
  C.key = (ch) => `${ch.list}|${ch.tvgId || ch._on || ch.name}`;
  const edits = () => (C.get().edits || {});
  const TIDY = [/^\s*(\[[^\]]{1,12}\]|\([^)]{1,12}\))\s*/, /^\s*[A-Z]{2,3}\s*[:|\-–»]+\s*/, /^\s*[A-Z]{2,3}\s*\|\s*/, /\s*[|\-–]?\s*\b(FHD|UHD|HD|SD|HEVC|H265|4K|1080p?|720p?|50fps|60fps)\b\s*$/i, /\s*\b(FHD|UHD|HD|SD)\b\s*$/i, /\s*ᴴᴰ|ᶠᴴᴰ|ᵁᴴᴰ|ˢᴰ/g, /^\s*24\/7\s*[:|\-–]?\s*/i, /\s*\[[^\]]*\]\s*$/];
  const tidy = (n) => { let x = String(n || ''); for (let i = 0; i < 3; i++) TIDY.forEach((re) => { x = x.replace(re, ' ').trim(); }); return x.replace(/\s{2,}/g, ' ').trim() || String(n || ''); };
  const dress = (d) => {
    if (!d || !Array.isArray(d.channels)) return d;
    const e = edits();
    d.channels.forEach((c) => {
      if (c._on == null) { c._on = c.name; c._ol = c.logo || ''; }
      const x = e[C.key(c)] || {};
      c.name = x.name || (CFG.chClean ? tidy(c._on) : c._on);
      c.logo = x.logo || c._ol;
    });
    return d;
  };
  safe(() => {
    const ld = C.load;
    C.load = async function () { return dress(await ld.apply(this, arguments)); };
    // the guide is matched on the playlist's own names
    const px = C.parseXMLTV;
    C.parseXMLTV = function (text, chans) {
      const list = Array.isArray(chans) ? chans : [];
      const keep = list.map((c) => c.name); list.forEach((c) => { if (c._on != null) c.name = c._on; });
      try { return px.apply(this, arguments); } finally { list.forEach((c, i) => { c.name = keep[i]; }); }
    };
  });
  const redress = () => { C.data.forEach((d) => dress(d)); safe(() => { if (S.view === 'tv') C.renderGuide(); }); };
  const saveEdit = (c, patch) => {
    const d = C.get(), e = { ...(d.edits || {}) }, k = C.key(c), cur = { ...(e[k] || {}), ...patch };
    Object.keys(cur).forEach((x) => { if (!cur[x]) delete cur[x]; });
    if (Object.keys(cur).length) e[k] = cur; else delete e[k];
    d.edits = e; C.save(d); redress();
  };
  const ask = (c) => {
    X8.layer('chEdit2', { label: 'Edit channel', icon: 'pencil', eyebrow: 'Channel' });
    const b = X8.body('chEdit2'), x = edits()[C.key(c)] || {};
    b.innerHTML = `<h3 class="x8-h">${esc(c._on || c.name)}</h3>
      <div class="rt-form">
        <label>Name<input class="inp" id="ceName" data-nav value="${esc(x.name || '')}" placeholder="${esc(c._on || c.name)}" autocomplete="off"></label>
        <label>Logo link (https)<input class="inp mono" id="ceLogo" data-nav value="${esc(x.logo || '')}" placeholder="https://…/logo.png" spellcheck="false" autocomplete="off"></label>
      </div>
      <div class="actions"><button class="btn btn-prime" type="button" data-nav id="ceSave"><i data-lucide="check"></i>Save</button><button class="btn btn-ghost" type="button" data-nav id="ceReset"><i data-lucide="undo-2"></i>Back to the playlist's</button></div>`;
    icons(); X8.open('chEdit2');
    $('#ceSave').onclick = () => {
      const name = $('#ceName').value.trim().slice(0, 80), logo = $('#ceLogo').value.trim();
      if (logo && !/^https:\/\/[^\s"'<>]+$/i.test(logo)) { toast('The logo link must start with https://', 'err', 3500); return; }
      saveEdit(c, { name, logo }); X8.close('chEdit2'); toast('Channel saved', 'ok', 2000);
    };
    $('#ceReset').onclick = () => { saveEdit(c, { name: '', logo: '' }); X8.close('chEdit2'); toast('Back to the playlist’s name and logo', 'ok', 2400); };
  };
  window.MkChEdit = { ask, tidy };

  /* ---- recordings by time, once or repeating ---- */
  const RT = {
    K: 'mkc:recTimed',
    all() { try { const v = JSON.parse(localStorage.getItem(this.K) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
    save(l) { try { localStorage.setItem(this.K, JSON.stringify(l.slice(0, 40))); } catch (e) { /* storage full */ } },
    DAYS: { once: null, daily: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] },
    hm(t) { return new Date(t).toLocaleTimeString(typeof appLocale === 'function' ? appLocale() : undefined, { hour: '2-digit', minute: '2-digit' }); },
    scan() {
      if (!window.MkRec) return;
      const l = this.all(); if (!l.length) return;
      const t = Date.now(), chans = C.all(); let changed = false;
      l.forEach((r) => {
        const c = chans.find((x) => x.url === r.url); if (!c) return;
        for (let i = 0; i < 3; i++) {
          const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i);
          const st = d.getTime() + (r.h * 60 + r.m) * 60e3, en = st + r.len * 60e3;
          if (r.once ? st !== r.once : !(this.DAYS[r.rep] || []).includes(d.getDay())) continue;
          if (en <= t || st > t + 2 * 864e5) continue;
          if (MkRec.plans().some((x) => x.url === c.url && x.start === st)) continue;
          safe(() => MkRec.plan(c, { title: r.title || c.name, start: st, end: en }, true));
        }
        if (r.once && r.once + r.len * 60e3 < t) { r.done = true; changed = true; }
      });
      if (changed) this.save(l.filter((r) => !r.done));
    },
    open(c) {
      X8.layer('recTimed', { label: 'Schedule a recording', icon: 'calendar-clock', eyebrow: 'Recording' });
      const b = X8.body('recTimed'); let rep = 'once', len = 60, when = 0;
      const now0 = new Date(Date.now() + 5 * 60e3), hh = String(now0.getHours()).padStart(2, '0'), mm = String(now0.getMinutes()).padStart(2, '0');
      const paint = () => {
        b.innerHTML = `<h3 class="x8-h">Record ${esc(c.name)}</h3>
        <div class="rt-form">
          <label>Starts at<input class="inp" type="time" id="rtAt" data-nav value="${hh}:${mm}"></label>
          <div><span class="sub">How long</span><div class="segc" role="radiogroup">${[[30, '30 min'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours'], [180, '3 hours']].map(([v, tx]) => `<button type="button" data-nav data-rtl="${v}" class="${v === len ? 'on' : ''}">${tx}</button>`).join('')}</div></div>
          <div><span class="sub">Repeat</span><div class="segc" role="radiogroup">${[['once', 'Once'], ['daily', 'Every day'], ['weekdays', 'Weekdays'], ['weekends', 'Weekends']].map(([v, tx]) => `<button type="button" data-nav data-rtr="${v}" class="${v === rep ? 'on' : ''}">${tx}</button>`).join('')}</div></div>
          ${rep === 'once' ? `<div><span class="sub">Day</span><div class="segc" role="radiogroup">${[[0, 'Today'], [1, 'Tomorrow']].map(([v, tx]) => `<button type="button" data-nav data-rtd="${v}" class="${v === when ? 'on' : ''}">${tx}</button>`).join('')}</div></div>` : ''}
        </div>
        <p class="tour-note">${MkRec.nat && MkRec.nat() ? 'The app starts it even if it’s closed.' : 'Keep MKCinema open in a tab at that time.'}</p>
        <div class="actions"><button class="btn btn-prime" type="button" data-nav id="rtGo"><span class="rec-dot"></span>Schedule</button></div>`;
        icons();
        const at = $('#rtAt'); const keepAt = at.value;
        $$('[data-rtl]', b).forEach((x) => x.addEventListener('click', () => { len = Number(x.dataset.rtl); const v = $('#rtAt').value; paint(); $('#rtAt').value = v; }));
        $$('[data-rtr]', b).forEach((x) => x.addEventListener('click', () => { rep = x.dataset.rtr; const v = $('#rtAt').value; paint(); $('#rtAt').value = v; }));
        $$('[data-rtd]', b).forEach((x) => x.addEventListener('click', () => { when = Number(x.dataset.rtd); const v = $('#rtAt').value; paint(); $('#rtAt').value = v; }));
        void keepAt;
        $('#rtGo').onclick = () => {
          const m = /^(\d{1,2}):(\d{2})/.exec($('#rtAt').value || ''); if (!m) { toast('Pick a start time', 'err', 3000); return; }
          const h = +m[1], mi = +m[2], d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + when);
          const once = rep === 'once' ? d.getTime() + (h * 60 + mi) * 60e3 : 0;
          if (once && once + len * 60e3 <= Date.now()) { toast('That time has already passed today. Pick Tomorrow.', 'err', 4000); return; }
          const l = this.all(); l.push({ id: `t${Date.now().toString(36)}`, url: c.url, ch: c.name, logo: c.logo || '', title: c.name, h, m: mi, len, rep, once });
          this.save(l); X8.close('recTimed'); this.scan();
          { const at2 = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; toast(rep === 'once' ? `${c.name} will record at ${this.hm(once)}.` : rep === 'daily' ? `${c.name} will record at ${at2} (every day).` : rep === 'weekdays' ? `${c.name} will record at ${at2} (on weekdays).` : `${c.name} will record at ${at2} (at weekends).`, 'ok', 5000, 'rec'); }
        };
      };
      paint(); X8.open('recTimed');
    },
  };
  window.MkRecTimed = RT;
  setInterval(() => safe(() => RT.scan()), 5 * 60e3);
  setTimeout(() => safe(() => RT.scan()), 8000);

  /* ---- the channel menu: Edit and Schedule ---- */
  safe(() => {
    const menu = C.menu;
    C.menu = function (c) {
      const r = menu.apply(this, arguments);
      safe(() => {
        const b = X8.body('chMenu'), box = b && b.querySelector('.lt-menu'); if (!box) return;
        const row = (act, icon, t) => `<button class="xt-row" type="button" data-nav data-act2="${act}"><i data-lucide="${icon}"></i><span><b>${t}</b></span></button>`;
        box.insertAdjacentHTML('beforeend', `${row('edit', 'pencil', 'Rename or change logo')}${window.MkRec ? row('rect', 'calendar-clock', 'Schedule a recording') : ''}`);
        icons();
        $$('[data-act2]', b).forEach((x) => x.addEventListener('click', () => { X8.close('chMenu'); if (x.dataset.act2 === 'edit') ask(c); else RT.open(c); }));
      });
      return r;
    };
  });

  /* ---- backup channel: same name in another group or playlist ---- */
  const norm = (n) => tidy(n).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  safe(() => {
    const ps = playStream;
    playStream = function (ctx, stream, opts) {
      safe(() => {
        if (CFG.chBackup === false || !ctx || !ctx.meta || !ctx.meta._iptv || !Array.isArray(ctx.streams) || ctx.streams.length !== 1 || ctx._mkBk) return;
        const c0 = ctx.meta._iptv, n0 = norm(c0._on || c0.name); if (!n0) return;
        const alts = C.all().filter((c) => c !== c0 && c.url && c.url !== c0.url && norm(c._on || c.name) === n0 && !X8.mixedBlocked(c.url)).slice(0, 4);
        if (!alts.length) return;
        ctx._mkBk = true;
        alts.forEach((c) => { const st = C.stream(c); st._tel.score -= 1; st._mkBackup = c; ctx.streams.push(st); });
      });
      return ps.apply(this, arguments);
    };
  });

  /* ---- clock on screen while watching ---- */
  const Clock = {
    el: null, t: 0,
    paint() {
      const p = document.getElementById('player'); if (!p) return;
      if (!this.el) { p.insertAdjacentHTML('beforeend', '<div id="mkClock" aria-hidden="true"></div>'); this.el = document.getElementById('mkClock'); }
      const mode = CFG.clockShow || 'off', open = !p.hidden;
      this.el.classList.toggle('on', open && mode !== 'off'); this.el.classList.toggle('ctl', mode === 'controls');
      if (open && mode !== 'off') this.el.textContent = new Date().toLocaleTimeString(typeof appLocale === 'function' ? appLocale() : undefined, { hour: '2-digit', minute: '2-digit' });
    },
  };
  setInterval(() => safe(() => Clock.paint()), 15000);
  safe(() => { const ps = playStream; playStream = function () { const r = ps.apply(this, arguments); setTimeout(() => safe(() => Clock.paint()), 300); return r; }; });
  CFG_HOOKS.push((k) => { if (k === 'clockShow') safe(() => Clock.paint()); if (k === 'chClean') safe(() => redress()); });

  /* ---- settings rows (Playback) ---- */
  safe(() => {
    const pb = typeof secById === 'function' && secById('playback');
    if (!pb) return;
    const rows = pb.rows;
    pb.rows = () => [...rows(),
      { group: 'Live TV' },
      { key: 'chClean', label: 'Tidy channel names', help: 'Takes country tags, quality tags and 24/7 off channel names, so “US: CNN HD” shows as “CNN”. Your own names always win.', type: 'toggle' },
      { key: 'chBackup', label: 'Switch to a backup channel', help: 'If a channel won’t play, the same channel from another group or playlist takes over.', type: 'toggle', get: () => CFG.chBackup !== false },
      { key: 'clockShow', label: 'Clock on screen', help: 'The time in the corner while you watch.', type: 'seg', options: [['off', 'Off'], ['controls', 'With the controls'], ['always', 'Always']] }];
  });
})();
