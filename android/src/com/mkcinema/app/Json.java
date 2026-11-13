package com.mkcinema.app;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 1.12.1: a tiny JSON reader/writer with no Android classes, so the Chromecast code can be tested on a computer. */
final class Json {
    private Json() {}

    static String q(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default: if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    static Object parse(String s) {
        if (s == null) return null;
        try { int[] at = { 0 }; return value(s, at); } catch (RuntimeException e) { return null; }
    }
    static void ws(String s, int[] at) { while (at[0] < s.length() && Character.isWhitespace(s.charAt(at[0]))) at[0]++; }
    static Object value(String s, int[] at) {
        ws(s, at);
        char c = s.charAt(at[0]);
        if (c == '{') {
            Map<String, Object> m = new LinkedHashMap<>(); at[0]++; ws(s, at);
            if (s.charAt(at[0]) == '}') { at[0]++; return m; }
            while (true) {
                ws(s, at); String k = (String) value(s, at); ws(s, at); at[0]++; // ':'
                m.put(k, value(s, at)); ws(s, at);
                char d = s.charAt(at[0]++); if (d == '}') return m;
            }
        }
        if (c == '[') {
            List<Object> l = new ArrayList<>(); at[0]++; ws(s, at);
            if (s.charAt(at[0]) == ']') { at[0]++; return l; }
            while (true) { l.add(value(s, at)); ws(s, at); char d = s.charAt(at[0]++); if (d == ']') return l; }
        }
        if (c == '"') {
            StringBuilder b = new StringBuilder(); at[0]++;
            while (true) {
                char d = s.charAt(at[0]++);
                if (d == '"') return b.toString();
                if (d == '\\') {
                    char e = s.charAt(at[0]++);
                    switch (e) {
                        case 'n': b.append('\n'); break; case 't': b.append('\t'); break; case 'r': b.append('\r'); break;
                        case 'b': b.append('\b'); break; case 'f': b.append('\f'); break;
                        case 'u': b.append((char) Integer.parseInt(s.substring(at[0], at[0] + 4), 16)); at[0] += 4; break;
                        default: b.append(e);
                    }
                } else b.append(d);
            }
        }
        if (s.startsWith("true", at[0])) { at[0] += 4; return Boolean.TRUE; }
        if (s.startsWith("false", at[0])) { at[0] += 5; return Boolean.FALSE; }
        if (s.startsWith("null", at[0])) { at[0] += 4; return null; }
        int st = at[0];
        while (at[0] < s.length() && "+-0123456789.eE".indexOf(s.charAt(at[0])) >= 0) at[0]++;
        return Double.parseDouble(s.substring(st, at[0]));
    }

    @SuppressWarnings("unchecked")
    static Object get(Object o, Object... path) {
        for (Object p : path) {
            if (p instanceof String && o instanceof Map) o = ((Map<String, Object>) o).get(p);
            else if (p instanceof Integer && o instanceof List && (Integer) p < ((List<Object>) o).size()) o = ((List<Object>) o).get((Integer) p);
            else return null;
        }
        return o;
    }
    static String str(Object o, Object... path) { Object v = get(o, path); return v == null ? null : String.valueOf(v); }
    static double num(Object o, double dflt, Object... path) { Object v = get(o, path); return v instanceof Number ? ((Number) v).doubleValue() : dflt; }
}
