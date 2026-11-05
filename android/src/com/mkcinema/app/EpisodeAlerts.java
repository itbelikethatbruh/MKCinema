package com.mkcinema.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 1.5.0 new-episode notifications, phones and tablets only, with no server: the page hands over the series you
 * follow (watchlist and Continue watching, Cinemeta ids only) and how far you got in each; twice a day, on any
 * network, this job reads each series from Cinemeta and notifies you of an episode that aired in the last three days
 * past the one you reached. Each episode is announced once. Tapping it opens that episode in MKCinema.
 */
public class EpisodeAlerts extends JobService {
    static final int JOB = 7101;
    static final String PREFS = "epalerts", CHANNEL = "episodes";
    static final long WINDOW = 3L * 86400000L, EVERY = 12L * 3600000L;
    static final int MAX_SHOWS = 60, MAX_SEEN = 400;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static boolean enabled(Context c) { return prefs(c).getBoolean("on", false); }

    /** {shows:[{id,name,reached}]} from the page; keeps only Cinemeta series ids */
    static void sync(Context c, String json) {
        try {
            JSONArray in = new JSONObject(json).optJSONArray("shows"), out = new JSONArray();
            for (int i = 0; in != null && i < in.length() && out.length() < MAX_SHOWS; i++) {
                JSONObject s = in.optJSONObject(i); if (s == null) continue;
                String id = s.optString("id", "");
                if (!id.matches("tt\\d{5,10}")) continue;
                JSONObject o = new JSONObject();
                o.put("id", id); o.put("name", s.optString("name", "")); o.put("reached", s.optInt("reached", 0));
                out.put(o);
            }
            prefs(c).edit().putString("shows", out.toString()).apply();
        } catch (Exception ignored) { }
    }

    static void setEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean("on", on).apply();
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (!on) { js.cancel(JOB); return; }
        JobInfo job = new JobInfo.Builder(JOB, new ComponentName(c, EpisodeAlerts.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(EVERY)
                .setPersisted(true)
                .build();
        js.schedule(job);
    }

    @Override public boolean onStartJob(JobParameters p) {
        Context c = getApplicationContext();
        if (!enabled(c)) return false;
        new Thread(() -> {
            try { check(c); } catch (Throwable ignored) { }
            jobFinished(p, false);
        }).start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters p) { return true; }

    static void check(Context c) throws Exception {
        SharedPreferences sp = prefs(c);
        JSONArray shows = new JSONArray(sp.getString("shows", "[]"));
        JSONArray seenArr = new JSONArray(sp.getString("seen", "[]"));
        HashSet<String> seen = new HashSet<>();
        for (int i = 0; i < seenArr.length(); i++) seen.add(seenArr.optString(i));
        long now = System.currentTimeMillis();
        ArrayList<String> added = new ArrayList<>();
        for (int i = 0; i < shows.length(); i++) {
            JSONObject s = shows.optJSONObject(i); if (s == null) continue;
            String id = s.optString("id"); int reached = s.optInt("reached", 0);
            JSONObject meta;
            try { meta = new JSONObject(get("https://v3-cinemeta.strem.io/meta/series/" + id + ".json")).optJSONObject("meta"); }
            catch (Exception e) { continue; }
            if (meta == null) continue;
            JSONArray vids = meta.optJSONArray("videos"); if (vids == null) continue;
            JSONObject best = null; long bestAt = 0; int count = 0;
            for (int k = 0; k < vids.length(); k++) {
                JSONObject v = vids.optJSONObject(k); if (v == null) continue;
                int sn = v.optInt("season", 0), en = v.optInt("episode", v.optInt("number", 0));
                long at = parse(v.optString("released", v.optString("firstAired", "")));
                if (sn <= 0 || at <= 0 || at > now || now - at > WINDOW) continue;
                if (reached > 0 && sn * 1000 + en <= reached) continue;
                String vid = v.optString("id", id + ":" + sn + ":" + en);
                if (seen.contains(vid)) continue;
                seen.add(vid); added.add(vid); count++;
                if (at >= bestAt) { bestAt = at; best = v; }
            }
            if (best != null) notify(c, id, meta.optString("name", s.optString("name")), best, count);
        }
        if (!added.isEmpty()) {
            JSONArray out = new JSONArray();
            ArrayList<String> all = new ArrayList<>();
            for (int i = 0; i < seenArr.length(); i++) all.add(seenArr.optString(i));
            all.addAll(added);
            for (int i = Math.max(0, all.size() - MAX_SEEN); i < all.size(); i++) out.put(all.get(i));
            sp.edit().putString("seen", out.toString()).apply();
        }
    }

    static void notify(Context c, String id, String name, JSONObject v, int count) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "New episodes", NotificationManager.IMPORTANCE_DEFAULT));
        int sn = v.optInt("season"), en = v.optInt("episode", v.optInt("number"));
        String vid = v.optString("id", id + ":" + sn + ":" + en), title = v.optString("name", v.optString("title", ""));
        String text = "S" + sn + " · E" + en + (title.isEmpty() ? "" : " · " + title) + (count > 1 ? "  (+" + (count - 1) + " more)" : "");
        Uri link = Uri.parse(MainActivity.HOME + "#open?type=series&id=" + Uri.encode(id) + "&video=" + Uri.encode(vid));
        Intent open = new Intent(Intent.ACTION_VIEW, link, c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(c, id.hashCode(), open, flags);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        int icon = c.getResources().getIdentifier("ic_notify", "drawable", c.getPackageName()); // build.sh makes no R class
        b.setSmallIcon(icon != 0 ? icon : android.R.drawable.stat_notify_more).setContentTitle("New episode: " + name).setContentText(text)
                .setContentIntent(pi).setAutoCancel(true).setColor(0xFFC9A96E).setCategory(Notification.CATEGORY_RECOMMENDATION);
        try { nm.notify(id.hashCode(), b.build()); } catch (SecurityException ignored) { /* notifications not allowed */ }
    }

    static long parse(String s) {
        if (s == null || s.length() < 10) return 0;
        String[] fmts = { "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd" };
        for (String f : fmts) {
            try { SimpleDateFormat d = new SimpleDateFormat(f, Locale.US); d.setTimeZone(TimeZone.getTimeZone("UTC")); Date x = d.parse(s); if (x != null) return x.getTime(); }
            catch (Exception ignored) { }
        }
        return 0;
    }

    static String get(String url) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15000); h.setReadTimeout(20000);
        h.setRequestProperty("User-Agent", "MKCinemaAndroid/" + MainActivity.VER);
        try {
            if (h.getResponseCode() != 200) throw new Exception("HTTP " + h.getResponseCode());
            try (InputStream in = h.getInputStream(); ByteArrayOutputStream o = new ByteArrayOutputStream()) {
                byte[] buf = new byte[16384]; int n;
                while ((n = in.read(buf)) > 0) { o.write(buf, 0, n); if (o.size() > 4_000_000) break; }
                return o.toString("UTF-8");
            }
        } finally { h.disconnect(); }
    }
}
