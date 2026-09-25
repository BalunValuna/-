#!/usr/bin/env node
/**
 * Boots the real game headlessly (software WebGL) and runs a scenario script with access to
 * `game` (window.game). The script may call `await shot(name)` (3D view only),
 * `await shotPage(name)` (whole page including the DOM UI) and `await wait(ms)`.
 * All shots of a run are tiled into `sheet.png`. Usage:
 *   node tools/gameShot.mjs --file tools/scenarios/x.js [--out dir] [--w 1280 --h 720] [--cols 3]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeSheet, launchBrowser, parseArgs } from './lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const w = Number(args.w || 1280);
const h = Number(args.h || 720);
const out = args.out || '.hoplite/artifacts/game';
mkdirSync(out, { recursive: true });
const prelude = readFileSync(new URL('./scenarios/_prelude.js', import.meta.url), 'utf8');
const body = args.file ? readFileSync(args.file, 'utf8') : args.code || '';
const shots = [];

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => m.type() !== 'debug' && logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}\n${e.stack || ''}`));
await page.addInitScript((keep) => {
  window.__captureMode = true;
  if (!keep) localStorage.clear();
}, !!args.keepStorage);
await page.exposeFunction('__saveShot', (name, data) => {
  const file = join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  shots.push({ name, data });
  console.log('saved', file);
});
await page.exposeFunction('__pageShot', async (name) => {
  const file = join(out, `${name}.png`);
  const buf = await page.screenshot({ path: file, timeout: 240000 });
  shots.push({ name, data: `data:image/png;base64,${buf.toString('base64')}` });
  console.log('saved page', file);
});
await page.goto(args.url || 'http://localhost:5173/');
try {
  await page.waitForFunction(() => window.game?.state === 'menu' || window.__gameError, null, { timeout: 420000 });
} catch (e) {
  console.log('menu not reached:', e.message.split('\n')[0]);
}
const bootErr = await page.evaluate(() => window.__gameError || null);
if (bootErr) console.log('BOOT ERROR', bootErr);
if (body && !bootErr) {
  try {
    const result = await page.evaluate(
      new Function(`return (async () => {
        const game = window.game;
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const frames = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
        const shot = async (name) => { await frames(2); await window.__saveShot(name, document.querySelector('#view').toDataURL('image/png')); };
        const shotPage = async (name) => { await frames(2); await window.__pageShot(name); };
        const log = (...a) => console.log(...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
        ${prelude}
        ${body}
      })();`),
    );
    if (result !== undefined) console.log(JSON.stringify(result, null, 1));
  } catch (e) {
    console.log('SCENARIO ERROR', e.message);
  }
}
if (args.page) {
  await page.screenshot({ path: join(out, `${args.page}.png`), timeout: 240000 });
  console.log('saved page', join(out, `${args.page}.png`));
}
if (shots.length > 1 && !args.noSheet) {
  const sheet = await composeSheet(page, shots.map((s) => s.data), shots.map((s) => s.name), Number(args.cols || 3), Number(args.scale || 0.5));
  writeFileSync(join(out, 'sheet.png'), Buffer.from(sheet.split(',')[1], 'base64'));
  console.log('saved', join(out, 'sheet.png'));
}
const gameErr = await page.evaluate(() => window.__gameError || null);
if (gameErr) console.log('GAME ERROR', gameErr);
console.log(logs.filter((l) => !l.startsWith('log: saved')).slice(0, 60).join('\n'));
await browser.close();
