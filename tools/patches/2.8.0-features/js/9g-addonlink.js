/* ---------------- 2.9.9 One-tap addon install from setup pages ----------------
   Addons that need your own settings or token are set up on their own page, which ends with an Install button
   (a stremio:// link) or a manifest link to copy. The Android and TV app (1.2.8) now opens on that Install button and
   lands here; MKCinema also reads a #install= link. In the browser, coming back from a setup page offers to install
   the link you copied, in one press. Every install still asks first, showing the addon's own name. */
const AddonLink = {
  away: 0,
  pick(t) {
    const m = String(t || '').match(/(stremio|https?):\/\/[^\s"'<>]+?\/manifest\.json(\?[^\s"'<>]*)?/i);
    return m ? m[0] : null;
  },
  async ask(raw) {
    const url = this.pick(raw); if (!url) { toast('That is not an addon link (it should end in manifest.json)', 'err', 5000); return; }
    const go = async () => {
      X8.layer('adLink', { label: 'Install addon', icon: 'puzzle', eyebrow: 'Install addon' });
      const b = X8.body('adLink');
      b.innerHTML = '<div class="status-line" style="padding:24px"><span class="spin"></span>Reading the addon…</div>';
      X8.open('adLink');
      let m = null;
      try { const r = await fetch(url.replace(/^stremio:\/\//i, 'https://'), { cache: 'no-store' }); if (r.ok) m = await r.json(); } catch (e) { /* shown below */ }
      if (!m || !m.id) { b.innerHTML = `<div class="empty-state"><i data-lucide="cloud-off"></i><h3>The addon did not answer</h3><p>Check the link on its setup page, or paste it in the addon manager.</p></div>`; icons(); return; }
      const have = engine.addons.some((a) => a.manifest && a.manifest.id === m.id);
      const host = (() => { try { return new URL(url.replace(/^stremio:\/\//i, 'https://')).host; } catch (e) { return ''; } })();
      b.innerHTML = `<h3 class="x8-h">${esc(m.name || 'Addon')}</h3>
        <p class="sub">${esc(String(m.description || '').slice(0, 220))}</p>
        <p class="sub mono" style="opacity:.8">${esc(host)}${m.version ? ` · v${esc(m.version)}` : ''}</p>
        <p class="tour-note">Addons are made by their own authors and MKCinema checks none of them. Install only what you trust.${have ? ' Installing again replaces the copy you have, with these settings.' : ''}</p>
        <div class="actions"><button class="btn btn-prime" type="button" data-nav id="adLinkGo"><i data-lucide="download-cloud"></i>${have ? 'Update addon' : 'Install addon'}</button><button class="btn btn-ghost" type="button" data-nav id="adLinkNo">Cancel</button></div>`;
      icons();
      $('#adLinkNo').onclick = () => X8.close('adLink');
      $('#adLinkGo').onclick = async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        const r = await installAddon(url);
        if (!r) { btn.disabled = false; return; }
        // new settings mean a new link: the copy with the old link goes, once the new one is in
        engine.addons.filter((a) => a !== r && !a.builtin && a.manifest && a.manifest.id === m.id).forEach((a) => engine.remove(a.baseUrl));
        X8.close('adLink'); if (!$('#addons').hidden) renderAddons();
      };
      if (IS_TV) Nav.settle();
    };
    if (typeof Seats !== 'undefined' && Seats.kids && Seats.kids()) Seats.guard(go); else go();
  },
  /* browser: after a setup page, offer the copied link */
  bar() {
    if ($('#adPaste') || IS_TV) return;
    const el = document.createElement('div'); el.id = 'adPaste'; el.setAttribute('role', 'status');
    el.innerHTML = '<div><b>Finished setting up an addon?</b><small>Copy its link on the setup page, then install it here.</small></div><div class="inrow"><button class="btn btn-prime btn-sm" type="button" data-nav id="adPasteGo">Install copied link</button><button class="btn btn-ghost btn-sm" type="button" data-nav id="adPasteNo">Not now</button></div>';
    document.body.appendChild(el);
    const done = () => el.remove();
    $('#adPasteNo').onclick = done;
    $('#adPasteGo').onclick = async () => {
      let t = '';
      try { t = await navigator.clipboard.readText(); } catch (e) { t = ''; }
      done();
      if (this.pick(t)) { this.ask(t); return; }
      // no clipboard access (or nothing copied yet): the addon manager's link box, ready for a paste
      if ($('#addons').hidden) $('#openAddons').click();
      setTimeout(() => { const f = $('#addonUrl'); if (f) f.focus(); }, 120);
      toast(t ? 'The copied text is not an addon link. Paste the manifest link here.' : 'Paste the addon link here.', 'info', 5000);
    };
    setTimeout(() => { if (el.isConnected) done(); }, 60000);
  },
  init() {
    window.MKInstall = (u) => this.ask(u);
    // #install=<link> (the Android app opens MKCinema this way from a stremio:// Install button)
    const fromHash = () => {
      const m = location.hash.match(/[#&]install=([^&]+)/); if (!m) return;
      let u = ''; try { u = decodeURIComponent(m[1]); } catch (e) { u = m[1]; }
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(() => this.ask(u), document.body.classList.contains('intro-on') ? 2500 : 300);
    };
    fromHash(); addEventListener('hashchange', fromHash);
    // a setup page opened from MKCinema: remember it, and offer the copied link on return
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
      if (/\/configure\b/i.test(a.getAttribute('href') || '') && a.target === '_blank') this.away = Date.now();
    }, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !this.away || Date.now() - this.away > 30 * 60e3) return;
      this.away = 0; setTimeout(() => this.bar(), 400);
    });
  },
};
AddonLink.init();
