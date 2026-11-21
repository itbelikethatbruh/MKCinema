
'use strict';
/* 2.87 wave 5: channel audio memory, new episodes only, pinned source, calendar views */
(() => {
  const safe = (fn) => { try { return fn(); } catch (e) { console.warn('2.87e', e); } };
  if (typeof CFG_DEFAULTS === 'object') Object.assign(CFG_DEFAULTS, { chAvMemo: true, recNewOnly: false, pinAddon: '' });
  ['chAvMemo', 'recNewOnly', 'pinAddon'].forEach((k) => { if (!(k in CFG)) CFG[k] = CFG_DEFAULTS[k]; });
  const sameLang = (a, b) => {
    const x = String(a || '').toLowerCase(), y = String(b || '').toLowerCase(); if (!x || !y) return false;
    if (x === y) return true;
    const nx = typeof langName === 'function' ? langName(x) : x, ny = typeof langName === 'function' ? langName(y) : y;
    return (nx && ny && nx !== 'Unknown' && nx.toLowerCase() === ny.toLowerCase()) || (x.length >= 2 && y.length >= 2 && x.slice(0, 2) === y.slice(0, 2) && (x.length === 2 || y.length === 2));
  };

  /* ---- Live TV: the audio language and subtitles picked on a channel come back next time ---- */
  const ChAv = {
    K: 'mkc:chAv', restoring: false,
    all() { try { const v = JSON.parse(localStorage.getItem(this.K) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } },
    put(k, part) {
      const o = this.all(); o[k] = { ...(o[k] || {}), ...part, at: Date.now() };
      const ks = Object.keys(o); if (ks.length > 400) ks.sort((a, b) => (o[a].at || 0) - (o[b].at || 0)).slice(0, ks.length - 400).forEach((x) => { delete o[x]; });
      try { localStorage.setItem(this.K, JSON.stringify(o)); } catch (e) { /* storage full */ }
    },
    chan() { const c = P.ctx && P.ctx.meta && P.ctx.meta._iptv; return c && typeof Channels === 'object' ? c : null; },
    key() { const c = this.chan(); return c ? Channels.key(c) : ''; },
    audioOf(how, i) {
      if (how === 'hls' && P.hls && P.hls.audioTracks) { const t = P.hls.audioTracks[i]; return t ? { lang: t.lang || '', label: t.name || '' } : null; }
      if (how === 'media' && video.audioTracks) { const t = video.audioTracks[i]; return t ? { lang: t.language || '', label: t.label || '' } : null; }
      return null;
    },
    restore(c0) {
      const k = c0 ? Channels.key(c0) : ''; if (!k || CFG.chAvMemo === false) return;
      const want = this.all()[k]; if (!want || (!want.a && !want.s)) return;
      let n = 0, aDone = !want.a, userSub = false;
      this.onUser = () => { userSub = true; };
      const step = () => safe(() => {
        // the player may still be starting; another channel or title playing ends it
        if (++n > 24 || (P.ctx && this.chan() !== c0)) return;
        if (!P.ctx) { setTimeout(step, 700); return; }
        if (!aDone && !(P.stream && P.stream._mkAudUser)) {
          const r = AvTracks.list();
          if ((r.how === 'hls' || r.how === 'media') && r.rows.length > 1) {
            const hit = r.rows.find((row) => { const t = this.audioOf(r.how, row.i); return t && (sameLang(t.lang, want.a.lang) || (want.a.label && t.label === want.a.label)); });
            if (hit && !hit.on) { this.restoring = true; try { AvTracks.pick(r.how, hit.i); } finally { this.restoring = false; } }
            aDone = true;
          }
        }
        if (want.s && !userSub && Array.isArray(P.subs)) {
          if (want.s === 'off') { if (P.curSub >= 0) { this.restoring = true; try { selectSub(-1, { auto: true }); } finally { this.restoring = false; } } }
          else {
            const i = P.subs.findIndex((x) => x && sameLang(x.lang, want.s.lang) && /^(hls|native|mkv|mpv)$/.test(x.kind || ''));
            const j = i >= 0 ? i : P.subs.findIndex((x) => x && sameLang(x.lang, want.s.lang));
            if (j >= 0 && P.curSub !== j) { this.restoring = true; try { selectSub(j, { auto: true }); } finally { this.restoring = false; } userSub = true; }
          }
        }
        setTimeout(step, 700);
      });
      setTimeout(step, 900);
    },
  };
  window.MkChAv = ChAv;
  safe(() => {
    const pick = AvTracks.pick;
    AvTracks.pick = function (how, i) {
      const r = pick.apply(this, arguments);
      safe(() => { if (ChAv.restoring || CFG.chAvMemo === false) return; const k = ChAv.key(), t = ChAv.audioOf(how, i); if (k && t) ChAv.put(k, { a: t }); });
      return r;
    };
    const ss = selectSub;
    selectSub = function (i, o) {
      safe(() => {
        if (ChAv.restoring || (o && o.auto) || CFG.chAvMemo === false) return;
        const k = ChAv.key(); if (!k) return;
        if (ChAv.onUser) ChAv.onUser();
        const s = i >= 0 && P.subs ? P.subs[i] : null;
        if (i < 0) ChAv.put(k, { s: 'off' }); else if (s && s.lang) ChAv.put(k, { s: { lang: s.lang } });
      });
      return ss.apply(this, arguments);
    };
    const ps = playStream;
    playStream = function (ctx, stream) {
      const r = ps.apply(this, arguments);
      safe(() => { if (ctx && ctx.meta && ctx.meta._iptv) { ChAv.onUser = null; ChAv.restore(ctx.meta._iptv); } });
      return r;
    };
  });

  /* ---- series recordings: new episodes only, from the guide's new and repeat marks ---- */
  safe(() => {
    if (typeof Channels !== 'object') return;
    const px = Channels.parseXMLTV;
    const unx = (v) => String(v || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").trim();
    // the same time reading as the guide's own: YYYYMMDDHHMMSS with an optional +HHMM offset
    const tm = (v) => { const x = String(v || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/); if (!x) return 0; const tz = x[7] ? (Number(x[7].slice(0, 3)) * 60 + Math.sign(Number(x[7].slice(0, 3)) || 1) * Number(x[7].slice(3))) : 0; return Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5], +(x[6] || 0)) - tz * 60000; };
    Channels.parseXMLTV = function (text) {
      const map = px.apply(this, arguments);
      safe(() => {
        if (!map || !map.size || typeof text !== 'string' || (text.indexOf('<new') < 0 && text.indexOf('previously-shown') < 0)) return;
        const flag = new Map(), re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g; let m;
        while ((m = re.exec(text))) {
          const b = m[2], nw = /<new\s*\/?>/.test(b), old = b.indexOf('previously-shown') >= 0; if (!nw && !old) continue;
          const st = tm((m[1].match(/start="([^"]+)"/) || [])[1]), ti = unx((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]) || 'Programme';
          if (st) flag.set(`${st}|${ti}`, nw);
        }
        if (!flag.size) return;
        map.forEach((l) => l.forEach((p) => { const v = flag.get(`${p.start}|${p.title}`); if (v !== undefined) p.nw = v; }));
      });
      return map;
    };
  });
  const isNew = (p) => {
    if (!p) return null;
    if (p.nw === true || p.nw === false) return p.nw;
    const t = `${p.title || ''} ${p.sub || ''}`;
    if (/[([]\s*new\s*[)\]]|\bnew episode\b/i.test(t)) return true;
    if (/[([]\s*(repeat|r|rerun)\s*[)\]]/i.test(t)) return false;
    return null;
  };
  safe(() => {
    const RS = window.MkRecSeries; if (!RS || !window.MkRec) return;
    const tg = RS.toggle;
    RS.toggle = function (c, prog) {
      const pk = (x) => `${x.url}|${x.start}`, had = RS.has(c, prog), before = new Set(MkRec.plans().map(pk)), r = tg.apply(this, arguments);
      safe(() => {
        if (had || !CFG.recNewOnly) return; const rule = RS.find(c, prog); if (!rule) return;
        RS.save(RS.all().map((x) => (x.id === rule.id ? { ...x, neu: true } : x)));
        // the toggle planned every airing a moment ago: the repeats among those come off again
        const d = Channels.data.get(c.list), progs = (d && d.epg && d.epg.get(Channels.key(c))) || [];
        const rep = new Set(progs.filter((p) => isNew(p) === false).map((p) => p.start));
        const drop = MkRec.plans().filter((x) => !before.has(pk(x)) && x.url === c.url && rep.has(x.start) && !x.began);
        if (!drop.length) return;
        drop.forEach((x) => { if (x.nat) { try { MKAndroid.recUnplan(String(x.id)); } catch (e) { /* older app */ } } });
        const ks = new Set(drop.map(pk)); MkRec.savePlans(MkRec.plans().filter((x) => !ks.has(pk(x))));
      });
      return r;
    };
    // a repeat is left out while the scan plans a rule set to new episodes only; when the guide does not say, it records
    let rule = null;
    const plan = MkRec.plan;
    MkRec.plan = function (c, p) {
      if (rule && rule.neu && isNew(p) === false) return undefined;
      const r = plan.apply(this, arguments);
      safe(() => { // a scan plans several in one moment: each gets its own id, so Cancel takes off only that one
        const l = MkRec.plans(), seen = new Set(); let ch = false;
        l.forEach((x, i) => { if (seen.has(x.id) && !x.nat) { x.id = `${x.id}${i.toString(36)}`; ch = true; } seen.add(x.id); });
        if (ch) MkRec.savePlans(l);
      });
      return r;
    };
    const scan = RS.scan;
    RS.scan = function () {
      const rules = RS.all();
      if (!rules.some((x) => x.neu)) return scan.apply(this, arguments);
      // one rule at a time, so the plan step knows which rule it serves
      const all = RS.all;
      let n = 0;
      try {
        for (const r of rules) {
          rule = r; RS.all = () => [r];
          n += scan.call(this, true) || 0;
        }
      } finally { RS.all = all; rule = null; }
      if (!arguments[0] && MkRec.paint) MkRec.paint();
      return n;
    };
    const bind = RS.bind;
    RS.bind = function (b, again) {
      const v = bind.apply(this, arguments);
      safe(() => {
        $$('[data-rser]', b).forEach((x) => {
          if (x.previousElementSibling && x.previousElementSibling.matches('[data-rsnew]')) return;
          const r = RS.all().find((y) => y.id === x.dataset.rser); if (!r) return;
          const nb = document.createElement('button'); nb.type = 'button'; nb.className = `${x.className} rs-new${r.neu ? ' on' : ''}`.trim();
          nb.setAttribute('data-nav', ''); nb.dataset.rsnew = r.id; nb.setAttribute('aria-pressed', String(!!r.neu));
          nb.textContent = 'New only'; nb.title = r.neu ? 'Only new episodes record' : 'Repeats record too';
          nb.addEventListener('click', (e) => {
            e.stopPropagation(); const on = !r.neu;
            RS.save(RS.all().map((y) => (y.id === r.id ? { ...y, neu: on } : y)));
            toast(on ? 'From now on only new episodes record. Repeats are skipped when the guide marks them.' : 'Every airing will record, repeats too.', 'ok', 4500, 'recs');
            RS.scan(true); again();
          });
          x.before(nb);
        });
      });
      return v;
    };
  });

  /* ---- a favourite source addon, tried first everywhere (your language and the sources that play here still apply) ---- */
  const streamAddons = () => [...new Set((engine.addons || []).filter((a) => a && a.manifest && (a.manifest.resources || []).some((r) => (typeof r === 'string' ? r : r && r.name) === 'stream')).map((a) => a.manifest.name).filter(Boolean))];
  safe(() => {
    const pb = engine.pickBest.bind(engine);
    engine.pickBest = function (streams, opts) {
      const pin = CFG.pinAddon, mine = pin && Array.isArray(streams) ? streams.filter((s) => s && s._addon === pin) : [];
      if (!mine.length) return pb(streams, opts);
      const o = opts || {}, full = pb(streams, opts);
      // the episode group already playing and the pick you made by hand for this show still come first
      const kept = full && ((o.bingeGroup && (full.behaviorHints || {}).bingeGroup === o.bingeGroup) || (o.memo && o.memo.a && full._addon === o.memo.a && (!o.memo.r || full._tel.res === o.memo.r)));
      if (kept) return full;
      return pb(mine, opts) || full;
    };
  });
  safe(() => {
    const rs = renderStreamsPanel;
    renderStreamsPanel = function () {
      const r = rs.apply(this, arguments);
      safe(() => {
        const box = document.getElementById('dStreams'); if (!box || typeof D !== 'object') return;
        const chips = box.querySelector('.chips'); if (!chips) return;
        const f = String(D.filter || '');
        if (CFG.pinAddon) { const c = chips.querySelector(`[data-filter="addon:${CSS.escape(CFG.pinAddon)}"]`); if (c && !c.querySelector('.mk-pin')) c.insertAdjacentHTML('afterbegin', '<i data-lucide="pin" class="mk-pin"></i>'); }
        if (f.startsWith('addon:')) {
          const name = f.slice(6), on = CFG.pinAddon === name;
          chips.insertAdjacentHTML('beforeend', `<button class="chip${on ? ' on' : ''}" type="button" data-nav data-mkpin aria-pressed="${on}"><i data-lucide="pin"></i>${on ? 'First choice' : 'Make this my first-choice addon'}</button>`);
          chips.querySelector('[data-mkpin]').addEventListener('click', () => { setCfg('pinAddon', on ? '' : name); toast(on ? 'No addon is your first choice now.' : 'This addon is now your first choice.', 'ok', 3000); renderStreamsPanel(); });
        }
        if (typeof icons === 'function') icons();
      });
      return r;
    };
  });

  /* ---- Calendar: List, Week and Month views ---- */
  const CalView = {
    mode: (() => { try { return Store.get('calView', 'list'); } catch (e) { return 'list'; } })(),
    eps: [], pick: null,
    bar() {
      if (document.getElementById('calView')) return;
      const rg = document.getElementById('calRange'); if (!rg) return;
      rg.insertAdjacentHTML('afterend', `<div class="segc" id="calView" role="radiogroup" aria-label="View">${[['list', 'List'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => `<button type="button" data-nav data-calv="${k}" role="radio" aria-checked="${this.mode === k}" class="${this.mode === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`);
      document.querySelectorAll('#calView [data-calv]').forEach((b) => b.addEventListener('click', () => {
        this.mode = b.dataset.calv; safe(() => Store.set('calView', this.mode)); this.pick = null;
        document.querySelectorAll('#calView [data-calv]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); });
        if (this.mode === 'month' && Calendar.days < 35) { Calendar.days = 90; Calendar.render(); } else this.paint();
      }));
    },
    first() { const r = (navigator.language || 'en-US').split('-')[1] || ''; return /^(US|CA|BR|JP|MX|IL|PH|KR|TW|HK|IN|ZA|SA|PE|CO|VE|AR)$/i.test(r) || (!r && /^en$/i.test(navigator.language || '')) ? 0 : 1; },
    paint() {
      const body = document.getElementById('calBody'); if (!body) return;
      body.querySelectorAll('.cg,.cg-pick').forEach((x) => x.remove());
      body.classList.toggle('cal-grid-on', this.mode !== 'list');
      if (this.mode === 'list') return;
      const f = (window.MkCalPlus && MkCalPlus.f) || '';
      const eps = this.eps.filter((e) => !f || (f === 'film' ? e.film : !e.film));
      const loc = typeof appLocale === 'function' ? appLocale() : undefined;
      const d0 = new Date(); d0.setHours(0, 0, 0, 0); const today = d0.getTime();
      let start = today, n = 7;
      if (this.mode === 'month') { const fd = this.first(); start = today - ((new Date(today).getDay() - fd + 7) % 7) * 864e5; n = 35; }
      const dayKey = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
      const by = new Map(); eps.forEach((e, i) => { const k = dayKey(e.at); if (!by.has(k)) by.set(k, []); by.get(k).push(i); });
      const days = []; for (let i = 0; i < n; i++) { const d = new Date(start); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0); days.push(d.getTime()); }
      const max = this.mode === 'month' ? 3 : 8;
      const item = (i) => { const e = eps[i]; return `<button type="button" class="cg-it${e.film ? ' film' : ''}" data-nav data-cgi="${this.eps.indexOf(e)}"><b translate="no">${esc(e.meta.name || '')}</b><small>${e.film ? esc(e.film === 'cinema' ? 'In cinemas' : e.film === 'home' ? 'At home' : 'Release') : `S${esc(e.v.season)} · E${esc(e.v.episode)}`}</small></button>`; };
      const head = this.mode === 'month' ? days.slice(0, 7).map((t) => `<div class="cg-h">${esc(new Date(t).toLocaleDateString(loc, { weekday: 'short' }))}</div>`).join('') : '';
      const cells = days.map((t) => {
        const l = by.get(t) || [], d = new Date(t);
        const sm = this.mode === 'week' || d.getDate() === 1 || t === days[0] ? d.toLocaleDateString(loc, this.mode === 'week' ? { weekday: 'short' } : { month: 'short' }) : '';
        return `<div class="cg-d${t < today ? ' past' : ''}${t === today ? ' today' : ''}"><button type="button" class="cg-n" data-nav data-cgd="${t}" aria-label="${esc(d.toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric' }))}"><b>${d.getDate()}</b><small>${esc(sm)}</small><em>${l.length ? '•'.repeat(Math.min(3, l.length)) : ''}</em></button>${l.slice(0, max).map(item).join('')}${l.length > max ? `<span class="cg-more">+${l.length - max}</span>` : ''}</div>`;
      }).join('');
      const grid = `<div class="cg cg-${this.mode}">${head}${cells}</div>`;
      const anchor = body.querySelector('.cal-filter') || body.querySelector('.cal-next');
      if (anchor) anchor.insertAdjacentHTML('afterend', grid); else body.insertAdjacentHTML('afterbegin', grid);
      const g = body.querySelector('.cg');
      g.querySelectorAll('[data-cgi]').forEach((b) => b.addEventListener('click', () => this.open(Number(b.dataset.cgi))));
      g.querySelectorAll('[data-cgd]').forEach((b) => b.addEventListener('click', () => { this.pick = Number(b.dataset.cgd); this.day(g, by, eps); }));
      if (this.pick != null) this.day(g, by, eps);
    },
    day(g, by, eps) {
      const body = g.parentNode; body.querySelectorAll('.cg-pick').forEach((x) => x.remove());
      const t = this.pick, l = by.get(t) || [], loc = typeof appLocale === 'function' ? appLocale() : undefined;
      g.insertAdjacentHTML('afterend', `<section class="cal-day cg-pick" style="display:block"><h3>${esc(new Date(t).toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3>${l.length ? l.map((i) => { const e = eps[i]; return `<button type="button" class="cg-it${e.film ? ' film' : ''}" data-nav data-cgi="${this.eps.indexOf(e)}"><b translate="no">${esc(e.meta.name || '')}</b><small>${e.film ? esc(e.film === 'cinema' ? 'In cinemas' : e.film === 'home' ? 'At home' : 'Release') : `S${esc(e.v.season)} · E${esc(e.v.episode)}${e.v.name || e.v.title ? ` · ${esc(e.v.name || e.v.title)}` : ''}`} · ${esc(new Date(e.at).toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' }))}</small></button>`; }).join('') : `<div class="empty">${esc('Nothing on this day.')}</div>`}</section>`);
      body.querySelectorAll('.cg-pick [data-cgi]').forEach((b) => b.addEventListener('click', () => this.open(Number(b.dataset.cgi))));
    },
    open(i) {
      const e = this.eps[i]; if (!e) return;
      safe(() => openDetail(e.meta, e.v ? { videoId: videoIdFor(e.meta, e.v) } : undefined));
    },
  };
  window.MkCalView = CalView;
  safe(() => {
    const CP = window.MkCalPlus; if (!CP) return;
    const after = CP.after, filter = CP.filter;
    CP.after = function (body, eps) { const r = after.apply(this, arguments); safe(() => { CalView.bar(); CalView.eps = eps || []; CalView.paint(); }); return r; };
    CP.filter = function () { const r = filter.apply(this, arguments); safe(() => CalView.paint()); return r; };
  });
  safe(() => {
    // an empty range ("Nothing airing…") still shows the switch, and the list again
    const rd = Calendar.render.bind(Calendar);
    Calendar.render = async function () { safe(() => CalView.bar()); const r = await rd(); safe(() => { const b = document.getElementById('calBody'); if (b && !b.querySelector('.cal-day')) { b.classList.remove('cal-grid-on'); b.querySelectorAll('.cg,.cg-pick').forEach((x) => x.remove()); } }); return r; };
  });

  /* ---- settings rows ---- */
  safe(() => {
    const pb = typeof secById === 'function' && secById('playback');
    if (pb) {
      const rows = pb.rows;
      pb.rows = () => { const r = rows(), at = r.findIndex((x) => x.key === 'clockShow'); r.splice(at >= 0 ? at + 1 : r.length, 0,
        { key: 'chAvMemo', label: 'Remember audio and subtitles per channel', help: 'The language and subtitles you pick on a channel come back the next time you tune in.', type: 'toggle', get: () => CFG.chAvMemo !== false },
        { key: 'recNewOnly', label: 'New episodes only', help: 'When you record every episode of a show, repeats are skipped. Works when the guide marks new and repeat airings; when it doesn’t, every airing records. Change it per show in Live TV › Recordings.', type: 'toggle' });
        return r; };
    }
    const st = typeof secById === 'function' && secById('streams');
    if (st) {
      const rows = st.rows;
      st.rows = () => { const r = rows(), at = r.findIndex((x) => x.key === 'showTrailers'); r.splice(at >= 0 ? at + 1 : r.length, 0,
        { key: 'pinAddon', label: 'First-choice addon', help: 'Sources from this addon are picked first for every film and episode. Your audio language and the sources that play here still apply.', type: 'select', options: [['', 'None'], ...streamAddons().map((n) => [n, n]), ...(CFG.pinAddon && !streamAddons().includes(CFG.pinAddon) ? [[CFG.pinAddon, CFG.pinAddon]] : [])] });
        return r; };
    }
  });
})();
