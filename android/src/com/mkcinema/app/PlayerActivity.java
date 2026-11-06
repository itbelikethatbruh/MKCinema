package com.mkcinema.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
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
import android.widget.ImageView;
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
    the TV itself plays them. 1.7.0: the engine is ExoPlayer (Media3), with the system player as the fallback (see Engine). Remote: OK or Play/Pause pauses, Left/Right skip 10 s (30 s while held), Rewind/Fast forward
    skip 30 s, Menu switches the audio track, Up or Down shows the bar, Next plays the next episode, Back returns to
    MKCinema with the position so it is saved. With frame-rate matching on, the TV switches to the film's frame rate
    (24p films without judder) while the film plays and switches back afterwards. */
public class PlayerActivity extends Activity implements SurfaceHolder.Callback, Engine.Listener {
    Engine eng; boolean fellBack; String engineName; File subFile; boolean subsWaited;
    ImageView subImg; int vw, vh; float par = 1f;
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
        engineName = i.getStringExtra("engine"); if (engineName == null || engineName.isEmpty()) engineName = "exo";
        float d = getResources().getDisplayMetrics().density;

        root = new FrameLayout(this); root.setBackgroundColor(Color.BLACK);
        surface = new SurfaceView(this); surface.getHolder().addCallback(this);
        root.addView(surface, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));

        subLine = new TextView(this); subLine.setTextColor(Color.WHITE); subLine.setTextSize(26); subLine.setGravity(Gravity.CENTER);
        subLine.setShadowLayer(6, 0, 2, Color.BLACK); subLine.setPadding((int) (60 * d), 0, (int) (60 * d), (int) (36 * d));
        root.addView(subLine, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        subImg = new ImageView(this); subImg.setAdjustViewBounds(true); subImg.setVisibility(View.GONE);
        root.addView(subImg, new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL));

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
        // the film opens once its subtitles are downloaded, or after 3 s without them (they're added when they arrive)
        if (subUrl != null && !subUrl.isEmpty()) { new Thread(this::loadSubs).start(); h.postDelayed(() -> { subsWaited = true; maybeStart(); }, 3000); } else subsWaited = true;
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
            if (!prepared || eng == null) return true;
            int dur = (int) eng.dur(); if (dur <= 0) return true;
            float f = Math.max(0f, Math.min(1f, e.getX() / Math.max(1, v.getWidth())));
            pendingSeek = (int) (f * dur); show(4000); tick.run(); h.removeCallbacks(tick); h.postDelayed(tick, 500);
            if (e.getAction() == android.view.MotionEvent.ACTION_UP || e.getAction() == android.view.MotionEvent.ACTION_CANCEL) { h.removeCallbacks(doSeek); doSeek.run(); }
            return true;
        });
    }

    void togglePlay() {
        if (!prepared || eng == null) return;
        if (eng.playing()) { eng.pause(); show(Long.MAX_VALUE / 4); } else { eng.play(); show(2500); }
    }

    TextView text(int sp, int color, int style) { TextView t = new TextView(this); t.setTextSize(sp); t.setTextColor(color); t.setTypeface(Typeface.create("sans-serif", style)); return t; }

    @Override public void surfaceCreated(SurfaceHolder holder) { surfaceReady = true; if (eng == null) maybeStart(); else eng.surface(holder); }
    @Override public void surfaceChanged(SurfaceHolder holder, int f, int w, int hh) { }
    @Override public void surfaceDestroyed(SurfaceHolder holder) { surfaceReady = false; if (eng != null) eng.surface(null); }

    void maybeStart() {
        if (eng != null || !surfaceReady || !subsWaited || isFinishing()) return;
        try { eng = "system".equals(engineName) ? new MpEngine(this, this) : new ExoEngine(this, this); }
        catch (Throwable t) { fellBack = true; eng = new MpEngine(this, this); } // ExoPlayer missing or broken on this device
        eng.open(url, hdr, subFile, audioLang, startMs, surface.getHolder());
    }

    // ---- Engine.Listener ----
    @Override public void ready() {
        prepared = true; fit();
        note.setText(touch || hinted ? "" : "Press ▼ for audio, subtitles and sources"); hinted = true; show(touch ? 4000 : 6000);
        if (fellBack) { note.setText("Playing with the basic player"); h.postDelayed(() -> { if (note.getText().toString().startsWith("Playing with")) note.setText(""); }, 4000); }
    }
    @Override public void size(int w, int hh, float p) { vw = w; vh = hh; par = p > 0 ? p : 1f; fit(); }
    @Override public void ended() { ended = true; finishWithResult(); }
    @Override public void buffering(boolean on) { if (on) note.setText("Buffering…"); else if (note.getText().toString().startsWith("Buffering")) note.setText(""); }
    @Override public void text(CharSequence t, android.graphics.Bitmap pic, float picW) {
        subLine.setText(t == null ? "" : t);
        if (pic == null) { subImg.setVisibility(View.GONE); subImg.setImageDrawable(null); return; }
        subImg.setImageBitmap(pic);
        int w = root.getWidth() > 0 && picW > 0 && picW <= 1 ? (int) (root.getWidth() * picW) : -2;
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL); lp.bottomMargin = (int) (24 * getResources().getDisplayMetrics().density);
        subImg.setLayoutParams(lp); subImg.setVisibility(View.VISIBLE);
    }
    @Override public void frameRate(float fps) { if (matchRate && Build.VERSION.SDK_INT >= 23) matchFrameRate(fps); }
    @Override public void error(String code, boolean beforeReady) {
        // 1.7.0: a file ExoPlayer can't open gets one try in the basic player before MKCinema's own player takes over
        if (beforeReady && eng instanceof ExoEngine && !fellBack && !isFinishing()) {
            fellBack = true; eng.release(); eng = null; prepared = false; note.setText("Trying the basic player…");
            eng = new MpEngine(this, this); eng.open(url, hdr, subFile, audioLang, startMs, surface.getHolder());
            return;
        }
        note.setText("This source won’t play here");
        if (!beforeReady && prepared) { h.postDelayed(this::finishWithResult, 1800); return; } // keeps the position so it is saved
        h.postDelayed(() -> { setResult(RESULT_CANCELED, new Intent().putExtra("error", code)); finish(); }, 1800);
    }

    /** Letterbox the surface to the video's shape. */
    void fit() {
        if (vw == 0 || vh == 0) return;
        int sw = root.getWidth(), sh = root.getHeight(); if (sw == 0 || sh == 0) { root.post(this::fit); return; }
        float w = vw * par, r = Math.min(sw / w, sh / (float) vh);
        surface.setLayoutParams(new FrameLayout.LayoutParams((int) (w * r), (int) (vh * r), Gravity.CENTER));
    }

    /** Asks the TV for a display mode at the same resolution whose refresh rate is a whole multiple of it. */
    void matchFrameRate(float fps) {
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
            h.post(() -> { subFile = f; if (eng != null) eng.addSubs(f); else { subsWaited = true; maybeStart(); } });
        } catch (Exception ignored) { h.post(() -> { subsWaited = true; maybeStart(); }); }
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

    /** Track list like VLC's: every audio or subtitle track inside the file, picked from a list at any time.
        Up/Down move, OK picks, Back or Left closes. Tapping works on phones. */
    LinearLayout picker; final java.util.List<TextView> pickRows = new java.util.ArrayList<>(); final java.util.List<Runnable> pickActs = new java.util.ArrayList<>(); int pickSel;

    void openTracks(boolean subs) {
        if (!prepared || eng == null) return;
        java.util.List<Engine.Track> list;
        try { list = eng.tracks(subs); } catch (Exception e) { note.setText("Tracks can’t be read on this source"); show(2500); return; }
        if (!subs && list.size() < 2) { note.setText(list.isEmpty() ? "No audio tracks reported" : "This file has one audio track: " + list.get(0).label); show(3500); return; }
        if (subs && list.isEmpty()) { note.setText("No subtitles in this file. Full player can search for more"); show(4000); return; }
        boolean any = false; for (Engine.Track t : list) any |= t.on;
        closePicker();
        float d = getResources().getDisplayMetrics().density;
        picker = new LinearLayout(this); picker.setOrientation(LinearLayout.VERTICAL);
        int pp = (int) (14 * d); picker.setPadding(pp, pp, pp, pp);
        GradientDrawable bg = new GradientDrawable(); bg.setColor(0xF0141417); bg.setCornerRadius(16 * d); bg.setStroke((int) Math.max(1, d), 0x26FFFFFF); picker.setBackground(bg);
        TextView head = text(13, 0xFFB9B9C0, Typeface.BOLD); head.setText(subs ? "SUBTITLES" : "AUDIO"); head.setPadding((int) (12 * d), 0, 0, (int) (8 * d)); picker.addView(head);
        pickRows.clear(); pickActs.clear(); pickSel = 0;
        if (subs) addPick("Off", !any, () -> { eng.subsOff(); subLine.setText(""); subImg.setVisibility(View.GONE); note.setText("Subtitles off"); });
        for (Engine.Track t : list) {
            if (t.on) pickSel = pickRows.size();
            addPick(t.label, t.on, () -> note.setText(eng.select(subs, t.id) ? (subs ? "Subtitles: " : "Audio: ") + t.label : subs ? "That subtitle can’t be shown here" : "That audio track can’t be played here"));
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
        if (prepared && eng != null) {
            try {
                int pos = pendingSeek >= 0 ? pendingSeek : (int) eng.pos(), dur = (int) eng.dur();
                if (dur > 0) seek.setProgress((int) (pos * 1000L / dur));
                time.setText(fmt(pos) + "  /  " + fmt(dur) + (eng.playing() || touch ? "" : "   Paused"));
                if (touch) playBtn.setText(eng.playing() ? "❚❚  Pause" : "▶  Play");
            } catch (Exception ignored) { }
        }
        if (hideAt > 0 && System.currentTimeMillis() > hideAt && eng != null && eng.playing()) { bar.setVisibility(View.GONE); hideAt = 0; if (sel >= 0) { sel = -1; paintOpts(); } }
        h.postDelayed(this, 500);
    } };
    static String fmt(int ms) { int s = Math.max(0, ms / 1000); return s >= 3600 ? String.format(java.util.Locale.US, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String.format(java.util.Locale.US, "%d:%02d", s / 60, s % 60); }
    void show(long ms) { bar.setVisibility(View.VISIBLE); hideAt = System.currentTimeMillis() + ms; }

    final Runnable doSeek = () -> { if (pendingSeek >= 0 && eng != null) { try { eng.seek(pendingSeek); } catch (Exception ignored) { } pendingSeek = -1; } };
    void skip(int ms) {
        if (!prepared) return;
        int base = pendingSeek >= 0 ? pendingSeek : (int) eng.pos(), dur = (int) eng.dur();
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
                togglePlay(); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY: if (prepared) eng.play(); show(2500); return true;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: if (prepared) eng.pause(); show(Long.MAX_VALUE / 4); return true;
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
        try { if (prepared && eng != null) { r.putExtra("pos", pendingSeek >= 0 ? pendingSeek : (int) eng.pos()); r.putExtra("dur", (int) eng.dur()); } } catch (Exception ignored) { }
        r.putExtra("engine", eng == null ? engineName : eng.name());
        r.putExtra("ended", ended); r.putExtra("next", wantNext); if (action != null) r.putExtra("action", action);
        setResult(RESULT_OK, r); finish();
    }

    @Override protected void onPause() { super.onPause(); if (eng != null && prepared && eng.playing()) eng.pause(); }
    @Override protected void onDestroy() { super.onDestroy(); h.removeCallbacksAndMessages(null); if (eng != null) { eng.release(); eng = null; } }
}
