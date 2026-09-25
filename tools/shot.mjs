#!/usr/bin/env node
/**
 * Headless screenshots of the car lab (software WebGL via SwiftShader).
 * Usage: node tools/shot.mjs --out dir [--views a,b] [--w 960 --h 600] [--debug defects] [--query "state=hood"]
 * Requires the dev server (npm run dev) on http://localhost:5173.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeSheet, launchBrowser, parseArgs } from './lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const out = args.out || '.hoplite/artifacts/shots';
const w = Number(args.w || 960);
const h = Number(args.h || 600);
const base = args.url || 'http://localhost:5173/lab.html';
mkdirSync(out, { recursive: true });

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
const query = new URLSearchParams({ w, h, static: 1, ...(args.debug ? { debug: args.debug } : {}) });
if (args.query) for (const [k, v] of new URLSearchParams(args.query)) query.set(k, v);
await page.goto(`${base}?${query}`);
try {
  await page.waitForFunction(() => window.__labReady === true || window.__labError, null, { timeout: 240000 });
} catch (e) {
  console.log('lab not ready:', e.message.split('\n')[0]);
}
const failure = await page.evaluate(() => window.__labError || null);
if (failure || !(await page.evaluate(() => window.__labReady === true))) {
  console.log(logs.join('\n'));
  console.log('lab error:', failure);
  await browser.close();
  process.exit(1);
}
const views = (args.views || 'front34').split(',');
const stats = await page.evaluate(() => window.lab.stats());
const shots = [];
for (const v of views) {
  const data = await page.evaluate((name) => {
    window.lab.setView(name);
    return window.lab.snap();
  }, v);
  shots.push(data);
  const file = join(out, `${v}${args.debug ? '-' + args.debug : ''}.png`);
  writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  console.log('saved', file);
}
if (shots.length > 1) {
  const sheet = await composeSheet(page, shots, views, Number(args.cols || 2), Number(args.scale || 0.5));
  writeFileSync(join(out, 'sheet.png'), Buffer.from(sheet.split(',')[1], 'base64'));
  console.log('saved', join(out, 'sheet.png'));
}
console.log(JSON.stringify(stats));
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
