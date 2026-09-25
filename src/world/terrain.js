import * as THREE from 'three';
import { ROAD, SURFACE } from './worldgen.js';
import { GROUP, groups } from '../physics/physics.js';
import { clamp, smoothstep } from '../core/math.js';

/**
 * Streamed terrain: square chunks with distance LOD (and skirts against cracks), a heightfield
 * collider for chunks near the player, and the highway ribbon laid on top.
 */
export const CHUNK = 64;
const LODS = [
  { dist: 110, seg: 48 },
  { dist: 260, seg: 24 },
  { dist: 520, seg: 12 },
  { dist: 1100, seg: 6 },
];
const COLLIDER_DIST = 120;

export class Terrain {
  constructor({ gen, physics, scene, materials }) {
    this.gen = gen;
    this.physics = physics;
    this.scene = scene;
    this.mats = materials;
    this.chunks = new Map();
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.origin = { x: 0, z: 0 };
    this.queue = [];
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  /** Height sampler for one z row with the road sample cached (same rule as WorldGen.height). */
  row(z) {
    const g = this.gen;
    const rx = g.roadX(z);
    const ry = g.roadY(z);
    return (x) => {
      const h = g.baseHeight(x, z, rx, ry);
      const pad = g.padAt?.(x, z);
      return pad ? h + (pad.h - h) * pad.w : h;
    };
  }

  update(px, pz, budget = 3) {
    const wx = px + this.origin.x;
    const wz = pz + this.origin.z;
    const ccx = Math.floor(wx / CHUNK);
    const ccz = Math.floor(wz / CHUNK);
    const R = Math.ceil(LODS[LODS.length - 1].dist / CHUNK);
    const want = new Map();
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const mx = (cx + 0.5) * CHUNK;
        const mz = (cz + 0.5) * CHUNK;
        const d = Math.hypot(mx - wx, mz - wz);
        const lod = LODS.findIndex((l) => d < l.dist);
        if (lod < 0) continue;
        want.set(this.key(cx, cz), { cx, cz, lod, d, collide: d < COLLIDER_DIST });
      }
    }
    for (const [k, c] of this.chunks) {
      if (!want.has(k)) this.disposeChunk(k, c);
    }
    const todo = [];
    for (const [k, w] of want) {
      const c = this.chunks.get(k);
      if (!c || c.lod !== w.lod || c.collide !== w.collide) todo.push([k, w]);
    }
    todo.sort((a, b) => a[1].d - b[1].d);
    for (let i = 0; i < Math.min(budget, todo.length); i++) this.buildChunk(...todo[i]);
    return todo.length;
  }

  /** Builds everything missing around the point (used at load time). */
  warm(px, pz) {
    while (this.update(px, pz, 64) > 0);
  }

  buildChunk(k, { cx, cz, lod, collide }) {
    const old = this.chunks.get(k);
    const seg = LODS[lod].seg;
    const step = CHUNK / seg;
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const heights = new Float32Array((seg + 1) * (seg + 1));
    for (let j = 0; j <= seg; j++) {
      const z = z0 + j * step;
      const sample = this.row(z);
      for (let i = 0; i <= seg; i++) heights[j * (seg + 1) + i] = sample(x0 + i * step);
    }
    let mesh = old?.lod === lod ? old.mesh : null;
    if (!mesh) {
      if (old?.mesh) {
        this.group.remove(old.mesh);
        old.mesh.geometry.dispose();
      }
      mesh = new THREE.Mesh(this.makeGeometry(heights, seg, step, x0, z0), this.mats.terrain);
      mesh.receiveShadow = true;
      mesh.castShadow = lod <= 1;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    mesh.position.set(x0 - this.origin.x, 0, z0 - this.origin.z);
    mesh.updateMatrix();
    let collider = old?.collider ?? null;
    if (collide && !collider) collider = this.makeCollider(cx, cz);
    if (!collide && collider) {
      this.physics.removeCollider(collider);
      collider = null;
    }
    const road = old?.road ?? this.makeRoad(cx, cz);
    this.chunks.set(k, { cx, cz, lod, collide, mesh, collider, road });
  }

  makeGeometry(heights, seg, step, x0, z0) {
    const n = seg + 1;
    const count = n * n + 4 * n;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const idx = [];
    const sand = new THREE.Color(0xc9a476);
    const dirt = new THREE.Color(0xa5825a);
    const rock = new THREE.Color(0x9a6b4c);
    const gravel = new THREE.Color(0x8e8578);
    const c = new THREE.Color();
    const h = (i, j) => heights[clamp(j, 0, seg) * n + clamp(i, 0, seg)];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const v = j * n + i;
        const y = h(i, j);
        pos[v * 3] = i * step;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = j * step;
        const wx = x0 + i * step;
        const wz = z0 + j * step;
        const slope = Math.hypot(h(i + 1, j) - h(i - 1, j), h(i, j + 1) - h(i, j - 1)) / (2 * step);
        const surf = this.gen.surface(wx, wz);
        const tint = this.gen.n3.noise2(wx * 0.05, wz * 0.05) * 0.5 + 0.5;
        c.copy(sand).lerp(dirt, tint * 0.45);
        // compacted verge along the road, fading into sand over a few noisy metres
        const d = Math.abs(wx - this.gen.roadX(wz));
        const edge = ROAD.totalHalf + 2.2 + this.gen.n2.noise2(wx * 0.15, wz * 0.15) * 1.6;
        c.lerp(gravel, (1 - smoothstep(ROAD.totalHalf - 0.5, edge, d)) * 0.55);
        if (surf === SURFACE.ROCK) c.lerp(rock, 0.5);
        c.lerp(rock, smoothstep(0.35, 0.9, slope));
        col[v * 3] = c.r;
        col[v * 3 + 1] = c.g;
        col[v * 3 + 2] = c.b;
      }
    }
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * n + i;
        idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
      }
    }
    // skirts hide cracks between neighbouring LODs
    let v = n * n;
    const skirt = (edge) => {
      const start = v;
      for (let k = 0; k < n; k++) {
        const [i, j] = edge(k);
        const src = j * n + i;
        pos[v * 3] = pos[src * 3];
        pos[v * 3 + 1] = pos[src * 3 + 1] - 1.5;
        pos[v * 3 + 2] = pos[src * 3 + 2];
        col[v * 3] = col[src * 3];
        col[v * 3 + 1] = col[src * 3 + 1];
        col[v * 3 + 2] = col[src * 3 + 2];
        v++;
      }
      return start;
    };
    const edges = [(k) => [k, 0], (k) => [seg, k], (k) => [seg - k, seg], (k) => [0, seg - k]];
    for (const e of edges) {
      const s = skirt(e);
      for (let k = 0; k < seg; k++) {
        const [i0, j0] = e(k);
        const [i1, j1] = e(k + 1);
        const a = j0 * n + i0;
        const b = j1 * n + i1;
        idx.push(a, s + k, b, b, s + k, s + k + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  makeCollider(cx, cz) {
    const seg = 32;
    const step = CHUNK / seg;
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;
    const h = new Float32Array((seg + 1) * (seg + 1));
    for (let row = 0; row <= seg; row++) {
      const z = z0 + row * step;
      const sample = this.row(z);
      for (let colI = 0; colI <= seg; colI++) h[row + colI * (seg + 1)] = sample(x0 + colI * step);
    }
    const R = this.physics.R;
    const desc = R.ColliderDesc.heightfield(seg, seg, h, { x: CHUNK, y: 1, z: CHUNK })
      .setTranslation(x0 + CHUNK / 2 - this.origin.x, 0, z0 + CHUNK / 2 - this.origin.z)
      .setFriction(0.8)
      .setCollisionGroups(groups(GROUP.STATIC));
    const collider = this.physics.world.createCollider(desc);
    this.physics.setOwner(collider, { kind: 'terrain' });
    return collider;
  }

  /** Asphalt ribbon with painted markings for the part of the road inside this chunk. */
  makeRoad(cx, cz) {
    const z0 = cz * CHUNK;
    const x0 = cx * CHUNK;
    const g = this.gen;
    const rxMid = g.roadX(z0 + CHUNK / 2);
    if (rxMid < x0 - 40 || rxMid > x0 + CHUNK + 40) return null;
    const pts = [];
    for (let z = z0; z <= z0 + CHUNK + 1e-6; z += 2) {
      const rx = g.roadX(z);
      if (rx < x0 - ROAD.totalHalf - 2 || rx > x0 + CHUNK + ROAD.totalHalf + 2) continue;
      pts.push({ z, rx, ry: g.roadY(z), dx: g.roadDX(z) });
    }
    if (pts.length < 2) return null;
    const across = [-ROAD.totalHalf, -ROAD.halfWidth, 0, ROAD.halfWidth, ROAD.totalHalf];
    const pos = [];
    const uv = [];
    const idx = [];
    for (const p of pts) {
      const nlen = Math.hypot(1, p.dx);
      const nx = 1 / nlen;
      const nz = -p.dx / nlen;
      for (let k = 0; k < across.length; k++) {
        const a = across[k];
        const crown = -(clamp(Math.abs(a) / ROAD.totalHalf, 0, 1) ** 2) * 0.08;
        pos.push(p.rx + nx * a - this.origin.x, p.ry + crown + 0.035, p.z + nz * a - this.origin.z);
        uv.push((a + ROAD.totalHalf) / (2 * ROAD.totalHalf), p.z / 12);
      }
    }
    const m = across.length;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < m - 1; k++) {
        const a = i * m + k;
        // counter-clockwise seen from above (normals up)
        idx.push(a, a + m, a + 1, a + 1, a + m, a + m + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.mats.road);
    mesh.receiveShadow = true;
    mesh.userData.originX = this.origin.x;
    mesh.userData.originZ = this.origin.z;
    this.group.add(mesh);
    return mesh;
  }

  disposeChunk(k, c) {
    this.group.remove(c.mesh);
    c.mesh.geometry.dispose();
    if (c.road) {
      this.group.remove(c.road);
      c.road.geometry.dispose();
    }
    if (c.collider) this.physics.removeCollider(c.collider);
    this.chunks.delete(k);
  }

  setOrigin(ox, oz) {
    const dx = ox - this.origin.x;
    const dz = oz - this.origin.z;
    this.origin = { x: ox, z: oz };
    for (const c of this.chunks.values()) {
      c.mesh.position.x -= dx;
      c.mesh.position.z -= dz;
      c.mesh.updateMatrix();
      if (c.road) {
        c.road.position.x -= dx;
        c.road.position.z -= dz;
      }
    }
  }

  dispose() {
    for (const [k, c] of [...this.chunks]) this.disposeChunk(k, c);
    this.scene.remove(this.group);
  }

  /** Ground height at a local-space point (uses the generator, exact). */
  heightLocal(x, z) {
    return this.gen.height(x + this.origin.x, z + this.origin.z);
  }
}
