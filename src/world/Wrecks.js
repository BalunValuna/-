import * as THREE from 'three';
import { carMaterials } from '../car/materials.js';
import { cloneCarModel } from '../car/cloneModel.js';
import { CarEntity } from '../car/CarEntity.js';
import { PARTS } from '../car/partsCatalog.js';
import { LOOT } from '../items/defs.js';

/**
 * Abandoned cars on the roadside: clones of the car model with faded paint, missing and worn
 * parts and some fuel left in the tank. Their parts can be unbolted and moved to the player's
 * car; they are full physics cars (heavy, handbrake on).
 */
const COLOURS = [0x6a6e70, 0x7a6a52, 0x3a4a5a, 0x8a8a84, 0x5a2a24, 0x2a3a2e, 0xa89a80, 0x4a4a4c];

export class Wrecks {
  constructor(world) {
    this.world = world;
    this.game = world.game;
    this.cars = new Set();
  }

  spawn(poi, rng) {
    const game = this.game;
    const n = rng.chance(0.3) ? 2 : 1;
    poi.wrecks = [];
    for (let i = 0; i < n; i++) {
      const mats = carMaterials(rng.pick(COLOURS));
      // faded, weathered paint on every painted surface
      for (const m of [mats.paint, mats.paintShell]) {
        m.clearcoat = rng.range(0.05, 0.35);
        m.roughness = rng.range(0.45, 0.75);
        m.metalness = 0.25;
      }
      const model = cloneCarModel(game.carProto, game.protoMats, mats);
      const local = new THREE.Vector3(i * 6 - (n - 1) * 3, 0, rng.range(-1, 1));
      const p = local.applyAxisAngle(new THREE.Vector3(0, 1, 0), poi.d.rotY).add(poi.root.position);
      p.y = game.groundHeight(p.x, p.z) + 0.55;
      const yaw = poi.d.rotY + Math.PI / 2 + rng.range(-0.35, 0.35) + (rng.chance(0.5) ? Math.PI : 0);
      const car = new CarEntity(game, { model, mats, position: p, yaw, lights: false });
      car.wreck = true;
      game.scene.add(car.root);
      // wear, missing parts, fluids
      for (const [id, part] of Object.entries(car.parts)) {
        part.cond = rng.range(0.2, 0.9);
        const pMissing = PARTS[id].wheel ? 0.25 : id === 'engine' ? 0.25 : id === 'battery' ? 0.55 : 0.18;
        if (rng.chance(pMissing)) {
          const obj = car.detach(id);
          obj?.parent?.remove(obj);
        }
      }
      if (car.installed('trunk') && rng.chance(0.3)) car.closures.trunk.target = 1;
      if (car.installed('frontDoor_L') && rng.chance(0.4)) car.closures.frontDoor_L.target = rng.range(0.3, 1);
      car.s.fuel = rng.chance(0.4) ? 0 : rng.range(1, 18);
      car.s.charge = rng.range(0, 0.5);
      car.s.oil = rng.range(0.5, 3);
      car.s.coolant = rng.range(0, 4);
      car.vehicle.setInput({ handbrake: 1 });
      car.refreshMass();
      // trunk and back seat loot
      const lootIdx = [car.worldPoint(new THREE.Vector3(0, 0.6, 1.8)), car.worldPoint(new THREE.Vector3(0.3, 0.75, 0.9))];
      for (const pos of lootIdx) {
        if (!rng.chance(0.5)) continue;
        const id = rng.weighted(LOOT.wreck);
        game.items.spawn(id, pos.add(new THREE.Vector3(0, 0.1, 0)), { poi: poi.key, loot: 900 + i });
      }
      poi.wrecks.push(car);
      this.cars.add(car);
    }
  }

  update(dt) {
    for (const car of this.cars) {
      car.update(dt);
      car.syncVisual();
    }
  }

  physicsStep(dt) {
    for (const car of this.cars) {
      car.idleInputs();
      car.vehicle.setInput({ handbrake: 1 });
      car.physicsStep(dt);
    }
  }

  disposePoi(poi) {
    for (const car of poi.wrecks || []) {
      car.vehicle.dispose();
      this.game.scene.remove(car.root);
      this.cars.delete(car);
    }
    poi.wrecks = [];
  }

  all() {
    return [...this.cars];
  }
}
