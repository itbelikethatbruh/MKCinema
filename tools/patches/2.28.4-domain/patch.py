#!/usr/bin/env python3
"""2.28.4: MKCinema moves to mkcinema.app (site), app.mkcinema.app (web app), tv.mkcinema.app (Fire TV).
mkcinema.pages.dev keeps serving the native apps (Android/TV, Windows, Mac, Linux, webOS, TizenBrew) unchanged.
A plain browser on mkcinema.pages.dev is sent to app.mkcinema.app (signed-out) or shown a move bar (signed in).
MyAnimeList stays on mkcinema.pages.dev because every user registered that redirect URL.
Idempotent. Usage: python3 -I patch.py /mnt/project-files/mkcinema"""
import sys, re, os
root = sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/mkcinema'
VER = '2.28.4'
p = os.path.join(root, 'index.html'); s = open(p, encoding='utf-8').read()

def rep(old, new, count=1):
    global s
    if new in s: return
    n = s.count(old)
    assert n == count, (old[:80], n)
    s = s.replace(old, new)

rep("toast('The phone remote needs MKCinema on a web address, such as mkcinema.pages.dev.'", "toast('The phone remote needs MKCinema on a web address, such as app.mkcinema.app.'")
rep("<p>This needs MKCinema opened from its web address, such as mkcinema.pages.dev.</p>", "<p>This needs MKCinema opened from its web address, such as app.mkcinema.app.</p>")
rep("or open mkcinema.pages.dev in Chrome to cast", "or open app.mkcinema.app in Chrome to cast")
rep("enter mkctv.pages.dev, then install over this one.", "enter tv.mkcinema.app, then install over this one.")
rep("v.apk || 'https://mkcinema-site.pages.dev/download/MKCinema.apk'", "v.apk || 'https://mkcinema.app/download/MKCinema.apk'")
rep("   - Delete account (Settings › Account, and mkcinema.pages.dev/#delete-account for Google Play)", "   - Delete account (Settings › Account, and app.mkcinema.app/#delete-account for Google Play)")
rep("  BASE: 'https://mkcinema.pages.dev/',\n  sync()", "  BASE: 'https://app.mkcinema.app/',\n  sync()")
rep("// the public link stores ask for: mkcinema.pages.dev/#delete-account", "// the public link stores ask for: app.mkcinema.app/#delete-account")
rep("if (location.hostname !== 'mkcinema.pages.dev' || (typeof CFG", "if (!/^(mkcinema\\.pages\\.dev|app\\.mkcinema\\.app)$/.test(location.hostname) || (typeof CFG")
# links handed to phones (remote QR, TV sign-in QR, share) use the public address
rep("const IS_TV = document.documentElement.classList.contains('tv')", "const PUBLIC_ORIGIN = location.hostname === 'mkcinema.pages.dev' ? 'https://app.mkcinema.app' : location.origin;\nconst IS_TV = document.documentElement.classList.contains('tv')")
rep("const appLink = (hash) => (/^https?:$/.test(location.protocol) ? `${location.origin}${location.pathname}#${hash}` : '');", "const appLink = (hash) => (/^https?:$/.test(location.protocol) ? `${PUBLIC_ORIGIN}${location.pathname}#${hash}` : '');")
rep("return `${location.origin}${location.pathname.replace(/[^/]*$/, '')}remote${code ? `#${code}${extra}` : ''}`;", "return `${PUBLIC_ORIGIN}${location.pathname.replace(/[^/]*$/, '')}remote${code ? `#${code}${extra}` : ''}`;")

MOVE = r"""<script id="mkc-domain">
/* 2.28.4 MKCinema lives at app.mkcinema.app. mkcinema.pages.dev keeps serving the installed apps (Android, TVs, Windows,
   Mac, Linux, webOS, Samsung) and installed web apps untouched. A plain browser tab that isn't signed in moves right away,
   keeping the path and #link; a signed-in tab gets a bar (moving origin means signing in once, synced data follows).
   OAuth callbacks (MyAnimeList ?code=) are never moved. */
(function () {
  try {
    if (location.hostname !== 'mkcinema.pages.dev' || window.top !== window) return;
    var ua = navigator.userAgent;
    if (/MKCinema|; wv\)|Android TV|GoogleTV|AFT[A-Z]|SMART-TV|SmartTV|Web0S|webOS|Tizen|BRAVIA/i.test(ua)) return;
    if (window.MKAndroid || window.tizen || (window.chrome && window.chrome.webview) || (window.webkit && window.webkit.messageHandlers)) return;
    if ((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone) return;
    if (/[?&](code|state|error)=/.test(location.search)) return;
    var to = 'https://app.mkcinema.app' + location.pathname + location.search + location.hash, signed = false;
    try { signed = !!localStorage.getItem('mkc:auth'); } catch (e) { signed = false; }
    if (!signed) { location.replace(to); return; }
    var later = 0; try { later = +localStorage.getItem('mkc:movedLater') || 0; } catch (e) { later = 0; }
    if (Date.now() - later < 3 * 864e5) return;
    var show = function () {
      if (document.getElementById('mkcMove')) return;
      var b = document.createElement('div'); b.id = 'mkcMove'; b.setAttribute('role', 'status');
      b.innerHTML = '<span>MKCinema has a new home: <b>app.mkcinema.app</b>. Sign in there once and your synced library comes with you.</span>' +
        '<a class="mv-go" href="' + to.replace(/"/g, '&quot;') + '">Open app.mkcinema.app</a><button type="button" class="mv-x" aria-label="Later">Later</button>';
      b.querySelector('.mv-x').onclick = function () { try { localStorage.setItem('mkc:movedLater', String(Date.now())); } catch (e) { /* private mode */ } b.remove(); };
      document.body.appendChild(b);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 1200); }); else setTimeout(show, 1200);
  } catch (e) { /* never block the app */ }
})();
</script>
<style id="mkc-domain-css">
#mkcMove { position: fixed; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 2147483000;
  width: min(680px, calc(100vw - 32px)); display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 14px 16px;
  background: #121212; color: #f2efe8; border: 1px solid rgba(255,255,255,.14); border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.55);
  font: 500 14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
#mkcMove span { flex: 1 1 260px; min-width: 0; }
#mkcMove .mv-go { background: #e8dcc0; color: #111; text-decoration: none; padding: 9px 14px; border-radius: 999px; font-weight: 700; white-space: nowrap; }
#mkcMove .mv-x { background: transparent; color: #f2efe8; border: 1px solid rgba(255,255,255,.22); padding: 8px 12px; border-radius: 999px; font: inherit; cursor: pointer; }
</style>
"""
if 'id="mkc-domain"' not in s:
    i = s.index('<head>') + len('<head>')
    # after the charset/viewport metas so the redirect still runs before anything heavy
    j = s.index('\n', s.index('name="viewport"', i)) + 1
    s = s[:j] + MOVE + s[j:]

def bump(txt, pat, fmt):
    m = re.search(pat, txt); assert m, pat
    cur = tuple(int(x) for x in m.group(1).split('.'))
    if cur < tuple(int(x) for x in VER.split('.')): txt = txt[:m.start()] + fmt % VER + txt[m.end():]
    return txt
s = bump(s, r"const APP_VERSION = '([\d.]+)';", "const APP_VERSION = '%s';")
open(p, 'w', encoding='utf-8').write(s)

sw = os.path.join(root, 'sw.js'); t = open(sw).read(); t = bump(t, r"const VERSION = 'mkc-([\d.]+)';", "const VERSION = 'mkc-%s';"); open(sw, 'w').write(t)
vj = os.path.join(root, 'version.json'); t = open(vj).read()
t = bump(t, r'"web": "([\d.]+)"', '"web": "%s"')
t = t.replace('https://mkcinema-site.pages.dev/download/MKCinema.apk', 'https://mkcinema.app/download/MKCinema.apk')
open(vj, 'w').write(t)

pv = os.path.join(root, 'privacy.html'); t = open(pv, encoding='utf-8').read()
t = t.replace('This page covers the MKCinema web app at mkcinema.pages.dev', 'This page covers the MKCinema web app at app.mkcinema.app (also reachable at mkcinema.pages.dev)')
t = t.replace('<a href="https://mkcinema.pages.dev/#delete-account">mkcinema.pages.dev/#delete-account</a>', '<a href="https://app.mkcinema.app/#delete-account">app.mkcinema.app/#delete-account</a>')
t = t.replace('clear the site data for mkcinema.pages.dev in your browser', 'clear the site data for app.mkcinema.app (and mkcinema.pages.dev, if you used it) in your browser')
open(pv, 'w', encoding='utf-8').write(t)
rd = os.path.join(root, 'README.md'); t = open(rd, encoding='utf-8').read()
t = t.replace('The site lives at https://mkcinema.pages.dev.', 'The app lives at https://app.mkcinema.app (the Cloudflare Pages project `mkcinema`, also at https://mkcinema.pages.dev, which the native apps load).')
t = t.replace('It answers only https://mkcinema.pages.dev, its preview subdomains and localhost', 'It answers only mkcinema.app and its subdomains, https://mkcinema.pages.dev, its preview subdomains and localhost')
open(rd, 'w', encoding='utf-8').write(t)
print('ok', VER)
