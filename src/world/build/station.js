import * as THREE from 'three';
import { Builder } from './Builder.js';
import { M } from './materials.js';
import { wall, floor, plinth } from './structure.js';
import { Door } from './Door.js';
import * as F from './furniture.js';

/**
 * Gas station: canopy over two pump islands, a shop with shelves, counter and drink fridges,
 * a water tap and the price sign. Pumps are interactive (pay with money, fill the tank).
 */
export function buildStation(ctx, rng) {
  const b = new Builder();
  const group = new THREE.Group();
  group.name = 'station';
  let gMax = -Infinity;
  let gMin = Infinity;
  for (let x = -12; x <= 12; x += 2) {
    for (let z = -9; z <= 9; z += 2) {
      const h = ctx.groundAt(x, z);
      gMax = Math.max(gMax, h);
      gMin = Math.min(gMin, h);
    }
  }
  const y0 = gMax + 0.08;
  const slab = M.concrete(0x8e8a82, 31);
  plinth(b, -12, -9, 12, 9.5, gMin - 0.5, y0, slab);
  floor(b, -12, -9, 12, 9.5, y0, slab, { surface: 'concrete', thickness: 0.12 });
  // painted bays
  const paint = M.paint(0xe8e0c0, 0.7);
  for (const x of [-4.4, 0, 4.4]) b.box(x, y0 + 0.004, 4.5, 0.12, 0.008, 6, paint);

  // canopy on four columns
  const brand = M.paint(rng.pick([0xc0302a, 0x2a5aa0, 0x2a8a4a]), 0.45);
  const white = M.paint(0xe8e6e0, 0.5);
  for (const x of [-5, 5]) for (const z of [2.2, 6.8]) b.box(x, y0 + 2.4, z, 0.35, 4.8, 0.35, white, { collide: true, surface: 'concrete' });
  b.box(0, y0 + 5.0, 4.5, 13, 0.5, 7.2, { py: M.metal(0x6a6e70, 0.6), ny: white, px: brand, nx: brand, pz: brand, nz: brand });
  const lamps = [];
  for (const x of [-3, 3]) {
    b.box(x, y0 + 4.74, 4.5, 1.6, 0.03, 0.4, M.emissive(0xf0f4ff, 0.2));
    lamps.push({ local: new THREE.Vector3(x, y0 + 4.5, 4.5), color: 0xe8f0ff, intensity: 3, distance: 14, on: false });
  }
  // pump islands
  const pumps = [];
  for (const x of [-2.2, 2.2]) {
    b.box(x, y0 + 0.1, 4.5, 1.2, 0.2, 4.0, M.concrete(0xb8b4aa, 32), { collide: true, surface: 'concrete' });
    for (const z of [3.4, 5.6]) {
      pumpModel(b, x, y0 + 0.2, z, brand);
      pumps.push({ pos: new THREE.Vector3(x, y0 + 1.1, z), fuel: rng.chance(0.25) ? 'diesel' : 'petrol', stock: rng.chance(0.3) ? 0 : rng.range(30, 400) });
    }
  }

  // shop building behind the canopy
  const sx0 = -6;
  const sx1 = 6;
  const sz0 = -8.5;
  const sz1 = -1.5;
  const Hs = 3.2;
  const outer = M.concrete(0xd8d0c0, 33);
  const innerWall = M.plaster(0xe8e4dc, 34);
  const trim = M.paint(0x3a3a3a, 0.5);
  floor(b, sx0, sz0, sx1, sz1, y0 + 0.15, M.tiles(0xd8d4cc, 0x9a968e, 3, 35), { surface: 'concrete', ceiling: M.plaster(0xeeeeea, 36), ceilingY: Hs });
  b.box(0, y0 + 0.075, (sz0 + sz1) / 2, sx1 - sx0, 0.15, sz1 - sz0, { pz: slab }, { collide: true, surface: 'concrete' });
  const fy = y0 + 0.15;
  wall(b, { x0: sx0, z0: sz1, x1: sx1, z1: sz1, y: fy, h: Hs, t: 0.2, left: outer, right: innerWall, trim, openings: [{ at: 3.0, w: 1.0, y0: 0, y1: 2.1, kind: 'door' }, { at: 6.5, w: 2.4, y0: 0.7, y1: 2.4, kind: 'window' }, { at: 9.8, w: 2.4, y0: 0.7, y1: 2.4, kind: 'window' }], surface: 'concrete' });
  wall(b, { x0: sx1, z0: sz0, x1: sx0, z1: sz0, y: fy, h: Hs, t: 0.2, left: outer, right: innerWall, surface: 'concrete' });
  wall(b, { x0: sx0, z0: sz1, x1: sx0, z1: sz0, y: fy, h: Hs, t: 0.2, left: innerWall, right: outer, trim, openings: [{ at: 3.5, w: 1.2, y0: 1.2, y1: 2.2, kind: 'window' }], surface: 'concrete' });
  wall(b, { x0: sx1, z0: sz0, x1: sx1, z1: sz1, y: fy, h: Hs, t: 0.2, left: innerWall, right: outer, surface: 'concrete' });
  b.box(0, fy + Hs + 0.15, (sz0 + sz1) / 2, sx1 - sx0 + 0.6, 0.3, sz1 - sz0 + 0.6, { py: M.metal(0x6a6e70, 0.6), px: brand, nx: brand, pz: brand, nz: brand, ny: white });
  // shop sign
  b.box(0, fy + Hs + 0.7, sz1 + 0.35, 5.5, 0.8, 0.12, { pz: M.emissive(0xf4f0e0, 0.15), px: brand, nx: brand, py: brand, ny: brand });
  const loot = [];
  const add = (res, f) => {
    for (const l of res.loot || []) {
      const p = f.point(...l.pos);
      loot.push({ pos: [p.x, p.y, p.z], table: l.table, hidden: l.hidden });
    }
  };
  let f = b.frame(-1.5, fy, -5.2, Math.PI / 2);
  add(F.shopShelf(f, rng, { w: 3.2 }), f);
  f = b.frame(1.8, fy, -5.2, Math.PI / 2);
  add(F.shopShelf(f, rng, { w: 3.2 }), f);
  f = b.frame(4.3, fy, -3.6, -Math.PI / 2);
  add(F.counter(f, rng, { w: 2.6 }), f);
  for (const x of [-5.4, -4.5]) {
    f = b.frame(x, fy, -8.1, 0);
    add(F.drinkFridge(f, rng), f);
  }
  f = b.frame(3.2, fy, -8.1, 0);
  add(F.metalShelf(f, rng, { w: 1.6, H: 1.8 }), f);
  // price sign by the road
  priceSign(b, 10, y0, 8.5, brand);
  // water tap on the side of the shop
  b.box(sx1 + 0.12, fy + 0.8, -4, 0.08, 0.3, 0.08, M.metal(0x6a6a6a, 0.4));
  b.mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8), M.chrome(), sx1 + 0.2, fy + 0.72, -4, 0, 1, Math.PI / 2);
  f = b.frame(sx1 + 0.8, y0, -6.5, -Math.PI / 2);
  add(F.oilDrum(f, rng), f);
  b.finish(group);
  const doors = [new Door(ctx.game, group, { w: 0.96, h: 2.05, t: 0.05, at: new THREE.Vector3(sx0 + 3.0, fy, sz1), rotY: 0, hinge: 'right', mat: M.metal(0x3a3a3a, 0.4) })];
  return {
    group,
    builder: b,
    doors,
    loot,
    sleep: [],
    floorY: y0,
    pumps,
    tap: new THREE.Vector3(sx1 + 0.3, fy + 0.72, -4),
    lamps,
    bounds: { x0: sx0, z0: sz0, x1: sx1, z1: sz1, y0: fy, y1: fy + Hs },
  };
}

function pumpModel(b, x, y, z, brand) {
  const white = M.paint(0xe8e6e0, 0.4);
  b.box(x, y + 0.9, z, 0.7, 1.8, 0.45, { px: white, nx: white, py: brand, pz: white, nz: white }, { collide: true, surface: 'metal' });
  b.box(x, y + 1.9, z, 0.74, 0.2, 0.5, brand);
  for (const s of [-1, 1]) {
    b.box(x, y + 1.35, z + s * 0.23, 0.46, 0.26, 0.01, M.plastic(0x0a0f0a, 0.1));
    b.box(x + 0.2, y + 0.95, z + s * 0.24, 0.1, 0.2, 0.05, M.plastic(0x1a1a1a, 0.4));
    b.mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 16, Math.PI), M.rubber(), x - 0.36, y + 0.7, z + s * 0.1, Math.PI / 2, 1, 0, Math.PI / 2);
  }
}

function priceSign(b, x, y, z, brand) {
  const white = M.paint(0xe8e6e0, 0.5);
  b.box(x, y + 2.5, z, 0.25, 5, 0.25, white, { collide: true });
  b.box(x, y + 5.2, z, 2.2, 1.8, 0.2, { pz: brand, nz: brand, px: white, nx: white, py: white });
  b.box(x, y + 4.6, z + 0.11, 1.8, 0.35, 0.01, M.plastic(0x101010, 0.2));
  b.box(x, y + 4.6, z - 0.11, 1.8, 0.35, 0.01, M.plastic(0x101010, 0.2));
}
