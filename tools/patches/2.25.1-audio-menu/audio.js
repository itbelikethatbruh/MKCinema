/* ---------------- 2.25.1 Audio menu: no sound modes, no "Checking the languages" wait ----------------
   Night Mode / Vocal Clarity / Late-Night / 3D Spatial are gone. They needed Web Audio, which only reads a stream's
   sound when its host sends CORS headers. Picking one reloaded the stream through a CORS check or the proxy; on hosts
   that refuse, the film stalled, and because a video can never be detached from Web Audio again, the only way out was
   reloading the app. Volume boost and Listen on phone still use the graph (they ask first, per stream).
   Audio language now draws at once from what the source already says (flags, ENG / ITA / MULTi tags, the file name).
   The debrid / MKCinema server lookup still runs quietly behind it and only adds buttons if it finds switchable tracks. */
(() => {
  if (CFG.dsp && CFG.dsp !== 'flat') setCfg('dsp', 'flat');
  DSP.pick = function () { if (CFG.dsp !== 'flat') setCfg('dsp', 'flat'); };
  DSP.cycle = function () {};
  DSP.toggle = function () { if (typeof PxMenu !== 'undefined' && PxMenu.open) PxMenu.open('audio'); };
  DSP.started = function () { if (this.attached && this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); };
  // Android Chrome stalls a video whose sound runs through a paused audio graph: wake it whenever playback resumes
  video.addEventListener('playing', () => { if (DSP.attached && DSP.ctx && DSP.ctx.state !== 'running') DSP.ctx.resume().catch(() => {}); });
  DSP.blockedMsg = function (stream) {
    showMsg('This source can’t be boosted', 'Volume boost or Listen on phone is processing the sound in this session, and this host does not let browsers read its audio. Pick another source, or reload the app to play it normally. Your place is saved.',
      `<button class="btn btn-prime" type="button" data-act="next-src"><i data-lucide="skip-forward"></i>Try next source</button><button class="btn btn-ghost" type="button" id="dspOffReload"><i data-lucide="rotate-ccw"></i>Reload and play normally</button>${handoffHTML(stream)}`);
    $('#dspOffReload').onclick = () => { saveProgress(true); setCfg('dsp', 'flat'); location.reload(); };
  };

  const full = AudioLang.section.bind(AudioLang);
  AudioLang.section = function (s) {
    const st = this.info.get(s);
    if (!st) this.probe(s); // quiet: it only redraws the menu, and only adds buttons when it finds tracks that can be switched
    if (st && st.state === 'ok') return full(s);
    const head = '<h5>Audio language</h5>';
    let known = [], multi = false;
    try { const r = AudioPref.langs(s); known = [...r.langs].map((c) => langName(c)); multi = r.multi; } catch (e) { /* no tags */ }
    known = known.filter((x, i, a) => x && a.indexOf(x) === i);
    if (st && st.tracks && st.tracks.length === 1) known = [st.tracks[0].label];
    const row = (label, on) => `<button type="button" class="al-row${on ? ' on' : ''}" data-alinfo tabindex="-1"><i data-lucide="audio-lines"></i>${esc(label)}${on ? ' · playing' : ''}</button>`;
    if (known.length <= 1 && !multi) return `${head}${row(known[0] || 'Original audio', true)}`;
    let xp = null;
    try { xp = handoffUrl(s) ? (extPlayer() || playersHere().find((p) => !p.m3u)) : null; } catch (e) { xp = null; }
    const list = known.length ? known.map((l) => row(l, false)).join('') : row('Several languages (MULTi)', false);
    return `${head}${list}<p class="al-note">The file’s default track plays here. Browsers can’t switch tracks inside a file${xp ? `, so open it in ${esc(playerName(xp))} to pick another` : ''}.</p>${xp ? `<button type="button" data-alxp="${esc(xp.id)}"><i data-lucide="external-link"></i>Switch language in ${esc(playerName(xp))}</button>` : ''}`;
  };
  const base = renderOptMenu;
  renderOptMenu = function () {
    base(); const m = $('#optMenu'); if (!m) return;
    $$('[data-alinfo]', m).forEach((b) => { b.onclick = (e) => e.preventDefault(); });
    const x = $('[data-alxp]', m); if (x) x.onclick = () => { const t = $(`[data-xp="${x.dataset.alxp}"]`, m); if (t) t.click(); };
  };
})();
