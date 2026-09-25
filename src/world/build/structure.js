import * as THREE from 'three';
import { M } from './materials.js';

/**
 * Walls with openings (doors, windows) and trim, floors, ceilings, gable roofs and plinths,
 * drawn into a Builder. Walls are segments on the floor plan; `left` is the side to the left of
 * the direction from (x0, z0) to (x1, z1).
 */
export function wall(b, { x0, z0, x1, z1, y = 0, h = 2.7, t = 0.16, left, right, cap = null, openings = [], trim = null, glass = null, surface = 'wood' }) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  const ux = dx / L;
  const uz = dz / L;
  const rot = Math.atan2(-uz, ux);
  const capMat = cap || right || left;
  const piece = (s0, s1, ya, yb) => {
    if (s1 - s0 < 0.005 || yb - ya < 0.005) return;
    const s = (s0 + s1) / 2;
    const cx = x0 + ux * s;
    const cz = z0 + uz * s;
    b.box(cx, y + (ya + yb) / 2, cz, s1 - s0, yb - ya, t, { pz: left, nz: right, px: capMat, nx: capMat, py: yb < h - 1e-3 ? capMat : null, ny: ya > 1e-3 ? capMat : null }, { rotY: rot, collide: true, surface });
  };
  const ops = [...openings].sort((a, b2) => a.at - b2.at);
  let s = 0;
  for (const o of ops) {
    const a = o.at - o.w / 2;
    const e = o.at + o.w / 2;
    piece(s, a, 0, h);
    piece(a, e, o.y1, h);
    if (o.y0 > 0) piece(a, e, 0, o.y0);
    s = e;
    const cx = x0 + ux * o.at;
    const cz = z0 + uz * o.at;
    if (trim) casing(b, cx, y, cz, rot, o, t, trim);
    if (o.kind === 'window') windowUnit(b, cx, y, cz, rot, o, t, trim || capMat, glass || M.glass());
  }
  piece(s, L, 0, h);
  return { rot, ux, uz, L };
}

/** Door/window casing on both wall faces. */
function casing(b, cx, y, cz, rot, o, t, mat) {
  const f = b.frame(cx, y, cz, rot);
  const cw = 0.07;
  const ct = 0.018;
  for (const side of [-1, 1]) {
    const z = side * (t / 2 + ct / 2);
    f.box(-o.w / 2 - cw / 2, (o.y0 + o.y1) / 2 + (o.y0 > 0 ? 0 : cw / 2) - (o.y0 > 0 ? 0 : cw / 2), z, cw, o.y1 - o.y0 + (o.y0 > 0 ? 2 * cw : cw), ct, mat);
    f.box(o.w / 2 + cw / 2, (o.y0 + o.y1) / 2 + (o.y0 > 0 ? 0 : cw / 2) - (o.y0 > 0 ? 0 : cw / 2), z, cw, o.y1 - o.y0 + (o.y0 > 0 ? 2 * cw : cw), ct, mat);
    f.box(0, o.y1 + cw / 2, z, o.w, cw, ct, mat);
    if (o.y0 > 0) f.box(0, o.y0 - cw / 2, z, o.w, cw, ct, mat);
  }
}

function windowUnit(b, cx, y, cz, rot, o, t, frameMat, glass) {
  const f = b.frame(cx, y, cz, rot);
  const fw = 0.05;
  const H = o.y1 - o.y0;
  const midY = (o.y0 + o.y1) / 2;
  // sash frame, mullion and transom
  f.box(0, o.y0 + fw / 2, 0, o.w, fw, 0.07, frameMat);
  f.box(0, o.y1 - fw / 2, 0, o.w, fw, 0.07, frameMat);
  f.box(-o.w / 2 + fw / 2, midY, 0, fw, H, 0.07, frameMat);
  f.box(o.w / 2 - fw / 2, midY, 0, fw, H, 0.07, frameMat);
  f.box(0, midY, 0, 0.035, H, 0.05, frameMat);
  f.box(0, o.y0 + H * 0.62, 0, o.w, 0.035, 0.05, frameMat);
  // glass (no collider: the opening keeps a thin invisible barrier below)
  f.box(0, midY, 0, o.w - fw, H - fw, 0.006, glass);
  f.collider(0, midY, 0, o.w, H, 0.06);
  // outside sill board
  f.box(0, o.y0 - 0.02, t / 2 + 0.04, o.w + 0.12, 0.04, 0.1, frameMat);
}

export function floor(b, x0, z0, x1, z1, y, mat, { thickness = 0.12, surface = 'wood', ceiling = null, ceilingY = 2.7 } = {}) {
  const w = x1 - x0;
  const d = z1 - z0;
  b.box((x0 + x1) / 2, y - thickness / 2, (z0 + z1) / 2, w, thickness, d, { py: mat }, { collide: true, surface });
  if (ceiling) b.box((x0 + x1) / 2, y + ceilingY + 0.03, (z0 + z1) / 2, w, 0.06, d, { ny: ceiling });
}

/** Skirting boards along the inside of a room rectangle, skipping door openings. */
export function skirting(b, x0, z0, x1, z1, y, mat, doors = []) {
  const h = 0.08;
  const t = 0.015;
  const runs = [
    [x0, z0 + t / 2, x1, z0 + t / 2, 'x'],
    [x0, z1 - t / 2, x1, z1 - t / 2, 'x'],
    [x0 + t / 2, z0, x0 + t / 2, z1, 'z'],
    [x1 - t / 2, z0, x1 - t / 2, z1, 'z'],
  ];
  for (const [ax, az, bx, bz, axis] of runs) {
    const cuts = doors
      .filter((d) => (axis === 'x' ? Math.abs(d.z - az) < 0.2 : Math.abs(d.x - ax) < 0.2))
      .map((d) => (axis === 'x' ? [d.x - d.w / 2, d.x + d.w / 2] : [d.z - d.w / 2, d.z + d.w / 2]))
      .sort((p, q) => p[0] - q[0]);
    let s = axis === 'x' ? ax : az;
    const e = axis === 'x' ? bx : bz;
    const emit = (a, c) => {
      if (c - a < 0.05) return;
      if (axis === 'x') b.box((a + c) / 2, y + h / 2, az, c - a, h, t, mat);
      else b.box(ax, y + h / 2, (a + c) / 2, t, h, c - a, mat);
    };
    for (const [c0, c1] of cuts) {
      emit(s, c0);
      s = Math.max(s, c1);
    }
    emit(s, e);
  }
}

/** Gable roof over [x0,x1]×[z0,z1] with the ridge along X, overhang and fascia; `wallTop` is the eave line. */
export function gableRoof(b, x0, z0, x1, z1, wallTop, { pitch = 0.5, overhang = 0.45, mat, gable, fascia, soffit }) {
  // slopes start below the wall top so the roof meets the walls exactly at the wall line
  const y = wallTop - overhang * pitch;
  const w = x1 - x0 + overhang * 2;
  const d = z1 - z0 + overhang * 2;
  const cz = (z0 + z1) / 2;
  const cx = (x0 + x1) / 2;
  const run = d / 2;
  const rise = run * pitch;
  const slope = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  for (const s of [-1, 1]) {
    const plane = new THREE.BoxGeometry(w, 0.06, slope);
    const uv = plane.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * slope);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(cx, y + rise / 2 - overhang * pitch * 0 + 0.03, cz + (s * run) / 2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(s * ang, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    plane.applyMatrix4(m);
    b.addGeometry(plane, mat);
    // soffit under the overhang
    if (soffit) b.box(cx, y - 0.02, cz + s * (d / 2 - overhang / 2), w, 0.02, overhang, { ny: soffit });
    if (fascia) b.box(cx, y - 0.02 - overhang * pitch * 0, cz + s * (d / 2), w, 0.16, 0.03, fascia);
  }
  // gable triangles at both ends (inset to the wall line)
  const tri = new THREE.BufferGeometry();
  const hz = (z1 - z0) / 2;
  const r = hz * pitch;
  const pos = [0, 0, -hz, 0, 0, hz, 0, r, 0];
  tri.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([-hz, 0, hz, 0, 0, r], 2));
  tri.computeVertexNormals();
  for (const [x, flip] of [
    [x0, true],
    [x1, false],
  ]) {
    const g = tri.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, wallTop, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, flip ? Math.PI : 0, 0)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    b.addGeometry(g, gable);
    const back = g.clone();
    const p = back.getAttribute('position');
    // inner side of the gable (visible from the attic side is not needed; flip for correctness)
    for (let i = 0; i < p.count; i += 3) {
      const ax = p.getX(i + 1);
      const ay = p.getY(i + 1);
      const az = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, ax, ay, az);
    }
    back.computeVertexNormals();
    b.addGeometry(back, gable);
  }
  return { rise, ridge: wallTop + hz * pitch };
}

/** Concrete plinth under a footprint, from below ground up to the floor level. */
export function plinth(b, x0, z0, x1, z1, bottom, top, mat) {
  b.box((x0 + x1) / 2, (bottom + top) / 2, (z0 + z1) / 2, x1 - x0, top - bottom, z1 - z0, { px: mat, nx: mat, pz: mat, nz: mat, py: null }, { collide: true, surface: 'concrete' });
}

/** Steps from the ground up to a door threshold, running along +Z from z. */
export function steps(b, x, z, width, groundY, topY, mat, dir = 1) {
  const rise = topY - groundY;
  const n = Math.max(1, Math.round(rise / 0.17));
  const r = rise / n;
  for (let i = 0; i < n; i++) {
    const h = topY - i * r - groundY;
    b.box(x, groundY + h / 2, z + dir * (i + 0.5) * 0.3, width, h, 0.3, mat, { collide: true, surface: 'concrete' });
  }
}
