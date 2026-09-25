#!/usr/bin/env node
/**
 * Car model critic. Renders the lab car from a fixed battery of views and runs automated checks:
 *   - void check: back faces visible from outside (green) = looking into a panel through a gap
 *   - hole check: background visible through the car (enclosed magenta)
 *   - mesh stats: triangles, draw calls, build time
 * Writes .hoplite/artifacts/critic/<stamp>/{report.md, report.json, sheet.png, defects.png, *.png}.
 * Usage: node tools/critic/critic.mjs [--views a,b] [--checks a,b] [--w 900 --h 560] [--out dir]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeSheet, launchBrowser, parseArgs } from '../lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const w = Number(args.w || 900);
const h = Number(args.h || 560);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = args.out || join('.hoplite/artifacts/critic', stamp);
mkdirSync(out, { recursive: true });

const LOOK = ['front34', 'rear34', 'side', 'front', 'rear', 'top', 'hoodOpen', 'engineBay', 'doorsOpen', 'trunkOpen', 'driver', 'rearSeat'];
const CHECK = ['front34', 'rear34', 'side', 'front', 'rear', 'top', 'low34', 'gapHood', 'gapDoor', 'gapTrunk', 'hoodOpen', 'doorsOpen', 'trunkOpen'];
const lookViews = args.views === 'none' ? [] : args.views ? args.views.split(',') : LOOK;
const checkViews = args.checks === 'none' ? [] : args.checks ? args.checks.split(',') : CHECK;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => m.type() !== 'debug' && logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(`http://localhost:5173/lab.html?w=${w}&h=${h}&static=1`);
await page.waitForFunction(() => window.__labReady === true || window.__labError, null, { timeout: 300000 });
const labError = await page.evaluate(() => window.__labError || null);
if (labError) {
  console.log('lab failed:', labError, '\n', logs.join('\n'));
  process.exit(1);
}
const stats = await page.evaluate(() => window.lab.stats());

const save = (name, dataUrl) => writeFileSync(join(out, name), Buffer.from(dataUrl.split(',')[1], 'base64'));

const looks = [];
for (const v of lookViews) {
  const img = await page.evaluate((name) => {
    window.lab.setView(name);
    return window.lab.snap();
  }, v);
  save(`${v}.png`, img);
  looks.push(img);
}
if (looks.length) save('sheet.png', await composeSheet(page, looks, lookViews, 3, 0.5));

const results = [];
const defectImgs = [];
for (const v of checkViews) {
  const r = await page.evaluate((name) => {
    window.lab.setView(name);
    return window.lab.analyze();
  }, v);
  save(`defects-${v}.png`, r.image);
  defectImgs.push(r.image);
  results.push({ view: v, green: r.green, greenPct: +r.greenPct.toFixed(3), holes: r.holes });
}
if (defectImgs.length) save('defects.png', await composeSheet(page, defectImgs, checkViews, 3, 0.5));

const GREEN_LIMIT = 0.05; // % of car pixels
const HOLE_LIMIT = 20; // pixels
const lines = [
  `# Car critic report — ${stamp}`,
  '',
  `Build: ${stats.buildMs} ms (cut ${stats.cutMs} ms), triangles ${stats.triangles}.`,
  '',
  '| view | back faces visible | % of car | see-through holes | verdict |',
  '|---|---:|---:|---:|---|',
  ...results.map((r) => `| ${r.view} | ${r.green} | ${r.greenPct} | ${r.holes} | ${r.greenPct > GREEN_LIMIT || r.holes > HOLE_LIMIT ? 'FAIL' : 'ok'} |`),
  '',
  'Images: sheet.png (look views), defects.png (red = inside of a skin visible, magenta = see-through).',
  '',
  '## Triangle budget (top parts)',
  '',
  ...Object.entries(stats.perPart || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([id, t]) => `- ${id}: ${t}`),
];
if (logs.length) lines.push('', '## Console', '', ...logs.slice(0, 30).map((l) => `    ${l}`));
writeFileSync(join(out, 'report.md'), lines.join('\n'));
writeFileSync(join(out, 'report.json'), JSON.stringify({ stamp, stats, results }, null, 2));
console.log(lines.join('\n'));
console.log('\nartifacts:', out);
await browser.close();
