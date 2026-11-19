
/* 2.75.6 audio languages in place (Android app) */
(() => {
  if (typeof MkNative === 'undefined' || typeof AudioPref === 'undefined') return;
  const droid = () => { try { const b = MkNative.bridge(); return !!(b && b.droid); } catch (e) { return false; } };
  const plain = (s) => !!(s && s.url && !s.ytId && /^https?:\/\//i.test(s.url));
  const lang = (c) => { try { return langName(c); } catch (e) { return String(c); } };
  const codes = (s) => { try { const r = AudioPref.langs(s); return { list: [...r.langs].filter((c, i, a) => a.indexOf(c) === i), multi: !!(r.multi || r.langs.size > 1) }; } catch (e) { return { list: [], multi: false }; } };
  /* the app has the MKCinema Player and the person has not switched it off */
  const can = () => droid() && MkNative.ok && CFG.nativePlayer !== false && !MkNative.bad;
  try { MkNative.probe(); } catch (e) { /* ignore */ }

  /* Owner confirmed MKCinema Player plays on his phone (Android 1.15.3, 2026-11-17 4 PM ET): in the Android app it is ON unless switched off, with the fallback below as the safety net */
  const baseWants = MkNative.wants.bind(MkNative);
  MkNative.wants = function (s) {
    if (baseWants(s)) return true;
    if (!can() || !plain(s) || s._mkFell) return false;
    return true;
  };
  const baseAlang = MkNative.alang.bind(MkNative);
  MkNative.alang = function () {
    const w = this.cur && this.cur._mkAudWant; if (!w) return baseAlang();
    const was = window.MkAudioWant; window.MkAudioWant = () => w;
    try { return baseAlang(); } finally { window.MkAudioWant = was; }
  };
  /* a native start that never got going goes back to the page player once, and native stops starting by itself */
  const fell = (why) => {
    const s = MkNative.cur; if (!s || (MkNative.metaFired && MkNative.st.w > 0)) return false;
    s._mkFell = true; s._mkNative = false; MkNative.bad = true;
    try { MKLog.add('play', 'native: back to the page player (' + why + ')'); } catch (e) { /* ignore */ }
    const at = (typeof switchAt === 'function' ? switchAt() : 0) || 0;
    try { MkNative.stop(); } catch (e) { /* ignore */ }
    setTimeout(() => { if (P.stream === s && P.ctx) { try { toast('That language could not be switched here; playing the file’s own track.', 'info', 3500); } catch (e) { /* ignore */ } playStream(P.ctx, s, { startAt: at || undefined }); } }, 0);
    return true;
  };
  const baseFail = MkNative.fail.bind(MkNative);
  MkNative.fail = function (msg) { if (fell(msg)) return; return baseFail(msg); };
  const baseOpen = MkNative.open.bind(MkNative);
  MkNative.open = function (stream, at) {
    baseOpen(stream, at);
    if (!droid()) return;
    clearTimeout(MkNative._wd);
    MkNative._wd = setTimeout(() => { if (MkNative.active && MkNative.cur === stream && !(MkNative.metaFired && MkNative.st.w > 0)) fell('no picture after 15 s'); }, 15000);
  };
  if (typeof Failover !== 'undefined' && Failover.on) { const fo = Failover.on; Failover.on = function () { if (window.MkNative && MkNative.active) return false; return fo.apply(this, arguments); }; }

  /* every track the native player lists carries its language name, so the list reads English / Italian, not AC3 / EAC3 */
  const baseTracks = MkNative.tracks.bind(MkNative);
  MkNative.tracks = function (list) {
    baseTracks(list);
    try {
      const au = list.filter((t) => t.type === 'audio');
      (this.audio || []).forEach((a, i) => { const t = au[i]; if (!t || !t.lang || t.lang === 'und') return; a.label = [lang(t.lang), t.title && !new RegExp(lang(t.lang), 'i').test(t.title) ? t.title : '', t.codec && String(t.codec).toUpperCase(), t['demux-channel-count'] ? t['demux-channel-count'] + ' ch' : ''].filter(Boolean).join(' · '); });
    } catch (e) { /* ignore */ }
  };

  /* ---- tapping a language ---- */
  const same = (a, b) => lang(a) === lang(b);
  const pick = (code) => {
    const s = P.stream; if (!s || !code) return;
    s._mkAudUser = true;
    if (MkNative.active && MkNative.cur === s && MkNative.audio) {
      const t = MkNative.audio.find((x) => same(x.language, code));
      if (t) { t.enabled = true; try { toast('Audio: ' + lang(code), 'info', 2200); } catch (e) { /* ignore */ } setTimeout(() => { try { if (!$('#optMenu').hidden) renderOptMenu(); if (!$('#subMenu').hidden) renderSubMenu(); } catch (e) { /* ignore */ } }, 80); return; }
    }
    s._mkNative = true; s._mkAudWant = code; s._mkFell = false;
    try { $('#optMenu').hidden = true; $('#subMenu').hidden = true; } catch (e) { /* ignore */ }
    try { toast('Switching to ' + lang(code) + '…', 'info', 2200); } catch (e) { /* ignore */ }
    playStream(P.ctx, s, { startAt: typeof switchAt === 'function' ? switchAt() : undefined });
  };
  const rows = (s, cls) => codes(s).list.map((c) => `<button type="button" class="${cls || ''}" data-mkapick="${esc(c)}"><i data-lucide="audio-lines"></i>${esc(lang(c))}</button>`).join('');
  const said = (s) => { const l = codes(s).list.map(lang); return l.length ? `This file has ${l.join(' and ')}.` : 'This file has more than one language.'; };
  const cant = () => (droid() ? ' This file plays its default track here; the MKCinema Player could not take it over.' : ' This browser plays the file’s own default track; the MKCinema apps for Android, Windows and Mac switch languages while it plays.');
  const plainText = (s) => `<p class="al-note">${esc(said(s))}${cant()}</p>`;

  /* the Audio language block in Options */
  let obs = null;
  const fixOpt = () => {
    try {
      const m = $('#optMenu'), s = P.stream; if (!m || !s) return;
      const dead = $$('[data-alinfo]', m); if (!dead.length) return;
      const multi = codes(s).multi, first = dead[0];
      const xp = $('[data-alxp]', m), note = $('.al-note', m);
      const live = can() && plain(s) && multi;
      if (live) {
        first.insertAdjacentHTML('beforebegin', rows(s, 'al-row') || '<p class="al-note">Several languages: pick one in Audio &amp; subtitles.</p>');
        dead.forEach((b) => b.remove()); if (xp) xp.remove(); if (note) note.remove();
        $$('[data-mkapick]', m).forEach((b) => { b.onclick = () => pick(b.dataset.mkapick); });
      } else if (multi) {
        first.insertAdjacentHTML('beforebegin', plainText(s));
        dead.forEach((b) => b.remove()); if (note) note.remove();
        if (xp) xp.remove(); // the app never sends you elsewhere to pick a language
      }
      if (typeof icons === 'function') icons();
    } catch (e) { /* ignore */ }
  };
  /* other scripts also redraw the Options menu, so the block is tidied whenever its content changes */
  const watch = () => {
    const m = document.getElementById('optMenu'); if (!m) return;
    obs = new MutationObserver(() => { obs.disconnect(); try { fixOpt(); } finally { obs.observe(m, { childList: true, subtree: true }); } });
    obs.observe(m, { childList: true, subtree: true }); fixOpt();
  };
  if (document.getElementById('optMenu')) watch(); else document.addEventListener('DOMContentLoaded', watch);
  /* the Audio & subtitles panel, when nothing could read the tracks */
  if (typeof AvTracks !== 'undefined') {
    const html = AvTracks.html.bind(AvTracks), bind = AvTracks.bind.bind(AvTracks);
    AvTracks.html = function () {
      const h = html(), s = P.stream;
      if (!s || /data-avaudio/.test(h) || /spin/.test(h)) return h;
      const c = codes(s); if (!c.multi) return h;
      if (can() && plain(s)) return `${rows(s, '')}<p class="av-note">Tap a language to play in it.</p>`;
      return `<p class="av-note">${esc(said(s))}${cant()}</p>`;
    };
    AvTracks.bind = function (m) { bind(m); $$('[data-mkapick]', m).forEach((b) => { b.onclick = () => pick(b.dataset.mkapick); }); };
  }
})();
