#!/usr/bin/env node
/* Checks that every relative link and image in the repository's Markdown files and in the website and web app pages
   points to a file that exists. External links are not fetched.

     node tools/check-links.mjs */
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'build']);
// Files that live only on the servers (app downloads are published to Releases and copied in at deploy, not committed).
const SERVER_ONLY = /^(?:site\/download\/(?!com\.mkcinema\.app\.manifest\.json$|mkcinema-webos-icon\.png$)|tv-site\/MKCinema-TV\.apk$)/;
// Folders served as their own site root, so "/x" means <folder>/x.
const ROOTS = ['site', 'app', 'tv-site'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.md$/i.test(e.name) || (/\.html$/i.test(e.name) && ROOTS.some((r) => p.startsWith(path.join(repo, r) + path.sep)))) out.push(p);
  }
  return out;
}

const bad = [];
let checked = 0;
for (const file of walk(repo)) {
  const rel = path.relative(repo, file);
  let text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.html')) text = text.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const targets = [];
  if (file.endsWith('.md')) {
    text = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    for (const m of text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) targets.push(m[1]);
  }
  for (const m of text.matchAll(/\s(?:href|src)\s*=\s*["']([^"']+)["']/gi)) targets.push(m[1]);
  for (const m of text.matchAll(/\ssrcset\s*=\s*["']([^"']+)["']/gi)) for (const part of m[1].split(',')) targets.push(part.trim().split(/\s+/)[0]);
  for (let t of targets) {
    if (!t || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{|\$)/i.test(t)) continue;
    t = t.split('#')[0].split('?')[0];
    if (!t) continue;
    let target;
    if (t.startsWith('/')) {
      const r = ROOTS.find((x) => rel.startsWith(x + path.sep));
      if (!r) continue;
      target = path.join(repo, r, t);
    } else target = path.resolve(path.dirname(file), decodeURIComponent(t));
    const trel = path.relative(repo, target);
    checked++;
    if (SERVER_ONLY.test(trel.split(path.sep).join('/'))) continue;
    if (!fs.existsSync(target)) bad.push(`${rel}: ${t}`);
  }
}
console.log(`${checked} relative links checked`);
if (bad.length) { console.error(`${bad.length} broken:\n  ${bad.join('\n  ')}`); process.exit(1); }
