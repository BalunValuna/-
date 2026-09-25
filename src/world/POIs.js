import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { ROAD } from './worldgen.js';
import { createColliders } from './build/Builder.js';
import { buildHouse } from './build/house.js';
import { buildGarage } from './build/garage.js';
import { buildStation } from './build/station.js';
import { buildTrailer, buildShack, buildMotel, buildBusStop, buildBillboard, buildTower, buildCheckpoint, buildMinefield } from './build/misc.js';
import { LOOT } from '../items/defs.js';
import { randomFill } from '../items/ItemSystem.js';
import { M } from './build/materials.js';

/**
 * Places points of interest along the highway (deterministic per seed), builds them when the
 * player comes near and disposes them far away. Per-POI state (looted spots, doors) persists.
 */
const SLOT = 170;
const TYPES = [
  ['house', 22],
  ['station', 6],
  ['workshop', 4],
  ['trailer', 8],
  ['shack', 8],
  ['wreck', 16],
  ['busstop', 6],
  ['billboard', 7],
  ['tower', 3],
  ['motel', 3],
  ['checkpoint', 3],
  ['minefield', 2],
  [null, 36],
];
const DIST = { house: 26, station: 21, workshop: 20, trailer: 20, shack: 19, wreck: 6.5, busstop: 9, billboard: 16, tower: 26, motel: 24, checkpoint: 14, minefield: 30, home: 30 };
const BUILD_R = 520;
// radius of the levelled pad under each kind of plot
const PAD = { home: 19, house: 12, station: 16, workshop: 8, trailer: 8, shack: 6, motel: 14, checkpoint: 9, busstop: 4, tower: 5 };
const DROP_R = 700;

export class POIManager {
  constructor(world) {
    this.world = world;
    this.game = world.game;
    this.gen = world.gen;
    this.active = new Map();
    this.state = {};
    this.queue = [];
  }

  /** Cached slot descriptor. */
  slotCached(k) {
    if (!this.slots) this.slots = new Map();
    if (!this.slots.has(k)) this.slots.set(k, this.slot(k));
    return this.slots.get(k);
  }

  /**
   * Terrain levelling around building plots: returns { h, w } (target height, blend weight) or
   * null. Plots are levelled to the road height at their position.
   */
  padInfluence(x, z) {
    const k0 = Math.round(z / SLOT);
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      const d = this.slotCached(k);
      if (!d || !PAD[d.type]) continue;
      const r = PAD[d.type];
      const dist = Math.hypot(x - d.x, z - d.z);
      if (dist > r + 14) continue;
      if (d.padH === undefined) d.padH = this.gen.roadY(d.z) + 0.05;
      const w = dist < r ? 1 : 1 - (dist - r) / 14;
      return { h: d.padH, w: w * w * (3 - 2 * w) };
    }
    return null;
  }

  /** POI descriptor for slot k (or null). Slot 0 is the home plot. */
  slot(k) {
    if (k < 0) return null;
    const rng = new Rng(this.world.seed * 9176 + k * 7919 + 13);
    let type;
    if (k === 0) type = 'home';
    else if (k === 1) type = 'wreck';
    else if (k % 29 === 8) type = 'station';
    else type = rng.weighted(TYPES);
    if (!type) return null;
    const z = k * SLOT + (k === 0 ? 40 : rng.range(-40, 40));
    const side = k === 0 ? 1 : rng.chance(0.5) ? 1 : -1;
    const dist = DIST[type] + (type === 'wreck' ? rng.range(0, 3) : rng.range(0, 6));
    const rx = this.gen.roadX(z);
    const heading = this.gen.roadHeading(z);
    // local +Z of the POI faces the road
    const nx = Math.cos(heading);
    const nz = -Math.sin(heading);
    const x = rx + nx * dist * side;
    const zz = z + nz * dist * side;
    const rotY = heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    return { key: `${type}:${k}`, k, type, x, z: zz, rotY, side, seed: rng.int(1, 1e9) };
  }

  update(camPos, force = false, dt = 1 / 60) {
    const o = this.game.origin;
    const wz = camPos.z + o.z;
    const k0 = Math.floor((wz - BUILD_R) / SLOT);
    const k1 = Math.ceil((wz + BUILD_R) / SLOT);
    for (let k = k0; k <= k1; k++) {
      const d = this.slot(k);
      if (!d || this.active.has(d.key) || this.queue.some((q) => q.key === d.key)) continue;
      const dx = d.x - (camPos.x + o.x);
      const dz = d.z - wz;
      if (Math.hypot(dx, dz) < BUILD_R) this.queue.push(d);
    }
    this.queue.sort((a, b) => Math.abs(a.z - wz) - Math.abs(b.z - wz));
    let budget = force ? 99 : 1;
    while (budget-- > 0 && this.queue.length) this.build(this.queue.shift());
    for (const [key, p] of this.active) {
      if (Math.hypot(p.d.x - (camPos.x + o.x), p.d.z - wz) > DROP_R) this.dispose(key);
    }
    for (const p of this.active.values()) for (const door of p.doors) door.update(dt);
  }

  groundSampler(d) {
    const c = Math.cos(d.rotY);
    const s = Math.sin(d.rotY);
    return (x, z) => this.gen.height(d.x + x * c + z * s, d.z - x * s + z * c);
  }

  build(d) {
    const game = this.game;
    const o = game.origin;
    const root = new THREE.Group();
    root.name = d.key;
    root.position.set(d.x - o.x, 0, d.z - o.z);
    root.rotation.y = d.rotY;
    game.scene.add(root);
    root.updateMatrixWorld(true);
    const rng = new Rng(d.seed);
    const ctx = { game, parent: root, groundAt: this.groundSampler(d) };
    const parts = [];
    const addPart = (res, x = 0, z = 0, rotY = 0) => {
      res.group.position.set(x, 0, z);
      res.group.rotation.y = rotY;
      root.add(res.group);
      parts.push({ res, x, z, rotY });
      return res;
    };
    let special = {};
    const sub = (dx, dz, rot = 0) => ({ ...ctx, groundAt: (x, z) => ctx.groundAt(dx + x * Math.cos(rot) + z * Math.sin(rot), dz - x * Math.sin(rot) + z * Math.cos(rot)) });
    switch (d.type) {
      case 'home': {
        const garage = addPart(buildGarage(sub(5.5, 0), rng, { home: true }), 5.5, 0);
        const house = addPart(buildHouse(sub(-8.5, -1), rng, { planIndex: 0 }), -8.5, -1);
        special = { garage, house, garageAt: new THREE.Vector3(5.5, 0, 0), houseAt: new THREE.Vector3(-8.5, 0, -1) };
        this.driveway(root, ctx, 5.5, 5.4, 0, DIST.home - ROAD.totalHalf - 0.2);
        break;
      }
      case 'house':
        addPart(buildHouse(ctx, rng));
        if (rng.chance(0.35)) addPart(buildShack(sub(9, -3, 0), rng), 9, -3);
        break;
      case 'station':
        special.station = addPart(buildStation(ctx, rng));
        break;
      case 'workshop':
        addPart(buildGarage(ctx, rng));
        break;
      case 'trailer':
        addPart(buildTrailer(ctx, rng));
        break;
      case 'shack':
        addPart(buildShack(ctx, rng));
        break;
      case 'motel':
        addPart(buildMotel(ctx, rng));
        break;
      case 'busstop':
        addPart(buildBusStop(ctx, rng));
        break;
      case 'billboard':
        addPart(buildBillboard(ctx, rng));
        break;
      case 'tower':
        special.tower = addPart(buildTower(ctx, rng));
        break;
      case 'checkpoint':
        addPart(buildCheckpoint(ctx, rng));
        break;
      case 'minefield':
        special.minefield = addPart(buildMinefield(ctx, rng));
        break;
      case 'wreck':
        break;
    }
    // colliders from builders in world space
    const colliders = [];
    const offset = root.position.clone();
    for (const { res, x, z, rotY } of parts) {
      if (!res.builder && !res.group) continue;
      const list = res.builder?.colliders || res.colliders || [];
      const p = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.rotY).add(offset);
      colliders.push(...createColliders(game.physics, list, p, d.rotY + rotY));
    }
    const doors = parts.flatMap((p) => p.res.doors || []);
    const st = this.state[d.key] || (this.state[d.key] = { looted: [], doors: {} });
    doors.forEach((door, i) => {
      if (st.doors[i] !== undefined) {
        door.open = door.target = st.doors[i];
        door.apply(true);
      }
    });
    const toWorld = (partIdx, v) => {
      const { x, z, rotY } = parts[partIdx];
      return new THREE.Vector3(...(Array.isArray(v) ? v : v.toArray()))
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
        .add(new THREE.Vector3(x, 0, z))
        .applyMatrix4(root.matrixWorld);
    };
    const poi = { key: d.key, d, root, colliders, doors, parts, special, sleep: [], pumps: [], taps: [], mines: [], bounds: [], lamps: [] };
    parts.forEach((p, i) => {
      for (const s of p.res.sleep || []) poi.sleep.push(toWorld(i, s));
      if (p.res.pumps) for (const pump of p.res.pumps) poi.pumps.push({ ...pump, pos: toWorld(i, pump.pos) });
      if (p.res.tap) poi.taps.push(toWorld(i, p.res.tap));
      if (p.res.well) poi.taps.push(toWorld(i, p.res.well));
      if (p.res.mines) poi.mines.push(...p.res.mines.map((m) => toWorld(i, m)));
      if (p.res.bounds) poi.bounds.push({ ...p.res.bounds, part: i });
      for (const l of p.res.lamps || []) poi.lamps.push({ ...l, pos: toWorld(i, l.local) });
    });
    if (d.type === 'home') {
      poi.carSpot = toWorld(0, special.garage.carSpot);
      poi.bench = special.garage.bench.map((b) => toWorld(0, b));
      poi.partSpots = special.garage.partSpots.map((s) => ({ pos: toWorld(0, s.pos), rot: s.rot + d.rotY }));
      poi.houseEntrance = toWorld(1, special.house.entrance);
    }
    // loot
    let li = 0;
    const lootRng = new Rng(d.seed ^ 0x5bd1e995);
    const mult = game.difficulty?.loot ?? 1;
    parts.forEach((p, i) => {
      for (const spot of p.res.loot || []) {
        const idx = li++;
        if (st.looted.includes(idx)) continue;
        const chance = (spot.hidden ? 0.55 : 0.45) * mult;
        if (!lootRng.chance(chance)) continue;
        const table = LOOT[spot.table] || LOOT.junk;
        const id = lootRng.weighted(table);
        if (!id) continue;
        const pos = toWorld(i, spot.pos).add(new THREE.Vector3(0, 0.06, 0));
        const state = randomFill(id, lootRng);
        const item = game.items.spawn(id, pos, { rotY: lootRng.range(0, Math.PI * 2), poi: d.key, loot: idx, state: state ? { ...state } : null });
        if (item && id === 'money') item.state.amount = lootRng.int(2, 25) * 5;
        if (item && id === 'note') item.state.note = game.world.story.noteFor(d, idx, lootRng);
      }
    });
    if (d.type === 'wreck') this.world.wrecks.spawn(poi, rng);
    this.active.set(d.key, poi);
    return poi;
  }

  /** Gravel driveway from the garage apron to the road shoulder. */
  driveway(root, ctx, x, z0, _unused, z1) {
    const w = 3.2;
    const pos = [];
    const uv = [];
    const idx = [];
    const n = Math.ceil((z1 - z0) / 1.5);
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      for (const s of [-1, 1]) {
        const xx = x + (s * w) / 2;
        pos.push(xx, ctx.groundAt(xx, z) + 0.04, z);
        uv.push(s > 0 ? 1 : 0, z / 3);
      }
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.concrete(0x8a8070, 81));
    m.receiveShadow = true;
    root.add(m);
  }

  dispose(key) {
    const p = this.active.get(key);
    if (!p) return;
    const st = this.state[key];
    p.doors.forEach((door, i) => (st.doors[i] = door.target));
    for (const c of p.colliders) this.game.physics.removeCollider(c);
    for (const door of p.doors) door.dispose();
    this.game.items.removePoi(key);
    if (p.wrecks) this.world.wrecks.disposePoi(p);
    p.root.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    this.game.scene.remove(p.root);
    this.active.delete(key);
  }

  shift(dx, dz) {
    for (const p of this.active.values()) {
      p.root.position.x -= dx;
      p.root.position.z -= dz;
      p.root.updateMatrixWorld(true);
      for (const door of p.doors) door.shift(dx, dz);
      for (const list of [p.sleep, p.taps, p.mines, p.lamps.map((l) => l.pos)]) for (const v of list) (v.x -= dx), (v.z -= dz);
      for (const pump of p.pumps) (pump.pos.x -= dx), (pump.pos.z -= dz);
      if (p.carSpot) for (const v of [p.carSpot, p.houseEntrance, ...p.bench, ...p.partSpots.map((s) => s.pos)]) (v.x -= dx), (v.z -= dz);
    }
  }

  /** True if a local point is inside any building footprint (for ambience and lighting). */
  inside(p) {
    for (const poi of this.active.values()) {
      if (!poi.bounds.length) continue;
      const inv = new THREE.Matrix4().copy(poi.root.matrixWorld).invert();
      const l = p.clone().applyMatrix4(inv);
      for (const b of poi.bounds) {
        const part = poi.parts[b.part];
        const q = l.clone().sub(new THREE.Vector3(part.x, 0, part.z)).applyAxisAngle(new THREE.Vector3(0, 1, 0), -part.rotY);
        if (q.x > b.x0 && q.x < b.x1 && q.z > b.z0 && q.z < b.z1 && q.y > b.y0 - 0.2 && q.y < b.y1) return true;
      }
    }
    return false;
  }

  all() {
    return [...this.active.values()];
  }

  dispose_all() {
    for (const k of [...this.active.keys()]) this.dispose(k);
  }
}
