package com.mkcinema.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.StatFs;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * 1.11.0: live TV recording. The page asks (MKAndroid.recStart) and the app itself reads the channel, so any TV service
 * the person added works, plain http:// included, with no CORS rules. A recording keeps going with the app in the
 * background or closed (foreground service, like DlService), and is saved as the channel's own MPEG-TS (or fMP4) in the
 * app's Movies folder. It is listed with the other downloads (record "rec": true), so it plays from Library › Downloads
 * in the app's player. Nothing is re-encoded and nothing leaves the device.
 *
 * Reads: an HLS playlist (master → the best variant; live → follows new pieces; catch-up → every piece, then stops;
 * AES-128 pieces decrypted) or a plain stream (MPEG-TS channels; joined again after a drop).
 * Stops at: the time the page asked for, the person's Stop (page or notification), the end of a catch-up programme,
 * 8 hours, or less than 300 MB free.
 * Planned recordings (RecService.plan, from the guide) start from an exact alarm, so they start with the app closed.
 */
public class RecService extends Service {
    static final String CHANNEL = "recordings";
    static final int NOTE = 7302;
    static final long MAX_MS = 8L * 3600 * 1000, MIN_FREE = 300L * 1024 * 1024;
    static final int MAX_JOBS = 3;

    static final class Job {
        final String id, name; final File file; volatile boolean stop, running; volatile long bytes; final long started = System.currentTimeMillis(); volatile long stopAt;
        Job(String id, String name, File file, long stopAt) { this.id = id; this.name = name; this.file = file; this.stopAt = stopAt; }
    }
    static final Map<String, Job> jobs = new ConcurrentHashMap<>();

    PowerManager.WakeLock wake; WifiManager.WifiLock wifi; volatile long noteAt;

    /* ---------------- from the page ---------------- */

    /** {url, headers, name, channel, stopAt, catchup, meta} → id, or "error: ..." */
    static synchronized String start(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            String url = o.optString("url", "");
            if (!url.startsWith("http://") && !url.startsWith("https://")) return "error: this channel has no address that can be recorded";
            if (jobs.size() >= MAX_JOBS) return "error: three recordings are already running. Stop one first";
            for (Job j : jobs.values()) if (url.equals(urlOf(c, j.id))) return "error: this channel is already recording";
            File d = Downloads.dir(c);
            if (d == null) return "error: storage isn't available right now";
            if (new StatFs(d.getPath()).getAvailableBytes() < MIN_FREE * 2) return "error: less than 600 MB is free on this device";
            String name = o.optString("name", "Recording"), ch = o.optString("channel", "");
            String stamp = new SimpleDateFormat("yyyy-MM-dd HH.mm", Locale.US).format(new Date());
            String base = Downloads.safe((ch.isEmpty() || ch.equals(name) ? name : ch + " - " + name) + " " + stamp);
            if (base.endsWith(".mkv")) base = base.substring(0, base.length() - 4);
            File f = new File(d, base + ".ts");
            for (int i = 2; f.exists() && i < 100; i++) f = new File(d, base + " " + i + ".ts");
            long now = System.currentTimeMillis(), stopAt = o.optLong("stopAt", 0);
            boolean catchup = o.optBoolean("catchup", false);
            if (!catchup && (stopAt <= now || stopAt > now + MAX_MS)) stopAt = now + MAX_MS;
            if (catchup) stopAt = now + MAX_MS;
            JSONObject meta = o.optJSONObject("meta");
            if (meta == null) meta = new JSONObject();
            if (!meta.has("name")) meta.put("name", name);
            meta.put("type", "tv");
            if (!ch.isEmpty() && !ch.equals(name)) meta.put("epName", ch);
            String id = "rec" + now;
            JSONObject rec = new JSONObject();
            rec.put("id", id).put("rec", true).put("url", url).put("headers", o.optJSONObject("headers") == null ? new JSONObject() : o.optJSONObject("headers"))
                .put("catchup", catchup).put("stopAt", catchup ? 0 : stopAt).put("file", f.getName()).put("path", f.getAbsolutePath()).put("meta", meta).put("created", now);
            JSONArray a = Downloads.load(c); a.put(rec); Downloads.save(c, a);
            jobs.put(id, new Job(id, name, f, stopAt));
            Intent i = new Intent(c, RecService.class).putExtra("id", id);
            try {
                if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
            } catch (Exception e) {
                jobs.remove(id); mark(c, id, "dead", true, "err", "Android didn't let the app start recording in the background");
                return "error: Android didn't let the app start recording in the background. Open MKCinema and try again";
            }
            return id;
        } catch (Exception e) {
            return "error: " + (e.getMessage() == null ? "the recording did not start" : e.getMessage());
        }
    }

    static boolean stop(String id) { Job j = jobs.get(id); if (j == null) return false; j.stop = true; return true; }

    static String urlOf(Context c, String id) { JSONObject r = Downloads.find(Downloads.load(c), id); return r == null ? "" : r.optString("url"); }

    static void mark(Context c, String id, String k1, Object v1, String k2, Object v2) {
        synchronized (Downloads.class) {
            JSONArray a = Downloads.load(c); JSONObject r = Downloads.find(a, id);
            if (r == null) return;
            try { r.put(k1, v1); if (k2 != null) r.put(k2, v2); } catch (Exception ignored) { }
            Downloads.save(c, a);
        }
    }

    /* ---------------- planned recordings: an exact alarm starts them, even with the app closed ---------------- */

    static final String PLANS = "recPlans";
    static final long PRE = 60_000, POST = 120_000;

    /** {id, url, headers, name, channel, start, end} → true when the alarm is set */
    static synchronized boolean plan(Context c, String json) {
        try {
            JSONObject p = new JSONObject(json);
            if (p.optLong("end") <= System.currentTimeMillis() || p.optString("id").isEmpty()) return false;
            JSONArray all = plans(c), keep = new JSONArray();
            for (int i = 0; i < all.length(); i++) { JSONObject x = all.optJSONObject(i); if (x != null && !x.optString("id").equals(p.optString("id"))) keep.put(x); }
            keep.put(p);
            c.getSharedPreferences("mk", MODE_PRIVATE).edit().putString(PLANS, keep.toString()).apply();
            arm(c, p);
            return true;
        } catch (Exception e) { return false; }
    }

    static synchronized boolean unplan(Context c, String id) {
        JSONArray all = plans(c), keep = new JSONArray(); boolean hit = false;
        for (int i = 0; i < all.length(); i++) { JSONObject x = all.optJSONObject(i); if (x == null) continue; if (x.optString("id").equals(id)) { hit = true; disarm(c, x); } else keep.put(x); }
        c.getSharedPreferences("mk", MODE_PRIVATE).edit().putString(PLANS, keep.toString()).apply();
        return hit;
    }

    static JSONArray plans(Context c) {
        try { return new JSONArray(c.getSharedPreferences("mk", MODE_PRIVATE).getString(PLANS, "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static PendingIntent alarmIntent(Context c, String id) {
        Intent i = new Intent(c, Alarm.class).setAction("com.mkcinema.app.REC").putExtra("id", id);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void arm(Context c, JSONObject p) {
        AlarmManager am = (AlarmManager) c.getSystemService(ALARM_SERVICE);
        long at = Math.max(System.currentTimeMillis() + 1000, p.optLong("start") - PRE);
        PendingIntent pi = alarmIntent(c, p.optString("id"));
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (Exception e) { try { am.set(AlarmManager.RTC_WAKEUP, at, pi); } catch (Exception ignored) { } }
    }

    static void disarm(Context c, JSONObject p) { try { ((AlarmManager) c.getSystemService(ALARM_SERVICE)).cancel(alarmIntent(c, p.optString("id"))); } catch (Exception ignored) { } }

    /** the alarm (and a restart of the device, which clears alarms) */
    public static class Alarm extends BroadcastReceiver {
        @Override public void onReceive(Context c, Intent intent) {
            Context app = c.getApplicationContext();
            if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
                JSONArray all = plans(app);
                for (int i = 0; i < all.length(); i++) { JSONObject p = all.optJSONObject(i); if (p != null && p.optLong("end") > System.currentTimeMillis()) arm(app, p); }
                return;
            }
            String id = intent.getStringExtra("id");
            if (id == null) return;
            JSONObject p = null;
            synchronized (RecService.class) {
                JSONArray all = plans(app), keep = new JSONArray();
                for (int i = 0; i < all.length(); i++) { JSONObject x = all.optJSONObject(i); if (x == null) continue; if (x.optString("id").equals(id)) p = x; else if (x.optLong("end") > System.currentTimeMillis()) keep.put(x); }
                app.getSharedPreferences("mk", MODE_PRIVATE).edit().putString(PLANS, keep.toString()).apply();
            }
            if (p == null || p.optLong("end") + POST <= System.currentTimeMillis()) return;
            try {
                JSONObject o = new JSONObject();
                o.put("url", p.optString("url")).put("headers", p.optJSONObject("headers")).put("name", p.optString("name")).put("channel", p.optString("channel"))
                    .put("stopAt", p.optLong("end") + POST).put("meta", new JSONObject().put("key", "rec:" + id).put("name", p.optString("name")).put("poster", p.optString("logo")));
                start(app, o.toString());
            } catch (Exception ignored) { }
        }
    }

    /* ---------------- the service ---------------- */

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        note();
        String id = intent == null ? null : intent.getStringExtra("id");
        if (intent != null && "stop".equals(intent.getAction())) { if (id != null) stop(id); else for (Job j : jobs.values()) j.stop = true; return START_NOT_STICKY; }
        if (wake == null) {
            try {
                wake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mkcinema:rec");
                wake.acquire(MAX_MS + 600_000);
                wifi = ((WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "mkcinema:rec");
                wifi.acquire();
            } catch (Exception ignored) { }
        }
        Job j = id == null ? null : jobs.get(id);
        if (j != null && !j.running) {
            final Job job = j; job.running = true;
            new Thread(() -> run(job), "mkcinema-rec").start();
        } else if (jobs.isEmpty()) finishService();
        return START_NOT_STICKY;
    }

    synchronized void finishService() {
        if (!jobs.isEmpty()) return;
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) { }
        try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception ignored) { }
        wake = null; wifi = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        stopSelf();
    }

    void note() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Recordings", NotificationManager.IMPORTANCE_LOW));
                b = new Notification.Builder(this, CHANNEL);
            } else b = new Notification.Builder(this);
            int icon = getResources().getIdentifier("ic_notify", "drawable", getPackageName());
            String title = "Getting ready to record", text = "";
            List<Job> l = new ArrayList<>(jobs.values());
            if (l.size() == 1) {
                Job j = l.get(0);
                title = "Recording " + j.name;
                text = clock(System.currentTimeMillis() - j.started) + " · " + size(j.bytes)
                    + (j.stopAt > 0 && j.stopAt - j.started < MAX_MS ? " · until " + new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(j.stopAt)) : "");
            } else if (l.size() > 1) { title = "Recording " + l.size() + " channels"; text = l.get(0).name + ", " + l.get(1).name + (l.size() > 2 ? "…" : ""); }
            Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            b.setSmallIcon(icon != 0 ? icon : android.R.drawable.presence_video_online).setContentTitle(title).setContentText(text).setOngoing(true).setOnlyAlertOnce(true)
                .setContentIntent(PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            if (!l.isEmpty()) {
                Intent stop = new Intent(this, RecService.class).setAction("stop");
                if (l.size() == 1) stop.putExtra("id", l.get(0).id);
                b.addAction(new Notification.Action.Builder(null, l.size() == 1 ? "Stop" : "Stop all", PendingIntent.getService(this, 2, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
            }
            Notification n = b.build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC); else startForeground(NOTE, n);
        } catch (Exception ignored) { }
    }

    static String size(long b) { return b >= 1L << 30 ? String.format(Locale.US, "%.1f GB", b / 1073741824.0) : String.format(Locale.US, "%d MB", b >> 20); }

    static String clock(long ms) { long s = ms / 1000; return s >= 3600 ? String.format(Locale.US, "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60) : String.format(Locale.US, "%d:%02d", s / 60, s % 60); }

    /* ---------------- one recording ---------------- */

    void run(Job j) {
        Context c = getApplicationContext();
        JSONObject r = Downloads.find(Downloads.load(c), j.id);
        String err = "";
        if (r != null) {
            Rec rec = new Rec(this, j, r);
            try (OutputStream out = new BufferedOutputStream(new FileOutputStream(j.file, true), 1 << 20)) {
                rec.out = out;
                rec.go();
            } catch (Exception e) {
                err = rec.why != null ? rec.why : (e.getMessage() == null ? "the channel stopped answering" : e.getMessage());
            }
            if (err.isEmpty() && rec.why != null) err = rec.why;
        } else err = "the recording was removed";
        long len = j.file.length();
        if (len > 0) { synchronized (Downloads.class) { JSONArray a = Downloads.load(c); JSONObject x = Downloads.find(a, j.id); if (x != null) { try { x.put("done", true).put("size", len); if (!err.isEmpty()) x.put("note", err); } catch (Exception ignored) { } Downloads.save(c, a); } } }
        else { mark(c, j.id, "dead", true, "err", err.isEmpty() ? "nothing arrived from the channel" : err); j.file.delete(); }
        jobs.remove(j.id);
        if (Downloads.find(Downloads.load(c), j.id) == null) j.file.delete();   // deleted while it recorded
        note();
        finishService();
    }

    /** reads one channel into one file */
    static final class Rec {
        final RecService s; final Job j; final String url; final JSONObject headers; final boolean catchup;
        OutputStream out; String why; long nextNote, nextSpace;
        final Map<String, byte[]> keys = new HashMap<>();
        String mapUrl = "";

        Rec(RecService s, Job j, JSONObject r) { this.s = s; this.j = j; this.url = r.optString("url"); this.headers = r.optJSONObject("headers"); this.catchup = r.optBoolean("catchup"); }

        boolean done() { return j.stop || System.currentTimeMillis() >= j.stopAt; }

        void put(byte[] b, int n) throws IOException {
            out.write(b, 0, n); j.bytes += n;
            long now = System.currentTimeMillis();
            if (now > nextNote) { nextNote = now + 2000; s.note(); }
            if (now > nextSpace) {
                nextSpace = now + 15000; out.flush();
                File d = j.file.getParentFile();
                if (d != null && new StatFs(d.getPath()).getAvailableBytes() < MIN_FREE) { why = "the device is almost full"; j.stop = true; }
            }
        }

        HttpURLConnection open(String at, String range) throws IOException {
            for (int hop = 0; hop < 6; hop++) {
                HttpURLConnection h = (HttpURLConnection) new URL(at).openConnection();
                h.setInstanceFollowRedirects(false); h.setConnectTimeout(15000); h.setReadTimeout(30000); h.setUseCaches(false);
                if (headers != null) for (Iterator<String> it = headers.keys(); it.hasNext(); ) { String k = it.next(); if (k.matches("(?i)user-agent|referer|origin|cookie|authorization")) h.setRequestProperty(k, headers.optString(k)); }
                if (range != null) h.setRequestProperty("Range", range);
                int code = h.getResponseCode();
                String loc = h.getHeaderField("Location");
                if (code >= 300 && code < 400 && loc != null) { at = new URL(new URL(at), loc).toString(); h.disconnect(); continue; }
                if (code >= 400) { h.disconnect(); throw new HttpErr(code); }
                return h;
            }
            throw new IOException("the channel redirected too many times");
        }

        static final class HttpErr extends IOException { final int code; HttpErr(int c) { super("the channel's server refused (HTTP " + c + ")"); code = c; } }

        byte[] bytes(String u, String range) throws IOException {
            HttpURLConnection h = open(u, range);
            try (InputStream in = h.getInputStream()) {
                ByteArrayOutputStream o = new ByteArrayOutputStream(1 << 20);
                byte[] b = new byte[65536]; int n;
                while ((n = in.read(b)) > 0) { o.write(b, 0, n); if (o.size() > (256 << 20)) throw new IOException("a piece was too large"); }
                return o.toByteArray();
            } finally { h.disconnect(); }
        }

        void go() throws Exception {
            HttpURLConnection h = open(url, null);
            String type = String.valueOf(h.getContentType()).toLowerCase(Locale.US), finalUrl = h.getURL().toString();
            BufferedInputStream in = new BufferedInputStream(h.getInputStream(), 65536);
            in.mark(16);
            byte[] head = new byte[7]; int got = 0;
            while (got < 7) { int n = in.read(head, got, 7 - got); if (n <= 0) break; got += n; }
            in.reset();
            if (type.contains("mpegurl") || (got == 7 && new String(head, StandardCharsets.US_ASCII).equals("#EXTM3U"))) {
                String text;
                try { text = new String(Iptv.readCapped(in, 8 << 20), StandardCharsets.UTF_8); } finally { h.disconnect(); }
                hls(text, finalUrl);
            } else raw(h, in);
        }

        /* a plain stream; a live one that drops is joined again */
        void raw(HttpURLConnection h, InputStream in) throws Exception {
            int tries = 0;
            byte[] b = new byte[256 * 1024];
            while (true) {
                try {
                    int n;
                    while (!done() && (n = in.read(b)) > 0) { put(b, n); tries = 0; }
                } catch (IOException e) { /* dropped */ } finally { try { in.close(); } catch (Exception ignored) { } h.disconnect(); }
                if (done() || catchup) return;
                if (++tries > 20) { why = "the channel kept dropping"; return; }
                sleep(Math.min(15000, 1000L * tries));
                if (done()) return;
                try { h = open(url, null); in = h.getInputStream(); }
                catch (HttpErr e) { if (e.code == 401 || e.code == 403 || e.code == 404) { why = e.getMessage(); return; } in = new java.io.ByteArrayInputStream(new byte[0]); }
                catch (IOException e) { in = new java.io.ByteArrayInputStream(new byte[0]); }
            }
        }

        static final class Seg { String url, range = null; long seq; String keyMethod, keyUri, iv, mapUri, mapRange; }
        static final class Pl { boolean master, end; int td = 6; List<Seg> segs = new ArrayList<>(); String best; }

        static String attr(String line, String k) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("(?:^|,)" + k + "=(\"[^\"]*\"|[^,]*)").matcher(line);
            return m.find() ? m.group(1).replaceAll("^\"|\"$", "") : "";
        }

        static String abs(String base, String ref) { try { return new URL(new URL(base), ref).toString(); } catch (Exception e) { return ref; } }

        static Pl parse(String text, String base) {
            String[] lines = text.replace("﻿", "").split("\r?\n");
            if (lines.length == 0 || !lines[0].trim().startsWith("#EXTM3U")) return null;
            Pl p = new Pl();
            long best = -1; java.util.Set<String> sepAudio = new java.util.HashSet<>();
            for (String l : lines) { l = l.trim(); if (l.startsWith("#EXT-X-MEDIA:") && l.contains("TYPE=AUDIO") && l.contains("URI=")) sepAudio.add(attr(l.substring(13), "GROUP-ID")); }
            long bestOwn = -1; String own = null;
            for (int i = 0; i < lines.length; i++) {
                String l = lines[i].trim();
                if (!l.startsWith("#EXT-X-STREAM-INF:")) continue;
                p.master = true;
                int k = i + 1; while (k < lines.length && (lines[k].trim().isEmpty() || lines[k].trim().startsWith("#"))) k++;
                if (k >= lines.length) continue;
                long bw = 0; try { bw = Long.parseLong(attr(l.substring(18), "BANDWIDTH")); } catch (Exception ignored) { }
                String u = abs(base, lines[k].trim()), audio = attr(l.substring(18), "AUDIO");
                if (bw > best) { best = bw; p.best = u; }
                if ((audio.isEmpty() || !sepAudio.contains(audio)) && bw > bestOwn) { bestOwn = bw; own = u; }
            }
            if (p.master) { if (own != null) p.best = own; return p; }
            long seq = 0; String km = null, ku = null, kiv = null, mu = null, mr = null; long brN = -1, brO = -1; Map<String, Long> lastEnd = new HashMap<>();
            for (String l : lines) {
                l = l.trim();
                if (l.startsWith("#EXT-X-TARGETDURATION:")) { try { p.td = Math.max(1, (int) Double.parseDouble(l.substring(22))); } catch (Exception ignored) { } }
                else if (l.startsWith("#EXT-X-MEDIA-SEQUENCE:")) { try { seq = Long.parseLong(l.substring(22).trim()); } catch (Exception ignored) { } }
                else if (l.startsWith("#EXT-X-ENDLIST") || l.startsWith("#EXT-X-PLAYLIST-TYPE:VOD")) p.end = true;
                else if (l.startsWith("#EXT-X-KEY:")) { String a = l.substring(11), m = attr(a, "METHOD"); if (m.isEmpty() || m.equals("NONE")) { km = null; } else { km = m; ku = abs(base, attr(a, "URI")); kiv = attr(a, "IV"); } }
                else if (l.startsWith("#EXT-X-MAP:")) { String a = l.substring(11); mu = abs(base, attr(a, "URI")); mr = attr(a, "BYTERANGE"); }
                else if (l.startsWith("#EXT-X-BYTERANGE:")) { String[] x = l.substring(17).split("@"); try { brN = Long.parseLong(x[0].trim()); brO = x.length > 1 ? Long.parseLong(x[1].trim()) : -1; } catch (Exception e) { brN = -1; } }
                else if (!l.isEmpty() && !l.startsWith("#")) {
                    Seg s = new Seg(); s.url = abs(base, l); s.seq = seq++; s.keyMethod = km; s.keyUri = ku; s.iv = kiv; s.mapUri = mu; s.mapRange = mr;
                    if (brN > 0) { long off = brO >= 0 ? brO : lastEnd.getOrDefault(s.url, 0L); s.range = "bytes=" + off + "-" + (off + brN - 1); lastEnd.put(s.url, off + brN); brN = -1; }
                    p.segs.add(s);
                }
            }
            return p;
        }

        byte[] seg(Seg s) throws Exception {
            int tries = 0;
            while (true) {
                try {
                    byte[] b = bytes(s.url, s.range);
                    if (s.keyMethod != null) b = decrypt(b, s);
                    return b;
                } catch (SecurityException e) { throw e; }
                catch (Exception e) { if (j.stop || ++tries >= 3) throw e; sleep(800L * tries); }
            }
        }

        byte[] decrypt(byte[] b, Seg s) throws Exception {
            if (!"AES-128".equals(s.keyMethod)) throw new SecurityException("this channel is copy-protected, so it can't be saved");
            byte[] k = keys.get(s.keyUri);
            if (k == null) { k = bytes(s.keyUri, null); keys.put(s.keyUri, k); }
            byte[] iv = new byte[16];
            if (s.iv != null && !s.iv.isEmpty()) {
                String hx = s.iv.replaceFirst("(?i)^0x", "");
                while (hx.length() < 32) hx = "0" + hx;
                for (int i = 0; i < 16; i++) iv[i] = (byte) Integer.parseInt(hx.substring(i * 2, i * 2 + 2), 16);
            } else { long n = s.seq; for (int i = 15; i >= 8; i--) { iv[i] = (byte) (n & 0xff); n >>>= 8; } }
            Cipher ci = Cipher.getInstance("AES/CBC/PKCS5Padding");
            ci.init(Cipher.DECRYPT_MODE, new SecretKeySpec(k, "AES"), new IvParameterSpec(iv));
            return ci.doFinal(b);
        }

        String text(String u) throws IOException { return new String(bytes(u, null), StandardCharsets.UTF_8); }

        void hls(String text, String base) throws Exception {
            Pl pl = parse(text, base);
            String media = base;
            if (pl == null) throw new IOException("the channel sent something that isn't a video");
            if (pl.master) { media = pl.best; pl = parse(text(media), media); if (pl == null || pl.master) throw new IOException("the channel sent something that isn't a video"); }
            long next = -1; int misses = 0, lost = 0;
            while (true) {
                boolean finite = pl.end || catchup;
                if (next < 0) next = pl.segs.isEmpty() ? 0 : finite ? pl.segs.get(0).seq : pl.segs.get(Math.max(0, pl.segs.size() - 3)).seq;
                long last = pl.segs.isEmpty() ? -1 : pl.segs.get(pl.segs.size() - 1).seq;
                if (last >= 0 && last < next - 50) next = pl.segs.get(Math.max(0, pl.segs.size() - 3)).seq;
                if (!pl.segs.isEmpty() && pl.segs.get(0).seq > next) next = pl.segs.get(0).seq;
                int fresh = 0;
                for (Seg s : pl.segs) {
                    if (s.seq < next) continue;
                    if (done()) return;
                    fresh++;
                    byte[] b;
                    try { b = seg(s); }
                    catch (SecurityException e) { why = e.getMessage(); return; }
                    catch (Exception e) { if (finite) throw e; next = s.seq + 1; continue; }
                    if (s.mapUri != null && !s.mapUri.equals(mapUrl)) {
                        String rg = null;
                        if (s.mapRange != null && !s.mapRange.isEmpty()) { String[] x = s.mapRange.split("@"); long n = Long.parseLong(x[0].trim()), o = x.length > 1 ? Long.parseLong(x[1].trim()) : 0; rg = "bytes=" + o + "-" + (o + n - 1); }
                        byte[] init = bytes(s.mapUri, rg); put(init, init.length); mapUrl = s.mapUri;
                    }
                    put(b, b.length); next = s.seq + 1;
                }
                if (finite) return;
                misses = fresh > 0 ? 0 : misses + 1;
                if (misses > 20) { why = "the channel stopped sending new pictures"; return; }
                long wait = fresh > 0 ? pl.td * 1000L : pl.td * 500L;
                sleep(Math.max(300, Math.min(wait, j.stopAt - System.currentTimeMillis())));
                if (done()) return;
                try { Pl n = parse(text(media), media); if (n != null && !n.master) pl = n; lost = 0; }
                catch (Exception e) { if (++lost > 12) { why = "the channel stopped answering"; return; } sleep(2000); }
            }
        }

        static void sleep(long ms) { try { Thread.sleep(ms); } catch (InterruptedException ignored) { } }
    }
}
