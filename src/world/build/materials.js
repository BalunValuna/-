import * as THREE from 'three';
import { Rng } from '../../core/rng.js';
import { heightToNormal } from '../../render/textures.js';

/**
 * Procedural canvas textures and shared materials for buildings, furniture and props. Everything
 * is cached: one texture/material per recipe.
 */
const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function once(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

function noise(g, w, h, amount, rng, size = 1) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      const n = (rng.next() - 0.5) * amount;
      for (let yy = y; yy < Math.min(y + size, h); yy++) {
        for (let xx = x; xx < Math.min(x + size, w); xx++) {
          const i = (yy * w + xx) * 4;
          d[i] += n;
          d[i + 1] += n;
          d[i + 2] += n;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
}

const hex = (c) => `#${new THREE.Color(c).getHexString()}`;
const shade = (c, k) => hex(new THREE.Color(c).multiplyScalar(k));

/** Wood planks running along U; 1 texture = 1 m. */
export function planksTexture(color = 0x8a6242, seed = 1) {
  return once(`planks${color}${seed}`, () => {
    const [c, g] = canvas(512, 512);
    const rng = new Rng(seed);
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      let x = -rng.range(0, 300);
      while (x < 512) {
        const len = rng.range(220, 460);
        const k = rng.range(0.78, 1.12);
        g.fillStyle = shade(color, k);
        g.fillRect(x, (r * 512) / rows, len, 512 / rows);
        // grain
        g.strokeStyle = shade(color, k * 0.82);
        g.globalAlpha = 0.35;
        for (let i = 0; i < 6; i++) {
          const y = (r * 512) / rows + rng.range(4, 512 / rows - 4);
          g.beginPath();
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + rng.range(-3, 3), x + len * 0.6, y + rng.range(-3, 3), x + len, y);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x, (r * 512) / rows, 2, 512 / rows);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(0, (r * 512) / rows, 512, 2);
    }
    noise(g, 512, 512, 14, rng);
    return c;
  });
}

export function tilesTexture(color = 0xd8d4c8, grout = 0x8d8a82, n = 4, seed = 2) {
  return once(`tiles${color}${grout}${n}${seed}`, () => {
    const [c, g] = canvas(512, 512);
    const rng = new Rng(seed);
    g.fillStyle = hex(grout);
    g.fillRect(0, 0, 512, 512);
    const s = 512 / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        g.fillStyle = shade(color, rng.range(0.93, 1.05));
        g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      }
    }
    noise(g, 512, 512, 10, rng);
    return c;
  });
}

export function wallpaperTexture(base = 0xc9bca0, ink = 0xa8997a, pattern = 'stripes', seed = 3) {
  return once(`wp${base}${ink}${pattern}${seed}`, () => {
    const [c, g] = canvas(256, 256);
    const rng = new Rng(seed);
    g.fillStyle = hex(base);
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = hex(ink);
    g.strokeStyle = hex(ink);
    if (pattern === 'stripes') {
      for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 10, 256);
      g.globalAlpha = 0.5;
      for (let x = 16; x < 256; x += 32) g.fillRect(x, 0, 2, 256);
    } else if (pattern === 'damask') {
      for (let y = 0; y < 256; y += 64) {
        for (let x = (y / 64) % 2 ? 32 : 0; x < 256 + 32; x += 64) {
          g.beginPath();
          g.ellipse(x, y + 32, 9, 18, 0, 0, Math.PI * 2);
          g.fill();
          g.beginPath();
          g.moveTo(x - 16, y + 32);
          g.quadraticCurveTo(x, y + 4, x + 16, y + 32);
          g.quadraticCurveTo(x, y + 60, x - 16, y + 32);
          g.lineWidth = 2;
          g.stroke();
        }
      }
    } else if (pattern === 'dots') {
      for (let y = 8; y < 256; y += 32) for (let x = (y / 32) % 2 ? 24 : 8; x < 256; x += 32) g.fillRect(x - 3, y - 3, 6, 6);
    } else if (pattern === 'check') {
      g.globalAlpha = 0.35;
      for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) if (((x + y) / 32) % 2 === 0) g.fillRect(x, y, 32, 32);
    }
    g.globalAlpha = 1;
    // aged: stains and fading
    for (let i = 0; i < 6; i++) {
      const grd = g.createRadialGradient(rng.range(0, 256), rng.range(0, 256), 0, rng.range(0, 256), rng.range(0, 256), rng.range(40, 120));
      grd.addColorStop(0, 'rgba(90,70,40,0.10)');
      grd.addColorStop(1, 'rgba(90,70,40,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
    }
    noise(g, 256, 256, 8, rng);
    return c;
  });
}

export function plasterTexture(color = 0xd9d2c3, seed = 4) {
  return once(`plaster${color}${seed}`, () => {
    const [c, g] = canvas(256, 256);
    const rng = new Rng(seed);
    g.fillStyle = hex(color);
    g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 12, rng, 2);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(80,60,40,${rng.range(0.02, 0.06)})`;
      g.beginPath();
      g.ellipse(rng.range(0, 256), rng.range(0, 256), rng.range(10, 60), rng.range(10, 60), 0, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  });
}

/** Horizontal lap siding; 1 texture = 1 m, boards 16 cm. */
export function sidingTexture(color = 0xb7ab94, seed = 5) {
  return once(`siding${color}${seed}`, () => {
    const [c, g] = canvas(256, 256);
    const rng = new Rng(seed);
    const n = 6;
    const s = 256 / n;
    for (let i = 0; i < n; i++) {
      const grd = g.createLinearGradient(0, i * s, 0, (i + 1) * s);
      grd.addColorStop(0, shade(color, 1.06));
      grd.addColorStop(0.85, shade(color, 0.92));
      grd.addColorStop(1, shade(color, 0.6));
      g.fillStyle = grd;
      g.fillRect(0, i * s, 256, s);
    }
    // peeling paint
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(110,90,70,${rng.range(0.15, 0.4)})`;
      g.fillRect(rng.range(0, 256), rng.range(0, 256), rng.range(4, 30), rng.range(2, 6));
    }
    noise(g, 256, 256, 14, rng);
    return c;
  });
}

export function shinglesTexture(color = 0x5a4a42, seed = 6) {
  return once(`shingles${color}${seed}`, () => {
    const [c, g] = canvas(256, 256);
    const rng = new Rng(seed);
    const rows = 8;
    const s = 256 / rows;
    for (let r = 0; r < rows; r++) {
      for (let x = r % 2 ? -16 : 0; x < 256; x += 32) {
        g.fillStyle = shade(color, rng.range(0.75, 1.15));
        g.fillRect(x + 1, r * s, 30, s);
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(x + 1, r * s + s - 4, 30, 4);
      }
    }
    noise(g, 256, 256, 16, rng);
    return c;
  });
}

export function concreteTexture(color = 0x9c9890, seed = 7) {
  return once(`concrete${color}${seed}`, () => {
    const [c, g] = canvas(256, 256);
    const rng = new Rng(seed);
    g.fillStyle = hex(color);
    g.fillRect(0, 0, 256, 256);
    noise(g, 256, 256, 18, rng, 1);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(40,35,30,${rng.range(0.03, 0.09)})`;
      g.beginPath();
      g.ellipse(rng.range(0, 256), rng.range(0, 256), rng.range(8, 50), rng.range(8, 50), rng.range(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(30,30,30,0.3)';
    g.lineWidth = 1;
    g.beginPath();
    let x = rng.range(0, 256);
    let y = 0;
    g.moveTo(x, y);
    while (y < 256) {
      x += rng.range(-10, 10);
      y += rng.range(6, 18);
      g.lineTo(x, y);
    }
    g.stroke();
    return c;
  });
}

export function fabricTexture(color = 0x5a6070, pattern = 'weave', seed = 8) {
  return once(`fabric${color}${pattern}${seed}`, () => {
    const [c, g] = canvas(128, 128);
    const rng = new Rng(seed);
    g.fillStyle = hex(color);
    g.fillRect(0, 0, 128, 128);
    if (pattern === 'weave') {
      for (let y = 0; y < 128; y += 2) {
        g.fillStyle = `rgba(255,255,255,${y % 4 ? 0.03 : 0.06})`;
        g.fillRect(0, y, 128, 1);
      }
      for (let x = 0; x < 128; x += 2) {
        g.fillStyle = 'rgba(0,0,0,0.05)';
        g.fillRect(x, 0, 1, 128);
      }
    } else if (pattern === 'plaid') {
      g.fillStyle = 'rgba(255,255,255,0.12)';
      for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 8, 128);
      for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 128, 8);
      g.fillStyle = 'rgba(0,0,0,0.15)';
      for (let x = 16; x < 128; x += 32) g.fillRect(x, 0, 3, 128);
      for (let y = 16; y < 128; y += 32) g.fillRect(0, y, 128, 3);
    } else if (pattern === 'floral') {
      for (let i = 0; i < 18; i++) {
        const x = rng.range(0, 128);
        const y = rng.range(0, 128);
        g.fillStyle = `rgba(255,240,220,0.22)`;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    noise(g, 128, 128, 10, rng);
    return c;
  });
}

export function rugTexture(a = 0x7a2e2a, b = 0xc8a878, seed = 9) {
  return once(`rug${a}${b}${seed}`, () => {
    const [c, g] = canvas(256, 256);
    const rng = new Rng(seed);
    g.fillStyle = hex(a);
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = hex(b);
    g.lineWidth = 6;
    g.strokeRect(14, 14, 228, 228);
    g.lineWidth = 2;
    g.strokeRect(28, 28, 200, 200);
    g.fillStyle = hex(b);
    for (let i = 0; i < 4; i++) {
      g.save();
      g.translate(128, 128);
      g.rotate((i * Math.PI) / 2);
      g.beginPath();
      g.moveTo(0, -70);
      g.lineTo(22, -40);
      g.lineTo(0, -10);
      g.lineTo(-22, -40);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.arc(128, 128, 14, 0, Math.PI * 2);
    g.fill();
    noise(g, 256, 256, 22, rng);
    return c;
  });
}

/** Shared materials. `m(name)` returns a cached MeshStandardMaterial for a recipe. */
const mats = new Map();
export function mat(key, make) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key);
}

const std = (o) => new THREE.MeshStandardMaterial(o);

export const M = {
  planks: (color = 0x8a6242, seed = 1) => mat(`planks${color}${seed}`, () => std({ map: tex(planksTexture(color, seed)), roughness: 0.78 })),
  tiles: (color, grout, n = 4, seed = 2) => mat(`tiles${color}${grout}${n}${seed}`, () => std({ map: tex(tilesTexture(color, grout, n, seed)), roughness: 0.35 })),
  wallpaper: (base, ink, pattern, seed = 3) => mat(`wp${base}${ink}${pattern}${seed}`, () => std({ map: tex(wallpaperTexture(base, ink, pattern, seed), 1.4), roughness: 0.9 })),
  plaster: (color = 0xd9d2c3, seed = 4) => mat(`plaster${color}${seed}`, () => std({ map: tex(plasterTexture(color, seed), 0.8), roughness: 0.95 })),
  siding: (color = 0xb7ab94, seed = 5) => mat(`siding${color}${seed}`, () => std({ map: tex(sidingTexture(color, seed)), roughness: 0.85 })),
  shingles: (color = 0x5a4a42, seed = 6) => mat(`shingles${color}${seed}`, () => std({ map: tex(shinglesTexture(color, seed)), roughness: 0.9 })),
  concrete: (color = 0x9c9890, seed = 7) => mat(`concrete${color}${seed}`, () => std({ map: tex(concreteTexture(color, seed), 0.5), roughness: 0.92 })),
  fabric: (color, pattern = 'weave', seed = 8) => mat(`fabric${color}${pattern}${seed}`, () => std({ map: tex(fabricTexture(color, pattern, seed), 3), roughness: 0.95 })),
  rug: (a, b, seed = 9) => mat(`rug${a}${b}${seed}`, () => std({ map: tex(rugTexture(a, b, seed)), roughness: 1 })),
  paint: (color, rough = 0.6) => mat(`paint${color}${rough}`, () => std({ color, roughness: rough })),
  metal: (color = 0x8a8d90, rough = 0.4) => mat(`metal${color}${rough}`, () => std({ color, roughness: rough, metalness: 0.85 })),
  plastic: (color, rough = 0.5) => mat(`plastic${color}${rough}`, () => std({ color, roughness: rough })),
  wood: (color = 0x7a5436) => mat(`wood${color}`, () => std({ map: tex(planksTexture(color, 11), 0.5), roughness: 0.7 })),
  glass: () =>
    mat('glass', () =>
      new THREE.MeshPhysicalMaterial({ color: 0xcfe2ea, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
    ),
  dirtyGlass: () =>
    mat('dirtyGlass', () => new THREE.MeshPhysicalMaterial({ color: 0xb8b09a, roughness: 0.35, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })),
  emissive: (color, intensity = 1) => mat(`em${color}${intensity}`, () => std({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.5 })),
  ceramic: (color = 0xf2f0ea) => mat(`ceramic${color}`, () => new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.1 })),
  rubber: () => mat('rubber', () => std({ color: 0x141414, roughness: 0.95 })),
  chrome: () => mat('chrome', () => std({ color: 0xe0e3e6, roughness: 0.1, metalness: 1 })),
  rust: () => mat('rust', () => std({ map: tex(concreteTexture(0x7a4a2c, 21), 0.6), roughness: 0.85, metalness: 0.3 })),
};

export { heightToNormal };
