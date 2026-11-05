/* ---------------- Source Check ----------------
   Reads every source against the title it is meant to be: executables and archives, samples, a different episode, a
   different year, a cinema recording, or a file far too small for the quality it claims. Clear mismatches are hidden;
   doubtful ones drop down the list with a plain note. The best match says why it won. Nothing is invented: every note
   comes from the source's own name and size and the title's runtime and year. */
const SourceCheck = {
  on: () => CFG.sourceCheck !== false,
  ctx() { return !$('#player').hidden && P.ctx ? P.ctx : { meta: D.meta, video: D.video }; },
  text(s) { const bh = s.behaviorHints || {}; return [s.name, s.title, s.description, bh.filename].filter(Boolean).join(' \n '); },
  check(s, ctx) {
    const meta = ctx && ctx.meta; const key = `${meta ? meta.id : ''}|${ctx && ctx.video ? ctx.video.id : ''}`;
    if (s._chk && s._chk.key === key) return s._chk;
    const out = { key, hide: '', warn: [], pen: 0 }, t = s._tel || {}, txt = this.text(s), T = txt.toLowerCase();
    if (!t.isTrailer && t.kind !== 'yt') {
      if (/\.(exe|scr|bat|cmd|msi|apk|lnk|zip|rar|7z|iso)\b/i.test(`${(s.behaviorHints || {}).filename || ''} ${s.title || ''}`)) out.hide = 'a program or archive, not a video';
      else if (/\b(password|passwd)\b.*\b(required|protected)\b|\bcodec\s+pack\b/i.test(txt)) out.hide = 'asks for a password or extra software';
      else if (/\bsample\b/i.test(T) && !/samples?\s+(of|from)/i.test(T) && t.sizeBytes && t.sizeBytes < 400 * 1048576) out.hide = 'a short sample';
      const rel = `${s.title || ''} ${(s.behaviorHints || {}).filename || ''}`.replace(/\.(ts|m2ts)\b/gi, '');
      if (/\b(cam|camrip|hdcam|telesync|hdts|ts-?rip|telecine|tc-?rip|hdtc)\b/i.test(T) || /(^|[ ._\-[])(ts|tc)([ ._\-\]]|$)/i.test(rel)) { out.warn.push('Cinema recording'); out.pen += 420; }
      else if (/\b(scr|screener|dvdscr)\b/i.test(T)) { out.warn.push('Screener copy'); out.pen += 200; }
    }
    if (meta && !out.hide && !t.isTrailer) {
      const v = ctx.video;
      if (meta.type === 'series' && v && v.season != null && v.episode != null) {
        const eps = [...txt.matchAll(/\bS(\d{1,2})[ ._-]?E(\d{1,3})(?:[ ._-]?(?:-|E|to)[ ._-]?E?(\d{1,3}))?/gi)];
        if (eps.length) {
          const hit = eps.some((m) => +m[1] === +v.season && (m[3] ? +m[2] <= +v.episode && +v.episode <= +m[3] : +m[2] === +v.episode));
          const packs = /\b(complete|season|pack|S\d{1,2}\s*-\s*S\d{1,2})\b/i.test(txt);
          if (!hit && !packs) out.hide = `a different episode (${eps.map((m) => `S${m[1].padStart(2, '0')}E${m[2].padStart(2, '0')}`).slice(0, 2).join(', ')})`;
        }
      }
      if (meta.type === 'movie') {
        const y = parseInt(yearOf(meta), 10), nameNums = new Set((String(meta.name || '').match(/\b(19|20)\d{2}\b/g) || []));
        const ys = [...txt.matchAll(/(?<![\d.])((?:19|20)\d{2})(?![\dp])/g)].map((m) => m[1]).filter((x) => !nameNums.has(x) && x !== '2160' && x !== '1080');
        if (y && ys.length && !ys.some((x) => Math.abs(+x - y) <= 1)) { out.warn.push(`Says ${ys[0]}, film is ${y}`); out.pen += 260; }
        const min = X8.runtimeMin(meta), gb = t.sizeBytes / 1073741824;
        if (min >= 40 && gb > 0) {
          const floor = { '4K UHD': 1.6, '1440p': 0.9, '1080p': 0.55, '720p': 0.22 }[t.res];
          if (floor && gb < floor * (min / 100)) { out.warn.push(`Small for ${t.res}`); out.pen += 160; }
          if (gb < 0.12 * (min / 100)) { out.hide = 'far too small to be the whole film'; }
        }
      }
    }
    s._chk = out; return out;
  },
  why(s) {
    const t = s._tel || {}, bits = [];
    if (t.res) bits.push(t.res); if (t.hdr) bits.push(t.hdr);
    if (t.cached === true) bits.push('ready on your debrid service');
    if (t.webReady && !t.mkv) bits.push('plays in this browser');
    if (t.audio && t.audio.length) bits.push(t.audio.join(' '));
    const c = s._chk; if (c && !c.warn.length && this.on()) bits.push('name, year and size check out');
    return bits.join(' · ');
  },
  init() {
    const vis = visibleStreams;
    visibleStreams = function (streams) {
      const list = vis.apply(this, arguments);
      if (!SourceCheck.on()) return list;
      const ctx = SourceCheck.ctx();
      const keep = list.filter((s) => !SourceCheck.check(s, ctx).hide);
      // doubtful sources sink; the rest keep their order
      return keep.map((s, i) => [s, i]).sort((a, b) => (a[0]._chk.pen - b[0]._chk.pen) || (a[1] - b[1])).map(([s]) => s);
    };
    const row = streamRowHTML;
    streamRowHTML = function (s, idx, o = {}) {
      let h = row.apply(this, arguments);
      const c = SourceCheck.on() && s._chk;
      if (c && c.warn.length) h = h.replace('<div class="tele">', `<div class="tele">${c.warn.map((w) => `<span class="tb chk"><i data-lucide="alert-triangle"></i>${esc(w)}</span>`).join('')}`);
      if (o.best) { const w = SourceCheck.why(s); if (w) h = h.replace('</div><div class="tele">', `</div><div class="s-why">Why this one: ${esc(w)}</div><div class="tele">`); }
      return h;
    };
    const panel = renderStreamsPanel;
    renderStreamsPanel = function () {
      panel.apply(this, arguments);
      const box = $('#dStreams'); if (!box || !SourceCheck.on() || !D.streams.length) return;
      const ctx = SourceCheck.ctx(), gone = D.streams.filter((s) => s._tel && SourceCheck.check(s, ctx).hide);
      if (gone.length && !$('.chk-line', box)) {
        const why = [...new Set(gone.map((s) => s._chk.hide))].slice(0, 2).join('; ');
        const chips = $('.chips', box); if (chips) chips.insertAdjacentHTML('beforebegin', `<div class="status-line bo-line chk-line"><i data-lucide="shield-check"></i><span>Source Check hid ${gone.length} source${gone.length === 1 ? '' : 's'}: ${esc(why)}. Settings › Streams & addons turns it off.</span></div>`);
        icons();
      }
    };
    const sec = secById('streams');
    if (sec) { const rows = sec.rows; sec.rows = () => [{ key: 'sourceCheck', label: 'Source Check', help: 'Hides programs, archives, samples, other episodes and files far too small to be the film. Cinema recordings, a different year or a small file for the quality drop down the list with a note.', type: 'toggle', get: () => CFG.sourceCheck !== false }, ...rows()]; }
  },
};
SourceCheck.init();
