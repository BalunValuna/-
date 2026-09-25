import { MeshData } from './meshData.js';

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
// Tetrahedral sample directions for a 4-tap gradient estimate.
const TETRA = [
  [1, -1, -1],
  [-1, -1, 1],
  [-1, 1, -1],
  [1, 1, 1],
];

/**
 * Gradient of `field` at p via the 4-tap tetrahedron stencil; writes into `out` and returns the
 * field value estimate at p.
 */
export function fieldGradient(field, x, y, z, h, out) {
  let gx = 0;
  let gy = 0;
  let gz = 0;
  let sum = 0;
  for (const [kx, ky, kz] of TETRA) {
    const v = field(x + kx * h, y + ky * h, z + kz * h);
    gx += kx * v;
    gy += ky * v;
    gz += kz * v;
    sum += v;
  }
  const s = 1 / (4 * h);
  out[0] = gx * s;
  out[1] = gy * s;
  out[2] = gz * s;
  return sum * 0.25;
}

/**
 * Moves a point onto the zero set of `field` with damped Newton steps. Returns the unit normal
 * in `normalOut`. The point array is modified in place.
 */
export function projectToSurface(field, p, normalOut, { iterations = 3, h = 1e-3, maxStep = 0.02 } = {}) {
  const g = [0, 0, 0];
  for (let it = 0; it < iterations; it++) {
    const f = fieldGradient(field, p[0], p[1], p[2], h, g);
    const g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
    if (g2 < 1e-12) break;
    let sx = (f * g[0]) / g2;
    let sy = (f * g[1]) / g2;
    let sz = (f * g[2]) / g2;
    const len = Math.hypot(sx, sy, sz);
    if (len > maxStep) {
      const k = maxStep / len;
      sx *= k;
      sy *= k;
      sz *= k;
    }
    p[0] -= sx;
    p[1] -= sy;
    p[2] -= sz;
    if (Math.abs(f) < 1e-5) break;
  }
  fieldGradient(field, p[0], p[1], p[2], h, g);
  const l = Math.hypot(g[0], g[1], g[2]) || 1;
  normalOut[0] = g[0] / l;
  normalOut[1] = g[1] / l;
  normalOut[2] = g[2] / l;
  return normalOut;
}

/**
 * Extracts the zero isosurface of a scalar field with naive Surface Nets on a regular grid.
 * Vertices are projected onto the true surface and receive analytic (gradient) normals, which
 * keeps the shading smooth and character lines crisp even on a coarse grid.
 *
 * @param {(x:number,y:number,z:number)=>number} field  f < 0 inside
 * @param {{min:number[], max:number[], cell:number, project?:number}} opts
 * @returns {MeshData}
 */
export function surfaceNets(field, { min, max, cell, project = 3 }) {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const values = new Float32Array(nx * ny * nz);
  let p = 0;
  for (let k = 0; k < nz; k++) {
    const z = min[2] + k * cell;
    for (let j = 0; j < ny; j++) {
      const y = min[1] + j * cell;
      for (let i = 0; i < nx; i++) values[p++] = field(min[0] + i * cell, y, z);
    }
  }
  const gridIndex = (i, j, k) => i + nx * (j + ny * k);
  const cx = nx - 1;
  const cy = ny - 1;
  const cz = nz - 1;
  const cellIndex = (i, j, k) => i + cx * (j + cy * k);
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const mesh = new MeshData();

  const v = new Float32Array(8);
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const o = CORNERS[c];
          v[c] = values[gridIndex(i + o[0], j + o[1], k + o[2])];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let count = 0;
        for (const [a, b] of EDGES) {
          const va = v[a];
          const vb = v[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          const oa = CORNERS[a];
          const ob = CORNERS[b];
          sx += oa[0] + (ob[0] - oa[0]) * t;
          sy += oa[1] + (ob[1] - oa[1]) * t;
          sz += oa[2] + (ob[2] - oa[2]) * t;
          count++;
        }
        cellVert[cellIndex(i, j, k)] = mesh.addVertex(
          min[0] + (i + sx / count) * cell,
          min[1] + (j + sy / count) * cell,
          min[2] + (k + sz / count) * cell,
        );
      }
    }
  }

  // One quad per sign-changing grid edge, joining the four cells that share it. The listed cell
  // order is counter-clockwise when viewed from the +axis side; it is reversed when the edge goes
  // from outside to inside so that faces always point out of the solid.
  const quads = [];
  const pushQuad = (a, b, c, d, reverse) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (reverse) quads.push(a, d, c, b);
    else quads.push(a, b, c, d);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const inside = values[gridIndex(i, j, k)] < 0;
        if (i < cx && j >= 1 && j < cy && k >= 1 && k < cz && inside !== values[gridIndex(i + 1, j, k)] < 0) {
          pushQuad(
            cellVert[cellIndex(i, j - 1, k - 1)],
            cellVert[cellIndex(i, j, k - 1)],
            cellVert[cellIndex(i, j, k)],
            cellVert[cellIndex(i, j - 1, k)],
            !inside,
          );
        }
        if (j < cy && i >= 1 && i < cx && k >= 1 && k < cz && inside !== values[gridIndex(i, j + 1, k)] < 0) {
          pushQuad(
            cellVert[cellIndex(i - 1, j, k - 1)],
            cellVert[cellIndex(i - 1, j, k)],
            cellVert[cellIndex(i, j, k)],
            cellVert[cellIndex(i, j, k - 1)],
            !inside,
          );
        }
        if (k < cz && i >= 1 && i < cx && j >= 1 && j < cy && inside !== values[gridIndex(i, j, k + 1)] < 0) {
          pushQuad(
            cellVert[cellIndex(i - 1, j - 1, k)],
            cellVert[cellIndex(i, j - 1, k)],
            cellVert[cellIndex(i, j, k)],
            cellVert[cellIndex(i - 1, j, k)],
            !inside,
          );
        }
      }
    }
  }

  // Project vertices onto the surface and take the field gradient as the normal.
  const pt = [0, 0, 0];
  const n = [0, 0, 0];
  const h = cell * 0.02;
  for (let vi = 0; vi < mesh.vertexCount; vi++) {
    pt[0] = mesh.positions[vi * 3];
    pt[1] = mesh.positions[vi * 3 + 1];
    pt[2] = mesh.positions[vi * 3 + 2];
    projectToSurface(field, pt, n, { iterations: project, h, maxStep: cell * 0.75 });
    mesh.positions[vi * 3] = pt[0];
    mesh.positions[vi * 3 + 1] = pt[1];
    mesh.positions[vi * 3 + 2] = pt[2];
    mesh.normals[vi * 3] = n[0];
    mesh.normals[vi * 3 + 1] = n[1];
    mesh.normals[vi * 3 + 2] = n[2];
  }

  // Split quads along the shorter diagonal.
  const P = mesh.positions;
  const d2 = (a, b) => {
    const dx = P[a * 3] - P[b * 3];
    const dy = P[a * 3 + 1] - P[b * 3 + 1];
    const dz = P[a * 3 + 2] - P[b * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  for (let q = 0; q < quads.length; q += 4) {
    const a = quads[q];
    const b = quads[q + 1];
    const c = quads[q + 2];
    const d = quads[q + 3];
    if (d2(a, c) <= d2(b, d)) mesh.indices.push(a, b, c, a, c, d);
    else mesh.indices.push(a, b, d, b, c, d);
  }
  return mesh;
}
