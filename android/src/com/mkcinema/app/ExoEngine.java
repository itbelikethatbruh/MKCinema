package com.mkcinema.app;

import android.app.ActivityManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.SurfaceHolder;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.common.VideoSize;
import androidx.media3.common.text.Cue;
import androidx.media3.common.text.CueGroup;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector;
import androidx.media3.extractor.DefaultExtractorsFactory;
import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 1.7.0: Media3 ExoPlayer, the engine most Android TV apps use. Compared with the system MediaPlayer it reads MKV
    reliably, plays HLS, shows picture subtitles (PGS) and styled ones, names every audio track, skips audio tracks the
    TV can't decode, sends request headers on every request, and keeps the buffer inside the app's memory budget. */
class ExoEngine implements Engine {
    final Context ctx; final Listener l; final Handler h = new Handler(Looper.getMainLooper());
    ExoPlayer p; MediaItem item; String url; File subs; boolean everReady, fpsSent, slow; int retries;

    ExoEngine(Context ctx, Listener l) { this.ctx = ctx; this.l = l; }
    public String name() { return "exo"; }

    /** bytes the buffer may hold: a third of the app's large-heap budget, between 48 and 160 MB */
    long bufferBytes() {
        int mb = 256;
        try { ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE); mb = am.getLargeMemoryClass(); } catch (Exception ignored) { }
        return Math.max(48L, Math.min(160L, mb / 3L)) * 1024 * 1024;
    }

    MediaItem build() {
        MediaItem.Builder b = new MediaItem.Builder().setUri(Uri.parse(url));
        String low = url.toLowerCase(java.util.Locale.ROOT);
        if (low.contains(".m3u8")) b.setMimeType(MimeTypes.APPLICATION_M3U8);
        if (subs != null) b.setSubtitleConfigurations(Collections.singletonList(new MediaItem.SubtitleConfiguration.Builder(Uri.fromFile(subs))
            .setMimeType(MimeTypes.APPLICATION_SUBRIP).setSelectionFlags(C.SELECTION_FLAG_DEFAULT).setLabel("MKCinema").build()));
        return b.build();
    }

    public void open(String url, Map<String, String> headers, File subs, String audioLang, int startMs, SurfaceHolder holder) {
        this.url = url; this.subs = subs;
        try {
            Map<String, String> hdr = new HashMap<>(headers == null ? Collections.emptyMap() : headers);
            String ua = null;
            for (String k : new ArrayList<>(hdr.keySet())) if ("user-agent".equalsIgnoreCase(k)) ua = hdr.remove(k);
            DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setUserAgent(ua != null ? ua : "MKCinema/" + MainActivity.VER + " (Linux; Android) ExoPlayer")
                .setAllowCrossProtocolRedirects(true).setConnectTimeoutMs(15000).setReadTimeoutMs(30000).setDefaultRequestProperties(hdr);
            DefaultExtractorsFactory ex = new DefaultExtractorsFactory().setConstantBitrateSeekingEnabled(true);
            DefaultMediaSourceFactory msf = new DefaultMediaSourceFactory(new DefaultDataSource.Factory(ctx, http), ex);
            DefaultRenderersFactory rf = new DefaultRenderersFactory(ctx).setEnableDecoderFallback(true);
            DefaultTrackSelector ts = new DefaultTrackSelector(ctx);
            DefaultTrackSelector.Parameters.Builder pb = ts.buildUponParameters();
            if (audioLang != null && !audioLang.isEmpty() && !"any".equals(audioLang)) pb.setPreferredAudioLanguage(audioLang);
            ts.setParameters(pb.build());
            // 1.8.0 Slow internet mode: keep 1 to 4 minutes ready, start after 10 s and wait for 20 s after a stall, so it stops less often
            DefaultLoadControl lc = new DefaultLoadControl.Builder().setBufferDurationsMs(slow ? 60000 : 15000, slow ? 240000 : 50000, slow ? 10000 : 2500, slow ? 20000 : 5000)
                .setTargetBufferBytes((int) bufferBytes()).setPrioritizeTimeOverSizeThresholds(false).build();
            p = new ExoPlayer.Builder(ctx, rf).setTrackSelector(ts).setLoadControl(lc).setMediaSourceFactory(msf).build();
            p.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
            p.setHandleAudioBecomingNoisy(true);
            p.addListener(new Player.Listener() {
                @Override public void onPlaybackStateChanged(int st) {
                    if (st == Player.STATE_READY) { retries = 0; if (!everReady) { everReady = true; l.ready(); } l.buffering(false); }
                    else if (st == Player.STATE_BUFFERING && everReady) l.buffering(true);
                    else if (st == Player.STATE_ENDED) l.ended();
                }
                @Override public void onPlayerError(PlaybackException e) {
                    // a dropped connection mid-film: pick up again from the same spot, twice, before giving up
                    boolean net = e.errorCode >= 2000 && e.errorCode < 3000;
                    if (everReady && net && retries < 2) { retries++; l.buffering(true); h.postDelayed(() -> { if (p != null) p.prepare(); }, 1500); return; }
                    l.error("exo:" + e.getErrorCodeName(), !everReady);
                }
                @Override public void onVideoSizeChanged(VideoSize v) { l.size(v.width, v.height, v.pixelWidthHeightRatio); }
                @Override public void onCues(CueGroup g) {
                    StringBuilder sb = new StringBuilder(); Bitmap bmp = null; float bw = 0;
                    for (Cue c : g.cues) {
                        if (c.bitmap != null) { if (bmp == null) { bmp = c.bitmap; bw = c.size; } continue; }
                        if (c.text != null && c.text.length() > 0) { if (sb.length() > 0) sb.append('\n'); sb.append(c.text); }
                    }
                    l.text(sb, bmp, bw);
                }
                @Override public void onTracksChanged(Tracks t) {
                    if (fpsSent) return;
                    for (Tracks.Group g : t.getGroups()) {
                        if (g.getType() != C.TRACK_TYPE_VIDEO) continue;
                        for (int i = 0; i < g.length; i++) if (g.isTrackSelected(i)) { Format f = g.getTrackFormat(i); if (f.frameRate > 0) { fpsSent = true; l.frameRate(f.frameRate); } return; }
                    }
                }
            });
            if (holder != null) p.setVideoSurfaceHolder(holder);
            item = build();
            p.setMediaItem(item, Math.max(0, startMs));
            p.prepare(); p.setPlayWhenReady(true);
        } catch (Throwable e) { h.post(() -> l.error("exo-open:" + e.getClass().getSimpleName(), true)); }
    }
    public void surface(SurfaceHolder holder) { if (p != null) { if (holder == null) p.clearVideoSurface(); else p.setVideoSurfaceHolder(holder); } }
    public boolean playing() { return p != null && p.isPlaying(); }
    public void play() { if (p != null) { if (p.getPlaybackState() == Player.STATE_ENDED) p.seekTo(0); p.play(); } }
    public void pause() { if (p != null) p.pause(); }
    public long pos() { return p == null ? 0 : Math.max(0, p.getCurrentPosition()); }
    public long dur() { if (p == null) return 0; long d = p.getDuration(); return d == C.TIME_UNSET ? 0 : d; }
    public void seek(long ms) { if (p != null) p.seekTo(ms); }

    public List<Track> tracks(boolean wantSubs) {
        List<Track> out = new ArrayList<>(); if (p == null) return out;
        List<Tracks.Group> gs = p.getCurrentTracks().getGroups(); int n = 1;
        for (int gi = 0; gi < gs.size(); gi++) {
            Tracks.Group g = gs.get(gi);
            if (g.getType() != (wantSubs ? C.TRACK_TYPE_TEXT : C.TRACK_TYPE_AUDIO)) continue;
            for (int i = 0; i < g.length; i++) {
                if (!g.isTrackSupported(i)) continue; // e.g. DTS on a TV without a DTS decoder
                Format f = g.getTrackFormat(i);
                String label = "MKCinema".equals(f.label) ? "Downloaded" : f.label;
                out.add(new Track(gi + ":" + i, Labels.track(f.language, label, f.sampleMimeType, wantSubs ? 0 : f.channelCount, n++), g.isTrackSelected(i)));
            }
        }
        return out;
    }
    public boolean select(boolean wantSubs, String id) {
        try {
            String[] a = id.split(":"); Tracks.Group g = p.getCurrentTracks().getGroups().get(Integer.parseInt(a[0]));
            int type = wantSubs ? C.TRACK_TYPE_TEXT : C.TRACK_TYPE_AUDIO;
            p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon()
                .setOverrideForType(new TrackSelectionOverride(g.getMediaTrackGroup(), Integer.parseInt(a[1]))).setTrackTypeDisabled(type, false).build());
            return true;
        } catch (Exception e) { return false; }
    }
    public void subsOff() { if (p != null) p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()); l.text("", null, 0); }
    /** subtitles that arrived after the film started: the film reopens at the same spot with them */
    public void addSubs(File f) {
        if (p == null) { subs = f; return; }
        subs = f; long at = pos(); boolean play = p.getPlayWhenReady();
        item = build(); p.setMediaItem(item, at); p.prepare(); p.setPlayWhenReady(play);
    }
    public void release() { h.removeCallbacksAndMessages(null); if (p != null) { try { p.release(); } catch (Exception ignored) { } p = null; } }
}
