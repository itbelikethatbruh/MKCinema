package com.mkcinema.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 1.12.0: send a film to an Apple TV with AirPlay (protocol in AirPlay.java).
 *
 * The page asks with MKAndroid.apScan (find Apple TVs on this Wi-Fi with Bonjour, answers in MKAirPlay.devices),
 * apPlay (send a stream link), apPin (the code the TV shows, the first time only), apCtl (pause, play, seek, stop) and
 * apForget. The session runs in this foreground service because the Apple TV stops the film as soon as the phone's
 * connection closes, so it has to survive the screen turning off. States go back to MKAirPlay.state and the
 * notification has Pause and Stop.
 */
public class AirPlayService extends Service {
    static final String CHANNEL = "airplay";
    static final int NOTE = 7303;

    static final class Device {
        String id, name, model, features, flags; InetAddress host; int port;
        JSONObject json(Context c) {
            JSONObject o = new JSONObject();
            try { o.put("id", id).put("name", name).put("model", model == null ? "" : model).put("paired", creds(c, id) != null).put("apple", model != null && model.startsWith("AppleTV")); } catch (Exception e) { /* never */ }
            return o;
        }
    }
    static final Map<String, Device> devices = new ConcurrentHashMap<>();
    static final Handler main = new Handler(Looper.getMainLooper());

    // ---------------------------------------------------------------- discovery
    static NsdManager nsd; static NsdManager.DiscoveryListener disc; static final ArrayDeque<NsdServiceInfo> toResolve = new ArrayDeque<>(); static boolean resolving;
    static WifiManager.MulticastLock mlock;
    static Runnable scanEnd;

    /** Looks for AirPlay receivers for 20 seconds; known ones are reported straight away. */
    static synchronized void scan(Context c) {
        final Context app = c.getApplicationContext();
        pushDevices(app);
        if (disc != null) { main.removeCallbacks(scanEnd); main.postDelayed(scanEnd, 20000); return; }
        nsd = (NsdManager) app.getSystemService(Context.NSD_SERVICE);
        if (nsd == null) return;
        try {
            WifiManager wm = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);
            if (wm != null) { mlock = wm.createMulticastLock("mkcinema-airplay"); mlock.setReferenceCounted(false); mlock.acquire(); }
        } catch (Exception e) { mlock = null; }
        disc = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String t) { }
            @Override public void onDiscoveryStopped(String t) { }
            @Override public void onStartDiscoveryFailed(String t, int e) { synchronized (AirPlayService.class) { disc = null; } }
            @Override public void onStopDiscoveryFailed(String t, int e) { }
            @Override public void onServiceFound(NsdServiceInfo s) { synchronized (AirPlayService.class) { toResolve.add(s); } resolveNext(app); }
            @Override public void onServiceLost(NsdServiceInfo s) { }
        };
        try { nsd.discoverServices("_airplay._tcp", NsdManager.PROTOCOL_DNS_SD, disc); } catch (Exception e) { disc = null; return; }
        scanEnd = () -> stopScan();
        main.postDelayed(scanEnd, 20000);
    }
    static synchronized void stopScan() {
        if (disc != null && nsd != null) try { nsd.stopServiceDiscovery(disc); } catch (Exception e) { /* already stopped */ }
        disc = null;
        if (mlock != null) try { mlock.release(); } catch (Exception e) { /* released */ }
        mlock = null;
    }
    @SuppressWarnings("deprecation")
    static void resolveNext(final Context app) {
        NsdServiceInfo s;
        synchronized (AirPlayService.class) { if (resolving || toResolve.isEmpty() || nsd == null) return; resolving = true; s = toResolve.poll(); }
        try {
            nsd.resolveService(s, new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo i, int e) { done(); }
                @Override public void onServiceResolved(NsdServiceInfo i) { add(app, i); done(); }
                void done() { synchronized (AirPlayService.class) { resolving = false; } main.postDelayed(() -> resolveNext(app), 50); }
            });
        } catch (Exception e) { synchronized (AirPlayService.class) { resolving = false; } }
    }
    @SuppressWarnings("deprecation")
    static void add(Context app, NsdServiceInfo i) {
        Map<String, byte[]> a = i.getAttributes();
        String features = txt(a, "features"), id = txt(a, "deviceid"), model = txt(a, "model");
        if (features == null || !AirPlay.feature(features, AirPlay.F_VIDEO)) return;   // speakers and HomePods can't show video
        if (i.getHost() == null) return;
        Device d = new Device();
        d.id = (id != null ? id : i.getServiceName()).toUpperCase(Locale.US);
        d.name = i.getServiceName(); d.model = model; d.features = features; d.flags = txt(a, "flags");
        d.host = i.getHost(); d.port = i.getPort() > 0 ? i.getPort() : 7000;
        devices.put(d.id, d);
        pushDevices(app);
    }
    static String txt(Map<String, byte[]> a, String k) {
        if (a == null) return null;
        byte[] v = a.get(k);
        return v == null ? null : new String(v, StandardCharsets.UTF_8);
    }
    static void pushDevices(Context c) {
        JSONArray l = new JSONArray();
        for (Device d : devices.values()) l.put(d.json(c));
        MainActivity.toPage("window.MKAirPlay&&MKAirPlay.devices(" + l + ")");
    }

    // ---------------------------------------------------------------- saved pairings
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("airplay", Context.MODE_PRIVATE); }
    static AirPlay.Creds creds(Context c, String id) { return AirPlay.Creds.parse(prefs(c).getString("c:" + id, null)); }
    static void forget(Context c, String id) { prefs(c).edit().remove("c:" + id).apply(); pushDevices(c.getApplicationContext()); }

    // ---------------------------------------------------------------- the session
    static volatile AirPlay.Session session; static volatile Device current; static volatile String title = "";
    static final LinkedBlockingQueue<String> pins = new LinkedBlockingQueue<>();
    static volatile String lastState = "idle"; static volatile double lastPos, lastDur;

    /** json: { id, url, title, start } */
    static String play(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            Device d = devices.get(o.optString("id"));
            String url = o.optString("url");
            if (d == null) return "error: that TV is no longer on this Wi-Fi";
            if (!url.startsWith("http://") && !url.startsWith("https://")) return "error: this source has no web link";
            final Context app = c.getApplicationContext();
            AirPlay.Session old = session; if (old != null) old.stop();
            pins.clear();
            current = d; title = o.optString("title", "");
            final AirPlay.Session s = new AirPlay.Session(d.host, d.port, d.features, d.flags, creds(app, d.id), url, Math.max(0, o.optDouble("start", 0)), new AirPlay.Events() {
                @Override public String askPin(boolean again) throws InterruptedException {
                    state("pin", 0, 0, again ? "again" : null);
                    String p = pins.poll(3, TimeUnit.MINUTES);
                    return p == null || p.isEmpty() ? null : p;
                }
                @Override public void paired(AirPlay.Creds cr) { prefs(app).edit().putString("c:" + d.id, cr.toString()).apply(); }
                @Override public void forget() { AirPlayService.forget(app, d.id); }
                @Override public void state(String st, double pos, double dur, String msg) { report(app, this, st, pos, dur, msg); }
            });
            session = s;
            Intent i = new Intent(app, AirPlayService.class);
            if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(i); else app.startService(i);
            Thread t = new Thread(s, "airplay"); t.start();
            return "ok";
        } catch (Exception e) { return "error: " + e.getMessage(); }
    }
    static void report(Context app, AirPlay.Events who, String st, double pos, double dur, String msg) {
        AirPlay.Session s = session;
        if (s == null || s.ev != who) return;   // an older session finishing
        boolean changed = !st.equals(lastState);
        lastState = st; lastPos = pos; lastDur = dur;
        JSONObject o = new JSONObject();
        try { o.put("state", st).put("pos", pos).put("dur", dur).put("tv", current == null ? "" : current.name); if (msg != null) o.put("msg", msg); } catch (Exception e) { /* never */ }
        MainActivity.toPage("window.MKAirPlay&&MKAirPlay.state(" + o + ")");
        if ("ended".equals(st) || "error".equals(st)) { session = null; app.stopService(new Intent(app, AirPlayService.class)); }
        else if (changed && live != null) main.post(() -> { if (live != null) live.note(); });
    }
    static void pin(String p) { pins.offer(p == null ? "" : p.replaceAll("[^0-9]", "")); }
    static void ctl(String cmd, String arg) {
        AirPlay.Session s = session;
        if (s == null) return;
        if ("stop".equals(cmd)) { pins.offer(""); s.stop(); } else s.command(cmd, arg);
    }

    // ---------------------------------------------------------------- service (keeps the session alive with the screen off)
    static volatile AirPlayService live;
    PowerManager.WakeLock wake; WifiManager.WifiLock wifi;

    @Override public void onCreate() {
        super.onCreate(); live = this;
        try {
            wake = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mkcinema:airplay"); wake.setReferenceCounted(false); wake.acquire(6 * 3600 * 1000L);
            wifi = ((WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE)).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "mkcinema:airplay"); wifi.setReferenceCounted(false); wifi.acquire();
        } catch (Exception e) { /* best effort */ }
    }
    @Override public int onStartCommand(Intent i, int flags, int id) {
        note();
        String a = i == null ? null : i.getAction();
        if ("pause".equals(a)) ctl("paused".equals(lastState) ? "play" : "pause", null);
        else if ("stop".equals(a)) ctl("stop", null);
        if (session == null) stopSelf();
        return START_NOT_STICKY;
    }
    void note() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= 26) {
                if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(new NotificationChannel(CHANNEL, "AirPlay", NotificationManager.IMPORTANCE_LOW));
                b = new Notification.Builder(this, CHANNEL);
            } else b = new Notification.Builder(this);
            int icon = getResources().getIdentifier("ic_notify", "drawable", getPackageName());
            Device d = current;
            String tv = d == null ? "Apple TV" : d.name;
            String head = "pin".equals(lastState) ? "Enter the code shown on " + tv : "connecting".equals(lastState) || "idle".equals(lastState) ? "Connecting to " + tv : ("paused".equals(lastState) ? "Paused on " : "Playing on ") + tv;
            Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            b.setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_media_play).setContentTitle(head).setContentText(title).setOngoing(true).setOnlyAlertOnce(true)
                .setContentIntent(PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            if ("playing".equals(lastState) || "paused".equals(lastState))
                b.addAction(new Notification.Action.Builder(null, "paused".equals(lastState) ? "Play" : "Pause", PendingIntent.getService(this, 2, new Intent(this, AirPlayService.class).setAction("pause"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
            b.addAction(new Notification.Action.Builder(null, "Stop", PendingIntent.getService(this, 3, new Intent(this, AirPlayService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)).build());
            Notification n = b.build();
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK); else startForeground(NOTE, n);
        } catch (Exception ignored) { }
    }
    @Override public void onDestroy() {
        live = null;
        try { if (wake != null) wake.release(); if (wifi != null) wifi.release(); } catch (Exception e) { /* released */ }
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent i) { return null; }
}
