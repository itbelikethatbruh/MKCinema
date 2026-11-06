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
    final java.util.HashMap<String, String> hdr = new java.util.HashMap<>();
    String url, subUrl;
    int startMs, audioIdx = -1;
    boolean prepared, matchRate, ended, wantNext, surfaceReady;
    long hideAt;
    int pendingSeek = -1;
    /** 1.6.1: the options row under the bar (Audio, Subtitles, Sources, Full player); sel is the highlighted one, -1 for none */
    LinearLayout opts; final java.util.List<TextView> optBtns = new java.util.ArrayList<>(); int sel = -1;
    String audioLang, action;
    boolean hinted;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        Intent i = getIntent();
        url = i.getStringExtra("url"); subUrl = i.getStringExtra("subUrl");
        // request headers some sources need (Referer, User-Agent...), sent by the player itself
        try { String hj = i.getStringExtra("headers"); if (hj != null && !hj.isEmpty()) { org.json.JSONObject ho = new org.json.JSONObject(hj); java.util.Iterator<String> it = ho.keys(); while (it.hasNext()) { String k = it.next(); hdr.put(k, ho.optString(k)); } } } catch (Exception ignored) { }
        audioLang = i.getStringExtra("audioLang");
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
        // the bar sits in a taller strip so a finger can drag it
        FrameLayout seekBox = new FrameLayout(this);
        seekBox.addView(seek, new FrameLayout.LayoutParams(-1, (int) (6 * d), Gravity.CENTER_VERTICAL));
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(-1, (int) (30 * d)); sl.topMargin = (int) (4 * d); bar.addView(seekBox, sl);
        LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER_VERTICAL);
        playBtn = text(15, Color.WHITE, Typeface.BOLD); playBtn.setPadding(0, (int) (6 * d), (int) (18 * d), (int) (6 * d));
        row.addView(playBtn);
        row.addView(time, new LinearLayout.LayoutParams(0, -2, 1)); row.addView(note);
        bar.addView(row);
        opts = new LinearLayout(this); opts.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams ol = new LinearLayout.LayoutParams(-2, -2); ol.topMargin = (int) (12 * d); bar.addView(opts, ol);
        String[][] ob = { { "audio", "Audio" }, { "subs", "Subtitles" }, { "sources", "Other sources" }, { "web", "Full player" } };
        for (String[] o : ob) {
            TextView t = text(15, Color.WHITE, Typeface.BOLD); t.setText(o[1]); t.setTag(o[0]);
            t.setPadding((int) (16 * d), (int) (8 * d), (int) (16 * d), (int) (8 * d));
            LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(-2, -2); bl.rightMargin = (int) (10 * d);
            t.setOnClickListener(v -> runOpt((String) v.getTag()));
            opts.addView(t, bl); optBtns.add(t);
        }
        paintOpts();
        root.addView(bar, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        setContentView(root);
        touch = !getPackageManager().hasSystemFeature("android.software.leanback") && getResources().getConfiguration().touchscreen != android.content.res.Configuration.TOUCHSCREEN_NOTOUCH;
        if (touch) setupTouch(seekBox, d); else playBtn.setVisibility(View.GONE);
        note.setText("Loading…");
        // 1.6.1: frame-rate matching reads the file only once the player has opened it (see onPrepared), not at the same time
        if (subUrl != null && !subUrl.isEmpty()) new Thread(this::loadSubs).start();
        h.post(tick);
    }

    TextView playBtn;
    boolean touch;

    /** Phones and tablets: tap shows or hides the bar, double-tap the left or right side skips 10 s, double-tap the
        middle pauses, the bar can be dragged, and the Play/Pause label works. Films turn the phone sideways. */
    void setupTouch(FrameLayout seekBox, float d) {
        setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        final android.view.GestureDetector g = new android.view.GestureDetector(this, new android.view.GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(android.view.MotionEvent e) { return true; }
            @Override public boolean onSingleTapConfirmed(android.view.MotionEvent e) {
                if (bar.getVisibility() == View.VISIBLE && hideAt != 0) { bar.setVisibility(View.GONE); hideAt = 0; } else show(4000);
                return true;
            }
            @Override public boolean onDoubleTap(android.view.MotionEvent e) {
                float w = root.getWidth();
                if (e.getX() < w / 3) skip(-10000); else if (e.getX() > w * 2 / 3) skip(10000); else togglePlay();
                return true;
            }
        });
        root.setOnTouchListener((v, e) -> g.onTouchEvent(e));
        playBtn.setOnClickListener(v -> togglePlay());
        seekBox.setOnTouchListener((v, e) -> {
            if (!prepared || mp == null) return true;
            int dur = mp.getDuration(); if (dur <= 0) return true;
            float f = Math.max(0f, Math.min(1f, e.getX() / Math.max(1, v.getWidth())));
            pendingSeek = (int) (f * dur); show(4000); tick.run(); h.removeCallbacks(tick); h.postDelayed(tick, 500);
            if (e.getAction() == android.view.MotionEvent.ACTION_UP || e.getAction() == android.view.MotionEvent.ACTION_CANCEL) { h.removeCallbacks(doSeek); doSeek.run(); }
            return true;
        });
    }

    void togglePlay() {
        if (!prepared || mp == null) return;
        if (mp.isPlaying()) { mp.pause(); show(Long.MAX_VALUE / 4); } else { mp.start(); show(2500); }
    }

    TextView text(int sp, int color, int style) { TextView t = new TextView(this); t.setTextSize(sp); t.setTextColor(color); t.setTypeface(Typeface.create("sans-serif", style)); return t; }

    @Override public void surfaceCreated(SurfaceHolder holder) { surfaceReady = true; if (mp == null) start(holder); else mp.setDisplay(holder); }
    @Override public void surfaceChanged(SurfaceHolder holder, int f, int w, int hh) { }
    @Override public void surfaceDestroyed(SurfaceHolder holder) { surfaceReady = false; if (mp != null) try { mp.setDisplay(null); } catch (Exception ignored) { } }

    void start(SurfaceHolder holder) {
        mp = new MediaPlayer();
        try {
            mp.setDataSource(this, Uri.parse(url), hdr);
            mp.setDisplay(holder);
            mp.setScreenOnWhilePlaying(true);
            mp.setOnPreparedListener(m -> {
                prepared = true; fit(); pickAudio(); if (startMs > 0) m.seekTo(startMs); m.start();
                note.setText(touch || hinted ? "" : "Press ▼ for audio, subtitles and sources"); hinted = true; show(touch ? 4000 : 6000);
                // 1.6.1: a second connection to the same file while the player was still opening it doubled the memory and
                // network load on 2 GB TVs (and some debrid links allow one connection at a time)
                if (matchRate && Build.VERSION.SDK_INT >= 23) new Thread(this::matchFrameRate).start();
            });
            mp.setOnVideoSizeChangedListener((m, w, hh) -> fit());
            mp.setOnCompletionListener(m -> { ended = true; finishWithResult(); });
            mp.setOnErrorListener((m, what, extra) -> { note.setText("This source won’t play here"); h.postDelayed(() -> { setResult(RESULT_CANCELED, new Intent().putExtra("error", what + ":" + extra)); finish(); }, 1800); return true; });
            mp.setOnInfoListener((m, what, extra) -> { if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) note.setText("Buffering…"); else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END) note.setText(""); return false; });
            mp.setOnTimedTextListener((m, t) -> subLine.setText(t == null ? "" : t.getText()));
            mp.prepareAsync();
        } catch (Exception e) {
            // 1.6.1: report it as an error so MKCinema tries its own player, instead of closing as if you pressed Back
            note.setText("This source won’t play here");
            setResult(RESULT_CANCELED, new Intent().putExtra("error", "open:" + e.getClass().getSimpleName()));
            h.postDelayed(this::finish, 1500);
        }
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
            x.setDataSource(url, hdr);
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
            java.io.InputStream src;
            if (subUrl.startsWith("/")) src = new java.io.FileInputStream(subUrl);
            else { HttpURLConnection c = (HttpURLConnection) new URL(subUrl).openConnection(); c.setConnectTimeout(8000); c.setReadTimeout(12000); src = c.getInputStream(); }
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(src, StandardCharsets.UTF_8))) { String l; while ((l = r.readLine()) != null) sb.append(l).append('\n'); }
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

    void paintOpts() {
        float d = getResources().getDisplayMetrics().density;
        for (int k = 0; k < optBtns.size(); k++) {
            GradientDrawable g = new GradientDrawable(); g.setCornerRadius(999);
            boolean on = k == sel;
            g.setColor(on ? 0xFFE9E6DE : 0x33FFFFFF); if (!on) g.setStroke((int) Math.max(1, d), 0x40FFFFFF);
            optBtns.get(k).setBackground(g); optBtns.get(k).setTextColor(on ? 0xFF0B0B0C : Color.WHITE);
        }
    }

    void runOpt(String o) {
        if ("audio".equals(o)) openTracks(false);
        else if ("subs".equals(o)) openTracks(true);
        else { action = o; finishWithResult(); } // MKCinema opens the film's source list, or plays it in its own player
    }

    /** Multi-language files (MULTi, Dual Audio) start in the audio language picked in Settings › Playback. */
    void pickAudio() {
        if (audioLang == null || audioLang.isEmpty() || "any".equals(audioLang)) return;
        try {
            java.util.Set<String> want = langCodes(audioLang);
            MediaPlayer.TrackInfo[] tr = mp.getTrackInfo(); int first = -1;
            for (int k = 0; k < tr.length; k++) {
                if (tr[k].getTrackType() != MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO) continue;
                if (first < 0) first = k;
                String l = tr[k].getLanguage();
                if (l != null && want.contains(l.toLowerCase(java.util.Locale.ROOT))) { if (k != first) mp.selectTrack(k); return; }
            }
        } catch (Exception ignored) { }
    }
    static java.util.Set<String> langCodes(String c) {
        java.util.Set<String> s = new java.util.HashSet<>(); c = c.toLowerCase(java.util.Locale.ROOT); s.add(c);
        String[][] same = { { "eng", "en" }, { "spa", "es" }, { "fre", "fra", "fr" }, { "ger", "deu", "de" }, { "ita", "it" }, { "por", "pt" }, { "hin", "hi" }, { "jpn", "ja" }, { "kor", "ko" } };
        for (String[] g : same) if (java.util.Arrays.asList(g).contains(c)) s.addAll(java.util.Arrays.asList(g));
        return s;
    }

    /** Track list like VLC's: every audio or subtitle track inside the file, picked from a list at any time.
        Up/Down move, OK picks, Back or Left closes. Tapping works on phones. */
    LinearLayout picker; final java.util.List<TextView> pickRows = new java.util.ArrayList<>(); final java.util.List<Runnable> pickActs = new java.util.ArrayList<>(); int pickSel;

    String trackLabel(MediaPlayer.TrackInfo t, int n) {
        String lang = t.getLanguage(), name = lang == null || lang.isEmpty() || "und".equals(lang) ? "" : new java.util.Locale(lang).getDisplayLanguage();
        String extra = "";
        try {
            MediaFormat f = Build.VERSION.SDK_INT >= 19 ? t.getFormat() : null;
            if (f != null) {
                String mime = f.getString(MediaFormat.KEY_MIME);
                if (mime != null) { String m = mime.replaceFirst("^[a-z]+/", "").replace("vnd.dts.hd", "DTS-HD").replace("vnd.dts", "DTS").replace("eac3-joc", "Atmos").replace("eac3", "E-AC3").replace("ac3", "AC3").replace("mp4a-latm", "AAC").replace("true-hd", "TrueHD"); extra = m.toUpperCase(java.util.Locale.ROOT).replace("ATMOS", "Atmos"); }
                if (f.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) { int ch = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT); extra += (extra.isEmpty() ? "" : " ") + (ch == 6 ? "5.1" : ch == 8 ? "7.1" : ch == 2 ? "stereo" : ch == 1 ? "mono" : ch + " ch"); }
            }
        } catch (Exception ignored) { }
        String label = name.isEmpty() ? "Track " + n : name;
        return extra.isEmpty() ? label : label + "  ·  " + extra;
    }

    void openTracks(boolean subs) {
        if (!prepared) return;
        MediaPlayer.TrackInfo[] tr;
        try { tr = mp.getTrackInfo(); } catch (Exception e) { note.setText("Tracks can’t be read on this source"); show(2500); return; }
        java.util.List<Integer> list = new java.util.ArrayList<>();
        for (int k = 0; k < tr.length; k++) {
            int t = tr[k].getTrackType();
            if (subs ? (t == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_TIMEDTEXT || t == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_SUBTITLE) : t == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO) list.add(k);
        }
        if (!subs && list.size() < 2) { note.setText(list.isEmpty() ? "No audio tracks reported" : "This file has one audio track" + (list.isEmpty() ? "" : ": " + trackLabel(tr[list.get(0)], 1))); show(3500); return; }
        if (subs && list.isEmpty()) { note.setText("No subtitles in this file. Full player can search for more"); show(4000); return; }
        int cur = -1;
        try {
            if (!subs) cur = mp.getSelectedTrack(MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO);
            else for (int k : list) if (mp.getSelectedTrack(tr[k].getTrackType()) == k) { cur = k; break; }
        } catch (Exception ignored) { }
        closePicker();
        float d = getResources().getDisplayMetrics().density;
        picker = new LinearLayout(this); picker.setOrientation(LinearLayout.VERTICAL);
        int pp = (int) (14 * d); picker.setPadding(pp, pp, pp, pp);
        GradientDrawable bg = new GradientDrawable(); bg.setColor(0xF0141417); bg.setCornerRadius(16 * d); bg.setStroke((int) Math.max(1, d), 0x26FFFFFF); picker.setBackground(bg);
        TextView head = text(13, 0xFFB9B9C0, Typeface.BOLD); head.setText(subs ? "SUBTITLES" : "AUDIO"); head.setPadding((int) (12 * d), 0, 0, (int) (8 * d)); picker.addView(head);
        pickRows.clear(); pickActs.clear(); pickSel = 0;
        final MediaPlayer.TrackInfo[] T = tr; final int curF = cur;
        if (subs) addPick("Off", cur < 0, () -> { try { if (curF >= 0) mp.deselectTrack(curF); } catch (Exception ignored) { } subLine.setText(""); note.setText("Subtitles off"); });
        int n = 1;
        for (int k : list) {
            final int idx = k; final String lab = trackLabel(T[k], n++);
            if (k == cur) pickSel = pickRows.size();
            addPick(lab, k == cur, () -> {
                try { if (subs && curF >= 0 && curF != idx) mp.deselectTrack(curF); mp.selectTrack(idx); note.setText((subs ? "Subtitles: " : "Audio: ") + lab); }
                catch (Exception e) { note.setText(subs ? "That subtitle can’t be shown here" : "That audio track can’t be played here"); }
            });
        }
        android.widget.ScrollView sc = new android.widget.ScrollView(this); sc.addView(picker);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams((int) (360 * d), -2, Gravity.END | Gravity.CENTER_VERTICAL); lp.rightMargin = (int) (40 * d);
        root.addView(sc, lp); paintPick(); bar.setVisibility(View.GONE); hideAt = 0;
    }
    void addPick(String label, boolean on, Runnable act) {
        float d = getResources().getDisplayMetrics().density;
        TextView t = text(16, Color.WHITE, Typeface.NORMAL); t.setText((on ? "✓  " : "     ") + label);
        t.setPadding((int) (12 * d), (int) (10 * d), (int) (12 * d), (int) (10 * d));
        final int i = pickRows.size(); t.setOnClickListener(v -> { pickSel = i; choosePick(); });
        picker.addView(t, new LinearLayout.LayoutParams(-1, -2)); pickRows.add(t); pickActs.add(act);
    }
    void paintPick() {
        float d = getResources().getDisplayMetrics().density;
        for (int k = 0; k < pickRows.size(); k++) {
            boolean on = k == pickSel; GradientDrawable g = new GradientDrawable(); g.setCornerRadius(10 * d); g.setColor(on ? 0xFFE9E6DE : 0x00000000);
            pickRows.get(k).setBackground(g); pickRows.get(k).setTextColor(on ? 0xFF0B0B0C : Color.WHITE);
        }
    }
    void choosePick() { Runnable r = pickActs.get(pickSel); closePicker(); r.run(); show(3000); }
    void closePicker() { if (picker != null) { root.removeView((View) picker.getParent()); picker = null; } }

    final Runnable tick = new Runnable() { @Override public void run() {
        if (prepared && mp != null) {
            try {
                int pos = pendingSeek >= 0 ? pendingSeek : mp.getCurrentPosition(), dur = mp.getDuration();
                if (dur > 0) seek.setProgress((int) (pos * 1000L / dur));
                time.setText(fmt(pos) + "  /  " + fmt(dur) + (mp.isPlaying() || touch ? "" : "   Paused"));
                if (touch) playBtn.setText(mp.isPlaying() ? "❚❚  Pause" : "▶  Play");
            } catch (Exception ignored) { }
        }
        if (hideAt > 0 && System.currentTimeMillis() > hideAt && mp != null && mp.isPlaying()) { bar.setVisibility(View.GONE); hideAt = 0; if (sel >= 0) { sel = -1; paintOpts(); } }
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
        if (picker != null) {
            switch (k) {
                case KeyEvent.KEYCODE_DPAD_UP: pickSel = Math.max(0, pickSel - 1); paintPick(); return true;
                case KeyEvent.KEYCODE_DPAD_DOWN: pickSel = Math.min(pickRows.size() - 1, pickSel + 1); paintPick(); return true;
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: choosePick(); return true;
                case KeyEvent.KEYCODE_BACK: case KeyEvent.KEYCODE_ESCAPE: case KeyEvent.KEYCODE_DPAD_LEFT: closePicker(); show(8000); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: return true;
            }
        }
        // the options row: Down opens it, Left/Right move, OK picks, Up or Back leaves it
        if (sel >= 0) {
            switch (k) {
                case KeyEvent.KEYCODE_DPAD_LEFT: sel = Math.max(0, sel - 1); paintOpts(); show(8000); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: sel = Math.min(optBtns.size() - 1, sel + 1); paintOpts(); show(8000); return true;
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: runOpt((String) optBtns.get(sel).getTag()); return true;
                case KeyEvent.KEYCODE_DPAD_UP: case KeyEvent.KEYCODE_BACK: case KeyEvent.KEYCODE_ESCAPE: sel = -1; paintOpts(); show(3000); return true;
                case KeyEvent.KEYCODE_DPAD_DOWN: show(8000); return true;
            }
        }
        if (k == KeyEvent.KEYCODE_DPAD_DOWN && prepared) { sel = 0; paintOpts(); show(8000); if (note.getText().toString().startsWith("Press")) note.setText(""); return true; }
        switch (k) {
            case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case KeyEvent.KEYCODE_SPACE:
                if (prepared) { if (mp.isPlaying()) { mp.pause(); show(Long.MAX_VALUE / 4); } else { mp.start(); show(2500); } } return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: if (prepared) mp.start(); show(2500); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: if (prepared) mp.pause(); show(Long.MAX_VALUE / 4); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT: skip(held ? -30000 : -10000); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT: skip(held ? 30000 : 10000); return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND: skip(-30000); return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: skip(30000); return true;
            case KeyEvent.KEYCODE_DPAD_UP: show(4000); return true;
            case KeyEvent.KEYCODE_MENU: openTracks(false); return true;
            case KeyEvent.KEYCODE_MEDIA_NEXT: wantNext = true; finishWithResult(); return true;
            case KeyEvent.KEYCODE_BACK: case KeyEvent.KEYCODE_ESCAPE: finishWithResult(); return true;
        }
        return super.dispatchKeyEvent(e);
    }

    void finishWithResult() {
        Intent r = new Intent();
        try { if (prepared) { r.putExtra("pos", pendingSeek >= 0 ? pendingSeek : mp.getCurrentPosition()); r.putExtra("dur", mp.getDuration()); } } catch (Exception ignored) { }
        r.putExtra("ended", ended); r.putExtra("next", wantNext); if (action != null) r.putExtra("action", action);
        setResult(RESULT_OK, r); finish();
    }

    @Override protected void onPause() { super.onPause(); if (mp != null && prepared && mp.isPlaying()) mp.pause(); }
    @Override protected void onDestroy() { super.onDestroy(); h.removeCallbacksAndMessages(null); if (mp != null) { try { mp.release(); } catch (Exception ignored) { } mp = null; } }
}
