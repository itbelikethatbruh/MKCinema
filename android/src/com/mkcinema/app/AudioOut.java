package com.mkcinema.app;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.os.Build;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** 1.17.19: Sound to a receiver. The page picks which surround formats leave the box untouched (bitstream) so the
    receiver or soundbar decodes them itself: ac3 (Dolby Digital), eac3 (Dolby Digital Plus, Atmos in DD+), dts,
    dts-hd (DTS-HD MA, which includes plain DTS) and truehd (Dolby TrueHD, Atmos in TrueHD). Anything not picked is
    decoded here and sent as PCM, as before. "audiocaps" tells the page what the HDMI connection says it takes. */
final class AudioOut {
    private AudioOut() { }

    static final String[] NAMES = { "ac3", "eac3", "dts", "dts-hd", "truehd" };

    /** the page's list ("ac3,eac3,..."), kept to the known names, in a fixed order; "" = all decoded here */
    static String clean(String list) {
        if (list == null) return "";
        Set<String> want = new LinkedHashSet<>();
        for (String p : list.toLowerCase(Locale.US).split("[,\\s]+")) want.add(p.trim());
        StringBuilder b = new StringBuilder();
        for (String n : NAMES) if (want.contains(n)) b.append(b.length() == 0 ? "" : ",").append(n);
        return b.toString();
    }

    /** Android's encoding numbers for a cleaned list (ExoPlayer), PCM always first */
    static int[] encodings(String list) {
        List<Integer> e = new ArrayList<>(); e.add(AudioFormat.ENCODING_PCM_16BIT);
        for (String n : clean(list).split(",")) {
            switch (n) {
                case "ac3": e.add(AudioFormat.ENCODING_AC3); break;
                case "eac3": e.add(AudioFormat.ENCODING_E_AC3); e.add(18 /* ENCODING_E_AC3_JOC */); break;
                case "dts": e.add(AudioFormat.ENCODING_DTS); break;
                case "dts-hd": e.add(AudioFormat.ENCODING_DTS); e.add(AudioFormat.ENCODING_DTS_HD); break;
                case "truehd": e.add(14 /* ENCODING_DOLBY_TRUEHD */); break;
                default: break;
            }
        }
        int[] o = new int[e.size()]; for (int i = 0; i < o.length; i++) o[i] = e.get(i); return o;
    }

    static String name(int enc) {
        switch (enc) {
            case AudioFormat.ENCODING_AC3: return "ac3";
            case AudioFormat.ENCODING_E_AC3: case 18: return "eac3";
            case AudioFormat.ENCODING_DTS: return "dts";
            case AudioFormat.ENCODING_DTS_HD: return "dts-hd";
            case 14: return "truehd";
            default: return null;
        }
    }

    /** What the HDMI connection reports: {"hdmi":true,"enc":["ac3","eac3",...],"ch":8,"from":"plug"}. Reads Android's
        HDMI plug news first (what TV boxes keep current), then the output devices' own lists. Never throws. */
    static JSONObject caps(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            Set<String> enc = new LinkedHashSet<>(); boolean hdmi = false; int ch = 0; String from = "";
            Intent plug = ctx.registerReceiver(null, new IntentFilter(AudioManager.ACTION_HDMI_AUDIO_PLUG));
            if (plug != null && plug.getIntExtra(AudioManager.EXTRA_AUDIO_PLUG_STATE, 0) == 1) {
                hdmi = true; from = "plug"; ch = plug.getIntExtra(AudioManager.EXTRA_MAX_CHANNEL_COUNT, 0);
                int[] e = plug.getIntArrayExtra(AudioManager.EXTRA_ENCODINGS);
                if (e != null) for (int x : e) { String n = name(x); if (n != null) enc.add(n); }
            }
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am != null && Build.VERSION.SDK_INT >= 23) {
                for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                    int t = d.getType();
                    if (t != AudioDeviceInfo.TYPE_HDMI && t != AudioDeviceInfo.TYPE_HDMI_ARC && t != 29 /* TYPE_HDMI_EARC */) continue;
                    hdmi = true; if (from.isEmpty()) from = "device";
                    for (int x : d.getEncodings()) { String n = name(x); if (n != null) enc.add(n); }
                    for (int c : d.getChannelCounts()) ch = Math.max(ch, c);
                }
            }
            if (enc.contains("dts-hd")) enc.add("dts");
            JSONArray a = new JSONArray(); for (String n : NAMES) if (enc.contains(n)) a.put(n);
            o.put("hdmi", hdmi); o.put("enc", a); o.put("ch", ch); o.put("from", from); o.put("api", Build.VERSION.SDK_INT);
        } catch (Throwable t) { try { o.put("hdmi", false); o.put("enc", new JSONArray()); o.put("err", String.valueOf(t.getMessage())); } catch (Exception ignored) { } }
        return o;
    }
}
