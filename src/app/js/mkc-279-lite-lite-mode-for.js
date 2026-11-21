
/* 2.79 Lite mode for weak TVs (Fire TV Stick Lite, older sticks, 1 GB boxes). html.lite is set by the head script
   (mkc-lite-head) before the first paint. Everything stays: Home, search, sources, the player, Live TV, the phone
   remote, watch party, profiles. What changes: nothing animates or glides, Home rows start with 12 posters (the rest
   join as you move along), the banner stays on one title (◀ ▶ still change it)
   and nothing is fetched ahead for it, the screensaver uses its plain mode, and images are fetched at screen size.
   Auto turns it on for known weak TVs; a TV that turns out slow anyway is asked once. Saved on this device only. */
const Lite = {
  KEY: 'mkc:lite',
  mode() { try { const v = JSON.parse(localStorage.getItem(this.KEY) || '"auto"'); return v === 'on' || v === 'off' ? v : 'auto'; } catch (e) { return 'auto'; } },
  weak() {
    const ua = navigator.userAgent, m = navigator.deviceMemory, c = navigator.hardwareConcurrency;
    return IS_TV ? true : (m && m <= 1);
  },
  on(v) { return v === 'on' || (v === 'auto' && !!this.weak()); },
  set(v) {
    try { localStorage.setItem(this.KEY, JSON.stringify(v)); } catch (e) { /* storage blocked: nothing to keep */ }
    try { Store.raw.set('liteAsked', true); } catch (e) { /* optional */ }
    if (this.on(v) === !!window.MK_LITE) return;
    toast(this.on(v) ? 'Snappy mode on. Restarting MKCinema…' : 'Snappy mode off. Restarting MKCinema…', 'info', 2000);
    setTimeout(() => location.reload(), 900);
  },
  HELP: 'The fastest MKCinema. Every feature stays, but nothing animates, glass and shadows are drawn flat, rows start shorter and the banner stays on one title, so every press answers at once. Automatic turns it on for TVs and for devices with little memory.',
  init() {
    try { MKLog.add('info', `lite: ${window.MK_LITE || 'off'} (setting ${this.mode()}, ram ${navigator.deviceMemory || '?'} GB, cpus ${navigator.hardwareConcurrency || '?'})`); } catch (e) { /* log is optional */ }
    if (IS_TV && window.MK_LITE && window.MK_LITE !== 'on' && !Store.raw.get('liteTold', false)) {
      setTimeout(() => { Store.raw.set('liteTold', true); toast('Snappy mode is on for this TV, so the remote stays quick. Settings › Performance.', 'info', 7000); }, 9000);
    }
    if (IS_TV && !window.MK_LITE && this.mode() === 'auto' && !Store.raw.get('liteAsked', false)) this.watch();
  },
  /* a TV that was not recognised as weak but works hard anyway: long main-thread tasks in the first 40 s, or remote
     presses that take long to show, ask once whether to turn Lite mode on */
  watch() {
    const st = { lt: 0, worst: 0, keys: [] };
    let po = null;
    try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) { st.lt += e.duration; if (e.duration > st.worst) st.worst = e.duration; } }); po.observe({ type: 'longtask', buffered: true }); } catch (e) { /* older WebView: keys only */ }
    const key = (e) => { if (st.keys.length >= 30 || e.repeat) return; const t = e.timeStamp; requestAnimationFrame(() => requestAnimationFrame(() => st.keys.push(performance.now() - t))); };
    addEventListener('keydown', key, true);
    setTimeout(() => {
      removeEventListener('keydown', key, true); if (po) po.disconnect();
      const ks = st.keys.slice().sort((a, b) => a - b), med = ks.length >= 10 ? ks[ks.length >> 1] : 0;
      if (st.lt > 9000 || st.worst > 2500 || med > 220) this.offer(Math.round(st.lt), Math.round(med));
    }, 40000);
  },
  async offer(lt, med) {
    try { MKLog.add('info', `lite: offered (long tasks ${lt} ms, key median ${med} ms)`); } catch (e) { /* optional */ }
    const wait = () => document.body.classList.contains('layer-open') || !$('#player').hidden || document.body.classList.contains('saver-on');
    for (let n = 0; wait() && n < 60; n++) await new Promise((r) => setTimeout(r, 5000));
    if (wait() || Store.raw.get('liteAsked', false)) return;
    Store.raw.set('liteAsked', true);
    const ok = await Gate.ask({ icon: 'gauge', eyebrow: 'Performance', title: 'Make MKCinema quicker on this TV?', yes: 'Turn on Snappy mode', no: 'Not now',
      html: 'This TV is working hard. Snappy mode keeps every feature, but nothing animates and rows start shorter, so the remote stays quick. Change it any time in Settings › Performance.' });
    if (ok === true) this.set('on');
  },
};
try { Lite.init(); } catch (e) { console.warn('Lite mode:', e); }
