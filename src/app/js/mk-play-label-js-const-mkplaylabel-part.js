
const MkPlayLabel = {
  part(key) { const p = CFG.resume && key && S.progress[key]; return p && p.t > 20 && p.d > 0 && p.t < p.d * .95 ? p : null; },
  state() {
    const m = D.meta; if (!m) return null;
    if (m.type !== 'series') { const p = this.part(m.id); return { main: p ? 'Resume' : 'Play', sub: p ? fmtTime(p.t) : 'Best stream' }; }
    let v = D.video;
    if (!v && Array.isArray(m.videos)) {
      const eps = orderedEpisodes(m), rp = continueItems().find((x) => x.metaId === m.id);
      v = (rp && m.videos.find((x) => videoIdFor(m, x) === rp.videoId)) || eps.find((x) => !S.progress[videoIdFor(m, x)] && !isWatched(videoIdFor(m, x))) || eps[0];
    }
    if (!v) return { main: 'Play', sub: 'Best stream' };
    const p = this.part(videoIdFor(m, v)) || this.part(v.id), e = v.episode != null ? v.episode : v.number, tag = e != null ? `S${seasonNo(v)} E${e}` : '';
    return { main: p ? 'Resume' : 'Play', sub: [tag, p ? fmtTime(p.t) : ''].filter(Boolean).join(' · ') || 'Best stream' };
  },
  draw() {
    const l = document.querySelector('#dSmart .sp-l'); if (!l) return; const st = this.state(); if (!st) return;
    const sm = l.querySelector('small'); let n = l.firstChild; if (!n || n.nodeType !== 3) { n = document.createTextNode(''); l.insertBefore(n, l.firstChild); }
    if (l.dataset.mkMain !== st.main) { n.nodeValue = st.main; l.dataset.mkMain = st.main; }
    if (sm && l.dataset.mkSub !== st.sub) { sm.textContent = st.sub; l.dataset.mkSub = st.sub; }
  },
  init() {
    const rd = renderDetail; renderDetail = function () { const r = rd.apply(this, arguments); try { MkPlayLabel.draw(); } catch (e) { /* label only */ } return r; };
  },
};
try { MkPlayLabel.init(); } catch (e) { console.warn('play label:', e.message); }
