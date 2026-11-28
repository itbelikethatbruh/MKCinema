package com.mkcinema.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.SurfaceHolder;
import dev.jdtech.mpv.MPVLib;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** 1.14.0: mpv (libmpv, the engine of mpv and many VLC-class players), MKCinema Player's main engine. It reads every
    container and codec FFmpeg knows, decodes DTS, TrueHD, AC3 and E-AC3 itself (no TV decoder needed, so those tracks
    are never hidden), and switches audio and subtitle tracks instantly, without reloading or jumping back.

    Two ways of drawing the picture:
    - phones and tablets: mpv's own GPU renderer with hardware decoding (copy-back), so subtitles keep their full ASS
      styling and picture subtitles (PGS, VobSub) show.
    - TVs: the decoder draws straight onto the screen (mediacodec_embed), the same path as the TV's own player, so 4K
      stays smooth on small TV boxes and HDR stays HDR. mpv can't draw over that picture, so text subtitles come back
      through sub-text and PlayerActivity shows them; picture subtitles can't be shown in this mode (the track list
      says so, and the person can switch engine in Settings). */
class MpvEngine implements Engine, MPVLib.EventObserver {
    final Context ctx; final Listener l; final Handler h = new Handler(Looper.getMainLooper());
    String spdif = ""; MPVLib m; boolean embed, loaded, ended, dead, fpsSent, slow, held, live; int w, ht; String lastErr = "";
    /** 1.17.17: opens paused; PlayerActivity calls play() once the TV is ready for the picture */
    public boolean holdStart() { held = true; return true; }
    /** 1.17.17: the mpv being shut down after Back (see release), so the next film waits for it to let go of the
        decoders and the sound output */
    static volatile Thread closing;
    static boolean closing() { Thread t = closing; return t != null && t.isAlive(); }
    static void awaitClosed(long ms) { Thread t = closing; if (t != null) try { t.join(ms); } catch (InterruptedException ignored) { } }
    volatile double pos, dur; volatile boolean paused;

    MpvEngine(Context ctx, Listener l, boolean embed) { this.ctx = ctx; this.l = l; this.embed = embed; }
    public String name() { return "mpv"; }

    /** false when libmpv can't load on this device (missing ABI, old Android): PlayerActivity uses ExoPlayer instead */
    static boolean available() {
        try { Class.forName("dev.jdtech.mpv.MPVLib", true, MpvEngine.class.getClassLoader()); return true; }
        catch (Throwable t) { return false; }
    }

    long bufferMb() {
        int mb = 256;
        try { mb = ((ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE)).getLargeMemoryClass(); } catch (Exception ignored) { }
        return Math.max(48L, Math.min(slow ? 300L : 160L, mb / 3L));
    }

    void opt(String k, String v) { m.setOptionString(k, v); }

    /** 1.15.3: FFmpeg inside libmpv uses mbedTLS, which has no Android certificate store, so every https link failed to
        open at once (mpv error -13) until it is given a CA file. The Mozilla bundle ships in assets/cacert.pem and is
        copied once into the app's files folder. Returns its path, or null (then mpv keeps its default). */
    static String caFile(Context c) {
        try {
            File f = new File(c.getFilesDir(), "cacert.pem");
            long want = 0;
            try (java.io.InputStream in = c.getAssets().open("cacert.pem")) { want = in.available(); }
            if (!f.isFile() || f.length() != want) {
                try (java.io.InputStream in = c.getAssets().open("cacert.pem"); java.io.FileOutputStream out = new java.io.FileOutputStream(f)) {
                    byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
            }
            return f.getAbsolutePath();
        } catch (Exception e) { return null; }
    }

    public void open(String url, Map<String, String> headers, File subs, String audioLang, int startMs, SurfaceHolder holder) {
        try {
            m = MPVLib.create(ctx);
            { String ca = caFile(ctx); if (ca != null) { opt("tls-ca-file", ca); opt("tls-verify", "yes"); } }
            opt("config", "no"); opt("load-scripts", "no"); opt("ytdl", "no"); opt("osc", "no"); opt("osd-level", "0");
            opt("input-default-bindings", "no"); opt("terminal", "no"); opt("idle", "yes"); opt("keep-open", "no");
            if (embed) { opt("vo", "mediacodec_embed"); opt("hwdec", "mediacodec"); }
            else { opt("vo", "gpu"); opt("gpu-context", "android"); opt("opengl-es", "yes"); opt("hwdec", "mediacodec-copy"); }
            opt("hwdec-codecs", "all");
            opt("ao", "audiotrack,opensles"); opt("audio-channels", "auto-safe");
            if (!spdif.isEmpty()) opt("audio-spdif", spdif); // 1.17.19: Sound to a receiver (AudioOut)
            // a large read-ahead so debrid links ride out slow patches; Slow internet mode keeps more
            opt("cache", "yes"); opt("demuxer-max-bytes", bufferMb() + "MiB"); opt("demuxer-max-back-bytes", "32MiB");
            opt("demuxer-readahead-secs", slow ? "240" : "60"); opt("cache-pause-wait", slow ? "10" : "2");
            opt("network-timeout", "30");
            // 1.17.18 pause live TV: a live channel keeps what it has read in a file in the app's cache (a quarter of the
            // free space, 64 MB to 2 GB, half behind and half ahead), so Pause holds the channel and Left goes back in it.
            // mpv deletes the file itself; the folder is emptied again on each channel.
            if (live) {
                File dir = new File(ctx.getCacheDir(), "timeshift"); File[] old = dir.listFiles(); if (old != null) for (File f : old) f.delete(); dir.mkdirs();
                long mb = Math.max(64L, Math.min(2048L, dir.getUsableSpace() / 4L / (1L << 20)));
                opt("cache-on-disk", "yes"); opt("demuxer-cache-dir", dir.getAbsolutePath());
                opt("demuxer-max-bytes", (mb / 2) + "MiB"); opt("demuxer-max-back-bytes", (mb / 2) + "MiB");
                opt("cache-secs", "7200"); opt("demuxer-readahead-secs", "7200"); opt("force-seekable", "yes");
                android.util.Log.i("MKCPlayer", "live channel: keeps up to " + mb + " MB to pause and go back");
            }
            opt("stream-lavf-o", "reconnect=1,reconnect_streamed=1,reconnect_on_network_error=1,reconnect_delay_max=8");
            // subtitles: big and readable at a distance, files' own styling kept
            opt("sub-font-size", "46"); opt("sub-border-size", "2.6"); opt("sub-shadow-offset", "1"); opt("sub-ass-override", "scale");
            opt("sub-auto", "no"); opt("audio-file-auto", "no"); opt("save-position-on-quit", "no");
            String ua = null; StringBuilder hf = new StringBuilder();
            if (headers != null) for (Map.Entry<String, String> e : headers.entrySet()) {
                String k = e.getKey(), v = e.getValue(); if (k == null || v == null || v.indexOf('\n') >= 0 || v.indexOf('\r') >= 0) continue;
                if ("user-agent".equalsIgnoreCase(k)) { ua = v; continue; }
                if ("referer".equalsIgnoreCase(k)) { opt("referrer", v); continue; }
                if (hf.length() > 0) hf.append(','); hf.append(k).append(": ").append(v.replace(",", "\\,"));
            }
            opt("user-agent", ua != null ? ua : "MKCinema/" + MainActivity.VER + " (Linux; Android) mpv");
            if (hf.length() > 0) opt("http-header-fields", hf.toString());
            if (audioLang != null && !audioLang.isEmpty() && !"any".equals(audioLang)) opt("alang", audioLang + ",eng");
            if (held) opt("pause", "yes");
            if (startMs > 0) opt("start", String.format(Locale.US, "%.3f", startMs / 1000.0));
            m.init();
            m.addObserver(this);
            m.observeProperty("time-pos", 5); m.observeProperty("duration", 5); m.observeProperty("pause", 3);
            m.observeProperty("paused-for-cache", 3); m.observeProperty("video-params/dw", 4); m.observeProperty("video-params/dh", 4);
            m.observeProperty("container-fps", 5);
            if (embed) m.observeProperty("sub-text", 1);
            if (holder != null) attach(holder);
            // a file from another app (content://): mpv reads it through a file descriptor it closes itself
            String src = url;
            if (url.startsWith("content://")) {
                android.os.ParcelFileDescriptor fd = ctx.getContentResolver().openFileDescriptor(android.net.Uri.parse(url), "r");
                src = "fdclose://" + fd.detachFd();
            }
            m.command(new String[] { "loadfile", src, "replace" });
            if (subs != null) addSubs(subs);
        } catch (Throwable e) { h.post(() -> l.error("mpv-open:" + e.getClass().getSimpleName(), true)); }
    }

    void attach(SurfaceHolder holder) {
        m.attachSurface(holder.getSurface());
        android.graphics.Rect r = holder.getSurfaceFrame();
        if (r.width() > 0) m.setPropertyString("android-surface-size", r.width() + "x" + r.height());
        m.setOptionString("force-window", "yes");
        m.setPropertyString("vo", embed ? "mediacodec_embed" : "gpu");
    }
    public void surface(SurfaceHolder holder) {
        if (m == null) return;
        if (holder == null) { m.setPropertyString("vo", "null"); m.setOptionString("force-window", "no"); m.detachSurface(); }
        else attach(holder);
    }
    public void resized(int width, int height) { if (m != null && width > 0) m.setPropertyString("android-surface-size", width + "x" + height); }

    public boolean playing() { return m != null && loaded && !paused && !ended; }
    public void play() {
        if (m == null) return;
        if (ended) { ended = false; m.command(new String[] { "seek", "0", "absolute" }); }
        m.setPropertyBoolean("pause", false);
    }
    public void pause() { if (m != null) m.setPropertyBoolean("pause", true); }
    /** 1.17.18: mpv's demuxer-cache-state (a node, read as JSON): the first seekable range, and the cache's end */
    @Override public long[] liveRange() {
        if (m == null || !live) return null;
        try {
            String j = m.getPropertyString("demuxer-cache-state"); if (j == null || j.isEmpty()) return null;
            org.json.JSONObject o = new org.json.JSONObject(j); org.json.JSONArray r = o.optJSONArray("seekable-ranges");
            double end = o.optDouble("cache-end", -1), start = -1;
            if (r != null && r.length() > 0) { org.json.JSONObject x = r.getJSONObject(r.length() - 1); start = x.optDouble("start", -1); end = Math.max(end, x.optDouble("end", -1)); }
            if (start < 0 || end <= start) return null;
            return new long[] { (long) (start * 1000), (long) (end * 1000) };
        } catch (Exception e) { return null; }
    }
    public long pos() { return (long) (Math.max(0, pos) * 1000); }
    public long dur() { return (long) (Math.max(0, dur) * 1000); }
    public void seek(long ms) { if (m != null) { ended = false; m.command(new String[] { "seek", String.format(Locale.US, "%.3f", ms / 1000.0), "absolute" }); } }

    static String codecName(String c, String profile) {
        if (c == null) return "";
        switch (c) {
            case "dts": return profile != null && profile.contains("MA") ? "DTS-HD MA" : profile != null && profile.contains("HD") ? "DTS-HD" : "DTS";
            case "truehd": return "TrueHD";
            case "eac3": return "E-AC3";
            case "ac3": return "AC3";
            case "aac": return "AAC";
            case "opus": return "Opus";
            case "flac": return "FLAC";
            case "mp3": return "MP3";
            case "vorbis": return "Vorbis";
            case "subrip": return "SRT";
            case "ass": case "ssa": return "ASS";
            case "hdmv_pgs_subtitle": return "PGS";
            case "dvd_subtitle": return "VobSub";
            case "webvtt": return "WebVTT";
            case "mov_text": return "Text";
            default: return c.startsWith("pcm") ? "PCM" : c.toUpperCase(Locale.US);
        }
    }
    static boolean picture(String c) { return "hdmv_pgs_subtitle".equals(c) || "dvd_subtitle".equals(c) || "dvb_subtitle".equals(c); }

    public List<Track> tracks(boolean wantSubs) {
        List<Track> out = new ArrayList<>(); if (m == null) return out;
        try {
            JSONArray a = new JSONArray(m.getPropertyString("track-list")); int n = 1;
            for (int i = 0; i < a.length(); i++) {
                JSONObject t = a.getJSONObject(i);
                if (!(wantSubs ? "sub" : "audio").equals(t.optString("type"))) continue;
                String codec = t.optString("codec"), title = t.optString("title", "");
                if (t.optBoolean("external") && title.isEmpty()) title = "Downloaded";
                int ch = t.optInt("demux-channel-count", 0);
                String label = Labels.track(t.optString("lang", ""), title, null, wantSubs ? 0 : ch, n++);
                String c = codecName(codec, t.optString("codec-profile", ""));
                if (t.optBoolean("forced")) label += "  ·  Forced";
                if (!c.isEmpty()) label += "  ·  " + c;
                if (wantSubs && embed && picture(codec)) label += " (needs ExoPlayer engine on TVs)";
                out.add(new Track(String.valueOf(t.getInt("id")), label, t.optBoolean("selected")));
            }
        } catch (Exception ignored) { }
        return out;
    }
    public boolean select(boolean wantSubs, String id) {
        if (m == null) return false;
        try { Integer.parseInt(id); m.setPropertyString(wantSubs ? "sid" : "aid", id); android.util.Log.i("MKCPlayer", (wantSubs ? "sid " : "aid ") + id + " now " + m.getPropertyString(wantSubs ? "sid" : "aid") + " at " + pos); if (wantSubs && embed) h.post(() -> l.text("", null, 0)); return true; }
        catch (Exception e) { return false; }
    }
    public void subsOff() { if (m != null) m.setPropertyString("sid", "no"); l.text("", null, 0); }
    /** subtitles that arrive after the film started are added live, no reopening */
    public void addSubs(File f) { if (m != null && f != null) m.command(new String[] { "sub-add", f.getAbsolutePath(), "select", "Downloaded" }); }
    public void release() {
        dead = true; h.removeCallbacksAndMessages(null);
        if (m != null) { MPVLib x = m; m = null; try { x.removeObserver(this); x.detachSurface(); x.destroy(); } catch (Throwable ignored) { } }
    }
    /** 1.17.17: mpv shuts down on its own thread, the way UnderPlayer does it. On a slow TV box (Fire TV Stick) closing
        the decoders, the sound output and a network read in progress can take a while, and it used to run on the screen's
        thread, so Back seemed to do nothing until it finished. The screen now closes at once. Switching to another engine
        after an error still uses release(), which waits, so two players never hold the TV's decoders at once. */
    void releaseAsync() {
        dead = true; h.removeCallbacksAndMessages(null);
        if (m == null) return;
        final MPVLib x = m; m = null;
        try { x.removeObserver(this); } catch (Throwable ignored) { }
        Thread t = new Thread(() -> {
            long t0 = android.os.SystemClock.uptimeMillis();
            try { x.detachSurface(); x.destroy(); } catch (Throwable ignored) { }
            android.util.Log.i("MKCPlayer", "mpv closed in " + (android.os.SystemClock.uptimeMillis() - t0) + " ms");
        }, "mpv-close");
        closing = t;
        try { t.start(); } catch (Throwable e) { closing = null; try { x.detachSurface(); x.destroy(); } catch (Throwable ignored) { } }
    }

    // ---- libmpv events (on mpv's thread) ----
    @Override public void event(int id) {
        if (id == 8) h.post(() -> { if (dead || loaded) return; loaded = true; ended = false; android.util.Log.i("MKCPlayer", "mpv ready " + (embed ? "embed" : "gpu")); l.ready(); }); // FILE_LOADED
        else if (id == 21) h.post(() -> { if (!dead) { l.buffering(false); l.firstFrame(); } }); // PLAYBACK_RESTART (first picture on screen, and after a seek)
    }
    @Override public void eventEndFile(int reason, int error) {
        // reason 0: the end of the film; 4: an error (it never started, or the connection failed for good)
        h.post(() -> {
            if (dead) return;
            if (reason == 0) { ended = true; l.ended(); }
            else if (reason == 4) { android.util.Log.w("MKCPlayer", "mpv error " + error); l.error("mpv:" + error, !loaded); }
        });
    }
    @Override public void eventProperty(String p) { if ("sub-text".equals(p)) h.post(() -> { if (!dead) l.text("", null, 0); }); }
    @Override public void eventProperty(String p, long v) {
        if ("video-params/dw".equals(p)) w = (int) v; else if ("video-params/dh".equals(p)) ht = (int) v; else return;
        if (w > 0 && ht > 0) { final int a = w, b = ht; h.post(() -> { if (!dead) l.size(a, b, 1f); }); }
    }
    @Override public void eventProperty(String p, double v) {
        if ("time-pos".equals(p)) pos = v;
        else if ("duration".equals(p)) dur = v;
        else if ("container-fps".equals(p) && v > 0 && !fpsSent) { fpsSent = true; final float f = (float) v; h.post(() -> { if (!dead) l.frameRate(f); }); }
    }
    @Override public void eventProperty(String p, boolean v) {
        if ("pause".equals(p)) paused = v;
        else if ("paused-for-cache".equals(p)) h.post(() -> { if (!dead && loaded) l.buffering(v); });
    }
    @Override public void eventProperty(String p, String v) {
        if ("sub-text".equals(p)) h.post(() -> { if (!dead) l.text(v == null ? "" : v, null, 0); });
    }
}
