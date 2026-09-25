import * as THREE from 'three';
import { fieldGeometry, sdRoundCone } from '../geo/fieldMesh.js';
import { sdEllipsoid, sdRoundBox, smin } from '../geo/sdf.js';
import { grainNormal, fabricNormal } from '../render/textures.js';
import { clamp, lerp } from '../core/math.js';

/**
 * First-person hands: modelled from implicit segments (palm, three phalanges per finger, thumb,
 * nails) on a joint rig, with jacket sleeves. Poses blend smoothly; each hand can rest, reach to a
 * point, grip an item, hold a dragged object or steer. Drawn in an overlay pass so they never
 * cut into walls.
 *
 * Right-hand space: wrist at the origin, fingers along -Z, back of the hand +Y, thumb on -X.
 */
const FINGERS = [
  // knuckle position, phalanx lengths, base radius
  { at: [-0.0265, 0.0015, -0.093], len: [0.038, 0.024, 0.019], r: 0.0099 },
  { at: [-0.0078, 0.0025, -0.098], len: [0.042, 0.027, 0.02], r: 0.0102 },
  { at: [0.0108, 0.0015, -0.095], len: [0.04, 0.025, 0.019], r: 0.0096 },
  { at: [0.0283, -0.0005, -0.086], len: [0.031, 0.02, 0.017], r: 0.0086 },
];
const THUMB = { at: [-0.03, -0.012, -0.03], len: [0.036, 0.029, 0.025], r: 0.0122 };
/** Thumb base frame: long axis out of the thenar pad, nail facing outwards (flexes across the palm). */
function thumbFrame(side) {
  const A = new THREE.Vector3(-0.62, -0.28, -0.73).normalize();
  const U = new THREE.Vector3(-0.55, 0.8, 0.05);
  U.addScaledVector(A, -U.dot(A)).normalize();
  const Z = A.clone().negate();
  const X = new THREE.Vector3().crossVectors(U, Z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, U, Z));
}

/** Pose presets: finger curls [mcp, pip, dip] (radians), spread, thumb [base, mcp, ip], wrist tilt. */
export const POSES = {
  relaxed: { curl: [[0.25, 0.35, 0.2], [0.3, 0.4, 0.22], [0.35, 0.45, 0.25], [0.42, 0.5, 0.3]], spread: 0.06, thumb: [0.25, 0.2, 0.15] },
  open: { curl: [[0.05, 0.08, 0.05], [0.05, 0.08, 0.05], [0.07, 0.1, 0.06], [0.1, 0.12, 0.08]], spread: 0.12, thumb: [0.05, 0.05, 0.05] },
  grip: { curl: [[1.15, 1.35, 0.8], [1.2, 1.4, 0.85], [1.25, 1.4, 0.85], [1.3, 1.35, 0.8]], spread: 0.0, thumb: [1.1, 0.5, 0.35] },
  hold: { curl: [[0.85, 1.05, 0.6], [0.9, 1.1, 0.62], [0.95, 1.1, 0.62], [1.0, 1.05, 0.6]], spread: 0.02, thumb: [0.8, 0.35, 0.3] },
  pinch: { curl: [[0.75, 0.75, 0.35], [0.95, 1.3, 0.8], [1.1, 1.4, 0.85], [1.2, 1.4, 0.85]], spread: 0.0, thumb: [0.85, 0.35, 0.45] },
  point: { curl: [[0.05, 0.05, 0.05], [1.3, 1.45, 0.9], [1.35, 1.45, 0.9], [1.4, 1.4, 0.85]], spread: 0.02, thumb: [0.9, 0.6, 0.5] },
  flat: { curl: [[0.02, 0.02, 0.02], [0.02, 0.02, 0.02], [0.02, 0.02, 0.02], [0.02, 0.02, 0.02]], spread: 0.04, thumb: [0.15, 0.05, 0.05] },
  wheel: { curl: [[1.0, 1.25, 0.7], [1.05, 1.3, 0.75], [1.1, 1.3, 0.75], [1.15, 1.25, 0.7]], spread: 0.0, thumb: [0.55, 0.25, 0.2] },
};

let shared = null;

function buildShared() {
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xc98f6d,
    roughness: 0.58,
    metalness: 0,
    sheen: 0.35,
    sheenColor: new THREE.Color(0xff9e80),
    sheenRoughness: 0.6,
    normalMap: grainNormal(14),
    normalScale: new THREE.Vector2(0.18, 0.18),
    name: 'skin',
  });
  const nail = new THREE.MeshPhysicalMaterial({ color: 0xe6b9a4, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.3, name: 'nail' });
  const sleeve = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    color: 0x4b4a3c,
    roughness: 0.92,
    normalMap: fabricNormal(),
    normalScale: new THREE.Vector2(0.7, 0.7),
    name: 'sleeve',
  });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x3a392f, roughness: 0.95, normalMap: fabricNormal(), name: 'cuff' });
  const watchStrap = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.7, name: 'strap' });
  const watchCase = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.25, metalness: 1, name: 'watch' });

  const C = 0.0016;
  // palm with the thenar pad and knuckle ridge; slightly cupped
  const palm = fieldGeometry(
    (x, y, z) => {
      const w = 0.041 - 0.006 * Math.max(0, (z + 0.02) / 0.03);
      let d = sdRoundBox(x, y + 0.0015 * Math.cos(x * 40), z + 0.052, w - 0.012, 0.0085, 0.045, 0.011);
      d = smin(d, sdEllipsoid(x + 0.024, y + 0.008, z + 0.033, 0.019, 0.013, 0.028), 0.01);
      d = smin(d, sdEllipsoid(x - 0.02, y + 0.006, z + 0.045, 0.02, 0.011, 0.035), 0.01);
      for (const f of FINGERS) d = smin(d, sdEllipsoid(x - f.at[0], y - f.at[1], z - f.at[2] - 0.004, f.r * 1.12, f.r * 1.05, f.r * 1.2), 0.008);
      // wrist
      d = smin(d, sdEllipsoid(x, y + 0.001, z - 0.012, 0.03, 0.019, 0.03), 0.018);
      return d;
    },
    [-0.06, -0.035, -0.115],
    [0.06, 0.03, 0.05],
    C,
  );
  const phalanx = (len, r0, r1, tip) =>
    fieldGeometry(
      (x, y, z) => {
        const yy = y * 1.08;
        let d = sdRoundCone(x, yy, z, 0, 0, 0, 0, 0, -len, r0, r1);
        // knuckle pad on the back, soft pad underneath
        d = smin(d, sdEllipsoid(x, y - r0 * 0.25, z + 0.002, r0 * 1.05, r0 * 0.95, r0 * 1.0), r0 * 0.5);
        if (tip) d = smin(d, sdEllipsoid(x, y + r1 * 0.25, z + len - r1 * 0.2, r1 * 0.95, r1 * 0.85, r1 * 1.25), r1 * 0.6);
        return d;
      },
      [-r0 - 0.004, -r0 - 0.004, -len - r1 - 0.006],
      [r0 + 0.004, r0 + 0.004, r0 + 0.004],
      Math.min(C, r1 * 0.22),
    );
  const fingers = FINGERS.map((f) => {
    const r = [f.r, f.r * 0.9, f.r * 0.82, f.r * 0.72];
    return f.len.map((len, i) => phalanx(len, r[i], r[i + 1], i === 2));
  });
  const t = THUMB;
  const thumb = [phalanx(t.len[0], t.r * 1.15, t.r, false), phalanx(t.len[1], t.r, t.r * 0.9, false), phalanx(t.len[2], t.r * 0.9, t.r * 0.78, true)];
  const nailGeo = (r, len) =>
    fieldGeometry((x, y, z) => sdRoundBox(x, y - Math.abs(x) * Math.abs(x) * 18, z, r * 0.62, 0.0006, len * 0.34, 0.0012), [-r, -0.004, -len * 0.5], [r, 0.004, len * 0.5], 0.0006);
  const nails = FINGERS.map((f) => nailGeo(f.r * 0.82, f.len[2]));
  const thumbNail = nailGeo(t.r * 0.8, t.len[2]);

  // sleeve along +Z from the wrist towards the elbow, with a turned-back cuff
  const sleeveGeo = new THREE.LatheGeometry(
    [
      [0.041, 0.04],
      [0.043, 0.055],
      [0.046, 0.1],
      [0.05, 0.2],
      [0.051, 0.36],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    28,
  ).rotateX(Math.PI / 2);
  // turned-back cuff: outer face, rolled lip, inner face (a closed ring section)
  const cuffGeo = new THREE.LatheGeometry(
    [
      [0.036, 0.062],
      [0.036, 0.03],
      [0.04, 0.022],
      [0.045, 0.024],
      [0.0475, 0.03],
      [0.0475, 0.05],
      [0.0445, 0.062],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    28,
  ).rotateX(Math.PI / 2);
  const forearm = fieldGeometry((x, y, z) => sdRoundCone(x, y * 1.2, z, 0, 0, 0.005, 0, 0, 0.2, 0.026, 0.034), [-0.04, -0.035, -0.03], [0.04, 0.035, 0.24], 0.004);
  const strap = new THREE.TorusGeometry(0.029, 0.0045, 6, 28).scale(1, 0.72, 2.2);
  const face = new THREE.CylinderGeometry(0.0145, 0.0145, 0.008, 24);
  return { skin, nail, sleeve, cuff, watchStrap, watchCase, palm, fingers, thumb, nails, thumbNail, sleeveGeo, cuffGeo, forearm, strap, face };
}

function mesh(geo, mat, name) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.frustumCulled = false;
  return m;
}

/** One hand with its rig. side: 1 = right, -1 = left (mirrored). */
class Hand {
  constructor(side) {
    const S = shared;
    this.side = side;
    this.root = new THREE.Group();
    this.root.name = side > 0 ? 'handR' : 'handL';
    this.mirror = new THREE.Group();
    this.mirror.scale.x = side;
    this.root.add(this.mirror);
    this.mirror.add(mesh(S.palm, S.skin, 'palm'));
    this.fingers = FINGERS.map((f, i) => {
      const joints = [];
      let parent = this.mirror;
      const base = new THREE.Group();
      base.position.set(...f.at);
      parent.add(base);
      parent = base;
      for (let k = 0; k < 3; k++) {
        const j = new THREE.Group();
        if (k > 0) j.position.z = -f.len[k - 1];
        parent.add(j);
        j.add(mesh(S.fingers[i][k], S.skin, 'phalanx'));
        joints.push(j);
        parent = j;
      }
      const nail = mesh(S.nails[i], S.nail, 'nail');
      nail.position.set(0, f.r * 0.62, -f.len[2] * 0.58);
      nail.rotation.x = -0.08;
      joints[2].add(nail);
      return { base, joints };
    });
    // thumb: base joint angled out of the palm
    const t = THUMB;
    this.thumbBase = new THREE.Group();
    this.thumbBase.position.set(...t.at);
    this.thumbBase.quaternion.copy(thumbFrame(side));
    this.thumbRest = this.thumbBase.quaternion.clone();
    this.mirror.add(this.thumbBase);
    this.thumb = [];
    let parent = this.thumbBase;
    for (let k = 0; k < 3; k++) {
      const j = new THREE.Group();
      if (k > 0) j.position.z = -t.len[k - 1];
      parent.add(j);
      j.add(mesh(S.thumb[k], S.skin, 'thumb'));
      this.thumb.push(j);
      parent = j;
    }
    const tn = mesh(S.thumbNail, S.nail, 'nail');
    tn.position.set(0, t.r * 0.62, -t.len[2] * 0.58);
    this.thumb[2].add(tn);

    // forearm and sleeve hang from the wrist towards the elbow
    this.arm = new THREE.Group();
    this.arm.add(mesh(S.forearm, S.skin, 'forearm'));
    this.arm.add(mesh(S.sleeveGeo, S.sleeve, 'sleeve'));
    this.arm.add(mesh(S.cuffGeo, S.cuff, 'cuff'));
    if (side < 0) {
      const strap = mesh(S.strap, S.watchStrap, 'watchStrap');
      strap.rotation.y = Math.PI / 2;
      strap.position.z = 0.03;
      const face = mesh(S.face, S.watchCase, 'watchFace');
      face.position.set(0, 0.024, 0.03);
      this.arm.add(strap, face);
    }
    this.root.add(this.arm);

    // where held items attach (fist axis along X, centre of the grip)
    this.grip = new THREE.Group();
    this.grip.name = 'grip';
    this.grip.position.set(0.0, -0.028, -0.068);
    this.root.add(this.grip);

    this.pose = structuredClone(POSES.relaxed);
    this.poseTarget = POSES.relaxed;
  }

  setPose(name) {
    this.poseTarget = POSES[name] || POSES.relaxed;
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 14);
    const p = this.pose;
    const tgt = this.poseTarget;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) p.curl[i][j] = lerp(p.curl[i][j], tgt.curl[i][j], k);
      const f = this.fingers[i];
      f.joints.forEach((jt, j) => (jt.rotation.x = -p.curl[i][j]));
      f.base.rotation.y = (i - 1.5) * -p.spread;
    }
    p.spread = lerp(p.spread, tgt.spread, k);
    for (let j = 0; j < 3; j++) p.thumb[j] = lerp(p.thumb[j], tgt.thumb[j], k);
    // opposition swings the whole thumb across the palm, then the joints flex
    this.thumb[0].rotation.set(-p.thumb[0] * 0.55, 0, 0);
    this.thumbBase.quaternion.copy(this.thumbRest).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -p.thumb[0] * 0.55, 0)));
    this.thumb[1].rotation.x = -p.thumb[1];
    this.thumb[2].rotation.x = -p.thumb[2];
  }
}

/** Both hands with IK-lite placement in camera space. */
export class Hands {
  constructor() {
    if (!shared) shared = buildShared();
    this.view = new THREE.Group();
    this.view.name = 'hands';
    this.right = new Hand(1);
    this.left = new Hand(-1);
    this.view.add(this.right.root, this.left.root);
    // camera-space rest and hidden placements
    this.slots = {
      right: this.makeSlot(1),
      left: this.makeSlot(-1),
    };
    this.bob = 0;
    this.sway = new THREE.Vector2();
  }

  makeSlot(side) {
    const hidden = new THREE.Vector3(side * 0.24, -0.62, -0.38);
    return {
      pos: hidden.clone(),
      quat: new THREE.Quaternion(),
      target: hidden.clone(),
      targetQuat: new THREE.Quaternion(),
      hidden,
      shoulder: new THREE.Vector3(side * 0.2, -0.3, 0.12),
      speed: 10,
    };
  }

  static restPlacement(side, kind = 'rest') {
    const pos = new THREE.Vector3();
    const e = new THREE.Euler();
    if (kind === 'rest') {
      pos.set(side * 0.2, -0.26, -0.4);
      e.set(-0.25, side * 0.25, side * -0.35);
    } else if (kind === 'hold') {
      pos.set(side * 0.19, -0.2, -0.36);
      e.set(-0.05, side * 0.35, side * -1.25);
    } else if (kind === 'present') {
      pos.set(side * 0.13, -0.15, -0.32);
      e.set(0.1, side * 0.5, side * -1.35);
    } else if (kind === 'mouth') {
      pos.set(side * 0.04, -0.09, -0.16);
      e.set(0.6, side * 0.9, side * -1.4);
    }
    return { pos, quat: new THREE.Quaternion().setFromEuler(e) };
  }

  /**
   * Places a hand for this frame. `mode`: 'hidden' | 'rest' | 'hold' | 'present' | 'mouth' |
   * 'target' (with camera-space pos/quat).
   */
  place(which, mode, pose = 'relaxed', pos = null, quat = null, speed = 10) {
    const hand = which === 'right' ? this.right : this.left;
    const slot = this.slots[which];
    const side = hand.side;
    slot.speed = speed;
    if (mode === 'hidden') {
      slot.target.copy(slot.hidden);
      slot.targetQuat.setFromEuler(new THREE.Euler(-0.6, 0, 0));
    } else if (mode === 'target') {
      slot.target.copy(pos);
      slot.targetQuat.copy(quat);
    } else {
      const r = Hands.restPlacement(side, mode);
      slot.target.copy(r.pos);
      slot.targetQuat.copy(r.quat);
    }
    hand.setPose(pose);
    slot.mode = mode;
  }

  /** Keeps a camera-space target within arm's reach from the shoulder. */
  reach(which, p) {
    const s = this.slots[which].shoulder;
    const d = p.clone().sub(s);
    const max = 0.62;
    if (d.length() > max) d.setLength(max);
    return s.clone().add(d);
  }

  update(dt, { moving = 0, speed = 0, look = null } = {}) {
    this.bob += dt * (4 + speed * 1.4) * moving;
    if (look) {
      this.sway.x = lerp(this.sway.x, clamp(-look.x * 0.0009, -0.03, 0.03), 1 - Math.exp(-dt * 8));
      this.sway.y = lerp(this.sway.y, clamp(look.y * 0.0009, -0.03, 0.03), 1 - Math.exp(-dt * 8));
    }
    for (const which of ['right', 'left']) {
      const hand = which === 'right' ? this.right : this.left;
      const slot = this.slots[which];
      const k = 1 - Math.exp(-dt * slot.speed);
      slot.pos.lerp(slot.target, k);
      slot.quat.slerp(slot.targetQuat, k);
      const bobX = Math.sin(this.bob) * 0.006 * moving * hand.side;
      const bobY = -Math.abs(Math.cos(this.bob)) * 0.008 * moving;
      const free = slot.mode !== 'target';
      hand.root.position.set(slot.pos.x + (free ? bobX + this.sway.x : 0), slot.pos.y + (free ? bobY + this.sway.y : 0), slot.pos.z);
      hand.root.quaternion.copy(slot.quat);
      hand.update(dt);
      this.orientArm(hand, slot);
      hand.root.visible = slot.pos.y > -0.58 || slot.target.y > -0.58;
    }
  }

  /** Points the sleeve from the wrist towards an elbow found by two-bone IK from the shoulder. */
  orientArm(hand, slot) {
    const wrist = hand.root.position;
    const sh = slot.shoulder;
    const upper = 0.3;
    const fore = 0.28;
    const d = wrist.clone().sub(sh);
    const len = Math.min(d.length(), upper + fore - 1e-3);
    const dir = d.clone().normalize();
    const a = (upper * upper - fore * fore + len * len) / (2 * len);
    const h = Math.sqrt(Math.max(upper * upper - a * a, 0));
    // elbow drops down and out
    const pole = new THREE.Vector3(hand.side * 0.6, -1, 0.25).normalize();
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = sh.clone().addScaledVector(dir, a).addScaledVector(pole, h);
    const toElbow = elbow.sub(wrist).normalize();
    const inv = hand.root.quaternion.clone().invert();
    const local = toElbow.applyQuaternion(inv);
    hand.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), local);
  }

  /** World-space helper: converts a world point into camera space. */
  static toCamera(camera, world, out = new THREE.Vector3()) {
    return camera.worldToLocal(out.copy(world));
  }
}
