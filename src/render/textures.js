import * as THREE from 'three';

/**
 * Procedural canvas textures (noise, weaves, treads). Everything is generated at runtime so the
 * game stays a single self-contained file.
 */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { repeat = [1, 1], srgb = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Converts a height canvas into a tangent-space normal map. */
export function heightToNormal(src, strength = 2) {
  const w = src.width;
  const h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const g = out.getContext('2d');
  const img = g.createImageData(w, h);
  const H = (x, y) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

/** Fine grain for plastics (normal map). */
export function grainNormal(scale = 1) {
  return cached(`grain${scale}`, () => {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    const rnd = seeded(7);
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + rnd() * 50;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.filter = 'blur(1px)';
    g.drawImage(c, 0, 0);
    return toTexture(heightToNormal(c, 1.2), { repeat: [scale, scale] });
  });
}

/** Woven seat fabric (normal map). */
export function fabricNormal() {
  return cached('fabric', () => {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 4) {
      for (let x = 0; x < 128; x += 4) {
        const odd = ((x + y) >> 2) & 1;
        g.fillStyle = odd ? '#b0b0b0' : '#505050';
        g.fillRect(x, y, odd ? 4 : 3, odd ? 3 : 4);
      }
    }
    return toTexture(heightToNormal(c, 1.6), { repeat: [8, 8] });
  });
}

/** Tyre tread blocks (normal map) laid out along u = circumference. */
export function treadNormal() {
  return cached('tread', () => {
    const c = canvas(512, 64);
    const g = c.getContext('2d');
    g.fillStyle = '#c8c8c8';
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#202020';
    // lateral sipes and grooves, offset per rib for a directional look
    for (let i = 0; i < 64; i++) {
      const x = i * 8;
      g.fillRect(x, 0, 2, 12);
      g.fillRect(x + 3, 14, 2, 14);
      g.fillRect(x + 1, 36, 2, 14);
      g.fillRect(x + 4, 52, 2, 12);
    }
    return toTexture(heightToNormal(c, 3), { repeat: [1, 1] });
  });
}

/** Carpet (normal map). */
export function carpetNormal() {
  return cached('carpet', () => {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    const rnd = seeded(31);
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 60 + rnd() * 140;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return toTexture(heightToNormal(c, 2.5), { repeat: [6, 6] });
  });
}
