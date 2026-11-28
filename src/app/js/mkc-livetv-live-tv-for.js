
'use strict';
/* ---------------- 2.73 Live TV for the big screen ----------------
   Your own TV playlists, remote first:
   - In the player: Up/Down (TVs) and Channel +/- or Page Up/Down (every remote and keyboard) switch to the next channel
     in the list you came from. Typing a number jumps to that channel; 0 alone goes back to the last channel. OK shows
     what is on now and next, with the channel's number and logo. The Android app's own player passes Channel +/- back.
   - In the guide: channel numbers, Recently watched, hide a channel or a whole group (and bring it back from Hidden),
     a guide that looks back and ahead (Earlier, Now, Later), and a menu on each channel (the button, a long press of OK,
     the remote's Menu key or a right click).
   - Playlists: films and episodes in a playlist get their own Movies and Series tabs instead of crowding the channels.
   Hidden channels and groups, and Recently watched, travel with the playlists to the person's other devices. */
(() => {
  if (typeof Channels === 'undefined' || typeof X8 === 'undefined' || typeof playStream !== 'function') return;
  const C = Channels;
  const ok = (fn) => { try { return fn(); } catch (e) { return undefined; } };

  /* ---------- saved choices ---------- */
  const setOf = (k) => new Set((C.get()[k] || []));
  C.hiddenSet = () => setOf('hidden');
  C.hiddenGroups = () => setOf('hiddenGroups');
  C.gkey = (listId, g) => `${listId}|${g}`;
  C.flip = (k, v) => { const d = C.get(), s = new Set(d[k] || []); s.has(v) ? s.delete(v) : s.add(v); d[k] = [...s]; C.save(d); return s.has(v); };
  C.recentKeys = () => (C.get().recent || []);
  C.noteRecent = (c) => { const d = C.get(), k = C.key(c); d.recent = [k, ...(d.recent || []).filter((x) => x !== k)].slice(0, 30); C.save(d); };

  /* ---------- which channels the guide shows (and the order zapping follows) ---------- */
  const look = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s\-_.:|/\\()[\]{}'"!?,+*&]+/g, ' ').trim();
  C.pick = function (d, l, favs, q0) {
    const hid = this.hiddenSet(), hg = this.hiddenGroups(), g = this.st.group, q = look(this.st.q || '');
    const gone = (c) => hid.has(this.key(c)) || hg.has(this.gkey(c.list, c.group));
    let out;
    if (g === '★') out = d.channels.filter((c) => favs.has(this.key(c)));
    else if (g === '⟲') { const at = new Map(this.recentKeys().map((k, i) => [k, i])); out = d.channels.filter((c) => at.has(this.key(c))).sort((a, b) => at.get(this.key(a)) - at.get(this.key(b))); }
    else if (g === '⊘') out = d.channels.filter(gone);
    else out = d.channels.filter((c) => (!g || c.group === g) && !gone(c));
    if (q) out = out.filter((c) => look(c.name).includes(q) || String(c.no) === q);
    return out;
  };

  /* ---------- playlist parsing ---------- */
  const VOD_EXT = /\.(mp4|mkv|avi|mov|m4v|wmv|flv|webm|mpe?g)$/i;
  const HDR = { 'user-agent': 'User-Agent', 'http-user-agent': 'User-Agent', referer: 'Referer', referrer: 'Referer', 'http-referrer': 'Referer', 'http-referer': 'Referer', origin: 'Origin', 'http-origin': 'Origin', cookie: 'Cookie' };
  const hname = (k) => HDR[String(k).trim().toLowerCase()] || String(k).trim();
  // "address|User-Agent=…&Referer=…": the headers after the bar, values percent-encoded or plain
  const pipe = (u) => {
    const i = u.indexOf('|'); if (i < 0) return [u, null];
    const h = {};
    u.slice(i + 1).split('&').forEach((kv) => { const j = kv.indexOf('='); if (j > 0) { let v = kv.slice(j + 1); try { v = decodeURIComponent(v.replace(/\+/g, '%2B')); } catch (e) { /* plain */ } h[hname(kv.slice(0, j))] = v; } });
    return [u.slice(0, i), Object.keys(h).length ? h : null];
  };
  C.parseM3U = function (text, list) {
    const out = [], vod = [], lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    const head = lines.find((x) => /^#EXTM3U/i.test(x.trim())) || lines[0] || '';
    const attr = (s, k) => { const m = s.match(new RegExp(`(?:^|[\\s,])${k}="([^"]*)"`, 'i')); return m ? m[1].trim() : ''; };
    const epg = [attr(head, 'url-tvg'), attr(head, 'x-tvg-url')].filter(Boolean).join(',');
    const shift0 = parseFloat(attr(head, 'tvg-shift')) || 0;
    let cur = null, group = '', prop = {}, propH = {};
    for (const raw of lines) {
      const l = raw.trim(); if (!l) continue;
      if (/^#EXTINF/i.test(l)) {
        let cut = -1, inQ = false; for (let i = 7; i < l.length; i++) { const ch = l[i]; if (ch === '"') inQ = !inQ; else if (ch === ',' && !inQ) { cut = i; break; } }
        const head2 = cut >= 0 ? l.slice(0, cut) : l, name = cut >= 0 ? l.slice(cut + 1).trim() : '';
        cur = { list: list.id, name: name || attr(head2, 'tvg-name') || 'Channel', tvgId: attr(head2, 'tvg-id'), logo: attr(head2, 'tvg-logo'), group: attr(head2, 'group-title') || group, catchup: attr(head2, 'catchup') };
        const chno = parseInt(attr(head2, 'tvg-chno') || attr(head2, 'channel-number'), 10); if (chno > 0) cur.chno = chno;
        const sh = attr(head2, 'tvg-shift'); cur.shift = sh !== '' && !isNaN(parseFloat(sh)) ? parseFloat(sh) : shift0;
        const cd = parseInt(attr(head2, 'catchup-days'), 10); if (cd > 0) cur.catchupDays = cd;
        const ua = attr(head2, 'http-user-agent') || attr(head2, 'user-agent'), rf = attr(head2, 'http-referrer') || attr(head2, 'http-referer');
        if (ua || rf) { cur.headers = {}; if (ua) cur.headers['User-Agent'] = ua; if (rf) cur.headers.Referer = rf; }
      } else if (/^#EXTGRP:/i.test(l)) group = l.slice(8).trim();
      else if (/^#EXTVLCOPT:/i.test(l)) {
        const m = l.slice(11).match(/^\s*([\w-]+)\s*=\s*(.+)$/);
        if (m && cur && HDR[m[1].toLowerCase()]) (cur.headers = cur.headers || {})[hname(m[1])] = m[2].trim();
      } else if (/^#KODIPROP:/i.test(l)) {
        const m = l.slice(10).match(/^\s*([\w.-]+)\s*=\s*(.*)$/); if (!m) continue;
        const k = m[1].toLowerCase(), v = m[2].trim();
        if (k === 'inputstream.adaptive.license_type') prop.type = v;
        else if (k === 'inputstream.adaptive.license_key') prop.key = v;
        else if (k === 'inputstream.adaptive.drm_legacy') { const p = v.split('|'); prop.type = p[0]; prop.key = p.slice(1).join('|'); }
        else if (k === 'inputstream.adaptive.stream_headers') Object.assign(propH, pipe(`|${v}`)[1] || {});
      } else if (!l.startsWith('#')) {
        if (cur) {
          const [u, h] = pipe(l);
          cur.url = u; cur.group = cur.group || 'Other';
          const hh = { ...propH, ...(cur.headers || {}), ...(h || {}) }; if (Object.keys(hh).length) cur.headers = hh; else delete cur.headers;
          if (prop.type) cur.drm = { type: prop.type, key: prop.key || '' };
          const path = u.split(/[?#]/)[0];
          if (/\/(movie|series)\//i.test(path) || VOD_EXT.test(path)) { cur.vod = /\/series\//i.test(path) ? 'series' : 'movie'; vod.push(cur); } else out.push(cur);
        }
        cur = null; prop = {}; for (const k of Object.keys(propH)) delete propH[k];
      }
    }
    out.forEach((c, i) => { c.no = c.chno || i + 1; });
    out.vod = vod;   // the playlist loader keeps only channels and the guide address: the films ride along
    return { channels: out, epg, vod };
  };

  /* ---------- guide (XMLTV) ---------- */
  const NUM = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
  const KEEP = /[^0-9a-zÀ-ɏͰ-ϿЀ-ӿ֐-׿؀-ۿऀ-෿฀-๿ᄀ-ᇿ぀-ヿ㐀-鿿가-힯]+/g;
  const PLUS1 = /\+\s*1(?!\d)/;
  // "UK: BBC One HD", "BBC 1 FHD", "[UK] BBC ONE (Backup)" all give "bbc1"; a "+1" channel keeps its own key
  const chKey = (n) => {
    let s = String(n || '');
    try { s = s.normalize('NFKC'); } catch (e) { /* old engines */ }
    s = s.replace(/^\s*(?:\|[A-Z]{2,3}\||\[[A-Z]{2,3}\]|[A-Z]{2,3}\s*[:|]|[A-Z]{2,3}\s+-)\s*/, '');
    s = s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ').replace(/\bVIP\b/gi, ' ').replace(/[☀-➿⬀-⯿]/g, ' ');
    const plus = PLUS1.test(s); s = s.replace(new RegExp(PLUS1.source, 'g'), ' ');
    for (let i = 0; i < 4; i++) s = s.replace(/(?:^|[\s\-|]+)(?:UHD|4K|FHD|HD|SD|HEVC|H\.?26[45]|RAW|\d{2,3}\s?FPS|\d{3,4}[PI]|ᴴᴰ|ᵁᴴᴰ)[\s\-|]*$/i, '');
    const w = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(KEEP).filter(Boolean).map((x) => NUM[x] || x).join('');
    return w ? w + (plus ? '+1' : '') : '';
  };
  C.chKey = chKey;
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  const unx = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
    if (ENT[e.toLowerCase()] != null) return ENT[e.toLowerCase()];
    try { const ta = unx.ta || (unx.ta = document.createElement('textarea')); ta.innerHTML = m; return ta.value; } catch (x) { return m; }
  }).trim();
  const xtime = (s) => {
    const x = String(s || '').match(/^\s*(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2}):?(\d{2}))?/); if (!x) return NaN;
    const off = x[7] ? (x[7] === '-' ? -1 : 1) * (Number(x[8]) * 60 + Number(x[9])) : 0;
    return Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5], +(x[6] || 0)) - off * 60000;
  };
  C.xtime = xtime;
  C.parseXMLTV = function (text, channels) {
    text = String(text || '');
    // the guide's own channels: every display name, by exact and by cleaned-up name
    const ids = new Set(), exact = new Map(), keyed = new Map();
    const chRe = /<channel\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/channel>/g; let m;
    while ((m = chRe.exec(text))) {
      const id = m[1].trim().toLowerCase(); ids.add(id);
      const dnRe = /<display-name[^>]*>([\s\S]*?)<\/display-name>/g; let n;
      while ((n = dnRe.exec(m[2]))) { const dn = unx(n[1]); if (!dn) continue; const e = look(dn), k = chKey(dn); if (e && !exact.has(e)) exact.set(e, id); if (k && !keyed.has(k)) keyed.set(k, id); }
    }
    // each channel: its tvg-id, else its name; a "+1" channel with no guide of its own uses the main one an hour later
    const map = new Map(), want = new Map();
    const add = (id, c, extra) => { if (!want.has(id)) want.set(id, []); want.get(id).push({ c, off: ((Number(c.shift) || 0) * 60 + extra) * 60000 }); };
    channels.forEach((c) => {
      const tid = String(c.tvgId || '').trim().toLowerCase();
      if (tid && (ids.has(tid) || !ids.size)) return add(tid, c, 0);
      const e = look(c.name), k = chKey(c.name);
      const id = (e && exact.get(e)) || (k && keyed.get(k));
      if (id) return add(id, c, 0);
      if (k && k.endsWith('+1')) { const main = keyed.get(k.slice(0, -2)); if (main) return add(main, c, 60); }
      if (tid) add(tid, c, 0);   // programmes may name a channel the guide never lists
    });
    const now = Date.now(), lo = now - 7 * 3600e3, hi = now + 31 * 3600e3;
    const pRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
    while ((m = pRe.exec(text))) {
      const a = m[1], cid = ((a.match(/\bchannel\s*=\s*["']([^"']+)["']/) || [])[1] || '').trim().toLowerCase(); const to = want.get(cid); if (!to) continue;
      const s0 = xtime((a.match(/\bstart\s*=\s*["']([^"']+)["']/) || [])[1]), e0 = xtime((a.match(/\bstop\s*=\s*["']([^"']+)["']/) || [])[1]);
      if (!(e0 > s0)) continue;
      let title = null, desc = null; const sub = unx((m[2].match(/<sub-title[^>]*>([\s\S]*?)<\/sub-title>/) || [])[1]).slice(0, 120);   // 2.83 episode title
      for (const t of to) {
        const start = s0 + t.off, end = e0 + t.off; if (!(end > lo && start < hi)) continue;
        if (title === null) { title = unx((m[2].match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]) || 'Programme'; desc = unx((m[2].match(/<desc[^>]*>([\s\S]*?)<\/desc>/) || [])[1]).slice(0, 300); }
        const k = this.key(t.c); if (!map.has(k)) map.set(k, []); map.get(k).push({ title, desc, start, end, sub });
      }
    }
    map.forEach((l) => { l.sort((x, y) => x.start - y.start); for (let i = l.length - 1; i > 0; i--) if (l[i].start === l[i - 1].start) l.splice(i, 1); });
    return map;
  };
  // several guide addresses (url-tvg="a.xml,b.xml.gz"): all of them, read together
  C.texts = async function (urls) {
    const list = String(urls || '').split(/\s*,\s*(?=https?:\/\/)/i).map((x) => x.trim()).filter(Boolean);
    if (list.length < 2) return this.text(list[0] || urls);
    const got = await Promise.all(list.map((u) => this.text(u).catch((e) => ({ err: e }))));
    const good = got.filter((x) => typeof x === 'string');
    if (!good.length) throw got[0].err;
    return good.join('\n');
  };

  C.loadEpg = function (l, d, fresh) {
    d.epgBusy = true; d.epgAt = Date.now();
    this.cached(l.id, 'epg', fresh, () => this.texts(d.epgUrl)).then((x) => { d.epg = this.parseXMLTV(x, d.channels); d.epgError = ''; if (S.view === 'tv' && (S.tvFilter === `iptv:${l.id}` || S.tvFilter === 'iptv:all') && (this.st.mode || 'live') === 'live') this.renderGuide(); }).catch((e) => { d.epgError = e.message; }).then(() => { d.epgBusy = false; });
  };

  /* ---------- loading: keep films and episodes apart, number the channels ---------- */
  const load0 = C.load.bind(C);
  C.load = async function (l, fresh) {
    const d = await load0(l, fresh);
    if (d && !d._n) {
      d._n = true;
      if (!d.vod) d.vod = d.channels.vod || [];
      d.channels.forEach((c, i) => { if (!c.no) c.no = c.chno || i + 1; });
    }
    return d;
  };

  /* ---------- the guide: tabs for playlist films, numbers, Earlier/Later, menus ---------- */
  const hm = (t) => new Date(t).toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
  const dayName = (t) => { const d = new Date(t), td = new Date(); const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(td.getFullYear(), td.getMonth(), td.getDate())) / 864e5); return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : d.toLocaleDateString(appLocale(), { weekday: 'short', day: 'numeric', month: 'short' }); };
  const MTABS = [['live', 'Live TV'], ['movie', 'Movies'], ['series', 'Series']];
  const rg1 = C.renderGuide.bind(C);
  C.renderGuide = async function () {
    const id = String(S.tvFilter || '').slice(5), l = this.listOf(id);
    const d0 = l && this.data.get(id), mode = this.st.mode || 'live';
    if (l && l.kind !== 'xtream' && d0 && d0.vod && d0.vod.length && mode !== 'live') return this.m3uVod(l, d0, mode);
    const r = await rg1();
    if (S.view !== 'tv' || S.tvFilter !== `iptv:${id}`) return r;
    ok(() => this.decorate(l));
    return r;
  };
  C.decorate = function (l) {
    const epg = $('#epg'); if (!epg || !l) return;
    const d = l.kind === 'all' ? (this._mg && this._mg.d) : this.data.get(l.id); if (!d) return;
    const mode = this.st.mode || 'live';
    // playlist films and episodes: their own tabs
    if (l.kind !== 'xtream' && d.vod && d.vod.length && !$('.lt-tabs', epg)) {
      epg.insertAdjacentHTML('afterbegin', `<div class="segc xt-tabs lt-tabs" role="tablist" aria-label="What to show">${MTABS.filter(([k]) => k === 'live' || d.vod.some((v) => v.vod === k || (k === 'series' && seriesOf(v)))).map(([k, t]) => `<button type="button" data-nav data-ltab="${k}" class="${mode === k ? 'on' : ''}" role="tab" aria-selected="${mode === k}">${t}</button>`).join('')}</div>`);
      $$('[data-ltab]', epg).forEach((b) => b.addEventListener('click', () => { this.st = { group: '', q: '', page: 1, mode: b.dataset.ltab }; this.renderGuide(); }));
    }
    const bar = $('.ch-bar', epg);
    // the group menu: Recently watched and Hidden, without the groups that are hidden
    const sel = $('#chGroup', epg);
    if (sel && !sel.dataset.lt) {
      sel.dataset.lt = '1';
      const hg = this.hiddenGroups(), hid = this.hiddenSet();
      [...sel.options].forEach((o) => { if (o.value && o.value !== '★' && hg.has(this.gkey(l.id, o.value)) && o.value !== this.st.group) o.remove(); });
      const fav = [...sel.options].find((o) => o.value === '★');
      const nRec = this.recentKeys().filter((k) => k.startsWith(`${l.id}|`)).length;
      const nHid = d.channels.filter((c) => hid.has(this.key(c)) || hg.has(this.gkey(l.id, c.group))).length;
      const mk = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (this.st.group === v) o.selected = true; return o; };
      const after = fav || sel.options[0];
      if (nRec) after.after(mk('⟲', `⟲ Recently watched · ${nRec}`));
      if (nHid || this.st.group === '⊘') sel.append(mk('⊘', `⊘ Hidden · ${nHid}`));
    }
    // the guide's time: Earlier, Now, Later (three hours at a time, a day ahead)
    if (bar && !$('.lt-time', bar)) {
      const off = this.st.off || 0, t0 = Date.now() + off * 3600e3;
      bar.insertAdjacentHTML('beforeend', `<div class="lt-time" role="group" aria-label="Guide time">
        <button class="btn btn-ghost btn-sm" type="button" data-nav data-off="-3" ${off <= -6 ? 'disabled' : ''} aria-label="Earlier"><i data-lucide="chevron-left"></i></button>
        <button class="btn btn-ghost btn-sm lt-now ${off ? '' : 'on'}" type="button" data-nav data-off="0"><span>${off ? `${esc(dayName(t0))} ${esc(hm(t0))}` : 'Now'}</span></button>
        <button class="btn btn-ghost btn-sm" type="button" data-nav data-off="3" ${off >= 24 ? 'disabled' : ''} aria-label="Later"><i data-lucide="chevron-right"></i></button>
      </div>`);
      $$('[data-off]', bar).forEach((b) => b.addEventListener('click', () => {
        const v = Number(b.dataset.off); this.st.off = v ? Math.max(-6, Math.min(24, (this.st.off || 0) + v)) : 0;
        const want = b.dataset.off; this.renderGuide().then(() => { const n = $(`#epg .lt-time [data-off="${want}"]`); if (n && IS_TV) Nav.focus(n.disabled ? $('#epg .lt-now') : n, true); });
      }));
      icons();
    }
    this.rows();
  };
  // per channel: the menu button, a long press of OK, the Menu key, a right click
  C.rows = function () {
    const epg = $('#epg'), list = this._view || []; if (!epg) return;
    $$('[data-more]', epg).forEach((b) => { if (b.dataset.lt) return; b.dataset.lt = '1'; b.addEventListener('click', (e) => { e.stopPropagation(); this.menu(list[Number(b.dataset.more)]); }); });
    $$('.ch-tune[data-ci]', epg).forEach((b) => {
      if (b.dataset.lt) return; b.dataset.lt = '1';
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); this.menu(list[Number(b.dataset.ci)]); });
    });
    icons();
  };
  // a long press of OK (or the Menu key) on a channel opens its menu, as on TV boxes
  let holdAt = 0, held = false;
  document.addEventListener('keydown', (e) => {
    const a = document.activeElement; if (!a || !a.closest || S.view !== 'tv' || !$('#player').hidden) return;
    const row = a.closest('#epg .ch-cell'); if (!row) return;
    const b = $('.ch-tune', row), c = b && (C._view || [])[Number(b.dataset.ci)]; if (!c) return;
    if (e.key === 'ContextMenu' || e.key === 'Menu' || e.keyCode === 93 || (IS_TV && e.keyCode === 82 && !/^r$/i.test(e.key))) { e.preventDefault(); e.stopImmediatePropagation(); C.menu(c); return; }
    if (e.key !== 'Enter' || !IS_TV) return;
    if (!e.repeat) { holdAt = Date.now(); held = false; e.preventDefault(); e.stopImmediatePropagation(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    if (!held && Date.now() - holdAt > 550) { held = true; C.menu(c); }
  }, true);
  document.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' || !IS_TV || !holdAt) return;
    const was = held; holdAt = 0; held = false;
    if (was) { e.preventDefault(); return; }
    const a = document.activeElement; if (a && a.closest && a.closest('#epg .ch-cell')) { e.preventDefault(); a.click(); }
  }, true);

  C.menu = function (c) {
    if (!c) return;
    const k = this.key(c), fav = this.favs().has(k), hid = this.hiddenSet().has(k), gk = this.gkey(c.list, c.group), ghid = this.hiddenGroups().has(gk);
    X8.layer('chMenu', { label: c.name, icon: 'tv', eyebrow: 'Channel' });
    const b = X8.body('chMenu');
    const row = (act, icon, t) => `<button class="xt-row" type="button" data-nav data-act="${act}"><i data-lucide="${icon}"></i><span><b>${t}</b></span></button>`;
    b.innerHTML = `<h3 class="x8-h">${c.no ? `<span class="ch-no">${c.no}</span>` : ''}${esc(c.name)}</h3>${c.group ? `<p class="sub">${esc(c.group)}</p>` : ''}
      <div class="lt-menu">
        ${row('play', 'play', 'Watch')}
        ${row('fav', 'star', fav ? 'Remove from favourites' : 'Add to favourites')}
        ${window.MkRec ? row('rec', 'circle-dot', 'Record this channel') : ''}
        ${row('hide', hid ? 'eye' : 'eye-off', hid ? 'Show this channel again' : 'Hide this channel')}
        ${c.group ? row('hideg', ghid ? 'eye' : 'eye-off', ghid ? 'Show this group again' : 'Hide this group') : ''}
        ${IS_TV ? row('flip', 'arrow-up-down', CFG.zapFlip ? 'Up goes to the next channel (tap to swap)' : 'Up goes to the channel above (tap to swap)') : ''}
      </div>`;
    icons();
    $$('[data-act]', b).forEach((x) => x.addEventListener('click', () => {
      const a = x.dataset.act; X8.close('chMenu');
      if (a === 'play') return this.tune(c);
      if (a === 'fav') { this.toggleFav(k); toast(this.favs().has(k) ? `${c.name} added to favourites` : `${c.name} removed from favourites`, 'ok', 2200); }
      if (a === 'rec' && window.MkRec) return MkRec.offer(c);
      if (a === 'hide') toast(this.flip('hidden', k) ? `${c.name} hidden. Find it again under Hidden.` : `${c.name} is back in the list`, 'ok', 3000);
      if (a === 'hideg') toast(this.flip('hiddenGroups', gk) ? `${c.group} hidden. Find it again under Hidden.` : `${c.group} is back in the list`, 'ok', 3000);
      if (a === 'flip') { CFG.zapFlip = !CFG.zapFlip; ok(() => saveCfg()); toast(CFG.zapFlip ? 'Up now goes to the next channel' : 'Up now goes to the channel above', 'ok', 2600); return; }
      this.renderGuide();
    }));
    X8.open('chMenu');
  };

  /* ---------- playlist films and series ---------- */
  const SXE = /\bS(\d{1,2})\s*E(\d{1,3})\b/i;
  const seriesOf = (v) => { const m = v.name.match(SXE); if (m) return v.name.slice(0, m.index).replace(/[\s\-|:.]+$/, '').trim() || null; return v.vod === 'series' ? v.name : null; };
  C.m3uVod = async function (l, d, mode) {
    const epg = $('#epg'); if (!epg) return;
    const series = mode === 'series', q = look(this.st.q || ''), cat = this.st.cat || '';
    let items;
    if (series) {
      const by = new Map();
      d.vod.forEach((v) => { const s = seriesOf(v); if (!s) return; const k = look(s); if (!by.has(k)) by.set(k, { name: s, logo: v.logo, group: v.group, eps: [] }); by.get(k).eps.push(v); });
      items = [...by.values()];
    } else items = d.vod.filter((v) => !seriesOf(v));
    const cats = [...new Set(items.map((x) => x.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const all = items.filter((x) => (!cat || x.group === cat) && (!q || look(x.name).includes(q)));
    const per = IS_TV ? 36 : 72, shown = all.slice(0, per * (this.st.page || 1));
    epg.innerHTML = `<div id="ltBody"><div class="ch-bar">
        <div class="ch-search"><i data-lucide="search"></i><input class="inp" id="ltQ" type="search" placeholder="${series ? 'Find a series' : 'Find a film'}" value="${esc(this.st.q || '')}" autocomplete="off"></div>
        ${cats.length > 1 ? `<select class="sel" id="ltCat" aria-label="Category"><option value="">All · ${items.length}</option>${cats.map((g) => `<option value="${esc(g)}" ${g === cat ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select>` : ''}
      </div>
      ${shown.length ? `<div class="xt-grid">${shown.map((x, i) => `<button class="xt-card" type="button" data-nav data-lv="${i}"><span class="xt-art">${x.logo ? `<img src="${esc(x.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-gone>` : `<span>${esc(x.name)}</span>`}</span><b>${esc(x.name)}</b>${series ? `<small>${x.eps.length} episode${x.eps.length === 1 ? '' : 's'}</small>` : x.group ? `<small>${esc(x.group)}</small>` : ''}</button>`).join('')}</div>` : '<div class="empty" style="margin:16px">Nothing matches.</div>'}
      ${all.length > shown.length ? `<div class="actions" style="justify-content:center;margin:14px 0"><button class="btn btn-ghost" type="button" data-nav id="ltMore">Show more · ${all.length - shown.length} left</button></div>` : ''}</div>`;
    this.decorate(l);
    const qi = $('#ltQ'); qi.addEventListener('input', debounce(() => { this.st.q = qi.value; this.st.page = 1; this.m3uVod(l, d, mode).then(() => { const n = $('#ltQ'); if (n && !TOUCH_UI) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 250));
    const cs = $('#ltCat'); if (cs) cs.onchange = (e) => { this.st.cat = e.target.value; this.st.page = 1; this.m3uVod(l, d, mode); };
    const more = $('#ltMore'); if (more) more.onclick = () => { this.st.page = (this.st.page || 1) + 1; this.m3uVod(l, d, mode); };
    const play = (v, sub) => {
      const meta = remember({ id: `xtv:${l.id}:v${hash(v.url).toString(36)}`, type: 'movie', name: v.name, poster: v.logo || '', background: v.logo || '' });
      const st = { name: l.name, title: v.name, url: v.url, _addon: 'Channels', _list: l.id, behaviorHints: v.headers ? { proxyHeaders: { request: v.headers } } : {} };
      st._tel = Telemetry.parse(st);
      if (typeof this.playAny === 'function') this.playAny(st, meta, sub || v.group || '');
      else this.tune({ ...v }, meta);
    };
    $$('[data-lv]', epg).forEach((b) => b.addEventListener('click', () => {
      const x = shown[Number(b.dataset.lv)];
      if (!series) return play(x);
      X8.layer('ltSer', { label: x.name, icon: 'clapperboard', eyebrow: 'Series', wide: true });
      const body = X8.body('ltSer');
      const eps = x.eps.map((v, i) => { const m = v.name.match(SXE); return { v, s: m ? +m[1] : 1, e: m ? +m[2] : i + 1 }; }).sort((a, b2) => a.s - b2.s || a.e - b2.e);
      body.innerHTML = `<h3 class="x8-h">${esc(x.name)}</h3><div class="xt-list">${eps.map((p, i) => `<button class="xt-row" type="button" data-nav data-le="${i}"><span><b>${esc(`S${p.s} · E${p.e}`)}</b><small>${esc(p.v.name)}</small></span></button>`).join('')}</div>`;
      $$('[data-le]', body).forEach((r) => r.addEventListener('click', () => { const p = eps[Number(r.dataset.le)]; X8.close('ltSer'); play(p.v, `${x.name} · S${p.s} E${p.e}`); }));
      icons(); X8.open('ltSer');
    }));
    icons();
  };

  /* ---------- watching: zapping, numbers, last channel, now and next ---------- */
  let zap = null, last = null, cur = null;   // zap: { list, i } — the list the channel was picked from
  const tune1 = C.tune.bind(C);
  C.tune = function (c, metaIn) {
    if (!c) return;
    if (c.drm && !c._drmOk) {
      toast(`${c.name} is a protected channel (DRM). MKCinema can’t play protected channels yet. Open it in another player if your service allows it.`, 'err', 7000);
      return;
    }
    const d = this.data.get(c.list);
    // zapping follows the list the channel was chosen from (a group, Favourites, a search); else the whole playlist
    const from = (this._view && this._view.includes(c)) ? this._view : zap && zap.list.includes(c) ? zap.list : d ? d.channels.filter((x) => !this.hiddenSet().has(this.key(x)) && !this.hiddenGroups().has(this.gkey(x.list, x.group))) : [c];
    zap = { list: from, i: Math.max(0, from.indexOf(c)) };
    if (cur && cur !== c) last = cur;
    cur = c;
    ok(() => this.noteRecent(c));
    const r = tune1(c, metaIn);
    hookNative();
    [700, 1600].forEach((ms) => setTimeout(() => { if (cur === c) banner(c, true); }, ms));
    return r;
  };
  // the Android app's own player: Channel +/- close it with a request for the next channel
  // kept the outermost: the TV-service player hook wraps MKNative.done when its first channel plays, so this re-wraps
  const hookNative = () => {
    const N = window.MKNative; if (!N || typeof N.done !== 'function' || N.done._lt) return;
    const d0 = N.done;
    const fn = function (pos, dur, ended, next, err, act) {
      const r = d0.apply(this, arguments);
      if (zap && (act === 'chup' || act === 'chdown' || act === 'chlast')) setTimeout(() => { if (act === 'chlast') goLast(); else step(act === 'chup' ? 1 : -1, true); }, 80);
      return r;
    };
    fn._lt = true; N.done = fn;
  };
  const step = (dir, now) => {
    if (!zap || !zap.list.length) return;
    zap.i = (zap.i + dir + zap.list.length) % zap.list.length;
    const c = zap.list[zap.i];
    banner(c, false);
    clearTimeout(step.t);
    // a quick run of presses only starts the channel you stop on
    const go = () => { if (zap && zap.list[zap.i] === c) C.tune(c); };
    if (now) go(); else step.t = setTimeout(go, 420);
  };
  const goLast = () => { if (!last) return toast('No earlier channel yet', 'info', 1800); const c = last; C.tune(c); };
  const byNumber = (n) => {
    const d = cur && C.data.get(cur.list); const pool = d ? d.channels : (zap ? zap.list : []);
    const c = pool.find((x) => x.no === n);
    if (!c) return toast(`No channel ${n}`, 'info', 1800);
    C.tune(c);
  };

  // the banner: number, logo, name, what is on now (with how far in) and next
  const nowNext = (c) => { const d = C.data.get(c.list), l = (d && d.epg && d.epg.get(C.key(c))) || [], t = Date.now(); const i = l.findIndex((p) => p.start <= t && t < p.end); return { now: i >= 0 ? l[i] : null, next: i >= 0 ? l[i + 1] : l.find((p) => p.start > t) }; };
  const banner = (c, playing) => {
    const host = $('#player'); if (!host || host.hidden || !c) return;
    let b = $('#ltBanner'); if (!b) { b = document.createElement('div'); b.id = 'ltBanner'; b.setAttribute('aria-live', 'polite'); host.appendChild(b); }
    const { now, next } = nowNext(c), t = Date.now();
    const pct = now ? Math.max(0, Math.min(100, ((t - now.start) / (now.end - now.start)) * 100)) : 0;
    b.innerHTML = `<div class="lt-b-ch">${c.logo ? `<img src="${esc(c.logo)}" alt="" referrerpolicy="no-referrer" data-gone>` : ''}<span class="lt-b-no">${c.no || ''}</span></div>
      <div class="lt-b-tx"><b>${esc(c.name)}</b>${now ? `<span class="lt-b-now">${esc(now.title)} <em>${esc(hm(now.start))} – ${esc(hm(now.end))}</em></span><span class="lt-b-bar"><i style="transform:scaleX(${(pct / 100).toFixed(3)})"></i></span>` : `<span class="lt-b-now">${esc(c.group || '')}</span>`}${next ? `<span class="lt-b-next">Next · ${esc(hm(next.start))} ${esc(next.title)}</span>` : ''}${playing ? '' : '<span class="lt-b-next">Changing channel…</span>'}</div>`;
    b.classList.add('on'); clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.remove('on'), playing ? 4500 : 2500);
  };
  const typed = { s: '', t: 0 };
  const showTyped = () => {
    const host = $('#player'); if (!host) return;
    let n = $('#ltNum'); if (!n) { n = document.createElement('div'); n.id = 'ltNum'; host.appendChild(n); }
    n.textContent = typed.s; n.classList.toggle('on', !!typed.s);
  };
  const live = () => !$('#player').hidden && P.ctx && P.ctx.meta && P.ctx.meta._iptv && zap;
  document.addEventListener('keydown', (e) => {
    if (!live()) return;
    const t = e.target, tag = (t && t.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    const k = e.key, kc = e.keyCode;
    const drawer = $('#player .drawer.open') || !$('#dspPop').hidden || !$('#subMenu').hidden || !$('#optMenu').hidden || !$('#pMsg').hidden;
    // Channel +/- (and Page Up/Down) always switch
    const ch = { ChannelUp: 1, PageUp: 1, ChannelDown: -1, PageDown: -1 }[k] || (kc === 427 ? 1 : kc === 428 ? -1 : 0);
    if (ch) { e.preventDefault(); e.stopImmediatePropagation(); return step(ch); }
    if (drawer) return;
    // numbers: type a channel number; 0 alone goes back to the last channel
    const dg = /^[0-9]$/.test(k) ? k : (kc >= 48 && kc <= 57 ? String(kc - 48) : kc >= 96 && kc <= 105 ? String(kc - 96) : '');
    if (dg) {
      e.preventDefault(); e.stopImmediatePropagation();
      typed.s = (typed.s + dg).slice(-4); showTyped(); clearTimeout(typed.t);
      typed.t = setTimeout(() => { const s = typed.s; typed.s = ''; showTyped(); if (s === '0') goLast(); else if (Number(s) > 0) byNumber(Number(s)); }, 1500);
      return;
    }
    if (kc === 457 || k === 'Info' || k === 'Guide') { e.preventDefault(); e.stopImmediatePropagation(); return banner(cur, true); }
    if (!IS_TV) return;
    // TV remotes: Up/Down switch channels while the controls are hidden; OK shows the controls and what is on
    const hud = $('#hud'), idle = !hud || hud.classList.contains('idle');
    if ((k === 'ArrowUp' || k === 'ArrowDown') && idle) {
      e.preventDefault(); e.stopImmediatePropagation();
      const up = k === 'ArrowUp'; return step((up ? -1 : 1) * (CFG.zapFlip ? -1 : 1));
    }
    if (k === 'Enter' && idle && !(typeof Skip !== 'undefined' && Skip.visible && Skip.visible())) {
      e.preventDefault(); e.stopImmediatePropagation();
      banner(cur, true); wakeHud(); ok(() => Nav.restore(true));
    }
  }, true);
  // a channel that stops is tried again by the player; one that never starts: say so on the banner, keep zapping
  const cp = closePlayer;
  closePlayer = async function () { const b = $('#ltBanner'); if (b) b.classList.remove('on'); return cp.apply(this, arguments); };

  /* ---------- account sync: hidden, groups and Recently watched travel with the playlists ---------- */
  const ap = Account.applyRemote.bind(Account);
  Account.applyRemote = function (d) {
    const before = C.get();
    ap(d);
    const x = d && d.channels; if (!x || !Array.isArray(x.lists)) return;
    const now = C.get();
    ['hidden', 'hiddenGroups', 'recent'].forEach((k) => { now[k] = Array.isArray(x[k]) ? x[k] : (before[k] || []); });
    C.save(now);
  };
  // a removed playlist takes its hidden channels and groups with it
  const save0 = C.save.bind(C);
  C.save = function (d) {
    if (d && Array.isArray(d.lists)) { const ids = new Set(d.lists.map((l) => `${l.id}|`)); const keep = (k) => [...ids].some((p) => String(k).startsWith(p)); ['hidden', 'hiddenGroups', 'recent'].forEach((k) => { if (Array.isArray(d[k])) d[k] = d[k].filter(keep); }); }
    return save0(d);
  };

  hookNative();
  setTimeout(hookNative, 1500);
  COMMANDS.push({ label: 'Live TV: go back to the last channel', icon: 'history', run: () => goLast() });
})();
