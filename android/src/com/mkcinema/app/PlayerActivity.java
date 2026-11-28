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
    (24p films without judder) while the film plays and switches back afterwards.
    1.9.0: full ASS/SSA subtitle styling (Ass, libass), Dolby Vision profile 7 plays its HDR10 picture on TVs without
    Dolby Vision (DvFallback), and Skip intro / recap / ending plus Next episode from the times MKCinema found
    (AniSkip, TheIntroDB, chapters, addons, your own earlier skips). */
public class PlayerActivity extends Activity implements SurfaceHolder.Callback, Engine.Listener {
    Engine eng; boolean fellBack, slow; String spdif = ""; String engineName; File subFile; boolean subsWaited;
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
    /** 1.9.0: libass styling allowed (setting on, and it hasn't crashed on this app version) */
    boolean assOk, assCrashed; View assView;
    /** 1.9.0: skip times in ms: recap, intro, ending ({start, end}), and where the credits start (-1 unknown) */
    final String[] SEG = { "recap", "intro", "ed" }; final long[][] segs = new long[3][]; final boolean[] segUsed = new boolean[3];
    long creditsMs = -1; boolean hasNext, autoSkip, zap, zapFlip; int segCur = -1; long segShown; TextView skipBtn;
    /** 1.17.17: the start gate. The film opens paused and plays only once the TV has switched to the film's frame rate
        and had time to bring the picture back (see gateCheck), so the sound never runs ahead of the picture */
    boolean gate, fpsWaiting, fpsWaited, fg = true, firstShown; float fps; long openedAt, waitedClose;
    static final long SETTLE_MS = 2000;

    /** 1.13.0: an automatic update never installs while this player is open */
    static volatile boolean open;
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b); open = true;
        android.util.Log.i("MKCPlayer", "player screen opened" + (b != null ? " again by Android (saved state)" : "") + ", task " + getTaskId());
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        Intent i = getIntent();
        url = i.getStringExtra("url"); subUrl = i.getStringExtra("subUrl");
        // 1.8.1: films come over http(s), or from this app's own downloads folders; subtitles the same
        if (!allowed(url, false) || (subUrl != null && !subUrl.isEmpty() && !allowed(subUrl, true))) { setResult(RESULT_CANCELED, new Intent().putExtra("error", "blocked")); finish(); return; }
        // request headers some sources need (Referer, User-Agent...), sent by the player itself
        try { String hj = i.getStringExtra("headers"); if (hj != null && !hj.isEmpty()) { org.json.JSONObject ho = new org.json.JSONObject(hj); java.util.Iterator<String> it = ho.keys(); while (it.hasNext()) { String k = it.next(); hdr.put(k, ho.optString(k)); } } } catch (Exception ignored) { }
        audioLang = i.getStringExtra("audioLang");
        startMs = i.getIntExtra("startMs", 0); matchRate = i.getBooleanExtra("matchRate", true);
        engineName = i.getStringExtra("engine"); if (engineName == null || engineName.isEmpty()) engineName = "exo";
        slow = i.getBooleanExtra("slow", false);
        spdif = AudioOut.clean(i.getStringExtra("spdif")); // 1.17.19: Sound to a receiver
        // 1.9.0: a crash while libass was drawing turns styled subtitles off on this app version (see onDestroy)
        android.content.SharedPreferences sp = getSharedPreferences("mk", MODE_PRIVATE);
        if (sp.getBoolean("assLive", false)) {
            int n = sp.getInt("assCrashN", 0) + 1;   // one power cut is not a crash: three in a row are
            if (n >= 3) { sp.edit().putString("assOff", MainActivity.VER).putBoolean("assLive", false).putInt("assCrashN", 0).apply(); assCrashed = true; }
            else sp.edit().putBoolean("assLive", false).putInt("assCrashN", n).apply();
        }
        assOk = i.getBooleanExtra("ass", true) && !MainActivity.VER.equals(sp.getString("assOff", ""));
        readSkips(i.getStringExtra("skips")); hasNext = i.getBooleanExtra("hasNext", false); autoSkip = i.getBooleanExtra("autoSkip", false);
        zap = i.getBooleanExtra("zap", false); zapFlip = i.getBooleanExtra("zapFlip", false);
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
        // 1.14.0: a file opened from another app has no source list or web player to go to
        String[][] ob = i.getBooleanExtra("local", false) ? new String[][] { { "audio", "Audio" }, { "subs", "Subtitles" } }
            : new String[][] { { "audio", "Audio" }, { "subs", "Subtitles" }, { "sources", "Other sources" }, { "web", "Full player" } };
        for (String[] o : ob) {
            TextView t = text(15, Color.WHITE, Typeface.BOLD); t.setText(o[1]); t.setTag(o[0]);
            t.setPadding((int) (16 * d), (int) (8 * d), (int) (16 * d), (int) (8 * d));
            LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(-2, -2); bl.rightMargin = (int) (10 * d);
            t.setOnClickListener(v -> runOpt((String) v.getTag()));
            opts.addView(t, bl); optBtns.add(t);
        }
        paintOpts();
        root.addView(bar, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        // 1.17.7: subtitles move up above the bar while it shows, so its buttons never sit on the words
        bar.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            float y = bar.getVisibility() == View.VISIBLE ? -Math.max(0, bar.getHeight() - 30 * d) : 0;
            if (subLine.getTranslationY() != y) { subLine.setTranslationY(y); subImg.setTranslationY(y); }
        });
        // 1.9.0: Skip intro / recap / ending, and Next episode in the credits
        skipBtn = text(17, 0xFF0B0B0C, Typeface.BOLD); skipBtn.setVisibility(View.GONE);
        skipBtn.setPadding((int) (22 * d), (int) (11 * d), (int) (22 * d), (int) (11 * d));
        GradientDrawable sg = new GradientDrawable(); sg.setCornerRadius(999); sg.setColor(0xFFE9E6DE); skipBtn.setBackground(sg);
        skipBtn.setOnClickListener(v -> doSkipSeg());
        FrameLayout.LayoutParams skl = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END); skl.rightMargin = (int) (48 * d); skl.bottomMargin = (int) (150 * d);
        root.addView(skipBtn, skl);
        setContentView(root);
        // 1.17.13: the picture fills the screen past the camera cutout on phones; the buttons keep clear of it
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams wa = getWindow().getAttributes();
            wa.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(wa);
            final int skR = skl.rightMargin;
            root.setOnApplyWindowInsetsListener((v, in) -> {
                android.view.DisplayCutout dc = in.getDisplayCutout();
                int l = dc == null ? 0 : dc.getSafeInsetLeft(), r = dc == null ? 0 : dc.getSafeInsetRight();
                bar.setPadding(p + l, bar.getPaddingTop(), p + r, bar.getPaddingBottom());
                FrameLayout.LayoutParams sk2 = (FrameLayout.LayoutParams) skipBtn.getLayoutParams();
                if (sk2.rightMargin != skR + r) { sk2.rightMargin = skR + r; skipBtn.setLayoutParams(sk2); }
                return in;
            });
        }
        touch = !getPackageManager().hasSystemFeature("android.software.leanback") && getResources().getConfiguration().touchscreen != android.content.res.Configuration.TOUCHSCREEN_NOTOUCH;
        if (touch) setupTouch(seekBox, d); else playBtn.setVisibility(View.GONE);
        note.setText("Loading…");
        // 1.6.1: frame-rate matching reads the file only once the player has opened it (see onPrepared), not at the same time
        // the film opens once its subtitles are downloaded, or after 3 s without them (they're added when they arrive)
        // 1.17.17: MKCinema Player (mpv) adds subtitles live without reloading, so the film no longer waits for them;
        // only ExoPlayer, which has to reopen the film to add them, still waits up to 3 s
        boolean liveSubs = !"system".equals(engineName) && !"exoplayer".equals(engineName) && MpvEngine.available();
        if (subUrl != null && !subUrl.isEmpty()) { new Thread(this::loadSubs).start(); if (liveSubs) subsWaited = true; else h.postDelayed(() -> { subsWaited = true; maybeStart(); }, 3000); } else subsWaited = true;
        h.post(tick);
    }

    TextView playBtn;
    boolean touch;

    /** http(s), or a file inside one of this app's Movies folders (the device, a USB drive or an SD card), where downloads go */
    boolean allowed(String u, boolean path) {
        if (u == null) return false;
        String l = u.toLowerCase(java.util.Locale.US);
        if (l.startsWith("https://") || l.startsWith("http://")) return true;
        // 1.14.0: a file another app handed to "Open with MKCinema" (OpenActivity), with read permission for it
        if (!path && l.startsWith("content://")) return getIntent().getBooleanExtra("local", false) && u.equals(String.valueOf(getIntent().getData()));
        String f = path && u.startsWith("/") ? u : !path && l.startsWith("file:") ? android.net.Uri.parse(u).getPath() : null;
        if (f == null) return false;
        try {
            String c = new File(f).getCanonicalPath();
            for (File d : getExternalFilesDirs(android.os.Environment.DIRECTORY_MOVIES)) {
                if (d != null && c.startsWith(d.getCanonicalPath() + File.separator)) return true;
            }
        } catch (Exception ignored) { }
        return false;
    }

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
            int dur = (int) eng.dur(); long[] lr = zap ? eng.liveRange() : null; if (dur <= 0 && lr == null) return true;
            float f = Math.max(0f, Math.min(1f, e.getX() / Math.max(1, v.getWidth())));
            // 1.17.18: on a live channel the bar is the stretch it has kept, its right end is live
            pendingSeek = lr != null ? (int) Math.min(lr[1] - 1500, lr[0] + 500 + (long) (f * (lr[1] - lr[0]))) : (int) (f * dur); show(4000); tick.run(); h.removeCallbacks(tick); h.postDelayed(tick, 500);
            if (e.getAction() == android.view.MotionEvent.ACTION_UP || e.getAction() == android.view.MotionEvent.ACTION_CANCEL) { h.removeCallbacks(doSeek); doSeek.run(); }
            return true;
        });
    }

    void togglePlay() {
        if (!prepared || eng == null) return;
        endGate();
        if (eng.playing()) { eng.pause(); show(Long.MAX_VALUE / 4); } else { eng.play(); show(2500); }
    }

    TextView text(int sp, int color, int style) { TextView t = new TextView(this); t.setTextSize(sp); t.setTextColor(color); t.setTypeface(Typeface.create("sans-serif", style)); return t; }

    @Override public void surfaceCreated(SurfaceHolder holder) { surfaceReady = true; if (eng == null) maybeStart(); else eng.surface(holder); }
    @Override public void surfaceChanged(SurfaceHolder holder, int f, int w, int hh) { if (eng != null) eng.resized(w, hh); }
    @Override public void surfaceDestroyed(SurfaceHolder holder) {
        surfaceReady = false; if (eng != null) eng.surface(null);
        // 1.17.17: closing after Back: mpv lets go of this surface on its own thread (MpvEngine.release); the surface
        // stays until it has, or 1.5 s at most. By now the screen behind is already showing.
        else MpvEngine.awaitClosed(1500);
    }

    final Runnable startLater = this::maybeStart;
    void maybeStart() {
        if (eng != null || !surfaceReady || !subsWaited || isFinishing()) return;
        // 1.17.17: the film closed a moment ago is still letting go of the decoders and the sound output: wait for it
        // (4 s at most), or this film could open with no sound on a slow TV box (see stopPlayer)
        if (MpvEngine.closing() && waitedClose < 4000) { waitedClose += 100; h.removeCallbacks(startLater); h.postDelayed(startLater, 100); return; }
        openedAt = android.os.SystemClock.uptimeMillis();
        // 1.14.0: "mpv" (MKCinema Player, the default; "exo" from older app pages means the default too), "exoplayer", "system"
        try {
            if ("system".equals(engineName)) eng = new MpEngine(this, this);
            else if (!"exoplayer".equals(engineName) && MpvEngine.available()) { MpvEngine x = new MpvEngine(this, this, !touch); x.slow = slow; x.live = zap; x.spdif = spdif; eng = x; }
            else eng = exo();
        }
        catch (Throwable t) { fellBack = true; eng = new MpEngine(this, this); } // ExoPlayer missing or broken on this device
        DvFallback.used = false;
        android.util.Log.i("MKCPlayer", "engine " + eng.name() + " for " + (url.startsWith("content:") ? "a local file" : "a stream") + (waitedClose > 0 ? ", waited " + waitedClose + " ms for the last film to close" : ""));
        open(eng);
        addOverlay();
    }

    /** every engine opens through here, the fallbacks too, so each one starts behind the gate */
    void open(Engine e) { gate = e.holdStart(); e.open(url, hdr, subFile, audioLang, startMs, surface.getHolder()); }

    Engine exo() { ExoEngine x = new ExoEngine(this, this); x.slow = slow; x.wantAss = assOk; x.spdif = getIntent().hasExtra("spdif") ? spdif : null; return x; }
    /** 1.14.0: mpv couldn't open the file: ExoPlayer tries next (then the basic player, see error()) */
    boolean triedExo, triedGpu; String errChain = "";
    void chain(String what) { errChain += (errChain.isEmpty() ? "" : " > ") + what; android.util.Log.w("MKCPlayer", "player: " + errChain); }

    /** 1.9.0: the libass layer sits exactly over the picture (same size and place as the video surface), under the bar */
    void addOverlay() {
        View v = eng instanceof ExoEngine ? ((ExoEngine) eng).overlay() : null;
        if (v == assView) return;
        if (assView != null) { root.removeView(assView); assView = null; }
        if (v == null) { liveAss(false); return; }
        assView = v; root.addView(v, 1, new FrameLayout.LayoutParams(surface.getLayoutParams()));
        liveAss(true);
    }
    void liveAss(boolean on) { android.content.SharedPreferences.Editor e = getSharedPreferences("mk", MODE_PRIVATE).edit().putBoolean("assLive", on); if (!on) e.putInt("assCrashN", 0); e.commit(); }

    void readSkips(String json) {
        if (json == null || json.isEmpty()) return;
        try {
            org.json.JSONObject o = new org.json.JSONObject(json);
            for (int k = 0; k < SEG.length; k++) {
                org.json.JSONArray a = o.optJSONArray(SEG[k]); if (a == null || a.length() < 2) continue;
                long s0 = (long) (a.getDouble(0) * 1000), e0 = (long) (a.getDouble(1) * 1000);
                if (s0 >= 0 && e0 - s0 >= 5000 && e0 - s0 <= 15 * 60000) segs[k] = new long[] { s0, e0 };
            }
            double c = o.optDouble("credits", -1); if (c > 0) creditsMs = (long) (c * 1000);
        } catch (Exception ignored) { }
    }

    /** every 400 ms while playing: which skip applies right now */
    final Runnable marks = new Runnable() { @Override public void run() {
        if (prepared && eng != null && !isFinishing()) {
            try {
                long pos = eng.pos(), dur = eng.dur(); int k = -1;
                for (int j = 0; j < SEG.length; j++) {
                    long[] g = segs[j]; if (g == null) continue;
                    if (j == 2 && (dur <= 0 || g[1] > dur - 20000)) continue; // an ending that runs to the end: Next episode covers it
                    if (pos >= g[0] && pos < g[1] - 1000) { k = j; break; }
                }
                boolean credits = k < 0 && hasNext && creditsMs > 0 && pos >= creditsMs && (dur <= 0 || pos < dur - 2000);
                int now = credits ? 3 : k;
                if (now != segCur) { segCur = now; segShown = System.currentTimeMillis();
                    if (k >= 0 && autoSkip && k != 2 && !segUsed[k]) { segUsed[k] = true; doSkipSeg(); }
                    else if (now >= 0) { skipBtn.setText(new String[] { "Skip recap", "Skip intro", "Skip ending", "Next episode  ▶" }[now]); skipBtn.setVisibility(View.VISIBLE); }
                    else skipBtn.setVisibility(View.GONE);
                } else if (now >= 0 && now < 3 && System.currentTimeMillis() - segShown > 8000) skipBtn.setVisibility(View.GONE);
            } catch (Exception ignored) { }
        }
        if (!isFinishing()) h.postDelayed(this, 400);
    } };
    boolean skipShown() { return skipBtn != null && skipBtn.getVisibility() == View.VISIBLE; }
    void doSkipSeg() {
        int k = segCur; skipBtn.setVisibility(View.GONE); if (k < 0 || eng == null) return;
        if (k == 3) { wantNext = true; finishWithResult(); return; }
        segUsed[k] = true; segShown = 0; eng.seek(segs[k][1]);
        note.setText(new String[] { "Recap skipped", "Intro skipped", "Ending skipped" }[k] + (autoSkip && k != 2 ? " automatically" : "")); show(2000);
        h.postDelayed(() -> { if (note.getText().toString().endsWith("skipped") || note.getText().toString().endsWith("automatically")) note.setText(""); }, 2000);
    }

    // ---- Engine.Listener ----
    @Override public void ready() {
        prepared = true; fit(); addOverlay();
        h.removeCallbacks(marks); if (segs[0] != null || segs[1] != null || segs[2] != null || creditsMs > 0) h.post(marks);
        note.setText(touch || hinted ? "" : "Press ▼ for audio, subtitles and sources"); hinted = true; show(touch ? 4000 : 6000);
        if (fellBack) { note.setText("Playing with the basic player"); h.postDelayed(() -> { if (note.getText().toString().startsWith("Playing with")) note.setText(""); }, 4000); }
        else if (DvFallback.used) { note.setText("HDR10 (this TV can’t show this Dolby Vision)"); h.postDelayed(() -> { if (note.getText().toString().startsWith("HDR10")) note.setText(""); }, 5000); }
        else if (assCrashed) { note.setText("Styled subtitles were turned off after a problem"); h.postDelayed(() -> { if (note.getText().toString().startsWith("Styled")) note.setText(""); }, 5000); }
        if (gate) { h.removeCallbacks(capGo); h.postDelayed(capGo, 9000); gateCheck(); }
    }
    @Override public void firstFrame() { if (!firstShown) { firstShown = true; android.util.Log.i("MKCPlayer", "first picture " + (android.os.SystemClock.uptimeMillis() - openedAt) + " ms after opening"); } }

    /** 1.17.17: Fire TV and other TVs switch their refresh rate to the film's (24p without judder) when it starts. The
        HDMI picture then goes black for 1 to 5 s while the TV locks on, but the sound comes back sooner, so films used
        to start with sound over a black screen. The frame rate was also only matched once the film was playing, and on
        ExoPlayer the pause for it was skipped because the film wasn't "playing" yet. Now the film waits, paused, with
        its first picture ready: the TV switches first, gets SETTLE_MS to show pictures again, then the film plays. */
    void gateCheck() {
        if (!gate || !prepared || eng == null || isFinishing() || modeHold) return;
        boolean can = matchRate && Build.VERSION.SDK_INT >= 23;
        if (can && fps <= 0 && !fpsWaited) { // the frame rate comes a moment after the film opens
            if (!fpsWaiting) { fpsWaiting = true; h.postDelayed(() -> { fpsWaited = true; gateCheck(); }, 600); }
            return;
        }
        Display.Mode best = can && fps > 0 ? pickMode(fps) : null;
        if (best == null) { go(can && fps > 0 ? "screen already at " + fps + " fps" : "no frame rate to match"); return; }
        modeHold = true;
        final float hz = best.getRefreshRate();
        switchMode(best, () -> { modeHold = false; go(String.format(java.util.Locale.US, "screen switched to %.3f Hz", hz)); });
    }
    void endGate() { modeHold = false; if (gate) { gate = false; h.removeCallbacks(capGo); } }
    final Runnable capGo = () -> { modeHold = false; go("waited 9 s"); };
    void go(String why) {
        if (!gate || eng == null || isFinishing()) return;
        gate = false; h.removeCallbacks(capGo);
        android.util.Log.i("MKCPlayer", "start: " + why + ", playing " + (android.os.SystemClock.uptimeMillis() - openedAt) + " ms after opening");
        if (fg) eng.play();
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
    @Override public void frameRate(float f) {
        fps = f; if (!matchRate || Build.VERSION.SDK_INT < 23) return;
        if (gate) gateCheck(); // before the film plays (ready() checks again if the film isn't open yet)
        else matchFrameRate(f);
    }
    @Override public void error(String code, boolean beforeReady) {
        // 1.7.0: a file ExoPlayer can't open gets one try in the basic player before MKCinema's own player takes over
        // 1.15.2: on a TV mpv first draws straight onto the screen (hardware decoder only). When that can't start, MKCinema Player
        // tries again with its own renderer, which also decodes in software, BEFORE ExoPlayer: same engine, every audio and subtitle track stays listed.
        if (beforeReady && eng instanceof MpvEngine && ((MpvEngine) eng).embed && !triedGpu && !isFinishing()) {
            triedGpu = true; chain("mpv-tv:" + code); eng.release(); eng = null; prepared = false; note.setText("Starting MKCinema Player…");
            MpvEngine x = new MpvEngine(this, this, false); x.slow = slow; x.live = zap; x.spdif = spdif; eng = x;
            open(eng); addOverlay();
            return;
        }
        if (beforeReady && eng instanceof MpvEngine && !triedExo && !isFinishing()) {
            chain("mpv:" + code);
            triedExo = true; eng.release(); eng = null; prepared = false; note.setText("Trying ExoPlayer… (" + code + ")");
            try { eng = exo(); } catch (Throwable t) { fellBack = true; eng = new MpEngine(this, this); }
            open(eng); addOverlay();
            return;
        }
        if (beforeReady && eng instanceof ExoEngine && !fellBack && !isFinishing()) {
            chain("exo:" + code);
            fellBack = true; eng.release(); eng = null; prepared = false; note.setText("Trying the basic player…");
            eng = new MpEngine(this, this); open(eng); addOverlay();
            return;
        }
        // 1.17.18: a live channel that breaks off while it plays goes straight back to MKCinema, which opens it again or
        // plays the same channel from another playlist (web 2.98 live steady); before, it closed like Back
        if (!beforeReady && prepared && zap && !isFinishing()) { chain("live:" + code); action = "dropped"; note.setText("Reconnecting…"); h.postDelayed(this::finishWithResult, 300); return; }
        chain("final:" + code);
        note.setText("This source won’t play here");
        if (!beforeReady && prepared) { h.postDelayed(this::finishWithResult, 1800); return; } // keeps the position so it is saved
        h.postDelayed(() -> { setResult(RESULT_CANCELED, new Intent().putExtra("error", errChain.isEmpty() ? code : errChain)); finish(); }, 1800);
    }

    /** Letterbox the surface to the video's shape. */
    void fit() {
        if (vw == 0 || vh == 0) return;
        int sw = root.getWidth(), sh = root.getHeight(); if (sw == 0 || sh == 0) { root.post(this::fit); return; }
        float w = vw * par, r = Math.min(sw / w, sh / (float) vh);
        surface.setLayoutParams(new FrameLayout.LayoutParams((int) (w * r), (int) (vh * r), Gravity.CENTER));
        if (assView != null) assView.setLayoutParams(new FrameLayout.LayoutParams((int) (w * r), (int) (vh * r), Gravity.CENTER));
    }

    /** A display mode at the same resolution whose refresh rate is a whole multiple of the film's, or null when the
        screen is already in it (or has none). */
    Display.Mode pickMode(float f) {
        if (f < 20 || f > 70) return null;
        final float want = Math.abs(f - 24) < 0.6 ? 23.976f : f;
        try {
            Display dsp = getWindowManager().getDefaultDisplay(); Display.Mode cur = dsp.getMode(), best = null; float bestErr = 1f;
            for (Display.Mode m : dsp.getSupportedModes()) {
                if (m.getPhysicalWidth() != cur.getPhysicalWidth() || m.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
                float ratio = m.getRefreshRate() / want, err = Math.abs(ratio - Math.round(ratio));
                if (Math.round(ratio) >= 1 && err < 0.01f && (best == null || err < bestErr || (err == bestErr && m.getRefreshRate() < best.getRefreshRate()))) { best = m; bestErr = err; }
            }
            return best != null && best.getModeId() != cur.getModeId() ? best : null;
        } catch (Exception e) { return null; }
    }

    /** the frame rate became known while the film plays (the basic player reads it late): the film pauses for the switch */
    void matchFrameRate(float f) {
        h.post(() -> {
            Display.Mode best = pickMode(f); if (best == null || eng == null || isFinishing()) return;
            final boolean was = eng.playing();
            modeHold = true; eng.pause();
            switchMode(best, () -> { if (modeHold && eng != null && !isFinishing()) { modeHold = false; if (was) eng.play(); } });
        });
    }

    /** 1.11.1: while the TV switches its refresh rate the HDMI link restarts (picture and sound drop for 1 to 5 s on
        most TVs and receivers). Asks for the mode, waits until it is on (or 5 s), then SETTLE_MS more for the TV to show
        pictures again (1.17.17: was 1 s, too short for the picture on many TVs), then runs done. */
    android.hardware.display.DisplayManager.DisplayListener modeL; boolean modeHold;
    void switchMode(Display.Mode best, Runnable done) {
        final int modeId = best.getModeId(); final boolean[] fired = { false };
        final Runnable settled = () -> {
            if (fired[0]) return; fired[0] = true; unwatchMode();
            h.postDelayed(() -> { if (!isFinishing()) done.run(); }, SETTLE_MS);
        };
        try {
            android.hardware.display.DisplayManager dm = (android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE);
            modeL = new android.hardware.display.DisplayManager.DisplayListener() {
                @Override public void onDisplayAdded(int id) { }
                @Override public void onDisplayRemoved(int id) { }
                @Override public void onDisplayChanged(int id) {
                    try { if (getWindowManager().getDefaultDisplay().getMode().getModeId() == modeId) settled.run(); } catch (Exception ignored) { }
                }
            };
            dm.registerDisplayListener(modeL, h);
        } catch (Exception ignored) { }
        h.postDelayed(settled, 5000);
        android.util.Log.i("MKCPlayer", String.format(java.util.Locale.US, "switching the screen to %.3f Hz", best.getRefreshRate()));
        WindowManager.LayoutParams lp = getWindow().getAttributes(); lp.preferredDisplayModeId = modeId; getWindow().setAttributes(lp);
        note.setText(String.format(java.util.Locale.US, "%.3f Hz", best.getRefreshRate()));
        h.postDelayed(() -> { if ("".equals(note.getText().toString()) || note.getText().toString().endsWith("Hz")) note.setText(""); }, 3000 + SETTLE_MS);
    }
    void unwatchMode() {
        if (modeL == null) return;
        try { ((android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE)).unregisterDisplayListener(modeL); } catch (Exception ignored) { }
        modeL = null;
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
        android.util.Log.i("MKCPlayer", (subs ? "subtitle" : "audio") + " list, " + pickRows.size() + " rows, highlighted " + pickSel);
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
    void choosePick() { android.util.Log.i("MKCPlayer", "picked row " + pickSel); Runnable r = pickActs.get(pickSel); closePicker(); r.run(); show(3000); }
    void closePicker() { if (picker != null) { root.removeView((View) picker.getParent()); picker = null; } }

    final Runnable tick = new Runnable() { @Override public void run() {
        if (prepared && eng != null) {
            try {
                int pos = pendingSeek >= 0 ? pendingSeek : (int) eng.pos(), dur = (int) eng.dur();
                String paused = eng.playing() || touch || gate || modeHold ? "" : "   Paused";
                long[] lr = zap ? eng.liveRange() : null;
                if (zap) {
                    // 1.17.18: live channels show how far behind live they are, and the bar is the kept stretch
                    long behind = lr != null ? Math.max(0, lr[1] - pos) : 0;
                    if (lr != null && lr[1] > lr[0]) seek.setProgress((int) Math.max(0, Math.min(1000, (pos - lr[0]) * 1000L / (lr[1] - lr[0]))));
                    time.setText((behind > 6000 ? fmt((int) behind) + " behind live" : "Live") + paused);
                } else {
                if (dur > 0) seek.setProgress((int) (pos * 1000L / dur));
                time.setText(fmt(pos) + "  /  " + fmt(dur) + paused);
                }
                if (touch) playBtn.setText(eng.playing() ? "❚❚  Pause" : "▶  Play");
            } catch (Exception ignored) { }
        }
        if (hideAt > 0 && System.currentTimeMillis() > hideAt && eng != null && eng.playing()) { bar.setVisibility(View.GONE); hideAt = 0; if (sel >= 0) { sel = -1; paintOpts(); } }
        // nothing to update while the bar is hidden; show() starts it again
        if (bar.getVisibility() == View.VISIBLE) h.postDelayed(this, 500);
    } };
    static String fmt(int ms) { int s = Math.max(0, ms / 1000); return s >= 3600 ? String.format(java.util.Locale.US, "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String.format(java.util.Locale.US, "%d:%02d", s / 60, s % 60); }
    void show(long ms) { boolean was = bar.getVisibility() == View.VISIBLE; bar.setVisibility(View.VISIBLE); hideAt = System.currentTimeMillis() + ms; if (!was) { h.removeCallbacks(tick); h.post(tick); } }

    final Runnable doSeek = () -> { if (pendingSeek >= 0 && eng != null) { try { eng.seek(pendingSeek); } catch (Exception ignored) { } pendingSeek = -1; } };
    void skip(int ms) {
        if (!prepared) return;
        int base = pendingSeek >= 0 ? pendingSeek : (int) eng.pos(), dur = (int) eng.dur();
        // 1.17.18: a live channel moves only inside what it has kept (Right stops at live)
        long[] lr = zap ? eng.liveRange() : null;
        if (lr != null) { pendingSeek = (int) Math.max(lr[0] + 500, Math.min(lr[1] - 1500, base + ms)); h.removeCallbacks(doSeek); h.postDelayed(doSeek, 450); show(3500); tick.run(); h.removeCallbacks(tick); h.postDelayed(tick, 500); return; }
        if (zap && dur <= 0) { show(2500); return; } // a live channel with nothing kept: there is nowhere to go
        pendingSeek = Math.max(0, Math.min(dur > 0 ? dur - 1000 : Integer.MAX_VALUE, base + ms));
        h.removeCallbacks(doSeek); h.postDelayed(doSeek, 450); show(3500); tick.run(); h.removeCallbacks(tick); h.postDelayed(tick, 500);
    }

    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(e);
        int k = e.getKeyCode(); boolean held = e.getRepeatCount() > 0;
        if (android.util.Log.isLoggable("MKCPlayer", android.util.Log.DEBUG)) android.util.Log.d("MKCPlayer", "key " + KeyEvent.keyCodeToString(k));
        if (picker != null) {
            switch (k) {
                case KeyEvent.KEYCODE_DPAD_UP: pickSel = Math.max(0, pickSel - 1); paintPick(); return true;
                case KeyEvent.KEYCODE_DPAD_DOWN: pickSel = Math.min(pickRows.size() - 1, pickSel + 1); paintPick(); return true;
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: choosePick(); return true;
                case KeyEvent.KEYCODE_BACK: case KeyEvent.KEYCODE_ESCAPE: case KeyEvent.KEYCODE_DPAD_LEFT: closePicker(); show(8000); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: return true;
            }
        }
        // the options row: Down opens it, Left/Right move, OK picks, Up leaves it. 1.17.17: Back closes the player, like
        // everywhere else in the film (it used to only leave the row, so Back seemed to do nothing while the bar showed)
        if (sel >= 0) {
            switch (k) {
                case KeyEvent.KEYCODE_DPAD_LEFT: sel = Math.max(0, sel - 1); paintOpts(); show(8000); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT: sel = Math.min(optBtns.size() - 1, sel + 1); paintOpts(); show(8000); return true;
                case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: runOpt((String) optBtns.get(sel).getTag()); return true;
                case KeyEvent.KEYCODE_DPAD_UP: sel = -1; paintOpts(); show(3000); return true;
                case KeyEvent.KEYCODE_BACK: case KeyEvent.KEYCODE_ESCAPE: android.util.Log.i("MKCPlayer", "back from the options row"); finishWithResult(); return true;
                case KeyEvent.KEYCODE_DPAD_DOWN: show(8000); return true;
            }
        }
        // a live channel from the person's own playlist: Channel +/- (and Up/Down while the bar is hidden) close this
        // screen with a request for the next channel, which MKCinema starts at once; Last channel goes back
        if (zap && picker == null && sel < 0) {
            String want = null;
            switch (k) {
                case KeyEvent.KEYCODE_CHANNEL_UP: case KeyEvent.KEYCODE_PAGE_UP: want = "chup"; break;
                case KeyEvent.KEYCODE_CHANNEL_DOWN: case KeyEvent.KEYCODE_PAGE_DOWN: want = "chdown"; break;
                case KeyEvent.KEYCODE_LAST_CHANNEL: want = "chlast"; break;
                case KeyEvent.KEYCODE_DPAD_UP: if (bar.getVisibility() != View.VISIBLE) want = zapFlip ? "chup" : "chdown"; break;
                case KeyEvent.KEYCODE_DPAD_DOWN: if (bar.getVisibility() != View.VISIBLE) want = zapFlip ? "chdown" : "chup"; break;
            }
            if (want != null) { action = want; finishWithResult(); return true; }
        }
        // 1.9.0: while Skip intro (or Next episode) shows, OK presses it
        if ((k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER) && skipShown()) { doSkipSeg(); return true; }
        if (k == KeyEvent.KEYCODE_DPAD_DOWN && prepared) { sel = 0; paintOpts(); show(8000); if (note.getText().toString().startsWith("Press")) note.setText(""); return true; }
        switch (k) {
            case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case KeyEvent.KEYCODE_SPACE:
                togglePlay(); return true;
            // 1.17.17: Play or Pause pressed while the film waits for the screen ends the wait: the press decides
            case KeyEvent.KEYCODE_MEDIA_PLAY: if (prepared) { endGate(); eng.play(); } show(2500); return true; // still opening: the gate starts it
            case KeyEvent.KEYCODE_MEDIA_PAUSE: endGate(); if (prepared) eng.pause(); show(Long.MAX_VALUE / 4); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT: skip(held ? -30000 : -10000); return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT: skip(held ? 30000 : 10000); return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND: skip(-30000); return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: skip(30000); return true;
            case KeyEvent.KEYCODE_DPAD_UP: show(4000); return true;
            case KeyEvent.KEYCODE_MENU: openTracks(false); return true;
            case KeyEvent.KEYCODE_MEDIA_NEXT: wantNext = true; finishWithResult(); return true;
            case KeyEvent.KEYCODE_BACK: case KeyEvent.KEYCODE_ESCAPE: case KeyEvent.KEYCODE_MEDIA_STOP: android.util.Log.i("MKCPlayer", "back" + (prepared ? "" : " while opening")); finishWithResult(); return true;
        }
        return super.dispatchKeyEvent(e);
    }

    void finishWithResult() { setResult(RESULT_OK, result()); finish(); }

    Intent result() {
        Intent r = new Intent();
        try { if (prepared && eng != null) { r.putExtra("pos", pendingSeek >= 0 ? pendingSeek : (int) eng.pos()); r.putExtra("dur", (int) eng.dur()); } } catch (Exception ignored) { }
        r.putExtra("engine", eng == null ? engineName : eng.name());
        r.putExtra("ended", ended); r.putExtra("next", wantNext); if (action != null) r.putExtra("action", action);
        return r;
    }

    // the crash flag is only up while the libass layer draws on screen, so Android closing a paused player in the
    // background never counts as a crash
    // the place is handed back on every pause too: reopening the app from its icon closes this screen without Back
    @Override protected void onPause() { super.onPause(); fg = false; if (!isFinishing()) { try { setResult(RESULT_OK, result()); } catch (Exception ignored) { } } modeHold = false; if (eng != null && prepared && eng.playing()) eng.pause(); if (assView != null) liveAss(false); }
    @Override protected void onResume() { super.onResume(); fg = true; if (assView != null) liveAss(true); }
    @Override protected void onDestroy() { super.onDestroy(); android.util.Log.i("MKCPlayer", "player screen gone" + (isChangingConfigurations() ? " (recreated for a configuration change)" : "")); open = false; stopPlayer(); liveAss(false); }

    /** 1.11.1: the player (its decoders and its audio output) is let go the moment this screen closes. Android runs
        onDestroy only once the screen behind is idle, which on a slow TV box can be seconds later: a film started again
        in that time opened a second player while the first still held the audio output, and played with no sound.
        1.17.17: mpv shuts down on its own thread so Back is instant, and the next film waits for it (maybeStart). */
    @Override public void finish() { stopPlayer(); super.finish(); }
    void stopPlayer() {
        h.removeCallbacksAndMessages(null); unwatchMode();
        if (eng != null) { Engine e = eng; eng = null; prepared = false; try { if (e instanceof MpvEngine) ((MpvEngine) e).releaseAsync(); else e.release(); } catch (Throwable ignored) { } }
    }
}
