// Now playing in the title: the window or browser tab shows what is playing, so it is easy to find on desktop.
const base = document.title;
MK.on('play', (p) => {
  const ep = p.season ? ` S${p.season}E${p.episode}` : '';
  document.title = `▶ ${p.name || 'Playing'}${ep} · MKCinema`;
});
MK.on('pause', () => { document.title = document.title.replace(/^▶/, '❚❚'); });
MK.on('resume', () => { document.title = document.title.replace(/^❚❚/, '▶'); });
MK.on('close', () => { document.title = base; });
