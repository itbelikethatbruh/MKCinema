package com.mkcinema.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;

/** 1.14.0: "Open with MKCinema" for video files and video links from other apps (Files, Downloads, a browser, a
    file manager on a USB drive), like VLC. The file plays in MKCinema Player straight away; nothing is copied. */
public class OpenActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Intent in = getIntent(); Uri u = in == null ? null : in.getData();
        String s = u == null ? null : u.getScheme();
        if (u == null || !("content".equals(s) || "http".equals(s) || "https".equals(s))) { finish(); return; }
        String name = null;
        if ("content".equals(s)) {
            try (Cursor c = getContentResolver().query(u, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            } catch (Exception ignored) { }
        }
        if (name == null || name.isEmpty()) { name = u.getLastPathSegment(); if (name == null) name = "Video"; }
        Intent p = new Intent(this, PlayerActivity.class).setDataAndType(u, in.getType())
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .putExtra("url", u.toString()).putExtra("title", name.replaceFirst("\\.[A-Za-z0-9]{2,4}$", "")).putExtra("sub", "")
            .putExtra("local", true).putExtra("matchRate", true)
            .putExtra("engine", getSharedPreferences("mk", MODE_PRIVATE).getString("engine", "mpv"))
            .putExtra("slow", getSharedPreferences("mk", MODE_PRIVATE).getBoolean("slow", false));
        try { startActivity(p); } catch (Exception ignored) { }
        finish();
    }
}
