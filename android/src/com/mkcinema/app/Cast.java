package com.mkcinema.app;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * 1.12.1: Chromecast and Google TV (and TVs with Chromecast built in) from the Android app, no Google library needed.
 *
 * Cast devices speak "CASTV2": length-prefixed protobuf messages over TLS on port 8009, each carrying a JSON payload
 * in a namespace. The phone opens Google's Default Media Receiver (app CC1AD845) on the TV and LOADs the stream link;
 * the TV fetches and plays it itself, as the Chrome sender does. The TV's certificate is self-signed by the device, so
 * it can't be checked against a public CA here (only Google's private device CA, which isn't published); the link and
 * commands are the only things sent, and the session stays on the home Wi-Fi.
 */
final class Cast {
    private Cast() {}

    static final String NS_CONN = "urn:x-cast:com.google.cast.tp.connection", NS_BEAT = "urn:x-cast:com.google.cast.tp.heartbeat",
        NS_RECV = "urn:x-cast:com.google.cast.receiver", NS_MEDIA = "urn:x-cast:com.google.cast.media";
    static final String APP = "CC1AD845", ME = "sender-mkc";

    // ---------------------------------------------------------------- CastMessage protobuf
    static byte[] frame(String src, String dst, String ns, String json) {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        b.write(0x08); b.write(0);                 // protocol_version CASTV2_1_0
        str(b, 0x12, src); str(b, 0x1a, dst); str(b, 0x22, ns);
        b.write(0x28); b.write(0);                 // payload_type STRING
        str(b, 0x32, json);
        byte[] m = b.toByteArray(); int n = m.length;
        byte[] o = new byte[n + 4]; o[0] = (byte) (n >>> 24); o[1] = (byte) (n >>> 16); o[2] = (byte) (n >>> 8); o[3] = (byte) n;
        System.arraycopy(m, 0, o, 4, n); return o;
    }
    static void str(ByteArrayOutputStream b, int tag, String s) {
        byte[] v = s.getBytes(StandardCharsets.UTF_8); b.write(tag); varint(b, v.length); b.write(v, 0, v.length);
    }
    static void varint(ByteArrayOutputStream b, long v) { while ((v & ~0x7fL) != 0) { b.write((int) ((v & 0x7f) | 0x80)); v >>>= 7; } b.write((int) v); }
    /** [source, destination, namespace, payload] */
    static String[] unframe(byte[] m) {
        String[] f = new String[4]; int i = 0;
        while (i < m.length) {
            long key = 0; int sh = 0; int c;
            do { c = m[i++] & 0xff; key |= (long) (c & 0x7f) << sh; sh += 7; } while ((c & 0x80) != 0 && i < m.length);
            int field = (int) (key >>> 3), wt = (int) (key & 7);
            if (wt == 0) { do { c = m[i++] & 0xff; } while ((c & 0x80) != 0 && i < m.length); }
            else if (wt == 2) {
                long len = 0; sh = 0;
                do { c = m[i++] & 0xff; len |= (long) (c & 0x7f) << sh; sh += 7; } while ((c & 0x80) != 0 && i < m.length);
                String v = new String(m, i, (int) len, StandardCharsets.UTF_8); i += (int) len;
                if (field == 2) f[0] = v; else if (field == 3) f[1] = v; else if (field == 4) f[2] = v; else if (field == 6) f[3] = v;
            } else if (wt == 5) i += 4; else if (wt == 1) i += 8; else break;
        }
        return f;
    }

    static SSLSocket open(InetAddress host, int port) throws IOException {
        try {
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[] { new X509TrustManager() {
                @Override public void checkClientTrusted(X509Certificate[] c, String a) { }
                @Override public void checkServerTrusted(X509Certificate[] c, String a) { }   // self-signed by the device (see above)
                @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            } }, null);
            Socket raw = new Socket(); raw.connect(new InetSocketAddress(host, port), 8000);
            SSLSocket s = (SSLSocket) ctx.getSocketFactory().createSocket(raw, host.getHostAddress(), port, true);
            s.setSoTimeout(0); s.startHandshake(); return s;
        } catch (IOException e) { throw e; } catch (Exception e) { throw new IOException(e.getMessage(), e); }
    }

    static String type(String url) {
        String u = url.toLowerCase(Locale.US);
        return u.contains(".m3u8") ? "application/x-mpegURL" : u.contains(".mkv") ? "video/x-matroska" : u.contains(".webm") ? "video/webm" : "video/mp4";
    }

    /** One film on one Cast device. */
    static final class Session implements AirPlay.Player {
        final InetAddress host; final int port; final String url, title; final double start; final AirPlay.Events ev;
        final LinkedBlockingQueue<String[]> in = new LinkedBlockingQueue<>(), cmds = new LinkedBlockingQueue<>();
        SSLSocket sock; OutputStream out; volatile boolean stopped; int req = 1;
        String transport, appSession; long mediaSession = -1; double pos, dur; String player = "";

        Session(InetAddress host, int port, String url, String title, double start, AirPlay.Events ev) {
            this.host = host; this.port = port; this.url = url; this.title = title; this.start = start; this.ev = ev;
        }
        @Override public AirPlay.Events events() { return ev; }
        @Override public void command(String cmd, String arg) { cmds.offer(new String[] { cmd, arg == null ? "" : arg }); }
        @Override public void stop() { stopped = true; cmds.offer(new String[] { "stop", "" }); }

        synchronized void send(String dst, String ns, String json) throws IOException { out.write(frame(ME, dst, ns, json)); out.flush(); }

        @Override public void run() {
            try {
                ev.state("connecting", 0, 0, null);
                sock = open(host, port); out = sock.getOutputStream();
                final DataInputStream din = new DataInputStream(sock.getInputStream());
                Thread rd = new Thread(() -> {
                    try { while (true) { int n = din.readInt(); if (n < 0 || n > 1 << 20) break; byte[] m = new byte[n]; din.readFully(m); in.offer(unframe(m)); } }
                    catch (IOException e) { /* closed */ }
                    in.offer(new String[] { null, null, "closed", null });
                }, "cast-read");
                rd.setDaemon(true); rd.start();
                send("receiver-0", NS_CONN, "{\"type\":\"CONNECT\"}");
                send("receiver-0", NS_RECV, "{\"type\":\"LAUNCH\",\"appId\":\"" + APP + "\",\"requestId\":" + (req++) + "}");
                long deadline = System.currentTimeMillis() + 20000;
                while (transport == null) {
                    if (System.currentTimeMillis() > deadline) throw new IOException("the TV did not open its player");
                    String[] m = next(500);
                    if (m != null && "closed".equals(m[2])) throw new IOException("the TV closed the connection");
                    if (stopped) throw new InterruptedException("stopped");
                }
                send(transport, NS_CONN, "{\"type\":\"CONNECT\"}");
                send(transport, NS_MEDIA, "{\"type\":\"LOAD\",\"requestId\":" + (req++) + ",\"autoplay\":true,\"currentTime\":" + Math.max(0, start)
                    + ",\"media\":{\"contentId\":" + Json.q(url) + ",\"contentType\":" + Json.q(type(url)) + ",\"streamType\":\"BUFFERED\",\"metadata\":{\"metadataType\":0,\"title\":" + Json.q(title) + ",\"subtitle\":\"MKCinema\"}}}");
                loop();
            } catch (InterruptedException e) {
                ev.state("ended", pos, dur, null);
            } catch (Exception e) {
                if (stopped) ev.state("ended", pos, dur, null);
                else ev.state("error", pos, dur, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            } finally { try { if (sock != null) sock.close(); } catch (IOException e) { /* gone */ } }
        }

        long lastBeat, lastStatus; boolean started; int idleTicks;

        /** waits for one message (up to ms) and handles what every state needs: PING, receiver status, close */
        String[] next(long ms) throws IOException, InterruptedException {
            long now = System.currentTimeMillis();
            if (now - lastBeat > 5000) { lastBeat = now; send("receiver-0", NS_BEAT, "{\"type\":\"PING\"}"); }
            String[] m = in.poll(ms, TimeUnit.MILLISECONDS);
            if (m == null || m[3] == null) return m;
            Object j = Json.parse(m[3]); String t = Json.str(j, "type");
            if (NS_BEAT.equals(m[2]) && "PING".equals(t)) send(m[0], NS_BEAT, "{\"type\":\"PONG\"}");
            else if (NS_CONN.equals(m[2]) && "CLOSE".equals(t) && transport != null && transport.equals(m[0])) throw new InterruptedException("closed on the TV");
            else if (NS_RECV.equals(m[2]) && "RECEIVER_STATUS".equals(t)) {
                Object apps = Json.get(j, "status", "applications");
                String tid = null, sid = null;
                if (apps instanceof List) for (Object a : (List<?>) apps) if (APP.equals(Json.str(a, "appId"))) { tid = Json.str(a, "transportId"); sid = Json.str(a, "sessionId"); }
                if (tid != null) { if (transport == null) { transport = tid; appSession = sid; } }
                else if (transport != null && started) throw new InterruptedException("closed on the TV");
            } else if (NS_RECV.equals(m[2]) && "LAUNCH_ERROR".equals(t)) throw new IOException("the TV could not open its player (" + Json.str(j, "reason") + ")");
            else if (NS_MEDIA.equals(m[2])) media(t, j);
            return m;
        }

        void media(String t, Object j) throws IOException, InterruptedException {
            if ("LOAD_FAILED".equals(t) || "LOAD_CANCELLED".equals(t) || "INVALID_REQUEST".equals(t)) throw new IOException("the TV could not play this video (" + t + ")");
            if (!"MEDIA_STATUS".equals(t)) return;
            Object st = Json.get(j, "status", 0);
            if (st == null) { if (started && ++idleTicks > 3) throw new InterruptedException("finished"); return; }
            mediaSession = (long) Json.num(st, mediaSession, "mediaSessionId");
            pos = Json.num(st, pos, "currentTime"); dur = Json.num(st, dur, "media", "duration");
            player = String.valueOf(Json.str(st, "playerState"));
            if ("IDLE".equals(player)) {
                String why = Json.str(st, "idleReason");
                if ("ERROR".equals(why)) throw new IOException("the TV could not play this video");
                if (why != null && started) throw new InterruptedException("finished");
                return;
            }
            started = true; idleTicks = 0;
            ev.state("PAUSED".equals(player) ? "paused" : "playing", pos, dur, null);
        }

        void loop() throws IOException, InterruptedException {
            long begun = System.currentTimeMillis();
            while (true) {
                String[] c = cmds.poll();
                if (c != null) {
                    String ms = ",\"mediaSessionId\":" + mediaSession + ",\"requestId\":" + (req++);
                    switch (c[0]) {
                        case "stop":
                            try { if (mediaSession >= 0) send(transport, NS_MEDIA, "{\"type\":\"STOP\"" + ms + "}");
                                  if (appSession != null) send("receiver-0", NS_RECV, "{\"type\":\"STOP\",\"sessionId\":" + Json.q(appSession) + ",\"requestId\":" + (req++) + "}"); }
                            catch (IOException e) { /* closing anyway */ }
                            throw new InterruptedException("stopped");
                        case "pause": if (mediaSession >= 0) send(transport, NS_MEDIA, "{\"type\":\"PAUSE\"" + ms + "}"); break;
                        case "play": if (mediaSession >= 0) send(transport, NS_MEDIA, "{\"type\":\"PLAY\"" + ms + "}"); break;
                        case "seek": if (mediaSession >= 0) { try { pos = Double.parseDouble(c[1]); } catch (NumberFormatException e) { break; } send(transport, NS_MEDIA, "{\"type\":\"SEEK\",\"currentTime\":" + pos + ms + "}"); } break;
                        default: break;
                    }
                }
                long now = System.currentTimeMillis();
                if (now - lastStatus > 1000) {
                    lastStatus = now;
                    send(transport, NS_MEDIA, "{\"type\":\"GET_STATUS\",\"requestId\":" + (req++) + (mediaSession >= 0 ? ",\"mediaSessionId\":" + mediaSession : "") + "}");
                    if (!started && now - begun > 45000) throw new IOException("the TV did not start the video");
                }
                String[] m = next(200);
                if (m != null && "closed".equals(m[2])) {
                    if (started) throw new InterruptedException("closed");
                    throw new IOException("the TV closed the connection");
                }
            }
        }
    }
}
