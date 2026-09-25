import * as THREE from 'three';
import { surfaceNets } from '../geo/surfaceNets.js';
import { bodyField, BODY_BOUNDS } from '../car/body/shape.js';
import { buildWheel } from '../car/parts/wheel.js';
import { carMaterials } from '../car/materials.js';
import { CAR, WHEELS } from '../car/design.js';

/**
 * Temporary lab model: the raw body skin. Replaced by the full car assembly once parts exist.
 */
export function buildLabModel() {
  const root = new THREE.Group();
  const t0 = performance.now();
  const skin = surfaceNets(bodyField, { ...BODY_BOUNDS, cell: 0.02 });
  const ms = performance.now() - t0;
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0x8a1c22,
    metalness: 0.45,
    roughness: 0.38,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  const mesh = new THREE.Mesh(skin.toGeometry(), paint);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'body';
  root.add(mesh);
  const mats = carMaterials(0x8a1c22);
  for (const [id, w] of Object.entries(WHEELS)) {
    const wheel = buildWheel(mats);
    wheel.root.position.set(w.x, CAR.wheelY, w.z);
    if (w.left) wheel.root.rotation.y = Math.PI;
    wheel.root.name = `wheel_${id}`;
    root.add(wheel.root);
  }
  return {
    root,
    setState() {},
    showOnly() {},
    showAll() {},
    stats: () => ({ skinMs: Math.round(ms), triangles: skin.triangleCount, vertices: skin.vertexCount }),
  };
}
