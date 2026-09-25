import * as THREE from 'three';
import { buildBody, setHinge } from './body/body.js';
import { buildStructure } from './body/structure.js';
import { buildEngine } from './parts/engine.js';
import { buildAirBox, buildBattery, buildBayPlumbing, buildBrakeBooster, buildFuseBox, buildRadiator, buildReservoir } from './parts/bay.js';
import { buildChassis } from './parts/chassis.js';
import { buildWheel } from './parts/wheel.js';
import { buildCabin } from './interior/cabin.js';
import { CAR, WHEELS } from './design.js';

/**
 * Full visual model of the car, split into named parts (frame, body shell, closures, glass,
 * lights, engine bay parts, running gear, wheels). Parts are placed in car space; hinged parts are
 * wrapped in pivots. This is the single source for the lab, the critic and the game.
 */
export function buildCarModel(mats) {
  const t0 = performance.now();
  const root = new THREE.Group();
  root.name = 'car';
  const parts = {};
  const pivots = {};

  const body = buildBody(mats);
  Object.assign(pivots, body.pivots);
  for (const [id, obj] of Object.entries(body.parts)) parts[id] = obj;

  parts.frame = buildStructure(mats);

  const engine = buildEngine(mats);
  engine.position.set(0.06, 0.3, -1.43);
  parts.engine = engine;

  const place = (obj, x, y, z, ry = 0) => {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    return obj;
  };
  parts.radiator = place(buildRadiator(mats), 0, 0.53, -1.905);
  parts.battery = place(buildBattery(mats), -0.3, 0.685, -1.67);
  parts.airFilter = place(buildAirBox(mats), -0.32, 0.7, -1.3);
  parts.airFilter.scale.set(0.72, 1, 0.9);
  parts.coolantTank = place(buildReservoir(mats, 'coolant'), 0.4, 0.72, -1.74);
  parts.washerTank = place(buildReservoir(mats, 'washer'), 0.44, 0.76, -1.86);
  parts.brakeBooster = place(buildBrakeBooster(mats), -0.3, 0.64, -1.02);
  parts.fuseBox = place(buildFuseBox(mats), 0.34, 0.735, -1.12);
  parts.plumbing = buildBayPlumbing(mats);

  const cabin = buildCabin(mats);
  Object.assign(parts, cabin.parts);
  for (const [doorId, card] of Object.entries(cabin.doorCards)) parts[doorId].add(card);

  const chassis = buildChassis(mats);
  parts.chassis = chassis.root;

  const wheels = {};
  for (const [id, w] of Object.entries(WHEELS)) {
    const wheel = buildWheel(mats);
    wheel.root.position.set(w.x, CAR.wheelY, w.z);
    if (w.left) wheel.root.rotation.y = Math.PI;
    wheel.root.name = `wheel_${id}`;
    parts[`wheel_${id}`] = wheel.root;
    wheels[id] = wheel;
  }

  for (const [id, obj] of Object.entries(parts)) {
    obj.userData.partId = id;
    root.add(pivots[id] || obj);
  }
  root.traverse((o) => {
    if (o.isMesh && o.userData.glass) o.castShadow = false;
  });

  let triangles = 0;
  root.traverse((o) => {
    if (o.isMesh) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3;
  });

  return {
    root,
    parts,
    pivots,
    wheels,
    chassis,
    controls: cabin.controls,
    setHinge: (id, amount) => pivots[id] && setHinge(pivots[id], amount),
    stats: { ...body.stats, buildMs: Math.round(performance.now() - t0), triangles: Math.round(triangles) },
  };
}
