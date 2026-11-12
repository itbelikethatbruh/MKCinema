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
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.os.Environment;
import android.provider.Settings;
import android.app.PictureInPictureParams;
import android.util.Rational;
import android.database.Cursor;
import android.content.pm.PackageInfo;
import android.content.pm.Signature;
import android.os.ParcelFileDescriptor;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.json.JSONObject;

/** MKCinema for Android, Android TV, Google TV and Fire TV: the web app in a full-screen WebView, with hand-off to VLC and other players. */
public class MainActivity extends Activity {
    static final String HOME = "https://mkcinema.pages.dev/";
    static final String HOST = "mkcinema.pages.dev";
    /** 1.8.1: the web app's homes. Pages on these get the MKAndroid bridge; links to them (and to mkcinema.app's front
        page) open in the app on HOST, where the sign-in and settings live. */
    static final String[] APP_HOSTS = { HOST, "app.mkcinema.app" };
    static final Set<String> APP_ORIGINS = new HashSet<>(Arrays.asList("https://" + HOST, "https://app.mkcinema.app"));
    static final int REQ_FILE = 1, REQ_MIC = 2, REQ_VOICE = 3, REQ_VOICE_MIC = 4, REQ_PLAY = 5, REQ_NOTIFY = 6;
    static final String VER = "1.11.2";
    /** YouTube apps for TVs first (Fire TV, Android TV, Google TV), then the phone app. */
    static final String[] YT_APPS = { "com.amazon.firetv.youtube", "com.google.android.youtube.tv", "com.google.android.youtube.googletv", "com.google.android.youtube" };

    WebView web;
    /** 1.6.1: the page's renderer was stopped while MKCinema was hidden (see onRenderProcessGone) */
    boolean webDead, resumed;
    String lastUrl;
    long goneAt;
    FrameLayout root;
    View customView;
    WebChromeClient.CustomViewCallback customCb;
    ValueCallback<Uri[]> fileCb;
    PermissionRequest pendingPerm;
    String[] pendingWant;
    boolean tv;
    /** Phone picture-in-picture (1.2.6): the page reports when a film plays, and its shape */
    volatile boolean pipPlaying; volatile int pipW = 16, pipH = 9; boolean wasPip;
    volatile String pageHost = "";
    /** 1.8.1: a random key only MKCinema's own page gets (see BRIDGE_JS); every bridge call must carry it, so frames
        from other sites inside the page (trailers, ads) can't use the bridge. New for every WebView. */
    volatile String key = "";
    /** the key reaches the page before its scripts run (androidx.webkit document-start script), or only after it loads */
    boolean docStart;
    /** TV_JS runs once per page load */
    boolean tvJsDone;
    SpeechRecognizer recognizer;
    String voiceLang;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        UiModeManager ui = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        tv = (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                || getPackageManager().hasSystemFeature("android.software.leanback")
                || getPackageManager().hasSystemFeature("amazon.hardware.fire_tv");
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        Iptv.load(this); // 1.10.0: the TV servers the person added (Live TV › Add playlist)
        buildWeb();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (b != null) web.restoreState(b);
        else web.loadUrl(startUrl(getIntent()));
    }

    /** Creates and sets up the page's WebView (also used to rebuild it after its renderer was stopped). */
    void buildWeb() {
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        // No native scrollbars or edge glow: the WebView flashed a white bar down the right edge at start-up on TVs
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        root.addView(web, 0, new FrameLayout.LayoutParams(-1, -1));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setLoadWithOverviewMode(true);
        // 1.2.5: Jellyfin and Emby servers at home usually answer on plain http:// addresses, which the page reaches
        // directly. 1.8.1: plain http:// is only let through to this device and the home network (see cleartext());
        // to anywhere else only pictures and video go, like in a browser (scripts, data and frames are blocked).
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " MKCinemaAndroid/" + VER + (tv ? " MKCinemaTV/" + VER : ""));
        // Keep the page's renderer at high priority while MKCinema is on screen
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        key = newKey();
        web.addJavascriptInterface(new Bridge(), "MKAndroid");
        // 1.8.1: hand the key to MKCinema's own pages (main page and same-site frames only) before their scripts run
        docStart = false;
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                WebViewCompat.addDocumentStartJavaScript(web, bridgeJs(), APP_ORIGINS); docStart = true;
            }
        } catch (Throwable t) { docStart = false; }
        if (tv) { web.setFocusable(true); web.setFocusableInTouchMode(true); web.requestFocus(); immersive(true); }
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return route(r.getUrl());
            }
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) { pageHost = hostOf(url); iptvOrigin(); tvJsDone = false; giveKey(v); }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { pageHost = hostOf(url); iptvOrigin(); }
            @Override public void onPageCommitVisible(WebView v, String url) { giveKey(v); if (tv && !tvJsDone) { tvJsDone = true; v.evaluateJavascript(TV_JS, null); } }
            @Override public void onPageFinished(WebView v, String url) { giveKey(v); if (tv && !tvJsDone) { tvJsDone = true; v.evaluateJavascript(TV_JS, null); } }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return cleartext(r); }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadDataWithBaseURL(null, offline(), "text/html", "utf-8", null);
            }
            /* 1.6.1: Android can stop the page's renderer to free memory, most often on 1-2 GB TV sticks while the TV
               player decodes a film over it (the renderer's priority drops once it is hidden). Unhandled, that kills the
               whole app, the film stops and MKCinema reopens on Home. Now the film keeps playing and only the page is
               rebuilt: right away when it is on screen, or when the player closes. */
            @Override public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail d) {
                if (v != web) return true;
                // the same page stopping again within 15 s reopens on Home instead, so it can't loop
                long now = System.currentTimeMillis();
                lastUrl = now - goneAt < 15000 ? null : v.getUrl(); goneAt = now;
                root.removeView(v);
                try { v.destroy(); } catch (Exception ignored) { }
                pageHost = "";
                buildWeb(); // empty until it loads, so every web call stays safe
                if (resumed) reloadWeb(); else webDead = true;
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            /* 1.11.2: Android draws a large grey play button on any video that has no picture yet (while it loads, and
               after it is emptied when the player closes). A see-through picture replaces it. */
            @Override public android.graphics.Bitmap getDefaultVideoPoster() {
                android.graphics.Bitmap b = android.graphics.Bitmap.createBitmap(1, 1, android.graphics.Bitmap.Config.ARGB_8888);
                b.eraseColor(Color.TRANSPARENT); return b;
            }
            @Override public void onShowCustomView(View view, CustomViewCallback cb) {
                if (customView != null) { cb.onCustomViewHidden(); return; }
                customView = view; customCb = cb;
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                web.setVisibility(View.INVISIBLE); // 1.11.2: INVISIBLE keeps the page laid out, so leaving full screen does not jump
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
            /* The microphone (party voice, voice search) and, since 1.9.1, the camera (party cameras). Only MKCinema's own
               page may use them, and Android asks the person first for whichever one they have not allowed yet. */
            @Override public void onPermissionRequest(PermissionRequest req) {
                Uri o = req.getOrigin();
                if (o == null || !HOST.equals(o.getHost())) { req.deny(); return; }
                java.util.ArrayList<String> want = new java.util.ArrayList<>(), ask = new java.util.ArrayList<>();
                for (String r : req.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) { want.add(r); if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) ask.add(Manifest.permission.RECORD_AUDIO); }
                    else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) { want.add(r); if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) ask.add(Manifest.permission.CAMERA); }
                }
                if (want.isEmpty()) { req.deny(); return; }
                if (ask.isEmpty()) { req.grant(want.toArray(new String[0])); return; }
                if (pendingPerm != null) pendingPerm.deny();
                pendingPerm = req; pendingWant = want.toArray(new String[0]);
                requestPermissions(ask.toArray(new String[0]), REQ_MIC);
            }
        });
        // the service worker's own requests get the same plain-http rule
        try { ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest r) { return cleartext(r); }
        }); } catch (Throwable ignored) { }
        web.setDownloadListener((url, ua, cd, mime, len) -> { if (!url.startsWith("blob:") && !url.startsWith("data:")) open(Uri.parse(url)); });
    }

    /** The page's renderer was stopped: the fresh WebView reopens MKCinema where it was. */
    void reloadWeb() {
        webDead = false;
        String u = lastUrl != null && "https".equals(Uri.parse(lastUrl).getScheme()) && HOST.equals(Uri.parse(lastUrl).getHost()) ? lastUrl : HOME;
        web.loadUrl(u);
        if (tv) web.requestFocus();
    }

    String startUrl(Intent i) {
        Uri d = i != null ? i.getData() : null;
        if (d != null && "stremio".equals(d.getScheme())) return HOME + (HOME.contains("#") ? "&" : "#") + "install=" + Uri.encode(d.toString());
        return d != null && ourLink(d) ? inApp(d) : HOME;
    }

    static boolean appHost(String h) { for (String a : APP_HOSTS) if (a.equalsIgnoreCase(h)) return true; return false; }
    /** links to the web app on pages.dev or app.mkcinema.app (any page), or to mkcinema.app's front page */
    static boolean ourLink(Uri u) {
        String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.US), h = u.getHost() == null ? "" : u.getHost();
        if (!"https".equals(sc) && !"http".equals(sc)) return false;
        if (appHost(h)) return true;
        String p = u.getPath() == null ? "" : u.getPath();
        return "mkcinema.app".equalsIgnoreCase(h) && (p.isEmpty() || "/".equals(p));
    }
    /** The same link on HOME over https (the app's data lives on mkcinema.pages.dev); mkcinema.app's front page is Home */
    static String inApp(Uri u) {
        String h = u.getHost() == null ? "" : u.getHost();
        String p = appHost(h) && u.getEncodedPath() != null ? u.getEncodedPath().replaceFirst("^/+", "") : "";
        return HOME + p + (u.getEncodedQuery() != null ? "?" + u.getEncodedQuery() : "") + (u.getEncodedFragment() != null ? "#" + u.getEncodedFragment() : "");
    }

    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        Uri d = i.getData();
        // an addon Install link while MKCinema is open: hand it to the page (it asks first), no reload
        if (d != null && "stremio".equals(d.getScheme())) { web.evaluateJavascript("window.MKInstall?MKInstall(" + JSONObject.quote(d.toString()) + "):location.replace(" + JSONObject.quote(startUrl(i)) + ")", null); return; }
        if (d != null) web.loadUrl(startUrl(i));
    }

    /** Keeps MKCinema pages in the app; sends players, stores and other sites to the right app. */
    boolean route(Uri u) {
        String sc = u.getScheme() == null ? "" : u.getScheme();
        // only https://mkcinema.pages.dev stays as it is; http:// and the other homes of the web app open there
        if ("https".equals(sc) && HOST.equals(u.getHost())) return false;
        if (ourLink(u)) { web.loadUrl(inApp(u)); return true; }
        if ("stremio".equals(sc)) { web.evaluateJavascript("window.MKInstall&&MKInstall(" + JSONObject.quote(u.toString()) + ")", null); return true; }
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
        // 1.4.0: a download picked on the "You're offline" page
        if ("mkdl".equals(sc)) {
            Intent i = Downloads.playIntent(this, Uri.decode(u.getSchemeSpecificPart()), 0);
            if (i != null) try { startActivityForResult(i, REQ_PLAY); } catch (Exception ignored) { }
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
        String dls = Downloads.offlineList(this);
        return "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><style>a.d{display:flex;flex-direction:column;gap:3px;text-align:left;padding:14px 18px;margin:0 0 10px;border-radius:14px;background:#141417;border:1px solid rgba(255,255,255,.1);color:#f2f2f3;text-decoration:none}a.d small{color:#9d9da6}</style><body style='margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f2f2f3;font:16px system-ui;text-align:center'>"
            + "<div style='padding:24px;width:min(460px,100%);box-sizing:border-box'><div style='font:500 30px Georgia,serif;margin-bottom:10px'>You're offline</div>"
            + "<div style='color:#bdbdc5;margin-bottom:26px'>MKCinema needs a connection to load. Check your Wi-Fi or data, then try again." + (dls.isEmpty() ? "" : " Your downloads still play:") + "</div>"
            + dls
            + "<a href='" + HOME + "' style='display:inline-block;margin-top:16px;padding:14px 26px;border-radius:999px;background:#e9e6de;color:#0b0b0c;font-weight:600;text-decoration:none'>Try again</a></div>";
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_PLAY) {
            int pos = data != null ? data.getIntExtra("pos", -1) : -1, dur = data != null ? data.getIntExtra("dur", -1) : -1;
            boolean ended = data != null && data.getBooleanExtra("ended", false), next = data != null && data.getBooleanExtra("next", false);
            String err = data != null ? data.getStringExtra("error") : null, act = data != null ? data.getStringExtra("action") : null;
            // 1.6.1: act is "sources" (show the film's source list) or "web" (keep watching in MKCinema's own player)
            web.evaluateJavascript("window.MKNative&&MKNative.done(" + pos + "," + dur + "," + ended + "," + next + "," + (err == null ? "null" : JSONObject.quote(err)) + "," + (act == null ? "null" : JSONObject.quote(act)) + ")", null);
            if (tv) web.requestFocus();
            return;
        }
        if (req == REQ_VOICE) {
            ArrayList<String> r = res == RESULT_OK && data != null ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
            if (r != null && !r.isEmpty()) voiceDone(r.get(0), ""); else voiceDone(null, res == RESULT_OK ? "nomatch" : "cancelled");
            return;
        }
        if (req == REQ_FILE && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
        } else super.onActivityResult(req, res, data);
    }

    @Override public void onRequestPermissionsResult(int req, String[] p, int[] g) {
        if (req == REQ_NOTIFY) {
            boolean ok = g.length > 0 && g[0] == PackageManager.PERMISSION_GRANTED;
            EpisodeAlerts.setEnabled(getApplicationContext(), ok);
            web.evaluateJavascript("window.MKEpPerm&&MKEpPerm(" + ok + ")", null);
            return;
        }
        if (req == REQ_VOICE_MIC) {
            if (g.length > 0 && g[0] == PackageManager.PERMISSION_GRANTED) listen(voiceLang); else voiceDone(null, "denied");
            return;
        }
        if (req == REQ_MIC && pendingPerm != null) {
            // grant what the person allowed; a camera refusal still lets the microphone through, and the other way round
            java.util.ArrayList<String> ok = new java.util.ArrayList<>();
            for (String r : pendingWant) {
                String perm = PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) ? Manifest.permission.CAMERA : Manifest.permission.RECORD_AUDIO;
                if (checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) ok.add(r);
            }
            if (ok.isEmpty()) pendingPerm.deny(); else pendingPerm.grant(ok.toArray(new String[0]));
            pendingPerm = null; pendingWant = null;
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
                case KeyEvent.KEYCODE_SEARCH: case KeyEvent.KEYCODE_VOICE_ASSIST:
                    web.evaluateJavascript("window.MKVoiceSearch?MKVoiceSearch():(window.MKTV&&MKTV.key('/'))", null); return true;
            }
            if (k != null) { web.evaluateJavascript("window.MKTV&&MKTV.key(" + (k.equals(" ") ? "' '" : "'" + k + "'") + ")", null); return true; }
        }
        return super.dispatchKeyEvent(e);
    }

    /** The remote's search button, where the system hands it to the app. */
    @Override public boolean onSearchRequested() {
        web.evaluateJavascript("window.MKVoiceSearch?MKVoiceSearch():(window.MKTV&&MKTV.key('/'))", null);
        return true;
    }

    /** 1.10.0: the CORS answer for the person's TV servers names the MKCinema page on screen */
    void iptvOrigin() { if (appHost(pageHost)) Iptv.origin = "https://" + pageHost.toLowerCase(Locale.US); }

    /** "https://host" of a page, so the bridge only answers MKCinema itself over HTTPS. */
    static String hostOf(String url) { try { Uri u = Uri.parse(url); return "https".equals(u.getScheme()) && u.getHost() != null ? u.getHost() : ""; } catch (Exception e) { return ""; } }

    /** Voice search for the page: WebViews have no Web Speech API, so the app runs the system speech recognizer. */
    class Bridge {
        /** a call counts only with this WebView's key (which only MKCinema's own page has) while
            the main page is MKCinema. The page never passes the key itself: BRIDGE_JS wraps every method. */
        boolean ok(String k) {
            String mine = key;
            return k != null && !mine.isEmpty() && appHost(pageHost)
                && MessageDigest.isEqual(k.getBytes(java.nio.charset.StandardCharsets.UTF_8), mine.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        @JavascriptInterface public boolean voice(String k, String lang) {
            if (!ok(k)) return false;
            Intent i = speechIntent(lang);
            boolean screen = i.resolveActivity(getPackageManager()) != null;
            boolean service = SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
            if (!screen && !service) return false;
            runOnUiThread(() -> voiceStart(lang, screen));
            return true;
        }
        @JavascriptInterface public void voiceStop(String k) { if (ok(k)) runOnUiThread(() -> { if (recognizer != null) recognizer.cancel(); }); }
        @JavascriptInterface public String version(String k) { return ok(k) ? VER : ""; }
        /** 1.6.0: frame-rate matching for the in-app player on TVs (the page measures the film's fps; 0 restores the TV's mode) */
        @JavascriptInterface public void fps(String k, float f) { if (!tv || !ok(k)) return; runOnUiThread(() -> TvExtras.matchFrameRate(MainActivity.this, f)); }
        /** 1.6.0: Continue watching on the Android TV / Google TV home screen */
        @JavascriptInterface public void watchNext(String k, String json) { if (!tv || !ok(k) || json == null || json.length() > 4000) return; final android.content.Context c = getApplicationContext(); new Thread(() -> TvExtras.watchNext(c, json)).start(); }
        @JavascriptInterface public void watchNextRemove(String k, String id) { if (!tv || !ok(k) || id == null) return; final android.content.Context c = getApplicationContext(); new Thread(() -> TvExtras.removeWatchNext(c, id)).start(); }
        /** 1.3.0: torrent engine on this device; returns the local address, or "error: ..." */
        @JavascriptInterface public String p2pStart(String k) { return ok(k) ? P2P.start(getApplicationContext()) : "error: not allowed here"; }
        @JavascriptInterface public void p2pStop(String k) { if (ok(k)) P2P.stop(getApplicationContext()); }
        @JavascriptInterface public boolean p2pAvailable(String k) { return ok(k) && new java.io.File(getApplicationInfo().nativeLibraryDir, "libmkp2p.so").exists(); }
        /** 1.4.0 offline downloads (TVs too from 1.8.0): {url, headers, file, subUrl, wifiOnly, meta, size, vol} → id or "error: ..." */
        @JavascriptInterface public String dlStart(String k, String json) {
            if (!ok(k)) return "error: not allowed here";
            return Downloads.start(getApplicationContext(), json);
        }
        /** 1.8.0: storage for downloads, [{vol, removable, free, total}]; vol 1+ is a USB drive or SD card */
        @JavascriptInterface public String dlSpace(String k) { return ok(k) ? Downloads.space(getApplicationContext()) : "[]"; }
        /** 1.8.0: Slow internet mode: the TV player keeps minutes of the film ready instead of seconds */
        @JavascriptInterface public boolean setSlow(String k, boolean on) {
            if (!ok(k)) return false;
            getSharedPreferences("mk", MODE_PRIVATE).edit().putBoolean("slow", on).apply();
            return true;
        }
        /** 1.5.0 new-episode notifications (phones and tablets): turn on/off; "on", "off", "asking" or "tv" */
        @JavascriptInterface public String epEnable(String k, boolean on) {
            if (!ok(k)) return "off";
            if (tv) return "tv";
            if (on && Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIFY));
                return "asking";
            }
            EpisodeAlerts.setEnabled(getApplicationContext(), on);
            return on ? "on" : "off";
        }
        @JavascriptInterface public boolean epOn(String k) { return ok(k) && !tv && EpisodeAlerts.enabled(getApplicationContext()); }
        /** the series to watch for: {shows:[{id, name, reached}]} (reached = season*1000+episode) */
        @JavascriptInterface public void epSync(String k, String json) { if (ok(k) && !tv && json != null && json.length() < 200000) EpisodeAlerts.sync(getApplicationContext(), json); }
        @JavascriptInterface public String dlList(String k) { return ok(k) ? Downloads.list(getApplicationContext()) : "[]"; }
        @JavascriptInterface public boolean dlRemove(String k, String id) { return ok(k) && id != null && Downloads.remove(getApplicationContext(), id); }
        /** Plays a finished download in the app's player; it reports back through MKNative.done like the TV player. */
        @JavascriptInterface public boolean dlPlay(String k, String id, int startMs) {
            if (!ok(k) || id == null) return false;
            Intent i = Downloads.playIntent(MainActivity.this, id, startMs);
            if (i == null) return false;
            runOnUiThread(() -> { try { startActivityForResult(i, REQ_PLAY); } catch (Exception ignored) { } });
            return true;
        }
        /** Phones: the page says a film is playing (or stopped) and its frame size, so leaving the app shrinks it into a window. */
        @JavascriptInterface public void pipState(String k, boolean playing, int w, int h) {
            if (!ok(k) || tv) return;
            pipPlaying = playing; if (w > 0 && h > 0) { pipW = w; pipH = h; }
            if (Build.VERSION.SDK_INT >= 31) runOnUiThread(() -> { try { setPictureInPictureParams(pipParams()); } catch (Exception ignored) { } });
        }
        /** Phones: the player's picture-in-picture button (WebViews have no requestPictureInPicture). */
        @JavascriptInterface public boolean pip(String k) {
            if (!ok(k) || tv || Build.VERSION.SDK_INT < 26) return false;
            runOnUiThread(MainActivity.this::enterPip);
            return true;
        }
        /** The TV player: {url, title, sub, startMs, subUrl, matchRate}. 1.8.1: http(s) addresses only (films on this
            device play through dlPlay, never a file:// or content:// address from the page). */
        /** 1.10.0: the addresses of the TV services the person added in Live TV (JSON array of URLs). Only these hosts
            get past cleartext() and CORS, fetched by the app (Iptv). Returns how many hosts were kept, or -1. */
        @JavascriptInterface public int iptvHosts(String k, String json) {
            if (!ok(k) || json == null || json.length() > 20000) return -1;
            return Iptv.set(getApplicationContext(), json);
        }
        /** 1.11.0 live TV recording (RecService): {url, headers, name, channel, stopAt, catchup, meta} → id or "error: ..." */
        @JavascriptInterface public String recStart(String k, String json) {
            if (!ok(k) || json == null || json.length() > 20000) return "error: not allowed here";
            return RecService.start(getApplicationContext(), json);
        }
        @JavascriptInterface public boolean recStop(String k, String id) { return ok(k) && id != null && RecService.stop(id); }
        /** a programme from the guide: {id, url, headers, name, channel, logo, start, end}; an exact alarm starts it, app open or not */
        @JavascriptInterface public boolean recPlan(String k, String json) { return ok(k) && json != null && json.length() < 20000 && RecService.plan(getApplicationContext(), json); }
        @JavascriptInterface public boolean recUnplan(String k, String id) { return ok(k) && id != null && RecService.unplan(getApplicationContext(), id); }
        @JavascriptInterface public boolean play(String k, String json) {
            if (!ok(k)) return false;
            try {
                JSONObject o = new JSONObject(json);
                String url = o.getString("url"), subUrl = o.optString("subUrl", "");
                if (!webUrl(url) || !(subUrl.isEmpty() || webUrl(subUrl))) return false;
                Intent i = new Intent(MainActivity.this, PlayerActivity.class)
                    .putExtra("url", url).putExtra("title", o.optString("title")).putExtra("sub", o.optString("sub"))
                    .putExtra("startMs", o.optInt("startMs", 0)).putExtra("subUrl", subUrl).putExtra("matchRate", o.optBoolean("matchRate", true)).putExtra("audioLang", o.optString("audioLang", ""))
                    .putExtra("headers", o.has("headers") ? o.getJSONObject("headers").toString() : "")
                    .putExtra("engine", o.optString("engine", getSharedPreferences("mk", MODE_PRIVATE).getString("engine", "exo")))
                    .putExtra("slow", getSharedPreferences("mk", MODE_PRIVATE).getBoolean("slow", false))
                    // 1.9.0: skip times (seconds), whether a next episode exists, auto-skip, and libass styling (on unless turned off)
                    .putExtra("skips", o.has("skips") && o.optJSONObject("skips") != null && o.getJSONObject("skips").toString().length() < 4000 ? o.getJSONObject("skips").toString() : "")
                    .putExtra("hasNext", o.optBoolean("hasNext", false)).putExtra("autoSkip", o.optBoolean("autoSkip", false))
                    .putExtra("ass", o.optBoolean("ass", true));
                runOnUiThread(() -> { try { startActivityForResult(i, REQ_PLAY); } catch (Exception ignored) { } });
                return true;
            } catch (Exception e) { return false; }
        }
        /** 1.7.0: the TV player's engine, "exo" (ExoPlayer, the default) or "system" (the basic MediaPlayer), from Settings › Playback */
        @JavascriptInterface public boolean setEngine(String k, String e) {
            if (!ok(k) || !("exo".equals(e) || "system".equals(e))) return false;
            getSharedPreferences("mk", MODE_PRIVATE).edit().putString("engine", e).apply();
            return true;
        }
        /** Updates: downloads the new APK and opens the system installer over this app; settings and sign-in stay.
            1.8.1: only from MKCinema's own download addresses, and only an APK signed with this app's key. */
        @JavascriptInterface public boolean update(String k, String url) {
            if (!ok(k)) return false;
            if (!updateUrlOk(url)) { js("window.toast&&toast('Update rejected: that is not an MKCinema download','err',6000)"); return false; }
            runOnUiThread(() -> startUpdate(url));
            return true;
        }
        /** Trailers on TVs: hands a YouTube video id to the YouTube app, whose player uses the TV's video hardware.
            False when no YouTube app takes it, so the page plays the trailer itself. */
        @JavascriptInterface public boolean youtube(String k, String id) {
            if (!ok(k) || id == null || !id.matches("[A-Za-z0-9_-]{6,20}")) return false;
            PackageManager pm = getPackageManager();
            Uri watch = Uri.parse("https://www.youtube.com/watch?v=" + id);
            for (String pkg : YT_APPS) {
                for (Uri u : new Uri[] { watch, Uri.parse("vnd.youtube:" + id) }) {
                    Intent i = new Intent(Intent.ACTION_VIEW, u).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (i.resolveActivity(pm) == null) continue;
                    runOnUiThread(() -> { try { startActivity(i); } catch (Exception ignored) { } });
                    return true;
                }
            }
            return false;
        }
        /** 1.8.1: the Exit button of the TV's "Leaving MKCinema?" prompt */
        @JavascriptInterface public void exit(String k) { if (ok(k)) runOnUiThread(MainActivity.this::finishAndRemoveTask); }
    }

    /** Every MKAndroid method, for BRIDGE_JS */
    static final String[] BRIDGE_METHODS = { "voice", "voiceStop", "version", "fps", "watchNext", "watchNextRemove", "p2pStart", "p2pStop",
        "p2pAvailable", "dlStart", "dlSpace", "setSlow", "epEnable", "epOn", "epSync", "dlList", "dlRemove", "dlPlay", "pipState", "pip", "play",
        "setEngine", "update", "youtube", "exit", "iptvHosts", "recStart", "recStop", "recPlan", "recUnplan" };

    static String newKey() {
        byte[] b = new byte[24]; new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder(); for (byte x : b) sb.append(String.format(Locale.US, "%02x", x & 0xff));
        return sb.toString();
    }

    /** Runs in MKCinema's own pages only: swaps window.MKAndroid for an object with the same methods that adds the
        key as the first argument, so the web app calls MKAndroid as before. Frames from other sites see only the raw
        bridge, which refuses calls without the key. */
    String bridgeJs() {
        StringBuilder names = new StringBuilder();
        for (String n : BRIDGE_METHODS) names.append(names.length() == 0 ? "" : ",").append('"').append(n).append('"');
        StringBuilder hosts = new StringBuilder();
        for (String h : APP_HOSTS) hosts.append(hosts.length() == 0 ? "" : ",").append('"').append(h).append('"');
        return "(function(){try{"
            + "if(location.protocol!=='https:'||[" + hosts + "].indexOf(location.hostname)<0)return;"
            + "var raw=window.MKAndroid;if(!raw||raw.__mk)return;"
            + "var K='" + key + "',w={};"
            + "[" + names + "].forEach(function(n){if(typeof raw[n]!=='function')return;"
            + "w[n]=function(){var a=[K];for(var i=0;i<arguments.length;i++)a.push(arguments[i]);return raw[n].apply(raw,a);};});"
            + "Object.defineProperty(w,'__mk',{value:true});"
            + "try{Object.defineProperty(window,'MKAndroid',{value:Object.freeze(w),writable:false,configurable:false,enumerable:true});}catch(e){window.MKAndroid=w;}"
            + "}catch(e){}})()";
    }

    /** When the WebView can't run a document-start script, the key goes to the main page as early as possible instead. */
    void giveKey(WebView v) {
        if (docStart || v != web) return;
        String u = v.getUrl();
        if (u == null || !appHost(hostOf(u))) return;
        v.evaluateJavascript(bridgeJs(), null);
    }

    /** An http or https address (the player and its subtitles take nothing else from the page) */
    static boolean webUrl(String u) {
        if (u == null) return false;
        String l = u.toLowerCase(Locale.US);
        return l.startsWith("https://") || l.startsWith("http://");
    }

    /** plain http:// from the page goes only to this device and the home network (Jellyfin, Emby, the torrent
        engine on 127.0.0.1). Elsewhere only pictures and video may load over http, like in a browser: scripts, frames
        and data are blocked, so nobody on the network can rewrite what MKCinema runs or reads. */
    static WebResourceResponse cleartext(WebResourceRequest r) {
        // 1.10.0: the person's own TV servers (Xtream or playlist) are fetched by the app itself, see Iptv
        WebResourceResponse tv = Iptv.intercept(r);
        if (tv != null) return tv;
        try {
            Uri u = r.getUrl();
            if (!"http".equalsIgnoreCase(u.getScheme()) || r.isForMainFrame() || lanHost(u.getHost())) return null;
            String accept = null, range = null;
            Map<String, String> hd = r.getRequestHeaders();
            if (hd != null) for (Map.Entry<String, String> e : hd.entrySet()) {
                if ("accept".equalsIgnoreCase(e.getKey())) accept = e.getValue();
                else if ("range".equalsIgnoreCase(e.getKey())) range = e.getValue();
            }
            String a = accept == null ? "" : accept.toLowerCase(Locale.US);
            if (range != null || a.startsWith("image/") || a.startsWith("video/") || a.startsWith("audio/")) return null;
            return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", new java.util.HashMap<>(), new java.io.ByteArrayInputStream(new byte[0]));
        } catch (Exception e) { return null; }
    }

    /** This device or the home network: localhost, private, link-local and CGNAT (Tailscale) addresses, .local/.lan names and one-word names */
    static boolean lanHost(String h) {
        if (h == null || h.isEmpty()) return false;
        h = h.toLowerCase(Locale.US);
        if (h.startsWith("[") && h.endsWith("]")) h = h.substring(1, h.length() - 1);
        if (h.equals("localhost") || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home.arpa") || h.endsWith(".internal")) return true;
        if (h.contains(":")) return h.equals("::1") || h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb") || h.startsWith("fc") || h.startsWith("fd");
        if (h.matches("\\d{1,3}(\\.\\d{1,3}){3}")) {
            String[] p = h.split("\\."); int a = Integer.parseInt(p[0]), b = Integer.parseInt(p[1]);
            return a == 10 || a == 127 || (a == 169 && b == 254) || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) || (a == 100 && b >= 64 && b <= 127);
        }
        return !h.contains(".");
    }

    /** updates come only over https from MKCinema's site or this project's GitHub releases */
    static boolean updateUrlOk(String url) {
        try {
            if (url == null) return false;
            Uri u = Uri.parse(url);
            if (!"https".equals(u.getScheme()) || u.getUserInfo() != null || u.getPort() != -1 || u.getHost() == null) return false;
            String h = u.getHost().toLowerCase(Locale.US), p = u.getPath() == null ? "" : u.getPath();
            if (p.contains("..") || !p.toLowerCase(Locale.US).endsWith(".apk")) return false;
            if (h.equals("mkcinema.app") || h.equals("app.mkcinema.app")) return true;
            return h.equals("github.com") && p.startsWith("/itbelikethatbruh/mkcinema/releases/download/");
        } catch (Exception e) { return false; }
    }

    static final String UPD_FILE = "MKCinema-update.apk";
    long updId = -1;
    void startUpdate(String url) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            try { startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); } catch (Exception ignored) { }
            web.evaluateJavascript("window.toast&&toast('Allow MKCinema to install apps, then press Update again','info',7000)", null);
            return;
        }
        try {
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url)).setTitle("MKCinema update").setMimeType("application/vnd.android.package-archive")
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "MKCinema-update-" + System.currentTimeMillis() + ".apk")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            final long id = dm.enqueue(r); updId = id;
            BroadcastReceiver done = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) {
                if (i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -2) != id) return;
                try { unregisterReceiver(this); } catch (Exception ignored) { }
                new Thread(() -> finishUpdate(dm, id)).start();
            } };
            IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(done, f, Context.RECEIVER_EXPORTED); else registerReceiver(done, f);
        } catch (Exception e) { web.evaluateJavascript("window.toast&&toast('The update could not start','err',6000)", null); }
    }

    /** copies the finished download into the app's private storage (no other app can swap it there), checks
        it is MKCinema signed with this app's key, and only then opens the installer on that copy (UpdateFiles). */
    void finishUpdate(DownloadManager dm, long id) {
        File apk = UpdateFiles.file(this);
        try {
            try (Cursor cur = dm.query(new DownloadManager.Query().setFilterById(id))) {
                if (cur == null || !cur.moveToFirst() || cur.getInt(cur.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) != DownloadManager.STATUS_SUCCESSFUL) {
                    js("window.toast&&toast('The update did not download. Try again','err',6000)"); return;
                }
            }
            apk.getParentFile().mkdirs(); apk.delete();
            try (InputStream in = new ParcelFileDescriptor.AutoCloseInputStream(dm.openDownloadedFile(id)); OutputStream out = new FileOutputStream(apk)) {
                byte[] b = new byte[65536]; int n; while ((n = in.read(b)) > 0) out.write(b, 0, n);
            }
            try { dm.remove(id); } catch (Exception ignored) { }
            String why = checkApk(apk);
            if (why != null) { apk.delete(); js("window.toast&&toast(" + JSONObject.quote("Update rejected: " + why) + ",'err',8000)"); return; }
            Uri cu = Uri.parse("content://" + getPackageName() + ".update/" + UPD_FILE);
            Intent inst = new Intent(Intent.ACTION_VIEW).setDataAndType(cu, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            runOnUiThread(() -> { try { startActivity(inst); } catch (Exception e) { js("window.toast&&toast('The installer could not open','err',6000)"); } });
        } catch (Exception e) { apk.delete(); js("window.toast&&toast('The update did not download. Try again','err',6000)"); }
    }

    /** null when apk is MKCinema signed with the same key as this app (or a key this app's key was rotated to), else why not */
    @SuppressWarnings("deprecation")
    String checkApk(File apk) {
        PackageManager pm = getPackageManager();
        int fl = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES | PackageManager.GET_SIGNATURES : PackageManager.GET_SIGNATURES;
        PackageInfo a = pm.getPackageArchiveInfo(apk.getPath(), fl);
        if (a == null) return "the file is not an app";
        if (!getPackageName().equals(a.packageName)) return "it is a different app";
        PackageInfo me;
        try { me = pm.getPackageInfo(getPackageName(), fl); } catch (Exception e) { return "this app's key could not be read"; }
        Set<String> mine = certs(me, false), theirs = certs(a, true);
        if (mine.isEmpty() || theirs.isEmpty() || !theirs.containsAll(mine)) return "it is not signed by MKCinema";
        long av = Build.VERSION.SDK_INT >= 28 ? a.getLongVersionCode() : a.versionCode, mv = Build.VERSION.SDK_INT >= 28 ? me.getLongVersionCode() : me.versionCode;
        if (av < mv) return "it is older than this app";
        return null;
    }

    /** SHA-256 of the signing certificates; with history, also the keys the signer was rotated from */
    @SuppressWarnings("deprecation")
    static Set<String> certs(PackageInfo pi, boolean history) {
        Set<String> out = new HashSet<>();
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= 28 && pi.signingInfo != null) {
            sigs = pi.signingInfo.hasMultipleSigners() || !history ? pi.signingInfo.getApkContentsSigners() : pi.signingInfo.getSigningCertificateHistory();
        }
        if (sigs == null || sigs.length == 0) sigs = pi.signatures;
        if (sigs == null) return out;
        try {
            for (Signature s : sigs) {
                byte[] d = MessageDigest.getInstance("SHA-256").digest(s.toByteArray());
                StringBuilder sb = new StringBuilder(); for (byte x : d) sb.append(String.format(Locale.US, "%02x", x & 0xff));
                out.add(sb.toString());
            }
        } catch (Exception e) { out.clear(); }
        return out;
    }

    Intent speechIntent(String lang) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH);
        if (lang != null && !lang.isEmpty()) i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, "Search MKCinema");
        return i;
    }

    /** The system's own listening screen first (Android TV / Google TV), then the recognizer service with the app's mic. */
    void voiceStart(String lang, boolean screen) {
        if (screen) {
            try { startActivityForResult(speechIntent(lang), REQ_VOICE); return; }
            catch (Exception e) { /* fall through to the service */ }
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { voiceDone(null, "unavailable"); return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            voiceLang = lang; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_VOICE_MIC); return;
        }
        listen(lang);
    }

    void listen(String lang) {
        try {
            if (recognizer == null) recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle b) { }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float v) { }
                @Override public void onBufferReceived(byte[] b) { }
                @Override public void onEndOfSpeech() { }
                @Override public void onEvent(int t, Bundle b) { }
                @Override public void onPartialResults(Bundle b) {
                    ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (r != null && !r.isEmpty()) js("window.MKVoice&&MKVoice.nativePartial(" + JSONObject.quote(r.get(0)) + ")");
                }
                @Override public void onResults(Bundle b) {
                    ArrayList<String> r = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (r != null && !r.isEmpty()) voiceDone(r.get(0), ""); else voiceDone(null, "nomatch");
                }
                @Override public void onError(int e) {
                    voiceDone(null, e == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ? "denied"
                        : e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? "nomatch"
                        : e == SpeechRecognizer.ERROR_CLIENT ? "cancelled" : "error");
                }
            });
            Intent i = speechIntent(lang); i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            recognizer.startListening(i);
        } catch (Exception e) { voiceDone(null, "unavailable"); }
    }

    void voiceDone(String text, String err) {
        js("window.MKVoice&&MKVoice.nativeDone(" + (text == null ? "null" : JSONObject.quote(text)) + "," + JSONObject.quote(err) + ")");
    }

    void js(String code) { runOnUiThread(() -> web.evaluateJavascript(code, null)); }

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

    PictureInPictureParams pipParams() {
        // Android accepts shapes between 1:2.39 and 2.39:1
        double r = Math.max(1 / 2.39, Math.min(2.39, (double) pipW / pipH));
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder().setAspectRatio(new Rational((int) Math.round(r * 1000), 1000));
        if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(pipPlaying).setSeamlessResizeEnabled(true);
        return b.build();
    }
    void enterPip() {
        if (Build.VERSION.SDK_INT < 26 || tv) return;
        try { if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return; enterPictureInPictureMode(pipParams()); } catch (Exception ignored) { }
    }
    @Override protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Android 12+ enters by itself (setAutoEnterEnabled); older phones need the call
        if (pipPlaying && Build.VERSION.SDK_INT >= 26 && Build.VERSION.SDK_INT < 31) enterPip();
    }
    @Override public void onPictureInPictureModeChanged(boolean in, Configuration c) {
        super.onPictureInPictureModeChanged(in, c);
        if (in) wasPip = true;
        if (web != null) web.evaluateJavascript("window.MKPip&&MKPip.mode(" + in + ")", null);
    }
    @Override protected void onStop() {
        super.onStop();
        // The window was swiped away: stop the film instead of playing on unseen
        if (wasPip && web != null) { wasPip = false; web.evaluateJavascript("window.MKPip&&MKPip.closed()", null); }
    }

    @Override protected void onSaveInstanceState(Bundle b) { super.onSaveInstanceState(b); web.saveState(b); }
    @Override protected void onPause() {
        super.onPause(); resumed = false;
        // In the picture-in-picture window the page keeps playing
        if (!(Build.VERSION.SDK_INT >= 24 && isInPictureInPictureMode())) web.onPause();
        CookieManager.getInstance().flush();
    }
    @Override protected void onResume() { super.onResume(); resumed = true; web.onResume(); if (webDead) reloadWeb(); if (wasPip && !(Build.VERSION.SDK_INT >= 24 && isInPictureInPictureMode())) wasPip = false; }
    @Override protected void onDestroy() { if (isFinishing()) new Thread(() -> P2P.stop(getApplicationContext())).start(); if (recognizer != null) recognizer.destroy(); if (web != null) { ((ViewGroup) web.getParent()).removeView(web); web.destroy(); } super.onDestroy(); }
}
