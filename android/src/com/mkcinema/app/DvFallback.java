package com.mkcinema.app;

import android.content.Context;
import android.media.MediaCodecInfo.CodecProfileLevel;
import android.os.Build;
import android.util.Pair;
import android.view.Display;
import android.hardware.display.DisplayManager;
import androidx.media3.common.Format;
import androidx.media3.common.MimeTypes;
import androidx.media3.exoplayer.DecoderReuseEvaluation;
import androidx.media3.exoplayer.ExoPlaybackException;
import androidx.media3.exoplayer.FormatHolder;
import androidx.media3.exoplayer.mediacodec.MediaCodecInfo;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil;
import androidx.media3.exoplayer.video.MediaCodecVideoRenderer;
import java.util.List;

/** 1.9.0: Dolby Vision profile 7 (the UHD Blu-ray kind) on TVs without it. Its base layer is ordinary HDR10 HEVC, but
    Media3 won't hand profile 7 to a plain HEVC decoder, so those files failed on most TVs. This video renderer
    relabels a profile 7 track as HEVC when no Dolby Vision decoder here can play it, or the screen can't show
    Dolby Vision: the TV then plays the HDR10 picture and skips the Dolby Vision layer. TVs that do support
    profile 7 (Shield, for example) keep real Dolby Vision. */
final class DvFallback extends MediaCodecVideoRenderer {
    static final String TAG = "MKCinema";
    final Context ctx;
    /** the last decision, so the decoder list is read once per file and not on every format check */
    Format lastIn, lastOut;
    /** true once a file played this way, so the player can say so */
    static volatile boolean used;

    DvFallback(Context ctx, Builder b) { super(b); this.ctx = ctx; }

    @Override protected int supportsFormat(MediaCodecSelector sel, Format f) throws MediaCodecUtil.DecoderQueryException {
        return super.supportsFormat(sel, map(f));
    }

    @Override protected List<MediaCodecInfo> getDecoderInfos(MediaCodecSelector sel, Format f, boolean secure) throws MediaCodecUtil.DecoderQueryException {
        return super.getDecoderInfos(sel, map(f), secure);
    }

    @Override protected DecoderReuseEvaluation onInputFormatChanged(FormatHolder fh) throws ExoPlaybackException {
        Format f = fh.format, m = map(f);
        if (m != f) { fh.format = m; used = true; android.util.Log.i(TAG, "Dolby Vision profile 7: playing the HDR10 base layer"); }
        return super.onInputFormatChanged(fh);
    }

    Format map(Format f) {
        if (f == null || !MimeTypes.VIDEO_DOLBY_VISION.equals(f.sampleMimeType)) return f;
        if (f == lastIn) return lastOut;
        Format out = f;
        try {
            Pair<Integer, Integer> pl = MediaCodecUtil.getCodecProfileAndLevel(f);
            if (pl != null && pl.first == CodecProfileLevel.DolbyVisionProfileDvheDtb && !realDv(f))
                // codecs left empty: Media3 then treats the profile as supported and lets the HEVC decoder try,
                // and the decoder still reads the HDR10 colour details from the stream itself
                out = f.buildUpon().setSampleMimeType(MimeTypes.VIDEO_H265).setCodecs(null).build();
        } catch (Throwable ignored) { }
        lastIn = f; lastOut = out;
        return out;
    }

    /** a Dolby Vision decoder that takes this profile, on a screen that shows Dolby Vision */
    boolean realDv(Format f) {
        if (Build.VERSION.SDK_INT >= 24) {
            try {
                DisplayManager dm = (DisplayManager) ctx.getSystemService(Context.DISPLAY_SERVICE);
                Display d = dm == null ? null : dm.getDisplay(Display.DEFAULT_DISPLAY);
                Display.HdrCapabilities caps = d == null ? null : d.getHdrCapabilities();
                boolean dv = false;
                if (caps != null) for (int t : caps.getSupportedHdrTypes()) if (t == Display.HdrCapabilities.HDR_TYPE_DOLBY_VISION) dv = true;
                if (!dv) return false;
            } catch (Throwable ignored) { }
        }
        try {
            for (MediaCodecInfo i : MediaCodecUtil.getDecoderInfos(MimeTypes.VIDEO_DOLBY_VISION, false, false))
                if (i.isFormatFunctionallySupported(f)) return true;
        } catch (Throwable ignored) { }
        return false;
    }
}
