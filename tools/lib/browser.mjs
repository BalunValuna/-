import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Locates a Chrome binary: $CHROME, then agent-browser's bundled Chrome for Testing. */
export function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  for (const root of [join(homedir(), '.agent-browser/browsers'), '/home/hoplite/.agent-browser/browsers']) {
    if (!existsSync(root)) continue;
    for (const d of readdirSync(root)) {
      const bin = join(root, d, 'chrome');
      if (existsSync(bin)) return bin;
    }
  }
  throw new Error('Chrome not found: set $CHROME');
}

/** Headless Chrome with software WebGL2 (SwiftShader), which works without a GPU. */
export function launchBrowser() {
  return chromium.launch({
    executablePath: findChrome(),
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
      '--no-sandbox',
      '--ignore-gpu-blocklist',
    ],
  });
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

/** Tiles PNG data URLs into one labelled contact sheet, rendered inside the page. */
export function composeSheet(page, images, labels, cols = 2, scale = 0.5) {
  return page.evaluate(
    async ({ images, labels, cols, scale }) => {
      const bitmaps = await Promise.all(
        images.map(
          (src) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.src = src;
            }),
        ),
      );
      const w = Math.round(bitmaps[0].width * scale);
      const h = Math.round(bitmaps[0].height * scale);
      const rows = Math.ceil(bitmaps.length / cols);
      const c = document.createElement('canvas');
      c.width = w * cols;
      c.height = h * rows;
      const g = c.getContext('2d');
      g.fillStyle = '#111';
      g.fillRect(0, 0, c.width, c.height);
      bitmaps.forEach((b, i) => {
        const x = (i % cols) * w;
        const y = Math.floor(i / cols) * h;
        g.drawImage(b, x, y, w, h);
        g.font = '600 14px sans-serif';
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(x, y, g.measureText(labels[i]).width + 12, 22);
        g.fillStyle = '#fff';
        g.fillText(labels[i], x + 6, y + 16);
      });
      return c.toDataURL('image/png');
    },
    { images, labels, cols, scale },
  );
}
