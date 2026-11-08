/* MKCinema play-anything engine: the worker.
   It reads an MKV/WebM file straight from its host with HTTP Range requests, copies the video into fragmented MP4
   (never re-encoded, so the device's own hardware decoder plays it) and either copies the audio too or, when the
   browser can't play that audio format, decodes it and re-encodes it to AAC with a small WebAssembly build of FFmpeg
   (engine/audio/, loaded only when needed). Single-threaded: no SharedArrayBuffer, no COOP/COEP headers.

   Messages in:  open {url, headers} · start {t, audio, mode, gen} · seek {t, gen} · audio {idx, mode, t, gen} · until {t} · close
   Messages out: info · fail {reason} · init {kind, mime, data} · frag {kind, data, t0, t1} · eos · error {reason} · note {msg} */
'use strict';

/* ---------------- EBML ---------------- */
const ID = {
  EBML: 0x1A45DFA3, DocType: 0x4282, Segment: 0x18538067, SeekHead: 0x114D9B74, Seek: 0x4DBB, SeekID: 0x53AB, SeekPosition: 0x53AC,
  Info: 0x1549A966, TimecodeScale: 0x2AD7B1, Duration: 0x4489, Tracks: 0x1654AE6B, TrackEntry: 0xAE, TrackNumber: 0xD7, TrackType: 0x83,
  CodecID: 0x86, CodecPrivate: 0x63A2, Language: 0x22B59C, LanguageBCP47: 0x22B59D, Name: 0x536E, FlagDefault: 0x88, FlagForced: 0x55AA,
  FlagEnabled: 0xB9, DefaultDuration: 0x23E383, CodecDelay: 0x56AA, Video: 0xE0, PixelWidth: 0xB0, PixelHeight: 0xBA, DisplayWidth: 0x54B0,
  DisplayHeight: 0x54BA, Audio: 0xE1, SamplingFrequency: 0xB5, OutputSamplingFrequency: 0x78B5, Channels: 0x9F, BitDepth: 0x6264,
  ContentEncodings: 0x6D80, ContentEncoding: 0x6240, ContentCompression: 0x5034, ContentCompAlgo: 0x4254, ContentCompSettings: 0x4255,
  ContentEncryption: 0x5035, BlockAdditionMapping: 0x41E4, BlockAddIDType: 0x41E7, BlockAddIDExtraData: 0x41ED,
  Cues: 0x1C53BB6B, CuePoint: 0xBB, CueTime: 0xB3, CueTrackPositions: 0xB7, CueTrack: 0xF7, CueClusterPosition: 0xF1,
  Cluster: 0x1F43B675, Timecode: 0xE7, SimpleBlock: 0xA3, BlockGroup: 0xA0, Block: 0xA1, BlockDuration: 0x9B, ReferenceBlock: 0xFB,
  Tags: 0x1254C367, Chapters: 0x1043A770, Attachments: 0x1941A469, Void: 0xEC, CRC32: 0xBF,
};
const TOP = new Set([ID.SeekHead, ID.Info, ID.Tracks, ID.Cues, ID.Cluster, ID.Tags, ID.Chapters, ID.Attachments]);
const UNKNOWN = -1;

function vlen(b) { for (let i = 0; i < 8; i++) if (b & (0x80 >> i)) return i + 1; return 0; }
/* returns [value, length] or null when the buffer is too short */
function readId(u, p, end) {
  if (p >= end) return null; const n = vlen(u[p]); if (!n || n > 4) throw new Error('bad element id');
  if (p + n > end) return null; let v = 0; for (let i = 0; i < n; i++) v = v * 256 + u[p + i]; return [v, n];
}
function readSize(u, p, end) {
  if (p >= end) return null; const n = vlen(u[p]); if (!n) throw new Error('bad element size');
  if (p + n > end) return null; let v = u[p] & (0xFF >> n), all = v === (0xFF >> n);
  for (let i = 1; i < n; i++) { v = v * 256 + u[p + i]; if (u[p + i] !== 0xFF) all = false; }
  return [all ? UNKNOWN : v, n];
}
function readUint(u, p, n) { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + u[p + i]; return v; }
function readFloat(u, p, n) { const d = new DataView(u.buffer, u.byteOffset + p, n); return n === 4 ? d.getFloat32(0) : n === 8 ? d.getFloat64(0) : 0; }
function readStr(u, p, n) { let s = ''; for (let i = 0; i < n; i++) { if (!u[p + i]) break; s += String.fromCharCode(u[p + i]); } return s; }
function readUtf8(u, p, n) { try { return new TextDecoder().decode(u.subarray(p, p + n)).replace(/\0+$/, ''); } catch (e) { return readStr(u, p, n); } }
/* every child of [p, end): {id, start (of data), size, hdr} */
function* children(u, p, end) {
  while (p < end) {
    const i = readId(u, p, end); if (!i) return; const s = readSize(u, p + i[1], end); if (!s) return;
    const d = p + i[1] + s[1], size = s[0] === UNKNOWN ? end - d : s[0];
    yield { id: i[0], start: d, size, hdr: i[1] + s[1] };
    p = d + size;
  }
}

/* ---------------- Network: Range reads straight from the host (MKCinema never proxies video) ---------------- */
const Net = {
  url: '', headers: {}, size: 0,
  async range(a, b, signal, ms = 15000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    const kill = () => ctl.abort(); if (signal) signal.addEventListener('abort', kill, { once: true });
    try {
      const r = await fetch(this.url, { headers: { ...this.headers, Range: `bytes=${a}-${b}` }, signal: ctl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (r.status !== 206) {
        if (r.status === 200 && a === 0) { const buf = new Uint8Array(await r.arrayBuffer()); return { buf, total: buf.length, noRange: true }; }
        throw new Error(r.status === 200 ? 'the host ignores byte ranges' : `the host answered ${r.status}`);
      }
      const cr = r.headers.get('content-range') || '', m = cr.match(/\/(\d+)\s*$/);
      return { buf: new Uint8Array(await r.arrayBuffer()), total: m ? Number(m[1]) : 0 };
    } finally { clearTimeout(t); if (signal) signal.removeEventListener('abort', kill); }
  },
};

/* ---------------- Codec helpers ---------------- */
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
function avcCodec(priv) { return priv && priv.length > 3 ? `avc1.${[priv[1], priv[2], priv[3]].map((x) => x.toString(16).padStart(2, '0')).join('')}` : 'avc1.640028'; }
function hevcCodec(h) {
  if (!h || h.length < 23) return 'hvc1.1.6.L120.90';
  const space = h[1] >> 6, tier = (h[1] >> 5) & 1, prof = h[1] & 31;
  let compat = ((h[2] << 24) | (h[3] << 16) | (h[4] << 8) | h[5]) >>> 0, rev = 0;
  for (let i = 0; i < 32; i++) { rev = (rev << 1) | (compat & 1); compat >>>= 1; }
  const cons = [h[6], h[7], h[8], h[9], h[10], h[11]]; while (cons.length && !cons[cons.length - 1]) cons.pop();
  return `hvc1.${['', 'A', 'B', 'C'][space]}${prof}.${(rev >>> 0).toString(16).toUpperCase()}.${tier ? 'H' : 'L'}${h[12]}${cons.length ? '.' + cons.map((c) => c.toString(16).toUpperCase()).join('.') : ''}`;
}
function hevcBitDepth(h) { return h && h.length > 20 ? (h[20] & 7) + 8 : 8; }
function av1Codec(c) {
  if (!c || c.length < 4) return 'av01.0.08M.08';
  const prof = c[1] >> 5, lvl = c[1] & 31, tier = c[2] >> 7, hi = (c[2] >> 6) & 1, twelve = (c[2] >> 5) & 1;
  return `av01.${prof}.${String(lvl).padStart(2, '0')}${tier ? 'H' : 'M'}.${hi ? (twelve ? '12' : '10') : '08'}`;
}
/* AAC AudioSpecificConfig for the old "A_AAC/MPEG4/LC"-style ids that carry no CodecPrivate */
const SR = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
function makeAsc(aot, rate, ch) { let i = SR.indexOf(rate); if (i < 0) i = 3; return new Uint8Array([(aot << 3) | (i >> 1), ((i & 1) << 7) | ((ch & 15) << 3)]); }
function ascInfo(a) { if (!a || a.length < 2) return null; let aot = a[0] >> 3, i = ((a[0] & 7) << 1) | (a[1] >> 7); return { aot: aot === 31 ? 32 + ((a[0] & 7) << 3 | a[1] >> 5) : aot, rate: SR[i] || 48000, ch: (a[1] >> 3) & 15 }; }

/* samples in one audio frame, from its own header (MKV timestamps are only millisecond-accurate) */
const AC3_SIZES = [64, 64, 80, 80, 96, 96, 112, 112, 128, 128, 160, 160, 192, 192, 224, 224, 256, 256, 320, 320, 384, 384, 448, 448, 512, 512, 640, 640, 768, 768, 896, 896, 1024, 1024, 1152, 1152, 1280, 1280];
function eac3Frames(f) {
  // E-AC-3 blocks can hold several syncframes (an independent one plus dependent substreams)
  let p = 0, samples = 0, dep = false, n = 0;
  while (p + 6 <= f.length && f[p] === 0x0B && f[p + 1] === 0x77) {
    const bsid = f[p + 5] >> 3;
    if (bsid <= 10) { const code = f[p + 4] & 63, fs = f[p + 4] >> 6; const sz = (fs === 0 ? AC3_SIZES[code] : fs === 1 ? (Math.floor([69, 87, 104, 121, 139, 174, 208, 243, 278, 348, 417, 487, 557, 696, 835, 975, 1114, 1253, 1393][code >> 1] || 0) + (code & 1)) : AC3_SIZES[code] * 1.5) * 2; samples += 1536; n++; p += sz || f.length; continue; }
    const strm = f[p + 2] >> 6, size = ((((f[p + 2] & 7) << 8) | f[p + 3]) + 1) * 2, fscod = f[p + 4] >> 6, blk = fscod === 3 ? 3 : (f[p + 4] >> 4) & 3;
    if (strm === 1) dep = true; else samples += [1, 2, 3, 6][blk] * 256;
    n++; p += size;
  }
  return { samples, dep, n };
}
function mp3Samples(f) { if (f.length < 4 || f[0] !== 0xFF) return 1152; const ver = (f[1] >> 3) & 3, layer = (f[1] >> 1) & 3; return layer === 3 ? 384 : layer === 1 && ver !== 3 ? 576 : 1152; }
function opusSamples(f) {
  if (!f.length) return 960; const toc = f[0], cfg = toc >> 3, c = toc & 3;
  const ms = cfg < 12 ? [10, 20, 40, 60][cfg & 3] : cfg < 16 ? [10, 20][cfg & 1] : [2.5, 5, 10, 20][cfg & 3];
  const frames = c === 0 ? 1 : c < 3 ? 2 : (f[1] || 0) & 63; return Math.round(frames * ms * 48);
}
function flacSamples(f, def) {
  if (f.length < 6 || f[0] !== 0xFF || (f[1] & 0xFE) !== 0xF8) return def;
  const bs = f[2] >> 4; if (bs === 1) return 192; if (bs >= 2 && bs <= 5) return 576 << (bs - 2); if (bs >= 8) return 256 << (bs - 8);
  let p = 4; const b = f[p]; let n = b < 0x80 ? 1 : b < 0xE0 ? 2 : b < 0xF0 ? 3 : b < 0xF8 ? 4 : b < 0xFC ? 5 : b < 0xFE ? 6 : 7; p += n;
  return bs === 6 ? f[p] + 1 : bs === 7 ? ((f[p] << 8) | f[p + 1]) + 1 : def;
}

/* ---------------- MP4 boxes ---------------- */
function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function u16(n) { return [(n >> 8) & 255, n & 255]; }
function u64(n) { const hi = Math.floor(n / 4294967296), lo = n >>> 0; return [...u32(hi), ...u32(lo)]; }
function cat(parts) {
  let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let k = 0;
  for (const p of parts) { o.set(p instanceof Uint8Array ? p : Uint8Array.from(p), k); k += p.length; } return o;
}
function box(type, ...parts) { const body = cat(parts); const o = new Uint8Array(8 + body.length); o.set(u32(o.length)); for (let i = 0; i < 4; i++) o[4 + i] = type.charCodeAt(i); o.set(body, 8); return o; }
function full(type, v, flags, ...parts) { return box(type, [v, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts); }
const MATRIX = [...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
function esDesc(oti, asc) {
  const dsi = asc ? [5, asc.length, ...asc] : [];
  const dcd = [4, 13 + dsi.length, oti, 0x15, 0, 0, 0, ...u32(0), ...u32(0), ...dsi];
  const es = [3, 3 + dcd.length + 3, 0, 1, 0, ...dcd, 6, 1, 2];
  return full('esds', 0, 0, es);
}
function dOps(head, ch) {
  // OpusHead (little-endian) to the MP4 dOps box (big-endian)
  if (!head || head.length < 19) return box('dOps', [0, ch || 2, ...u16(312), ...u32(48000), 0, 0, 0]);
  const dv = new DataView(head.buffer, head.byteOffset, head.length), fam = head[18];
  const out = [0, head[9], ...u16(dv.getUint16(10, true)), ...u32(dv.getUint32(12, true)), ...u16(dv.getInt16(16, true) & 0xFFFF), fam];
  if (fam) for (let i = 19; i < head.length; i++) out.push(head[i]);
  return box('dOps', out);
}
function dac3(f) {
  // fscod, bsid, bsmod, acmod, lfeon, bit_rate_code from the first AC-3 syncframe
  const fscod = f[4] >> 6, frm = f[4] & 63, bsid = f[5] >> 3, bsmod = f[5] & 7;
  let bit = 48; const rd = (n) => { let v = 0; for (let i = 0; i < n; i++, bit++) v = (v << 1) | ((f[bit >> 3] >> (7 - (bit & 7))) & 1); return v; };
  const acmod = rd(3); if ((acmod & 1) && acmod !== 1) rd(2); if (acmod & 4) rd(2); if (acmod === 2) rd(2); const lfe = rd(1);
  const v = (fscod << 22) | (bsid << 17) | (bsmod << 14) | (acmod << 11) | (lfe << 10) | ((frm >> 1) << 5);
  return box('dac3', [(v >> 16) & 255, (v >> 8) & 255, v & 255]);
}
function dec3(f, rate) {
  const strm = f[2] >> 6, size = ((((f[2] & 7) << 8) | f[3]) + 1) * 2, fscod = f[4] >> 6, blk = fscod === 3 ? 3 : (f[4] >> 4) & 3;
  const acmod = (f[4] >> 1) & 7, lfe = f[4] & 1, bsid = f[5] >> 3; void strm;
  const kbps = Math.round(size * 8 * rate / ([1, 2, 3, 6][blk] * 256) / 1000);
  // data_rate(13) num_ind_sub(3) | fscod(2) bsid(5) reserved(1) asvc(1) bsmod(3) acmod(3) lfeon(1) reserved(3) num_dep_sub(4) reserved(1)
  const bits = []; const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  put(kbps, 13); put(0, 3); put(fscod === 3 ? 0 : fscod, 2); put(bsid, 5); put(0, 1); put(0, 1); put(0, 3); put(acmod, 3); put(lfe, 1); put(0, 3); put(0, 4); put(0, 1);
  const out = []; for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | (bits[i + k] || 0); out.push(b); }
  return box('dec3', out);
}
function initSegment(tr, entry, timescale, isVideo) {
  const ftyp = box('ftyp', [...'isom'].map((c) => c.charCodeAt(0)), u32(0x200), [...'isomiso6mp41'].map((c) => c.charCodeAt(0)));
  const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(0), u32(0x10000), u16(0x100), new Array(10).fill(0), MATRIX, new Array(24).fill(0), u32(2));
  const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(0), new Array(8).fill(0), u16(0), u16(0), u16(isVideo ? 0 : 0x100), u16(0), MATRIX,
    u32(isVideo ? (tr.dw || tr.w) << 16 : 0), u32(isVideo ? (tr.dh || tr.h) << 16 : 0));
  const mdhd = full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(0), u16(0x55C4), u16(0));
  const hdlr = full('hdlr', 0, 0, u32(0), [...(isVideo ? 'vide' : 'soun')].map((c) => c.charCodeAt(0)), new Array(12).fill(0), [...'MKCinema', '\0'].map((c) => c.charCodeAt(0)));
  const xmhd = isVideo ? full('vmhd', 0, 1, new Array(8).fill(0)) : full('smhd', 0, 0, u32(0));
  const dinf = box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1)));
  const stbl = box('stbl', full('stsd', 0, 0, u32(1), entry), full('stts', 0, 0, u32(0)), full('stsc', 0, 0, u32(0)), full('stsz', 0, 0, u32(0), u32(0)), full('stco', 0, 0, u32(0)));
  const trak = box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', xmhd, dinf, stbl)));
  const mvex = box('mvex', full('trex', 0, 0, u32(1), u32(1), u32(0), u32(0), u32(0)));
  return cat([ftyp, box('moov', mvhd, trak, mvex)]);
}
function videoEntry(tr) {
  const type = tr.kind === 'hevc' ? 'hvc1' : tr.kind === 'av1' ? 'av01' : 'avc1', cfg = tr.kind === 'hevc' ? 'hvcC' : tr.kind === 'av1' ? 'av1C' : 'avcC';
  const name = new Array(32).fill(0);
  const parts = [new Array(6).fill(0), u16(1), u16(0), u16(0), new Array(12).fill(0), u16(tr.w), u16(tr.h), u32(0x480000), u32(0x480000), u32(0), u16(1), name, u16(0x18), u16(0xFFFF), box(cfg, tr.priv)];
  if (tr.dw && tr.dh && (tr.dw !== tr.w || tr.dh !== tr.h)) parts.push(box('pasp', u32(tr.dw * tr.h), u32(tr.dh * tr.w)));
  return box(type, ...parts);
}
function audioEntry(type, ch, rate, cfgBox) {
  return box(type, new Array(6).fill(0), u16(1), new Array(8).fill(0), u16(ch), u16(16), u16(0), u16(0), u32(rate < 65536 ? rate << 16 : 0), cfgBox);
}
/* one moof+mdat. samples: {data, dur, cts, key} in decode order; trun v1 allows negative composition offsets */
let seqNo = 1;
function fragment(baseTime, samples, isVideo) {
  const n = samples.length, flagsKey = 0x02000000, flagsDelta = 0x01010000;
  const trFlags = isVideo ? 0x000F01 : 0x000301; // data-offset, duration, size, [flags, cts]
  const per = isVideo ? 16 : 8, trunSize = 12 + 8 + n * per;
  const tfhd = full('tfhd', 0, 0x020000, u32(1));
  const tfdt = full('tfdt', 1, 0, u64(Math.max(0, Math.round(baseTime))));
  const moofSize = 8 + 16 + 8 + tfhd.length + tfdt.length + trunSize;
  const trun = new Uint8Array(trunSize); const dv = new DataView(trun.buffer);
  dv.setUint32(0, trunSize); trun.set([116, 114, 117, 110], 4); dv.setUint32(8, (1 << 24) | trFlags); dv.setUint32(12, n); dv.setInt32(16, moofSize + 8);
  let p = 20, total = 0;
  for (const s of samples) {
    dv.setUint32(p, s.dur); dv.setUint32(p + 4, s.data.length);
    if (isVideo) { dv.setUint32(p + 8, s.key ? flagsKey : flagsDelta); dv.setInt32(p + 12, s.cts); }
    p += per; total += s.data.length;
  }
  const moof = box('moof', full('mfhd', 0, 0, u32(seqNo++)), box('traf', tfhd, tfdt, trun));
  const out = new Uint8Array(moof.length + 8 + total); out.set(moof); const ov = new DataView(out.buffer);
  ov.setUint32(moof.length, 8 + total); out.set([109, 100, 97, 116], moof.length + 4);
  let k = moof.length + 8; for (const s of samples) { out.set(s.data, k); k += s.data.length; }
  return out;
}

/* ---------------- Probe: header, tracks, cues ---------------- */
const File = { segData: 0, scale: 1e6, duration: 0, tracks: [], cues: [], firstCluster: 0, seek: {}, doc: '' };
const LANG = (s) => (s && s !== 'und' ? s : '');
function parseTracks(u, p, end) {
  const list = [];
  for (const e of children(u, p, end)) {
    if (e.id !== ID.TrackEntry) continue;
    const t = { num: 0, type: 0, codec: '', priv: null, lang: 'eng', name: '', def: true, forced: false, enabled: true, dur: 0, w: 0, h: 0, rate: 8000, ch: 1, bits: 0, strip: null, enc: false, dv: 0, delay: 0 };
    for (const c of children(u, e.start, e.start + e.size)) {
      const s = c.start, n = c.size;
      switch (c.id) {
        case ID.TrackNumber: t.num = readUint(u, s, n); break;
        case ID.TrackType: t.type = readUint(u, s, n); break;
        case ID.CodecID: t.codec = readStr(u, s, n); break;
        case ID.CodecPrivate: t.priv = u.slice(s, s + n); break;
        case ID.Language: t.lang = readStr(u, s, n); break;
        case ID.LanguageBCP47: t.bcp = readStr(u, s, n); break;
        case ID.Name: t.name = readUtf8(u, s, n); break;
        case ID.FlagDefault: t.def = !!readUint(u, s, n); break;
        case ID.FlagForced: t.forced = !!readUint(u, s, n); break;
        case ID.FlagEnabled: t.enabled = !!readUint(u, s, n); break;
        case ID.DefaultDuration: t.dur = readUint(u, s, n); break;
        case ID.CodecDelay: t.delay = readUint(u, s, n); break;
        case ID.Video: for (const v of children(u, s, s + n)) { const x = readUint(u, v.start, v.size); if (v.id === ID.PixelWidth) t.w = x; else if (v.id === ID.PixelHeight) t.h = x; else if (v.id === ID.DisplayWidth) t.dw = x; else if (v.id === ID.DisplayHeight) t.dh = x; } break;
        case ID.Audio: for (const a of children(u, s, s + n)) { if (a.id === ID.SamplingFrequency) t.rate = readFloat(u, a.start, a.size); else if (a.id === ID.OutputSamplingFrequency) t.orate = readFloat(u, a.start, a.size); else if (a.id === ID.Channels) t.ch = readUint(u, a.start, a.size); else if (a.id === ID.BitDepth) t.bits = readUint(u, a.start, a.size); } break;
        case ID.ContentEncodings:
          for (const ce of children(u, s, s + n)) for (const x of children(u, ce.start, ce.start + ce.size)) {
            if (x.id === ID.ContentEncryption) t.enc = true;
            if (x.id === ID.ContentCompression) {
              let algo = 0, set = null; for (const y of children(u, x.start, x.start + x.size)) { if (y.id === ID.ContentCompAlgo) algo = readUint(u, y.start, y.size); if (y.id === ID.ContentCompSettings) set = u.slice(y.start, y.start + y.size); }
              if (algo === 3) t.strip = set; else t.enc = true; // zlib/bzlib/lzo frames: not supported here
            }
          }
          break;
        case ID.BlockAdditionMapping:
          // Dolby Vision configuration (dvcC/dvvC): profile is the top 7 bits of byte 2
          { let type = 0, extra = null; for (const y of children(u, s, s + n)) { if (y.id === ID.BlockAddIDType) type = readUint(u, y.start, y.size); if (y.id === ID.BlockAddIDExtraData) extra = u.slice(y.start, y.start + y.size); }
            if ((type === 0x64766343 || type === 0x64767643 || type === 0x64766843) && extra && extra.length > 3) t.dv = extra[2] >> 1; }
          break;
        default:
      }
    }
    if (t.bcp && !t.lang) t.lang = t.bcp.split('-')[0];
    list.push(t);
  }
  return list;
}
function parseCues(u, p, end, videoNum) {
  const out = [];
  for (const cp of children(u, p, end)) {
    if (cp.id !== ID.CuePoint) continue;
    let time = -1, pos = -1, track = 0;
    for (const c of children(u, cp.start, cp.start + cp.size)) {
      if (c.id === ID.CueTime) time = readUint(u, c.start, c.size);
      else if (c.id === ID.CueTrackPositions && pos < 0) for (const x of children(u, c.start, c.start + c.size)) { if (x.id === ID.CueTrack) track = readUint(u, x.start, x.size); if (x.id === ID.CueClusterPosition) pos = readUint(u, x.start, x.size); }
    }
    if (time >= 0 && pos >= 0 && (!videoNum || track === videoNum || !track)) out.push({ t: time * File.scale / 1e9, pos: File.segData + pos });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
async function fetchElement(pos, signal) {
  // header first (an element's size isn't known until its header is read), then the rest in one go
  const h = await Net.range(pos, pos + 65535, signal); const u = h.buf;
  const i = readId(u, 0, u.length), s = i && readSize(u, i[1], u.length); if (!s || s[0] === UNKNOWN) return null;
  const hdr = i[1] + s[1], size = s[0];
  if (hdr + size <= u.length) return { id: i[0], u, start: hdr, end: hdr + size };
  if (size > 32 * 1024 * 1024) return null;
  const rest = await Net.range(pos + u.length, pos + hdr + size - 1, signal);
  return { id: i[0], u: cat([u, rest.buf]), start: hdr, end: hdr + size };
}
const VCODEC = { 'V_MPEG4/ISO/AVC': 'avc', 'V_MPEGH/ISO/HEVC': 'hevc', V_AV1: 'av1' };
function audioKind(t) {
  const c = t.codec;
  if (c === 'A_AAC' || c.startsWith('A_AAC/')) return 'aac';
  if (c === 'A_OPUS') return 'opus'; if (c === 'A_FLAC') return 'flac'; if (c === 'A_MPEG/L3') return 'mp3'; if (c === 'A_MPEG/L2') return 'mp2';
  if (c === 'A_AC3' || c === 'A_AC3/BSID9' || c === 'A_AC3/BSID10') return 'ac3'; if (c === 'A_EAC3') return 'eac3';
  if (c.startsWith('A_DTS')) return 'dts'; if (c === 'A_TRUEHD') return 'truehd'; if (c === 'A_MLP') return 'mlp';
  if (c === 'A_VORBIS') return 'vorbis'; if (c === 'A_ALAC') return 'alac';
  if (c === 'A_PCM/INT/LIT') return t.bits === 24 ? 'pcm_s24le' : t.bits === 32 ? 'pcm_s32le' : 'pcm_s16le';
  if (c === 'A_PCM/INT/BIG') return t.bits === 24 ? 'pcm_s24be' : 'pcm_s16be';
  if (c === 'A_PCM/FLOAT/IEEE') return 'pcm_f32le';
  return '';
}
/* codec string the browser is asked about for copying the audio as it is (null: never copied) */
function audioMime(t) {
  switch (t.kind) {
    case 'aac': { const a = t.priv && t.priv.length >= 2 ? ascInfo(t.priv) : null; return `mp4a.40.${a ? a.aot : /SBR/.test(t.codec) ? 5 : 2}`; }
    case 'opus': return 'opus'; case 'flac': return 'flac'; case 'mp3': return 'mp4a.6B';
    case 'ac3': return 'ac-3'; case 'eac3': return 'ec-3';
    default: return null;
  }
}
async function probe(url, headers) {
  Net.url = url; Net.headers = headers || {};
  const first = await Net.range(0, 524287, null, 5000);
  if (first.noRange) throw new Error('the host does not allow byte-range reads');
  Net.size = first.total || 0;
  const u = first.buf, n = u.length;
  if (n < 64) throw new Error('the file is empty');
  if (!(u[0] === 0x1A && u[1] === 0x45 && u[2] === 0xDF && u[3] === 0xA3)) {
    const sig = readStr(u, 4, 4);
    throw Object.assign(new Error(sig === 'ftyp' ? 'MP4 file' : u[0] === 0x47 && u[188] === 0x47 ? 'MPEG-TS file' : readStr(u, 0, 4) === 'RIFF' ? 'AVI file' : 'not an MKV file'), { container: sig === 'ftyp' ? 'mp4' : u[0] === 0x47 ? 'ts' : readStr(u, 0, 4) === 'RIFF' ? 'avi' : 'other' });
  }
  let p = 0;
  const eb = readId(u, 0, n), es = readSize(u, eb[1], n);
  for (const c of children(u, eb[1] + es[1], eb[1] + es[1] + es[0])) if (c.id === ID.DocType) File.doc = readStr(u, c.start, c.size);
  p = eb[1] + es[1] + es[0];
  // skip anything before the Segment (Void, CRC)
  let seg = null;
  while (p < n) { const i = readId(u, p, n), s = readSize(u, p + i[1], n); if (i[0] === ID.Segment) { seg = { start: p + i[1] + s[1], size: s[0] }; break; } p += i[1] + s[1] + s[0]; }
  if (!seg) throw new Error('no Segment');
  File.segData = seg.start;
  let tracksAt = -1, cuesAt = -1, infoAt = -1;
  p = seg.start;
  while (p < n) {
    const i = readId(u, p, n); if (!i) break; const s = readSize(u, p + i[1], n); if (!s) break;
    const d = p + i[1] + s[1], size = s[0];
    if (i[0] === ID.Cluster) { File.firstCluster = p; break; }
    if (size === UNKNOWN) break;
    if (d + size <= n) {
      if (i[0] === ID.SeekHead) for (const sk of children(u, d, d + size)) { let sid = 0, pos = -1; for (const x of children(u, sk.start, sk.start + sk.size)) { if (x.id === ID.SeekID) sid = readUint(u, x.start, x.size); if (x.id === ID.SeekPosition) pos = readUint(u, x.start, x.size); } if (pos >= 0) File.seek[sid] = File.segData + pos; }
      if (i[0] === ID.Info) { infoAt = p; let dur = 0; for (const c of children(u, d, d + size)) { if (c.id === ID.TimecodeScale) File.scale = readUint(u, c.start, c.size); if (c.id === ID.Duration) dur = readFloat(u, c.start, c.size); } File.durRaw = dur; }
      if (i[0] === ID.Tracks) { tracksAt = p; File.tracks = parseTracks(u, d, d + size); }
      if (i[0] === ID.Cues) { cuesAt = p; File.cuesRaw = [u, d, d + size]; }
    }
    p = d + size;
  }
  File.duration = (File.durRaw || 0) * File.scale / 1e9;
  if (tracksAt < 0 && File.seek[ID.Tracks]) { const el = await fetchElement(File.seek[ID.Tracks]); if (el) File.tracks = parseTracks(el.u, el.start, el.end); }
  if (infoAt < 0 && File.seek[ID.Info]) { const el = await fetchElement(File.seek[ID.Info]); if (el) { let dur = 0; for (const c of children(el.u, el.start, el.end)) { if (c.id === ID.TimecodeScale) File.scale = readUint(el.u, c.start, c.size); if (c.id === ID.Duration) dur = readFloat(el.u, c.start, c.size); } File.duration = dur * File.scale / 1e9; } }
  if (!File.tracks.length) throw new Error('no track list in the first 512 KB');
  if (!File.firstCluster) {
    // the clusters start after the 512 KB we have (big attachments): find the first one via the cues or by scanning on
    File.firstCluster = File.seek[ID.Cluster] || 0;
  }
  const v = File.tracks.find((t) => t.type === 1);
  if (cuesAt >= 0) File.cues = parseCues(...File.cuesRaw, v && v.num);
  else if (File.seek[ID.Cues]) {
    try { const el = await fetchElement(File.seek[ID.Cues]); if (el && el.id === ID.Cues) File.cues = parseCues(el.u, el.start, el.end, v && v.num); } catch (e) { File.cues = []; }
  }
  if (!File.firstCluster && File.cues.length) File.firstCluster = File.cues[0].pos;
  if (!File.firstCluster) throw new Error('could not find where the video starts');
  for (const t of File.tracks) {
    if (t.type === 1) t.kind = VCODEC[t.codec] || '';
    if (t.type === 2) { t.kind = audioKind(t); t.mime = audioMime(t); }
  }
  const info = {
    doc: File.doc, duration: File.duration, size: Net.size, cues: File.cues.length,
    video: v ? { num: v.num, codec: v.codec, kind: v.kind, w: v.w, h: v.h, enc: v.enc, dv: v.dv,
      mime: v.kind === 'hevc' ? hevcCodec(v.priv) : v.kind === 'avc' ? avcCodec(v.priv) : v.kind === 'av1' ? av1Codec(v.priv) : null,
      bits: v.kind === 'hevc' ? hevcBitDepth(v.priv) : v.kind === 'av1' && v.priv && v.priv.length > 2 ? ((v.priv[2] >> 6) & 1 ? 10 : 8) : 8 } : null,
    audio: File.tracks.filter((t) => t.type === 2).map((t, i) => ({ i, num: t.num, codec: t.codec, kind: t.kind, mime: t.mime, lang: LANG(t.lang), name: t.name, def: t.def, forced: t.forced, ch: t.ch, rate: t.rate, enc: t.enc })),
    subs: File.tracks.filter((t) => t.type === 17).map((t) => ({ num: t.num, codec: t.codec, lang: LANG(t.lang), name: t.name, def: t.def, forced: t.forced })),
  };
  return info;
}

/* ---------------- Playback state ---------------- */
const St = {
  gen: 0, ctl: null, until: 30, v: null, a: null, aMode: 'none', vInit: false, aInit: false, running: false, eos: false,
  // video: decode-order samples waiting for their decode time
  vq: [], vpts: [], vLast: null, vFrag: [], vFragDur: 0, vBase: null,
  aFrag: [], aBase: null, aNext: null, aFragDur: 0, rescue: null, startT: 0, needKey: true,
};
const post = (m, tr) => self.postMessage({ ...m, gen: St.gen }, tr || []);
const VWIN = 16; // frames of look-ahead for decode timestamps (B-frame reordering depth)
function vTimescale() { return 90000; }

function resetStreams() {
  St.vq = []; St.vpts = []; St.vLast = null; St.vFrag = []; St.vFragDur = 0; St.vBase = null;
  St.aFrag = []; St.aBase = null; St.aNext = null; St.aFragDur = 0; St.needKey = true; St.eos = false;
  if (St.rescue) St.rescue.reset();
}

/* Video: MKV stores presentation times only. Decode times are the presentation times sorted, taken over a look-ahead
   window; the difference becomes the composition offset (signed, trun version 1). */
function pushVideo(data, pts, key) {
  if (St.needKey) { if (!key) return; St.needKey = false; }
  const tr = St.v; if (tr.strip) data = cat([tr.strip, data]);
  const ts = Math.round(pts * 90000);
  St.vq.push({ data, pts: ts, key });
  // keep vpts sorted
  let i = St.vpts.length; St.vpts.push(ts); while (i > 0 && St.vpts[i - 1] > ts) { St.vpts[i] = St.vpts[i - 1]; i--; } St.vpts[i] = ts;
  while (St.vq.length > VWIN) takeVideo();
}
function takeVideo(final) {
  const s = St.vq.shift(); const dts = St.vpts.shift();
  s.dts = dts; s.cts = s.pts - dts;
  if (St.vLast) { St.vLast.dur = Math.max(1, s.dts - St.vLast.dts); addVideoSample(St.vLast); }
  St.vLast = s;
  if (final && St.vLast) { const d = St.v.dur ? Math.round(St.v.dur / 1e9 * 90000) : 3750; St.vLast.dur = d; addVideoSample(St.vLast); St.vLast = null; }
}
function addVideoSample(s) {
  if (St.vBase == null) St.vBase = s.dts;
  St.vFrag.push(s); St.vFragDur += s.dur;
  if (St.vFragDur >= 90000) flushVideo();
}
function flushVideo() {
  if (!St.vFrag.length) return;
  const f = fragment(St.vBase, St.vFrag, true), t0 = St.vBase / 90000, t1 = (St.vBase + St.vFragDur) / 90000;
  St.lastVideoT = t1;
  post({ op: 'frag', kind: 'v', data: f.buffer, t0, t1 }, [f.buffer]);
  St.vBase = null; St.vFrag = []; St.vFragDur = 0;
}

/* Audio copied as is */
function audioSamples(tr, f) {
  switch (tr.kind) {
    case 'aac': return 1024; case 'ac3': return 1536; case 'eac3': return eac3Frames(f).samples || 1536;
    case 'mp3': return mp3Samples(f); case 'opus': return opusSamples(f); case 'flac': return flacSamples(f, 4096);
    default: return 1024;
  }
}
function audioRate(tr) {
  if (tr.kind === 'opus') return 48000;
  if (tr.kind === 'aac' && tr.priv && tr.priv.length >= 2) return ascInfo(tr.priv).rate;
  return Math.round(tr.rate) || 48000;
}
function audioInit(tr, first) {
  const rate = audioRate(tr), ch = tr.ch || 2;
  let entry, mime;
  switch (tr.kind) {
    case 'aac': { const asc = tr.priv && tr.priv.length >= 2 ? tr.priv : makeAsc(/SBR/.test(tr.codec) ? 5 : 2, rate, ch); entry = audioEntry('mp4a', ch, rate, esDesc(0x40, asc)); mime = `audio/mp4; codecs="mp4a.40.${ascInfo(asc).aot}"`; break; }
    case 'mp3': entry = audioEntry('mp4a', ch, rate, esDesc(0x6B, null)); mime = 'audio/mp4; codecs="mp4a.6B"'; break;
    case 'opus': entry = audioEntry('Opus', ch, 48000, dOps(tr.priv, ch)); mime = 'audio/mp4; codecs="opus"'; break;
    case 'flac': { const blocks = tr.priv && tr.priv.length > 4 && readStr(tr.priv, 0, 4) === 'fLaC' ? tr.priv.subarray(4) : tr.priv; entry = audioEntry('fLaC', ch, rate, full('dfLa', 0, 0, blocks)); mime = 'audio/mp4; codecs="flac"'; break; }
    case 'ac3': entry = audioEntry('ac-3', ch, rate, dac3(first)); mime = 'audio/mp4; codecs="ac-3"'; break;
    case 'eac3': entry = audioEntry('ec-3', ch, rate, dec3(first, rate)); mime = 'audio/mp4; codecs="ec-3"'; break;
    default: throw new Error(`can't copy ${tr.codec}`);
  }
  return { data: initSegment(tr, entry, rate, false), mime, rate };
}
function pushAudioCopy(data, pts) {
  const tr = St.a;
  if (tr.strip) data = cat([tr.strip, data]);
  if (!St.aInit) {
    const init = audioInit(tr, data); St.aRate = init.rate; St.aInit = true;
    post({ op: 'init', kind: 'a', mime: init.mime, data: init.data.buffer }, [init.data.buffer]);
  }
  const rate = St.aRate, at = Math.round(pts * rate);
  // follow the file's clock, but keep exact frame lengths unless the gap is real (> 40 ms)
  if (St.aNext == null || Math.abs(at - St.aNext) > rate * 0.04) { flushAudio(); St.aNext = at; }
  if (St.aBase == null) St.aBase = St.aNext;
  const dur = audioSamples(tr, data);
  St.aFrag.push({ data, dur }); St.aFragDur += dur; St.aNext += dur;
  if (St.aFragDur >= rate) flushAudio();
}
function flushAudio() {
  if (!St.aFrag.length) return;
  const rate = St.aRate, f = fragment(St.aBase, St.aFrag, false);
  post({ op: 'frag', kind: 'a', data: f.buffer, t0: St.aBase / rate, t1: (St.aBase + St.aFragDur) / rate }, [f.buffer]);
  St.aBase = null; St.aFrag = []; St.aFragDur = 0;
}

/* ---------------- Audio rescue: decode with FFmpeg (WebAssembly), resample to 48 kHz stereo, encode AAC-LC ----------------
   DTS and TrueHD decoding is the most legally sensitive part of the engine, so the decoders live in their own file
   (engine/audio/) that can be removed or switched off without touching anything else: the engine then plays the
   picture and says that the sound needs another player. */
let LibAVP = null;
function loadLibAV() {
  if (LibAVP) return LibAVP;
  LibAVP = (async () => {
    const base = new URL('audio/', self.location.href).href.replace(/\/$/, '');
    const wasmurl = `${base}/libav-6.10.9.0-mkc-audio.wasm.wasm`;
    self.LibAV = { base, wasmurl, nolibavworker: true };
    importScripts(`${base}/libav-6.10.9.0-mkc-audio.js`);
    return self.LibAV.LibAV({ noworker: true, nothreads: true, nosimd: true, base, wasmurl });
  })();
  LibAVP.catch(() => { LibAVP = null; });
  return LibAVP;
}
class Rescue {
  constructor(tr) { this.tr = tr; this.la = null; this.dec = null; this.q = Promise.resolve(); this.tok = 0; }
  async open() {
    const la = this.la = await loadLibAV(), tr = this.tr;
    const cp = await la.avcodec_parameters_alloc();
    await la.AVCodecParameters_codec_type_s(cp, la.AVMEDIA_TYPE_AUDIO);
    await la.AVCodecParameters_sample_rate_s(cp, Math.round(tr.rate) || 48000);
    await la.AVCodecParameters_channels_s(cp, tr.ch || 2);
    await la.AVCodecParameters_ch_layout_nb_channels_s(cp, tr.ch || 2);
    if (tr.bits && la.AVCodecParameters_bits_per_coded_sample_s) await la.AVCodecParameters_bits_per_coded_sample_s(cp, tr.bits);
    if (tr.priv && tr.priv.length) {
      const ptr = await la.malloc(tr.priv.length + 64); await la.copyin_u8(ptr, cat([tr.priv, new Uint8Array(64)]));
      await la.AVCodecParameters_extradata_s(cp, ptr); await la.AVCodecParameters_extradata_size_s(cp, tr.priv.length);
    }
    const name = { dts: 'dca', opus: 'opus', vorbis: 'vorbis', mp2: 'mp2', mp3: 'mp3' }[tr.kind] || tr.kind;
    const [, c, pkt, frame] = await la.ff_init_decoder(name, { codecpar: cp });
    this.dec = { c, pkt, frame };
    const [, ec, efr, epkt, fsize] = await la.ff_init_encoder('aac', { ctx: { bit_rate: 192000, sample_fmt: la.AV_SAMPLE_FMT_FLTP, sample_rate: 48000, channel_layout: 3, channels: 2 }, time_base: [1, 48000] });
    this.enc = { c: ec, frame: efr, pkt: epkt, fsize };
    this.graph = null; this.n = 0; this.start = null;
  }
  async filterFor(f) {
    const key = `${f.format}/${f.sample_rate}/${f.channel_layout}/${f.channels}`;
    if (this.graph && this.graph.key === key) return this.graph;
    if (this.graph) { try { await this.la.avfilter_graph_free_js(this.graph.g); } catch (e) { /* older build */ } }
    const layout = f.channel_layout || ({ 1: 4, 2: 3, 6: 0x3F, 8: 0x63F }[f.channels] || 3);
    const [g, src, sink] = await this.la.ff_init_filter_graph('aresample=48000', { sample_rate: f.sample_rate, sample_fmt: f.format, channel_layout: layout }, { sample_rate: 48000, sample_fmt: this.la.AV_SAMPLE_FMT_FLTP, channel_layout: 3, frame_size: this.enc.fsize });
    this.graph = { key, g, src, sink }; return this.graph;
  }
  reset() { this.tok++; this.start = null; this.n = 0; this.k = 0; this.pending = []; this.flushNext = true; }
  /* packets are queued so the async decoder never runs twice at once */
  push(data, pts) {
    const tok = this.tok, gen = St.gen;
    (this.pending = this.pending || []).push({ data, pts });
    if (this.pending.length < 24) return;
    const batch = this.pending; this.pending = [];
    this.q = this.q.then(() => this.run(batch, tok, gen, false)).catch((e) => { post({ op: 'note', msg: `Sound conversion stopped: ${e.message || e}` }); });
  }
  end() { const batch = this.pending || []; this.pending = []; const tok = this.tok, gen = St.gen; this.q = this.q.then(() => this.run(batch, tok, gen, true)); return this.q; }
  async run(batch, tok, gen, fin) {
    if (tok !== this.tok || gen !== St.gen) return;
    const la = this.la;
    if (this.flushNext) {
      // after a seek: fresh decoder state, so no sound from the old spot leaks in
      this.flushNext = false;
      try { await la.avcodec_flush_buffers(this.dec.c); } catch (e) { /* ignore */ }
      if (this.graph) { try { await la.avfilter_graph_free_js(this.graph.g); } catch (e) { /* ignore */ } this.graph = null; }
      try { await la.ff_free_encoder(this.enc.c, this.enc.frame, this.enc.pkt); } catch (e) { /* ignore */ }
      const [, ec, efr, epkt, fsize] = await la.ff_init_encoder('aac', { ctx: { bit_rate: 192000, sample_fmt: la.AV_SAMPLE_FMT_FLTP, sample_rate: 48000, channel_layout: 3, channels: 2 }, time_base: [1, 48000] });
      this.enc = { c: ec, frame: efr, pkt: epkt, fsize };
    }
    if (this.start == null && batch.length) this.start = Math.round(batch[0].pts * 48000);
    const frames = await la.ff_decode_multi(this.dec.c, this.dec.pkt, this.dec.frame, batch.map((b) => ({ data: b.data })), { fin: false, ignoreErrors: true });
    if (tok !== this.tok || gen !== St.gen) return;
    let out = [];
    if (frames.length) { const g = await this.filterFor(frames[0]); out = await la.ff_filter_multi(g.src, g.sink, this.dec.frame, frames, false); }
    else if (fin && this.graph) out = await la.ff_filter_multi(this.graph.src, this.graph.sink, this.dec.frame, [], true);
    for (const f of out) { f.pts = this.n; f.ptshi = 0; this.n += f.nb_samples; }
    const pk = await la.ff_encode_multi(this.enc.c, this.enc.frame, this.enc.pkt, out, fin);
    if (tok !== this.tok || gen !== St.gen) return;
    if (!St.aInit) {
      const entry = audioEntry('mp4a', 2, 48000, esDesc(0x40, new Uint8Array([0x11, 0x90])));
      const init = initSegment({}, entry, 48000, false); St.aInit = true; St.aRate = 48000;
      post({ op: 'init', kind: 'a', mime: 'audio/mp4; codecs="mp4a.40.2"', data: init.buffer }, [init.buffer]);
    }
    const samples = [];
    let base = null;
    // the AAC encoder's first packet is its 1024-sample priming, so packet k starts at (k - 1) * 1024
    for (const p of pk) {
      const t = this.start + (this.k++ - 1) * 1024; if (t < 0) continue;
      if (base == null) base = t; samples.push({ data: p.data, dur: 1024 });
    }
    if (samples.length) {
      const f = fragment(base, samples, false);
      post({ op: 'frag', kind: 'a', data: f.buffer, t0: base / 48000, t1: (base + samples.length * 1024) / 48000 }, [f.buffer]);
    }
  }
}

/* ---------------- Cluster reader ---------------- */
async function seekPos(t) {
  if (File.cues.length) { let c = File.cues[0]; for (const x of File.cues) { if (x.t <= t + 0.001) c = x; else break; } return { pos: c.pos, t: c.t }; }
  if (t <= 0.5 || !Net.size || !File.duration) return { pos: File.firstCluster, t: 0 };
  // no Cues: guess by bytes and narrow it down by reading cluster timestamps (at most 8 probes)
  let lo = File.firstCluster, hi = Net.size, best = { pos: File.firstCluster, t: 0 };
  for (let k = 0; k < 8 && hi - lo > 1 << 20; k++) {
    const guess = Math.round(lo + (hi - lo) * Math.min(0.95, Math.max(0.05, (t - best.t) / Math.max(1, File.duration - best.t))));
    const c = await findCluster(guess); if (!c) { hi = guess; continue; }
    if (c.t <= t) { best = c; lo = c.pos + 1; } else hi = c.pos;
  }
  return best;
}
async function findCluster(at) {
  const r = await Net.range(at, at + 262143, St.ctl && St.ctl.signal); const u = r.buf;
  for (let i = 0; i + 12 < u.length; i++) {
    if (u[i] !== 0x1F || u[i + 1] !== 0x43 || u[i + 2] !== 0xB6 || u[i + 3] !== 0x75) continue;
    try {
      const s = readSize(u, i + 4, u.length); if (!s) continue; const d = i + 4 + s[1];
      const e = readId(u, d, u.length); if (!e || e[0] !== ID.Timecode) continue;
      const z = readSize(u, d + 1, u.length); const tc = readUint(u, d + 1 + z[1], z[0]);
      return { pos: at + i, t: tc * File.scale / 1e9 };
    } catch (err) { /* not a real cluster */ }
  }
  return null;
}
function parseBlock(u, p, end, clusterTc, key) {
  const tn = readSize(u, p, end); const num = tn[0]; let q = p + tn[1];
  const rel = (u[q] << 8 | u[q + 1]) << 16 >> 16; const flags = u[q + 2]; q += 3;
  const isV = St.v && num === St.v.num, isA = St.a && num === St.a.num;
  if (!isV && !isA) return;
  const pts = (clusterTc + rel) * File.scale / 1e9, kf = key == null ? !!(flags & 0x80) : key;
  const lacing = (flags >> 1) & 3;
  if (!lacing) { const data = u.slice(q, end); if (isV) pushVideo(data, pts, kf); else onAudio(data, pts); return; }
  // laced frames (common for audio): Xiph, fixed-size or EBML lacing
  const count = u[q++] + 1; const sizes = [];
  if (lacing === 1) { for (let i = 0; i < count - 1; i++) { let s = 0, b; do { b = u[q++]; s += b; } while (b === 255); sizes.push(s); } }
  else if (lacing === 3) {
    let s = readSize(u, q, end); q += s[1]; sizes.push(s[0]); let prev = s[0];
    for (let i = 1; i < count - 1; i++) { const r = readSize(u, q, end); const bias = (2 ** (7 * r[1] - 1)) - 1; prev += r[0] - bias; q += r[1]; sizes.push(prev); }
  } else { const each = Math.floor((end - q) / count); for (let i = 0; i < count - 1; i++) sizes.push(each); }
  sizes.push(end - q - sizes.reduce((a, b) => a + b, 0));
  let tt = pts;
  for (const s of sizes) {
    const data = u.slice(q, q + s); q += s;
    if (isV) pushVideo(data, tt, kf); else { onAudio(data, tt); tt += St.a.kind === 'opus' ? opusSamples(data) / 48000 : audioSamples(St.a, data) / audioRate(St.a); }
  }
}
function onAudio(data, pts) {
  if (St.aMode === 'copy') pushAudioCopy(data, pts);
  else if (St.aMode === 'aac' && St.rescue) St.rescue.push(St.a.strip ? cat([St.a.strip, data]) : data, pts);
}

/* Streaming loop: one open-ended Range request from the chosen cluster, paused while enough is buffered */
async function run(pos, gen) {
  let buf = new Uint8Array(0), base = pos, p = 0, clusterTc = 0, clusterEnd = -1, retries = 0;
  const want = () => St.lastVideoT == null || St.lastVideoT < St.until;
  while (gen === St.gen) {
    let reader = null;
    try {
      const ctl = St.ctl;
      const r = await fetch(Net.url, { headers: { ...Net.headers, Range: `bytes=${base + buf.length}-` }, signal: ctl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (r.status !== 206 && r.status !== 200) throw new Error(`the host answered ${r.status}`);
      if (r.status === 200 && base + buf.length > 0) throw new Error('the host stopped allowing byte ranges');
      reader = r.body.getReader();
      for (;;) {
        while (!want() && gen === St.gen) await new Promise((res) => { St.wake = res; setTimeout(res, 1000); });
        if (gen !== St.gen) return;
        const { value, done } = await reader.read();
        if (gen !== St.gen) return;
        if (done) { await finish(gen); return; }
        retries = 0;
        // append, dropping what was already parsed
        const keep = buf.subarray(p); const nb = new Uint8Array(keep.length + value.length); nb.set(keep); nb.set(value, keep.length);
        base += p; buf = nb; p = 0; if (clusterEnd >= 0) clusterEnd -= 0;
        // parse every complete element
        for (;;) {
          const i = readId(buf, p, buf.length); if (!i) break; const s = readSize(buf, p + i[1], buf.length); if (!s) break;
          const id = i[0], hdr = i[1] + s[1], size = s[0], abs = base + p;
          if (id === ID.Cluster) { clusterEnd = size === UNKNOWN ? Infinity : abs + hdr + size; p += hdr; continue; }
          if (id === ID.Segment) { p += hdr; continue; }
          if (TOP.has(id) || id === ID.Cues || abs >= clusterEnd) {
            // level-1 element outside a cluster: skip it (needs its size)
            if (size === UNKNOWN) throw new Error('unknown-size element outside a cluster');
            if (id === ID.Cluster) continue;
            if (p + hdr + size > buf.length) { if (size > 64 << 20) throw new Error('oversized element'); break; }
            p += hdr + size; continue;
          }
          if (size === UNKNOWN) throw new Error('unknown-size element in a cluster');
          if (p + hdr + size > buf.length) break;
          const d = p + hdr;
          if (id === ID.Timecode) clusterTc = readUint(buf, d, size);
          else if (id === ID.SimpleBlock) parseBlock(buf, d, d + size, clusterTc, null);
          else if (id === ID.BlockGroup) {
            let blk = null, ref = false;
            for (const c of children(buf, d, d + size)) { if (c.id === ID.Block) blk = c; if (c.id === ID.ReferenceBlock) ref = true; }
            if (blk) parseBlock(buf, blk.start, blk.start + blk.size, clusterTc, !ref);
          }
          p = d + size;
        }
      }
    } catch (e) {
      if (gen !== St.gen) return;
      try { if (reader) reader.cancel(); } catch (x) { /* ignore */ }
      if (++retries > 4) { post({ op: 'error', reason: e.message || String(e) }); return; }
      await new Promise((res) => setTimeout(res, 500 * 2 ** retries));
    }
  }
}
async function finish(gen) {
  while (St.vq.length) takeVideo(St.vq.length === 1);
  if (St.vLast) takeVideo(true);
  flushVideo(); flushAudio();
  if (St.rescue) await St.rescue.end();
  if (gen === St.gen) post({ op: 'eos' });
}

async function start(t, gen) {
  if (St.ctl) St.ctl.abort();
  St.ctl = new AbortController(); St.gen = gen; resetStreams(); St.lastVideoT = null;
  const at = await seekPos(t);
  if (gen !== St.gen) return;
  St.startT = at.t;
  run(at.pos, gen);
}

self.onmessage = async (e) => {
  const m = e.data || {};
  try {
    if (m.op === 'open') {
      try { const info = await probe(m.url, m.headers); post({ op: 'info', info }); }
      catch (err) { post({ op: 'fail', reason: err.message || String(err), container: err.container || '' }); }
    } else if (m.op === 'start' || m.op === 'seek' || m.op === 'audio') {
      St.gen = m.gen; if (St.ctl) St.ctl.abort();
      if (m.op !== 'seek') {
        St.v = File.tracks.find((x) => x.type === 1) || null;
        St.a = m.audio == null || m.audio < 0 ? null : File.tracks.filter((x) => x.type === 2)[m.audio] || null;
        St.aMode = St.a ? m.mode : 'none'; St.aInit = false;
        if (St.v && !St.vInit) {
          const init = initSegment(St.v, videoEntry(St.v), 90000, true); St.vInit = true;
          post({ op: 'init', kind: 'v', mime: `video/mp4; codecs="${m.vmime}"`, data: init.buffer }, [init.buffer]);
        }
        St.rescue = null;
        if (St.aMode === 'aac') {
          const r = new Rescue(St.a);
          try { await r.open(); St.rescue = r; r.reset(); }
          catch (err) { St.aMode = 'none'; post({ op: 'note', msg: `This film’s sound (${St.a.codec.replace(/^A_/, '')}) couldn’t be converted here: ${err.message || err}`, audioFail: true }); }
        }
      }
      St.until = m.until || (m.t + 30);
      await start(m.t || 0, m.gen);
    } else if (m.op === 'until') { St.until = m.t; if (St.wake) St.wake(); }
    else if (m.op === 'close') { St.gen++; if (St.ctl) St.ctl.abort(); self.close(); }
  } catch (err) { post({ op: 'error', reason: err.message || String(err) }); }
};
