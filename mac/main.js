// MKCinema for Mac: the MKCinema web app in its own window, using the WebKit built into macOS.
// Runs with the system's JavaScript for Automation (osascript -l JavaScript), so it needs no compiled code.
ObjC.import('Cocoa');
ObjC.import('WebKit');

// The app opens HOME (its saved sign-in and settings live on that origin). Both of the web app's hosts count as
// MKCinema wherever a page is checked: app.mkcinema.app is the public home, mkcinema.pages.dev serves the apps.
const HOME = 'https://mkcinema.pages.dev/';
const HOST = 'mkcinema.pages.dev';
const HOSTS = [HOST, 'app.mkcinema.app'];
const isAppHost = (h) => HOSTS.indexOf(String(h || '').toLowerCase()) >= 0;
const VERSION = '1.1';
const app = $.NSApplication.sharedApplication;
app.setActivationPolicy($.NSApplicationActivationPolicyRegular);

const res = $.NSBundle.mainBundle.resourcePath.js;
const here = $.NSProcessInfo.processInfo.environment.objectForKey('MKC_RES');
const iconPath = (here.isNil() ? res : here.js) + '/MKCinema.icns';
const icon = $.NSImage.alloc.initWithContentsOfFile(iconPath);
if (!icon.isNil()) app.applicationIconImage = icon;

// Only these kinds of links are handed to other apps: web and mail links, magnet and Stremio links, and the video
// players the web app offers. file:, smb:, afp: and any other scheme are dropped, so a link can never open a file,
// a network share or a program (SEC-N-05).
const OUTSIDE = ['http', 'https', 'mailto', 'magnet', 'stremio', 'vlc', 'vlc-x-callback', 'iina', 'infuse', 'mpv', 'potplayer', 'outplayer', 'nplayer-http', 'nplayer-https'];
function openOutside(url) {
  const scheme = url.isNil() || url.scheme.isNil() ? '' : url.scheme.js.toLowerCase();
  if (OUTSIDE.indexOf(scheme) < 0) return;
  $.NSWorkspace.sharedWorkspace.openURL(url);
}

// The same address on HOME's host: app.mkcinema.app links open on the app's own origin, where the user is signed in.
function atHome(url) {
  const c = $.NSURLComponents.componentsWithURLResolvingAgainstBaseURL(url, false);
  if (c.isNil()) return url;
  c.scheme = 'https'; c.host = HOST; c.port = $(); c.user = $(); c.password = $();
  return c.URL.isNil() ? url : c.URL;
}

// ---- Torrents on this Mac (window.MKDesktop.p2p) ----
// The engine is the separate mkp2p program in Resources. It only downloads (never uploads or seeds), listens on
// 127.0.0.1 with a random token, and deletes what it downloaded when it stops. It stops when its input closes, which
// also happens when this app quits or crashes. The web app starts it only after the user agrees in Settings.
const fm = $.NSFileManager.defaultManager;
const engineBin = (here.isNil() ? res : here.js) + '/mkp2p';
const hasEngine = fm.isExecutableFileAtPath(engineBin);
let eng = null, engIn = null, engBase = '';

function engineStop() {
  if (engIn) { try { engIn.fileHandleForWriting.closeFile; } catch (e) { /* already closed */ } }
  eng = null; engIn = null; engBase = '';
}

function engineStart() {
  if (engBase && eng && eng.running) return engBase;
  engineStop();
  const cache = $.NSHomeDirectory().js + '/Library/Caches/MKCinema';
  fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(cache, true, $(), null);
  const t = $.NSTask.alloc.init;
  t.launchPath = engineBin;
  t.arguments = $(['-dir', cache, '-keep', '2', '-reserve-mb', '1024', '-conns', '50']);
  const pin = $.NSPipe.pipe, pout = $.NSPipe.pipe;
  t.standardInput = pin;
  t.standardOutput = pout;
  t.launch;
  eng = t; engIn = pin;
  // the engine prints its address (or "error: ...") as its first line, within a second
  const rd = pout.fileHandleForReading;
  let out = '';
  while (out.indexOf('\n') < 0) {
    const d = rd.availableData;
    if (d.length === 0) break;
    out += $.NSString.alloc.initWithDataEncoding(d, $.NSUTF8StringEncoding).js;
  }
  const line = out.split('\n')[0].trim();
  if (line.indexOf('http://127.0.0.1:') !== 0) { engineStop(); throw new Error(line.replace(/^error:\s*/, '') || 'the engine closed'); }
  engBase = line;
  return engBase;
}

const bridgeJs = "(function(){if(location.protocol!=='https:'||" + JSON.stringify(HOSTS) + ".indexOf(location.hostname)<0)return;var h=window.webkit.messageHandlers.mkd,n=0,w={};"
  + "Object.defineProperty(window,'__mkdDone',{value:function(i,e,v){var p=w[i];delete w[i];if(p){if(e)p[1](new Error(e));else p[0](v)}}});"
  + "function call(c){return new Promise(function(a,b){var i=++n;w[i]=[a,b];h.postMessage({id:i,cmd:c})})}"
  + "var d={platform:'mac',version:'" + VERSION + "'};"
  + (hasEngine ? "d.p2p={start:function(){return call('p2p-start')},stop:function(){return call('p2p-stop')}};" : '')
  + "window.MKDesktop=d;})();";

// Only MKCinema's own top-level page may use the bridge: not frames inside it (trailers and their ads), not other
// sites (SEC-N-11, TR-NAT-07).
function fromApp(msg) {
  try {
    const f = msg.frameInfo;
    if (f.isNil() || !f.isMainFrame) return false;
    const o = f.securityOrigin;
    return !o.isNil() && o.protocol.js === 'https' && isAppHost(o.host.js) && Number(o.port) === 0;
  } catch (e) { return false; }
}

function bridge(msg) {
  const body = msg.body;
  let id = 0, cmd = '';
  try { id = body.objectForKey('id').js; cmd = body.objectForKey('cmd').js; } catch (e) { return; }
  let err = '', val = null;
  if (!fromApp(msg)) {
    // answer the main frame so its promise settles; frames get nothing
    try { if (msg.frameInfo.isMainFrame) msg.webView.evaluateJavaScriptCompletionHandler('window.__mkdDone&&window.__mkdDone(' + JSON.stringify(id) + ',"not allowed on this page",null)', null); } catch (e) { /* nothing */ }
    return;
  }
  try {
    if (cmd === 'p2p-start') val = engineStart();
    else if (cmd === 'p2p-stop') engineStop();
  } catch (e) { err = String(e && e.message || e) || 'the engine did not start'; }
  msg.webView.evaluateJavaScriptCompletionHandler('window.__mkdDone&&window.__mkdDone(' + JSON.stringify(id) + ',' + JSON.stringify(err) + ',' + JSON.stringify(val) + ')', null);
}

const offlinePage = '<!doctype html><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#f2f2f3;font:16px -apple-system,system-ui;text-align:center">'
  + '<div><div style="font:500 32px Didot,Georgia,serif;margin-bottom:10px">You’re offline</div>'
  + '<div style="color:#bdbdc5;margin-bottom:26px">MKCinema needs a connection to load. Check your network, then try again.</div>'
  + '<a href="' + HOME + '" style="display:inline-block;padding:14px 26px;border-radius:999px;background:#e9e6de;color:#0b0b0c;font-weight:600;text-decoration:none">Try again</a></div>';

function failed(webView, error) {
  const url = error.userInfo.objectForKey('NSErrorFailingURLKey');
  if (!url.isNil()) {
    const scheme = url.scheme.isNil() ? '' : url.scheme.js;
    // Player hand-offs (infuse://, iina://) and other non-web links open in their own app.
    if (scheme !== 'http' && scheme !== 'https') { openOutside(url); return; }
  }
  if (error.code === -999) return; // cancelled
  if (error.domain.js === 'NSURLErrorDomain') webView.loadHTMLStringBaseURL(offlinePage, $.NSURL.URLWithString(HOME));
}

ObjC.registerSubclass({
  name: 'MKCinemaDelegate',
  protocols: ['WKUIDelegate', 'WKNavigationDelegate', 'NSApplicationDelegate', 'WKScriptMessageHandler'],
  methods: {
    'userContentController:didReceiveScriptMessage:': {
      types: ['void', ['id', 'id']],
      implementation: function (ucc, msg) { bridge(msg); }
    },
    'applicationWillTerminate:': {
      types: ['void', ['id']],
      implementation: function () { engineStop(); }
    },
    // Links that open a new window: MKCinema pages load here, everything else opens in the default browser.
    'webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:': {
      types: ['id', ['id', 'id', 'id', 'id']],
      implementation: function (webView, config, action, features) {
        const url = action.request.URL;
        if (!url.isNil()) {
          if (!url.host.isNil() && isAppHost(url.host.js)) webView.loadRequest($.NSURLRequest.requestWithURL(atHome(url)));
          else openOutside(url);
        }
        return null;
      }
    },
    'webView:didFailProvisionalNavigation:withError:': {
      types: ['void', ['id', 'id', 'id']],
      implementation: function (webView, nav, error) { failed(webView, error); }
    },
    'webView:didFailNavigation:withError:': {
      types: ['void', ['id', 'id', 'id']],
      implementation: function (webView, nav, error) { failed(webView, error); }
    },
    'applicationShouldTerminateAfterLastWindowClosed:': {
      types: ['bool', ['id']],
      implementation: function () { return true; }
    }
  }
});
const delegate = $.MKCinemaDelegate.alloc.init;
app.delegate = delegate;

// Menus: standard app, edit (copy and paste in text fields), view and window commands.
function menu(title, items) {
  const m = $.NSMenu.alloc.initWithTitle(title);
  items.forEach(i => {
    if (!i) { m.addItem($.NSMenuItem.separatorItem); return; }
    const it = m.addItemWithTitleActionKeyEquivalent(i[0], i[1], i[2] || '');
    if (i[3]) it.keyEquivalentModifierMask = i[3];
  });
  const holder = $.NSMenuItem.alloc.init;
  holder.submenu = m;
  return holder;
}
const bar = $.NSMenu.alloc.init;
bar.addItem(menu('MKCinema', [['Hide MKCinema', 'hide:', 'h'], ['Hide Others', 'hideOtherApplications:', 'h', (1 << 20) | (1 << 19)], ['Show All', 'unhideAllApplications:'], null, ['Quit MKCinema', 'terminate:', 'q']]));
bar.addItem(menu('Edit', [['Undo', 'undo:', 'z'], ['Redo', 'redo:', 'Z'], null, ['Cut', 'cut:', 'x'], ['Copy', 'copy:', 'c'], ['Paste', 'paste:', 'v'], ['Select All', 'selectAll:', 'a']]));
bar.addItem(menu('View', [['Reload', 'reload:', 'r'], ['Back', 'goBack:', '['], ['Forward', 'goForward:', ']'], null, ['Enter Full Screen', 'toggleFullScreen:', 'f', (1 << 20) | (1 << 18)]]));
bar.addItem(menu('Window', [['Minimize', 'performMiniaturize:', 'm'], ['Zoom', 'performZoom:'], null, ['Close', 'performClose:', 'w']]));
app.mainMenu = bar;

// Window
const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0, 0, 1440, 900), 1 | 2 | 4 | 8, $.NSBackingStoreBuffered, false);
win.title = 'MKCinema';
win.backgroundColor = $.NSColor.blackColor;
win.appearance = $.NSAppearance.appearanceNamed('NSAppearanceNameDarkAqua');
win.collectionBehavior = 1 << 7; // full-screen primary
win.minSize = $.NSMakeSize(900, 600);
win.center;
win.setFrameAutosaveName('MKCinemaMain');

const config = $.WKWebViewConfiguration.alloc.init;
config.mediaTypesRequiringUserActionForPlayback = 0;
config.applicationNameForUserAgent = 'Version/17.0 Safari/605.1.15 MKCinemaMac/' + VERSION;
config.userContentController.addUserScript($.WKUserScript.alloc.initWithSourceInjectionTimeForMainFrameOnly(bridgeJs, 0, true)); // at document start
config.userContentController.addScriptMessageHandlerName(delegate, 'mkd');
const prefs = config.preferences;
if (prefs.respondsToSelector('setElementFullscreenEnabled:')) prefs.setElementFullscreenEnabled(true);
const web = $.WKWebView.alloc.initWithFrameConfiguration(win.contentView.bounds, config);
web.autoresizingMask = 2 | 16; // width + height
web.UIDelegate = delegate;
web.navigationDelegate = delegate;
if (web.respondsToSelector('setInspectable:')) web.setInspectable(false);
web.setValueForKey($.NSNumber.numberWithBool(false), 'drawsBackground');
win.contentView.addSubview(web);
web.loadRequest($.NSURLRequest.requestWithURL($.NSURL.URLWithString(HOME)));

win.makeKeyAndOrderFront(null);
app.activateIgnoringOtherApps(true);
app.run;
