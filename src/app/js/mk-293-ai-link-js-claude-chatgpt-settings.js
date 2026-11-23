
'use strict';
/* 2.93 Claude and ChatGPT. Settings › Devices › "Let Claude or ChatGPT send titles here" (off until turned on).
   It gives this screen a private 10-character code and a connector link to add in Claude or ChatGPT. The assistant
   can then look up films and shows and open or play one here. All it can send is "open" or "play" of an IMDb id:
   it never sees an account, library, history, addon or key. A kids seat still only opens what it allows, and if a
   film is playing this screen asks before switching. At most 6 titles a minute. New code makes the old link stop. */
(function () {
  if (typeof Bus !== 'function' || typeof secById !== 'function') return;
  const K = 'aiLink', FN = 'mkcinema-mcp', ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const safe = (f, d) => { try { return f(); } catch (e) { return d; } };
  const AiLink = window.AiLink = {
    bus: null, hits: [], retryT: 0,
    get() { const v = Store.raw.get(K, null); return v && typeof v === 'object' ? v : { on: false, code: '' }; },
    put(v) { Store.raw.set(K, v); },
    on() { const v = this.get(); return !!v.on && new RegExp(`^[${ABC}]{10}$`).test(v.code || ''); },
    newCode() { const a = new Uint32Array(10); crypto.getRandomValues(a); return [...a].map((n) => ABC[n % ABC.length]).join(''); },
    pretty(c) { return `${c.slice(0, 5)}-${c.slice(5)}`; },
    base() { const c = safe(() => Account.config(), null); return c && c.source === 'built in' ? String(c.url).replace(/\/+$/, '') : SUPABASE_PROJECT.url; },
    builtIn() { const c = safe(() => Account.config(), null); return !c || c.source === 'built in'; },
    link() { const v = this.get(); return v.code ? `${this.base()}/functions/v1/${FN}?tv=${v.code}` : ''; },
    set(on) {
      const v = this.get(); v.on = !!on; if (on && !v.code) v.code = this.newCode(); this.put(v);
      this.start();
    },
    renew() { const v = this.get(); v.code = this.newCode(); this.put(v); this.start(); toast('New code. Update the link in Claude or ChatGPT.', 'ok', 4200); },
    async start() {
      this.stop();
      if (!this.on()) return;
      const bus = this.bus = new Bus(`ai-${this.get().code}`, (m) => this.onMsg(m));
      const up = await safe(() => bus.connect(), Promise.resolve(false)).catch(() => false);
      if (this.bus !== bus) return;
      if (!up) this.retryT = setTimeout(() => { if (this.bus === bus) this.start(); }, 60000);
    },
    stop() { clearTimeout(this.retryT); const b = this.bus; this.bus = null; if (b) safe(() => b.close()); },
    onMsg(m) {
      if (!m || (m.t !== 'open' && m.t !== 'play')) return;
      const id = String(m.id || ''); if (!/^tt\d{5,10}$/.test(id)) return;
      const now = Date.now(); this.hits = this.hits.filter((t) => now - t < 60000);
      if (this.hits.length >= 6) return; this.hits.push(now);
      const v = { id, type: m.type === 'series' ? 'series' : 'movie', name: String(m.name || '').slice(0, 200) };
      if (typeof m.vid === 'string' && /^tt\d{5,10}:\d{1,4}:\d{1,5}$/.test(m.vid) && m.vid.startsWith(`${id}:`)) v.vid = m.vid;
      const pl = $('#player'), playing = pl && !pl.hidden;
      if (playing) this.ask(m.t, v); else this.run(m.t, v);
    },
    /* the phone remote's path (RmInfo): kids seat check, close the player, open the page, then Play like pressing it */
    async run(c, v) {
      const seed = (S.metas && S.metas.get(v.id)) || { id: v.id, type: v.type, name: v.name };
      const kidOk = safe(() => typeof Seats === 'undefined' || !Seats.kids || !Seats.kids() || Seats.kidSafe(seed), true);
      if (!kidOk) { toast('Not on the kids seat', 'err', 2200, 'kids'); return; }
      if (!$('#player').hidden) await closePlayer();
      await openDetail(seed, v.vid ? { videoId: v.vid } : {});
      toast(`From your assistant: ${seed.name || v.name || 'a title'}`, 'ok', 2600, 'aiLink');
      if (c === 'play' && typeof smartPlayDetail === 'function' && !$('#detail').hidden && D.meta && D.meta.id === v.id) await smartPlayDetail();
    },
    ask(c, v) {
      X8.layer('aiAsk', { label: 'Your assistant', icon: 'sparkles', eyebrow: 'Claude or ChatGPT' });
      const b = X8.body('aiAsk');
      b.innerHTML = `<div class="aia"><h2 class="x8-h" translate="no">${esc(v.name || v.id)}</h2><p>${c === 'play' ? 'Your assistant wants to play this now. Stop what is playing?' : 'Your assistant wants to open this. Stop what is playing?'}</p>
        <div class="aia-row"><button type="button" class="btn btn-prime" data-nav id="aiaGo"><i data-lucide="play"></i>${c === 'play' ? 'Play it' : 'Open it'}</button><button type="button" class="btn btn-ghost" data-nav id="aiaNo">Keep watching</button></div></div>`;
      icons();
      $('#aiaGo', b).onclick = () => { X8.close('aiAsk'); this.run(c, v); };
      $('#aiaNo', b).onclick = () => X8.close('aiAsk');
      X8.open('aiAsk');
      setTimeout(() => { const f = $('#aiaNo', b); if (!f) return; if (IS_TV && typeof Nav !== 'undefined' && Nav.focus) Nav.focus(f, true); else if (!TOUCH_UI) f.focus({ preventScroll: true }); }, 60);
    },
    rows() {
      const on = this.on(), link = this.link(), out = [{ group: 'Claude and ChatGPT' },
        { key: 'aiLinkOn', label: 'Let Claude or ChatGPT send titles here', help: 'Ask your assistant for something to watch and it opens or plays it on this screen. It can only look titles up and send one here: it never sees your account, library, history, addons or keys. A kids seat still decides what opens, and this screen asks before stopping a film.', type: 'toggle', get: () => this.on(), set: (x) => { this.set(x); renderSettingsBody(); } }];
      if (!on) return out;
      let qr = ''; try { qr = QR.svg(link); } catch (e) { qr = ''; }
      out.push({ html: () => `<div class="ail">${qr ? `<div class="ail-qr" aria-hidden="true">${qr}</div>` : ''}<div class="ail-t"><div class="ail-code" translate="no">${esc(this.pretty(this.get().code))}</div><p class="ail-url" translate="no">${esc(link)}</p>
        <p class="ail-how">In Claude: Settings › Connectors › Add custom connector, and paste this link. In ChatGPT: Settings › Apps and connectors › Create (developer mode). Scan the code to open the link on your phone.</p>${this.builtIn() ? '' : '<p class="ail-how">Works with MKCinema’s own account server only.</p>'}</div></div>` },
      { key: 'aiLinkCopy', label: 'Connector link', help: 'Anyone with this link can send titles to this screen, so keep it to yourself.', type: 'button', text: 'Copy link', icon: 'copy', run: () => copyText(link, 'Link copied') },
      { key: 'aiLinkNew', label: 'New code', help: 'The old link stops working. Paste the new one in Claude or ChatGPT.', type: 'button', text: 'New code', icon: 'refresh-cw', run: () => { this.renew(); renderSettingsBody(); } });
      return out;
    },
  };
  const dv = secById('devices');
  if (dv) { const rows = dv.rows; dv.rows = () => [...rows(), ...AiLink.rows()]; }
  if (AiLink.on()) setTimeout(() => AiLink.start(), 2500);
  addEventListener('online', () => { if (AiLink.on() && AiLink.bus && !AiLink.bus.online) AiLink.start(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && AiLink.on() && (!AiLink.bus || !AiLink.bus.online)) AiLink.start(); });
})();
