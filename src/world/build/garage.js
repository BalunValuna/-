import * as THREE from 'three';
import { Builder } from './Builder.js';
import { M } from './materials.js';
import { wall, floor, plinth } from './structure.js';
import { Door } from './Door.js';
import * as F from './furniture.js';
import { GROUP, groups } from '../../physics/physics.js';

/**
 * Garage with a roll-up door facing +Z, a side door, workbench and pegboard, shelving, tyres
 * and drums. The car bay is the centre of the floor. Used for the home and roadside workshops.
 */
export class RollDoor {
  constructor(game, parent, { w, h, at, mat, open = 0 }) {
    this.game = game;
    this.kind = 'rolldoor';
    this.w = w;
    this.h = h;
    this.group = new THREE.Group();
    this.group.position.copy(at);
    parent.add(this.group);
    this.panel = new THREE.Group();
    this.group.add(this.panel);
    const slats = 14;
    const sh = h / slats;
    for (let i = 0; i < slats; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w, sh * 0.96, 0.045), mat);
      s.position.y = sh * (i + 0.5);
      s.castShadow = s.receiveShadow = true;
      this.panel.add(s);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.05), M.metal(0x333333, 0.4));
    handle.position.set(0, 0.25, 0.04);
    this.panel.add(handle);
    const R = game.physics.R;
    this.body = game.physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    this.collider = game.physics.world.createCollider(R.ColliderDesc.cuboid(w / 2, h / 2, 0.05).setCollisionGroups(groups(GROUP.STATIC)), this.body);
    game.physics.setOwner(this.collider, { kind: 'door', door: this, surface: 'metal' });
    this.open = open;
    this.target = open;
    this.apply(true);
  }

  toggle() {
    this.target = this.target > 0.5 ? 0 : 1;
    this.game.audio?.play('trunk_open', { pos: this.worldPos(), pitch: 0.6 });
    return true;
  }

  worldPos() {
    return this.panel.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.2, 0));
  }

  update(dt) {
    if (this.open === this.target) return;
    this.open = this.target > this.open ? Math.min(this.target, this.open + dt * 0.45) : Math.max(this.target, this.open - dt * 0.6);
    this.apply();
  }

  apply(teleport = false) {
    const e = this.open;
    this.panel.position.y = e * (this.h - 0.25);
    this.panel.scale.y = 1 - e * 0.85;
    this.panel.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(0, this.h / 2, 0).applyMatrix4(this.panel.matrixWorld);
    const q = this.group.getWorldQuaternion(new THREE.Quaternion());
    // when open the collider sits above the opening
    if (e > 0.6) p.y += this.h;
    if (teleport) {
      this.body.setTranslation(p, false);
      this.body.setRotation(q, false);
    }
    this.body.setNextKinematicTranslation(p);
    this.body.setNextKinematicRotation(q);
  }

  shift() {
    this.apply(true);
  }

  dispose() {
    this.game.physics.removeBody(this.body);
    this.group.parent?.remove(this.group);
  }
}

export function buildGarage(ctx, rng, { home = false } = {}) {
  const W = 7.2;
  const D = 8.2;
  const H = 3.1;
  const b = new Builder();
  const group = new THREE.Group();
  group.name = 'garage';
  let gMax = -Infinity;
  let gMin = Infinity;
  for (let x = -W / 2; x <= W / 2; x += 1) {
    for (let z = -D / 2; z <= D / 2 + 2; z += 1) {
      const h = ctx.groundAt(x, z);
      gMax = Math.max(gMax, h);
      gMin = Math.min(gMin, h);
    }
  }
  const y0 = gMax + 0.12;
  const block = M.concrete(0xa8a298, 12);
  const inner = M.concrete(0xb8b2a6, 13);
  const slab = M.concrete(0x8a867e, 14);
  plinth(b, -W / 2, -D / 2, W / 2, D / 2, gMin - 0.4, y0, slab);
  floor(b, -W / 2, -D / 2, W / 2, D / 2, y0, slab, { surface: 'concrete', thickness: 0.1 });
  // driveway apron ramps down to the ground in front of the door
  const apronZ = D / 2 + 1.2;
  const groundFront = ctx.groundAt(0, apronZ + 1);
  const rise = y0 - groundFront;
  const ramp = new THREE.BoxGeometry(3.6, 0.2, 2.6);
  const uv = ramp.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3.6, uv.getY(i) * 2.6);
  const tilt = Math.atan2(rise, 2.4);
  b.mesh(ramp, slab, 0, y0 - rise / 2 - 0.1, D / 2 + 1.25, 0, 1, tilt);
  b.collider(0, y0 - rise / 2 - 0.1, D / 2 + 1.25, 3.6, 0.2, 2.6, 0, 'concrete');
  const rampCol = b.colliders[b.colliders.length - 1];
  rampCol.rotX = tilt;

  const t = 0.22;
  wall(b, { x0: -W / 2 - t / 2, z0: -D / 2, x1: W / 2 + t / 2, z1: -D / 2, y: y0, h: H, t, left: inner, right: block, surface: 'concrete', openings: [{ at: W / 2 + 1.8, w: 1.0, y0: 1.5, y1: 2.2, kind: 'window' }], trim: M.paint(0x5a5a52, 0.6) });
  wall(b, { x0: -W / 2, z0: D / 2, x1: -W / 2, z1: -D / 2, y: y0, h: H, t, left: inner, right: block, surface: 'concrete', openings: [{ at: 2.0, w: 0.9, y0: 0, y1: 2.05, kind: 'door' }], trim: M.paint(0x5a5a52, 0.6) });
  wall(b, { x0: W / 2, z0: -D / 2, x1: W / 2, z1: D / 2, y: y0, h: H, t, left: inner, right: block, surface: 'concrete', openings: [{ at: 4.0, w: 1.2, y0: 1.4, y1: 2.2, kind: 'window' }], trim: M.paint(0x5a5a52, 0.6) });
  // front wall with the big opening
  const doorW = 3.0;
  const doorH = 2.45;
  wall(b, { x0: W / 2 + t / 2, z0: D / 2, x1: -W / 2 - t / 2, z1: D / 2, y: y0, h: H, t, left: inner, right: block, surface: 'concrete', openings: [{ at: W / 2 + t / 2, w: doorW, y0: 0, y1: doorH, kind: 'door' }], trim: M.paint(0x5a5a52, 0.6) });
  // corrugated roof on beams
  const roof = M.metal(0x7a7e80, 0.55);
  b.box(0, y0 + H + 0.12, 0, W + 0.9, 0.08, D + 0.9, { py: roof, ny: M.metal(0x5a5e60, 0.7), px: roof, nx: roof, pz: roof, nz: roof });
  for (let x = -W / 2 + 0.6; x < W / 2; x += 1.2) b.box(x, y0 + H - 0.06, 0, 0.12, 0.18, D, M.wood(0x5a4630));
  // hanging light
  b.mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), M.metal(0x222222), 0, y0 + H - 0.25, 0.4);
  b.mesh(new THREE.ConeGeometry(0.18, 0.12, 16, 1, true), M.metal(0x2a4a3a, 0.5), 0, y0 + H - 0.52, 0.4);

  const loot = [];
  const add = (res, f) => {
    for (const l of res.loot || []) {
      const p = f.point(...l.pos);
      loot.push({ pos: [p.x, p.y, p.z], table: l.table, hidden: l.hidden });
    }
  };
  // back wall: workbench; side walls: shelves, tyres, drums
  let f = b.frame(-0.6, y0, -D / 2 + 0.5, 0);
  const bench = F.workbench(f, rng, { w: 2.4 });
  add(bench, f);
  f = b.frame(2.6, y0, -D / 2 + 0.35, 0);
  add(F.metalShelf(f, rng, { w: 1.4 }), f);
  f = b.frame(-W / 2 + 0.35, y0, -1.2, Math.PI / 2);
  add(F.metalShelf(f, rng, { w: 1.6 }), f);
  f = b.frame(W / 2 - 0.45, y0, -1.5, -Math.PI / 2);
  add(F.tireStack(f, rng, 3), f);
  f = b.frame(W / 2 - 0.45, y0, 0.2, -Math.PI / 2);
  add(F.oilDrum(f, rng), f);
  f = b.frame(-W / 2 + 0.5, y0, 1.4, Math.PI / 2);
  add(F.cardboardBoxes(f, rng, 2), f);
  // wall calendar and shelf details on the back wall
  b.box(1.4, y0 + 1.7, -D / 2 + 0.13, 0.3, 0.42, 0.01, M.paint(0xe8e0d0, 0.8));
  b.box(1.4, y0 + 1.82, -D / 2 + 0.135, 0.3, 0.14, 0.01, M.paint(0xa83a2a, 0.6));

  b.finish(group);
  const doors = [
    new RollDoor(ctx.game, group, { w: doorW - 0.06, h: doorH, at: new THREE.Vector3(0, y0, D / 2 - 0.02), mat: M.metal(home ? 0x8a8a7a : 0x6a7a6a, 0.6), open: home ? 0 : 1 }),
    new Door(ctx.game, group, { w: 0.84, h: 2.02, t: 0.045, at: new THREE.Vector3(-W / 2, y0, D / 2 - 2.0), rotY: Math.PI / 2, hinge: 'right', mat: M.metal(0x4a5a5a, 0.5), open: 0 }),
  ];
  // lamp for night (switchable)
  const bulbLight = new THREE.PointLight(0xffdcae, 0, 9, 1.6);
  bulbLight.position.set(0, y0 + H - 0.6, 0.4);
  group.add(bulbLight);
  return {
    group,
    builder: b,
    doors,
    loot,
    sleep: [],
    floorY: y0,
    bounds: { x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2, y0, y1: y0 + H },
    carSpot: new THREE.Vector3(0.3, y0, 0.4),
    bench: bench.loot.map((l) => new THREE.Vector3(...l.pos).add(new THREE.Vector3(-0.6, y0, -D / 2 + 0.5))),
    light: bulbLight,
    // floor spots for parts in a bare-frame start
    partSpots: [
      [-2.6, 2.6, 0.2],
      [-2.6, 1.3, 0.2],
      [2.5, 2.8, -0.3],
      [2.6, -0.8, 1.2],
      [-1.5, -2.6, 0],
      [1.2, -2.8, 0],
      [-2.8, -0.2, 1.57],
      [2.8, 2.0, -1.57],
    ].map(([x, z, r]) => ({ pos: new THREE.Vector3(x, y0, z), rot: r })),
  };
}
