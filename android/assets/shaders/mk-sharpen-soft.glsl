// MKCinema sharp upscaling (Natural), the native players' twin of the web player's Sharp upscaling (2.36).
// Contrast-adaptive sharpening at the video's own resolution, after AMD FidelityFX CAS (MIT licence); mpv's scaler
// then upscales the sharpened picture to the screen. It only runs when the picture is shown clearly bigger than
// the file (12 % or more), so a file that already matches the screen plays untouched.

//!HOOK MAIN
//!BIND HOOKED
//!DESC MKCinema sharp upscaling (Natural)
//!WHEN OUTPUT.w HOOKED.w 1.12 * > OUTPUT.h HOOKED.h 1.12 * > +

vec4 hook() {
    float k = 0.35;
    vec4 e4 = HOOKED_texOff(vec2(0.0, 0.0));
    vec3 a = HOOKED_texOff(vec2(-1.0, -1.0)).rgb, b = HOOKED_texOff(vec2(0.0, -1.0)).rgb, c = HOOKED_texOff(vec2(1.0, -1.0)).rgb;
    vec3 d = HOOKED_texOff(vec2(-1.0, 0.0)).rgb, e = e4.rgb, f = HOOKED_texOff(vec2(1.0, 0.0)).rgb;
    vec3 g = HOOKED_texOff(vec2(-1.0, 1.0)).rgb, h = HOOKED_texOff(vec2(0.0, 1.0)).rgb, i = HOOKED_texOff(vec2(1.0, 1.0)).rgb;
    vec3 mn = min(min(min(d, e), min(f, b)), h);
    vec3 mn2 = min(mn, min(min(a, c), min(g, i)));
    mn += mn2;
    vec3 mx = max(max(max(d, e), max(f, b)), h);
    vec3 mx2 = max(mx, max(max(a, c), max(g, i)));
    mx += mx2;
    vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
    vec3 w = amp * (-1.0 / mix(8.0, 5.0, k));
    vec3 o = clamp(((b + d + f + h) * w + e) / (1.0 + 4.0 * w), 0.0, 1.0);
    return vec4(o, e4.a);
}
