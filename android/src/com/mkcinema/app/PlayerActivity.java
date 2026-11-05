package com.mkcinema.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Display;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** MKCinema's TV player (app 1.2.5): the system's hardware video player, so MKV, HEVC, HDR and Dolby Vision play the way
    the TV itself plays them. Remote: OK or Play/Pause pauses, Left/Right skip 10 s (30 s while held), Rewind/Fast forward
    skip 30 s, Menu switches the audio track, Up or Down shows the bar, Next plays the next episode, Back returns to
    MKCinema with the position so it is saved. With frame-rate matching on, the TV switches to the film's frame rate
    (24p films without judder) while the film plays and switches back afterwards. */
public class PlayerActivity extends Activity implements SurfaceHolder.Callback {
    MediaPlayer mp;
    SurfaceView surface;
    FrameLayout root;
    LinearLayout bar;
    TextView title, sub, time, note, subLine;
    ProgressBar seek;
    final Handler h = new Handler(Looper.getMainLooper());
    String url, subUrl;
    int startMs, audioIdx = -1;
    boolean prepared, matchRate, ended, wantNext, surfaceReady;
    long hideAt;
    int pendingSeek = -1;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        Intent i = getIntent();
        url = i.getStringExtra("url"); subUrl = i.getStringExtra("subUrl");
        startMs = i.getIntExtra("startMs", 0); matchRate = i.getBooleanExtra("matchRate", true);
        float d = getResources().getDisplayMetrics().density;

        root = new FrameLayout(this); root.setBackgroundColor(Color.BLACK);
        surface = new SurfaceView(this); surface.getHolder().addCallback(this);
        root.addView(surface, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));

        subLine = new TextView(this); subLine.setTextColor(Color.WHITE); subLine.setTextSize(26); subLine.setGravity(Gravity.CENTER);
        subLine.setShadowLayer(6, 0, 2, Color.BLACK); subLine.setPadding((int) (60 * d), 0, (int) (60 * d), (int) (36 * d));
        root.addView(subLine, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));

        bar = new LinearLayout(this); bar.setOrientation(LinearLayout.VERTICAL);
        int p = (int) (40 * d); bar.setPadding(p, (int) (60 * d), p, (int) (30 * d));
        GradientDrawable shade = new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[] { 0xE6000000, 0x00000000 });
        bar.setBackground(shade);
        title = text(22, Color.WHITE, Typeface.BOLD); sub = text(15, 0xFFB9B9C0, Typeface.NORMAL);
        seek = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); seek.setMax(1000);
        seek.getProgressDrawable().setTint(0xFFE9E6DE);
        time = text(15, 0xFFE9E6DE, Typeface.NORMAL);
        note = text(15, 0xFFCDB47E, Typeface.NORMAL);
        title.setText(i.getStringExtra("title")); sub.setText(i.getStringExtra("sub"));
        bar.addView(title); bar.addView(sub);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(-1, (int) (6 * d)); sl.topMargin = (int) (16 * d); bar.addView(seek, sl);
        LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); row.setPadding(0, (int) (8 * d), 0, 0);
        row.addView(time, new LinearLayout.LayoutParams(0, -2, 1)); row.addView(note);
        bar.addView(row);
        root.addView(bar, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        setContentView(root);
        note.setText("Loading…");
        if (matchRate && Build.VERSION.SDK_INT >= 23) new Thread(this::matchFrameRate).start();
        if (subUrl != null && !subUrl.isEmpty()) new Thread(this::loadSubs).start();
        h.post(tick);
    }

    TextView text(int sp, int color, int style) { TextView t = new TextView(this); t.setTextSize(sp); t.setTextColor(color); t.setTypeface(Typeface.create("sans-serif", style)); return t; }

    @Override public void surfaceCreated(SurfaceHolder holder) { surfaceReady = true; if (mp == null) start(holder); else mp.setDisplay(holder); }
    @Override public void surfaceChanged(SurfaceHolder holder, int f, int w, int hh) { }
    @Override public void surfaceDestroyed(SurfaceHolder holder) { surfaceReady = false; if (mp != null) try { mp.setDisplay(null); } catch (Exception ignored) { } }

    void start(SurfaceHolder holder) {
        mp = new MediaPlayer();
        try {
            mp.setDataSource(this, Uri.parse(url));
            mp.setDisplay(holder);
            mp.setScreenOnWhilePlaying(true);
            mp.setOnPreparedListener(m -> { prepared = true; fit(); if (startMs > 0) m.seekTo(startMs); m.start(); note.setText(""); show(4000); });
            mp.setOnVideoSizeChangedListener((m, w, hh) -> fit());
            mp.setOnCompletionListener(m -> { ended = true; finishWithResult(); });
            mp.setOnErrorListener((m, what, extra) -> { note.setText("This source won’t play here"); h.postDelayed(() -> { setResult(RESULT_CANCELED, new Intent().putExtra("error", what + ":" + extra)); finish(); }, 1800); return true; });
            mp.setOnInfoListener((m, what, extra) -> { if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) note.setText("Buffering…"); else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END) note.setText(""); return false; });
            mp.setOnTimedTextListener((m, t) -> subLine.setText(t == null ? "" : t.getText()));
            mp.prepareAsync();
        } catch (Exception e) { note.setText("This source won’t play here"); setResult(RESULT_CANCELED); h.postDelayed(this::finish, 1500); }
    }

    /** Letterbox the surface to the video's shape. */
    void fit() {
        if (mp == null) return;
        int vw = mp.getVideoWidth(), vh = mp.getVideoHeight(); if (vw == 0 || vh == 0) return;
        int sw = root.getWidth(), sh = root.getHeight(); if (sw == 0 || sh == 0) { root.post(this::fit); return; }
        float r = Math.min(sw / (float) vw, sh / (float) vh);
        surface.setLayoutParams(new FrameLayout.LayoutParams((int) (vw * r), (int) (vh * r), Gravity.CENTER));
    }

    /** Reads the video's frame rate and asks the TV for a display mode at the same resolution whose refresh rate is a whole multiple of it. */
    void matchFrameRate() {
        float fps = 0;
        MediaExtractor x = new MediaExtractor();
        try {
            x.setDataSource(url, new java.util.HashMap<>());
            for (int t = 0; t < x.getTrackCount(); t++) {
                MediaFormat f = x.getTrackFormat(t); String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("video/") && f.containsKey(MediaFormat.KEY_FRAME_RATE)) {
                    try { fps = f.getInteger(MediaFormat.KEY_FRAME_RATE); } catch (Exception e) { fps = f.getFloat(MediaFormat.KEY_FRAME_RATE); }
                    break;
                }
            }
        } catch (Exception ignored) { } finally { x.release(); }
        if (fps < 20 || fps > 70) return;
        final float want = Math.abs(fps - 24) < 0.6 ? 23.976f : fps;
        h.post(() -> {
            Display dsp = getWindowManager().getDefaultDisplay(); Display.Mode cur = dsp.getMode(), best = null; float bestErr = 1f;
            for (Display.Mode m : dsp.getSupportedModes()) {
                if (m.getPhysicalWidth() != cur.getPhysicalWidth() || m.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
                float ratio = m.getRefreshRate() / want, err = Math.abs(ratio - Math.round(ratio));
                if (Math.round(ratio) >= 1 && err < 0.01f && (best == null || err < bestErr || (err == bestErr && m.getRefreshRate() < best.getRefreshRate()))) { best = m; bestErr = err; }
            }
            if (best != null && best.getModeId() != cur.getModeId()) {
                WindowManager.LayoutParams lp = getWindow().getAttributes(); lp.preferredDisplayModeId = best.getModeId(); getWindow().setAttributes(lp);
                note.setText(String.format(java.util.Locale.US, "%.3f Hz", best.getRefreshRate())); h.postDelayed(() -> { if ("".equals(note.getText().toString()) || note.getText().toString().endsWith("Hz")) note.setText(""); }, 3000);
            }
        });
    }

    /** Subtitles: SRT is used as is, WebVTT is turned into SRT, then handed to the player's timed-text track. */
    void loadSubs() {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(subUrl).openConnection(); c.setConnectTimeout(8000); c.setReadTimeout(12000);
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) { String l; while ((l = r.readLine()) != null) sb.append(l).append('\n'); }
            String s = sb.toString().replace("﻿", "");
            if (s.trim().startsWith("WEBVTT")) {
                StringBuilder o = new StringBuilder(); int n = 1;
                for (String block : s.split("\n\\s*\n")) {
                    String[] ls = block.split("\n"); int ti = -1;
                    for (int k = 0; k < ls.length; k++) if (ls[k].contains("-->")) { ti = k; break; }
                    if (ti < 0) continue;
                    String tl = ls[ti].replaceAll("(\\d)\\.(\\d{3})", "$1,$2").replaceAll("\\s+(align|line|position|size|vertical):\\S+", "");
                    tl = tl.replaceAll("(^|\\s)(\\d{2}:\\d{2},\\d{3})", "$100:$2");
                    o.append(n++).append('\n').append(tl.trim()).append('\n');
                    for (int k = ti + 1; k < ls.length; k++) o.append(ls[k].replaceAll("<[^>]+>", "")).append('\n');
                    o.append('\n');
                }
                s = o.toString();
            }
            File f = new File(getCacheDir(), "subs.srt");
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(s.getBytes(StandardCharsets.UTF_8)); }
            h.post(() -> attachSubs(f, 0));
        } catch (Exception ignored) { }
    }
    void attachSubs(File f, int tries) {
        if (!prepared) { if (tries < 60) h.postDelayed(() -> attachSubs(f, tries + 1), 500); return; }
        try {
            mp.addTimedTextSource(f.getAbsolutePath(), MediaPlayer.MEDIA_MIMETYPE_TEXT_SUBRIP);
            MediaPlayer.TrackInfo[] tr = mp.getTrackInfo();
            for (int k = tr.length - 1; k >= 0; k--) if (tr[k].getTrackType() == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_TIMEDTEXT) { mp.selectTrack(k); break; }
        } catch (Exception ignored) { }
    }

    void cycleAudio() {
        if (!prepared) return;
        try {
            MediaPlayer.TrackInfo[] tr = mp.getTrackInfo(); java.util.List<Integer> au = new java.util.ArrayList<>();
            for (int k = 0; k < tr.length; k++) if (tr[k].getTrackType() == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO) au.add(k);
            if (au.size() < 2) { note.setText("Only one audio track"); show(2500); return; }
            int cur = Build.VERSION.SDK_INT >= 21 ? mp.getSelectedTrack(MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO) : -1;
            int next = au.get((au.indexOf(cur) + 1) % au.size());
            mp.selectTrack(next);
            String lang = tr[next].getLanguage(); note.setText("Audio: " + (lang == null || "und".equals(lang) ? "track " + (au.indexOf(next) + 1) : new java.util.Locale(lang).getDisplayLanguage()));
            show(3000);
        } catch (Exception e) { note.setText("Audio can’t be switched on this source"); show(2500); }
    }

    final Runnable tick = new Runnable() { @Override public void run() {
        if (prepared && mp != null) {
            try {
                int pos = pendingSeek >= 0 ? pendingSeek : mp.getCurrentPosition(), dur = mp.getDuration();
                if (dur > 0) seek.setProgress((int) (pos * 1000L / dur));
                time.setText(fmt(pos) + "  /  " + fmt(dur) + (mp.isPlaying() ? "" : "   Paused"));
            } catch (Exception ignored) { }
        }
        if (hideAt > 0 && System.currentTimeMillis() > hideAt && mp != null && mp.isPlaying()) { bar.setVisibility(View.GONE); hideAt = 0; }
        h.postDelayed(this, 500);
    } };
    static String fmt(int ms) { int s = Math.max(0, ms / 1000); return s >= 3600 ? String.format(java.util.Locale.US, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String.format(java.util.Locale.US, "%d:%02d", s / 60, s % 60); }
    void show(long ms) { bar.setVisibility(View.VISIBLE); hideAt = System.currentTimeMillis() + ms; }

    final Runnable doSeek = () -> { if (pendingSeek >= 0 && mp != null) { try { mp.seekTo(pendingSeek); } catch (Exception ignored) { } pendingSeek = -1; } };
    void skip(int ms) {
        if (!prepared) return;
        int base = pendingSeek >= 0 ? pendingSeek : mp.getCurrentPosition(), dur = mp.getDuration();
        pendingSeek = Math.max(0, Math.min(dur > 0 ? dur - 1000 : Integer.MAX_VALUE, base + ms));
        h.removeCallbacks(doSeek); h.postDelayed(doSeek, 450); show(3500); tick.run(); h.removeCallbacks(tick); h.postDelayed(tick, 500);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(e);
        int k = e.getKeyCode(); boolean held = e.getRepeatCount() > 0;
        switch (k) {
            case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case KeyEvent.KEYCODE_SPACE:
                if (prepared) { if (mp.isPlaying()) { mp.pause(); show(Long.MAX_VALUE / 4); } else { mp.start(); show(2500); } } return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: if (prepared) mp.start(); show(2500); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: if (prepared) mp.pause(); show(Long.MAX_VALUE / 4); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT: skip(held ? -30000 : -10000); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT: skip(held ? 30000 : 10000); return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND: skip(-30000); return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: skip(30000); return true;
            case KeyEvent.KEYCODE_DPAD_UP: case KeyEvent.KEYCODE_DPAD_DOWN: show(4000); return true;
            case KeyEvent.KEYCODE_MENU: cycleAudio(); return true;
            case KeyEvent.KEYCODE_MEDIA_NEXT: wantNext = true; finishWithResult(); return true;
            case KeyEvent.KEYCODE_BACK: case KeyEvent.KEYCODE_ESCAPE: finishWithResult(); return true;
        }
        return super.dispatchKeyEvent(e);
    }

    void finishWithResult() {
        Intent r = new Intent();
        try { if (prepared) { r.putExtra("pos", pendingSeek >= 0 ? pendingSeek : mp.getCurrentPosition()); r.putExtra("dur", mp.getDuration()); } } catch (Exception ignored) { }
        r.putExtra("ended", ended); r.putExtra("next", wantNext);
        setResult(RESULT_OK, r); finish();
    }

    @Override protected void onPause() { super.onPause(); if (mp != null && prepared && mp.isPlaying()) mp.pause(); }
    @Override protected void onDestroy() { super.onDestroy(); h.removeCallbacksAndMessages(null); if (mp != null) { try { mp.release(); } catch (Exception ignored) { } mp = null; } }
}
