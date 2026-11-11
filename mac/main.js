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
// Each launch writes its steps to ~/Library/Logs/MKCinema/launch.log, so a start that fails leaves something readable.
const LOG = $.NSHomeDirectory().js + '/Library/Logs/MKCinema/launch.log';
$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(LOG.replace(/\/[^/]+$/, ''), true, $(), null);
$.NSFileManager.defaultManager.removeItemAtPathError(LOG, null);
function logLine(text) {
  try {
    const f = $.NSFileManager.defaultManager;
    if (!f.fileExistsAtPath(LOG)) f.createFileAtPathContentsAttributes(LOG, $(), $());
    const h = $.NSFileHandle.fileHandleForWritingAtPath(LOG);
    if (h.isNil()) return;
    h.seekToEndOfFile;
    h.writeData($(new Date().toISOString() + ' ' + text + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
    h.closeFile;
  } catch (e) { /* logging never stops the app */ }
}
logLine('started ' + VERSION + ' on macOS ' + $.NSProcessInfo.processInfo.operatingSystemVersionString.js);
// The launch test (.github/workflows/mac-smoke.yml) sets this flag: load the page, ping the bridge once, then quit.
const SELFTEST = $.NSFileManager.defaultManager.fileExistsAtPath($.NSHomeDirectory().js + '/Library/Caches/MKCinema/selftest');
const app = $.NSApplication.sharedApplication;
app.setActivationPolicy($.NSApplicationActivationPolicyRegular);

const res = $.NSBundle.mainBundle.resourcePath.js;
const here = $.NSProcessInfo.processInfo.environment.objectForKey('MKC_RES');
const iconPath = (here.isNil() ? res : here.js) + '/MKCinema.icns';
const icon = $.NSImage.alloc.initWithContentsOfFile(iconPath);
if (!icon.isNil()) app.applicationIconImage = icon;

// Only these kinds of links are handed to other apps: web and mail links, magnet and Stremio links, and the video
// players the web app offers. file:, smb:, afp: and any other scheme are dropped, so a link can never open a file,
// a network share or a program.
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

// Starts mkp2p with these arguments and returns [task, input pipe, the address it printed].
function spawnHelper(args) {
  const t = $.NSTask.alloc.init;
  t.launchPath = engineBin;
  t.arguments = $(args);
  const pin = $.NSPipe.pipe, pout = $.NSPipe.pipe;
  t.standardInput = pin;
  t.standardOutput = pout;
  t.launch;
  // the helper prints its address (or "error: ...") as its first line, within a second
  const rd = pout.fileHandleForReading;
  let out = '';
  while (out.indexOf('\n') < 0) {
    const d = rd.availableData;
    if (d.length === 0) break;
    out += $.NSString.alloc.initWithDataEncoding(d, $.NSUTF8StringEncoding).js;
  }
  const line = out.split('\n')[0].trim();
  if (line.indexOf('http://127.0.0.1:') !== 0) {
    try { pin.fileHandleForWriting.closeFile; } catch (e) { /* already closed */ }
    throw new Error(line.replace(/^error:\s*/, '') || 'the helper closed');
  }
  return [t, pin, line];
}

function engineStart() {
  if (engBase && eng && eng.running) return engBase;
  engineStop();
  const cache = $.NSHomeDirectory().js + '/Library/Caches/MKCinema';
  fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(cache, true, $(), null);
  [eng, engIn, engBase] = spawnHelper(['-dir', cache, '-keep', '2', '-reserve-mb', '1024', '-conns', '50']);
  return engBase;
}

// ---- Pass server (window.MKDesktop.pass) ----
// The same mkp2p program with -pass: a 127.0.0.1 server with a random token that lets MKCinema's own page read
// video hosts that send no CORS header, and open the person's own TV service when it is on plain http:// (browsers
// refuse http:// inside an https page, but may talk to 127.0.0.1). Public hosts only, nothing stored. It is
// started the first time the page asks and stops when the app quits.
let pas = null, pasIn = null, pasBase = '';
function passStop() {
  if (pasIn) { try { pasIn.fileHandleForWriting.closeFile; } catch (e) { /* already closed */ } }
  pas = null; pasIn = null; pasBase = '';
}
function passStart() {
  if (pasBase && pas && pas.running) return pasBase;
  passStop();
  [pas, pasIn, pasBase] = spawnHelper(['-pass']);
  return pasBase;
}

const bridgeJs = "(function(){if(location.protocol!=='https:'||" + JSON.stringify(HOSTS) + ".indexOf(location.hostname)<0)return;var h=window.webkit.messageHandlers.mkd,n=0,w={};"
  + "Object.defineProperty(window,'__mkdDone',{value:function(i,e,v){var p=w[i];delete w[i];if(p){if(e)p[1](new Error(e));else p[0](v)}}});"
  + "function call(c){return new Promise(function(a,b){var i=++n;w[i]=[a,b];h.postMessage({id:i,cmd:c})})}"
  + "var d={platform:'mac',version:'" + VERSION + "'};"
  + (hasEngine ? "d.p2p={start:function(){return call('p2p-start')},stop:function(){return call('p2p-stop')}};d.pass={start:function(){return call('pass-start')}};" : '')
  + "window.MKDesktop=d;" + (SELFTEST ? "setTimeout(function(){call('ping')},1500);" : '') + "})();";

// Only MKCinema's own top-level page may use the bridge: not frames inside it (trailers and their ads), not other
// sites.
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
    if (cmd === 'ping') {
      val = 'pong'; logLine('bridge ping ok');
      if (SELFTEST) { logLine('selftest: quitting'); app.performSelectorWithObjectAfterDelay('terminate:', $(), 1.0); }
    } else if (cmd === 'p2p-start') val = engineStart();
    else if (cmd === 'p2p-stop') engineStop();
    else if (cmd === 'pass-start') val = passStart();
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

try {
ObjC.registerSubclass({
  name: 'MKCinemaDelegate',
  // Only protocols the JXA bridge can find at this point are declared. WKScriptMessageHandler is not registered
  // until WebKit uses it (declaring it fails with "protocol does not exist"), and NSApplicationDelegate's BOOL
  // methods do not match JXA's type strings. Cocoa and WebKit only check that the methods exist, so both still work.
  protocols: ['WKUIDelegate', 'WKNavigationDelegate'],
  methods: {
    'userContentController:didReceiveScriptMessage:': {
      types: ['void', ['id', 'id']],
      implementation: function (ucc, msg) { bridge(msg); }
    },
    'applicationWillTerminate:': {
      types: ['void', ['id']],
      implementation: function () { engineStop(); passStop(); }
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
    'webView:didFinishNavigation:': {
      types: ['void', ['id', 'id']],
      implementation: function (webView) { logLine('page loaded ' + (webView.URL.isNil() ? '' : webView.URL.host.js)); }
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
} catch (e) { logLine('error: native setup failed: ' + e); throw e; }
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
logLine('window shown');
app.run;
