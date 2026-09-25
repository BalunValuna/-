import * as THREE from 'three';

/**
 * Utilities for boundary loops of surface meshes: frames, smoothing and planar triangulation.
 * A loop is an array of vertex indices ordered with the panel interior on the left when seen
 * from outside (the order returned by boundaryLoops()).
 */

/**
 * Computes a smoothed frame per loop vertex: position P, surface normal N, loop tangent T and the
 * outward in-surface direction B (pointing away from the panel interior).
 */
export function loopFrames(mesh, loop, { smooth = 2, span = 2 } = {}) {
  const n = loop.length;
  const P = loop.map((i) => mesh.getPos(i, new THREE.Vector3()));
  const N = loop.map((i) => mesh.getNormal(i, new THREE.Vector3()));
  const T = [];
  for (let k = 0; k < n; k++) {
    const a = P[(k - span + n) % n];
    const b = P[(k + span) % n];
    T.push(b.clone().sub(a).normalize());
  }
  let B = T.map((t, k) => new THREE.Vector3().crossVectors(t, N[k]).normalize());
  for (let s = 0; s < smooth; s++) {
    B = B.map((b, k) => b.clone().multiplyScalar(2).add(B[(k - 1 + n) % n]).add(B[(k + 1) % n]).normalize());
  }
  // re-orthogonalise against the normal
  for (let k = 0; k < n; k++) {
    B[k].addScaledVector(N[k], -B[k].dot(N[k])).normalize();
    T[k].crossVectors(N[k], B[k]).normalize();
  }
  return { P, N, T, B, n };
}

/** Signed area of the loop projected on a plane with the given normal (for orientation checks). */
export function projectedArea(points, normal) {
  const c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    c.crossVectors(points[i], points[(i + 1) % points.length]);
    area += c.dot(normal);
  }
  return area / 2;
}

/**
 * Triangulates a nearly planar closed loop of 3D points by projecting it onto the plane with
 * normal `normal`. Returns triangles as index triples into `points`, wound CCW around `normal`.
 */
export function triangulateLoop(points, normal) {
  const n = normal.clone().normalize();
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(n.dot(u)) > 0.9) u.set(0, 1, 0);
  u.addScaledVector(n, -u.dot(n)).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const contour = points.map((p) => new THREE.Vector2(p.dot(u), p.dot(v)));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const ccw = !THREE.ShapeUtils.isClockWise(contour);
  return tris.map(([a, b, c]) => (ccw ? [a, b, c] : [a, c, b]));
}

/** Removes loop vertices closer than `minDist` to their predecessor (keeps the loop well spaced). */
export function decimateLoop(mesh, loop, minDist) {
  const out = [];
  const p = new THREE.Vector3();
  const last = new THREE.Vector3();
  for (const i of loop) {
    mesh.getPos(i, p);
    if (out.length && p.distanceTo(last) < minDist) continue;
    out.push(i);
    last.copy(p);
  }
  if (out.length > 3) {
    mesh.getPos(out[0], p);
    if (p.distanceTo(last) < minDist * 0.5) out.pop();
  }
  return out;
}
