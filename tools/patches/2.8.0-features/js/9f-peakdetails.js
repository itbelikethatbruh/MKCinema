/* ---------------- 2.9.4 Peak Cinema: details without leaving the surfer ----------------
   Details (button, or Menu / i on the remote) pauses the scene and slides in a panel with the film's story, cast,
   running time and ratings. Back to the scene resumes exactly where it was; Keep watching and From the start open the
   full film; Full page opens the normal title page. Back on the remote closes the panel, not Peak Cinema. */
if (typeof Peak !== 'undefined') {
  const PD = {
    el: null, resume: false, tok: 0,
    isOpen() { return !!(this.el && !this.el.hidden); },
    build() {
      if (this.el) return this.el;
      const el = this.el = document.createElement('div'); el.className = 'pk-det'; el.id = 'pkDet'; el.hidden = true;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Details');
      Peak.el.appendChild(el); return el;
    },
    paint(m, full) {
      const el = this.el, c = Peak.cur, logo = metaLogo(m);
      const mins = parseInt(m.runtime, 10) || (c && c.d ? Math.round(c.d / 60) : 0);
      const run = mins ? `${Math.floor(mins / 60) ? `${Math.floor(mins / 60)} h ` : ''}${mins % 60 ? `${mins % 60} min` : ''}`.trim() : '';
      const cast = (Array.isArray(m.cast) ? m.cast : []).slice(0, 6).join(', ');
      const dir = (Array.isArray(m.director) ? m.director : m.director ? [m.director] : []).slice(0, 2).join(', ');
      const desc = m.description || (full ? '' : 'Loading the story…');
      el.innerHTML = `<div class="pk-det-in">
        <div class="pk-det-head">${logo ? imgTag(logo, m.name, m.id, { nofb: true, cls: 'pk-det-logo', lazy: false }) : ''}<h2 class="pk-det-t" data-logo-alt ${logo ? 'hidden' : ''}>${esc(m.name || '')}</h2></div>
        <div class="metaline">${[m.imdbRating ? `<span class="imdb ${rateTier(m.imdbRating)}"><b>IMDb</b>${esc(m.imdbRating)}</span>` : '', yearOf(m) ? `<span>${esc(yearOf(m))}</span>` : '', run ? `<span>${esc(run)}</span>` : '', genresOf(m).slice(0, 3).map(esc).join(' · ')].filter(Boolean).join('')}</div>
        <p class="pk-det-desc">${esc(desc)}</p>
        ${cast || dir ? `<dl class="pk-det-dl">${dir ? `<div><dt>Director</dt><dd>${esc(dir)}</dd></div>` : ''}${cast ? `<div><dt>Starring</dt><dd>${esc(cast)}</dd></div>` : ''}</dl>` : ''}
        <div class="pk-det-acts">
          <button class="btn btn-bolt" type="button" data-nav data-pd="back"><i data-lucide="arrow-left"></i>Back to the scene</button>
          <button class="btn btn-ghost" type="button" data-nav data-pd="keep"><i data-lucide="play"></i>Keep watching</button>
          <button class="btn btn-ghost" type="button" data-nav data-pd="start"><i data-lucide="rotate-ccw"></i>From the start</button>
          <button class="btn btn-ghost" type="button" data-nav data-pd="page"><i data-lucide="panel-right-open"></i>Full page</button>
        </div></div>`;
      icons();
      $$('[data-pd]', el).forEach((b) => b.addEventListener('click', () => {
        const a = b.dataset.pd;
        if (a === 'back') this.close();
        else if (a === 'keep') { this.close(true); Peak.keep(false); }
        else if (a === 'start') { this.close(true); Peak.keep(true); }
        else if (a === 'page') { const mm = (Peak.cur || {}).meta; this.close(true); Peak.close(); if (mm) openDetail(mm); }
      }));
    },
    async open() {
      const c = Peak.cur; if (!c) return;
      this.build(); const tok = ++this.tok;
      this.resume = !c.v.paused; try { c.v.pause(); } catch (e) { /* none */ }
      this.paint(c.meta, false); this.el.hidden = false; Peak.el.classList.add('pk-det-on'); Peak.wake(true);
      requestAnimationFrame(() => this.el.classList.add('on'));
      if (IS_TV) Nav.restore(true); else { const b = $('[data-pd="back"]', this.el); if (b) b.focus(); }
      // the catalog entry is thin (often no cast or running time): fetch the full one, once per film
      if (!c.meta._pkFull && c.meta.id && c.meta.type) {
        try {
          const full = await engine.fetchMeta(c.meta.type, c.meta.id);
          if (full && tok === this.tok && this.isOpen() && Peak.cur === c) { c.meta = Object.assign({}, c.meta, full, { _pkFull: true }); const f = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.pd : null; this.paint(c.meta, true); if (f) { const b = $(`[data-pd="${f}"]`, this.el); if (b) (IS_TV ? Nav.focus(b, true) : b.focus()); } }
        } catch (e) { /* keep the thin one */ }
      }
      if (this.isOpen() && !c.meta.description) { const d = $('.pk-det-desc', this.el); if (d) d.textContent = ''; }
    },
    close(leaving) {
      if (!this.isOpen()) return;
      this.tok++; this.el.classList.remove('on'); this.el.hidden = true; Peak.el.classList.remove('pk-det-on');
      const c = Peak.cur;
      if (!leaving && c && this.resume) c.v.play().catch(() => {});
      if (!leaving) { Peak.wake(); if (IS_TV) { Nav.restore(true); const d = $('#pkDetails'); if (d) Nav.focus(d, true); } }
    },
  };
  Peak.details = PD;
  const bind = () => { const b = Peak.el && $('#pkDetails', Peak.el); if (b && !b._pd) { b._pd = true; b.onclick = () => PD.open(); } };
  bind();
  const init = Peak.init; if (init) Peak.init = function (...a) { const r = init.apply(this, a); bind(); return r; };
  const open = Peak.open; if (open) Peak.open = function (...a) { bind(); return open.apply(this, a); };
  // leaving Peak Cinema, or a new scene, closes the panel
  const pclose = Peak.close; Peak.close = function (...a) { PD.close(true); return pclose.apply(this, a); };
  const adv = Peak.advance; Peak.advance = function (...a) { if (PD.isOpen()) PD.close(true); return adv.apply(this, a); };
  // keep the controls up while the panel is open
  const wake = Peak.wake; Peak.wake = function (stay) { return wake.call(this, stay || PD.isOpen()); };
  // Menu (the app maps it to "o") or i opens it; while it is open, keys belong to the panel
  const key = Peak.key; Peak.key = function (e) {
    if (!this.on || !$('#player').hidden) return key.call(this, e);
    const k = e.key, tag = (e.target && e.target.tagName) || '';
    if (PD.isOpen()) { if (k === 'o' || k === 'O' || k === 'i' || k === 'I' || k === 'Info' || e.keyCode === 457) { e.preventDefault(); e.stopImmediatePropagation(); PD.close(); } return; }
    if (!/INPUT|TEXTAREA|SELECT/.test(tag) && this.cur && (k === 'o' || k === 'O' || k === 'i' || k === 'I' || k === 'Info' || e.keyCode === 457)) { e.preventDefault(); e.stopImmediatePropagation(); PD.open(); return; }
    return key.call(this, e);
  };
  const pb = back; back = function (...a) { if (PD.isOpen() && Peak.on && $('#player').hidden) { PD.close(); return; } return pb.apply(this, a); };
  const root = Nav.root.bind(Nav); Nav.root = function (...a) { if (PD.isOpen() && Peak.on && $('#player').hidden) return PD.el; return root(...a); };
  const start = Nav.start.bind(Nav); Nav.start = function (r, list) { if (r === PD.el) return list.find((x) => x.dataset.pd === 'back') || list[0]; return start(r, list); };
}
