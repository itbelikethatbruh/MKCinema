
'use strict';
/* 2.60.2 Quiet sign-in sync notice: a tap-through pill, not a toast. */
(() => {
  if (typeof toast !== 'function') return;
  const st = document.createElement('style');
  st.textContent = '.mk-qs{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:40;pointer-events:none;padding:7px 12px;border-radius:999px;font-size:calc(12px * var(--ts,1));line-height:1.2;background:rgba(20,20,22,.82);color:rgba(244,241,234,.9);border:1px solid rgba(255,255,255,.1);opacity:0;transform:translateY(6px);transition:opacity .25s ease,transform .25s ease}.mk-qs.on{opacity:1;transform:none}@media (prefers-reduced-motion:reduce){.mk-qs{transition:none;transform:none}}body.mk-phone .mk-qs,html.tv .mk-qs{bottom:calc(84px + env(safe-area-inset-bottom,0px))}';
  document.head.appendChild(st);
  let el = null, t1 = 0, t2 = 0;
  const quiet = (msg) => {
    if (!document.getElementById('player') || !document.getElementById('player').hidden) return;
    if (!el) { el = document.createElement('div'); el.className = 'mk-qs'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    clearTimeout(t1); clearTimeout(t2); el.textContent = msg;
    requestAnimationFrame(() => el.classList.add('on'));
    t1 = setTimeout(() => el.classList.remove('on'), 2000);
  };
  const t0 = toast;
  toast = function (msg) {
    if (/^Synced your (library and )?settings/i.test(String(msg))) { quiet('Synced from your account'); return; }
    return t0.apply(this, arguments);
  };
})();
