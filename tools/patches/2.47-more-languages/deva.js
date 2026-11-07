  // Indian scripts: the app's fonts (Onest, Sora, Fraunces, JetBrains Mono…) have no Devanagari, Tamil, Telugu, Bengali
  // or Malayalam letters, and some systems (Linux, some TVs) have no font to fall back to. Each web font the app loads
  // gets the matching Noto Sans font added for that script's range only, so Latin text keeps its own font and the
  // letters never show as boxes. Samoan is written in Latin letters and needs nothing.
  SCRIPT: {
    hi: ['Noto Sans Devanagari', 'devanagari', 'U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF', ['Noto Sans Devanagari', 'NotoSansDevanagari-Regular', 'Nirmala UI', 'Kohinoor Devanagari']],
    ta: ['Noto Sans Tamil', 'tamil', 'U+0B82-0BFA, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Tamil', 'NotoSansTamil-Regular', 'Nirmala UI', 'Tamil Sangam MN', 'Latha']],
    te: ['Noto Sans Telugu', 'telugu', 'U+0C00-0C7F, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Telugu', 'NotoSansTelugu-Regular', 'Nirmala UI', 'Kohinoor Telugu', 'Gautami']],
    bn: ['Noto Sans Bengali', 'bengali', 'U+0980-09FE, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Bengali', 'NotoSansBengali-Regular', 'Nirmala UI', 'Kohinoor Bangla', 'Vrinda']],
    ml: ['Noto Sans Malayalam', 'malayalam', 'U+0D00-0D7F, U+200C-200D, U+20B9, U+25CC', ['Noto Sans Malayalam', 'NotoSansMalayalam-Regular', 'Nirmala UI', 'Malayalam Sangam MN', 'Kartika']],
  },
  async deva() {
    const [fam, sub, range0, locals] = this.SCRIPT[this.code];
    // Letter-spacing pulls these letters apart (the app tracks its small caps labels), so translated text gets none.
    const ls = document.createElement('style'); ls.textContent = '[data-deva]{letter-spacing:0!important}'; document.head.appendChild(ls);
    let url = '', range = range0;
    try {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam.replace(/ /g, '+')}:wght@100..900&display=swap`)).text();
      const b = css.split(`/* ${sub} */`)[1] || '';
      url = (b.match(/url\((https:[^)]+)\)/) || [])[1] || '';
      range = (b.match(/unicode-range:\s*([^;]+);/) || [])[1] || range;
    } catch (e) {}
    const st = document.createElement('style'); st.id = 'mkc-deva'; document.head.appendChild(st);
    const seen = new Set();
    const scan = () => {
      const fams = [];
      document.querySelectorAll('link[href*="fonts.googleapis.com"]').forEach((l) => {
        for (const m of l.href.matchAll(/family=([^:&]+)/g)) fams.push(decodeURIComponent(m[1]).replace(/\+/g, ' '));
      });
      const add = fams.filter((f) => !/^Noto Sans (Devanagari|Tamil|Telugu|Bengali|Malayalam)$/i.test(f) && !seen.has(f));
      if (!add.length) return;
      add.forEach((f) => seen.add(f));
      const src = [url && `url(${url}) format('woff2')`, ...locals.map((n) => `local('${n}')`)].filter(Boolean).join(', ');
      st.textContent = [...seen].map((f) => `@font-face{font-family:"${f}";font-style:normal;font-weight:100 900;font-display:swap;src:${src};unicode-range:${range}}`).join('\n');
    };
    scan();
    new MutationObserver(scan).observe(document.head, { childList: true });
  },
