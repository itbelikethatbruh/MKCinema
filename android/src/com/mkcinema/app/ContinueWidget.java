package com.mkcinema.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 1.17.0 Continue watching home-screen widget (phones and tablets).
 * The page sends what is in progress with MKAndroid.widgetSync (newest first, its own words in the person's language);
 * the app keeps it, saves a small 16:9 picture of each title and redraws every placed widget. Resume opens
 * MainActivity with mkcinema://resume?v=VIDEO_ID, which the page turns into "play from where you stopped" (the same
 * as Resume on the Continue watching row). Nothing here talks to a server other than the picture addresses the page
 * already shows. With nothing in progress, or before the page has ever synced, the widget shows a calm empty state.
 */
public class ContinueWidget extends AppWidgetProvider {
    static final String PREFS = "cwidget";
    static final int MAX = 4, ART_W = 384, ART_H = 216;
    /** the smaller rows under the first title: row, picture, name, line, progress */
    static final String[] ROW_PARTS = { "cw_row", "cw_art", "cw_name", "cw_sub", "cw_prog" };
    static final int EXTRA_ROWS = 3;

    /** build.sh makes no R class: resources are looked up by name */
    static int res(Context c, String name, String type) { return c.getResources().getIdentifier(name, type, c.getPackageName()); }
    static int id(Context c, String name) { return res(c, name, "id"); }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static int[] ids(Context c) {
        try { return AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, ContinueWidget.class)); }
        catch (Exception e) { return new int[0]; }
    }
    /** true when at least one widget is on the home screen (the page skips its work otherwise) */
    static boolean placed(Context c) { return ids(c).length > 0; }

    /** {labels:{title,resume,empty,emptySub,open}, items:[{v,id,type,name,sub,pct,art}]} from the page. Runs off the main thread. */
    static void sync(Context c, String json) {
        try {
            JSONObject in = new JSONObject(json);
            JSONArray items = in.optJSONArray("items"), out = new JSONArray();
            HashSet<String> keep = new HashSet<>();
            for (int i = 0; items != null && i < items.length() && out.length() < MAX; i++) {
                JSONObject s = items.optJSONObject(i); if (s == null) continue;
                String v = clip(s.optString("v", ""), 160), id = clip(s.optString("id", ""), 80);
                if (v.isEmpty() || id.isEmpty()) continue;
                JSONObject o = new JSONObject();
                o.put("v", v); o.put("id", id); o.put("type", clip(s.optString("type", "movie"), 12));
                o.put("name", clip(s.optString("name", ""), 120)); o.put("sub", clip(s.optString("sub", ""), 120));
                o.put("pct", Math.max(0, Math.min(100, s.optInt("pct", 0))));
                String art = s.optString("art", "");
                String file = art.startsWith("https://") && art.length() < 2000 ? fetchArt(c, art) : "";
                o.put("file", file); if (!file.isEmpty()) keep.add(file);
                out.put(o);
            }
            JSONObject lab = in.optJSONObject("labels"), labels = new JSONObject();
            for (String k : new String[] { "title", "resume", "empty", "emptySub", "open" })
                if (lab != null && lab.has(k)) labels.put(k, clip(lab.optString(k, ""), 80));
            prefs(c).edit().putString("items", out.toString()).putString("labels", labels.toString()).apply();
            File[] old = artDir(c).listFiles();
            if (old != null) for (File f : old) if (!keep.contains(f.getName())) f.delete();
            refresh(c);
        } catch (Exception ignored) { }
    }

    static String clip(String s, int n) { s = s == null ? "" : s.replaceAll("[\\p{Cntrl}]", " ").trim(); return s.length() > n ? s.substring(0, n) : s; }
    static File artDir(Context c) { File d = new File(c.getFilesDir(), "widget"); d.mkdirs(); return d; }

    /** Downloads a title's picture once (cached by address), crops it to 16:9 and keeps a small JPEG. "" on failure. */
    static String fetchArt(Context c, String url) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-1").digest(url.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder(); for (int i = 0; i < 10; i++) sb.append(String.format(Locale.US, "%02x", h[i] & 0xff));
            String name = sb + ".jpg"; File f = new File(artDir(c), name);
            if (f.length() > 0) return name;
            HttpURLConnection k = (HttpURLConnection) new URL(url).openConnection();
            k.setConnectTimeout(8000); k.setReadTimeout(10000); k.setInstanceFollowRedirects(true);
            if (k.getResponseCode() != 200) { k.disconnect(); return ""; }
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            try (InputStream is = k.getInputStream()) {
                byte[] b = new byte[16384]; int n;
                while ((n = is.read(b)) > 0) { buf.write(b, 0, n); if (buf.size() > 6 * 1024 * 1024) return ""; }
            } finally { k.disconnect(); }
            byte[] data = buf.toByteArray();
            BitmapFactory.Options bo = new BitmapFactory.Options(); bo.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, bo);
            if (bo.outWidth <= 0 || bo.outHeight <= 0) return "";
            int sample = 1; while (bo.outWidth / (sample * 2) >= ART_W && bo.outHeight / (sample * 2) >= ART_H) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options(); o2.inSampleSize = sample;
            Bitmap src = BitmapFactory.decodeByteArray(data, 0, data.length, o2);
            if (src == null) return "";
            Bitmap dst = Bitmap.createBitmap(ART_W, ART_H, Bitmap.Config.ARGB_8888);
            float s = Math.max(ART_W / (float) src.getWidth(), ART_H / (float) src.getHeight());
            Matrix m = new Matrix(); m.setScale(s, s);
            // posters are portrait: keep the top third (faces and titles), backdrops are centred
            float dy = src.getHeight() * s > ART_H * 1.6f ? -(src.getHeight() * s - ART_H) * 0.22f : -(src.getHeight() * s - ART_H) / 2f;
            m.postTranslate(-(src.getWidth() * s - ART_W) / 2f, dy);
            new Canvas(dst).drawBitmap(src, m, new Paint(Paint.FILTER_BITMAP_FLAG));
            src.recycle();
            File tmp = new File(artDir(c), name + ".part");
            try (FileOutputStream fo = new FileOutputStream(tmp)) { dst.compress(Bitmap.CompressFormat.JPEG, 85, fo); }
            dst.recycle();
            return tmp.renameTo(f) ? name : "";
        } catch (Throwable e) { return ""; }
    }

    /** The saved picture with rounded corners (RemoteViews can't clip an image before Android 12). */
    static Bitmap art(Context c, String file, int w, int h) {
        if (file == null || file.isEmpty()) return null;
        try {
            Bitmap src = BitmapFactory.decodeFile(new File(artDir(c), file).getPath());
            if (src == null) return null;
            Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            BitmapShader sh = new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
            Matrix m = new Matrix(); m.setScale(w / (float) src.getWidth(), h / (float) src.getHeight()); sh.setLocalMatrix(m);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG); p.setShader(sh);
            float r = h * 0.09f;
            new Canvas(out).drawRoundRect(new RectF(0, 0, w, h), r, r, p);
            src.recycle();
            return out;
        } catch (Throwable e) { return null; }
    }

    static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : ids(c)) { try { m.updateAppWidget(id, views(c, m, id)); } catch (Exception ignored) { } }
    }

    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) { try { m.updateAppWidget(id, views(c, m, id)); } catch (Exception ignored) { } }
    }

    @Override public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        try { m.updateAppWidget(id, views(c, m, id)); } catch (Exception ignored) { }
    }

    /** Opens the item's resume link, or MKCinema's Home when v is null */
    static PendingIntent open(Context c, String v, int slot) {
        Intent i = new Intent(Intent.ACTION_VIEW, v == null ? Uri.parse(MainActivity.HOME) : Uri.parse("mkcinema://resume?v=" + Uri.encode(v)), c, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, 7300 + slot, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static RemoteViews views(Context c, AppWidgetManager m, int id) {
        RemoteViews rv = new RemoteViews(c.getPackageName(), res(c, "widget_cw", "layout"));
        SharedPreferences p = prefs(c);
        JSONArray items; JSONObject lab;
        try { items = new JSONArray(p.getString("items", "[]")); } catch (Exception e) { items = new JSONArray(); }
        try { lab = new JSONObject(p.getString("labels", "{}")); } catch (Exception e) { lab = new JSONObject(); }
        rv.setTextViewText(id(c, "cw_title"), lab.optString("title", "Continue watching"));
        rv.setOnClickPendingIntent(id(c, "cw_head"), open(c, null, 0));
        // rows that fit: the first item takes about 120 dp with the header; each extra row about 52 dp
        int h = 0;
        try { Bundle o = m.getAppWidgetOptions(id); h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)); } catch (Exception ignored) { }
        int extra = h <= 0 ? 0 : Math.max(0, Math.min(EXTRA_ROWS, (h - 124) / 52));
        float dp = c.getResources().getDisplayMetrics().density;
        if (items.length() == 0) {
            rv.setViewVisibility(id(c, "cw_main"), View.GONE);
            for (int k = 1; k <= EXTRA_ROWS; k++) rv.setViewVisibility(id(c, "cw_row" + k), View.GONE);
            rv.setViewVisibility(id(c, "cw_empty"), View.VISIBLE);
            rv.setTextViewText(id(c, "cw_empty_title"), lab.optString("empty", "Nothing in progress"));
            rv.setTextViewText(id(c, "cw_empty_sub"), lab.optString("emptySub", "Start a film or an episode and it waits here."));
            rv.setTextViewText(id(c, "cw_open"), lab.optString("open", "Open MKCinema"));
            rv.setOnClickPendingIntent(id(c, "cw_empty"), open(c, null, 1));
            return rv;
        }
        rv.setViewVisibility(id(c, "cw_empty"), View.GONE);
        rv.setViewVisibility(id(c, "cw_main"), View.VISIBLE);
        JSONObject first = items.optJSONObject(0);
        rv.setTextViewText(id(c, "cw_name0"), first.optString("name"));
        rv.setTextViewText(id(c, "cw_sub0"), first.optString("sub"));
        rv.setTextViewText(id(c, "cw_resume"), lab.optString("resume", "Resume"));
        rv.setProgressBar(id(c, "cw_prog0"), 100, Math.max(2, first.optInt("pct")), false);
        Bitmap a0 = art(c, first.optString("file"), Math.round(120 * dp), Math.round(68 * dp));
        if (a0 != null) rv.setImageViewBitmap(id(c, "cw_art0"), a0); else rv.setImageViewResource(id(c, "cw_art0"), res(c, "widget_art_blank", "drawable"));
        PendingIntent go0 = open(c, first.optString("v"), 10);
        rv.setOnClickPendingIntent(id(c, "cw_main"), go0);
        rv.setOnClickPendingIntent(id(c, "cw_resume_btn"), go0);
        for (int k = 0; k < EXTRA_ROWS; k++) {
            int[] r = new int[ROW_PARTS.length]; for (int j = 0; j < r.length; j++) r[j] = id(c, ROW_PARTS[j] + (k + 1));
            JSONObject it = items.optJSONObject(k + 1);
            if (it == null || k >= extra) { rv.setViewVisibility(r[0], View.GONE); continue; }
            rv.setViewVisibility(r[0], View.VISIBLE);
            rv.setTextViewText(r[2], it.optString("name"));
            rv.setTextViewText(r[3], it.optString("sub"));
            rv.setProgressBar(r[4], 100, Math.max(2, it.optInt("pct")), false);
            Bitmap a = art(c, it.optString("file"), Math.round(64 * dp), Math.round(36 * dp));
            if (a != null) rv.setImageViewBitmap(r[1], a); else rv.setImageViewResource(r[1], res(c, "widget_art_blank", "drawable"));
            rv.setOnClickPendingIntent(r[0], open(c, it.optString("v"), 11 + k));
        }
        return rv;
    }
}
