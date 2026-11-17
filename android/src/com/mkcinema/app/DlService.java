package com.mkcinema.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.StatFs;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONArray;
import org.json.JSONObject;

/** 1.8.0: downloads to a USB drive or SD card. The system download manager only saves to the device's own storage,
    so files for a removable drive are fetched here: one at a time, resuming with Range after a dropped connection,
    in a foreground service so they keep going with the app in the background. Wi-Fi and the CPU stay awake while it
    runs (TVs otherwise drop Wi-Fi in standby). Records live in the same list as the other downloads (Downloads),
    marked "own". Downloads.list() starts the service again if the app was closed with downloads still waiting. */
public class DlService extends Service {
    static final String CHANNEL = "downloads";
    static final int NOTE = 7301;
    /** id → {state, message} while this process runs: running, paused, queued */
    static final Map<String, String[]> live = new ConcurrentHashMap<>();
    static final Set<String> cancelled = ConcurrentHashMap.newKeySet();
    static volatile boolean running;

    static void kick(Context c) {
        if (running) return;
        try {
            Intent i = new Intent(c, DlService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) { /* not allowed from the background: list() tries again when the app is open */ }
    }

    static void cancel(String id) { cancelled.add(id); live.remove(id); }

    PowerManager.WakeLock wake; WifiManager.WifiLock wifi; long noteAt;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        note("Getting ready to download", "", 0, true);
        if (!running) {
            running = true;
            try {
                wake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mkcinema:dl");
                wake.acquire(12L * 3600 * 1000);
                wifi = ((WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "mkcinema:dl");
                wifi.acquire();
            } catch (Exception ignored) { }
            new Thread(this::loop, "mkcinema-dl").start();
        }
        return START_NOT_STICKY;
    }

    void note(String title, String text, int pct, boolean busy) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW));
                b = new Notification.Builder(this, CHANNEL);
            } else b = new Notification.Builder(this);
            int icon = getResources().getIdentifier("ic_notify", "drawable", getPackageName()); // build.sh makes no R class
            b.setSmallIcon(icon != 0 ? icon : android.R.drawable.stat_sys_download).setContentTitle(title).setContentText(text).setOngoing(true).setOnlyAlertOnce(true).setProgress(100, pct, busy);
            Notification n = b.build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC); else startForeground(NOTE, n);
        } catch (Exception ignored) { }
    }

    /** the next own download that hasn't finished or failed */
    static JSONObject next(Context c) {
        synchronized (Downloads.class) {
            JSONArray a = Downloads.load(c);
            for (int i = 0; i < a.length(); i++) {
                JSONObject r = a.optJSONObject(i);
                if (r != null && r.optBoolean("own") && !r.optBoolean("done") && !r.optBoolean("dead") && !cancelled.contains(r.optString("id")) && folderThere(r)) return r;
            }
            return null;
        }
    }

    /** a download whose USB drive or SD card is unplugged waits for it instead of failing */
    static boolean folderThere(JSONObject r) { File d = new File(r.optString("path")).getParentFile(); return d != null && d.exists(); }

    static void mark(Context c, String id, String key, Object v, String key2, Object v2) {
        synchronized (Downloads.class) {
            JSONArray a = Downloads.load(c);
            JSONObject r = Downloads.find(a, id);
            if (r == null) return;
            try { r.put(key, v); if (key2 != null) r.put(key2, v2); } catch (Exception ignored) { }
            Downloads.save(c, a);
        }
    }

    void loop() {
        Context c = getApplicationContext();
        try {
            for (JSONObject r; (r = next(c)) != null; ) fetch(c, r);
        } finally {
            running = false;
            try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception ignored) { }
            try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception ignored) { }
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
            stopSelf();
        }
    }

    static void sleep(long ms) { try { Thread.sleep(ms); } catch (InterruptedException ignored) { } }

    boolean metered() {
        try { return ((ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE)).isActiveNetworkMetered(); } catch (Exception e) { return false; }
    }

    void fetch(Context c, JSONObject r) {
        String id = r.optString("id");
        File f = new File(r.optString("path"));
        JSONObject meta = r.optJSONObject("meta");
        String title = meta != null ? meta.optString("name", f.getName()) : f.getName();
        int tries = 0;
        live.put(id, new String[]{"queued", ""});
        while (!cancelled.contains(id)) {
            if (!folderThere(r)) { live.put(id, new String[]{"paused", "Connect the USB drive to carry on"}); break; }
            if (r.optBoolean("wifiOnly") && metered()) { live.put(id, new String[]{"paused", "Waiting for Wi-Fi"}); note(title, "Waiting for Wi-Fi", 0, true); sleep(15000); continue; }
            long have = f.exists() ? f.length() : 0;
            HttpURLConnection h = null;
            try {
                // redirects are followed here, since Android does not follow one between http and https on its own
                URL u = new URL(r.optString("url")); int code = 0;
                for (int hop = 0; ; hop++) {
                    h = (HttpURLConnection) u.openConnection();
                    h.setConnectTimeout(20000); h.setReadTimeout(45000); h.setInstanceFollowRedirects(false);
                    JSONObject hd = r.optJSONObject("headers");
                    if (hd != null) for (Iterator<String> it = hd.keys(); it.hasNext(); ) { String k = it.next(); h.setRequestProperty(k, hd.optString(k)); }
                    if (have > 0) h.setRequestProperty("Range", "bytes=" + have + "-");
                    code = h.getResponseCode();
                    String loc = code >= 300 && code < 400 ? h.getHeaderField("Location") : null;
                    if (loc == null) break;
                    if (hop >= 8) throw new java.io.IOException("too many redirects");
                    u = new URL(u, loc); h.disconnect(); h = null;
                }
                if (code == 416 && have > 0) { mark(c, id, "done", true, "size", have); break; }
                if (code >= 500 || code == 408 || code == 429) throw new java.io.IOException("the server answered " + code);
                if (code >= 400) { mark(c, id, "dead", true, "err", Downloads.failedWhy(code)); break; }
                if (code != 200 && code != 206) throw new java.io.IOException("the server answered " + code);
                boolean append = have > 0 && code == 206;
                long total = -1;
                if (code == 206) { String cr = h.getHeaderField("Content-Range"); int sl = cr == null ? -1 : cr.lastIndexOf('/'); if (sl > 0) try { total = Long.parseLong(cr.substring(sl + 1).trim()); } catch (Exception ignored) { } }
                else { total = h.getContentLengthLong(); have = 0; }
                if (total > 0) { r.put("size", total); mark(c, id, "size", total, null, null); }
                File dir = f.getParentFile();
                if (total > 0 && dir != null && new StatFs(dir.getPath()).getAvailableBytes() < total - have + 32L * 1024 * 1024) {
                    mark(c, id, "dead", true, "err", "not enough free space on the drive"); break;
                }
                live.put(id, new String[]{"running", ""});
                tries = 0;
                try (InputStream in = h.getInputStream(); FileOutputStream out = new FileOutputStream(f, append)) {
                    byte[] b = new byte[256 * 1024]; int n; long got = have;
                    while ((n = in.read(b)) > 0) {
                        if (cancelled.contains(id)) break;
                        out.write(b, 0, n); got += n;
                        long now = System.currentTimeMillis();
                        if (now - noteAt > 2000) { noteAt = now; note(title, total > 0 ? (got * 100 / total) + "% · on the USB drive" : "Downloading to the USB drive", total > 0 ? (int) (got * 100 / total) : 0, total <= 0); }
                    }
                }
                if (cancelled.contains(id)) break;
                long len = f.length();
                if (total <= 0 || len >= total) { mark(c, id, "done", true, "size", len); break; }
                throw new java.io.IOException("the connection ended early");
            } catch (Exception e) {
                if (cancelled.contains(id)) break;
                File dir = f.getParentFile();
                try { if (dir != null && new StatFs(dir.getPath()).getAvailableBytes() < 16L * 1024 * 1024) { mark(c, id, "dead", true, "err", "the drive is full"); break; } }
                catch (Exception gone) { live.put(id, new String[]{"paused", "Connect the USB drive to carry on"}); break; }
                if (++tries > 20) { mark(c, id, "dead", true, "err", "the connection kept dropping. Download it again"); break; }
                live.put(id, new String[]{"paused", "The connection dropped, trying again"});
                note(title, "The connection dropped, trying again", 0, true);
                sleep(Math.min(60000, 4000L * tries));
            } finally { if (h != null) h.disconnect(); }
        }
        live.remove(id);
        if (cancelled.contains(id)) f.delete();
    }
}
