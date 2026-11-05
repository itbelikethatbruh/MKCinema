#!/usr/bin/env python3
"""2.9.7 Cloudflare Web Analytics: anonymous, cookieless page-visit counts on mkcinema.pages.dev only, privacy copy
updated to match ("No ads. No cookies, no profiles."), and a Settings > Data switch to turn it off. The beacon loads
after the app, only on the live host.
Usage: python3 -I this.py index.html sw.js   (on 2.9.6; idempotent)"""
import os, re, sys, json
p, swp = sys.argv[1], sys.argv[2]
s = open(p, encoding='utf-8').read()
if "const APP_VERSION = '2.9.7'" in s: print('already applied'); sys.exit(0)
s, n = re.subn(r"const APP_VERSION = '2\.9\.6';", "const APP_VERSION = '2.9.7';", s); assert n == 1
for a, b in [
    ("['Privacy', 'No ads. No tracking.']", "['Privacy', 'No ads. No cookies, no profiles.']"),
    ("['Price', 'Free. No ads, no tracking',", "['Price', 'Free. No ads, no cookies',"),
    ("with no ads and no tracking.", "with no ads, no cookies and no profiles."),
]:
    assert s.count(a) == 1, a; s = s.replace(a, b)
for a, b in [
    ("partyName: '', partyHostLink: true, governor: true, syncKeys: true,", "partyName: '', partyHostLink: true, governor: true, syncKeys: true, anonStats: true,"),
    ("    { group: 'Setup Cloner' },\n", "    { group: 'Privacy' },\n    { key: 'anonStats', label: 'Share anonymous visit counts', help: 'Once per visit, Cloudflare Web Analytics counts the page, the site you came from, browser, country and load speed. No cookies, no IDs, nothing about your addons, keys or what you watch. Off sends nothing.', type: 'toggle' },\n    { group: 'Setup Cloner' },\n"),
]:
    assert s.count(a) == 1, a; s = s.replace(a, b)
beacon = """<script id="mkc-cfwa">
/* 2.9.7 Cloudflare Web Analytics: one anonymous report per visit (page, referrer, browser, country, load speed).
   No cookies, no storage, no IDs. Live host only, off with Settings > Data > Share anonymous visit counts, loaded after
   the app so it never slows the start. */
(function () {
  if (location.hostname !== 'mkcinema.pages.dev' || (typeof CFG !== 'undefined' && CFG.anonStats === false)) return;
  var go = function () { var sc = document.createElement('script'); sc.defer = true; sc.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    sc.setAttribute('data-cf-beacon', '{"token": "2ef8fe3029554590815952216270061a", "spa": false}'); document.body.appendChild(sc); };
  if (document.readyState === 'complete') setTimeout(go, 1500); else addEventListener('load', function () { setTimeout(go, 1500); });
})();
</script>
</body>"""
assert s.count('</body>') == 1; s = s.replace('</body>', beacon)
open(p, 'w', encoding='utf-8').write(s)
sw = open(swp).read(); sw, n = re.subn(r"const VERSION = 'mkc-[\d.]+';", "const VERSION = 'mkc-2.9.7';", sw); assert n == 1; open(swp, 'w').write(sw)
json.dump({'web': '2.9.7', 'android': '1.2.7', 'apk': 'https://mkcinema-site.pages.dev/download/MKCinema.apk'}, open(os.path.join(os.path.dirname(os.path.abspath(p)), 'version.json'), 'w'))
print('applied: 2.9.7')
