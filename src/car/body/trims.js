import * as THREE from 'three';
import { doubleSided } from '../materials.js';
import { clipMesh } from '../../geo/clip.js';
import { hemPanel } from '../../geo/hem.js';
import { boundaryDistanceField } from './panels.js';
import { loft } from '../../geo/loft.js';
import { mesh } from '../../geo/primitives.js';
import { FLOOR_Y } from './structure.js';

/**
 * Inner reinforcement frame for a closure (hood, trunk lid): the skin offset inwards, trimmed to a
 * perimeter band plus ribs, with a return flange so it reads as stamped steel.
 * `ribs(x, y, z)` returns a signed distance to extra rib bands (negative inside a rib).
 */
export function innerFrame(skin, { offset = 0.03, band = 0.085, edge = 0.018, ribs = () => Infinity } = {}) {
  const base = skin.clone();
  for (let i = 0; i < base.vertexCount; i++) {
    for (let c = 0; c < 3; c++) base.positions[i * 3 + c] -= base.normals[i * 3 + c] * offset;
  }
  const dist = boundaryDistanceField(skin);
  const trimmed = clipMesh(base, (x, y, z) => edge - dist(x, y, z));
  const framed = clipMesh(trimmed, (x, y, z) => Math.min(dist(x, y, z) - band, ribs(x, y, z)));
  // flange back towards the skin on every edge (outer rim and lightening holes)
  const { outer, inner } = hemPanel(framed, { roll: 0.004, depth: 0.012, thickness: 0.001 });
  return outer.append(inner);
}

/** Carpeted trunk: floor board, wheel-house covers and side liners. */
export function buildTrunkTrim(mats) {
  const g = new THREE.Group();
  g.name = 'trunkTrim';
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const floorY = 0.405;
  const board = new THREE.BoxGeometry(1.2, 0.012, 0.8);
  const b = mesh(board, mats.carpet, { name: 'trunkBoard' });
  b.position.set(0, floorY, 1.74);
  g.add(b);
  const handle = mesh(new THREE.BoxGeometry(0.1, 0.006, 0.025), mats.blackPlastic, { name: 'boardHandle' });
  handle.position.set(0, floorY + 0.009, 2.08);
  g.add(handle);
  for (const side of [-1, 1]) {
    // wheel-house cover: rounded hump lofted along z
    const secs = [];
    for (let z = 1.3; z <= 2.16; z += 0.04) {
      const overArch = z < 1.74 ? 1 : Math.max(0, 1 - (z - 1.74) / 0.12);
      const xIn = 0.47 + (1 - overArch) * 0.16;
      const top = 0.72 * overArch + (1 - overArch) * 0.98;
      secs.push([V(side * 0.72, floorY, z), V(side * xIn, floorY, z), V(side * (xIn - 0.01), top - 0.06, z), V(side * (xIn + 0.05), top, z), V(side * 0.74, top + 0.02, z)]);
    }
    g.add(mesh(loft(secs, { flip: side < 0 }), doubleSided(mats.carpet), { name: 'trunkSideTrim' }));
  }
  return g;
}

export { FLOOR_Y };
