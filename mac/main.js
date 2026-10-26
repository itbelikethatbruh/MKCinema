// MKCinema for Mac: the MKCinema web app in its own window, using the WebKit built into macOS.
// Runs with the system's JavaScript for Automation (osascript -l JavaScript), so it needs no compiled code.
ObjC.import('Cocoa');
ObjC.import('WebKit');

const HOME = 'https://mkcinema.pages.dev/';
const HOST = 'mkcinema.pages.dev';
const app = $.NSApplication.sharedApplication;
app.setActivationPolicy($.NSApplicationActivationPolicyRegular);

const res = $.NSBundle.mainBundle.resourcePath.js;
const here = $.NSProcessInfo.processInfo.environment.objectForKey('MKC_RES');
const iconPath = (here.isNil() ? res : here.js) + '/MKCinema.icns';
const icon = $.NSImage.alloc.initWithContentsOfFile(iconPath);
if (!icon.isNil()) app.applicationIconImage = icon;

function openOutside(url) { $.NSWorkspace.sharedWorkspace.openURL(url); }

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
  protocols: ['WKUIDelegate', 'WKNavigationDelegate', 'NSApplicationDelegate'],
  methods: {
    // Links that open a new window: MKCinema pages load here, everything else opens in the default browser.
    'webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:': {
      types: ['id', ['id', 'id', 'id', 'id']],
      implementation: function (webView, config, action, features) {
        const url = action.request.URL;
        if (!url.isNil()) {
          if (!url.host.isNil() && url.host.js === HOST) webView.loadRequest($.NSURLRequest.requestWithURL(url));
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
config.applicationNameForUserAgent = 'Version/17.0 Safari/605.1.15 MKCinemaMac/1.0';
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
