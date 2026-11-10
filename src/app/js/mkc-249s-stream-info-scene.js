
/* ---------------- 2.49 Stream info and scene times from addons ----------------
   1. StreamInfo: an addon can describe each result as data (stream.mkcinema.info) instead of only in its text:
      resolution, HDR, codec, audio, size, cached, provider, release type, languages. MKCinema shows the same pills
      for every addon, and the source list can be filtered (HDR, Atmos) and sorted (best, largest, smallest). Results
      without the object are read from their text, as before.
   2. AddonScenes: scene times on /meta (the title, or each episode) or on /stream (this exact file), next to the
      `skips` resource from 2.43. Intro, outro, recap and the scene types 2.43 knows feed the Skip buttons. Highlights
      (`peak`) give Peak Cinema a real start point instead of a guess, with the addon named on screen.
   Spec: docs/addon-extras.md sections 13 and 14. */
const StreamInfo = {
  RES: { '2160p': '4K UHD', '4k': '4K UHD', uhd: '4K UHD', '1440p': '1440p', '1080p': '1080p', '720p': '720p', '576p': 'SD', '480p': 'SD', sd: 'SD' },
  HDR: { dv: 'Dolby Vision', 'dolby vision': 'Dolby Vision', dovi: 'Dolby Vision', 'hdr10+': 'HDR10+', hdr10: 'HDR', hdr: 'HDR', hlg: 'HDR', sdr: null },
  CODEC: { hevc: 'HEVC', h265: 'HEVC', 'h.265': 'HEVC', x265: 'HEVC', av1: 'AV1', h264: 'H.264', 'h.264': 'H.264', avc: 'H.264', x264: 'H.264', vp9: 'VP9' },
  AUDIO: { atmos: 'Atmos', truehd: 'TrueHD', 'dts-hd': 'DTS-HD', 'dts-hd ma': 'DTS-HD', 'dts:x': 'DTS-HD', 'dts-x': 'DTS-HD', dts: 'DTS', 'dd+': 'DD+', eac3: 'DD+', 'e-ac-3': 'DD+', ddp: 'DD+', dd: 'DD', ac3: 'DD', aac: 'AAC', opus: 'Opus', flac: 'FLAC' },
  RELEASE: ['Remux', 'BluRay', 'WEB-DL', 'WEBRip', 'HDTV', 'DVD'],
  low(v) { return String(v == null ? '' : v).trim().toLowerCase(); },
  read(s) {
    const x = s && s.mkcinema && s.mkcinema.info; if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const o = {};
    if (x.resolution != null) { const r = this.RES[this.low(x.resolution)]; if (r) o.res = r; }
    if (x.hdr != null) { const h = this.low(x.hdr); if (h in this.HDR) o.hdr = this.HDR[h]; }
    if (x.codec != null) { const c = this.CODEC[this.low(x.codec)]; if (c) o.codec = c; }
    const au = (Array.isArray(x.audio) ? x.audio : x.audio != null ? [x.audio] : []).slice(0, 6).map((a) => this.AUDIO[this.low(a)]).filter(Boolean);
    if (au.length) o.audio = [...new Set(au)];
    if (x.channels != null && /^(1\.0|2\.0|5\.1|6\.1|7\.1)$/.test(String(x.channels))) o.channels = String(x.channels);
    if (Number.isFinite(x.size) && x.size > 0 && x.size < 2 ** 46) o.size = x.size;
    if (typeof x.cached === 'boolean') o.cached = x.cached;
    if (x.provider) o.provider = AddonX.txt(String(x.provider).replace(/<[^>]*>/g, ''), 24);
    if (x.release) { const r = this.RELEASE.find((k) => k.toLowerCase() === this.low(x.release)); if (r) o.release = r; }
    if (Array.isArray(x.languages)) o.langs = x.languages.slice(0, 6).map((l) => this.low(l).slice(0, 3)).filter((l) => /^[a-z]{2,3}$/.test(l));
    return Object.keys(o).length ? o : null;
  },
  /* the parts of the base score that come from these fields, so a correction moves the score the same way */
  part(t) {
    let p = ({ '4K UHD': 400, '1440p': 340, '1080p': 300, '720p': 200, SD: 90 }[t.res] || 150);
    p += t.hdr === 'Dolby Vision' ? 34 : t.hdr === 'HDR10+' ? 30 : t.hdr ? 24 : 0;
    p += t.audio.includes('Atmos') ? 16 : 0; p += t.audio.includes('TrueHD') || t.audio.includes('DTS-HD') ? 10 : 0;
    p += t.audio.includes('7.1') ? 6 : t.audio.includes('5.1') ? 4 : 0;
    if (t.codec === 'HEVC' || t.codec === 'AV1') p -= 20;
    const rank = { '4K UHD': 4, '1440p': 3.5, '1080p': 3, '720p': 2, SD: 1 }, ceiling = { '4k': 4, '1080': 3, '720': 2 }[CFG.maxQuality] || 4;
    if (t.res && rank[t.res] > ceiling) p -= 250;
    p += t.cached === true ? 500 : t.cached === false ? -1600 : 0;
    return p;
  },
  apply(s, t) {
    const o = this.read(s); if (!o) return t;
    const before = this.part(t);
    if (o.res) t.res = o.res;
    if ('hdr' in o) t.hdr = o.hdr;
    if (o.codec) t.codec = o.codec;
    if (o.audio || o.channels) t.audio = [...(o.audio || t.audio.filter((a) => !/^\d\.\d$/.test(a))), ...(o.channels && o.channels !== '2.0' && o.channels !== '1.0' ? [o.channels] : (o.audio ? t.audio.filter((a) => /^\d\.\d$/.test(a)) : []))];
    if (o.size) { t.sizeBytes = o.size; t.size = fmtBytes(o.size); }
    if ('cached' in o) t.cached = o.cached;
    if (o.provider) t.provider = o.provider;
    if (o.release) t.release = o.release;
    if (o.langs && o.langs.length) t.langs = o.langs;
    t.score += this.part(t) - before; t.structured = true;
    return t;
  },
  pills(s, t) {
    if (!t || !t.structured) return '';
    const b = [];
    if (t.release) b.push(`<span class="tb mk-rel">${esc(t.release)}</span>`);
    if (t.provider) b.push(`<span class="tb mk-prov">${esc(t.provider)}</span>`);
    if (t.langs && t.langs.length) b.push(`<span class="tb mk-lang">${esc(t.langs.map((l) => l.toUpperCase()).join(' · '))}</span>`);
    return b.join('');
  },
  /* filters and sorting on the source list */
  SORTS: [['best', 'Best match'], ['big', 'Largest'], ['small', 'Smallest']],
  sorted(list) {
    const k = D.sort || 'best'; if (k === 'best') return list;
    const z = (s) => (s._tel && s._tel.sizeBytes) || 0;
    return list.slice().sort((a, b) => (k === 'big' ? z(b) - z(a) : (z(a) || Infinity) - (z(b) || Infinity)));
  },
  init() {
    const parse = Telemetry.parse.bind(Telemetry);
    Telemetry.parse = function (s) { const t = parse(s); try { return StreamInfo.apply(s, t); } catch (e) { return t; } };
    const badges = Telemetry.badges.bind(Telemetry);
    Telemetry.badges = function (s, tel) { const h = badges.apply(this, arguments); try { return h + StreamInfo.pills(s, tel); } catch (e) { return h; } };
    const fs = filterStreams;
    filterStreams = function (streams, f) {
      if (f === 'hdr') return StreamInfo.sorted(visibleStreams(streams).filter((s) => s._tel.hdr));
      if (f === 'atmos') return StreamInfo.sorted(visibleStreams(streams).filter((s) => s._tel.audio.includes('Atmos')));
      return StreamInfo.sorted(fs.apply(this, arguments));
    };
    const fc = filterChips;
    filterChips = function (streams, cur) {
      let h = fc.apply(this, arguments);
      const v = visibleStreams(streams), n1 = v.filter((s) => s._tel.hdr).length, n2 = v.filter((s) => s._tel.audio.includes('Atmos')).length;
      const chip = (k, l, n) => `<button class="chip ${cur === k ? 'on' : ''}" type="button" data-nav data-filter="${k}">${l} <span class="tag-s">${n}</span></button>`;
      if (n1) h += chip('hdr', 'HDR', n1);
      if (n2) h += chip('atmos', 'Atmos', n2);
      if (v.some((s) => s._tel.sizeBytes)) h += `<span class="mk-sort" role="group" aria-label="Sort sources">${StreamInfo.SORTS.map(([k, l]) => `<button class="chip ${(D.sort || 'best') === k ? 'on' : ''}" type="button" data-nav data-sort="${k}">${l}</button>`).join('')}</span>`;
      return h;
    };
    const rs = renderStreamsPanel;
    renderStreamsPanel = function () {
      const r = rs.apply(this, arguments);
      $$('#dStreams [data-sort]').forEach((b) => b.addEventListener('click', () => { D.sort = b.dataset.sort; renderStreamsPanel(); }));
      return r;
    };
  },
};

const AddonScenes = {
  TYPES: { intro: 'intro', opening: 'intro', outro: 'outro', credits: 'outro', ending: 'outro', recap: 'recap', ad: 'ad', nudity: 'nudity', sex: 'sex', violence: 'violence', language: 'language', drugs: 'drugs', fear: 'fear' },
  PEAK: ['peak', 'highlight'],
  peaksBy: new Map(),
  list(x) {
    const m = x && x.mkcinema; if (m && Array.isArray(m.segments)) return m.segments.slice(0, 100);
    return x && Array.isArray(x._mkseg) ? x._mkseg : [];
  },
  /* to the shape 2.43's skips use, so one cleaner checks them all */
  skips(list, from) {
    return AddonSkips.clean(list.map((g) => g && ({ startMs: g.startMs, endMs: g.endMs, category: this.TYPES[StreamInfo.low(g.type)] || '', severity: g.severity, description: g.label, action: g.action })).filter(Boolean), from);
  },
  peaks(list, from) {
    return list.map((g) => {
      if (!g || !this.PEAK.includes(StreamInfo.low(g.type || g.category))) return null;
      const s = Number(g.startMs) / 1000, e = Number(g.endMs) / 1000;
      if (!isFinite(s) || s < 0 || !isFinite(e) || e <= s || e - s > 900) return null;
      return { s, e, label: AddonX.txt(g.label || g.description, 60), from };
    }).filter(Boolean);
  },
  /* addons that said "my /meta carries scene times" are asked for this title; the answer is cached like any meta */
  async metaFrom(type, id) {
    const out = [];
    const cands = engine.addons.filter((a) => AddonX.live(a) && AddonX.ext(a).segments && engine.supports(a, 'meta', type, id));
    await Promise.all(cands.map((a) => engine.call(a, 'meta', type, id).then((r) => { if (r && r.meta) out.push({ meta: r.meta, from: a.manifest.name }); }).catch(() => {})));
    return out;
  },
  forVideo(meta, vid) {
    const v = vid && Array.isArray(meta.videos) ? meta.videos.find((x) => x && x.id === vid) : null;
    return v ? this.list(v) : this.list(meta);
  },
  /* the playing title: its own meta, the scene-time addons' meta, and the stream that is playing */
  async gather(ctx, stream) {
    const type = ctx.meta.type, vid = ctx.video ? videoIdFor(ctx.meta, ctx.video) : ctx.meta.id, sk = [], pk = [];
    const add = (list, from) => { sk.push(...this.skips(list, from)); pk.push(...this.peaks(list, from)); };
    add(this.forVideo(ctx.meta, vid), ctx.meta._addon || 'Addon');
    for (const r of await this.metaFrom(type, ctx.meta.id)) add(this.forVideo(r.meta, vid), r.from);
    if (stream && stream._addonId) { const a = AddonX.byId(stream._addonId); if (AddonX.live(a)) add(this.list(stream), a.manifest.name); }
    return { sk, pk };
  },
  async load(ctx, token) {
    const { sk, pk } = await this.gather(ctx, P.stream);
    if (token !== AddonSkips.token) return;
    if (pk.length) this.peaksBy.set(ctx.meta.id, pk);
    if (!sk.length) return;
    const key = (g) => `${Math.round(g.s)}:${g.cat}`, have = new Set(AddonSkips.segs.map(key));
    AddonSkips.segs = [...AddonSkips.segs, ...sk.filter((g) => !have.has(key(g)))].sort((a, b) => a.s - b.s);
    const intro = AddonSkips.segs.find((x) => x.cat === 'intro'), outro = AddonSkips.segs.find((x) => x.cat === 'outro');
    if (intro && !(Skip.m && Skip.m.intro)) Skip.m = { ...(Skip.m || {}), intro: [intro.s, intro.e], src: intro.from };
    if (outro && !(Skip.m && Skip.m.credits)) Skip.m = { ...(Skip.m || {}), credits: outro.s, ed: [outro.s, outro.e], src: (Skip.m && Skip.m.src) || outro.from };
  },
  /* Peak Cinema: highlights for a film, from its chosen file, the scene-time addons and the skips resource */
  async peakFor(meta, stream) {
    const id = meta.id, out = [];
    if (stream && stream._addonId) { const a = AddonX.byId(stream._addonId); if (AddonX.live(a)) out.push(...this.peaks(this.list(stream), a.manifest.name)); }
    if (this.peaksBy.has(id)) out.push(...this.peaksBy.get(id));
    else {
      const got = [];
      got.push(...this.peaks(this.list(meta), meta._addon || 'Addon'));
      for (const r of await this.metaFrom('movie', id)) got.push(...this.peaks(this.list(r.meta), r.from));
      const sk = engine.addons.filter((a) => !a.virtual && AddonX.live(a) && engine.supports(a, 'skips', 'movie', id));
      await Promise.all(sk.map((a) => engine.call(a, 'skips', 'movie', id).then((r) => got.push(...this.peaks(Array.isArray(r && r.skips) ? r.skips : [], a.manifest.name))).catch(() => {})));
      this.peaksBy.set(id, got); out.push(...got);
    }
    return out;
  },
  init() {
    // Addon looks (2.42) replaces meta.mkcinema with a checked copy; the scene times are kept beside it
    if (typeof AddonUI !== 'undefined' && AddonUI.clean) {
      const cl = AddonUI.clean.bind(AddonUI);
      AddonUI.clean = function (m, addon) {
        const r = cl(m, addon);
        try { if (r && r !== m && m.mkcinema && Array.isArray(m.mkcinema.segments) && AddonUI.allowed(addon)) r._mkseg = m.mkcinema.segments.slice(0, 100); } catch (e) { /* ignore */ }
        return r;
      };
    }
    const ld = AddonSkips.load.bind(AddonSkips);
    AddonSkips.load = async function (ctx) {
      const token = AddonSkips.token + 1, r = await ld(ctx);
      if (CFG.addonSkips !== false && ctx && ctx.meta) { try { await AddonScenes.load(ctx, token); } catch (e) { /* playback goes on */ } }
      return r;
    };
    this.peak();
  },
  peak() {
    if (typeof Peak === 'undefined') return;
    const timed = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r([]), ms))]);
    Peak.seekTo = function (v, url, clip, tok) {
      const peaksP = timed(AddonScenes.peakFor(clip.meta, clip.stream).catch(() => []), 4000);
      return new Promise((done) => {
        let fin = false; const end = (ok) => { if (fin) return; fin = true; clearTimeout(t); v.removeEventListener('error', err); done(ok); };
        const err = () => end(false), t = setTimeout(() => end(false), 25000);
        v.addEventListener('error', err);
        v.muted = true; v.preload = 'auto'; v.src = url;
        v.addEventListener('loadedmetadata', async () => {
          const d = v.duration;
          if (tok !== this.tok || !isFinite(d) || d < 1200) { end(false); return; }
          const peaks = (await peaksP).filter((g) => g.s >= 30 && g.s < d - 60);
          if (tok !== this.tok) { end(false); return; }
          if (peaks.length) {
            const seen = this.learn().seen || {}, fresh = peaks.filter((g) => !seen[`${clip.meta.id}@${Math.round(g.s)}`]);
            const g = (fresh.length ? fresh : peaks)[Math.floor(Math.random() * (fresh.length || peaks.length))];
            clip.d = d; clip.offset = Math.round(g.s); clip.len = clamp(Math.round(g.e - g.s), 30, 180); clip.peak = g;
          } else {
            const [lo, hi] = this.band(), credits = Math.max(480, d * .1);
            const a = Math.max(600, d * lo), b = Math.min(d * hi, d - credits - this.CLIP);
            if (b <= a) { end(false); return; }
            clip.d = d; clip.offset = Math.round(a + Math.random() * (b - a));
          }
          v.currentTime = clip.offset;
          const ready = () => {
            if (!v.videoWidth) { end(false); return; }
            if (v.readyState >= 3) end(true); else v.addEventListener('canplay', () => end(!!v.videoWidth), { once: true });
          };
          v.addEventListener('seeked', ready, { once: true });
        }, { once: true });
      });
    };
    // a highlight runs as long as the addon marked it (30 s to 3 min); a guessed scene keeps 90 s
    Peak.tick = function (v) {
      const c = this.cur; if (!c || c.v !== v) return;
      const p = clamp((v.currentTime - c.offset) / (c.len || this.CLIP), 0, 1);
      $('#pkBar').style.transform = `scaleX(${p.toFixed(4)})`;
      const f = `From ${fmtTime(v.currentTime)}`; if ($('#pkFrom').textContent !== f) $('#pkFrom').textContent = f;
      if (p >= 1) {
        if (c.peak) { try { const l = this.learn(); l.seen[`${c.meta.id}@${Math.round(c.peak.s)}`] = Date.now(); this.saveLearn(l); } catch (e) { /* ignore */ } }
        this.feedback(c, 'full'); this.advance();
      }
    };
    const rd = Peak.render.bind(Peak);
    Peak.render = function () {
      const r = rd.apply(this, arguments);
      try { const c = this.cur, info = $('#pkInfo'); if (c && c.peak && info && !$('.mk-pkby', info)) info.insertAdjacentHTML('beforeend', `<div class="mk-pkby"><i data-lucide="sparkles"></i>${esc(c.peak.label || 'A highlight')} · marked by ${esc(AddonX.txt(c.peak.from, 40))}</div>`); icons(); } catch (e) { /* ignore */ }
      return r;
    };
    const how = Peak.how.bind(Peak);
    Peak.how = function (show) {
      try { const p = $('#pkHowBox p'); if (p && !p.dataset.mk) { p.dataset.mk = '1'; p.textContent = 'When one of your addons marks a film’s highlights, Peak Cinema starts there and names the addon. Otherwise, and no database of famous scenes is pretended, a scene starts between about a third and three quarters of the way in, past the opening and well before the credits.'; } } catch (e) { /* ignore */ }
      return how.apply(this, arguments);
    };
  },
};

try { StreamInfo.init(); AddonScenes.init(); } catch (e) { try { MKLog.add('error', `2.49 stream info / scenes: ${e.message}`); } catch (_) { /* no log */ } console.warn('2.49 module skipped', e); }
