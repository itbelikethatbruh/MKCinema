package com.mkcinema.app;

import android.content.Context;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.SurfaceHolder;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** The system MediaPlayer (the TV player engine from 1.2.5 to 1.6.x), now the fallback engine. */
class MpEngine implements Engine {
    final Context ctx; final Listener l; final Handler h = new Handler(Looper.getMainLooper());
    MediaPlayer mp; boolean prepared; String url; Map<String, String> hdr; File pendingSubs;
    MpEngine(Context ctx, Listener l) { this.ctx = ctx; this.l = l; }
    public String name() { return "system"; }

    public void open(String url, Map<String, String> headers, File subs, String audioLang, int startMs, SurfaceHolder holder) {
        this.url = url; this.hdr = headers; pendingSubs = subs;
        mp = new MediaPlayer();
        try {
            mp.setDataSource(ctx, Uri.parse(url), headers);
            mp.setDisplay(holder);
            mp.setScreenOnWhilePlaying(true);
            mp.setOnPreparedListener(m -> {
                prepared = true; pickAudio(audioLang); if (startMs > 0) m.seekTo(startMs); m.start();
                if (pendingSubs != null) { File f = pendingSubs; pendingSubs = null; addSubs(f); }
                l.size(m.getVideoWidth(), m.getVideoHeight(), 1f); l.ready();
                // 1.6.1: the frame rate is read only once the player has the file open (a second connection at the same time doubled the load)
                if (Build.VERSION.SDK_INT >= 23) new Thread(this::readFps).start();
            });
            mp.setOnVideoSizeChangedListener((m, w, hh) -> l.size(w, hh, 1f));
            mp.setOnCompletionListener(m -> l.ended());
            mp.setOnErrorListener((m, what, extra) -> { l.error("mp:" + what + ":" + extra, !prepared); return true; });
            mp.setOnInfoListener((m, what, extra) -> { if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) l.buffering(true); else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END) l.buffering(false); return false; });
            mp.setOnTimedTextListener((m, t) -> l.text(t == null ? "" : t.getText(), null, 0));
            mp.prepareAsync();
        } catch (Exception e) { h.post(() -> l.error("open:" + e.getClass().getSimpleName(), true)); }
    }
    void readFps() {
        float fps = 0; MediaExtractor x = new MediaExtractor();
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
        final float f = fps; if (f > 0) h.post(() -> l.frameRate(f));
    }
    public void surface(SurfaceHolder holder) { if (mp != null) try { mp.setDisplay(holder); } catch (Exception ignored) { } }
    public boolean playing() { try { return prepared && mp.isPlaying(); } catch (Exception e) { return false; } }
    public void play() { if (prepared) mp.start(); }
    public void pause() { if (prepared) try { mp.pause(); } catch (Exception ignored) { } }
    public long pos() { try { return prepared ? mp.getCurrentPosition() : 0; } catch (Exception e) { return 0; } }
    public long dur() { try { return prepared ? mp.getDuration() : 0; } catch (Exception e) { return 0; } }
    public void seek(long ms) { if (prepared) try { mp.seekTo((int) ms); } catch (Exception ignored) { } }

    void pickAudio(String audioLang) {
        if (audioLang == null || audioLang.isEmpty() || "any".equals(audioLang)) return;
        try {
            java.util.Set<String> want = Labels.langCodes(audioLang);
            MediaPlayer.TrackInfo[] tr = mp.getTrackInfo(); int first = -1;
            for (int k = 0; k < tr.length; k++) {
                if (tr[k].getTrackType() != MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO) continue;
                if (first < 0) first = k;
                String lg = tr[k].getLanguage();
                if (lg != null && want.contains(lg.toLowerCase(java.util.Locale.ROOT))) { if (k != first) mp.selectTrack(k); return; }
            }
        } catch (Exception ignored) { }
    }
    public List<Track> tracks(boolean subs) {
        List<Track> out = new ArrayList<>(); if (!prepared) return out;
        MediaPlayer.TrackInfo[] tr = mp.getTrackInfo();
        int cur = -1;
        try { cur = subs ? -2 : mp.getSelectedTrack(MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO); } catch (Exception ignored) { }
        int n = 1;
        for (int k = 0; k < tr.length; k++) {
            int t = tr[k].getTrackType();
            if (!(subs ? (t == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_TIMEDTEXT || t == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_SUBTITLE) : t == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_AUDIO)) continue;
            boolean on = false;
            try { on = subs ? mp.getSelectedTrack(t) == k : cur == k; } catch (Exception ignored) { }
            String mime = null; int ch = 0;
            try { MediaFormat f = tr[k].getFormat(); if (f != null) { mime = f.getString(MediaFormat.KEY_MIME); if (f.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) ch = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT); } } catch (Exception ignored) { }
            out.add(new Track(String.valueOf(k), Labels.track(tr[k].getLanguage(), null, mime, ch, n++), on));
        }
        return out;
    }
    public boolean select(boolean subs, String id) {
        try {
            int k = Integer.parseInt(id);
            if (subs) for (Track t : tracks(true)) if (t.on && !t.id.equals(id)) mp.deselectTrack(Integer.parseInt(t.id));
            mp.selectTrack(k); return true;
        } catch (Exception e) { return false; }
    }
    public void subsOff() { for (Track t : tracks(true)) if (t.on) try { mp.deselectTrack(Integer.parseInt(t.id)); } catch (Exception ignored) { } l.text("", null, 0); }
    public void addSubs(File f) {
        if (!prepared) { pendingSubs = f; return; }
        try {
            mp.addTimedTextSource(f.getAbsolutePath(), MediaPlayer.MEDIA_MIMETYPE_TEXT_SUBRIP);
            MediaPlayer.TrackInfo[] tr = mp.getTrackInfo();
            for (int k = tr.length - 1; k >= 0; k--) if (tr[k].getTrackType() == MediaPlayer.TrackInfo.MEDIA_TRACK_TYPE_TIMEDTEXT) { mp.selectTrack(k); break; }
        } catch (Exception ignored) { }
    }
    public void release() { h.removeCallbacksAndMessages(null); if (mp != null) { try { mp.release(); } catch (Exception ignored) { } mp = null; } prepared = false; }
}
