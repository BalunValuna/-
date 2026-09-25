#!/usr/bin/env node
/**
 * Evaluates a script inside the car lab page and prints its JSON result; data-URL strings in the
 * result are saved as PNG files. Usage: node tools/labEval.mjs --file snippet.js [--out dir] [--query "..."]
 * The snippet is the body of an async function receiving `lab` (window.lab) and `THREE`-free helpers.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, parseArgs } from './lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const w = Number(args.w || 900);
const h = Number(args.h || 560);
const out = args.out || '.hoplite/artifacts/eval';
mkdirSync(out, { recursive: true });
const body = args.file ? readFileSync(args.file, 'utf8') : args.code;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
const query = new URLSearchParams({ w, h, static: 1 });
if (args.query) for (const [k, v] of new URLSearchParams(args.query)) query.set(k, v);
await page.goto(`${args.url || 'http://localhost:5173/lab.html'}?${query}`);
await page.waitForFunction(() => window.__labReady === true || window.__labError, null, { timeout: 300000 });
const err = await page.evaluate(() => window.__labError || null);
if (err) {
  console.log('lab error:', err, logs.join('\n'));
  process.exit(1);
}
const result = await page.evaluate(new Function(`return (async () => { const lab = window.lab; ${body} })();`));
const saveImages = (v, key) => {
  if (typeof v === 'string' && v.startsWith('data:image/png')) {
    const file = join(out, `${key}.png`);
    writeFileSync(file, Buffer.from(v.split(',')[1], 'base64'));
    return file;
  }
  if (v && typeof v === 'object') for (const k of Object.keys(v)) v[k] = saveImages(v[k], `${key}_${k}`.replace(/^_/, ''));
  return v;
};
console.log(JSON.stringify(saveImages(result, ''), null, 1));
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
