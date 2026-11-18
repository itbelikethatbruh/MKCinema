
/* 2.83.1: the player never sends people to another app to change the language. */
(() => {
  try {
    if (typeof AvTracks !== 'undefined' && AvTracks.html) {
      const h = AvTracks.html.bind(AvTracks);
      AvTracks.html = function () {
        const out = h();
        if (typeof out !== 'string' || !/data-avxp/.test(out)) return out;
        return out.replace(/<p class="av-note">[^<]*<\/p>(?=<button[^>]*data-avxp)/g, '').replace(/<button[^>]*data-avxp[^>]*>[\s\S]*?<\/button>/g, '');
      };
    }
    if (typeof AudioLang !== 'undefined' && AudioLang.section) {
      const sec = AudioLang.section.bind(AudioLang);
      AudioLang.section = function (st) {
        const out = sec(st);
        if (typeof out !== 'string' || !/data-alxp/.test(out)) return out;
        return '<h5>Audio language</h5><button type="button" class="al-row on" data-alinfo tabindex="-1"><i data-lucide="audio-lines"></i>Original audio · playing</button>';
      };
    }
  } catch (e) { /* player not built here */ }
})();
