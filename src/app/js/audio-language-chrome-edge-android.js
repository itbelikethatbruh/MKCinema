
'use strict';
/* =====================================================================
   MKCinema · audio language
   Chrome, Edge and Android WebView cannot switch the audio tracks inside an MKV or MP4 (only Safari/WebKit exposes
   video.audioTracks). So MKCinema switches them the way Stremio's streaming server does, outside the browser:
   - TorBox files: TorBox's own stream (HLS) is made with the chosen audio track (stream/createstream, chosen_audio_index).
   - Any other file: mkcinema-server.js remuxes it with ffmpeg and maps the chosen track (/remux?audio=N).
   Otherwise the menu says so and offers VLC.
   ===================================================================== */
const AudioLang = {
  info: new WeakMap(),
  TB: 'https://api.torbox.app/v1/api',
  // first value in a nested API reply that passes test (TorBox's stream reply is not documented in detail)
  dig(o, test, d = 0) {
    if (!o || typeof o !== 'object' || d > 6) return null;
    for (const [k, v] of Object.entries(o)) { const r = test(k, v); if (r) return r; }
    for (const v of Object.values(o)) { const r = this.dig(v, test, d + 1); if (r) return r; }
    return null;
  },
  label(t, n) {
    if (typeof t === 'string') t = { language: t };
    const tg = t.tags || {}, lang = t.language || t.lang || t.language_code || tg.language, title = t.title || t.name || t.label || tg.title;
    const ch = Number(t.channels || t.channel_count), chs = t.atmos ? 'Atmos' : ch === 6 ? '5.1' : ch === 8 ? '7.1' : ch === 2 ? 'Stereo' : ch === 1 ? 'Mono' : '';
    const ln = lang && lang !== 'und' ? langName(lang) : '';
    const parts = [ln || title || `Track ${n + 1}`, title && title !== ln && !new RegExp(`^${String(ln).replace(/\W/g, '.')}$`, 'i').test(title) ? title : '', chs, this.codec(t.codec || t.codec_name)];
    return parts.filter(Boolean).filter((p, i, a) => a.indexOf(p) === i).join(' · ');
  },
  codec(c) {
    const k = String(c || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (!k) return '';
    return { ec3: 'Dolby Digital Plus', eac3: 'Dolby Digital Plus', ac3: 'Dolby Digital', truehd: 'Dolby TrueHD', mlp: 'Dolby TrueHD', dts: 'DTS', dtshd: 'DTS-HD', dca: 'DTS', aac: 'AAC', mp4a402: 'AAC', mp4a405: 'HE-AAC', opus: 'Opus', flac: 'FLAC', mp3: 'MP3', vorbis: 'Vorbis' }[k] || (/^mp4a/.test(k) ? 'AAC' : /^pcm/.test(k) ? 'PCM' : String(c).toUpperCase());
  },
  hls(t) { const a = t.attrs || {}, ch = String(a.CHANNELS || ''); return this.label({ language: t.lang, title: t.name, channels: parseInt(ch, 10) || 0, atmos: /JOC/i.test(ch), codec: t.audioCodec }, 0); },
  tracks(list) { return (Array.isArray(list) ? list : []).map((t, n) => ({ i: n, label: this.label(t || {}, n), def: !!(t && typeof t === 'object' && (t.default || (t.disposition || {}).default)) })); },
  defIndex(tracks) { const d = tracks.find((t) => t.def); return d ? d.i : 0; },
  // a lookup that hangs must not leave the menu saying "Checking" forever
  within(ms, p) { return Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('no answer in time')), ms))]); },
  // which TorBox torrent and file this stream is, from MKCinema's own resolve or a Torrentio-style /resolve/torbox/ link
  async tbRef(s) {
    const own = Vault.cfg().tb;
    if (s._tb && own) return { key: own, ...s._tb };
    const url = s._audioBase || s.url || '', m = url.match(/\/resolve\/torbox\/([^/]+)\/([a-f0-9]{40})(?:\/([^/?#]*))?(?:\/([^/?#]+))?/i);
    if (!m) return null;
    const key = decodeURIComponent(m[1]), hash = m[2].toLowerCase(), H = { Authorization: `Bearer ${key}` };
    const l = await Vault.call(`${this.TB}/torrents/mylist?bypass_cache=true`, { headers: H });
    const t = (Array.isArray(l.data) ? l.data : [l.data]).find((x) => x && String(x.hash || '').toLowerCase() === hash);
    if (!t || !(t.files || []).length) throw new Error('this film is not in your TorBox list yet');
    const name = m[4] ? decodeURIComponent(m[4]) : '', files = t.files.map((x) => ({ ...x, name: x.name || x.short_name }));
    const f = (name && files.find((x) => String(x.name).split('/').pop() === name || x.short_name === name)) || Vault.pickFile(files, s, P.ctx);
    return f ? { key, id: t.id, fileId: f.id } : null;
  },
  tbErr(e) {
    const m = String(e && e.message || e);
    if (/PLAN_RESTRICTED|plan/i.test(m)) return 'your TorBox plan does not include web streaming';
    if (/BAD_TOKEN|auth/i.test(m)) return 'TorBox did not accept the key';
    return m;
  },
  // TorBox web streaming: createstream gives a presigned token, getstreamdata gives the HLS playlist and the file's tracks
  async tbStream(ref, idx) {
    const H = { headers: { Authorization: `Bearer ${ref.key}` } }, m3u8 = (j) => this.dig(j, (k, v) => typeof v === 'string' && (/\.m3u8(\?|$)/i.test(v) || /hls/i.test(k) && /^https?:/i.test(v)) && v);
    if (!ref.pt) {
      const c = await Vault.call(`${this.TB}/stream/createstream?id=${ref.id}&file_id=${ref.fileId}&type=torrent&chosen_audio_index=${idx}`, H);
      ref.pt = this.dig(c, (k, v) => /presigned/i.test(k) && typeof v === 'string' && v) || null;
      if (!ref.pt) { const hls = m3u8(c); if (hls) return { hls: new URL(hls, 'https://api.torbox.app').href, tracks: this.tracks(this.dig(c, (k, v) => /audio/i.test(k) && Array.isArray(v) && v.length && v)) }; throw new Error(c.detail || c.error || 'TorBox did not start a stream'); }
    }
    const j = await Vault.call(`${this.TB}/stream/getstreamdata?presigned_token=${encodeURIComponent(ref.pt)}&token=${encodeURIComponent(ref.key)}&chosen_audio_index=${idx}`, H);
    const hls = m3u8(j), list = this.dig(j, (k, v) => /audio/i.test(k) && Array.isArray(v) && v.length && v);
    return { hls: hls ? new URL(hls, 'https://api.torbox.app').href : null, tracks: this.tracks(list) };
  },
  async probe(s) {
    const st = { state: 'loading' }; this.info.set(s, st);
    try {
      if (P.remux && P.remux.tracks) Object.assign(st, { via: 'srv', tracks: this.tracks(P.remux.tracks) });
      if (!st.tracks || st.tracks.length < 2) {
        const tb = s._debrid === 'tb' || s._tb || /torbox/i.test(s._audioBase || s.url || '');
        if (tb) {
          try {
            const ref = await this.within(25000, this.tbRef(s));
            if (ref) {
              const r = await this.within(30000, this.tbStream(ref, 0));
              if (r.tracks.length) Object.assign(st, { via: 'tb', ref, tracks: r.tracks, hls: r.hls });
              else if (r.hls) Object.assign(st, { via: 'tb', ref, tracks: [], hls: r.hls, hlsOnly: true });
            }
          } catch (e) { st.err = `TorBox: ${this.tbErr(e)}`; }
        }
      }
      if ((!st.tracks || st.tracks.length < 2) && !st.hlsOnly && !s._local && await Rescue.caps()) {
        const bh = s.behaviorHints || {}, h = bh.proxyHeaders && bh.proxyHeaders.request;
        const r = await this.within(30000, fetch(`${String(S.proxy).replace(/\/+$/, '')}/remux/probe?url=${encodeURIComponent(s._audioBase || s.url)}${h ? `&headers=${encodeURIComponent(b64json(h))}` : ''}`));
        const j = await r.json(); if (r.ok && (j.tracks || []).length) { Object.assign(st, { via: 'srv', tracks: this.tracks(j.tracks) }); delete st.err; }
      }
    } catch (e) { st.err = st.err || e.message; }
    st.state = st.tracks && st.tracks.length > 1 || st.hlsOnly ? 'ok' : 'none';
    if (st.state === 'ok' && st.cur == null) st.cur = s._audio != null ? s._audio : st.via === 'srv' && P.remux ? P.remux.audio || 0 : st.hlsOnly ? -1 : this.defIndex(st.tracks);
    if (P.stream === s && !$('#optMenu').hidden) renderOptMenu();
    return st;
  },
  section(s) {
    const st = this.info.get(s), head = '<h5>Audio language</h5>';
    if (!st) this.probe(s);
    if (!st || st.state === 'loading') return `${head}<p class="al-note"><span class="spin"></span>Checking the languages in this file…</p>`;
    if (st.state === 'ok' && st.hlsOnly) return `${head}<button type="button" class="${s._audioTry ? 'on' : ''}" data-alang="-1"><i data-lucide="languages"></i>${s._audioTry ? 'All languages loaded · pick one above' : 'Load every language (TorBox stream)'}</button>`;
    if (st.state === 'ok') return `${head}${st.tracks.map((t) => `<button type="button" class="${st.cur === t.i ? 'on' : ''}" data-alang="${t.i}"><i data-lucide="audio-lines"></i>${esc(t.label)}</button>`).join('')}`;
    // the section stays put with the reason, so it never flickers away
    const one = st.tracks && st.tracks.length === 1;
    return `${head}<p class="al-note">${one ? `This file has one audio language: ${esc(st.tracks[0].label)}.` : st.err ? `Couldn’t read the languages: ${esc(st.err)}.` : 'This browser can’t switch languages inside this file by itself. Use a TorBox source, run your MKCinema server, or open it in VLC.'}</p>${one ? '' : '<button type="button" data-alretry><i data-lucide="rotate-cw"></i>Try again</button>'}`;
  },
  async pick(i) {
    const s = P.stream, st = s && this.info.get(s); if (!st || st.state !== 'ok' || st.cur === i && !(i === -1 && !s._audioTry)) return;
    const t = st.tracks.find((x) => x.i === i), at = pNow(); st.cur = i; s._audio = i;
    toast(i === -1 ? 'Loading TorBox’s stream with every language…' : `Audio: ${t ? t.label : `track ${i + 1}`}…`, 'info', 2600);
    if (st.via === 'srv') {
      if (P.remux) { P.remux.audio = i; Rescue.load(s, at); } else { Rescue.wantAudio = i; Rescue.start(s, at); }
      return;
    }
    // TorBox: the original file plays its default track; any other track plays as TorBox's HLS stream
    if (s._audioBase == null) s._audioBase = s.url;
    if (i !== -1 && i === this.defIndex(st.tracks)) { s.url = s._audioBase; delete s._audioTry; }
    else {
      try { const r = i === -1 ? { hls: st.hls } : await this.within(30000, this.tbStream(st.ref, i)); if (!r.hls) throw new Error('TorBox did not return a stream'); s.url = r.hls; s._audioTry = Date.now(); }
      catch (e) { toast(`TorBox: ${this.tbErr(e)}`, 'err', 6000); st.cur = st.hlsOnly ? -1 : this.defIndex(st.tracks); s._audio = null; return; }
    }
    if (P.stream !== s) return;
    s._tel = Telemetry.parse(s);
    playStream(P.ctx, s, { startAt: at });
  },
  cycle() {
    const s = P.stream, st = s && this.info.get(s);
    if (st && st.state === 'ok' && !st.tracks.length) { if (!s._audioTry) this.pick(-1); else toast('Pick a language from the audio menu', 'info'); return true; }
    if (st && st.state === 'ok') { const n = st.tracks[(st.tracks.findIndex((t) => t.i === st.cur) + 1) % st.tracks.length]; this.pick(n.i); return true; }
    if (s && !st) { this.probe(s).then((r) => { if (r.state === 'ok') this.cycle(); else toast('This stream has a single audio track'); }); return true; }
    return false;
  },
};
/* mk-264-player-cloud */
/* ---------------- Cloud convert: your own debrid service makes a copy this device can play ----------------
   No MKCinema server. Real-Debrid (streaming/transcode) and TorBox (stream/createstream) already make H.264 + AAC
   versions of the files in your account. When a debrid file will not play in this browser (its format, no sound,
   Safari and MKV) and no other copy is left, MKCinema asks your own service for that version once and plays it in the
   built-in player. The API calls use your key and go to the service (or through the debrid relay when the browser
   blocks them); the video itself goes from the service to this device, never through MKCinema.
   Real-Debrid's versions are HLS (seekable), MP4 and WebM; they are tried in that order where this browser plays HLS. */
const CloudConvert = {
  RD: 'https://api.real-debrid.com/rest/1.0',
  tried: new WeakSet(), tok: 0, startT: 0,
  on() { return CFG.cloudConvert !== false; },
  label(svc) { return svc === 'rd' ? 'Real-Debrid' : 'TorBox'; },
  // which service can convert this stream, and the user's own key for it
  who(s) {
    const own = Vault.cfg() || {}, u = String(s._audioBase || s.url || '');
    if (s._debrid === 'rd' || s._rd || /real-?debrid/i.test(u)) {
      const m = u.match(/\/resolve\/realdebrid\/([^/]+)\//i);
      let key = own.rd || '';
      if (!key && m) { try { key = decodeURIComponent(m[1]); } catch (e) { key = ''; } }
      if (key && !/[\s/?#]/.test(key)) return { svc: 'rd', key };
    }
    if (s._debrid === 'tb' || s._tb || /torbox/i.test(u)) return { svc: 'tb' };
    return null;
  },
  // Real-Debrid's file id: from MKCinema's own resolve, a download address (/d/ID/), or the account's recent downloads
  async rdId(s, key) {
    if (s._rd) return s._rd;
    const u = String(s.url || ''), d = u.match(/^https?:\/\/[^/?#]*real-debrid\.com\/d\/([A-Za-z0-9]+)(?:[/?#]|$)/i);
    if (d) return d[1];
    let last = ''; try { last = decodeURIComponent(new URL(u).pathname.split('/').pop() || ''); } catch (e) { /* not a URL */ }
    const names = [(s.behaviorHints || {}).filename, last].filter((n) => n && /\.[a-z0-9]{2,4}$/i.test(n)).map((n) => String(n).toLowerCase());
    if (!names.length) return null;
    const list = await Vault.call(`${this.RD}/downloads?limit=50`, { headers: { Authorization: `Bearer ${key}` } });
    const hit = (Array.isArray(list) ? list : []).find((x) => x && names.includes(String(x.filename || '').toLowerCase()));
    return hit && hit.id ? String(hit.id) : null;
  },
  rdPick(j) {
    const one = (o) => (o && typeof o === 'object' ? (typeof o.full === 'string' ? o.full : Object.values(o).find((v) => typeof v === 'string')) : null);
    const hls = one(j.apple), mp4 = one(j.liveMP4), webm = one(j.h264WebM);
    const hlsOk = !!video.canPlayType('application/vnd.apple.mpegurl') || !!(window.MediaSource || window.ManagedMediaSource);
    return [...new Set([hlsOk && hls, mp4, webm, !hlsOk && hls])].filter((x) => typeof x === 'string' && /^https:\/\//i.test(x));
  },
  async urls(s, w) {
    if (w.svc === 'rd') {
      const id = await this.rdId(s, w.key); if (!id) throw new Error('this file is not in your Real-Debrid downloads');
      const j = await Vault.call(`${this.RD}/streaming/transcode/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${w.key}` } });
      return this.rdPick(j || {});
    }
    const ref = await AudioLang.within(25000, AudioLang.tbRef(s)); if (!ref) throw new Error('this file is not in your TorBox list');
    const r = await AudioLang.within(30000, AudioLang.tbStream(ref, 0));
    return r && r.hls ? [r.hls] : [];
  },
  log(m) { try { MKLog.add('play', `cloud convert: ${m}`); } catch (e) { /* no log */ } },
  /* where a debrid file would otherwise end in "won't play here": true when a converted copy is on its way */
  onFail(s, reason, at) {
    if (!s || s._cloud || s._local || P.stream !== s || $('#player').hidden || !this.on() || this.tried.has(s)) return false;
    const w = this.who(s); if (!w) return false;
    this.tried.add(s);
    const tok = ++this.tok, ctx = P.ctx, t = at > 0 ? at : 0;
    clearTimeout(Failover.t); clearTimeout(Failover.stallT); try { video.pause(); } catch (e) { /* none */ }
    try { $('#pMsg').hidden = true; $('#rescueBar').hidden = true; } catch (e) { /* none */ }
    Loader.show(ctx && ctx.meta);
    toast(`This file won’t play here as it is. Asking your ${this.label(w.svc)} for a version this device can play…`, 'info', 5000, 'cloudconv');
    this.log(`${w.svc} for "${reason}"`);
    (async () => {
      let list = [];
      try { list = await Vault.within(this.urls(s, w), 45000); } catch (e) { this.log(e.message); }
      if (tok !== this.tok || P.stream !== s || $('#player').hidden) return;
      if (!list.length) { toast(`Your ${this.label(w.svc)} has no converted version of this file`, 'info', 4500, 'cloudconv'); playbackFailed(s, reason); return; }
      const bh = { ...(s.behaviorHints || {}) }; delete bh.notWebReady; delete bh.proxyHeaders;
      const c = { ...s, url: list[0], behaviorHints: bh, _cloud: { svc: w.svc, rest: list.slice(1), of: s, at: t } };
      ['_tel', '_audioBase', '_audioTry', '_audio', '_mkHeal', '_cors'].forEach((k) => delete c[k]);
      this.go(c, t);
    })();
    return true;
  },
  go(c, t) {
    clearTimeout(this.startT);
    c._tel = Telemetry.parse(c); c._tel.webReady = true; c._tel.mkv = false;
    const tag = `Converted by your ${this.label(c._cloud.svc)}`;
    if (!String(c._tel.source || '').includes(tag)) c._tel.source = tag;
    P.force = true;
    playStream(P.ctx, c, { startAt: t });
    toast(`Playing the version your ${this.label(c._cloud.svc)} converted for this device`, 'ok', 3500, 'cloudconv');
    // a conversion can take several seconds to begin; one that never starts falls through to the next version
    this.startT = setTimeout(() => { if (P.stream === c && video.readyState < 1 && !$('#player').hidden) playbackFailed(c, 'the converted version did not start'); }, 25000);
  },
  // the converted version failed: its next version, or (none left) the usual message with the original file
  nextUrl(c) {
    clearTimeout(this.startT);
    const cc = c._cloud; if (!cc) return false;
    if (cc.rest.length && P.stream === c && !$('#player').hidden) {
      c.url = cc.rest.shift(); this.log(`next version ${c.url.split('?')[0].split('/').pop()}`);
      this.go(c, P.mkReal ? pNow() : cc.at); return true;
    }
    c.url = cc.of.url; c._tel = cc.of._tel || Telemetry.parse(cc.of);
    return false;
  },
};
{
  const base = renderOptMenu;
  renderOptMenu = function () {
    base(); const m = $('#optMenu'), s = P.stream;
    if (!s || $("[data-audio]", m)) return;
    const html = AudioLang.section(s); if (!html) return;
    const h = $$('h5', m).find((x) => x.textContent === 'Aspect ratio');
    if (h) h.insertAdjacentHTML('beforebegin', html); else m.insertAdjacentHTML('beforeend', html);
    $$('[data-alang]', m).forEach((b) => b.addEventListener('click', () => { m.hidden = true; AudioLang.pick(Number(b.dataset.alang)); }));
    const rt = $('[data-alretry]', m); if (rt) rt.onclick = () => { AudioLang.info.delete(s); renderOptMenu(); };
    icons();
  };
  // a TorBox language stream that will not play goes back to the original file instead of skipping to another source
  const failed = playbackFailed;
  playbackFailed = function (stream, reason) {
    if (stream && stream._audioTry && Date.now() - stream._audioTry < 30000 && stream._audioBase) {
      const at = pNow(); stream.url = stream._audioBase; delete stream._audioTry; stream._audio = null; AudioLang.info.delete(stream); stream._tel = Telemetry.parse(stream);
      toast('That language stream would not play here, so the original audio is back', 'err', 6000);
      playStream(P.ctx, stream, { startAt: at }); return;
    }
    return failed(stream, reason);
  };
}
