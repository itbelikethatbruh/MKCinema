package com.mkcinema.app;

import android.content.Context;
import android.view.View;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.RenderersFactory;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.extractor.ExtractorsFactory;
import io.github.peerless2012.ass.media.AssHandler;
import io.github.peerless2012.ass.media.AssHandlerConfig;
import io.github.peerless2012.ass.media.factory.AssRenderersFactory;
import io.github.peerless2012.ass.media.kt.AssPlayerKt;
import io.github.peerless2012.ass.media.parser.AssSubtitleParserFactory;
import io.github.peerless2012.ass.media.type.AssRenderType;
import io.github.peerless2012.ass.media.widget.AssSubtitleView;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;

/** 1.9.0: full ASS/SSA subtitles in the TV player, drawn by libass (the renderer VLC and mpv use) through ass-media
    (MIT licence, github.com/peerless2012/libass-android). Fonts, colours, outlines, positions, karaoke and signs
    look the way the subtitle maker styled them, for subtitles inside MKV files and downloaded .ass files alike.
    Every call here is guarded: if libass can't load on a device, the player keeps Media3's plain subtitles. */
final class Ass {
    private Ass() { }

    /** true when a subtitle file is ASS/SSA rather than SRT */
    static boolean isAss(File f) {
        try (FileInputStream in = new FileInputStream(f)) {
            byte[] b = new byte[2048]; int n = in.read(b); if (n <= 0) return false;
            return new String(b, 0, n, StandardCharsets.UTF_8).contains("[Script Info]");
        } catch (Exception e) { return false; }
    }

    static Hook hook(Context ctx) {
        try { return new Hook(ctx); }
        catch (Throwable t) { android.util.Log.w("MKCinema", "libass unavailable: " + t); return null; }
    }

    static final class Hook {
        final AssHandler h; final AssSubtitleParserFactory parsers; final View view;
        Hook(Context ctx) {
            System.loadLibrary("asskt"); // fails here, not mid-film, when the library is missing for this processor
            h = new AssHandler(AssRenderType.OVERLAY_CANVAS, new AssHandlerConfig());
            parsers = new AssSubtitleParserFactory(h);
            view = new AssSubtitleView(ctx, h);
        }
        ExtractorsFactory extractors(ExtractorsFactory ex) { return AssPlayerKt.withAssMkvSupport(ex, parsers, h); }
        RenderersFactory renderers(RenderersFactory rf) { return new AssRenderersFactory(h, rf); }
        void sources(DefaultMediaSourceFactory msf) { msf.setSubtitleParserFactory(parsers); }
        boolean attach(ExoPlayer p) {
            try { h.init(p); return true; } catch (Throwable t) { android.util.Log.w("MKCinema", "libass attach failed: " + t); return false; }
        }
    }
}
