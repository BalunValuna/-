import * as THREE from 'three';
import { surfaceNets } from './surfaceNets.js';

/** Meshes an implicit field (negative inside) into a BufferGeometry. */
export function fieldGeometry(field, min, max, cell) {
  const md = surfaceNets(field, { min, max, cell });
  const g = md.toGeometry();
  g.computeBoundingSphere();
  return g;
}

/** Tapered capsule (rounded cone) from a (radius ra) to b (radius rb). */
export function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / l2));
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.hypot(dx, dy, dz) - (ra + (rb - ra) * h);
}
