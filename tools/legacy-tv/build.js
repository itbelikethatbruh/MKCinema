#!/usr/bin/env node
/* Builds tv-legacy.html: the same web app, converted for older Samsung (2019-2022) and LG (2020-2022) TVs, whose
   browsers are Chromium 63-87. Run it on the finished web folder at every release, after all patches:

     node tools/legacy-tv/build.js <web folder> [--inject]

   It writes <web>/tv-legacy.html and <web>/vendor/legacy/ (converted copies of the CDN libraries that use newer syntax).
   --inject also adds a small check to the top of <web>/index.html that sends older TV browsers to tv-legacy.html.
   index.html itself is never converted, so phones, computers and newer TVs get exactly the same app as before.

   What changes in the copy:
   - Scripts: newer syntax (?. ?? class fields, spread, ...) lowered by esbuild; \p{...} in regular expressions spelled
     out by regexpu; missing built-ins added by polyfills.js.
   - Styles: lightningcss lowers inset, logical properties, colour mixing and nesting. Then, for this engine range:
     :focus-visible becomes :focus (a TV is always driven by keys), :is()/:where() are spelled out, :has() rules are
     dropped, dvh/svh/lvh become vh, gap also gets grid-gap, and min()/max()/clamp() get a fixed fallback worked out for a
     1920x1080 screen. Flex gaps and aspect-ratio are handled at runtime by layout.js. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');
const { transform: cssTransform } = require('lightningcss');
const acorn = require('acorn');
const walk = require('acorn-walk');
const rewritePattern = require('regexpu-core');

const TARGET = 'chrome63';
const VW = 1920, VH = 1080, REM = 16;
const LIBS = [ // CDN files that use syntax these engines cannot read; the copy is served from vendor/legacy/
  { url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js', file: 'supabase.js', sri: 'SUPABASE_SRI' },
  { url: 'https://unpkg.com/lucide@0.454.0/dist/umd/lucide.min.js', file: 'lucide.min.js' },
];

const args = process.argv.slice(2);
const web = args.find((a) => !a.startsWith('--'));
if (!web) { console.error('usage: node build.js <web folder> [--inject]'); process.exit(2); }
const inject = args.includes('--inject');
const srcFile = path.join(web, 'index.html');
let html = fs.readFileSync(srcFile, 'utf8');
const stats = { scripts: 0, regex: 0, styles: 0, focus: 0, is: 0, has: 0, minmax: 0, gaps: 0, ratios: 0 };
const GAPS = [], RATIOS = [];

/* ---------- scripts ---------- */
function lowerJs(code) {
  let out = esbuild.transformSync(code, { target: TARGET, loader: 'js', charset: 'utf8', legalComments: 'inline' }).code;
  if (!/\\p\{|\\P\{/.test(out)) return out;
  const ast = acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
  const edits = [];
  walk.full(ast, (n) => {
    if (n.type === 'Literal' && n.regex && /\\[pP]\{/.test(n.regex.pattern)) {
      const flags = n.regex.flags;
      const pat = rewritePattern(n.regex.pattern, flags, { unicodePropertyEscapes: 'transform', unicodeFlag: 'transform' });
      edits.push([n.start, n.end, `/${pat}/${flags.replace('u', '')}`]);
    }
  });
  edits.sort((a, b) => b[0] - a[0]).forEach(([s, e, t]) => { out = out.slice(0, s) + t + out.slice(e); stats.regex++; });
  return out;
}

/* ---------- styles ---------- */
function splitTop(s, sep) { // split on sep outside brackets/strings
  const out = []; let d = 0, q = '', cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\') { cur += s[++i] || ''; } else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[') d++;
    if (c === ')' || c === ']') d--;
    if (c === sep && d === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
/* :is(a, b) x  ->  a x, b x  (also :where, :-webkit-any). Returns null when the selector cannot work here (:has). */
function expandSelector(sel) {
  if (/:has\(/.test(sel)) { stats.has++; return null; }
  sel = sel.replace(/:focus-visible/g, () => { stats.focus++; return ':focus'; });
  let list = [sel];
  for (let guard = 0; guard < 8; guard++) {
    let changed = false; const next = [];
    for (const s of list) {
      const m = /:(is|where|-webkit-any)\(/.exec(s);
      if (!m) { next.push(s); continue; }
      let d = 1, i = m.index + m[0].length;
      for (; i < s.length && d; i++) { if (s[i] === '(') d++; else if (s[i] === ')') d--; }
      const inner = s.slice(m.index + m[0].length, i - 1);
      for (const alt of splitTop(inner, ',')) next.push(s.slice(0, m.index) + alt.trim() + s.slice(i));
      changed = true; stats.is++;
    }
    list = next;
    if (!changed || list.length > 64) break;
  }
  /* :not(a, b) (a list) only works from Chromium 88: :not(a):not(b) */
  list = list.map((s) => s.replace(/:not\(([^()]*,[^()]*)\)/g, (_, inner) => inner.split(',').map((x) => `:not(${x.trim()})`).join('')));
  if (list.some((s) => /:(is|where|-webkit-any|has)\(/.test(s))) return null;
  return list.join(', ');
}
/* A number of px for a plain length expression at 1920x1080 (px, vw, vh, vmin, vmax, rem, em; + - * / and brackets),
   or null when it depends on something else (%, var(), ...). */
function lenPx(e) {
  e = e.trim().replace(/^calc\(/, '(');
  let ok = true;
  const js = e.replace(/(-?\d*\.?\d+)(px|vw|vh|vmin|vmax|rem|em)?\b/g, (_, n, u) => {
    const k = { px: 1, vw: VW / 100, vh: VH / 100, vmin: Math.min(VW, VH) / 100, vmax: Math.max(VW, VH) / 100, rem: REM, em: REM }[u || 'px'];
    return `(${n}*${k})`;
  }).replace(/calc\(/g, '(');
  if (!/^[\s\d.+\-*/()]*$/.test(js)) ok = false;
  if (!ok) return null;
  try { const n = Function(`return (${js});`)(); return Number.isFinite(n) ? n : null; } catch (er) { return null; }
}
/* env(name, fallback) -> fallback (these engines have no env()) */
const noEnv = (v) => v.replace(/env\(\s*[\w-]+\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, fb) => (fb ? fb.trim() : '0px'));
/* Replace each min()/max()/clamp() with one length worked out for a 1920x1080 TV. An argument with % or var() is left
   out of the comparison (on a screen this wide the fixed limits are the ones that apply). null when nothing is left. */
function lowerMinMax(v) {
  v = noEnv(v);
  for (let guard = 0; guard < 30; guard++) {
    /* the last min/max/clamp in the text has none inside it */
    let m, last = null; const re = /\b(min|max|clamp)\(/g;
    while ((m = re.exec(v))) last = m;
    if (!last) break;
    let d = 1, k = last.index + last[0].length;
    for (; k < v.length && d; k++) { if (v[k] === '(') d++; else if (v[k] === ')') d--; }
    const fn = last[1], inner = v.slice(last.index + last[0].length, k - 1);
    const args = splitTop(inner, ',').map((a) => a.trim()), nums = args.map(lenPx);
    let n;
    if (fn === 'clamp') n = nums[1] != null && nums[0] != null && nums[2] != null ? Math.max(nums[0], Math.min(nums[1], nums[2])) : nums[2] != null ? nums[2] : nums[0];
    else { const ok = nums.filter((x) => x != null); n = ok.length ? (fn === 'min' ? Math.min(...ok) : Math.max(...ok)) : null; }
    if (n == null) return null;
    v = v.slice(0, last.index) + `${Math.round(n * 100) / 100}px` + v.slice(k);
  }
  return /NaN|\b(min|max|clamp)\(/.test(v) ? null : v;
}
function fixDecls(body, selector, media) {
  const decls = splitTop(body, ';').map((d) => d.trim()).filter(Boolean);
  const out = [];
  const hasHeight = decls.some((d) => /^height\s*:/.test(d));
  for (let d of decls) {
    const c = d.indexOf(':'); if (c < 0) { out.push(d); continue; }
    const prop = d.slice(0, c).trim(), val = d.slice(c + 1).trim();
    if (prop.startsWith('--') && !/\b(min|max|clamp)\(/.test(val)) { out.push(d); continue; }
    if (/\b(dvh|svh|lvh)\b/.test(val) || /\d(dvh|svh|lvh)\b/.test(val)) d = `${prop}: ${val.replace(/(\d)(dvh|svh|lvh)\b/g, '$1vh')}`;
    const v2 = d.slice(d.indexOf(':') + 1).trim();
    let low = null;
    if (/\b(min|max|clamp)\(/.test(v2)) {
      low = lowerMinMax(v2.replace(/\s*!important$/, ''));
      const imp = /!important$/.test(v2) ? ' !important' : '';
      if (low && prop.startsWith('--')) { d = `${prop}: ${low}`; stats.minmax++; }
      else if (low) { out.push(`${prop}: ${low}${imp}`); stats.minmax++; }
    } else if (/env\(/.test(v2) && !prop.startsWith('--')) out.push(`${prop}: ${noEnv(v2)}`);
    if (prop === 'gap' || prop === 'row-gap' || prop === 'column-gap') {
      const gv = low || v2;
      out.push(`grid-${prop}: ${gv}`);
      const [r, cgap] = prop === 'gap' ? (splitTop(gv, ' ').length > 1 ? splitTop(gv, ' ') : [gv, gv]) : prop === 'row-gap' ? [gv, '0px'] : ['0px', gv];
      if (selector && !/^0(px)?$/.test(gv)) { GAPS.push([selector, r.trim(), cgap.trim(), media || '']); stats.gaps++; }
    }
    if (prop === 'aspect-ratio' && selector && !hasHeight) {
      const m = /^(\d*\.?\d+)\s*(?:\/\s*(\d*\.?\d+))?$/.exec(v2);
      if (m) { RATIOS.push([selector, Number(m[1]) / Number(m[2] || 1), media || '']); stats.ratios++; }
    }
    out.push(d);
  }
  return out.join(';\n  ');
}
function walkCss(css, media) {
  let out = '', i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) { out += css.slice(i); break; }
    const prelude = css.slice(i, open).trim();
    let d = 1, j = open + 1, q = '';
    for (; j < css.length && d; j++) {
      const c = css[j];
      if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue; }
      if (c === '"' || c === "'") q = c; else if (c === '{') d++; else if (c === '}') d--;
    }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith('@')) {
      if (/^@(media|supports|layer|container|document)/.test(prelude)) {
        const m = /^@media\s+(.*)$/.exec(prelude);
        const inner = walkCss(body, m ? (media ? `${media} and ${m[1]}` : m[1]) : media);
        if (/^@(layer|container)/.test(prelude)) out += inner + '\n'; // not known to these engines: keep the rules, drop the wrapper
        else out += `${prelude} {\n${inner}\n}\n`;
      } else out += `${prelude} {${body}}\n`;
    } else {
      const sel = expandSelector(prelude);
      if (sel) out += `${sel} {\n  ${fixDecls(body, sel, media)}\n}\n`;
    }
    i = j;
  }
  return out;
}
function lowerCss(code) {
  let css = code;
  try {
    css = cssTransform({ filename: 'app.css', code: Buffer.from(code), targets: { chrome: 63 << 16 }, errorRecovery: true }).code.toString();
  } catch (e) { console.warn('lightningcss could not read a style block, leaving it as is:', e.message); }
  /* lightningcss writes :is() rules twice (:-webkit-any and :is); expanding both would double them */
  css = css.replace(/(^|\n)[^{}\n]*:-webkit-any\([^{}]*\{[^{}]*\}\n?/g, '$1');
  return walkCss(css, '');
}

/* ---------- page ---------- */
const parts = []; let pos = 0;
const tagRe = /<(script|style)\b([^>]*)>/gi; let m;
while ((m = tagRe.exec(html))) {
  const tag = m[1].toLowerCase(), attrs = m[2];
  const close = html.indexOf(`</${tag}>`, tagRe.lastIndex);
  if (close < 0) break;
  const body = html.slice(tagRe.lastIndex, close);
  parts.push(html.slice(pos, tagRe.lastIndex));
  if (tag === 'script' && !/\bsrc=/.test(attrs) && !/type=["']?(application\/(ld\+)?json|module|importmap|text\/(template|plain))/i.test(attrs) && body.trim()) {
    parts.push(lowerJs(body)); stats.scripts++;
  } else if (tag === 'style' && body.trim()) {
    parts.push(lowerCss(body)); stats.styles++;
  } else parts.push(body);
  pos = close; tagRe.lastIndex = close;
}
parts.push(html.slice(pos));
let out = parts.join('');

/* drop the redirect (if index.html already has it) so the legacy page never sends itself away */
out = out.replace(/<script id="mkc-legacy-tv">[\s\S]*?<\/script>\n?/, '');

/* converted CDN libraries */
fs.mkdirSync(path.join(web, 'vendor', 'legacy'), { recursive: true });
const cache = path.join(__dirname, '.cache'); fs.mkdirSync(cache, { recursive: true });
async function libs() {
  for (const lib of LIBS) {
    if (!out.includes(lib.url)) { console.warn(`not in the page any more, skipped: ${lib.url}`); continue; }
    const cf = path.join(cache, crypto.createHash('sha1').update(lib.url).digest('hex') + '.js');
    if (!fs.existsSync(cf)) {
      const r = await fetch(lib.url); if (!r.ok) throw new Error(`${lib.url}: ${r.status}`);
      fs.writeFileSync(cf, Buffer.from(await r.arrayBuffer()));
    }
    const code = esbuild.transformSync(fs.readFileSync(cf, 'utf8'), { target: TARGET, minify: true, legalComments: 'inline' }).code;
    fs.writeFileSync(path.join(web, 'vendor', 'legacy', lib.file), code);
    const sri = 'sha384-' + crypto.createHash('sha384').update(code).digest('base64');
    const local = `vendor/legacy/${lib.file}`;
    /* the page pins each library by its hash; the copy gets its own hash */
    const at = out.indexOf(lib.url);
    out = out.split(lib.url).join(local);
    if (lib.sri) out = out.replace(new RegExp(`(${lib.sri}\\s*=\\s*['"])sha384-[A-Za-z0-9+/=]+`), `$1${sri}`);
    else {
      const near = out.slice(at, at + 400).replace(/integrity\s*=\s*(["'])sha384-[A-Za-z0-9+/=]+\1/, `integrity=$1${sri}$1`);
      out = out.slice(0, at) + near + out.slice(at + 400);
    }
  }
}

async function main() {
  await libs();
  const poly = await esbuild.build({
    entryPoints: [path.join(__dirname, 'polyfills.js')], bundle: true, write: false, minify: true, format: 'iife', target: TARGET,
  });
  const layout = fs.readFileSync(path.join(__dirname, 'layout.js'), 'utf8')
    .replace('__GAPS__', JSON.stringify(GAPS)).replace('__RATIOS__', JSON.stringify(RATIOS));
  const layoutMin = esbuild.transformSync(layout, { target: TARGET, minify: true }).code;
  /* TizenBrew marks the page it opens; after the hop to this page the mark comes from sessionStorage */
  const tb = "try{var t=sessionStorage.getItem('mkc:tizenbrew');if(t&&!window.MKCinemaTizenBrew){window.MKCinemaTizenBrew=t;document.documentElement.classList.add('tv')}}catch(e){}";
  const head = `<script id="mkc-legacy-poly">window.MKC_LEGACY=true;${tb}${poly.outputFiles[0].text}</script>\n`;
  out = out.replace(/<head>([^]*?)(<script)/i, (all, a, b) => `<head>${a}${head}${b}`);
  out = out.replace(/<\/body>(?![^]*<\/body>)/i, `<script id="mkc-legacy-layout">${layoutMin}</script>\n</body>`);
  out = out.replace(/<html\b([^>]*)>/i, (all, a) => (/class=/.test(a) ? all.replace(/class="/, 'class="legacy ') : `<html${a} class="legacy">`));

  /* every script must now parse as ES2018 (Chromium 63-64) */
  const bad = [];
  out.replace(/<script\b([^>]*)>([^]*?)<\/script>/gi, (all, a, body) => {
    if (/\bsrc=|json|module/.test(a) || !body.trim()) return all;
    try { acorn.parse(body, { ecmaVersion: 2018, sourceType: 'script', allowReturnOutsideFunction: true }); }
    catch (e) { bad.push(`${(/id="([^"]+)"/.exec(a) || [])[1] || 'script'}: ${e.message}`); }
    return all;
  });
  for (const lib of LIBS) {
    const f = path.join(web, 'vendor', 'legacy', lib.file);
    if (fs.existsSync(f)) try { acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2018 }); } catch (e) { bad.push(`${lib.file}: ${e.message}`); }
  }
  if (bad.length) { console.error('Scripts that older TVs still could not read:\n ' + bad.join('\n ')); process.exit(1); }

  fs.writeFileSync(path.join(web, 'tv-legacy.html'), out);
  console.log(`tv-legacy.html: ${(out.length / 1024).toFixed(0)} KB`, stats);

  if (inject) {
    const snippet = fs.readFileSync(path.join(__dirname, 'redirect.html'), 'utf8').trim();
    let idx = fs.readFileSync(srcFile, 'utf8');
    idx = idx.replace(/<script id="mkc-legacy-tv">[\s\S]*?<\/script>\n?/, '');
    /* right after <meta charset>, so the charset stays in the first bytes of the page */
    if (/<meta charset[^>]*>\n?/i.test(idx)) idx = idx.replace(/<meta charset[^>]*>\n?/i, (h) => `${h}${snippet}\n`);
    else idx = idx.replace(/<head>\s*\n?/i, (h) => `${h}${snippet}\n`);
    fs.writeFileSync(srcFile, idx);
    console.log('index.html: older-TV check added');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
