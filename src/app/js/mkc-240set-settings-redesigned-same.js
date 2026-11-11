
/* ---------------- 2.40.0 Settings, redesigned ----------------
   Same sections, same rows, same behaviour; a calmer, richer layout around them.
   - Search across every setting (not on TVs, where typing is slow): type a word, pick a result, and the section opens
     with that row lit for a moment.
   - Groups get a quiet tint of their own, the chosen section a champagne marker, and each page a large title with the
     group it belongs to.
   - Long explanations show two lines; More (or focusing the row with a keyboard) shows the rest. TVs always show all.
   - Help and legal pages sit together at the end of the list. A section without a group lands in Other, as before. */
const SetX = {
  HUE: { '': [40, 38], You: [38, 40], 'Look and feel': [332, 32], Watching: [212, 36], Connected: [152, 30], More: [262, 28], 'Help and legal': [24, 40], Other: [0, 0] },
  HELP: ['help', 'legal', 'privacy', 'terms', 'troubleshoot', 'whatsnew', 'about'],
  idx: null, hit: null,
  groups() {
    // Help, legal and About read as one block at the end of the list
    let g = SET_GROUPS.find(([n]) => n === 'Help and legal');
    if (!g) { g = ['Help and legal', []]; SET_GROUPS.push(g); }
    for (const id of this.HELP) {
      if (!secById(id)) continue;
      SET_GROUPS.forEach((x) => { if (x !== g) { const i = x[1].indexOf(id); if (i >= 0) x[1].splice(i, 1); } });
      if (!g[1].includes(id)) g[1].push(id);
    }
    g[1].sort((a, b) => this.HELP.indexOf(a) - this.HELP.indexOf(b));
    const used = new Set(SET_GROUPS.flatMap(([, ids]) => ids));
    const out = SET_GROUPS.map(([n, ids]) => [n, ids.map(secById).filter(Boolean)]).filter(([, l]) => l.length);
    const rest = SECTIONS.filter((s) => !used.has(s.id)); if (rest.length) out.push(['Other', rest]);
    return out;
  },
  groupOf(id) { const g = SET_GROUPS.find(([, ids]) => ids.includes(id)); return g ? g[0] : 'Other'; },
  hue(name) { const h = this.HUE[name] || this.HUE.Other; return `--gh:${h[0]};--gs:${h[1]}%`; },
  tr(t) { try { return (typeof I18N !== 'undefined' && I18N.map && I18N.map.get(t)) || ''; } catch { return ''; } },
  plain(h) { return String(h || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim(); },
  index() {
    if (this.idx) return this.idx;
    const out = [];
    for (const sec of SECTIONS) {
      const sl = sec.label, blurb = SET_BLURB[sec.id] || '';
      out.push({ sec: sec.id, key: '', icon: sec.icon, label: sl, where: this.groupOf(sec.id) || 'Settings', hay: [sl, this.tr(sl), blurb, this.tr(blurb), sec.intro, this.tr(sec.intro)].join(' ').toLowerCase() });
      let rows = []; try { rows = secRows(sec) || []; } catch { rows = []; }
      for (const d of rows) {
        if (!d || !d.key || !d.label || d.html) continue;
        const help = this.plain(d.help);
        out.push({ sec: sec.id, key: d.key, icon: sec.icon, label: d.label, where: sl, hay: [d.label, this.tr(d.label), help, this.tr(d.help || ''), sl].join(' ').toLowerCase() });
      }
    }
    return (this.idx = out);
  },
  find(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return [];
    const res = [];
    for (const it of this.index()) {
      if (!words.every((w) => it.hay.includes(w))) continue;
      const l = (it.label + ' ' + this.tr(it.label)).toLowerCase();
      const score = (l.startsWith(words[0]) ? 0 : words.every((w) => l.includes(w)) ? 1 : 2) + (it.key ? 0.5 : 0);
      res.push([score, it]);
    }
    return res.sort((a, b) => a[0] - b[0]).slice(0, 40).map((x) => x[1]);
  },
  results(q) {
    const nav = $('#setNav'), box = $('#setFindRes'); if (!nav || !box) return;
    const on = !!q.trim(); nav.classList.toggle('finding', on); box.hidden = !on;
    if (!on) { box.innerHTML = ''; return; }
    const list = this.find(q);
    box.innerHTML = list.length
      ? `<div class="sn-list">${list.map((it, i) => `<button type="button" data-nav class="sn-hit" data-hit="${i}" style="${this.hue(this.groupOf(it.sec))}"><span class="sn-ic"><i data-lucide="${it.icon}"></i></span><span class="sn-t"><b>${esc(it.label)}</b><small>${esc(it.key ? it.where : 'Section')}</small></span><i data-lucide="chevron-right" class="sn-go"></i></button>`).join('')}</div>`
      : '<p class="sn-none">No setting matches that.</p>';
    $$('[data-hit]', box).forEach((b) => b.addEventListener('click', () => this.go(list[Number(b.dataset.hit)])));
    icons();
  },
  go(it) {
    if (!it) return;
    this.hit = it.key || null;
    setSection = it.sec; setPhoneHome = false; markSettingsNav(); renderSettingsBody(); $('#setBody').scrollTop = 0;
  },
  // after a search pick: bring the row into view and light it once
  showHit() {
    const k = this.hit; this.hit = null; if (!k) return;
    const el = $(`#set-${CSS.escape(k)}`), row = el && (el.closest('.set-row') || el);
    if (!row) return;
    const body = $('#setBody');
    requestAnimationFrame(() => {
      const r = row.getBoundingClientRect(), b = body.getBoundingClientRect();
      body.scrollTop += r.top - b.top - (b.height - r.height) / 2;
      row.classList.remove('sr-hit'); void row.offsetWidth; row.classList.add('sr-hit');
      setTimeout(() => row.classList.remove('sr-hit'), 1900);
      if (!TOUCH_UI && el.focus && !/^(INPUT|TEXTAREA)$/.test(el.tagName)) el.focus({ preventScroll: true });
    });
  },
  enhance(sec, rows) {
    const body = $('#setBody'), g = this.groupOf(sec.id);
    const m = $('#settings .modal'); if (m) m.setAttribute('style', this.hue(g));
    // the group name above the title
    const hd = $('.set-hd > div', body);
    if (hd && g && !$('.set-eb', hd)) hd.insertAdjacentHTML('afterbegin', `<span class="set-eb">${esc(g || 'Settings')}</span>`);
    // long explanations: two lines and More (TVs show everything)
    for (const d of rows) {
      if (!d || !d.key || !d.help || d.html) continue;
      const el = $(`#set-${CSS.escape(d.key)}`), row = el && el.closest('.set-row'); if (!row) continue;
      row.classList.add('sr-h');
    }
    if (!IS_TV) {
      const clipped = $$('.sr-h > div:first-child > small', body).filter((s) => s.scrollHeight > s.clientHeight + 2);
      clipped.forEach((s) => {
        const row = s.closest('.sr-h'); row.classList.add('sr-clip');
        s.insertAdjacentHTML('afterend', '<button type="button" class="sr-more" tabindex="-1" aria-hidden="true">More</button>');
        const t = () => { const o = row.classList.toggle('open'); const b = $('.sr-more', row); if (b) b.textContent = o ? 'Less' : 'More'; };
        s.addEventListener('click', (e) => { if (!e.target.closest('a')) t(); });
        $('.sr-more', row).addEventListener('click', t);
      });
    }
    // a row with only a switch keeps it beside the label on phones
    $$('.set-row', body).forEach((row) => { const c = row.querySelector(':scope > .set-ctl'); if (c && c.children.length === 1 && c.firstElementChild.classList.contains('switch')) row.classList.add('sr-sw'); });
    // sliders show how far along they are
    $$('input[type=range].rng', body).forEach((r) => {
      const f = () => { const lo = Number(r.min) || 0, hi = Number(r.max) || 100; r.style.setProperty('--p', ((Number(r.value) - lo) / ((hi - lo) || 1)).toFixed(3)); };
      f(); r.addEventListener('input', f);
    });
    SetTidy.polish();
    this.showHit();
  },
  init() {
    SET_BLURB.start = 'Players, addons and your first sources';
    renderSettingsNav = function () {
      SetX.idx = null;
      const groups = SetX.groups(), find = !IS_TV;
      $('#setNav').innerHTML = `<h2 id="setTitle">Settings</h2>${find ? '<label class="sn-search"><i data-lucide="search"></i><input id="setFind" type="search" placeholder="Search settings" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-label="Search settings"></label><div class="sn-results" id="setFindRes" hidden></div>' : ''}${groups.map(([g, list]) => `<div class="sn-group" style="${SetX.hue(g)}">${g ? `<div class="sn-h">${esc(g)}</div>` : ''}<div class="sn-list">${list.map((sec) => `<button type="button" data-nav data-sec="${sec.id}" class="${sec.id === setSection ? 'on' : ''}" aria-current="${sec.id === setSection ? 'page' : 'false'}"><span class="sn-ic"><i data-lucide="${sec.icon}"></i></span><span class="sn-t"><b>${esc(sec.label)}</b><small>${esc(SET_BLURB[sec.id] || '')}</small></span><i data-lucide="chevron-right" class="sn-go"></i></button>`).join('')}</div></div>`).join('')}<div class="sn-foot"><span class="sn-dot"></span><span>MKCinema ${esc(APP_VERSION)}</span><span class="sn-sep">·</span><span>Free forever</span></div>`;
      icons();
      $$('#setNav [data-sec]').forEach((b) => b.addEventListener('click', () => {
        const phone = SET_PHONE.matches;
        if (b.dataset.sec === setSection && !phone) return;
        setSection = b.dataset.sec; setPhoneHome = false; markSettingsNav(); renderSettingsBody(); $('#setBody').scrollTop = 0;
      }));
      const inp = $('#setFind');
      if (inp) {
        inp.addEventListener('input', () => SetX.results(inp.value));
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && inp.value) { e.preventDefault(); e.stopPropagation(); inp.value = ''; SetX.results(''); }
          else if (e.key === 'Enter') { e.preventDefault(); const f = $('#setFindRes [data-hit]'); if (f) f.click(); }
          else if (e.key === 'ArrowDown') { const f = $('#setFindRes [data-hit]'); if (f) { e.preventDefault(); e.stopPropagation(); f.focus(); } }
        });
      }
    };
    const prevBody = renderSettingsBody;
    renderSettingsBody = function () {
      const r = prevBody.apply(this, arguments);
      try { const sec = secById(setSection) || SECTIONS[0]; SetX.enhance(sec, secRows(sec)); } catch (e) { console.warn('settings layout', e); }
      return r;
    };
  },
};
SetX.init();
