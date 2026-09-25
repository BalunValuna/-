import * as THREE from 'three';
import { Builder } from './Builder.js';
import { M } from './materials.js';
import { wall, floor, skirting, gableRoof, plinth, steps } from './structure.js';
import * as F from './furniture.js';
import { Door } from './Door.js';

/**
 * Detached house: one of several floor plans (mirrored at random), rooms with their own wall
 * and floor finishes, interior doors, windows with curtains, furniture placed along the walls
 * away from doors and windows, porch and gable roof. Front faces +Z.
 */
const PLANS = [
  {
    W: 10,
    D: 8.4,
    rooms: [
      ['living', 0, 3.8, 5.6, 8.4],
      ['hall', 5.6, 3.8, 7.4, 8.4],
      ['kitchen', 7.4, 3.8, 10, 8.4],
      ['bedroom', 0, 0, 4.6, 3.8],
      ['bath', 4.6, 0, 6.6, 3.8],
      ['bedroom', 6.6, 0, 10, 3.8],
    ],
    doors: [
      [6.5, 8.4, 'x', true],
      [5.6, 6.8, 'z'],
      [7.4, 6.8, 'z'],
      [6.1, 3.8, 'x'],
      [2.3, 3.8, 'x'],
      [8.4, 3.8, 'x'],
    ],
    windows: [
      [1.6, 8.4, 'x'],
      [4.1, 8.4, 'x'],
      [0, 6.1, 'z'],
      [8.7, 8.4, 'x'],
      [10, 6.1, 'z'],
      [2.3, 0, 'x'],
      [0, 1.9, 'z'],
      [8.3, 0, 'x'],
      [10, 1.9, 'z'],
      [5.6, 0, 'x', true],
    ],
  },
  {
    W: 8.6,
    D: 9.2,
    rooms: [
      ['living', 0, 4.6, 3.6, 9.2],
      ['hall', 3.6, 0, 5.0, 9.2],
      ['kitchen', 5.0, 4.6, 8.6, 9.2],
      ['bedroom', 0, 0, 3.6, 4.6],
      ['bath', 5.0, 0, 8.6, 2.3],
      ['bedroom', 5.0, 2.3, 8.6, 4.6],
    ],
    doors: [
      [4.3, 9.2, 'x', true],
      [3.6, 7.2, 'z'],
      [5.0, 7.2, 'z'],
      [3.6, 2.6, 'z'],
      [5.0, 1.2, 'z'],
      [5.0, 3.5, 'z'],
      [4.3, 0, 'x', true],
    ],
    windows: [
      [1.8, 9.2, 'x'],
      [0, 6.9, 'z'],
      [6.8, 9.2, 'x'],
      [8.6, 6.9, 'z'],
      [0, 2.3, 'z'],
      [1.8, 0, 'x'],
      [8.6, 3.45, 'z'],
      [6.8, 0, 'x', true],
    ],
  },
  {
    W: 7.2,
    D: 7.0,
    rooms: [
      ['living', 0, 3.0, 7.2, 7.0, 'kitchenette'],
      ['bedroom', 0, 0, 4.4, 3.0],
      ['bath', 4.4, 0, 7.2, 3.0],
    ],
    doors: [
      [2.2, 7.0, 'x', true],
      [2.2, 3.0, 'x'],
      [5.6, 3.0, 'x'],
    ],
    windows: [
      [4.8, 7.0, 'x'],
      [0, 5.0, 'z'],
      [7.2, 5.0, 'z'],
      [2.2, 0, 'x'],
      [0, 1.5, 'z'],
      [5.8, 0, 'x', true],
    ],
  },
];

const SIDING = [0xb7ab94, 0x9aa6a8, 0xc8b89a, 0xa4957a, 0x8f9a86, 0xd2c6ae];
const TRIM = [0xe8e2d4, 0x5a4a3a, 0xd8d0c0, 0x3f4a52];
const ROOF = [0x5a4a42, 0x4a4f55, 0x6a4034, 0x3e3a36];
const WALLPAPER = [
  [0xc9bca0, 0xa8997a, 'stripes'],
  [0xb8c2b0, 0x98a690, 'damask'],
  [0xd8c8b0, 0xb8a080, 'dots'],
  [0xc0b0a0, 0xa89080, 'damask'],
  [0xd2cfc4, 0xb0ab9c, 'stripes'],
  [0xa8b8c0, 0x90a0aa, 'check'],
];

function roomFinish(type, rng) {
  const wp = rng.pick(WALLPAPER);
  switch (type) {
    case 'kitchen':
      return { wall: rng.chance(0.5) ? M.tiles(0xe8e4da, 0xb8b4aa, 6, 21) : M.plaster(rng.pick([0xe0d8c0, 0xd8e0d0])), floor: M.tiles(rng.pick([0xb8a890, 0x8a8078, 0xd0c8b8]), 0x6a6258, 3, 22), surface: 'concrete' };
    case 'bath':
      return { wall: M.tiles(rng.pick([0xdfe8ea, 0xe8e0d0, 0xc8d8d0]), 0xa8b0b0, 5, 23), floor: M.tiles(0x9aa0a4, 0x5a6064, 5, 24), surface: 'concrete' };
    case 'hall':
      return { wall: M.plaster(rng.pick([0xd8d0c0, 0xc8c0b0])), floor: M.planks(rng.pick([0x6a4a30, 0x8a6242]), 31), surface: 'wood' };
    default:
      return { wall: rng.chance(0.75) ? M.wallpaper(...wp, rng.int(1, 9)) : M.plaster(0xd8d2c4), floor: M.planks(rng.pick([0x8a6242, 0x6e4a2f, 0xa27c55]), rng.int(1, 9)), surface: 'wood' };
  }
}

/**
 * @param ctx { game, parent: Group at the plot origin, groundAt(x, z) in plot space, home }
 * @returns { doors, loot, sleep, bounds, floorY, entrance }
 */
export function buildHouse(ctx, rng, { planIndex = rng.int(0, PLANS.length - 1) } = {}) {
  const plan = PLANS[planIndex];
  const mirror = rng.chance(0.5);
  const W = plan.W;
  const D = plan.D;
  const ox = -W / 2;
  const oz = -D / 2;
  const mx = (x) => (mirror ? W - x : x);
  // plot space: house centred on the origin, front at +Z
  const P = (x, z) => [ox + mx(x), oz + z];
  const b = new Builder();
  const group = new THREE.Group();
  group.name = 'house';

  // terrain under the footprint decides the floor level
  let gMin = Infinity;
  let gMax = -Infinity;
  for (let x = -W / 2 - 1; x <= W / 2 + 1; x += 1) {
    for (let z = -D / 2 - 1; z <= D / 2 + 1.5; z += 1) {
      const h = ctx.groundAt(x, z);
      gMin = Math.min(gMin, h);
      gMax = Math.max(gMax, h);
    }
  }
  const y0 = gMax + 0.35;
  const H = 2.7;
  const siding = M.siding(rng.pick(SIDING), rng.int(1, 5));
  const trim = M.paint(rng.pick(TRIM), 0.55);
  const roof = M.shingles(rng.pick(ROOF), rng.int(1, 5));
  const concrete = M.concrete(0x9a958c, 3);
  plinth(b, -W / 2 - 0.05, -D / 2 - 0.05, W / 2 + 0.05, D / 2 + 0.05, gMin - 0.5, y0, concrete);

  const rooms = plan.rooms.map(([type, x0, z0, x1, z1, extra]) => {
    const [ax, az] = P(x0, z0);
    const [bx, bz] = P(x1, z1);
    return { type, extra, x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: az, z1: bz, finish: roomFinish(type, rng) };
  });
  const doors = plan.doors.map(([x, z, axis, exterior]) => {
    const [px, pz] = P(x, z);
    return { x: px, z: pz, axis, exterior: !!exterior, w: exterior ? 0.96 : 0.86 };
  });
  const windows = plan.windows.map(([x, z, axis, small]) => {
    const [px, pz] = P(x, z);
    return { x: px, z: pz, axis, small: !!small, w: small ? 0.6 : 1.25 };
  });

  // floors and ceilings
  for (const r of rooms) {
    floor(b, r.x0, r.z0, r.x1, r.z1, y0, r.finish.floor, { surface: r.finish.surface, ceiling: M.plaster(0xe6e2d8, 40), ceilingY: H });
  }

  // walls: split every room edge at all breakpoints, then pair rooms on either side
  const xs = [...new Set(rooms.flatMap((r) => [r.x0, r.x1]))].sort((a, c) => a - c);
  const zs = [...new Set(rooms.flatMap((r) => [r.z0, r.z1]))].sort((a, c) => a - c);
  const roomAt = (x, z) => rooms.find((r) => x > r.x0 + 1e-3 && x < r.x1 - 1e-3 && z > r.z0 + 1e-3 && z < r.z1 - 1e-3);
  const segs = [];
  for (const z of zs) {
    for (let i = 0; i < xs.length - 1; i++) {
      const xm = (xs[i] + xs[i + 1]) / 2;
      const a = roomAt(xm, z - 0.05);
      const c = roomAt(xm, z + 0.05);
      if (a || c) segs.push({ axis: 'x', c: z, s0: xs[i], s1: xs[i + 1], minus: a, plus: c });
    }
  }
  for (const x of xs) {
    for (let i = 0; i < zs.length - 1; i++) {
      const zm = (zs[i] + zs[i + 1]) / 2;
      const a = roomAt(x - 0.05, zm);
      const c = roomAt(x + 0.05, zm);
      if (a || c) segs.push({ axis: 'z', c: x, s0: zs[i], s1: zs[i + 1], minus: a, plus: c });
    }
  }
  // merge runs with the same neighbours
  const merged = [];
  for (const s of segs.sort((p, q) => (p.axis === q.axis ? p.c - q.c || p.s0 - q.s0 : p.axis < q.axis ? -1 : 1))) {
    const last = merged[merged.length - 1];
    if (last && last.axis === s.axis && Math.abs(last.c - s.c) < 1e-6 && Math.abs(last.s1 - s.s0) < 1e-6 && last.minus === s.minus && last.plus === s.plus) last.s1 = s.s1;
    else merged.push({ ...s });
  }
  for (const s of merged) {
    const exterior = !s.minus || !s.plus;
    const t = exterior ? 0.2 : 0.12;
    const openings = [];
    for (const d of doors) {
      if (d.axis !== s.axis) continue;
      const along = s.axis === 'x' ? d.x : d.z;
      const across = s.axis === 'x' ? d.z : d.x;
      if (Math.abs(across - s.c) < 1e-3 && along > s.s0 && along < s.s1) openings.push({ at: along - s.s0, w: d.w, y0: 0, y1: 2.06, kind: 'door' });
    }
    for (const w of windows) {
      if (w.axis !== s.axis || !exterior) continue;
      const along = s.axis === 'x' ? w.x : w.z;
      const across = s.axis === 'x' ? w.z : w.x;
      if (Math.abs(across - s.c) < 1e-3 && along > s.s0 && along < s.s1) openings.push({ at: along - s.s0, w: w.w, y0: w.small ? 1.45 : 0.85, y1: 2.1, kind: 'window' });
    }
    // extend exterior walls over the corners
    const ext = exterior ? t / 2 : 0;
    const s0 = s.s0 - (exterior && isCorner(s, merged, 0) ? ext : 0);
    const s1 = s.s1 + (exterior && isCorner(s, merged, 1) ? ext : 0);
    for (const o of openings) o.at += s.s0 - s0;
    // left/right materials: for an X wall, left (+Z) is the `plus` room; for a Z wall, left (-X) is `minus`
    const outside = siding;
    const matPlus = s.plus ? s.plus.finish.wall : outside;
    const matMinus = s.minus ? s.minus.finish.wall : outside;
    const [x0, z0, x1, z1] = s.axis === 'x' ? [s0, s.c, s1, s.c] : [s.c, s0, s.c, s1];
    wall(b, {
      x0,
      z0,
      x1,
      z1,
      y: y0,
      h: H,
      t,
      left: s.axis === 'x' ? matPlus : matMinus,
      right: s.axis === 'x' ? matMinus : matPlus,
      cap: trim,
      trim,
      openings,
      surface: 'wood',
    });
  }

  // skirting per room
  const skirt = M.paint(0x6a5040, 0.6);
  for (const r of rooms) {
    const inset = 0.08;
    skirting(b, r.x0 + inset, r.z0 + inset, r.x1 - inset, r.z1 - inset, y0, skirt, doors.map((d) => ({ x: d.x, z: d.z, w: d.w + 0.1 })));
  }

  // roof, porch and steps
  const roofInfo = gableRoof(b, -W / 2, -D / 2, W / 2, D / 2, y0 + H + 0.06, { pitch: 0.55, overhang: 0.5, mat: roof, gable: siding, fascia: trim, soffit: trim });
  const front = doors.find((d) => d.exterior && d.z > 0);
  const back = doors.find((d) => d.exterior && d.z < 0);
  const porchD = 1.6;
  if (front) {
    b.box(front.x, y0 - 0.06, D / 2 + porchD / 2, 2.4, 0.12, porchD, M.planks(0x7a6048, 41), { collide: true, surface: 'wood' });
    b.box(front.x, (gMin - 0.3 + y0 - 0.12) / 2, D / 2 + porchD / 2, 2.4, y0 - 0.12 - gMin + 0.3, porchD, { px: concrete, nx: concrete, pz: concrete }, { collide: true, surface: 'concrete' });
    steps(b, front.x, D / 2 + porchD, 1.4, ctx.groundAt(front.x, D / 2 + porchD + 0.6) - 0.05, y0 - 0.02, concrete, 1);
    for (const s of [-1, 1]) b.box(front.x + s * 1.1, y0 + 1.25, D / 2 + porchD - 0.1, 0.1, 2.5, 0.1, trim);
    b.box(front.x, y0 + 2.56, D / 2 + porchD / 2 + 0.1, 2.7, 0.08, porchD + 0.4, { py: roof, ny: trim, px: trim, nx: trim, pz: trim });
  }
  if (back) steps(b, back.x, -D / 2, 1.0, ctx.groundAt(back.x, -D / 2 - 0.6) - 0.05, y0 - 0.02, concrete, -1);
  // chimney
  const chx = mirror ? -W / 2 + 1.4 : W / 2 - 1.4;
  b.box(chx, y0 + H + 1.6, -0.6, 0.6, 2.4, 0.6, M.concrete(0x8a5a48, 5));

  // interior doors (and the front door) as real hinged doors
  const doorObjs = [];
  const doorMat = M.paint(rng.pick([0x8a6a4a, 0xd8d0c0, 0x5a3a2a, 0x7a8a8a]), 0.55);
  const frontMat = M.paint(rng.pick([0x6a2a22, 0x2a4a5a, 0x3a4a2a, 0x5a3a2a]), 0.5);
  for (const d of doors) {
    const rotY = d.axis === 'x' ? 0 : Math.PI / 2;
    const open = d.exterior ? 0 : rng.chance(0.6) ? rng.range(0.4, 1) : 0;
    const door = new Door(ctx.game, group, {
      w: d.w - 0.04,
      h: 2.03,
      t: d.exterior ? 0.05 : 0.04,
      at: new THREE.Vector3(d.x, y0, d.z),
      rotY,
      hinge: rng.chance(0.5) ? 'left' : 'right',
      mat: d.exterior ? frontMat : doorMat,
      open,
    });
    doorObjs.push(door);
  }

  // furniture
  const loot = [];
  const sleep = [];
  for (const r of rooms) furnish(b, rng, r, doors, windows, y0, loot, sleep);

  b.finish(group);
  return {
    group,
    builder: b,
    doors: doorObjs,
    loot,
    sleep,
    floorY: y0,
    bounds: { x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2, y0, y1: y0 + H },
    ridge: roofInfo.ridge,
    entrance: front ? new THREE.Vector3(front.x, y0, D / 2 + porchD + 1.2) : new THREE.Vector3(0, y0, D / 2 + 2),
    rooms,
  };
}

function isCorner(seg, all, end) {
  const at = end ? seg.s1 : seg.s0;
  return all.some((o) => o !== seg && o.axis !== seg.axis && (!o.minus || !o.plus) && Math.abs(o.c - at) < 1e-3 && seg.c >= o.s0 - 1e-3 && seg.c <= o.s1 + 1e-3);
}

// ------------------------------------------------------------------ furnishing

/** Free wall intervals of a room (inside faces), minus door clearances; windows marked. */
function roomWalls(r, doors, windows) {
  const inset = 0.1;
  const walls = [
    { side: 'S', axis: 'x', c: r.z0 + inset, a: r.x0 + inset, b: r.x1 - inset, face: [0, 1], rot: 0 },
    { side: 'N', axis: 'x', c: r.z1 - inset, a: r.x0 + inset, b: r.x1 - inset, face: [0, -1], rot: Math.PI },
    { side: 'W', axis: 'z', c: r.x0 + inset, a: r.z0 + inset, b: r.z1 - inset, face: [1, 0], rot: Math.PI / 2 },
    { side: 'E', axis: 'z', c: r.x1 - inset, a: r.z0 + inset, b: r.z1 - inset, face: [-1, 0], rot: -Math.PI / 2 },
  ];
  for (const w of walls) {
    const line = w.axis === 'x' ? (w.side === 'S' ? r.z0 : r.z1) : w.side === 'W' ? r.x0 : r.x1;
    w.blocked = [];
    w.windows = [];
    for (const d of doors) {
      if (d.axis !== w.axis) continue;
      const across = w.axis === 'x' ? d.z : d.x;
      const along = w.axis === 'x' ? d.x : d.z;
      if (Math.abs(across - line) < 0.01) w.blocked.push([along - d.w / 2 - 0.45, along + d.w / 2 + 0.45]);
    }
    for (const win of windows) {
      if (win.axis !== w.axis) continue;
      const across = w.axis === 'x' ? win.z : win.x;
      const along = w.axis === 'x' ? win.x : win.z;
      if (Math.abs(across - line) < 0.01) w.windows.push([along - win.w / 2 - 0.1, along + win.w / 2 + 0.1, win]);
    }
    // doors on the perpendicular walls near this wall's ends also block the corner
    w.used = [];
  }
  return walls;
}

function overlaps(a0, a1, list) {
  return list.some(([b0, b1]) => a0 < b1 && a1 > b0);
}

/** Places a piece of width w, depth d against a free wall; returns a builder frame or null. */
function placeOnWall(b, walls, rng, w, d, { tall = false, prefer = null, centre = false } = {}) {
  const order = prefer ? walls.filter((x) => prefer.includes(x.side)).concat(rng.shuffle(walls.filter((x) => !prefer.includes(x.side)))) : rng.shuffle([...walls]);
  for (const wl of order) {
    const len = wl.b - wl.a;
    if (len < w + 0.05) continue;
    const tries = centre ? [(wl.a + wl.b) / 2] : Array.from({ length: 8 }, () => rng.range(wl.a + w / 2, wl.b - w / 2));
    if (!centre) tries.push(wl.a + w / 2 + 0.02, wl.b - w / 2 - 0.02);
    for (const at of tries) {
      const a0 = at - w / 2;
      const a1 = at + w / 2;
      if (a0 < wl.a - 1e-3 || a1 > wl.b + 1e-3) continue;
      if (overlaps(a0, a1, wl.blocked) || overlaps(a0 - 0.05, a1 + 0.05, wl.used)) continue;
      if (tall && overlaps(a0, a1, wl.windows)) continue;
      wl.used.push([a0, a1]);
      const [fx, fz] = wl.face;
      const x = wl.axis === 'x' ? at : wl.c + fx * (d / 2);
      const z = wl.axis === 'x' ? wl.c + fz * (d / 2) : at;
      return { x, z, rot: wl.rot, wall: wl, at };
    }
  }
  return null;
}

function furnish(b, rng, r, doors, windows, y0, loot, sleep) {
  const walls = roomWalls(r, doors, windows);
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const addLoot = (frame, list) => {
    for (const l of list || []) {
      const p = frame.point(...l.pos);
      loot.push({ pos: [p.x, p.y, p.z], table: l.table, hidden: l.hidden });
    }
  };
  const put = (fn, w, d, opts = {}) => {
    const spot = placeOnWall(b, walls, rng, w, d, opts);
    if (!spot) return null;
    const f = b.frame(spot.x, y0, spot.z, spot.rot);
    const res = fn(f, rng) || {};
    addLoot(f, res.loot);
    if (res.sleep) sleep.push(f.point(...res.sleep));
    return { ...spot, frame: f };
  };
  const centreFrame = (x, z, rot = 0) => b.frame(x, y0, z, rot);
  // curtains on every window of the room
  for (const wl of walls) {
    for (const [, , win] of wl.windows) {
      if (r.type === 'bath' || r.type === 'hall') continue;
      const along = wl.axis === 'x' ? win.x : win.z;
      const [fx, fz] = wl.face;
      const x = wl.axis === 'x' ? along : wl.c + fx * 0.02;
      const z = wl.axis === 'x' ? wl.c + fz * 0.02 : along;
      F.curtains(b.frame(x, y0, z, wl.rot), rng, win.w + 0.2, 2.2);
    }
  }
  const painting = (n) => {
    for (let i = 0; i < n; i++) {
      const spot = placeOnWall(b, walls, rng, 0.9, 0.02, { tall: true });
      if (!spot) return;
      spot.wall.used.pop();
      F.painting(b.frame(spot.x, y0 + rng.range(1.45, 1.7), spot.z, spot.rot), rng);
    }
  };

  switch (r.type) {
    case 'living': {
      const sofaW = rng.int(2, 3) * 0.62 + 0.36;
      const s = put((f) => F.sofa(f, rng, { seats: Math.round((sofaW - 0.36) / 0.62) }), sofaW, 0.9, { prefer: ['S', 'W', 'E'] });
      if (s) {
        const [fx, fz] = s.wall.face;
        const tx = s.x + fx * 1.05;
        const tz = s.z + fz * 1.05;
        const tf = centreFrame(tx, tz, s.rot);
        addLoot(tf, F.coffeeTable(tf, rng).loot);
        F.rug(centreFrame(tx, tz, s.rot), rng, 2.2, 1.6);
      }
      put((f) => F.tvStand(f, rng), 1.2, 0.42, { prefer: s ? [({ S: 'N', N: 'S', W: 'E', E: 'W' })[s.wall.side]] : null });
      put((f) => F.bookshelf(f, rng), 1.0, 0.32, { tall: true });
      if (rng.chance(0.7)) put((f) => F.armchair(f, rng), 0.8, 0.84);
      if (rng.chance(0.6)) put((f) => F.floorLamp(f, rng), 0.35, 0.35);
      if (rng.chance(0.5)) put((f) => F.plant(f, rng), 0.35, 0.35);
      if (r.extra === 'kitchenette') {
        put((f) => F.kitchenRun(f, rng, { length: 1.8, uppers: true }), 1.8, 0.6, { tall: true });
        put((f) => F.fridge(f, rng), 0.68, 0.66, { tall: true });
        const tf = centreFrame(cx + (r.x1 - r.x0) * 0.2, cz, 0);
        addLoot(tf, F.diningTable(tf, rng, { w: 1.0, d: 0.7 }).loot);
      }
      painting(2);
      break;
    }
    case 'kitchen': {
      const len = Math.min(3.0, Math.max(r.x1 - r.x0, r.z1 - r.z0) - 1.2);
      put((f) => F.kitchenRun(f, rng, { length: Math.max(1.2, len) }), Math.max(1.2, len), 0.6, { tall: true, prefer: ['N', 'S'] });
      put((f) => F.fridge(f, rng), 0.68, 0.66, { tall: true });
      const tf = centreFrame(cx, cz, rng.chance(0.5) ? 0 : Math.PI / 2);
      addLoot(tf, F.diningTable(tf, rng, { w: 1.1, d: 0.75 }).loot);
      for (const [dx, dz, rot] of [
        [0, 0.6, Math.PI],
        [0, -0.6, 0],
        [0.8, 0, -Math.PI / 2],
      ]) {
        if (rng.chance(0.8)) F.chair(tf.frame(dx, 0, dz, rot + rng.range(-0.3, 0.3)), rng, rng.int(0, 2));
      }
      if (rng.chance(0.5)) put((f) => F.cardboardBoxes(f, rng, 2), 0.6, 0.5);
      break;
    }
    case 'bedroom': {
      const dbl = r.x1 - r.x0 > 3 && r.z1 - r.z0 > 3.2 && rng.chance(0.7);
      const bw = dbl ? 1.6 : 1.05;
      const bedSpot = placeOnWall(b, walls, rng, bw + (dbl ? 1.1 : 0.55), 2.1, { centre: true, prefer: rng.shuffle(['S', 'N', 'W', 'E']) });
      if (bedSpot) {
        const [fx, fz] = bedSpot.wall.face;
        // the bed's head (local -Z) goes against the wall, nightstands beside it
        const bf = b.frame(bedSpot.x + fx * 0.02, y0, bedSpot.z + fz * 0.02, bedSpot.rot);
        const res = F.bed(bf, rng, { double: dbl });
        addLoot(bf, res.loot);
        sleep.push(bf.point(...res.sleep));
        for (const s of dbl ? [-1, 1] : [1]) {
          const off = (bw / 2 + 0.3) * s;
          const along = bedSpot.at + off;
          const nx = bedSpot.wall.axis === 'x' ? along : bedSpot.wall.c + fx * 0.2;
          const nz = bedSpot.wall.axis === 'x' ? bedSpot.wall.c + fz * 0.2 : along;
          const f = b.frame(nx, y0, nz, bedSpot.rot);
          addLoot(f, F.nightstand(f, rng).loot);
        }
      }
      put((f) => F.wardrobe(f, rng), 1.2, 0.58, { tall: true });
      if (rng.chance(0.7)) put((f) => F.dresser(f, rng), 1.0, 0.46);
      if (rng.chance(0.4)) put((f) => F.chair(f, rng, 1), 0.44, 0.44);
      painting(1);
      break;
    }
    case 'bath': {
      const longX = r.x1 - r.x0 > r.z1 - r.z0;
      put((f) => F.bathtub(f, rng), 1.6, 0.72, { prefer: longX ? ['N', 'S'] : ['W', 'E'] });
      put((f) => F.toilet(f, rng), 0.5, 0.62);
      put((f) => F.washbasin(f, rng), 0.6, 0.45, { tall: true });
      if (rng.chance(0.5)) put((f) => F.washingMachine(f, rng), 0.62, 0.6);
      break;
    }
    case 'hall': {
      put((f) => F.coatRack(f, rng), 0.4, 0.4);
      if (rng.chance(0.7)) put((f) => F.dresser(f, rng, { w: 0.8 }), 0.8, 0.46);
      if (rng.chance(0.5)) put((f) => F.cardboardBoxes(f, rng), 0.6, 0.5);
      painting(1);
      F.rug(centreFrame(cx, cz, (r.z1 - r.z0 > r.x1 - r.x0) ? Math.PI / 2 : 0), rng, Math.max(r.x1 - r.x0, r.z1 - r.z0) * 0.6, 0.8);
      break;
    }
  }
}
