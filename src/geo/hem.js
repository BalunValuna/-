import * as THREE from 'three';
import { MeshData, boundaryLoops } from './meshData.js';
import { loopFrames } from './loops.js';

/**
 * Sheet-metal edge treatment for a panel cut out of a skin surface.
 *
 * Every boundary loop gets a rolled edge (quarter circle of radius `roll`) followed by an edge
 * profile — by default a straight flange `depth` long along the flange direction. The profile is
 * a list of [b, d] offsets from the end of the roll in the local frame (B = outward in the surface,
 * D = flange direction), so doors can have a stepped shut face. With `thickness` > 0 the panel also
 * gets an inner skin and a closing strip, so every part is a closed solid: from any angle you see
 * metal, never the void behind a gap.
 *
 * @param {MeshData} skin      open surface, normals pointing out of the car
 * @param {object} o
 * @param {number} [o.roll]           rolled edge radius
 * @param {number|Function} [o.depth] flange depth (number or (p) => number)
 * @param {Function} [o.profile]      (p, loop) => [[b, d], ...] custom edge profile
 * @param {Function} [o.dir]          (p, n) => flange direction (default -n)
 * @param {number} [o.thickness]      sheet thickness; 0 = single sided
 * @param {Function} [o.perLoop]      (info) => partial options for one loop (info: {index, length, points})
 * @param {string} [o.flangeTag]      tag for this loop's flange triangles (past the roll), in
 *                                    `outer.tags` / `inner.tags` (Map: triangle index → tag), so a
 *                                    caller can give e.g. window-opening flanges a seal material
 * @returns {{outer: MeshData, inner: MeshData, ends: Array<{points: THREE.Vector3[], normals: THREE.Vector3[]}>}}
 */
export function hemPanel(skin, opts = {}) {
  const base = { roll: 0.0025, depth: 0.015, dir: null, thickness: 0.0012, rollSteps: 3, profile: null, perLoop: null, ...opts };
  const outer = skin.clone();
  const inner = new MeshData();
  outer.tags = new Map();
  inner.tags = new Map();
  const tagQuad = (mesh, tag, add) => {
    const t0 = mesh.indices.length / 3;
    add();
    if (tag) for (let t = t0; t < mesh.indices.length / 3; t++) mesh.tags.set(t, tag);
  };
  const ends = [];
  const loops = boundaryLoops(skin).sort((a, b) => b.length - a.length);

  if (base.thickness > 0) {
    for (let i = 0; i < skin.vertexCount; i++) {
      const p = skin.getPos(i);
      const n = skin.getNormal(i);
      const t = base.thickness;
      inner.addVertex(p.x - n.x * t, p.y - n.y * t, p.z - n.z * t, -n.x, -n.y, -n.z);
    }
    for (let t = 0; t < skin.indices.length; t += 3) inner.addTri(skin.indices[t], skin.indices[t + 2], skin.indices[t + 1]);
  }

  loops.forEach((loop, index) => {
    if (loop.length < 3) return;
    const o = base.perLoop ? { ...base, ...base.perLoop({ index, length: loop.length, loop, mesh: skin }) } : base;
    if (o.skip) return;
    const f = loopFrames(skin, loop);
    const rings = [];
    const ringNormals = [];
    for (let k = 0; k < f.n; k++) {
      const { pts, nrm } = edgeProfile(f.P[k], f.N[k], f.T[k], f.B[k], o);
      rings.push(pts);
      ringNormals.push(nrm);
    }
    const steps = rings[0].length;
    const ids = rings.map((pts, k) =>
      pts.map((p, s) => {
        if (s === 0) return loop[k];
        const nn = ringNormals[k][s];
        return outer.addVertex(p.x, p.y, p.z, nn.x, nn.y, nn.z);
      }),
    );
    for (let k = 0; k < f.n; k++) {
      const k2 = (k + 1) % f.n;
      for (let s = 0; s < steps - 1; s++) tagQuad(outer, s >= o.rollSteps ? o.flangeTag : null, () => outer.addQuad(ids[k][s], ids[k][s + 1], ids[k2][s + 1], ids[k2][s]));
    }
    const last = steps - 1;
    ends.push({ points: rings.map((r) => r[last]), normals: ringNormals.map((r) => r[last]), index });
    if (o.thickness > 0) {
      const t = o.thickness;
      const iid = rings.map((pts, k) =>
        pts.map((p, s) => {
          if (s === 0) return loop[k];
          const nn = ringNormals[k][s];
          return inner.addVertex(p.x - nn.x * t, p.y - nn.y * t, p.z - nn.z * t, -nn.x, -nn.y, -nn.z);
        }),
      );
      for (let k = 0; k < f.n; k++) {
        const k2 = (k + 1) % f.n;
        for (let s = 0; s < steps - 1; s++) tagQuad(inner, s >= o.rollSteps ? o.flangeTag : null, () => inner.addQuad(iid[k][s], iid[k2][s], iid[k2][s + 1], iid[k][s + 1]));
      }
      // closing strip at the profile end
      const endIds = rings.map((pts, k) => {
        const p = pts[last];
        const nn = ringNormals[k][last];
        const D = pts[last].clone().sub(pts[last - 1]).normalize();
        const a = outer.addVertex(p.x, p.y, p.z, D.x, D.y, D.z);
        const b = outer.addVertex(p.x - nn.x * t, p.y - nn.y * t, p.z - nn.z * t, D.x, D.y, D.z);
        return [a, b];
      });
      for (let k = 0; k < f.n; k++) {
        const k2 = (k + 1) % f.n;
        tagQuad(outer, o.flangeTag, () => outer.addQuad(endIds[k][0], endIds[k][1], endIds[k2][1], endIds[k2][0]));
      }
    }
  });
  return { outer, inner, ends };
}

/** Flange direction D at a boundary point, perpendicular to the loop tangent. */
export function flangeDir(P, N, T, dir) {
  let D = dir ? dir(P, N).clone() : N.clone().negate();
  D.addScaledVector(T, -D.dot(T));
  if (D.lengthSq() < 1e-6 || D.dot(N) > -0.2) D = N.clone().negate();
  return D.normalize();
}

/**
 * Profile points for one boundary vertex: roll first, then the flange/profile polyline.
 * Normals of the profile points face out of the metal.
 */
function edgeProfile(P, N, T, B0, o) {
  const D = flangeDir(P, N, T, o.dir);
  const B = B0.clone().addScaledVector(D, -B0.dot(D));
  if (B.lengthSq() < 1e-6) B.copy(B0);
  B.normalize();
  const pts = [];
  const nrm = [];
  const r = o.roll;
  for (let s = 0; s <= o.rollSteps; s++) {
    const th = (s / o.rollSteps) * Math.PI * 0.5;
    const c = Math.cos(th);
    const si = Math.sin(th);
    pts.push(P.clone().addScaledVector(B, r * si).addScaledVector(D, r * (1 - c)));
    nrm.push(N.clone().multiplyScalar(c).addScaledVector(B, si).normalize());
  }
  const origin = P.clone().addScaledVector(B, r).addScaledVector(D, r);
  const profile = o.profile ? o.profile(P) : [[0, typeof o.depth === 'function' ? o.depth(P) : o.depth]];
  let prev = origin;
  for (const [b, d] of profile) {
    const q = origin.clone().addScaledVector(B, b).addScaledVector(D, d);
    const seg = q.clone().sub(prev);
    if (seg.lengthSq() < 1e-10) continue;
    seg.normalize();
    // Outer face normal: travelling along +B faces -D, travelling along +D faces +B.
    const nOut = B.clone().multiplyScalar(seg.dot(D)).addScaledVector(D, -seg.dot(B)).normalize();
    pts.push(prev.clone(), q); // duplicated corner = crisp fold
    nrm.push(nOut, nOut.clone());
    prev = q;
  }
  return { pts, nrm };
}

/**
 * Sweeps a 2D profile along a closed loop of frames. Each frame supplies an origin point, the
 * directions B (profile x) and D (profile y). Returns a MeshData strip; faces point to the side
 * given by `facing` (+1: towards +B for segments along D).
 */
export function sweepLoop(frames, profile, { facing = 1 } = {}) {
  const m = new MeshData();
  const n = frames.length;
  const rows = frames.map(({ P, B, D }) => {
    const pts = profile.map(([b, d]) => P.clone().addScaledVector(B, b).addScaledVector(D, d));
    return pts.map((p, s) => {
      const a = pts[Math.max(s - 1, 0)];
      const c = pts[Math.min(s + 1, pts.length - 1)];
      const seg = c.clone().sub(a).normalize();
      const nn = B.clone().multiplyScalar(seg.dot(D)).addScaledVector(D, -seg.dot(B)).normalize().multiplyScalar(facing);
      return m.addVertex(p.x, p.y, p.z, nn.x, nn.y, nn.z);
    });
  });
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    for (let s = 0; s < profile.length - 1; s++) {
      // (profile step) × (loop step) points along +B for a profile running along D
      if (facing > 0) m.addQuad(rows[k][s], rows[k][s + 1], rows[k2][s + 1], rows[k2][s]);
      else m.addQuad(rows[k][s], rows[k2][s], rows[k2][s + 1], rows[k][s + 1]);
    }
  }
  return m;
}
