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
import java.util.ArrayList;
import org.json.JSONObject;

/** MKCinema for Android, Android TV, Google TV and Fire TV: the web app in a full-screen WebView, with hand-off to VLC and other players. */
public class MainActivity extends Activity {
    static final String HOME = "https://mkcinema.pages.dev/";
    static final String HOST = "mkcinema.pages.dev";
    static final int REQ_FILE = 1, REQ_MIC = 2, REQ_VOICE = 3, REQ_VOICE_MIC = 4, REQ_PLAY = 5;
    static final String VER = "1.2.8";
    /** YouTube apps for TVs first (Fire TV, Android TV, Google TV), then the phone app. */
    static final String[] YT_APPS = { "com.amazon.firetv.youtube", "com.google.android.youtube.tv", "com.google.android.youtube.googletv", "com.google.android.youtube" };

    WebView web;
    FrameLayout root;
    View customView;
    WebChromeClient.CustomViewCallback customCb;
    ValueCallback<Uri[]> fileCb;
    PermissionRequest pendingPerm;
    boolean tv;
    /** Phone picture-in-picture (1.2.6): the page reports when a film plays, and its shape */
    volatile boolean pipPlaying; volatile int pipW = 16, pipH = 9; boolean wasPip;
    volatile String pageHost = "";
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
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        // No native scrollbars or edge glow: the WebView flashed a white bar down the right edge at start-up on TVs
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
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
        // 1.2.5: Jellyfin and Emby servers at home usually answer on plain http:// addresses
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString() + " MKCinemaAndroid/" + VER + (tv ? " MKCinemaTV/" + VER : ""));
        // Keep the page's renderer at high priority while MKCinema is on screen
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        web.addJavascriptInterface(new Bridge(), "MKAndroid");
        if (tv) { web.setFocusable(true); web.setFocusableInTouchMode(true); web.requestFocus(); immersive(true); }
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return route(r.getUrl());
            }
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) { pageHost = hostOf(url); }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { pageHost = hostOf(url); }
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
        if (req == REQ_PLAY) {
            int pos = data != null ? data.getIntExtra("pos", -1) : -1, dur = data != null ? data.getIntExtra("dur", -1) : -1;
            boolean ended = data != null && data.getBooleanExtra("ended", false), next = data != null && data.getBooleanExtra("next", false);
            String err = data != null ? data.getStringExtra("error") : null;
            web.evaluateJavascript("window.MKNative&&MKNative.done(" + pos + "," + dur + "," + ended + "," + next + "," + (err == null ? "null" : JSONObject.quote(err)) + ")", null);
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
        if (req == REQ_VOICE_MIC) {
            if (g.length > 0 && g[0] == PackageManager.PERMISSION_GRANTED) listen(voiceLang); else voiceDone(null, "denied");
            return;
        }
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

    /** "https://host" of a page, so the bridge only answers MKCinema itself over HTTPS. */
    static String hostOf(String url) { try { Uri u = Uri.parse(url); return "https".equals(u.getScheme()) && u.getHost() != null ? u.getHost() : ""; } catch (Exception e) { return ""; } }

    /** Voice search for the page: WebViews have no Web Speech API, so the app runs the system speech recognizer. */
    class Bridge {
        @JavascriptInterface public boolean voice(String lang) {
            if (!HOST.equals(pageHost)) return false;
            Intent i = speechIntent(lang);
            boolean screen = i.resolveActivity(getPackageManager()) != null;
            boolean service = SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
            if (!screen && !service) return false;
            runOnUiThread(() -> voiceStart(lang, screen));
            return true;
        }
        @JavascriptInterface public void voiceStop() { runOnUiThread(() -> { if (recognizer != null) recognizer.cancel(); }); }
        @JavascriptInterface public String version() { return VER; }
        /** Phones: the page says a film is playing (or stopped) and its frame size, so leaving the app shrinks it into a window. */
        @JavascriptInterface public void pipState(boolean playing, int w, int h) {
            if (!HOST.equals(pageHost) || tv) return;
            pipPlaying = playing; if (w > 0 && h > 0) { pipW = w; pipH = h; }
            if (Build.VERSION.SDK_INT >= 31) runOnUiThread(() -> { try { setPictureInPictureParams(pipParams()); } catch (Exception ignored) { } });
        }
        /** Phones: the player's picture-in-picture button (WebViews have no requestPictureInPicture). */
        @JavascriptInterface public boolean pip() {
            if (!HOST.equals(pageHost) || tv || Build.VERSION.SDK_INT < 26) return false;
            runOnUiThread(MainActivity.this::enterPip);
            return true;
        }
        /** The TV player: {url, title, sub, startMs, subUrl, matchRate} */
        @JavascriptInterface public boolean play(String json) {
            if (!HOST.equals(pageHost)) return false;
            try {
                JSONObject o = new JSONObject(json);
                Intent i = new Intent(MainActivity.this, PlayerActivity.class)
                    .putExtra("url", o.getString("url")).putExtra("title", o.optString("title")).putExtra("sub", o.optString("sub"))
                    .putExtra("startMs", o.optInt("startMs", 0)).putExtra("subUrl", o.optString("subUrl", "")).putExtra("matchRate", o.optBoolean("matchRate", true))
                    .putExtra("headers", o.has("headers") ? o.getJSONObject("headers").toString() : "");
                runOnUiThread(() -> { try { startActivityForResult(i, REQ_PLAY); } catch (Exception ignored) { } });
                return true;
            } catch (Exception e) { return false; }
        }
        /** Updates: downloads the new APK and opens the system installer over this app; settings and sign-in stay. */
        @JavascriptInterface public boolean update(String url) {
            if (!HOST.equals(pageHost) || url == null || !url.startsWith("https://")) return false;
            runOnUiThread(() -> startUpdate(url));
            return true;
        }
        /** Trailers on TVs: hands a YouTube video id to the YouTube app, whose player uses the TV's video hardware.
            False when no YouTube app takes it, so the page plays the trailer itself. */
        @JavascriptInterface public boolean youtube(String id) {
            if (!HOST.equals(pageHost) || id == null || !id.matches("[A-Za-z0-9_-]{6,20}")) return false;
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
    }

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
            updId = dm.enqueue(r);
            BroadcastReceiver done = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) {
                if (i.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -2) != updId) return;
                try { unregisterReceiver(this); } catch (Exception ignored) { }
                Uri apk = dm.getUriForDownloadedFile(updId);
                if (apk == null) { web.evaluateJavascript("window.toast&&toast('The update did not download. Try again','err',6000)", null); return; }
                Intent inst = new Intent(Intent.ACTION_VIEW).setDataAndType(apk, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                try { startActivity(inst); } catch (Exception e) { web.evaluateJavascript("window.toast&&toast('The installer could not open','err',6000)", null); }
            } };
            IntentFilter f = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(done, f, Context.RECEIVER_EXPORTED); else registerReceiver(done, f);
        } catch (Exception e) { web.evaluateJavascript("window.toast&&toast('The update could not start','err',6000)", null); }
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
        super.onPause();
        // In the picture-in-picture window the page keeps playing
        if (!(Build.VERSION.SDK_INT >= 24 && isInPictureInPictureMode())) web.onPause();
        CookieManager.getInstance().flush();
    }
    @Override protected void onResume() { super.onResume(); web.onResume(); if (wasPip && !(Build.VERSION.SDK_INT >= 24 && isInPictureInPictureMode())) wasPip = false; }
    @Override protected void onDestroy() { if (recognizer != null) recognizer.destroy(); if (web != null) { ((ViewGroup) web.getParent()).removeView(web); web.destroy(); } super.onDestroy(); }
}
