
/* 2.88.1 quick start. Fitting the top menu re-measured the whole page every time it was asked to, six or more times
   while the app starts. Now it only measures again when something that can change the fit has changed. */
(() => {
  if (typeof DockFit === 'undefined' || DockFit.run._qs) return;
  const run = DockFit.run; let last = '';
  const key = () => {
    const de = document.documentElement, b = document.body, d = document.querySelector('.dock'), t = document.getElementById('tabs');
    let faces = 0; try { document.fonts.forEach((f) => { if (f.status === 'loaded') faces++; }); } catch (e) { /* no font list */ }
    const on = t && t.querySelector('.on');
    return [innerWidth, innerHeight, de.className.replace(/\b(booting|mk-scrolling|mk-spot)\b/g, ''), de.dataset.look || '', de.style.cssText,
      b.className.replace(/\b(dk[123w]|ds-w|ds-nob|locked|layer-open|modal-open)\b/g, '').replace(/\s+/g, ' '),
      d ? d.getElementsByTagName('*').length + ':' + d.textContent.length : '', on ? on.dataset.view || on.textContent : '', faces].join('|');
  };
  DockFit.run = function () {
    let k = ''; try { k = key(); } catch (e) { k = ''; }
    if (k && k === last) return undefined;
    last = k; return run.apply(this, arguments);
  };
  DockFit.run._qs = true; DockFit.run._ds = true;
})();
