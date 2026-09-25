import { MeshData } from './meshData.js';

/**
 * Returns the part of `mesh` where g(p) <= 0. Edge crossings are solved onto g = 0 and can be
 * re-projected onto a surface with `snap(p, n)`, so cut lines stay exact on curved skins.
 * Crossings are shared between neighbouring triangles, keeping the result welded.
 *
 * @param {MeshData} mesh
 * @param {(x:number,y:number,z:number)=>number} g
 * @param {{snap?: (p:number[], n:number[])=>void, refine?: number}} [opts]
 */
export function clipMesh(mesh, g, { snap = null, refine = 6 } = {}) {
  const nv = mesh.vertexCount;
  const P = mesh.positions;
  const N = mesh.normals;
  const gv = new Float64Array(nv);
  for (let i = 0; i < nv; i++) gv[i] = g(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);

  const out = new MeshData();
  const remap = new Int32Array(nv).fill(-1);
  const keep = (i) => {
    if (remap[i] < 0) remap[i] = out.addVertex(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
    return remap[i];
  };

  const cache = new Map();
  const p = [0, 0, 0];
  const n = [0, 0, 0];
  const place = (a, b, t) => {
    for (let c = 0; c < 3; c++) {
      p[c] = P[a * 3 + c] + (P[b * 3 + c] - P[a * 3 + c]) * t;
      n[c] = N[a * 3 + c] + (N[b * 3 + c] - N[a * 3 + c]) * t;
    }
    if (snap) snap(p, n);
    return g(p[0], p[1], p[2]);
  };
  // a is inside (g <= 0), b outside.
  const cross = (a, b) => {
    const key = a < b ? a * nv + b : b * nv + a;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let ta = 0;
    let tb = 1;
    let fa = gv[a];
    let fb = gv[b];
    let t = fa / (fa - fb);
    for (let it = 0; it < refine; it++) {
      const ft = place(a, b, t);
      if (Math.abs(ft) < 1e-7) break;
      if (ft <= 0) {
        ta = t;
        fa = ft;
      } else {
        tb = t;
        fb = ft;
      }
      t = ta + (tb - ta) * (fa / (fa - fb));
    }
    place(a, b, t);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    const v = out.addVertex(p[0], p[1], p[2], n[0] / l, n[1] / l, n[2] / l);
    cache.set(key, v);
    return v;
  };

  const idx = mesh.indices;
  for (let t = 0; t < idx.length; t += 3) {
    let i0 = idx[t];
    let i1 = idx[t + 1];
    let i2 = idx[t + 2];
    const in0 = gv[i0] <= 0;
    const in1 = gv[i1] <= 0;
    const in2 = gv[i2] <= 0;
    const count = +in0 + +in1 + +in2;
    if (count === 0) continue;
    if (count === 3) {
      out.addTri(keep(i0), keep(i1), keep(i2));
      continue;
    }
    if (count === 1) {
      // rotate so the single inside vertex comes first (winding preserved)
      if (in1) [i0, i1, i2] = [i1, i2, i0];
      else if (in2) [i0, i1, i2] = [i2, i0, i1];
      out.addTri(keep(i0), cross(i0, i1), cross(i0, i2));
      continue;
    }
    // two inside: rotate so the outside vertex comes last
    if (!in0) [i0, i1, i2] = [i1, i2, i0];
    else if (!in1) [i0, i1, i2] = [i2, i0, i1];
    const a = keep(i0);
    const b = keep(i1);
    const bc = cross(i1, i2);
    const ca = cross(i0, i2);
    out.addTri(a, b, bc);
    out.addTri(a, bc, ca);
  }
  return out;
}

/** Applies several clip constraints in sequence (intersection of all g_i <= 0). */
export function clipMeshAll(mesh, fields, opts) {
  let m = mesh;
  for (const g of fields) {
    m = clipMesh(m, g, opts);
    if (m.triangleCount === 0) break;
  }
  return m;
}
