package com.mkcinema.app;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * 1.12.0: AirPlay video sender, so an Android phone can send a film to an Apple TV.
 *
 * The phone never streams the picture itself. Like an iPhone does with a web video, it hands the Apple TV the stream's
 * web link and the Apple TV plays it on its own (so MP4 or HLS links only; MKV is converted by the debrid service first,
 * see the web app). What the phone has to do is be let in: Apple TVs only accept senders that paired with them.
 *
 *  - Pairing (once per Apple TV): HomeKit-style pair-setup. The TV shows a 4-digit code, the person types it, and both
 *    sides swap long-term Ed25519 keys over SRP-6a (3072-bit, SHA-512). An Apple TV set to let everyone AirPlay
 *    accepts "transient" pairing with the fixed code 3939, so no code is asked at all.
 *  - Every session: pair-verify (X25519), then the control connection is ChaCha20-Poly1305 encrypted in HAP frames.
 *  - AirPlay 2 receivers (every current Apple TV): RTSP SETUP with an NTP timing port and an event channel, RECORD,
 *    then POST /play with the link. AirPlay 1 receivers: POST /play straight away.
 *  - The Apple TV stops the film when this connection closes, so the session lives in a foreground service
 *    (AirPlayService) and polls /playback-info every second, which also gives the position for the controls.
 *
 * No Android classes here, so the whole protocol can be tested on a computer (tools/airplay-test). The crypto is
 * plain Java (BigInteger) because Android only has X25519/Ed25519/ChaCha20 from versions far above minSdk 24.
 * Protocol steps follow pyatv (MIT, github.com/postlund/pyatv), which works with real Apple TVs.
 */
final class AirPlay {
    private AirPlay() {}

    static final SecureRandom RNG = new SecureRandom();
    static final int F_VIDEO = 0, F_UNIFIED_MEDIA = 38, F_COREUTILS_PAIRING = 48;

    // ------------------------------------------------------------------ bytes
    static byte[] cat(byte[]... parts) {
        int n = 0; for (byte[] p : parts) n += p.length;
        byte[] o = new byte[n]; int i = 0;
        for (byte[] p : parts) { System.arraycopy(p, 0, o, i, p.length); i += p.length; }
        return o;
    }
    static byte[] utf8(String s) { return s.getBytes(StandardCharsets.UTF_8); }
    static String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format(Locale.US, "%02x", x & 0xff)); return s.toString(); }
    static byte[] unhex(String h) {
        byte[] o = new byte[h.length() / 2];
        for (int i = 0; i < o.length; i++) o[i] = (byte) Integer.parseInt(h.substring(2 * i, 2 * i + 2), 16);
        return o;
    }
    static byte[] random(int n) { byte[] b = new byte[n]; RNG.nextBytes(b); return b; }
    static byte[] sha512(byte[]... parts) {
        try { MessageDigest d = MessageDigest.getInstance("SHA-512"); for (byte[] p : parts) d.update(p); return d.digest(); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    /** big-endian, no leading zero bytes (what srptools/pyatv use in SRP hashes) */
    static byte[] be(BigInteger v) {
        byte[] b = v.toByteArray();
        int i = 0; while (i < b.length - 1 && b[i] == 0) i++;
        return i == 0 ? b : Arrays.copyOfRange(b, i, b.length);
    }
    static byte[] pad(BigInteger v, int len) { byte[] b = be(v); if (b.length >= len) return b; byte[] o = new byte[len]; System.arraycopy(b, 0, o, len - b.length, b.length); return o; }
    static BigInteger leInt(byte[] b) { byte[] r = new byte[b.length + 1]; for (int i = 0; i < b.length; i++) r[b.length - i] = b[i]; return new BigInteger(r); }
    static byte[] le32(BigInteger v) { byte[] b = be(v), o = new byte[32]; for (int i = 0; i < b.length && i < 32; i++) o[i] = b[b.length - 1 - i]; return o; }

    // ------------------------------------------------------------------ HKDF-SHA512 (32-byte keys)
    static byte[] hkdf(String salt, String info, byte[] ikm) {
        try {
            Mac m = Mac.getInstance("HmacSHA512");
            m.init(new SecretKeySpec(utf8(salt), "HmacSHA512"));
            byte[] prk = m.doFinal(ikm);
            m.init(new SecretKeySpec(prk, "HmacSHA512"));
            m.update(utf8(info)); m.update((byte) 1);
            return Arrays.copyOf(m.doFinal(), 32);
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    // ------------------------------------------------------------------ Curve25519 / Ed25519 (RFC 7748, RFC 8032)
    static final BigInteger P = BigInteger.ONE.shiftLeft(255).subtract(BigInteger.valueOf(19));
    static final BigInteger L = BigInteger.ONE.shiftLeft(252).add(new BigInteger("27742317777372353535851937790883648493"));
    static final BigInteger D = BigInteger.valueOf(-121665).multiply(BigInteger.valueOf(121666).modInverse(P)).mod(P);
    static final BigInteger SQRT_M1 = BigInteger.valueOf(2).modPow(P.subtract(BigInteger.ONE).shiftRight(2), P);
    static final BigInteger D2 = D.shiftLeft(1).mod(P);
    static final BigInteger[] G;
    static {
        BigInteger gy = BigInteger.valueOf(4).multiply(BigInteger.valueOf(5).modInverse(P)).mod(P);
        BigInteger gx = recoverX(gy, 0);
        G = new BigInteger[] { gx, gy, BigInteger.ONE, gx.multiply(gy).mod(P) };
    }

    static byte[] x25519(byte[] scalar, byte[] u) {
        byte[] k = scalar.clone(); k[0] &= (byte) 248; k[31] &= 127; k[31] |= 64;
        BigInteger kn = leInt(k);
        byte[] uu = u.clone(); uu[31] &= 127;
        BigInteger x1 = leInt(uu).mod(P), x2 = BigInteger.ONE, z2 = BigInteger.ZERO, x3 = x1, z3 = BigInteger.ONE;
        BigInteger a24 = BigInteger.valueOf(121665);
        int swap = 0;
        for (int t = 254; t >= 0; t--) {
            int kt = kn.testBit(t) ? 1 : 0;
            swap ^= kt;
            if (swap == 1) { BigInteger s = x2; x2 = x3; x3 = s; s = z2; z2 = z3; z3 = s; }
            swap = kt;
            BigInteger a = x2.add(z2), aa = a.multiply(a).mod(P), b = x2.subtract(z2), bb = b.multiply(b).mod(P), e = aa.subtract(bb);
            BigInteger c = x3.add(z3), d = x3.subtract(z3), da = d.multiply(a).mod(P), cb = c.multiply(b).mod(P);
            BigInteger s1 = da.add(cb), s2 = da.subtract(cb);
            x3 = s1.multiply(s1).mod(P);
            z3 = x1.multiply(s2.multiply(s2)).mod(P);
            x2 = aa.multiply(bb).mod(P);
            z2 = e.multiply(aa.add(a24.multiply(e))).mod(P);
        }
        if (swap == 1) { x2 = x3; z2 = z3; }
        return le32(x2.multiply(z2.modPow(P.subtract(BigInteger.valueOf(2)), P)).mod(P));
    }
    static byte[] x25519Base(byte[] scalar) { byte[] nine = new byte[32]; nine[0] = 9; return x25519(scalar, nine); }

    static BigInteger recoverX(BigInteger y, int sign) {
        if (y.compareTo(P) >= 0) return null;
        BigInteger y2 = y.multiply(y);
        BigInteger x2 = y2.subtract(BigInteger.ONE).multiply(D.multiply(y2).add(BigInteger.ONE).modInverse(P)).mod(P);
        if (x2.signum() == 0) return sign == 1 ? null : BigInteger.ZERO;
        BigInteger x = x2.modPow(P.add(BigInteger.valueOf(3)).shiftRight(3), P);
        if (x.multiply(x).subtract(x2).mod(P).signum() != 0) x = x.multiply(SQRT_M1).mod(P);
        if (x.multiply(x).subtract(x2).mod(P).signum() != 0) return null;
        if ((x.testBit(0) ? 1 : 0) != sign) x = P.subtract(x);
        return x;
    }
    static BigInteger[] edAdd(BigInteger[] p, BigInteger[] q) {
        BigInteger a = p[1].subtract(p[0]).multiply(q[1].subtract(q[0])).mod(P);
        BigInteger b = p[1].add(p[0]).multiply(q[1].add(q[0])).mod(P);
        BigInteger c = p[3].multiply(D2).multiply(q[3]).mod(P);
        BigInteger d = p[2].shiftLeft(1).multiply(q[2]).mod(P);
        BigInteger e = b.subtract(a), f = d.subtract(c), g = d.add(c), h = b.add(a);
        return new BigInteger[] { e.multiply(f).mod(P), g.multiply(h).mod(P), f.multiply(g).mod(P), e.multiply(h).mod(P) };
    }
    static BigInteger[] edMul(BigInteger s, BigInteger[] p) {
        BigInteger[] q = { BigInteger.ZERO, BigInteger.ONE, BigInteger.ONE, BigInteger.ZERO };
        for (int i = s.bitLength() - 1; i >= 0; i--) { q = edAdd(q, q); if (s.testBit(i)) q = edAdd(q, p); }
        return q;
    }
    static byte[] edEncode(BigInteger[] p) {
        BigInteger zi = p[2].modInverse(P), x = p[0].multiply(zi).mod(P), y = p[1].multiply(zi).mod(P);
        byte[] o = le32(y); if (x.testBit(0)) o[31] |= (byte) 0x80; return o;
    }
    static BigInteger[] edDecode(byte[] s) {
        if (s == null || s.length != 32) return null;
        byte[] c = s.clone(); int sign = (c[31] >> 7) & 1; c[31] &= 127;
        BigInteger y = leInt(c), x = recoverX(y, sign);
        return x == null ? null : new BigInteger[] { x, y, BigInteger.ONE, x.multiply(y).mod(P) };
    }
    static BigInteger edScalar(byte[] seed) {
        byte[] h = sha512(seed), a = Arrays.copyOf(h, 32);
        a[0] &= (byte) 248; a[31] &= 63; a[31] |= 64;
        return leInt(a);
    }
    static byte[] edPublic(byte[] seed) { return edEncode(edMul(edScalar(seed), G)); }
    static byte[] edSign(byte[] seed, byte[] msg) {
        byte[] h = sha512(seed); BigInteger a = edScalar(seed);
        byte[] pub = edEncode(edMul(a, G));
        BigInteger r = leInt(sha512(Arrays.copyOfRange(h, 32, 64), msg)).mod(L);
        byte[] rb = edEncode(edMul(r, G));
        BigInteger k = leInt(sha512(rb, pub, msg)).mod(L);
        return cat(rb, le32(r.add(k.multiply(a)).mod(L)));
    }
    static boolean edVerify(byte[] pub, byte[] msg, byte[] sig) {
        if (sig == null || sig.length != 64) return false;
        BigInteger[] a = edDecode(pub), r = edDecode(Arrays.copyOf(sig, 32));
        if (a == null || r == null) return false;
        BigInteger s = leInt(Arrays.copyOfRange(sig, 32, 64));
        if (s.compareTo(L) >= 0) return false;
        BigInteger k = leInt(sha512(Arrays.copyOf(sig, 32), pub, msg)).mod(L);
        BigInteger[] l = edMul(s, G), rr = edAdd(r, edMul(k, a));
        return l[0].multiply(rr[2]).subtract(rr[0].multiply(l[2])).mod(P).signum() == 0
            && l[1].multiply(rr[2]).subtract(rr[1].multiply(l[2])).mod(P).signum() == 0;
    }

    // ------------------------------------------------------------------ ChaCha20-Poly1305 (RFC 8439)
    static int rotl(int v, int c) { return (v << c) | (v >>> (32 - c)); }
    static int le4(byte[] b, int o) { return (b[o] & 0xff) | (b[o + 1] & 0xff) << 8 | (b[o + 2] & 0xff) << 16 | (b[o + 3] & 0xff) << 24; }
    static void chachaBlock(int[] key, int counter, int[] nonce, byte[] out) {
        int[] s = { 0x61707865, 0x3320646e, 0x79622d32, 0x6b206574, key[0], key[1], key[2], key[3], key[4], key[5], key[6], key[7], counter, nonce[0], nonce[1], nonce[2] };
        int[] x = s.clone();
        for (int i = 0; i < 10; i++) {
            qr(x, 0, 4, 8, 12); qr(x, 1, 5, 9, 13); qr(x, 2, 6, 10, 14); qr(x, 3, 7, 11, 15);
            qr(x, 0, 5, 10, 15); qr(x, 1, 6, 11, 12); qr(x, 2, 7, 8, 13); qr(x, 3, 4, 9, 14);
        }
        for (int i = 0; i < 16; i++) { int v = x[i] + s[i]; out[4 * i] = (byte) v; out[4 * i + 1] = (byte) (v >> 8); out[4 * i + 2] = (byte) (v >> 16); out[4 * i + 3] = (byte) (v >> 24); }
    }
    static void qr(int[] x, int a, int b, int c, int d) {
        x[a] += x[b]; x[d] = rotl(x[d] ^ x[a], 16); x[c] += x[d]; x[b] = rotl(x[b] ^ x[c], 12);
        x[a] += x[b]; x[d] = rotl(x[d] ^ x[a], 8); x[c] += x[d]; x[b] = rotl(x[b] ^ x[c], 7);
    }
    static byte[] chacha(byte[] key, byte[] nonce12, int counter, byte[] in) {
        int[] k = new int[8], n = new int[3];
        for (int i = 0; i < 8; i++) k[i] = le4(key, 4 * i);
        for (int i = 0; i < 3; i++) n[i] = le4(nonce12, 4 * i);
        byte[] out = new byte[in.length], blk = new byte[64];
        for (int off = 0; off < in.length; off += 64, counter++) {
            chachaBlock(k, counter, n, blk);
            for (int i = 0; i < 64 && off + i < in.length; i++) out[off + i] = (byte) (in[off + i] ^ blk[i]);
        }
        return out;
    }
    static final BigInteger P1305 = BigInteger.ONE.shiftLeft(130).subtract(BigInteger.valueOf(5));
    static byte[] poly1305(byte[] otk, byte[] msg) {
        byte[] rb = Arrays.copyOf(otk, 16);
        rb[3] &= 15; rb[7] &= 15; rb[11] &= 15; rb[15] &= 15; rb[4] &= (byte) 252; rb[8] &= (byte) 252; rb[12] &= (byte) 252;
        BigInteger r = leInt(rb), s = leInt(Arrays.copyOfRange(otk, 16, 32)), acc = BigInteger.ZERO;
        for (int i = 0; i < msg.length; i += 16) {
            int n = Math.min(16, msg.length - i);
            byte[] blk = Arrays.copyOf(Arrays.copyOfRange(msg, i, i + n), n + 1); blk[n] = 1;
            acc = acc.add(leInt(blk)).multiply(r).mod(P1305);
        }
        acc = acc.add(s);
        byte[] o = new byte[16], a = le32(acc.mod(BigInteger.ONE.shiftLeft(128)));
        System.arraycopy(a, 0, o, 0, 16); return o;
    }
    static byte[] macData(byte[] aad, byte[] ct) {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        b.write(aad, 0, aad.length); b.write(new byte[(16 - aad.length % 16) % 16], 0, (16 - aad.length % 16) % 16);
        b.write(ct, 0, ct.length); b.write(new byte[(16 - ct.length % 16) % 16], 0, (16 - ct.length % 16) % 16);
        byte[] lens = new byte[16]; long al = aad.length, cl = ct.length;
        for (int i = 0; i < 8; i++) { lens[i] = (byte) (al >>> (8 * i)); lens[8 + i] = (byte) (cl >>> (8 * i)); }
        b.write(lens, 0, 16); return b.toByteArray();
    }
    static byte[] seal(byte[] key, byte[] nonce12, byte[] aad, byte[] plain) {
        byte[] otk = chacha(key, nonce12, 0, new byte[32]);
        byte[] ct = chacha(key, nonce12, 1, plain);
        return cat(ct, poly1305(otk, macData(aad == null ? new byte[0] : aad, ct)));
    }
    static byte[] open(byte[] key, byte[] nonce12, byte[] aad, byte[] sealed) throws IOException {
        if (sealed.length < 16) throw new IOException("short ciphertext");
        byte[] ct = Arrays.copyOf(sealed, sealed.length - 16), tag = Arrays.copyOfRange(sealed, sealed.length - 16, sealed.length);
        byte[] otk = chacha(key, nonce12, 0, new byte[32]);
        if (!MessageDigest.isEqual(tag, poly1305(otk, macData(aad == null ? new byte[0] : aad, ct)))) throw new IOException("decryption failed");
        return chacha(key, nonce12, 1, ct);
    }
    /** "PV-Msg02" style nonce: 4 zero bytes then the 8 ASCII bytes */
    static byte[] nonce(String s) { byte[] b = utf8(s), o = new byte[12]; System.arraycopy(b, 0, o, 12 - b.length, b.length); return o; }
    static byte[] nonce(long counter) { byte[] o = new byte[12]; for (int i = 0; i < 8; i++) o[4 + i] = (byte) (counter >>> (8 * i)); return o; }

    // ------------------------------------------------------------------ TLV8
    static final int T_METHOD = 0, T_ID = 1, T_SALT = 2, T_PUB = 3, T_PROOF = 4, T_ENC = 5, T_STATE = 6, T_ERROR = 7, T_SIG = 10, T_FLAGS = 0x13;
    static byte[] tlv(Object... kv) {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        for (int i = 0; i < kv.length; i += 2) {
            int t = (Integer) kv[i]; byte[] v = (byte[]) kv[i + 1]; int off = 0;
            do { int n = Math.min(255, v.length - off); o.write(t); o.write(n); o.write(v, off, n); off += n; } while (off < v.length);
        }
        return o.toByteArray();
    }
    static Map<Integer, byte[]> tlvRead(byte[] b) {
        Map<Integer, byte[]> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < b.length; ) {
            int t = b[i] & 0xff, n = b[i + 1] & 0xff;
            byte[] v = Arrays.copyOfRange(b, i + 2, Math.min(b.length, i + 2 + n));
            m.put(t, m.containsKey(t) ? cat(m.get(t), v) : v);
            i += 2 + n;
        }
        return m;
    }
    static byte[] b1(int v) { return new byte[] { (byte) v }; }

    // ------------------------------------------------------------------ binary plist (just what AirPlay uses)
    static byte[] plist(Object root) {
        List<byte[]> objs = new ArrayList<>();
        int total = count(root), ref = total < 256 ? 1 : 2;
        flatten(root, objs, ref);
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(utf8("bplist00"), 0, 8);
        long[] offs = new long[objs.size()];
        for (int i = 0; i < objs.size(); i++) { offs[i] = o.size(); o.write(objs.get(i), 0, objs.get(i).length); }
        long table = o.size(); int osz = table < 256 ? 1 : table < 65536 ? 2 : 4;
        for (long off : offs) for (int k = osz - 1; k >= 0; k--) o.write((int) (off >>> (8 * k)));
        byte[] tr = new byte[32]; tr[6] = (byte) osz; tr[7] = (byte) ref;
        putLong(tr, 8, objs.size()); putLong(tr, 16, 0); putLong(tr, 24, table);
        o.write(tr, 0, 32); return o.toByteArray();
    }
    static void putLong(byte[] b, int at, long v) { for (int i = 0; i < 8; i++) b[at + i] = (byte) (v >>> (8 * (7 - i))); }
    static int count(Object o) {
        int n = 1;
        if (o instanceof Map) for (Map.Entry<?, ?> e : ((Map<?, ?>) o).entrySet()) n += 1 + count(e.getValue());
        else if (o instanceof List) for (Object x : (List<?>) o) n += count(x);
        return n;
    }
    static int flatten(Object o, List<byte[]> objs, int ref) {
        int me = objs.size(); objs.add(null);
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        if (o == null || o instanceof Boolean) b.write(o == null ? 0 : ((Boolean) o) ? 9 : 8);
        else if (o instanceof Integer || o instanceof Long) { b.write(0x13); long v = ((Number) o).longValue(); for (int i = 7; i >= 0; i--) b.write((int) (v >>> (8 * i))); }
        else if (o instanceof Double || o instanceof Float) { b.write(0x23); long v = Double.doubleToLongBits(((Number) o).doubleValue()); for (int i = 7; i >= 0; i--) b.write((int) (v >>> (8 * i))); }
        else if (o instanceof byte[]) { byte[] d = (byte[]) o; marker(b, 0x40, d.length); b.write(d, 0, d.length); }
        else if (o instanceof String) {
            String s = (String) o; boolean ascii = true; for (int i = 0; i < s.length(); i++) if (s.charAt(i) > 127) ascii = false;
            byte[] d = ascii ? s.getBytes(StandardCharsets.US_ASCII) : s.getBytes(StandardCharsets.UTF_16BE);
            marker(b, ascii ? 0x50 : 0x60, s.length()); b.write(d, 0, d.length);
        } else if (o instanceof List) {
            List<?> l = (List<?>) o; int[] refs = new int[l.size()];
            for (int i = 0; i < l.size(); i++) refs[i] = flatten(l.get(i), objs, ref);
            marker(b, 0xA0, refs.length); for (int r : refs) writeRef(b, r, ref);
        } else if (o instanceof Map) {
            Map<?, ?> m = (Map<?, ?>) o; int[] ks = new int[m.size()], vs = new int[m.size()]; int i = 0;
            for (Map.Entry<?, ?> e : m.entrySet()) { ks[i] = flatten(String.valueOf(e.getKey()), objs, ref); vs[i] = flatten(e.getValue(), objs, ref); i++; }
            marker(b, 0xD0, ks.length); for (int r : ks) writeRef(b, r, ref); for (int r : vs) writeRef(b, r, ref);
        } else throw new IllegalArgumentException("plist: " + o.getClass());
        objs.set(me, b.toByteArray()); return me;
    }
    static void writeRef(ByteArrayOutputStream b, int r, int size) { if (size == 2) b.write(r >> 8); b.write(r); }
    static void marker(ByteArrayOutputStream b, int type, int len) {
        if (len < 15) { b.write(type | len); return; }
        b.write(type | 15);
        if (len < 256) { b.write(0x10); b.write(len); } else if (len < 65536) { b.write(0x11); b.write(len >> 8); b.write(len); }
        else { b.write(0x12); for (int i = 3; i >= 0; i--) b.write(len >>> (8 * i)); }
    }
    static Object plistRead(byte[] b) {
        if (b == null || b.length < 40 || !new String(b, 0, 8, StandardCharsets.US_ASCII).equals("bplist00")) return null;
        int t = b.length - 32, osz = b[t + 6] & 0xff, rsz = b[t + 7] & 0xff;
        int n = (int) uint(b, t + 8, 8), top = (int) uint(b, t + 16, 8); long table = uint(b, t + 24, 8);
        long[] offs = new long[n];
        for (int i = 0; i < n; i++) offs[i] = uint(b, (int) table + i * osz, osz);
        return obj(b, offs, rsz, top, 0);
    }
    static long uint(byte[] b, int at, int n) { long v = 0; for (int i = 0; i < n; i++) v = (v << 8) | (b[at + i] & 0xff); return v; }
    static Object obj(byte[] b, long[] offs, int rsz, int idx, int depth) {
        if (depth > 32 || idx < 0 || idx >= offs.length) return null;
        int at = (int) offs[idx], m = b[at] & 0xff, hi = m >> 4, lo = m & 15, p = at + 1;
        if (hi == 0) return lo == 9 ? Boolean.TRUE : lo == 8 ? Boolean.FALSE : null;
        if (hi == 1) { int n = 1 << lo; long v = n > 8 ? uint(b, p + n - 8, 8) : uint(b, p, n); if (n == 8) return v; return v; }
        if (hi == 2) return lo == 2 ? (double) Float.intBitsToFloat((int) uint(b, p, 4)) : Double.longBitsToDouble(uint(b, p, 8));
        if (hi == 3) return Double.longBitsToDouble(uint(b, p, 8));
        int len = lo;
        if (lo == 15 && hi != 8) { int im = b[p] & 0xff, n = 1 << (im & 15); len = (int) uint(b, p + 1, n); p += 1 + n; }
        switch (hi) {
            case 4: return Arrays.copyOfRange(b, p, p + len);
            case 5: return new String(b, p, len, StandardCharsets.US_ASCII);
            case 6: return new String(b, p, 2 * len, StandardCharsets.UTF_16BE);
            case 8: return uint(b, p, lo + 1);
            case 10: { List<Object> l = new ArrayList<>(); for (int i = 0; i < len; i++) l.add(obj(b, offs, rsz, (int) uint(b, p + i * rsz, rsz), depth + 1)); return l; }
            case 13: {
                Map<String, Object> d = new LinkedHashMap<>();
                for (int i = 0; i < len; i++) d.put(String.valueOf(obj(b, offs, rsz, (int) uint(b, p + i * rsz, rsz), depth + 1)), obj(b, offs, rsz, (int) uint(b, p + (len + i) * rsz, rsz), depth + 1));
                return d;
            }
            default: return null;
        }
    }
    static double num(Object o, double dflt) { return o instanceof Number ? ((Number) o).doubleValue() : dflt; }

    // ------------------------------------------------------------------ SRP-6a client (3072-bit group, SHA-512, as srptools)
    static final BigInteger N = new BigInteger(
        "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF", 16);
    static final BigInteger GEN = BigInteger.valueOf(5);
    static final int NLEN = 384;
    static BigInteger hInt(byte[]... parts) { return new BigInteger(1, sha512(parts)); }

    /** One SRP exchange: A and the proof M1 for the TV's salt and B, and the session key K. */
    static final class Srp {
        final byte[] pubA, proof, key, expectServer;
        Srp(String pin, byte[] salt, byte[] serverB) {
            BigInteger a, A;
            do { a = new BigInteger(1, random(32)); A = GEN.modPow(a, N); } while (A.signum() == 0);
            BigInteger B = new BigInteger(1, serverB);
            if (B.mod(N).signum() == 0) throw new IllegalStateException("bad server key");
            byte[] user = utf8("Pair-Setup");
            BigInteger k = hInt(be(N), pad(GEN, NLEN));
            BigInteger u = hInt(pad(A, NLEN), pad(B, NLEN));
            BigInteger x = hInt(salt, sha512(user, utf8(":"), utf8(pin)));
            BigInteger S = B.subtract(k.multiply(GEN.modPow(x, N))).mod(N).modPow(a.add(u.multiply(x)), N);
            key = sha512(be(S));
            BigInteger hx = hInt(be(N)).xor(hInt(be(GEN)));
            pubA = be(A);
            proof = sha512(be(hx), sha512(user), salt, be(A), be(B), key);
            expectServer = sha512(be(A), proof, key);
        }
    }

    // ------------------------------------------------------------------ saved pairing
    /** What a pairing leaves behind: our long-term key (seed) and id, the TV's long-term public key and id. */
    static final class Creds {
        final byte[] tvPub, seed, tvId, myId;
        Creds(byte[] tvPub, byte[] seed, byte[] tvId, byte[] myId) { this.tvPub = tvPub; this.seed = seed; this.tvId = tvId; this.myId = myId; }
        @Override public String toString() { return hex(tvPub) + ":" + hex(seed) + ":" + hex(tvId) + ":" + hex(myId); }
        static Creds parse(String s) {
            if (s == null) return null;
            String[] p = s.split(":");
            if (p.length != 4) return null;
            try { return new Creds(unhex(p[0]), unhex(p[1]), unhex(p[2]), unhex(p[3])); } catch (Exception e) { return null; }
        }
    }

    static class AuthException extends IOException { AuthException(String m) { super(m); } }
    static class WrongPin extends AuthException { WrongPin() { super("wrong code"); } }

    // ------------------------------------------------------------------ connection (HTTP and RTSP, HAP encrypted once verified)
    static final class Resp {
        int code; String status = ""; final Map<String, String> headers = new LinkedHashMap<>(); byte[] body = new byte[0];
        String header(String k) { for (Map.Entry<String, String> e : headers.entrySet()) if (e.getKey().equalsIgnoreCase(k)) return e.getValue(); return null; }
    }
    static final class Req { String method, path, proto; final Map<String, String> headers = new LinkedHashMap<>(); byte[] body = new byte[0];
        String header(String k) { for (Map.Entry<String, String> e : headers.entrySet()) if (e.getKey().equalsIgnoreCase(k)) return e.getValue(); return null; } }

    /** HAP framing: 2-byte little-endian length, then up to 1024 bytes sealed with a per-direction counter nonce. */
    static final class Hap {
        final byte[] outKey, inKey; long outN, inN;
        Hap(byte[] outKey, byte[] inKey) { this.outKey = outKey; this.inKey = inKey; }
        byte[] seal(byte[] data) {
            ByteArrayOutputStream o = new ByteArrayOutputStream();
            for (int off = 0; off < data.length; off += 1024) {
                int n = Math.min(1024, data.length - off);
                byte[] len = { (byte) n, (byte) (n >> 8) };
                byte[] c = AirPlay.seal(outKey, nonce(outN++), len, Arrays.copyOfRange(data, off, off + n));
                o.write(len, 0, 2); o.write(c, 0, c.length);
            }
            return o.toByteArray();
        }
    }
    static final class HapIn extends InputStream {
        final InputStream raw; final Hap hap; byte[] buf = new byte[0]; int pos;
        HapIn(InputStream raw, Hap hap) { this.raw = raw; this.hap = hap; }
        @Override public int read() throws IOException {
            while (pos >= buf.length) {
                byte[] len = readN(raw, 2); int n = (len[0] & 0xff) | (len[1] & 0xff) << 8;
                buf = AirPlay.open(hap.inKey, nonce(hap.inN++), len, readN(raw, n + 16)); pos = 0;
            }
            return buf[pos++] & 0xff;
        }
    }
    static byte[] readN(InputStream in, int n) throws IOException {
        byte[] b = new byte[n]; int o = 0;
        while (o < n) { int r = in.read(b, o, n - o); if (r < 0) throw new EOFException("connection closed"); o += r; }
        return b;
    }
    static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        for (int c; (c = in.read()) != '\n'; ) { if (c < 0) throw new EOFException("connection closed"); if (c != '\r') b.write(c); if (b.size() > 16384) throw new IOException("line too long"); }
        return new String(b.toByteArray(), StandardCharsets.UTF_8);
    }
    static void readHeaders(InputStream in, Map<String, String> h) throws IOException {
        for (String l; !(l = readLine(in)).isEmpty(); ) { int c = l.indexOf(':'); if (c > 0) h.put(l.substring(0, c).trim(), l.substring(c + 1).trim()); }
    }
    static byte[] readBody(InputStream in, String cl) throws IOException {
        int n = 0; try { n = cl == null ? 0 : Integer.parseInt(cl.trim()); } catch (NumberFormatException e) { /* none */ }
        if (n < 0 || n > 8 << 20) throw new IOException("bad length");
        return readN(in, n);
    }
    static byte[] format(String first, Map<String, String> headers, byte[] body) {
        StringBuilder s = new StringBuilder(first);
        for (Map.Entry<String, String> e : headers.entrySet()) s.append("\r\n").append(e.getKey()).append(": ").append(e.getValue());
        if (body != null && body.length > 0) s.append("\r\nContent-Length: ").append(body.length);
        s.append("\r\n\r\n");
        return body == null ? utf8(s.toString()) : cat(utf8(s.toString()), body);
    }

    static final class Conn implements AutoCloseable {
        final Socket sock; final InetAddress host; final int port;
        InputStream in; OutputStream out; Hap hap;
        int cseq = 0; final long rtspSession = RNG.nextInt() & 0xffffffffL;
        final String dacp = String.format(Locale.US, "%016X", RNG.nextLong()), active = Long.toString(RNG.nextInt() & 0xffffffffL);
        Conn(InetAddress host, int port, int timeoutMs) throws IOException {
            this.host = host; this.port = port;
            sock = new Socket(); sock.setTcpNoDelay(true); sock.setKeepAlive(true);
            sock.connect(new InetSocketAddress(host, port), timeoutMs);
            sock.setSoTimeout(25000);
            in = sock.getInputStream(); out = sock.getOutputStream();
        }
        void encrypt(byte[] outKey, byte[] inKey) throws IOException { hap = new Hap(outKey, inKey); in = new HapIn(sock.getInputStream(), hap); }
        String localIp() { InetAddress a = sock.getLocalAddress(); String s = a.getHostAddress(); int z = s.indexOf('%'); return z > 0 ? s.substring(0, z) : s; }
        synchronized Resp send(String method, String uri, String proto, Map<String, String> hdrs, byte[] body) throws IOException {
            Map<String, String> h = new LinkedHashMap<>();
            if (hdrs == null || !hdrs.containsKey("User-Agent")) h.put("User-Agent", "AirPlay/550.10");
            if (hdrs != null) h.putAll(hdrs);
            byte[] msg = format(method + " " + uri + " " + proto, h, body);
            out.write(hap != null ? hap.seal(msg) : msg); out.flush();
            Resp r = new Resp();
            String first = readLine(in);
            String[] p = first.split(" ", 3);
            if (p.length < 2) throw new IOException("bad response: " + first);
            try { r.code = Integer.parseInt(p[1]); } catch (NumberFormatException e) { throw new IOException("bad response: " + first); }
            r.status = p.length > 2 ? p[2] : "";
            readHeaders(in, r.headers);
            r.body = readBody(in, r.header("Content-Length"));
            return r;
        }
        Resp http(String method, String path, Map<String, String> h, byte[] body) throws IOException { return send(method, path, "HTTP/1.1", h, body); }
        /** RTSP request in Apple's style (CSeq, DACP-ID, Active-Remote, Client-Instance) */
        Resp rtsp(String method, String uri, Map<String, String> extra, byte[] body, String contentType) throws IOException {
            Map<String, String> h = new LinkedHashMap<>();
            if (contentType != null) h.put("Content-Type", contentType);
            h.put("CSeq", Integer.toString(cseq++)); h.put("DACP-ID", dacp); h.put("Active-Remote", active); h.put("Client-Instance", dacp);
            if (extra != null) h.putAll(extra);
            return send(method, uri == null ? "rtsp://" + localIp() + "/" + rtspSession : uri, "RTSP/1.0", h, body);
        }
        @Override public void close() { try { sock.close(); } catch (IOException e) { /* gone */ } }
    }

    static Map<String, String> pairHeaders(int hkp) {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("User-Agent", "AirPlay/320.20"); h.put("Connection", "keep-alive"); h.put("X-Apple-HKP", Integer.toString(hkp)); h.put("Content-Type", "application/octet-stream");
        return h;
    }
    static Map<Integer, byte[]> pairStep(Conn c, String path, byte[] body, int hkp) throws IOException {
        Resp r = c.http("POST", path, pairHeaders(hkp), body);
        if (r.code == 470 || r.code == 403 || r.code == 401) throw new AuthException("the TV refused (" + r.code + ")");
        if (r.code != 200) throw new IOException(path + " answered " + r.code);
        Map<Integer, byte[]> m = tlvRead(r.body);
        if (m.containsKey(T_ERROR)) {
            int e = m.get(T_ERROR).length > 0 ? m.get(T_ERROR)[0] : 1;
            if (e == 2) throw new WrongPin();
            throw new AuthException(e == 3 || e == 5 ? "too many tries, wait a minute and try again" : e == 4 ? "the TV has too many paired devices" : e == 7 ? "the TV is busy pairing with another device" : "the TV refused (error " + e + ")");
        }
        return m;
    }

    // ------------------------------------------------------------------ pairing
    /** Starts PIN pairing: the TV shows a 4-digit code. Keep the connection for finishPairing. */
    static Map<Integer, byte[]> startPairing(Conn c) throws IOException {
        c.http("POST", "/pair-pin-start", pairHeaders(3), null);
        Map<Integer, byte[]> m2 = pairStep(c, "/pair-setup", tlv(T_METHOD, b1(0), T_STATE, b1(1)), 3);
        if (m2.get(T_SALT) == null || m2.get(T_PUB) == null) throw new AuthException("the TV did not start pairing");
        return m2;
    }
    static Creds finishPairing(Conn c, Map<Integer, byte[]> m2, String pin) throws IOException {
        Srp srp = new Srp(pin, m2.get(T_SALT), m2.get(T_PUB));
        Map<Integer, byte[]> m4 = pairStep(c, "/pair-setup", tlv(T_STATE, b1(3), T_PUB, srp.pubA, T_PROOF, srp.proof), 3);
        byte[] sp = m4.get(T_PROOF);
        if (sp != null && !MessageDigest.isEqual(sp, srp.expectServer)) throw new AuthException("the TV's answer did not check out");
        byte[] seed = random(32), myPub = edPublic(seed), myId = utf8(UUID.randomUUID().toString());
        byte[] signKey = hkdf("Pair-Setup-Controller-Sign-Salt", "Pair-Setup-Controller-Sign-Info", srp.key);
        byte[] encKey = hkdf("Pair-Setup-Encrypt-Salt", "Pair-Setup-Encrypt-Info", srp.key);
        byte[] sig = edSign(seed, cat(signKey, myId, myPub));
        byte[] enc = seal(encKey, nonce("PS-Msg05"), null, tlv(T_ID, myId, T_PUB, myPub, T_SIG, sig));
        Map<Integer, byte[]> m6 = pairStep(c, "/pair-setup", tlv(T_STATE, b1(5), T_ENC, enc), 3);
        if (m6.get(T_ENC) == null) throw new AuthException("the TV did not finish pairing");
        Map<Integer, byte[]> dev = tlvRead(open(encKey, nonce("PS-Msg06"), null, m6.get(T_ENC)));
        byte[] tvId = dev.get(T_ID), tvPub = dev.get(T_PUB), tvSig = dev.get(T_SIG);
        if (tvId == null || tvPub == null || tvPub.length != 32) throw new AuthException("the TV did not finish pairing");
        // (the TV's M6 signature isn't checked, as in pyatv: the code typed on the phone already proved it's this TV,
        // and pair-verify checks the TV's key on every connection after this)
        return new Creds(tvPub, seed, tvId, myId);
    }
    /** Transient pairing (TVs that let everyone AirPlay): fixed code 3939, nothing saved. Returns the shared secret. */
    static byte[] transientPair(Conn c) throws IOException {
        c.http("POST", "/pair-pin-start", pairHeaders(4), null);
        Map<Integer, byte[]> m2 = pairStep(c, "/pair-setup", tlv(T_METHOD, b1(0), T_STATE, b1(1), T_FLAGS, b1(0x10)), 4);
        if (m2.get(T_SALT) == null || m2.get(T_PUB) == null) throw new AuthException("no transient pairing");
        Srp srp = new Srp("3939", m2.get(T_SALT), m2.get(T_PUB));
        Map<Integer, byte[]> m4 = pairStep(c, "/pair-setup", tlv(T_STATE, b1(3), T_PUB, srp.pubA, T_PROOF, srp.proof), 4);
        byte[] sp = m4.get(T_PROOF);
        if (sp == null || !MessageDigest.isEqual(sp, srp.expectServer)) throw new AuthException("no transient pairing");
        return srp.key;
    }
    /** pair-verify with saved credentials; returns the shared secret the session keys come from. */
    static byte[] verify(Conn c, Creds cr) throws IOException {
        byte[] priv = random(32), pub = x25519Base(priv);
        Map<Integer, byte[]> m2 = pairStep(c, "/pair-verify", tlv(T_STATE, b1(1), T_PUB, pub), 3);
        byte[] tvEph = m2.get(T_PUB), enc = m2.get(T_ENC);
        if (tvEph == null || enc == null) throw new AuthException("the TV did not answer pair-verify");
        byte[] shared = x25519(priv, tvEph);
        byte[] key = hkdf("Pair-Verify-Encrypt-Salt", "Pair-Verify-Encrypt-Info", shared);
        Map<Integer, byte[]> dev = tlvRead(open(key, nonce("PV-Msg02"), null, enc));
        byte[] id = dev.get(T_ID), sig = dev.get(T_SIG);
        if (id == null || !Arrays.equals(id, cr.tvId)) throw new AuthException("this is not the TV we paired with");
        if (!edVerify(cr.tvPub, cat(tvEph, id, pub), sig)) throw new AuthException("the TV's signature did not check out");
        byte[] mine = edSign(cr.seed, cat(pub, cr.myId, tvEph));
        byte[] m3 = seal(key, nonce("PV-Msg03"), null, tlv(T_ID, cr.myId, T_SIG, mine));
        pairStep(c, "/pair-verify", tlv(T_STATE, b1(3), T_ENC, m3), 3);
        return shared;
    }

    /** 1.12.2: asks a receiver at a known address what it is (GET /info, no pairing needed), for "Add a TV by its
     *  address". Returns name, model, deviceID and features ("0xLO,0xHI"), or null when nothing AirPlay answers there. */
    static Map<String, String> info(InetAddress host, int port) {
        for (String proto : new String[] { "HTTP/1.1", "RTSP/1.0" }) {
            try (Conn c = new Conn(host, port, 4000)) {
                c.sock.setSoTimeout(5000);
                Map<String, String> h = new LinkedHashMap<>();
                h.put("User-Agent", "AirPlay/550.10"); h.put("X-Apple-ProtocolVersion", "1");
                if (proto.startsWith("RTSP")) h.put("CSeq", "0");
                Resp r = c.send("GET", "/info", proto, h, null);
                if (r.code != 200) continue;
                Object o = plistRead(r.body);
                if (!(o instanceof Map)) continue;
                Map<?, ?> d = (Map<?, ?>) o;
                Map<String, String> out = new LinkedHashMap<>();
                Object f = d.get("features");
                if (f instanceof Number) { long v = ((Number) f).longValue(); out.put("features", String.format(Locale.US, "0x%X,0x%X", v & 0xffffffffL, v >>> 32)); }
                for (String k : new String[] { "name", "model", "deviceID" }) if (d.get(k) != null) out.put(k, String.valueOf(d.get(k)));
                out.put("flags", d.get("statusFlags") instanceof Number ? String.format(Locale.US, "0x%X", ((Number) d.get("statusFlags")).longValue()) : "0x4");
                return out;
            } catch (Exception e) { /* try the other way, then give up */ }
        }
        return null;
    }

    static boolean feature(String features, int bit) {
        if (features == null) return false;
        try {
            String[] p = features.trim().split(",");
            long lo = Long.parseLong(p[0].trim().replaceFirst("(?i)^0x", ""), 16), hi = p.length > 1 ? Long.parseLong(p[1].trim().replaceFirst("(?i)^0x", ""), 16) : 0;
            long v = (hi << 32) | (lo & 0xffffffffL);
            return ((v >>> bit) & 1) == 1;
        } catch (Exception e) { return false; }
    }

    // ------------------------------------------------------------------ a playing session
    interface Events {
        /** the TV shows a code: return what the person typed (null = cancelled) */
        String askPin(boolean again) throws InterruptedException;
        void paired(Creds c);
        void forget();
        /** connecting, playing, paused, ended, error */
        void state(String state, double pos, double dur, String msg);
    }

    /** 1.12.1: what every kind of TV session (AirPlay, Chromecast, DLNA) offers the service */
    interface Player extends Runnable { void command(String cmd, String arg); void stop(); Events events(); }

    /** Runs one film on one TV until it ends, is stopped, or the connection drops. Call run() on its own thread. */
    static final class Session implements Player {
        final InetAddress host; final int port; final String features, flags; final String url; final double start; final Events ev;
        Creds creds;
        final LinkedBlockingQueue<String[]> cmds = new LinkedBlockingQueue<>();
        volatile boolean stopped; volatile double pos, dur; volatile boolean paused;
        Conn conn; Socket events; DatagramSocket timing;

        Session(InetAddress host, int port, String features, String flags, Creds creds, String url, double start, Events ev) {
            this.host = host; this.port = port; this.features = features; this.flags = flags; this.creds = creds; this.url = url; this.start = start; this.ev = ev;
        }
        @Override public Events events() { return ev; }
        @Override public void command(String cmd, String arg) { cmds.offer(new String[] { cmd, arg == null ? "" : arg }); }
        @Override public void stop() { stopped = true; cmds.offer(new String[] { "stop", "" }); }

        boolean pinRequired() { try { return (Long.decode(flags == null ? "0" : flags) & 0x8) != 0; } catch (Exception e) { return false; } }

        /** pair or verify, and switch the connection to encrypted; returns the secret for the other channels */
        byte[] login() throws IOException, InterruptedException {
            if (creds != null) {
                conn = new Conn(host, port, 8000);
                try { return verify(conn, creds); }
                catch (AuthException e) { conn.close(); creds = null; ev.forget(); }
            }
            if (!pinRequired()) {
                conn = new Conn(host, port, 8000);
                try { return transientPair(conn); } catch (IOException e) { conn.close(); }
            }
            boolean again = false;
            for (int tries = 0; tries < 3 && !stopped; tries++) {
                conn = new Conn(host, port, 8000);
                Map<Integer, byte[]> m2 = startPairing(conn);
                conn.sock.setSoTimeout(0);
                ev.state("pin", 0, 0, null);
                String pin = ev.askPin(again);
                conn.sock.setSoTimeout(25000);
                if (pin == null || stopped) { conn.close(); throw new InterruptedException("cancelled"); }
                try { creds = finishPairing(conn, m2, pin.trim()); }
                catch (WrongPin w) { conn.close(); again = true; continue; }
                conn.close();
                ev.paired(creds);
                ev.state("connecting", 0, 0, null);
                conn = new Conn(host, port, 8000);
                return verify(conn, creds);
            }
            throw new AuthException(again ? "the code did not match" : "pairing was cancelled");
        }

        @Override public void run() {
            try {
                ev.state("connecting", 0, 0, null);
                byte[] secret = login();
                conn.encrypt(hkdf("Control-Salt", "Control-Write-Encryption-Key", secret), hkdf("Control-Salt", "Control-Read-Encryption-Key", secret));
                boolean v2 = feature(features, F_UNIFIED_MEDIA) || feature(features, F_COREUTILS_PAIRING);
                String sid = UUID.randomUUID().toString().toLowerCase(Locale.US);
                Map<String, String> h = new LinkedHashMap<>();
                h.put("Content-Type", "application/x-apple-binary-plist"); h.put("X-Apple-ProtocolVersion", "1"); h.put("X-Apple-Session-ID", sid); h.put("X-Apple-Stream-ID", "1");
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("Content-Location", url);
                if (v2) {
                    setupV2(secret);
                    body.put("Start-Position-Seconds", start); body.put("uuid", UUID.randomUUID().toString().toUpperCase(Locale.US));
                    body.put("streamType", 1); body.put("mediaType", "file"); body.put("volume", 1.0); body.put("rate", 1.0);
                    body.put("clientBundleID", "com.mkcinema.app"); body.put("clientProcName", "MKCinema");
                } else {
                    body.put("Start-Position", 0.0); body.put("Start-Position-Seconds", start); body.put("X-Apple-Session-ID", sid);
                }
                Resp r = null;
                for (int i = 0; i < 3; i++) {
                    r = conn.http("POST", "/play", h, plist(body));
                    if (r.code != 500) break;
                    Thread.sleep(1000);
                }
                if (r == null || r.code >= 400) throw new IOException("the TV refused the video (" + (r == null ? 0 : r.code) + ")");
                if (v2) {
                    put("/setProperty?isInterestedInDateRange", true);
                    put("/setProperty?actionAtItemEnd", 0);
                    conn.rtsp("POST", "/rate?value=1.000000", null, null, null);
                }
                loop(v2);
            } catch (InterruptedException e) {
                ev.state("ended", pos, dur, null);
            } catch (Exception e) {
                if (stopped) ev.state("ended", pos, dur, null);
                else ev.state("error", pos, dur, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            } finally { close(); }
        }

        void put(String uri, Object value) throws IOException {
            Map<String, Object> b = new LinkedHashMap<>(); b.put("value", value);
            conn.rtsp("PUT", uri, null, plist(b), "application/x-apple-binary-plist");
        }

        void setupV2(byte[] secret) throws IOException, InterruptedException {
            timing = new DatagramSocket(0);
            final DatagramSocket ts = timing;
            Thread t = new Thread(() -> timingLoop(ts), "airplay-timing"); t.setDaemon(true); t.start();
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("deviceID", "AA:BB:CC:DD:EE:FF"); b.put("sessionUUID", UUID.randomUUID().toString().toUpperCase(Locale.US));
            b.put("timingPort", ts.getLocalPort()); b.put("timingProtocol", "NTP"); b.put("isMultiSelectAirPlay", true);
            b.put("groupContainsGroupLeader", false); b.put("macAddress", "AA:BB:CC:DD:EE:FF"); b.put("model", "iPhone14,3");
            b.put("name", "MKCinema"); b.put("osBuildVersion", "20F66"); b.put("osName", "iPhone OS"); b.put("osVersion", "16.5");
            b.put("senderSupportsRelay", false); b.put("sourceVersion", "690.7.1"); b.put("statsCollectionEnabled", false);
            Resp r = conn.rtsp("SETUP", null, null, plist(b), "application/x-apple-binary-plist");
            if (r.code >= 400) throw new IOException("the TV refused the session (" + r.code + ")");
            Object o = plistRead(r.body);
            int ep = o instanceof Map ? (int) num(((Map<?, ?>) o).get("eventPort"), 0) : 0;
            if (ep > 0) {
                // our side writes with the "Read" key on this channel (named from the TV's point of view)
                byte[] outK = hkdf("Events-Salt", "Events-Read-Encryption-Key", secret), inK = hkdf("Events-Salt", "Events-Write-Encryption-Key", secret);
                for (int i = 0; i < 5 && events == null; i++) {
                    try { Socket s = new Socket(); s.connect(new InetSocketAddress(host, ep), 5000); events = s; }
                    catch (IOException e) { if (i == 4) throw e; Thread.sleep(1000); }
                }
                final Socket es = events; final Hap hap = new Hap(outK, inK);
                Thread t2 = new Thread(() -> eventLoop(es, hap), "airplay-events"); t2.setDaemon(true); t2.start();
            }
            conn.rtsp("RECORD", null, null, null, null);
        }

        /** answers the TV's NTP-style timing requests (32-byte packets) */
        static void timingLoop(DatagramSocket s) {
            byte[] buf = new byte[128];
            while (!s.isClosed()) {
                try {
                    DatagramPacket p = new DatagramPacket(buf, buf.length); s.receive(p);
                    if (p.getLength() < 32) continue;
                    byte[] q = Arrays.copyOf(p.getData(), 32), o = new byte[32];
                    o[0] = q[0]; o[1] = (byte) 0xd3; o[2] = 0; o[3] = 7;
                    System.arraycopy(q, 24, o, 8, 8); // their send time becomes the reference time
                    long[] now = ntpNow(); writeNtp(o, 16, now); writeNtp(o, 24, now);
                    s.send(new DatagramPacket(o, 32, p.getSocketAddress()));
                } catch (IOException e) { if (s.isClosed()) return; }
            }
        }
        static long[] ntpNow() { long ms = System.currentTimeMillis(); return new long[] { ms / 1000 + 2208988800L, ((ms % 1000) << 32) / 1000 }; }
        static void writeNtp(byte[] o, int at, long[] t) { for (int i = 0; i < 4; i++) { o[at + i] = (byte) (t[0] >>> (8 * (3 - i))); o[at + 4 + i] = (byte) (t[1] >>> (8 * (3 - i))); } }

        /** the TV sends RTSP-style requests on the event channel; each gets a plain 200 */
        static void eventLoop(Socket s, Hap hap) {
            try {
                InputStream in = new HapIn(s.getInputStream(), hap); OutputStream out = s.getOutputStream();
                while (!s.isClosed()) {
                    String first = readLine(in);
                    if (first.isEmpty()) continue;
                    Req q = new Req(); String[] p = first.split(" ");
                    q.method = p[0]; q.proto = p.length > 2 ? p[2] : "RTSP/1.0";
                    readHeaders(in, q.headers); q.body = readBody(in, q.header("Content-Length"));
                    Map<String, String> h = new LinkedHashMap<>();
                    h.put("Content-Length", "0"); h.put("Audio-Latency", "0");
                    if (q.header("Server") != null) h.put("Server", q.header("Server"));
                    if (q.header("CSeq") != null) h.put("CSeq", q.header("CSeq"));
                    synchronized (hap) { out.write(hap.seal(format(q.proto + " 200 OK", h, null))); out.flush(); }
                }
            } catch (IOException e) { /* channel closed */ }
        }

        void loop(boolean v2) throws IOException, InterruptedException {
            boolean started = false; int idle = 0; long lastFeedback = 0, lastInfo = 0; boolean seeked = start < 5;
            while (true) {
                String[] c = cmds.poll(250, TimeUnit.MILLISECONDS);
                if (c != null) {
                    switch (c[0]) {
                        case "stop":
                            try { conn.http("POST", "/stop", null, null); } catch (IOException e) { /* closing anyway */ }
                            throw new InterruptedException("stopped");
                        case "pause": rate(v2, 0); paused = true; break;
                        case "play": rate(v2, 1); paused = false; break;
                        case "seek": scrub(v2, Double.parseDouble(c[1])); break;
                        default: break;
                    }
                    lastInfo = 0;
                }
                long now = System.currentTimeMillis();
                if (v2 && now - lastFeedback > 2000) { lastFeedback = now; try { conn.rtsp("POST", "/feedback", null, null, null); } catch (IOException e) { throw e; } }
                if (now - lastInfo < 1000) continue;
                lastInfo = now;
                Resp r = conn.http("GET", "/playback-info", null, null);
                Object o = plistRead(r.body);
                Map<?, ?> m = o instanceof Map ? (Map<?, ?>) o : null;
                if (m != null && m.get("error") instanceof Map) {
                    Map<?, ?> e = (Map<?, ?>) m.get("error");
                    throw new IOException("the TV could not play this video (" + e.get("code") + ")");
                }
                if (m != null && m.containsKey("duration")) {
                    started = true; idle = 0;
                    dur = num(m.get("duration"), 0); pos = num(m.get("position"), pos);
                    double rate = num(m.get("rate"), 1); paused = rate == 0;
                    if (!seeked && dur > 0 && pos < start - 5) { seeked = true; scrub(v2, start); }
                    else if (!seeked && dur > 0) seeked = true;
                    ev.state(paused ? "paused" : "playing", pos, dur, null);
                } else if (++idle > (started ? 5 : 30)) {
                    if (started) { ev.state("ended", pos, dur, null); return; }
                    throw new IOException("the TV did not start the video");
                }
            }
        }
        void rate(boolean v2, double r) throws IOException {
            String u = String.format(Locale.US, "/rate?value=%f", r);
            if (v2) conn.rtsp("POST", u, null, null, null); else conn.http("POST", u, null, null);
        }
        void scrub(boolean v2, double at) throws IOException {
            String u = String.format(Locale.US, "/scrub?position=%f", Math.max(0, at));
            if (v2) conn.rtsp("POST", u, null, null, null); else conn.http("POST", u, null, null);
            pos = at;
        }
        void close() {
            if (conn != null) conn.close();
            try { if (events != null) events.close(); } catch (IOException e) { /* gone */ }
            if (timing != null) timing.close();
        }
    }
}
