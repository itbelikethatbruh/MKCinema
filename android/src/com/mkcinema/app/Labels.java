package com.mkcinema.app;

import java.util.Locale;

/** Track names for the Audio and Subtitles lists, shared by both engines: "English · E-AC3 5.1". */
final class Labels {
    private Labels() { }
    static java.util.Set<String> langCodes(String c) {
        java.util.Set<String> s = new java.util.HashSet<>(); c = c.toLowerCase(Locale.ROOT); s.add(c);
        String[][] same = { { "eng", "en" }, { "spa", "es" }, { "fre", "fra", "fr" }, { "ger", "deu", "de" }, { "ita", "it" }, { "por", "pt" }, { "hin", "hi" }, { "jpn", "ja" }, { "kor", "ko" } };
        for (String[] g : same) if (java.util.Arrays.asList(g).contains(c)) s.addAll(java.util.Arrays.asList(g));
        return s;
    }
    static String codec(String mime) {
        if (mime == null) return "";
        switch (mime) {
            case "audio/eac3-joc": return "Atmos";
            case "audio/eac3": return "E-AC3";
            case "audio/ac3": return "AC3";
            case "audio/ac4": return "AC4";
            case "audio/vnd.dts": return "DTS";
            case "audio/vnd.dts.hd": case "audio/vnd.dts.hd;profile=lbr": return "DTS-HD";
            case "audio/vnd.dts.uhd;profile=p2": return "DTS:X";
            case "audio/true-hd": return "TrueHD";
            case "audio/mp4a-latm": return "AAC";
            case "audio/opus": return "Opus";
            case "audio/flac": return "FLAC";
            case "audio/mpeg": return "MP3";
            case "audio/raw": return "PCM";
            case "application/x-subrip": return "SRT";
            case "text/x-ssa": return "ASS";
            case "text/vtt": return "WebVTT";
            case "application/pgs": return "picture";
            case "application/vobsub": return "picture";
            case "application/dvbsubs": return "picture";
            default: return mime.replaceFirst("^[a-z]+/", "").toUpperCase(Locale.ROOT);
        }
    }
    static String track(String lang, String label, String mime, int ch, int n) {
        String name = "";
        if (lang != null && !lang.isEmpty() && !"und".equals(lang)) {
            name = Locale.forLanguageTag(lang.replace('_', '-')).getDisplayLanguage();
            if (name.isEmpty()) name = new Locale(lang).getDisplayLanguage();
        }
        if (label != null && !label.isEmpty() && !label.equalsIgnoreCase(name)) name = name.isEmpty() ? label : name + " (" + label + ")";
        String extra = codec(mime);
        if (ch > 0) extra += (extra.isEmpty() ? "" : " ") + (ch == 6 ? "5.1" : ch == 8 ? "7.1" : ch == 2 ? "stereo" : ch == 1 ? "mono" : ch + " ch");
        String l = name.isEmpty() ? "Track " + n : name;
        return extra.isEmpty() ? l : l + "  ·  " + extra;
    }
}
