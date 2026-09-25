import * as THREE from 'three';

/**
 * Growable indexed triangle mesh with per-vertex normals (and optional per-vertex colours).
 * Used as the intermediate format of all procedural geometry before upload to the GPU.
 */
export class MeshData {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.indices = [];
    this.colors = null;
    this.uvs = null;
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  get triangleCount() {
    return this.indices.length / 3;
  }

  addVertex(x, y, z, nx = 0, ny = 1, nz = 0) {
    const i = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    return i;
  }

  addTri(a, b, c) {
    this.indices.push(a, b, c);
  }

  addQuad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  getPos(i, out = new THREE.Vector3()) {
    return out.set(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
  }

  getNormal(i, out = new THREE.Vector3()) {
    return out.set(this.normals[i * 3], this.normals[i * 3 + 1], this.normals[i * 3 + 2]);
  }

  /** Appends another mesh, optionally transformed by a Matrix4. */
  append(other, matrix = null) {
    const base = this.vertexCount;
    if (!matrix) {
      for (let i = 0; i < other.positions.length; i++) this.positions.push(other.positions[i]);
      for (let i = 0; i < other.normals.length; i++) this.normals.push(other.normals[i]);
    } else {
      const v = new THREE.Vector3();
      const nm = new THREE.Matrix3().getNormalMatrix(matrix);
      for (let i = 0; i < other.vertexCount; i++) {
        other.getPos(i, v).applyMatrix4(matrix);
        this.positions.push(v.x, v.y, v.z);
        other.getNormal(i, v).applyMatrix3(nm).normalize();
        this.normals.push(v.x, v.y, v.z);
      }
    }
    for (let i = 0; i < other.indices.length; i++) this.indices.push(other.indices[i] + base);
    return this;
  }

  transform(matrix) {
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < this.vertexCount; i++) {
      this.getPos(i, v).applyMatrix4(matrix);
      this.positions[i * 3] = v.x;
      this.positions[i * 3 + 1] = v.y;
      this.positions[i * 3 + 2] = v.z;
      this.getNormal(i, v).applyMatrix3(nm).normalize();
      this.normals[i * 3] = v.x;
      this.normals[i * 3 + 1] = v.y;
      this.normals[i * 3 + 2] = v.z;
    }
    if (matrix.determinant() < 0) this.flipWinding();
    return this;
  }

  flipWinding() {
    const idx = this.indices;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    return this;
  }

  /** Reverse faces and normals (turns an outer skin into an inner skin). */
  flip() {
    this.flipWinding();
    for (let i = 0; i < this.normals.length; i++) this.normals[i] = -this.normals[i];
    return this;
  }

  clone() {
    const m = new MeshData();
    m.positions = this.positions.slice();
    m.normals = this.normals.slice();
    m.indices = this.indices.slice();
    return m;
  }

  /** Mirror copy across the plane x = 0 (winding fixed so faces stay front-facing). */
  mirroredX() {
    const m = this.clone();
    for (let i = 0; i < m.positions.length; i += 3) {
      m.positions[i] = -m.positions[i];
      m.normals[i] = -m.normals[i];
    }
    return m.flipWinding();
  }

  /** Recompute smooth normals from faces (area weighted). */
  computeNormals() {
    const n = new Float64Array(this.positions.length);
    const p = this.positions;
    const idx = this.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const e1x = p[b] - p[a];
      const e1y = p[b + 1] - p[a + 1];
      const e1z = p[b + 2] - p[a + 2];
      const e2x = p[c] - p[a];
      const e2y = p[c + 1] - p[a + 1];
      const e2z = p[c + 2] - p[a + 2];
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      for (const v of [a, b, c]) {
        n[v] += nx;
        n[v + 1] += ny;
        n[v + 2] += nz;
      }
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      this.normals[i] = n[i] / l;
      this.normals[i + 1] = n[i + 1] / l;
      this.normals[i + 2] = n[i + 2] / l;
    }
    return this;
  }

  /** Remove vertices not referenced by any triangle. */
  compact() {
    const remap = new Int32Array(this.vertexCount).fill(-1);
    const pos = [];
    const nor = [];
    let next = 0;
    const idx = this.indices;
    for (let i = 0; i < idx.length; i++) {
      const v = idx[i];
      if (remap[v] < 0) {
        remap[v] = next++;
        pos.push(this.positions[v * 3], this.positions[v * 3 + 1], this.positions[v * 3 + 2]);
        nor.push(this.normals[v * 3], this.normals[v * 3 + 1], this.normals[v * 3 + 2]);
      }
      idx[i] = remap[v];
    }
    this.positions = pos;
    this.normals = nor;
    return this;
  }

  /**
   * Splits triangles into groups by `classify(cx, cy, cz, triIndex) → key`; returns Map<key, MeshData>.
   * Vertices are duplicated per group so each result is self-contained.
   */
  partition(classify) {
    const groups = new Map();
    const P = this.positions;
    const idx = this.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const key = classify((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3, t / 3);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const out = new Map();
    for (const [key, tris] of groups) {
      const m = new MeshData();
      m.positions = this.positions;
      m.normals = this.normals;
      m.indices = tris;
      const c = new MeshData();
      c.positions = m.positions.slice();
      c.normals = m.normals.slice();
      c.indices = tris.slice();
      out.set(key, c.compact());
    }
    return out;
  }

  bounds() {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < this.vertexCount; i++) box.expandByPoint(this.getPos(i, v));
    return box;
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    if (this.uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    if (this.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    const n = this.vertexCount;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.indices, 1) : new THREE.Uint16BufferAttribute(this.indices, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Build MeshData from a THREE.BufferGeometry (indexed or not). */
export function meshFromGeometry(geometry) {
  const g = geometry.index ? geometry : geometry.toNonIndexed();
  const m = new MeshData();
  const pos = g.getAttribute('position');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const nor = g.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) m.addVertex(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
  if (g.index) for (let i = 0; i < g.index.count; i++) m.indices.push(g.index.getX(i));
  else for (let i = 0; i < pos.count; i++) m.indices.push(i);
  return m;
}

/**
 * Ordered boundary loops of a welded mesh. Each loop follows the triangle winding, so for an
 * outward-facing surface the panel interior lies to the left of the travel direction.
 */
export function boundaryLoops(mesh) {
  const idx = mesh.indices;
  const edgeCount = new Map();
  const key = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e];
      const b = idx[t + ((e + 1) % 3)];
      const k = key(a, b);
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    }
  }
  const next = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e];
      const b = idx[t + ((e + 1) % 3)];
      if (edgeCount.get(key(a, b)) === 1) {
        if (!next.has(a)) next.set(a, []);
        next.get(a).push(b);
      }
    }
  }
  const loops = [];
  const used = new Set();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let v = start;
    let guard = 0;
    while (!used.has(v) && guard++ < 1e6) {
      used.add(v);
      loop.push(v);
      const outs = next.get(v);
      if (!outs) break;
      const nv = outs.find((o) => !used.has(o)) ?? outs[0];
      if (nv === start) break;
      v = nv;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
