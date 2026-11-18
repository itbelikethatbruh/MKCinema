
/* 2.76: real-device timing for TV speed work, one log line per launch (TV only) */
(() => {
  try {
    if (!/MKCinemaTV/.test(navigator.userAgent)) return;
    const t0 = performance.timeOrigin, now = () => Math.round(performance.now());
    const m = { lcp: 0, home: 0, lt: 0, ltN: 0, lt200: 0, ltMax: 0, keys: [], k: 0 };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { m.lt += e.duration; m.ltN++; if (e.duration >= 200) m.lt200++; if (e.duration > m.ltMax) m.ltMax = e.duration; } }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* older WebView: no long task entries */ }
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { /* older WebView */ }
    addEventListener('keydown', (e) => {
      if (m.k >= 40) return; m.k++; const st = e.timeStamp;
      requestAnimationFrame(() => requestAnimationFrame(() => { m.keys.push(Math.round(performance.now() - st)); }));
    }, true);
    setTimeout(() => {
      try {
        const n = performance.getEntriesByType('navigation')[0] || {}, fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0;
        const im = performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'img').map((r) => r.startTime); m.home = im.length ? Math.round(Math.min(...im)) : 0;
        const ks = m.keys.slice().sort((a, b) => a - b), med = ks.length ? ks[ks.length >> 1] : 0, mx = ks.length ? ks[ks.length - 1] : 0;
        const cr = /Chrome\/(\d+)/.exec(navigator.userAgent), dev = /\b(AFT\w+|Build\/[\w.]+)/.exec(navigator.userAgent);
        const msg = `tv timing: fcp ${Math.round(fcp)} ms, dom ${Math.round(n.domContentLoadedEventEnd || 0)} ms, load ${Math.round(n.loadEventEnd || 0)} ms, first image requested ${m.home || 'never'} ms, biggest paint ${m.lcp || '?'} ms, `
          + `long tasks ${m.ltN} (${Math.round(m.lt)} ms total, ${m.lt200} over 200 ms, worst ${Math.round(m.ltMax)} ms), keys ${m.keys.length} (median ${med} ms, worst ${mx} ms), `
          + `webview ${cr ? cr[1] : '?'}, cpus ${navigator.hardwareConcurrency || '?'}, ram ${navigator.deviceMemory || '?'} GB, device ${dev ? dev[1] : '?'}, app ${typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?'}`;
        if (typeof MKLog !== 'undefined' && MKLog.add) MKLog.add('info', msg);
      } catch (e) { /* timing is optional */ }
    }, 25000);
  } catch (e) { /* timing is optional */ }
})();
