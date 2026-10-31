package com.mkcinema.app;

import android.Manifest;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/** MKCinema for Android, Android TV, Google TV and Fire TV: the web app in a full-screen WebView, with hand-off to VLC and other players. */
public class MainActivity extends Activity {
    static final String HOME = "https://mkcinema.pages.dev/";
    static final String HOST = "mkcinema.pages.dev";
    static final int REQ_FILE = 1, REQ_MIC = 2;

    WebView web;
    FrameLayout root;
    View customView;
    WebChromeClient.CustomViewCallback customCb;
    ValueCallback<Uri[]> fileCb;
    PermissionRequest pendingPerm;
    boolean tv;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        UiModeManager ui = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        tv = (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                || getPackageManager().hasSystemFeature("android.software.leanback")
                || getPackageManager().hasSystemFeature("amazon.hardware.fire_tv");
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " MKCinemaAndroid/1.1" + (tv ? " MKCinemaTV/1.1" : ""));
        if (tv) { web.setFocusable(true); web.setFocusableInTouchMode(true); web.requestFocus(); immersive(true); }
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return route(r.getUrl());
            }
            @Override public void onPageCommitVisible(WebView v, String url) { if (tv) v.evaluateJavascript(TV_JS, null); }
            @Override public void onPageFinished(WebView v, String url) { if (tv) v.evaluateJavascript(TV_JS, null); }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadDataWithBaseURL(null, offline(), "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback cb) {
                if (customView != null) { cb.onCustomViewHidden(); return; }
                customView = view; customCb = cb;
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                web.setVisibility(View.GONE);
                view.setFocusable(true); view.requestFocus();
                immersive(true);
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            }
            @Override public void onHideCustomView() { exitFullscreen(); }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try { startActivityForResult(p.createIntent(), REQ_FILE); }
                catch (ActivityNotFoundException e) { fileCb = null; return false; }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest req) {
                boolean mic = false;
                for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) mic = true;
                if (!mic) { req.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    pendingPerm = req;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
                }
            }
        });
        web.setDownloadListener((url, ua, cd, mime, len) -> { if (!url.startsWith("blob:") && !url.startsWith("data:")) open(Uri.parse(url)); });
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (b != null) web.restoreState(b);
        else web.loadUrl(startUrl(getIntent()));
    }

    String startUrl(Intent i) {
        Uri d = i != null ? i.getData() : null;
        return d != null && HOST.equals(d.getHost()) ? d.toString() : HOME;
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        if (i.getData() != null) web.loadUrl(startUrl(i));
    }

    /** Keeps MKCinema pages in the app; sends players, stores and other sites to the right app. */
    boolean route(Uri u) {
        String sc = u.getScheme() == null ? "" : u.getScheme();
        if (("https".equals(sc) || "http".equals(sc)) && HOST.equals(u.getHost())) return false;
        if ("intent".equals(sc)) {
            try {
                Intent i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null); i.setSelector(null);
                try { startActivity(i); return true; }
                catch (ActivityNotFoundException e) {
                    String fb = i.getStringExtra("browser_fallback_url");
                    if (fb != null) open(Uri.parse(fb));
                    else if (i.getPackage() != null) open(Uri.parse("market://details?id=" + i.getPackage()));
                }
            } catch (Exception ignored) { }
            return true;
        }
        if ("about".equals(sc) || "blob".equals(sc) || "data".equals(sc) || "javascript".equals(sc)) return false;
        open(u);
        return true;
    }

    void open(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (ActivityNotFoundException e) {
            if ("market".equals(u.getScheme())) open(Uri.parse("https://play.google.com/store/apps/details?" + u.getQuery()));
        }
    }

    void exitFullscreen() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        web.setVisibility(View.VISIBLE);
        if (tv) web.requestFocus();
        immersive(tv);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (customCb != null) customCb.onCustomViewHidden();
        customCb = null;
    }

    @SuppressWarnings("deprecation")
    void immersive(boolean on) {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(on ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION : 0);
        if (Build.VERSION.SDK_INT >= 28) getWindow().getAttributes().layoutInDisplayCutoutMode = on
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
    }

    String offline() {
        return "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><body style='margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f2f2f3;font:16px system-ui;text-align:center'>"
            + "<div style='padding:24px'><div style='font:500 30px Georgia,serif;margin-bottom:10px'>You're offline</div>"
            + "<div style='color:#bdbdc5;margin-bottom:26px'>MKCinema needs a connection to load. Check your Wi-Fi or data, then try again.</div>"
            + "<a href='" + HOME + "' style='display:inline-block;padding:14px 26px;border-radius:999px;background:#e9e6de;color:#0b0b0c;font-weight:600;text-decoration:none'>Try again</a></div>";
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
        } else super.onActivityResult(req, res, data);
    }

    @Override public void onRequestPermissionsResult(int req, String[] p, int[] g) {
        if (req == REQ_MIC && pendingPerm != null) {
            if (g.length > 0 && g[0] == PackageManager.PERMISSION_GRANTED)
                pendingPerm.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else pendingPerm.deny();
            pendingPerm = null;
        }
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() {
        if (customView != null) { exitFullscreen(); return; }
        if (!tv) { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); return; }
        // On a TV remote, Back closes whatever MKCinema has open first, then goes home, then leaves the app.
        web.evaluateJavascript(TV_BACK_JS, r -> {
            if ("true".equals(r)) return;
            if (web.canGoBack()) web.goBack(); else super.onBackPressed();
        });
    }

    /** TV remotes: media keys drive the player. Arrows and OK reach the page, which already does D-pad navigation. */
    @Override public boolean dispatchKeyEvent(KeyEvent e) {
        if (tv && e.getAction() == KeyEvent.ACTION_DOWN) {
            String k = null;
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case KeyEvent.KEYCODE_MEDIA_PLAY: case KeyEvent.KEYCODE_MEDIA_PAUSE: k = " "; break;
                case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: k = "l"; break;
                case KeyEvent.KEYCODE_MEDIA_REWIND: k = "j"; break;
                case KeyEvent.KEYCODE_MEDIA_NEXT: k = "n"; break;
                case KeyEvent.KEYCODE_MENU: k = "o"; break;
                case KeyEvent.KEYCODE_SEARCH: k = "/"; break;
            }
            if (k != null) { web.evaluateJavascript("window.MKTV&&MKTV.key(" + (k.equals(" ") ? "' '" : "'" + k + "'") + ")", null); return true; }
        }
        return super.dispatchKeyEvent(e);
    }

    /** Runs on every page load on a TV: a 1280x720 layout for viewing from the sofa, and helpers for the remote. */
    static final String TV_JS = "(function(){"
        + "var m=document.querySelector('meta[name=viewport]');"
        + "if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}"
        + "var c='width=1280, viewport-fit=cover';if(m.content!==c)m.content=c;"
        + "document.documentElement.classList.add('tv');"
        + "if(window.MKTV)return;"
        + "window.MKTV={key:function(k){document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));return true;}};"
        + "})()";

    /** Returns true when the page handled Back itself. */
    static final String TV_BACK_JS = "(function(){try{"
        + "var ids=['remote','castLayer','partyLayer','player','trailer','tour','stremioImport','palette','epSheet','askLayer','tastePick','settings','addons','detail'];"
        + "var open=ids.some(function(i){var e=document.getElementById(i);return e&&!e.hidden;});"
        + "if(open&&typeof back==='function'){back();return true;}"
        + "if(document.fullscreenElement){document.exitFullscreen();return true;}"
        + "var h=document.querySelector('#tabs .tab');"
        + "if(h&&!h.classList.contains('on')){h.click();return true;}"
        + "}catch(e){}return false;})()";

    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }
    @Override protected void onPause() { super.onPause(); web.onPause(); CookieManager.getInstance().flush(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
    @Override protected void onDestroy() { if (web != null) { ((ViewGroup) web.getParent()).removeView(web); web.destroy(); } super.onDestroy(); }
}
