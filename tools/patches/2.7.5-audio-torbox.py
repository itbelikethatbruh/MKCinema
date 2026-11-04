# MKCinema 2.7.5: TorBox audio languages via createstream -> presigned_token -> getstreamdata (hls_url + tracks),
# timeouts, and an Audio language section that never disappears. Usage: python3 2.7.5-audio-torbox.py index.html
import sys
p = sys.argv[1]; s = open(p).read()
a = s.index('const AudioLang = {')
b = s.index('  label(t, n) {', a); e = s.index('  cycle() {', b)
NEW = r'''  label(t, n) {
    if (typeof t === 'string') t = { language: t };
    const tg = t.tags || {}, lang = t.language || t.lang || t.language_code || tg.language, title = t.title || t.name || t.label || tg.title;
    const ch = Number(t.channels || t.channel_count), chs = ch === 6 ? '5.1' : ch === 8 ? '7.1' : ch === 2 ? 'Stereo' : ch === 1 ? 'Mono' : '';
    const ln = lang && lang !== 'und' ? langName(lang) : '';
    const parts = [ln || title || `Track ${n + 1}`, title && title !== ln && !new RegExp(`^${String(ln).replace(/\W/g, '.')}$`, 'i').test(title) ? title : '', chs, String(t.codec || t.codec_name || '').toUpperCase()];
    return parts.filter(Boolean).filter((p, i, a) => a.indexOf(p) === i).join(' · ');
  },
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
'''
s = s[:b] + NEW + s[e:]
old = """    $$('[data-alang]', m).forEach((b) => b.addEventListener('click', () => { m.hidden = true; AudioLang.pick(Number(b.dataset.alang)); }));"""
assert s.count(old) == 1
s = s.replace(old, old + """
    const rt = $('[data-alretry]', m); if (rt) rt.onclick = () => { AudioLang.info.delete(s); renderOptMenu(); };""")
open(p, 'w').write(s); print('patched')
