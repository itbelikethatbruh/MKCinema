package com.mkcinema.remote;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.util.ArrayList;

/**
 * MKCinema Remote for Android: the phone remote (https://app.mkcinema.app/remote) as its own small app.
 * - Opens straight into the remote, full screen, and keeps the screen on while it is open.
 * - The phone's volume buttons turn the TV's volume while a film plays there (otherwise they work as usual).
 * - The TV's QR code opens this app directly (App Link, verified by app.mkcinema.app/.well-known/assetlinks.json).
 * - Everything else (the full app, help pages) opens outside: in MKCinema if it is installed, else the browser.
 * No JavaScript bridge: the app only calls the page's own window.MKRemote hook for the volume buttons.
 */
public class RemoteActivity extends Activity {
    static final String VER = "1.0.0";
    static final String HOST = "app.mkcinema.app";
    static final String HOME = "https://" + HOST + "/remote";
    static final int REQ_PERM = 7;

    WebView web;
    PermissionRequest pendingPerm;
    String[] pendingWant;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // "Listen on this phone" starts the film's sound from a tap
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " MKCinemaRemote/" + VER);
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        CookieManager.getInstance().setAcceptCookie(true);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (isRemote(u)) return false;
                openOutside(u);
                return true;
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadDataWithBaseURL(null, offline(), "text/html", "utf-8", null);
            }
            @Override public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail d) {
                recreate();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            /* party voice and the party camera on this phone: only the remote page may ask, and Android asks the person */
            @Override public void onPermissionRequest(PermissionRequest req) {
                Uri o = req.getOrigin();
                if (o == null || !HOST.equals(o.getHost())) { req.deny(); return; }
                ArrayList<String> want = new ArrayList<>(), ask = new ArrayList<>();
                for (String r : req.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) { want.add(r); if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) ask.add(Manifest.permission.RECORD_AUDIO); }
                    else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) { want.add(r); if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) ask.add(Manifest.permission.CAMERA); }
                }
                if (want.isEmpty()) { req.deny(); return; }
                if (ask.isEmpty()) { req.grant(want.toArray(new String[0])); return; }
                if (pendingPerm != null) pendingPerm.deny();
                pendingPerm = req; pendingWant = want.toArray(new String[0]);
                requestPermissions(ask.toArray(new String[0]), REQ_PERM);
            }
        });

        if (b != null) web.restoreState(b);
        else web.loadUrl(startUrl(getIntent()));
    }

    /** The TV's QR code (https://app.mkcinema.app/remote#CODE_KEY) opens the remote on that TV; anything else, the remote. */
    static String startUrl(Intent i) {
        Uri u = i == null ? null : i.getData();
        return u != null && isRemote(u) ? u.toString() : HOME;
    }

    static boolean isRemote(Uri u) {
        if (u == null || !"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) return false;
        String p = u.getPath() == null ? "" : u.getPath();
        return p.equals("/remote") || p.equals("/remote.html") || p.equals("/remote.webmanifest") || p.equals("/sw.js");
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        Uri u = i.getData();
        if (u != null && isRemote(u)) web.loadUrl(u.toString());
    }

    void openOutside(Uri u) {
        String sc = u.getScheme();
        if (!"https".equals(sc) && !"http".equals(sc) && !"mailto".equals(sc)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (ActivityNotFoundException ignored) { }
    }

    /* The phone's volume buttons: the TV's volume while a film plays there, the phone's own the rest of the time.
       The page answers whether it sent the press (window.MKRemote.vol); if not, the phone's volume changes as usual. */
    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        int k = e.getKeyCode();
        if (k == KeyEvent.KEYCODE_VOLUME_UP || k == KeyEvent.KEYCODE_VOLUME_DOWN) {
            if (e.getAction() == KeyEvent.ACTION_DOWN) {
                final boolean up = k == KeyEvent.KEYCODE_VOLUME_UP;
                web.evaluateJavascript("(function(){try{return !!(window.MKRemote&&MKRemote.vol(" + (up ? "1" : "-1") + "))}catch(e){return false}})()", (res) -> {
                    if (!"true".equals(res)) {
                        AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
                        if (am != null) am.adjustStreamVolume(AudioManager.STREAM_MUSIC, up ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
                    }
                });
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override public void onBackPressed() {
        // the page closes its own sheets and panels first (window.back returns true when it did)
        web.evaluateJavascript("(function(){try{return !!(window.MKRemote&&MKRemote.back())}catch(e){return false}})()", (res) -> {
            if ("true".equals(res)) return;
            if (web.canGoBack()) web.goBack(); else finish();
        });
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        if (req != REQ_PERM || pendingPerm == null) return;
        ArrayList<String> ok = new ArrayList<>();
        for (String w : pendingWant) {
            String p = PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(w) ? Manifest.permission.RECORD_AUDIO : Manifest.permission.CAMERA;
            if (checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED) ok.add(w);
        }
        if (ok.isEmpty()) pendingPerm.deny(); else pendingPerm.grant(ok.toArray(new String[0]));
        pendingPerm = null; pendingWant = null;
    }

    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() { if (pendingPerm != null) pendingPerm.deny(); web.destroy(); super.onDestroy(); }

    String offline() {
        return "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#000;color:#f2f2f3;font:16px system-ui;text-align:center;padding:24px;box-sizing:border-box'>"
            + "<b style='font-size:20px'>No connection</b><span style='color:#a8a8b0;max-width:30ch'>Connect this phone to the internet, then try again.</span>"
            + "<a href='" + HOME + "' style='margin-top:8px;padding:14px 28px;border-radius:999px;background:#f2f2f3;color:#000;text-decoration:none;font-weight:600'>Try again</a></body>";
    }
}
