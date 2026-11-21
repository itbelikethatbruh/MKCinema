
'use strict';
/* 2.84 Simple player. One place for each thing:
   - the bar keeps Play, skip, volume, time, and on the right: Share and screens, Audio & subtitles, Settings, Full screen
   - Share and screens (the old empty #dspPop slot, so Back, the TV remote and the auto-hide already know it)
     holds Send to TV, your phone, Watch party, Split Screen and Picture in picture
   - Settings has four tabs: Playback (speed, quality, timer, repeat), Picture, Sound, More (extras, this moment, info)
   - nothing is in two places: the language list lives only in Audio & subtitles
   New items added to #optMenu by later code land where PxMenu.tabify put them; add a rule in MkTidy.menu to move them. */
const MkTidy = {
  /* the bar buttons that move into Share and screens: [id, label, icon] */
  DEV: [['pTvCast', 'Send to TV', 'cast'], ['pCast', 'Your phone or remote', 'smartphone'], ['pParty', 'Watch party', 'users'], ['pSplit', 'Split Screen', 'layout-grid'], ['pPip', 'Picture in picture', 'picture-in-picture-2'], ['pMini', 'Keep playing in a corner', 'minimize-2']],
  init() {
    const subs = $('#pSubs'), opts = $('#pOpts'); if (!subs || !opts) return;
    document.documentElement.classList.add('mk-tidy');
    const b = document.createElement('button'); b.className = 'ibtn mk-td-lb'; b.id = 'pDev'; b.type = 'button';
    b.title = 'Share and other screens'; b.setAttribute('aria-label', 'Share and other screens');
    b.innerHTML = '<i data-lucide="cast"></i><span class="mk-td-l">Share</span>';
    subs.before(b); b.onclick = () => this.dev();
    subs.classList.add('mk-td-lb'); subs.insertAdjacentHTML('beforeend', '<span class="mk-td-l">Audio &amp; subtitles</span>');
    opts.classList.add('mk-td-lb'); opts.insertAdjacentHTML('beforeend', '<span class="mk-td-l">Settings</span>');
    opts.title = 'Settings: speed, picture, sound and more (O)'; opts.setAttribute('aria-label', 'Settings');
    this.DEV.forEach(([id]) => { const e = $(`#${id}`); if (e) e.classList.add('mk-td-dev'); });
    const sp = $('#pxSpeed'); if (sp) sp.classList.add('mk-td-dev'); // speed is the first row of Settings › Playback
    const p = $('#dspPop'); p.classList.add('mk-td-pop'); p.setAttribute('role', 'menu'); p.setAttribute('aria-label', 'Share and other screens');
    // one panel at a time: a menu opening closes X-Ray and the other menus
    const mo = new MutationObserver((recs) => recs.forEach((r) => {
      const m = r.target; if (m.hidden) return;
      const x = $('#xray'); if (x && !x.hidden) { const c = $('[data-xclose], .x-close, [aria-label="Close"]', x); if (c) c.click(); if (!x.hidden) x.hidden = true; }
      if (m.id !== 'dspPop') $('#dspPop').hidden = true;
    }));
    ['subMenu', 'optMenu', 'dspPop'].forEach((id) => mo.observe($(`#${id}`), { attributes: true, attributeFilter: ['hidden'] }));
    // a tap outside the Share menu closes it (the stage tap handler only knows the other two menus)
    $('#player').addEventListener('click', (e) => {
      const p = $('#dspPop'); if (p.hidden || p.contains(e.target) || e.target.closest('#pDev')) return;
      p.hidden = true; e.stopPropagation(); e.preventDefault(); wakeHud();
    }, true);
    icons();
  },
  shows(id) { // would this bar button show without the tidy rule? (phones, TVs and hosts hide some)
    const e = $(`#${id}`); if (!e || e.hidden) return false;
    e.classList.remove('mk-td-dev'); const ok = getComputedStyle(e).display !== 'none'; e.classList.add('mk-td-dev');
    return ok;
  },
  dev() {
    const p = $('#dspPop');
    if (!p.hidden) { p.hidden = true; return; }
    $('#subMenu').hidden = true; $('#optMenu').hidden = true; closeDrawers();
    const rows = this.DEV.filter(([id]) => this.shows(id) || (id === 'pParty' && typeof Party !== 'undefined') || (id === 'pCast' && !IS_TV && !document.body.classList.contains('mk-phone') && $('#pCast')));
    p.innerHTML = `<h5>Share and other screens</h5>${rows.map(([id, l, i]) => `<button type="button" data-tdev="${id}"><i data-lucide="${i}"></i><span>${esc(l)}</span></button>`).join('')}`;
    $$('[data-tdev]', p).forEach((r) => r.addEventListener('click', (e) => {
      e.stopPropagation(); p.hidden = true; const id = r.dataset.tdev;
      if (id === 'pParty') { Party.openPanel(); return; }
      if (id === 'pCast' && typeof Cast !== 'undefined' && Cast.open) { Cast.open(); return; }
      const t = $(`#${id}`); if (t) t.click();
    }));
    p.hidden = false; icons(); wakeHud(true);
    if (IS_TV) setTimeout(() => { const f = $('button', p); if (f) Nav.focus(f, true); }, 40);
  },
  /* group = a heading and the rows under it, or a tidied section */
  group(h) { const out = [h]; let n = h.nextElementSibling; while (n && n.tagName !== 'H5') { out.push(n); n = n.nextElementSibling; } return out; },
  head(pane, re) { return $$('h5', pane).find((h) => re.test(h.textContent.trim())); },
  h5(t) { const h = document.createElement('h5'); h.textContent = t; return h; },
  menu() {
    const m = $('#optMenu'); if (!m || !$('.px-tabs', m)) return;
    const pane = (k) => $(`.px-pane[data-pane="${k}"]`, m);
    let play = pane('play'), more = pane('more');
    const ensure = (k, label) => { let p = pane(k); if (p) return p; p = document.createElement('div'); p.className = 'px-pane'; p.dataset.pane = k; p.hidden = PxMenu.tab !== k; m.appendChild(p);
      const t = $('.px-tabs', m), b = document.createElement('button'); b.type = 'button'; b.dataset.pxtab = k; b.setAttribute('role', 'tab'); b.textContent = label; b.className = PxMenu.tab === k ? 'on' : ''; b.setAttribute('aria-selected', String(PxMenu.tab === k));
      b.addEventListener('click', (e) => { e.stopPropagation(); PxMenu.tab = k; PxMenu.show(); });
      const after = { play: null, pic: 'play', audio: 'pic', more: 'audio' }[k], a = after && $(`[data-pxtab="${after}"]`, t), x = $('.px-x', t);
      if (a) a.after(b); else if (k === 'play') t.prepend(b); else if (x) x.before(b); else t.appendChild(b);
      return p; };
    play = ensure('play', 'Playback'); more = ensure('more', 'More');
    // 1 Playback: speed and quality first, then the sleep timer and A-B repeat; channel and TV hand-back rows on top
    const top = $$('[data-f50="chnext"], [data-f50="chguide"], [data-f50="tvback"]', m);
    const speed = this.head(m, /^speed$/i), qual = this.head(m, /^quality$/i);
    const sleep = $('.tl-sleep', m), ab = $('[data-tl="ab"]', m);
    const frag = document.createDocumentFragment();
    top.forEach((e) => frag.appendChild(e));
    if (speed) this.group(speed).forEach((e) => frag.appendChild(e));
    if (qual) this.group(qual).forEach((e) => frag.appendChild(e));
    if (sleep || ab) { frag.appendChild(this.h5('Timer and repeat')); if (sleep) frag.appendChild(sleep); if (ab) frag.appendChild(ab); }
    play.prepend(frag);
    // 2 More: Watch your way extras, then This moment, then Info, then other apps
    const wyw = this.head(m, /^watch your way$/i), sub2 = $('[data-tl="sub2"]', m), sub2l = $('.tl-sub2', m);
    const moment = this.head(m, /^info · this moment$/i), info = this.head(m, /^info$/i), oth = this.head(m, /^open in another app$/i);
    const mf = document.createDocumentFragment();
    if (wyw) this.group(wyw).forEach((e) => mf.appendChild(e)); else if (sub2) mf.appendChild(this.h5('Watch your way'));
    if (sub2) { mf.appendChild(sub2); if (sub2l) mf.appendChild(sub2l); }
    const mh = moment || this.h5('This moment'); mh.textContent = 'This moment';
    const mrows = moment ? this.group(moment) : [mh];
    $$('[data-pp="mark"], [data-tl="still"]', m).forEach((e) => mrows.push(e));
    if (mrows.length > 1) mrows.forEach((e) => mf.appendChild(e));
    if (info) this.group(info).forEach((e) => mf.appendChild(e));
    const rest = this.head(m, /^more$/i); if (rest) this.group(rest).forEach((e) => mf.appendChild(e));
    if (oth) this.group(oth).forEach((e) => mf.appendChild(e));
    more.prepend(mf);
    // 3 rows that now live in Share and screens, and the Tools heading they leave empty
    $$('[data-tl="tv"], [data-tl="split"], [data-pp="party"], [data-pp="cast"]', m).forEach((e) => e.remove());
    // 4 Sound: the language list is in Audio & subtitles; Sound keeps one row that opens it
    const snd = pane('audio');
    if (snd) {
      const al = this.head(snd, /^audio language/i);
      if (al) { const sec = al.closest('.at-sec'); (sec ? [sec] : this.group(al)).forEach((e) => e.remove()); }
      if (!$('[data-tdav]', snd)) {
        snd.insertAdjacentHTML('afterbegin', '<button type="button" class="mk-td-go" data-tdav><i data-lucide="languages"></i><span>Audio language and subtitles</span><i data-lucide="chevron-right"></i></button>');
        $('[data-tdav]', snd).onclick = (e) => { e.stopPropagation(); m.hidden = true; $('#pSubs').click(); };
      }
    }
    const tab = $('[data-pxtab="audio"]', m); if (tab) tab.textContent = 'Sound';
    // 5 empty headings and panes go
    $$('.px-pane', m).forEach((p) => {
      $$('h5', p).forEach((h) => { const n = h.nextElementSibling; if (!n || n.tagName === 'H5') h.remove(); });
      const t = $(`.px-tabs [data-pxtab="${p.dataset.pane}"]`, m);
      if (!p.children.length) { p.remove(); if (t) t.remove(); }
    });
    if (!$(`.px-pane[data-pane="${PxMenu.tab}"]`, m)) { PxMenu.tab = 'play'; PxMenu.show(); }
    icons();
  },
};
window.MkTidy = MkTidy;
MkTidy.init();
