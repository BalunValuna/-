import * as THREE from 'three';
import { heightToNormal } from './textures.js';

const cache = new Map();
const once = (k, f) => (cache.has(k) ? cache.get(k) : (cache.set(k, f()), cache.get(k)));

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Hexagonal mesh (grille/intake) normal map. */
export function hexNormal() {
  return once('hex', () => {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#000';
    const r = 9;
    const h = r * Math.sqrt(3);
    for (let row = -1; row < 128 / h + 2; row++) {
      for (let col = -1; col < 128 / (r * 3) + 2; col++) {
        const cx = col * r * 3 + (row % 2 ? r * 1.5 : 0);
        const cy = row * h * 0.5;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          g.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
        }
        g.fill();
      }
    }
    const t = new THREE.CanvasTexture(heightToNormal(c, 4));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** Russian-style licence plate. */
export function plateTexture(text) {
  return once(`plate:${text}`, () => {
    const c = canvas(1040, 224);
    const g = c.getContext('2d');
    g.fillStyle = '#f4f4ef';
    g.fillRect(0, 0, 1040, 224);
    g.strokeStyle = '#111';
    g.lineWidth = 8;
    g.strokeRect(10, 10, 1020, 204);
    g.beginPath();
    g.moveTo(800, 14);
    g.lineTo(800, 210);
    g.stroke();
    const [a, num, bc, region] = text.split(' ');
    g.fillStyle = '#111';
    g.textBaseline = 'alphabetic';
    g.font = '700 150px "DejaVu Sans Mono", monospace';
    g.fillText(a, 50, 185);
    g.font = '700 190px "DejaVu Sans Mono", monospace';
    g.fillText(num, 170, 190);
    g.font = '700 150px "DejaVu Sans Mono", monospace';
    g.fillText(bc, 530, 185);
    g.font = '700 120px "DejaVu Sans Mono", monospace';
    g.fillText(region, 832, 140);
    g.font = '600 38px sans-serif';
    g.fillText('RUS', 850, 196);
    // tricolour flag
    const fx = 950;
    [['#fff', 166], ['#1c3f94', 178], ['#d52b1e', 190]].forEach(([col, y]) => {
      g.fillStyle = col;
      g.fillRect(fx, y, 50, 12);
    });
    g.strokeStyle = '#555';
    g.lineWidth = 1;
    g.strokeRect(fx, 166, 50, 36);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

/** Brand badge: a north-pointing arrow ("Sever" means north). */
export function badgeTexture() {
  return once('badge', () => {
    const c = canvas(256, 180);
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 180);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(128, 18);
    g.lineTo(178, 150);
    g.lineTo(128, 118);
    g.lineTo(78, 150);
    g.closePath();
    g.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
