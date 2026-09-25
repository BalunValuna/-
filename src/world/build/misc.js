import * as THREE from 'three';
import { Builder } from './Builder.js';
import { M } from './materials.js';
import { wall, floor, plinth, gableRoof, steps } from './structure.js';
import { Door } from './Door.js';
import * as F from './furniture.js';

/**
 * Smaller roadside places: trailer home, shack, motel row, bus stop, billboard, water tower,
 * military checkpoint and minefield. Same conventions as houses: front faces +Z.
 */
function groundRange(ctx, x0, z0, x1, z1) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let x = x0; x <= x1; x += 1) {
    for (let z = z0; z <= z1; z += 1) {
      const h = ctx.groundAt(x, z);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
  }
  return [lo, hi];
}

function collect(list, f, res) {
  for (const l of res.loot || []) {
    const p = f.point(...l.pos);
    list.push({ pos: [p.x, p.y, p.z], table: l.table, hidden: l.hidden });
  }
}

export function buildTrailer(ctx, rng) {
  const b = new Builder();
  const group = new THREE.Group();
  const W = 9;
  const D = 3.2;
  const [lo, hi] = groundRange(ctx, -5, -2, 5, 3);
  const y0 = hi + 0.55;
  const skin = M.metal(rng.pick([0xd8d4c8, 0xc8d0c8, 0xd8c8b0]), 0.5);
  const stripe = M.paint(rng.pick([0x8a3a2a, 0x2a5a7a, 0x6a5a2a]), 0.5);
  const inner = M.wallpaper(0xd0c4a8, 0xb0a080, 'stripes', 7);
  // blocks under the trailer
  for (const x of [-3.5, 0, 3.5]) for (const z of [-1, 1]) b.box(x, (lo - 0.2 + y0) / 2, z, 0.4, y0 - lo + 0.2, 0.4, M.concrete(0x8a8680, 4), { collide: true });
  floor(b, -W / 2, -D / 2, W / 2, D / 2, y0, M.tiles(0xa89878, 0x6a5a48, 3, 61), { ceiling: M.plaster(0xe0dcd0), ceilingY: 2.2, surface: 'wood' });
  wall(b, { x0: -W / 2, z0: D / 2, x1: W / 2, z1: D / 2, y: y0, h: 2.3, t: 0.1, left: skin, right: inner, trim: stripe, openings: [{ at: 2.2, w: 0.8, y0: 0, y1: 1.95, kind: 'door' }, { at: 4.6, w: 1.1, y0: 0.9, y1: 1.8, kind: 'window' }, { at: 7.4, w: 1.1, y0: 0.9, y1: 1.8, kind: 'window' }] });
  wall(b, { x0: W / 2, z0: -D / 2, x1: -W / 2, z1: -D / 2, y: y0, h: 2.3, t: 0.1, left: skin, right: inner, trim: stripe, openings: [{ at: 3, w: 1.1, y0: 0.9, y1: 1.8, kind: 'window' }] });
  wall(b, { x0: -W / 2, z0: -D / 2, x1: -W / 2, z1: D / 2, y: y0, h: 2.3, t: 0.1, left: skin, right: inner });
  wall(b, { x0: W / 2, z0: D / 2, x1: W / 2, z1: -D / 2, y: y0, h: 2.3, t: 0.1, left: skin, right: inner });
  b.box(0, y0 + 2.36, 0, W + 0.2, 0.12, D + 0.2, { py: M.metal(0xb8b8b0, 0.5), px: skin, nx: skin, pz: skin, nz: skin });
  b.box(0, y0 + 0.4, D / 2 + 0.06, W, 0.12, 0.02, stripe);
  steps(b, -W / 2 + 2.2, D / 2, 1.0, ctx.groundAt(-W / 2 + 2.2, D / 2 + 0.8) - 0.05, y0 - 0.02, M.wood(0x6a5038), 1);
  const loot = [];
  let f = b.frame(-3.2, y0, -0.6, 0);
  collect(loot, f, F.bed(f.frame(0, 0, 0, Math.PI / 2), rng, { double: false }));
  f = b.frame(1.2, y0, -D / 2 + 0.4, 0);
  collect(loot, f, F.kitchenRun(f, rng, { length: 1.8, uppers: false }));
  f = b.frame(3.2, y0, 0.2, 0);
  collect(loot, f, F.diningTable(f, rng, { w: 0.9, d: 0.7 }));
  F.chair(b.frame(3.2, y0, 0.8, Math.PI), rng, 2);
  f = b.frame(-0.8, y0, 0.9, Math.PI);
  collect(loot, f, F.sofa(f, rng, { seats: 2 }));
  b.finish(group);
  const doors = [new Door(ctx.game, group, { w: 0.76, h: 1.93, t: 0.04, at: new THREE.Vector3(-W / 2 + 2.2, y0, D / 2), hinge: 'right', mat: skin })];
  return { group, doors, loot: loot.map((l) => ({ ...l, table: l.table === 'kitchen' || l.table === 'cabinet' ? 'trailer' : l.table })), sleep: [new THREE.Vector3(-3.2, y0 + 0.6, -0.6)], bounds: { x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2, y0, y1: y0 + 2.3 } };
}

export function buildShack(ctx, rng) {
  const b = new Builder();
  const group = new THREE.Group();
  const W = 4.2;
  const D = 3.6;
  const [lo, hi] = groundRange(ctx, -3, -2, 3, 3);
  const y0 = hi + 0.2;
  const boards = M.planks(rng.pick([0x7a6a54, 0x6a5a48, 0x8a7a60]), rng.int(60, 69));
  plinth(b, -W / 2, -D / 2, W / 2, D / 2, lo - 0.3, y0, M.concrete(0x7a766e, 8));
  floor(b, -W / 2, -D / 2, W / 2, D / 2, y0, M.planks(0x5a4a38, 70), { surface: 'wood' });
  const t = 0.08;
  wall(b, { x0: -W / 2, z0: D / 2, x1: W / 2, z1: D / 2, y: y0, h: 2.4, t, left: boards, right: boards, openings: [{ at: 1.2, w: 0.8, y0: 0, y1: 1.95, kind: 'door' }, { at: 3.1, w: 0.8, y0: 1.0, y1: 1.7, kind: 'window' }], glass: M.dirtyGlass() });
  wall(b, { x0: W / 2, z0: -D / 2, x1: -W / 2, z1: -D / 2, y: y0, h: 2.4, t, left: boards, right: boards });
  wall(b, { x0: -W / 2, z0: -D / 2, x1: -W / 2, z1: D / 2, y: y0, h: 2.4, t, left: boards, right: boards });
  wall(b, { x0: W / 2, z0: D / 2, x1: W / 2, z1: -D / 2, y: y0, h: 2.4, t, left: boards, right: boards });
  gableRoof(b, -W / 2, -D / 2, W / 2, D / 2, y0 + 2.4, { pitch: 0.35, overhang: 0.3, mat: M.rust(), gable: boards, fascia: boards });
  const loot = [];
  let f = b.frame(1.0, y0, -D / 2 + 0.45, 0);
  collect(loot, f, F.workbench(f, rng, { w: 1.6 }));
  f = b.frame(-W / 2 + 0.35, y0, -0.3, Math.PI / 2);
  collect(loot, f, F.metalShelf(f, rng, { w: 1.1, H: 1.6, D: 0.4 }));
  f = b.frame(-1.2, y0, 1.1, 0);
  collect(loot, f, F.cardboardBoxes(f, rng));
  b.finish(group);
  const doors = [new Door(ctx.game, group, { w: 0.76, h: 1.93, t: 0.04, at: new THREE.Vector3(-W / 2 + 1.2, y0, D / 2), hinge: 'left', mat: boards })];
  return { group, doors, loot, sleep: [], bounds: { x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2, y0, y1: y0 + 2.4 } };
}

export function buildMotel(ctx, rng) {
  const b = new Builder();
  const group = new THREE.Group();
  const rooms = 5;
  const RW = 4;
  const W = rooms * RW;
  const D = 5.5;
  const [lo, hi] = groundRange(ctx, -W / 2 - 1, -D / 2, W / 2 + 1, D / 2 + 4);
  const y0 = hi + 0.25;
  const outer = M.concrete(rng.pick([0xd8c0a0, 0xc8b8a8, 0xb8c0b0]), 71);
  const trim = M.paint(0x6a3a2a, 0.5);
  plinth(b, -W / 2 - 0.1, -D / 2 - 0.1, W / 2 + 0.1, D / 2 + 2.6, lo - 0.3, y0, M.concrete(0x9a968e, 9));
  const loot = [];
  const sleep = [];
  const doors = [];
  for (let i = 0; i < rooms; i++) {
    const x0 = -W / 2 + i * RW;
    const x1 = x0 + RW;
    const wp = M.wallpaper(...rng.pick([[0xc9bca0, 0xa8997a, 'stripes'], [0xb8c2b0, 0x98a690, 'damask'], [0xd8c8b0, 0xb8a080, 'dots']]), 72 + i);
    floor(b, x0, -D / 2, x1, D / 2, y0, M.fabric(rng.pick([0x6a5a4a, 0x4a5a6a, 0x5a4a5a]), 'weave'), { ceiling: M.plaster(0xe8e4dc), ceilingY: 2.6, surface: 'wood' });
    wall(b, { x0, z0: D / 2, x1, z1: D / 2, y: y0, h: 2.6, t: 0.18, left: outer, right: wp, trim, openings: [{ at: 1.0, w: 0.9, y0: 0, y1: 2.05, kind: 'door' }, { at: 2.8, w: 1.3, y0: 0.9, y1: 2.0, kind: 'window' }] });
    if (i === 0) wall(b, { x0, z0: -D / 2, x1: x0, z1: D / 2, y: y0, h: 2.6, t: 0.18, left: outer, right: wp });
    wall(b, { x0: x1, z0: D / 2, x1, z1: -D / 2, y: y0, h: 2.6, t: 0.18, left: i === rooms - 1 ? outer : wp, right: wp });
    const f = b.frame((x0 + x1) / 2 + 0.6, y0, -0.4, 0);
    const bedRes = F.bed(f.frame(0, 0, -D / 2 + 1.45, 0), rng, { double: true });
    collect(loot, f, bedRes);
    sleep.push(f.point(0, 0.6, -D / 2 + 1.45 - 0.4 + 0.4));
    const ns = b.frame(x0 + 0.5, y0, -D / 2 + 0.4, 0);
    collect(loot, ns, F.nightstand(ns, rng));
    const tv = b.frame(x1 - 0.8, y0, 1.4, -Math.PI / 2);
    collect(loot, tv, F.dresser(tv, rng, { w: 0.9 }));
    doors.push(new Door(ctx.game, group, { w: 0.86, h: 2.02, t: 0.045, at: new THREE.Vector3(x0 + 1.0, y0, D / 2), hinge: 'left', mat: trim, open: rng.chance(0.3) ? 0.8 : 0 }));
  }
  wall(b, { x0: W / 2, z0: -D / 2, x1: -W / 2, z1: -D / 2, y: y0, h: 2.6, t: 0.18, left: outer, right: M.plaster(0xd8d0c0) });
  // walkway roof and posts
  b.box(0, y0 + 2.75, 0, W + 0.8, 0.14, D + 3, { py: M.metal(0x7a6a5a, 0.6), ny: M.plaster(0xe8e0d0), px: trim, nx: trim, pz: trim, nz: trim });
  for (let x = -W / 2; x <= W / 2 + 1e-3; x += RW) b.box(x, y0 + 1.35, D / 2 + 2.3, 0.14, 2.7, 0.14, trim, { collide: true });
  // motel sign
  b.box(W / 2 + 2, y0 + 3, D / 2 + 4, 0.2, 6, 0.2, M.metal(0x5a5a5a), { collide: true });
  b.box(W / 2 + 2, y0 + 5.2, D / 2 + 4, 0.25, 1.6, 3.2, { px: M.emissive(0xd84030, 0.25), nx: M.emissive(0xd84030, 0.25), py: trim, ny: trim, pz: trim, nz: trim });
  b.finish(group);
  return { group, doors, loot, sleep, bounds: { x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2, y0, y1: y0 + 2.6 } };
}

export function buildBusStop(ctx, rng) {
  const b = new Builder();
  const group = new THREE.Group();
  const y0 = ctx.groundAt(0, 0) + 0.12;
  const frame = M.metal(0x3a5a4a, 0.5);
  b.box(0, y0 - 0.06, 0, 4.2, 0.18, 2.2, M.concrete(0x9a968e, 10), { collide: true, surface: 'concrete' });
  for (const x of [-1.8, 1.8]) for (const z of [-0.8, 0.6]) b.box(x, y0 + 1.2, z, 0.08, 2.4, 0.08, frame, { collide: true });
  b.box(0, y0 + 2.45, -0.1, 4.2, 0.08, 1.8, { py: M.metal(0x8a8a8a), ny: frame, px: frame, nx: frame, pz: frame, nz: frame });
  b.box(0, y0 + 1.3, -0.82, 3.6, 1.8, 0.02, M.dirtyGlass());
  b.box(0, y0 + 0.45, -0.55, 3.2, 0.06, 0.4, M.wood(0x6a5038), { collide: true });
  b.box(0, y0 + 0.22, -0.55, 3.0, 0.44, 0.06, frame);
  // timetable sign
  b.box(2.4, y0 + 1.3, 0.8, 0.06, 2.6, 0.06, frame, { collide: true });
  b.box(2.4, y0 + 2.5, 0.8, 0.5, 0.5, 0.02, M.paint(0xe8d040, 0.5));
  b.finish(group);
  return { group, doors: [], loot: [{ pos: [rng.range(-1, 1), y0 + 0.5, -0.5], table: 'junk' }], sleep: [], bounds: null };
}

export function buildBillboard(ctx, rng) {
  const b = new Builder();
  const group = new THREE.Group();
  const y0 = ctx.groundAt(0, 0);
  const wd = M.wood(0x5a4630);
  for (const x of [-2.5, 2.5]) b.box(x, y0 + 2.5, 0, 0.3, 5.5, 0.3, wd, { collide: true });
  b.box(0, y0 + 5.2, 0, 7.4, 3.2, 0.12, { pz: billboardMat(rng.int(0, 3)), nz: wd, px: wd, nx: wd, py: wd, ny: wd });
  for (let x = -3; x <= 3; x += 1.5) b.box(x, y0 + 3.4, 0.4, 0.05, 0.05, 0.8, M.metal(0x4a4a4a));
  b.box(0, y0 + 3.45, 0.75, 7, 0.06, 0.1, M.metal(0x4a4a4a));
  b.finish(group);
  return { group, doors: [], loot: [], sleep: [], bounds: null };
}

const BILLBOARDS = [
  ['МОТЕЛЬ «ОАЗИС»', 'через 12 км · горячий душ', '#c0452c', '#f2e6c8'],
  ['ПРИБРЕЖНЫЙ', 'море ближе, чем кажется', '#2a6a8a', '#f0f0e8'],
  ['ШИНЫ · РЕМОНТ', 'круглосуточно', '#e0b020', '#1a1a1a'],
  ['НЕ ОСТАНАВЛИВАЙТЕСЬ', 'после заката', '#1a1a1a', '#d8d0c0'],
];

function billboardMat(i) {
  return billboardTexMat(i);
}

const bbCache = new Map();
function billboardTexMat(i) {
  if (bbCache.has(i)) return bbCache.get(i);
  const [title, sub, bg, fg] = BILLBOARDS[i];
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 440;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 440);
  g.fillStyle = fg;
  g.font = 'bold 110px Arial Narrow, Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText(title, 512, 200, 960);
  g.font = '56px Arial, sans-serif';
  g.fillText(sub, 512, 310, 900);
  // weathering
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '60,40,20'},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 1024, Math.random() * 440, Math.random() * 30, Math.random() * 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  bbCache.set(i, m);
  return m;
}

export function buildTower(ctx, rng) {
  const b = new Builder();
  const group = new THREE.Group();
  const y0 = ctx.groundAt(0, 0);
  const steel = M.metal(0x6a6e70, 0.6);
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.box(x, y0 + 6, z, 0.25, 12, 0.25, steel, { collide: true });
  for (let y = 2; y < 12; y += 3) {
    b.box(0, y0 + y, -2, 4, 0.1, 0.1, steel);
    b.box(0, y0 + y, 2, 4, 0.1, 0.1, steel);
    b.box(-2, y0 + y, 0, 0.1, 0.1, 4, steel);
    b.box(2, y0 + y, 0, 0.1, 0.1, 4, steel);
  }
  b.mesh(new THREE.CylinderGeometry(3.2, 3.2, 4.5, 28), M.paint(rng.pick([0xa8b0b0, 0x8a9a8a]), 0.6), 0, y0 + 14.2, 0);
  b.mesh(new THREE.ConeGeometry(3.4, 1.5, 28), M.metal(0x6a6e70, 0.5), 0, y0 + 17.2, 0);
  // ladder
  for (let y = 0.3; y < 12; y += 0.35) b.box(2.35, y0 + y, 0, 0.04, 0.04, 0.5, steel);
  b.finish(group);
  return { group, doors: [], loot: [{ pos: [0.5, y0 + 0.2, 0.5], table: 'junk' }], sleep: [], bounds: null, well: new THREE.Vector3(1.5, y0 + 0.9, 1.5) };
}

export function buildCheckpoint(ctx, rng) {
  const b = new Builder();
  const group = new THREE.Group();
  const y0 = ctx.groundAt(0, 0);
  const olive = M.fabric(0x4a5234, 'weave');
  const sand = M.fabric(0x9a8a62, 'weave');
  // tent
  const tent = new THREE.CylinderGeometry(0.01, 3, 2.6, 4, 1);
  b.mesh(tent, olive, -3, y0 + 1.3, -2, Math.PI / 4);
  b.collider(-3, y0 + 1, -2, 3.6, 2, 3.6);
  // sandbag walls
  for (let i = 0; i < 12; i++) {
    const x = -1 + (i % 6) * 0.62;
    const y = y0 + 0.15 + Math.floor(i / 6) * 0.26;
    b.mesh(new THREE.CapsuleGeometry(0.13, 0.4, 4, 8).rotateZ(Math.PI / 2), sand, x, y, 2);
  }
  b.collider(0.55, y0 + 0.3, 2, 3.8, 0.6, 0.4);
  // barrier arm and booth
  b.box(4, y0 + 1.2, 1, 1.4, 2.4, 1.4, { px: M.paint(0x5a6a4a), nx: M.paint(0x5a6a4a), pz: M.paint(0x5a6a4a), nz: M.paint(0x5a6a4a), py: M.metal(0x4a4a4a) }, { collide: true });
  b.box(4, y0 + 1.6, 4, 0.2, 0.2, 5, M.paint(0xd8d0c0, 0.5));
  for (let z = 1.8; z < 6.5; z += 1) b.box(4, y0 + 1.6, z, 0.21, 0.21, 0.5, M.paint(0xc02020, 0.5));
  const loot = [];
  for (let i = 0; i < 3; i++) {
    const f = b.frame(-4 + i * 0.9, y0, -4, 0);
    f.box(0, 0.25, 0, 0.7, 0.5, 0.45, M.paint(0x4a5234, 0.7), { collide: true });
    loot.push({ pos: f.point(0, 0.55, 0).toArray(), table: 'military' });
  }
  b.finish(group);
  return { group, doors: [], loot, sleep: [], bounds: null };
}

export function buildMinefield(ctx, rng) {
  const b = new Builder();
  const group = new THREE.Group();
  const mines = [];
  for (let k = 0; k < 3; k++) {
    const x = -6 + k * 6;
    const y0 = ctx.groundAt(x, 0);
    b.box(x, y0 + 0.6, 0, 0.06, 1.2, 0.06, M.wood(0x5a4630), { collide: true });
    b.box(x, y0 + 1.25, 0, 0.6, 0.45, 0.03, mineSignMat());
  }
  for (let i = 0; i < 14; i++) {
    const x = rng.range(-14, 14);
    const z = rng.range(-26, -3);
    const y = ctx.groundAt(x, z);
    b.mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.05, 14), M.metal(0x4a5234, 0.6), x, y + 0.01, z);
    mines.push(new THREE.Vector3(x, y, z));
  }
  b.finish(group);
  return { group, doors: [], loot: [], sleep: [], bounds: null, mines };
}

let mineMat = null;
function mineSignMat() {
  if (mineMat) return mineMat;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#c02a1a';
  g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#f0e8d0';
  g.font = 'bold 44px Arial';
  g.textAlign = 'center';
  g.fillText('ОСТОРОЖНО!', 128, 70);
  g.fillText('МИНЫ', 128, 130);
  g.font = '60px Arial';
  g.fillText('☠', 128, 185);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  mineMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  return mineMat;
}

