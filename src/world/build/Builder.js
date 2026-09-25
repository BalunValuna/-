import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUP, groups } from '../../physics/physics.js';

/**
 * Accumulates static geometry per material and merges it into one mesh per material (few draw
 * calls per building). Also collects static box colliders. Coordinates are in the builder's
 * local frame; `finish(root)` adds the meshes under `root`.
 */
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpV = new THREE.Vector3();

export class Builder {
  constructor() {
    this.byMat = new Map();
    this.colliders = [];
    this.lights = [];
  }

  addGeometry(geo, mat, matrix = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count * 2)), 2));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
  }

  /**
   * Box with metre-scaled UVs. `mats` is one material or per-face { px, nx, py, ny, pz, nz };
   * a face set to null is skipped (hidden faces against other boxes).
   */
  box(cx, cy, cz, sx, sy, sz, mats, { rotY = 0, uv = 1, collide = false, surface = null, owner = null } = {}) {
    const faces = [
      ['px', [1, 0, 0], sz, sy],
      ['nx', [-1, 0, 0], sz, sy],
      ['py', [0, 1, 0], sx, sz],
      ['ny', [0, -1, 0], sx, sz],
      ['pz', [0, 0, 1], sx, sy],
      ['nz', [0, 0, -1], sx, sy],
    ];
    tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    tmpM.compose(tmpV.set(cx, cy, cz), tmpQ, tmpS);
    for (const [key, n, fw, fh] of faces) {
      const mat = mats && mats.isMaterial ? mats : mats?.[key];
      if (!mat) continue;
      const plane = new THREE.PlaneGeometry(fw, fh);
      const uvA = plane.getAttribute('uv');
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * fw * uv, uvA.getY(i) * fh * uv);
      const m = new THREE.Matrix4();
      const half = [sx / 2, sy / 2, sz / 2];
      if (key === 'px') m.makeRotationY(Math.PI / 2).setPosition(half[0], 0, 0);
      if (key === 'nx') m.makeRotationY(-Math.PI / 2).setPosition(-half[0], 0, 0);
      if (key === 'py') m.makeRotationX(-Math.PI / 2).setPosition(0, half[1], 0);
      if (key === 'ny') m.makeRotationX(Math.PI / 2).setPosition(0, -half[1], 0);
      if (key === 'pz') m.setPosition(0, 0, half[2]);
      if (key === 'nz') m.makeRotationY(Math.PI).setPosition(0, 0, -half[2]);
      plane.applyMatrix4(m);
      plane.applyMatrix4(tmpM);
      this.addGeometry(plane, mat);
    }
    if (collide) this.collider(cx, cy, cz, sx, sy, sz, rotY, surface, owner);
  }

  collider(cx, cy, cz, sx, sy, sz, rotY = 0, surface = null, owner = null) {
    this.colliders.push({ c: [cx, cy, cz], h: [sx / 2, sy / 2, sz / 2], rotY, surface, owner });
  }

  /** Arbitrary geometry placed with position / rotation (Euler or yaw) / scale. */
  mesh(geo, mat, x = 0, y = 0, z = 0, rotY = 0, scale = 1, rotX = 0, rotZ = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')),
      typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale,
    );
    this.addGeometry(geo, mat, m);
  }

  /** Nested builder frame: returns a proxy whose calls are offset/rotated by (x, z, rotY). */
  frame(x, y, z, rotY) {
    return new FrameBuilder(this, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)), rotY);
  }

  finish(root, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [mat, list] of this.byMat) {
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!geo) continue;
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = castShadow && !mat.transparent;
      m.receiveShadow = receiveShadow;
      m.matrixAutoUpdate = false;
      root.add(m);
      meshes.push(m);
    }
    this.byMat.clear();
    return meshes;
  }
}

/** Builder view with a local transform (for furniture placed inside rooms). */
class FrameBuilder {
  constructor(base, matrix, rotY) {
    this.base = base;
    this.m = matrix;
    this.rotY = rotY;
  }

  addGeometry(geo, mat, matrix = null) {
    const m = matrix ? this.m.clone().multiply(matrix) : this.m;
    this.base.addGeometry(geo, mat, m);
  }

  box(cx, cy, cz, sx, sy, sz, mats, opts = {}) {
    const p = new THREE.Vector3(cx, cy, cz).applyMatrix4(this.m);
    this.base.box(p.x, p.y, p.z, sx, sy, sz, mats, { ...opts, rotY: (opts.rotY || 0) + this.rotY });
  }

  collider(cx, cy, cz, sx, sy, sz, rotY = 0, surface = null, owner = null) {
    const p = new THREE.Vector3(cx, cy, cz).applyMatrix4(this.m);
    this.base.collider(p.x, p.y, p.z, sx, sy, sz, rotY + this.rotY, surface, owner);
  }

  mesh(geo, mat, x = 0, y = 0, z = 0, rotY = 0, scale = 1, rotX = 0, rotZ = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')),
      typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale,
    );
    this.addGeometry(geo, mat, m);
  }

  frame(x, y, z, rotY) {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1));
    const f = new FrameBuilder(this.base, this.m.clone().multiply(local), this.rotY + rotY);
    return f;
  }

  /** Point in the base frame. */
  point(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.m);
  }
}

/** Creates the static colliders collected by a builder at a world offset (local coords). */
export function createColliders(physics, list, offset, rotY = 0, ownerDefault = null) {
  const R = physics.R;
  const out = [];
  const q = new THREE.Quaternion();
  for (const c of list) {
    const p = new THREE.Vector3(...c.c).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY).add(offset);
    q.setFromEuler(new THREE.Euler(c.rotX || 0, rotY + c.rotY, 0, 'YXZ'));
    const desc = R.ColliderDesc.cuboid(...c.h)
      .setTranslation(p.x, p.y, p.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.8)
      .setCollisionGroups(groups(GROUP.STATIC));
    const col = physics.world.createCollider(desc);
    physics.setOwner(col, c.owner || { kind: 'static', surface: c.surface || ownerDefault?.surface || 'concrete' });
    out.push(col);
  }
  return out;
}
