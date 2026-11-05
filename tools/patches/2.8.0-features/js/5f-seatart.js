/* ---------------- 2.10.0 Seat avatars: original, soft 3D portraits ----------------
   A set of MKCinema's own avatar portraits, drawn as SVG in the browser (no image files to download): clay-like 3D
   shading, a range of skin tones, hair types, head coverings and glasses, plus a few playful characters for kids seats.
   SeatArt.svg(code) draws one; a code is "p:<skin>.<hair>.<hairColour>.<bg>.<shirt>.<extra>" so any portrait can be
   rebuilt anywhere from a few characters, and SeatArt.random() rolls a new one. */
const SeatArt = {
  SKIN: [['#f6d7c3', '#d9a98e'], ['#efc39f', '#c98f6c'], ['#d9a57c', '#a8714d'], ['#b9805a', '#875234'], ['#8d5a3b', '#5e3722'], ['#5f3b27', '#3b2216']],
  HAIRC: ['#1d1715', '#3a2a22', '#6b4429', '#a8743f', '#d9b26a', '#b8432f', '#9aa0a8', '#e9e4dc', '#4b5fd1', '#d06aa0'],
  BG: [['#2c3e66', '#5d7bc0'], ['#5b2d4f', '#b45a8c'], ['#1f4d45', '#47a38c'], ['#6a3b1f', '#d08a4b'], ['#3b2f66', '#8c74d6'], ['#22324a', '#4f8fb8'], ['#5a2222', '#c9584d'], ['#2e4a22', '#7fb05a'], ['#3a3a40', '#8d8d96'], ['#5c4a1b', '#d6b44a']],
  SHIRT: ['#e9e4dc', '#1f2430', '#c9584d', '#4f8fb8', '#d6b44a', '#7fb05a', '#8c74d6', '#e58fb0'],
  HAIRS: ['crop', 'afro', 'long', 'bun', 'buzz', 'curls', 'bob', 'scarf', 'beanie', 'pony', 'waves', 'bald'],
  CRITTERS: ['fox', 'cat', 'bot', 'owl', 'bear', 'astro'],
  /* a curated starting set: varied skin, hair and colour, so the first screen already looks like a household */
  SET: ['p:1.0.2.0.0.0', 'p:4.1.0.1.4.0', 'p:0.2.4.2.2.1', 'p:3.3.0.3.0.0', 'p:5.4.0.4.5.2', 'p:2.6.1.5.6.0', 'p:3.7.0.6.0.0', 'p:0.5.5.7.3.0',
    'p:4.10.0.8.2.1', 'p:2.9.3.9.1.0', 'p:5.11.6.0.4.3', 'p:1.8.0.1.7.0', 'p:3.2.8.4.0.0', 'p:0.0.7.3.5.1', 'p:4.6.9.2.0.0', 'p:2.1.1.5.3.2',
    'c:fox', 'c:cat', 'c:bot', 'c:owl', 'c:bear', 'c:astro'],
  n: 0,
  random() {
    const r = (k) => Math.floor(Math.random() * k);
    if (Math.random() < .12) return `c:${this.CRITTERS[r(this.CRITTERS.length)]}`;
    const hair = r(this.HAIRS.length), natural = Math.random() < .82;
    let ex = Math.random() < .25 ? 1 + r(3) : 0;
    // beards only with natural colours and short styles (a blue beard or a beard under long hair reads oddly)
    if (ex === 2 && (!natural || [2, 6, 7, 9].includes(hair))) ex = 1;
    return `p:${r(6)}.${hair}.${natural ? r(7) : 7 + r(3)}.${r(this.BG.length)}.${r(this.SHIRT.length)}.${ex}`;
  },
  valid(code) { return /^p:\d+\.\d+\.\d+\.\d+\.\d+\.\d+$|^c:[a-z]+$/.test(String(code || '')); },
  shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)))));
    return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  },
  svg(code) {
    const id = `sa${(this.n++).toString(36)}`;
    if (String(code).startsWith('c:')) return this.critter(code.slice(2), id);
    const [sk, hr, hc, bg, sh, ex] = String(code).slice(2).split('.').map(Number);
    const skin = this.SKIN[sk % 6], hair = this.HAIRC[hc % this.HAIRC.length], b = this.BG[bg % this.BG.length], shirt = this.SHIRT[sh % this.SHIRT.length];
    const style = this.HAIRS[hr % this.HAIRS.length], H = this.hair(style, hair, id), d = this.shade(hair, -.35), lt = this.shade(hair, .28);
    const extra = ex % 4; // 0 none, 1 glasses, 2 beard, 3 freckles
    const defs = `<defs>
      <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${b[1]}"/><stop offset="1" stop-color="${b[0]}"/></linearGradient>
      <radialGradient id="${id}l" cx=".3" cy=".22" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}s" cx=".38" cy=".3" r=".78"><stop offset="0" stop-color="${this.shade(skin[0], .22)}"/><stop offset=".55" stop-color="${skin[0]}"/><stop offset="1" stop-color="${skin[1]}"/></radialGradient>
      <linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${this.shade(shirt, .2)}"/><stop offset="1" stop-color="${this.shade(shirt, -.35)}"/></linearGradient>
      <radialGradient id="${id}h" cx=".35" cy=".25" r=".85"><stop offset="0" stop-color="${lt}"/><stop offset=".6" stop-color="${hair}"/><stop offset="1" stop-color="${d}"/></radialGradient>
      <radialGradient id="${id}e" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;
    const face = `
      <ellipse cx="60" cy="104" rx="30" ry="9" fill="url(#${id}e)"/>
      <path d="M22 124c2-22 18-32 38-32s36 10 38 32z" fill="url(#${id}t)"/>
      <path d="M50 84h20v12c0 5-20 5-20 0z" fill="${skin[1]}"/>
      ${H.back}
      <ellipse cx="33.5" cy="60" rx="5" ry="7" fill="${skin[1]}"/><ellipse cx="86.5" cy="60" rx="5" ry="7" fill="${skin[1]}"/>
      <ellipse cx="60" cy="57" rx="26.5" ry="30" fill="url(#${id}s)"/>
      <ellipse cx="49" cy="71" rx="5" ry="3" fill="#ff8a8a" opacity=".22"/><ellipse cx="71" cy="71" rx="5" ry="3" fill="#ff8a8a" opacity=".22"/>
      ${extra === 3 ? `<g fill="${skin[1]}" opacity=".7"><circle cx="46" cy="66" r=".9"/><circle cx="49" cy="68" r=".8"/><circle cx="52" cy="66.5" r=".7"/><circle cx="68" cy="66.5" r=".7"/><circle cx="71" cy="68" r=".8"/><circle cx="74" cy="66" r=".9"/></g>` : ''}
      <g><ellipse cx="50" cy="61" rx="4.6" ry="5.2" fill="#fff"/><ellipse cx="70" cy="61" rx="4.6" ry="5.2" fill="#fff"/>
        <circle cx="50.8" cy="62" r="3.2" fill="#2a1c16"/><circle cx="70.8" cy="62" r="3.2" fill="#2a1c16"/>
        <circle cx="52" cy="60.6" r="1.15" fill="#fff"/><circle cx="72" cy="60.6" r="1.15" fill="#fff"/></g>
      <path d="M44.5 52.5q5.5-3.6 11 0M64.5 52.5q5.5-3.6 11 0" stroke="${style === 'bald' || style === 'scarf' || style === 'beanie' ? this.shade(skin[1], -.35) : d}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <ellipse cx="60" cy="69" rx="3.2" ry="2.2" fill="${skin[1]}" opacity=".55"/>
      ${extra === 2 ? `<path d="M37 66c2 18 12 25 23 25s21-7 23-25c-4 9-11 12-23 12s-19-3-23-12z" fill="url(#${id}h)"/>` : ''}
      <path d="M52 76q8 7 16 0q-1 4-8 4.4q-7-.4-8-4.4z" fill="#7a2e2e"/><path d="M54.5 78.3q5.5 2.4 11 0q-1.6 1.8-5.5 1.9q-3.9-.1-5.5-1.9z" fill="#f2a3a3"/>
      ${H.front}
      ${extra === 1 ? `<g fill="none" stroke="#1b1b1f" stroke-width="2"><circle cx="50" cy="61.5" r="7.5"/><circle cx="70" cy="61.5" r="7.5"/><path d="M57.5 61h5M42.5 60l-8-2M77.5 60l8-2"/></g><g fill="#fff" opacity=".18"><circle cx="50" cy="61.5" r="7"/><circle cx="70" cy="61.5" r="7"/></g>` : ''}`;
    return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}<rect width="120" height="120" fill="url(#${id}b)"/>${face}<rect width="120" height="120" fill="url(#${id}l)"/></svg>`;
  },
  hair(style, c, id) {
    const f = `url(#${id}h)`;
    const cap = `<path d="M33 60c-3-24 11-37 27-37s30 13 27 37c-4-11-12-20-27-20s-23 9-27 20z" fill="${f}"/>`;
    switch (style) {
      case 'crop': return { back: '', front: `<path d="M33 58c-3-24 11-36 27-36 17 0 31 11 27 34-3-8-8-13-14-15-8 4-20 4-29 1-6 3-9 9-11 16z" fill="${f}"/>` };
      case 'afro': return { back: `<g fill="${f}">${[[60, 36, 30], [36, 46, 16], [84, 46, 16], [32, 62, 12], [88, 62, 12], [46, 26, 16], [74, 26, 16]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`, front: `<path d="M35 52c4-13 13-17 25-17s21 4 25 17c-6-6-14-8-25-8s-19 2-25 8z" fill="${f}"/>` };
      case 'long': return { back: `<path d="M30 56c0-22 13-34 30-34s30 12 30 34v40c-8 6-18 8-30 8s-22-2-30-8z" fill="${f}"/>`, front: `<path d="M33 62c-2-25 12-38 28-38 15 0 28 11 26 34-6-12-15-18-30-18-9 6-17 12-24 22z" fill="${f}"/>` };
      case 'bun': return { back: `<circle cx="60" cy="20" r="12" fill="${f}"/>`, front: cap };
      case 'buzz': return { back: '', front: `<path d="M33.5 56c-2-21 11-32 26.5-32s28.5 11 26.5 32c-5-9-14-14-26.5-14s-21.5 5-26.5 14z" fill="${c}" opacity=".85"/>` };
      case 'curls': return { back: '', front: `<g fill="${f}">${[[38, 42], [46, 33], [56, 28], [66, 28], [76, 33], [83, 42], [42, 36], [60, 34], [72, 37], [51, 38]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8"/>`).join('')}</g>` };
      case 'bob': return { back: `<path d="M29 58c0-22 13-35 31-35s31 13 31 35v20c-6 4-11 4-14 2V60H43v20c-3 2-8 2-14-2z" fill="${f}"/>`, front: `<path d="M33 56c-1-21 12-33 27-33s28 12 27 33c-8-5-14-12-17-18-6 7-21 14-37 18z" fill="${f}"/>` };
      case 'scarf': return { back: `<path d="M24 66c0-30 16-46 36-46s36 16 36 46v34c-10 10-22 14-36 14s-26-4-36-14z" fill="${f}"/>`, front: `<path d="M31 62c0-22 12-34 29-34s29 12 29 34c-4-12-14-20-29-20S35 50 31 62z" fill="${f}"/><path d="M33 80c6 10 15 14 27 14s21-4 27-14c-2 12-12 22-27 22s-25-10-27-22z" fill="${f}"/>` };
      case 'beanie': return { back: '', front: `<path d="M31 50c0-20 13-31 29-31s29 11 29 31z" fill="${f}"/><rect x="29" y="44" width="62" height="11" rx="5.5" fill="${this.shade(c, -.2)}"/><circle cx="60" cy="18" r="6" fill="${this.shade(c, .3)}"/>` };
      case 'pony': return { back: `<path d="M84 40c14 4 16 24 8 38-2-12-6-20-12-26z" fill="${f}"/>`, front: cap };
      case 'waves': return { back: `<path d="M30 58c0-22 13-35 30-35s30 13 30 35v18c-4 4-8 4-11 0V58H41v18c-3 4-7 4-11 0z" fill="${f}"/>`, front: `<path d="M33 58c-3-23 11-35 27-35s30 12 27 35c-3-7-6-11-11-13-4 4-9 4-13 0-4 4-9 4-13 0-6 2-13 6-17 13z" fill="${f}"/>` };
      default: return { back: '', front: `<ellipse cx="50" cy="34" rx="9" ry="4" fill="#fff" opacity=".18" transform="rotate(-20 50 34)"/>` };
    }
  },
  critter(kind, id) {
    const P = { fox: ['#e8823a', '#fff4e6', '#5c2d14', ['#3a2a55', '#7d5fc0']], cat: ['#9aa0a8', '#f1efe9', '#2c2f35', ['#1f4d45', '#47a38c']], bot: ['#b9c3d0', '#e8eef5', '#2a3445', ['#5a2222', '#c9584d']],
      owl: ['#8a6a4a', '#efe2c8', '#3b2a1c', ['#22324a', '#4f8fb8']], bear: ['#7a5236', '#d9b48f', '#2e1d12', ['#2e4a22', '#7fb05a']], astro: ['#eef1f5', '#2a3445', '#1b2230', ['#14142a', '#3b3b8c']] }[kind] || ['#9aa0a8', '#f1efe9', '#2c2f35', ['#3a3a40', '#8d8d96']];
    const [main, light, dark, bg] = P;
    const defs = `<defs><linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[1]}"/><stop offset="1" stop-color="${bg[0]}"/></linearGradient>
      <radialGradient id="${id}m" cx=".36" cy=".28" r=".8"><stop offset="0" stop-color="${this.shade(main, .3)}"/><stop offset=".6" stop-color="${main}"/><stop offset="1" stop-color="${this.shade(main, -.35)}"/></radialGradient>
      <radialGradient id="${id}l" cx=".3" cy=".22" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}e" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`;
    const eyes = (y = 58, sp = 11) => `<g><ellipse cx="${60 - sp}" cy="${y}" rx="5.4" ry="6" fill="#fff"/><ellipse cx="${60 + sp}" cy="${y}" rx="5.4" ry="6" fill="#fff"/><circle cx="${60 - sp + 1}" cy="${y + 1}" r="3.6" fill="${dark}"/><circle cx="${60 + sp + 1}" cy="${y + 1}" r="3.6" fill="${dark}"/><circle cx="${60 - sp + 2.3}" cy="${y - .6}" r="1.3" fill="#fff"/><circle cx="${60 + sp + 2.3}" cy="${y - .6}" r="1.3" fill="#fff"/></g>`;
    const shadow = `<ellipse cx="60" cy="104" rx="32" ry="9" fill="url(#${id}e)"/>`;
    let body = '';
    if (kind === 'fox' || kind === 'cat') {
      const ear = kind === 'fox' ? 'M30 48L36 14l22 22zM90 48L84 14 62 36z' : 'M32 46l2-28 20 16zM88 46l-2-28-20 16z';
      body = `${shadow}<path d="${ear}" fill="url(#${id}m)"/><path d="${kind === 'fox' ? 'M36 40l2-16 10 10zM84 40l-2-16-10 10z' : 'M36 38l1-14 9 8zM84 38l-1-14-9 8z'}" fill="${light}" opacity=".8"/>
        <ellipse cx="60" cy="62" rx="32" ry="30" fill="url(#${id}m)"/><path d="M34 70c6 14 15 20 26 20s20-6 26-20c-8 6-16 8-26 8s-18-2-26-8z" fill="${light}"/>
        ${eyes(58, 12)}<path d="M56 72h8l-4 4z" fill="${dark}"/><path d="M60 76q-4 4-8 2M60 76q4 4 8 2" stroke="${dark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        ${kind === 'cat' ? `<path d="M30 70h-12M30 74l-11 3M90 70h12M90 74l11 3" stroke="${light}" stroke-width="1.4" stroke-linecap="round"/>` : ''}`;
    } else if (kind === 'bot') {
      body = `${shadow}<rect x="57" y="12" width="6" height="14" rx="3" fill="${dark}"/><circle cx="60" cy="12" r="5" fill="#ff6b5b"/><rect x="28" y="26" width="64" height="66" rx="20" fill="url(#${id}m)"/>
        <rect x="35" y="44" width="50" height="28" rx="12" fill="${dark}"/><circle cx="49" cy="58" r="6" fill="#7df0ff"/><circle cx="71" cy="58" r="6" fill="#7df0ff"/><circle cx="51" cy="56" r="2" fill="#fff"/><circle cx="73" cy="56" r="2" fill="#fff"/>
        <path d="M50 80q10 6 20 0" stroke="${dark}" stroke-width="2.4" fill="none" stroke-linecap="round"/><rect x="20" y="50" width="8" height="18" rx="4" fill="${this.shade(main, -.2)}"/><rect x="92" y="50" width="8" height="18" rx="4" fill="${this.shade(main, -.2)}"/>`;
    } else if (kind === 'owl') {
      body = `${shadow}<path d="M30 40l8-16 10 12zM90 40l-8-16-10 12z" fill="url(#${id}m)"/><ellipse cx="60" cy="64" rx="32" ry="32" fill="url(#${id}m)"/>
        <circle cx="47" cy="58" r="12" fill="${light}"/><circle cx="73" cy="58" r="12" fill="${light}"/><circle cx="47" cy="58" r="6.5" fill="${dark}"/><circle cx="73" cy="58" r="6.5" fill="${dark}"/><circle cx="49" cy="56" r="2.2" fill="#fff"/><circle cx="75" cy="56" r="2.2" fill="#fff"/>
        <path d="M56 68h8l-4 8z" fill="#f2b33d"/><path d="M44 80q4 4 8 0q4 4 8 0q4 4 8 0q4 4 8 0" stroke="${light}" stroke-width="1.6" fill="none" opacity=".7"/>`;
    } else if (kind === 'bear') {
      body = `${shadow}<circle cx="34" cy="34" r="11" fill="url(#${id}m)"/><circle cx="86" cy="34" r="11" fill="url(#${id}m)"/><circle cx="34" cy="34" r="5.5" fill="${light}"/><circle cx="86" cy="34" r="5.5" fill="${light}"/>
        <ellipse cx="60" cy="62" rx="31" ry="30" fill="url(#${id}m)"/><ellipse cx="60" cy="74" rx="14" ry="11" fill="${light}"/>${eyes(56, 12)}<ellipse cx="60" cy="70" rx="5" ry="3.6" fill="${dark}"/><path d="M60 74v4M60 78q-4 3-7 1M60 78q4 3 7 1" stroke="${dark}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    } else {
      body = `${shadow}<path d="M24 124c2-22 18-32 36-32s34 10 36 32z" fill="url(#${id}m)"/><circle cx="60" cy="58" r="34" fill="url(#${id}m)"/><ellipse cx="60" cy="60" rx="24" ry="21" fill="${light}"/>
        <ellipse cx="54" cy="52" rx="9" ry="5" fill="#fff" opacity=".22" transform="rotate(-25 54 52)"/><circle cx="74" cy="66" r="2" fill="#fff" opacity=".7"/><circle cx="48" cy="70" r="1.2" fill="#fff" opacity=".6"/><circle cx="66" cy="50" r="1" fill="#fff" opacity=".6"/>
        <rect x="24" y="52" width="6" height="14" rx="3" fill="${this.shade(main, -.2)}"/><rect x="90" y="52" width="6" height="14" rx="3" fill="${this.shade(main, -.2)}"/>`;
    }
    return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}<rect width="120" height="120" fill="url(#${id}b)"/>${body}<rect width="120" height="120" fill="url(#${id}l)"/></svg>`;
  },
};
