package com.mkcinema.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.tv.TvContract;
import android.net.Uri;
import android.os.Build;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;

import org.json.JSONObject;

/**
 * 1.6.0 TV extras.
 * Frame-rate matching: while a film plays, switch the TV to a refresh rate that is a whole multiple of the film's
 * frame rate (23.976 fps -> 23.976/24 Hz, 25 -> 50 Hz), same resolution, so motion does not judder. Off by default.
 * Watch Next: titles in progress appear in the "Continue watching" row on the Android TV / Google TV home screen.
 * Fire TV has no Watch Next provider; every call there just does nothing.
 */
final class TvExtras {
    private TvExtras() {}

    /** fps <= 0 restores the TV's own mode. Returns the refresh rate picked, or 0. */
    static float matchFrameRate(Activity a, float fps) {
        if (Build.VERSION.SDK_INT < 23 || a == null) return 0;
        Window w = a.getWindow();
        Display d = a.getWindowManager().getDefaultDisplay();
        WindowManager.LayoutParams lp = w.getAttributes();
        if (fps <= 0) { if (lp.preferredDisplayModeId != 0) { lp.preferredDisplayModeId = 0; w.setAttributes(lp); } return 0; }
        Display.Mode cur = d.getMode(), best = null; float bestScore = Float.MAX_VALUE;
        for (Display.Mode m : d.getSupportedModes()) {
            if (m.getPhysicalWidth() != cur.getPhysicalWidth() || m.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
            float r = m.getRefreshRate();
            for (int k = 1; k <= 3; k++) {
                float off = Math.abs(r - fps * k);
                if (off < 0.06f) { float score = off + (k - 1) * 0.5f; if (score < bestScore) { bestScore = score; best = m; } }
            }
        }
        if (best == null || best.getModeId() == cur.getModeId()) return best == null ? 0 : best.getRefreshRate();
        lp.preferredDisplayModeId = best.getModeId(); w.setAttributes(lp);
        return best.getRefreshRate();
    }


    /** json: {id, type, name, poster, background, positionMs, durationMs, season, episode, episodeTitle} */
    static boolean watchNext(Context c, String json) {
        if (Build.VERSION.SDK_INT < 26) return false;
        try {
            JSONObject o = new JSONObject(json);
            String id = o.optString("id", ""), type = o.optString("type", "movie");
            if (id.isEmpty() || id.length() > 80) return false;
            long pos = o.optLong("positionMs"), dur = o.optLong("durationMs");
            if (dur > 0 && pos > dur * 0.92) return removeWatchNext(c, id);
            ContentValues v = new ContentValues();
            boolean ep = "series".equals(type) && o.has("episode");
            v.put(TvContract.WatchNextPrograms.COLUMN_TYPE, ep ? TvContract.WatchNextPrograms.TYPE_TV_EPISODE : TvContract.WatchNextPrograms.TYPE_MOVIE);
            v.put(TvContract.WatchNextPrograms.COLUMN_WATCH_NEXT_TYPE, TvContract.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE);
            v.put(TvContract.WatchNextPrograms.COLUMN_TITLE, o.optString("name", "MKCinema"));
            if (ep) {
                v.put(TvContract.WatchNextPrograms.COLUMN_SEASON_DISPLAY_NUMBER, String.valueOf(o.optInt("season")));
                v.put(TvContract.WatchNextPrograms.COLUMN_EPISODE_DISPLAY_NUMBER, String.valueOf(o.optInt("episode")));
                String et = o.optString("episodeTitle", "");
                if (!et.isEmpty()) v.put(TvContract.WatchNextPrograms.COLUMN_EPISODE_TITLE, et);
            }
            String art = o.optString("background", "");
            if (art.isEmpty()) art = o.optString("poster", "");
            if (art.startsWith("https://")) {
                v.put(TvContract.WatchNextPrograms.COLUMN_POSTER_ART_URI, art);
                v.put(TvContract.WatchNextPrograms.COLUMN_POSTER_ART_ASPECT_RATIO, art.equals(o.optString("poster")) ? TvContract.WatchNextPrograms.ASPECT_RATIO_2_3 : TvContract.WatchNextPrograms.ASPECT_RATIO_16_9);
            }
            if (pos > 0) v.put(TvContract.WatchNextPrograms.COLUMN_LAST_PLAYBACK_POSITION_MILLIS, (int) Math.min(pos, Integer.MAX_VALUE));
            if (dur > 0) v.put(TvContract.WatchNextPrograms.COLUMN_DURATION_MILLIS, (int) Math.min(dur, Integer.MAX_VALUE));
            v.put(TvContract.WatchNextPrograms.COLUMN_LAST_ENGAGEMENT_TIME_UTC_MILLIS, System.currentTimeMillis());
            v.put(TvContract.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID, id);
            Uri open = Uri.parse(MainActivity.HOME + "#title?type=" + Uri.encode(type) + "&id=" + Uri.encode(id));
            v.put(TvContract.WatchNextPrograms.COLUMN_INTENT_URI, new Intent(Intent.ACTION_VIEW, open, c, MainActivity.class).toUri(Intent.URI_INTENT_SCHEME));
            ContentResolver cr = c.getContentResolver();
            long row = find(cr, id);
            if (row >= 0) cr.update(ContentUris.withAppendedId(TvContract.WatchNextPrograms.CONTENT_URI, row), v, null, null);
            else cr.insert(TvContract.WatchNextPrograms.CONTENT_URI, v);
            return true;
        } catch (Exception e) { return false; } // no provider (Fire TV), or the user blocked it
    }

    static boolean removeWatchNext(Context c, String id) {
        if (Build.VERSION.SDK_INT < 26) return false;
        try {
            ContentResolver cr = c.getContentResolver(); long row = find(cr, id);
            if (row >= 0) cr.delete(ContentUris.withAppendedId(TvContract.WatchNextPrograms.CONTENT_URI, row), null, null);
            return true;
        } catch (Exception e) { return false; }
    }

    private static long find(ContentResolver cr, String id) {
        try (Cursor q = cr.query(TvContract.WatchNextPrograms.CONTENT_URI, new String[] { TvContract.WatchNextPrograms._ID, TvContract.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID }, null, null, null)) {
            if (q == null) return -1;
            while (q.moveToNext()) if (id.equals(q.getString(1))) return q.getLong(0);
        }
        return -1;
    }
}
