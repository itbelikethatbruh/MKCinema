
/* 2.73.2 Light looks in Settings › Appearance: "Dark, Daylight or Linen", right under the colour wheel */
(() => {
  try {
    const ap = typeof secById === 'function' && secById('appearance'); if (!ap) return;
    ap.intro = 'Pick where the menu sits, one colour for the whole app, and a dark or light look. Your choice syncs to your account.';
    const TONES = [['dark', 'Dark'], ['daylight', 'Daylight'], ['linen', 'Linen']];
    const cur = () => (CFG.look === 'daylight' || CFG.look === 'linen' ? CFG.look : 'dark');
    const html = () => {
      const c = cur();
      return `<div class="set-row"><div><b>Dark or light</b><small>The dark look keeps the posters up front. Daylight and Linen are light looks for bright rooms; films and trailers still play on black.${IS_TV && c !== 'dark' ? '</small><small>If the text on your TV turns white with a black outline, switch off High contrast text in the TV’s accessibility settings.' : ''}</small></div><div class="set-ctl"><div class="segc" id="lookTone" role="radiogroup" aria-label="Dark or light">${TONES.map(([v, l]) => `<button type="button" role="radio" data-nav data-tone="${v}" aria-checked="${v === c}" class="${v === c ? 'on' : ''}"${v === 'dark' ? '' : ' translate="no"'}>${l}</button>`).join('')}</div></div></div>`;
    };
    const rows = ap.rows;
    ap.rows = () => { const r = rows(), c = r.findIndex((d) => d.group === 'Theme'), t = r.findIndex((d) => d.group === 'Text'); r.splice(c >= 0 ? c + 2 : t >= 0 ? t : r.length, 0, { html }); return r; };
    const bind = ap.bind;
    ap.bind = function () {
      const out = bind ? bind.apply(this, arguments) : undefined;
      $$('#lookTone [data-tone]').forEach((b) => b.addEventListener('click', () => {
        const v = b.dataset.tone; if (v === cur()) return;
        setCfg('look', v === 'dark' ? 'noir' : v); renderSettingsBody();
        const n = $(`#lookTone [data-tone="${v}"]`); if (n) { if (IS_TV && typeof Nav !== 'undefined' && Nav.focus) Nav.focus(n, true); else n.focus({ preventScroll: true }); }
      }));
      return out;
    };
  } catch (e) { console.warn('2.73.2 looks', e); }
})();
