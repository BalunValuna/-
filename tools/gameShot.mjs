#!/usr/bin/env node
/**
 * Boots the real game headlessly (software WebGL) and runs a scenario script with access to
 * `game` (window.game). The script may call `await shot(name)` to save a screenshot and
 * `await wait(ms)` to let frames run. Usage:
 *   node tools/gameShot.mjs --file scenario.js [--out dir] [--w 1280 --h 720] [--url ...]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, parseArgs } from './lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const w = Number(args.w || 1280);
const h = Number(args.h || 720);
const out = args.out || '.hoplite/artifacts/game';
mkdirSync(out, { recursive: true });
const body = args.file ? readFileSync(args.file, 'utf8') : args.code || '';

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => m.type() !== 'debug' && logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}\n${e.stack || ''}`));
await page.addInitScript(() => {
  window.__captureMode = true;
  localStorage.clear();
});
await page.exposeFunction('__saveShot', (name, data) => {
  const file = join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
  console.log('saved', file);
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
        const shotPage = async (name) => { await frames(2); };
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
const gameErr = await page.evaluate(() => window.__gameError || null);
if (gameErr) console.log('GAME ERROR', gameErr);
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
