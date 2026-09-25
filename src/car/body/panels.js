import * as THREE from 'three';
import { surfaceNets, projectToSurface } from '../../geo/surfaceNets.js';
import { clipMesh } from '../../geo/clip.js';
import { hemPanel } from '../../geo/hem.js';
import { MeshData, boundaryLoops } from '../../geo/meshData.js';
import { BODY_BOUNDS, lowerBodyField, outerField, wheelHouseField } from './shape.js';
import { CAR } from '../design.js';
import { REGIONS, onSide } from './regions.js';

/** Physical gap between neighbouring parts and the radius of their rolled edges. */
export const GAP = 0.0032;
export const ROLL = 0.0025;
const CUT = GAP / 2 + ROLL;
/** Glass runs this far under the surrounding body edge. */
const GLASS_UNDERLAP = 0.012;

const snap = (p, n) => projectToSurface(outerField, p, n, { iterations: 3, h: 4e-4, maxStep: 0.01 });
const tubSnap = (p, n) => projectToSurface(wheelHouseField, p, n, { iterations: 3, h: 4e-4, maxStep: 0.01 });

export const SIDES = [
  ['L', -1],
  ['R', 1],
];

/**
 * Cuts the body skin into its separable parts. Parts are peeled off in priority order so each
 * seam is defined exactly once, and both neighbours are trimmed back by the same amount.
 * @returns {{ skins: Record<string, MeshData>, cellMs: number }}
 */
export function cutSkin({ cell = 0.024 } = {}) {
  const t0 = performance.now();
  const skin = surfaceNets(outerField, { ...BODY_BOUNDS, cell });
  const cellMs = performance.now() - t0;
  // Wheel arches are cut exactly (a meshed crease would staircase); every panel that borders an
  // arch then gets the same rolled lip as its other edges.
  let rest = clipMesh(skin, (x, y, z) => -wheelHouseField(x, y, z), { snap });
  const skins = {};

  const take = (id, region, mode = 'panel') => {
    const grow = mode === 'glass' ? -GLASS_UNDERLAP : CUT;
    skins[id] = clipMesh(rest, (x, y, z) => region(x, y, z) + grow, { snap });
    rest = clipMesh(rest, (x, y, z) => CUT - region(x, y, z), { snap });
  };

  take('windshield', REGIONS.windshield, 'glass');
  take('rearWindow', REGIONS.rearWindow, 'glass');
  for (const [s, sign] of SIDES) take(`quarterGlass_${s}`, onSide(REGIONS.quarterGlass, sign), 'glass');
  for (const [s, sign] of SIDES) take(`headlight_${s}`, onSide(REGIONS.headlight, sign));
  for (const [s, sign] of SIDES) take(`taillight_${s}`, onSide(REGIONS.taillight, sign));
  take('hood', REGIONS.hood);
  take('trunk', REGIONS.trunk);
  take('frontBumper', REGIONS.frontBumper);
  take('rearBumper', REGIONS.rearBumper);
  for (const [s, sign] of SIDES) take(`frontDoor_${s}`, onSide(REGIONS.frontDoor, sign));
  for (const [s, sign] of SIDES) take(`rearDoor_${s}`, onSide(REGIONS.rearDoor, sign));
  for (const [s, sign] of SIDES) take(`fender_${s}`, onSide(REGIONS.fender, sign));
  take('fuelDoor', onSide(REGIONS.fuelDoor, 1));
  take('cowl', REGIONS.cowl);
  skins.body = rest;

  // openings and sub-parts of the bumpers and the trunk lid
  const front = (f) => (x, y, z) => Math.max(f(x, y, z), z + 1.7);
  const rear = (f) => (x, y, z) => Math.max(f(x, y, z), 1.9 - z);
  const hole = (id, region) => {
    skins[id] = clipMesh(skins[id], (x, y, z) => CUT - region(x, y, z), { snap });
  };
  const split = (from, id, region) => {
    skins[id] = clipMesh(skins[from], (x, y, z) => region(x, y, z) + CUT, { snap });
    hole(from, region);
  };
  hole('frontBumper', front(REGIONS.grille));
  hole('frontBumper', front(REGIONS.lowerIntake));
  hole('frontBumper', front(REGIONS.fogPocket));
  split('rearBumper', 'rearDiffuser', rear(REGIONS.rearDiffuser));
  for (const [s, sign] of SIDES) split('rearBumper', `rearReflector_${s}`, onSide(rear(REGIONS.rearReflector), sign));

  // door glass comes out of the door skins
  for (const [s, sign] of SIDES) {
    for (const door of ['front', 'rear']) {
      const id = `${door}Door_${s}`;
      const region = onSide(REGIONS[`${door}DoorGlass`], sign);
      skins[`${door}DoorGlass_${s}`] = clipMesh(skins[id], (x, y, z) => region(x, y, z) - GLASS_UNDERLAP, { snap });
      skins[id] = clipMesh(skins[id], (x, y, z) => CUT - region(x, y, z), { snap });
    }
  }
  skins.liner = wheelLiners();
  return { skins, cellMs };
}

/** Wheel-house tubs: the arch cavity surface inside the body, facing the wheels. */
function wheelLiners(cell = 0.02) {
  const R = CAR.archRadius + 0.06;
  const out = new MeshData();
  for (const za of [CAR.axleF, CAR.axleR]) {
    for (const [, side] of SIDES) {
      const x0 = side < 0 ? -0.96 : 0.44;
      const bounds = { min: [x0, CAR.wheelY - R, za - R], max: [x0 + 0.52, CAR.wheelY + R, za + R] };
      const tub = clipMesh(surfaceNets(wheelHouseField, { ...bounds, cell }), (x, y, z) => lowerBodyField(x, y, z) + 0.004, {
        snap: tubSnap,
      });
      out.append(tub.flip());
    }
  }
  return out;
}

/** Lateral flange direction for doors and their jambs (towards the car centre). */
export const lateralIn = (p) => new THREE.Vector3(-Math.sign(p.x) || -1, 0, 0);

/**
 * Glass pane: the skin patch pushed below the body surface, with thickness and a closed edge.
 * Returns { pane: MeshData, frit: MeshData } where frit is the black ceramic border band.
 */
export function glassPane(skin, { recess = 0.005, thickness = 0.0045, fritWidth = 0.045 } = {}) {
  const base = skin.clone();
  for (let i = 0; i < base.vertexCount; i++) {
    for (let c = 0; c < 3; c++) base.positions[i * 3 + c] -= base.normals[i * 3 + c] * recess;
  }
  const fritField = boundaryDistanceField(base);
  const clear = clipMesh(base, (x, y, z) => fritWidth - fritField(x, y, z));
  const band = clipMesh(base, (x, y, z) => fritField(x, y, z) - fritWidth);
  const solid = (m) => {
    const h = hemPanel(m, { roll: 0.0001, depth: thickness, thickness: 0, rollSteps: 1 });
    const back = m.clone();
    for (let i = 0; i < back.vertexCount; i++) {
      for (let c = 0; c < 3; c++) back.positions[i * 3 + c] -= back.normals[i * 3 + c] * thickness;
    }
    back.flip();
    return h.outer.append(back);
  };
  return { pane: solid(clear), frit: solid(band) };
}

/** Distance from any point to the nearest boundary vertex of `mesh` (spatial hash accelerated). */
export function boundaryDistanceField(mesh, cell = 0.05) {
  const pts = [];
  for (const loop of boundaryLoops(mesh)) for (const i of loop) pts.push(mesh.getPos(i));
  const grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const p of pts) {
    const k = key(p.x, p.y, p.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  return (x, y, z) => {
    let best = Infinity;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const cz = Math.floor(z / cell);
    for (let r = 1; r <= 3; r++) {
      for (let i = cx - r; i <= cx + r; i++) {
        for (let j = cy - r; j <= cy + r; j++) {
          for (let k = cz - r; k <= cz + r; k++) {
            const list = grid.get(`${i},${j},${k}`);
            if (!list) continue;
            for (const p of list) {
              const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
              if (d < best) best = d;
            }
          }
        }
      }
      if (best < (r * cell) ** 2) break;
    }
    return Math.sqrt(best);
  };
}

export { MeshData };
