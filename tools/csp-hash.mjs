#!/usr/bin/env node
/* MKCinema deploy step: pins every inline <script> of the web pages by its SHA-256 hash.

     cp -r app /tmp/web && node tools/minify-web.mjs /tmp/web && node tools/csp-hash.mjs /tmp/web [--check]

   Run it LAST, on the deploy copy, after minify-web.mjs and after any other edit: a script that changes after this step
   no longer matches its hash and the browser will not run it (re-running this step fixes that; it is idempotent).

   For each top-level .html page with inline scripts it writes, right after <meta charset>, a
     <meta http-equiv="Content-Security-Policy" content="script-src ..." data-mkc-csp>
   whose script-src is the script-src of the "/*" rule in _headers WITHOUT 'unsafe-inline', plus one 'sha256-...' per
   inline script of that page. The browser enforces this policy on top of the _headers one, so only those exact inline
   scripts run and on*= attributes never do. The _headers policy keeps 'unsafe-inline' only as the fallback for a copy
   deployed without this step (the app still works, just without the stricter rule).

   Fails (exit 1, nothing written) when:
   - a page still has an on*= attribute, in its markup or in HTML built inside its scripts (they would be blocked);
   - _headers has no script-src for "/*";
   - an inline script sits before <meta charset> (the policy would not cover it).
   --check only reports. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const check = args.includes('--check');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) { console.error('usage: node csp-hash.mjs <deploy-copy-folder> [--check]'); process.exit(2); }
const root = path.resolve(dir);

/* script-src from the "/*" block of _headers */
function scriptSrc() {
  const hdr = fs.readFileSync(path.join(root, '_headers'), 'utf8').split('\n');
  let inAll = false;
  for (const line of hdr) {
    if (/^\S/.test(line)) { inAll = line.trim() === '/*'; continue; }
    const m = inAll && /^\s+Content-Security-Policy:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const d = m[1].split(';').map((x) => x.trim()).find((x) => /^script-src\s/i.test(x));
    if (d) return d.split(/\s+/).slice(1).filter((t) => t !== "'unsafe-inline'" && !/^'(sha256|sha384|sha512|nonce)-/.test(t));
  }
  return null;
}

const isJs = (attrs) => { const t = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs); return !t || /^(text|application)\/(javascript|ecmascript)$|^module$/i.test(t[1]); };
const HANDLER = /<[a-zA-Z][^<>]*?\son[a-z]+\s*=\s*["'][^<>]*>/g;
const OLD_META = /<meta http-equiv="Content-Security-Policy" content="[^"]*" data-mkc-csp>\n?/g;

const base = scriptSrc();
if (!base) { console.error('csp-hash: no script-src for "/*" in _headers'); process.exit(1); }

const pages = fs.readdirSync(root).filter((n) => n.endsWith('.html'));
const out = [];
let bad = 0;
for (const name of pages) {
  const file = path.join(root, name);
  const html = fs.readFileSync(file, 'utf8').replace(OLD_META, '');
  const hashes = [];
  const open = /<script\b([^>]*)>/gi;
  let m, firstScript = -1;
  while ((m = open.exec(html))) {
    if (firstScript < 0) firstScript = m.index;
    const bodyStart = m.index + m[0].length;
    const end = html.toLowerCase().indexOf('</script', bodyStart);
    if (end < 0) { console.error(`csp-hash: ${name}: <script> at ${m.index} is never closed`); bad++; break; }
    open.lastIndex = end;
    if (/\bsrc\s*=/i.test(m[1]) || !isJs(m[1])) continue;
    // the HTML parser turns CRLF and lone CR into LF before the script text exists
    const body = html.slice(bodyStart, end).replace(/\r\n?/g, '\n');
    const h = `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`;
    if (!hashes.includes(h)) hashes.push(h);
  }
  const handlers = [...html.matchAll(HANDLER)].map((x) => `line ${html.slice(0, x.index).split('\n').length}: ${x[0].slice(0, 140)}`);
  if (handlers.length) { console.error(`csp-hash: ${name}: on*= attributes would be blocked:\n  ${handlers.join('\n  ')}`); bad++; }
  if (!hashes.length) { if (html !== fs.readFileSync(file, 'utf8')) out.push([file, html, 0]); continue; }
  const cs = /<meta charset=["']?utf-8["']?>/i.exec(html);
  if (!cs) { console.error(`csp-hash: ${name}: no <meta charset="utf-8">`); bad++; continue; }
  if (firstScript >= 0 && firstScript < cs.index) { console.error(`csp-hash: ${name}: a script comes before <meta charset>`); bad++; continue; }
  const meta = `<meta http-equiv="Content-Security-Policy" content="script-src ${[...base, ...hashes].join(' ')}" data-mkc-csp>`;
  const at = cs.index + cs[0].length;
  const next = `${html.slice(0, at)}\n${meta}${html[at] === '\n' ? '' : '\n'}${html.slice(at)}`;
  out.push([file, next, hashes.length]);
}
if (bad) { console.error(`csp-hash: ${bad} problem(s); nothing written`); process.exit(1); }
for (const [file, html, n] of out) {
  console.log(`${path.basename(file)}: ${n} inline script(s) pinned${check ? ' (check only)' : ''}`);
  if (!check) fs.writeFileSync(file, html);
}
