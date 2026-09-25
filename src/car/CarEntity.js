import * as THREE from 'three';
import { Vehicle } from '../vehicle/Vehicle.js';
import { CarLights } from './CarLights.js';
import { PARTS, BARE_MASS, TANK, kindOf } from './partsCatalog.js';
import { CAR } from './design.js';
import { clamp, clamp01, lerp } from '../core/math.js';

/**
 * A drivable car in the world: the visual model, its vehicle physics, installed parts with their
 * condition, fluids and electrics, lights, gauges and hinged closures.
 */
const PASSIVE_PARTS = new Set(Object.keys(PARTS));
export const SEATS = {
  driver: { eye: new THREE.Vector3(-0.36, 1.13, 0.16), exit: new THREE.Vector3(-1.45, 0.2, 0.05), door: 'frontDoor_L', seat: 'seat_FL' },
  passenger: { eye: new THREE.Vector3(0.36, 1.13, 0.16), exit: new THREE.Vector3(1.45, 0.2, 0.05), door: 'frontDoor_R', seat: 'seat_FR' },
};
/** Service points in car space. */
export const SERVICE = {
  fuel: new THREE.Vector3(0.87, 0.9, 1.7),
  oil: new THREE.Vector3(0.06, 0.86, -1.47),
  coolant: new THREE.Vector3(0.4, 0.8, -1.74),
  engine: new THREE.Vector3(0, 0.6, -1.45),
};

export class CarEntity {
  constructor(game, { model, mats, position, yaw = 0, state = null, shadows = false }) {
    this.game = game;
    this.model = model;
    this.mats = mats;
    this.root = model.root;
    this.root.matrixAutoUpdate = true;
    this.controls = model.controls;
    this.kind = 'car';

    this.parts = {};
    for (const id of Object.keys(PARTS)) {
      const obj = model.parts[id];
      if (!obj) continue;
      const pivot = model.pivots[id] || null;
      obj.userData.carPart = id;
      this.parts[id] = {
        id,
        installed: true,
        cond: 1,
        object: obj,
        pivot,
        home: { position: obj.position.clone(), quaternion: obj.quaternion.clone(), scale: obj.scale.clone() },
        box: localBox(obj),
      };
    }
    this.closures = {};
    for (const id of Object.keys(model.pivots)) this.closures[id] = { open: 0, target: 0 };

    this.vehicle = new Vehicle(game.physics, {
      position,
      yaw,
      surfaceAt: (collider, p) => game.surfaceAt(collider, p),
      owner: { kind: 'car', car: this },
    });
    this.lights = new CarLights(this.root, mats, this.controls, { shadows });

    this.s = {
      fuel: 18,
      oil: TANK.oil * 0.92,
      coolant: TANK.coolant * 0.95,
      charge: 0.85,
      temp: 30,
      odometer: 128_400,
      ignition: false,
      running: false,
      cranking: false,
      crankT: 0,
      beams: 0,
      indicator: 0, // -1 left, 1 right, 2 hazard
      horn: false,
      radioOn: false,
      radioFreq: 89.3,
      domeMode: 'door',
      damage: 0,
    };
    this.blinkT = 0;
    this.driver = null;
    this.engineSound = null;
    this.crankFailPlayed = false;
    this.brakeLamp = 0;
    this.enginePower = 0;
    this.overheat = 0;
    if (state) this.load(state);
    this.refreshMass();
  }

  // ------------------------------------------------------------------ parts

  installed(id) {
    return !!this.parts[id]?.installed;
  }

  cond(id) {
    const p = this.parts[id];
    return p?.installed ? p.cond : 0;
  }

  refreshMass() {
    let m = BARE_MASS;
    for (const p of Object.values(this.parts)) if (p.installed) m += PARTS[p.id].mass;
    m += this.s.fuel * 0.74;
    this.vehicle.setMass(m);
    for (const w of this.vehicle.wheels) {
      const part = this.parts[`wheel_${w.id}`];
      w.present = !!part?.installed;
      w.grip = part ? 0.55 + 0.45 * part.cond : 1;
      w.flat = part ? part.cond < 0.12 : false;
      w.radius = w.flat ? CAR.wheelRadius - 0.045 : CAR.wheelRadius;
    }
  }

  /** Takes a part off the car; returns its object with the world transform baked in. */
  detach(id) {
    const p = this.parts[id];
    if (!p?.installed) return null;
    const obj = p.object;
    obj.updateWorldMatrix(true, false);
    const m = obj.matrixWorld.clone();
    obj.parent.remove(obj);
    m.decompose(obj.position, obj.quaternion, obj.scale);
    p.installed = false;
    if (p.pivot) this.closures[id].target = this.closures[id].open = 0;
    if (id === 'engine' && this.s.running) this.stall();
    if (id === 'battery') this.s.ignition = this.s.running ? this.s.ignition : false;
    this.refreshMass();
    return obj;
  }

  /** Fits a part object (possibly from another car of the same model) into slot `id`. */
  attach(id, obj, cond = 1) {
    const p = this.parts[id];
    if (!p || p.installed) return false;
    obj.position.copy(p.home.position);
    obj.quaternion.copy(p.home.quaternion);
    obj.scale.copy(p.home.scale);
    (p.pivot || this.root).add(obj);
    obj.userData.carPart = id;
    p.object = obj;
    p.installed = true;
    p.cond = cond;
    if (p.pivot) {
      this.closures[id].open = this.closures[id].target = 0;
      this.model.setHinge(id, 0);
    }
    this.refreshMass();
    return true;
  }

  /** Slot a held part could go into (same kind, empty). */
  freeSlotFor(partId) {
    const kind = kindOf(partId);
    return Object.values(this.parts).filter((p) => !p.installed && kindOf(p.id) === kind);
  }

  accessible(id) {
    const need = PARTS[id]?.access;
    if (!need) return true;
    return !this.installed(need) || this.closures[need]?.open > 0.6;
  }

  missingParts() {
    return Object.values(this.parts)
      .filter((p) => !p.installed)
      .map((p) => p.id);
  }

  // ------------------------------------------------------------------ closures

  toggle(id) {
    const c = this.closures[id];
    if (!c || (PARTS[id] && !this.installed(id))) return false;
    c.target = c.target > 0.5 ? 0 : 1;
    const audio = this.game.audio;
    const at = this.worldPoint(this.parts[id]?.home.position || SERVICE.fuel);
    const open = c.target > 0.5;
    const sound = id === 'hood' ? (open ? 'hood_open' : 'hood_close') : id === 'trunk' ? (open ? 'trunk_open' : 'trunk_close') : id === 'fuelDoor' ? 'latch' : open ? 'door_open' : 'door_close';
    audio?.play(sound, { pos: at });
    return true;
  }

  isOpen(id) {
    return (this.closures[id]?.open ?? 0) > 0.5 || (PARTS[id] && !this.installed(id));
  }

  anyDoorOpen() {
    return ['frontDoor_L', 'frontDoor_R', 'rearDoor_L', 'rearDoor_R'].some((d) => this.installed(d) && this.closures[d].open > 0.05);
  }

  // ------------------------------------------------------------------ electrics / engine

  get power() {
    if (!this.installed('battery')) return 0;
    return clamp01(this.s.charge * 5) * (0.4 + 0.6 * this.cond('battery'));
  }

  toggleIgnition() {
    if (this.s.running) {
      this.stall();
      this.s.ignition = false;
      this.game.audio?.play('key_turn', { pos: this.worldPoint(SEATS.driver.eye) });
      return;
    }
    this.s.ignition = !this.s.ignition;
    this.game.audio?.play('key_turn', { pos: this.worldPoint(SEATS.driver.eye) });
  }

  startCrank() {
    if (this.s.running) return;
    this.s.ignition = true;
    if (this.power < 0.15) {
      this.game.audio?.play(this.installed('battery') ? 'starter_fail' : 'click', { pos: this.worldPoint(SERVICE.engine) });
      return;
    }
    this.s.cranking = true;
    this.s.crankT = 0;
  }

  stopCrank() {
    this.s.cranking = false;
  }

  stall() {
    this.s.running = false;
    this.s.cranking = false;
    this.vehicle.engineOn = false;
  }

  /** Why the engine will not start (for hints), or null. */
  startProblem() {
    if (!this.installed('engine')) return 'engine';
    if (!this.installed('battery')) return 'battery';
    if (this.power < 0.15) return 'charge';
    if (this.s.fuel < 0.05) return 'fuel';
    if (this.s.oil < 0.3) return 'oil';
    return null;
  }

  // ------------------------------------------------------------------ per-frame

  /** Driver inputs from the player (called every physics step while driving). */
  drive(inp) {
    const v = this.vehicle;
    const canDrive = this.installed('seat_FL') || true;
    let throttle = inp.forward ? 1 : 0;
    let brake = inp.back ? 1 : 0;
    let reverseRequest = false;
    if (v.automatic) {
      if (v.gear === 0) {
        // in reverse: back is throttle, forward brakes
        throttle = inp.back ? 1 : 0;
        brake = inp.forward ? 1 : 0;
        reverseRequest = inp.back;
      } else if (inp.back && v.speed < 0.8) {
        brake = 0;
        reverseRequest = true;
      }
    }
    if (!canDrive) throttle = 0;
    v.setInput({
      throttle: throttle * (v.gear === 0 ? 0.6 : 1),
      brake,
      handbrake: inp.handbrake ? 1 : 0,
      steer: inp.steer,
      reverseRequest,
    });
  }

  idleInputs() {
    this.vehicle.setInput({ throttle: 0, brake: 0, handbrake: this.driver ? 0 : 1, steer: 0, reverseRequest: false });
  }

  physicsStep(dt) {
    const v = this.vehicle;
    const s = this.s;
    v.wetness = this.game.env?.cur.wet ?? 0;
    v.engineOn = s.running;
    const temps = this.overheat;
    const misfire = s.running ? clamp01((s.temp - 118) / 20) + (this.installed('airFilter') ? 0 : 0.05) : 0;
    v.torqueScale = (0.35 + 0.65 * this.cond('engine')) * (1 - misfire * 0.6) * (s.oil < 0.3 ? 0.6 : 1) * (1 - temps * 0);
    v.step(dt);
    const E = v.spec.engine;
    const omega = (v.rpm * 2 * Math.PI) / 60;
    const load = s.running ? v.input.throttle : 0;
    this.enginePower = load * omega * 140 * v.torqueScale;
    this.misfire = misfire;
    if (v.rpm < 400 && s.running && v.gear !== 1 && v.clutchSlip === 0) this.stall();
    if (E) this.odometerStep(dt);
  }

  odometerStep(dt) {
    this.s.odometer += (Math.abs(this.vehicle.speed) * dt) / 1000;
  }

  update(dt) {
    const s = this.s;
    const g = this.game;
    const diff = g.difficulty?.consumption ?? 1;
    // --- starter
    if (s.cranking) {
      s.charge = Math.max(0, s.charge - dt * 0.006);
      const strength = this.power;
      s.crankT += dt * (0.4 + strength);
      const problem = this.startProblem();
      const needed = 0.7 + (s.temp < 20 ? 0.6 : 0) + (1 - this.cond('engine')) * 1.5;
      if (strength < 0.12) {
        s.cranking = false;
        g.audio?.play('starter_fail', { pos: this.worldPoint(SERVICE.engine) });
      } else if (!problem && s.crankT > needed) {
        s.cranking = false;
        s.running = true;
        this.vehicle.rpm = 1300;
      }
    }
    // --- running engine
    if (s.running) {
      if (!this.installed('engine') || s.fuel <= 0 || !s.ignition || !this.installed('battery')) this.stall();
      const pkW = Math.max(0, this.enginePower) / 1000;
      s.fuel = Math.max(0, s.fuel - ((0.9 + 0.3 * pkW) / 3600) * dt * diff);
      s.oil = Math.max(0, s.oil - (0.00004 + pkW * 0.0000015) * dt);
      s.charge = clamp01(s.charge + dt * 0.0012 * (this.vehicle.rpm > 1100 ? 1 : 0.3));
      // heat: thermostat holds ~90 °C while the cooling system works
      const cooling = this.installed('radiator') ? clamp01(s.coolant / (TANK.coolant * 0.4)) * (0.3 + 0.7 * this.cond('radiator')) : 0;
      const heat = 1.2 + pkW * 0.09;
      const sink = s.temp > 88 ? (s.temp - 88) * 0.9 * cooling + (s.temp - g.ambientTemp()) * 0.004 : 0;
      s.temp += (heat - sink) * dt * 0.35;
      if (s.temp > 125) {
        this.overheat = clamp01((s.temp - 125) / 20);
        const p = this.parts.engine;
        if (p) p.cond = Math.max(0, p.cond - dt * 0.002 * this.overheat);
        if (s.temp > 142) this.stall();
      } else this.overheat = 0;
      if (s.oil < 0.3 && this.parts.engine) this.parts.engine.cond = Math.max(0, this.parts.engine.cond - dt * 0.0015);
    } else {
      s.temp += (g.ambientTemp() - s.temp) * dt * 0.004;
    }
    // --- electrical loads
    const load = (s.beams ? 0.00022 * s.beams : 0) + (s.radioOn ? 0.00005 : 0) + (this.domeLit() ? 0.00003 : 0) + (s.ignition ? 0.00005 : 0);
    if (!s.running) s.charge = Math.max(0, s.charge - load * dt);

    // --- closures animation
    for (const [id, c] of Object.entries(this.closures)) {
      if (c.open === c.target) continue;
      const speed = id.includes('Door') ? 2.6 : id === 'fuelDoor' ? 4 : 1.6;
      c.open = c.target > c.open ? Math.min(c.target, c.open + dt * speed) : Math.max(c.target, c.open - dt * speed);
      const e = c.open * c.open * (3 - 2 * c.open);
      this.model.setHinge(id, e);
    }

    // --- indicators
    this.blinkT += dt;
    const blinkOn = this.blinkT % 0.76 < 0.4;
    if (s.indicator && this.power > 0.05 && Math.floor((this.blinkT - dt) / 0.38) !== Math.floor(this.blinkT / 0.38) && this.driver) {
      g.audio?.play('click', { pos: this.worldPoint(SEATS.driver.eye), volume: 0.35 });
    }
    const v = this.vehicle;
    this.brakeLamp = v.input.brake > 0.05 && s.ignition ? 1 : 0;
    const power = this.power * (s.ignition || s.beams ? 1 : 0);
    this.lights.apply({
      beams: this.installed('headlight_L') || this.installed('headlight_R') ? s.beams : 0,
      drl: s.running,
      brake: this.brakeLamp,
      reverse: v.gear === 0 && s.ignition ? 1 : 0,
      turnL: (s.indicator === -1 || s.indicator === 2) && blinkOn,
      turnR: (s.indicator === 1 || s.indicator === 2) && blinkOn,
      dome: this.domeLit() ? 1 : 0,
      cluster: s.ignition ? 1 : 0,
      radio: s.ignition && s.radioOn ? 1 : 0,
      power: s.beams && !s.ignition ? this.power : power,
    });
    this.lights.beams[0].visible = this.installed('headlight_L');
    this.lights.beams[1].visible = this.installed('headlight_R');
  }

  domeLit() {
    if (!this.installed('battery')) return false;
    if (this.s.domeMode === 'on') return true;
    if (this.s.domeMode === 'off') return false;
    return this.anyDoorOpen();
  }

  /** Copies the physics pose to the model and animates wheels, suspension and controls. */
  syncVisual() {
    const v = this.vehicle;
    const t = v.body.translation();
    const r = v.body.rotation();
    this.root.position.set(t.x, t.y, t.z);
    this.root.quaternion.set(r.x, r.y, r.z, r.w);
    const hub = new THREE.Vector3();
    for (const w of v.wheels) {
      const wheel = this.model.wheels[w.id];
      const part = this.parts[`wheel_${w.id}`];
      v.hubLocal(w, hub);
      const corner = this.model.chassis.corners?.[w.id];
      if (corner) corner.position.y = hub.y - CAR.wheelY;
      if (!part?.installed || !wheel) continue;
      part.object.position.set(hub.x, hub.y - (w.flat ? 0.045 : 0), hub.z);
      part.object.rotation.set(0, (w.left ? Math.PI : 0) - w.steer, 0);
      wheel.spin.rotation.x = w.left ? w.spin : -w.spin;
    }
    const c = this.controls;
    if (c.steeringWheel) c.steeringWheel.rotation.z = -v.steerAngle * 13;
    const kmh = Math.abs(v.speed) * 3.6;
    const ign = this.s.ignition && this.power > 0.05;
    this.needle('speed', kmh / 220);
    this.needle('rpm', ign ? v.rpm / 8000 : 0);
    this.needle('fuel', ign ? this.s.fuel / TANK.fuel : 0);
    this.needle('temp', ign ? clamp01((this.s.temp - 40) / 90) : 0);
    if (c.pedals) {
      c.pedals.throttle && (c.pedals.throttle.rotation.x = -v.input.throttle * 0.3);
      c.pedals.brake && (c.pedals.brake.rotation.x = -v.input.brake * 0.3);
    }
  }

  needle(key, frac) {
    const n = this.controls.needles?.[key];
    if (!n) return;
    n.value = lerp(n.value ?? 0, clamp01(frac), 0.2);
    n.set(n.value);
  }

  // ------------------------------------------------------------------ geometry helpers

  worldPoint(local, out = new THREE.Vector3()) {
    return out.copy(local).applyMatrix4(this.root.matrixWorld);
  }

  localPoint(world, out = new THREE.Vector3()) {
    return out.copy(world).applyMatrix4(new THREE.Matrix4().copy(this.root.matrixWorld).invert());
  }

  get position() {
    return this.root.position;
  }

  speedKmh() {
    return Math.abs(this.vehicle.speed) * 3.6;
  }

  // ------------------------------------------------------------------ save

  save() {
    const t = this.vehicle.body.translation();
    const q = this.vehicle.body.rotation();
    const o = this.game.origin;
    return {
      pos: [t.x + o.x, t.y, t.z + o.z],
      rot: [q.x, q.y, q.z, q.w],
      s: { ...this.s, cranking: false },
      parts: Object.fromEntries(Object.values(this.parts).map((p) => [p.id, { i: p.installed, c: +p.cond.toFixed(3) }])),
      auto: this.vehicle.automatic,
    };
  }

  load(data) {
    Object.assign(this.s, data.s || {});
    this.vehicle.automatic = data.auto ?? true;
    for (const [id, p] of Object.entries(data.parts || {})) if (this.parts[id]) this.parts[id].cond = p.c;
  }
}

/** Bounding box of an object's meshes in the object's own space. */
export function localBox(obj) {
  obj.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    box.union(tmp);
  });
  return box;
}

export { PASSIVE_PARTS };
