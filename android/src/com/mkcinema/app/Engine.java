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
        /** 1.17.17: the first picture of the film (or after a seek) is on screen; mpv only */
        default void firstFrame() { }
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
    /** 1.14.0: the video surface's new size in pixels (mpv draws to fit it) */
    default void resized(int w, int h) { }
    /** 1.17.17: called before open(). True when this engine opens the film paused and waits for play(), so the TV can
        switch to the film's frame rate before any sound plays. False: the engine starts on its own (the basic player). */
    default boolean holdStart() { return false; }
    /** 1.17.18: a live channel's buffered stretch {first, last} in ms of its timeline (Pause and Left go back inside
        it, Right comes forward to its end, which is live); null when the engine keeps none (mpv only) */
    default long[] liveRange() { return null; }
}
