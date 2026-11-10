#!/usr/bin/env node
/* MKCinema web app source layout.

   app/index.html is the file that ships, and the file release patches are applied to. src/app/ holds the same
   content split into one file per inline <script> and <style> block, so the code can be read, searched, reviewed
   and diffed one module at a time:

     src/app/index.html   the page, with each extracted block replaced by a  @@src:js/<name>.js@@  marker
     src/app/js/*.js      one file per inline script (order = the order of the markers in src/app/index.html)
     src/app/css/*.css    one file per inline style block

   The two are kept byte-for-byte identical:

     node tools/web-src.mjs split    app/index.html  ->  src/app/   (after patching index.html)
     node tools/web-src.mjs build    src/app/        ->  app/index.html   (after editing files in src/app/)
     node tools/web-src.mjs check    fails (exit 1) if they differ; CI runs this

   File names come from the block's id attribute, else from its first comment, and stay the same when blocks are
   added elsewhere, so git diffs follow a module across releases. Blocks under 400 bytes stay inline in the page.
   Load order matters: the scripts are classic scripts that share globals, so a later block can replace an earlier
   function. Edit the function where it is defined instead of adding a later block that wraps it. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = path.join(REPO, 'app', 'index.html');
const SRC = path.join(REPO, 'src', 'app');
const MIN = 400;
const MARK = /@@src:((?:js|css)\/[a-z0-9-]+\.(?:js|css))@@/g;

/* Walk the HTML the way a browser tokenizer does for our purposes: outside raw-text elements, skip <!-- comments -->
   and find <script ...> / <style ...> start tags; their content runs to the first </script or </style. */
function blocks(html) {
  const out = [];
  const lower = html.toLowerCase();
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt + 4); i = e < 0 ? html.length : e + 3; continue; }
    const m = /^<(script|style)(?=[\s>])([^>]*)>/i.exec(html.slice(lt, lt + 4000));
    if (!m) { i = lt + 1; continue; }
    const tag = m[1].toLowerCase(), start = lt + m[0].length;
    const end = lower.indexOf('</' + tag, start);
    if (end < 0) throw new Error(`unclosed <${tag}> at offset ${lt}`);
    out.push({ tag, attrs: m[2], start, end });
    i = end + tag.length + 2;
  }
  return out;
}

function slug(b, body) {
  const id = /\bid\s*=\s*["']?([^"'\s>]+)/i.exec(b.attrs);
  const c = /\/\*([\s\S]*?)\*\//.exec(body.slice(0, 1500));
  let t = c ? c[1] : body.slice(0, 80);
  t = t.replace(/MKCinema\s*[·:-]?/gi, ' ').replace(/[=\-·:_/]+/g, ' ').toLowerCase();
  const words = t.replace(/[^a-z0-9. ]+/g, ' ').split(/\s+/).map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w && !/^[\d.]+$/.test(w) && !/^(the|a|an|and|of|on|in|to|perf|css|js|see|above|style)$/.test(w)).map((w) => w.replace(/\./g, ''));
  const head = words.slice(0, id ? 3 : 5).join('-');
  const base = id ? id[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
  return [base, head].filter(Boolean).join('-').slice(0, 60).replace(/-$/, '') || 'block';
}

function split() {
  const html = fs.readFileSync(PAGE, 'utf8');
  if (MARK.test(html) || html.includes('@@src:')) throw new Error('app/index.html contains the @@src: marker text');
  const used = new Map();
  const files = new Map();
  let tpl = '', pos = 0;
  for (const b of blocks(html)) {
    const body = html.slice(b.start, b.end);
    if (body.length < MIN || /\bsrc\s*=/i.test(b.attrs)) continue;
    const kind = b.tag === 'script' ? 'js' : 'css';
    let name = slug(b, body);
    const n = (used.get(kind + name) || 0) + 1; used.set(kind + name, n);
    if (n > 1) name += '-' + n;
    const rel = `${kind}/${name}.${kind}`;
    files.set(rel, body);
    tpl += html.slice(pos, b.start) + `@@src:${rel}@@`;
    pos = b.end;
  }
  tpl += html.slice(pos);
  for (const d of ['js', 'css']) {
    const dir = path.join(SRC, d);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (!files.has(`${d}/${f}`)) fs.unlinkSync(path.join(dir, f));
  }
  for (const [rel, body] of files) {
    const p = path.join(SRC, rel);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== body) fs.writeFileSync(p, body);
  }
  fs.writeFileSync(path.join(SRC, 'index.html'), tpl);
  if (assemble() !== html) throw new Error('split did not round-trip; nothing is trustworthy, please report');
  console.log(`split app/index.html into ${files.size} files under src/app/ (round trip OK)`);
}

function assemble() {
  const tpl = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  return tpl.replace(MARK, (_, rel) => fs.readFileSync(path.join(SRC, rel), 'utf8'));
}

function orphans() {
  const tpl = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const want = new Set([...tpl.matchAll(MARK)].map((m) => m[1]));
  const extra = [];
  for (const d of ['js', 'css']) for (const f of fs.readdirSync(path.join(SRC, d))) if (!want.has(`${d}/${f}`)) extra.push(`${d}/${f}`);
  return extra;
}

const cmd = process.argv[2];
if (cmd === 'split') split();
else if (cmd === 'build') {
  const extra = orphans();
  if (extra.length) { console.error(`files in src/app/ that no marker uses (add a marker or delete them): ${extra.join(', ')}`); process.exit(1); }
  fs.writeFileSync(PAGE, assemble());
  console.log('built app/index.html from src/app/');
} else if (cmd === 'check') {
  const same = assemble() === fs.readFileSync(PAGE, 'utf8'), extra = orphans();
  if (same && !extra.length) { console.log('src/app/ and app/index.html match'); process.exit(0); }
  if (!same) console.error('app/index.html and src/app/ differ. After patching index.html run: node tools/web-src.mjs split. After editing src/app/ run: node tools/web-src.mjs build');
  if (extra.length) console.error(`unused files in src/app/: ${extra.join(', ')}`);
  process.exit(1);
} else { console.error('usage: node tools/web-src.mjs split|build|check'); process.exit(2); }
