#!/usr/bin/env node
/* MKCinema deploy-time minifier.
   Minifies the inline <script> and <style> blocks of index.html and remote.html IN PLACE, in a DEPLOY COPY of the web
   folder. Never run it on app/ itself: the repository keeps the readable source.

     cp -r app /tmp/web && node tools/minify-web.mjs /tmp/web [--dry-run]

   CI (.github/workflows/web.yml) runs it on every change to app/ and smoke-tests the minified build.

   - esbuild (pinned 0.24.0) is installed once into a scratch folder (os.tmpdir()/mkc-minify-esbuild-0.24.0) with npm.
   - Whitespace, syntax and local-name minification only. Top-level names are kept, because the classic scripts share
     globals with each other, with inline onclick/onload attributes and with plugins. No syntax is lowered (no target).
   - Licence comments are kept ("/*!" comments, @license, @preserve, and comments that name a licence or copyright).
   - Any parse error, or a minified block that would end the <script> early, aborts with exit code 1 and writes nothing.
   - A file that is already minified is left alone (the script is safe to run twice).
   Prints the byte savings (raw, gzip -9, brotli -11) per file. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ESBUILD = '0.24.0';
const MARK = '<!-- minified by tools/minify-web.mjs -->';
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) { console.error('usage: node minify-web.mjs <deploy-copy-folder> [--dry-run]'); process.exit(2); }
const root = path.resolve(dir);
if (/\/mnt\/project-files\/mkcinema\/?$/.test(root) || fs.existsSync(path.join(root, '..', '.git'))) { console.error('refusing to minify the source folder; pass a deploy copy'); process.exit(2); }

function loadEsbuild() {
  const home = path.join(os.tmpdir(), `mkc-minify-esbuild-${ESBUILD}`);
  const req = createRequire(path.join(home, 'package.json'));
  try { return req('esbuild'); } catch (e) { /* install below */ }
  fs.mkdirSync(home, { recursive: true });
  if (!fs.existsSync(path.join(home, 'package.json'))) fs.writeFileSync(path.join(home, 'package.json'), '{"private":true}');
  console.log(`installing esbuild@${ESBUILD} into ${home} ...`);
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--silent', `esbuild@${ESBUILD}`], { cwd: home, stdio: 'inherit' });
  return req('esbuild');
}
const esbuild = loadEsbuild();

const LEGAL = /(^|\n)([ \t]*)\/\*(?![!*])((?:(?!\*\/)[\s\S])*?(?:licen[cs]e|copyright|@preserve|\((?:MIT|ISC|BSD|Apache|OFL)[^)]*\))(?:(?!\*\/)[\s\S])*?)\*\//gi;
const keepLegal = (code) => code.replace(LEGAL, (m, nl, ind, body) => `${nl}${ind}/*!${body}*/`);
const isJs = (attrs) => { const t = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs); return !t || /^(text|application)\/(javascript|ecmascript)$|^module$/i.test(t[1]); };
/* esbuild drops every call to a function declared with an empty body ("function openSettings(section) {}" makes
   "() => openSettings()" become "() => void 0"). The app declares several such placeholders and fills them in from a
   LATER <script>, which esbuild cannot see, so the calls must stay. A dead "if (0) { f = f }" marks each empty
   declaration as reassigned: esbuild then keeps the calls, and removes the dead code itself. */
const EMPTY_FN = /^[ \t]*(?:async[ \t]+)?function[ \t]*\*?[ \t]*([A-Za-z_$][\w$]*)[ \t]*\([^)]*\)[ \t]*\{[ \t]*\}/gm;
const keepStubs = (code) => {
  const names = [...new Set([...code.matchAll(EMPTY_FN)].map((m) => m[1]))];
  return names.length ? `${code}\n;if (0) { ${names.map((n) => `${n} = ${n};`).join(' ')} }\n` : code;
};
const looksMinified = (code) => { const lines = code.split('\n'); return code.length > 2000 && lines.length < code.length / 2000; };

function minifyHtml(name, html) {
  let out = '', pos = 0, js = [0, 0], css = [0, 0], blocks = 0, skipped = 0;
  const open = /<(script|style)\b([^>]*)>/gi;
  for (;;) {
    open.lastIndex = pos; const m = open.exec(html); if (!m) break;
    const tag = m[1].toLowerCase(), bodyStart = m.index + m[0].length;
    const end = html.toLowerCase().indexOf(`</${tag}`, bodyStart); if (end < 0) throw new Error(`${name}: <${tag}> at ${m.index} is never closed`);
    const body = html.slice(bodyStart, end);
    out += html.slice(pos, bodyStart);
    let res = body;
    const line = html.slice(0, m.index).split('\n').length;
    if (body.trim() && !(tag === 'script' && (/\bsrc\s*=/i.test(m[2]) || !isJs(m[2])))) {
      if (looksMinified(body)) skipped++;
      else {
        try {
          const r = esbuild.transformSync(tag === 'script' ? keepStubs(keepLegal(body)) : keepLegal(body), { loader: tag === 'script' ? 'js' : 'css', minify: true, legalComments: 'inline', charset: 'utf8', logLevel: 'silent', ...(tag === 'script' && /type\s*=\s*["']?module/i.test(m[2]) ? { format: 'esm' } : {}) });
          res = r.code.replace(/\n$/, '');
        } catch (e) {
          const msg = (e.errors && e.errors[0]) ? `${e.errors[0].text} (block line ${e.errors[0].location && e.errors[0].location.line})` : e.message;
          throw new Error(`${name}: <${tag}> starting at line ${line} did not parse: ${msg}`);
        }
        if (tag === 'script' && /<\/script/i.test(res)) throw new Error(`${name}: minified <script> at line ${line} contains "</script"`);
        if (tag === 'style' && /<\/style/i.test(res)) throw new Error(`${name}: minified <style> at line ${line} contains "</style"`);
        blocks++;
      }
      const acc = tag === 'script' ? js : css; acc[0] += Buffer.byteLength(body); acc[1] += Buffer.byteLength(res);
    }
    out += res; pos = end;
  }
  out += html.slice(pos);
  return { out, js, css, blocks, skipped };
}

const gz = (b) => zlib.gzipSync(b, { level: 9 }).length;
const br = (b) => zlib.brotliCompressSync(b, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const results = [];
try {
  for (const f of ['index.html', 'remote.html']) {
    const p = path.join(root, f); if (!fs.existsSync(p)) { console.log(`${f}: not found, skipped`); continue; }
    const src = fs.readFileSync(p, 'utf8');
    if (src.includes(MARK)) { console.log(`${f}: already minified, left alone`); continue; }
    const r = minifyHtml(f, src); r.out = r.out.replace(/\s*$/, `\n${MARK}\n`);
    results.push({ f, p, src, ...r });
  }
} catch (e) { console.error(`ABORTED, nothing written: ${e.message}`); process.exit(1); }
for (const r of results) {
  const a = Buffer.from(r.src), b = Buffer.from(r.out);
  if (!dry && r.out !== r.src) fs.writeFileSync(r.p, r.out);
  const pct = (x, y) => `${x} -> ${y} (-${((1 - y / x) * 100).toFixed(1)}%)`;
  console.log(`${r.f}: ${r.blocks} blocks minified${r.skipped ? `, ${r.skipped} already minified` : ''}${dry ? ' (dry run, not written)' : ''}`);
  console.log(`  raw    ${pct(a.length, b.length)}\n  gzip-9 ${pct(gz(a), gz(b))}\n  br-11  ${pct(br(a), br(b))}`);
  console.log(`  js ${pct(r.js[0], r.js[1])}, css ${pct(r.css[0], r.css[1])}`);
}
