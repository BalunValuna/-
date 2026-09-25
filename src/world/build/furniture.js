import * as THREE from 'three';
import { roundedBox } from '../../geo/primitives.js';
import { fieldGeometry } from '../../geo/fieldMesh.js';
import { sdRoundBox, sdEllipsoid, smin, smax } from '../../geo/sdf.js';
import { M } from './materials.js';

/**
 * Furniture generators. Each draws into a builder frame whose origin is the piece's footprint
 * centre on the floor, front facing +Z, and returns loot spots { pos, table } in that frame.
 * `rng` drives style variation, so the same house always looks the same.
 */
const geoCache = new Map();
const cached = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};
const rbox = (w, h, d, r, seg = 2) => cached(`rb${w.toFixed(3)}${h.toFixed(3)}${d.toFixed(3)}${r}${seg}`, () => roundedBox(w, h, d, r, seg));
const cyl = (rt, rb, h, seg = 16) => cached(`cy${rt}${rb}${h}${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));

export const FABRICS = [
  [0x5d6572, 'weave'],
  [0x6e4f3a, 'weave'],
  [0x3f5a4a, 'plaid'],
  [0x8a7a62, 'floral'],
  [0x6b2e2e, 'weave'],
  [0x40454f, 'plaid'],
  [0x7d6b8a, 'floral'],
];
export const WOODS = [0x6e4a2f, 0x8a6242, 0x4e3524, 0xa27c55, 0x5d4636];

const wood = (rng) => M.wood(rng.pick(WOODS));
const fabric = (rng) => {
  const [c, p] = rng.pick(FABRICS);
  return M.fabric(c, p);
};

// ------------------------------------------------------------------ seating

export function sofa(b, rng, { seats = rng.int(2, 3) } = {}) {
  const f = fabric(rng);
  const w = seats * 0.62 + 0.36;
  const d = 0.9;
  const legs = wood(rng);
  const rolled = rng.chance(0.5);
  b.mesh(rbox(w, 0.22, d, 0.04), f, 0, 0.26, 0);
  // seat cushions
  const cw = (w - 0.36) / seats;
  for (let i = 0; i < seats; i++) b.mesh(rbox(cw - 0.01, 0.14, d - 0.24, 0.05, 3), f, -w / 2 + 0.18 + cw * (i + 0.5), 0.43, 0.06);
  // back cushions, slightly reclined
  for (let i = 0; i < seats; i++) b.mesh(rbox(cw - 0.02, 0.44, 0.18, 0.07, 3), f, -w / 2 + 0.18 + cw * (i + 0.5), 0.7, -d / 2 + 0.2, 0, 1, -0.16);
  b.mesh(rbox(w, 0.5, 0.16, 0.05), f, 0, 0.6, -d / 2 + 0.08);
  for (const s of [-1, 1]) {
    if (rolled) {
      b.mesh(rbox(0.18, 0.36, d, 0.06), f, s * (w / 2 - 0.09), 0.42, 0);
      b.mesh(cyl(0.11, 0.11, d, 18), f, s * (w / 2 - 0.09), 0.62, 0, 0, 1, Math.PI / 2);
    } else b.mesh(rbox(0.18, 0.46, d, 0.04), f, s * (w / 2 - 0.09), 0.46, 0);
    for (const z of [-1, 1]) b.mesh(cyl(0.02, 0.016, 0.14, 8), legs, s * (w / 2 - 0.08), 0.07, z * (d / 2 - 0.08));
  }
  b.collider(0, 0.4, 0, w, 0.8, d);
  return { loot: [{ pos: [rng.range(-w / 3, w / 3), 0.52, 0.1], table: 'couch' }] };
}

export function armchair(b, rng) {
  const f = fabric(rng);
  b.mesh(rbox(0.8, 0.24, 0.84, 0.05), f, 0, 0.27, 0);
  b.mesh(rbox(0.52, 0.14, 0.6, 0.05, 3), f, 0, 0.45, 0.06);
  b.mesh(rbox(0.52, 0.5, 0.18, 0.07, 3), f, 0, 0.72, -0.26, 0, 1, -0.14);
  b.mesh(rbox(0.8, 0.56, 0.16, 0.05), f, 0, 0.62, -0.34);
  for (const s of [-1, 1]) b.mesh(rbox(0.14, 0.44, 0.84, 0.05), f, s * 0.33, 0.47, 0);
  const legs = wood(rng);
  for (const s of [-1, 1]) for (const z of [-1, 1]) b.mesh(cyl(0.02, 0.015, 0.15, 8), legs, s * 0.33, 0.075, z * 0.34);
  b.collider(0, 0.42, 0, 0.8, 0.84, 0.84);
  return { loot: [] };
}

export function chair(b, rng, style = rng.int(0, 2)) {
  const w = wood(rng);
  const seatH = 0.46;
  if (style === 2) {
    // padded kitchen chair with chrome tube frame
    const f = M.plastic(rng.pick([0x7a2a22, 0x2f4a5a, 0x4a4a4a, 0x6a5a2a]), 0.45);
    const tube = M.chrome();
    b.mesh(rbox(0.44, 0.06, 0.42, 0.025, 3), f, 0, seatH, 0);
    b.mesh(rbox(0.42, 0.3, 0.05, 0.02, 3), f, 0, 0.8, -0.2, 0, 1, -0.08);
    for (const s of [-1, 1]) {
      b.mesh(cyl(0.011, 0.011, seatH, 8), tube, s * 0.19, seatH / 2, 0.17);
      b.mesh(cyl(0.011, 0.011, 0.95, 8), tube, s * 0.19, 0.475, -0.19);
    }
  } else {
    b.mesh(rbox(0.44, 0.045, 0.42, 0.012), w, 0, seatH, 0);
    for (const s of [-1, 1]) for (const z of [-1, 1]) b.mesh(cyl(0.018, 0.016, seatH, 8), w, s * 0.19, seatH / 2, z * 0.18);
    for (const s of [-1, 1]) b.mesh(cyl(0.018, 0.016, 0.48, 8), w, s * 0.19, seatH + 0.24, -0.19);
    if (style === 0) {
      for (let i = -2; i <= 2; i++) b.mesh(cyl(0.008, 0.008, 0.36, 6), w, i * 0.065, seatH + 0.2, -0.19);
      b.mesh(rbox(0.44, 0.07, 0.035, 0.012), w, 0, seatH + 0.44, -0.19);
    } else {
      b.mesh(rbox(0.4, 0.2, 0.025, 0.01), w, 0, seatH + 0.32, -0.19);
      b.mesh(rbox(0.4, 0.05, 0.025, 0.01), w, 0, seatH + 0.12, -0.19);
    }
  }
  b.collider(0, 0.45, 0, 0.44, 0.9, 0.44);
  return { loot: [] };
}

// ------------------------------------------------------------------ tables

export function coffeeTable(b, rng) {
  const glass = rng.chance(0.4);
  const w = wood(rng);
  if (glass) {
    b.mesh(rbox(1.0, 0.012, 0.56, 0.004), M.glass(), 0, 0.42, 0);
    const frame = M.metal(0x2a2a2a, 0.5);
    for (const s of [-1, 1]) for (const z of [-1, 1]) b.mesh(cyl(0.012, 0.012, 0.41, 8), frame, s * 0.46, 0.205, z * 0.24);
    b.mesh(rbox(0.94, 0.012, 0.5, 0.003), w, 0, 0.14, 0);
  } else {
    b.mesh(rbox(1.0, 0.045, 0.56, 0.012), w, 0, 0.42, 0);
    for (const s of [-1, 1]) for (const z of [-1, 1]) b.mesh(rbox(0.045, 0.4, 0.045, 0.006), w, s * 0.45, 0.2, z * 0.23);
    b.mesh(rbox(0.9, 0.018, 0.46, 0.004), w, 0, 0.12, 0);
  }
  magazines(b, rng, 0, 0.44, 0.05);
  b.collider(0, 0.22, 0, 1.0, 0.44, 0.56);
  return { loot: [{ pos: [0.25, 0.46, 0], table: 'table' }] };
}

export function diningTable(b, rng, { w = 1.3, d = 0.8 } = {}) {
  const wd = wood(rng);
  b.mesh(rbox(w, 0.04, d, 0.01), wd, 0, 0.75, 0);
  b.mesh(rbox(w - 0.12, 0.08, d - 0.12, 0.005), wd, 0, 0.69, 0);
  for (const s of [-1, 1]) for (const z of [-1, 1]) b.mesh(rbox(0.05, 0.72, 0.05, 0.008), wd, s * (w / 2 - 0.07), 0.36, z * (d / 2 - 0.07));
  if (rng.chance(0.6)) {
    const cloth = M.fabric(rng.pick([0xe8e2d0, 0xc9b8a0, 0x9fb0b8]), rng.pick(['plaid', 'weave']));
    b.mesh(rbox(w * 0.75, 0.004, d * 1.02, 0.001), cloth, 0, 0.772, 0);
  }
  b.collider(0, 0.39, 0, w, 0.78, d);
  const loot = [{ pos: [rng.range(-w / 3, w / 3), 0.78, rng.range(-0.15, 0.15)], table: 'table' }];
  // plate and mug
  b.mesh(cyl(0.11, 0.09, 0.015, 20), M.ceramic(0xf0ede4), -w / 4, 0.778, 0.1);
  b.mesh(cyl(0.04, 0.036, 0.09, 14), M.ceramic(rng.pick([0xd04a3a, 0x3a6a9a, 0xe8e2d0])), w / 4, 0.815, -0.1);
  return { loot };
}

function magazines(b, rng, x, y, z) {
  const n = rng.int(0, 3);
  for (let i = 0; i < n; i++) {
    b.mesh(rbox(0.21, 0.006, 0.28, 0.001), M.paint(rng.pick([0xc84a3a, 0x2a6aaa, 0xe8d8a0, 0x3a8a4a, 0xeeeeee]), 0.5), x + rng.range(-0.25, 0.25), y + i * 0.006, z + rng.range(-0.1, 0.1), rng.range(-0.6, 0.6));
  }
}

// ------------------------------------------------------------------ bedroom

export function bed(b, rng, { double = rng.chance(0.6) } = {}) {
  const w = double ? 1.5 : 0.95;
  const L = 2.05;
  const wd = wood(rng);
  const headStyle = rng.int(0, 2);
  // frame and legs; the bed's head is at -Z
  b.mesh(rbox(w + 0.06, 0.2, L, 0.015), wd, 0, 0.26, 0);
  for (const s of [-1, 1]) for (const z of [-1, 1]) b.mesh(rbox(0.07, 0.18, 0.07, 0.01), wd, s * (w / 2 - 0.01), 0.09, z * (L / 2 - 0.04));
  if (headStyle === 0) b.mesh(rbox(w + 0.1, 0.62, 0.06, 0.02), wd, 0, 0.62, -L / 2 - 0.02);
  else if (headStyle === 1) {
    b.mesh(rbox(w + 0.1, 0.07, 0.07, 0.015), wd, 0, 0.98, -L / 2 - 0.02);
    for (let x = -w / 2; x <= w / 2 + 1e-6; x += w / 6) b.mesh(rbox(0.04, 0.6, 0.04, 0.008), wd, x, 0.66, -L / 2 - 0.02);
  } else {
    const pad = fabric(rng);
    b.mesh(rbox(w + 0.1, 0.7, 0.12, 0.05, 3), pad, 0, 0.72, -L / 2 - 0.04);
  }
  b.mesh(rbox(w, 0.08, 0.05, 0.01), wd, 0, 0.44, L / 2 - 0.01);
  // mattress, sheet, blanket folded back, pillows
  b.mesh(rbox(w - 0.04, 0.2, L - 0.06, 0.06, 3), M.fabric(0xe9e6de, 'weave'), 0, 0.46, 0);
  const blanket = fabric(rng);
  b.mesh(rbox(w + 0.02, 0.05, L * 0.62, 0.025, 3), blanket, 0, 0.575, L * 0.18);
  b.mesh(rbox(w + 0.03, 0.07, 0.18, 0.035, 3), blanket, 0, 0.59, -L * 0.13);
  const pillows = double ? [-w / 4, w / 4] : [0];
  for (const x of pillows) b.mesh(rbox(double ? w / 2 - 0.08 : w - 0.2, 0.12, 0.38, 0.06, 3), M.fabric(0xf0eee8, 'weave'), x, 0.62, -L / 2 + 0.26, 0, 1, 0.12);
  b.collider(0, 0.33, 0, w + 0.06, 0.66, L);
  return { loot: [{ pos: [0, 0.7, 0.3], table: 'bed' }], sleep: [0, 0.6, 0] };
}

export function wardrobe(b, rng, { w = rng.pick([0.9, 1.2]) } = {}) {
  const wd = wood(rng);
  const H = 2.0;
  const D = 0.58;
  b.box(0, H / 2, 0, w, H, D, { px: wd, nx: wd, py: wd, pz: null, nz: wd }, { uv: 1 });
  // interior (dark) and doors slightly ajar? closed: panel doors with handles
  const inner = M.paint(0x3a2e24, 0.8);
  b.box(0, H / 2, 0.02, w - 0.04, H - 0.04, D - 0.04, { nz: inner, py: null });
  const doors = w > 1 ? 2 : 2;
  for (let i = 0; i < doors; i++) {
    const dw = w / doors - 0.006;
    const x = -w / 2 + (i + 0.5) * (w / doors);
    b.mesh(rbox(dw, H - 0.08, 0.025, 0.006), wd, x, H / 2, D / 2 + 0.005);
    b.mesh(rbox(dw - 0.1, H * 0.4, 0.01, 0.003), wd, x, H * 0.72, D / 2 + 0.02);
    b.mesh(rbox(dw - 0.1, H * 0.34, 0.01, 0.003), wd, x, H * 0.28, D / 2 + 0.02);
    b.mesh(cyl(0.008, 0.008, 0.14, 8), M.metal(0xb8a070, 0.3), x + (i ? -1 : 1) * (dw / 2 - 0.05), H * 0.52, D / 2 + 0.035);
  }
  b.mesh(rbox(w + 0.04, 0.05, D + 0.04, 0.008), wd, 0, H + 0.025, 0);
  b.collider(0, H / 2, 0, w, H, D);
  return { loot: [{ pos: [0, H + 0.08, 0], table: 'shelf' }] };
}

export function dresser(b, rng, { w = rng.pick([0.8, 1.0]) } = {}) {
  const wd = wood(rng);
  const H = 0.85;
  const D = 0.46;
  b.mesh(rbox(w, H, D, 0.01), wd, 0, H / 2, 0);
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const y = 0.14 + r * 0.25;
    for (const x of w > 0.9 && r === 2 ? [-w / 4, w / 4] : [0]) {
      const dw = w > 0.9 && r === 2 ? w / 2 - 0.04 : w - 0.05;
      b.mesh(rbox(dw, 0.22, 0.02, 0.005), wd, x, y + 0.07, D / 2 + 0.006);
      b.mesh(rbox(0.12, 0.018, 0.02, 0.006), M.metal(0xb8a070, 0.35), x, y + 0.08, D / 2 + 0.024);
    }
  }
  b.collider(0, H / 2, 0, w, H, D);
  // things on top
  const loot = [{ pos: [rng.range(-w / 3, w / 3), H + 0.02, 0], table: 'drawer' }];
  if (rng.chance(0.6)) lamp(b, rng, w / 2 - 0.15, H, -0.05);
  if (rng.chance(0.5)) photoFrame(b, rng, -w / 2 + 0.15, H, -0.08);
  return { loot };
}

export function nightstand(b, rng) {
  const wd = wood(rng);
  b.mesh(rbox(0.45, 0.5, 0.4, 0.01), wd, 0, 0.25, 0);
  b.mesh(rbox(0.4, 0.14, 0.02, 0.004), wd, 0, 0.38, 0.205);
  b.mesh(rbox(0.1, 0.016, 0.02, 0.006), M.metal(0xb8a070, 0.35), 0, 0.38, 0.22);
  if (rng.chance(0.8)) lamp(b, rng, 0.05, 0.5, -0.05);
  b.collider(0, 0.25, 0, 0.45, 0.5, 0.4);
  return { loot: [{ pos: [-0.1, 0.52, 0.05], table: 'drawer' }] };
}

export function lamp(b, rng, x, y, z) {
  const shadeCol = rng.pick([0xe8dcc0, 0xd8c8a8, 0xb8c8c0, 0xe0c8b8]);
  b.mesh(cyl(0.05, 0.065, 0.03, 16), M.ceramic(rng.pick([0x8a6a4a, 0xd8d0c0, 0x3a5a6a])), x, y + 0.015, z);
  b.mesh(cyl(0.012, 0.012, 0.26, 8), M.metal(0xa89060, 0.3), x, y + 0.16, z);
  const shade = cached('lampShade', () => {
    const g = new THREE.CylinderGeometry(0.075, 0.12, 0.17, 20, 1, true);
    return g;
  });
  b.mesh(shade, lampShadeMat(shadeCol), x, y + 0.3, z);
}

function lampShadeMat(color) {
  const m = M.fabric(color, 'weave');
  if (!m.userData.shade) {
    m.side = THREE.DoubleSide;
    m.userData.shade = true;
  }
  return m;
}

export function photoFrame(b, rng, x, y, z) {
  b.mesh(rbox(0.16, 0.2, 0.015, 0.004), M.wood(0x3a2a1c), x, y + 0.1, z, 0, 1, -0.2);
  b.mesh(rbox(0.12, 0.15, 0.004, 0.001), M.paint(rng.pick([0x8aa0b0, 0xc0a080, 0x90a080]), 0.4), x, y + 0.1, z + 0.01, 0, 1, -0.2);
}

// ------------------------------------------------------------------ living room

export function bookshelf(b, rng, { w = rng.pick([0.8, 1.0]), H = rng.pick([1.8, 2.0]) } = {}) {
  const wd = wood(rng);
  const D = 0.32;
  const t = 0.02;
  b.box(-w / 2 + t / 2, H / 2, 0, t, H, D, wd);
  b.box(w / 2 - t / 2, H / 2, 0, t, H, D, wd);
  b.box(0, H / 2, -D / 2 + 0.005, w, H, 0.01, { pz: wd, nz: wd });
  const shelves = Math.round(H / 0.36);
  const loot = [];
  for (let i = 0; i <= shelves; i++) {
    const y = 0.06 + (i * (H - 0.08)) / shelves;
    b.box(0, y, 0, w - 2 * t, t, D - 0.01, wd);
    if (i === shelves) break;
    // books, sometimes a gap with an item or an ornament
    let x = -w / 2 + t + 0.01;
    const end = w / 2 - t - 0.01;
    const gapAt = rng.chance(0.5) ? rng.range(-w / 3, w / 3) : 99;
    while (x < end - 0.03) {
      if (Math.abs(x - gapAt) < 0.1) {
        loot.push({ pos: [x + 0.08, y + t / 2 + 0.02, 0.02], table: 'shelf' });
        x += 0.2;
        continue;
      }
      const bw = rng.range(0.022, 0.05);
      const bh = rng.range(0.18, 0.3);
      const lean = rng.chance(0.08) && x > -w / 2 + 0.15 ? rng.range(0.15, 0.35) : 0;
      const col = rng.pick([0x7a2020, 0x1f3a5a, 0x2a4a2a, 0x6a5a3a, 0x3a2a4a, 0xa08040, 0x202020, 0x8a6a4a, 0xc0b090]);
      b.mesh(rbox(bw, bh, rng.range(0.16, 0.22), 0.003, 1), M.paint(col, 0.7), x + bw / 2, y + t / 2 + bh / 2 * Math.cos(lean), -0.02, 0, 1, 0, -lean);
      x += bw + (lean ? 0.03 : 0.002);
    }
  }
  b.collider(0, H / 2, 0, w, H, D);
  return { loot };
}

export function tvStand(b, rng) {
  const wd = wood(rng);
  b.mesh(rbox(1.2, 0.5, 0.42, 0.01), wd, 0, 0.25, 0);
  b.mesh(rbox(0.56, 0.36, 0.01, 0.004), M.dirtyGlass(), -0.28, 0.25, 0.212);
  b.mesh(rbox(0.5, 0.08, 0.3, 0.01), M.plastic(0x1a1a1a, 0.4), 0.28, 0.2, 0.02);
  // flat TV (2013) or an old CRT
  if (rng.chance(0.65)) {
    b.mesh(rbox(0.96, 0.58, 0.05, 0.01), M.plastic(0x121212, 0.3), 0, 0.86, -0.05);
    b.mesh(rbox(0.9, 0.52, 0.004, 0.002), M.plastic(0x05070a, 0.08), 0, 0.87, -0.022);
    b.mesh(rbox(0.3, 0.02, 0.2, 0.005), M.plastic(0x121212, 0.3), 0, 0.51, -0.05);
    b.mesh(rbox(0.06, 0.06, 0.04, 0.005), M.plastic(0x121212, 0.3), 0, 0.55, -0.05);
  } else {
    b.mesh(rbox(0.62, 0.5, 0.5, 0.04), M.plastic(0x2a2a2c, 0.45), 0, 0.76, -0.02);
    b.mesh(rbox(0.5, 0.38, 0.02, 0.03), M.plastic(0x0a0f10, 0.1), 0, 0.78, 0.23);
  }
  b.collider(0, 0.25, 0, 1.2, 0.5, 0.42);
  b.collider(0, 0.85, -0.05, 0.9, 0.6, 0.3);
  return { loot: [{ pos: [0.4, 0.52, 0.08], table: 'table' }] };
}

export function rug(b, rng, w, d) {
  const pal = rng.pick([
    [0x7a2e2a, 0xc8a878],
    [0x2a3e5a, 0xd0c090],
    [0x5a4a2a, 0xb8b0a0],
    [0x4a5a3a, 0xd8c8a0],
  ]);
  b.box(0, 0.006, 0, w, 0.012, d, { py: M.rug(pal[0], pal[1]), px: M.rug(pal[0], pal[1]), nx: M.rug(pal[0], pal[1]), pz: M.rug(pal[0], pal[1]), nz: M.rug(pal[0], pal[1]) }, { uv: 1 / Math.max(w, d) });
}

export function floorLamp(b, rng) {
  b.mesh(cyl(0.14, 0.16, 0.03, 20), M.metal(0x2a2a2a, 0.4), 0, 0.015, 0);
  b.mesh(cyl(0.012, 0.012, 1.5, 8), M.metal(0x9a8058, 0.3), 0, 0.77, 0);
  b.mesh(cached('flShade', () => new THREE.CylinderGeometry(0.12, 0.2, 0.26, 24, 1, true)), lampShadeMat(0xe8dcc0), 0, 1.55, 0);
  b.collider(0, 0.8, 0, 0.3, 1.6, 0.3);
  return { loot: [] };
}

export function plant(b, rng) {
  b.mesh(cyl(0.14, 0.1, 0.28, 18), M.ceramic(rng.pick([0x9a5a3a, 0xd8d0c0, 0x3a4a5a])), 0, 0.14, 0);
  b.mesh(cyl(0.13, 0.13, 0.02, 18), M.paint(0x3a2a1a, 1), 0, 0.27, 0);
  // dry dead plant: bent stalks
  const stalk = M.paint(0x6a5a38, 0.9);
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, Math.PI * 2);
    b.mesh(cyl(0.005, 0.008, 0.5, 5), stalk, Math.cos(a) * 0.05, 0.5, Math.sin(a) * 0.05, a, 1, rng.range(0.15, 0.5));
  }
  b.collider(0, 0.2, 0, 0.3, 0.4, 0.3);
  return { loot: [] };
}

/** Painting on a wall; the frame's back is at z = 0. */
export function painting(b, rng, w = rng.range(0.4, 0.8), h = rng.range(0.3, 0.6)) {
  b.mesh(rbox(w + 0.06, h + 0.06, 0.03, 0.006), M.wood(rng.pick([0x3a2a1c, 0x8a6a3a, 0x222222])), 0, 0, 0.015);
  b.mesh(rbox(w, h, 0.004, 0.001), paintingMat(rng.int(0, 5)), 0, 0, 0.032);
}

function paintingMat(i) {
  return M.paint([0x9aaa90, 0xc0a070, 0x7a8aa0, 0xa08070, 0x8aa0a8, 0xb8a888][i], 0.7);
}

export function curtains(b, rng, w, h) {
  const f = M.fabric(rng.pick([0xc8b890, 0x8a3a3a, 0x5a6a7a, 0xd8d0c0, 0x6a7a5a]), rng.pick(['weave', 'floral']));
  const g = cached(`curtain${w.toFixed(2)}${h.toFixed(2)}`, () => {
    const geo = new THREE.PlaneGeometry(w * 0.32, h, 16, 1);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / (w * 0.32)) * Math.PI * 7) * 0.025);
    geo.computeVertexNormals();
    return geo;
  });
  for (const s of [-1, 1]) b.mesh(g, f, s * w * 0.42, h / 2, 0.05);
  b.mesh(cyl(0.012, 0.012, w * 1.25, 8), M.metal(0x8a7050, 0.4), 0, h + 0.03, 0.05, 0, 1, 0, Math.PI / 2);
}

// ------------------------------------------------------------------ kitchen

/** Run of base cabinets with counter, optional sink / stove, upper cabinets; length along X. */
export function kitchenRun(b, rng, { length = 2.4, sink = true, stove = true, uppers = true } = {}) {
  const body = M.paint(rng.pick([0xe8e2d4, 0x9aa89a, 0xc8b89a, 0x7a8a9a]), 0.55);
  const top = rng.chance(0.5) ? M.tiles(0xd8d0c0, 0x8a8478, 8) : M.paint(rng.pick([0x5a4a3a, 0x3a3a3a, 0xb8a888]), 0.4);
  const D = 0.6;
  const H = 0.88;
  const handle = M.metal(0xc0c0c0, 0.25);
  b.box(0, H / 2 - 0.03, 0, length, H - 0.06, D - 0.04, { px: body, nx: body, pz: body, py: null });
  b.box(0, 0.05, 0.02, length, 0.1, D - 0.1, { pz: M.paint(0x2a2a2a, 0.8) });
  b.box(0, H - 0.015, 0.01, length + 0.02, 0.03, D, top);
  const n = Math.max(1, Math.round(length / 0.6));
  const cw = length / n;
  const loot = [];
  const sinkAt = sink ? rng.int(0, n - 1) : -1;
  let stoveAt = stove ? rng.int(0, n - 1) : -1;
  if (stoveAt === sinkAt) stoveAt = (stoveAt + 2) % n;
  if (n < 2) stoveAt = -1;
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (i + 0.5) * cw;
    if (i === stoveAt) {
      stoveUnit(b, x, H, D, cw);
      continue;
    }
    b.mesh(rbox(cw - 0.01, H - 0.16, 0.02, 0.004), body, x, (H - 0.16) / 2 + 0.1, D / 2 - 0.01);
    b.mesh(rbox(cw - 0.01, 0.13, 0.02, 0.004), body, x, H - 0.1, D / 2 - 0.01);
    b.mesh(rbox(0.12, 0.014, 0.02, 0.006), handle, x, H - 0.1, D / 2 + 0.01);
    b.mesh(rbox(0.014, 0.12, 0.02, 0.006), handle, x + cw / 2 - 0.06, H - 0.3, D / 2 + 0.01);
    if (i === sinkAt) {
      b.mesh(rbox(0.48, 0.02, 0.4, 0.02), M.metal(0xb8bcc0, 0.25), x, H + 0.002, 0.02);
      b.mesh(rbox(0.4, 0.004, 0.32, 0.01), M.metal(0x7a7e82, 0.35), x, H - 0.1, 0.02);
      b.mesh(cyl(0.012, 0.014, 0.28, 8), M.chrome(), x, H + 0.14, -0.2);
      b.mesh(cyl(0.01, 0.01, 0.16, 8), M.chrome(), x, H + 0.28, -0.13, 0, 1, Math.PI / 2);
    } else loot.push({ pos: [x, H + 0.02, 0.05], table: 'kitchen' });
    loot.push({ pos: [x, 0.3, 0.05], table: 'cabinet', hidden: true });
  }
  if (uppers) {
    const uy = 1.55;
    b.box(0, uy + 0.35, -D / 2 + 0.18, length, 0.7, 0.34, { px: body, nx: body, py: body, ny: body, pz: body });
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + (i + 0.5) * cw;
      b.mesh(rbox(cw - 0.01, 0.66, 0.02, 0.004), body, x, uy + 0.35, -D / 2 + 0.36);
      b.mesh(rbox(0.014, 0.1, 0.02, 0.006), handle, x + cw / 2 - 0.05, uy + 0.1, -D / 2 + 0.38);
    }
    b.collider(0, uy + 0.35, -D / 2 + 0.18, length, 0.7, 0.34);
  }
  b.collider(0, H / 2, 0, length, H, D);
  return { loot };
}

function stoveUnit(b, x, H, D, w) {
  const white = M.paint(0xe8e6e0, 0.35);
  const black = M.plastic(0x151515, 0.2);
  b.mesh(rbox(w - 0.02, H - 0.02, D - 0.02, 0.01), white, x, H / 2, 0.01);
  b.mesh(rbox(w - 0.1, 0.36, 0.01, 0.01), black, x, 0.44, D / 2);
  b.mesh(rbox(w - 0.14, 0.02, 0.03, 0.01), M.chrome(), x, 0.66, D / 2 + 0.02);
  for (const [dx, dz] of [[-0.14, -0.12], [0.14, -0.12], [-0.14, 0.12], [0.14, 0.12]]) {
    b.mesh(cyl(0.085, 0.085, 0.01, 20), M.metal(0x2a2a2a, 0.5), x + dx, H + 0.005, dz);
    b.mesh(cyl(0.05, 0.05, 0.012, 16), M.metal(0x111111, 0.6), x + dx, H + 0.011, dz);
  }
  for (let k = 0; k < 4; k++) b.mesh(cyl(0.018, 0.018, 0.025, 12), black, x - 0.18 + k * 0.12, H - 0.05, D / 2 + 0.01, 0, 1, Math.PI / 2);
}

export function fridge(b, rng) {
  const col = rng.pick([0xe8e6e0, 0xdad8d2, 0xb8bcc0, 0xe0d8c0]);
  const body = M.paint(col, 0.35);
  b.mesh(rbox(0.66, 1.75, 0.66, 0.05, 3), body, 0, 0.875, 0);
  b.mesh(rbox(0.63, 0.005, 0.02, 0.002), M.paint(0x777777, 0.6), 0, 1.2, 0.331);
  b.mesh(rbox(0.03, 0.4, 0.04, 0.012, 3), M.chrome(), 0.26, 1.42, 0.35);
  b.mesh(rbox(0.03, 0.5, 0.04, 0.012, 3), M.chrome(), 0.26, 0.8, 0.35);
  b.collider(0, 0.875, 0, 0.66, 1.75, 0.66);
  return { loot: [{ pos: [0, 1.77, 0], table: 'fridge' }] };
}

// ------------------------------------------------------------------ bathroom

let bathGeo = null;
function bathGeometries() {
  if (bathGeo) return bathGeo;
  // bathtub: a rounded box hollowed by a smaller rounded box
  const tub = fieldGeometry(
    (x, y, z) => {
      const outer = sdRoundBox(x, y - 0.28, z, 0.35, 0.27, 0.8, 0.06);
      const inner = sdRoundBox(x, y - 0.4, z, 0.3, 0.3, 0.75, 0.12);
      return smax(outer, -inner, 0.02);
    },
    [-0.4, -0.02, -0.86],
    [0.4, 0.6, 0.86],
    0.02,
  );
  const toilet = fieldGeometry(
    (x, y, z) => {
      const bowl = sdEllipsoid(x, y - 0.36, z - 0.08, 0.19, 0.12, 0.25);
      const base = sdRoundBox(x, y - 0.17, z + 0.02, 0.11, 0.17, 0.16, 0.05);
      const hollow = sdEllipsoid(x, y - 0.44, z - 0.08, 0.15, 0.12, 0.2);
      const tank = sdRoundBox(x, y - 0.62, z + 0.2, 0.2, 0.18, 0.08, 0.03);
      return Math.min(smax(smin(bowl, base, 0.06), -hollow, 0.01), tank);
    },
    [-0.24, -0.01, -0.2],
    [0.24, 0.84, 0.32],
    0.012,
  );
  const basin = fieldGeometry(
    (x, y, z) => {
      const outer = sdRoundBox(x, y, z, 0.26, 0.08, 0.2, 0.04);
      const inner = sdEllipsoid(x, y - 0.06, z, 0.2, 0.1, 0.14);
      return smax(outer, -inner, 0.01);
    },
    [-0.3, -0.1, -0.24],
    [0.3, 0.1, 0.24],
    0.01,
  );
  bathGeo = { tub, toilet, basin };
  return bathGeo;
}

export function bathtub(b) {
  const g = bathGeometries();
  b.mesh(g.tub, M.ceramic(0xf0eee8), 0, 0, 0);
  b.mesh(cyl(0.015, 0.015, 0.2, 8), M.chrome(), 0, 0.7, -0.78);
  b.collider(0, 0.28, 0, 0.7, 0.56, 1.6);
  return { loot: [] };
}

export function toilet(b) {
  const g = bathGeometries();
  b.mesh(g.toilet, M.ceramic(0xf2f0ea), 0, 0, 0, Math.PI);
  b.mesh(rbox(0.36, 0.025, 0.44, 0.012, 2), M.plastic(0xeeece6, 0.3), 0, 0.49, -0.06);
  b.collider(0, 0.4, 0, 0.44, 0.8, 0.6);
  return { loot: [] };
}

export function washbasin(b, rng) {
  const g = bathGeometries();
  b.mesh(rbox(0.1, 0.72, 0.1, 0.03, 2), M.ceramic(0xf2f0ea), 0, 0.36, -0.05);
  b.mesh(g.basin, M.ceramic(0xf2f0ea), 0, 0.8, 0);
  b.mesh(cyl(0.012, 0.014, 0.12, 8), M.chrome(), 0, 0.92, -0.14);
  // mirror cabinet on the wall
  b.mesh(rbox(0.5, 0.6, 0.12, 0.01), M.paint(0xe8e6e0, 0.4), 0, 1.5, -0.2);
  b.mesh(rbox(0.46, 0.56, 0.005, 0.002), M.chrome(), 0, 1.5, -0.138);
  b.collider(0, 0.45, 0, 0.56, 0.9, 0.42);
  return { loot: [{ pos: [0.18, 0.89, 0.05], table: 'bathroom' }] };
}

export function washingMachine(b) {
  const white = M.paint(0xeeeeea, 0.35);
  b.mesh(rbox(0.6, 0.85, 0.58, 0.03, 3), white, 0, 0.425, 0);
  b.mesh(cyl(0.2, 0.2, 0.03, 28), M.chrome(), 0, 0.46, 0.29, 0, 1, Math.PI / 2);
  b.mesh(cyl(0.16, 0.16, 0.035, 28), M.dirtyGlass(), 0, 0.46, 0.3, 0, 1, Math.PI / 2);
  b.mesh(rbox(0.5, 0.1, 0.02, 0.01), M.plastic(0xd8d8d0, 0.4), 0, 0.77, 0.29);
  b.collider(0, 0.425, 0, 0.6, 0.85, 0.58);
  return { loot: [{ pos: [0, 0.87, 0], table: 'bathroom' }] };
}

// ------------------------------------------------------------------ hall / misc

export function coatRack(b, rng) {
  const wd = wood(rng);
  b.mesh(cyl(0.2, 0.22, 0.03, 16), wd, 0, 0.015, 0);
  b.mesh(cyl(0.02, 0.025, 1.8, 10), wd, 0, 0.9, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    b.mesh(cyl(0.008, 0.01, 0.16, 6), wd, Math.cos(a) * 0.06, 1.72, Math.sin(a) * 0.06, a, 1, 0.9);
  }
  if (rng.chance(0.6)) b.mesh(rbox(0.36, 0.7, 0.14, 0.05, 3), M.fabric(rng.pick([0x3a3a2a, 0x5a2a2a, 0x2a3a4a])), 0.1, 1.3, 0);
  b.collider(0, 0.9, 0, 0.3, 1.8, 0.3);
  return { loot: [] };
}

export function cardboardBoxes(b, rng, n = rng.int(1, 4)) {
  const cb = M.paint(0xa8845a, 0.9);
  let y = 0;
  const loot = [];
  for (let i = 0; i < n; i++) {
    const w = rng.range(0.35, 0.6);
    const h = rng.range(0.25, 0.45);
    const d = rng.range(0.3, 0.5);
    const x = i > 0 && rng.chance(0.4) ? rng.range(-0.1, 0.1) : i * 0.1 - 0.1;
    b.mesh(rbox(w, h, d, 0.008, 1), cb, x, y + h / 2, 0, rng.range(-0.3, 0.3));
    b.mesh(rbox(w * 0.3, 0.002, d + 0.004, 0.001), M.paint(0xc8b890, 0.3), x, y + h + 0.001, 0);
    b.collider(x, y + h / 2, 0, w, h, d);
    y += h;
    if (y > 1.2) break;
  }
  loot.push({ pos: [0, y + 0.02, 0], table: 'junk' });
  return { loot };
}

// ------------------------------------------------------------------ garage / shop

export function workbench(b, rng, { w = 2.0 } = {}) {
  const top = M.planks(0x8a6a48, 12);
  const frame = M.metal(0x3a4a3a, 0.6);
  b.box(0, 0.9, 0, w, 0.06, 0.75, top);
  for (const s of [-1, 1]) for (const z of [-1, 1]) b.box(s * (w / 2 - 0.05), 0.44, z * 0.32, 0.06, 0.88, 0.06, frame);
  b.box(0, 0.2, 0, w - 0.1, 0.03, 0.66, M.planks(0x6a5038, 13));
  // pegboard with outlines of tools
  b.box(0, 1.55, -0.36, w, 1.0, 0.02, M.paint(0x9a8a6a, 0.9));
  const tool = M.metal(0x6a6a6a, 0.4);
  for (let i = 0; i < 7; i++) {
    const x = -w / 2 + 0.2 + i * (w - 0.4) / 6;
    b.mesh(rbox(0.03, rng.range(0.15, 0.3), 0.012, 0.005), tool, x, 1.55 + rng.range(-0.2, 0.2), -0.34, 0, 1, 0, rng.range(-0.2, 0.2));
  }
  // vice
  b.mesh(rbox(0.16, 0.1, 0.2, 0.01), M.metal(0x2a4a7a, 0.4), w / 2 - 0.2, 0.98, 0.22);
  b.collider(0, 0.46, 0, w, 0.92, 0.75);
  return { loot: [{ pos: [-w / 4, 0.96, 0.05], table: 'workbench' }, { pos: [w / 5, 0.96, 0.1], table: 'workbench' }, { pos: [0, 0.24, 0], table: 'garage' }] };
}

export function metalShelf(b, rng, { w = 1.2, H = 1.9, D = 0.45 } = {}) {
  const steel = M.metal(0x6a6e72, 0.5);
  for (const s of [-1, 1]) for (const z of [-1, 1]) b.box(s * (w / 2 - 0.02), H / 2, z * (D / 2 - 0.02), 0.035, H, 0.035, steel);
  const loot = [];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const y = 0.12 + (i * (H - 0.2)) / (n - 1);
    b.box(0, y, 0, w, 0.02, D, steel);
    if (i < n - 1) {
      loot.push({ pos: [rng.range(-w / 3, w / 3), y + 0.03, 0], table: 'shelf' });
      // clutter: cans, boxes
      for (let k = 0; k < rng.int(1, 4); k++) {
        const x = rng.range(-w / 2 + 0.12, w / 2 - 0.12);
        if (rng.chance(0.5)) b.mesh(cyl(0.05, 0.05, 0.14, 12), M.paint(rng.pick([0x9a3a2a, 0x3a5a8a, 0xc8a040, 0x5a5a5a]), 0.5), x, y + 0.08, rng.range(-0.1, 0.1));
        else b.mesh(rbox(0.2, 0.14, 0.2, 0.004, 1), M.paint(0xa8845a, 0.9), x, y + 0.08, rng.range(-0.1, 0.1));
      }
    }
  }
  b.collider(0, H / 2, 0, w, H, D);
  return { loot };
}

export function tireStack(b, rng, n = rng.int(2, 4)) {
  const g = cached('tire', () => new THREE.TorusGeometry(0.24, 0.1, 10, 24).rotateX(Math.PI / 2));
  for (let i = 0; i < n; i++) b.mesh(g, M.rubber(), rng.range(-0.02, 0.02), 0.1 + i * 0.2, rng.range(-0.02, 0.02));
  b.collider(0, n * 0.1, 0, 0.68, n * 0.2, 0.68);
  return { loot: [] };
}

export function oilDrum(b, rng) {
  const col = rng.pick([0x2a4a7a, 0x8a2a1a, 0x3a5a3a, 0x5a5a5a]);
  b.mesh(cyl(0.29, 0.29, 0.88, 24), M.paint(col, 0.5), 0, 0.44, 0);
  for (const y of [0.3, 0.6]) b.mesh(cached('drumRib', () => new THREE.TorusGeometry(0.292, 0.012, 6, 28).rotateX(Math.PI / 2)), M.paint(col, 0.5), 0, y, 0);
  b.collider(0, 0.44, 0, 0.58, 0.88, 0.58);
  return { loot: [{ pos: [0, 0.9, 0], table: 'garage' }] };
}

export function shopShelf(b, rng, { w = 1.8 } = {}) {
  const H = 1.5;
  const D = 0.9;
  const steel = M.paint(0xd8d8d0, 0.4);
  b.box(0, H / 2, 0, 0.04, H, D, steel);
  b.box(0, 0.08, 0, w, 0.16, D, steel);
  const loot = [];
  for (let i = 0; i < 4; i++) {
    const y = 0.2 + i * 0.36;
    for (const s of [-1, 1]) {
      b.box(0, y, s * (D / 4 + 0.01), w, 0.02, D / 2 - 0.04, steel);
      for (let x = -w / 2 + 0.1; x < w / 2 - 0.1; x += rng.range(0.12, 0.24)) {
        if (rng.chance(0.35)) continue;
        const kind = rng.int(0, 3);
        const c = rng.pick([0xc83a2a, 0x2a6aaa, 0xe8c040, 0x3a8a4a, 0xe8e0d0, 0x8a4a8a]);
        if (kind === 0) b.mesh(cyl(0.035, 0.035, 0.11, 10), M.paint(c, 0.35), x, y + 0.065, s * (D / 4 + 0.06));
        else if (kind === 1) b.mesh(rbox(0.14, 0.2, 0.06, 0.004, 1), M.paint(c, 0.6), x, y + 0.11, s * (D / 4 + 0.06));
        else b.mesh(cyl(0.03, 0.035, 0.25, 10), M.plastic(c, 0.2), x, y + 0.135, s * (D / 4 + 0.06));
      }
      loot.push({ pos: [rng.range(-w / 3, w / 3), y + 0.03, s * (D / 4 + 0.08)], table: 'store' });
    }
  }
  b.collider(0, H / 2, 0, w, H, D);
  return { loot };
}

export function counter(b, rng, { w = 2.2 } = {}) {
  const body = M.paint(0x8a3a2a, 0.5);
  b.box(0, 0.5, 0, w, 1.0, 0.6, { px: body, nx: body, pz: body, nz: body, py: M.paint(0x3a3a3a, 0.3) });
  // cash register
  b.mesh(rbox(0.4, 0.14, 0.36, 0.02, 2), M.plastic(0x2a2a2a, 0.4), w / 2 - 0.4, 1.07, 0);
  b.mesh(rbox(0.3, 0.16, 0.04, 0.01), M.plastic(0x1a1a1a, 0.3), w / 2 - 0.4, 1.2, -0.12, 0, 1, -0.4);
  b.collider(0, 0.5, 0, w, 1.0, 0.6);
  return { loot: [{ pos: [-w / 4, 1.02, 0], table: 'store' }, { pos: [w / 2 - 0.4, 0.3, -0.15], table: 'register', hidden: true }] };
}

export function drinkFridge(b) {
  const body = M.paint(0x2a5aaa, 0.4);
  b.box(0, 1.0, 0, 0.8, 2.0, 0.7, { px: body, nx: body, py: body, nz: body });
  b.mesh(rbox(0.72, 1.7, 0.01, 0.005), M.glass(), 0, 1.0, 0.345);
  const shelfMat = M.metal(0xc0c0c0, 0.4);
  for (let i = 0; i < 4; i++) {
    b.box(0, 0.35 + i * 0.4, 0, 0.74, 0.015, 0.6, shelfMat);
    for (let k = 0; k < 6; k++) b.mesh(cyl(0.032, 0.032, 0.22, 10), M.plastic([0xc02020, 0x20a040, 0xe0a020, 0x2060c0][(i + k) % 4], 0.2), -0.3 + k * 0.12, 0.47 + i * 0.4, 0.12);
  }
  b.box(0, 1.9, 0.36, 0.8, 0.18, 0.02, M.emissive(0xd8e8ff, 0.4));
  b.collider(0, 1.0, 0, 0.8, 2.0, 0.7);
  return { loot: [{ pos: [0, 2.02, 0], table: 'store' }] };
}
