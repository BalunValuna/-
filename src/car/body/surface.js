import * as THREE from 'three';
import { bodyField } from './shape.js';
import { fieldGradient } from '../../geo/surfaceNets.js';

/**
 * Queries on the body skin: ray hits and normals, used to place trims and details exactly on
 * the painted surface.
 */
const g = [0, 0, 0];

export function bodyNormal(p, out = new THREE.Vector3()) {
  fieldGradient(bodyField, p.x, p.y, p.z, 5e-4, g);
  return out.set(g[0], g[1], g[2]).normalize();
}

/** Sphere-traces from `origin` along `dir` to the skin (bisection once bracketed); null if missed. */
export function traceBody(origin, dir, maxT = 3) {
  const at = (t) => bodyField(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
  let t = 0;
  let d = at(0);
  if (d <= 0) return null;
  for (let i = 0; i < 300 && t < maxT; i++) {
    const step = Math.max(d * 0.9, 2e-4);
    const t2 = t + step;
    const d2 = at(t2);
    if (d2 <= 0) {
      let a = t;
      let b = t2;
      for (let k = 0; k < 30; k++) {
        const m = (a + b) / 2;
        if (at(m) > 0) a = m;
        else b = m;
      }
      const hit = (a + b) / 2;
      return origin.clone().addScaledVector(dir, hit);
    }
    t = t2;
    d = d2;
  }
  return null;
}

export const frontPoint = (x, y) => traceBody(new THREE.Vector3(x, y, -2.6), new THREE.Vector3(0, 0, 1));
export const rearPoint = (x, y) => traceBody(new THREE.Vector3(x, y, 2.7), new THREE.Vector3(0, 0, -1));
export const sidePoint = (z, y, side) => traceBody(new THREE.Vector3(side * 1.3, y, z), new THREE.Vector3(-side, 0, 0));
export const topPoint = (x, z) => traceBody(new THREE.Vector3(x, 1.9, z), new THREE.Vector3(0, -1, 0));

/** Orientation that maps local +Z to the surface normal and local +X to `along`. */
export function surfaceFrame(p, along = new THREE.Vector3(1, 0, 0)) {
  const n = bodyNormal(p);
  const x = along.clone().addScaledVector(n, -along.dot(n)).normalize();
  const y = new THREE.Vector3().crossVectors(n, x);
  const m = new THREE.Matrix4().makeBasis(x, y, n);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
