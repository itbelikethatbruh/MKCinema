package com.mkcinema.app;

import android.graphics.Bitmap;
import android.view.SurfaceHolder;
import java.io.File;
import java.util.List;
import java.util.Map;

/** 1.7.0: the TV player's video engine. ExoEngine (Media3 ExoPlayer) is the default; MpEngine is the system
    MediaPlayer that 1.2.5 to 1.6.x used, kept as the fallback when ExoPlayer can't open a file. */
interface Engine {
    interface Listener {
        void ready();
        void size(int w, int h, float par);
        void ended();
        /** code is short and readable; beforeReady is true when the file never started */
        void error(String code, boolean beforeReady);
        void buffering(boolean on);
        void text(CharSequence t, Bitmap picture, float pictureWidth);
        void frameRate(float fps);
    }
    /** a track for the Audio or Subtitles list: id is the engine's own, label is shown */
    final class Track { final String id, label; final boolean on; Track(String id, String label, boolean on) { this.id = id; this.label = label; this.on = on; } }

    String name();
    void open(String url, Map<String, String> headers, File subs, String audioLang, int startMs, SurfaceHolder holder);
    void surface(SurfaceHolder holder);
    boolean playing();
    void play();
    void pause();
    long pos();
    long dur();
    void seek(long ms);
    List<Track> tracks(boolean subs);
    boolean select(boolean subs, String id);
    void subsOff();
    void addSubs(File srt);
    void release();
}
