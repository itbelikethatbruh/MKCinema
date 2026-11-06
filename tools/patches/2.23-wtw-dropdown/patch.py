"""Where to watch: one tidy dropdown instead of a wall of pills (Drake, 2026-11-06). Usage: python3 patch.py index.html"""
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
if 'wtw-sum' in s: print('already patched'); sys.exit(0)

old_css = s[s.index('.wtw{margin-top:18px}'):s.index('.wtw-src{')]
s = s.replace(old_css, """.wtw{margin:18px 0 18px}
.wtw-d{border:1px solid var(--line);border-radius:14px;overflow:hidden}
.wtw-sum{list-style:none;display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;min-height:48px}
.wtw-sum::-webkit-details-marker{display:none}
.wtw-sum:hover,.wtw-sum.nav-focus{background:rgba(255,255,255,.04)}
.wtw-h{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.wtw-h b{font-size:14px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:8px}
.wtw-h b svg{width:16px;height:16px;color:var(--dim)}
.wtw-h small{font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wtw-r{font-family:var(--f-mono);font-size:10.5px;color:var(--dim);font-weight:400}
.wtw-stack{display:flex;flex:none}
.wtw-stack img{width:26px;height:26px;border-radius:7px;border:2px solid var(--bg,#0b0b0c);display:block;margin-left:-8px}
.wtw-stack img:first-child{margin-left:0}
.wtw-chev{width:18px;height:18px;color:var(--dim);flex:none;transition:transform .2s ease}
.wtw-d[open] .wtw-chev{transform:rotate(180deg)}
.wtw-list{border-top:1px solid var(--line);padding:6px 6px 8px}
.wtw-l{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);padding:10px 10px 4px}
.wtw-p{display:flex;align-items:center;gap:12px;padding:8px 10px;border-radius:10px;color:var(--ink);text-decoration:none;font-size:14px}
.wtw-p:hover,.wtw-p.nav-focus{background:rgba(255,255,255,.06)}
.wtw-p img{width:28px;height:28px;border-radius:7px;display:block;flex:none}
.wtw-p span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wtw-p svg{width:15px;height:15px;color:var(--dim);flex:none}
""", 1)
s = s.replace('.wtw-src{font-size:11px;color:var(--dim);margin:6px 0 0}', '.wtw-src{font-size:11px;color:var(--dim);margin:6px 10px 0}', 1)
s = s.replace('html.tv .wtw-p.nav-focus{border-color:#f2f2f3;box-shadow:inset 0 0 0 1px #f2f2f3}', 'html.tv .wtw-p.nav-focus,html.tv .wtw-sum.nav-focus{border-color:#f2f2f3;box-shadow:inset 0 0 0 1px #f2f2f3}', 1)

a = s.index("    const grp = [['Stream', ['flatrate']]")
b = s.index("    icons();\n  },\n  init() {\n    const base = renderDetail;")
s = s[:a] + """    // the same service once: "HBO Max Amazon Channel" and "Peacock Premium Plus" fold into HBO Max and Peacock Premium
    const tidy = (list) => list.filter((x) => !list.some((y) => y !== x && x.provider_name.startsWith(`${y.provider_name} `)));
    const grp = [['Stream', ['flatrate']], ['Free', ['free']], ['With ads', ['ads']], ['Rent or buy', ['rent', 'buy']]].map(([l, k]) => [l, tidy(pick(k))]).filter(([, x]) => x.length);
    if (!grp.length) { box.remove(); return; }
    const all = grp.flatMap(([, x]) => x), [l0, f0] = grp[0];
    const line = `${l0 === 'Rent or buy' ? 'Rent or buy on' : l0 === 'Stream' ? 'Stream on' : `${l0} on`} ${f0[0].provider_name}${all.length > 1 ? ` + ${all.length - 1} more` : ''}`;
    const logo = (p, w) => (p.logo_path ? `<img src="https://image.tmdb.org/t/p/${w}${esc(p.logo_path)}" alt="" loading="lazy">` : '');
    // one closed row with the top services' logos; it opens into a plain list
    box.innerHTML = `<details class="wtw-d"><summary class="wtw-sum" data-nav>
        <span class="wtw-h"><b><i data-lucide="tv"></i>Where to watch <small class="wtw-r">${esc(this.region())}</small></b><small>${esc(line)}</small></span>
        <span class="wtw-stack">${all.slice(0, 3).map((p) => logo(p, 'w92')).join('')}</span><i data-lucide="chevron-down" class="wtw-chev"></i></summary>
      <div class="wtw-list">${grp.map(([l, list]) => `<div class="wtw-l">${l}</div>${list.map((p) => `<a class="wtw-p" href="${esc(r.link || '#')}" target="_blank" rel="noopener" data-nav>${logo(p, 'w92')}<span>${esc(p.provider_name)}</span><i data-lucide="external-link"></i></a>`).join('')}`).join('')}
      <p class="wtw-src">Availability from JustWatch, via TMDB.</p></div></details>`;
""" + s[b:]
open(p, 'w', encoding='utf-8').write(s); print('patched')
