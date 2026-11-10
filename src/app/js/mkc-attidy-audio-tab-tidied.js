
/* 2.60.1 Audio tab, tidied. After the menu has drawn and sorted itself into tabs, the Audio tab's pieces are put in one
   order and given one look. Nothing is added or removed, so every control keeps its own handler (they are moved, not copied). */
(() => {
  const KIND = [
    [/^audio( language)?$/i, 'lang', 0],
    [/^sound mode/i, 'mode', 1],
    [/^volume/i, 'vol', 2],
    [/^audio delay/i, 'delay', 4],
  ];
  const kindOf = (t) => { for (const [re, k, r] of KIND) if (re.test(t.split(' · ')[0].trim())) return [k, r]; return ['other', 3]; };
  const head = (el) => {
    const raw = el.textContent.replace(/\s+/g, ' ').trim(), i = raw.indexOf(' · ');
    let title = i < 0 ? raw : raw.slice(0, i), state = i < 0 ? '' : raw.slice(i + 3);
    if (/^audio$/i.test(title)) title = 'Audio language';
    el.classList.add('at-h');
    el.innerHTML = `<span>${esc(title)}</span>${state ? `<em>${esc(state.charAt(0).toUpperCase() + state.slice(1))}</em>` : ''}`;
    return title;
  };
  function run() {
    const pane = $('#optMenu .px-pane[data-pane="audio"]'); if (!pane || pane.dataset.tidy) return;
    pane.dataset.tidy = '1';
    const secs = []; let cur = null;
    Array.from(pane.children).forEach((el) => {
      if (el.tagName === 'H5' || el.classList.contains('snd-h')) {
        const title = head(el), [k, r] = kindOf(title);
        cur = { k, r, i: secs.length, h: el, els: [] }; secs.push(cur); return;
      }
      if (!cur) { cur = { k: 'other', r: 3, i: secs.length, h: null, els: [] }; secs.push(cur); }
      cur.els.push(el);
    });
    if (secs.length < 2) return;
    secs.sort((a, b) => a.r - b.r || a.i - b.i);
    secs.forEach((s) => {
      const sec = document.createElement('section'); sec.className = `at-sec at-${s.k}`;
      if (s.h) sec.appendChild(s.h);
      s.els.forEach((e) => sec.appendChild(e));
      pane.appendChild(sec);
    });
  }
  const base = renderOptMenu;
  renderOptMenu = function () {
    const r = base.apply(this, arguments);
    try { run(); } catch (e) { console.error('audio tab tidy', e); }
    return r;
  };
})();
