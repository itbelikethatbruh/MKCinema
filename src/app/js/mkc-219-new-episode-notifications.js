
/* ---------------- 2.19.0 New-episode notifications (Android app 1.5.0, phones and tablets) ----------------
   No server: the page hands the app the series you follow (watchlist and Continue watching, Cinemeta ids) and the
   furthest episode you reached in each; the app checks Cinemeta twice a day by itself and notifies you of an episode
   that aired in the last three days. Nothing about what you watch leaves the phone. Tapping the notification opens
   that episode (#open?type=series&id=…&video=…). Off by default; turning it on asks Android for permission (13+). */
const EpAlerts = {
  ok() { return !IS_TV && !!(window.MKAndroid && typeof MKAndroid.epEnable === 'function'); },
  on() { try { return this.ok() && MKAndroid.epOn(); } catch (e) { return false; } },
  payload() {
    const w = watchedMap(), shows = Calendar.shows().filter((s) => /^tt\d+$/.test(s.id)).slice(0, 60);
    return { shows: shows.map((s) => {
      let reached = 0;
      Object.values(S.progress).forEach((p) => { if (p.metaId === s.id && p.season != null) reached = Math.max(reached, Number(p.season) * 1000 + Number(p.episode)); });
      Object.keys(w).forEach((vid) => { const m = vid.match(/^(tt\d+):(\d+):(\d+)$/); if (m && m[1] === s.id) reached = Math.max(reached, Number(m[2]) * 1000 + Number(m[3])); });
      return { id: s.id, name: s.name || '', reached };
    }) };
  },
  sync() { if (this.on()) try { MKAndroid.epSync(JSON.stringify(this.payload())); } catch (e) { /* older app */ } },
  async set(v) {
    const r = MKAndroid.epEnable(!!v);
    if (r === 'asking') {
      const ok = await new Promise((res) => { window.MKEpPerm = res; setTimeout(() => res(null), 60000); });
      window.MKEpPerm = null;
      if (ok === false) toast('Notifications are blocked for MKCinema. Allow them in Android settings › Apps › MKCinema.', 'err', 6000);
      if (ok) { this.sync(); toast('New-episode notifications are on', 'ok'); }
      if (typeof renderSettingsBody === 'function' && document.querySelector('#set-epAlerts')) renderSettingsBody();
      return;
    }
    if (r === 'on') { this.sync(); toast('New-episode notifications are on', 'ok'); return; }
    if (v) {
      // 'off' (the page is not the app's own) or 'tv': the switch must not stay on
      toast(r === 'tv' ? 'New-episode notifications work on phones and tablets.' : 'New-episode notifications could not be turned on here.', 'err', 5000);
      if (typeof renderSettingsBody === 'function' && document.querySelector('#set-epAlerts')) renderSettingsBody();
    }
  },
  async open(q) {
    const type = q.get('type'), id = q.get('id'), vid = q.get('video');
    if (type !== 'series' || !/^tt\d+$/.test(id || '')) return;
    let meta = { id, type, name: '' };
    try { meta = remember({ ...meta, ...((await engine.fetchMeta(type, id)) || {}) }); } catch (e) { /* basics */ }
    openDetail(meta, { videoId: vid || undefined });
  },
  init() {
    // deep link from a notification
    const handle = Deep.handle.bind(Deep);
    Deep.handle = async function () {
      const h = location.hash.replace(/^#/, '');
      if (h.startsWith('open?')) { history.replaceState(null, '', location.pathname); return EpAlerts.open(new URLSearchParams(h.slice(5))); }
      return handle();
    };
    addEventListener('hashchange', () => { if (/^#open\?/.test(location.hash)) Deep.handle(); });
    if (/^#open\?/.test(location.hash)) setTimeout(() => Deep.handle(), 0);
    if (!this.ok()) return;
    // Settings › Home › Notifications
    const sec = SECTIONS.find((x) => x.id === 'home');
    if (sec) {
      const rows = sec.rows;
      sec.rows = () => [...rows(), { group: 'Notifications' },
        { key: 'epAlerts', label: 'New-episode notifications', help: 'Your phone tells you when a series in your watchlist or Continue watching gets a new episode. The app checks twice a day by itself; nothing about what you watch is sent anywhere.', type: 'toggle', get: () => EpAlerts.on(), set: (v) => EpAlerts.set(v) }];
    }
    // keep the app's list current: after each new-episode check, and when MKCinema goes to the background
    const check = NewEps.check.bind(NewEps);
    NewEps.check = async function () { const r = await check.apply(this, arguments); EpAlerts.sync(); return r; };
    document.addEventListener('visibilitychange', () => { if (document.hidden) EpAlerts.sync(); });
    setTimeout(() => EpAlerts.sync(), 15000);
  },
};
EpAlerts.init();
