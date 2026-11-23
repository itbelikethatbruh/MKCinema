package com.mkcinema.app;

import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.widget.FrameLayout;
import dev.jdtech.mpv.MPVLib;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/** 1.15.0: MKCinema Player under the web player, on phones and tablets. The film plays in mpv on a surface UNDER the
    page; while it plays the page is see-through, so what you see and touch is MKCinema's own web player, 1:1: the same
    controls, Audio & subtitles panel, split screen, calls, X-Ray and skips. The page drives mpv through
    MKAndroid.mpv(cmd, arg), the same commands as the Windows app's MKDesktop.player (windows/mpv/cmd.go), and hears
    mpv's news about 8 times a second through MkAndroidPlayer._ev (windows/mpv/state.go). Every command is checked
    here: the page never passes raw mpv options, local paths or scripts, and films and subtitles come over http(s).
    1.17.7: TVs too. There the decoder draws straight onto the surface (mediacodec_embed, like PlayerActivity), so 4K and
    HDR go to the screen untouched, and the page draws the subtitle text it hears as "stext" (embed has no OSD). */
final class UnderPlayer implements MPVLib.EventObserver, SurfaceHolder.Callback {
    final MainActivity a; final Handler h = new Handler(Looper.getMainLooper());
    SurfaceView sv; MPVLib m; String initErr; boolean shown; volatile boolean hasSurface;
    final Object lock = new Object();
    final Map<String, Object> vals = new HashMap<>(); final Set<String> dirty = new HashSet<>(); final Map<String, Object> extra = new HashMap<>();
    int gen; volatile boolean want; final StringBuilder dbg = new StringBuilder();
    void note(String t) { android.util.Log.i("MKCPlayer", "under: " + t); synchronized (lock) { if (dbg.length() < 600) dbg.append(dbg.length() == 0 ? "" : " | ").append(t); extra.put("log", dbg.toString()); } }

    UnderPlayer(MainActivity a) { this.a = a; }

    static final String[] WATCHED = { "time-pos", "duration", "pause", "paused-for-cache", "seeking", "eof-reached", "idle-active",
        "volume", "mute", "speed", "aid", "sid", "secondary-sid", "track-list", "chapter-list", "demuxer-cache-time",
        "video-params/w", "video-params/h", "video-params/gamma", "video-params/primaries", "hwdec-current", "video-codec",
        "audio-codec-name", "audio-params/channel-count", "container-fps", "sub-delay", "audio-delay", "sub-text" };
    static final Map<String, String> KEYS = new HashMap<>();
    static {
        String[] k = { "time-pos", "t", "duration", "dur", "pause", "paused", "paused-for-cache", "buffering", "eof-reached", "ended",
            "idle-active", "idle", "demuxer-cache-time", "cached", "video-params/w", "w", "video-params/h", "h", "video-params/gamma", "gamma",
            "video-params/primaries", "prim", "track-list", "tracks", "chapter-list", "chapters", "hwdec-current", "hwdec",
            "audio-params/channel-count", "channels", "container-fps", "fps", "sub-text", "stext" };
        for (int i = 0; i < k.length; i += 2) KEYS.put(k[i], k[i + 1]);
    }

    // ---- the page's commands (any thread: the JavaScript bridge calls in on its own thread) ----

    /** Returns the answer as text; throws on a refused or failed command (the page sees a rejected promise). */
    String cmd(String c, String arg) throws Exception {
        if (c == null) throw new IllegalArgumentException("not allowed");
        if (arg == null) arg = "";
        switch (c) {
            case "probe": {
                JSONObject o = new JSONObject();
                boolean ok = client() != null; o.put("ok", ok); o.put("api", "android"); o.put("err", ok ? "" : initErr); o.put("tv", a.tv); o.put("embed", a.tv); return o.toString();
            }
            case "show": { final boolean on = !"0".equals(arg); want = on; a.runOnUiThread(() -> show(on)); return ""; }
            case "get": {
                for (String w : WATCHED) if (w.equals(arg)) { MPVLib x = client(); String v = x == null ? null : x.getPropertyString(arg); return v == null ? "" : v; }
                throw new IllegalArgumentException("not allowed");
            }
        }
        List<Op> ops = translate(c, arg);
        MPVLib x = client(); if (x == null) throw new IllegalStateException(initErr == null ? "no player" : initErr);
        int g = 0;
        if ("open".equals(c)) {
            for (int i = 0; i < 50 && want && !hasSurface; i++) Thread.sleep(50); // the picture surface comes up a moment after "show"
            synchronized (lock) { g = ++gen; vals.clear(); dirty.clear(); extra.clear(); dbg.setLength(0); }
            note("open gen " + g + " surface " + hasSurface + " shown " + shown);
        }
        Exception last = null;
        for (Op o : ops) {
            try { if (o.prop != null) x.setPropertyString(o.prop, o.val); else x.command(o.args); }
            catch (Exception e) { if (!"open".equals(c) || o.args != null) last = e; }
        }
        if ("aid".equals(c) || "sid".equals(c)) android.util.Log.i("MKCPlayer", "under: " + c + " " + arg + " now " + x.getPropertyString(c));
        if (last != null) throw last;
        return "open".equals(c) ? "{\"gen\":" + g + "}" : "";
    }

    static final class Op { final String prop, val; final String[] args; Op(String p, String v, String[] a) { prop = p; val = v; args = a; } }
    static Op set(String p, String v) { return new Op(p, v, null); }
    static Op run(String... a) { return new Op(null, null, a); }
    static final Pattern LANG = Pattern.compile("^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$"), HKEY = Pattern.compile("^[A-Za-z0-9-]{1,64}$"),
        ASPECT = Pattern.compile("^(-1|no|\\d{1,2}(\\.\\d{1,3})?(:\\d{1,2})?)$");

    static boolean webUrl(String s) {
        if (s == null || s.length() > 8000 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0 || s.indexOf('\0') >= 0) return false;
        try { java.net.URI u = new java.net.URI(s); String sc = u.getScheme(); return u.getHost() != null && ("http".equalsIgnoreCase(sc) || "https".equalsIgnoreCase(sc)); }
        catch (Exception e) { return false; }
    }
    static String langs(String s) {
        StringBuilder b = new StringBuilder(); int n = 0;
        for (String l : (s == null ? "" : s).split(",")) { l = l.trim(); if (LANG.matcher(l).matches() && n++ < 8) b.append(b.length() == 0 ? "" : ",").append(l.toLowerCase(Locale.US)); }
        return b.toString();
    }
    static String clean(String s, int n) {
        StringBuilder b = new StringBuilder(); for (char ch : (s == null ? "" : s).toCharArray()) if (ch >= 32 && ch != 127) b.append(ch);
        return b.length() > n ? b.substring(0, n) : b.toString();
    }
    static String num(String arg, double lo, double hi) {
        double v = Double.parseDouble(arg.trim()); if (Double.isNaN(v) || Double.isInfinite(v)) throw new IllegalArgumentException("not allowed");
        return String.format(Locale.US, "%.4f", Math.max(lo, Math.min(hi, v)));
    }
    static String track(String arg) {
        if ("no".equals(arg) || "auto".equals(arg)) return arg;
        int n = Integer.parseInt(arg.trim()); if (n < 1 || n > 999) throw new IllegalArgumentException("not allowed"); return String.valueOf(n);
    }
    static final Map<String, String> SOUND = new HashMap<>();
    static {
        SOUND.put("off", "");
        SOUND.put("voice", "lavfi=[highpass=f=120,equalizer=f=2500:t=q:w=1.2:g=5,acompressor=threshold=-20dB:ratio=3:attack=10:release=200]");
        SOUND.put("night", "lavfi=[acompressor=threshold=-28dB:ratio=6:attack=5:release=250:makeup=6dB,alimiter=limit=0.9]");
    }

    /** the same checks and steps as the Windows app's mpv.Translate */
    static List<Op> translate(String c, String arg) throws Exception {
        List<Op> ops = new ArrayList<>();
        switch (c) {
            case "open": {
                JSONObject r = new JSONObject(arg); String url = r.optString("url");
                if (!webUrl(url)) throw new IllegalArgumentException("not allowed");
                ops.add(run("change-list", "http-header-fields", "clr", ""));
                String ua = "MKCinema/" + MainActivity.VER + " (Linux; Android) mpv", ref = "";
                JSONObject hd = r.optJSONObject("headers"); List<Op> hf = new ArrayList<>();
                if (hd != null) { java.util.Iterator<String> it = hd.keys(); int n = 0;
                    while (it.hasNext()) { String k = it.next(), v = hd.optString(k);
                        if (!HKEY.matcher(k).matches() || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0 || v.indexOf('\0') >= 0 || v.length() > 2000 || n >= 16) continue; n++;
                        if ("user-agent".equalsIgnoreCase(k)) ua = v; else if ("referer".equalsIgnoreCase(k)) ref = v; else hf.add(run("change-list", "http-header-fields", "append", k + ": " + v)); } }
                ops.add(set("user-agent", ua)); ops.add(set("referrer", ref)); ops.addAll(hf);
                ops.add(set("start", num(String.valueOf(r.optDouble("start", 0)), 0, 1e7)));
                ops.add(set("alang", langs(r.optString("alang")))); String sl = langs(r.optString("slang"));
                ops.add(set("slang", sl)); ops.add(set("force-media-title", clean(r.optString("title"), 300)));
                ops.add(set("sid", sl.isEmpty() ? "no" : "auto")); ops.add(set("aid", "auto")); ops.add(set("pause", "no"));
                ops.add(run("loadfile", url, "replace")); return ops;
            }
            case "subadd": {
                JSONObject r = new JSONObject(arg); String title = clean(r.optString("title"), 200), lang = r.optString("lang"), text = r.optString("text"), src = r.optString("url");
                if (!text.isEmpty()) { if (text.length() > (8 << 20)) throw new IllegalArgumentException("not allowed"); src = "memory://" + text; }
                else if (!webUrl(src)) throw new IllegalArgumentException("not allowed");
                ops.add(LANG.matcher(lang).matches() ? run("sub-add", src, "select", title, lang.toLowerCase(Locale.US)) : run("sub-add", src, "select", title)); return ops;
            }
            case "play": ops.add(set("pause", "no")); return ops;
            case "pause": ops.add(set("pause", "yes")); return ops;
            case "stop": ops.add(run("stop")); return ops;
            case "seek": ops.add(run("seek", num(arg, 0, 1e7), "absolute+exact")); return ops;
            case "volume": ops.add(set("volume", num(arg, 0, 200))); return ops;
            case "mute": ops.add(set("mute", "1".equals(arg) || "true".equals(arg) ? "yes" : "no")); return ops;
            case "speed": ops.add(set("speed", num(arg, 0.1, 4))); return ops;
            case "aid": case "sid": case "secondary-sid": ops.add(set(c, track(arg))); return ops;
            case "subremove": { String v = track(arg); if ("no".equals(v) || "auto".equals(v)) throw new IllegalArgumentException("not allowed"); ops.add(run("sub-remove", v)); return ops; }
            case "subdelay": ops.add(set("sub-delay", num(arg, -600, 600))); return ops;
            case "audiodelay": ops.add(set("audio-delay", num(arg, -600, 600))); return ops;
            case "subscale": ops.add(set("sub-scale", num(arg, 0.3, 4))); return ops;
            case "subpos": ops.add(set("sub-pos", num(arg, 0, 150))); return ops;
            case "aspect": if (!ASPECT.matcher(arg).matches()) throw new IllegalArgumentException("not allowed"); ops.add(set("video-aspect-override", arg)); return ops;
            case "fill": ops.add(set("panscan", "1".equals(arg) ? "1.0" : "0.0")); return ops;
            case "zoom": { double z = Double.parseDouble(num(arg, 0.25, 4)); ops.add(set("video-zoom", String.format(Locale.US, "%.4f", Math.log(z) / Math.log(2)))); return ops; }
            case "eq": { JSONObject o = new JSONObject(arg);
                for (String k : new String[] { "brightness", "contrast", "saturation", "gamma", "hue" }) if (o.has(k)) { double x = o.optDouble(k); if (!Double.isNaN(x)) ops.add(set(k, String.valueOf((int) Math.max(-100, Math.min(100, x))))); }
                return ops; }
            case "sound": { String af = SOUND.get(arg); if (af == null) throw new IllegalArgumentException("not allowed"); ops.add(set("af", af)); return ops; }
            case "frame": ops.add(run("prev".equals(arg) ? "frame-back-step" : "frame-step")); return ops;
            case "chapter": { int n = Integer.parseInt(arg.trim()); if (n < 0 || n >= 1000) throw new IllegalArgumentException("not allowed"); ops.add(set("chapter", String.valueOf(n))); return ops; }
            case "deband": ops.add(set("deband", "1".equals(arg) ? "yes" : "no")); return ops;
        }
        throw new IllegalArgumentException("unknown command " + c);
    }

    // ---- the emulator test (debuggable test builds only, see MainActivity.debugTest and tools/android/player-test.sh) ----

    /** Plays the test film under the (blank) page with the page's own commands and logs what mpv reports: both audio
        languages and the subtitle listed, English first, then French and Spanish switched while the film keeps going. */
    static void selfTest(MainActivity a, String film) {
        new Thread(() -> {
            String T = "MKCPlayer";
            try {
                Thread.sleep(3000);
                UnderPlayer u; synchronized (a) { if (a.under == null) a.under = new UnderPlayer(a); u = a.under; }
                android.util.Log.i(T, "under-test: probe " + u.cmd("probe", ""));
                u.cmd("show", "1"); Thread.sleep(1500);
                android.util.Log.i(T, "under-test: open " + u.cmd("open", new JSONObject().put("url", film).put("start", 0).put("alang", "eng").put("title", "Test").toString()));
                double t1 = 0;
                for (int i = 0; i < 40 && (t1 = u.num("t")) < 2; i++) Thread.sleep(500);
                JSONArray tr = u.tracks(); int au = 0, su = 0;
                for (int i = 0; i < tr.length(); i++) { String ty = tr.getJSONObject(i).optString("type"); if ("audio".equals(ty)) au++; else if ("sub".equals(ty)) su++; }
                String a1 = u.str("aid");
                android.util.Log.i(T, "under-test: playing t=" + t1 + " audio=" + au + " subs=" + su + " aid=" + u.str("aid") + " hwdec=" + u.str("hwdec") + " size=" + u.num("w") + "x" + u.num("h"));
                u.cmd("aid", "2"); Thread.sleep(3000);
                double t2 = u.num("t");
                android.util.Log.i(T, "under-test: after aid t=" + t2 + " aid=" + u.str("aid"));
                u.cmd("sid", "1"); Thread.sleep(3000);
                double t3 = u.num("t");
                android.util.Log.i(T, "under-test: after sid t=" + t3 + " sid=" + u.str("sid"));
                String refused; try { u.cmd("open", "{\"url\":\"file:///sdcard/x\"}"); refused = "no"; } catch (Exception e) { refused = "yes"; }
                boolean ok = t1 >= 2 && au == 2 && su == 1 && "1".equals(a1) && "2".equals(u.str("aid")) && "1".equals(u.str("sid")) && t2 > t1 && t3 > t2 && "yes".equals(refused);
                android.util.Log.i(T, "under-test: local path refused=" + refused);
                android.util.Log.i(T, ok ? "under-test: PASS" : "under-test: FAIL");
            } catch (Throwable e) { android.util.Log.e(T, "under-test: FAIL " + e); }
        }).start();
    }
    double num(String k) { synchronized (lock) { Object v = vals.get(k); return v instanceof Number ? ((Number) v).doubleValue() : 0; } }
    String str(String k) { synchronized (lock) { Object v = vals.get(k); return v == null ? "" : String.valueOf(v); } }
    JSONArray tracks() { synchronized (lock) { Object v = vals.get("tracks"); return v instanceof JSONArray ? (JSONArray) v : new JSONArray(); } }

    // ---- mpv, created once on first use ----

    synchronized MPVLib client() {
        if (m != null || initErr != null) return m;
        try {
            if (!MpvEngine.available()) { initErr = "this device can't load the player"; return null; }
            MPVLib x = MPVLib.create(a.getApplicationContext());
            String[][] o = { { "config", "no" }, { "load-scripts", "no" }, { "ytdl", "no" }, { "osc", "no" }, { "osd-level", "0" },
                { "input-default-bindings", "no" }, { "terminal", "no" }, { "idle", "yes" }, { "keep-open", "no" },
                { "vo", a.tv ? "mediacodec_embed" : "gpu" }, { "gpu-context", "android" }, { "opengl-es", "yes" }, { "hwdec", a.tv ? "mediacodec" : "mediacodec-copy" }, { "hwdec-codecs", "all" },
                { "ao", "audiotrack,opensles" }, { "audio-channels", "auto-safe" }, { "force-window", "no" },
                { "cache", "yes" }, { "demuxer-max-bytes", "150MiB" }, { "demuxer-max-back-bytes", "32MiB" }, { "demuxer-readahead-secs", "60" },
                { "cache-pause-wait", "2" }, { "network-timeout", "30" },
                { "stream-lavf-o", "reconnect=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=8" },
                { "sub-font-size", "46" }, { "sub-border-size", "2.6" }, { "sub-shadow-offset", "1" }, { "sub-ass-override", "scale" },
                { "sub-auto", "no" }, { "audio-file-auto", "no" }, { "save-position-on-quit", "no" } };
            String ca = MpvEngine.caFile(a.getApplicationContext()); // https needs a CA file (see MpvEngine.caFile)
            if (ca != null) { x.setOptionString("tls-ca-file", ca); x.setOptionString("tls-verify", "yes"); }
            for (String[] kv : o) x.setOptionString(kv[0], kv[1]);
            x.init();
            x.addObserver(this);
            for (String w : WATCHED) x.observeProperty(w, 1);
            m = x;
            if (hasSurface && sv != null) surfaceCreated(sv.getHolder()); // the picture surface came up before the player did
            android.util.Log.i("MKCPlayer", "under: mpv ready");
            h.post(pump);
        } catch (Throwable e) { initErr = "the player could not start (" + e.getClass().getSimpleName() + ")"; android.util.Log.w("MKCPlayer", "under: " + initErr); }
        return m;
    }

    // ---- the picture: a surface under the page (UI thread) ----

    void show(boolean on) {
        if (on && sv == null) {
            sv = new SurfaceView(a); sv.getHolder().addCallback(this); sv.setVisibility(View.GONE);
            a.root.addView(sv, 0, new FrameLayout.LayoutParams(-1, -1));
        }
        shown = on;
        if (sv != null) { below(); sv.setVisibility(on ? View.VISIBLE : View.GONE); }
        if (a.web != null) a.web.setBackgroundColor(on ? Color.TRANSPARENT : Color.BLACK);
        android.util.Log.i("MKCPlayer", "under: show " + on);
    }
    /** keeps the surface below the page (the page's WebView can be rebuilt after its renderer stopped) */
    void below() { if (sv != null && a.root.indexOfChild(sv) != 0) { a.root.removeView(sv); a.root.addView(sv, 0, new FrameLayout.LayoutParams(-1, -1)); } }

    @Override public void surfaceCreated(SurfaceHolder hd) {
        hasSurface = true; MPVLib x = m; if (x == null) return;
        try {
            x.attachSurface(hd.getSurface());
            android.graphics.Rect r = hd.getSurfaceFrame(); if (r.width() > 0) x.setPropertyString("android-surface-size", r.width() + "x" + r.height());
            x.setOptionString("force-window", "yes"); x.setPropertyString("vo", a.tv ? "mediacodec_embed" : "gpu");
        } catch (Throwable ignored) { }
    }
    @Override public void surfaceChanged(SurfaceHolder hd, int f, int w, int ht) { MPVLib x = m; if (x != null && w > 0) try { x.setPropertyString("android-surface-size", w + "x" + ht); } catch (Throwable ignored) { } }
    @Override public void surfaceDestroyed(SurfaceHolder hd) {
        hasSurface = false; MPVLib x = m; if (x == null) return;
        try { x.setPropertyString("vo", "null"); x.setOptionString("force-window", "no"); x.detachSurface(); } catch (Throwable ignored) { }
    }

    /** the app was closed: mpv goes too */
    void release() {
        h.removeCallbacksAndMessages(null); MPVLib x; synchronized (this) { x = m; m = null; initErr = "closed"; }
        if (x != null) try { x.removeObserver(this); x.detachSurface(); x.destroy(); } catch (Throwable ignored) { }
    }
    /** the app went to the background (not picture in picture): the film pauses, like a web video */
    void pauseForBackground() { MPVLib x = m; if (x != null && shown) try { x.setPropertyString("pause", "yes"); } catch (Throwable ignored) { } }

    // ---- mpv's news, gathered and handed to the page at most 8 times a second ----

    void put(String name, Object v) { String k = KEYS.containsKey(name) ? KEYS.get(name) : name; synchronized (lock) { vals.put(k, v); dirty.add(k); } }
    void news(String k, Object v) { synchronized (lock) { extra.put(k, v); } }
    static Object parse(String name, String raw) {
        if (raw == null) return JSONObject.NULL;
        switch (name) {
            case "track-list": case "chapter-list": try { return new JSONArray(raw); } catch (Exception e) { return JSONObject.NULL; }
            case "pause": case "paused-for-cache": case "seeking": case "eof-reached": case "idle-active": case "mute": return "yes".equals(raw);
            case "aid": case "sid": case "secondary-sid": case "video-codec": case "audio-codec-name": case "hwdec-current": case "video-params/gamma": case "video-params/primaries": case "sub-text": return raw;
        }
        try { double d = Double.parseDouble(raw.trim()); return Double.isNaN(d) || Double.isInfinite(d) ? JSONObject.NULL : d; } catch (Exception e) { return raw; }
    }
    final Runnable pump = new Runnable() { @Override public void run() {
        if (m == null) return;
        String j = null;
        synchronized (lock) {
            if (!dirty.isEmpty() || !extra.isEmpty()) {
                try {
                    JSONObject o = new JSONObject(); o.put("gen", gen);
                    for (String k : dirty) o.put(k, vals.get(k));
                    for (Map.Entry<String, Object> e : extra.entrySet()) o.put(e.getKey(), e.getValue());
                    j = o.toString();
                } catch (Exception ignored) { }
                dirty.clear(); extra.clear();
            }
        }
        if (j != null && a.web != null) a.web.evaluateJavascript("window.MkAndroidPlayer&&MkAndroidPlayer._ev&&MkAndroidPlayer._ev(" + j + ")", null);
        h.postDelayed(this, 125);
    } };

    @Override public void eventProperty(String p) { put(p, JSONObject.NULL); }
    @Override public void eventProperty(String p, long v) { put(p, (double) v); }
    @Override public void eventProperty(String p, double v) { put(p, v); }
    @Override public void eventProperty(String p, boolean v) { put(p, v); }
    @Override public void eventProperty(String p, String v) { put(p, parse(p, v)); }
    @Override public void event(int id) {
        if (id == 8) { news("loaded", true); note("file loaded, size " + str("w") + "x" + str("h") + " hwdec " + str("hwdec") + " tracks " + tracks().length()); } // FILE_LOADED
    }
    @Override public void eventEndFile(int reason, int error) {
        // reason 0: the end of the film; 4: an error
        note("end-file reason " + reason + " error " + error + " t=" + num("t"));
        if (reason == 0) news("end", "eof");
        else if (reason == 4) { news("end", "error"); news("err", "the file could not be opened (" + error + ")"); android.util.Log.w("MKCPlayer", "under: mpv error " + error); }
    }
}
