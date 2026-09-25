import * as THREE from 'three';
import { WorldGen } from './worldgen.js';
import { Terrain } from './terrain.js';
import { makeWorldMaterials } from '../render/worldMaterials.js';
import { POIManager } from './POIs.js';
import { Props } from './props.js';
import { Wrecks } from './Wrecks.js';
import { Story } from './Story.js';
import { Noise } from '../core/noise.js';
import { PARTS } from '../car/partsCatalog.js';
import { Rng } from '../core/rng.js';

/**
 * The world around the player: terrain and road, points of interest, props, wrecks and story.
 * Also sets up the start (home plot, car state, starting items).
 */
export class World {
  constructor(game, seed) {
    this.game = game;
    this.seed = seed;
    this.gen = new WorldGen(seed);
    this.mats = makeWorldMaterials();
    this.terrain = new Terrain({ gen: this.gen, physics: game.physics, scene: game.scene, materials: this.mats });
    this.scatterNoise = new Noise(seed + 5);
    this.goalKm = game.goalKm();
    this.story = new Story(game);
    this.pois = new POIManager(this);
    this.gen.padAt = (x, z) => this.pois.padInfluence(x, z);
    this.props = new Props(this);
    this.wrecks = new Wrecks(this);
    const homeSlot = this.pois.slot(0);
    this.homeSlot = homeSlot;
    // provisional home spots (refined once the home POI is built)
    const rx = this.gen.roadX(homeSlot.z);
    this.home = {
      carSpot: new THREE.Vector3(homeSlot.x, this.gen.height(homeSlot.x, homeSlot.z) + 0.6, homeSlot.z),
      carYaw: homeSlot.rotY + Math.PI,
      playerSpot: new THREE.Vector3(homeSlot.x, this.gen.height(homeSlot.x, homeSlot.z) + 1, homeSlot.z),
      playerYaw: homeSlot.rotY,
      roadX: rx,
    };
  }

  /** Builds everything around a point synchronously (load time). */
  warm(x, z) {
    const p = new THREE.Vector3(x - this.game.origin.x, 0, z - this.game.origin.z);
    this.terrain.warm(p.x, p.z);
    this.pois.update(p, true);
    this.props.update(p, true);
    const home = this.pois.active.get(this.homeSlot.key);
    if (home) {
      this.homePoi = home;
      const yaw = this.homeSlot.rotY;
      this.home.carSpot = home.carSpot.clone().add(new THREE.Vector3(0, 0.36, 0));
      this.home.carYaw = yaw + Math.PI;
      this.home.playerSpot = home.houseEntrance.clone();
      const toGarage = home.carSpot.clone().sub(home.houseEntrance);
      this.home.playerYaw = Math.atan2(-toGarage.x, -toGarage.z);
      this.home.menuCarSpot = this.menuSpot();
    }
  }

  /** A scenic roadside spot near home for the menu background. */
  menuSpot() {
    const z = this.homeSlot.z + 60;
    const rx = this.gen.roadX(z);
    const h = this.gen.roadHeading(z);
    const off = 5.2;
    const x = rx + Math.cos(h) * off;
    const zz = z - Math.sin(h) * off;
    return { pos: new THREE.Vector3(x, this.gen.height(x, zz) + 0.5, zz), yaw: h + Math.PI };
  }

  /** Car state and starting items for a new game / loaded save / menu. */
  populate({ start = 'ready', save = null, menu = false }) {
    const game = this.game;
    const car = game.car;
    const home = this.homePoi;
    // reset the car to a complete, fresh state
    for (const id of Object.keys(PARTS)) {
      const p = car.parts[id];
      if (p && !p.installed && p.object) {
        const it = p.object.userData.item;
        if (it) game.items.remove(it);
        car.attach(id, p.object, 1);
      }
    }
    for (const c of Object.values(car.closures)) c.open = c.target = 0;
    for (const id of Object.keys(car.closures)) car.model.setHinge(id, 0);
    car.s.running = false;
    car.s.ignition = false;
    if (menu) {
      const spot = this.home.menuCarSpot || { pos: this.home.carSpot, yaw: this.home.carYaw };
      car.vehicle.teleport(spot.pos, spot.yaw);
      car.s.fuel = 30;
      car.syncVisual();
      return;
    }
    if (save) return this.loadSave(save);
    const o = game.origin;
    const local = (v) => new THREE.Vector3(v.x - o.x, v.y, v.z - o.z);
    car.vehicle.teleport(local(this.home.carSpot), this.home.carYaw);
    car.s.fuel = 7;
    car.s.charge = 0.8;
    car.s.temp = game.ambientTemp();
    const rng = new Rng(this.seed + 1);
    if (home) {
      const bench = home.bench;
      if (start === 'ready') {
        const battery = car.detach('battery');
        battery.position.copy(bench[0]).add(new THREE.Vector3(0, 0.02, 0));
        battery.updateMatrixWorld(true);
        // the part object's origin is the car origin; move it so the battery sits on the bench
        this.placePartAt(battery, 'battery', bench[0]);
        game.items.spawnPart('battery', battery, { cond: 0.9 });
      } else {
        // bare shell: everything removable goes to the garage floor and yard
        const spots = home.partSpots;
        let s = 0;
        const order = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'engine', 'radiator', 'battery', 'airFilter', 'hood', 'trunk', 'frontDoor_L', 'frontDoor_R', 'rearDoor_L', 'rearDoor_R', 'fender_L', 'fender_R', 'frontBumper', 'rearBumper', 'headlight_L', 'headlight_R', 'taillight_L', 'taillight_R', 'seat_FL', 'seat_FR', 'rearSeat', 'windshield', 'rearWindow'];
        for (const id of order) {
          const obj = car.detach(id);
          if (!obj) continue;
          const spot = id === 'battery' || id.startsWith('headlight') || id.startsWith('taillight') || id === 'airFilter' ? { pos: bench[Math.min(s % 2, bench.length - 1)], rot: 0 } : spots[s++ % spots.length];
          const at = spot.pos.clone().add(new THREE.Vector3(rng.range(-0.3, 0.3), 0.05 + (s / spots.length | 0) * 0.35, rng.range(-0.3, 0.3)));
          this.placePartAt(obj, id, at, spot.rot);
          game.items.spawnPart(id, obj, { cond: rng.range(0.75, 1) });
        }
        car.s.fuel = 0;
        car.s.oil = 0.4;
        car.s.coolant = 0;
      }
      // starter kit on the workbench and in the garage
      const kit = [
        ['wrench', bench[1]],
        ['jerrycan', home.carSpot.clone().add(new THREE.Vector3(2.2, 0.25, 2.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.homeSlot.rotY))],
        ['oilcan', bench[1].clone().add(new THREE.Vector3(0.3, 0, 0))],
        ['coolant', bench[1].clone().add(new THREE.Vector3(-0.35, 0, 0))],
        ['water', home.houseEntrance.clone().add(new THREE.Vector3(0, 0.9, 0))],
        ['water', home.houseEntrance.clone().add(new THREE.Vector3(0.3, 0.9, 0))],
        ['stew', home.houseEntrance.clone().add(new THREE.Vector3(-0.3, 0.9, 0))],
        ['note', home.houseEntrance.clone().add(new THREE.Vector3(0.1, 0.9, 0.4))],
        ['flashlight', bench[0].clone().add(new THREE.Vector3(0.45, 0, 0))],
      ];
      for (const [id, pos] of kit) {
        const item = game.items.spawn(id, pos.clone().add(new THREE.Vector3(0, 0.08, 0)), { rotY: rng.range(0, 6), free: true });
        if (!item) continue;
        if (id === 'jerrycan') item.state = { kind: 'petrol', amount: 12 };
        if (id === 'oilcan') item.state = { kind: 'oil', amount: start === 'garage' ? 3.6 : 1.5 };
        if (id === 'coolant') item.state = { kind: 'coolant', amount: start === 'garage' ? 5 : 2 };
        if (id === 'water') item.state = { kind: 'water', amount: 1.5 };
        if (id === 'note') item.state = { note: 'home' };
      }
    }
    car.refreshMass();
    car.syncVisual();
  }

  /** Moves a detached part object so its geometry centre lands at `at` (world) with yaw `rot`. */
  placePartAt(obj, id, at, rot = 0) {
    const part = this.game.car.parts[id];
    const c = part.box.getCenter(new THREE.Vector3());
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const rise = part.box.getSize(new THREE.Vector3()).y / 2;
    obj.quaternion.copy(q);
    if (PARTS[id].wheel) {
      // wheels lean flat on the floor
      obj.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
    }
    obj.position.copy(at).sub(c.clone().applyQuaternion(obj.quaternion)).add(new THREE.Vector3(0, PARTS[id].wheel ? 0.12 : rise, 0));
    obj.updateMatrixWorld(true);
  }

  loadSave(save) {
    const game = this.game;
    const car = game.car;
    const o = game.origin;
    const c = save.car;
    car.vehicle.teleport({ x: c.pos[0] - o.x, y: c.pos[1] + 0.2, z: c.pos[2] - o.z }, 0);
    car.vehicle.body.setRotation({ x: c.rot[0], y: c.rot[1], z: c.rot[2], w: c.rot[3] }, true);
    car.load(c);
    for (const [id, p] of Object.entries(c.parts || {})) {
      if (!p.i && car.installed(id)) {
        const obj = car.detach(id);
        obj.parent?.remove(obj);
      }
    }
    for (const s of save.items || []) {
      if (s.partId) {
        const part = car.parts[s.partId];
        if (!part || part.installed) continue;
        const obj = part.object;
        obj.position.set(s.p[0] - o.x, s.p[1], s.p[2] - o.z);
        obj.quaternion.set(...s.q);
        game.items.spawnPart(s.partId, obj, { cond: s.s?.cond ?? 1 });
      } else {
        game.items.spawn(s.id, new THREE.Vector3(s.p[0] - o.x, s.p[1], s.p[2] - o.z), { quat: new THREE.Quaternion(...s.q), state: s.s, free: true });
      }
    }
    this.pois.state = save.world?.pois || {};
    car.refreshMass();
    car.syncVisual();
  }

  markLooted(key, idx) {
    const st = this.pois.state[key] || (this.pois.state[key] = { looted: [], doors: {} });
    if (!st.looted.includes(idx)) st.looted.push(idx);
  }

  update(dt, camPos) {
    this.terrain.update(camPos.x, camPos.z, 2);
    this.pois.update(camPos, false, dt);
    this.props.update(camPos);
    this.wrecks.update(dt);
    const night = this.game.env.night > 0.5;
    for (const poi of this.pois.active.values()) {
      // the home garage light is on at night; some stations still have power
      for (const l of poi.lamps) l.on = night && (poi.d.type === 'home' || poi.d.k % 3 === 0);
    }
  }

  /** Lamp sources near a point, nearest first (for the fixed light pool). */
  lampsNear(p, max) {
    const all = [];
    for (const poi of this.pois.active.values()) for (const l of poi.lamps) if (l.on) all.push(l);
    return all.sort((a, b) => a.pos.distanceToSquared(p) - b.pos.distanceToSquared(p)).slice(0, max);
  }

  insideBuilding(p) {
    return this.pois.inside(p);
  }

  shift(dx, dz) {
    this.terrain.setOrigin(this.game.origin.x, this.game.origin.z);
    this.pois.shift(dx, dz);
    this.props.shift(dx, dz);
  }

  save() {
    for (const [key, p] of this.pois.active) {
      const st = this.pois.state[key];
      p.doors.forEach((d, i) => (st.doors[i] = d.target));
    }
    return { pois: this.pois.state };
  }

  dispose() {
    this.pois.dispose_all();
    this.props.dispose();
    this.terrain.dispose?.();
  }
}
