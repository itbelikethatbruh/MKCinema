package com.mkcinema.app;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.StatFs;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/** Offline downloads (app 1.4.0 on phones and tablets, 1.8.0 on TVs too, and to a USB drive or SD card through DlService). The system download manager saves each film
    into this app's own Movies folder, so no storage permission is needed and the files go when the app is
    uninstalled. Downloads keep going with the app closed and show in the notification shade. The list (with the
    page's own details for each title) is kept in SharedPreferences. Films play in PlayerActivity. */
final class Downloads {
    static final String PREFS = "downloads";
    static final long MIN_FREE = 1500L * 1024 * 1024;

    static File dir(Context c) {
        File d = c.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        if (d != null && !d.exists()) d.mkdirs();
        return d;
    }

    /** 1.8.0: the app's Movies folder on storage volume vol (0 = the device itself, 1+ = a USB drive or SD card), or null */
    static File dir(Context c, int vol) {
        if (vol <= 0) return dir(c);
        File[] ds = c.getExternalFilesDirs(Environment.DIRECTORY_MOVIES);
        if (vol >= ds.length || ds[vol] == null || !Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState(ds[vol]))) return null;
        if (!ds[vol].exists()) ds[vol].mkdirs();
        return ds[vol];
    }

    /** 1.8.0: where downloads can go and how much room each place has: [{vol, removable, free, total}] */
    static String space(Context c) {
        JSONArray a = new JSONArray();
        try {
            File[] ds = c.getExternalFilesDirs(Environment.DIRECTORY_MOVIES);
            for (int i = 0; i < ds.length; i++) {
                File d = ds[i];
                if (d == null || !Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState(d))) continue;
                if (!d.exists()) d.mkdirs();
                StatFs st = new StatFs(d.getPath());
                a.put(new JSONObject().put("vol", i).put("removable", i > 0).put("free", st.getAvailableBytes()).put("total", st.getTotalBytes()));
            }
        } catch (Exception ignored) { }
        return a.toString();
    }

    static JSONArray load(Context c) {
        try { return new JSONArray(c.getSharedPreferences(PREFS, 0).getString("list", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static void save(Context c, JSONArray a) { c.getSharedPreferences(PREFS, 0).edit().putString("list", a.toString()).apply(); }

    static String safe(String n) {
        String s = n == null ? "" : n.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", " ").replaceAll("\\s+", " ").trim();
        if (s.length() > 120) s = s.substring(0, 120).trim();
        return s.isEmpty() ? "MKCinema.mkv" : s;
    }

    static JSONObject find(JSONArray a, String id) {
        for (int i = 0; i < a.length(); i++) { JSONObject o = a.optJSONObject(i); if (o != null && id.equals(o.optString("id"))) return o; }
        return null;
    }

    /** {url, headers, file, subUrl, wifiOnly, meta} → the download's id, or "error: ..." */
    static synchronized String start(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            String url = o.getString("url");
            if (!url.startsWith("https://") && !url.startsWith("http://")) return "error: this source can't be downloaded";
            int vol = o.optInt("vol", 0);
            File d = dir(c, vol);
            if (d == null) return vol > 0 ? "error: the USB drive isn't connected" : "error: storage isn't available right now";
            long free = new StatFs(d.getPath()).getAvailableBytes(), need = o.optLong("size", 0);
            if (need > 0 && free < need + 256L * 1024 * 1024) return "error: it needs " + gb(need) + " and only " + gb(free) + " is free" + (vol > 0 ? " on the USB drive" : "");
            if (vol == 0 && free < MIN_FREE) return "error: less than 1.5 GB is free on this device";
            String name = safe(o.optString("file", "MKCinema.mkv")), base = name, ext = "";
            int dot = name.lastIndexOf('.');
            if (dot > 0) { base = name.substring(0, dot); ext = name.substring(dot); }
            File f = new File(d, name);
            for (int i = 2; f.exists() && i < 100; i++) f = new File(d, base + " " + i + ext);
            JSONObject meta = o.optJSONObject("meta");
            if (meta == null) meta = new JSONObject();
            String title = meta.optString("name", "MKCinema");
            if (meta.has("season") && !meta.isNull("season")) title += " · S" + meta.optInt("season") + " E" + meta.optInt("episode");
            if (vol > 0) {
                // a USB drive or SD card: DlService fetches it (the system download manager only writes to the device itself)
                String uid = "u" + System.currentTimeMillis();
                JSONObject rec = new JSONObject();
                rec.put("id", uid).put("own", true).put("vol", vol).put("url", url).put("headers", o.optJSONObject("headers") == null ? new JSONObject() : o.optJSONObject("headers"))
                    .put("wifiOnly", o.optBoolean("wifiOnly", false)).put("file", f.getName()).put("path", f.getAbsolutePath()).put("meta", meta).put("created", System.currentTimeMillis());
                if (need > 0) rec.put("size", need);
                subs(o, d, base, f, name, uid, rec);
                JSONArray a = load(c); a.put(rec); save(c, a);
                DlService.kick(c);
                return uid;
            }
            DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url))
                .setTitle(title).setDescription("MKCinema · plays offline in the app")
                .setDestinationInExternalFilesDir(c, Environment.DIRECTORY_MOVIES, f.getName())
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setAllowedOverMetered(!o.optBoolean("wifiOnly", true))
                .setAllowedOverRoaming(false);
            JSONObject h = o.optJSONObject("headers");
            if (h != null) for (Iterator<String> it = h.keys(); it.hasNext(); ) { String k = it.next(); r.addRequestHeader(k, h.optString(k)); }
            long id = dm.enqueue(r);
            JSONObject rec = new JSONObject();
            rec.put("id", String.valueOf(id)).put("file", f.getName()).put("path", f.getAbsolutePath()).put("meta", meta).put("created", System.currentTimeMillis());
            subs(o, d, base, f, name, String.valueOf(id), rec);
            JSONArray a = load(c);
            a.put(rec);
            save(c, a);
            return String.valueOf(id);
        } catch (Exception e) {
            return "error: " + (e.getMessage() == null ? "the download did not start" : e.getMessage());
        }
    }

    static void subs(JSONObject o, File d, String base, File f, String name, String id, JSONObject rec) throws Exception {
        String sub = o.optString("subUrl", "");
        if (!sub.startsWith("https://")) return;
        File sf = new File(d, base + (f.getName().equals(name) ? "" : " " + id) + ".subs");
        rec.put("sub", sf.getAbsolutePath());
        new Thread(() -> fetchSubs(sub, sf)).start();
    }

    static String gb(long b) { return String.format(java.util.Locale.US, "%.1f GB", b / 1073741824.0); }

    static void fetchSubs(String url, File to) {
        try {
            HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
            h.setConnectTimeout(10000); h.setReadTimeout(20000);
            try (InputStream in = h.getInputStream(); FileOutputStream out = new FileOutputStream(to)) {
                byte[] b = new byte[16384]; int n; long total = 0;
                while ((n = in.read(b)) > 0 && (total += n) < 8L * 1024 * 1024) out.write(b, 0, n);
            }
        } catch (Exception ignored) { to.delete(); }
    }

    static String pausedWhy(int reason) {
        switch (reason) {
            case DownloadManager.PAUSED_QUEUED_FOR_WIFI: return "Waiting for Wi-Fi";
            case DownloadManager.PAUSED_WAITING_FOR_NETWORK: return "Waiting for a connection";
            case DownloadManager.PAUSED_WAITING_TO_RETRY: return "The connection dropped, trying again";
            default: return "Paused";
        }
    }

    static String failedWhy(int reason) {
        switch (reason) {
            case DownloadManager.ERROR_INSUFFICIENT_SPACE: return "not enough free space";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND: return "storage isn't available";
            case DownloadManager.ERROR_FILE_ALREADY_EXISTS: return "a file with that name already exists";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS: return "the link redirected too many times";
            case DownloadManager.ERROR_HTTP_DATA_ERROR: case DownloadManager.ERROR_CANNOT_RESUME: return "the connection broke and the link can't resume";
            default:
                if (reason >= 400 && reason < 600) return "the link stopped working (error " + reason + "). Debrid links expire: download it again";
                return "the download stopped";
        }
    }

    /** Every download with its live state: [{id, state, got, size, err, meta, file, created}] */
    static synchronized String list(Context c) {
        JSONArray a = load(c), out = new JSONArray();
        boolean changed = false, kick = false;
        DownloadManager dm = (DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE);
        for (int i = 0; i < a.length(); i++) {
            JSONObject rec = a.optJSONObject(i);
            if (rec == null) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("id", rec.optString("id")).put("meta", rec.optJSONObject("meta")).put("file", rec.optString("file")).put("created", rec.optLong("created")).put("vol", rec.optInt("vol", 0));
                File f = new File(rec.optString("path"));
                String state; long got = 0, size = rec.optLong("size", -1); String err = "";
                if (rec.optBoolean("done")) {
                    state = f.exists() ? "done" : "failed"; got = size;
                    if (!f.exists()) err = "the file was deleted outside MKCinema";
                    if (!f.exists() && rec.optInt("vol", 0) > 0 && (f.getParentFile() == null || !f.getParentFile().exists())) { state = "paused"; err = "On the USB drive: connect it to play"; }
                } else if (rec.optBoolean("own")) {
                    // 1.8.0: a USB drive download run by DlService
                    got = f.exists() ? f.length() : 0;
                    if (rec.optBoolean("dead")) { state = "failed"; err = rec.optString("err", "the download stopped"); }
                    else {
                        String[] lv = DlService.live.get(rec.optString("id"));
                        state = lv != null ? lv[0] : "queued"; err = lv != null ? lv[1] : "";
                        if (lv == null && !DlService.running) kick = true;
                        if (!f.getParentFile().exists()) { state = "paused"; err = "Connect the USB drive to carry on"; }
                    }
                } else {
                    state = "failed"; err = "the download was removed";
                    try (Cursor cur = dm.query(new DownloadManager.Query().setFilterById(Long.parseLong(rec.optString("id"))))) {
                        if (cur != null && cur.moveToFirst()) {
                            int st = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                            int reason = cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                            got = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                            size = cur.getLong(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                            err = "";
                            if (st == DownloadManager.STATUS_SUCCESSFUL) { state = "done"; got = size = f.exists() ? f.length() : size; rec.put("done", true).put("size", size); changed = true; }
                            else if (st == DownloadManager.STATUS_RUNNING) state = "running";
                            else if (st == DownloadManager.STATUS_PAUSED) { state = "paused"; err = pausedWhy(reason); }
                            else if (st == DownloadManager.STATUS_PENDING) state = "queued";
                            else { state = "failed"; err = failedWhy(reason); }
                        } else if (f.exists() && f.length() > 0) { state = "done"; got = size = f.length(); rec.put("done", true).put("size", size); changed = true; }
                    }
                }
                o.put("state", state).put("got", got).put("size", size).put("err", err);
                out.put(o);
            } catch (Exception ignored) { }
        }
        if (changed) save(c, a);
        if (kick) DlService.kick(c);
        return out.toString();
    }

    static synchronized boolean remove(Context c, String id) {
        JSONArray a = load(c), keep = new JSONArray();
        boolean hit = false;
        for (int i = 0; i < a.length(); i++) {
            JSONObject rec = a.optJSONObject(i);
            if (rec == null) continue;
            if (!id.equals(rec.optString("id"))) { keep.put(rec); continue; }
            hit = true;
            if (rec.optBoolean("own")) DlService.cancel(id);
            else try { ((DownloadManager) c.getSystemService(Context.DOWNLOAD_SERVICE)).remove(Long.parseLong(id)); } catch (Exception ignored) { }
            new File(rec.optString("path")).delete();
            if (rec.has("sub")) new File(rec.optString("sub")).delete();
        }
        save(c, keep);
        return hit;
    }

    /** The app's player for a finished download, or null if the file is gone. */
    static Intent playIntent(Context c, String id, int startMs) {
        JSONObject rec = find(load(c), id);
        if (rec == null) return null;
        File f = new File(rec.optString("path"));
        if (!f.exists()) return null;
        JSONObject m = rec.optJSONObject("meta");
        if (m == null) m = new JSONObject();
        String sub = m.has("season") && !m.isNull("season") ? "S" + m.optInt("season") + " · E" + m.optInt("episode") + (m.optString("epName").isEmpty() ? "" : " · " + m.optString("epName")) : m.optString("year", "");
        File sf = rec.has("sub") ? new File(rec.optString("sub")) : null;
        return new Intent(c, PlayerActivity.class)
            .putExtra("url", Uri.fromFile(f).toString()).putExtra("title", m.optString("name", f.getName())).putExtra("sub", sub + " · Downloaded")
            .putExtra("startMs", Math.max(0, startMs)).putExtra("subUrl", sf != null && sf.length() > 0 ? sf.getAbsolutePath() : "")
            .putExtra("matchRate", false).putExtra("headers", "");
    }

    /** Finished downloads for the native "You're offline" page: [[id, title, subtitle]] */
    static String offlineList(Context c) {
        StringBuilder sb = new StringBuilder();
        try {
            JSONArray a = new JSONArray(list(c));
            for (int i = a.length() - 1; i >= 0; i--) {
                JSONObject o = a.optJSONObject(i);
                if (o == null || !"done".equals(o.optString("state"))) continue;
                JSONObject m = o.optJSONObject("meta");
                String name = m != null ? m.optString("name", o.optString("file")) : o.optString("file");
                String sub = m != null && m.has("season") && !m.isNull("season") ? "S" + m.optInt("season") + " · E" + m.optInt("episode") : m != null ? m.optString("year", "") : "";
                sb.append("<a class=d href='mkdl:").append(Uri.encode(o.optString("id"))).append("'><b>").append(html(name)).append("</b><small>").append(html(sub)).append("</small></a>");
            }
        } catch (Exception ignored) { }
        return sb.toString();
    }

    static String html(String s) { return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("'", "&#39;").replace("\"", "&quot;"); }
}
