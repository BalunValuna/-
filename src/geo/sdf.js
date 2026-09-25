/**
 * Scalar-field helpers for implicit modelling. Convention: f < 0 inside, f > 0 outside,
 * values approximate Euclidean distance close to the surface.
 */

/** Intersection with a circular fillet of radius r (hg_sdf fOpIntersectionRound). */
export function roundMax(a, b, r) {
  const ua = a + r > 0 ? a + r : 0;
  const ub = b + r > 0 ? b + r : 0;
  const m = a > b ? a : b;
  return (m < -r ? m : -r) + Math.sqrt(ua * ua + ub * ub);
}

/** Union with a circular fillet of radius r (hg_sdf fOpUnionRound). */
export function roundMin(a, b, r) {
  const ua = r - a > 0 ? r - a : 0;
  const ub = r - b > 0 ? r - b : 0;
  const m = a < b ? a : b;
  return (m > r ? m : r) - Math.sqrt(ua * ua + ub * ub);
}

/** Polynomial smooth minimum (blend width k). */
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

export function sdBox(px, py, pz, bx, by, bz) {
  const qx = Math.abs(px) - bx;
  const qy = Math.abs(py) - by;
  const qz = Math.abs(pz) - bz;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  const oz = qz > 0 ? qz : 0;
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0);
}

export function sdRoundBox(px, py, pz, bx, by, bz, r) {
  return sdBox(px, py, pz, bx - r, by - r, bz - r) - r;
}

/** 2D rounded rectangle (half extents bx, by, corner radius r). */
export function sdRoundRect(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
}

export function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  const dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** Approximate ellipsoid distance (Inigo Quilez). */
export function sdEllipsoid(px, py, pz, rx, ry, rz) {
  const k0 = Math.hypot(px / rx, py / ry, pz / rz);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

/** Torus lying in the XZ plane. */
export function sdTorus(px, py, pz, R, r) {
  const q = Math.hypot(px, pz) - R;
  return Math.hypot(q, py) - r;
}

/** Capped cylinder along Y with half height h. */
export function sdCylinderY(px, py, pz, r, h) {
  const dx = Math.hypot(px, pz) - r;
  const dy = Math.abs(py) - h;
  const ox = dx > 0 ? dx : 0;
  const oy = dy > 0 ? dy : 0;
  return Math.min(Math.max(dx, dy), 0) + Math.sqrt(ox * ox + oy * oy);
}

/** Signed distance to a closed 2D polygon given as flat [x0,y0,x1,y1,...] (negative inside). */
export function sdPolygon(px, py, pts) {
  const n = pts.length >> 1;
  let d = Infinity;
  let s = 1;
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const xi = pts[i * 2];
    const yi = pts[i * 2 + 1];
    const xj = pts[j * 2];
    const yj = pts[j * 2 + 1];
    const ex = xj - xi;
    const ey = yj - yi;
    const wx = px - xi;
    const wy = py - yi;
    let t = (wx * ex + wy * ey) / (ex * ex + ey * ey);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const bx = wx - ex * t;
    const by = wy - ey * t;
    const dd = bx * bx + by * by;
    if (dd < d) d = dd;
    const c1 = py >= yi;
    const c2 = py < yj;
    const c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
