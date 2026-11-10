package com.mkcinema.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 1.10.0: your own TV service (Xtream login or M3U playlist) works inside the app.
 *
 * Most TV services answer on plain http:// and send no CORS headers, so a web page can't read them: the browser refuses
 * http on a secure page, and MainActivity.cleartext() blocks plain-http data to the open internet. Here the app itself
 * fetches the request and hands the answer to the page, but ONLY for the servers the person typed into
 * Live TV › Add playlist (the page passes them through the keyed bridge, see MainActivity.Bridge.iptvHosts), plus the
 * servers those answer with (a redirect to a load balancer, or the hosts a channel's HLS playlist names).
 *
 * What stays blocked: every other plain-http address, frames and pages from these servers (only sub-requests are
 * served), and scripts from them (the page's Content-Security-Policy only runs MKCinema's own scripts). What the person
 * accepts by adding a plain-http service: someone on the network could change the channel list or guide they see,
 * exactly as in any TV app that talks to that service.
 */
final class Iptv {
    private Iptv() { }

    static final int MAX_HOSTS = 32, MAX_SEEN = 96;
    /** hosts the person added (kept across launches) */
    static volatile Set<String> mine = Collections.emptySet();
    /** hosts those servers sent us to during this run (redirects, HLS segment hosts) */
    static final Set<String> seen = Collections.synchronizedSet(new LinkedHashSet<>());
    /** "https://<MKCinema's host>" of the page on screen, for the CORS answer */
    static volatile String origin = "https://" + MainActivity.HOST;

    static void load(Context c) {
        try { mine = parse(c.getSharedPreferences("mk", Context.MODE_PRIVATE).getString("iptvHosts", "[]")); } catch (Exception ignored) { }
    }

    /** the page's list of playlist / Xtream addresses (JSON array of URLs); returns how many hosts were kept */
    static int set(Context c, String json) {
        Set<String> s = parse(json);
        mine = s; seen.clear();
        c.getSharedPreferences("mk", Context.MODE_PRIVATE).edit().putString("iptvHosts", new JSONArray(s).toString()).apply();
        return s.size();
    }

    static Set<String> parse(String json) {
        Set<String> out = new HashSet<>();
        try {
            JSONArray a = new JSONArray(json == null ? "[]" : json);
            for (int i = 0; i < a.length() && out.size() < MAX_HOSTS; i++) {
                String h = hostOf(a.optString(i, ""));
                if (h != null) out.add(h);
            }
        } catch (Exception ignored) { }
        return out;
    }

    /** lower-case host of an http(s) address, or null; never MKCinema's own sites or GitHub (those stay https-only) */
    static String hostOf(String url) {
        try {
            java.net.URI u = new java.net.URI(url.trim());
            String s = u.getScheme(), h = u.getHost();
            if (s == null || h == null || !(s.equalsIgnoreCase("http") || s.equalsIgnoreCase("https"))) return null;
            h = h.toLowerCase(Locale.US);
            if (h.isEmpty() || h.length() > 253) return null;
            for (String own : new String[] { "mkcinema.pages.dev", "mkcinema.app", "github.com", "githubusercontent.com" })
                if (h.equals(own) || h.endsWith("." + own)) return null;
            return h;
        } catch (Exception e) { return null; }
    }

    static boolean allowed(String h) {
        if (h == null) return false;
        h = h.toLowerCase(Locale.US);
        return mine.contains(h) || seen.contains(h);
    }

    static void remember(String h) {
        h = hostOf("http://" + h);
        if (h == null || mine.contains(h)) return;
        synchronized (seen) {
            if (seen.size() >= MAX_SEEN) { java.util.Iterator<String> it = seen.iterator(); it.next(); it.remove(); }
            seen.add(h);
        }
    }

    /** Fetch a page sub-request for one of the person's TV servers, or return null to let the WebView handle it. */
    static WebResourceResponse intercept(WebResourceRequest r) {
        try {
            if (r.isForMainFrame() || !"GET".equalsIgnoreCase(r.getMethod())) return null;
            Uri u = r.getUrl();
            String scheme = u.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https")) || !allowed(u.getHost())) return null;
            Map<String, String> hd = r.getRequestHeaders();
            String accept = "", range = null, from = null, ua = null;
            if (hd != null) for (Map.Entry<String, String> e : hd.entrySet()) {
                String k = e.getKey() == null ? "" : e.getKey().toLowerCase(Locale.US);
                if (k.equals("accept")) accept = String.valueOf(e.getValue()).toLowerCase(Locale.US);
                else if (k.equals("range")) range = e.getValue();
                else if (k.equals("origin")) from = e.getValue();
                else if (k.equals("user-agent")) ua = e.getValue();
            }
            // video, audio and pictures load in the WebView as they always have (they need no CORS)
            if (range != null || accept.startsWith("image/") || accept.startsWith("video/") || accept.startsWith("audio/")) return null;
            // only MKCinema's own page gets the answer
            if (from != null && !MainActivity.APP_ORIGINS.contains(from)) return null;
            return fetch(u.toString(), ua, from != null ? from : origin);
        } catch (Exception e) { return null; }
    }

    static WebResourceResponse fetch(String url, String ua, String allowOrigin) throws IOException {
        HttpURLConnection c = null;
        String at = url;
        for (int hop = 0; hop < 6; hop++) {
            c = (HttpURLConnection) new URL(at).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000); c.setReadTimeout(60000);
            c.setUseCaches(false);
            if (ua != null) c.setRequestProperty("User-Agent", ua);
            c.setRequestProperty("Accept", "*/*");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                String next = new URL(new URL(at), c.getHeaderField("Location")).toString();
                c.disconnect();
                String h = hostOf(next);
                if (h == null) throw new IOException("bad redirect");
                remember(h); at = next; continue;
            }
            break;
        }
        int code = c.getResponseCode();
        if (code >= 300 && code < 400) { c.disconnect(); throw new IOException("too many redirects"); }
        String type = c.getContentType(), mime = "application/octet-stream", charset = null;
        if (type != null) {
            String[] p = type.split(";");
            mime = p[0].trim().toLowerCase(Locale.US);
            for (int i = 1; i < p.length; i++) { String x = p[i].trim(); if (x.toLowerCase(Locale.US).startsWith("charset=")) charset = x.substring(8).replace("\"", ""); }
        }
        InputStream body;
        try { body = code >= 400 ? c.getErrorStream() : c.getInputStream(); } catch (IOException e) { body = null; }
        if (body == null) body = new ByteArrayInputStream(new byte[0]);
        Map<String, String> out = new HashMap<>();
        out.put("Access-Control-Allow-Origin", allowOrigin);
        out.put("Cache-Control", "no-store");
        out.put("Vary", "Origin");
        String len = c.getHeaderField("Content-Length");
        boolean hls = mime.contains("mpegurl") || at.toLowerCase(Locale.US).matches("^[^?#]*\\.m3u8(\\?.*|#.*)?$");
        if (hls && (len == null || len.length() < 8)) {
            // a channel's HLS playlist: point its relative addresses at the server that really sent it, and allow the
            // hosts it names (Xtream servers hand out segments from load balancers)
            byte[] b = readCapped(body, 4 << 20);
            String text = new String(b, StandardCharsets.UTF_8);
            if (text.startsWith("#EXTM3U")) {
                body = new ByteArrayInputStream(absolute(text, at).getBytes(StandardCharsets.UTF_8));
                charset = "utf-8";
            } else body = new ByteArrayInputStream(b);
        } else if (len != null) out.put("Content-Length", len);
        final HttpURLConnection conn = c;
        InputStream closing = new FilterInputStream(body) { @Override public void close() throws IOException { try { super.close(); } finally { conn.disconnect(); } } };
        String reason = c.getResponseMessage();
        if (reason == null || reason.trim().isEmpty()) reason = code < 400 ? "OK" : "Error";
        if (code < 100 || code > 599) code = 502;
        return new WebResourceResponse(mime, charset, code, reason, out, closing);
    }

    static byte[] readCapped(InputStream in, int cap) throws IOException {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n;
        try { while ((n = in.read(buf)) > 0) { o.write(buf, 0, n); if (o.size() > cap) throw new IOException("playlist too large"); } }
        finally { try { in.close(); } catch (IOException ignored) { } }
        return o.toByteArray();
    }

    /** rewrites every address in an HLS playlist to a full one, against the address that answered */
    static String absolute(String text, String base) {
        StringBuilder sb = new StringBuilder(text.length() + 256);
        for (String line : text.split("\r?\n", -1)) {
            String t = line.trim();
            if (t.isEmpty()) { sb.append(line).append('\n'); continue; }
            if (t.startsWith("#")) {
                int i = t.indexOf("URI=\"");
                if (i >= 0) {
                    int j = t.indexOf('"', i + 5);
                    if (j > i) { String abs = resolve(base, t.substring(i + 5, j)); t = t.substring(0, i + 5) + abs + t.substring(j); }
                }
                sb.append(t).append('\n');
            } else sb.append(resolve(base, t)).append('\n');
        }
        return sb.toString();
    }

    static String resolve(String base, String ref) {
        try {
            String abs = new URL(new URL(base), ref).toString();
            String h = hostOf(abs);
            if (h != null) remember(h);
            return abs;
        } catch (Exception e) { return ref; }
    }
}
