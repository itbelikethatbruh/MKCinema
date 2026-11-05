/* ---------------- 2.11.1 TV: no surprise keyboards, no focus jumping in Settings ----------------
   Reported on Reddit (Android TV): "the focus jumping around and also the constant keyboard popups".
   1. Every text box on TV stays closed until you press OK on it (TvType.guard, the 2.9.5 Addon Directory fix,
      now on every input): moving the remote past an API key field no longer opens the keyboard.
   2. Settings has two columns. The remote now stays in the column it is in: Up and Down never spill from the
      options into the section list, Left from the options goes to the section you are in, and Right from the
      section list goes into its options (not to the close button). */
(() => {
  if (!IS_TV || typeof TvType === 'undefined') return;
  const TEXTY = /^(text|search|password|url|email|number|tel|)$/i;
  const texty = (el) => el && ((el.tagName === 'INPUT' && TEXTY.test(el.getAttribute('type') || '')) || el.tagName === 'TEXTAREA') && !el.disabled;
  // guard before the element takes focus (Nav.focus), and as a backstop for anything focused another way
  const f = Nav.focus.bind(Nav);
  Nav.focus = function (el, fast) { if (texty(el)) TvType.guard(el); return f(el, fast); };
  document.addEventListener('focusin', (e) => { if (texty(e.target) && !e.target._tvType) { TvType.guard(e.target); } }, true);

  const mv = Nav.move.bind(Nav);
  const items = (box) => $$('[data-nav], button, input, select, textarea, [tabindex]', box).filter((x) => !x.disabled && !x.closest('[hidden]') && x.offsetParent !== null && x.getAttribute('tabindex') !== '-1');
  Nav.move = function (dir, fast) {
    const root = Nav.root(), a = document.activeElement;
    if (!root || root.id !== 'settings' || !a || a === document.body) return mv(dir, fast);
    const nav = $('#setNav'), body = $('#setBody'); if (!nav || !body) return mv(dir, fast);
    const inNav = nav.contains(a), inBody = body.contains(a);
    if (!inNav && !inBody) return mv(dir, fast);
    if (inNav && dir === 'right') { const m = Nav.mem.get(body); const t = m && m.isConnected && body.contains(m) ? m : items(body)[0]; if (t) { Nav.focus(t, fast); return; } }
    if (inBody && dir === 'left') {
      const r = mv(dir, fast); const now = document.activeElement;
      if (now !== a && body.contains(now)) return r;   // a choice to the left inside the same option row
      Nav.mem.set(body, a); const on = $('#setNav .on') || items(nav)[0]; if (on) Nav.focus(on, fast); return;
    }
    if (dir === 'up' || dir === 'down') {
      const pane = inNav ? nav : body, r = mv(dir, fast), now = document.activeElement;
      if (now !== a && !pane.contains(now)) {
        // spilled into the other column (or the close button): stay in this column instead
        Nav.focus(a, true);
        if (inBody) { const sc = a.closest('.set-body, .layer-ov') || body; sc.scrollBy({ top: dir === 'down' ? 200 : -200, behavior: 'smooth' }); }
        return;
      }
      if (inBody) Nav.mem.set(body, now);
      return r;
    }
    return mv(dir, fast);
  };
})();
