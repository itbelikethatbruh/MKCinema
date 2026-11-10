
/* 2.9.7 Cloudflare Web Analytics: one anonymous report per visit (page, referrer, browser, country, load speed).
   No cookies, no storage, no IDs. Live host only, off with Settings > Data > Share anonymous visit counts, loaded after
   the app so it never slows the start. */
(function () {
  if (!/^(mkcinema\.pages\.dev|app\.mkcinema\.app)$/.test(location.hostname) || (typeof CFG !== 'undefined' && CFG.anonStats === false)) return;
  var go = function () { var sc = document.createElement('script'); sc.defer = true; sc.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    sc.setAttribute('data-cf-beacon', '{"token": "2ef8fe3029554590815952216270061a", "spa": false}'); document.body.appendChild(sc); };
  if (document.readyState === 'complete') setTimeout(go, 1500); else addEventListener('load', function () { setTimeout(go, 1500); });
})();
