#!/usr/bin/env node
// Scans every file the site would publish for identifying strings.
//   ANON_DENY="name one,name two,handle" node tools/check-anonymity.mjs
//   node tools/check-anonymity.mjs --deny-file ../private/deny.txt   (one term per line)
// Keep the deny list outside this folder, so the check itself names no one.
// Always flags: absolute home paths, and any URL other than the anonymous repository.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const denyFile = argv[argv.indexOf('--deny-file') + 1];
let terms = (process.env.ANON_DENY || '').split(',');
if (argv.includes('--deny-file') && denyFile) terms = terms.concat(readFileSync(denyFile, 'utf8').split('\n'));
terms = terms.map(t => t.trim().toLowerCase()).filter(Boolean);
if (!terms.length) console.warn('No deny terms given (ANON_DENY or --deny-file); checking paths and URLs only.');

const ALLOWED_URL = /^https?:\/\/(anonymous\.4open\.science\/r\/LLM-nonlinear-storytelling-2931|www\.w3\.org\/2000\/svg|127\.0\.0\.1|localhost)/;
const LICENSE_URL = /^https?:\/\/(scripts\.sil\.org|creativecommons\.org|openfontlicense\.org)/;
const SKIP_DIRS = new Set(['.git', 'node_modules', '.preview']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (!SKIP_DIRS.has(name)) yield* walk(path); }
    else yield path;
  }
}

let problems = 0;
for (const path of walk(root)) {
  const rel = relative(root, path);
  const binary = ['.ttf', '.woff', '.woff2', '.png', '.jpg', '.pdf'].includes(extname(path));
  const text = readFileSync(path, binary ? 'latin1' : 'utf8');
  const lower = text.toLowerCase();
  for (const t of terms) {
    if (lower.includes(t)) { problems++; console.error(`FAIL  ${rel}: contains a denied term`); }
  }
  if (binary) continue;
  if (/\/(Users|home)\/[A-Za-z]/.test(text)) { problems++; console.error(`FAIL  ${rel}: absolute home path`); }
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\\]+/g)) {
    const isLicense = rel.startsWith('assets/licenses/') && LICENSE_URL.test(m[0]);
    if (!ALLOWED_URL.test(m[0]) && !isLicense) { problems++; console.error(`FAIL  ${rel}: outside URL ${m[0]}`); }
  }
}
console.log(problems ? `${problems} problem(s)` : 'No identifying strings, home paths or outside URLs found.');
process.exit(problems ? 1 : 0);
