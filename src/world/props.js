import * as THREE from 'three';
import { Rng, hash } from '../core/rng.js';
import { ROAD } from './worldgen.js';
import { GROUP, groups } from '../physics/physics.js';
import { M } from './build/materials.js';
import { fieldGeometry } from '../geo/fieldMesh.js';
import { Noise } from '../core/noise.js';

/**
 * Roadside and desert dressing streamed in 128 m bands along the road: power-line poles with
 * sagging wires, kilometre posts and distance signs, rocks, dry shrubs and dead trees.
 * Rocks and poles get colliders near the player.
 */
const BAND = 128;
const RANGE = 900;
const COLLIDE = 160;

export class Props {
  constructor(world) {
    this.world = world;
    this.game = world.game;
    this.gen = world.gen;
    this.bands = new Map();
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.game.scene.add(this.group);
    this.geo = propGeometries();
  }

  update(camPos, force = false) {
    const o = this.game.origin;
    const wz = camPos.z + o.z;
    const b0 = Math.floor((wz - RANGE) / BAND);
    const b1 = Math.floor((wz + RANGE) / BAND);
    let budget = force ? 99 : 1;
    for (let b = b0; b <= b1 && budget > 0; b++) {
      if (!this.bands.has(b)) {
        this.buildBand(b);
        budget--;
      }
    }
    for (const [b, band] of this.bands) {
      if (b < b0 - 1 || b > b1 + 1) this.disposeBand(b, band);
      else {
        const near = Math.abs((b + 0.5) * BAND - wz) < COLLIDE;
        if (near && !band.colliders) this.addColliders(band);
        if (!near && band.colliders) this.removeColliders(band);
      }
    }
  }

  buildBand(b) {
    const gen = this.gen;
    const rng = new Rng(hash(this.world.seed, b, 77));
    const o = this.game.origin;
    const group = new THREE.Group();
    const solids = [];
    const inst = { rock: [], shrub: [], tree: [], pole: [], post: [] };
    const z0 = b * BAND;
    // power line on the left side, poles every 55 m
    const poleX = -ROAD.totalHalf - 7.5;
    const poles = [];
    for (let z = Math.ceil(z0 / 55) * 55; z < z0 + BAND; z += 55) {
      const rx = gen.roadX(z);
      const h = gen.roadHeading(z);
      const x = rx + Math.cos(h) * poleX;
      const zz = z - Math.sin(h) * poleX;
      const y = gen.height(x, zz);
      poles.push(new THREE.Vector3(x, y, zz));
      inst.pole.push([x, y, zz, h, 1]);
      solids.push({ type: 'pole', x, y, z: zz });
    }
    // one extra pole behind the band for the wire span
    const zPrev = Math.ceil(z0 / 55) * 55 - 55;
    {
      const rx = gen.roadX(zPrev);
      const h = gen.roadHeading(zPrev);
      const x = rx + Math.cos(h) * poleX;
      const zz = zPrev - Math.sin(h) * poleX;
      poles.unshift(new THREE.Vector3(x, gen.height(x, zz), zz));
    }
    const wires = [];
    for (let i = 0; i < poles.length - 1; i++) {
      for (const off of [-0.8, 0, 0.8]) {
        const a = poles[i].clone().add(new THREE.Vector3(off, 7.6, 0));
        const c = poles[i + 1].clone().add(new THREE.Vector3(off, 7.6, 0));
        for (let k = 0; k < 8; k++) {
          const t0 = k / 8;
          const t1 = (k + 1) / 8;
          const p0 = a.clone().lerp(c, t0);
          const p1 = a.clone().lerp(c, t1);
          p0.y -= Math.sin(t0 * Math.PI) * 1.1;
          p1.y -= Math.sin(t1 * Math.PI) * 1.1;
          wires.push(p0.x - o.x, p0.y, p0.z - o.z, p1.x - o.x, p1.y, p1.z - o.z);
        }
      }
    }
    if (wires.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
      group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1a1a1a })));
    }
    // kilometre posts on the right shoulder, big distance signs every 25 km
    for (let z = Math.ceil(z0 / 1000) * 1000; z < z0 + BAND; z += 1000) {
      const rx = gen.roadX(z);
      const h = gen.roadHeading(z);
      const off = ROAD.totalHalf + 0.8;
      const x = rx + Math.cos(h) * off;
      const zz = z - Math.sin(h) * off;
      inst.post.push([x, gen.height(x, zz), zz, h, 1]);
      const km = Math.round(z / 1000);
      if (km % 25 === 0 && km > 0) group.add(this.distanceSign(x + Math.cos(h) * 2, gen.height(x + 2, zz), zz, h, km));
    }
    // scatter
    const noise = this.world.scatterNoise;
    const count = 70;
    for (let i = 0; i < count; i++) {
      const z = z0 + rng.range(0, BAND);
      const side = rng.sign();
      const d = ROAD.totalHalf + 4 + rng.range(0, 1) ** 1.6 * 240;
      const rx = gen.roadX(z);
      const x = rx + side * d;
      const dens = noise.noise2(x * 0.01, z * 0.01) * 0.5 + 0.5;
      if (rng.next() > dens * 1.3) continue;
      const y = gen.height(x, z);
      const kind = rng.weighted([
        ['shrub', 6],
        ['rock', 3],
        ['tree', 0.4],
      ]);
      const s = kind === 'rock' ? rng.range(0.4, 1.8) : kind === 'tree' ? rng.range(0.8, 1.3) : rng.range(0.5, 1.2);
      inst[kind].push([x, y - (kind === 'rock' ? s * 0.25 : 0), z, rng.range(0, Math.PI * 2), s]);
      if ((kind === 'rock' && s > 0.9) || kind === 'tree') solids.push({ type: kind, x, y, z, s });
    }
    for (const [kind, list] of Object.entries(inst)) {
      if (!list.length) continue;
      const { geo, mat } = this.geo[kind];
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4();
      list.forEach(([x, y, z, r, s], i) => {
        m.compose(new THREE.Vector3(x - o.x, y, z - o.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r), new THREE.Vector3(s, s * (kind === 'rock' ? rng.range(0.6, 1) : 1), s));
        im.setMatrixAt(i, m);
      });
      im.castShadow = kind !== 'shrub';
      im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    }
    group.userData.origin = { ...o };
    this.group.add(group);
    this.bands.set(b, { group, solids, colliders: null, origin: { ...o } });
  }

  distanceSign(x, y, z, h, km) {
    const o = this.game.origin;
    const g = new THREE.Group();
    const left = this.world.goalKm - km;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1f6a3a';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 492, 236);
    ctx.fillStyle = '#f0f0f0';
    ctx.font = 'bold 62px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('ПРИБРЕЖНЫЙ', 256, 105);
    ctx.font = 'bold 76px Arial';
    ctx.fillText(`${left} км`, 256, 200);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 0.06), [M.metal(0x777777), M.metal(0x777777), M.metal(0x777777), M.metal(0x777777), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), M.metal(0x777777)]);
    board.position.y = 2.6;
    g.add(board);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8), M.metal(0x8a8a8a));
      post.position.set(s * 0.9, 1.6, -0.05);
      g.add(post);
    }
    g.position.set(x - o.x, y, z - o.z);
    g.rotation.y = h + Math.PI;
    g.traverse((m) => m.isMesh && (m.castShadow = true));
    return g;
  }

  addColliders(band) {
    const R = this.game.physics.R;
    const o = this.game.origin;
    band.colliders = band.solids.map((s) => {
      const desc =
        s.type === 'pole'
          ? R.ColliderDesc.cylinder(4.2, 0.16).setTranslation(s.x - o.x, s.y + 4.2, s.z - o.z)
          : s.type === 'tree'
            ? R.ColliderDesc.cylinder(1.5, 0.18 * s.s).setTranslation(s.x - o.x, s.y + 1.5, s.z - o.z)
            : R.ColliderDesc.ball(0.55 * s.s).setTranslation(s.x - o.x, s.y + 0.1 * s.s, s.z - o.z);
      desc.setCollisionGroups(groups(GROUP.STATIC)).setFriction(0.9);
      const c = this.game.physics.world.createCollider(desc);
      this.game.physics.setOwner(c, { kind: 'static', surface: s.type === 'rock' ? 'rock' : 'wood' });
      return c;
    });
  }

  removeColliders(band) {
    for (const c of band.colliders) this.game.physics.removeCollider(c);
    band.colliders = null;
  }

  disposeBand(b, band) {
    if (band.colliders) this.removeColliders(band);
    this.group.remove(band.group);
    band.group.traverse((o) => {
      if (o.isInstancedMesh || o.isLineSegments) o.geometry.dispose?.();
      if (o.isInstancedMesh) o.dispose();
    });
    this.bands.delete(b);
  }

  shift(dx, dz) {
    for (const band of this.bands.values()) {
      band.group.position.x -= dx;
      band.group.position.z -= dz;
    }
  }

  dispose() {
    for (const [b, band] of [...this.bands]) this.disposeBand(b, band);
    this.game.scene.remove(this.group);
  }
}

let protoGeos = null;
function propGeometries() {
  if (protoGeos) return protoGeos;
  const n = new Noise(4242);
  const rock = fieldGeometry(
    (x, y, z) => {
      const d = Math.hypot(x * 0.9, y * 1.4, z) - 0.5;
      return d + n.noise3(x * 3, y * 3, z * 3) * 0.12 + n.noise3(x * 8, y * 8, z * 8) * 0.03;
    },
    [-0.75, -0.45, -0.7],
    [0.75, 0.5, 0.7],
    0.06,
  );
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a7a5e, roughness: 0.95, flatShading: false });
  // shrub: a bundle of thin crossed cards with dry twigs
  const shrubGeo = new THREE.BufferGeometry();
  {
    const pos = [];
    const col = [];
    const r = new Rng(9);
    for (let i = 0; i < 26; i++) {
      const a = r.range(0, Math.PI * 2);
      const len = r.range(0.35, 0.7);
      const tilt = r.range(0.3, 1.1);
      const tip = [Math.cos(a) * Math.sin(tilt) * len, Math.cos(tilt) * len, Math.sin(a) * Math.sin(tilt) * len];
      const w = 0.02;
      const px = -Math.sin(a) * w;
      const pz = Math.cos(a) * w;
      pos.push(px, 0, pz, -px, 0, -pz, tip[0], tip[1], tip[2]);
      pos.push(-px, 0, -pz, px, 0, pz, tip[0], tip[1], tip[2]);
      const c = r.range(0.75, 1.1);
      for (let k = 0; k < 6; k++) col.push(0.45 * c, 0.37 * c, 0.24 * c);
    }
    shrubGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    shrubGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    shrubGeo.computeVertexNormals();
  }
  const shrubMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  // dead tree: trunk and a few bent branches
  const tree = new THREE.BufferGeometry();
  {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.09, 0.2, 3, 7, 4);
    trunk.translate(0, 1.5, 0);
    parts.push(trunk);
    const r = new Rng(3);
    for (let i = 0; i < 5; i++) {
      const br = new THREE.CylinderGeometry(0.02, 0.07, r.range(0.8, 1.6), 5);
      br.translate(0, br.parameters.height / 2, 0);
      br.rotateZ(r.range(0.5, 1.1) * (i % 2 ? 1 : -1));
      br.rotateY(r.range(0, Math.PI * 2));
      br.translate(0, r.range(1.6, 2.8), 0);
      parts.push(br);
    }
    const merged = mergeSimple(parts);
    tree.copy(merged);
  }
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.95 });
  // wooden power-line pole with a cross-arm and insulators
  const pole = mergeSimple([
    new THREE.CylinderGeometry(0.12, 0.16, 8.4, 8).translate(0, 4.2, 0),
    new THREE.BoxGeometry(2.2, 0.14, 0.12).translate(0, 7.6, 0),
    new THREE.CylinderGeometry(0.035, 0.05, 0.16, 6).translate(-0.8, 7.75, 0),
    new THREE.CylinderGeometry(0.035, 0.05, 0.16, 6).translate(0, 7.75, 0),
    new THREE.CylinderGeometry(0.035, 0.05, 0.16, 6).translate(0.8, 7.75, 0),
  ]);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.9 });
  const post = mergeSimple([new THREE.BoxGeometry(0.12, 1.1, 0.1).translate(0, 0.55, 0), new THREE.BoxGeometry(0.13, 0.25, 0.11).translate(0, 0.95, 0)]);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.6 });
  protoGeos = {
    rock: { geo: rock, mat: rockMat },
    shrub: { geo: shrubGeo, mat: shrubMat },
    tree: { geo: tree, mat: treeMat },
    pole: { geo: pole, mat: poleMat },
    post: { geo: post, mat: postMat },
  };
  return protoGeos;
}

function mergeSimple(list) {
  const pos = [];
  const nrm = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return out;
}
