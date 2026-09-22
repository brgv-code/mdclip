#!/usr/bin/env node
// Measures where the time in a smart copy actually goes. Run after `pnpm build`:
//   node scripts/bench.mjs
// Numbers quoted in the write-ups come from this script, median of N runs.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { darwin, htmlToRtf } from '../dist/clipboard/darwin.js';
import { htmlToMd, mdToHtml } from '../dist/convert.js';
import { enrich } from '../dist/service/smart-copy.js';
import { repairBoxTables } from '../dist/terminal-tables.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(join(root, 'README.md'), 'utf8');
const table = readFileSync(join(root, 'test/fixtures/claude-code-table.txt'), 'utf8');
const html = mdToHtml(doc);

async function time(label, fn, n) {
  await fn();
  const samples = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const fmt = (v) => v.toFixed(v < 10 ? 2 : 0).padStart(7);
  console.log(
    `${label.padEnd(36)} median ${fmt(samples[Math.floor(n / 2)])} ms   min ${fmt(samples[0])}   max ${fmt(samples[n - 1])}   n=${n}`,
  );
}

console.log(`${new Date().toISOString()}  node ${process.version}  ${process.arch}`);
console.log(`document: README.md, ${doc.length} chars\n`);

console.log('conversion, pure functions');
await time('md -> html (marked)', async () => mdToHtml(doc), 200);
await time('html -> md (turndown)', async () => htmlToMd(html), 200);
await time('repairBoxTables (rendered table)', async () => repairBoxTables(table), 500);
await time('enrich (decide + convert)', async () => enrich({ text: doc }), 100);

console.log('\noperating system, one subprocess each');
await time('pasteboard read', () => darwin.read(), 20);
await time('pasteboard changeCount', () => darwin.changeCount(), 20);
await time('pasteboard write, 3 flavors', () => darwin.write({ text: doc, html, rtf: null }), 20);
await time('html -> rtf (textutil)', () => htmlToRtf(html), 20);
