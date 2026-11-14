package com.mkcinema.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 1.12.1: smart TVs that accept "Play to" / DLNA (most Samsung, LG, Sony, Philips, Hisense and many others).
 *
 * Discovery is UPnP SSDP (a multicast M-SEARCH for AVTransport, then each TV's description XML). Playback is plain
 * SOAP over HTTP: SetAVTransportURI with the stream link, Play, then GetTransportInfo / GetPositionInfo once a second.
 * The TV fetches the link itself. Uses raw sockets, so no extra library and no cleartext-traffic setting is needed.
 */
final class Dlna {
    private Dlna() {}

    static final String AVT = "urn:schemas-upnp-org:service:AVTransport:1";

    /** A TV found on the Wi-Fi. */
    static final class Renderer {
        String udn, name, model, maker, control; InetAddress host;
    }
    interface Found { void found(Renderer r); }

    // ---------------------------------------------------------------- discovery
    /** Sends M-SEARCH twice and reports every renderer that answers within ms. Blocks; run it on a thread. */
    static void discover(int ms, Found cb) {
        Set<String> seen = new HashSet<>();
        DatagramSocket sock = null;
        try {
            sock = new DatagramSocket();
            sock.setSoTimeout(400);
            InetSocketAddress group = new InetSocketAddress("239.255.255.250", 1900);
            String[] targets = { AVT, "urn:schemas-upnp-org:device:MediaRenderer:1" };
            long end = System.currentTimeMillis() + ms, nextSend = 0; int sends = 0;
            byte[] buf = new byte[4096];
            while (System.currentTimeMillis() < end) {
                if (sends < 3 && System.currentTimeMillis() >= nextSend) {
                    for (String st : targets) {
                        byte[] q = ("M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: " + st + "\r\n\r\n").getBytes(StandardCharsets.US_ASCII);
                        sock.send(new DatagramPacket(q, q.length, group));
                    }
                    sends++; nextSend = System.currentTimeMillis() + 1500;
                }
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try { sock.receive(p); } catch (SocketTimeoutException e) { continue; }
                String loc = header(new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8), "location");
                if (loc == null || !seen.add(loc)) continue;
                try { Renderer r = describe(loc); if (r != null) cb.found(r); } catch (Exception e) { /* not a TV we can use */ }
            }
        } catch (IOException e) {
            /* no Wi-Fi */
        } finally { if (sock != null) sock.close(); }
    }

    static String header(String msg, String name) {
        for (String line : msg.split("\r?\n")) {
            int c = line.indexOf(':');
            if (c > 0 && line.substring(0, c).trim().equalsIgnoreCase(name)) return line.substring(c + 1).trim();
        }
        return null;
    }

    /** Reads a device description and returns it if it has an AVTransport service. */
    static Renderer describe(String location) throws IOException {
        Http r = Http.get(location, 4000);
        if (r.status != 200) return null;
        String x = r.body;
        String control = null;
        Matcher sm = Pattern.compile("<(?:\\w+:)?service>(.*?)</(?:\\w+:)?service>", Pattern.DOTALL).matcher(x);
        while (sm.find()) {
            String s = sm.group(1);
            if (s.contains("urn:schemas-upnp-org:service:AVTransport:")) { control = tag(s, "controlURL"); break; }
        }
        if (control == null) return null;
        String base = tag(x, "URLBase");
        URI b = URI.create(base != null && !base.isEmpty() ? base : location);
        Renderer d = new Renderer();
        d.control = b.resolve(control.trim()).toString();
        d.udn = tag(x, "UDN"); d.name = unxml(tag(x, "friendlyName")); d.model = unxml(tag(x, "modelName")); d.maker = unxml(tag(x, "manufacturer"));
        if (d.udn == null) d.udn = location;
        if (d.name == null || d.name.isEmpty()) d.name = d.model != null ? d.model : "TV";
        d.host = InetAddress.getByName(URI.create(d.control).getHost());
        return d;
    }

    static String tag(String x, String name) {
        Matcher m = Pattern.compile("<(?:\\w+:)?" + name + "(?:\\s[^>]*)?>(.*?)</(?:\\w+:)?" + name + ">", Pattern.DOTALL).matcher(x);
        return m.find() ? m.group(1).trim() : null;
    }
    static String xml(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;");
    }
    static String unxml(String s) {
        return s == null ? null : s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&");
    }

    // ---------------------------------------------------------------- a tiny HTTP/1.1 client (Connection: close)
    static final class Http {
        int status; String head = "", body = "";

        static Http get(String url, int timeout) throws IOException { return send("GET", url, null, null, timeout); }

        static Http send(String method, String url, String soapAction, String body, int timeout) throws IOException {
            URI u = URI.create(url);
            if (!"http".equalsIgnoreCase(u.getScheme())) throw new IOException("only http");
            int port = u.getPort() > 0 ? u.getPort() : 80;
            String path = u.getRawPath() == null || u.getRawPath().isEmpty() ? "/" : u.getRawPath();
            if (u.getRawQuery() != null) path += "?" + u.getRawQuery();
            byte[] b = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
            StringBuilder h = new StringBuilder(method).append(' ').append(path).append(" HTTP/1.1\r\nHost: ").append(u.getHost()).append(':').append(port)
                .append("\r\nConnection: close\r\nUser-Agent: MKCinema/1.12 UPnP/1.0 DLNADOC/1.50\r\n");
            if (soapAction != null) h.append("Content-Type: text/xml; charset=\"utf-8\"\r\nSOAPACTION: \"").append(soapAction).append("\"\r\n");
            if (body != null) h.append("Content-Length: ").append(b.length).append("\r\n");
            h.append("\r\n");
            try (Socket s = new Socket()) {
                s.connect(new InetSocketAddress(u.getHost(), port), timeout); s.setSoTimeout(timeout);
                OutputStream o = s.getOutputStream(); o.write(h.toString().getBytes(StandardCharsets.UTF_8)); o.write(b); o.flush();
                InputStream in = s.getInputStream();
                ByteArrayOutputStream all = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
                while ((n = in.read(buf)) > 0) { all.write(buf, 0, n); if (all.size() > 2 << 20) break; }
                return parse(all.toByteArray());
            }
        }

        static Http parse(byte[] raw) throws IOException {
            String all = new String(raw, StandardCharsets.ISO_8859_1);
            int split = all.indexOf("\r\n\r\n");
            if (split < 0) throw new IOException("bad reply");
            Http r = new Http();
            r.head = all.substring(0, split);
            String[] first = r.head.split("\r\n", 2)[0].split(" ");
            r.status = first.length > 1 ? Integer.parseInt(first[1].trim()) : 0;
            byte[] rest = java.util.Arrays.copyOfRange(raw, split + 4, raw.length);
            String te = header(r.head, "transfer-encoding");
            if (te != null && te.toLowerCase(Locale.US).contains("chunked")) rest = unchunk(rest);
            r.body = new String(rest, StandardCharsets.UTF_8);
            return r;
        }

        static byte[] unchunk(byte[] b) {
            ByteArrayOutputStream o = new ByteArrayOutputStream(); int i = 0;
            while (i < b.length) {
                int e = i; while (e + 1 < b.length && !(b[e] == '\r' && b[e + 1] == '\n')) e++;
                String sz = new String(b, i, e - i, StandardCharsets.US_ASCII).split(";")[0].trim();
                int n; try { n = Integer.parseInt(sz, 16); } catch (NumberFormatException x) { break; }
                if (n == 0) break;
                i = e + 2; if (i + n > b.length) n = b.length - i;
                o.write(b, i, n); i += n + 2;
            }
            return o.toByteArray();
        }
    }

    // ---------------------------------------------------------------- SOAP
    static String soap(String control, String action, String args) throws IOException {
        String env = "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body>"
            + "<u:" + action + " xmlns:u=\"" + AVT + "\"><InstanceID>0</InstanceID>" + args + "</u:" + action + "></s:Body></s:Envelope>";
        Http r = Http.send("POST", control, AVT + "#" + action, env, 8000);
        if (r.status != 200) {
            String code = tag(r.body, "errorCode"), desc = tag(r.body, "errorDescription");
            throw new IOException(action + " refused" + (code != null ? " (" + code + (desc != null ? " " + desc : "") + ")" : " (HTTP " + r.status + ")"));
        }
        return r.body;
    }

    static String mime(String url) {
        String u = url.toLowerCase(Locale.US);
        return u.contains(".m3u8") ? "application/vnd.apple.mpegurl" : u.contains(".mkv") ? "video/x-matroska" : u.contains(".webm") ? "video/webm" : "video/mp4";
    }
    static String didl(String url, String title) {
        return "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\">"
            + "<item id=\"1\" parentID=\"0\" restricted=\"1\"><dc:title>" + xml(title == null || title.isEmpty() ? "MKCinema" : title) + "</dc:title>"
            + "<upnp:class>object.item.videoItem.movie</upnp:class><res protocolInfo=\"http-get:*:" + mime(url) + ":*\">" + xml(url) + "</res></item></DIDL-Lite>";
    }
    static String hms(double t) {
        long s = Math.max(0, Math.round(t));
        return String.format(Locale.US, "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60);
    }
    static double secs(String t) {
        if (t == null || t.contains("NOT_IMPLEMENTED")) return 0;
        String[] p = t.trim().split(":"); double v = 0;
        try { for (String x : p) v = v * 60 + Double.parseDouble(x); } catch (NumberFormatException e) { return 0; }
        return v;
    }

    /** One film on one DLNA TV. */
    static final class Session implements AirPlay.Player {
        final String control, url, title; final double start; final AirPlay.Events ev;
        final LinkedBlockingQueue<String[]> cmds = new LinkedBlockingQueue<>();
        volatile boolean stopped; double pos, dur;

        Session(String control, String url, String title, double start, AirPlay.Events ev) {
            this.control = control; this.url = url; this.title = title; this.start = start; this.ev = ev;
        }
        @Override public AirPlay.Events events() { return ev; }
        @Override public void command(String cmd, String arg) { cmds.offer(new String[] { cmd, arg == null ? "" : arg }); }
        @Override public void stop() { stopped = true; cmds.offer(new String[] { "stop", "" }); }

        @Override public void run() {
            try {
                ev.state("connecting", 0, 0, null);
                try { soap(control, "Stop", ""); } catch (IOException e) { /* nothing was playing */ }
                soap(control, "SetAVTransportURI", "<CurrentURI>" + xml(url) + "</CurrentURI><CurrentURIMetaData>" + xml(didl(url, title)) + "</CurrentURIMetaData>");
                soap(control, "Play", "<Speed>1</Speed>");
                loop();
            } catch (InterruptedException e) {
                ev.state("ended", pos, dur, null);
            } catch (Exception e) {
                if (stopped) ev.state("ended", pos, dur, null);
                else ev.state("error", pos, dur, e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
            }
        }

        void loop() throws IOException, InterruptedException {
            long begun = System.currentTimeMillis(); boolean started = false, seeked = start < 5; int idle = 0, fails = 0;
            while (true) {
                String[] c = cmds.poll(1000, java.util.concurrent.TimeUnit.MILLISECONDS);
                if (c != null) {
                    // one refused pause, play or seek (some TVs answer an error while buffering) keeps the session
                    try {
                        switch (c[0]) {
                            case "stop": try { soap(control, "Stop", ""); } catch (IOException e) { /* closing anyway */ } throw new InterruptedException("stopped");
                            case "pause": soap(control, "Pause", ""); break;
                            case "play": soap(control, "Play", "<Speed>1</Speed>"); break;
                            case "seek": try { pos = Double.parseDouble(c[1]); soap(control, "Seek", "<Unit>REL_TIME</Unit><Target>" + hms(pos) + "</Target>"); } catch (NumberFormatException e) { /* ignore */ } break;
                            default: break;
                        }
                    } catch (IOException e) { /* the status poll below notices a TV that is really gone */ }
                }
                String st;
                try {
                    st = tag(soap(control, "GetTransportInfo", ""), "CurrentTransportState");
                    String p = soap(control, "GetPositionInfo", "");
                    double d = secs(tag(p, "TrackDuration")), q = secs(tag(p, "RelTime"));
                    if (d > 0) dur = d;
                    if (q > 0) pos = q;
                    fails = 0;
                } catch (IOException e) {
                    if (++fails >= 5) throw e;   // the TV went away
                    continue;
                }
                if ("PLAYING".equals(st) || "PAUSED_PLAYBACK".equals(st)) {
                    started = true; idle = 0;
                    if (!seeked) { seeked = true; try { soap(control, "Seek", "<Unit>REL_TIME</Unit><Target>" + hms(start) + "</Target>"); pos = start; } catch (IOException e) { /* some TVs can't seek */ } }
                    ev.state("PLAYING".equals(st) ? "playing" : "paused", pos, dur, null);
                } else if ("STOPPED".equals(st) || "NO_MEDIA_PRESENT".equals(st)) {
                    if (started && ++idle >= 2) throw new InterruptedException("finished");
                }
                if (!started && System.currentTimeMillis() - begun > 45000) throw new IOException("the TV did not start the video");
            }
        }
    }
}
