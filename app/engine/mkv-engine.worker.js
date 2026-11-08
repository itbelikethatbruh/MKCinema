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
function videoEntry(tr, dv) {
  // dv: real Dolby Vision (dvh1 + its dvcC/dvvC box) for devices that decode it, else the HDR10/SDR base layer as hvc1
  const type = dv && tr.kind === 'hevc' && tr.dvc ? 'dvh1' : tr.kind === 'hevc' ? 'hvc1' : tr.kind === 'av1' ? 'av01' : 'avc1', cfg = tr.kind === 'hevc' ? 'hvcC' : tr.kind === 'av1' ? 'av1C' : 'avcC';
  const name = new Array(32).fill(0);
  const parts = [new Array(6).fill(0), u16(1), u16(0), u16(0), new Array(12).fill(0), u16(tr.w), u16(tr.h), u32(0x480000), u32(0x480000), u32(0), u16(1), name, u16(0x18), u16(0xFFFF), box(cfg, tr.priv)];
  if (type === 'dvh1') parts.push(box(tr.dv > 7 ? 'dvvC' : 'dvcC', tr.dvc));
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
              if (algo === 3) t.strip = set; else if (algo === 0) t.zlib = true; else t.enc = true; // zlib: image subtitles only (inflated on the page); bzlib/lzo: not supported
            }
          }
          break;
        case ID.BlockAdditionMapping:
          // Dolby Vision configuration (dvcC/dvvC): profile is the top 7 bits of byte 2
          { let type = 0, extra = null; for (const y of children(u, s, s + n)) { if (y.id === ID.BlockAddIDType) type = readUint(u, y.start, y.size); if (y.id === ID.BlockAddIDExtraData) extra = u.slice(y.start, y.start + y.size); }
            if ((type === 0x64766343 || type === 0x64767643 || type === 0x64766843) && extra && extra.length > 3) { t.dv = extra[2] >> 1; t.dvc = extra; } }
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
  if (t.noCopy) return null; // AAC with its channel layout inside the stream (PCE): browsers can't play it, so it's converted
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
  if (readStr(u, 4, 4) === 'ftyp' || readStr(u, 4, 4) === 'moov' || readStr(u, 4, 4) === 'mdat' || readStr(u, 4, 4) === 'wide') { await probeMp4(first); return describeFile(); }
  if (!(u[0] === 0x1A && u[1] === 0x45 && u[2] === 0xDF && u[3] === 0xA3)) { const sync = tsSync(u); if (sync) { await probeTs(first, sync); return describeFile(); } }
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
  return describeFile();
}
function describeFile() {
  const v = File.tracks.find((t) => t.type === 1);
  for (const t of File.tracks) {
    if (t.type === 1) t.kind = VCODEC[t.codec] || '';
    if (t.type === 2) { t.kind = audioKind(t); t.mime = audioMime(t); }
  }
  const info = {
    doc: File.doc, duration: File.duration, size: Net.size, cues: Mp4.on || Ts.on ? 1 : File.cues.length,
    video: v ? { num: v.num, codec: v.codec, kind: v.kind, w: v.w, h: v.h, enc: v.enc || !!v.zlib, dv: v.dv,
      mime: v.kind === 'hevc' ? hevcCodec(v.priv) : v.kind === 'avc' ? avcCodec(v.priv) : v.kind === 'av1' ? av1Codec(v.priv) : null,
      dvMime: v.dvc ? `dvh1.${String(v.dv).padStart(2, '0')}.${String(((v.dvc[2] & 1) << 5) | (v.dvc[3] >> 3)).padStart(2, '0')}` : null,
      bits: v.kind === 'hevc' ? hevcBitDepth(v.priv) : v.kind === 'av1' && v.priv && v.priv.length > 2 ? ((v.priv[2] >> 6) & 1 ? 10 : 8) : 8 } : null,
    audio: File.tracks.filter((t) => t.type === 2).map((t, i) => ({ i, num: t.num, codec: t.codec, kind: t.kind, mime: t.mime, lang: LANG(t.lang), name: t.name, def: t.def, forced: t.forced, ch: t.ch, rate: t.rate, enc: t.enc || !!t.zlib })),
    subs: File.tracks.filter((t) => t.type === 17).map((t) => ({ num: t.num, codec: t.codec, zlib: !!t.zlib, enc: !!t.enc, lang: LANG(t.lang), name: t.name, def: t.def, forced: t.forced })),
  };
  return info;
}

/* ---------------- MP4 reader ----------------
   Plain (non-fragmented) MP4 and MOV files: the sample tables in moov say where every frame sits, so the reader
   streams the file in byte order and hands each frame to the same video/audio paths the MKV reader uses. */
const Mp4 = { on: false, ts: 1000 };
function* mboxes(u, p, end) {
  while (p + 8 <= end) {
    let size = readUint(u, p, 4); const type = readStr(u, p + 4, 4); let hdr = 8;
    if (size === 1) { if (p + 16 > end) return; size = readUint(u, p + 8, 8); hdr = 16; } else if (size === 0) size = end - p;
    if (size < hdr) return;
    yield { type, start: p + hdr, end: Math.min(end, p + size), at: p };
    p += size;
  }
}
const mfind = (u, p, end, type) => { for (const b of mboxes(u, p, end)) if (b.type === type) return b; return null; };
const mpath = (u, b, ...types) => { for (const t of types) { if (!b) return null; b = mfind(u, b.start, b.end, t); } return b; };
function mlang(n) { return n ? String.fromCharCode(((n >> 10) & 31) + 0x60, ((n >> 5) & 31) + 0x60, (n & 31) + 0x60) : ''; }
/* the AudioSpecificConfig inside an esds descriptor chain */
function esdsInfo(u, p, end) {
  let oti = 0, asc = null; p += 4;
  const len = () => { let n = 0; for (let i = 0; i < 4; i++) { const b = u[p++]; n = (n << 7) | (b & 127); if (!(b & 128)) break; } return n; };
  while (p < end) {
    const tag = u[p++], n = len();
    if (tag === 3) { const fl = u[p + 2]; p += 3; if (fl & 0x80) p += 2; if (fl & 0x40) p += 1 + u[p]; if (fl & 0x20) p += 2; continue; }
    if (tag === 4) { oti = u[p]; p += 13; continue; }
    if (tag === 5) { asc = u.slice(p, p + n); break; }
    p += n;
  }
  return { oti, asc };
}
function mp4Track(u, trak, movieTs) {
  const tkhd = mfind(u, trak.start, trak.end, 'tkhd'); if (!tkhd) return null;
  const tv = u[tkhd.start];
  const t = { num: readUint(u, tkhd.start + (tv ? 20 : 12), 4), type: 0, codec: '', priv: null, lang: '', name: '', def: true, forced: false, enabled: !!(u[tkhd.start + 3] & 1), dur: 0, w: 0, h: 0, rate: 48000, ch: 2, bits: 0, strip: null, enc: false, dv: 0, delay: 0 };
  const mdia = mfind(u, trak.start, trak.end, 'mdia'); if (!mdia) return null;
  const mdhd = mfind(u, mdia.start, mdia.end, 'mdhd'), hdlr = mfind(u, mdia.start, mdia.end, 'hdlr');
  if (!mdhd || !hdlr) return null;
  const mv = u[mdhd.start];
  t.ts = readUint(u, mdhd.start + (mv ? 20 : 12), 4) || 1000;
  t.lang = mlang(readUint(u, mdhd.start + (mv ? 32 : 20), 2));
  const handler = readStr(u, hdlr.start + 8, 4);
  t.type = handler === 'vide' ? 1 : handler === 'soun' ? 2 : 0;
  const stbl = mpath(u, mdia, 'minf', 'stbl'); if (!stbl) return null;
  const stsd = mfind(u, stbl.start, stbl.end, 'stsd'); if (!stsd) return null;
  const ent = mboxes(u, stsd.start + 8, stsd.end).next().value; if (!ent) return null;
  t.tag = ent.type;
  if (t.type === 1) {
    t.w = readUint(u, ent.start + 24, 2); t.h = readUint(u, ent.start + 26, 2);
    for (const c of mboxes(u, ent.start + 78, ent.end)) {
      if (c.type === 'avcC' || c.type === 'hvcC' || c.type === 'av1C') t.priv = u.slice(c.start, c.end);
      if ((c.type === 'dvcC' || c.type === 'dvvC' || c.type === 'dvwC') && c.end - c.start > 3) { t.dvc = u.slice(c.start, c.end); t.dv = t.dvc[2] >> 1; }
      if (c.type === 'pasp') { const hs = readUint(u, c.start, 4), vs = readUint(u, c.start + 4, 4); if (hs && vs && hs !== vs) { t.dw = Math.round(t.w * hs / vs); t.dh = t.h; } }
      if (c.type === 'sinf') t.enc = true;
    }
    t.codec = { avc1: 'V_MPEG4/ISO/AVC', avc3: 'V_MPEG4/ISO/AVC', hvc1: 'V_MPEGH/ISO/HEVC', hev1: 'V_MPEGH/ISO/HEVC', dvh1: 'V_MPEGH/ISO/HEVC', dvhe: 'V_MPEGH/ISO/HEVC', av01: 'V_AV1' }[ent.type] || (ent.type === 'encv' ? 'encrypted' : ent.type);
    if (ent.type === 'encv') t.enc = true;
  } else if (t.type === 2) {
    const ver = readUint(u, ent.start + 8, 2);
    t.ch = readUint(u, ent.start + 16, 2) || 2; t.bits = readUint(u, ent.start + 18, 2); t.rate = readUint(u, ent.start + 24, 2) || 48000;
    let kids = ent.start + 28 + (ver === 1 ? 16 : ver === 2 ? 36 : 0);
    if (ver === 2) { const dv = new DataView(u.buffer, u.byteOffset + ent.start + 32, 12); t.rate = Math.round(dv.getFloat64(0)) || t.rate; t.ch = dv.getUint32(8) || t.ch; }
    const cfg = {};
    const scan = (p, end) => { for (const c of mboxes(u, p, end)) { cfg[c.type] = c; if (c.type === 'wave') scan(c.start, c.end); } };
    scan(kids, ent.end);
    const tag = ent.type;
    if (tag === 'enca' || cfg.sinf) t.enc = true;
    if (tag === 'mp4a' && cfg.esds) {
      const e = esdsInfo(u, cfg.esds.start, cfg.esds.end);
      if (e.oti === 0x40 || (e.oti >= 0x66 && e.oti <= 0x68)) { t.codec = 'A_AAC'; t.priv = e.asc; if (e.asc) { const a = ascInfo(e.asc); if (a) { t.rate = a.rate; if (a.ch) t.ch = a.ch === 7 ? 8 : a.ch; } } }
      else if (e.oti === 0x6B || e.oti === 0x69) t.codec = e.oti === 0x6B ? 'A_MPEG/L3' : 'A_MPEG/L2';
      else if (e.oti === 0xA5) t.codec = 'A_AC3'; else if (e.oti === 0xA6) t.codec = 'A_EAC3'; else if (e.oti === 0xA9) t.codec = 'A_DTS';
    } else if (tag === '.mp3') t.codec = 'A_MPEG/L3';
    else if (tag === 'ac-3') { t.codec = 'A_AC3'; if (cfg.dac3) { const b = u[cfg.dac3.start + 1], acmod = (b >> 3) & 7, lfe = (b >> 2) & 1; t.ch = [2, 1, 2, 3, 3, 4, 4, 5][acmod] + lfe; } }
    else if (tag === 'ec-3') { t.codec = 'A_EAC3'; if (cfg.dec3) { const p = cfg.dec3.start + 2, acmod = (u[p + 1] >> 1) & 7, lfe = u[p + 1] & 1; t.ch = [2, 1, 2, 3, 3, 4, 4, 5][acmod] + lfe; } }
    else if (tag === 'Opus' && cfg.dOps) {
      t.codec = 'A_OPUS'; const d = u.subarray(cfg.dOps.start, cfg.dOps.end), dv = new DataView(d.buffer, d.byteOffset, d.length);
      const head = [...'OpusHead'].map((c) => c.charCodeAt(0)); const le16 = (n) => [n & 255, (n >> 8) & 255], le32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
      t.priv = Uint8Array.from([...head, 1, d[1], ...le16(dv.getUint16(2)), ...le32(dv.getUint32(4)), ...le16(dv.getInt16(8) & 0xFFFF), d[10], ...(d[10] ? d.subarray(11) : [])]); t.ch = d[1]; t.rate = 48000;
    } else if (tag === 'fLaC' && cfg.dfLa) { t.codec = 'A_FLAC'; t.priv = cat([[0x66, 0x4C, 0x61, 0x43], u.subarray(cfg.dfLa.start + 4, cfg.dfLa.end)]); }
    else if (/^dts[chlex]$/.test(tag)) t.codec = 'A_DTS';
    else if (tag === 'mlpa') t.codec = 'A_TRUEHD';
    else if (tag === 'alac' && cfg.alac) { t.codec = 'A_ALAC'; t.priv = u.slice(cfg.alac.start + 4, cfg.alac.end); }
    else if (tag === 'sowt' || tag === 'twos' || tag === 'lpcm' || tag === 'in24') { t.codec = tag === 'sowt' ? 'A_PCM/INT/LIT' : 'A_PCM/INT/BIG'; if (tag === 'in24') t.bits = 24; }
    else t.codec = tag;
  } else return null;
  // sample tables stay as raw boxes until the track is played
  t.stbl = {};
  for (const c of mboxes(u, stbl.start, stbl.end)) t.stbl[c.type] = u.subarray(c.start, c.end);
  // edit list: an empty first edit delays the track, a media start skips its first frames (B-frame delay)
  t.shift = 0; t.delay = 0;
  const elst = mpath(u, trak, 'edts', 'elst');
  if (elst) {
    const v = u[elst.start], n = readUint(u, elst.start + 4, 4); let p = elst.start + 8;
    for (let i = 0; i < n; i++) {
      const dur = readUint(u, p, v ? 8 : 4), mt = v ? Number(new DataView(u.buffer, u.byteOffset + p + 8, 8).getBigInt64(0)) : new DataView(u.buffer, u.byteOffset + p + 4, 4).getInt32(0);
      p += v ? 20 : 12;
      if (mt === -1) { t.delay += dur / movieTs; continue; }
      t.shift = mt; break;
    }
  }
  return t;
}
/* the full sample table of one track: byte offset, size, decode time, composition offset, keyframe */
function mp4Samples(t) {
  if (t.S) return t.S;
  const b = t.stbl, rd = (x, p) => (x[p] << 24 | x[p + 1] << 16 | x[p + 2] << 8 | x[p + 3]) >>> 0;
  let n = 0, sizes, fixed = 0;
  if (b.stsz) { fixed = rd(b.stsz, 4); n = rd(b.stsz, 8); if (!fixed) { sizes = new Uint32Array(n); for (let i = 0; i < n; i++) sizes[i] = rd(b.stsz, 12 + i * 4); } }
  else if (b.stz2) {
    const fs = b.stz2[7]; n = rd(b.stz2, 8); sizes = new Uint32Array(n);
    for (let i = 0; i < n; i++) sizes[i] = fs === 16 ? (b.stz2[12 + i * 2] << 8 | b.stz2[13 + i * 2]) : fs === 8 ? b.stz2[12 + i] : (b.stz2[12 + (i >> 1)] >> (i & 1 ? 0 : 4)) & 15;
  } else throw new Error('the MP4 has no sample sizes');
  const size = sizes || new Uint32Array(n).fill(fixed);
  // chunk offsets
  let chunks;
  if (b.stco) { const c = rd(b.stco, 4); chunks = new Float64Array(c); for (let i = 0; i < c; i++) chunks[i] = rd(b.stco, 8 + i * 4); }
  else if (b.co64) { const c = rd(b.co64, 4); chunks = new Float64Array(c); for (let i = 0; i < c; i++) chunks[i] = rd(b.co64, 8 + i * 8) * 4294967296 + rd(b.co64, 12 + i * 8); }
  else throw new Error('the MP4 has no chunk offsets');
  const off = new Float64Array(n);
  { const sc = b.stsc, e = sc ? rd(sc, 4) : 0; let s = 0;
    for (let k = 0; k < e; k++) {
      const first = rd(sc, 8 + k * 12) - 1, per = rd(sc, 12 + k * 12), last = k + 1 < e ? rd(sc, 8 + (k + 1) * 12) - 1 : chunks.length;
      for (let c = first; c < last && s < n; c++) { let o = chunks[c]; for (let j = 0; j < per && s < n; j++) { off[s] = o; o += size[s]; s++; } }
    }
    if (s < n) n = s; }
  const dts = new Float64Array(n);
  { const st = b.stts, e = st ? rd(st, 4) : 0; let s = 0, d = 0;
    for (let k = 0; k < e && s < n; k++) { const cnt = rd(st, 8 + k * 8), delta = rd(st, 12 + k * 8); for (let j = 0; j < cnt && s < n; j++) { dts[s++] = d; d += delta; } }
    while (s < n) dts[s++] = d; }
  const cto = new Int32Array(n);
  if (b.ctts) { const e = rd(b.ctts, 4); let s = 0; for (let k = 0; k < e && s < n; k++) { const cnt = rd(b.ctts, 8 + k * 8), o = rd(b.ctts, 12 + k * 8) | 0; for (let j = 0; j < cnt && s < n; j++) cto[s++] = o; } }
  let key = null;
  if (b.stss) { const e = rd(b.stss, 4); key = new Uint8Array(n); for (let k = 0; k < e; k++) { const i = rd(b.stss, 8 + k * 4) - 1; if (i < n) key[i] = 1; } }
  t.S = { n, off, size, dts, cto, key, pts: (i) => (dts[i] + cto[i] - t.shift) / t.ts + t.delay };
  return t.S;
}
async function probeMp4(first) {
  Mp4.on = true; File.doc = 'mp4';
  let pos = 0, moov = null, guard = 0;
  while (pos < (Net.size || first.buf.length) && guard++ < 64) {
    const h = pos + 16 <= first.buf.length ? first.buf.subarray(pos, pos + 16) : (await Net.range(pos, pos + 15, null, 8000)).buf;
    let size = readUint(h, 0, 4); const type = readStr(h, 4, 4); let hdr = 8;
    if (size === 1) { size = readUint(h, 8, 8); hdr = 16; } else if (size === 0) size = (Net.size || first.buf.length) - pos;
    if (size < 8 || !/^[\x20-\x7e]{4}$/.test(type)) break;
    if (type === 'moov') {
      if (size > 96 << 20) throw new Error('the MP4 index is too big');
      const body = pos + size <= first.buf.length ? first.buf.subarray(pos, pos + size) : (await Net.range(pos, pos + size - 1, null, 20000)).buf;
      moov = { u: body, start: hdr, end: Math.min(body.length, size) }; break;
    }
    if (type === 'moof') throw new Error('fragmented MP4');
    pos += size;
  }
  if (!moov) throw new Error('no MP4 index (moov) found');
  const u = moov.u;
  if (mfind(u, moov.start, moov.end, 'mvex')) throw new Error('fragmented MP4');
  const mvhd = mfind(u, moov.start, moov.end, 'mvhd');
  if (mvhd) { const v = u[mvhd.start]; Mp4.ts = readUint(u, mvhd.start + (v ? 20 : 12), 4) || 1000; File.duration = readUint(u, mvhd.start + (v ? 24 : 16), v ? 8 : 4) / Mp4.ts; }
  File.tracks = [];
  for (const b of mboxes(u, moov.start, moov.end)) if (b.type === 'trak') { const t = mp4Track(u, b, Mp4.ts); if (t) File.tracks.push(t); }
  // a disabled track (commentary kept off) still counts; only the first enabled audio track is the default
  let seen = false; for (const t of File.tracks) if (t.type === 2) { t.def = !seen && t.enabled; if (t.def) seen = true; }
  if (!File.tracks.length) throw new Error('no tracks in the MP4');
}

/* MP4 streaming: walk the chosen tracks' samples in byte order and read them with one Range request at a time;
   a jump of more than 4 MB (badly interleaved files) starts a new request there. */
async function runMp4(t, gen) {
  const V = St.v ? mp4Samples(St.v) : null, A = St.a ? mp4Samples(St.a) : null;
  let iv = 0, ia = 0;
  if (V && V.n) {
    // the last keyframe at or before t
    let lo = 0, hi = V.n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (V.pts(m) <= t + 0.001) lo = m; else hi = m - 1; }
    iv = lo; if (V.key) while (iv > 0 && !V.key[iv]) iv--;
    St.startT = V.pts(iv);
  }
  if (A && A.n) { const at = (V && V.n ? St.startT : t) - 0.05; let lo = 0, hi = A.n; while (lo < hi) { const m = (lo + hi) >> 1; if (A.pts(m) < at) lo = m + 1; else hi = m; } ia = lo; }
  let buf = new Uint8Array(0), base = 0, reader = null, retries = 0, jumps = 0, jumpT = performance.now();
  const want = () => St.lastVideoT == null || St.lastVideoT < St.until;
  const open = async (at) => {
    try { if (reader) reader.cancel(); } catch (e) { /* ignore */ }
    const r = await fetch(Net.url, { headers: { ...Net.headers, Range: `bytes=${at}-` }, signal: St.ctl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (r.status !== 206) throw new Error(r.status === 200 ? 'the host stopped allowing byte ranges' : `the host answered ${r.status}`);
    reader = r.body.getReader(); buf = new Uint8Array(0); base = at;
  };
  const need = async (off, size) => {
    if (!reader || off < base || off > base + buf.length + (4 << 20)) {
      if (reader && ++jumps > 40) { if (performance.now() - jumpT < 20000) throw Object.assign(new Error('this MP4 is stored in a way that can’t be streamed (audio and video far apart)'), { fatal: true }); jumps = 0; jumpT = performance.now(); }
      await open(off);
    }
    // drop what is behind
    if (off - base > 1 << 20) { buf = buf.slice(off - base); base = off; }
    while (base + buf.length < off + size) {
      while (!want() && gen === St.gen) await new Promise((res) => { St.wake = res; setTimeout(res, 1000); });
      if (gen !== St.gen) return null;
      const { value, done } = await reader.read();
      if (gen !== St.gen) return null;
      if (done) throw new Error('the file ended early');
      const nb = new Uint8Array(buf.length + value.length); nb.set(buf); nb.set(value, buf.length); buf = nb;
    }
    return buf.slice(off - base, off - base + size);
  };
  while (gen === St.gen) {
    const vOk = V && iv < V.n, aOk = A && ia < A.n;
    if (!vOk && !aOk) { await finish(gen); return; }
    const takeV = vOk && (!aOk || V.off[iv] <= A.off[ia]);
    const S = takeV ? V : A, i = takeV ? iv : ia;
    let data;
    try { data = await need(S.off[i], S.size[i]); retries = 0; }
    catch (e) {
      if (gen !== St.gen) return;
      if (e.fatal || ++retries > 4) { post({ op: 'error', reason: e.message || String(e) }); return; }
      reader = null; await new Promise((res) => setTimeout(res, 500 * 2 ** retries)); continue;
    }
    if (!data) return;
    if (takeV) { pushVideo(data, S.pts(i), !V.key || !!V.key[i]); iv++; } else { onAudio(data, S.pts(i)); ia++; }
  }
}

/* ---------------- MPEG-TS reader ----------------
   Broadcast recordings and Blu-ray .m2ts files: packets are grouped into PES units per stream; H.264/HEVC is turned
   from start-code form into length-prefixed samples, AAC loses its ADTS headers, AC-3/E-AC-3 is split into frames.
   TS files carry no index, so seeking guesses by byte position and narrows it down by reading timestamps. */
const Ts = { on: false, pk: 188, off: 0, vpid: 0, apids: [], t0: null, streams: {} };
const AC3_441 = [69, 70, 87, 88, 104, 105, 121, 122, 139, 140, 174, 175, 208, 209, 243, 244, 278, 279, 348, 349, 417, 418, 487, 488, 557, 558, 696, 697, 835, 836, 975, 976, 1114, 1115, 1253, 1254, 1393, 1394];
const AC3_32 = [96, 96, 120, 120, 144, 144, 168, 168, 192, 192, 240, 240, 288, 288, 336, 336, 384, 384, 480, 480, 576, 576, 672, 672, 768, 768, 960, 960, 1152, 1152, 1344, 1344, 1536, 1536, 1728, 1728, 1920, 1920];
function tsSync(u) {
  for (const pk of [188, 192]) { const o = pk === 192 ? 4 : 0; for (let s = 0; s < pk && s + o + pk * 3 < u.length; s++) if (u[s + o] === 0x47 && u[s + o + pk] === 0x47 && u[s + o + pk * 2] === 0x47 && u[s + o + pk * 3] === 0x47) return { pk, off: s }; }
  return null;
}
function pesPts(u, p) { return ((u[p] >> 1) & 7) * 1073741824 + ((u[p + 1] << 7 | u[p + 2] >> 1) * 32768) + ((u[p + 3] << 7) | (u[p + 4] >> 1)); }
/* splits packets into PES units; onPes(pid, pts, dts, payload) */
class TsDemux {
  constructor(onPes, want) { this.onPes = onPes; this.want = want; this.acc = new Map(); }
  push(u, start) {
    const pk = Ts.pk, o = pk === 192 ? 4 : 0;
    let p = start;
    for (; p + pk <= u.length; p += pk) {
      const q = p + o; if (u[q] !== 0x47) { const r = tsSync(u.subarray(p)); if (!r) return u.length; p += r.off - pk; continue; }
      const pid = ((u[q + 1] & 31) << 8) | u[q + 2], pusi = u[q + 1] & 0x40, afc = (u[q + 3] >> 4) & 3;
      if (!(afc & 1)) continue;
      let d = q + 4; if (afc & 2) d += 1 + u[q + 4]; if (d >= q + 188) continue;
      const seg = u.subarray(d, q + 188);
      if (pid === 0 || (Ts.pmtPid && pid === Ts.pmtPid)) { if (pusi) this.psi(pid, seg); continue; }
      if (!this.want(pid)) continue;
      let a = this.acc.get(pid);
      if (pusi) { if (a) this.emit(pid, a); a = { parts: [], n: 0 }; this.acc.set(pid, a); }
      if (!a) continue;
      a.parts.push(seg.slice()); a.n += seg.length;
    }
    return p;
  }
  flush() { for (const [pid, a] of this.acc) this.emit(pid, a); this.acc.clear(); }
  emit(pid, a) {
    const u = a.parts.length === 1 ? a.parts[0] : cat(a.parts); a.parts = [];
    if (u.length < 9 || u[0] !== 0 || u[1] !== 0 || u[2] !== 1) return;
    const flags = u[7] >> 6, hl = u[8]; let pts = null, dts = null;
    if (flags & 2) pts = pesPts(u, 9); if (flags === 3) dts = pesPts(u, 14);
    this.onPes(pid, pts, dts == null ? pts : dts, u.subarray(9 + hl));
  }
  psi(pid, s) {
    let p = 1 + s[0]; const tid = s[p], len = ((s[p + 1] & 15) << 8) | s[p + 2], end = Math.min(s.length, p + 3 + len - 4);
    if (pid === 0 && tid === 0) { for (let i = p + 8; i + 4 <= end; i += 4) { const prog = (s[i] << 8) | s[i + 1], pm = ((s[i + 2] & 31) << 8) | s[i + 3]; if (prog) { Ts.pmtPid = Ts.pmtPid || pm; break; } } return; }
    if (tid !== 2 || Ts.pmtDone) return;
    const pil = ((s[p + 10] & 15) << 8) | s[p + 11]; let i = p + 12 + pil;
    while (i + 5 <= end) {
      const type = s[i], epid = ((s[i + 1] & 31) << 8) | s[i + 2], el = ((s[i + 3] & 15) << 8) | s[i + 4];
      const st = { pid: epid, type, lang: '', reg: '', desc: [] };
      for (let k = i + 5; k + 2 <= i + 5 + el;) { const tag = s[k], dl = s[k + 1]; st.desc.push(tag); if (tag === 0x0A && dl >= 3) st.lang = readStr(s, k + 2, 3); if (tag === 0x05 && dl >= 4) st.reg = readStr(s, k + 2, 4); k += 2 + dl; }
      Ts.streams[epid] = st; i += 5 + el;
    }
    Ts.pmtDone = true;
  }
}
function tsKind(st) {
  const t = st.type, d = st.desc;
  if (t === 0x1B) return ['v', 'avc']; if (t === 0x24) return ['v', 'hevc'];
  if (t === 0x0F) return ['a', 'aac']; if (t === 0x03 || t === 0x04) return ['a', 'mp2'];
  if (t === 0x81 || (t === 0x06 && (d.includes(0x6A) || st.reg === 'AC-3'))) return ['a', 'ac3'];
  if (t === 0x87 || t === 0x84 || (t === 0x06 && (d.includes(0x7A) || st.reg === 'EAC3'))) return ['a', 'eac3'];
  if (t === 0x82 || t === 0x85 || t === 0x86 || (t === 0x06 && (d.includes(0x7B) || /^DTS/.test(st.reg)))) return ['a', 'dts'];
  return ['', ''];
}
/* start-code NAL units */
function nals(u) {
  const out = []; let i = 0, s = -1;
  while (i + 2 < u.length) {
    if (u[i] === 0 && u[i + 1] === 0 && u[i + 2] === 1) { if (s >= 0) { let e = i; while (e > s && u[e - 1] === 0) e--; out.push(u.subarray(s, e)); } i += 3; s = i; continue; }
    i++;
  }
  if (s >= 0 && s < u.length) out.push(u.subarray(s));
  return out;
}
function unEsc(n) { const o = []; for (let i = 0; i < n.length; i++) { if (i > 1 && n[i] === 3 && n[i - 1] === 0 && n[i - 2] === 0) continue; o.push(n[i]); } return Uint8Array.from(o); }
function bitReader(u) {
  let b = 0; const r = (n) => { let v = 0; for (let i = 0; i < n; i++, b++) v = v * 2 + ((u[b >> 3] >> (7 - (b & 7))) & 1); return v; };
  const ue = () => { let z = 0; while (!r(1) && z < 32) z++; return (2 ** z) - 1 + r(z); };
  return { r, ue, se: () => { const k = ue(); return k & 1 ? (k + 1) / 2 : -k / 2; }, skip: (n) => { b += n; } };
}
function avcSps(sps) {
  const u = unEsc(sps), br = bitReader(u.subarray(1)); const prof = br.r(8); br.r(16); br.ue();
  let cf = 1;
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(prof)) {
    cf = br.ue(); if (cf === 3) br.r(1); br.ue(); br.ue(); br.r(1);
    if (br.r(1)) for (let i = 0; i < (cf !== 3 ? 8 : 12); i++) if (br.r(1)) { let last = 8, next = 8; for (let j = 0; j < (i < 6 ? 16 : 64); j++) { if (next) next = (last + br.se() + 256) % 256; last = next || last; } }
  }
  br.ue(); const poc = br.ue();
  if (poc === 0) br.ue(); else if (poc === 1) { br.r(1); br.se(); br.se(); const n = br.ue(); for (let i = 0; i < n; i++) br.se(); }
  br.ue(); br.r(1); const wm = br.ue() + 1, hm = br.ue() + 1, fmo = br.r(1); if (!fmo) br.r(1); br.r(1);
  let cl = 0, cr = 0, ct = 0, cb = 0; if (br.r(1)) { cl = br.ue(); cr = br.ue(); ct = br.ue(); cb = br.ue(); }
  const sx = cf === 0 || cf === 3 ? 1 : 2, sy = (cf === 1 ? 2 : 1) * (2 - fmo);
  return { w: wm * 16 - (cl + cr) * sx, h: (2 - fmo) * hm * 16 - (ct + cb) * sy };
}
function hevcSps(sps) {
  const u = unEsc(sps), br = bitReader(u.subarray(2)); br.r(4); const subs = br.r(3); br.r(1);
  const ptl = []; for (let i = 0; i < 12; i++) ptl.push(br.r(8));
  const sp = [], sl = []; for (let i = 0; i < subs; i++) { sp.push(br.r(1)); sl.push(br.r(1)); }
  if (subs > 0) for (let i = subs; i < 8; i++) br.r(2);
  for (let i = 0; i < subs; i++) { if (sp[i]) br.skip(88); if (sl[i]) br.r(8); }
  br.ue(); const cf = br.ue(); if (cf === 3) br.r(1);
  let w = br.ue(), h = br.ue();
  if (br.r(1)) { const sx = cf === 1 || cf === 2 ? 2 : 1, sy = cf === 1 ? 2 : 1; const l = br.ue(), r = br.ue(), t = br.ue(), b = br.ue(); w -= (l + r) * sx; h -= (t + b) * sy; }
  const bl = br.ue(), bc = br.ue();
  return { ptl, cf, bl, bc, w, h, subs };
}
function avcConfig(sps, pps) { return cat([[1, sps[1], sps[2], sps[3], 0xFF, 0xE1], u16(sps.length), sps, [1], u16(pps.length), pps]); }
function hevcConfig(vps, sps, pps) {
  const s = hevcSps(sps);
  const arr = (type, n) => cat([[0x80 | type], u16(1), u16(n.length), n]);
  return cat([[1, ...s.ptl.slice(0, 12)], [0xF0, 0x00, 0xFC, 0xFC | s.cf, 0xF8 | s.bl, 0xF8 | s.bc, 0, 0, ((s.subs + 1) << 3) | 0x04 | 3, 3], arr(32, vps), arr(33, sps), arr(34, pps)]);
}
/* ADTS AAC frames and AC-3/E-AC-3 syncframes out of one PES payload */
function adtsFrames(u) {
  const out = []; let p = 0;
  while (p + 7 <= u.length) {
    if (u[p] !== 0xFF || (u[p + 1] & 0xF6) !== 0xF0) { p++; continue; }
    const len = ((u[p + 3] & 3) << 11) | (u[p + 4] << 3) | (u[p + 5] >> 5), hl = u[p + 1] & 1 ? 7 : 9;
    if (len < hl || p + len > u.length) break;
    out.push({ data: u.subarray(p + hl, p + len), raw: u.subarray(p, p + len), aot: (u[p + 2] >> 6) + 1, sr: (u[p + 2] >> 2) & 15, ch: ((u[p + 2] & 1) << 2) | (u[p + 3] >> 6) });
    p += len;
  }
  return out;
}
function ac3Frames(u) {
  const out = []; let p = 0;
  while (p + 6 <= u.length) {
    if (u[p] !== 0x0B || u[p + 1] !== 0x77) { p++; continue; }
    const bsid = u[p + 5] >> 3; let len;
    if (bsid > 10) len = ((((u[p + 2] & 7) << 8) | u[p + 3]) + 1) * 2;
    else { const fs = u[p + 4] >> 6, code = u[p + 4] & 63; len = 2 * ((fs === 0 ? AC3_SIZES : fs === 1 ? AC3_441 : AC3_32)[code] || 0); }
    if (!len || p + len > u.length) break;
    out.push(u.subarray(p, p + len)); p += len;
  }
  return out;
}
async function probeTs(first, sync) {
  Ts.on = true; Ts.pk = sync.pk; Ts.off = sync.off; File.doc = sync.pk === 192 ? 'm2ts' : 'ts';
  const firstV = {}, firstA = {};
  const dm = new TsDemux((pid, pts, dts, data) => {
    const st = Ts.streams[pid]; if (!st) return;
    if (Ts.t0 == null && pts != null && st.k === 'v') Ts.t0 = pts;
    if (st.k === 'v' && !(st.ready)) {
      for (const n of nals(data)) {
        const ty = st.kind === 'hevc' ? (n[0] >> 1) & 63 : n[0] & 31;
        if (st.kind === 'avc') { if (ty === 7 && !st.sps) st.sps = n.slice(); if (ty === 8 && !st.pps) st.pps = n.slice(); }
        else { if (ty === 32 && !st.vps) st.vps = n.slice(); if (ty === 33 && !st.sps) st.sps = n.slice(); if (ty === 34 && !st.pps) st.pps = n.slice(); }
      }
      st.ready = !!(st.sps && st.pps && (st.kind === 'avc' || st.vps));
      firstV[pid] = true;
    }
    if (st.k === 'a' && !firstA[pid] && data.length) {
      firstA[pid] = true;
      if (st.kind === 'aac') { const f = adtsFrames(data)[0]; if (f) { st.priv = makeAsc(f.aot, SR[f.sr] || 48000, f.ch); st.rate = SR[f.sr] || 48000; st.ch = f.ch === 7 ? 8 : f.ch || 6; st.noCopy = !f.ch; if (st.noCopy) st.priv = null; } }
      if (st.kind === 'ac3' || st.kind === 'eac3') {
        const f = ac3Frames(data)[0];
        if (f) { const bsid = f[5] >> 3; if (bsid > 10) { const acmod = (f[4] >> 1) & 7; st.ch = [2, 1, 2, 3, 3, 4, 4, 5][acmod] + (f[4] & 1); st.kind = 'eac3'; } else { const d = dac3(f); const b = d[9]; st.ch = [2, 1, 2, 3, 3, 4, 4, 5][(b >> 3) & 7] + ((b >> 2) & 1); st.kind = 'ac3'; } }
      }
    }
  }, (pid) => { const st = Ts.streams[pid]; if (!st) return false; if (!st.k) { const [k, kind] = tsKind(st); st.k = k; st.kind = kind; } return !!st.k; });
  dm.push(first.buf, sync.off); dm.flush();
  const v = Object.values(Ts.streams).find((s) => s.k === 'v');
  if (!v) throw new Error('no H.264 or HEVC video in the first 512 KB of this TS file');
  if (!v.ready) throw new Error('the video’s set-up data isn’t in the first 512 KB');
  Ts.vpid = v.pid;
  const dim = v.kind === 'avc' ? avcSps(v.sps) : hevcSps(v.sps);
  File.tracks = [{ num: v.pid, type: 1, codec: v.kind === 'avc' ? 'V_MPEG4/ISO/AVC' : 'V_MPEGH/ISO/HEVC', priv: v.kind === 'avc' ? avcConfig(v.sps, v.pps) : hevcConfig(v.vps, v.sps, v.pps), w: dim.w, h: dim.h, lang: '', name: '', def: true, forced: false, enabled: true, dur: 0, rate: 0, ch: 0, bits: 0, strip: null, enc: false, dv: 0, delay: 0 }];
  let seenDef = false;
  for (const s of Object.values(Ts.streams)) {
    if (s.k !== 'a' || !s.kind) continue;
    const codec = { aac: 'A_AAC', ac3: 'A_AC3', eac3: 'A_EAC3', dts: 'A_DTS', mp2: 'A_MPEG/L2' }[s.kind];
    File.tracks.push({ num: s.pid, type: 2, codec, priv: s.priv || null, noCopy: !!s.noCopy, lang: s.lang || '', name: '', def: !seenDef, forced: false, enabled: true, dur: 0, rate: s.rate || 48000, ch: s.ch || 2, bits: 0, strip: null, enc: false, dv: 0, delay: 0, ts: true });
    seenDef = true;
  }
  // duration: the last video timestamp near the end of the file
  File.duration = 0;
  if (Net.size > first.buf.length && Ts.t0 != null) {
    try { const at = Math.max(0, Net.size - (1 << 20)); const tail = await Net.range(at, Net.size - 1, null, 8000); const last = tsLastPts(tail.buf); if (last != null) File.duration = tsSec(last); } catch (e) { /* unknown length */ }
  }
}
function tsSec(pts) { let d = pts - Ts.t0; if (d < -4294967296) d += 8589934592; return d / 90000; }
/* video timestamps (90 kHz) of PES starts in a chunk, in order */
function tsPtsList(u) {
  const s = tsSync(u); if (!s || s.pk !== Ts.pk) return [];
  const o = Ts.pk === 192 ? 4 : 0, out = [];
  for (let p = s.off; p + Ts.pk <= u.length; p += Ts.pk) {
    const q = p + o; if (u[q] !== 0x47) continue;
    const pid = ((u[q + 1] & 31) << 8) | u[q + 2]; if (pid !== Ts.vpid || !(u[q + 1] & 0x40)) continue;
    const afc = (u[q + 3] >> 4) & 3; let d = q + 4; if (afc & 2) d += 1 + u[q + 4];
    if (d + 14 <= q + 188 && u[d] === 0 && u[d + 1] === 0 && u[d + 2] === 1 && (u[d + 7] & 0x80)) out.push({ pos: p, pts: pesPts(u, d + 9) });
  }
  return out;
}
function tsLastPts(u) { const l = tsPtsList(u); let m = null; for (const x of l) if (m == null || tsSec(x.pts) > tsSec(m)) m = x.pts; return m; }
async function tsSeekPos(t) {
  if (t <= 1 || !Net.size || !File.duration) return { pos: Ts.off, t: 0 };
  const target = Math.max(0, t - 3); // a little early, so a keyframe comes before the spot
  let lo = 0, hi = Net.size, best = { pos: Ts.off, t: 0 };
  for (let k = 0; k < 10 && hi - lo > 1 << 20; k++) {
    const guess = Math.floor(lo + (hi - lo) * Math.min(0.95, Math.max(0.05, (target - best.t) / Math.max(1, File.duration - best.t))));
    const r = await Net.range(guess, Math.min(Net.size - 1, guess + 196607), St.ctl && St.ctl.signal, 8000);
    const l = tsPtsList(r.buf); if (!l.length) { hi = guess; continue; }
    const at = tsSec(l[0].pts);
    if (at <= target) { best = { pos: guess + l[0].pos, t: at }; lo = guess + 1; } else hi = guess;
  }
  return best;
}
/* one PES of the chosen tracks: video becomes one length-prefixed sample, audio is split into frames */
function tsPes(pid, pts, dts, data) {
  if (pts == null) return;
  if (St.v && pid === St.v.num) {
    const kind = St.v.kind; let key = false; const parts = [];
    for (const n of nals(data)) {
      const ty = kind === 'hevc' ? (n[0] >> 1) & 63 : n[0] & 31;
      if (kind === 'avc') { if (ty === 9 || ty === 7 || ty === 8) continue; if (ty === 5) key = true; if (ty === 6 && n[1] === 6) key = true; }
      else { if (ty === 35 || ty === 32 || ty === 33 || ty === 34) continue; if (ty >= 16 && ty <= 21) key = true; }
      parts.push(u32(n.length), n);
    }
    if (parts.length) pushVideo(cat(parts), tsSec(pts), key);
    return;
  }
  if (!St.a || pid !== St.a.num) return;
  const a = St.a, t = tsSec(pts);
  if (a.kind === 'aac') { const fr = adtsFrames(data), rate = a.rate || 48000; fr.forEach((f, i) => onAudio((a.noCopy ? f.raw : f.data).slice(), t + i * 1024 / rate)); return; } // channel layout in the stream: the decoder reads the ADTS headers itself
  if (a.kind === 'ac3' || a.kind === 'eac3') { const fr = ac3Frames(data); let tt = t; for (const f of fr) { onAudio(f.slice(), tt); tt += audioSamples(a, f) / audioRate(a); } return; }
  // DTS, MPEG audio: only converted, and the decoder takes whole PES payloads
  onAudio(data.slice(), t);
}
async function runTs(t, gen) {
  const at = await tsSeekPos(t); if (gen !== St.gen) return;
  St.startT = at.t;
  const dm = new TsDemux(tsPes, (pid) => (St.v && pid === St.v.num) || (St.a && pid === St.a.num));
  let buf = new Uint8Array(0), base = at.pos, retries = 0, started = false;
  const want = () => St.lastVideoT == null || St.lastVideoT < St.until;
  while (gen === St.gen) {
    let reader = null;
    try {
      const r = await fetch(Net.url, { headers: { ...Net.headers, Range: `bytes=${base + buf.length}-` }, signal: St.ctl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (r.status !== 206) throw new Error(r.status === 200 ? 'the host stopped allowing byte ranges' : `the host answered ${r.status}`);
      reader = r.body.getReader();
      for (;;) {
        while (!want() && gen === St.gen) await new Promise((res) => { St.wake = res; setTimeout(res, 1000); });
        if (gen !== St.gen) return;
        const { value, done } = await reader.read();
        if (gen !== St.gen) return;
        if (done) { dm.flush(); await finish(gen); return; }
        retries = 0;
        const nb = new Uint8Array(buf.length + value.length); nb.set(buf); nb.set(value, buf.length);
        let p = 0;
        if (!started) { const s = tsSync(nb); if (!s) { buf = nb; continue; } p = s.off; started = true; }
        const used = dm.push(nb, p);
        base += used; buf = nb.slice(used);
      }
    } catch (e) {
      if (gen !== St.gen) return;
      try { if (reader) reader.cancel(); } catch (x) { /* ignore */ }
      if (++retries > 4) { post({ op: 'error', reason: e.message || String(e) }); return; }
      await new Promise((res) => setTimeout(res, 500 * 2 ** retries));
    }
  }
}

/* ---------------- Playback state ---------------- */
const St = {
  subs: new Set(), gen: 0, ctl: null, until: 30, v: null, a: null, aMode: 'none', vInit: false, aInit: false, running: false, eos: false,
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
  constructor(tr, surround) { this.tr = tr; this.ch = surround ? 6 : 2; this.layout = surround ? 0x3F : 3; // 5.1 (L R C LFE Ls Rs as AAC config 6; 0x60F made FFmpeg write a PCE that browsers reject) or stereo
    this.la = null; this.dec = null; this.q = Promise.resolve(); this.tok = 0; }
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
    const [, ec, efr, epkt, fsize] = await la.ff_init_encoder('aac', { ctx: { bit_rate: this.ch === 6 ? 384000 : 192000, sample_fmt: la.AV_SAMPLE_FMT_FLTP, sample_rate: 48000, channel_layout: this.layout, channels: this.ch }, time_base: [1, 48000] });
    this.enc = { c: ec, frame: efr, pkt: epkt, fsize };
    this.graph = null; this.n = 0; this.start = null;
  }
  async filterFor(f) {
    const key = `${f.format}/${f.sample_rate}/${f.channel_layout}/${f.channels}`;
    if (this.graph && this.graph.key === key) return this.graph;
    if (this.graph) { try { await this.la.avfilter_graph_free_js(this.graph.g); } catch (e) { /* older build */ } }
    const layout = f.channel_layout || ({ 1: 4, 2: 3, 6: 0x3F, 8: 0x63F }[f.channels] || 3); // aresample maps side speakers onto back
    const [g, src, sink] = await this.la.ff_init_filter_graph('aresample=48000', { sample_rate: f.sample_rate, sample_fmt: f.format, channel_layout: layout }, { sample_rate: 48000, sample_fmt: this.la.AV_SAMPLE_FMT_FLTP, channel_layout: this.layout, frame_size: this.enc.fsize });
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
      const [, ec, efr, epkt, fsize] = await la.ff_init_encoder('aac', { ctx: { bit_rate: this.ch === 6 ? 384000 : 192000, sample_fmt: la.AV_SAMPLE_FMT_FLTP, sample_rate: 48000, channel_layout: this.layout, channels: this.ch }, time_base: [1, 48000] });
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
      const entry = audioEntry('mp4a', this.ch, 48000, esDesc(0x40, new Uint8Array([0x11, this.ch === 6 ? 0xB0 : 0x90])));
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
  if (!isV && !isA) {
    // image subtitles (PGS) the page asked for: each block is one display set, sent as it is
    if (St.subs.has(num)) { const d = u.slice(q, end); post({ op: 'sub', num, pts: (clusterTc + rel) * File.scale / 1e9, data: d.buffer }, [d.buffer]); }
    return;
  }
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
  if (Ts.on) { runTs(t, gen).catch((e) => { if (gen === St.gen) post({ op: 'error', reason: e.message || String(e) }); }); return; }
  if (Mp4.on) { runMp4(t, gen).catch((e) => { if (gen === St.gen) post({ op: 'error', reason: e.message || String(e) }); }); return; }
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
          const init = initSegment(St.v, videoEntry(St.v, !!m.dv), 90000, true); St.vInit = true;
          post({ op: 'init', kind: 'v', mime: `video/mp4; codecs="${m.vmime}"`, data: init.buffer }, [init.buffer]);
        }
        St.rescue = null;
        if (St.aMode === 'aac') {
          const r = new Rescue(St.a, !!m.surround && (St.a.ch || 2) >= 6);
          try { await r.open(); St.rescue = r; r.reset(); }
          catch (err) { St.aMode = 'none'; post({ op: 'note', msg: `This film’s sound (${St.a.codec.replace(/^A_/, '')}) couldn’t be converted here: ${err.message || err}`, audioFail: true }); }
        }
      }
      St.until = m.until || (m.t + 30);
      await start(m.t || 0, m.gen);
    } else if (m.op === 'subs') { St.subs = new Set(m.nums || []); }
    else if (m.op === 'until') { St.until = m.t; if (St.wake) St.wake(); }
    else if (m.op === 'close') { St.gen++; if (St.ctl) St.ctl.abort(); self.close(); }
  } catch (err) { post({ op: 'error', reason: err.message || String(err) }); }
};
