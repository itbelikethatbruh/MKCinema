/* ---------------- 2.9.3 Split Screen from a film page ----------------
   Split Screen was only reachable from Live TV and the player's menu. A chip at the end of a film's source filters
   puts the best source that plays in the app into a Split Screen tile; Split Screen's own picker adds the rest. */
{
  const panel = renderStreamsPanel;
  renderStreamsPanel = function (...a) {
    const r = panel.apply(this, a);
    const box = $('#dStreams'), chips = box && $('.chips', box);
    if (!chips || $('#dSplit', box) || typeof Split === 'undefined') return r;
    const ok = (s) => s && s._tel && s._tel.webReady && /^https?:/i.test(s.url || '');
    if (!(D.streams || []).some(ok)) return r;
    chips.insertAdjacentHTML('beforeend', '<button class="chip" type="button" data-nav id="dSplit"><i data-lucide="layout-grid"></i>Split Screen</button>');
    $('#dSplit', box).onclick = () => {
      const list = visibleStreams(D.streams).filter(ok), s = pickBest(list) || list[0]; if (!s) return;
      const m = D.meta || {}, v = D.video;
      Split.open({ name: v ? `${m.name || ''} · S${v.season} E${v.episode}` : m.name || 'Stream', url: s.url, headers: s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request });
    };
    icons();
    return r;
  };
}
