# test APK only: the app opens https://localhost:8443/ (the runner's copy of one web variant) and accepts its own cert
import re
p = 'android/src/com/mkcinema/app/MainActivity.java'; s = open(p).read()
s = s.replace('static final String HOME = "https://mkcinema.pages.dev/";', 'static final String HOME = "https://localhost:8443/";')
s = s.replace('static final String HOST = "mkcinema.pages.dev";', 'static final String HOST = "localhost";')
s = s.replace('Arrays.asList("https://" + HOST, "https://app.mkcinema.app")', 'Arrays.asList("https://localhost:8443", "https://app.mkcinema.app")')
a = '@Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return cleartext(r); }'
assert s.count(a) == 1
s = s.replace(a, a + '\n            @Override public void onReceivedSslError(WebView v, android.webkit.SslErrorHandler h, android.net.http.SslError e) { h.proceed(); }')
open(p, 'w').write(s); print('test build points at localhost:8443')
